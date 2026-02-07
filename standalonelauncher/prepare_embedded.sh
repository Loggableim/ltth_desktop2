#!/bin/bash

# Prepare embedded application files for standalone launcher
# This script copies all necessary files to embedded_app/ directory

set -e

echo "================================================"
echo "  Preparing Embedded Application Files"
echo "================================================"
echo ""

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
cd "$SCRIPT_DIR/.."

# Clean previous embedded_app directory
echo "[1/3] Cleaning previous embedded_app directory..."
rm -rf standalonelauncher/embedded_app
mkdir -p standalonelauncher/embedded_app

# Copy application files
echo "[2/3] Copying application files..."

# Copy app directory (main application)
if [ -d "app" ]; then
    echo "  - Copying app/ directory..."
    cp -r app standalonelauncher/embedded_app/
    # Remove test files and documentation
    rm -rf standalonelauncher/embedded_app/app/test
    rm -rf standalonelauncher/embedded_app/app/docs
    rm -rf standalonelauncher/embedded_app/app/wiki
    rm -f standalonelauncher/embedded_app/app/README.md
    rm -f standalonelauncher/embedded_app/app/LICENSE
    rm -f standalonelauncher/embedded_app/app/CHANGELOG.md
fi

# Copy plugins directory
if [ -d "plugins" ]; then
    echo "  - Copying plugins/ directory..."
    cp -r plugins standalonelauncher/embedded_app/
fi

# Copy game-engine directory (if exists)
if [ -d "game-engine" ]; then
    echo "  - Copying game-engine/ directory..."
    cp -r game-engine standalonelauncher/embedded_app/
fi

# Copy package files (but NOT package-lock.json to save space)
if [ -f "package.json" ]; then
    echo "  - Copying package.json..."
    cp package.json standalonelauncher/embedded_app/
fi

# Also copy package-lock.json for reproducible builds
if [ -f "package-lock.json" ]; then
    echo "  - Copying package-lock.json..."
    cp package-lock.json standalonelauncher/embedded_app/
fi

# Get size of embedded files
echo ""
echo "[3/3] Calculating embedded files size..."
EMBEDDED_SIZE=$(du -sh standalonelauncher/embedded_app | cut -f1)
FILE_COUNT=$(find standalonelauncher/embedded_app -type f | wc -l)

echo ""
echo "================================================"
echo "  Embedded Files Prepared Successfully!"
echo "================================================"
echo "  Total Size: $EMBEDDED_SIZE"
echo "  File Count: $FILE_COUNT"
echo ""
echo "⚠️  WARNING: Binary size will increase by ~$EMBEDDED_SIZE"
echo "    Expected final binary size: ~$(echo "$EMBEDDED_SIZE + 9MB" | bc 2>/dev/null || echo "~44MB")"
echo ""
echo "Next steps:"
echo "  1. Run ./build.sh to build the standalone launcher"
echo "  2. The resulting binary will include all application files"
echo "  3. No GitHub download will be needed at runtime"
echo ""
