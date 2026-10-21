// docs/cards/combo.md の「2巡目」AC-14・AC-15。
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { EventEmitter } from 'node:events';
import express from 'express';
import { createStore } from '../../src/config.js';
import { createRuntime } from '../../src/runtime.js';
import { AiTokenStore } from '../../src/ai-tokens.js';
import { createAiControl } from '../../src/ai-api.js';
import { ComboEngine } from '../../src/combo.js';
import { defaultsFor } from '../../src/schema.js';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-combo-ai-'));
  const a = createRuntime({ id: 'a', store: createStore(path.join(dir, 'tenants', 'a', 'config.yaml')), dataDir: path.join(dir, 'tenants', 'a'), mediaDirs: [dir], entitled: () => true });
  const tokens = new AiTokenStore({ dir });
  const control = createAiControl({
    dataDir: dir,
    tokens,
    resolveTenant: (id) => (id === 'a' ? { id, runtime: a, widgetBase: 'http://127.0.0.1/t/obs', getWidgets: () => [], setWidgets() {}, getTemplate: () => null, setTemplate() {} } : null),
    applyBilling: () => ({}),
  });
  const app = express();
  app.use(express.json());
  app.use('/ai/v1', control.router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  return {
    a, tokens, base: `http://127.0.0.1:${server.address().port}`,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      await a.close();
    },
  };
}

test('AC-14 AI の combo ツールは combo を返し、RUSH を動かさない', { concurrency: false }, async (t) => {
  const before = { TW_ENV: process.env.TW_ENV, TW_AI_WRITE: process.env.TW_AI_WRITE, PORT: process.env.PORT };
  process.env.TW_ENV = 'dev';
  process.env.TW_AI_WRITE = 'on';
  process.env.PORT = '3941';
  const ctx = await boot();
  t.after(() => {
    for (const [k, v] of Object.entries(before)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    return ctx.close();
  });
  const token = ctx.tokens.issue({ name: '試験', tenants: ['a'], scopes: ['operate'] }).value;
  const post = (action) => fetch(`${ctx.base}/ai/v1/combo`, {
    method: 'POST',
    headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
    body: JSON.stringify({ tenant: 'a', action }),
  });
  const rushBefore = ctx.a.readRush();
  const rushState = (rush) => ({ active: rush.active, last: rush.last });

  const status = await post('status');
  assert.equal(status.status, 200);
  const body = await status.json();
  assert.ok(body.combo, 'combo の snapshot を返す');
  assert.deepEqual(Object.keys(body.combo).sort(), ['active', 'last', 'now', 'seconds']);
  assert.equal('rush' in body, false);

  for (const action of ['reset', 'test']) {
    const res = await post(action);
    assert.equal(res.status, 200, action);
    assert.deepEqual(rushState(ctx.a.readRush()), rushState(rushBefore), `${action} で RUSH が変わらない`);
  }

  // 配信中の本番では 'test' が拒まれる
  process.env.TW_ENV = 'production';
  ctx.a.hub.setStatus({ mode: 'live', username: 'tester' });
  const live = await post('test');
  assert.equal(live.status, 403);
  assert.deepEqual(rushState(ctx.a.readRush()), rushState(rushBefore));
});

function engine() {
  const hub = new EventEmitter();
  hub.status = { mode: 'live' };
  const sent = [];
  hub.broadcast = (m) => sent.push(m);
  const combo = new ComboEngine(hub);
  combo.setConfig({ ...defaultsFor('combo') });
  return { combo, sent };
}

for (const [name, stop] of [
  ['reset()', (c) => c.reset()],
  ['close()', (c) => c.close()],
  ['setConfig({ enabled: false })', (c) => c.setConfig({ ...defaultsFor('combo'), enabled: false })],
]) {
  test(`AC-15 test() のタイマーは ${name} のあと残らない`, () => {
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1_000_000 });
    try {
      const { combo, sent } = engine();
      combo.test({ id: 'u1', name: 'たろう' }, 20);
      mock.timers.tick(1000); // 途中まで数える
      stop(combo);
      const after = sent.length;
      mock.timers.tick(10_000);
      assert.equal(sent.length, after, '偽の時計を進めても combo が配られない');
      assert.equal(combo.snapshot().active.length, 0);
    } finally {
      mock.timers.reset();
    }
  });
}
