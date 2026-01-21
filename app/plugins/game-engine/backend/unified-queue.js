/**
 * Unified Queue Manager for Game Engine
 * 
 * Manages a single FIFO queue for Plinko, Wheel, Connect4, and Chess games.
 * Ensures proper ordering and prevents conflicts when multiple games are triggered.
 */

class UnifiedQueueManager {
  constructor(logger, io) {
    this.logger = logger;
    this.io = io;
    
    // Unified queue for all games
    // Format: { type: 'plinko'|'wheel'|'connect4'|'chess', data: {...}, timestamp: number }
    this.queue = [];
    
    // Is any game currently processing?
    this.isProcessing = false;
    
    // Current active item
    this.currentItem = null;
    
    // Game references (set by games themselves)
    this.plinkoGame = null;
    this.wheelGame = null;
    this.gameEnginePlugin = null; // Reference to main plugin for Connect4/Chess
    
    // Processing timeout (for safety)
    this.processingTimeout = null;
    this.MAX_PROCESSING_TIME = 180000; // 3 minutes max per item
  }

  /**
   * Set game references
   */
  setPlinkoGame(plinkoGame) {
    this.plinkoGame = plinkoGame;
  }

  setWheelGame(wheelGame) {
    this.wheelGame = wheelGame;
  }

  setGameEnginePlugin(gameEnginePlugin) {
    this.gameEnginePlugin = gameEnginePlugin;
  }

  /**
   * Add Plinko drop to queue
   * @param {Object} dropData - Plinko drop data
   * @returns {Object} { queued: boolean, position: number }
   */
  queuePlinko(dropData) {
    const item = {
      type: 'plinko',
      data: dropData,
      timestamp: Date.now()
    };
    
    this.queue.push(item);
    const position = this.queue.length;
    
    this.logger.info(`🎰 [UNIFIED QUEUE] Plinko queued for ${dropData.username} (position: ${position})`);
    
    // Emit queue event
    this.io.emit('unified-queue:plinko-queued', {
      position,
      username: dropData.username,
      nickname: this.getDisplayName(dropData),
      batchId: dropData.batchId,
      queueLength: this.queue.length
    });
    
    // Try to process if not already processing
    this.processNext();
    
    return { queued: true, position };
  }

  /**
   * Add Wheel spin to queue
   * @param {Object} spinData - Wheel spin data
   * @returns {Object} { queued: boolean, position: number }
   */
  queueWheel(spinData) {
    const item = {
      type: 'wheel',
      data: spinData,
      timestamp: Date.now()
    };
    
    this.queue.push(item);
    const position = this.queue.length;
    
    this.logger.info(`🎡 [UNIFIED QUEUE] Wheel queued for ${spinData.username} (position: ${position})`);
    
    // Emit queue event
    this.io.emit('unified-queue:wheel-queued', {
      position,
      username: spinData.username,
      nickname: this.getDisplayName(spinData),
      spinId: spinData.spinId,
      queueLength: this.queue.length
    });
    
    // Try to process if not already processing
    this.processNext();
    
    return { queued: true, position };
  }

  /**
   * Add Connect4 game to queue
   * @param {Object} gameData - Connect4 game data
   * @returns {Object} { queued: boolean, position: number }
   */
  queueConnect4(gameData) {
    const item = {
      type: 'connect4',
      data: gameData,
      timestamp: Date.now()
    };
    
    this.queue.push(item);
    const position = this.queue.length;
    
    this.logger.info(`🎮 [UNIFIED QUEUE] Connect4 queued for ${gameData.viewerUsername} (position: ${position})`);
    
    // Emit queue event
    this.io.emit('unified-queue:connect4-queued', {
      position,
      gameType: 'connect4',
      username: gameData.viewerUsername,
      nickname: gameData.viewerNickname,
      queueLength: this.queue.length
    });
    
    // Try to process if not already processing
    this.processNext();
    
    return { queued: true, position };
  }

