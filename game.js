// Конфигурация сложности (телепортов макс 10, по разному на уровнях)
const DIFFICULTIES = {
    easy: { size: 15, cellSize: 30, teleports: 10 },
    medium: { size: 25, cellSize: 20, teleports: 7 },
    hard: { size: 35, cellSize: 15, teleports: 5 },
    extreme: { size: 50, cellSize: 10, teleports: 3 }
};

// Высота полосы тропы сверху и дома снизу (в единицах cellSize)
// Увеличено, чтобы сверху и снизу было больше места под фон/картинки
const PATH_STRIP = 2.5;
const HOUSE_STRIP = 2.6;
// Ширина боковых панелей: слева Тянь-Шань, справа флаг КР + Иссык-Куль
// Увеличено ~в 2–2.5 раза, чтобы фото были крупнее
const SIDE_LEFT = 220;
const SIDE_RIGHT = 220;

// Состояние игры
let gameState = {
    maze: null,
    player: { x: 0, y: 0 },
    exit: { x: 0, y: 0 },
    startPosition: { x: 0, y: 0 },
    deadEnds: null,
    currentDifficulty: null,
    character: 'aktan', // 'aktan' (голубоватый) или 'akylai' (красноватый)
    level: 1,
    moves: 0,
    moveLimit: null,
    teleportsLeft: 0,
    movesSinceLastTeleport: 0,
    startTime: null,
    timerInterval: null
};

// Элементы DOM
const menuScreen = document.getElementById('menuScreen');
const gameScreen = document.getElementById('gameScreen');
const winScreen = document.getElementById('winScreen');
const gameOverScreen = document.getElementById('gameOverScreen');
const canvas = document.getElementById('mazeCanvas');
const ctx = canvas.getContext('2d');

const imgFlag = new Image();
const imgIssykKul = new Image();
const imgTianShan = new Image();
function redrawIfPlaying() {
    if (gameScreen.style.display !== 'none') drawMaze();
}
imgFlag.onload = redrawIfPlaying;
imgIssykKul.onload = redrawIfPlaying;
imgTianShan.onload = redrawIfPlaying;
// Используем ваши файлы из папки Image
imgFlag.src = 'Image/flag.png';
imgIssykKul.src = 'Image/image.png';
imgTianShan.src = 'Image/Screenshot 2026-02-12 151637.png';

// Инициализация
document.querySelectorAll('.character-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const char = btn.dataset.character;
        if (!char) return;
        gameState.character = char;
        document.querySelectorAll('.character-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
    });
});
document.querySelector('.character-btn[data-character="aktan"]')?.classList.add('active');

document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', () => {
        const difficulty = btn.dataset.difficulty;
        startGame(difficulty);
    });
});

document.getElementById('restartBtn').addEventListener('click', () => {
    if (gameState.currentDifficulty) {
        startGame(gameState.currentDifficulty);
    }
});

document.getElementById('menuBtn').addEventListener('click', () => {
    showMenu();
});

document.getElementById('nextLevelBtn').addEventListener('click', () => {
    gameState.level++;
    startGame(gameState.currentDifficulty);
});

document.getElementById('menuWinBtn').addEventListener('click', () => {
    showMenu();
});

document.getElementById('retryBtn').addEventListener('click', () => {
    if (gameState.currentDifficulty) {
        startGame(gameState.currentDifficulty);
    }
});

document.getElementById('menuOverBtn').addEventListener('click', () => {
    showMenu();
});

// Обработка клавиатуры
document.addEventListener('keydown', (e) => {
    if (gameScreen.style.display === 'none') return;
    
    let moved = false;
    const { x, y } = gameState.player;
    
    switch(e.key) {
        case 'ArrowUp':
        case 'w':
        case 'W':
            if (canMove(x, y - 1)) {
                gameState.player.y--;
                moved = true;
            }
            break;
        case 'ArrowDown':
        case 's':
        case 'S':
            if (canMove(x, y + 1)) {
                gameState.player.y++;
                moved = true;
            }
            break;
        case 'ArrowLeft':
        case 'a':
        case 'A':
            if (canMove(x - 1, y)) {
                gameState.player.x--;
                moved = true;
            }
            break;
        case 'ArrowRight':
        case 'd':
        case 'D':
            if (canMove(x + 1, y)) {
                gameState.player.x++;
                moved = true;
            }
            break;
    }
    
    if (moved) {
        e.preventDefault();
        gameState.moves++;
        gameState.movesSinceLastTeleport++;
        const newX = gameState.player.x;
        const newY = gameState.player.y;
        const deadEndKey = `${newX},${newY}`;
        if (gameState.deadEnds && gameState.deadEnds.has(deadEndKey)) {
            if (gameState.teleportsLeft > 0) {
                const penalty = gameState.movesSinceLastTeleport;
                gameState.moves += penalty;
                gameState.player.x = gameState.startPosition.x;
                gameState.player.y = gameState.startPosition.y;
                gameState.teleportsLeft--;
                gameState.movesSinceLastTeleport = 0;
                showTeleportToast(penalty, gameState.teleportsLeft);
            }
        }
        updateUI();
        if (gameState.moves > gameState.moveLimit) {
            stopTimer();
            showGameOverScreen();
            return;
        }
        drawMaze();
        checkWin();
    }
});

