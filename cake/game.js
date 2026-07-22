// ふわもちタワー: ワンタップでパンケーキを積む癒し系スタッカー
// ゲーム苦手な人向けに判定は激甘 (55%重なれば「ぴったり」扱いで自動整列)
'use strict';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

let W = 0, H = 0, DPR = 1;
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  W = window.innerWidth;
  H = window.innerHeight;
  canvas.width = Math.round(W * DPR);
  canvas.height = Math.round(H * DPR);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
}
window.addEventListener('resize', resize);
resize();

// ===== 定数 =====
const BH = 30;                 // パンケーキ1段の高さ
const PERFECT = 0.55;          // これ以上重なれば「ぴったり」で自動整列
const MISS = 0.12;             // これ未満しか重ならなければ落下
const OKAWARI_MAX = 2;         // ミスしても復活できる回数
const TOPPINGS = ['🧈', '🍓', '🍯', '🫐', '🍒', '🍑', '⭐', '🌙'];

// 高さに応じた背景 (カフェ → 昼空 → 夕焼け → 星空)
const BG_STOPS = [
  { n: 0,  top: [255, 233, 210], bot: [255, 248, 236] },
  { n: 12, top: [199, 229, 255], bot: [255, 236, 244] },
  { n: 24, top: [255, 200, 152], bot: [230, 196, 250] },
  { n: 38, top: [56, 56, 96],    bot: [122, 96, 156] },
];

const MILESTONES = {
  3: 'いいかんじ♪', 5: 'ふわふわ〜', 8: 'そのちょうし!',
  10: 'シェフみたい!', 15: 'すごい!たつじん!', 20: 'マイスターだ!',
  25: '雲までとどきそう…', 30: '雲をこえた!!', 40: 'お星さまとパンケーキ',
  50: 'でんせつのタワー!!',
};

// ===== 状態 =====
const STATE = { TITLE: 0, PLAY: 1, OVER: 2 };
let state = STATE.TITLE;
let blocks = [];      // 積まれたパンケーキ { x, w, topping }
let cur = null;       // 操作中 { x, w, y, vy, rot, rotV, dropping, missing }
let initW = 0;
let plateW = 0;
let swingT = 0;
let okawari = OKAWARI_MAX;
let combo = 0;
let cam = 0;
let bgN = 0;          // 背景補間用のなめらかな高さ
let particles = [];
let faceHappy = 0;    // ぴったり時に笑顔になる残り時間
let overAt = 0;

let best = 0;
try { best = parseInt(localStorage.getItem('cake_best') || '0', 10) || 0; } catch (e) {}

// 星と雲 (位置は起動時に一度だけ決める)
const stars = Array.from({ length: 70 }, () => ({
  x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.5, tw: Math.random() * 6.28,
}));
const clouds = Array.from({ length: 6 }, (_, i) => ({
  x: Math.random(), y: (i + Math.random()) / 6, s: 0.7 + Math.random() * 0.8, sp: 4 + Math.random() * 7,
}));

const baseY = () => H * 0.8;
const towerTopY = () => baseY() - blocks.length * BH + cam;
const swingY = () => towerTopY() - BH - 38;
const swingPeriod = () => Math.max(1.35, 2.7 - blocks.length * 0.035);

