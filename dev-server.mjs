// ローカル開発用サーバー: 静的ファイル + /api/scores (Vercel Functionと同じハンドラを使用)
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import scoresHandler from './api/scores.js';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8321;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://localhost');

  if (u.pathname === '/api/scores') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    req.body = raw;
    // Vercelのres.status().json()ヘルパーを模倣
    res.status = (c) => { res.statusCode = c; return res; };
    res.json = (o) => {
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.end(JSON.stringify(o));
      return res;
    };
    return scoresHandler(req, res);
  }

  let p = decodeURIComponent(u.pathname);
  if (p.endsWith('/')) p += 'index.html';
  const file = normalize(join(ROOT, p));
  if (!file.startsWith(normalize(ROOT))) {
    res.statusCode = 403;
    return res.end();
  }
  try {
    const data = await readFile(file);
    res.setHeader('Content-Type', MIME[extname(file).toLowerCase()] || 'application/octet-stream');
    res.end(data);
  } catch {
    res.statusCode = 404;
    res.end('Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`dev server: http://localhost:${PORT}/`);
});
