import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hub } from '../src/hub.js';
import { makeEvent } from '../src/demo.js';
import { Tenants } from '../src/tenants.js';
import {
  BillingStore,
  GRACE_MS,
  TRIAL_NOTICE_MS,
  allowsFeature,
  allowsNewConnection,
  blocksOverlay,
  computeStatus,
  enforcementOn,
  monthDiscount,
  monthlyPriceYen,
  normalizeDate,
  overlayMessageAllowed,
  paidUntilEnd,
  referralCreditYen,
  trialNotice,
  widgetPageBlocked,
} from '../src/billing.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-billing-'));
const future = '2099-01-01';
const past = '2000-01-01';

test('支払った日の終わり（日本時間）までが支払い済み。過ぎたら7日は支払い待ち、その後は停止', () => {
  const end = paidUntilEnd('2026-10-14');
  assert.equal(new Date(end).toISOString(), '2026-10-14T14:59:59.999Z');
  const entry = { plan: 'yen2000', paidUntil: '2026-10-14' };
  assert.equal(computeStatus(entry, end), 'active');
  assert.equal(computeStatus(entry, end + 1), 'past_due');
  assert.equal(computeStatus(entry, end + GRACE_MS - 1), 'past_due');
  assert.equal(computeStatus(entry, end + GRACE_MS), 'suspended');
  assert.equal(blocksOverlay(entry, { now: end + 1 }), false);
  assert.equal(blocksOverlay(entry, { now: end + GRACE_MS }), true);
  assert.equal(allowsNewConnection(entry, { live: false, now: end + GRACE_MS - 1 }), true);
  assert.equal(allowsNewConnection(entry, { live: false, now: end + GRACE_MS }), false);
  assert.equal(allowsNewConnection(entry, { live: true, now: end + GRACE_MS }), true);
  const manual = { status: 'past_due', pastDueAt: 1_000_000 };
  assert.equal(computeStatus(manual, 1_000_000 + GRACE_MS - 1), 'past_due');
  assert.equal(computeStatus(manual, 1_000_000 + GRACE_MS), 'suspended');
  assert.equal(computeStatus({ status: 'past_due' }), 'past_due');
  assert.equal(computeStatus({ status: 'active', paidUntil: '2026-10-14' }, end + 1), 'past_due');
  assert.equal(computeStatus({ status: 'active', paidUntil: '2026-10-14' }, end + GRACE_MS), 'suspended');
  assert.equal(computeStatus({ status: 'suspended', paidUntil: future }), 'suspended');
  assert.equal(computeStatus({ status: 'trial', trialEndsAt: past, paidUntil: past }), 'trial');
  assert.equal(computeStatus({ free: true, plan: 'yen2000', paidUntil: past }), 'trial');
  assert.equal(computeStatus({ free: true, status: 'suspended', paidUntil: future }), 'suspended');
  assert.equal(computeStatus(null), 'trial');
  assert.equal(computeStatus(undefined), 'trial');
  assert.equal(computeStatus({}), 'trial');
  assert.equal(computeStatus({ plan: 'yen2000' }), 'trial');
  assert.equal(blocksOverlay(null), false);
  assert.equal(allowsNewConnection(null, { live: false }), true);
  assert.equal(computeStatus({ plan: 'percent5', paidUntil: future }, Date.parse('2026-10-14T00:00:00Z')), 'active');
  assert.equal(normalizeDate('2026-11-30'), '2026-11-30');
  assert.equal(normalizeDate('2024-02-29'), '2024-02-29');
  assert.equal(normalizeDate('2026-02-29'), null);
  assert.equal(normalizeDate('2026-02-31'), null);
  assert.equal(normalizeDate('11/30/2026'), null);
});

