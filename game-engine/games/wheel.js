/**
 * Glücksrad (Wheel of Fortune) Game Logic
 * 
 * Spin-to-win game where viewers trigger spins via gifts or chat commands.
 * Supports multiple wheels with individual configurations and triggers.
 */

// Constants
const CLEANUP_INTERVAL_MS = 30000; // 30 seconds
const MAX_SPIN_AGE_MS = 120000; // 2 minutes
const MIN_SPIN_ROTATIONS = 5; // Minimum full rotations
const SPIN_ROTATION_VARIANCE = 3; // Random additional rotations (0 to this value)
const LANDING_ZONE_START = 0.1; // Where in the segment to start landing (10% from edge)
const LANDING_ZONE_SIZE = 0.8; // Size of safe landing zone (80% of segment)

class WheelGame {
  constructor(api, db, logger) {
    this.api = api;
    this.db = db;
    this.logger = logger;
    this.io = api.getSocketIO();
    
    // Track active spins in-flight
    this.activeSpins = new Map(); // spinId -> { username, nickname, timestamp, status, wheelId }
    
    // Spin queue (FIFO) - shared across all wheels
    this.spinQueue = []; // Array of { spinId, username, nickname, profilePictureUrl, giftName, timestamp, wheelId }
    
    // Is a spin currently in progress?
    this.isSpinning = false;
    
    // Current active spin
    this.currentSpin = null;
    
    // Spin ID counter
    this.spinIdCounter = 0;
    
    // Cleanup timer
    this.cleanupTimer = null;
  }

  /**
   * Initialize Wheel game
   */
  init() {
    this.logger.info('🎡 Glücksrad game initialized (multi-wheel support enabled)');
  }

  /**
   * Get all wheels
   * @returns {Array} List of all wheel configurations
   */
  getAllWheels() {
    return this.db.getAllWheels();
  }

  /**
   * Get Wheel configuration by ID
   * @param {number} wheelId - Wheel ID (optional, defaults to first wheel)
   */
  getConfig(wheelId = null) {
    return this.db.getWheelConfig(wheelId);
  }

  /**
   * Create a new wheel
   * @param {string} name - Name of the wheel
   * @param {Array} segments - Initial segments (optional)
   * @param {Object} settings - Initial settings (optional)
   * @returns {number} New wheel ID
   */
  createWheel(name, segments = null, settings = null) {
    const defaultSegments = segments || [
      { text: '100 XP', color: '#FF6B6B', weight: 10, isNiete: false },
      { text: '200 XP', color: '#FFA500', weight: 8, isNiete: false },
      { text: '500 XP', color: '#FFD700', weight: 5, isNiete: false },
      { text: 'Shoutout!', color: '#4CAF50', weight: 4, isNiete: false },
      { text: 'Niete', color: '#607D8B', weight: 15, isNiete: true }
    ];
    
    const defaultSettings = settings || {
      spinDuration: 5000,
      soundEnabled: true,
      soundVolume: 0.7,
      showQueue: true,
      winnerDisplayDuration: 5,
      nieteText: 'Leider kein Gewinn!',
      infoScreenEnabled: false,
      infoScreenText: 'Um deinen Gewinn abzuholen, besuche discord.gg/deinserver',
      infoScreenDuration: 5
    };
    
    const wheelId = this.db.createWheel(name, defaultSegments, defaultSettings);
    this.logger.info(`🎡 Created new wheel: ${name} (ID: ${wheelId})`);
    
    return wheelId;
  }

  /**
   * Update Wheel configuration
   * @param {number} wheelId - Wheel ID
   * @param {Array} segments - Wheel segments
   * @param {Object} settings - Wheel settings
   */
  updateConfig(wheelId, segments, settings) {
    this.db.updateWheelConfig(wheelId, segments, settings);
    
    // Emit config update to overlays (include wheelId)
    this.io.emit('wheel:config-updated', {
      wheelId,
      segments,
      settings
    });
    
    this.logger.info(`✅ Glücksrad configuration updated (Wheel ID: ${wheelId})`);
  }

