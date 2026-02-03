package main

import (
	"archive/zip"
	"embed"
	"encoding/base64"
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

const (
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

// GitHub API response structures
type GitHubCommit struct {
	SHA string `json:"sha"`
}

type GitHubTreeItem struct {
	Path string `json:"path"`
	Type string `json:"type"` // "blob" or "tree"
	SHA  string `json:"sha"`
	Size int    `json:"size"`
	URL  string `json:"url"`
}

type GitHubTree struct {
	Tree      []GitHubTreeItem `json:"tree"`
	Truncated bool             `json:"truncated"`
}

type GitHubBlob struct {
	Content  string `json:"content"`
	Encoding string `json:"encoding"` // "base64"
	Size     int    `json:"size"`
}

type StandaloneLauncher struct {
	baseDir    string
	progress   int
	status     string
	clients    map[chan string]bool
	logger     *log.Logger
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
		Version: "1.0.0",
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

// Get latest commit SHA from GitHub
func (sl *StandaloneLauncher) getLatestCommitSHA() (string, error) {
	sl.updateProgress(5, "Hole neueste Version von GitHub...")
	
	url := fmt.Sprintf("%s/repos/%s/%s/commits/%s",
		githubAPIURL, githubOwner, githubRepo, githubBranch)
	
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return "", err
	}
	
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}
	
	var commit GitHubCommit
	if err := json.NewDecoder(resp.Body).Decode(&commit); err != nil {
		return "", err
	}
	
	sl.logger.Printf("Latest commit SHA: %s\n", commit.SHA)
	return commit.SHA, nil
}

// Get repository tree from GitHub
func (sl *StandaloneLauncher) getRepositoryTree(commitSHA string) (*GitHubTree, error) {
	sl.updateProgress(10, "Lade Dateiliste...")
	
	url := fmt.Sprintf("%s/repos/%s/%s/git/trees/%s?recursive=1",
		githubAPIURL, githubOwner, githubRepo, commitSHA)
	
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
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}
	
	var tree GitHubTree
	if err := json.NewDecoder(resp.Body).Decode(&tree); err != nil {
		return nil, err
	}
	
	sl.logger.Printf("Repository tree contains %d items\n", len(tree.Tree))
	return &tree, nil
}

// Filter relevant files for download
func (sl *StandaloneLauncher) filterRelevantFiles(items []GitHubTreeItem) []GitHubTreeItem {
	var filtered []GitHubTreeItem
	
	// Whitelist: Only download these directories and files
	whitelistPrefixes := []string{
		"app/",
		"plugins/",
		"game-engine/",
		"package.json",
		"package-lock.json",
	}
	
	// Blacklist: Never download these (including all unnecessary directories)
	blacklistPrefixes := []string{
		// Executables
		"launcher.exe",
		"launcher-console.exe",
		"dev_launcher.exe",
		"main.js", // Root main.js is Electron entry point, not needed for standalone Node.js server
		
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
		
		// Documentation and info files
		"infos/",
		"docs/",
		"docs_archive/",
		"migration-guides/",
		"screenshots/",
		"images/",
		"README.md",
		"LICENSE",
		"CHANGELOG",
		".md", // All markdown files
		
		// Extra tools not needed for runtime
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
		"app/wiki/", // User documentation, can be accessed online
	}
	
	for _, item := range items {
		if item.Type != "blob" {
			continue
		}
		
		// Check blacklist first
		blacklisted := false
		for _, prefix := range blacklistPrefixes {
			// Check if it starts with the prefix (for directories/files)
			// or if it ends with the suffix (for file extensions like .md)
			if strings.HasPrefix(item.Path, prefix) || strings.HasSuffix(item.Path, prefix) {
				blacklisted = true
				break
			}
		}
		
		if blacklisted {
			continue
		}
		
		// Check whitelist
		whitelisted := false
		for _, prefix := range whitelistPrefixes {
			if strings.HasPrefix(item.Path, prefix) || item.Path == prefix {
				whitelisted = true
				break
			}
		}
		
		if whitelisted {
			filtered = append(filtered, item)
		}
	}
	
	sl.logger.Printf("Filtered to %d relevant files\n", len(filtered))
	return filtered
}

// Download file from GitHub blob API
func (sl *StandaloneLauncher) downloadFile(item GitHubTreeItem) ([]byte, error) {
	req, err := http.NewRequest("GET", item.URL, nil)
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
	
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("GitHub API returned status %d", resp.StatusCode)
	}
	
	var blob GitHubBlob
	if err := json.NewDecoder(resp.Body).Decode(&blob); err != nil {
		return nil, err
	}
	
	if blob.Encoding != "base64" {
		return nil, fmt.Errorf("unsupported encoding: %s", blob.Encoding)
	}
	
	data, err := base64.StdEncoding.DecodeString(blob.Content)
	if err != nil {
		return nil, err
	}
	
	return data, nil
}

