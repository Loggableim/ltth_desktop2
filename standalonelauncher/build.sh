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
echo "Ready to distribute:"
echo "  - launcher.exe (Windows GUI) - ~6-8 MB"
echo "  - launcher (Linux) - ~6-8 MB"
echo "  - launcher-console.exe (Windows Debug) - ~6-8 MB"
echo ""

