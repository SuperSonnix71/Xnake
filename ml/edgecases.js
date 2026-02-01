const fs = require('fs');
const path = require('path');

const EDGE_CASES_LOG = path.join(__dirname, 'models', 'edge_cases.log');
const ML_THRESHOLD_HIGH = 0.7;
const ML_THRESHOLD_LOW = 0.3;

/**
 * @typedef {Object} EdgeCase
 * @property {string} timestamp
 * @property {string} playerId
 * @property {number} score
 * @property {string} ruleResult
 * @property {number} mlProbability
 * @property {string} edgeType
 * @property {Object} features
 * @property {string} [cheatType]
 */

/**
 * @param {boolean} rulesDetectedCheat
 * @param {string|null} cheatType
 * @param {number} mlProbability
 * @returns {{ isEdgeCase: boolean, edgeType: string|null, shouldFlag: boolean }}
 */
function detectEdgeCase(rulesDetectedCheat, cheatType, mlProbability) {
  if (rulesDetectedCheat && mlProbability < ML_THRESHOLD_LOW) {
    return {
      isEdgeCase: true,
      edgeType: 'rules_positive_ml_negative',
      shouldFlag: false
    };
  }
  
  if (!rulesDetectedCheat && mlProbability > ML_THRESHOLD_HIGH) {
    return {
      isEdgeCase: true,
      edgeType: 'rules_negative_ml_positive',
      shouldFlag: true
    };
  }
  
  if (rulesDetectedCheat && mlProbability >= ML_THRESHOLD_LOW && mlProbability <= ML_THRESHOLD_HIGH) {
    return {
      isEdgeCase: true,
      edgeType: 'ml_uncertain_rules_positive',
      shouldFlag: false
    };
  }
  
  if (!rulesDetectedCheat && mlProbability >= ML_THRESHOLD_LOW && mlProbability <= ML_THRESHOLD_HIGH) {
    return {
      isEdgeCase: true,
      edgeType: 'ml_uncertain_rules_negative',
      shouldFlag: true
    };
  }
  
  return {
    isEdgeCase: false,
    edgeType: null,
    shouldFlag: false
  };
}

/**
 * @param {EdgeCase} edgeCase
 */
function logEdgeCase(edgeCase) {
  const dir = path.dirname(EDGE_CASES_LOG);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  
  const logLine = `${JSON.stringify(edgeCase)}\n`;
  fs.appendFileSync(EDGE_CASES_LOG, logLine);
}

/**
 * @param {string} playerId
 * @param {number} score
 * @param {boolean} rulesDetectedCheat
 * @param {string|null} cheatType
 * @param {number} mlProbability
 * @param {Object} features
 * @returns {{ isEdgeCase: boolean, edgeType: string|null, shouldFlag: boolean }}
 */
function processAndLogEdgeCase(playerId, score, rulesDetectedCheat, cheatType, mlProbability, features) {
  const result = detectEdgeCase(rulesDetectedCheat, cheatType, mlProbability);
  
  if (result.isEdgeCase) {
    /** @type {EdgeCase} */
    const edgeCase = {
      timestamp: new Date().toISOString(),
      playerId,
      score,
      ruleResult: rulesDetectedCheat ? 'cheat' : 'legitimate',
      mlProbability,
      edgeType: result.edgeType || 'unknown',
      features,
      cheatType: cheatType || undefined
    };
    
    logEdgeCase(edgeCase);
    
    console.log(`[Edge Case] ${result.edgeType}: Player=${playerId}, Score=${score}, Rules=${rulesDetectedCheat ? 'CHEAT' : 'OK'}, ML=${(mlProbability * 100).toFixed(1)}%`);
  }
  
  return result;
}

/**
 * @param {number} limit
 * @returns {EdgeCase[]}
 */
function getEdgeCases(limit = 100) {
  if (!fs.existsSync(EDGE_CASES_LOG)) {
    return [];
  }
  
  const content = fs.readFileSync(EDGE_CASES_LOG, 'utf8');
  const lines = content.trim().split('\n').filter(l => l.length > 0);
  
  const cases = lines.map(l => {
    try {
      return JSON.parse(l);
    } catch (_e) {
      return null;
    }
  }).filter(c => c !== null);
  
  return cases.slice(-limit);
}

