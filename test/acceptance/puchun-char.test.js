// カード docs/cards/puchun-char.md の AC-1〜3 を、隔離した本物のサーバーと実ブラウザで確かめる受け入れテスト。
// AC-4(npm test が全部通る)は、このファイル自身を含む全体の `npm test` で確かめるので、ここでは繰り返さない。
// 本番(3939)は使わず、一時の設定・一時のポートでサーバーを立てる。playwright が無い環境では飛ばさず失敗にする。
import test from 'node:test';
import assert from 'node:assert/strict';
import { startLocalServer } from '../../scripts/perf/lib/process.mjs';

const root = new URL('../../', import.meta.url).pathname;
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';
// 立ち絵として分かる小さな画像(64×64、ふちが青緑・まん中が赤)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAcElEQVR42u3aMREAIAwEwch5/4MIXAUBVKko2OIMbH2VvfrnCgAAAAAAAAAAAAAAAAAAAAAwrpOnAQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAMEgAAAAAAAAAAAAAAAAAAAACAqwMHBt5ZHrAf2QAAAABJRU5ErkJggg==', 'base64');
const MISSING = 'deadbeefdeadbeef';

let chromium = null;
let playwrightError = null;
try { ({ chromium } = await import(PLAYWRIGHT)); } catch (error) { playwrightError = error; }
const browserTest = (name, fn) => test(name, { timeout: 120_000 }, async () => {
  assert.ok(chromium, `playwright が使えません(${PLAYWRIGHT}): ${playwrightError?.message}`);
  await fn();
});

const json = async (res) => res.json().catch(() => ({}));
const patch = async (baseUrl, pathKeys, value) => {
  const res = await fetch(`${baseUrl}/api/config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: pathKeys, value }) });
  const body = await json(res);
  assert.ok(res.ok && !body.errors?.length, `設定を保存できません: ${JSON.stringify(body.error ?? body.errors)}`);
};
const configOf = async (baseUrl) => (await json(await fetch(`${baseUrl}/api/config`))).config;
const uploadImage = async (baseUrl) => {
  const res = await fetch(`${baseUrl}/api/media-alerts?name=puchun-char.png`, { method: 'POST', headers: { 'content-type': 'image/png' }, body: PNG });
  const body = await json(res);
  assert.ok(res.ok && body.item?.id, `テスト用の画像をメディアに入れられません: ${JSON.stringify(body.error ?? body)}`);
  return body.item;
};
const sendGift = async (baseUrl, giftName = 'バラ') => {
  const res = await fetch(`${baseUrl}/api/simulate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'gift', giftName, diamonds: 1, count: 1 }) });
  assert.equal(res.status, 200, `試しのギフト(${giftName})を送れません`);
};

// ダッシュボードが「配信ソフトに入れる」に出す URL(ウィジェット一覧の URL)
async function dashboardWidgetUrl(baseUrl) {
  const payload = await json(await fetch(`${baseUrl}/api/config`));
  const widget = (payload.widgets ?? []).find((w) => w.section === 'puchuns');
  assert.ok(widget, 'ウィジェット一覧にパチンコ演出がありません');
  const url = new URL(widget.url, baseUrl);
  return `${baseUrl}${url.pathname}${url.search}`;
}

// 画面に出た絵は canvas の中なので、描画の呼び出しを外から記録する(本番コードは足さない)。
// 立ち絵は「読み込んだ画像 → 1枚の canvas に描く → 画面の canvas に貼る」ので、その2つを分けて記録する。
const INIT = () => {
  const top = window.top;
  const rec = top.__char = top.__char ?? { images: [], arts: [], texts: [] };
  const proto = window.CanvasRenderingContext2D.prototype;
  const drawImage = proto.drawImage;
  proto.drawImage = function (source, ...args) {
    try {
      if (source instanceof HTMLImageElement && source.src) {
        rec.images.push({ src: source.src, dw: args[2], dh: args[3], at: performance.now() });
        if (source.src.includes('/api/media-alerts/')) this.canvas.__charImageSrc = source.src;
      } else if (source && source.__charImageSrc) {
        rec.arts.push({
          src: source.__charImageSrc, dx: args[0], dy: args[1], dw: args[2] ?? source.width, dh: args[3] ?? source.height,
          canvas: this.canvas.id, cw: this.canvas.width, ch: this.canvas.height, at: performance.now(), warming: Boolean(window.fx?.warming),
        });
        if (!this.canvas.__charImageSrc) this.canvas.__charImageSrc = source.__charImageSrc;
      }
    } catch {}
    return drawImage.apply(this, [source, ...args]);
  };
  const fillText = proto.fillText;
  proto.fillText = function (text, ...args) {
    rec.texts.push(String(text));
    return fillText.apply(this, [text, ...args]);
  };
};

