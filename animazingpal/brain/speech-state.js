/**
 * SpeechState - Manages speech activity state for AnimazingPal
 * 
 * Tracks whether the avatar is currently speaking or idle.
 * Used for coordinating event processing to avoid interruptions.
 */

const EventEmitter = require('events');

class SpeechState extends EventEmitter {
  constructor() {
    super();
    this._isSpeaking = false;
    this._startTime = null;
  }

  /**
   * Mark speech as started
   */
  markStarted() {
    if (!this._isSpeaking) {
      this._isSpeaking = true;
      this._startTime = Date.now();
      this.emit('started');
    }
  }

  /**
   * Mark speech as ended
   */
  markEnded() {
    if (this._isSpeaking) {
      this._isSpeaking = false;
      const duration = this._startTime ? Date.now() - this._startTime : 0;
      this._startTime = null;
      this.emit('ended', { duration });
    }
  }

  /**
   * Check if currently speaking
   * @returns {boolean}
   */
  isSpeaking() {
    return this._isSpeaking;
  }

  /**
   * Wait until speech ends
   * @param {number} timeout - Optional timeout in ms
   * @returns {Promise<boolean>} - True if speech ended, false if timeout
   */
  waitForIdle(timeout = null) {
    if (!this._isSpeaking) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const onEnded = () => {
        cleanup();
        resolve(true);
      };

      const onTimeout = () => {
        cleanup();
        resolve(false);
      };

      const cleanup = () => {
        this.removeListener('ended', onEnded);
        if (timer) clearTimeout(timer);
      };

      const timer = timeout ? setTimeout(onTimeout, timeout) : null;
      this.once('ended', onEnded);
    });
  }

  /**
   * Get current speech duration
   * @returns {number} - Duration in ms, or 0 if not speaking
   */
  getSpeechDuration() {
    return this._isSpeaking && this._startTime ? Date.now() - this._startTime : 0;
  }

  /**
   * Reset state
   */
  reset() {
    this._isSpeaking = false;
    this._startTime = null;
  }
}

module.exports = SpeechState;
