/**
 * Talking Heads Plugin - Main Class
 * AI-generated 2D avatars with synchronized animations for TikTok users speaking via TTS
 */

const path = require('path');
const fs = require('fs').promises;

// Import engines and utilities
const AvatarGenerator = require('./engines/avatar-generator');
const SpriteGenerator = require('./engines/sprite-generator');
const AnimationController = require('./engines/animation-controller');
const CacheManager = require('./utils/cache-manager');
const RoleManager = require('./utils/role-manager');
const { getAllStyleTemplates, getStyleKeys } = require('./utils/style-templates');

class TalkingHeadsPlugin {
  constructor(api) {
    this.api = api;
    this.logger = api.logger;
    this.io = api.getSocketIO();
    this.db = api.getDatabase();
    
    // Load configuration
    this.config = this._loadConfig();
    
    // Initialize managers and engines
    this.cacheManager = null;
    this.roleManager = null;
    this.avatarGenerator = null;
    this.spriteGenerator = null;
    this.animationController = null;
    this.activeImageProvider = 'siliconflow';
    this.logBuffer = [];
    this.maxLogEntries = 200;
    
    // TTS event tracking
    this.ttsEventQueue = [];
    this.processingTTS = false;
    
    // Custom voice users (loaded from TTS plugin config)
    this.customVoiceUsers = [];

    // Bridge handlers for TTS playback events
    this.ttsBridgeHandlers = null;
  }

  /**
   * Load plugin configuration from database
   * @returns {object} Configuration object
   * @private
   */
  _loadConfig() {
    const defaultConfig = {
      enabled: false,
      imageApiUrl: 'https://api.siliconflow.com/v1/images/generations',
      imageProvider: 'auto',
      openaiImageModel: 'dall-e-3',
      defaultStyle: 'cartoon',
      cacheEnabled: true,
      cacheDuration: 2592000000, // 30 days in milliseconds
      obsEnabled: true,
      obsHudEnabled: true,
      spawnAnimationMode: 'standard',
      spawnAnimationUrl: '',
      spawnAnimationVolume: 0.8,
      animationDuration: 5000,
      fadeInDuration: 300,
      fadeOutDuration: 300,
      blinkInterval: 3000,
      rolePermission: 'all',
      minTeamLevel: 0,
      requireSubscriber: false,
      requireCustomVoice: false,
      avatarResolution: 1500,
      spriteResolution: 512,
      debugLogging: false // Enable/disable detailed logging
    };

    const savedConfig = this.api.getConfig('talking_heads_config');
    const mergedConfig = savedConfig ? { ...defaultConfig, ...savedConfig } : defaultConfig;
    return {
      ...mergedConfig,
      imageApiUrl: this._normalizeImageApiUrl(
        mergedConfig.imageApiUrl,
        defaultConfig.imageApiUrl
      )
    };
  }

  /**
   * Normalize legacy SiliconFlow image API URLs
   * - Switches deprecated .cn domain to .com
   * - Fixes singular /image/ path to /images/
   * @param {string} url - Configured URL
   * @param {string} fallback - Fallback URL if normalization fails
   * @returns {string} Normalized URL
   * @private
   */
  _normalizeImageApiUrl(url, fallback = null) {
    const safeDefault = 'https://api.siliconflow.com/v1/images/generations';
    if (!url) return fallback || safeDefault;

    try {
      const parsed = new URL(url.trim());
      if (parsed.hostname === 'api.siliconflow.cn') {
        parsed.hostname = 'api.siliconflow.com';
      }
      if (parsed.pathname === '/v1/image/generations') {
        parsed.pathname = '/v1/images/generations';
      }
      return parsed.toString();
    } catch (error) {
      this._log(`Failed to normalize imageApiUrl: ${error.message}`, 'warn');
      return fallback || safeDefault;
    }
  }

  /**
   * Get SiliconFlow API key from global settings
   * @returns {string|null} SiliconFlow API key
   * @private
   */
  _getSiliconFlowApiKey() {
    try {
      // Try global settings (centralized key)
      const key = this.db.getSetting('siliconflow_api_key') || 
                 this.db.getSetting('streamalchemy_siliconflow_api_key');
      if (key) {
        this._log(`Found SiliconFlow API key in database`, 'debug');
        return key;
      }
    } catch (error) {
      this._log(`Failed to get SiliconFlow key from settings: ${error.message}`, 'warn');
    }
    // Try environment variable
    const envKey = process.env.SILICONFLOW_API_KEY || null;
    if (envKey) {
      this._log(`Found SiliconFlow API key in environment`, 'debug');
    }
    return envKey;
  }

  /**
   * Get OpenAI API key from global settings or environment
   * @returns {string|null} OpenAI API key
   * @private
   */
  _getOpenAIApiKey() {
    try {
      const key = this.db.getSetting('openai_api_key') || this.db.getSetting('tts_openai_api_key');
      if (key) {
        this._log('Found OpenAI API key in database', 'debug');
        return key;
      }
    } catch (error) {
      this._log(`Failed to get OpenAI key from settings: ${error.message}`, 'warn');
    }

    const envKey = process.env.OPENAI_API_KEY || null;
    if (envKey) {
      this._log('Found OpenAI API key in environment', 'debug');
    }
    return envKey;
  }

  /**
   * Resolve which image provider and API key to use
   * @returns {{provider: string, apiKey: string|null, apiKeySource: string}}
   * @private
   */
  _resolveImageProvider() {
    const preference = this.config.imageProvider || 'auto';
    const openaiKey = this._getOpenAIApiKey();
    const siliconKey = this._getSiliconFlowApiKey();

    if (preference === 'openai') {
      return {
        provider: 'openai',
        apiKey: openaiKey,
        apiKeySource: openaiKey ? 'openai_settings' : 'none'
      };
    }

    if (preference === 'siliconflow') {
      return {
        provider: 'siliconflow',
        apiKey: siliconKey,
        apiKeySource: siliconKey ? 'global_settings' : 'none'
      };
    }

    if (openaiKey) {
      return { provider: 'openai', apiKey: openaiKey, apiKeySource: 'openai_settings' };
    }

    return { provider: 'siliconflow', apiKey: siliconKey, apiKeySource: siliconKey ? 'global_settings' : 'none' };
  }

  /**
   * Initialize or re-initialize avatar and sprite generators with current API key
   * @returns {boolean} True if generators were successfully initialized
   * @private
   */
  _initializeGenerators() {
    const { provider, apiKey } = this._resolveImageProvider();
    
    if (!apiKey) {
      this._log(`⚠️  No API key configured for ${provider} - avatar generation disabled`, 'warn');
      if (provider === 'openai') {
        this._log('Configure the API key in Dashboard > Settings > OpenAI API Configuration', 'info');
      } else {
        this._log('Configure the API key in Dashboard > Settings > TTS API Keys > SiliconFlow API Key', 'info');
      }
      return false;
    }

    this._log('Initializing AI engines...', 'debug');
    this.activeImageProvider = provider;
    
    this.avatarGenerator = new AvatarGenerator(
      provider === 'openai' ? 'https://api.openai.com/v1/images/generations' : this.config.imageApiUrl,
      apiKey,
      this.logger,
      { ...this.config, imageProvider: provider }
    );

    this.spriteGenerator = new SpriteGenerator(
      provider === 'openai' ? 'https://api.openai.com/v1/images/generations' : this.config.imageApiUrl,
      apiKey,
      this.logger,
      { ...this.config, imageProvider: provider }
    );

    this._log(`✅ Avatar and sprite generators initialized (${provider})`, 'info');
    return true;
  }

