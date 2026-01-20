/**
 * Cache Manager for Talking Heads
 * Handles persistent storage and retrieval of avatars and sprites
 */

const fs = require('fs').promises;
const path = require('path');

class CacheManager {
  constructor(pluginDataDir, db, logger, config) {
    this.pluginDataDir = pluginDataDir;
    this.db = db;
    this.logger = logger;
    this.config = config;
    this.cacheDir = path.join(pluginDataDir, 'avatars');
    this.initialized = false;
  }

  /**
   * Initialize cache directory and database table
   */
  async init() {
    try {
      // Ensure cache directory exists
      await fs.mkdir(this.cacheDir, { recursive: true });

      // Create database table for avatar metadata
      this.db.prepare(`
        CREATE TABLE IF NOT EXISTS talking_heads_cache (
          user_id TEXT PRIMARY KEY,
          username TEXT NOT NULL,
          style_key TEXT NOT NULL,
          avatar_path TEXT NOT NULL,
          sprite_idle_neutral TEXT NOT NULL,
          sprite_blink TEXT NOT NULL,
          sprite_speak_closed TEXT NOT NULL,
          sprite_speak_mid TEXT NOT NULL,
          sprite_speak_open TEXT NOT NULL,
          created_at INTEGER NOT NULL,
          last_used INTEGER NOT NULL,
          profile_image_url TEXT
        )
      `).run();

      this.initialized = true;
      this.logger.info('TalkingHeads: Cache manager initialized');
    } catch (error) {
      this.logger.error('TalkingHeads: Failed to initialize cache manager', error);
      throw error;
    }
  }

  /**
   * Check if avatar exists for user
   * @param {string} userId - TikTok user ID
   * @param {string} styleKey - Style template key
   * @returns {boolean} True if cached avatar exists
   */
  hasAvatar(userId, styleKey) {
    if (!this.initialized) return false;

    try {
      const result = this.db.prepare(
        'SELECT user_id FROM talking_heads_cache WHERE user_id = ? AND style_key = ?'
      ).get(userId, styleKey);

      return !!result;
    } catch (error) {
      this.logger.error('TalkingHeads: Error checking cache', error);
      return false;
    }
  }

  /**
   * Get cached avatar data for user
   * @param {string} userId - TikTok user ID
   * @param {string} styleKey - Style template key
   * @returns {object|null} Avatar data or null if not found
   */
  getAvatar(userId, styleKey) {
    if (!this.initialized) return null;

    try {
      const result = this.db.prepare(
        'SELECT * FROM talking_heads_cache WHERE user_id = ? AND style_key = ?'
      ).get(userId, styleKey);

      if (result) {
        // Update last used timestamp
        this.db.prepare(
          'UPDATE talking_heads_cache SET last_used = ? WHERE user_id = ? AND style_key = ?'
        ).run(Date.now(), userId, styleKey);

        return {
          userId: result.user_id,
          username: result.username,
          styleKey: result.style_key,
          avatarPath: result.avatar_path,
          sprites: {
            idle_neutral: result.sprite_idle_neutral,
            blink: result.sprite_blink,
            speak_closed: result.sprite_speak_closed,
            speak_mid: result.sprite_speak_mid,
            speak_open: result.sprite_speak_open
          },
          createdAt: result.created_at,
          lastUsed: result.last_used,
          profileImageUrl: result.profile_image_url
        };
      }

      return null;
    } catch (error) {
      this.logger.error('TalkingHeads: Error retrieving cached avatar', error);
      return null;
    }
  }

