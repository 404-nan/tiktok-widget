// 編集の書き込み API（画像・切り抜き・配置・YAML・AI）が、確認スイッチとプランで 403 を返すかを HTTP で確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { Tenants } from '../src/tenants.js';
import { configPatchCapability } from '../src/runtime-routes.js';
import { setActiveErrorLog } from '../src/error-log.js';

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da63f8cfc0f01f0005000201a0c8f0b30000000049454e44ae426082', 'hex');

async function setup({ billing, plan }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-plan-edit-'));
  const tenants = new Tenants({ dir, env: { TW_BILLING: billing } });
  const tenant = tenants.create({ name: 'ためし' });
  if (plan) tenants.updateBilling(tenant.id, { plan, status: 'active', paidUntil: '2099-01-01' });
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
  const send = (method, url, body, type = 'application/json') => fetch(`${base}${url}`, {
    method,
    headers: { 'content-type': type },
    body: type === 'application/json' ? JSON.stringify(body) : body,
  });
  const close = async () => {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await tenants.close(tenant.id);
  };
  return { tenants, tenant, send, close };
}

// 編集の操作ごとに、その操作だけをする本物の書き込み
const EDITS = [
  ['edit.media', (send) => send('POST', '/api/media', PNG, 'image/png')],
  ['edit.cutinImage', (send) => send('PATCH', '/api/config', { path: ['imageCutins', 'default', 'crop'], value: { x: 0.4, y: 0.5, scale: 1.2 } })],
  ['edit.layout', (send) => send('PATCH', '/api/config', { path: ['alerts', 'default'], merge: true, value: { posX: 10, posY: 20, posScale: 1 } })],
  ['edit.advanced', (send) => send('PUT', '/api/config', { yaml: 'alerts:\n  default:\n    duration: 4\n' })],
  ['edit.ai', (send) => send('POST', '/api/ai/ask', { text: '色を変えて' })],
];

test('PATCH /api/config は変える項目の名前で、配置・切り抜きとふつうの変更を分ける', () => {
  assert.equal(configPatchCapability({ path: ['alerts', 'default'], merge: true, value: { posX: 1, posY: 2 } }), 'edit.layout');
  assert.equal(configPatchCapability({ path: 'alerts.default.posScale', value: 2 }), 'edit.layout');
  assert.equal(configPatchCapability({ path: ['imageCutins', 'a', 'crop'], value: { x: 0.5 } }), 'edit.cutinImage');
  assert.equal(configPatchCapability({ path: ['imageCutins', 'a'], merge: true, value: { crop: { x: 0.5 } } }), 'edit.cutinImage');
  // ふつうの変更・置き場所以外も一緒に入る変更（新しく作るときの初期値など）・消すのは、プランで分けない
  assert.equal(configPatchCapability({ path: ['alerts', 'default'], merge: true, value: { duration: 4 } }), null);
  assert.equal(configPatchCapability({ path: ['alerts', 'default'], merge: true, value: { duration: 4, posX: 1 } }), null);
  assert.equal(configPatchCapability({ path: ['alerts', 'default'], merge: true, value: { inAll: false } }), null);
  assert.equal(configPatchCapability({ path: ['alerts', 'default'], delete: true }), null);
  assert.equal(configPatchCapability({ path: ['active', 'alerts'], value: 'default' }), null);
});

test('確認スイッチがオンで Plus なら、編集の書き込みは 403 と requiredPlan・capability を返し、記録を残す', async () => {
  const { tenant, send, close } = await setup({ billing: 'on', plan: 'plus' });
  const rows = [];
  setActiveErrorLog({ record: (error, options) => { rows.push({ error, ...options }); return options; } });
  try {
    for (const [capability, edit] of EDITS) {
      const res = await edit(send);
      assert.equal(res.status, 403, capability);
      const body = await res.json();
      assert.equal(body.requiredPlan, 'pro', capability);
      assert.equal(body.capability, capability);
      assert.match(body.error, /Pro プランで使えます/);
    }
    assert.equal(rows.length, EDITS.length);
    assert.ok(rows.every((row) => row.kind === 'plan.capability' && row.level === 'warn' && row.context.tenant === tenant.id && row.context.route));
    // ふつうの設定の変更は Plus でもできる
    const plain = await send('PATCH', '/api/config', { path: ['alerts', 'default'], merge: true, value: { duration: 4 } });
    assert.equal(plain.status, 200);
  } finally {
    setActiveErrorLog(null);
    await close();
  }
});

test('確認スイッチがオンでも Pro なら、編集の書き込みは断らない', async () => {
  const { send, close } = await setup({ billing: 'on', plan: 'pro' });
  try {
    for (const [capability, edit] of EDITS) {
      const res = await edit(send);
      // AI はキーが無いので別の理由で断られることがあるが、プランの 403 にはならない
      const body = await res.json().catch(() => ({}));
      assert.notEqual(body.capability, capability, capability);
      if (capability !== 'edit.ai') assert.equal(res.status, 200, capability);
    }
  } finally {
    await close();
  }
});

test('確認スイッチがオフ（本番の初期値）なら、無料プランでも編集の書き込みは今までどおり通る', async () => {
  const { send, close } = await setup({ billing: 'off', plan: 'free' });
  try {
    for (const [capability, edit] of EDITS) {
      const res = await edit(send);
      const body = await res.json().catch(() => ({}));
      assert.notEqual(body.capability, capability, capability);
      if (capability !== 'edit.ai') assert.equal(res.status, 200, capability);
    }
  } finally {
    await close();
  }
});
