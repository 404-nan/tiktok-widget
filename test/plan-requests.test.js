// プランの申し込み（src/plan-requests.js）を確かめる。追記だけで消さない、二重送信を1件にまとめる、
// OBS の鍵は 403、通知が失敗しても申し込みは受けてエラーを残す、管理画面の「確かめて有効にする」で
// プラン・状態・支払った日までと変更の履歴が入る、解約は支払った日を過ぎたら停止にせず無料に落とす。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { Tenants } from '../src/tenants.js';
import { computeStatus, effectivePlanId } from '../src/billing.js';
import { PlanRequests, PLAN_REQUESTS_FILE, notifyOwner, oneMonthLater } from '../src/plan-requests.js';
import { createErrorLog, setActiveErrorLog } from '../src/error-log.js';
import { startLocalServer } from '../scripts/perf/lib/process.mjs';

const tmp = (name) => fs.mkdtempSync(path.join(os.tmpdir(), `tw-plan-req-${name}-`));

function useErrorLog() {
  const dir = tmp('errors');
  setActiveErrorLog(createErrorLog({ dir, env: 'test' }));
  const rows = () => fs.readdirSync(dir).flatMap((name) => fs.readFileSync(path.join(dir, name), 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)));
  return { dir, rows };
}

// 配信者1人分の API を role（owner / obs）つきで立てる
async function serve(tenants, tenantId, role = 'owner') {
  const app = express();
  app.use(express.json()); // 本番では server.js が先に入れる
  app.use((req, _res, next) => { req.role = role; next(); });
  app.use(tenants.runtime(tenantId).router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    base,
    post: (p, body) => fetch(`${base}${p}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }),
    get: (p) => fetch(`${base}${p}`),
    close: async () => { server.closeAllConnections?.(); await new Promise((resolve) => server.close(resolve)); },
  };
}

test('申し込みは追記だけで残し、有効にしても前の行は消さない', () => {
  const dir = tmp('append');
  const store = new PlanRequests({ dir, tenant: 't1' });
  const first = store.submit({ type: 'upgrade', plan: 'pro' });
  assert.equal(first.merged, false);
  assert.equal(first.request.state, 'pending');
  assert.match(first.request.at, /^\d{4}-\d{2}-\d{2}T/);
  const file = path.join(dir, PLAN_REQUESTS_FILE);
  const before = fs.readFileSync(file, 'utf8');
  store.decide(first.request.id, 'approved');
  const after = fs.readFileSync(file, 'utf8');
  assert.ok(after.startsWith(before), '前の行はそのまま残る');
  assert.equal(after.trim().split('\n').length, 2);
  assert.equal(store.get(first.request.id).state, 'approved');
  assert.deepEqual(store.pending(), []);
  assert.throws(() => store.decide(first.request.id, 'rejected'), (err) => err.status === 409);
});

test('同じ type・plan の確認中の申し込みは捨てずに1件へまとめ、まとめたことを返す', () => {
  const store = new PlanRequests({ dir: tmp('merge'), tenant: 't1' });
  const first = store.submit({ type: 'upgrade', plan: 'plus' });
  const again = store.submit({ type: 'upgrade', plan: 'plus' });
  assert.equal(again.merged, true);
  assert.equal(again.request.id, first.request.id);
  assert.equal(again.request.count, 2);
  assert.equal(store.pending().length, 1);
  // 違うプランは別の申し込み。処理済みのあとに押し直したら新しい申し込み
  assert.equal(store.submit({ type: 'upgrade', plan: 'pro' }).merged, false);
  store.decide(first.request.id, 'rejected');
  const fresh = store.submit({ type: 'upgrade', plan: 'plus' });
  assert.equal(fresh.merged, false);
  assert.notEqual(fresh.request.id, first.request.id);
  assert.throws(() => store.submit({ type: 'upgrade', plan: 'free' }), /申し込めるプラン/);
  assert.throws(() => store.submit({ type: 'other' }), /upgrade か cancel/);
});

test('読めない記録は原因と場所つきで plan.request.io に残し、500 の例外にする', () => {
  const errors = useErrorLog();
  try {
    const dir = tmp('io');
    fs.mkdirSync(path.join(dir, PLAN_REQUESTS_FILE)); // ファイルの場所がフォルダで読めない
    const store = new PlanRequests({ dir, tenant: 't-io' });
    assert.throws(() => store.list(), (err) => err.status === 500);
    assert.throws(() => store.submit({ type: 'upgrade', plan: 'pro' }), (err) => err.status === 500);
    const row = errors.rows().find((r) => r.kind === 'plan.request.io');
    assert.ok(row, 'plan.request.io が記録される');
    assert.equal(row.context.tenant, 't-io');
    assert.equal(row.context.op, 'plan.request.read');
    assert.equal(row.where.file, 'src/plan-requests.js');
  } finally {
    setActiveErrorLog(null);
  }
});

test('OBS の鍵では申し込めず（403）、/api/me にも申し込みの様子を返さない', async () => {
  const dir = tmp('obs');
  const tenants = new Tenants({ dir, env: {} });
  const tenant = tenants.create({ name: 'ためし' });
  const obs = await serve(tenants, tenant.id, 'obs');
  try {
    assert.equal((await obs.post('/api/me/plan-request', { type: 'upgrade', plan: 'pro' })).status, 403);
    assert.equal((await obs.get('/api/me/plan-requests')).status, 403);
    const me = await (await obs.get('/api/me')).json();
    assert.equal(me.planRequest, null);
    assert.equal(me.pendingRequest, null);
    assert.equal(fs.existsSync(path.join(tenants.dataDir(tenant.id), PLAN_REQUESTS_FILE)), false, '何も記録しない');
  } finally {
    await obs.close();
    await tenants.close(tenant.id);
  }
});

test('持ち主の鍵で申し込むと「確認中」が /api/me に出て、二重に押すと merged: true', async () => {
  const dir = tmp('owner');
  const tenants = new Tenants({ dir, env: {} });
  const tenant = tenants.create({ name: 'ためし' });
  const owner = await serve(tenants, tenant.id);
  try {
    const before = await (await owner.get('/api/me')).json();
    assert.equal(before.pendingRequest, null);
    assert.deepEqual(before.planRequest.options.map((o) => o.id), ['plus', 'pro']);
    assert.equal(typeof before.planRequest.paymentNote, 'string');
    assert.equal(before.planRequest.canCancel, false, 'お試し中は解約するものがない');
    assert.equal((await owner.post('/api/me/plan-request', { type: 'cancel' })).status, 400);

    const res = await owner.post('/api/me/plan-request', { type: 'upgrade', plan: 'pro' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.merged, false);
    assert.equal(body.notified, 'off', 'TW_NOTIFY_WEBHOOK が無ければ送らない');
    assert.equal(body.pendingRequest.plan, 'pro');
    assert.equal(body.pendingRequest.stateLabel, '確認中');

    const again = await (await owner.post('/api/me/plan-request', { type: 'upgrade', plan: 'pro' })).json();
    assert.equal(again.merged, true);
    assert.equal(again.request.count, 2);
    assert.equal(again.notified, 'skipped', 'まとめた分は通知を送り直さない');
    const list = await (await owner.get('/api/me/plan-requests')).json();
    assert.equal(list.requests.length, 1);
  } finally {
    await owner.close();
    await tenants.close(tenant.id);
  }
});

test('通知先が失敗しても申し込みは成功し、plan.request.notify を残す（webhook の URL は記録しない）', async () => {
  const errors = useErrorLog();
  const hook = createServer((_req, res) => { res.statusCode = 500; res.end('no'); });
  await new Promise((resolve) => hook.listen(0, '127.0.0.1', resolve));
  const secretUrl = `http://127.0.0.1:${hook.address().port}/api/webhooks/123/secret-token-part`;
  const saved = process.env.TW_NOTIFY_WEBHOOK;
  process.env.TW_NOTIFY_WEBHOOK = secretUrl;
  const dir = tmp('notify');
  const tenants = new Tenants({ dir, env: {} });
  const tenant = tenants.create({ name: 'ためし' });
  const owner = await serve(tenants, tenant.id);
  try {
    const res = await owner.post('/api/me/plan-request', { type: 'upgrade', plan: 'plus' });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
    assert.equal(body.notified, 'failed');
    assert.equal(tenants.planRequests(tenant.id).pending().length, 1, '申し込みは残る');
    const row = errors.rows().find((r) => r.kind === 'plan.request.notify');
    assert.ok(row, 'plan.request.notify が記録される');
    assert.equal(row.context.tenant, tenant.id);
    assert.equal(row.context.requestId, body.request.id);
    assert.doesNotMatch(JSON.stringify(errors.rows()), /secret-token-part/);
  } finally {
    if (saved == null) delete process.env.TW_NOTIFY_WEBHOOK;
    else process.env.TW_NOTIFY_WEBHOOK = saved;
    setActiveErrorLog(null);
    await owner.close();
    await tenants.close(tenant.id);
    hook.close();
  }
});

test('通知は TW_NOTIFY_WEBHOOK があるときだけ、1行を content で送る', async () => {
  const sent = [];
  const fakeFetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true, status: 204 }; };
  assert.equal(await notifyOwner('1行', { env: {}, fetchImpl: fakeFetch }), 'off');
  assert.equal(await notifyOwner('1行', { env: { TW_NOTIFY_WEBHOOK: 'https://example.invalid/hook' }, fetchImpl: fakeFetch }), 'sent');
  assert.deepEqual(sent, [{ url: 'https://example.invalid/hook', body: { content: '1行' } }]);
  assert.equal(await notifyOwner('1行', { env: { TW_NOTIFY_WEBHOOK: 'ftp://example.invalid' }, fetchImpl: fakeFetch }), 'failed');
});

