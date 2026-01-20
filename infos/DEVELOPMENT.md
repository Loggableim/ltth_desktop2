# Development Guide

**PupCid's Little TikTool Helper (LTTH)**  
**Version:** 1.2.2  
**Last Updated:** 2026-01-20

---

## 📑 Table of Contents

1. [Development Environment](#development-environment)
2. [Project Setup](#project-setup)
3. [Code Style & Standards](#code-style--standards)
4. [Git Workflow & Branching](#git-workflow--branching)
5. [Commit Conventions](#commit-conventions)
6. [Pull Request Process](#pull-request-process)
7. [Testing](#testing)
8. [Debugging](#debugging)
9. [Logging](#logging)
10. [Error Handling](#error-handling)
11. [Performance Best Practices](#performance-best-practices)
12. [Build & Deployment](#build--deployment)

---

## 💻 Development Environment

### Prerequisites

| Tool | Version | Purpose | Download |
|------|---------|---------|----------|
| **Node.js** | 18.x, 20.x, or 22.x | Runtime | [nodejs.org](https://nodejs.org/) |
| **npm** | 9.x+ | Package manager | Comes with Node.js |
| **Git** | 2.x+ | Version control | [git-scm.com](https://git-scm.com/) |
| **VS Code** | Latest | Code editor (recommended) | [code.visualstudio.com](https://code.visualstudio.com/) |
| **OBS Studio** | 28.x+ | Testing overlays (optional) | [obsproject.com](https://obsproject.com/) |

### VS Code Extensions

**Recommended Extensions:**
```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "ms-vscode.vscode-typescript-next",
    "eamodio.gitlens",
    "oderwat.indent-rainbow",
    "wayou.vscode-todo-highlight",
    "GitHub.copilot"
  ]
}
```

Save to `.vscode/extensions.json`.

### Environment Variables

Create `.env` file in `app/` directory:

```bash
# Development environment
NODE_ENV=development
LOG_LEVEL=debug
PORT=3000

# Optional: Database path override
# DB_PATH=/custom/path/to/database.db

# Optional: OBS WebSocket
# OBS_WEBSOCKET_URL=ws://localhost:4455
# OBS_WEBSOCKET_PASSWORD=your_password
```

**Never commit `.env` files to repository!**

---

## 🚀 Project Setup

### Initial Setup

```bash
# Clone repository
git clone https://github.com/Loggableim/ltth_desktop2.git
cd ltth_desktop2

# Install app dependencies
cd app
npm install

# Copy environment template
cp .env.example .env

# Edit environment variables
nano .env
```

### Development Mode

```bash
# In app/ directory:

# Start with auto-reload (recommended for development)
npm run dev

# Or start normally
npm start

# Watch Tailwind CSS changes (separate terminal)
npm run watch:css
```

### Electron Desktop Mode

```bash
# From repository root:

# Install Electron dependencies
npm install

# Start Electron app
npm start

# Or use development mode
npm run dev
```

---

## 📝 Code Style & Standards

### General Rules

- **Language:** Code and comments in English, UI/documentation in German
- **Indentation:** 2 spaces (NO tabs)
- **Quotes:** Single quotes for strings in JavaScript
- **Line Length:** No strict limit, but keep lines readable
- **Semicolons:** Use consistently
- **ES6+:** Use modern JavaScript features

### Naming Conventions

```javascript
// Variables & functions: camelCase
const userName = 'john';
function getUserData() { }

// Constants: UPPER_SNAKE_CASE
const MAX_RETRIES = 3;
const API_ENDPOINT = 'https://api.example.com';

// Classes: PascalCase
class UserManager { }
class PluginLoader { }

// Private methods/properties: prefix with _
class MyClass {
    _privateMethod() { }
    _privateProperty = 'secret';
}

// Files: kebab-case
// user-manager.js, plugin-loader.js, tiktok-connector.js
```

### Comments & Documentation

```javascript
// Single-line comments for brief explanations
const port = 3000; // Server port

/**
 * Multi-line JSDoc comments for functions/classes
 *
 * @param {string} username - TikTok username
 * @param {Object} options - Options
 * @returns {Promise<boolean>} - Success status
 */
async function connectToTikTok(username, options) {
    // Implementation
}
```

### Modern JavaScript

**Use Template Literals:**
```javascript
// ✅ Good
const message = `Hello ${username}, you have ${coins} coins`;

// ❌ Avoid
const message = 'Hello ' + username + ', you have ' + coins + ' coins';
```

**Use Arrow Functions:**
```javascript
// ✅ Good for callbacks
array.map(item => item.name);
array.filter(item => item.active);

// ✅ Good for class methods (preserve this context)
class MyClass {
    myMethod() {
        // this context preserved
    }
}
```

**Use Async/Await:**
```javascript
// ✅ Good
async function fetchData() {
    try {
        const response = await axios.get(url);
        return response.data;
    } catch (error) {
        logger.error('Fetch failed:', error);
        throw error;
    }
}

// ❌ Avoid (prefer async/await over promise chains)
function fetchData() {
    return axios.get(url)
        .then(response => response.data)
        .catch(error => {
            logger.error('Fetch failed:', error);
            throw error;
        });
}
```

### Critical Rules

**✅ DO:**
- Use Winston logger (`logger.info()`, `logger.error()`)
- Document code with JSDoc for public APIs
- Follow existing patterns in codebase
- Implement comprehensive error handling
- Set default values for configuration
- Validate all inputs before processing
- Use prepared statements for database queries
- Perform atomic file writes (`.tmp` → `rename`)

**❌ DON'T:**
- Use `console.log` in production code
- Remove existing features (only extend!)
- Make breaking changes without discussion
- Commit hardcoded secrets or API keys
- Use synchronous file I/O (except database)
- Use magic numbers (define constants)

### Code Example (Best Practice)

```javascript
/**
 * Gift event handler
 *
 * @param {Object} giftData - Gift event data
 * @param {string} giftData.username - Sender username
 * @param {string} giftData.giftName - Gift name
 * @param {number} giftData.coins - Coin value
 * @returns {Promise<void>}
 */
async function handleGiftEvent(giftData) {
    // Input validation
    if (!giftData || !giftData.username) {
        logger.error('Invalid gift data received');
        return;
    }
    
    try {
        // Logging
        logger.info(`Gift received: ${giftData.giftName} from ${giftData.username}`);
        
        // Business logic
        await updateLeaderboard(giftData.username, giftData.coins);
        await incrementGoal('coins', giftData.coins);
        
        // Event emission
        io.emit('gift:processed', {
            username: giftData.username,
            giftName: giftData.giftName,
            coins: giftData.coins
        });
        
    } catch (error) {
        logger.error('Gift handling failed:', error);
        // Don't swallow error, but don't crash either
    }
}
```

---

## 🌿 Git Workflow & Branching

### Branch Strategy

**Main Branches:**
- `main` - Production-ready code (protected, PR only)
- `develop` - Development branch (optional)

**Feature Branches:**
- `feature/<feature-name>` - New features
- `fix/<bug-name>` - Bug fixes
- `refactor/<component>` - Refactoring
- `docs/<section>` - Documentation

**Examples:**
```bash
feature/multi-language-support
fix/tts-queue-overflow
refactor/database-manager
docs/api-reference
```

### Workflow Steps

**1. Develop a Feature:**
```bash
# Start from main branch
git checkout main
git pull origin main

# Create feature branch
git checkout -b feature/my-new-feature

# Develop, commit
git add .
git commit -m "Add: My new feature"

# Push to remote
git push origin feature/my-new-feature
```

**2. Open Pull Request:**
- On GitHub: "Compare & Pull Request"
- Fill in description (see template below)
- Assign reviewers (if team)

**3. Code Review:**
- Address reviewer feedback
- Push changes (automatically updates PR)

**4. Merge:**
- After approval: "Squash and Merge" or "Merge"
- Delete branch (automatic)

**5. Local Cleanup:**
```bash
git checkout main
git pull origin main
git branch -d feature/my-new-feature
```

---

## 📝 Commit Conventions

### Commit Message Format

```
<Type>: <Short description> (max 72 characters)

<Optional body: Detailed description>
- What was changed?
- Why was it changed?
- How was it implemented?

<Optional footer>
- Breaking changes: BREAKING CHANGE: ...
- Issue references: Closes #123
```

### Commit Types

| Type | Description | Example |
|------|-------------|---------|
| `Add` | New features added | `Add: Multi-language support` |
| `Update` | Existing features extended | `Update: TTS with 20 new voices` |
| `Fix` | Bug fixes | `Fix: TTS queue overflow` |
| `Refactor` | Code refactoring (no functional change) | `Refactor: Database module` |
| `Docs` | Documentation | `Docs: Update API reference` |
| `Test` | Tests added/changed | `Test: Add unit tests for flows` |
| `Chore` | Build/CI changes | `Chore: Update dependencies` |
| `Style` | Code formatting | `Style: Fix indentation` |
| `Perf` | Performance improvements | `Perf: Optimize database queries` |

### Good Commit Examples

```bash
git commit -m "Add: OSC-Bridge plugin for VRChat integration"

git commit -m "Fix: TTS queue overflow when 100+ messages
- Added max queue size limit (100 items)
- Oldest items are dropped when queue is full
- Added warning log when queue limit reached"

git commit -m "Update: Multi-Cam plugin with macro system
- Added macro support for multi-step actions
- Added cooldown system (per-user, global)
- Added safety limits (max switches per 30s)

Closes #42"
```

### Bad Commit Examples

```bash
git commit -m "fixes"  # Too short, no type
git commit -m "updated stuff"  # Too vague
git commit -m "asdfasdf"  # Meaningless
```

### Atomic Commits

**Rule:** One commit = One logical change

**Good:**
```bash
# Commit 1: Add feature
git commit -m "Add: Google TTS support"

# Commit 2: Update documentation
git commit -m "Docs: Update TTS configuration"
```

**Bad:**
```bash
# Everything in one commit
git commit -m "Add Google TTS and update docs and fix bug and refactor"
```

---

## 🔀 Pull Request Process

### Pull Request Template

```markdown
## Description
Brief description of the changes.

## Type of Change
- [ ] Bugfix (non-breaking change)
- [ ] New feature (non-breaking change)
- [ ] Breaking change (fix/feature with breaking changes)
- [ ] Documentation

## Changes in Detail
- Change 1
- Change 2
- Change 3

## Tests
How was this tested?
- [ ] Manual tests performed
- [ ] All existing tests pass
- [ ] New tests added

## Screenshots (if UI changes)
![Screenshot](url)

## Checklist
- [ ] Code follows project style
- [ ] Self-review performed
- [ ] Comments in complex code
- [ ] Documentation updated
- [ ] No warnings generated
- [ ] CHANGELOG.md updated (if necessary)

## Related Issues
Closes #123
```

### Review Criteria

**Code Quality:**
- ✅ Code is readable and well-documented
- ✅ No obvious bugs
- ✅ Error handling present
- ✅ Logging consistent

**Functionality:**
- ✅ Feature works as described
- ✅ No breaking changes (or documented)
- ✅ Edge cases considered

**Tests:**
- ✅ Manually tested
- ✅ Existing features not broken

**Documentation:**
- ✅ README/Wiki updated
- ✅ CHANGELOG updated
- ✅ Code comments present

---

## 🧪 Testing

### Manual Testing

**Currently:** Limited automated testing, manual testing is primary.

**Test Checklist Before PR:**

**TikTok Connection:**
- [ ] Connection to TikTok LIVE successful
- [ ] Gift events received
- [ ] Chat events received
- [ ] Follow/Subscribe/Share events work

**Alerts:**
- [ ] Test alert works
- [ ] Alert displays in overlay
- [ ] Sound plays
- [ ] Alert disappears after duration

**TTS:**
- [ ] Test TTS works
- [ ] Voice selection works
- [ ] Volume/Speed adjustments work
- [ ] Queue handles multiple TTS

**Goals:**
- [ ] Goal increment works
- [ ] Goal overlay shows correct value
- [ ] Goal reset works
- [ ] Progress bar updates

**Flows:**
- [ ] Flow creation works
- [ ] Flow test works
- [ ] Flow triggers on real events
- [ ] Actions execute correctly

**Plugins:**
- [ ] Plugin can be enabled/disabled
- [ ] Plugin config can be saved
- [ ] Plugin works after restart

### Running Tests

```bash
cd app
npm test                # Run all tests with Jest
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
node test/specific.test.js  # Run individual test
```

### API Testing

Use Postman or curl for API testing:

```bash
# Connect to TikTok
curl -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"username": "test_user"}'

# Get settings
curl http://localhost:3000/api/settings

# Get plugin list
curl http://localhost:3000/api/plugins/list
```

---

## 🐛 Debugging

### Node.js Debugger

**VS Code Launch Config (`.vscode/launch.json`):**
```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "type": "node",
      "request": "launch",
      "name": "Debug Server",
      "skipFiles": ["<node_internals>/**"],
      "program": "${workspaceFolder}/app/server.js",
      "env": {
        "NODE_ENV": "development",
        "LOG_LEVEL": "debug"
      }
    }
  ]
}
```

**Set Breakpoints:**
- Click on line number in VS Code
- Or add `debugger;` statement in code

**Start Debugging:**
- Press F5 in VS Code
- Or Run → Start Debugging

### Chrome DevTools (Frontend)

**Debug Dashboard:**
1. Open dashboard: `http://localhost:3000`
2. Press F12 → Open Developer Tools
3. Console tab: View log output
4. Network tab: Inspect HTTP/WebSocket
5. Sources tab: Set breakpoints

**Debug Overlay:**
1. Open overlay in browser: `http://localhost:3000/overlay.html`
2. Press F12 → Developer Tools
3. Console → Check for errors
4. Network → Verify Socket.IO connection

### Logging Levels

```javascript
// modules/logger.js
logger.error('Critical error');  // Always log
logger.warn('Warning');          // Production
logger.info('Info');             // Production
logger.debug('Debug info');      // Development only
```

**Set Log Level:**
```bash
LOG_LEVEL=debug npm start
```

**Log Files:**
```
logs/
├── combined.log       # All logs
├── error.log          # Only errors
└── app-YYYY-MM-DD.log # Daily rotate (30 days)
```

---

## 📊 Logging

### Using the Logger

**Import:**
```javascript
const logger = require('./modules/logger');
```

**Usage:**
```javascript
// Info level (standard)
logger.info('Server started on port 3000');
logger.info(`User ${username} connected`);

// Error level
logger.error('Database connection failed', error);
logger.error(`Gift handling failed for ${giftId}`, error);

// Warning level
logger.warn('TTS queue is full');
logger.warn(`Flow ${flowId} has invalid condition`);

// Debug level (development only)
logger.debug('Processing gift event', giftData);
logger.debug(`Flow ${flowId} triggered`);
```

**Never use `console.log`!**
```javascript
// ❌ Bad
console.log('User connected');

// ✅ Good
logger.info('User connected');
```

### Structured Logging

```javascript
// With metadata
logger.info('Gift received', {
    username: data.username,
    giftName: data.giftName,
    coins: data.coins,
    timestamp: Date.now()
});
```

---

## 🚨 Error Handling

### Try-Catch for Async Operations

**Rule:** All `async` functions must have try-catch.

```javascript
async function myAsyncFunction() {
    try {
        const result = await someAsyncOperation();
        return result;
    } catch (error) {
        logger.error('Operation failed:', error);
        throw error; // Or return null, depending on use case
    }
}
```

### Express Error Handling Middleware

```javascript
// modules/error-handler.js
function errorHandler(err, req, res, next) {
    logger.error('Express error:', err);
    
    res.status(err.status || 500).json({
        success: false,
        error: err.message || 'Internal Server Error'
    });
}

// In server.js
app.use(errorHandler);
```

### Graceful Shutdown

```javascript
// In server.js
process.on('SIGINT', async () => {
    logger.info('Shutting down gracefully...');
    
    // Close TikTok connection
    if (tiktok.connection) {
        await tiktok.disconnect();
    }
    
    // Close server
    server.close(() => {
        logger.info('Server closed');
        process.exit(0);
    });
});
```

---

## ⚡ Performance Best Practices

### 1. Database Optimization

**Use Prepared Statements:**
```javascript
// ✅ Good
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = stmt.get(userId);

// ❌ Bad (SQL injection risk)
const user = db.prepare(`SELECT * FROM users WHERE id = ${userId}`).get();
```

**Use Transactions for Bulk Inserts:**
```javascript
const insertMany = db.transaction((items) => {
    const stmt = db.prepare('INSERT INTO items (name) VALUES (?)');
    items.forEach(item => stmt.run(item.name));
});

insertMany(items); // Much faster than individual inserts
```

### 2. Socket.IO Optimization

**Use Rooms for Targeted Broadcasts:**
```javascript
// ❌ Bad: Broadcast to everyone
io.emit('goal:update', data);

// ✅ Good: Only to interested clients
io.to('goal:likes').emit('goal:update', data);
```

### 3. Caching

**In-Memory Cache for Frequent Queries:**
```javascript
const cache = new Map();

function getGiftCatalog() {
    if (cache.has('giftCatalog')) {
        return cache.get('giftCatalog');
    }
    
    const catalog = db.prepare('SELECT * FROM gifts').all();
    cache.set('giftCatalog', catalog);
    return catalog;
}
```

### 4. Event Debouncing

**For High-Frequency Events:**
```javascript
let lastUpdate = 0;

tiktok.on('like', (data) => {
    const now = Date.now();
    if (now - lastUpdate < 1000) return; // Max 1x per second
    
    lastUpdate = now;
    // Process event
});
```

---

## 🔧 Build & Deployment

### Build Commands

```bash
# In app/ directory:
npm run build:css     # Compile Tailwind CSS
npm run watch:css     # Watch Tailwind CSS changes

# In repository root (Electron):
npm run build         # Build Electron app for current platform
npm run build:win     # Build for Windows
npm run build:mac     # Build for macOS
npm run build:linux   # Build for Linux
```

### Production Deployment

**Environment Variables:**
```bash
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
```

**Start Production Server:**
```bash
cd app
NODE_ENV=production npm start
```

### Electron Packaging

```bash
# Install dependencies
npm install

# Build for all platforms
npm run build:all

# Output in dist/ directory
```

---

## 🔗 Related Documentation

- `/infos/ARCHITECTURE.md` - System architecture
- `/infos/PLUGIN_DEVELOPMENT.md` - Plugin creation guide
- `/infos/TESTING.md` - Testing guidelines
- `/infos/SECURITY.md` - Security best practices
- `/infos/CONTRIBUTING.md` - Contribution guidelines

---

*Last Updated: 2026-01-20*  
*Version: 1.2.2*
