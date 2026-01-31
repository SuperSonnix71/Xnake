const tf = require('@tensorflow/tfjs');
const { initializeDatabase, mlOps, closeDatabase } = require('../database');
const { extractFeatures, featuresToArray, computeNormalizationStats, normalizeFeatures } = require('./features');
const { createSimpleModel, saveModel } = require('./model');

/**
 * @param {any[]} array
 * @returns {any[]}
 */
function shuffle(array) {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * @param {number} count
 * @returns {Object[]}
 */
function generateSyntheticCheats(count) {
  const samples = [];
  
  for (let i = 0; i < count; i++) {
    const cheatType = Math.random();
    const moves = [];
    const heartbeats = [];
    let score, foodEaten, gameDuration;
    
    if (cheatType < 0.25) {
      gameDuration = 30 + Math.floor(Math.random() * 60);
      foodEaten = 10 + Math.floor(Math.random() * 30);
      score = foodEaten * 10;
      let t = 0;
      let f = 0;
      for (let m = 0; m < foodEaten * 3; m++) {
        const timeDelta = 50 + Math.random() * 100;
        t += timeDelta;
        f += Math.floor(timeDelta / 16);
        moves.push({ d: Math.floor(Math.random() * 4), f, t: Math.floor(t) });
      }
      for (let h = 0; h < gameDuration; h++) {
        const hbTime = h * 1000 + Math.random() * 500 - 250;
        heartbeats.push({ t: Math.floor(hbTime), p: Math.floor(hbTime + Math.random() * 1000), f: Math.floor(hbTime / 16), s: Math.min(35, 1 + Math.floor(h / 3)) });
      }
    } else if (cheatType < 0.5) {
      gameDuration = 60 + Math.floor(Math.random() * 120);
      foodEaten = 30 + Math.floor(Math.random() * 50);
      score = foodEaten * 10;
      let t = 0;
      let f = 0;
      for (let m = 0; m < foodEaten * 1.5; m++) {
        const timeDelta = 10 + Math.random() * 20;
        t += timeDelta;
        f += 1;
        moves.push({ d: Math.floor(Math.random() * 4), f, t: Math.floor(t) });
      }
      for (let h = 0; h < gameDuration; h++) {
        heartbeats.push({ t: h * 1000, p: h * 1000, f: h * 60, s: Math.min(35, 1 + Math.floor(h / 2)) });
      }
    } else if (cheatType < 0.75) {
      gameDuration = 100 + Math.floor(Math.random() * 200);
      foodEaten = 5 + Math.floor(Math.random() * 10);
      score = foodEaten * 10;
      let t = 0;
      let f = 0;
      let pauseCount = 3 + Math.floor(Math.random() * 5);
      for (let m = 0; m < foodEaten * 15; m++) {
        let timeDelta = 200 + Math.random() * 300;
        if (pauseCount > 0 && Math.random() < 0.1) {
          timeDelta += 5000 + Math.random() * 15000;
          pauseCount--;
        }
        t += timeDelta;
        f += Math.floor(timeDelta / 16);
        moves.push({ d: Math.floor(Math.random() * 2), f, t: Math.floor(t) });
      }
      for (let h = 0; h < gameDuration; h++) {
        const gap = Math.random() < 0.2 ? 3000 + Math.random() * 5000 : 1000;
        heartbeats.push({ t: Math.floor(h * gap), p: Math.floor(h * gap + Math.random() * 500), f: Math.floor(h * gap / 16), s: Math.min(10, 1 + Math.floor(h / 10)) });
      }
    } else {
      gameDuration = 60 + Math.floor(Math.random() * 100);
      foodEaten = 15 + Math.floor(Math.random() * 25);
      score = foodEaten * 10;
      let t = 0;
      let f = 0;
      for (let m = 0; m < foodEaten * 7; m++) {
        const timeDelta = 100 + Math.random() * 150 + (Math.random() < 0.3 ? 500 + Math.random() * 1000 : 0);
        t += timeDelta;
        f += Math.floor(timeDelta / 16);
        moves.push({ d: Math.floor(Math.random() * 4), f, t: Math.floor(t) });
      }
      for (let h = 0; h < gameDuration; h++) {
        const drift = 200 + Math.random() * 400;
        heartbeats.push({ t: Math.floor(h * 1000 + drift), p: Math.floor(h * 1000), f: Math.floor(h * 60), s: Math.min(35, 1 + Math.floor(h / 2)) });
      }
    }
    
    samples.push({ moves, heartbeats, score, foodEaten, gameDuration, isCheat: true });
  }
  
  return samples;
}

/**
 * @param {number} count
 * @returns {Object[]}
 */
function generateSyntheticLegitimate(count) {
  const samples = [];
  
  for (let i = 0; i < count; i++) {
    const skillLevel = Math.random();
    const moves = [];
    const heartbeats = [];
    let score, foodEaten, gameDuration;
    
    if (skillLevel < 0.33) {
      gameDuration = 30 + Math.floor(Math.random() * 60);
      foodEaten = 5 + Math.floor(Math.random() * 15);
      score = foodEaten * 10;
      let t = 0;
      let f = 0;
      for (let m = 0; m < foodEaten * (15 + Math.random() * 10); m++) {
        const timeDelta = 300 + Math.random() * 400 + (Math.random() < 0.1 ? 500 + Math.random() * 500 : 0);
        t += timeDelta;
        f += Math.floor(timeDelta / 16);
        moves.push({ d: Math.floor(Math.random() * 4), f, t: Math.floor(t) });
      }
      for (let h = 0; h < gameDuration; h++) {
        const jitter = Math.random() * 100 - 50;
        heartbeats.push({ t: Math.floor(h * 1000 + jitter), p: Math.floor(h * 1000 + jitter + Math.random() * 30), f: Math.floor(h * 60), s: Math.min(16, 1 + Math.floor(foodEaten / 5)) });
      }
    } else if (skillLevel < 0.66) {
      gameDuration = 60 + Math.floor(Math.random() * 90);
      foodEaten = 15 + Math.floor(Math.random() * 30);
      score = foodEaten * 10;
      let t = 0;
      let f = 0;
      for (let m = 0; m < foodEaten * (8 + Math.random() * 4); m++) {
        const timeDelta = 200 + Math.random() * 200 + (Math.random() < 0.05 ? 300 + Math.random() * 300 : 0);
        t += timeDelta;
        f += Math.floor(timeDelta / 16);
        moves.push({ d: Math.floor(Math.random() * 4), f, t: Math.floor(t) });
      }
      for (let h = 0; h < gameDuration; h++) {
        const jitter = Math.random() * 60 - 30;
        heartbeats.push({ t: Math.floor(h * 1000 + jitter), p: Math.floor(h * 1000 + jitter + Math.random() * 20), f: Math.floor(h * 60), s: Math.min(30, 1 + Math.floor(foodEaten / 3)) });
      }
    } else {
      gameDuration = 90 + Math.floor(Math.random() * 150);
      foodEaten = 40 + Math.floor(Math.random() * 60);
      score = foodEaten * 10;
      let t = 0;
      let f = 0;
      for (let m = 0; m < foodEaten * (5 + Math.random() * 3); m++) {
        const timeDelta = 150 + Math.random() * 150;
        t += timeDelta;
        f += Math.floor(timeDelta / 16);
        moves.push({ d: Math.floor(Math.random() * 4), f, t: Math.floor(t) });
      }
      for (let h = 0; h < gameDuration; h++) {
        const jitter = Math.random() * 40 - 20;
        heartbeats.push({ t: Math.floor(h * 1000 + jitter), p: Math.floor(h * 1000 + jitter + Math.random() * 15), f: Math.floor(h * 60), s: Math.min(35, 1 + Math.floor(foodEaten / 2)) });
      }
    }
    
    samples.push({ moves, heartbeats, score, foodEaten, gameDuration, isCheat: false });
  }
  
  return samples;
}

/**
 * @param {Object} options
 * @param {boolean} [options.useSimpleModel=false]
 * @param {number} [options.epochs=50]
 * @param {number} [options.batchSize=32]
 * @param {number} [options.minSamples=100]
 * @param {boolean} [options.augmentWithSynthetic=true]
 * @param {boolean} [options.returnDetailedMetrics=false]
 * @param {boolean} [options.skipSave=false]
 * @returns {Promise<{accuracy: number, loss: number, samples: number, precision?: number, recall?: number, f1Score?: number, trainingSamples?: number, validationSamples?: number, trainingFeatures?: number[][], validationFeatures?: number[][]}>}
 */
async function train(options = {}) {
  const {
    useSimpleModel = false,
    epochs = 50,
    batchSize = 32,
    minSamples = 100,
    augmentWithSynthetic = true,
    returnDetailedMetrics = false,
    skipSave = false
  } = options;
  
  await initializeDatabase();
  
  const trainingData = mlOps.getTrainingData(10000);
  const stats = mlOps.getTrainingStats();
  
  console.log(`[ML Training] Found ${stats.total} samples (${stats.legitimate} legitimate, ${stats.cheats} cheats)`);
  
  /** @type {Object[]} */
  const allFeatures = [];
  /** @type {number[]} */
  const allLabels = [];
  
  trainingData.forEach((/** @type {any} */ record) => {
    allFeatures.push(record.features);
    allLabels.push(record.is_cheat);
  });
  
  if (augmentWithSynthetic && stats.total < minSamples) {
    const neededSamples = minSamples - stats.total;
    const neededCheats = Math.max(0, Math.ceil(neededSamples / 2) - stats.cheats);
    const neededLegit = Math.max(0, Math.ceil(neededSamples / 2) - stats.legitimate);
    
    console.log(`[ML Training] Augmenting with ${neededCheats} synthetic cheats and ${neededLegit} synthetic legitimate samples`);
    
    const syntheticCheats = generateSyntheticCheats(neededCheats);
    const syntheticLegit = generateSyntheticLegitimate(neededLegit);
    
    syntheticCheats.forEach((/** @type {any} */ sample) => {
      const features = extractFeatures(sample.moves, sample.heartbeats, sample.score, sample.foodEaten, sample.gameDuration);
      allFeatures.push(features);
      allLabels.push(1);
    });
    
    syntheticLegit.forEach((/** @type {any} */ sample) => {
      const features = extractFeatures(sample.moves, sample.heartbeats, sample.score, sample.foodEaten, sample.gameDuration);
      allFeatures.push(features);
      allLabels.push(0);
    });
  }
  
  if (allFeatures.length < 10) {
    console.log('[ML Training] Not enough samples to train. Need at least 10 samples.');
    await closeDatabase();
    return { accuracy: 0, loss: 1, samples: allFeatures.length };
  }
  
  const featureArrays = allFeatures.map((/** @type {any} */ f) => featuresToArray(f));
  const normStats = computeNormalizationStats(featureArrays);
  const normalizedFeatures = featureArrays.map((/** @type {number[]} */ f) => normalizeFeatures(f, normStats));
  
  const indices = shuffle([...Array(normalizedFeatures.length).keys()]);
  const splitIdx = Math.floor(indices.length * 0.8);
  const trainIndices = indices.slice(0, splitIdx);
  const valIndices = indices.slice(splitIdx);
  
  const xTrain = trainIndices.map((/** @type {number} */ i) => normalizedFeatures[i]);
  const yTrain = trainIndices.map((/** @type {number} */ i) => allLabels[i]);
  const xVal = valIndices.map((/** @type {number} */ i) => normalizedFeatures[i]);
  const yVal = valIndices.map((/** @type {number} */ i) => allLabels[i]);
  
  console.log(`[ML Training] Training with ${xTrain.length} samples, validating with ${xVal.length} samples`);
  
  const model = useSimpleModel ? createSimpleModel() : createSimpleModel();
  
  const xTrainTensor = tf.tensor2d(xTrain);
  const yTrainTensor = tf.tensor1d(yTrain);
  const xValTensor = tf.tensor2d(xVal);
  const yValTensor = tf.tensor1d(yVal);
  
  const history = await model.fit(xTrainTensor, yTrainTensor, {
    epochs,
    batchSize,
    validationData: [xValTensor, yValTensor],
    callbacks: {
      onEpochEnd: (/** @type {number} */ epoch, /** @type {any} */ logs) => {
        if ((epoch + 1) % 10 === 0) {
          console.log(`[ML Training] Epoch ${epoch + 1}/${epochs} - loss: ${logs.loss.toFixed(4)}, acc: ${logs.acc.toFixed(4)}, val_loss: ${logs.val_loss.toFixed(4)}, val_acc: ${logs.val_acc.toFixed(4)}`);
        }
      }
    }
  });
  
  const finalLoss = /** @type {number} */ (history.history.val_loss[history.history.val_loss.length - 1]);
  const finalAcc = /** @type {number} */ (history.history.val_acc[history.history.val_acc.length - 1]);
  
  const predTensor = /** @type {tf.Tensor} */ (model.predict(xValTensor));
  const predictions = await predTensor.data();
  predTensor.dispose();
  
  let tp = 0, fp = 0, fn = 0;
  for (let i = 0; i < yVal.length; i++) {
    const pred = predictions[i] >= 0.5 ? 1 : 0;
    const actual = yVal[i];
    if (pred === 1 && actual === 1) { tp++; }
    else if (pred === 1 && actual === 0) { fp++; }
    else if (pred === 0 && actual === 0) { /* tn - not needed for metrics */ }
    else { fn++; }
  }
  
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const recall = tp + fn > 0 ? tp / (tp + fn) : 0;
  const f1Score = precision + recall > 0 ? 2 * (precision * recall) / (precision + recall) : 0;
  
  console.log(`[ML Training] Training complete. Accuracy: ${(finalAcc * 100).toFixed(2)}%, Precision: ${(precision * 100).toFixed(2)}%, Recall: ${(recall * 100).toFixed(2)}%, F1: ${(f1Score * 100).toFixed(2)}%`);
  
  if (!skipSave) {
    await saveModel(model, normStats);
    console.log(`[ML Training] Model saved successfully`);
  }
  
  xTrainTensor.dispose();
  yTrainTensor.dispose();
  xValTensor.dispose();
  yValTensor.dispose();
  
  await closeDatabase();
  
  const result = {
    accuracy: finalAcc,
    loss: finalLoss,
    precision,
    recall,
    f1Score,
    samples: allFeatures.length,
    trainingSamples: xTrain.length,
    validationSamples: xVal.length
  };
  
  if (returnDetailedMetrics) {
    return {
      ...result,
      trainingFeatures: xTrain,
      validationFeatures: xVal
    };
  }
  
  return result;
}

if (require.main === module) {
  const args = process.argv.slice(2);
  const epochs = parseInt(args.find((/** @type {string} */ a) => a.startsWith('--epochs='))?.split('=')[1] || '50', 10);
  const minSamples = parseInt(args.find((/** @type {string} */ a) => a.startsWith('--min-samples='))?.split('=')[1] || '100', 10);
  const noSynthetic = args.includes('--no-synthetic');
  
  console.log('[ML Training] Starting training pipeline...');
  console.log(`[ML Training] Options: epochs=${epochs}, minSamples=${minSamples}, synthetic=${!noSynthetic}`);
  
  train({
    epochs,
    minSamples,
    augmentWithSynthetic: !noSynthetic
  }).then((/** @type {any} */ result) => {
    console.log('[ML Training] Done:', result);
    process.exit(0);
  }).catch((/** @type {Error} */ err) => {
    console.error('[ML Training] Error:', err);
    process.exit(1);
  });
}

module.exports = {
  train,
  generateSyntheticCheats,
  generateSyntheticLegitimate
};
