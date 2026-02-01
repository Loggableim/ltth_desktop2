package main

import (
	"archive/zip"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const (
	// Node.js installation settings
	nodeVersion  = "20.18.1"
	nodeWinURL   = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-win-x64.zip"
	nodeLinuxURL = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-linux-x64.tar.xz"
	nodeMacURL   = "https://nodejs.org/dist/v20.18.1/node-v20.18.1-darwin-x64.tar.gz"
)

// writeCounter tracks download progress
type writeCounter struct {
	Total      int64
	Downloaded int64
}

// Write implements io.Writer interface for download progress tracking
func (wc *writeCounter) Write(p []byte) (int, error) {
	n := len(p)
	wc.Downloaded += int64(n)
	wc.printProgress()
	return n, nil
}

func (wc *writeCounter) printProgress() {
	// Clear the line and print progress
	fmt.Printf("\r%s", strings.Repeat(" ", 50))
	fmt.Printf("\rDownload: %.2f MB / %.2f MB (%.0f%%)", 
		float64(wc.Downloaded)/1024/1024,
		float64(wc.Total)/1024/1024,
		float64(wc.Downloaded)/float64(wc.Total)*100)
}

func printHeader() {
	fmt.Println("================================================")
	fmt.Println("  TikTok Stream Tool - Launcher")
	fmt.Println("================================================")
	fmt.Println()
}

// getNodeExecutable returns the path to node executable (portable or global)
func getNodeExecutable() string {
	// Get executable directory
	exePath, err := os.Executable()
	if err != nil {
		return ""
	}
	exeDir := filepath.Dir(exePath)
	
	// Check for portable installation first
	portableNode := filepath.Join(exeDir, "runtime", "node", "node.exe")
	if runtime.GOOS != "windows" {
		portableNode = filepath.Join(exeDir, "runtime", "node", "node")
	}
	
	if _, err := os.Stat(portableNode); err == nil {
		return portableNode
	}
	
	// Check for global installation
	nodePath, err := exec.LookPath("node")
	if err == nil {
		return nodePath
	}
	
	return ""
}

func checkNodeJS() (string, error) {
	// Check for portable installation first
	exePath, err := os.Executable()
	if err == nil {
		exeDir := filepath.Dir(exePath)
		portableNode := filepath.Join(exeDir, "runtime", "node", "node.exe")
		if runtime.GOOS != "windows" {
			portableNode = filepath.Join(exeDir, "runtime", "node", "node")
		}
		
		if _, err := os.Stat(portableNode); err == nil {
			return portableNode, nil
		}
	}
	
	// Check for global installation
	nodePath, err := exec.LookPath("node")
	if err != nil {
		return "", fmt.Errorf("Node.js ist nicht installiert")
	}
	return nodePath, nil
}

func getNodeVersion(nodePath string) string {
	cmd := exec.Command(nodePath, "--version")
	output, err := cmd.Output()
	if err != nil {
		return "unknown"
	}
	return string(output)
}

// getNodeDownloadURL returns the download URL for the current platform
func getNodeDownloadURL() string {
	switch runtime.GOOS {
	case "windows":
		return nodeWinURL
	case "linux":
		return nodeLinuxURL
	case "darwin":
		return nodeMacURL
	default:
		return nodeWinURL
	}
}

// downloadFile downloads a file from URL with progress display
func downloadFile(filepath, url string) error {
	// Create the file
	out, err := os.Create(filepath)
	if err != nil {
		return err
	}
	defer out.Close()
	
	// Create HTTP client with timeout
	client := &http.Client{
		Timeout: 300 * time.Second, // 5 minutes for large downloads
	}
	
	// Get the data
	resp, err := client.Get(url)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	
	// Check server response
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("bad status: %s", resp.Status)
	}
	
	// Create progress counter
	counter := &writeCounter{
		Total: resp.ContentLength,
	}
	
	fmt.Printf("Dateigröße: %.2f MB\n", float64(counter.Total)/1024/1024)
	
	// Write the body to file with progress
	_, err = io.Copy(out, io.TeeReader(resp.Body, counter))
	if err != nil {
		return err
	}
	
	// Print a newline after progress
	fmt.Println()
	
	return nil
}

func checkNodeModules(appDir string) bool {
	nodeModulesPath := filepath.Join(appDir, "node_modules")
	info, err := os.Stat(nodeModulesPath)
	if err != nil {
		return false
	}
	return info.IsDir()
}

