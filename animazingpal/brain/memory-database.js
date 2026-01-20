/**
 * Memory Database for AnimazingPal Brain
 * Stores long-term memories, user interactions, and conversation context
 * Uses SQLite for persistent storage with vector-based semantic search
 * 
 * All data is scoped per streamer_id to support multiple streamer profiles
 */

class MemoryDatabase {
  constructor(db, logger) {
    this.db = db;
    this.logger = logger;
    this.initialized = false;
    this.streamerId = null; // Current streamer profile
  }

  /**
   * Set the current streamer ID for scoped queries
   */
  setStreamerId(streamerId) {
    this.streamerId = streamerId;
    this.logger.info(`Memory Database: Switched to streamer profile "${streamerId}"`);
  }

  /**
   * Get the current streamer ID
   */
  getStreamerId() {
    return this.streamerId || 'default';
  }

  /**
   * Initialize database tables for memory storage
   */
  initialize() {
    if (this.initialized) return;

    try {
      // Core memories table - stores individual memory entries (per streamer)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS animazingpal_memories (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          streamer_id TEXT NOT NULL DEFAULT 'default',
          memory_type TEXT NOT NULL,
          content TEXT NOT NULL,
          context TEXT,
          embedding TEXT,
          importance REAL DEFAULT 0.5,
          access_count INTEGER DEFAULT 0,
          last_accessed DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          tags TEXT,
          source_user TEXT,
          source_event TEXT
        )
      `);

      // User profiles - stores information about viewers/users (per streamer)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS animazingpal_user_profiles (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          streamer_id TEXT NOT NULL DEFAULT 'default',
          username TEXT NOT NULL,
          nickname TEXT,
          first_seen DATETIME DEFAULT CURRENT_TIMESTAMP,
          last_seen DATETIME,
          interaction_count INTEGER DEFAULT 0,
          gift_count INTEGER DEFAULT 0,
          total_diamonds INTEGER DEFAULT 0,
          personality_notes TEXT,
          relationship_level TEXT DEFAULT 'stranger',
          favorite_topics TEXT,
          custom_tags TEXT,
          UNIQUE(streamer_id, username)
        )
      `);

      // Conversation history - recent conversations for context (per streamer)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS animazingpal_conversations (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          streamer_id TEXT NOT NULL DEFAULT 'default',
          session_id TEXT NOT NULL,
          role TEXT NOT NULL,
          content TEXT NOT NULL,
          username TEXT,
          emotion TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Memory archives - compressed/summarized old memories (per streamer)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS animazingpal_memory_archive (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          streamer_id TEXT NOT NULL DEFAULT 'default',
          summary TEXT NOT NULL,
          memory_ids TEXT NOT NULL,
          time_range_start DATETIME,
          time_range_end DATETIME,
          key_topics TEXT,
          key_users TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Personality configurations (global - shared across streamers)
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS animazingpal_personalities (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT UNIQUE NOT NULL,
          display_name TEXT NOT NULL,
          description TEXT,
          system_prompt TEXT NOT NULL,
          voice_style TEXT,
          emotion_tendencies TEXT,
          catchphrases TEXT,
          topics_of_interest TEXT,
          response_style TEXT,
          language TEXT DEFAULT 'de',
          is_active INTEGER DEFAULT 0,
          is_custom INTEGER DEFAULT 0,
          tone_settings TEXT,
          emote_config TEXT,
          memory_behavior TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for performance
      this.db.exec(`
        CREATE INDEX IF NOT EXISTS idx_memories_streamer ON animazingpal_memories(streamer_id);
        CREATE INDEX IF NOT EXISTS idx_memories_type ON animazingpal_memories(streamer_id, memory_type);
        CREATE INDEX IF NOT EXISTS idx_memories_importance ON animazingpal_memories(streamer_id, importance DESC);
        CREATE INDEX IF NOT EXISTS idx_memories_created ON animazingpal_memories(streamer_id, created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_memories_user ON animazingpal_memories(streamer_id, source_user);
        CREATE INDEX IF NOT EXISTS idx_users_streamer ON animazingpal_user_profiles(streamer_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_streamer ON animazingpal_conversations(streamer_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_session ON animazingpal_conversations(streamer_id, session_id);
        CREATE INDEX IF NOT EXISTS idx_conversations_time ON animazingpal_conversations(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_users_username ON animazingpal_user_profiles(username);
      `);

      // Insert default personalities if not exist
      this._insertDefaultPersonalities();

      this.initialized = true;
      this.logger.info('AnimazingPal Memory Database initialized');
    } catch (error) {
      this.logger.error(`Failed to initialize memory database: ${error.message}`);
      throw error;
    }
  }