  /**
   * Add Chess game to queue
   * @param {Object} gameData - Chess game data
   * @returns {Object} { queued: boolean, position: number }
   */
  queueChess(gameData) {
    const item = {
      type: 'chess',
      data: gameData,
      timestamp: Date.now()
    };
    
    this.queue.push(item);
    const position = this.queue.length;
    
    this.logger.info(`♟️ [UNIFIED QUEUE] Chess queued for ${gameData.viewerUsername} (position: ${position})`);
    
    // Emit queue event
    this.io.emit('unified-queue:chess-queued', {
      position,
      gameType: 'chess',
      username: gameData.viewerUsername,
      nickname: gameData.viewerNickname,
      queueLength: this.queue.length
    });
    
    // Try to process if not already processing
    this.processNext();
    
    return { queued: true, position };
  }

  /**
   * Check if queue should accept new items (i.e., is something currently active?)
   * @returns {boolean} True if items should be queued
   */
  shouldQueue() {
    return this.isProcessing || this.queue.length > 0;
  }

  /**
   * Get display name for queued item.
   */
  getDisplayName(data) {
    return data?.nickname || data?.viewerNickname || data?.username || data?.viewerUsername;
  }

  /**
   * Extract username from queued item data
   */
  extractUsername(data) {
    return data?.username || data?.viewerUsername;
  }

  /**
   * Get current queue status
   * @returns {Object} Queue status
   */
  getStatus() {
    return {
      isProcessing: this.isProcessing,
      queueLength: this.queue.length,
      currentItem: this.currentItem ? {
        type: this.currentItem.type,
        username: this.extractUsername(this.currentItem.data),
        nickname: this.getDisplayName(this.currentItem.data),
        timestamp: this.currentItem.timestamp,
        spinId: this.currentItem.data.spinId,
        batchId: this.currentItem.data.batchId,
        gameType: this.currentItem.data.gameType
      } : null,
      queue: this.queue.map((item, index) => ({
        position: index + 1,
        type: item.type,
        username: this.extractUsername(item.data),
        nickname: this.getDisplayName(item.data),
        timestamp: item.timestamp,
        spinId: item.data.spinId,
        batchId: item.data.batchId,
        gameType: item.data.gameType
      }))
    };
  }

  /**
   * Process next item in queue
   */
  async processNext() {
    // Already processing or queue empty
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    // Get next item (FIFO)
    const item = this.queue.shift();
    if (!item) {
      return;
    }

    this.isProcessing = true;
    this.currentItem = item;

    this.logger.info(`🎮 [UNIFIED QUEUE] Processing ${item.type} for ${item.data.username} (${this.queue.length} remaining)`);

    // Set safety timeout
    this.processingTimeout = setTimeout(() => {
      this.logger.warn(`⚠️ [UNIFIED QUEUE] Processing timeout for ${item.type}, forcing completion`);
      this.completeProcessing();
    }, this.MAX_PROCESSING_TIME);

    try {
      if (item.type === 'plinko') {
        await this.processPlinkoItem(item.data);
      } else if (item.type === 'wheel') {
        await this.processWheelItem(item.data);
      } else if (item.type === 'connect4') {
        await this.processConnect4Item(item.data);
      } else if (item.type === 'chess') {
        await this.processChessItem(item.data);
      }
    } catch (error) {
      this.logger.error(`❌ [UNIFIED QUEUE] Error processing ${item.type}: ${error.message}`);
      // Don't call completeProcessing here - let games handle their own completion
    }
  }

  /**
   * Process Plinko item
   */
  async processPlinkoItem(dropData) {
    if (!this.plinkoGame) {
      this.logger.error('❌ [UNIFIED QUEUE] Plinko game not set');
      this.completeProcessing();
      return;
    }

    try {
      await this.plinkoGame.spawnBalls(
        dropData.username,
        dropData.nickname,
        dropData.profilePictureUrl,
        dropData.betAmount,
        dropData.count,
        { 
          batchId: dropData.batchId, 
          preferredColor: dropData.preferredColor,
          forceStart: true // Skip queue check since we're already in unified queue
        }
      );
      
      // Note: completeProcessing() will be called by Plinko when batch is complete
      // or after a timeout
    } catch (error) {
      this.logger.error(`❌ [UNIFIED QUEUE] Error spawning Plinko balls: ${error.message}`);
      this.completeProcessing();
    }
  }

