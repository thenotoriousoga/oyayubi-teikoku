'use strict';

// ===== DOM =====
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const roundEl = document.getElementById('round');
const heartsEl = document.getElementById('hearts');
const bestEl = document.getElementById('best');
const bannerEl = document.getElementById('banner');
const hintEl = document.getElementById('hint');
const startOverlay = document.getElementById('start-overlay');
const introOverlay = document.getElementById('intro-overlay');
const introRoundEl = document.getElementById('intro-round');
const introCountryEl = document.getElementById('intro-country');
const introKeeperEl = document.getElementById('intro-keeper');
const introLineEl = document.getElementById('intro-line');
const overOverlay = document.getElementById('over-overlay');
const overHeadEl = document.getElementById('over-head');
const overReasonEl = document.getElementById('over-reason');
const rankTitleEl = document.getElementById('rank-title');
const overScoreEl = document.getElementById('over-score');
const overBestEl = document.getElementById('over-best');
const overCommentEl = document.getElementById('over-comment');
const overTapEl = document.getElementById('over-tap');
const rankOverlay = document.getElementById('rank-overlay');
const rankListEl = document.getElementById('rank-list');
const rankEntryEl = document.getElementById('rank-entry');
const nameInput = document.getElementById('name-input');
const submitBtn = document.getElementById('submit-score');
const showRankStartBtn = document.getElementById('show-rank-start');
const showRankOverBtn = document.getElementById('show-rank-over');
const bubbleEl = document.getElementById('bubble');
const bubbleMainEl = document.getElementById('bubble-main');
const bubbleSubEl = document.getElementById('bubble-sub');

// ===== レイアウト =====
let W = 0, H = 0, dpr = 1;
const L = {};
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

// ===== キーパー名鑑 =====
// power: これを ballPower(速さ×大きさ, 0..1) が上回ると吹っ飛ぶ
// swayAmp/reach は goalHalf 比、diveSpeed は goalHalf/ms
const KEEPERS = [
  {
    name: '子犬のポチ', emoji: '🐶', country: 'ちびっこ幼稚園選抜', round: '壮行試合',
    power: 0.04, swayAmp: 0.16, swayPeriod: 2800, diveSpeed: 0.00035, reactMs: 520, reach: 0.10, scale: 0.5,
    intro: ['わん!', '(あそんでくれるの?)'],
    save: ['わん!!', '(ボールとれたよ!)'],
    hit: ['きゃうん!', '(たのしかった〜)'],
    draw: drawPochi,
  },
  {
    name: '小学生ケンタ', emoji: '🧢', country: '全国少年団選抜', round: '壮行試合',
    power: 0.10, swayAmp: 0.24, swayPeriod: 2300, diveSpeed: 0.0006, reactMs: 420, reach: 0.14, scale: 0.7,
    intro: ['ぜったい止めるもん!', '(母ちゃん見てて)'],
    save: ['やった〜!!', '(母ちゃん見た!?)'],
    hit: ['うわ〜ん!', '(でも楽しい)'],
    draw: drawKenta,
  },
  {
    name: 'ラーメン職人 麺蔵', emoji: '🍜', country: 'ヌードル帝国', round: 'アジア予選',
    power: 0.18, swayAmp: 0.3, swayPeriod: 2000, diveSpeed: 0.0008, reactMs: 360, reach: 0.17, scale: 0.9,
    intro: ['守りは麺の硬さと同じ', '(バリカタよ)'],
    save: ['ズズッ', '(いただきました)'],
    hit: ['のびた〜!?', '(麺もワシも)'],
    draw: drawMenzo,
  },
  {
    name: 'キン・マッスル', emoji: '💪', country: 'マッチョ共和国', round: 'アジア最終予選',
    power: 0.38, swayAmp: 0.26, swayPeriod: 1800, diveSpeed: 0.0009, reactMs: 330, reach: 0.20, scale: 1.05,
    intro: ['筋肉は裏切らない', '(大胸筋で受け止める)'],
    save: ['ナイスマッスル!!', '(大胸筋キャッチ)'],
    hit: ['筋肉が!?', '(裏切った…)'],
    draw: drawMuscle,
  },
  {
    name: 'カベルマン', emoji: '🧱', country: 'ドイツ代表', round: 'グループリーグ',
    power: 0.30, swayAmp: 0.18, swayPeriod: 1900, diveSpeed: 0.0007, reactMs: 300, reach: 0.30, scale: 1.0,
    intro: ['私は壁だ', '(文字どおり)'],
    save: ['カチッ', '(壁に穴は無い)'],
    hit: ['壁が…!', '(崩れた…)'],
    draw: drawKabelmann,
  },
  {
    name: 'ゴムゴム・ダ・シウバ', emoji: '🕺', country: 'ブラジル代表', round: 'グループリーグ',
    power: 0.35, swayAmp: 0.42, swayPeriod: 1300, diveSpeed: 0.0013, reactMs: 280, reach: 0.26, scale: 1.0,
    intro: ['リズムに乗りな', '(腕は伸びるぜ)'],
    save: ['ビヨーン', '(届いちゃうんだな)'],
    hit: ['ノーリズム!?', '(読めなかった)'],
    draw: drawGomgom,
  },
  {
    name: 'エル・プルポ', emoji: '🐙', country: 'スペイン代表', round: '準々決勝',
    power: 0.50, swayAmp: 0.3, swayPeriod: 1400, diveSpeed: 0.0014, reactMs: 250, reach: 0.30, scale: 1.05,
    intro: ['腕は8本ある', '(どこに打つ気だ?)'],
    save: ['ぬるり', '(タコに死角なし)'],
    hit: ['スミを吐くしか…', '(墨切れだ…)'],
    draw: drawPulpo,
  },
  {
    name: 'GK-9000', emoji: '🤖', country: 'AI連邦', round: '準決勝',
    power: 0.62, swayAmp: 0.14, swayPeriod: 1000, diveSpeed: 0.0018, reactMs: 160, reach: 0.26, scale: 1.0,
    intro: ['解析完了。', '(君のPK成功率: 2%)'],
    save: ['計算通り。', '(誤差0.00mm)'],
    hit: ['計算外…', '(再起動シマス…)'],
    draw: drawRobot,
  },
  {
    name: '魔王ゲルド', emoji: '👹', country: '魔王国ダークニル', round: '決勝',
    power: 0.80, swayAmp: 0.34, swayPeriod: 1100, diveSpeed: 0.0019, reactMs: 150, reach: 0.32, scale: 1.15,
    intro: ['よくぞここまで来た', '(だがここまでだ)'],
    save: ['フハハハ!', '(絶望を知れ)'],
    hit: ['バカな…!', '(魔王軍撤退ーッ)'],
    draw: drawMaou,
  },
  {
    name: 'ゴールの神', emoji: '🌌', country: '神々の国オリンポス', round: '神試合',
    power: 9.99, swayAmp: 0.30, swayPeriod: 900, diveSpeed: 0.0022, reactMs: 120, reach: 0.34, scale: 1.3,
    intro: ['我を抜く者、神となる', '(まぐれは通じぬ)'],
    save: ['────。', '(それが人の限界か)'],
    hit: ['見事。', '(人よ、神になれ)'],
    draw: drawGod,
  },
];

