// 綱引きギフトバトル（src/tug-of-war.js）のテスト。チームの振り分け・引く力・コンボと逆転・時間切れと大差の決着・MVP、
// テスト送信が本物の集計や決着の動作に入らないこと、Plus プランの鍵とつながることを確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { Hub } from '../src/hub.js';
import { TugOfWarEngine, normalizeWord, TOP_SHOWN } from '../src/tug-of-war.js';
import { createStore } from '../src/config.js';
import { createRuntime } from '../src/runtime.js';
import { defaultsFor } from '../src/schema.js';
import { FEATURES, featureOfPage, OBS_ALLOWED } from '../src/runtime-features.js';
import { planAllowsFeature, requiredPlanFor } from '../src/plans.js';
import { Tenants } from '../src/tenants.js';
import { setActiveErrorLog } from '../src/error-log.js';

function setup(extra = {}, hooks = {}) {
  const hub = new Hub();
  const sent = [];
  hub.broadcast = (msg) => sent.push(msg);
  const engine = new TugOfWarEngine(hub, hooks);
  engine.setConfig({ ...defaultsFor('tugOfWar'), ...extra });
  return { hub, engine, sent };
}

const user = (name) => ({ id: `u_${name}`, name, avatar: null });
const chat = (hub, name, text, more = {}) => hub.emit('event', { kind: 'chat', text, user: user(name), ...more });
const gift = (hub, name, coins, more = {}) => hub.emit('event', {
  kind: 'gift', user: user(name), gift: { id: '5655', name: 'Rose', diamonds: coins, count: 1 }, totalDiamonds: coins, ...more,
});
const lastHit = (sent) => sent.filter((m) => m.type === 'tugOfWar' && m.event === 'hit').at(-1)?.hit;

test('参加の言葉は全角・半角と大文字小文字、空白をそろえて比べる', () => {
  assert.equal(normalizeWord(' １ '), '1');
  assert.equal(normalizeWord('ＲＥＤ'), 'red');
  assert.equal(normalizeWord('赤 組'), '赤組');
});

test('コメントでチームに入り、試合中のギフトのコインがそのチームの引く力になる', () => {
  const { hub, engine } = setup();
  chat(hub, 'さくら', '１');
  chat(hub, 'ゆうと', '青');
  assert.equal(engine.snapshot().left.members, 1);
  assert.equal(engine.snapshot().right.members, 1);
  // 試合の前のギフトは数えない
  gift(hub, 'さくら', 100);
  assert.equal(engine.snapshot().left.power, 0);
  engine.start();
  gift(hub, 'さくら', 100);
  gift(hub, 'ゆうと', 30);
  const s = engine.snapshot();
  assert.equal(s.phase, 'battle');
  assert.equal(s.left.power, 100);
  assert.equal(s.right.power, 30);
  assert.equal(s.leader, 'left');
  assert.equal(s.left.top[0].user.name, 'さくら');
});

test('チーム替えは allowSwitch がオンのときだけ。オフなら最初のチームのまま', () => {
  const off = setup();
  chat(off.hub, 'さくら', '1');
  chat(off.hub, 'さくら', '2');
  assert.deepEqual([off.engine.snapshot().left.members, off.engine.snapshot().right.members], [1, 0]);
  const on = setup({ allowSwitch: true });
  chat(on.hub, 'さくら', '1');
  chat(on.hub, 'さくら', '2');
  assert.deepEqual([on.engine.snapshot().left.members, on.engine.snapshot().right.members], [0, 1]);
});

test('チームに入っていない人のギフトは、balance なら人数の少ない方へ入れ、none なら数えない', () => {
  const auto = setup();
  chat(auto.hub, 'さくら', '1');
  auto.engine.start();
  gift(auto.hub, 'みお', 50);
  assert.equal(auto.engine.snapshot().right.power, 50, '人数の少ない右へ入る');
  assert.equal(auto.engine.snapshot().right.members, 1);
  const none = setup({ autoJoin: 'none' });
  none.engine.start();
  gift(none.hub, 'みお', 50);
  assert.equal(none.engine.snapshot().left.power + none.engine.snapshot().right.power, 0);
});

