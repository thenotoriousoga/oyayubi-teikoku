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
const nameInput = document.getElementById('name-input');
const numberInput = document.getElementById('number-input');
const startTapEl = document.getElementById('start-tap');
const top10Badge = document.getElementById('top10-badge');
const showRankStartBtn = document.getElementById('show-rank-start');
const showRankOverBtn = document.getElementById('show-rank-over');
const showZukanBtn = document.getElementById('show-zukan');
const zukanOverlay = document.getElementById('zukan-overlay');
const zukanGrid = document.getElementById('zukan-grid');
const achievementsEl = document.getElementById('achievements');
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
    power: 0.12, swayAmp: 0.16, swayPeriod: 2800, diveSpeed: 0.00035, reactMs: 520, reach: 0.10, scale: 0.5,
    intro: ['わん!', '(あそんでくれるの?)'],
    save: ['わん!!', '(ボールとれたよ!)'],
    hit: ['わふ?', '(いまのどこいった?)'],
    blown: ['きゃいーん!!', '(おそらとんでる〜)'],
    mock: ['わんわん!', '(ボールどっかいっちゃった)'],
    draw: drawPochi,
  },
  {
    name: '小学生ケンタ', emoji: '🧢', country: '全国少年団選抜', round: '壮行試合',
    power: 0.22, swayAmp: 0.24, swayPeriod: 2300, diveSpeed: 0.0006, reactMs: 420, reach: 0.14, scale: 0.7,
    intro: ['ぜったい止めるもん!', '(母ちゃん見てて)'],
    save: ['やった〜!!', '(母ちゃん見た!?)'],
    hit: ['え、いま入った?', '(全然見えなかった…)'],
    blown: ['うわあああ!', '(母ちゃん、ぼく飛んでる!)'],
    mock: ['ヘタクソ〜!', '(ぼくでも枠にはいくよ?)'],
    draw: drawKenta,
  },
  {
    name: 'ラーメン職人 麺蔵', emoji: '🍜', country: 'ヌードル帝国', round: 'アジア予選',
    power: 0.32, swayAmp: 0.3, swayPeriod: 2000, diveSpeed: 0.0008, reactMs: 360, reach: 0.17, scale: 0.9,
    intro: ['守りは麺の硬さと同じ', '(バリカタよ)'],
    save: ['ズズッ', '(いただきました)'],
    hit: ['隙ありか…', '(替え玉して出直す)'],
    blown: ['のびる〜〜!!', '(麺もワシも宙を舞う)'],
    mock: ['麺より曲がっとる', '(修行が足りんな)'],
    draw: drawMenzo,
  },
  {
    name: 'キン・マッスル', emoji: '💪', country: 'マッチョ共和国', round: 'アジア最終予選',
    power: 0.48, swayAmp: 0.26, swayPeriod: 1800, diveSpeed: 0.0009, reactMs: 330, reach: 0.20, scale: 1.05,
    intro: ['筋肉は裏切らない', '(大胸筋で受け止める)'],
    save: ['ナイスマッスル!!', '(大胸筋キャッチ)'],
    hit: ['筋肉の死角…!', '(そこは盲点だった)'],
    blown: ['マッスルフライ!!', '(いい風だ…)'],
    mock: ['筋肉に謝れ', '(枠は逃げないぞ)'],
    draw: drawMuscle,
  },
  {
    name: 'カベルマン', emoji: '🧱', country: 'ドイツ代表', round: 'グループリーグ',
    power: 0.42, swayAmp: 0.18, swayPeriod: 1900, diveSpeed: 0.0007, reactMs: 300, reach: 0.30, scale: 1.0,
    intro: ['私は壁だ', '(文字どおり)'],
    save: ['カチッ', '(壁に穴は無い)'],
    hit: ['壁に穴が…', '(リフォームが必要だ)'],
    blown: ['壁ごと!?', '(工事費を請求する)'],
    mock: ['壁の出番すら無い', '(仕事をくれ)'],
    draw: drawKabelmann,
  },
  {
    name: 'ゴムゴム・ダ・シウバ', emoji: '🕺', country: 'ブラジル代表', round: 'グループリーグ',
    power: 0.46, swayAmp: 0.42, swayPeriod: 1300, diveSpeed: 0.0013, reactMs: 280, reach: 0.26, scale: 1.0,
    intro: ['リズムに乗りな', '(腕は伸びるぜ)'],
    save: ['ビヨーン', '(届いちゃうんだな)'],
    hit: ['ノーリズム!?', '(シンコペーションか…)'],
    blown: ['ビヨーーーン!!', '(伸びたまま飛んでる)'],
    mock: ['枠外はノーカン', '(まずリズム練習からだ)'],
    draw: drawGomgom,
  },
  {
    name: 'エル・プルポ', emoji: '🐙', country: 'スペイン代表', round: '準々決勝',
    power: 0.58, swayAmp: 0.3, swayPeriod: 1400, diveSpeed: 0.0014, reactMs: 250, reach: 0.30, scale: 1.05,
    intro: ['腕は8本ある', '(どこに打つ気だ?)'],
    save: ['ぬるり', '(タコに死角なし)'],
    hit: ['8本でも届かん…', '(9本目が要る)'],
    blown: ['タコが宙を舞う!', '(茹でないで)'],
    mock: ['墨も要らんかった', '(海より広い枠外)'],
    draw: drawPulpo,
  },
  {
    name: 'GK-9000', emoji: '🤖', country: 'AI連邦', round: '準決勝',
    power: 0.68, swayAmp: 0.14, swayPeriod: 1000, diveSpeed: 0.0018, reactMs: 160, reach: 0.26, scale: 1.0,
    intro: ['解析完了。', '(君のPK成功率: 2%)'],
    save: ['計算通り。', '(誤差0.00mm)'],
    hit: ['計算外…', '(再起動シマス…)'],
    blown: ['システムクラッシュ!!', '(空ヲ飛ンデイマス)'],
    mock: ['命中率0%。', '(計算スルマデモナイ)'],
    draw: drawRobot,
  },
  {
    name: '魔王ゲルド', emoji: '👹', country: '魔王国ダークニル', round: '決勝',
    power: 0.82, swayAmp: 0.34, swayPeriod: 1100, diveSpeed: 0.0019, reactMs: 150, reach: 0.32, scale: 1.15,
    intro: ['よくぞここまで来た', '(だがここまでだ)'],
    save: ['フハハハ!', '(絶望を知れ)'],
    hit: ['バカな…!', '(コースが見えなかった)'],
    blown: ['魔王が飛ぶだと!?', '(城まで飛ばされた…)'],
    mock: ['フハハ!', '(自滅とは楽でいい)'],
    draw: drawMaou,
  },
  {
    name: 'ゴールの神', emoji: '🌌', country: '神々の国オリンポス', round: '神試合',
    power: 9.99, swayAmp: 0.30, swayPeriod: 1150, diveSpeed: 0.0018, reactMs: 170, reach: 0.29, scale: 1.3,
    intro: ['我を抜く者、神となる', '(まぐれは通じぬ)'],
    save: ['────。', '(それが人の限界か)'],
    hit: ['見事。', '(人よ、神になれ)'],
    blown: ['────!?', '(神が、飛ぶ…?)'],
    mock: ['────。', '(枠は、あちらだ)'],
    draw: drawGod,
  },
];

