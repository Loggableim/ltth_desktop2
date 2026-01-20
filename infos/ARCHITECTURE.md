# Architecture

**PupCid's Little TikTool Helper (LTTH)**  
**Version:** 1.2.2  
**Last Updated:** 2026-01-20

---

## 📑 Table of Contents

1. [System Overview](#system-overview)
2. [Architecture Diagram](#architecture-diagram)
3. [Directory Structure](#directory-structure)
4. [Backend Modules](#backend-modules)
5. [Frontend Components](#frontend-components)
6. [Plugin System](#plugin-system)
7. [Data Flow](#data-flow)
8. [Database Schema](#database-schema)
9. [External Integrations](#external-integrations)
10. [Performance & Scaling](#performance--scaling)

---

## 🏗️ System Overview

**PupCid's Little TikTool Helper** is an **Event-Driven Microservice Architecture** based on Node.js, Express, and Socket.IO.

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                     FRONTEND LAYER                          │
│  ┌──────────────┬──────────────┐                            │
│  │  Dashboard   │ OBS Overlay  │                            │
│  │ (Bootstrap)  │ (Transparent)│                            │
│  └──────┬───────┴──────┬───────┘                            │
│         │              │                                    │
│         └──────────────┴──────────────────┐                 │
│                        │                                    │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │          REAL-TIME LAYER (Socket.io)                │   │
│  │   WebSocket Events, Pub/Sub, Broadcast              │   │
│  └─────────────────────┬───────────────────────────────┘   │
└────────────────────────┼────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────┐
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           EXPRESS REST API LAYER                    │   │
│  │   Routes, Middleware, Error Handling                │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                    │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              BUSINESS LOGIC LAYER                   │   │
│  │  ┌──────────┬──────────┬──────────┬──────────────┐ │   │
│  │  │ Database │ TikTok   │ Alerts   │ Flows        │ │   │
│  │  │ Manager  │ Connector│ Manager  │ Engine       │ │   │
│  │  └──────────┴──────────┴──────────┴──────────────┘ │   │
│  │  ┌──────────┬──────────┬──────────┬──────────────┐ │   │
│  │  │ Goals    │ TTS      │ Soundbrd │ Leaderboard  │ │   │
│  │  └──────────┴──────────┴──────────┴──────────────┘ │   │
│  └─────────────────────┬───────────────────────────────┘   │
│                        │                                    │
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │           PLUGIN SYSTEM LAYER                       │   │
│  │   Plugin Loader, Plugin API, Hot-Loading            │   │
│  │   ┌───────┬────────┬─────────┬──────────────────┐  │   │
│  │   │ TTS   │ Multi- │ OSC     │ VDO.Ninja        │  │   │
│  │   │ Plugin│ Cam    │ Bridge  │ Plugin           │  │   │
│  │   └───────┴────────┴─────────┴──────────────────┘  │   │
│  └─────────────────────┬───────────────────────────────┘   │
└────────────────────────┼────────────────────────────────────┘
                         │
┌────────────────────────┼────────────────────────────────────┐
│                        ▼                                    │
│  ┌─────────────────────────────────────────────────────┐   │
│  │            DATA PERSISTENCE LAYER                   │   │
│  │   SQLite (WAL Mode), File System, IndexedDB         │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### Technology Decisions

| Component | Technology | Reasoning |
|-----------|------------|-----------|
| **Runtime** | Node.js 18-23 | Async I/O, large ecosystem, cross-platform |
| **Web Framework** | Express 4 | Lightweight, flexible, large community |
| **Real-time** | Socket.IO 4 | WebSocket + fallbacks, room support |
| **Database** | SQLite (better-sqlite3) | Embedded, no external DB, WAL mode for performance |
| **TikTok Integration** | tiktok-live-connector | Community library, stable, actively maintained |
| **OBS Integration** | obs-websocket-js 5 | Official client, OBS WebSocket v5 |
| **OSC Protocol** | osc 2.4 | VRChat standard, stable |
| **Logging** | winston 3 | Flexible, rotating files, multiple transports |

---

## 📊 Architecture Diagram

### High-Level Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                      EXTERNAL SERVICES                        │
│  ┌──────────┬──────────────┬──────────────┬───────────────┐ │
│  │ TikTok   │ OBS Studio   │ VRChat       │ MyInstants    │ │
│  │ LIVE API │ WebSocket v5 │ OSC Protocol │ Sound Library │ │
│  └────┬─────┴──────┬───────┴──────┬───────┴──────┬────────┘ │
└───────┼────────────┼──────────────┼──────────────┼───────────┘
        │            │              │              │
        ▼            ▼              ▼              ▼
┌───────────────────────────────────────────────────────────────┐
│                    INTEGRATION LAYER                          │
│  ┌──────────┬──────────────┬──────────────┬───────────────┐  │
│  │ modules/ │ modules/     │ plugins/     │ modules/      │  │
│  │ tiktok.js│ obs-         │ osc-bridge/  │ soundboard.js │  │
│  │          │ websocket.js │ main.js      │               │  │
│  └────┬─────┴──────┬───────┴──────┬───────┴──────┬────────┘  │
└───────┼────────────┼──────────────┼──────────────┼────────────┘
        │            │              │              │
        └────────────┴──────────────┴──────────────┘
                             │
                             ▼
         ┌───────────────────────────────────────┐
         │       EVENT BUS (server.js)           │
         │  ┌─────────────────────────────────┐  │
         │  │ TikTok Event Emitter            │  │
         │  │ • gift, chat, follow, etc.      │  │
         │  └─────────────────────────────────┘  │
         │  ┌─────────────────────────────────┐  │
         │  │ Socket.io Event Broker          │  │
         │  │ • Rooms, Broadcast, Pub/Sub     │  │
         │  └─────────────────────────────────┘  │
         └───────────────────┬───────────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
    ┌─────────┐      ┌─────────────┐     ┌──────────────┐
    │ Clients │      │ Plugins     │     │ Core Modules │
    │ (Front) │      │ (subscribe) │     │ (subscribe)  │
    └─────────┘      └─────────────┘     └──────────────┘
```

### Request Flow Example (Gift Event)

```
1. TikTok LIVE Stream
   │
   ▼
2. TikTok Connector (modules/tiktok.js)
   │ - Receives gift event via tiktok-live-connector
   │ - Parses event data
   │
   ▼
3. Event Emitter (server.js)
   │ - Emit 'tiktok:gift' event
   │
   ▼
4. Event Listeners
   ├─► Flow Engine (modules/flows.js)
   │   │ - Check trigger conditions
   │   │ - Execute actions (TTS, Alert, OSC)
   │
   ├─► Alert Manager (modules/alerts.js)
   │   │ - Create alert object
   │   │ - Emit 'alert:new' Socket.IO event
   │
   ├─► Goal Manager (modules/goals.js)
   │   │ - Increment coins goal
   │   │ - Emit 'goal:update' Socket.IO event
   │
   ├─► Soundboard (plugins/soundboard/)
   │   │ - Map gift to sound
   │   │ - Emit 'soundboard:play' Socket.IO event
   │
   ├─► Leaderboard (modules/leaderboard.js)
   │   │ - Update top gifters
   │   │ - Emit 'topboard:update' Socket.IO event
   │
   └─► Custom Plugins (plugins/*/main.js)
       │ - Registered TikTok event callbacks
       │
       ▼
5. Socket.IO Broadcast
   │ - Send events to all connected clients
   │
   ▼
6. Frontend (public/dashboard.html, public/overlay.html)
   │ - Receive Socket.IO events
   │ - Render alerts, update goals, etc.
```

---

## 📁 Directory Structure

```
ltth_desktop2/
│
├── app/                          # Main Node.js application
│   ├── server.js                # Main server (1500+ LOC)
│   │                            # Express app, Socket.IO, event bus
│   │
│   ├── launch.js                # Platform-agnostic launcher
│   ├── package.json             # NPM dependencies & scripts
│   │
│   ├── modules/                 # Backend modules (10,000+ LOC)
│   │   ├── database.js         # SQLite manager (WAL mode, batching)
│   │   ├── tiktok.js           # TikTok LIVE Connector integration
│   │   ├── tts.js              # Text-to-Speech engine (legacy, now plugin)
│   │   ├── alerts.js           # Alert manager
│   │   ├── flows.js            # Flow engine (event automation)
│   │   ├── soundboard.js       # Soundboard manager (MyInstants)
│   │   ├── goals.js            # Goal tracking system
│   │   ├── user-profiles.js    # Multi-user profile management
│   │   ├── obs-websocket.js    # OBS WebSocket v5 client
│   │   ├── leaderboard.js      # Leaderboard system
│   │   ├── logger.js           # Winston logger (console + rotating files)
│   │   ├── plugin-loader.js    # Plugin system loader (545 LOC)
│   │   ├── update-manager.js   # Git/ZIP update system (532 LOC)
│   │   ├── validators.js       # Input validation (498 LOC)
│   │   └── error-handler.js    # Centralized error handling
│   │
│   ├── plugins/                 # Plugin system (31 plugins)
│   │   ├── topboard/           # Top gifters, streaks, donors
│   │   ├── tts/                # TTS engine as plugin
│   │   ├── vdoninja/           # VDO.Ninja manager as plugin
│   │   ├── multicam/           # Multi-cam switcher (OBS)
│   │   ├── osc-bridge/         # OSC bridge for VRChat
│   │   ├── soundboard/         # Soundboard plugin
│   │   └── emoji-rain/         # Emoji rain effect
│   │
│   ├── routes/                  # Express route modules
│   │   └── plugin-routes.js    # Plugin manager API (484 LOC)
│   │
│   ├── public/                  # Frontend (HTML/CSS/JS)
│   │   ├── dashboard.html      # Main dashboard (Bootstrap 5)
│   │   ├── overlay.html        # OBS browser source overlay
│   │   └── js/
│   │       ├── dashboard.js    # Dashboard logic
│   │       └── plugin-manager.js  # Plugin manager frontend (372 LOC)
│   │
│   ├── user_configs/            # User profile databases (gitignored)
│   │   ├── .active_profile     # Active profile (text file)
│   │   └── <profile>/
│   │       └── database.db     # SQLite database
│   │
│   ├── user_data/               # User data (gitignored)
│   │   └── flow_logs/          # Flow engine log files
│   │
│   ├── locales/                 # Internationalization
│   │   ├── de.json             # German translations
│   │   └── en.json             # English translations
│   │
│   └── wiki/                    # User documentation (German)
│
├── infos/                        # Developer documentation (English)
│   ├── llm_start_here.md       # Comprehensive technical guide
│   ├── CONTRIBUTING.md         # Contribution guidelines
│   ├── ARCHITECTURE.md         # This file
│   └── PLUGIN_DEVELOPMENT.md   # Plugin creation guide
│
├── main.js                       # Electron main process
├── package.json                  # Electron dependencies
└── README.md                     # User-facing README (German)
```

### File Sizes (LOC = Lines of Code)

| File | LOC | Description |
|------|-----|-------------|
| `app/server.js` | 1500+ | Main server, Express app, Socket.IO |
| `app/modules/database.js` | 600+ | SQLite manager with WAL mode |
| `app/modules/plugin-loader.js` | 545 | Plugin system with hot-loading |
| `app/modules/update-manager.js` | 532 | Git/ZIP update system |
| `app/modules/validators.js` | 498 | Input validation |
| `app/routes/plugin-routes.js` | 484 | Plugin manager REST API |
| `app/public/js/plugin-manager.js` | 372 | Plugin manager frontend |

**Total:** ~15,000+ LOC

---

## ⚙️ Backend Modules

### 1. server.js (Main Server)

**Purpose:** Express app, Socket.IO server, event bus

**Responsibilities:**
- Express middleware setup (CORS, rate-limiting, body-parser)
- Socket.IO server initialization
- Plugin loader startup
- TikTok connector initialization
- Event routing (TikTok → Plugins → Clients)
- REST API endpoint registration
- Error handling

**Code Structure:**
```javascript
// Express app setup
const app = express();
app.use(cors());
app.use(express.json());
app.use(rateLimiter);

// Socket.IO setup
const io = socketIo(server, { cors: { origin: '*' } });

// Database initialization
const db = new Database();

// Plugin loader startup
const pluginLoader = new PluginLoader(app, io, db, logger);
await pluginLoader.loadAllPlugins();

// TikTok connector setup
const tiktok = new TikTokConnector();
tiktok.on('gift', (data) => {
    // Emit to plugins
    pluginLoader.emitTikTokEvent('gift', data);
    
    // Emit to clients
    io.emit('tiktok:gift', data);
    
    // Update goals
    goalManager.handleGift(data);
    
    // Trigger alert
    alertManager.handleGift(data);
});

// HTTP server start
server.listen(PORT, () => {
    logger.info(`Server listening on http://localhost:${PORT}`);
});
```

### 2. modules/database.js (SQLite Manager)

**Purpose:** SQLite database management with WAL mode

**Features:**
- WAL mode (Write-Ahead Logging) for performance
- Prepared statements for SQL injection protection
- Batch writes for better performance
- Transaction support
- Auto-migration on schema changes

**API:**
```javascript
class Database {
    // Settings
    getSetting(key)
    setSetting(key, value)
    getAllSettings()
    
    // Alert configs
    getAlertConfig(eventType)
    setAlertConfig(eventType, config)
    
    // Flows
    getAllFlows()
    getFlow(id)
    createFlow(flow)
    updateFlow(id, flow)
    deleteFlow(id)
    
    // Gift sounds
    getGiftSound(giftId)
    setGiftSound(giftId, sound)
    
    // Leaderboard
    getTopGifters(limit)
    updateGifter(username, coins)
    
    // Events (history)
    logEvent(eventType, data)
    getEvents(filter, limit)
}
```

**Optimizations:**
```javascript
// Enable WAL mode
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

// Prepared statements
const stmt = db.prepare('INSERT INTO events (type, data) VALUES (?, ?)');
stmt.run(eventType, JSON.stringify(data));
```

### 3. modules/tiktok.js (TikTok Connector)

**Purpose:** Integration with TikTok LIVE API

**Library:** `tiktok-live-connector` (v2.1.0)

**Events:**
- `connected` - Connection successful
- `disconnected` - Connection closed
- `gift` - Gift received
- `chat` - Chat message
- `follow` - New follower
- `share` - Stream shared
- `like` - Likes received
- `subscribe` - New subscriber
- `roomUser` - User joins/leaves stream
- `streamEnd` - Stream ended

**Code Example:**
```javascript
const { WebcastPushConnection } = require('tiktok-live-connector');

class TikTokConnector {
    async connect(username) {
        this.connection = new WebcastPushConnection(username, {
            processInitialData: true,
            enableExtendedGiftInfo: true,
            requestPollingIntervalMs: 1000
        });
        
        this.connection.on('gift', (data) => {
            this.emit('gift', {
                username: data.uniqueId,
                giftName: data.giftName,
                giftId: data.giftId,
                coins: data.diamondCount,
                count: data.repeatCount,
                profilePictureUrl: data.profilePictureUrl
            });
        });
        
        await this.connection.connect();
    }
}
```

### 4. modules/flows.js (Flow Engine)

**Purpose:** Event automation ("if-then" rules)

**Process:**
1. Receive TikTok event
2. Check all enabled flows
3. Evaluate trigger condition
4. On match: execute actions sequentially
5. Log to `user_data/flow_logs/`

**Condition Evaluation:**
```javascript
evaluateCondition(event, condition) {
    const { operator, field, value } = condition;
    const eventValue = event[field];
    
    switch (operator) {
        case '==': return eventValue == value;
        case '!=': return eventValue != value;
        case '>': return eventValue > value;
        case '>=': return eventValue >= value;
        case '<': return eventValue < value;
        case '<=': return eventValue <= value;
        case 'contains': return String(eventValue).includes(value);
        case 'startsWith': return String(eventValue).startsWith(value);
        case 'endsWith': return String(eventValue).endsWith(value);
        default: return false;
    }
}
```

### 5. modules/plugin-loader.js (Plugin System)

**Purpose:** Dynamic loading and management of plugins

**Process:**
1. Scan `plugins/` directory
2. Load `plugin.json` for metadata
3. Check `enabled` status
4. Instantiate plugin class
5. Call `init()` method
6. Register routes, Socket.IO events, TikTok events

**Plugin API:**
```javascript
class PluginAPI {
    constructor(pluginId, pluginDir, app, io, db, logger, pluginLoader) {
        this.pluginId = pluginId;
        this.pluginDir = pluginDir;
        this.app = app;
        this.io = io;
        this.db = db;
        this.logger = logger;
        this.pluginLoader = pluginLoader;
        
        this.registeredRoutes = [];
        this.registeredSocketEvents = [];
        this.registeredTikTokEvents = [];
    }
    
    registerRoute(method, path, handler) {
        const fullPath = `/api/plugins/${this.pluginId}${path}`;
        this.app[method.toLowerCase()](fullPath, handler);
        this.registeredRoutes.push({ method, path: fullPath });
    }
    
    registerSocket(event, callback) {
        this.registeredSocketEvents.push({ event, callback });
    }
    
    registerTikTokEvent(event, callback) {
        this.registeredTikTokEvents.push({ event, callback });
    }
    
    getConfig(key) {
        return this.db.getSetting(`plugin:${this.pluginId}:${key}`);
    }
    
    setConfig(key, value) {
        this.db.setSetting(`plugin:${this.pluginId}:${key}`, value);
    }
    
    emit(event, data) {
        this.io.emit(event, data);
    }
    
    log(message, level = 'info') {
        this.logger[level](`[Plugin:${this.pluginId}] ${message}`);
    }
}
```

---

## 🎨 Frontend Components

### 1. Dashboard (public/dashboard.html)

**Framework:** Bootstrap 5

**Layout:**
- Header: Logo, connection status, TikTok username
- Sidebar: Navigation (Dashboard, Settings, Flows, Plugins, etc.)
- Main: Content area (dynamically loaded)
- Footer: Version, links

**JavaScript:** `public/js/dashboard.js`

**Socket.IO Integration:**
```javascript
const socket = io();

socket.on('tiktok:connected', (data) => {
    updateConnectionStatus('Connected', data.username);
});

socket.on('tiktok:gift', (data) => {
    addEventToLog(`🎁 ${data.username} sent ${data.giftName} x${data.count}`);
});

socket.on('alert:new', (data) => {
    showAlert(data.text, data.sound, data.duration);
});
```

### 2. OBS Overlay (public/overlay.html)

**Purpose:** Transparent Full HD overlay for OBS Studio

**Features:**
- Alert display (gift, follow, subscribe)
- Goal progress bars
- HUD elements (viewer count, like count)
- Leaderboard
- Transparent background

**CSS:**
```css
body {
    background-color: transparent;
    margin: 0;
    overflow: hidden;
}

.alert-container {
    position: fixed;
    top: 50%;
    right: 50px;
    transform: translateY(-50%);
    z-index: 1000;
}
```

---

## 🔌 Plugin System

See `/infos/PLUGIN_DEVELOPMENT.md` for complete details.

**Quick Overview:**

```
plugins/<plugin-id>/
├── plugin.json       # Metadata (id, name, version, entry, enabled)
├── main.js           # Plugin class with init() and destroy()
├── ui.html           # Optional: Admin UI
└── assets/           # Optional: CSS, JS, images
```

**Plugin Lifecycle:**
1. `constructor(api)` - Instantiation
2. `init()` - Initialization (register routes, events)
3. `destroy()` - Cleanup (on disable/reload)

---

## 🔄 Data Flow

### TikTok Event Flow

```
TikTok LIVE
    │
    ▼
tiktok-live-connector (NPM library)
    │
    ▼
modules/tiktok.js (event parsing)
    │
    ▼
server.js (event bus)
    │
    ├─► modules/flows.js (flow engine)
    ├─► modules/alerts.js (alert manager)
    ├─► modules/goals.js (goal manager)
    ├─► modules/leaderboard.js (leaderboard)
    ├─► plugins/*/main.js (plugin callbacks)
    │
    ▼
Socket.IO broadcast
    │
    ▼
Frontend clients (dashboard, overlay)
```

### REST API Request Flow

```
HTTP Request (client)
    │
    ▼
Express middleware (CORS, rate-limiting, body-parser)
    │
    ▼
Route handler (app.get/post/put/delete)
    │
    ▼
Validation (modules/validators.js)
    │
    ▼
Business logic (modules/*.js)
    │
    ▼
Database (modules/database.js)
    │
    ▼
Response (JSON)
```

---

## 🗄️ Database Schema

### SQLite Database

**File:** `user_configs/<profile>/database.db`

**WAL Mode:** Enabled for better performance

**Tables:**

#### settings
```sql
CREATE TABLE settings (
    key TEXT PRIMARY KEY,
    value TEXT
);
```

#### alert_configs
```sql
CREATE TABLE alert_configs (
    event_type TEXT PRIMARY KEY,
    enabled INTEGER DEFAULT 1,
    text_template TEXT,
    sound_file TEXT,
    duration INTEGER DEFAULT 5000,
    image_url TEXT,
    animation_type TEXT
);
```

#### flows
```sql
CREATE TABLE flows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    trigger_type TEXT NOT NULL,
    trigger_condition TEXT,
    actions TEXT NOT NULL,
    enabled INTEGER DEFAULT 1,
    created_at INTEGER DEFAULT (strftime('%s','now'))
);
```

#### gift_sounds
```sql
CREATE TABLE gift_sounds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    gift_id INTEGER UNIQUE,
    label TEXT,
    mp3_url TEXT,
    volume REAL DEFAULT 1.0,
    animation_url TEXT,
    animation_type TEXT
);
```

#### user_voices
```sql
CREATE TABLE user_voices (
    username TEXT PRIMARY KEY,
    voice_id TEXT NOT NULL
);
```

#### top_gifters
```sql
CREATE TABLE top_gifters (
    username TEXT PRIMARY KEY,
    total_coins INTEGER DEFAULT 0,
    gift_count INTEGER DEFAULT 0,
    last_gift_at INTEGER,
    profile_picture_url TEXT
);
```

#### events (history)
```sql
CREATE TABLE events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_type TEXT NOT NULL,
    username TEXT,
    data TEXT,
    created_at INTEGER DEFAULT (strftime('%s','now'))
);
```

---

## 🌐 External Integrations

### 1. TikTok LIVE API

**Library:** `tiktok-live-connector` (v2.1.0)

**Protocol:** WebSocket (via TikTok WebCast)

**Authentication:** None (public LIVE streams)

**Endpoint:** `wss://webcast.tiktok.com/webcast/im/fetch/`

**Rate Limits:** Polling interval 1000ms

### 2. OBS Studio (WebSocket v5)

**Library:** `obs-websocket-js` (v5.0.6)

**Protocol:** WebSocket

**Port:** 4455 (default)

**Authentication:** Optional (password)

**Capabilities:**
- Switch scenes
- Show/hide sources
- Toggle filters
- Get scenes/sources
- Start/stop streaming

**Code Example:**
```javascript
const OBSWebSocket = require('obs-websocket-js').default;
const obs = new OBSWebSocket();

await obs.connect('ws://localhost:4455', 'password');
await obs.call('SetCurrentProgramScene', { sceneName: 'Cam2' });
```

### 3. VRChat (OSC Protocol)

**Library:** `osc` (v2.4.5)

**Protocol:** UDP OSC (Open Sound Control)

**Ports:**
- Send: 9000
- Receive: 9001

**Standard Parameters:**
- `/avatar/parameters/Wave`
- `/avatar/parameters/Celebrate`
- `/avatar/parameters/DanceTrigger`
- `/avatar/parameters/Hearts`
- `/avatar/parameters/Confetti`

**Code Example:**
```javascript
const osc = require('osc');

const udpPort = new osc.UDPPort({
    localAddress: '0.0.0.0',
    localPort: 9001,
    remoteAddress: '127.0.0.1',
    remotePort: 9000
});

udpPort.send({
    address: '/avatar/parameters/Wave',
    args: [{ type: 'i', value: 1 }]
});
```

### 4. MyInstants (Sound Library)

**API:** Scraping (cheerio)

**Endpoint:** `https://www.myinstants.com/`

**Features:**
- 100,000+ sounds
- Search API
- Trending/Popular
- Direct MP3 URLs

---

## ⚡ Performance & Scaling

### Optimizations

**1. SQLite WAL Mode:**
```javascript
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
```
- Concurrent reads during writes
- Better performance

**2. Batch Writes:**
```javascript
const transaction = db.transaction((events) => {
    const stmt = db.prepare('INSERT INTO events (type, data) VALUES (?, ?)');
    events.forEach(event => stmt.run(event.type, event.data));
});
transaction(events);
```

**3. Socket.IO Rooms:**
```javascript
socket.join('goal:likes');
io.to('goal:likes').emit('goal:update', data);
```
- Broadcast only to interested clients

**4. Virtual Scrolling (Frontend):**
```javascript
// public/js/virtual-scroller.js
// Renders only visible elements
```

**5. IndexedDB Caching (Frontend):**
```javascript
// public/js/indexeddb-cache.js
// Cache for gift catalog, sounds
```

### Scaling Limits

| Component | Limit | Reason |
|-----------|-------|--------|
| Concurrent Users | ~100 | Socket.IO (single-thread) |
| Events/Second | ~500 | TikTok API polling interval |
| Database Size | ~1 GB | SQLite (recommended) |
| Plugin Count | ~20 | Overhead per plugin |

---

## 🔗 Related Documentation

- `/infos/PLUGIN_DEVELOPMENT.md` - Plugin system in detail
- `/infos/DEVELOPMENT.md` - Development setup and workflows
- `/infos/SECURITY.md` - Security best practices

---

*Last Updated: 2026-01-20*  
*Version: 1.2.2*
