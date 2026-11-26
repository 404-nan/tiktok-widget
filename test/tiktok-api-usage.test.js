import { test } from 'node:test';
import assert from 'node:assert/strict';
import { trackedEulerClient } from '../src/tiktok.js';

test('Euler client の呼び出し結果を成功・失敗つきで中央記録へ渡す', async () => {
  const attempts = [];
  const results = [];
  const usage = {
    record: (username, kind) => attempts.push({ username, kind }),
    recordResult: (username, kind, result) => results.push({ username, kind, result }),
  };
  const client = {
    general: {
      signTikTokUrl: async () => ({ signed: true }),
      failing: null,
    },
  };
  const wrapped = trackedEulerClient(client, '@alice', usage, { source: 'gifts' });
  const out = await wrapped.general.signTikTokUrl({ url: 'https://example.test/' });
  assert.deepEqual(out, { signed: true });
  assert.deepEqual(attempts, [{ username: '@alice', kind: 'signature' }]);
  assert.equal(results.length, 1);
  assert.equal(results[0].kind, 'signature');
  assert.equal(results[0].result.ok, true);
  assert.equal(results[0].result.source, 'gifts');

  client.general.signTikTokUrl = async () => {
    const err = new Error('rate limited');
    err.status = 429;
    throw err;
  };
  const failing = trackedEulerClient(client, '@alice', usage, { source: 'gifts' });
  await assert.rejects(() => failing.general.signTikTokUrl({}), /rate limited/);
  assert.equal(results.length, 2);
  assert.equal(results[1].result.ok, false);
  assert.equal(results[1].result.status, 429);
});
