// カード docs/cards/obs.md の完成条件(AC-1〜AC-13)を確かめる受け入れテスト。AC-14 は npm test 全体で見る。
// obs-bridge.js はブラウザのページと同じ形(location / history / WebSocket / fetch を差した vm)で動かし、
// OBS は一時ポートの偽 obs-websocket、ライコネは偽 WebSocket で作る。本物の OBS・本番には触らない。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import express from 'express';
import YAML from 'yaml';
import { WebSocketServer } from 'ws';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const KANA = /[\p{Script=Hiragana}\p{Script=Katakana}]/u;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const b64sha = (text) => crypto.createHash('sha256').update(text).digest('base64');

// 起きるまで待つ上限。全テストを並べて走らせると重くなり、3秒では足りずに落ちることがあった
const WAIT_MS = 10000;

async function waitFor(cond, ms = WAIT_MS, what = '条件') {
  const end = Date.now() + ms;
  for (;;) {
    const v = cond();
    if (v) return v;
    if (Date.now() > end) throw new Error(`${what} が ${ms}ms 以内に起きませんでした`);
    await sleep(10);
  }
}

// ---------- 偽の obs-websocket(v5) ----------
const SALT = 'lM1GncleQOaCu9lT1yeUZhFYnqhsLLP1G5lAGo3ixaI=';
const CHALLENGE = '+IxH4CnCiqpX1rM9scsNynZzbOe4KhDeYcTNS3PDaeY=';
const ORIGINAL = { positionX: 100, positionY: 50, scaleX: 1, scaleY: 1, rotation: 0, width: 1000, height: 1000, sourceWidth: 1000, sourceHeight: 1000, alignment: 5, boundsType: 'OBS_BOUNDS_NONE', boundsWidth: 1000, boundsHeight: 1000 };

const fakes = [];
async function startFakeObs({ password = null, silent = false, items = {} } = {}) {
  const f = {
    requests: [], identifies: [], violations: [], silent, password, sockets: new Set(),
    scene: 'Main',
    items: { camera: { id: 7, enabled: true, transform: { ...ORIGINAL } }, Logo: { id: 8, enabled: true, transform: { ...ORIGINAL } }, ...items },
  };
  const wss = new WebSocketServer({ host: '127.0.0.1', port: 0, handleProtocols: (set) => (set.has('obswebsocket.json') ? 'obswebsocket.json' : false) });
  await new Promise((resolve) => wss.once('listening', resolve));
  f.port = wss.address().port;
  wss.on('connection', (ws) => {
    f.sockets.add(ws);
    ws.on('close', () => f.sockets.delete(ws));
    let identified = false;
    const send = (op, d) => ws.send(JSON.stringify({ op, d }));
    send(0, { obsWebSocketVersion: '5.5.0', rpcVersion: 1, ...(password == null ? {} : { authentication: { challenge: CHALLENGE, salt: SALT } }) });
    ws.on('message', (raw) => {
      const msg = JSON.parse(String(raw));
      if (msg.op === 1) {
        f.identifies.push(msg.d);
        const good = msg.d.rpcVersion === 1 && msg.d.eventSubscriptions === 0
          && (password == null ? msg.d.authentication === undefined : msg.d.authentication === b64sha(b64sha(password + SALT) + CHALLENGE));
        if (!good) return ws.close(4009, 'Authentication failed');
        identified = true;
        return send(2, { negotiatedRpcVersion: 1 });
      }
      if (msg.op !== 6) return;
      const { requestType, requestId, requestData: data = {} } = msg.d;
      if (!identified) { f.violations.push(requestType); return ws.close(4007, 'not identified'); }
      f.requests.push({ t: Date.now(), type: requestType, data });
      if (f.silent) return;
      const ok = (responseData = {}) => send(7, { requestType, requestId, requestStatus: { result: true, code: 100 }, responseData });
      const ng = (code, comment) => send(7, { requestType, requestId, requestStatus: { result: false, code, comment } });
      const item = Object.entries(f.items).find(([, v]) => v.id === data.sceneItemId)?.[1];
      if (requestType === 'GetCurrentProgramScene') ok({ currentProgramSceneName: f.scene });
      else if (requestType === 'SetCurrentProgramScene') { f.scene = data.sceneName; ok(); }
      else if (['GetSceneItemId', 'GetSceneItemTransform', 'SetSceneItemTransform', 'SetSceneItemEnabled'].includes(requestType) && data.sceneName !== f.scene) ng(500, 'sceneName is required and must be the current scene');
      else if (requestType === 'GetSceneItemId') (f.items[data.sourceName] ? ok({ sceneItemId: f.items[data.sourceName].id }) : ng(600, 'No scene items were found'));
      else if (requestType === 'GetSceneItemTransform') (item ? ok({ sceneItemTransform: { ...item.transform } }) : ng(600, 'x'));
      else if (requestType === 'SetSceneItemTransform') (item ? (Object.assign(item.transform, data.sceneItemTransform), ok()) : ng(600, 'x'));
      else if (requestType === 'SetSceneItemEnabled') (item ? (item.enabled = data.sceneItemEnabled, ok()) : ng(600, 'x'));
      else ng(204, 'unknown');
    });
  });
  f.dropAll = () => { for (const ws of f.sockets) ws.terminate(); };
  f.stop = () => new Promise((resolve) => { f.dropAll(); wss.close(() => resolve()); });
  f.sets = () => f.requests.filter((r) => r.type === 'SetSceneItemTransform');
  f.cam = f.items.camera;
  fakes.push(f);
  return f;
}

// ---------- ブラウザのページを模した vm ----------
const pages = [];
const FAST = new Set([5000, 10000, 20000, 40000, 60000]); // 再接続と 5 秒の待ち時間だけ 1000 倍速にする
const freePort = () => new Promise((resolve) => {
  const s = net.createServer();
  s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => resolve(port)); });
});

const LUL = 3940;
function baseConfig(obs, extra = {}) {
  return {
    obs: { enabled: true, port: 4455, scene: 'Main', source: 'camera', rules: [], cooldownSeconds: 4, reduce: false, ...obs },
    cutins: { default: { goldCoins: 5000, rainbowCoins: 20000 } },
    active: { cutins: 'default' },
    ...extra,
  };
}