  /**
   * Update wheel name
   */
  updateWheelName(wheelId, name) {
    this.db.updateWheelName(wheelId, name);
    this.logger.info(`✅ Wheel name updated: ${name} (ID: ${wheelId})`);
  }

  /**
   * Update wheel chat command
   */
  updateWheelChatCommand(wheelId, chatCommand) {
    this.db.updateWheelChatCommand(wheelId, chatCommand);
    this.logger.info(`✅ Wheel chat command updated: ${chatCommand || 'disabled'} (ID: ${wheelId})`);
  }

  /**
   * Update wheel enabled status
   */
  updateWheelEnabled(wheelId, enabled) {
    this.db.updateWheelEnabled(wheelId, enabled);
    this.logger.info(`✅ Wheel ${enabled ? 'enabled' : 'disabled'} (ID: ${wheelId})`);
  }

  /**
   * Delete a wheel
   */
  deleteWheel(wheelId) {
    const result = this.db.deleteWheel(wheelId);
    if (result) {
      this.logger.info(`✅ Wheel deleted (ID: ${wheelId})`);
    }
    return result;
  }

  /**
   * Find wheel by gift trigger
   * @param {string} giftIdentifier - Gift name or ID
   * @returns {Object|null} Wheel config if found
   */
  findWheelByGiftTrigger(giftIdentifier) {
    return this.db.findWheelByGiftTrigger(giftIdentifier);
  }

  /**
   * Find wheel by chat command
   * @param {string} command - Chat command
   * @returns {Object|null} Wheel config if found
   */
  findWheelByChatCommand(command) {
    return this.db.findWheelByChatCommand(command);
  }

  /**
   * Check if user already has a spin in the queue
   * @param {string} username - Username to check
   * @returns {boolean} True if user already in queue
   */
  userInQueue(username) {
    return this.spinQueue.some(spin => spin.username === username);
  }

  /**
   * Trigger a wheel spin (from gift or command)
   * @param {string} username - Username
   * @param {string} nickname - Nickname
   * @param {string} profilePictureUrl - Profile picture URL
   * @param {string} giftName - Gift name or trigger source
   * @param {number} wheelId - Wheel ID (optional, defaults to first wheel)
   * @returns {Object} { success: boolean, spinId?: string, queued?: boolean, position?: number, error?: string }
   */
  async triggerSpin(username, nickname, profilePictureUrl, giftName, wheelId = null) {
    // Get wheel config
    const config = this.getConfig(wheelId);
    if (!config) {
      return { success: false, error: 'Wheel not found' };
    }
    
    if (!config.enabled) {
      return { success: false, error: 'Wheel is disabled' };
    }
    
    const actualWheelId = config.id;
    
    // Check if user already has an active spin
    for (const [spinId, spinData] of this.activeSpins.entries()) {
      if (spinData.username === username && spinData.status === 'spinning') {
        this.logger.debug(`🎡 User ${username} already has an active spin (${spinId}), rejecting duplicate`);
        return { success: false, error: 'You already have an active spin' };
      }
    }
    
    // Check if user already in queue (prevent duplicate queue entries)
    if (this.userInQueue(username)) {
      this.logger.debug(`🎡 User ${username} already in queue, rejecting duplicate`);
      return { success: false, error: 'You are already in the queue' };
    }
    
    // Generate unique spin ID
    const spinId = `spin_${Date.now()}_${this.spinIdCounter++}`;
    
    const spinData = {
      spinId,
      username,
      nickname,
      profilePictureUrl: profilePictureUrl || '',
      giftName: giftName || '',
      timestamp: Date.now(),
      status: 'pending',
      wheelId: actualWheelId,
      wheelName: config.name
    };

    // Store spin data
    this.activeSpins.set(spinId, spinData);

    // If already spinning, add to queue
    if (this.isSpinning || this.spinQueue.length > 0) {
      this.spinQueue.push(spinData);
      
      const position = this.spinQueue.length;
      
      this.logger.info(`🎡 Wheel spin queued: ${username} on "${config.name}" (spinId: ${spinId}, position: ${position})`);
      
      // Emit queue event
      this.io.emit('wheel:spin-queued', {
        spinId,
        username,
        nickname,
        position,
        queueLength: this.spinQueue.length,
        wheelId: actualWheelId,
        wheelName: config.name
      });
      
      return { success: true, spinId, queued: true, position, wheelId: actualWheelId };
    }

    // Start spin immediately
    return await this.startSpin(spinData);
  }

