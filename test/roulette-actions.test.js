import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Hub } from '../src/hub.js';
import { RouletteEngine } from '../src/roulette.js';
import { createEventBus } from '../src/events.js';
import { bindRouletteActions } from '../src/actions.js';

test('ルーレット結果を roulette.result にして項目の動作を実行する', () => {
  const hub = new EventEmitter();
  const bus = createEventBus();
  const applied = [];
  bindRouletteActions(hub, bus, () => ({
    wins: { apply: (...args) => applied.push(args) },
    bus,
  }));
  const results = [];
  bus.on('roulette.result', (e) => results.push(e));
  hub.emit('roulette', {
    roulette: { id: 'main' },
    item: { label: '歌う', actions: [{ type: 'wins.add', id: 'default', n: 2 }] },
    spin: { index: 1 },
    trigger: { kind: 'gift' },
  });
  assert.equal(results[0].type, 'roulette.result');
  assert.equal(results[0].rouletteId, 'main');
  assert.equal(results[0].label, '歌う');
  assert.equal(results[0].index, 1);
  assert.deepEqual(applied, [['default', 'add', 2]]);
});

test('当たりが画面に出る時刻まで動作は待たせる', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const hub = new Hub();
  const bus = createEventBus();
  const roulette = new RouletteEngine(hub);
  roulette.setConfig({
    roulettes: {
      main: { duration: 0, hold: 1, items: [{ label: '歌う', weight: 1, actions: [{ type: 'wins.add', id: 'w', n: 1 }] }] },
    },
  });
  const applied = [];
  bindRouletteActions(hub, bus, () => ({ wins: { apply: (...args) => applied.push(args) }, bus }));
  roulette.spin('main', { kind: 'gift' });
  assert.equal(applied.length, 0);
  t.mock.timers.tick(2000);
  assert.deepEqual(applied, [['w', 'add', 1]]);
  roulette.clear();
});

test('画面だけの試し回しでは動作しない', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const hub = new Hub();
  const bus = createEventBus();
  const roulette = new RouletteEngine(hub);
  roulette.setConfig({
    roulettes: { main: { duration: 0, hold: 1, items: [{ label: '歌う', actions: [{ type: 'wins.add', n: 1 }] }] } },
  });
  const applied = [];
  bindRouletteActions(hub, bus, () => ({ wins: { apply: (...args) => applied.push(args) }, bus }));
  roulette.spin('main', { kind: 'gift', test: true }, { dry: true });
  t.mock.timers.tick(2000);
  assert.equal(applied.length, 0);
  roulette.clear();
});
