<p align="center">
  <img src="assets/logo.svg" alt="XNAKE Logo" width="180">
</p>

<h1 align="center">XNAKE</h1>

<p align="center">
  <strong>Modern Snake Game with Anti-Cheat System</strong>
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0-00ff00?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-blue?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/node-18%2B-339933?style=flat-square&logo=node.js&logoColor=white" alt="Node.js">
  <img src="https://img.shields.io/badge/platform-linux%20%7C%20macos%20%7C%20windows-lightgrey?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/docker-ready-2496ED?style=flat-square&logo=docker&logoColor=white" alt="Docker">
</p>

<p align="center">
  <a href="https://github.com/SuperSonnix71/Xnake/issues">Report Bug</a>
  &middot;
  <a href="https://github.com/SuperSonnix71/Xnake">View Repository</a>
</p>

---

A modern Snake game built with Node.js, Express, and HTML5 Canvas. Features player registration, persistent scores, Hall of Fame leaderboard, and a comprehensive anti-cheat system to ensure fair play.

## Overview

XNAKE is a browser-based Snake game with:
- Smooth animations with glowing effects
- Keyboard controls (Arrow Keys or WASD)
- Pause functionality (Space bar)
- Progressive speed increase as you score
- Persistent player accounts and scores
- Global leaderboard (Hall of Fame)
- Hall of Shame for caught cheaters

## Anti-Cheat System

XNAKE includes a comprehensive server-side anti-cheat system that validates all game submissions using both rule-based detection and a neural network.

### Rule-Based Detection

| Method | Description |
|--------|-------------|
| Browser Fingerprinting | Unique device identification using screen, canvas, WebGL, and audio fingerprints |
| Session Seed Validation | Server-generated seeds ensure games are started legitimately |
| Full Game Replay | Server replays all moves to verify the claimed score matches |
| Score/Food Matching | Validates that score equals food eaten times 10 |
| Speed Hack Detection | Detects games completed impossibly fast |
| Pause Abuse Detection | Flags suspicious gaps between moves (>10 seconds) |
| Heartbeat Timing | Cross-validates game timing with performance timestamps |
| Bot Detection | Identifies AI/bot patterns based on moves-per-food ratio |
| Rate Limiting | Prevents spam submissions (10 requests/minute) |
| Input Size Validation | Rejects oversized move/heartbeat data |

### Neural Network Detection

A TensorFlow.js neural network provides a second layer of cheat detection by analyzing behavioral patterns that rule-based systems might miss. The network automatically improves over time by retraining on real gameplay data.

#### How It Works

1. **Feature Extraction** - 12 behavioral features are computed from raw game data:
   - `avg_time_between_moves` - Mean time between player inputs
   - `move_time_variance` - Consistency of input timing
   - `moves_per_food` - Efficiency ratio (bots often have unnaturally optimal ratios)
   - `direction_entropy` - Randomness of direction changes
   - `heartbeat_consistency` - Regularity of client heartbeats
   - `score_rate` - Points earned per second
   - `frame_timing_deviation` - Drift between reported frames and elapsed time
   - `pause_gap_count` - Number of suspicious pauses
   - `speed_progression` - How game speed increased over time
   - `movement_burst_rate` - Frequency of rapid input bursts
   - `performance_time_drift` - Difference between performance.now() and Date.now()
   - `avg_speed_per_food` - Average game speed when collecting food

2. **Neural Network Architecture** - A 3-layer fully connected network:
   - **Input Layer**: 12 behavioral features (normalized using stored mean/std statistics)
   - **Hidden Layer 1**: 32 neurons with ReLU activation + dropout
   - **Hidden Layer 2**: 16 neurons with ReLU activation + dropout
   - **Output Layer**: 1 neuron with sigmoid activation (0 = legitimate, 1 = cheater)

3. **Shadow Mode** - The neural network currently runs in shadow mode:
   - Analyzes all game submissions
   - Logs suspicion scores but doesn't block players
   - Flags edge cases where the neural network disagrees with rules for review

4. **Continuous Learning** - The neural network improves over time:
   - Every legitimate game and caught cheat is stored as training data
   - The model automatically retrains when new cheats are detected (5-min debounce)
   - New models are only activated if they perform better than the current one
   - The more games played, the more accurate the detection becomes
   - SHAP feature importance is computed after each training run

#### Model Versioning

All trained models are versioned with full metrics:
- Accuracy, precision, recall, and F1 score
- Training sample counts
- Automatic rollback if a new model underperforms

#### Explainability (SHAP)

The system uses Kernel SHAP to explain individual predictions:
- Shows which features contributed most to a suspicion score
- Helps identify new cheat patterns
- Enables debugging of false positives

### Cheat Logging

All detected cheating attempts are:
- Logged to `cheat_detection.log` with full details
- Recorded in the database with player, IP, cheat type, and reason
- Displayed in the Hall of Shame (`/api/hallofshame`)

Edge cases (neural network/rules disagreements) are logged to `ml/models/edge_cases.log` for review.

## API Reference

### Authentication

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/register` | POST | Register a new player with username and fingerprint |
| `/api/verify` | POST | Verify session with fingerprint, auto-login returning players |
| `/api/session` | GET | Check current session status |
| `/api/logout` | POST | Logout current player |

### Game

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/game/start` | POST | Start a new game session, returns server seed |
| `/api/score` | POST | Submit game score with moves, heartbeats, and validation data |

