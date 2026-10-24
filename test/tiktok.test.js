import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionOptions, preLiveRetryDelay, TikTokSource } from '../src/tiktok.js';

test('本体の接続オプションに言語の上書きがない', () => {
  assert.deepEqual(connectionOptions('key'), {
    signApiKey: 'key',
    processInitialData: false,
  });
});

test('配信前の確認は最初の30分が1分、その後が5分', () => {
  assert.equal(preLiveRetryDelay(29 * 60 * 1000), 60 * 1000);
  assert.equal(preLiveRetryDelay(30 * 60 * 1000), 5 * 60 * 1000);
});

function hub() {
  return { status: { mode: 'idle' }, setStatus(patch) { this.status = { ...this.status, ...patch }; } };
}

test('公開判定が配信中なら room ID を Euler 接続へ渡す', async () => {
  const calls = [];
  const source = new TikTokSource(hub(), null, {
    probeLive: true,
    createProbe: () => ({ fetchIsLive: async () => true, fetchRoomId: async () => 'room-1' }),
    createConnection: () => ({
      on() {}, emit() {}, removeAllListeners() {}, disconnect: async () => {},
      connect: async (roomId) => { calls.push(roomId); return { roomId }; },
    }),
  });
  await source.connect('alice', { signApiKey: 'key' });
  assert.deepEqual(calls, ['room-1']);
  await source.disconnect();
});

test('公開判定が読めないときは一度だけ止めて、Euler の接続方法へ戻る', async () => {
  let probes = 0;
  const source = new TikTokSource(hub(), null, {
    probeLive: true,
    retryDelays: [1], jitter: 0,
    createProbe: () => ({ fetchIsLive: async () => { probes += 1; throw new Error('blocked'); } }),
    createConnection: () => ({
      on() {}, emit() {}, removeAllListeners() {}, disconnect: async () => {},
      connect: async () => { throw new Error("The user isn't online"); },
    }),
  });
  await assert.rejects(() => source.connect('alice', { signApiKey: 'key' }));
  assert.equal(probes, 1);
  assert.equal(source.publicProbeBlocked, true);
  await source.disconnect();
});