test('加勢ギフトは、送った人のチームに関係なく決めたチームの力になる', () => {
  const { hub, engine } = setup({ rightGifts: ['Rose'] });
  chat(hub, 'さくら', '1');
  engine.start();
  gift(hub, 'さくら', 10);
  assert.equal(engine.snapshot().right.power, 10);
  assert.equal(engine.snapshot().left.power, 0);
});

test('いいねは likesPerPower が 0 なら数えず、決めたら その数ごとに 1 の力', () => {
  const off = setup();
  chat(off.hub, 'さくら', '1');
  off.engine.start();
  off.hub.emit('event', { kind: 'like', user: user('さくら'), count: 50 });
  assert.equal(off.engine.snapshot().left.power, 0);
  const on = setup({ likesPerPower: 10 });
  chat(on.hub, 'さくら', '1');
  on.engine.start();
  on.hub.emit('event', { kind: 'like', user: user('さくら'), count: 50 });
  assert.equal(on.engine.snapshot().left.power, 5);
});

test('同じチームのギフトが続くとコンボが上がり、相手のギフトで切れる。抜き返したら逆転を知らせる', () => {
  const { hub, engine, sent } = setup();
  chat(hub, 'さくら', '1');
  chat(hub, 'ゆうと', '2');
  engine.start();
  gift(hub, 'さくら', 10);
  gift(hub, 'さくら', 10);
  assert.equal(lastHit(sent).combo, 2);
  gift(hub, 'ゆうと', 15);
  assert.equal(lastHit(sent).combo, 1);
  assert.equal(lastHit(sent).reversal, false, '並ぶ前の追い上げは逆転ではない');
  assert.equal(engine.snapshot().left.combo, 0);
  gift(hub, 'ゆうと', 10);
  assert.equal(lastHit(sent).reversal, true);
  assert.equal(engine.snapshot().reversals, 1);
  assert.equal(engine.snapshot().leader, 'right');
});

test('時間切れで力の大きい方が勝ち、MVP は勝ったチームでいちばん引いた人。決着の動作を1回動かす', async () => {
  const results = [];
  const { hub, engine } = setup({ seconds: 1 }, { onResult: (r) => results.push(r) });
  chat(hub, 'さくら', '1');
  chat(hub, 'たろう', '1');
  chat(hub, 'ゆうと', '2');
  engine.start({ seconds: 1 });
  gift(hub, 'さくら', 30);
  gift(hub, 'たろう', 80);
  gift(hub, 'ゆうと', 100);
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const s = engine.snapshot();
  assert.equal(s.phase, 'result');
  assert.equal(s.reason, 'timeout');
  assert.equal(s.winner, 'left');
  assert.equal(s.mvp.user.name, 'たろう');
  assert.equal(results.length, 1);
  // 決着のあとのギフトは数えない
  gift(hub, 'ゆうと', 1000);
  assert.equal(engine.snapshot().right.power, 100);
});

test('大差の決着（koLead）に届いたら、時間の前でもその場で決着する', () => {
  const { hub, engine } = setup({ koLead: 500, seconds: 0 });
  chat(hub, 'ゆうと', '2');
  engine.start();
  gift(hub, 'ゆうと', 499);
  assert.equal(engine.snapshot().phase, 'battle');
  gift(hub, 'ゆうと', 1);
  assert.equal(engine.snapshot().phase, 'result');
  assert.equal(engine.snapshot().reason, 'ko');
  assert.equal(engine.snapshot().winner, 'right');
});

