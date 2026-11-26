// 公開ウィジェットの連番カーソルが再接続時の重複を除くことを確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { ReplayCursor } from '../public/widgets/lib/replay-cursor.js';

const event = (id) => ({ type: 'event', event: { id } });

test('直近の連番を除外し、epoch 変更時は新しい seq を基準にする', () => {
  const cursor = new ReplayCursor(2);
  cursor.hello({ epoch: 'first', seq: 0, gap: true });
  assert.equal(cursor.accept(event(1)), true);
  assert.equal(cursor.accept(event(1)), false);
  assert.equal(cursor.accept(event(2)), true);
  assert.equal(cursor.accept(event(3)), true);
  assert.equal(cursor.order.length, 2);
  assert.equal(cursor.lastSeq, 3);

  cursor.hello({ epoch: 'first', seq: 5, gap: true });
  assert.equal(cursor.lastSeq, 3);
  assert.equal(cursor.accept(event(4)), true);
  cursor.hello({ epoch: 'second', seq: 20, gap: true });
  assert.equal(cursor.lastSeq, 20);
  assert.equal(cursor.accept(event(19)), false);
  assert.equal(cursor.accept(event(21)), true);
});


test('派生の知らせは一番上の seq で重複を除き、seq の無い知らせは通す', () => {
  const cursor = new ReplayCursor();
  cursor.hello({ epoch: 'live', seq: 0, gap: false });
  const combo = (seq) => ({ type: 'combo', seq, event: { id: `combo-${seq}` } });
  assert.equal(cursor.accept(combo(1)), true);
  assert.equal(cursor.accept(combo(1)), false);
  assert.equal(cursor.accept({ type: 'event', event: { id: 2 } }), true, '出来事は event.id を連番として読む');
  assert.equal(cursor.accept({ type: 'config', config: {} }), true, '連番の無い知らせは通す');
});

test('ES5 の replay-socket も派生の知らせを seq で重複よけし、再接続へ引き継ぐ', () => {
  const sockets = [];
  const timers = [];
  const received = [];
  const sandbox = {
    window: null,
    WebSocket: function WebSocket(url) { this.url = url; sockets.push(this); },
    setTimeout: (callback) => { timers.push(callback); return timers.length; },
    clearTimeout() {},
  };
  sandbox.window = sandbox;
  vm.runInNewContext(fs.readFileSync(new URL('../public/widgets/lib/replay-socket.js', import.meta.url), 'utf8'), sandbox);
  sandbox.twReplaySocket.connect('ws://example.test/ws', (event) => received.push(JSON.parse(event.data)), 1000);
  assert.equal(sockets.length, 1);

  const send = (message) => sockets[0].onmessage({ data: JSON.stringify(message) });
  send({ type: 'hello', epoch: 'epoch-1', seq: 0, gap: false });
  send({ type: 'combo', seq: 5, event: { id: 'combo-live', kind: 'hit' } });
  send({ type: 'combo', seq: 5, event: { id: 'combo-live', kind: 'hit' } });
  send({ type: 'status', status: { mode: 'live' } });
  assert.deepEqual(received.map((message) => message.type), ['hello', 'combo', 'status']);

  sockets[0].onclose();
  assert.equal(timers.length, 1);
  timers.shift()();
  assert.equal(sockets.length, 2);
  assert.match(sockets[1].url, /since=5/);
  assert.match(sockets[1].url, /epoch=epoch-1/);
});


test('overlay.js の connect も event 以外の知らせを同じ seq で1回だけ渡す', async () => {
  const sockets = [];
  globalThis.location = { protocol: 'http:', host: 'example.test', pathname: '/widgets/card-draw.html', search: '' };
  globalThis.window = globalThis;
  globalThis.WebSocket = function WebSocket(url) { this.url = url; sockets.push(this); };
  const { connect } = await import('../public/widgets/lib/overlay.js');
  const received = [];
  connect({ combo: (message) => received.push(message) }, { reconnectDelay: 10000 });
  assert.equal(sockets.length, 1);
  const send = (message) => sockets[0].onmessage({ data: JSON.stringify(message) });
  send({ type: 'hello', epoch: 'epoch-overlay', seq: 0, gap: false, config: null, state: {}, status: {}, recentChats: [] });
  send({ type: 'combo', seq: 3, event: { id: 'combo-overlay', kind: 'hit' } });
  send({ type: 'combo', seq: 3, event: { id: 'combo-overlay', kind: 'hit' } });
  assert.equal(received.length, 1);
  delete globalThis.location;
  delete globalThis.window;
  delete globalThis.WebSocket;
});
