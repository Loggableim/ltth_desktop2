# LTTH Standalone Launcher

Der offizielle Standalone Launcher für **PupCid's Little TikTool Helper (LTTH)**.

## 📦 Was ist der Standalone Launcher?

Der Standalone Launcher ist eine **kleine, eigenständige Anwendung** (~6-8 MB), die automatisch:
- ✅ Die neueste Version von LTTH von GitHub herunterlädt
- ✅ Node.js installiert (falls nicht vorhanden)
- ✅ Alle Abhängigkeiten installiert
- ✅ Die Anwendung startet

**Vorteile:**
- 🎯 **Minimale Download-Größe** - Nur ~6-8 MB statt >100 MB
- 🔄 **Immer aktuell** - Lädt automatisch die neueste Version
- 🚀 **Einfache Verteilung** - Perfekt für ltth.app Downloads
- 💻 **Keine Installation nötig** - Einfach herunterladen und ausführen

## 🎯 Verwendung

### Für Endnutzer

1. **Download:** Lade `launcher.exe` (Windows) oder `launcher` (Linux) von [ltth.app](https://ltth.app) herunter
2. **Ausführen:** Doppelklick auf die Datei (Windows) oder `./launcher` im Terminal (Linux)
3. **Warten:** Der Launcher lädt automatisch alle Dateien herunter
4. **Fertig:** Die Anwendung startet automatisch im Browser

### Was passiert beim ersten Start?

1. **Splash Screen öffnet sich** im Browser mit Fortschrittsanzeige
2. **Download der Dateien** von GitHub (~50-100 MB)
3. **Node.js Installation** (falls nicht vorhanden, ~45 MB)
4. **npm install** führt automatisch `npm install` aus
5. **LTTH startet** automatisch im Browser auf `http://localhost:3000`

### Bei nachfolgenden Starts

Der Launcher prüft auf Updates und lädt nur geänderte Dateien herunter.

## 🔧 Technische Details

### Systemanforderungen

- **Betriebssystem:** Windows 10/11 (64-bit)
- **Internet:** Für Download der Dateien erforderlich
- **Festplatte:** ~500 MB freier Speicherplatz
- **Port 8765:** Für Splash Screen (temporär)
- **Port 3000:** Für LTTH Anwendung

### Was wird heruntergeladen?

Der Launcher lädt nur die relevanten Dateien herunter:

✅ **Heruntergeladen:**
- `app/` - Hauptanwendung
- `plugins/` - Plugin-System
- `game-engine/` - Spiel-Engine
- `package.json` - Dependencies
- `package-lock.json` - Locked Dependencies
- `main.js` - Einstiegspunkt

❌ **Nicht heruntergeladen:**
- Build-Dateien und Quellcode
- Git-Dateien (.git, .github)
- Dokumentation (README, LICENSE)
- Launcher-Quellcode
- Runtime-Dateien (logs, data)

### Dateistruktur nach Installation

```
standalone-launcher.exe
├── app/                    # Hauptanwendung
├── plugins/                # Plugins
├── game-engine/            # Game Engine
├── runtime/
│   └── node/              # Portable Node.js (falls installiert)
├── package.json
├── package-lock.json
└── main.js
```

## 🛠️ Für Entwickler

### Build-Anleitung

#### Windows

```bash
cd standalonelauncher
build.bat
```

#### Linux/macOS

```bash
cd standalonelauncher
chmod +x build.sh
./build.sh
```

### Build-Output

- `launcher.exe` - Windows GUI Version (für Distribution)
- `launcher-console.exe` - Windows Console Version (für Debugging)
- `launcher` - Linux Version (für Distribution)

### Entwicklung

**Voraussetzungen:**
- Go 1.21 oder höher
- Internet-Verbindung (für Go-Dependencies)

**Dependencies:**
```go
require github.com/pkg/browser v0.0.0-20240102092130-5ac0b6a4141c
```

**Kompilierung:**
```bash
# Windows GUI Version (kein Konsolenfenster)
go build -o launcher.exe -ldflags "-H windowsgui -s -w" standalone-launcher.go

# Windows Console Version (mit Konsolenfenster für Debugging)
go build -o launcher-console.exe -ldflags "-s -w" standalone-launcher.go

# Linux Version
GOOS=linux GOARCH=amd64 go build -o launcher -ldflags "-s -w" standalone-launcher.go
```

**Flags:**
- `-H windowsgui` - Versteckt Konsolenfenster (nur Windows GUI)
- `-s` - Strip Debug-Informationen
- `-w` - Strip DWARF Debug-Informationen

### Code-Struktur

```go
// Hauptkomponenten
type StandaloneLauncher struct {
    baseDir  string              // Installationsverzeichnis
    progress int                 // Fortschritt (0-100)
    status   string              // Status-Text
    clients  map[chan string]bool // SSE Clients
    logger   *log.Logger         // Logger
}

// Hauptfunktionen
- getLatestCommitSHA()      // Holt neueste Version von GitHub
- getRepositoryTree()       // Lädt Dateiliste
- filterRelevantFiles()     // Filtert relevante Dateien
- downloadRepository()      // Lädt alle Dateien herunter
- checkNodeJS()             // Prüft/Installiert Node.js
- installDependencies()     // Führt npm install aus
- startApplication()        // Startet LTTH
```

## 🎨 Splash Screen

Der Launcher zeigt einen schönen Splash Screen im Browser:

- **Design:** Gradient-Background (Lila/Blau)
- **Fortschritt:** Echtzeit-Updates via Server-Sent Events (SSE)
- **Animationen:** Float-Animation für Logo
- **Responsive:** Funktioniert auf allen Bildschirmgrößen

## 🔒 Sicherheit

- **Read-Only GitHub API** - Keine Credentials erforderlich
- **HTTPS Downloads** - Alle Downloads über HTTPS
- **Keine Ausführung externer Binaries** - Nur Node.js wird verwendet
- **Lokale Installation** - Alle Dateien im Benutzerverzeichnis

## 📝 Logging

Der Launcher loggt alle Aktionen:

```
[LTTH Standalone] 2024/02/03 14:00:00 [5%] Hole neueste Version von GitHub...
[LTTH Standalone] 2024/02/03 14:00:01 Latest commit SHA: abc123...
[LTTH Standalone] 2024/02/03 14:00:02 [10%] Lade Dateiliste...
[LTTH Standalone] 2024/02/03 14:00:03 Repository tree contains 1234 items
[LTTH Standalone] 2024/02/03 14:00:04 Filtered to 567 relevant files
...
```

## ❌ Fehlerbehandlung

Der Launcher behandelt häufige Fehler:

- **GitHub API Fehler** - Zeigt Fehlermeldung im Browser
- **Download-Fehler** - Retry-Logik für einzelne Dateien
- **Node.js Installation fehlgeschlagen** - Klare Fehlermeldung
- **npm install fehlgeschlagen** - Detaillierte Ausgabe

**Erfolgsrate:** Mindestens 90% der Dateien müssen erfolgreich heruntergeladen werden.

## 🚀 Verteilung

### Für ltth.app

1. **Build** den Launcher mit `build.bat`/`build.sh`
2. **Upload** `standalone-launcher.exe` auf ltth.app
3. **Verlinke** den Download auf der Website

**Empfohlener Download-Text:**
```
LTTH Standalone Launcher
Größe: ~6-8 MB
Lädt automatisch die neueste Version herunter
Keine Installation erforderlich
```

## 📊 Performance

- **Launcher-Größe:** ~6-8 MB
- **Erster Start:** 2-5 Minuten (je nach Internet-Geschwindigkeit)
- **Nachfolgende Starts:** 30-60 Sekunden (nur Updates)
- **Speicherverbrauch:** ~50 MB während Download

## 🆘 Troubleshooting

### Launcher startet nicht

- **Prüfe:** Windows Defender / Antivirus
- **Lösung:** Exe-Datei zur Whitelist hinzufügen

### Download schlägt fehl

- **Prüfe:** Internet-Verbindung
- **Prüfe:** Firewall blockiert Port 8765
- **Lösung:** Firewall-Regel erstellen

### Node.js Installation fehlgeschlagen

- **Prüfe:** Genug freien Speicherplatz (~500 MB)
- **Prüfe:** Schreibrechte im Verzeichnis
- **Lösung:** Launcher als Administrator ausführen

### npm install fehlgeschlagen

- **Prüfe:** Internet-Verbindung
- **Prüfe:** npm Registry erreichbar
- **Lösung:** Manuell `npm install` im `app/` Verzeichnis ausführen

## 📄 Lizenz

Dieser Standalone Launcher ist Teil von LTTH und unterliegt der gleichen Lizenz.

## 🔗 Links

- **Website:** https://ltth.app
- **GitHub:** https://github.com/Loggableim/ltth_desktop2
- **Support:** https://ltth.app/support

---

**Made with ❤️ by PupCid**
