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

REM Check for embedded mode
if exist "embedded_app\" (
    if exist "embedded_app\app\" (
        echo EMBEDDED MODE DETECTED
        echo    - Binary will be ~42MB (includes all app files^)
        echo    - NO GitHub download required!
        echo.
        set EMBEDDED_MODE=true
    ) else (
        echo DOWNLOAD MODE
        echo    - Binary will be ~9MB
        echo    - Will download from GitHub at runtime
        echo.
        echo    To enable EMBEDDED MODE (standalone^):
        echo    Run: prepare_embedded.bat
        echo.
        set EMBEDDED_MODE=false
    )
) else (
    echo DOWNLOAD MODE
    echo    - Binary will be ~9MB
    echo    - Will download from GitHub at runtime
    echo.
    echo    To enable EMBEDDED MODE (standalone^):
    echo    Run: prepare_embedded.bat
    echo.
    set EMBEDDED_MODE=false
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
if "%EMBEDDED_MODE%"=="true" (
    echo EMBEDDED MODE - True Standalone!
    echo   - launcher.exe (Windows GUI^) - ~42 MB
    echo   - launcher (Linux^) - ~39 MB
    echo   - launcher-console.exe (Windows Debug^) - ~42 MB
    echo.
    echo   No GitHub download required
    echo   Works offline (except npm dependencies^)
    echo   All application files embedded
) else (
    echo DOWNLOAD MODE - Requires Internet
    echo   - launcher.exe (Windows GUI^) - ~9 MB
    echo   - launcher (Linux^) - ~8.6 MB
    echo   - launcher-console.exe (Windows Debug^) - ~9 MB
    echo.
    echo   Requires GitHub download at first run
    echo   To build standalone version, run: prepare_embedded.bat
)
echo.
pause