const TOTAL = KEEPERS.length;

// ===== 状態 =====
const STATE = {
  TITLE: 'title', INTRO: 'intro',
  AIM_DIR: 'aim_dir', AIM_POWER: 'aim_power', AIM_SIZE: 'aim_size',
  RETRY: 'retry', SHOOT: 'shoot', GOAL: 'goal', OVER: 'over',
};
let state = STATE.TITLE;
let stageIdx = 0;
let hearts = 3;
let best = 0;
try { best = parseInt(localStorage.getItem('pk_best') || '0', 10) || 0; } catch (e) {}

let phaseStart = 0;   // 現在のゲージフェーズ開始時刻
let plan = null;      // { angle, speed, size } 選択途中の値
let shot = null;
let keeperFX = null;  // 吹っ飛び演出 { type:'blow'|'demolish', dir, startT }
let goalBroken = false;
let timeNow = 0;
let fx = { netShake: 0, flash: 0, shake: 0, trail: [] };
let particles = [];

// デバッグ: ?stage=N で任意ステージ開始
let startStage = 0;
{
  const q = parseInt(new URLSearchParams(location.search).get('stage'), 10);
  if (q >= 1 && q <= TOTAL) startStage = q - 1;
}

// キーパーのスウェー
let keeperPhase = Math.random() * Math.PI * 2;
let keeperIdleX = 0;

function K() { return KEEPERS[Math.min(stageIdx, TOTAL - 1)]; }

// ===== スコア =====
function currentScore() { return stageIdx * 10 + hearts; }
function scoreLabel(s) {
  const beaten = Math.floor(s / 10);
  const hp = s % 10;
  return beaten >= TOTAL ? `完全制覇 ❤️${hp}` : `第${beaten + 1}戦 ❤️${hp}`;
}
function rankTitle(beaten) {
  if (beaten >= 10) return 'LEGEND';
  if (beaten >= 9) return '人類最強(神には届かず)';
  if (beaten >= 8) return '銀メダル';
  if (beaten >= 7) return 'ベスト8の壁';
  if (beaten >= 5) return '世界デビュー';
  if (beaten >= 3) return 'アジアの壁';
  if (beaten >= 1) return '国内レベル';
  return '見学者';
}

// ===== サウンド =====
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

function thump(freq, when, gain, dur) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(freq, when);
  o.frequency.exponentialRampToValueAtTime(Math.max(30, freq * 0.55), when + dur);
  g.gain.setValueAtTime(gain, when);
  g.gain.exponentialRampToValueAtTime(0.001, when + dur);
  o.connect(g).connect(AC.destination);
  o.start(when); o.stop(when + dur + 0.02);
}

let lastBeat = 0;
function heartbeat() {
  if (!AC) return;
  const t = AC.currentTime;
  if (t - lastBeat < 0.95) return;
  lastBeat = t;
  thump(70, t, 0.30, 0.10);
  thump(60, t + 0.16, 0.22, 0.10);
}

