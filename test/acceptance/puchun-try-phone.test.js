// カード docs/cards/puchun-try-phone.md の AC-1〜4 を、実ブラウザ(playwright)で確かめる受け入れテスト。
// 一時の設定でサーバーを別ポートに立てて puchun.html と try.html を開く。本番(3939)・開発(3940)は使わない。
import test from 'node:test';
import assert from 'node:assert/strict';
import { startLocalServer } from '../../scripts/perf/lib/process.mjs';

const root = new URL('../../', import.meta.url).pathname;
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';

// playwright が無い環境では飛ばさず、失敗にする
let chromium = null;
let playwrightError = null;
try { ({ chromium } = await import(PLAYWRIGHT)); } catch (error) { playwrightError = error; }

async function withBrowser(run) {
  assert.ok(chromium, `playwright が使えません(${PLAYWRIGHT}): ${playwrightError?.message}`);
  const server = await startLocalServer(root);
  const browser = await chromium.launch({ headless: true });
  try {
    await run({ browser, baseUrl: server.baseUrl });
  } finally {
    await browser.close();
    await server.stop();
  }
}
const browserTest = (name, run) => test(name, { timeout: 120_000 }, () => withBrowser(run));

const PUCHUN = '/widgets/puchun/puchun.html?preset=chance';
const TRY = '/widgets/puchun/try.html';

// AC-1: 書体が失敗しても、終わらなくても、fxReady が true になる。普通のときも true になり、書体は読めている
browserTest('AC-1 書体の読み込みが失敗しても fxReady が true になる', async ({ browser, baseUrl }) => {
  const page = await browser.newPage();
  await page.route('**/*.woff2', (route) => route.abort());
  await page.goto(baseUrl + PUCHUN);
  await page.waitForFunction(() => window.fxReady === true, null, { timeout: 5000 });
  await page.close();
});

browserTest('AC-1 書体の読み込みが終わらなくても、3秒すぎて少しで fxReady が true になる', async ({ browser, baseUrl }) => {
  const page = await browser.newPage();
  await page.route('**/*.woff2', () => { /* 応答を返さず、ずっと待たせる */ });
  await page.goto(baseUrl + PUCHUN, { waitUntil: 'commit' });
  await page.waitForFunction(() => window.fxReady === true, null, { timeout: 5500 });
  await page.close();
});

browserTest('AC-1 書体が普通に読めるときは、書体が読めてから fxReady が true になる', async ({ browser, baseUrl }) => {
  const page = await browser.newPage();
  await page.goto(baseUrl + PUCHUN);
  await page.waitForFunction(() => window.fxReady === true, null, { timeout: 5000 });
  const loaded = await page.evaluate(() => ({
    reggae: document.fonts.check('400 100px "Reggae One"', 'ナイスギフト'),
    zen: document.fonts.check('700 20px "Zen Kaku Gothic New"', 'ナイス'),
  }));
  assert.deepEqual(loaded, { reggae: true, zen: true });
  await page.close();
});

const ratioOf = async (page) => page.evaluate(() => {
  const r = document.querySelector('.stage').getBoundingClientRect();
  return r.width / r.height;
});
const clickRatio = (page, value) => page.click(`#ratio button[data-v="${value}"]`);

// AC-2: 1:1 と 4:3 で見本の枠がその比率になる。ほかの比率(9:16)は今までどおり
for (const [name, viewport] of [['幅1280', { width: 1280, height: 800 }], ['幅390', { width: 390, height: 844 }]]) {
  browserTest(`AC-2 ${name}: 比率に 1:1 と 4:3 を選ぶと見本の枠がその比率になる`, async ({ browser, baseUrl }) => {
    const page = await browser.newPage({ viewport });
    await page.goto(baseUrl + TRY);
    assert.ok(Math.abs(await ratioOf(page) - 9 / 16) < 0.02, '初めは 9:16');
    await clickRatio(page, '1:1');
    assert.ok(Math.abs(await ratioOf(page) - 1) < 0.02, `1:1 のはずが ${await ratioOf(page)}`);
    await clickRatio(page, '4:3');
    assert.ok(Math.abs(await ratioOf(page) - 4 / 3) < 0.02, `4:3 のはずが ${await ratioOf(page)}`);
    await clickRatio(page, '');
    assert.ok(Math.abs(await ratioOf(page) - 9 / 16) < 0.02, '縦の全画面に戻すと 9:16');
    await page.close();
  });
}