/**
 * @returns {{ total: number, byType: Object<string, number> }}
 */
function getEdgeCaseStats() {
  const cases = getEdgeCases(10000);
  
  /** @type {Object<string, number>} */
  const byType = {};
  
  for (const c of cases) {
    byType[c.edgeType] = (byType[c.edgeType] || 0) + 1;
  }
  
  return {
    total: cases.length,
    byType
  };
}

/**
 * Classification strategies:
 * - trust_rules: Use rule-based detection as ground truth
 * - trust_ml: Trust ML when confident (>70% or <30%), treat middle as uncertain
 * - conservative: Only use cases where both rules and ML agree
 * - hybrid: Trust rules OR high-confidence ML (>85%), best for catching missed cheats
 * 
 * @param {'trust_rules'|'trust_ml'|'conservative'|'hybrid'} strategy
 * @returns {{ legitimate: EdgeCase[], cheats: EdgeCase[], uncertain: EdgeCase[] }}
 */
function classifyEdgeCases(strategy = 'conservative') {
  const cases = getEdgeCases(10000);
  
  /** @type {EdgeCase[]} */
  const legitimate = [];
  /** @type {EdgeCase[]} */
  const cheats = [];
  /** @type {EdgeCase[]} */
  const uncertain = [];
  
  for (const c of cases) {
    const isRulesCheat = c.ruleResult === 'cheat';
    const isMlCheat = c.mlProbability > ML_THRESHOLD_HIGH;
    const isMlUncertain = c.mlProbability >= ML_THRESHOLD_LOW && c.mlProbability <= ML_THRESHOLD_HIGH;
    
    if (strategy === 'trust_rules') {
      if (isRulesCheat) {
        cheats.push(c);
      } else {
        legitimate.push(c);
      }
    } else if (strategy === 'trust_ml') {
      if (isMlCheat) {
        cheats.push(c);
      } else if (isMlUncertain) {
        uncertain.push(c);
      } else {
        legitimate.push(c);
      }
    } else if (strategy === 'hybrid') {
      if (isRulesCheat || (c.mlProbability > 0.85)) {
        cheats.push(c);
      } else if (c.mlProbability < 0.15 || (!isRulesCheat && c.mlProbability < ML_THRESHOLD_LOW)) {
        legitimate.push(c);
      } else {
        uncertain.push(c);
      }
    } else {
      if (isRulesCheat && isMlCheat) {
        cheats.push(c);
      } else if (!isRulesCheat && !isMlCheat && !isMlUncertain) {
        legitimate.push(c);
      } else {
        uncertain.push(c);
      }
    }
  }
  
  return { legitimate, cheats, uncertain };
}

/**
 * @param {'trust_rules'|'trust_ml'|'conservative'|'hybrid'} strategy
 * @returns {{ samples: Array<{features: Object, isCheat: boolean, source: string}>, stats: Object }}
 */
function convertEdgeCasesToTrainingData(strategy = 'hybrid') {
  const classified = classifyEdgeCases(strategy);
  
  const samples = [];
  
  for (const c of classified.legitimate) {
    samples.push({
      features: c.features,
      isCheat: false,
      source: `edge_case_${c.edgeType}`
    });
  }
  
  for (const c of classified.cheats) {
    samples.push({
      features: c.features,
      isCheat: true,
      source: `edge_case_${c.edgeType}`
    });
  }
  
  return {
    samples,
    stats: {
      totalEdgeCases: classified.legitimate.length + classified.cheats.length + classified.uncertain.length,
      legitimate: classified.legitimate.length,
      cheats: classified.cheats.length,
      uncertain: classified.uncertain.length,
      usableForTraining: samples.length,
      strategy
    }
  };
}

module.exports = {
  detectEdgeCase,
  processAndLogEdgeCase,
  getEdgeCases,
  getEdgeCaseStats,
  classifyEdgeCases,
  convertEdgeCasesToTrainingData,
  ML_THRESHOLD_HIGH,
  ML_THRESHOLD_LOW
};
