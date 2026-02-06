# Icon Embedding for Standalone Launcher

This document explains how the LTTH launcher icon is embedded into Windows executables.

## Overview

The standalone launcher uses the **OPEN BETA** logo from `/images/OPEN BETA.jpg` as its application icon. This icon is automatically embedded into Windows executables during the build process.

## How It Works

### 1. Icon Files

The logo is converted into multiple formats:
- `icon.png` - High-resolution 1024x1024 PNG for general use
- `icon.ico` - Multi-resolution Windows icon (256, 128, 64, 48, 32, 16px)
- `winres/icon.png` - 256x256 PNG for resource embedding
- `winres/icon16.png` - 16x16 PNG for small icon variant

### 2. Windows Resource Files

The icon is embedded using [go-winres](https://github.com/tc-hib/go-winres):

```bash
# Install go-winres
go install github.com/tc-hib/go-winres@latest

# Generate Windows resource files
go-winres make
```

This creates:
- `rsrc_windows_386.syso` - 32-bit Windows resources
- `rsrc_windows_amd64.syso` - 64-bit Windows resources

### 3. Configuration

The `winres/winres.json` file defines:
- Application icon (RT_GROUP_ICON)
- Application manifest (RT_MANIFEST)
- Version information (RT_VERSION)
  - Product Name: "LTTH Launcher"
  - Company: "PupCid"
  - Version: 1.0.0.0
  - Description: "PupCid's Little TikTool Helper Standalone Launcher"

### 4. Build Process

The Go compiler automatically includes `.syso` files when building Windows executables:

```bash
GOOS=windows GOARCH=amd64 go build -o launcher.exe -ldflags "-H windowsgui -s -w" standalone-launcher.go
```

The `-H windowsgui` flag creates a GUI application (no console window).

## Updating the Icon

To update the launcher icon:

1. Replace the source image at `/images/OPEN BETA.jpg`

2. Regenerate icon files:
   ```bash
   cd standalonelauncher
   
   # Convert to ICO and PNG formats
   convert "../images/OPEN BETA.jpg" -resize 1024x1024! icon.png
   convert "../images/OPEN BETA.jpg" -resize 256x256! -define icon:auto-resize="256,128,64,48,32,16" icon.ico
   
   # Update winres icons
   convert "../images/OPEN BETA.jpg" -resize 256x256! winres/icon.png
   convert "../images/OPEN BETA.jpg" -resize 16x16! winres/icon16.png
   ```

3. Regenerate Windows resource files:
   ```bash
   go-winres make
   ```

4. Rebuild executables:
   ```bash
   ./build.sh  # Linux/macOS
   # or
   build.bat   # Windows
   ```

## Requirements

- **ImageMagick** - For image conversion (`convert` command)
- **go-winres** - For Windows resource generation

## Technical Details

### Icon Sizes in .ico file:
- 256x256 (PNG compressed)
- 128x128 (PNG compressed)
- 64x64 (PNG compressed)
- 48x48 (PNG compressed)
- 32x32 (PNG compressed)
- 16x16 (PNG compressed)

### Resource File Structure:
The `.syso` files contain:
- Icon resources (multiple resolutions)
- Application manifest (Windows compatibility settings)
- Version information (product name, version, copyright)

### Build Integration:
Go's build system automatically includes `*.syso` files for the target OS/architecture. No special build flags are needed - the resources are automatically embedded.

## Verification

To verify the icon is embedded:

1. **Windows Explorer**: Right-click launcher.exe → Properties → See icon
2. **File Info**: The executable should show the OPEN BETA logo
3. **Metadata**: Right-click → Properties → Details → See version info

## Troubleshooting

**Problem**: Icon doesn't appear in built executable
- Ensure `.syso` files are present in the directory
- Rebuild with `go clean` first to clear cache
- Check that `GOOS=windows` is set for cross-compilation

**Problem**: "image size too big" error
- Ensure winres icons are max 256x256
- Use `convert -resize 256x256!` to force exact size

**Problem**: Icon looks stretched
- The source image aspect ratio is preserved
- Use `-resize WxH!` flag to force exact dimensions (may distort)
- Or crop to square first: `-resize 1024x1024^ -gravity center -extent 1024x1024`