test('引き分けは draw で、MVP は両チームでいちばん引いた人。決着の動作は動かさない', () => {
  const results = [];
  const { hub, engine } = setup({ seconds: 0 }, { onResult: (r) => results.push(r) });
  chat(hub, 'さくら', '1');
  chat(hub, 'ゆうと', '2');
  engine.start();
  gift(hub, 'さくら', 50);
  gift(hub, 'ゆうと', 50);
  engine.finish();
  assert.equal(engine.snapshot().winner, 'draw');
  assert.ok(engine.snapshot().mvp);
  assert.equal(results.length, 0);
});

test('テスト送信が混ざった試合は test の印がつき、決着の動作を動かさない', () => {
  const results = [];
  const { hub, engine, sent } = setup({ seconds: 0 }, { onResult: (r) => results.push(r) });
  chat(hub, 'さくら', '1');
  engine.start();
  gift(hub, 'さくら', 100, { test: true });
  engine.finish();
  assert.equal(engine.snapshot().test, true);
  assert.equal(sent.filter((m) => m.event === 'result').at(-1).test, true, 'ダッシュボードの見本にも届くようにテストの印をつけて配る');
  assert.equal(results.length, 0);
});

test('配信中のテスト送信（testEvent）でも綱は動き、test() は試合がなければテストの試合を始める', () => {
  const { hub, engine } = setup();
  const out = engine.test({ side: 'right', coins: 300, name: 'テストさん' });
  assert.equal(out.phase, 'battle');
  assert.equal(out.test, true);
  assert.equal(out.right.power, 300);
  hub.emit('testEvent', { kind: 'gift', user: user('テストさん'), gift: { id: '5655', name: 'Rose', diamonds: 1, count: 5 }, totalDiamonds: 5, test: true });
  assert.equal(engine.snapshot().left.power, 5, 'チームに入っていない人なので、人数の少ない左へ入る');
  assert.throws(() => engine.test({ side: 'middle' }), /left/);
});

test('画面に出す応援上位はチームごとに決まった人数（集計は全員ぶん）', () => {
  const { hub, engine } = setup({ seconds: 0 });
  engine.start();
  const names = ['a', 'b', 'c', 'd', 'e'];
  for (const [i, name] of names.entries()) { chat(hub, name, '1'); gift(hub, name, (i + 1) * 10); }
  const s = engine.snapshot();
  assert.equal(s.left.top.length, TOP_SHOWN);
  assert.equal(s.left.top[0].user.name, 'e');
  assert.equal(s.left.power, 150, '上位に出ない人の力も全部数える');
});

test('リセットで試合と顔ぶれを空にし、「使う」がオフやプラン外では始められない', () => {
  const { hub, engine } = setup();
  chat(hub, 'さくら', '1');
  engine.start();
  engine.reset();
  assert.equal(engine.snapshot().phase, 'idle');
  assert.equal(engine.snapshot().left.members, 0);
  engine.setConfig({ ...defaultsFor('tugOfWar'), enabled: false });
  assert.throws(() => engine.start(), /オフ/);
  engine.setConfig(defaultsFor('tugOfWar'));
  engine.setEnabled(false);
  assert.throws(() => engine.start(), /プラン/);
  assert.equal(engine.snapshot().enabled, false);
});

test('処理の失敗は onError に場所つきで渡し、試合は続ける', () => {
  const errors = [];
  const { hub, engine } = setup({ seconds: 0 }, { onError: (error, ctx) => errors.push([error.message, ctx.op]) });
  engine.start();
  // 参加の言葉の一覧が壊れていても（文字列）、例外で止めずに記録へ回す
  engine.setConfig({ ...defaultsFor('tugOfWar'), leftWords: 'こわれた' });
  chat(hub, 'さくら', '1');
  assert.equal(errors.length, 1);
  assert.equal(errors[0][1], 'tugOfWar.chat');
  assert.equal(engine.snapshot().phase, 'battle');
});

