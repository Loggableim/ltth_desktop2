# Standalone Launcher - Embedded Mode

## Overview

The standalone launcher now supports two modes:

### 1. Download Mode (Default - 9MB)
- Small binary size (~9MB)
- Downloads application files from GitHub at first run
- Requires internet connection for initial setup
- Faster to distribute

### 2. Embedded Mode (True Standalone - 42MB)
- Large binary size (~42MB)
- All application files embedded in the executable
- **NO internet connection needed** for application files (only for npm dependencies)
- **NO GitHub download** - everything is self-contained
- True portable solution

## When to Use Embedded Mode

Use embedded mode when:
- ✅ Users have unreliable internet connections
- ✅ You want truly standalone distribution
- ✅ GitHub downloads are problematic (rate limits, firewall, etc.)
- ✅ Offline usage is critical
- ✅ You're okay with larger download size

## How to Build Embedded Mode

### Step 1: Prepare Embedded Files

**Linux/macOS:**
```bash
cd standalonelauncher
./prepare_embedded.sh
```

**Windows:**
```batch
cd standalonelauncher
prepare_embedded.bat
```

This will:
- Copy `app/`, `plugins/`, `package.json` to `embedded_app/` directory
- Remove unnecessary files (tests, docs)
- Create ~33MB of embedded files

### Step 2: Build Launcher

**Linux/macOS:**
```bash
./build.sh
```

**Windows:**
```batch
build.bat
```

The resulting executables will include all embedded files:
- `launcher.exe` (Windows GUI) - ~42MB
- `launcher-console.exe` (Windows Debug) - ~42MB
- `launcher` (Linux) - ~39MB

## How It Works

1. **First Run:**
   - Launcher checks for embedded files
   - Extracts all files to installation directory
   - Shows progress (5% to 70%)
   - No GitHub download needed!

2. **Subsequent Runs:**
   - Files already extracted, launcher starts immediately
   - Only npm dependencies are downloaded (from npm registry)

3. **Fallback:**
   - If embedded extraction fails, automatically falls back to GitHub download
   - Ensures launcher always works

## Feature Flag

In `standalone-launcher.go`:

```go
const (
    // Feature flag for embedded app mode
    useEmbeddedApp = true  // Set to false to disable embedded mode
)
```

- `true`: Uses embedded files (if available), no GitHub download
- `false`: Always downloads from GitHub (original behavior)

## File Structure

### Embedded Files Directory
```
standalonelauncher/
├── embedded_app/          # Created by prepare_embedded.sh
│   ├── app/              # Main application (33MB)
│   ├── plugins/          # (if exists)
│   ├── package.json
│   └── package-lock.json
├── prepare_embedded.sh    # Prepares embedded files
├── prepare_embedded.bat   # Windows version
└── standalone-launcher.go # Main launcher code
```

### Runtime Extraction
```
Installation Directory/
├── app/                   # Extracted from embedded files
├── plugins/               # Extracted from embedded files
├── runtime/
│   └── node/             # Downloaded Node.js (if needed)
├── package.json
└── package-lock.json
```

## Technical Details

### Embedding Mechanism

Uses Go's `embed` package:

```go
//go:embed embedded_app/*
var embeddedApp embed.FS
```

### Extraction Process

1. Read embedded files from `embeddedApp` filesystem
2. Walk directory tree recursively
3. Create directories and files in installation directory
4. Show progress every 50 files

### Error Handling

- If embedded files not found → Fallback to GitHub download
- If extraction fails → Fallback to GitHub download
- If GitHub download fails → Show error to user

## Advantages of Embedded Mode

✅ **No GitHub API Rate Limits**
- No API calls to GitHub
- No rate limit issues
- Always works

✅ **Offline Installation**
- Application files don't need internet
- Only npm dependencies require network
- Perfect for restricted environments

✅ **Predictable Behavior**
- No network failures during setup
- Consistent installation experience
- Faster setup (no download wait)

✅ **Security**
- No network calls for app files
- Application code is verified at build time
- No man-in-the-middle risks for app files

## Disadvantages of Embedded Mode

❌ **Larger Download**
- 42MB vs 9MB
- 4.6x larger
- Takes longer to download initially

❌ **No Automatic Updates**
- Must download new launcher for updates
- Can't update from GitHub automatically
- Requires new build for each version

❌ **Build Complexity**
- Extra step to prepare embedded files
- Larger build artifacts
- More storage needed

## Comparison

| Feature | Download Mode | Embedded Mode |
|---------|---------------|---------------|
| **Binary Size** | ~9MB | ~42MB |
| **Internet Required** | Yes (setup) | Only for npm |
| **GitHub Download** | Yes | No |
| **Setup Time** | 2-5 min | 30-60 sec |
| **Rate Limits** | Possible | No |
| **Offline Usage** | No | Yes |
| **Auto Updates** | Possible | No |

## Best Practices

1. **For Public Distribution:**
   - Offer both versions
   - Let users choose based on their needs
   - Label clearly: "Small (9MB)" vs "Standalone (42MB)"

2. **For Enterprise:**
   - Use embedded mode for offline installations
   - Reduces network dependencies
   - Better for airgapped environments

3. **For Development:**
   - Use download mode for faster iteration
   - Embedded mode for release builds
   - Test both modes before release

## Building Both Versions

You can maintain both versions:

1. **Small Version** (Download Mode):
   ```bash
   # Don't run prepare_embedded.sh
   # Or delete embedded_app/ directory
   rm -rf embedded_app/
   ./build.sh
   ```
   Result: `launcher.exe` (9MB)

2. **Large Version** (Embedded Mode):
   ```bash
   ./prepare_embedded.sh
   ./build.sh
   ```
   Result: `launcher.exe` (42MB)

Rename appropriately:
- `launcher-small.exe` (9MB, requires internet)
- `launcher-standalone.exe` (42MB, offline-ready)

## Troubleshooting

### "embedded app files not available"
- Run `prepare_embedded.sh` first
- Make sure `embedded_app/` directory exists
- Check that files were copied correctly

### "no embedded app files found"
- The `embedded_app/` directory is empty
- Re-run `prepare_embedded.sh`
- Check file permissions

### Build takes too long
- Go is embedding 33MB of files
- This is normal for embedded mode
- Expect 2-3x longer build time

### Binary too large
- This is expected behavior
- 42MB is normal for embedded mode
- Use download mode if size is critical

## Future Improvements

Potential enhancements:

- [ ] Compression of embedded files (reduce size)
- [ ] Delta updates (update only changed files)
- [ ] Hybrid mode (embed critical files, download others)
- [ ] Version checking (compare embedded vs latest)
- [ ] Optional GitHub update check

## Conclusion

Embedded mode provides a truly standalone launcher that doesn't require GitHub downloads. While the binary is larger (42MB), it offers:

- Offline installation capability
- No rate limit issues
- Predictable, fast setup
- Better security for app files

Choose embedded mode when reliability and offline operation are more important than download size.

---

**Recommendation:** For most users, **embedded mode** is the better choice as it provides a true standalone experience without network dependencies for the application itself.
