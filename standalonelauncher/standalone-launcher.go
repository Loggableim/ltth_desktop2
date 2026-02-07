package main

import (
	"archive/zip"
	"bufio"
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"

	"github.com/pkg/browser"
)

//go:embed assets/*
var assets embed.FS

// Embedded application files - uncomment to enable true standalone mode
// This will embed the entire application in the binary (~35MB + 9MB = ~44MB total)
// To enable: run build script with embedded files
const (
	// Launcher version - must match package.json version
	launcherVersion = "1.3.2"
	
	// GitHub repository settings
	githubOwner  = "Loggableim"
	githubRepo   = "ltth_desktop2"
	githubBranch = "main"
	githubAPIURL = "https://api.github.com"
	
	// Node.js installation settings
	nodeVersion  = "20.18.1"
	nodeWinURL   = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-win-x64.zip"
	nodeLinuxURL = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-linux-x64.tar.xz"
	nodeMacURL   = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-darwin-x64.tar.gz"
)

// GitHub Release API structures
type GitHubRelease struct {
	TagName     string                `json:"tag_name"`
	Name        string                `json:"name"`
	ZipballURL  string                `json:"zipball_url"`
	TarballURL  string                `json:"tarball_url"`
	Assets      []GitHubReleaseAsset  `json:"assets"`
	PublishedAt string                `json:"published_at"`
}

type GitHubReleaseAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
	ContentType        string `json:"content_type"`
}

type StandaloneLauncher struct {
	baseDir         string
	customInstallDir string
	progress        int
	status          string
	clients         map[chan string]bool
	logger          *log.Logger
}

func NewStandaloneLauncher() *StandaloneLauncher {
	return &StandaloneLauncher{
		status:   "Initialisiere Standalone Launcher...",
		progress: 0,
		clients:  make(map[chan string]bool),
		logger:   log.New(os.Stdout, "[LTTH Standalone] ", log.LstdFlags),
	}
}

func (sl *StandaloneLauncher) updateProgress(value int, status string) {
	sl.progress = value
	sl.status = status
	sl.logger.Printf("[%d%%] %s\n", value, status)
	
	msg := fmt.Sprintf(`{"progress": %d, "status": "%s"}`, value, status)
	for client := range sl.clients {
		select {
		case client <- msg:
		default:
		}
	}
}

func (sl *StandaloneLauncher) sendError(errMsg string) {
	msg := fmt.Sprintf(`{"error": "%s"}`, errMsg)
	for client := range sl.clients {
		select {
		case client <- msg:
		default:
		}
	}
}

// Serve the splash screen
func (sl *StandaloneLauncher) serveSplash(w http.ResponseWriter, r *http.Request) {
	tmplContent, err := assets.ReadFile("assets/splash.html")
	if err != nil {
		http.Error(w, "Failed to load splash screen", http.StatusInternalServerError)
		return
	}

	tmpl, err := template.New("splash").Parse(string(tmplContent))
	if err != nil {
		http.Error(w, "Failed to parse template", http.StatusInternalServerError)
		return
	}

	data := struct {
		Title   string
		Version string
	}{
		Title:   "LTTH Standalone Launcher",
		Version: launcherVersion,
	}

	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	tmpl.Execute(w, data)
}

// SSE endpoint for progress updates
func (sl *StandaloneLauncher) handleSSE(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	// Create a new channel for this client
	clientChan := make(chan string, 10)
	sl.clients[clientChan] = true

	// Remove client when connection closes
	defer func() {
		delete(sl.clients, clientChan)
		close(clientChan)
	}()

	// Send current status
	initialMsg := fmt.Sprintf(`{"progress": %d, "status": "%s"}`, sl.progress, sl.status)
	fmt.Fprintf(w, "data: %s\n\n", initialMsg)
	w.(http.Flusher).Flush()

	// Listen for updates
	for {
		select {
		case msg, ok := <-clientChan:
			if !ok {
				return
			}
			fmt.Fprintf(w, "data: %s\n\n", msg)
			w.(http.Flusher).Flush()
		case <-r.Context().Done():
			return
		}
	}
}

