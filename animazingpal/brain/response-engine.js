/**
 * ResponseEngine - GPT-powered context-aware response generation
 * 
 * Handles:
 * - Relevance scoring
 * - GPT integration for intelligent responses
 * - Response caching for efficiency
 * - Context-aware reply generation
 * - Rate limiting
 * 
 * Inspired by pal_ALONE.py's ResponseEngine class.
 */

const OpenAI = require('openai');

class ResponseEngine {
  constructor(config = {}, logger = console) {
    this.config = {
      apiKey: config.apiKey || null,
      model: config.model || 'gpt-4o-mini',
      systemPrompt: config.systemPrompt || 'You are a friendly VTuber assistant. Provide concise, engaging responses (max 25 words).',
      maxTokens: config.maxTokens || 100,
      temperature: config.temperature || 0.7,
      timeout: config.timeout || 10000,
      maxResponseWords: config.maxResponseWords || 18, // Configurable word limit
      ...config
    };

    this.logger = logger;
    this.openai = null;
    this.responseCache = new Map();
    this.cacheMaxSize = 100;
    this.cacheMaxAge = 300000; // 5 minutes

    // Initialize OpenAI client if API key is provided
    if (this.config.apiKey) {
      this.initializeOpenAI();
    }
  }

  /**
   * Initialize OpenAI client
   */
  initializeOpenAI() {
    try {
      this.openai = new OpenAI({
        apiKey: this.config.apiKey,
        timeout: this.config.timeout
      });
      this.logger.info('ResponseEngine: OpenAI client initialized');
    } catch (error) {
      this.logger.error(`ResponseEngine: Failed to initialize OpenAI - ${error.message}`);
      this.openai = null;
    }
  }

  /**
   * Update API key
   * @param {string} apiKey
   */
  setApiKey(apiKey) {
    this.config.apiKey = apiKey;
    this.initializeOpenAI();
  }

  /**
   * Update configuration
   * @param {object} newConfig
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    
    // Reinitialize if API key changed
    if (newConfig.apiKey) {
      this.initializeOpenAI();
    }
  }

  /**
   * Generate cache key for a request
   * @param {string} username
   * @param {string} text
   * @returns {string}
   */
  _getCacheKey(username, text) {
    return `${username}:${text.toLowerCase().trim()}`;
  }

  /**
   * Get cached response if available
   * @param {string} username
   * @param {string} text
   * @returns {string|null}
   */
  _getCachedResponse(username, text) {
    const key = this._getCacheKey(username, text);
    const cached = this.responseCache.get(key);

    if (cached) {
      const age = Date.now() - cached.timestamp;
      if (age < this.cacheMaxAge) {
        this.logger.debug(`ResponseEngine: Cache hit for ${username}`);
        return cached.response;
      } else {
        // Expired
        this.responseCache.delete(key);
      }
    }

    return null;
  }

  /**
   * Cache a response
   * @param {string} username
   * @param {string} text
   * @param {string} response
   */
  _cacheResponse(username, text, response) {
    const key = this._getCacheKey(username, text);
    
    // Limit cache size
    if (this.responseCache.size >= this.cacheMaxSize) {
      // Remove oldest entry
      const firstKey = this.responseCache.keys().next().value;
      this.responseCache.delete(firstKey);
    }

    this.responseCache.set(key, {
      response,
      timestamp: Date.now()
    });
  }

  /**
   * Generate a response to a comment
   * @param {string} username - User who sent the message
   * @param {string} text - Message text
   * @param {object} context - Additional context (userHistory, background, etc.)
   * @returns {Promise<string|null>}
   */
  async replyToComment(username, text, context = {}) {
    if (!this.openai) {
      this.logger.warn('ResponseEngine: OpenAI not initialized');
      return null;
    }

    // Check cache first
    const cached = this._getCachedResponse(username, text);
    if (cached) {
      return cached;
    }

    try {
      // Build context prompt
      const contextParts = [];
      
      contextParts.push(`User: ${username}`);
      
      if (context.background) {
        contextParts.push(`Background: ${context.background}`);
      }
      
      if (context.userHistory && context.userHistory.length > 0) {
        const recentMessages = context.userHistory.slice(-5).join('\n');
        contextParts.push(`Recent messages:\n${recentMessages}`);
      }
      
      contextParts.push(`Current message: ${text}`);
      
      const prompt = contextParts.join('\n\n');

      // Call GPT
      const completion = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          { role: 'system', content: this.config.systemPrompt },
          { role: 'user', content: prompt }
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature
      });

      let response = completion.choices[0]?.message?.content?.trim();
      
      if (!response) {
        return null;
      }

      // Limit response length (configurable max words)
      const words = response.split(/\s+/);
      if (words.length > this.config.maxResponseWords) {
        response = words.slice(0, this.config.maxResponseWords).join(' ') + '.';
      }

      // Cache the response
      this._cacheResponse(username, text, response);

      return response;

    } catch (error) {
      this.logger.error(`ResponseEngine: GPT error - ${error.message}`);
      return null;
    }
  }

  /**
   * Generate a quick acknowledgment (for greetings, thanks, etc.)
   * @param {string} username
   * @param {string} type - 'greeting' | 'thanks' | 'gift' | 'follow'
   * @returns {string}
   */
  quickAcknowledgment(username, type) {
    const templates = {
      greeting: [
        `Hey ${username}!`,
        `Hallo ${username}!`,
        `Hi ${username}, willkommen!`
      ],
      thanks: [
        `Gerne, ${username}!`,
        `Kein Problem!`,
        `Immer gerne!`
      ],
      gift: [
        `Danke ${username}!`,
        `Wow, danke ${username}!`,
        `Das ist lieb von dir, ${username}!`
      ],
      follow: [
        `Welcome ${username}!`,
        `Willkommen ${username}!`,
        `Schön dass du da bist, ${username}!`
      ]
    };

    const options = templates[type] || [`Hey ${username}!`];
    return options[Math.floor(Math.random() * options.length)];
  }

  /**
   * Clear response cache
   */
  clearCache() {
    this.responseCache.clear();
    this.logger.info('ResponseEngine: Cache cleared');
  }

  /**
   * Check if OpenAI is ready
   * @returns {boolean}
   */
  isReady() {
    return this.openai !== null;
  }

  /**
   * Test OpenAI connection
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    if (!this.openai) {
      return false;
    }

    try {
      await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [{ role: 'user', content: 'test' }],
        max_tokens: 5
      });
      return true;
    } catch (error) {
      this.logger.error(`ResponseEngine: Connection test failed - ${error.message}`);
      return false;
    }
  }
}

module.exports = ResponseEngine;