function startPage({ config, hash = '', search = '', fast = false, sample = false }) {
  const page = { obsLog: [], delays: [], logs: [], fetches: [], xhrs: [], lulSent: [], replace: [], doc: [], lul: null, stopped: false };
  const timers = new Set();
  const track = (t) => { t.unref?.(); timers.add(t); return t; };
  const sandbox = {
    console: { log: (...a) => page.logs.push(a.join(' ')), warn: (...a) => page.logs.push(a.join(' ')), error: (...a) => page.logs.push(a.join(' ')), info: (...a) => page.logs.push(a.join(' ')), debug: (...a) => page.logs.push(a.join(' ')) },
    setTimeout: (fn, ms, ...rest) => {
      page.delays.push(ms);
      if (page.stopped) return 0;
      return track(setTimeout(fn, fast && FAST.has(ms) ? ms / 1000 : ms, ...rest));
    },
    clearTimeout, clearInterval,
    setInterval: (fn, ms, ...rest) => (page.stopped ? 0 : track(setInterval(fn, ms, ...rest))),
    btoa: (s) => Buffer.from(s, 'latin1').toString('base64'),
    atob: (s) => Buffer.from(s, 'base64').toString('latin1'),
    fetch: (...a) => { page.fetches.push(a); return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({}), text: () => Promise.resolve('') }); },
    XMLHttpRequest: function XHR() { this.open = (...a) => page.xhrs.push(['open', ...a]); this.send = (...a) => page.xhrs.push(['send', ...a]); this.setRequestHeader = () => {}; },
    location: { protocol: 'http:', host: `127.0.0.1:${LUL}`, hostname: '127.0.0.1', port: String(LUL), pathname: '/t/KEY/widgets/obs-bridge.html', search, hash, get href() { return `http://127.0.0.1:${LUL}${this.pathname}${this.search}${this.hash}`; } },
    history: { replaceState: (...a) => { page.replace.push(a); if (!String(a[2] ?? '').includes('#')) sandbox.location.hash = ''; } },
  };
  const recordDoc = (name) => (...a) => { page.doc.push(name); return { style: {}, appendChild() {}, setAttribute() {}, addEventListener() {}, ...a[0] }; };
  sandbox.document = {
    readyState: 'complete', addEventListener: (_n, fn) => fn && setTimeout(fn, 0), removeEventListener() {},
    createElement: recordDoc('createElement'), getElementById: () => null, querySelector: () => null,
    body: { appendChild: recordDoc('appendChild'), insertAdjacentHTML: recordDoc('insertAdjacentHTML'), set innerHTML(v) { page.doc.push('innerHTML'); }, get innerHTML() { return ''; }, style: {}, classList: { add() {}, remove() {} } },
  };
  sandbox.window = sandbox; sandbox.self = sandbox; sandbox.globalThis = sandbox;
  class FakeLul {
    constructor(url) {
      this.url = url; this.readyState = 0; this.handlers = {}; page.lul = this;
      setTimeout(() => {
        this.readyState = 1; this.fire('open', {});
        setTimeout(() => this.emit({ type: 'hello', status: { mode: 'idle' }, state: {}, sample: { on: sample, until: null }, config }), 5);
      }, 0);
    }
    fire(name, ev) { (this[`on${name}`] || (() => {}))(ev); (this.handlers[name] || []).forEach((fn) => fn(ev)); }
    addEventListener(name, fn) { (this.handlers[name] ||= []).push(fn); }
    removeEventListener() {}
    send(data) { page.lulSent.push(String(data)); }
    close() { this.readyState = 3; }
    emit(msg) { this.fire('message', { data: JSON.stringify(msg) }); }
  }
  sandbox.WebSocket = function PageWebSocket(url, protocols) {
    const u = new URL(url);
    if (Number(u.port) === LUL) return new FakeLul(url);
    const ws = new globalThis.WebSocket(url, protocols);
    page.obsLog.push(url);
    pages.at(-1).obsSockets.add(ws);
    return ws;
  };
  sandbox.WebSocket.OPEN = 1; sandbox.WebSocket.CONNECTING = 0; sandbox.WebSocket.CLOSING = 2; sandbox.WebSocket.CLOSED = 3;
  page.obsSockets = new Set();
  pages.push(page);
  vm.createContext(sandbox);
  page.sandbox = sandbox;
  page.emit = (msg) => waitFor(() => page.lul, 2000, 'ライコネへの接続').then(() => page.lul.emit(msg));
  page.ready = () => waitFor(() => page.lul && page.lul.readyState === 1, 2000, 'ライコネへの接続').then(() => sleep(40));
  page.stop = () => { page.stopped = true; timers.forEach(clearTimeout); timers.forEach(clearInterval); page.obsSockets.forEach((s) => { try { s.close(); } catch {} }); };
  loadScripts(sandbox); // 最後に読む(読み込みに失敗しても片づけ用の stop は使える)
  return page;
}

function loadScripts(sandbox) {
  vm.runInContext(read('public/widgets/lib/sha256.js'), sandbox, { filename: 'sha256.js' });
  vm.runInContext(read('public/widgets/obs-bridge.js'), sandbox, { filename: 'obs-bridge.js' });
}

after(async () => {
  for (const p of pages) p.stop();
  for (const f of fakes) await f.stop();
});

// 偽 OBS つきでページを起こす。ライコネの hello(設定つき)が済むまで待つ
async function bridgeWith(obsConfig, { fake = {}, page = {} } = {}) {
  const obs = await startFakeObs(fake);
  const config = baseConfig({ port: obs.port, ...obsConfig });
  const p = startPage({ config, ...page });
  await p.ready();
  return { obs, page: p, config };
}
const rule = (on) => (p) => p.emit({ type: 'control', target: 'obs', action: 'test', data: { rule: on } });
const testRule = (p, on) => rule(on)(p);
const SHAKE = (over = {}) => ({ on: 'rainbow', do: 'shake', strength: 1.5, seconds: 0.4, ...over });
const restored = (obs, item = obs.cam) => item.transform.positionX === ORIGINAL.positionX && item.transform.positionY === ORIGINAL.positionY && item.transform.scaleX === ORIGINAL.scaleX && item.transform.scaleY === ORIGINAL.scaleY;
const moved = (r) => r.data.sceneItemTransform;