// Функции игры
function startGame(difficulty) {
    gameState.currentDifficulty = difficulty;
    gameState.moves = 0;
    gameState.startTime = Date.now();
    
    const config = DIFFICULTIES[difficulty];
    const centerX = Math.floor(config.size / 2);
    gameState.maze = generateMaze(config.size, centerX);
    
    // Вход по центру сверху, выход по центру снизу
    gameState.startPosition = { x: centerX, y: 0 };
    gameState.player = { x: centerX, y: 0 };
    gameState.exit = { x: centerX, y: config.size - 1 };

    gameState.deadEnds = getDeadEnds(gameState.maze, config.size, gameState.startPosition, gameState.exit);
    gameState.teleportsLeft = Math.min(10, config.teleports || 5);
    gameState.movesSinceLastTeleport = 0;

    // Минимальное число ходов (BFS) + 10 на экстра ходы
    const minMoves = getShortestPathLength(gameState.maze, config.size, gameState.player, gameState.exit);
    gameState.moveLimit = minMoves + 10;
    
    // Настройка canvas: левая/правая панели + лабиринт
    const cellSize = config.cellSize;
    const mazeW = config.size * cellSize;
    canvas.width = SIDE_LEFT + mazeW + SIDE_RIGHT;
    canvas.height = (PATH_STRIP + config.size + HOUSE_STRIP) * cellSize;
    
    // Показать экран игры, скрыть экраны победы и проигрыша
    menuScreen.style.display = 'none';
    winScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    gameScreen.style.display = 'block';
    document.getElementById('teleportToast').classList.remove('show');

    updateUI();
    drawMaze();
    startTimer();
}

function showMenu() {
    stopTimer();
    menuScreen.style.display = 'block';
    gameScreen.style.display = 'none';
    winScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    document.getElementById('teleportToast').classList.remove('show');
}

// Клетки-тупики: ровно один сосед (не старт и не выход)
function getDeadEnds(maze, size, start, exit) {
    const key = (x, y) => `${x},${y}`;
    const out = new Set();
    for (let y = 0; y < size; y++) {
        for (let x = 0; x < size; x++) {
            if ((x === start.x && y === start.y) || (x === exit.x && y === exit.y)) continue;
            const cell = maze[y][x];
            let neighbors = 0;
            if (!cell.top && y > 0) neighbors++;
            if (!cell.bottom && y < size - 1) neighbors++;
            if (!cell.left && x > 0) neighbors++;
            if (!cell.right && x < size - 1) neighbors++;
            if (neighbors === 1) out.add(key(x, y));
        }
    }
    return out;
}

function showTeleportToast(penaltyMoves, teleportsLeft) {
    const el = document.getElementById('teleportToast');
    el.textContent = `Тупик! Телепорт в начало. +${penaltyMoves} ходов. Осталось телепортов: ${teleportsLeft}`;
    el.classList.add('show');
    clearTimeout(teleportToastTimer);
    teleportToastTimer = setTimeout(() => el.classList.remove('show'), 2500);
}
let teleportToastTimer = null;

// Кратчайший путь от start до exit (BFS), возвращает число ходов
function getShortestPathLength(maze, size, start, exit) {
    const key = (x, y) => `${x},${y}`;
    const visited = new Set([key(start.x, start.y)]);
    const queue = [{ x: start.x, y: start.y, steps: 0 }];
    while (queue.length > 0) {
        const { x, y, steps } = queue.shift();
        if (x === exit.x && y === exit.y) return steps;
        const cell = maze[y][x];
        const neighbors = [];
        if (!cell.top && y > 0) neighbors.push({ x, y: y - 1 });
        if (!cell.bottom && y < size - 1) neighbors.push({ x, y: y + 1 });
        if (!cell.left && x > 0) neighbors.push({ x: x - 1, y });
        if (!cell.right && x < size - 1) neighbors.push({ x: x + 1, y });
        for (const n of neighbors) {
            const k = key(n.x, n.y);
            if (!visited.has(k)) {
                visited.add(k);
                queue.push({ x: n.x, y: n.y, steps: steps + 1 });
            }
        }
    }
    return size * size;
}

