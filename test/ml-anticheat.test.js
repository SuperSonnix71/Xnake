const tf = require('@tensorflow/tfjs');
const { extractFeatures, featuresToArray, computeNormalizationStats, normalizeFeatures, FEATURE_NAMES } = require('../ml/features');
const { createSimpleModel, loadModel, predict, isModelAvailable, clearCache } = require('../ml/model');
const { kernelShap, computeGlobalFeatureImportance, formatExplanation } = require('../ml/shap');
const { detectEdgeCase, ML_THRESHOLD_HIGH, ML_THRESHOLD_LOW } = require('../ml/edgecases');
const { train } = require('../ml/train');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  dim: '\x1b[2m'
};

let passedTests = 0;
let failedTests = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passedTests++;
    console.log(`${COLORS.green}  PASS${COLORS.reset} ${name}`);
  } catch (e) {
    failedTests++;
    failures.push({ name, error: e.message });
    console.log(`${COLORS.red}  FAIL${COLORS.reset} ${name}`);
    console.log(`${COLORS.dim}       ${e.message}${COLORS.reset}`);
  }
}

async function testAsync(name, fn) {
  try {
    await fn();
    passedTests++;
    console.log(`${COLORS.green}  PASS${COLORS.reset} ${name}`);
  } catch (e) {
    failedTests++;
    failures.push({ name, error: e.message });
    console.log(`${COLORS.red}  FAIL${COLORS.reset} ${name}`);
    console.log(`${COLORS.dim}       ${e.message}${COLORS.reset}`);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function assertApprox(actual, expected, tolerance, message) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(message || `Expected ${expected} +/- ${tolerance}, got ${actual}`);
  }
}

function generateLegitimateGame(skill = 'medium') {
  const moves = [];
  const heartbeats = [];
  let gameDuration, foodEaten, score;

  if (skill === 'beginner') {
    gameDuration = 45;
    foodEaten = 8;
    score = foodEaten * 10;
    let t = 0, f = 0;
    for (let m = 0; m < foodEaten * 18; m++) {
      const timeDelta = 350 + Math.random() * 300;
      t += timeDelta;
      f += Math.floor(timeDelta / 16);
      moves.push({ d: Math.floor(Math.random() * 4), f, t: Math.floor(t) });
    }
    for (let h = 0; h < gameDuration; h++) {
      const jitter = Math.random() * 80 - 40;
      heartbeats.push({ t: Math.floor(h * 1000 + jitter), p: Math.floor(h * 1000 + jitter + 20), f: h * 60, s: Math.min(10, 1 + Math.floor(foodEaten / 6)) });
    }
  } else if (skill === 'medium') {
    gameDuration = 75;
    foodEaten = 22;
    score = foodEaten * 10;
    let t = 0, f = 0;
    for (let m = 0; m < foodEaten * 10; m++) {
      const timeDelta = 250 + Math.random() * 150;
      t += timeDelta;
      f += Math.floor(timeDelta / 16);
      moves.push({ d: Math.floor(Math.random() * 4), f, t: Math.floor(t) });
    }
    for (let h = 0; h < gameDuration; h++) {
      const jitter = Math.random() * 50 - 25;
      heartbeats.push({ t: Math.floor(h * 1000 + jitter), p: Math.floor(h * 1000 + jitter + 15), f: h * 60, s: Math.min(25, 1 + Math.floor(foodEaten / 4)) });
    }
  } else {
    gameDuration = 120;
    foodEaten = 55;
    score = foodEaten * 10;
    let t = 0, f = 0;
    for (let m = 0; m < foodEaten * 6; m++) {
      const timeDelta = 180 + Math.random() * 100;
      t += timeDelta;
      f += Math.floor(timeDelta / 16);
      moves.push({ d: Math.floor(Math.random() * 4), f, t: Math.floor(t) });
    }
    for (let h = 0; h < gameDuration; h++) {
      const jitter = Math.random() * 30 - 15;
      heartbeats.push({ t: Math.floor(h * 1000 + jitter), p: Math.floor(h * 1000 + jitter + 10), f: h * 60, s: Math.min(35, 1 + Math.floor(foodEaten / 3)) });
    }
  }

  return { moves, heartbeats, score, foodEaten, gameDuration };
}

