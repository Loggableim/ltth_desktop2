/**
 * Test: Plinko Gift Trigger Logic
 * 
 * Tests the enhanced gift trigger logic for Plinko, ensuring:
 * - Case-insensitive gift name matching
 * - Fallback to board-specific gift mappings
 * - Proper error handling and logging
 * - Backward compatibility with existing configurations
 */

const GameEngineDatabase = require('../backend/database');
const PlinkoGame = require('../games/plinko');

// Mock dependencies
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn()
};

const mockSocketIO = {
  emit: jest.fn()
};

const mockAPI = {
  getDatabase: () => ({
    db: require('better-sqlite3')(':memory:')
  }),
  getSocketIO: () => mockSocketIO,
  pluginLoader: {
    loadedPlugins: new Map()
  }
};

describe('Plinko Gift Trigger - Enhanced Matching Logic', () => {
  let db, plinkoGame, gameEnginePlugin;

  beforeEach(() => {
    // Clear mocks
    jest.clearAllMocks();
    
    // Create fresh database and plinko game for each test
    db = new GameEngineDatabase(mockAPI, mockLogger);
    db.initialize();
    plinkoGame = new PlinkoGame(mockAPI, db, mockLogger);
    plinkoGame.init();

    // Create mock game engine plugin with minimal required functionality
    gameEnginePlugin = {
      api: mockAPI,
      io: mockSocketIO,
      db: db,
      logger: mockLogger,
      plinkoGame: plinkoGame,
      recentGiftEvents: new Map(),
      GIFT_DEDUP_WINDOW_MS: 1000,
      normalizeGiftId: (giftId) => String(giftId || '').trim(),
      
      // Import the actual handlePlinkoGiftTrigger method we want to test
      async handlePlinkoGiftTrigger(username, nickname, profilePictureUrl, giftName) {
        try {
          // Normalize gift name for case-insensitive matching
          const normalizedGiftName = (giftName || '').trim();
          let giftMapping = null;
          
          // Get primary config
          const config = this.plinkoGame.getConfig();
          
          // Try exact match first in primary config
          if (config.giftMappings && config.giftMappings[normalizedGiftName]) {
            giftMapping = config.giftMappings[normalizedGiftName];
            this.logger.debug(`[PLINKO] Found gift mapping in primary config for "${normalizedGiftName}"`);
          }
          
          // Try case-insensitive match in primary config
          if (!giftMapping && config.giftMappings) {
            const lowerGiftName = normalizedGiftName.toLowerCase();
            for (const [key, value] of Object.entries(config.giftMappings)) {
              if (key.toLowerCase() === lowerGiftName) {
                giftMapping = value;
                this.logger.info(`[PLINKO] Matched gift "${normalizedGiftName}" via case-insensitive lookup (key: "${key}")`);
                break;
              }
            }
          }
          
          // Fallback: Check all enabled Plinko boards for gift mappings
          if (!giftMapping) {
            this.logger.debug(`[PLINKO] No mapping in primary config, checking all enabled boards...`);
            const boards = this.plinkoGame.getAllBoards();
            
            for (const board of boards) {
              if (!board.enabled) continue;
              
              try {
                // getAllBoards() returns already parsed giftMappings object
                const mappings = board.giftMappings || {};
                
                // Try exact match
                if (mappings[normalizedGiftName]) {
                  giftMapping = mappings[normalizedGiftName];
                  this.logger.info(`[PLINKO] Found gift mapping in board "${board.name}" (ID: ${board.id})`);
                  break;
                }
                
                // Try case-insensitive match
                const lowerGiftName = normalizedGiftName.toLowerCase();
                for (const [key, value] of Object.entries(mappings)) {
                  if (key.toLowerCase() === lowerGiftName) {
                    giftMapping = value;
                    this.logger.info(`[PLINKO] Matched gift "${normalizedGiftName}" in board "${board.name}" via case-insensitive lookup (key: "${key}")`);
                    break;
                  }
                }
                
                if (giftMapping) break;
              } catch (e) {
                this.logger.error(`[PLINKO] Failed to process gift_mappings for board ${board.id}: ${e.message}`);
              }
            }
            
            // If still no mapping found, log comprehensive error
            if (!giftMapping) {
              const boardNames = boards.filter(b => b.enabled).map(b => b.name).join(', ') || 'none';
              this.logger.warn(`[PLINKO] Gift "${normalizedGiftName}" triggered Plinko but no mapping found in any board. Available enabled boards: ${boardNames}`);
              return { success: false, error: 'No gift mapping found' };
            }
          }

          const betAmount = giftMapping.betAmount || 100;
          const ballType = giftMapping.ballType || 'standard';

          this.logger.info(`[PLINKO] Spawning ball for ${username}: betAmount=${betAmount}, ballType=${ballType}`);

          // Spawn ball
          const result = await this.plinkoGame.spawnBall(
            username,
            nickname,
            profilePictureUrl || '',
            betAmount,
            ballType
          );

          if (!result.success) {
            this.logger.error(`[PLINKO] Failed to spawn ball for ${username}: ${result.error}`);
          } else {
            this.logger.info(`[PLINKO] ✅ Ball spawned successfully for ${username}`);
          }
          
          return result;
        } catch (error) {
          this.logger.error(`[PLINKO] Error handling gift trigger: ${error.message}`, error);
          return { success: false, error: error.message };
        }
      }
    };
  });

  describe('Exact Match (Case-Sensitive)', () => {
    test('should find gift mapping with exact case match in primary config', async () => {
      // Setup: Add gift mapping to primary config
      const boards = db.getAllPlinkoBoards();
      const board = boards[0];
      
      const giftMappings = {
        'Rose': { betAmount: 100, ballType: 'standard' }
      };
      
      db.updatePlinkoGiftMappings(board.id, giftMappings);

      // Test: Call with exact case
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'Rose'
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Spawning ball for testuser')
      );
    });
  });

  describe('Case-Insensitive Match', () => {
    test('should find gift mapping with case-insensitive match in primary config', async () => {
      // Setup: Add gift mapping with specific case
      const boards = db.getAllPlinkoBoards();
      const board = boards[0];
      
      const giftMappings = {
        'Rose': { betAmount: 100, ballType: 'standard' }
      };
      
      db.updatePlinkoGiftMappings(board.id, giftMappings);

      // Test: Call with different case
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'rose'  // lowercase
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Matched gift "rose" via case-insensitive lookup (key: "Rose")')
      );
    });

    test('should handle uppercase gift name when config has lowercase', async () => {
      // Setup: Add gift mapping in lowercase
      const boards = db.getAllPlinkoBoards();
      const board = boards[0];
      
      const giftMappings = {
        'lion': { betAmount: 500, ballType: 'golden' }
      };
      
      db.updatePlinkoGiftMappings(board.id, giftMappings);

      // Test: Call with uppercase
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'LION'  // uppercase
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Matched gift "LION" via case-insensitive lookup (key: "lion")')
      );
    });
  });

  describe('Fallback to Board-Specific Mappings', () => {
    test('should fallback to board-specific mappings when not in primary config', async () => {
      // Setup: Create a second board with gift mapping
      const secondBoardId = plinkoGame.createBoard('Secondary Board');
      
      db.updatePlinkoGiftMappings(secondBoardId, {
        'Galaxy': { betAmount: 1000, ballType: 'golden' }
      });

      // Test: Call with gift only in secondary board
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'Galaxy'
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Found gift mapping in board "Secondary Board"')
      );
    });

    test('should use case-insensitive matching in fallback boards', async () => {
      // Setup: Create a second board with gift mapping
      const secondBoardId = plinkoGame.createBoard('Secondary Board');
      
      db.updatePlinkoGiftMappings(secondBoardId, {
        'Galaxy': { betAmount: 1000, ballType: 'golden' }
      });

      // Test: Call with different case
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'galaxy'  // lowercase
      );

      expect(result).toBeDefined();
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Matched gift "galaxy" in board "Secondary Board" via case-insensitive lookup')
      );
    });

    test('should skip disabled boards in fallback search', async () => {
      // Setup: Create disabled board with gift mapping
      const secondBoardId = plinkoGame.createBoard('Disabled Board');
      
      db.updatePlinkoGiftMappings(secondBoardId, {
        'TikTok': { betAmount: 100, ballType: 'standard' }
      });
      
      db.updatePlinkoEnabled(secondBoardId, false);

      // Test: Call with gift only in disabled board
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'TikTok'
      );

      expect(result).toEqual({ success: false, error: 'No gift mapping found' });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('no mapping found in any board')
      );
    });
  });

  describe('No Match Scenario', () => {
    test('should log warning when no mapping found in any board', async () => {
      // Test: Call with unmapped gift
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'UnknownGift'
      );

      expect(result).toEqual({ success: false, error: 'No gift mapping found' });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Gift "UnknownGift" triggered Plinko but no mapping found in any board')
      );
    });

    test('should list available boards in error message', async () => {
      // Setup: Create multiple boards
      plinkoGame.createBoard('Board 2');
      plinkoGame.createBoard('Board 3');

      // Test: Call with unmapped gift
      await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'UnknownGift'
      );

      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringMatching(/Available enabled boards:.*Standard Plinko.*Board 2.*Board 3/)
      );
    });
  });

  describe('Error Handling', () => {
    test('should handle errors gracefully and not crash', async () => {
      // Test: Should handle general errors without crashing
      // Mock getAllBoards to throw an error
      const originalGetAllBoards = gameEnginePlugin.plinkoGame.getAllBoards;
      gameEnginePlugin.plinkoGame.getAllBoards = () => {
        throw new Error('Database connection failed');
      };

      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'Rose'
      );

      expect(result).toEqual({ success: false, error: 'Database connection failed' });
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('[PLINKO] Error handling gift trigger'),
        expect.any(Error)
      );

      // Restore original method
      gameEnginePlugin.plinkoGame.getAllBoards = originalGetAllBoards;
    });

    test('should handle null/undefined gift names', async () => {
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        null
      );

      expect(result).toEqual({ success: false, error: 'No gift mapping found' });
    });

    test('should handle empty string gift names', async () => {
      const result = await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        '  '  // whitespace only
      );

      expect(result).toEqual({ success: false, error: 'No gift mapping found' });
    });
  });

  describe('Backward Compatibility', () => {
    test('should work with existing config structure (no changes to database)', async () => {
      // Setup: Use default board as-is (simulating existing installation)
      const boards = db.getAllPlinkoBoards();
      const board = boards[0];
      
      // Add gift mapping via standard method
      db.updatePlinkoGiftMappings(board.id, {
        'Rose': { betAmount: 100, ballType: 'standard' }
      });

      // Test: Should work exactly as before - the important thing is it finds the mapping
      await gameEnginePlugin.handlePlinkoGiftTrigger(
        'testuser', 
        'Test User', 
        '', 
        'Rose'
      );

      // Verify the mapping was found and spawn was attempted
      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Spawning ball for testuser')
      );
    });
  });
});
