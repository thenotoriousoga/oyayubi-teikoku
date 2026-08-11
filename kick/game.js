// ワンタップ道場: パンチ・キック・ガード・かわすの4アクションで戦うキックボクサーもの
// タップ=パンチ / 上スワイプ=キック / 長押し=ガード / 左右スワイプ=かわす
// 相手の予兆を見て読む: オレンジ=パンチ(ガードで防げる)、赤=キック(かわさないと大ダメージ)
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
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", serif';
const PLAYER_MAX_HP = 100;
const HEAL_ON_WIN = 25;

const PUNCH_DMG_CHIP = 3, PUNCH_DMG_CRIT = 9;
const KICK_DMG_CHIP = 4, KICK_DMG_CRIT = 16;
const PUNCH_BASE_DMG = 9, KICK_BASE_DMG = 16;

const HOLD_MIN_TIME = 0.15;   // これ以上押し続けるとガード姿勢に入る
const SWIPE_MIN_DIST = 32;    // これ以上動いたらスワイプ判定
const DODGE_WINDOW = 0.32;    // かわす判定が有効な時間
const COUNTER_OPEN_DUR = 0.7; // パーフェクト回避後のボーナス隙時間

const rand = (a, b) => a + Math.random() * (b - a);
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// 相手ロースター (雑魚から伝説まで10人。全員抜いたら周回して強化される)
const ROSTER = [
  { name: 'サンドバッグ太郎', title: '見習い',   emoji: '🥊', hp: 38, dmgMul: 0.65, telegraph: 0.85, atkMin: 1.3, atkMax: 2.0, kickChance: 0.12, openChance: 0.38 },
  { name: '空き地のガキ大将', title: 'いばりんぼ', emoji: '😤', hp: 46, dmgMul: 0.75, telegraph: 0.78, atkMin: 1.2, atkMax: 1.9, kickChance: 0.18, openChance: 0.35 },
  { name: '道場の先輩',     title: '中堅',     emoji: '🧑‍🎓', hp: 54, dmgMul: 0.85, telegraph: 0.72, atkMin: 1.1, atkMax: 1.8, kickChance: 0.24, openChance: 0.32 },
  { name: '町内の用心棒',   title: '実力者',   emoji: '💪', hp: 62, dmgMul: 0.95, telegraph: 0.66, atkMin: 1.0, atkMax: 1.7, kickChance: 0.30, openChance: 0.30 },
  { name: '覆面レスラー',   title: '曲者',     emoji: '🎭', hp: 70, dmgMul: 1.02, telegraph: 0.60, atkMin: 0.95, atkMax: 1.6, kickChance: 0.36, openChance: 0.27 },
  { name: '元プロボクサー', title: '玄人',     emoji: '🥇', hp: 80, dmgMul: 1.10, telegraph: 0.55, atkMin: 0.9, atkMax: 1.5, kickChance: 0.42, openChance: 0.24 },
  { name: '格闘技クイーン', title: '女帝',     emoji: '👑', hp: 90, dmgMul: 1.16, telegraph: 0.50, atkMin: 0.85, atkMax: 1.4, kickChance: 0.46, openChance: 0.22 },
  { name: '無敗の帝王',     title: '絶対王者', emoji: '🐉', hp: 100, dmgMul: 1.22, telegraph: 0.45, atkMin: 0.8, atkMax: 1.3, kickChance: 0.50, openChance: 0.20 },
  { name: '謎の覚醒者',     title: '規格外',   emoji: '👹', hp: 112, dmgMul: 1.30, telegraph: 0.40, atkMin: 0.75, atkMax: 1.2, kickChance: 0.54, openChance: 0.17 },
  { name: '伝説の帝拳',     title: '伝説',     emoji: '🐲', hp: 128, dmgMul: 1.38, telegraph: 0.36, atkMin: 0.7, atkMax: 1.1, kickChance: 0.58, openChance: 0.15 },
];