// Get latest release from GitHub
func (sl *StandaloneLauncher) getLatestRelease() (*GitHubRelease, error) {
	sl.updateProgress(5, "Hole neueste Release-Version...")
	
	url := fmt.Sprintf("%s/repos/%s/%s/releases/latest",
		githubAPIURL, githubOwner, githubRepo)
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode == http.StatusNotFound {
		// No release found - this is expected for repos without releases
		return nil, nil
	}
	
	if resp.StatusCode != http.StatusOK {
		// Read body for error details
		bodyBytes, _ := io.ReadAll(resp.Body)
		bodyStr := string(bodyBytes)
		if len(bodyStr) > 200 {
			bodyStr = bodyStr[:200] + "..."
		}
		return nil, fmt.Errorf("GitHub API returned status %d: %s", resp.StatusCode, bodyStr)
	}
	
	// Read body first to provide better error messages
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %v", err)
	}
	
	// Check if body is empty or invalid
	if len(bodyBytes) == 0 {
		return nil, fmt.Errorf("GitHub API returned empty response")
	}
	
	var release GitHubRelease
	if err := json.Unmarshal(bodyBytes, &release); err != nil {
		// Provide helpful error message with body preview
		bodyPreview := string(bodyBytes)
		if len(bodyPreview) > 100 {
			bodyPreview = bodyPreview[:100] + "..."
		}
		return nil, fmt.Errorf("failed to parse JSON response: %v (body: %s)", err, bodyPreview)
	}
	
	sl.logger.Printf("Latest release: %s (%s)\n", release.Name, release.TagName)
	return &release, nil
}

// Check if path is relevant for installation (whitelist/blacklist)
func (sl *StandaloneLauncher) isRelevantPath(path string) bool {
	// Whitelist: Only these directories and files
	whitelistPrefixes := []string{
		"app/",
		"plugins/",
		"game-engine/",
		"package.json",
		"package-lock.json",
	}
	
	// Blacklist: Never include these
	blacklistPrefixes := []string{
		// Executables
		"launcher.exe",
		"launcher-console.exe",
		"dev_launcher.exe",
		"main.js", // Root main.js is Electron entry point
		
		// Runtime directories
		"runtime/",
		"logs/",
		"data/",
		"node_modules/",
		
		// Version control and CI
		".git",
		".github/",
		".gitignore",
		
		// Build and development
		"build-src/",
		"standalonelauncher/",
		
		// Documentation
		"infos/",
		"docs/",
		"docs_archive/",
		"migration-guides/",
		"screenshots/",
		"images/",
		"README.md",
		"LICENSE",
		"CHANGELOG",
		".md",
		
		// Extra tools
		"animazingpal/",
		"sidekick/",
		"simplysign/",
		"scripts/",
		
		// Test files
		"app/test/",
		"playwright.config.js",
		
		// App-specific unnecessary files
		"app/CHANGELOG.md",
		"app/README.md",
		"app/LICENSE",
		"app/docs/",
		"app/wiki/",
	}
	
	// Check blacklist first
	for _, prefix := range blacklistPrefixes {
		// Check prefix match, or suffix match for file extensions (starting with .)
		if strings.HasPrefix(path, prefix) || (strings.HasPrefix(prefix, ".") && strings.HasSuffix(path, prefix)) {
			return false
		}
	}
	
	// Check whitelist
	for _, prefix := range whitelistPrefixes {
		if strings.HasPrefix(path, prefix) || path == prefix {
			return true
		}
	}
	
	return false
}

// Download ZIP file with progress tracking
func (sl *StandaloneLauncher) downloadZipWithProgress(url, destPath string) error {
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	
	client := &http.Client{Timeout: 300 * time.Second} // 5 minutes for large files
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("download failed with status %d", resp.StatusCode)
	}
	
	// Create destination file
	out, err := os.Create(destPath)
	if err != nil {
		return err
	}
	defer out.Close()
	
	// Download with progress tracking
	totalSize := resp.ContentLength
	downloaded := int64(0)
	buffer := make([]byte, 32*1024) // 32KB buffer
	lastUpdate := time.Now()
	
	for {
		n, err := resp.Body.Read(buffer)
		if n > 0 {
			_, writeErr := out.Write(buffer[:n])
			if writeErr != nil {
				return writeErr
			}
			downloaded += int64(n)
			
			// Update progress every 200ms to avoid too many updates (15% to 60% of total progress)
			if time.Since(lastUpdate) > 200*time.Millisecond {
				if totalSize > 0 {
					downloadProgress := int(float64(downloaded) / float64(totalSize) * 45)
					percentage := int(float64(downloaded) / float64(totalSize) * 100)
					sl.updateProgress(15+downloadProgress, 
						fmt.Sprintf("Lade Release-ZIP herunter... %.1f / %.1f MB (%d%%)",
							float64(downloaded)/(1024*1024),
							float64(totalSize)/(1024*1024),
							percentage))
				} else {
					// Unknown size, just show downloaded amount
					sl.updateProgress(15, 
						fmt.Sprintf("Lade Release-ZIP herunter... %.1f MB",
							float64(downloaded)/(1024*1024)))
				}
				lastUpdate = time.Now()
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			return err
		}
	}
	
	// Final update
	if totalSize > 0 {
		sl.updateProgress(60, 
			fmt.Sprintf("Download abgeschlossen! %.1f MB", float64(downloaded)/(1024*1024)))
	}
	
	return nil
}

