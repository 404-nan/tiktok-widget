import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import express from 'express';
import YAML from 'yaml';
import { Hub } from '../../src/hub.js';
import { StepupEngine } from '../../src/stepup.js';
import { SwarmEngine } from '../../src/swarm.js';
import { SCHEMA, defaultsFor } from '../../src/schema.js';
import { normalize, createStore, widgetList } from '../../src/config.js';
import { createRuntime } from '../../src/runtime.js';
import { callTool, cleanEnv, runCliWithCode, withMcp } from '../helpers/guard-harness.js';

const gift = (count = 1, over = {}) => ({
  kind: 'gift',
  user: { id: over.userId ?? 'u1', name: over.userName ?? 'たろう', avatar: 'avatar.png' },
  gift: {
    id: over.giftId ?? '5655',
    name: over.giftName ?? 'Rose',
    count,
    diamonds: over.diamonds ?? 1,
    image: over.image ?? 'rose.png',
    icon: over.icon ?? 'flower-2',
  },
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
  const engine = new SwarmEngine(hub);
  engine.setConfig({ ...defaultsFor('swarm'), ...config });
  return { hub, engine, sent };
};

const swarmMessages = (sent) => sent.filter((message) => message.type === 'swarm');

test('AC-1: medium の30個で一度だけ群を起こし、29個では起こさない', () => {
  const { hub, engine, sent } = engineWith({ cooldownSeconds: 20 });
  hub.publish(gift(29));
  assert.equal(swarmMessages(sent).length, 0);
  assert.equal(engine.snapshot().window, 29);

  hub.publish(gift(1));
  assert.equal(swarmMessages(sent).length, 1);
  assert.equal(swarmMessages(sent)[0].event.kind, 'swarm');
  assert.equal(swarmMessages(sent)[0].event.count, 30);
  assert.equal(swarmMessages(sent)[0].event.coins, 30);
  assert.equal(engine.snapshot().window, 0);

  hub.publish(gift(30));
  assert.equal(swarmMessages(sent).length, 1);
  engine.close();
});

test('AC-2: 種類をまとめて並べ、アイコン数を制限し、倍率から段階を決める', () => {
  const { hub, engine, sent } = engineWith({ maxIcons: 12 });
  for (let i = 0; i < 12; i++) hub.publish(gift(1, { giftId: `gift-${i}`, giftName: `ギフト${i}`, icon: `icon-${i}` }));
  hub.publish(gift(18, { giftId: 'gift-top', giftName: 'いちばん多い', icon: 'top-icon' }));

  const event = swarmMessages(sent)[0].event;
  assert.equal(event.gifts.length, 12);
  assert.equal(event.gifts[0].name, 'いちばん多い');
  assert.equal(event.gifts[0].count, 18);
  assert.equal(event.iconCount, 12);
  assert.deepEqual(event.users, ['たろう']);
  engine.close();

  for (const [multiple, level] of [[1, 1], [2, 2], [3, 3], [10, 4]]) {
    const current = engineWith({ cooldownSeconds: 0 });
    current.hub.publish(gift(30 * multiple));
    assert.equal(swarmMessages(current.sent).at(-1).event.level, level);
    current.engine.close();
  }
});

test('AC-3: 窓から古いギフトを捨て、冷却中は起こさず、終われば再び起こす', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1_000_000 });
  const { hub, engine, sent } = engineWith({ windowSeconds: 5, cooldownSeconds: 3 });
  hub.publish(gift(29));
  t.mock.timers.tick(6_000);
  hub.publish(gift(1));
  assert.equal(engine.snapshot().window, 1);
  assert.equal(swarmMessages(sent).length, 0);

  hub.publish(gift(29));
  assert.equal(swarmMessages(sent).length, 1);
  hub.publish(gift(30));
  assert.equal(swarmMessages(sent).length, 1);
  t.mock.timers.tick(3_000);
  hub.publish(gift(30));
  assert.equal(swarmMessages(sent).length, 2);
  engine.close();
});

test('AC-4: 4つの境目プリセットと custom の日本語エラー', () => {
  const expected = {
    small: 10,
    medium: 30,
    large: 100,
  };
  for (const [scale, threshold] of Object.entries(expected)) {
    const { engine } = engineWith({ scale });
    assert.equal(engine.snapshot().threshold, threshold);
    engine.close();
  }
  const custom = engineWith({ scale: 'custom', threshold: 7 });
  assert.equal(custom.engine.snapshot().threshold, 7);
  custom.engine.close();

  const invalid = normalize({ swarm: { scale: 'custom', threshold: 0 } });
  assert.ok(invalid.errors.some((error) => error.includes('threshold') && /1 以上/.test(error)));
});

