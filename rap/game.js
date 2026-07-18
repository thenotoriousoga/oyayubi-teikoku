// 天下ラン — ラッパー3Dエンドレスランナー
// スワイプでレーン移動/ジャンプ/スライド。夜の街を駆け抜けてキャッシュを掴み、天下を取れ。
import * as THREE from 'three';

// ===== DOM =====
const canvas = document.getElementById('game');
const distEl = document.getElementById('dist');
const scoreEl = document.getElementById('score');
const multEl = document.getElementById('mult');
const bestEl = document.getElementById('best');
const fxHud = document.getElementById('fx-hud');
const swagWrap = document.getElementById('swag-wrap');
const swagBar = document.getElementById('swag-bar');
const tintEl = document.getElementById('tint');
const bannerEl = document.getElementById('banner');
const hintEl = document.getElementById('hint');
const startOverlay = document.getElementById('start-overlay');
const startTapEl = document.getElementById('start-tap');
const nameInput = document.getElementById('name-input');
const overOverlay = document.getElementById('over-overlay');
const overReasonEl = document.getElementById('over-reason');
const overScoreEl = document.getElementById('over-score');
const overBestEl = document.getElementById('over-best');
const overCommentEl = document.getElementById('over-comment');
const rankTitleEl = document.getElementById('rank-title');
const top10Badge = document.getElementById('top10-badge');
const rankOverlay = document.getElementById('rank-overlay');
const rankListEl = document.getElementById('rank-list');
const showRankStartBtn = document.getElementById('show-rank-start');
const showRankOverBtn = document.getElementById('show-rank-over');

// ===== 定数 =====
const STATE = { TITLE: 'title', RUN: 'run', DEAD: 'dead', OVER: 'over' };
const LANE_W = 2.2;          // レーン幅 (m)
const DRAW_DIST = 80;        // 生成距離 (m)
const HIT_Z = 0.9;           // 衝突判定のz窓 (m)
const JUMP_V = 8.4;          // ジャンプ初速
const GRAVITY = 22;
const SLIDE_MS = 620;
const FEVER_MS = 5000;
const CHILL_MS = 5000;
const SCORE_CAP = 9_999_999;

// 開発用: ?safe=1 で障害物なし、?alleyAt=N / ?holeAt=N で N m先に強制配置
const DEBUG_PARAMS = new URLSearchParams(location.search);
const DEBUG_SAFE = DEBUG_PARAMS.get('safe') === '1';
const DEBUG_ALLEY_AT = Number(DEBUG_PARAMS.get('alleyAt')) || 0;
const DEBUG_HOLE_AT = Number(DEBUG_PARAMS.get('holeAt')) || 0;
let debugSpawned = false;

// ===== ゲーム状態 =====
let state = STATE.TITLE;
let distance = 0;            // 走行距離 (m)
let collectPts = 0;          // 収集ポイント
let swag = 0;                // 0-100
let cashStreak = 0;
let fever = 0;               // 残りms
let chill = 0;               // 残りms
let hasGal = false;
let invuln = 0;              // 被弾後の無敵ms
let chase = 0;               // ポリス追跡の残りms (追跡中に転ぶと御用)
let alley = 0;               // 裏ルートの残りms
let deathReason = '';
let bestDist = 0;            // 自己ベスト到達距離 (m)
let bestBeating = false;     // 今ランで自己ベスト距離を越えている
try { bestDist = parseInt(localStorage.getItem('rap_best_dist') || '0', 10) || 0; } catch (e) {}

// 累計統計 (バッジの条件に使う)
const DEFAULT_STATS = { plays: 0, cash: 0, bling: 0, nearMiss: 0, escapes: 0, galSaves: 0, alleys: 0, maxDist: 0, maxScore: 0 };
let stats = { ...DEFAULT_STATS };
try { stats = { ...DEFAULT_STATS, ...JSON.parse(localStorage.getItem('rap_stats') || '{}') }; } catch (e) {}
function saveStats() {
  try { localStorage.setItem('rap_stats', JSON.stringify(stats)); } catch (e) {}
}

// 今ランの統計 (リザルト表示用)
let runStats = { nearMiss: 0, cash: 0, escapes: 0 };
let deadTimer = 0;
let overAt = 0;              // OVER表示時刻 (連打誤爆防止)
let hintTimer = 0;
let best = 0;
try { best = parseInt(localStorage.getItem('rap_best') || '0', 10) || 0; } catch (e) {}

// ===== 地区 (距離で街並み・空気・コード進行が変わる) =====
const DISTRICTS = [
  { at: 0,    name: 'NEON STREET', fog: 0x0c0c1a, tint: 0xffffff, neon: 0.34, bh: [7, 24],
    chords: { 0: [220.00, 261.63, 329.63], 8: [174.61, 261.63, 349.23] } }, // Am / F
  { at: 600,  name: 'DA HIGHWAY',  fog: 0x0e141c, tint: 0x9fc6d8, neon: 0.12, bh: [4, 9],
    chords: { 0: [164.81, 196.00, 246.94], 8: [130.81, 164.81, 196.00] } }, // Em / C
  { at: 1400, name: 'DOWNTOWN',    fog: 0x160c20, tint: 0xd8a8f0, neon: 0.5, bh: [6, 14],
    chords: { 0: [146.83, 174.61, 220.00], 8: [116.54, 146.83, 174.61] } }, // Dm / B♭
  { at: 2400, name: 'SKYLINE',     fog: 0x1a1226, tint: 0xffe0a0, neon: 0.6, bh: [14, 34],
    chords: { 0: [220.00, 261.63, 329.63], 8: [196.00, 246.94, 293.66] } }, // Am / G
];
let districtIdx = 0;
function districtOf(d) {
  let i = 0;
  for (let k = 0; k < DISTRICTS.length; k++) if (d >= DISTRICTS[k].at) i = k;
  return i;
}

const player = { lane: 0, x: 0, y: 0, vy: 0, sliding: 0, jumping: false };
let entities = [];           // {kind:'ob'|'item', type, lane, z, mesh, dead, vy, spin}
let spawnedUntil = 30;       // ここまで生成済み (m先)
let rowsSpawned = 0;
let timeNow = 0;

function totalScore() {
  return Math.min(SCORE_CAP, Math.floor(distance) + collectPts);
}

function baseMult() { return swag >= 80 ? 4 : swag >= 40 ? 2 : 1; }
function multNow() { return baseMult() * (fever > 0 ? 2 : 1); }
function speedNow() {
  const s = Math.min(26, 10 + distance * 0.03);
  return chill > 0 ? s * 0.6 : s;
}

function scoreLabel(n) { return n.toLocaleString('ja-JP'); }

function rankTitle(sc) {
  if (sc >= 6000) return '👑 KING OF DA CITY';
  if (sc >= 3000) return 'シーンの顔';
  if (sc >= 1500) return 'ストリートの伝説';
  if (sc >= 800) return 'クラブの主';
  if (sc >= 300) return 'サイファーの新人';
  return '路上の卵';
}

const OVER_HEADS = [
  'MIC DROP…早すぎだろ',
  'ビート、途切れたな',
  '今夜はここまでだHOMIE',
  'REC STOP。テープはここまで',
];
const OVER_COMMENTS = [
  'まだテープも擦り切れてねぇぞ',
  'その程度のフロウで天下?笑わせんな',
  'ビートに置いてかれてんぞ',
  'ヘイターが今夜も祝杯あげてるわ',
  '転んだ数だけパンチラインになる…はず',
  'マイク握る手、震えてんぞ',
];
const DEATH_REASONS = {
  barricade: '🚧 バリケードに突っ込んだ',
  hater: '😤 ヘイターに絡まれた',
  trash: '🗑 ゴミ缶にすっ転んだ',
  sign: '🪧 看板に頭をぶつけた',
  police: '🚔 逃げ切れずポリスに御用',
  hole: '🕳 工事穴にまっさかさま',
};

// ===== サウンド (pk/game.js から移植) =====
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

function tone(t, { type = 'sine', freq, slideTo = null, slideDur = null, attack = 0, vol, dur }) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo != null) o.frequency.exponentialRampToValueAtTime(slideTo, t + (slideDur ?? dur));
  if (attack > 0) {
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
  } else {
    g.gain.setValueAtTime(vol, t);
  }
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(AC.destination);
  o.start(t); o.stop(t + dur + 0.02);
}

function noiseHit(t, { filter, freq, slideTo = null, Q = 1, attack = 0, vol, dur }) {
  if (!AC) return;
  const n = AC.createBufferSource(), g = AC.createGain(), f = AC.createBiquadFilter();
  n.buffer = noiseBuf;
  f.type = filter;
  f.frequency.setValueAtTime(freq, t);
  if (slideTo != null) f.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  f.Q.value = Q;
  if (attack > 0) {
    g.gain.setValueAtTime(0.001, t);
    g.gain.linearRampToValueAtTime(vol, t + attack);
  } else {
    g.gain.setValueAtTime(vol, t);
  }
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  n.connect(f).connect(g).connect(AC.destination);
  n.start(t); n.stop(t + dur + 0.02);
}

function thump(freq, when, gain, dur) {
  tone(when, { freq, slideTo: Math.max(30, freq * 0.55), vol: gain, dur });
}

function drumKick(t) {
  tone(t, { freq: 110, slideTo: 42, slideDur: 0.11, vol: 0.30, dur: 0.14 });
}
function drumSnare(t) {
  noiseHit(t, { filter: 'bandpass', freq: 1900, Q: 0.8, vol: 0.14, dur: 0.09 });
}
function drumHat(t, open) {
  noiseHit(t, { filter: 'highpass', freq: 7500, vol: open ? 0.05 : 0.035, dur: open ? 0.08 : 0.03 });
}
function playPiano(freq, t, vol = 0.04) {
  tone(t, { type: 'triangle', freq, attack: 0.15, vol, dur: 1.2 });
}
function play808(freq, t, vol = 0.25) {
  tone(t, { freq: freq * 1.5, slideTo: freq, slideDur: 0.08, vol, dur: 0.8 });
}
function playBell(freq, t, vol = 0.01) {
  tone(t, { freq, vol, dur: 0.6 });
  tone(t, { freq: freq * 3.51, vol, dur: 0.6 });
}
function playRiser(t, dur, vol = 0.04) {
  noiseHit(t, { filter: 'lowpass', freq: 300, slideTo: 8000, attack: dur * 0.8, vol, dur });
}
function playChant(t, vol = 0.03) {
  tone(t, { type: 'triangle', freq: 1500, slideTo: 100, vol, dur: 0.04 });
}
function playLaser(freq, t, vol = 0.015) {
  tone(t, { type: 'sawtooth', freq: freq * 3, slideTo: freq / 2, vol, dur: 0.15 });
}

// --- シーケンサー (80BPM・16分。チル中はステップ2倍=BPM半分、フィーバー中はハット増量) ---
const BEAT_STEP = 60 / 80 / 4;
let beatNextT = 0;
let beatStep = 0;

// コード進行は地区ごとに変わる (DISTRICTS[districtIdx].chords を参照)
const DEFAULT_CHORDS = DISTRICTS[0].chords;
const BELL_STEPS = { 4: 880.00, 12: 1046.50 };
const KICK_STEPS = { 0: 55.00, 3: 48.99, 4: null, 11: 58.27 };

