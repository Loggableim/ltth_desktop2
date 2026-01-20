# Testing Guide

**PupCid's Little TikTool Helper (LTTH)**  
**Version:** 1.2.2  
**Last Updated:** 2026-01-20

---

## 📑 Table of Contents

1. [Testing Overview](#testing-overview)
2. [Manual Testing](#manual-testing)
3. [Automated Testing](#automated-testing)
4. [Integration Testing](#integration-testing)
5. [Plugin Testing](#plugin-testing)
6. [API Testing](#api-testing)
7. [Frontend Testing](#frontend-testing)
8. [Performance Testing](#performance-testing)
9. [Testing Best Practices](#testing-best-practices)

---

## 🔍 Testing Overview

### Current State

LTTH currently relies primarily on **manual testing** due to the complexity of real-time TikTok integration and external dependencies (OBS, VRChat, etc.). Limited automated test infrastructure exists.

### Testing Philosophy

- **Manual testing is primary** for real-world scenarios
- **Automated tests** for core logic and utilities
- **Integration tests** for external APIs
- **Regression testing** before releases

### Test Infrastructure

```
app/
├── test/                    # Test files
│   ├── database.test.js    # Database tests
│   ├── flows.test.js       # Flow engine tests
│   └── validators.test.js  # Validation tests
│
plugins/<plugin-id>/
└── test/                    # Plugin tests
    └── main.test.js
```

---

## 🖐️ Manual Testing

### Pre-Commit Test Checklist

Before committing code or submitting a PR, verify:

#### TikTok Connection
- [ ] Connection to TikTok LIVE successful
- [ ] Gift events received and parsed correctly
- [ ] Chat events received and displayed
- [ ] Follow events trigger properly
- [ ] Subscribe events work
- [ ] Share events detected
- [ ] Like events handled (with rate limiting)
- [ ] Connection recovery after disconnect
- [ ] Multiple simultaneous events handled

#### Alerts
- [ ] Test alert displays correctly
- [ ] Alert shows in overlay (OBS browser source)
- [ ] Alert sound plays at correct volume
- [ ] Alert disappears after specified duration
- [ ] Multiple alerts queue properly
- [ ] Alert animations work smoothly
- [ ] Custom alert templates render correctly

#### Text-to-Speech (TTS)
- [ ] Test TTS speaks correctly
- [ ] Voice selection works
- [ ] Volume adjustment works
- [ ] Speed adjustment works
- [ ] Queue handles multiple TTS messages
- [ ] Queue doesn't overflow (100+ messages)
- [ ] User-specific voices remembered
- [ ] Language detection works

#### Goals
- [ ] Goal increment works correctly
- [ ] Goal overlay shows accurate value
- [ ] Goal reset works
- [ ] Progress bar updates in real-time
- [ ] Multiple goals tracked separately
- [ ] Goal completion triggers events

#### Flows (Automation)
- [ ] Flow creation works
- [ ] Flow test button triggers actions
- [ ] Flow activates on real TikTok events
- [ ] Condition evaluation works (all operators)
- [ ] Actions execute in sequence
- [ ] Flow enable/disable works
- [ ] Flow logs created in user_data/flow_logs/

#### Plugins
- [ ] Plugin can be enabled via UI
- [ ] Plugin can be disabled via UI
- [ ] Plugin configuration saves correctly
- [ ] Plugin persists after server restart
- [ ] Plugin hot-reload works
- [ ] Plugin data directory created
- [ ] Plugin routes accessible
- [ ] Plugin Socket.IO events work

#### OBS Integration
- [ ] OBS WebSocket connection successful
- [ ] Scene switching works
- [ ] Source visibility toggle works
- [ ] Scene list retrieved correctly

#### Database
- [ ] Settings save correctly
- [ ] Settings load on startup
- [ ] Database doesn't lock (WAL mode)
- [ ] No data corruption after crash

#### Frontend
- [ ] Dashboard loads correctly
- [ ] All sidebar links work
- [ ] Socket.IO connection established
- [ ] Real-time updates display
- [ ] No console errors
- [ ] Responsive design works on different screen sizes

### Testing TikTok Integration

**Setup:**
1. Start LTTH server
2. Open dashboard
3. Enter TikTok username
4. Click "Connect"

**Test Scenarios:**

**Gift Event Testing:**
```
1. Send small gift (Rose - 1 coin)
   - Verify alert displays
   - Verify leaderboard updates
   - Verify goal increments
   - Verify flow triggers (if configured)

2. Send large gift (Lion - 500 coins)
   - Verify different alert template
   - Verify top gifter updates

3. Send combo gift (multiple count)
   - Verify count displayed correctly
   - Verify total coins calculated right
```

**Chat Event Testing:**
```
1. Send simple chat message
   - Verify displayed in dashboard
   - Verify TTS speaks (if enabled)

2. Send message with special characters
   - Verify sanitized correctly
   - Verify no XSS vulnerability

3. Send spam messages (10+ rapid)
   - Verify rate limiting works
   - Verify TTS queue doesn't overflow
```

### Testing Overlays in OBS

**Setup:**
1. Open OBS Studio
2. Add Browser Source
3. URL: `http://localhost:3000/overlay.html`
4. Width: 1920, Height: 1080
5. Check "Shutdown source when not visible"

**Test:**
- Send test alert from dashboard
- Verify alert appears in OBS
- Verify transparency works
- Verify no performance issues
- Verify alert clears correctly

---

## 🤖 Automated Testing

### Running Tests

```bash
cd app
npm test                # Run all tests with Jest
npm run test:watch      # Watch mode
npm run test:coverage   # Coverage report
node test/specific.test.js  # Run individual test
```

### Writing Tests

**Example Test (Jest):**

```javascript
// test/database.test.js
const Database = require('../modules/database');

describe('Database', () => {
    let db;
    
    beforeEach(() => {
        db = new Database(':memory:'); // Use in-memory DB for tests
    });
    
    afterEach(() => {
        db.close();
    });
    
    test('should set and get setting', () => {
        db.setSetting('testKey', 'testValue');
        const value = db.getSetting('testKey');
        expect(value).toBe('testValue');
    });
    
    test('should return null for non-existent setting', () => {
        const value = db.getSetting('nonExistent');
        expect(value).toBeNull();
    });
    
    test('should store JSON objects', () => {
        const obj = { key: 'value', nested: { data: 123 } };
        db.setSetting('jsonTest', JSON.stringify(obj));
        const retrieved = JSON.parse(db.getSetting('jsonTest'));
        expect(retrieved).toEqual(obj);
    });
});
```

**Example Test for Validators:**

```javascript
// test/validators.test.js
const { validateUsername, validateSettings } = require('../modules/validators');

describe('Validators', () => {
    describe('validateUsername', () => {
        test('should accept valid username', () => {
            expect(validateUsername('validuser123')).toBe(true);
        });
        
        test('should reject empty username', () => {
            expect(validateUsername('')).toBe(false);
        });
        
        test('should reject username with spaces', () => {
            expect(validateUsername('user name')).toBe(false);
        });
        
        test('should reject username with special chars', () => {
            expect(validateUsername('user@name')).toBe(false);
        });
    });
});
```

### Mocking External Dependencies

**Mock TikTok Connector:**

```javascript
// test/flows.test.js
jest.mock('../modules/tiktok', () => {
    return {
        TikTokConnector: jest.fn().mockImplementation(() => {
            return {
                on: jest.fn(),
                connect: jest.fn().mockResolvedValue(true),
                disconnect: jest.fn().mockResolvedValue(true)
            };
        })
    };
});
```

---

## 🔗 Integration Testing

### Testing External APIs

**OBS WebSocket Test:**

```javascript
const OBSWebSocket = require('obs-websocket-js').default;

async function testOBSConnection() {
    const obs = new OBSWebSocket();
    
    try {
        await obs.connect('ws://localhost:4455', 'password');
        console.log('✅ OBS connected');
        
        const scenes = await obs.call('GetSceneList');
        console.log('✅ Scenes retrieved:', scenes.scenes.length);
        
        await obs.disconnect();
        console.log('✅ OBS disconnected');
    } catch (error) {
        console.error('❌ OBS test failed:', error.message);
    }
}

testOBSConnection();
```

**OSC Protocol Test:**

```javascript
const osc = require('osc');

function testOSC() {
    const udpPort = new osc.UDPPort({
        localAddress: '0.0.0.0',
        localPort: 9001,
        remoteAddress: '127.0.0.1',
        remotePort: 9000
    });
    
    udpPort.open();
    
    udpPort.on('ready', () => {
        console.log('✅ OSC port opened');
        
        udpPort.send({
            address: '/avatar/parameters/Wave',
            args: [{ type: 'i', value: 1 }]
        });
        
        console.log('✅ OSC message sent');
    });
    
    udpPort.on('error', (error) => {
        console.error('❌ OSC error:', error);
    });
}

testOSC();
```

---

## 🔌 Plugin Testing

### Plugin Test Structure

```javascript
// plugins/my-plugin/test/main.test.js
const MyPlugin = require('../main');

describe('MyPlugin', () => {
    let plugin;
    let mockApi;
    
    beforeEach(() => {
        // Create mock API
        mockApi = {
            log: jest.fn(),
            getConfig: jest.fn(),
            setConfig: jest.fn(),
            registerRoute: jest.fn(),
            registerSocket: jest.fn(),
            registerTikTokEvent: jest.fn(),
            emit: jest.fn()
        };
        
        // Instantiate plugin
        plugin = new MyPlugin(mockApi);
    });
    
    test('should initialize correctly', async () => {
        await plugin.init();
        expect(mockApi.log).toHaveBeenCalledWith(expect.stringContaining('initialized'));
    });
    
    test('should register routes', async () => {
        await plugin.init();
        expect(mockApi.registerRoute).toHaveBeenCalled();
    });
    
    test('should clean up on destroy', async () => {
        await plugin.init();
        await plugin.destroy();
        expect(mockApi.log).toHaveBeenCalledWith(expect.stringContaining('stopped'));
    });
});
```

### Manual Plugin Testing

**Test Plugin Load:**
```bash
# Check logs for plugin initialization
tail -f logs/combined.log | grep "Plugin"
```

**Test Plugin Routes:**
```bash
curl http://localhost:3000/api/plugins/my-plugin/status
```

**Test Plugin Socket Events:**
```javascript
// In browser console
socket.emit('myplugin:test', { data: 'test' });
```

---

## 🌐 API Testing

### Using curl

**TikTok Connection:**
```bash
curl -X POST http://localhost:3000/api/connect \
  -H "Content-Type: application/json" \
  -d '{"username": "test_user"}'
```

**Get Settings:**
```bash
curl http://localhost:3000/api/settings
```

**Update Setting:**
```bash
curl -X POST http://localhost:3000/api/settings \
  -H "Content-Type: application/json" \
  -d '{"key": "testKey", "value": "testValue"}'
```

**Plugin Management:**
```bash
# List plugins
curl http://localhost:3000/api/plugins/list

# Enable plugin
curl -X POST http://localhost:3000/api/plugins/enable/my-plugin

# Disable plugin
curl -X POST http://localhost:3000/api/plugins/disable/my-plugin
```

### Using Postman

**Create Collection:**

1. Import collection from `docs/postman_collection.json`
2. Set environment variable `baseUrl` = `http://localhost:3000`
3. Run collection tests

**Example Collection:**

```json
{
  "info": {
    "name": "LTTH API Tests"
  },
  "item": [
    {
      "name": "Connect to TikTok",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/api/connect",
        "body": {
          "mode": "raw",
          "raw": "{\"username\": \"test_user\"}"
        }
      }
    },
    {
      "name": "Get Plugin List",
      "request": {
        "method": "GET",
        "url": "{{baseUrl}}/api/plugins/list"
      }
    }
  ]
}
```

---

## 🎨 Frontend Testing

### Browser Console Testing

**Test Socket.IO Connection:**
```javascript
// In browser console (dashboard page)
socket.emit('test', { data: 'test' });
socket.on('test-response', (data) => console.log(data));
```

**Test API Calls:**
```javascript
fetch('/api/settings')
  .then(res => res.json())
  .then(data => console.log(data));
```

**Simulate Events:**
```javascript
// Simulate gift event
socket.emit('tiktok:gift', {
    username: 'testuser',
    giftName: 'Rose',
    coins: 1
});
```

### Visual Regression Testing

**Overlay Testing:**
1. Open overlay in browser
2. Trigger test alert
3. Screenshot at key frames
4. Compare with reference screenshots

---

## ⚡ Performance Testing

### Load Testing

**Simulate High Event Rate:**

```javascript
// test/load-test.js
const io = require('socket.io-client');

const socket = io('http://localhost:3000');

// Simulate 100 gifts per second
setInterval(() => {
    for (let i = 0; i < 100; i++) {
        socket.emit('tiktok:gift', {
            username: `user${i}`,
            giftName: 'Rose',
            coins: 1
        });
    }
}, 1000);
```

**Monitor Performance:**
```bash
# CPU/Memory usage
top -p $(pgrep -f "node.*server.js")

# Database size
ls -lh user_configs/*/database.db
```

### Stress Testing

**Test Plugin Hot-Reload:**
```bash
# Rapidly enable/disable plugin
for i in {1..10}; do
  curl -X POST http://localhost:3000/api/plugins/disable/my-plugin
  sleep 1
  curl -X POST http://localhost:3000/api/plugins/enable/my-plugin
  sleep 1
done
```

---

## ✅ Testing Best Practices

### 1. Test Data Management

**Use separate test database:**
```javascript
const testDb = new Database(':memory:');
```

**Clean up after tests:**
```javascript
afterEach(() => {
    // Reset state
    testDb.exec('DELETE FROM settings');
});
```

### 2. Mock External Dependencies

**Don't rely on live TikTok connection:**
```javascript
const mockTikTok = {
    connect: jest.fn().mockResolvedValue(true),
    on: jest.fn()
};
```

### 3. Test Edge Cases

**Test boundary conditions:**
```javascript
test('should handle empty gift name', () => {
    expect(() => handleGift({ giftName: '' })).not.toThrow();
});

test('should handle very long username', () => {
    const longName = 'a'.repeat(1000);
    expect(validateUsername(longName)).toBe(false);
});
```

### 4. Test Error Handling

**Verify errors are caught:**
```javascript
test('should handle database error gracefully', async () => {
    db.prepare = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
    });
    
    await expect(saveSetting('key', 'value')).rejects.toThrow();
});
```

### 5. Document Test Cases

**Add descriptive test names:**
```javascript
test('should emit Socket.IO event when gift received from TikTok', async () => {
    // Test implementation
});
```

### 6. Regression Testing

**Before each release:**
- Run full manual test checklist
- Test all 31 plugins individually
- Test all overlays in OBS
- Test with real TikTok LIVE stream
- Test plugin hot-reload
- Test server restart

---

## 🔗 Related Documentation

- `/infos/DEVELOPMENT.md` - Development guide
- `/infos/PLUGIN_DEVELOPMENT.md` - Plugin development
- `/infos/SECURITY.md` - Security testing
- `/infos/ARCHITECTURE.md` - System architecture

---

*Last Updated: 2026-01-20*  
*Version: 1.2.2*
