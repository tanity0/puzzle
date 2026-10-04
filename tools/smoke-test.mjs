// ゲームを自動で1周遊ぶスモークテスト（開発サーバーは自動で起動する）。
// 実行: npm test   または   node tools/smoke-test.mjs [スクリーンショット出力フォルダ]
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';

const PORT = 8765;
const BASE = process.env.BASE || `http://localhost:${PORT}/`;
const server = process.env.BASE ? null : spawn(process.execPath, [new URL('./serve.mjs', import.meta.url).pathname, String(PORT)], { stdio: 'ignore' });
for (let i = 0; i < 50; i++) {
  try {
    await fetch(BASE);
    break;
  } catch {
    await new Promise((r) => setTimeout(r, 100));
  }
}
// スクリーンショットの保存先（省略時は一時フォルダ）
const OUT = process.argv[2] || mkdtempSync(join(tmpdir(), 'kakuresama-'));
const errors = [];

async function run(name, viewport, opts = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, hasTouch: !!opts.touch, isMobile: !!opts.touch, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  // 外部フォント取得の失敗はテスト環境のネットワーク事情なので除外
  page.on('console', (m) => m.type() === 'error' && !/ERR_CERT|fonts\.g|404/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));

  await page.goto(BASE);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-1-title.png` });

  await page.click('#btn-start');
  await page.waitForTimeout(800);
  await page.screenshot({ path: `${OUT}/${name}-2-story.png` });
  await page.click('#btn-story-skip');
  await page.waitForSelector('#screen-play.active');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}-3-play.png` });

  // 全体表示まで引く
  // タッチ端末ではズームボタンが非表示なので直接 click() を呼ぶ
  const zoomOut = () => page.$eval('#btn-zoom-out', (b) => b.click());
  for (let i = 0; i < 4; i++) await zoomOut();
  await page.waitForTimeout(500);

  const scene = await (await page.request.get(`${BASE}scenes/ch1/scene.json`)).json();
  const targets = await page.$$eval('#item-list li', (lis) => lis.map((l) => l.dataset.id));
  if (targets.length !== scene.pick) errors.push(`${name}: 出題数 ${targets.length} != ${scene.pick}`);

  const toScreen = (cx, cy) => page.evaluate(([x, y]) => {
      const m = getComputedStyle(document.querySelector('#content')).transform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
      const r = document.querySelector('#stage').getBoundingClientRect();
      return { x: r.left + m[4] + x * m[0], y: r.top + m[5] + y * m[3] };
    }, [cx, cy]);
  const pos = (id) => {
    const it = scene.items.find((i) => i.id === id);
    const c = it.coords;
    const [cx, cy] = it.shape === 'circle' ? [c[0], c[1]]
      : it.shape === 'poly' ? [c[0] + 4, c[1] + 40]
      : [c[0] + c[2] / 2, c[1] + c[3] / 2];
    return toScreen(cx, cy);
  };

  // ヒントを1回使う
  await page.click('#btn-hint');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}-4-hint.png` });
  for (let i = 0; i < 2; i++) await zoomOut();
  await page.waitForTimeout(500);

  // 見誤り5回で驚かし
  for (let i = 0; i < 5; i++) {
    const tap = await toScreen(470, 650); // 何もない畳
    if (opts.touch) await page.touchscreen.tap(tap.x, tap.y); else await page.mouse.click(tap.x, tap.y);
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(250);
  const scared = await page.$eval('#scare', (el) => el.classList.contains('show'));
  if (!scared) errors.push(`${name}: 驚かしが発生しない`);
  await page.screenshot({ path: `${OUT}/${name}-5-scare.png` });
  await page.waitForTimeout(1800);

  for (const id of targets) {
    const p = await pos(id);
    if (opts.touch) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
    await page.waitForTimeout(150);
    const found = await page.$eval(`#item-list li[data-id="${id}"]`, (li) => li.classList.contains('found'));
    if (!found) errors.push(`${name}: ${id} を見つけられない`);
    if (id === targets[Math.floor(targets.length / 2)]) await page.screenshot({ path: `${OUT}/${name}-6-midway.png` });
  }
  await page.waitForSelector('#screen-result.active', { timeout: 5000 }).catch(() => errors.push(`${name}: 結果画面に行かない`));
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}-7-result.png` });

  await page.click('#btn-next');
  await page.waitForTimeout(500);
  await page.click('#btn-story-skip');
  await page.waitForTimeout(400);
  await page.click('#btn-story-skip').catch(() => {});
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}-8-after.png` });
  await page.click('#btn-select').catch(() => {});
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-9-select.png` });
  await browser.close();
}

async function runEditor() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => errors.push(`editor: ${e.message}`));
  await page.goto(`${BASE}editor.html`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#server-scenes option[value="ch1"]', { state: 'attached' });
  await page.selectOption('#server-scenes', 'ch1');
  await page.waitForSelector('#canvas.has-img');
  await page.waitForTimeout(300);
  const before = await page.$$eval('#items li', (l) => l.length);
  if (before !== 12) errors.push(`editor: ch1 のアイテム数 ${before}`);
  const box = await page.locator('#svg').boundingBox();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.62);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.68, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.type('座布団');
  const after = await page.$$eval('#items li', (l) => l.length);
  if (after !== 13) errors.push(`editor: 四角を描いてもアイテムが増えない (${after})`);
  await page.screenshot({ path: `${OUT}/editor.png` });
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#btn-preview')]);
  await popup.waitForSelector('#screen-play.active', { timeout: 8000 }).catch(() => errors.push('editor: テストプレイが始まらない'));
  await popup.waitForTimeout(800);
  const n = await popup.$$eval('#item-list li', (l) => l.length);
  if (n !== 8) errors.push(`editor: テストプレイの出題数 ${n}`);
  await popup.screenshot({ path: `${OUT}/editor-preview.png` });
  await browser.close();
}

await runEditor();
// 横持ち専用：縦にすると回転を促す表示が出ること
async function runPortrait() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.goto(BASE);
  if (!(await page.isVisible('.rotate-hint'))) errors.push('portrait: 回転の案内が出ない');
  await browser.close();
}

await run('desktop', { width: 1280, height: 720 });
await run('phone', { width: 844, height: 390 }, { touch: true });
await run('phone-max', { width: 932, height: 430 }, { touch: true });
await run('tablet', { width: 1180, height: 820 }, { touch: true });
await runPortrait();
server?.kill();

if (errors.length) {
  console.log('NG\n' + errors.join('\n'));
  process.exit(1);
}
console.log('OK');