function showGameOverScreen() {
    document.getElementById('overMoves').textContent = gameState.moves;
    document.getElementById('overLimit').textContent = gameState.moveLimit;
    gameScreen.style.display = 'none';
    gameOverScreen.style.display = 'block';
}

function generateMaze(size, centerX) {
    // Инициализация лабиринта (все стены)
    const maze = Array(size).fill(null).map(() => 
        Array(size).fill(null).map(() => ({
            top: true,
            right: true,
            bottom: true,
            left: true,
            visited: false
        }))
    );
    
    // Старт от центра сверху — вход в лабиринт
    const stack = [];
    let current = { x: centerX, y: 0 };
    maze[current.y][current.x].visited = true;
    
    while (true) {
        const neighbors = getUnvisitedNeighbors(current.x, current.y, maze, size);
        
        if (neighbors.length > 0) {
            stack.push(current);
            const next = neighbors[Math.floor(Math.random() * neighbors.length)];
            removeWall(current, next, maze);
            current = next;
            maze[current.y][current.x].visited = true;
        } else if (stack.length > 0) {
            current = stack.pop();
        } else {
            break;
        }
    }
    
    // Вход по центру сверху — открываем верх центральной клетки
    maze[0][centerX].top = false;
    // Выход по центру снизу — открываем низ центральной клетки
    maze[size - 1][centerX].bottom = false;
    
    return maze;
}

function getUnvisitedNeighbors(x, y, maze, size) {
    const neighbors = [];
    
    if (y > 0 && !maze[y - 1][x].visited) {
        neighbors.push({ x, y: y - 1, dir: 'top' });
    }
    if (y < size - 1 && !maze[y + 1][x].visited) {
        neighbors.push({ x, y: y + 1, dir: 'bottom' });
    }
    if (x > 0 && !maze[y][x - 1].visited) {
        neighbors.push({ x: x - 1, y, dir: 'left' });
    }
    if (x < size - 1 && !maze[y][x + 1].visited) {
        neighbors.push({ x: x + 1, y, dir: 'right' });
    }
    
    return neighbors;
}

function removeWall(current, next, maze) {
    if (next.dir === 'top') {
        maze[current.y][current.x].top = false;
        maze[next.y][next.x].bottom = false;
    } else if (next.dir === 'bottom') {
        maze[current.y][current.x].bottom = false;
        maze[next.y][next.x].top = false;
    } else if (next.dir === 'left') {
        maze[current.y][current.x].left = false;
        maze[next.y][next.x].right = false;
    } else if (next.dir === 'right') {
        maze[current.y][current.x].right = false;
        maze[next.y][next.x].left = false;
    }
}

function canMove(x, y) {
    const config = DIFFICULTIES[gameState.currentDifficulty];
    if (x < 0 || x >= config.size || y < 0 || y >= config.size) {
        return false;
    }
    
    const { player } = gameState;
    const cell = gameState.maze[player.y][player.x];
    
    // Проверка возможности движения
    if (x === player.x - 1 && y === player.y) return !cell.left;
    if (x === player.x + 1 && y === player.y) return !cell.right;
    if (x === player.x && y === player.y - 1) return !cell.top;
    if (x === player.x && y === player.y + 1) return !cell.bottom;
    
    return false;
}

// Псевдо-случайное число для текстуры (одинаково каждый кадр)
function seed(x, y) {
    const n = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
    return n - Math.floor(n);
}

// Малая трава в клетке
function drawGrassCell(ctx, px, py, cellSize) {
    const step = Math.max(3, Math.floor(cellSize / 6));
    for (let gy = 0; gy < cellSize; gy += step) {
        for (let gx = 0; gx < cellSize; gx += step) {
            const sx = px + gx + (seed(px + gx, py + gy) - 0.5) * step;
            const sy = py + gy + (seed(px + gy, py + gx) - 0.5) * step;
            const len = 2 + seed(sx * 2, sy * 2) * 4;
            const angle = seed(sx, sy) * Math.PI * 0.4;
            ctx.strokeStyle = `hsl(${100 + seed(sx * 3, sy) * 30}, 45%, ${28 + seed(sy, sx) * 18}%)`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + Math.sin(angle) * len, sy - Math.cos(angle) * len);
            ctx.stroke();
        }
    }
}

