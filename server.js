const express = require('express');
const session = require('express-session');
const path = require('path');
const { initializeDatabase, playerOps, scoreOps, statsOps, cheaterOps, closeDatabase } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

const rateLimit = new Map();
const activeSessions = new Map();

function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0].trim() || 
         req.headers['x-real-ip'] || 
         req.socket.remoteAddress || 
         'unknown';
}

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

function seededRandom(seed) {
  const x = Math.sin(seed++) * 10000;
  return x - Math.floor(x);
}

function validateGameReplay(moves, seed, expectedScore, expectedFoodEaten, gameDuration, totalFrames) {
  const GRID_SIZE = 30;
  const INITIAL_SPEED = 150;
  const SPEED_INCREASE = 3;
  const MIN_SPEED = 50;
  
  // Logging setup
  const log = {
    frames: [],
    summary: {},
    errors: []
  };
  
  const center = Math.floor(GRID_SIZE / 2);
  let snake = [
    { x: center, y: center },
    { x: center - 1, y: center },
    { x: center - 2, y: center }
  ];
  
  let direction = { x: 1, y: 0 };
  let score = 0;
  let foodEaten = 0;
  let currentSpeed = INITIAL_SPEED;
  
  function spawnFood() {
    let newFood;
    let attempts = 0;
    const maxAttempts = GRID_SIZE * GRID_SIZE;
    
    do {
      const randValue = seededRandom(seed + foodEaten + attempts);
      newFood = {
        x: Math.floor(randValue * GRID_SIZE),
        y: Math.floor(seededRandom(seed + foodEaten + attempts + 1) * GRID_SIZE)
      };
      attempts++;
    } while (snake.some(seg => seg.x === newFood.x && seg.y === newFood.y) && attempts < maxAttempts);
    
    return newFood;
  }
  
  let food = spawnFood();
  let moveIndex = 0;
  let frameCount = 0;
  
  const directions = [
    { x: 0, y: -1 },  // 0: UP
    { x: 1, y: 0 },   // 1: RIGHT
    { x: 0, y: 1 },   // 2: DOWN
    { x: -1, y: 0 }   // 3: LEFT
  ];
  
  // Log initial state
  log.frames.push({
    frame: 0,
    snake: JSON.parse(JSON.stringify(snake)),
    food: JSON.parse(JSON.stringify(food)),
    direction: JSON.parse(JSON.stringify(direction)),
    score,
    foodEaten
  });
  
  // Frame-by-frame simulation
  const maxFrames = totalFrames ? totalFrames + 10 : 10000; // Allow slight buffer
  
  while (frameCount < maxFrames) {
    frameCount++;
    
    // Apply direction change if there's a move for this frame
    if (moveIndex < moves.length && moves[moveIndex].f === frameCount) {
      const newDir = directions[moves[moveIndex].d];
      if (newDir && (newDir.x !== -direction.x || newDir.y !== -direction.y)) {
        direction = newDir;
        
        // Log direction change
        if (frameCount % 10 === 0 || foodEaten < 3) {
          log.frames.push({
            frame: frameCount,
            action: 'direction_change',
            direction: JSON.parse(JSON.stringify(direction)),
            moveIndex
          });
        }
      }
      moveIndex++;
    }
    
    // Move snake
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
    
    // Check wall collision
    if (head.x < 0 || head.x >= GRID_SIZE || head.y < 0 || head.y >= GRID_SIZE) {
      log.frames.push({
        frame: frameCount,
        action: 'wall_collision',
        head: JSON.parse(JSON.stringify(head)),
        finalScore: score,
        finalFoodEaten: foodEaten
      });
      break;
    }
    
    // Check self collision
    if (snake.some(seg => seg.x === head.x && seg.y === head.y)) {
      log.frames.push({
        frame: frameCount,
        action: 'self_collision',
        head: JSON.parse(JSON.stringify(head)),
        finalScore: score,
        finalFoodEaten: foodEaten
      });
      break;
    }
    
    snake.unshift(head);
    
    // Check food collision
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      foodEaten++;
      
      // Log food eaten
      log.frames.push({
        frame: frameCount,
        action: 'food_eaten',
        score,
        foodEaten,
        foodPosition: JSON.parse(JSON.stringify(food)),
        snakeLength: snake.length
      });
      
      food = spawnFood();
      
      if (currentSpeed > MIN_SPEED) {
        currentSpeed -= SPEED_INCREASE;
      }
    } else {
      snake.pop();
    }
    
    if (foodEaten > 1000) {
      log.errors.push('Too many food eaten');
      return { 
        valid: false, 
        reason: 'Too many food eaten',
        log 
      };
    }
    
    // Safety: break if simulation is too long
    if (frameCount >= 10000) {
      log.errors.push('Simulation exceeded maximum frames');
      break;
    }
  }
  
  // Calculate simulated duration based on frame count
  let simulatedTime = 0;
  let tempSpeed = INITIAL_SPEED;
  let tempFoodCount = 0;
  
  for (let i = 0; i < frameCount; i++) {
    simulatedTime += tempSpeed;
    // Note: This is approximate since we don't track exactly when speed changed
    if (tempFoodCount < foodEaten) {
      tempFoodCount++;
      if (tempSpeed > MIN_SPEED) {
        tempSpeed -= SPEED_INCREASE;
      }
    }
  }
  
  const simulatedDuration = Math.floor(simulatedTime / 1000);
  
  // Summary
  log.summary = {
    totalFrames: frameCount,
    finalScore: score,
    finalFoodEaten: foodEaten,
    expectedScore,
    expectedFoodEaten,
    simulatedDuration,
    reportedDuration: gameDuration,
    movesApplied: moveIndex,
    totalMovesProvided: moves.length
  };
  
  // Validation with tolerance
  const scoreDiff = Math.abs(score - expectedScore);
  const foodDiff = Math.abs(foodEaten - expectedFoodEaten);
  
  // Allow small tolerance for very short games (edge cases in timing)
  const scoreTolerance = foodEaten <= 2 ? 20 : 0;
  
  if (scoreDiff > scoreTolerance) {
    log.errors.push(`Score mismatch: replay calculated ${score}, client sent ${expectedScore}, diff ${scoreDiff}`);
    return { 
      valid: false, 
      reason: `Score mismatch: replay calculated ${score}, client sent ${expectedScore} (diff: ${scoreDiff})`,
      log
    };
  }
  
  if (foodDiff > 0) {
    log.errors.push(`Food count mismatch: replay calculated ${foodEaten}, client sent ${expectedFoodEaten}`);
    return { 
      valid: false, 
      reason: `Food count mismatch: replay calculated ${foodEaten}, client sent ${expectedFoodEaten}`,
      log
    };
  }
  
  // Duration validation with tolerance
  const durationDiff = Math.abs(simulatedDuration - gameDuration);
  const maxDurationDiff = Math.max(5, gameDuration * 0.15);
  
  if (durationDiff > maxDurationDiff) {
    log.errors.push(`Duration mismatch: simulated ${simulatedDuration}s, reported ${gameDuration}s`);
    return {
      valid: false,
      reason: `Game duration mismatch: client reported ${gameDuration}s, server simulated ${simulatedDuration}s (diff: ${durationDiff}s, max allowed: ${Math.floor(maxDurationDiff)}s)`,
      log
    };
  }
  
  return { 
    valid: true, 
    replayedScore: score, 
    replayedFoodEaten: foodEaten,
    log 
  };
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

