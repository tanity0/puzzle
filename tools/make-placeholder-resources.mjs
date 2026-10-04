// 仮のアイコン・スプラッシュ画像を resources/ に書き出す（本番素材ができたら上書きする）。
//   node tools/make-placeholder-resources.mjs && npm run assets
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const res = (f) => new URL(`../resources/${f}`, import.meta.url).pathname;
const face = readFileSync(res('icon-source.svg'), 'utf8')
  .replace(/<rect width="512" height="512" fill="#0b0908"\/>/, '');
const full = readFileSync(res('icon-source.svg'), 'utf8');

const browser = await chromium.launch();
const page = await browser.newPage();

async function shot(file, w, h, body, transparent = false) {
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<style>html,body{margin:0;width:${w}px;height:${h}px;background:${transparent ? 'transparent' : '#0b0908'};display:grid;place-items:center;overflow:hidden}svg{display:block}</style>${body}`);
  await page.screenshot({ path: res(file), omitBackground: transparent });
}

await shot('icon-only.png', 1024, 1024, full.replace('<svg ', '<svg width="1024" height="1024" '));
await shot('desktop/icon.png', 1024, 1024, full.replace('<svg ', '<svg width="1024" height="1024" '));
// アダプティブアイコンの前景は中央 66% に収める
await shot('icon-foreground.png', 1024, 1024, face.replace('<svg ', '<svg width="676" height="676" '), true);
await shot('icon-background.png', 1024, 1024, '');
const splash = `<div style="text-align:center;color:#e9e4d8;font:400 160px serif;letter-spacing:.15em">かくれさま<div style="color:#b3262b;font-size:56px;letter-spacing:.6em;margin-top:24px">朧屋敷の神隠し</div></div>`;
await shot('splash.png', 2732, 2732, splash);
await shot('splash-dark.png', 2732, 2732, splash);
await browser.close();
console.log('resources/ に仮素材を書き出しました');
