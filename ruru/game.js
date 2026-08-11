// るる vs チャム: たまごっち風のお世話でヨークシャテリアのるるを育て、
// フレンチブルドッグのライバル・チャムにポケモン風のコマンドバトルで挑む
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

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rand = (a, b) => a + Math.random() * (b - a);

// ===== 定数 =====
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", serif';
const STAGE_THRESHOLDS = [0, 25, 70, 150];
const STAGE_NAMES = ['こいぬ', 'わんぱく', 'げんき', 'パートナー'];
const MAX_ELAPSED_HOURS = 72;
const DECAY_RATE = { hunger: 4, happiness: 3, clean: 2, energy: 3 };
const METER_FLOOR = 15;
const SLEEP_ENERGY_REGEN = 6;

const MOVES = [
  { id: 'hamu', name: 'はむはむ', unlock: 0, power: 0.9, stat: 'atk', acc: 0.95, kind: 'atk' },
  { id: 'shippo', name: 'しっぽブンブン', unlock: 1, power: 1.3, stat: 'atk', acc: 0.85, kind: 'atk', debuff: 0.15 },
  { id: 'dash', name: 'とっとこダッシュ', unlock: 2, power: 1.6, stat: 'spd', acc: 0.80, kind: 'atk', crit: 0.25 },
  { id: 'daisuki', name: 'だいすきパワー', unlock: 3, needAffection: 200, power: 2.2, stat: 'atk', acc: 0.75, kind: 'atk' },
];
const GUARD_MOVE = { id: 'guard', name: 'まもる', kind: 'guard', reduce: 0.6 };
const CHAM_MOVES = [
  { name: 'がぶっと', power: 1.0, stat: 'atk', acc: 0.9, kind: 'atk' },
  { name: 'たいあたり', power: 1.4, stat: 'atk', acc: 0.8, kind: 'atk' },
  { name: 'いかくガード', kind: 'guard', reduce: 0.5 },
];

const CHAM_FORMS = [
  { name: '部屋着チャム', hp: 50, atk: 7, def: 5, spd: 4, accessory: 'chamAcc0' },
  { name: 'おさんぽチャム', hp: 62, atk: 9, def: 6, spd: 6, accessory: 'chamAcc1' },
  { name: 'ジャージチャム', hp: 76, atk: 11, def: 7, spd: 8, accessory: 'chamAcc2' },
  { name: 'バトルモードチャム', hp: 92, atk: 14, def: 9, spd: 10, accessory: 'chamAcc3' },
  { name: 'でんせつチャム', hp: 112, atk: 17, def: 11, spd: 13, accessory: 'chamAcc4' },
];

const RUN_TITLES = [
  [0, 'みならいこいぬ'], [3, 'げんきなこいぬ'], [6, 'たのもしい相棒'], [10, 'チャムのライバル'],
  [15, 'ご近所いちの人気者'], [20, '伝説のもふもふ犬'],
];
function runTitleOf(n) {
  let t = RUN_TITLES[0][1];
  for (const [th, name] of RUN_TITLES) { if (n >= th) t = name; }
  return t;
}
function runCommentOf(n) {
  if (n < 3) return 'まだまだこれから。お世話をしっかりしてから挑もう';
  if (n < 6) return 'いいバトルだった。るるも自信がついてきたね';
  if (n < 10) return 'チャムも本気になってきた。だけどるるも負けてない!';
  if (n < 15) return 'ご近所で評判の名コンビ。息もぴったり';
  return 'るるとチャムの伝説は、まだまだ続く…';
}

