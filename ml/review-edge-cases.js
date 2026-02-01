const { getEdgeCases, classifyEdgeCases, convertEdgeCasesToTrainingData } = require('./edgecases');

console.log('\n=== Edge Case Review Tool ===\n');

const edgeCases = getEdgeCases(10000);
console.log(`Total edge cases found: ${edgeCases.length}\n`);

if (edgeCases.length === 0) {
  console.log('No edge cases to review.');
  process.exit(0);
}

const classified = classifyEdgeCases('trust_rules');
console.log('Classification by "trust_rules" strategy:');
console.log(`  Legitimate: ${classified.legitimate.length}`);
console.log(`  Cheats: ${classified.cheats.length}`);
console.log(`  Uncertain: ${classified.uncertain.length}\n`);

const byType = {};
edgeCases.forEach(ec => {
  byType[ec.edgeType] = (byType[ec.edgeType] || 0) + 1;
});

console.log('Edge cases by type:');
Object.entries(byType).forEach(([type, count]) => {
  console.log(`  ${type}: ${count}`);
});

console.log('\n=== Training Data Conversion Stats ===\n');

['trust_rules', 'trust_ml', 'conservative', 'hybrid'].forEach(strategy => {
  const result = convertEdgeCasesToTrainingData(strategy);
  console.log(`Strategy: ${strategy}`);
  console.log(`  Usable for training: ${result.stats.usableForTraining}`);
  console.log(`  Legitimate: ${result.stats.legitimate}`);
  console.log(`  Cheats: ${result.stats.cheats}`);
  console.log(`  Uncertain (excluded): ${result.stats.uncertain}`);
  console.log('');
});

console.log('=== High-Confidence ML Detections (Rules Said Legitimate) ===\n');
const mlHighConfidence = edgeCases.filter(ec => 
  ec.edgeType === 'rules_negative_ml_positive' && ec.mlProbability > 0.9
);

mlHighConfidence.slice(0, 10).forEach((ec, i) => {
  console.log(`${i + 1}. Score: ${ec.score} | ML: ${(ec.mlProbability * 100).toFixed(1)}% cheat`);
  console.log(`   Moves/Food: ${ec.features.moves_per_food?.toFixed(2) || 'N/A'} | Avg Move Time: ${ec.features.avg_time_between_moves?.toFixed(0) || 'N/A'}ms`);
  console.log(`   Speed Progression: ${ec.features.speed_progression} | Pause Gaps: ${ec.features.pause_gap_count}`);
  console.log('');
});

console.log('\nTo use edge cases in training, they are now automatically included');
console.log('when you run: npm run ml:train\n');
