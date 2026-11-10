import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hub } from '../src/hub.js';
import { makeEvent } from '../src/demo.js';
import * as cfg from '../src/config.js';
import { createQueue } from '../public/widgets/lib/overlay.js';

function capture(hub) {
  const events = [];
  hub.addClient({ readyState: 1, on() {}, send: (text) => { const m = JSON.parse(text); if (m.type === 'event') events.push(m.event); } });
  return events;
}

test('人の軸の材料: ギフトの出来事に「前の累計（回数・コイン）」が刻まれる', () => {
  const hub = new Hub();
  const events = capture(hub);
  hub.publish(makeEvent('gift', { user: 'さくら', giftName: 'Rose', count: 5 }));
  hub.publish(makeEvent('gift', { user: 'さくら', giftName: 'Rose', count: 5 }));
  hub.publish(makeEvent('gift', { user: 'たろう', giftName: 'Rose', count: 5 }));
  assert.equal(events[0].giftCountBefore, 0);
  assert.equal(events[0].giftCoinsBefore, 0);
  assert.equal(events[1].giftCountBefore, 5);
  assert.equal(events[1].giftCoinsBefore, 5);
  assert.equal(events[2].giftCountBefore, 0);
});

test('人の軸の材料: 配信中のテストのギフトにも刻まれ、本番の数は動かない', () => {
  const hub = new Hub();
  const events = capture(hub);
  hub.setStatus({ mode: 'live', username: 'x' });
  hub.publish(makeEvent('gift', { user: 'さくら', giftName: 'Rose', count: 5 }));
  const before = hub.state.diamonds;
  const testEvent = makeEvent('gift', { user: 'さくら', giftName: 'Rose', count: 5 });
  testEvent.test = true;
  hub.publish(testEvent);
  const stamped = events.at(-1);
  assert.equal(stamped.giftCountBefore, 5);
  assert.equal(hub.state.diamonds, before);
  hub.publish(makeEvent('gift', { user: 'さくら', giftName: 'Rose', count: 5 }));
  assert.equal(events.at(-1).giftCountBefore, 5);
});

test('人の軸の条件キーは検証を通り、落ちずに保持される', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-step3-'));
  const file = path.join(dir, 'config.yaml');
  fs.writeFileSync(file, [
    'alerts:',
    '  default:',
    '    rules:',
    '      - { firstGift: true, text: "はじめて" }',
    '      - { giftedBefore: true, big: true }',
    '      - { followed: true, color: accent }',
    '',
  ].join('\n'), 'utf8');
  try {
    const store = cfg.createStore(file);
    const { config, errors } = store.load();
    assert.deepEqual(errors, []);
    const rules = config.alerts.default.rules;
    assert.equal(rules.length, 3);
    assert.equal(rules[0].firstGift, true);
    assert.equal(rules[1].giftedBefore, true);
    assert.equal(rules[2].followed, true);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

const tick = () => new Promise((r) => setTimeout(r, 5));

test('順番待ち: 優先を渡さなければ従来どおり（入った順・上限で古い順に捨てる）', async () => {
  const seen = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const q = createQueue(async (x) => { seen.push(x); if (x === 'a') await gate; }, { max: 2 });
  q.push('a'); // 表示中
  q.push('b');
  q.push('c'); // 待ちは2件（上限いっぱい）
  q.push('d'); // 上限を超える: 待ちの一番古い b が捨てられる
  release();
  await tick(); await tick(); await tick();
  assert.deepEqual(seen, ['a', 'c', 'd']);
});

test('順番待ち: 優先ありでは大きい物が待ちの先頭へ来て、表示中には割り込まない', async () => {
  const seen = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const q = createQueue(async (x) => { seen.push(x); if (x === 'run') await gate; }, {
    max: 30,
    priority: (x) => (x === 'big' ? 1 : 0),
  });
  q.push('run');
  q.push('small1');
  q.push('big');
  q.push('small2');
  release();
  await tick(); await tick(); await tick();
  assert.deepEqual(seen, ['run', 'big', 'small1', 'small2']);
});

test('順番待ち: 上限で捨てるのは優先が一番低い物（同じなら一番古い物）', async () => {
  const seen = [];
  let release;
  const gate = new Promise((r) => { release = r; });
  const q = createQueue(async (x) => { seen.push(x); if (x === 'run') await gate; }, {
    max: 2,
    priority: (x) => (x === 'big' ? 1 : 0),
  });
  q.push('run');
  q.push('small');
  q.push('big'); // 待ちは big, small の順になる（上限2でまだ捨てない）
  q.push('small2'); // 上限を超える: 優先が一番低い中で一番古い small が捨てられ、待ちは big, small2 になる
  release();
  await tick(); await tick();
  assert.deepEqual(seen, ['run', 'big', 'small2']);
});