test('支払いの確認は、保存したオン/オフが環境変数より優先。無ければ本番はオフ', () => {
  assert.equal(enforcementOn({ setting: true, env: { TW_BILLING: 'off', TW_ENV: 'production' } }), true);
  assert.equal(enforcementOn({ setting: false, env: { TW_BILLING: 'on', TW_ENV: 'dev' } }), false);
  assert.equal(enforcementOn({ setting: 'on', env: {} }), true);
  assert.equal(enforcementOn({ setting: 'off', env: { TW_ENV: 'dev' } }), false);
  assert.equal(enforcementOn({ setting: null, env: { TW_BILLING: 'on' } }), true);
  assert.equal(enforcementOn({ setting: null, env: { TW_BILLING: '1' } }), true);
  assert.equal(enforcementOn({ setting: null, env: { TW_BILLING: 'true' } }), true);
  assert.equal(enforcementOn({ setting: null, env: { TW_BILLING: 'off', TW_ENV: 'dev' } }), false);
  assert.equal(enforcementOn({ setting: null, env: { TW_BILLING: '0' } }), false);
  assert.equal(enforcementOn({ setting: null, env: { TW_BILLING: 'false' } }), false);
  assert.equal(enforcementOn({ setting: null, env: { TW_ENV: 'dev' } }), true);
  assert.equal(enforcementOn({ setting: null, env: {} }), false);
  assert.equal(enforcementOn({ setting: null, env: { TW_ENV: 'production' } }), false);
});

test('月額は手入力が優先。5%プランは金額が無いと 0。紹介の割引は月額×倍率', () => {
  assert.equal(monthlyPriceYen({ plan: 'yen2000' }), 2000);
  assert.equal(monthlyPriceYen({ plan: 'yen5000', monthlyPrice: 1800 }), 1800);
  assert.equal(monthlyPriceYen({ plan: 'percent5' }), 0);
  assert.equal(monthlyPriceYen({ plan: 'percent5', monthlyPrice: 4000 }), 4000);
  assert.equal(monthlyPriceYen({ plan: 'yen2000', monthlyPrice: 0 }), 0);
  assert.equal(referralCreditYen(2000, 1.5), 3000);
  assert.equal(referralCreditYen(5000, 1.5), 7500);
  assert.equal(referralCreditYen(2000, 2), 4000);
  assert.equal(referralCreditYen(1000, 2), 2000);
  assert.equal(referralCreditYen(0, 1.5), 0);
  const entry = { plan: 'yen2000', credit: 2500 };
  assert.deepEqual(monthDiscount(entry), { price: 2000, discount: 2000, due: 0, creditAfter: 500 });
  assert.equal(entry.credit, 2500);
  assert.deepEqual(monthDiscount({ plan: 'yen5000', credit: 1000 }), { price: 5000, discount: 1000, due: 4000, creditAfter: 0 });
  assert.deepEqual(monthDiscount({ plan: 'percent5', credit: 500 }), { price: 0, discount: 0, due: 0, creditAfter: 500 });
});