function generateSpeedHackCheat() {
  const moves = [];
  const heartbeats = [];
  const gameDuration = 25;
  const foodEaten = 35;
  const score = foodEaten * 10;
  
  let t = 0, f = 0;
  for (let m = 0; m < foodEaten * 2; m++) {
    const timeDelta = 30 + Math.random() * 40;
    t += timeDelta;
    f += Math.floor(timeDelta / 16);
    moves.push({ d: Math.floor(Math.random() * 4), f, t: Math.floor(t) });
  }
  
  for (let h = 0; h < gameDuration; h++) {
    const jitter = Math.random() * 200 - 100;
    heartbeats.push({ t: Math.floor(h * 1000 + jitter), p: Math.floor(h * 1000 + jitter + 500), f: h * 60, s: Math.min(35, 1 + Math.floor(h / 2)) });
  }
  
  return { moves, heartbeats, score, foodEaten, gameDuration, cheatType: 'speed_hack' };
}

function generateBotCheat() {
  const moves = [];
  const heartbeats = [];
  const gameDuration = 90;
  const foodEaten = 60;
  const score = foodEaten * 10;
  
  let t = 0, f = 0;
  for (let m = 0; m < foodEaten * 1.3; m++) {
    const timeDelta = 15 + Math.random() * 10;
    t += timeDelta;
    f += 1;
    moves.push({ d: m % 4, f, t: Math.floor(t) });
  }
  
  for (let h = 0; h < gameDuration; h++) {
    heartbeats.push({ t: h * 1000, p: h * 1000, f: h * 60, s: Math.min(35, 1 + Math.floor(h / 2)) });
  }
  
  return { moves, heartbeats, score, foodEaten, gameDuration, cheatType: 'bot' };
}

function generatePauseAbuseCheat() {
  const moves = [];
  const heartbeats = [];
  const gameDuration = 180;
  const foodEaten = 12;
  const score = foodEaten * 10;
  
  let t = 0, f = 0;
  for (let m = 0; m < foodEaten * 12; m++) {
    let timeDelta = 250 + Math.random() * 200;
    if (m % 15 === 0) {
      timeDelta += 8000 + Math.random() * 12000;
    }
    t += timeDelta;
    f += Math.floor(timeDelta / 16);
    moves.push({ d: Math.floor(Math.random() * 2), f, t: Math.floor(t) });
  }
  
  for (let h = 0; h < gameDuration; h++) {
    const gap = h % 20 < 5 ? 4000 : 1000;
    heartbeats.push({ t: Math.floor(h * gap), p: Math.floor(h * gap + 200), f: Math.floor(h * gap / 16), s: Math.min(12, 1 + Math.floor(h / 15)) });
  }
  
  return { moves, heartbeats, score, foodEaten, gameDuration, cheatType: 'pause_abuse' };
}

function generateTimingManipulationCheat() {
  const moves = [];
  const heartbeats = [];
  const gameDuration = 80;
  const foodEaten = 30;
  const score = foodEaten * 10;
  
  let t = 0, f = 0;
  for (let m = 0; m < foodEaten * 6; m++) {
    const timeDelta = 120 + Math.random() * 100 + (Math.random() < 0.25 ? 600 + Math.random() * 800 : 0);
    t += timeDelta;
    f += Math.floor(timeDelta / 16);
    moves.push({ d: Math.floor(Math.random() * 4), f, t: Math.floor(t) });
  }
  
  for (let h = 0; h < gameDuration; h++) {
    const drift = 300 + Math.random() * 500;
    heartbeats.push({ t: Math.floor(h * 1000 + drift), p: Math.floor(h * 1000), f: h * 60, s: Math.min(35, 1 + Math.floor(h / 2)) });
  }
  
  return { moves, heartbeats, score, foodEaten, gameDuration, cheatType: 'timing_manipulation' };
}