const diffMul = () => Math.min(1 + loopCount * 0.18, 2.4);
const stageOf = (exp) => {
  let s = 0;
  for (let i = 0; i < STAGE_THRESHOLDS.length; i++) { if (exp >= STAGE_THRESHOLDS[i]) s = i; }
  return s;
};
function availableMoves(save) {
  return MOVES.filter((m) => save.stage >= m.unlock && (!m.needAffection || save.affection >= m.needAffection));
}
function battleStatsOf(save) {
  const bond = Math.min(5, Math.floor(save.affection / 100));
  return {
    maxHp: 40 + save.stage * 20 + Math.round((save.energy / 100) * 20) + bond,
    atk: 6 + save.stage * 3 + Math.round((save.hunger / 100) * 4) + bond,
    def: 4 + save.stage * 2 + Math.round((save.clean / 100) * 3) + bond,
    spd: 3 + save.stage * 1.5 + Math.round((save.happiness / 100) * 3) + bond,
  };
}
function battleReady(save) {
  return save.stage >= 1 && save.hunger >= 40 && save.happiness >= 40 && save.clean >= 40 && save.energy >= 40;
}

// ===== セーブ/減衰 =====
function defaultSave() {
  const now = Date.now();
  return {
    v: 1, hunger: 80, happiness: 80, clean: 80, energy: 80,
    affection: 0, exp: 0, stage: 0, sleeping: false,
    bornAt: now, lastSeenAt: now,
    totalWins: 0, totalBattles: 0, bestRunWins: 0,
  };
}
function loadSave() {
  try {
    const raw = localStorage.getItem('ruru_save');
    if (!raw) return defaultSave();
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || s.v !== 1) return defaultSave();
    return { ...defaultSave(), ...s };
  } catch (e) { return defaultSave(); }
}
function saveGame() {
  try { localStorage.setItem('ruru_save', JSON.stringify(save)); } catch (e) {}
}
function applyDecay(s) {
  const hours = clamp((Date.now() - s.lastSeenAt) / 3600000, 0, MAX_ELAPSED_HOURS);
  const mul = s.sleeping ? 0.5 : 1;
  s.hunger = Math.max(METER_FLOOR, s.hunger - DECAY_RATE.hunger * hours * mul);
  s.happiness = Math.max(METER_FLOOR, s.happiness - DECAY_RATE.happiness * hours * mul);
  s.clean = Math.max(METER_FLOOR, s.clean - DECAY_RATE.clean * hours * mul);
  if (s.sleeping) s.energy = Math.min(100, s.energy + SLEEP_ENERGY_REGEN * hours);
  else s.energy = Math.max(METER_FLOOR, s.energy - DECAY_RATE.energy * hours);
  s.lastSeenAt = Date.now();
  s.stage = stageOf(s.exp);
  return s;
}

let save = applyDecay(loadSave());

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
const seFeed = () => tone(520, 0.09, 'square', 0.1, 0, 80);
const sePlay = () => { tone(660, 0.08, 'triangle', 0.1); tone(880, 0.09, 'triangle', 0.09, 0.07); };
const seWalk = () => tone(420, 0.1, 'sine', 0.09, 0, 60);
const sePet = () => tone(900, 0.07, 'sine', 0.07, 0, 120);
const seSleep = () => tone(300, 0.3, 'sine', 0.06, 0, -80);
const seWake = () => { tone(600, 0.1, 'triangle', 0.09); tone(760, 0.1, 'triangle', 0.08, 0.09); };
const seLevelUp = () => { tone(523.3, 0.14, 'triangle', 0.11); tone(659.3, 0.14, 'triangle', 0.11, 0.12); tone(784, 0.2, 'triangle', 0.12, 0.24); };
const seHit = () => tone(150, 0.11, 'sawtooth', 0.11, 0, -80);
const seMiss = () => tone(320, 0.08, 'sine', 0.06, 0, -40);
const seCrit = () => { tone(700, 0.08, 'triangle', 0.11); tone(1000, 0.1, 'triangle', 0.1, 0.06); };
const seGuard = () => tone(500, 0.08, 'square', 0.08, 0);
const seKO = () => { tone(523.3, 0.16, 'triangle', 0.12); tone(659.3, 0.16, 'triangle', 0.12, 0.14); tone(880, 0.3, 'triangle', 0.13, 0.28); };
const seOver = () => { tone(300, 0.3, 'sawtooth', 0.1); tone(220, 0.5, 'sawtooth', 0.1, 0.22); };

