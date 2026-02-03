@echo off
REM Build script for LTTH Standalone Launcher (Windows)

echo ================================================
echo   Building LTTH Standalone Launcher
echo ================================================
echo.

cd /d "%~dp0"

REM Check if Go is installed
where go >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Go is not installed or not in PATH
    echo Please install Go from https://golang.org/dl/
    pause
    exit /b 1
)

REM Get dependencies
echo [1/4] Downloading dependencies...
go mod download
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to download dependencies
    pause
    exit /b 1
)

REM Build for Windows (GUI version - no console)
echo [2/4] Building launcher.exe (Windows GUI)...
set GOOS=windows
set GOARCH=amd64
go build -o launcher.exe -ldflags "-H windowsgui -s -w" standalone-launcher.go
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

REM Build console version for debugging
echo [3/4] Building launcher-console.exe (Windows Console)...
go build -o launcher-console.exe -ldflags "-s -w" standalone-launcher.go
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

REM Build for Linux
echo [4/4] Building launcher (Linux)...
set GOOS=linux
set GOARCH=amd64
go build -o launcher -ldflags "-s -w" standalone-launcher.go
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

echo.
echo ================================================
echo   Build Successful!
echo ================================================
echo.
echo Built executables:
dir /b launcher.exe launcher-console.exe launcher 2>nul
echo.

REM Show file sizes
for %%f in (launcher.exe launcher-console.exe launcher) do (
    if exist %%f echo   %%f - %%~zf bytes
)

echo.
echo Ready to distribute:
echo   - launcher.exe (Windows GUI) - ~6-8 MB
echo   - launcher (Linux) - ~6-8 MB
echo   - launcher-console.exe (Windows Debug) - ~6-8 MB
echo.
pause

