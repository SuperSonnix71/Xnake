const tf = require('@tensorflow/tfjs');
const { FEATURE_NAMES } = require('./features');

/**
 * @typedef {Object} ShapExplanation
 * @property {number[]} shapValues
 * @property {Object<string, number>} featureImportance
 * @property {number} baseValue
 * @property {number} prediction
 */

/**
 * @param {number[]} features
 * @param {number[][]} backgroundData
 * @returns {number[]}
 */
function computeFeatureMeans(features, backgroundData) {
  if (backgroundData.length === 0) {
    return features.map(() => 0);
  }
  
  const means = [];
  for (let i = 0; i < features.length; i++) {
    const sum = backgroundData.reduce((acc, row) => acc + row[i], 0);
    means.push(sum / backgroundData.length);
  }
  return means;
}

/**
 * @param {tf.LayersModel} model
 * @param {number[]} instance
 * @param {number[][]} backgroundData
 * @param {number} [numSamples=100]
 * @returns {Promise<ShapExplanation>}
 */
async function kernelShap(model, instance, backgroundData, numSamples = 100) {
  const numFeatures = instance.length;
  const featureMeans = computeFeatureMeans(instance, backgroundData);
  
  const basePredTensor = model.predict(tf.tensor2d([featureMeans]));
  const baseValue = (await /** @type {tf.Tensor} */ (basePredTensor).data())[0];
  /** @type {tf.Tensor} */ (basePredTensor).dispose();
  
  const fullPredTensor = model.predict(tf.tensor2d([instance]));
  const prediction = (await /** @type {tf.Tensor} */ (fullPredTensor).data())[0];
  /** @type {tf.Tensor} */ (fullPredTensor).dispose();
  
  const shapValues = new Array(numFeatures).fill(0);
  const counts = new Array(numFeatures).fill(0);
  
  for (let s = 0; s < numSamples; s++) {
    const coalition = instance.map(() => Math.random() > 0.5);
    const numInCoalition = coalition.filter(Boolean).length;
    
    if (numInCoalition === 0 || numInCoalition === numFeatures) {
      continue;
    }
    
    const coalitionWeight = 1 / (numFeatures * comb(numFeatures - 1, numInCoalition));
    
    const maskedInstance = instance.map((val, i) => {
      if (coalition[i]) {
        return val;
      }
      return featureMeans[i];
    });
    const predTensor = model.predict(tf.tensor2d([maskedInstance]));
    const coalitionPred = (await /** @type {tf.Tensor} */ (predTensor).data())[0];
    /** @type {tf.Tensor} */ (predTensor).dispose();
    
    for (let i = 0; i < numFeatures; i++) {
      if (coalition[i]) {
        const withoutI = [...maskedInstance];
        withoutI[i] = featureMeans[i];
        const withoutTensor = model.predict(tf.tensor2d([withoutI]));
        const withoutPred = (await /** @type {tf.Tensor} */ (withoutTensor).data())[0];
        /** @type {tf.Tensor} */ (withoutTensor).dispose();
        
        const marginalContrib = coalitionPred - withoutPred;
        shapValues[i] += marginalContrib * coalitionWeight;
        counts[i]++;
      }
    }
  }
  
  for (let i = 0; i < numFeatures; i++) {
    if (counts[i] > 0) {
      shapValues[i] /= counts[i];
    }
  }
  
  const sumShap = shapValues.reduce((a, b) => a + b, 0);
  const diff = prediction - baseValue;
  if (Math.abs(sumShap) > 0.001 && Math.abs(diff) > 0.001) {
    const scale = diff / sumShap;
    for (let i = 0; i < numFeatures; i++) {
      shapValues[i] *= scale;
    }
  }
  
  /** @type {Object<string, number>} */
  const featureImportance = {};
  for (let i = 0; i < numFeatures; i++) {
    const name = FEATURE_NAMES[i] || `feature_${i}`;
    featureImportance[name] = shapValues[i];
  }
  
  return {
    shapValues,
    featureImportance,
    baseValue,
    prediction
  };
}

/**
 * @param {number} n
 * @param {number} k
 * @returns {number}
 */
function comb(n, k) {
  if (k < 0 || k > n) {
    return 0;
  }
  if (k === 0 || k === n) {
    return 1;
  }
  let result = 1;
  for (let i = 0; i < k; i++) {
    result = result * (n - i) / (i + 1);
  }
  return result;
}

/**
 * @param {tf.LayersModel} model
 * @param {number[][]} testData
 * @param {number[][]} backgroundData
 * @param {number} [numSamples=50]
 * @returns {Promise<Object<string, number>>}
 */
async function computeGlobalFeatureImportance(model, testData, backgroundData, numSamples = 50) {
  /** @type {Object<string, number[]>} */
  const allShapValues = {};
  FEATURE_NAMES.forEach(name => { allShapValues[name] = []; });
  
  const samplesToExplain = testData.slice(0, Math.min(20, testData.length));
  
  for (const instance of samplesToExplain) {
    const explanation = await kernelShap(model, instance, backgroundData, numSamples);
    for (const [name, value] of Object.entries(explanation.featureImportance)) {
      if (allShapValues[name]) {
        allShapValues[name].push(Math.abs(value));
      }
    }
  }
  
  /** @type {Object<string, number>} */
  const globalImportance = {};
  for (const [name, values] of Object.entries(allShapValues)) {
    if (values.length > 0) {
      globalImportance[name] = values.reduce((a, b) => a + b, 0) / values.length;
    } else {
      globalImportance[name] = 0;
    }
  }
  
  return globalImportance;
}

/**
 * @param {ShapExplanation} explanation
 * @returns {string}
 */
function formatExplanation(explanation) {
  const sorted = Object.entries(explanation.featureImportance)
    .sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]));
  
  const lines = [
    `Prediction: ${(explanation.prediction * 100).toFixed(2)}% cheat probability`,
    `Base value: ${(explanation.baseValue * 100).toFixed(2)}%`,
    '',
    'Feature contributions:'
  ];
  
  for (const [name, value] of sorted) {
    const direction = value > 0 ? '+' : '';
    const percent = (value * 100).toFixed(2);
    lines.push(`  ${name}: ${direction}${percent}%`);
  }
  
  return lines.join('\n');
}

module.exports = {
  kernelShap,
  computeGlobalFeatureImportance,
  formatExplanation
};