function playTap() {
  if (!AC) return;
  const t = AC.currentTime;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'square';
  o.frequency.value = 880;
  g.gain.setValueAtTime(0.08, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
  o.connect(g).connect(AC.destination);
  o.start(t); o.stop(t + 0.07);
}

function playKick(power) {
  if (!AC) return;
  const t = AC.currentTime;
  thump(150 + power * 80, t, 0.4 + power * 0.3, 0.15);
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
  const n = AC.createBufferSource(), ng = AC.createGain(), nf = AC.createBiquadFilter();
  n.buffer = noiseBuf; n.loop = true;
  nf.type = 'bandpass'; nf.frequency.value = 1100; nf.Q.value = 0.6;
  ng.gain.setValueAtTime(0.001, t);
  ng.gain.exponentialRampToValueAtTime(0.35, t + 0.12);
  ng.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
  n.connect(nf).connect(ng).connect(AC.destination);
  n.start(t); n.stop(t + 1);
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

function playBlow(big) {
  if (!AC) return;
  const t = AC.currentTime;
  thump(big ? 55 : 75, t, 0.55, big ? 0.4 : 0.25);
  const n = AC.createBufferSource(), ng = AC.createGain(), nf = AC.createBiquadFilter();
  n.buffer = noiseBuf;
  nf.type = 'lowpass'; nf.frequency.value = big ? 500 : 1200;
  ng.gain.setValueAtTime(big ? 0.5 : 0.3, t);
  ng.gain.exponentialRampToValueAtTime(0.001, t + (big ? 0.6 : 0.3));
  n.connect(nf).connect(ng).connect(AC.destination);
  n.start(t); n.stop(t + 0.7);
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

// ===== 演出ユーティリティ =====
function showBanner(text, color) {
  bannerEl.textContent = text;
  bannerEl.style.color = color || '#ffc93c';
  bannerEl.classList.remove('pop');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('pop');
}

let bubbleTimer = null;
function speak(pair, ms = 1900) {
  bubbleMainEl.textContent = pair[0];
  bubbleSubEl.textContent = pair[1];
  bubbleEl.classList.remove('hidden');
  clearTimeout(bubbleTimer);
  bubbleTimer = setTimeout(() => bubbleEl.classList.add('hidden'), ms);
}

function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

function burstConfetti(x, y, n) {
  const colors = ['#ffc93c', '#f2fbf4', '#5fd47f', '#ff5a48', '#7fd4ff'];
  for (let i = 0; i < (n || 70); i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 0.15 + Math.random() * 0.4;
    particles.push({
      type: 'rect', x, y,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 0.25,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.02,
      color: colors[Math.floor(Math.random() * colors.length)],
      life: 1200 + Math.random() * 500,
    });
  }
}

// ゴール粉砕: 枠の破片
function burstGoalPieces() {
  for (let i = 0; i < 26; i++) {
    const alongTop = Math.random() < 0.5;
    const x = alongTop ? L.cx - L.goalHalf + Math.random() * L.goalW : L.cx + (Math.random() < 0.5 ? -1 : 1) * L.goalHalf;
    const y = alongTop ? L.goalTop : L.goalTop + Math.random() * L.goalH;
    particles.push({
      type: 'bar', x, y,
      vx: (Math.random() - 0.5) * 0.6, vy: -0.3 - Math.random() * 0.4,
      rot: Math.random() * Math.PI, vr: (Math.random() - 0.5) * 0.03,
      len: 14 + Math.random() * 30,
      life: 1600 + Math.random() * 600,
    });
  }
}

function updateParticles(dt) {
  for (const p of particles) {
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.type !== 'emoji') p.vy += 0.001 * dt;
    p.rot += p.vr * dt;
  }
  particles = particles.filter((p) => p.life > 0 && p.y < H + 80);
}

function drawParticles() {
  for (const p of particles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rot);
    ctx.globalAlpha = Math.min(1, p.life / 400);
    if (p.type === 'rect') {
      ctx.fillStyle = p.color;
      ctx.fillRect(-4, -6, 8, 12);
    } else if (p.type === 'bar') {
      ctx.fillStyle = '#f5f5f5';
      ctx.fillRect(-p.len / 2, -L.postW / 2, p.len, L.postW);
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;
}

// ===== ゲーム進行 =====
function updateHUD() {
  roundEl.textContent = stageIdx + 1;
  heartsEl.textContent = '❤️'.repeat(hearts) + '🖤'.repeat(3 - hearts);
  bestEl.textContent = best > 0 ? scoreLabel(best) : '—';
}

function beginGame() {
  stageIdx = startStage;
  hearts = 3;
  goalBroken = false;
  keeperFX = null;
  shot = null;
  particles = [];
  startOverlay.classList.add('hidden');
  overOverlay.classList.add('hidden');
  updateHUD();
  showIntro();
}

function showIntro() {
  const k = K();
  state = STATE.INTRO;
  shot = null;
  plan = null;
  keeperFX = null;
  goalBroken = false;
  introRoundEl.textContent = `第${stageIdx + 1}戦・${k.round}`;
  introCountryEl.textContent = `VS ${k.country}`;
  introKeeperEl.textContent = `${k.emoji} GK ${k.name}`;
  introLineEl.textContent = `${k.intro[0]}${k.intro[1]}`;
  introOverlay.classList.remove('hidden');
  updateHUD();
}

function enterAim() {
  introOverlay.classList.add('hidden');
  state = STATE.AIM_DIR;
  plan = { angle: 0, speed: 0, size: 0 };
  phaseStart = timeNow;
  shot = null;
  hintEl.textContent = pick([
    'たった一度のチャンス、逃すな。',
    'これを決めれば、勝利。',
    '世界が見ている。',
    '足が震えても、前へ。',
  ]);
  hintEl.classList.add('show');
  speak(K().intro, 2000);
}

// ゲージの現在値(決定論・時間ベース)
function tri(elapsed, period) {
  const f = (elapsed % period) / period;
  return 1 - Math.abs(2 * f - 1);
}
function currentAngle() {
  const maxA = Math.atan((L.goalHalf * 1.3) / (L.ballY - L.goalBottom));
  return Math.sin(((timeNow - phaseStart) / 1400) * Math.PI * 2) * maxA;
}
function currentSpeed() { return tri(timeNow - phaseStart, 950); }
function currentSize() { return tri(timeNow - phaseStart, 650); }

function doShoot() {
  hintEl.classList.remove('show');
  const k = K();
  const { angle, speed, size } = plan;

  const flightMs = 900 - 500 * speed;
  const targetX = L.ballX + Math.tan(angle) * (L.ballY - L.goalBottom);
  const off = targetX - L.cx;
  const ballDrawR = L.ballR * (0.5 + size * 2.0);
  const ballPower = speed * size;

  // キーパーは今の位置からボールへダイブ
  const x0 = keeperIdleX;
  keeperDiveX0 = x0;
  const diveTargetX = Math.max(L.cx - L.goalHalf, Math.min(L.cx + L.goalHalf, targetX));
  const moved = Math.max(0, flightMs - k.reactMs) * k.diveSpeed * L.goalHalf;
  const delta = diveTargetX - x0;
  const arrivalX = x0 + Math.max(-moved, Math.min(moved, delta));
  const reached = Math.abs(arrivalX - targetX) < k.reach * L.goalHalf + ballDrawR * 0.8;

  let outcome;
  if (Math.abs(off) > L.goalHalf - L.postW) {
    outcome = 'wide';
  } else if (size >= 0.95 && ballPower > k.power) {
    outcome = 'demolish';
  } else if (ballPower > k.power && reached) {
    outcome = 'blow';       // 正面で受けたが吹っ飛ぶ
  } else if (reached) {
    outcome = 'save';       // パワー負けでキャッチ
  } else {
    outcome = 'goal';       // コース勝ち
  }

  shot = {
    t: 0, dur: flightMs,
    sx: L.ballX, sy: L.ballY,
    tx: targetX, ty: L.goalBottom - L.goalH * (0.25 + speed * 0.55),
    r: ballDrawR, speed, size,
    outcome, arrivalX, resolved: false,
  };
  fx.trail = [];
  state = STATE.SHOOT;
  playKick(ballPower);
  vibrate(20);
}

function nextStage() {
  stageIdx++;
  if (stageIdx >= TOTAL) {
    endGame(true);
  } else {
    setTimeout(() => showIntro(), 500);
  }
}

function resolveShot() {
  const k = K();
  const o = shot.outcome;

  if (o === 'demolish') {
    goalBroken = true;
    keeperFX = { type: 'demolish', dir: shot.tx >= L.cx ? 1 : -1, startT: timeNow, fromX: shot.arrivalX };
    burstGoalPieces();
    burstConfetti(shot.tx, shot.ty, 90);
    fx.shake = 1.6;
    fx.flash = 1;
    showBanner('ゴールごと粉砕!!', '#ffc93c');
    speak(k.hit, 2200);
    playBlow(true);
    vibrate([60, 40, 120]);
    state = STATE.GOAL;
    setTimeout(() => nextStage(), 1900);
  } else if (o === 'blow') {
    keeperFX = { type: 'blow', dir: shot.tx >= shot.arrivalX ? 1 : -1, startT: timeNow, fromX: shot.arrivalX };
    burstConfetti(shot.tx, shot.ty, 70);
    fx.netShake = 1;
    fx.shake = 1;
    fx.flash = 1;
    showBanner('ふっとばした!!', '#ffc93c');
    speak(k.hit, 2000);
    playBlow(false);
    vibrate([40, 30, 80]);
    state = STATE.GOAL;
    setTimeout(() => nextStage(), 1700);
  } else if (o === 'goal') {
    burstConfetti(shot.tx, shot.ty, 60);
    fx.netShake = 1;
    fx.flash = 1;
    showBanner(pick(['GOAL!', 'ゴラッソ!!', 'コース完璧!']), '#ffc93c');
    speak(k.hit, 2000);
    playGoal();
    vibrate([30, 40, 60]);
    state = STATE.GOAL;
    setTimeout(() => nextStage(), 1500);
  } else {
    // save / wide → ハート-1
    hearts--;
    updateHUD();
    fx.shake = 0.7;
    showBanner(o === 'save' ? 'SAVE!' : '枠の外!', '#ff5a48');
    if (o === 'save') speak(k.save, 2000);
    playFail();
    vibrate(120);
    if (hearts > 0) {
      state = STATE.RETRY;
      setTimeout(() => {
        if (state === STATE.RETRY) {
          state = STATE.AIM_DIR;
          plan = { angle: 0, speed: 0, size: 0 };
          phaseStart = timeNow;
          shot = null;
          hintEl.textContent = hearts === 1 ? 'ラストチャンス。すべてを込めろ。' : 'まだ終わっていない。';
          hintEl.classList.add('show');
        }
      }, 1400);
    } else {
      endGame(false);
    }
  }
}

function endGame(cleared) {
  state = STATE.OVER;
  const sc = currentScore();
  if (sc > best) {
    best = sc;
    try { localStorage.setItem('pk_best', String(best)); } catch (e) {}
  }
  setTimeout(() => {
    const k = K();
    if (cleared) {
      overOverlay.classList.add('clear');
      overHeadEl.textContent = '世界の、その先へ。';
      overReasonEl.textContent = '神を打ち抜き、伝説になった';
      overCommentEl.textContent = `${KEEPERS[TOTAL - 1].hit[0]}${KEEPERS[TOTAL - 1].hit[1]}`;
      burstConfetti(W / 2, H * 0.3, 120);
      overTapEl.textContent = 'タップでもう一度伝説を';
    } else {
      overOverlay.classList.remove('clear');
      overHeadEl.textContent = '日本、ここで散る…';
      overReasonEl.textContent = `第${stageIdx + 1}戦 ${k.name} に敗北`;
      overCommentEl.textContent = `${k.save[0]}${k.save[1]}`;
      overTapEl.textContent = 'タップで再挑戦';
    }
    rankTitleEl.textContent = rankTitle(stageIdx);
    overScoreEl.textContent = scoreLabel(sc);
    overBestEl.textContent = scoreLabel(best);
    rankEntryEl.classList.toggle('hidden', sc < 10);
    nameInput.value = savedName;
    submitBtn.disabled = false;
    submitBtn.textContent = '🏆 世界ランキングに登録';
    overOverlay.classList.remove('hidden');
    updateHUD();
  }, cleared ? 800 : 1000);
}

// ===== 入力 =====
window.addEventListener('pointerdown', (e) => {
  ensureAudio();
  if (state === STATE.AIM_DIR) {
    plan.angle = currentAngle();
    phaseStart = timeNow;
    state = STATE.AIM_POWER;
    playTap();
  } else if (state === STATE.AIM_POWER) {
    plan.speed = Math.max(0.05, currentSpeed());
    phaseStart = timeNow;
    state = STATE.AIM_SIZE;
    playTap();
  } else if (state === STATE.AIM_SIZE) {
    plan.size = Math.max(0.05, currentSize());
    playTap();
    doShoot();
  }
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

startOverlay.addEventListener('click', () => { ensureAudio(); beginGame(); });
overOverlay.addEventListener('click', () => { ensureAudio(); beginGame(); });
introOverlay.addEventListener('click', () => { ensureAudio(); enterAim(); });

// ===== オンラインランキング =====
const API = '/api/scores';
let savedName = '';
try { savedName = localStorage.getItem('pk_name') || ''; } catch (e) {}

function renderRanking(top, highlightName) {
  rankListEl.innerHTML = '';
  if (!top.length) {
    const li = document.createElement('li');
    li.className = 'rank-loading';
    li.textContent = 'まだ記録がない。最初の伝説になれ!';
    rankListEl.appendChild(li);
    return;
  }
  top.forEach((entry, i) => {
    const li = document.createElement('li');
    const medal = ['🥇', '🥈', '🥉'][i] || ` ${i + 1}. `;
    li.textContent = `${medal} ${entry.name} — ${scoreLabel(entry.score)}`;
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
      body: JSON.stringify({ name, score: currentScore() }),
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

// ===== 描画: 背景・ゴール =====
function drawBackground() {
  const sky = ctx.createLinearGradient(0, 0, 0, L.horizon);
  sky.addColorStop(0, '#0b1c33');
  sky.addColorStop(1, '#14304f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, W, L.horizon);

  ctx.fillStyle = '#1d2b45';
  ctx.fillRect(0, H * 0.08, W, L.horizon - H * 0.08);
  for (const d of crowdDots) {
    const wave = Math.sin(timeNow / 400 + d.x * 0.03) * 1.6;
    ctx.fillStyle = `hsl(${Math.floor(d.c * 360)}, 45%, ${55 + d.c * 20}%)`;
    ctx.fillRect(d.x, d.y + wave, d.size, d.size);
  }

  for (const side of [-1, 1]) {
    const bx = L.cx + side * W * 0.48;
    const beam = ctx.createLinearGradient(bx, 0, L.cx, L.goalBottom);
    beam.addColorStop(0, 'rgba(242, 251, 244, 0.10)');
    beam.addColorStop(1, 'rgba(242, 251, 244, 0)');
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(bx - side * W * 0.05, 0);
    ctx.lineTo(bx + side * W * 0.06, 0);
    ctx.lineTo(L.cx + side * L.goalHalf * 0.4, L.goalBottom);
    ctx.lineTo(L.cx - side * L.goalHalf * 0.6, L.goalBottom);
    ctx.closePath();
    ctx.fill();
  }

  const stripes = 7;
  for (let i = 0; i < stripes; i++) {
    const y0 = L.horizon + ((H - L.horizon) * i) / stripes;
    const y1 = L.horizon + ((H - L.horizon) * (i + 1)) / stripes;
    ctx.fillStyle = i % 2 === 0 ? '#2e8b3d' : '#339843';
    ctx.fillRect(0, y0, W, y1 - y0 + 1);
  }

  // 魔王戦以降は場が暗くなる
  if (stageIdx >= 8 && state !== STATE.TITLE) {
    ctx.fillStyle = stageIdx === 8 ? 'rgba(40, 5, 60, 0.25)' : 'rgba(255, 240, 190, 0.10)';
    ctx.fillRect(0, 0, W, H);
  }

  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.beginPath();
  ctx.ellipse(L.ballX, L.ballY + L.ballR * 0.9, L.ballR * 0.65, L.ballR * 0.22, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawGoal() {
  if (goalBroken) return; // 粉砕済み
  const shakeX = fx.netShake > 0 ? Math.sin(timeNow / 30) * fx.netShake * 6 : 0;
  const gl = L.cx - L.goalHalf, gr = L.cx + L.goalHalf;
  const gt = L.goalTop, gb = L.goalBottom;
  const depth = L.goalH * 0.28;

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

// ===== 描画: キーパー10人 =====
// 各drawXxx(sz, pose): 原点=足元中央、上が負。sz=身長相当。pose={stretch, phase}

function drawPochi(sz, pose) {
  const r = sz * 0.34;
  // 尻尾(ふりふり)
  ctx.strokeStyle = '#c89b6a';
  ctx.lineWidth = r * 0.3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(r * 0.7, -r * 0.9);
  ctx.quadraticCurveTo(r * 1.3, -r * 1.4 + Math.sin(pose.phase * 3) * r * 0.3, r * 1.5, -r * 1.1);
  ctx.stroke();
  // 体
  ctx.fillStyle = '#e0b57e';
  ctx.beginPath();
  ctx.ellipse(0, -r, r * 1.1, r, 0, 0, Math.PI * 2);
  ctx.fill();
  // 頭
  ctx.beginPath();
  ctx.arc(0, -r * 2.1, r * 0.85, 0, Math.PI * 2);
  ctx.fill();
  // 耳(たれ耳)
  ctx.fillStyle = '#c89b6a';
  ctx.beginPath();
  ctx.ellipse(-r * 0.75, -r * 2.3, r * 0.3, r * 0.55, -0.5, 0, Math.PI * 2);
  ctx.ellipse(r * 0.75, -r * 2.3, r * 0.3, r * 0.55, 0.5, 0, Math.PI * 2);
  ctx.fill();
  // 顔
  ctx.fillStyle = '#3a2d22';
  ctx.beginPath();
  ctx.arc(-r * 0.3, -r * 2.2, r * 0.1, 0, Math.PI * 2);
  ctx.arc(r * 0.3, -r * 2.2, r * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -r * 1.95, r * 0.13, 0, Math.PI * 2);
  ctx.fill();
  // 舌
  ctx.fillStyle = '#ff8a9b';
  ctx.beginPath();
  ctx.ellipse(0, -r * 1.7, r * 0.14, r * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // 前足
  ctx.fillStyle = '#e0b57e';
  ctx.beginPath();
  ctx.ellipse(-r * 0.6 - pose.stretch * r, -r * 0.4, r * 0.28, r * 0.42, 0, 0, Math.PI * 2);
  ctx.ellipse(r * 0.6 + pose.stretch * r, -r * 0.4, r * 0.28, r * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();
}

function humanoid(sz, pose, opt) {
  const w = sz * 0.42;
  // 脚
  ctx.strokeStyle = opt.pants || '#2b3a55';
  ctx.lineWidth = w * 0.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-w * 0.18, -sz * 0.16);
  ctx.lineTo(-w * 0.24, 0);
  ctx.moveTo(w * 0.18, -sz * 0.16);
  ctx.lineTo(w * 0.24, 0);
  ctx.stroke();
  // 腕
  const armY = -sz * 0.52;
  const armLen = w * (0.55 + pose.stretch * 0.9) * (opt.armScale || 1);
  const lift = 0.25 + pose.stretch * 0.85;
  ctx.strokeStyle = opt.shirt;
  ctx.lineWidth = w * (opt.armW || 0.2);
  ctx.beginPath();
  ctx.moveTo(-w * 0.35, armY);
  ctx.lineTo(-w * 0.35 - armLen * Math.cos(lift * 0.5), armY - armLen * Math.sin(lift));
  ctx.moveTo(w * 0.35, armY);
  ctx.lineTo(w * 0.35 + armLen * Math.cos(lift * 0.5), armY - armLen * Math.sin(lift));
  ctx.stroke();
  // 手
  ctx.fillStyle = opt.skin || '#ffcf9e';
  ctx.beginPath();
  ctx.arc(-w * 0.35 - armLen * Math.cos(lift * 0.5), armY - armLen * Math.sin(lift), w * 0.14, 0, Math.PI * 2);
  ctx.arc(w * 0.35 + armLen * Math.cos(lift * 0.5), armY - armLen * Math.sin(lift), w * 0.14, 0, Math.PI * 2);
  ctx.fill();
  // 胴体
  ctx.fillStyle = opt.shirt;
  ctx.beginPath();
  ctx.roundRect(-w * (opt.bodyW || 0.42), -sz * 0.62, w * (opt.bodyW || 0.42) * 2, sz * 0.48, w * 0.2);
  ctx.fill();
  // 頭
  const headY = -sz * 0.76, headR = sz * 0.13;
  ctx.fillStyle = opt.skin || '#ffcf9e';
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  return { w, headY, headR };
}

function drawKenta(sz, pose) {
  const { headY, headR } = humanoid(sz, pose, { shirt: '#4aa3ff', pants: '#33415e' });
  // 帽子(後ろかぶり)
  ctx.fillStyle = '#ff5a48';
  ctx.beginPath();
  ctx.arc(0, headY - headR * 0.25, headR * 1.02, Math.PI, Math.PI * 2);
  ctx.fill();
  ctx.fillRect(headR * 0.5, headY - headR * 0.45, headR * 0.9, headR * 0.35);
  // 目
  ctx.fillStyle = '#26221f';
  ctx.beginPath();
  ctx.arc(-headR * 0.32, headY + headR * 0.05, headR * 0.11, 0, Math.PI * 2);
  ctx.arc(headR * 0.32, headY + headR * 0.05, headR * 0.11, 0, Math.PI * 2);
  ctx.fill();
}

function drawMenzo(sz, pose) {
  const { w, headY, headR } = humanoid(sz, pose, { shirt: '#f5f0e6', pants: '#3a3a3a' });
  // 鉢巻
  ctx.fillStyle = '#26418f';
  ctx.fillRect(-headR, headY - headR * 0.55, headR * 2, headR * 0.32);
  // どんぶり(左手に)
  const bx = -w * 0.95, by = -sz * 0.62;
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(bx, by, headR * 0.72, 0, Math.PI, false);
  ctx.fill();
  ctx.strokeStyle = '#c33';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(bx, by, headR * 0.6, 0.2, Math.PI - 0.2, false);
  ctx.stroke();
  // 湯気
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 2;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    const sx = bx + i * headR * 0.3;
    ctx.moveTo(sx, by - headR * 0.2);
    ctx.quadraticCurveTo(sx + Math.sin(pose.phase * 2 + i) * 4, by - headR * 0.9, sx, by - headR * 1.5);
    ctx.stroke();
  }
  // 目(閉じ目・職人)
  ctx.strokeStyle = '#26221f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-headR * 0.45, headY);
  ctx.lineTo(-headR * 0.15, headY);
  ctx.moveTo(headR * 0.15, headY);
  ctx.lineTo(headR * 0.45, headY);
  ctx.stroke();
}

function drawMuscle(sz, pose) {
  const w = sz * 0.55;
  // 脚
  ctx.strokeStyle = '#d9a066';
  ctx.lineWidth = w * 0.26;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-w * 0.2, -sz * 0.16);
  ctx.lineTo(-w * 0.26, 0);
  ctx.moveTo(w * 0.2, -sz * 0.16);
  ctx.lineTo(w * 0.26, 0);
  ctx.stroke();
  // パンツ
  ctx.fillStyle = '#c62828';
  ctx.beginPath();
  ctx.roundRect(-w * 0.36, -sz * 0.3, w * 0.72, sz * 0.16, w * 0.1);
  ctx.fill();
  // 逆三角の胴体
  ctx.fillStyle = '#e8b075';
  ctx.beginPath();
  ctx.moveTo(-w * 0.62, -sz * 0.62);
  ctx.lineTo(w * 0.62, -sz * 0.62);
  ctx.lineTo(w * 0.25, -sz * 0.26);
  ctx.lineTo(-w * 0.25, -sz * 0.26);
  ctx.closePath();
  ctx.fill();
  // 胸筋ライン
  ctx.strokeStyle = '#c98f55';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -sz * 0.6);
  ctx.lineTo(0, -sz * 0.45);
  ctx.stroke();
  // 力こぶ両腕(ダブルバイセップス)
  const flex = 0.3 + pose.stretch * 0.5 + Math.abs(Math.sin(pose.phase)) * 0.08;
  for (const s of [-1, 1]) {
    ctx.strokeStyle = '#e8b075';
    ctx.lineWidth = w * 0.3;
    ctx.beginPath();
    ctx.moveTo(s * w * 0.55, -sz * 0.58);
    ctx.lineTo(s * w * (0.85 + flex * 0.2), -sz * 0.52);
    ctx.lineTo(s * w * (0.8 + flex * 0.1), -sz * (0.72 + flex * 0.12));
    ctx.stroke();
    // こぶ
    ctx.fillStyle = '#e8b075';
    ctx.beginPath();
    ctx.arc(s * w * 0.82, -sz * 0.6, w * 0.2, 0, Math.PI * 2);
    ctx.fill();
  }
  // 頭(小さめ)
  ctx.fillStyle = '#e8b075';
  ctx.beginPath();
  ctx.arc(0, -sz * 0.74, sz * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#26221f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-sz * 0.05, -sz * 0.76);
  ctx.lineTo(-sz * 0.01, -sz * 0.75);
  ctx.moveTo(sz * 0.05, -sz * 0.76);
  ctx.lineTo(sz * 0.01, -sz * 0.75);
  ctx.stroke();
}

function drawKabelmann(sz, pose) {
  const w = sz * 0.62 * (1 + pose.stretch * 0.25);
  // レンガの壁ボディ
  ctx.fillStyle = '#8d8d94';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -sz * 0.72, w, sz * 0.72, 4);
  ctx.fill();
  ctx.strokeStyle = '#6e6e75';
  ctx.lineWidth = 2;
  const rowsN = 5;
  for (let r = 0; r < rowsN; r++) {
    const y = -sz * 0.72 + (sz * 0.72 * (r + 1)) / rowsN;
    ctx.beginPath();
    ctx.moveTo(-w / 2, y);
    ctx.lineTo(w / 2, y);
    ctx.stroke();
    const off = r % 2 === 0 ? 0 : w / 6;
    for (let c = 0; c < 3; c++) {
      const x = -w / 2 + off + (w / 3) * c;
      ctx.beginPath();
      ctx.moveTo(x, y - sz * 0.72 / rowsN);
      ctx.lineTo(x, y);
      ctx.stroke();
    }
  }
  // 小さな頭(ヘルメット)
  ctx.fillStyle = '#ffcf9e';
  ctx.beginPath();
  ctx.arc(0, -sz * 0.8, sz * 0.09, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4f5b62';
  ctx.beginPath();
  ctx.arc(0, -sz * 0.82, sz * 0.095, Math.PI, Math.PI * 2);
  ctx.fill();
  // 短い腕
  ctx.strokeStyle = '#8d8d94';
  ctx.lineWidth = sz * 0.09;
  ctx.lineCap = 'round';
  const lift = pose.stretch * 0.9;
  ctx.beginPath();
  ctx.moveTo(-w / 2, -sz * 0.55);
  ctx.lineTo(-w / 2 - sz * 0.14, -sz * (0.55 + lift * 0.2));
  ctx.moveTo(w / 2, -sz * 0.55);
  ctx.lineTo(w / 2 + sz * 0.14, -sz * (0.55 + lift * 0.2));
  ctx.stroke();
}

function drawGomgom(sz, pose) {
  const { w, headY, headR } = humanoid(sz, pose, {
    shirt: '#ffd400', pants: '#1a9e4b', skin: '#b07040',
    armScale: 2.2 + pose.stretch * 1.6, armW: 0.14,
  });
  // サングラス
  ctx.fillStyle = '#26221f';
  ctx.fillRect(-headR * 0.6, headY - headR * 0.15, headR * 1.2, headR * 0.3);
  // ステップ(足元の音符的ライン)
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-w, -2);
  ctx.quadraticCurveTo(0, -8 - Math.abs(Math.sin(pose.phase * 2)) * 6, w, -2);
  ctx.stroke();
}

function drawPulpo(sz, pose) {
  const r = sz * 0.30;
  // 触手8本
  ctx.strokeStyle = '#8e44ad';
  ctx.lineWidth = r * 0.28;
  ctx.lineCap = 'round';
  for (let i = 0; i < 8; i++) {
    const a = (i / 7 - 0.5) * Math.PI * (0.8 + pose.stretch * 0.5);
    const len = sz * (0.42 + pose.stretch * 0.3);
    const wob = Math.sin(pose.phase * 2 + i) * r * 0.25;
    ctx.beginPath();
    ctx.moveTo(0, -sz * 0.42);
    ctx.quadraticCurveTo(
      Math.sin(a) * len * 0.6 + wob, -sz * 0.42 + Math.cos(a) * len * 0.3,
      Math.sin(a) * len, -sz * 0.42 + Math.cos(a) * len * 0.9
    );
    ctx.stroke();
  }
  // 頭
  ctx.fillStyle = '#9b59b6';
  ctx.beginPath();
  ctx.ellipse(0, -sz * 0.6, r * 1.15, r * 1.35, 0, 0, Math.PI * 2);
  ctx.fill();
  // 目
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(-r * 0.45, -sz * 0.62, r * 0.3, 0, Math.PI * 2);
  ctx.arc(r * 0.45, -sz * 0.62, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#26221f';
  ctx.beginPath();
  ctx.arc(-r * 0.45, -sz * 0.6, r * 0.13, 0, Math.PI * 2);
  ctx.arc(r * 0.45, -sz * 0.6, r * 0.13, 0, Math.PI * 2);
  ctx.fill();
}

function drawRobot(sz, pose) {
  const w = sz * 0.5;
  // キャタピラ足
  ctx.fillStyle = '#37474f';
  ctx.beginPath();
  ctx.roundRect(-w * 0.55, -sz * 0.12, w * 1.1, sz * 0.12, sz * 0.05);
  ctx.fill();
  // 胴体
  ctx.fillStyle = '#78909c';
  ctx.beginPath();
  ctx.roundRect(-w * 0.45, -sz * 0.6, w * 0.9, sz * 0.48, 6);
  ctx.fill();
  // 胸ランプ
  ctx.fillStyle = '#4dd0e1';
  ctx.beginPath();
  ctx.arc(0, -sz * 0.42, w * 0.1, 0, Math.PI * 2);
  ctx.fill();
  // 腕(ピストン)
  ctx.strokeStyle = '#546e7a';
  ctx.lineWidth = w * 0.16;
  ctx.lineCap = 'round';
  const ext = w * (0.5 + pose.stretch * 1.1);
  ctx.beginPath();
  ctx.moveTo(-w * 0.45, -sz * 0.5);
  ctx.lineTo(-w * 0.45 - ext, -sz * (0.5 + pose.stretch * 0.25));
  ctx.moveTo(w * 0.45, -sz * 0.5);
  ctx.lineTo(w * 0.45 + ext, -sz * (0.5 + pose.stretch * 0.25));
  ctx.stroke();
  // 頭
  ctx.fillStyle = '#90a4ae';
  ctx.beginPath();
  ctx.roundRect(-w * 0.3, -sz * 0.82, w * 0.6, sz * 0.2, 4);
  ctx.fill();
  // 赤い目(スキャン)
  ctx.fillStyle = '#1c1c1c';
  ctx.fillRect(-w * 0.24, -sz * 0.78, w * 0.48, sz * 0.08);
  const scanX = Math.sin(pose.phase * 3) * w * 0.18;
  ctx.fillStyle = '#ff1744';
  ctx.fillRect(scanX - w * 0.05, -sz * 0.78, w * 0.1, sz * 0.08);
  // アンテナ
  ctx.strokeStyle = '#90a4ae';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -sz * 0.82);
  ctx.lineTo(0, -sz * 0.92);
  ctx.stroke();
  ctx.fillStyle = '#ff1744';
  ctx.beginPath();
  ctx.arc(0, -sz * 0.94, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawMaou(sz, pose) {
  // 暗黒オーラ
  const aura = ctx.createRadialGradient(0, -sz * 0.45, sz * 0.1, 0, -sz * 0.45, sz * 0.75);
  aura.addColorStop(0, 'rgba(120, 30, 160, 0.35)');
  aura.addColorStop(1, 'rgba(120, 30, 160, 0)');
  ctx.fillStyle = aura;
  ctx.beginPath();
  ctx.arc(0, -sz * 0.45, sz * 0.75, 0, Math.PI * 2);
  ctx.fill();

  const w = sz * 0.52;
  // マント
  ctx.fillStyle = '#31123f';
  ctx.beginPath();
  ctx.moveTo(-w * 0.5, -sz * 0.62);
  ctx.quadraticCurveTo(-w * (0.9 + pose.stretch * 0.4), -sz * 0.3, -w * 0.7, 0);
  ctx.lineTo(w * 0.7, 0);
  ctx.quadraticCurveTo(w * (0.9 + pose.stretch * 0.4), -sz * 0.3, w * 0.5, -sz * 0.62);
  ctx.closePath();
  ctx.fill();
  // 体
  ctx.fillStyle = '#4a1f63';
  ctx.beginPath();
  ctx.roundRect(-w * 0.4, -sz * 0.64, w * 0.8, sz * 0.55, w * 0.15);
  ctx.fill();
  // 腕(爪)
  ctx.strokeStyle = '#4a1f63';
  ctx.lineWidth = w * 0.2;
  ctx.lineCap = 'round';
  const lift = 0.3 + pose.stretch * 0.8;
  ctx.beginPath();
  ctx.moveTo(-w * 0.4, -sz * 0.52);
  ctx.lineTo(-w * 0.4 - w * 0.7 * Math.cos(lift * 0.5), -sz * 0.52 - w * 0.7 * Math.sin(lift));
  ctx.moveTo(w * 0.4, -sz * 0.52);
  ctx.lineTo(w * 0.4 + w * 0.7 * Math.cos(lift * 0.5), -sz * 0.52 - w * 0.7 * Math.sin(lift));
  ctx.stroke();
  // 頭+角
  const headY = -sz * 0.78, headR = sz * 0.13;
  ctx.fillStyle = '#5e2a7a';
  ctx.beginPath();
  ctx.arc(0, headY, headR, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#e0d5b8';
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * headR * 0.5, headY - headR * 0.6);
    ctx.lineTo(s * headR * 1.1, headY - headR * 1.6);
    ctx.lineTo(s * headR * 0.85, headY - headR * 0.4);
    ctx.closePath();
    ctx.fill();
  }
  // 光る目
  ctx.fillStyle = '#ff1744';
  ctx.beginPath();
  ctx.arc(-headR * 0.35, headY, headR * 0.14, 0, Math.PI * 2);
  ctx.arc(headR * 0.35, headY, headR * 0.14, 0, Math.PI * 2);
  ctx.fill();
}

function drawGod(sz, pose) {
  const glow = 0.5 + Math.sin(pose.phase * 1.5) * 0.15;
  // 後光リング
  ctx.strokeStyle = `rgba(255, 225, 130, ${0.5 * glow})`;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(0, -sz * 0.55, sz * 0.62, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = `rgba(255, 225, 130, ${0.25 * glow})`;
  ctx.beginPath();
  ctx.arc(0, -sz * 0.55, sz * 0.75, 0, Math.PI * 2);
  ctx.stroke();
  // 発光体
  const g = ctx.createRadialGradient(0, -sz * 0.5, sz * 0.05, 0, -sz * 0.5, sz * 0.7);
  g.addColorStop(0, 'rgba(255, 250, 220, 0.95)');
  g.addColorStop(0.6, 'rgba(255, 230, 150, 0.55)');
  g.addColorStop(1, 'rgba(255, 230, 150, 0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(0, -sz * 0.5, sz * 0.7, 0, Math.PI * 2);
  ctx.fill();
  // シルエット(浮遊、脚なし)
  ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.beginPath();
  ctx.ellipse(0, -sz * 0.45, sz * 0.26, sz * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(0, -sz * 0.92, sz * 0.14, 0, Math.PI * 2);
  ctx.fill();
  // 広げた腕(光の帯)
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.85)';
  ctx.lineWidth = sz * 0.09;
  ctx.lineCap = 'round';
  const span = sz * (0.5 + pose.stretch * 0.45);
  ctx.beginPath();
  ctx.moveTo(-sz * 0.2, -sz * 0.68);
  ctx.lineTo(-span, -sz * (0.68 + pose.stretch * 0.2));
  ctx.moveTo(sz * 0.2, -sz * 0.68);
  ctx.lineTo(span, -sz * (0.68 + pose.stretch * 0.2));
  ctx.stroke();
  // 目(無)
  ctx.fillStyle = 'rgba(255, 200, 80, 0.9)';
  ctx.beginPath();
  ctx.arc(-sz * 0.05, -sz * 0.92, 2.5, 0, Math.PI * 2);
  ctx.arc(sz * 0.05, -sz * 0.92, 2.5, 0, Math.PI * 2);
  ctx.fill();
}

function drawKeeper() {
  const k = K();
  if (!k || state === STATE.TITLE) return;

  const baseY = L.goalBottom - 2;
  const sz = L.keeperH * k.scale;

  let x = keeperIdleX, lean = 0, stretch = 0;
  let yOff = 0, spin = 0, alpha = 1;

  if (state === STATE.SHOOT && shot) {
    // ダイブ(判定と同じ式)
    const el = Math.min(shot.t, shot.dur);
    const moved = Math.max(0, el - k.reactMs) * k.diveSpeed * L.goalHalf;
    const delta = (shot.arrivalX !== undefined ? Math.max(L.cx - L.goalHalf, Math.min(L.cx + L.goalHalf, shot.tx)) : L.cx) - keeperDiveX0;
    const clamped = Math.max(-moved, Math.min(moved, delta));
    x = keeperDiveX0 + clamped;
    const effort = Math.min(Math.abs(clamped) / (L.goalHalf * 0.55), 1);
    lean = Math.sign(delta || 1) * effort * 0.7;
    stretch = effort;
  } else if (keeperFX) {
    // 吹っ飛び
    const p = Math.min((timeNow - keeperFX.startT) / 800, 1);
    if (keeperFX.type === 'blow') {
      x = keeperFX.fromX + keeperFX.dir * L.goalHalf * 0.2 * p;
      yOff = -Math.sin(Math.PI * Math.min(p * 1.2, 1)) * L.goalH * 0.5;
      spin = p * Math.PI * 4 * keeperFX.dir;
    } else {
      x = keeperFX.fromX + keeperFX.dir * W * 0.4 * p;
      yOff = -p * H * 0.55;
      spin = p * Math.PI * 7 * keeperFX.dir;
      alpha = 1 - p * 0.4;
    }
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, baseY + yOff);
  ctx.rotate(spin || lean);
  k.draw(sz, { stretch, phase: keeperPhase });
  ctx.restore();
  ctx.globalAlpha = 1;
}

let keeperDiveX0 = 0; // シュート瞬間のキーパー位置

// ===== 描画: ボール・ゲージ =====
function drawBall() {
  let x = L.ballX, y = L.ballY;
  let r = state === STATE.AIM_SIZE ? L.ballR * (0.5 + currentSize() * 2.0)
        : plan && plan.size > 0 ? L.ballR * (0.5 + plan.size * 2.0)
        : L.ballR;

  if (shot) {
    const t = Math.min(shot.t / shot.dur, 1);
    x = shot.sx + (shot.tx - shot.sx) * t;
    y = shot.sy + (shot.ty - shot.sy) * t;
    y -= Math.sin(Math.PI * t) * H * 0.08 * (0.5 + shot.speed * 0.5);
    r = shot.r * (1 - 0.45 * t);
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

  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
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

function drawArrow() {
  if (state !== STATE.AIM_DIR && !(plan && (state === STATE.AIM_POWER || state === STATE.AIM_SIZE))) return;
  const angle = state === STATE.AIM_DIR ? currentAngle() : plan.angle;
  const len = H * 0.15;
  const x2 = L.ballX + Math.sin(angle) * len;
  const y2 = L.ballY - Math.cos(angle) * len;
  ctx.strokeStyle = state === STATE.AIM_DIR ? '#ffc93c' : 'rgba(255, 201, 60, 0.45)';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(L.ballX, L.ballY - L.ballR * 1.4);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  // 矢じり
  ctx.fillStyle = ctx.strokeStyle;
  ctx.save();
  ctx.translate(x2, y2);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -14);
  ctx.lineTo(-9, 4);
  ctx.lineTo(9, 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawGauge(x, label, value, active, isSize) {
  const gh = H * 0.3, gw = 16;
  const y0 = H * 0.62 - gh;
  ctx.fillStyle = 'rgba(0,0,0,0.45)';
  ctx.beginPath();
  ctx.roundRect(x - gw / 2 - 3, y0 - 3, gw + 6, gh + 6, 8);
  ctx.fill();
  // MAXゾーン(大きさゲージのみ、上位5%を金色)
  if (isSize) {
    ctx.fillStyle = 'rgba(255, 201, 60, 0.9)';
    ctx.fillRect(x - gw / 2, y0, gw, gh * 0.05);
  }
  // 充填
  const fillH = gh * value;
  const grad = ctx.createLinearGradient(0, y0 + gh, 0, y0);
  grad.addColorStop(0, isSize ? '#5fd47f' : '#7fd4ff');
  grad.addColorStop(1, isSize ? '#ffc93c' : '#ff5a48');
  ctx.fillStyle = grad;
  ctx.fillRect(x - gw / 2, y0 + gh - fillH, gw, fillH);
  if (!active) {
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - gw / 2, y0, gw, gh);
  }
  // ラベル
  ctx.fillStyle = active ? '#fff' : 'rgba(255,255,255,0.5)';
  ctx.font = `800 12px 'M PLUS Rounded 1c', sans-serif`;
  ctx.textAlign = 'center';
  ctx.fillText(label, x, y0 + gh + 20);
}

function drawGauges() {
  const inAim = state === STATE.AIM_DIR || state === STATE.AIM_POWER || state === STATE.AIM_SIZE;
  if (!inAim) return;
  const lx = W * 0.09, rx = W * 0.91;
  const speedVal = state === STATE.AIM_POWER ? currentSpeed() : plan.speed;
  const sizeVal = state === STATE.AIM_SIZE ? currentSize() : plan.size;
  // 自分の番になったゲージだけ表示する
  if (state === STATE.AIM_POWER || plan.speed > 0) drawGauge(rx, 'はやさ', speedVal, true, false);
  if (state === STATE.AIM_SIZE || plan.size > 0) drawGauge(lx, 'おおきさ', sizeVal, true, true);
}

function drawVignette() {
  const inAim = state === STATE.AIM_DIR || state === STATE.AIM_POWER || state === STATE.AIM_SIZE;
  if (!inAim) return;
  const pulse = 0.16 + 0.07 * Math.sin(timeNow / 260);
  const g = ctx.createRadialGradient(L.cx, H * 0.5, H * 0.35, L.cx, H * 0.5, H * 0.75);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(0,0,0,${pulse})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
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

  // スウェー
  const k = K();
  keeperPhase += (dt / (k ? k.swayPeriod : 2000)) * Math.PI * 2;
  keeperIdleX = L.cx + Math.sin(keeperPhase) * (k ? k.swayAmp : 0.3) * L.goalHalf;

  // シュート進行
  if (shot && !shot.resolved) {
    shot.t += dt;
    if (shot.t >= shot.dur) {
      shot.t = shot.dur;
      shot.resolved = true;
      resolveShot();
    }
  }

  // 鼓動(狙い中)
  if ((state === STATE.AIM_DIR || state === STATE.AIM_POWER || state === STATE.AIM_SIZE) && AC) {
    heartbeat();
  }

  fx.netShake = Math.max(0, fx.netShake - dt / 600);
  fx.flash = Math.max(0, fx.flash - dt / 500);
  fx.shake = Math.max(0, fx.shake - dt / 450);
  updateParticles(dt);

  ctx.save();
  if (fx.shake > 0) {
    ctx.translate(
      Math.sin(timeNow / 18) * fx.shake * 10,
      Math.cos(timeNow / 23) * fx.shake * 8
    );
  }
  drawBackground();
  drawGoal();
  drawKeeper();
  drawArrow();
  drawBall();
  drawGauges();
  drawParticles();
  drawFlash();
  drawVignette();
  ctx.restore();

  requestAnimationFrame(loop);
}
updateHUD();
requestAnimationFrame(loop);
