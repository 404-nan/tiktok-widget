// カード docs/cards/puchun-dash-fix.md の AC-1〜3 を、実際のブラウザで確かめる受け入れテスト。
// AC-4(npm test が全部通る・README を直す)は、全体のテストとレビューで確かめるのでここでは書かない。
// 隔離したサーバー(開発モード)を起動し、ダッシュボードと配信用ページを歩く。playwright が無い環境では飛ばす。
import test from 'node:test';
import assert from 'node:assert/strict';
import { startLocalServer } from '../../scripts/perf/lib/process.mjs';

const root = new URL('../../', import.meta.url).pathname;
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';

let chromium = null;
try { ({ chromium } = await import(PLAYWRIGHT)); } catch { /* 撮影の道具が無い環境では、ブラウザのテストだけ飛ばす */ }
const browserTest = (name, fn) => test(name, { skip: chromium ? false : 'playwright がありません', timeout: 180_000 }, fn);

async function withBrowser(run) {
  const server = await startLocalServer(root);
  const browser = await chromium.launch({ headless: true });
  try {
    await run({ browser, baseUrl: server.baseUrl });
  } finally {
    await browser.close();
    await server.stop();
  }
}

const patch = async (baseUrl, path, value) => {
  const res = await fetch(`${baseUrl}/api/config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path, value }) });
  const body = await res.json();
  assert.ok(res.ok && !body.errors?.length, `設定を保存できません: ${JSON.stringify(body.error ?? body.errors)}`);
};
const sendGift = async (baseUrl) => {
  const res = await fetch(`${baseUrl}/api/simulate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'gift', giftName: 'バラ', diamonds: 10, count: 1 }) });
  assert.equal(res.status, 200, 'テストのギフトを送れません');
};
const addPuchuns = async (baseUrl, extra = {}) => {
  await patch(baseUrl, ['puchuns', 'a'], { preset: 'jackpot', ratio: 'full', texts: { main: '大当たり' }, minCoins: 1, ...extra });
};

// ホームの「使っているもの」から、そのウィジェットの画面を開く
async function openWidget(page, baseUrl, title) {
  await page.goto(`${baseUrl}/`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  await page.getByText('ホーム', { exact: true }).first().waitFor({ state: 'visible', timeout: 30_000 });
  const open = page.locator('.home-used-open', { hasText: title }).first();
  await open.waitFor({ state: 'visible', timeout: 15_000 });
  await open.click();
  await page.waitForTimeout(1200);
}

// スクリーンショット(PNG)の、割合で指した点の色を返す。透明の背景はそのまま(alpha 0)で返る。
async function pixelsOf(browser, png, points) {
  const page = await browser.newPage();
  try {
    await page.setContent('<canvas id="c"></canvas>');
    return await page.evaluate(async ({ data, spots }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.getElementById('c');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, 0, 0);
      return spots.map(([fx, fy]) => {
        const x = Math.min(img.width - 1, Math.floor(img.width * fx));
        const y = Math.min(img.height - 1, Math.floor(img.height * fy));
        const [r, g, b, a] = ctx.getImageData(x, y, 1, 1).data;
        return { fx, fy, r, g, b, a };
      });
    }, { data: png.toString('base64'), spots: points });
  } finally {
    await page.close();
  }
}
const isWhite = (p) => p.a > 0 && p.r >= 235 && p.g >= 235 && p.b >= 235;
const describe = (list) => list.map((p) => `(${p.fx},${p.fy})=rgba(${p.r},${p.g},${p.b},${p.a})`).join(' ');

// ---- AC-1 ----

browserTest('AC-1 パチンコ演出の「配信ソフトに入れる」に URL が出て、別のタブで開くとテストのギフトで演出が流れる', async () => {
  await withBrowser(async ({ browser, baseUrl }) => {
    await addPuchuns(baseUrl);
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await openWidget(page, baseUrl, 'パチンコ演出');
    const copied = await page.locator('#widgetUrl').inputValue();
    assert.ok(copied, '「配信ソフトに入れる」の URL の欄が空です');
    const url = new URL(copied, baseUrl);
    assert.equal(url.pathname, '/widgets/puchun/puchun.html', `URL がパチンコ演出のページではありません: ${copied}`);

    const tab = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await tab.goto(url.href.replace(url.origin, baseUrl), { waitUntil: 'load', timeout: 60_000 });
    await tab.waitForTimeout(1500);
    await sendGift(baseUrl);
    await tab.waitForSelector('iframe.puchun-play', { state: 'attached', timeout: 10_000 });
  });
});

