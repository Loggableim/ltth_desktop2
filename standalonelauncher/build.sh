#!/bin/bash
# Build script for LTTH Standalone Launcher (Linux/macOS)

echo "================================================"
echo "  Building LTTH Standalone Launcher"
echo "================================================"
echo ""

cd "$(dirname "$0")"

# Check if Go is installed
if ! command -v go &> /dev/null; then
    echo "ERROR: Go is not installed or not in PATH"
    echo "Please install Go from https://golang.org/dl/"
    exit 1
fi

# Check for embedded mode
EMBEDDED_MODE=false
if [ -d "embedded_app" ] && [ "$(ls -A embedded_app)" ]; then
    EMBEDDED_MODE=true
    EMBEDDED_SIZE=$(du -sh embedded_app | cut -f1)
    EMBEDDED_SIZE_MB=$(du -sm embedded_app | cut -f1)
    EMBEDDED_FILES=$(find embedded_app -type f | wc -l)
    EXPECTED_SIZE=$((EMBEDDED_SIZE_MB + 7))
    echo "🚀 EMBEDDED MODE DETECTED"
    echo "   - Embedded files: $EMBEDDED_SIZE"
    echo "   - File count: $EMBEDDED_FILES"
    echo "   - Expected binary: ~${EXPECTED_SIZE}MB"
    echo "   - NO GitHub download required!"
    echo ""
else
    echo "📥 DOWNLOAD MODE"
    echo "   - Binary will be ~9MB"
    echo "   - Will download from GitHub at runtime"
    echo ""
    echo "   To enable EMBEDDED MODE (standalone, ~24MB):"
    echo "   Run: ./prepare_embedded.sh"
    echo ""
fi

# Before build, ensure .syso files exist
if [ ! -f "rsrc_windows_amd64.syso" ]; then
    echo "[PRE] Generating Windows resource files..."
    # Install go-winres if not available
    if ! command -v go-winres &> /dev/null; then
        echo "WARNING: go-winres not installed. Installing..."
        go install github.com/tc-hib/go-winres@latest
    fi
    # Generate .syso files
    go-winres make || {
        echo "ERROR: Failed to generate .syso files"
        exit 1
    }
    echo ""
fi

# Get dependencies
echo "[1/4] Downloading dependencies..."
go mod download || {
    echo "ERROR: Failed to download dependencies"
    exit 1
}

# Build for Windows (GUI version - no console)
echo "[2/4] Building launcher.exe (Windows GUI)..."
GOOS=windows GOARCH=amd64 go build -o launcher.exe -ldflags "-H windowsgui -s -w" standalone-launcher.go || {
    echo "ERROR: Build failed"
    exit 1
}

# Build console version for debugging
echo "[3/4] Building launcher-console.exe (Windows Console)..."
GOOS=windows GOARCH=amd64 go build -o launcher-console.exe -ldflags "-s -w" standalone-launcher.go || {
    echo "ERROR: Build failed"
    exit 1
}

# Build for Linux
echo "[4/4] Building launcher (Linux)..."
GOOS=linux GOARCH=amd64 go build -o launcher -ldflags "-s -w" standalone-launcher.go || {
    echo "ERROR: Build failed"
    exit 1
}

echo ""
echo "================================================"
echo "  Build Successful!"
echo "================================================"
echo ""
echo "Built executables:"
ls -lh launcher.exe launcher-console.exe launcher 2>/dev/null || echo "  (some files not found)"
echo ""

if [ "$EMBEDDED_MODE" = true ]; then
    # Get actual sizes
    LINUX_SIZE=$(ls -lh launcher 2>/dev/null | awk '{print $5}')
    WIN_SIZE=$(ls -lh launcher.exe 2>/dev/null | awk '{print $5}')
    
    echo "🚀 EMBEDDED MODE - True Standalone!"
    echo "  - launcher.exe (Windows GUI) - $WIN_SIZE"
    echo "  - launcher (Linux) - $LINUX_SIZE"
    echo "  - launcher-console.exe (Windows Debug) - $WIN_SIZE"
    echo ""
    echo "✅ No GitHub download required"
    echo "✅ Works offline (except npm dependencies)"
    echo "✅ All application files embedded"
else
    echo "📥 DOWNLOAD MODE - Requires Internet"
    echo "  - launcher.exe (Windows GUI) - ~9 MB"
    echo "  - launcher (Linux) - ~8.6 MB"
    echo "  - launcher-console.exe (Windows Debug) - ~9 MB"
    echo ""
    echo "⚠️  Requires GitHub download at first run"
    echo "   To build standalone version, run: ./prepare_embedded.sh"
fi
echo ""