function stepDur() { return BEAT_STEP * (chill > 0 ? 2 : 1); }

function scheduleBeat() {
  if (!AC) return;
  const now = AC.currentTime;
  if (beatNextT < now - 0.5) beatNextT = now + 0.05;
  while (beatNextT < now + 0.35) {
    playBeatStep(beatStep, beatNextT);
    beatNextT += stepDur();
    beatStep++;
  }
}

function playBeatStep(step, t) {
  const s = step % 16;
  const measure = Math.floor(step / 16) % 8;
  const isBreak = measure === 7 && s >= 12;
  const sd = stepDur();

  if (measure === 3 && s === 0) playLaser(600, t);
  if (measure === 7 && s === 8) playRiser(t, sd * 4);
  if (s === 7) playChant(t + sd / 2);

  const chords = DISTRICTS[districtIdx]?.chords || DEFAULT_CHORDS;
  if (chords[s]) chords[s].forEach((f) => playPiano(f, t, chill > 0 ? 0.055 : 0.04));
  if (BELL_STEPS[s]) playBell(BELL_STEPS[s], t);

  if (s in KICK_STEPS) {
    drumKick(t);
    if (KICK_STEPS[s]) play808(KICK_STEPS[s], t);
  }

  if (s === 8) drumSnare(t);
  if (s === 15 && !isBreak && Math.random() < 0.4) drumSnare(t);

  if (isBreak) return;
  if (chill > 0) {
    // チル中はハットを間引いて lo-fi に
    if (s % 4 === 2) drumHat(t);
    return;
  }
  if (s === 6 || s === 14) {
    drumHat(t);
    drumHat(t + sd / 2);
  } else if (s === 11) {
    const tri = sd / 3;
    drumHat(t); drumHat(t + tri); drumHat(t + tri * 2);
  } else {
    drumHat(t, s === 7 || s === 15);
  }
  // フィーバー中は裏拍にもハットを刻んで密度を上げる
  if (fever > 0) drumHat(t + sd / 2);
}

// --- 効果音 ---
function playTap() {
  if (!AC) return;
  tone(AC.currentTime, { type: 'square', freq: 880, vol: 0.08, dur: 0.06 });
}
function playJump() {
  if (!AC) return;
  tone(AC.currentTime, { type: 'square', freq: 300, slideTo: 620, slideDur: 0.12, vol: 0.09, dur: 0.14 });
}
function playSlide() {
  if (!AC) return;
  noiseHit(AC.currentTime, { filter: 'lowpass', freq: 2200, slideTo: 300, vol: 0.12, dur: 0.18 });
}
function playCoin() {
  if (!AC) return;
  playBell(1318.5, AC.currentTime, 0.03);
}
function playBling() {
  if (!AC) return;
  const t = AC.currentTime;
  [1046.5, 1318.5, 1568.0, 2093.0].forEach((f, i) => playBell(f, t + i * 0.07, 0.03));
}
function playFever() {
  if (!AC) return;
  const t = AC.currentTime;
  playRiser(t, 0.5, 0.08);
  [523.25, 659.25, 783.99].forEach((f, i) => {
    tone(t + 0.1 + i * 0.09, { type: 'triangle', freq: f, vol: 0.2, dur: 0.3 });
  });
}
function playChill() {
  if (!AC) return;
  const t = AC.currentTime;
  tone(t, { type: 'sine', freq: 440, slideTo: 220, slideDur: 0.6, vol: 0.1, dur: 0.8 });
  noiseHit(t, { filter: 'lowpass', freq: 900, slideTo: 200, vol: 0.05, dur: 0.7 });
}
function playGalGet() {
  if (!AC) return;
  const t = AC.currentTime;
  [880, 1108.7, 1318.5].forEach((f, i) => {
    tone(t + i * 0.08, { type: 'triangle', freq: f, vol: 0.12, dur: 0.2 });
  });
}
function playGalScream() {
  if (!AC) return;
  tone(AC.currentTime, { type: 'sawtooth', freq: 1800, slideTo: 700, slideDur: 0.25, vol: 0.08, dur: 0.3 });
}
function playSiren() {
  if (!AC) return;
  const t = AC.currentTime;
  for (let i = 0; i < 3; i++) {
    tone(t + i * 0.5, { type: 'triangle', freq: 660, slideTo: 880, slideDur: 0.24, vol: 0.06, dur: 0.25 });
    tone(t + i * 0.5 + 0.25, { type: 'triangle', freq: 880, slideTo: 660, slideDur: 0.24, vol: 0.06, dur: 0.25 });
  }
}
function playCrash() {
  if (!AC) return;
  const t = AC.currentTime;
  thump(60, t, 0.55, 0.4);
  noiseHit(t, { filter: 'lowpass', freq: 700, vol: 0.45, dur: 0.5 });
}
function playSmash() {
  if (!AC) return;
  const t = AC.currentTime;
  thump(90, t, 0.4, 0.2);
  noiseHit(t, { filter: 'bandpass', freq: 2500, Q: 1.5, vol: 0.2, dur: 0.15 });
}
function playFail() {
  if (!AC) return;
  const t = AC.currentTime;
  [280, 200].forEach((f, i) => {
    tone(t + i * 0.18, { type: 'square', freq: f, slideTo: f * 0.85, slideDur: 0.15, vol: 0.12, dur: 0.17 });
  });
}
function vibrate(ms) {
  if (navigator.vibrate) navigator.vibrate(ms);
}

// ===== Three.js シーン =====
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));

const scene = new THREE.Scene();
const NIGHT = 0x0c0c1a;
scene.background = new THREE.Color(NIGHT);
scene.fog = new THREE.Fog(NIGHT, 25, 85);

const camera = new THREE.PerspectiveCamera(70, 1, 0.1, 200);

const ambient = new THREE.AmbientLight(0x8888aa, 0.9);
scene.add(ambient);
const moonLight = new THREE.DirectionalLight(0xbfd0ff, 0.9);
moonLight.position.set(-6, 12, -4);
scene.add(moonLight);
const streetGlow = new THREE.PointLight(0xffd27a, 1.1, 26);
streetGlow.position.set(0, 4.5, -3);
scene.add(streetGlow);

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// --- 路面 (テクスチャのオフセットスクロールで疾走感を出す) ---
const ROAD_LEN = 160;
const ROAD_TILE = 8; // 1タイル8m
function makeRoadTexture() {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#191922';
  g.fillRect(0, 0, 256, 256);
  // アスファルトの粒
  for (let i = 0; i < 220; i++) {
    g.fillStyle = Math.random() < 0.5 ? '#20202c' : '#131318';
    g.fillRect(Math.random() * 256, Math.random() * 256, 2.5, 2.5);
  }
  // レーン区分の破線 (2本)
  g.fillStyle = '#c9c9d4';
  const laneX = 256 / 3;
  for (const x of [laneX, laneX * 2]) {
    g.fillRect(x - 4, 20, 8, 90);
  }
  // 縁の実線
  g.fillStyle = '#f2b90c';
  g.fillRect(2, 0, 6, 256);
  g.fillRect(248, 0, 6, 256);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(1, ROAD_LEN / ROAD_TILE);
  tex.anisotropy = 4;
  return tex;
}
const roadTex = makeRoadTexture();
const road = new THREE.Mesh(
  new THREE.PlaneGeometry(LANE_W * 3, ROAD_LEN),
  new THREE.MeshBasicMaterial({ map: roadTex })
);
road.rotation.x = -Math.PI / 2;
road.position.set(0, 0, -ROAD_LEN / 2 + 12);
scene.add(road);

// 歩道 (左右)
const walkMat = new THREE.MeshLambertMaterial({ color: 0x2a2a36 });
for (const side of [-1, 1]) {
  const walk = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.3, ROAD_LEN), walkMat);
  walk.position.set(side * (LANE_W * 1.5 + 1.7), 0.15, -ROAD_LEN / 2 + 12);
  scene.add(walk);
}
// 路面外の地面
const groundMat = new THREE.MeshBasicMaterial({ color: 0x0a0a12 });
const ground = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), groundMat);
ground.rotation.x = -Math.PI / 2;
ground.position.y = -0.02;
scene.add(ground);

// --- 星と月 ---
{
  const starGeo = new THREE.BufferGeometry();
  const pos = [];
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2;
    const r = 90 + Math.random() * 60;
    pos.push(Math.cos(a) * r, 18 + Math.random() * 70, -40 - Math.random() * 120);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xdedeff, size: 0.5, fog: false }));
  scene.add(stars);

  const moonC = document.createElement('canvas');
  moonC.width = 128; moonC.height = 128;
  const mg = moonC.getContext('2d');
  const grad = mg.createRadialGradient(64, 64, 18, 64, 64, 64);
  grad.addColorStop(0, 'rgba(255,250,220,1)');
  grad.addColorStop(0.35, 'rgba(255,244,200,0.75)');
  grad.addColorStop(1, 'rgba(255,244,200,0)');
  mg.fillStyle = grad;
  mg.fillRect(0, 0, 128, 128);
  const moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(moonC), fog: false, transparent: true }));
  moon.scale.set(26, 26, 1);
  moon.position.set(-34, 44, -110);
  scene.add(moon);
}

// --- ネオンビル群 (左右プール、通過したら前方に回して使い回す) ---
const NEON_TEXTS = ['天下', 'RAP', 'SWAG', 'YO!', '億', 'FLOW'];
const NEON_COLORS = ['#ff4fd8', '#4fd8ff', '#f2b90c', '#7dff6e'];
function makeWindowTexture() {
  const c = document.createElement('canvas');
  c.width = 64; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#101018';
  g.fillRect(0, 0, 64, 128);
  for (let y = 6; y < 122; y += 12) {
    for (let x = 6; x < 58; x += 12) {
      if (Math.random() < 0.42) {
        g.fillStyle = Math.random() < 0.75 ? 'rgba(255,214,120,0.9)' : 'rgba(120,220,255,0.9)';
        g.fillRect(x, y, 7, 8);
      }
    }
  }
  const tex = new THREE.CanvasTexture(c);
  return tex;
}
function makeNeonTexture(text, color) {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#050508';
  g.fillRect(0, 0, 256, 128);
  g.font = '900 72px "M PLUS 1p", "Archivo Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = color;
  g.shadowBlur = 26;
  g.fillStyle = color;
  g.fillText(text, 128, 68);
  g.shadowBlur = 0;
  return new THREE.CanvasTexture(c);
}
const windowTexes = [makeWindowTexture(), makeWindowTexture(), makeWindowTexture()];
const neonMats = [];
for (const t of NEON_TEXTS) {
  neonMats.push(new THREE.MeshBasicMaterial({ map: makeNeonTexture(t, NEON_COLORS[Math.floor(Math.random() * NEON_COLORS.length)]) }));
}
const buildings = [];
const B_COUNT = 15;       // 片側の棟数
const B_SPACING = 11;
const boxGeo = new THREE.BoxGeometry(1, 1, 1);
for (const side of [-1, 1]) {
  for (let i = 0; i < B_COUNT; i++) {
    const mat = new THREE.MeshBasicMaterial({ map: windowTexes[i % windowTexes.length] });
    const b = new THREE.Mesh(boxGeo, mat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), neonMats[(i * 2 + (side > 0 ? 1 : 0)) % neonMats.length]);
    sign.visible = false;
    b.add(sign);
    scene.add(b);
    const bd = { mesh: b, sign, side, z: i * B_SPACING + Math.random() * 5 };
    styleBuilding(bd);
    bd.mesh.position.set(bd.x, bd.h / 2, -bd.z);
    buildings.push(bd);
  }
}
function styleBuilding(bd) {
  const dist = DISTRICTS[districtIdx];
  const w = 4 + Math.random() * 5;
  const h = dist.bh[0] + Math.random() * (dist.bh[1] - dist.bh[0]);
  const d = 4 + Math.random() * 4;
  bd.mesh.scale.set(w, h, d);
  bd.mesh.material.color.setHex(dist.tint);
  bd.x = bd.side * (LANE_W * 1.5 + 4.5 + Math.random() * 5 + w / 2);
  bd.h = h;
  // ネオン看板の密度は地区で変わる。道路側の面に貼る
  bd.sign.visible = Math.random() < dist.neon;
  if (bd.sign.visible) {
    bd.sign.material = neonMats[Math.floor(Math.random() * neonMats.length)];
    bd.sign.position.set(-bd.side * 0.51, 0.1 + Math.random() * 0.25, 0);
    bd.sign.rotation.y = -bd.side * Math.PI / 2;
    bd.sign.scale.set(0.9 / 1, 0.3, 1);
  }
}