// extractZipWithFlatStructure extracts a zip file, removing the root directory
func extractZipWithFlatStructure(zipPath, destDir string) error {
	r, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer r.Close()
	
	// Find the root directory name (e.g., "node-v20.18.1-win-x64/")
	var rootDir string
	if len(r.File) > 0 {
		rootDir = strings.Split(r.File[0].Name, "/")[0] + "/"
	}
	
	for _, f := range r.File {
		// Skip the root directory itself
		if f.Name == rootDir {
			continue
		}
		
		// Remove root directory from path
		targetPath := strings.TrimPrefix(f.Name, rootDir)
		if targetPath == "" {
			continue
		}
		
		fpath := filepath.Join(destDir, targetPath)
		
		// Check for ZipSlip vulnerability
		if !strings.HasPrefix(fpath, filepath.Clean(destDir)+string(os.PathSeparator)) {
			return fmt.Errorf("illegal file path: %s", fpath)
		}
		
		if f.FileInfo().IsDir() {
			// Create directory
			os.MkdirAll(fpath, os.ModePerm)
			continue
		}
		
		// Create parent directory if needed
		if err := os.MkdirAll(filepath.Dir(fpath), os.ModePerm); err != nil {
			return err
		}
		
		// Extract file
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

// extractTar extracts a tar archive (for Linux/macOS) with structure flattening
func extractTar(tarPath, destDir string) error {
	// Use tar command to extract
	var cmd *exec.Cmd
	
	if strings.HasSuffix(tarPath, ".tar.xz") {
		cmd = exec.Command("tar", "-xJf", tarPath, "-C", destDir, "--strip-components=1")
	} else if strings.HasSuffix(tarPath, ".tar.gz") {
		cmd = exec.Command("tar", "-xzf", tarPath, "-C", destDir, "--strip-components=1")
	} else {
		return fmt.Errorf("unsupported archive format")
	}
	
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("tar extraction failed: %v, output: %s", err, string(output))
	}
	
	return nil
}

// extractNodeArchive extracts the Node.js archive based on platform
func extractNodeArchive(archivePath, destDir string) error {
	if runtime.GOOS == "windows" {
		return extractZipWithFlatStructure(archivePath, destDir)
	}
	return extractTar(archivePath, destDir)
}

// writeNodeVersion writes the Node.js version to version.txt
func writeNodeVersion(nodeDir, version string) error {
	versionFile := filepath.Join(nodeDir, "version.txt")
	return os.WriteFile(versionFile, []byte(version), 0644)
}

// getInstalledNodeVersion reads the installed Node.js version from version.txt
func getInstalledNodeVersion(nodeDir string) string {
	versionFile := filepath.Join(nodeDir, "version.txt")
	data, err := os.ReadFile(versionFile)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(data))
}

// installNodePortable installs portable Node.js with retry logic
func installNodePortable() (string, error) {
	exePath, err := os.Executable()
	if err != nil {
		return "", fmt.Errorf("kann Programmverzeichnis nicht ermitteln: %v", err)
	}
	
	exeDir := filepath.Dir(exePath)
	runtimeDir := filepath.Join(exeDir, "runtime")
	nodeDir := filepath.Join(runtimeDir, "node")
	
	// Create runtime directory
	if err := os.MkdirAll(runtimeDir, 0755); err != nil {
		return "", fmt.Errorf("kann runtime Verzeichnis nicht erstellen: %v", err)
	}
	
	fmt.Println()
	fmt.Println("===============================================")
	fmt.Println("  Node.js wird installiert...")
	fmt.Println("===============================================")
	fmt.Println()
	
	downloadURL := getNodeDownloadURL()
	fmt.Printf("Download: %s\n", downloadURL)
	
	// Determine archive extension
	var archiveExt string
	if runtime.GOOS == "windows" {
		archiveExt = ".zip"
	} else if runtime.GOOS == "linux" {
		archiveExt = ".tar.xz"
	} else {
		archiveExt = ".tar.gz"
	}
	
	archivePath := filepath.Join(runtimeDir, "node"+archiveExt)
	
	// Download with retry logic
	var downloadErr error
	maxRetries := 3
	for attempt := 1; attempt <= maxRetries; attempt++ {
		if attempt > 1 {
			fmt.Printf("\nDownload fehlgeschlagen, Versuch %d von %d...\n", attempt, maxRetries)
		}
		
		downloadErr = downloadFile(archivePath, downloadURL)
		if downloadErr == nil {
			break
		}
		
		// Clean up partial download
		os.Remove(archivePath)
	}
	
	if downloadErr != nil {
		return "", fmt.Errorf("download fehlgeschlagen nach %d Versuchen: %v\n\nBitte installiere Node.js manuell von:\nhttps://nodejs.org", maxRetries, downloadErr)
	}
	
	fmt.Println("Extrahiere Node.js...")
	
	// Extract archive
	if err := extractNodeArchive(archivePath, nodeDir); err != nil {
		os.RemoveAll(nodeDir) // Cleanup on failure
		os.Remove(archivePath)
		return "", fmt.Errorf("extraktion fehlgeschlagen: %v", err)
	}
	
	// Clean up archive
	os.Remove(archivePath)
	
	// Write version file
	if err := writeNodeVersion(nodeDir, nodeVersion); err != nil {
		fmt.Printf("Warnung: Konnte version.txt nicht schreiben: %v\n", err)
	}
	
	// Validate installation
	nodeExe := filepath.Join(nodeDir, "node.exe")
	if runtime.GOOS != "windows" {
		nodeExe = filepath.Join(nodeDir, "node")
	}
	
	if _, err := os.Stat(nodeExe); os.IsNotExist(err) {
		return "", fmt.Errorf("node executable nicht gefunden nach Installation")
	}
	
	fmt.Println()
	fmt.Println("Node.js erfolgreich installiert!")
	fmt.Println()
	
	return nodeExe, nil
}

