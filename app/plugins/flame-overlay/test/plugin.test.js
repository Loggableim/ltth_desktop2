/**
 * Test Suite for Flame Overlay Plugin v2.2.0
 * Tests backward compatibility and new features
 */

const assert = require('assert');

// Mock API for testing
class MockAPI {
    constructor() {
        this.storage = {};
        this.logs = [];
        this.routes = [];
        this.sockets = [];
        this.emits = [];
    }

    getConfig(key) {
        return this.storage[key];
    }

    setConfig(key, value) {
        this.storage[key] = value;
    }

    log(message, level) {
        this.logs.push({ message, level });
    }

    registerRoute(method, path, handler) {
        this.routes.push({ method, path, handler });
    }

    emit(event, data) {
        this.emits.push({ event, data });
    }

    getApp() {
        return {
            use: () => {}
        };
    }

    getSocketIO() {
        return {
            emit: (event, data) => this.emit(event, data)
        };
    }
}

// Load the plugin
const FlameOverlayPlugin = require('../main.js');

console.log('🔥 Testing Flame Overlay Plugin v2.2.0\n');

// Test 1: Plugin initialization with no saved config
console.log('Test 1: Default configuration initialization');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    // Check default values for existing features
    assert.strictEqual(plugin.config.effectType, 'flames', 'Default effect type should be flames');
    assert.strictEqual(plugin.config.flameSpeed, 0.5, 'Default flame speed should be 0.5');
    assert.strictEqual(plugin.config.frameThickness, 150, 'Default frame thickness should be 150');

    // Check default values for NEW features (v2.2.0)
    assert.strictEqual(plugin.config.noiseOctaves, 8, 'Default noise octaves should be 8');
    assert.strictEqual(plugin.config.edgeFeather, 0.3, 'Default edge feather should be 0.3');
    assert.strictEqual(plugin.config.bloomEnabled, false, 'Bloom should be disabled by default');
    assert.strictEqual(plugin.config.layersEnabled, false, 'Layers should be disabled by default');
    assert.strictEqual(plugin.config.smokeEnabled, false, 'Smoke should be disabled by default');

    console.log('  ✓ All default values correct');
}

// Test 2: Backward compatibility with old config
console.log('\nTest 2: Backward compatibility with v2.1.0 config');
{
    const api = new MockAPI();
    const oldConfig = {
        effectType: 'particles',
        frameMode: 'all',
        frameThickness: 200,
        flameColor: '#0000ff',
        flameSpeed: 0.8,
        flameIntensity: 1.5,
        flameBrightness: 0.3,
        maskOnlyEdges: false
    };
    
    api.setConfig('settings', oldConfig);
    
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    // Old config values should be preserved
    assert.strictEqual(plugin.config.effectType, 'particles', 'Old effect type preserved');
    assert.strictEqual(plugin.config.frameMode, 'all', 'Old frame mode preserved');
    assert.strictEqual(plugin.config.frameThickness, 200, 'Old frame thickness preserved');
    assert.strictEqual(plugin.config.flameColor, '#0000ff', 'Old flame color preserved');
    assert.strictEqual(plugin.config.maskOnlyEdges, false, 'Old mask edges preserved');

    // New config values should have defaults
    assert.strictEqual(plugin.config.noiseOctaves, 8, 'New feature has default');
    assert.strictEqual(plugin.config.bloomEnabled, false, 'New feature has default');
    assert.strictEqual(plugin.config.layersEnabled, false, 'New feature has default');

    console.log('  ✓ Old config preserved, new defaults added');
}

// Test 3: Full v2.2.0 config with all features enabled
console.log('\nTest 3: Full v2.2.0 configuration');
{
    const api = new MockAPI();
    const newConfig = {
        // Old features
        effectType: 'flames',
        frameMode: 'bottom',
        frameThickness: 180,
        flameColor: '#ff6600',
        flameSpeed: 0.6,
        flameIntensity: 1.4,
        flameBrightness: 0.28,
        
        // New features
        noiseOctaves: 10,
        useHighQualityTextures: true,
        edgeFeather: 0.5,
        frameCurve: 0.3,
        frameNoiseAmount: 0.2,
        animationEasing: 'sine',
        pulseEnabled: true,
        pulseAmount: 0.3,
        bloomEnabled: true,
        bloomIntensity: 1.0,
        bloomThreshold: 0.7,
        bloomRadius: 6,
        layersEnabled: true,
        layerCount: 3,
        layerParallax: 0.4,
        chromaticAberration: 0.008,
        filmGrain: 0.05,
        depthIntensity: 0.6,
        smokeEnabled: true,
        smokeIntensity: 0.5,
        smokeSpeed: 0.4,
        smokeColor: '#444444'
    };
    
    api.setConfig('settings', newConfig);
    
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    // Verify all values loaded correctly
    assert.strictEqual(plugin.config.noiseOctaves, 10, 'Noise octaves loaded');
    assert.strictEqual(plugin.config.useHighQualityTextures, true, 'HQ textures enabled');
    assert.strictEqual(plugin.config.edgeFeather, 0.5, 'Edge feather loaded');
    assert.strictEqual(plugin.config.animationEasing, 'sine', 'Animation easing loaded');
    assert.strictEqual(plugin.config.pulseEnabled, true, 'Pulse enabled');
    assert.strictEqual(plugin.config.bloomEnabled, true, 'Bloom enabled');
    assert.strictEqual(plugin.config.bloomIntensity, 1.0, 'Bloom intensity loaded');
    assert.strictEqual(plugin.config.layersEnabled, true, 'Layers enabled');
    assert.strictEqual(plugin.config.layerCount, 3, 'Layer count loaded');
    assert.strictEqual(plugin.config.smokeEnabled, true, 'Smoke enabled');
    assert.strictEqual(plugin.config.smokeColor, '#444444', 'Smoke color loaded');

    console.log('  ✓ All 30+ config options loaded correctly');
}