// --- キャラクター生成 (低ポリ・ボックス組み立て) ---
function makeBackPrintTexture(hoodieColor) {
  // パーカー背面のバックプリント (明るい生地は黒文字にする)
  const r = (hoodieColor >> 16) & 255, gr = (hoodieColor >> 8) & 255, b = hoodieColor & 255;
  const bright = r * 0.299 + gr * 0.587 + b * 0.114 > 140;
  const inkColor = bright ? '#16161c' : '#f2b90c';
  const c = document.createElement('canvas');
  c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  g.fillStyle = '#' + hoodieColor.toString(16).padStart(6, '0');
  g.fillRect(0, 0, 128, 128);
  g.save();
  g.translate(64, 52);
  g.rotate(-0.08);
  g.font = '900 34px "Archivo Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.shadowColor = 'rgba(0,0,0,0.8)';
  g.shadowOffsetX = 3; g.shadowOffsetY = 3;
  g.fillStyle = inkColor;
  g.fillText('RUN DA', 0, -18);
  g.fillText('CITY', 0, 20);
  g.restore();
  g.font = '900 15px "Archivo Black", sans-serif';
  g.textAlign = 'center';
  g.fillStyle = inkColor;
  g.fillText('★ RDC ★', 64, 108);
  return new THREE.CanvasTexture(c);
}

function makeHumanoid({ hoodie, skin, cap, capColor, hair, chain, shades, mic, brimBack, backPrint }) {
  const g = new THREE.Group();
  const mats = {
    hoodie: new THREE.MeshLambertMaterial({ color: hoodie }),
    skin: new THREE.MeshLambertMaterial({ color: skin }),
    dark: new THREE.MeshLambertMaterial({ color: 0x18181e }),
    gold: new THREE.MeshLambertMaterial({ color: 0xf2b90c, emissive: 0x664c00 }),
    white: new THREE.MeshLambertMaterial({ color: 0xf0f0f0 }),
    hair: new THREE.MeshLambertMaterial({ color: hair || 0x221a12 }),
  };
  let torso;
  let backMat = null;
  if (backPrint) {
    // 背面 (+z) だけバックプリントのテクスチャに差し替え
    backMat = new THREE.MeshLambertMaterial({ map: makeBackPrintTexture(hoodie) });
    torso = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), [
      mats.hoodie, mats.hoodie, mats.hoodie, mats.hoodie, backMat, mats.hoodie,
    ]);
  } else {
    torso = new THREE.Mesh(boxGeo, mats.hoodie);
  }
  torso.scale.set(0.72, 0.82, 0.44);
  torso.position.y = 1.06;
  g.add(torso);
  // フード
  const hood = new THREE.Mesh(boxGeo, mats.hoodie);
  hood.scale.set(0.5, 0.2, 0.4);
  hood.position.set(0, 1.52, 0.12);
  g.add(hood);
  const head = new THREE.Mesh(boxGeo, mats.skin);
  head.scale.set(0.42, 0.4, 0.42);
  head.position.y = 1.82;
  g.add(head);
  let capMat = null;
  if (cap) {
    capMat = new THREE.MeshLambertMaterial({ color: capColor });
    const capTop = new THREE.Mesh(boxGeo, capMat);
    capTop.scale.set(0.46, 0.14, 0.46);
    capTop.position.y = 2.06;
    g.add(capTop);
    const brim = new THREE.Mesh(boxGeo, capMat);
    brim.scale.set(0.44, 0.05, 0.3);
    // 通常は前方(-z)につば。brimBack なら後ろかぶり
    brim.position.set(0, 2.0, brimBack ? 0.34 : -0.34);
    g.add(brim);
  } else {
    const pony = new THREE.Mesh(boxGeo, mats.hair);
    pony.scale.set(0.16, 0.42, 0.16);
    pony.position.set(0, 1.85, 0.3);
    pony.rotation.x = 0.5;
    g.add(pony);
    const hairTop = new THREE.Mesh(boxGeo, mats.hair);
    hairTop.scale.set(0.46, 0.16, 0.46);
    hairTop.position.y = 2.04;
    g.add(hairTop);
  }
  if (chain) {
    const ch = new THREE.Mesh(boxGeo, mats.gold);
    ch.scale.set(0.34, 0.09, 0.06);
    ch.position.set(0, 1.32, -0.25);
    g.add(ch);
    const pendant = new THREE.Mesh(boxGeo, mats.gold);
    pendant.scale.set(0.17, 0.17, 0.06);
    pendant.position.set(0, 1.18, -0.26);
    pendant.rotation.z = Math.PI / 4;
    g.add(pendant);
  }
  if (shades) {
    // サングラス (顔の前面に横長の黒バー)
    const sg = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x0a0a0c }));
    sg.scale.set(0.44, 0.11, 0.06);
    sg.position.set(0, 1.88, -0.22);
    g.add(sg);
  }
  const limbs = {};
  for (const [key, sx] of [['armL', -0.45], ['armR', 0.45]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, 1.42, 0);
    const arm = new THREE.Mesh(boxGeo, mats.hoodie);
    arm.scale.set(0.2, 0.6, 0.22);
    arm.position.y = -0.28;
    const hand = new THREE.Mesh(boxGeo, mats.skin);
    hand.scale.set(0.16, 0.14, 0.18);
    hand.position.y = -0.62;
    pivot.add(arm); pivot.add(hand);
    if (mic && key === 'armR') {
      // 右手に金のマイク
      const grip = new THREE.Mesh(
        new THREE.CylinderGeometry(0.045, 0.055, 0.24, 8),
        new THREE.MeshLambertMaterial({ color: 0x222228 })
      );
      grip.position.set(0, -0.72, -0.06);
      grip.rotation.x = -0.9;
      const head = new THREE.Mesh(
        new THREE.SphereGeometry(0.09, 10, 8),
        new THREE.MeshLambertMaterial({ color: 0xf2b90c, emissive: 0x554000 })
      );
      head.position.set(0, -0.8, -0.17);
      pivot.add(grip); pivot.add(head);
    }
    g.add(pivot);
    limbs[key] = pivot;
  }
  for (const [key, sx] of [['legL', -0.19], ['legR', 0.19]]) {
    const pivot = new THREE.Group();
    pivot.position.set(sx, 0.86, 0);
    const leg = new THREE.Mesh(boxGeo, mats.dark);
    leg.scale.set(0.24, 0.72, 0.26);
    leg.position.y = -0.36;
    const shoe = new THREE.Mesh(boxGeo, mats.white);
    shoe.scale.set(0.26, 0.14, 0.4);
    shoe.position.set(0, -0.78, -0.05);
    pivot.add(leg); pivot.add(shoe);
    g.add(pivot);
    limbs[key] = pivot;
  }
  return { group: g, limbs, mats, capMat, backMat };
}

// キャラの正面は -z (つば・チェーンの向き)。プレイヤーは進行方向(-z)を向くので回転不要
// ラッパー: 後ろかぶりキャップ + サングラス + ゴールドチェーン + 右手にマイク
const rapper = makeHumanoid({
  hoodie: 0x3a2b5e, skin: 0xc9995c,
  cap: true, capColor: 0x151519, brimBack: true,
  chain: true, shades: true, mic: true, backPrint: true,
});
rapper.micHand = true; // 走行中もマイクを顔の横にキープ
scene.add(rapper.group);

// ===== スキン & バッジ =====
const HOODIES = {
  default: { name: 'パープル', color: 0x3a2b5e },
  red:     { name: 'ブラッドレッド', color: 0xa02030 },
  green:   { name: 'カモグリーン', color: 0x2a4a22 },
  white:   { name: 'アイスホワイト', color: 0xe8e8ee },
  black:   { name: 'オールブラック', color: 0x141418 },
  gold:    { name: 'ゴールド', color: 0xf2b90c },
  king:    { name: 'キングパープル', color: 0x4a0a5e },
};
const CAPS = {
  default: { name: 'ブラック', color: 0x151519 },
  red:     { name: 'レッド', color: 0xa02030 },
  white:   { name: 'ホワイト', color: 0xe8e8ee },
  pink:    { name: 'ピンク', color: 0xd94f9e },
  gold:    { name: 'ゴールド', color: 0xf2b90c },
};
const BADGES = [
  { id: 'debut',    medal: '🎤', name: 'デビュー',        desc: '初ランを走る',                cond: (s) => s.plays >= 1,      reward: { type: 'hoodie', id: 'red' } },
  { id: 'hustler',  medal: '💴', name: 'ハスラー',        desc: 'キャッシュ累計300枚',          cond: (s) => s.cash >= 300,     reward: { type: 'hoodie', id: 'green' } },
  { id: 'dodger',   medal: '😤', name: 'スカし職人',      desc: 'スカし累計100回',              cond: (s) => s.nearMiss >= 100, reward: { type: 'hoodie', id: 'white' } },
  { id: 'runner',   medal: '🚔', name: '逃走のプロ',      desc: 'ポリスから累計10回逃げ切る',    cond: (s) => s.escapes >= 10,   reward: { type: 'cap', id: 'red' } },
  { id: 'highway',  medal: '📍', name: 'ハイウェイ進出',   desc: '600m到達',                    cond: (s) => s.maxDist >= 600,  reward: { type: 'cap', id: 'white' } },
  { id: 'downtown', medal: '📍', name: 'ダウンタウンの顔', desc: '1400m到達',                   cond: (s) => s.maxDist >= 1400, reward: { type: 'hoodie', id: 'black' } },
  { id: 'skyline',  medal: '🌃', name: 'スカイライン',    desc: '2400m到達',                   cond: (s) => s.maxDist >= 2400, reward: { type: 'hoodie', id: 'gold' } },
  { id: 'mote',     medal: '💁‍♀️', name: 'モテ期',         desc: 'ギャルに累計10回救われる',      cond: (s) => s.galSaves >= 10,  reward: { type: 'cap', id: 'pink' } },
  { id: 'alley',    medal: '🕳', name: '裏路地の主',      desc: '裏ルートに累計10回入る',        cond: (s) => s.alleys >= 10,    reward: { type: 'cap', id: 'gold' } },
  { id: 'king',     medal: '👑', name: 'KING OF DA CITY', desc: 'スコア6,000到達',              cond: (s) => s.maxScore >= 6000, reward: { type: 'hoodie', id: 'king' } },
];

