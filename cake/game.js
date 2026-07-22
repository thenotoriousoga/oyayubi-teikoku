// ふわもちタワー: ワンタップでパンケーキを積む癒し系スタッカー
// 序盤は激甘判定、高くなるほどシビアに。ランキングのライバルの旗を抜いて競う
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
const MISS = 0.12;             // これ未満しか重ならなければ落下
const OKAWARI_MAX = 2;         // 小鳥が助けてくれる回数
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", serif';
const BODY_FONT = '"M PLUS Rounded 1c", sans-serif';
const TOPPINGS = ['🧈', '🍓', '🍯', '🫐', '🍒', '🍑', '⭐', '🌙'];

// 高くなるほど「ぴったり」に必要な重なりが増える (55% → 80%)
const perfectThreshold = (n) => Math.min(0.8, 0.55 + n * 0.01);
// はみ出し分のうち残してもらえる割合 (55% → 25%)
const keepFrac = (n) => Math.max(0.25, 0.55 - n * 0.008);
const swingPeriodOf = (n, type) =>
  Math.max(1.0, 2.7 - n * 0.05) / (type === 'koge' ? 1.35 : 1);

// 変わり種パンケーキ
const TYPES = {
  normal: { factor: 1,    says: ['つんでね♪', 'ふわ〜', 'ここだよ〜', 'ねむねむ…', 'とんでるー!'], sayRate: 0.4,
            colors: ['#ffd98f', '#f5b86a', '#dd9a4e'], edge: 'rgba(190,130,60,0.5)' },
  mochi:  { factor: 0.68, says: ['もちもち'], sayRate: 1,
            colors: ['#ffe4ee', '#ffc4d8', '#f5a8c2'], edge: 'rgba(220,120,155,0.5)' },
  jumbo:  { factor: 1.35, says: ['どっしり♪'], sayRate: 1,
            colors: ['#ffd280', '#eda954', '#cf8a3e'], edge: 'rgba(170,110,50,0.55)' },
  koge:   { factor: 1,    says: ['こげてないもん!'], sayRate: 1,
            colors: ['#a06a3a', '#7c4c24', '#5f3818'], edge: 'rgba(60,35,15,0.6)' },
};

function pickType(n) {
  if (n < 6) return 'normal';
  const r = Math.random();
  if (r < 0.10) return 'koge';
  if (r < 0.20) return 'mochi';
  if (r < 0.28) return 'jumbo';
  return 'normal';
}

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
let blocks = [];      // 積まれたパンケーキ { x, w, topping, type }
let cur = null;       // 操作中のパンケーキ
let initW = 0;
let plateW = 0;
let carryW = 0;       // 次のパンケーキの基準幅
let swingT = 0;
let okawari = OKAWARI_MAX;
let combo = 0;
let cam = 0;
let bgN = 0;
let particles = [];
let faceHappy = 0;
let fork = null;      // ゲームオーバーのフォーク演出 { t }
let rivals = [];      // ランキング上位 { name, score, passed }

let best = 0;
try { best = parseInt(localStorage.getItem('cake_best') || '0', 10) || 0; } catch (e) {}

const stars = Array.from({ length: 70 }, () => ({
  x: Math.random(), y: Math.random(), r: Math.random() * 1.4 + 0.5, tw: Math.random() * 6.28,
}));
const clouds = Array.from({ length: 6 }, (_, i) => ({
  x: Math.random(), y: (i + Math.random()) / 6, s: 0.7 + Math.random() * 0.8, sp: 4 + Math.random() * 7,
}));

const baseY = () => H * 0.8;
const towerTopY = () => baseY() - blocks.length * BH + cam;
const swingY = () => towerTopY() - BH - 38;
const towerX = () => (blocks.length ? blocks[blocks.length - 1].x : W / 2);

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
const seChun = () => { tone(1900, 0.07, 'sine', 0.09); tone(2300, 0.09, 'sine', 0.08, 0.09); };
const seOver = () => { tone(523.3, 0.28, 'triangle', 0.1); tone(659.3, 0.28, 'triangle', 0.1, 0.18); tone(784, 0.5, 'triangle', 0.1, 0.36); };
const seFanfare = () => { tone(523.3, 0.14, 'triangle', 0.11); tone(659.3, 0.14, 'triangle', 0.11, 0.12); tone(784, 0.14, 'triangle', 0.11, 0.24); tone(1046.5, 0.4, 'triangle', 0.12, 0.36); };