const RANK_TITLES = [
  [0, 'サンドバッグ見習い'], [3, '道場生'], [6, '喧嘩自慢'], [10, '町の用心棒'],
  [15, 'プロファイター'], [20, '無冠の帝王'], [30, '格闘王'], [45, '伝説の帝拳王'],
];
function titleOf(n) {
  let t = RANK_TITLES[0][1];
  for (const [th, name] of RANK_TITLES) { if (n >= th) t = name; }
  return t;
}
function commentOf(n) {
  if (n < 3) return 'まだまだこれから。予兆をよく見て!';
  if (n < 10) return 'いいパンチだった。リングにも慣れてきたね';
  if (n < 20) return 'もう立派なファイター。会場が沸いてる!';
  if (n < 30) return 'ケタ違いの強さ。伝説になりつつある…';
  return 'もはや生きる伝説。誰も勝てない';
}

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
  const gain = ac.createGain();
  osc.type = type || 'sine';
  osc.frequency.setValueAtTime(freq, t0);
  if (slide) osc.frequency.linearRampToValueAtTime(freq + slide, t0 + dur);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(vol, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(gain).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}
const sePunch = () => tone(180, 0.09, 'square', 0.12, 0, -60);
const seKick = () => { tone(110, 0.16, 'sawtooth', 0.14, 0, -70); tone(70, 0.14, 'square', 0.1, 0.03); };
const seGuard = () => tone(500, 0.08, 'square', 0.08, 0);
const seDodge = () => tone(760, 0.1, 'sine', 0.08, 0, 260);
const seHit = () => tone(140, 0.12, 'sawtooth', 0.12, 0, -90);
const seCrit = () => { tone(700, 0.08, 'triangle', 0.11); tone(1000, 0.1, 'triangle', 0.1, 0.06); };
const seKO = () => { tone(523.3, 0.16, 'triangle', 0.12); tone(659.3, 0.16, 'triangle', 0.12, 0.14); tone(880, 0.3, 'triangle', 0.13, 0.28); };
const seOver = () => { tone(300, 0.3, 'sawtooth', 0.1); tone(220, 0.5, 'sawtooth', 0.1, 0.22); };

// ===== DOM =====
const hud = document.getElementById('hud');
const koEl = document.getElementById('ko');
const foeEl = document.getElementById('foe');
const bestEl = document.getElementById('best');
const toastEl = document.getElementById('toast');
const startOverlay = document.getElementById('start-overlay');
const overOverlay = document.getElementById('over-overlay');
const rankOverlay = document.getElementById('rank-overlay');
const nameInput = document.getElementById('name-input');
const overKoEl = document.getElementById('over-ko');
const overBestEl = document.getElementById('over-best');
const overCommentEl = document.getElementById('over-comment');
const overHeadEl = document.getElementById('over-head');
const rankTitleEl = document.getElementById('rank-title');
const top10Badge = document.getElementById('top10-badge');
const rankListEl = document.getElementById('rank-list');

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

// ===== 状態 =====
const STATE = { TITLE: 0, FIGHT: 1, KO_BEAT: 2, OVER: 3 };
let state = STATE.TITLE;

const player = {
  hp: PLAYER_MAX_HP, maxHp: PLAYER_MAX_HP,
  guarding: false, dodgeT: 0, dodgeDir: 0,
  punchAnim: 0, kickAnim: 0, hitFlash: 0,
};
let opp = null;
let rungIdx = 0;
let loopCount = 0;
let koCount = 0;
let particles = [];
let shakeT = 0, shakeMag = 0;
let rivals = [];

let best = 0;
try { best = parseInt(localStorage.getItem('kick_best') || '0', 10) || 0; } catch (e) {}

const diffMul = () => Math.min(1 + loopCount * 0.18, 2.4);
const totalBeaten = () => loopCount * ROSTER.length + rungIdx;

