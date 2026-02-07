@echo off
REM Prepare embedded application files for standalone launcher
REM This script copies all necessary files to embedded_app\ directory

echo ================================================
echo   Preparing Embedded Application Files
echo ================================================
echo.

cd /d "%~dp0\.."

REM Clean previous embedded_app directory
echo [1/3] Cleaning previous embedded_app directory...
if exist "standalonelauncher\embedded_app" (
    rmdir /s /q "standalonelauncher\embedded_app"
)
mkdir "standalonelauncher\embedded_app"

REM Copy application files
echo [2/3] Copying application files...

REM Copy app directory (main application)
if exist "app" (
    echo   - Copying app\ directory...
    xcopy /E /I /Q /Y "app" "standalonelauncher\embedded_app\app" > nul
    REM Remove test files and documentation
    if exist "standalonelauncher\embedded_app\app\test" rmdir /s /q "standalonelauncher\embedded_app\app\test" 2>nul
    if exist "standalonelauncher\embedded_app\app\docs" rmdir /s /q "standalonelauncher\embedded_app\app\docs" 2>nul
    if exist "standalonelauncher\embedded_app\app\wiki" rmdir /s /q "standalonelauncher\embedded_app\app\wiki" 2>nul
    if exist "standalonelauncher\embedded_app\app\README.md" del /q "standalonelauncher\embedded_app\app\README.md" 2>nul
    if exist "standalonelauncher\embedded_app\app\LICENSE" del /q "standalonelauncher\embedded_app\app\LICENSE" 2>nul
    if exist "standalonelauncher\embedded_app\app\CHANGELOG.md" del /q "standalonelauncher\embedded_app\app\CHANGELOG.md" 2>nul
)

REM Copy plugins directory
if exist "plugins" (
    echo   - Copying plugins\ directory...
    xcopy /E /I /Q /Y "plugins" "standalonelauncher\embedded_app\plugins" > nul
)

REM Copy game-engine directory (if exists)
if exist "game-engine" (
    echo   - Copying game-engine\ directory...
    xcopy /E /I /Q /Y "game-engine" "standalonelauncher\embedded_app\game-engine" > nul
)

REM Copy package files
if exist "package.json" (
    echo   - Copying package.json...
    copy /Y "package.json" "standalonelauncher\embedded_app\package.json" > nul
)

if exist "package-lock.json" (
    echo   - Copying package-lock.json...
    copy /Y "package-lock.json" "standalonelauncher\embedded_app\package-lock.json" > nul
)

echo.
echo [3/3] Embedded files prepared!
echo.
echo ================================================
echo   Embedded Files Prepared Successfully!
echo ================================================
echo.
echo WARNING: Binary size will increase significantly
echo Expected final binary size: ~44MB
echo.
echo Next steps:
echo   1. Run build.bat to build the standalone launcher
echo   2. The resulting binary will include all application files
echo   3. No GitHub download will be needed at runtime
echo.
pause
