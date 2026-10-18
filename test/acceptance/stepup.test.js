import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import { Hub } from '../../src/hub.js';
import { StepupEngine } from '../../src/stepup.js';
import { SCHEMA, defaultsFor } from '../../src/schema.js';
import { normalize, createStore, widgetList } from '../../src/config.js';
import { createRuntime } from '../../src/runtime.js';
import { callTool, cleanEnv, runCliWithCode, withMcp } from '../helpers/guard-harness.js';

const gift = (coins, over = {}) => ({
  kind: 'gift',
  user: { id: over.userId ?? 'u1', name: over.userName ?? 'たろう', avatar: 'avatar.png' },
  gift: { id: over.giftId ?? '5655', name: over.giftName ?? 'Rose', count: over.count ?? 1 },
  totalDiamonds: coins,
  ...over,
});

const engineWith = (config = {}) => {
  const hub = new Hub();
  const sent = [];
  const original = hub.broadcast.bind(hub);
  hub.broadcast = (message) => {
    sent.push(message);
    original(message);
  };
  const engine = new StepupEngine(hub);
  engine.setConfig({ ...defaultsFor('stepup'), ...config });
  return { hub, engine, sent };
};

const stepupMessages = (sent) => sent.filter((message) => message.type === 'stepup');

test('AC-1: medium の境目をギフトごとに1段ずつ上げ、送った人と日本語のギフト名を配る', () => {
  const { hub, engine, sent } = engineWith();
  for (const coins of [100, 200, 300, 400, 1000]) hub.publish(gift(coins));

  assert.equal(engine.snapshot().last.step, 5);
  assert.deepEqual(engine.snapshot().thresholds, [100, 300, 600, 1000, 2000]);
  const events = stepupMessages(sent).map((message) => message.event);
  assert.deepEqual(events.slice(0, 5).map((event) => event.kind), ['up', 'up', 'up', 'up', 'final']);
  assert.equal(events[0].user.name, 'たろう');
  assert.equal(events[0].gift, 'バラ');
  engine.close();
});

test('AC-2: 5000 コインでも1段だけ上がり、続くギフトで STEP 5 に届く', () => {
  const { hub, engine, sent } = engineWith();
  hub.publish(gift(5000));
  assert.equal(engine.snapshot().step, 1);
  assert.equal(stepupMessages(sent).at(-1).event.kind, 'up');

  for (let i = 0; i < 4; i++) hub.publish(gift(1));
  assert.equal(engine.snapshot().last.step, 5);
  assert.equal(stepupMessages(sent).at(-1).event.kind, 'final');
  assert.equal(engine.snapshot().active, false);
  engine.close();
});

test('AC-3: 時間切れは end と last を残し、冷却中は新しいラウンドを始めない', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  const { hub, engine, sent } = engineWith({ windowSeconds: 30, cooldownSeconds: 10 });
  hub.publish(gift(100));
  t.mock.timers.tick(30_000);

  assert.equal(engine.snapshot().active, false);
  assert.equal(stepupMessages(sent).at(-1).event.kind, 'end');
  assert.equal(engine.snapshot().last.step, 1);
  assert.equal(engine.snapshot().last.total, 100);
  hub.publish(gift(100));
  assert.equal(engine.snapshot().active, false);
  t.mock.timers.tick(10_000);
  hub.publish(gift(100));
  assert.equal(engine.snapshot().active, true);
  engine.close();
});

test('AC-4: 少額・gift 以外・無効設定では数えない', () => {
  const { hub, engine } = engineWith({ minCoins: 10 });
  hub.publish(gift(9));
  hub.publish({ kind: 'follow', user: { id: 'u2', name: 'はなこ' } });
  assert.equal(engine.snapshot().total, 0);
  engine.setConfig({ ...defaultsFor('stepup'), enabled: false });
  hub.publish(gift(100));
  assert.equal(engine.snapshot().total, 0);
  engine.close();
});

test('AC-5: 4つの境目プリセットと custom の逆転検証', () => {
  const expected = {
    small: [10, 30, 60, 100, 200],
    medium: [100, 300, 600, 1000, 2000],
    large: [500, 1500, 3000, 5000, 10000],
  };
  for (const [scale, thresholds] of Object.entries(expected)) {
    const { engine } = engineWith({ scale });
    assert.deepEqual(engine.snapshot().thresholds, thresholds);
    engine.close();
  }
  const custom = normalize({ stepup: { scale: 'custom', step1Coins: 1, step2Coins: 2, step3Coins: 3, step4Coins: 4, step5Coins: 5 } });
  assert.deepEqual(custom.errors, []);
  const invalid = normalize({ stepup: { scale: 'custom', step1Coins: 1, step2Coins: 3, step3Coins: 2 } });
  assert.ok(invalid.errors.some((error) => error.includes('step3Coins') && /前|大き/.test(error)));
});

