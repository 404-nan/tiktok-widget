// カード docs/cards/puchun-e2e.md の AC-1〜5 を、本物のサーバーと実ブラウザで通しで確かめる受け入れテスト。
// 一時の設定でサーバーを別ポートに立て、ギフトは「試しのイベント」(/api/simulate)で送る。本番(3939)は使わない。
// 画面に出た字は canvas の中なので、画面の中で fillText と、その字の canvas を貼る drawImage を外から記録する(本番コードは足さない)。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startLocalServer } from '../../scripts/perf/lib/process.mjs';

const root = new URL('../../', import.meta.url).pathname;
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';
const SHOT = path.join(root, 'artifacts/shots/puchun-e2e.png');
const MAIN_TEXT = 'テスト当たり';
const JACKPOT_MS = 6500; // public/widgets/puchun/puchun.html の jackpot の長さ

// AC-5: playwright が無い環境では飛ばさず、失敗にする
let chromium = null;
let playwrightError = null;
try { ({ chromium } = await import(PLAYWRIGHT)); } catch (error) { playwrightError = error; }
const e2eTest = (name, fn) => test(name, { timeout: 120_000 }, async () => {
  assert.ok(chromium, `playwright が使えません(${PLAYWRIGHT}): ${playwrightError?.message}`);
  await fn();
});

