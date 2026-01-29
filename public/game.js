// Game Configuration
const CONFIG = {
    gridSize: 30,
    tileSize: 20,
    initialSpeed: 150,
    speedIncrease: 3,
    colors: {
        background: '#1a1a2e',
        grid: '#16213e',
        snake: {
            head: '#00ff88',
            body: '#00d9ff',
            glow: '#00ff88'
        },
        food: {
            main: '#ff006e',
            glow: '#ff006e'
        }
    }
};

// Game State
let canvas, ctx;
let snake = [];
let food = {};
let direction = { x: 1, y: 0 };
let nextDirection = { x: 1, y: 0 };
let score = 0;
let gameLoop = null;
let isPaused = false;
let isGameRunning = false;
let currentSpeed = CONFIG.initialSpeed;
let animationFrame = 0;

// Player State
let playerData = null;
let fingerprint = null;

// Initialize the game
async function init() {
    console.log('[Init] Starting initialization...');
    canvas = document.getElementById('gameCanvas');
    ctx = canvas.getContext('2d');
    
    // Generate browser fingerprint
    console.log('[Init] Generating browser fingerprint...');
    try {
        fingerprint = await window.browserFingerprint.generate();
        console.log('[Init] Fingerprint generated:', fingerprint);
    } catch (error) {
        console.error('[Init] Failed to generate fingerprint:', error);
    }
    
    // Check session and verify player
    console.log('[Init] Checking session...');
    await checkSession();
    
    // Event listeners
    document.getElementById('registrationForm').addEventListener('submit', handleRegistration);
    document.getElementById('startBtn').addEventListener('click', startGame);
    document.getElementById('restartBtn').addEventListener('click', restartGame);
    document.getElementById('hallOfFameBtn').addEventListener('click', showHallOfFame);
    document.getElementById('viewHallOfFameBtn').addEventListener('click', showHallOfFame);
    document.getElementById('closeHallOfFameBtn').addEventListener('click', closeHallOfFame);
    document.addEventListener('keydown', handleKeyPress);
    
    console.log('[Init] Initialization complete');
    
    // Initialize snake in the middle
    resetGame();
}

// Check if player is already logged in
async function checkSession() {
    try {
        const response = await fetch('/api/verify', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ fingerprint })
        });
        
        const data = await response.json();
        
        if (data.verified) {
            playerData = data.player;
            updatePlayerUI();
            document.getElementById('registrationScreen').classList.add('hidden');
        } else {
            // Show registration screen
            document.getElementById('registrationScreen').classList.remove('hidden');
        }
    } catch (error) {
        console.error('Session check failed:', error);
        document.getElementById('registrationScreen').classList.remove('hidden');
    }
}

// Handle player registration
async function handleRegistration(e) {
    e.preventDefault();
    
    const username = document.getElementById('usernameInput').value.trim();
    const errorEl = document.getElementById('registrationError');
    
    errorEl.classList.add('hidden');
    
    console.log('[Registration] Starting registration for:', username);
    console.log('[Registration] Fingerprint:', fingerprint);
    
    // Check if fingerprint is available
    if (!fingerprint) {
        console.error('[Registration] Fingerprint not available!');
        errorEl.textContent = 'Browser fingerprint not ready. Please refresh the page.';
        errorEl.classList.remove('hidden');
        return;
    }
    
    try {
        console.log('[Registration] Sending request to /api/register');
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, fingerprint })
        });
        
        console.log('[Registration] Response status:', response.status);
        const data = await response.json();
        console.log('[Registration] Response data:', data);
        
        if (data.success) {
            playerData = data.player;
            playerData.bestScore = 0;
            playerData.totalGames = 0;
            playerData.rank = null;
            updatePlayerUI();
            document.getElementById('registrationScreen').classList.add('hidden');
            console.log('[Registration] Success! Player registered:', playerData);
        } else {
            console.error('[Registration] Registration failed:', data.error);
            errorEl.textContent = data.error || 'Registration failed';
            errorEl.classList.remove('hidden');
        }
    } catch (error) {
        console.error('[Registration] Caught error:', error);
        errorEl.textContent = 'Network error. Please try again.';
        errorEl.classList.remove('hidden');
    }
}

// Update player UI elements
function updatePlayerUI() {
    document.getElementById('playerName').textContent = playerData.username;
    document.getElementById('highScore').textContent = playerData.bestScore || 0;
    
    if (playerData.rank) {
        document.getElementById('playerRank').textContent = `Rank: #${playerData.rank}`;
    } else {
        document.getElementById('playerRank').textContent = '';
    }
}

