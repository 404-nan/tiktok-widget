import { test } from 'node:test';
import assert from 'node:assert/strict';
import { connectionOptions } from '../src/tiktok.js';

test('本体の接続オプションに言語の上書きがない', () => {
  assert.deepEqual(connectionOptions('key'), {
    signApiKey: 'key',
    processInitialData: false,
  });
});
