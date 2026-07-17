'use strict';

// ===== DOM =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const bannerEl = document.getElementById('banner');
const hintEl = document.getElementById('hint');
const startOverlay = document.getElementById('start-overlay');
const overOverlay = document.getElementById('over-overlay');
const overReasonEl = document.getElementById('over-reason');
const overScoreEl = document.getElementById('over-score');
const overBestEl = document.getElementById('over-best');
const rankOverlay = document.getElementById('rank-overlay');
const rankListEl = document.getElementById('rank-list');
const rankEntryEl = document.getElementById('rank-entry');
const nameInput = document.getElementById('name-input');
const submitBtn = document.getElementById('submit-score');
const showRankStartBtn = document.getElementById('show-rank-start');
const showRankOverBtn = document.getElementById('show-rank-over');

// ===== レイアウト =====
let W = 0, H = 0, dpr = 1;
const L = {}; // 画面サイズから毎回計算するレイアウト定数
let crowdDots = [];

function seededRand(seed) {
  let s = seed;
  return () => {
    s = (s * 1664525 + 1013904223) % 4294967296;
    return s / 4294967296;
  };
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  L.cx = W / 2;
  L.goalW = Math.min(W * 0.82, H * 0.62);
  L.goalH = L.goalW * 0.36;
  L.goalBottom = H * 0.42;
  L.goalTop = L.goalBottom - L.goalH;
  L.goalHalf = L.goalW / 2;
  L.postW = Math.max(4, L.goalW * 0.022);
  L.horizon = H * 0.30;
  L.ballX = L.cx;
  L.ballY = H * 0.78;
  L.ballR = Math.max(13, Math.min(W, H) * 0.042);
  L.keeperH = L.goalH * 0.88;
  L.keeperW = L.keeperH * 0.42;

  // 観客席のドット(リサイズ時に一度だけ生成)
  const rand = seededRand(12345);
  crowdDots = [];
  const rows = 6;
  for (let r = 0; r < rows; r++) {
    const y = H * 0.10 + (L.horizon - H * 0.10) * (r / rows);
    const size = 2 + r * 0.5;
    for (let x = rand() * 14; x < W; x += 8 + rand() * 10) {
      crowdDots.push({ x, y: y + rand() * 6, size, c: rand() });
    }
  }
}
window.addEventListener('resize', resize);
resize();

// ===== 状態 =====
const STATE = { START: 'start', AIM: 'aim', SHOOT: 'shoot', GOAL: 'goal', OVER: 'over' };
let state = STATE.START;
let streak = 0;
let best = 0;
try { best = parseInt(localStorage.getItem('pk_best') || '0', 10) || 0; } catch (e) {}
bestEl.textContent = best;

let shot = null;      // 進行中のシュート
let keeper = null;    // キーパーの今回の挙動
let fx = { netShake: 0, flash: 0, trail: [] };
let lastSides = [];   // 直近のシュート方向(同じコース連発をキーパーが読む)
let timeNow = 0;

// ===== サウンド(WebAudio・外部ファイルなし) =====
let AC = null;
let noiseBuf = null;

