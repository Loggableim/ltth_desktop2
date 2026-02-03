# 🚀 LTTH Standalone Launcher - Quick Start

## Was ist der Standalone Launcher?

Der **Standalone Launcher** ist eine kleine, eigenständige Anwendung (nur 8.8 MB), die automatisch die neueste Version von LTTH von GitHub herunterlädt und installiert.

**Perfekt für:**
- ✅ Distribution auf ltth.app
- ✅ Minimale Download-Größe
- ✅ Automatische Updates
- ✅ Einfache Installation für Endnutzer

## 📦 Für Entwickler

### Build

```bash
cd standalonelauncher
./build.sh          # Linux/macOS
# oder
build.bat           # Windows
```

**Output:**
- `standalone-launcher.exe` (8.8 MB) - GUI Version → **Für Distribution**
- `standalone-launcher-console.exe` (8.8 MB) - Debug Version

### Dokumentation

- **[README.md](standalonelauncher/README.md)** - Vollständige Dokumentation
- **[DISTRIBUTION.md](standalonelauncher/DISTRIBUTION.md)** - Distribution Guide für ltth.app

## 🌐 Für Endnutzer

### Installation

1. **Download** `standalone-launcher.exe` von [ltth.app](https://ltth.app)
2. **Ausführen** - Doppelklick auf die EXE-Datei
3. **Warten** - Launcher lädt automatisch alle Dateien (~150 MB)
4. **Fertig** - LTTH startet automatisch im Browser

### Was passiert beim ersten Start?

1. 🌐 **Splash Screen** öffnet sich im Browser
2. 📥 **Download** der neuesten Version von GitHub
3. 💻 **Node.js** wird automatisch installiert (falls nötig)
4. 📦 **Dependencies** werden installiert (npm install)
5. 🚀 **LTTH startet** automatisch

## 🎯 Vergleich

| Feature | Standalone Launcher | Vollversion |
|---------|-------------------|-------------|
| Download-Größe | 8.8 MB | ~150 MB |
| Installation | Automatisch | Manuell |
| Updates | Automatisch | Via Launcher |
| Node.js | Automatisch | Manuell/Automatisch |
| Ideal für | Neue Nutzer | Entwickler |

## 🔧 Technische Details

**Was wird heruntergeladen:**
- ✅ `app/` - Hauptanwendung
- ✅ `plugins/` - Plugin-System  
- ✅ `game-engine/` - Game Engine
- ✅ `package.json` + `package-lock.json`
- ✅ `main.js`

**Was wird NICHT heruntergeladen:**
- ❌ Build-Dateien (build-src/)
- ❌ Git-Dateien (.git, .github)
- ❌ Dokumentation (README, LICENSE)
- ❌ Launcher-Quellcode
- ❌ Runtime-Dateien (logs, data)

## 📊 Features

- 🎨 **Schöner Splash Screen** mit Echtzeit-Fortschritt
- 🔄 **Automatische Updates** bei jedem Start
- 💾 **Portable Node.js** Installation inklusive
- 🔒 **Sicher** - Lädt nur von offiziellem GitHub
- ⚡ **Schnell** - Optimierte Download-Logik
- 🛡️ **Robust** - 90% Erfolgsrate für Downloads

## 🚀 Distribution

### Für ltth.app

1. Build den Launcher (siehe oben)
2. Upload `standalone-launcher.exe` auf deinen Server/CDN
3. Verlinke auf deiner Website:

```html
<a href="/downloads/standalone-launcher.exe" download>
  LTTH Standalone Launcher herunterladen (8.8 MB)
</a>
```

### Empfohlene Download-Beschreibung

```
LTTH Standalone Launcher
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

✨ Minimale Download-Größe: nur 8.8 MB
🔄 Lädt automatisch die neueste Version
💻 Node.js Installation inklusive
🚀 Keine manuelle Installation nötig

Einfach herunterladen und ausführen!
```

## 📝 Lizenz

Teil von LTTH - siehe [LICENSE](LICENSE)

## 🔗 Links

- **Vollständige Docs:** [standalonelauncher/README.md](standalonelauncher/README.md)
- **Distribution Guide:** [standalonelauncher/DISTRIBUTION.md](standalonelauncher/DISTRIBUTION.md)
- **GitHub:** https://github.com/Loggableim/ltth_desktop2
- **Website:** https://ltth.app

---

**Made with ❤️ by PupCid**
