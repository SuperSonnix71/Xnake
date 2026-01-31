const fs = require('fs');
const path = require('path');

const MODELS_DIR = path.join(__dirname, 'models');
const VERSIONS_FILE = path.join(MODELS_DIR, 'versions.json');

/**
 * @typedef {Object} ModelMetrics
 * @property {number} accuracy
 * @property {number} loss
 * @property {number} precision
 * @property {number} recall
 * @property {number} f1Score
 * @property {number} trainingSamples
 * @property {number} validationSamples
 * @property {number} epochs
 */

/**
 * @typedef {Object} ModelVersion
 * @property {string} version
 * @property {string} createdAt
 * @property {ModelMetrics} metrics
 * @property {boolean} isActive
 * @property {string} path
 */

/**
 * @returns {{ versions: ModelVersion[], activeVersion: string|null }}
 */
function loadVersionsFile() {
  if (!fs.existsSync(VERSIONS_FILE)) {
    return { versions: [], activeVersion: null };
  }
  try {
    const data = fs.readFileSync(VERSIONS_FILE, 'utf8');
    return JSON.parse(data);
  } catch (_err) {
    return { versions: [], activeVersion: null };
  }
}

/**
 * @param {{ versions: ModelVersion[], activeVersion: string|null }} data
 */
function saveVersionsFile(data) {
  if (!fs.existsSync(MODELS_DIR)) {
    fs.mkdirSync(MODELS_DIR, { recursive: true });
  }
  fs.writeFileSync(VERSIONS_FILE, JSON.stringify(data, null, 2));
}

/**
 * @returns {string}
 */
function generateVersionId() {
  const now = new Date();
  const timestamp = now.toISOString().replace(/[-:T]/g, '').slice(0, 14);
  return `v${timestamp}`;
}

/**
 * @returns {ModelVersion|null}
 */
function getActiveVersion() {
  const data = loadVersionsFile();
  if (!data.activeVersion) {
    return null;
  }
  return data.versions.find(v => v.version === data.activeVersion) || null;
}

/**
 * @returns {ModelVersion[]}
 */
function getAllVersions() {
  const data = loadVersionsFile();
  return data.versions;
}

/**
 * @param {ModelMetrics} metrics
 * @returns {{ version: string, path: string }}
 */
function createNewVersion(metrics) {
  const versionId = generateVersionId();
  const versionPath = path.join(MODELS_DIR, versionId);
  
  if (!fs.existsSync(versionPath)) {
    fs.mkdirSync(versionPath, { recursive: true });
  }
  
  /** @type {ModelVersion} */
  const newVersion = {
    version: versionId,
    createdAt: new Date().toISOString(),
    metrics,
    isActive: false,
    path: versionPath
  };
  
  const data = loadVersionsFile();
  data.versions.push(newVersion);
  saveVersionsFile(data);
  
  return { version: versionId, path: versionPath };
}

/**
 * @param {string} versionId
 * @returns {boolean}
 */
function activateVersion(versionId) {
  const data = loadVersionsFile();
  const version = data.versions.find(v => v.version === versionId);
  
  if (!version) {
    return false;
  }
  
  data.versions.forEach(v => { v.isActive = v.version === versionId; });
  data.activeVersion = versionId;
  saveVersionsFile(data);
  
  const activeLink = path.join(MODELS_DIR, 'cheat_detector');
  if (fs.existsSync(activeLink)) {
    fs.rmSync(activeLink, { recursive: true });
  }
  
  copyDirectory(version.path, activeLink);
  
  return true;
}

/**
 * @param {string} src
 * @param {string} dest
 */
function copyDirectory(src, dest) {
  if (!fs.existsSync(dest)) {
    fs.mkdirSync(dest, { recursive: true });
  }
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

/**
 * @param {ModelMetrics} newMetrics
 * @param {ModelMetrics|null} oldMetrics
 * @returns {{ shouldActivate: boolean, reason: string }}
 */
function compareMetrics(newMetrics, oldMetrics) {
  if (!oldMetrics) {
    return { shouldActivate: true, reason: 'No previous model exists' };
  }
  
  const newF1 = newMetrics.f1Score;
  const oldF1 = oldMetrics.f1Score;
  
  if (newF1 >= oldF1 - 0.02) {
    if (newMetrics.accuracy >= oldMetrics.accuracy - 0.02) {
      return { shouldActivate: true, reason: `New model F1=${newF1.toFixed(4)} >= Old F1=${oldF1.toFixed(4)}` };
    }
  }
  
  return { 
    shouldActivate: false, 
    reason: `New model underperforms: F1=${newF1.toFixed(4)} vs Old F1=${oldF1.toFixed(4)}, Acc=${newMetrics.accuracy.toFixed(4)} vs ${oldMetrics.accuracy.toFixed(4)}` 
  };
}

/**
 * @returns {string|null}
 */
function rollbackToPreviousVersion() {
  const data = loadVersionsFile();
  const currentIdx = data.versions.findIndex(v => v.version === data.activeVersion);
  
  if (currentIdx <= 0) {
    return null;
  }
  
  const previousVersion = data.versions[currentIdx - 1];
  activateVersion(previousVersion.version);
  return previousVersion.version;
}

/**
 * @param {string} versionId
 * @param {string} message
 * @param {Object} [details]
 */
function logTrainingEvent(versionId, message, details = {}) {
  const logPath = path.join(MODELS_DIR, 'training.log');
  const logEntry = {
    timestamp: new Date().toISOString(),
    version: versionId,
    message,
    ...details
  };
  
  const logLine = `${JSON.stringify(logEntry)}\n`;
  fs.appendFileSync(logPath, logLine);
}

/**
 * @param {number} limit
 * @returns {Object[]}
 */
function getTrainingLogs(limit = 100) {
  const logPath = path.join(MODELS_DIR, 'training.log');
  if (!fs.existsSync(logPath)) {
    return [];
  }
  
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.trim().split('\n').filter(l => l.length > 0);
  const logs = lines.map(l => {
    try {
      return JSON.parse(l);
    } catch (_e) {
      return null;
    }
  }).filter(l => l !== null);
  
  return logs.slice(-limit);
}

module.exports = {
  getActiveVersion,
  getAllVersions,
  createNewVersion,
  activateVersion,
  compareMetrics,
  rollbackToPreviousVersion,
  logTrainingEvent,
  getTrainingLogs,
  MODELS_DIR
};
