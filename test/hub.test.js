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

test('見本モードは hello と更新通知に入り、配信中は始められない', () => {
  const hub = new Hub();
  const ws = fakeClient();
  hub.addClient(ws);
  assert.deepEqual(ws.sent[0].sample, { on: false, until: null });
  const state = hub.setSample(true);
  assert.equal(state.on, true);
  assert.equal(ws.sent.at(-1).type, 'sample');
  assert.equal(ws.sent.at(-1).on, true);
  hub.setStatus({ mode: 'live' });
  assert.deepEqual(hub.sampleState(), { on: false, until: null });
  assert.throws(() => hub.setSample(true), /配信中は見本を出せません/);
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

test('テスト送信は本番の数を汚さない: 配信中は画面に出るだけ、配信前の分はつながったときに 0 に戻る', () => {
  const hub = new Hub();
  const seen = [];
  const sent = [];
  hub.on('event', (e) => seen.push(e.kind));
  hub.addClient({ readyState: 1, on() {}, send: (text) => sent.push(JSON.parse(text)) });

  // つなぐ前: 今までどおり数える（目標バーなどの動きを確かめられる）
  hub.publish({ kind: 'follow', user: { id: 'demo_1', name: 'a' }, test: true });
  assert.equal(hub.state.follows, 1);
  assert.deepEqual(seen, ['follow']);

  // つながったら、テストで増えた分は 0 に戻る
  hub.setStatus({ mode: 'live', username: 'x' });
  assert.equal(hub.state.follows, 0);

  // 配信中: 本物は数える。テストは画面に出るだけで、数もほかの仕組みも動かない
  hub.publish({ kind: 'follow', user: { id: 'u1', name: 'real' } });
  sent.length = 0;
  hub.publish({ kind: 'follow', user: { id: 'demo_2', name: 'b' }, test: true });
  hub.publish({ kind: 'gift', user: { id: 'demo_2', name: 'b' }, gift: { name: 'Rose', diamonds: 1, count: 5 }, totalDiamonds: 5, test: true });
  assert.equal(hub.state.follows, 1);
  assert.equal(hub.state.diamonds, 0);
  assert.deepEqual(seen, ['follow', 'follow']);
  assert.deepEqual(sent.map((m) => [m.type, m.event.kind, m.state.follows]), [['event', 'follow', 1], ['event', 'gift', 1]]);

  // 途中で切れてつなぎ直しても、本物の数は消えない
  hub.setStatus({ mode: 'connecting' });
  hub.setStatus({ mode: 'live' });
  assert.equal(hub.state.follows, 1);
});

test('次の配信（別の room）につないだら、前の配信のフォロー数は 0 に戻る', () => {
  const hub = new Hub();
  hub.setStatus({ mode: 'live', username: 'x', roomId: 'r1' });
  hub.publish({ kind: 'follow', user: { id: 'u1', name: 'a' } });
  hub.setStatus({ mode: 'offline' });
  hub.setStatus({ mode: 'live', roomId: 'r1' });
  assert.equal(hub.state.follows, 1);
  hub.setStatus({ mode: 'offline' });
  hub.setStatus({ mode: 'live', roomId: 'r2' });
  assert.equal(hub.state.follows, 0);
});