// ===== やさしい効果音 (WebAudio) =====
let actx = null;
function audio() {
  if (!actx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    actx = new AC();
  }
  if (actx.state === 'suspended') actx.resume();
  return actx;
}
function tone(freq, dur, type, vol, delay, slide) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime + (delay || 0);
  const osc = ac.createOscillator();
  const g = ac.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.linearRampToValueAtTime(Math.max(60, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}
const sePon = () => tone(300, 0.14, 'sine', 0.16, 0, -90);
const seKira = () => { tone(880, 0.12, 'triangle', 0.09); tone(1174.7, 0.14, 'triangle', 0.09, 0.07); tone(1568, 0.22, 'triangle', 0.08, 0.14); };
const seFuwa = () => tone(480, 0.35, 'sine', 0.09, 0, -260);
const seOver = () => { tone(523.3, 0.28, 'triangle', 0.1); tone(659.3, 0.28, 'triangle', 0.1, 0.18); tone(784, 0.5, 'triangle', 0.1, 0.36); };

// ===== DOM =====
const hud = document.getElementById('hud');
const floorsEl = document.getElementById('floors');
const okawariEl = document.getElementById('okawari');
const bestEl = document.getElementById('best');
const toastEl = document.getElementById('toast');
const startOverlay = document.getElementById('start-overlay');
const overOverlay = document.getElementById('over-overlay');
const rankOverlay = document.getElementById('rank-overlay');
const nameInput = document.getElementById('name-input');
const overFloorsEl = document.getElementById('over-floors');
const overBestEl = document.getElementById('over-best');
const overCommentEl = document.getElementById('over-comment');
const rankTitleEl = document.getElementById('rank-title');
const top10Badge = document.getElementById('top10-badge');
const rankListEl = document.getElementById('rank-list');

function updateHUD() {
  floorsEl.textContent = `${blocks.length} だん`;
  okawariEl.textContent = okawari > 0 ? `おかわり ${'💗'.repeat(okawari)}` : 'おかわり なし';
  bestEl.textContent = best > 0 ? `${best} だん` : '—';
}

let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  // アニメーションを最初から再生し直す
  toastEl.style.animation = 'none';
  void toastEl.offsetWidth;
  toastEl.style.animation = '';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 1500);
}

// ===== ゲーム進行 =====
function beginGame() {
  initW = Math.min(W * 0.44, 190);
  plateW = initW + 26;
  blocks = [];
  cur = null;
  swingT = 0;
  okawari = OKAWARI_MAX;
  combo = 0;
  cam = 0;
  bgN = 0;
  particles = [];
  state = STATE.PLAY;
  startOverlay.classList.add('hidden');
  overOverlay.classList.add('hidden');
  hud.classList.remove('hidden');
  spawnNext(initW);
  updateHUD();
}

function spawnNext(w) {
  cur = { x: W / 2, w, y: swingY(), vy: 0, rot: 0, rotV: 0, dropping: false, missing: false };
}

function drop() {
  if (!cur || cur.dropping || cur.missing) return;
  cur.dropping = true;
  cur.vy = 0;
}

function land() {
  const top = blocks.length
    ? blocks[blocks.length - 1]
    : { x: W / 2, w: plateW };
  const l = Math.max(cur.x - cur.w / 2, top.x - top.w / 2);
  const r = Math.min(cur.x + cur.w / 2, top.x + top.w / 2);
  const overlap = r - l;
  const ratio = overlap / cur.w;

  if (ratio < MISS) {
    startMiss();
    return;
  }

  let x, w;
  if (ratio >= PERFECT) {
    // 半分ちょい重なっていれば「ぴったり!」扱いで自動整列
    x = top.x;
    combo++;
    w = Math.min(initW, cur.w + (combo >= 2 ? 7 : 2)); // ごほうびで幅が回復
    faceHappy = 1.2;
    seKira();
    sparkle(x, towerTopY() - BH / 2);
    if (combo >= 2) toast(`ぴったり ×${combo} ✨`);
    else toast('ぴったり!✨');
  } else {
    combo = 0;
    // 削れるのははみ出た分の4割だけ (激甘)
    w = Math.max(34, overlap + (cur.w - overlap) * 0.6);
    x = (l + r) / 2;
    sePon();
  }

  const n = blocks.length + 1;
  const topping = n % 5 === 0 ? TOPPINGS[(n / 5 - 1) % TOPPINGS.length] : null;
  blocks.push({ x, w, topping });
  if (MILESTONES[n]) toast(MILESTONES[n]);
  spawnNext(w);
  updateHUD();
}