test('停止の配信画面だけ止め、5000円プランだけの機能は別名でも同じ。ルーレット全体にはしない', () => {
  const premium = ['boss', 'gacha', 'media', 'rouletteLinks'];
  const paid = { plan: 'yen2000', paidUntil: future };
  const suspended = { plan: 'yen2000', paidUntil: past };
  const opts = { enforcement: true, premiumFeatures: premium };
  assert.equal(blocksOverlay(suspended), true);
  assert.equal(blocksOverlay({ free: true, plan: 'yen2000', paidUntil: past }), false);
  assert.equal(blocksOverlay(null), false);
  assert.equal(blocksOverlay({ status: 'past_due', pastDueAt: Date.now() }), false);
  assert.equal(allowsNewConnection(suspended, { live: false }), false);
  assert.equal(allowsNewConnection(suspended, { live: true }), true);
  assert.equal(allowsNewConnection({ status: 'past_due', pastDueAt: Date.now() }, { live: false }), true);
  assert.equal(allowsFeature(suspended, 'alerts', { enforcement: false, premiumFeatures: premium }), false);
  assert.equal(allowsFeature(paid, 'alerts', opts), true);
  assert.equal(allowsFeature(paid, 'bosses', opts), false);
  assert.equal(allowsFeature(paid, 'boss', opts), false);
  assert.equal(allowsFeature(paid, 'gacha', opts), false);
  assert.equal(allowsFeature(paid, 'mediaAlerts', opts), false);
  assert.equal(allowsFeature(paid, 'media', opts), false);
  assert.equal(allowsFeature(paid, 'rouletteLinks', opts), false);
  assert.equal(allowsFeature(paid, 'roulettes', opts), true);
  assert.equal(allowsFeature({ ...paid, plan: 'percent5' }, 'bosses', opts), false);
  assert.equal(allowsFeature({ ...paid, plan: 'yen5000' }, 'bosses', opts), true);
  assert.equal(allowsFeature({ plan: 'yen5000', free: true }, 'gacha', opts), true);
  assert.equal(allowsFeature({ free: true }, 'bosses', opts), true);
  assert.equal(allowsFeature(null, 'bosses', opts), true);
  assert.equal(allowsFeature({ plan: 'yen2000', paidUntil: past }, 'alerts', opts), false);
  assert.equal(allowsFeature(paid, 'bosses', { enforcement: false, premiumFeatures: premium }), true);
  assert.equal(allowsFeature(paid, 'bosses', { enforcement: true, premiumFeatures: [] }), true);
  assert.equal(widgetPageBlocked({ entry: { plan: 'yen2000', paidUntil: past }, feature: null, ...opts }), true);
  assert.equal(widgetPageBlocked({ entry: paid, feature: null, ...opts }), false);
  assert.equal(widgetPageBlocked({ entry: paid, feature: 'bosses', ...opts }), true);
  assert.equal(widgetPageBlocked({ entry: paid, feature: 'alerts', ...opts }), false);
  assert.equal(widgetPageBlocked({ entry: suspended, feature: 'alerts', enforcement: false, premiumFeatures: premium }), true);
  assert.equal(overlayMessageAllowed({ role: 'obs', blocked: true, type: 'event' }), false);
  assert.equal(overlayMessageAllowed({ role: 'obs', blocked: true, type: 'hello' }), true);
  assert.equal(overlayMessageAllowed({ role: 'obs', blocked: true, type: 'entitlements' }), true);
  assert.equal(overlayMessageAllowed({ role: 'obs', blocked: false, type: 'event' }), true);
  assert.equal(overlayMessageAllowed({ role: 'owner', blocked: true, type: 'event' }), true);
});

