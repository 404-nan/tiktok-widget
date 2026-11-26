import express from 'express';
import { createServer } from 'node:http';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiUsage } from '../src/api-usage.js';
import { bindAdminUsageRoutes } from '../src/admin-usage-routes.js';

async function boot({ now, limits }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-admin-usage-'));
  const apiUsage = new ApiUsage({ dir, now: () => now });
  apiUsage.record({ t: now - 20 * 60_000, tenant: 't1', service: 'euler', operation: 'connect', ok: true });
  apiUsage.record({ t: now - 30 * 60_000, tenant: 't1', service: 'euler', operation: 'signature', ok: false, status: 429 });
  apiUsage.record({ t: now - 40 * 60_000, tenant: 't2', service: 'euler', operation: 'roomId', ok: true });
  apiUsage.record({ t: now - 10 * 60_000, tenant: 't1', service: 'anthropic', operation: 'aiAsk', input: 100, output: 40, ok: true });

  const app = express();
  app.use(express.json());
  const admin = express.Router();
  bindAdminUsageRoutes(admin, {
    apiUsage,
    limits,
    tenantInfo: (id) => ({ name: id === 't1' ? '一号' : '二号', tiktokId: `${id}-tiktok`, enabled: true, statusMode: 'idle' }),
    now: () => now,
  });
  app.use('/admin/api', admin);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    dir,
    base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('管理 API が使用量・上限比・配信者別・時間別を返す', async () => {
  const now = Date.parse('2026-11-27T12:00:00+09:00');
  const limits = {
    refreshIfStale: async () => limits.state(),
    refresh: async () => ({ ...limits.state(), throttled: true }),
    state: () => ({
      fetchedAt: now - 60_000,
      stale: false,
      error: null,
      limits: {
        minute: { max: 60, remaining: 59, reset_at: '2026-11-27T03:01:00.000Z' },
        hour: { max: 100, remaining: 90, reset_at: '2026-11-27T04:00:00.000Z' },
        day: { max: 1000, remaining: 900, reset_at: '2026-11-28T00:00:00.000Z' },
      },
    }),
  };
  const ctx = await boot({ now, limits });
  try {
    const summary = await (await fetch(`${ctx.base}/admin/api/usage/summary?range=7d`)).json();
    assert.equal(summary.services.euler.today.total, 3);
    assert.equal(summary.services.euler.today.failed, 1);
    assert.equal(summary.services.euler.today.limit.percent, 10);
    assert.equal(summary.services.euler.hour.limit.percent, 10);
    assert.equal(summary.services.ai.today.input, 100);
    assert.equal(summary.range, '7d');

    const tenants = await (await fetch(`${ctx.base}/admin/api/usage/tenants?service=euler&range=7d`)).json();
    const one = tenants.tenants.find((row) => row.tenant === 't1');
    assert.equal(one.name, '一号');
    assert.equal(one.today.total, 2);
    assert.equal(one.hour.total, 2);
    assert.equal(one.range.operations.signature.total, 1);
    assert.equal(one.range.failed, 1);

    const series = await (await fetch(`${ctx.base}/admin/api/usage/timeseries?service=euler&granularity=hour&range=24h`)).json();
    assert.equal(series.points.length, 24);
    assert.equal(series.points.at(-1).total, 3);
    assert.equal(series.points.at(-1).failed, 1);

    const tenantSeries = await (await fetch(`${ctx.base}/admin/api/usage/timeseries?service=euler&range=24h&tenant=t2`)).json();
    assert.equal(tenantSeries.tenant, 't2');
    assert.equal(tenantSeries.points.at(-1).total, 1);

    const today = await (await fetch(`${ctx.base}/admin/api/usage/summary?range=today`)).json();
    assert.equal(today.range, 'today');

    const refresh = await fetch(`${ctx.base}/admin/api/usage/euler/refresh`, { method: 'POST' });
    assert.equal(refresh.status, 200);
    assert.equal((await refresh.json()).throttled, true);
  } finally {
    await ctx.close();
  }
});
