/**
 * GCCE Integration and Manual Mode Tests
 */

const GameEnginePlugin = require('../main');

describe('Game Engine GCCE Integration', () => {
  let plugin;
  let mockApi;
  let mockSocketIO;
  let mockDb;
  let registeredCommands = [];

  beforeEach(() => {
    // Reset registered commands
    registeredCommands = [];
    
    // Mock Socket.IO
    mockSocketIO = {
      on: jest.fn(),
      emit: jest.fn()
    };

    // Mock Database
    mockDb = {
      prepare: jest.fn(() => ({
        run: jest.fn(),
        get: jest.fn(),
        all: jest.fn(() => [])
      }))
    };

    // Mock API
    mockApi = {
      log: jest.fn(),
      getSocketIO: () => mockSocketIO,
      getDatabase: () => mockDb,
      registerRoute: jest.fn(),
      registerSocket: jest.fn(),
      registerTikTokEvent: jest.fn(),
      getConfig: jest.fn(() => Promise.resolve(null)),
      setConfig: jest.fn(() => Promise.resolve()),
      emit: jest.fn(),
      pluginLoader: {
        loadedPlugins: new Map([
          ['gcce', {
            instance: {
              registerCommandsForPlugin: jest.fn((pluginId, commands) => {
                registeredCommands.push(...commands);
                return {
                  registered: commands.map(cmd => cmd.name),
                  failed: []
                };
              }),
              unregisterCommandsForPlugin: jest.fn()
            }
          }]
        ])
      }
    };

    plugin = new GameEnginePlugin(mockApi);
  });

  afterEach(() => {
    if (plugin) {
      // Clear any intervals before destroy
      if (plugin.gcceRetryInterval) {
        clearInterval(plugin.gcceRetryInterval);
        plugin.gcceRetryInterval = null;
      }
      
      // Clear active sessions to prevent endGame from being called
      plugin.activeSessions.clear();
      plugin.pendingChallenges.clear();
      
      // Ensure db has required methods for destroy
      plugin.db = {
        getSession: jest.fn(() => null),
        getTriggers: jest.fn(() => []),
        getGameConfig: jest.fn(() => null)
      };
      
      plugin.destroy();
    }
  });

  describe('GCCE Command Registration', () => {
    test('should register c4 command with GCCE', () => {
      // Setup mock database
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4)
      };
      
      plugin.registerGCCECommands();
      
      const c4Command = registeredCommands.find(cmd => cmd.name === 'c4');
      expect(c4Command).toBeDefined();
      expect(c4Command.description).toContain('Connect4');
      expect(c4Command.permission).toBe('all');
      expect(c4Command.category).toBe('Games');
    });

    test('should register c4start command with GCCE', () => {
      // Setup mock database
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4)
      };
      
      plugin.registerGCCECommands();
      
      const c4StartCommand = registeredCommands.find(cmd => cmd.name === 'c4start');
      expect(c4StartCommand).toBeDefined();
      expect(c4StartCommand.description).toContain('Start');
      expect(c4StartCommand.permission).toBe('all');
    });

    test('should handle missing GCCE gracefully', () => {
      mockApi.pluginLoader.loadedPlugins = new Map();
      
      expect(() => {
        plugin.registerGCCECommands();
      }).not.toThrow();
      
      // Check that it logged a debug message about GCCE not being available
      expect(mockApi.log).toHaveBeenCalledWith(
        expect.stringContaining('GCCE not available'),
        'debug'
      );
      
      // Check that gcceCommandsRegistered is false
      expect(plugin.gcceCommandsRegistered).toBe(false);
    });
  });

  describe('Connect4 Command Handler', () => {
    test('should handle valid move command', async () => {
      const context = {
        username: 'Test User',  // In GCCE, username is actually the nickname
        userId: 'test123',      // userId is the unique TikTok ID
        nickname: 'Test User'
      };
      const args = ['A'];
      
      // Mock active session - player1_username should match userId (unique ID)
      plugin.db = {
        getActiveSessionForPlayer: jest.fn(() => ({
          id: 1,
          game_type: 'connect4',
          player1_username: 'test123'
        }))
      };
      
      // Mock game instance - getCurrentPlayerInfo.username should match userId
      const mockGame = {
        currentPlayer: 1,
        getCurrentPlayerInfo: () => ({ username: 'test123' }),
        dropPiece: jest.fn(() => ({
          success: true,
          move: { player: 1, column: 0, row: 5, moveNumber: 1 },
          gameOver: false,
          nextPlayer: 2
        })),
        getState: jest.fn(() => ({ board: [] }))
      };
      plugin.activeSessions.set(1, mockGame);
      
      plugin.db.saveMove = jest.fn();
      
      const result = await plugin.handleConnect4Command(args, context);
      
      expect(result.success).toBe(true);
      expect(mockGame.dropPiece).toHaveBeenCalledWith('A');
    });

    test('should reject command without column', async () => {
      const context = {
        username: 'testuser',
        userId: 'test123'
      };
      const args = [];
      
      const result = await plugin.handleConnect4Command(args, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('column');
    });

    test('should reject invalid column', async () => {
      const context = {
        username: 'testuser',
        userId: 'test123'
      };
      const args = ['H']; // Invalid column
      
      const result = await plugin.handleConnect4Command(args, context);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('Invalid');
    });
  });

  describe('Connect4 Start Command Handler', () => {
    test('should start game when no active session', async () => {
      const context = {
        username: 'Test User',  // In GCCE, username is actually the nickname
        userId: 'test123',      // userId is the unique TikTok ID
        nickname: 'Test User'
      };
      const args = [];
      
      plugin.db = {
        getActiveSessionForPlayer: jest.fn(() => null),
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4)
      };
      
      plugin.handleGameStart = jest.fn();
      
      const result = await plugin.handleConnect4StartCommand(args, context);
      
      expect(result.success).toBe(true);
      expect(result.message).toContain('Game started');
      expect(plugin.handleGameStart).toHaveBeenCalledWith(
        'connect4',
        'test123',      // userId (unique TikTok ID)
        'Test User',    // nickname for display
        'command',
        '/c4start'
      );
    });

    test('should queue game when another game is already active', async () => {
      const context = {
        username: 'Test User',
        userId: 'test123'
      };
      const args = [];
      
      // Simulate active game
      plugin.activeSessions.set(1, {});
      
      // Setup mock database
      plugin.db = {
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4)
      };
      
      plugin.handleGameStart = jest.fn();
      
      const result = await plugin.handleConnect4StartCommand(args, context);
      
      // When there's an active game, the command should queue and return success
      expect(result.success).toBe(true);
      expect(result.message).toContain('queued');
      expect(plugin.handleGameStart).toHaveBeenCalled();
    });
  });

  describe('Manual Mode', () => {
    beforeEach(() => {
      plugin.db = {
        createSession: jest.fn(() => 1),
        addPlayer2: jest.fn(),
        getGameConfig: jest.fn(() => plugin.defaultConfigs.connect4),
        getSession: jest.fn(() => ({
          id: 1,
          game_type: 'connect4',
          player1_username: 'Player1',
          player2_username: 'Player2'
        })),
        saveMove: jest.fn()
      };
    });

    test('should start manual game', () => {
      const sessionId = plugin.startManualGame('connect4', 'Player1', 'Player2', 'manual');
      
      expect(sessionId).toBe(1);
      expect(plugin.activeSessions.has(1)).toBe(true);
      expect(mockSocketIO.emit).toHaveBeenCalledWith(
        'game-engine:game-started',
        expect.objectContaining({
          sessionId: 1,
          gameType: 'connect4',
          manual: true
        })
      );
    });

    test('should make manual move', () => {
      // Start manual game first
      const sessionId = plugin.startManualGame('connect4', 'Player1', 'Player2', 'manual');
      
      const result = plugin.makeManualMove(sessionId, 1, 'A');
      
      expect(result.success).toBe(true);
      expect(mockSocketIO.emit).toHaveBeenCalledWith(
        'game-engine:move-made',
        expect.objectContaining({
          sessionId,
          manual: true
        })
      );
    });

    test('should reject manual move for invalid session', () => {
      const result = plugin.makeManualMove(999, 1, 'A');
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    test('should support bot opponent', () => {
      const sessionId = plugin.startManualGame('connect4', 'Player1', 'Bot', 'bot');
      
      expect(sessionId).toBe(1);
      expect(plugin.db.addPlayer2).toHaveBeenCalledWith(1, 'Bot', 'bot');
    });
  });

  describe('Cleanup', () => {
    test('should unregister GCCE commands on destroy', async () => {
      plugin.registerGCCECommands();
      const gcceInstance = mockApi.pluginLoader.loadedPlugins.get('gcce').instance;
      
      await plugin.destroy();
      
      expect(gcceInstance.unregisterCommandsForPlugin).toHaveBeenCalledWith('game-engine');
    });
  });

  describe('Customizable Chat Command', () => {
    test('should use custom chat command from config', () => {
      // Setup mock database with custom chat command
      plugin.db = {
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.connect4,
          chatCommand: 'start4'
        }))
      };
      
      plugin.registerGCCECommands();
      
      // Check that custom command is registered instead of default
      const customCommand = registeredCommands.find(cmd => cmd.name === 'start4');
      expect(customCommand).toBeDefined();
      expect(customCommand.description).toContain('Start');
      expect(customCommand.syntax).toBe('/start4');
    });

    test('should default to c4start when no custom command configured', () => {
      // Setup mock database without custom chat command
      plugin.db = {
        getGameConfig: jest.fn(() => null)
      };
      
      plugin.registerGCCECommands();
      
      // Check that default command is used
      const defaultCommand = registeredCommands.find(cmd => cmd.name === 'c4start');
      expect(defaultCommand).toBeDefined();
      expect(defaultCommand.syntax).toBe('/c4start');
    });

    test('should fallback to c4start if chatCommand is empty', () => {
      // Setup mock database with empty chat command
      plugin.db = {
        getGameConfig: jest.fn(() => ({
          ...plugin.defaultConfigs.connect4,
          chatCommand: ''
        }))
      };
      
      plugin.registerGCCECommands();
      
      // Check that default command is used
      const defaultCommand = registeredCommands.find(cmd => cmd.name === 'c4start');
      expect(defaultCommand).toBeDefined();
    });
  });
});