let equipped = { hoodie: 'default', cap: 'default' };
try { equipped = { hoodie: 'default', cap: 'default', ...JSON.parse(localStorage.getItem('rap_equip') || '{}') }; } catch (e) {}

function skinUnlocked(type, id) {
  if (id === 'default') return true;
  const b = BADGES.find((x) => x.reward.type === type && x.reward.id === id);
  return b ? b.cond(stats) : false;
}

function applyEquip() {
  // 未解禁のものを装備していたらデフォルトに戻す (別端末等)
  for (const t of ['hoodie', 'cap']) {
    if (!skinUnlocked(t, equipped[t])) equipped[t] = 'default';
  }
  const h = HOODIES[equipped.hoodie] || HOODIES.default;
  rapper.mats.hoodie.color.setHex(h.color);
  if (rapper.backMat) {
    if (rapper.backMat.map) rapper.backMat.map.dispose();
    rapper.backMat.map = makeBackPrintTexture(h.color);
    rapper.backMat.needsUpdate = true;
  }
  const cp = CAPS[equipped.cap] || CAPS.default;
  if (rapper.capMat) rapper.capMat.color.setHex(cp.color);
}

function equipSkin(type, id) {
  if (!skinUnlocked(type, id)) return;
  equipped[type] = id;
  try { localStorage.setItem('rap_equip', JSON.stringify(equipped)); } catch (e) {}
  applyEquip();
  renderLocker();
}

function checkNewBadges() {
  let seen = [];
  try { seen = JSON.parse(localStorage.getItem('rap_badges_seen') || '[]'); } catch (e) {}
  const fresh = BADGES.filter((b) => b.cond(stats) && !seen.includes(b.id));
  if (fresh.length) {
    try { localStorage.setItem('rap_badges_seen', JSON.stringify([...seen, ...fresh.map((b) => b.id)])); } catch (e) {}
  }
  return fresh;
}

function renderLocker() {
  for (const [rowId, defs, type] of [['hoodie-skins', HOODIES, 'hoodie'], ['cap-skins', CAPS, 'cap']]) {
    const row = document.getElementById(rowId);
    row.innerHTML = '';
    for (const [id, def] of Object.entries(defs)) {
      const unlocked = skinUnlocked(type, id);
      const chip = document.createElement('button');
      chip.className = 'skin-chip' + (equipped[type] === id ? ' equipped' : '') + (unlocked ? '' : ' locked');
      const sw = document.createElement('span');
      sw.className = 'skin-swatch';
      sw.style.background = '#' + def.color.toString(16).padStart(6, '0');
      const nm = document.createElement('span');
      nm.className = 'skin-name';
      nm.textContent = unlocked ? def.name : '???';
      chip.appendChild(sw);
      chip.appendChild(nm);
      chip.addEventListener('click', (ev) => {
        ev.stopPropagation();
        if (unlocked) { equipSkin(type, id); playTap(); }
      });
      row.appendChild(chip);
    }
  }
  const bWrap = document.getElementById('badges');
  bWrap.innerHTML = '';
  for (const b of BADGES) {
    const done = b.cond(stats);
    const div = document.createElement('div');
    div.className = 'ach' + (done ? ' done' : ' locked');
    const rewardDef = b.reward.type === 'hoodie' ? HOODIES[b.reward.id] : CAPS[b.reward.id];
    const rewardLabel = `${b.reward.type === 'hoodie' ? 'パーカー' : 'キャップ'}「${rewardDef.name}」`;
    div.innerHTML = `<span class="ach-medal">${b.medal}</span><span class="ach-body"><span class="ach-name">${b.name}</span><span class="ach-desc">${b.desc}</span><span class="ach-reward">🎁 ${rewardLabel}</span></span>`;
    bWrap.appendChild(div);
  }
}
applyEquip();

// ギャル: 金髪ロング + 日焼け肌 + ピンクトップス + ミニスカ
const gal = makeHumanoid({ hoodie: 0xff5fb0, skin: 0xc98a5a, cap: false, hair: 0xf5d76e, chain: false });
{
  const blonde = new THREE.MeshLambertMaterial({ color: 0xf5d76e });
  // 背中まで流れるロングヘア
  const back = new THREE.Mesh(boxGeo, blonde);
  back.scale.set(0.5, 0.8, 0.16);
  back.position.set(0, 1.55, 0.3);
  gal.group.add(back);
  // サイドの髪
  for (const sx of [-0.27, 0.27]) {
    const strand = new THREE.Mesh(boxGeo, blonde);
    strand.scale.set(0.13, 0.55, 0.13);
    strand.position.set(sx, 1.68, 0.12);
    gal.group.add(strand);
  }
  // ミニスカート
  const skirt = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xffffff }));
  skirt.scale.set(0.82, 0.24, 0.54);
  skirt.position.y = 0.74;
  gal.group.add(skirt);
  // ハートのアクセ
  const heart = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xff2f7e, emissive: 0x660022 }));
  heart.scale.set(0.12, 0.12, 0.05);
  heart.position.set(0, 1.3, -0.26);
  heart.rotation.z = Math.PI / 4;
  gal.group.add(heart);
}
gal.group.scale.set(0.88, 0.88, 0.88);
gal.group.visible = false;
scene.add(gal.group);
let galX = 0;

// ポリス: 転んだあと一定時間追いかけてくる。追跡中にもう一度転ぶと御用
const cop = makeHumanoid({ hoodie: 0x1a3a8a, skin: 0xd9a066, cap: true, capColor: 0x14244a, chain: false });
{
  // 帽章とパトランプ風の点滅ライトバー
  const badge = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xf2b90c, emissive: 0x554000 }));
  badge.scale.set(0.1, 0.1, 0.04);
  badge.position.set(0, 1.95, -0.24);
  cop.group.add(badge);
}
cop.group.visible = false;
scene.add(cop.group);
const copLight = new THREE.PointLight(0xff2233, 0, 18);
copLight.position.set(0, 3, 3);
scene.add(copLight);
let copX = 0;
let lastSirenT = 0;

// --- 障害物メッシュ ---
function makeBarricade() {
  const g = new THREE.Group();
  const frame = new THREE.MeshLambertMaterial({ color: 0x2255cc });
  const white = new THREE.MeshLambertMaterial({ color: 0xe8e8f0 });
  for (const sx of [-0.85, 0.85]) {
    const leg = new THREE.Mesh(boxGeo, frame);
    leg.scale.set(0.12, 1.15, 0.5);
    leg.position.set(sx, 0.58, 0);
    g.add(leg);
  }
  for (let i = 0; i < 3; i++) {
    const bar = new THREE.Mesh(boxGeo, i === 1 ? white : frame);
    bar.scale.set(1.9, 0.2, 0.1);
    bar.position.y = 0.35 + i * 0.36;
    g.add(bar);
  }
  const lamp = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0xff3b3b, emissive: 0xaa0000 }));
  lamp.scale.set(0.18, 0.18, 0.18);
  lamp.position.y = 1.28;
  g.add(lamp);
  return g;
}
const HATER_INSULTS = ['ダサw', '帰れw', 'ザコがw', '無理無理w', 'センスねぇ~'];
const insultMats = HATER_INSULTS.map((text) => {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const g = c.getContext('2d');
  // 白吹き出し + 黒文字
  g.fillStyle = '#ffffff';
  const r = 26;
  g.beginPath();
  g.roundRect(6, 6, 244, 70, r);
  g.fill();
  g.beginPath();
  g.moveTo(112, 74); g.lineTo(128, 94); g.lineTo(144, 74);
  g.fill();
  g.font = '900 40px "M PLUS 1p", sans-serif';
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillStyle = '#16161c';
  g.fillText(text, 128, 42);
  return new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true });
});

function makeHater() {
  const h = makeHumanoid({ hoodie: 0x24303a, skin: 0x9c7a52, cap: true, capColor: 0x0c0c0e, chain: false });
  h.group.rotation.y = Math.PI; // プレイヤーの方を向く
  // 左腕は腰、右腕は拳を振り上げる (振りはフレームごとにアニメーション)
  h.limbs.armL.rotation.z = 0.7;
  h.limbs.armR.rotation.x = -2.4;
  // 頭上に煽り吹き出し
  const bubble = new THREE.Sprite(insultMats[Math.floor(Math.random() * insultMats.length)]);
  bubble.scale.set(1.7, 0.64, 1);
  bubble.position.set(0.2, 2.75, 0);
  h.group.add(bubble);
  h.group.userData.limbs = h.limbs;
  return h.group;
}
function makeTrash() {
  const g = new THREE.Group();
  const can = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.36, 0.8, 10),
    new THREE.MeshLambertMaterial({ color: 0x4a5560 })
  );
  can.position.y = 0.4;
  g.add(can);
  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.46, 0.46, 0.1, 10),
    new THREE.MeshLambertMaterial({ color: 0x5c6874 })
  );
  lid.position.y = 0.85;
  g.add(lid);
  // はみ出たゴミ
  const junk = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x8bc34a }));
  junk.scale.set(0.2, 0.2, 0.2);
  junk.position.set(0.15, 0.95, 0.1);
  junk.rotation.set(0.4, 0.3, 0.2);
  g.add(junk);
  return g;
}
function makeHole() {
  // 工事中の大穴: 落ちたら即死。ジャンプでしか越えられない
  const g = new THREE.Group();
  const pit = new THREE.Mesh(
    new THREE.BoxGeometry(1.8, 0.04, 2.4),
    new THREE.MeshBasicMaterial({ color: 0x020204 })
  );
  pit.position.y = 0.02;
  g.add(pit);
  // 縁の警告ストライプ
  const stripe = new THREE.Mesh(
    new THREE.BoxGeometry(1.9, 0.06, 0.16),
    new THREE.MeshBasicMaterial({ color: 0xffb020 })
  );
  stripe.position.set(0, 0.03, 1.25);
  g.add(stripe);
  const stripe2 = stripe.clone();
  stripe2.position.z = -1.25;
  g.add(stripe2);
  // 三角コーン
  for (const sx of [-0.8, 0.8]) {
    const cone = new THREE.Mesh(
      new THREE.ConeGeometry(0.14, 0.4, 8),
      new THREE.MeshLambertMaterial({ color: 0xff5a2a })
    );
    cone.position.set(sx, 0.2, 1.35);
    g.add(cone);
  }
  return g;
}
function makeAlleyGate() {
  // 光るマンホール: 乗ると裏ルートへ
  const g = new THREE.Group();
  const lid = new THREE.Mesh(
    new THREE.CylinderGeometry(0.75, 0.75, 0.06, 16),
    new THREE.MeshLambertMaterial({ color: 0x3a4a3a, emissive: 0x1a3a1a })
  );
  lid.position.y = 0.04;
  g.add(lid);
  const ring = new THREE.Mesh(
    new THREE.CylinderGeometry(0.85, 0.85, 0.03, 16),
    new THREE.MeshBasicMaterial({ color: 0x50ff88 })
  );
  ring.position.y = 0.02;
  g.add(ring);
  const label = new THREE.Sprite(makeEmojiTexture ? new THREE.SpriteMaterial({ map: makeEmojiTexture('⬇'), transparent: true }) : undefined);
  label.scale.set(0.7, 0.7, 1);
  label.position.y = 1.0;
  g.add(label);
  return g;
}
function makeSign() {
  const g = new THREE.Group();
  const pole = new THREE.MeshLambertMaterial({ color: 0x555a66 });
  for (const sx of [-1.0, 1.0]) {
    const p = new THREE.Mesh(boxGeo, pole);
    p.scale.set(0.1, 2.3, 0.1);
    p.position.set(sx, 1.15, 0);
    g.add(p);
  }
  const c = document.createElement('canvas');
  c.width = 256; c.height = 64;
  const gg = c.getContext('2d');
  gg.fillStyle = '#101016';
  gg.fillRect(0, 0, 256, 64);
  gg.font = '900 40px "M PLUS 1p", sans-serif';
  gg.textAlign = 'center'; gg.textBaseline = 'middle';
  gg.shadowColor = '#f2b90c'; gg.shadowBlur = 16;
  gg.fillStyle = '#f2b90c';
  gg.fillText('スベれ!!', 128, 34);
  const board = new THREE.Mesh(
    new THREE.BoxGeometry(2.1, 0.7, 0.08),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) })
  );
  board.position.y = 1.55; // 下端 ≈1.2m: スライドでくぐる高さ
  g.add(board);
  return g;
}