// Extract release ZIP file with path filtering
func (sl *StandaloneLauncher) extractReleaseZip(zipPath string) error {
	sl.updateProgress(60, "Entpacke Release-ZIP...")
	
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return fmt.Errorf("failed to open ZIP: %v", err)
	}
	defer r.Close()
	
	// Find root directory in ZIP (GitHub releases have a root folder like owner-repo-commitsha)
	var rootPrefix string
	if len(r.File) > 0 {
		firstPath := r.File[0].Name
		if idx := strings.Index(firstPath, "/"); idx > 0 {
			rootPrefix = firstPath[:idx+1]
		}
	}
	
	sl.logger.Printf("ZIP root prefix: %s\n", rootPrefix)
	
	extracted := 0
	total := len(r.File)
	
	for i, f := range r.File {
		// Strip root prefix
		relativePath := f.Name
		if rootPrefix != "" && strings.HasPrefix(relativePath, rootPrefix) {
			relativePath = strings.TrimPrefix(relativePath, rootPrefix)
		}
		
		// Skip if not relevant
		if relativePath == "" || !sl.isRelevantPath(relativePath) {
			continue
		}
		
		// Update progress (60% to 70%)
		extractProgress := 60 + int(float64(i+1)/float64(total)*10)
		sl.updateProgress(extractProgress, fmt.Sprintf("Entpacke Dateien... %d/%d", extracted+1, total))
		
		fpath := filepath.Join(sl.baseDir, relativePath)
		
		// Create directory
		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, 0755)
			continue
		}
		
		// Create parent directories
		if err := os.MkdirAll(filepath.Dir(fpath), 0755); err != nil {
			sl.logger.Printf("Failed to create directory for %s: %v\n", relativePath, err)
			continue
		}
		
		// Extract file
		outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			sl.logger.Printf("Failed to create file %s: %v\n", relativePath, err)
			continue
		}
		
		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			sl.logger.Printf("Failed to open file in ZIP %s: %v\n", relativePath, err)
			continue
		}
		
		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()
		
		if err != nil {
			sl.logger.Printf("Failed to extract %s: %v\n", relativePath, err)
			continue
		}
		
		extracted++
	}
	
	sl.logger.Printf("Extracted %d files from ZIP\n", extracted)
	
	if extracted == 0 {
		return fmt.Errorf("no files extracted from ZIP")
	}
	
	sl.updateProgress(70, "Extraktion abgeschlossen!")
	return nil
}

// Download repository from GitHub Release
func (sl *StandaloneLauncher) downloadFromRelease() error {
	// Get latest release
	release, err := sl.getLatestRelease()
	if err != nil {
		return fmt.Errorf("Konnte Release-Info nicht abrufen: %v", err)
	}
	
	if release == nil {
		// No release found - return nil to trigger fallback
		return nil
	}
	
	sl.updateProgress(10, "Bereite Download vor...")
	
	// Use zipball_url for download
	downloadURL := release.ZipballURL
	sl.logger.Printf("Downloading from: %s\n", downloadURL)
	
	// Create temp directory
	tempDir := filepath.Join(sl.baseDir, "temp")
	os.MkdirAll(tempDir, 0755)
	defer os.RemoveAll(tempDir)
	
	// Download ZIP file
	zipPath := filepath.Join(tempDir, "release.zip")
	if err := sl.downloadZipWithProgress(downloadURL, zipPath); err != nil {
		return fmt.Errorf("Download fehlgeschlagen: %v", err)
	}
	
	// Extract ZIP file
	if err := sl.extractReleaseZip(zipPath); err != nil {
		return fmt.Errorf("Extraktion fehlgeschlagen: %v", err)
	}
	
	return nil
}

// Download repository directly from branch (no API calls, no rate limit)
func (sl *StandaloneLauncher) downloadFromBranch() error {
	sl.updateProgress(5, "Lade Repository-ZIP von Branch herunter...")
	
	// Direct download URL (no API call needed!)
	downloadURL := fmt.Sprintf("https://github.com/%s/%s/archive/refs/heads/%s.zip",
		githubOwner, githubRepo, githubBranch)
	
	sl.logger.Printf("Downloading from branch: %s\n", downloadURL)
	
	// Create temp directory
	tempDir := filepath.Join(sl.baseDir, "temp")
	os.MkdirAll(tempDir, 0755)
	defer os.RemoveAll(tempDir)
	
	// Download ZIP file
	zipPath := filepath.Join(tempDir, "branch.zip")
	if err := sl.downloadZipWithProgress(downloadURL, zipPath); err != nil {
		return fmt.Errorf("Branch-Download fehlgeschlagen: %v", err)
	}
	
	// Extract ZIP file (reuse existing extractReleaseZip function)
	if err := sl.extractReleaseZip(zipPath); err != nil {
		return fmt.Errorf("Extraktion fehlgeschlagen: %v", err)
	}
	
	return nil
}

