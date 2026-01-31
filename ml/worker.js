const { train } = require('./train');
const { getActiveVersion, createNewVersion, activateVersion, compareMetrics, logTrainingEvent } = require('./versioning');
const { computeGlobalFeatureImportance } = require('./shap');
const { loadModel } = require('./model');

const DEBOUNCE_MS = 5 * 60 * 1000;
const MIN_SAMPLES_FOR_TRAINING = 20;

let lastTrainingTime = 0;
let trainingInProgress = false;
let pendingTrainingRequest = false;

/**
 * @typedef {Object} TrainingResult
 * @property {boolean} success
 * @property {string} [version]
 * @property {string} [message]
 * @property {Object} [metrics]
 * @property {Object} [featureImportance]
 */

/**
 * @returns {boolean}
 */
function canTriggerTraining() {
  const now = Date.now();
  const timeSinceLastTraining = now - lastTrainingTime;
  return timeSinceLastTraining >= DEBOUNCE_MS && !trainingInProgress;
}

/**
 * @returns {Promise<TrainingResult>}
 */
async function runTraining() {
  if (trainingInProgress) {
    pendingTrainingRequest = true;
    return { success: false, message: 'Training already in progress' };
  }
  
  trainingInProgress = true;
  lastTrainingTime = Date.now();
  
  console.log('[ML Worker] Starting training...');
  
  try {
    const result = await train({
      epochs: 50,
      minSamples: MIN_SAMPLES_FOR_TRAINING,
      augmentWithSynthetic: true,
      returnDetailedMetrics: true
    });
    
    if (result.samples < MIN_SAMPLES_FOR_TRAINING) {
      logTrainingEvent('none', 'Training skipped - insufficient samples', { samples: result.samples });
      return { success: false, message: `Insufficient samples: ${result.samples}` };
    }
    
    /** @type {import('./versioning').ModelMetrics} */
    const metrics = {
      accuracy: result.accuracy,
      loss: result.loss,
      precision: result.precision || result.accuracy,
      recall: result.recall || result.accuracy,
      f1Score: result.f1Score || result.accuracy,
      trainingSamples: result.trainingSamples || result.samples,
      validationSamples: result.validationSamples || Math.floor(result.samples * 0.2),
      epochs: 50
    };
    
    const activeVersion = getActiveVersion();
    const comparison = compareMetrics(metrics, activeVersion?.metrics || null);
    
    const { version, path: _versionPath } = createNewVersion(metrics);
    
    logTrainingEvent(version, 'Model trained', { 
      metrics, 
      comparison: comparison.reason,
      willActivate: comparison.shouldActivate 
    });
    
    /** @type {Object<string, number>|undefined} */
    let featureImportance;
    
    if (comparison.shouldActivate) {
      activateVersion(version);
      logTrainingEvent(version, 'Model activated');
      console.log(`[ML Worker] New model ${version} activated: ${comparison.reason}`);
      
      try {
        const loaded = await loadModel();
        if (loaded && loaded.model && result.validationFeatures && result.validationFeatures.length > 0) {
          const backgroundData = result.trainingFeatures || [];
          featureImportance = await computeGlobalFeatureImportance(
            loaded.model, 
            result.validationFeatures, 
            backgroundData
          );
          logTrainingEvent(version, 'SHAP feature importance computed', { featureImportance });
        }
      } catch (shapErr) {
        console.error('[ML Worker] SHAP computation failed:', shapErr);
      }
    } else {
      logTrainingEvent(version, 'Model not activated - underperforms', { reason: comparison.reason });
      console.log(`[ML Worker] New model ${version} NOT activated: ${comparison.reason}`);
    }
    
    return {
      success: true,
      version,
      message: comparison.shouldActivate ? 'Model trained and activated' : 'Model trained but not activated (underperforms)',
      metrics,
      featureImportance
    };
    
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logTrainingEvent('error', 'Training failed', { error: errorMsg });
    console.error('[ML Worker] Training failed:', err);
    return { success: false, message: errorMsg };
  } finally {
    // eslint-disable-next-line require-atomic-updates
    trainingInProgress = false;
    
    if (pendingTrainingRequest) {
      pendingTrainingRequest = false;
      setTimeout(() => {
        if (canTriggerTraining()) {
          runTraining();
        }
      }, 1000);
    }
  }
}

/**
 * @returns {Promise<TrainingResult>}
 */
function triggerTraining() {
  if (!canTriggerTraining()) {
    const waitTime = Math.ceil((DEBOUNCE_MS - (Date.now() - lastTrainingTime)) / 1000);
    pendingTrainingRequest = true;
    return Promise.resolve({ 
      success: false, 
      message: trainingInProgress 
        ? 'Training in progress, will retrain after completion' 
        : `Debounce active, next training in ${waitTime}s` 
    });
  }
  
  return runTraining();
}

/**
 * @param {string} _cheatType
 * @param {Object} _features
 */
function onCheatDetected(_cheatType, _features) {
  console.log('[ML Worker] Cheat detected, scheduling training...');
  
  if (canTriggerTraining()) {
    setImmediate(() => {
      runTraining().catch(err => {
        console.error('[ML Worker] Background training error:', err);
      });
    });
  } else {
    pendingTrainingRequest = true;
    const waitTime = Math.ceil((DEBOUNCE_MS - (Date.now() - lastTrainingTime)) / 1000);
    console.log(`[ML Worker] Training debounced, will run in ${waitTime}s`);
  }
}

/**
 * @returns {{ inProgress: boolean, lastTrainingTime: number, pendingRequest: boolean, canTrain: boolean }}
 */
function getTrainingStatus() {
  return {
    inProgress: trainingInProgress,
    lastTrainingTime,
    pendingRequest: pendingTrainingRequest,
    canTrain: canTriggerTraining()
  };
}

module.exports = {
  triggerTraining,
  onCheatDetected,
  getTrainingStatus,
  canTriggerTraining,
  DEBOUNCE_MS,
  MIN_SAMPLES_FOR_TRAINING
};
