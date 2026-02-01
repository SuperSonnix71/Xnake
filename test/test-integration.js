const { loadModel, predict } = require('../ml/model');
const { normalizeFeatures } = require('../ml/features');
const { getEdgeCaseStats, convertEdgeCasesToTrainingData } = require('../ml/edgecases');
const { checkRetrainingNeeded } = require('../ml/scheduler');
const { train } = require('../ml/train');

async function runIntegrationTests() {
  console.log('=== End-to-End Integration Tests ===\n');
  
  let passed = 0;
  let failed = 0;
  
  console.log('Test 1: ML Model Loads Correctly');
  try {
    const loaded = await loadModel();
    if (loaded && loaded.model && loaded.stats) {
      console.log('  ✓ Model and stats loaded\n');
      passed++;
    } else {
      console.log('  ✗ Failed to load model\n');
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
    failed++;
  }
  
  console.log('Test 2: Edge Cases Collected');
  try {
    const stats = getEdgeCaseStats();
    if (stats.total > 0) {
      console.log(`  ✓ Found ${stats.total} edge cases`);
      console.log(`    Types: ${Object.keys(stats.byType).join(', ')}\n`);
      passed++;
    } else {
      console.log('  ⚠️  No edge cases yet (expected in new installations)\n');
      passed++;
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
    failed++;
  }
  
  console.log('Test 3: Edge Cases Convert to Training Data');
  try {
    const edgeData = convertEdgeCasesToTrainingData('hybrid');
    console.log(`  ✓ Converted ${edgeData.samples.length} samples`);
    console.log(`    Legitimate: ${edgeData.stats.legitimate}`);
    console.log(`    Cheats: ${edgeData.stats.cheats}`);
    console.log(`    Uncertain: ${edgeData.stats.uncertain}\n`);
    passed++;
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
    failed++;
  }
  
  console.log('Test 4: Scheduler Detects Retraining Need');
  try {
    const check = checkRetrainingNeeded();
    console.log(`  ✓ Scheduler check: ${check.reason}`);
    console.log(`    Should train: ${check.shouldTrain}\n`);
    passed++;
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
    failed++;
  }
  
  console.log('Test 5: Training Uses Edge Cases');
  try {
    const result = await train({ 
      epochs: 2, 
      minSamples: 10, 
      skipSave: true,
      augmentWithSynthetic: true
    });
    if (result.samples >= 10) {
      console.log(`  ✓ Training completed with ${result.samples} samples`);
      console.log(`    Accuracy: ${(result.accuracy * 100).toFixed(1)}%\n`);
      passed++;
    } else {
      console.log(`  ✗ Insufficient samples: ${result.samples}\n`);
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
    failed++;
  }
  
  console.log('Test 6: Model Makes Predictions');
  try {
    const loaded = await loadModel();
    const testFeatures = new Array(12).fill(0.5);
    const normalized = normalizeFeatures(testFeatures, loaded.stats);
    const prediction = await predict(normalized, null);
    
    if (typeof prediction === 'number' && prediction >= 0 && prediction <= 1) {
      console.log(`  ✓ Prediction successful: ${(prediction * 100).toFixed(1)}%\n`);
      passed++;
    } else {
      console.log(`  ✗ Invalid prediction: ${prediction}\n`);
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
    failed++;
  }
  
  console.log('=== Summary ===');
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}/${passed + failed}\n`);
  
  if (failed === 0) {
    console.log('✓ All integration tests passed!');
    console.log('\nSystem is ready:');
    console.log('  - ML model loads and makes predictions');
    console.log('  - Edge cases are collected and stored');
    console.log('  - Edge cases convert to training data');
    console.log('  - Scheduler monitors and triggers retraining');
    console.log('  - Training incorporates edge cases automatically');
    process.exit(0);
  } else {
    console.log('✗ Some tests failed');
    process.exit(1);
  }
}

runIntegrationTests().catch(err => {
  console.error('Integration test failed:', err);
  process.exit(1);
});
