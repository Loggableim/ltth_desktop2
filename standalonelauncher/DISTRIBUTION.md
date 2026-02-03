# Distribution Guide für LTTH Standalone Launcher

## 📦 Vorbereitung für ltth.app

### 1. Build des Launchers

**Windows:**
```bash
cd standalonelauncher
build.bat
```

**Linux/macOS:**
```bash
cd standalonelauncher
chmod +x build.sh
./build.sh
```

### 2. Dateien für Distribution

Nach dem Build erhältst du:
- `launcher.exe` (Windows GUI Version) - **Für Windows-Nutzer!**
- `launcher` (Linux Version) - **Für Linux-Nutzer!**
- `launcher-console.exe` (Windows Debug Version) - Nur für Testing

**Größe:** ~8.5-8.8 MB

### 3. Upload auf ltth.app

1. **Dateien vorbereiten:**
   - Windows: `launcher.exe` (8.8 MB)
   - Linux: `launcher` (8.5 MB)

2. **Upload auf Server/CDN**

3. **Download-Links erstellen:**
   ```html
   <a href="/downloads/launcher.exe" download>
     Download LTTH Launcher - Windows (8.8 MB)
   </a>
   <a href="/downloads/launcher" download>
     Download LTTH Launcher - Linux (8.5 MB)
   </a>
   ```

## 📝 Website-Integration

### Download-Seite Text

```markdown
# LTTH Standalone Launcher

Der offizielle Standalone Launcher lädt automatisch die neueste Version von LTTH herunter.

## Features
✅ Minimale Download-Größe (nur ~8.5-8.8 MB)
✅ Automatische Updates
✅ Node.js Installation inklusive
✅ Keine manuelle Installation nötig
✅ Für Windows und Linux verfügbar

## Download
[Download LTTH Launcher - Windows (8.8 MB)](link-zur-exe)
[Download LTTH Launcher - Linux (8.5 MB)](link-zum-launcher)

## So funktioniert's
1. Laden Sie den Launcher herunter
2. Windows: Führen Sie launcher.exe aus / Linux: `chmod +x launcher && ./launcher`
3. Warten Sie, während der Launcher alles einrichtet (~27-30 MB Download)
4. LTTH startet automatisch im Browser

## Systemanforderungen
- **Windows:** Windows 10/11 (64-bit)
- **Linux:** Ubuntu 20.04+ oder äquivalent (64-bit)
- Internet-Verbindung
- ~200 MB freier Speicherplatz (reduziert von ~500 MB)
```

### FAQ für Website

**F: Warum ist der Download so klein?**
A: Der Launcher ist nur 8.8 MB groß und lädt alle benötigten Dateien beim ersten Start automatisch herunter.

**F: Brauche ich Node.js?**
A: Nein, der Launcher installiert automatisch eine portable Version von Node.js.

**F: Wie lange dauert der erste Start?**
A: Der erste Start dauert 1-3 Minuten, da alle Dateien heruntergeladen werden (~27-30 MB).

**F: Gibt es Updates?**
A: Ja, der Launcher lädt automatisch die neueste Version von GitHub.

**F: Ist es sicher?**
A: Ja, der Launcher lädt nur von der offiziellen GitHub-Quelle herunter und ist open source.

## 🔒 Sicherheit

### Code Signing (Optional, aber empfohlen)

Für bessere Vertrauenswürdigkeit kannst du die EXE signieren:

1. **Zertifikat besorgen** (z.B. von DigiCert, Sectigo)
2. **Signieren mit signtool:**
   ```bash
   signtool sign /f certificate.pfx /p password /t http://timestamp.digicert.com launcher.exe
   ```

### Virus-Scanner

Manche Antivirus-Programme markieren unsignierte EXE-Dateien. Empfehlung:

1. **Code signieren** (siehe oben)
2. **Bei VirusTotal hochladen** für Reputation
3. **False-Positive Meldung** bei Antivirus-Herstellern einreichen

## 📊 Analytics (Optional)

Du kannst Download-Statistiken tracken:

```javascript
// Google Analytics Event
gtag('event', 'download', {
  'event_category': 'Launcher',
  'event_label': 'Standalone Launcher',
  'value': 1
});
```

## 🔄 Updates

### Launcher-Updates

Wenn du den Launcher selbst aktualisieren möchtest:

1. **Neue Features hinzufügen** in `standalone-launcher.go`
2. **Version erhöhen** in `splash.html`:
   ```html
   Version: "1.1.0"
   ```
3. **Neu builden** mit `build.bat`/`build.sh`
4. **Auf ltth.app hochladen**

### App-Updates

Die App selbst wird automatisch aktualisiert, da der Launcher immer die neueste Version von GitHub lädt.

## 🎨 Branding

### Launcher-Texte anpassen

In `standalone-launcher.go`:
```go
fmt.Println("================================================")
fmt.Println("  LTTH Standalone Launcher")
fmt.Println("  https://ltth.app")
fmt.Println("================================================")
```

### Splash Screen anpassen

In `assets/splash.html`:
- Logo-Emoji ändern (Zeile 32): `<div class="logo">🐕</div>`
- Farben ändern (Zeile 16): `background: linear-gradient(...)`
- Texte übersetzen

## 📈 Monitoring

### Log-Dateien

Der Launcher loggt alle Aktionen:
- Console-Output für Debugging
- Fehler werden im Browser angezeigt

### Error Tracking

Du kannst Error-Tracking hinzufügen:

```go
// In sendError():
// POST error to your logging service
http.Post("https://ltth.app/api/launcher-errors", ...)
```

## 🚀 Release Checklist

- [ ] Launcher gebaut mit `build.bat`/`build.sh`
- [ ] Datei-Größe geprüft (~8-9 MB)
- [ ] Windows-Kompatibilität geprüft
- [ ] Code signiert (optional)
- [ ] Auf ltth.app hochgeladen
- [ ] Download-Link auf Website aktualisiert
- [ ] Social Media Ankündigung
- [ ] Release Notes erstellt

## 🆘 Support

### Häufige Probleme

1. **"Windows hat den PC geschützt"**
   - Ursache: Unsignierte EXE
   - Lösung: "Weitere Informationen" → "Trotzdem ausführen"

2. **Antivirus blockiert Download**
   - Ursache: False-Positive
   - Lösung: Zur Whitelist hinzufügen

3. **Download schlägt fehl**
   - Ursache: GitHub API Rate Limit oder Netzwerk
   - Lösung: Später erneut versuchen

### Debug-Version

Für Support-Zwecke kannst du auch die Console-Version bereitstellen:
- `launcher-console.exe` (Windows)
- Zeigt alle Logs im Terminal
- Gut für Troubleshooting

## 📞 Kontakt

Bei Fragen zur Distribution:
- GitHub: https://github.com/Loggableim/ltth_desktop2
- Website: https://ltth.app

---

**Viel Erfolg bei der Distribution! 🎉**
