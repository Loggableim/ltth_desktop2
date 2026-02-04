# LTTH Standalone Launcher

Der offizielle Standalone Launcher für **PupCid's Little TikTool Helper (LTTH)**.

## 📦 Was ist der Standalone Launcher?

Der Standalone Launcher ist eine **kleine, eigenständige Anwendung** (~6-8 MB), die automatisch:
- ✅ Die neueste Version von LTTH von GitHub herunterlädt (per **Release-ZIP**)
- ✅ Node.js v20 LTS installiert (falls nicht vorhanden oder zu alt)
- ✅ Alle Abhängigkeiten installiert
- ✅ Die Anwendung startet

**Vorteile:**
- 🎯 **Minimale Download-Größe** - Nur ~6-8 MB statt >100 MB
- 🔄 **Immer aktuell** - Lädt automatisch die neueste Version
- 🚀 **Einfache Verteilung** - Perfekt für ltth.app Downloads
- 💻 **Keine Installation nötig** - Einfach herunterladen und ausführen
- ⚡ **Schneller Download** - Release-ZIP statt einzelne Dateien (kein Rate Limit!)
- 🎨 **Modernes UI** - Splash Screen mit Theme-Support (Night/Day/High Contrast)

## 🎯 Verwendung

### Für Endnutzer

