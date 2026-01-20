/**
 * Plinko Game Logic
 * 
 * Physics-based Plinko game where viewers bet XP for a chance to win multipliers.
 * Balls drop through pegs and land in slots with different multipliers.
 */

// Constants
const CLEANUP_INTERVAL_MS = 30000; // 30 seconds
const MAX_BALL_AGE_MS = 120000; // 2 minutes

class PlinkoGame {
  constructor(api, db, logger) {
    this.api = api;
    this.db = db;
    this.logger = logger;
    this.io = api.getSocketIO();
    
    // Track active balls in-flight
    this.activeBalls = new Map(); // ballId -> { username, bet, timestamp }
    
    // Ball ID counter
    this.ballIdCounter = 0;
    
    // Cleanup timer
    this.cleanupTimer = null;
  }

  /**
   * Initialize Plinko game
   */
  init() {
    this.logger.info('🎰 Plinko game initialized');
  }

  /**
   * Get Plinko configuration
   */
  getConfig() {
    return this.db.getPlinkoConfig();
  }

  /**
   * Update Plinko configuration
   */
  updateConfig(slots, physicsSettings, giftMappings) {
    this.db.updatePlinkoConfig(slots, physicsSettings, giftMappings);
    
    // Emit config update to overlays
    this.io.emit('plinko:config-updated', {
      slots,
      physicsSettings,
      giftMappings
    });
    
    this.logger.info('✅ Plinko configuration updated');
  }

  /**
   * Validate bet amount
   * @returns {Object} { valid: boolean, error?: string }
   */
  async validateBet(username, betAmount) {
    // Check for negative or zero bet
    if (betAmount <= 0) {
      return { valid: false, error: 'Bet amount must be positive' };
    }

    // Check if bet is an integer
    if (!Number.isInteger(betAmount)) {
      return { valid: false, error: 'Bet amount must be a whole number' };
    }

    // Get viewer XP from viewer-leaderboard plugin
    try {
      const viewerLeaderboard = this.api.pluginLoader?.loadedPlugins?.get('viewer-leaderboard');
      if (!viewerLeaderboard || !viewerLeaderboard.instance) {
        return { valid: false, error: 'XP system not available' };
      }

      const profile = viewerLeaderboard.instance.db.getViewerProfile(username);
      if (!profile) {
        return { valid: false, error: 'User profile not found. You need to interact with the stream first!' };
      }

      if (profile.xp < betAmount) {
        return { 
          valid: false, 
          error: `Insufficient XP. You have ${profile.xp} XP but tried to bet ${betAmount} XP` 
        };
      }

      return { valid: true, currentXP: profile.xp };
    } catch (error) {
      this.logger.error(`Error validating bet: ${error.message}`);
      return { valid: false, error: 'Failed to validate bet' };
    }
  }

  /**
   * Deduct XP from user
   */
  async deductXP(username, amount) {
    try {
      const viewerLeaderboard = this.api.pluginLoader?.loadedPlugins?.get('viewer-leaderboard');
      if (!viewerLeaderboard || !viewerLeaderboard.instance) {
        throw new Error('XP system not available');
      }

      // Deduct XP by adding negative amount
      viewerLeaderboard.instance.db.addXP(username, -amount, 'plinko_bet', {
        bet: amount,
        source: 'game-engine-plinko'
      });

      return true;
    } catch (error) {
      this.logger.error(`Error deducting XP: ${error.message}`);
      return false;
    }
  }

  /**
   * Award XP to user (winnings)
   */
  async awardXP(username, amount, multiplier) {
    try {
      const viewerLeaderboard = this.api.pluginLoader?.loadedPlugins?.get('viewer-leaderboard');
      if (!viewerLeaderboard || !viewerLeaderboard.instance) {
        throw new Error('XP system not available');
      }

      viewerLeaderboard.instance.db.addXP(username, amount, 'plinko_win', {
        winnings: amount,
        multiplier: multiplier,
        source: 'game-engine-plinko'
      });

      return true;
    } catch (error) {
      this.logger.error(`Error awarding XP: ${error.message}`);
      return false;
    }
  }