function spawnOpponent() {
  const base = ROSTER[rungIdx];
  const dm = diffMul();
  opp = {
    name: base.name, title: base.title, emoji: base.emoji,
    maxHp: Math.round(base.hp * dm), hp: Math.round(base.hp * dm),
    dmgMul: base.dmgMul * dm,
    telegraph: Math.max(0.22, base.telegraph / Math.sqrt(dm)),
    atkMin: base.atkMin, atkMax: Math.max(0.55, base.atkMax / Math.sqrt(dm)),
    kickChance: Math.min(0.75, base.kickChance * (1 + loopCount * 0.1)),
    openChance: Math.max(0.08, base.openChance / Math.sqrt(dm)),
    beat: 'guard', beatT: 0, beatDur: rand(base.atkMin, base.atkMax),
    atkType: null, hitFlash: 0, introT: 0.9,
  };
  const loopPrefix = loopCount >= 1 ? `${loopCount + 1}周目 ` : '';
  toast(`${loopPrefix}第${totalBeaten() + 1}戦 ${opp.emoji}${opp.name}`);
  updateHud();
}

function enterBeat(beat, dur) { opp.beat = beat; opp.beatT = 0; opp.beatDur = dur; }

function updateOpponent(dt) {
  if (!opp) return;
  if (opp.introT > 0) { opp.introT -= dt; return; } // 登場中は動かない
  opp.hitFlash = Math.max(0, opp.hitFlash - dt);
  opp.beatT += dt;
  switch (opp.beat) {
    case 'guard':
      if (opp.beatT >= opp.beatDur) {
        if (Math.random() < opp.openChance) enterBeat('opening', rand(0.7, 1.0));
        else {
          opp.atkType = Math.random() < opp.kickChance ? 'kick' : 'punch';
          enterBeat('telegraph', opp.telegraph);
        }
      }
      break;
    case 'opening':
      if (opp.beatT >= opp.beatDur) enterBeat('guard', rand(opp.atkMin, opp.atkMax));
      break;
    case 'telegraph':
      if (opp.beatT >= opp.beatDur) {
        const countered = resolveOpponentAttack();
        if (!countered) enterBeat('strike', 0.18); // かわされた場合はresolveOpponentAttack側で既にopeningへ遷移済み
      }
      break;
    case 'strike':
      if (opp.beatT >= opp.beatDur) enterBeat('recover', rand(0.3, 0.5));
      break;
    case 'recover':
      if (opp.beatT >= opp.beatDur) enterBeat('guard', rand(opp.atkMin, opp.atkMax));
      break;
  }
}

function resolveOpponentAttack() {
  const type = opp.atkType;
  const baseDmg = (type === 'kick' ? KICK_BASE_DMG : PUNCH_BASE_DMG) * opp.dmgMul;
  let dmg = baseDmg;
  let result = 'hit';
  let countered = false;
  if (player.dodgeT > 0) {
    dmg = 0; result = 'dodge'; countered = true;
    enterBeat('opening', COUNTER_OPEN_DUR);
  } else if (type === 'punch' && player.guarding) {
    dmg = baseDmg * 0.12; result = 'guard';
  } else if (type === 'kick' && player.guarding) {
    dmg = baseDmg * 0.55; result = 'guard-partial';
  }
  dmg = Math.round(dmg);
  if (dmg > 0) {
    player.hp = Math.max(0, player.hp - dmg);
    player.hitFlash = 0.28;
    shake(dmg * 0.5);
    hitSpark(playerX(), fighterY() - 60);
    seHit();
  }
  if (result === 'dodge') { toast('パーフェクトかわし!'); seDodge(); }
  else if (result === 'guard') { toast('ガード成功'); seGuard(); }
  else if (result === 'guard-partial') { toast('ガードで軽減'); seGuard(); }
  updateHud();
  if (player.hp <= 0) onPlayerDown();
  return countered;
}

function playerAttack(type) {
  if (state !== STATE.FIGHT || !opp || opp.introT > 0) return;
  const isOpen = opp.beat === 'opening';
  let dmg;
  if (type === 'punch') {
    dmg = isOpen ? PUNCH_DMG_CRIT : PUNCH_DMG_CHIP;
    player.punchAnim = 0.15;
    sePunch();
  } else {
    dmg = isOpen ? KICK_DMG_CRIT : KICK_DMG_CHIP;
    player.kickAnim = 0.32;
    seKick();
  }
  opp.hp = Math.max(0, opp.hp - dmg);
  opp.hitFlash = 0.2;
  hitSpark(oppX(), fighterY() - 60);
  if (isOpen) {
    shake(6);
    seCrit();
    toast(type === 'kick' ? '会心のキック!!' : '会心の一撃!!');
    if (opp.beat === 'opening') enterBeat('recover', 0.5); // 隙を突いたら反撃タイムを短縮させない
  }
  updateHud();
  if (opp.hp <= 0) onOpponentKO();
}

