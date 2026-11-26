import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiUsage, migrateLegacyUsage } from '../src/api-usage.js';

test('既存の euler-usage.json と ai-usage.jsonl を一度だけ中央記録へ移す', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-usage-migration-'));
  const tenantDir = path.join(dir, 'tenants', 't1');
  fs.mkdirSync(tenantDir, { recursive: true });
  fs.writeFileSync(path.join(tenantDir, 'euler-usage.json'), JSON.stringify({ '2026-11-26': { alice: { connect: 2, signature: 1 } } }));
  fs.writeFileSync(path.join(dir, 'ai-usage.jsonl'), `${JSON.stringify({ t: Date.parse('2026-11-26T10:00:00Z'), provider: 'claude', model: 'm', input: 7, output: 3, cacheRead: 0, cacheWrite: 0 })}\n`);
  const apiUsage = new ApiUsage({ dir });

  const first = migrateLegacyUsage({ dir, apiUsage, now: () => 1000 });
  assert.equal(first.imported, 3);
  const euler = apiUsage.rows({ service: 'euler' });
  assert.equal(euler.length, 2);
  assert.deepEqual(euler.map((row) => [row.tenant, row.operation, row.units]).sort(), [['t1', 'connect', 2], ['t1', 'signature', 1]]);
  assert.equal(euler[0].source, 'legacy-import');
  const ai = apiUsage.rows({ service: 'anthropic' });
  assert.equal(ai.length, 1);
  assert.equal(ai[0].tenant, 'unknown');
  assert.equal(ai[0].input, 7);

  const second = migrateLegacyUsage({ dir, apiUsage, now: () => 2000 });
  assert.equal(second.imported, 0);
  assert.equal(apiUsage.rows().length, 3);
  fs.rmSync(dir, { recursive: true, force: true });
});