// Download all files from GitHub
func (sl *StandaloneLauncher) downloadRepository() error {
	// Get latest commit
	commitSHA, err := sl.getLatestCommitSHA()
	if err != nil {
		return fmt.Errorf("Konnte neueste Version nicht abrufen: %v", err)
	}
	
	// Get repository tree
	tree, err := sl.getRepositoryTree(commitSHA)
	if err != nil {
		return fmt.Errorf("Konnte Dateiliste nicht abrufen: %v", err)
	}
	
	// Filter relevant files
	relevantFiles := sl.filterRelevantFiles(tree.Tree)
	
	if len(relevantFiles) == 0 {
		return fmt.Errorf("Keine Dateien zum Herunterladen gefunden")
	}
	
	sl.updateProgress(15, fmt.Sprintf("Lade %d Dateien herunter...", len(relevantFiles)))
	
	// Download each file
	successCount := 0
	baseProgress := 15
	progressRange := 55 // 15% to 70%
	
	for i, file := range relevantFiles {
		// Calculate progress
		fileProgress := baseProgress + int(float64(i+1)/float64(len(relevantFiles))*float64(progressRange))
		sl.updateProgress(fileProgress, fmt.Sprintf("Lade %s...", file.Path))
		
		// Download file
		data, err := sl.downloadFile(file)
		if err != nil {
			sl.logger.Printf("Failed to download %s: %v\n", file.Path, err)
			continue
		}
		
		// Write file
		fullPath := filepath.Join(sl.baseDir, file.Path)
		
		// Create parent directories
		if err := os.MkdirAll(filepath.Dir(fullPath), 0755); err != nil {
			sl.logger.Printf("Failed to create directory for %s: %v\n", file.Path, err)
			continue
		}
		
		// Write file
		if err := os.WriteFile(fullPath, data, 0644); err != nil {
			sl.logger.Printf("Failed to write %s: %v\n", file.Path, err)
			continue
		}
		
		successCount++
	}
	
	// Check success rate
	successRate := float64(successCount) / float64(len(relevantFiles)) * 100
	if successRate < 90.0 {
		return fmt.Errorf("Zu viele Download-Fehler (%.1f%% erfolgreich)", successRate)
	}
	
	sl.updateProgress(70, "Download abgeschlossen!")
	return nil
}

// Check if Node.js is installed (portable or global)
func (sl *StandaloneLauncher) checkNodeJS() (string, error) {
	sl.updateProgress(72, "Prüfe Node.js Installation...")
	
	// Check portable installation first
	portableNodePath := filepath.Join(sl.baseDir, "runtime", "node", "node.exe")
	if runtime.GOOS == "windows" {
		if _, err := os.Stat(portableNodePath); err == nil {
			sl.logger.Printf("Found portable Node.js at: %s\n", portableNodePath)
			return portableNodePath, nil
		}
	}
	
	// Check global installation
	nodePath, err := exec.LookPath("node")
	if err == nil {
		sl.logger.Printf("Found global Node.js at: %s\n", nodePath)
		return nodePath, nil
	}
	
	// Node.js not found - install portable version
	return sl.installNodePortable()
}

// Install portable Node.js
func (sl *StandaloneLauncher) installNodePortable() (string, error) {
	sl.updateProgress(73, "Installiere portable Node.js...")
	
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
	
	// Download Node.js
	resp, err := http.Get(downloadURL)
	if err != nil {
		return "", fmt.Errorf("Node.js Download fehlgeschlagen: %v", err)
	}
	defer resp.Body.Close()
	
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("Node.js Download fehlgeschlagen: Status %d", resp.StatusCode)
	}
	
	// Save to temp file
	tempFile := filepath.Join(sl.baseDir, "runtime", "node-temp.zip")
	out, err := os.Create(tempFile)
	if err != nil {
		return "", fmt.Errorf("Konnte temporäre Datei nicht erstellen: %v", err)
	}
	
	sl.updateProgress(75, "Lade Node.js herunter...")
	_, err = io.Copy(out, resp.Body)
	out.Close()
	if err != nil {
		return "", fmt.Errorf("Node.js Download fehlgeschlagen: %v", err)
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
	
	sl.logger.Printf("Node.js successfully installed at: %s\n", nodePath)
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

func (sl *StandaloneLauncher) run() error {
	// Get executable directory
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("Kann Programmverzeichnis nicht ermitteln: %v", err)
	}
	
	sl.baseDir = filepath.Dir(exePath)
	sl.logger.Printf("Base directory: %s\n", sl.baseDir)
	
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
