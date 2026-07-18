import { Redis } from '@upstash/redis';

// ゲームごとにランキングキーとスコア上限を分ける (game 未指定は pk = 後方互換)
const GAMES = {
  pk:  { key: 'pk:ranking:v2',  max: 999 },
  rap: { key: 'rap:ranking:v1', max: 9_999_999 },
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

async function getTop(game) {
  if (redis) {
    const flat = await redis.zrange(GAMES[game].key, 0, 9, { rev: true, withScores: true });
    const top = [];
    for (let i = 0; i < flat.length; i += 2) {
      top.push({ name: String(flat[i]), score: Number(flat[i + 1]) });
    }
    return top;
  }
  return [...memOf(game).entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
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
      if (redis) {
        // 同じ名前は自己ベストのみ保持
        await redis.zadd(GAMES[game].key, { gt: true }, { score, member: name });
      } else {
        const m = memOf(game);
        if (!m.has(name) || m.get(name) < score) m.set(name, score);
      }
      return res.status(200).json({ top: await getTop(game) });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'server error' });
  }
}
