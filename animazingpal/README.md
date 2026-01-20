# AnimazingPal Plugin

Integration mit der Animaze Desktop API für VTuber Avatar-Steuerung über TikTok LIVE Events.

## 📋 Übersicht

Dieses Plugin verbindet PupCid's Little TikTool Helper mit der Animaze Desktop Anwendung über die WebSocket API. Damit können TikTok LIVE Events (Geschenke, Follows, Chat, etc.) automatisch Animationen, Emotes und ChatPal-Nachrichten in deinem VTuber Avatar auslösen.

## ✨ Features

- **WebSocket-Verbindung** zu Animaze (Standard: `ws://localhost:9000`)
- **TikTok Events → Animaze Aktionen**:
  - Geschenke → Emotes, Spezialaktionen, Posen, Idle-Animationen
  - Follows → Avatar-Reaktionen
  - Shares → Dankesnachrichten
  - Subscribes → Spezielle Animationen
  - Likes → Reaktionen bei vielen Likes
- **ChatPal Integration**:
  - TikTok Chat an ChatPal weiterleiten
  - KI-Antworten oder nur TTS (Echo-Modus)
- **Gift Mappings**: Verknüpfe spezifische Geschenke mit spezifischen Aktionen
- **Admin UI**: Vollständige Konfigurationsoberfläche

## 🧠 Brain Engine - KI-Intelligenz System

Die Brain Engine ist ein fortschrittliches KI-System, das deinen VTuber Avatar wie einen echten Livestreamer denken und reagieren lässt.

### Architektur-Konzept

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Datenbank     │ ←── │  Vector Memory   │ ──→ │    GPT Brain    │
│ (Nervensystem)  │     │    (Synapsen)    │     │(Großhirnrinde)  │
│                 │     │                  │     │                 │
│ • Erinnerungen  │     │ • Semantische    │     │ • Reasoning     │
│ • User-Profile  │     │   Verknüpfungen  │     │ • Generierung   │
│ • Archiv        │     │ • Ähnlichkeits-  │     │ • Persönlichkeit│
└────────┬────────┘     │   suche          │     └────────┬────────┘
         │              └──────────────────┘              │
         │                                                │
         └──────────────────┬─────────────────────────────┘
                            ▼
                    ┌───────────────┐
                    │    Animaze    │
                    │  (Körper &    │
                    │    Stimme)    │
                    └───────────────┘
```

### Features der Brain Engine

- **🧠 Langzeit-Gedächtnis**: Speichert Interaktionen mit Zuschauern dauerhaft
- **👥 User-Profile**: Merkt sich jeden Zuschauer und seine Gewohnheiten
- **🔗 Semantische Verknüpfungen**: Findet zusammenhängende Erinnerungen durch Vektoren
- **🎭 Persönlichkeiten**: Wählbare Streamer-Persönlichkeiten
- **📚 Archiv-System**: Komprimiert und speichert alte Erinnerungen
- **💬 Intelligente Antworten**: GPT-basierte kontextuelle Reaktionen
- **⚡ Effizient**: Optimiert für GPT-5 Nano / GPT-4o-mini

### Persönlichkeiten

Wähle aus vordefinierten Persönlichkeiten oder erstelle eigene:

| Persönlichkeit | Beschreibung |
|----------------|--------------|
| **Freundlicher Streamer** | Warmherzig, enthusiastisch, begrüßt jeden herzlich |
| **Gaming Pro** | Kompetitiv, analytisch, trockener Humor |
| **Entertainer** | Charismatisch, witzig, energetisch |
| **Chill Vibes** | Entspannt, ruhig, tiefgründig |
| **Anime Fan** | Enthusiastisch, verwendet japanische Ausdrücke |

### Konfiguration Brain Engine

```javascript
brain: {
  enabled: false,              // Brain aktivieren
  openaiApiKey: "sk-...",      // OpenAI API Key
  model: "gpt-4o-mini",        // Empfohlen für Effizienz
  activePersonality: null,     // Aktive Persönlichkeit
  
  // Memory-Einstellungen
  memoryImportanceThreshold: 0.3,
  maxContextMemories: 10,
  archiveAfterDays: 7,
  pruneAfterDays: 30,
  
  // Auto-Response
  autoRespond: {
    chat: false,               // Auf Chat antworten
    gifts: true,               // Für Geschenke danken
    follows: true,             // Neue Follower begrüßen
    shares: false              // Für Shares danken
  },
  
  // Rate Limiting
  maxResponsesPerMinute: 10,
  chatResponseProbability: 0.3  // 30% der Chats beantworten
}
```

### Brain API Endpoints

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/api/animazingpal/brain/status` | Brain-Status und Statistiken |
| POST | `/api/animazingpal/brain/config` | Brain konfigurieren |
| POST | `/api/animazingpal/brain/test` | GPT-Verbindung testen |
| GET | `/api/animazingpal/brain/personalities` | Alle Persönlichkeiten |
| POST | `/api/animazingpal/brain/personality/set` | Persönlichkeit aktivieren |
| POST | `/api/animazingpal/brain/personality/create` | Neue Persönlichkeit |
| GET | `/api/animazingpal/brain/memories/search` | Erinnerungen suchen |
| GET | `/api/animazingpal/brain/user/:username` | User-Profil abrufen |
| POST | `/api/animazingpal/brain/chat` | Manuell Chat-Antwort |
| POST | `/api/animazingpal/brain/archive` | Alte Erinnerungen archivieren |