// Reset game state
function resetGame() {
    const center = Math.floor(CONFIG.gridSize / 2);
    snake = [
        { x: center, y: center },
        { x: center - 1, y: center },
        { x: center - 2, y: center }
    ];
    direction = { x: 1, y: 0 };
    nextDirection = { x: 1, y: 0 };
    score = 0;
    currentSpeed = CONFIG.initialSpeed;
    isPaused = false;
    updateScore();
    updateSpeedDisplay();
    spawnFood();
}

// Start the game
function startGame() {
    if (!playerData) return;
    
    document.getElementById('startScreen').classList.add('hidden');
    isGameRunning = true;
    resetGame();
    gameLoop = setInterval(update, currentSpeed);
}

// Restart the game
function restartGame() {
    document.getElementById('gameOver').classList.add('hidden');
    startGame();
}

// Handle keyboard input
function handleKeyPress(e) {
    if (!isGameRunning) return;
    
    // Pause/unpause
    if (e.code === 'Space') {
        e.preventDefault();
        isPaused = !isPaused;
        return;
    }
    
    if (isPaused) return;
    
    // Direction controls
    const directionMap = {
        'ArrowUp': { x: 0, y: -1 },
        'KeyW': { x: 0, y: -1 },
        'ArrowDown': { x: 0, y: 1 },
        'KeyS': { x: 0, y: 1 },
        'ArrowLeft': { x: -1, y: 0 },
        'KeyA': { x: -1, y: 0 },
        'ArrowRight': { x: 1, y: 0 },
        'KeyD': { x: 1, y: 0 }
    };
    
    const newDirection = directionMap[e.code];
    if (newDirection) {
        e.preventDefault();
        // Prevent reversing direction
        if (newDirection.x !== -direction.x || newDirection.y !== -direction.y) {
            nextDirection = newDirection;
        }
    }
}

// Update game state
function update() {
    if (isPaused) return;
    
    animationFrame++;
    direction = nextDirection;
    
    // Calculate new head position
    const head = { ...snake[0] };
    head.x += direction.x;
    head.y += direction.y;
    
    // Check wall collision
    if (head.x < 0 || head.x >= CONFIG.gridSize || 
        head.y < 0 || head.y >= CONFIG.gridSize) {
        gameOver();
        return;
    }
    
    // Check self collision
    if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
        gameOver();
        return;
    }
    
    snake.unshift(head);
    
    // Check food collision
    if (head.x === food.x && head.y === food.y) {
        score += 10;
        updateScore();
        spawnFood();
        increaseSpeed();
    } else {
        snake.pop();
    }
    
    draw();
}

// Increase game speed
function increaseSpeed() {
    if (currentSpeed > 50) {
        currentSpeed -= CONFIG.speedIncrease;
        clearInterval(gameLoop);
        gameLoop = setInterval(update, currentSpeed);
        updateSpeedDisplay();
    }
}

// Update speed display
function updateSpeedDisplay() {
    const speedLevel = Math.floor((CONFIG.initialSpeed - currentSpeed) / CONFIG.speedIncrease) + 1;
    document.getElementById('speed').textContent = speedLevel;
}

// Spawn food at random position
function spawnFood() {
    let newFood;
    do {
        newFood = {
            x: Math.floor(Math.random() * CONFIG.gridSize),
            y: Math.floor(Math.random() * CONFIG.gridSize)
        };
    } while (snake.some(segment => segment.x === newFood.x && segment.y === newFood.y));
    
    food = newFood;
}

// Draw everything
function draw() {
    // Clear canvas with background
    ctx.fillStyle = CONFIG.colors.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    // Draw grid
    drawGrid();
    
    // Draw food with glow effect
    drawFood();
    
    // Draw snake with glow effect
    drawSnake();
}

// Draw grid
function drawGrid() {
    ctx.strokeStyle = CONFIG.colors.grid;
    ctx.lineWidth = 0.5;
    
    for (let i = 0; i <= CONFIG.gridSize; i++) {
        const pos = i * CONFIG.tileSize;
        ctx.beginPath();
        ctx.moveTo(pos, 0);
        ctx.lineTo(pos, canvas.height);
        ctx.stroke();
        
        ctx.beginPath();
        ctx.moveTo(0, pos);
        ctx.lineTo(canvas.width, pos);
        ctx.stroke();
    }
}

// Draw snake with gradient and glow
function drawSnake() {
    snake.forEach((segment, index) => {
        const x = segment.x * CONFIG.tileSize;
        const y = segment.y * CONFIG.tileSize;
        
        // Glow effect
        ctx.shadowBlur = 20;
        ctx.shadowColor = CONFIG.colors.snake.glow;
        
        // Create gradient from head to tail
        const color = index === 0 ? CONFIG.colors.snake.head : CONFIG.colors.snake.body;
        ctx.fillStyle = color;
        
        // Draw rounded rectangle
        const radius = 4;
        ctx.beginPath();
        ctx.roundRect(x + 2, y + 2, CONFIG.tileSize - 4, CONFIG.tileSize - 4, radius);
        ctx.fill();
        
        // Add shine effect on head
        if (index === 0) {
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.beginPath();
            ctx.roundRect(x + 4, y + 4, CONFIG.tileSize - 8, 6, 2);
            ctx.fill();
        }
    });
    
    ctx.shadowBlur = 0;
}

