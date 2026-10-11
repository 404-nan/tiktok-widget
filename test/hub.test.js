import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hub } from '../src/hub.js';
import { makeEvent } from '../src/demo.js';

function fakeClient() {
  const sent = [];
  return { readyState: 1, sent, send: (t) => sent.push(JSON.parse(t)), on() {} };
}

test('ギフトでコインとトップギフターを集計する', () => {
  const hub = new Hub();
  hub.publish(makeEvent('gift', { user: 'さくら', giftName: 'Rose', count: 5 }));
  hub.publish(makeEvent('gift', { user: 'たろう', giftName: 'Corgi', count: 1 }));
  hub.publish(makeEvent('gift', { user: 'さくら', giftName: 'Doughnut', count: 1 }));
  assert.equal(hub.state.diamonds, 5 + 299 + 30);
  assert.equal(hub.state.gifts, 7);
  assert.deepEqual(
    hub.state.topGifters.map((r) => [r.user.name, r.diamonds]),
    [['たろう', 299], ['さくら', 35]],
  );
});

test('いいね: 累計が届けば採用し、なければ足し上げる', () => {
  const hub = new Hub();
  hub.publish({ kind: 'like', user: {}, count: 3, total: 0 });
  hub.publish({ kind: 'like', user: {}, count: 2, total: 0 });
  assert.equal(hub.state.likes, 5);
  hub.publish({ kind: 'like', user: {}, count: 1, total: 500 });
  assert.equal(hub.state.likes, 500);
  // 順番が前後して小さい累計が来ても戻らない
  hub.publish({ kind: 'like', user: {}, count: 1, total: 400 });
  assert.equal(hub.state.likes, 500);
});

test('接続したクライアントに状態とイベントを配信する', () => {
  const hub = new Hub();
  const ws = fakeClient();
  hub.addClient(ws);
  assert.equal(ws.sent[0].type, 'hello');
  hub.publish(makeEvent('follow'));
  const msg = ws.sent.at(-1);
  assert.equal(msg.type, 'event');
  assert.equal(msg.event.kind, 'follow');
  assert.equal(msg.state.follows, 1);
});

test('リセットで集計が 0 に戻り、ウィジェットにも伝わる', () => {
  const hub = new Hub();
  const ws = fakeClient();
  hub.addClient(ws);
  hub.publish(makeEvent('follow'));
  hub.reset();
  assert.equal(hub.state.follows, 0);
  const types = ws.sent.slice(-2).map((m) => `${m.type}:${m.action ?? ''}`);
  assert.deepEqual(types, ['state:', 'control:reset']);
});