test('Plus プランの機能として登録され、ページと読み取り API がつながっている', () => {
  assert.equal(FEATURES.tugOfWar.premium, true);
  assert.equal(featureOfPage('tug-of-war.html'), 'tugOfWar');
  assert.equal(planAllowsFeature('free', 'tugOfWar'), false);
  assert.equal(planAllowsFeature('plus', 'tugOfWar'), true);
  assert.equal(planAllowsFeature('pro', 'tugOfWar'), true);
  assert.equal(requiredPlanFor('tugOfWar'), 'plus');
  assert.ok(OBS_ALLOWED.some((re) => re.test('/api/tug-of-war')));
  assert.ok(!OBS_ALLOWED.some((re) => re.test('/api/tug-of-war/test')), '配信画面用の鍵では動かせない');
  for (const file of ['index.html', 'preview.html', 'schema.js', 'widget.json']) {
    assert.ok(fs.existsSync(new URL(`../public/widgets/tug-of-war/${file}`, import.meta.url)), file);
  }
});

test('無料プランの /api/me は綱引きを Plus の鍵つき（locked）で返す', async () => {
  setActiveErrorLog(null);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-tug-me-'));
  const tenants = new Tenants({ dir, env: { TW_BILLING: 'on' } });
  const tenant = tenants.create({ name: 'ためし' });
  const app = express();
  app.use((req, _res, next) => { req.role = 'owner'; next(); });
  app.use(tenants.runtime(tenant.id).router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const me = await (await fetch(`http://127.0.0.1:${server.address().port}/api/me`)).json();
    const lock = me.locked.find((item) => item.key === 'tugOfWar');
    assert.deepEqual([lock.requiredPlan, lock.reason], ['plus', 'plan']);
    assert.ok(lock.pages.includes('tug-of-war.html'));
    assert.equal(me.features.tugOfWar, undefined);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await tenants.close(tenant.id);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('HTTP: 開始・テスト送信・締める・リセットができ、テスト送信は本物の集計に入らない。配信画面用の鍵ではテスト送信できない', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-tug-http-'));
  const dataDir = path.join(dir, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const store = createStore(path.join(dir, 'config.yaml'));
  store.replaceText(['tugOfWar:', '  seconds: 0', ''].join('\n'));
  const runtime = createRuntime({ id: 'local', store, dataDir, mediaDirs: [dir] });
  let role = 'owner';
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.role = role; next(); });
  app.use(runtime.router);
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const json = async (p, init) => (await fetch(`${base}${p}`, init)).json();
  try {
    const tested = await json('/api/tug-of-war/test?side=left&coins=250');
    assert.equal(tested.tugOfWar.phase, 'battle');
    assert.equal(tested.tugOfWar.test, true);
    assert.equal(tested.tugOfWar.left.power, 250);
    // テスト送信は hub の集計（ランキング・コインの合計）を動かさない
    assert.equal(runtime.hub.state.diamonds, 0);
    assert.equal(runtime.hub.state.topGifters.length, 0);
    const finished = await json('/api/tug-of-war/finish', { method: 'POST' });
    assert.equal(finished.tugOfWar.winner, 'left');
    const reset = await json('/api/tug-of-war/reset');
    assert.equal(reset.tugOfWar.phase, 'idle');
    const started = await json('/api/tug-of-war/start?seconds=30');
    assert.equal(started.tugOfWar.seconds, 30);
    assert.equal(started.tugOfWar.test, false);
    const twice = await fetch(`${base}/api/tug-of-war/start`);
    assert.equal(twice.status, 400);
    const bad = await fetch(`${base}/api/tug-of-war/知らない動作`);
    assert.equal(bad.status, 400);
    role = 'obs';
    const blocked = await fetch(`${base}/api/tug-of-war/test?side=right`);
    assert.equal(blocked.status, 403);
    const state = await json('/api/tug-of-war');
    assert.equal(state.right.power, 0);
  } finally {
    await runtime.close();
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
