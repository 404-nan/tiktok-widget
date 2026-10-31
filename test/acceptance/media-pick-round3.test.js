// カード docs/cards/media-pick.md「3巡目」の AC-6 を、実ブラウザのダッシュボードで確かめる受け入れテスト。
// プリセットが2つ以上あり、使用中が最後ではないとき、ホームの「使っているもの」が使用中の編集画面を開くことを見る。
// 本番(3939)は使わず、一時の設定・一時のポートでサーバーを立てる。playwright が無い環境では飛ばさず失敗にする。
import test from 'node:test';
import assert from 'node:assert/strict';
import { startLocalServer } from '../../scripts/perf/lib/process.mjs';

const root = new URL('../../', import.meta.url).pathname;
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';

let chromium = null;
let playwrightError = null;
try { ({ chromium } = await import(PLAYWRIGHT)); } catch (error) { playwrightError = error; }

const patch = async (baseUrl, path, value) => {
  const res = await fetch(`${baseUrl}/api/config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, value }) });
  const body = await res.json().catch(() => ({}));
  assert.ok(res.ok && !body.errors?.length, `設定を保存できません: ${JSON.stringify(body.error ?? body.errors)}`);
};

test('AC-6 使用中のプリセットが最後ではないとき、ホームの「使っているもの」を押すと使用中のプリセットの編集画面が開く', { timeout: 120_000 }, async () => {
  assert.ok(chromium, `playwright が使えません(${PLAYWRIGHT}): ${playwrightError?.message}`);
  const server = await startLocalServer(root);
  const browser = await chromium.launch({ headless: true });
  try {
    // 一覧は a → b の順。使用中は最後ではない a。見分けるため、表示の文字を変えておく
    await patch(server.baseUrl, ['puchuns', 'a'], { preset: 'cutin', gifts: ['バラ'], texts: { main: 'しるしAAA' } });
    await patch(server.baseUrl, ['puchuns', 'b'], { preset: 'cutin', gifts: ['バラ'], texts: { main: 'しるしBBB' } });
    await patch(server.baseUrl, ['active', 'puchuns'], 'a');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${server.baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByText('ホーム', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
    const open = page.locator('.home-used-open', { hasText: 'パチンコ演出' }).first();
    await open.waitFor({ state: 'visible', timeout: 15_000 });
    await open.click();
    await page.waitForTimeout(1200);
    // 開いた編集画面の入力欄の値に、どちらのプリセットの印があるか
    const values = await page.evaluate(() => [...document.querySelectorAll('input, textarea')].map((el) => el.value));
    assert.ok(values.includes('しるしAAA'), `使用中(a)の編集画面が開いていません。入力欄の値: ${JSON.stringify(values.filter(Boolean))}`);
    assert.ok(!values.includes('しるしBBB'), '一覧の最後(b)の編集画面が開いています');
  } finally {
    await browser.close();
    await server.stop();
  }
});

test('AC-6 使用中が default のとき、ホームの「使っているもの」を押すと default の編集画面が開く', { timeout: 120_000 }, async () => {
  assert.ok(chromium, `playwright が使えません(${PLAYWRIGHT}): ${playwrightError?.message}`);
  const server = await startLocalServer(root);
  const browser = await chromium.launch({ headless: true });
  try {
    await patch(server.baseUrl, ['puchuns', 'default'], { preset: 'cutin', gifts: ['バラ'], texts: { main: 'しるしDEFAULT' } });
    await patch(server.baseUrl, ['puchuns', 'b'], { preset: 'cutin', gifts: ['バラ'], texts: { main: 'しるしBBB' } });
    await patch(server.baseUrl, ['active', 'puchuns'], 'default');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${server.baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.getByText('ホーム', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
    const open = page.locator('.home-used-open', { hasText: 'パチンコ演出' }).first();
    await open.waitFor({ state: 'visible', timeout: 15_000 });
    await open.click();
    await page.waitForTimeout(1200);
    const values = await page.evaluate(() => [...document.querySelectorAll('input, textarea')].map((el) => el.value));
    assert.ok(values.includes('しるしDEFAULT'), `使用中(default)の編集画面が開いていません。入力欄の値: ${JSON.stringify(values.filter(Boolean))}`);
    assert.ok(!values.includes('しるしBBB'), '一覧の最後(b)の編集画面が開いています');
  } finally {
    await browser.close();
    await server.stop();
  }
});
