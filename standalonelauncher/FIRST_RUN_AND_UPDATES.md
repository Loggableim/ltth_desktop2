# First Run and Update Features

This document explains the first-run installation path selection and automatic update checking features of the LTTH Standalone Launcher.

## Features

### 1. First-Run Installation Path Selection

On the first run, the launcher will prompt the user to choose where to install LTTH:

```
================================================
  Erste Installation - Installationspfad wählen
================================================

Bitte wählen Sie, wo LTTH installiert werden soll:

1) Standard-Pfad (empfohlen)
   [System-specific path]

2) Benutzerdefinierten Pfad eingeben

Ihre Wahl (1 oder 2): _
```

**Options:**
- **Option 1 (Standard)**: Installs to the system-specific configuration directory
  - Windows: `%APPDATA%\PupCid\LTTH-Launcher`
  - Linux: `~/.config/PupCid/LTTH-Launcher`
  - macOS: `~/Library/Application Support/PupCid/LTTH-Launcher`
  
- **Option 2 (Custom)**: Prompts for a custom installation path
  - Supports absolute paths
  - Supports `~` for home directory expansion
  - Creates directory if it doesn't exist

**Portable Mode:**
If a `portable.txt` file exists next to the launcher executable, the launcher will skip the path selection and use the executable's directory (portable mode).

### 2. Automatic Update Checking

On subsequent runs (after first installation), the launcher automatically checks for updates:

**Process:**
1. Launcher reads the installed version from `launcher-config.json`
2. Queries GitHub API for the latest release
3. Compares the installed version with the latest release version
4. If a new version is available, prompts the user:

```
================================================
  🎉 Neues Update verfügbar!
================================================

Aktuelle Version: 1.3.2
Neue Version:     1.4.0

Release: LTTH v1.4.0 - New Features
Veröffentlicht: 15.03.2024

Möchten Sie jetzt aktualisieren? (j/n): _
```

**User Choices:**
- **Yes (j/y/ja/yes)**: Downloads and installs the update, then starts the application
- **No (n/nein/no)**: Skips the update and starts the current version

### 3. Configuration Management

The launcher uses a JSON configuration file to track installation state:

**Location:** `launcher-config.json` (next to the launcher executable)

**Structure:**
```json
{
  "installed_version": "1.3.2",
  "install_path": "/path/to/installation",
  "first_run": false,
  "last_update_check": "2024-03-15T10:30:00Z"
}
```

**Fields:**
- `installed_version`: Version of LTTH currently installed
- `install_path`: User-selected installation path
- `first_run`: `true` if launcher hasn't run before, `false` after first setup
- `last_update_check`: ISO 8601 timestamp of last update check

## Technical Implementation

### Version Tracking

The launcher version is defined in `standalone-launcher.go`:

```go
const (
    launcherVersion = "1.3.2"  // Must match package.json
    ...
)
```

This version is:
1. Displayed in the splash screen
2. Stored in `launcher-config.json` after installation
3. Embedded in Windows executable metadata (via `winres.json`)
4. Used for update comparison

### Version Comparison

The launcher uses a simple string comparison:
- If `latestVersion != installedVersion`, an update is available
- The user is prompted only if `latestVersion` is different
- No semantic version parsing (simple equality check)

### Update Installation

When a user accepts an update:
1. The launcher downloads the new version from GitHub releases
2. Extracts files to the installation directory (overwrites existing files)
3. Installs npm dependencies
4. Updates `launcher-config.json` with new version
5. Starts the application

## User Experience

### First Installation
1. User downloads and runs `launcher.exe`
2. Prompted to choose installation path
3. Launcher downloads LTTH from GitHub
4. Installs Node.js (if needed)
5. Installs npm dependencies
6. Saves configuration
7. Starts LTTH

### Subsequent Runs (No Update)
1. User runs `launcher.exe`
2. Launcher checks for updates (silent if up-to-date)
3. Starts LTTH immediately

### Subsequent Runs (Update Available)
1. User runs `launcher.exe`
2. Launcher detects new version
3. Prompts user to update
4. If declined: starts current version
5. If accepted: downloads, installs, then starts new version

## Development Notes

### Testing First Run
To test first-run behavior, delete or rename `launcher-config.json` next to the executable.

### Testing Update Prompt
1. Edit `launcher-config.json` and set `installed_version` to an older version (e.g., "1.0.0")
2. Run the launcher
3. It will detect a new version and prompt for update

### Portable Mode
Create an empty `portable.txt` file next to the launcher executable:
```bash
touch portable.txt
```
This will:
- Skip first-run path selection
- Use the executable's directory for all files
- Disable automatic updates (manual updates recommended for portable installs)

### Configuration Location
The configuration file is stored next to the executable (not in the installation directory) so that:
- It persists across updates
- Multiple launcher instances can have different configurations
- Portable mode works correctly

## Icon Embedding

The launcher icon is embedded in the Windows executable:
- Icon files: `icon.ico`, `winres/icon.png`, `winres/icon16.png`
- Embedded via go-winres tool
- Version information includes launcher version
- Icon displays in Windows Explorer, taskbar, etc.

See `ICON_EMBEDDING.md` for details on icon management.

## Troubleshooting

**Problem:** First-run prompt doesn't appear
- Solution: Check if `launcher-config.json` exists. Delete it to trigger first-run.

**Problem:** Update check fails
- Solution: Check internet connection and GitHub API access
- The launcher will continue with the current version if update check fails

**Problem:** Custom path not working
- Solution: Ensure the path exists and has write permissions
- Try using an absolute path instead of a relative path

**Problem:** Icon not displaying
- Solution: Rebuild the launcher after regenerating .syso files with `go-winres make`

## Related Files

- `standalone-launcher.go` - Main launcher implementation
- `standalone-launcher_test.go` - Unit tests
- `launcher-config.json` - Configuration file (created at runtime)
- `winres/winres.json` - Windows resource configuration
- `icon.ico` - Launcher icon
- `ICON_EMBEDDING.md` - Icon management documentation
- `build.sh` / `build.bat` - Build scripts