  /**
   * Log message with debug level control
   * @param {string} message - Log message
   * @param {string} level - Log level (info, warn, error, debug)
   * @param {object} data - Additional data to log
   * @private
   */
  _log(message, level = 'info', data = null) {
    const prefix = 'TalkingHeads:';
    const fullMessage = `${prefix} ${message}`;
    const entry = {
      level,
      message: fullMessage,
      data: data || null,
      timestamp: new Date().toISOString()
    };

    // Safety check
    if (!this.logger) {
      this._appendLogEntry(entry);
      console.warn('TalkingHeads: Logger not initialized');
      return;
    }
    
    // Always log errors and warnings
    if (level === 'error' || level === 'warn') {
      this._appendLogEntry(entry);
      this.logger[level](fullMessage, data || '');
      return;
    }
    
    // Log info and debug based on debugLogging setting
    // Default to false if config or debugLogging is undefined
    const debugEnabled = this.config && this.config.debugLogging === true;
    if (level === 'debug' && !debugEnabled) {
      return; // Skip debug logs if debugging is disabled
    }
    
    this._appendLogEntry(entry);
    if (data) {
      this.logger[level](fullMessage, data);
    } else {
      this.logger[level](fullMessage);
    }
  }

  /**
   * Append log entry to in-memory buffer for UI consumption
   * @param {{level: string, message: string, data?: object, timestamp: string}} entry
   * @private
   */
  _appendLogEntry(entry) {
    this.logBuffer.push(entry);
    if (this.logBuffer.length > this.maxLogEntries) {
      this.logBuffer.shift();
    }
  }

  /**
   * Convert absolute sprite paths to relative URLs for overlays/HUD
   * @param {object} sprites
   * @returns {object}
   * @private
   */
  _getRelativeSpritePaths(sprites) {
    const relativeSprites = {};
    Object.entries(sprites || {}).forEach(([key, value]) => {
      if (value) {
        const filename = value.split(/[\\/]/).pop();
        // Sanitize filename: only allow alphanumeric, underscore, dash, and dot
        const safeFilename = filename.replace(/[^a-zA-Z0-9_.-]/g, '_');
        relativeSprites[key] = `/api/talkingheads/sprite/${encodeURIComponent(safeFilename)}`;
      }
    });
    return relativeSprites;
  }

  /**
   * Emit spawn animation event for new avatars
   * @param {string} userId
   * @param {string} username
   * @param {object} sprites
   * @private
   */
  _emitSpawnAnimation(userId, username, sprites) {
    const volume = typeof this.config.spawnAnimationVolume === 'number'
      ? Math.min(1, Math.max(0, this.config.spawnAnimationVolume))
      : 0.8;

    this.io.emit('talkingheads:avatar:spawn', {
      userId,
      username,
      sprites: this._getRelativeSpritePaths(sprites),
      mode: this.config.spawnAnimationMode || 'standard',
      customMediaUrl: this.config.spawnAnimationUrl || '',
      volume
    });
  }

  /**
   * Return recent log entries
   * @param {number} limit
   * @returns {Array}
   * @private
   */
  _getRecentLogs(limit = 100) {
    const startIndex = Math.max(0, this.logBuffer.length - limit);
    return this.logBuffer.slice(startIndex);
  }