## 🚀 Setup

### Voraussetzungen

1. **Animaze Desktop** muss installiert und geöffnet sein
2. **Animaze API aktivieren**: Gehe in Animaze zu `Settings > Animaze API > Enabled`
3. Der Standard-Port ist `9000` (kann in Animaze geändert werden)
4. **Für Brain Engine**: OpenAI API Key

### Plugin aktivieren

1. Aktiviere das AnimazingPal Plugin in den Plugin-Einstellungen
2. Öffne die Plugin-UI über die Admin-Oberfläche
3. Klicke auf "Verbinden" um die Verbindung zu Animaze herzustellen
4. Bei erfolgreicher Verbindung werden automatisch alle verfügbaren Avatare, Emotes, etc. geladen

### Brain Engine aktivieren

1. Gehe zu den Brain-Einstellungen in der Plugin-UI
2. Trage deinen OpenAI API Key ein
3. Wähle eine Persönlichkeit aus
4. Aktiviere die gewünschten Auto-Response Optionen
5. Teste die Verbindung

## ⚙️ Konfiguration

### Verbindungseinstellungen

| Einstellung | Standard | Beschreibung |
|------------|----------|--------------|
| Host | `127.0.0.1` | IP-Adresse von Animaze |
| Port | `9000` | WebSocket Port |
| Automatisch verbinden | ✅ | Verbinde automatisch beim Start |
| Automatisch neu verbinden | ✅ | Versuche bei Verbindungsabbruch neu zu verbinden |

## 🆕 Neue Features (Enhanced)

### Batch Processing
Sammelt mehrere TikTok Events (Likes, Geschenke, Follows) in einem Zeitfenster und verarbeitet sie zusammen für natürlicheren Sprachfluss.

**Konfiguration:**
```javascript
outbox: {
  windowSeconds: 8,    // Zeitfenster zum Sammeln
  maxItems: 8,         // Max. Anzahl Items pro Batch
  maxChars: 320,       // Max. Zeichenlänge
  separator: ' • '     // Trennzeichen zwischen Items
}
```

### Relevance Detection
Intelligente Bewertung von Chat-Nachrichten, um zu entscheiden, ob eine Antwort sinnvoll ist.

**Features:**
- Erkennt Fragen (mit Keywords wie "warum", "wie", "was")
- Erkennt Grüße und Dankesnachrichten
- Ignoriert Spam, Commands und URLs
- Score-basierte Relevanz-Bewertung (0-1)

**Konfiguration:**
```javascript
relevance: {
  minLength: 3,                  // Mindestlänge für Messages
  replyThreshold: 0.6,           // Schwellwert für Antworten
  respondToGreetings: true,      // Auf Grüße antworten
  respondToThanks: true,         // Auf Danke antworten
  greetingCooldown: 360          // Cooldown für Grüße (Sekunden)
}
```

### Event Deduplication
Verhindert die doppelte Verarbeitung identischer Events.

**Features:**
- TTL-basierte Deduplication (Standard: 600 Sekunden)
- Automatische Cleanup von abgelaufenen Einträgen
- Signature-basierte Event-Identifikation

### Speech & Mic State Tracking
Verfolgt, ob der Avatar gerade spricht oder das Mikrofon aktiv ist, um Unterbrechungen zu vermeiden.

**Features:**
- Event-basierte State-Verwaltung
- Automatische Batch-Pause während Speech/Mic aktiv ist
- Duration-Tracking für Analytics

### Memory Decay
Alte Erinnerungen verlieren automatisch an Wichtigkeit.

**Konfiguration:**
```javascript
brain: {
  decayDays: 90,        // Nach wie vielen Tagen Decay beginnt
  pruneAfterDays: 30,   // Wann alte Memories gelöscht werden
  archiveAfterDays: 7   // Wann Memories archiviert werden
}
```

