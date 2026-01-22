# Changelog

All notable changes to PupCid's Little TikTool Helper will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Weather Control Plugin - WebGL2 Renderer Overhaul**
  - Complete rewrite of weather overlay with WebGL2-based rendering engine
  - Instanced particle rendering: Rain (1200 particles), Snow (700 particles)
  - Dual Kawase bloom post-processing with 3-level chain (threshold, downsample, upsample)
  - Guaranteed transparency: premultiplied alpha + Shadow DOM isolation + debug readback
  - Advanced shader effects:
    - Rain: Multi-layer streaks with parallax depth and wind modulation
    - Snow: Soft glows with wobble animation and sparkle effects  
    - Storm: Rain + procedural lightning bolts with additive bloom + screen flash
    - Fog: Multi-layer Perlin noise with scrolling and soft alpha blending
    - Sunbeam: Godrays with warm color grading and slow movement
    - Lightning: Bolt geometry with additive glow and screen flash overlay
  - Performance optimizations: DPR clamping (max 1.5), particle limits, efficient instancing
  - Debug panel: FPS, frame time, particle counts, draw calls, transparency verification, initial pixel RGBA readback
  - Shadow DOM canvas isolation prevents external CSS interference
  - Procedural noise texture generation (256x256) for fog effects
  - Framebuffer architecture for multi-pass rendering
  - Fallback chroma-key mode (hot-pink background) for browsers without alpha support
  - Files: `webgl-renderer.js` (1500+ lines), updated `overlay.html`, backup `overlay-canvas2d-backup.html`
  - Requires WebGL2 (Chrome 56+, Firefox 51+, Edge 79+, OBS Studio 27.0+)

### Fixed
- **Weather Control Plugin - OBS Overlay Transparency**
  - Fixed black background issue in OBS HUD overlay
  - Added explicit transparency settings to HTML, body, canvas, and container elements
  - Updated canvas context initialization with `premultipliedAlpha: true` for proper alpha blending
  - Ensured canvas maintains transparent background during initialization and resize
  - OBS now properly displays only weather effects without any background color
- **Goals Plugin Display Issues**
  - Fixed coin goal displaying values twice due to duplicate socket broadcasts
  - Fixed format function bug where 999999 displayed as "1000.0K" instead of "999K"
  - Simplified `broadcastGoalValueChanged()` to eliminate duplicate socket events (50% performance improvement)
  - Updated number formatting for cleaner display: numbers >= 10K now show without decimals (e.g., "50K" instead of "50.0K")
  - Ensured consistency between ClarityHUD and Goals overlays
  - Added comprehensive test suite (`goals-display-fix.test.js`) with 7 test cases
  - See `LIVE_GOALS_DISPLAY_FIX.md` for detailed technical documentation

## [1.2.2] - 2025-12-15

### Added
- **Multilingual Plugin Descriptions** (Phase 4)
  - Added multilingual descriptions to all 30 plugin.json files
  - Support for 4 languages: English (en), German (de), Spanish (es), French (fr)
  - New `descriptions` object in plugin.json with language-specific descriptions
  - Maintained backward compatibility with existing `description` field
  - API support for localized descriptions via `locale` query parameter
  - Updated plugin loader with `getLocalizedDescription()` helper function
  - Updated `/api/plugins` and `/api/plugins/:id` routes to support locale selection
  - All plugin descriptions include comprehensive feature details
  - Automated test suite for validation and backward compatibility
- **Visual Indicators for API Key Storage**
  - Added visual indicators showing that API keys are stored persistently across updates
  - Improved user feedback for API key configuration
  - Better documentation of API key storage locations

### Changed
- **Repository Cleanup**
  - Moved 107 implementation summary and documentation files to `docs_archive/` folder
  - Moved test and utility scripts to `scripts/` folder
  - Cleaned up root directory structure for better maintainability
  - Organized temporary implementation files and sandboxes
- **Plugin Loader Enhancement**
  - `getAllPlugins()` now accepts optional `locale` parameter
  - Plugin API responses now include both `description` (localized) and `descriptions` (all languages)
  - Improved plugin metadata exposure for better internationalization support

### Technical Details
- 30 plugins updated with multilingual descriptions
- JSON validation passed for all plugin.json files
- Backward compatibility maintained for legacy plugins without `descriptions` object
- Localization fallback: `descriptions[locale]` → `description` → empty string

## [1.2.1] - 2025-12-09

### Fixed
- **Version Number Correction** - Corrected erroneous version 2.2.1 to 1.2.1
  - Previous version incorrectly labeled as 2.2.1 (typo)
  - Proper semantic versioning sequence: 1.1.0 → 1.2.0 → 1.2.1
- **Advanced Timer Plugin** - Fixed overlay routes and storage migration
  - Added missing overlay routes for timer display in OBS
  - Migrated timer storage to user profile for better data persistence
  - Improved timer state management and recovery
  - Fixed timer overlay not loading correctly in browser sources

## [1.2.0] - 2025-12-07

### Changed
- **Repository Cleanup & Documentation Consolidation**
  - Konsolidierung aller Dokumentationsdateien in README.md
  - Archivierung aller detailierten Informationsdateien in /docs_archive/
  - Root-Verzeichnis bereinigt und auf Kern-Elemente reduziert
  - Struktur vereinheitlicht für zukünftige Releases
  - LICENSE file moved to root directory
  - Neue konsolidierte README.md mit allen wichtigen Informationen
  - Migration guides und spezifische Dokumentationen archiviert

### Added
- CHANGELOG.md für bessere Versionsverfolgung
- docs_archive/ Ordner für historische Dokumentation
- Vereinfachte Root-Struktur mit klarer Trennung

## [1.1.0] - 2024-12

### Added
- Electron Desktop App Support
- Viewer XP System with overlays and statistics
- GCCE Integration for plugins
- Weather Control Plugin
- Multi-Cam Switcher improvements
- HUD System Plugin (core)
- Performance optimizations (60% Event Processing, 50-75% DB Query reduction)

### Changed
- Launcher optimizations and error handling improvements
- Repository size reduction (removed node_modules from git)
- Improved documentation structure

### Fixed
- Launcher syntax errors
- Launcher size optimization (28% reduction)
- Improved error handling with log files
- Various bug fixes and stability improvements

---

For detailed changelog of the backend application, see [app/CHANGELOG.md](app/CHANGELOG.md)