// ---------- AC-1 ----------
test('AC-1 obs-bridge.html は何も描かない(透明で空)・CDN なし・ES5 で、es5-public.test.js に足してある', () => {
  const html = read('public/widgets/obs-bridge.html');
  assert.doesNotMatch(html, /(?:src|href)\s*=\s*["']?(?:https?:)?\/\//i, '外部 CDN を読んでいる');
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '').match(/<body[^>]*>([\s\S]*)<\/body>/i)?.[1] ?? '';
  assert.equal(body.replace(/\s+/g, ''), '', 'body に描くものがある');
  assert.doesNotMatch(html, /background(?:-color)?\s*:\s*(?!transparent|none)/i);
  const es5 = read('test/es5-public.test.js');
  for (const f of ['public/widgets/obs-bridge.js', 'public/widgets/lib/sha256.js']) {
    assert.ok(es5.includes(`'${f}'`), `${f} が es5-public.test.js の files に無い`);
    assert.doesNotMatch(read(f), /=>|`|\?\.|\?\?|\b(?:let|const|class|import|export)\b/, `${f} に ES5 でない書き方がある`);
    assert.doesNotThrow(() => new vm.Script(read(f)));
    const require = createRequire(import.meta.url);
    let acorn = null;
    try { acorn = require('acorn'); } catch {}
    if (acorn) assert.doesNotThrow(() => acorn.parse(read(f), { ecmaVersion: 5, sourceType: 'script' }), f);
  }
});

// ---------- AC-2 ----------
test('AC-2 クライアント部は DOM なしの vm で読め、OBSBridge.createClient / eventsFor が使える', () => {
  const sandbox = { console, setTimeout, clearTimeout, Math, JSON, Date };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  assert.doesNotThrow(() => loadScripts(sandbox));
  assert.equal(typeof sandbox.OBSBridge.createClient, 'function');
  assert.equal(typeof sandbox.OBSBridge.eventsFor, 'function');
});

test('AC-2 公式仕様の例(パスワード supersecretpassword)で正しい authentication を作り、Identified の前に Request を送らない', async () => {
  const { obs, page } = await bridgeWith({ rules: [SHAKE()] }, { fake: { password: 'supersecretpassword' }, page: { hash: '#pw=supersecretpassword' } });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.sets().length > 0, WAIT_MS, '認証後の命令');
  assert.equal(obs.identifies.length, 1);
  const expected = b64sha(b64sha('supersecretpassword' + SALT) + CHALLENGE);
  assert.equal(obs.identifies[0].authentication, expected);
  assert.equal(obs.identifies[0].rpcVersion, 1);
  assert.equal(obs.identifies[0].eventSubscriptions, 0);
  assert.deepEqual(obs.violations, []);
});

test('AC-2 パスワードが無いとき(Hello に authentication なし)は authentication を付けずに Identify する', async () => {
  const { obs, page } = await bridgeWith({ rules: [SHAKE()] });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.sets().length > 0, WAIT_MS, '命令');
  assert.equal(obs.identifies[0].authentication, undefined);
  assert.deepEqual(obs.violations, []);
});

// ---------- AC-3 ----------
function loadSha() {
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(read('public/widgets/lib/sha256.js'), sandbox);
  const fn = Object.keys(sandbox).map((k) => sandbox[k]).find((v) => typeof v === 'function')
    ?? Object.keys(sandbox).map((k) => sandbox[k]).flatMap((v) => (v && typeof v === 'object' ? Object.values(v) : [])).find((v) => typeof v === 'function');
  assert.ok(fn, 'sha256.js が関数を公開していない');
  return (text) => {
    const out = fn(text);
    return typeof out === 'string' ? out : Array.from(out).map((b) => (b & 255).toString(16).padStart(2, '0')).join('');
  };
}
test('AC-3 sha256.js は空文字・abc・日本語・55/56/64 バイトの境界で node の crypto と一致する', () => {
  const sha = loadSha();
  const cases = ['', 'abc', 'こんにちは、ライコネ🎉', 'a'.repeat(55), 'a'.repeat(56), 'a'.repeat(63), 'a'.repeat(64), 'a'.repeat(65), 'あ'.repeat(30)];
  for (const text of cases) {
    assert.equal(sha(text).toLowerCase(), crypto.createHash('sha256').update(text, 'utf8').digest('hex'), JSON.stringify(text));
  }
});

// ---------- AC-4 ----------
function noDisplay(page) {
  assert.deepEqual(page.doc, [], '画面に何かを出している');
}
test('AC-4 パスワード違い(close 4009)は例外なく何も出さず、その動きだけ捨てる', async () => {
  const { obs, page } = await bridgeWith({ rules: [SHAKE()] }, { fake: { password: 'right' }, page: { hash: '#pw=wrong' } });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.identifies.length > 0, WAIT_MS, 'Identify');
  await sleep(300);
  assert.equal(obs.requests.length, 0);
  noDisplay(page);
});

test('AC-4 接続できないとき、つなぎ直しは 5・10・20・40・60 秒(上限 60)', async () => {
  const port = await freePort();
  const page = startPage({ config: baseConfig({ port, rules: [SHAKE()] }), fast: true });
  await page.ready();
  await testRule(page, 'rainbow');
  await waitFor(() => page.delays.filter((d) => FAST.has(d)).length >= 6, 5000, '再接続の予約');
  assert.deepEqual(page.delays.filter((d) => FAST.has(d)).slice(0, 6), [5000, 10000, 20000, 40000, 60000, 60000]);
  noDisplay(page);
});

test('AC-4 返事が来ない(5 秒)ときは例外なくその動きを捨て、あとの動きは続けられる', async () => {
  const { obs, page } = await bridgeWith({ rules: [SHAKE()], cooldownSeconds: 0 }, { fake: { silent: true }, page: { fast: true } });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.requests.length > 0, WAIT_MS, '最初の命令');
  await sleep(300); // 5 秒の待ちは 5ms に縮めてある
  assert.equal(obs.sets().length, 0);
  obs.silent = false;
  await testRule(page, 'rainbow');
  await waitFor(() => obs.sets().length > 0, 4000, '返事が戻ったあとの動き');
  noDisplay(page);
});

test('AC-4 ソースが無い(code 600)ときは何も動かさず、例外も画面も出さない', async () => {
  const { obs, page } = await bridgeWith({ source: 'nosuch', rules: [SHAKE()] });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.requests.some((r) => r.type === 'GetSceneItemId'), WAIT_MS, 'GetSceneItemId');
  await sleep(300);
  assert.equal(obs.sets().length, 0);
  noDisplay(page);
});

// ---------- AC-5 ----------
test('AC-5 揺れ: positionX/Y の変化は大きさの設定値 % 以内、間隔 33ms 以上、最後に元の値へ戻る', async () => {
  const { obs, page } = await bridgeWith({ rules: [SHAKE({ strength: 1.5, seconds: 0.5 })] });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.sets().length > 3, WAIT_MS, '揺れ');
  await waitFor(() => restored(obs) && Date.now() - obs.sets().at(-1).t > 150, WAIT_MS, '元の値へ戻る');
  const sets = obs.sets();
  const limit = 0.015 * 1000;
  for (const r of sets) {
    assert.deepEqual(Object.keys(moved(r)).filter((k) => !['positionX', 'positionY', 'scaleX', 'scaleY'].includes(k)), [], '送ってよい項目だけ');
    assert.ok(Math.abs(moved(r).positionX - ORIGINAL.positionX) <= limit + 1e-6, `X の振れ ${moved(r).positionX}`);
    assert.ok(Math.abs(moved(r).positionY - ORIGINAL.positionY) <= limit + 1e-6, `Y の振れ ${moved(r).positionY}`);
  }
  assert.ok(sets.some((r) => moved(r).positionX !== ORIGINAL.positionX || moved(r).positionY !== ORIGINAL.positionY), '動いていない');
  for (let i = 1; i < sets.length; i += 1) assert.ok(sets[i].t - sets[i - 1].t >= 32, `間隔 ${sets[i].t - sets[i - 1].t}ms`);
  const last = moved(sets.at(-1));
  assert.equal(last.positionX, ORIGINAL.positionX);
  assert.equal(last.positionY, ORIGINAL.positionY);
});

test('AC-5 reduce で揺れの強さは半分、秒数は 0.6 倍', async () => {
  const { obs, page } = await bridgeWith({ reduce: true, rules: [SHAKE({ strength: 3, seconds: 1 })] });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.sets().length > 3, WAIT_MS, '揺れ');
  await waitFor(() => restored(obs) && Date.now() - obs.sets().at(-1).t > 200, WAIT_MS, '終わり');
  const sets = obs.sets();
  for (const r of sets) {
    assert.ok(Math.abs(moved(r).positionX - ORIGINAL.positionX) <= 0.015 * 1000 + 1e-6);
    assert.ok(Math.abs(moved(r).positionY - ORIGINAL.positionY) <= 0.015 * 1000 + 1e-6);
  }
  assert.ok(sets.at(-1).t - sets[0].t <= 600 + 250, `秒数が ${sets.at(-1).t - sets[0].t}ms`);
});

test('AC-5 途中で off を受けたらすぐ元に戻し、そのあと動かさない', async () => {
  const { obs, page } = await bridgeWith({ rules: [SHAKE({ seconds: 3 })] });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.sets().length > 3, WAIT_MS, '揺れ');
  await page.emit({ type: 'control', target: 'obs', action: 'off', data: {} });
  await waitFor(() => restored(obs), 1000, '元に戻る');
  const n = obs.sets().length;
  await sleep(300);
  assert.equal(obs.sets().length, n);
  assert.ok(restored(obs));
});

test('AC-5 設定で enabled:false にしてもすぐ元に戻る', async () => {
  const { obs, page, config } = await bridgeWith({ rules: [SHAKE({ seconds: 3 })] });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.sets().length > 3, WAIT_MS, '揺れ');
  await page.emit({ type: 'config', config: { ...config, obs: { ...config.obs, enabled: false } } });
  await waitFor(() => restored(obs), 1000, '元に戻る');
  const n = obs.sets().length;
  await sleep(300);
  assert.equal(obs.sets().length, n);
});

test('AC-5 接続が切れても、つながったとき最初に保存した値へ戻す', { timeout: 15000 }, async () => {
  const { obs, page } = await bridgeWith({ rules: [SHAKE({ seconds: 3 })] });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.sets().length > 3 && !restored(obs), WAIT_MS, '揺れの途中');
  obs.dropAll();
  await waitFor(() => obs.identifies.length >= 2 && restored(obs), 9000, '再接続後に元の値へ戻る');
});

// ---------- AC-6 ----------
test('AC-6 ズーム: scale が 1 倍 → scale → 1 倍。左上以外の alignment では位置を補正しない', async () => {
  const centered = { transform: { ...ORIGINAL, alignment: 0 } };
  const { obs, page } = await bridgeWith({ rules: [{ on: 'rainbow', do: 'zoom', scale: 1.2, seconds: 0.5 }] }, { fake: { items: { camera: { id: 7, enabled: true, ...centered } } } });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.sets().length > 3, WAIT_MS, 'ズーム');
  await waitFor(() => restored(obs) && Date.now() - obs.sets().at(-1).t > 150, WAIT_MS, '元の倍率');
  const scales = obs.sets().map((r) => moved(r).scaleX);
  const peak = Math.max(...scales);
  assert.ok(Math.abs(peak - 1.2) < 0.005, `最大 ${peak}`);
  assert.ok(scales.indexOf(peak) > 0 && scales.indexOf(peak) < scales.length - 1, '行って戻っていない');
  assert.equal(scales.at(-1), 1);
  for (const r of obs.sets()) {
    assert.equal(moved(r).scaleX, moved(r).scaleY);
    assert.deepEqual(Object.keys(moved(r)).filter((k) => /^position/.test(k)), [], '位置を補正している');
  }
});

test('AC-6 boundsType が OBS_BOUNDS_NONE 以外のときも位置を補正せず scale だけ動かす', async () => {
  const bounded = { transform: { ...ORIGINAL, boundsType: 'OBS_BOUNDS_STRETCH' } };
  const { obs, page } = await bridgeWith({ rules: [{ on: 'rainbow', do: 'zoom', scale: 1.2, seconds: 0.4 }] }, { fake: { items: { camera: { id: 7, enabled: true, ...bounded } } } });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.sets().length > 3, WAIT_MS, 'ズーム');
  await waitFor(() => restored(obs) && Date.now() - obs.sets().at(-1).t > 150, WAIT_MS, '元の倍率');
  for (const r of obs.sets()) assert.deepEqual(Object.keys(moved(r)).filter((k) => /^position/.test(k)), []);
});

test('AC-6 reduce でズームの幅は半分', async () => {
  const { obs, page } = await bridgeWith({ reduce: true, rules: [{ on: 'rainbow', do: 'zoom', scale: 1.2, seconds: 1 }] });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.sets().length > 3, WAIT_MS, 'ズーム');
  await waitFor(() => restored(obs) && Date.now() - obs.sets().at(-1).t > 150, WAIT_MS, '元の倍率');
  const peak = Math.max(...obs.sets().map((r) => moved(r).scaleX));
  assert.ok(peak <= 1.1 + 0.005 && peak > 1.02, `最大 ${peak}`);
});

// ---------- AC-7 ----------
test('AC-7 場面: GetCurrentProgramScene で元を覚え、SetCurrentProgramScene で替え、backSeconds 後に戻す', async () => {
  const { obs, page } = await bridgeWith({ rules: [{ on: 'jackpot', do: 'scene', name: 'Party', backSeconds: 1 }] });
  await testRule(page, 'jackpot');
  await waitFor(() => obs.requests.filter((r) => r.type === 'SetCurrentProgramScene').length === 2, 4000, '場面の往復');
  const types = obs.requests.map((r) => r.type);
  assert.ok(types.indexOf('GetCurrentProgramScene') < types.indexOf('SetCurrentProgramScene'));
  const sets = obs.requests.filter((r) => r.type === 'SetCurrentProgramScene');
  assert.equal(sets[0].data.sceneName, 'Party');
  assert.equal(sets[1].data.sceneName, 'Main');
  assert.ok(sets[1].t - sets[0].t >= 900, `戻すまで ${sets[1].t - sets[0].t}ms`);
});

test('AC-7 backSeconds が 0 なら戻さない', async () => {
  const { obs, page } = await bridgeWith({ rules: [{ on: 'jackpot', do: 'scene', name: 'Party', backSeconds: 0 }] });
  await testRule(page, 'jackpot');
  await waitFor(() => obs.scene === 'Party', WAIT_MS, '場面が替わる');
  await sleep(500);
  assert.equal(obs.scene, 'Party');
});

test('AC-7 hide / show: GetSceneItemId → SetSceneItemEnabled、seconds 後に元へ戻す', async () => {
  const { obs, page } = await bridgeWith({ rules: [{ on: 'rainbow', do: 'hide', item: 'Logo', seconds: 1 }, { on: 'gold', do: 'show', item: 'Logo', seconds: 1 }] });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.requests.filter((r) => r.type === 'SetSceneItemEnabled').length === 2, 4000, '消して戻す');
  const enabled = obs.requests.filter((r) => r.type === 'SetSceneItemEnabled');
  assert.equal(obs.requests.find((r) => r.type === 'GetSceneItemId' && r.data.sourceName === 'Logo').data.sourceName, 'Logo');
  assert.deepEqual(enabled.map((r) => [r.data.sceneItemId, r.data.sceneItemEnabled]), [[8, false], [8, true]]);
  assert.ok(enabled[1].t - enabled[0].t >= 900);
  obs.items.Logo.enabled = false;
  await testRule(page, 'gold');
  await waitFor(() => obs.requests.filter((r) => r.type === 'SetSceneItemEnabled').length === 4, 4000, '出して戻す');
  assert.deepEqual(obs.requests.filter((r) => r.type === 'SetSceneItemEnabled').slice(2).map((r) => r.data.sceneItemEnabled), [true, false]);
});

// ---------- AC-8 ----------
function loadBridgeApi() {
  const sandbox = { console, setTimeout, clearTimeout, Math, JSON, Date };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  loadScripts(sandbox);
  return sandbox.OBSBridge;
}
const gift = (totalDiamonds, extra = {}) => ({ type: 'event', event: { kind: 'gift', totalDiamonds, ...extra }, state: {} });
const onsOf = (api, msg, config) => Array.from(api.eventsFor(msg, config) ?? []).map((x) => (typeof x === 'string' ? x : x.on));

test('AC-8 eventsFor: 虹・金・スロット・RUSH・ボス・ガチャを表で当てはめる', () => {
  const api = loadBridgeApi();
  const config = baseConfig({});
  const table = [
    [gift(20000), ['rainbow']],
    [gift(99999), ['rainbow']],
    [gift(19999), ['gold']],
    [gift(5000), ['gold']],
    [gift(4999), []],
    [gift(20000, { test: true }), ['rainbow']],
    [{ type: 'event', event: { kind: 'like', totalDiamonds: 99999 } }, []],
    [{ type: 'slot', event: 'start', result: { tier: 'jackpot' } }, ['jackpot']],
    [{ type: 'slot', event: 'start', result: { tier: 'big' } }, ['slotBig']],
    [{ type: 'slot', event: 'start', result: { tier: 'small' } }, []],
    [{ type: 'slot', event: 'start', result: { tier: 'lose' } }, []],
    [{ type: 'slot', event: 'done', result: { tier: 'jackpot' } }, []],
    [{ type: 'rush', event: { kind: 'start' } }, ['rushStart']],
    [{ type: 'rush', event: { kind: 'end' } }, ['rushEnd']],
    [{ type: 'rush', event: { kind: 'config' } }, []],
    [{ type: 'boss', event: { kind: 'defeat' } }, ['bossDefeat']],
    [{ type: 'boss', event: { kind: 'damage' } }, []],
    [{ type: 'gacha', event: 'reveal', tier: { id: 'ssr', pity: true } }, ['gachaTop']],
    [{ type: 'gacha', event: 'reveal', tier: { id: 'n', pity: false } }, []],
    [{ type: 'gacha', event: 'start', tier: null }, []],
  ];
  for (const [msg, expected] of table) assert.deepEqual(onsOf(api, msg, config), expected, JSON.stringify(msg));
});

test('AC-8 eventsFor: cutins が複数あるときは active.cutins の基準を使う', () => {
  const api = loadBridgeApi();
  const config = baseConfig({}, { cutins: { default: { goldCoins: 5000, rainbowCoins: 20000 }, small: { goldCoins: 100, rainbowCoins: 200 } }, active: { cutins: 'small' } });
  assert.deepEqual(onsOf(api, gift(200), config), ['rainbow']);
  assert.deepEqual(onsOf(api, gift(150), config), ['gold']);
  assert.deepEqual(onsOf(api, gift(99), config), []);
});

test('AC-8 eventsFor: enabled:false では動かさない', () => {
  const api = loadBridgeApi();
  const config = baseConfig({ enabled: false });
  for (const msg of [gift(20000), { type: 'rush', event: { kind: 'start' } }, { type: 'boss', event: { kind: 'defeat' } }]) assert.deepEqual(onsOf(api, msg, config), []);
});

test('AC-8 見本モード(hello の sample が on)では動かさず、enabled:false でも OBS へつながない', async () => {
  const a = await bridgeWith({ rules: [SHAKE()] }, { page: { sample: true } });
  await a.page.emit(gift(20000));
  await testRule(a.page, 'rainbow');
  await sleep(400);
  assert.equal(a.obs.requests.length, 0);
  const b = await bridgeWith({ enabled: false, rules: [SHAKE()] });
  await b.page.emit(gift(20000));
  await sleep(400);
  assert.equal(b.obs.requests.length, 0);
});

// ---------- AC-9 ----------
test('AC-9 同じ on はクールダウン内に続けて動かさず、別の on は動かす', async () => {
  const { obs, page } = await bridgeWith({ cooldownSeconds: 4, rules: [SHAKE({ seconds: 0.2 }), { on: 'rushStart', do: 'zoom', scale: 1.1, seconds: 0.3 }] });
  await page.emit(gift(20000));
  await waitFor(() => obs.sets().length > 2, WAIT_MS, '1 回目の揺れ');
  await waitFor(() => restored(obs) && Date.now() - obs.sets().at(-1).t > 150, WAIT_MS, '1 回目の終わり');
  const n = obs.sets().length;
  await page.emit(gift(20000));
  await sleep(500);
  assert.equal(obs.sets().length, n, '2 回目が動いた');
  await page.emit({ type: 'rush', rush: {}, event: { kind: 'start' } });
  await waitFor(() => obs.sets().some((r) => moved(r).scaleX > 1.05), WAIT_MS, '別の on');
});

test('AC-9 揺れとズームは同じソースに重ならず、上から順に動く', async () => {
  const centered = { transform: { ...ORIGINAL, alignment: 0 } };
  const { obs, page } = await bridgeWith({ rules: [SHAKE({ seconds: 0.3 }), { on: 'rainbow', do: 'zoom', scale: 1.1, seconds: 0.3 }] }, { fake: { items: { camera: { id: 7, enabled: true, ...centered } } } });
  await page.emit(gift(20000));
  await waitFor(() => obs.sets().some((r) => moved(r).scaleX > 1.05) && restored(obs), 4000, '揺れのあとのズーム');
  const sets = obs.sets();
  const shakeIdx = sets.map((r, i) => (moved(r).positionX !== undefined && (moved(r).positionX !== ORIGINAL.positionX || moved(r).positionY !== ORIGINAL.positionY) ? i : -1)).filter((i) => i >= 0);
  const zoomIdx = sets.map((r, i) => (moved(r).scaleX !== undefined && moved(r).scaleX !== 1 ? i : -1)).filter((i) => i >= 0);
  assert.ok(shakeIdx.length && zoomIdx.length);
  assert.ok(Math.max(...shakeIdx) < Math.min(...zoomIdx), '揺れとズームが重なっている');
});

test('レビュー2: 再接続しても最初に受け取ったパスワードで再認証する', async () => {
  const password = 'reconnect-secret';
  const { obs } = await bridgeWith({ rules: [SHAKE({ seconds: 0.2 })] }, { fake: { password }, page: { hash: `#pw=${password}`, fast: true } });
  await waitFor(() => obs.identifies.length === 1, 1000, '最初のIdentify');
  obs.dropAll();
  await waitFor(() => obs.identifies.length >= 2, 9000, '再接続後のIdentify');
  assert.equal(obs.identifies[1].authentication, obs.identifies[0].authentication);
});

test('レビュー3: 無効で始めても設定変更でOBSへつながり、カットイン閾値を保つ', async () => {
  const { obs, page, config } = await bridgeWith({ enabled: false, rules: [SHAKE({ seconds: 0.2 })] });
  await page.emit({ type: 'config', config: { obs: { ...config.obs, enabled: true }, cutins: { default: { goldCoins: 50, rainbowCoins: 100 } }, active: { cutins: 'default' } } });
  await page.emit(gift(120));
  await waitFor(() => obs.sets().length > 0, WAIT_MS, '再有効化後の演出');
  assert.equal(obs.identifies.length, 1);
});

test('レビュー4: 演出中に別のonが来ても、最初の動きの元の値へ戻る', async () => {
  const { obs, page } = await bridgeWith({ cooldownSeconds: 0, rules: [SHAKE({ seconds: 0.6 }), { on: 'rushStart', do: 'zoom', scale: 1.2, seconds: 0.6 }] });
  await testRule(page, 'rainbow');
  await sleep(100);
  await testRule(page, 'rushStart');
  await waitFor(() => restored(obs), WAIT_MS, '重なった演出の復元');
  const sets = obs.sets();
  assert.ok(sets.some((r) => moved(r).positionX !== ORIGINAL.positionX), '最初の演出が動いていない');
  assert.ok(!sets.some((r) => moved(r).scaleX > 1.05), '後の演出が重なっている');
});

// ---------- AC-10 ----------
test('AC-10 パスワードは location.hash の pw= から読み、読んだら history.replaceState で # を消し、どこにも送らない', async () => {
  const pw = 'hunter2-secret-pw';
  const { obs, page } = await bridgeWith({ rules: [SHAKE()] }, { fake: { password: pw }, page: { hash: `#pw=${pw}` } });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.sets().length > 0, WAIT_MS, '認証して動く');
  assert.ok(page.replace.length >= 1, 'history.replaceState を呼んでいない');
  assert.equal(page.sandbox.location.hash, '');
  assert.ok(page.replace.every((a) => !String(a[2] ?? '').includes(pw) && !String(a[2] ?? '').includes('#')));
  const everything = JSON.stringify([page.fetches.map((a) => [...a].map(String)), page.xhrs, page.lulSent, page.logs, page.obsLog.filter((u) => u.includes(String(LUL)))]);
  assert.ok(!everything.includes(pw), 'パスワードが fetch / XHR / ライコネの WebSocket / ログのどれかに出ている');
  assert.ok(!page.obsLog.some((u) => u.includes(pw)), 'OBS の URL にパスワードがある');
});

test('AC-10 パスワードは search(?pw=)からは読まない', async () => {
  const pw = 'from-query-string';
  const { obs, page } = await bridgeWith({ rules: [SHAKE()] }, { fake: { password: pw }, page: { search: `?pw=${pw}` } });
  await testRule(page, 'rainbow');
  await waitFor(() => obs.identifies.length > 0, WAIT_MS, 'Identify');
  await sleep(200);
  assert.equal(obs.requests.length, 0);
});

test('AC-10 schema に password を含む項目は無く、obs-bridge.js はパスワードをログに出さない', async () => {
  const { SCHEMA } = await import('../../src/schema.js');
  assert.ok(SCHEMA.obs, 'schema に obs が無い');
  assert.deepEqual(Object.keys(SCHEMA.obs.fields).filter((k) => /pass|pw|secret/i.test(k)), []);
  const source = read('public/widgets/obs-bridge.js');
  for (const line of source.split('\n').filter((l) => /console\./.test(l))) assert.doesNotMatch(line, /pass|pw|secret|auth/i, line);
});

// ---------- AC-11 ----------
const cfgDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-obs-ac-'));
process.env.TW_CONFIG = path.join(cfgDir, 'config.yaml');
const cfg = await import('../../src/config.js');
after(() => fs.rmSync(cfgDir, { recursive: true, force: true }));

test('AC-11 schema の obs に日本語の説明がつき、パスワードを送らない理由がある', async () => {
  const { SCHEMA } = await import('../../src/schema.js');
  const s = SCHEMA.obs;
  assert.equal(s.kind, 'object');
  assert.equal(s.page, 'obs-bridge');
  assert.deepEqual(Object.keys(s.fields).sort(), ['cooldownSeconds', 'enabled', 'port', 'reduce', 'rules', 'scene', 'source']);
  assert.equal(s.fields.enabled.default, false);
  assert.equal(s.fields.port.default, 4455);
  assert.equal(s.fields.scene.default, '');
  assert.equal(s.fields.source.default, '');
  assert.equal(s.fields.cooldownSeconds.default, 4);
  assert.equal(s.fields.reduce.default, false);
  assert.match(s.desc, KANA);
  for (const [name, f] of Object.entries(s.fields)) assert.match(f.desc ?? '', KANA, `${name} に日本語の説明が無い`);
  const text = [s.desc, ...Object.values(s.fields).map((f) => f.desc)].join('\n');
  assert.match(text, /パスワード/);
  assert.match(text, /送|保存/);
});

test('AC-11 config.example.yaml に obs の既定(enabled: false)があり、エラーも警告もなく読める', () => {
  const text = read('config.example.yaml');
  assert.match(text, /^obs:/m);
  const parsed = YAML.parse(text);
  assert.equal(parsed.obs.enabled, false);
  const { errors, warnings, config } = cfg.normalize(parsed);
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(config.obs.enabled, false);
});

test('AC-11 初期のルール: rainbow → shake + zoom / jackpot → shake / rushStart → zoom / bossDefeat → shake', () => {
  const { config } = cfg.normalize({});
  const rules = config.obs.rules;
  const pick = (on) => rules.filter((r) => r.on === on);
  assert.deepEqual(pick('rainbow').map((r) => r.do), ['shake', 'zoom']);
  assert.equal(pick('rainbow')[1].scale, 1.08);
  assert.deepEqual(pick('jackpot').map((r) => r.do), ['shake']);
  assert.deepEqual(pick('rushStart').map((r) => [r.do, r.scale, r.seconds]), [['zoom', 1.06, 1]]);
  assert.deepEqual(pick('bossDefeat').map((r) => [r.do, r.strength, r.seconds]), [['shake', 1.2, 0.6]]);
  assert.equal(config.obs.enabled, false);
});

test('AC-11 強さ・秒・scale の範囲外は日本語のエラーになる', () => {
  const bad = [
    { on: 'rainbow', do: 'shake', strength: 3.5 },
    { on: 'rainbow', do: 'shake', strength: 0.05 },
    { on: 'rainbow', do: 'shake', seconds: 3.5 },
    { on: 'rainbow', do: 'shake', seconds: 0.1 },
    { on: 'rainbow', do: 'zoom', scale: 1.6 },
    { on: 'rainbow', do: 'zoom', scale: 0.9 },
  ];
  for (const r of bad) {
    const { errors } = cfg.normalize({ obs: { rules: [r] } });
    assert.ok(errors.length > 0, `${JSON.stringify(r)} がエラーにならない`);
    assert.ok(errors.some((e) => KANA.test(e)), `日本語のエラーでない: ${errors}`);
  }
  const ok = cfg.normalize({ obs: { rules: [{ on: 'rainbow', do: 'shake', strength: 3, seconds: 3 }, { on: 'rushStart', do: 'zoom', scale: 1.5 }] } });
  assert.deepEqual(ok.errors, []);
});

// ---------- AC-12 ----------
test('AC-12 「かんたん」の「豪華な演出」に obs が出て、呼び名・ひとこと・まとまり・まとめ文がある', () => {
  const src = read('public/dashboard/simple.js');
  const groups = src.match(/export const GROUPS = \[([\s\S]*?)\n\];/)[1];
  assert.match(groups.match(/\['豪華な演出',\s*\[([^\]]*)\]/)[1], /'obs'/);
  assert.match(src, /\n\s*obs:\s*\{\s*icon:\s*'video',\s*desc:\s*'[^']*[\p{Script=Hiragana}][^']*'/u);
  assert.match(src, /export const SIMPLE = \{[\s\S]*\n  obs:\s*\{\s*\n?\s*groups:/);
  assert.match(src, /'obs\.enabled':\s*'[^']*[\p{Script=Hiragana}\p{Script=Han}]/u);
  assert.match(src, /'obs\.source':/);
  assert.match(src, /const SUMMARY = \{[\s\S]*\n  obs:\s*\(/);
  assert.match(src, /['"]#pw=['"]|#pw=/, '使い方の文に #pw= の説明が無い');
});

// ---------- AC-13 ----------
test('AC-13 POST /api/control {target:obs, action:test, data:{rule}} が接続中のウィジェットに control として届く', async () => {
  const { createStore } = await import('../../src/config.js');
  const { createRuntime } = await import('../../src/runtime.js');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-obs-rt-'));
  const runtime = createRuntime({ id: 'test', store: createStore(path.join(dir, 'config.yaml')), dataDir: dir, mediaDirs: [dir] });
  const app = express();
  app.use(express.json());
  app.use(runtime.router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const sent = [];
  runtime.hub.addClient({ readyState: 1, send: (t) => sent.push(JSON.parse(t)), on() {} });
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/control`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ target: 'obs', action: 'test', data: { rule: 'rainbow' } }),
    });
    assert.equal(res.status, 200);
    assert.deepEqual(sent.at(-1), { type: 'control', target: 'obs', action: 'test', data: { rule: 'rainbow' } });
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await runtime.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

async function withRecorder(run) {
  const hits = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      hits.push({ method: req.method, url: req.url, body: Buffer.concat(chunks).toString() });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ ok: true, state: { topGifters: [] }, timers: {}, rush: {} }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-obs-cli-'));
  fs.copyFileSync(path.join(root, 'config.example.yaml'), path.join(dir, 'config.yaml'));
  fs.mkdirSync(path.join(dir, 'data'));
  const env = { ...process.env, TW_CONFIG: path.join(dir, 'config.yaml'), TW_DATA: path.join(dir, 'data'), TW_SERVER: `http://127.0.0.1:${server.address().port}` };
  for (const k of ['TW_HOSTED', 'TW_AI_TOKEN', 'TW_AI_TENANT', 'TW_ENV', 'PORT', 'TW_VAULT', 'TW_ADMIN_TOKEN']) delete env[k];
  try { await run({ hits, env }); } finally {
    await new Promise((resolve) => { server.closeAllConnections?.(); server.close(resolve); });
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
const controlPosts = (hits) => hits.filter((h) => h.method === 'POST' && h.url === '/api/control').map((h) => JSON.parse(h.body));
const EXPECTED_POST = { target: 'obs', action: 'test', data: { rule: 'rainbow' } };

test('AC-13 tw obs rainbow は同じ POST を送る', async () => {
  await withRecorder(async ({ hits, env }) => {
    const child = spawn(process.execPath, [path.join(root, 'bin', 'tw.js'), 'obs', 'rainbow'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
    await new Promise((resolve) => child.once('exit', resolve));
    assert.deepEqual(controlPosts(hits), [EXPECTED_POST]);
  });
});

test('AC-13 MCP の obs ツールも同じ POST を送る', { timeout: 70000 }, async () => {
  await withRecorder(async ({ hits, env }) => {
    const child = spawn(process.execPath, [path.join(root, 'mcp', 'server.js')], { cwd: root, env, stdio: ['pipe', 'pipe', 'pipe'] });
    let buffer = '';
    const waiting = new Map();
    let nextId = 1;
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      for (let i = buffer.indexOf('\n'); i !== -1; i = buffer.indexOf('\n')) {
        const raw = buffer.slice(0, i); buffer = buffer.slice(i + 1);
        let msg = null; try { msg = JSON.parse(raw); } catch {}
        if (msg?.id != null && waiting.has(msg.id)) { waiting.get(msg.id)(msg); waiting.delete(msg.id); }
      }
    });
    const request = (method, params) => new Promise((resolve) => {
      const id = nextId++;
      waiting.set(id, resolve);
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
    });
    try {
      await request('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'acceptance', version: '0.0.0' } });
      child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized', params: {} })}\n`);
      const tools = (await request('tools/list', {})).result.tools;
      const tool = tools.find((t) => t.name === 'obs');
      assert.ok(tool, 'MCP に obs ツールが無い');
      const props = Object.keys(tool.inputSchema?.properties ?? {});
      const key = props.includes('rule') ? 'rule' : props[0];
      assert.ok(key, 'obs ツールに引数が無い');
      const out = await request('tools/call', { name: 'obs', arguments: { [key]: 'rainbow' } });
      assert.ok(!out.error && !out.result?.isError, JSON.stringify(out));
      assert.deepEqual(controlPosts(hits), [EXPECTED_POST]);
    } finally {
      child.kill();
      await new Promise((resolve) => child.once('exit', resolve));
    }
  });
});
