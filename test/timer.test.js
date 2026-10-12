import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { TimerEngine, secondsFor } from '../src/timer.js';
import { defaultsFor } from '../src/schema.js';
import { normalize } from '../src/config.js';

const entry = (over = {}) => ({ ...defaultsFor('timers'), ...over });

function setup(config = { default: entry() }, file) {
  const hub = new EventEmitter();
  const sent = [];
  hub.broadcast = (msg) => sent.push(msg);
  file ??= path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tw-timer-')), 'timers.json');
  const timer = new TimerEngine(hub, file);
  timer.setConfig(config);
  return { hub, timer, sent, file, kinds: () => sent.map((m) => m.event?.kind) };
}
const gift = (name, coins = 1, count = 1) => ({ kind: 'gift', user: { id: 'u1', name: 'たろう', avatar: null }, gift: { name, id: '1', count }, totalDiamonds: coins * count });
const sec = (ms) => Math.round(ms / 1000);

test('始める前は初めの時間のまま。スタートで減り始め、一時停止・再開できる', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  const { timer, kinds } = setup({ default: entry({ startMinutes: 30 }) });
  assert.equal(timer.get('default').status, 'idle');
  assert.equal(timer.remaining('default'), 30 * 60_000);
  t.mock.timers.tick(5000);
  assert.equal(timer.remaining('default'), 30 * 60_000); // 始める前は減らない

  timer.apply('default', 'start');
  t.mock.timers.tick(10_000);
  assert.equal(sec(timer.remaining('default')), 30 * 60 - 10);

  timer.apply('default', 'pause');
  t.mock.timers.tick(60_000);
  assert.equal(timer.get('default').status, 'paused');
  assert.equal(sec(timer.remaining('default')), 30 * 60 - 10); // 止めている間は減らない

  timer.apply('default', 'toggle'); // 止まっているので再開
  t.mock.timers.tick(5000);
  assert.equal(sec(timer.remaining('default')), 30 * 60 - 15);
  assert.deepEqual(kinds(), ['start', 'pause', 'resume']);
  timer.close();
});

test('ギフト（1コイン○秒）・指定のギフト・フォロー・いいねで延びる', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  const rules = [{ gifts: ['Galaxy'], seconds: 600 }, { gifts: ['Rose'], seconds: 30, perCount: false }];
  const { hub, timer, sent } = setup({ default: entry({ startMinutes: 10, coinSeconds: 2, followSeconds: 30, likeEvery: 100, likeSeconds: 10, rules }) });
  timer.apply('default', 'start');
  const left = () => sec(timer.remaining('default'));

  hub.emit('event', gift('Doughnut', 30)); // 30 コイン × 2 秒
  assert.equal(left(), 600 + 60);
  assert.equal(sent.at(-1).type, 'timer');
  assert.equal(sent.at(-1).event.kind, 'extend');
  assert.equal(sent.at(-1).event.from, 'gift');
  assert.equal(sent.at(-1).event.seconds, 60);
  assert.equal(sent.at(-1).event.user.name, 'たろう');

  hub.emit('event', gift('galaxy', 1000)); // ルールが金額より優先
  assert.equal(left(), 660 + 600);
  hub.emit('event', gift('Rose', 1, 5)); // perCount: false なので1回分
  assert.equal(left(), 1260 + 30);

  hub.emit('event', { kind: 'follow', user: { id: 'f', name: 'はなこ' } });
  assert.equal(left(), 1290 + 30);

  // いいねはためて 100 回ごと
  hub.emit('event', { kind: 'like', user: { id: 'l', name: 'りん' }, count: 60 });
  assert.equal(left(), 1320);
  hub.emit('event', { kind: 'like', user: { id: 'l', name: 'りん' }, count: 150 });
  assert.equal(left(), 1320 + 20);
  assert.equal(timer.get('default').extended, 60 + 600 + 30 + 30 + 20);
  timer.close();
});

