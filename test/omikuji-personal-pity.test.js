// おみくじの個人の天井：その人が引いた回数だけ数え、届いたらその人の次を大吉に確定させる。
// 全体の天井とは別に数え、大吉が出たら（自然・全体の確定・個人の確定のどれでも）その人の数えは 0 に戻る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Gacha } from '../src/gacha.js';
import { defaultsFor } from '../src/schema.js';

function setup(over = {}, random = () => 0.999, extra = {}) {
  const sent = [];
  const omikuji = new Gacha({ broadcast: (message) => sent.push(message) }, { name: 'omikuji', random, ...extra });
  omikuji.setConfig({ ...defaultsFor('omikuji'), minCoins: 10, displayMode: 'short', ...over });
  return { omikuji, sent };
}

const gift = (user = { id: 'u1', name: 'ゆず' }, extra = {}) => ({
  kind: 'gift',
  totalDiamonds: 10,
  gift: { id: '1', name: 'Rose' },
  user,
  ...extra,
});

// 1回引いて結果を見て、最後まで進める（omikuji-pity.test.js と同じ進め方）
function drawAndSee(t, omikuji, event) {
  omikuji.onEvent(event);
  t.mock.timers.tick(300);
  assert.equal(omikuji.phase, 'reveal');
  const seen = { tier: omikuji.tier?.id, forced: omikuji.forced };
  t.mock.timers.tick(2550);
  t.mock.timers.tick(300);
  t.mock.timers.tick(100);
  assert.equal(omikuji.phase, 'idle');
  return seen;
}

test('初期値：個人の天井は 0（無効）', () => {
  assert.equal(defaultsFor('omikuji').pityPersonal, 0);
});

test('個人の天井：その人の回数だけ数え、届いたらその人の次が大吉確定になる', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ pityPersonal: 2 });
  const a = { id: 'u1', name: 'ゆず' };
  const b = { id: 'u2', name: 'もも' };
  assert.notEqual(drawAndSee(t, omikuji, gift(a)).tier, 'daikichi');
  assert.equal(omikuji.pityUsers.get('id:u1'), 1);
  // 別の人が引いても、ゆずの数えは進まないし、ももは ゆずの数えでは確定しない
  assert.notEqual(drawAndSee(t, omikuji, gift(b)).tier, 'daikichi');
  assert.equal(omikuji.pityUsers.get('id:u2'), 1);
  assert.notEqual(drawAndSee(t, omikuji, gift(a)).tier, 'daikichi');
  assert.equal(omikuji.pityUsers.get('id:u1'), 2);
  const third = drawAndSee(t, omikuji, gift(a));
  assert.equal(third.tier, 'daikichi');
  assert.equal(third.forced, true);
  // 確定したらその人の数えは 0 に戻る（消える）。ももの数えは残る
  assert.equal(omikuji.pityUsers.has('id:u1'), false);
  assert.equal(omikuji.pityUsers.get('id:u2'), 1);
  omikuji.close();
});

test('自分の大吉（自然に出た）でも個人の数えは 0 に戻る', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  let r = () => 0.999;
  const { omikuji } = setup({ pityPersonal: 5 }, () => r());
  const a = { id: 'u1', name: 'ゆず' };
  drawAndSee(t, omikuji, gift(a));
  drawAndSee(t, omikuji, gift(a));
  assert.equal(omikuji.pityUsers.get('id:u1'), 2);
  r = () => 0; // 先頭の大吉を自然に引く
  const hit = drawAndSee(t, omikuji, gift(a));
  assert.equal(hit.tier, 'daikichi');
  assert.equal(hit.forced, false);
  assert.equal(omikuji.pityUsers.has('id:u1'), false);
  omikuji.close();
});

test('全体の天井で大吉が確定したら、その人の個人の数えも 0 に戻る', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ pity: 1, pityPersonal: 5 });
  const a = { id: 'u1', name: 'ゆず' };
  drawAndSee(t, omikuji, gift(a)); // 全体 1、個人 1
  assert.equal(omikuji.pityUsers.get('id:u1'), 1);
  const second = drawAndSee(t, omikuji, gift(a)); // 全体の天井で確定
  assert.equal(second.tier, 'daikichi');
  assert.equal(second.forced, true);
  assert.equal(omikuji.pityUsers.has('id:u1'), false);
  omikuji.close();
});

test('個人の天井が無効（0）なら、個人の数えは持たない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ pityPersonal: 0 });
  drawAndSee(t, omikuji, gift());
  drawAndSee(t, omikuji, gift());
  assert.equal(omikuji.pityUsers.size, 0);
  omikuji.close();
});