const TOTAL = KEEPERS.length;

// 図鑑用プロフィール(KEEPERSと同順)
const PROFILES = [
  '散歩とボールが大好き。止めても決められてもしっぽを振る。',
  '将来の夢は日本代表。母ちゃんが毎試合ビデオ撮影している。',
  '営業時間外だけゴールを守る。スープは企業秘密。',
  '大胸筋・上腕二頭筋・僧帽筋の三枚看板で守る男。',
  '職業は壁。趣味も壁。座右の銘は「無失点」。',
  'サンバのリズムでしか動けない。腕の伸びは企業秘密。',
  '海から来た8本腕の守護神。墨は最終手段。',
  '演算能力は世界一。だが「まぐれ」だけは計算できない。',
  '魔王軍のGK兼監督。負けたら魔王城で反省会。',
  'ゴールという概念そのもの。抜いた者は神になるという。',
];

// ===== 状態 =====
const STATE = {
  TITLE: 'title', INTRO: 'intro',
  AIM_DIR: 'aim_dir', AIM_POWER: 'aim_power', AIM_SIZE: 'aim_size',
  KICK: 'kick', RETRY: 'retry', SHOOT: 'shoot', GOAL: 'goal', OVER: 'over',
};
let state = STATE.TITLE;
let stageIdx = 0;
let hearts = 3;
let loopCount = 0;    // 周回数 (0 = 1周目)
let loopMissed = false;
// スコア形式変更のため新キー (旧pk_bestは旧形式なので引き継がない)
let best = 0;
try { best = parseInt(localStorage.getItem('pk_best2') || '0', 10) || 0; } catch (e) {}

let phaseStart = 0;   // 現在のゲージフェーズ開始時刻
let plan = null;      // { angle, speed, size } 選択途中の値
let kickAnim = null;  // キックモーション { startT }
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

// 周回による難化はキーパー強化ではなく「ゲージの速さ」で表現する。
// 上限1.8倍キャップで、人間に決められない速さには決してならない
function gaugeSpeedup() {
  return Math.min(1 + loopCount * 0.15, 1.8);
}

// ===== 図鑑・実績(localStorage) =====
let zukan = new Set();
let stats = { plays: 0, goals: 0, blows: 0, demolishes: 0, clears: 0, noMissClears: 0, wides: 0, panenkas: 0 };
try { zukan = new Set(JSON.parse(localStorage.getItem('pk_zukan') || '[]')); } catch (e) {}
try { Object.assign(stats, JSON.parse(localStorage.getItem('pk_stats') || '{}')); } catch (e) {}

function saveMeta() {
  try {
    localStorage.setItem('pk_zukan', JSON.stringify([...zukan]));
    localStorage.setItem('pk_stats', JSON.stringify(stats));
  } catch (e) {}
}

