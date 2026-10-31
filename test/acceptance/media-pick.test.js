// カード docs/cards/media-pick.md の AC-1〜3 を、隔離した本物のサーバーと実ブラウザ(ダッシュボード)で確かめる受け入れテスト。
// AC-4(npm test が全部通る)は全体の `npm test` で確かめるので、ここでは繰り返さない。証拠の画面写真もここでは撮らない。
// 本番(3939)は使わず、一時の設定・一時のポートでサーバーを立てる。playwright が無い環境では飛ばさず失敗にする。
import test from 'node:test';
import assert from 'node:assert/strict';
import { startLocalServer } from '../../scripts/perf/lib/process.mjs';

const root = new URL('../../', import.meta.url).pathname;
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';
// 無音の最小 WAV(音声)と、小さな PNG(画像)
const WAV = Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=', 'base64');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAcElEQVR42u3aMREAIAwEwch5/4MIXAUBVKko2OIMbH2VvfrnCgAAAAAAAAAAAAAAAAAAAAAwrpOnAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMEgAAAAAAAAAAAAAAAAAAAACAqwMHBt5ZHrAf2QAAAABJRU5ErkJggg==', 'base64');

let chromium = null;
let playwrightError = null;
try { ({ chromium } = await import(PLAYWRIGHT)); } catch (error) { playwrightError = error; }
const browserTest = (name, fn) => test(name, { timeout: 120_000 }, async () => {
  assert.ok(chromium, `playwright が使えません(${PLAYWRIGHT}): ${playwrightError?.message}`);
  await fn();
});

async function withDashboard(run) {
  const server = await startLocalServer(root);
  const browser = await chromium.launch({ headless: true });
  try {
    await run({ browser, baseUrl: server.baseUrl });
  } finally {
    await browser.close();
    await server.stop();
  }
}

const json = async (res) => res.json().catch(() => ({}));
const patch = async (baseUrl, path, value) => {
  const res = await fetch(`${baseUrl}/api/config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, value }) });
  const body = await json(res);
  assert.ok(res.ok && !body.errors?.length, `設定を保存できません: ${JSON.stringify(body.error ?? body.errors)}`);
};
const configOf = async (baseUrl) => (await json(await fetch(`${baseUrl}/api/config`))).config;
const upload = async (baseUrl, name, mime, body) => {
  const res = await fetch(`${baseUrl}/api/media-alerts?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'content-type': mime }, body });
  const data = await json(res);
  assert.ok(res.ok && data.item?.id, `テスト用のファイル(${name})をメディアに入れられません: ${JSON.stringify(data.error ?? data)}`);
  return data.item;
};

// ホームの「使っているもの」から、そのウィジェットの設定画面を開く(ページは読み直さない)
async function openFromHome(page, title) {
  await page.getByText('ホーム', { exact: true }).first().click();
  const open = page.locator('.home-used-open', { hasText: title }).first();
  await open.waitFor({ state: 'visible', timeout: 15_000 });
  await open.click();
  await page.waitForTimeout(1200);
}
async function openDashboard(browser, baseUrl, title) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByText('ホーム', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
  await openFromHome(page, title);
  return page;
}

// ラベルの字で欄を探す(いちばん内側の .field)
const fieldOf = (page, labelPattern) => page.locator('.field').filter({ hasText: labelPattern }).last();
const selectOf = (page, labelPattern) => fieldOf(page, labelPattern).locator('select');
const optionTexts = (select) => select.locator('option').allTextContents();

// 折りたたみの中にあっても探せるよう、開けるものは開けてから欄を待つ
async function findSelect(page, labelPattern) {
  await page.evaluate(() => document.querySelectorAll('details').forEach((d) => { d.open = true; }));
  const select = selectOf(page, labelPattern);
  await select.waitFor({ state: 'visible', timeout: 10_000 });
  return select;
}

