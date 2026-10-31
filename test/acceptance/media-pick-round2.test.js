// カード docs/cards/media-pick.md「2巡目」の AC-5 を、実ブラウザのダッシュボードと証拠の画面写真で確かめる受け入れテスト。
// 「詳細設定」を開かない最初の画面に立ち絵の select が見えること、証拠の写真が指定の大きさであることを見る。
// 本番(3939)は使わず、一時の設定・一時のポートでサーバーを立てる。playwright が無い環境では飛ばさず失敗にする。
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { startLocalServer } from '../../scripts/perf/lib/process.mjs';

const root = new URL('../../', import.meta.url).pathname;
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';
// 小さな PNG(画像)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAcElEQVR42u3aMREAIAwEwch5/4MIXAUBVKko2OIMbH2VvfrnCgAAAAAAAAAAAAAAAAAAAAAwrpOnAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMEgAAAAAAAAAAAAAAAAAAAACAqwMHBt5ZHrAf2QAAAABJRU5ErkJggg==', 'base64');

let chromium = null;
let playwrightError = null;
try { ({ chromium } = await import(PLAYWRIGHT)); } catch (error) { playwrightError = error; }
const browserTest = (name, fn) => test(name, { timeout: 120_000 }, async () => {
  assert.ok(chromium, `playwright が使えません(${PLAYWRIGHT}): ${playwrightError?.message}`);
  await fn();
});

const json = async (res) => res.json().catch(() => ({}));
const patch = async (baseUrl, path, value) => {
  const res = await fetch(`${baseUrl}/api/config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, value }) });
  const body = await json(res);
  assert.ok(res.ok && !body.errors?.length, `設定を保存できません: ${JSON.stringify(body.error ?? body.errors)}`);
};
const upload = async (baseUrl, name, mime, body) => {
  const res = await fetch(`${baseUrl}/api/media-alerts?name=${encodeURIComponent(name)}`, { method: 'POST', headers: { 'content-type': mime }, body });
  const data = await json(res);
  assert.ok(res.ok && data.item?.id, `テスト用のファイル(${name})をメディアに入れられません: ${JSON.stringify(data.error ?? data)}`);
};

// PNG の頭(IHDR)から縦横を読む
const pngSize = (file) => {
  const head = readFileSync(new URL(file, new URL('../../', import.meta.url)));
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
};

const viewports = [
  { name: 'PC', size: { width: 1280, height: 800 } },
  { name: 'スマホ', size: { width: 390, height: 844 } },
];

for (const { name, size } of viewports) {
  browserTest(`AC-5 ${name}(${size.width}×${size.height}): パチンコ演出を開いた最初の画面に、詳細設定を開かず立ち絵の select が見える`, async () => {
    const server = await startLocalServer(root);
    const browser = await chromium.launch({ headless: true });
    try {
      await upload(server.baseUrl, 'tachie-gazo.png', 'image/png', PNG);
      await patch(server.baseUrl, ['puchuns', 'a'], { preset: 'cutin', gifts: ['バラ'] });
      const page = await browser.newPage({ viewport: size });
      await page.goto(`${server.baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.getByText('ホーム', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
      const open = page.locator('.home-used-open', { hasText: 'パチンコ演出' }).first();
      await open.waitFor({ state: 'visible', timeout: 15_000 });
      await open.click();
      await page.waitForTimeout(1200);
      // 「詳細設定」は開けない。閉じたままの最初の画面で見えるかを確かめる
      const select = page.locator('.field').filter({ hasText: /立ち絵/ }).last().locator('select');
      await select.waitFor({ state: 'visible', timeout: 20_000 });
      assert.ok(await select.isVisible(), '立ち絵の select が最初の画面に見えていません');
    } finally {
      await browser.close();
      await server.stop();
    }
  });
}

test('AC-5 証拠の画面写真が PC 1280×800 とスマホ 390×844 の大きさで置いてある', () => {
  assert.deepEqual(pngSize('artifacts/shots/media-pick-pc.png'), { width: 1280, height: 800 });
  assert.deepEqual(pngSize('artifacts/shots/media-pick-mobile.png'), { width: 390, height: 844 });
});