  /**
   * Start a wheel spin
   */
  async startSpin(spinData) {
    const { spinId, username, nickname, profilePictureUrl, giftName, wheelId, wheelName } = spinData;
    
    this.isSpinning = true;
    this.currentSpin = spinData;
    
    // Update status
    spinData.status = 'spinning';
    this.activeSpins.set(spinId, spinData);

    // Get config for the specific wheel
    const config = this.getConfig(wheelId);
    if (!config || !config.segments || config.segments.length === 0) {
      this.logger.error(`Wheel config has no segments (Wheel ID: ${wheelId})`);
      this.isSpinning = false;
      this.currentSpin = null;
      return { success: false, error: 'Wheel not configured' };
    }

    // Calculate winning segment based on weights
    const winningSegmentIndex = this.calculateWinningSegment(config.segments);
    const winningSegment = config.segments[winningSegmentIndex];
    
    // Calculate spin angle (multiple full rotations + landing angle)
    const numSegments = config.segments.length;
    const segmentAngle = 360 / numSegments;
    const fullRotations = MIN_SPIN_ROTATIONS + Math.floor(Math.random() * SPIN_ROTATION_VARIANCE);
    
    // Calculate landing position within the winning segment (randomized for variety)
    // LANDING_ZONE_START = 0.1 (start 10% into segment) 
    // LANDING_ZONE_SIZE = 0.8 (use 80% of segment, avoiding edges)
    const landingOffset = (Math.random() * LANDING_ZONE_SIZE + LANDING_ZONE_START) * segmentAngle;
    
    // The wheel is drawn with segments starting at -90° (top of canvas where pointer is)
    // Segment i is drawn from: -90° + i*segmentAngle to -90° + (i+1)*segmentAngle
    // After rotation by R, this segment appears at: -90° + i*segmentAngle + R to -90° + (i+1)*segmentAngle + R
    // The pointer is fixed at 0° (top of screen, pointing up)
    // We want the winning segment to land under the pointer (at 0°)
    // So we need: -90° + winningSegmentIndex*segmentAngle + landingOffset + R = 0°
    // Therefore: R = 90° - winningSegmentIndex*segmentAngle - landingOffset
    const finalAngle = 90 - (winningSegmentIndex * segmentAngle) - landingOffset;
    
    // Add full rotations for visual effect
    const totalRotation = (fullRotations * 360) + finalAngle;

    // Get spin duration from config or default
    const spinDuration = config.settings?.spinDuration || 5000;

    this.logger.info(`🎡 Wheel spin started: ${username} on "${wheelName || 'Wheel'}" -> ${winningSegment.text} (spinId: ${spinId})`);

    // Emit spin event to overlay
    this.io.emit('wheel:spin-start', {
      spinId,
      username,
      nickname,
      profilePictureUrl,
      giftName,
      totalRotation,
      spinDuration,
      winningSegmentIndex,
      winningSegment: {
        index: winningSegmentIndex,
        text: winningSegment.text,
        color: winningSegment.color,
        isNiete: winningSegment.isNiete || false,
        prizeAudio: winningSegment.prizeAudio || 1
      },
      // Include full config to ensure overlay has correct data
      segments: config.segments,
      settings: config.settings,
      wheelId,
      wheelName: wheelName || config.name,
      timestamp: Date.now()
    });

    return { 
      success: true, 
      spinId, 
      queued: false,
      wheelId,
      winningSegment: {
        index: winningSegmentIndex,
        text: winningSegment.text,
        color: winningSegment.color,
        isNiete: winningSegment.isNiete || false,
        prizeAudio: winningSegment.prizeAudio || 1
      }
    };
  }