// AC-3: 幅390で、見本が入力欄より上に見え、横にはみ出さず、入力欄の字が16px以上
browserTest('AC-3 幅390: 見本が入力欄より上、横にはみ出さない、入力欄の字は16px以上', async ({ browser, baseUrl }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(baseUrl + TRY);
  const m = await page.evaluate(() => {
    const stage = document.querySelector('.stage').getBoundingClientRect();
    const inputs = [...document.querySelectorAll('input:not([type=radio]):not([type=checkbox]):not([type=hidden])')];
    return {
      stageTop: stage.top, stageBottom: stage.bottom, stageLeft: stage.left, stageRight: stage.right,
      firstInputTop: Math.min(...inputs.map((i) => i.getBoundingClientRect().top)),
      inputCount: inputs.length,
      fontSizes: inputs.map((i) => parseFloat(getComputedStyle(i).fontSize)),
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
    };
  });
  assert.ok(m.stageBottom > m.stageTop && m.stageRight > m.stageLeft, '見本の枠が見えていません');
  assert.ok(m.stageBottom <= m.firstInputTop, `見本(下端 ${m.stageBottom})が入力欄(上端 ${m.firstInputTop})より上にありません`);
  assert.ok(m.stageLeft >= 0 && m.stageRight <= 390, '見本が画面の横からはみ出しています');
  assert.ok(m.scrollWidth <= 390 && m.bodyScrollWidth <= 390, `横にはみ出しています(${m.scrollWidth})`);
  assert.ok(m.inputCount > 0, '入力欄が見つかりません');
  assert.ok(m.fontSizes.every((s) => s >= 16), `入力欄の字が16px未満です: ${m.fontSizes}`);
  await page.close();
});

// AC-4: 幅1280の組み立ては今までどおり(左に操作、右に縦長 405px の見本が貼りつく)
browserTest('AC-4 幅1280: 左に操作、右に 9:16 で幅405の見本が上に貼りつく', async ({ browser, baseUrl }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  await page.goto(baseUrl + TRY);
  const m = await page.evaluate(() => {
    const box = (el) => el.getBoundingClientRect();
    const section = box(document.querySelector('main > section'));
    const stageEl = document.querySelector('.stage');
    const stage = box(stageEl);
    return {
      sectionRight: section.right, sectionWidth: section.width,
      stageLeft: stage.left, stageWidth: stage.width, stageHeight: stage.height,
      stagePosition: getComputedStyle(stageEl).position, stageStickyTop: getComputedStyle(stageEl).top,
      mainWidth: box(document.querySelector('main')).width,
      scrollWidth: document.documentElement.scrollWidth,
    };
  });
  assert.ok(m.stageLeft >= m.sectionRight, `見本が操作の右にありません(操作の右端 ${m.sectionRight}, 見本の左端 ${m.stageLeft})`);
  assert.ok(m.sectionWidth >= 300 && m.sectionWidth <= 400, `操作の幅が変わっています: ${m.sectionWidth}`);
  assert.ok(Math.abs(m.stageWidth - 405) < 1, `見本の幅が変わっています: ${m.stageWidth}`);
  assert.ok(Math.abs(m.stageWidth / m.stageHeight - 9 / 16) < 0.01, '見本が 9:16 ではありません');
  assert.equal(m.stagePosition, 'sticky');
  assert.equal(m.stageStickyTop, '24px');
  assert.ok(m.mainWidth <= 1100, `全体の幅が変わっています: ${m.mainWidth}`);
  assert.ok(m.scrollWidth <= 1280, '横にはみ出しています');
  await page.close();
});
