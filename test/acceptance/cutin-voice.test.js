// カード docs/cards/cutin-voice.md の AC-1〜4 を確かめる受け入れテスト。
// AC-5(変更前に落ちる証拠)・AC-7(dev での再生確認)・AC-8(README)・AC-6(npm test)はここでは書かない。
// 実ブラウザ(playwright)で、public/ をそのまま配る小さな静的サーバーの cutin.html を開き、設定と WebSocket だけ差し替えて動かす。
// playwright が無い環境では飛ばさず失敗にする。
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { defaultsFor } from '../../src/schema.js';

const publicDir = new URL('../../public/', import.meta.url).pathname;
const PLAYWRIGHT = '/home/lul/ruu-work/tw/node_modules/playwright/index.mjs';
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml' };

// public/ を配るだけのサーバー(API は無い。必要なものはブラウザ側の route で差し替える)
async function startStaticServer() {
  const server = http.createServer((req, res) => {
    const file = path.join(publicDir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
    if (!file.startsWith(publicDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404).end(); return; }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] ?? 'application/octet-stream' }).end(fs.readFileSync(file));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { baseUrl: `http://127.0.0.1:${server.address().port}`, stop: () => new Promise((resolve) => server.close(resolve)) };
}

const VOICE_KEYS = ['blueVoice', 'greenVoice', 'redVoice', 'goldVoice', 'rainbowVoice'];
const ID = { blue: 'aaaa00000001', green: 'aaaa00000002', red: 'aaaa00000003', gold: 'aaaa00000004', missing: 'deadbeef0000' };
// 無音の最小 WAV(音声として読み込めればよい)
const WAV = Buffer.from('UklGRiQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YQAAAAA=', 'base64');
const COINS = { blue: 100, green: 300, red: 1000, gold: 5000 };

// ページが始まる前に入れる: 偽の WebSocket、音声要素の play の記録、カットインの段階の記録
const INIT = () => {
  window.__sockets = [];
  window.__plays = [];
  window.__stageSeen = { play: 0, promote: 0, ended: 0 };
  window.WebSocket = class {
    constructor(url) { this.url = url; this.readyState = 1; window.__sockets.push(this); }
    send() {}
    close() {}
  };
  const play = HTMLMediaElement.prototype.play;
  HTMLMediaElement.prototype.play = function () {
    window.__plays.push(this.currentSrc || this.src);
    return play.apply(this, arguments);
  };
  let playing = false;
  new MutationObserver((records) => {
    for (const r of records) {
      const el = r.target;
      if (!el || el.id !== 'stage') continue;
      const c = el.classList;
      if (c.contains('play') && !playing) { playing = true; window.__stageSeen.play++; }
      if (c.contains('promote')) window.__stageSeen.promote++;
      if (playing && !c.contains('play')) { playing = false; window.__stageSeen.ended++; }
    }
  }).observe(document, { subtree: true, attributes: true, attributeFilter: ['class'] });
};

function giftEvent(coins, draw = null) {
  const e = { kind: 'gift', user: { id: 'u1', name: 'テスト' }, gift: { id: 1, name: 'Rose', count: 1 }, totalDiamonds: coins };
  if (draw) e.cutinDraw = draw;
  return { type: 'event', event: e };
}

// 昇格を必ず起こす抽選: 赤(基準)の1つ下の青から始まる
const PROMOTE_DRAW = { premium: 0.9, pattern: 0, promote: 0, from: 0, seed: 7, rush: false };