// Draw food with pulsing glow
function drawFood() {
    const x = food.x * CONFIG.tileSize;
    const y = food.y * CONFIG.tileSize;
    const centerX = x + CONFIG.tileSize / 2;
    const centerY = y + CONFIG.tileSize / 2;
    
    // Pulsing effect
    const pulse = Math.sin(animationFrame * 0.1) * 3 + 8;
    
    // Glow effect
    ctx.shadowBlur = 25;
    ctx.shadowColor = CONFIG.colors.food.glow;
    
    // Draw circle
    ctx.fillStyle = CONFIG.colors.food.main;
    ctx.beginPath();
    ctx.arc(centerX, centerY, pulse, 0, Math.PI * 2);
    ctx.fill();
    
    // Add inner glow
    const gradient = ctx.createRadialGradient(
        centerX, centerY, 0,
        centerX, centerY, pulse
    );
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.8)');
    gradient.addColorStop(0.5, CONFIG.colors.food.main);
    gradient.addColorStop(1, 'rgba(255, 0, 110, 0)');
    
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(centerX, centerY, pulse, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.shadowBlur = 0;
}

// Update score display
function updateScore() {
    document.getElementById('score').textContent = score;
}

// Game over
async function gameOver() {
    isGameRunning = false;
    clearInterval(gameLoop);
    
    // Submit score to server
    try {
        const speedLevel = Math.floor((CONFIG.initialSpeed - currentSpeed) / CONFIG.speedIncrease) + 1;
        const response = await fetch('/api/score', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                score, 
                speedLevel,
                fingerprint 
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            // Update player data
            playerData.bestScore = data.bestScore;
            playerData.rank = data.rank;
            updatePlayerUI();
            
            // Show new best message if applicable
            if (data.isNewBest) {
                document.getElementById('newBestMessage').classList.remove('hidden');
            } else {
                document.getElementById('newBestMessage').classList.add('hidden');
            }
            
            // Show rank
            document.getElementById('gameOverRank').textContent = `#${data.rank}`;
        }
    } catch (error) {
        console.error('Failed to submit score:', error);
    }
    
    document.getElementById('finalScore').textContent = score;
    document.getElementById('gameOver').classList.remove('hidden');
}

// Show Hall of Fame
async function showHallOfFame() {
    const hallOfFameList = document.getElementById('hallOfFameList');
    hallOfFameList.innerHTML = '<p class="loading">Loading...</p>';
    
    document.getElementById('hallOfFameScreen').classList.remove('hidden');
    
    try {
        const response = await fetch('/api/halloffame?limit=10');
        const data = await response.json();
        
        if (data.hallOfFame && data.hallOfFame.length > 0) {
            hallOfFameList.innerHTML = data.hallOfFame.map((entry, index) => {
                const date = new Date(entry.played_at).toLocaleDateString();
                const rankClass = index === 0 ? 'gold' : index === 1 ? 'silver' : index === 2 ? 'bronze' : '';
                const itemClass = index < 3 ? 'hall-of-fame-item top-three' : 'hall-of-fame-item';
                
                return `
                    <div class="${itemClass}">
                        <div class="hall-rank ${rankClass}">#${entry.rank}</div>
                        <div style="flex: 1;">
                            <div class="hall-player">${entry.username}</div>
                            <div class="hall-date">${date}</div>
                        </div>
                        <div class="hall-score">${entry.score}</div>
                    </div>
                `;
            }).join('');
        } else {
            hallOfFameList.innerHTML = '<p class="loading">No scores yet. Be the first!</p>';
        }
    } catch (error) {
        hallOfFameList.innerHTML = '<p class="loading">Failed to load Hall of Fame</p>';
        console.error('Failed to load hall of fame:', error);
    }
}

// Close Hall of Fame
function closeHallOfFame() {
    document.getElementById('hallOfFameScreen').classList.add('hidden');
}

// Add roundRect support for older browsers
if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function(x, y, width, height, radius) {
        this.moveTo(x + radius, y);
        this.lineTo(x + width - radius, y);
        this.quadraticCurveTo(x + width, y, x + width, y + radius);
        this.lineTo(x + width, y + height - radius);
        this.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        this.lineTo(x + radius, y + height);
        this.quadraticCurveTo(x, y + height, x, y + height - radius);
        this.lineTo(x, y + radius);
        this.quadraticCurveTo(x, y, x + radius, y);
    };
}

// Start the game when page loads
window.addEventListener('DOMContentLoaded', init);
