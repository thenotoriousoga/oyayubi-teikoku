// るる vs チャム
//
// 設計の軸: 「どう育てたかが、どう戦うかに直結する」
//  育成 … 1日3回しか行動できない。全部は伸ばせないので必ず取捨選択が生まれる。
//         訓練するときぶんが下がり、きぶんが低いと伸びが鈍る → なでる時間も必要になる。
//  戦闘 … 3すくみ(とびかかる>フェイント>ふんばる>とびかかる)。
//         チャムは必ず「クセ」を見せるが、その信頼度は戦うたびに下がっていく。
//         強さのインフレではなく「情報の質」で難易度を上げるのが狙い。
//  絆   … ピンチのとき、なでて育てたきずなの分だけ るるが自分で動く。
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
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// ===== 定数 =====
const EMOJI_FONT = '"Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", serif';
const BODY_FONT = '"M PLUS Rounded 1c", sans-serif';
const ACTS_PER_DAY = 3;
const STAT_MAX = 60;          // 表示バーの上限 (実値の上限ではない)
const BASE_STAT = 4;

// 3すくみ: key が beats を打ち破る。
// atkMul = 勝ったときの与ダメージ倍率 / vulnMul = 負けたときの被ダメージ倍率。
// 「とびかかる」は勝てば大きいが、読み違えると手痛い。「ふんばる」はその逆。
// これにより「クセを信じて踏み込むか、安全に受けるか」が毎ターンの判断になる。
const MOVES = {
  pounce: { key: 'pounce', name: 'とびかかる', beats: 'feint',  stat: 'power', emoji: '💥', atkMul: 1.30, vulnMul: 1.35 },
  brace:  { key: 'brace',  name: 'ふんばる',   beats: 'pounce', stat: 'guard', emoji: '🛡️', atkMul: 0.60, vulnMul: 0.45 },
  feint:  { key: 'feint',  name: 'フェイント', beats: 'brace',  stat: 'speed', emoji: '💨', atkMul: 0.95, vulnMul: 0.95 },
};
const MOVE_KEYS = ['pounce', 'brace', 'feint'];

// チャムのクセ (実際に選んだ手に対応するしぐさ)
const TELLS = {
  pounce: ['チャムの耳が ぺたんと寝た…', 'チャムが 前のめりになった…', 'チャムの尻尾が ピンと立った…'],
  brace:  ['チャムが 腰を落とした…',     'チャムが 足を踏んばった…',   'チャムが 低くうなっている…'],
  feint:  ['チャムが 目を泳がせた…',     'チャムが 小刻みに動いている…', 'チャムが にやっと笑った…'],
};

// 5番勝負。スタミナは のばした分だけ試合が長引き、長引くほど「クセの読み違い」が効いてくる。
// 真の難化は数字ではなく tellAcc (クセの信頼度) の低下。
const ROUNDS = [
  { name: 'ごきげんチャム', sta: 58,  power: 8,  speed: 7,  guard: 7,  tellAcc: 0.90, nextDays: 4, taunt: 'よお、ちびすけ。あそんでやるよ' },
  { name: 'やるきチャム',   sta: 90,  power: 12, speed: 11, guard: 10, tellAcc: 0.82, nextDays: 4, taunt: 'こんどは 手加減しないぜ' },
  { name: 'ほんきチャム',   sta: 128, power: 16, speed: 15, guard: 14, tellAcc: 0.72, nextDays: 5, taunt: 'おまえ… 強くなったな' },
  { name: 'むそうチャム',   sta: 172, power: 21, speed: 19, guard: 18, tellAcc: 0.62, nextDays: 5, taunt: 'ここからが 本当の勝負だ' },
  { name: 'でんせつチャム', sta: 220, power: 26, speed: 24, guard: 22, tellAcc: 0.54, nextDays: 0, taunt: '全部だせ。おれも 全部だす' },
];
const FIRST_MATCH_DAY = 6;   // 5日ぶん(15行動)育ててから初戦

const PERSONAS = {
  power: { name: 'がんばりや', bonus: 'pounce', line: 'ぐいぐい 押していくタイプ' },
  speed: { name: 'やんちゃ',   bonus: 'feint',  line: 'ちょこまか 翻弄するタイプ' },
  guard: { name: 'おっとり',   bonus: 'brace',  line: 'どっしり 受けとめるタイプ' },
  bond:  { name: 'あまえんぼ', bonus: null,     line: 'あなたのことが 大好きなタイプ' },
  even:  { name: 'まじめ',     bonus: null,     line: 'なんでも そつなくこなすタイプ' },
};
const PERSONA_BONUS = 1.18;