// ===== アセットのプリロード =====
const ASSET_FILES = {
  ruru0: 'assets/ruru-stage0.svg', ruru1: 'assets/ruru-stage1.svg',
  ruru2: 'assets/ruru-stage2.svg', ruru3: 'assets/ruru-stage3.svg',
  ruruSleep: 'assets/ruru-sleep.svg',
  ribbonRed: 'assets/ribbon-red.svg', ribbonPink: 'assets/ribbon-pink.svg',
  ribbonBlue: 'assets/ribbon-blue.svg', ribbonGold: 'assets/ribbon-gold.svg',
  chamBase: 'assets/cham-base.svg',
  chamAcc0: 'assets/cham-accessory-0.svg', chamAcc1: 'assets/cham-accessory-1.svg',
  chamAcc2: 'assets/cham-accessory-2.svg', chamAcc3: 'assets/cham-accessory-3.svg',
  chamAcc4: 'assets/cham-accessory-4.svg', chamAura4: 'assets/cham-accessory-4-aura.svg',
};
const images = {};
function loadImage(key, src) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => { images[key] = img; resolve(); };
    img.onerror = () => resolve();
    img.src = src;
  });
}
const assetsReady = Promise.all(Object.entries(ASSET_FILES).map(([k, v]) => loadImage(k, v)));

function ruruImageKey(s) {
  if (s.sleeping) return 'ruruSleep';
  return `ruru${clamp(s.stage, 0, 3)}`;
}
function ribbonImageKey(s) {
  if (s.affection >= 600) return 'ribbonGold';
  if (s.affection >= 300) return 'ribbonBlue';
  if (s.affection >= 100) return 'ribbonPink';
  return 'ribbonRed';
}

// ===== DOM =====
const hud = document.getElementById('hud');
const hudHome = document.getElementById('hud-home');
const hudBattle = document.getElementById('hud-battle');
const homeActions = document.getElementById('home-actions');
const battleMenu = document.getElementById('battle-menu');
const battleLog = document.getElementById('battle-log');
const toastEl = document.getElementById('toast');
const startOverlay = document.getElementById('start-overlay');
const overOverlay = document.getElementById('over-overlay');
const rankOverlay = document.getElementById('rank-overlay');
const nameInput = document.getElementById('name-input');
const stageBadge = document.getElementById('stage-badge');
const affectionEl = document.getElementById('affection');
const winsLifetimeEl = document.getElementById('wins-lifetime');
const meterEls = { hunger: document.getElementById('m-hunger'), happy: document.getElementById('m-happy'), clean: document.getElementById('m-clean'), energy: document.getElementById('m-energy') };
const hpRuruEl = document.getElementById('hp-ruru');
const hpChamEl = document.getElementById('hp-cham');
const chamNameEl = document.getElementById('cham-name');
const goBattleBtn = document.getElementById('go-battle');
const battleBtnLabel = document.getElementById('battle-btn-label');
const sleepBtn = document.getElementById('act-sleep');
const sleepLabel = document.getElementById('sleep-label');
const moveBtns = [0, 1, 2, 3].map((i) => document.getElementById(`move-${i}`));
const guardBtn = document.getElementById('move-guard');
const retreatBtn = document.getElementById('retreat');
const overHeadEl = document.getElementById('over-head');
const overWinsEl = document.getElementById('over-wins');
const overBestEl = document.getElementById('over-best');
const overCommentEl = document.getElementById('over-comment');
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
const STATE = { TITLE: 0, HOME: 1, BATTLE: 2, RESULT: 3 };
let state = STATE.TITLE;
let particles = [];
let shakeT = 0, shakeMag = 0;
let animT = 0;

let loopCount = 0;
let formIdx = 0;
let runWins = 0;
let battle = null; // { player:{...stats,hp}, cham:{...stats,hp,name,formIdx}, playerTurn, resolving }

