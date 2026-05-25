// ============================================================
// 🍉 Watermelon Merge Game
// ============================================================

const { Engine, Render, Runner, Bodies, Body, Composite, Events, Vector } = Matter;

// --- Fruit Definitions ---
// Each fruit: [name, emoji, radius, color, points]
const FRUITS = [
  ["Cherry",      "🍒", 15, "#e74c3c", 1],
  ["Grape",       "🍇", 20, "#8e44ad", 3],
  ["Orange",      "🍊", 28, "#e67e22", 6],
  ["Lemon",       "🍋", 34, "#f1c40f", 10],
  ["Kiwi",        "🥝", 40, "#27ae60", 15],
  ["Apple",       "🍎", 48, "#c0392b", 21],
  ["Pear",        "🍐", 55, "#2ecc71", 28],
  ["Peach",       "🍑", 62, "#fd79a8", 36],
  ["Pineapple",   "🍍", 72, "#fdcb6e", 45],
  ["Watermelon",  "🍉", 85, "#00b894", 55],
];

// Only drop small fruits (first 5 types)
const MAX_DROP_INDEX = 4;

// --- Game State ---
let score = 0;
let gameOver = false;
let canDrop = true;
let dropCooldown = 500; // ms between drops
let currentFruitIndex = randomSmallFruit();
let nextFruitIndex = randomSmallFruit();
let pointerX = 0;
let dangerTimer = null;
const DANGER_DURATION = 2000; // 2 seconds above line = game over
const pendingMerges = [];

// --- Canvas & Sizing ---
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const dpr = window.devicePixelRatio || 1;

// Game world dimensions (logical pixels)
let W, H;
const WALL_THICKNESS = 20;
const CONTAINER_MARGIN = 10;

// The danger line Y position (above this = game over)
let DANGER_Y;

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";
  DANGER_Y = H * 0.18;
}
resize();
window.addEventListener("resize", resize);

// --- Matter.js Setup ---
const engine = Engine.create({
  gravity: { x: 0, y: 1.8 },
});

// Container walls
function createWalls() {
  const containerTop = H * 0.15;
  const containerLeft = CONTAINER_MARGIN;
  const containerRight = W - CONTAINER_MARGIN;
  const containerBottom = H - CONTAINER_MARGIN;

  const wallOptions = {
    isStatic: true,
    friction: 0.8,
    restitution: 0.1,
    render: { visible: false },
    label: "wall",
  };

  const floor = Bodies.rectangle(
    W / 2, containerBottom + WALL_THICKNESS / 2,
    W, WALL_THICKNESS, wallOptions
  );
  const leftWall = Bodies.rectangle(
    containerLeft - WALL_THICKNESS / 2, (containerTop + containerBottom) / 2,
    WALL_THICKNESS, containerBottom - containerTop + WALL_THICKNESS, wallOptions
  );
  const rightWall = Bodies.rectangle(
    containerRight + WALL_THICKNESS / 2, (containerTop + containerBottom) / 2,
    WALL_THICKNESS, containerBottom - containerTop + WALL_THICKNESS, wallOptions
  );

  Composite.add(engine.world, [floor, leftWall, rightWall]);
}
createWalls();

// --- Fruit Creation ---
function randomSmallFruit() {
  return Math.floor(Math.random() * (MAX_DROP_INDEX + 1));
}

function createFruit(x, y, typeIndex) {
  const [name, emoji, radius, color, points] = FRUITS[typeIndex];
  const body = Bodies.circle(x, y, radius, {
    restitution: 0.1,
    friction: 0.4,
    frictionAir: 0.01,
    density: 0.001,
    label: "fruit",
  });
  // Custom properties
  body.fruitType = typeIndex;
  body.fruitEmoji = emoji;
  body.fruitRadius = radius;
  body.fruitColor = color;
  body.fruitName = name;
  body.fruitPoints = points;
  body.isMerging = false;
  body.isFruit = true;
  body.createdAt = Date.now();
  return body;
}