// ===== セーブ =====
function defaultSave() {
  return {
    v: 2,
    day: 1, actsLeft: ACTS_PER_DAY,
    power: BASE_STAT, speed: BASE_STAT, guard: BASE_STAT, bond: 0,
    mood: 70,
    trainCounts: { power: 0, speed: 0, guard: 0, bond: 0 },
    roundIdx: 0,              // 次に戦う相手 (0-4)
    matchDay: FIRST_MATCH_DAY,
    cleared: false, clearDays: 0, bestClearDays: 0,
    moveUse: { pounce: 0, brace: 0, feint: 0 },  // チャムが対策してくる材料
    lastSeenAt: Date.now(),
  };
}
function loadSave() {
  try {
    const raw = localStorage.getItem('ruru_save_v2');
    if (!raw) return defaultSave();
    const s = JSON.parse(raw);
    if (!s || typeof s !== 'object' || s.v !== 2) return defaultSave();
    return { ...defaultSave(), ...s, trainCounts: { ...defaultSave().trainCounts, ...(s.trainCounts || {}) }, moveUse: { ...defaultSave().moveUse, ...(s.moveUse || {}) } };
  } catch (e) { return defaultSave(); }
}
function saveGame() {
  save.lastSeenAt = Date.now();
  try { localStorage.setItem('ruru_save_v2', JSON.stringify(save)); } catch (e) {}
}
let save = loadSave();

// 育て方から性格を決める。偏らせるほど はっきりした個性になる
function personaKeyOf(s) {
  const c = s.trainCounts;
  const entries = [['power', c.power], ['speed', c.speed], ['guard', c.guard], ['bond', c.bond]];
  const total = entries.reduce((a, [, v]) => a + v, 0);
  if (total < 4) return 'even';
  entries.sort((a, b) => b[1] - a[1]);
  if (entries[0][1] - entries[1][1] <= 1) return 'even';
  return entries[0][0];
}
const personaOf = (s) => PERSONAS[personaKeyOf(s)];
// こらえ を伸ばすほど長く戦える。伸ばさないと 2〜3発で沈む
const staminaMaxOf = (s) => Math.round(38 + s.guard * 1.5);
// きぶんが高いほど よく伸びる (訓練だけ続けると効率が落ちる)
const moodMul = (s) => 0.6 + (s.mood / 100) * 0.6;
// 伸ばすほど伸びにくくなる。1点集中だけでは頭打ちになり、配分を考える必要が出る
const trainGain = (s, stat) => 2.6 * moodMul(s) * (20 / (20 + s[stat]));

// ===== 効果音 (WebAudio) =====
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
const seTrain = () => tone(480, 0.09, 'square', 0.09, 0, 90);
const sePet = () => { tone(880, 0.08, 'sine', 0.07, 0, 120); tone(1100, 0.09, 'sine', 0.05, 0.07); };
const seDay = () => { tone(400, 0.12, 'triangle', 0.08); tone(600, 0.14, 'triangle', 0.08, 0.1); };
const seWin = () => tone(720, 0.1, 'triangle', 0.11, 0, 180);
const seLose = () => tone(200, 0.16, 'sawtooth', 0.11, 0, -70);
const seClash = () => tone(300, 0.09, 'square', 0.08, 0, -40);
const seBond = () => { tone(660, 0.1, 'sine', 0.1); tone(880, 0.1, 'sine', 0.1, 0.09); tone(1180, 0.22, 'sine', 0.11, 0.18); };
const seMatchWin = () => { tone(523.3, 0.16, 'triangle', 0.12); tone(659.3, 0.16, 'triangle', 0.12, 0.14); tone(880, 0.32, 'triangle', 0.13, 0.28); };
const seMatchLose = () => { tone(320, 0.3, 'sawtooth', 0.1); tone(220, 0.5, 'sawtooth', 0.1, 0.22); };

// ===== アセット =====
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

// 見た目の成長は「勝った数」に連動させる (育つほど頼もしくなる)
const ruruImageKey = (s) => `ruru${clamp(s.roundIdx, 0, 3)}`;
function ribbonImageKey(s) {
  if (s.bond >= 45) return 'ribbonGold';
  if (s.bond >= 28) return 'ribbonBlue';
  if (s.bond >= 12) return 'ribbonPink';
  return 'ribbonRed';
}

