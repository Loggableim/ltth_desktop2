/**
 * Animation Controller
 * Manages sprite animation synchronized with TTS audio playback
 */

class AnimationController {
  constructor(io, logger, config, obsWebSocket = null) {
    this.io = io;
    this.logger = logger;
    this.config = config;
    this.obsWebSocket = obsWebSocket;
    
    // Active animations tracking
    this.activeAnimations = new Map();
    
    // Animation state machine states
    this.STATES = {
      IDLE: 'idle',
      SPEAKING: 'speaking',
      FADING_OUT: 'fading_out'
    };
  }

  /**
   * Start avatar animation for TTS event
   * @param {string} userId - TikTok user ID
   * @param {string} username - TikTok username
   * @param {object} sprites - Sprite paths
   * @param {number} audioDuration - Duration of TTS audio in milliseconds
   */
  async startAnimation(userId, username, sprites, audioDuration) {
    try {
      // Check if animation already active for this user
      if (this.activeAnimations.has(userId)) {
        this.logger.warn(`TalkingHeads: Animation already active for ${username}, skipping`);
        return;
      }

      this.logger.info(`TalkingHeads: Starting animation for ${username} (${audioDuration}ms)`);

      // Create animation state
      const animationState = {
        userId,
        username,
        sprites,
        state: this.STATES.IDLE,
        startTime: Date.now(),
        audioDuration,
        blinkTimer: null,
        speakTimer: null,
        endTimer: null
      };

      this.activeAnimations.set(userId, animationState);

      // Emit initial animation start to overlay
      const relativeSprites = this._getRelativePaths(sprites);
      this.io.emit('talkingheads:animation:start', {
        userId,
        username,
        sprites: relativeSprites,
        fadeInDuration: this.config.fadeInDuration || 300
      });
      
      this.logger.info(`TalkingHeads: Emitting animation:start for ${username}`, { 
        userId, 
        spriteCount: Object.keys(relativeSprites).length 
      });

      // Setup OBS scene if enabled
      if (this.config.obsEnabled && this.obsWebSocket) {
        await this._setupOBSScene(userId, username, sprites);
      }

      // Start idle animation with blinking
      this._startIdleAnimation(userId);

      // Wait for fade-in, then start speaking animation
      setTimeout(() => {
        this._startSpeakingAnimation(userId, audioDuration);
      }, this.config.fadeInDuration || 300);

    } catch (error) {
      this.logger.error(`TalkingHeads: Failed to start animation for ${username}`, error);
      this.activeAnimations.delete(userId);
    }
  }

  /**
   * Start idle animation with periodic blinking
   * @param {string} userId - User ID
   * @private
   */
  _startIdleAnimation(userId) {
    const animation = this.activeAnimations.get(userId);
    if (!animation) return;

    animation.state = this.STATES.IDLE;

    // Emit idle frame
    this.io.emit('talkingheads:animation:frame', {
      userId,
      frame: 'idle_neutral'
    });

    // Setup periodic blinking
    const blinkInterval = this.config.blinkInterval || 3000;
    animation.blinkTimer = setInterval(() => {
      if (animation.state === this.STATES.IDLE) {
        this._performBlink(userId);
      }
    }, blinkInterval);
  }

  /**
   * Perform blink animation
   * @param {string} userId - User ID
   * @private
   */
  _performBlink(userId) {
    const animation = this.activeAnimations.get(userId);
    if (!animation) return;

    // Show blink frame
    this.io.emit('talkingheads:animation:frame', {
      userId,
      frame: 'blink'
    });

    // Return to idle after 150ms
    setTimeout(() => {
      if (this.activeAnimations.has(userId)) {
        this.io.emit('talkingheads:animation:frame', {
          userId,
          frame: 'idle_neutral'
        });
      }
    }, 150);
  }

  /**
   * Start speaking animation synchronized with audio
   * @param {string} userId - User ID
   * @param {number} duration - Audio duration in milliseconds
   * @private
   */
  _startSpeakingAnimation(userId, duration) {
    const animation = this.activeAnimations.get(userId);
    if (!animation) {
      this.logger.warn(`TalkingHeads: Cannot start speaking animation - no animation found for ${userId}`);
      return;
    }

    this.logger.info(`TalkingHeads: Starting speaking animation for ${animation.username} (duration: ${duration}ms)`);
    animation.state = this.STATES.SPEAKING;

    // Stop blinking during speech
    if (animation.blinkTimer) {
      clearInterval(animation.blinkTimer);
      animation.blinkTimer = null;
    }

    // Cycle through speaking frames
    const speakFrames = ['speak_closed', 'speak_mid', 'speak_open', 'speak_mid'];
    let frameIndex = 0;
    const frameDuration = 150; // 150ms per frame

    this.logger.info(`TalkingHeads: Emitting mouth animation frames every ${frameDuration}ms`);
    
    animation.speakTimer = setInterval(() => {
      if (animation.state === this.STATES.SPEAKING) {
        this.io.emit('talkingheads:animation:frame', {
          userId,
          frame: speakFrames[frameIndex]
        });

        frameIndex = (frameIndex + 1) % speakFrames.length;
      }
    }, frameDuration);

    // Schedule end of animation
    animation.endTimer = setTimeout(() => {
      this._endAnimation(userId);
    }, duration);
  }