// --- Drop Logic ---
function dropFruit() {
  if (!canDrop || gameOver) return;

  const dropX = Math.max(
    CONTAINER_MARGIN + FRUITS[currentFruitIndex][2] + 5,
    Math.min(pointerX, W - CONTAINER_MARGIN - FRUITS[currentFruitIndex][2] - 5)
  );
  const dropY = H * 0.12;

  const fruit = createFruit(dropX, dropY, currentFruitIndex);
  Composite.add(engine.world, fruit);

  // Advance to next fruit
  currentFruitIndex = nextFruitIndex;
  nextFruitIndex = randomSmallFruit();
  updateNextFruitDisplay();

  // Cooldown
  canDrop = false;
  setTimeout(() => { canDrop = true; }, dropCooldown);
}

// --- Collision / Merge Handling ---
Events.on(engine, "collisionStart", (event) => {
  for (const pair of event.pairs) {
    const a = pair.bodyA;
    const b = pair.bodyB;

    if (
      a.isFruit && b.isFruit &&
      a.fruitType === b.fruitType &&
      !a.isMerging && !b.isMerging &&
      a.fruitType < FRUITS.length - 1 // can't merge watermelons
    ) {
      a.isMerging = true;
      b.isMerging = true;
      pendingMerges.push([a, b]);
    }
  }
});

function processMerges() {
  while (pendingMerges.length > 0) {
    const [a, b] = pendingMerges.shift();

    // Double-check bodies still exist in the world
    if (!Composite.get(engine.world, a.id, "body") ||
        !Composite.get(engine.world, b.id, "body")) {
      continue;
    }

    const newType = a.fruitType + 1;
    const midX = (a.position.x + b.position.x) / 2;
    const midY = (a.position.y + b.position.y) / 2;

    // Remove old fruits
    Composite.remove(engine.world, a);
    Composite.remove(engine.world, b);

    // Create merged fruit
    const merged = createFruit(midX, midY, newType);
    Composite.add(engine.world, merged);

    // Score
    score += FRUITS[newType][4];
    updateScoreDisplay();

    // Burst effect
    spawnParticles(midX, midY, FRUITS[newType][3]);
  }
}

// --- Particles (merge effect) ---
const particles = [];

