import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiUsage, AI_SERVICES, jstDayStart } from '../src/api-usage.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-api-usage-'));

test('API 使用量を tenant・種類・成否つきで JSONL に追記する', () => {
  const dir = tmp();
  const usage = new ApiUsage({ dir, now: () => 1234567890 });
  const row = usage.record({ tenant: 't123', service: 'euler', operation: 'connect', ok: true, status: 200, source: 'connect', handle: 'alice' });
  assert.equal(row.t, 1234567890);
  assert.equal(row.units, 1);
  const lines = fs.readFileSync(path.join(dir, 'api-usage.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.deepEqual(lines, [{ t: 1234567890, tenant: 't123', service: 'euler', operation: 'connect', units: 1, ok: true, status: 200, source: 'connect', handle: 'alice' }]);
  assert.equal(fs.statSync(path.join(dir, 'api-usage.jsonl')).mode & 0o777, 0o600);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('日本時間の今日・直近1時間・操作別・AI token を集計する', () => {
  const dir = tmp();
  const now = Date.parse('2026-11-27T12:00:00+09:00');
  const usage = new ApiUsage({ dir, now: () => now });
  usage.record({ t: now - 30 * 60_000, tenant: 't1', service: 'euler', operation: 'connect', ok: true });
  usage.record({ t: now - 90 * 60_000, tenant: 't1', service: 'euler', operation: 'signature', ok: false, status: 429 });
  usage.record({ t: jstDayStart(now) - 1, tenant: 't1', service: 'euler', operation: 'connect', ok: true });
  usage.record({ t: now - 10 * 60_000, tenant: 't1', service: 'anthropic', operation: 'aiAsk', input: 120, output: 30, cacheRead: 5, cacheWrite: 7, ok: true });

  const euler = usage.summary({ service: 'euler', now });
  assert.equal(euler.today.total, 2);
  assert.equal(euler.today.failed, 1);
  assert.equal(euler.today.operations.connect.total, 1);
  assert.equal(euler.today.operations.signature.total, 1);
  assert.equal(euler.hour.total, 1);

  const ai = usage.summary({ services: [...AI_SERVICES], now });
  assert.equal(ai.today.total, 1);
  assert.equal(ai.today.input, 120);
  assert.equal(ai.today.output, 30);
  assert.equal(ai.today.cacheRead, 5);
  assert.equal(ai.today.cacheWrite, 7);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('配信者別と時間別の系列を作る', () => {
  const dir = tmp();
  const now = Date.parse('2026-11-27T12:00:00+09:00');
  const usage = new ApiUsage({ dir, now: () => now });
  usage.record({ t: now - 20 * 60_000, tenant: 't1', service: 'euler', operation: 'connect', ok: true });
  usage.record({ t: now - 25 * 60_000, tenant: 't1', service: 'euler', operation: 'signature', ok: false, status: 403 });
  usage.record({ t: now - 70 * 60_000, tenant: 't2', service: 'euler', operation: 'roomId', ok: true });

  const tenants = usage.tenants({ service: 'euler', from: now - 24 * 3600_000, now });
  assert.equal(tenants.length, 2);
  const t1 = tenants.find((row) => row.tenant === 't1');
  assert.equal(t1.range.total, 2);
  assert.equal(t1.today.total, 2);
  assert.equal(t1.hour.total, 2);
  assert.equal(t1.range.failed, 1);
  assert.equal(t1.range.operations.signature.total, 1);
  assert.equal(typeof t1.range.lastAt, 'number');

  const series = usage.timeseries({ service: 'euler', granularity: 'hour', from: now - 24 * 3600_000, to: now });
  assert.equal(series.length, 24);
  assert.equal(series.at(-1).total, 2);
  assert.equal(series.at(-1).failed, 1);
  assert.equal(series.at(-2).total, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('時間別系列は、現在の途中の時間も最後の棒に入れる', () => {
  const dir = tmp();
  const now = Date.parse('2026-11-27T12:34:00+09:00');
  const usage = new ApiUsage({ dir, now: () => now });
  usage.record({ t: now - 10 * 60_000, tenant: 't1', service: 'euler', operation: 'connect', ok: true });
  const series = usage.timeseries({ service: 'euler', granularity: 'hour', from: now - 24 * 3600_000, to: now });
  assert.equal(series.length, 24);
  assert.equal(series.at(-1).total, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});
