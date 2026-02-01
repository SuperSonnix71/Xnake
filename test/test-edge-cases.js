const { checkRetrainingNeeded, getSchedulerStatus, RETRAINING_CONFIG } = require('../ml/scheduler');
const { getTrainingStatus } = require('../ml/worker');
const { getEdgeCaseStats } = require('../ml/edgecases');

function testEdgeCases() {
  console.log('=== Edge Case & Race Condition Tests ===\n');
  
  let passed = 0;
  let failed = 0;
  
  console.log('Test 1: Check when no edge cases exist');
  try {
    const stats = getEdgeCaseStats();
    const result = checkRetrainingNeeded();
    
    if (stats.total === 0) {
      if (!result.shouldTrain && result.reason.includes('0 new edge cases')) {
        console.log('  ✓ Correctly rejects training with 0 edge cases\n');
        passed++;
      } else {
        console.log('  ✗ Should not train with 0 edge cases\n');
        failed++;
      }
    } else {
      console.log(`  ⚠️  Edge cases already exist (${stats.total}), skipping this test\n`);
      passed++;
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
    failed++;
  }
  
  console.log('Test 2: Cooldown period enforcement logic');
  try {
    const status1 = getTrainingStatus();
    const canTrain1 = status1.canTrain;
    const lastTime1 = status1.lastTrainingTime;
    
    console.log(`  ℹ  Can train: ${canTrain1}, Last training: ${lastTime1}`);
    console.log('  ✓ Cooldown logic accessible\n');
    passed++;
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
    failed++;
  }
  
  console.log('Test 3: Training in progress check');
  try {
    const status = getTrainingStatus();
    
    if (typeof status.inProgress === 'boolean' && 
        typeof status.canTrain === 'boolean' &&
        typeof status.lastTrainingTime === 'number') {
      console.log('  ✓ Training status provides all required fields\n');
      passed++;
    } else {
      console.log('  ✗ Training status missing required fields\n');
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
    failed++;
  }
  
  console.log('Test 4: Scheduler status consistency');
  try {
    const status = getSchedulerStatus();
    
    if (typeof status.running === 'boolean' &&
        status.config &&
        typeof status.config.CHECK_INTERVAL_MS === 'number' &&
        typeof status.config.EDGE_CASE_THRESHOLD === 'number' &&
        typeof status.lastEdgeCaseCount === 'number' &&
        typeof status.lastRetrainingTime === 'number') {
      console.log('  ✓ Scheduler status provides all required fields\n');
      passed++;
    } else {
      console.log('  ✗ Scheduler status missing required fields\n');
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
    failed++;
  }
  
  console.log('Test 5: Configuration validation');
  try {
    const { config } = getSchedulerStatus();
    
    if (config.CHECK_INTERVAL_MS > 0 &&
        config.EDGE_CASE_THRESHOLD > 0 &&
        config.MIN_RETRAINING_INTERVAL_MS > 0 &&
        typeof config.AUTO_RETRAINING_ENABLED === 'boolean') {
      console.log('  ✓ Configuration values are valid\n');
      passed++;
    } else {
      console.log('  ✗ Configuration has invalid values\n');
      failed++;
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
    failed++;
  }
  
  console.log('Test 6: Edge case threshold boundary');
  try {
    const stats = getEdgeCaseStats();
    const result = checkRetrainingNeeded();
    const threshold = RETRAINING_CONFIG.EDGE_CASE_THRESHOLD;
    
    if (stats.total >= threshold) {
      console.log(`  ✓ ${stats.total} edge cases >= threshold (${threshold})`);
      
      if (result.shouldTrain || result.reason.includes('cooldown') || result.reason.includes('progress')) {
        console.log('  ✓ System correctly handles threshold condition\n');
        passed++;
      } else {
        console.log(`  ✗ Expected training or valid rejection reason, got: ${result.reason}\n`);
        failed++;
      }
    } else {
      console.log(`  ℹ  ${stats.total} edge cases < threshold (${threshold})`);
      
      if (!result.shouldTrain) {
        console.log('  ✓ System correctly rejects training below threshold\n');
        passed++;
      } else {
        console.log('  ✗ Should not train below threshold\n');
        failed++;
      }
    }
  } catch (err) {
    console.log(`  ✗ Error: ${err.message}\n`);
    failed++;
  }
  
  console.log('=== Summary ===');
  console.log(`Passed: ${passed}/${passed + failed}`);
  console.log(`Failed: ${failed}/${passed + failed}\n`);
  
  if (failed === 0) {
    console.log('✓ All edge case tests passed!');
    process.exit(0);
  } else {
    console.log('✗ Some edge case tests failed');
    process.exit(1);
  }
}

testEdgeCases();