function doPunch() { playerAttack('punch'); }
function doKick() { playerAttack('kick'); }
function doDodge(dir) {
  if (state !== STATE.FIGHT) return;
  player.dodgeT = DODGE_WINDOW;
  player.dodgeDir = dir;
}

function onOpponentKO() {
  koCount++;
  if (koCount > best) { best = koCount; try { localStorage.setItem('kick_best', String(best)); } catch (e) {} }
  toast(`${opp.name} KO!! 🥊`);
  seKO();
  shake(10);
  player.hp = Math.min(PLAYER_MAX_HP, player.hp + HEAL_ON_WIN);
  rungIdx++;
  let loopedUp = false;
  if (rungIdx >= ROSTER.length) { rungIdx = 0; loopCount++; loopedUp = true; }
  state = STATE.KO_BEAT;
  opp = null;
  updateHud();
  setTimeout(() => {
    if (loopedUp) toast(`🏆 全員撃破!${loopCount + 1}周目へ…`);
    spawnOpponent();
    state = STATE.FIGHT;
  }, loopedUp ? 1500 : 900);
}

function onPlayerDown() {
  state = STATE.OVER;
  seOver();
  setTimeout(() => {
    overHeadEl.textContent = 'リングに沈んだ…';
    overKoEl.textContent = String(koCount);
    overBestEl.textContent = best > 0 ? `${best} 体` : '—';
    rankTitleEl.textContent = titleOf(koCount);
    overCommentEl.textContent = commentOf(koCount);
    top10Badge.classList.add('hidden');
    overOverlay.classList.remove('hidden');
    updateHud();
    autoSubmitScore(koCount);
  }, 900);
}

function updateHud() {
  koEl.textContent = `${koCount} 体撃破`;
  if (opp) {
    const loopPrefix = loopCount >= 1 ? `${loopCount + 1}周目 ` : '';
    foeEl.textContent = `${loopPrefix}第${totalBeaten() + 1}戦 ${opp.emoji}${opp.name}`;
  } else {
    foeEl.textContent = '🥊';
  }
  bestEl.textContent = best > 0 ? `${best} 体` : '—';
}

// ===== 座標 =====
const playerX = () => W * 0.28;
const oppX = () => W * 0.72;
const fighterY = () => H * 0.62;

// ===== パーティクル =====
function hitSpark(x, y) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 120;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30,
      life: 0.35 + Math.random() * 0.25,
      emoji: Math.random() < 0.4 ? '💥' : null,
    });
  }
}
function shake(mag) { shakeT = 0.22; shakeMag = Math.max(shakeMag, mag); }

// ===== 更新ループ =====
let lastT = 0;
let ptr = null;   // { id, x0, y0, t, guarding, swiped }
let keyGuard = false;

function updateInput(dt) {
  if (ptr && !ptr.swiped) {
    ptr.t += dt;
    if (!ptr.guarding && ptr.t >= HOLD_MIN_TIME) ptr.guarding = true;
  }
  const wasGuarding = player.guarding;
  player.guarding = !!(ptr && ptr.guarding) || keyGuard;
  if (player.guarding && !wasGuarding) seGuard();
}

function update(dt) {
  updateInput(dt);
  player.punchAnim = Math.max(0, player.punchAnim - dt);
  player.kickAnim = Math.max(0, player.kickAnim - dt);
  player.hitFlash = Math.max(0, player.hitFlash - dt);
  player.dodgeT = Math.max(0, player.dodgeT - dt);
  shakeT = Math.max(0, shakeT - dt);
  if (shakeT <= 0) shakeMag = 0;

  if (state === STATE.FIGHT) updateOpponent(dt);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 260 * dt;
  }
}

