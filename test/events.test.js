import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createEventBus } from '../src/events.js';

test('名前付きイベントと * に、type と時刻を載せる', () => {
  const bus = createEventBus();
  const seen = [];
  const all = [];
  bus.on('roulette.result', (e) => seen.push(e));
  bus.on('*', (e) => all.push(e));
  const event = bus.emit('roulette.result', { label: '歌う' });
  assert.equal(event.type, 'roulette.result');
  assert.equal(event.label, '歌う');
  assert.equal(typeof event.ts, 'number');
  assert.equal(seen.length, 1);
  assert.equal(all.length, 1);
  assert.equal(all[0], seen[0]);
  bus.off('roulette.result', seen.push); // 別の関数なので残る
  const stop = bus.on('boss.damage', (e) => seen.push(e));
  bus.emit('boss.damage', { amount: 3 });
  assert.equal(seen.at(-1).type, 'boss.damage');
  stop();
  bus.emit('boss.damage', { amount: 1 });
  assert.equal(seen.at(-1).amount, 3);
});

test('オブジェクト以外は value に入れる', () => {
  const bus = createEventBus();
  const event = bus.emit('gacha.start', 'x');
  assert.equal(event.value, 'x');
  assert.equal(event.type, 'gacha.start');
  const empty = bus.emit('gacha.idle');
  assert.equal(empty.type, 'gacha.idle');
  assert.equal('value' in empty, false);
});