  /**
   * Sanitize user input to prevent XSS and injection attacks
   * @param {any} input - Input to sanitize
   * @param {string} type - Type of sanitization to apply
   * @returns {any} Sanitized input
   * @private
   */
  _sanitizeInput(input, type) {
    if (input === null || input === undefined) {
      return input;
    }

    switch (type) {
      case 'userId':
        // Only alphanumeric, underscore, dash - max 64 chars
        return String(input).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 64);
      
      case 'username':
        // Remove HTML special characters, max 50 chars
        return String(input).replace(/[<>'"&]/g, '').slice(0, 50);
      
      case 'styleKey':
        // Whitelist against valid style templates
        const validKeys = getStyleKeys();
        return validKeys.includes(input) ? input : this.config.defaultStyle || 'cartoon';
      
      case 'url':
        // Validate URL format and ensure HTTPS only
        try {
          const url = new URL(String(input));
          if (url.protocol !== 'https:' && url.protocol !== 'http:') {
            return null;
          }
          return url.href;
        } catch {
          return null;
        }
      
      default:
        return input;
    }
  }

  /**
   * Save configuration to database
   * @param {object} newConfig - Configuration to save
   * @private
   */
  _saveConfig(newConfig) {
    try {
      const oldDebugLogging = this.config ? this.config.debugLogging : false;
      this.config = { ...this.config, ...newConfig };
      this.config.spawnAnimationMode = this.config.spawnAnimationMode || 'standard';
      this.config.spawnAnimationUrl = this.config.spawnAnimationUrl || '';
      if (typeof this.config.spawnAnimationVolume === 'number') {
        this.config.spawnAnimationVolume = Math.min(1, Math.max(0, this.config.spawnAnimationVolume));
      } else {
        this.config.spawnAnimationVolume = 0.8;
      }
      this.api.setConfig('talking_heads_config', this.config);
      
      // Log configuration change
      this._log('Configuration saved', 'info');
      
      // If debug logging was toggled, log the change
      if (oldDebugLogging !== this.config.debugLogging) {
        this._log(`Debug logging ${this.config.debugLogging ? 'ENABLED' : 'DISABLED'}`, 'info');
      }
      
      // Log other important config changes
      if (this.config.debugLogging) {
        this._log('Config updated', 'debug', {
          enabled: this.config.enabled,
          defaultStyle: this.config.defaultStyle,
          rolePermission: this.config.rolePermission,
          cacheEnabled: this.config.cacheEnabled,
          debugLogging: this.config.debugLogging
        });
      }
    } catch (error) {
      // If logging fails, use basic logger
      if (this.logger) {
        this.logger.error('TalkingHeads: Failed to save config internally', error);
      }
      throw error; // Re-throw to be caught by the route handler
    }
  }

  /**
   * Initialize plugin
   */
  async init() {
    try {
      this._log('Initializing plugin...', 'info');
      this._log(`Debug logging: ${this.config.debugLogging ? 'ENABLED' : 'DISABLED'}`, 'info');

      // Ensure plugin data directory exists
      const pluginDataDir = this.api.getPluginDataDir();
      this._log(`Plugin data directory: ${pluginDataDir}`, 'debug');
      await this.api.ensurePluginDataDir();

      // Initialize cache manager
      this._log('Initializing cache manager...', 'debug');
      this.cacheManager = new CacheManager(pluginDataDir, this.db, this.logger, this.config);
      await this.cacheManager.init();
      this._log('Cache manager initialized', 'debug');

      // Initialize role manager
      this._log('Initializing role manager...', 'debug');
      this.roleManager = new RoleManager(this.config, this.logger);
      this._log(`Role permission: ${this.config.rolePermission}`, 'debug');

      // Initialize avatar and sprite generators if API key is configured
      this._initializeGenerators();

      // Initialize animation controller
      this._log('Initializing animation controller...', 'debug');
      this.animationController = new AnimationController(
        this.io,
        this.logger,
        this.config,
        null // OBS WebSocket integration can be added later
      );
      this._log('Animation controller initialized', 'debug');

    // Register API routes
    this._log('Registering API routes...', 'debug');
    this._registerRoutes();

    // Register socket events
      this._log('Registering socket events...', 'debug');
      this._registerSocketEvents();

    // Register TTS event listener
    this._log('Registering TTS event listeners...', 'debug');
    this._registerTTSEvents();

    // Bridge playback events from TTS plugin so avatars follow speech
    this._registerPlaybackBridge();

    // Load custom voice users from TTS plugin
    this._log('Loading custom voice users...', 'debug');
    this._loadCustomVoiceUsers();

      // Start cache cleanup interval (once per day)
      this._startCacheCleanup();

      this.logger.info('TalkingHeads: ✅ Plugin initialized successfully');

    } catch (error) {
      this.logger.error('TalkingHeads: Failed to initialize plugin', error);
      throw error;
    }
  }

  /**
   * Register API routes
   * @private
   */
  _registerRoutes() {
    // Serve overlay and OBS HUD
    this.api.registerRoute('get', '/talking-heads/overlay', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay.html'));
    });

    this.api.registerRoute('get', '/talking-heads/obs-hud', (req, res) => {
      res.sendFile(path.join(__dirname, 'obs-hud.html'));
    });

    const assetsDir = path.join(__dirname, 'assets');
    this.api.registerRoute('get', '/talking-heads/assets/:filename', (req, res) => {
      const safeFilename = path.basename(req.params.filename || '');
      res.sendFile(path.join(assetsDir, safeFilename));
    });

    // OBS overlay aliases (stream overlay namespace)
    this.api.registerRoute('get', '/overlay/talking-heads', (req, res) => {
      res.sendFile(path.join(__dirname, 'overlay.html'));
    });

    this.api.registerRoute('get', '/overlay/talking-heads/obs-hud', (req, res) => {
      res.sendFile(path.join(__dirname, 'obs-hud.html'));
    });

    this.api.registerRoute('get', '/overlay/talking-heads/assets/:filename', (req, res) => {
      const safeFilename = path.basename(req.params.filename || '');
      res.sendFile(path.join(assetsDir, safeFilename));
    });

    // Get configuration
    this.api.registerRoute('get', '/api/talkingheads/config', (req, res) => {
      const providerInfo = this._resolveImageProvider();
      res.json({
        success: true,
        config: this.config,
        styleTemplates: getAllStyleTemplates(),
        apiConfigured: !!providerInfo.apiKey,
        apiKeySource: providerInfo.apiKeySource,
        provider: providerInfo.provider
      });
    });

    // Update configuration
    this.api.registerRoute('post', '/api/talkingheads/config', (req, res) => {
      try {
        // Shallow copy to avoid mutating Express request body
        const newConfig = { ...req.body };
        
        // Remove imageApiKey if sent (should not be stored here)
        if (newConfig.imageApiKey !== undefined) {
          delete newConfig.imageApiKey;
        }

        if (newConfig.spawnAnimationVolume !== undefined) {
          newConfig.spawnAnimationVolume = parseFloat(newConfig.spawnAnimationVolume);
        }
        
        this._saveConfig(newConfig);

        // Update managers with new config
        if (this.roleManager) {
          this.roleManager.updateConfig(this.config);
        }

        const apiKey = this._resolveImageProvider().apiKey;
        res.json({ 
          success: true, 
          config: this.config,
          apiConfigured: !!apiKey
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Failed to save config', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get cache statistics
    this.api.registerRoute('get', '/api/talkingheads/cache/stats', (req, res) => {
      try {
        const stats = this.cacheManager.getStats();
        res.json({ success: true, stats });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    this.api.registerRoute('get', '/api/talkingheads/cache/list', (req, res) => {
      try {
        const limit = parseInt(req.query.limit, 10) || 50;
        const entries = this.cacheManager.listAvatars(limit);
        const avatars = entries.map((entry) => ({
          ...entry,
          sprites: this._getRelativeSpritePaths(entry.sprites)
        }));
        res.json({ success: true, avatars });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Clear cache
    this.api.registerRoute('post', '/api/talkingheads/cache/clear', async (req, res) => {
      try {
        const deleted = await this.cacheManager.clearAllCache();
        res.json({ success: true, deleted });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Export sprites as ZIP
    this.api.registerRoute('get', '/api/talkingheads/export/:userId', async (req, res) => {
      try {
        const { userId } = req.params;
        const sanitizedUserId = this._sanitizeInput(userId, 'userId');
        
        if (!sanitizedUserId) {
          return res.status(400).json({ success: false, error: 'Invalid user ID' });
        }

        // Get cached avatar
        const cached = this.cacheManager.getAvatar(sanitizedUserId, this.config.defaultStyle);
        
        if (!cached) {
          return res.status(404).json({ success: false, error: 'Avatar not found in cache' });
        }

        this._log(`Exporting sprites for user ${cached.username}`, 'info');

        const archiver = require('archiver');
        const fs = require('fs');
        
        // Create archive
        const archive = archiver('zip', {
          zlib: { level: 9 } // Maximum compression
        });

        // Set response headers
        const safeUsername = cached.username.replace(/[^a-zA-Z0-9]/g, '_');
        res.setHeader('Content-Type', 'application/zip');
        res.setHeader('Content-Disposition', `attachment; filename="${safeUsername}_sprites.zip"`);
        
        // Pipe archive to response
        archive.pipe(res);

        // Add sprite files to archive
        let filesAdded = 0;
        for (const [frameName, spritePath] of Object.entries(cached.sprites)) {
          if (spritePath && fs.existsSync(spritePath)) {
            archive.file(spritePath, { name: `${frameName}.png` });
            filesAdded++;
          }
        }

        // Add avatar file if exists
        if (cached.avatarPath && fs.existsSync(cached.avatarPath)) {
          archive.file(cached.avatarPath, { name: 'avatar_full.png' });
          filesAdded++;
        }

        if (filesAdded === 0) {
          archive.abort();
          return res.status(404).json({ success: false, error: 'No sprite files found' });
        }

        // Finalize archive
        await archive.finalize();
        
        this._log(`Exported ${filesAdded} files for ${cached.username}`, 'info');
      } catch (error) {
        this.logger.error('TalkingHeads: Sprite export failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test API connection
    this.api.registerRoute('post', '/api/talkingheads/test-api', async (req, res) => {
      try {
        const providerInfo = this._resolveImageProvider();
        // Try to initialize generators if they don't exist yet
        if (!this.avatarGenerator) {
          this._log('Avatar generator not initialized, attempting to initialize...', 'debug');
          const initialized = this._initializeGenerators();
          
          if (!initialized) {
            return res.json({ 
              success: false, 
              error: providerInfo.provider === 'openai'
                ? 'API key not configured. Please configure the OpenAI API key in Dashboard > Settings > OpenAI API Configuration and reload the plugin.'
                : 'API key not configured. Please configure the SiliconFlow API key in Dashboard > Settings > TTS API Keys and reload the plugin.'
            });
          }
        }

        const connected = await this.avatarGenerator.testConnection();
        
        if (connected) {
          this._log('API connection test successful', 'info');
        } else {
          this._log('API connection test failed', 'warn');
        }
        
        res.json({ 
          success: connected, 
          message: connected ? 'API connection successful' : 'API connection failed - check API key and network connection',
          provider: this.activeImageProvider
        });
      } catch (error) {
        this._log(`Test API error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message || 'Unknown error' });
      }
    });

    // Test avatar generation
    this.api.registerRoute('post', '/api/talkingheads/test-generate', async (req, res) => {
      try {
        const providerInfo = this._resolveImageProvider();
        // Try to initialize generators if they don't exist yet
        if (!this.avatarGenerator || !this.spriteGenerator) {
          this._log('Generators not initialized, attempting to initialize...', 'debug');
          const initialized = this._initializeGenerators();
          
          if (!initialized) {
            return res.json({ 
              success: false, 
              error: providerInfo.provider === 'openai'
                ? 'API key not configured. Please configure the OpenAI API key in Dashboard > Settings > OpenAI API Configuration and reload the plugin.'
                : 'API key not configured. Please configure the SiliconFlow API key in Dashboard > Settings > TTS API Keys and reload the plugin.'
            });
          }
        }

        const { styleKey } = req.body;
        const style = styleKey || this.config.defaultStyle;
        
        this._log(`Testing avatar generation with style: ${style}`, 'info');

        // Generate a test avatar with dummy user data
        const testUserId = `test_${Date.now()}`;
        const testUsername = 'TestUser';
        
        const result = await this._generateAvatarAndSprites(
          testUserId,
          testUsername,
          '',
          style
        );

        res.json({ 
          success: true, 
          message: 'Test avatar generated successfully',
          sprites: result.sprites ? Object.keys(result.sprites).length : 0,
          cacheId: result.cacheId
        });
      } catch (error) {
        this._log(`Test generation failed: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message || 'Generation failed' });
      }
    });

    // Talking Heads + TTS preview using local engine
    this.api.registerRoute('post', '/api/talkingheads/preview-tts', async (req, res) => {
      try {
        const ttsPlugin = this.api.pluginLoader?.getPluginInstance('tts');
        if (!ttsPlugin || typeof ttsPlugin.speak !== 'function') {
          return res.status(503).json({ success: false, error: 'TTS plugin is not available' });
        }

        const previewText = (req.body && req.body.text) || 'Hallo! Dies ist eine Talking Heads Vorschau.';
        const previewUserId = (req.body && req.body.userId) || 'talkingheads_preview';
        const previewUsername = (req.body && req.body.username) || 'TalkingHeads Preview';

        // Check if test avatar exists
        let cached = this.cacheManager.getAvatar(previewUserId, this.config.defaultStyle);
        let wasGenerated = false;
        
        if (!cached) {
          this._log('Test avatar not found, generating...', 'info');
          wasGenerated = true;
          
          // Ensure generators are initialized
          if (!this.avatarGenerator || !this.spriteGenerator) {
            const initialized = this._initializeGenerators();
            if (!initialized) {
              return res.status(503).json({ 
                success: false, 
                error: 'Avatar generators not available. Please configure API keys.' 
              });
            }
          }
          
          // Generate test avatar
          try {
            this._log('Generating test avatar for preview...', 'info');
            await this._generateAvatarAndSprites(
              previewUserId,
              previewUsername,
              '',
              this.config.defaultStyle
            );
            cached = this.cacheManager.getAvatar(previewUserId, this.config.defaultStyle);
            this._log('Test avatar generated successfully', 'info');
          } catch (genError) {
            this._log(`Preview avatar generation failed: ${genError.message}`, 'error');
            return res.status(500).json({ 
              success: false, 
              error: `Failed to generate test avatar: ${genError.message}` 
            });
          }
        }

        // Now play TTS with the avatar
        this._log('Calling TTS speak for preview...', 'info');
        const speakResult = await ttsPlugin.speak({
          text: previewText,
          userId: previewUserId,
          username: previewUsername,
          source: 'talking-heads-preview',
          engine: ttsPlugin.config?.defaultEngine || undefined,
          priority: 0
        });

        // Check if TTS was successful
        if (speakResult && speakResult.success === false) {
          this._log(`TTS preview failed: ${speakResult.error || speakResult.reason || 'Unknown error'}`, 'warn', speakResult);
          
          // Return error with helpful message
          return res.status(400).json({
            success: false,
            error: speakResult.error || 'TTS konnte nicht gestartet werden',
            reason: speakResult.reason,
            blocked: speakResult.blocked,
            details: speakResult.reason === 'tts_disabled' 
              ? 'TTS ist global deaktiviert. Bitte aktivieren Sie TTS in den Quick Actions oder Einstellungen.'
              : undefined
          });
        }

        this._log('TTS preview started successfully', 'info', { queueId: speakResult?.id });
        
        res.json({ 
          success: true, 
          result: speakResult,
          avatarGenerated: wasGenerated
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Preview TTS failed', error);
        res.status(500).json({ success: false, error: error.message || 'Preview failed' });
      }
    });

    // Manually generate avatar for user
    this.api.registerRoute('post', '/api/talkingheads/generate', async (req, res) => {
      try {
        const { userId, username, styleKey, profileImageUrl } = req.body;

        if (!userId || !username) {
          return res.status(400).json({ success: false, error: 'Missing required fields' });
        }

        // Sanitize inputs
        const sanitizedUserId = this._sanitizeInput(userId, 'userId');
        const sanitizedUsername = this._sanitizeInput(username, 'username');
        const sanitizedStyleKey = this._sanitizeInput(styleKey, 'styleKey');
        const sanitizedProfileImageUrl = profileImageUrl ? this._sanitizeInput(profileImageUrl, 'url') : '';

        if (!sanitizedUserId || !sanitizedUsername) {
          return res.status(400).json({ success: false, error: 'Invalid input parameters' });
        }

        if (profileImageUrl && !sanitizedProfileImageUrl) {
          return res.status(400).json({ success: false, error: 'Invalid profile image URL' });
        }

        const result = await this._generateAvatarAndSprites(
          sanitizedUserId,
          sanitizedUsername,
          sanitizedProfileImageUrl,
          sanitizedStyleKey
        );

        // Emit socket event to notify UI of new avatar
        this.io.emit('talkingheads:avatar:generated', {
          userId: sanitizedUserId,
          username: sanitizedUsername,
          styleKey: result.styleKey,
          sprites: this._getRelativeSpritePaths(result.sprites)
        });

        res.json({ success: true, result });
      } catch (error) {
        this.logger.error('TalkingHeads: Manual generation failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get users from stream database for assignment
    this.api.registerRoute('get', '/api/talkingheads/users', (req, res) => {
      try {
        // Validate and limit the number of users to prevent DoS
        const requestedLimit = parseInt(req.query.limit, 10);
        const limit = Number.isNaN(requestedLimit) 
          ? 1000 
          : Math.min(Math.max(requestedLimit, 1), 5000);
        
        const filter = req.query.filter || 'active';
        const searchTerm = req.query.search ? req.query.search.trim() : '';
        
        let users;
        const streamerId = this.db.streamerId || 'default';
        
        if (searchTerm) {
          // Global search across all users (ignore filter when searching)
          const searchPattern = `%${searchTerm}%`;
          const stmt = this.db.prepare(`
            SELECT * FROM user_statistics 
            WHERE streamer_id = ? 
              AND (username LIKE ? OR unique_id LIKE ?)
            ORDER BY total_coins_sent DESC, last_seen_at DESC
            LIMIT ?
          `);
          users = stmt.all(streamerId, searchPattern, searchPattern, limit);
        } else if (filter === 'active') {
          // Get users active in the last 5 minutes (currently watching)
          const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
          
          const stmt = this.db.prepare(`
            SELECT * FROM user_statistics 
            WHERE streamer_id = ? AND last_seen_at >= ?
            ORDER BY last_seen_at DESC 
            LIMIT ?
          `);
          users = stmt.all(streamerId, fiveMinutesAgo, limit);
        } else {
          // Get all users
          users = this.db.getAllUserStatistics(limit, 0);
        }
        
        // Map users with talking head status
        const usersWithStatus = users.map(user => {
          const hasAvatar = this.cacheManager.hasAvatar(user.user_id, this.config.defaultStyle);
          const cached = hasAvatar ? this.cacheManager.getAvatar(user.user_id, this.config.defaultStyle) : null;
          
          return {
            userId: user.user_id,
            username: user.username,
            uniqueId: user.unique_id,
            profilePictureUrl: user.profile_picture_url,
            totalCoins: user.total_coins_sent,
            totalGifts: user.total_gifts_sent,
            totalComments: user.total_comments,
            lastSeenAt: user.last_seen_at,
            hasAvatar,
            avatarCreatedAt: cached ? cached.createdAt : null,
            avatarStyleKey: cached ? cached.styleKey : null
          };
        });
        
        res.json({ success: true, users: usersWithStatus });
      } catch (error) {
        this.logger.error('TalkingHeads: Failed to fetch users', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Assign/generate talking head for user with LLM-based profile analysis
    this.api.registerRoute('post', '/api/talkingheads/assign', async (req, res) => {
      try {
        const { userId, username, profileImageUrl, styleKey } = req.body;

        if (!userId || !username) {
          return res.status(400).json({ success: false, error: 'Missing required fields: userId and username' });
        }

        // Sanitize inputs
        const sanitizedUserId = this._sanitizeInput(userId, 'userId');
        const sanitizedUsername = this._sanitizeInput(username, 'username');
        const sanitizedStyleKey = this._sanitizeInput(styleKey, 'styleKey');
        const sanitizedProfileImageUrl = profileImageUrl ? this._sanitizeInput(profileImageUrl, 'url') : null;

        if (!sanitizedUserId || !sanitizedUsername) {
          return res.status(400).json({ success: false, error: 'Invalid input parameters' });
        }

        if (profileImageUrl && !sanitizedProfileImageUrl) {
          return res.status(400).json({ 
            success: false, 
            error: 'Invalid profile image URL: Only HTTP/HTTPS URLs are allowed' 
          });
        }

        const style = sanitizedStyleKey;

        // Step 1: Analyze profile image and username with LLM (if available and profile image exists)
        let avatarDescription = null;
        let llmFallbackReason = null;
        
        if (sanitizedProfileImageUrl && this._getOpenAIApiKey()) {
          try {
            this._log(`Analyzing profile for user ${sanitizedUsername} with LLM...`, 'info');
            avatarDescription = await this._analyzeProfileWithLLM(sanitizedUsername, sanitizedProfileImageUrl, style);
            this._log(`LLM analysis complete for ${sanitizedUsername}: ${avatarDescription}`, 'debug');
          } catch (error) {
            llmFallbackReason = error.message;
            this._log(`LLM analysis failed for ${sanitizedUsername}: ${error.message}. Using default prompt.`, 'warn');
            avatarDescription = null;
          }
        } else if (!sanitizedProfileImageUrl) {
          llmFallbackReason = 'No profile image URL provided';
        } else {
          llmFallbackReason = 'OpenAI API key not configured';
        }

        // Step 2: Generate avatar and sprites
        const result = await this._generateAvatarAndSprites(
          sanitizedUserId,
          sanitizedUsername,
          sanitizedProfileImageUrl || '',
          style,
          avatarDescription // Pass the LLM-generated description as override
        );

        // Emit socket event to notify UI of new avatar
        this.io.emit('talkingheads:avatar:generated', {
          userId: sanitizedUserId,
          username: sanitizedUsername,
          styleKey: result.styleKey,
          sprites: this._getRelativeSpritePaths(result.sprites)
        });

        res.json({ 
          success: true, 
          result,
          llmAnalysisUsed: !!avatarDescription,
          llmFallbackReason: avatarDescription ? null : llmFallbackReason
        });
      } catch (error) {
        this.logger.error('TalkingHeads: User assignment failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Manual sprite assignment - assign sprites from one user to another
    this.api.registerRoute('post', '/api/talkingheads/assign-manual-sprite', async (req, res) => {
      try {
        const { userId, username, targetUserId } = req.body;

        if (!userId || !username || !targetUserId) {
          return res.status(400).json({ 
            success: false, 
            error: 'Missing required fields: userId, username, and targetUserId' 
          });
        }

        // Sanitize inputs
        const sanitizedUserId = this._sanitizeInput(userId, 'userId');
        const sanitizedUsername = this._sanitizeInput(username, 'username');
        const sanitizedTargetUserId = this._sanitizeInput(targetUserId, 'userId');

        if (!sanitizedUserId || !sanitizedUsername || !sanitizedTargetUserId) {
          return res.status(400).json({ success: false, error: 'Invalid input parameters' });
        }

        // Get target user's avatar from cache
        const targetAvatar = this.cacheManager.getAvatar(sanitizedTargetUserId, this.config.defaultStyle);
        
        if (!targetAvatar) {
          return res.status(404).json({ 
            success: false, 
            error: `No avatar found for target user ID: ${sanitizedTargetUserId}` 
          });
        }

        this._log(`Manually assigning sprites from ${targetAvatar.username} to ${sanitizedUsername}`, 'info');

        // Copy sprites to new user in cache
        this.cacheManager.saveAvatar(
          sanitizedUserId,
          sanitizedUsername,
          targetAvatar.styleKey,
          targetAvatar.avatarPath,
          targetAvatar.sprites,
          targetAvatar.profileImageUrl
        );

        // Emit socket event to notify UI of new avatar assignment
        this.io.emit('talkingheads:avatar:generated', {
          userId: sanitizedUserId,
          username: sanitizedUsername,
          styleKey: targetAvatar.styleKey,
          sprites: this._getRelativeSpritePaths(targetAvatar.sprites),
          manuallyAssigned: true,
          sourceUser: targetAvatar.username
        });

        res.json({ 
          success: true, 
          message: `Successfully assigned sprites from ${targetAvatar.username} to ${sanitizedUsername}`,
          userId: sanitizedUserId,
          username: sanitizedUsername,
          styleKey: targetAvatar.styleKey,
          sourceUserId: sanitizedTargetUserId,
          sourceUsername: targetAvatar.username
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Manual sprite assignment failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get available sprites for manual assignment
    this.api.registerRoute('get', '/api/talkingheads/available-sprites', (req, res) => {
      try {
        const limit = Math.min(parseInt(req.query.limit, 10) || 100, 500);
        
        // Get all cached avatars
        const cachedAvatars = this.cacheManager.listAvatars(limit);
        
        // Format for dropdown/selection
        const availableSprites = cachedAvatars.map(avatar => ({
          userId: avatar.userId,
          username: avatar.username,
          styleKey: avatar.styleKey,
          previewUrl: this._getRelativeSpritePaths(avatar.sprites).idle_neutral,
          createdAt: avatar.createdAt,
          lastUsed: avatar.lastUsed
        }));

        res.json({ 
          success: true, 
          sprites: availableSprites,
          total: availableSprites.length
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Failed to list available sprites', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get active animations
    this.api.registerRoute('get', '/api/talkingheads/animations', (req, res) => {
      try {
        const animations = this.animationController.getActiveAnimations();
        res.json({ success: true, animations });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test animation endpoint (bypasses TTS, tests animation directly)
    this.api.registerRoute('post', '/api/talkingheads/test-animation', async (req, res) => {
      try {
        const { userId, username, duration } = req.body;
        const testUserId = userId || 'test_animation_user';
        const testUsername = username || 'Test Animation User';
        const animationDuration = duration || 5000;

        // Check if avatar exists in cache
        let avatarData = this.cacheManager.getAvatar(testUserId, this.config.defaultStyle);
        
        if (!avatarData) {
          // Generate test avatar if not exists
          this._log(`Generating test avatar for animation test...`, 'info');
          
          if (!this.avatarGenerator || !this.spriteGenerator) {
            const initialized = this._initializeGenerators();
            if (!initialized) {
              return res.status(503).json({ 
                success: false, 
                error: 'Avatar generators not available. Please configure API keys.' 
              });
            }
          }
          
          avatarData = await this._generateAvatarAndSprites(
            testUserId,
            testUsername,
            '',
            this.config.defaultStyle
          );
        }

        // Start animation directly
        this._log(`Starting test animation for ${testUsername} (${animationDuration}ms)`, 'info');
        this.animationController.startAnimation(
          testUserId,
          testUsername,
          avatarData.sprites,
          animationDuration
        );

        res.json({ 
          success: true, 
          message: 'Test animation started',
          userId: testUserId,
          duration: animationDuration
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Test animation failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Socket.IO connection test - verifies overlay is connected
    this.api.registerRoute('get', '/api/talkingheads/test-socket', (req, res) => {
      try {
        // Get count of connected clients (compatible with Socket.IO v2 and v4+)
        let clientCount = 0;
        try {
          if (this.io.sockets && this.io.sockets.sockets) {
            // v4+: Map with .size property
            if (typeof this.io.sockets.sockets.size === 'number') {
              clientCount = this.io.sockets.sockets.size;
            } else {
              // v2: Plain object
              clientCount = Object.keys(this.io.sockets.sockets).length;
            }
          } else if (this.io.engine && typeof this.io.engine.clientsCount === 'number') {
            clientCount = this.io.engine.clientsCount;
          }
        } catch (countError) {
          this._log(`Could not determine client count: ${countError.message}`, 'debug');
        }
        
        // Send a test ping to all clients
        this.io.emit('talkingheads:test:ping', { 
          timestamp: Date.now(),
          message: 'Socket.IO connection test'
        });
        
        this._log(`Socket test ping sent to ${clientCount} clients`, 'info');
        
        res.json({ 
          success: true, 
          clientCount,
          message: 'Test ping sent. Check overlay console for "talkingheads:test:ping" event.'
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Socket test failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Expose recent logs for the admin UI
    this.api.registerRoute('get', '/api/talkingheads/logs', (req, res) => {
      try {
        const limit = parseInt(req.query.limit, 10) || 100;
        res.json({ success: true, logs: this._getRecentLogs(limit) });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test permission settings with different user types
    this.api.registerRoute('post', '/api/talkingheads/test-permissions', (req, res) => {
      try {
        const { rolePermission, minTeamLevel } = req.body;
        
        // Create test config
        const testConfig = {
          rolePermission: rolePermission || 'all',
          minTeamLevel: minTeamLevel || 0
        };
        
        // Create a temporary role manager for testing
        const testRoleManager = new RoleManager(testConfig, this.logger);
        
        // Define test users with different roles
        const testUsers = [
          {
            userType: 'Normaler Viewer',
            userData: {
              uniqueId: 'test_viewer',
              teamMemberLevel: 0,
              isModerator: false,
              isSubscriber: false,
              topGifterRank: 999
            }
          },
          {
            userType: 'Team-Mitglied (Level 1)',
            userData: {
              uniqueId: 'test_team_member',
              teamMemberLevel: 1,
              isModerator: false,
              isSubscriber: false,
              topGifterRank: 999
            }
          },
          {
            userType: 'Moderator',
            userData: {
              uniqueId: 'test_moderator',
              teamMemberLevel: 0,
              isModerator: true,
              isSubscriber: false,
              topGifterRank: 999
            }
          },
          {
            userType: 'Abonnent/Superfan',
            userData: {
              uniqueId: 'test_subscriber',
              teamMemberLevel: 0,
              isModerator: false,
              isSubscriber: true,
              topGifterRank: 999
            }
          },
          {
            userType: 'Top Gifter (Rang 1)',
            userData: {
              uniqueId: 'test_top_gifter',
              teamMemberLevel: 0,
              isModerator: false,
              isSubscriber: false,
              topGifterRank: 1
            }
          },
          {
            userType: 'User mit Custom Voice',
            userData: {
              uniqueId: 'test_custom_voice',
              teamMemberLevel: 0,
              isModerator: false,
              isSubscriber: false,
              topGifterRank: 999,
              hasAssignedVoice: true
            }
          }
        ];
        
        // Test each user type
        const testResults = testUsers.map(test => {
          const customVoiceUsers = test.userData.hasAssignedVoice 
            ? [test.userData.uniqueId] 
            : [];
          
          const result = testRoleManager.checkEligibility(
            test.userData,
            customVoiceUsers
          );
          
          return {
            userType: test.userType,
            eligible: result.eligible,
            reason: result.reason
          };
        });
        
        res.json({ success: true, testResults });
      } catch (error) {
        this.logger.error('TalkingHeads: Permission test failed', error);
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Serve sprite images
    this.api.registerRoute('get', '/api/talkingheads/sprite/:filename', async (req, res) => {
      try {
        const filename = req.params.filename;
        const pluginDataDir = this.api.getPluginDataDir();
        const filepath = path.join(pluginDataDir, 'avatars', filename);

        // Check if file exists
        await fs.access(filepath);
        
        // Send file
        res.sendFile(filepath);
      } catch (error) {
        res.status(404).json({ success: false, error: 'Sprite not found' });
      }
    });

    this.logger.info('TalkingHeads: API routes registered');
  }

  /**
   * Register socket events
   * @private
   */
  _registerSocketEvents() {
    // Client requests animation test
    this.api.registerSocket('talkingheads:test', async (data) => {
      try {
        const { userId, username, duration } = data;
        
        // Get or generate avatar
        const cached = this.cacheManager.getAvatar(userId, this.config.defaultStyle);
        
        if (cached) {
          this.animationController.startAnimation(
            userId,
            username,
            cached.sprites,
            duration || 5000
          );
        } else {
          this.logger.warn('TalkingHeads: No cached avatar for test animation');
        }
      } catch (error) {
        this.logger.error('TalkingHeads: Test animation failed', error);
      }
    });

    this.logger.info('TalkingHeads: Socket events registered');
  }

  /**
   * Register TTS event listeners
   * @private
   */
  _registerTTSEvents() {
    // Listen for TTS events from TTS plugin
    this.io.on('connection', (socket) => {
      socket.on('tts:speaking', async (data) => {
        if (!this.config.enabled) return;

        try {
          await this._handleTTSEvent(data);
        } catch (error) {
          this.logger.error('TalkingHeads: Failed to handle TTS event', error);
        }
      });
    });

    this.logger.info('TalkingHeads: TTS event listeners registered');
  }

  /**
   * Bridge TTS playback events from the TTS plugin to Talking Heads animations
   * Uses PluginLoader event emitter to avoid socket roundtrips
   * @private
   */
  _registerPlaybackBridge() {
    const loader = this.api.pluginLoader;
    if (!loader || typeof loader.on !== 'function') {
      this._log('PluginLoader not available for TTS bridge', 'debug');
      return;
    }

    const startHandler = async (payload = {}) => {
      const isPreview = payload.source === 'talking-heads-preview';
      // Allow preview to work even if plugin is not enabled
      if (!this.config.enabled && !isPreview) return;
      
      const userId = payload.userId || payload.username;
      if (!userId) return;

      // Log preview requests
      if (isPreview) {
        this._log(`Preview TTS request received for ${payload.username || userId}`, 'info');
      }

      try {
        await this._handleTTSEvent({
          userId,
          username: payload.username || userId,
          text: payload.text || '',
          duration: payload.duration || this.config.animationDuration || 5000,
          isPreview,
          userData: {
            profilePictureUrl: payload.profileImageUrl || '',
            uniqueId: userId,
            hasAssignedVoice: payload.hasAssignedVoice === true
          }
        });
      } catch (error) {
        this.logger.error('TalkingHeads: Failed to handle bridged TTS playback', error);
      }
    };

    const endHandler = (payload = {}) => {
      const userId = payload.userId || payload.username;
      if (!userId || !this.animationController) return;
      this.animationController.stopAnimation(userId);
    };

    loader.on('tts:playback:started', startHandler);
    loader.on('tts:playback:ended', endHandler);
    this.ttsBridgeHandlers = { startHandler, endHandler };
    this._log('TTS playback bridge registered', 'debug');
  }

  /**
   * Handle TTS speaking event
   * @param {object} data - TTS event data
   * @private
   */
  async _handleTTSEvent(data) {
    const { userId, username, text, duration, userData, isPreview } = data;

    this._log(`TTS event received for user: ${username}`, 'debug', { userId, duration });

    if (!userId || !username) {
      this._log('Invalid TTS event data - missing userId or username', 'warn');
      return;
    }

    const enrichedUserData = {
      ...(userData || {}),
      uniqueId: userId || username,
      username,
      hasAssignedVoice: userData?.hasAssignedVoice === true
    };

    // Skip permission check for preview/test users
    if (!isPreview) {
      // Check role permission
      this._log(`Checking eligibility for user: ${username}`, 'debug');
      const eligibility = this.roleManager.checkEligibility(enrichedUserData, this.customVoiceUsers);
      
      if (!eligibility.eligible) {
        this._log(`User ${username} not eligible - ${eligibility.reason}`, 'info');
        return;
      }
    } else {
      this._log(`Preview mode - skipping permission check for ${username}`, 'debug');
    }

    this._log(`User ${username} is eligible for talking head`, 'debug');

    // Check cache first
    this._log(`Checking cache for user ${username} with style ${this.config.defaultStyle}`, 'debug');
    let avatarData = this.cacheManager.getAvatar(userId, this.config.defaultStyle);
    const wasCached = !!avatarData;

    if (!avatarData) {
      // Generate new avatar and sprites
      this._log(`Generating new avatar for ${username}`, 'info');
      this._log(`Profile URL: ${enrichedUserData.profilePictureUrl || 'none'}`, 'debug');
      
      try {
        avatarData = await this._generateAvatarAndSprites(
          userId,
          username,
          enrichedUserData.profilePictureUrl || '',
          this.config.defaultStyle
        );
        this._log(`Avatar generation completed for ${username}`, 'debug');
      } catch (error) {
        this._log(`Failed to generate avatar for ${username}: ${error.message}`, 'error');
        return;
      }
    } else {
      this._log(`Using cached avatar for ${username}`, 'debug');
    }

    const isNewAvatar = !wasCached;

    // Start animation
    this._log(`Starting animation for ${username} (duration: ${duration}ms)`, 'debug');
    if (isNewAvatar && this.config.obsHudEnabled !== false) {
      this._emitSpawnAnimation(userId, username, avatarData.sprites);
    }
    this.animationController.startAnimation(
      userId,
      username,
      avatarData.sprites,
      duration || 5000
    );
  }

  /**
   * Generate avatar and sprites for user
   * @param {string} userId - TikTok user ID
   * @param {string} username - TikTok username
   * @param {string} profileImageUrl - Profile image URL
   * @param {string} styleKey - Style template key
   * @param {string} customDescription - Optional LLM-generated custom description
   * @returns {Promise<object>} Avatar data
   * @private
   */
  async _generateAvatarAndSprites(userId, username, profileImageUrl, styleKey, customDescription = null) {
    if (!this.avatarGenerator || !this.spriteGenerator) {
      throw new Error('Avatar generation not configured - API key missing');
    }

    const pluginDataDir = this.api.getPluginDataDir();
    const cacheDir = path.join(pluginDataDir, 'avatars');

    try {
      // Generate avatar with optional custom description
      this._log(`Starting avatar generation for ${username} (${userId})`, 'info');
      const avatarPath = await this.avatarGenerator.generateAvatar(
        username,
        userId,
        profileImageUrl,
        styleKey,
        cacheDir,
        customDescription
      );
      this._log(`Avatar generated successfully: ${avatarPath}`, 'info');

      // Generate sprites
      this._log(`Starting sprite generation for ${username} (${userId})`, 'info');
      const spritePaths = await this.spriteGenerator.generateSprites(
        username,
        userId,
        avatarPath,
        styleKey,
        cacheDir
      );
      this._log(`Sprites generated successfully for ${username}`, 'info', { spriteCount: Object.keys(spritePaths).length });

      // Save to cache
      this._log(`Saving to cache for ${username}`, 'debug');
      this.cacheManager.saveAvatar(
        userId,
        username,
        styleKey,
        avatarPath,
        spritePaths,
        profileImageUrl
      );
      this._log(`Avatar and sprites cached successfully for ${username}`, 'info');

      return {
        userId,
        username,
        styleKey,
        avatarPath,
        sprites: spritePaths
      };
    } catch (error) {
      this._log(`Failed to generate avatar and sprites for ${username}: ${error.message}`, 'error', { 
        stack: error.stack
      });
      throw error;
    }
  }

  /**
   * Analyze user profile with LLM to generate avatar description
   * Uses OpenAI's vision API to analyze profile image and generate description
   * @param {string} username - TikTok username
   * @param {string} profileImageUrl - URL to profile image
   * @param {string} styleKey - Style template key to match genre
   * @returns {Promise<string>} LLM-generated avatar description
   * @private
   */
  async _analyzeProfileWithLLM(username, profileImageUrl, styleKey) {
    const OpenAI = require('openai');
    const apiKey = this._getOpenAIApiKey();
    
    if (!apiKey) {
      throw new Error('OpenAI API key not configured');
    }
    
    const client = new OpenAI({ apiKey });
    const { getStyleTemplate } = require('./utils/style-templates');
    const styleTemplate = getStyleTemplate(styleKey);
    
    if (!styleTemplate) {
      throw new Error(`Invalid style key: ${styleKey}`);
    }

    try {
      const prompt = `You are an expert character designer. Analyze the profile image and username to create a detailed character description for a 2D avatar.

Username: ${username}
Style Genre: ${styleTemplate.name} (${styleTemplate.description})

Based on the profile image and username, describe a unique 2D avatar character that:
1. Captures the essence and personality suggested by the profile image
2. Fits the ${styleTemplate.name} art style (${styleTemplate.description})
3. Works well for a TikTok livestream talking head animation
4. Has clear, expressive facial features suitable for lip-sync animation

Provide a detailed character description including:
- Physical appearance (face, hair, clothing, colors)
- Personality traits reflected in the design
- Key visual elements that make this character unique
- How it fits the ${styleTemplate.name} style

Keep the description focused and specific. This will be used to generate the actual avatar image.`;

      this._log(`Sending LLM request for profile analysis (${username})`, 'debug');

      const response = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: prompt
              },
              {
                type: 'image_url',
                image_url: {
                  url: profileImageUrl
                }
              }
            ]
          }
        ],
        max_tokens: 500,
        // Temperature 0.7: Balanced between creativity and consistency
        // High enough for diverse character descriptions, low enough to stay on-topic
        temperature: 0.7
      });

      if (!response.choices || response.choices.length === 0) {
        throw new Error('No response from OpenAI');
      }

      const description = response.choices[0].message.content.trim();
      this._log(`LLM generated description (${description.length} chars)`, 'debug');
      
      return description;
    } catch (error) {
      this._log(`LLM analysis failed: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Load custom voice users from TTS plugin
   * @private
   */
  _loadCustomVoiceUsers() {
    try {
      // Try to get TTS plugin config
      const ttsConfig = this.api.getConfig('tts_config');
      
      if (ttsConfig && ttsConfig.voiceWhitelist) {
        this.customVoiceUsers = Object.keys(ttsConfig.voiceWhitelist);
        this.logger.info(`TalkingHeads: Loaded ${this.customVoiceUsers.length} custom voice users`);
      }
    } catch (error) {
      this.logger.warn('TalkingHeads: Could not load custom voice users', error);
    }
  }

  /**
   * Start cache cleanup interval
   * @private
   */
  _startCacheCleanup() {
    if (!this.config.cacheEnabled) return;

    // Run cleanup once per day
    this.cacheCleanupInterval = setInterval(async () => {
      try {
        // Get active user IDs to skip them during cleanup
        const activeUserIds = this.animationController 
          ? Array.from(this.animationController.activeAnimations.keys()) 
          : [];
        
        await this.cacheManager.cleanupOldCache(activeUserIds);
      } catch (error) {
        this.logger.error('TalkingHeads: Cache cleanup failed', error);
      }
    }, 86400000); // 24 hours

    this.logger.info('TalkingHeads: Cache cleanup scheduled');
  }

  /**
   * Destroy plugin and cleanup
   */
  async destroy() {
    try {
      this.logger.info('TalkingHeads: Destroying plugin...');

      // Stop all animations and clear timeouts
      if (this.animationController) {
        this.animationController.stopAllAnimations();
        this.animationController.clearAllTimeouts();
      }

      if (this.ttsBridgeHandlers && this.api.pluginLoader) {
        const loader = this.api.pluginLoader;
        loader.removeListener('tts:playback:started', this.ttsBridgeHandlers.startHandler);
        loader.removeListener('tts:playback:ended', this.ttsBridgeHandlers.endHandler);
        this.ttsBridgeHandlers = null;
      }

      // Clear cleanup interval
      if (this.cacheCleanupInterval) {
        clearInterval(this.cacheCleanupInterval);
      }

      this.logger.info('TalkingHeads: Plugin destroyed');
    } catch (error) {
      this.logger.error('TalkingHeads: Error during destroy', error);
    }
  }
}

module.exports = TalkingHeadsPlugin;