// ===== DOM =====
const homeHud = document.getElementById('home-hud');
const homeActions = document.getElementById('home-actions');
const battleHud = document.getElementById('battle-hud');
const battleMenu = document.getElementById('battle-menu');
const toastEl = document.getElementById('toast');
const startOverlay = document.getElementById('start-overlay');
const overOverlay = document.getElementById('over-overlay');
const rankOverlay = document.getElementById('rank-overlay');
const nameInput = document.getElementById('name-input');
const dayNumEl = document.getElementById('day-num');
const matchBadgeEl = document.getElementById('match-badge');
const personaBadgeEl = document.getElementById('persona-badge');
const actsLeftEl = document.getElementById('acts-left');
const moodFillEl = document.getElementById('mood-fill');
const moodFaceEl = document.getElementById('mood-face');
const goMatchBtn = document.getElementById('go-match');
const staRuruEl = document.getElementById('sta-ruru');
const staChamEl = document.getElementById('sta-cham');
const chamNameEl = document.getElementById('cham-name');
const roundLabelEl = document.getElementById('round-label');
const tellTextEl = document.getElementById('tell-text');
const tellGuessEl = document.getElementById('tell-guess');
const tellConfEl = document.getElementById('tell-conf');
const battleLogEl = document.getElementById('battle-log');
const moveBtnEls = { pounce: document.getElementById('mv-pounce'), brace: document.getElementById('mv-brace'), feint: document.getElementById('mv-feint') };
const overHeadEl = document.getElementById('over-head');
const overBodyEl = document.getElementById('over-body');
const overDaysEl = document.getElementById('over-days');
const overCommentEl = document.getElementById('over-comment');
const rankTitleEl = document.getElementById('rank-title');
const top10Badge = document.getElementById('top10-badge');
const rankListEl = document.getElementById('rank-list');
const continueBtn = document.getElementById('continue-btn');
const statFills = { power: document.getElementById('s-power'), speed: document.getElementById('s-speed'), guard: document.getElementById('s-guard'), bond: document.getElementById('s-bond') };
const statNums = { power: document.getElementById('n-power'), speed: document.getElementById('n-speed'), guard: document.getElementById('n-guard'), bond: document.getElementById('n-bond') };

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
let battle = null;
let ruruSay = null;     // { text, t } 吹き出し
let ruruAnim = { bounce: 0, hit: 0, lunge: 0 };
let chamAnim = { bounce: 0, hit: 0, lunge: 0 };

function say(text, dur) {
  ruruSay = { text, t: dur || 2.2 };
}

// ===== 育成 =====
const MOOD_FACES = [[75, '😆'], [50, '😊'], [28, '😐'], [0, '😪']];
function moodFace(m) {
  for (const [th, f] of MOOD_FACES) if (m >= th) return f;
  return '😪';
}

function updateHomeHud() {
  dayNumEl.textContent = String(save.day);
  const left = save.matchDay - save.day;
  if (save.cleared) matchBadgeEl.textContent = 'ぜんぶ 勝ちぬいた!';
  else if (left <= 0) matchBadgeEl.textContent = '⚔️ きょう しあい!';
  else matchBadgeEl.textContent = `しあいまで あと${left}日`;
  matchBadgeEl.classList.toggle('urgent', left <= 1 && !save.cleared);

  const p = personaOf(save);
  personaBadgeEl.textContent = p.name;

  for (const k of ['power', 'speed', 'guard', 'bond']) {
    statFills[k].style.width = `${clamp((save[k] / STAT_MAX) * 100, 0, 100)}%`;
    statNums[k].textContent = String(Math.round(save[k]));
  }
  moodFillEl.style.width = `${clamp(save.mood, 0, 100)}%`;
  moodFaceEl.textContent = moodFace(save.mood);

  actsLeftEl.textContent = '●'.repeat(save.actsLeft) + '○'.repeat(ACTS_PER_DAY - save.actsLeft);

  const isMatchDay = save.day >= save.matchDay && !save.cleared;
  goMatchBtn.classList.toggle('hidden', !isMatchDay);
  for (const id of ['act-run', 'act-pull', 'act-train', 'act-pet']) {
    document.getElementById(id).disabled = isMatchDay;
  }
}

const TRAIN_LINES = {
  power: ['ぐいぐい ひっぱった!', 'ロープを はなさない!', 'ふんばって 引き勝った!'],
  speed: ['びゅーんと 走った!', '風みたいに かけぬけた!', 'くるっと 切り返した!'],
  guard: ['おすわり、まて… できた!', 'じっと がまんできた!', 'ぐっと こらえた!'],
};

