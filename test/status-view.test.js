// 様子表示の公開境界を確かめる小さなテスト。
import test from 'node:test';
import assert from 'node:assert/strict';
import { healthz } from '../src/healthz.js';

test('公開 /healthz は配信者の名前や数字を返さず、人数だけを返す', () => {
  let body;
  healthz({
    local: { isLive: () => true },
    tenants: { liveCount: () => 2 },
  })({}, { json(value) { body = value; } });
  assert.deepEqual(body, { ok: true, live: 3 });
  assert.equal(JSON.stringify(body).includes('配信者'), false);
  assert.equal(JSON.stringify(body).includes('coins'), false);
});