function startMiss() {
  cur.missing = true;
  cur.dropping = false;
  cur.vy = -180;
  cur.rotV = (cur.x > (blocks.length ? blocks[blocks.length - 1].x : W / 2) ? 1 : -1) * 3.2;
  seFuwa();
}

function finishMiss() {
  const w = cur.w;
  if (okawari > 0) {
    okawari--;
    toast('セーフ!おかわり 🥞');
    spawnNext(w);
    updateHUD();
  } else {
    gameOver();
  }
}

function gameOver() {
  state = STATE.OVER;
  cur = null;
  const score = blocks.length;
  if (score > best) {
    best = score;
    try { localStorage.setItem('cake_best', String(best)); } catch (e) {}
  }
  seOver();
  overAt = performance.now();
  setTimeout(() => {
    overFloorsEl.textContent = String(score);
    overBestEl.textContent = `${best} だん`;
    rankTitleEl.textContent = titleOf(score);
    overCommentEl.textContent = commentOf(score);
    top10Badge.classList.add('hidden');
    overOverlay.classList.remove('hidden');
    updateHUD();
    autoSubmitScore(score);
  }, 900);
}

function titleOf(n) {
  if (n < 3) return 'たまごわり みならい';
  if (n < 6) return 'ふんわり けんしゅうせい';
  if (n < 10) return 'もちもち シェフ';
  if (n < 15) return 'ふわもち パティシエ';
  if (n < 20) return 'タワーの たつじん';
  if (n < 30) return 'パンケーキ マイスター';
  if (n < 40) return 'くもの上の シェフ';
  return 'でんせつの ホットケーキ神';
}

function commentOf(n) {
  if (n < 3) return 'まだまだこれから!のんびりいこう';
  if (n < 10) return 'ふわふわのいいタワーだったよ';
  if (n < 20) return 'おみごと!あまいにおいがしてきた…';
  if (n < 30) return 'もはや職人。カフェひらけるよ!';
  return 'でんせつになった。ごちそうさま!';
}

// ===== パーティクル =====
function sparkle(x, y) {
  for (let i = 0; i < 10; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 40 + Math.random() * 90;
    particles.push({
      x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 40,
      life: 0.7 + Math.random() * 0.4,
      max: 1.1,
      emoji: Math.random() < 0.35 ? '✨' : null,
    });
  }
}

// ===== 更新 =====
let lastT = 0;
function update(dt) {
  // カメラ: タワーの上端が画面中央より下に来るようにゆっくり追従
  const camTarget = Math.max(0, blocks.length * BH - H * 0.3);
  cam += (camTarget - cam) * Math.min(1, dt * 5);
  bgN += (blocks.length - bgN) * Math.min(1, dt * 2);

  if (cur && !cur.dropping && !cur.missing) {
    swingT += dt;
    const amp = Math.min(W * 0.34, 175);
    cur.x = W / 2 + Math.sin(swingT * (Math.PI * 2) / swingPeriod()) * amp;
    cur.y = swingY();
  }

  if (cur && cur.dropping) {
    cur.vy += 2600 * dt;
    cur.y += cur.vy * dt;
    const target = towerTopY() - BH;
    if (cur.y >= target) {
      cur.y = target;
      land();
    }
  }

  if (cur && cur.missing) {
    cur.vy += 2000 * dt;
    cur.y += cur.vy * dt;
    cur.x += cur.rotV * 28 * dt;
    cur.rot += cur.rotV * dt;
    if (cur.y > H + 80) finishMiss();
  }

  if (faceHappy > 0) faceHappy -= dt;

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vy += 300 * dt;
  }
}

// ===== 描画 =====
function lerp(a, b, t) { return a + (b - a) * t; }