function spawnParticles(x, y, color) {
  for (let i = 0; i < 8; i++) {
    const angle = (Math.PI * 2 * i) / 8;
    particles.push({
      x, y,
      vx: Math.cos(angle) * (2 + Math.random() * 3),
      vy: Math.sin(angle) * (2 + Math.random() * 3),
      life: 1.0,
      color,
      size: 3 + Math.random() * 4,
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.1;
    p.life -= 0.03;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

// --- Danger / Game Over Detection ---
function checkDanger() {
  if (gameOver) return;

  const bodies = Composite.allBodies(engine.world);
  let anyAboveLine = false;

  for (const body of bodies) {
    if (!body.isFruit || body.isMerging) continue;
    // Grace period: ignore fruits that were just dropped (< 1s ago)
    if (Date.now() - body.createdAt < 1000) continue;
    if (body.position.y - body.fruitRadius < DANGER_Y) {
      anyAboveLine = true;
      break;
    }
  }

  if (anyAboveLine) {
    if (!dangerTimer) {
      dangerTimer = Date.now();
    } else if (Date.now() - dangerTimer > DANGER_DURATION) {
      triggerGameOver();
    }
  } else {
    dangerTimer = null;
  }
}

function triggerGameOver() {
  gameOver = true;
  document.getElementById("final-score").textContent = `Score: ${score}`;
  document.getElementById("game-over-screen").classList.remove("hidden");
}

function restartGame() {
  // Clear world
  const bodies = Composite.allBodies(engine.world);
  for (const b of bodies) {
    if (b.isFruit) Composite.remove(engine.world, b);
  }

  // Reset state
  score = 0;
  gameOver = false;
  canDrop = true;
  dangerTimer = null;
  pendingMerges.length = 0;
  particles.length = 0;
  currentFruitIndex = randomSmallFruit();
  nextFruitIndex = randomSmallFruit();

  updateScoreDisplay();
  updateNextFruitDisplay();
  document.getElementById("game-over-screen").classList.add("hidden");
}

// --- Input Handling ---
canvas.addEventListener("pointermove", (e) => {
  pointerX = e.clientX;
});

canvas.addEventListener("pointerdown", (e) => {
  pointerX = e.clientX;
  dropFruit();
});

document.getElementById("restart-btn").addEventListener("click", restartGame);

// Prevent context menu on long press
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// --- UI Updates ---
function updateScoreDisplay() {
  document.getElementById("score-display").textContent = `Score: ${score}`;
}

function updateNextFruitDisplay() {
  document.getElementById("next-fruit").textContent = `Next: ${FRUITS[nextFruitIndex][1]}`;
}
updateNextFruitDisplay();

// --- Rendering ---
function drawContainer() {
  const top = H * 0.15;
  const left = CONTAINER_MARGIN;
  const right = W - CONTAINER_MARGIN;
  const bottom = H - CONTAINER_MARGIN;

  // Container background
  ctx.fillStyle = "rgba(255, 255, 255, 0.03)";
  ctx.fillRect(left, top, right - left, bottom - top);

  // Container border
  ctx.strokeStyle = "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 2;
  ctx.strokeRect(left, top, right - left, bottom - top);

  // Danger line
  const dangerActive = dangerTimer !== null;
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = dangerActive
    ? `rgba(255, 80, 80, ${0.5 + Math.sin(Date.now() / 100) * 0.3})`
    : "rgba(255, 100, 100, 0.25)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(left, DANGER_Y);
  ctx.lineTo(right, DANGER_Y);
  ctx.stroke();
  ctx.setLineDash([]);
}

function drawPreview() {
  if (gameOver || !canDrop) return;

  const [, emoji, radius] = FRUITS[currentFruitIndex];
  const dropX = Math.max(
    CONTAINER_MARGIN + radius + 5,
    Math.min(pointerX || W / 2, W - CONTAINER_MARGIN - radius - 5)
  );
  const dropY = H * 0.12;

  // Guide line
  ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  ctx.beginPath();
  ctx.moveTo(dropX, dropY + radius);
  ctx.lineTo(dropX, H - CONTAINER_MARGIN);
  ctx.stroke();
  ctx.setLineDash([]);

  // Preview fruit (semi-transparent)
  ctx.globalAlpha = 0.6;
  drawFruitAt(dropX, dropY, currentFruitIndex);
  ctx.globalAlpha = 1.0;
}

function drawFruitAt(x, y, typeIndex) {
  const [, emoji, radius, color] = FRUITS[typeIndex];

  // Gradient circle
  const grad = ctx.createRadialGradient(x - radius * 0.3, y - radius * 0.3, radius * 0.1, x, y, radius);
  grad.addColorStop(0, lightenColor(color, 40));
  grad.addColorStop(1, color);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Subtle border
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Emoji
  const fontSize = Math.max(radius * 0.9, 12);
  ctx.font = `${fontSize}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(emoji, x, y + 1);
}

function drawFruits() {
  const bodies = Composite.allBodies(engine.world);
  for (const body of bodies) {
    if (!body.isFruit) continue;
    drawFruitAt(body.position.x, body.position.y, body.fruitType);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life;
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1.0;
}

// --- Color Utility ---
function lightenColor(hex, amount) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.min(255, (num >> 16) + amount);
  const g = Math.min(255, ((num >> 8) & 0x00FF) + amount);
  const b = Math.min(255, (num & 0x0000FF) + amount);
  return `rgb(${r},${g},${b})`;
}

// --- Game Loop ---
function gameLoop() {
  // Clear
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  // Background gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#1a0a2e");
  bgGrad.addColorStop(1, "#2d1b69");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Update physics
  if (!gameOver) {
    Engine.update(engine, 1000 / 60);
    processMerges();
    checkDanger();
    updateParticles();
  }

  // Draw
  drawContainer();
  drawPreview();
  drawFruits();
  drawParticles();

  requestAnimationFrame(gameLoop);
}

// --- Start ---
pointerX = W / 2;
gameLoop();
