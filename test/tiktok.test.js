import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionOptions, preLiveRetryDelay } from '../src/tiktok.js';

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