// Extract embedded application files (true standalone mode)
// Download all files from GitHub
func (sl *StandaloneLauncher) downloadRepository() error {
	// Try release-based download first (best option)
	sl.logger.Println("Trying release-based download...")
	err := sl.downloadFromRelease()
	
	if err == nil {
		sl.logger.Println("Release-based download successful!")
		return nil
	}
	
	// Release not available - use branch download as fallback
	sl.logger.Printf("Release unavailable, falling back to branch download: %v\n", err)
	sl.updateProgress(5, "⚠️ Kein Release gefunden, lade direkt von Branch...")
	
	return sl.downloadFromBranch()
}

// Check Node.js version (minimum v20 LTS)
func (sl *StandaloneLauncher) checkNodeJSVersion(nodePath string) (bool, string, error) {
	cmd := exec.Command(nodePath, "--version")
	output, err := cmd.Output()
	if err != nil {
		return false, "", err
	}
	
	version := strings.TrimSpace(string(output))
	sl.logger.Printf("Node.js version: %s\n", version)
	
	// Parse version (format: v20.18.1)
	if !strings.HasPrefix(version, "v") {
		return false, version, fmt.Errorf("invalid version format: %s", version)
	}
	
	// Extract major version
	versionNum := strings.TrimPrefix(version, "v")
	parts := strings.Split(versionNum, ".")
	if len(parts) < 1 {
		return false, version, fmt.Errorf("invalid version format: %s", version)
	}
	
	major := 0
	fmt.Sscanf(parts[0], "%d", &major)
	
	// Check if version is at least v20
	if major >= 20 {
		return true, version, nil
	}
	
	return false, version, fmt.Errorf("Node.js version too old (need v20+, found %s)", version)
}

// Check if Node.js is installed (portable or global)
func (sl *StandaloneLauncher) checkNodeJS() (string, error) {
	sl.updateProgress(72, "Prüfe Node.js Installation...")
	
	// Check portable installation first
	portableNodePath := filepath.Join(sl.baseDir, "runtime", "node", "node")
	if runtime.GOOS == "windows" {
		portableNodePath = filepath.Join(sl.baseDir, "runtime", "node", "node.exe")
	}
	
	if _, err := os.Stat(portableNodePath); err == nil {
		// Check version
		valid, version, err := sl.checkNodeJSVersion(portableNodePath)
		if err == nil && valid {
			sl.logger.Printf("Found portable Node.js %s at: %s\n", version, portableNodePath)
			return portableNodePath, nil
		}
		sl.logger.Printf("Portable Node.js found but version check failed: %v\n", err)
	}
	
	// Check global installation
	nodePath, err := exec.LookPath("node")
	if err == nil {
		// Check version
		valid, version, err := sl.checkNodeJSVersion(nodePath)
		if err == nil && valid {
			sl.logger.Printf("Found global Node.js %s at: %s\n", version, nodePath)
			return nodePath, nil
		}
		sl.logger.Printf("Global Node.js found but version check failed: %v\n", err)
	}
	
	// Node.js not found or version too old - install portable version
	sl.updateProgress(73, "Node.js v20 LTS wird installiert...")
	return sl.installNodePortable()
}