**Wie es funktioniert:**
- Memories mit wenig Zugriff verlieren schneller an Wichtigkeit
- Memories unter Threshold werden automatisch gelöscht
- Inactive User Profiles werden nach 180 Tagen aufgeräumt

### Response Engine
GPT-powered Antwort-Generierung mit Caching für Effizienz.

**Features:**
- Kontextuelle Antworten basierend auf User-Historie
- Quick Acknowledgments für Grüße/Danke/Geschenke
- Response Caching (5 Minuten TTL)
- Automatische Antwort-Längen-Begrenzung (max 18 Wörter)

## 📊 Neue API Endpoints

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/api/animazingpal/activity` | Speech/Mic/Batcher Status |
| POST | `/api/animazingpal/batch/flush` | Manuelles Flush der Batch Queue |
| GET | `/api/animazingpal/relevance/test` | Teste Relevance Score eines Textes |
| POST | `/api/animazingpal/memory/decay` | Trigger Memory Decay manuell |
| GET | `/api/animazingpal/memory/stats` | Erweiterte Memory Statistiken |

### Activity State Endpoint
```javascript
GET /api/animazingpal/activity

Response:
{
  isSpeaking: false,
  isMicActive: false,
  speechDuration: 0,
  timeSinceMicChange: 15234,
  batcherSize: 3,
  batcherHasHolds: false
}
```

### Relevance Test Endpoint
```javascript
POST /api/animazingpal/relevance/test
Body: { text: "Warum ist der Himmel blau?" }

Response:
{
  shouldRespond: true,
  score: 0.85,
  reason: "relevant",
  isGreeting: false,
  isThanks: false
}
```

## ⚙️ Konfiguration (Fortsetzung)

### Gift Mappings

### Event Aktionen

Für jedes TikTok Event (Follow, Share, Subscribe, Like) kannst du konfigurieren:

- **Aktionstyp**: Emote, Spezialaktion, Pose, Idle Animation
- **Aktion**: Die spezifische Animation aus Animaze
- **ChatPal Nachricht**: Optional eine Nachricht, die der Avatar spricht

**Platzhalter für Nachrichten:**
- `{username}` - TikTok Username
- `{nickname}` - TikTok Nickname
- `{giftName}` - Name des Geschenks
- `{count}` - Anzahl der Geschenke

### Gift Mappings

Erstelle Verknüpfungen zwischen TikTok Geschenken und Animaze Aktionen:

```json
{
  "giftId": 5655,
  "giftName": "Rose",
  "actionType": "emote",
  "actionValue": "Emote_Happy",
  "chatMessage": "Danke für die Rose, {username}!"
}
```

### Chat zu Avatar

Wenn aktiviert, werden TikTok Chat-Nachrichten an ChatPal weitergeleitet:

- **Nur TTS**: Avatar spricht die Nachricht ohne KI-Antwort
- **Mit KI**: ChatPal verarbeitet die Nachricht und antwortet intelligent
- **Prefix**: Optionaler Text vor jeder Nachricht (z.B. "[TikTok]")
- **Max. Länge**: Maximale Zeichenanzahl pro Nachricht

## 🔌 API Endpoints

### Status & Verbindung

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/api/animazingpal/status` | Plugin-Status abrufen |
| POST | `/api/animazingpal/connect` | Zu Animaze verbinden |
| POST | `/api/animazingpal/disconnect` | Verbindung trennen |
| POST | `/api/animazingpal/refresh` | Animaze-Daten aktualisieren |
| POST | `/api/animazingpal/test` | Verbindung testen |

### Animaze Aktionen

| Methode | Endpoint | Body | Beschreibung |
|---------|----------|------|--------------|
| GET | `/api/animazingpal/avatars` | - | Verfügbare Avatare |
| POST | `/api/animazingpal/avatar/load` | `{name}` | Avatar laden |
| GET | `/api/animazingpal/emotes` | - | Verfügbare Emotes |
| POST | `/api/animazingpal/emote` | `{itemName}` | Emote auslösen |
| GET | `/api/animazingpal/special-actions` | - | Spezialaktionen |
| POST | `/api/animazingpal/special-action` | `{index}` | Spezialaktion auslösen |
| GET | `/api/animazingpal/poses` | - | Verfügbare Posen |
| POST | `/api/animazingpal/pose` | `{index}` | Pose auslösen |
| GET | `/api/animazingpal/idles` | - | Idle Animationen |
| POST | `/api/animazingpal/idle` | `{index}` | Idle Animation auslösen |
| POST | `/api/animazingpal/chatpal` | `{message, useEcho}` | ChatPal Nachricht |
| POST | `/api/animazingpal/calibrate` | - | Tracker kalibrieren |
| POST | `/api/animazingpal/broadcast` | `{toggle}` | Virtual Camera ein/aus |

