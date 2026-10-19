// 性能改善の受け入れ条件。接続時の全状態と、連打中の差分配信を確認する。

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Hub } from '../../src/hub.js';

const client = (compact = false) => {
  const sent = [];
  return { compact, readyState: 1, sent, send: (text) => sent.push(text), on() {} };
};

const gift = (i) => ({
  kind: 'gift',
  user: { id: `user-${i % 20}`, name: `利用者${i % 20}`, avatar: null },
  gift: { id: '5655', name: 'Rose', diamonds: 1, count: 1 },
  totalDiamonds: 1,
});

test('AC-5: hello は全状態を持ち、連打のイベントは互換な状態を復元できる差分を持つ', () => {
  const hub = new Hub();
  const ws = client(true);
  hub.addClient(ws);

  const hello = JSON.parse(ws.sent[0]);
  assert.equal(hello.type, 'hello');
  assert.equal(hello.state.gifts, 0);
  assert.ok(Array.isArray(hello.state.topGifters));

  hub.publish(gift(1));
  const event = JSON.parse(ws.sent.at(-1));
  assert.equal(event.type, 'event');
  assert.equal(event.event.kind, 'gift');
  assert.equal(event.state, undefined);
  assert.equal(event.statePatch.gifts, 1);
  assert.ok(Array.isArray(event.statePatch.topGifters.order));
  assert.equal(event.statePatch.topGifters.changed[0].user.name, '利用者1');
});

test('AC-6: 5000 件の連打で、差分配信は全状態の再送より小さい', () => {
  const fullHub = new Hub();
  const compactHub = new Hub();
  const full = client(false);
  const compact = client(true);
  fullHub.addClient(full);
  compactHub.addClient(compact);

  for (let i = 0; i < 5000; i += 1) {
    fullHub.publish(gift(i));
    compactHub.publish(gift(i));
  }

  const fullBytes = full.sent.slice(1).reduce((n, text) => n + Buffer.byteLength(text), 0);
  const compactBytes = compact.sent.slice(1).reduce((n, text) => n + Buffer.byteLength(text), 0);
  assert.ok(compactBytes < fullBytes * 0.7, `${compactBytes} bytes は基準 ${fullBytes} bytes の30%減になっていません`);
});

test('AC-3: テスト送信は本番の集計を汚さない', () => {
  const hub = new Hub();
  hub.setStatus({ mode: 'live', username: '配信者' });
  for (let i = 0; i < 5000; i += 1) hub.publish({ ...gift(i), test: true });
  assert.equal(hub.state.gifts, 0);
  assert.equal(hub.state.diamonds, 0);
});
