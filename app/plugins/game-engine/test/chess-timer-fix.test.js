/**
 * Chess Timer Fix Test
 * 
 * Validates the chess timer race condition fix:
 * - Timer starts with setInterval
 * - Timer updates continuously every 100ms
 * - Timer is properly cleaned up
 */

const ChessGame = require('../games/chess');

describe('Chess Timer Fix', () => {
  let chessGame;
  let mockLogger;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn()
    };

    const player1 = {
      username: 'streamer',
      role: 'streamer',
      color: '#FF0000',
      side: 'white'
    };

    const player2 = {
      username: 'viewer1',
      role: 'viewer',
      color: '#0000FF',
      side: 'black'
    };

    chessGame = new ChessGame('test-session-1', player1, player2, '3+0', mockLogger);
  });

  afterEach(() => {
    // Clean up any running timers
    if (chessGame.timerInterval) {
      clearInterval(chessGame.timerInterval);
    }
  });

  test('startTimer should initialize timerInterval with setInterval', () => {
    expect(chessGame.timerInterval).toBeNull();
    
    chessGame.startTimer();
    
    expect(chessGame.timerInterval).not.toBeNull();
    expect(typeof chessGame.timerInterval).toBe('object'); // setInterval returns a Timeout object
  });

  test('timer should update continuously', (done) => {
    const initialTime = chessGame.timers.white;
    
    chessGame.startTimer();
    
    // Wait 350ms (should be 3+ timer updates at 100ms intervals)
    setTimeout(() => {
      const currentTime = chessGame.timers.white;
      
      // Time should have decreased
      expect(currentTime).toBeLessThan(initialTime);
      // Should have decreased by approximately 300-400ms
      expect(initialTime - currentTime).toBeGreaterThan(250);
      expect(initialTime - currentTime).toBeLessThan(500);
      
      chessGame.stopTimer();
      done();
    }, 350);
  });

  test('stopTimer should clear the interval', () => {
    chessGame.startTimer();
    expect(chessGame.timerInterval).not.toBeNull();
    
    chessGame.stopTimer();
    
    expect(chessGame.timerInterval).toBeNull();
  });

  test('starting timer twice should clear previous interval', () => {
    chessGame.startTimer();
    const firstInterval = chessGame.timerInterval;
    
    chessGame.startTimer();
    const secondInterval = chessGame.timerInterval;
    
    expect(firstInterval).not.toBe(secondInterval);
    expect(chessGame.timerInterval).not.toBeNull();
    
    chessGame.stopTimer();
  });

  test('timer should stop after stopTimer is called', (done) => {
    chessGame.startTimer();
    
    setTimeout(() => {
      const timeBeforeStop = chessGame.timers.white;
      chessGame.stopTimer();
      
      // Wait another 200ms to verify timer has stopped
      setTimeout(() => {
        const timeAfterStop = chessGame.timers.white;
        
        // Time should not have changed after stopTimer
        expect(timeAfterStop).toBe(timeBeforeStop);
        done();
      }, 200);
    }, 150);
  });

  test('captured pieces should be tracked incrementally', () => {
    expect(chessGame.capturedPieces).toBeDefined();
    expect(chessGame.capturedPieces.white).toBeDefined();
    expect(chessGame.capturedPieces.black).toBeDefined();
    expect(chessGame.capturedPieces.white.p).toBe(0);
  });

  test('getCapturedPieces should return tracked pieces', () => {
    const captured = chessGame.getCapturedPieces();
    
    expect(captured).toBe(chessGame.capturedPieces);
    expect(captured.white.p).toBe(0);
    expect(captured.black.p).toBe(0);
  });

  test('captured pieces should be updated on capture', () => {
    chessGame.startTimer();
    
    // Make a move that doesn't capture
    let result = chessGame.makeMove('e4', 'streamer');
    expect(result.success).toBe(true);
    expect(chessGame.capturedPieces.white.p).toBe(0);
    
    // Black's turn - move that doesn't capture
    result = chessGame.makeMove('e5', 'viewer1');
    expect(result.success).toBe(true);
    expect(chessGame.capturedPieces.black.p).toBe(0);
    
    // White's turn - setup for capture
    result = chessGame.makeMove('Nf3', 'streamer');
    expect(result.success).toBe(true);
    
    // Black's turn - move pawn
    result = chessGame.makeMove('Nc6', 'viewer1');
    expect(result.success).toBe(true);
    
    // White captures pawn
    result = chessGame.makeMove('Nxe5', 'streamer');
    expect(result.success).toBe(true);
    expect(chessGame.capturedPieces.white.p).toBe(1); // White captured a pawn
    
    chessGame.stopTimer();
  });
});
