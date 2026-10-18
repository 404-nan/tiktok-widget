// docs/cards/combo.md の AC-1・2・6・9・10・11(設定・配線)。実装より前に書いた受け入れテスト。
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SCHEMA, defaultsFor } from '../../src/schema.js';
import { normalize, parseText, createStore, EXAMPLE_PATH } from '../../src/config.js';
import { createRuntime, OBS_ALLOWED, FEATURES } from '../../src/runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8');

function boot(entitled = () => true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-combo-ac-'));
  const file = path.join(dir, 'config.yaml');
  fs.copyFileSync(EXAMPLE_PATH, file);
  const rt = createRuntime({ id: 'c1', store: createStore(file), dataDir: dir, mediaDirs: [], entitled });
  return { rt, dir };
}
const gift = (coins = 10, user = { id: 'u1', name: 'たろう' }) => ({ kind: 'gift', user, gift: { name: 'Rose', id: '9', count: 1 }, totalDiamonds: coins });

test('AC-1 SCHEMA.combo の見出しと項目・既定値', () => {
  const s = SCHEMA.combo;
  assert.equal(s.kind, 'object');
  assert.equal(s.page, 'combo');
  assert.equal(s.title, 'コンボ(擬似連)');
  assert.deepEqual(s.size(), [1080, 1920]);
  assert.match(s.desc, /[\p{Script=Hiragana}\p{Script=Katakana}]/u);
  assert.deepEqual(defaultsFor('combo'), {
    enabled: true, seconds: 10, gifts: [], minCoins: 1,
    blueAt: 2, greenAt: 3, redAt: 4, goldAt: 5, rainbowAt: 6,
    endText: 'COMBO', sound: true, volume: 0.5,
  });
  for (const [k, f] of Object.entries(s.fields)) assert.match(f.desc ?? '', /\S/, `${k} に日本語の説明がある`);
  const f = s.fields;
  assert.equal(f.seconds.min, 1);
  assert.equal(f.seconds.max, 120);
  assert.equal(f.minCoins.min, 1);
  for (const k of ['blueAt', 'greenAt', 'redAt', 'goldAt', 'rainbowAt']) {
    assert.equal(f[k].min, 2, k);
    assert.equal(f[k].max, 999, k);
  }
  assert.equal(f.volume.min, 0);
  assert.equal(f.volume.max, 1);
});

test('AC-1 normalize は combo の初期値を返し、ひな形はエラーなく読める', () => {
  const { config, errors } = normalize({});
  assert.deepEqual(errors, []);
  assert.deepEqual(config.combo, defaultsFor('combo'));
  assert.deepEqual(parseText(fs.readFileSync(EXAMPLE_PATH, 'utf8')).errors, []);
});

test('AC-2 境目が逆だと日本語のエラー', () => {
  for (const bad of [{ blueAt: 5, greenAt: 3 }, { greenAt: 9, redAt: 4 }, { goldAt: 8, rainbowAt: 7 }]) {
    const { errors } = normalize({ combo: bad });
    assert.ok(errors.some((e) => e.includes('combo') && /[\p{Script=Hiragana}\p{Script=Katakana}\p{Script=Han}]/u.test(e)), JSON.stringify(bad));
  }
  assert.deepEqual(normalize({ combo: { blueAt: 2, greenAt: 2, redAt: 2, goldAt: 2, rainbowAt: 2 } }).errors, []);
  assert.deepEqual(normalize({ combo: { blueAt: 2, greenAt: 4, redAt: 7, goldAt: 12, rainbowAt: 20 } }).errors, []);
});

test('AC-6 OBS 用の鍵で /api/combo を読める', () => {
  assert.ok(OBS_ALLOWED.some((re) => re.test('/api/combo')));
  assert.ok(!OBS_ALLOWED.some((re) => re.test('/api/combo/reset')));
});

test('AC-6 readCombo 相当: GET /api/combo は snapshot と同じ中身', async () => {
  const { rt } = boot();
  try {
    const layer = rt.router.stack.find((l) => l.route?.path === '/api/combo' && l.route.methods.get);
    assert.ok(layer, 'GET /api/combo がある');
    let body;
    layer.route.stack[0].handle({}, { json: (b) => { body = b; } });
    assert.deepEqual(Object.keys(body).sort(), ['active', 'last', 'now', 'seconds']);
    assert.deepEqual(body.active, []);
  } finally {
    await rt.close();
  }
});

test('AC-9 performControl: status / reset。使えないときは 403', async () => {
  const { rt } = boot();
  try {
    const st = rt.performControl('combo', 'status');
    assert.equal(st.status, 200);
    assert.deepEqual(Object.keys(st.body.combo ?? {}).sort(), ['active', 'last', 'now', 'seconds']);
    rt.hub.publish(gift());
    rt.hub.publish(gift());
    assert.equal(rt.performControl('combo', 'status').body.combo.active.length, 1);
    const r = rt.performControl('combo', 'reset');
    assert.equal(r.status, 200);
    assert.equal(rt.performControl('combo', 'status').body.combo.active.length, 0);
  } finally {
    await rt.close();
  }
  const off = boot((f) => f !== 'combo');
  try {
    const out = off.rt.performControl('combo', 'reset');
    assert.equal(out.status, 403);
    assert.match(out.body.error, /[\p{Script=Hiragana}\p{Script=Katakana}]/u);
  } finally {
    await off.rt.close();
  }
});

