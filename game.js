// ============================================================
// 🍉✨ Watermelon Merge Game — Cute Edition ✨🍉
// ============================================================

const { Engine, Render, Runner, Bodies, Body, Composite, Events, Vector } = Matter;

// --- Fruit Definitions ---
// [name, emoji, radius, baseColor, highlightColor, points, kawaiiBlush]
const FRUITS = [
  ["Cherry",      "🍒", 15, "#ff8a9e", "#ffb3c1", 1,   true],
  ["Grape",       "🍇", 20, "#c9a0dc", "#ddb8f0", 3,   true],
  ["Orange",      "🍊", 28, "#ffb347", "#ffd699", 6,   true],
  ["Lemon",       "🍋", 34, "#fff176", "#fff9c4", 10,  true],
  ["Kiwi",        "🥝", 40, "#a8e6cf", "#c8f7dc", 15,  true],
  ["Apple",       "🍎", 48, "#ff6b6b", "#ff9e9e", 21,  true],
  ["Pear",        "🍐", 55, "#88d8a8", "#b5ead7", 28,  true],
  ["Peach",       "🍑", 62, "#ffb5b5", "#ffd4d4", 36,  true],
  ["Pineapple",   "🍍", 72, "#ffd93d", "#ffe88a", 45,  true],
  ["Watermelon",  "🍉", 85, "#6bcb77", "#a8e6cf", 55,  true],
];

const MAX_DROP_INDEX = 4;

// --- Cute combo messages ---
const COMBO_MESSAGES = [
  ["nice~! ✨", "#ff9ff3"],
  ["cute!! 💕", "#f368e0"],
  ["amazing~! 🌟", "#ff6b6b"],
  ["so good!! 💖", "#c44dff"],
  ["WOW!! 🎉", "#ff9f43"],
  ["incredible~! 🌈", "#0abde3"],
  ["YAAAY!! 🥳", "#ff6348"],
  ["bestie!! 💗", "#e056a0"],
];

// --- Floating text system ---
const floatingTexts = [];

function spawnFloatingText(x, y, text, color) {
  floatingTexts.push({
    x, y,
    text,
    color,
    life: 1.0,
    vy: -2.5,
    scale: 0.3,
  });
}

// --- Background sparkles ---
const bgSparkles = [];
function initSparkles() {
  for (let i = 0; i < 30; i++) {
    bgSparkles.push({
      x: Math.random(),
      y: Math.random(),
      size: 1 + Math.random() * 2.5,
      speed: 0.2 + Math.random() * 0.5,
      phase: Math.random() * Math.PI * 2,
      twinkleSpeed: 0.02 + Math.random() * 0.03,
    });
  }
}
initSparkles();

// --- Background clouds ---
const bgClouds = [];
function initClouds() {
  for (let i = 0; i < 4; i++) {
    bgClouds.push({
      x: Math.random(),
      y: 0.02 + Math.random() * 0.12,
      width: 60 + Math.random() * 80,
      speed: 0.00005 + Math.random() * 0.00008,
    });
  }
}
initClouds();

// --- Game State ---
let score = 0;
let gameOver = false;
let canDrop = false; // starts false until walls are ready
let dropCooldown = 500;
let currentFruitIndex = randomSmallFruit();
let nextFruitIndex = randomSmallFruit();
let pointerX = 0;
let dangerTimer = null;
let mergeCombo = 0;
let lastMergeTime = 0;
const DANGER_DURATION = 2000;
const pendingMerges = [];
let gameTime = 0;

// --- Canvas & Sizing ---
const canvas = document.getElementById("game-canvas");
const ctx = canvas.getContext("2d");
const dpr = window.devicePixelRatio || 1;

let W, H;
const WALL_THICKNESS = 20;
const CONTAINER_MARGIN = 14;
let CONTAINER_BOTTOM_MARGIN = 14;
let CONTAINER_TOP;
let DANGER_Y;
let DROP_Y;

// Safe area detection - simplified and robust
function getSafeInsets() {
  const isStandalone = window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;

  if (isStandalone) {
    // Hardcoded safe values for modern iPhones in standalone mode
    // iPhone 16 Pro Dynamic Island = 59px, home indicator = 34px
    return { top: 59, bottom: 34 };
  }

  // In Safari, the browser handles safe areas — use minimal margins
  return { top: 0, bottom: 0 };
}

let wallBodies = [];

function resize() {
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + "px";
  canvas.style.height = H + "px";

  const insets = getSafeInsets();
  CONTAINER_BOTTOM_MARGIN = Math.max(20, insets.bottom + 20);
  CONTAINER_TOP = Math.max(56, insets.top + 56);
  DROP_Y = CONTAINER_TOP + 30;
  DANGER_Y = CONTAINER_TOP + 60;
}
resize();
window.addEventListener("resize", resize);

