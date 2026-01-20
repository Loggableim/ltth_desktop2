/**
 * Brain Engine for AnimazingPal
 * 
 * The central intelligence system that connects:
 * - Memory Database (Nervous System) - stores all experiences
 * - Vector Memory (Synapses) - links related memories semantically
 * - GPT Brain (Cerebral Cortex) - processes and generates responses
 * - Animaze (Body/Voice) - expresses through avatar
 * 
 * This creates an AI streamer that:
 * - Remembers viewers and their interactions
 * - Maintains personality consistency
 * - Generates contextual, intelligent responses
 * - Archives and recalls long-term memories
 */

const MemoryDatabase = require('./memory-database');
const VectorMemory = require('./vector-memory');
const GPTBrainService = require('./gpt-brain-service');
const SpeechState = require('./speech-state');
const MicState = require('./mic-state');
const OutboxBatcher = require('./outbox-batcher');
const RelevanceEngine = require('./relevance-engine');
const ResponseEngine = require('./response-engine');
const EventDeduper = require('./event-deduper');

class BrainEngine {
  constructor(api, options = {}) {
    this.api = api;
    this.logger = {
      info: (msg) => api.log(msg, 'info'),
      debug: (msg) => api.log(msg, 'debug'),
      warn: (msg) => api.log(msg, 'warn'),
      error: (msg) => api.log(msg, 'error')
    };
    
    // Get database from plugin API
    const db = api.getDatabase();
    
    // Initialize components
    this.memoryDb = new MemoryDatabase(db, this.logger);
    this.vectorMemory = new VectorMemory(this.logger);
    this.gptBrain = null; // Initialized when API key is set
    
    // Initialize new components from pal_ALONE.py
    this.speechState = new SpeechState();
    this.micState = new MicState();
    this.eventDeduper = new EventDeduper({ ttl: 600, maxSize: 5000 });
    this.relevanceEngine = null; // Initialized with config
    this.responseEngine = null; // Initialized when API key is set
    this.outboxBatcher = null; // Initialized with config
    
    // Current streamer ID (for per-streamer memory)
    this.streamerId = null;
    
    // Configuration
    this.config = {
      enabled: false,
      openaiApiKey: null,
      model: 'gpt-4o-mini',
      activePersonality: null,
      
      // Memory settings
      memoryImportanceThreshold: 0.3,
      maxContextMemories: 10,
      archiveAfterDays: 7,
      pruneAfterDays: 30,
      decayDays: 90, // New: memory decay threshold
      
      // Response settings - more human-like defaults
      autoRespond: {
        chat: false,
        gifts: true,
        follows: true,
        shares: true,
        likes: false,      // Only react to significant like counts
        subscribe: true
      },
      
      // Human-like decision making
      speakThreshold: 0.5,       // Importance threshold to decide if to speak
      emotionalMemory: true,    // Remember emotional context
      contextAwareness: true,   // Consider stream context
      
      // Rate limiting
      maxResponsesPerMinute: 10,
      chatResponseProbability: 0.3, // Only respond to 30% of chats when enabled
      
      // Relevance settings (from pal_ALONE.py)
      relevance: {
        minLength: 3,
        replyThreshold: 0.6,
        respondToGreetings: true,
        respondToThanks: true,
        greetingCooldown: 360 // seconds
      },
      
      // Batch processing settings (from pal_ALONE.py)
      outbox: {
        windowSeconds: 8,
        maxItems: 8,
        maxChars: 320,
        separator: ' • '
      },
      
      ...options
    };
    
    // Runtime state
    this.currentSession = null;
    this.responseCount = 0;
    this.responseCountResetTime = Date.now();
    
    // Personality cache
    this.currentPersonality = null;
    
    // Event processing queue for human-like timing
    this.eventQueue = [];
    this.processingEvent = false;
    
    // Stream context - what's happening right now
    this.streamContext = {
      isLive: false,
      viewerCount: 0,
      recentEvents: [],
      mood: 'neutral',
      lastSpoke: 0,
      speakCooldown: 3000  // Minimum 3s between spoken responses
    };
    
    // User-specific cooldowns for greetings/thanks
    this.userCooldowns = new Map();
  }

  /**
   * Set the streamer ID for per-streamer memory
   */
  setStreamerId(streamerId) {
    this.streamerId = streamerId;
    this.memoryDb.setStreamerId(streamerId);
    
    // Reload memories for this streamer
    this.vectorMemory.clear();
    const memories = this.memoryDb.getRecentMemories(500);
    this.vectorMemory.loadFromMemories(memories);
    
    this.logger.info(`Brain Engine: Switched to streamer "${streamerId}"`);
  }

  /**
   * Get the current streamer ID
   */
  getStreamerId() {
    return this.streamerId || this.memoryDb.getStreamerId();
  }