// ===== スキン (バッジ報酬。将来は課金でも入手経路を増やせる設計) =====
const BALL_SKINS = {
  classic: { name: 'クラシック', base: ['#ffffff', '#eef0f2', '#b3bac2'], pattern: '#23272b' },
  street:  { name: 'ストリート', base: ['#4a4a52', '#2b2b31', '#131316'], pattern: '#f2f0eb' },
  flame:   { name: '炎のボール', base: ['#ffd27a', '#ff7a3c', '#c22e12'], pattern: '#7a1200' },
  sakura:  { name: '桜ボール', base: ['#fff4f7', '#ffd6e2', '#f299b8'], pattern: '#d14b7d' },
  gold:    { name: '黄金のボール', base: ['#fff3c4', '#ffd94d', '#c9971c'], pattern: '#6b4e00' },
};
const UNIFORM_SKINS = {
  samurai: { name: 'サムライブルー', shirt: '#1440a0', number: '#ffffff' },
  crimson: { name: '紅のエース', shirt: '#c62828', number: '#ffffff' },
  neon:    { name: 'ネオン', shirt: '#16c95c', number: '#0c0c0e' },
  dark:    { name: '漆黒', shirt: '#17171c', number: '#f2b90c' },
  goldUni: { name: '黄金', shirt: '#f2b90c', number: '#17171c' },
};

let equippedBall = 'classic';
let equippedUniform = 'samurai';
try {
  equippedBall = localStorage.getItem('pk_ball') || 'classic';
  equippedUniform = localStorage.getItem('pk_uniform') || 'samurai';
} catch (e) {}

// reward: { type: 'ball'|'uniform', id } を持つバッジは達成でスキン解禁
const ACHIEVEMENTS = [
  { medal: '⚽', name: 'はじめの一撃', desc: '初ゴールを決める', cond: () => stats.goals >= 1, reward: { type: 'ball', id: 'street' } },
  { medal: '🧨', name: '解体新書', desc: 'ゴールごと粉砕する', cond: () => stats.demolishes >= 1 },
  { medal: '💥', name: '破壊神', desc: 'ゴール粉砕を10回', cond: () => stats.demolishes >= 10, reward: { type: 'ball', id: 'flame' } },
  { medal: '🌪', name: '台風の目', desc: 'キーパーを30回吹っ飛ばす', cond: () => stats.blows >= 30 },
  { medal: '🌏', name: 'アジア突破', desc: '第5戦に到達する', cond: () => best >= 4, reward: { type: 'ball', id: 'sakura' } },
  { medal: '🎯', name: 'パネンカ', desc: 'ど真ん中への軽いシュートでゴール', cond: () => stats.panenkas >= 1 },
  { medal: '🚀', name: '宇宙開発', desc: '枠外に通算10回ふっとばす', cond: () => stats.wides >= 10, reward: { type: 'uniform', id: 'neon' } },
  { medal: '🥅', name: 'ゴールハンター', desc: '通算50ゴール', cond: () => stats.goals >= 50, reward: { type: 'uniform', id: 'crimson' } },
  { medal: '🤖', name: 'ゴールマシン', desc: '通算200ゴール', cond: () => stats.goals >= 200 },
  { medal: '🎖', name: 'ベスト8の男', desc: '第7戦に到達する', cond: () => best >= 6 },
  { medal: '👹', name: '魔王討伐', desc: '神試合に到達する', cond: () => best >= 9, reward: { type: 'uniform', id: 'dark' } },
  { medal: '🏆', name: '世界の頂', desc: '優勝する', cond: () => stats.clears >= 1, reward: { type: 'ball', id: 'gold' } },
  { medal: '👑', name: 'パーフェクト', desc: 'ノーミスで優勝する', cond: () => stats.noMissClears >= 1, reward: { type: 'uniform', id: 'goldUni' } },
  { medal: '🔁', name: '神殺しの常連', desc: '2周目もクリアする', cond: () => best >= 20 },
  { medal: '🎫', name: '常連', desc: '通算20回プレイする', cond: () => stats.plays >= 20 },
  { medal: '💯', name: '百戦錬磨', desc: '通算100回プレイする', cond: () => stats.plays >= 100 },
];

// スキンが解禁済みか (対応バッジの達成状況から動的に判定)
function skinUnlocked(type, id) {
  if ((type === 'ball' && id === 'classic') || (type === 'uniform' && id === 'samurai')) return true;
  const a = ACHIEVEMENTS.find((x) => x.reward && x.reward.type === type && x.reward.id === id);
  return a ? a.cond() : false;
}

function equipSkin(type, id) {
  if (!skinUnlocked(type, id)) return;
  if (type === 'ball') {
    equippedBall = id;
    try { localStorage.setItem('pk_ball', id); } catch (e) {}
  } else {
    equippedUniform = id;
    try { localStorage.setItem('pk_uniform', id); } catch (e) {}
  }
}

// 装備中スキンが未解禁 (別端末など) ならデフォルトに戻す
if (!BALL_SKINS[equippedBall] || !skinUnlocked('ball', equippedBall)) equippedBall = 'classic';
if (!UNIFORM_SKINS[equippedUniform] || !skinUnlocked('uniform', equippedUniform)) equippedUniform = 'samurai';