// Install portable Node.js
func (sl *StandaloneLauncher) installNodePortable() (string, error) {
	sl.updateProgress(73, "Node.js nicht gefunden, installiere portable Version...")
	
	var downloadURL string
	var nodeExe string
	
	switch runtime.GOOS {
	case "windows":
		downloadURL = nodeWinURL
		nodeExe = "node.exe"
	case "linux":
		downloadURL = nodeLinuxURL
		nodeExe = "node"
	case "darwin":
		downloadURL = nodeMacURL
		nodeExe = "node"
	default:
		return "", fmt.Errorf("Unsupported OS: %s", runtime.GOOS)
	}
	
	sl.logger.Printf("Downloading Node.js from: %s\n", downloadURL)
	
	// Create runtime/node directory
	nodeDir := filepath.Join(sl.baseDir, "runtime", "node")
	if err := os.MkdirAll(nodeDir, 0755); err != nil {
		return "", fmt.Errorf("Konnte Node.js-Verzeichnis nicht erstellen: %v", err)
	}
	
	// Download Node.js with progress tracking
	sl.updateProgress(74, "Lade Node.js herunter...")
	
	resp, err := http.Get(downloadURL)
	if err != nil {
		return "", fmt.Errorf("Node.js Download fehlgeschlagen: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Node.js Download fehlgeschlagen: Status %d", resp.StatusCode)
	}
	
	// Save to temp file with progress
	tempFile := filepath.Join(sl.baseDir, "runtime", "node-temp.zip")
	out, err := os.Create(tempFile)
	if err != nil {
		return "", fmt.Errorf("Konnte temporäre Datei nicht erstellen: %v", err)
	}
	
	totalSize := resp.ContentLength
	downloaded := int64(0)
	buffer := make([]byte, 32*1024)
	lastUpdate := time.Now()
	
	for {
		n, err := resp.Body.Read(buffer)
		if n > 0 {
			_, writeErr := out.Write(buffer[:n])
			if writeErr != nil {
				out.Close()
				return "", writeErr
			}
			downloaded += int64(n)
			
			// Update progress every 200ms to avoid too many updates (74% to 77%)
			if time.Since(lastUpdate) > 200*time.Millisecond {
				if totalSize > 0 {
					downloadProgress := int(float64(downloaded) / float64(totalSize) * 3)
					percentage := int(float64(downloaded) / float64(totalSize) * 100)
					sl.updateProgress(74+downloadProgress,
						fmt.Sprintf("Lade Node.js herunter... %.1f / %.1f MB (%d%%)",
							float64(downloaded)/(1024*1024),
							float64(totalSize)/(1024*1024),
							percentage))
				} else {
					sl.updateProgress(74,
						fmt.Sprintf("Lade Node.js herunter... %.1f MB",
							float64(downloaded)/(1024*1024)))
				}
				lastUpdate = time.Now()
			}
		}
		if err == io.EOF {
			break
		}
		if err != nil {
			out.Close()
			return "", err
		}
	}
	out.Close()
	
	// Final update
	if totalSize > 0 {
		sl.updateProgress(77, fmt.Sprintf("Node.js Download abgeschlossen! %.1f MB", float64(downloaded)/(1024*1024)))
	}
	
	// Extract zip file
	sl.updateProgress(78, "Entpacke Node.js...")
	if err := sl.extractZip(tempFile, nodeDir); err != nil {
		return "", fmt.Errorf("Node.js Extraktion fehlgeschlagen: %v", err)
	}
	
	// Clean up temp file
	os.Remove(tempFile)
	
	// Find node executable
	nodePath := filepath.Join(nodeDir, nodeExe)
	if _, err := os.Stat(nodePath); os.IsNotExist(err) {
		// Try in subdirectory (node download includes a root folder)
		entries, _ := os.ReadDir(nodeDir)
		for _, entry := range entries {
			if entry.IsDir() {
				testPath := filepath.Join(nodeDir, entry.Name(), nodeExe)
				if _, err := os.Stat(testPath); err == nil {
					// Flatten structure: move everything up one level
					subDir := filepath.Join(nodeDir, entry.Name())
					items, _ := os.ReadDir(subDir)
					for _, item := range items {
						oldPath := filepath.Join(subDir, item.Name())
						newPath := filepath.Join(nodeDir, item.Name())
						os.Rename(oldPath, newPath)
					}
					os.Remove(subDir)
					nodePath = filepath.Join(nodeDir, nodeExe)
					break
				}
			}
		}
	}
	
	if _, err := os.Stat(nodePath); os.IsNotExist(err) {
		return "", fmt.Errorf("Node.js executable nicht gefunden nach Installation")
	}
	
	// Verify version
	valid, version, err := sl.checkNodeJSVersion(nodePath)
	if err != nil || !valid {
		return "", fmt.Errorf("Node.js Version-Check fehlgeschlagen: %v", err)
	}
	
	sl.logger.Printf("Node.js %s successfully installed at: %s\n", version, nodePath)
	sl.updateProgress(79, fmt.Sprintf("Node.js %s erfolgreich installiert!", version))
	return nodePath, nil
}

