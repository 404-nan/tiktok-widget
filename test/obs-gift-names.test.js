import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { Tenants } from '../src/tenants.js';
import { giftNamesDocument } from '../src/gift-display.js';
import { ensureGiftNames } from '../public/widgets/lib/overlay.js';

test('OBS 用の鍵で /api/gift-names が 200 になる', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-obs-gifts-'));
  const tenants = new Tenants({ dir });
  const tenant = tenants.create({ name: 'りん' });
  const app = express();
  app.use('/t/:key', (req, res, next) => {
    const found = tenants.byKey(req.params.key);
    if (!found) return res.status(404).end();
    req.role = found.role;
    return tenants.runtime(found.tenant.id).router(req, res, next);
  });
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const obs = await fetch(`http://127.0.0.1:${port}/t/${tenant.obsKey}/api/gift-names`);
    assert.equal(obs.status, 200);
    const body = await obs.json();
    assert.deepEqual(body.names['5655'], giftNamesDocument().names['5655']);
    const denied = await fetch(`http://127.0.0.1:${port}/t/${tenant.obsKey}/api/gifts`);
    assert.equal(denied.status, 403);
  } finally {
    clearInterval(tenants.timer);
    clearInterval(tenants.rentalTimer);
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await tenants.close(tenant.id);
  }
});

test('対応表の取得に失敗しても取得済みにせず、次で取り直す', async () => {
  globalThis.__twGiftNamesReady = false;
  let calls = 0;
  const prev = globalThis.fetch;
  globalThis.fetch = async () => {
    calls += 1;
    if (calls === 1) throw new Error('offline');
    if (calls === 2) return { ok: false, status: 403, json: async () => ({ error: 'no' }) };
    return { ok: true, json: async () => ({ names: { '5655': ['Rose', 'バラ'] } }) };
  };
  try {
    await ensureGiftNames();
    assert.equal(globalThis.__twGiftNamesReady, false);
    await ensureGiftNames();
    assert.equal(globalThis.__twGiftNamesReady, false);
    assert.equal(calls, 2);
    await ensureGiftNames();
    assert.equal(calls, 3);
    assert.equal(globalThis.__twGiftNamesReady, true);
    assert.equal(globalThis.giftDisplayName({ id: '5655', name: 'Rose' }), 'バラ');
    await ensureGiftNames();
    assert.equal(calls, 3);
  } finally {
    globalThis.fetch = prev;
    globalThis.__twGiftNamesReady = true;
  }
});