// ===== DOM =====
const hud = document.getElementById('hud');
const floorsEl = document.getElementById('floors');
const okawariEl = document.getElementById('okawari');
const bestEl = document.getElementById('best');
const targetEl = document.getElementById('target');
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
  const n = blocks.length;
  floorsEl.textContent = `${n} だん`;
  okawariEl.textContent = okawari > 0 ? `🐦 ${'💗'.repeat(okawari)}` : '🐦 おでかけ中';
  bestEl.textContent = best > 0 ? `${best} だん` : '—';
  // 次に抜くライバル
  const next = rivals.filter((r) => r.score >= n).sort((a, b) => a.score - b.score)[0];
  if (!rivals.length) {
    targetEl.textContent = '🚩 いちばんのりを めざせ!';
  } else if (!next) {
    targetEl.textContent = '👑 いま1位!';
  } else {
    targetEl.textContent = `🚩 ${next.name} まで あと${next.score - n + 1}だん`;
  }
}

let toastTimer = 0;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
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
  carryW = initW;
  blocks = [];
  cur = null;
  swingT = 0;
  okawari = OKAWARI_MAX;
  combo = 0;
  cam = 0;
  bgN = 0;
  particles = [];
  fork = null;
  rivals.forEach((r) => { r.passed = false; });
  fetchRivals();
  state = STATE.PLAY;
  startOverlay.classList.add('hidden');
  overOverlay.classList.add('hidden');
  hud.classList.remove('hidden');
  spawnNext();
  updateHUD();
}

function pickSay(def) {
  if (Math.random() >= def.sayRate) return null;
  return def.says[Math.floor(Math.random() * def.says.length)];
}

function spawnNext() {
  const n = blocks.length;
  const type = pickType(n);
  const def = TYPES[type];
  const w = Math.max(26, Math.min(W * 0.6, carryW * def.factor));
  cur = {
    type, x: W / 2, w, y: swingY(), vy: 0, rot: 0, rotV: 0,
    dropping: false, missing: false, rescue: null,
    // 出現位相と向きをランダムに (連打で常に中央に来る抜け道を防ぐ)
    phase: Math.random() * Math.PI * 2,
    dir: Math.random() < 0.5 ? 1 : -1,
    say: pickSay(def), sayT: 0,
  };
  swingT = 0;
}

function drop() {
  if (!cur || cur.dropping || cur.missing) return;
  cur.dropping = true;
  cur.vy = 0;
  cur.say = null;
}

function land() {
  const n = blocks.length;
  const top = n ? blocks[n - 1] : { x: W / 2, w: plateW };
  const l = Math.max(cur.x - cur.w / 2, top.x - top.w / 2);
  const r = Math.min(cur.x + cur.w / 2, top.x + top.w / 2);
  const overlap = r - l;
  const ratio = overlap / cur.w;

  if (ratio < MISS) {
    startMiss();
    return;
  }

  let x, w;
  if (ratio >= perfectThreshold(n)) {
    x = top.x;
    combo++;
    w = Math.min(initW * TYPES[cur.type].factor, cur.w + (combo >= 3 ? 8 : 4));
    faceHappy = 1.2;
    seKira();
    sparkle(x, towerTopY() - BH / 2);
    if (combo >= 2) toast(`ぴったり ×${combo} ✨`);
    else toast('ぴったり!✨');
  } else {
    combo = 0;
    w = Math.max(26, overlap + (cur.w - overlap) * keepFrac(n));
    x = (l + r) / 2;
    sePon();
  }

  const nn = n + 1;
  const topping = nn % 5 === 0 ? TOPPINGS[(nn / 5 - 1) % TOPPINGS.length] : null;
  blocks.push({ x, w, topping, type: cur.type });
  carryW = Math.min(initW, w / TYPES[cur.type].factor);

  // ライバルを抜いたらお祝い (マイルストーンより優先)
  let beat = null;
  for (const rv of rivals) {
    if (!rv.passed && nn > rv.score) {
      rv.passed = true;
      beat = rv;
    }
  }
  if (beat) {
    toast(`🎉 ${beat.name} さんを ぬいた!`);
    seFanfare();
    sparkle(x, towerTopY() - BH / 2);
  } else if (MILESTONES[nn]) {
    toast(MILESTONES[nn]);
  }

  spawnNext();
  updateHUD();
}

