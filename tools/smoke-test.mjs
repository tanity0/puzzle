// ゲームを自動で1件除霊まで遊ぶスモークテスト（開発サーバーは自動で起動する）。
// 実行: npm test   または   node tools/smoke-test.mjs [スクリーンショット出力フォルダ]
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { bbox, hitTest } from '../js/hit.js';

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

const REQ = JSON.parse(readFileSync(new URL('../requests/001/request.json', import.meta.url), 'utf8'));
const EMPTY = { x: 560, y: 940 }; // 何もない畳（画像座標）

// 当たり判定の内側で、他の判定と重ならない点を探す
function insidePoint(it) {
  const b = bbox(it);
  const others = REQ.items.filter((o) => o !== it);
  for (let n = 0; n < 400; n++) {
    const x = b.x + b.w * (0.1 + 0.8 * ((n * 0.37) % 1));
    const y = b.y + b.h * (0.1 + 0.8 * ((n * 0.61) % 1));
    if (hitTest(it, x, y) && !others.some((o) => hitTest(o, x, y, 20))) return { x, y };
  }
  throw new Error(`${it.id} の内側の点が見つからない`);
}

async function run(name, viewport, opts = {}) {
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport, hasTouch: !!opts.touch, isMobile: !!opts.touch, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  // 外部フォント取得の失敗はテスト環境のネットワーク事情なので除外
  page.on('console', (m) => m.type() === 'error' && !/ERR_CERT|fonts\.g|404/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
  page.on('pageerror', (e) => errors.push(`${name}: ${e.message}`));
  const tapAt = async (p) => (opts.touch ? page.touchscreen.tap(p.x, p.y) : page.mouse.click(p.x, p.y));

  await page.goto(BASE);
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-1-title.png` });

  // 初回は導入文 → 依頼箱
  await page.click('#btn-start');
  await page.waitForSelector('#screen-story.active');
  await page.click('#btn-story-skip');
  await page.waitForSelector('#screen-inbox.active');
  await page.waitForTimeout(300);
  await page.screenshot({ path: `${OUT}/${name}-2-inbox.png` });
  await page.click('.request');
  await page.waitForSelector('#screen-play.active');
  await page.waitForTimeout(800);

  // 依頼文が最初に重なって表示される
  if (!(await page.$eval('#letter', (el) => el.classList.contains('open')))) errors.push(`${name}: 依頼文が最初に表示されない`);
  await page.screenshot({ path: `${OUT}/${name}-3-letter.png` });
  await page.click('#btn-letter-close');
  await page.waitForTimeout(400);
  if (await page.$eval('#letter', (el) => el.classList.contains('open'))) errors.push(`${name}: 依頼文が閉じない`);
  // いつでも再表示できる
  await page.click('#btn-letter');
  await page.waitForTimeout(400);
  if (!(await page.$eval('#letter', (el) => el.classList.contains('open')))) errors.push(`${name}: 依頼文を再表示できない`);
  await page.click('#btn-letter');
  await page.waitForTimeout(400);

  // 全体表示まで引く（タッチ端末ではズームボタンが非表示なので直接 click() を呼ぶ）
  const zoomOut = () => page.$eval('#btn-zoom-out', (b) => b.click());
  for (let i = 0; i < 4; i++) await zoomOut();
  await page.waitForTimeout(500);

  const toScreen = (p) => page.evaluate(([x, y]) => {
    const m = getComputedStyle(document.querySelector('#content')).transform.match(/matrix\(([^)]+)\)/)[1].split(',').map(Number);
    const r = document.querySelector('#stage').getBoundingClientRect();
    return { x: r.left + m[4] + x * m[0], y: r.top + m[5] + y * m[3] };
  }, [p.x, p.y]);

  // ヒントを1回使う
  await page.click('#btn-hint');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}-4-hint.png` });
  for (let i = 0; i < 2; i++) await zoomOut();
  await page.waitForTimeout(500);

  // 見誤り5回で驚かし
  for (let i = 0; i < 5; i++) {
    await tapAt(await toScreen(EMPTY));
    await page.waitForTimeout(120);
  }
  await page.waitForTimeout(250);
  if (!(await page.$eval('#scare', (el) => el.classList.contains('show')))) errors.push(`${name}: 見誤りで驚かしが発生しない`);
  await page.waitForTimeout(1800);

  // 痕跡をすべて見つける
  const traces = REQ.items.filter((it) => !it.core);
  for (const t of traces) {
    await tapAt(await toScreen(insidePoint(t)));
    await page.waitForTimeout(150);
  }
  await page.screenshot({ path: `${OUT}/${name}-5-traces.png` });
  const count = await page.$eval('#trace-count', (el) => el.textContent);
  if (!count.includes(`${traces.length} / ${traces.length}`)) errors.push(`${name}: 痕跡の数が合わない（${count}）`);

  // 「祓」で核以外を指すと霊が反撃する
  await page.click('#btn-exorcise');
  await tapAt(await toScreen(EMPTY));
  await page.waitForTimeout(250);
  if (!(await page.$eval('#scare', (el) => el.classList.contains('show')))) errors.push(`${name}: 祓の失敗で反撃が起きない`);
  await page.waitForTimeout(1800);

  // 「祓」で核を指して除霊
  const core = REQ.items.find((it) => it.core);
  await page.click('#btn-exorcise');
  await tapAt(await toScreen(insidePoint(core)));
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}-6-exorcise.png` });
  await page.waitForSelector('#screen-result.active', { timeout: 6000 }).catch(() => errors.push(`${name}: 除霊後に結果画面へ行かない`));
  await page.waitForTimeout(500);
  await page.screenshot({ path: `${OUT}/${name}-7-result.png` });

  // 鑑定結果（痕跡を全部見つけたので真相まで）→ 依頼箱
  await page.click('#btn-next');
  await page.waitForSelector('#screen-story.active');
  await page.waitForTimeout(600);
  await page.screenshot({ path: `${OUT}/${name}-8-report.png` });
  await page.click('#btn-story-skip');
  await page.waitForSelector('#screen-inbox.active');
  const status = await page.$eval('.request-status', (el) => el.textContent);
  if (!status.includes('除霊済')) errors.push(`${name}: 依頼箱に除霊済が出ない（${status}）`);
  await page.screenshot({ path: `${OUT}/${name}-9-inbox.png` });
  await browser.close();
}

async function runEditor() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  page.on('pageerror', (e) => errors.push(`editor: ${e.message}`));
  await page.goto(`${BASE}editor.html`);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.waitForSelector('#server-requests option[value="001"]', { state: 'attached' });
  await page.selectOption('#server-requests', '001');
  await page.waitForSelector('#canvas.has-img');
  await page.waitForTimeout(300);
  const before = await page.$$eval('#items li', (l) => l.length);
  if (before !== REQ.items.length) errors.push(`editor: 001 の当たり判定の数 ${before}`);
  const box = await page.locator('#svg').boundingBox();
  await page.mouse.move(box.x + box.width * 0.4, box.y + box.height * 0.88);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.45, box.y + box.height * 0.94, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.type('座布団の染み');
  const after = await page.$$eval('#items li', (l) => l.length);
  if (after !== REQ.items.length + 1) errors.push(`editor: 四角を描いても増えない (${after})`);
  await page.screenshot({ path: `${OUT}/editor.png` });
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.click('#btn-preview')]);
  await popup.waitForSelector('#screen-play.active', { timeout: 8000 }).catch(() => errors.push('editor: テストプレイが始まらない'));
  await popup.waitForTimeout(800);
  const count = await popup.$eval('#trace-count', (el) => el.textContent);
  if (!count.includes(`/ ${REQ.items.length}`)) errors.push(`editor: テストプレイの痕跡の数が合わない（${count}）`);
  await popup.screenshot({ path: `${OUT}/editor-preview.png` });
  await browser.close();
}

// 横持ち専用：縦にすると回転を促す表示が出ること
async function runPortrait() {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
  await page.goto(BASE);
  if (!(await page.isVisible('.rotate-hint'))) errors.push('portrait: 回転の案内が出ない');
  await browser.close();
}

await runEditor();
await run('desktop', { width: 1280, height: 720 });
await run('phone', { width: 844, height: 390 }, { touch: true });
await run('phone-max', { width: 932, height: 430 }, { touch: true });
await run('tablet', { width: 1180, height: 820 }, { touch: true });
await runPortrait();
server?.kill();

if (errors.length) {
  console.log(`NG\n${errors.join('\n')}`);
  process.exit(1);
}
console.log('OK');