  /**
   * End animation and fade out
   * @param {string} userId - User ID
   * @private
   */
  _endAnimation(userId) {
    const animation = this.activeAnimations.get(userId);
    if (!animation) return;

    this.logger.info(`TalkingHeads: Ending animation for ${animation.username}`);

    animation.state = this.STATES.FADING_OUT;

    // Clear timers
    if (animation.blinkTimer) {
      clearInterval(animation.blinkTimer);
    }
    if (animation.speakTimer) {
      clearInterval(animation.speakTimer);
    }
    if (animation.endTimer) {
      clearTimeout(animation.endTimer);
    }

    // Return to idle before fading out
    this.io.emit('talkingheads:animation:frame', {
      userId,
      frame: 'idle_neutral'
    });

    // Fade out after brief pause
    setTimeout(() => {
      this.io.emit('talkingheads:animation:end', {
        userId,
        fadeOutDuration: this.config.fadeOutDuration || 300
      });

      // Cleanup OBS scene
      if (this.config.obsEnabled && this.obsWebSocket) {
        this._cleanupOBSScene(userId);
      }

      // Remove from active animations
      setTimeout(() => {
        this.activeAnimations.delete(userId);
      }, this.config.fadeOutDuration || 300);

    }, 200);
  }

  /**
   * Stop animation immediately
   * @param {string} userId - User ID
   */
  stopAnimation(userId) {
    const animation = this.activeAnimations.get(userId);
    if (!animation) return;

    this.logger.info(`TalkingHeads: Stopping animation for ${animation.username}`);

    // Clear all timers
    if (animation.blinkTimer) clearInterval(animation.blinkTimer);
    if (animation.speakTimer) clearInterval(animation.speakTimer);
    if (animation.endTimer) clearTimeout(animation.endTimer);

    // Emit stop event
    this.io.emit('talkingheads:animation:stop', { userId });

    // Cleanup
    this.activeAnimations.delete(userId);
  }

  /**
   * Setup OBS scene for avatar display
   * @param {string} userId - User ID
   * @param {string} username - Username
   * @param {object} sprites - Sprite paths
   * @private
   */
  async _setupOBSScene(userId, username, sprites) {
    try {
      // This would integrate with OBS WebSocket to create/show sources
      // Implementation depends on OBS WebSocket v5 API
      this.logger.info(`TalkingHeads: OBS scene setup for ${username}`);
      
      // TODO: Implement OBS WebSocket integration
      // - Create browser source for avatar overlay
      // - Position and size the source
      // - Set visibility to true
      
    } catch (error) {
      this.logger.error('TalkingHeads: Failed to setup OBS scene', error);
    }
  }

  /**
   * Cleanup OBS scene after animation
   * @param {string} userId - User ID
   * @private
   */
  async _cleanupOBSScene(userId) {
    try {
      this.logger.info(`TalkingHeads: OBS scene cleanup for user ${userId}`);
      
      // TODO: Implement OBS WebSocket cleanup
      // - Hide or remove browser source
      
    } catch (error) {
      this.logger.error('TalkingHeads: Failed to cleanup OBS scene', error);
    }
  }

  /**
   * Convert absolute sprite paths to relative URLs for web overlay
   * @param {object} sprites - Sprite paths object
   * @returns {object} Sprite URLs object
   * @private
   */
  _getRelativePaths(sprites) {
    const relativeSprites = {};
    
    for (const [key, value] of Object.entries(sprites)) {
      if (value) {
        // Convert to API endpoint URL
        const filename = value.split('/').pop();
        relativeSprites[key] = `/api/talkingheads/sprite/${filename}`;
      }
    }
    
    return relativeSprites;
  }

  /**
   * Get active animations count
   * @returns {number} Number of active animations
   */
  getActiveCount() {
    return this.activeAnimations.size;
  }

  /**
   * Get all active animations
   * @returns {Array} Array of active animation info
   */
  getActiveAnimations() {
    const animations = [];
    
    for (const [userId, animation] of this.activeAnimations) {
      animations.push({
        userId,
        username: animation.username,
        state: animation.state,
        duration: Date.now() - animation.startTime
      });
    }
    
    return animations;
  }

  /**
   * Stop all animations
   */
  stopAllAnimations() {
    for (const userId of this.activeAnimations.keys()) {
      this.stopAnimation(userId);
    }
  }
}

module.exports = AnimationController;