// ---- AC-2 ----

browserTest('AC-2 見本の画面で、演出の外(上下)が白くならない', async () => {
  await withBrowser(async ({ browser, baseUrl }) => {
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    await page.goto(`${baseUrl}/widgets/puchun/try.html`, { waitUntil: 'load', timeout: 60_000 });
    const outside = [[0.2, 0.04], [0.5, 0.04], [0.8, 0.04], [0.2, 0.96], [0.5, 0.96], [0.8, 0.96]];
    const stage = page.locator('.stage');
    // 横長 4:3 の形(ボタン)と 16:9 の形(演出のページに ratio=16:9 を渡す)の、どちらでも
    await page.getByRole('button', { name: '横長 4:3' }).click();
    await page.waitForTimeout(1200);
    const shapes = [['4:3', await stage.screenshot()]];
    await page.evaluate(() => { document.getElementById('view').src = new URL(`puchun.html?preset=chance&ratio=16:9&_=${Date.now()}`, location.href).href; });
    await page.waitForTimeout(1200);
    shapes.push(['16:9', await stage.screenshot()]);
    for (const [ratio, png] of shapes) {
      const got = await pixelsOf(browser, png, outside);
      assert.deepEqual(got.filter(isWhite).map((p) => `(${p.fx},${p.fy})`), [], `${ratio}: 演出の外が白くなっています: ${describe(got)}`);
    }
  });
});

browserTest('AC-2 透明の背景のページ(OBS の代わり)で、演出の外が透けたまま(390×844 と 1280×800)', async () => {
  await withBrowser(async ({ browser, baseUrl }) => {
    await addPuchuns(baseUrl, { ratio: '16:9' });
    for (const [width, height] of [[390, 844], [1280, 800]]) {
      const page = await browser.newPage({ viewport: { width, height } });
      await page.goto(`${baseUrl}/widgets/puchun/puchun.html`, { waitUntil: 'load', timeout: 60_000 });
      await page.waitForTimeout(1500);
      await sendGift(baseUrl);
      await page.waitForSelector('iframe.puchun-play', { state: 'attached', timeout: 10_000 });
      await page.waitForTimeout(1200);
      // 16:9 の枠は画面の真ん中。その上下の端(画面の最上段・最下段)は演出の外
      const png = await page.screenshot({ omitBackground: true });
      const got = await pixelsOf(browser, png, [[0.2, 0], [0.5, 0], [0.8, 0], [0.2, 0.9999], [0.5, 0.9999], [0.8, 0.9999]]);
      assert.deepEqual(got.filter((p) => p.a !== 0).map((p) => `(${p.fx},${p.fy})`), [], `${width}×${height}: 演出の外が透けていません: ${describe(got)}`);
      await page.close();
    }
  });
});

// ---- AC-3 ----

browserTest('AC-3 「配信ではこれが出る」は、配信につないでいなくても、カットインと同じ条件で出る', async () => {
  await withBrowser(async ({ browser, baseUrl }) => {
    // 同じ形に揃える: どちらも2件。配信にはつないでいない(テスト用の隔離サーバー)
    await patch(baseUrl, ['cutins', 'alt'], { minCoins: 50 });
    await addPuchuns(baseUrl);
    await patch(baseUrl, ['puchuns', 'b'], { preset: 'chance', minCoins: 100 });
    // 「使っているもの」は使用中の種類を開くので、どちらも使用中を最後の種類にして条件を揃える
    await patch(baseUrl, ['active', 'cutins'], 'alt');
    await patch(baseUrl, ['active', 'puchuns'], 'b');
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    const countOn = async (title) => {
      await openWidget(page, baseUrl, title);
      let n = 0;
      for (const label of await page.getByText('配信ではこれが出る').all()) if (await label.isVisible()) n += 1;
      return n;
    };
    const cutins = await countOn('カットイン');
    const puchuns = await countOn('パチンコ演出');
    assert.equal(puchuns, cutins, `「配信ではこれが出る」の数がカットイン(${cutins})とパチンコ演出(${puchuns})で違います`);
  });
});
