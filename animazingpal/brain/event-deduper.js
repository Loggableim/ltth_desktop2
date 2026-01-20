/**
 * EventDeduper - Deduplicates TikTok events to prevent duplicate processing
 * 
 * Uses an in-memory store with TTL (Time To Live) to track seen events.
 * Can be extended to use Redis for distributed deduplication.
 * 
 * Inspired by pal_ALONE.py's EventDeduper class.
 */

class EventDeduper {
  constructor(options = {}) {
    this.ttl = options.ttl || 600; // 10 minutes default
    this.maxSize = options.maxSize || 5000;
    this.store = new Map(); // signature -> expiry timestamp
    
    // Start cleanup interval
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000); // Cleanup every minute
  }

  /**
   * Generate a signature for an event
   * @param {string} type - Event type (gift, follow, like, etc.)
   * @param {object} data - Event data
   * @returns {string}
   */
  generateSignature(type, data) {
    const parts = [type];
    
    // Add relevant fields based on event type
    if (data.userId || data.uniqueId) {
      parts.push(data.userId || data.uniqueId);
    }
    
    if (type === 'gift' && data.giftName) {
      parts.push(data.giftName);
      if (data.count) {
        parts.push(data.count.toString());
      }
    }
    
    if (type === 'comment' && data.text) {
      parts.push(data.text.toLowerCase().trim());
    }
    
    // Add timestamp for time-sensitive deduplication
    if (data.timestamp) {
      // Round to nearest 10 seconds to catch duplicates within a short window
      const roundedTime = Math.floor(data.timestamp / 10000) * 10000;
      parts.push(roundedTime.toString());
    }
    
    return parts.join('|');
  }

  /**
   * Check if an event has been seen
   * @param {string} signature - Event signature
   * @returns {boolean} - True if seen, false if new
   */
  hasSeen(signature) {
    const now = Date.now();
    const expiry = this.store.get(signature);
    
    if (expiry && expiry > now) {
      return true; // Already seen and not expired
    }
    
    // New event or expired - mark as seen
    this.store.set(signature, now + (this.ttl * 1000));
    
    // Enforce max size
    if (this.store.size > this.maxSize) {
      // Remove oldest entries
      const entriesToRemove = this.store.size - this.maxSize;
      let removed = 0;
      for (const key of this.store.keys()) {
        this.store.delete(key);
        removed++;
        if (removed >= entriesToRemove) break;
      }
    }
    
    return false;
  }

  /**
   * Cleanup expired entries
   */
  cleanup() {
    const now = Date.now();
    let removed = 0;
    
    for (const [signature, expiry] of this.store.entries()) {
      if (expiry <= now) {
        this.store.delete(signature);
        removed++;
      }
    }
    
    if (removed > 0) {
      // Logger not available in this standalone class
      // console.log(`EventDeduper: Cleaned up ${removed} expired entries`);
    }
  }

  /**
   * Clear all entries
   */
  clear() {
    this.store.clear();
  }

  /**
   * Get current store size
   * @returns {number}
   */
  size() {
    return this.store.size;
  }

  /**
   * Destroy the deduper
   */
  destroy() {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

module.exports = EventDeduper;