function renderLocker() {
  const build = (type, skins, equippedId, containerId) => {
    const el = document.getElementById(containerId);
    el.innerHTML = '';
    for (const [id, s] of Object.entries(skins)) {
      const unlocked = skinUnlocked(type, id);
      const chip = document.createElement('button');
      chip.className = 'skin-chip' + (unlocked ? '' : ' locked') + (id === equippedId ? ' equipped' : '');
      const sw = document.createElement('span');
      sw.className = 'skin-swatch' + (type === 'uniform' ? ' shirt' : '');
      sw.style.background = type === 'ball'
        ? `radial-gradient(circle at 35% 35%, ${s.base[0]}, ${s.base[1]} 55%, ${s.base[2]})`
        : s.shirt;
      const nm = document.createElement('span');
      nm.className = 'skin-name';
      nm.textContent = unlocked ? s.name : '🔒 ' + s.name;
      chip.append(sw, nm);
      if (!unlocked) {
        const a = ACHIEVEMENTS.find((x) => x.reward && x.reward.type === type && x.reward.id === id);
        if (a) {
          const cond = document.createElement('span');
          cond.className = 'skin-cond';
          cond.textContent = `「${a.name}」で解禁`;
          chip.append(cond);
        }
      } else if (id === equippedId) {
        const eq = document.createElement('span');
        eq.className = 'skin-cond';
        eq.textContent = 'そうび中';
        chip.append(eq);
      }
      chip.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!unlocked) return;
        equipSkin(type, id);
        renderLocker();
      });
      el.appendChild(chip);
    }
  };
  build('ball', BALL_SKINS, equippedBall, 'ball-skins');
  build('uniform', UNIFORM_SKINS, equippedUniform, 'uniform-skins');
}

function openZukan() {
  renderLocker();
  zukanGrid.innerHTML = '';
  KEEPERS.forEach((k, i) => {
    const card = document.createElement('div');
    const unlocked = zukan.has(i);
    card.className = 'z-card' + (unlocked ? '' : ' locked');
    const emoji = document.createElement('div');
    emoji.className = 'z-emoji';
    emoji.textContent = unlocked ? k.emoji : '❓';
    const name = document.createElement('div');
    name.className = 'z-name';
    name.textContent = unlocked ? k.name : '???';
    const country = document.createElement('div');
    country.className = 'z-country';
    country.textContent = unlocked ? k.country : `第${i + 1}戦の相手`;
    const prof = document.createElement('div');
    prof.className = 'z-profile';
    prof.textContent = unlocked ? PROFILES[i] : '倒すと解放される';
    card.append(emoji, name, country, prof);
    zukanGrid.appendChild(card);
  });
  achievementsEl.innerHTML = '';
  for (const a of ACHIEVEMENTS) {
    const done = a.cond();
    const row = document.createElement('div');
    row.className = 'ach' + (done ? ' done' : ' locked');
    const medal = document.createElement('span');
    medal.className = 'ach-medal';
    medal.textContent = a.medal;
    const box = document.createElement('div');
    const nm = document.createElement('div');
    nm.className = 'ach-name';
    nm.textContent = a.name;
    const ds = document.createElement('div');
    ds.className = 'ach-desc';
    ds.textContent = a.desc;
    box.append(nm, ds);
    if (a.reward) {
      const rw = document.createElement('div');
      rw.className = 'ach-reward';
      const skinName = a.reward.type === 'ball' ? BALL_SKINS[a.reward.id].name : UNIFORM_SKINS[a.reward.id].name;
      rw.textContent = `🎁 ${skinName}`;
      box.append(rw);
    }
    row.append(medal, box);
    achievementsEl.appendChild(row);
  }
  zukanOverlay.classList.remove('hidden');
}