// 保存は少し遅れて届くので、config がその値になるまで待つ
async function waitForConfig(baseUrl, read, expected, message) {
  const deadline = Date.now() + 10_000;
  let actual;
  while (Date.now() < deadline) {
    actual = read(await configOf(baseUrl));
    if (actual === expected) return;
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.equal(actual, expected, message);
}

// ---- AC-1 ----

browserTest('AC-1 カットインの「赤の声」が select で、音声だけが並び、選んで保存すると redVoice がその mediaId になる', async () => {
  await withDashboard(async ({ browser, baseUrl }) => {
    const voice = await upload(baseUrl, 'akai-koe.wav', 'audio/wav', WAV);
    await upload(baseUrl, 'tachie-gazo.png', 'image/png', PNG);
    await patch(baseUrl, ['cutins', 'alt'], { minCoins: 50 });
    const page = await openDashboard(browser, baseUrl, 'カットイン');
    const select = await findSelect(page, /赤の声/);
    const texts = await optionTexts(select);
    assert.ok(texts.some((text) => text.includes('akai-koe.wav')), `入れてある音声の名前が並んでいません: ${JSON.stringify(texts)}`);
    assert.ok(!texts.some((text) => text.includes('tachie-gazo.png')), `画像が音声の欄に並んでいます: ${JSON.stringify(texts)}`);
    assert.equal(texts[0], 'なし', `先頭が「なし」ではありません: ${JSON.stringify(texts)}`);

    await select.selectOption({ value: voice.id });
    await waitForConfig(baseUrl, (config) => config.cutins?.alt?.redVoice, voice.id, '選んで保存しても redVoice がその mediaId になりません');
  });
});

// ---- AC-2 ----

browserTest('AC-2 パチンコ演出の立ち絵が select で、画像だけが並び、選ぶと charImage がその mediaId、「なし」で空になる', async () => {
  await withDashboard(async ({ browser, baseUrl }) => {
    const image = await upload(baseUrl, 'tachie-gazo.png', 'image/png', PNG);
    await upload(baseUrl, 'akai-koe.wav', 'audio/wav', WAV);
    await patch(baseUrl, ['puchuns', 'a'], { preset: 'cutin', gifts: ['バラ'] });
    const page = await openDashboard(browser, baseUrl, 'パチンコ演出');
    const select = await findSelect(page, /立ち絵/);
    const texts = await optionTexts(select);
    assert.ok(texts.some((text) => text.includes('tachie-gazo.png')), `入れてある画像の名前が並んでいません: ${JSON.stringify(texts)}`);
    assert.ok(!texts.some((text) => text.includes('akai-koe.wav')), `音声が立ち絵の欄に並んでいます: ${JSON.stringify(texts)}`);
    assert.equal(texts[0], 'なし', `先頭が「なし」ではありません: ${JSON.stringify(texts)}`);

    await select.selectOption({ value: image.id });
    await waitForConfig(baseUrl, (config) => config.puchuns?.a?.charImage, image.id, '選んで保存しても charImage がその mediaId になりません');

    await select.selectOption({ label: 'なし' });
    await waitForConfig(baseUrl, (config) => config.puchuns?.a?.charImage, '', '「なし」を選んでも charImage が空になりません');
  });
});

// ---- AC-3 ----

browserTest('AC-3 ダッシュボードでメディアを1つ足すと、そのあと開く select にそれが出る', async () => {
  await withDashboard(async ({ browser, baseUrl }) => {
    await patch(baseUrl, ['cutins', 'alt'], { minCoins: 50 });
    await patch(baseUrl, ['mediaAlerts', 'enabled'], true);
    const page = await openDashboard(browser, baseUrl, 'カットイン');
    const before = await optionTexts(await findSelect(page, /赤の声/));
    assert.ok(!before.some((text) => text.includes('atarashii-koe.wav')), '足す前から名前が並んでいます');

    // ダッシュボードのアップロードで足す(ページは読み直さない)
    await openFromHome(page, 'メディア通知');
    await page.locator('input[type=file]').first().setInputFiles({ name: 'atarashii-koe.wav', mimeType: 'audio/wav', buffer: WAV });
    await page.getByText('atarashii-koe.wav').first().waitFor({ state: 'visible', timeout: 10_000 });

    await openFromHome(page, 'カットイン');
    const after = await optionTexts(await findSelect(page, /赤の声/));
    assert.ok(after.some((text) => text.includes('atarashii-koe.wav')), `足したメディアが select に出ていません: ${JSON.stringify(after)}`);
  });
});
