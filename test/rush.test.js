import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { RushEngine } from '../src/rush.js';
import { defaultsFor } from '../src/schema.js';

function setup(overrides = {}) {
  const hub = new EventEmitter();
  const sent = [];
  hub.broadcast = (msg) => sent.push(msg);
  const rush = new RushEngine(hub);
  rush.setConfig({ ...defaultsFor('rush'), gifts: ['Lion'], ...overrides });
  return { hub, rush, sent, kinds: () => sent.map((m) => m.event.kind) };
}
const gift = (name, coins, count = 1) => ({ kind: 'gift', user: { id: 'u', name: 'たろう' }, gift: { name, id: '9', count }, totalDiamonds: coins });

test('指定のギフトで突入し、そのギフトも合計に入る', (t) => {
  const { hub, rush, kinds } = setup();
  t.after(() => rush.stop());
  hub.emit('event', gift('Rose', 1));
  assert.equal(rush.state.active, false);
  hub.emit('event', gift('lion', 29999));
  assert.equal(rush.state.active, true);
  assert.equal(rush.state.total, 29999);
  assert.deepEqual(kinds(), ['start']);
});

test('enterCoins 以上のギフトで突入（0 なら金額では入らない）', (t) => {
  const a = setup({ enterCoins: 500 });
  t.after(() => a.rush.stop());
  a.hub.emit('event', gift('Rose', 499));
  assert.equal(a.rush.state.active, false);
  a.hub.emit('event', gift('Rose', 500));
  assert.equal(a.rush.state.active, true);

  const b = setup({ enterCoins: 0 });
  b.hub.emit('event', gift('Rose', 99999));
  assert.equal(b.rush.state.active, false);
});

test('RUSH 中のギフトで合計が増え、時間が延びる（最長まで）', (t) => {
  const { hub, rush, sent } = setup({ duration: 60, extendMinCoins: 100, extendSeconds: 5, maxSeconds: 70 });
  t.after(() => rush.stop());
  rush.start();
  const end0 = rush.state.endsAt;
  hub.emit('event', gift('Rose', 1));
  assert.equal(rush.state.endsAt, end0); // 少額では延びない
  hub.emit('event', gift('Doughnut', 300, 3));
  assert.equal(rush.state.endsAt, end0 + 5000);
  assert.equal(rush.state.total, 301);
  assert.equal(rush.state.gifts, 4);
  hub.emit('event', gift('Doughnut', 300));
  hub.emit('event', gift('Doughnut', 300));
  assert.equal(rush.state.endsAt, rush.state.startedAt + 70_000); // 上限で止まる
  assert.equal(sent.at(-1).event.extended, 0);
});

test('ルーレットの rush: true の項目で突入、終わると結果を出す', () => {
  const { hub, rush, sent } = setup();
  hub.emit('roulette', { item: { label: 'ハズレ' }, trigger: {} });
  assert.equal(rush.state.active, false);
  hub.emit('roulette', { item: { label: 'RUSH', rush: true }, trigger: { user: { id: 'x', name: 'はなこ' } } });
  assert.equal(rush.state.active, true);
  assert.equal(rush.state.by.name, 'はなこ');
  hub.emit('event', gift('Rose', 10));
  const result = rush.stop();
  assert.equal(result.total, 10);
  assert.equal(rush.state.active, false);
  assert.equal(sent.at(-1).event.kind, 'end');
  assert.equal(sent.at(-1).rush.last.total, 10);
});

test('使わない設定にすると入らず、RUSH 中なら終わる', () => {
  const { rush, hub } = setup();
  rush.start();
  rush.setConfig({ ...defaultsFor('rush'), enabled: false });
  assert.equal(rush.state.active, false);
  hub.emit('event', gift('Lion', 30000));
  assert.equal(rush.state.active, false);
  assert.equal(rush.start(), null);
});
