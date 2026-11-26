import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EulerLimits } from '../src/euler-limits.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-euler-limits-'));
const body = () => ({
  code: 200,
  minute: { max: 60, remaining: 59, reset_at: '2026-11-27T03:01:00.000Z' },
  hour: { max: 500, remaining: 490, reset_at: '2026-11-27T04:00:00.000Z' },
  day: { max: 1500, remaining: 1400, reset_at: '2026-11-28T00:00:00.000Z' },
});

test('Euler の rate limits を取得し、上限だけをキャッシュする', async () => {
  const dir = tmp();
  const calls = [];
  const limits = new EulerLimits({
    file: path.join(dir, 'euler-limits.json'),
    key: () => 'secret-key',
    now: () => 1000,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return { ok: true, status: 200, json: async () => body() };
    },
  });
  const state = await limits.refresh({ force: true });
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /\/accounts\/me\/rate_limits\?type=WEBCAST$/);
  assert.equal(calls[0].options.headers['x-api-key'], 'secret-key');
  assert.equal(state.limits.day.max, 1500);
  assert.equal(state.limits.day.remaining, 1400);
  assert.equal(state.fetchedAt, 1000);
  assert.equal(state.stale, false); // 取った直後
  const saved = fs.readFileSync(path.join(dir, 'euler-limits.json'), 'utf8');
  assert.equal(saved.includes('secret-key'), false);
  assert.match(saved, /"max": 1500/);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('取得に失敗したら前回値を残し、手動更新の連打は止める', async () => {
  const dir = tmp();
  let count = 0;
  let now = 100000;
  const limits = new EulerLimits({
    file: path.join(dir, 'euler-limits.json'),
    key: () => 'secret-key',
    now: () => now,
    fetchImpl: async () => {
      count++;
      if (count === 1) return { ok: true, status: 200, json: async () => body() };
      return { ok: false, status: 429, json: async () => ({ message: 'too many' }) };
    },
  });
  await limits.refresh({ force: true });
  now += 10_000;
  const throttled = await limits.refresh({ force: true });
  assert.equal(throttled.throttled, true);
  assert.equal(count, 1);
  now += 61_000;
  const failed = await limits.refresh({ force: true });
  assert.equal(count, 2);
  assert.equal(failed.limits.day.max, 1500);
  assert.equal(failed.error.status, 429);
  fs.rmSync(dir, { recursive: true, force: true });
});
