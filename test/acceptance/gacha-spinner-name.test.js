// 受け入れテスト: ガチャの結果に回した人の名前を出す(docs/cards/2026-10-16-gacha-spinner-name.md)
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { chromium } from '@playwright/test';
import { startDev } from '../../scripts/dev.mjs';

let dev, browser;

before(async () => {
  // 無料の回数が前回の実行で減らないよう、毎回まっさらなデータで起動する
  fs.rmSync(new URL('../../.dev/acceptance-gacha-name', import.meta.url), { recursive: true, force: true });
  dev = await startDev({ name: 'acceptance-gacha-name', quiet: true });
  browser = await chromium.launch();
});
after(async () => {
  await browser?.close();
  await dev?.stop();
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const trigger = (body) => fetch(`${dev.url}/api/dev/trigger`, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});
const bodyText = (page) => page.evaluate(() => document.body.innerText + '\n' + document.body.textContent);
async function untilIdle(ms = 15000) {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const s = await (await fetch(`${dev.url}/api/gacha`)).json();
    if (!s.phase || s.phase === 'idle') return;
    await sleep(200);
  }
  throw new Error('ガチャが待機に戻りません');
}
async function openWidget() {
  const page = await browser.newPage();
  await page.goto(`${dev.url}/widgets/gacha.html`);
  await page.waitForLoadState('networkidle');
  return page;
}
async function waitPhase(page, phase, ms = 10000) {
  await page.waitForFunction((p) => document.getElementById('stage').getAttribute('data-phase') === p, phase, { timeout: ms });
}

test('AC-1 視聴者ガチャを回すと、回転中・結果・終了のあいだ名前が出る', async () => {
  await untilIdle();
  const page = await openWidget();
  const res = await trigger({ target: 'gacha-viewer', name: 'テスト視聴者' });
  assert.equal(res.status, 200);
  for (const phase of ['rolling', 'reveal', 'done']) {
    await waitPhase(page, phase);
    assert.match(await bodyText(page), /テスト視聴者/, `${phase} で名前が出ていない`);
  }
  await page.close();
});

test('AC-2 名前の無いきっかけでは、名前の欄に何も出さない', async () => {
  await untilIdle();
  const page = await openWidget();
  const res = await trigger({ target: 'gacha' });
  assert.equal(res.status, 200);
  for (const phase of ['rolling', 'reveal', 'done']) {
    await waitPhase(page, phase);
    const text = await bodyText(page);
    assert.doesNotMatch(text, /undefined|null|NaN|\[object/i, `${phase} に不要な文字が出ている`);
    assert.doesNotMatch(text, /テスト視聴者/, `${phase} に前回の名前が残っている`);
  }
  await page.close();
});

test('AC-3 待機に戻ったら名前は消える', async () => {
  await untilIdle();
  const page = await openWidget();
  await trigger({ target: 'gacha-viewer', name: '消える人' });
  await waitPhase(page, 'reveal');
  assert.match(await bodyText(page), /消える人/);
  await waitPhase(page, 'idle', 15000);
  assert.doesNotMatch(await bodyText(page), /消える人/);
  await page.close();
});

test('AC-4 名前は HTML として解釈せず、文字のまま出る', async () => {
  await untilIdle();
  const page = await openWidget();
  const name = '<b>x</b>';
  const res = await trigger({ target: 'gacha-viewer', name });
  assert.equal(res.status, 200);
  await waitPhase(page, 'reveal');
  assert.ok((await bodyText(page)).includes(name), '名前が文字のまま出ていない');
  assert.equal(await page.locator('#stage b').count(), 0, '<b> が要素になっている');
  await page.close();
});

test('AC-5 public/widgets/gacha.js は ES5 のまま(es5-public.test.js の一覧に入っている)', () => {
  const src = fs.readFileSync(new URL('../es5-public.test.js', import.meta.url), 'utf8');
  assert.ok(src.includes('gacha.js'), 'es5-public.test.js の一覧に gacha.js が無い');
});
