/**
 * RelevanceEngine - Evaluates relevance of chat messages and events
 * 
 * Determines if a chat message or event warrants a response based on:
 * - Keywords and question patterns
 * - Message length and complexity
 * - Greeting and thanks detection
 * - Ignore patterns (URLs, spam, commands)
 * 
 * Inspired by pal_ALONE.py's Relevance class.
 */

class RelevanceEngine {
  constructor(config = {}) {
    this.config = {
      minLength: config.minLength || 3,
      keywordsBonus: config.keywordsBonus || [
        'warum', 'wieso', 'wie', 'wann', 'wo', 'wer', 'was', 'welche', 'welcher', 'welches',
        'why', 'how', 'when', 'where', 'who', 'what', 'which', 'how much', 'how many'
      ],
      greetings: config.greetings || [
        'hallo', 'hi', 'hey', 'servus', 'moin', 'gruss', 'grüß', 'guten morgen', 'guten abend', 'hello'
      ],
      thanks: config.thanks || [
        'danke', 'thx', 'thanks', 'ty', 'merci', 'thank you'
      ],
      ignoreStartsWith: config.ignoreStartsWith || ['!', '/', '.'],
      ignoreContains: config.ignoreContains || ['http://', 'https://', 'discord.gg'],
      ...config
    };

    // Compile regex patterns
    this._compilePatterns();
  }

  /**
   * Compile regex patterns for efficient matching
   * @private
   */
  _compilePatterns() {
    // URL pattern
    this.urlPattern = /https?:\/\/|discord\.gg/i;

    // Greeting pattern
    const greetingWords = this.config.greetings.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    this.greetingPattern = new RegExp(`\\b(${greetingWords})\\b`, 'i');

    // Thanks pattern
    const thanksWords = this.config.thanks.map(w => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|');
    this.thanksPattern = new RegExp(`\\b(${thanksWords})\\b`, 'i');
  }

  /**
   * Check if text should be ignored
   * @param {string} text
   * @returns {boolean}
   */
  isIgnored(text) {
    if (!text || typeof text !== 'string') {
      return true;
    }

    const lower = text.toLowerCase().trim();

    // Check minimum length
    if (lower.length < this.config.minLength) {
      return true;
    }

    // Check if starts with ignore prefix
    for (const prefix of this.config.ignoreStartsWith) {
      if (lower.startsWith(prefix)) {
        return true;
      }
    }

    // Check if contains ignore strings
    for (const substr of this.config.ignoreContains) {
      if (lower.includes(substr.toLowerCase())) {
        return true;
      }
    }

    // Check for URLs
    if (this.urlPattern.test(lower)) {
      return true;
    }

    return false;
  }

  /**
   * Check if text is a greeting
   * @param {string} text
   * @returns {boolean}
   */
  isGreeting(text) {
    if (!text) return false;
    return this.greetingPattern.test(text);
  }

  /**
   * Check if text is a thanks/gratitude message
   * @param {string} text
   * @returns {boolean}
   */
  isThanks(text) {
    if (!text) return false;
    return this.thanksPattern.test(text);
  }

  /**
   * Calculate relevance score for a text
   * @param {string} text
   * @returns {number} - Score from 0 to 1
   */
  score(text) {
    if (!text || typeof text !== 'string') {
      return 0;
    }

    const lower = text.toLowerCase().trim();
    let score = 0;

    // Question mark adds significant relevance
    if (lower.includes('?')) {
      score += 0.6;
    }

    // Keywords bonus
    const hasKeyword = this.config.keywordsBonus.some(kw => 
      lower.includes(kw.toLowerCase())
    );
    if (hasKeyword) {
      score += 0.35;
    }

    // Length bonus (longer messages are more likely to need response)
    if (lower.length >= 7) {
      score += 0.1;
    }

    // Punctuation indicates thought/emotion
    if (/[!:;]/.test(lower)) {
      score += 0.05;
    }

    // Cap at 1.0
    return Math.min(1.0, score);
  }

  /**
   * Evaluate if a message should get a response
   * @param {string} text
   * @param {number} threshold - Minimum score to respond (default 0.6)
   * @returns {object} - { shouldRespond: boolean, score: number, reason: string }
   */
  evaluate(text, threshold = 0.6) {
    // Guard against excessively high thresholds
    // High thresholds (>0.8) would suppress almost all replies.
    // Lower to 0.4 to ensure questions with keywords get through.
    const maxThreshold = this.config.maxThreshold || 0.8;
    const adjustedThreshold = this.config.adjustedThreshold || 0.4;
    
    if (threshold > maxThreshold) {
      threshold = adjustedThreshold;
    }

    // Check if ignored
    if (this.isIgnored(text)) {
      return {
        shouldRespond: false,
        score: 0,
        reason: 'ignored'
      };
    }

    // Check if greeting
    if (this.isGreeting(text)) {
      return {
        shouldRespond: true,
        score: 0.7,
        reason: 'greeting'
      };
    }

    // Check if thanks
    if (this.isThanks(text)) {
      return {
        shouldRespond: true,
        score: 0.6,
        reason: 'thanks'
      };
    }

    // Calculate score
    const score = this.score(text);
    
    return {
      shouldRespond: score >= threshold,
      score,
      reason: score >= threshold ? 'relevant' : 'low_score'
    };
  }

  /**
   * Update configuration
   * @param {object} newConfig
   */
  updateConfig(newConfig) {
    this.config = { ...this.config, ...newConfig };
    this._compilePatterns();
  }
}

module.exports = RelevanceEngine;