function bgColors(n) {
  let lo = BG_STOPS[0], hi = BG_STOPS[BG_STOPS.length - 1];
  for (let i = 0; i < BG_STOPS.length - 1; i++) {
    if (n >= BG_STOPS[i].n && n <= BG_STOPS[i + 1].n) {
      lo = BG_STOPS[i]; hi = BG_STOPS[i + 1];
      break;
    }
  }
  const t = hi.n === lo.n ? 0 : Math.min(1, Math.max(0, (n - lo.n) / (hi.n - lo.n)));
  const mix = (a, b) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
  return { top: mix(lo.top, hi.top), bot: mix(lo.bot, hi.bot) };
}

function roundRect(x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawPancake(x, yTop, w, opts) {
  const h = BH - 3;
  ctx.save();
  ctx.translate(x, yTop);
  if (opts && opts.rot) ctx.rotate(opts.rot);
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#ffd98f');
  g.addColorStop(0.55, '#f5b86a');
  g.addColorStop(1, '#dd9a4e');
  roundRect(-w / 2, 0, w, h, 13);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = 'rgba(190, 130, 60, 0.5)';
  ctx.stroke();
  // 上面のふんわりハイライト
  ctx.fillStyle = 'rgba(255, 244, 205, 0.8)';
  ctx.beginPath();
  ctx.ellipse(0, 4.5, Math.max(6, w / 2 - 8), 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (opts && opts.face) {
    const happy = faceHappy > 0;
    ctx.fillStyle = '#6b4423';
    ctx.strokeStyle = '#6b4423';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (happy) {
      // にっこり (^ ^)
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(s * 9, 15, 3.4, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
      }
    } else {
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.arc(s * 9, 14.5, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.beginPath();
    ctx.arc(0, 17, 3.8, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    // ほっぺ
    ctx.fillStyle = 'rgba(255, 145, 165, 0.55)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 17, 17.5, 3.6, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function draw(now) {
  const t = now / 1000;

  // 背景グラデーション
  const { top, bot } = bgColors(bgN);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgb(${top[0] | 0},${top[1] | 0},${top[2] | 0})`);
  g.addColorStop(1, `rgb(${bot[0] | 0},${bot[1] | 0},${bot[2] | 0})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // 星 (高いところまで来たら)
  const nightT = Math.min(1, Math.max(0, (bgN - 26) / 12));
  if (nightT > 0) {
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      const a = nightT * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.2 + s.tw)));
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // 雲 (ゆっくり横に流れる + 高さでパララックス)
  ctx.fillStyle = `rgba(255, 255, 255, ${0.75 - nightT * 0.45})`;
  for (const c of clouds) {
    const cx = ((c.x * W + t * c.sp) % (W + 160)) - 80;
    const cy = ((c.y * H * 1.3 + cam * 0.35) % (H + 140)) - 70;
    const s = c.s;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 38 * s, 15 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - 24 * s, cy + 5 * s, 24 * s, 11 * s, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 26 * s, cy + 4 * s, 26 * s, 12 * s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const by = baseY();

  // お皿 (タワーが伸びると画面の下へ流れていく)
  const plateY = by + cam;
  if (plateY < H + 40) {
    ctx.fillStyle = 'rgba(120, 90, 60, 0.14)';
    ctx.beginPath();
    ctx.ellipse(W / 2, plateY + 16, plateW * 0.75, 10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#ffd6e0';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(W / 2, plateY + 6, plateW * 0.72, 13, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  // 積まれたパンケーキ (下からぷるぷる揺れる)
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const wob = Math.sin(t * 1.5 + i * 0.55) * Math.min(4, i * 0.12);
    const y = by - (i + 1) * BH + cam;
    if (y > H + 40 || y < -60) continue;
    const isTop = i === blocks.length - 1;
    drawPancake(b.x + wob, y, b.w, { face: isTop && state === STATE.OVER });
    if (b.topping) {
      // 前面にスタンプ風に描く (上に積まれても隠れない)
      ctx.font = '17px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.topping, b.x + wob, y + (BH - 3) / 2 + 1);
    }
  }

  // 操作中のパンケーキ
  if (cur) {
    drawPancake(cur.x, cur.y, cur.w, { face: true, rot: cur.rot });
    // 着地ガイド (うっすら)
    if (!cur.dropping && !cur.missing) {
      ctx.fillStyle = 'rgba(255, 158, 181, 0.25)';
      roundRect(cur.x - cur.w / 2, towerTopY() - BH, cur.w, BH - 3, 13);
      ctx.fill();
    }
  }

  // パーティクル
  for (const p of particles) {
    const a = Math.min(1, p.life / 0.4);
    ctx.globalAlpha = a;
    if (p.emoji) {
      ctx.font = '16px "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", serif';
      ctx.textAlign = 'center';
      ctx.fillText(p.emoji, p.x, p.y);
    } else {
      ctx.fillStyle = '#ffd76e';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0);
  lastT = now;
  if (state !== STATE.TITLE) update(dt);
  draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ===== 入力 =====
canvas.addEventListener('pointerdown', () => {
  if (state === STATE.PLAY) drop();
});
window.addEventListener('keydown', (e) => {
  if ((e.code === 'Space' || e.code === 'Enter') && state === STATE.PLAY) {
    e.preventDefault();
    drop();
  }
});

// ===== オーバーレイ操作 =====
startOverlay.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, input, a')) return;
  saveName();
  audio();
  beginGame();
});
overOverlay.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  beginGame();
});
rankOverlay.addEventListener('pointerdown', () => rankOverlay.classList.add('hidden'));

document.getElementById('back-title').addEventListener('click', (e) => {
  e.stopPropagation();
  overOverlay.classList.add('hidden');
  startOverlay.classList.remove('hidden');
  hud.classList.add('hidden');
  state = STATE.TITLE;
});

// ===== オンラインランキング =====
const API = '/api/scores';
let savedName = '';
try {
  savedName = localStorage.getItem('cake_name') || localStorage.getItem('pk_name') || '';
} catch (e) {}
nameInput.value = savedName;
nameInput.addEventListener('pointerdown', (e) => e.stopPropagation());

function saveName() {
  const name = nameInput.value.trim().slice(0, 10);
  savedName = name;
  if (name) {
    try { localStorage.setItem('cake_name', name); } catch (e) {}
  }
}

async function autoSubmitScore(score) {
  if (score < 1 || !savedName) return;
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'cake', name: savedName, score }),
    });
    if (!r.ok) return;
    const data = await r.json();
    const topList = data.top || [];
    if (topList.some((e) => e.name === savedName)) {
      top10Badge.classList.remove('hidden');
    }
  } catch (e) {}
}