  /**
   * Save avatar and sprites to cache
   * @param {string} userId - TikTok user ID
   * @param {string} username - TikTok username
   * @param {string} styleKey - Style template key
   * @param {string} avatarPath - Path to avatar image
   * @param {object} spritePaths - Paths to sprite images
   * @param {string} profileImageUrl - Original profile image URL
   */
  saveAvatar(userId, username, styleKey, avatarPath, spritePaths, profileImageUrl = null) {
    if (!this.initialized) {
      throw new Error('Cache manager not initialized');
    }

    try {
      const now = Date.now();

      this.db.prepare(`
        INSERT OR REPLACE INTO talking_heads_cache (
          user_id, username, style_key, avatar_path,
          sprite_idle_neutral, sprite_blink, sprite_speak_closed,
          sprite_speak_mid, sprite_speak_open,
          created_at, last_used, profile_image_url
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        userId,
        username,
        styleKey,
        avatarPath,
        spritePaths.idle_neutral,
        spritePaths.blink,
        spritePaths.speak_closed,
        spritePaths.speak_mid,
        spritePaths.speak_open,
        now,
        now,
        profileImageUrl
      );

      this.logger.info(`TalkingHeads: Cached avatar for user ${username} (${userId})`);
    } catch (error) {
      this.logger.error('TalkingHeads: Failed to save avatar to cache', error);
      throw error;
    }
  }

  /**
   * Clean up old cached avatars based on cache duration
   * @returns {number} Number of deleted entries
   */
  async cleanupOldCache() {
    if (!this.initialized || !this.config.cacheEnabled) return 0;

    try {
      const cacheDuration = this.config.cacheDuration || 2592000000; // 30 days default
      const expiryTime = Date.now() - cacheDuration;

      // Get expired entries
      const expiredEntries = this.db.prepare(
        'SELECT user_id, username, avatar_path, sprite_idle_neutral, sprite_blink, sprite_speak_closed, sprite_speak_mid, sprite_speak_open FROM talking_heads_cache WHERE last_used < ?'
      ).all(expiryTime);

      if (expiredEntries.length === 0) return 0;

      // Delete files
      for (const entry of expiredEntries) {
        try {
          const files = [
            entry.avatar_path,
            entry.sprite_idle_neutral,
            entry.sprite_blink,
            entry.sprite_speak_closed,
            entry.sprite_speak_mid,
            entry.sprite_speak_open
          ];

          for (const file of files) {
            if (file) {
              try {
                await fs.unlink(file);
              } catch (err) {
                // File might not exist, ignore
              }
            }
          }
        } catch (error) {
          this.logger.warn(`TalkingHeads: Error deleting files for user ${entry.username}`, error);
        }
      }

      // Delete database entries
      const result = this.db.prepare(
        'DELETE FROM talking_heads_cache WHERE last_used < ?'
      ).run(expiryTime);

      this.logger.info(`TalkingHeads: Cleaned up ${result.changes} old cached avatars`);
      return result.changes;
    } catch (error) {
      this.logger.error('TalkingHeads: Error during cache cleanup', error);
      return 0;
    }
  }

  /**
   * Get cache statistics
   * @returns {object} Cache statistics
   */
  getStats() {
    if (!this.initialized) {
      return { totalAvatars: 0, cacheEnabled: false };
    }

    try {
      const result = this.db.prepare(
        'SELECT COUNT(*) as count FROM talking_heads_cache'
      ).get();

      return {
        totalAvatars: result.count,
        cacheEnabled: this.config.cacheEnabled,
        cacheDuration: this.config.cacheDuration,
        cacheDir: this.cacheDir
      };
    } catch (error) {
      this.logger.error('TalkingHeads: Error getting cache stats', error);
      return { totalAvatars: 0, cacheEnabled: false, error: error.message };
    }
  }

  /**
   * Clear all cached avatars
   * @returns {number} Number of deleted entries
   */
  async clearAllCache() {
    if (!this.initialized) return 0;

    try {
      // Get all entries
      const allEntries = this.db.prepare(
        'SELECT avatar_path, sprite_idle_neutral, sprite_blink, sprite_speak_closed, sprite_speak_mid, sprite_speak_open FROM talking_heads_cache'
      ).all();

      // Delete all files
      for (const entry of allEntries) {
        const files = [
          entry.avatar_path,
          entry.sprite_idle_neutral,
          entry.sprite_blink,
          entry.sprite_speak_closed,
          entry.sprite_speak_mid,
          entry.sprite_speak_open
        ];

        for (const file of files) {
          if (file) {
            try {
              await fs.unlink(file);
            } catch (err) {
              // File might not exist, ignore
            }
          }
        }
      }

      // Clear database
      const result = this.db.prepare('DELETE FROM talking_heads_cache').run();

      this.logger.info(`TalkingHeads: Cleared all cache (${result.changes} entries)`);
      return result.changes;
    } catch (error) {
      this.logger.error('TalkingHeads: Error clearing cache', error);
      return 0;
    }
  }

  /**
   * List cached avatars for UI display
   * @param {number} limit - Maximum number of entries to return
   * @returns {Array} Cached avatar metadata
   */
  listAvatars(limit = 50) {
    if (!this.initialized) {
      return [];
    }

    try {
      const rows = this.db.prepare(`
        SELECT user_id, username, style_key, avatar_path,
               sprite_idle_neutral, sprite_blink, sprite_speak_closed,
               sprite_speak_mid, sprite_speak_open,
               created_at, last_used, profile_image_url
        FROM talking_heads_cache
        ORDER BY created_at DESC
        LIMIT ?
      `).all(limit);

      return rows.map((row) => ({
        userId: row.user_id,
        username: row.username,
        styleKey: row.style_key,
        avatarPath: row.avatar_path,
        sprites: {
          idle_neutral: row.sprite_idle_neutral,
          blink: row.sprite_blink,
          speak_closed: row.sprite_speak_closed,
          speak_mid: row.sprite_speak_mid,
          speak_open: row.sprite_speak_open
        },
        createdAt: row.created_at,
        lastUsed: row.last_used,
        profileImageUrl: row.profile_image_url
      }));
    } catch (error) {
      this.logger.error('TalkingHeads: Failed to list cached avatars', error);
      return [];
    }
  }
}

module.exports = CacheManager;