// checkNodeUpdate checks if an update is available
// Note: Uses simple string comparison. Works for same version format (e.g., "20.18.1" vs "20.18.0")
// but may not work correctly for semantic version comparison with different digit counts.
func checkNodeUpdate(nodeDir string) (bool, error) {
	installedVersion := getInstalledNodeVersion(nodeDir)
	if installedVersion == "" {
		// No version file, assume update needed
		return true, nil
	}
	
	// Compare versions (simple string comparison works for same format)
	if installedVersion != nodeVersion {
		return true, nil
	}
	
	return false, nil
}

// updateNodePortable updates the portable Node.js installation
func updateNodePortable() error {
	exePath, err := os.Executable()
	if err != nil {
		return fmt.Errorf("kann Programmverzeichnis nicht ermitteln: %v", err)
	}
	
	exeDir := filepath.Dir(exePath)
	runtimeDir := filepath.Join(exeDir, "runtime")
	nodeDir := filepath.Join(runtimeDir, "node")
	nodeNewDir := filepath.Join(runtimeDir, "node_new")
	nodeBackupDir := filepath.Join(runtimeDir, "node.backup")
	
	oldVersion := getInstalledNodeVersion(nodeDir)
	
	fmt.Println()
	fmt.Printf("Node.js Update verfügbar: v%s → v%s\n", oldVersion, nodeVersion)
	fmt.Println("Aktualisiere Node.js...")
	
	downloadURL := getNodeDownloadURL()
	
	// Determine archive extension
	var archiveExt string
	if runtime.GOOS == "windows" {
		archiveExt = ".zip"
	} else if runtime.GOOS == "linux" {
		archiveExt = ".tar.xz"
	} else {
		archiveExt = ".tar.gz"
	}
	
	archivePath := filepath.Join(runtimeDir, "node_update"+archiveExt)
	
	// Download new version
	if err := downloadFile(archivePath, downloadURL); err != nil {
		return fmt.Errorf("download fehlgeschlagen: %v", err)
	}
	
	// Extract to temporary directory
	if err := os.MkdirAll(nodeNewDir, 0755); err != nil {
		os.Remove(archivePath)
		return fmt.Errorf("kann temporäres Verzeichnis nicht erstellen: %v", err)
	}
	
	if err := extractNodeArchive(archivePath, nodeNewDir); err != nil {
		os.RemoveAll(nodeNewDir)
		os.Remove(archivePath)
		return fmt.Errorf("extraktion fehlgeschlagen: %v", err)
	}
	
	// Clean up archive
	os.Remove(archivePath)
	
	// Backup old installation
	os.RemoveAll(nodeBackupDir) // Remove old backup if exists
	if err := os.Rename(nodeDir, nodeBackupDir); err != nil {
		os.RemoveAll(nodeNewDir)
		return fmt.Errorf("backup fehlgeschlagen: %v", err)
	}
	
	// Move new version to final location
	if err := os.Rename(nodeNewDir, nodeDir); err != nil {
		// Try to restore backup
		if restoreErr := os.Rename(nodeBackupDir, nodeDir); restoreErr != nil {
			return fmt.Errorf("installation fehlgeschlagen: %v (Backup-Wiederherstellung auch fehlgeschlagen: %v)", err, restoreErr)
		}
		return fmt.Errorf("installation fehlgeschlagen: %v (alte Version wiederhergestellt)", err)
	}
	
	// Write new version file
	if err := writeNodeVersion(nodeDir, nodeVersion); err != nil {
		fmt.Printf("Warnung: Konnte version.txt nicht schreiben: %v\n", err)
	}
	
	fmt.Printf("Node.js erfolgreich aktualisiert auf v%s!\n", nodeVersion)
	fmt.Println()
	
	return nil
}