// ===== 描画 =====
function drawRing() {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1c0f11');
  g.addColorStop(0.55, '#150a0b');
  g.addColorStop(1, '#0c0506');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  // スポットライト
  const rg = ctx.createRadialGradient(W / 2, H * 0.45, 20, W / 2, H * 0.45, W * 0.7);
  rg.addColorStop(0, 'rgba(255, 220, 160, 0.10)');
  rg.addColorStop(1, 'rgba(255, 220, 160, 0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 0, W, H);

  // リングの床
  const floorY = fighterY() + 46;
  ctx.fillStyle = 'rgba(225, 58, 58, 0.10)';
  ctx.beginPath();
  ctx.ellipse(W / 2, floorY, W * 0.62, 46, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(242, 193, 78, 0.35)';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.ellipse(W / 2, floorY, W * 0.62, 46, 0, 0, Math.PI * 2);
  ctx.stroke();

  // ロープ
  ctx.strokeStyle = 'rgba(242, 193, 78, 0.18)';
  ctx.lineWidth = 2;
  for (const fy of [H * 0.12, H * 0.18, H * 0.24]) {
    ctx.beginPath();
    ctx.moveTo(0, fy);
    ctx.lineTo(W, fy - 6);
    ctx.stroke();
  }
}

function drawHpBar(x, w, hp, maxHp, alignRight, flash) {
  const y = H * 0.08;
  const h = 16;
  const left = alignRight ? x - w : x;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  roundRect(left, y, w, h, 8); ctx.fill();
  const ratio = clamp(hp / maxHp, 0, 1);
  const fillW = w * ratio;
  const fillX = alignRight ? left + (w - fillW) : left;
  const barColor = flash > 0 ? '#fff' : (ratio > 0.5 ? '#5fd66c' : ratio > 0.25 ? '#f2c14e' : '#e13a3a');
  ctx.fillStyle = barColor;
  roundRect(alignRight ? left + (w - fillW) : left, y, fillW, h, 8); ctx.fill();
  ctx.strokeStyle = 'rgba(242, 193, 78, 0.6)';
  ctx.lineWidth = 2;
  roundRect(left, y, w, h, 8); ctx.stroke();
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawFighter(x, y, opts) {
  const { emoji, facing, bob, size, anim, hitFlash, guarding, dodgeOffset, glow } = opts;
  ctx.save();
  ctx.translate(x + (dodgeOffset || 0), y + bob);
  if (glow) {
    ctx.shadowColor = glow;
    ctx.shadowBlur = 34;
  }
  if (hitFlash > 0) {
    ctx.globalAlpha = 0.55 + 0.45 * Math.sin(hitFlash * 60);
  }
  ctx.font = `${size}px ${EMOJI_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.scale(facing, 1);
  let rot = 0;
  if (anim && anim.punch > 0) rot = facing * anim.punch * 0.4;
  if (anim && anim.kick > 0) rot = facing * anim.kick * 0.55;
  ctx.rotate(rot);
  ctx.fillText(emoji, 0, 0);
  ctx.restore();

  if (guarding) {
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.font = `${size * 0.5}px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('🛡️', x + (dodgeOffset || 0), y + bob + size * 0.12);
    ctx.restore();
  }
}

function drawTelegraph() {
  if (!opp || opp.introT > 0) return;
  const x = oppX(), y = fighterY() - 74;
  if (opp.beat === 'opening') {
    const p = clamp(opp.beatT / opp.beatDur, 0, 1);
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = '#5fd66c';
    ctx.font = `22px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('👀 隙あり!', x, y - 30 + Math.sin(opp.beatT * 10) * 3);
    ctx.strokeStyle = '#5fd66c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(x, fighterY(), 62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * (1 - p));
    ctx.stroke();
    ctx.restore();
  } else if (opp.beat === 'telegraph') {
    const p = clamp(opp.beatT / opp.beatDur, 0, 1);
    const color = opp.atkType === 'kick' ? '#e13a3a' : '#f2963c';
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = color;
    ctx.font = `bold 20px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText(opp.atkType === 'kick' ? '⚠️ キック!' : '⚠️ パンチ!', x, y - 30);
    ctx.strokeStyle = color;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.arc(x, fighterY(), 62, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p);
    ctx.stroke();
    ctx.restore();
  }
}

function draw(now) {
  const t = now / 1000;
  ctx.save();
  if (shakeT > 0) {
    ctx.translate((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag);
  }
  drawRing();

  if (state !== STATE.TITLE) {
    drawTelegraph();

    const pBob = Math.sin(t * 3) * 3;
    const dodgeOff = player.dodgeT > 0 ? player.dodgeDir * 26 * (player.dodgeT / DODGE_WINDOW) : 0;
    drawFighter(playerX(), fighterY(), {
      emoji: '🥋', facing: 1, bob: pBob, size: 88,
      anim: { punch: player.punchAnim, kick: player.kickAnim },
      hitFlash: player.hitFlash, guarding: player.guarding, dodgeOffset: dodgeOff,
      glow: player.dodgeT > 0 ? 'rgba(242, 193, 78, 0.8)' : null,
    });

    if (opp) {
      const introScale = opp.introT > 0 ? 1 - opp.introT / 0.9 : 1;
      ctx.save();
      ctx.globalAlpha = clamp(introScale * 1.4, 0, 1);
      const oBob = Math.sin(t * 3 + 1.5) * 3;
      let glow = null;
      if (opp.beat === 'opening') glow = 'rgba(95, 214, 108, 0.85)';
      else if (opp.beat === 'telegraph') glow = opp.atkType === 'kick' ? 'rgba(225, 58, 58, 0.85)' : 'rgba(242, 150, 60, 0.85)';
      drawFighter(oppX(), fighterY(), {
        emoji: opp.emoji, facing: -1, bob: oBob, size: 88,
        anim: null, hitFlash: opp.hitFlash, guarding: false, dodgeOffset: 0,
        glow,
      });
      ctx.restore();

      drawHpBar(oppX() + 70, Math.min(180, W * 0.36), opp.hp, opp.maxHp, true, opp.hitFlash);
      ctx.save();
      ctx.fillStyle = '#f5ece0';
      ctx.font = `bold 13px ${EMOJI_FONT}`;
      ctx.textAlign = 'right';
      ctx.fillText(`${opp.title} ${opp.name}`, oppX() + 70, H * 0.08 - 6);
      ctx.restore();
    }

    drawHpBar(playerX() - 70, Math.min(180, W * 0.36), player.hp, player.maxHp, false, player.hitFlash);
    ctx.save();
    ctx.fillStyle = '#f5ece0';
    ctx.font = `bold 13px ${EMOJI_FONT}`;
    ctx.textAlign = 'left';
    ctx.fillText('YOU', playerX() - 70, H * 0.08 - 6);
    ctx.restore();
  } else {
    // タイトル画面: 向き合う二人だけ静かに揺れてる
    const pBob = Math.sin(t * 2) * 4;
    drawFighter(playerX(), fighterY(), { emoji: '🥋', facing: 1, bob: pBob, size: 96, guarding: false });
    drawFighter(oppX(), fighterY(), { emoji: '🥊', facing: -1, bob: -pBob, size: 96, guarding: false });
  }

  ctx.globalAlpha = 1;
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / 0.35, 0, 1);
    if (p.emoji) {
      ctx.font = `18px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(p.emoji, p.x, p.y);
    } else {
      ctx.fillStyle = '#f2c14e';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0);
  lastT = now;
  if (state !== STATE.TITLE) update(dt);
  draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ===== 入力: ポインター (タップ/上スワイプ/長押し/左右スワイプ) =====
function ensureAudio() { audio(); }

canvas.addEventListener('pointerdown', (e) => {
  if (state !== STATE.FIGHT) return;
  ensureAudio();
  ptr = { id: e.pointerId, x0: e.clientX, y0: e.clientY, t: 0, guarding: false, swiped: false };
});
canvas.addEventListener('pointermove', (e) => {
  if (!ptr || e.pointerId !== ptr.id || ptr.swiped || ptr.guarding) return;
  const dx = e.clientX - ptr.x0, dy = e.clientY - ptr.y0;
  if (Math.abs(dx) < SWIPE_MIN_DIST && Math.abs(dy) < SWIPE_MIN_DIST) return;
  ptr.swiped = true;
  if (Math.abs(dy) >= Math.abs(dx)) {
    if (dy < 0) doKick();
  } else {
    doDodge(dx > 0 ? 1 : -1);
  }
});
function endPointer(e) {
  if (!ptr || e.pointerId !== ptr.id) return;
  if (!ptr.swiped && !ptr.guarding) doPunch();
  ptr = null;
}
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);

// ===== 入力: キーボード (開発/デスクトップ用の補助操作) =====
window.addEventListener('keydown', (e) => {
  if (state !== STATE.FIGHT) return;
  if (e.repeat) return;
  if (e.code === 'Space' || e.code === 'KeyJ') { e.preventDefault(); ensureAudio(); doPunch(); }
  else if (e.code === 'ArrowUp' || e.code === 'KeyK') { e.preventDefault(); ensureAudio(); doKick(); }
  else if (e.code === 'ArrowLeft' || e.code === 'KeyA') { e.preventDefault(); ensureAudio(); doDodge(-1); }
  else if (e.code === 'ArrowRight' || e.code === 'KeyD') { e.preventDefault(); ensureAudio(); doDodge(1); }
  else if (e.code === 'ArrowDown' || e.code === 'KeyL') { e.preventDefault(); ensureAudio(); keyGuard = true; }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'ArrowDown' || e.code === 'KeyL') keyGuard = false;
});

// ===== ゲーム進行 =====
function beginGame() {
  player.hp = PLAYER_MAX_HP;
  player.guarding = false; player.dodgeT = 0; player.dodgeDir = 0;
  player.punchAnim = 0; player.kickAnim = 0; player.hitFlash = 0;
  rungIdx = 0; loopCount = 0; koCount = 0;
  particles = [];
  ptr = null; keyGuard = false;
  fetchRivals();
  spawnOpponent();
  state = STATE.FIGHT;
  startOverlay.classList.add('hidden');
  overOverlay.classList.add('hidden');
  hud.classList.remove('hidden');
  updateHud();
}

startOverlay.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, input, a')) return;
  saveName();
  ensureAudio();
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
try { savedName = localStorage.getItem('kick_name') || ''; } catch (e) {}
nameInput.value = savedName;
nameInput.addEventListener('pointerdown', (e) => e.stopPropagation());

function saveName() {
  const name = nameInput.value.trim().slice(0, 10);
  savedName = name;
  if (name) { try { localStorage.setItem('kick_name', name); } catch (e) {} }
}

async function fetchRivals() {
  try {
    const r = await fetch(`${API}?game=kick`);
    if (!r.ok) return;
    const data = await r.json();
    rivals = (data.top || []).filter((e) => e.score > 0 && e.name !== savedName);
  } catch (e) {}
}
fetchRivals();

async function autoSubmitScore(score) {
  if (score < 1 || !savedName) return;
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'kick', name: savedName, score }),
    });
    if (!r.ok) return;
    const data = await r.json();
    const topList = data.top || [];
    const idx = topList.findIndex((e) => e.name === savedName);
    if (idx >= 0) {
      top10Badge.textContent = idx === 0 ? '👑 いま世界チャンピオン!' : `🌏 世界${idx + 1}位にランクイン!`;
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
    li.textContent = `${medal} ${entry.name} — ${entry.score} 体撃破`;
    if (entry.name === highlightName) li.classList.add('me');
    rankListEl.appendChild(li);
  });
}

async function openRanking(highlightName) {
  rankOverlay.classList.remove('hidden');
  rankListEl.innerHTML = '<li class="rank-loading">よみこみちゅう…</li>';
  try {
    const r = await fetch(`${API}?game=kick`);
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

updateHud();

// テスト自動化用の覗き穴 (ゲームには影響しない)
window.__kickDebug = () => ({
  state, koCount, loopCount, rungIdx,
  playerHp: player.hp,
  oppHp: opp ? opp.hp : null,
  oppBeat: opp ? opp.beat : null,
  guarding: player.guarding,
  dodging: player.dodgeT > 0,
});
