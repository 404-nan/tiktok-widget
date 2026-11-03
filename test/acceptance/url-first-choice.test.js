// カード docs/cards/url-first-choice.md の AC-1〜5 を、本物のサーバーと実ブラウザで確かめる受け入れテスト。
// 「空のデータ」は、空の config.yaml・空の data で別ポートに立てた一時サーバーで作る。本番(3939)・開発(3940)は使わない。
// 証拠の写真(artifacts/shots/)はレビュー役が見るので、ここでは撮らない。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { findFreePort, waitForHttp } from '../../scripts/perf/lib/process.mjs';

const root = new URL('../../', import.meta.url).pathname;
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';
const GUIDE = 'まだ出すものがありません。左の「出すものを選ぶ」から選んでください。'; // 作ったものが無いときの今の案内
const PASTE_HINT = 'コピーした URL を、OBS や TikTok LIVE Studio の「ブラウザ」ソースに貼ります'; // 貼る案内の今の文
const OTHER = 'ほかの URL';
// 今の画面が並べる行の数(空のデータで測った値)。「URL は1つも消えない」の物差し
const ROWS_WITH_ONE = 14; // 空のデータでウィジェットを1つ作ったとき
const ROWS_EMPTY = 13; // 何も作っていないとき

// AC-5: playwright が無い環境では飛ばさず、失敗にする
let chromium = null;
let playwrightError = null;
try { ({ chromium } = await import(PLAYWRIGHT)); } catch (error) { playwrightError = error; }
const e2e = (name, fn) => test(name, { timeout: 120_000 }, async () => {
  assert.ok(chromium, `playwright が使えません(${PLAYWRIGHT}): ${playwrightError?.message}`);
  await fn();
});

// 空の設定・空のデータで、サーバーを一時ポートに立てる
async function startEmptyServer() {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'url-first-choice-'));
  const dataDir = path.join(tempRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const configPath = path.join(tempRoot, 'config.yaml');
  fs.writeFileSync(configPath, '');
  const port = await findFreePort();
  const env = { ...process.env, PORT: String(port), HOST: '127.0.0.1', TW_ENV: 'dev', TW_CONFIG: configPath, TW_DATA: dataDir };
  for (const key of ['TIKTOK_USERNAME', 'TW_VAULT', 'TW_HOSTED', 'TW_SERVER', 'TW_AI_TOKEN']) delete env[key];
  const child = spawn(process.execPath, [path.join(root, 'server.js')], { cwd: root, env, stdio: ['ignore', 'ignore', 'ignore'] });
  const baseUrl = `http://127.0.0.1:${port}`;
  const stop = async () => {
    child.kill('SIGTERM');
    await new Promise((resolve) => { child.once('exit', resolve); setTimeout(resolve, 3000); });
    fs.rmSync(tempRoot, { recursive: true, force: true });
  };
  try { await waitForHttp(`${baseUrl}/healthz`); } catch (error) { await stop(); throw error; }
  return { baseUrl, stop };
}

async function createPuchun(baseUrl) {
  const res = await fetch(`${baseUrl}/api/config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: ['puchuns', 'a'], value: { preset: 'jackpot', ratio: 'full', texts: { main: '大当たり' }, minCoins: 1 } }) });
  const body = await res.json().catch(() => ({}));
  assert.ok(res.ok && !body.errors?.length, `ウィジェットを作れません: ${JSON.stringify(body.error ?? body.errors)}`);
}

// 「配信ソフトに入れる URL」の画面を開く(ホームの準備カードの「入れ方を見る」から)
async function openUrlScreen(browser, baseUrl, width) {
  const context = await browser.newContext({ viewport: { width, height: 900 } });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: baseUrl }).catch(() => {});
  const page = await context.newPage();
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByText('ホーム', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
  await page.getByRole('button', { name: '入れ方を見る' }).first().click();
  await page.getByText('配信ソフトに入れる URL', { exact: true }).waitFor({ state: 'visible', timeout: 15_000 });
  return page;
}

async function withScreen({ create, width = 1280 }, run) {
  const server = await startEmptyServer();
  const browser = await chromium.launch({ headless: true });
  try {
    if (create) await createPuchun(server.baseUrl);
    const page = await openUrlScreen(browser, server.baseUrl, width);
    await run({ page, baseUrl: server.baseUrl });
  } finally {
    await browser.close();
    await server.stop();
  }
}

const rows = (page) => page.locator('#cards .url-item');
const visibleRows = (page) => rows(page).evaluateAll((els) => els.filter((el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden').length);
const titleOf = (row) => row.locator('.srow-title').innerText();
const otherToggle = (page) => page.locator('#cards').getByText(OTHER).first();

e2e('AC-1 空のデータで1つ作ると、URL の画面の最初の一覧に、作ったものの行だけが出る', async () => {
  await withScreen({ create: true }, async ({ page }) => {
    const first = page.locator('#cards .sgroup').first();
    const inFirst = first.locator('.url-item');
    assert.equal(await inFirst.count(), 1, '最初の一覧に作ったものの行だけが出ていません');
    assert.match(await titleOf(inFirst.first()), /パチンコ演出/);
    // 初めに見えている行も、作ったものの1行だけ
    assert.equal(await visibleRows(page), 1, '閉じた状態で見える行が1つではありません');
  });
});

e2e('AC-2 選んでいないものの URL は「ほかの URL」にまとめて初めは閉じ、押すと全部の行が見えてコピーできる。URL は1つも消えない', async () => {
  await withScreen({ create: true }, async ({ page }) => {
    assert.ok(await otherToggle(page).isVisible(), `「${OTHER}」が見えません`);
    assert.equal(await visibleRows(page), 1, '初めは閉じているはずです');
    await otherToggle(page).click();
    await page.waitForTimeout(300);
    assert.equal(await visibleRows(page), ROWS_WITH_ONE, '開いても全部の行が見えません(URL が消えています)');
    // 全部の行のコピーが押せて、URL がそれぞれ別で、作ったものの URL も入っている
    const urls = [];
    for (let i = 0; i < ROWS_WITH_ONE; i += 1) {
      const copy = rows(page).nth(i).locator('button.chip', { hasText: 'コピー' });
      await copy.click();
      urls.push(await page.evaluate(() => navigator.clipboard.readText()));
    }
    assert.equal(new Set(urls).size, ROWS_WITH_ONE, 'コピーした URL に重なりか空があります');
    assert.ok(urls.every((u) => /^http:\/\/127\.0\.0\.1:\d+\//.test(u)), `URL の形が違います: ${urls.find((u) => !/^http:\/\/127\.0\.0\.1:\d+\//.test(u))}`);
    assert.ok(urls.some((u) => u.includes('/widgets/puchun/')), '作ったもの(パチンコ演出)の URL がありません');
  });
});