function startMiss() {
  cur.missing = true;
  cur.dropping = false;
  cur.vy = -140;
  cur.rotV = (cur.x > towerX() ? 1 : -1) * 2.6;
  cur.say = null;
  combo = 0;
  seFuwa();
  if (okawari > 0) {
    // 小鳥が助けに来る
    cur.rescue = { phase: 'chase', x: cur.x < W / 2 ? W + 50 : -50, y: cur.y - 130 };
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
  fork = { t: 0 };
  setTimeout(() => { toast('ぱくっ♪'); seOver(); }, 650);
  setTimeout(() => {
    overFloorsEl.textContent = String(score);
    overBestEl.textContent = `${best} だん`;
    rankTitleEl.textContent = titleOf(score);
    overCommentEl.textContent = commentOf(score);
    top10Badge.classList.add('hidden');
    overOverlay.classList.remove('hidden');
    updateHUD();
    autoSubmitScore(score);
  }, 1400);
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
      emoji: Math.random() < 0.35 ? '✨' : null,
    });
  }
}

// ===== 更新 =====
let lastT = 0;
function update(dt) {
  const camTarget = Math.max(0, blocks.length * BH - H * 0.3);
  cam += (camTarget - cam) * Math.min(1, dt * 5);
  bgN += (blocks.length - bgN) * Math.min(1, dt * 2);

  if (cur && !cur.dropping && !cur.missing) {
    swingT += dt;
    cur.sayT += dt;
    const n = blocks.length;
    // 高層では振れ幅もゆらぐのでリズム暗記が効かない
    let amp = Math.min(W * 0.34, 175);
    if (n > 12) amp *= 1 + 0.12 * Math.sin(swingT * 0.9 + cur.phase * 2);
    const period = swingPeriodOf(n, cur.type);
    cur.x = W / 2 + Math.sin(swingT * (Math.PI * 2) / period + cur.phase) * amp * cur.dir;
    cur.y = swingY();
    // ぴったり連続中はキラキラの軌跡
    if (combo >= 3 && Math.random() < dt * 20) {
      particles.push({
        x: cur.x + (Math.random() - 0.5) * cur.w, y: cur.y + BH / 2,
        vx: (Math.random() - 0.5) * 30, vy: 20 + Math.random() * 40,
        life: 0.5, emoji: null,
      });
    }
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
    const rescue = cur.rescue;
    if (rescue && rescue.phase === 'carry') {
      // 小鳥がくわえて空へ連れて帰る
      rescue.x += (rescue.x < W / 2 ? 1 : -1) * -260 * dt;
      rescue.y -= 420 * dt;
      cur.x = rescue.x;
      cur.y = rescue.y + 20;
      cur.rot *= Math.max(0, 1 - dt * 6);
      if (rescue.y < -80) {
        okawari--;
        toast('🐦 ちゅん!おかわり!');
        seChun();
        spawnNext();
        updateHUD();
      }
    } else {
      cur.vy += (rescue ? 1500 : 2000) * dt;
      cur.y += cur.vy * dt;
      cur.x += cur.rotV * 22 * dt;
      cur.rot += cur.rotV * dt;
      if (rescue) {
        const dx = cur.x - rescue.x;
        const dy = cur.y - 16 - rescue.y;
        const d = Math.hypot(dx, dy) || 1;
        const sp = 640 * dt;
        if (d < 28) {
          rescue.phase = 'carry';
          seChun();
        } else {
          rescue.x += (dx / d) * sp;
          rescue.y += (dy / d) * sp;
          if (cur.y > H + 60) {
            // 間に合わなかったふりをして画面外でキャッチ (理不尽な失敗にしない)
            rescue.phase = 'carry';
            rescue.x = cur.x;
            rescue.y = cur.y - 20;
          }
        }
      } else if (cur.y > H + 80) {
        gameOver();
      }
    }
  }

  if (fork) fork.t += dt;
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

// face: 'awake' | 'sleep' | null
function drawPancake(x, yTop, w, opts) {
  const o = opts || {};
  const def = TYPES[o.type || 'normal'];
  const h = BH - 3;
  ctx.save();
  ctx.translate(x, yTop);
  if (o.rot) ctx.rotate(o.rot);
  if (o.rainbow) ctx.filter = `hue-rotate(${(performance.now() / 6) % 360}deg) saturate(1.4)`;
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, def.colors[0]);
  g.addColorStop(0.55, def.colors[1]);
  g.addColorStop(1, def.colors[2]);
  roundRect(-w / 2, 0, w, h, 13);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = def.edge;
  ctx.stroke();
  ctx.fillStyle = o.type === 'koge' ? 'rgba(200,160,110,0.35)' : 'rgba(255, 244, 205, 0.8)';
  ctx.beginPath();
  ctx.ellipse(0, 4.5, Math.max(6, w / 2 - 8), 4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (o.face && w >= 52) {
    const ink = o.type === 'koge' ? '#ffe9c9' : '#6b4423';
    ctx.fillStyle = ink;
    ctx.strokeStyle = ink;
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    if (o.face === 'sleep' || faceHappy > 0 && o.face === 'awake') {
      // 閉じ目 (すやすや / にっこりは同じ弧)
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
    if (o.type === 'koge') {
      // ぷんすか眉
      for (const s of [-1, 1]) {
        ctx.beginPath();
        ctx.moveTo(s * 13, 9);
        ctx.lineTo(s * 5, 11.5);
        ctx.stroke();
      }
      ctx.beginPath();
      ctx.moveTo(-3.5, 18.5);
      ctx.lineTo(3.5, 18.5);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(0, 17, 3.8, 0.15 * Math.PI, 0.85 * Math.PI);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255, 145, 165, 0.55)';
    for (const s of [-1, 1]) {
      ctx.beginPath();
      ctx.ellipse(s * 17, 17.5, 3.6, 2.4, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawBubble(x, y, text) {
  ctx.font = `700 13px ${BODY_FONT}`;
  const tw = ctx.measureText(text).width;
  const bw = tw + 20, bh = 26;
  const bx = Math.min(W - bw / 2 - 6, Math.max(bw / 2 + 6, x));
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = 'rgba(242,113,143,0.5)';
  ctx.lineWidth = 2;
  roundRect(bx - bw / 2, y - bh - 12, bw, bh, 12);
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(bx - 5, y - 13);
  ctx.lineTo(bx + 5, y - 13);
  ctx.lineTo(bx, y - 5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#a3547a';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, bx, y - bh / 2 - 11);
}

// ライバルの旗と自己ベストのライン
function drawMarkers() {
  const marks = rivals.map((r) => ({ label: `🚩 ${r.name}`, score: r.score, passed: r.passed, color: '#f2718f' }));
  if (best > 0) marks.push({ label: '💗 じこベスト', score: best, passed: blocks.length > best, color: '#f2a93b' });
  ctx.font = `800 11px ${BODY_FONT}`;
  ctx.textBaseline = 'middle';
  for (const m of marks) {
    const y = baseY() - m.score * BH + cam;
    if (y < -20 || y > H + 20) continue;
    ctx.globalAlpha = m.passed ? 0.3 : 0.85;
    ctx.strokeStyle = m.color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 6]);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
    ctx.setLineDash([]);
    const text = `${m.label} ${m.score}だん${m.passed ? ' ✓' : ''}`;
    const tw = ctx.measureText(text).width;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    roundRect(W - tw - 24, y - 10, tw + 16, 20, 10);
    ctx.fill();
    ctx.fillStyle = '#7a5236';
    ctx.textAlign = 'left';
    ctx.fillText(text, W - tw - 16, y + 1);
  }
  ctx.globalAlpha = 1;
}

function draw(now) {
  const t = now / 1000;

  const { top, bot } = bgColors(bgN);
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, `rgb(${top[0] | 0},${top[1] | 0},${top[2] | 0})`);
  g.addColorStop(1, `rgb(${bot[0] | 0},${bot[1] | 0},${bot[2] | 0})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  const nightT = Math.min(1, Math.max(0, (bgN - 26) / 12));
  if (nightT > 0) {
    ctx.fillStyle = '#fff';
    for (const s of stars) {
      ctx.globalAlpha = nightT * (0.4 + 0.6 * Math.abs(Math.sin(t * 1.2 + s.tw)));
      ctx.beginPath();
      ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

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

  if (state !== STATE.TITLE) drawMarkers();

  const by = baseY();

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

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const wob = Math.sin(t * 1.5 + i * 0.55) * Math.min(4, i * 0.12);
    const y = by - (i + 1) * BH + cam;
    if (y > H + 40 || y < -60) continue;
    // 積まれた子はすやすや寝てる
    drawPancake(b.x + wob, y, b.w, { face: 'sleep', type: b.type });
    if (b.topping) {
      ctx.font = `17px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(b.topping, b.x + wob, y + (BH - 3) / 2 + 1);
    }
  }

  if (cur) {
    drawPancake(cur.x, cur.y, cur.w, {
      face: 'awake', rot: cur.rot, type: cur.type, rainbow: combo >= 5,
    });
    if (!cur.dropping && !cur.missing) {
      ctx.fillStyle = 'rgba(255, 158, 181, 0.25)';
      roundRect(cur.x - cur.w / 2, towerTopY() - BH, cur.w, BH - 3, 13);
      ctx.fill();
      if (cur.say && cur.sayT < 1.6) drawBubble(cur.x, cur.y, cur.say);
    }
    // 救助の小鳥
    if (cur.rescue) {
      ctx.font = `26px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.save();
      ctx.translate(cur.rescue.x, cur.rescue.y);
      if (cur.rescue.x < W / 2 === false) ctx.scale(-1, 1);
      ctx.fillText('🐦', 0, 0);
      ctx.restore();
    }
  }

  // ゲームオーバー: 巨大フォークが「ぱくっ」しに来る
  if (fork) {
    const p = Math.min(1, fork.t / 0.6);
    const ease = 1 - Math.pow(1 - p, 3);
    const fx = lerp(W + 80, towerX() + 46, ease);
    const fy = towerTopY() - 26 + Math.sin(fork.t * 5) * 3;
    ctx.font = `52px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(-0.5 + Math.sin(fork.t * 5) * 0.06);
    ctx.fillText('🍴', 0, 0);
    ctx.restore();
  }

  for (const p of particles) {
    ctx.globalAlpha = Math.min(1, p.life / 0.4);
    if (p.emoji) {
      ctx.font = `16px ${EMOJI_FONT}`;
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

async function fetchRivals() {
  try {
    const r = await fetch(`${API}?game=cake`);
    if (!r.ok) return;
    const data = await r.json();
    const n = blocks.length;
    rivals = (data.top || [])
      .filter((e) => e.score > 0 && e.name !== savedName)
      .map((e) => ({ name: e.name, score: e.score, passed: n > e.score }));
    updateHUD();
  } catch (e) {}
}
fetchRivals();

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
    const idx = topList.findIndex((e) => e.name === savedName);
    if (idx >= 0) {
      top10Badge.textContent = idx === 0 ? '👑 いま世界1位!' : `🌏 世界${idx + 1}位にランクイン!`;
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

// テスト自動化用の覗き穴 (ゲームには影響しない)
window.__cakeDebug = () => ({
  state,
  curX: cur ? cur.x : null,
  curW: cur ? cur.w : null,
  swinging: !!(cur && !cur.dropping && !cur.missing),
  towerX: towerX(),
  floors: blocks.length,
  combo,
  okawari,
});
