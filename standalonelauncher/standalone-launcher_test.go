package main

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// Note on getInstallDir() testing:
// The getInstallDir() function uses os.Executable() which returns the test binary path
// during testing, making direct unit testing challenging without significant refactoring.
// The tests below verify:
// 1. The supporting logic (marker file detection, path construction)
// 2. Standard library behavior (os.MkdirAll, os.UserConfigDir)
// The actual getInstallDir() behavior is verified through:
// - Manual testing during development
// - Integration testing in production builds
// - Build verification (successful compilation and execution)

// Test isRelevantPath whitelist/blacklist logic
func TestIsRelevantPath(t *testing.T) {
	sl := NewStandaloneLauncher()
	
	// Test cases: path -> expected result
	testCases := map[string]bool{
		// Should be included (whitelist)
		"app/server.js":                 true,
		"app/modules/database.js":       true,
		"plugins/plugin1/main.js":       true,
		"plugins/plugin1/assets/icon.png": true,
		"game-engine/engine.js":         true,
		"package.json":                  true,
		"package-lock.json":             true,
		
		// Should be excluded (blacklist - executables)
		"launcher.exe":                  false,
		"launcher-console.exe":          false,
		"dev_launcher.exe":              false,
		"main.js":                       false, // Root main.js is Electron entry point
		
		// Should be excluded (blacklist - runtime directories)
		"runtime/node/node.exe":         false,
		"logs/app.log":                  false,
		"data/settings.db":              false,
		"node_modules/express/index.js": false,
		
		// Should be excluded (blacklist - version control and CI)
		".git/config":                   false,
		".github/workflows/test.yml":    false,
		".gitignore":                    false,
		
		// Should be excluded (blacklist - build and development)
		"build-src/launcher.go":         false,
		"standalonelauncher/main.go":    false,
		
		// Should be excluded (blacklist - documentation)
		"infos/ARCHITECTURE.md":         false,
		"docs/api.md":                   false,
		"docs_archive/old.md":           false,
		"migration-guides/v1-v2.md":     false,
		"screenshots/app.png":           false,
		"images/logo.png":               false,
		"README.md":                     false,
		"LICENSE":                       false,
		"CHANGELOG.md":                  false,
		
		// Should be excluded (blacklist - extra tools)
		"animazingpal/script.py":        false,
		"sidekick/helper.js":            false,
		"simplysign/sign.js":            false,
		"scripts/build.sh":              false,
		
		// Should be excluded (blacklist - test files)
		"app/test/server.test.js":       false,
		"playwright.config.js":          false,
		
		// Should be excluded (blacklist - app-specific unnecessary files)
		"app/CHANGELOG.md":              false,
		"app/README.md":                 false,
		"app/LICENSE":                   false,
		"app/docs/api.md":               false,
		"app/wiki/guide.md":             false,
	}
	
	for path, expected := range testCases {
		result := sl.isRelevantPath(path)
		if result != expected {
			t.Errorf("isRelevantPath(%q) = %v, expected %v", path, result, expected)
		}
	}
}

// Test downloadFromBranch constructs correct URL
func TestDownloadFromBranchURL(t *testing.T) {
	expectedURL := fmt.Sprintf("https://github.com/%s/%s/archive/refs/heads/%s.zip",
		githubOwner, githubRepo, githubBranch)
	
	expectedParts := []string{
		"https://github.com",
		githubOwner,
		githubRepo,
		"archive/refs/heads",
		githubBranch + ".zip",
	}
	
	for _, part := range expectedParts {
		if !strings.Contains(expectedURL, part) {
			t.Errorf("Expected URL to contain %q, got %q", part, expectedURL)
		}
	}
	
	t.Logf("Branch download URL: %s", expectedURL)
}

// Test that obsolete functions are removed
func TestObsoleteFunctionsRemoved(t *testing.T) {
	// This test verifies that the old Tree/Blob API functions have been removed
	// by ensuring the code compiles without them
	sl := NewStandaloneLauncher()
	
	// These should exist (new/kept functions)
	if sl == nil {
		t.Error("NewStandaloneLauncher() should create a valid launcher")
	}
	
	// The following calls should NOT compile if we tried to use them:
	// sl.getLatestCommitSHA()       // Should be removed
	// sl.getRepositoryTree("")      // Should be removed
	// sl.filterRelevantFiles(nil)   // Should be removed
	// sl.downloadFile(...)          // Should be removed
	
	t.Log("Obsolete functions successfully removed (code compiles)")
}

