import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { Tenants } from '../src/tenants.js';

// 回帰テスト: PUT /api/me/widgets の返事に features が無かったため、
// ダッシュボードが返事で me を入れ替えた途端に「使えるもの」の判定が全部ずれ、
// カード一覧が消えて「使う」を押しても使えなく見えた（2026-10-31 の顧客報告）。
const setup = async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-me-widgets-'));
  const tenants = new Tenants({ dir, env: {} });
  const tenant = tenants.create({ name: 'ためし' });
  const rt = tenants.runtime(tenant.id);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.role = 'owner'; // 本番では /t/<鍵>/ の中継が入れる
    next();
  });
  app.use(rt.router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await tenants.close(tenant.id);
  };
  const putWidgets = async (widgets) => {
    const res = await fetch(`${base}/api/me/widgets`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ widgets }),
    });
    assert.equal(res.status, 200);
    return res.json();
  };
  return { tenants, tenant, base, close, putWidgets };
};

test('使うウィジェットの更新の返事にも features が入り、GET /api/me と形がそろう', async () => {
  const { tenant, base, close, putWidgets } = await setup();
  try {
    const before = await (await fetch(`${base}/api/me`)).json();
    assert.equal(before.mode, 'tenant');
    assert.ok(before.features && typeof before.features === 'object');
    assert.ok('gacha' in before.features);
    assert.ok('bosses' in before.features);
    // 豪華な演出（premium）は、初めは使えないので features に入らない
    assert.ok(!('cutins' in before.features));

    const after = await putWidgets([...before.widgets, 'gacha']);
    assert.ok(after.widgets.includes('gacha'), '足したウィジェットが返事に残る');
    assert.ok(after.features && typeof after.features === 'object', '更新の返事にも features がある');
    assert.deepEqual(Object.keys(after.features).sort(), Object.keys(before.features).sort());
  } finally {
    await close();
  }
});

test('返事の widgets をそのまま使って続けて更新しても、features が欠けず保存もされる', async () => {
  const { tenants, tenant, base, close, putWidgets } = await setup();
  try {
    const first = await (await fetch(`${base}/api/me`)).json();
    // ダッシュボード（editor.js）と同じ流れ: 返事を me として持ち回し、次の更新に使う
    const second = await putWidgets([...first.widgets, 'gacha']);
    assert.ok(second.features, '1回目の更新の返事に features がある');
    const third = await putWidgets([...second.widgets, 'bosses']);
    assert.ok(third.features, '2回目の更新の返事にも features がある');
    assert.ok(third.widgets.includes('gacha'));
    assert.ok(third.widgets.includes('bosses'));
    const fourth = await putWidgets(third.widgets.filter((w) => w !== 'gacha'));
    assert.ok(fourth.features, '外す更新の返事にも features がある');
    assert.ok(!fourth.widgets.includes('gacha'));
    assert.deepEqual(tenants.get(tenant.id).widgets, fourth.widgets);
  } finally {
    await close();
  }
});

test('使えない豪華な演出は今までどおり保存されず、features にも出ない', async () => {
  const { base, close, putWidgets } = await setup();
  try {
    const before = await (await fetch(`${base}/api/me`)).json();
    const after = await putWidgets([...before.widgets, 'stepup']);
    assert.ok(!after.widgets.includes('stepup'), '使えないものは保存されない');
    assert.ok(after.features && !('stepup' in after.features));
  } finally {
    await close();
  }
});

test('遊び方・案内・表示名の更新の返事も、GET /api/me と形がそろう', async () => {
  const { base, close } = await setup();
  try {
    const put = async (url, body) => {
      const res = await fetch(`${base}${url}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      assert.equal(res.status, 200);
      return res.json();
    };
    for (const [url, body] of [
      ['/api/me/template', { template: 'talk' }],
      ['/api/me/guide', { done: true }],
      ['/api/me/name', { name: '新しい名前' }],
    ]) {
      const after = await put(url, body);
      assert.ok(after.features && typeof after.features === 'object', `${url} の返事に features がある`);
      assert.equal(after.role, 'owner');
    }
  } finally {
    await close();
  }
});