// ===== スコア =====
// スコア = 倒したキーパーの総数 (ハートは含めない)
function totalBeaten() { return loopCount * TOTAL + stageIdx; }
function currentScore() { return Math.min(totalBeaten(), 999); }
function scoreLabel(s) {
  const loop = Math.floor(s / TOTAL);
  const st = s % TOTAL;
  const prefix = loop >= 1 ? `${loop + 1}周目 ` : '';
  return `${prefix}第${st + 1}戦`;
}
function rankTitle(beaten) {
  if (beaten >= 30) return '生ける伝説';
  if (beaten >= 20) return '神殺しの常連';
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

// ===== HipHopビート(オリジナル打ち込み・狙い中に薄く流す) =====
function drumKick(t) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = 'sine';
  o.frequency.setValueAtTime(110, t);
  o.frequency.exponentialRampToValueAtTime(42, t + 0.11);
  g.gain.setValueAtTime(0.30, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(g).connect(AC.destination);
  o.start(t); o.stop(t + 0.16);
}

function drumSnare(t) {
  const n = AC.createBufferSource(), g = AC.createGain(), f = AC.createBiquadFilter();
  n.buffer = noiseBuf;
  f.type = 'bandpass'; f.frequency.value = 1900; f.Q.value = 0.8;
  g.gain.setValueAtTime(0.14, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  n.connect(f).connect(g).connect(AC.destination);
  n.start(t); n.stop(t + 0.1);
}

function drumHat(t, open) {
  const n = AC.createBufferSource(), g = AC.createGain(), f = AC.createBiquadFilter();
  n.buffer = noiseBuf;
  f.type = 'highpass'; f.frequency.value = 7500;
  g.gain.setValueAtTime(open ? 0.05 : 0.035, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + (open ? 0.08 : 0.03));
  n.connect(f).connect(g).connect(AC.destination);
  n.start(t); n.stop(t + 0.1);
}

// 88BPM・8分音符ステップ。ブーンバップの基本形
let beatNextT = 0;
let beatStep = 0;
const BEAT_8TH = 60 / 88 / 2; // ≒0.34s

function scheduleBeat() {
  if (!AC) return;
  const now = AC.currentTime;
  if (beatNextT < now - 0.5) { beatNextT = now + 0.05; } // 中断後の再開
  while (beatNextT < now + 0.35) {
    const s = beatStep % 8;
    if (s === 0 || s === 5) drumKick(beatNextT);      // ドッ ・・ ドッ
    if (s === 2 || s === 6) drumSnare(beatNextT);     // スネアは2・4拍
    drumHat(beatNextT, s === 7);                      // ハットは刻み、小節末はオープン
    beatNextT += BEAT_8TH;
    beatStep++;
  }
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

// ===== 実況テキスト =====
// 各国の実況風ゴールコール (英/西/葡/伊)
const GOAL_BANNERS = ['GOOOOAL!!', '¡GOLAZO!!', 'GOLAÇO!!', 'CHE GOL!!', '¡GOOOOOL!!', 'MAMMA MIA!!', 'BELLISSIMO!!'];
const BLOW_BANNERS = ['SMAAASH!!', '¡BOMBAZO!!', 'KNOCKOUT!!'];
const DEMOLISH_BANNERS = ['GOAL BREAKER!!', 'DEMOLITION!!', 'NO MERCY!!'];

// One Shot スピリットのオリジナルライン (狙い中)
const AIM_LINES = [
  'ONE SHOT. 一発で決めろ。',
  '逃せば終わり。掴めば伝説。',
  'チャンスは一度。二度は無い。',
  '心臓の音だけが聞こえる。',
  'Yo. 世界はお前の一撃を待ってる。',
  '震えてもいい。前に蹴れ。',
];
const RETRY_LINES = ['まだ立てるだろ。Get up.', '外した過去より、次の一撃。'];
const LAST_CHANCE_LINE = 'ラストチャンス。全部この一発に置いてけ。';
const ANNOUNCE_LINES = [
  '─ これを決めれば、勝利 ─',
  '─ SEIZE THE MOMENT ─',
  '─ 一度きり。決めるのはお前だ ─',
  '─ NOW OR NEVER ─',
];

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
  const loopPrefix = loopCount >= 1 ? `${loopCount + 1}周目 ` : '';
  roundEl.textContent = `${loopPrefix}第${stageIdx + 1}戦`;
  heartsEl.textContent = '❤️'.repeat(hearts) + '🖤'.repeat(3 - hearts);
  bestEl.textContent = best > 0 ? scoreLabel(best) : '—';
}

function beginGame() {
  stats.plays++;
  saveMeta();
  stageIdx = startStage;
  hearts = 3;
  loopCount = 0;
  loopMissed = false;
  goalBroken = false;
  keeperFX = null;
  shot = null;
  particles = [];
  startOverlay.classList.add('hidden');
  overOverlay.classList.add('hidden');
  updateHUD();
  showIntro();
}

function showIntro(newLoop) {
  const k = K();
  state = STATE.INTRO;
  shot = null;
  plan = null;
  keeperFX = null;
  goalBroken = false;
  const loopPrefix = loopCount >= 1 ? `${loopCount + 1}周目 ` : '';
  introRoundEl.textContent = newLoop
    ? `🏆 優勝!! そして${loopCount + 1}周目へ…`
    : `${loopPrefix}第${stageIdx + 1}戦・${k.round}`;
  introCountryEl.textContent = `VS ${k.country}`;
  introKeeperEl.textContent = `${k.emoji} GK ${k.name}`;
  introLineEl.textContent = `${k.intro[0]}${k.intro[1]}`;
  document.querySelector('.intro-announce').textContent = newLoop
    ? '─ 世界は、二度目の伝説を求めた ─'
    : pick(ANNOUNCE_LINES);
  introOverlay.classList.remove('hidden');
  updateHUD();
}

function enterAim() {
  introOverlay.classList.add('hidden');
  state = STATE.AIM_DIR;
  plan = { angle: 0, speed: 0, size: 0 };
  phaseStart = timeNow;
  shot = null;
  hintEl.textContent = pick(AIM_LINES);
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
  return Math.sin(((timeNow - phaseStart) / (1400 / gaugeSpeedup())) * Math.PI * 2) * maxA;
}
function currentSpeed() { return tri(timeNow - phaseStart, 950 / gaugeSpeedup()); }
function currentSize() { return tri(timeNow - phaseStart, 650 / gaugeSpeedup()); }

function doShoot() {
  const e = K(); // キーパーの強さは周回で変わらない (難化はゲージ速度で表現)
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
  const moved = Math.max(0, flightMs - e.reactMs) * e.diveSpeed * L.goalHalf;
  const delta = diveTargetX - x0;
  const arrivalX = x0 + Math.max(-moved, Math.min(moved, delta));
  const reached = Math.abs(arrivalX - targetX) < e.reach * L.goalHalf + ballDrawR * 0.8;

  let outcome;
  if (Math.abs(off) > L.goalHalf - L.postW) {
    outcome = 'wide';
  } else if (size >= 0.95 && ballPower > e.power) {
    outcome = 'demolish';
  } else if (ballPower > e.power && reached) {
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
    reactMs: e.reactMs, diveSpeed: e.diveSpeed,
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
    // 周回クリア → 優勝演出をはさんで次の周へ (少し強くなった世界)
    stats.clears++;
    if (!loopMissed) stats.noMissClears++;
    saveMeta();
    loopCount++;
    stageIdx = 0;
    // ハートは回復しない (1ランを通して3ミスまで)
    loopMissed = false;
    setTimeout(() => {
      showBanner('WORLD CHAMPION!!', '#f2b90c');
      burstConfetti(W / 2, H * 0.35, 120);
      playGoal();
    }, 700);
    setTimeout(() => {
      updateHUD();
      showIntro(true);
    }, 2300);
  } else {
    setTimeout(() => showIntro(), 500);
  }
}

function resolveShot() {
  const k = K();
  const o = shot.outcome;

  // 図鑑・実績の記録
  if (o === 'demolish' || o === 'blow' || o === 'goal') {
    stats.goals++;
    if (o === 'blow') stats.blows++;
    if (o === 'demolish') { stats.demolishes++; stats.blows++; }
    // パネンカ: ど真ん中への軽いシュートを沈めた
    if (o === 'goal' && Math.abs(shot.tx - L.cx) < L.goalHalf * 0.18 && shot.speed <= 0.45) {
      stats.panenkas++;
    }
    zukan.add(stageIdx);
    saveMeta();
  }
  if (o === 'wide') {
    stats.wides++;
    saveMeta();
  }

  if (o === 'demolish') {
    goalBroken = true;
    keeperFX = { type: 'demolish', dir: shot.tx >= L.cx ? 1 : -1, startT: timeNow, fromX: shot.arrivalX };
    burstGoalPieces();
    burstConfetti(shot.tx, shot.ty, 90);
    fx.shake = 1.6;
    fx.flash = 1;
    showBanner(pick(DEMOLISH_BANNERS), '#ffc93c');
    speak(k.blown, 2200);
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
    showBanner(pick(BLOW_BANNERS), '#ffc93c');
    speak(k.blown, 2000);
    playBlow(false);
    vibrate([40, 30, 80]);
    state = STATE.GOAL;
    setTimeout(() => nextStage(), 1700);
  } else if (o === 'goal') {
    burstConfetti(shot.tx, shot.ty, 60);
    fx.netShake = 1;
    fx.flash = 1;
    showBanner(pick(GOAL_BANNERS), '#ffc93c');
    speak(k.hit, 2000);
    playGoal();
    vibrate([30, 40, 60]);
    state = STATE.GOAL;
    setTimeout(() => nextStage(), 1500);
  } else {
    // save / wide → ハート-1
    hearts--;
    loopMissed = true;
    updateHUD();
    fx.shake = 0.7;
    showBanner(o === 'save' ? 'SAVED!!' : 'WIDE!!', '#ff5a48');
    speak(o === 'save' ? k.save : k.mock, 2000);
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
          hintEl.textContent = hearts === 1 ? LAST_CHANCE_LINE : pick(RETRY_LINES);
          hintEl.classList.add('show');
        }
      }, 1400);
    } else {
      endGame();
    }
  }
}

