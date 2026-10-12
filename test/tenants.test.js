import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Tenants } from '../src/tenants.js';
import { premiumOfPage } from '../src/runtime.js';

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

test('豪華な演出は最初は使えず、配信者ごと・全員まとめて・時間つきでオンにできる', () => {
  const t = setup();
  const a = t.create({ name: 'A' });
  const b = t.create({ name: 'B' });
  assert.equal(t.entitled(a.id, 'cutins'), false);
  assert.equal(t.entitled(a.id, 'wins'), true); // 豪華な演出でないものはいつでも使える
  t.setPremium(a.id, 'cutins', 'on');
  assert.equal(t.entitled(a.id, 'cutins'), true);
  assert.equal(t.entitled(b.id, 'cutins'), false);
  // 時間つき: 期限が過ぎたら使えない
  t.setPremium(b.id, 'rush', 'for', 2);
  assert.equal(t.entitled(b.id, 'rush'), true);
  t.get(b.id).premium.rush.until = Date.now() - 1;
  assert.equal(t.entitled(b.id, 'rush'), false);
  // 全員まとめて
  t.setPremium('global', 'all', 'for', 1);
  assert.equal(t.entitled(b.id, 'winsFx'), true);
  assert.equal(t.premiumState(b.id).winsFx.everyone != null, true);
  t.setPremium('global', 'all', 'off');
  assert.equal(t.entitled(b.id, 'winsFx'), false);
  // 全員の個別のオンを消す
  t.setPremium('everyone', 'all', 'off');
  assert.equal(t.entitled(a.id, 'cutins'), false);
  assert.throws(() => t.setPremium(a.id, 'nope', 'on'));
  assert.throws(() => t.setPremium(a.id, 'cutins', 'for', 0));
});

test('使うウィジェットを選べる（知らない名前は捨てる）', () => {
  const t = setup();
  const a = t.create({ name: 'A' });
  t.update(a.id, { widgets: ['wins', 'alerts', 'nope'] });
  assert.deepEqual(t.get(a.id).widgets, ['wins', 'alerts']);
});

test('豪華な演出のページ', () => {
  assert.equal(premiumOfPage('cutin.html'), 'cutins');
  assert.equal(premiumOfPage('wins-fx.html'), 'winsFx');
  assert.equal(premiumOfPage('wins.html'), null);
});
