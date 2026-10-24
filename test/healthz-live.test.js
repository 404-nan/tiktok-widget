import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { createStore } from '../src/config.js';
import { createRuntime } from '../src/runtime.js';
import { Tenants } from '../src/tenants.js';
import { healthz } from '../src/healthz.js';

const temporaryDirectory = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

async function listen(app) {
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return { server, port: server.address().port };
}

test('/healthz は配信中と、切断後15分以内の再接続中だけ数える', async () => {
  let now = 1_000_000;
  const localDir = temporaryDirectory('tw-healthz-local-');
  const local = createRuntime({
    id: 'local',
    store: createStore(path.join(localDir, 'config.yaml')),
    dataDir: localDir,
    mediaDirs: [localDir],
    now: () => now,
  });
  const tenants = new Tenants({ dir: temporaryDirectory('tw-healthz-tenants-') });
  const tenant = tenants.create({ name: '返してはいけない名前' });
  const tenantRuntime = tenants.runtime(tenant.id);
  const app = express();
  app.get('/healthz', healthz({ local, tenants }));
  const { server, port } = await listen(app);

  const getHealth = async () => (await fetch(`http://127.0.0.1:${port}/healthz`)).json();
  try {
    assert.deepEqual(await getHealth(), { ok: true, live: 0 });

    local.hub.setStatus({ mode: 'connecting' });
    assert.deepEqual(await getHealth(), { ok: true, live: 0 });

    local.hub.setStatus({ mode: 'live', username: '秘密の名前' });
    assert.deepEqual(await getHealth(), { ok: true, live: 1 });

    tenantRuntime.hub.setStatus({ mode: 'live', username: '別の秘密' });
    assert.deepEqual(await getHealth(), { ok: true, live: 2 });

    tenantRuntime.hub.setStatus({ mode: 'connecting' });
    assert.deepEqual(await getHealth(), { ok: true, live: 2 });

    tenantRuntime.hub.setStatus({ mode: 'error' });
    assert.deepEqual(await getHealth(), { ok: true, live: 2 });

    local.hub.setStatus({ mode: 'ended' });
    tenantRuntime.hub.setStatus({ mode: 'idle' });
    assert.deepEqual(await getHealth(), { ok: true, live: 0 });
  } finally {
    await new Promise((resolve) => server.close(resolve));
    clearInterval(tenants.timer);
    clearInterval(tenants.rentalTimer);
    await tenants.close(tenant.id);
    await local.close();
  }
});
