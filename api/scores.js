import { Redis } from '@upstash/redis';

// ゲームごとにランキングキーとスコア上限を分ける (game 未指定は pk = 後方互換)
const GAMES = {
  pk:   { key: 'pk:ranking:v2',   max: 999 },
  rap:  { key: 'rap:ranking:v1',  max: 9_999_999 },
  cake: { key: 'cake:ranking:v1', max: 999 },
  kick: { key: 'kick:ranking:v1', max: 999 },
  ruru: { key: 'ruru:ranking:v1', max: 999 },
};

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

// Redis未接続時(ローカル開発など)はメモリに保存する
const mem = (globalThis.__pkScores ??= new Map());
function memOf(game) {
  if (!mem.has(game)) mem.set(game, new Map());
  return mem.get(game);
}

function gameOf(req, body) {
  const q = new URL(req.url, 'http://localhost').searchParams.get('game');
  const g = (body && body.game) || q;
  return Object.hasOwn(GAMES, g) ? g : 'pk';
}

function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 10);
  return name.length ? name : null;
}

// rap: 自己ベスト時の散り際地点 (name → 距離m)。TOP10のマーカー表示に使う
const DEATHS_KEY = 'rap:deaths:v1';
const memDeaths = (globalThis.__rapDeaths ??= new Map());

async function getTop(game) {
  let top;
  if (redis) {
    const flat = await redis.zrange(GAMES[game].key, 0, 9, { rev: true, withScores: true });
    top = [];
    for (let i = 0; i < flat.length; i += 2) {
      top.push({ name: String(flat[i]), score: Number(flat[i + 1]) });
    }
  } else {
    top = [...memOf(game).entries()]
      .map(([name, score]) => ({ name, score }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);
  }
  if (game === 'rap' && top.length) {
    if (redis) {
      const dists = await redis.hmget(DEATHS_KEY, ...top.map((e) => e.name));
      for (const e of top) {
        const d = dists ? dists[e.name] : null;
        if (d != null) e.dist = Number(d);
      }
    } else {
      for (const e of top) {
        if (memDeaths.has(e.name)) e.dist = memDeaths.get(e.name);
      }
    }
  }
  return top;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ top: await getTop(gameOf(req, null)) });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const game = gameOf(req, body);
      const name = sanitizeName(body.name);
      const score = body.score;
      if (!name || !Number.isInteger(score) || score < 1 || score > GAMES[game].max) {
        return res.status(400).json({ error: 'invalid' });
      }
      // rap: 散り際地点 (任意)。自己ベスト更新時だけ保存する
      const dist = Number.isInteger(body.dist) && body.dist >= 0 && body.dist <= GAMES[game].max
        ? body.dist : null;
      if (redis) {
        // 同じ名前は自己ベストのみ保持
        const prev = game === 'rap' && dist != null ? await redis.zscore(GAMES[game].key, name) : null;
        await redis.zadd(GAMES[game].key, { gt: true }, { score, member: name });
        if (game === 'rap' && dist != null && (prev == null || score > Number(prev))) {
          await redis.hset(DEATHS_KEY, { [name]: dist });
        }
      } else {
        const m = memOf(game);
        if (!m.has(name) || m.get(name) < score) {
          m.set(name, score);
          if (game === 'rap' && dist != null) memDeaths.set(name, dist);
        }
      }
      return res.status(200).json({ top: await getTop(game) });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'server error' });
  }
}