function endGame() {
  state = STATE.OVER;
  const sc = currentScore();
  if (sc > best) {
    best = sc;
    try { localStorage.setItem('pk_best2', String(best)); } catch (e) {}
  }
  setTimeout(() => {
    const k = K();
    const loopPrefix = loopCount >= 1 ? `${loopCount + 1}周目 ` : '';
    overOverlay.classList.toggle('clear', loopCount >= 1); // 2周目以降で散っても金色の敬意を
    overHeadEl.textContent = loopCount >= 1 ? '伝説、ここに眠る。' : '日本、ここで散る…';
    overReasonEl.textContent = `${loopPrefix}第${stageIdx + 1}戦 ${k.name} に敗北`;
    overCommentEl.textContent = `${k.save[0]}${k.save[1]}`;
    overTapEl.textContent = 'タップで再挑戦';
    rankTitleEl.textContent = rankTitle(totalBeaten());
    overScoreEl.textContent = scoreLabel(sc);
    overBestEl.textContent = scoreLabel(best);
    top10Badge.classList.add('hidden');
    overOverlay.classList.remove('hidden');
    updateHUD();
    autoSubmitScore(sc);
  }, 1000);
}

// 1体以上抜いていたら自動でランキングに送信。TOP10入りならバッジ+自動表示
async function autoSubmitScore(score) {
  if (score < 1 || !savedName) return;
  try {
    const r = await fetch(API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: savedName, score }),
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
    // キックモーションを挟んでから発射
    hintEl.classList.remove('show');
    state = STATE.KICK;
    kickAnim = { startT: timeNow };
  }
});
window.addEventListener('contextmenu', (e) => e.preventDefault());