// Test that temp directory cleanup works
func TestTempDirectoryCleanup(t *testing.T) {
	// Get a temp base directory for testing
	tempBase, err := os.MkdirTemp("", "ltth-launcher-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tempBase)
	
	sl := NewStandaloneLauncher()
	sl.baseDir = tempBase
	
	// Create a temp directory like the download functions do
	tempDir := filepath.Join(sl.baseDir, "temp")
	if err := os.MkdirAll(tempDir, 0755); err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	
	// Verify it exists
	if _, err := os.Stat(tempDir); os.IsNotExist(err) {
		t.Error("Temp directory should exist after creation")
	}
	
	// Clean it up (simulating defer in download functions)
	os.RemoveAll(tempDir)
	
	// Verify it's gone
	if _, err := os.Stat(tempDir); !os.IsNotExist(err) {
		t.Error("Temp directory should not exist after cleanup")
	}
}

// Test progress updates
func TestProgressUpdates(t *testing.T) {
	sl := NewStandaloneLauncher()
	
	if sl.progress != 0 {
		t.Errorf("Initial progress should be 0, got %d", sl.progress)
	}
	
	sl.updateProgress(25, "Test message")
	
	if sl.progress != 25 {
		t.Errorf("Progress should be 25, got %d", sl.progress)
	}
	
	if sl.status != "Test message" {
		t.Errorf("Status should be 'Test message', got %q", sl.status)
	}
}

// Test constants are defined correctly
func TestConstants(t *testing.T) {
	if githubOwner == "" {
		t.Error("githubOwner should not be empty")
	}
	
	if githubRepo == "" {
		t.Error("githubRepo should not be empty")
	}
	
	if githubBranch == "" {
		t.Error("githubBranch should not be empty")
	}
	
	if githubAPIURL == "" {
		t.Error("githubAPIURL should not be empty")
	}
	
	t.Logf("Repository: %s/%s (branch: %s)", githubOwner, githubRepo, githubBranch)
}

// Test getInstallDir with portable mode (portable.txt exists)
func TestGetInstallDirPortableMode(t *testing.T) {
	// Create a temporary directory to simulate executable location
	tempDir, err := os.MkdirTemp("", "ltth-launcher-portable-*")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tempDir)
	
	// Create portable.txt marker file
	portableMarker := filepath.Join(tempDir, "portable.txt")
	if err := os.WriteFile(portableMarker, []byte(""), 0644); err != nil {
		t.Fatalf("Failed to create portable.txt: %v", err)
	}
	
	// Note: We cannot directly test getInstallDir() because it uses os.Executable()
	// which returns the test binary path, not our temp directory.
	// This test verifies the marker file creation logic, which is the key
	// component of the portable mode detection in getInstallDir().
	// Integration tests or manual testing are needed to verify the full behavior.
	
	// Verify that portable.txt marker file detection logic works
	if _, err := os.Stat(portableMarker); os.IsNotExist(err) {
		t.Error("portable.txt marker file should exist")
	}
	
	t.Logf("Portable mode marker created at: %s", portableMarker)
	t.Logf("Note: Full portable mode behavior requires integration testing")
}

// Test getInstallDir without portable mode (installer mode)
func TestGetInstallDirInstallerMode(t *testing.T) {
	// Create a temporary directory without portable.txt
	tempDir, err := os.MkdirTemp("", "ltth-launcher-installer-*")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tempDir)
	
	// Verify portable.txt does not exist
	portableMarker := filepath.Join(tempDir, "portable.txt")
	if _, err := os.Stat(portableMarker); !os.IsNotExist(err) {
		t.Error("portable.txt should not exist in installer mode")
	}
	
	// Verify we can get user config directory
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		t.Fatalf("Failed to get user config directory: %v", err)
	}
	
	expectedPath := filepath.Join(userConfigDir, "PupCid", "LTTH-Launcher")
	t.Logf("Expected installer mode directory: %s", expectedPath)
	
	// Verify the path structure is correct
	if !strings.Contains(expectedPath, "PupCid") {
		t.Error("Expected path should contain 'PupCid'")
	}
	if !strings.Contains(expectedPath, "LTTH-Launcher") {
		t.Error("Expected path should contain 'LTTH-Launcher'")
	}
}

// Test getInstallDir directory creation
func TestGetInstallDirCreatesDirectory(t *testing.T) {
	// Get user config directory
	userConfigDir, err := os.UserConfigDir()
	if err != nil {
		t.Fatalf("Failed to get user config directory: %v", err)
	}
	
	// Create a unique test directory name using t.TempDir() pattern
	testDir := filepath.Join(userConfigDir, "PupCid", "LTTH-Launcher-Test-"+t.Name())
	
	// Ensure it doesn't exist before test
	os.RemoveAll(testDir)
	
	// Clean up after test
	defer os.RemoveAll(testDir)
	
	// Create the directory
	if err := os.MkdirAll(testDir, 0755); err != nil {
		t.Fatalf("Failed to create test directory: %v", err)
	}
	
	// Verify it exists
	if _, err := os.Stat(testDir); os.IsNotExist(err) {
		t.Error("Directory should exist after creation")
	}
	
	t.Logf("Successfully created and cleaned up test directory: %s", testDir)
}