async function withPage(settings, fn) {
  let chromium;
  try { ({ chromium } = await import(PLAYWRIGHT)); } catch (e) { assert.fail(`playwright が使えません(skip にせず失敗にする): ${e.message}`); }
  const server = await startStaticServer();
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const requested = [];
    page.on('request', (r) => { if (r.url().includes('/api/media-alerts/')) requested.push(r.url()); });
    // 設定: このテストで使う cutins.default だけを返す(ほかの項目は画面の既定値)
    await page.route('**/api/config', (route) => route.fulfill({ json: { config: { cutins: { default: settings }, active: { cutins: 'default' } }, defaults: {} } }));
    await page.route(`**/api/media-alerts/${ID.missing}/file`, (route) => route.fulfill({ status: 404, json: { error: 'メディアが見つかりません' } }));
    await page.route(/\/api\/media-alerts\/aaaa0000000\d\/file/, (route) => route.fulfill({ status: 200, contentType: 'audio/wav', body: WAV }));
    await page.addInitScript(INIT);
    await page.goto(`${server.baseUrl}/widgets/cutin.html`, { waitUntil: 'domcontentloaded', timeout: 60_000 });
    await page.waitForFunction(() => window.__sockets.length > 0, null, { timeout: 30_000 });
    // 1つ出して、帯が入り、抜けて、画面が元に戻るまで待つ
    const show = async (message) => {
      const before = await page.evaluate(() => window.__stageSeen.ended);
      await page.evaluate((m) => window.__sockets.forEach((s) => s.onmessage({ data: JSON.stringify(m) })), message);
      await page.waitForFunction((n) => window.__stageSeen.ended > n, before, { timeout: 20_000 });
      await page.waitForTimeout(500); // 遅れて鳴るもの・読み込みを待つ
    };
    const plays = () => page.evaluate(() => window.__plays.slice());
    await fn({ show, plays, requested, page });
  } finally {
    await browser.close();
    await server.stop();
  }
}

const playsOf = (list, id) => list.filter((src) => src.includes(`/api/media-alerts/${id}/file`)).length;

test('AC-1 声の項目の既定は空と0.8で、全部空なら音声を1つも読み込まず、カットインは今までどおり出る', { timeout: 120_000 }, async () => {
  const d = defaultsFor('cutins');
  for (const key of VOICE_KEYS) assert.equal(d[key], '', `${key} の既定は空`);
  assert.equal(d.voiceVolume, 0.8);
  await withPage({}, async ({ show, plays, requested }) => {
    await show(giftEvent(COINS.red));
    assert.deepEqual(await plays(), [], '音声要素を再生してはいけない');
    assert.deepEqual(requested, [], '音声(メディア)を読み込んではいけない');
  });
});

test('AC-2 redVoice を入れて赤を出すと、その音声が1回だけ鳴り、ほかの段階では鳴らない', { timeout: 180_000 }, async () => {
  await withPage({ redVoice: ID.red }, async ({ show, plays }) => {
    await show(giftEvent(COINS.blue));
    await show(giftEvent(COINS.green));
    await show(giftEvent(COINS.gold));
    assert.deepEqual(await plays(), [], '赤以外では何も鳴らさない');
    await show(giftEvent(COINS.red));
    const list = await plays();
    assert.equal(playsOf(list, ID.red), 1, `赤の声は1回だけ: ${JSON.stringify(list)}`);
    assert.equal(list.length, 1);
  });
});

test('AC-3 昇格(青→赤)のとき、鳴るのは redVoice だけで blueVoice は鳴らない', { timeout: 120_000 }, async () => {
  await withPage({ blueVoice: ID.blue, redVoice: ID.red, promote: true, promoteRate: 100 }, async ({ show, plays, page }) => {
    await show(giftEvent(COINS.red, PROMOTE_DRAW));
    assert.ok(await page.evaluate(() => window.__stageSeen.promote > 0), '昇格の描き直しが起きていない(テストの前提が崩れている)');
    const list = await plays();
    assert.equal(playsOf(list, ID.red), 1, `赤の声は1回: ${JSON.stringify(list)}`);
    assert.equal(playsOf(list, ID.blue), 0, '途中の青の声は鳴らさない');
  });
});

test('AC-4 存在しない mediaId でも、カットインは止まらず最後まで出る(声だけ鳴らない)', { timeout: 120_000 }, async () => {
  await withPage({ redVoice: ID.missing }, async ({ show, requested, page }) => {
    await show(giftEvent(COINS.red));
    assert.ok(requested.some((u) => u.includes(ID.missing)), '声を鳴らそうとして音声を取りに行く');
    // 続けてもう1つ出せる(止まっていない)
    await show(giftEvent(COINS.red));
    const seen = await page.evaluate(() => window.__stageSeen);
    assert.equal(seen.play, 2);
    assert.equal(seen.ended, 2);
  });
});
