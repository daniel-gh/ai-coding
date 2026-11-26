'use strict';

// ===== 設定 =====
const W = 480;
const H = 640;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

// 高解析螢幕（手機）上讓畫面更銳利：實際像素放大，邏輯座標仍是 W×H
const dpr = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = W * dpr;
canvas.height = H * dpr;
ctx.scale(dpr, dpr);

// ===== 音效（Web Audio API 合成，不使用外部檔案）=====
let audioCtx = null;
let muted = false;
try {
  muted = localStorage.getItem('breakout-muted') === '1';
} catch (e) { /* 忽略 */ }

// 瀏覽器要求使用者操作後才能啟動音訊，所以在第一次按鍵/點擊時才建立
function initAudio() {
  if (!audioCtx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    audioCtx = new AC();
  }
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

// 播放一個音：頻率 freq（可滑到 freqEnd）、長度 dur 秒
function beep(freq, dur, type = 'square', vol = 0.08, freqEnd = freq, delay = 0) {
  if (muted || !audioCtx) return;
  const t0 = audioCtx.currentTime + delay;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(freqEnd, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

const sfx = {
  powerup: () => beep(600, 0.15, 'triangle', 0.1, 1200),
  launch: () => beep(440, 0.12, 'triangle', 0.1, 880),
  wall: () => beep(180, 0.05, 'square', 0.05),
  paddle: () => beep(280, 0.08, 'square', 0.08),
  // 越上層的磚塊音越高
  brick: (score) => beep(300 + score * 6, 0.09, 'square', 0.07),
  lose: () => beep(400, 0.5, 'sawtooth', 0.09, 80),
  clear: () => [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.15, 'triangle', 0.1, f, i * 0.12)),
  gameover: () => [392, 330, 262, 196].forEach((f, i) => beep(f, 0.25, 'sawtooth', 0.08, f, i * 0.22)),
};

// ===== 擋板 =====
const paddle = {
  w: 80,
  h: 14,
  x: (W - 80) / 2,
  y: H - 40,
  speed: 480, // 鍵盤移動速度 (px/秒)
  flash: 0, // 擊中閃爍剩餘時間（秒）
};

// ===== 球 =====
const BASE_SPEED = 320; // px/秒
const MAX_SPEED = 560;
const MIN_VY_RATIO = 0.3; // 垂直速度至少佔總速度的比例，避免水平來回
const BALL_R = 7;
const MAX_BALLS = 6;
let balls = []; // 每顆球：{ r, x, y, vx, vy, stuck }；stuck 表示發射前黏在擋板上

function newBall(x, y, vx = 0, vy = 0, stuck = false) {
  return { r: BALL_R, x, y, vx, vy, stuck };
}

// ===== 道具 =====
const PADDLE_W = 80;
const WIDE_W = 130;
const DROP_CHANCE = 0.15;
const POWER_TYPES = [
  { type: 'wide', label: '寬', color: '#5cdbd3' },
  { type: 'multi', label: '多', color: '#ffd666' },
  { type: 'slow', label: '慢', color: '#b37feb' },
];
let powerups = []; // 掉落中的道具
const effects = { wide: 0, slow: 0 }; // 剩餘秒數

function setPaddleWidth(w) {
  const center = paddle.x + paddle.w / 2;
  paddle.w = w;
  paddle.x = Math.max(0, Math.min(W - w, center - w / 2));
}

function clearEffects() {
  effects.wide = 0;
  effects.slow = 0;
  setPaddleWidth(PADDLE_W);
}

function maybeDrop(b) {
  if (Math.random() >= DROP_CHANCE) return;
  const t = POWER_TYPES[Math.floor(Math.random() * POWER_TYPES.length)];
  powerups.push({ ...t, x: b.x + b.w / 2, y: b.y + b.h / 2, w: 28, h: 18 });
}

function applyPowerup(type) {
  sfx.powerup();
  if (type === 'wide') {
    effects.wide = 10;
    setPaddleWidth(WIDE_W);
  } else if (type === 'slow') {
    effects.slow = 8;
  } else if (type === 'multi') {
    // 以場上第一顆飛行中的球為基準，再多分出兩顆（左右各偏約 20 度）
    const src = balls.find((b) => !b.stuck);
    if (!src) return;
    for (const rot of [-0.35, 0.35]) {
      if (balls.length >= MAX_BALLS) break;
      const c = Math.cos(rot);
      const s = Math.sin(rot);
      balls.push(newBall(src.x, src.y, src.vx * c - src.vy * s, src.vx * s + src.vy * c));
    }
  }
}

function updateEffects(dt) {
  if (effects.slow > 0) effects.slow = Math.max(0, effects.slow - dt);
  if (effects.wide > 0) {
    effects.wide = Math.max(0, effects.wide - dt);
    if (effects.wide === 0) setPaddleWidth(PADDLE_W);
  }
}

function updatePowerups(dt) {
  for (const p of powerups) {
    p.y += 140 * dt;
    const hitPaddle =
      p.x + p.w / 2 > paddle.x && p.x - p.w / 2 < paddle.x + paddle.w &&
      p.y + p.h / 2 > paddle.y && p.y - p.h / 2 < paddle.y + paddle.h;
    if (hitPaddle) {
      applyPowerup(p.type);
      p.dead = true;
    } else if (p.y - p.h / 2 > H) {
      p.dead = true;
    }
  }
  powerups = powerups.filter((p) => !p.dead);
}

const START_LIVES = 3;
let lives = START_LIVES;
let score = 0;
let level = 1;

// 最高分存 localStorage；隱私模式或被封鎖時讀寫可能丟例外，所以包 try/catch
const HS_KEY = 'breakout-high-score';
let highScore = 0;
try {
  highScore = Number(localStorage.getItem(HS_KEY)) || 0;
} catch (e) { /* 沒有儲存也能玩 */ }

function addScore(n) {
  score += n;
  if (score > highScore) {
    highScore = score;
    try {
      localStorage.setItem(HS_KEY, String(highScore));
    } catch (e) { /* 忽略 */ }
  }
}

// ===== 粒子與閃爍 =====
let particles = [];

function spawnParticles(x, y, color) {
  for (let i = 0; i < 12; i++) {
    const a = Math.random() * Math.PI * 2;
    const s = 60 + Math.random() * 140;
    particles.push({
      x,
      y,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      life: 0.5 + Math.random() * 0.3,
      maxLife: 0.8,
      color,
    });
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 400 * dt; // 重力
    p.life -= dt;
  }
  particles = particles.filter((p) => p.life > 0);
}

// 遊戲狀態：ready（球在擋板上）/ playing / paused / gameover / levelclear
let state = 'ready';

// 每過一關速度增加 8%，有上限；減速道具生效時降為 65%
function ballSpeed() {
  const base = Math.min(MAX_SPEED, BASE_SPEED * (1 + 0.08 * (level - 1)));
  return effects.slow > 0 ? base * 0.65 : base;
}

// 回到「球黏在擋板上」的待發射狀態，同時清掉所有道具與效果
function resetBall() {
  clearEffects();
  powerups = [];
  balls = [newBall(paddle.x + paddle.w / 2, paddle.y - BALL_R, 0, 0, true)];
  state = 'ready';
}

function launchBall() {
  const ball = balls[0];
  ball.stuck = false;
  state = 'playing';
  // 向上發射，帶一點隨機左右偏角（約 ±25 度）
  const angle = (Math.random() - 0.5) * (Math.PI * 5 / 18);
  ball.vx = ballSpeed() * Math.sin(angle);
  ball.vy = -ballSpeed() * Math.cos(angle);
}

// 掉光所有球：扣一命，沒命了就 Game Over
function loseLife() {
  lives--;
  if (lives <= 0) {
    lives = 0;
    powerups = [];
    state = 'gameover';
    sfx.gameover();
  } else {
    sfx.lose();
    resetBall();
  }
}

// 將球速校正為目前速度，並確保垂直分量不會太小
function normalizeBall(ball) {
  const speed = ballSpeed();
  const minVy = speed * MIN_VY_RATIO;
  let vy = ball.vy;
  if (Math.abs(vy) < minVy) vy = (vy < 0 ? -1 : 1) * minVy;
  const vxMag = Math.sqrt(Math.max(0, speed * speed - vy * vy));
  ball.vx = (ball.vx < 0 ? -1 : 1) * vxMag;
  ball.vy = vy;
}

// 主要操作（空白鍵 / 點擊 / 觸控）：依狀態決定行為
function primaryAction() {
  if (state === 'ready') {
    launchBall();
    sfx.launch();
  } else if (state === 'paused') {
    togglePause(); // 手機沒有 P 鍵，點一下就能繼續
  } else if (state === 'levelclear') {
    level++;
    createBricks();
    resetBall();
  } else if (state === 'gameover') {
    restartGame();
  }
}

function togglePause() {
  if (state === 'playing') state = 'paused';
  else if (state === 'paused') state = 'playing';
}

function restartGame() {
  lives = START_LIVES;
  score = 0;
  level = 1;
  particles = [];
  createBricks();
  resetBall();
}

// ===== 磚塊 =====
const BRICK_ROWS = 8;
const BRICK_COLS = 10;
const BRICK_GAP = 4;
const BRICK_MARGIN_X = 15;
const BRICK_TOP = 60;
const BRICK_H = 16;
const BRICK_W = (W - BRICK_MARGIN_X * 2 - BRICK_GAP * (BRICK_COLS - 1)) / BRICK_COLS;

// 由上到下每一列的顏色；越上面分數越高
const ROW_COLORS = ['#ff4d6d', '#ff7a45', '#ffa940', '#ffd666', '#95de64', '#5cdbd3', '#69b1ff', '#b37feb'];
const ROW_SCORES = [80, 70, 60, 50, 40, 30, 20, 10];

let bricks = [];

// 各關配置：回傳 true 代表該位置有磚塊（依關卡循環）
const LEVEL_PATTERNS = [
  () => true, // 全滿
  (row, col) => (row + col) % 2 === 0, // 棋盤
  (row, col) => col >= row / 2 && col < BRICK_COLS - row / 2, // 倒三角
  (row) => row % 2 === 0, // 間隔列
];

function createBricks() {
  bricks = [];
  const pattern = LEVEL_PATTERNS[(level - 1) % LEVEL_PATTERNS.length];
  for (let row = 0; row < BRICK_ROWS; row++) {
    for (let col = 0; col < BRICK_COLS; col++) {
      if (!pattern(row, col)) continue;
      bricks.push({
        x: BRICK_MARGIN_X + col * (BRICK_W + BRICK_GAP),
        y: BRICK_TOP + row * (BRICK_H + BRICK_GAP),
        w: BRICK_W,
        h: BRICK_H,
        color: ROW_COLORS[row],
        score: ROW_SCORES[row],
        alive: true,
      });
    }
  }
}

createBricks();
resetBall();

// ===== 輸入 =====
const keys = { left: false, right: false };

function setKey(e, down) {
  if (down) initAudio();
  switch (e.code) {
    case 'KeyM':
      if (down && !e.repeat) {
        muted = !muted;
        try {
          localStorage.setItem('breakout-muted', muted ? '1' : '0');
        } catch (err) { /* 忽略 */ }
      }
      break;
    case 'Space':
      if (down && !e.repeat) primaryAction();
      e.preventDefault();
      break;
    case 'KeyP':
      if (down && !e.repeat) togglePause();
      break;
    case 'ArrowLeft':
    case 'KeyA':
      keys.left = down;
      e.preventDefault();
      break;
    case 'ArrowRight':
    case 'KeyD':
      keys.right = down;
      e.preventDefault();
      break;
  }
}
window.addEventListener('keydown', (e) => setKey(e, true));
window.addEventListener('keyup', (e) => setKey(e, false));

// 將螢幕座標轉成 canvas 邏輯座標，並讓擋板中心對齊指標
function movePaddleTo(clientX) {
  const rect = canvas.getBoundingClientRect();
  const x = ((clientX - rect.left) / rect.width) * W;
  paddle.x = x - paddle.w / 2;
}

// Pointer Events 同時涵蓋滑鼠與觸控（觸控需按住拖曳）
canvas.addEventListener('pointermove', (e) => movePaddleTo(e.clientX));
canvas.addEventListener('pointerdown', (e) => {
  initAudio();
  canvas.setPointerCapture(e.pointerId);
  movePaddleTo(e.clientX);
  primaryAction(); // 點擊 / 輕觸：發射、下一關或重新開始
});

// 切到別的分頁或視窗時自動暫停（手機切 App 也適用）
function autoPause() {
  if (state === 'playing') state = 'paused';
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) autoPause();
});
window.addEventListener('blur', autoPause);