function ensureAudio() {
  if (!AC) {
    try {
      AC = new (window.AudioContext || window.webkitAudioContext)();
      const len = AC.sampleRate * 1;
      noiseBuf = AC.createBuffer(1, len, AC.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch (e) { AC = null; }
  }
  if (AC && AC.state === 'suspended') AC.resume();
}

function playKick(power) {
  if (!AC) return;
  const t = AC.currentTime;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(150 + power * 60, t);
  o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
  g.gain.setValueAtTime(0.4 + power * 0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
  o.connect(g).connect(AC.destination);
  o.start(t); o.stop(t + 0.18);
  const n = AC.createBufferSource(), ng = AC.createGain(), nf = AC.createBiquadFilter();
  n.buffer = noiseBuf;
  nf.type = 'lowpass'; nf.frequency.value = 900;
  ng.gain.setValueAtTime(0.25, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.08);
  n.connect(nf).connect(ng).connect(AC.destination);
  n.start(t); n.stop(t + 0.1);
}

function playGoal() {
  if (!AC) return;
  const t = AC.currentTime;
  // 歓声(ノイズのうねり)
  const n = AC.createBufferSource(), ng = AC.createGain(), nf = AC.createBiquadFilter();
  n.buffer = noiseBuf; n.loop = true;
  nf.type = 'bandpass'; nf.frequency.value = 1100; nf.Q.value = 0.6;
  ng.gain.setValueAtTime(0.001, t);
  ng.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  n.connect(nf).connect(ng).connect(AC.destination);
  n.start(t); n.stop(t + 1);
  // ファンファーレ
  [523.25, 659.25, 783.99].forEach((f, i) => {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'triangle'; o.frequency.value = f;
    const ts = t + 0.05 + i * 0.09;
    g.gain.setValueAtTime(0.22, ts);
    g.gain.exponentialRampToValueAtTime(0.001, ts + 0.35);
    o.connect(g).connect(AC.destination);
    o.start(ts); o.stop(ts + 0.4);
  });
}

function playFail() {
  if (!AC) return;
  const t = AC.currentTime;
  [280, 200].forEach((f, i) => {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = 'square';
    const ts = t + i * 0.18;
    o.frequency.setValueAtTime(f, ts);
    o.frequency.exponentialRampToValueAtTime(f * 0.85, ts + 0.15);
    g.gain.setValueAtTime(0.12, ts);
    g.gain.exponentialRampToValueAtTime(0.001, ts + 0.17);
    o.connect(g).connect(AC.destination);
    o.start(ts); o.stop(ts + 0.2);
  });
}

function vibrate(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ===== 演出 =====
function showBanner(text, color) {
  bannerEl.textContent = text;
  bannerEl.style.color = color || '#ffd94d';
  bannerEl.classList.remove('pop');
  void bannerEl.offsetWidth; // アニメーションを再トリガー
  bannerEl.classList.add('pop');
}

// ===== ゲーム進行 =====
function startAim() {
  state = STATE.AIM;
  shot = null;
  keeper = null;
  hintEl.classList.add('show');
}

function beginGame() {
  streak = 0;
  scoreEl.textContent = '0';
  startOverlay.classList.add('hidden');
  overOverlay.classList.add('hidden');
  startAim();
}

function doShoot(dx, dy, speed) {
  hintEl.classList.remove('show');

  const power = Math.max(0, Math.min(1, (speed - 0.25) / 2.2));
  const flightMs = 850 - 420 * power;

  // スワイプ方向をゴールラインまで延長してコースを決める
  const t = (L.ballY - L.goalBottom) / -dy;
  let targetX = L.ballX + dx * t;
  // 強シュートほどブレる
  targetX += (Math.random() * 2 - 1) * power * L.goalW * 0.07;
  targetX = Math.max(L.cx - L.goalHalf * 1.6, Math.min(L.cx + L.goalHalf * 1.6, targetX));

  // 高さはパワー依存(強打はバー越えのリスク)
  const heightFrac = Math.max(0.12, 0.18 + power * 0.85 + (Math.random() * 0.24 - 0.12));

  // 結果判定
  const off = targetX - L.cx;
  let outcome;
  if (heightFrac > 1.0 && Math.abs(off) < L.goalHalf) {
    outcome = 'bar'; // バーの上
  } else if (Math.abs(Math.abs(off) - L.goalHalf) < L.ballR * 0.9) {
    outcome = 'post';
  } else if (Math.abs(off) > L.goalHalf) {
    outcome = 'wide';
  } else {
    outcome = null; // キーパー次第
  }

  // キーパーAI
  const side = off < -L.goalHalf * 0.2 ? -1 : off > L.goalHalf * 0.2 ? 1 : 0;
  let guessProb = Math.min(0.15 + streak * 0.045, 0.8);
  // 同じコースを3連発するとキーパーが読んでくる
  if (lastSides.length >= 2 && lastSides[0] === side && lastSides[1] === side) {
    guessProb = Math.min(guessProb + 0.3, 0.92);
  }
  let diveDir;
  if (Math.random() < guessProb) {
    diveDir = side;
  } else {
    diveDir = [-1, 0, 1][Math.floor(Math.random() * 3)];
  }
  const diveX = L.cx + diveDir * L.goalHalf * 0.62;
  const reactMs = 300 - Math.min(streak * 9, 120);
  const progress = Math.max(0, Math.min(1, (flightMs - reactMs) / 350));
  const keeperArrivalX = L.cx + (diveX - L.cx) * progress;

  if (outcome === null) {
    let reach = L.goalHalf * 0.3 * (1 - power * 0.25);
    if (heightFrac > 0.72) reach *= 0.55; // 高いコースは届きにくい
    outcome = Math.abs(keeperArrivalX - targetX) < reach ? 'save' : 'goal';
  }

  lastSides.unshift(side);
  if (lastSides.length > 3) lastSides.pop();

  const clampedH = Math.min(heightFrac, 0.95);
  let targetY;
  if (outcome === 'bar') {
    targetY = L.goalTop - L.ballR * 2.2;
  } else {
    targetY = L.goalBottom - L.goalH * clampedH;
  }

  shot = {
    t: 0,
    dur: flightMs,
    sx: L.ballX, sy: L.ballY,
    tx: targetX, ty: targetY,
    power,
    outcome,
    resolved: false,
  };
  keeper = {
    diveDir,
    diveX,
    progress,
    startT: timeNow,
    flightMs,
    saveX: keeperArrivalX,
  };
  fx.trail = [];
  state = STATE.SHOOT;
  playKick(power);
  vibrate(20);
}

function resolveShot() {
  const o = shot.outcome;
  if (o === 'goal') {
    streak++;
    scoreEl.textContent = streak;
    if (streak > best) {
      best = streak;
      bestEl.textContent = best;
      try { localStorage.setItem('pk_best', String(best)); } catch (e) {}
    }
    fx.netShake = 1;
    fx.flash = 1;
    showBanner('GOAL!', '#ffd94d');
    playGoal();
    vibrate([30, 40, 60]);
    state = STATE.GOAL;
    setTimeout(() => { if (state === STATE.GOAL) startAim(); }, 1100);
  } else {
    const reasons = {
      save: 'セーブされた!',
      wide: '枠の外!',
      bar: 'バーの上!',
      post: 'ポスト直撃!',
    };
    showBanner(o === 'save' ? 'SAVE!' : 'MISS!', '#ff7b7b');
    playFail();
    vibrate(120);
    state = STATE.OVER;
    setTimeout(() => {
      overReasonEl.textContent = reasons[o];
      overScoreEl.textContent = streak;
      overBestEl.textContent = best;
      rankEntryEl.classList.toggle('hidden', streak < 1);
      nameInput.value = savedName;
      submitBtn.disabled = false;
      submitBtn.textContent = '🏆 ランキングに登録';
      overOverlay.classList.remove('hidden');
    }, 900);
  }
}

// ===== 入力(スワイプ) =====
let swipe = null;

window.addEventListener('pointerdown', (e) => {
  ensureAudio();
  if (state !== STATE.AIM) return;
  swipe = { x: e.clientX, y: e.clientY, t: performance.now() };
});

window.addEventListener('pointerup', (e) => {
  if (state !== STATE.AIM || !swipe) return;
  const dx = e.clientX - swipe.x;
  const dy = e.clientY - swipe.y;
  const dt = Math.max(performance.now() - swipe.t, 40);
  swipe = null;
  const dist = Math.hypot(dx, dy);
  if (dy > -30 || dist < 40) return; // 上向きスワイプのみ
  const speed = dist / dt; // px/ms
  doShoot(dx, dy, speed);
});

window.addEventListener('pointercancel', () => { swipe = null; });
window.addEventListener('contextmenu', (e) => e.preventDefault());

startOverlay.addEventListener('click', () => { ensureAudio(); beginGame(); });
overOverlay.addEventListener('click', () => { ensureAudio(); beginGame(); });

// ===== オンラインランキング =====
const API = '/api/scores';
let savedName = '';
try { savedName = localStorage.getItem('pk_name') || ''; } catch (e) {}

function renderRanking(top, highlightName) {
  rankListEl.innerHTML = '';
  if (!top.length) {
    const li = document.createElement('li');
    li.className = 'rank-loading';
    li.textContent = 'まだ記録がないよ。一番乗りを狙え!';
    rankListEl.appendChild(li);
    return;
  }
  top.forEach((entry, i) => {
    const li = document.createElement('li');
    const medal = ['🥇', '🥈', '🥉'][i] || ` ${i + 1}. `;
    li.textContent = `${medal} ${entry.name} — ${entry.score}`;
    if (highlightName && entry.name === highlightName) li.classList.add('me');
    rankListEl.appendChild(li);
  });
}

async function openRanking(highlightName) {
  rankOverlay.classList.remove('hidden');
  rankListEl.innerHTML = '<li class="rank-loading">読み込み中...</li>';
  try {
    const r = await fetch(API);
    if (!r.ok) throw new Error();
    const data = await r.json();
    renderRanking(data.top || [], highlightName);
  } catch (e) {
    rankListEl.innerHTML = '<li class="rank-loading">ランキングを取得できませんでした</li>';
  }
}

showRankStartBtn.addEventListener('click', (e) => { e.stopPropagation(); openRanking(savedName); });
showRankOverBtn.addEventListener('click', (e) => { e.stopPropagation(); openRanking(savedName); });
rankEntryEl.addEventListener('click', (e) => e.stopPropagation());
rankOverlay.addEventListener('click', (e) => {
  e.stopPropagation();
  rankOverlay.classList.add('hidden');
});

submitBtn.addEventListener('click', async (e) => {
  e.stopPropagation();
  const name = nameInput.value.trim().slice(0, 10);
  if (!name) { nameInput.focus(); return; }
  savedName = name;
  try { localStorage.setItem('pk_name', name); } catch (err) {}
  submitBtn.disabled = true;
  submitBtn.textContent = '送信中...';
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, score: streak }),
    });
    if (!r.ok) throw new Error();
    const data = await r.json();
    submitBtn.textContent = '登録した!';
    rankOverlay.classList.remove('hidden');
    renderRanking(data.top || [], name);
  } catch (err) {
    submitBtn.textContent = 'エラー… もう一度';
    submitBtn.disabled = false;
  }
});