// --- Matter.js Setup ---
const engine = Engine.create({
  gravity: { x: 0, y: 1.8 },
});

function createWalls() {
  // Remove old walls if rebuilding
  for (const w of wallBodies) {
    Composite.remove(engine.world, w);
  }

  const containerTop = CONTAINER_TOP;
  const containerLeft = CONTAINER_MARGIN;
  const containerRight = W - CONTAINER_MARGIN;
  const containerBottom = H - CONTAINER_BOTTOM_MARGIN;
  const wallOptions = {
    isStatic: true,
    friction: 0.8,
    restitution: 0.05,
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

  wallBodies = [floor, leftWall, rightWall];
  Composite.add(engine.world, wallBodies);
}
// Defer wall creation to ensure layout has settled
setTimeout(() => { createWalls(); canDrop = true; }, 100);

// --- Fruit Creation ---
function randomSmallFruit() {
  return Math.floor(Math.random() * (MAX_DROP_INDEX + 1));
}

function createFruit(x, y, typeIndex) {
  const [name, emoji, radius, color, highlight, points] = FRUITS[typeIndex];
  const body = Bodies.circle(x, y, radius, {
    restitution: 0.05,
    friction: 0.5,
    frictionAir: 0.01,
    density: 0.001,
    label: "fruit",
  });
  body.fruitType = typeIndex;
  body.fruitEmoji = emoji;
  body.fruitRadius = radius;
  body.fruitColor = color;
  body.fruitHighlight = highlight;
  body.fruitName = name;
  body.fruitPoints = points;
  body.isMerging = false;
  body.isFruit = true;
  body.createdAt = Date.now();
  body.squish = 1.0; // for squish animation
  body.squishVel = 0;
  return body;
}

// --- Drop Logic ---
function dropFruit() {
  if (!canDrop || gameOver) return;

  const dropX = Math.max(
    CONTAINER_MARGIN + FRUITS[currentFruitIndex][2] + 5,
    Math.min(pointerX, W - CONTAINER_MARGIN - FRUITS[currentFruitIndex][2] - 5)
  );
  const dropY = DROP_Y;

  const fruit = createFruit(dropX, dropY, currentFruitIndex);
  Composite.add(engine.world, fruit);

  currentFruitIndex = nextFruitIndex;
  nextFruitIndex = randomSmallFruit();
  updateNextFruitDisplay();

  canDrop = false;
  setTimeout(() => { canDrop = true; }, dropCooldown);
}

// --- Collision / Merge Handling ---
Events.on(engine, "collisionStart", (event) => {
  for (const pair of event.pairs) {
    const a = pair.bodyA;
    const b = pair.bodyB;

    // Squish effect on any fruit collision
    if (a.isFruit && !a.isMerging) { a.squish = 0.75; a.squishVel = 0.08; }
    if (b.isFruit && !b.isMerging) { b.squish = 0.75; b.squishVel = 0.08; }

    if (
      a.isFruit && b.isFruit &&
      a.fruitType === b.fruitType &&
      !a.isMerging && !b.isMerging &&
      a.fruitType < FRUITS.length - 1
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

    if (!Composite.get(engine.world, a.id, "body") ||
        !Composite.get(engine.world, b.id, "body")) {
      continue;
    }

    const newType = a.fruitType + 1;
    const midX = (a.position.x + b.position.x) / 2;
    const midY = (a.position.y + b.position.y) / 2;

    Composite.remove(engine.world, a);
    Composite.remove(engine.world, b);

    const merged = createFruit(midX, midY, newType);
    merged.squish = 0.5; // spawn squished, will bounce out
    merged.squishVel = 0.12;
    Composite.add(engine.world, merged);

    score += FRUITS[newType][5];
    updateScoreDisplay();

    // Combo tracking
    const now = Date.now();
    if (now - lastMergeTime < 1500) {
      mergeCombo++;
    } else {
      mergeCombo = 0;
    }
    lastMergeTime = now;

    // Spawn cute particles (hearts and stars!)
    spawnCuteParticles(midX, midY, FRUITS[newType][3]);

    // Floating combo text
    if (mergeCombo > 0 || newType >= 5) {
      const msgIdx = Math.min(mergeCombo, COMBO_MESSAGES.length - 1);
      const [msg, msgColor] = COMBO_MESSAGES[msgIdx];
      spawnFloatingText(midX, midY - 30, msg, msgColor);
    }

    // Big celebration for pineapple+ merges
    if (newType >= 8) {
      for (let i = 0; i < 3; i++) {
        setTimeout(() => spawnCuteParticles(
          midX + (Math.random() - 0.5) * 60,
          midY + (Math.random() - 0.5) * 60,
          FRUITS[newType][3]
        ), i * 100);
      }
      spawnFloatingText(midX, midY - 60, "🎉🎉🎉", "#ffd700");
    }
  }
}

// --- Cute Particles (hearts, stars, sparkles!) ---
const particles = [];
const PARTICLE_SHAPES = ["heart", "star", "circle", "sparkle"];

function spawnCuteParticles(x, y, color) {
  const count = 12;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
    const speed = 2 + Math.random() * 4;
    particles.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 2,
      life: 1.0,
      color,
      size: 3 + Math.random() * 6,
      shape: PARTICLE_SHAPES[Math.floor(Math.random() * PARTICLE_SHAPES.length)],
      rotation: Math.random() * Math.PI * 2,
      rotSpeed: (Math.random() - 0.5) * 0.15,
    });
  }
}