  /**
   * Initialize the brain engine
   */
  async initialize() {
    try {
      // Initialize database tables
      this.memoryDb.initialize();
      
      // Load existing memories into vector store
      const memories = this.memoryDb.getRecentMemories(500);
      this.vectorMemory.loadFromMemories(memories);
      
      // Load active personality
      await this.loadActivePersonality();
      
      // Generate session ID
      this.currentSession = `session_${Date.now()}`;
      
      // Initialize RelevanceEngine with config
      this.relevanceEngine = new RelevanceEngine(this.config.relevance);
      
      // Initialize OutboxBatcher with config and callback
      this.outboxBatcher = new OutboxBatcher(this.config.outbox);
      this.outboxBatcher.onFlush((text) => {
        this.logger.info(`Batch flushed: ${text}`);
        // Emit to Socket.IO or Animaze
        this.api.emit('animazingpal:batch_message', { text });
      });
      
      // Connect speech/mic states to batcher holds
      this.speechState.on('started', () => {
        this.outboxBatcher.addHold('speech');
      });
      this.speechState.on('ended', () => {
        this.outboxBatcher.removeHold('speech');
      });
      this.micState.on('active', () => {
        this.outboxBatcher.addHold('mic');
      });
      this.micState.on('idle', () => {
        this.outboxBatcher.removeHold('mic');
      });
      
      // Start periodic memory maintenance
      this._startMemoryMaintenance();
      
      this.logger.info('Brain Engine initialized successfully');
      this.logger.info('  - Memory Database ready');
      this.logger.info('  - Relevance Engine ready');
      this.logger.info('  - Outbox Batcher ready');
      this.logger.info('  - Speech/Mic State tracking ready');
      return true;
    } catch (error) {
      this.logger.error(`Failed to initialize Brain Engine: ${error.message}`);
      return false;
    }
  }

  /**
   * Start periodic memory maintenance
   * @private
   */
  _startMemoryMaintenance() {
    // Run memory maintenance every hour
    this.memoryMaintenanceInterval = setInterval(() => {
      this._performMemoryMaintenance();
    }, 60 * 60 * 1000); // 1 hour
    
    // Run once at startup
    setTimeout(() => this._performMemoryMaintenance(), 5000);
  }

  /**
   * Perform memory maintenance tasks
   * @private
   */
  _performMemoryMaintenance() {
    try {
      const { decayDays, pruneAfterDays, archiveAfterDays } = this.config;
      
      // Apply decay
      const decayed = this.memoryDb.applyMemoryDecay(decayDays);
      if (decayed > 0) {
        this.logger.info(`Memory maintenance: Decayed ${decayed} memories`);
      }
      
      // Prune old low-importance memories
      const pruned = this.memoryDb.pruneOldMemories(pruneAfterDays, 0.1);
      if (pruned > 0) {
        this.logger.info(`Memory maintenance: Pruned ${pruned} old memories`);
      }
      
      // Clean up inactive users
      const cleaned = this.memoryDb.cleanupInactiveUsers(180);
      if (cleaned > 0) {
        this.logger.info(`Memory maintenance: Cleaned ${cleaned} inactive users`);
      }
      
    } catch (error) {
      this.logger.error(`Memory maintenance error: ${error.message}`);
    }
  }

  /**
   * Configure the brain engine
   */
  configure(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Update GPT service if API key changed
    if (newConfig.openaiApiKey) {
      this.gptBrain = new GPTBrainService(newConfig.openaiApiKey, this.logger, {
        model: this.config.model,
        timeout: 30000,
        maxRetries: 2
      });
      
      // Initialize ResponseEngine with new API key
      this.responseEngine = new ResponseEngine({
        apiKey: newConfig.openaiApiKey,
        model: this.config.model,
        systemPrompt: this.currentPersonality?.system_prompt || this.config.systemPrompt,
        maxTokens: 100,
        temperature: 0.7
      }, this.logger);
    }
    
    // Update RelevanceEngine if relevance config changed
    if (newConfig.relevance && this.relevanceEngine) {
      this.relevanceEngine.updateConfig(newConfig.relevance);
    }
    
    // Update OutboxBatcher if outbox config changed
    if (newConfig.outbox && this.outboxBatcher) {
      // Destroy old batcher and create new one
      this.outboxBatcher.destroy();
      this.outboxBatcher = new OutboxBatcher(this.config.outbox);
      this.outboxBatcher.onFlush((text) => {
        this.logger.info(`Batch flushed: ${text}`);
        this.api.emit('animazingpal:batch_message', { text });
      });
    }
    
    // Update active personality if changed
    if (newConfig.activePersonality) {
      this.setActivePersonality(newConfig.activePersonality);
    }
  }

  /**
   * Load the active personality
   */
  async loadActivePersonality() {
    const personality = this.memoryDb.getActivePersonality();
    if (personality) {
      this.currentPersonality = {
        ...personality,
        emotion_tendencies: JSON.parse(personality.emotion_tendencies || '{}'),
        catchphrases: JSON.parse(personality.catchphrases || '[]'),
        topics_of_interest: JSON.parse(personality.topics_of_interest || '[]'),
        tone_settings: JSON.parse(personality.tone_settings || '{"temperature":0.7,"presencePenalty":0.3,"frequencyPenalty":0.2}'),
        emote_config: JSON.parse(personality.emote_config || '{"defaultEmote":"smile","highEnergyEmote":"excited","lowEnergyEmote":"calm"}'),
        memory_behavior: JSON.parse(personality.memory_behavior || '{"importanceThreshold":0.4,"maxContextMemories":8}')
      };
      this.config.activePersonality = personality.name;
      this.logger.info(`Loaded personality: ${personality.display_name}`);
    }
    return this.currentPersonality;
  }

