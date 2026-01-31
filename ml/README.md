# Neural Network Anti-Cheat System

Technical documentation for the XNAKE neural network-based cheat detection system.

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Feature Extraction](#feature-extraction)
4. [Neural Network Model](#neural-network-model)
5. [Training Pipeline](#training-pipeline)
6. [Synthetic Data Generation](#synthetic-data-generation)
7. [Model Versioning](#model-versioning)
8. [SHAP Explainability](#shap-explainability)
9. [Edge Case Detection](#edge-case-detection)
10. [Background Worker](#background-worker)
11. [API Reference](#api-reference)
12. [File Structure](#file-structure)

---

## Overview

The neural network anti-cheat runs in **shadow mode** alongside the rule-based detection system:

```
Game Submission
      |
      v
+------------------+     +----------------------+
| Rule-Based       | --> | Block if cheat       |
| Detection        |     | detected             |
+------------------+     +----------------------+
      |
      v
+------------------+     +----------------------+
| Neural Network   | --> | Log suspicion score  |
| Detection        |     | (shadow mode)        |
+------------------+     +----------------------+
      |
      v
+------------------+
| Edge Case        | --> Log disagreements for review
| Detection        |
+------------------+
```

The neural network learns from real gameplay data over time. As more games are played and cheats are detected by the rule-based system, the neural network becomes more accurate.

### Automatic Initialization

On first server startup, if no trained model exists, the system automatically trains an initial model using synthetic data. This ensures the neural network is ready immediately without manual intervention.

---

## Architecture

### System Components

| File | Purpose |
|------|---------|
| `features.js` | Extracts 12 behavioral features from raw game data |
| `model.js` | TensorFlow.js neural network definition and inference |
| `train.js` | Training pipeline with synthetic data augmentation |
| `versioning.js` | Model versioning, comparison, and rollback |
| `shap.js` | Kernel SHAP explainability for predictions |
| `edgecases.js` | Detects and logs neural network/rules disagreements |
| `worker.js` | Background training with debouncing |

### Data Flow

```
Raw Game Data (moves, heartbeats, score, foodEaten, duration)
                    |
                    v
            Feature Extraction
            (12 behavioral features)
                    |
                    v
            Z-Score Normalization
                    |
                    v
            Neural Network Prediction
                    |
                    v
            Probability (0.0 - 1.0)
            0.0 = Legitimate
            1.0 = Cheater
```

---

## Feature Extraction

### The 12 Behavioral Features

| # | Feature | Description | Cheat Indicator |
|---|---------|-------------|-----------------|
| 1 | `avg_time_between_moves` | Mean milliseconds between player inputs | Low = speed hack |
| 2 | `move_time_variance` | Variance in input timing | Low = bot (too consistent) |
| 3 | `moves_per_food` | Total moves / food eaten | Low = bot (optimal pathing) |
| 4 | `direction_entropy` | Shannon entropy of direction changes | Low = bot (predictable) |
| 5 | `heartbeat_consistency` | Regularity of client heartbeats (0-1) | High = normal |
| 6 | `score_rate` | Points earned per second | High = speed hack |
| 7 | `frame_timing_deviation` | Std dev of ms per frame | High = timing manipulation |
| 8 | `pause_gap_count` | Number of gaps > 2 seconds | High = pause abuse |
| 9 | `speed_progression` | Cumulative speed increase during game | Abnormal = manipulation |
| 10 | `movement_burst_rate` | Fraction of moves with < 100ms gap | High = speed hack |
| 11 | `performance_time_drift` | Avg diff between Date.now() and performance.now() | High = timing manipulation |
| 12 | `avg_speed_per_food` | Average game speed / food eaten | Abnormal = manipulation |

### Normalization

Features are normalized using z-score normalization:

```
normalized[i] = (value[i] - mean[i]) / std[i]
```

The means and standard deviations are computed from the training data and stored in `models/cheat_detector/normalization_stats.json`.

---

## Neural Network Model

### Architecture

```
Input Layer (12 features)
         |
         v
+-------------------+
| Dense Layer 1     |
| 32 neurons, ReLU  |
+-------------------+
         |
         v
+-------------------+
| Dropout (30%)     |
+-------------------+
         |
         v
+-------------------+
| Dense Layer 2     |
| 16 neurons, ReLU  |
+-------------------+
         |
         v
+-------------------+
| Dropout (30%)     |
+-------------------+
         |
         v
+-------------------+
| Output Layer      |
| 1 neuron, Sigmoid |
+-------------------+
         |
         v
   Probability (0-1)
```

### Model Configuration

| Parameter | Value |
|-----------|-------|
| Optimizer | Adam |
| Learning Rate | 0.001 |
| Loss Function | Binary Cross-Entropy |
| Metrics | Accuracy |
| Total Parameters | ~700 |

### Hybrid Model (Future)

A more advanced hybrid model is defined that combines:
- Feature branch (dense layers for the 12 features)
- Time series branch (1D CNN for raw move sequences)

Currently, the simpler feedforward network is used.

---

## Training Pipeline

### How Training Works

```
1. Load training data from database
   (games labeled as legitimate or cheat)
         |
         v
2. Augment with synthetic data if needed
   (to ensure minimum sample count)
         |
         v
3. Extract features from all samples
         |
         v
4. Compute normalization statistics
   (means and standard deviations)
         |
         v
5. Shuffle and split 80/20
   (training / validation)
         |
         v
6. Train neural network
   (50 epochs, batch size 32)
         |
         v
7. Evaluate on validation set
   (accuracy, precision, recall, F1)
         |
         v
8. Save model if metrics are acceptable
```

### Training Options

| Option | Default | Description |
|--------|---------|-------------|
| `epochs` | 50 | Training iterations |
| `batchSize` | 32 | Samples per gradient update |
| `minSamples` | 100 | Minimum samples (augment if fewer) |
| `augmentWithSynthetic` | true | Add synthetic data if needed |

### CLI Training

```bash
# Quick training (50 epochs)
npm run ml:train

# Full training (100 epochs, 200+ samples)
npm run ml:train:full

# Custom options
node ml/train.js --epochs=100 --min-samples=200 --no-synthetic
```

---

## Synthetic Data Generation

When real training data is insufficient, the system generates synthetic samples to bootstrap the model.

### Synthetic Cheat Types

| Type | Characteristics |
|------|-----------------|
| **Speed Hack** | Very fast moves (50-150ms), short game duration |
| **Bot** | Perfect timing (10-30ms), optimal moves per food |
| **Pause Abuse** | Long gaps (5-20s), irregular heartbeats |
| **Timing Manipulation** | High drift between Date.now() and performance.now() |

### Synthetic Legitimate Types

| Type | Characteristics |
|------|-----------------|
| **Beginner** | Slow moves (300-700ms), high moves per food, low score |
| **Intermediate** | Moderate moves (200-400ms), average efficiency |
| **Expert** | Fast but human moves (150-300ms), high efficiency |

As real gameplay data accumulates, the model relies less on synthetic data and more on actual player behavior patterns.

---

## Model Versioning

### How Versioning Works

Every trained model is saved as a version with full metrics:

```
ml/models/
  ├── versions.json           # Version registry
  ├── cheat_detector/         # Active model
  │   ├── model.json
  │   ├── weights.bin
  │   └── normalization_stats.json
  ├── v20260131120311/        # Version 1
  │   └── ...
  └── v20260131140522/        # Version 2
      └── ...
```

### Version Comparison Rules

New models are only activated if they perform as well or better than the current model:

- F1 score must be >= old F1 - 0.02 (2% tolerance)
- Accuracy must be >= old accuracy - 0.02

If a new model underperforms, it is saved but not activated, allowing rollback if needed.

### Training Log

All training events are logged to `models/training.log` with timestamps, version IDs, metrics, and activation decisions.

---

## SHAP Explainability

### What is SHAP?

SHAP (SHapley Additive exPlanations) explains individual predictions by showing how much each feature contributed to the result.

### How It Works

The system uses Kernel SHAP, which:

1. Computes a base prediction using average feature values
2. Samples random feature coalitions
3. Measures each feature's marginal contribution
4. Produces per-feature contribution scores

### Output Example

```
Prediction: 87.00% cheat probability
Base value: 35.00%

Feature contributions:
  moves_per_food: +23.00%
  avg_time_between_moves: +12.00%
  movement_burst_rate: +8.50%
  direction_entropy: +5.20%
  ...
```

### Global Feature Importance

After each training run, SHAP values are computed across the validation set to determine which features are most important globally. This helps identify which cheat patterns the model has learned to detect.

---

## Edge Case Detection

### What are Edge Cases?

Edge cases occur when the neural network and rule-based system disagree:

| Edge Type | Rules | Neural Network | Action |
|-----------|-------|----------------|--------|
| `rules_positive_ml_negative` | CHEAT | < 30% probability | Log for review |
| `rules_negative_ml_positive` | OK | > 70% probability | Flag for review |
| `ml_uncertain_rules_positive` | CHEAT | 30-70% probability | Log for review |
| `ml_uncertain_rules_negative` | OK | 30-70% probability | Flag for review |

### Thresholds

| Threshold | Value | Meaning |
|-----------|-------|---------|
| `ML_THRESHOLD_HIGH` | 0.7 | Above = likely cheat |
| `ML_THRESHOLD_LOW` | 0.3 | Below = likely legitimate |
| Between | 0.3-0.7 | Uncertain |

### Edge Case Logging

Edge cases are logged to `models/edge_cases.log` with:
- Timestamp
- Player ID
- Score
- Rule result (cheat/legitimate)
- Neural network probability
- Edge type
- All 12 features

This data helps identify false positives, false negatives, and new cheat patterns.

---

## Background Worker

### Automatic Retraining

The worker automatically retrains the model when cheats are detected:

```
Cheat Detected
      |
      v
+------------------+
| Debounce Check   | --> Wait if < 5 minutes since last training
| (5 min cooldown) |
+------------------+
      |
      v
+------------------+
| Run Training     |
+------------------+
      |
      v
+------------------+
| Compare Metrics  | --> Only activate if better than current
+------------------+
      |
      v
+------------------+
| Compute SHAP     | --> Log feature importance
+------------------+
```

### Constants

| Constant | Value | Description |
|----------|-------|-------------|
| `DEBOUNCE_MS` | 300000 (5 min) | Minimum time between training runs |
| `MIN_SAMPLES_FOR_TRAINING` | 20 | Minimum samples required to train |

---

## API Reference

### GET /api/ml/status

Returns current training status and active model info.

| Field | Description |
|-------|-------------|
| `trainingStatus.inProgress` | Whether training is currently running |
| `trainingStatus.lastTrainingTime` | Timestamp of last training |
| `trainingStatus.canTrain` | Whether training can be triggered now |
| `activeModel.version` | Current model version ID |
| `activeModel.metrics` | Accuracy, precision, recall, F1 score |
| `edgeCases.total` | Total edge cases logged |
| `edgeCases.byType` | Breakdown by edge case type |

### GET /api/ml/versions

Returns all model versions with their metrics.

| Field | Description |
|-------|-------------|
| `versions[].version` | Version ID (timestamp-based) |
| `versions[].createdAt` | When the model was trained |
| `versions[].metrics` | Training metrics |
| `versions[].isActive` | Whether this version is active |

### GET /api/ml/training-logs

Returns training event history.

| Query Param | Default | Description |
|-------------|---------|-------------|
| `limit` | 50 | Number of logs to return |

### GET /api/ml/edge-cases

Returns edge cases where neural network and rules disagreed.

| Query Param | Default | Description |
|-------------|---------|-------------|
| `limit` | 50 | Number of cases to return |

### POST /api/ml/train

Manually triggers model retraining. Returns the new version ID and metrics if successful.

---

## File Structure

```
ml/
├── README.md              # This documentation
├── features.js            # Feature extraction (12 behavioral features)
├── model.js               # TensorFlow.js neural network
├── train.js               # Training pipeline
├── versioning.js          # Model versioning and rollback
├── shap.js                # SHAP explainability
├── edgecases.js           # Edge case detection
├── worker.js              # Background training worker
└── models/                # Trained models (git-excluded)
    ├── versions.json      # Version registry
    ├── training.log       # Training event log
    ├── edge_cases.log     # Edge case log
    ├── cheat_detector/    # Active model
    │   ├── model.json
    │   ├── weights.bin
    │   └── normalization_stats.json
    └── v{timestamp}/      # Versioned models
        └── ...
```

---

## Continuous Improvement

The neural network improves over time through this feedback loop:

```
1. Players play games
         |
         v
2. Rule-based system detects obvious cheats
         |
         v
3. Games are labeled and stored in database
         |
         v
4. Worker retrains neural network on new data
         |
         v
5. New model compared to old model
         |
         v
6. If better, activate new model
         |
         v
7. Neural network catches more subtle cheats
         |
         v
8. Edge cases flagged for human review
         |
         v
9. Human labels improve training data
         |
         v
   (Loop back to step 4)
```

The more games played, the more accurate the detection becomes.