// 配信ソフトの代わりのページを開く。iframe の出入りと、canvas に描かれた絵・字を記録する
async function openOverlay(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const requested = [];
  const pageErrors = [];
  page.on('request', (request) => { if (request.url().includes('/api/media-alerts/')) requested.push(request.url()); });
  page.on('pageerror', (error) => pageErrors.push(error.message));
  await page.addInitScript(INIT);
  await page.addInitScript(() => {
    const top = window.top;
    if (window !== top) return;
    top.__plays = { added: 0, removed: 0 };
    new MutationObserver((records) => {
      for (const record of records) {
        for (const node of record.addedNodes) if (node.classList?.contains('puchun-play')) top.__plays.added += 1;
        for (const node of record.removedNodes) if (node.classList?.contains('puchun-play')) top.__plays.removed += 1;
      }
    }).observe(document, { childList: true, subtree: true });
  });
  await page.goto(await dashboardWidgetUrl(baseUrl), { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(1500); // サーバーにつながるのを待つ
  return { page, requested, pageErrors };
}

async function withOverlay(run) {
  const server = await startLocalServer(root);
  const browser = await chromium.launch({ headless: true });
  try {
    await run({ browser, baseUrl: server.baseUrl });
  } finally {
    await browser.close();
    await server.stop();
  }
}

const iframeSrc = (page) => page.evaluate(() => document.querySelector('iframe.puchun-play')?.src ?? null);

// ---- AC-1 ----

test('AC-1 puchuns の1件に charImage を API で保存でき、書かなければ空が既定になる', async () => {
  const server = await startLocalServer(root);
  try {
    const media = await uploadImage(server.baseUrl);
    await patch(server.baseUrl, ['puchuns', 'a'], { preset: 'cutin', gifts: ['バラ'], charImage: media.id });
    await patch(server.baseUrl, ['puchuns', 'b'], { preset: 'cutin', gifts: ['バラ'] });
    const config = await configOf(server.baseUrl);
    assert.equal(config.puchuns?.a?.charImage, media.id, 'charImage を API で保存して読み戻せません');
    assert.equal(config.puchuns?.b?.charImage, '', 'charImage を書かなければ空が既定になるはずです');
  } finally {
    await server.stop();
  }
});

browserTest('AC-1 存在しない mediaId でも、演出は止まらず最後まで流れる(絵だけ影になる)', async () => {
  await withOverlay(async ({ browser, baseUrl }) => {
    await patch(baseUrl, ['puchuns', 'a'], { preset: 'cutin', gifts: ['バラ'], charImage: MISSING });
    const { page, pageErrors } = await openOverlay(browser, baseUrl);
    try {
      await sendGift(baseUrl);
      await page.waitForSelector('iframe.puchun-play', { state: 'attached', timeout: 20_000 });
      await page.waitForFunction(() => window.__plays.removed >= 1, null, { timeout: 20_000, polling: 100 });
      assert.equal(await page.locator('iframe.puchun-play').count(), 0, '最後まで流れて iframe が片付いていません');
      const drawn = await page.evaluate((needle) => window.__char.images.filter((draw) => draw.src.includes(needle)), `/api/media-alerts/${MISSING}/file`);
      assert.deepEqual(drawn, [], '存在しない画像が立ち絵として描かれています');
      assert.deepEqual(pageErrors, [], '演出中に画面の例外が出ています');
    } finally {
      await page.close();
    }
  });
});

// ---- AC-2 ----

browserTest('AC-2 実ブラウザで、charImage の画像が iframe から読まれ、立ち絵として描かれる', async () => {
  await withOverlay(async ({ browser, baseUrl }) => {
    const media = await uploadImage(baseUrl);
    await patch(baseUrl, ['puchuns', 'a'], { preset: 'cutin', gifts: ['バラ'], charImage: media.id });
    const { page, requested } = await openOverlay(browser, baseUrl);
    try {
      await sendGift(baseUrl);
      await page.waitForSelector('iframe.puchun-play', { state: 'attached', timeout: 20_000 });
      await page.waitForFunction(() => document.querySelector('iframe.puchun-play')?.src, null, { timeout: 15_000, polling: 100 });
      const src = await iframeSrc(page);
      assert.ok(src, '演出の iframe の URL がありません');
      assert.equal(new URL(src).searchParams.get('char'), `/api/media-alerts/${media.id}/file`, 'iframe に charImage の画像を渡していません');

      const file = `/api/media-alerts/${media.id}/file`;
      await page.waitForFunction((needle) => window.__char.images.some((draw) => draw.src.includes(needle) && draw.dw > 0 && draw.dh > 0), file, { timeout: 15_000, polling: 100 });
      assert.ok(requested.some((url) => url.includes(file)), 'iframe が画像を読みに行っていません');
      // 画像は下ごしらえで1枚の絵にされ、再生中に貼られる。貼られたことまでを確かめる。
      // 画面の写真はここでは撮らない: 頭なしのブラウザは WebGL の画面を2枚目から真っ黒に撮る(2026-10-31 に確かめた)。
      // 写真の証拠は puchun.html?preset=cutin&play=1&char=… を開いて最初の1枚で撮る(カードの末尾)
      await page.waitForFunction((needle) => window.__char.arts.some((draw) => draw.src.includes(needle) && !draw.warming), file, { timeout: 15_000, polling: 50 });
    } finally {
      await page.close();
    }
  });
});

// ---- AC-3 ----

browserTest('AC-3 charImage が空のとき、画面のどこにも「ここに立ち絵」が描かれない', async () => {
  await withOverlay(async ({ browser, baseUrl }) => {
    await patch(baseUrl, ['puchuns', 'a'], { preset: 'cutin', gifts: ['バラ'] });
    const { page } = await openOverlay(browser, baseUrl);
    try {
      await sendGift(baseUrl);
      await page.waitForSelector('iframe.puchun-play', { state: 'attached', timeout: 10_000 });
      await page.waitForFunction(() => window.__plays.removed >= 1, null, { timeout: 20_000, polling: 100 });
      const texts = await page.evaluate(() => window.__char.texts.slice());
      assert.ok(!texts.includes('ここに立ち絵'), '立ち絵を入れていないのに「ここに立ち絵」の字が描かれています');
    } finally {
      await page.close();
    }
  });
});