func installDependencies(appDir, nodePath string) error {
	fmt.Println("Installiere Abhaengigkeiten... (Das kann beim ersten Start ein paar Minuten dauern)")
	
	// Determine npm path based on Node.js path
	var npmPath string
	if strings.Contains(nodePath, filepath.Join("runtime", "node")) {
		// Use portable npm
		exePath, err := os.Executable()
		if err == nil {
			exeDir := filepath.Dir(exePath)
			nodeDir := filepath.Join(exeDir, "runtime", "node")
			if runtime.GOOS == "windows" {
				npmPath = filepath.Join(nodeDir, "npm.cmd")
			} else {
				npmPath = filepath.Join(nodeDir, "bin", "npm")
			}
		}
	}
	
	var cmd *exec.Cmd
	if npmPath != "" && runtime.GOOS == "windows" {
		// Use portable npm on Windows
		cmd = exec.Command("cmd", "/C", npmPath, "install", "--cache", "false")
	} else if npmPath != "" {
		// Use portable npm on Unix
		cmd = exec.Command(npmPath, "install", "--cache", "false")
	} else if runtime.GOOS == "windows" {
		// Fallback to global npm on Windows
		cmd = exec.Command("cmd", "/C", "npm", "install", "--cache", "false")
	} else {
		// Fallback to global npm on Unix
		cmd = exec.Command("npm", "install", "--cache", "false")
	}
	
	cmd.Dir = appDir
	// Don't show npm install output in the console
	// The installation will run silently in the background
	
	err := cmd.Run()
	if err != nil {
		return fmt.Errorf("Installation fehlgeschlagen: %v", err)
	}
	
	fmt.Println()
	fmt.Println("Installation erfolgreich abgeschlossen!")
	fmt.Println()
	return nil
}

func startTool(nodePath, appDir string) error {
	fmt.Println("Starte Tool...")
	fmt.Println()
	
	launchJS := filepath.Join(appDir, "launch.js")
	cmd := exec.Command(nodePath, launchJS)
	cmd.Dir = appDir
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	
	return cmd.Run()
}

func pause() {
	fmt.Println()
	fmt.Print("Druecke Enter zum Beenden...")
	fmt.Scanln()
}

func main() {
	printHeader()
	
	// Check Node.js installation
	nodePath, err := checkNodeJS()
	if err != nil {
		// No Node.js found - install portable version
		fmt.Println("Node.js nicht gefunden. Installiere portable Version...")
		
		var installErr error
		nodePath, installErr = installNodePortable()
		if installErr != nil {
			fmt.Println()
			fmt.Println("===============================================")
			fmt.Printf("  FEHLER: Node.js Installation fehlgeschlagen!\n")
			fmt.Println("===============================================")
			fmt.Println()
			fmt.Printf("%v\n", installErr)
			fmt.Println()
			pause()
			os.Exit(1)
		}
	} else {
		// Node.js found - check if it's portable and needs update
		exePath, err := os.Executable()
		if err == nil {
			exeDir := filepath.Dir(exePath)
			nodeDir := filepath.Join(exeDir, "runtime", "node")
			
			// Check if this is a portable installation
			if strings.Contains(nodePath, filepath.Join("runtime", "node")) {
				// Check for updates
				updateAvailable, err := checkNodeUpdate(nodeDir)
				if err == nil && updateAvailable {
					if updateErr := updateNodePortable(); updateErr != nil {
						fmt.Printf("Warnung: Node.js Update fehlgeschlagen: %v\n", updateErr)
						fmt.Println("Verwende bestehende Installation...")
					} else {
						// Update successful, update nodePath
						nodePath = getNodeExecutable()
					}
				}
			}
		}
	}
	
	// Show Node.js version
	fmt.Println("Node.js Version:")
	fmt.Println(getNodeVersion(nodePath))
	
	// Get executable directory and app directory
	exePath, err := os.Executable()
	if err != nil {
		fmt.Printf("Fehler: Kann Programmverzeichnis nicht ermitteln: %v\n", err)
		pause()
		os.Exit(1)
	}
	
	exeDir := filepath.Dir(exePath)
	appDir := filepath.Join(exeDir, "app")
	
	// Check if app directory exists
	if _, err := os.Stat(appDir); os.IsNotExist(err) {
		fmt.Printf("Fehler: app Verzeichnis nicht gefunden in %s\n", exeDir)
		pause()
		os.Exit(1)
	}
	
	// Check and install node_modules if needed
	if !checkNodeModules(appDir) {
		err = installDependencies(appDir, nodePath)
		if err != nil {
			fmt.Println()
			fmt.Println("===============================================")
			fmt.Printf("  FEHLER: %v\n", err)
			fmt.Println("===============================================")
			fmt.Println()
			pause()
			os.Exit(1)
		}
	}
	
	// Start the tool
	err = startTool(nodePath, appDir)
	if err != nil {
		fmt.Printf("Fehler beim Starten: %v\n", err)
	}
	
	// Pause before exit
	pause()
}