  /**
   * Set active personality by name
   */
  async setActivePersonality(name) {
    this.memoryDb.setActivePersonality(name);
    await this.loadActivePersonality();
  }

  /**
   * Get all available personalities
   */
  getPersonalities() {
    return this.memoryDb.getPersonalities().map(p => ({
      ...p,
      emotion_tendencies: JSON.parse(p.emotion_tendencies || '{}'),
      catchphrases: JSON.parse(p.catchphrases || '[]'),
      topics_of_interest: JSON.parse(p.topics_of_interest || '[]'),
      tone_settings: JSON.parse(p.tone_settings || '{"temperature":0.7,"presencePenalty":0.3,"frequencyPenalty":0.2}'),
      emote_config: JSON.parse(p.emote_config || '{"defaultEmote":"smile","highEnergyEmote":"excited","lowEnergyEmote":"calm"}'),
      memory_behavior: JSON.parse(p.memory_behavior || '{"importanceThreshold":0.4,"maxContextMemories":8}')
    }));
  }

  /**
   * Create a custom personality
   */
  createPersonality(data) {
    return this.memoryDb.createPersonality(data);
  }

  /**
   * Update a personality
   */
  updatePersonality(name, updates) {
    this.memoryDb.updatePersonality(name, updates);
    // Reload if this is the active personality
    if (this.currentPersonality && this.currentPersonality.name === name) {
      this.loadActivePersonality();
    }
  }

  /**
   * Delete a custom personality
   */
  deletePersonality(name) {
    return this.memoryDb.deletePersonality(name);
  }

  /**
   * Get a single personality by name
   */
  getPersonality(name) {
    const personalities = this.getPersonalities();
    return personalities.find(p => p.name === name);
  }

  /**
   * Check rate limiting
   */
  _checkRateLimit() {
    const now = Date.now();
    
    // Reset counter every minute
    if (now - this.responseCountResetTime > 60000) {
      this.responseCount = 0;
      this.responseCountResetTime = now;
    }
    
    if (this.responseCount >= this.config.maxResponsesPerMinute) {
      return false;
    }
    
    this.responseCount++;
    return true;
  }

  /**
   * Get relevant memories for context
   */
  _getContextMemories(query, username = null) {
    const memories = [];
    
    // Get semantically similar memories
    const similar = this.vectorMemory.findSimilar(query, 5, 0.2);
    for (const { memoryId } of similar) {
      const memory = this.memoryDb.getRecentMemories(100).find(m => m.id === memoryId);
      if (memory) {
        memories.push(memory.content);
      }
    }
    
    // Get user-specific memories if username provided
    if (username) {
      const userMemories = this.memoryDb.getUserMemories(username, 5);
      for (const memory of userMemories) {
        if (!memories.includes(memory.content)) {
          memories.push(memory.content);
        }
      }
    }
    
    // Get important memories
    const important = this.memoryDb.getImportantMemories(0.7, 3);
    for (const memory of important) {
      if (!memories.includes(memory.content)) {
        memories.push(memory.content);
      }
    }
    
    return memories.slice(0, this.config.maxContextMemories);
  }

  /**
   * Store a new memory
   */
  storeMemory(content, options = {}) {
    const memoryId = this.memoryDb.storeMemory({
      type: options.type || 'interaction',
      content,
      context: options.context,
      importance: options.importance || 0.5,
      tags: options.tags,
      user: options.user,
      event: options.event
    });
    
    // Also store in vector memory
    const embedding = this.vectorMemory.storeVector(memoryId, content);
    
    // Update embedding in database
    this.memoryDb.db.prepare(`
      UPDATE animazingpal_memories SET embedding = ? WHERE id = ?
    `).run(JSON.stringify(embedding), memoryId);
    
    return memoryId;
  }