### Leaderboards and Stats

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/halloffame` | GET | Get top scores (query: `?limit=10`) |
| `/api/hallofshame` | GET | Get caught cheaters (query: `?limit=50`) |
| `/api/player/stats` | GET | Get current player statistics |
| `/api/stats` | GET | Get global game statistics |

### Neural Network Anti-Cheat (Admin)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/ml/status` | GET | Training status, active model info, edge case statistics |
| `/api/ml/versions` | GET | All model versions with accuracy/precision/recall/F1 metrics |
| `/api/ml/training-logs` | GET | Training event history (query: `?limit=50`) |
| `/api/ml/edge-cases` | GET | Cases where neural network and rules disagreed (query: `?limit=50`) |
| `/api/ml/train` | POST | Trigger manual model retraining |

## Installation

### Prerequisites

- Node.js 18+ (for local installation)
- Docker (for containerized deployment)

### Local Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/SuperSonnix71/Xnake.git
   cd Xnake
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Start the server:
   ```bash
   npm start
   ```

4. Open your browser and navigate to:
   ```
   http://localhost:3333
   ```

### Development Mode

Run with auto-restart on file changes:
```bash
npm run dev
```

### Neural Network Training

Initialize the neural network versioning system (first time only):
```bash
npm run ml:init
```

Train/retrain the cheat detection model:
```bash
npm run ml:train              # Quick training (50 epochs)
npm run ml:train:full         # Full training (100 epochs, 200+ samples)
```

Or trigger training via the API:
```bash
curl -X POST http://localhost:3333/api/ml/train
```

### Docker Deployment

Use the included deploy script for a complete Docker deployment:

```bash
chmod +x deploy.sh
./deploy.sh
```

The deploy script will:
- Stop and remove any existing container
- Remove the old Docker image
- Build a fresh Docker image
- Start the container with persistent storage
- Display access URLs when complete

The game will be available at `http://localhost:3333`

### Manual Docker Commands

Build the image:
```bash
docker build -t xnake-game .
```

Run with persistent storage:
```bash
docker run -d -p 3333:3000 -v $(pwd):/app --name xnake xnake-game
```

Run without persistent storage:
```bash
docker run -d -p 3333:3000 --name xnake xnake-game
```

Container management:
```bash
docker stop xnake      # Stop the container
docker start xnake     # Start the container
docker restart xnake   # Restart the container
docker rm xnake        # Remove the container
docker logs xnake      # View logs
```

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | 3333 | Server port |
| `SESSION_SECRET` | (hardcoded) | Session encryption key (change in production) |

### Production Considerations

1. Set a secure `SESSION_SECRET` environment variable
2. Enable HTTPS and set `secure: true` in session cookie config
3. Use a reverse proxy (nginx) for SSL termination
4. Regular database backups of `xnake.db`

## Project Structure

```
snake/
├── public/
│   ├── index.html          # Game interface
│   ├── game.js             # Game logic and rendering
│   ├── fingerprint.js      # Browser fingerprinting
│   └── style.css           # Styles and animations
├── ml/
│   ├── features.js         # Feature extraction (12 behavioral features)
│   ├── model.js            # TensorFlow.js neural network
│   ├── train.js            # Training pipeline with metrics
│   ├── versioning.js       # Model versioning and rollback
│   ├── shap.js             # SHAP explainability (Kernel SHAP)
│   ├── worker.js           # Background training worker
│   ├── edgecases.js        # Edge case detection and logging
│   └── models/             # Trained models (git-excluded)
│       └── cheat_detector/ # Active model
├── scripts/
│   ├── init-ml-versioning.js  # Initialize neural network versioning system
│   ├── clean_false_positives.js
│   ├── monitor.sh
│   └── reset-db.sh
├── server.js               # Express server with API and anti-cheat
├── database.js             # SQLite database operations
├── package.json            # Node.js dependencies
├── Dockerfile              # Docker configuration
├── deploy.sh               # Docker build and deploy script
├── eslint.config.js        # ESLint configuration
├── tsconfig.json           # TypeScript configuration (for type checking)
├── xnake.db                # SQLite database file (auto-created)
├── game_activity.log       # Valid game submissions log
└── cheat_detection.log     # Cheat detection log
```

## How to Play

### Controls

| Key | Action |
|-----|--------|
| Arrow Up / W | Move Up |
| Arrow Down / S | Move Down |
| Arrow Left / A | Move Left |
| Arrow Right / D | Move Right |
| Space | Pause/Unpause |

### Gameplay

- Eat the glowing food to grow and score points (+10 per food)
- Avoid hitting the walls or yourself
- Game speed increases as your score goes up
- Try to reach the top of the Hall of Fame

### Speed System

- Initial Speed: 150ms per move
- Speed Increase: 3ms faster for each food eaten
- Minimum Speed: 50ms per move (maximum difficulty)

## Technology Stack

### Backend
- Node.js with Express
- express-session for session management
- sql.js (pure JavaScript SQLite)
- uuid for unique ID generation
- TensorFlow.js for neural network-based cheat detection

### Frontend
- HTML5 Canvas for game rendering
- Vanilla JavaScript for game logic
- CSS3 for styling and animations

### Code Quality
- ESLint with security and Node.js plugins
- TypeScript for type checking (via JSDoc annotations)

## Author

Developed by Sonny Mir

## Bug Reports

Found a bug or have a feature request? Please open an issue at:
https://github.com/SuperSonnix71/Xnake/issues

## License

MIT License
