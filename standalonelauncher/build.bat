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
echo [1/3] Downloading dependencies...
go mod download
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Failed to download dependencies
    pause
    exit /b 1
)

REM Build for Windows (GUI version - no console)
echo [2/3] Building standalone-launcher.exe (GUI)...
set GOOS=windows
set GOARCH=amd64
go build -o standalone-launcher.exe -ldflags "-H windowsgui -s -w" standalone-launcher.go
if %ERRORLEVEL% NEQ 0 (
    echo ERROR: Build failed
    pause
    exit /b 1
)

REM Build console version for debugging
echo [3/3] Building standalone-launcher-console.exe...
go build -o standalone-launcher-console.exe -ldflags "-s -w" standalone-launcher.go
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
dir /b standalone-launcher*.exe 2>nul
echo.

REM Show file sizes
for %%f in (standalone-launcher*.exe) do (
    echo   %%f - %%~zf bytes
)

echo.
echo Ready to distribute standalone-launcher.exe
echo Download size: ~6-8 MB
echo.
pause