// Extract zip file
func (sl *StandaloneLauncher) extractZip(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()
	
	for _, f := range r.File {
		fpath := filepath.Join(destDir, f.Name)
		
		if f.FileInfo().IsDir() {
			os.MkdirAll(fpath, os.ModePerm)
			continue
		}
		
		if err := os.MkdirAll(filepath.Dir(fpath), os.ModePerm); err != nil {
			return err
		}
		
		outFile, err := os.OpenFile(fpath, os.O_WRONLY|os.O_CREATE|os.O_TRUNC, f.Mode())
		if err != nil {
			return err
		}
		
		rc, err := f.Open()
		if err != nil {
			outFile.Close()
			return err
		}
		
		_, err = io.Copy(outFile, rc)
		outFile.Close()
		rc.Close()
		
		if err != nil {
			return err
		}
	}
	
	return nil
}

// Install dependencies
func (sl *StandaloneLauncher) installDependencies(appDir string) error {
	sl.updateProgress(80, "Installiere Abhängigkeiten...")
	
	var cmd *exec.Cmd
	if runtime.GOOS == "windows" {
		cmd = exec.Command("cmd", "/C", "npm", "install", "--omit=dev")
	} else {
		cmd = exec.Command("npm", "install", "--omit=dev")
	}
	
	cmd.Dir = appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	
	sl.logger.Printf("Running npm install in: %s\n", appDir)
	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("npm install fehlgeschlagen: %v", err)
	}
	
	sl.updateProgress(90, "Abhängigkeiten installiert!")
	return nil
}

// Start the application
func (sl *StandaloneLauncher) startApplication(nodePath, appDir string) error {
	sl.updateProgress(95, "Starte Anwendung...")
	
	launchJS := filepath.Join(appDir, "launch.js")
	cmd := exec.Command(nodePath, launchJS)
	cmd.Dir = appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	
	sl.logger.Printf("Starting application: %s %s\n", nodePath, launchJS)
	
	err := cmd.Start()
	if err != nil {
		return fmt.Errorf("Anwendungsstart fehlgeschlagen: %v", err)
	}
	
	sl.updateProgress(100, "Anwendung gestartet!")
	
	// Wait a moment before opening browser
	time.Sleep(3 * time.Second)
	
	// Open browser to the app
	browser.OpenURL("http://localhost:3000")
	
	// Wait for the application to finish
	return cmd.Wait()
}

// getInstallDir determines the installation directory
// If portable.txt exists next to the executable, uses portable mode (same directory)
// Otherwise uses system directory (installer mode)
func (sl *StandaloneLauncher) getInstallDir() (string, error) {
	// Get executable path
	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("Kann Programmverzeichnis nicht ermitteln: %v", err)
	}
	
	exeDir := filepath.Dir(exePath)
	
	// Check for portable mode marker file
	portableMarker := filepath.Join(exeDir, "portable.txt")
	if _, err := os.Stat(portableMarker); err == nil {
		// Portable mode: use executable directory
		sl.logger.Printf("Portable mode detected (portable.txt found)\n")
		return exeDir, nil
	}
	
	// Installer mode: Check if custom path was configured
	if sl.customInstallDir != "" {
		sl.logger.Printf("Using custom installation directory: %s\n", sl.customInstallDir)
		return sl.customInstallDir, nil
	}
	
	// Default: use system directory
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		return "", fmt.Errorf("Kann Konfigurationsverzeichnis nicht ermitteln: %v", err)
	}
	
	installDir := filepath.Join(userConfigDir, "PupCid", "LTTH-Launcher")
	
	// Create directory if it doesn't exist
	if err := os.MkdirAll(installDir, 0755); err != nil {
		return "", fmt.Errorf("Kann Installationsverzeichnis nicht erstellen: %v", err)
	}
	
	sl.logger.Printf("Installer mode: using system directory\n")
	return installDir, nil
}

// Config file structure
type LauncherConfig struct {
	InstalledVersion string `json:"installed_version"`
	InstallPath      string `json:"install_path"`
	FirstRun         bool   `json:"first_run"`
	LastUpdateCheck  string `json:"last_update_check"`
}

// Load configuration
func (sl *StandaloneLauncher) loadConfig() (*LauncherConfig, error) {
	configPath := sl.getConfigPath()
	
	data, err := os.ReadFile(configPath)
	if err != nil {
		if os.IsNotExist(err) {
			// First run - return default config
			return &LauncherConfig{
				InstalledVersion: "",
				InstallPath:      "",
				FirstRun:         true,
				LastUpdateCheck:  "",
			}, nil
		}
		return nil, err
	}
	
	var config LauncherConfig
	if err := json.Unmarshal(data, &config); err != nil {
		return nil, err
	}
	
	return &config, nil
}

