import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Tenants } from '../src/tenants.js';
import { featureOfPage } from '../src/runtime.js';

const setup = () => new Tenants({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'tw-tenants-')) });

test('配信者を追加すると、ダッシュボード用と OBS 用の鍵ができ、鍵から役割がわかる', () => {
  const t = setup();
  const a = t.create({ name: 'りん' });
  assert.notEqual(a.key, a.obsKey);
  assert.equal(t.byKey(a.key).role, 'owner');
  assert.equal(t.byKey(a.obsKey).role, 'obs');
  assert.equal(t.byKey('nope'), null);
  // 鍵を作り直すと古い URL は使えない
  const old = a.key;
  t.rekey(a.id);
  assert.equal(t.byKey(old), null);
  // ファイルに残る
  const again = new Tenants({ dir: t.dir });
  assert.equal(again.get(a.id).name, 'りん');
});

test('遊び方を保存でき、案内を閉じた状態も配信者ごとに残る', () => {
  const t = setup();
  const a = t.create({ name: 'はじめて' });
  assert.equal(t.info(a.id).template, null);
  t.setTemplate(a.id, 'talk');
  assert.equal(t.info(a.id).template, 'talk');
  t.setGuideDone(a.id, true);
  assert.equal(t.info(a.id).guideDone, true);
  const again = new Tenants({ dir: t.dir });
  assert.equal(again.info(a.id).template, 'talk');
  assert.equal(again.info(a.id).guideDone, true);
});

test('遊び方を入れ直しても、閉じた案内をもう一度出さない', () => {
  const t = setup();
  const a = t.create({ name: '案内済み' });
  t.setTemplate(a.id, 'bougai');
  t.setGuideDone(a.id, true);
  t.setTemplate(a.id, 'endurance');
  assert.equal(t.info(a.id).template, 'endurance');
  assert.equal(t.info(a.id).guideDone, true);
});

test('今まで設定を使っている配信者は custom とみなし、管理者が止めたものは選べない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-tenants-'));
  fs.mkdirSync(path.join(dir, 'tenants', 'old'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'tenants.json'), JSON.stringify({ tenants: [{ id: 'old', name: '前から', key: 'k'.repeat(24), obsKey: 'o'.repeat(24), enabled: true, widgets: ['alerts', 'chats', 'wins'], access: {} }] }));
  fs.writeFileSync(path.join(dir, 'tenants', 'old', 'config.yaml'), 'alerts:\n  default: {}\n');
  const t = new Tenants({ dir });
  assert.equal(t.info('old').template, 'custom');
  t.setAccess('old', 'roulettes', false);
  assert.equal(t.entitled('old', 'roulettes'), false);
});

test('豪華な演出は最初は使えず、ほかのウィジェットは最初から使える', () => {
  const t = setup();
  const a = t.create({ name: 'A' });
  assert.equal(t.entitled(a.id, 'cutins'), false);
  assert.equal(t.entitled(a.id, 'winsFx'), false);
  assert.equal(t.entitled(a.id, 'wins'), true);
  assert.equal(t.entitled(a.id, 'chats'), true);
  assert.equal(t.access(a.id, 'wins').source, 'default');
  assert.equal('cutins' in t.info(a.id).access, false);
  assert.equal(t.info(a.id).widgets.includes('cutins'), false);
});

test('どのウィジェットも ON / OFF でき、時間つきなら期限が過ぎると初めの状態に戻る', () => {
  const t = setup();
  const a = t.create({ name: 'A' });
  t.setAccess(a.id, 'cutins', true, 3);
  assert.equal(t.entitled(a.id, 'cutins'), true);
  assert.equal(t.access(a.id, 'cutins').source, 'own');
  t.get(a.id).access.cutins.until = Date.now() - 1;
  assert.equal(t.entitled(a.id, 'cutins'), false); // 期限切れ → 使えない（初めの状態）
  // ふつうのウィジェットも止められる。時間が過ぎたら使えるに戻る
  t.setAccess(a.id, 'chats', false, 1);
  assert.equal(t.entitled(a.id, 'chats'), false);
  t.get(a.id).access.chats.until = Date.now() - 1;
  assert.equal(t.entitled(a.id, 'chats'), true);
  // null で決めたのを消す
  t.setAccess(a.id, 'wins', false);
  assert.equal(t.entitled(a.id, 'wins'), false);
  t.setAccess(a.id, 'wins', null);
  assert.equal(t.entitled(a.id, 'wins'), true);
});