  /**
   * Calculate winning segment based on weights
   */
  calculateWinningSegment(segments) {
    // Calculate total weight
    const totalWeight = segments.reduce((sum, seg) => sum + (seg.weight || 1), 0);
    
    // Generate random number between 0 and totalWeight
    let random = Math.random() * totalWeight;
    
    // Find winning segment
    for (let i = 0; i < segments.length; i++) {
      random -= segments[i].weight || 1;
      if (random <= 0) {
        return i;
      }
    }
    
    // Fallback to last segment
    return segments.length - 1;
  }

  /**
   * Handle spin completed (called from overlay)
   */
  async handleSpinComplete(spinId, segmentIndex) {
    const spinData = this.activeSpins.get(spinId);
    
    if (!spinData) {
      this.logger.warn(`Spin ${spinId} not found in active spins`);
      return { success: false, error: 'Spin not found' };
    }

    const wheelId = spinData.wheelId;

    // Get config for the specific wheel
    const config = this.getConfig(wheelId);
    if (!config || !config.segments || segmentIndex >= config.segments.length) {
      this.logger.error(`Invalid segment index: ${segmentIndex}`);
      return { success: false, error: 'Invalid segment' };
    }

    const segment = config.segments[segmentIndex];

    // Record win in database (with wheelId)
    this.db.recordWheelWin(
      spinData.username,
      spinData.nickname,
      segment.text,
      segmentIndex,
      spinData.giftName,
      wheelId
    );

    // Award XP if segment has xpReward configured
    let xpAwarded = 0;
    if (segment.xpReward && segment.xpReward > 0 && !segment.isNiete) {
      try {
        // Get viewer-leaderboard plugin for XP
        const viewerLeaderboard = this.api.pluginLoader?.loadedPlugins?.get('viewer-leaderboard');
        if (viewerLeaderboard?.instance?.db) {
          viewerLeaderboard.instance.db.addXP(
            spinData.username, 
            segment.xpReward, 
            'wheel_prize', 
            { prize: segment.text, spinId, wheelId, wheelName: config.name }
          );
          xpAwarded = segment.xpReward;
          this.logger.info(`🎡 Awarded ${segment.xpReward} XP to ${spinData.nickname} from wheel prize (${config.name})`);
        } else {
          this.logger.warn('Viewer XP plugin not available, could not award XP');
        }
      } catch (error) {
        this.logger.error(`Error awarding XP: ${error.message}`);
      }
    }

    // Update spin status
    spinData.status = 'completed';
    spinData.result = segment.text;
    spinData.segmentIndex = segmentIndex;

    // Remove from active spins
    this.activeSpins.delete(spinId);

    // Emit result event
    this.io.emit('wheel:spin-result', {
      spinId,
      username: spinData.username,
      nickname: spinData.nickname,
      prize: segment.text,
      prizeColor: segment.color,
      segmentIndex,
      isNiete: segment.isNiete || false,
      xpAwarded,
      wheelId,
      wheelName: config.name
    });

    this.logger.info(
      `🎡 Wheel result (${config.name}): ${spinData.nickname} ${segment.isNiete ? 'got "Niete" (no win)' : `won "${segment.text}"`}${xpAwarded > 0 ? ` (+${xpAwarded} XP)` : ''} (spinId: ${spinId})`
    );

    // Clear spinning state
    this.isSpinning = false;
    this.currentSpin = null;

    // Process next spin in queue after winner display duration
    const settings = config.settings || {};
    const winnerDisplayDuration = (settings.winnerDisplayDuration || 5) * 1000;
    const infoScreenDuration = (settings.infoScreenEnabled && !segment.isNiete) ? (settings.infoScreenDuration || 5) * 1000 : 0;
    const nextSpinDelay = winnerDisplayDuration + infoScreenDuration + 1000;
    setTimeout(() => {
      this.processNextSpin();
    }, nextSpinDelay);

    return {
      success: true,
      username: spinData.username,
      nickname: spinData.nickname,
      prize: segment.text,
      segmentIndex,
      isNiete: segment.isNiete || false,
      xpAwarded,
      wheelId
    };
  }

