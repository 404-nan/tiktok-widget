// 開発用の本物の HTTP/WebSocket サーバーを起動し、接続 URL と送信形式を確認する。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { WebSocket } from 'ws';
import { startLocalServer } from '../scripts/perf/lib/process.mjs';

test('実サーバーは通常接続を互換形式、compact 指定だけを差分形式にする', async () => {
  const server = await startLocalServer(process.cwd());
  const open = (path) => new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${server.port}${path}`);
    const messages = [];
    ws.on('message', (raw) => {
      messages.push(JSON.parse(String(raw)));
      if (messages.length === 1) resolve({ ws, messages });
    });
    ws.on('error', reject);
  });
  try {
    const legacy = await open('/ws');
    const compact = await open('/ws?compact=1');
    await fetch(`${server.baseUrl}/api/simulate`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ kind: 'gift', giftName: 'Rose', diamonds: 1, count: 1, senderName: 'テスト' }),
    });
    await Promise.all([
      waitForMessage(legacy.messages, legacy.ws),
      waitForMessage(compact.messages, compact.ws),
    ]);
    const legacyEvent = legacy.messages.find((message) => message.type === 'event');
    const compactEvent = compact.messages.find((message) => message.type === 'event');
    assert.ok(legacyEvent.state);
    assert.equal(compactEvent.state, undefined);
    assert.ok(compactEvent.statePatch);
    legacy.ws.close();
    compact.ws.close();
  } finally {
    await server.stop();
  }
});

function waitForMessage(messages, ws) {
  if (messages.some((message) => message.type === 'event')) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const onMessage = (raw) => {
      const message = JSON.parse(String(raw));
      messages.push(message);
      if (message.type === 'event') {
        ws.off('message', onMessage);
        resolve();
      }
    };
    ws.on('message', onMessage);
    ws.once('error', reject);
  });
}