test('始める前・終わった後は延びない。一時停止中は pausedExtend で決まる', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  const { hub, timer } = setup({ a: entry({ startMinutes: 1, coinSeconds: 1 }), b: entry({ startMinutes: 1, coinSeconds: 1, pausedExtend: false }) });
  hub.emit('event', gift('Rose', 10));
  assert.equal(sec(timer.remaining('a')), 60);
  timer.apply(null, 'start');
  timer.apply(null, 'pause');
  hub.emit('event', gift('Rose', 10));
  assert.equal(sec(timer.remaining('a')), 70);
  assert.equal(sec(timer.remaining('b')), 60);
  timer.close();
});

test('上限（maxHours）: 初めの時間 + 延びた合計 がこれを超えない。ボタンの足し引きは別', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  const { hub, timer, sent } = setup({ default: entry({ startMinutes: 50, maxHours: 1, coinSeconds: 60 }) });
  timer.apply('default', 'start');
  hub.emit('event', gift('Doughnut', 8)); // 8 分延びる
  assert.equal(sec(timer.remaining('default')), 58 * 60);
  hub.emit('event', gift('Doughnut', 8)); // 残りの 2 分だけ
  assert.equal(sec(timer.remaining('default')), 60 * 60);
  assert.equal(sent.at(-1).event.capped, true);
  assert.equal(sent.at(-1).event.seconds, 120);
  hub.emit('event', gift('Doughnut', 8));
  assert.equal(sec(timer.remaining('default')), 60 * 60);
  timer.apply('default', 'add', 300);
  assert.equal(sec(timer.remaining('default')), 65 * 60);
  timer.close();
});

test('足す・引く・その秒にする・リセット', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  const { timer } = setup({ default: entry({ startMinutes: 10 }) });
  timer.apply('default', 'add', 60); // 始める前でも足せる
  assert.equal(sec(timer.remaining('default')), 660);
  timer.apply('default', 'start');
  assert.equal(sec(timer.remaining('default')), 660);
  timer.apply('default', 'add', -120);
  assert.equal(sec(timer.remaining('default')), 540);
  timer.apply('default', 'set', 90);
  assert.equal(sec(timer.remaining('default')), 90);
  assert.equal(timer.get('default').status, 'running');
  timer.apply('default', 'reset');
  assert.equal(timer.get('default').status, 'idle');
  assert.equal(sec(timer.remaining('default')), 600);
  assert.throws(() => timer.apply('default', 'add'), /seconds/);
  assert.throws(() => timer.apply('default', 'jump'), /action/);
  assert.throws(() => timer.apply('nope', 'start'), /timers に「nope」/);
  timer.close();
});

test('0 になったら終わり、引きすぎても終わる', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  const { timer, kinds } = setup({ default: entry({ startMinutes: 1 }) });
  timer.apply('default', 'start');
  t.mock.timers.tick(59_000);
  assert.equal(timer.get('default').status, 'running');
  t.mock.timers.tick(1000);
  assert.equal(timer.get('default').status, 'ended');
  assert.equal(timer.remaining('default'), 0);
  assert.equal(kinds().at(-1), 'end');

  // もう一度スタートすると最初から
  timer.apply('default', 'start');
  assert.equal(sec(timer.remaining('default')), 60);
  timer.apply('default', 'add', -100);
  assert.equal(timer.get('default').status, 'ended');
  timer.close();
});

test('data/ に残り、作り直しても続きから。止まっている間に過ぎていたら終わったことにする', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  const a = setup({ run: entry({ startMinutes: 10 }), stop: entry({ startMinutes: 10 }), short: entry({ startMinutes: 1 }) });
  a.timer.apply(null, 'start');
  a.hub.emit('event', gift('Rose', 3)); // 3 コイン × 10 秒
  a.timer.apply('stop', 'pause');
  a.timer.close();

  t.mock.timers.tick(120_000); // 2 分たってから作り直す（サーバーの再起動）
  const b = setup({ run: entry({ startMinutes: 10 }), stop: entry({ startMinutes: 10 }), short: entry({ startMinutes: 1 }) }, a.file);
  assert.equal(b.timer.get('run').status, 'running');
  assert.equal(sec(b.timer.remaining('run')), 600 + 30 - 120);
  assert.equal(b.timer.get('run').extended, 30);
  assert.equal(b.timer.get('stop').status, 'paused');
  assert.equal(sec(b.timer.remaining('stop')), 630);
  assert.equal(b.timer.get('short').status, 'ended');
  b.timer.close();
});