1. **Download:** Lade `launcher.exe` (Windows) oder `launcher` (Linux) von [ltth.app](https://ltth.app) herunter
2. **Ausführen:** Doppelklick auf die Datei (Windows) oder `./launcher` im Terminal (Linux)
3. **Warten:** Der Launcher lädt automatisch alle Dateien herunter
4. **Fertig:** Die Anwendung startet automatisch im Browser

### Was passiert beim ersten Start?

1. **Splash Screen öffnet sich** im Browser mit Fortschrittsanzeige und Theme-Support
2. **Download der Release-ZIP** von GitHub (~50-100 MB, 1 Request statt 200+)
3. **Extraktion mit Filter** - Nur relevante Dateien werden entpackt
4. **Node.js v20 LTS Prüfung** - Falls nicht vorhanden oder zu alt, wird portable Version installiert
5. **npm install** führt automatisch `npm install` aus
6. **LTTH startet** automatisch im Browser auf `http://localhost:3000`

### Bei nachfolgenden Starts

Der Launcher prüft auf Updates und lädt bei Bedarf die neue Release-ZIP herunter.

## 🔧 Technische Details

### Architektur v2.0

Der Standalone Launcher verwendet eine **zweistufige Download-Strategie**:

```
┌─────────────────────────────────────────┐
│  1. Versuche Release-ZIP Download       │
│     ├─ Hole Release-Info (1 API Call)   │
│     ├─ Lade ZIP von CDN (kein Limit)    │
│     └─ Entpacke mit Filter              │
│                                          │
│  2. Fallback: Tree/Blob Download        │
│     ├─ Hole Commit SHA (1 API Call)     │
│     ├─ Lade Tree (1 API Call)           │
│     └─ Lade Dateien einzeln (⚠️ Limit)  │
└─────────────────────────────────────────┘
```

**Warum Release-ZIP?**
- ✅ Nur 1 API Request statt 200+
- ✅ Kein GitHub Rate Limit (CDN)
- ✅ Schneller (ein großer Download)
- ✅ 100% Erfolgsrate

**Wann Fallback?**
- ❌ Kein Release vorhanden
- ⚠️ Kann bei vielen Dateien fehlschlagen (Rate Limit)

### Download-Strategie (v2.0)

**Primär: Release-ZIP Download**
1. Holt Release-Info von GitHub API (1 Request)
2. Lädt Release-ZIP von GitHub CDN herunter (kein API Limit!)
3. Entpackt nur relevante Dateien (Whitelist/Blacklist-Filter)
4. ✅ **Vorteile:** Schnell, zuverlässig, kein Rate Limit

**Fallback: Tree/Blob Download**
- Falls kein Release verfügbar ist
- Lädt Dateien einzeln über Blob API
- ⚠️ Kann bei vielen Dateien das API Limit erreichen

### Systemanforderungen

- **Betriebssystem:** Windows 10/11 (64-bit), Linux, macOS
- **Internet:** Für Download der Dateien erforderlich
- **Festplatte:** ~500 MB freier Speicherplatz
- **Port 8765:** Für Splash Screen (temporär)
- **Port 3000:** Für LTTH Anwendung
- **Node.js:** Version 20.x LTS oder höher (wird automatisch installiert)

### Was wird heruntergeladen?

Der Launcher lädt nur die relevanten Dateien herunter:

✅ **Heruntergeladen:**
- `app/` - Hauptanwendung
- `plugins/` - Plugin-System
- `game-engine/` - Spiel-Engine
- `package.json` - Dependencies
- `package-lock.json` - Locked Dependencies

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
└── package-lock.json
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

// Release API Strukturen (v2.0)
type GitHubRelease struct {
    TagName     string
    Name        string
    ZipballURL  string
    TarballURL  string
    Assets      []GitHubReleaseAsset
    PublishedAt string
}

// Hauptfunktionen (v2.0)
- downloadFromRelease()        // Release-ZIP Download (primär)
- getLatestRelease()           // Holt Release-Info von GitHub
- downloadZipWithProgress()    // Lädt ZIP mit Fortschrittsanzeige
- extractReleaseZip()          // Entpackt ZIP mit Pfad-Filterung
- isRelevantPath()             // Prüft Whitelist/Blacklist
- checkNodeJSVersion()         // Prüft Node.js Version (min. v20)
- downloadRepository()         // Fallback auf Tree/Blob
- checkNodeJS()                // Prüft/Installiert Node.js
- installDependencies()        // Führt npm install aus
- startApplication()           // Startet LTTH
```

## 🎨 Splash Screen (v2.0)

Der Launcher zeigt einen schönen Splash Screen im Browser:

- **Design:** Gradient-Background (Lila/Blau) - Match mit Hauptlauncher
- **Logo:** Embedded Base64 Mini-Logo, später echte LTTH Logos
- **Themes:** 3 Modi verfügbar:
  - 🌙 **Night Mode** (Standard) - Dunkler Hintergrund
  - ☀️ **Day Mode** - Heller Hintergrund
  - ⚫ **High Contrast** - Schwarzer Hintergrund, maximaler Kontrast
- **Theme-Toggle:** Button oben rechts zum Wechseln (speichert in localStorage)
- **Fortschritt:** Echtzeit-Updates via Server-Sent Events (SSE)
- **Animationen:** Float-Animation für Logo
- **Responsive:** Funktioniert auf allen Bildschirmgrößen
- **Logo-Update:** Nach Download (70%) werden echte Logo-Dateien verwendet

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

- **Ursache 1:** Kein GitHub Release verfügbar
- **Lösung:** Launcher verwendet automatisch Fallback-Methode
- **Ursache 2:** Internet-Verbindung unterbrochen
- **Lösung:** Internet-Verbindung prüfen und neu starten

### "Zu viele Download-Fehler" (bei Fallback-Methode)

- **Ursache:** GitHub API Rate Limit erreicht (60 Requests/Stunde)
- **Lösung 1:** 1 Stunde warten und erneut versuchen
- **Lösung 2:** Repository-Owner sollte ein GitHub Release erstellen
- **Hinweis:** Release-Methode hat kein Rate Limit!

### Node.js Installation fehlgeschlagen

- **Prüfe:** Genug freien Speicherplatz (~500 MB)
- **Prüfe:** Schreibrechte im Verzeichnis
- **Prüfe:** Node.js Version (min. v20.x erforderlich)
- **Lösung:** Launcher als Administrator ausführen

### npm install fehlgeschlagen

- **Prüfe:** Internet-Verbindung
- **Prüfe:** npm Registry erreichbar
- **Lösung:** Manuell `npm install` im `app/` Verzeichnis ausführen

### Alte Node.js Version wird nicht aktualisiert

- **Ursache:** Globale Node.js Installation ist älter als v20
- **Lösung:** Launcher installiert portable v20 LTS automatisch

## 📄 Lizenz

Dieser Standalone Launcher ist Teil von LTTH und unterliegt der gleichen Lizenz.

## 🔗 Links

- **Website:** https://ltth.app
- **GitHub:** https://github.com/Loggableim/ltth_desktop2
- **Support:** https://ltth.app/support

---

**Made with ❤️ by PupCid**
