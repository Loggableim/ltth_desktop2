/**
 * Event TTS Handler
 * Verarbeitet TikTok Events und generiert TTS-Nachrichten
 */
class EventTTSHandler {
  constructor(ttsPlugin) {
    this.tts = ttsPlugin;
    this.api = ttsPlugin.api;
    this.logger = ttsPlugin.logger;
    this.cooldowns = new Map(); // key: `${userId}:${eventType}` -> timestamp
  }

  init() {
    const config = this.tts.config.eventTTS;
    if (!config?.enabled) {
      this.logger.info('Event TTS is disabled');
      return;
    }
    this.logger.info('Initializing Event TTS Handler...');
    this._registerEventHandlers();
    this.logger.info('Event TTS Handler initialized');
  }

  _registerEventHandlers() {
    const events = this.tts.config.eventTTS.events;

    if (events.gift?.enabled) {
      this.api.registerTikTokEvent('gift', (data) => this._handleGift(data));
    }
    if (events.follow?.enabled) {
      this.api.registerTikTokEvent('follow', (data) => this._handleFollow(data));
    }
    if (events.share?.enabled) {
      this.api.registerTikTokEvent('share', (data) => this._handleShare(data));
    }
    if (events.subscribe?.enabled) {
      this.api.registerTikTokEvent('subscribe', (data) => this._handleSubscribe(data));
    }
    if (events.like?.enabled) {
      this.api.registerTikTokEvent('like', (data) => this._handleLike(data));
    }
    if (events.join?.enabled) {
      this.api.registerTikTokEvent('join', (data) => this._handleJoin(data));
    }
  }

  _handleGift(data) {
    const config = this.tts.config.eventTTS.events.gift;
    const coins = data.coins || data.diamondCount || 0;
    
    if (coins < (config.minCoins || 0)) return;
    if (!this._checkCooldown(data.userId, 'gift', config.cooldownSeconds)) return;

    const text = this._fillTemplate(config.template, {
      username: data.username || data.uniqueId || 'Someone',
      nickname: data.nickname || data.username || 'Someone',
      giftName: data.giftName || 'a gift',
      giftCount: data.repeatCount || data.count || 1,
      coins: coins
    });

    this._queueEventTTS(text, data.userId, data.username, 'gift');
  }

  _handleFollow(data) {
    const config = this.tts.config.eventTTS.events.follow;
    if (!this._checkCooldown(data.userId, 'follow', config.cooldownSeconds)) return;

    const text = this._fillTemplate(config.template, {
      username: data.username || data.uniqueId || 'Someone',
      nickname: data.nickname || data.username || 'Someone'
    });

    this._queueEventTTS(text, data.userId, data.username, 'follow');
  }

  _handleShare(data) {
    const config = this.tts.config.eventTTS.events.share;
    if (!this._checkCooldown(data.userId, 'share', config.cooldownSeconds)) return;

    const text = this._fillTemplate(config.template, {
      username: data.username || data.uniqueId || 'Someone',
      nickname: data.nickname || data.username || 'Someone'
    });

    this._queueEventTTS(text, data.userId, data.username, 'share');
  }

  _handleSubscribe(data) {
    const config = this.tts.config.eventTTS.events.subscribe;
    if (!this._checkCooldown(data.userId, 'subscribe', config.cooldownSeconds)) return;

    const text = this._fillTemplate(config.template, {
      username: data.username || data.uniqueId || 'Someone',
      nickname: data.nickname || data.username || 'Someone'
    });

    this._queueEventTTS(text, data.userId, data.username, 'subscribe');
  }

  _handleLike(data) {
    const config = this.tts.config.eventTTS.events.like;
    const likeCount = data.likeCount || data.totalLikeCount || 1;

    if (likeCount < (config.minLikes || 1)) return;
    if (!this._checkCooldown(data.userId, 'like', config.cooldownSeconds)) return;

    const text = this._fillTemplate(config.template, {
      username: data.username || data.uniqueId || 'Someone',
      nickname: data.nickname || data.username || 'Someone',
      likeCount: likeCount
    });

    this._queueEventTTS(text, data.userId, data.username, 'like');
  }

  _handleJoin(data) {
    const config = this.tts.config.eventTTS.events.join;
    if (!this._checkCooldown(data.userId, 'join', config.cooldownSeconds)) return;

    const text = this._fillTemplate(config.template, {
      username: data.username || data.uniqueId || 'Someone',
      nickname: data.nickname || data.username || 'Someone'
    });

    this._queueEventTTS(text, data.userId, data.username, 'join');
  }

  _fillTemplate(template, data) {
    let result = template;
    for (const [key, value] of Object.entries(data)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, 'g'), value);
    }
    return result;
  }

  _checkCooldown(userId, eventType, cooldownSeconds) {
    if (!cooldownSeconds || cooldownSeconds <= 0) return true;

    const key = `${userId}:${eventType}`;
    const now = Date.now();
    const lastTime = this.cooldowns.get(key) || 0;

    if (now - lastTime < cooldownSeconds * 1000) {
      return false;
    }

    this.cooldowns.set(key, now);
    return true;
  }

  _queueEventTTS(text, userId, username, eventType) {
    const config = this.tts.config.eventTTS;

    const ttsRequest = {
      text: text,
      userId: userId || 'event-system',
      username: username || 'Event',
      source: `event:${eventType}`,
      voiceId: config.voice || undefined,
      volume: config.volume || 80,
      priority: config.priorityOverChat ? 'high' : 'normal'
    };

    this.tts.speak(ttsRequest).catch(err => {
      this.logger.error(`Event TTS failed for ${eventType}: ${err.message}`);
    });

    this.logger.debug(`Event TTS queued: ${eventType} - ${text}`);
  }

  destroy() {
    this.cooldowns.clear();
    this.logger.info('Event TTS Handler destroyed');
  }
}

module.exports = EventTTSHandler;
