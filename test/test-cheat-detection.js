const { extractFeatures, featuresToArray, normalizeFeatures } = require('../ml/features');
const tf = require('@tensorflow/tfjs');
const fs = require('fs');
const path = require('path');

async function testCheatDetection() {
  console.log('=== Testing ML Cheat Detection ===\n');
  
  const modelPath = `file://../ml/models/cheat_detector`;
  const model = await tf.loadLayersModel(`${modelPath}/model.json`);
  
  const statsPath = path.join(__dirname, '../ml/models/cheat_detector/normalization_stats.json');
  const stats = JSON.parse(fs.readFileSync(statsPath, 'utf8'));
  
  console.log('Model loaded successfully\n');
  
  // Test Case 1: qwe's 680 cheat (347 moves, 247s, speed 35)
  console.log('--- Test Case 1: qwe\'s 680 Score Cheat ---');
  const cheatMoves = [];
  const cheatHeartbeats = [];
  
  // 347 moves in 247 seconds = 711ms per move (should be ~28ms at level 35)
  for (let i = 0; i < 347; i++) {
    cheatMoves.push({ d: i % 4, f: i * 8, t: i * 711 });
  }
  
  for (let i = 0; i < 20; i++) {
    const time = i * 12350;
    cheatHeartbeats.push({ t: time, p: time + 10, f: Math.floor(time / 28), s: 35 });
  }
  
  const cheatFeatures = extractFeatures(cheatMoves, cheatHeartbeats, 680, 68, 247);
  console.log('Features:', JSON.stringify(cheatFeatures, null, 2));
  
  const normalizedCheat = normalizeFeatures(featuresToArray(cheatFeatures), stats);
  const cheatTensor = tf.tensor2d([normalizedCheat]);
  const cheatPred = await model.predict(cheatTensor).data();
  cheatTensor.dispose();
  
  console.log(`\nML Prediction: ${(cheatPred[0] * 100).toFixed(1)}% cheat probability`);
  console.log(`Threshold: 75%`);
  console.log(`Would be blocked: ${cheatPred[0] > 0.75 ? '✓ YES' : '✗ NO'}\n`);
  
  // Test Case 2: Legitimate gameplay
  console.log('--- Test Case 2: Legitimate Gameplay ---');
  const legitMoves = [];
  const legitHeartbeats = [];
  
  // 200 moves in 30 seconds = 150ms per move (reasonable)
  for (let i = 0; i < 200; i++) {
    legitMoves.push({ d: i % 4, f: i * 5, t: i * 150 });
  }
  
  for (let i = 0; i < 15; i++) {
    const time = i * 2000;
    legitHeartbeats.push({ t: time, p: time + 5, f: Math.floor(time / 50), s: 20 });
  }
  
  const legitFeatures = extractFeatures(legitMoves, legitHeartbeats, 200, 20, 30);
  const normalizedLegit = normalizeFeatures(featuresToArray(legitFeatures), stats);
  const legitTensor = tf.tensor2d([normalizedLegit]);
  const legitPred = await model.predict(legitTensor).data();
  legitTensor.dispose();
  
  console.log(`ML Prediction: ${(legitPred[0] * 100).toFixed(1)}% cheat probability`);
  console.log(`Threshold: 75%`);
  console.log(`Would be blocked: ${legitPred[0] > 0.75 ? '✓ YES' : '✗ NO'}\n`);
  
  console.log('=== Summary ===');
  console.log(`Cheat correctly detected: ${cheatPred[0] > 0.75 ? '✓' : '✗'}`);
  console.log(`Legit correctly passed: ${legitPred[0] <= 0.75 ? '✓' : '✗'}`);
}

testCheatDetection().catch(console.error);