function updateParticles() {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.08;
    p.vx *= 0.98;
    p.life -= 0.025;
    p.rotation += p.rotSpeed;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

function drawHeart(x, y, size) {
  ctx.beginPath();
  const s = size * 0.6;
  ctx.moveTo(x, y + s * 0.3);
  ctx.bezierCurveTo(x, y - s * 0.3, x - s, y - s * 0.3, x - s, y + s * 0.1);
  ctx.bezierCurveTo(x - s, y + s * 0.6, x, y + s, x, y + s);
  ctx.bezierCurveTo(x, y + s, x + s, y + s * 0.6, x + s, y + s * 0.1);
  ctx.bezierCurveTo(x + s, y - s * 0.3, x, y - s * 0.3, x, y + s * 0.3);
  ctx.fill();
}

function drawStar(x, y, size) {
  const spikes = 5;
  const outerR = size;
  const innerR = size * 0.45;
  ctx.beginPath();
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (Math.PI * i) / spikes - Math.PI / 2;
    const px = x + Math.cos(angle) * r;
    const py = y + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
}

function drawSparkle(x, y, size) {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const angle = (Math.PI / 2) * i;
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * size, y + Math.sin(angle) * size);
  }
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

// --- Danger / Game Over Detection ---
function checkDanger() {
  if (gameOver) return;

  const bodies = Composite.allBodies(engine.world);
  let anyAboveLine = false;

  for (const body of bodies) {
    if (!body.isFruit || body.isMerging) continue;
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
  document.getElementById("final-score").textContent = `✨ ${score} points ✨`;
  document.getElementById("game-over-screen").classList.remove("hidden");
}

function restartGame() {
  const bodies = Composite.allBodies(engine.world);
  for (const b of bodies) {
    if (b.isFruit) Composite.remove(engine.world, b);
  }

  score = 0;
  gameOver = false;
  canDrop = true;
  dangerTimer = null;
  mergeCombo = 0;
  pendingMerges.length = 0;
  particles.length = 0;
  floatingTexts.length = 0;
  currentFruitIndex = randomSmallFruit();
  nextFruitIndex = randomSmallFruit();

  resize();
  createWalls();
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
canvas.addEventListener("contextmenu", (e) => e.preventDefault());

// --- UI Updates ---
function updateScoreDisplay() {
  document.getElementById("score-display").textContent = `✨ ${score}`;
}

function updateNextFruitDisplay() {
  document.getElementById("next-fruit").textContent = `next~ ${FRUITS[nextFruitIndex][1]}`;
}
updateNextFruitDisplay();

// --- Rendering ---
function drawBackground() {
  // Soft pastel gradient
  const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
  bgGrad.addColorStop(0, "#e8daef");
  bgGrad.addColorStop(0.3, "#fce4ec");
  bgGrad.addColorStop(0.7, "#fff3e0");
  bgGrad.addColorStop(1, "#fce4ec");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, W, H);

  // Draw clouds
  for (const cloud of bgClouds) {
    cloud.x = (cloud.x + cloud.speed) % 1.2;
    const cx = cloud.x * W - cloud.width * 0.1;
    const cy = cloud.y * H;
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.beginPath();
    ctx.ellipse(cx, cy, cloud.width * 0.5, 14, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx - cloud.width * 0.2, cy - 6, cloud.width * 0.3, 12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(cx + cloud.width * 0.2, cy - 4, cloud.width * 0.25, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // Twinkling sparkles
  for (const s of bgSparkles) {
    s.phase += s.twinkleSpeed;
    const alpha = 0.15 + Math.sin(s.phase) * 0.15;
    const sx = s.x * W;
    const sy = s.y * H;
    ctx.fillStyle = `rgba(255, 200, 255, ${alpha})`;
    drawStar(sx, sy, s.size);
  }
}

function drawContainer() {
  const top = CONTAINER_TOP;
  const left = CONTAINER_MARGIN;
  const right = W - CONTAINER_MARGIN;
  const bottom = H - CONTAINER_BOTTOM_MARGIN;  const radius = 18;

  // Container background with soft fill
  ctx.fillStyle = "rgba(255, 255, 255, 0.25)";
  ctx.beginPath();
  ctx.moveTo(left + radius, top);
  ctx.lineTo(right - radius, top);
  ctx.quadraticCurveTo(right, top, right, top + radius);
  ctx.lineTo(right, bottom - radius);
  ctx.quadraticCurveTo(right, bottom, right - radius, bottom);
  ctx.lineTo(left + radius, bottom);
  ctx.quadraticCurveTo(left, bottom, left, bottom - radius);
  ctx.lineTo(left, top + radius);
  ctx.quadraticCurveTo(left, top, left + radius, top);
  ctx.closePath();
  ctx.fill();

  // Cute border with glow
  ctx.strokeStyle = "rgba(255, 182, 193, 0.6)";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Soft inner glow
  ctx.shadowColor = "rgba(255, 182, 193, 0.3)";
  ctx.shadowBlur = 15;
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Danger line — cute dashes
  const dangerActive = dangerTimer !== null;
  ctx.setLineDash([6, 8]);
  if (dangerActive) {
    const pulse = 0.4 + Math.sin(Date.now() / 80) * 0.3;
    ctx.strokeStyle = `rgba(255, 105, 135, ${pulse})`;
    ctx.lineWidth = 3;
  } else {
    ctx.strokeStyle = "rgba(255, 150, 180, 0.2)";
    ctx.lineWidth = 2;
  }
  ctx.beginPath();
  ctx.moveTo(left + 10, DANGER_Y);
  ctx.lineTo(right - 10, DANGER_Y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Danger line decorations
  if (!dangerActive) {
    ctx.fillStyle = "rgba(255, 150, 180, 0.25)";
    ctx.font = "10px serif";
    ctx.textAlign = "center";
    ctx.fillText("~ ~ ~", W / 2, DANGER_Y - 5);
  }
}

function drawPreview() {
  if (gameOver || !canDrop) return;

  const [, emoji, radius] = FRUITS[currentFruitIndex];
  const dropX = Math.max(
    CONTAINER_MARGIN + radius + 5,
    Math.min(pointerX || W / 2, W - CONTAINER_MARGIN - radius - 5)
  );
  const dropY = DROP_Y;
  // Cute dotted guide line
  ctx.strokeStyle = "rgba(255, 182, 193, 0.3)";
  ctx.lineWidth = 1.5;
  ctx.setLineDash([3, 6]);
  ctx.beginPath();
  ctx.moveTo(dropX, dropY + radius);
  ctx.lineTo(dropX, H - CONTAINER_BOTTOM_MARGIN);
  ctx.stroke();
  ctx.setLineDash([]);

  // Preview fruit — bouncy hover
  const hover = Math.sin(gameTime * 3) * 3;
  ctx.globalAlpha = 0.55;
  drawFruitAt(dropX, dropY + hover, currentFruitIndex, 1.0);
  ctx.globalAlpha = 1.0;
}

function drawKawaiiFace(x, y, radius, squishX, squishY) {
  const s = radius * 0.18;

  // Eyes — big sparkly dots
  const eyeSpacing = radius * 0.28;
  const eyeY = y - radius * 0.08;

  // Eye whites
  ctx.fillStyle = "rgba(40, 20, 60, 0.8)";
  ctx.beginPath();
  ctx.ellipse(x - eyeSpacing, eyeY, s * 0.55 * squishX, s * 0.65 * squishY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + eyeSpacing, eyeY, s * 0.55 * squishX, s * 0.65 * squishY, 0, 0, Math.PI * 2);
  ctx.fill();

  // Eye sparkles
  ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
  ctx.beginPath();
  ctx.arc(x - eyeSpacing - s * 0.12, eyeY - s * 0.18, s * 0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + eyeSpacing - s * 0.12, eyeY - s * 0.18, s * 0.18, 0, Math.PI * 2);
  ctx.fill();

  // Cute little mouth — happy smile
  ctx.strokeStyle = "rgba(40, 20, 60, 0.5)";
  ctx.lineWidth = Math.max(1, s * 0.15);
  ctx.lineCap = "round";
  ctx.beginPath();
  const mouthY = y + radius * 0.15;
  const mouthW = radius * 0.16;
  ctx.arc(x, mouthY - radius * 0.06, mouthW, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.stroke();

  // Blush cheeks
  ctx.fillStyle = "rgba(255, 150, 180, 0.35)";
  ctx.beginPath();
  ctx.ellipse(x - radius * 0.38, y + radius * 0.08, s * 0.6, s * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(x + radius * 0.38, y + radius * 0.08, s * 0.6, s * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawFruitAt(x, y, typeIndex, squish) {
  const [, emoji, radius, color, highlight] = FRUITS[typeIndex];
  squish = squish || 1.0;

  // Squish transform
  const squishX = 1 + (1 - squish) * 0.5;
  const squishY = squish;

  ctx.save();
  ctx.translate(x, y);
  ctx.scale(squishX, squishY);
  ctx.translate(-x, -y);

  // Soft shadow under fruit
  ctx.fillStyle = "rgba(0, 0, 0, 0.06)";
  ctx.beginPath();
  ctx.ellipse(x + 2, y + radius * 0.15, radius * 0.9, radius * 0.9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main body — soft gradient
  const grad = ctx.createRadialGradient(
    x - radius * 0.3, y - radius * 0.35, radius * 0.05,
    x, y, radius
  );
  grad.addColorStop(0, highlight);
  grad.addColorStop(0.7, color);
  grad.addColorStop(1, darkenColor(color, 20));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  // Shiny highlight
  ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
  ctx.beginPath();
  ctx.ellipse(x - radius * 0.25, y - radius * 0.35, radius * 0.35, radius * 0.22, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // Kawaii face!
  if (radius >= 15) {
    drawKawaiiFace(x, y, radius, squishX, squishY);
  }

  ctx.restore();
}

function drawFruits() {
  const bodies = Composite.allBodies(engine.world);
  for (const body of bodies) {
    if (!body.isFruit) continue;

    // Update squish animation
    if (body.squish < 1.0) {
      body.squish += body.squishVel;
      body.squishVel *= 0.85;
      if (Math.abs(body.squish - 1.0) < 0.01) {
        body.squish = 1.0;
      }
    }

    drawFruitAt(body.position.x, body.position.y, body.fruitType, body.squish);
  }
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.globalAlpha = p.life * 0.8;
    ctx.fillStyle = p.color;
    ctx.strokeStyle = p.color;

    switch (p.shape) {
      case "heart":
        drawHeart(0, 0, p.size);
        break;
      case "star":
        drawStar(0, 0, p.size);
        break;
      case "sparkle":
        drawSparkle(0, 0, p.size);
        break;
      default:
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.5, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
  }
  ctx.globalAlpha = 1.0;
}

function drawFloatingTexts() {
  for (let i = floatingTexts.length - 1; i >= 0; i--) {
    const ft = floatingTexts[i];
    ft.y += ft.vy;
    ft.vy *= 0.97;
    ft.life -= 0.018;

    // Scale in quickly, then hold
    if (ft.scale < 1) ft.scale = Math.min(1, ft.scale + 0.15);

    if (ft.life <= 0) {
      floatingTexts.splice(i, 1);
      continue;
    }

    ctx.save();
    ctx.globalAlpha = Math.min(1, ft.life * 2);
    ctx.translate(ft.x, ft.y);
    ctx.scale(ft.scale, ft.scale);
    ctx.font = "bold 20px 'Nunito', sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    // Text outline
    ctx.strokeStyle = "rgba(255,255,255,0.8)";
    ctx.lineWidth = 4;
    ctx.strokeText(ft.text, 0, 0);

    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, 0, 0);
    ctx.restore();
  }
  ctx.globalAlpha = 1.0;
}

// --- Color Utilities ---
function darkenColor(hex, amount) {
  const num = parseInt(hex.replace("#", ""), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0x00FF) - amount);
  const b = Math.max(0, (num & 0x0000FF) - amount);
  return `rgb(${r},${g},${b})`;
}

// --- Game Loop ---
function gameLoop() {
  gameTime += 0.016;

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  drawBackground();

  if (!gameOver) {
    Engine.update(engine, 1000 / 60);
    processMerges();
    checkDanger();
    updateParticles();
  }

  drawContainer();
  drawPreview();
  drawFruits();
  drawParticles();
  drawFloatingTexts();

  requestAnimationFrame(gameLoop);
}

// --- Start ---
pointerX = W / 2;
gameLoop();
