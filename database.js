/** @type {any} */
const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

/** @typedef {{ id: string, username: string, fingerprint: string, created_at?: number, last_seen?: number }} Player */
/** @typedef {{ score: number, speed_level: number, played_at: number }} ScoreEntry */
/** @typedef {{ username: string, score: number, speed_level: number, played_at: number, rank: number }} HallOfFameEntry */
/** @typedef {{ username: string, ip_address: string, cheat_type: string, attempted_score: number, reason: string, caught_at: number, offense_count: number }} HallOfShameEntry */
/** @typedef {{ total_players: number, total_games: number, highest_score: number, average_score: number }} GlobalStats */

const dbPath = path.join(__dirname, 'xnake.db');

/** @type {any} */
let db = null;
/** @type {any} */
let SQL = null;

/**
 * @returns {any}
 */
function getDb() {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return db;
}

/** @returns {Promise<void>} */
async function initializeDatabase() {
  SQL = await initSqlJs();
  
  try {
    if (fs.existsSync(dbPath)) {
      const buffer = fs.readFileSync(dbPath);
      db = new SQL.Database(buffer);
      console.log('✓ Database loaded from file');
    } else {
      db = new SQL.Database();
      console.log('✓ New database created');
    }
  } catch (error) {
    console.error('Error loading database:', error);
    db = new SQL.Database();
  }

  getDb().run(`
    CREATE TABLE IF NOT EXISTS players (
      id TEXT PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      fingerprint TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      last_seen INTEGER NOT NULL
    )
  `);

  getDb().run(`
    CREATE TABLE IF NOT EXISTS scores (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      score INTEGER NOT NULL,
      speed_level INTEGER NOT NULL,
      played_at INTEGER NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);

  getDb().run(`
    CREATE TABLE IF NOT EXISTS cheaters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player_id TEXT NOT NULL,
      username TEXT NOT NULL,
      ip_address TEXT,
      fingerprint TEXT NOT NULL,
      cheat_type TEXT NOT NULL,
      attempted_score INTEGER,
      reason TEXT NOT NULL,
      caught_at INTEGER NOT NULL,
      FOREIGN KEY (player_id) REFERENCES players(id)
    )
  `);

  getDb().run(`CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id)`);
  getDb().run(`CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC)`);
  getDb().run(`CREATE INDEX IF NOT EXISTS idx_players_fingerprint ON players(fingerprint)`);
  getDb().run(`CREATE INDEX IF NOT EXISTS idx_cheaters_caught_at ON cheaters(caught_at DESC)`);
  getDb().run(`CREATE INDEX IF NOT EXISTS idx_cheaters_player ON cheaters(player_id)`);

  saveDatabase();
}

/** @returns {void} */
function saveDatabase() {
  if (!db) { return; }
  
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

const playerOps = {
  /**
   * @param {string} username
   * @param {string} fingerprint
   * @returns {Player | null}
   */
  create: (username, fingerprint) => {
    const playerId = uuidv4();
    const now = Date.now();
    
    try {
      getDb().run(
        'INSERT INTO players (id, username, fingerprint, created_at, last_seen) VALUES (?, ?, ?, ?, ?)',
        [playerId, username, fingerprint, now, now]
      );
      saveDatabase();
      return { id: playerId, username, fingerprint };
    } catch (_error) {
      return null;
    }
  },

  /**
   * @param {string} username
   * @returns {Player | null}
   */
  findByUsername: (username) => {
    const result = getDb().exec('SELECT * FROM players WHERE username = ?', [username]);
    if (result.length === 0 || result[0].values.length === 0) { return null; }
    
    const row = result[0].values[0];
    return {
      id: /** @type {string} */ (row[0]),
      username: /** @type {string} */ (row[1]),
      fingerprint: /** @type {string} */ (row[2]),
      created_at: /** @type {number} */ (row[3]),
      last_seen: /** @type {number} */ (row[4])
    };
  },

  /**
   * @param {string} playerId
   * @returns {Player | null}
   */
  findById: (playerId) => {
    const result = getDb().exec('SELECT * FROM players WHERE id = ?', [playerId]);
    if (result.length === 0 || result[0].values.length === 0) { return null; }
    
    const row = result[0].values[0];
    return {
      id: /** @type {string} */ (row[0]),
      username: /** @type {string} */ (row[1]),
      fingerprint: /** @type {string} */ (row[2]),
      created_at: /** @type {number} */ (row[3]),
      last_seen: /** @type {number} */ (row[4])
    };
  },

  /**
   * @param {string} fingerprint
   * @returns {Player | null}
   */
  findByFingerprint: (fingerprint) => {
    const result = getDb().exec('SELECT * FROM players WHERE fingerprint = ?', [fingerprint]);
    if (result.length === 0 || result[0].values.length === 0) { return null; }
    
    const row = result[0].values[0];
    return {
      id: /** @type {string} */ (row[0]),
      username: /** @type {string} */ (row[1]),
      fingerprint: /** @type {string} */ (row[2]),
      created_at: /** @type {number} */ (row[3]),
      last_seen: /** @type {number} */ (row[4])
    };
  },

  /**
   * @param {string} playerId
   * @returns {void}
   */
  updateLastSeen: (playerId) => {
    getDb().run('UPDATE players SET last_seen = ? WHERE id = ?', [Date.now(), playerId]);
    saveDatabase();
  },

  /**
   * @param {string} playerId
   * @param {string} fingerprint
   * @returns {boolean}
   */
  verifyFingerprint: (playerId, fingerprint) => {
    const result = getDb().exec('SELECT fingerprint FROM players WHERE id = ?', [playerId]);
    if (result.length === 0 || result[0].values.length === 0) { return false; }
    return result[0].values[0][0] === fingerprint;
  }
};

const scoreOps = {
  /**
   * @param {string} playerId
   * @param {number} score
   * @param {number} speedLevel
   * @returns {boolean}
   */
  add: (playerId, score, speedLevel) => {
    getDb().run(
      'INSERT INTO scores (player_id, score, speed_level, played_at) VALUES (?, ?, ?, ?)',
      [playerId, score, speedLevel, Date.now()]
    );
    saveDatabase();
    return true;
  },

  /**
   * @param {string} playerId
   * @returns {number}
   */
  getBestScore: (playerId) => {
    const result = getDb().exec(
      'SELECT MAX(score) as best_score FROM scores WHERE player_id = ?',
      [playerId]
    );
    if (result.length === 0 || result[0].values.length === 0) { return 0; }
    return /** @type {number} */ (result[0].values[0][0]) || 0;
  },

  /**
   * @param {string} playerId
   * @param {number} [limit=10]
   * @returns {ScoreEntry[]}
   */
  getPlayerHistory: (playerId, limit = 10) => {
    const result = getDb().exec(
      'SELECT score, speed_level, played_at FROM scores WHERE player_id = ? ORDER BY played_at DESC LIMIT ?',
      [playerId, limit]
    );
    if (result.length === 0) { return []; }
    
    return result[0].values.map((/** @type {any[]} */ row) => ({
      score: /** @type {number} */ (row[0]),
      speed_level: /** @type {number} */ (row[1]),
      played_at: /** @type {number} */ (row[2])
    }));
  },

  /**
   * @param {number} [limit=10]
   * @returns {HallOfFameEntry[]}
   */
  getHallOfFame: (limit = 10) => {
    const result = getDb().exec(`
      WITH best_scores AS (
        SELECT 
          player_id,
          MAX(score) as best_score,
          MAX(speed_level) as speed_level,
          MAX(played_at) as played_at
        FROM scores
        GROUP BY player_id
      )
      SELECT 
        p.username,
        bs.best_score as score,
        bs.speed_level,
        bs.played_at,
        ROW_NUMBER() OVER (ORDER BY bs.best_score DESC) as rank
      FROM best_scores bs
      JOIN players p ON bs.player_id = p.id
      ORDER BY bs.best_score DESC
      LIMIT ?
    `, [limit]);
    
    if (result.length === 0) { return []; }
    
    return result[0].values.map((/** @type {any[]} */ row) => ({
      username: /** @type {string} */ (row[0]),
      score: /** @type {number} */ (row[1]),
      speed_level: /** @type {number} */ (row[2]),
      played_at: /** @type {number} */ (row[3]),
      rank: /** @type {number} */ (row[4])
    }));
  },

  /**
   * @param {string} playerId
   * @returns {number | null}
   */
  getPlayerRank: (playerId) => {
    const bestScore = scoreOps.getBestScore(playerId);
    if (bestScore === 0) { return null; }

    const result = getDb().exec(`
      SELECT COUNT(DISTINCT player_id) + 1 as rank
      FROM scores
      WHERE score > (
        SELECT MAX(score)
        FROM scores
        WHERE player_id = ?
      )
    `, [playerId]);
    
    if (result.length === 0 || result[0].values.length === 0) { return null; }
    return /** @type {number} */ (result[0].values[0][0]);
  },

  /**
   * @param {string} playerId
   * @returns {number}
   */
  getTotalGames: (playerId) => {
    const result = getDb().exec(
      'SELECT COUNT(*) as total FROM scores WHERE player_id = ?',
      [playerId]
    );
    if (result.length === 0 || result[0].values.length === 0) { return 0; }
    return /** @type {number} */ (result[0].values[0][0]);
  }
};

const statsOps = {
  /** @returns {GlobalStats} */
  getGlobalStats: () => {
    const result = getDb().exec(`
      SELECT 
        COUNT(DISTINCT player_id) as total_players,
        COUNT(*) as total_games,
        MAX(score) as highest_score,
        AVG(score) as average_score
      FROM scores
    `);
    
    if (result.length === 0 || result[0].values.length === 0) {
      return {
        total_players: 0,
        total_games: 0,
        highest_score: 0,
        average_score: 0
      };
    }
    
    const row = result[0].values[0];
    return {
      total_players: /** @type {number} */ (row[0]) || 0,
      total_games: /** @type {number} */ (row[1]) || 0,
      highest_score: /** @type {number} */ (row[2]) || 0,
      average_score: Math.round(/** @type {number} */ (row[3]) || 0)
    };
  }
};

/** @returns {void} */
function closeDatabase() {
  saveDatabase();
}

const cheaterOps = {
  /**
   * @param {string} playerId
   * @param {string} username
   * @param {string} ipAddress
   * @param {string} fingerprint
   * @param {string} cheatType
   * @param {number} attemptedScore
   * @param {string} reason
   * @returns {void}
   */
  record: (playerId, username, ipAddress, fingerprint, cheatType, attemptedScore, reason) => {
    const now = Date.now();
    
    getDb().run(
      'INSERT INTO cheaters (player_id, username, ip_address, fingerprint, cheat_type, attempted_score, reason, caught_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [playerId, username, ipAddress, fingerprint, cheatType, attemptedScore, reason, now]
    );
    saveDatabase();
  },

  /**
   * @param {number} [limit=50]
   * @returns {HallOfShameEntry[]}
   */
  getHallOfShame: (limit = 50) => {
    const result = getDb().exec(`
      SELECT 
        c.username,
        c.ip_address,
        c.cheat_type,
        c.attempted_score,
        c.reason,
        c.caught_at,
        (SELECT COUNT(*) FROM cheaters WHERE player_id = c.player_id) as offense_count
      FROM cheaters c
      WHERE c.attempted_score = (
        SELECT MAX(attempted_score) FROM cheaters WHERE player_id = c.player_id
      )
      GROUP BY c.player_id
      ORDER BY c.caught_at DESC
      LIMIT ?
    `, [limit]);
    
    if (result.length === 0) { return []; }
    
    return result[0].values.map((/** @type {any[]} */ row) => ({
      username: /** @type {string} */ (row[0]),
      ip_address: /** @type {string} */ (row[1]),
      cheat_type: /** @type {string} */ (row[2]),
      attempted_score: /** @type {number} */ (row[3]),
      reason: /** @type {string} */ (row[4]),
      caught_at: /** @type {number} */ (row[5]),
      offense_count: /** @type {number} */ (row[6])
    }));
  },

  /**
   * @param {string} playerId
   * @returns {number}
   */
  getCheatCount: (playerId) => {
    const result = getDb().exec('SELECT COUNT(*) FROM cheaters WHERE player_id = ?', [playerId]);
    if (result.length === 0 || result[0].values.length === 0) { return 0; }
    return /** @type {number} */ (result[0].values[0][0]);
  },

  /**
   * @param {string} playerId
   * @returns {boolean}
   */
  isKnownCheater: (playerId) => cheaterOps.getCheatCount(playerId) > 0
};

module.exports = {
  initializeDatabase,
  playerOps,
  scoreOps,
  statsOps,
  cheaterOps,
  closeDatabase
};
