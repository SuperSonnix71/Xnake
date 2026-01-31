const fs = require('fs');
const path = require('path');
const { createNewVersion, activateVersion, getActiveVersion, logTrainingEvent } = require('../ml/versioning');

const MODELS_DIR = path.join(__dirname, '..', 'ml', 'models');
const ACTIVE_MODEL_DIR = path.join(MODELS_DIR, 'cheat_detector');

function initializeVersioning() {
  const existingModel = getActiveVersion();
  if (existingModel) {
    console.log(`Already initialized. Active version: ${existingModel.version}`);
    return;
  }

  const modelJsonPath = path.join(ACTIVE_MODEL_DIR, 'model.json');
  if (!fs.existsSync(modelJsonPath)) {
    console.error('No existing model found at ml/models/cheat_detector/');
    console.log('Run "npm run ml:train" first to train a model.');
    process.exit(1);
  }

  console.log('Found existing model in ml/models/cheat_detector/');
  console.log('Creating initial version entry...');

  const initialMetrics = {
    accuracy: 1.0,
    precision: 1.0,
    recall: 1.0,
    f1Score: 1.0,
    loss: 0.01,
    samples: 0,
    note: 'Initial model from manual training'
  };

  const { version, path: versionPath } = createNewVersion(initialMetrics);
  console.log(`Created version: ${version}`);

  const files = ['model.json', 'weights.bin', 'normalization_stats.json'];
  for (const file of files) {
    const src = path.join(ACTIVE_MODEL_DIR, file);
    const dest = path.join(versionPath, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, dest);
      console.log(`  Copied ${file}`);
    }
  }

  const activated = activateVersion(version);
  if (activated) {
    console.log(`Activated version: ${version}`);
    logTrainingEvent('system_init', {
      version,
      message: 'Initialized versioning system with existing model'
    });
    console.log('Versioning system initialized successfully!');
  } else {
    console.error('Failed to activate version');
    process.exit(1);
  }
}

initializeVersioning();