function renderRanking(topList, highlightName) {
  rankListEl.innerHTML = '';
  if (!topList.length) {
    rankListEl.innerHTML = '<li class="rank-loading">まだだれもいないよ。いちばんのりのチャンス!</li>';
    return;
  }
  topList.forEach((entry, i) => {
    const li = document.createElement('li');
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}位`;
    li.textContent = `${medal} ${entry.name} — ${entry.score} だん`;
    if (highlightName && entry.name === highlightName) li.classList.add('me');
    rankListEl.appendChild(li);
  });
}

async function openRanking(highlightName) {
  rankOverlay.classList.remove('hidden');
  rankListEl.innerHTML = '<li class="rank-loading">読み込み中...</li>';
  try {
    const r = await fetch(`${API}?game=cake`);
    if (!r.ok) throw new Error();
    const data = await r.json();
    renderRanking(data.top || [], highlightName);
  } catch (e) {
    rankListEl.innerHTML = '<li class="rank-loading">ランキングを取得できませんでした</li>';
  }
}

document.getElementById('show-rank-start').addEventListener('click', (e) => {
  e.stopPropagation();
  saveName();
  openRanking(savedName);
});
document.getElementById('show-rank-over').addEventListener('click', (e) => {
  e.stopPropagation();
  openRanking(savedName);
});

updateHUD();