function doTrain(kind) {
  if (state !== STATE.HOME || save.actsLeft <= 0) return;
  if (save.day >= save.matchDay && !save.cleared) return;

  if (kind === 'bond') {
    save.bond += 4;
    save.mood = clamp(save.mood + 18, 0, 100);
    save.trainCounts.bond++;
    say(pick(['なでなで…♡', 'しっぽ ぶんぶん!', 'るるが すりよってきた']));
    sePet();
    sparkle(W / 2, H * 0.5, '💗');
  } else {
    const gain = trainGain(save, kind);
    save[kind] += gain;
    save.mood = clamp(save.mood - 14, 0, 100);
    save.trainCounts[kind]++;
    const low = save.mood < 30;
    say(low ? 'るるは ちょっと つかれている…' : pick(TRAIN_LINES[kind]));
    seTrain();
    ruruAnim.bounce = 0.5;
    sparkle(W / 2, H * 0.5, kind === 'power' ? '💪' : kind === 'speed' ? '💨' : '✨');
  }

  save.actsLeft--;
  if (save.actsLeft <= 0) advanceDay();
  saveGame();
  updateHomeHud();
}

function advanceDay() {
  save.day++;
  save.actsLeft = ACTS_PER_DAY;
  save.mood = clamp(save.mood + 12, 0, 100);   // 一晩ねると すこし回復
  seDay();
  const left = save.matchDay - save.day;
  if (left === 0) toast(`${save.day}日目 — きょうは しあいの日!`);
  else if (left === 1) toast(`${save.day}日目 — しあいは あした!`);
  else toast(`${save.day}日目の あさ`);
}

function enterHome() {
  state = STATE.HOME;
  startOverlay.classList.add('hidden');
  overOverlay.classList.add('hidden');
  homeHud.classList.remove('hidden');
  homeActions.classList.remove('hidden');
  battleHud.classList.add('hidden');
  battleMenu.classList.add('hidden');
  updateHomeHud();
}

// ===== バトル =====
function confidenceOf(acc) {
  if (acc >= 0.8) return { label: 'たかい', stars: '★★★' };
  if (acc >= 0.66) return { label: 'ふつう', stars: '★★☆' };
  return { label: 'ひくい', stars: '★☆☆' };
}

function enterBattle() {
  const r = ROUNDS[save.roundIdx];
  battle = {
    r,
    ruruSta: staminaMaxOf(save), ruruMax: staminaMaxOf(save),
    chamSta: r.sta, chamMax: r.sta,
    chamMove: null, tellShown: null,
    resolving: false, bondUsed: false, bondReady: false,
    turn: 0,
  };
  state = STATE.BATTLE;
  homeHud.classList.add('hidden');
  homeActions.classList.add('hidden');
  battleHud.classList.remove('hidden');
  battleMenu.classList.remove('hidden');
  roundLabelEl.textContent = `第${save.roundIdx + 1}戦`;
  chamNameEl.textContent = r.name;
  refreshBattleHud();
  battleLogEl.textContent = `${r.name}「${r.taunt}」`;
  setTimeout(() => { if (battle) nextTurn(); }, 1400);
}

function refreshBattleHud() {
  staRuruEl.style.width = `${clamp((battle.ruruSta / battle.ruruMax) * 100, 0, 100)}%`;
  staChamEl.style.width = `${clamp((battle.chamSta / battle.chamMax) * 100, 0, 100)}%`;
}

// チャムの手を決める。プレイヤーが偏っていると その対策手を厚くする(=適応)
function chamChoose() {
  const use = save.moveUse;
  const total = use.pounce + use.brace + use.feint;
  const w = { pounce: 1, brace: 1, feint: 1 };
  if (total >= 6) {
    // 最も使われている手を「打ち破る手」を厚くする
    const fav = MOVE_KEYS.reduce((a, b) => (use[a] >= use[b] ? a : b));
    const counter = MOVE_KEYS.find((k) => MOVES[k].beats === fav);
    if (counter) w[counter] += 1.1 * (save.roundIdx >= 2 ? 1.4 : 1);
  }
  const sum = w.pounce + w.brace + w.feint;
  let r = Math.random() * sum;
  for (const k of MOVE_KEYS) { if (r < w[k]) return k; r -= w[k]; }
  return 'pounce';
}

function nextTurn() {
  battle.turn++;
  battle.chamMove = chamChoose();
  // クセ: 信頼度 tellAcc で本当の手、それ以外は別の手のしぐさを見せる (=フェイント)
  const honest = Math.random() < battle.r.tellAcc;
  battle.tellShown = honest ? battle.chamMove : pick(MOVE_KEYS.filter((k) => k !== battle.chamMove));
  tellTextEl.textContent = pick(TELLS[battle.tellShown]);
  const conf = confidenceOf(battle.r.tellAcc);
  tellGuessEl.textContent = `${MOVES[battle.tellShown].name} しそう？`;
  tellConfEl.textContent = `信頼度 ${conf.stars} ${conf.label}`;

  // ピンチ + きずな で るるが自分から動く
  battle.bondReady = false;
  if (!battle.bondUsed && battle.ruruSta / battle.ruruMax <= 0.36) {
    if (Math.random() * 100 < Math.min(60, save.bond)) {
      battle.bondReady = true;
      battle.bondUsed = true;
      seBond();
      say('るるが あなたの顔を見た!', 3);
      battleLogEl.textContent = '💗 るるは あなたを 信じている! つぎの一手は 絶対に通る!';
      setMovesEnabled(true);
      battle.resolving = false;
      return;
    }
  }
  battleLogEl.textContent = 'どうする？';
  setMovesEnabled(true);
  battle.resolving = false;
}