// Save configuration
func (sl *StandaloneLauncher) saveConfig(config *LauncherConfig) error {
	configPath := sl.getConfigPath()
	
	data, err := json.MarshalIndent(config, "", "  ")
	if err != nil {
		return err
	}
	
	// Ensure directory exists
	configDir := filepath.Dir(configPath)
	if err := os.MkdirAll(configDir, 0755); err != nil {
		return err
	}
	
	return os.WriteFile(configPath, data, 0644)
}

// Get config file path (in executable directory)
func (sl *StandaloneLauncher) getConfigPath() string {
	exePath, _ := os.Executable()
	exeDir := filepath.Dir(exePath)
	return filepath.Join(exeDir, "launcher-config.json")
}

// Prompt user for installation path on first run
func (sl *StandaloneLauncher) promptForInstallPath() (string, error) {
	reader := bufio.NewReader(os.Stdin)
	
	fmt.Println()
	fmt.Println("================================================")
	fmt.Println("  Erste Installation - Installationspfad wählen")
	fmt.Println("================================================")
	fmt.Println()
	fmt.Println("Bitte wählen Sie, wo LTTH installiert werden soll:")
	fmt.Println()
	
	// Get default paths
	userConfigDir, _ := os.UserConfigDir()
	defaultPath := filepath.Join(userConfigDir, "PupCid", "LTTH-Launcher")
	
	fmt.Println("1) Standard-Pfad (empfohlen)")
	fmt.Printf("   %s\n", defaultPath)
	fmt.Println()
	fmt.Println("2) Benutzerdefinierten Pfad eingeben")
	fmt.Println()
	fmt.Print("Ihre Wahl (1 oder 2): ")
	
	choice, _ := reader.ReadString('\n')
	choice = strings.TrimSpace(choice)
	
	switch choice {
	case "1", "":
		return defaultPath, nil
		
	case "2":
		fmt.Println()
		fmt.Print("Bitte geben Sie den gewünschten Installationspfad ein: ")
		customPath, _ := reader.ReadString('\n')
		customPath = strings.TrimSpace(customPath)
		
		if customPath == "" {
			fmt.Println("Kein Pfad eingegeben, verwende Standard-Pfad.")
			return defaultPath, nil
		}
		
		// Expand home directory if present
		if strings.HasPrefix(customPath, "~") {
			homeDir, _ := os.UserHomeDir()
			customPath = filepath.Join(homeDir, customPath[1:])
		}
		
		// Make absolute
		absPath, err := filepath.Abs(customPath)
		if err != nil {
			fmt.Printf("Ungültiger Pfad: %v\n", err)
			return defaultPath, nil
		}
		
		return absPath, nil
		
	default:
		fmt.Println("Ungültige Eingabe, verwende Standard-Pfad.")
		return defaultPath, nil
	}
}

// Check for updates and prompt user
func (sl *StandaloneLauncher) checkForUpdates(currentVersion string) (bool, *GitHubRelease, error) {
	sl.logger.Printf("Checking for updates (current version: %s)...\n", currentVersion)
	
	// Get latest release
	release, err := sl.getLatestRelease()
	if err != nil {
		sl.logger.Printf("Failed to check for updates: %v\n", err)
		return false, nil, err
	}
	
	if release == nil {
		sl.logger.Println("No releases available")
		return false, nil, nil
	}
	
	// Compare versions
	latestVersion := strings.TrimPrefix(release.TagName, "v")
	
	if latestVersion == currentVersion {
		sl.logger.Printf("Already on latest version: %s\n", currentVersion)
		return false, nil, nil
	}
	
	sl.logger.Printf("New version available: %s (current: %s)\n", latestVersion, currentVersion)
	return true, release, nil
}

// Prompt user to install update
func (sl *StandaloneLauncher) promptForUpdate(release *GitHubRelease) bool {
	reader := bufio.NewReader(os.Stdin)
	
	fmt.Println()
	fmt.Println("================================================")
	fmt.Println("  🎉 Neues Update verfügbar!")
	fmt.Println("================================================")
	fmt.Println()
	fmt.Printf("Aktuelle Version: %s\n", launcherVersion)
	fmt.Printf("Neue Version:     %s\n", strings.TrimPrefix(release.TagName, "v"))
	fmt.Println()
	fmt.Printf("Release: %s\n", release.Name)
	if release.PublishedAt != "" {
		publishTime, _ := time.Parse(time.RFC3339, release.PublishedAt)
		fmt.Printf("Veröffentlicht: %s\n", publishTime.Format("02.01.2006"))
	}
	fmt.Println()
	fmt.Print("Möchten Sie jetzt aktualisieren? (j/n): ")
	
	response, _ := reader.ReadString('\n')
	response = strings.TrimSpace(strings.ToLower(response))
	
	return response == "j" || response == "y" || response == "ja" || response == "yes"
}