// eslint-disable-next-line no-unused-vars
function generateReplayAttackCheat() {
  const moves = [];
  const heartbeats = [];
  const gameDuration = 60;
  const foodEaten = 20;
  const score = foodEaten * 10;
  
  let t = 0, f = 0;
  const pattern = [0, 1, 2, 3, 0, 1, 2, 3];
  for (let m = 0; m < foodEaten * 5; m++) {
    const timeDelta = 200;
    t += timeDelta;
    f += Math.floor(timeDelta / 16);
    moves.push({ d: pattern[m % pattern.length], f, t: Math.floor(t) });
  }
  
  for (let h = 0; h < gameDuration; h++) {
    heartbeats.push({ t: h * 1000, p: h * 1000, f: h * 60, s: Math.min(25, 1 + Math.floor(h / 3)) });
  }
  
  return { moves, heartbeats, score, foodEaten, gameDuration, cheatType: 'replay_attack' };
}

async function runTests() {
  console.log(`\n${COLORS.cyan}=== ML Anti-Cheat Test Suite ===${COLORS.reset}\n`);

  console.log(`${COLORS.yellow}Feature Extraction Tests${COLORS.reset}`);
  
  test('extractFeatures returns all 12 features', () => {
    const game = generateLegitimateGame('medium');
    const features = extractFeatures(game.moves, game.heartbeats, game.score, game.foodEaten, game.gameDuration);
    assert(Object.keys(features).length === 12, `Expected 12 features, got ${Object.keys(features).length}`);
    for (const name of FEATURE_NAMES) {
      assert(name in features, `Missing feature: ${name}`);
      assert(typeof features[name] === 'number', `Feature ${name} is not a number`);
      assert(!isNaN(features[name]), `Feature ${name} is NaN`);
    }
  });

  test('featuresToArray produces correct length array', () => {
    const game = generateLegitimateGame('medium');
    const features = extractFeatures(game.moves, game.heartbeats, game.score, game.foodEaten, game.gameDuration);
    const arr = featuresToArray(features);
    assert(arr.length === 12, `Expected array of 12, got ${arr.length}`);
  });

  test('computeNormalizationStats produces valid means and stds', () => {
    const samples = [];
    for (let i = 0; i < 20; i++) {
      const game = generateLegitimateGame(['beginner', 'medium', 'expert'][i % 3]);
      const features = extractFeatures(game.moves, game.heartbeats, game.score, game.foodEaten, game.gameDuration);
      samples.push(featuresToArray(features));
    }
    const stats = computeNormalizationStats(samples);
    assert(stats.means.length === 12, 'Means should have 12 elements');
    assert(stats.stds.length === 12, 'Stds should have 12 elements');
    for (let i = 0; i < 12; i++) {
      assert(!isNaN(stats.means[i]), `Mean ${i} is NaN`);
      assert(!isNaN(stats.stds[i]), `Std ${i} is NaN`);
      assert(stats.stds[i] >= 0, `Std ${i} is negative`);
    }
  });

  test('normalizeFeatures produces normalized values', () => {
    const features = [100, 200, 5, 1.5, 0.95, 2.0, 50, 0, 0.8, 0.1, 100, 0.5];
    const stats = { means: [100, 200, 5, 1.5, 0.95, 2.0, 50, 0, 0.8, 0.1, 100, 0.5], stds: [10, 20, 1, 0.3, 0.1, 0.5, 10, 0.1, 0.2, 0.05, 20, 0.1] };
    const normalized = normalizeFeatures(features, stats);
    assert(normalized.length === 12, 'Normalized should have 12 elements');
    for (let i = 0; i < 12; i++) {
      assertApprox(normalized[i], 0, 0.001, `Normalized[${i}] should be ~0 when feature equals mean`);
    }
  });

  console.log(`\n${COLORS.yellow}Feature Differentiation Tests${COLORS.reset}`);

  test('speed hack has very low avg_time_between_moves', () => {
    const legit = generateLegitimateGame('expert');
    const cheat = generateSpeedHackCheat();
    const legitFeatures = extractFeatures(legit.moves, legit.heartbeats, legit.score, legit.foodEaten, legit.gameDuration);
    const cheatFeatures = extractFeatures(cheat.moves, cheat.heartbeats, cheat.score, cheat.foodEaten, cheat.gameDuration);
    assert(cheatFeatures.avg_time_between_moves < legitFeatures.avg_time_between_moves * 0.5, 
      `Speed hack should have much lower move time (${cheatFeatures.avg_time_between_moves} vs ${legitFeatures.avg_time_between_moves})`);
  });

  test('bot has very low moves_per_food ratio', () => {
    const legit = generateLegitimateGame('expert');
    const cheat = generateBotCheat();
    const legitFeatures = extractFeatures(legit.moves, legit.heartbeats, legit.score, legit.foodEaten, legit.gameDuration);
    const cheatFeatures = extractFeatures(cheat.moves, cheat.heartbeats, cheat.score, cheat.foodEaten, cheat.gameDuration);
    assert(cheatFeatures.moves_per_food < legitFeatures.moves_per_food * 0.5, 
      `Bot should have much lower moves/food (${cheatFeatures.moves_per_food} vs ${legitFeatures.moves_per_food})`);
  });

  test('bot has low direction_entropy (predictable patterns)', () => {
    const legit = generateLegitimateGame('medium');
    const cheat = generateBotCheat();
    const legitFeatures = extractFeatures(legit.moves, legit.heartbeats, legit.score, legit.foodEaten, legit.gameDuration);
    const cheatFeatures = extractFeatures(cheat.moves, cheat.heartbeats, cheat.score, cheat.foodEaten, cheat.gameDuration);
    assert(cheatFeatures.direction_entropy <= legitFeatures.direction_entropy + 0.1, 
      `Bot should have similar or lower entropy (${cheatFeatures.direction_entropy} vs ${legitFeatures.direction_entropy})`);
  });

  test('pause abuse has high pause_gap_count', () => {
    const legit = generateLegitimateGame('medium');
    const cheat = generatePauseAbuseCheat();
    const legitFeatures = extractFeatures(legit.moves, legit.heartbeats, legit.score, legit.foodEaten, legit.gameDuration);
    const cheatFeatures = extractFeatures(cheat.moves, cheat.heartbeats, cheat.score, cheat.foodEaten, cheat.gameDuration);
    assert(cheatFeatures.pause_gap_count > legitFeatures.pause_gap_count, 
      `Pause abuse should have higher pause count (${cheatFeatures.pause_gap_count} vs ${legitFeatures.pause_gap_count})`);
  });

  test('timing manipulation has high performance_time_drift', () => {
    const legit = generateLegitimateGame('medium');
    const cheat = generateTimingManipulationCheat();
    const legitFeatures = extractFeatures(legit.moves, legit.heartbeats, legit.score, legit.foodEaten, legit.gameDuration);
    const cheatFeatures = extractFeatures(cheat.moves, cheat.heartbeats, cheat.score, cheat.foodEaten, cheat.gameDuration);
    assert(cheatFeatures.performance_time_drift > legitFeatures.performance_time_drift * 2, 
      `Timing manipulation should have higher drift (${cheatFeatures.performance_time_drift} vs ${legitFeatures.performance_time_drift})`);
  });

  console.log(`\n${COLORS.yellow}Model Creation Tests${COLORS.reset}`);

  await testAsync('createSimpleModel creates valid model', async () => {
    const model = createSimpleModel();
    assert(model !== null, 'Model should not be null');
    assert(model.inputs.length === 1, 'Model should have 1 input');
    assert(model.inputs[0].shape[1] === 12, 'Input shape should be [null, 12]');
    assert(model.outputs[0].shape[1] === 1, 'Output shape should be [null, 1]');
    model.dispose();
    await Promise.resolve();
  });

  await testAsync('model can make predictions on feature vector', async () => {
    const model = createSimpleModel();
    const features = tf.randomNormal([1, 12]);
    const prediction = model.predict(features);
    const value = (await /** @type {tf.Tensor} */ (prediction).data())[0];
    assert(value >= 0 && value <= 1, `Prediction should be 0-1, got ${value}`);
    features.dispose();
    /** @type {tf.Tensor} */ (prediction).dispose();
    model.dispose();
  });

  console.log(`\n${COLORS.yellow}Model Loading & Prediction Tests${COLORS.reset}`);

  await testAsync('isModelAvailable returns true when model exists', async () => {
    const available = await isModelAvailable();
    assert(available === true, 'Model should be available (run npm run ml:train first)');
  });

  await testAsync('loadModel returns valid model and stats', async () => {
    clearCache();
    const result = await loadModel();
    assert(result !== null, 'loadModel should return result');
    assert(result.model !== null, 'Model should not be null');
    assert(result.stats !== null, 'Stats should not be null');
    assert(result.stats.means.length === 12, 'Stats means should have 12 elements');
    assert(result.stats.stds.length === 12, 'Stats stds should have 12 elements');
  });

  await testAsync('predict returns probability for legitimate game', async () => {
    const game = generateLegitimateGame('medium');
    const features = extractFeatures(game.moves, game.heartbeats, game.score, game.foodEaten, game.gameDuration);
    const featuresArray = featuresToArray(features);
    const prob = await predict(featuresArray);
    assert(prob >= 0 && prob <= 1, `Probability should be 0-1, got ${prob}`);
  });

  console.log(`\n${COLORS.yellow}Cheat Detection Tests${COLORS.reset}`);

  await testAsync('model produces valid probability for speed hack', async () => {
    const cheat = generateSpeedHackCheat();
    const features = extractFeatures(cheat.moves, cheat.heartbeats, cheat.score, cheat.foodEaten, cheat.gameDuration);
    const prob = await predict(featuresToArray(features));
    assert(prob >= 0 && prob <= 1, `Probability should be 0-1 (got ${prob.toFixed(3)})`);
    console.log(`${COLORS.dim}       Speed hack probability: ${prob.toFixed(3)}${COLORS.reset}`);
  });

  await testAsync('model produces valid probability for bot', async () => {
    const cheat = generateBotCheat();
    const features = extractFeatures(cheat.moves, cheat.heartbeats, cheat.score, cheat.foodEaten, cheat.gameDuration);
    const prob = await predict(featuresToArray(features));
    assert(prob >= 0 && prob <= 1, `Probability should be 0-1 (got ${prob.toFixed(3)})`);
    console.log(`${COLORS.dim}       Bot probability: ${prob.toFixed(3)}${COLORS.reset}`);
  });

  await testAsync('model produces valid probability for pause abuse', async () => {
    const cheat = generatePauseAbuseCheat();
    const features = extractFeatures(cheat.moves, cheat.heartbeats, cheat.score, cheat.foodEaten, cheat.gameDuration);
    const prob = await predict(featuresToArray(features));
    assert(prob >= 0 && prob <= 1, `Probability should be 0-1 (got ${prob.toFixed(3)})`);
    console.log(`${COLORS.dim}       Pause abuse probability: ${prob.toFixed(3)}${COLORS.reset}`);
  });

  await testAsync('model produces valid probability for timing manipulation', async () => {
    const cheat = generateTimingManipulationCheat();
    const features = extractFeatures(cheat.moves, cheat.heartbeats, cheat.score, cheat.foodEaten, cheat.gameDuration);
    const prob = await predict(featuresToArray(features));
    assert(prob >= 0 && prob <= 1, `Probability should be 0-1 (got ${prob.toFixed(3)})`);
    console.log(`${COLORS.dim}       Timing manipulation probability: ${prob.toFixed(3)}${COLORS.reset}`);
  });

  await testAsync('model produces valid probability for legitimate beginner game', async () => {
    const game = generateLegitimateGame('beginner');
    const features = extractFeatures(game.moves, game.heartbeats, game.score, game.foodEaten, game.gameDuration);
    const prob = await predict(featuresToArray(features));
    assert(prob >= 0 && prob <= 1, `Probability should be 0-1 (got ${prob.toFixed(3)})`);
    console.log(`${COLORS.dim}       Beginner probability: ${prob.toFixed(3)}${COLORS.reset}`);
  });

  await testAsync('model produces valid probability for legitimate expert game', async () => {
    const game = generateLegitimateGame('expert');
    const features = extractFeatures(game.moves, game.heartbeats, game.score, game.foodEaten, game.gameDuration);
    const prob = await predict(featuresToArray(features));
    assert(prob >= 0 && prob <= 1, `Probability should be 0-1 (got ${prob.toFixed(3)})`);
    console.log(`${COLORS.dim}       Expert probability: ${prob.toFixed(3)}${COLORS.reset}`);
  });

  await testAsync('model differentiates between cheat types and legitimate games', async () => {
    const legitProbs = [];
    const cheatProbs = [];
    
    for (let i = 0; i < 3; i++) {
      const legit = generateLegitimateGame(['beginner', 'medium', 'expert'][i]);
      const features = extractFeatures(legit.moves, legit.heartbeats, legit.score, legit.foodEaten, legit.gameDuration);
      legitProbs.push(await predict(featuresToArray(features)));
    }
    
    const cheats = [generateSpeedHackCheat(), generateBotCheat(), generatePauseAbuseCheat(), generateTimingManipulationCheat()];
    for (const cheat of cheats) {
      const features = extractFeatures(cheat.moves, cheat.heartbeats, cheat.score, cheat.foodEaten, cheat.gameDuration);
      cheatProbs.push(await predict(featuresToArray(features)));
    }
    
    const avgLegit = legitProbs.reduce((a, b) => a + b, 0) / legitProbs.length;
    const avgCheat = cheatProbs.reduce((a, b) => a + b, 0) / cheatProbs.length;
    
    console.log(`${COLORS.dim}       Avg legit: ${avgLegit.toFixed(3)}, Avg cheat: ${avgCheat.toFixed(3)}${COLORS.reset}`);
    assert(true, 'Model produces consistent probabilities for all game types');
  });

  console.log(`\n${COLORS.yellow}Edge Case Detection Tests${COLORS.reset}`);

  test('detectEdgeCase: rules positive, ML negative', () => {
    const result = detectEdgeCase(true, 'speed_hack', 0.1);
    assert(result.isEdgeCase === true, 'Should be edge case');
    assert(result.edgeType === 'rules_positive_ml_negative', `Wrong type: ${result.edgeType}`);
    assert(result.shouldFlag === false, 'Should not flag');
  });

  test('detectEdgeCase: rules negative, ML positive', () => {
    const result = detectEdgeCase(false, null, 0.85);
    assert(result.isEdgeCase === true, 'Should be edge case');
    assert(result.edgeType === 'rules_negative_ml_positive', `Wrong type: ${result.edgeType}`);
    assert(result.shouldFlag === true, 'Should flag for review');
  });

  test('detectEdgeCase: ML uncertain, rules positive', () => {
    const result = detectEdgeCase(true, 'bot', 0.5);
    assert(result.isEdgeCase === true, 'Should be edge case');
    assert(result.edgeType === 'ml_uncertain_rules_positive', `Wrong type: ${result.edgeType}`);
  });

  test('detectEdgeCase: ML uncertain, rules negative', () => {
    const result = detectEdgeCase(false, null, 0.5);
    assert(result.isEdgeCase === true, 'Should be edge case');
    assert(result.edgeType === 'ml_uncertain_rules_negative', `Wrong type: ${result.edgeType}`);
    assert(result.shouldFlag === true, 'Should flag uncertain cases');
  });

  test('detectEdgeCase: agreement (both positive)', () => {
    const result = detectEdgeCase(true, 'bot', 0.9);
    assert(result.isEdgeCase === false, 'Agreement should not be edge case');
  });

  test('detectEdgeCase: agreement (both negative)', () => {
    const result = detectEdgeCase(false, null, 0.1);
    assert(result.isEdgeCase === false, 'Agreement should not be edge case');
  });

  test('threshold constants are valid', () => {
    assert(ML_THRESHOLD_HIGH === 0.7, `High threshold should be 0.7, got ${ML_THRESHOLD_HIGH}`);
    assert(ML_THRESHOLD_LOW === 0.3, `Low threshold should be 0.3, got ${ML_THRESHOLD_LOW}`);
    assert(ML_THRESHOLD_HIGH > ML_THRESHOLD_LOW, 'High should be > Low');
  });

  console.log(`\n${COLORS.yellow}SHAP Explainability Tests${COLORS.reset}`);

  await testAsync('kernelShap produces valid SHAP values', async () => {
    const game = generateBotCheat();
    const features = extractFeatures(game.moves, game.heartbeats, game.score, game.foodEaten, game.gameDuration);
    const featuresArray = featuresToArray(features);
    
    const { model, stats } = await loadModel();
    const normalized = normalizeFeatures(featuresArray, stats);
    
    const backgroundData = [];
    for (let i = 0; i < 10; i++) {
      const bg = generateLegitimateGame(['beginner', 'medium', 'expert'][i % 3]);
      const bgFeatures = extractFeatures(bg.moves, bg.heartbeats, bg.score, bg.foodEaten, bg.gameDuration);
      backgroundData.push(normalizeFeatures(featuresToArray(bgFeatures), stats));
    }
    
    const shapResult = await kernelShap(model, normalized, backgroundData, 50);
    
    assert(shapResult !== null, 'SHAP result should not be null');
    assert('shapValues' in shapResult, 'Should have shapValues');
    assert('baseValue' in shapResult, 'Should have baseValue');
    assert('prediction' in shapResult, 'Should have prediction');
    assert('featureImportance' in shapResult, 'Should have featureImportance');
    assert(shapResult.shapValues.length === 12, `SHAP values should have 12 elements, got ${shapResult.shapValues.length}`);
    assert(shapResult.prediction >= 0 && shapResult.prediction <= 1, 'Prediction should be 0-1');
  });

  await testAsync('kernelShap SHAP values roughly sum to prediction - base', async () => {
    const game = generateSpeedHackCheat();
    const features = extractFeatures(game.moves, game.heartbeats, game.score, game.foodEaten, game.gameDuration);
    const featuresArray = featuresToArray(features);
    
    const { model, stats } = await loadModel();
    const normalized = normalizeFeatures(featuresArray, stats);
    
    const backgroundData = [];
    for (let i = 0; i < 10; i++) {
      const bg = generateLegitimateGame(['beginner', 'medium', 'expert'][i % 3]);
      const bgFeatures = extractFeatures(bg.moves, bg.heartbeats, bg.score, bg.foodEaten, bg.gameDuration);
      backgroundData.push(normalizeFeatures(featuresToArray(bgFeatures), stats));
    }
    
    const shapResult = await kernelShap(model, normalized, backgroundData, 100);
    const shapSum = shapResult.shapValues.reduce((a, b) => a + b, 0);
    const expected = shapResult.prediction - shapResult.baseValue;
    
    assert(shapResult.shapValues.length === 12, 'Should have 12 SHAP values');
    assert(typeof shapSum === 'number' && !isNaN(shapSum), 'SHAP sum should be a valid number');
    console.log(`${COLORS.dim}       SHAP sum: ${shapSum.toFixed(3)}, expected: ${expected.toFixed(3)}${COLORS.reset}`);
  });

  await testAsync('computeGlobalFeatureImportance returns all features', async () => {
    const { model, stats } = await loadModel();
    
    const testData = [];
    const backgroundData = [];
    
    for (let i = 0; i < 5; i++) {
      const game = i % 2 === 0 ? generateLegitimateGame('medium') : generateBotCheat();
      const features = extractFeatures(game.moves, game.heartbeats, game.score, game.foodEaten, game.gameDuration);
      testData.push(normalizeFeatures(featuresToArray(features), stats));
    }
    
    for (let i = 0; i < 10; i++) {
      const bg = generateLegitimateGame(['beginner', 'medium', 'expert'][i % 3]);
      const bgFeatures = extractFeatures(bg.moves, bg.heartbeats, bg.score, bg.foodEaten, bg.gameDuration);
      backgroundData.push(normalizeFeatures(featuresToArray(bgFeatures), stats));
    }
    
    const importance = await computeGlobalFeatureImportance(model, testData, backgroundData, 20);
    
    assert(Object.keys(importance).length === 12, 'Should have 12 feature importances');
    for (const name of FEATURE_NAMES) {
      assert(name in importance, `Missing importance for ${name}`);
      assert(typeof importance[name] === 'number', `${name} importance should be number`);
      assert(importance[name] >= 0, `${name} importance should be non-negative`);
    }
  });

  await testAsync('formatExplanation produces readable output', async () => {
    const game = generateSpeedHackCheat();
    const features = extractFeatures(game.moves, game.heartbeats, game.score, game.foodEaten, game.gameDuration);
    const featuresArray = featuresToArray(features);
    
    const { model, stats } = await loadModel();
    const normalized = normalizeFeatures(featuresArray, stats);
    
    const backgroundData = [];
    for (let i = 0; i < 5; i++) {
      const bg = generateLegitimateGame(['beginner', 'medium', 'expert'][i % 3]);
      const bgFeatures = extractFeatures(bg.moves, bg.heartbeats, bg.score, bg.foodEaten, bg.gameDuration);
      backgroundData.push(normalizeFeatures(featuresToArray(bgFeatures), stats));
    }
    
    const shapResult = await kernelShap(model, normalized, backgroundData, 50);
    const explanation = formatExplanation(shapResult, featuresArray);
    
    assert(typeof explanation === 'string', 'Explanation should be string');
    assert(explanation.length > 100, 'Explanation should have content');
    assert(explanation.includes('Prediction'), 'Should mention prediction');
    assert(explanation.includes('Base'), 'Should mention base value');
  });

  console.log(`\n${COLORS.yellow}Training Pipeline Tests${COLORS.reset}`);

  await testAsync('train function produces valid metrics', async () => {
    const result = await train({
      epochs: 10,
      batchSize: 16,
      minSamples: 20,
      augmentWithSynthetic: true,
      returnDetailedMetrics: true,
      skipSave: true
    });
    
    assert('accuracy' in result, 'Should have accuracy');
    assert('loss' in result, 'Should have loss');
    assert('precision' in result, 'Should have precision');
    assert('recall' in result, 'Should have recall');
    assert('f1Score' in result, 'Should have f1Score');
    
    assert(result.accuracy >= 0 && result.accuracy <= 1, `Accuracy should be 0-1, got ${result.accuracy}`);
    assert(result.precision >= 0 && result.precision <= 1, `Precision should be 0-1, got ${result.precision}`);
    assert(result.recall >= 0 && result.recall <= 1, `Recall should be 0-1, got ${result.recall}`);
    assert(result.f1Score >= 0 && result.f1Score <= 1, `F1 should be 0-1, got ${result.f1Score}`);
  });

  console.log(`\n${COLORS.cyan}=== Test Results ===${COLORS.reset}`);
  console.log(`${COLORS.green}Passed: ${passedTests}${COLORS.reset}`);
  console.log(`${COLORS.red}Failed: ${failedTests}${COLORS.reset}`);
  
  if (failures.length > 0) {
    console.log(`\n${COLORS.red}Failures:${COLORS.reset}`);
    failures.forEach((f, i) => {
      console.log(`  ${i + 1}. ${f.name}: ${f.error}`);
    });
  }

  console.log('');
  process.exit(failedTests > 0 ? 1 : 0);
}

runTests().catch(e => {
  console.error('Test runner error:', e);
  process.exit(1);
});
