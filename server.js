const express = require('express');
/** @type {any} */
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const { initializeDatabase, playerOps, scoreOps, statsOps, cheaterOps, mlOps, closeDatabase } = require('./database');
const { extractFeatures, featuresToArray, normalizeFeatures, createTimeSeriesFeatures } = require('./ml/features');
const { predict, loadModel, isModelAvailable } = require('./ml/model');
const { onCheatDetected, getTrainingStatus } = require('./ml/worker');
const { processAndLogEdgeCase, getEdgeCases, getEdgeCaseStats } = require('./ml/edgecases');
const { getActiveVersion, getAllVersions, getTrainingLogs } = require('./ml/versioning');

/** @typedef {import('express').Request} Request */
/** @typedef {import('express').Response} Response */
/** @typedef {{ d: number, f: number, t: number }} Move */
/** @typedef {{ moveIndex: number, gapMs: number, gapSeconds: number }} SuspiciousGap */
/** @typedef {{ hasPause: boolean, suspiciousGaps: SuspiciousGap[], totalSuspiciousTime?: number, gapCount?: number }} PauseCheckResult */
/** @typedef {{ valid: boolean, reason?: string, suspicious?: boolean, issues?: object[], heartbeatCount?: number, avgMsPerFrame?: number }} HeartbeatValidationResult */
/** @typedef {{ isBot: boolean, reason?: string, movesPerFood?: number, details?: object }} BotDetectionResult */
/** @typedef {{ frames: object[], summary: object, errors: string[] }} GameValidationLog */
/** @typedef {{ valid: boolean, reason?: string, replayedScore?: number, replayedFoodEaten?: number, log: GameValidationLog }} GameValidationResult */
/** @typedef {{ seed: number, startTime: number }} GameSession */

const app = express();
const PORT = Number(process.env.PORT) || 3000;

/** @type {Map<string, number[]>} */
const rateLimit = new Map();
/** @type {Map<string, GameSession>} */
const activeSessions = new Map();

const SESSION_TIMEOUT_MS = 30 * 60 * 1000;
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000;

/** @returns {void} */
function cleanupStaleSessions() {
  const now = Date.now();
  
  for (const [playerId, gameSession] of activeSessions) {
    if (now - gameSession.startTime > SESSION_TIMEOUT_MS) {
      activeSessions.delete(playerId);
    }
  }
  
  for (const [playerId, timestamps] of rateLimit) {
    const recent = timestamps.filter((/** @type {number} */ t) => now - t < 3600000);
    if (recent.length === 0) {
      rateLimit.delete(playerId);
    } else {
      rateLimit.set(playerId, recent);
    }
  }
}

setInterval(cleanupStaleSessions, CLEANUP_INTERVAL_MS);

const gameLogPath = path.join(__dirname, 'game_activity.log');
const cheatLogPath = path.join(__dirname, 'cheat_detection.log');

/**
 * @param {string} filePath
 * @param {string} message
 * @returns {void}
 */
function logToFile(filePath, message) {
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(filePath, logEntry);
}

/**
 * @param {string} player
 * @param {number} score
 * @param {string} result
 * @param {string} [details='']
 * @returns {void}
 */
function logGameActivity(player, score, result, details = '') {
  const message = `Player: ${player} | Score: ${score} | Result: ${result} | ${details}`;
  logToFile(gameLogPath, message);
  console.log(`[GAME] ${message}`);
}

/**
 * @param {string} player
 * @param {string} ip
 * @param {string} cheatType
 * @param {number} score
 * @param {string} reason
 * @param {string} [details='']
 * @returns {void}
 */
function logCheatDetection(player, ip, cheatType, score, reason, details = '') {
  const message = `Player: ${player} | IP: ${ip} | Type: ${cheatType} | Score: ${score} | Reason: ${reason} | ${details}`;
  logToFile(cheatLogPath, message);
  console.log(`[CHEAT] ${message}`);
}

/**
 * @param {Request} req
 * @returns {string}
 */
function getClientIP(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim();
  }
  return /** @type {string} */ (req.headers['x-real-ip']) || 
         req.socket.remoteAddress || 
         'unknown';
}

/**
 * @param {string} playerId
 * @param {number} [maxRequests=10]
 * @param {number} [windowMs=60000]
 * @returns {boolean}
 */