startOverlay.addEventListener('click', () => {
  ensureAudio();
  const name = nameInput.value.trim().slice(0, 10);
  if (!name) {
    startTapEl.textContent = '⚠️ せんしゅ名を入れて出場登録!';
    nameInput.focus();
    return;
  }
  savedName = name;
  const num = parseInt(numberInput.value, 10);
  playerNumber = num >= 1 && num <= 99 ? num : 10;
  numberInput.value = String(playerNumber);
  try {
    localStorage.setItem('pk_name', name);
    localStorage.setItem('pk_number', String(playerNumber));
  } catch (e) {}
  beginGame();
});
nameInput.addEventListener('click', (e) => e.stopPropagation());
nameInput.addEventListener('pointerdown', (e) => e.stopPropagation());
numberInput.addEventListener('click', (e) => e.stopPropagation());
numberInput.addEventListener('pointerdown', (e) => e.stopPropagation());
overOverlay.addEventListener('click', () => { ensureAudio(); beginGame(); });
introOverlay.addEventListener('click', () => { ensureAudio(); enterAim(); });
showZukanBtn.addEventListener('click', (e) => { e.stopPropagation(); openZukan(); });
document.getElementById('back-portal').addEventListener('click', (e) => e.stopPropagation());
document.getElementById('back-title').addEventListener('click', (e) => {
  e.stopPropagation();
  goTitle();
});

function goTitle() {
  state = STATE.TITLE;
  stageIdx = startStage;
  loopCount = 0;
  hearts = 3;
  shot = null;
  plan = null;
  keeperFX = null;
  goalBroken = false;
  overOverlay.classList.add('hidden');
  introOverlay.classList.add('hidden');
  updateHUD();
  startOverlay.classList.remove('hidden');
}
zukanOverlay.addEventListener('click', (e) => {
  e.stopPropagation();
  zukanOverlay.classList.add('hidden');
});