// ===== 描画 =====
function drawBackground() {
  // 夜空
  const sky = ctx.createLinearGradient(0, 0, 0, L.horizon);
  sky.addColorStop(0, '#0b1c33');
  sky.addColorStop(1, '#14304f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, L.horizon);

  // 観客席
  ctx.fillStyle = '#1d2b45';
  ctx.fillRect(0, H * 0.08, W, L.horizon - H * 0.08);
  for (const d of crowdDots) {
    ctx.fillStyle = `hsl(${Math.floor(d.c * 360)}, 45%, ${55 + d.c * 20}%)`;
    ctx.fillRect(d.x, d.y, d.size, d.size);
  }

  // 芝生(横縞)
  const stripes = 7;
  for (let i = 0; i < stripes; i++) {
    const y0 = L.horizon + ((H - L.horizon) * i) / stripes;
    const y1 = L.horizon + ((H - L.horizon) * (i + 1)) / stripes;
    ctx.fillStyle = i % 2 === 0 ? '#2e8b3d' : '#339843';
    ctx.fillRect(0, y0, W, y1 - y0 + 1);
  }

  // ペナルティスポット
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(L.ballX, L.ballY + L.ballR * 0.9, L.ballR * 0.65, L.ballR * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawGoal() {
  const shakeX = fx.netShake > 0 ? Math.sin(timeNow / 30) * fx.netShake * 6 : 0;
  const gl = L.cx - L.goalHalf, gr = L.cx + L.goalHalf;
  const gt = L.goalTop, gb = L.goalBottom;
  const depth = L.goalH * 0.28; // 奥行き

  // ネット(奥側)
  ctx.save();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 1;
  const nx = 10, ny = 6;
  ctx.beginPath();
  for (let i = 0; i <= nx; i++) {
    const x = gl + ((gr - gl) * i) / nx + shakeX * 0.6;
    ctx.moveTo(x, gt - depth * 0.4);
    ctx.lineTo(x + shakeX, gb);
  }
  for (let j = 0; j <= ny; j++) {
    const y = gt - depth * 0.4 + ((gb - (gt - depth * 0.4)) * j) / ny;
    ctx.moveTo(gl + shakeX * 0.6, y);
    ctx.lineTo(gr + shakeX * 0.6, y);
  }
  ctx.stroke();
  ctx.restore();

  // ゴール枠
  ctx.strokeStyle = '#f5f5f5';
  ctx.lineWidth = L.postW;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(gl, gb);
  ctx.lineTo(gl, gt);
  ctx.lineTo(gr, gt);
  ctx.lineTo(gr, gb);
  ctx.stroke();
}

function drawKeeper() {
  const cx = L.cx;
  const baseY = L.goalBottom - 2;
  const h = L.keeperH, w = L.keeperW;

  let x = cx;
  let lean = 0; // 傾き(ダイブ)
  let stretch = 0; // 腕の伸び

  if ((state === STATE.SHOOT || state === STATE.GOAL || state === STATE.OVER) && keeper) {
    const el = Math.min((timeNow - keeper.startT) / keeper.flightMs, 1);
    const p = el * keeper.progress;
    x = cx + (keeper.diveX - cx) * p;
    lean = keeper.diveDir * p * 0.9;
    stretch = p;
  } else {
    // 待機中はゆらゆら
    x = cx + Math.sin(timeNow / 500) * L.goalHalf * 0.06;
  }

  ctx.save();
  ctx.translate(x, baseY);
  ctx.rotate(lean);

  // 脚
  ctx.strokeStyle = '#222';
  ctx.lineWidth = w * 0.16;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-w * 0.16, -h * 0.05);
  ctx.lineTo(-w * 0.22, 0);
  ctx.moveTo(w * 0.16, -h * 0.05);
  ctx.lineTo(w * 0.22, 0);
  ctx.stroke();

  // 胴体(ユニフォーム)
  ctx.fillStyle = '#ffb300';
  const bodyW = w * 0.62, bodyH = h * 0.5;
  ctx.beginPath();
  ctx.roundRect(-bodyW / 2, -h * 0.62, bodyW, bodyH, bodyW * 0.25);
  ctx.fill();

  // 腕(ダイブで横に伸びる)
  ctx.strokeStyle = '#ffb300';
  ctx.lineWidth = w * 0.18;
  const armY = -h * 0.55;
  const armLen = w * (0.45 + stretch * 0.75);
  const armAngle = stretch * 0.9;
  ctx.beginPath();
  ctx.moveTo(-bodyW * 0.4, armY);
  ctx.lineTo(-bodyW * 0.4 - armLen * Math.cos(armAngle * 0.4), armY - armLen * Math.sin(0.3 + armAngle));
  ctx.moveTo(bodyW * 0.4, armY);
  ctx.lineTo(bodyW * 0.4 + armLen * Math.cos(armAngle * 0.4), armY - armLen * Math.sin(0.3 + armAngle));
  ctx.stroke();

  // グローブ
  ctx.fillStyle = '#eee';
  ctx.beginPath();
  ctx.arc(-bodyW * 0.4 - armLen * Math.cos(armAngle * 0.4), armY - armLen * Math.sin(0.3 + armAngle), w * 0.12, 0, Math.PI * 2);
  ctx.arc(bodyW * 0.4 + armLen * Math.cos(armAngle * 0.4), armY - armLen * Math.sin(0.3 + armAngle), w * 0.12, 0, Math.PI * 2);
  ctx.fill();

  // 頭
  ctx.fillStyle = '#ffcf9e';
  ctx.beginPath();
  ctx.arc(0, -h * 0.74, w * 0.22, 0, Math.PI * 2);
  ctx.fill();
  // 髪
  ctx.fillStyle = '#3a2a1a';
  ctx.beginPath();
  ctx.arc(0, -h * 0.78, w * 0.22, Math.PI, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBall() {
  let x = L.ballX, y = L.ballY, r = L.ballR;

  if (shot) {
    const t = Math.min(shot.t / shot.dur, 1);
    const ease = t;
    x = shot.sx + (shot.tx - shot.sx) * ease;
    y = shot.sy + (shot.ty - shot.sy) * ease;
    // 放物線の山なり
    y -= Math.sin(Math.PI * t) * H * 0.08 * (0.5 + shot.power * 0.5);
    // 遠近感で縮小
    r = L.ballR * (1 - 0.55 * t);

    // 軌跡
    fx.trail.push({ x, y, r, a: 0.5 });
    if (fx.trail.length > 12) fx.trail.shift();
  }

  for (const p of fx.trail) {
    ctx.fillStyle = `rgba(255,255,255,${p.a})`;
    ctx.beginPath();
    ctx.arc(p.x, p.y, p.r * 0.8, 0, Math.PI * 2);
    ctx.fill();
    p.a *= 0.82;
  }

  // ボール本体
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  // 五角形パターン(簡易)
  ctx.fillStyle = '#222';
  const spin = shot ? timeNow / 60 : 0;
  ctx.beginPath();
  ctx.arc(x + Math.cos(spin) * r * 0.4, y + Math.sin(spin) * r * 0.4, r * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x - Math.cos(spin + 1.8) * r * 0.45, y - Math.sin(spin + 1.8) * r * 0.45, r * 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

function drawFlash() {
  if (fx.flash > 0) {
    ctx.fillStyle = `rgba(255, 235, 130, ${fx.flash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }
}

// ===== メインループ =====
let lastT = 0;
function loop(t) {
  timeNow = t;
  const dt = Math.min(t - lastT, 50);
  lastT = t;

  if (shot && !shot.resolved) {
    shot.t += dt;
    if (shot.t >= shot.dur) {
      shot.t = shot.dur;
      shot.resolved = true;
      resolveShot();
    }
  }

  fx.netShake = Math.max(0, fx.netShake - dt / 600);
  fx.flash = Math.max(0, fx.flash - dt / 500);

  drawBackground();
  drawGoal();
  drawKeeper();
  drawBall();
  drawFlash();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
