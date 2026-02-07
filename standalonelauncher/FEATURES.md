# Standalone Launcher Features

## Overview

The LTTH Standalone Launcher provides a complete, self-contained installation experience for LTTH without requiring manual setup. This document describes the key features implemented in version 1.3.2.

## Key Features

### 1. Installation Path Selection (First-Run)

On first installation, the launcher prompts the user to choose between two installation modes:

#### Portable Installation
- All files are stored in the same directory as the launcher executable
- Creates a `portable.txt` marker file for future runs
- Ideal for USB drives or when you want to keep everything in one place
- **Location**: Same directory as launcher.exe

#### System Installation (Recommended)
- Files are stored in the user's application data directory
- Follows operating system conventions
- **Windows**: `%APPDATA%\PupCid\LTTH-Launcher`
- **Linux**: `~/.config/PupCid/LTTH-Launcher`
- **macOS**: `~/Library/Application Support/PupCid/LTTH-Launcher`

The choice is remembered for future runs:
- Portable mode: Detected by presence of `portable.txt`
- System mode: Detected by presence of `version.json` in system directory

### 2. Automatic Update Detection

The launcher checks for updates on every start by:

1. Querying the GitHub API for the latest release
2. Comparing the installed version with the latest release version
3. If a new version is available, prompting the user

#### Update Prompt

When an update is available, the user sees:
```
================================================
  🎉 Neues Update verfügbar!
================================================

Neue Version: v1.3.3
Veröffentlicht: 2026-02-07T10:30:00Z
Name: LTTH v1.3.3 - Bug Fixes and Improvements

Möchten Sie jetzt aktualisieren?

[1] Ja, jetzt aktualisieren (empfohlen)
[2] Nein, überspringen

Ihre Wahl (1 oder 2):
```

**User Choices:**
- **[1] Update Now**: Downloads and installs the latest version
- **[2] Skip**: Uses the existing installation without updating

### 3. Version Tracking

The launcher maintains a `version.json` file in the installation directory:

```json
{
  "version": "1.3.2",
  "installed_date": "2026-02-07T14:30:00Z",
  "last_checked": "2026-02-07T15:45:00Z"
}
```

This file tracks:
- **version**: Currently installed app version
- **installed_date**: When the app was first installed
- **last_checked**: When the launcher last checked for updates

### 4. Application Icon Embedding

The launcher embeds the LTTH icon directly into the executable:

- **Icon Source**: `mini-icon.png` from `/images/logos_neu/icons/`
- **Windows**: Icon embedded using go-winres (.syso resource files)
- **Formats**: Multiple resolutions (256, 128, 64, 48, 32, 16px)
- **Visibility**: Icon appears in Windows Explorer, taskbar, and Alt-Tab

The icon is embedded at build time and no external files are needed.

### 5. Smart Installation Flow

The launcher intelligently handles different scenarios:

#### First Installation
1. Prompt for installation path (portable or system)
2. Create installation directory
3. Download latest release from GitHub
4. Extract application files
5. Check/install Node.js if needed
6. Install npm dependencies
7. Save version.json
8. Launch application

#### Update Installation
1. Load existing version.json
2. Check for updates
3. If update available, prompt user
4. If accepted, download and extract new version
5. Update version.json
6. Skip npm install (reuse existing node_modules)
7. Launch application

#### Existing Installation (No Update)
1. Load version.json
2. Check for updates
3. If no update or user skips:
   - Skip download
   - Skip npm install
   - Directly launch application

### 6. Node.js Management

The launcher automatically manages Node.js:

1. **Check Portable Installation**: `runtime/node/node.exe`
2. **Check Global Installation**: System-wide Node.js
3. **Version Validation**: Requires Node.js v20 LTS or higher
4. **Auto-Install**: Downloads portable Node.js v20.18.1 if needed

Portable Node.js is stored in: `<install-dir>/runtime/node/`

### 7. Progress Tracking

Visual progress feedback through:
- Web-based splash screen at `http://localhost:8765`
- Server-Sent Events (SSE) for real-time updates
- Console output with detailed logging
- Progress bar showing 0-100% completion

Progress stages:
- 0-10%: Version checking and release info
- 10-60%: Download from GitHub
- 60-70%: Extraction of files
- 70-80%: Node.js installation
- 80-90%: npm dependencies
- 90-100%: Application launch

## Version Comparison

The launcher uses semantic version comparison to detect updates:

```go
compareVersions("1.3.2", "1.3.3")  // Returns -1 (update available)
compareVersions("1.3.2", "1.3.2")  // Returns 0 (same version)
compareVersions("1.3.3", "1.3.2")  // Returns 1 (installed is newer)
```

Versions are compared part by part (major.minor.patch).

## File Structure

```
Installation Directory/
├── version.json           # Version tracking
├── app/                   # Main application
│   ├── server.js
│   ├── package.json
│   └── ...
├── plugins/               # Plugin system
├── game-engine/           # Game engine files
├── runtime/               # Portable runtime
│   └── node/              # Portable Node.js
│       └── node.exe
└── temp/                  # Temporary download files (auto-cleaned)
```

## Command-Line Behavior

The launcher is a GUI application (no console window) but logs to stdout:

```
================================================
  LTTH Standalone Launcher
  https://ltth.app
================================================

[LTTH Standalone] Installation directory: C:\Users\...\LTTH-Launcher
[LTTH Standalone] Checking for updates...
[LTTH Standalone] Latest release: LTTH v1.3.2 (v1.3.2)
[LTTH Standalone] Starting web server on :8765
[LTTH Standalone] [5%] Hole neueste Release-Version...
```

## Technical Details

### Icon Embedding (Windows)

- **Tool**: go-winres
- **Configuration**: `winres/winres.json`
- **Resource Files**: `rsrc_windows_*.syso`
- **Icon Files**: `winres/icon.png` (256x256), `winres/icon16.png` (16x16)

To update icon:
```bash
cd standalonelauncher
~/go/bin/go-winres make
```

### Version Information (Windows)

The executable contains version metadata:
- **Product Name**: LTTH Launcher
- **Company**: PupCid
- **Version**: 1.3.2.0
- **Description**: LTTH Standalone Launcher
- **Copyright**: Copyright (c) PupCid

### GitHub API Integration

- **Endpoint**: `https://api.github.com/repos/Loggableim/ltth_desktop2/releases/latest`
- **Fallback**: Direct branch download if no release exists
- **Rate Limit**: Respects GitHub API rate limits (60 req/hour for unauthenticated)

## Future Enhancements

Potential improvements for future versions:

1. **Background Updates**: Download updates in background while app is running
2. **Update Scheduling**: "Remind me later" with scheduled reminders
3. **Delta Updates**: Only download changed files instead of full package
4. **Rollback Support**: Ability to revert to previous version
5. **Auto-Update**: Optional automatic updates without user prompt
6. **Update History**: Track all installed versions and update dates

## Troubleshooting

### Update Check Fails

If the update check fails (network issues, API rate limit):
- The launcher logs a warning but continues with existing installation
- User can manually download updates from GitHub releases page

### Version File Corruption

If `version.json` is corrupted or missing:
- The launcher treats it as a first installation
- Downloads and installs the latest version
- Creates a new `version.json`

### Installation Path Issues

If the installation directory cannot be created:
- Error message is displayed
- User can try running as administrator (Windows)
- Or manually create the directory and retry

## See Also

- [ICON_EMBEDDING.md](ICON_EMBEDDING.md) - Icon embedding details
- [DISTRIBUTION.md](DISTRIBUTION.md) - Distribution and deployment
- [README.md](README.md) - General launcher information