function setMovesEnabled(on) {
  for (const k of MOVE_KEYS) moveBtnEls[k].disabled = !on;
}

function statFor(who, moveKey) {
  if (who === 'ruru') {
    const p = personaOf(save);
    const base = save[MOVES[moveKey].stat];
    return base * (p.bonus === moveKey ? PERSONA_BONUS : 1);
  }
  return battle.r[MOVES[moveKey].stat];
}

function playerMove(moveKey) {
  if (state !== STATE.BATTLE || !battle || battle.resolving) return;
  battle.resolving = true;
  setMovesEnabled(false);
  save.moveUse[moveKey]++;

  const mine = moveKey;
  const theirs = battle.chamMove;
  const bond = battle.bondReady;

  let result;
  if (bond) result = 'win';
  else if (mine === theirs) result = 'draw';
  else if (MOVES[mine].beats === theirs) result = 'win';
  else result = 'lose';

  tellTextEl.textContent = `チャムは ${MOVES[theirs].name} を えらんだ!`;
  tellGuessEl.textContent = '';
  tellConfEl.textContent = '';

  if (result === 'win') {
    let dmg = Math.round(statFor('ruru', mine) * MOVES[mine].atkMul * MOVES[theirs].vulnMul * rand(0.9, 1.12) * (bond ? 1.6 : 1));
    dmg = Math.max(1, dmg);
    battle.chamSta = Math.max(0, battle.chamSta - dmg);
    chamAnim.hit = 0.3; ruruAnim.lunge = 0.35;
    shake(bond ? 10 : 5);
    hitSpark(W * 0.72, H * 0.52);
    seWin();
    battleLogEl.textContent = bond
      ? `💗 るるの ${MOVES[mine].name}! ${dmg}ダメージ! 気持ちが 通じた!`
      : `るるの ${MOVES[mine].name}が きまった! ${dmg}ダメージ!`;
    say(pick(['やった!', 'どう だ!', 'いける!']), 1.6);
  } else if (result === 'lose') {
    let dmg = Math.round(statFor('cham', theirs) * MOVES[theirs].atkMul * MOVES[mine].vulnMul * rand(0.9, 1.12));
    dmg = Math.max(1, dmg);
    battle.ruruSta = Math.max(0, battle.ruruSta - dmg);
    ruruAnim.hit = 0.3; chamAnim.lunge = 0.35;
    shake(5);
    hitSpark(W * 0.28, H * 0.52);
    seLose();
    battleLogEl.textContent = `チャムの ${MOVES[theirs].name}! るるは ${dmg}ダメージ…`;
    say(pick(['きゃん!', 'うう…', 'まだ やれる!']), 1.6);
  } else {
    const chip = Math.max(1, Math.round(rand(2, 4)));
    battle.ruruSta = Math.max(0, battle.ruruSta - chip);
    battle.chamSta = Math.max(0, battle.chamSta - chip);
    seClash();
    battleLogEl.textContent = `おなじ手! にらみ合いで おたがい ${chip}ダメージ`;
  }

  refreshBattleHud();

  setTimeout(() => {
    if (battle.chamSta <= 0) return onMatchWin();
    if (battle.ruruSta <= 0) return onMatchLose();
    nextTurn();
  }, 1250);
}