function checkRateLimit(playerId, maxRequests = 10, windowMs = 60000) {
  const now = Date.now();
  const playerRequests = rateLimit.get(playerId) || [];
  const recentRequests = playerRequests.filter((/** @type {number} */ time) => now - time < windowMs);
  
  if (recentRequests.length >= maxRequests) {
    return false;
  }
  
  recentRequests.push(now);
  rateLimit.set(playerId, recentRequests);
  return true;
}


/**
 * @param {string} playerId
 * @param {number} score
 * @param {boolean} isCheat
 * @param {string|null} cheatType
 * @param {Move[]} parsedMoves
 * @param {any[]} parsedHeartbeats
 * @param {number} foodEaten
 * @param {number} gameDuration
 * @returns {void}
 */
function saveMLTrainingData(playerId, score, isCheat, cheatType, parsedMoves, parsedHeartbeats, foodEaten, gameDuration) {
  try {
    const features = extractFeatures(parsedMoves, parsedHeartbeats, score, foodEaten, gameDuration);
    mlOps.saveTrainingData(
      playerId,
      score,
      isCheat,
      cheatType,
      features,
      parsedMoves.slice(0, 500),
      parsedHeartbeats.slice(0, 100)
    );
  } catch (err) {
    console.error('[ML] Error saving training data:', err);
  }
}

/**
 * @param {number} seedValue
 * @returns {number}
 */
function seededRandom(seedValue) {
  const x = Math.sin(seedValue) * 10000;
  return x - Math.floor(x);
}

/**
 * @param {Move[]} moves
 * @param {number} _gameDuration
 * @returns {PauseCheckResult}
 */
function detectPauseAbuse(moves, _gameDuration) {
  if (!moves || moves.length < 2) {
    return { hasPause: false, suspiciousGaps: [] };
  }
  
  /** @type {SuspiciousGap[]} */
  const suspiciousGaps = [];
  const SUSPICIOUS_GAP_MS = 10000;
  
  for (let i = 1; i < moves.length; i++) {
    const timeDiff = moves[i].t - moves[i-1].t;
    if (timeDiff > SUSPICIOUS_GAP_MS) {
      suspiciousGaps.push({
        moveIndex: i,
        gapMs: timeDiff,
        gapSeconds: Math.floor(timeDiff / 1000)
      });
    }
  }
  
  const totalSuspiciousTime = suspiciousGaps.reduce((sum, gap) => sum + gap.gapMs, 0);
  const hasPause = suspiciousGaps.length > 0;
  
  return {
    hasPause,
    suspiciousGaps,
    totalSuspiciousTime: Math.floor(totalSuspiciousTime / 1000),
    gapCount: suspiciousGaps.length
  };
}

/**
 * @param {string[]} heartbeats
 * @param {number} _gameDuration
 * @param {number} _totalFrames
 * @returns {HeartbeatValidationResult}
 */
function validateHeartbeats(heartbeats, _gameDuration, _totalFrames) {
  if (!heartbeats || heartbeats.length < 2) {
    return { 
      valid: false, 
      reason: 'Insufficient heartbeat data (possible timing manipulation)',
      suspicious: true
    };
  }
  
  /** @type {object[]} */
  const issues = [];
  
  const parsed = heartbeats.map((/** @type {string} */ hb) => {
    const parts = hb.split(',').map(Number);
    return { t: parts[0], p: parts[1], f: parts[2], s: parts[3], score: parts[4] };
  });
  
  for (let i = 1; i < parsed.length; i++) {
    const timeDiff = parsed[i].t - parsed[i-1].t;
    const frameDiff = parsed[i].f - parsed[i-1].f;
    const avgSpeed = (parsed[i].s + parsed[i-1].s) / 2;
    
    const expectedTime = frameDiff * avgSpeed;
    const tolerance = Math.max(200, expectedTime * 0.3);
    
    const diff = Math.abs(timeDiff - expectedTime);
    
    if (diff > tolerance) {
      issues.push({
        index: i,
        timeDiff,
        frameDiff,
        expectedTime,
        diff,
        ratio: timeDiff / expectedTime
      });
    }
  }
  
  for (let i = 0; i < parsed.length; i++) {
    const timeDiff = Math.abs(parsed[i].t - parsed[i].p);
    if (timeDiff > 5000) {
      issues.push({
        index: i,
        type: 'performance_time_mismatch',
        dateTime: parsed[i].t,
        perfTime: parsed[i].p,
        diff: timeDiff
      });
    }
  }
  
  const firstHB = parsed[0];
  const lastHB = parsed[parsed.length - 1];
  const totalTime = lastHB.t - firstHB.t;
  const totalFramesInHB = lastHB.f - firstHB.f;
  const avgSpeedFromHB = totalTime / totalFramesInHB;
  
  if (avgSpeedFromHB > 200) {
    issues.push({
      type: 'game_too_slow',
      avgMsPerFrame: avgSpeedFromHB,
      totalTime,
      totalFrames: totalFramesInHB,
      suspectedSlowdown: avgSpeedFromHB / 100
    });
  }
  
  if (avgSpeedFromHB < 40 && lastHB.f > 100) {
    issues.push({
      type: 'game_too_fast',
      avgMsPerFrame: avgSpeedFromHB,
      totalTime,
      totalFrames: totalFramesInHB
    });
  }
  
  return {
    valid: issues.length === 0,
    issues,
    heartbeatCount: parsed.length,
    avgMsPerFrame: avgSpeedFromHB,
    suspicious: issues.length > 0
  };
}