// ===== HOME: お世話ロジック =====
function updateMeterHUD() {
  stageBadge.textContent = STAGE_NAMES[save.stage];
  affectionEl.textContent = `💗 ${save.affection}`;
  winsLifetimeEl.textContent = `累計 ${save.totalWins}勝`;
  meterEls.hunger.style.width = `${save.hunger}%`;
  meterEls.happy.style.width = `${save.happiness}%`;
  meterEls.clean.style.width = `${save.clean}%`;
  meterEls.energy.style.width = `${save.energy}%`;

  const ready = battleReady(save);
  goBattleBtn.disabled = !ready;
  battleBtnLabel.textContent = ready ? 'チャムに挑戦' : (save.stage < 1 ? 'もっと育てよう' : 'お世話が足りない');

  sleepBtn.classList.toggle('sleeping', save.sleeping);
  sleepLabel.textContent = save.sleeping ? 'おこす' : 'ねかせる';
  for (const btn of [document.getElementById('act-food'), document.getElementById('act-play'), document.getElementById('act-walk'), document.getElementById('act-pet')]) {
    btn.disabled = save.sleeping;
    btn.style.opacity = save.sleeping ? '0.45' : '1';
  }
}

function maybeLevelUp() {
  const newStage = stageOf(save.exp);
  if (newStage > save.stage) {
    save.stage = newStage;
    toast(`るるが せいちょうした!「${STAGE_NAMES[newStage]}」`);
    seLevelUp();
  }
}

function gainExp(before, after, intendedDelta, baseExp) {
  if (intendedDelta <= 0) return 0;
  const ratio = clamp((after - before) / intendedDelta, 0, 1);
  return Math.round(baseExp * ratio);
}

function careAction(type) {
  if (state !== STATE.HOME || save.sleeping) return;
  let before, gained = 0;
  if (type === 'food') {
    before = save.hunger; save.hunger = clamp(save.hunger + 30, 0, 100);
    gained = gainExp(before, save.hunger, 30, 3);
    toast('もぐもぐ、おいしい!🍖'); seFeed();
  } else if (type === 'play') {
    before = save.happiness; save.happiness = clamp(save.happiness + 25, 0, 100);
    save.energy = clamp(save.energy - 5, 0, 100);
    save.clean = clamp(save.clean - 3, 0, 100);
    gained = gainExp(before, save.happiness, 25, 4);
    toast('わーい、たのしい!🎾'); sePlay();
  } else if (type === 'walk') {
    before = save.happiness; save.happiness = clamp(save.happiness + 15, 0, 100);
    save.hunger = clamp(save.hunger - 3, 0, 100);
    save.clean = clamp(save.clean - 5, 0, 100);
    gained = gainExp(before, save.happiness, 15, 5);
    toast('おさんぽ きもちいいね🚶'); seWalk();
  } else if (type === 'pet') {
    save.affection += 2;
    save.happiness = clamp(save.happiness + 3, 0, 100);
    gained = 1;
    toast('なでなで…♡'); sePet();
  }
  save.exp += gained;
  maybeLevelUp();
  saveGame();
  updateMeterHUD();
}

function toggleSleep() {
  if (state !== STATE.HOME) return;
  save.sleeping = !save.sleeping;
  if (save.sleeping) { toast('おやすみ、るる… 💤'); seSleep(); }
  else { save.exp += 3; maybeLevelUp(); toast('おはよう!'); seWake(); }
  saveGame();
  updateMeterHUD();
}

function enterHome() {
  state = STATE.HOME;
  startOverlay.classList.add('hidden');
  overOverlay.classList.add('hidden');
  hud.classList.remove('hidden');
  hudHome.classList.remove('hidden');
  hudBattle.classList.add('hidden');
  homeActions.classList.remove('hidden');
  battleMenu.classList.add('hidden');
  updateMeterHUD();
}

// ===== BATTLE: ターン制コマンドバトル =====
function logMsg(msg) { battleLog.textContent = msg; }

function setMovesEnabled(enabled) {
  for (const b of moveBtns) b.disabled = !enabled;
  guardBtn.disabled = !enabled;
}