  /**
   * Process next spin in queue
   */
  async processNextSpin() {
    if (this.spinQueue.length === 0) {
      this.logger.debug('No spins in queue');
      return;
    }

    if (this.isSpinning) {
      this.logger.debug('Cannot process queue: spin in progress');
      return;
    }

    // Get next spin from queue (FIFO)
    const nextSpin = this.spinQueue.shift();
    
    if (!nextSpin) {
      return;
    }

    this.logger.info(`🎡 Processing queued spin for ${nextSpin.username} on "${nextSpin.wheelName}" (${this.spinQueue.length} remaining in queue)`);
    
    // Emit queue processing event
    this.io.emit('wheel:queue-processing', {
      spinId: nextSpin.spinId,
      username: nextSpin.username,
      nickname: nextSpin.nickname,
      remainingInQueue: this.spinQueue.length,
      wheelId: nextSpin.wheelId,
      wheelName: nextSpin.wheelName
    });

    // Start the spin
    await this.startSpin(nextSpin);
  }

  /**
   * Get win history
   */
  getWinHistory(limit = 50, wheelId = null) {
    return this.db.getWheelWinHistory(limit, wheelId);
  }

  /**
   * Get user's win history
   */
  getUserWinHistory(username, limit = 10) {
    return this.db.getWheelUserWinHistory(username, limit);
  }

  /**
   * Mark a prize as paid out
   */
  markPrizeAsPaid(winId) {
    return this.db.markWheelPrizePaid(winId);
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      isSpinning: this.isSpinning,
      currentSpin: this.currentSpin ? {
        spinId: this.currentSpin.spinId,
        username: this.currentSpin.username,
        nickname: this.currentSpin.nickname,
        wheelId: this.currentSpin.wheelId,
        wheelName: this.currentSpin.wheelName
      } : null,
      queueLength: this.spinQueue.length,
      queue: this.spinQueue.map((spin, index) => ({
        position: index + 1,
        spinId: spin.spinId,
        username: spin.username,
        nickname: spin.nickname,
        timestamp: spin.timestamp,
        wheelId: spin.wheelId,
        wheelName: spin.wheelName
      }))
    };
  }

  /**
   * Get Wheel statistics
   */
  getStats(wheelId = null) {
    return this.db.getWheelStats(wheelId);
  }

  /**
   * Clean up old spins (if they get stuck)
   */
  cleanupOldSpins(maxAgeMs = MAX_SPIN_AGE_MS) {
    const now = Date.now();
    const oldSpins = [];
    
    for (const [spinId, spinData] of this.activeSpins.entries()) {
      if (now - spinData.timestamp > maxAgeMs) {
        oldSpins.push(spinId);
      }
    }

    for (const spinId of oldSpins) {
      this.logger.warn(`Cleaning up stuck spin ${spinId}`);
      this.activeSpins.delete(spinId);
    }

    if (oldSpins.length > 0) {
      this.logger.info(`🧹 Cleaned up ${oldSpins.length} stuck wheel spins`);
      
      // Reset spinning state if current spin is stuck
      if (this.currentSpin && oldSpins.includes(this.currentSpin.spinId)) {
        this.isSpinning = false;
        this.currentSpin = null;
        this.processNextSpin();
      }
    }
  }

  /**
   * Start periodic cleanup
   */
  startCleanupTimer() {
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldSpins();
    }, CLEANUP_INTERVAL_MS);
  }

  /**
   * Stop cleanup timer
   */
  stopCleanupTimer() {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Destroy Wheel game
   */
  destroy() {
    this.stopCleanupTimer();
    this.activeSpins.clear();
    this.spinQueue = [];
    this.isSpinning = false;
    this.currentSpin = null;
    this.logger.info('🎡 Glücksrad game destroyed');
  }
}

module.exports = WheelGame;
