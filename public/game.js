(function() {
    'use strict';
    
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
    
    function seededRandom(seed) {
        const x = Math.sin(seed++) * 10000;
        return x - Math.floor(x);
    }
    
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
    let frameCount = 0;
    let playerData = null;
    let fingerprint = null;
    let gameStartTime = 0;
    let foodEatenCount = 0;
    let moveHistory = [];
    let gameSeed = 0;
    
    async function init() {
        canvas = document.getElementById('gameCanvas');
        ctx = canvas.getContext('2d');
        
        try {
            fingerprint = await window.browserFingerprint.generate();
        } catch (error) {
            console.error('Failed to generate fingerprint:', error);
        }
        
        await checkSession();
        
        document.getElementById('registrationForm').addEventListener('submit', handleRegistration);
        document.getElementById('startBtn').addEventListener('click', startGame);
        document.getElementById('restartBtn').addEventListener('click', restartGame);
        document.getElementById('hallOfFameBtn').addEventListener('click', showHallOfFame);
        document.getElementById('viewHallOfFameBtn').addEventListener('click', showHallOfFame);
        document.getElementById('closeHallOfFameBtn').addEventListener('click', closeHallOfFame);
        document.getElementById('hallOfShameBtn').addEventListener('click', showHallOfShame);
        document.getElementById('closeHallOfShameBtn').addEventListener('click', closeHallOfShame);
        document.addEventListener('keydown', handleKeyPress);
        
        resetGame();
    }
    
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
                document.getElementById('registrationScreen').classList.remove('hidden');
            }
        } catch (error) {
            console.error('Session check failed:', error);
            document.getElementById('registrationScreen').classList.remove('hidden');
        }
    }
    
    async function handleRegistration(e) {
        e.preventDefault();
        
        const username = document.getElementById('usernameInput').value.trim();
        const errorEl = document.getElementById('registrationError');
        
        errorEl.classList.add('hidden');
        
        if (!fingerprint) {
            errorEl.textContent = 'Browser fingerprint not ready. Please refresh the page.';
            errorEl.classList.remove('hidden');
            return;
        }
        
        try {
            const response = await fetch('/api/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ username, fingerprint })
            });
            
            const data = await response.json();
            
            if (data.success) {
                playerData = data.player;
                playerData.bestScore = 0;
                playerData.totalGames = 0;
                playerData.rank = null;
                updatePlayerUI();
                document.getElementById('registrationScreen').classList.add('hidden');
            } else {
                errorEl.textContent = data.error || 'Registration failed';
                errorEl.classList.remove('hidden');
            }
        } catch (error) {
            errorEl.textContent = 'Network error. Please try again.';
            errorEl.classList.remove('hidden');
        }
    }
    
    function updatePlayerUI() {
        document.getElementById('playerName').textContent = playerData.username;
        document.getElementById('highScore').textContent = playerData.bestScore || 0;
        
        if (playerData.rank) {
            document.getElementById('playerRank').textContent = `Rank: #${playerData.rank}`;
        } else {
            document.getElementById('playerRank').textContent = '';
        }
    }
    
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
        foodEatenCount = 0;
        moveHistory = [];
        frameCount = 0;
        currentSpeed = CONFIG.initialSpeed;
        isPaused = false;
        updateScore();
        updateSpeedDisplay();
        spawnFood();
    }
    
    async function startGame() {
        if (!playerData) return;
        
        try {
            const response = await fetch('/api/game/start', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ fingerprint })
            });
            
            const data = await response.json();
            if (!data.success) {
                alert('Failed to start game');
                return;
            }
            
            gameSeed = data.seed;
        } catch (error) {
            console.error('Failed to initialize game:', error);
            alert('Failed to start game');
            return;
        }
        
        document.getElementById('startScreen').classList.add('hidden');
        isGameRunning = true;
        gameStartTime = Date.now();
        resetGame();
        gameLoop = setInterval(update, currentSpeed);
    }
    
    function restartGame() {
        document.getElementById('gameOver').classList.add('hidden');
        startGame();
    }
    
    function handleKeyPress(e) {
        if (!isGameRunning) return;
        
        if (e.code === 'Space') {
            e.preventDefault();
            isPaused = !isPaused;
            return;
        }
        
        if (isPaused) return;
        
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
            if (newDirection.x !== -direction.x || newDirection.y !== -direction.y) {
                nextDirection = newDirection;
            }
        }
    }
    
    function update() {
        if (isPaused) return;
        
        frameCount++;
        
        // Record move if direction changed this frame
        if (direction.x !== nextDirection.x || direction.y !== nextDirection.y) {
            const dirCode = nextDirection.y === -1 ? 0 : 
                           nextDirection.x === 1 ? 1 : 
                           nextDirection.y === 1 ? 2 : 3;
            moveHistory.push({
                d: dirCode,
                f: frameCount,
                t: Date.now() - gameStartTime
            });
        }
        
        animationFrame++;
        direction = nextDirection;
        
        const head = { ...snake[0] };
        head.x += direction.x;
        head.y += direction.y;
        
        if (head.x < 0 || head.x >= CONFIG.gridSize || 
            head.y < 0 || head.y >= CONFIG.gridSize) {
            gameOver();
            return;
        }
        
        if (snake.some(segment => segment.x === head.x && segment.y === head.y)) {
            gameOver();
            return;
        }
        
        snake.unshift(head);
        
        if (head.x === food.x && head.y === food.y) {
            score += 10;
            foodEatenCount++;
            updateScore();
            spawnFood();
            increaseSpeed();
        } else {
            snake.pop();
        }
        
        draw();
    }
    
    function increaseSpeed() {
        if (currentSpeed > 50) {
            currentSpeed -= CONFIG.speedIncrease;
            clearInterval(gameLoop);
            gameLoop = setInterval(update, currentSpeed);
            updateSpeedDisplay();
        }
    }
    
    function updateSpeedDisplay() {
        const speedLevel = Math.floor((CONFIG.initialSpeed - currentSpeed) / CONFIG.speedIncrease) + 1;
        document.getElementById('speed').textContent = speedLevel;
    }
    
    function spawnFood() {
        let newFood;
        let attempts = 0;
        const maxAttempts = CONFIG.gridSize * CONFIG.gridSize;
        
        do {
            const randValue = seededRandom(gameSeed + foodEatenCount + attempts);
            newFood = {
                x: Math.floor(randValue * CONFIG.gridSize),
                y: Math.floor(seededRandom(gameSeed + foodEatenCount + attempts + 1) * CONFIG.gridSize)
            };
            attempts++;
        } while (snake.some(segment => segment.x === newFood.x && segment.y === newFood.y) && attempts < maxAttempts);
        
        food = newFood;
    }
    
    function draw() {
        ctx.fillStyle = CONFIG.colors.background;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        drawGrid();
        drawFood();
        drawSnake();
    }
    
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
    
    function drawSnake() {
        snake.forEach((segment, index) => {
            const x = segment.x * CONFIG.tileSize;
            const y = segment.y * CONFIG.tileSize;
            
            ctx.shadowBlur = 20;
            ctx.shadowColor = CONFIG.colors.snake.glow;
            
            const color = index === 0 ? CONFIG.colors.snake.head : CONFIG.colors.snake.body;
            ctx.fillStyle = color;
            
            const radius = 4;
            ctx.beginPath();
            ctx.roundRect(x + 2, y + 2, CONFIG.tileSize - 4, CONFIG.tileSize - 4, radius);
            ctx.fill();
            
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
    
    function drawFood() {
        const x = food.x * CONFIG.tileSize;
        const y = food.y * CONFIG.tileSize;
        const centerX = x + CONFIG.tileSize / 2;
        const centerY = y + CONFIG.tileSize / 2;
        
        const pulse = Math.sin(animationFrame * 0.1) * 3 + 8;
        
        ctx.shadowBlur = 25;
        ctx.shadowColor = CONFIG.colors.food.glow;
        
        ctx.fillStyle = CONFIG.colors.food.main;
        ctx.beginPath();
        ctx.arc(centerX, centerY, pulse, 0, Math.PI * 2);
        ctx.fill();
        
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
    
    function updateScore() {
        document.getElementById('score').textContent = score;
    }
    
    async function gameOver() {
        isGameRunning = false;
        clearInterval(gameLoop);
        
        const gameDuration = Math.floor((Date.now() - gameStartTime) / 1000);
        
        // Only submit score if player actually scored points (don't track instant crashes)
        if (score > 0) {
            try {
                const speedLevel = Math.floor((CONFIG.initialSpeed - currentSpeed) / CONFIG.speedIncrease) + 1;
                
                // Format: direction,frame,timestamp
                const movesString = moveHistory.map(m => `${m.d},${m.f},${m.t}`).join(';');
                
                const response = await fetch('/api/score', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        score, 
                        speedLevel,
                        fingerprint,
                        gameDuration,
                        foodEaten: foodEatenCount,
                        seed: gameSeed,
                        moves: movesString,
                        totalFrames: frameCount
                    })
                });
                
                const data = await response.json();
                
                if (data.success) {
                    playerData.bestScore = data.bestScore;
                    playerData.rank = data.rank;
                    updatePlayerUI();
                    
                    if (data.isNewBest) {
                        document.getElementById('newBestMessage').classList.remove('hidden');
                    } else {
                        document.getElementById('newBestMessage').classList.add('hidden');
                    }
                    
                    document.getElementById('gameOverRank').textContent = `#${data.rank}`;
                } else if (data.error) {
                    alert('Error: ' + data.error);
                }
            } catch (error) {
                console.error('Failed to submit score:', error);
            }
        }
        
        document.getElementById('finalScore').textContent = score;
        document.getElementById('gameOver').classList.remove('hidden');
    }
    
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
    
    function closeHallOfFame() {
        document.getElementById('hallOfFameScreen').classList.add('hidden');
    }
    
    async function showHallOfShame() {
        const hallOfShameList = document.getElementById('hallOfShameList');
        hallOfShameList.innerHTML = '<p class="loading">Loading...</p>';
        
        document.getElementById('hallOfShameScreen').classList.remove('hidden');
        
        try {
            const response = await fetch('/api/hallofshame?limit=50');
            const data = await response.json();
            
            if (data.hallOfShame && data.hallOfShame.length > 0) {
                hallOfShameList.innerHTML = data.hallOfShame.map((entry) => {
                    const date = new Date(entry.caught_at).toLocaleDateString();
                    const time = new Date(entry.caught_at).toLocaleTimeString();
                    const ipAddress = entry.ip_address || 'Unknown';
                    const repeatOffender = entry.offense_count > 3;
                    
                    const cheatTypeLabels = {
                        'score_mismatch': 'Score Manipulation',
                        'speed_hack': 'Speed Hacking',
                        'replay_fail': 'Invalid Game Replay',
                        'invalid_session': 'Session Tampering',
                        'missing_moves': 'Missing Move Data',
                        'timing_invalid': 'Suspicious Timing'
                    };
                    
                    const cheatLabel = cheatTypeLabels[entry.cheat_type] || entry.cheat_type;
                    
                    return `
                        <div class="hall-of-shame-item ${repeatOffender ? 'repeat-offender' : ''}">
                            <div class="shame-header">
                                <div class="shame-username">
                                    ${repeatOffender ? '🚨 ' : ''}${entry.username}
                                    ${repeatOffender ? ` <span class="offense-badge">${entry.offense_count}x offender</span>` : ''}
                                </div>
                                <div class="shame-date">${date} ${time}</div>
                            </div>
                            <div class="shame-details">
                                <div class="shame-info">
                                    <span class="shame-label">Cheat Type:</span>
                                    <span class="shame-value cheat-type">${cheatLabel}</span>
                                </div>
                                <div class="shame-info">
                                    <span class="shame-label">Attempted Score:</span>
                                    <span class="shame-value">${entry.attempted_score || 'N/A'}</span>
                                </div>
                                <div class="shame-info">
                                    <span class="shame-label">IP Address:</span>
                                    <span class="shame-value ip-address">${ipAddress}</span>
                                </div>
                            </div>
                            <div class="shame-reason">${entry.reason}</div>
                        </div>
                    `;
                }).join('');
            } else {
                hallOfShameList.innerHTML = '<p class="loading">No cheaters caught yet! 🎉</p>';
            }
        } catch (error) {
            hallOfShameList.innerHTML = '<p class="loading">Failed to load Hall of Shame</p>';
            console.error('Failed to load hall of shame:', error);
        }
    }
    
    function closeHallOfShame() {
        document.getElementById('hallOfShameScreen').classList.add('hidden');
    }
    
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
    
    window.addEventListener('DOMContentLoaded', init);
})();