  /**
   * Spawn a ball (from chat command or gift)
   * @returns {Object} { success: boolean, ballId?: string, error?: string }
   */
  async spawnBall(username, nickname, profilePictureUrl, betAmount, ballType = 'standard') {
    // Validate bet
    const validation = await this.validateBet(username, betAmount);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    // Deduct XP immediately
    const deducted = await this.deductXP(username, betAmount);
    if (!deducted) {
      return { success: false, error: 'Failed to deduct XP' };
    }

    // Generate unique ball ID
    const ballId = `ball_${Date.now()}_${this.ballIdCounter++}`;

    // Store ball data
    this.activeBalls.set(ballId, {
      username,
      nickname,
      profilePictureUrl,
      bet: betAmount,
      ballType,
      timestamp: Date.now()
    });

    // Get config for ball type modifiers
    const config = this.getConfig();
    let globalMultiplier = 1.0;
    
    if (config.giftMappings && config.giftMappings[ballType]) {
      globalMultiplier = config.giftMappings[ballType].multiplier || 1.0;
    }

    // Emit spawn event to overlay
    this.io.emit('plinko:spawn-ball', {
      ballId,
      username,
      nickname,
      profilePictureUrl,
      bet: betAmount,
      ballType,
      globalMultiplier,
      timestamp: Date.now()
    });

    this.logger.info(`🎰 Plinko ball spawned: ${username} bet ${betAmount} XP (ballId: ${ballId})`);

    return { success: true, ballId };
  }

  /**
   * Handle ball landing in a slot
   */
  async handleBallLanded(ballId, slotIndex) {
    const ballData = this.activeBalls.get(ballId);
    
    if (!ballData) {
      this.logger.warn(`Ball ${ballId} not found in active balls`);
      return { success: false, error: 'Ball not found' };
    }

    // Remove from active balls
    this.activeBalls.delete(ballId);

    // Get slot configuration
    const config = this.getConfig();
    if (!config || !config.slots || slotIndex < 0 || slotIndex >= config.slots.length) {
      this.logger.error(`Invalid slot index: ${slotIndex}`);
      return { success: false, error: 'Invalid slot' };
    }

    const slot = config.slots[slotIndex];
    const multiplier = slot.multiplier;

    // Calculate winnings
    // Note: Math.floor is used to ensure XP is always a whole number (no fractional XP)
    // This prevents precision issues and matches the XP system's integer-only behavior
    const profit = Math.floor(ballData.bet * multiplier);
    const netProfit = profit - ballData.bet;

    // Award XP if won
    if (profit > 0) {
      await this.awardXP(ballData.username, profit, multiplier);
    }

    // Record transaction
    this.db.recordPlinkoTransaction(
      ballData.username,
      ballData.bet,
      multiplier,
      netProfit,
      slotIndex
    );

    // Emit result event
    this.io.emit('plinko:ball-result', {
      ballId,
      username: ballData.username,
      nickname: ballData.nickname,
      bet: ballData.bet,
      slotIndex,
      multiplier,
      winnings: profit,
      netProfit
    });

    this.logger.info(
      `🎰 Plinko result: ${ballData.username} bet ${ballData.bet} XP, ` +
      `landed in slot ${slotIndex} (${multiplier}x), won ${profit} XP (net: ${netProfit >= 0 ? '+' : ''}${netProfit} XP)`
    );

    return {
      success: true,
      username: ballData.username,
      bet: ballData.bet,
      multiplier,
      winnings: profit,
      netProfit
    };
  }

  /**
   * Get Plinko statistics
   */
  getStats() {
    return this.db.getPlinkoStats();
  }

  /**
   * Get user's Plinko history
   */
  getUserHistory(username, limit = 10) {
    return this.db.getPlinkUserStats(username, limit);
  }

  /**
   * Clean up old balls (if they get stuck)
   */
  cleanupOldBalls(maxAgeMs = MAX_BALL_AGE_MS) {
    const now = Date.now();
    const oldBalls = [];
    
    for (const [ballId, ballData] of this.activeBalls.entries()) {
      if (now - ballData.timestamp > maxAgeMs) {
        oldBalls.push(ballId);
      }
    }

    for (const ballId of oldBalls) {
      const ballData = this.activeBalls.get(ballId);
      this.logger.warn(`Cleaning up stuck ball ${ballId} for user ${ballData.username}`);
      
      // Refund the bet (add it back)
      this.awardXP(ballData.username, ballData.bet, 1.0);
      
      // Remove from active balls
      this.activeBalls.delete(ballId);
    }

    if (oldBalls.length > 0) {
      this.logger.info(`🧹 Cleaned up ${oldBalls.length} stuck Plinko balls`);
    }
  }

  /**
   * Start periodic cleanup
   */
  startCleanupTimer() {
    // Run cleanup every 30 seconds
    this.cleanupTimer = setInterval(() => {
      this.cleanupOldBalls();
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
   * Destroy Plinko game
   */
  destroy() {
    this.stopCleanupTimer();
    this.activeBalls.clear();
    this.logger.info('🎰 Plinko game destroyed');
  }
}

module.exports = PlinkoGame;