  /**
   * Process a chat message and optionally generate response
   */
  async processChat(username, message, options = {}) {
    if (!this.config.enabled || !this.gptBrain || !this.currentPersonality) {
      return null;
    }
    
    // Get or create user profile
    const userProfile = this.memoryDb.getOrCreateUserProfile(username, options.nickname);
    
    // Store the chat as a memory
    this.storeMemory(`${username} sagte: "${message}"`, {
      type: 'chat',
      user: username,
      event: 'chat',
      importance: 0.4
    });
    
    // Store in conversation history
    this.memoryDb.storeConversation(this.currentSession, 'user', message, username);
    
    // Check if we should respond
    if (!this.config.autoRespond.chat && !options.forceRespond) {
      return null;
    }
    
    // Probabilistic response (don't respond to every chat)
    if (!options.forceRespond && Math.random() > this.config.chatResponseProbability) {
      return null;
    }
    
    // Check rate limit
    if (!this._checkRateLimit()) {
      this.logger.debug('Rate limit reached, skipping chat response');
      return null;
    }
    
    try {
      // Get context
      const contextMemories = this._getContextMemories(message, username);
      const conversationHistory = this.memoryDb.getConversationHistory(this.currentSession, 10);
      
      // Prepare GPT options with persona tone settings
      const gptOptions = {
        memories: contextMemories,
        userInfo: userProfile,
        conversationHistory: conversationHistory.map(c => ({
          role: c.role,
          content: c.content
        })),
        ...(this.currentPersonality.tone_settings || {})
      };
      
      // Generate response
      const result = await this.gptBrain.generateChatResponse(
        username,
        message,
        this.currentPersonality.system_prompt,
        gptOptions
      );
      
      // Store response in conversation history
      this.memoryDb.storeConversation(this.currentSession, 'assistant', result.content, null, this._selectEmotion());
      
      // Store response as memory
      this.storeMemory(`Ich antwortete ${username}: "${result.content}"`, {
        type: 'response',
        event: 'chat_response',
        importance: 0.3
      });
      
      return {
        text: result.content,
        emotion: this._selectEmotion(),
        cached: result.cached,
        emoteConfig: this.currentPersonality.emote_config
      };
    } catch (error) {
      this.logger.error(`Failed to generate chat response: ${error.message}`);
      return null;
    }
  }

  /**
   * Process a gift event and generate thank you
   */
  async processGift(username, giftName, giftValue, options = {}) {
    if (!this.config.enabled || !this.gptBrain || !this.currentPersonality) {
      return null;
    }
    
    // Get user profile and record gift
    const userProfile = this.memoryDb.getOrCreateUserProfile(username, options.nickname);
    this.memoryDb.recordGift(username, giftValue);
    
    // Store as important memory
    const importance = Math.min(0.5 + (giftValue / 500), 1.0); // Higher value = more important
    this.storeMemory(`${username} schenkte mir "${giftName}" (${giftValue} Diamonds)!`, {
      type: 'gift',
      user: username,
      event: 'gift',
      importance,
      tags: ['gift', giftName]
    });
    
    // Check if we should respond
    if (!this.config.autoRespond.gifts && !options.forceRespond) {
      return null;
    }
    
    // Check rate limit
    if (!this._checkRateLimit()) {
      return null;
    }
    
    try {
      // Generate response with persona tone settings
      const gptOptions = {
        ...(this.currentPersonality.tone_settings || {})
      };
      
      const result = await this.gptBrain.generateGiftResponse(
        username,
        giftName,
        giftValue,
        this.currentPersonality.system_prompt,
        userProfile,
        gptOptions
      );
      
      // Store response
      this.memoryDb.storeConversation(this.currentSession, 'assistant', result.content, null, 'grateful');
      
      return {
        text: result.content,
        emotion: 'happy',
        cached: result.cached,
        emoteConfig: this.currentPersonality.emote_config
      };
    } catch (error) {
      this.logger.error(`Failed to generate gift response: ${error.message}`);
      return null;
    }
  }

  /**
   * Process a follow event
   */
  async processFollow(username, options = {}) {
    if (!this.config.enabled || !this.gptBrain || !this.currentPersonality) {
      return null;
    }
    
    // Check if returning follower
    const userProfile = this.memoryDb.getOrCreateUserProfile(username, options.nickname);
    const isReturning = userProfile.interaction_count > 1;
    
    // Store as memory
    this.storeMemory(`${username} folgt mir jetzt${isReturning ? ' wieder' : ''}!`, {
      type: 'follow',
      user: username,
      event: 'follow',
      importance: isReturning ? 0.6 : 0.4
    });
    
    // Check if we should respond
    if (!this.config.autoRespond.follows && !options.forceRespond) {
      return null;
    }
    
    // Check rate limit
    if (!this._checkRateLimit()) {
      return null;
    }
    
    try {
      const gptOptions = {
        ...(this.currentPersonality.tone_settings || {})
      };
      
      const result = await this.gptBrain.generateFollowResponse(
        username,
        this.currentPersonality.system_prompt,
        isReturning,
        gptOptions
      );
      
      return {
        text: result.content,
        emotion: 'happy',
        cached: result.cached,
        emoteConfig: this.currentPersonality.emote_config
      };
    } catch (error) {
      this.logger.error(`Failed to generate follow response: ${error.message}`);
      return null;
    }
  }

  /**
   * Process a share event
   */
  async processShare(username, options = {}) {
    if (!this.config.enabled || !this.gptBrain || !this.currentPersonality) {
      return null;
    }
    
    // Store as memory
    this.storeMemory(`${username} hat den Stream geteilt!`, {
      type: 'share',
      user: username,
      event: 'share',
      importance: 0.5
    });
    
    if (!this.config.autoRespond.shares && !options.forceRespond) {
      return null;
    }
    
    if (!this._checkRateLimit()) {
      return null;
    }
    
    try {
      const result = await this.gptBrain.generateQuickReaction(
        `${username} hat deinen Stream geteilt!`,
        this.currentPersonality.system_prompt,
        'grateful'
      );
      
      return {
        text: result.content,
        emotion: 'happy',
        cached: result.cached
      };
    } catch (error) {
      this.logger.error(`Failed to generate share response: ${error.message}`);
      return null;
    }
  }