test('AC-5: 配信中のテストは preview だけ、待機中のテストは数え、無効化と reset が効く', async () => {
  const { hub, engine, sent } = engineWith();
  hub.setStatus({ mode: 'live' });
  const before = engine.snapshot();
  hub.publish({ ...gift(30), test: true });
  const after = engine.snapshot();
  assert.equal(after.window, before.window);
  assert.equal(after.last, before.last);
  assert.equal(swarmMessages(sent).at(-1).event.kind, 'preview');

  hub.setStatus({ mode: 'idle' });
  hub.publish({ ...gift(2), test: true });
  assert.equal(engine.snapshot().window, 2);
  hub.reset();
  assert.equal(engine.snapshot().window, 0);

  engine.setConfig({ ...defaultsFor('swarm'), enabled: false });
  hub.publish(gift(30));
  assert.equal(engine.snapshot().window, 0);
  engine.close();

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-swarm-entitlement-'));
  try {
    const runtime = createRuntime({
      store: createStore(path.join(root, 'config.yaml')),
      dataDir: path.join(root, 'data'),
      mediaDirs: [path.join(root, 'media')],
      entitled: () => false,
    });
    runtime.hub.publish(gift(30));
    assert.equal(runtime.readSwarm().window, 0);
    await runtime.close();
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('AC-6: API・CLI・MCP の操作と状態は同じテナント内だけに返る', async (t) => {
  const roots = [os.tmpdir(), os.tmpdir()].map((dir) => fs.mkdtempSync(path.join(dir, 'tw-swarm-runtime-')));
  const runtimes = roots.map((root, index) => {
    const configPath = path.join(root, 'config.yaml');
    fs.copyFileSync(path.join(process.cwd(), 'config.example.yaml'), configPath);
    return createRuntime({
      id: `tenant-${index}`,
      store: createStore(configPath),
      dataDir: path.join(root, 'data'),
      mediaDirs: [path.join(root, 'media')],
      entitled: () => true,
      info: () => ({ mode: 'tenant', widgets: ['swarm'] }),
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

  const status = await fetch(`${base}/api/swarm`).then((response) => response.json());
  assert.equal(status.active, false);
  const control = await fetch(`${base}/api/control`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ target: 'swarm', action: 'status' }),
  }).then((response) => response.json());
  assert.equal(control.ok, true);
  assert.deepEqual({ ...control.swarm, now: undefined }, { ...status, now: undefined });

  const cli = await runCliWithCode(['swarm', 'status'], cleanEnv({ TW_SERVER: base }));
  assert.equal(cli.code, 0, cli.out);
  assert.match(cli.out, /群予告/);
  const mcp = await withMcp({ TW_SERVER: base }, ({ request }) => callTool(request, 'swarm', { action: 'status' }));
  assert.equal(mcp.isError, false);
  assert.match(mcp.text, /群予告/);

  runtimes[0].hub.publish(gift(2, { userId: 'only-a' }));
  assert.equal(runtimes[0].readSwarm().window, 2);
  assert.equal(runtimes[1].readSwarm().window, 0);
});

test('AC-7: 初期値・config.example.yaml・ウィジェット URL・かんたん設定がそろう', () => {
  const normalized = normalize({});
  assert.deepEqual(normalized.errors, []);
  assert.equal(normalized.config.swarm.windowSeconds, 5);
  assert.equal(normalized.config.swarm.scale, 'medium');

  const example = fs.readFileSync(path.join(process.cwd(), 'config.example.yaml'), 'utf8');
  const roundTrip = normalize(YAML.parse(example));
  assert.deepEqual(roundTrip.errors, []);
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-swarm-config-'));
  try {
    const file = path.join(root, 'config.yaml');
    fs.writeFileSync(file, example);
    const store = createStore(file);
    const result = store.replaceText(store.readText());
    assert.equal(result.ok, true);
    assert.equal(store.readText(), example);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  const list = widgetList(normalized.config, 'http://example.test');
  assert.deepEqual(list.find((item) => item.section === 'swarm'), {
    section: 'swarm',
    id: null,
    title: SCHEMA.swarm.title,
    url: 'http://example.test/widgets/swarm.html',
    size: [1080, 1920],
  });

  const source = fs.readFileSync(path.join(process.cwd(), 'public/dashboard/simple.js'), 'utf8');
  const fields = Object.keys(SCHEMA.swarm.fields);
  for (const field of fields) assert.match(source, new RegExp(`['"]swarm\\.${field}['"]\\s*:`));
  assert.match(source, /swarm:\s*\{[\s\S]*?options:\s*\[[\s\S]*?小さめ[\s\S]*?ふつう[\s\S]*?大きい/);
  assert.match(source, /'swarm\.enabled':\s*'[^']+'/);
});

test('追加: stepup の final と end の配信 snapshot に終了時点の段と合計を入れる', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 2_000_000 });
  const finalHub = new Hub();
  const finalSent = [];
  finalHub.broadcast = (message) => finalSent.push(message);
  const finalEngine = new StepupEngine(finalHub);
  finalEngine.setConfig({
    ...defaultsFor('stepup'),
    scale: 'custom',
    step1Coins: 1,
    step2Coins: 2,
    step3Coins: 3,
    step4Coins: 4,
    step5Coins: 5,
  });
  for (let coins = 1; coins <= 5; coins++) finalHub.publish({ ...gift(1), totalDiamonds: coins });
  const finalMessage = finalSent.at(-1);
  assert.equal(finalMessage.event.kind, 'final');
  assert.equal(finalMessage.stepup.step, 5);
  assert.equal(finalMessage.stepup.total, 15);
  finalEngine.close();

  const endHub = new Hub();
  const endSent = [];
  endHub.broadcast = (message) => endSent.push(message);
  const endEngine = new StepupEngine(endHub);
  endEngine.setConfig({ ...defaultsFor('stepup'), windowSeconds: 5 });
  endHub.publish({ ...gift(1), totalDiamonds: 100 });
  t.mock.timers.tick(5_000);
  const endMessage = endSent.at(-1);
  assert.equal(endMessage.event.kind, 'end');
  assert.equal(endMessage.stepup.step, 1);
  assert.equal(endMessage.stepup.total, 100);
  endEngine.close();
});