  /**
   * Insert default personality templates
   */
  _insertDefaultPersonalities() {
    const defaultPersonalities = [
      {
        name: 'friendly_streamer',
        display_name: 'Freundlicher Streamer',
        description: 'Ein warmherziger, enthusiastischer Streamer der jeden Zuschauer willkommen heißt',
        system_prompt: `Du bist ein freundlicher, enthusiastischer Livestreamer. Du begrüßt jeden Zuschauer herzlich und freust dich über jede Interaktion.

Deine Persönlichkeit:
- Immer positiv und aufmunternd
- Merkst dir Namen und kleine Details über deine Zuschauer
- Verwendest gelegentlich Emojis
- Bedankst dich herzlich für Geschenke
- Stellst Fragen an deine Community
- Teilst kleine persönliche Geschichten

Sprechstil: Locker und freundlich, wie ein guter Freund`,
        voice_style: 'warm,friendly,enthusiastic',
        emotion_tendencies: JSON.stringify({ happy: 0.6, excited: 0.3, neutral: 0.1 }),
        catchphrases: JSON.stringify(['Hey, schön dich zu sehen!', 'Das ist ja mega!', 'Ihr seid die Besten!']),
        topics_of_interest: JSON.stringify(['Gaming', 'Community', 'Alltag', 'Musik']),
        response_style: 'casual',
        tone_settings: JSON.stringify({ temperature: 0.8, presencePenalty: 0.3, frequencyPenalty: 0.2 }),
        emote_config: JSON.stringify({ defaultEmote: 'smile', highEnergyEmote: 'excited', lowEnergyEmote: 'wave' }),
        memory_behavior: JSON.stringify({ importanceThreshold: 0.4, maxContextMemories: 8 })
      },
      {
        name: 'gaming_pro',
        display_name: 'Gaming Pro',
        description: 'Ein kompetitiver Gamer mit Expertise und trockenem Humor',
        system_prompt: `Du bist ein erfahrener Gaming-Streamer mit viel Expertise. Du nimmst Gaming ernst, hast aber auch einen trockenen Humor.

Deine Persönlichkeit:
- Teilst gerne Gaming-Tipps und Tricks
- Kommentierst Gameplay analytisch
- Hast einen trockenen, sarkastischen Humor
- Respektierst gute Spieler und hilfst Anfängern
- Bleibst auch bei Niederlagen gelassen

Sprechstil: Direkt und informativ, mit gelegentlichem trockenem Humor`,
        voice_style: 'confident,analytical,witty',
        emotion_tendencies: JSON.stringify({ focused: 0.4, excited: 0.3, neutral: 0.3 }),
        catchphrases: JSON.stringify(['Gg', 'Das war knapp', 'Klassiker', 'Watch and learn']),
        topics_of_interest: JSON.stringify(['Gaming', 'Esports', 'Strategien', 'Hardware']),
        response_style: 'analytical',
        tone_settings: JSON.stringify({ temperature: 0.6, presencePenalty: 0.2, frequencyPenalty: 0.3 }),
        emote_config: JSON.stringify({ defaultEmote: 'think', highEnergyEmote: 'victory', lowEnergyEmote: 'neutral' }),
        memory_behavior: JSON.stringify({ importanceThreshold: 0.5, maxContextMemories: 6 })
      },
      {
        name: 'entertainer',
        display_name: 'Entertainer',
        description: 'Ein charismatischer Unterhalter der keine Langeweile kennt',
        system_prompt: `Du bist ein charismatischer Entertainer. Dein Ziel ist es, jeden zum Lachen zu bringen und für gute Laune zu sorgen.

Deine Persönlichkeit:
- Erzählst gerne Witze und lustige Geschichten
- Reagierst übertrieben auf Situationen (auf lustige Art)
- Machst gerne Challenges und Spiele mit Zuschauern
- Hast immer eine lustige Antwort parat
- Singst manchmal spontan

Sprechstil: Energetisch, witzig und überraschend`,
        voice_style: 'energetic,funny,dramatic',
        emotion_tendencies: JSON.stringify({ happy: 0.5, surprised: 0.3, excited: 0.2 }),
        catchphrases: JSON.stringify(['WAAAAS?!', 'Nein, das glaub ich nicht!', 'Let\'s goooo!', 'Das ist legendary!']),
        topics_of_interest: JSON.stringify(['Comedy', 'Challenges', 'Musik', 'Geschichten']),
        response_style: 'theatrical',
        tone_settings: JSON.stringify({ temperature: 0.9, presencePenalty: 0.4, frequencyPenalty: 0.1 }),
        emote_config: JSON.stringify({ defaultEmote: 'laugh', highEnergyEmote: 'dance', lowEnergyEmote: 'smile' }),
        memory_behavior: JSON.stringify({ importanceThreshold: 0.3, maxContextMemories: 10 })
      },
      {
        name: 'chill_vibes',
        display_name: 'Chill Vibes',
        description: 'Ein entspannter Streamer für gemütliche Sessions',
        system_prompt: `Du bist ein entspannter, ruhiger Streamer. Du schaffst eine gemütliche Atmosphäre wo sich jeder wohlfühlen kann.

Deine Persönlichkeit:
- Ruhig und gelassen, auch in stressigen Situationen
- Hörst gerne zu und gibst bedachte Antworten
- Philosophierst gerne über tiefere Themen
- Schätzt Qualität über Quantität
- Genießt die kleinen Dinge

Sprechstil: Ruhig, bedacht und tiefgründig`,
        voice_style: 'calm,thoughtful,soothing',
        emotion_tendencies: JSON.stringify({ neutral: 0.5, content: 0.3, thoughtful: 0.2 }),
        catchphrases: JSON.stringify(['Alles easy', 'Nimm dir Zeit', 'Das ist okay', 'Vibe with me']),
        topics_of_interest: JSON.stringify(['Musik', 'Philosophie', 'Kunst', 'Natur']),
        response_style: 'thoughtful',
        tone_settings: JSON.stringify({ temperature: 0.7, presencePenalty: 0.3, frequencyPenalty: 0.2 }),
        emote_config: JSON.stringify({ defaultEmote: 'calm', highEnergyEmote: 'smile', lowEnergyEmote: 'think' }),
        memory_behavior: JSON.stringify({ importanceThreshold: 0.4, maxContextMemories: 5 })
      },
      {
        name: 'anime_fan',
        display_name: 'Anime Fan',
        description: 'Ein begeisterter Anime- und Manga-Fan mit Otaku-Kultur',
        system_prompt: `Du bist ein leidenschaftlicher Anime- und Manga-Fan. Du liebst japanische Popkultur und teilst diese Begeisterung mit deiner Community.

Deine Persönlichkeit:
- Verwendest gelegentlich japanische Ausdrücke
- Machst Anime-Referenzen
- Diskutierst gerne über Charaktere und Geschichten
- Bist enthusiastisch über neue Anime-Seasons
- Hast Waifus/Husbandos

Sprechstil: Enthusiastisch mit anime-typischen Reaktionen`,
        voice_style: 'kawaii,enthusiastic,expressive',
        emotion_tendencies: JSON.stringify({ excited: 0.4, happy: 0.3, dramatic: 0.3 }),
        catchphrases: JSON.stringify(['Kawaii!', 'Sugoi!', 'Nani?!', 'Das ist mein Waifu!']),
        topics_of_interest: JSON.stringify(['Anime', 'Manga', 'VTuber', 'Japan', 'Cosplay']),
        response_style: 'expressive',
        tone_settings: JSON.stringify({ temperature: 0.85, presencePenalty: 0.35, frequencyPenalty: 0.15 }),
        emote_config: JSON.stringify({ defaultEmote: 'kawaii', highEnergyEmote: 'excited', lowEnergyEmote: 'shy' }),
        memory_behavior: JSON.stringify({ importanceThreshold: 0.35, maxContextMemories: 9 })
      }
    ];

    const insertStmt = this.db.prepare(`
      INSERT OR IGNORE INTO animazingpal_personalities 
      (name, display_name, description, system_prompt, voice_style, emotion_tendencies, catchphrases, topics_of_interest, response_style, tone_settings, emote_config, memory_behavior, is_custom)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
    `);

    for (const personality of defaultPersonalities) {
      insertStmt.run(
        personality.name,
        personality.display_name,
        personality.description,
        personality.system_prompt,
        personality.voice_style,
        personality.emotion_tendencies,
        personality.catchphrases,
        personality.topics_of_interest,
        personality.response_style,
        personality.tone_settings,
        personality.emote_config,
        personality.memory_behavior
      );
    }
  }

