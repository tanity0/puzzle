// アプリに同梱するファイルを www/ にまとめる（Capacitor と Electron の両方がここを読む）。
// エディタや開発用ファイルは含めない。
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'www');

const GAME_FILES = [
  'index.html',
  'css/style.css',
  'js/main.js',
  'js/viewport.js',
  'js/hit.js',
  'js/audio.js',
  'js/storage.js',
  'js/platform.js',
];
const GAME_DIRS = ['requests', 'assets'];

// 同梱フォント（SIL Open Font License 1.1）。使う太さだけ入れる。
const FONTS = [
  { pkg: 'shippori-mincho', weights: ['400', '700'] },
  { pkg: 'yuji-syuku', weights: ['400'] },
];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const f of GAME_FILES) {
  mkdirSync(dirname(join(out, f)), { recursive: true });
  cpSync(join(root, f), join(out, f));
}
for (const d of GAME_DIRS) {
  if (existsSync(join(root, d))) cpSync(join(root, d), join(out, d), { recursive: true });
}

// Capacitor のプラグイン呼び出し（registerPlugin）に必要な実行時ライブラリ。バンドラーを使わないので直接置く
cpSync(join(root, 'node_modules/@capacitor/core/dist/capacitor.js'), join(out, 'js/capacitor.js'));

const fontDir = join(out, 'fonts');
mkdirSync(join(fontDir, 'files'), { recursive: true });
let css = '';
for (const { pkg, weights } of FONTS) {
  const src = join(root, 'node_modules', '@fontsource', pkg);
  for (const w of weights) {
    // woff2 だけ使う（対応していない WebView はない）
    const text = readFileSync(join(src, `${w}.css`), 'utf8').replace(/,\s*url\([^)]*\.woff\) format\('woff'\)/g, '');
    for (const m of text.matchAll(/url\(\.\/files\/([^)]+\.woff2)\)/g)) {
      cpSync(join(src, 'files', m[1]), join(fontDir, 'files', m[1]));
    }
    css += text;
  }
  cpSync(join(src, 'LICENSE'), join(fontDir, `LICENSE-${pkg}.txt`));
}
writeFileSync(join(fontDir, 'fonts.css'), css);

console.log(`www/ を作成しました`);