test('紹介コードは双方の月額×倍率を残高に足し、1か月分だけ手で引く。現金にはしない', () => {
  const dir = tmp();
  const store = new BillingStore({ dir, env: {} });
  assert.equal(fs.existsSync(store.file), false);
  assert.equal(store.enforcement(), false);
  store.setAccount('a', { plan: 'yen2000', paidUntil: future });
  store.setAccount('b', { plan: 'yen5000', paidUntil: future });
  const code = store.ensureCode('a');
  assert.equal(store.ensureCode('a'), code);
  const granted = store.applyCode('b', code.toUpperCase());
  assert.equal(granted.referrerCredit, 3000);
  assert.equal(granted.refereeCredit, 7500);
  assert.equal(store.adminView('a').credit, 3000);
  assert.equal(store.adminView('b').credit, 7500);
  assert.equal(store.adminView('b').discount.discount, 5000);
  assert.throws(() => store.applyCode('b', code), /すでに使っています/);
  assert.throws(() => store.applyCode('a', code), /自分の紹介コードは使えません/);
  assert.throws(() => store.applyCode('b', 'ない'), /見つかりません/);
  assert.throws(() => store.applyCode('b', '  '), /入れてください/);

  store.setGlobal({ multiplier: 2 });
  store.setAccount('c', { plan: 'yen2000', monthlyPrice: 1000, paidUntil: future });
  store.applyCode('c', code);
  assert.equal(store.adminView('a').price, 2000);
  assert.equal(store.adminView('a').credit, 7000);
  assert.equal(store.adminView('c').credit, 2000);
  const used = store.useMonth('a');
  assert.equal(used.discount, 2000);
  assert.equal(used.due, 0);
  assert.equal(used.credit, 5000);
  assert.equal(store.adminView('a').paidUntil, future);
  store.setAccount('a', { paidUntil: '2099-06-01' });
  assert.equal(store.adminView('a').credit, 5000);

  store.setAccount('d', { plan: 'percent5' });
  const percentCode = store.ensureCode('d');
  store.setAccount('e', { plan: 'percent5' });
  const zero = store.applyCode('e', percentCode);
  assert.equal(zero.referrerCredit, 0);
  assert.equal(zero.refereeCredit, 0);
  assert.throws(() => store.useMonth('e'), /引ける割引がありません/);
  assert.throws(() => store.setGlobal({ multiplier: 3 }), /1\.5 か 2/);
  assert.throws(() => store.setAccount('a', { plan: 'premium' }), /プランは/);
  assert.throws(() => store.setAccount('a', { paidUntil: '2026-02-31' }), /日付/);
  assert.throws(() => store.setAccount('a', { monthlyPrice: -1 }), /月額/);

  const again = new BillingStore({ dir, env: { TW_BILLING: 'on', TW_ENV: 'dev' } });
  assert.equal(again.adminView('a').credit, 5000);
  assert.equal(again.globalView().multiplier, 2);
  assert.equal(again.enforcement(), true);
  again.setGlobal({ enforcement: 'off' });
  assert.equal(again.enforcement(), false);
  again.setGlobal({ enforcement: null });
  assert.equal(again.enforcement(), true);
});

test('壊れた支払いファイルは読み込みでは直さず、記録が無い人は止めない', () => {
  const dir = tmp();
  const file = path.join(dir, 'billing.json');
  fs.writeFileSync(file, '{');
  const store = new BillingStore({ dir, env: { TW_BILLING: 'on' } });
  assert.equal(fs.readFileSync(file, 'utf8'), '{');
  assert.equal(store.account('anyone'), null);
  assert.equal(store.isOverlayBlocked('anyone'), false);
  assert.equal(store.widgetBlocked('anyone', 'bosses'), false);
  assert.equal(store.clientView('anyone').status, 'trial');
  assert.equal(store.clientView('anyone').overlay, true);
  assert.equal(store.clientView('anyone').show, true);
  assert.equal(store.allowsConnection('anyone', { live: false }), true);
  assert.equal(store.allowsConnection('anyone', { live: true }), true);
  const quiet = new BillingStore({ dir: tmp(), env: {} });
  assert.equal(quiet.clientView('anyone').status, 'trial');
  assert.equal(quiet.clientView('anyone').show, false);
  assert.equal(quiet.isOverlayBlocked('anyone'), false);
});

test('未払いの配信画面には集計もイベントも流さず、読み込み直しだけ届く', () => {
  const hub = new Hub();
  hub.publish(makeEvent('follow'));
  const obs = { readyState: 1, sent: [], on() {}, send(text) { this.sent.push(JSON.parse(text)); } };
  obs.quiet = true;
  obs.allowMessage = (msg) => overlayMessageAllowed({ role: 'obs', blocked: true, type: msg.type });
  hub.addClient(obs);
  assert.equal(obs.sent[0].type, 'hello');
  assert.equal(obs.sent[0].config, null);
  assert.equal(obs.sent[0].status.message, '');
  assert.equal(obs.sent[0].state.follows, 0);
  hub.publish(makeEvent('gift', { giftName: 'Rose', count: 1 }));
  hub.broadcast({ type: 'status', status: { mode: 'live', message: 'エラー' } });
  assert.equal(obs.sent.length, 1);
  hub.broadcast({ type: 'entitlements', info: { billing: { overlay: true } } });
  assert.equal(obs.sent.at(-1).type, 'entitlements');

  const owner = { readyState: 1, sent: [], on() {}, send(text) { this.sent.push(JSON.parse(text)); } };
  owner.allowMessage = (msg) => overlayMessageAllowed({ role: 'owner', blocked: true, type: msg.type });
  hub.addClient(owner);
  assert.equal(owner.sent[0].state.follows, 1);
  hub.publish(makeEvent('follow'));
  assert.equal(owner.sent.at(-1).type, 'event');
});

