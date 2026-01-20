/**
 * AnimazingPal Plugin
 * Integration with Animaze API for VTuber avatar control via TikTok LIVE events
 * 
 * Based on the official Animaze API documentation.
 * WebSocket connection to ws://localhost:8008 (default)
 * 
 * Features:
 * - Avatar control via TikTok events (gifts, chat, follows, etc.)
 * - ChatPal integration for AI-powered avatar speech
 * - Echo mode: Use -echo prefix for TTS-only (no AI response)
 * - Brain Engine with GPT-powered intelligent responses
 * 
 * Architecture:
 * - Memory Database (Nervous System) - stores all experiences & memories per streamer
 * - Vector Memory (Synapses) - links related memories semantically  
 * - GPT Brain (Cerebral Cortex) - intelligent response generation with personality
 * - Animaze (Body/Voice) - avatar expression output
 * - ChatPal - AI chatbot integration for avatar speech
 * 
 * The brain behaves like a digital human:
 * - Decides autonomously when to speak
 * - Processes all stream events and determines relevance
 * - Maintains long-term memories per streamer profile
 * - Supports multiple languages for personalities
 */

const WebSocket = require('ws');
const path = require('path');
const BrainEngine = require('./brain/brain-engine');

class AnimazingPalPlugin {
  constructor(api) {
    this.api = api;
    this.io = api.getSocketIO();
    this.db = api.getDatabase();
    
    // WebSocket connection to Animaze
    this.ws = null;
    this.isConnected = false;
    this.reconnectTimer = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 10;
    
    // Brain Engine - AI Intelligence System
    this.brainEngine = null;
    
    // Configuration
    this.config = null;
    
    // Animaze data cache (populated after connection)
    this.animazeData = {
      avatars: [],
      scenes: [],
      emotes: [],
      specialActions: [],
      poses: [],
      idleAnims: [],
      currentAvatar: null,
      currentScene: null
    };
    
    // Pending request callbacks for async responses
    this.pendingRequests = new Map();
    this.requestIdCounter = 0;
    
    // Available override behaviors
    this.overrideBehaviors = [
      'Follow Mouse Cursor',
      'Mouse Keyboard Behavior',
      'Tracked Blinking',
      'Auto Blink',
      'Look At Camera',
      'Look At Camera Head',
      'Cross Eyes',
      'Pupil Behavior',
      'Forced Symmetry Eyebrows',
      'Forced Symmetry Eyelids',
      'Forced Symmetry Mouth',
      'Enhanced Body Movement 2D',
      'Enhanced Body Movement 3D',
      'Extreme Head Angles Attenuation',
      'Sound to Mouth Open',
      'Alternate lipsync Retargeting',
      'Idle Intensity',
      'Inferred Body Yaw Movement',
      'Breathing Behavior'
    ];
    
    // Rate limiting for event triggers
    this.lastEventTimes = new Map();
    this.eventCooldowns = {
      gift: 500,      // 500ms between gift triggers
      chat: 1000,     // 1s between chat messages
      follow: 2000,   // 2s between follow triggers
      like: 100,      // 100ms between like triggers
      share: 2000,    // 2s between share triggers
      subscribe: 3000 // 3s between subscribe triggers
    };
  }

  async init() {
    this.api.log('Initializing AnimazingPal Plugin...', 'info');
    
    // Load configuration
    this.config = this.api.getConfig('config') || this.getDefaultConfig();
    
    // Initialize Brain Engine
    try {
      this.brainEngine = new BrainEngine(this.api);
      await this.brainEngine.initialize();
      
      // Configure brain with saved settings
      if (this.config.brain) {
        this.brainEngine.configure(this.config.brain);
      }
      
      this.api.log('Brain Engine initialized successfully', 'info');
    } catch (error) {
      this.api.log(`Brain Engine initialization failed: ${error.message}`, 'error');
    }
    
    // Register API routes
    this.registerRoutes();
    
    // Register Socket.IO events
    this.registerSocketEvents();
    
    // Register TikTok event handlers
    this.registerTikTokEvents();
    
    // Auto-connect if enabled
    if (this.config.enabled && this.config.autoConnect) {
      await this.connect();
    }
    
    this.api.log('AnimazingPal Plugin initialized', 'info');
  }

  getDefaultConfig() {
    return {
      enabled: false,
      autoConnect: true,
      host: '127.0.0.1',
      port: 8008,
      reconnectOnDisconnect: true,
      reconnectDelay: 5000,
      // Auto-refresh Animaze data on connect
      autoRefreshData: true,
      // Gift mappings - map TikTok gifts to Animaze actions
      giftMappings: [],
      // Chat settings - send TikTok chat to ChatPal
      chatToAvatar: {
        enabled: false,
        useEcho: true,  // Use -echo prefix for TTS only (no AI response)
        prefix: '',
        maxLength: 200
      },
      // Default actions for TikTok events
      eventActions: {
        follow: {
          enabled: true,
          actionType: 'emote',     // 'emote', 'specialAction', 'pose', 'idle', 'chatMessage'
          actionValue: null,       // itemName for emote, index for others
          chatMessage: null        // Optional message to send to ChatPal
        },
        share: {
          enabled: true,
          actionType: 'emote',
          actionValue: null,
          chatMessage: null
        },
        subscribe: {
          enabled: true,
          actionType: 'specialAction',
          actionValue: null,
          chatMessage: 'Thank you {username} for subscribing!'
        },
        like: {
          enabled: false,
          actionType: null,
          actionValue: null,
          chatMessage: null,
          threshold: 10           // Only trigger after this many likes
        }
      },
      // Override behavior settings
      overrides: {
        // e.g. 'Breathing Behavior': { enabled: true, amplitude: 0.5, frequency: 1.0 }
      },
      // Brain/AI settings
      brain: {
        enabled: false,
        standaloneMode: false,        // Standalone mode: AnimazingPal handles everything independently
        openaiApiKey: null,
        model: 'gpt-4o-mini',      // Use efficient model by default
        activePersonality: null,
        // Memory settings
        memoryImportanceThreshold: 0.3,
        maxContextMemories: 10,
        archiveAfterDays: 7,
        pruneAfterDays: 30,
        // Auto-response settings
        autoRespond: {
          chat: false,              // Respond to chat messages
          gifts: true,              // Thank for gifts
          follows: true,            // Welcome new followers
          shares: false             // Thank for shares
        },
        // Rate limiting
        maxResponsesPerMinute: 10,
        chatResponseProbability: 0.3  // Respond to 30% of chats
      },
      // Advanced settings
      verboseLogging: false
    };
  }

