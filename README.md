# 🐍 XNAKE - Modern Snake Game with Persistent Leaderboard

A beautiful, modern Snake game built with Node.js, Express, and HTML5 Canvas. Features player registration, persistent scores, Hall of Fame leaderboard, and browser fingerprinting to prevent cheating!

## Features

### Game Features
- 🎨 Modern black background with stunning gradient effects
- ✨ Smooth animations with glowing snake and pulsing food
- 🎮 Keyboard controls (Arrow Keys or WASD)
- ⏸️ Pause functionality (Space bar)
- 🚀 Progressive speed increase as you score
- 📱 Responsive design for different screen sizes

### Player & Scoring Features
- 👤 **Player Registration** - First-time players register with a username
- 🔒 **Browser Fingerprinting** - Device-based identity prevents easy cheating
- 💾 **Persistent Scores** - All scores saved to SQLite database
- 🏆 **Hall of Fame** - Top 10 players leaderboard
- 📊 **Personal Stats** - Track your best score and ranking
- 🎯 **Rank System** - See your global ranking after each game
- 🎉 **New Best Indicator** - Celebration when you beat your personal best
- 🔐 **Session Management** - Automatic login for returning players

### Anti-Cheat System
- **Browser Fingerprinting**: Combines screen resolution, timezone, platform, canvas rendering, WebGL, and audio context
- **Session Cookies**: Persistent 1-year cookies to track players
- **Fingerprint Verification**: All score submissions verified against registered fingerprint
- **Username Lock**: One username per device fingerprint

## Quick Start

### Option 1: Run with Docker (Recommended)

1. **Build the Docker image:**
   ```bash
   docker build -t xnake-game .
   ```

2. **Run the container with persistent storage:**
   ```bash
   docker run -d -p 3000:3000 -v $(pwd):/app --name xnake xnake-game
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

### Option 2: Run Locally with Node.js

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Start the server:**
   ```bash
   npm start
   ```

3. **Open your browser:**
   Navigate to `http://localhost:3000`

## How to Play

### First Time Players
1. Enter a username (3-20 characters, letters, numbers, and underscores only)
2. Your device will be registered with your username
3. Start playing!

### Returning Players
- You'll be automatically logged in if you're using the same browser/device
- Your best score and ranking will be displayed

### Controls

| Key | Action |
|-----|--------|
| ↑ / W | Move Up |
| ↓ / S | Move Down |
| ← / A | Move Left |
| → / D | Move Right |
| Space | Pause/Unpause |

### Gameplay
- Eat the glowing food to grow and score points (+10 per food)
- Avoid hitting the walls or yourself
- Game speed increases as your score goes up
- Try to reach the top of the Hall of Fame!

## API Endpoints

The game includes a RESTful API for all player and score operations:

- `POST /api/register` - Register a new player
- `POST /api/verify` - Verify player session with fingerprint
- `GET /api/session` - Check current session status
- `POST /api/score` - Submit a score (requires authentication)
- `GET /api/halloffame` - Get top scores
- `GET /api/player/stats` - Get player statistics
- `GET /api/stats` - Get global game statistics
- `POST /api/logout` - Logout current player

## Docker Commands

**Build the image:**
```bash
docker build -t xnake-game .
```

**Run with persistent storage:**
```bash
docker run -d -p 3000:3000 -v $(pwd):/app --name xnake xnake-game
```

**Run without persistent storage:**
```bash
docker run -d -p 3000:3000 --name xnake xnake-game
```

**Stop the container:**
```bash
docker stop xnake
```

**Start the container:**
```bash
docker start xnake
```

**Remove the container:**
```bash
docker rm xnake
```

**View logs:**
```bash
docker logs xnake
```

**Access container shell:**
```bash
docker exec -it xnake sh
```

## Technology Stack