e2e('AC-3 作ったものが1つも無いときは今と同じ案内を出し、「ほかの URL」は開いた状態か案内の下で見える', async () => {
  await withScreen({ create: false }, async ({ page }) => {
    const cards = page.locator('#cards');
    await cards.getByText(GUIDE, { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    assert.ok(await otherToggle(page).isVisible(), `「${OTHER}」が案内の下で見えません`);
    const guideBox = await cards.getByText(GUIDE, { exact: true }).boundingBox();
    const toggleBox = await otherToggle(page).boundingBox();
    assert.ok(toggleBox.y > guideBox.y, `「${OTHER}」が案内より下にありません`);
    assert.equal(await visibleRows(page), ROWS_EMPTY, '押さなくても行が見える状態になっていません');
  });
});

e2e('AC-4 コピーで今と同じ「コピーしました」の印が出る。貼る案内の文と、行の幅・高さは残る', async () => {
  await withScreen({ create: true }, async ({ page }) => {
    await page.locator('#cards').getByText(PASTE_HINT, { exact: true }).waitFor({ state: 'visible', timeout: 5000 });
    const firstRow = rows(page).first();
    const copy = firstRow.locator('button.chip', { hasText: 'コピー' });
    await copy.click();
    assert.match(await copy.innerText(), /コピーしました/);
    // 行は「名前」と「幅 ◯・高さ ◯」の2行の形のまま
    assert.match(await firstRow.locator('.srow-sub').innerText(), /^幅 \d+・高さ \d+/);
    // 「ほかの URL」の中の行も、先頭の行と同じ幅・高さ
    await otherToggle(page).click();
    await page.waitForTimeout(300);
    const first = await firstRow.boundingBox();
    const last = await rows(page).last().boundingBox();
    assert.ok(Math.abs(first.width - last.width) <= 1, `行の幅が違います: ${first.width} と ${last.width}`);
    assert.ok(Math.abs(first.height - last.height) <= 1, `行の高さが違います: ${first.height} と ${last.height}`);
    // コピーの印は、開いたほうの行でも同じ
    const lastCopy = rows(page).last().locator('button.chip', { hasText: 'コピー' });
    await lastCopy.click();
    assert.match(await lastCopy.innerText(), /コピーしました/);
  });
});

for (const width of [390, 1280]) {
  e2e(`AC-5 幅${width}で閉じた時も開いた時も横にはみ出さず、「ほかの URL」はキーボードで開ける`, async () => {
    await withScreen({ create: true, width }, async ({ page }) => {
      const overflow = () => page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, inner: window.innerWidth }));
      let size = await overflow();
      assert.ok(size.scroll <= size.inner, `閉じた時に横にはみ出しています: ${size.scroll} > ${size.inner}`);
      assert.equal(await visibleRows(page), 1);
      // Tab だけで「ほかの URL」に着き、Enter で開く
      let reached = false;
      for (let i = 0; i < 120 && !reached; i += 1) {
        await page.keyboard.press('Tab');
        reached = await page.evaluate((label) => Boolean(document.activeElement?.textContent?.includes(label)) && !document.activeElement.matches('body, #cards'), OTHER);
      }
      assert.ok(reached, `Tab で「${OTHER}」に着けません`);
      await page.keyboard.press('Enter');
      await page.waitForTimeout(300);
      assert.equal(await visibleRows(page), ROWS_WITH_ONE, 'キーボードで開けません');
      size = await overflow();
      assert.ok(size.scroll <= size.inner, `開いた時に横にはみ出しています: ${size.scroll} > ${size.inner}`);
    });
  });
}