  registerRoutes() {
    // Serve the UI page
    this.api.registerRoute('get', '/animazingpal/ui', (req, res) => {
      const uiPath = path.join(__dirname, 'ui.html');
      res.sendFile(uiPath);
    });

    // Get plugin status
    this.api.registerRoute('get', '/api/animazingpal/status', (req, res) => {
      res.json({
        success: true,
        isConnected: this.isConnected,
        config: this.getSafeConfig(),
        reconnectAttempts: this.reconnectAttempts,
        animazeData: this.animazeData,
        overrideBehaviors: this.overrideBehaviors
      });
    });

    // Get configuration
    this.api.registerRoute('get', '/api/animazingpal/config', (req, res) => {
      res.json({
        success: true,
        config: this.getSafeConfig()
      });
    });

    // Update configuration
    this.api.registerRoute('post', '/api/animazingpal/config', async (req, res) => {
      try {
        const newConfig = req.body;
        this.config = { ...this.config, ...newConfig };
        this.api.setConfig('config', this.config);
        
        this.api.log('AnimazingPal config updated', 'info');
        this.safeEmitStatus();
        
        res.json({ success: true, config: this.getSafeConfig() });
      } catch (error) {
        this.api.log(`Config update error: ${error.message}`, 'error');
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Connect to Animaze
    this.api.registerRoute('post', '/api/animazingpal/connect', async (req, res) => {
      try {
        const connected = await this.connect();
        res.json({ success: connected, isConnected: this.isConnected });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Disconnect from Animaze
    this.api.registerRoute('post', '/api/animazingpal/disconnect', (req, res) => {
      this.disconnect();
      res.json({ success: true, isConnected: this.isConnected });
    });

    // Refresh Animaze data (avatars, emotes, etc.)
    this.api.registerRoute('post', '/api/animazingpal/refresh', async (req, res) => {
      try {
        await this.refreshAnimazeData();
        res.json({ success: true, animazeData: this.animazeData });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get available avatars
    this.api.registerRoute('get', '/api/animazingpal/avatars', (req, res) => {
      res.json({ success: true, avatars: this.animazeData.avatars });
    });

    // Load avatar
    this.api.registerRoute('post', '/api/animazingpal/avatar/load', async (req, res) => {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'Avatar name is required' });
      }
      
      const success = await this.loadAvatar(name);
      res.json({ success, avatar: name });
    });

    // Get available scenes
    this.api.registerRoute('get', '/api/animazingpal/scenes', (req, res) => {
      res.json({ success: true, scenes: this.animazeData.scenes });
    });

    // Load scene
    this.api.registerRoute('post', '/api/animazingpal/scene/load', async (req, res) => {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'Scene name is required' });
      }
      
      const success = await this.loadScene(name);
      res.json({ success, scene: name });
    });

    // Get available emotes
    this.api.registerRoute('get', '/api/animazingpal/emotes', (req, res) => {
      res.json({ success: true, emotes: this.animazeData.emotes });
    });

    // Trigger emote
    this.api.registerRoute('post', '/api/animazingpal/emote', async (req, res) => {
      const { itemName } = req.body;
      if (!itemName) {
        return res.status(400).json({ success: false, error: 'Emote itemName is required' });
      }
      
      const success = await this.triggerEmote(itemName);
      res.json({ success, emote: itemName });
    });

    // Get special actions
    this.api.registerRoute('get', '/api/animazingpal/special-actions', (req, res) => {
      res.json({ success: true, specialActions: this.animazeData.specialActions });
    });

    // Trigger special action
    this.api.registerRoute('post', '/api/animazingpal/special-action', async (req, res) => {
      const { index } = req.body;
      if (index === undefined) {
        return res.status(400).json({ success: false, error: 'Action index is required' });
      }
      
      const success = await this.triggerSpecialAction(index);
      res.json({ success, index });
    });

    // Get poses
    this.api.registerRoute('get', '/api/animazingpal/poses', (req, res) => {
      res.json({ success: true, poses: this.animazeData.poses });
    });

    // Trigger pose
    this.api.registerRoute('post', '/api/animazingpal/pose', async (req, res) => {
      const { index } = req.body;
      if (index === undefined) {
        return res.status(400).json({ success: false, error: 'Pose index is required' });
      }
      
      const success = await this.triggerPose(index);
      res.json({ success, index });
    });

    // Get idle animations
    this.api.registerRoute('get', '/api/animazingpal/idles', (req, res) => {
      res.json({ success: true, idleAnims: this.animazeData.idleAnims });
    });

    // Trigger idle animation
    this.api.registerRoute('post', '/api/animazingpal/idle', async (req, res) => {
      const { index } = req.body;
      if (index === undefined) {
        return res.status(400).json({ success: false, error: 'Idle index is required' });
      }
      
      const success = await this.triggerIdle(index);
      res.json({ success, index });
    });

    // Send message to ChatPal
    this.api.registerRoute('post', '/api/animazingpal/chatpal', async (req, res) => {
      const { message, useEcho } = req.body;
      if (!message) {
        return res.status(400).json({ success: false, error: 'Message is required' });
      }
      
      const success = await this.sendChatMessage(message, useEcho);
      res.json({ success, message });
    });

    // Set override behavior
    this.api.registerRoute('post', '/api/animazingpal/override', async (req, res) => {
      const { behavior, value, ...params } = req.body;
      if (!behavior) {
        return res.status(400).json({ success: false, error: 'Behavior name is required' });
      }
      
      const success = await this.setOverride(behavior, value, params);
      res.json({ success, behavior, value });
    });

    // Get override behavior status
    this.api.registerRoute('post', '/api/animazingpal/override/get', async (req, res) => {
      const { behavior } = req.body;
      if (!behavior) {
        return res.status(400).json({ success: false, error: 'Behavior name is required' });
      }
      
      const result = await this.getOverride(behavior);
      res.json({ success: true, ...result });
    });

    // Calibrate tracker
    this.api.registerRoute('post', '/api/animazingpal/calibrate', async (req, res) => {
      const success = await this.calibrateTracker();
      res.json({ success });
    });

    // Toggle broadcast (virtual camera)
    this.api.registerRoute('post', '/api/animazingpal/broadcast', async (req, res) => {
      const { toggle } = req.body;
      if (toggle === undefined) {
        return res.status(400).json({ success: false, error: 'Toggle value is required' });
      }
      
      const success = await this.setBroadcast(toggle);
      res.json({ success, broadcast: toggle });
    });

    // Test connection
    this.api.registerRoute('post', '/api/animazingpal/test', async (req, res) => {
      try {
        const wasConnected = this.isConnected;
        
        if (!wasConnected) {
          await this.connect();
        }
        
        // Refresh data and return status
        if (this.isConnected) {
          await this.refreshAnimazeData();
        }
        
        res.json({ 
          success: this.isConnected, 
          message: this.isConnected 
            ? `Connected! Found ${this.animazeData.avatars.length} avatars and ${this.animazeData.emotes.length} emotes.`
            : 'Could not connect to Animaze. Make sure the Animaze API is enabled in Settings > Animaze API.',
          isConnected: this.isConnected,
          animazeData: this.animazeData
        });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Gift mappings management
    this.api.registerRoute('get', '/api/animazingpal/gift-mappings', (req, res) => {
      res.json({
        success: true,
        mappings: this.config.giftMappings || []
      });
    });

    this.api.registerRoute('post', '/api/animazingpal/gift-mappings', async (req, res) => {
      const { mappings } = req.body;
      
      if (!Array.isArray(mappings)) {
        return res.status(400).json({ success: false, error: 'Mappings must be an array' });
      }
      
      this.config.giftMappings = mappings;
      this.api.setConfig('config', this.config);
      
      this.api.log(`Updated ${mappings.length} gift mappings`, 'info');
      res.json({ success: true, mappings });
    });

    // ==================== Brain/AI Routes ====================

    // Get brain status and statistics
    this.api.registerRoute('get', '/api/animazingpal/brain/status', (req, res) => {
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      res.json({
        success: true,
        statistics: this.brainEngine.getStatistics(),
        personalities: this.brainEngine.getPersonalities(),
        currentPersonality: this.brainEngine.currentPersonality
      });
    });

    // Configure brain settings
    this.api.registerRoute('post', '/api/animazingpal/brain/config', async (req, res) => {
      try {
        const brainConfig = req.body;
        
        // Update config
        this.config.brain = { ...this.config.brain, ...brainConfig };
        this.api.setConfig('config', this.config);
        
        // Apply to brain engine
        if (this.brainEngine) {
          this.brainEngine.configure(brainConfig);
        }
        
        this.api.log('Brain config updated', 'info');
        res.json({ success: true, config: this.config.brain });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Test GPT connection
    this.api.registerRoute('post', '/api/animazingpal/brain/test', async (req, res) => {
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      const result = await this.brainEngine.testConnection();
      res.json(result);
    });

    // Get all personalities
    this.api.registerRoute('get', '/api/animazingpal/brain/personalities', (req, res) => {
      if (!this.brainEngine) {
        return res.json({ success: false, personalities: [] });
      }
      
      res.json({
        success: true,
        personalities: this.brainEngine.getPersonalities()
      });
    });

    // Set active personality
    this.api.registerRoute('post', '/api/animazingpal/brain/personality/set', async (req, res) => {
      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ success: false, error: 'Personality name required' });
      }
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      await this.brainEngine.setActivePersonality(name);
      res.json({
        success: true,
        personality: this.brainEngine.currentPersonality
      });
    });

    // Create custom personality
    this.api.registerRoute('post', '/api/animazingpal/brain/personality/create', async (req, res) => {
      const personalityData = req.body;
      
      if (!personalityData.name || !personalityData.system_prompt) {
        return res.status(400).json({ success: false, error: 'Name and system_prompt required' });
      }
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      try {
        const id = this.brainEngine.createPersonality(personalityData);
        res.json({ success: true, id, personality: this.brainEngine.getPersonality(personalityData.name) });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Get single personality
    this.api.registerRoute('get', '/api/animazingpal/brain/personality/:name', (req, res) => {
      const { name } = req.params;
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      const personality = this.brainEngine.getPersonality(name);
      if (personality) {
        res.json({ success: true, personality });
      } else {
        res.status(404).json({ success: false, error: 'Personality not found' });
      }
    });

    // Update personality
    this.api.registerRoute('put', '/api/animazingpal/brain/personality/:name', async (req, res) => {
      const { name } = req.params;
      const updates = req.body;
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      try {
        this.brainEngine.updatePersonality(name, updates);
        res.json({ success: true, personality: this.brainEngine.getPersonality(name) });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Delete custom personality
    this.api.registerRoute('delete', '/api/animazingpal/brain/personality/:name', (req, res) => {
      const { name } = req.params;
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      const deleted = this.brainEngine.deletePersonality(name);
      if (deleted) {
        res.json({ success: true, message: 'Personality deleted' });
      } else {
        res.status(400).json({ success: false, error: 'Cannot delete built-in personality or personality not found' });
      }
    });

    // Search memories
    this.api.registerRoute('get', '/api/animazingpal/brain/memories/search', (req, res) => {
      const { query } = req.query;
      if (!query) {
        return res.status(400).json({ success: false, error: 'Query required' });
      }
      
      if (!this.brainEngine) {
        return res.json({ success: false, memories: [] });
      }
      
      const memories = this.brainEngine.searchMemories(query);
      res.json({ success: true, memories });
    });

    // Get user profile
    this.api.registerRoute('get', '/api/animazingpal/brain/user/:username', (req, res) => {
      const { username } = req.params;
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      const profile = this.brainEngine.getUserProfile(username);
      res.json({ success: true, profile });
    });

    // Manual chat response (for testing)
    this.api.registerRoute('post', '/api/animazingpal/brain/chat', async (req, res) => {
      const { username, message } = req.body;
      
      if (!username || !message) {
        return res.status(400).json({ success: false, error: 'Username and message required' });
      }
      
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      try {
        const response = await this.brainEngine.processChat(username, message, { forceRespond: true });
        
        // Send to Animaze if connected and response generated
        if (response && this.isConnected) {
          await this.sendChatMessage(response.text, false);
        }
        
        res.json({ success: true, response });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });

    // Archive old memories
    this.api.registerRoute('post', '/api/animazingpal/brain/archive', async (req, res) => {
      if (!this.brainEngine) {
        return res.json({ success: false, error: 'Brain Engine not initialized' });
      }
      
      try {
        await this.brainEngine.archiveOldMemories();
        res.json({ success: true, message: 'Memories archived' });
      } catch (error) {
        res.status(500).json({ success: false, error: error.message });
      }
    });
  }

  registerSocketEvents() {
    // Client requests status
    this.api.registerSocket('animazingpal:get-status', () => {
      this.safeEmitStatus();
    });

    // Client requests connection
    this.api.registerSocket('animazingpal:connect', async () => {
      await this.connect();
    });

    // Client requests disconnection
    this.api.registerSocket('animazingpal:disconnect', () => {
      this.disconnect();
    });

    // Client requests data refresh
    this.api.registerSocket('animazingpal:refresh', async () => {
      await this.refreshAnimazeData();
      this.safeEmitStatus();
    });

    // Client triggers emote
    this.api.registerSocket('animazingpal:emote', async (data) => {
      if (data && data.itemName) {
        await this.triggerEmote(data.itemName);
      }
    });

    // Client triggers special action
    this.api.registerSocket('animazingpal:special-action', async (data) => {
      if (data && data.index !== undefined) {
        await this.triggerSpecialAction(data.index);
      }
    });

    // Client triggers pose
    this.api.registerSocket('animazingpal:pose', async (data) => {
      if (data && data.index !== undefined) {
        await this.triggerPose(data.index);
      }
    });

    // Client triggers idle
    this.api.registerSocket('animazingpal:idle', async (data) => {
      if (data && data.index !== undefined) {
        await this.triggerIdle(data.index);
      }
    });

    // Client sends ChatPal message
    this.api.registerSocket('animazingpal:chatpal', async (data) => {
      if (data && data.message) {
        await this.sendChatMessage(data.message, data.useEcho);
      }
    });

    // Client loads avatar
    this.api.registerSocket('animazingpal:load-avatar', async (data) => {
      if (data && data.name) {
        await this.loadAvatar(data.name);
      }
    });

    // Client loads scene
    this.api.registerSocket('animazingpal:load-scene', async (data) => {
      if (data && data.name) {
        await this.loadScene(data.name);
      }
    });
  }

  registerTikTokEvents() {
    // TikTok connected event - set streamer ID for per-streamer memory
    this.api.registerTikTokEvent('connected', (data) => {
      if (data && data.roomId) {
        const streamerId = data.uniqueId || data.roomId || 'default';
        this.api.log(`TikTok connected to streamer: ${streamerId}`, 'info');
        
        // Set streamer ID in brain engine for per-streamer memory
        if (this.brainEngine) {
          this.brainEngine.setStreamerId(streamerId);
        }
        
        // Store connection as memory
        if (this.brainEngine && this.config.brain?.enabled) {
          this.brainEngine.storeMemory(`Stream gestartet für ${streamerId}`, {
            type: 'stream_start',
            event: 'connected',
            importance: 0.6
          });
        }
      }
    });

    // TikTok disconnected event
    this.api.registerTikTokEvent('disconnected', (data) => {
      this.api.log('TikTok disconnected', 'info');
      
      if (this.brainEngine && this.config.brain?.enabled) {
        this.brainEngine.storeMemory('Stream beendet', {
          type: 'stream_end',
          event: 'disconnected',
          importance: 0.4
        });
      }
    });

    // Gift events
    this.api.registerTikTokEvent('gift', (data) => {
      this.handleGiftEvent(data);
    });

    // Chat events
    this.api.registerTikTokEvent('chat', (data) => {
      this.handleChatEvent(data);
    });

    // Follow events
    this.api.registerTikTokEvent('follow', (data) => {
      this.handleFollowEvent(data);
    });

    // Share events
    this.api.registerTikTokEvent('share', (data) => {
      this.handleShareEvent(data);
    });

    // Like events
    this.api.registerTikTokEvent('like', (data) => {
      this.handleLikeEvent(data);
    });

    // Subscribe events
    this.api.registerTikTokEvent('subscribe', (data) => {
      this.handleSubscribeEvent(data);
    });

    this.api.log('TikTok event handlers registered for AnimazingPal', 'info');
  }

  // ==================== Connection Management ====================

  async connect() {
    if (this.isConnected) {
      this.api.log('Already connected to Animaze', 'warn');
      return true;
    }

    // Close any existing WebSocket connection before creating a new one
    if (this.ws) {
      try {
        this.ws.close();
      } catch (error) {
        // Ignore errors when closing old connection
      }
      this.ws = null;
    }

    const wsUrl = `ws://${this.config.host}:${this.config.port}`;
    this.api.log(`Connecting to Animaze at ${wsUrl}...`, 'info');

    return new Promise((resolve) => {
      let resolved = false; // Guard to prevent multiple resolve calls
      const isInitialConnection = this.reconnectAttempts === 0; // Track if this is initial connection

      const safeResolve = (value) => {
        if (!resolved) {
          resolved = true;
          resolve(value);
        }
      };

      try {
        this.ws = new WebSocket(wsUrl);

        this.ws.on('open', async () => {
          this.isConnected = true;
          this.reconnectAttempts = 0;
          this.api.log('Connected to Animaze successfully', 'info');
          
          // Auto-refresh Animaze data
          if (this.config.autoRefreshData) {
            try {
              await this.refreshAnimazeData();
            } catch (refreshError) {
              this.api.log(`Failed to refresh Animaze data: ${refreshError.message}`, 'warn');
            }
          }
          
          this.safeEmitStatus();
          safeResolve(true);
        });

        this.ws.on('message', (data) => {
          try {
            this.handleAnimazeMessage(data);
          } catch (msgError) {
            this.api.log(`Error handling Animaze message: ${msgError.message}`, 'error');
          }
        });

        this.ws.on('close', () => {
          const wasConnected = this.isConnected;
          this.isConnected = false;
          this.api.log('Disconnected from Animaze', 'info');
          this.safeEmitStatus();
          
          // Only trigger reconnect if this is not the initial connection AND we were previously connected
          // This prevents reconnect loops during plugin initialization
          if (!isInitialConnection && wasConnected && this.config.reconnectOnDisconnect && this.config.enabled) {
            this.scheduleReconnect();
          }
        });

        this.ws.on('error', (error) => {
          this.api.log(`Animaze WebSocket error: ${error.message}`, 'error');
          this.isConnected = false;
          this.safeEmitStatus();
          safeResolve(false);
        });

        // Connection timeout
        setTimeout(() => {
          if (!this.isConnected && !resolved) {
            this.api.log('Connection to Animaze timed out', 'warn');
            if (this.ws) {
              try {
                this.ws.close();
              } catch (closeError) {
                // Ignore errors when closing timed out connection
              }
            }
            safeResolve(false);
          }
        }, 10000);

      } catch (error) {
        this.api.log(`Failed to connect to Animaze: ${error.message}`, 'error');
        safeResolve(false);
      }
    });
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    
    this.isConnected = false;
    this.reconnectAttempts = 0;
    this.api.log('Disconnected from Animaze', 'info');
    this.safeEmitStatus();
  }

  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.api.log('Max reconnect attempts reached. Please reconnect manually.', 'warn');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.config.reconnectDelay * this.reconnectAttempts;
    
    this.api.log(`Scheduling reconnect attempt ${this.reconnectAttempts} in ${delay}ms...`, 'info');
    
    this.reconnectTimer = setTimeout(async () => {
      await this.connect();
    }, delay);
  }

  handleAnimazeMessage(data) {
    try {
      const message = JSON.parse(data.toString());
      
      if (this.config.verboseLogging) {
        this.api.log(`Animaze message: ${JSON.stringify(message)}`, 'debug');
      }

      // Handle response with ID (for pending requests)
      if (message.id && this.pendingRequests.has(message.id)) {
        const { resolve } = this.pendingRequests.get(message.id);
        this.pendingRequests.delete(message.id);
        resolve(message);
        return;
      }

      // Handle events/triggers from Animaze
      if (message.event) {
        switch (message.event) {
          case 'ChatbotSpeechStarted':
            this.api.log('ChatPal started speaking', 'debug');
            this.io.emit('animazingpal:speech-start', message);
            break;
          case 'ChatbotSpeechEnded':
            this.api.log('ChatPal finished speaking', 'debug');
            this.io.emit('animazingpal:speech-end', message);
            break;
          case 'AvatarChanged':
            this.api.log(`Avatar changed to: ${message.new_avatar}`, 'info');
            this.animazeData.currentAvatar = message.new_avatar;
            this.io.emit('animazingpal:avatar-changed', message);
            // Refresh avatar-specific data
            this.refreshAvatarData();
            break;
          default:
            this.api.emit('animazingpal:event', message);
        }
        return;
      }

      // Handle action responses (without ID)
      if (message.action) {
        this.handleActionResponse(message);
      }

      // Handle errors
      if (message.error) {
        this.api.log(`Animaze error: ${message.error}`, 'error');
        this.api.emit('animazingpal:error', message);
      }

    } catch (error) {
      if (this.config.verboseLogging) {
        this.api.log(`Failed to parse Animaze message: ${error.message}`, 'warn');
      }
    }
  }

  handleActionResponse(message) {
    // Update local data cache based on response type
    switch (message.action) {
      case 'GetAvatars':
        if (message.avatars) {
          this.animazeData.avatars = message.avatars;
        }
        break;
      case 'GetScenes':
        if (message.scenes) {
          this.animazeData.scenes = message.scenes;
        }
        break;
      case 'GetEmotes':
        if (message.emotes) {
          this.animazeData.emotes = message.emotes;
        }
        break;
      case 'GetSpecialActions':
        if (message.specialActions) {
          this.animazeData.specialActions = message.specialActions;
        }
        break;
      case 'GetPoses':
        if (message.poseList) {
          this.animazeData.poses = message.poseList;
        }
        break;
      case 'GetIdleAnims':
        if (message.idleList) {
          this.animazeData.idleAnims = message.idleList;
        }
        break;
      case 'GetCurrentAvatarInfo':
        if (message.avatars && message.avatars.length > 0) {
          this.animazeData.currentAvatar = message.avatars[0];
        }
        break;
      case 'GetCurrentSceneInfo':
        this.animazeData.currentScene = message;
        break;
      case 'ChatbotSendMessage':
        if (message.response) {
          this.api.log(`ChatPal response: ${message.response}`, 'info');
          this.api.emit('animazingpal:chatpal-response', { response: message.response });
        }
        break;
    }
  }

  // ==================== Animaze API Commands ====================

  /**
   * Generate a unique request ID
   */
  generateRequestId() {
    return `ltth_${++this.requestIdCounter}_${Date.now()}`;
  }

  /**
   * Send command to Animaze and optionally wait for response
   */
  sendCommand(command, waitForResponse = false) {
    if (!this.isConnected || !this.ws) {
      this.api.log('Cannot send command: Not connected to Animaze', 'warn');
      return waitForResponse ? Promise.resolve(null) : false;
    }

    try {
      // Add request ID if waiting for response
      if (waitForResponse) {
        command.id = this.generateRequestId();
      }

      const message = JSON.stringify(command);
      this.ws.send(message);
      
      if (this.config.verboseLogging) {
        this.api.log(`Sent to Animaze: ${message}`, 'debug');
      }

      if (waitForResponse) {
        return new Promise((resolve) => {
          this.pendingRequests.set(command.id, { resolve });
          
          // Timeout after 10 seconds
          setTimeout(() => {
            if (this.pendingRequests.has(command.id)) {
              this.pendingRequests.delete(command.id);
              resolve(null);
            }
          }, 10000);
        });
      }
      
      return true;
    } catch (error) {
      this.api.log(`Failed to send command to Animaze: ${error.message}`, 'error');
      return waitForResponse ? Promise.resolve(null) : false;
    }
  }

  /**
   * Refresh all Animaze data (avatars, scenes, emotes, etc.)
   */
  async refreshAnimazeData() {
    if (!this.isConnected) {
      this.api.log('Cannot refresh data: Not connected to Animaze', 'warn');
      return;
    }

    this.api.log('Refreshing Animaze data...', 'info');

    // Get avatars
    const avatarsResp = await this.sendCommand({ action: 'GetAvatars' }, true);
    if (avatarsResp && avatarsResp.avatars) {
      this.animazeData.avatars = avatarsResp.avatars;
    }

    // Get scenes
    const scenesResp = await this.sendCommand({ action: 'GetScenes' }, true);
    if (scenesResp && scenesResp.scenes) {
      this.animazeData.scenes = scenesResp.scenes;
    }

    // Get emotes
    const emotesResp = await this.sendCommand({ action: 'GetEmotes' }, true);
    if (emotesResp && emotesResp.emotes) {
      this.animazeData.emotes = emotesResp.emotes;
    }

    // Get avatar-specific data
    await this.refreshAvatarData();

    // Get current avatar info
    const currentAvatarResp = await this.sendCommand({ action: 'GetCurrentAvatarInfo' }, true);
    if (currentAvatarResp && currentAvatarResp.avatars && currentAvatarResp.avatars.length > 0) {
      this.animazeData.currentAvatar = currentAvatarResp.avatars[0];
    }

    // Get current scene info
    const currentSceneResp = await this.sendCommand({ action: 'GetCurrentSceneInfo' }, true);
    if (currentSceneResp) {
      this.animazeData.currentScene = currentSceneResp;
    }

    this.api.log(`Refreshed Animaze data: ${this.animazeData.avatars.length} avatars, ${this.animazeData.emotes.length} emotes`, 'info');
    this.api.emit('animazingpal:data-refreshed', this.animazeData);
  }

  /**
   * Refresh avatar-specific data (special actions, poses, idles)
   */
  async refreshAvatarData() {
    // Get special actions for current avatar
    const specialActionsResp = await this.sendCommand({ action: 'GetSpecialActions' }, true);
    if (specialActionsResp && specialActionsResp.specialActions) {
      this.animazeData.specialActions = specialActionsResp.specialActions;
    }

    // Get poses for current avatar
    const posesResp = await this.sendCommand({ action: 'GetPoses' }, true);
    if (posesResp && posesResp.poseList) {
      this.animazeData.poses = posesResp.poseList;
    }

    // Get idle animations for current avatar
    const idlesResp = await this.sendCommand({ action: 'GetIdleAnims' }, true);
    if (idlesResp && idlesResp.idleList) {
      this.animazeData.idleAnims = idlesResp.idleList;
    }
  }

  /**
   * Load an avatar by name
   */
  async loadAvatar(name) {
    const command = {
      action: 'LoadAvatar',
      name: name
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      this.api.log(`Loading avatar: ${name}`, 'info');
      this.api.emit('animazingpal:avatar-loading', { name });
    }
    
    return success;
  }

  /**
   * Load a scene by name
   */
  async loadScene(name) {
    const command = {
      action: 'LoadScene',
      name: name
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      this.api.log(`Loading scene: ${name}`, 'info');
      this.api.emit('animazingpal:scene-loading', { name });
    }
    
    return success;
  }

  /**
   * Trigger an emote by itemName
   */
  async triggerEmote(itemName) {
    const command = {
      action: 'TriggerEmote',
      itemName: itemName
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      this.api.log(`Triggered emote: ${itemName}`, 'info');
      this.api.emit('animazingpal:emote-triggered', { itemName });
    }
    
    return success;
  }

  /**
   * Trigger a special action by index
   */
  async triggerSpecialAction(index) {
    const command = {
      action: 'TriggerSpecialAction',
      index: parseInt(index)
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      const actionName = this.animazeData.specialActions.find(a => a.index === index)?.animName || index;
      this.api.log(`Triggered special action: ${actionName}`, 'info');
      this.api.emit('animazingpal:special-action-triggered', { index, name: actionName });
    }
    
    return success;
  }

  /**
   * Trigger a pose by index
   */
  async triggerPose(index) {
    const command = {
      action: 'TriggerPose',
      index: parseInt(index)
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      const poseName = this.animazeData.poses.find(p => p.index === index)?.animName || index;
      this.api.log(`Triggered pose: ${poseName}`, 'info');
      this.api.emit('animazingpal:pose-triggered', { index, name: poseName });
    }
    
    return success;
  }

  /**
   * Trigger an idle animation by index
   */
  async triggerIdle(index) {
    const command = {
      action: 'TriggerIdle',
      index: parseInt(index)
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      const idleName = this.animazeData.idleAnims.find(i => i.index === index)?.animName || index;
      this.api.log(`Triggered idle: ${idleName}`, 'info');
      this.api.emit('animazingpal:idle-triggered', { index, name: idleName });
    }
    
    return success;
  }

  /**
   * Send a message to ChatPal
   * @param {string} message - The message to send
   * @param {boolean} useEcho - If true, use -echo prefix for TTS only (no AI response)
   */
  async sendChatMessage(message, useEcho = false) {
    const finalMessage = useEcho ? `-echo ${message}` : message;
    
    const command = {
      action: 'ChatbotSendMessage',
      message: finalMessage
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      this.api.log(`Sent to ChatPal: ${finalMessage}`, 'info');
      this.api.emit('animazingpal:chatpal-message-sent', { message: finalMessage, useEcho });
    }
    
    return success;
  }

  /**
   * Set an override behavior
   */
  async setOverride(behavior, value, params = {}) {
    const command = {
      action: 'SetOverride',
      behavior: behavior,
      value: !!value,
      ...params
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      this.api.log(`Set override ${behavior}: ${value}`, 'info');
    }
    
    return success;
  }

  /**
   * Get an override behavior status
   */
  async getOverride(behavior) {
    const command = {
      action: 'GetOverride',
      behavior: behavior
    };
    
    const response = await this.sendCommand(command, true);
    return response || { behavior, value: false };
  }

  /**
   * Calibrate the tracker
   */
  async calibrateTracker() {
    const command = { action: 'CalibrateTracker' };
    
    const success = this.sendCommand(command);
    
    if (success) {
      this.api.log('Calibrating tracker...', 'info');
    }
    
    return success;
  }

  /**
   * Enable/disable virtual camera broadcast
   */
  async setBroadcast(toggle) {
    const command = {
      action: 'Broadcast',
      toggle: !!toggle
    };
    
    const success = this.sendCommand(command);
    
    if (success) {
      this.api.log(`Broadcast ${toggle ? 'enabled' : 'disabled'}`, 'info');
    }
    
    return success;
  }

  // ==================== TikTok Event Handlers ====================

  canTriggerEvent(eventType) {
    const now = Date.now();
    const lastTime = this.lastEventTimes.get(eventType) || 0;
    const cooldown = this.eventCooldowns[eventType] || 1000;
    
    if (now - lastTime < cooldown) {
      return false;
    }
    
    this.lastEventTimes.set(eventType, now);
    return true;
  }

  /**
   * Execute an action based on configuration
   */
  async executeAction(actionConfig, placeholders = {}) {
    if (!actionConfig || !actionConfig.actionType) return;

    const { actionType, actionValue, chatMessage } = actionConfig;

    // Execute the main action
    switch (actionType) {
      case 'emote':
        if (actionValue) {
          await this.triggerEmote(actionValue);
        }
        break;
      case 'specialAction':
        if (actionValue !== null && actionValue !== undefined) {
          await this.triggerSpecialAction(actionValue);
        }
        break;
      case 'pose':
        if (actionValue !== null && actionValue !== undefined) {
          await this.triggerPose(actionValue);
        }
        break;
      case 'idle':
        if (actionValue !== null && actionValue !== undefined) {
          await this.triggerIdle(actionValue);
        }
        break;
      case 'chatMessage':
        // Only send chat message, no animation
        break;
    }

    // Send chat message if configured
    if (chatMessage) {
      let message = chatMessage;
      // Replace placeholders
      for (const [key, value] of Object.entries(placeholders)) {
        message = message.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
      }
      await this.sendChatMessage(message, this.config.chatToAvatar?.useEcho);
    }
  }

  handleGiftEvent(data) {
    if (!this.config.enabled || !this.isConnected) return;
    if (!this.canTriggerEvent('gift')) return;

    const giftId = data.giftId;
    const giftName = data.giftName;
    const giftValue = data.diamondCount || 1;
    const username = data.uniqueId || 'Someone';

    // Find matching gift mapping
    const mapping = this.config.giftMappings?.find(m => 
      (m.giftId && m.giftId === giftId) || 
      (m.giftName && m.giftName === giftName)
    );

    if (mapping) {
      this.api.log(`Gift mapping triggered: ${giftName} (${giftId})`, 'info');

      const placeholders = {
        username,
        nickname: data.nickname || username,
        giftName: giftName || 'a gift',
        count: data.repeatCount || 1
      };

      // Execute the mapped action
      this.executeAction(mapping, placeholders);
    }

    // Process through Brain Engine for intelligent response
    if (this.brainEngine && this.config.brain?.enabled) {
      this.brainEngine.processGift(username, giftName, giftValue, {
        nickname: data.nickname
      }).then(response => {
        if (response && this.isConnected) {
          // Send AI-generated thank you message to Animaze
          const useEcho = this.config.brain?.standaloneMode || false;
          this.sendChatMessage(response.text, useEcho);
          
          // Trigger persona-based emote
          if (response.emoteConfig) {
            const emote = giftValue >= 1000 ? response.emoteConfig.highEnergyEmote : response.emoteConfig.defaultEmote;
            if (emote) {
              this.triggerEmote(emote);
            }
          }
          
          this.api.emit('animazingpal:brain-response', {
            type: 'gift',
            username,
            response: response.text,
            emotion: response.emotion,
            emote: response.emoteConfig
          });
        }
      }).catch(err => {
        this.api.log(`Brain gift response error: ${err.message}`, 'error');
      });
    }

    this.api.emit('animazingpal:gift-handled', {
      giftId,
      giftName,
      username,
      mapping
    });
  }

  handleChatEvent(data) {
    if (!this.config.enabled || !this.isConnected) return;
    if (!this.canTriggerEvent('chat')) return;

    const comment = data.comment;
    const username = data.uniqueId || 'Someone';

    if (!comment) return;

    // Legacy: Forward to ChatPal directly if enabled (without AI)
    if (this.config.chatToAvatar?.enabled) {
      const prefix = this.config.chatToAvatar.prefix || '';
      let message = prefix ? `${prefix} ${username}: ${comment}` : `${username}: ${comment}`;

      const maxLength = this.config.chatToAvatar.maxLength || 200;
      if (message.length > maxLength) {
        message = message.substring(0, maxLength - 3) + '...';
      }

      this.sendChatMessage(message, this.config.chatToAvatar.useEcho);

      this.api.emit('animazingpal:chat-forwarded', {
        username,
        comment,
        message
      });
    }

    // Process through Brain Engine for intelligent response
    if (this.brainEngine && this.config.brain?.enabled && this.config.brain?.autoRespond?.chat) {
      this.brainEngine.processChat(username, comment, {
        nickname: data.nickname
      }).then(response => {
        if (response && this.isConnected) {
          // Send AI-generated response to Animaze
          const useEcho = this.config.brain?.standaloneMode || false;
          this.sendChatMessage(response.text, useEcho);
          
          // Trigger persona-based emote
          if (response.emoteConfig) {
            const emote = response.emoteConfig.lowEnergyEmote || response.emoteConfig.defaultEmote;
            if (emote) {
              this.triggerEmote(emote);
            }
          }
          
          this.api.emit('animazingpal:brain-response', {
            type: 'chat',
            username,
            userMessage: comment,
            response: response.text,
            emotion: response.emotion,
            emote: response.emoteConfig
          });
        }
      }).catch(err => {
        this.api.log(`Brain chat response error: ${err.message}`, 'error');
      });
    }
  }

  handleFollowEvent(data) {
    if (!this.config.enabled || !this.isConnected) return;
    if (!this.canTriggerEvent('follow')) return;

    const username = data.uniqueId || 'Someone';
    this.api.log(`Follow event from ${username}`, 'info');

    // Execute configured action
    if (this.config.eventActions?.follow?.enabled) {
      this.executeAction(this.config.eventActions.follow, { username });
    }

    // Process through Brain Engine for intelligent response
    if (this.brainEngine && this.config.brain?.enabled && this.config.brain?.autoRespond?.follows) {
      this.brainEngine.processFollow(username, {
        nickname: data.nickname
      }).then(response => {
        if (response && this.isConnected) {
          const useEcho = this.config.brain?.standaloneMode || false;
          this.sendChatMessage(response.text, useEcho);
          
          // Trigger persona-based emote
          if (response.emoteConfig) {
            const emote = response.emoteConfig.highEnergyEmote || response.emoteConfig.defaultEmote;
            if (emote) {
              this.triggerEmote(emote);
            }
          }
          
          this.api.emit('animazingpal:brain-response', {
            type: 'follow',
            username,
            response: response.text,
            emotion: response.emotion,
            emote: response.emoteConfig
          });
        }
      }).catch(err => {
        this.api.log(`Brain follow response error: ${err.message}`, 'error');
      });
    }

    this.api.emit('animazingpal:follow-handled', { username });
  }

  handleShareEvent(data) {
    if (!this.config.enabled || !this.isConnected) return;
    if (!this.canTriggerEvent('share')) return;

    const username = data.uniqueId || 'Someone';
    this.api.log(`Share event from ${username}`, 'info');

    // Execute configured action
    if (this.config.eventActions?.share?.enabled) {
      this.executeAction(this.config.eventActions.share, { username });
    }

    // Process through Brain Engine for intelligent response
    if (this.brainEngine && this.config.brain?.enabled && this.config.brain?.autoRespond?.shares) {
      this.brainEngine.processShare(username, {
        nickname: data.nickname
      }).then(response => {
        if (response && this.isConnected) {
          this.sendChatMessage(response.text, false);
          this.api.emit('animazingpal:brain-response', {
            type: 'share',
            username,
            response: response.text,
            emotion: response.emotion
          });
        }
      }).catch(err => {
        this.api.log(`Brain share response error: ${err.message}`, 'error');
      });
    }

    this.api.emit('animazingpal:share-handled', { username });
  }

  handleLikeEvent(data) {
    if (!this.config.enabled || !this.isConnected) return;
    if (!this.config.eventActions?.like?.enabled) return;

    const action = this.config.eventActions.like;
    const likeCount = data.likeCount || 1;
    const threshold = action.threshold || 10;

    // Only trigger after threshold likes
    if (likeCount < threshold) return;
    if (!this.canTriggerEvent('like')) return;

    const username = data.uniqueId || 'Someone';

    this.executeAction(action, { username, likeCount });

    this.api.emit('animazingpal:like-handled', { username, likeCount });
  }

  handleSubscribeEvent(data) {
    if (!this.config.enabled || !this.isConnected) return;
    if (!this.config.eventActions?.subscribe?.enabled) return;
    if (!this.canTriggerEvent('subscribe')) return;

    const username = data.uniqueId || 'Someone';
    this.api.log(`Subscribe event from ${username}`, 'info');

    this.executeAction(this.config.eventActions.subscribe, { username });

    this.api.emit('animazingpal:subscribe-handled', { username });
  }

  // ==================== Utility Methods ====================

  getSafeConfig() {
    // Return config without sensitive data (no API key)
    const brainConfig = this.config.brain ? {
      enabled: this.config.brain.enabled,
      model: this.config.brain.model,
      activePersonality: this.config.brain.activePersonality,
      memoryImportanceThreshold: this.config.brain.memoryImportanceThreshold,
      maxContextMemories: this.config.brain.maxContextMemories,
      archiveAfterDays: this.config.brain.archiveAfterDays,
      pruneAfterDays: this.config.brain.pruneAfterDays,
      autoRespond: this.config.brain.autoRespond,
      maxResponsesPerMinute: this.config.brain.maxResponsesPerMinute,
      chatResponseProbability: this.config.brain.chatResponseProbability,
      apiKeyConfigured: !!this.config.brain.openaiApiKey
    } : null;

    return {
      enabled: this.config.enabled,
      autoConnect: this.config.autoConnect,
      host: this.config.host,
      port: this.config.port,
      reconnectOnDisconnect: this.config.reconnectOnDisconnect,
      reconnectDelay: this.config.reconnectDelay,
      autoRefreshData: this.config.autoRefreshData,
      giftMappings: this.config.giftMappings,
      chatToAvatar: this.config.chatToAvatar,
      eventActions: this.config.eventActions,
      overrides: this.config.overrides,
      brain: brainConfig,
      verboseLogging: this.config.verboseLogging
    };
  }

  /**
   * Safely emit status with error handling to prevent cascading failures
   */
  safeEmitStatus() {
    try {
      this.emitStatus();
    } catch (error) {
      this.api.log(`Failed to emit status: ${error.message}`, 'warn');
    }
  }

  emitStatus() {
    const brainStats = this.brainEngine ? this.brainEngine.getStatistics() : null;
    
    this.api.emit('animazingpal:status', {
      isConnected: this.isConnected,
      config: this.getSafeConfig(),
      reconnectAttempts: this.reconnectAttempts,
      animazeData: this.animazeData,
      overrideBehaviors: this.overrideBehaviors,
      brainStatistics: brainStats
    });
  }

  async destroy() {
    this.api.log('Destroying AnimazingPal Plugin...', 'info');
    
    // Shutdown brain engine
    if (this.brainEngine) {
      try {
        await this.brainEngine.shutdown();
      } catch (error) {
        this.api.log(`Error shutting down Brain Engine: ${error.message}`, 'warn');
      }
    }
    
    try {
      this.disconnect();
    } catch (error) {
      this.api.log(`Error during disconnect: ${error.message}`, 'warn');
    }
    
    this.lastEventTimes.clear();
    this.pendingRequests.clear();
    
    this.api.log('AnimazingPal Plugin destroyed', 'info');
  }
}

module.exports = AnimazingPalPlugin;