### Backend
- **Node.js** - JavaScript runtime
- **Express** - Web framework
- **express-session** - Session management
- **sql.js** - SQLite database (pure JavaScript, no native dependencies)
- **uuid** - Unique ID generation

### Frontend
- **HTML5 Canvas** - Game rendering
- **Vanilla JavaScript** - Game logic and browser fingerprinting
- **CSS3** - Modern styling with animations

### Database
- **SQLite** - Lightweight embedded database
- **Tables**: 
  - `players` - User accounts with fingerprints
  - `scores` - Game scores with timestamps
- **Indexes**: Optimized queries for rankings and leaderboards

## Database Schema

### Players Table
```sql
CREATE TABLE players (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    fingerprint TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    last_seen INTEGER NOT NULL
)
```

### Scores Table
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

## Browser Fingerprinting

The game uses multiple browser attributes to create a unique fingerprint:

1. **Screen Properties**: Resolution, color depth
2. **Timezone**: Timezone name and offset
3. **Language**: Browser language preferences
4. **Platform**: Operating system and CPU cores
5. **User Agent**: Browser identification
6. **Canvas Fingerprint**: Unique rendering signature
7. **WebGL**: Graphics card information
8. **Audio Context**: Audio processing characteristics
9. **Touch Support**: Touchscreen detection

All combined and hashed using SHA-256 to create a unique device identifier.

## Project Structure

```
xnake/
├── public/
│   ├── index.html          # Game interface
│   ├── game.js             # Game logic
│   ├── fingerprint.js      # Browser fingerprinting
│   └── style.css           # Styles and animations
├── server.js               # Express server with API
├── database.js             # SQLite database operations
├── package.json            # Node.js dependencies
├── Dockerfile              # Docker configuration
├── .dockerignore           # Docker ignore file
├── xnake.db               # SQLite database file (auto-created)
└── README.md              # This file
```

## Game Mechanics

### Speed System
- **Initial Speed**: 150ms per move (slower start for easier gameplay)
- **Speed Increase**: 3ms faster for each food eaten
- **Minimum Speed**: 50ms per move (maximum difficulty)

### Scoring System
- **Points per Food**: 10 points
- **Best Score**: Tracked per player
- **Global Ranking**: Compared against all players' best scores
- **Hall of Fame**: Top 10 all-time best scores

## Security Considerations

### What's Prevented
- ✅ Multiple accounts per device (fingerprint lock)
- ✅ Score submission without authentication
- ✅ Session hijacking (fingerprint verification)
- ✅ Easy username switching

### What's NOT Prevented
- ❌ Determined cheaters using VPN + incognito mode
- ❌ Code modification (client-side game logic)
- ❌ Multiple physical devices

The anti-cheat system is designed to prevent **casual cheating** and make it annoying enough to deter most players.

## Development

**Development mode with auto-restart:**
```bash
npm run dev
```

**Kill existing server:**
```bash
lsof -ti:3000 | xargs kill -9
```

## Environment Variables

- `PORT` - Server port (default: 3000)
- `SESSION_SECRET` - Session encryption key (change in production!)
- `NODE_ENV` - Environment (development/production)

## Production Deployment

1. Set a secure `SESSION_SECRET` environment variable
2. Enable HTTPS and set `secure: true` in session cookie config
3. Use a reverse proxy (nginx) for SSL termination
4. Regular database backups of `xnake.db`
5. Consider using a proper database for high traffic (PostgreSQL)

## Troubleshooting

**Database locked error:**
- The database is being written to. Wait a moment and try again.

**Fingerprint mismatch:**
- Browser extensions or privacy tools may affect fingerprinting
- Clearing cookies will require re-registration

**Can't register username:**
- Username already taken by another player
- Device already registered with different username

## License

MIT License - Feel free to use and modify!

## Credits

Created with ❤️ for snake game enthusiasts everywhere!

---

## Enjoy the Game! 🎮🐍

Try to beat the high score and claim your spot in the Hall of Fame!