test('AC-6: 配信中のテストは状態を変えず preview だけを配り、待機中のテストは数える', () => {
  const { hub, engine, sent } = engineWith();
  hub.setStatus({ mode: 'live' });
  const before = engine.snapshot();
  hub.publish({ ...gift(100), test: true });
  const after = engine.snapshot();
  assert.equal(after.total, before.total);
  assert.equal(after.step, before.step);
  assert.equal(after.last, before.last);
  assert.equal(stepupMessages(sent).at(-1).event.kind, 'preview');

  hub.setStatus({ mode: 'idle' });
  hub.publish({ ...gift(100), test: true });
  assert.equal(engine.snapshot().total, 100);
  hub.reset();
  assert.equal(engine.snapshot().active, false);
  assert.equal(engine.snapshot().total, 0);
  engine.close();
});

test('AC-7: runtime の API と操作は同じテナント内だけを操作する', async (t) => {
  const roots = [fs.mkdtempSync(path.join(os.tmpdir(), 'tw-stepup-runtime-')), fs.mkdtempSync(path.join(os.tmpdir(), 'tw-stepup-runtime-'))];
  const runtimes = roots.map((root, index) => {
    const configPath = path.join(root, 'config.yaml');
    fs.copyFileSync(path.join(process.cwd(), 'config.example.yaml'), configPath);
    return createRuntime({
      id: `tenant-${index}`,
      store: createStore(configPath),
      dataDir: path.join(root, 'data'),
      mediaDirs: [path.join(root, 'media')],
      entitled: () => true,
      info: () => ({ mode: 'tenant', widgets: ['stepup'] }),
    });
  });
  t.after(async () => {
    await Promise.all(runtimes.map((runtime) => runtime.close()));
    for (const root of roots) fs.rmSync(root, { recursive: true, force: true });
  });
  const app = express();
  app.use(express.json());
  app.use(runtimes[0].router);
  const server = await new Promise((resolve) => {
    const httpServer = app.listen(0, '127.0.0.1', () => resolve(httpServer));
  });
  t.after(() => server.close());
  const base = `http://127.0.0.1:${server.address().port}`;

  const status = await fetch(`${base}/api/stepup`).then((response) => response.json());
  assert.equal(status.active, false);
  const control = await fetch(`${base}/api/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ target: 'stepup', action: 'status' }),
  }).then((response) => response.json());
  assert.equal(control.ok, true);
  assert.deepEqual({ ...control.stepup, now: undefined }, { ...status, now: undefined });

  const cli = await runCliWithCode(['stepup', 'status'], cleanEnv({ TW_SERVER: base }));
  assert.equal(cli.code, 0, cli.out);
  assert.match(cli.out, /ステップアップ予告/);
  const mcp = await withMcp({ TW_SERVER: base }, ({ request }) => callTool(request, 'stepup', { action: 'status' }));
  assert.equal(mcp.isError, false);
  assert.match(mcp.text, /ステップアップ予告/);

  runtimes[0].hub.publish(gift(100, { userId: 'only-a' }));
  assert.equal(runtimes[0].readStepup().total, 100);
  assert.equal(runtimes[1].readStepup().total, 0);
});

test('AC-8: 初期値・往復読み込み・ウィジェット URL とサイズがある', () => {
  const normalized = normalize({});
  assert.deepEqual(normalized.errors, []);
  assert.equal(normalized.config.stepup.windowSeconds, 30);
  assert.equal(normalized.config.stepup.scale, 'medium');
  const list = widgetList(normalized.config, 'http://example.test');
  assert.deepEqual(list.find((item) => item.section === 'stepup'), {
    section: 'stepup',
    id: null,
    title: SCHEMA.stepup.title,
    url: 'http://example.test/widgets/stepup.html',
    size: [1080, 1920],
  });
});

test('AC-9: かんたん設定の項目は schema にあり、日本語の呼び名がある', () => {
  const fields = new Set(Object.keys(SCHEMA.stepup.fields));
  const source = fs.readFileSync(path.join(process.cwd(), 'public/dashboard/simple.js'), 'utf8');
  const simpleFields = ['enabled', 'windowSeconds', 'scale', 'minCoins', 'step1Text', 'step2Text', 'step3Text', 'step4Text', 'step5Text', 'finalText', 'cooldownSeconds', 'sound', 'volume', 'edge'];
  assert.ok(simpleFields.length > 0);
  for (const field of simpleFields) {
    assert.ok(fields.has(field), `${field} が schema にありません`);
    assert.match(source, new RegExp(`['"]stepup\\.${field}['"]\\s*:`));
  }
  assert.match(source, /stepup:\s*\{[\s\S]*?options:\s*\[[\s\S]*?小さめ[\s\S]*?ふつう[\s\S]*?大きい/);
});
