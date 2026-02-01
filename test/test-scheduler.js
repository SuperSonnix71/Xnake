const { getEdgeCaseStats } = require('../ml/edgecases');
const { checkRetrainingNeeded, RETRAINING_CONFIG } = require('../ml/scheduler');

async function testScheduler() {
  console.log('=== Testing Periodic Edge Case-Based Retraining ===\n');
  
  // Show current edge case stats
  const stats = getEdgeCaseStats();
  console.log('Current Edge Case Statistics:');
  console.log(`  Total: ${stats.total}`);
  console.log('  Breakdown by type:');
  Object.entries(stats.byType).forEach(([type, count]) => {
    console.log(`    - ${type}: ${count}`);
  });
  console.log();
  
  // Show scheduler configuration
  console.log('Scheduler Configuration:');
  console.log(`  Check interval: ${RETRAINING_CONFIG.CHECK_INTERVAL_MS / 60000} minutes`);
  console.log(`  Edge case threshold: ${RETRAINING_CONFIG.EDGE_CASE_THRESHOLD} cases`);
  console.log(`  Min retraining interval: ${RETRAINING_CONFIG.MIN_RETRAINING_INTERVAL_MS / 60000} minutes`);
  console.log(`  Auto-retraining enabled: ${RETRAINING_CONFIG.AUTO_RETRAINING_ENABLED}`);
  console.log();
  
  // Check if retraining is needed
  console.log('Checking if retraining is needed...');
  const check = await checkRetrainingNeeded();
  console.log(`  Should train: ${check.shouldTrain}`);
  console.log(`  Reason: ${check.reason}`);
  console.log(`  Current edge cases: ${check.edgeCaseCount}`);
  console.log();
  
  // Analysis
  console.log('=== Analysis ===');
  
  if (stats.total === 0) {
    console.log('⚠️  No edge cases recorded yet.');
    console.log('   Edge cases are logged when:');
    console.log('   - Rules detect cheat but ML says legitimate (low confidence)');
    console.log('   - Rules pass but ML flags as cheat (high confidence)');
    console.log('   - ML is uncertain (30-70% confidence range)');
  } else if (stats.total < RETRAINING_CONFIG.EDGE_CASE_THRESHOLD) {
    console.log(`✓ Edge cases are being logged (${stats.total} so far)`);
    console.log(`  Need ${RETRAINING_CONFIG.EDGE_CASE_THRESHOLD - stats.total} more before automatic retraining triggers`);
  } else {
    console.log(`✓ Edge case threshold reached! (${stats.total} cases)`);
    if (check.shouldTrain) {
      console.log('  ✓ Ready to trigger automatic retraining');
    } else {
      console.log(`  ⏳ ${check.reason}`);
    }
  }
  
  console.log();
  
  // Edge case interpretation
  if (stats.byType.rules_negative_ml_positive) {
    console.log(`⚠️  ${stats.byType.rules_negative_ml_positive} cases where ML detected cheats that rules missed`);
    console.log('   → These are potential false positives OR missed cheats by rules');
  }
  
  if (stats.byType.rules_positive_ml_negative) {
    console.log(`⚠️  ${stats.byType.rules_positive_ml_negative} cases where rules detected cheats but ML didn't`);
    console.log('   → ML model may need retraining to catch these patterns');
  }
  
  if (stats.byType.ml_uncertain_rules_negative || stats.byType.ml_uncertain_rules_positive) {
    const uncertain = (stats.byType.ml_uncertain_rules_negative || 0) + 
                     (stats.byType.ml_uncertain_rules_positive || 0);
    console.log(`ℹ️  ${uncertain} cases where ML was uncertain (30-70% confidence)`);
    console.log('   → These borderline cases help improve model accuracy');
  }
  
  console.log();
  console.log('=== How it Works ===');
  console.log('1. Server collects edge cases during normal operation');
  console.log('2. Every 30 minutes, scheduler checks edge case count');
  console.log(`3. If ${RETRAINING_CONFIG.EDGE_CASE_THRESHOLD}+ new cases accumulated, triggers retraining`);
  console.log('4. Training uses: real data + edge cases + synthetic data');
  console.log('5. New model is evaluated and activated if better than current');
  console.log('6. Scheduler waits 2 hours minimum before next retraining');
}

testScheduler().catch(console.error);
