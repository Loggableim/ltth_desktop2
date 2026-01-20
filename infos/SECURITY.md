# Security Best Practices

**PupCid's Little TikTool Helper (LTTH)**  
**Version:** 1.2.2  
**Last Updated:** 2026-01-20

---

## 📑 Table of Contents

1. [Security Overview](#security-overview)
2. [Critical Security Rules](#critical-security-rules)
3. [Input Validation & Sanitization](#input-validation--sanitization)
4. [Authentication & Authorization](#authentication--authorization)
5. [Database Security](#database-security)
6. [API Security](#api-security)
7. [Frontend Security](#frontend-security)
8. [Secrets Management](#secrets-management)
9. [Dependencies & Updates](#dependencies--updates)
10. [Security Checklist](#security-checklist)

---

## 🔍 Security Overview

### Threat Model

LTTH is a **local desktop application** with:
- Local web server (localhost:3000 or 3210)
- SQLite database (local file)
- External API connections (TikTok, OBS, VRChat)
- User-generated content (chat, usernames)

### Security Priorities

1. **Protect user data** - Database, API keys, personal information
2. **Prevent code injection** - SQL, XSS, command injection
3. **Validate external input** - TikTok events, API responses
4. **Secure external connections** - TLS, authentication
5. **Minimize attack surface** - Rate limiting, input validation

---

## 🚨 Critical Security Rules

### NEVER Do This

**❌ Commit Secrets to Repository**
```javascript
// ❌ WRONG
const apiKey = 'sk_live_abc123xyz789';
```

**❌ Trust User Input**
```javascript
// ❌ WRONG
const username = req.body.username;
db.prepare(`SELECT * FROM users WHERE name = '${username}'`).get();
```

**❌ Use String Concatenation for SQL**
```javascript
// ❌ WRONG
const query = `INSERT INTO settings (key, value) VALUES ('${key}', '${value}')`;
db.exec(query);
```

**❌ Execute User-Provided Code**
```javascript
// ❌ WRONG
eval(userInput);
new Function(userInput)();
```

**❌ Expose Sensitive Data in Logs**
```javascript
// ❌ WRONG
logger.info('User logged in with password:', password);
```

### ALWAYS Do This

**✅ Use Environment Variables for Secrets**
```javascript
// ✅ CORRECT
const apiKey = process.env.GOOGLE_API_KEY || '';
```

**✅ Validate All Input**
```javascript
// ✅ CORRECT
const { validateUsername } = require('./modules/validators');

if (!validateUsername(req.body.username)) {
    return res.status(400).json({ error: 'Invalid username' });
}
```

**✅ Use Prepared Statements**
```javascript
// ✅ CORRECT
const stmt = db.prepare('SELECT * FROM users WHERE name = ?');
const user = stmt.get(username);
```

**✅ Sanitize Output**
```javascript
// ✅ CORRECT
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
```

**✅ Log Safely**
```javascript
// ✅ CORRECT
logger.info('User logged in', { userId: user.id, timestamp: Date.now() });
```

---

## 🛡️ Input Validation & Sanitization

### Validate All External Input

**TikTok Events:**
```javascript
this.api.registerTikTokEvent('chat', async (data) => {
    // Validate required fields
    if (!data || !data.username || !data.message) {
        this.api.log('Invalid chat event received', 'warn');
        return;
    }
    
    // Sanitize message
    const sanitizedMessage = sanitizeInput(data.message);
    
    // Validate length
    if (sanitizedMessage.length > 500) {
        this.api.log('Message too long, truncating', 'warn');
        sanitizedMessage = sanitizedMessage.substring(0, 500);
    }
    
    // Process sanitized data
    processChatMessage(data.username, sanitizedMessage);
});
```

**HTTP Requests:**
```javascript
app.post('/api/settings', (req, res) => {
    // Validate request body exists
    if (!req.body) {
        return res.status(400).json({ error: 'Missing request body' });
    }
    
    // Validate required fields
    const { key, value } = req.body;
    if (!key || typeof key !== 'string') {
        return res.status(400).json({ error: 'Invalid key' });
    }
    
    // Sanitize input
    const sanitizedKey = key.trim().substring(0, 100);
    const sanitizedValue = String(value).substring(0, 10000);
    
    // Process sanitized data
    db.setSetting(sanitizedKey, sanitizedValue);
    res.json({ success: true });
});
```

### Input Validation Helpers

**Use validators module:**
```javascript
const { validateUsername, validateSettings, validateUrl } = require('./modules/validators');

// Validate username
if (!validateUsername(username)) {
    throw new Error('Invalid username format');
}

// Validate URL
if (!validateUrl(url)) {
    throw new Error('Invalid URL');
}

// Validate settings object
if (!validateSettings(settings)) {
    throw new Error('Invalid settings format');
}
```

**Create custom validators:**
```javascript
/**
 * Validate gift data from TikTok
 * @param {Object} giftData - Gift event data
 * @returns {boolean} - Valid or not
 */
function validateGiftData(giftData) {
    if (!giftData || typeof giftData !== 'object') {
        return false;
    }
    
    // Required fields
    if (!giftData.username || typeof giftData.username !== 'string') {
        return false;
    }
    
    if (!giftData.giftName || typeof giftData.giftName !== 'string') {
        return false;
    }
    
    if (typeof giftData.coins !== 'number' || giftData.coins < 0) {
        return false;
    }
    
    // Length limits
    if (giftData.username.length > 100) {
        return false;
    }
    
    if (giftData.giftName.length > 200) {
        return false;
    }
    
    return true;
}
```

### Sanitization Functions

**HTML Sanitization:**
```javascript
/**
 * Escape HTML special characters
 * @param {string} text - Text to escape
 * @returns {string} - Escaped text
 */
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Usage
element.innerHTML = escapeHtml(userInput);
```

**SQL Sanitization:**
```javascript
// ALWAYS use prepared statements (better-sqlite3 handles this)
const stmt = db.prepare('INSERT INTO users (username) VALUES (?)');
stmt.run(username); // Automatically escaped
```

**File Path Sanitization:**
```javascript
const path = require('path');

/**
 * Sanitize file path to prevent directory traversal
 * @param {string} userPath - User-provided path
 * @param {string} baseDir - Base directory to restrict to
 * @returns {string} - Safe absolute path
 */
function sanitizePath(userPath, baseDir) {
    // Resolve to absolute path
    const resolvedPath = path.resolve(baseDir, userPath);
    
    // Verify it's within base directory
    if (!resolvedPath.startsWith(baseDir)) {
        throw new Error('Invalid path: directory traversal detected');
    }
    
    return resolvedPath;
}
```

---

## 🔐 Authentication & Authorization

### API Authentication

**Rate Limiting:**
```javascript
const rateLimit = require('express-rate-limit');

// Global rate limiter
const globalLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100 // Max 100 requests per minute
});

app.use(globalLimiter);

// Strict rate limiter for sensitive endpoints
const strictLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 10 // Max 10 requests per minute
});

app.post('/api/settings', strictLimiter, (req, res) => {
    // Handle request
});
```

### Plugin Permissions

**Verify plugin permissions:**
```javascript
class PluginLoader {
    loadPlugin(pluginId) {
        const metadata = this.loadPluginMetadata(pluginId);
        
        // Check required permissions
        if (metadata.permissions.includes('filesystem')) {
            logger.warn(`Plugin ${pluginId} requests filesystem access`);
        }
        
        if (metadata.permissions.includes('network')) {
            logger.warn(`Plugin ${pluginId} requests network access`);
        }
        
        // Load plugin
        const plugin = require(pluginPath);
        return plugin;
    }
}
```

---

## 🗄️ Database Security

### SQL Injection Prevention

**ALWAYS use prepared statements:**
```javascript
// ✅ CORRECT: Prepared statement
const stmt = db.prepare('SELECT * FROM users WHERE id = ?');
const user = stmt.get(userId);

// ✅ CORRECT: Named parameters
const stmt = db.prepare('INSERT INTO users (name, email) VALUES (@name, @email)');
stmt.run({ name: 'John', email: 'john@example.com' });

// ❌ WRONG: String concatenation
const query = `SELECT * FROM users WHERE id = ${userId}`;
const user = db.prepare(query).get();
```

### Database Access Control

**Limit database access:**
```javascript
class Database {
    constructor() {
        this.db = new SQLite(dbPath);
        
        // Enable WAL mode for concurrency
        this.db.pragma('journal_mode = WAL');
        
        // Set secure defaults
        this.db.pragma('synchronous = NORMAL');
        this.db.pragma('foreign_keys = ON');
    }
    
    /**
     * Execute raw SQL (use with extreme caution)
     * @private
     */
    _execRaw(sql) {
        logger.warn('Executing raw SQL', { sql: sql.substring(0, 100) });
        return this.db.exec(sql);
    }
}
```

### Data Encryption

**Encrypt sensitive data:**
```javascript
const crypto = require('crypto');

/**
 * Encrypt sensitive data before storing
 * @param {string} data - Data to encrypt
 * @param {string} key - Encryption key
 * @returns {string} - Encrypted data (hex)
 */
function encrypt(data, key) {
    const cipher = crypto.createCipheriv('aes-256-cbc', key, iv);
    let encrypted = cipher.update(data, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    return encrypted;
}

/**
 * Decrypt sensitive data
 * @param {string} encrypted - Encrypted data (hex)
 * @param {string} key - Encryption key
 * @returns {string} - Decrypted data
 */
function decrypt(encrypted, key) {
    const decipher = crypto.createDecipheriv('aes-256-cbc', key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
}
```

---

## 🌐 API Security

### CORS Configuration

**Configure CORS properly:**
```javascript
const cors = require('cors');

// Development: Allow all origins
if (process.env.NODE_ENV === 'development') {
    app.use(cors());
}

// Production: Restrict origins
if (process.env.NODE_ENV === 'production') {
    app.use(cors({
        origin: 'http://localhost:3000',
        optionsSuccessStatus: 200
    }));
}
```

### Request Validation

**Validate content type:**
```javascript
app.use((req, res, next) => {
    if (req.method === 'POST' || req.method === 'PUT') {
        if (!req.is('application/json')) {
            return res.status(415).json({ error: 'Content-Type must be application/json' });
        }
    }
    next();
});
```

**Validate request size:**
```javascript
app.use(express.json({ limit: '1mb' })); // Max 1MB body size
```

### Error Handling

**Don't leak sensitive information:**
```javascript
// ❌ WRONG: Leaks stack trace
app.use((err, req, res, next) => {
    res.status(500).json({ error: err.stack });
});

// ✅ CORRECT: Safe error message
app.use((err, req, res, next) => {
    logger.error('Express error:', err);
    
    res.status(err.status || 500).json({
        success: false,
        error: process.env.NODE_ENV === 'development' 
            ? err.message 
            : 'Internal Server Error'
    });
});
```

---

## 🎨 Frontend Security

### XSS Prevention

**Escape user content:**
```javascript
// ❌ WRONG: Direct innerHTML
element.innerHTML = userMessage;

// ✅ CORRECT: Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

element.innerHTML = escapeHtml(userMessage);

// ✅ BETTER: Use textContent
element.textContent = userMessage;
```

**Sanitize URLs:**
```javascript
/**
 * Validate and sanitize URL
 * @param {string} url - URL to validate
 * @returns {string|null} - Sanitized URL or null if invalid
 */
function sanitizeUrl(url) {
    try {
        const parsed = new URL(url);
        
        // Only allow http and https
        if (!['http:', 'https:'].includes(parsed.protocol)) {
            return null;
        }
        
        return parsed.href;
    } catch (e) {
        return null;
    }
}

// Usage
const imageUrl = sanitizeUrl(userProvidedUrl);
if (imageUrl) {
    img.src = imageUrl;
}
```

### Content Security Policy

**Set CSP headers:**
```javascript
const helmet = require('helmet');

app.use(helmet.contentSecurityPolicy({
    directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'wss:'],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        frameSrc: ["'none'"]
    }
}));
```

---

## 🔑 Secrets Management

### Environment Variables

**Store secrets in .env:**
```bash
# .env (NEVER commit to repository)
GOOGLE_API_KEY=your_api_key_here
OBS_WEBSOCKET_PASSWORD=your_password_here
ENCRYPTION_KEY=your_encryption_key_here
```

**Load in application:**
```javascript
require('dotenv').config();

const googleApiKey = process.env.GOOGLE_API_KEY;
if (!googleApiKey) {
    logger.error('GOOGLE_API_KEY not set in environment');
    process.exit(1);
}
```

### .gitignore Configuration

**Ensure secrets are ignored:**
```
# .gitignore
.env
.env.local
.env.production
*.db
user_configs/
user_data/
logs/
```

### Secrets in Code Review

**Check for leaked secrets before commit:**
```bash
# Use git-secrets or similar tool
git secrets --scan

# Manual check
grep -r "api_key\|password\|secret" --include="*.js" --exclude-dir=node_modules
```

---

## 📦 Dependencies & Updates

### Dependency Security

**Audit dependencies regularly:**
```bash
npm audit
npm audit fix
```

**Check for vulnerabilities:**
```bash
# Before adding dependency
npm audit add <package-name>

# Check specific package
npm audit <package-name>
```

### Update Strategy

**Keep dependencies updated:**
```bash
# Check for outdated packages
npm outdated

# Update minor/patch versions
npm update

# Update major versions (test thoroughly!)
npm install <package-name>@latest
```

### Security Advisories

**Monitor security advisories:**
- GitHub Security Advisories
- npm security advisories
- Snyk vulnerability database

---

## ✅ Security Checklist

### Before Committing Code

- [ ] No hardcoded secrets or API keys
- [ ] All user input validated
- [ ] SQL queries use prepared statements
- [ ] Output properly sanitized (HTML, SQL)
- [ ] Error messages don't leak sensitive info
- [ ] Logging doesn't include secrets
- [ ] Rate limiting implemented for APIs
- [ ] File paths sanitized (no directory traversal)
- [ ] Dependencies audited for vulnerabilities

### Before Pull Request

- [ ] Code review completed
- [ ] Security review completed
- [ ] All tests passing
- [ ] No new security warnings
- [ ] Documentation updated
- [ ] CHANGELOG updated

### Before Release

- [ ] Full security audit
- [ ] Dependency vulnerabilities fixed
- [ ] All secrets in environment variables
- [ ] .gitignore properly configured
- [ ] Rate limiting tested
- [ ] Input validation tested
- [ ] Error handling tested
- [ ] Production environment configured

### Plugin Security

- [ ] Plugin permissions declared
- [ ] Plugin data stored in persistent directory
- [ ] Plugin doesn't access file system directly
- [ ] Plugin validates all inputs
- [ ] Plugin doesn't execute arbitrary code
- [ ] Plugin doesn't expose sensitive data

---

## 🔗 Related Documentation

- `/infos/DEVELOPMENT.md` - Development guide
- `/infos/TESTING.md` - Testing guidelines
- `/infos/PLUGIN_DEVELOPMENT.md` - Plugin development
- `/infos/ARCHITECTURE.md` - System architecture

---

## 📞 Reporting Security Issues

**Found a security vulnerability?**

**DO NOT** create a public issue. Instead:

1. Email: loggableim@gmail.com
2. Subject: "SECURITY: [Brief Description]"
3. Include:
   - Description of vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

**Response Time:** Within 48 hours

---

*Last Updated: 2026-01-20*  
*Version: 1.2.2*
