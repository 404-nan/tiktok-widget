// /api/me が、使えるもの（features）を今までどおり返しつつ、使えないもの（locked）・編集の操作（capabilities）・
// いまのプラン（plan）を返すかを HTTP で確かめる。plan に管理者のメモや紹介コードが入らないことも確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { Tenants } from '../src/tenants.js';
import { planSummary } from '../src/billing.js';
import { validatePlans } from '../src/plans.js';
import { setActiveErrorLog } from '../src/error-log.js';
import { createExistingTenant } from './helpers/existing-tenant.js';

const PLAN_KEYS = ['id', 'label', 'description', 'priceYen', 'draft', 'legacy', 'status', 'statusLabel', 'paidUntil', 'trialEndsAt', 'graceUntil', 'daysLeft', 'trialNotice', 'trialMessage', 'enforcementOn', 'contactUrl', 'contactNote'];

// trial: true なら新しく作った配信者（お試しつき）、偽なら前からいる配信者（支払いの記録なし）
async function meOf({ billing, account = null, access = null, trial = false }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-me-plan-'));
  const tenants = new Tenants({ dir, env: { TW_BILLING: billing } });
  const tenant = trial ? tenants.create({ name: 'ためし' }) : createExistingTenant(tenants, { name: 'ためし' });
  if (account) tenants.updateBilling(tenant.id, account);
  if (access) tenants.setAccess(tenant.id, access.feature, access.on);
  const app = express();
  app.use((req, _res, next) => {
    req.role = 'owner'; // 本番では /t/<鍵>/ の中継が入れる
    next();
  });
  app.use(tenants.runtime(tenant.id).router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    const res = await fetch(`http://127.0.0.1:${server.address().port}/api/me`);
    assert.equal(res.status, 200);
    return await res.json();
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await tenants.close(tenant.id);
  }
}

const lockOf = (me, key) => me.locked.find((item) => item.key === key);

test('/api/me は使えない豪華演出を locked に「どのプランで使えるか」つきで返し、features は今までどおり使えるものだけ', async () => {
  setActiveErrorLog(null);
  const me = await meOf({ billing: 'on' });
  assert.equal(me.features.alerts.label, 'ギフト通知');
  assert.equal(me.features.cutins, undefined, '使えないものは features に入れない（今までどおり）');
  const cutins = lockOf(me, 'cutins');
  assert.deepEqual([cutins.kind, cutins.requiredPlan, cutins.requiredPlanLabel, cutins.reason], ['feature', 'plus', 'Plus', 'plan']);
  assert.equal(typeof cutins.label, 'string');
  assert.ok(cutins.pages.includes('cutin.html'), 'locked.html が自分のページ名で引けるように pages を返す');
  assert.equal(lockOf(me, 'ai').requiredPlan, 'pro');
  assert.equal(lockOf(me, 'alerts'), undefined);
  // プランの記録が無い人は、編集の操作を限らない（今までどおり）
  assert.ok(Object.values(me.capabilities).every(Boolean));
  assert.deepEqual(Object.keys(me.capabilities).sort(), ['edit.advanced', 'edit.ai', 'edit.cutinImage', 'edit.layout', 'edit.media']);
  assert.equal(me.plan.id, 'free');
  assert.equal(me.plan.enforcementOn, true);
});

test('/api/me の plan はプランの名前・仮の値段・期限・残り日数を返し、メモや紹介コードは返さない', async () => {
  const me = await meOf({ billing: 'on', account: { plan: 'plus', status: 'active', paidUntil: '2099-01-01', note: '管理者だけのメモ' } });
  assert.deepEqual(Object.keys(me.plan).sort(), [...PLAN_KEYS].sort());
  assert.equal(me.plan.id, 'plus');
  assert.equal(me.plan.label, 'Plus');
  assert.equal(me.plan.priceYen, 2980);
  assert.equal(me.plan.draft, true);
  assert.equal(me.plan.status, 'active');
  assert.equal(me.plan.paidUntil, '2099-01-01');
  assert.ok(Number.isInteger(me.plan.daysLeft) && me.plan.daysLeft > 0);
  assert.equal(typeof me.plan.contactNote, 'string');
  assert.doesNotMatch(JSON.stringify(me), /管理者だけのメモ/, '管理者のメモは配信者の画面に返さない');
  // Plus は豪華演出が使えて、編集の操作は Pro だけ
  assert.ok(me.features.cutins);
  assert.equal(lockOf(me, 'cutins'), undefined);
  for (const key of ['edit.media', 'edit.cutinImage', 'edit.layout', 'edit.advanced', 'edit.ai']) {
    assert.equal(me.capabilities[key], false, key);
    assert.deepEqual({ kind: lockOf(me, key).kind, requiredPlan: lockOf(me, key).requiredPlan, reason: lockOf(me, key).reason }, { kind: 'capability', requiredPlan: 'pro', reason: 'plan' });
  }
});