/**
 * @param {Move[]} moves
 * @param {number} foodEaten
 * @param {number} score
 * @returns {BotDetectionResult}
 */
function detectBotUsage(moves, foodEaten, score) {
  if (!moves || !foodEaten || foodEaten === 0) {
    return { isBot: false };
  }
  
  const movesPerFood = moves.length / foodEaten;
  
  if (score > 1000 && movesPerFood > 4.0) {
    return {
      isBot: true,
      reason: `Impossible score with bot-like move patterns (${movesPerFood.toFixed(2)} moves per food)`,
      movesPerFood,
      details: {
        score,
        moves: moves.length,
        foodEaten,
        movesPerFood: movesPerFood.toFixed(2),
        threshold: 4.0,
        humanAverage: '2.0-3.5'
      }
    };
  }
  
  return { isBot: false, movesPerFood };
}

/**
 * @param {{ x: number, y: number }} pos
 * @param {{ x: number, y: number }[]} snakeBody
 * @returns {boolean}
 */
function isPositionOnSnake(pos, snakeBody) {
  return snakeBody.some(seg => seg.x === pos.x && seg.y === pos.y);
}

/**
 * @param {Move[]} moves
 * @param {number} seed
 * @param {number} expectedScore
 * @param {number} expectedFoodEaten
 * @param {number} gameDuration
 * @param {number} totalFrames
 * @returns {GameValidationResult}
 */
function validateGameReplay(moves, seed, expectedScore, expectedFoodEaten, gameDuration, totalFrames) {
  const GRID_SIZE = 30;
  const INITIAL_SPEED = 150;
  const SPEED_INCREASE = 3;
  const MIN_SPEED = 50;
  
  /** @type {GameValidationLog} */
  const log = {
    frames: [],
    summary: {},
    errors: []
  };
  
  const center = Math.floor(GRID_SIZE / 2);
  /** @type {{ x: number, y: number }[]} */
  const snake = [
    { x: center, y: center },
    { x: center - 1, y: center },
    { x: center - 2, y: center }
  ];
  
  let direction = { x: 1, y: 0 };
  let score = 0;
  let foodEaten = 0;
  let currentSpeed = INITIAL_SPEED;
  
  /** @returns {{ x: number, y: number }} */
  function spawnFood() {
    /** @type {{ x: number, y: number }} */
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
    } while (isPositionOnSnake(newFood, snake) && attempts < maxAttempts);
    
    return newFood;
  }
  
  let food = spawnFood();
  let moveIndex = 0;
  let frameCount = 0;
  let simulatedTime = 0;
  
  const directions = [
    { x: 0, y: -1 },
    { x: 1, y: 0 },
    { x: 0, y: 1 },
    { x: -1, y: 0 }
  ];
  
  log.frames.push({
    frame: 0,
    snake: JSON.parse(JSON.stringify(snake)),
    food: JSON.parse(JSON.stringify(food)),
    direction: JSON.parse(JSON.stringify(direction)),
    score,
    foodEaten
  });
  
  const maxFrames = totalFrames ? totalFrames + 10 : 10000;
  
  while (frameCount < maxFrames) {
    frameCount++;
    
    simulatedTime += currentSpeed;
    
    if (moveIndex < moves.length && moves[moveIndex].f === frameCount) {
      const newDir = directions[moves[moveIndex].d];
      if (newDir && (newDir.x !== -direction.x || newDir.y !== -direction.y)) {
        direction = newDir;
        
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
    
    const head = { x: snake[0].x + direction.x, y: snake[0].y + direction.y };
    
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
    
    if (head.x === food.x && head.y === food.y) {
      score += 10;
      foodEaten++;
      
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
    
    if (frameCount >= 10000) {
      log.errors.push('Simulation exceeded maximum frames');
      break;
    }
  }
  
  const simulatedDuration = Math.floor(simulatedTime / 1000);
  
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
  
  const scoreDiff = Math.abs(score - expectedScore);
  const foodDiff = Math.abs(foodEaten - expectedFoodEaten);
  
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
  
  const durationDiff = Math.abs(simulatedDuration - gameDuration);
  const maxDurationDiff = Math.max(10, gameDuration * 0.20);
  
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

app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: true, limit: '100kb' }));

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

  /** @type {any} */
  const sessionData = req.session;
  sessionData.playerId = player.id;
  sessionData.username = player.username;

  res.json({ 
    success: true, 
    player: { 
      id: player.id, 
      username: player.username 
    } 
  });
});