test('支払った日までは、日本時間の今日から1か月後（月末はその月の末日）', () => {
  assert.equal(oneMonthLater(Date.parse('2026-11-27T12:00:00+09:00')), '2026-12-27');
  assert.equal(oneMonthLater(Date.parse('2026-12-15T00:30:00+09:00')), '2027-01-15');
  assert.equal(oneMonthLater(Date.parse('2027-01-31T10:00:00+09:00')), '2027-02-28');
  // UTC ではまだ前の日でも、日本時間の日付で数える
  assert.equal(oneMonthLater(Date.parse('2026-11-30T16:00:00Z')), '2027-01-01');
});

test('解約を確かめると、支払った日までは今のまま、過ぎたら支払い待ち・停止にせず無料に落ちる', () => {
  const dir = tmp('cancel');
  const tenants = new Tenants({ dir, env: {} });
  const tenant = tenants.create({ name: 'ためし' });
  try {
    tenants.updateBilling(tenant.id, { plan: 'plus', status: 'active', paidUntil: '2026-12-31' });
    const { request } = tenants.submitPlanRequest(tenant.id, { type: 'cancel', plan: 'plus' });
    const result = tenants.decidePlanRequest(tenant.id, request.id, 'approve');
    assert.equal(result.request.state, 'approved');
    assert.equal(result.billing.cancelled, true);
    assert.equal(result.billing.paidUntil, '2026-12-31', '期限は変えない');
    const entry = tenants.billing.account(tenant.id);
    assert.equal(computeStatus(entry, Date.parse('2026-12-20T00:00:00+09:00')), 'active');
    assert.equal(computeStatus(entry, Date.parse('2027-01-03T00:00:00+09:00')), 'free');
    assert.equal(computeStatus(entry, Date.parse('2027-03-01T00:00:00+09:00')), 'free', '猶予が過ぎても停止にしない');
    assert.equal(effectivePlanId(entry, Date.parse('2027-01-03T00:00:00+09:00')), 'free');
    assert.ok(result.billing.history.some((h) => h.changes.cancelled?.after === true), '変更の履歴に残る');
    // もう一度上げる申し込みを有効にしたら、解約は取り消す
    const up = tenants.submitPlanRequest(tenant.id, { type: 'upgrade', plan: 'pro' });
    const again = tenants.decidePlanRequest(tenant.id, up.request.id, 'approve');
    assert.equal(again.billing.cancelled, false);
  } finally {
    tenants.close(tenant.id);
  }
});

