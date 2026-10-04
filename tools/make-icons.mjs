// icon.svg から PNG アイコン（PWA / iOS ホーム画面用）を書き出す。
// 実行: node tools/make-icons.mjs   （playwright が必要）
import { chromium } from 'playwright';
import { readFileSync } from 'node:fs';

const svg = readFileSync(new URL('../icon.svg', import.meta.url), 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(`<style>body{margin:0}svg{display:block;width:${size}px;height:${size}px}</style>${svg}`);
  await page.screenshot({ path: new URL(`../icons/${name}`, import.meta.url).pathname });
}
await browser.close();
