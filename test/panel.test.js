import { test } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { EventEmitter } from 'node:events';
import { Panel } from '../src/panel.js';
import { Minecraft } from '../src/minecraft.js';

// Pterodactyl のパネルの API と同じ形で応答する偽のサーバー
function fakePanel({ key = 'ptlc_test', state = 'running' } = {}) {
  const received = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.headers.authorization !== `Bearer ${key}`) return res.writeHead(403).end('{"errors":[{"detail":"forbidden"}]}');
      if (!req.url.startsWith('/api/client/servers/abc123/')) return res.writeHead(404).end('{}');
      if (req.url.endsWith('/resources')) return res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ attributes: { current_state: state } }));
      if (req.url.endsWith('/command') && req.method === 'POST') {
        if (state !== 'running') return res.writeHead(502).end('{}');
        received.push(JSON.parse(body).command);
        return res.writeHead(204).end();
      }
      res.writeHead(404).end('{}');
    });
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, url: `http://127.0.0.1:${server.address().port}`, received })));
}

test('パネルの API でコマンドを送れる', async () => {
  const { server, url, received } = await fakePanel();
  const p = new Panel({ url: `${url}/`, server: 'abc123', key: 'ptlc_test' });
  await p.connect();
  assert.equal(await p.send('say hello'), '');
  assert.deepEqual(received, ['say hello']);
  server.close();
});

test('キー違い・止まっているサーバーは分かる言葉のエラーになる', async () => {
  const { server, url } = await fakePanel({ state: 'offline' });
  await assert.rejects(new Panel({ url, server: 'abc123', key: 'wrong' }).send('list'), /API キーが違う/);
  const p = new Panel({ url, server: 'abc123', key: 'ptlc_test' });
  await assert.rejects(p.connect(), /動いていません/);
  await assert.rejects(p.send('list'), /止まっています/);
  await assert.rejects(new Panel({ url, server: '', key: 'ptlc_test' }).send('list'), /サーバーの ID/);
  server.close();
});

test('via: panel のとき、ギフトのルールのコマンドはパネルに送られる', async () => {
  const { server, url, received } = await fakePanel();
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const mc = new Minecraft(hub);
  mc.setConfig({
    enabled: true,
    via: 'panel',
    panelUrl: url,
    panelServer: 'abc123',
    panelKey: 'ptlc_test',
    superstreamProfile: 'default_profile',
    rules: [{ gifts: ['Rose'], commands: ['say {user} ありがとう'] }],
  });
  hub.emit('event', { kind: 'gift', user: { id: 'u', name: 'さくら' }, gift: { id: '5655', name: 'Rose', count: 1 }, totalDiamonds: 1 });
  for (let i = 0; i < 50 && !received.length; i++) await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(received, ['say さくら ありがとう']);
  assert.equal(mc.status.state, 'ok');
  server.close();
});
