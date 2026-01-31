const tf = require('@tensorflow/tfjs');
const path = require('path');
const fs = require('fs');
const { FEATURE_COUNT } = require('./features');

const MODEL_DIR = path.join(__dirname, 'models', 'cheat_detector');
const STATS_PATH = path.join(MODEL_DIR, 'normalization_stats.json');

const TIME_SERIES_LENGTH = 50;
const TIME_SERIES_FEATURES = 3;

/**
 * @returns {import('@tensorflow/tfjs').LayersModel}
 */
function createModel() {
  const featureInput = tf.input({ shape: [FEATURE_COUNT], name: 'features' });
  
  let featureBranch = /** @type {any} */ (tf.layers.dense({ units: 32, activation: 'relu' }).apply(featureInput));
  featureBranch = /** @type {any} */ (tf.layers.dropout({ rate: 0.3 }).apply(featureBranch));
  featureBranch = /** @type {any} */ (tf.layers.dense({ units: 16, activation: 'relu' }).apply(featureBranch));
  
  const timeSeriesInput = tf.input({ shape: [TIME_SERIES_LENGTH, TIME_SERIES_FEATURES], name: 'timeseries' });
  
  let tsBranch = /** @type {any} */ (tf.layers.conv1d({ filters: 16, kernelSize: 5, activation: 'relu', padding: 'same' }).apply(timeSeriesInput));
  tsBranch = /** @type {any} */ (tf.layers.dropout({ rate: 0.3 }).apply(tsBranch));
  tsBranch = /** @type {any} */ (tf.layers.conv1d({ filters: 16, kernelSize: 5, activation: 'relu', padding: 'same' }).apply(tsBranch));
  tsBranch = /** @type {any} */ (tf.layers.globalMaxPooling1d().apply(tsBranch));
  
  const combined = /** @type {any} */ (tf.layers.concatenate().apply([featureBranch, tsBranch]));
  
  let output = /** @type {any} */ (tf.layers.dense({ units: 32, activation: 'relu' }).apply(combined));
  output = /** @type {any} */ (tf.layers.dropout({ rate: 0.5 }).apply(output));
  output = /** @type {any} */ (tf.layers.dense({ units: 1, activation: 'sigmoid', name: 'output' }).apply(output));
  
  const model = tf.model({
    inputs: [featureInput, timeSeriesInput],
    outputs: output
  });
  
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy']
  });
  
  return model;
}

/**
 * @returns {import('@tensorflow/tfjs').LayersModel}
 */
function createSimpleModel() {
  const model = tf.sequential();
  
  model.add(tf.layers.dense({ units: 32, activation: 'relu', inputShape: [FEATURE_COUNT] }));
  model.add(tf.layers.dropout({ rate: 0.3 }));
  model.add(tf.layers.dense({ units: 16, activation: 'relu' }));
  model.add(tf.layers.dropout({ rate: 0.3 }));
  model.add(tf.layers.dense({ units: 1, activation: 'sigmoid' }));
  
  model.compile({
    optimizer: tf.train.adam(0.001),
    loss: 'binaryCrossentropy',
    metrics: ['accuracy']
  });
  
  return model;
}

/** @type {import('@tensorflow/tfjs').LayersModel|null} */
let cachedModel = null;
/** @type {Object|null} */
let cachedStats = null;

/**
 * @returns {import('@tensorflow/tfjs').io.IOHandler}
 */
function createFileIOHandler() {
  return {
    save: (/** @type {any} */ modelArtifacts) => {
      if (!fs.existsSync(MODEL_DIR)) {
        fs.mkdirSync(MODEL_DIR, { recursive: true });
      }
      
      const modelJson = {
        modelTopology: modelArtifacts.modelTopology,
        weightsManifest: [{
          paths: ['weights.bin'],
          weights: modelArtifacts.weightSpecs
        }],
        format: modelArtifacts.format,
        generatedBy: modelArtifacts.generatedBy,
        convertedBy: modelArtifacts.convertedBy
      };
      
      fs.writeFileSync(path.join(MODEL_DIR, 'model.json'), JSON.stringify(modelJson));
      
      if (modelArtifacts.weightData) {
        const weightBuffer = Buffer.from(modelArtifacts.weightData);
        fs.writeFileSync(path.join(MODEL_DIR, 'weights.bin'), weightBuffer);
      }
      
      return Promise.resolve({ modelArtifactsInfo: { dateSaved: new Date(), modelTopologyType: 'JSON' } });
    },
    load: () => {
      const modelJsonPath = path.join(MODEL_DIR, 'model.json');
      const modelJson = JSON.parse(fs.readFileSync(modelJsonPath, 'utf8'));
      
      const weightsPath = path.join(MODEL_DIR, 'weights.bin');
      let weightData = undefined;
      if (fs.existsSync(weightsPath)) {
        const buffer = fs.readFileSync(weightsPath);
        weightData = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
      }
      
      return Promise.resolve({
        modelTopology: modelJson.modelTopology,
        weightSpecs: modelJson.weightsManifest?.[0]?.weights || [],
        weightData,
        format: modelJson.format,
        generatedBy: modelJson.generatedBy,
        convertedBy: modelJson.convertedBy
      });
    }
  };
}