// Сегмент стены — невысокий куст строго по линии, чтобы дороги лабиринта были видны
function drawBushSegment(ctx, x1, y1, x2, y2, cellSize) {
    const thick = Math.max(3, cellSize * 0.22);
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const steps = Math.max(3, Math.ceil(len / (cellSize * 0.4)));
    const greens = ['#1e4620', '#2d5a27', '#3d6b2e', '#2a4d23', '#356b28'];
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x1 + dx * t;
        const y = y1 + dy * t;
        const r = thick * (0.5 + seed(x, y) * 0.35);
        ctx.fillStyle = greens[Math.floor(seed(x * 7, y * 7) * greens.length)];
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fill();
    }
    ctx.strokeStyle = '#1a3d1a';
    ctx.lineWidth = 1;
    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const x = x1 + dx * t;
        const y = y1 + dy * t;
        const r = thick * (0.35 + seed(x + 1, y) * 0.25);
        ctx.beginPath();
        ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function drawMaze() {
    const config = DIFFICULTIES[gameState.currentDifficulty];
    const cellSize = config.cellSize;
    const { maze, player, exit } = gameState;
    const offsetY = PATH_STRIP * cellSize;
    const mazeW = config.size * cellSize;
    const mazeH = config.size * cellSize;
    const mx = SIDE_LEFT;

    // Фон
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // —— Слева: Тянь-Шань (силуэт гор) ——
    drawTianShan(ctx, 0, 0, SIDE_LEFT, canvas.height);

    // —— Справа сверху: флаг Кыргызстана (ваше фото) ——
    // Делаем флаг заметно крупнее
    const flagH = Math.min(150, canvas.height * 0.3);
    drawKyrgyzstanFlag(
        ctx,
        canvas.width - SIDE_RIGHT, // X
        0,                          // Y
        SIDE_RIGHT,                 // ширина
        flagH                       // высота
    );

    // —— Справа ниже: озеро Иссык-Куль (фото из assets/issyk-kul.png, вертикальная полоса) ——
    drawIssykKul(
        ctx,
        canvas.width - SIDE_RIGHT,
        flagH,
        SIDE_RIGHT,
        canvas.height - flagH
    );

    // —— Поле лабиринта: малая трава (со сдвигом mx) ——
    ctx.fillStyle = '#4a7c23';
    ctx.fillRect(mx, offsetY, mazeW, mazeH);
    for (let y = 0; y < config.size; y++) {
        for (let x = 0; x < config.size; x++) {
            drawGrassCell(ctx, mx + x * cellSize, offsetY + y * cellSize, cellSize);
        }
    }

    // —— Тропа сверху ——
    const pathH = PATH_STRIP * cellSize;
    ctx.fillStyle = '#5d4e37';
    const cx = mx + (exit.x + 0.5) * cellSize;
    const pathW = cellSize * 2.2;
    ctx.fillRect(cx - pathW / 2, 0, pathW, pathH + 4);
    ctx.strokeStyle = '#8b7355';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - pathW / 2, 0, pathW, pathH + 4);
    ctx.fillStyle = '#6b5b45';
    for (let i = 0; i < 5; i++) {
        const ox = cx - pathW / 2 + 8 + (i * (pathW - 16) / 4);
        ctx.beginPath();
        ctx.arc(ox, pathH / 2, 4, 0, Math.PI * 2);
        ctx.fill();
    }

    // —— Стены лабиринта — кусты ——
    for (let y = 0; y < config.size; y++) {
        for (let x = 0; x < config.size; x++) {
            const cell = maze[y][x];
            const px = mx + x * cellSize;
            const py = offsetY + y * cellSize;

            if (cell.top) drawBushSegment(ctx, px, py, px + cellSize, py, cellSize);
            if (cell.right) drawBushSegment(ctx, px + cellSize, py, px + cellSize, py + cellSize, cellSize);
            if (cell.bottom) drawBushSegment(ctx, px, py + cellSize, px + cellSize, py + cellSize, cellSize);
            if (cell.left) drawBushSegment(ctx, px, py, px, py + cellSize, cellSize);
        }
    }

    // —— Дом внизу по центру ——
    const houseY = offsetY + config.size * cellSize;
    const houseH = HOUSE_STRIP * cellSize;
    const houseCenterX = mx + (exit.x + 0.5) * cellSize;
    const houseW = Math.min(cellSize * 2.2, config.size * cellSize * 0.5);
    const houseX = houseCenterX - houseW / 2;

    ctx.fillStyle = '#4a4a4a';
    ctx.fillRect(houseX - 4, houseY + houseH - 12, houseW + 8, 14);
    ctx.fillStyle = '#8b4513';
    ctx.fillRect(houseX, houseY + houseH * 0.35, houseW, houseH * 0.55);
    ctx.strokeStyle = '#5d3a1a';
    ctx.lineWidth = 2;
    ctx.strokeRect(houseX, houseY + houseH * 0.35, houseW, houseH * 0.55);
    ctx.fillStyle = '#722f37';
    ctx.beginPath();
    ctx.moveTo(houseCenterX, houseY + 8);
    ctx.lineTo(houseX + houseW + 10, houseY + houseH * 0.38);
    ctx.lineTo(houseX - 10, houseY + houseH * 0.38);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#5a2529';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#3d2914';
    ctx.fillRect(houseCenterX - houseW * 0.15, houseY + houseH * 0.5, houseW * 0.3, houseH * 0.4);
    ctx.fillStyle = '#daa520';
    ctx.beginPath();
    ctx.arc(houseCenterX + houseW * 0.08, houseY + houseH * 0.68, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#87ceeb';
    ctx.fillRect(houseCenterX - houseW * 0.35, houseY + houseH * 0.45, houseW * 0.25, houseH * 0.2);
    ctx.strokeStyle = '#3d2914';
    ctx.lineWidth = 1;
    ctx.strokeRect(houseCenterX - houseW * 0.35, houseY + houseH * 0.45, houseW * 0.25, houseH * 0.2);

    // Клетка выхода — подсветка
    const exitPx = mx + exit.x * cellSize;
    const exitPy = offsetY + exit.y * cellSize;
    ctx.fillStyle = 'rgba(34, 139, 34, 0.4)';
    ctx.fillRect(exitPx + 2, exitPy + 2, cellSize - 4, cellSize - 4);

    // Игрок (цвет по выбранному персонажу: Актан — голубоватый, Акылай — красноватый)
    const playerX = mx + player.x * cellSize;
    const playerY = offsetY + player.y * cellSize;
    const isAkylai = gameState.character === 'akylai';
    const outerColor = isAkylai ? '#e74c3c' : '#5d9cec';
    const innerColor = isAkylai ? '#c0392b' : '#4a89dc';
    ctx.fillStyle = outerColor;
    ctx.beginPath();
    ctx.arc(playerX + cellSize / 2, playerY + cellSize / 2, cellSize * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = innerColor;
    ctx.beginPath();
    ctx.arc(playerX + cellSize / 2, playerY + cellSize / 2, cellSize * 0.25, 0, Math.PI * 2);
    ctx.fill();
}

function drawTianShan(ctx, x, y, w, h) {
    // Если есть ваше фото гор (image copy.png), используем его,
    // иначе рисуем прежний стилизованный вариант.
    if (imgTianShan.complete && imgTianShan.naturalWidth > 0) {
        const iw = imgTianShan.naturalWidth;
        const ih = imgTianShan.naturalHeight;
        if (iw > 0 && ih > 0) {
            // Масштабируем «cover» — заполняем всю левую полосу без искажений.
            const scale = Math.max(w / iw, h / ih);
            const drawW = iw * scale;
            const drawH = ih * scale;
            const dx = x + (w - drawW) / 2;
            const dy = y + (h - drawH) / 2;
            ctx.drawImage(imgTianShan, dx, dy, drawW, drawH);
            return;
        }
    }

    const cx = x + w / 2;
    const cy = y + h / 2;
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1a2f3d';
    ctx.beginPath();
    const pts = [];
    for (let i = 0; i <= 24; i++) {
        const t = i / 24;
        const angle = t * Math.PI * 1.6 - Math.PI * 0.3;
        const r = Math.min(w, h) * (0.35 + 0.2 * Math.sin(t * 8) + 0.08 * Math.sin(t * 24));
        pts.push([cx + Math.cos(angle) * r, cy + Math.sin(angle) * r * 0.7]);
    }
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#2c4a5e';
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = '#3d5a6e';
    ctx.beginPath();
    ctx.ellipse(cx, cy, w * 0.18, h * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.font = 'bold 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Тянь-Шань', x + w / 2, y + h - 8);
}

function drawKyrgyzstanFlag(ctx, x, y, w, h) {
    if (imgFlag.complete && imgFlag.naturalWidth > 0) {
        ctx.drawImage(imgFlag, x, y, w, h);
        return;
    }
    ctx.fillStyle = '#E8112D';
    ctx.fillRect(x, y, w, h);
    const cx = x + w / 2;
    const cy = y + h / 2;
    const sunR = Math.min(w, h) * 0.28;
    ctx.fillStyle = '#FFD700';
    ctx.beginPath();
    ctx.arc(cx, cy, sunR, 0, Math.PI * 2);
    ctx.fill();
    const rays = 40;
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = Math.max(1, w / 40);
    for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2 - Math.PI / 2;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * sunR * 0.6, cy + Math.sin(a) * sunR * 0.6);
        ctx.lineTo(cx + Math.cos(a) * sunR * 1.35, cy + Math.sin(a) * sunR * 1.35);
        ctx.stroke();
    }
    ctx.fillStyle = '#E8112D';
    ctx.beginPath();
    ctx.arc(cx, cy, sunR * 0.35, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFD700';
    ctx.lineWidth = 1;
    const r2 = sunR * 0.25;
    for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + Math.PI / 6;
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(a) * r2, cy + Math.sin(a) * r2);
        ctx.lineTo(cx - Math.cos(a) * r2, cy - Math.sin(a) * r2);
        ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Кыргызстан', x + w / 2, y + h - 4);
}

