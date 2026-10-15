// 開発用サーバー。リポジトリ直下を優先し、無いファイル（同梱フォント等）は www/ から返す。
//   node tools/serve.mjs [port]
//   http://localhost:8000/           ゲーム
//   http://localhost:8000/editor.html シーンエディタ
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.argv[2] || process.env.PORT || 8000);
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript',
  '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.woff2': 'font/woff2',
  '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg', '.txt': 'text/plain; charset=utf-8',
};

async function find(path) {
  for (const base of [root, join(root, 'www')]) {
    const file = normalize(join(base, path));
    if (!file.startsWith(base)) return null;
    try {
      if ((await stat(file)).isFile()) return file;
    } catch { /* 次を探す */ }
  }
  return null;
}

createServer(async (req, res) => {
  let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path.endsWith('/')) path += 'index.html';
  const file = await find(path);
  if (!file) {
    res.writeHead(404).end('not found');
    return;
  }
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  res.end(await readFile(file));
}).listen(port, () => console.log(`http://localhost:${port}/`));
