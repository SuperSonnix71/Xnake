# 🛠️ Xnake Operations Guide

## Table of Contents
- [Server Information](#server-information)
- [Monitoring](#monitoring)
- [Deployment](#deployment)
- [Database Management](#database-management)
- [Anti-Cheat System](#anti-cheat-system)
- [Troubleshooting](#troubleshooting)

---

## Server Information

**Production Server:**
- **Hostname:** `ai` (SSH: `ssh ai`)
- **Project Directory:** `/home/sonny/xnake/`
- **Database:** `/home/sonny/xnake/xnake.db` (owned by root)
- **Container Name:** `Xnake`
- **External Port:** 3333
- **Internal Port:** 3000
- **URL:** http://192.168.40.80:3333

**Docker Container:**
```bash
docker ps | grep Xnake                 # Check if running
docker logs Xnake                      # View logs
docker restart Xnake                   # Restart
docker stop Xnake                      # Stop
docker start Xnake                     # Start
docker exec -it Xnake sh               # Shell access
```

---

## Monitoring

### Quick Health Check
```bash
./monitor.sh check
```

### View Recent Logs
```bash
./monitor.sh logs
```

### Check for Validation Errors
```bash
./monitor.sh errors
```

### View Hall of Shame (Caught Cheaters)
```bash
./monitor.sh shame
```

### View Hall of Fame (Top Scores)
```bash
./monitor.sh fame
```

### View Database Statistics
```bash
./monitor.sh stats
```

### Manual Monitoring Commands

**Check server status:**
```bash
ssh ai "docker ps | grep Xnake"
```

**View live logs:**
```bash
ssh ai "docker logs -f Xnake"
```

**Check for cheat detections:**
```bash
ssh ai "docker logs Xnake | grep 'CHEAT DETECTION' -A 30"
```

**Check API health:**
```bash
ssh ai "curl -s http://localhost:3333/api/halloffame?limit=5"
```

---

## Deployment

### Standard Deployment Process

**From local machine:**
```bash
# 1. Ensure changes are committed
cd /Users/sonny/github/snake
git status
git add .
git commit -m "Your commit message"
git push

# 2. Deploy to server
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'xnake.db' \
  /Users/sonny/github/snake/ ai:/home/sonny/xnake/

# 3. Restart container
ssh ai "cd /home/sonny/xnake && ./deploy.sh"

# 4. Verify deployment
./monitor.sh check
```

### Deployment Script (`deploy.sh` on server)

The script automatically:
1. Stops the existing container
2. Removes old container and image
3. Rebuilds Docker image from latest code
4. Starts new container with persistent database
5. Reports success/failure

**Manual execution:**
```bash
ssh ai "cd /home/sonny/xnake && ./deploy.sh"
```

### Verify Deployment

```bash
# Check server is responding
./monitor.sh check

# View recent logs
./monitor.sh logs

# Check current stats
./monitor.sh stats
```

---

## Database Management

### Database Schema

**Players Table:**
```sql
CREATE TABLE players (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    fingerprint TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
)
```

**Scores Table:**
```sql
CREATE TABLE scores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL,
    score INTEGER NOT NULL,
    speed_level INTEGER NOT NULL,
    played_at INTEGER NOT NULL,
    FOREIGN KEY (player_id) REFERENCES players(id)
)
```

**Cheaters Table:**
```sql
CREATE TABLE cheaters (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    player_id TEXT NOT NULL,
    username TEXT NOT NULL,
    ip_address TEXT,
    fingerprint TEXT NOT NULL,
    cheat_type TEXT NOT NULL,
    attempted_score INTEGER,
    reason TEXT NOT NULL,
    caught_at INTEGER NOT NULL
)
```

### Database Access

**Query database from server:**
```bash
ssh ai "docker exec Xnake node -e \"
const initSqlJs = require('sql.js');
const fs = require('fs');
(async () => {
  const SQL = await initSqlJs();
  const buffer = fs.readFileSync('/app/xnake.db');
  const db = new SQL.Database(buffer);
  
  // Your SQL query here
  const result = db.exec('SELECT * FROM players LIMIT 5');
  console.log(JSON.stringify(result, null, 2));
  
  db.close();
})();
\""
```

### Backup Database

```bash
# Download backup to local machine
scp ai:/home/sonny/xnake/xnake.db ./backups/xnake-$(date +%Y%m%d-%H%M%S).db
```

### Restore Database

```bash
# Upload backup to server (CAUTION!)
scp ./backups/xnake-20260130-120000.db ai:/home/sonny/xnake/xnake.db.restore

# Stop container and restore
ssh ai "cd /home/sonny/xnake && docker stop Xnake && \
  sudo mv xnake.db xnake.db.old && \
  sudo mv xnake.db.restore xnake.db && \
  docker start Xnake"
```

### Clean False Positives

If the anti-cheat system flags legitimate players, use the cleanup script:

```bash
# Edit clean_false_positives.js to target specific players
# Then run:
ssh ai "cd /home/sonny/xnake && \
  docker stop Xnake && \
  sudo node clean_false_positives.js && \
  docker start Xnake"
```

---

## Anti-Cheat System

### Overview

The anti-cheat system uses **move-by-move validation** to prevent cheating:

1. Client requests seed from `/api/game/start`
2. Server generates random seed, stores in session
3. Client plays with deterministic food spawning (seeded RNG)
4. Client records ALL moves with frame numbers and timestamps
5. Server replays ENTIRE game frame-by-frame
6. Validates: score, food count, timing, move legality

### Active Defense Layers (10 total)

1. ✅ **IIFE Closure** - Prevents console access to game variables
2. ✅ **Fingerprinting** - Device ID tracking
3. ✅ **Session Management** - Seed tracking per game
4. ✅ **Seeded RNG** - Deterministic food spawning
5. ✅ **Frame-Based Move Recording** - Audit trail with frame numbers
6. ✅ **Frame-by-Frame Replay** - Server simulates entire game
7. ✅ **Accurate Duration Validation** - Tracks speed changes correctly (±20% tolerance)
8. ✅ **Score/Food Validation** - Exact matching with ±20pt tolerance for ≤2 food
9. ✅ **Rate Limiting** - 10 submissions/minute
10. ✅ **Hall of Shame** - Public cheater tracking with full IPs

### Validation Rules

**Duration Validation:**
- Tolerance: `max(10 seconds, game_duration * 0.20)`
- Example: 100s game allows ±20s difference
- Accounts for: network lag, frame rate drops, device throttling

**Score Validation:**
- Must match: `score = foodEaten * 10`
- Tolerance: ±20 points for very short games (≤2 food)
- Prevents: score manipulation, food count tampering

**Move Validation:**
- Moves recorded with frame numbers and timestamps
- Server replays frame-by-frame using same seed
- Validates: no wall collisions, no self-collisions, correct food positions

### Cheat Types Detected

| Cheat Type | Description | Detection Method |
|------------|-------------|------------------|
| `score_mismatch` | Client score doesn't match replay | Frame-by-frame replay |
| `food_mismatch` | Food count doesn't match replay | Frame-by-frame replay |
| `duration_mismatch` | Game duration outside tolerance | Time tracking with 20% tolerance |
| `invalid_moves` | Illegal moves (walls, self) | Collision detection in replay |
| `missing_moves` | No move history provided | Move recording check |
| `invalid_seed` | Seed missing or tampered | Session seed validation |

### Hall of Shame

**View caught cheaters:**
```bash
./monitor.sh shame
```

**API endpoint:**
```bash
curl http://192.168.40.80:3333/api/hallofshame?limit=20
```

**Response format:**
```json
{
  "hallOfShame": [
    {
      "username": "Cheater",
      "ip_address": "192.168.1.100",
      "cheat_type": "replay_fail",
      "attempted_score": 9000,
      "reason": "Game duration mismatch: client reported 2999s, server simulated 2s",
      "caught_at": 1769768151150,
      "offense_count": 3
    }
  ]
}
```

### Debugging Validation Issues

When a cheat is detected, the server logs detailed information:

```
========== CHEAT DETECTION ==========
Player: TestUser (ID: abc123)
IP Address: 192.168.1.100
Reason: Score mismatch: replay calculated 0, client sent 10

--- Game Summary ---
{
  "totalFrames": 47,
  "finalScore": 0,
  "finalFoodEaten": 0,
  "expectedScore": 10,
  "expectedFoodEaten": 1,
  "simulatedDuration": 7,
  "reportedDuration": 7,
  "movesApplied": 3,
  "totalMovesProvided": 3
}

--- Last 5 Frames ---
[...]
```

**To view these logs:**
```bash
ssh ai "docker logs Xnake | grep 'CHEAT DETECTION' -A 50"
```

---

## Troubleshooting

### Server Not Responding

**Check container status:**
```bash
./monitor.sh check
```

**Restart container:**
```bash
ssh ai "docker restart Xnake"
```

**View error logs:**
```bash
ssh ai "docker logs Xnake | tail -50"
```

### Database Permission Issues

The database is owned by root inside the container. If you need to manipulate it:

```bash
# Access as root
ssh ai "sudo ls -la /home/sonny/xnake/xnake.db"

# Run scripts with sudo
ssh ai "cd /home/sonny/xnake && sudo node your_script.js"
```

### False Positive Detections

If legitimate players are flagged:

1. **Check the logs** for detailed replay information:
   ```bash
   ssh ai "docker logs Xnake | grep 'CHEAT DETECTION' -A 50"
   ```

2. **Analyze the validation failure:**
   - Duration mismatch: Network lag or slow device?
   - Score mismatch: Replay simulation bug?
   - Missing moves: Old client version?

3. **Remove false positive from Hall of Shame:**
   - Edit `clean_false_positives.js`
   - Add username to removal list
   - Run the script (see Database Management)

4. **Adjust tolerance if needed:**
   - Duration tolerance: Currently 20% (in `server.js`)
   - Score tolerance: ±20 points for ≤2 food (in `server.js`)

### High Memory Usage

The session store uses `MemoryStore` which is not suitable for production at scale:

```
Warning: connect.session() MemoryStore is not designed for a production environment
```

**Solutions:**
- For low traffic (<100 concurrent users): Current setup is fine
- For high traffic: Switch to `connect-redis` or `connect-mongo`

### Container Won't Start

**Check Docker logs:**
```bash
ssh ai "docker logs Xnake"
```

**Common issues:**
- Port 3333 already in use
- Database file corrupted
- Missing dependencies

**Nuclear option (rebuild everything):**
```bash
ssh ai "cd /home/sonny/xnake && \
  docker stop Xnake && \
  docker rm Xnake && \
  docker rmi xnake-game && \
  ./deploy.sh"
```

### Player Can't Submit Scores

**Check validation logs:**
```bash
./monitor.sh errors
```

**Common causes:**
- Network issues (duration mismatch)
- Old client code (missing move tracking)
- Legitimate cheat detection

**Verify player can reach server:**
```bash
curl http://192.168.40.80:3333/api/halloffame
```

---

## Maintenance Tasks

### Weekly
- ✅ Check Hall of Shame for false positives
- ✅ Review validation error logs
- ✅ Backup database

### Monthly
- ✅ Analyze cheating patterns
- ✅ Update anti-cheat rules if needed
- ✅ Clean up old session data

### As Needed
- ✅ Update Node.js dependencies
- ✅ Adjust validation tolerances
- ✅ Deploy new features

---

## Quick Reference Commands

```bash
# Health check
./monitor.sh check

# View stats
./monitor.sh stats

# Deploy updates
rsync -avz --exclude 'node_modules' --exclude '.git' --exclude 'xnake.db' \
  /Users/sonny/github/snake/ ai:/home/sonny/xnake/ && \
  ssh ai "cd /home/sonny/xnake && ./deploy.sh"

# Backup database
scp ai:/home/sonny/xnake/xnake.db ./backups/xnake-$(date +%Y%m%d-%H%M%S).db

# View live logs
ssh ai "docker logs -f Xnake"

# Restart server
ssh ai "docker restart Xnake"
```

---

## Contact & Support

**Repository:** https://github.com/SuperSonnix71/Xnake (private)
**Server:** http://192.168.40.80:3333

For issues or questions, check the logs first, then investigate using the monitoring tools.