function drawIssykKul(ctx, x, y, w, h) {
    if (imgIssykKul.complete && imgIssykKul.naturalWidth > 0) {
        // Рисуем фото озера вертикально в правой полосе
        const iw = imgIssykKul.naturalWidth;
        const ih = imgIssykKul.naturalHeight;
        if (iw > 0 && ih > 0) {
            const scale = Math.min(w / ih, h / iw);
            const drawW = iw * scale;
            const drawH = ih * scale;

            ctx.save();
            // центрируем область и поворачиваем на 90 градусов
            ctx.translate(x + w / 2, y + h / 2);
            ctx.rotate(Math.PI / 2);
            ctx.drawImage(
                imgIssykKul,
                -drawW / 2,
                -drawH / 2,
                drawW,
                drawH
            );
            ctx.restore();
        }
        return;
    }
    const pad = 8;
    const lx = x + pad;
    const ly = y + pad;
    const lw = w - pad * 2;
    const lh = h - pad * 2;
    ctx.fillStyle = '#2d5a27';
    ctx.fillRect(x, y, w, h);
    ctx.fillStyle = '#1e88c7';
    ctx.beginPath();
    const midX = lx + lw / 2;
    const midY = ly + lh / 2;
    ctx.ellipse(midX, midY, lw * 0.42, lh * 0.45, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1565a0';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#42a5d5';
    ctx.beginPath();
    ctx.ellipse(midX, midY, lw * 0.35, lh * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = '9px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Иссык-Куль', x + w / 2, y + h - 6);
}

function checkWin() {
    const { player, exit } = gameState;
    if (player.x === exit.x && player.y === exit.y) {
        stopTimer();
        showWinScreen();
    }
}

function showWinScreen() {
    const elapsed = Date.now() - gameState.startTime;
    const minutes = Math.floor(elapsed / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);
    const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    
    document.getElementById('winTime').textContent = timeStr;
    document.getElementById('winMoves').textContent = gameState.moves;
    
    gameScreen.style.display = 'none';
    gameOverScreen.style.display = 'none';
    winScreen.style.display = 'block';
}

function updateUI() {
    document.getElementById('level').textContent = gameState.level;
    const movesEl = document.getElementById('moves');
    if (gameState.moveLimit != null) {
        movesEl.textContent = `${gameState.moves} / ${gameState.moveLimit}`;
        movesEl.classList.toggle('moves-over', gameState.moves > gameState.moveLimit);
        movesEl.classList.toggle('moves-warning', gameState.moves > gameState.moveLimit - 5 && gameState.moves <= gameState.moveLimit);
    } else {
        movesEl.textContent = gameState.moves;
    }
    const telEl = document.getElementById('teleportsLeft');
    if (telEl && gameState.teleportsLeft != null) {
        telEl.textContent = gameState.teleportsLeft;
    }
}

function startTimer() {
    stopTimer();
    gameState.timerInterval = setInterval(() => {
        const elapsed = Date.now() - gameState.startTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        const timeStr = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
        document.getElementById('timer').textContent = timeStr;
    }, 1000);
}

function stopTimer() {
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }
}
