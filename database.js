const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Database file path
const dbPath = path.join(__dirname, 'xnake.db');

let db = null;
let SQL = null;

// Initialize database
async function initializeDatabase() {
    // Load sql.js
    SQL = await initSqlJs();
    
    // Load or create database
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

    // Create tables
    db.run(`
        CREATE TABLE IF NOT EXISTS players (
            id TEXT PRIMARY KEY,
            username TEXT UNIQUE NOT NULL,
            fingerprint TEXT NOT NULL,
            created_at INTEGER NOT NULL,
            last_seen INTEGER NOT NULL
        )
    `);

    db.run(`
        CREATE TABLE IF NOT EXISTS scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            player_id TEXT NOT NULL,
            score INTEGER NOT NULL,
            speed_level INTEGER NOT NULL,
            played_at INTEGER NOT NULL,
            FOREIGN KEY (player_id) REFERENCES players(id)
        )
    `);

    // Create indexes for better performance
    db.run(`CREATE INDEX IF NOT EXISTS idx_scores_player ON scores(player_id)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_scores_score ON scores(score DESC)`);
    db.run(`CREATE INDEX IF NOT EXISTS idx_players_fingerprint ON players(fingerprint)`);

    // Save database
    saveDatabase();
}

// Save database to file
function saveDatabase() {
    if (!db) return;
    
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(dbPath, buffer);
    } catch (error) {
        console.error('Error saving database:', error);
    }
}

// Player operations
const playerOps = {
    // Create a new player
    create: (username, fingerprint) => {
        const playerId = uuidv4();
        const now = Date.now();
        
        try {
            db.run(
                'INSERT INTO players (id, username, fingerprint, created_at, last_seen) VALUES (?, ?, ?, ?, ?)',
                [playerId, username, fingerprint, now, now]
            );
            saveDatabase();
            return { id: playerId, username, fingerprint };
        } catch (error) {
            // Username or fingerprint already exists
            return null;
        }
    },

    // Find player by username
    findByUsername: (username) => {
        const result = db.exec('SELECT * FROM players WHERE username = ?', [username]);
        if (result.length === 0 || result[0].values.length === 0) return null;
        
        const row = result[0].values[0];
        return {
            id: row[0],
            username: row[1],
            fingerprint: row[2],
            created_at: row[3],
            last_seen: row[4]
        };
    },

    // Find player by ID
    findById: (playerId) => {
        const result = db.exec('SELECT * FROM players WHERE id = ?', [playerId]);
        if (result.length === 0 || result[0].values.length === 0) return null;
        
        const row = result[0].values[0];
        return {
            id: row[0],
            username: row[1],
            fingerprint: row[2],
            created_at: row[3],
            last_seen: row[4]
        };
    },

    // Find player by fingerprint
    findByFingerprint: (fingerprint) => {
        const result = db.exec('SELECT * FROM players WHERE fingerprint = ?', [fingerprint]);
        if (result.length === 0 || result[0].values.length === 0) return null;
        
        const row = result[0].values[0];
        return {
            id: row[0],
            username: row[1],
            fingerprint: row[2],
            created_at: row[3],
            last_seen: row[4]
        };
    },

    // Update last seen
    updateLastSeen: (playerId) => {
        db.run('UPDATE players SET last_seen = ? WHERE id = ?', [Date.now(), playerId]);
        saveDatabase();
    },

    // Verify player owns the fingerprint
    verifyFingerprint: (playerId, fingerprint) => {
        const result = db.exec('SELECT fingerprint FROM players WHERE id = ?', [playerId]);
        if (result.length === 0 || result[0].values.length === 0) return false;
        return result[0].values[0][0] === fingerprint;
    }
};

// Score operations
const scoreOps = {
    // Add a new score
    add: (playerId, score, speedLevel) => {
        db.run(
            'INSERT INTO scores (player_id, score, speed_level, played_at) VALUES (?, ?, ?, ?)',
            [playerId, score, speedLevel, Date.now()]
        );
        saveDatabase();
        return true;
    },

    // Get player's best score
    getBestScore: (playerId) => {
        const result = db.exec(
            'SELECT MAX(score) as best_score FROM scores WHERE player_id = ?',
            [playerId]
        );
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return result[0].values[0][0] || 0;
    },

    // Get player's score history
    getPlayerHistory: (playerId, limit = 10) => {
        const result = db.exec(
            'SELECT score, speed_level, played_at FROM scores WHERE player_id = ? ORDER BY played_at DESC LIMIT ?',
            [playerId, limit]
        );
        if (result.length === 0) return [];
        
        return result[0].values.map(row => ({
            score: row[0],
            speed_level: row[1],
            played_at: row[2]
        }));
    },

    // Get hall of fame (top scores) - only best score per player
    getHallOfFame: (limit = 10) => {
        const result = db.exec(`
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
        
        if (result.length === 0) return [];
        
        return result[0].values.map(row => ({
            username: row[0],
            score: row[1],
            speed_level: row[2],
            played_at: row[3],
            rank: row[4]
        }));
    },

    // Get player's ranking
    getPlayerRank: (playerId) => {
        const bestScore = scoreOps.getBestScore(playerId);
        if (bestScore === 0) return null;

        const result = db.exec(`
            SELECT COUNT(DISTINCT player_id) + 1 as rank
            FROM scores
            WHERE score > (
                SELECT MAX(score)
                FROM scores
                WHERE player_id = ?
            )
        `, [playerId]);
        
        if (result.length === 0 || result[0].values.length === 0) return null;
        return result[0].values[0][0];
    },

    // Get total number of games played
    getTotalGames: (playerId) => {
        const result = db.exec(
            'SELECT COUNT(*) as total FROM scores WHERE player_id = ?',
            [playerId]
        );
        if (result.length === 0 || result[0].values.length === 0) return 0;
        return result[0].values[0][0];
    }
};

// Stats operations
const statsOps = {
    // Get global statistics
    getGlobalStats: () => {
        const result = db.exec(`
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
            total_players: row[0] || 0,
            total_games: row[1] || 0,
            highest_score: row[2] || 0,
            average_score: Math.round(row[3] || 0)
        };
    }
};

// Close database (for graceful shutdown)
function closeDatabase() {
    saveDatabase();
}

module.exports = {
    initializeDatabase,
    playerOps,
    scoreOps,
    statsOps,
    closeDatabase
};