test('テスト送信では個人の数えは進まない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ pityPersonal: 2 });
  drawAndSee(t, omikuji, gift({ id: 'u1', name: 'ゆず' }, { test: true }));
  drawAndSee(t, omikuji, gift({ id: 'u1', name: 'ゆず' }, { test: true }));
  assert.equal(omikuji.pityUsers.size, 0);
  omikuji.close();
});

test('10連では個人の数えが10回ぶん進み、途中で届いたらその回が確定する', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ pityPersonal: 3, tenGifts: ['TenRose'] });
  omikuji.onEvent({ kind: 'gift', totalDiamonds: 10, gift: { id: '9', name: 'TenRose' }, user: { id: 'u1', name: 'ゆず' } });
  assert.equal(omikuji.phase, 'ten');
  const results = omikuji.snapshot().results;
  assert.equal(results.length, 10);
  // 3回外れた次の4回目と、そこから3回外れた次の8回目が確定
  assert.equal(results[3].tier.id, 'daikichi');
  assert.equal(results[3].forced, true);
  assert.equal(results[7].tier.id, 'daikichi');
  assert.equal(results[7].forced, true);
  // 残り2回ぶんの数えが残る
  assert.equal(omikuji.pityUsers.get('id:u1'), 2);
  omikuji.close();
});

test('個人の数えは保存され、読み直しても残る。版1の保存（全体だけ）も読める', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-pity-'));
  const storeFile = path.join(dir, 'omikuji-pity.json');
  const first = setup({ pityPersonal: 5 }, () => 0.999, { storeFile });
  drawAndSee(t, first.omikuji, gift());
  drawAndSee(t, first.omikuji, gift());
  first.omikuji.close();
  const saved = JSON.parse(fs.readFileSync(storeFile, 'utf8'));
  assert.equal(saved.version, 2);
  assert.deepEqual(saved.pityUsers, { 'id:u1': 2 });

  const second = setup({ pityPersonal: 5 }, () => 0.999, { storeFile });
  assert.equal(second.omikuji.pityUsers.get('id:u1'), 2);
  second.omikuji.close();

  fs.writeFileSync(storeFile, JSON.stringify({ version: 1, pityCount: 3 }) + '\n');
  const third = setup({}, () => 0.999, { storeFile });
  assert.equal(third.omikuji.pityCount, 3);
  assert.equal(third.omikuji.pityUsers.size, 0);
  third.omikuji.close();
});

test('配信が終わると個人の数えも 0 に戻る', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const omikuji = new Gacha(hub, { name: 'omikuji', random: () => 0.999 });
  omikuji.setConfig({ ...defaultsFor('omikuji'), minCoins: 10, displayMode: 'short', pityPersonal: 5 });
  hub.emit('status', { mode: 'live' });
  drawAndSee(t, omikuji, gift());
  assert.equal(omikuji.pityUsers.get('id:u1'), 1);
  hub.emit('status', { mode: 'ended' });
  assert.equal(omikuji.pityUsers.size, 0);
  omikuji.close();
});

test('大吉の weight が 0 のときは、個人の天井も発動しない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const tiers = defaultsFor('omikuji').tiers.map((tier) => (tier.id === 'daikichi' ? { ...tier, weight: 0 } : tier));
  const { omikuji } = setup({ pityPersonal: 1, tiers });
  const a = { id: 'u1', name: 'ゆず' };
  assert.notEqual(drawAndSee(t, omikuji, gift(a)).tier, 'daikichi');
  const second = drawAndSee(t, omikuji, gift(a));
  assert.notEqual(second.tier, 'daikichi');
  assert.equal(second.forced, false);
  omikuji.close();
});

test('引いた人の分からない10連では、個人の天井は発動しない（全体の天井だけが効く）', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ pity: 4, pityPersonal: 2, tenGifts: ['TenRose'] });
  omikuji.onEvent({ kind: 'gift', totalDiamonds: 10, gift: { id: '9', name: 'TenRose' } });
  assert.equal(omikuji.phase, 'ten');
  const forced = omikuji.snapshot().results.map((r) => r.forced);
  // 全体の数えが4に届く5回目だけが確定。個人の対象でないので、以降は数え直しで確定しない
  assert.deepEqual(forced, [false, false, false, false, true, false, false, false, false, true]);
  assert.equal(omikuji.pityUsers.size, 0);
  omikuji.close();
});