  /**
   * Select emotion based on personality tendencies
   */
  _selectEmotion() {
    if (!this.currentPersonality || !this.currentPersonality.emotion_tendencies) {
      return 'neutral';
    }
    
    const tendencies = this.currentPersonality.emotion_tendencies;
    const emotions = Object.keys(tendencies);
    if (emotions.length === 0) return 'neutral';
    
    // Weighted random selection
    const totalWeight = Object.values(tendencies).reduce((sum, w) => sum + w, 0);
    let random = Math.random() * totalWeight;
    
    for (const [emotion, weight] of Object.entries(tendencies)) {
      random -= weight;
      if (random <= 0) return emotion;
    }
    
    return emotions[0];
  }

  /**
   * Archive old memories
   */
  async archiveOldMemories() {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.archiveAfterDays);
    
    // Get old memories
    const oldMemories = this.memoryDb.db.prepare(`
      SELECT * FROM animazingpal_memories 
      WHERE created_at < ? AND importance >= ?
      ORDER BY created_at ASC
      LIMIT 100
    `).all(cutoffDate.toISOString(), this.config.memoryImportanceThreshold);
    
    if (oldMemories.length === 0) return;
    
    try {
      // Generate summary using GPT
      const summary = await this.gptBrain.summarizeMemories(
        oldMemories,
        this.currentPersonality?.system_prompt || ''
      );
      
      // Extract key information
      const keyUsers = [...new Set(oldMemories.filter(m => m.source_user).map(m => m.source_user))];
      const keywords = this.vectorMemory.extractKeywords(
        oldMemories.map(m => m.content).join(' '),
        10
      );
      
      // Create archive
      this.memoryDb.createArchive(
        summary.content,
        oldMemories.map(m => m.id),
        keywords,
        keyUsers,
        {
          start: oldMemories[0].created_at,
          end: oldMemories[oldMemories.length - 1].created_at
        }
      );
      
      this.logger.info(`Archived ${oldMemories.length} memories`);
    } catch (error) {
      this.logger.error(`Failed to archive memories: ${error.message}`);
    }
  }

  /**
   * Get brain statistics
   */
  getStatistics() {
    const memoryStats = this.memoryDb.getStatistics();
    const vectorStats = this.vectorMemory.getStatistics();
    const gptStats = this.gptBrain?.getStatistics() || {};
    
    return {
      ...memoryStats,
      ...vectorStats,
      ...gptStats,
      currentSession: this.currentSession,
      currentPersonality: this.currentPersonality?.display_name,
      enabled: this.config.enabled,
      apiKeyConfigured: !!this.config.openaiApiKey
    };
  }

  /**
   * Test GPT connection
   */
  async testConnection() {
    if (!this.gptBrain) {
      return { success: false, message: 'GPT Brain not initialized. Set API key first.' };
    }
    
    return this.gptBrain.testConnection();
  }

  /**
   * Get user profile with memories
   */
  getUserProfile(username) {
    const profile = this.memoryDb.getOrCreateUserProfile(username);
    const memories = this.memoryDb.getUserMemories(username, 20);
    
    return {
      ...profile,
      memories: memories.map(m => ({
        content: m.content,
        type: m.memory_type,
        created_at: m.created_at
      }))
    };
  }

  /**
   * Search memories
   */
  searchMemories(query) {
    // Try both text and vector search
    const textResults = this.memoryDb.searchMemories(query, 10);
    const vectorResults = this.vectorMemory.findSimilar(query, 10, 0.15);
    
    // Combine and deduplicate
    const resultMap = new Map();
    
    for (const memory of textResults) {
      resultMap.set(memory.id, { ...memory, searchType: 'text' });
    }
    
    for (const { memoryId, similarity } of vectorResults) {
      if (!resultMap.has(memoryId)) {
        const memory = this.memoryDb.getRecentMemories(500).find(m => m.id === memoryId);
        if (memory) {
          resultMap.set(memoryId, { ...memory, similarity, searchType: 'vector' });
        }
      } else {
        resultMap.get(memoryId).similarity = similarity;
      }
    }
    
    return Array.from(resultMap.values()).sort((a, b) => {
      // Sort by similarity if available, otherwise by recency
      if (a.similarity && b.similarity) return b.similarity - a.similarity;
      return new Date(b.created_at) - new Date(a.created_at);
    });
  }

  // ==================== Enhanced Event Processing with pal_ALONE.py Features ====================

  /**
   * Process chat message with relevance detection
   * Enhanced version using RelevanceEngine and ResponseEngine
   */
  async processChatMessageEnhanced(username, text, options = {}) {
    if (!this.config.enabled || !this.relevanceEngine) {
      return null;
    }

    // Deduplicate
    const signature = this.eventDeduper.generateSignature('comment', {
      userId: username,
      text,
      timestamp: Date.now()
    });
    if (this.eventDeduper.hasSeen(signature)) {
      return null;
    }

    // Get or create user profile
    const userProfile = this.memoryDb.getOrCreateUserProfile(username, options.nickname);
    
    // Store chat message
    this.memoryDb.storeConversation(this.currentSession, 'user', text, username);
    
    // Evaluate relevance
    const evaluation = this.relevanceEngine.evaluate(text, this.config.relevance.replyThreshold);
    
    if (!evaluation.shouldRespond) {
      this.logger.debug(`Chat from ${username} ignored: ${evaluation.reason}`);
      return null;
    }

    // Handle special cases
    if (evaluation.reason === 'greeting') {
      return this._handleGreeting(username, text, userProfile);
    }
    
    if (evaluation.reason === 'thanks') {
      return this._handleThanks(username, text);
    }

    // Check rate limit
    if (!this._checkRateLimit()) {
      this.logger.debug('Rate limit reached for chat response');
      return null;
    }

    // Generate response using ResponseEngine
    if (this.responseEngine && this.responseEngine.isReady()) {
      const userHistory = this.memoryDb.getUserMemories(username, 5)
        .map(m => m.content);
      
      const background = userProfile.personality_notes || '';
      
      const response = await this.responseEngine.replyToComment(
        username,
        text,
        {
          userHistory,
          background
        }
      );

      if (response) {
        // Store memory
        this.storeMemory(`${username}: "${text}" → Ich antwortete: "${response}"`, {
          type: 'conversation',
          user: username,
          importance: evaluation.score,
          tags: ['chat', 'response']
        });

        // Add to batch
        if (this.outboxBatcher) {
          this.outboxBatcher.add(`@${username}: ${response}`);
        }

        return {
          text: response,
          type: 'response',
          relevance: evaluation.score
        };
      }
    }

    return null;
  }

  /**
   * Handle greeting with cooldown
   * @private
   */
  _handleGreeting(username, text, userProfile) {
    const cooldownKey = `greeting:${username}`;
    const lastGreet = this.userCooldowns.get(cooldownKey) || 0;
    const now = Date.now();
    
    if (now - lastGreet < this.config.relevance.greetingCooldown * 1000) {
      return null; // Still on cooldown
    }

    this.userCooldowns.set(cooldownKey, now);

    // Generate quick acknowledgment
    const response = this.responseEngine
      ? this.responseEngine.quickAcknowledgment(username, 'greeting')
      : `Hallo ${username}!`;

    // Add to batch
    if (this.outboxBatcher) {
      this.outboxBatcher.add(response);
    }

    // Store memory
    this.storeMemory(`${username} grüßte mich`, {
      type: 'interaction',
      user: username,
      importance: 0.2
    });

    return { text: response, type: 'greeting' };
  }

  /**
   * Handle thanks message
   * @private
   */
  _handleThanks(username, text) {
    const response = this.responseEngine
      ? this.responseEngine.quickAcknowledgment(username, 'thanks')
      : `Gerne, ${username}!`;

    // Add to batch
    if (this.outboxBatcher) {
      this.outboxBatcher.add(response);
    }

    return { text: response, type: 'thanks' };
  }

  /**
   * Batch process gift events
   */
  async processGiftBatched(username, giftName, count, options = {}) {
    // Deduplicate
    const signature = this.eventDeduper.generateSignature('gift', {
      userId: username,
      giftName,
      count,
      timestamp: Date.now()
    });
    if (this.eventDeduper.hasSeen(signature)) {
      return null;
    }

    // Update user profile
    const userProfile = this.memoryDb.getOrCreateUserProfile(username, options.nickname);
    this.memoryDb.recordGift(username, count);

    // Store memory
    const importance = Math.min(0.4 + (count / 100), 0.9);
    this.storeMemory(`${username} sent ${giftName} x${count}`, {
      type: 'gift',
      user: username,
      importance,
      tags: ['gift', giftName]
    });

    // Add to batch for acknowledgment
    if (this.outboxBatcher && this.config.autoRespond.gifts) {
      this.outboxBatcher.add(`${username} sent ${giftName} x${count}`);
    }

    return { username, giftName, count };
  }

  /**
   * Batch process follow events
   */
  async processFollowBatched(username, options = {}) {
    // Deduplicate
    const signature = this.eventDeduper.generateSignature('follow', {
      userId: username,
      timestamp: Date.now()
    });
    if (this.eventDeduper.hasSeen(signature)) {
      return null;
    }

    // Update user profile
    this.memoryDb.getOrCreateUserProfile(username, options.nickname);

    // Store memory
    this.storeMemory(`${username} followed`, {
      type: 'follow',
      user: username,
      importance: 0.5,
      tags: ['follow']
    });

    // Add to batch
    if (this.outboxBatcher && this.config.autoRespond.follows) {
      this.outboxBatcher.add(`${username} followed`);
    }

    return { username };
  }

  /**
   * Update speech state from Animaze events
   */
  handleSpeechStarted() {
    this.speechState.markStarted();
    this.streamContext.lastSpoke = Date.now();
  }

  /**
   * Update speech state from Animaze events
   */
  handleSpeechEnded() {
    this.speechState.markEnded();
  }

  /**
   * Update mic state (can be connected to external mic monitoring)
   */
  handleMicActive() {
    this.micState.markActive();
  }

  /**
   * Update mic state
   */
  handleMicIdle() {
    this.micState.markIdle();
  }

  /**
   * Get current speech/mic state
   */
  getActivityState() {
    return {
      isSpeaking: this.speechState.isSpeaking(),
      isMicActive: this.micState.isActive(),
      speechDuration: this.speechState.getSpeechDuration(),
      timeSinceMicChange: this.micState.getTimeSinceLastChange(),
      batcherSize: this.outboxBatcher ? this.outboxBatcher.size() : 0,
      batcherHasHolds: this.outboxBatcher ? this.outboxBatcher.hasHolds() : false
    };
  }

  /**
   * Clean up and shutdown
   */
  async shutdown() {
    // Stop memory maintenance
    if (this.memoryMaintenanceInterval) {
      clearInterval(this.memoryMaintenanceInterval);
    }

    // Destroy components
    if (this.outboxBatcher) {
      this.outboxBatcher.destroy();
    }
    if (this.eventDeduper) {
      this.eventDeduper.destroy();
    }
    if (this.speechState) {
      this.speechState.reset();
      this.speechState.removeAllListeners();
    }
    if (this.micState) {
      this.micState.reset();
      this.micState.removeAllListeners();
    }

    // Clear caches
    this.gptBrain?.clearCache();
    this.vectorMemory.clear();
    
    // Clear old conversations
    this.memoryDb.clearOldConversations(7);
    
    // Prune low-importance memories
    const pruned = this.memoryDb.pruneOldMemories(
      this.config.pruneAfterDays,
      this.config.memoryImportanceThreshold
    );
    
    this.logger.info(`Brain Engine shutdown. Pruned ${pruned} old memories.`);
  }

  // ==================== Human-like Decision Making ====================

  /**
   * Decide if the brain should speak based on event importance
   * This makes the AI behave more like a human - not responding to everything
   */
  shouldSpeak(eventType, eventData, importance) {
    // Check cooldown
    const now = Date.now();
    if (now - this.streamContext.lastSpoke < this.streamContext.speakCooldown) {
      this.logger.debug('Brain: Skipping response due to cooldown');
      return false;
    }
    
    // Check importance threshold
    if (importance < this.config.speakThreshold) {
      this.logger.debug(`Brain: Event importance ${importance} below threshold ${this.config.speakThreshold}`);
      return false;
    }
    
    // Check rate limit
    if (!this._checkRateLimit()) {
      return false;
    }
    
    // Human-like random variation (don't always respond even if allowed)
    const responseChance = Math.min(0.9, importance + 0.2);
    if (Math.random() > responseChance) {
      this.logger.debug('Brain: Randomly skipping to be more human-like');
      return false;
    }
    
    return true;
  }

  /**
   * Calculate event importance for decision making
   */
  calculateEventImportance(eventType, eventData) {
    let importance = 0.3; // Base importance
    
    switch (eventType) {
      case 'gift':
        // Gift importance based on value
        const giftValue = eventData.diamondCount || 1;
        importance = Math.min(0.3 + (giftValue / 200), 1.0);
        break;
        
      case 'subscribe':
        importance = 0.9; // Subscriptions are always important
        break;
        
      case 'follow':
        // Check if returning viewer
        const profile = this.memoryDb.getOrCreateUserProfile(eventData.uniqueId || 'unknown');
        importance = profile.interaction_count > 3 ? 0.7 : 0.5;
        break;
        
      case 'share':
        importance = 0.6; // Shares are moderately important
        break;
        
      case 'chat':
        // Chat importance based on content
        const message = eventData.comment || '';
        // Direct mentions or questions are more important
        if (message.includes('?') || message.includes('@')) {
          importance = 0.7;
        }
        // Longer messages might be more thoughtful
        else if (message.length > 50) {
          importance = 0.5;
        }
        // Check if from known supporter
        const chatProfile = this.memoryDb.getOrCreateUserProfile(eventData.uniqueId || 'unknown');
        if (chatProfile.total_diamonds > 100) {
          importance += 0.2;
        }
        break;
        
      case 'like':
        // Only significant like bursts
        const likeCount = eventData.likeCount || 1;
        importance = likeCount >= 100 ? 0.4 : 0.1;
        break;
        
      default:
        importance = 0.3;
    }
    
    return Math.min(importance, 1.0);
  }

  /**
   * Process any stream event through the brain
   * The brain decides if and how to respond
   */
  async processEvent(eventType, eventData, options = {}) {
    if (!this.config.enabled) {
      return null;
    }
    
    // Calculate importance
    const importance = this.calculateEventImportance(eventType, eventData);
    
    // Store memory regardless of response
    const username = eventData.uniqueId || eventData.username || 'anonymous';
    this.storeEventMemory(eventType, eventData, importance);
    
    // Update stream context
    this.updateStreamContext(eventType, eventData);
    
    // Decide if we should respond
    if (!options.forceRespond && !this.shouldSpeak(eventType, eventData, importance)) {
      return null;
    }
    
    // Generate appropriate response
    let response = null;
    try {
      switch (eventType) {
        case 'chat':
          response = await this.processChat(username, eventData.comment, options);
          break;
        case 'gift':
          response = await this.processGift(username, eventData.giftName, eventData.diamondCount || 1, options);
          break;
        case 'follow':
          response = await this.processFollow(username, options);
          break;
        case 'share':
          response = await this.processShare(username, options);
          break;
        case 'subscribe':
          response = await this.processSubscribe(username, options);
          break;
        case 'like':
          response = await this.processLike(username, eventData.likeCount || 1, options);
          break;
      }
      
      if (response) {
        this.streamContext.lastSpoke = Date.now();
      }
    } catch (error) {
      this.logger.error(`Brain: Error processing ${eventType}: ${error.message}`);
    }
    
    return response;
  }

  /**
   * Store an event as a memory
   */
  storeEventMemory(eventType, eventData, importance) {
    const username = eventData.uniqueId || 'anonymous';
    let content = '';
    
    switch (eventType) {
      case 'chat':
        content = `${username} sagte: "${eventData.comment}"`;
        break;
      case 'gift':
        content = `${username} schenkte "${eventData.giftName}" (${eventData.diamondCount || 1} Diamonds)`;
        break;
      case 'follow':
        content = `${username} folgt mir jetzt`;
        break;
      case 'share':
        content = `${username} hat den Stream geteilt`;
        break;
      case 'subscribe':
        content = `${username} hat abonniert!`;
        break;
      case 'like':
        content = `${username} hat ${eventData.likeCount || 1} Likes gegeben`;
        break;
      default:
        content = `Event: ${eventType} von ${username}`;
    }
    
    this.storeMemory(content, {
      type: eventType,
      user: username,
      event: eventType,
      importance
    });
  }

  /**
   * Update stream context
   */
  updateStreamContext(eventType, eventData) {
    // Add to recent events
    this.streamContext.recentEvents.push({
      type: eventType,
      data: eventData,
      time: Date.now()
    });
    
    // Keep only last 50 events
    if (this.streamContext.recentEvents.length > 50) {
      this.streamContext.recentEvents = this.streamContext.recentEvents.slice(-50);
    }
    
    // Update mood based on events
    if (eventType === 'gift' || eventType === 'subscribe') {
      this.streamContext.mood = 'excited';
    } else if (this.streamContext.recentEvents.filter(e => e.type === 'follow').length > 5) {
      this.streamContext.mood = 'happy';
    }
  }

  /**
   * Process a subscribe event
   */
  async processSubscribe(username, options = {}) {
    if (!this.config.enabled || !this.gptBrain || !this.currentPersonality) {
      return null;
    }
    
    const userProfile = this.memoryDb.getOrCreateUserProfile(username, options.nickname);
    
    this.storeMemory(`${username} hat abonniert! Wichtiger Moment!`, {
      type: 'subscribe',
      user: username,
      event: 'subscribe',
      importance: 0.9
    });
    
    if (!this.config.autoRespond.subscribe && !options.forceRespond) {
      return null;
    }
    
    try {
      const result = await this.gptBrain.generateQuickReaction(
        `${username} hat gerade abonniert! Das ist ein besonderer Moment.`,
        this.currentPersonality.system_prompt,
        'excited'
      );
      
      return {
        text: result.content,
        emotion: 'excited',
        cached: result.cached
      };
    } catch (error) {
      this.logger.error(`Failed to generate subscribe response: ${error.message}`);
      return null;
    }
  }

  /**
   * Process a like event (only for significant amounts)
   */
  async processLike(username, likeCount, options = {}) {
    if (!this.config.enabled || !this.gptBrain || !this.currentPersonality) {
      return null;
    }
    
    // Only respond to significant like bursts
    if (likeCount < 50 && !options.forceRespond) {
      return null;
    }
    
    if (!this.config.autoRespond.likes && !options.forceRespond) {
      return null;
    }
    
    try {
      const result = await this.gptBrain.generateQuickReaction(
        `Wow, ${likeCount} Likes von ${username}!`,
        this.currentPersonality.system_prompt,
        'happy'
      );
      
      return {
        text: result.content,
        emotion: 'happy',
        cached: result.cached
      };
    } catch (error) {
      this.logger.error(`Failed to generate like response: ${error.message}`);
      return null;
    }
  }

  /**
   * Get available streamer profiles
   */
  getStreamerProfiles() {
    return this.memoryDb.getStreamerProfiles();
  }
}

module.exports = BrainEngine;
