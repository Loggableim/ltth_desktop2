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
echo "[1/3] Downloading dependencies..."
go mod download || {
    echo "ERROR: Failed to download dependencies"
    exit 1
}

# Build for Windows (GUI version - no console)
echo "[2/3] Building standalone-launcher.exe (GUI)..."
GOOS=windows GOARCH=amd64 go build -o standalone-launcher.exe -ldflags "-H windowsgui -s -w" standalone-launcher.go || {
    echo "ERROR: Build failed"
    exit 1
}

# Build console version for debugging
echo "[3/3] Building standalone-launcher-console.exe..."
GOOS=windows GOARCH=amd64 go build -o standalone-launcher-console.exe -ldflags "-s -w" standalone-launcher.go || {
    echo "ERROR: Build failed"
    exit 1
}

echo ""
echo "================================================"
echo "  Build Successful!"
echo "================================================"
echo ""
echo "Built executables:"
ls -lh standalone-launcher*.exe 2>/dev/null || echo "  (none found)"
echo ""
echo "Ready to distribute standalone-launcher.exe"
echo "Download size: ~6-8 MB"
echo ""