  /**
   * Process Wheel item
   */
  async processWheelItem(spinData) {
    if (!this.wheelGame) {
      this.logger.error('❌ [UNIFIED QUEUE] Wheel game not set');
      this.completeProcessing();
      return;
    }

    try {
      await this.wheelGame.startSpin(spinData);
      
      // Note: completeProcessing() will be called by Wheel when spin is complete
    } catch (error) {
      this.logger.error(`❌ [UNIFIED QUEUE] Error starting Wheel spin: ${error.message}`);
      this.completeProcessing();
    }
  }

  /**
   * Process Connect4 game item
   */
  async processConnect4Item(gameData) {
    if (!this.gameEnginePlugin) {
      this.logger.error('❌ [UNIFIED QUEUE] Game Engine plugin not set');
      this.completeProcessing();
      return;
    }

    try {
      // Start Connect4 game without queuing (since we're already in the queue)
      await this.gameEnginePlugin.startGameFromQueue(
        'connect4',
        gameData.viewerUsername,
        gameData.viewerNickname,
        gameData.triggerType,
        gameData.triggerValue,
        gameData.giftPictureUrl
      );
      
      // Note: completeProcessing() will be called by game engine when game ends
    } catch (error) {
      this.logger.error(`❌ [UNIFIED QUEUE] Error starting Connect4 game: ${error.message}`);
      this.completeProcessing();
    }
  }

  /**
   * Process Chess game item
   */
  async processChessItem(gameData) {
    if (!this.gameEnginePlugin) {
      this.logger.error('❌ [UNIFIED QUEUE] Game Engine plugin not set');
      this.completeProcessing();
      return;
    }

    try {
      // Start Chess game without queuing (since we're already in the queue)
      await this.gameEnginePlugin.startGameFromQueue(
        'chess',
        gameData.viewerUsername,
        gameData.viewerNickname,
        gameData.triggerType,
        gameData.triggerValue,
        gameData.giftPictureUrl
      );
      
      // Note: completeProcessing() will be called by game engine when game ends
    } catch (error) {
      this.logger.error(`❌ [UNIFIED QUEUE] Error starting Chess game: ${error.message}`);
      this.completeProcessing();
    }
  }

  /**
   * Mark current processing as complete and process next item
   * Should be called by games when they finish their operation
   */
  completeProcessing() {
    // Clear timeout
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }

    const wasProcessing = this.isProcessing;
    this.isProcessing = false;
    this.currentItem = null;

    if (wasProcessing) {
      this.logger.debug(`✅ [UNIFIED QUEUE] Processing complete, ${this.queue.length} items remaining`);
      
      // Emit status update
      this.io.emit('unified-queue:status', this.getStatus());
    }

    // Process next item if queue has items
    if (this.queue.length > 0) {
      // Small delay to prevent rapid-fire processing
      setTimeout(() => this.processNext(), 250);
    }
  }

  /**
   * Clear the queue
   */
  clearQueue() {
    const clearedCount = this.queue.length;
    this.queue = [];
    
    if (clearedCount > 0) {
      this.logger.info(`🧹 [UNIFIED QUEUE] Cleared ${clearedCount} items from queue`);
      this.io.emit('unified-queue:cleared', { count: clearedCount });
    }
  }

  /**
   * Destroy queue manager
   */
  destroy() {
    if (this.processingTimeout) {
      clearTimeout(this.processingTimeout);
      this.processingTimeout = null;
    }
    
    this.clearQueue();
    this.isProcessing = false;
    this.currentItem = null;
    this.plinkoGame = null;
    this.wheelGame = null;
  }
}

module.exports = UnifiedQueueManager;
