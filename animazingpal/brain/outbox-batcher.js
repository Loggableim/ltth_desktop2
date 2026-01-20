/**
 * OutboxBatcher - Batch processing for TikTok events
 * 
 * Collects multiple events (likes, gifts, follows) over a time window
 * and processes them together for more efficient handling and natural speech flow.
 * 
 * Inspired by pal_ALONE.py's OutboxBatcher implementation.
 */

class OutboxBatcher {
  constructor(options = {}) {
    this.windowSeconds = options.windowSeconds || 8;
    this.maxItems = options.maxItems || 8;
    this.maxChars = options.maxChars || 320;
    this.separator = options.separator || ' • ';
    
    this.buffer = [];
    this.firstItemTime = null;
    this.flushCallback = null;
    this.flushTimer = null;
    
    // Conditions that prevent flushing (e.g., speech/mic active)
    this.holdConditions = new Set();
  }

  /**
   * Add an item to the batch
   * @param {string} text - Text to add to batch
   * @returns {boolean} - True if flushed immediately
   */
  add(text) {
    if (!text || typeof text !== 'string') {
      return false;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return false;
    }

    // Add to buffer
    this.buffer.push(trimmed);
    
    // Track first item time
    if (!this.firstItemTime) {
      this.firstItemTime = Date.now();
    }

    // Check if we should flush immediately
    const joined = this.buffer.join(this.separator);
    if (joined.length > this.maxChars || this.buffer.length >= this.maxItems) {
      this.flush();
      return true;
    }

    // Schedule periodic check
    this.scheduleFlushCheck();
    return false;
  }

  /**
   * Set callback for when batch is flushed
   * @param {function} callback - Called with joined text
   */
  onFlush(callback) {
    this.flushCallback = callback;
  }

  /**
   * Add a hold condition (e.g., 'speech', 'mic')
   * @param {string} condition
   */
  addHold(condition) {
    this.holdConditions.add(condition);
  }

  /**
   * Remove a hold condition
   * @param {string} condition
   */
  removeHold(condition) {
    this.holdConditions.delete(condition);
    // Check if we can flush now
    this.scheduleFlushCheck();
  }

  /**
   * Check if holds are active
   * @returns {boolean}
   */
  hasHolds() {
    return this.holdConditions.size > 0;
  }

  /**
   * Schedule a flush check
   */
  scheduleFlushCheck() {
    if (this.flushTimer) {
      return; // Already scheduled
    }

    // Only start checking when there are items in the buffer
    if (this.buffer.length === 0) {
      return;
    }

    this.flushTimer = setInterval(() => {
      this.checkFlush();
      
      // Stop timer if buffer is empty
      if (this.buffer.length === 0 && this.flushTimer) {
        clearInterval(this.flushTimer);
        this.flushTimer = null;
      }
    }, 250); // Check every 250ms
  }

  /**
   * Check if batch should be flushed
   */
  checkFlush() {
    // Don't flush if there are holds or no items
    if (this.hasHolds() || this.buffer.length === 0) {
      return;
    }

    // Check if window has elapsed
    if (this.firstItemTime) {
      const elapsed = (Date.now() - this.firstItemTime) / 1000;
      if (elapsed >= this.windowSeconds) {
        this.flush();
      }
    }
  }

  /**
   * Flush the batch immediately
   */
  flush() {
    if (this.buffer.length === 0) {
      return;
    }

    const payload = this.buffer.join(this.separator);
    this.buffer = [];
    this.firstItemTime = null;

    // Clear timer
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    // Call flush callback
    if (this.flushCallback) {
      this.flushCallback(payload);
    }
  }

  /**
   * Get current buffer size
   * @returns {number}
   */
  size() {
    return this.buffer.length;
  }

  /**
   * Clear the buffer without flushing
   */
  clear() {
    this.buffer = [];
    this.firstItemTime = null;
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }

  /**
   * Destroy the batcher
   */
  destroy() {
    this.clear();
    this.flushCallback = null;
    this.holdConditions.clear();
  }
}

module.exports = OutboxBatcher;
