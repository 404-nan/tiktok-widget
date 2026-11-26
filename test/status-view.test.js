// 様子表示の公開境界を確かめる小さなテスト。
import test from 'node:test';
import assert from 'node:assert/strict';
import { healthz } from '../src/healthz.js';
import { PRODUCT_VERSION } from '../src/version.js';

test('公開 /healthz は配信者の名前や数字を返さず、人数と起動した版だけを返す', () => {
  let body;
  healthz({
    local: { isLive: () => true },
    tenants: { liveCount: () => 2 },
  })({}, { json(value) { body = value; } });
  assert.equal(body.ok, true);
  assert.equal(body.live, 3);
  assert.equal(body.version, PRODUCT_VERSION);
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'commit'), true);
  assert.deepEqual(Object.keys(body).sort(), ['commit', 'live', 'ok', 'version']);
  assert.equal(JSON.stringify(body).includes('配信者'), false);
  assert.equal(JSON.stringify(body).includes('coins'), false);
});