test('/api/me は Pro なら locked が空で、停止中は理由を stopped、管理者が止めたものは switch にする', async () => {
  const pro = await meOf({ billing: 'off', account: { plan: 'pro', status: 'active', paidUntil: '2099-01-01' } });
  assert.deepEqual(pro.locked, []);
  assert.ok(Object.values(pro.capabilities).every(Boolean));
  assert.equal(pro.plan.enforcementOn, false);

  const stopped = await meOf({ billing: 'on', account: { plan: 'pro', status: 'suspended' } });
  assert.equal(stopped.plan.status, 'suspended');
  assert.ok(stopped.locked.length > 0);
  assert.ok(stopped.locked.every((item) => item.reason === 'stopped' && item.requiredPlan === null));

  const off = await meOf({ billing: 'off', access: { feature: 'alerts', on: false } });
  assert.deepEqual({ reason: lockOf(off, 'alerts').reason, requiredPlan: lockOf(off, 'alerts').requiredPlan }, { reason: 'switch', requiredPlan: null });

  // 確認スイッチオフでは Plus にしても自動では開かず、Pro だけが自動で開く。手動オフはプラン変更でも開かないため switch
  const freeOff = await meOf({ billing: 'off' });
  assert.deepEqual({ reason: lockOf(freeOff, 'cutins').reason, requiredPlan: lockOf(freeOff, 'cutins').requiredPlan }, { reason: 'plan', requiredPlan: 'pro' });
  const manualCutinOff = await meOf({ billing: 'on', access: { feature: 'cutins', on: false } });
  assert.deepEqual({ reason: lockOf(manualCutinOff, 'cutins').reason, requiredPlan: lockOf(manualCutinOff, 'cutins').requiredPlan }, { reason: 'switch', requiredPlan: null });
});

test('planSummary はお試し・支払い待ちの残り日数を数え、記録が無い人を無料として見せる', () => {
  const now = Date.parse('2026-11-27T12:00:00+09:00');
  const trial = planSummary({ status: 'trial', trialEndsAt: '2026-12-01' }, { now, enforcement: true });
  assert.equal(trial.daysLeft, 4);
  assert.equal(trial.id, 'pro', 'お試しのあいだは Pro として見せる');
  assert.equal(trial.trialMessage, '', 'お知らせの前は案内を出さない');
  assert.equal(planSummary({ status: 'trial', trialEndsAt: '2026-11-27' }, { now }).daysLeft, 0, '今日が期限なら 0');
  const ended = planSummary({ status: 'trial', trialEndsAt: '2026-11-20', plan: 'flat5000' }, { now });
  assert.deepEqual([ended.status, ended.id, ended.daysLeft, ended.legacy], ['free', 'free', null, null], '過ぎた期限は数えず、無料として見せる');
  assert.match(ended.trialMessage, /基本機能はそのまま無料で使えます/);
  const legacyTrial = planSummary({ status: 'trial', plan: 'flat2000' }, { now });
  assert.deepEqual([legacyTrial.id, legacyTrial.legacy?.label], ['plus', '2000円プラン'], '期限の無いお試し（今いる配信者）は記録のプランのまま');
  const late = planSummary({ plan: 'pro', status: 'active', paidUntil: '2026-11-25' }, { now });
  assert.equal(late.status, 'past_due');
  assert.equal(late.daysLeft, 5, '猶予7日の終わりまで');
  const none = planSummary(null, { now });
  assert.deepEqual([none.id, none.priceYen, none.daysLeft], ['free', 0, null]);
  const legacy = planSummary({ plan: 'flat5000', status: 'active', paidUntil: '2099-01-01' }, { now });
  assert.deepEqual([legacy.id, legacy.legacy], ['pro', { label: '5000円プラン', priceYen: 5000 }]);
  // 個別の月額が設定されていればカタログ価格や旧プラン既定値より優先する
  const customPlus = planSummary({ plan: 'plus', monthlyPrice: 1800, status: 'active', paidUntil: '2099-01-01' }, { now });
  assert.deepEqual([customPlus.priceYen, customPlus.draft], [1800, false]);
  const customLegacy = planSummary({ plan: 'flat5000', monthlyPrice: 3000, status: 'active', paidUntil: '2099-01-01' }, { now });
  assert.deepEqual([customLegacy.priceYen, customLegacy.legacy], [3000, { label: '5000円プラン', priceYen: 3000 }]);
});

test('案内のリンクは http(s) だけ。環境変数で差し替えられ、おかしな値は使わない', () => {
  const data = JSON.parse(fs.readFileSync(new URL('../src/plans.json', import.meta.url), 'utf8'));
  setActiveErrorLog(null);
  assert.equal(validatePlans(data, { env: {} }).contactUrl, '');
  assert.equal(validatePlans(data, { env: { TW_PLAN_CONTACT_URL: 'https://example.com/plan' } }).contactUrl, 'https://example.com/plan');
  assert.equal(validatePlans(data, { env: { TW_PLAN_CONTACT_URL: 'javascript:alert(1)' } }).contactUrl, '');
  assert.throws(() => validatePlans({ ...data, contactUrl: 'javascript:alert(1)' }, { env: {} }), /contactUrl/);
});

test('/api/me: 新しく作った配信者はお試し（Pro）で始まり、スイッチがオフでも豪華演出と編集が全部使える', async () => {
  const me = await meOf({ billing: 'off', trial: true });
  assert.deepEqual([me.plan.id, me.plan.status, me.plan.statusLabel], ['pro', 'trial', 'お試し']);
  assert.equal(me.plan.daysLeft, 14);
  assert.match(me.plan.trialEndsAt, /^\d{4}-\d{2}-\d{2}$/);
  assert.equal(me.plan.trialNotice, false);
  assert.ok(me.features.cutins, 'お試しのあいだはカットインが最初から使える');
  assert.ok(me.features.rush);
  assert.deepEqual(me.locked, []);
  assert.ok(Object.values(me.capabilities).every(Boolean));
});
