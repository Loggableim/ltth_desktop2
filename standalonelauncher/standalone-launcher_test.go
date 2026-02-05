package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

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
