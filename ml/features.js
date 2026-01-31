/** @typedef {{ d: number, f: number, t: number }} Move */
/** @typedef {{ t: number, p?: number, f: number, s?: number, score?: number }} Heartbeat */
/** @typedef {Object<string, number>} FeatureMap */
/** @typedef {{ means: number[], stds: number[] }} NormalizationStats */

const FEATURE_NAMES = [
  'avg_time_between_moves',
  'move_time_variance',
  'moves_per_food',
  'direction_entropy',
  'heartbeat_consistency',
  'score_rate',
  'frame_timing_deviation',
  'pause_gap_count',
  'speed_progression',
  'movement_burst_rate',
  'performance_time_drift',
  'avg_speed_per_food'
];

const FEATURE_COUNT = FEATURE_NAMES.length;

/**
 * @param {number[]} values
 * @returns {number}
 */
function calculateEntropy(values) {
  if (!values || values.length === 0) { return 0; }
  /** @type {Object<number, number>} */
  const counts = {};
  values.forEach((/** @type {number} */ v) => { counts[v] = (counts[v] || 0) + 1; });
  const total = values.length;
  let entropy = 0;
  Object.values(counts).forEach((/** @type {number} */ count) => {
    const p = count / total;
    if (p > 0) { entropy -= p * Math.log2(p); }
  });
  return entropy;
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function calculateVariance(values) {
  if (!values || values.length < 2) { return 0; }
  const mean = values.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / values.length;
  const squaredDiffs = values.map((/** @type {number} */ v) => Math.pow(v - mean, 2));
  return squaredDiffs.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / values.length;
}

/**
 * @param {number[]} values
 * @returns {number}
 */
function calculateStdDev(values) {
  return Math.sqrt(calculateVariance(values));
}

/**
 * @param {Move[]} moves
 * @param {Heartbeat[]} heartbeats
 * @param {number} score
 * @param {number} foodEaten
 * @param {number} gameDuration
 * @returns {FeatureMap}
 */
function extractFeatures(moves, heartbeats, score, foodEaten, gameDuration) {
  /** @type {FeatureMap} */
  const features = {};
  
  const moveTimes = moves.map((/** @type {Move} */ m) => m.t);
  /** @type {number[]} */
  const timeDiffs = [];
  for (let i = 1; i < moveTimes.length; i++) {
    timeDiffs.push(moveTimes[i] - moveTimes[i - 1]);
  }
  features.avg_time_between_moves = timeDiffs.length > 0 
    ? timeDiffs.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / timeDiffs.length 
    : 0;
  
  features.move_time_variance = calculateVariance(timeDiffs);
  
  features.moves_per_food = foodEaten > 0 ? moves.length / foodEaten : moves.length;
  
  const directions = moves.map((/** @type {Move} */ m) => m.d);
  features.direction_entropy = calculateEntropy(directions);
  
  /** @type {number[]} */
  const heartbeatIntervals = [];
  for (let i = 1; i < heartbeats.length; i++) {
    heartbeatIntervals.push(heartbeats[i].t - heartbeats[i - 1].t);
  }
  const expectedInterval = 1000;
  const intervalDeviations = heartbeatIntervals.map((/** @type {number} */ interval) => Math.abs(interval - expectedInterval));
  features.heartbeat_consistency = intervalDeviations.length > 0
    ? 1 - Math.min(1, calculateStdDev(intervalDeviations) / 500)
    : 0;
  
  features.score_rate = gameDuration > 0 ? score / gameDuration : 0;
  
  const frameTimings = moves.map((/** @type {Move} */ m, /** @type {number} */ i) => {
    if (i === 0) { return null; }
    const prevMove = moves[i - 1];
    const timeDiff = m.t - prevMove.t;
    const frameDiff = m.f - prevMove.f;
    return frameDiff > 0 ? timeDiff / frameDiff : null;
  }).filter((/** @type {number|null} */ v) => v !== null);
  features.frame_timing_deviation = calculateStdDev(/** @type {number[]} */ (frameTimings));
  
  let pauseGapCount = 0;
  const PAUSE_THRESHOLD = 2000;
  for (let i = 1; i < heartbeats.length; i++) {
    const gap = heartbeats[i].t - heartbeats[i - 1].t;
    if (gap > PAUSE_THRESHOLD) { pauseGapCount++; }
  }
  features.pause_gap_count = pauseGapCount;
  
  const speeds = heartbeats.map((/** @type {Heartbeat} */ h) => h.s).filter((/** @type {number|undefined} */ s) => s !== undefined);
  if (speeds.length >= 2) {
    /** @type {number[]} */
    const speedChanges = [];
    for (let i = 1; i < speeds.length; i++) {
      speedChanges.push(/** @type {number} */ (speeds[i - 1]) - /** @type {number} */ (speeds[i]));
    }
    features.speed_progression = speedChanges.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0);
  } else {
    features.speed_progression = 0;
  }
  
  const BURST_THRESHOLD = 100;
  let burstCount = 0;
  for (let i = 0; i < timeDiffs.length; i++) {
    if (timeDiffs[i] < BURST_THRESHOLD) { burstCount++; }
  }
  features.movement_burst_rate = timeDiffs.length > 0 ? burstCount / timeDiffs.length : 0;
  
  if (heartbeats.length >= 2) {
    const drifts = heartbeats.map((/** @type {Heartbeat} */ h) => {
      if (h.p === undefined) { return 0; }
      return Math.abs(h.t - h.p);
    });
    features.performance_time_drift = drifts.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / drifts.length;
  } else {
    features.performance_time_drift = 0;
  }
  
  if (speeds.length > 0 && foodEaten > 0) {
    const avgSpeed = /** @type {number[]} */ (speeds).reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / speeds.length;
    features.avg_speed_per_food = avgSpeed / foodEaten;
  } else {
    features.avg_speed_per_food = 0;
  }
  
  return features;
}