test('配信者ごとの設定 → 全員の設定 → 初めの状態 の順に見る', () => {
  const t = setup();
  const a = t.create({ name: 'A' });
  const b = t.create({ name: 'B' });
  t.setAccess('global', 'premium', true);
  assert.equal(t.entitled(a.id, 'rush'), true);
  assert.equal(t.access(b.id, 'rush').source, 'everyone');
  t.setAccess(b.id, 'rush', false); // 全員オンでも、この人だけオフ
  assert.equal(t.entitled(b.id, 'rush'), false);
  assert.equal(t.entitled(a.id, 'rush'), true);
  t.setAccess('everyone', 'all', null); // 全員の個別の設定を消す
  assert.equal(t.entitled(b.id, 'rush'), true);
  t.setAccess('global', 'all', null);
  assert.equal(t.entitled(b.id, 'rush'), false);
  assert.throws(() => t.setAccess(a.id, 'nope', true));
  assert.throws(() => t.setAccess(a.id, 'rush', 'yes'));
});

test('前の形（premium の until）で保存された設定も読める', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-tenants-'));
  fs.writeFileSync(path.join(dir, 'tenants.json'), JSON.stringify({ tenants: [{ id: 'x', name: 'X', key: 'k'.repeat(24), obsKey: 'o'.repeat(24), enabled: true, widgets: [], premium: { rush: { until: null } } }], global: { premium: { cutins: { until: null } } } }));
  const t = new Tenants({ dir });
  assert.equal(t.entitled('x', 'rush'), true);
  assert.equal(t.entitled('x', 'cutins'), true);
  assert.equal(t.entitled('x', 'imageCutins'), false);
});

test('使うウィジェットを選べる（知らない名前は捨てる）', () => {
  const t = setup();
  const a = t.create({ name: 'A' });
  t.update(a.id, { widgets: ['wins', 'alerts', 'nope'] });
  assert.deepEqual(t.get(a.id).widgets, ['wins', 'alerts']);
});

test('ページから、どのウィジェットかがわかる', () => {
  assert.equal(featureOfPage('cutin.html'), 'cutins');
  assert.equal(featureOfPage('wins-fx.html'), 'winsFx');
  assert.equal(featureOfPage('wins.html'), 'wins');
  assert.equal(featureOfPage('roulette-strip.html'), 'roulettes');
  assert.equal(featureOfPage('locked.html'), null);
});

// --- プランの既定（src/plans.json）---

const setupWith = (env) => new Tenants({ dir: fs.mkdtempSync(path.join(os.tmpdir(), 'tw-tenants-plan-')), env });

test('Pro プランなら手動スイッチ無しで豪華演出と編集の操作が開き、手動の OFF がプランより強い', () => {
  // 確認スイッチはオフ（本番の初期値）。Pro を入れたのに管理者が手で開けるまで使えなかった不具合の再発防止
  const t = setupWith({ TW_BILLING: 'off' });
  const a = t.create({ name: 'A' });
  t.updateBilling(a.id, { plan: 'pro', status: 'active', paidUntil: '2099-01-01' });
  for (const feature of ['cutins', 'imageCutins', 'rush', 'stepup', 'swarm', 'winsFx', 'combo', 'ai']) {
    assert.equal(t.entitled(a.id, feature), true, feature);
    assert.equal(t.access(a.id, feature).source, 'plan', feature);
  }
  for (const capability of ['edit.media', 'edit.cutinImage', 'edit.layout', 'edit.advanced', 'edit.ai']) assert.equal(t.editAllowed(a.id, capability), true, capability);
  assert.equal(t.onMap(a.id).features.cutins, true);

  // 配信者ごとの OFF も、全員の OFF も、プランより強い
  t.setAccess(a.id, 'cutins', false);
  assert.equal(t.entitled(a.id, 'cutins'), false);
  assert.equal(t.access(a.id, 'cutins').source, 'own');
  t.setAccess('global', 'rush', false);
  assert.equal(t.entitled(a.id, 'rush'), false);
  assert.equal(t.access(a.id, 'rush').source, 'everyone');
  // 「AI にたのむ」を手で止めると、edit.ai もできない
  t.setAccess(a.id, 'ai', false);
  assert.equal(t.editAllowed(a.id, 'edit.ai'), false);
  // 手動を消すとプランの既定に戻る
  t.setAccess(a.id, 'cutins', null);
  assert.equal(t.access(a.id, 'cutins').source, 'plan');
  assert.equal(t.entitled(a.id, 'cutins'), true);
});

