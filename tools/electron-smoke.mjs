// PC 版（Electron）が起動し、ゲームが遊べる状態になるかを確かめる。
//   npm run build && xvfb-run -a node tools/electron-smoke.mjs [出力フォルダ]
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { _electron as electron } from 'playwright';

// スクリーンショットの保存先（省略時は一時フォルダ）
const OUT = process.argv[2] || mkdtempSync(join(tmpdir(), 'kakuresama-'));
const errors = [];
const app = await electron.launch({ args: ['.', '--no-sandbox'], env: { ...process.env, ELECTRON_ENABLE_LOGGING: '1' } });
const win = await app.firstWindow();
win.on('pageerror', (e) => errors.push(e.message));
win.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await win.waitForSelector('#btn-start');
await win.waitForTimeout(800);
const platform = await win.evaluate(() => document.documentElement.dataset.platform);
if (platform !== 'desktop') errors.push(`platform が desktop ではない: ${platform}`);
const fontOk = await win.evaluate(async () => {
  await document.fonts.ready;
  return document.fonts.check('16px "Yuji Syuku"', 'かくれさま');
});
if (!fontOk) errors.push('同梱フォントが読み込めない');
await win.screenshot({ path: `${OUT}/electron-title.png` });
await win.click('#btn-start');
await win.click('#btn-story-skip');
await win.waitForSelector('#screen-play.active');
await win.waitForTimeout(800);
await win.screenshot({ path: `${OUT}/electron-play.png` });
const items = await win.$$eval('#item-list li', (l) => l.length);
if (!items) errors.push('アイテム一覧が空');
await app.close();
if (errors.length) {
  console.log(`NG\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('OK');