test('配信者の設定ファイルは支払いを保存してもそのまま。未払いでもウィジェット設定は消さない', () => {
  const dir = tmp();
  const tenants = new Tenants({ dir, env: {} });
  const a = tenants.create({ name: 'りん' });
  const yamlPath = path.join(tenants.dataDir(a.id), 'config.yaml');
  fs.mkdirSync(path.dirname(yamlPath), { recursive: true });
  const yaml = 'alerts:\n  default:\n    duration: 4\n';
  fs.writeFileSync(yamlPath, yaml);
  const before = fs.readFileSync(tenants.file);
  const widgets = tenants.info(a.id).widgets.slice();
  assert.equal(tenants.info(a.id).billing.show, false);
  assert.equal(tenants.entitled(a.id, 'alerts'), true);

  tenants.updateBillingSettings({ enforcement: true, multiplier: 1.5, premiumFeatures: ['boss', 'gacha', 'media', 'rouletteLinks'] });
  tenants.updateBilling(a.id, { plan: 'yen2000' });
  assert.equal(tenants.billing.adminView(a.id).status, 'trial');
  assert.equal(tenants.billing.adminView(a.id).plan, 'flat2000');
  assert.equal(tenants.info(a.id).billing.overlay, true);
  assert.equal(tenants.info(a.id).billing.enforcement, true);
  assert.deepEqual(tenants.info(a.id).widgets, widgets);
  assert.equal(tenants.entitled(a.id, 'alerts'), true);
  assert.equal(tenants.entitled(a.id, 'cutins'), false);
  assert.equal(tenants.billing.widgetBlocked(a.id, null), false);
  assert.equal(tenants.billing.widgetBlocked(a.id, 'alerts'), false);
  assert.equal(tenants.info(a.id).billing.limited.includes('alerts'), false);
  assert.equal(tenants.billing.isFeatureAllowed(a.id, 'bosses'), false);
  assert.equal(fs.readFileSync(tenants.file).equals(before), true);
  assert.equal(fs.readFileSync(yamlPath, 'utf8'), yaml);

  tenants.updateBilling(a.id, { status: 'suspended' });
  assert.equal(tenants.billing.adminView(a.id).status, 'suspended');
  assert.equal(tenants.info(a.id).billing.overlay, false);
  assert.equal(tenants.billing.widgetBlocked(a.id, null), true);
  assert.equal(tenants.billing.widgetBlocked(a.id, 'alerts'), true);
  assert.ok(tenants.info(a.id).billing.limited.includes('alerts'));
  assert.equal(tenants.billing.allowsConnection(a.id, { live: false }), false);
  assert.equal(tenants.billing.allowsConnection(a.id, { live: true }), true);
  assert.equal(fs.readFileSync(tenants.file).equals(before), true);
  assert.equal(fs.readFileSync(yamlPath, 'utf8'), yaml);

  tenants.updateBilling(a.id, { status: 'past_due' });
  assert.equal(tenants.billing.adminView(a.id).status, 'past_due');
  assert.equal(tenants.billing.isOverlayBlocked(a.id), false);
  assert.equal(tenants.billing.allowsConnection(a.id, { live: false }), true);
  tenants.updateBilling(a.id, { status: '' });

  tenants.updateBilling(a.id, { paidUntil: future });
  assert.equal(tenants.billing.isOverlayBlocked(a.id), false);
  assert.equal(tenants.billing.widgetBlocked(a.id, null), false);
  assert.equal(tenants.billing.widgetBlocked(a.id, 'alerts'), false);
  assert.equal(tenants.billing.isFeatureAllowed(a.id, 'bosses'), false);
  assert.equal(tenants.billing.isFeatureAllowed(a.id, 'gacha'), false);
  assert.equal(tenants.billing.isFeatureAllowed(a.id, 'mediaAlerts'), false);
  assert.equal(tenants.billing.isFeatureAllowed(a.id, 'rouletteLinks'), false);
  assert.equal(tenants.billing.isFeatureAllowed(a.id, 'roulettes'), true);
  assert.equal(tenants.billing.widgetBlocked(a.id, 'bosses'), true);
  tenants.updateBilling(a.id, { plan: 'percent5' });
  assert.equal(tenants.billing.isFeatureAllowed(a.id, 'bosses'), false);
  tenants.updateBilling(a.id, { plan: 'yen5000' });
  assert.equal(tenants.billing.isFeatureAllowed(a.id, 'bosses'), true);
  assert.equal(tenants.billing.widgetBlocked(a.id, 'bosses'), false);
  tenants.updateBilling(a.id, { free: true, paidUntil: past, plan: 'yen2000' });
  assert.equal(tenants.billing.adminView(a.id).status, 'trial');
  assert.equal(tenants.billing.isOverlayBlocked(a.id), false);
  assert.equal(tenants.billing.isFeatureAllowed(a.id, 'bosses'), false);
  assert.equal(fs.readFileSync(yamlPath, 'utf8'), yaml);

  const code = tenants.issueReferralCode(a.id);
  assert.throws(() => tenants.create({ name: 'だめ', referralCode: 'ないコード' }), /見つかりません/);
  assert.equal(tenants.list().some((t) => t.name === 'だめ'), false);
  const newbie = tenants.create({ name: '新規', referralCode: code });
  assert.equal(tenants.billing.adminView(a.id).credit, 3000);
  assert.equal(tenants.billing.adminView(newbie.id).credit, 0);
  tenants.updateBilling(newbie.id, { plan: 'yen5000', paidUntil: future });
  assert.equal(tenants.billing.adminView(newbie.id).credit, 0);

  const friend = tenants.create({ name: 'ともだち' });
  tenants.updateBilling(friend.id, { plan: 'yen5000', monthlyPrice: 5000, paidUntil: future });
  const both = tenants.applyReferral(friend.id, code);
  assert.equal(both.referrerCredit, 3000);
  assert.equal(both.refereeCredit, 7500);
  tenants.updateBillingSettings({ multiplier: 2 });
  const custom = tenants.create({ name: '手入力' });
  tenants.updateBilling(custom.id, { monthlyPrice: 1000, plan: 'yen2000', paidUntil: future });
  tenants.applyReferral(custom.id, code);
  assert.equal(tenants.billing.adminView(a.id).price, 2000);
  assert.equal(tenants.billing.adminView(a.id).credit, 3000 + 3000 + 4000);
  assert.equal(tenants.billing.adminView(custom.id).credit, 2000);
  const pulled = tenants.useBillingCredit(a.id);
  assert.equal(pulled.discount, 2000);
  assert.equal(tenants.billing.adminView(a.id).credit, 8000);
  tenants.updateBilling(a.id, { paidUntil: '2099-12-31' });
  assert.equal(tenants.billing.adminView(a.id).credit, 8000);

  const again = new Tenants({ dir, env: {} });
  assert.equal(again.get(a.id).name, 'りん');
  assert.equal(again.get(a.id).key, a.key);
  assert.equal(fs.readFileSync(yamlPath, 'utf8'), yaml);
  assert.equal(again.billing.adminView(a.id).credit, 8000);
  assert.equal(again.billing.globalView().effective, true);
  assert.match(fs.readFileSync(path.join(again.backupDir, 'billing.json'), 'utf8'), /8000/);
  assert.equal(again.info(a.id).billing.overlay, true);
  assert.deepEqual(again.info(a.id).widgets, widgets);
});