// --- アイテムスプライト (絵文字テクスチャ) ---
function makeEmojiTexture(emoji, size = 128) {
  const c = document.createElement('canvas');
  c.width = size; c.height = size;
  const g = c.getContext('2d');
  g.font = `${size * 0.8}px serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText(emoji, size / 2, size / 2 + size * 0.05);
  return new THREE.CanvasTexture(c);
}
const ITEM_DEFS = {
  cash: { emoji: '💴', scale: 1.0 },
  mic: { emoji: '🎤', scale: 1.35 },
  weed: { emoji: '🍃', scale: 1.35 },
  bling: { emoji: '💎', scale: 1.35 },
  gal: { emoji: '💁‍♀️', scale: 1.5 },
};
for (const def of Object.values(ITEM_DEFS)) {
  def.mat = new THREE.SpriteMaterial({ map: makeEmojiTexture(def.emoji), transparent: true });
}

// --- エンティティのプール ---
const OB_MAKERS = { barricade: makeBarricade, hater: makeHater, trash: makeTrash, sign: makeSign, hole: makeHole, alley: makeAlleyGate };
const pools = { barricade: [], hater: [], trash: [], sign: [], hole: [], alley: [], cash: [], mic: [], weed: [], bling: [], gal: [] };

function acquireMesh(type) {
  const pool = pools[type];
  const free = pool.find((m) => !m.userData.inUse);
  if (free) {
    free.userData.inUse = true;
    free.visible = true;
    return free;
  }
  let obj;
  if (OB_MAKERS[type]) {
    obj = OB_MAKERS[type]();
  } else {
    obj = new THREE.Sprite(ITEM_DEFS[type].mat);
    const s = ITEM_DEFS[type].scale;
    obj.scale.set(s, s, 1);
  }
  obj.userData.baseYaw = obj.rotation.y;
  obj.userData.inUse = true;
  scene.add(obj);
  pool.push(obj);
  return obj;
}
function releaseMesh(type, mesh) {
  mesh.userData.inUse = false;
  mesh.visible = false;
  if (OB_MAKERS[type]) {
    mesh.rotation.set(0, mesh.userData.baseYaw || 0, 0);
    mesh.position.y = 0;
  }
}

// ===== ライバルの散り際マーカー (TOP10) =====
let rivalMarkers = [];
async function fetchMarkers() {
  try {
    const r = await fetch(`${API}?game=rap`);
    if (!r.ok) return;
    const data = await r.json();
    rivalMarkers = (data.top || [])
      .filter((e) => Number.isInteger(e.dist) && e.dist > 30)
      .map((e) => ({ name: e.name, dist: e.dist, spawned: false }));
    if (DEBUG_PARAMS.has('debug')) console.log('[markers]', JSON.stringify(rivalMarkers));
  } catch (e) { /* オフラインなら無し */ }
}

function makeMarkerMesh(name) {
  const g = new THREE.Group();
  // 手向けの花
  for (let i = 0; i < 3; i++) {
    const stem = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: 0x2f7d3a }));
    stem.scale.set(0.05, 0.3, 0.05);
    stem.position.set((i - 1) * 0.12, 0.15, 0);
    stem.rotation.z = (i - 1) * 0.3;
    g.add(stem);
    const bloom = new THREE.Mesh(boxGeo, new THREE.MeshLambertMaterial({ color: [0xff5a8a, 0xffd24a, 0xffffff][i] }));
    bloom.scale.set(0.14, 0.14, 0.14);
    bloom.position.set((i - 1) * 0.22, 0.34, 0);
    g.add(bloom);
  }
  // スプレー落書き
  const c = document.createElement('canvas');
  c.width = 256; c.height = 96;
  const gg = c.getContext('2d');
  gg.textAlign = 'center';
  gg.shadowColor = 'rgba(0,0,0,0.9)';
  gg.shadowBlur = 6;
  gg.font = '900 30px "M PLUS 1p", sans-serif';
  gg.fillStyle = '#f2b90c';
  gg.fillText(`✝ ${name}`, 128, 36);
  gg.font = '800 20px "M PLUS 1p", sans-serif';
  gg.fillStyle = '#ffffff';
  gg.fillText('ここで散った', 128, 70);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  sp.scale.set(2.6, 1.0, 1);
  sp.position.y = 1.2;
  g.add(sp);
  return g;
}

// ===== 自己ベストライン =====
let bestLineSpawned = false;
const goldAura = new THREE.PointLight(0xf2b90c, 0, 9);
scene.add(goldAura);

function spawnBestLine() {
  const g = new THREE.Group();
  const line = new THREE.Mesh(
    new THREE.BoxGeometry(LANE_W * 3, 0.05, 0.3),
    new THREE.MeshBasicMaterial({ color: 0xf2b90c, transparent: true, opacity: 0.75 })
  );
  line.position.y = 0.03;
  g.add(line);
  const c = document.createElement('canvas');
  c.width = 320; c.height = 72;
  const gg = c.getContext('2d');
  gg.textAlign = 'center';
  gg.shadowColor = 'rgba(0,0,0,0.9)';
  gg.shadowBlur = 6;
  gg.font = '900 28px "M PLUS 1p", sans-serif';
  gg.fillStyle = '#f2b90c';
  gg.fillText('🏁 前回のお前はここまで', 160, 44);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  sp.scale.set(3.4, 0.77, 1);
  sp.position.y = 1.6;
  g.add(sp);
  const z = bestDist - distance;
  g.position.set(0, 0, -z);
  scene.add(g);
  entities.push({ kind: 'bestline', type: 'bestline', lane: 99, z, mesh: g, dead: false });
}

function spawnMarker(m) {
  if (DEBUG_PARAMS.has('debug')) console.log('[spawnMarker]', m.name, m.dist, 'at dist', Math.floor(distance));
  const mesh = makeMarkerMesh(m.name);
  const side = Math.random() < 0.5 ? -1 : 1;
  const z = m.dist - distance;
  mesh.position.set(side * 4.0, 0.32, -z); // 歩道の上に置く
  scene.add(mesh);
  entities.push({ kind: 'marker', type: 'marker', name: m.name, lane: 99, z, mesh, dead: false });
}

// ===== スポナー =====
// b=バリケード(ジャンプ可) h=ヘイター t=ゴミ缶(ジャンプ) s=看板(スライド) n=なし
// どの行も「空きレーン or ジャンプ/スライドで抜けられるレーン」を必ず含む。
// 序盤は障害物1個の行だけ → 距離で2個・3個の行を解禁して難度を上げる
const EASY_PATTERNS = [
  'bnn', 'nbn', 'nnb', 'hnn', 'nhn', 'nnh',
  'tnn', 'ntn', 'nnt', 'snn', 'nsn', 'nns',
];
const MID_PATTERNS = [
  'bbn', 'bnb', 'nbb', 'hbn', 'nbh', 'bhn', 'nhb', 'hnb', 'bnh',
  'tnt', 'sns', 'tnb', 'bnt', 'snb', 'bns', 'tnh', 'hnt', 'snh', 'hns',
  'ntb', 'btn', 'nsb', 'bsn', 'nth', 'htn', 'tsn', 'nst',
];
const HARD_PATTERNS = [
  'ttt', 'sss', 'tts', 'stt',
  'bts', 'stb', 'hts', 'sth', 'bst', 'tsb',
];
const TYPE_OF = { b: 'barricade', h: 'hater', t: 'trash', s: 'sign', o: 'hole' };
// o=穴 は300mから登場。落ちたら救済なしの即死
const HOLE_PATTERNS = ['onn', 'non', 'nno'];
const HOLE_MID_PATTERNS = ['onb', 'bno', 'onh', 'hno', 'ont', 'tno', 'ons', 'sno'];

function pickPattern() {
  // <250m: 単体のみ / <700m: 単体+2個 / それ以降: 全部
  const pool = [...EASY_PATTERNS];
  if (distance > 250) pool.push(...MID_PATTERNS);
  if (distance > 300) pool.push(...HOLE_PATTERNS);
  if (distance > 700) pool.push(...MID_PATTERNS, ...HARD_PATTERNS, ...HOLE_MID_PATTERNS);
  return pool[Math.floor(Math.random() * pool.length)];
}

function spawnRow(z) {
  rowsSpawned++;
  const pat = pickPattern();
  const openLanes = [];
  for (let i = 0; i < 3; i++) {
    const ch = pat[i];
    const lane = i - 1;
    if (ch === 'n') { openLanes.push(lane); continue; }
    const type = TYPE_OF[ch];
    const mesh = acquireMesh(type);
    mesh.position.set(lane * LANE_W, 0, -z);
    entities.push({ kind: 'ob', type, lane, z, mesh, dead: false, passed: false });
    if (ch === 't' || ch === 's') openLanes.push(lane);
  }

  // キャッシュ列: 空きレーンに60%で3〜5枚
  if (openLanes.length && Math.random() < 0.6) {
    const lane = openLanes[Math.floor(Math.random() * openLanes.length)];
    const n = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < n; i++) {
      spawnItem('cash', lane, z + 2.5 + i * 1.3);
    }
  }
  // レアアイテム: 6行に1回程度、空きレーンに
  if (openLanes.length && rowsSpawned > 3 && Math.random() < 0.17) {
    const lane = openLanes[Math.floor(Math.random() * openLanes.length)];
    const roll = Math.random();
    const type = roll < 0.3 ? 'mic' : roll < 0.55 ? 'weed' : roll < 0.8 ? 'bling' : 'gal';
    spawnItem(type, lane, z + 5.5);
  }
  // 裏ルート入口 (光るマンホール): たまに出る
  if (openLanes.length && distance > 250 && Math.random() < 0.08) {
    const lane = openLanes[Math.floor(Math.random() * openLanes.length)];
    const mesh = acquireMesh('alley');
    mesh.position.set(lane * LANE_W, 0, -(z + 9));
    entities.push({ kind: 'gate', type: 'alley', lane, z: z + 9, mesh, dead: false });
  }
}

function spawnItem(type, lane, z) {
  const mesh = acquireMesh(type);
  mesh.position.set(lane * LANE_W, 0.95, -z);
  entities.push({ kind: 'item', type, lane, z, mesh, dead: false });
}

function rowGap() {
  // 距離が伸びるほど行間を詰める (22m → 13m、900m でほぼ最小)
  const t = Math.min(1, distance / 900);
  return 22 - t * 9;
}

// ===== ポップテキスト・バナー =====
function showBanner(text) {
  bannerEl.textContent = text;
  bannerEl.classList.remove('pop');
  void bannerEl.offsetWidth;
  bannerEl.classList.add('pop');
}
function popText(text, cls = '') {
  const el = document.createElement('div');
  el.className = `pop-text ${cls}`;
  el.textContent = text;
  el.style.marginLeft = `${(Math.random() * 2 - 1) * 60}px`;
  document.body.appendChild(el);
  el.addEventListener('animationend', () => el.remove());
}

// ===== ゲームロジック =====
function beginGame() {
  if (state === STATE.OVER && performance.now() - overAt < 450) return;
  state = STATE.RUN;
  distance = 0;
  collectPts = 0;
  swag = 0;
  cashStreak = 0;
  fever = 0;
  chill = 0;
  hasGal = false;
  invuln = 0;
  chase = 0;
  cop.group.visible = false;
  copLight.intensity = 0;
  copX = 0;
  player.lane = 0; player.x = 0; player.y = 0; player.vy = 0;
  player.sliding = 0; player.jumping = false;
  alley = 0;
  scene.fog.near = 25;
  scene.fog.far = 85;
  bestBeating = false;
  bestLineSpawned = false;
  runStats = { nearMiss: 0, cash: 0, escapes: 0 };
  stats.plays++;
  rapper.group.rotation.set(0, 0, 0);
  rapper.group.scale.set(1, 1, 1);
  rapper.group.visible = true;
  gal.group.visible = false;
  galX = 0;
  for (const e of entities) releaseMesh(e.type, e.mesh);
  entities = [];
  spawnedUntil = 40;
  rowsSpawned = 0;
  swagMaxShown = false;
  districtIdx = 0;
  for (const m of rivalMarkers) m.spawned = false;
  fetchMarkers();
  for (const b of buildings) {
    styleBuilding(b);
    b.mesh.position.set(b.x, b.h / 2, -b.z);
  }
  startOverlay.classList.add('hidden');
  overOverlay.classList.add('hidden');
  rankOverlay.classList.add('hidden');
  tintEl.className = '';
  hintTimer = 3000;
  hintEl.classList.add('show');
  updateHUD();
}

function goTitle() {
  state = STATE.TITLE;
  overOverlay.classList.add('hidden');
  rankOverlay.classList.add('hidden');
  tintEl.className = '';
  startOverlay.classList.remove('hidden');
}

function setLane(dir) {
  if (state !== STATE.RUN) return;
  const next = Math.max(-1, Math.min(1, player.lane + dir));
  if (next !== player.lane) {
    player.lane = next;
    playTap();
  }
}
function jump() {
  if (state !== STATE.RUN) return;
  if (player.y > 0.05) return;
  player.vy = JUMP_V;
  player.jumping = true;
  player.sliding = 0;
  playJump();
}
function slide() {
  if (state !== STATE.RUN) return;
  if (player.y > 0.05) {
    player.vy = -14; // 空中から急降下してスライドへ
  }
  player.sliding = SLIDE_MS;
  playSlide();
  vibrate(15);
}

function grantItem(type) {
  const mult = multNow();
  if (type === 'cash') {
    cashStreak++;
    stats.cash++;
    runStats.cash++;
    const val = 100 * mult * (chill > 0 ? 2 : 1);
    collectPts += val;
    swag = Math.min(100, swag + 4);
    popText(`+${scoreLabel(val)}`);
    playCoin();
  } else if (type === 'mic') {
    fever = FEVER_MS;
    showBanner('MIC CHECK!!');
    popText('🎤 フィーバー!!');
    playFever();
    vibrate(40);
  } else if (type === 'weed') {
    chill = CHILL_MS;
    beatNextT = 0; // テンポ切替のためシーケンサを再同期
    showBanner('CHILL~');
    popText('🍃 チルタイム…');
    playChill();
  } else if (type === 'bling') {
    stats.bling++;
    const val = 1000 * mult;
    collectPts += val;
    swag = Math.min(100, swag + 40);
    popText(`💎 +${scoreLabel(val)}`);
    playBling();
    vibrate(30);
  } else if (type === 'gal') {
    hasGal = true;
    gal.group.visible = true;
    galX = player.x;
    popText('💁‍♀️「まかせて♡」');
    playGalGet();
  }
}

let swagMaxShown = false;

// ===== 裏ルート =====
function enterAlley() {
  alley = 4000;
  stats.alleys++;
  showBanner('裏ルート!!');
  popText('🕳 地下に潜った!');
  if (AC) playRiser(AC.currentTime, 0.5, 0.07);
  vibrate(30);
  // チェイス中なら地下でまける
  if (chase > 0) {
    chase = 0;
    stats.escapes++;
    runStats.escapes++;
    popText('🚔 裏道でまいた!', 'nice');
    swag = Math.min(100, swag + 20);
  }
  // 進行方向の障害物・ゲートを片付けてキャッシュ天国に
  for (const e of entities) {
    if ((e.kind === 'ob' || e.kind === 'gate') && !e.dead && e.z > 1) {
      e.dead = true;
      e.mesh.visible = false;
    }
  }
  scene.fog.near = 7;
  scene.fog.far = 32;
}

function exitAlley() {
  alley = 0;
  showBanner('表通りへ!');
  if (AC) playRiser(AC.currentTime, 0.4, 0.05);
  scene.fog.near = 25;
  scene.fog.far = 85;
  // 出口はハードな行でお出迎え (リスクとリターン)
  const pool = distance > 700 ? HARD_PATTERNS : MID_PATTERNS;
  const pat = pool[Math.floor(Math.random() * pool.length)];
  for (let i = 0; i < 3; i++) {
    const ch = pat[i];
    if (ch === 'n') continue;
    const type = TYPE_OF[ch];
    const mesh = acquireMesh(type);
    const z = spawnedUntil - rowGap() * 0.5;
    mesh.position.set((i - 1) * LANE_W, 0, -z);
    entities.push({ kind: 'ob', type, lane: i - 1, z, mesh, dead: false, passed: false });
  }
}

function hitObstacle(ob) {
  if (fever > 0) {
    // フィーバー中は粉砕して進む
    ob.dead = true;
    ob.vy = 9;
    ob.spin = (Math.random() * 2 - 1) * 8;
    collectPts += 200;
    popText('+200 SMASH!');
    playSmash();
    vibrate(20);
    return;
  }
  if (hasGal) {
    hasGal = false;
    gal.group.visible = false;
    invuln = 1500;
    ob.dead = true;
    ob.vy = 7;
    ob.spin = 5;
    stats.galSaves++;
    popText('💁‍♀️「キャーッ!!」身代わり!', 'warn');
    playGalScream();
    vibrate(60);
    return;
  }
  if (chase > 0) {
    // 追跡中にもう一度転んだら御用
    die('police');
    return;
  }
  // 1回目は転ぶだけで済むが、ポリスが追ってくる
  chase = 8000;
  invuln = 1400;
  ob.dead = true;
  ob.vy = 7;
  ob.spin = 4;
  popText('🚔 ポリスだ!転ぶな!逃げろ!', 'warn');
  showBanner('RUN!!');
  playSiren();
  vibrate([60, 40, 60]);
}

function die(reason) {
  state = STATE.DEAD;
  deathReason = reason;
  deadTimer = 950;
  swag = 0;
  fever = 0;
  chill = 0;
  chase = 0;
  if (alley > 0) {
    alley = 0;
    scene.fog.near = 25;
    scene.fog.far = 85;
  }
  cop.group.visible = false;
  copLight.intensity = 0;
  tintEl.className = '';
  overReasonEl.textContent = DEATH_REASONS[reason] || '路上に散った';
  playCrash();
  playFail();
  vibrate([80, 40, 120]);
}

function endGame() {
  state = STATE.OVER;
  overAt = performance.now();
  const sc = totalScore();
  if (sc > best) {
    best = sc;
    try { localStorage.setItem('rap_best', String(best)); } catch (e) {}
  }
  const distM = Math.floor(distance);
  if (distM > bestDist) {
    bestDist = distM;
    try { localStorage.setItem('rap_best_dist', String(bestDist)); } catch (e) {}
  }
  stats.maxDist = Math.max(stats.maxDist, distM);
  stats.maxScore = Math.max(stats.maxScore, sc);
  const newBadges = checkNewBadges();
  saveStats();
  document.getElementById('run-stats').textContent =
    `😤 スカし ${runStats.nearMiss} / 💴 ${runStats.cash}枚 / 🚔 逃走 ${runStats.escapes}回`;
  if (newBadges.length) {
    setTimeout(() => {
      for (const b of newBadges) popText(`🎖 バッジ獲得: ${b.medal} ${b.name}!`, 'nice');
      playBling();
    }, 600);
  }
  document.getElementById('over-head').textContent = OVER_HEADS[Math.floor(Math.random() * OVER_HEADS.length)];
  rankTitleEl.textContent = rankTitle(sc);
  overScoreEl.textContent = scoreLabel(sc);
  overBestEl.textContent = scoreLabel(best);
  overCommentEl.textContent = OVER_COMMENTS[Math.floor(Math.random() * OVER_COMMENTS.length)];
  top10Badge.classList.add('hidden');
  overOverlay.classList.remove('hidden');
  updateHUD();
  autoSubmitScore(sc, Math.floor(distance));
}

// ===== 更新 =====
function update(dt) {
  const dtSec = dt / 1000;

  if (state === STATE.DEAD) {
    deadTimer -= dt;
    if (deathReason === 'hole') {
      // 穴にまっさかさま
      rapper.group.position.y -= dt * 0.006;
      rapper.group.rotation.z += dt * 0.008;
      rapper.group.scale.multiplyScalar(Math.max(0.9, 1 - dt * 0.0012));
    } else {
      // 前のめりに転倒
      rapper.group.rotation.x = Math.min(1.45, rapper.group.rotation.x + dt * 0.006);
      rapper.group.position.y = Math.max(0.15, rapper.group.position.y - dt * 0.004);
    }
    if (deadTimer <= 0) endGame();
    return;
  }
  if (state !== STATE.RUN) return;

  const sp = speedNow();
  const ds = sp * dtSec;
  distance += ds;

  // タイマー類
  // フィーバーはチルのスローモーション(0.6倍)に合わせて消費 — 同時取得でも損しない
  if (fever > 0) fever -= dt * (chill > 0 ? 0.6 : 1);
  if (chill > 0) {
    chill -= dt;
    if (chill <= 0) beatNextT = 0; // テンポ復帰で再同期
  }
  if (invuln > 0) invuln -= dt;
  if (chase > 0) {
    chase -= dt * (chill > 0 ? 0.6 : 1);
    if (chase <= 0) {
      popText('🚔 まいたぜ!', 'nice');
      swag = Math.min(100, swag + 15);
      stats.escapes++;
      runStats.escapes++;
    } else if (AC && AC.currentTime - lastSirenT > 1.8) {
      lastSirenT = AC.currentTime;
      playSiren();
    }
  }
  if (alley > 0) {
    alley -= dt * (chill > 0 ? 0.6 : 1);
    if (alley <= 0) exitAlley();
  }
  if (hintTimer > 0) {
    hintTimer -= dt;
    if (hintTimer <= 0) hintEl.classList.remove('show');
  }

  // SWAG減衰 (ギャル同伴中は維持)
  if (!hasGal) swag = Math.max(0, swag - 3 * dtSec);
  if (swag >= 100 && !swagMaxShown) {
    swagMaxShown = true;
    showBanner('SWAG MAX!!');
    if (AC) playChant(AC.currentTime, 0.08);
  }
  if (swag < 80) swagMaxShown = false;

  // 地区の切り替わり
  const di = districtOf(distance);
  if (di !== districtIdx) {
    districtIdx = di;
    showBanner(DISTRICTS[di].name);
    popText(`📍 ${DISTRICTS[di].name} に突入!`);
    if (AC) playRiser(AC.currentTime, 0.6, 0.06);
  }

  // 画面エフェクト
  const wantTint = fever > 0 ? 'fever' : chill > 0 ? 'chill' : '';
  if (tintEl.className !== wantTint) tintEl.className = wantTint;
  scene.fog.color.setHex(alley > 0 ? 0x06140c : fever > 0 ? 0x2a1f08 : chill > 0 ? 0x1a0c2e : DISTRICTS[districtIdx].fog);
  scene.background.copy(scene.fog.color);

  // プレイヤー移動
  player.x += (player.lane - player.x) * Math.min(1, dt / 90);
  if (player.y > 0 || player.vy !== 0) {
    player.vy -= GRAVITY * dtSec;
    player.y += player.vy * dtSec;
    if (player.y <= 0) {
      player.y = 0;
      player.vy = 0;
      player.jumping = false;
    }
  }
  if (player.sliding > 0) player.sliding -= dt;

  // ワールドを流す + スポーン (裏ルート中はキャッシュ天国)
  spawnedUntil -= ds;
  while (spawnedUntil < DRAW_DIST) {
    spawnedUntil += rowGap();
    if (DEBUG_SAFE) continue;
    if (alley > 0) {
      // キャッシュ天国: 2レーンにびっしり
      const gap = rowGap();
      const l1 = Math.floor(Math.random() * 3) - 1;
      const l2 = ((l1 + 2 + Math.floor(Math.random() * 2)) % 3) - 1;
      const n = Math.max(4, Math.floor(gap / 2));
      for (let i = 0; i < n; i++) {
        spawnItem('cash', l1, spawnedUntil - gap + i * 2);
        if (i % 2 === 0) spawnItem('cash', l2, spawnedUntil - gap + 1 + i * 2);
      }
    } else {
      spawnRow(spawnedUntil);
    }
  }

  // 開発用の強制配置
  if (!debugSpawned && (DEBUG_ALLEY_AT || DEBUG_HOLE_AT) && distance > 5) {
    debugSpawned = true;
    if (DEBUG_ALLEY_AT) {
      const mesh = acquireMesh('alley');
      mesh.position.set(0, 0, -DEBUG_ALLEY_AT);
      entities.push({ kind: 'gate', type: 'alley', lane: 0, z: DEBUG_ALLEY_AT, mesh, dead: false });
    }
    if (DEBUG_HOLE_AT) {
      const mesh = acquireMesh('hole');
      mesh.position.set(0, 0, -DEBUG_HOLE_AT);
      entities.push({ kind: 'ob', type: 'hole', lane: 0, z: DEBUG_HOLE_AT, mesh, dead: false, passed: false });
    }
  }

  // TOP10の散り際マーカー
  for (const m of rivalMarkers) {
    if (!m.spawned && m.dist - distance < DRAW_DIST && m.dist - distance > 5) {
      m.spawned = true;
      spawnMarker(m);
    }
  }
  // 自己ベストライン
  if (!bestLineSpawned && bestDist > 30 && bestDist - distance < DRAW_DIST && bestDist - distance > 5) {
    bestLineSpawned = true;
    spawnBestLine();
  }

  for (const b of buildings) {
    b.z -= ds;
    if (b.z < -14) {
      b.z += B_COUNT * B_SPACING;
      styleBuilding(b);
    }
    b.mesh.position.set(b.x, b.h / 2, -b.z);
  }
  // 白線が手前に流れる向き (進行方向と逆) にスクロール
  roadTex.offset.y = (distance / ROAD_TILE) % 1;

  // エンティティ更新
  const playerLane = Math.round(player.x);
  for (const e of entities) {
    e.z -= ds;
    if (e.dead) {
      // 吹っ飛び演出
      e.vy -= 30 * dtSec;
      e.mesh.position.y += e.vy * dtSec;
      e.mesh.rotation.z += (e.spin || 6) * dtSec;
      e.mesh.rotation.x += 3 * dtSec;
      e.mesh.position.z = -e.z;
      continue;
    }
    e.mesh.position.z = -e.z;
    if (e.kind === 'item') {
      e.mesh.position.y = 0.95 + Math.sin(timeNow * 0.004 + e.z) * 0.12;
    }
    if (e.type === 'hater') {
      // 拳を振り上げて体を揺らす煽りモーション
      const seed = e.mesh.id * 1.7;
      const l = e.mesh.userData.limbs;
      if (l) l.armR.rotation.x = -2.2 + Math.sin(timeNow * 0.013 + seed) * 0.5;
      e.mesh.rotation.y = Math.PI + Math.sin(timeNow * 0.005 + seed) * 0.2;
      e.mesh.position.y = Math.abs(Math.sin(timeNow * 0.009 + seed)) * 0.12;
    }

    if (Math.abs(e.z) < HIT_Z && e.lane === playerLane) {
      if (e.kind === 'item') {
        e.dead = true;
        e.mesh.visible = false;
        grantItem(e.type);
        continue;
      }
      if (e.kind === 'gate') {
        // マンホールは地上にいる時だけ発動 (ジャンプ中はスルー)
        if (player.y < 0.3 && alley <= 0) {
          e.dead = true;
          e.mesh.visible = false;
          enterAlley();
        }
        continue;
      }
      if (e.type === 'hole') {
        // 穴は問答無用の即死。フィーバーもギャルもポリス救済も効かない
        if (player.y <= 0.35) {
          die('hole');
          return;
        }
        continue;
      }
      // 障害物: 回避条件チェック (無敵中はすり抜け)
      // バリケードは見た目通りジャンプで飛び越せる (ヘイターは人なので不可)
      const avoided =
        (e.type === 'trash' && player.y > 0.55) ||
        (e.type === 'barricade' && player.y > 0.95) ||
        (e.type === 'sign' && player.sliding > 0 && player.y < 0.2);
      if (!avoided && invuln <= 0) {
        hitObstacle(e);
        if (state === STATE.DEAD) return;
      }
    }

    // 自己ベストラインを越えた瞬間
    if (e.kind === 'bestline' && !e.passed && e.z < 0) {
      e.passed = true;
      bestBeating = true;
      showBanner('自己ベスト更新中!!');
      popText('🏁 過去の自分、置き去り', 'nice');
      swag = Math.min(100, swag + 25);
      playFever();
      vibrate([30, 20, 60]);
    }

    // ライバルの散り際を越えた瞬間
    if (e.kind === 'marker' && !e.passed && e.z < 0) {
      e.passed = true;
      if (e.name !== savedName) {
        swag = Math.min(100, swag + 5);
        popText(`⚰ ${e.name} を越えた!`, 'nice');
      } else {
        popText('⚰ 前回のお前を越えた!', 'nice');
      }
    }

    // ニアミス判定 (立ち障害物が真横を通過)
    if (e.kind === 'ob' && !e.passed && e.z < 0) {
      e.passed = true;
      if ((e.type === 'barricade' || e.type === 'hater') && Math.abs(e.lane - playerLane) === 1) {
        swag = Math.min(100, swag + 8);
        popText('NICE! SWAG+', 'nice');
        stats.nearMiss++;
        runStats.nearMiss++;
      }
      if (e.type === 'trash' || e.type === 'sign' || e.type === 'barricade' || e.type === 'hole') {
        // 飛び越え/くぐり成功もSWAG
        if (e.lane === playerLane) {
          swag = Math.min(100, swag + 6);
          popText('COOL!', 'nice');
          stats.nearMiss++;
          runStats.nearMiss++;
        }
      }
    }
  }
  // 後方へ抜けたエンティティを回収
  entities = entities.filter((e) => {
    if (e.z < -6 || (e.dead && e.kind === 'ob' && e.mesh.position.y < -3) || (e.dead && e.kind === 'item')) {
      if (e.kind === 'marker' || e.kind === 'bestline') {
        // マーカー類は都度生成なので破棄する
        scene.remove(e.mesh);
        e.mesh.traverse((o) => {
          if (o.material) {
            if (o.material.map) o.material.map.dispose();
            o.material.dispose();
          }
        });
      } else {
        releaseMesh(e.type, e.mesh);
      }
      return false;
    }
    return true;
  });

  updateHUD();
}

// ===== キャラのポーズ =====
function poseRunner(h, phase, y, slideAmt, xPos) {
  const g = h.group;
  g.position.x = xPos;
  g.position.y = y + Math.abs(Math.sin(phase)) * 0.06 * (1 - slideAmt);
  const swing = Math.sin(phase) * 0.95;
  h.limbs.legL.rotation.x = swing * (1 - slideAmt);
  h.limbs.legR.rotation.x = -swing * (1 - slideAmt);
  h.limbs.armL.rotation.x = -swing * 0.8 * (1 - slideAmt);
  if (h.micHand) {
    // マイクの右手は顔の横で小さく揺らす (ラップしながら走る)
    h.limbs.armR.rotation.x = -2.0 + swing * 0.15;
  } else {
    h.limbs.armR.rotation.x = swing * 0.8 * (1 - slideAmt);
  }
  if (y > 0.05) {
    // ジャンプ: 手を上げ脚をたたむ
    h.limbs.legL.rotation.x = 0.9;
    h.limbs.legR.rotation.x = 0.5;
    h.limbs.armL.rotation.x = -2.4;
    h.limbs.armR.rotation.x = -2.4;
  }
  // スライド: 前傾して低く
  g.rotation.x = Math.PI * 0 + slideAmt * 1.15;
  g.position.y -= slideAmt * 0.62;
  if (slideAmt > 0.1) {
    h.limbs.legL.rotation.x = -1.4 * slideAmt;
    h.limbs.legR.rotation.x = -1.1 * slideAmt;
    h.limbs.armL.rotation.x = 1.2 * slideAmt;
    h.limbs.armR.rotation.x = -2.2 * slideAmt;
  }
}

// ===== メインループ =====
let lastT = 0;
function loop(t) {
  const dt = Math.min(t - lastT, 50);
  lastT = t;
  timeNow = t;

  if (state === STATE.RUN || state === STATE.DEAD) {
    update(dt);
  }
  if (state === STATE.RUN && AC) scheduleBeat();

  // キャラ描画
  if (state === STATE.RUN || state === STATE.TITLE || state === STATE.OVER) {
    const phase = distance * 2.4 + t * 0.001;
    const slideAmt = Math.min(1, Math.max(0, player.sliding / 180));
    const px = player.x * LANE_W;
    poseRunner(rapper, state === STATE.RUN ? phase : t * 0.006, player.y, state === STATE.RUN ? slideAmt : 0, px);
    // 被弾後の無敵中は点滅
    rapper.group.visible = invuln > 0 ? Math.floor(t / 90) % 2 === 0 : true;
    if (gal.group.visible) {
      galX += (px - galX) * Math.min(1, dt / 220);
      poseRunner(gal, phase + 1.7, 0, 0, galX);
      gal.group.position.z = 1.6;
    }
    // ポリス: 追跡中は真後ろに迫り、終わり際は追いつけず消える
    const chasing = chase > 0 && state === STATE.RUN;
    cop.group.visible = chasing;
    if (chasing) {
      // プレイヤーを隠さないよう斜め後ろから追う
      const copTarget = px + (px >= 0 ? -1.15 : 1.15);
      copX += (copTarget - copX) * Math.min(1, dt / 320);
      poseRunner(cop, phase + 0.8, 0, 0, copX);
      const fade = Math.min(1, chase / 1500); // 残り1.5秒で後方へ離脱
      cop.group.position.z = 3.3 + (1 - fade) * 7;
      copLight.position.set(copX, 3.2, cop.group.position.z + 0.5);
      copLight.intensity = 1.6 + Math.sin(t * 0.03) * 0.6;
      copLight.color.setHex(Math.floor(t / 160) % 2 === 0 ? 0xff2233 : 0x2244ff);
    } else {
      copLight.intensity = 0;
    }
    // 自己ベスト更新中の金オーラ
    if (bestBeating && state === STATE.RUN) {
      goldAura.position.set(px, 1.6, 0.6);
      goldAura.intensity = 1.4 + Math.sin(t * 0.012) * 0.5;
    } else {
      goldAura.intensity = 0;
    }
  }

  // カメラ
  const camX = player.x * LANE_W * 0.55;
  const bob = state === STATE.RUN ? Math.sin(distance * 1.4) * 0.05 : 0;
  camera.position.set(camX, 4.0 + bob + (chill > 0 ? 0.35 : 0), 7.2);
  camera.lookAt(player.x * LANE_W * 0.8, 0.9, -12);

  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

// ===== HUD =====
function updateHUD() {
  distEl.textContent = `${Math.floor(distance)}m`;
  scoreEl.textContent = scoreLabel(totalScore());
  multEl.textContent = `×${multNow()}`;
  bestEl.textContent = best > 0 ? scoreLabel(best) : '—';
  swagBar.style.width = `${swag}%`;
  swagWrap.classList.toggle('max', swag >= 80);
  swagWrap.style.display = state === STATE.RUN ? '' : 'none';

  let fx = '';
  if (fever > 0) fx += `<span class="fx-chip">🎤 ${(fever / 1000).toFixed(1)}s</span>`;
  if (chill > 0) fx += `<span class="fx-chip chill">🍃 ${(chill / 1000).toFixed(1)}s</span>`;
  if (hasGal) fx += `<span class="fx-chip">💁‍♀️ 身代わり</span>`;
  if (chase > 0) fx += `<span class="fx-chip police">🚔 ${(chase / 1000).toFixed(1)}s</span>`;
  fxHud.innerHTML = fx;
}

// ===== 入力 =====
let pDown = null;
window.addEventListener('pointerdown', (e) => {
  ensureAudio();
  pDown = { x: e.clientX, y: e.clientY };
});
window.addEventListener('pointerup', (e) => {
  if (!pDown) return;
  const dx = e.clientX - pDown.x;
  const dy = e.clientY - pDown.y;
  pDown = null;
  if (state !== STATE.RUN) return;
  const SWIPE_MIN = 24;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_MIN) return;
  if (Math.abs(dx) > Math.abs(dy)) {
    setLane(dx > 0 ? 1 : -1);
  } else if (dy < 0) {
    jump();
  } else {
    slide();
  }
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

window.addEventListener('keydown', (e) => {
  if (e.repeat) return;
  if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', ' '].includes(e.key)) {
    e.preventDefault();
    ensureAudio();
  }
  if (e.key === 'ArrowLeft') setLane(-1);
  else if (e.key === 'ArrowRight') setLane(1);
  else if (e.key === 'ArrowUp' || e.key === ' ') jump();
  else if (e.key === 'ArrowDown') slide();
});

startOverlay.addEventListener('click', () => {
  ensureAudio();
  const name = nameInput.value.trim().slice(0, 10);
  if (!name) {
    startTapEl.textContent = '⚠️ MCネームを入れて参戦!';
    nameInput.focus();
    return;
  }
  savedName = name;
  try { localStorage.setItem('rap_name', name); } catch (e) {}
  beginGame();
});
nameInput.addEventListener('click', (e) => e.stopPropagation());
nameInput.addEventListener('pointerdown', (e) => e.stopPropagation());
overOverlay.addEventListener('click', () => { ensureAudio(); beginGame(); });
document.getElementById('back-portal').addEventListener('click', (e) => e.stopPropagation());
document.getElementById('back-title').addEventListener('click', (e) => {
  e.stopPropagation();
  goTitle();
});

// ===== オンラインランキング =====
const API = '/api/scores';
let savedName = '';
try {
  savedName = localStorage.getItem('rap_name') || localStorage.getItem('pk_name') || '';
} catch (e) {}
nameInput.value = savedName;

async function autoSubmitScore(score, dist) {
  if (score < 1 || !savedName) return;
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'rap', name: savedName, score, dist }),
    });
    if (!r.ok) return;
    const data = await r.json();
    const top = data.top || [];
    if (top.some((e) => e.name === savedName)) {
      top10Badge.classList.remove('hidden');
      setTimeout(() => {
        if (state === STATE.OVER && !overOverlay.classList.contains('hidden')) {
          rankOverlay.classList.remove('hidden');
          renderRanking(top, savedName);
        }
      }, 900);
    }
  } catch (e) { /* オフライン時は静かにスキップ */ }
}

function renderRanking(top, highlightName) {
  rankListEl.innerHTML = '';
  if (!top.length) {
    const li = document.createElement('li');
    li.className = 'rank-loading';
    li.textContent = 'まだ記録がない。最初の天下人になれ!';
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
    const r = await fetch(`${API}?game=rap`);
    if (!r.ok) throw new Error();
    const data = await r.json();
    renderRanking(data.top || [], highlightName);
  } catch (e) {
    rankListEl.innerHTML = '<li class="rank-loading">ランキングを取得できませんでした</li>';
  }
}

showRankStartBtn.addEventListener('click', (e) => { e.stopPropagation(); openRanking(savedName); });
showRankOverBtn.addEventListener('click', (e) => { e.stopPropagation(); openRanking(savedName); });
rankOverlay.addEventListener('click', (e) => {
  e.stopPropagation();
  rankOverlay.classList.add('hidden');
});

// ===== ロッカー =====
const lockerOverlay = document.getElementById('locker-overlay');
document.getElementById('show-locker').addEventListener('click', (e) => {
  e.stopPropagation();
  renderLocker();
  lockerOverlay.classList.remove('hidden');
});
lockerOverlay.addEventListener('click', (e) => {
  e.stopPropagation();
  lockerOverlay.classList.add('hidden');
});

// ===== 結果シェア =====
async function shareResult() {
  const sc = totalScore();
  const distM = Math.floor(distance);
  const c = document.createElement('canvas');
  c.width = 1000; c.height = 1250;
  const g = c.getContext('2d');
  try { await document.fonts.load('italic 900 100px "Reggae One"'); } catch (e) {}
  // 背景
  g.fillStyle = '#0c0c14';
  g.fillRect(0, 0, 1000, 1250);
  // 街のシルエット
  g.fillStyle = '#171722';
  for (let i = 0; i < 13; i++) {
    const w = 46 + ((i * 37) % 60);
    const h = 130 + ((i * 89) % 280);
    g.fillRect(45 + i * 72, 1180 - h, w, h);
  }
  g.fillStyle = 'rgba(255,214,120,0.55)';
  for (let i = 0; i < 90; i++) {
    g.fillRect(50 + ((i * 61) % 890), 930 + ((i * 37) % 230), 7, 9);
  }
  // 金フレーム
  g.strokeStyle = '#f2b90c';
  g.lineWidth = 10;
  g.strokeRect(28, 28, 944, 1194);
  // ロゴ
  g.textAlign = 'center';
  g.fillStyle = '#ffffff';
  g.font = 'italic 900 92px "Reggae One", "Archivo Black", sans-serif';
  g.shadowColor = '#f2b90c';
  g.shadowOffsetX = 6; g.shadowOffsetY = 6;
  g.fillText('RUN DA CITY', 500, 165);
  g.shadowColor = 'transparent';
  g.shadowOffsetX = 0; g.shadowOffsetY = 0;
  // 名前
  g.fillStyle = '#f2b90c';
  g.font = '900 44px "M PLUS 1p", sans-serif';
  g.fillText(`MC ${savedName || '???'}`, 500, 300);
  // スコア
  g.fillStyle = 'rgba(244,242,251,0.7)';
  g.font = '800 34px "M PLUS 1p", sans-serif';
  g.fillText('SCORE', 500, 400);
  g.fillStyle = '#ffffff';
  g.font = '900 150px "Archivo Black", "M PLUS 1p", sans-serif';
  g.fillText(scoreLabel(sc), 500, 545);
  // 称号
  g.fillStyle = '#f2b90c';
  g.font = 'italic 900 58px "Reggae One", "M PLUS 1p", sans-serif';
  g.fillText(rankTitle(sc), 500, 680);
  // 統計
  g.fillStyle = 'rgba(244,242,251,0.85)';
  g.font = '800 32px "M PLUS 1p", sans-serif';
  g.fillText(`🏃 ${scoreLabel(distM)}m  😤 スカし${runStats.nearMiss}  🚔 逃走${runStats.escapes}`, 500, 770);
  // マイク
  g.font = '110px serif';
  g.fillText('🎤', 500, 900);
  // URL
  g.fillStyle = 'rgba(244,242,251,0.6)';
  g.font = '800 30px "M PLUS 1p", sans-serif';
  g.fillText('オヤユビ帝国 /rap/ で天下を獲れ', 500, 1160);

  if (DEBUG_PARAMS.has('debug')) window.__shareCanvas = c;
  const blob = await new Promise((res) => c.toBlob(res, 'image/png'));
  if (!blob) return;
  const file = new File([blob], 'run-da-city.png', { type: 'image/png' });
  const text = `RUN DA CITY: ${scoreLabel(sc)}点で「${rankTitle(sc)}」になった🎤 お前も天下獲ってみろ`;
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try {
      await navigator.share({ files: [file], text });
      return;
    } catch (e) { /* キャンセル時はフォールバックへ */ }
  }
  // フォールバック: 画像をダウンロード
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'run-da-city.png';
  a.click();
  URL.revokeObjectURL(a.href);
  popText('📸 画像を保存した!');
}

document.getElementById('share-btn').addEventListener('click', (e) => {
  e.stopPropagation();
  shareResult();
});

// ===== 起動 =====
updateHUD();
requestAnimationFrame((t) => { lastT = t; requestAnimationFrame(loop); });