const json = async (res) => res.json().catch(() => ({}));
const patch = async (baseUrl, pathKeys, value) => {
  const res = await fetch(`${baseUrl}/api/config`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: pathKeys, value }) });
  const body = await json(res);
  assert.ok(res.ok && !body.errors?.length, `設定を保存できません: ${JSON.stringify(body.error ?? body.errors)}`);
};
const sendGift = async (baseUrl, giftName, count) => {
  const res = await fetch(`${baseUrl}/api/simulate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'gift', giftName, diamonds: 1, count }) });
  assert.equal(res.status, 200, `試しのギフト(${giftName}×${count})を送れません`);
};

// AC-1: 「バラで jackpot、字は『テスト当たり』」の1件を API で保存する
const savePuchun = (baseUrl) => patch(baseUrl, ['puchuns', 'rose'], { preset: 'jackpot', ratio: 'full', gifts: ['バラ'], texts: { main: MAIN_TEXT } });

// ダッシュボードが「配信ソフトに入れる」に出す URL(ウィジェット一覧の URL に id を足す)
async function dashboardWidgetUrl(baseUrl, id) {
  const payload = await json(await fetch(`${baseUrl}/api/config`));
  const widget = (payload.widgets ?? []).find((w) => w.section === 'puchuns');
  assert.ok(widget, 'ウィジェット一覧にパチンコ演出がありません');
  const url = new URL(widget.url, baseUrl);
  url.searchParams.set('id', id);
  return `${baseUrl}${url.pathname}${url.search}`;
}

// 配信ソフトの代わりのページを開く。演出が流れた回数(iframe の出入り)と、画面に書かれた字を外から記録する
async function openOverlay(browser, baseUrl) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript(() => {
    const top = window.top;
    if (window === top) {
      top.__plays = { added: 0, removed: 0 };
      new MutationObserver((records) => {
        for (const record of records) {
          for (const node of record.addedNodes) if (node.classList?.contains('puchun-play')) top.__plays.added += 1;
          for (const node of record.removedNodes) if (node.classList?.contains('puchun-play')) top.__plays.removed += 1;
        }
      }).observe(document, { childList: true, subtree: true });
    }
    top.__drawn = top.__drawn ?? [];
    const original = CanvasRenderingContext2D.prototype.fillText;
    CanvasRenderingContext2D.prototype.fillText = function fillText(text, ...rest) {
      top.__drawn.push({ text: String(text), warming: Boolean(window.fx?.warming), at: performance.now() });
      this.canvas.__text = String(text);
      return original.call(this, text, ...rest);
    };
    // 字は下ごしらえで別の canvas に1回だけ描かれ、再生中はその canvas を drawImage で貼る。
    // 字の canvas から作った canvas にも同じ字の印を付け、再生中に貼られたら「再生中の字」として数える
    const originalDraw = CanvasRenderingContext2D.prototype.drawImage;
    CanvasRenderingContext2D.prototype.drawImage = function drawImage(source, ...rest) {
      const text = source?.__text;
      if (text) {
        if (window.fx?.warming) this.canvas.__text = text;
        else top.__drawn.push({ text, warming: false, at: performance.now() });
      }
      return originalDraw.call(this, source, ...rest);
    };
  });
  await page.goto(await dashboardWidgetUrl(baseUrl, 'rose'), { waitUntil: 'load', timeout: 60_000 });
  await page.waitForTimeout(1500); // 画面がサーバーにつながるのを待つ
  return page;
}

async function withOverlay(run) {
  const server = await startLocalServer(root);
  const browser = await chromium.launch({ headless: true });
  try {
    await savePuchun(server.baseUrl);
    const page = await openOverlay(browser, server.baseUrl);
    await run({ page, baseUrl: server.baseUrl });
  } finally {
    await browser.close();
    await server.stop();
  }
}

const plays = (page) => page.evaluate(() => ({ ...window.__plays }));

e2eTest('AC-1 一時の設定のサーバーに、バラで jackpot・字「テスト当たり」の1件が API で保存される', async () => {
  const server = await startLocalServer(root);
  try {
    await savePuchun(server.baseUrl);
    const payload = await json(await fetch(`${server.baseUrl}/api/config`));
    const saved = payload.config?.puchuns?.rose;
    assert.ok(saved, '保存した puchuns が読み戻せません');
    assert.equal(saved.preset, 'jackpot');
    assert.deepEqual(saved.gifts, ['バラ']);
    assert.equal(saved.texts?.main, MAIN_TEXT);
  } finally {
    await server.stop();
  }
});

e2eTest('AC-2 配信ソフトの URL を開き、バラ×1 を送ると、10秒以内に画面に「テスト当たり」が見える', async () => {
  await withOverlay(async ({ page, baseUrl }) => {
    await sendGift(baseUrl, 'バラ', 1);
    await page.waitForSelector('iframe.puchun-play', { state: 'attached', timeout: 10_000 });
    await page.waitForFunction((text) => window.__drawn.some((draw) => draw.text === text), MAIN_TEXT, { timeout: 10_000, polling: 100 });
    await page.waitForTimeout(300); // 字が出た直後ではなく、描き終わった画面を撮る
    fs.mkdirSync(path.dirname(SHOT), { recursive: true });
    await page.screenshot({ path: SHOT });
    assert.ok(fs.statSync(SHOT).size > 0, '画面の写真が空です');
  });
});

e2eTest('AC-6 下ごしらえの字を数えず、jackpot の文字時刻後に見えている canvas を撮る', async () => {
  await withOverlay(async ({ page, baseUrl }) => {
    await sendGift(baseUrl, 'バラ', 1);
    await page.waitForSelector('iframe.puchun-play', { state: 'attached', timeout: 10_000 });
    await page.waitForTimeout(3500); // jackpot の文字時刻(3.15秒)を過ぎてから見る
    const frame = page.frames().find((candidate) => candidate !== page.mainFrame() && candidate.url().includes('/widgets/puchun/puchun.html'));
    assert.ok(frame, '演出の iframe が見つかりません');
    const evidence = await frame.evaluate(() => {
      const canvas = document.getElementById('fx');
      return { visible: canvas.toDataURL() !== document.createElement('canvas').toDataURL(), ready: window.fxReady === true };
    });
    const draws = await page.evaluate((text) => window.__drawn.filter((draw) => draw.text === text), MAIN_TEXT);
    assert.ok(draws.some((draw) => draw.warming), '下ごしらえで字が描かれていません');
    assert.ok(draws.some((draw) => !draw.warming), '再生中の字を数えられません');
    assert.ok(evidence.ready && evidence.visible, '文字時刻後の見えている canvas が空です');

    fs.mkdirSync(path.dirname(SHOT), { recursive: true });
    await page.screenshot({ path: SHOT });
    assert.ok(fs.statSync(SHOT).size > 0, '画面の写真が空です');
  });
});

e2eTest('AC-3 バラ×3 を送ると、演出が3回流れ終わる', async () => {
  await withOverlay(async ({ page, baseUrl }) => {
    await sendGift(baseUrl, 'バラ', 3);
    await page.waitForFunction(() => window.__plays.removed >= 3, null, { timeout: 3 * JACKPOT_MS + 15_000, polling: 200 });
    await page.waitForTimeout(1500); // 4回目が続かないことも見る
    assert.deepEqual(await plays(page), { added: 3, removed: 3 });
  });
});

e2eTest('AC-4 合わないギフト(バラ以外)では何も出ない', async () => {
  await withOverlay(async ({ page, baseUrl }) => {
    await sendGift(baseUrl, 'ドーナツ', 1);
    await page.waitForTimeout(4000);
    assert.deepEqual(await plays(page), { added: 0, removed: 0 }, 'バラ以外のギフトで演出が流れました');
    assert.equal(await page.locator('iframe.puchun-play').count(), 0);
    // 画面がつながっていたことの確かめ(つながっていないだけで何も出ない、を見逃さない)
    await sendGift(baseUrl, 'バラ', 1);
    await page.waitForSelector('iframe.puchun-play', { state: 'attached', timeout: 10_000 });
  });
});