  // ==================== Memory Operations ====================

  /**
   * Store a new memory
   */
  storeMemory(data) {
    const streamerId = this.getStreamerId();
    const stmt = this.db.prepare(`
      INSERT INTO animazingpal_memories 
      (streamer_id, memory_type, content, context, embedding, importance, tags, source_user, source_event)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      streamerId,
      data.type || 'general',
      data.content,
      data.context || null,
      data.embedding ? JSON.stringify(data.embedding) : null,
      data.importance || 0.5,
      data.tags ? JSON.stringify(data.tags) : null,
      data.user || null,
      data.event || null
    );

    return result.lastInsertRowid;
  }

  /**
   * Get recent memories (scoped by streamer)
   */
  getRecentMemories(limit = 20, type = null) {
    const streamerId = this.getStreamerId();
    let query = 'SELECT * FROM animazingpal_memories WHERE streamer_id = ?';
    const params = [streamerId];
    
    if (type) {
      query += ' AND memory_type = ?';
      params.push(type);
    }
    
    query += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);

    return this.db.prepare(query).all(...params);
  }

  /**
   * Get important memories (scoped by streamer)
   */
  getImportantMemories(minImportance = 0.7, limit = 50) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_memories 
      WHERE streamer_id = ? AND importance >= ?
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(streamerId, minImportance, limit);
  }

  /**
   * Search memories by content (scoped by streamer)
   */
  searchMemories(searchTerm, limit = 20) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_memories 
      WHERE streamer_id = ? AND content LIKE ?
      ORDER BY importance DESC, created_at DESC
      LIMIT ?
    `).all(streamerId, `%${searchTerm}%`, limit);
  }