function refreshBattleHud() {
  hpRuruEl.style.width = `${clamp((battle.player.hp / battle.player.maxHp) * 100, 0, 100)}%`;
  hpChamEl.style.width = `${clamp((battle.cham.hp / battle.cham.maxHp) * 100, 0, 100)}%`;
  chamNameEl.textContent = battle.cham.name;
}

function renderMoveButtons() {
  const moves = battle.player.moves;
  moveBtns.forEach((btn, i) => {
    if (i < moves.length) {
      btn.classList.remove('hidden');
      btn.textContent = moves[i].name;
    } else {
      btn.classList.add('hidden');
    }
  });
}

function spawnCham() {
  const base = CHAM_FORMS[formIdx];
  const dm = diffMul();
  battle.cham = {
    name: base.name, formIdx,
    maxHp: Math.round(base.hp * dm), hp: Math.round(base.hp * dm),
    atk: Math.round(base.atk * dm), def: Math.round(base.def * dm), spd: Math.round(base.spd * dm),
    guardActive: false, atkDebuff: 0, lastPlayerDmgRatio: 0, hitFlash: 0,
  };
}

function enterBattle() {
  const stats = battleStatsOf(save);
  battle = {
    player: { ...stats, hp: stats.maxHp, moves: availableMoves(save), guardActive: false, atkDebuff: 0, hitFlash: 0 },
    cham: null,
    resolving: false,
  };
  spawnCham();
  state = STATE.BATTLE;
  hudHome.classList.add('hidden');
  hudBattle.classList.remove('hidden');
  homeActions.classList.add('hidden');
  battleMenu.classList.remove('hidden');
  retreatBtn.classList.add('hidden');
  renderMoveButtons();
  refreshBattleHud();
  setMovesEnabled(true);
  logMsg(`${battle.cham.name}があらわれた!`);
}

function damageOf(attacker, defender, move) {
  if (Math.random() > move.acc) return { dmg: 0, miss: true, crit: false };
  const statVal = attacker[move.stat] * (attacker.atkDebuff > 0 ? 0.8 : 1);
  const crit = move.crit ? Math.random() < move.crit : false;
  let dmg = Math.round(move.power * statVal * rand(0.9, 1.1) * (crit ? 1.5 : 1)) - Math.round(defender.def * 0.5);
  dmg = Math.max(1, dmg);
  if (defender.guardActive) dmg = Math.round(dmg * (1 - (defender.guardReduce != null ? defender.guardReduce : 0.6)));
  return { dmg, miss: false, crit };
}

function chamChooseMove() {
  const hpRatio = battle.cham.hp / battle.cham.maxHp;
  if (hpRatio < 0.3 && Math.random() < 0.5) return CHAM_MOVES[1];
  let weights = [0.55, 0.30, 0.15];
  if (battle.cham.lastPlayerDmgRatio > 0.25) weights = [0.35, 0.25, 0.40];
  const r = Math.random();
  if (r < weights[0]) return CHAM_MOVES[0];
  if (r < weights[0] + weights[1]) return CHAM_MOVES[1];
  return CHAM_MOVES[2];
}

function applyMoveEffects(move, defender) {
  if (move.debuff && Math.random() < move.debuff) defender.atkDebuff = 2;
}

function resolveHit(actorName, attacker, defender, move, hpEl) {
  if (move.kind === 'guard') {
    attacker.guardActive = true;
    attacker.guardReduce = move.reduce;
    logMsg(`${actorName}は みをまもっている!`);
    seGuard();
    return null;
  }
  const { dmg, miss, crit } = damageOf(attacker, defender, move);
  if (miss) {
    logMsg(`${actorName}の${move.name}! …ミス!`);
    seMiss();
    return null;
  }
  defender.hp = Math.max(0, defender.hp - dmg);
  defender.hitFlash = 0.25;
  hpEl.style.width = `${clamp((defender.hp / defender.maxHp) * 100, 0, 100)}%`;
  logMsg(`${actorName}の${move.name}! ${dmg}のダメージ${crit ? '! 会心の一撃!!' : '!'}`);
  if (crit) seCrit(); else seHit();
  shake(crit ? 8 : 4);
  applyMoveEffects(move, defender);
  return dmg;
}