test('secondsFor: ルールのギフトは来た数だけ足す。マイナスは減らす', () => {
  const c = entry({
    coinSeconds: 9,
    rules: [
      { gifts: ['Rose'], seconds: 30 },
      { gifts: ['Panda'], seconds: 15, perCount: false },
      { gifts: ['Lion'], seconds: -10 },
    ],
  });
  assert.equal(secondsFor(c, gift('Rose', 1, 1)).seconds, 30);
  assert.equal(secondsFor(c, gift('Rose', 1, 4)).seconds, 120); // 30 秒 × 4 個
  assert.equal(secondsFor(c, gift('Panda', 1, 4)).seconds, 15); // 1回だけ
  assert.equal(secondsFor(c, gift('Lion', 29999, 1)).seconds, -10);
  assert.equal(secondsFor(c, gift('Lion', 29999, 3)).seconds, -30); // -10 秒 × 3 個
  // ルールが合うときは、コイン × coinSeconds にはしない
  assert.notEqual(secondsFor(c, gift('Rose', 1, 4)).seconds, 4 * 9);
});

test('減るルールは残り時間を短くする。コンボは来た数だけ', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  const rules = [{ gifts: ['Rose'], seconds: 20 }, { gifts: ['Lion'], seconds: -15 }];
  const { hub, timer } = setup({ default: entry({ startMinutes: 10, coinSeconds: 10, rules }) });
  timer.apply('default', 'start');
  hub.emit('event', gift('Rose', 1, 3));
  assert.equal(sec(timer.remaining('default')), 600 + 60);
  hub.emit('event', gift('Lion', 100, 2));
  assert.equal(sec(timer.remaining('default')), 660 - 30);
  assert.equal(timer.get('default').extended, 30);
  timer.close();
});

test('secondsFor: 少額・条件に合わないギフトは延びない', () => {
  const c = entry({ coinSeconds: 5, minCoins: 10 });
  assert.equal(secondsFor(c, gift('Rose', 1, 5)).seconds, 0);
  assert.equal(secondsFor(c, gift('Rose', 1, 10)).seconds, 50);
  assert.equal(secondsFor(entry({ coinSeconds: 0 }), gift('Rose', 100)).seconds, 0);
  assert.equal(secondsFor(entry({ followSeconds: 0 }), { kind: 'follow' }).seconds, 0);
  assert.equal(secondsFor(entry({ shareSeconds: 15 }), { kind: 'share' }).seconds, 15);
});

test('schema の coinSeconds の初期値は 10 のまま（新しいタイマーの目安とは別）', () => {
  assert.equal(defaultsFor('timers').coinSeconds, 10);
});

test('設定の検証: minutes は秒になり、書き間違いはエラー', () => {
  const ok = normalize({ timers: { default: { rules: [{ gifts: ['Galaxy'], minutes: 10 }, { minCoins: 500, seconds: -30, text: '妨害' }] } } });
  assert.deepEqual(ok.errors, []);
  assert.deepEqual(ok.config.timers.default.rules, [
    { seconds: 600, gifts: ['Galaxy'] },
    { seconds: -30, minCoins: 500, text: '妨害' },
  ]);
  const bad = normalize({ timers: { default: { startMinutes: -1, rules: [{ gifts: ['Rose'] }, { gifts: ['GG'], seconds: 1, minutes: 1 }, { gifts: ['x'], seconds: 'abc' }] } } });
  assert.ok(bad.errors.some((e) => e.startsWith('timers.default.startMinutes')));
  assert.ok(bad.errors.some((e) => e.startsWith('timers.default.rules[0]') && e.includes('seconds')));
  assert.ok(bad.errors.some((e) => e.startsWith('timers.default.rules[1]') && e.includes('どちらか')));
  assert.ok(bad.errors.some((e) => e.startsWith('timers.default.rules[2].seconds')));
});
