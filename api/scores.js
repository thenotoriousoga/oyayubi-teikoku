import { Redis } from '@upstash/redis';

const KEY = 'pk:ranking';

const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const redis = url && token ? new Redis({ url, token }) : null;

// Redis未接続時(ローカル開発など)はメモリに保存する
const mem = (globalThis.__pkScores ??= new Map());

function sanitizeName(raw) {
  if (typeof raw !== 'string') return null;
  const name = raw.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 10);
  return name.length ? name : null;
}

async function getTop() {
  if (redis) {
    const flat = await redis.zrange(KEY, 0, 9, { rev: true, withScores: true });
    const top = [];
    for (let i = 0; i < flat.length; i += 2) {
      top.push({ name: String(flat[i]), score: Number(flat[i + 1]) });
    }
    return top;
  }
  return [...mem.entries()]
    .map(([name, score]) => ({ name, score }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 10);
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      return res.status(200).json({ top: await getTop() });
    }
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});
      const name = sanitizeName(body.name);
      const score = body.score;
      if (!name || !Number.isInteger(score) || score < 1 || score > 999) {
        return res.status(400).json({ error: 'invalid' });
      }
      if (redis) {
        // 同じ名前は自己ベストのみ保持
        await redis.zadd(KEY, { gt: true }, { score, member: name });
      } else if (!mem.has(name) || mem.get(name) < score) {
        mem.set(name, score);
      }
      return res.status(200).json({ top: await getTop() });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'method not allowed' });
  } catch (e) {
    return res.status(500).json({ error: 'server error' });
  }
}