// ===== 遊戲迴圈 =====
let lastTime = 0;

function update(dt) {
  // 暫停時特效也凍結；其他狀態（含過關、Game Over）讓粒子繼續飄完
  if (state !== 'paused') {
    updateParticles(dt);
    paddle.flash = Math.max(0, paddle.flash - dt);
  }

  if (state !== 'ready' && state !== 'playing') return;

  if (keys.left) paddle.x -= paddle.speed * dt;
  if (keys.right) paddle.x += paddle.speed * dt;
  // 限制在邊界內
  paddle.x = Math.max(0, Math.min(W - paddle.w, paddle.x));

  // 分成多個小步驟，避免球速快或畫面卡頓時穿透磚塊/擋板
  const STEPS = 4;
  for (let i = 0; i < STEPS; i++) {
    for (const b of balls) updateBall(b, dt / STEPS);
  }

  if (state === 'playing') {
    updateEffects(dt);
    updatePowerups(dt);
  }

  // 清光磚塊：過關
  if (bricks.every((b) => !b.alive)) {
    state = 'levelclear';
    powerups = [];
    sfx.clear();
    return;
  }

  // 掉出底部的球移除；全部掉光才扣命
  balls = balls.filter((b) => b.stuck || b.y - b.r <= H);
  if (balls.length === 0) loseLife();
}