/**
 * @returns {Promise<{model: import('@tensorflow/tfjs').LayersModel, stats: Object}|null>}
 */
async function loadModel() {
  if (cachedModel && cachedStats) {
    return { model: cachedModel, stats: cachedStats };
  }
  
  const modelPath = path.join(MODEL_DIR, 'model.json');
  
  if (!fs.existsSync(modelPath)) {
    return null;
  }
  
  try {
    const loadedModel = await tf.loadLayersModel(createFileIOHandler());
    
    /** @type {Object} */
    let loadedStats;
    if (fs.existsSync(STATS_PATH)) {
      loadedStats = JSON.parse(fs.readFileSync(STATS_PATH, 'utf8'));
    } else {
      loadedStats = { means: new Array(FEATURE_COUNT).fill(0), stds: new Array(FEATURE_COUNT).fill(1) };
    }
    
    // eslint-disable-next-line require-atomic-updates
    cachedModel = loadedModel;
    // eslint-disable-next-line require-atomic-updates
    cachedStats = loadedStats;
    
    return { model: loadedModel, stats: loadedStats };
  } catch (err) {
    console.error('[ML] Error loading model:', err);
    return null;
  }
}

/**
 * @param {import('@tensorflow/tfjs').LayersModel} model
 * @param {Object} stats
 * @returns {Promise<void>}
 */
async function saveModel(model, stats) {
  if (!fs.existsSync(MODEL_DIR)) {
    fs.mkdirSync(MODEL_DIR, { recursive: true });
  }
  
  await model.save(createFileIOHandler());
  fs.writeFileSync(STATS_PATH, JSON.stringify(stats, null, 2));
  
  const newModel = model;
  const newStats = stats;
  cachedModel = newModel;
  cachedStats = newStats;
}

/**
 * @param {number[]} normalizedFeatures
 * @param {number[][]} [timeSeries]
 * @returns {Promise<number>}
 */
async function predict(normalizedFeatures, timeSeries) {
  const loaded = await loadModel();
  if (!loaded) {
    return 0.5;
  }
  
  const { model } = loaded;
  
  const isHybridModel = model.inputs.length === 2;
  
  if (isHybridModel && timeSeries) {
    const featureTensor = tf.tensor2d([normalizedFeatures]);
    const tsTensor = tf.tensor3d([timeSeries]);
    
    const prediction = /** @type {import('@tensorflow/tfjs').Tensor} */ (model.predict([featureTensor, tsTensor]));
    const result = await prediction.data();
    
    featureTensor.dispose();
    tsTensor.dispose();
    prediction.dispose();
    
    return result[0];
  }
  
  const featureTensor = tf.tensor2d([normalizedFeatures]);
  const prediction = /** @type {import('@tensorflow/tfjs').Tensor} */ (model.predict(featureTensor));
  const result = await prediction.data();
  
  featureTensor.dispose();
  prediction.dispose();
  
  return result[0];
}

/**
 * @returns {boolean}
 */
function isModelAvailable() {
  const modelPath = path.join(MODEL_DIR, 'model.json');
  return fs.existsSync(modelPath);
}

function clearCache() {
  cachedModel = null;
  cachedStats = null;
}

module.exports = {
  createModel,
  createSimpleModel,
  loadModel,
  saveModel,
  predict,
  isModelAvailable,
  clearCache,
  MODEL_DIR,
  TIME_SERIES_LENGTH,
  TIME_SERIES_FEATURES
};