app.get('/api/session', (req, res) => {
  /** @type {any} */
  const sessionData = req.session;
  if (sessionData.playerId) {
    const player = playerOps.findById(sessionData.playerId);
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
  /** @type {any} */
  const sessionData = req.session;
  if (!sessionData.playerId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const { fingerprint } = req.body;
  
  if (!playerOps.verifyFingerprint(sessionData.playerId, fingerprint)) {
    return res.status(403).json({ error: 'Fingerprint verification failed' });
  }

  const seed = Math.floor(Math.random() * 1000000);
  
  activeSessions.set(sessionData.playerId, {
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

  /** @type {any} */
  const sessionData = req.session;
  if (sessionData.playerId) {
    const isValid = playerOps.verifyFingerprint(sessionData.playerId, fingerprint);
    
    if (isValid) {
      const player = playerOps.findById(sessionData.playerId);
      if (!player) {
        req.session.destroy(() => undefined);
        return res.json({ verified: false, reason: 'player_not_found' });
      }
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
    } 
    req.session.destroy(() => undefined);
    return res.json({ verified: false, reason: 'fingerprint_mismatch' });
    
  }

  const player = playerOps.findByFingerprint(fingerprint);
  if (player) {
    sessionData.playerId = player.id;
    sessionData.username = player.username;
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

app.post('/api/score', async (req, res) => {
  /** @type {any} */
  const sessionData = req.session;
  if (!sessionData.playerId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  if (!checkRateLimit(sessionData.playerId, 10, 60000)) {
    return res.status(429).json({ error: 'Too many score submissions. Please wait.' });
  }

  const { score, speedLevel, fingerprint, gameDuration, foodEaten, seed, moves, totalFrames, heartbeats } = req.body;

  if (typeof moves === 'string' && moves.length > 50000) {
    return res.status(400).json({ error: 'Move data too large' });
  }

  if (typeof heartbeats === 'string' && heartbeats.length > 10000) {
    return res.status(400).json({ error: 'Heartbeat data too large' });
  }

  if (typeof score !== 'number' || typeof speedLevel !== 'number') {
    return res.status(400).json({ error: 'Invalid score data' });
  }

  if (score < 0) {
    return res.status(400).json({ error: 'Invalid score: negative value' });
  }

  if (score > 10000) {
    return res.status(400).json({ error: 'Invalid score: exceeds maximum' });
  }

  if (totalFrames !== undefined) {
    if (typeof totalFrames !== 'number' || totalFrames < 0 || totalFrames > 10000 || !Number.isFinite(totalFrames)) {
      return res.status(400).json({ error: 'Invalid totalFrames value' });
    }
  }

  if (cheaterOps.isKnownCheater(sessionData.playerId)) {
    const cheatCount = cheaterOps.getCheatCount(sessionData.playerId);
    console.log(`[WARNING] Known cheater submitting score: ${sessionData.playerId} (${cheatCount} prior offenses)`);
  }

  if (foodEaten) {
    if (foodEaten * 10 !== score) {
      const player = playerOps.findById(sessionData.playerId);
      if (!player) {
        return res.status(401).json({ error: 'Player not found' });
      }
      const ipAddress = getClientIP(req);
      console.log(`[CHEAT DETECTED] Player: ${player.username} (${sessionData.playerId}) - Food: ${foodEaten}, Score: ${score} (expected ${foodEaten * 10})`);
      cheaterOps.record(sessionData.playerId, player.username, ipAddress, fingerprint, 'score_mismatch', score, `Score ${score} does not match food eaten ${foodEaten}`);
      return res.status(400).json({ error: 'Score does not match food eaten' });
    }
  }

  if (gameDuration && speedLevel > 5) {
    const minDuration = speedLevel * 1.5;
    if (gameDuration < minDuration) {
      const player = playerOps.findById(sessionData.playerId);
      if (!player) {
        return res.status(401).json({ error: 'Player not found' });
      }
      const ipAddress = getClientIP(req);
      logCheatDetection(
        player.username,
        ipAddress,
        'speed_hack',
        score,
        `Duration: ${gameDuration}s < Min: ${minDuration}s`,
        `Speed Level: ${speedLevel} | Food: ${foodEaten || 'N/A'}`
      );
      console.log(`[CHEAT DETECTED] Player: ${player.username} - Duration: ${gameDuration}s, Speed: ${speedLevel} (too fast, min: ${minDuration}s)`);
      cheaterOps.record(sessionData.playerId, player.username, ipAddress, fingerprint, 'speed_hack', score, `Game too fast: ${gameDuration}s (min ${minDuration}s)`);
      return res.status(400).json({ error: 'Game completed too quickly' });
    }
  }

  if (!playerOps.verifyFingerprint(sessionData.playerId, fingerprint)) {
    return res.status(403).json({ error: 'Fingerprint verification failed' });
  }

  const gameSession = activeSessions.get(sessionData.playerId);
  if (!gameSession || gameSession.seed !== seed) {
    const player = playerOps.findById(sessionData.playerId);
    if (!player) {
      return res.status(401).json({ error: 'Player not found' });
    }
    const ipAddress = getClientIP(req);
    logCheatDetection(
      player.username,
      ipAddress,
      'invalid_session',
      score,
      gameSession ? 'Seed mismatch' : 'No active session',
      `Sent seed: ${seed} | Expected seed: ${gameSession?.seed || 'none'}`
    );
    console.log(`[CHEAT DETECTED] Player: ${player.username} - Invalid or missing game session`);
    cheaterOps.record(sessionData.playerId, player.username, ipAddress, fingerprint, 'invalid_session', score, 'Invalid or missing game session');
    return res.status(400).json({ error: 'Invalid game session' });
  }

  if (!moves || typeof moves !== 'string' || moves === '') {
    if (score > 0) {
      const player = playerOps.findById(sessionData.playerId);
      if (!player) {
        return res.status(401).json({ error: 'Player not found' });
      }
      const ipAddress = getClientIP(req);
      console.log(`[CHEAT DETECTED] Player: ${player.username} - Missing move history with score ${score}`);
      cheaterOps.record(sessionData.playerId, player.username, ipAddress, fingerprint, 'missing_moves', score, 'Missing move history');
      return res.status(400).json({ error: 'Move history required' });
    }
    
    activeSessions.delete(sessionData.playerId);
    
    scoreOps.add(sessionData.playerId, score, speedLevel);
    const bestScore = scoreOps.getBestScore(sessionData.playerId);
    const rank = scoreOps.getPlayerRank(sessionData.playerId);
    
    return res.json({ 
      success: true, 
      bestScore,
      rank,
      isNewBest: false
    });
  }

  /** @type {Move[]} */
  const parsedMoves = /** @type {Move[]} */ (moves.split(';').map((/** @type {string} */ moveStr) => {
    const parts = moveStr.split(',').map(Number);
    if (parts.length === 3) {
      return { d: parts[0], f: parts[1], t: parts[2] };
    } 
    if (parts.length === 2) {
      return { d: parts[0], f: 0, t: parts[1] };
    }
    return null;
  }).filter((/** @type {Move | null} */ m) => m && !isNaN(m.d) && !isNaN(m.f) && !isNaN(m.t)));

  /** @type {any[]} */
  let parsedHeartbeats = [];
  if (heartbeats && typeof heartbeats === 'string' && heartbeats.length > 0) {
    parsedHeartbeats = heartbeats.split(';').map((/** @type {string} */ hb) => {
      const parts = hb.trim().split(',');
      if (parts.length >= 4) {
        return { t: Number(parts[0]), p: Number(parts[1]), f: Number(parts[2]), s: Number(parts[3]), score: parts[4] ? Number(parts[4]) : undefined };
      }
      return null;
    }).filter((/** @type {any} */ h) => h !== null);
  }

  if (heartbeats && typeof heartbeats === 'string' && heartbeats.length > 0 && score > 100) {
    const rawHeartbeats = heartbeats.split(';').map((/** @type {string} */ hb) => hb.trim()).filter((/** @type {string} */ hb) => hb.length > 0);
    const heartbeatCheck = validateHeartbeats(rawHeartbeats, gameDuration, totalFrames);
    
    if (!heartbeatCheck.valid || heartbeatCheck.suspicious) {
      const player = playerOps.findById(sessionData.playerId);
      if (!player) {
        return res.status(401).json({ error: 'Player not found' });
      }
      const ipAddress = getClientIP(req);
      
      logCheatDetection(
        player.username,
        ipAddress,
        'timing_manipulation',
        score,
        'Heartbeat validation failed - possible game speed manipulation',
        `Issues: ${JSON.stringify(heartbeatCheck.issues || [])} | Avg ms/frame: ${heartbeatCheck.avgMsPerFrame?.toFixed(2)}`
      );
      
      console.log(`\n========== CHEAT DETECTED: TIMING MANIPULATION ==========`);
      console.log(`Player: ${player.username} (ID: ${player.id})`);
      console.log(`IP Address: ${ipAddress}`);
      console.log(`Heartbeat validation failed`);
      console.log(`Heartbeat count: ${heartbeatCheck.heartbeatCount}`);
      console.log(`Avg ms per frame: ${heartbeatCheck.avgMsPerFrame?.toFixed(2)}`);
      console.log(`Issues found:`, JSON.stringify(heartbeatCheck.issues || [], null, 2));
      console.log(`========================================================\n`);
      
      cheaterOps.record(
        sessionData.playerId,
        player.username,
        ipAddress,
        fingerprint,
        'timing_manipulation',
        score,
        `Heartbeat validation failed: ${(heartbeatCheck.issues || []).length} timing anomalies detected`
      );
      
      saveMLTrainingData(sessionData.playerId, score, true, 'timing_manipulation', parsedMoves, parsedHeartbeats, foodEaten, gameDuration);
      onCheatDetected('timing_manipulation', { score, gameDuration, foodEaten });
      
      return res.status(400).json({ 
        error: 'Game timing validation failed. Please ensure you are playing at normal speed without modifications.' 
      });
    }
    
    if (score >= 1000) {
      const logPlayer = playerOps.findById(sessionData.playerId);
      if (logPlayer) {
        logGameActivity(
          logPlayer.username,
          score,
          'HEARTBEAT_DATA',
          `HB Count: ${heartbeatCheck.heartbeatCount} | Avg ms/frame: ${heartbeatCheck.avgMsPerFrame?.toFixed(2)} | Heartbeats: ${heartbeats.substring(0, 500)}...`
        );
      }
    }
  }

  const pauseCheck = detectPauseAbuse(parsedMoves, gameDuration);
  if (pauseCheck.hasPause) {
    const player = playerOps.findById(sessionData.playerId);
    if (!player) {
      return res.status(401).json({ error: 'Player not found' });
    }
    const ipAddress = getClientIP(req);
    
    const gapDetails = JSON.stringify(pauseCheck.suspiciousGaps);
    logCheatDetection(
      player.username, 
      ipAddress, 
      'pause_abuse', 
      score, 
      `${pauseCheck.gapCount} gaps totaling ${pauseCheck.totalSuspiciousTime}s`,
      `Duration: ${gameDuration}s | Gaps: ${gapDetails}`
    );
    
    console.log(`\n========== CHEAT DETECTED: PAUSE ABUSE ==========`);
    console.log(`Player: ${player.username} (ID: ${player.id})`);
    console.log(`IP Address: ${ipAddress}`);
    console.log(`Suspicious gaps detected: ${pauseCheck.gapCount}`);
    console.log(`Total suspicious pause time: ${pauseCheck.totalSuspiciousTime}s`);
    console.log(`Game duration: ${gameDuration}s`);
    console.log(`Gaps:`, pauseCheck.suspiciousGaps);
    console.log(`=====================================\n`);
    
    cheaterOps.record(
      sessionData.playerId, 
      player.username, 
      ipAddress, 
      fingerprint, 
      'pause_abuse', 
      score, 
      `Paused game detected: ${pauseCheck.gapCount} gaps totaling ${pauseCheck.totalSuspiciousTime}s`
    );
    
    saveMLTrainingData(sessionData.playerId, score, true, 'pause_abuse', parsedMoves, parsedHeartbeats, foodEaten, gameDuration);
    onCheatDetected('pause_abuse', { score, gameDuration, foodEaten });
    
    return res.status(400).json({ 
      error: 'Game pausing detected. Play without pausing to submit scores.' 
    });
  }

  const validation = validateGameReplay(parsedMoves, seed, score, foodEaten, gameDuration, totalFrames);
  
  if (!validation.valid) {
    const player = playerOps.findById(sessionData.playerId);
    if (!player) {
      return res.status(401).json({ error: 'Player not found' });
    }
    const ipAddress = getClientIP(req);
    
    logCheatDetection(
      player.username,
      ipAddress,
      'replay_fail',
      score,
      validation.reason || 'Unknown validation error',
      `Food: ${foodEaten} | Duration: ${gameDuration}s | Frames: ${totalFrames} | Summary: ${JSON.stringify(validation.log.summary)}`
    );
    
    console.log(`\n========== CHEAT DETECTION ==========`);
    console.log(`Player: ${player.username} (ID: ${player.id})`);
    console.log(`IP Address: ${ipAddress}`);
    console.log(`Reason: ${validation.reason}`);
    console.log(`\n--- Game Summary ---`);
    console.log(JSON.stringify(validation.log.summary, null, 2));
    
    if (validation.log.errors.length > 0) {
      console.log(`\n--- Errors ---`);
      validation.log.errors.forEach((/** @type {string} */ err) => { console.log(`  - ${err}`); });
    }
    
    const recentFrames = validation.log.frames.slice(-5);
    if (recentFrames.length > 0) {
      console.log(`\n--- Last 5 Frames ---`);
      console.log(JSON.stringify(recentFrames, null, 2));
    }
    
    console.log(`=====================================\n`);
    
    cheaterOps.record(sessionData.playerId, player.username, ipAddress, fingerprint, 'replay_fail', score, validation.reason || 'Unknown');
    saveMLTrainingData(sessionData.playerId, score, true, 'replay_fail', parsedMoves, parsedHeartbeats, foodEaten, gameDuration);
    onCheatDetected('replay_fail', { score, gameDuration, foodEaten });
    return res.status(400).json({ error: `Game validation failed: ${validation.reason}` });
  }
  
  const botCheck = detectBotUsage(parsedMoves, foodEaten, score);
  if (botCheck.isBot) {
    const player = playerOps.findById(sessionData.playerId);
    if (!player) {
      return res.status(401).json({ error: 'Player not found' });
    }
    const ipAddress = getClientIP(req);
    
    logCheatDetection(
      player.username,
      ipAddress,
      'bot_usage',
      score,
      botCheck.reason || 'Bot detected',
      `Details: ${JSON.stringify(botCheck.details)}`
    );
    
    console.log(`\n========== AI BOT DETECTED ==========`);
    console.log(`Player: ${player.username} (ID: ${player.id})`);
    console.log(`IP Address: ${ipAddress}`);
    console.log(`Score: ${score}`);
    console.log(`Moves: ${parsedMoves.length}`);
    console.log(`Food Eaten: ${foodEaten}`);
    console.log(`Moves per Food: ${(botCheck.movesPerFood || 0).toFixed(2)}`);
    console.log(`Reason: ${botCheck.reason}`);
    console.log(`Details:`, JSON.stringify(botCheck.details, null, 2));
    console.log(`=====================================\n`);
    
    cheaterOps.record(
      sessionData.playerId,
      player.username,
      ipAddress,
      fingerprint,
      'bot_usage',
      score,
      botCheck.reason || 'Bot detected'
    );
    
    saveMLTrainingData(sessionData.playerId, score, true, 'bot_usage', parsedMoves, parsedHeartbeats, foodEaten, gameDuration);
    onCheatDetected('bot_usage', { score, gameDuration, foodEaten });
    
    return res.status(400).json({ 
      error: 'AI/Bot usage detected. Human players cannot achieve this score with these move patterns.' 
    });
  }
  
  let mlPrediction = 0;
  let mlSuspicious = false;
  let features = null;
  
  if (isModelAvailable() && score >= 50) {
    try {
      const loaded = await loadModel();
      if (loaded) {
        features = extractFeatures(parsedMoves, parsedHeartbeats, score, foodEaten, gameDuration);
        const featureArray = featuresToArray(features);
        const normalized = normalizeFeatures(featureArray, /** @type {any} */ (loaded.stats));
        const timeSeries = createTimeSeriesFeatures(parsedMoves, parsedHeartbeats);
        
        mlPrediction = await predict(normalized, timeSeries);
        mlSuspicious = mlPrediction > 0.7;
        
        const edgeResult = processAndLogEdgeCase(
          sessionData.playerId,
          score,
          false,
          null,
          mlPrediction,
          features
        );
        
        if (edgeResult.shouldFlag) {
          const player = playerOps.findById(sessionData.playerId);
          if (player) {
            console.log(`[ML EDGE CASE] Player: ${player.username} - Score: ${score} - ML: ${(mlPrediction * 100).toFixed(1)}% - Type: ${edgeResult.edgeType}`);
            logGameActivity(
              player.username,
              score,
              'ML_FLAGGED',
              `Edge case: ${edgeResult.edgeType} | Cheat probability: ${(mlPrediction * 100).toFixed(1)}% | Food: ${foodEaten}`
            );
          }
        } else if (mlSuspicious) {
          const player = playerOps.findById(sessionData.playerId);
          if (player) {
            console.log(`[ML WARNING] Player: ${player.username} - Score: ${score} - ML Cheat Probability: ${(mlPrediction * 100).toFixed(1)}%`);
            logGameActivity(
              player.username,
              score,
              'ML_SUSPICIOUS',
              `Cheat probability: ${(mlPrediction * 100).toFixed(1)}% | Food: ${foodEaten} | Duration: ${gameDuration}s`
            );
          }
        }
      }
    } catch (err) {
      console.error('[ML] Prediction error:', err);
    }
  }

  if (score >= 100) {
    const player = playerOps.findById(sessionData.playerId);
    if (player) {
      logGameActivity(
        player.username,
        score,
        'VALID',
        `Food: ${foodEaten} | Duration: ${gameDuration}s | Speed Level: ${speedLevel} | Moves: ${parsedMoves.length} | M/F: ${botCheck.movesPerFood?.toFixed(2) || 'N/A'}`
      );
      console.log(`[VALID SCORE] Player: ${player.username} - Score: ${score}, Food: ${foodEaten}, Duration: ${gameDuration}s, M/F: ${botCheck.movesPerFood?.toFixed(2) || 'N/A'}`);
    }
  }

  activeSessions.delete(sessionData.playerId);

  scoreOps.add(sessionData.playerId, score, speedLevel);
  saveMLTrainingData(sessionData.playerId, score, false, null, parsedMoves, parsedHeartbeats, foodEaten, gameDuration);
  
  const bestScore = scoreOps.getBestScore(sessionData.playerId);
  const rank = scoreOps.getPlayerRank(sessionData.playerId);
  const isNewBest = score === bestScore;

  res.json({ 
    success: true, 
    bestScore,
    rank,
    isNewBest
  });
});

app.get('/api/halloffame', (req, res) => {
  const limit = parseInt(/** @type {string} */ (req.query.limit) || '10', 10);
  const hallOfFame = scoreOps.getHallOfFame(limit);
  res.json({ hallOfFame });
});

app.get('/api/hallofshame', (req, res) => {
  const limit = parseInt(/** @type {string} */ (req.query.limit) || '50', 10);
  const hallOfShame = cheaterOps.getHallOfShame(limit);
  res.json({ hallOfShame });
});

app.get('/api/player/stats', (req, res) => {
  /** @type {any} */
  const sessionData = req.session;
  if (!sessionData.playerId) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  const player = playerOps.findById(sessionData.playerId);
  if (!player) {
    return res.status(401).json({ error: 'Player not found' });
  }
  const bestScore = scoreOps.getBestScore(sessionData.playerId);
  const totalGames = scoreOps.getTotalGames(sessionData.playerId);
  const history = scoreOps.getPlayerHistory(sessionData.playerId, 10);
  const rank = scoreOps.getPlayerRank(sessionData.playerId);

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

app.get('/api/ml/status', (req, res) => {
  const trainingStatus = getTrainingStatus();
  const activeVersion = getActiveVersion();
  const edgeCaseStats = getEdgeCaseStats();
  
  res.json({
    trainingStatus,
    activeModel: activeVersion ? {
      version: activeVersion.version,
      createdAt: activeVersion.createdAt,
      metrics: activeVersion.metrics
    } : null,
    edgeCases: edgeCaseStats
  });
});

app.get('/api/ml/versions', (_req, res) => {
  const versions = getAllVersions();
  res.json({ versions });
});

app.get('/api/ml/training-logs', (req, res) => {
  const limit = parseInt(/** @type {string} */ (req.query.limit) || '50', 10);
  const logs = getTrainingLogs(limit);
  res.json({ logs });
});

app.get('/api/ml/edge-cases', (req, res) => {
  const limit = parseInt(/** @type {string} */ (req.query.limit) || '50', 10);
  const cases = getEdgeCases(limit);
  const stats = getEdgeCaseStats();
  res.json({ cases, stats });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => undefined);
  res.json({ success: true });
});

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

/** @returns {Promise<void>} */
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