// 球 vs 擋板：依擊中位置決定反射角（中間垂直、邊緣最大 60 度）
function collidePaddle(ball) {
  if (ball.vy <= 0) return; // 只在球往下時判斷
  const withinX = ball.x + ball.r > paddle.x && ball.x - ball.r < paddle.x + paddle.w;
  const withinY = ball.y + ball.r >= paddle.y && ball.y - ball.r <= paddle.y + paddle.h;
  if (!withinX || !withinY) return;

  const hit = (ball.x - (paddle.x + paddle.w / 2)) / (paddle.w / 2); // -1 ~ 1
  const clamped = Math.max(-1, Math.min(1, hit));
  const angle = clamped * (Math.PI / 3);
  ball.vx = ballSpeed() * Math.sin(angle);
  ball.vy = -ballSpeed() * Math.cos(angle);
  ball.y = paddle.y - ball.r; // 推出重疊區
  paddle.flash = 0.15; // 擊中時擋板閃一下
  sfx.paddle();
}

// 球 vs 磚塊：圓形對矩形，依穿透量較小的軸決定反彈方向
function collideBricks(ball) {
  for (const b of bricks) {
    if (!b.alive) continue;
    const cx = Math.max(b.x, Math.min(ball.x, b.x + b.w));
    const cy = Math.max(b.y, Math.min(ball.y, b.y + b.h));
    const dx = ball.x - cx;
    const dy = ball.y - cy;
    if (dx * dx + dy * dy > ball.r * ball.r) continue;

    b.alive = false;
    addScore(b.score);
    spawnParticles(b.x + b.w / 2, b.y + b.h / 2, b.color);
    sfx.brick(b.score);
    maybeDrop(b);

    // 與磚塊中心的距離，用來判斷從哪一側撞入
    const overlapX = ball.r + b.w / 2 - Math.abs(ball.x - (b.x + b.w / 2));
    const overlapY = ball.r + b.h / 2 - Math.abs(ball.y - (b.y + b.h / 2));
    if (overlapX < overlapY) {
      ball.vx = ball.x < b.x + b.w / 2 ? -Math.abs(ball.vx) : Math.abs(ball.vx);
      ball.x += ball.x < b.x + b.w / 2 ? -overlapX : overlapX;
    } else {
      ball.vy = ball.y < b.y + b.h / 2 ? -Math.abs(ball.vy) : Math.abs(ball.vy);
      ball.y += ball.y < b.y + b.h / 2 ? -overlapY : overlapY;
    }
    return; // 每個步驟只處理一塊，避免同時撞兩塊造成雙重反彈
  }
}

