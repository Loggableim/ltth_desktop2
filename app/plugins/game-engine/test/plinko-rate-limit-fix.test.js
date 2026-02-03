/**
 * Plinko Rate Limit Memory Leak Fix Test
 * 
 * Validates the rate limit map memory leak fix:
 * - rateLimitMap is initialized in constructor
 * - Old rate limit entries are cleaned up
 */

const PlinkoGame = require('../games/plinko');

describe('Plinko Rate Limit Memory Leak Fix', () => {
  let plinkoGame;
  let mockApi;
  let mockDb;
  let mockLogger;
  let mockIo;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    mockIo = {
      emit: jest.fn()
    };

    mockApi = {
      getSocketIO: () => mockIo,
      log: jest.fn(),
      getDatabase: jest.fn()
    };

    // Mock database with minimal methods
    mockDb = {
      getPlinkoConfig: jest.fn().mockReturnValue({
        slots: [
          { multiplier: 1, label: '1x', color: '#FFF' }
        ],
        physicsSettings: {
          rateLimitMs: 800,
          maxSimultaneousBalls: 5,
          testModeEnabled: false
        }
      }),
      getAllPlinkoBoards: jest.fn().mockReturnValue([]),
      recordPlinkoTransaction: jest.fn(),
      awardXP: jest.fn()
    };

    plinkoGame = new PlinkoGame(mockApi, mockDb, mockLogger);
    plinkoGame.init();
  });

  afterEach(() => {
    if (plinkoGame.cleanupTimer) {
      clearInterval(plinkoGame.cleanupTimer);
    }
  });

  test('rateLimitMap should be initialized in constructor', () => {
    expect(plinkoGame.rateLimitMap).toBeDefined();
    expect(plinkoGame.rateLimitMap).toBeInstanceOf(Map);
    expect(plinkoGame.rateLimitMap.size).toBe(0);
  });

  test('rateLimitMap should store timestamps when rate limiting', () => {
    const username = 'testUser';
    const timestamp = Date.now();
    
    plinkoGame.rateLimitMap.set(username, timestamp);
    
    expect(plinkoGame.rateLimitMap.has(username)).toBe(true);
    expect(plinkoGame.rateLimitMap.get(username)).toBe(timestamp);
  });

  test('cleanupOldBalls should remove old rate limit entries', () => {
    const now = Date.now();
    const oldTimestamp = now - 120000; // 2 minutes ago
    const recentTimestamp = now - 30000; // 30 seconds ago
    
    // Add some rate limit entries
    plinkoGame.rateLimitMap.set('oldUser1', oldTimestamp);
    plinkoGame.rateLimitMap.set('oldUser2', oldTimestamp);
    plinkoGame.rateLimitMap.set('recentUser', recentTimestamp);
    
    expect(plinkoGame.rateLimitMap.size).toBe(3);
    
    // Run cleanup
    plinkoGame.cleanupOldBalls();
    
    // Old entries should be removed (> 60 seconds)
    expect(plinkoGame.rateLimitMap.has('oldUser1')).toBe(false);
    expect(plinkoGame.rateLimitMap.has('oldUser2')).toBe(false);
    // Recent entry should remain
    expect(plinkoGame.rateLimitMap.has('recentUser')).toBe(true);
    expect(plinkoGame.rateLimitMap.size).toBe(1);
  });

  test('cleanupOldBalls should handle empty rate limit map', () => {
    expect(plinkoGame.rateLimitMap.size).toBe(0);
    
    // Should not throw
    expect(() => {
      plinkoGame.cleanupOldBalls();
    }).not.toThrow();
    
    expect(plinkoGame.rateLimitMap.size).toBe(0);
  });

  test('cleanupOldBalls should only remove entries older than 1 minute', () => {
    const now = Date.now();
    
    // Add entries with various ages
    plinkoGame.rateLimitMap.set('user1', now - 120000); // 2 minutes (should be removed)
    plinkoGame.rateLimitMap.set('user2', now - 70000);  // 70 seconds (should be removed)
    plinkoGame.rateLimitMap.set('user3', now - 50000);  // 50 seconds (should stay)
    plinkoGame.rateLimitMap.set('user4', now - 10000);  // 10 seconds (should stay)
    plinkoGame.rateLimitMap.set('user5', now);          // now (should stay)
    
    expect(plinkoGame.rateLimitMap.size).toBe(5);
    
    plinkoGame.cleanupOldBalls();
    
    expect(plinkoGame.rateLimitMap.has('user1')).toBe(false);
    expect(plinkoGame.rateLimitMap.has('user2')).toBe(false);
    expect(plinkoGame.rateLimitMap.has('user3')).toBe(true);
    expect(plinkoGame.rateLimitMap.has('user4')).toBe(true);
    expect(plinkoGame.rateLimitMap.has('user5')).toBe(true);
    expect(plinkoGame.rateLimitMap.size).toBe(3);
  });

  test('cleanup should log debug message when rate limit entries are removed', () => {
    const now = Date.now();
    const oldTimestamp = now - 120000;
    
    plinkoGame.rateLimitMap.set('oldUser1', oldTimestamp);
    plinkoGame.rateLimitMap.set('oldUser2', oldTimestamp);
    
    plinkoGame.cleanupOldBalls();
    
    // Should have logged a debug message about cleanup
    expect(mockLogger.debug).toHaveBeenCalledWith(
      expect.stringContaining('🧹 Cleaned up 2 old rate limit entries')
    );
  });

  test('cleanup should not log when no old entries exist', () => {
    const now = Date.now();
    plinkoGame.rateLimitMap.set('recentUser', now);
    
    mockLogger.debug.mockClear();
    
    plinkoGame.cleanupOldBalls();
    
    // Should not have logged debug message since nothing was cleaned
    expect(mockLogger.debug).not.toHaveBeenCalledWith(
      expect.stringContaining('Cleaned up')
    );
  });

  test('memory leak scenario: many unique users over time', () => {
    const now = Date.now();
    
    // Simulate 100 users over extended period
    for (let i = 0; i < 100; i++) {
      const age = Math.random() * 180000; // Random age up to 3 minutes
      plinkoGame.rateLimitMap.set(`user${i}`, now - age);
    }
    
    expect(plinkoGame.rateLimitMap.size).toBe(100);
    
    // Run cleanup
    plinkoGame.cleanupOldBalls();
    
    // Should have removed entries older than 60 seconds
    // With random distribution, expect roughly 1/3 to remain (0-60s window)
    expect(plinkoGame.rateLimitMap.size).toBeLessThan(100);
    expect(plinkoGame.rateLimitMap.size).toBeGreaterThan(0);
  });
});