// ===== オンラインランキング =====
const API = '/api/scores';
let savedName = '';
let playerNumber = 10;
try {
  savedName = localStorage.getItem('pk_name') || '';
  playerNumber = parseInt(localStorage.getItem('pk_number') || '10', 10) || 10;
} catch (e) {}
nameInput.value = savedName;
numberInput.value = String(playerNumber);

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
rankOverlay.addEventListener('click', (e) => {
  e.stopPropagation();
  rankOverlay.classList.add('hidden');
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
    // ダイブ(判定と同じ式・周回補正込みの値をshotから使う)
    const el = Math.min(shot.t, shot.dur);
    const moved = Math.max(0, el - shot.reactMs) * shot.diveSpeed * L.goalHalf;
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

  drawSoccerBall(x, y, r, shot ? timeNow / 90 : 0);
}

// 本物っぽいサッカーボール(五角形パターン+立体感、rotで転がる)。装備スキンの配色で描く
function drawSoccerBall(x, y, r, rot) {
  const skin = BALL_SKINS[equippedBall] || BALL_SKINS.classic;
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  // 球体の陰影
  const g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1);
  g.addColorStop(0, skin.base[0]);
  g.addColorStop(0.7, skin.base[1]);
  g.addColorStop(1, skin.base[2]);
  ctx.fillStyle = g;
  ctx.fillRect(x - r, y - r, r * 2, r * 2);

  const pent = (px, py, pr, a) => {
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
      const th = a + (i * Math.PI * 2) / 5 - Math.PI / 2;
      const vx = px + Math.cos(th) * pr;
      const vy = py + Math.sin(th) * pr;
      if (i === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
  };

  // 中央の五角形(回転で少し流れる)
  const cxp = x + Math.cos(rot) * r * 0.16;
  const cyp = y + Math.sin(rot * 0.7) * r * 0.1;
  ctx.fillStyle = skin.pattern;
  pent(cxp, cyp, r * 0.3, rot * 0.6);
  ctx.fill();

  // 周囲の五角形(球の縁で見切れる)+縫い目
  ctx.strokeStyle = skin.pattern;
  ctx.lineWidth = Math.max(1, r * 0.05);
  for (let i = 0; i < 5; i++) {
    const a = rot * 0.6 + (i * Math.PI * 2) / 5;
    const px = cxp + Math.cos(a) * r * 0.88;
    const py = cyp + Math.sin(a) * r * 0.88;
    ctx.fillStyle = skin.pattern;
    pent(px, py, r * 0.26, a + 0.5);
    ctx.fill();
    ctx.globalAlpha = 0.45;
    ctx.beginPath();
    ctx.moveTo(cxp + Math.cos(a) * r * 0.3, cyp + Math.sin(a) * r * 0.3);
    ctx.lineTo(px - Math.cos(a) * r * 0.24, py - Math.sin(a) * r * 0.24);
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.restore();

  ctx.strokeStyle = 'rgba(0, 0, 0, 0.3)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
}

// 日本代表・背番号10のキッカー(背面ビュー)
function drawKicker() {
  if (state === STATE.TITLE) return;
  const sz = L.goalH * 1.0;
  const w = sz * 0.34;
  const inAim = state === STATE.AIM_DIR || state === STATE.AIM_POWER || state === STATE.AIM_SIZE || state === STATE.INTRO;
  const kicking = state === STATE.KICK || (state === STATE.SHOOT && shot && shot.t < 300);
  const celebrating = state === STATE.GOAL;
  const dejected = state === STATE.OVER || state === STATE.RETRY;

  let kickP = 0;
  if (state === STATE.KICK && kickAnim) kickP = Math.min((timeNow - kickAnim.startT) / 350, 1);
  else if (state === STATE.SHOOT) kickP = 1;

  let x = L.ballX - L.ballR * 2.6 + kickP * L.ballR * 1.2;
  const baseY = L.ballY + L.ballR * 1.7;
  const bob = inAim ? Math.sin(timeNow / 300) * sz * 0.015 : 0;

  ctx.save();
  ctx.translate(x, baseY + bob);
  if (kicking) ctx.rotate(-0.08); // 前傾

  // 軸足(左)
  ctx.strokeStyle = '#ffcf9e';
  ctx.lineWidth = w * 0.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-w * 0.16, -sz * 0.3);
  ctx.lineTo(-w * 0.26, 0);
  ctx.stroke();

  // 蹴り足(右): 構え→振りかぶり→振り抜き
  const swing = kicking ? -0.9 + kickP * 2.1 : 0.14;
  const legLen = sz * 0.33;
  const fx2 = w * 0.16 + Math.sin(swing) * legLen;
  const fy2 = -sz * 0.3 + Math.cos(swing) * legLen;
  ctx.beginPath();
  ctx.moveTo(w * 0.16, -sz * 0.3);
  ctx.lineTo(fx2, fy2);
  ctx.stroke();

  // 靴下+シューズ
  ctx.fillStyle = '#26221f';
  ctx.beginPath();
  ctx.arc(fx2, fy2, w * 0.15, 0, Math.PI * 2);
  ctx.arc(-w * 0.26, 0, w * 0.15, 0, Math.PI * 2);
  ctx.fill();

  // パンツ(白)
  ctx.fillStyle = '#f5f5f5';
  ctx.beginPath();
  ctx.roundRect(-w * 0.34, -sz * 0.42, w * 0.68, sz * 0.14, w * 0.08);
  ctx.fill();

  // ユニフォーム(装備スキンの色)
  const uni = UNIFORM_SKINS[equippedUniform] || UNIFORM_SKINS.samurai;
  ctx.fillStyle = uni.shirt;
  ctx.beginPath();
  ctx.roundRect(-w * 0.38, -sz * 0.7, w * 0.76, sz * 0.31, w * 0.12);
  ctx.fill();

  // 腕
  ctx.strokeStyle = uni.shirt;
  ctx.lineWidth = w * 0.17;
  const aLen = w * 0.6;
  let armAngle = 0.35; // 通常: やや開いて下げる
  if (celebrating) armAngle = 2.2;   // バンザイ
  else if (kicking) armAngle = 1.0;  // バランス取り
  else if (dejected) armAngle = 0.1; // だらり
  for (const s of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(s * w * 0.32, -sz * 0.66);
    ctx.lineTo(
      s * (w * 0.32 + Math.cos(armAngle) * aLen),
      -sz * 0.66 + (celebrating ? -Math.sin(armAngle - 1.2) * aLen : Math.sin(0.8 - armAngle * 0.4) * aLen)
    );
    ctx.stroke();
  }

  // 背番号10
  ctx.fillStyle = uni.number;
  ctx.font = `800 ${Math.round(sz * 0.15)}px 'M PLUS Rounded 1c', sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(playerNumber), 0, -sz * 0.55);

  // 頭(うなだれると下がる)+黒髪(背面)
  const headY = dejected ? -sz * 0.76 : -sz * 0.82;
  ctx.fillStyle = '#ffcf9e';
  ctx.beginPath();
  ctx.arc(0, headY, sz * 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#1d1820';
  ctx.beginPath();
  ctx.arc(0, headY - sz * 0.012, sz * 0.1, Math.PI * 0.95, Math.PI * 2.05);
  ctx.fill();

  ctx.restore();
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

  // キックモーション → 発射
  if (state === STATE.KICK && kickAnim && timeNow - kickAnim.startT >= 350) {
    doShoot();
  }

  // シュート進行
  if (shot && !shot.resolved) {
    shot.t += dt;
    if (shot.t >= shot.dur) {
      shot.t = shot.dur;
      shot.resolved = true;
      resolveShot();
    }
  }

  // 狙い中はビートを流す。ラスト1ハートは心臓の鼓動も重なる
  if ((state === STATE.AIM_DIR || state === STATE.AIM_POWER || state === STATE.AIM_SIZE) && AC) {
    scheduleBeat();
    if (hearts === 1) heartbeat();
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
  drawKicker();
  drawGauges();
  drawParticles();
  drawFlash();
  drawVignette();
  ctx.restore();

  requestAnimationFrame(loop);
}
updateHUD();
requestAnimationFrame(loop);
