/**
 * MicState - Manages microphone activity state for AnimazingPal
 * 
 * Tracks whether the microphone is active (user is speaking).
 * Used for coordinating event processing to avoid interruptions.
 */

const EventEmitter = require('events');

class MicState extends EventEmitter {
  constructor() {
    super();
    this._isActive = false;
    this._lastActiveTime = null;
    this._lastIdleTime = Date.now();
  }

  /**
   * Mark microphone as active
   */
  markActive() {
    if (!this._isActive) {
      this._isActive = true;
      this._lastActiveTime = Date.now();
      this.emit('active');
    }
  }

  /**
   * Mark microphone as idle
   */
  markIdle() {
    if (this._isActive) {
      this._isActive = false;
      this._lastIdleTime = Date.now();
      this.emit('idle');
    }
  }

  /**
   * Check if microphone is currently active
   * @returns {boolean}
   */
  isActive() {
    return this._isActive;
  }

  /**
   * Wait until microphone becomes idle
   * @param {number} timeout - Optional timeout in ms
   * @returns {Promise<boolean>} - True if mic went idle, false if timeout
   */
  waitForIdle(timeout = null) {
    if (!this._isActive) {
      return Promise.resolve(true);
    }

    return new Promise((resolve) => {
      const onIdle = () => {
        cleanup();
        resolve(true);
      };

      const onTimeout = () => {
        cleanup();
        resolve(false);
      };

      const cleanup = () => {
        this.removeListener('idle', onIdle);
        if (timer) clearTimeout(timer);
      };

      const timer = timeout ? setTimeout(onTimeout, timeout) : null;
      this.once('idle', onIdle);
    });
  }

  /**
   * Get time since last activity change
   * @returns {number} - Time in ms
   */
  getTimeSinceLastChange() {
    const referenceTime = this._isActive ? this._lastActiveTime : this._lastIdleTime;
    return referenceTime ? Date.now() - referenceTime : 0;
  }

  /**
   * Get time since last idle state
   * @returns {number} - Time in ms
   */
  getTimeSinceIdle() {
    return this._lastIdleTime ? Date.now() - this._lastIdleTime : 0;
  }

  /**
   * Reset state
   */
  reset() {
    this._isActive = false;
    this._lastActiveTime = null;
    this._lastIdleTime = Date.now();
  }
}

module.exports = MicState;