// Check if app is already installed
func (sl *StandaloneLauncher) isAppInstalled() bool {
	appDir := filepath.Join(sl.baseDir, "app")
	packageJSON := filepath.Join(appDir, "package.json")
	
	if _, err := os.Stat(packageJSON); err == nil {
		return true
	}
	
	return false
}

func (sl *StandaloneLauncher) run() error {
	// Load configuration
	config, err := sl.loadConfig()
	if err != nil {
		sl.logger.Printf("Failed to load config: %v\n", err)
		// Continue anyway with default config
		config = &LauncherConfig{
			FirstRun: true,
		}
	}
	
	// First run: prompt for installation path
	if config.FirstRun {
		installPath, err := sl.promptForInstallPath()
		if err != nil {
			return fmt.Errorf("Pfadauswahl fehlgeschlagen: %v", err)
		}
		
		sl.customInstallDir = installPath
		config.InstallPath = installPath
		config.FirstRun = false
		
		// Save config
		if err := sl.saveConfig(config); err != nil {
			sl.logger.Printf("Warning: Failed to save config: %v\n", err)
		}
		
		fmt.Println()
		fmt.Printf("✅ Installation erfolgt in: %s\n", installPath)
		fmt.Println()
		fmt.Println("Drücke Enter zum Fortfahren...")
		bufio.NewReader(os.Stdin).ReadString('\n')
	} else {
		// Load saved install path
		if config.InstallPath != "" {
			sl.customInstallDir = config.InstallPath
		}
	}
	
	// Determine installation directory (portable or installer mode)
	baseDir, err := sl.getInstallDir()
	if err != nil {
		return err
	}
	
	sl.baseDir = baseDir
	sl.logger.Printf("Installation directory: %s\n", sl.baseDir)
	
	// Check for updates if already installed
	if sl.isAppInstalled() && config.InstalledVersion != "" {
		hasUpdate, release, err := sl.checkForUpdates(config.InstalledVersion)
		if err == nil && hasUpdate && release != nil {
			if sl.promptForUpdate(release) {
				fmt.Println()
				fmt.Println("Update wird heruntergeladen...")
				fmt.Println()
				
				// Continue to download - will overwrite existing files
			} else {
				fmt.Println()
				fmt.Println("Update übersprungen. Starte aktuelle Version...")
				fmt.Println()
				
				// Skip to starting the application
				nodePath, err := sl.checkNodeJS()
				if err != nil {
					return err
				}
				
				appDir := filepath.Join(sl.baseDir, "app")
				return sl.startApplication(nodePath, appDir)
			}
		}
	}
	
	// Start HTTP server in background
	http.HandleFunc("/", sl.serveSplash)
	http.HandleFunc("/events", sl.handleSSE)
	
	go func() {
		sl.logger.Println("Starting web server on :8765")
		if err := http.ListenAndServe(":8765", nil); err != nil {
			sl.logger.Printf("HTTP server error: %v\n", err)
		}
	}()
	
	// Wait a moment for server to start
	time.Sleep(500 * time.Millisecond)
	
	// Open browser to splash screen
	err = browser.OpenURL("http://localhost:8765")
	if err != nil {
		sl.logger.Printf("Failed to open browser: %v\n", err)
	}
	
	// Download repository
	if err := sl.downloadRepository(); err != nil {
		sl.sendError(err.Error())
		return err
	}
	
	// Check Node.js
	nodePath, err := sl.checkNodeJS()
	if err != nil {
		sl.sendError(err.Error())
		return err
	}
	
	// Install dependencies
	appDir := filepath.Join(sl.baseDir, "app")
	if err := sl.installDependencies(appDir); err != nil {
		sl.sendError(err.Error())
		return err
	}
	
	// Update config with installed version
	config.InstalledVersion = launcherVersion
	config.LastUpdateCheck = time.Now().Format(time.RFC3339)
	if err := sl.saveConfig(config); err != nil {
		sl.logger.Printf("Warning: Failed to save config: %v\n", err)
	}
	
	// Start application
	return sl.startApplication(nodePath, appDir)
}

func main() {
	fmt.Println("================================================")
	fmt.Println("  LTTH Standalone Launcher")
	fmt.Println("  https://ltth.app")
	fmt.Println("================================================")
	fmt.Println()
	
	sl := NewStandaloneLauncher()
	
	if err := sl.run(); err != nil {
		fmt.Fprintf(os.Stderr, "\n❌ FEHLER: %v\n", err)
		fmt.Println("\nDrücke Enter zum Beenden...")
		fmt.Scanln()
		os.Exit(1)
	}
}
