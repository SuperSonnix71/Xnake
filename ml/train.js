const tf = require('@tensorflow/tfjs');
const { initializeDatabase, mlOps, closeDatabase } = require('../database');
const { featuresToArray, computeNormalizationStats, normalizeFeatures } = require('./features');
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
  const cheats = [];
  
  for (let i = 0; i < count; i++) {
    const cheatType = Math.random();
    
    if (cheatType < 0.25) {
      cheats.push({
        avg_time_between_moves: 50 + Math.random() * 100,
        move_time_variance: Math.random() * 100,
        moves_per_food: 2 + Math.random() * 3,
        direction_entropy: 1.8 + Math.random() * 0.2,
        heartbeat_consistency: 0.3 + Math.random() * 0.3,
        score_rate: 15 + Math.random() * 10,
        frame_timing_deviation: 50 + Math.random() * 100,
        pause_gap_count: 0,
        speed_progression: 50 + Math.random() * 50,
        movement_burst_rate: 0.5 + Math.random() * 0.3,
        performance_time_drift: 500 + Math.random() * 1000,
        avg_speed_per_food: 1 + Math.random() * 2
      });
    } else if (cheatType < 0.5) {
      cheats.push({
        avg_time_between_moves: 10 + Math.random() * 20,
        move_time_variance: Math.random() * 10,
        moves_per_food: 1.5 + Math.random(),
        direction_entropy: 1.95 + Math.random() * 0.05,
        heartbeat_consistency: 0.95 + Math.random() * 0.05,
        score_rate: 20 + Math.random() * 15,
        frame_timing_deviation: Math.random() * 5,
        pause_gap_count: 0,
        speed_progression: 100 + Math.random() * 50,
        movement_burst_rate: 0.1 + Math.random() * 0.1,
        performance_time_drift: Math.random() * 50,
        avg_speed_per_food: 0.5 + Math.random() * 0.5
      });
    } else if (cheatType < 0.75) {
      cheats.push({
        avg_time_between_moves: 200 + Math.random() * 300,
        move_time_variance: 5000 + Math.random() * 10000,
        moves_per_food: 10 + Math.random() * 20,
        direction_entropy: 1 + Math.random() * 0.5,
        heartbeat_consistency: 0.1 + Math.random() * 0.2,
        score_rate: 1 + Math.random() * 3,
        frame_timing_deviation: 200 + Math.random() * 300,
        pause_gap_count: 3 + Math.floor(Math.random() * 5),
        speed_progression: Math.random() * 10,
        movement_burst_rate: Math.random() * 0.1,
        performance_time_drift: 100 + Math.random() * 500,
        avg_speed_per_food: 5 + Math.random() * 10
      });
    } else {
      cheats.push({
        avg_time_between_moves: 100 + Math.random() * 150,
        move_time_variance: 100 + Math.random() * 500,
        moves_per_food: 5 + Math.random() * 10,
        direction_entropy: 1.5 + Math.random() * 0.3,
        heartbeat_consistency: 0.5 + Math.random() * 0.3,
        score_rate: 8 + Math.random() * 7,
        frame_timing_deviation: 30 + Math.random() * 70,
        pause_gap_count: Math.floor(Math.random() * 2),
        speed_progression: 20 + Math.random() * 30,
        movement_burst_rate: 0.2 + Math.random() * 0.3,
        performance_time_drift: 200 + Math.random() * 400,
        avg_speed_per_food: 2 + Math.random() * 3
      });
    }
  }
  
  return cheats;
}

/**
 * @param {number} count
 * @returns {Object[]}
 */
