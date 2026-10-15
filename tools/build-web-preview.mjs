// オンラインのテスト版（Claude の Artifact で公開する用）を dist/web-preview/ に作る。
// アプリ版との違い：フォントは同梱せず Google Fonts から読む（公開ページのファイル数を抑えるため）。
//   node tools/build-web-preview.mjs
import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'dist', 'web-preview');
const FONTS = 'https://fonts.googleapis.com/css2?family=Shippori+Mincho:wght@400;700&family=Yuji+Syuku&display=swap';

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const html = readFileSync(join(root, 'index.html'), 'utf8');
const title = html.match(/<title>[^<]*<\/title>/)[0];
const body = html.slice(html.indexOf('<body>') + 6, html.indexOf('</body>'))
  .replace(/\s*<!-- iOS \/ Android でプラグインを呼ぶ[^\n]*\n\s*<script src="js\/capacitor.js"><\/script>/, '');
// 公開ページは <html>/<head>/<body> を自動で付けるので中身だけ書く
writeFileSync(join(out, 'index.html'), `${title}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${FONTS}">
<link rel="stylesheet" href="css/style.css">
${body.trim()}
`);

const files = ['css/style.css', 'js/main.js', 'js/viewport.js', 'js/hit.js', 'js/audio.js', 'js/storage.js', 'js/platform.js'];
const walk = (d) => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
files.push(...walk(join(root, 'requests')).map((f) => relative(root, f)));
for (const f of files) {
  mkdirSync(dirname(join(out, f)), { recursive: true });
  cpSync(join(root, f), join(out, f));
}
writeFileSync(join(out, 'files.json'), JSON.stringify(files, null, 2));
console.log(`dist/web-preview/ を作成しました（${files.length + 1} ファイル）`);