function onMatchWin() {
  seMatchWin();
  shake(12);
  for (let i = 0; i < 14; i++) sparkle(rand(W * 0.2, W * 0.8), rand(H * 0.3, H * 0.6), pick(['✨', '🎉', '💗']));
  const wasLast = save.roundIdx >= ROUNDS.length - 1;
  const beaten = ROUNDS[save.roundIdx];

  if (wasLast) {
    save.cleared = true;
    save.clearDays = save.day;
    if (!save.bestClearDays || save.day < save.bestClearDays) save.bestClearDays = save.day;
  } else {
    save.roundIdx++;
    save.matchDay = save.day + beaten.nextDays;
  }
  saveGame();
  state = STATE.RESULT;
  battleHud.classList.add('hidden');
  battleMenu.classList.add('hidden');

  const p = personaOf(save);
  rankTitleEl.textContent = p.name;

  if (wasLast) {
    overHeadEl.textContent = '🏆 かんぜん勝利!';
    overBodyEl.textContent = `${beaten.name}を ぶったおした!\nチャムとの5番勝負、るるの勝ちだ!`;
    overDaysEl.textContent = `クリア日数 ${save.clearDays}日`;
    overCommentEl.textContent = `チャム「まいったよ。おまえ、ほんとに強くなったな」\n${p.line}るるでの記録だ。`;
    continueBtn.textContent = 'もういちど 育てる';
    submitClear(save.clearDays);
  } else {
    overHeadEl.textContent = 'かった!';
    overBodyEl.textContent = `${beaten.name}を ぶったおした!`;
    overDaysEl.textContent = `${save.day}日目 — つぎの しあいは ${save.matchDay}日目`;
    overCommentEl.textContent = `つぎは「${ROUNDS[save.roundIdx].name}」。\nあと${beaten.nextDays}日、どう育てる？`;
    continueBtn.textContent = 'つづける';
    top10Badge.classList.add('hidden');
  }
  overOverlay.classList.remove('hidden');
}

function onMatchLose() {
  seMatchLose();
  // 負けは「日数のロス」で払う。やり直せるが最短記録からは遠ざかる
  save.matchDay = save.day + 3;
  save.mood = clamp(save.mood + 20, 0, 100);
  saveGame();
  state = STATE.RESULT;
  battleHud.classList.add('hidden');
  battleMenu.classList.add('hidden');

  const p = personaOf(save);
  rankTitleEl.textContent = p.name;
  overHeadEl.textContent = 'まけちゃった…';
  overBodyEl.textContent = `${battle.r.name}には まだ とどかない。`;
  overDaysEl.textContent = `${save.day}日目 — 再戦は ${save.matchDay}日目`;
  overCommentEl.textContent = 'あと3日ある。何を のばす？\nチャムのクセを 思い出しておこう。';
  continueBtn.textContent = '育てなおす';
  top10Badge.classList.add('hidden');
  overOverlay.classList.remove('hidden');
}

// ===== 演出 =====
function hitSpark(x, y) {
  for (let i = 0; i < 8; i++) {
    const a = Math.random() * Math.PI * 2;
    const sp = 60 + Math.random() * 110;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 30, life: 0.35, emoji: null });
  }
}
function sparkle(x, y, emoji) {
  particles.push({ x: x + rand(-30, 30), y: y + rand(-20, 20), vx: rand(-40, 40), vy: rand(-110, -60), life: 0.9, emoji });
}
function shake(mag) { shakeT = 0.22; shakeMag = Math.max(shakeMag, mag); }

// ===== 描画 =====
function drawBackdrop(top, bot) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, top);
  g.addColorStop(1, bot);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

function drawSprite(img, x, y, size, facing, anim) {
  if (!img) return;
  ctx.save();
  ctx.translate(x, y);
  if (anim && anim.hit > 0) ctx.globalAlpha = 0.5 + 0.5 * Math.sin(anim.hit * 60);
  ctx.scale(facing, 1);
  if (anim && anim.lunge > 0) ctx.rotate(anim.lunge * 0.5);
  ctx.drawImage(img, -size / 2, -size / 2, size, size);
  ctx.restore();
}

function drawBubble(text, x, y) {
  ctx.save();
  ctx.font = `bold 15px ${BODY_FONT}`;
  const lines = String(text).split('\n');
  let wMax = 0;
  for (const l of lines) wMax = Math.max(wMax, ctx.measureText(l).width);
  const padX = 14, padY = 10, lh = 20;
  const bw = wMax + padX * 2, bh = lines.length * lh + padY * 2;
  const bx = clamp(x - bw / 2, 10, W - bw - 10), by = y - bh;
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.strokeStyle = 'rgba(217,88,124,0.5)';
  ctx.lineWidth = 2.5;
  const r = 14;
  ctx.beginPath();
  ctx.moveTo(bx + r, by);
  ctx.arcTo(bx + bw, by, bx + bw, by + bh, r);
  ctx.arcTo(bx + bw, by + bh, bx, by + bh, r);
  ctx.arcTo(bx, by + bh, bx, by, r);
  ctx.arcTo(bx, by, bx + bw, by, r);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 8, by + bh);
  ctx.lineTo(x, by + bh + 10);
  ctx.lineTo(x + 8, by + bh);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.94)';
  ctx.fill();
  ctx.fillStyle = '#5a4636';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  lines.forEach((l, i) => ctx.fillText(l, bx + bw / 2, by + padY + lh * i + lh / 2));
  ctx.restore();
}