function updateBall(ball, dt) {
  if (ball.stuck) {
    ball.x = paddle.x + paddle.w / 2;
    ball.y = paddle.y - ball.r;
    return;
  }

  ball.x += ball.vx * dt;
  ball.y += ball.vy * dt;

  // 左右牆
  if (ball.x - ball.r < 0) {
    ball.x = ball.r;
    ball.vx = Math.abs(ball.vx);
    sfx.wall();
  } else if (ball.x + ball.r > W) {
    ball.x = W - ball.r;
    ball.vx = -Math.abs(ball.vx);
    sfx.wall();
  }
  // 上牆
  if (ball.y - ball.r < 0) {
    ball.y = ball.r;
    ball.vy = Math.abs(ball.vy);
    sfx.wall();
  }
  collidePaddle(ball);
  collideBricks(ball);
  normalizeBall(ball);
}

function drawBall(ball) {
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, ball.r, 0, Math.PI * 2);
  ctx.fill();
}

function drawPowerups() {
  ctx.font = 'bold 13px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  for (const p of powerups) {
    ctx.fillStyle = p.color;
    ctx.beginPath();
    ctx.roundRect(p.x - p.w / 2, p.y - p.h / 2, p.w, p.h, 9);
    ctx.fill();
    ctx.fillStyle = '#12162b';
    ctx.fillText(p.label, p.x, p.y + 1);
  }
  ctx.textBaseline = 'alphabetic';
}