test('AC-8 管理者が使えなくしている(entitled false)と数えない', async () => {
  const { rt } = boot((f) => f !== 'combo');
  try {
    rt.hub.publish(gift());
    rt.hub.publish(gift());
    assert.equal(rt.performControl('combo', 'status').body.combo.active.length, 0);
  } finally {
    await rt.close();
  }
});

test('AC-9 test: 開発環境以外は 403。開発環境では 400ms 間隔で count 回、本番のコンボに入れない', async () => {
  const keep = { TW_ENV: process.env.TW_ENV, PORT: process.env.PORT };
  const { rt } = boot();
  try {
    delete process.env.TW_ENV;
    const denied = rt.performControl('combo', 'test', { user: { id: 'x', name: 'X' } });
    assert.equal(denied.status, 403);
    assert.match(denied.body.error, /[\p{Script=Hiragana}\p{Script=Katakana}]/u);

    process.env.TW_ENV = 'dev';
    process.env.PORT = '3940';
    const sent = [];
    const orig = rt.hub.broadcast.bind(rt.hub);
    rt.hub.broadcast = (m) => { sent.push(m); orig(m); };
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 5_000_000 });
    const ok = rt.performControl('combo', 'test', { user: { id: 'x', name: 'X' }, count: 4 });
    assert.equal(ok.status, 200);
    mock.timers.tick(400 * 4);
    const tested = sent.filter((m) => m.type === 'combo' && m.test === true);
    assert.ok(tested.length >= 1);
    assert.equal(tested.at(-1).event.count, 4);
    assert.equal(sent.filter((m) => m.type === 'combo' && !m.test).length, 0);
    assert.deepEqual(rt.performControl('combo', 'status').body.combo.active, []);
  } finally {
    mock.timers.reset();
    for (const [k, v] of Object.entries(keep)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await rt.close();
  }
});

test('AC-9 test の count は最大 20 回', async () => {
  const keep = { TW_ENV: process.env.TW_ENV, PORT: process.env.PORT };
  const { rt } = boot();
  try {
    process.env.TW_ENV = 'dev';
    process.env.PORT = '3940';
    const sent = [];
    const orig = rt.hub.broadcast.bind(rt.hub);
    rt.hub.broadcast = (m) => { sent.push(m); orig(m); };
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 5_000_000 });
    rt.performControl('combo', 'test', { user: { id: 'x', name: 'X' }, count: 500 });
    mock.timers.tick(400 * 60);
    const hits = sent.filter((m) => m.type === 'combo' && m.test === true && m.event.kind === 'hit');
    assert.equal(hits.at(-1).event.count, 20);
  } finally {
    mock.timers.reset();
    for (const [k, v] of Object.entries(keep)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
    await rt.close();
  }
});

test('AC-9 POST /api/control と GET /api/combo/:action の口がある', async () => {
  const { rt } = boot();
  try {
    const paths = rt.router.stack.filter((l) => l.route).map((l) => l.route.path);
    assert.ok(paths.includes('/api/combo'));
    assert.ok(paths.includes('/api/combo/:action'));
  } finally {
    await rt.close();
  }
});

test('AC-9 admin.combo / mcp の combo ツール / tw の combo / AI の operate 権限', async () => {
  const admin = await import('../../src/admin.js');
  assert.equal(typeof admin.combo, 'function');
  assert.match(read('mcp/server.js'), /'combo'/);
  assert.match(read('bin/tw.js'), /case 'combo'/);
  assert.match(read('src/ai-api.js'), /combo:\s*\{\s*scope:\s*'operate',\s*mutate:\s*true,\s*operate:\s*true\s*\}/);
  assert.match(read('src/ai-mcp.js'), /registerTool\('combo'/);
});

test('AC-10 かんたん設定に combo、試すボタンに 5連続とリセット', () => {
  const simple = read('public/dashboard/simple.js');
  assert.match(simple, /combo/);
  for (const k of ['seconds', 'gifts', 'minCoins', 'endText', 'enabled']) assert.ok(simple.includes(k));
  assert.match(simple, /続けてギフトすると ×2 ×3 と数字が出て、色が上がっていく/);
  assert.match(simple, /ゆっくり 15秒/);
  assert.match(simple, /すぐ上がる/);
  assert.match(simple, /ゆっくり上がる/);
  const editor = read('public/dashboard/editor.js');
  assert.match(editor, /tab === 'combo'/);
  assert.match(editor, /control\('combo',\s*'test',\s*\{\s*count:\s*5\s*\}\)/);
  assert.match(editor, /5連続を試す/);
});

test('AC-11 FEATURES.combo は最後で、最初は使えない豪華な演出。ページは combo.html', () => {
  const keys = Object.keys(FEATURES);
  assert.equal(keys.at(-1), 'combo');
  assert.equal(FEATURES.combo.premium, true);
  assert.deepEqual(FEATURES.combo.pages, ['combo.html']);
});

test('AC-11 widgetList に combo が自動で出る', async () => {
  const { rt } = boot();
  try {
    const list = rt.readWidgets('http://127.0.0.1:3939');
    assert.ok(list.some((w) => w.section === 'combo'));
  } finally {
    await rt.close();
  }
});