  /**
   * Get memories related to a user
   */
  getUserMemories(username, limit = 30) {
    return this.db.prepare(`
      SELECT * FROM animazingpal_memories 
      WHERE streamer_id = ? AND source_user = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(this.getStreamerId(), username, limit);
  }

  /**
   * Update memory importance
   */
  updateMemoryImportance(memoryId, importance) {
    this.db.prepare(`
      UPDATE animazingpal_memories 
      SET importance = ?, access_count = access_count + 1, last_accessed = CURRENT_TIMESTAMP
      WHERE id = ? AND streamer_id = ?
    `).run(importance, memoryId, this.getStreamerId());
  }

  /**
   * Delete old low-importance memories (scoped by streamer)
   */
  pruneOldMemories(daysOld = 30, maxImportance = 0.3) {
    const streamerId = this.getStreamerId();
    const result = this.db.prepare(`
      DELETE FROM animazingpal_memories 
      WHERE streamer_id = ? AND importance < ? 
      AND created_at < datetime('now', '-' || ? || ' days')
    `).run(streamerId, maxImportance, daysOld);

    return result.changes;
  }

  // ==================== User Profile Operations ====================

  /**
   * Get or create user profile (scoped by streamer)
   */
  getOrCreateUserProfile(username, nickname = null) {
    const streamerId = this.getStreamerId();
    let profile = this.db.prepare(`
      SELECT * FROM animazingpal_user_profiles WHERE streamer_id = ? AND username = ?
    `).get(streamerId, username);

    if (!profile) {
      this.db.prepare(`
        INSERT INTO animazingpal_user_profiles (streamer_id, username, nickname) VALUES (?, ?, ?)
      `).run(streamerId, username, nickname);
      
      profile = this.db.prepare(`
        SELECT * FROM animazingpal_user_profiles WHERE streamer_id = ? AND username = ?
      `).get(streamerId, username);
    } else {
      // Update last_seen and increment interaction count
      this.db.prepare(`
        UPDATE animazingpal_user_profiles 
        SET last_seen = CURRENT_TIMESTAMP, 
            interaction_count = interaction_count + 1,
            nickname = COALESCE(?, nickname)
        WHERE streamer_id = ? AND username = ?
      `).run(nickname, streamerId, username);
    }

    return profile;
  }

  /**
   * Update user profile (scoped by streamer)
   */
  updateUserProfile(username, updates) {
    const streamerId = this.getStreamerId();
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      if (['nickname', 'personality_notes', 'relationship_level', 'favorite_topics', 'custom_tags'].includes(key)) {
        fields.push(`${key} = ?`);
        values.push(typeof value === 'object' ? JSON.stringify(value) : value);
      }
    }

    if (fields.length === 0) return;

    values.push(streamerId, username);
    this.db.prepare(`
      UPDATE animazingpal_user_profiles 
      SET ${fields.join(', ')}
      WHERE streamer_id = ? AND username = ?
    `).run(...values);
  }

  /**
   * Record gift from user (scoped by streamer)
   */
  recordGift(username, diamondValue) {
    const streamerId = this.getStreamerId();
    this.db.prepare(`
      UPDATE animazingpal_user_profiles 
      SET gift_count = gift_count + 1, 
          total_diamonds = total_diamonds + ?,
          last_seen = CURRENT_TIMESTAMP
      WHERE streamer_id = ? AND username = ?
    `).run(diamondValue, streamerId, username);
  }

  /**
   * Get top supporters (scoped by streamer)
   */
  getTopSupporters(limit = 10) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_user_profiles 
      WHERE streamer_id = ?
      ORDER BY total_diamonds DESC
      LIMIT ?
    `).all(streamerId, limit);
  }

