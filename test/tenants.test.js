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