// 左下角顯示生效中的道具倒數
function drawEffects() {
  const items = [];
  if (effects.wide > 0) items.push('加寬 ' + Math.ceil(effects.wide) + 's');
  if (effects.slow > 0) items.push('減速 ' + Math.ceil(effects.slow) + 's');
  if (!items.length) return;
  ctx.fillStyle = '#6f7bb8';
  ctx.font = '13px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(items.join('　'), 12, H - 12);
}

function drawBricks() {
  for (const b of bricks) {
    if (!b.alive) continue;
    ctx.fillStyle = b.color;
    ctx.beginPath();
    ctx.roundRect(b.x, b.y, b.w, b.h, 3);
    ctx.fill();
  }
}

function drawLives() {
  ctx.fillStyle = '#8fa4ff';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText('生命 ' + lives, 12, 24);
  ctx.textAlign = 'center';
  ctx.fillText('第 ' + level + ' 關', W / 2, 24);
  ctx.textAlign = 'right';
  ctx.fillText('分數 ' + score, W - 12, 24);
  ctx.fillStyle = '#6f7bb8';
  ctx.font = '13px sans-serif';
  ctx.fillText('最高 ' + highScore, W - 12, 44);
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - 2, p.y - 2, 4, 4);
  }
  ctx.globalAlpha = 1;
}

// 狀態提示覆蓋層
function drawOverlay() {
  let title = '';
  let sub = '';
  if (state === 'ready') {
    sub = '空白鍵 / 點擊 發射　P 暫停　M 靜音' + (muted ? '（已靜音）' : '');
  } else if (state === 'paused') {
    title = '暫停';
    sub = '按 P 或點擊 繼續';
  } else if (state === 'levelclear') {
    title = '過關！';
    sub = '空白鍵 / 點擊 進入下一關';
  } else if (state === 'gameover') {
    title = 'Game Over';
    sub = '最終分數 ' + score + '　空白鍵 / 點擊 重新開始';
  } else {
    return;
  }

  if (title) {
    ctx.fillStyle = 'rgba(11, 13, 23, 0.65)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(title, W / 2, H / 2 - 10);
  }
  ctx.fillStyle = '#c5d0ff';
  ctx.font = '16px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(sub, W / 2, title ? H / 2 + 24 : H / 2 + 90);
}

function drawPaddle() {
  ctx.fillStyle = paddle.flash > 0 ? '#ffffff' : '#8fa4ff';
  ctx.beginPath();
  ctx.roundRect(paddle.x, paddle.y, paddle.w, paddle.h, 7);
  ctx.fill();
}

function draw() {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#12162b';
  ctx.fillRect(0, 0, W, H);

  drawBricks();
  drawPaddle();
  drawPowerups();
  for (const b of balls) drawBall(b);
  drawParticles();
  drawEffects();
  drawLives();
  drawOverlay();
}

function loop(now) {
  // dt 單位為秒，並限制上限避免切換分頁後瞬間跳很遠
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}

requestAnimationFrame((t) => {
  lastTime = t;
  requestAnimationFrame(loop);
});