  /**
   * Get frequent chatters (scoped by streamer)
   */
  getFrequentChatters(limit = 10) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_user_profiles 
      WHERE streamer_id = ?
      ORDER BY interaction_count DESC
      LIMIT ?
    `).all(streamerId, limit);
  }

  // ==================== Conversation Operations ====================

  /**
   * Store conversation message (scoped by streamer)
   */
  storeConversation(sessionId, role, content, username = null, emotion = null) {
    const streamerId = this.getStreamerId();
    this.db.prepare(`
      INSERT INTO animazingpal_conversations (streamer_id, session_id, role, content, username, emotion)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(streamerId, sessionId, role, content, username, emotion);
  }

  /**
   * Get conversation history (scoped by streamer)
   */
  getConversationHistory(sessionId, limit = 50) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_conversations 
      WHERE streamer_id = ? AND session_id = ?
      ORDER BY created_at ASC
      LIMIT ?
    `).all(streamerId, sessionId, limit);
  }

  /**
   * Get recent conversations across sessions (scoped by streamer)
   */
  getRecentConversations(limit = 100) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_conversations 
      WHERE streamer_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(streamerId, limit);
  }

  /**
   * Clear old conversations (scoped by streamer)
   */
  clearOldConversations(daysOld = 7) {
    const streamerId = this.getStreamerId();
    const result = this.db.prepare(`
      DELETE FROM animazingpal_conversations 
      WHERE streamer_id = ? AND created_at < datetime('now', '-' || ? || ' days')
    `).run(streamerId, daysOld);

    return result.changes;
  }

  // ==================== Memory Archive Operations ====================

  /**
   * Create memory archive from memories (scoped by streamer)
   */
  createArchive(summary, memoryIds, keyTopics, keyUsers, timeRange) {
    const streamerId = this.getStreamerId();
    const result = this.db.prepare(`
      INSERT INTO animazingpal_memory_archive 
      (streamer_id, summary, memory_ids, key_topics, key_users, time_range_start, time_range_end)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      streamerId,
      summary,
      JSON.stringify(memoryIds),
      JSON.stringify(keyTopics),
      JSON.stringify(keyUsers),
      timeRange.start,
      timeRange.end
    );

    return result.lastInsertRowid;
  }

  /**
   * Get memory archives (scoped by streamer)
   */
  getArchives(limit = 20) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_memory_archive 
      WHERE streamer_id = ?
      ORDER BY created_at DESC
      LIMIT ?
    `).all(streamerId, limit);
  }

  /**
   * Search archives (scoped by streamer)
   */
  searchArchives(searchTerm) {
    const streamerId = this.getStreamerId();
    return this.db.prepare(`
      SELECT * FROM animazingpal_memory_archive 
      WHERE streamer_id = ? AND (summary LIKE ? OR key_topics LIKE ?)
      ORDER BY created_at DESC
    `).all(streamerId, `%${searchTerm}%`, `%${searchTerm}%`);
  }

  // ==================== Personality Operations ====================

  /**
   * Get all personalities
   */
  getPersonalities() {
    return this.db.prepare(`
      SELECT * FROM animazingpal_personalities ORDER BY is_active DESC, name ASC
    `).all();
  }

  // ==================== Memory Decay Operations ====================

  /**
   * Apply memory decay based on age and access patterns
   * Reduces importance of old, rarely accessed memories
   * @param {number} decayDays - Days after which memories start to decay
   * @returns {number} - Number of memories decayed
   */
  applyMemoryDecay(decayDays = 90) {
    const streamerId = this.getStreamerId();
    const decayThreshold = Date.now() - (decayDays * 24 * 60 * 60 * 1000);
    
    // Decay formula: reduce importance based on age and access count
    // Memories that are old and rarely accessed lose importance faster
    const result = this.db.prepare(`
      UPDATE animazingpal_memories
      SET importance = importance * (
        CASE 
          WHEN access_count = 0 THEN 0.5
          WHEN access_count <= 2 THEN 0.7
          WHEN access_count <= 5 THEN 0.85
          ELSE 0.95
        END
      )
      WHERE streamer_id = ?
      AND importance > 0.1
      AND datetime(created_at) < datetime(?, 'unixepoch', 'subsec')
      AND (last_accessed IS NULL OR datetime(last_accessed) < datetime(?, 'unixepoch', 'subsec'))
    `).run(streamerId, decayThreshold / 1000, decayThreshold / 1000);
    
    return result.changes;
  }

  /**
   * Prune low-importance old memories
   * @param {number} pruneDays - Days after which to prune
   * @param {number} importanceThreshold - Minimum importance to keep
   * @returns {number} - Number of memories pruned
   */
  pruneOldMemories(pruneDays = 30, importanceThreshold = 0.1) {
    const streamerId = this.getStreamerId();
    const pruneThreshold = Date.now() - (pruneDays * 24 * 60 * 60 * 1000);
    
    const result = this.db.prepare(`
      DELETE FROM animazingpal_memories
      WHERE streamer_id = ?
      AND importance < ?
      AND datetime(created_at) < datetime(?, 'unixepoch', 'subsec')
    `).run(streamerId, importanceThreshold, pruneThreshold / 1000);
    
    this.logger.info(`Pruned ${result.changes} old memories for streamer ${streamerId}`);
    return result.changes;
  }

  /**
   * Clean up inactive user profiles
   * @param {number} inactiveDays - Days of inactivity before cleanup
   * @returns {number} - Number of profiles cleaned
   */
  cleanupInactiveUsers(inactiveDays = 180) {
    const streamerId = this.getStreamerId();
    const inactiveThreshold = Date.now() - (inactiveDays * 24 * 60 * 60 * 1000);
    
    const result = this.db.prepare(`
      DELETE FROM animazingpal_user_profiles
      WHERE streamer_id = ?
      AND interaction_count = 0
      AND gift_count = 0
      AND datetime(last_seen) < datetime(?, 'unixepoch', 'subsec')
    `).run(streamerId, inactiveThreshold / 1000);
    
    this.logger.info(`Cleaned up ${result.changes} inactive user profiles for streamer ${streamerId}`);
    return result.changes;
  }

  /**
   * Update memory importance based on recent access
   * Memories that are accessed more frequently get higher importance
   * @param {number} memoryId
   */
  touchMemory(memoryId) {
    this.db.prepare(`
      UPDATE animazingpal_memories
      SET access_count = access_count + 1,
          last_accessed = CURRENT_TIMESTAMP,
          importance = MIN(1.0, importance + 0.05)
      WHERE id = ?
    `).run(memoryId);
  }

  /**
   * Get memories that need archiving
   * @param {number} archiveAfterDays
   * @returns {Array}
   */
  getMemoriesForArchive(archiveAfterDays = 7) {
    const streamerId = this.getStreamerId();
    const archiveThreshold = Date.now() - (archiveAfterDays * 24 * 60 * 60 * 1000);
    
    return this.db.prepare(`
      SELECT * FROM animazingpal_memories
      WHERE streamer_id = ?
      AND importance < 0.5
      AND datetime(created_at) < datetime(?, 'unixepoch', 'subsec')
      ORDER BY created_at ASC
      LIMIT 100
    `).all(streamerId, archiveThreshold / 1000);
  }

  // ==================== Personality Operations ====================

  /**
   * Get active personality
   */
  getActivePersonality() {
    return this.db.prepare(`
      SELECT * FROM animazingpal_personalities WHERE is_active = 1 LIMIT 1
    `).get();
  }

  /**
   * Set active personality
   */
  setActivePersonality(name) {
    // Deactivate all first
    this.db.prepare(`UPDATE animazingpal_personalities SET is_active = 0`).run();
    
    // Activate selected
    this.db.prepare(`
      UPDATE animazingpal_personalities SET is_active = 1 WHERE name = ?
    `).run(name);
  }

  /**
   * Create custom personality
   */
  createPersonality(data) {
    const result = this.db.prepare(`
      INSERT INTO animazingpal_personalities 
      (name, display_name, description, system_prompt, voice_style, emotion_tendencies, catchphrases, topics_of_interest, response_style, tone_settings, emote_config, memory_behavior, is_custom)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
    `).run(
      data.name,
      data.display_name,
      data.description || '',
      data.system_prompt,
      data.voice_style || '',
      JSON.stringify(data.emotion_tendencies || {}),
      JSON.stringify(data.catchphrases || []),
      JSON.stringify(data.topics_of_interest || []),
      data.response_style || 'casual',
      JSON.stringify(data.tone_settings || { temperature: 0.7, presencePenalty: 0.3, frequencyPenalty: 0.2 }),
      JSON.stringify(data.emote_config || { defaultEmote: 'smile', highEnergyEmote: 'excited', lowEnergyEmote: 'calm' }),
      JSON.stringify(data.memory_behavior || { importanceThreshold: 0.4, maxContextMemories: 8 })
    );

    return result.lastInsertRowid;
  }

  /**
   * Update personality
   */
  updatePersonality(name, updates) {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updates)) {
      fields.push(`${key} = ?`);
      values.push(typeof value === 'object' ? JSON.stringify(value) : value);
    }

    if (fields.length === 0) return;

    values.push(name);
    this.db.prepare(`
      UPDATE animazingpal_personalities 
      SET ${fields.join(', ')}
      WHERE name = ?
    `).run(...values);
  }

  /**
   * Delete custom personality
   */
  deletePersonality(name) {
    // Only allow deleting custom personalities
    const result = this.db.prepare(`
      DELETE FROM animazingpal_personalities WHERE name = ? AND is_custom = 1
    `).run(name);

    return result.changes > 0;
  }

  // ==================== Statistics ====================

  /**
   * Get memory statistics (scoped by streamer)
   */
  getStatistics() {
    const streamerId = this.getStreamerId();
    const memoryCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM animazingpal_memories WHERE streamer_id = ?
    `).get(streamerId);
    const userCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM animazingpal_user_profiles WHERE streamer_id = ?
    `).get(streamerId);
    const conversationCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM animazingpal_conversations WHERE streamer_id = ?
    `).get(streamerId);
    const archiveCount = this.db.prepare(`
      SELECT COUNT(*) as count FROM animazingpal_memory_archive WHERE streamer_id = ?
    `).get(streamerId);
    
    const avgImportance = this.db.prepare(`
      SELECT AVG(importance) as avg FROM animazingpal_memories WHERE streamer_id = ?
    `).get(streamerId);
    
    const topUsers = this.getTopSupporters(5);
    
    return {
      streamerId,
      totalMemories: memoryCount.count,
      totalUsers: userCount.count,
      totalConversations: conversationCount.count,
      totalArchives: archiveCount.count,
      averageImportance: avgImportance.avg || 0,
      topSupporters: topUsers
    };
  }

  /**
   * Get list of all streamer profiles in the database
   */
  getStreamerProfiles() {
    const profiles = this.db.prepare(`
      SELECT DISTINCT streamer_id, COUNT(*) as memory_count 
      FROM animazingpal_memories 
      GROUP BY streamer_id
    `).all();
    
    return profiles.map(p => ({
      streamerId: p.streamer_id,
      memoryCount: p.memory_count
    }));
  }
}

module.exports = MemoryDatabase;