function endOfRoundCleanup() {
  battle.player.guardActive = false;
  battle.cham.guardActive = false;
  if (battle.player.atkDebuff > 0) battle.player.atkDebuff--;
  if (battle.cham.atkDebuff > 0) battle.cham.atkDebuff--;
}

function chooseMove(move) {
  if (!battle || state !== STATE.BATTLE || battle.resolving) return;
  battle.resolving = true;
  setMovesEnabled(false);
  const chamMove = chamChooseMove();
  battle.player.guardActive = move.kind === 'guard';
  battle.cham.guardActive = chamMove.kind === 'guard';

  const playerFirst = battle.player.spd * (move.stat === 'spd' ? 1.15 : 1) >= battle.cham.spd * (chamMove.stat === 'spd' ? 1.15 : 1);
  const order = playerFirst
    ? [['るる', battle.player, battle.cham, move, hpChamEl], [battle.cham.name, battle.cham, battle.player, chamMove, hpRuruEl]]
    : [[battle.cham.name, battle.cham, battle.player, chamMove, hpRuruEl], ['るる', battle.player, battle.cham, move, hpChamEl]];

  let step = 0;
  function next() {
    if (step >= order.length || battle.player.hp <= 0 || battle.cham.hp <= 0) {
      finishRound();
      return;
    }
    const [name, attacker, defender, mv, hpEl] = order[step];
    step++;
    const dmg = resolveHit(name, attacker, defender, mv, hpEl);
    if (defender === battle.cham && dmg) battle.cham.lastPlayerDmgRatio = dmg / battle.cham.maxHp;
    setTimeout(next, 700);
  }
  setTimeout(next, 200);
}

function finishRound() {
  if (battle.cham.hp <= 0) { onChamKO(); return; }
  if (battle.player.hp <= 0) { onRuruKO(); return; }
  endOfRoundCleanup();
  refreshBattleHud();
  battle.resolving = false;
  setMovesEnabled(true);
  logMsg('つぎの わざをえらんでね');
}

function onChamKO() {
  runWins++;
  save.totalWins++;
  save.totalBattles++;
  save.exp += 10;
  maybeLevelUp();
  saveGame();
  toast(`${battle.cham.name}をたおした!🐾`);
  seKO();
  shake(10);
  battle.player.hp = Math.min(battle.player.maxHp, battle.player.hp + Math.round(battle.player.maxHp * 0.3));
  logMsg(`${battle.cham.name}をたおした!`);
  setMovesEnabled(false);
  retreatBtn.classList.remove('hidden');
  let retreated = false;
  retreatBtn.onclick = (e) => {
    e.stopPropagation();
    retreated = true;
    goToResult(true);
  };
  setTimeout(() => {
    if (retreated) return;
    if (formIdx + 1 >= CHAM_FORMS.length) { formIdx = 0; loopCount++; toast('🏆 全形態撃破!つぎの周回へ…'); }
    else formIdx++;
    spawnCham();
    refreshBattleHud();
    renderMoveButtons();
    retreatBtn.classList.add('hidden');
    battle.resolving = false;
    setMovesEnabled(true);
    logMsg(`${battle.cham.name}があらわれた!`);
  }, 1600);
}

function onRuruKO() {
  save.totalBattles++;
  save.exp += 2;
  maybeLevelUp();
  saveGame();
  seOver();
  logMsg('るるは たおれてしまった…');
  setTimeout(() => goToResult(false), 900);
}

function goToResult(won) {
  save.bestRunWins = Math.max(save.bestRunWins, runWins);
  saveGame();
  state = STATE.RESULT;
  hud.classList.add('hidden');
  battleMenu.classList.add('hidden');
  homeActions.classList.add('hidden');
  overHeadEl.textContent = won ? 'ひとやすみ' : 'チャムに挑戦';
  overWinsEl.textContent = String(runWins);
  overBestEl.textContent = save.bestRunWins > 0 ? `${save.bestRunWins}` : '—';
  rankTitleEl.textContent = runTitleOf(runWins);
  overCommentEl.textContent = runCommentOf(runWins);
  top10Badge.classList.add('hidden');
  overOverlay.classList.remove('hidden');
  autoSubmitScore(save.bestRunWins);
}

