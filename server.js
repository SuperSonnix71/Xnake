const express = require('express');
const session = require('express-session');
const path = require('path');
const { initializeDatabase, playerOps, scoreOps, statsOps, closeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session configuration
app.use(session({
  secret: process.env.SESSION_SECRET || 'xnake-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 365, // 1 year
    httpOnly: true,
    secure: false // Set to true in production with HTTPS
  }
}));

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// API Routes

// Register a new player
app.post('/api/register', (req, res) => {
  const { username, fingerprint } = req.body;

  if (!username || !fingerprint) {
    return res.status(400).json({ error: 'Username and fingerprint required' });
  }

  // Validate username (3-20 chars, alphanumeric and underscores)
  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ 
      error: 'Username must be 3-20 characters (letters, numbers, underscores only)' 
    });
  }

  // Check if fingerprint already has a player
  const existingByFingerprint = playerOps.findByFingerprint(fingerprint);
  if (existingByFingerprint) {
    return res.status(400).json({ 
      error: 'This device is already registered',
      existingUsername: existingByFingerprint.username
    });
  }

  // Create new player
  const player = playerOps.create(username, fingerprint);
  
  if (!player) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  // Store player in session
  req.session.playerId = player.id;
  req.session.username = player.username;

  res.json({ 
    success: true, 
    player: { 
      id: player.id, 
      username: player.username 
    } 
  });
});

// Check current session
app.get('/api/session', (req, res) => {
  if (req.session.playerId) {
    const player = playerOps.findById(req.session.playerId);
    if (player) {
      playerOps.updateLastSeen(player.id);
      const bestScore = scoreOps.getBestScore(player.id);
      const totalGames = scoreOps.getTotalGames(player.id);
      const rank = scoreOps.getPlayerRank(player.id);

      return res.json({
        loggedIn: true,
        player: {
          id: player.id,
          username: player.username,
          bestScore,
          totalGames,
          rank
        }
      });
    }
  }
  
  res.json({ loggedIn: false });
});

// Verify player with fingerprint
app.post('/api/verify', (req, res) => {
  const { fingerprint } = req.body;

  if (!fingerprint) {
    return res.status(400).json({ error: 'Fingerprint required' });
  }

  // Check if session exists
  if (req.session.playerId) {
    const isValid = playerOps.verifyFingerprint(req.session.playerId, fingerprint);
    
    if (isValid) {
      const player = playerOps.findById(req.session.playerId);
      const bestScore = scoreOps.getBestScore(player.id);
      const totalGames = scoreOps.getTotalGames(player.id);
      const rank = scoreOps.getPlayerRank(player.id);

      return res.json({
        verified: true,
        player: {
          id: player.id,
          username: player.username,
          bestScore,
          totalGames,
          rank
        }
      });
    } else {
      // Fingerprint doesn't match - possible device change or tampering
      req.session.destroy();
      return res.json({ verified: false, reason: 'fingerprint_mismatch' });
    }
  }

  // No session, check if fingerprint exists
  const player = playerOps.findByFingerprint(fingerprint);
  if (player) {
    // Auto-login existing player
    req.session.playerId = player.id;
    req.session.username = player.username;
    playerOps.updateLastSeen(player.id);
    
    const bestScore = scoreOps.getBestScore(player.id);
    const totalGames = scoreOps.getTotalGames(player.id);
    const rank = scoreOps.getPlayerRank(player.id);

    return res.json({
      verified: true,
      autoLogin: true,
      player: {
        id: player.id,
        username: player.username,
        bestScore,
        totalGames,
        rank
      }
    });
  }

  res.json({ verified: false, reason: 'not_registered' });
});

// Submit score
app.post('/api/score', (req, res) => {
  if (!req.session.playerId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { score, speedLevel, fingerprint } = req.body;

  if (typeof score !== 'number' || typeof speedLevel !== 'number') {
    return res.status(400).json({ error: 'Invalid score data' });
  }

  // Verify fingerprint
  if (!playerOps.verifyFingerprint(req.session.playerId, fingerprint)) {
    return res.status(403).json({ error: 'Fingerprint verification failed' });
  }

  // Add score to database
  scoreOps.add(req.session.playerId, score, speedLevel);
  
  // Get updated stats
  const bestScore = scoreOps.getBestScore(req.session.playerId);
  const rank = scoreOps.getPlayerRank(req.session.playerId);
  const isNewBest = score === bestScore;

  res.json({ 
    success: true, 
    bestScore,
    rank,
    isNewBest
  });
});

// Get hall of fame
app.get('/api/halloffame', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const hallOfFame = scoreOps.getHallOfFame(limit);
  res.json({ hallOfFame });
});

// Get player stats
app.get('/api/player/stats', (req, res) => {
  if (!req.session.playerId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const player = playerOps.findById(req.session.playerId);
  const bestScore = scoreOps.getBestScore(req.session.playerId);
  const totalGames = scoreOps.getTotalGames(req.session.playerId);
  const history = scoreOps.getPlayerHistory(req.session.playerId, 10);
  const rank = scoreOps.getPlayerRank(req.session.playerId);

  res.json({
    player: {
      username: player.username,
      bestScore,
      totalGames,
      rank
    },
    history
  });
});

// Get global stats
app.get('/api/stats', (req, res) => {
  const stats = statsOps.getGlobalStats();
  res.json({ stats });
});

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

// Route for the main page
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start the server after initializing database
async function startServer() {
  try {
    await initializeDatabase();
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🐍 Xnake Game Server is running!`);
      console.log(`🌐 Open your browser and navigate to: http://localhost:${PORT}`);
      console.log(`🎮 Use Arrow Keys or WASD to control the snake`);
      console.log(`🏆 Hall of Fame enabled with persistent scores!`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('SIGTERM signal received: closing HTTP server');
      server.close(() => {
        console.log('HTTP server closed');
        closeDatabase();
        process.exit(0);
      });
    });

    process.on('SIGINT', () => {
      console.log('SIGINT signal received: closing HTTP server');
      server.close(() => {
        console.log('HTTP server closed');
        closeDatabase();
        process.exit(0);
      });
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

startServer();