function generateSyntheticLegitimate(count) {
  const legitimate = [];
  
  for (let i = 0; i < count; i++) {
    const skillLevel = Math.random();
    
    if (skillLevel < 0.33) {
      legitimate.push({
        avg_time_between_moves: 300 + Math.random() * 400,
        move_time_variance: 10000 + Math.random() * 20000,
        moves_per_food: 15 + Math.random() * 25,
        direction_entropy: 1.3 + Math.random() * 0.4,
        heartbeat_consistency: 0.7 + Math.random() * 0.2,
        score_rate: 0.5 + Math.random() * 2,
        frame_timing_deviation: 50 + Math.random() * 100,
        pause_gap_count: 0,
        speed_progression: Math.random() * 20,
        movement_burst_rate: 0.05 + Math.random() * 0.15,
        performance_time_drift: Math.random() * 100,
        avg_speed_per_food: 3 + Math.random() * 5
      });
    } else if (skillLevel < 0.66) {
      legitimate.push({
        avg_time_between_moves: 200 + Math.random() * 200,
        move_time_variance: 5000 + Math.random() * 10000,
        moves_per_food: 8 + Math.random() * 12,
        direction_entropy: 1.5 + Math.random() * 0.3,
        heartbeat_consistency: 0.75 + Math.random() * 0.2,
        score_rate: 2 + Math.random() * 4,
        frame_timing_deviation: 30 + Math.random() * 50,
        pause_gap_count: 0,
        speed_progression: 10 + Math.random() * 30,
        movement_burst_rate: 0.1 + Math.random() * 0.2,
        performance_time_drift: Math.random() * 80,
        avg_speed_per_food: 2 + Math.random() * 3
      });
    } else {
      legitimate.push({
        avg_time_between_moves: 150 + Math.random() * 150,
        move_time_variance: 2000 + Math.random() * 5000,
        moves_per_food: 5 + Math.random() * 8,
        direction_entropy: 1.6 + Math.random() * 0.25,
        heartbeat_consistency: 0.8 + Math.random() * 0.15,
        score_rate: 4 + Math.random() * 6,
        frame_timing_deviation: 15 + Math.random() * 30,
        pause_gap_count: 0,
        speed_progression: 20 + Math.random() * 40,
        movement_burst_rate: 0.15 + Math.random() * 0.2,
        performance_time_drift: Math.random() * 60,
        avg_speed_per_food: 1 + Math.random() * 2
      });
    }
  }
  
  return legitimate;
}

/**
 * @param {Object} options
 * @param {boolean} [options.useSimpleModel=false]
 * @param {number} [options.epochs=50]
 * @param {number} [options.batchSize=32]
 * @param {number} [options.minSamples=100]
 * @param {boolean} [options.augmentWithSynthetic=true]
 * @returns {Promise<{accuracy: number, loss: number, samples: number}>}
 */
async function train(options = {}) {
  const {
    useSimpleModel = false,
    epochs = 50,
    batchSize = 32,
    minSamples = 100,
    augmentWithSynthetic = true
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
    
    syntheticCheats.forEach((/** @type {Object} */ f) => {
      allFeatures.push(f);
      allLabels.push(1);
    });
    
    syntheticLegit.forEach((/** @type {Object} */ f) => {
      allFeatures.push(f);
      allLabels.push(0);
    });
  }
  
  if (allFeatures.length < 10) {
    console.log('[ML Training] Not enough samples to train. Need at least 10 samples.');
    await closeDatabase();
    return { accuracy: 0, loss: 1, samples: allFeatures.length };
  }
  
  const featureArrays = allFeatures.map((/** @type {Object} */ f) => featuresToArray(f));
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
  
  const finalLoss = history.history.val_loss[history.history.val_loss.length - 1];
  const finalAcc = history.history.val_acc[history.history.val_acc.length - 1];
  
  console.log(`[ML Training] Training complete. Final validation accuracy: ${(finalAcc * 100).toFixed(2)}%`);
  
  await saveModel(model, normStats);
  console.log(`[ML Training] Model saved successfully`);
  
  xTrainTensor.dispose();
  yTrainTensor.dispose();
  xValTensor.dispose();
  yValTensor.dispose();
  
  await closeDatabase();
  
  return {
    accuracy: finalAcc,
    loss: finalLoss,
    samples: allFeatures.length
  };
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
