// ハブが、つながっている画面の役目(obs など)を答え、つながったことを知らせるかを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Hub } from '../src/hub.js';

function fakeSocket(role) {
  const ws = new EventEmitter();
  ws.role = role;
  ws.readyState = 1;
  ws.send = () => {};
  return ws;
}

test('hasClient は、開いている OBS 用の画面があるときだけ真', () => {
  const hub = new Hub();
  const seen = [];
  hub.on('client', (ws) => seen.push(ws.role));
  assert.equal(hub.hasClient('obs'), false);
  hub.addClient(fakeSocket('owner'));
  assert.equal(hub.hasClient('obs'), false, 'ダッシュボードは数えない');
  const obs = fakeSocket('obs');
  hub.addClient(obs);
  assert.equal(hub.hasClient('obs'), true);
  assert.deepEqual(seen, ['owner', 'obs']);
  obs.emit('close');
  assert.equal(hub.hasClient('obs'), false);
});
