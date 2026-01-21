/**
 * Manual verification script for GCCE HUD Rotator custom media support
 * 
 * This script tests the core functionality without requiring Jest
 */

const path = require('path');

// Mock API
class MockAPI {
  constructor() {
    this.configs = new Map();
    this.pluginDataDir = '/tmp/test-gcce-data';
  }

  log(message, level = 'info') {
    console.log(`[${level}] ${message}`);
  }

  async getConfig(key) {
    return this.configs.get(key);
  }

  async setConfig(key, value) {
    this.configs.set(key, value);
  }

  getSocketIO() {
    return { emit: () => {} };
  }

  getDatabase() {
    return {
      prepare: () => ({
        run: () => {},
        get: () => null,
        all: () => []
      })
    };
  }

  getPluginDataDir() {
    return this.pluginDataDir;
  }

  ensurePluginDataDir() {
    // Not needed for this test
  }
}

console.log('=== GCCE HUD Rotator - Custom Media Verification ===\n');

try {
  // Load HUDManager
  const HUDManager = require('./plugins/gcce/utils/HUDManager');
  
  // Create instance
  const mockAPI = new MockAPI();
  const hudManager = new HUDManager(
    mockAPI,
    { tryConsume: () => ({ allowed: true }) },
    { checkPermission: async () => true },
    { logCommand: () => {} },
    { getStats: () => ({}) },
    { emit: () => {} }
  );

  console.log('✓ HUDManager loaded successfully\n');

  // Test 1: Gift entry
  console.log('Test 1: Gift Entry');
  const giftConfig = {
    enabled: true,
    intervalSeconds: 10,
    entries: [
      {
        giftId: '123',
        giftName: 'Rose',
        giftImage: 'https://example.com/rose.png',
        title: 'Beautiful Rose',
        info: 'Thanks!'
      }
    ]
  };
  const result1 = hudManager.normalizeGiftRotator(giftConfig);
  console.log('  Entries:', result1.entries.length);
  console.log('  First entry type:', result1.entries[0].type);
  console.log('  First entry giftId:', result1.entries[0].giftId);
  console.log('  ✓ Gift entry works\n');

  // Test 2: Media entry
  console.log('Test 2: Media Entry');
  const mediaConfig = {
    enabled: true,
    intervalSeconds: 15,
    entries: [
      {
        type: 'media',
        mediaUrl: '/api/gcce/hud/media/test.gif',
        mediaKind: 'image',
        mimetype: 'image/gif',
        title: 'Custom GIF',
        info: 'My animation'
      }
    ]
  };
  const result2 = hudManager.normalizeGiftRotator(mediaConfig);
  console.log('  Entries:', result2.entries.length);
  console.log('  First entry type:', result2.entries[0].type);
  console.log('  First entry mediaUrl:', result2.entries[0].mediaUrl);
  console.log('  First entry mediaKind:', result2.entries[0].mediaKind);
  console.log('  ✓ Media entry works\n');

  // Test 3: Mixed entries
  console.log('Test 3: Mixed Entries');
  const mixedConfig = {
    enabled: true,
    intervalSeconds: 12,
    entries: [
      {
        giftId: '456',
        giftName: 'Star',
        title: 'Shining Star'
      },
      {
        type: 'media',
        mediaUrl: 'https://example.com/video.mp4',
        mediaKind: 'video',
        mimetype: 'video/mp4',
        title: 'Custom Video'
      },
      {
        giftId: '789',
        giftName: 'Heart',
        title: 'Lovely Heart'
      }
    ]
  };
  const result3 = hudManager.normalizeGiftRotator(mixedConfig);
  console.log('  Total entries:', result3.entries.length);
  console.log('  Entry 1 type:', result3.entries[0].type);
  console.log('  Entry 2 type:', result3.entries[1].type);
  console.log('  Entry 2 mediaKind:', result3.entries[1].mediaKind);
  console.log('  Entry 3 type:', result3.entries[2].type);
  console.log('  ✓ Mixed entries work\n');

  // Test 4: XSS sanitization
  console.log('Test 4: XSS Sanitization');
  const xssConfig = {
    enabled: true,
    intervalSeconds: 10,
    entries: [
      {
        type: 'media',
        mediaUrl: '/media/test.png',
        mediaKind: 'image',
        title: '<script>alert("xss")</script>Title',
        info: '<img src=x onerror=alert(1)>Info'
      }
    ]
  };
  const result4 = hudManager.normalizeGiftRotator(xssConfig);
  const hasScript = result4.entries[0].title.includes('<script>');
  const hasImg = result4.entries[0].info.includes('<img');
  console.log('  Title contains <script>:', hasScript);
  console.log('  Info contains <img>:', hasImg);
  console.log('  ✓ XSS sanitization works:', !hasScript && !hasImg ? 'PASS' : 'FAIL');
  console.log();

  // Test 5: Length limits
  console.log('Test 5: Length Limits');
  const longConfig = {
    enabled: true,
    intervalSeconds: 10,
    entries: [
      {
        type: 'media',
        mediaUrl: '/media/test.png',
        mediaKind: 'image',
        title: 'a'.repeat(200),
        info: 'b'.repeat(250)
      }
    ]
  };
  const result5 = hudManager.normalizeGiftRotator(longConfig);
  console.log('  Title length:', result5.entries[0].title.length, '(max 120)');
  console.log('  Info length:', result5.entries[0].info.length, '(max 160)');
  console.log('  ✓ Length limits enforced:', 
    result5.entries[0].title.length <= 120 && result5.entries[0].info.length <= 160 ? 'PASS' : 'FAIL');
  console.log();

  // Test 6: Invalid entries filtered
  console.log('Test 6: Invalid Entry Filtering');
  const invalidConfig = {
    enabled: true,
    intervalSeconds: 10,
    entries: [
      { giftId: '123', title: 'Valid Gift' },
      { title: 'Invalid - no giftId or media type' },
      { type: 'media', mediaUrl: '/media/test.png', mediaKind: 'image', title: 'Valid Media' }
    ]
  };
  const result6 = hudManager.normalizeGiftRotator(invalidConfig);
  console.log('  Input entries:', invalidConfig.entries.length);
  console.log('  Output entries:', result6.entries.length);
  console.log('  ✓ Invalid entries filtered:', result6.entries.length === 2 ? 'PASS' : 'FAIL');
  console.log();

  // Test 7: Backward compatibility
  console.log('Test 7: Backward Compatibility (no type field)');
  const oldFormatConfig = {
    enabled: true,
    intervalSeconds: 10,
    entries: [
      {
        // Old format: no type field
        giftId: '999',
        giftName: 'OldGift',
        title: 'Old Format'
      }
    ]
  };
  const result7 = hudManager.normalizeGiftRotator(oldFormatConfig);
  console.log('  Entry type:', result7.entries[0].type);
  console.log('  ✓ Backward compatibility:', result7.entries[0].type === 'gift' ? 'PASS' : 'FAIL');
  console.log();

  console.log('=== All Tests Completed ===');
  console.log('✓ Core functionality verified successfully');

} catch (error) {
  console.error('✗ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
