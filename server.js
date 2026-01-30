const express = require('express');
const session = require('express-session');
const path = require('path');
const { initializeDatabase, playerOps, scoreOps, statsOps, closeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

const rateLimit = new Map();

function checkRateLimit(playerId, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const playerRequests = rateLimit.get(playerId) || [];
  const recentRequests = playerRequests.filter(time => now - time < windowMs);
  
  if (recentRequests.length >= maxRequests) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimit.set(playerId, recentRequests);
  return true;
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_SECRET || 'xnake-secret-key-change-in-production',
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 1000 * 60 * 60 * 24 * 365,
    httpOnly: true,
    secure: false
  }
}));

app.use(express.static(path.join(__dirname, 'public')));

app.post('/api/register', (req, res) => {
  const { username, fingerprint } = req.body;

  if (!username || !fingerprint) {
    return res.status(400).json({ error: 'Username and fingerprint required' });
  }

  if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
    return res.status(400).json({ 
      error: 'Username must be 3-20 characters (letters, numbers, underscores only)' 
    });
  }

  const existingByFingerprint = playerOps.findByFingerprint(fingerprint);
  if (existingByFingerprint) {
    return res.status(400).json({ 
      error: 'This device is already registered',
      existingUsername: existingByFingerprint.username
    });
  }

  const player = playerOps.create(username, fingerprint);
  
  if (!player) {
    return res.status(409).json({ error: 'Username already taken' });
  }

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

app.post('/api/verify', (req, res) => {
  const { fingerprint } = req.body;

  if (!fingerprint) {
    return res.status(400).json({ error: 'Fingerprint required' });
  }

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
      req.session.destroy();
      return res.json({ verified: false, reason: 'fingerprint_mismatch' });
    }
  }

  const player = playerOps.findByFingerprint(fingerprint);
  if (player) {
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

app.post('/api/score', (req, res) => {
  if (!req.session.playerId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!checkRateLimit(req.session.playerId, 10, 60000)) {
    return res.status(429).json({ error: 'Too many score submissions. Please wait.' });
  }

  const { score, speedLevel, fingerprint, gameDuration, foodEaten } = req.body;

  if (typeof score !== 'number' || typeof speedLevel !== 'number') {
    return res.status(400).json({ error: 'Invalid score data' });
  }

  if (score < 0) {
    return res.status(400).json({ error: 'Invalid score: negative value' });
  }

  if (score > 10000) {
    return res.status(400).json({ error: 'Invalid score: exceeds maximum' });
  }

  if (foodEaten) {
    if (foodEaten * 10 !== score) {
      const player = playerOps.findById(req.session.playerId);
      console.log(`[CHEAT DETECTED] Player: ${player.username} (${req.session.playerId}) - Food: ${foodEaten}, Score: ${score} (expected ${foodEaten * 10})`);
      return res.status(400).json({ error: 'Score does not match food eaten' });
    }
  }

  const maxSpeedLevel = Math.floor((150 - 50) / 3) + 1;
  if (speedLevel > maxSpeedLevel) {
    return res.status(400).json({ error: 'Invalid speed level' });
  }

  if (gameDuration && speedLevel > 5) {
    const minDuration = speedLevel * 1.5;
    if (gameDuration < minDuration) {
      console.log(`[CHEAT DETECTED] Player: ${req.session.playerId} - Duration: ${gameDuration}s, Speed: ${speedLevel} (too fast, min: ${minDuration}s)`);
      return res.status(400).json({ error: 'Game completed too quickly' });
    }
  }

  if (!playerOps.verifyFingerprint(req.session.playerId, fingerprint)) {
    return res.status(403).json({ error: 'Fingerprint verification failed' });
  }

  scoreOps.add(req.session.playerId, score, speedLevel);
  
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

app.get('/api/halloffame', (req, res) => {
  const limit = parseInt(req.query.limit) || 10;
  const hallOfFame = scoreOps.getHallOfFame(limit);
  res.json({ hallOfFame });
});

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

app.get('/api/stats', (req, res) => {
  const stats = statsOps.getGlobalStats();
  res.json({ stats });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy();
  res.json({ success: true });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

async function startServer() {
  try {
    await initializeDatabase();
    
    const server = app.listen(PORT, '0.0.0.0', () => {
      console.log(`🐍 Xnake Game Server is running!`);
      console.log(`🌐 Open your browser and navigate to: http://localhost:${PORT}`);
      console.log(`🎮 Use Arrow Keys or WASD to control the snake`);
      console.log(`🏆 Hall of Fame enabled with persistent scores!`);
    });

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