function drawHome(t) {
  drawBackdrop('#fff8ef', '#f6e4cd');
  ctx.save();
  ctx.fillStyle = 'rgba(217, 88, 124, 0.08)';
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.68, W * 0.44, 38, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const tired = save.mood < 30;
  const bob = tired ? Math.sin(t * 1.4) * 2 : Math.sin(t * 2.6) * 5 + (ruruAnim.bounce > 0 ? Math.sin(ruruAnim.bounce * 22) * 10 : 0);
  const size = Math.min(W, H) * 0.36;
  const cx = W / 2, cy = H * 0.55;
  drawSprite(images[ruruImageKey(save)], cx, cy + bob, size, 1, null);
  drawSprite(images[ribbonImageKey(save)], cx, cy + bob, size, 1, null);
  if (tired) {
    ctx.save();
    ctx.globalAlpha = 0.6 + 0.4 * Math.sin(t * 2);
    ctx.font = `22px ${EMOJI_FONT}`;
    ctx.textAlign = 'center';
    ctx.fillText('💤', cx + size * 0.3, cy + bob - size * 0.32);
    ctx.restore();
  }
  if (ruruSay) drawBubble(ruruSay.text, cx, cy - size * 0.42 + bob);
}

function drawBattle(t) {
  drawBackdrop('#fdf1de', '#f3d9b8');
  ctx.save();
  ctx.fillStyle = 'rgba(90, 70, 54, 0.07)';
  ctx.beginPath();
  ctx.ellipse(W / 2, H * 0.63, W * 0.58, 36, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  if (!battle) return;

  const size = Math.min(W, H) * 0.33;
  const px = W * 0.28, cxp = W * 0.72, cy = H * 0.5;
  const pBob = Math.sin(t * 3) * 4, cBob = Math.sin(t * 3 + 1.4) * 4;

  drawSprite(images[ruruImageKey(save)], px, cy + pBob, size, 1, ruruAnim);
  drawSprite(images[ribbonImageKey(save)], px, cy + pBob, size, 1, ruruAnim);

  if (save.roundIdx === 4) {
    ctx.save();
    ctx.globalAlpha = 0.75 + 0.25 * Math.sin(t * 2);
    drawSprite(images.chamAura4, cxp, cy + cBob, size * 1.5, -1, null);
    ctx.restore();
  }
  drawSprite(images.chamBase, cxp, cy + cBob, size, -1, chamAnim);
  drawSprite(images[`chamAcc${save.roundIdx}`], cxp, cy + cBob, size, -1, chamAnim);

  if (battle.bondReady) {
    ctx.save();
    ctx.globalAlpha = 0.5 + 0.5 * Math.sin(t * 6);
    ctx.strokeStyle = '#d9587c';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(px, cy + pBob, size * 0.52, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
  if (ruruSay) drawBubble(ruruSay.text, px, cy - size * 0.4 + pBob);
}

function draw(now) {
  const t = now / 1000;
  ctx.save();
  if (shakeT > 0) ctx.translate((Math.random() - 0.5) * shakeMag, (Math.random() - 0.5) * shakeMag);
  if (state === STATE.BATTLE) drawBattle(t); else drawHome(t);
  ctx.globalAlpha = 1;
  for (const p of particles) {
    ctx.globalAlpha = clamp(p.life, 0, 1);
    if (p.emoji) {
      ctx.font = `20px ${EMOJI_FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText(p.emoji, p.x, p.y);
    } else {
      ctx.fillStyle = '#f2b93b';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function update(dt) {
  shakeT = Math.max(0, shakeT - dt);
  if (shakeT <= 0) shakeMag = 0;
  for (const a of [ruruAnim, chamAnim]) {
    a.bounce = Math.max(0, a.bounce - dt);
    a.hit = Math.max(0, a.hit - dt);
    a.lunge = Math.max(0, a.lunge - dt);
  }
  if (ruruSay) { ruruSay.t -= dt; if (ruruSay.t <= 0) ruruSay = null; }
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life -= dt;
    if (p.life <= 0) { particles.splice(i, 1); continue; }
    p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 200 * dt;
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

// ===== 入力 =====
function ensureAudio() { audio(); }
document.getElementById('act-run').addEventListener('click', () => { ensureAudio(); doTrain('speed'); });
document.getElementById('act-pull').addEventListener('click', () => { ensureAudio(); doTrain('power'); });
document.getElementById('act-train').addEventListener('click', () => { ensureAudio(); doTrain('guard'); });
document.getElementById('act-pet').addEventListener('click', () => { ensureAudio(); doTrain('bond'); });
goMatchBtn.addEventListener('click', () => { ensureAudio(); enterBattle(); });
for (const k of MOVE_KEYS) moveBtnEls[k].addEventListener('click', () => { ensureAudio(); playerMove(k); });

startOverlay.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button, input, a')) return;
  saveName();
  ensureAudio();
  assetsReady.then(() => {
    enterHome();
    const away = Date.now() - (save.lastSeenAt || Date.now());
    if (away > 20 * 3600 * 1000 && save.day > 1) say('ひさしぶり! るるが とびついてきた!', 3);
    else if (save.day > 1) say('きょうも がんばろうね!', 2.4);
    else say('はじめまして、るるだよ!', 3);
  });
});
continueBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (save.cleared) {
    // クリア後にもう一周: 記録は残したまま育成をリセット
    const best = save.bestClearDays;
    save = defaultSave();
    save.bestClearDays = best;
    saveGame();
  }
  enterHome();
});
overOverlay.addEventListener('pointerdown', (e) => {
  if (e.target.closest('button')) return;
  continueBtn.click();
});
rankOverlay.addEventListener('pointerdown', () => rankOverlay.classList.add('hidden'));
document.getElementById('reset-save').addEventListener('click', (e) => {
  e.stopPropagation();
  const best = save.bestClearDays;
  save = defaultSave();
  save.bestClearDays = best;
  saveGame();
  toast('さいしょから 育てなおすよ');
});

// ===== オンライン記録 (最短クリア日数) =====
// APIは「大きいほど上位」のソート済みセットなので、日数は 999-日数 で保存して表示時に戻す
const API = '/api/scores';
const DAYS_BASE = 999;
let savedName = '';
try { savedName = localStorage.getItem('ruru_name') || localStorage.getItem('cake_name') || localStorage.getItem('pk_name') || ''; } catch (e) {}
nameInput.value = savedName;
nameInput.addEventListener('pointerdown', (e) => e.stopPropagation());

function saveName() {
  const name = nameInput.value.trim().slice(0, 10);
  savedName = name;
  if (name) { try { localStorage.setItem('ruru_name', name); } catch (e) {} }
}

async function submitClear(days) {
  top10Badge.classList.add('hidden');
  const score = DAYS_BASE - days;
  if (!savedName || score < 1 || score > DAYS_BASE) return;
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ game: 'ruru', name: savedName, score }),
    });
    if (!r.ok) return;
    const data = await r.json();
    const idx = (data.top || []).findIndex((e) => e.name === savedName);
    if (idx >= 0) {
      top10Badge.textContent = idx === 0 ? '👑 いま世界最短記録!' : `🌏 最短記録 ${idx + 1}位!`;
      top10Badge.classList.remove('hidden');
    }
  } catch (e) {}
}

function renderRanking(topList, highlight) {
  rankListEl.innerHTML = '';
  if (!topList.length) {
    rankListEl.innerHTML = '<li class="rank-loading">まだ だれも チャムに勝ちきってないよ</li>';
    return;
  }
  topList.forEach((entry, i) => {
    const li = document.createElement('li');
    const medal = ['🥇', '🥈', '🥉'][i] || `${i + 1}位`;
    li.textContent = `${medal} ${entry.name} — ${DAYS_BASE - entry.score} 日`;
    if (entry.name === highlight) li.classList.add('me');
    rankListEl.appendChild(li);
  });
}

async function openRanking(highlight) {
  rankOverlay.classList.remove('hidden');
  rankListEl.innerHTML = '<li class="rank-loading">よみこみちゅう…</li>';
  try {
    const r = await fetch(`${API}?game=ruru`);
    if (!r.ok) throw new Error();
    const data = await r.json();
    renderRanking(data.top || [], highlight);
  } catch (e) {
    rankListEl.innerHTML = '<li class="rank-loading">記録を取得できませんでした</li>';
  }
}
document.getElementById('show-rank-start').addEventListener('click', (e) => { e.stopPropagation(); saveName(); openRanking(savedName); });
document.getElementById('show-rank-over').addEventListener('click', (e) => { e.stopPropagation(); openRanking(savedName); });

// テスト自動化用の覗き穴 (ゲームには影響しない)
window.__ruruDebug = () => ({
  state, day: save.day, actsLeft: save.actsLeft,
  power: Math.round(save.power), speed: Math.round(save.speed), guard: Math.round(save.guard),
  bond: save.bond, mood: Math.round(save.mood),
  persona: personaOf(save).name,
  roundIdx: save.roundIdx, matchDay: save.matchDay, cleared: save.cleared, clearDays: save.clearDays,
  ruruSta: battle ? battle.ruruSta : null, chamSta: battle ? battle.chamSta : null,
  chamMove: battle ? battle.chamMove : null, tellShown: battle ? battle.tellShown : null,
  bondReady: battle ? battle.bondReady : null,
});
window.__ruruForce = (patch) => { Object.assign(save, patch); saveGame(); updateHomeHud(); };
