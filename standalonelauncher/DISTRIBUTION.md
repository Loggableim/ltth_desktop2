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
- `standalone-launcher.exe` (GUI Version) - **Dieses verteilen!**
- `standalone-launcher-console.exe` (Debug Version) - Nur für Testing

**Größe:** ~8-9 MB

### 3. Upload auf ltth.app

1. **Datei umbenennen (optional):**
   ```
   standalone-launcher.exe → LTTH-Standalone.exe
   ```

2. **Upload auf Server/CDN**

3. **Download-Link erstellen:**
   ```html
   <a href="/downloads/LTTH-Standalone.exe" download>
     Download LTTH Standalone Launcher (8.8 MB)
   </a>
   ```

## 📝 Website-Integration

### Download-Seite Text

```markdown
# LTTH Standalone Launcher

Der offizielle Standalone Launcher lädt automatisch die neueste Version von LTTH herunter.

## Features
✅ Minimale Download-Größe (nur 8.8 MB)
✅ Automatische Updates
✅ Node.js Installation inklusive
✅ Keine manuelle Installation nötig

## Download
[Download LTTH Standalone (8.8 MB)](link-zur-exe)

## So funktioniert's
1. Laden Sie den Launcher herunter
2. Führen Sie die EXE-Datei aus
3. Warten Sie, während der Launcher alles einrichtet
4. LTTH startet automatisch im Browser

## Systemanforderungen
- Windows 10/11 (64-bit)
- Internet-Verbindung
- ~500 MB freier Speicherplatz
```

### FAQ für Website

**F: Warum ist der Download so klein?**
A: Der Launcher ist nur 8.8 MB groß und lädt alle benötigten Dateien beim ersten Start automatisch herunter.

**F: Brauche ich Node.js?**
A: Nein, der Launcher installiert automatisch eine portable Version von Node.js.

**F: Wie lange dauert der erste Start?**
A: Der erste Start dauert 2-5 Minuten, da alle Dateien heruntergeladen werden (~150 MB).

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
   signtool sign /f certificate.pfx /p password /t http://timestamp.digicert.com standalone-launcher.exe
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
- `standalone-launcher-console.exe`
- Zeigt alle Logs im Terminal
- Gut für Troubleshooting

## 📞 Kontakt

Bei Fragen zur Distribution:
- GitHub: https://github.com/Loggableim/ltth_desktop2
- Website: https://ltth.app

---

**Viel Erfolg bei der Distribution! 🎉**