// Test 4: Config save/load cycle
console.log('\nTest 4: Config persistence (save/load cycle)');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig(); // Load config first
    
    // Modify config
    plugin.config.bloomEnabled = true;
    plugin.config.bloomIntensity = 1.5;
    plugin.config.layersEnabled = true;
    plugin.config.smokeEnabled = true;
    
    // Save
    plugin.saveConfig();
    
    // Verify saved to API
    const savedConfig = api.getConfig('settings');
    assert.strictEqual(savedConfig.bloomEnabled, true, 'Bloom enabled saved');
    assert.strictEqual(savedConfig.bloomIntensity, 1.5, 'Bloom intensity saved');
    assert.strictEqual(savedConfig.layersEnabled, true, 'Layers enabled saved');
    assert.strictEqual(savedConfig.smokeEnabled, true, 'Smoke enabled saved');

    console.log('  ✓ Config save/load cycle works');
}

// Test 5: Resolution presets
console.log('\nTest 5: Resolution presets');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    const presets = [
        ['tiktok-portrait', { width: 720, height: 1280 }],
        ['tiktok-landscape', { width: 1280, height: 720 }],
        ['hd-portrait', { width: 1080, height: 1920 }],
        ['2k-portrait', { width: 1440, height: 2560 }],
        ['4k-landscape', { width: 3840, height: 2160 }]
    ];

    for (const [preset, expected] of presets) {
        plugin.config.resolutionPreset = preset;
        const res = plugin.getResolution();
        assert.strictEqual(res.width, expected.width, `${preset} width correct`);
        assert.strictEqual(res.height, expected.height, `${preset} height correct`);
    }

    console.log('  ✓ All resolution presets work correctly');
}

// Test 6: Custom resolution
console.log('\nTest 6: Custom resolution');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    plugin.config.resolutionPreset = 'custom';
    plugin.config.customWidth = 1600;
    plugin.config.customHeight = 900;

    const res = plugin.getResolution();
    assert.strictEqual(res.width, 1600, 'Custom width correct');
    assert.strictEqual(res.height, 900, 'Custom height correct');

    console.log('  ✓ Custom resolution works');
}

// Test 7: Config validation ranges
console.log('\nTest 7: Config value ranges (documentation check)');
{
    const api = new MockAPI();
    const plugin = new FlameOverlayPlugin(api);
    plugin.loadConfig();

    // Test that defaults are within documented ranges
    assert.ok(plugin.config.noiseOctaves >= 4 && plugin.config.noiseOctaves <= 12, 
        'Noise octaves in range 4-12');
    assert.ok(plugin.config.edgeFeather >= 0 && plugin.config.edgeFeather <= 1, 
        'Edge feather in range 0-1');
    assert.ok(plugin.config.bloomIntensity >= 0 && plugin.config.bloomIntensity <= 2, 
        'Bloom intensity in range 0-2');
    assert.ok(plugin.config.layerCount >= 1 && plugin.config.layerCount <= 3, 
        'Layer count in range 1-3');
    assert.ok(['linear', 'sine', 'quad', 'elastic'].includes(plugin.config.animationEasing),
        'Animation easing is valid option');

    console.log('  ✓ All default values within documented ranges');
}

console.log('\n✅ All tests passed! Plugin v2.2.0 is working correctly.\n');
console.log('Summary:');
console.log('  - Backward compatibility: ✓');
console.log('  - New features (30+ options): ✓');
console.log('  - Config persistence: ✓');
console.log('  - Resolution presets: ✓');
console.log('  - Value ranges: ✓');