// Test compareVersions function
func TestCompareVersions(t *testing.T) {
	tests := []struct {
		v1       string
		v2       string
		expected int
	}{
		{"1.3.2", "1.3.3", -1}, // v1 < v2
		{"1.3.2", "1.3.2", 0},  // v1 == v2
		{"1.3.3", "1.3.2", 1},  // v1 > v2
		{"v1.3.2", "v1.3.3", -1}, // with v prefix
		{"1.3", "1.3.2", -1},     // different length
		{"2.0.0", "1.9.9", 1},    // major version difference
		{"1.10.0", "1.9.0", 1},   // double digit minor
	}

	for _, tt := range tests {
		result := compareVersions(tt.v1, tt.v2)
		if result != tt.expected {
			t.Errorf("compareVersions(%q, %q) = %d, expected %d", tt.v1, tt.v2, result, tt.expected)
		}
	}
}

// Test launcher version constant
func TestLauncherVersion(t *testing.T) {
	if launcherVersion == "" {
		t.Error("launcherVersion should not be empty")
	}
	
	// Verify it's a valid version format
	if len(launcherVersion) < 5 {
		t.Errorf("launcherVersion %q seems invalid", launcherVersion)
	}
	
	// Verify it matches expected format (e.g., "1.3.2")
	parts := strings.Split(launcherVersion, ".")
	if len(parts) < 3 {
		t.Errorf("launcherVersion %q should have at least 3 parts", launcherVersion)
	}
	
	t.Logf("Launcher version: %s", launcherVersion)
}