test('管理画面の「確かめて有効にする」で plan・status・paidUntil が入り、変更の履歴に残る（HTTP）', async () => {
  const server = await startLocalServer(process.cwd());
  try {
    const token = fs.readFileSync(path.join(server.dataDir, 'admin-token.txt'), 'utf8').trim();
    const admin = (p, body, method = 'POST') => fetch(`${server.baseUrl}/admin/api${p}`, {
      method, headers: { 'content-type': 'application/json', 'x-admin-token': token }, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const created = await (await admin('/tenants', { name: 'ためし' })).json();
    const t = created.tenant;
    const apiBase = t.urls.dashboard.replace(/\/dashboard\/$/, '');
    const obsBase = t.urls.obs.replace(/\/widgets\/$/, '');
    const send = (base) => fetch(`${base}/api/me/plan-request`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ type: 'upgrade', plan: 'plus' }) });

    assert.equal((await send(obsBase)).status, 403, 'OBS の鍵は 403');
    const sent = await (await send(apiBase)).json();
    assert.equal(sent.ok, true);

    // 管理画面の一覧に、確認中の申し込みが出る
    const listed = (await (await admin('/tenants', undefined, 'GET')).json()).tenants.find((row) => row.id === t.id);
    assert.equal(listed.planRequests.pending.length, 1);
    assert.equal(listed.planRequests.pending[0].planLabel, 'Plus');

    const res = await admin(`/tenants/${t.id}/plan-requests/${sent.request.id}/approve`, {});
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.request.state, 'approved');
    assert.equal(body.billing.plan, 'plus');
    assert.equal(body.billing.storedStatus, 'active');
    assert.equal(body.billing.paidUntil, oneMonthLater());
    const last = body.billing.history.at(-1).changes;
    assert.deepEqual(last.plan, { before: null, after: 'plus' });
    assert.deepEqual(last.status, { before: 'trial', after: 'active' });
    assert.equal(last.paidUntil.after, oneMonthLater());
    assert.equal(body.tenant.planRequests.pending.length, 0);
    assert.doesNotMatch(JSON.stringify(body.billing), /amount|入金額/, '金額の台帳は持たない');

    // 2回目は処理済み、知らない操作は断る
    assert.equal((await admin(`/tenants/${t.id}/plan-requests/${sent.request.id}/approve`, {})).status, 409);
    assert.equal((await admin(`/tenants/${t.id}/plan-requests/${sent.request.id}/delete`, {})).status, 400);
    // ダッシュボードの /api/me から「確認中」が消える
    const me = await (await fetch(`${apiBase}/api/me`)).json();
    assert.equal(me.pendingRequest, null);
    assert.equal(me.plan.id, 'plus');
  } finally {
    await server.stop();
  }
});

test('ダッシュボードの申し込みの部品は docs/words.md の言葉を使う', () => {
  const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');
  const ui = read('public/dashboard/plan-request.js');
  const words = read('docs/words.md');
  for (const word of ['申し込む', '確認中', '解約する（次の更新をしない）']) {
    assert.ok(words.includes(word), `${word} が docs/words.md にある`);
  }
  assert.match(ui, /解約する（次の更新をしない）/);
  assert.match(ui, /確認中/);
  assert.doesNotMatch(ui, /アップグレード|申請|承認|キャンセル|退会/);
  assert.match(read('public/dashboard/editor.js'), /requestConfirm\(/, '鍵つきカードから申し込める');
});