test('昔の5000円プラン（flat5000 / yen5000）も Pro として、手動スイッチ無しで豪華演出が開く', () => {
  const t = setupWith({ TW_BILLING: 'off' });
  const a = t.create({ name: 'A' });
  t.updateBilling(a.id, { plan: 'yen5000' });
  assert.equal(t.billing.adminView(a.id).plan, 'flat5000');
  assert.equal(t.billing.adminView(a.id).catalogPlan, 'pro');
  assert.equal(t.entitled(a.id, 'cutins'), true);
  assert.equal(t.access(a.id, 'cutins').source, 'plan');
});

test('確認スイッチがオフなら、Pro 以外の人の見え方は今までと同じ（移行の安全）', () => {
  const t = setupWith({ TW_BILLING: 'off' });
  const none = t.create({ name: 'プランなし' });
  const old2000 = t.create({ name: '2000円' });
  const old5 = t.create({ name: '5%' });
  const plus = t.create({ name: 'Plus' });
  const free = t.create({ name: '無料' });
  t.updateBilling(old2000.id, { plan: 'flat2000' });
  t.updateBilling(old5.id, { plan: 'pct5' });
  t.updateBilling(plus.id, { plan: 'plus' });
  t.updateBilling(free.id, { plan: 'free' });
  for (const tenant of [none, old2000, old5, plus, free]) {
    assert.equal(t.entitled(tenant.id, 'cutins'), false, tenant.name);
    assert.equal(t.access(tenant.id, 'cutins').source, 'default', tenant.name);
    assert.equal(t.entitled(tenant.id, 'alerts'), true, tenant.name);
    for (const capability of ['edit.media', 'edit.layout', 'edit.advanced', 'edit.cutinImage']) assert.equal(t.editAllowed(tenant.id, capability), true, `${tenant.name} ${capability}`);
  }
  // 管理者が手で開けた人も、今までどおり開いたまま
  t.setAccess(old2000.id, 'cutins', true);
  assert.equal(t.entitled(old2000.id, 'cutins'), true);
});

test('確認スイッチがオンなら、プランごとに豪華演出と編集の操作が分かれる', () => {
  const t = setupWith({ TW_BILLING: 'on' });
  const free = t.create({ name: '無料' });
  const plus = t.create({ name: 'Plus' });
  const pro = t.create({ name: 'Pro' });
  const none = t.create({ name: 'プランなし' });
  t.updateBilling(free.id, { plan: 'free', status: 'active', paidUntil: '2099-01-01' });
  t.updateBilling(plus.id, { plan: 'plus', status: 'active', paidUntil: '2099-01-01' });
  t.updateBilling(pro.id, { plan: 'pro', status: 'active', paidUntil: '2099-01-01' });

  assert.equal(t.entitled(free.id, 'cutins'), false);
  assert.equal(t.access(free.id, 'cutins').source, 'plan');
  assert.equal(t.entitled(free.id, 'alerts'), true);
  assert.equal(t.editAllowed(free.id, 'edit.media'), false);

  assert.equal(t.entitled(plus.id, 'cutins'), true);
  assert.equal(t.entitled(plus.id, 'ai'), false);
  for (const capability of ['edit.media', 'edit.cutinImage', 'edit.layout', 'edit.advanced', 'edit.ai']) assert.equal(t.editAllowed(plus.id, capability), false, capability);

  assert.equal(t.entitled(pro.id, 'cutins'), true);
  for (const capability of ['edit.media', 'edit.cutinImage', 'edit.layout', 'edit.advanced', 'edit.ai']) assert.equal(t.editAllowed(pro.id, capability), true, capability);

  // プランが無い記録は今までどおり、プランでは限らない（豪華演出は初めの状態、編集はできる）
  assert.equal(t.entitled(none.id, 'cutins'), false);
  assert.equal(t.access(none.id, 'cutins').source, 'default');
  assert.equal(t.editAllowed(none.id, 'edit.media'), true);

  // 手で開けた Plus の「AI にたのむ」は、edit.ai もできる（手動がいちばん強い）
  t.setAccess(plus.id, 'ai', true);
  assert.equal(t.editAllowed(plus.id, 'edit.ai'), true);

  // 管理画面で cutins を最上位プラン（Pro）限定にしている場合、Plus のダッシュボード判定も OBS と同じく false になる
  t.updateBillingSettings({ premiumFeatures: ['cutins'] });
  assert.equal(t.billing.isFeatureAllowed(plus.id, 'cutins'), false);
  assert.equal(t.entitled(plus.id, 'cutins'), false);
  assert.equal(t.entitled(pro.id, 'cutins'), true);
});