### Konfiguration

| Methode | Endpoint | Beschreibung |
|---------|----------|--------------|
| GET | `/api/animazingpal/config` | Konfiguration abrufen |
| POST | `/api/animazingpal/config` | Konfiguration aktualisieren |
| GET | `/api/animazingpal/gift-mappings` | Gift Mappings abrufen |
| POST | `/api/animazingpal/gift-mappings` | Gift Mappings aktualisieren |

## 🔊 Socket.IO Events

### Empfangen

| Event | Beschreibung |
|-------|--------------|
| `animazingpal:status` | Status-Update |
| `animazingpal:data-refreshed` | Neue Animaze-Daten |
| `animazingpal:speech-start` | ChatPal beginnt zu sprechen |
| `animazingpal:speech-end` | ChatPal hat fertig gesprochen |
| `animazingpal:avatar-changed` | Avatar wurde gewechselt |
| `animazingpal:chatpal-response` | ChatPal KI-Antwort |
| `animazingpal:emote-triggered` | Emote wurde ausgelöst |
| `animazingpal:gift-handled` | Gift wurde verarbeitet |
| `animazingpal:brain-response` | Brain Engine Antwort |

### Senden

| Event | Daten | Beschreibung |
|-------|-------|--------------|
| `animazingpal:get-status` | - | Status anfordern |
| `animazingpal:connect` | - | Verbinden |
| `animazingpal:disconnect` | - | Trennen |
| `animazingpal:refresh` | - | Daten aktualisieren |
| `animazingpal:emote` | `{itemName}` | Emote auslösen |
| `animazingpal:chatpal` | `{message, useEcho}` | ChatPal Nachricht |

## 📚 Animaze API Referenz

Dieses Plugin nutzt die offizielle Animaze WebSocket API. Die vollständige Dokumentation findest du in `docs/HD-Animaze API-191225-203810.pdf`.

### Wichtige Animaze Aktionen

| Aktion | Beschreibung |
|--------|--------------|
| `LoadAvatar` | Avatar laden |
| `LoadScene` | Szene laden |
| `TriggerEmote` | Emote auslösen |
| `TriggerSpecialAction` | Spezialaktion auslösen |
| `TriggerPose` | Pose einnehmen |
| `TriggerIdle` | Idle Animation starten |
| `ChatbotSendMessage` | ChatPal Nachricht |
| `CalibrateTracker` | Tracker kalibrieren |
| `Broadcast` | Virtual Camera ein/aus |

## 🐛 Troubleshooting

### Verbindung schlägt fehl

1. Stelle sicher, dass Animaze geöffnet ist
2. Prüfe ob die API aktiviert ist: `Settings > Animaze API > Enabled`
3. Prüfe den Port in Animaze und im Plugin
4. Firewall-Einstellungen prüfen

### Emotes werden nicht ausgelöst

1. Stelle sicher, dass ein Avatar geladen ist
2. Aktualisiere die Animaze-Daten (🔄 Button)
3. Prüfe ob das Emote zum aktuellen Avatar gehört

### ChatPal antwortet nicht

1. Stelle sicher, dass ChatPal in Animaze konfiguriert ist
2. Prüfe die OpenAI API-Einstellungen in Animaze
3. Nutze den Echo-Modus für reines TTS ohne KI

### Brain Engine funktioniert nicht

1. Prüfe ob der OpenAI API Key gültig ist
2. Teste die Verbindung mit dem Test-Button
3. Prüfe ob eine Persönlichkeit ausgewählt ist
4. Überprüfe die Rate-Limits

## 📝 Changelog

### Version 1.1.0
- **NEU**: Brain Engine - KI-Intelligenz System
  - Langzeit-Gedächtnis mit Vektoren-basierter semantischer Suche
  - User-Profile und Beziehungs-Tracking
  - Wählbare Streamer-Persönlichkeiten
  - GPT-basierte intelligente Antworten
  - Archiv-System für alte Erinnerungen
- Verbesserte Event-Handler mit Brain-Integration

### Version 1.0.0
- Initiale Veröffentlichung
- WebSocket-Verbindung zu Animaze
- TikTok Event Integration
- ChatPal Integration
- Admin UI
- Gift Mappings

## 📜 Lizenz

Dieses Plugin ist Teil von PupCid's Little TikTool Helper und unterliegt der CC-BY-NC-4.0 Lizenz.