// ===== パーティクル・演出 =====
function hitSpark(x, y) {
  for (let i = 0; i < 6; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 50 + Math.random() * 90;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 20, life: 0.3 + Math.random() * 0.2, emoji: null });
  }
}
function shake(mag) { shakeT = 0.2; shakeMag = Math.max(shakeMag, mag); }

// ===== 描画 =====
function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function drawBackdrop(topColor, botColor) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, topColor);
  g.addColorStop(1, botColor);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawSprite(img, x, y, size, facing, hitFlash) {
  if (!img) return;
  ctx.save();
  ctx.translate(x, y);
  if (hitFlash > 0) ctx.globalAlpha = 0.55 + 0.45 * Math.sin(hitFlash * 60);
  ctx.scale(facing, 1);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawHomeScene(t) {
  drawBackdrop('#fff8ef', '#f6e4cd');
  ctx.save();
  ctx.fillStyle = 'rgba(217, 88, 124, 0.10)';
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.72, W * 0.5, 42, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const bob = save.sleeping ? Math.sin(t * 1.2) * 2 : Math.sin(t * 2.4) * 5;
  const size = Math.min(W, H) * (0.34 + save.stage * 0.03);
  const cx = W / 2, cy = H * (save.sleeping ? 0.62 : 0.58);
  const img = images[ruruImageKey(save)];
  drawSprite(img, cx, cy + bob, size, 1, 0);
  if (!save.sleeping) {
    const ribbon = images[ribbonImageKey(save)];
    drawSprite(ribbon, cx, cy + bob, size, 1, 0);
  }
  if (save.sleeping) {
    ctx.save();
    ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 2);
    ctx.font = `24px ${EMOJI_FONT}`;
    ctx.fillStyle = '#6b7fa3';
    ctx.textAlign = 'center';
    ctx.fillText('💤', cx + size * 0.32, cy + bob - size * 0.34);
    ctx.restore();
  }
}

function drawBattleScene(t) {
  drawBackdrop('#fdf1de', '#f3d9b8');
  const floorY = H * 0.66;
  ctx.save();
  ctx.fillStyle = 'rgba(90, 70, 54, 0.08)';
  ctx.beginPath();
  ctx.ellipse(W / 2, floorY, W * 0.6, 40, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (!battle) return;
  const pBob = Math.sin(t * 3) * 4;
  const cBob = Math.sin(t * 3 + 1.4) * 4;
  const size = Math.min(W, H) * 0.36;
  const px = W * 0.26, cxp = W * 0.74, cy = H * 0.5;

  drawSprite(images[ruruImageKey(save)], px, cy + pBob, size, 1, battle.player.hitFlash || 0);
  if (!save.sleeping) drawSprite(images[ribbonImageKey(save)], px, cy + pBob, size, 1, 0);

  if (battle.cham.formIdx === 4) {
    ctx.save();
    ctx.globalAlpha = 0.8 + 0.2 * Math.sin(t * 2);
    drawSprite(images.chamAura4, cxp, cy + cBob, size * 1.5, -1, 0);
    ctx.restore();
  }
  drawSprite(images.chamBase, cxp, cy + cBob, size, -1, battle.cham.hitFlash || 0);
  const accKey = CHAM_FORMS[battle.cham.formIdx].accessory;
  drawSprite(images[accKey], cxp, cy + cBob, size, -1, 0);
}

function draw(now) {
  const t = now / 1000;
  ctx.save();
  if (shakeT > 0) ctx.translate((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag);

  if (state === STATE.BATTLE) drawBattleScene(t);
  else drawHomeScene(t);

  ctx.globalAlpha = 1;
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life / 0.3, 0, 1);
    ctx.fillStyle = '#f2b93b';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function update(dt) {
  animT += dt;
  shakeT = Math.max(0, shakeT - dt);
  if (shakeT <= 0) shakeMag = 0;
  if (battle) {
    if (battle.player.hitFlash > 0) battle.player.hitFlash = Math.max(0, battle.player.hitFlash - dt);
    if (battle.cham && battle.cham.hitFlash > 0) battle.cham.hitFlash = Math.max(0, battle.cham.hitFlash - dt);
  }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 220 * dt;
  }
}

let lastT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000 || 0);
  lastT = now;
  update(dt);
  draw(now);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// ===== 入力配線 =====