app.post('/api/game/start', (req, res) => {
  if (!req.session.playerId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { fingerprint } = req.body;
  
  if (!playerOps.verifyFingerprint(req.session.playerId, fingerprint)) {
    return res.status(403).json({ error: 'Fingerprint verification failed' });
  }

  const seed = Math.floor(Math.random() * 1000000);
  
  activeSessions.set(req.session.playerId, {
    seed,
    startTime: Date.now()
  });

  res.json({ success: true, seed });
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

  const { score, speedLevel, fingerprint, gameDuration, foodEaten, seed, moves, totalFrames } = req.body;

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
      const ipAddress = getClientIP(req);
      console.log(`[CHEAT DETECTED] Player: ${player.username} (${req.session.playerId}) - Food: ${foodEaten}, Score: ${score} (expected ${foodEaten * 10})`);
      cheaterOps.record(req.session.playerId, player.username, ipAddress, fingerprint, 'score_mismatch', score, `Score ${score} does not match food eaten ${foodEaten}`);
      return res.status(400).json({ error: 'Score does not match food eaten' });
    }
  }

  if (gameDuration && speedLevel > 5) {
    const minDuration = speedLevel * 1.5;
    if (gameDuration < minDuration) {
      const player = playerOps.findById(req.session.playerId);
      const ipAddress = getClientIP(req);
      console.log(`[CHEAT DETECTED] Player: ${player.username} - Duration: ${gameDuration}s, Speed: ${speedLevel} (too fast, min: ${minDuration}s)`);
      cheaterOps.record(req.session.playerId, player.username, ipAddress, fingerprint, 'speed_hack', score, `Game too fast: ${gameDuration}s (min ${minDuration}s)`);
      return res.status(400).json({ error: 'Game completed too quickly' });
    }
  }

  if (!playerOps.verifyFingerprint(req.session.playerId, fingerprint)) {
    return res.status(403).json({ error: 'Fingerprint verification failed' });
  }

  const session = activeSessions.get(req.session.playerId);
  if (!session || session.seed !== seed) {
    const player = playerOps.findById(req.session.playerId);
    const ipAddress = getClientIP(req);
    console.log(`[CHEAT DETECTED] Player: ${player.username} - Invalid or missing game session`);
    cheaterOps.record(req.session.playerId, player.username, ipAddress, fingerprint, 'invalid_session', score, 'Invalid or missing game session');
    return res.status(400).json({ error: 'Invalid game session' });
  }

  if (!moves || typeof moves !== 'string') {
    const player = playerOps.findById(req.session.playerId);
    const ipAddress = getClientIP(req);
    console.log(`[CHEAT DETECTED] Player: ${player.username} - Missing move history`);
    cheaterOps.record(req.session.playerId, player.username, ipAddress, fingerprint, 'missing_moves', score, 'Missing move history');
    return res.status(400).json({ error: 'Move history required' });
  }

  // Parse moves: format is "direction,frame,timestamp"
  const parsedMoves = moves.split(';').map(moveStr => {
    const parts = moveStr.split(',').map(Number);
    if (parts.length === 3) {
      return { d: parts[0], f: parts[1], t: parts[2] };
    } else if (parts.length === 2) {
      // Backward compatibility: old format without frame numbers
      return { d: parts[0], f: 0, t: parts[1] };
    }
    return null;
  }).filter(m => m && !isNaN(m.d) && !isNaN(m.f) && !isNaN(m.t));

  const validation = validateGameReplay(parsedMoves, seed, score, foodEaten, gameDuration, totalFrames);
  
  if (!validation.valid) {
    const player = playerOps.findById(req.session.playerId);
    const ipAddress = getClientIP(req);
    
    // Comprehensive logging
    console.log(`\n========== CHEAT DETECTION ==========`);
    console.log(`Player: ${player.username} (ID: ${player.id})`);
    console.log(`IP Address: ${ipAddress}`);
    console.log(`Reason: ${validation.reason}`);
    console.log(`\n--- Game Summary ---`);
    console.log(JSON.stringify(validation.log.summary, null, 2));
    
    if (validation.log.errors.length > 0) {
      console.log(`\n--- Errors ---`);
      validation.log.errors.forEach(err => console.log(`  - ${err}`));
    }
    
    // Log last few frames for debugging
    const recentFrames = validation.log.frames.slice(-5);
    if (recentFrames.length > 0) {
      console.log(`\n--- Last 5 Frames ---`);
      console.log(JSON.stringify(recentFrames, null, 2));
    }
    
    console.log(`=====================================\n`);
    
    cheaterOps.record(req.session.playerId, player.username, ipAddress, fingerprint, 'replay_fail', score, validation.reason);
    return res.status(400).json({ error: 'Game validation failed: ' + validation.reason });
  }
  
  // Log successful validation for high scores
  if (score >= 100) {
    console.log(`[VALID SCORE] Player: ${playerOps.findById(req.session.playerId).username} - Score: ${score}, Food: ${foodEaten}, Duration: ${gameDuration}s`);
  }

  activeSessions.delete(req.session.playerId);

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

app.get('/api/hallofshame', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const hallOfShame = cheaterOps.getHallOfShame(limit);
  res.json({ hallOfShame });
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