test('画面の文言は、停止でも配信にエラーを出さない', () => {
  const app = fs.readFileSync(new URL('../public/dashboard/app.js', import.meta.url), 'utf8');
  const all = fs.readFileSync(new URL('../public/widgets/all.html', import.meta.url), 'utf8');
  const locked = fs.readFileSync(new URL('../public/widgets/locked.html', import.meta.url), 'utf8');
  const admin = fs.readFileSync(new URL('../public/admin/index.html', import.meta.url), 'utf8');
  const adminJs = fs.readFileSync(new URL('../public/admin/admin.js', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../server.js', import.meta.url), 'utf8');
  assert.match(app, /お支払いの確認が取れていません。LuLにご連絡ください/);
  assert.match(app, /有料化のお知らせ/);
  assert.match(app, /現金にはできません/);
  assert.match(app, /紹介コード:/);
  assert.match(all, /billing\?\.overlay === false/);
  assert.doesNotMatch(all, /お支払いの確認が取れていません/);
  assert.doesNotMatch(locked, /エラー/);
  assert.doesNotMatch(locked, /お支払い/);
  assert.match(admin, /プラン・支払い/);
  assert.match(adminJs, /変更の履歴/);
  assert.match(adminJs, /お試しの終わり/);
  assert.match(server, /widgetBlocked\(tenant\.id, feature\)/);
  assert.match(server, /overlayMessageAllowed/);
  assert.match(server, /判定に失敗したので通します/);
});

test('お試し終了の30日前から、お試しのあいだだけ有料化のお知らせを出す', () => {
  const end = paidUntilEnd('2026-11-30');
  const entry = { status: 'trial', trialEndsAt: '2026-11-30' };
  assert.equal(trialNotice(entry, end - TRIAL_NOTICE_MS - 1), false);
  assert.equal(trialNotice(entry, end - TRIAL_NOTICE_MS), true);
  assert.equal(trialNotice(entry, end + 1), true);
  assert.equal(computeStatus(entry, end + 1), 'trial');
  assert.equal(trialNotice({ status: 'active', paidUntil: future, trialEndsAt: '2026-11-30' }, end - 1), false);
  assert.equal(trialNotice({ status: 'trial' }, end), false);
  assert.equal(trialNotice(null), false);
});

test('状態・期限・プラン・メモの変更だけ履歴に残し、同じ支払い待ちでは猶予の起点を動かさない', () => {
  const dir = tmp();
  const store = new BillingStore({ dir, env: {} });
  store.setAccount('a', { plan: 'pct5', status: 'trial', trialEndsAt: '2026-12-31', paidUntil: '2026-12-01', note: 'はじめ' });
  assert.equal(store.adminView('a').history.length, 1);
  assert.equal(store.adminView('a').plan, 'pct5');
  store.setAccount('a', { monthlyPrice: 1000 });
  assert.equal(store.adminView('a').history.length, 1);
  store.setAccount('a', { status: 'past_due' });
  const view = store.adminView('a');
  assert.equal(view.status, 'past_due');
  assert.equal(view.history.length, 2);
  assert.equal(view.history[1].changes.status.before, 'trial');
  assert.equal(view.history[1].changes.status.after, 'past_due');
  const raw = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  const at = raw.accounts.a.pastDueAt;
  assert.equal(Number.isFinite(at), true);
  store.setAccount('a', { status: 'past_due' });
  const again = JSON.parse(fs.readFileSync(store.file, 'utf8'));
  assert.equal(again.accounts.a.pastDueAt, at);
  assert.equal(store.adminView('a').history.length, 2);
  store.setAccount('a', { plan: 'yen2000', note: '更新', trialEndsAt: '2027-01-15' });
  const last = store.adminView('a').history.at(-1);
  assert.equal(last.changes.plan.before, 'pct5');
  assert.equal(last.changes.plan.after, 'flat2000');
  assert.equal(last.changes.note.after, '更新');
  assert.equal(last.changes.trialEndsAt.after, '2027-01-15');
  assert.equal(store.adminView('a').plan, 'flat2000');
});

test('古いプラン名は読み込みでは書き換えない', () => {
  const dir = tmp();
  const file = path.join(dir, 'billing.json');
  fs.writeFileSync(file, JSON.stringify({ accounts: { a: { plan: 'yen5000', paidUntil: future, status: 'active' } } }));
  const before = fs.readFileSync(file, 'utf8');
  const store = new BillingStore({ dir, env: {} });
  assert.equal(fs.readFileSync(file, 'utf8'), before);
  assert.equal(store.adminView('a').plan, 'flat5000');
  assert.equal(store.adminView('a').status, 'active');
  store.setGlobal({ enforcement: true, premiumFeatures: ['boss'] });
  assert.equal(store.isFeatureAllowed('a', 'bosses'), true);
  assert.match(fs.readFileSync(file, 'utf8'), /yen5000/);
});

test('判定が例外でも止めずに通し、ログに残す', () => {
  const boom = new Proxy({ status: 'suspended' }, { get() { throw new Error('壊れた記録'); } });
  const warnings = [];
  const orig = console.warn;
  console.warn = (...args) => warnings.push(args.map(String).join(' '));
  try {
    assert.equal(blocksOverlay(boom), false);
    assert.equal(allowsNewConnection(boom, { live: false }), true);
    assert.equal(allowsNewConnection(boom, { live: true }), true);
    assert.equal(widgetPageBlocked({ entry: boom, feature: 'alerts', enforcement: true, premiumFeatures: ['alerts'] }), false);
    assert.equal(allowsFeature(boom, 'alerts', { enforcement: true, premiumFeatures: ['alerts'] }), true);
    assert.equal(trialNotice(boom), false);
    const store = new BillingStore({ dir: tmp(), env: { TW_BILLING: 'on' } });
    store.account = () => { throw new Error('読めない'); };
    assert.equal(store.isOverlayBlocked('a'), false);
    assert.equal(store.allowsConnection('a', { live: false }), true);
    assert.equal(store.widgetBlocked('a', 'alerts'), false);
    assert.equal(store.isFeatureAllowed('a', 'alerts'), true);
    const view = store.clientView('a');
    assert.equal(view.status, 'trial');
    assert.equal(view.overlay, true);
    assert.equal(view.suspended, false);
  } finally {
    console.warn = orig;
  }
  assert.match(warnings.join('\n'), /通します/);
});

test('停止にしても配信中の接続は切らない。止まっているときだけ新しい接続を始めない', async () => {
  const dir = tmp();
  const tenants = new Tenants({ dir, env: {} });
  const a = tenants.create({ name: '配信中' });
  const rt = tenants.runtime(a.id);
  let connects = 0;
  rt.tiktok.connect = async () => { connects += 1; };
  try {
    rt.hub.setStatus({ mode: 'live', username: 'liveuser', message: '' });
    tenants.updateBilling(a.id, { status: 'suspended' });
    assert.equal(rt.hub.status.mode, 'live');
    assert.equal(tenants.billing.isOverlayBlocked(a.id), true);
    assert.equal(tenants.billing.allowsConnection(a.id, { live: true }), true);
    assert.equal(tenants.billing.allowsConnection(a.id, { live: false }), false);
    const now = Date.now();
    const slot = { id: 'slot-1', start: now - 1000, end: now + 60_000 };
    assert.equal(rt.autoConnect({ handle: 'liveuser', slot, now }), false);
    assert.equal(connects, 0);
    rt.hub.setStatus({ mode: 'idle', username: null, message: '' });
    assert.equal(rt.hub.status.mode, 'idle');
    assert.equal(rt.autoConnect({ handle: 'liveuser', slot, now }), false);
    assert.equal(connects, 0);
    tenants.updateBilling(a.id, { status: 'active', paidUntil: future });
    assert.equal(rt.autoConnect({ handle: 'liveuser', slot, now }), true);
    assert.equal(connects, 1);
    assert.equal(rt.hub.status.mode, 'idle');
  } finally {
    await tenants.close(a.id);
    clearInterval(tenants.timer);
    clearInterval(tenants.rentalTimer);
  }
});