function ensureAudio() { audio(); }

document.getElementById('act-food').addEventListener('click', () => { ensureAudio(); careAction('food'); });
document.getElementById('act-play').addEventListener('click', () => { ensureAudio(); careAction('play'); });
document.getElementById('act-walk').addEventListener('click', () => { ensureAudio(); careAction('walk'); });
document.getElementById('act-pet').addEventListener('click', () => { ensureAudio(); careAction('pet'); });
document.getElementById('act-sleep').addEventListener('click', () => { ensureAudio(); toggleSleep(); });
goBattleBtn.addEventListener('click', () => { ensureAudio(); if (!goBattleBtn.disabled) { runWins = 0; enterBattle(); } });

moveBtns.forEach((btn, i) => {
  btn.addEventListener('click', () => {
    ensureAudio();
    const moves = battle && battle.player.moves;
    if (moves && moves[i]) chooseMove(moves[i]);
  });
});
guardBtn.addEventListener('click', () => { ensureAudio(); chooseMove(GUARD_MOVE); });

startOverlay.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, input, a')) return;
  saveName();
  ensureAudio();
  assetsReady.then(enterHome);
});
overOverlay.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  enterHome();
});
rankOverlay.addEventListener('pointerdown', () => rankOverlay.classList.add('hidden'));

document.getElementById('retry-battle').addEventListener('click', (e) => {
  e.stopPropagation();
  runWins = 0;
  overOverlay.classList.add('hidden');
  hud.classList.remove('hidden');
  enterBattle();
});
document.getElementById('go-home').addEventListener('click', (e) => {
  e.stopPropagation();
  enterHome();
});

// ===== オンラインランキング =====
const API = '/api/scores';
let savedName = '';
try { savedName = localStorage.getItem('ruru_name') || localStorage.getItem('cake_name') || localStorage.getItem('pk_name') || ''; } catch (e) {}
nameInput.value = savedName;
nameInput.addEventListener('pointerdown', (e) => e.stopPropagation());

function saveName() {
  const name = nameInput.value.trim().slice(0, 10);
  savedName = name;
  if (name) { try { localStorage.setItem('ruru_name', name); } catch (e) {} }
}

async function autoSubmitScore(score) {
  if (score < 1 || !savedName) return;
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'ruru', name: savedName, score }),
    });
    if (!r.ok) return;
    const data = await r.json();
    const topList = data.top || [];
    const idx = topList.findIndex((e) => e.name === savedName);
    if (idx >= 0) {
      top10Badge.textContent = idx === 0 ? '👑 いま連勝記録1位!' : `🌏 連勝記録${idx + 1}位にランクイン!`;
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
    li.textContent = `${medal} ${entry.name} — ${entry.score} 連勝`;
    if (entry.name === highlightName) li.classList.add('me');
    rankListEl.appendChild(li);
  });
}

async function openRanking(highlightName) {
  rankOverlay.classList.remove('hidden');
  rankListEl.innerHTML = '<li class="rank-loading">よみこみちゅう…</li>';
  try {
    const r = await fetch(`${API}?game=ruru`);
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

// テスト自動化用の覗き穴 (ゲームには影響しない)
window.__ruruDebug = () => ({
  state, save: { ...save }, loopCount, formIdx, runWins,
  battlePlayerHp: battle ? battle.player.hp : null,
  battleChamHp: battle ? battle.cham.hp : null,
});
