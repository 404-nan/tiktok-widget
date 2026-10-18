// docs/cards/info-feed.md の完成条件(AC)を確かめるテスト。
// AC-1〜4 は Hub と InfoFeed を直接、AC-13・14 は config の検証と runtime の FEATURES、
// AC-5〜12・15・16 は画面そのものを動かさず、ファイルの中身で確かめる(画面は撮影で確かめる)。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { Hub } from '../../src/hub.js';
import { normalize, createStore } from '../../src/config.js';
import { createRuntime, FEATURES, featureOfPage } from '../../src/runtime.js';

const root = path.resolve(import.meta.dirname, '..', '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const { InfoFeed } = await import('../../src/info-feed.js').catch(() => ({}));
const need = () => assert.equal(typeof InfoFeed, 'function', 'src/info-feed.js が InfoFeed を export していない');

const user = (name, id = name) => ({ id, name, avatar: `https://example.com/${name}.png` });
const gift = (name, diamonds, count = 1, id = '5655') => ({ id, name, nameJa: null, diamonds, count });
const giftEvent = (u, g, extra = {}) => ({ kind: 'gift', user: u, gift: g, totalDiamonds: g.diamonds * g.count, ...extra });

function setup() {
  const hub = new Hub();
  const feed = new InfoFeed(hub);
  return { hub, feed };
}

// --- AC-1 ---
test('AC-1 follow・gift・share を新しい順に持ち、user.id は入れない', () => {
  need();
  const { hub, feed } = setup();
  hub.publish({ kind: 'follow', user: user('a') });
  hub.publish(giftEvent(user('b'), gift('Rose', 1, 5)));
  hub.publish({ kind: 'share', user: user('c') });
  hub.publish({ kind: 'like', user: user('d'), count: 3 });
  hub.publish({ kind: 'chat', user: user('e'), text: 'こんにちは' });
  const { items } = feed.snapshot();
  assert.deepEqual(items.map((i) => i.kind), ['share', 'gift', 'follow']);
  const g = items[1];
  assert.equal(g.user.name, 'b');
  assert.equal(g.user.avatar, 'https://example.com/b.png');
  assert.equal(g.coins, 5);
  assert.equal(g.gift.name, 'Rose');
  assert.equal(g.gift.count, 5);
  assert.equal(g.gift.diamonds, 1);
  assert.ok('id' in g && 'ts' in g && 'nameJa' in g.gift && 'id' in g.gift);
  for (const i of items) assert.equal('id' in i.user, false, 'user.id を持ってはいけない');
  assert.equal(items[2].gift, undefined);
});

test('AC-1 最大 30 件で、古いものから落ちる', () => {
  need();
  const { hub, feed } = setup();
  for (let n = 0; n < 35; n++) hub.publish({ kind: 'follow', user: user(`u${n}`) });
  const { items } = feed.snapshot();
  assert.equal(items.length, 30);
  assert.equal(items[0].user.name, 'u34');
  assert.equal(items[29].user.name, 'u5');
});

// --- AC-2 ---
test('AC-2 テスト送信と demo_ のユーザーは test: true の印つきで入る', () => {
  need();
  const { hub, feed } = setup();
  hub.publish({ kind: 'follow', user: user('t'), test: true });
  hub.publish({ kind: 'follow', user: user('d', 'demo_1') });
  hub.publish({ kind: 'follow', user: user('real') });
  const { items } = feed.snapshot();
  assert.equal(items.length, 3);
  assert.notEqual(items[0].test, true);
  assert.equal(items[1].test, true);
  assert.equal(items[2].test, true);
});

test('AC-2 配信中のテスト送信は testEvent だけで届き、snapshot には入らない', () => {
  need();
  const { hub, feed } = setup();
  hub.setStatus({ mode: 'live' });
  const shown = [];
  hub.on('event', () => shown.push('event'));
  hub.publish({ kind: 'follow', user: user('t'), test: true });
  assert.deepEqual(shown, [], 'hub は live 中のテストで event を出さない');
  assert.equal(feed.snapshot().items.length, 0);
});

test('AC-2 testEvent は画面に出すだけ(WebSocket で配る)で、snapshot に入らない', () => {
  need();
  const hub = new Hub();
  const sent = [];
  const realBroadcast = hub.broadcast.bind(hub);
  hub.broadcast = (msg) => { sent.push(msg); realBroadcast(msg); };
  const feed = new InfoFeed(hub);
  hub.setStatus({ mode: 'live' });
  sent.length = 0;
  hub.publish({ kind: 'follow', user: user('t'), test: true });
  assert.equal(feed.snapshot().items.length, 0);
  // 画面には hub が配る event がそのまま届く
  assert.ok(sent.some((m) => m.type === 'event' && m.event.kind === 'follow'));
});

// --- AC-3 ---
test('AC-3 reset で空になり、snapshot は { items }、close で購読を外す', () => {
  need();
  const { hub, feed } = setup();
  hub.publish({ kind: 'follow', user: user('a') });
  assert.deepEqual(Object.keys(feed.snapshot()), ['items']);
  assert.equal(feed.snapshot().items.length, 1);
  hub.reset();
  assert.deepEqual(feed.snapshot().items, []);
  hub.publish({ kind: 'follow', user: user('b') });
  const listeners = ['event', 'testEvent', 'reset'].map((n) => hub.listenerCount(n));
  feed.close();
  ['event', 'testEvent', 'reset'].forEach((n, i) => assert.ok(hub.listenerCount(n) < listeners[i] || listeners[i] === 0, `${n} の購読が残っている`));
  const before = feed.snapshot().items.length;
  hub.publish({ kind: 'follow', user: user('c') });
  assert.equal(feed.snapshot().items.length, before);
});

// --- AC-4 ---
test('AC-4 GET /api/info-feed が snapshot を返し、OBS 用の鍵でも読める', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-info-feed-'));
  const mk = async (role) => {
    const runtime = createRuntime({ id: role ?? 'dash', store: createStore(path.join(dir, `${role ?? 'dash'}.yaml`)), dataDir: dir, mediaDirs: [dir] });
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => { if (role) req.role = role; next(); });
    app.use(runtime.router);
    const server = createServer(app);
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    return { runtime, server, url: `http://127.0.0.1:${server.address().port}` };
  };
  const dash = await mk(null);
  const obs = await mk('obs');
  try {
    for (const { url } of [dash, obs]) {
      const res = await fetch(`${url}/api/info-feed`);
      assert.equal(res.status, 200);
      assert.deepEqual(await res.json(), { items: [] });
    }
  } finally {
    dash.server.close();
    obs.server.close();
    await dash.runtime.close();
    await obs.runtime.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// --- AC-13 ---
test('AC-13 tickers・supporters の既定値と範囲', () => {
  const ok = normalize({ tickers: { main: {} }, supporters: { main: {} } });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.warnings, []);
  const t = ok.config.tickers.main;
  assert.deepEqual(
    { label: t.label, messages: t.messages, showGifts: t.showGifts, giftCount: t.giftCount, minCoins: t.minCoins, showGoals: t.showGoals, goals: t.goals, speed: t.speed, fontSize: t.fontSize, color: t.color },
    { label: 'お知らせ', messages: [], showGifts: true, giftCount: 5, minCoins: 1, showGoals: true, goals: [], speed: 120, fontSize: 26, color: 'accent' },
  );
  const s = ok.config.supporters.main;
  assert.deepEqual(
    { title: s.title, events: s.events, minCoins: s.minCoins, limit: s.limit, avatars: s.avatars, lifetime: s.lifetime, color: s.color },
    { title: '最近のサポーター', events: ['follow', 'gift'], minCoins: 1, limit: 5, avatars: true, lifetime: 0, color: 'accent' },
  );
});

test('AC-13 範囲の外はエラーになる', () => {
  const bad = (section, field, values) => {
    for (const v of values) {
      const r = normalize({ [section]: { main: { [field]: v } } });
      assert.ok(r.errors.length > 0, `${section}.${field}=${JSON.stringify(v)} はエラーになるはず`);
    }
  };
  bad('tickers', 'giftCount', [0, 21]);
  bad('tickers', 'minCoins', [-1]);
  bad('tickers', 'speed', [29, 601]);
  bad('tickers', 'fontSize', [15, 61]);
  bad('supporters', 'limit', [0, 11]);
  bad('supporters', 'lifetime', [-1, 3601]);
  bad('supporters', 'minCoins', [-1]);
  bad('supporters', 'events', [['chat']]);
  const good = normalize({ tickers: { main: { giftCount: 20, speed: 30, fontSize: 60 } }, supporters: { main: { limit: 10, lifetime: 3600 } } });
  assert.deepEqual(good.errors, []);
});

test('AC-13 config.example.yaml は変わっていない', () => {
  const text = read('config.example.yaml');
  assert.doesNotMatch(text, /^tickers:|^supporters:/m);
});

// --- AC-14 ---
test('AC-14 FEATURES に tickers・supporters があり、premium ではない', () => {
  for (const key of ['tickers', 'supporters']) {
    assert.ok(FEATURES[key], `${key} が FEATURES にない`);
    assert.notEqual(FEATURES[key].premium, true);
  }
  assert.equal(featureOfPage('ticker.html'), 'tickers');
  assert.equal(featureOfPage('supporters.html'), 'supporters');
});

// --- AC-5〜12: 画面のファイル ---
const WIDGET_FILES = ['public/widgets/ticker.html', 'public/widgets/ticker.js', 'public/widgets/supporters.html', 'public/widgets/supporters.js', 'public/widgets/lib/telop.js'];

test('AC-5〜12 ウィジェットのファイルがある', () => {
  for (const f of ['src/info-feed.js', ...WIDGET_FILES]) assert.ok(fs.existsSync(path.join(root, f)), `${f} がない`);
});

test('AC-12 ウィジェットの JS は ES5 で、es5-public.test.js の files に入っている', () => {
  const es5 = read('test/es5-public.test.js');
  for (const f of ['public/widgets/ticker.js', 'public/widgets/supporters.js', 'public/widgets/lib/telop.js']) {
    assert.ok(es5.includes(`'${f}'`), `${f} が es5-public.test.js の files にない`);
    const code = read(f);
    assert.doesNotMatch(code, /=>|`|\?\.|\?\?|\b(?:let|const|class|import|export)\b/, f);
  }
});

test('AC-12 外部 CDN なし・フォントは /vendor/fonts/・overlay.css の変数・テーマ・base', () => {
  for (const f of ['public/widgets/ticker.html', 'public/widgets/supporters.html']) {
    const html = read(f);
    assert.doesNotMatch(html, /https?:\/\//, `${f} に外部 URL`);
    assert.match(html, /lib\/overlay\.css/, f);
    assert.match(html, /\/vendor\/fonts\//, f);
  }
  for (const f of ['public/widgets/ticker.js', 'public/widgets/supporters.js']) {
    const js = read(f);
    assert.doesNotMatch(js, /https?:\/\/(?!127\.0\.0\.1|localhost)/, `${f} に外部 URL`);
    assert.match(js, /location\.pathname/, `${f} が location.pathname から base を取っていない`);
    assert.match(js, /theme/, `${f} が theme を扱っていない`);
  }
});

test('AC-5・8 ticker は /api/sample を読み、WebSocket の sample を受け、?preview=1 を扱う', () => {
  const js = read('public/widgets/ticker.js');
  assert.match(js, /\/api\/sample/);
  assert.match(js, /preview/);
  assert.match(js, /'sample'|"sample"/);
  assert.match(js, /goals/);
  assert.match(js, /step/);
});

test('AC-9・10 supporters は /api/info-feed を読み、WebSocket の event と reset を扱う', () => {
  const js = read('public/widgets/supporters.js');
  assert.match(js, /\/api\/info-feed/);
  assert.match(js, /'event'|"event"/);
  assert.match(js, /reset/);
  assert.match(js, /lifetime/);
  assert.match(js, /minCoins/);
});

// --- AC-15 ---
test('AC-15 「かんたん」: GROUPS・INFO・SIMPLE・SIMPLE_LABELS・SUMMARY', () => {
  const src = read('public/dashboard/simple.js');
  const groups = src.match(/\['お礼・にぎやかし', \[([^\]]*)\]\]/);
  assert.ok(groups, 'GROUPS の「お礼・にぎやかし」が見つからない');
  assert.match(groups[1], /'tickers'/);
  assert.match(groups[1], /'supporters'/);
  assert.match(src, /^\s*tickers: \{ icon: '[a-z0-9-]+', desc: '.+' \},?$/m);
  assert.match(src, /^\s*supporters: \{ icon: '[a-z0-9-]+', desc: '.+' \},?$/m);
  const block = (name) => {
    const m = src.match(new RegExp(`^  ${name}: \\{\\n([\\s\\S]*?)\\n  \\},?$`, 'm'));
    assert.ok(m, `SIMPLE.${name} がない`);
    return m[1];
  };
  const tickers = block('tickers');
  assert.match(tickers, /'流すもの'[^\n]*'label', 'messages', 'showGifts', 'giftCount'/);
  assert.match(tickers, /'目標'[^\n]*'showGoals', 'goals'/);
  assert.match(tickers, /'見た目'[^\n]*'speed', 'color'/);
  const supporters = block('supporters');
  assert.match(supporters, /'出すもの'[^\n]*'events', 'limit', 'minCoins'/);
  assert.match(supporters, /'見た目'[^\n]*'avatars', 'lifetime', 'color'/);
  for (const key of ['tickers.label', 'tickers.messages', 'tickers.showGifts', 'tickers.giftCount', 'tickers.showGoals', 'tickers.goals', 'tickers.speed', 'tickers.color',
    'supporters.events', 'supporters.limit', 'supporters.minCoins', 'supporters.avatars', 'supporters.lifetime', 'supporters.color']) {
    assert.ok(src.includes(`'${key}'`), `SIMPLE_LABELS に ${key} がない`);
  }
  const summary = src.slice(src.indexOf('const SUMMARY'));
  assert.match(summary, /^\s*tickers: /m);
  assert.match(summary, /^\s*supporters: /m);
});

// --- AC-16 ---
test('AC-16 試すボタン: 両方に「テストギフト」「フォロー」(/api/simulate)', () => {
  const src = read('public/dashboard/editor.js');
  const from = src.indexOf('function fillActions');
  const body = src.slice(from);
  for (const tab of ['tickers', 'supporters']) {
    assert.match(body, new RegExp(`'${tab}'`), `fillActions に ${tab} の分岐がない`);
  }
  const i = Math.min(body.indexOf("'tickers'"), body.indexOf("'supporters'"));
  const part = body.slice(i, i + 900);
  assert.match(part, /テストギフト/);
  assert.match(part, /フォロー/);
  assert.match(part, /\/api\/simulate/);
});
