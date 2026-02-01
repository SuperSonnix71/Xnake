const { getEdgeCaseStats } = require('./edgecases');
const { triggerTraining, getTrainingStatus } = require('./worker');

const RETRAINING_CONFIG = {
  CHECK_INTERVAL_MS: 30 * 60 * 1000,
  EDGE_CASE_THRESHOLD: 10,
  MIN_RETRAINING_INTERVAL_MS: 2 * 60 * 60 * 1000,
  AUTO_RETRAINING_ENABLED: true
};

let lastEdgeCaseCount = 0;
let lastScheduledRetrainingTime = 0;

/** @type {NodeJS.Timeout|null} */
let schedulerInterval = null;

function checkRetrainingNeeded() {
  const stats = getEdgeCaseStats();
  const currentCount = stats.total;
  const newEdgeCases = currentCount - lastEdgeCaseCount;
  
  console.log(`[ML Scheduler] Edge case check: ${currentCount} total, ${newEdgeCases} new since last check`);
  
  if (newEdgeCases < RETRAINING_CONFIG.EDGE_CASE_THRESHOLD) {
    return {
      shouldTrain: false,
      reason: `Only ${newEdgeCases} new edge cases (threshold: ${RETRAINING_CONFIG.EDGE_CASE_THRESHOLD})`,
      edgeCaseCount: currentCount
    };
  }
  
  const now = Date.now();
  const timeSinceLastRetraining = now - lastScheduledRetrainingTime;
  
  if (timeSinceLastRetraining < RETRAINING_CONFIG.MIN_RETRAINING_INTERVAL_MS) {
    const minutesRemaining = Math.ceil((RETRAINING_CONFIG.MIN_RETRAINING_INTERVAL_MS - timeSinceLastRetraining) / 60000);
    return {
      shouldTrain: false,
      reason: `Retraining cooldown active (${minutesRemaining}m remaining)`,
      edgeCaseCount: currentCount
    };
  }
  
  const trainingStatus = getTrainingStatus();
  if (trainingStatus.inProgress) {
    return {
      shouldTrain: false,
      reason: 'Training already in progress',
      edgeCaseCount: currentCount
    };
  }
  
  return {
    shouldTrain: true,
    reason: `${newEdgeCases} new edge cases accumulated`,
    edgeCaseCount: currentCount
  };
}

async function periodicCheck() {
  if (!RETRAINING_CONFIG.AUTO_RETRAINING_ENABLED) {
    return;
  }
  
  try {
    const check = checkRetrainingNeeded();
    
    if (check.shouldTrain) {
      console.log(`[ML Scheduler] Triggering automatic retraining: ${check.reason}`);
      console.log(`[ML Scheduler] Edge case breakdown:`);
      
      const { byType } = getEdgeCaseStats();
      Object.entries(byType).forEach(([type, count]) => {
        console.log(`  - ${type}: ${count}`);
      });
      
      const result = await triggerTraining();
      
      if (result.success) {
        console.log(`[ML Scheduler] ✓ Retraining completed successfully`);
        console.log(`[ML Scheduler] New model version: ${result.version}`);
        if (result.metrics) {
          const { accuracy, f1Score } = /** @type {any} */ (result.metrics);
          console.log(`[ML Scheduler] Accuracy: ${(accuracy * 100).toFixed(1)}%, F1: ${(f1Score * 100).toFixed(1)}%`);
        }
        
        lastEdgeCaseCount = check.edgeCaseCount;
        lastScheduledRetrainingTime = Date.now();
      } else {
        console.log(`[ML Scheduler] Retraining failed: ${result.message}`);
      }
    } else {
      console.log(`[ML Scheduler] No retraining needed: ${check.reason}`);
    }
  } catch (err) {
    console.error('[ML Scheduler] Error during periodic check:', err);
  }
}

function startScheduler() {
  if (schedulerInterval) {
    console.log('[ML Scheduler] Scheduler already running');
    return;
  }
  
  if (!RETRAINING_CONFIG.AUTO_RETRAINING_ENABLED) {
    console.log('[ML Scheduler] Automatic retraining is disabled');
    return;
  }
  
  console.log('[ML Scheduler] Starting periodic edge case-based retraining');
  console.log(`[ML Scheduler] Check interval: ${RETRAINING_CONFIG.CHECK_INTERVAL_MS / 60000}m`);
  console.log(`[ML Scheduler] Edge case threshold: ${RETRAINING_CONFIG.EDGE_CASE_THRESHOLD}`);
  console.log(`[ML Scheduler] Min retraining interval: ${RETRAINING_CONFIG.MIN_RETRAINING_INTERVAL_MS / 60000}m`);
  
  const stats = getEdgeCaseStats();
  lastEdgeCaseCount = stats.total;
  console.log(`[ML Scheduler] Current edge cases: ${lastEdgeCaseCount}`);
  
  schedulerInterval = setInterval(periodicCheck, RETRAINING_CONFIG.CHECK_INTERVAL_MS);
  
  console.log('[ML Scheduler] ✓ Scheduler started successfully');
}

function stopScheduler() {
  if (schedulerInterval) {
    clearInterval(schedulerInterval);
    schedulerInterval = null;
    console.log('[ML Scheduler] Scheduler stopped');
  }
}

async function manualCheck() {
  console.log('[ML Scheduler] Manual check triggered');
  await periodicCheck();
}

function getSchedulerStatus() {
  return {
    running: schedulerInterval !== null,
    config: RETRAINING_CONFIG,
    lastEdgeCaseCount,
    lastRetrainingTime: lastScheduledRetrainingTime
  };
}

function updateConfig(/** @type {any} */ updates) {
  Object.assign(RETRAINING_CONFIG, updates);
  console.log('[ML Scheduler] Configuration updated:', updates);
  
  if (schedulerInterval) {
    stopScheduler();
    startScheduler();
  }
}

module.exports = {
  startScheduler,
  stopScheduler,
  manualCheck,
  getSchedulerStatus,
  updateConfig,
  checkRetrainingNeeded,
  RETRAINING_CONFIG
};