/**
 * @param {FeatureMap} features
 * @returns {number[]}
 */
function featuresToArray(features) {
  return FEATURE_NAMES.map((/** @type {string} */ name) => features[name] || 0);
}

/**
 * @param {number[]} featuresArray
 * @param {NormalizationStats} stats
 * @returns {number[]}
 */
function normalizeFeatures(featuresArray, stats) {
  return featuresArray.map((/** @type {number} */ value, /** @type {number} */ i) => {
    const mean = stats.means[i] || 0;
    const std = stats.stds[i] || 1;
    return std > 0 ? (value - mean) / std : 0;
  });
}

/**
 * @param {number[][]} allFeaturesArrays
 * @returns {NormalizationStats}
 */
function computeNormalizationStats(allFeaturesArrays) {
  const featureCount = allFeaturesArrays[0]?.length || FEATURE_COUNT;
  /** @type {number[]} */
  const means = [];
  /** @type {number[]} */
  const stds = [];
  
  for (let i = 0; i < featureCount; i++) {
    const values = allFeaturesArrays.map((/** @type {number[]} */ f) => f[i]);
    const mean = values.reduce((/** @type {number} */ a, /** @type {number} */ b) => a + b, 0) / values.length;
    means.push(mean);
    stds.push(calculateStdDev(values));
  }
  
  return { means, stds };
}

/**
 * @param {Move[]} moves
 * @param {Heartbeat[]} heartbeats
 * @param {number} [windowSize=50]
 * @returns {number[][]}
 */
function createTimeSeriesFeatures(moves, heartbeats, windowSize = 50) {
  /** @type {number[][]} */
  const timeSeries = [];
  
  for (let i = 0; i < windowSize; i++) {
    if (i < moves.length) {
      const m = moves[i];
      const prevT = i > 0 ? moves[i - 1].t : 0;
      timeSeries.push([
        m.d / 3,
        (m.t - prevT) / 1000,
        m.f / 1000
      ]);
    } else {
      timeSeries.push([0, 0, 0]);
    }
  }
  
  return timeSeries;
}

module.exports = {
  FEATURE_NAMES,
  FEATURE_COUNT,
  extractFeatures,
  featuresToArray,
  normalizeFeatures,
  computeNormalizationStats,
  createTimeSeriesFeatures,
  calculateEntropy,
  calculateVariance,
  calculateStdDev
};