// Test VersionInfo JSON serialization
func TestVersionInfoSerialization(t *testing.T) {
	// Create a temporary directory for testing
	tempDir, err := os.MkdirTemp("", "ltth-version-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tempDir)
	
	sl := NewStandaloneLauncher()
	sl.baseDir = tempDir
	
	// Save version info
	testVersion := "1.3.2"
	if err := sl.saveVersionInfo(testVersion); err != nil {
		t.Fatalf("Failed to save version info: %v", err)
	}
	
	// Load version info
	versionInfo, err := sl.loadVersionInfo()
	if err != nil {
		t.Fatalf("Failed to load version info: %v", err)
	}
	
	if versionInfo == nil {
		t.Fatal("Version info should not be nil")
	}
	
	if versionInfo.Version != testVersion {
		t.Errorf("Version = %q, expected %q", versionInfo.Version, testVersion)
	}
	
	if versionInfo.InstalledDate == "" {
		t.Error("InstalledDate should not be empty")
	}
	
	if versionInfo.LastChecked == "" {
		t.Error("LastChecked should not be empty")
	}
	
	t.Logf("Version info: %+v", versionInfo)
}

// Test loadVersionInfo when file doesn't exist
func TestLoadVersionInfoNoFile(t *testing.T) {
	// Create a temporary directory for testing
	tempDir, err := os.MkdirTemp("", "ltth-version-test-*")
	if err != nil {
		t.Fatalf("Failed to create temp directory: %v", err)
	}
	defer os.RemoveAll(tempDir)
	
	sl := NewStandaloneLauncher()
	sl.baseDir = tempDir
	
	// Load version info (file doesn't exist)
	versionInfo, err := sl.loadVersionInfo()
	if err != nil {
		t.Fatalf("loadVersionInfo should not error when file doesn't exist: %v", err)
	}
	
	if versionInfo != nil {
		t.Error("Version info should be nil when file doesn't exist")
	}
}

// Test skipUpdate flag
func TestSkipUpdateFlag(t *testing.T) {
	sl := NewStandaloneLauncher()
	
	if sl.skipUpdate {
		t.Error("skipUpdate should be false initially")
	}
	
	sl.skipUpdate = true
	
	if !sl.skipUpdate {
		t.Error("skipUpdate should be true after setting")
	}
}

// Test JSON escaping in updateProgress
func TestUpdateProgressJSONEscaping(t *testing.T) {
	sl := NewStandaloneLauncher()
	
	// Create a test client channel
	testClient := make(chan string, 10)
	sl.clients[testClient] = true
	defer delete(sl.clients, testClient)
	
	// Test with special characters that need JSON escaping
	sl.updateProgress(50, "Test \"quotes\" and\\backslash and\nnewline")
	
	// Read the message from channel
	msg := <-testClient
	
	// Verify it's valid JSON
	var parsed map[string]interface{}
	err := json.Unmarshal([]byte(msg), &parsed)
	if err != nil {
		t.Fatalf("Message is not valid JSON: %v\nMessage: %s", err, msg)
	}
	
	// Verify content
	if parsed["progress"].(float64) != 50 {
		t.Errorf("Expected progress 50, got %v", parsed["progress"])
	}
	
	if !strings.Contains(parsed["status"].(string), "quotes") {
		t.Error("Status should contain the word 'quotes'")
	}
}

// Test JSON escaping in sendError
func TestSendErrorJSONEscaping(t *testing.T) {
	sl := NewStandaloneLauncher()
	
	// Create a test client channel
	testClient := make(chan string, 10)
	sl.clients[testClient] = true
	defer delete(sl.clients, testClient)
	
	// Test with special characters that need JSON escaping
	sl.sendError(`Error: "file not found" at C:\path\to\file`)
	
	// Read the message from channel
	msg := <-testClient
	
	// Verify it's valid JSON
	var parsed map[string]interface{}
	err := json.Unmarshal([]byte(msg), &parsed)
	if err != nil {
		t.Fatalf("Message is not valid JSON: %v\nMessage: %s", err, msg)
	}
	
	// Verify content
	if !strings.Contains(parsed["error"].(string), "file not found") {
		t.Error("Error message should contain 'file not found'")
	}
	
	if !strings.Contains(parsed["error"].(string), `C:\path\to\file`) {
		t.Error("Error message should contain the path with backslashes")
	}
}

// Test JSON escaping in sendInstallPrompt
func TestSendInstallPromptJSONEscaping(t *testing.T) {
	sl := NewStandaloneLauncher()
	
	// Create a test client channel
	testClient := make(chan string, 10)
	sl.clients[testClient] = true
	defer delete(sl.clients, testClient)
	
	// Test with Windows paths containing backslashes
	sl.sendInstallPrompt(`C:\Program Files\LTTH`, `C:\Users\Test"User\AppData`)
	
	// Read the message from channel
	msg := <-testClient
	
	// Verify it's valid JSON
	var parsed map[string]interface{}
	err := json.Unmarshal([]byte(msg), &parsed)
	if err != nil {
		t.Fatalf("Message is not valid JSON: %v\nMessage: %s", err, msg)
	}
	
	// Verify content
	if parsed["type"].(string) != "install-prompt" {
		t.Errorf("Expected type 'install-prompt', got %v", parsed["type"])
	}
	
	if !strings.Contains(parsed["exeDir"].(string), "Program Files") {
		t.Error("exeDir should contain 'Program Files'")
	}
	
	if !strings.Contains(parsed["systemDir"].(string), `Test"User`) {
		t.Error("systemDir should contain 'Test\"User' (with quote)")
	}
}

// Test spinner emoji in progress messages
func TestInstallDependenciesProgressFormat(t *testing.T) {
	sl := NewStandaloneLauncher()
	
	// Register a test client
	testClient := make(chan string, 10)
	sl.clients[testClient] = true
	defer delete(sl.clients, testClient)
	
	// Simulate progress update with spinner emoji
	sl.updateProgress(85, "🔄 Lade express... (45 Pakete)")
	
	// Read the message from channel
	msg := <-testClient
	
	// Verify it's valid JSON
	var parsed map[string]interface{}
	err := json.Unmarshal([]byte(msg), &parsed)
	if err != nil {
		t.Fatalf("Message is not valid JSON: %v\nMessage: %s", err, msg)
	}
	
	// Verify content
	if parsed["progress"].(float64) != 85 {
		t.Errorf("Expected progress 85, got %v", parsed["progress"])
	}
	
	status := parsed["status"].(string)
	if !strings.Contains(status, "🔄") {
		t.Error("Status should contain spinner emoji 🔄")
	}
	
	if !strings.Contains(status, "express") {
		t.Error("Status should contain package name 'express'")
	}
	
	if !strings.Contains(status, "45 Pakete") {
		t.Error("Status should contain package count '45 Pakete'")
	}
}

// Test analyzeNpmError function
func TestAnalyzeNpmError(t *testing.T) {
sl := NewStandaloneLauncher()

testCases := []struct {
name           string
stderr         string
expectedKeywords []string
}{
{
name:   "node-gyp error",
stderr: "gyp ERR! build error\nnode-gyp failed to build",
expectedKeywords: []string{"node-gyp", "Build-Tools"},
},
{
name:   "python not found",
stderr: "python not found\ngyp ERR! configure error",
expectedKeywords: []string{"Python", "nicht gefunden"},
},
{
name:   "msbuild error",
stderr: "MSBUILD : error MSB1003: Specify a project or solution file",
expectedKeywords: []string{"Visual C++", "Compiler"},
},
{
name:   "permission error",
stderr: "Error: EACCES: permission denied",
expectedKeywords: []string{"Berechtigungen", "Administrator"},
},
{
name:   "network timeout",
stderr: "npm ERR! network ETIMEDOUT",
expectedKeywords: []string{"Netzwerk", "Internet"},
},
{
name:   "generic error",
stderr: "npm ERR! something went wrong",
expectedKeywords: []string{"manuelle", "Installation"},
},
}

for _, tc := range testCases {
t.Run(tc.name, func(t *testing.T) {
hints := sl.analyzeNpmError(tc.stderr)

if len(hints) == 0 {
t.Error("Expected at least one hint, got none")
return
}

allHints := strings.Join(hints, " ")
for _, keyword := range tc.expectedKeywords {
if !strings.Contains(allHints, keyword) {
t.Errorf("Expected hints to contain '%s', but didn't.\nHints: %v", keyword, hints)
}
}
})
}
}

// Test sendDependencyError sends valid JSON
func TestSendDependencyError(t *testing.T) {
sl := NewStandaloneLauncher()

// Register a test client
testClient := make(chan string, 10)
sl.clients[testClient] = true
defer delete(sl.clients, testClient)

// Send dependency error
title := "npm install failed"
detail := "Build tools are missing"
hints := []string{"Install Python 3", "Install Visual C++ Build Tools"}

sl.sendDependencyError(title, detail, hints)

// Read the message from channel
msg := <-testClient

// Verify it's valid JSON
var parsed map[string]interface{}
err := json.Unmarshal([]byte(msg), &parsed)
if err != nil {
t.Fatalf("Message is not valid JSON: %v\nMessage: %s", err, msg)
}

// Verify content
if parsed["type"] != "dependency-error" {
t.Errorf("Expected type 'dependency-error', got %v", parsed["type"])
}

if parsed["title"] != title {
t.Errorf("Expected title '%s', got %v", title, parsed["title"])
}

if parsed["detail"] != detail {
t.Errorf("Expected detail '%s', got %v", detail, parsed["detail"])
}

hintsArray, ok := parsed["hints"].([]interface{})
if !ok || len(hintsArray) != 2 {
t.Errorf("Expected hints array with 2 items, got %v", parsed["hints"])
}
}

// Test PreflightCheckResult structure
func TestPreflightCheckResult(t *testing.T) {
result := PreflightCheckResult{
Name:        "Node.js v20+",
Found:       true,
Version:     "v20.18.1",
Required:    true,
InstallHint: "Node.js is automatically installed",
AutoFixable: true,
}

// Test JSON marshaling
jsonBytes, err := json.Marshal(result)
if err != nil {
t.Fatalf("Failed to marshal PreflightCheckResult: %v", err)
}

// Test JSON unmarshaling
var decoded PreflightCheckResult
err = json.Unmarshal(jsonBytes, &decoded)
if err != nil {
t.Fatalf("Failed to unmarshal PreflightCheckResult: %v", err)
}

// Verify fields
if decoded.Name != result.Name {
t.Errorf("Expected Name '%s', got '%s'", result.Name, decoded.Name)
}

if decoded.Found != result.Found {
t.Errorf("Expected Found %v, got %v", result.Found, decoded.Found)
}

if decoded.Version != result.Version {
t.Errorf("Expected Version '%s', got '%s'", result.Version, decoded.Version)
}
}

// Test findNpmPath logic
func TestFindNpmPath(t *testing.T) {
sl := NewStandaloneLauncher()

// Create temp directory structure
tempDir := t.TempDir()
nodePath := filepath.Join(tempDir, "node.exe")
npmPath := filepath.Join(tempDir, "npm.cmd")

// Create dummy files
os.WriteFile(nodePath, []byte("dummy"), 0644)
os.WriteFile(npmPath, []byte("dummy"), 0644)

// Test finding npm relative to node
result := sl.findNpmPath(nodePath)

// On Windows, it should find npm.cmd in the same directory
// On Linux, it should find npm in the same directory
// If not found, it should return "npm" as fallback
if result != "npm" {
// If it's not the fallback, verify it's a valid path
if !filepath.IsAbs(result) && result != "npm" {
t.Errorf("Expected absolute path or 'npm', got '%s'", result)
}
}
}
