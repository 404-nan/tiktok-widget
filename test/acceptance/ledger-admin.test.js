// 集金台帳の管理 API の受け入れテスト。一時 TW_DATA・一時 streamers・一時貸出データだけを使い、
// 二重送信・同期 retry でお金を二重に数えないことを実サーバーで確かめる。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { startHostedServer } from '../helpers/guard-harness.js';
import { writeRentalOpsFixture, writeStreamers, writeRentalState, rentalSession, rentalReservation, liveKey } from '../helpers/ledger-fixture.js';

const roots = [];
const children = [];
after(() => {
  for (const c of children) c.kill();
  for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
});

async function boot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ledger-ac-'));
  roots.push(root);
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, 'tenants.json'), JSON.stringify({ tenants: [], global: { access: {} } }));
  const configPath = path.join(root, 'config.yaml');
  fs.writeFileSync(configPath, '');
  const streamersFile = path.join(root, 'streamers.json');
  const rentalStateDir = path.join(root, 'mc-state');
  const rentalOpsDir = path.join(root, 'rental-ops');
  writeStreamers(streamersFile, [{ id: 's1', name: 'テスト花子', [liveKey]: ['t1'], rental: ['u1'] }]);
  writeRentalState(rentalStateDir, {
    reservations: [rentalReservation('r1', 'u1')],
    usage: [rentalSession('r1', 'u1'), { kind: 'revenue', sessionId: 'r1', reservationId: 'r1', revenueYen: 1000, reportedAt: '2026-11-10T12:00:00.000Z' }],
  });
  writeRentalOpsFixture(rentalOpsDir);
  const server = await startHostedServer({
    env: {
      TW_CONFIG: configPath,
      TW_DATA: dataDir,
      TW_ENV: 'dev',
      TW_RESUME_CONNECT: '0',
      TW_ADMIN_TOKEN: 'admin-token-for-test',
      TW_STREAMERS: streamersFile,
      TW_RENTAL_STATE: rentalStateDir,
      TW_RENTAL_OPS_DIR: rentalOpsDir,
      TW_NUMBERS_CONFIG: path.join(root, 'numbers.json'),
    },
  });
  children.push(server.child);
  const base = await server.ready;
  const api = async (p, { method = 'GET', body, token = 'admin-token-for-test' } = {}) => {
    const res = await fetch(`${base}/admin/api${p}`, {
      method,
      headers: { 'content-type': 'application/json', ...(token ? { 'x-admin-token': token } : {}) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let json = null;
    try { json = await res.json(); } catch {}
    return { status: res.status, json };
  };
  return { base, api, dataDir };
}

test('管理 API だけで、同期→残高→集金 retry→訂正→取り消しまで辿れ、retry は二重計上しない', async () => {
  const s = await boot();
  assert.equal((await s.api('/ledger/summary', { token: null })).status, 401);

  const firstSync = await s.api('/ledger/sync', { method: 'POST', body: {} });
  assert.equal(firstSync.status, 200);
  assert.equal(firstSync.json.added.accrual, 1);
  const secondSync = await s.api('/ledger/sync', { method: 'POST', body: {} });
  assert.equal(secondSync.json.added.accrual, 0);

  const summary = await s.api('/ledger/summary');
  assert.equal(summary.status, 200);
  const row = summary.json.streamers.find((x) => x.id === 's1');
  assert.equal(row.balanceYen, 100);
  assert.equal(row.uncollectedYen, 100);

  const payment = { streamerId: 's1', amountYen: 40, collectedAt: '2026-11-11T10:00:00.000Z', method: 'paypay', clientRequestId: 'ac-req-1' };
  const first = await s.api('/ledger/collections', { method: 'POST', body: payment });
  assert.equal(first.status, 200);
  const retry = await s.api('/ledger/collections', { method: 'POST', body: payment });
  assert.equal(retry.status, 200);
  assert.equal(retry.json.entry.id, first.json.entry.id);
  const entries1 = await s.api('/ledger/streamers/s1/entries');
  assert.equal(entries1.json.total, 2);
  const detail = await s.api('/ledger/streamers/s1');
  assert.equal(detail.json.balance.balanceYen, 60);
  assert.equal(detail.json.balance.sinceLastCollectionYen, 0);
  assert.equal(detail.json.sales.every((row) => Object.hasOwn(row, liveKey)), true);

  const bad = await s.api('/ledger/adjustments', { method: 'POST', body: { streamerId: 's1', amountYen: 20, direction: 'add' } });
  assert.equal(bad.status, 400);
  const adj = await s.api('/ledger/adjustments', { method: 'POST', body: { streamerId: 's1', amountYen: 20, direction: 'add', reason: 'テスト追加', clientRequestId: 'ac-adj-1' } });
  assert.equal(adj.status, 200);
  const adj2 = await s.api('/ledger/adjustments', { method: 'POST', body: { streamerId: 's1', amountYen: 20, direction: 'add', reason: 'テスト追加', clientRequestId: 'ac-adj-1' } });
  assert.equal(adj2.json.entry.id, adj.json.entry.id);
  const beforeReverse = await s.api('/ledger/streamers/s1/entries');
  assert.equal(beforeReverse.json.total, 3);
  const reversal = await s.api(`/ledger/entries/${adj.json.entry.id}/reversal`, { method: 'POST', body: { reason: '入力間違い' } });
  assert.equal(reversal.status, 200);
  const finalDetail = await s.api('/ledger/streamers/s1');
  assert.equal(finalDetail.json.balance.balanceYen, 60);
  const entriesFile = fs.readFileSync(path.join(s.dataDir, 'ledger', 'entries.jsonl'), 'utf8').trim().split('\n');
  assert.equal(entriesFile.length, 4);
  const staticUi = await fetch(`${s.base}/admin/admin-ledger.js`);
  assert.equal(staticUi.status, 200);
  assert.match(await staticUi.text(), /集金/);
});

test('台帳の古いページから取り消せて、別ページの取り消しも判定する', async () => {
  const { api } = await boot();
  const payment = { streamerId: 's1', amountYen: 40, clientRequestId: 'old' };
  const { json: { entry: old } } = await api('/ledger/collections', { method: 'POST', body: payment });
  for (let i = 0; i < 20; i++) {
    const response = await api('/ledger/collections', { method: 'POST', body: { ...payment, clientRequestId: `new-${i}` } });
    assert.equal(response.status, 200);
  }
  const firstPage = (await api('/ledger/streamers/s1')).json;
  assert.equal(firstPage.entryPage.total, 21);
  assert.equal(firstPage.entries.some(({ id }) => id === old.id), false);
  const secondPage = (await api('/ledger/streamers/s1?offset=20')).json;
  assert.deepEqual(secondPage.entries.map(({ id, reversed }) => [id, reversed]), [[old.id, false]]);
  const reversal = await api(`/ledger/entries/${old.id}/reversal`, { method: 'POST', body: { reason: '誤記' } });
  assert.equal(reversal.status, 200);
  const refreshed = (await api('/ledger/streamers/s1?offset=20')).json;
  assert.equal(refreshed.entries.find(({ id }) => id === old.id).reversed, true);
  assert.equal(refreshed.entries.some(({ kind }) => kind === 'reversal'), false);
});
