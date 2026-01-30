/**
 * Wheel Queue Double-Counting Bug Test
 * 
 * Tests to verify that the wheel queue logic does not double-count gifts
 * when both unified queue and legacy queue are available.
 * 
 * Bug: When unified queue exists but shouldQueue() returns false (first spin),
 * both queue paths can execute, resulting in double-counting.
 */

describe('Wheel Queue Double-Counting Bug', () => {
  let wheelGame;
  let mockApi;
  let mockDb;
  let mockLogger;
  let mockIo;
  let mockUnifiedQueue;
  let emittedEvents;
  let queuedSpins;

  beforeEach(() => {
    // Reset tracking arrays
    emittedEvents = [];
    queuedSpins = [];

    // Mock Socket.io
    mockIo = {
      emit: jest.fn((event, data) => {
        emittedEvents.push({ event, data });
      })
    };

    // Mock logger
    mockLogger = {
      info: jest.fn(),
      debug: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };

    // Mock unified queue
    mockUnifiedQueue = {
      shouldQueue: jest.fn(),
      queueWheel: jest.fn((spinData) => {
        queuedSpins.push({ type: 'unified', spinData });
        return { queued: true, position: queuedSpins.filter(s => s.type === 'unified').length };
      }),
      isProcessing: false,
      queue: []
    };

    // Mock database
    mockDb = {
      getWheelConfig: jest.fn((wheelId) => ({
        id: 1,
        name: 'Test Wheel',
        enabled: true,
        segments: [
          { text: '100 XP', color: '#FF6B6B', weight: 10, isNiete: false },
          { text: '200 XP', color: '#FFA500', weight: 8, isNiete: false },
          { text: 'Niete', color: '#607D8B', weight: 15, isNiete: true }
        ]
      }))
    };

    // Mock API
    mockApi = {
      getSocketIO: jest.fn(() => mockIo),
      getDatabase: jest.fn(() => mockDb)
    };

    // Create WheelGame instance
    const WheelGame = require('../games/wheel.js');
    wheelGame = new WheelGame(mockApi, mockDb, mockLogger);
    wheelGame.init();
    
    // Set unified queue
    wheelGame.setUnifiedQueue(mockUnifiedQueue);
  });

  describe('Bug Scenario: First Spin with Unified Queue', () => {
    test('should NOT double-count when unified queue exists but shouldQueue() returns false', async () => {
      // Setup: First spin, queue empty, unified queue available
      wheelGame.isSpinning = false;
      mockUnifiedQueue.shouldQueue.mockReturnValue(false);

      // Mock startSpin to prevent actual spinning
      wheelGame.startSpin = jest.fn(async (spinData) => {
        return { success: true, spinId: spinData.spinId, queued: false };
      });

      // Trigger a spin
      const result = await wheelGame.triggerSpin('testuser', 'Test User', null, 'Rose', 1);

      // CRITICAL: Should NOT be queued at all - should start immediately
      expect(result.success).toBe(true);
      expect(result.queued).toBe(false);

      // Should call startSpin directly (not queue)
      expect(wheelGame.startSpin).toHaveBeenCalledTimes(1);

      // Should NOT add to unified queue
      expect(mockUnifiedQueue.queueWheel).not.toHaveBeenCalled();

      // Should NOT add to legacy queue
      expect(wheelGame.spinQueue.length).toBe(0);

      // Should have exactly ONE active spin
      expect(wheelGame.activeSpins.size).toBe(1);

      // Verify only ONE log entry (immediate spin, not queued)
      const queueLogs = mockLogger.info.mock.calls.filter(call => 
        call[0].includes('🎡 Wheel spin queued')
      );
      expect(queueLogs.length).toBe(0); // No queue logs for immediate spin
    });

    test('should use unified queue when shouldQueue() returns true', async () => {
      // Setup: Unified queue says "should queue"
      wheelGame.isSpinning = false;
      mockUnifiedQueue.shouldQueue.mockReturnValue(true);

      // Trigger a spin
      const result = await wheelGame.triggerSpin('testuser', 'Test User', null, 'Rose', 1);

      // Should be queued
      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);
      expect(result.position).toBe(1);

      // Should add to unified queue ONLY
      expect(mockUnifiedQueue.queueWheel).toHaveBeenCalledTimes(1);

      // Should NOT add to legacy queue
      expect(wheelGame.spinQueue.length).toBe(0);

      // Should have exactly ONE log entry (unified queue)
      const unifiedQueueLogs = mockLogger.info.mock.calls.filter(call => 
        call[0].includes('🎡 Wheel spin queued via unified queue')
      );
      expect(unifiedQueueLogs.length).toBe(1);

      const legacyQueueLogs = mockLogger.info.mock.calls.filter(call => 
        call[0].includes('🎡 Wheel spin queued (legacy):')
      );
      expect(legacyQueueLogs.length).toBe(0);
    });

    test('should use unified queue when isSpinning is true', async () => {
      // Setup: Currently spinning
      wheelGame.isSpinning = true;
      mockUnifiedQueue.shouldQueue.mockReturnValue(false); // Even if shouldQueue is false

      // Trigger a spin
      const result = await wheelGame.triggerSpin('testuser', 'Test User', null, 'Rose', 1);

      // Should be queued
      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);

      // Should add to unified queue ONLY
      expect(mockUnifiedQueue.queueWheel).toHaveBeenCalledTimes(1);

      // Should NOT add to legacy queue
      expect(wheelGame.spinQueue.length).toBe(0);
    });
  });

  describe('Legacy Queue Fallback (No Unified Queue)', () => {
    beforeEach(() => {
      // Remove unified queue
      wheelGame.unifiedQueue = null;
    });

    test('should use legacy queue when spinning and no unified queue available', async () => {
      // Setup: Currently spinning, no unified queue
      wheelGame.isSpinning = true;

      // Trigger a spin
      const result = await wheelGame.triggerSpin('testuser', 'Test User', null, 'Rose', 1);

      // Should be queued
      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);
      expect(result.position).toBe(1);

      // Should add to legacy queue
      expect(wheelGame.spinQueue.length).toBe(1);

      // Should emit legacy queue event
      const queueEvents = emittedEvents.filter(e => e.event === 'wheel:spin-queued');
      expect(queueEvents.length).toBe(1);

      // Should have legacy queue log
      const legacyQueueLogs = mockLogger.info.mock.calls.filter(call => 
        call[0].includes('🎡 Wheel spin queued (legacy):')
      );
      expect(legacyQueueLogs.length).toBe(1);
    });

    test('should start immediately when not spinning and no unified queue', async () => {
      // Setup: Not spinning, no unified queue, empty queue
      wheelGame.isSpinning = false;

      // Mock startSpin
      wheelGame.startSpin = jest.fn(async (spinData) => {
        return { success: true, spinId: spinData.spinId, queued: false };
      });

      // Trigger a spin
      const result = await wheelGame.triggerSpin('testuser', 'Test User', null, 'Rose', 1);

      // Should start immediately
      expect(result.success).toBe(true);
      expect(result.queued).toBe(false);

      // Should call startSpin
      expect(wheelGame.startSpin).toHaveBeenCalledTimes(1);

      // Should NOT add to legacy queue
      expect(wheelGame.spinQueue.length).toBe(0);

      // Should NOT emit queue event
      const queueEvents = emittedEvents.filter(e => e.event === 'wheel:spin-queued');
      expect(queueEvents.length).toBe(0);
    });

    test('should queue in legacy queue when queue already has items', async () => {
      // Setup: Not spinning, but queue has items
      wheelGame.isSpinning = false;
      wheelGame.spinQueue.push({ spinId: 'existing_spin', username: 'otheruser' });

      // Trigger a spin
      const result = await wheelGame.triggerSpin('testuser', 'Test User', null, 'Rose', 1);

      // After fix: Should be queued (position 2) to maintain FIFO order
      expect(result.success).toBe(true);
      expect(result.queued).toBe(true);
      expect(result.position).toBe(2);

      // Should have 2 items in queue
      expect(wheelGame.spinQueue.length).toBe(2);

      // Should emit legacy queue event
      const queueEvents = emittedEvents.filter(e => e.event === 'wheel:spin-queued');
      expect(queueEvents.length).toBe(1);
    });
  });

  describe('Multiple Rapid Spins', () => {
    test('should queue all spins in order when using unified queue', async () => {
      // Setup: First spin starts, subsequent spins should queue
      wheelGame.isSpinning = false;
      mockUnifiedQueue.shouldQueue
        .mockReturnValueOnce(false) // First spin: don't queue
        .mockReturnValue(true);      // Subsequent spins: queue

      // Mock startSpin for first spin
      wheelGame.startSpin = jest.fn(async (spinData) => {
        wheelGame.isSpinning = true; // Simulate spinning state
        return { success: true, spinId: spinData.spinId, queued: false };
      });

      // Trigger 3 spins rapidly
      const result1 = await wheelGame.triggerSpin('user1', 'User 1', null, 'Rose', 1);
      const result2 = await wheelGame.triggerSpin('user2', 'User 2', null, 'Rose', 1);
      const result3 = await wheelGame.triggerSpin('user3', 'User 3', null, 'Rose', 1);

      // First spin: immediate
      expect(result1.queued).toBe(false);

      // Second and third: queued
      expect(result2.queued).toBe(true);
      expect(result2.position).toBe(1);
      expect(result3.queued).toBe(true);
      expect(result3.position).toBe(2);

      // Unified queue should have been called exactly 2 times (for 2nd and 3rd spins)
      expect(mockUnifiedQueue.queueWheel).toHaveBeenCalledTimes(2);

      // Legacy queue should be empty
      expect(wheelGame.spinQueue.length).toBe(0);

      // Should have exactly 2 unified queue logs
      const unifiedQueueLogs = mockLogger.info.mock.calls.filter(call => 
        call[0].includes('🎡 Wheel spin queued via unified queue')
      );
      expect(unifiedQueueLogs.length).toBe(2);

      // Should have NO legacy queue logs
      const legacyQueueLogs = mockLogger.info.mock.calls.filter(call => 
        call[0].includes('🎡 Wheel spin queued (legacy):')
      );
      expect(legacyQueueLogs.length).toBe(0);
    });
  });

  describe('Socket Event Emission', () => {
    test('should emit exactly ONE spin-start event per spin', async () => {
      // Setup: First spin
      wheelGame.isSpinning = false;
      mockUnifiedQueue.shouldQueue.mockReturnValue(false);

      // Mock startSpin to track spin-start emissions
      wheelGame.startSpin = jest.fn(async (spinData) => {
        // Simulate what startSpin does
        mockIo.emit('wheel:spin-start', { spinId: spinData.spinId });
        return { success: true, spinId: spinData.spinId };
      });

      // Trigger a spin
      await wheelGame.triggerSpin('testuser', 'Test User', null, 'Rose', 1);

      // Should emit exactly ONE wheel:spin-start event
      const spinStartEvents = emittedEvents.filter(e => e.event === 'wheel:spin-start');
      expect(spinStartEvents.length).toBe(1);
    });
  });
});
