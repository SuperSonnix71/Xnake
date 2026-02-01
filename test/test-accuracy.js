const { extractFeatures, featuresToArray, normalizeFeatures } = require('../ml/features');
const { loadModel, predict } = require('../ml/model');
const { generateSyntheticCheats, generateSyntheticLegitimate } = require('../ml/train');

async function testAccuracy() {
  console.log('=== Testing Real-Time ML Cheat Detection Accuracy ===\n');
  
  // Load the trained model
  console.log('Loading model...');
  const loaded = await loadModel();
  
  if (!loaded) {
    console.log('❌ No trained model found. Please train a model first.');
    return;
  }
  
  console.log('✓ Model loaded successfully\n');
  
  // Generate test data
  console.log('Generating test data...');
  const syntheticCheats = generateSyntheticCheats(20);
  const syntheticLegit = generateSyntheticLegitimate(20);
  
  console.log(`Generated ${syntheticCheats.length} synthetic cheat samples`);
  console.log(`Generated ${syntheticLegit.length} synthetic legitimate samples\n`);
  
  // Test on cheats
  console.log('--- Testing on Cheat Samples ---');
  let truePositives = 0;
  let falseNegatives = 0;
  const cheatPredictions = [];
  
  const cheatPromises = syntheticCheats.map(async (sample, i) => {
    const features = extractFeatures(sample.moves, sample.heartbeats, sample.score, sample.foodEaten, sample.gameDuration);
    const featureArray = featuresToArray(features);
    const normalized = normalizeFeatures(featureArray, loaded.stats);
    
    const prediction = await predict(normalized, null);
    return { prediction, sample, index: i };
  });
  
  const cheatResults = await Promise.all(cheatPromises);
  
  cheatResults.forEach(({ prediction, sample, index }) => {
    cheatPredictions.push(prediction);
    
    if (prediction > 0.75) {
      truePositives++;
    } else {
      falseNegatives++;
    }
    
    if (index < 5) {
      console.log(`  Sample ${index + 1}: Score=${sample.score}, Prediction=${(prediction * 100).toFixed(1)}% ${prediction > 0.75 ? '✓ BLOCKED' : '✗ MISSED'}`);
    }
  });
  
  console.log(`\nResults: ${truePositives}/${syntheticCheats.length} detected (${((truePositives / syntheticCheats.length) * 100).toFixed(1)}%)`);
  console.log(`False Negatives: ${falseNegatives}\n`);
  
  // Test on legitimate
  console.log('--- Testing on Legitimate Samples ---');
  let trueNegatives = 0;
  let falsePositives = 0;
  const legitPredictions = [];
  
  const legitPromises = syntheticLegit.map(async (sample, i) => {
    const features = extractFeatures(sample.moves, sample.heartbeats, sample.score, sample.foodEaten, sample.gameDuration);
    const featureArray = featuresToArray(features);
    const normalized = normalizeFeatures(featureArray, loaded.stats);
    
    const prediction = await predict(normalized, null);
    return { prediction, sample, index: i };
  });
  
  const legitResults = await Promise.all(legitPromises);
  
  legitResults.forEach(({ prediction, sample, index }) => {
    legitPredictions.push(prediction);
    
    if (prediction <= 0.75) {
      trueNegatives++;
    } else {
      falsePositives++;
    }
    
    if (index < 5) {
      console.log(`  Sample ${index + 1}: Score=${sample.score}, Prediction=${(prediction * 100).toFixed(1)}% ${prediction <= 0.75 ? '✓ PASSED' : '✗ FALSE ALARM'}`);
    }
  });
  
  console.log(`\nResults: ${trueNegatives}/${syntheticLegit.length} passed correctly (${((trueNegatives / syntheticLegit.length) * 100).toFixed(1)}%)`);
  console.log(`False Positives: ${falsePositives}\n`);
  
  // Overall metrics
  console.log('=== Overall Metrics ===');
  const totalSamples = syntheticCheats.length + syntheticLegit.length;
  const accuracy = (truePositives + trueNegatives) / totalSamples;
  const precision = truePositives / (truePositives + falsePositives);
  const recall = truePositives / (truePositives + falseNegatives);
  const f1Score = 2 * (precision * recall) / (precision + recall);
  
  console.log(`Accuracy:  ${(accuracy * 100).toFixed(1)}%`);
  console.log(`Precision: ${(precision * 100).toFixed(1)}% (of detected cheats, how many are real)`);
  console.log(`Recall:    ${(recall * 100).toFixed(1)}% (of real cheats, how many detected)`);
  console.log(`F1 Score:  ${(f1Score * 100).toFixed(1)}%\n`);
  
  // Edge case analysis
  console.log('=== Edge Case Analysis ===');
  const uncertainCheats = cheatPredictions.filter(p => p >= 0.3 && p <= 0.7).length;
  const uncertainLegit = legitPredictions.filter(p => p >= 0.3 && p <= 0.7).length;
  
  console.log(`Cheats in uncertain range (30-70%): ${uncertainCheats}/${syntheticCheats.length}`);
  console.log(`Legit in uncertain range (30-70%): ${uncertainLegit}/${syntheticLegit.length}`);
  console.log(`\nThese uncertain cases should be logged as edge cases for model improvement.\n`);
  
  // Recommendation
  if (accuracy < 0.9) {
    console.log('⚠️  RECOMMENDATION: Accuracy is below 90%. Consider retraining with more data.');
  } else if (falsePositives > 2) {
    console.log('⚠️  RECOMMENDATION: High false positive rate. May frustrate legitimate players.');
  } else if (falseNegatives > 2) {
    console.log('⚠️  RECOMMENDATION: High false negative rate. Cheaters may slip through.');
  } else {
    console.log('✓ Model performance looks good!');
  }
}

testAccuracy().catch(console.error);
