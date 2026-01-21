/**
 * ClarityHUD Plugin
 *
 * Provides two ultra-minimalistic, VR-optimized and accessible HUD overlays:
 * - /overlay/clarity/chat - Chat-only HUD
 * - /overlay/clarity/full - Full Activity HUD with layout modes
 */

const path = require('path');
const ClarityHUDBackend = require('./backend/api');

class ClarityHUDPlugin {
  constructor(api) {
    this.api = api;
    this.pluginId = 'clarityhud';
    this.backend = null;
  }

  /**
   * Initialize plugin
   */
  async init() {
    this.api.log('ClarityHUD plugin loading...');

    // Initialize backend
    this.backend = new ClarityHUDBackend(this.api);
    await this.backend.initialize();

    // Register routes
    this.registerRoutes();

    // Register event listeners
    this.registerEventListeners();

    this.api.log('ClarityHUD plugin loaded successfully');
  }

  /**
   * Register HTTP routes
   */
  registerRoutes() {
    // Helper function to set no-cache headers
    const setNoCacheHeaders = (res) => {
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    };

    // Serve chat overlay
    this.api.registerRoute('GET', '/overlay/clarity/chat', (req, res) => {
      const overlayPath = path.join(__dirname, 'overlays', 'chat.html');
      setNoCacheHeaders(res);
      res.sendFile(overlayPath);
    });

    // Serve full activity overlay
    this.api.registerRoute('GET', '/overlay/clarity/full', (req, res) => {
      const overlayPath = path.join(__dirname, 'overlays', 'full.html');
      setNoCacheHeaders(res);
      res.sendFile(overlayPath);
    });

    // Serve multi-stream overlay
    this.api.registerRoute('GET', '/overlay/clarity/multi', (req, res) => {
      const overlayPath = path.join(__dirname, 'overlays', 'multi.html');
      setNoCacheHeaders(res);
      res.sendFile(overlayPath);
    });

    // Serve plugin UI
    this.api.registerRoute('GET', '/clarityhud/ui', (req, res) => {
      const uiPath = path.join(__dirname, 'ui', 'main.html');
      setNoCacheHeaders(res);
      res.sendFile(uiPath);
    });

    // Serve library files
    this.api.registerRoute('GET', '/plugins/clarityhud/lib/animations.js', (req, res) => {
      const libPath = path.join(__dirname, 'lib', 'animations.js');
      setNoCacheHeaders(res);
      res.sendFile(libPath);
    });

    this.api.registerRoute('GET', '/plugins/clarityhud/lib/accessibility.js', (req, res) => {
      const libPath = path.join(__dirname, 'lib', 'accessibility.js');
      setNoCacheHeaders(res);
      res.sendFile(libPath);
    });

    this.api.registerRoute('GET', '/plugins/clarityhud/lib/layout-engine.js', (req, res) => {
      const libPath = path.join(__dirname, 'lib', 'layout-engine.js');
      setNoCacheHeaders(res);
      res.sendFile(libPath);
    });

    this.api.registerRoute('GET', '/plugins/clarityhud/lib/emoji-parser.js', (req, res) => {
      const libPath = path.join(__dirname, 'lib', 'emoji-parser.js');
      setNoCacheHeaders(res);
      res.sendFile(libPath);
    });

    this.api.registerRoute('GET', '/plugins/clarityhud/lib/badge-renderer.js', (req, res) => {
      const libPath = path.join(__dirname, 'lib', 'badge-renderer.js');
      setNoCacheHeaders(res);
      res.sendFile(libPath);
    });

    this.api.registerRoute('GET', '/plugins/clarityhud/lib/message-parser.js', (req, res) => {
      const libPath = path.join(__dirname, 'lib', 'message-parser.js');
      setNoCacheHeaders(res);
      res.sendFile(libPath);
    });

    this.api.registerRoute('GET', '/plugins/clarityhud/lib/virtual-scroller.js', (req, res) => {
      const libPath = path.join(__dirname, 'lib', 'virtual-scroller.js');
      setNoCacheHeaders(res);
      res.sendFile(libPath);
    });

    // Serve overlay JavaScript files
    this.api.registerRoute('GET', '/plugins/clarityhud/overlays/chat.js', (req, res) => {
      const jsPath = path.join(__dirname, 'overlays', 'chat.js');
      setNoCacheHeaders(res);
      res.sendFile(jsPath);
    });

    this.api.registerRoute('GET', '/plugins/clarityhud/overlays/full.js', (req, res) => {
      const jsPath = path.join(__dirname, 'overlays', 'full.js');
      setNoCacheHeaders(res);
      res.sendFile(jsPath);
    });

    // Serve multi-stream overlay JavaScript
    this.api.registerRoute('GET', '/plugins/clarityhud/overlays/multi.js', (req, res) => {
      const jsPath = path.join(__dirname, 'overlays', 'multi.js');
      setNoCacheHeaders(res);
      res.sendFile(jsPath);
    });

    // Serve UI JavaScript files
    this.api.registerRoute('GET', '/plugins/clarityhud/ui/main.js', (req, res) => {
      const jsPath = path.join(__dirname, 'ui', 'main.js');
      setNoCacheHeaders(res);
      res.sendFile(jsPath);
    });

    // API routes handled by backend
    this.backend.registerRoutes();

    this.api.log('Routes registered');
  }

  /**
   * Register TikTok event listeners
   */
  registerEventListeners() {
    // Chat events (both overlays)
    this.api.registerTikTokEvent('chat', async (data) => {
      await this.backend.handleChatEvent(data);
    });

    // Activity events (full overlay only)
    this.api.registerTikTokEvent('follow', async (data) => {
      await this.backend.handleFollowEvent(data);
    });

    this.api.registerTikTokEvent('share', async (data) => {
      await this.backend.handleShareEvent(data);
    });

    this.api.registerTikTokEvent('like', async (data) => {
      await this.backend.handleLikeEvent(data);
    });

    this.api.registerTikTokEvent('gift', async (data) => {
      await this.backend.handleGiftEvent(data);
    });

    this.api.registerTikTokEvent('subscribe', async (data) => {
      await this.backend.handleSubscribeEvent(data);
    });

    this.api.registerTikTokEvent('superfan', async (data) => {
      await this.backend.handleSubscribeEvent(data);
    });

    this.api.registerTikTokEvent('join', async (data) => {
      await this.backend.handleJoinEvent(data);
    });

    this.api.log('Event listeners registered');
  }

  /**
   * Cleanup on plugin unload
   */
  async destroy() {
    this.api.log('ClarityHUD plugin unloading...');
    if (this.backend) {
      await this.backend.cleanup();
    }
  }
}

module.exports = ClarityHUDPlugin;
