// おみくじの天井：大吉が出ない回数が設定に届いたら、次の1回は大吉が確定する。
// 数えるのは配信全体（引いた人ごとではない）。大吉が出たら 0 に戻る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Gacha } from '../src/gacha.js';
import { defaultsFor } from '../src/schema.js';

function setup(over = {}, random = () => 0.999) {
  const sent = [];
  const omikuji = new Gacha({ broadcast: (message) => sent.push(message) }, { name: 'omikuji', random });
  omikuji.setConfig({ ...defaultsFor('omikuji'), minCoins: 10, displayMode: 'short', ...over });
  return { omikuji, sent };
}

const gift = () => ({
  kind: 'gift',
  totalDiamonds: 10,
  gift: { id: '1', name: 'Rose' },
  user: { id: 'u1', name: 'ゆず' },
});

// 1回引いて、結果の段階で運勢と確定かどうかを拾い、最後まで進める。
// 模擬時計は段階ごとに進める（まとめて進めると途中で張った待ちがずれる）。
function drawAndSee(t, omikuji) {
  omikuji.onEvent(gift());
  t.mock.timers.tick(300);
  assert.equal(omikuji.phase, 'reveal');
  const seen = { tier: omikuji.tier?.id, forced: omikuji.forced };
  t.mock.timers.tick(2550); // 大吉の結果表示は見せ場の長さ2550。ふつうは800で done へ進み、残りは空走り
  t.mock.timers.tick(300);
  t.mock.timers.tick(100);
  assert.equal(omikuji.phase, 'idle');
  return seen;
}

test('初期値：天井は 0（無効）で、対象は大吉だけ', () => {
  const defaults = defaultsFor('omikuji');
  assert.equal(defaults.pity, 0);
  const targets = defaults.tiers.filter((tier) => tier.pity === true);
  assert.equal(targets.length, 1);
  assert.equal(targets[0].id, 'daikichi');
});

test('天井の回数だけ大吉が出なければ、次は大吉が確定して数え直しになる', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ pity: 2 });
  assert.notEqual(drawAndSee(t, omikuji).tier, 'daikichi');
  assert.equal(omikuji.snapshot().pityCount, 1);
  assert.notEqual(drawAndSee(t, omikuji).tier, 'daikichi');
  assert.equal(omikuji.snapshot().pityCount, 2);
  const third = drawAndSee(t, omikuji);
  assert.equal(third.tier, 'daikichi');
  assert.equal(third.forced, true);
  assert.equal(omikuji.snapshot().pityCount, 0);
  omikuji.close();
});

test('天井が 0 なら、いくら外れても確定しない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ pity: 0 });
  for (let i = 0; i < 5; i++) {
    assert.equal(drawAndSee(t, omikuji).forced, false);
  }
  omikuji.close();
});

test('大吉が自然に出たら数え直しになる', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ pity: 5 }, () => 0); // random 0 は先頭の大吉
  assert.equal(drawAndSee(t, omikuji).tier, 'daikichi');
  assert.equal(omikuji.snapshot().pityCount, 0);
  omikuji.close();
});

test('連投：回している間のギフトは待ち列に入り、全部回る', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ pity: 0 });
  omikuji.onEvent(gift());
  omikuji.onEvent(gift());
  omikuji.onEvent(gift());
  assert.equal(omikuji.snapshot().pending, 2);
  for (let i = 0; i < 40 && (omikuji.phase !== 'idle' || omikuji.seq < 3); i++) t.mock.timers.tick(500);
  assert.equal(omikuji.phase, 'idle');
  assert.equal(omikuji.seq, 3);
  omikuji.close();
});

test('配信が完全に終わると、天井の数えは0に戻る（接続し直しの間は戻らない）', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pity-reset-'));
  const file = path.join(dir, 'omikuji-pity.json');
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const omikuji = new Gacha(hub, { name: 'omikuji', random: () => 0.5, storeFile: file });
  omikuji.pityCount = 5;

  hub.emit('status', { mode: 'idle' });
  assert.equal(omikuji.pityCount, 5, '配信が始まっていない状態では戻らない');
  hub.emit('status', { mode: 'live' });
  hub.emit('status', { mode: 'connecting' });
  hub.emit('status', { mode: 'live' });
  assert.equal(omikuji.pityCount, 5, '接続し直しの間は戻らない');
  hub.emit('status', { mode: 'idle' });
  assert.equal(omikuji.pityCount, 0, '配信が終わると0に戻る');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).pityCount, 0, '保存先も0になる');
  omikuji.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('配信が終わったあとの次の配信は、数えが一から始まる', () => {
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const omikuji = new Gacha(hub, { name: 'omikuji', random: () => 0.5 });
  omikuji.pityCount = 3;
  hub.emit('status', { mode: 'live' });
  hub.emit('status', { mode: 'demo' });
  assert.equal(omikuji.pityCount, 0, 'live から demo へ移った時点でも、live は終わったので戻る');
  omikuji.close();
});

test('再接続の失敗（error）では、天井の数えは戻らない', () => {
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const omikuji = new Gacha(hub, { name: 'omikuji', random: () => 0.5 });
  omikuji.pityCount = 4;
  hub.emit('status', { mode: 'live' });
  hub.emit('status', { mode: 'connecting' });
  hub.emit('status', { mode: 'error' });
  hub.emit('status', { mode: 'connecting' });
  assert.equal(omikuji.pityCount, 4, '接続の揺れの途中では戻らない');
  hub.emit('status', { mode: 'live' });
  hub.emit('status', { mode: 'ended' });
  assert.equal(omikuji.pityCount, 0, '配信の終了（ended）で戻る');
  omikuji.close();
});

test('単発の抽選でも、大吉の確率が 0 なら天井に届いても大吉は出ない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const tiers = defaultsFor('omikuji').tiers.map((tier) => (tier.id === 'daikichi' ? { ...tier, weight: 0 } : tier));
  const { omikuji } = setup({ pity: 2, tiers }, () => 0.999);
  for (let i = 0; i < 3; i++) {
    const seen = drawAndSee(t, omikuji);
    assert.notEqual(seen.tier, 'daikichi');
    assert.equal(seen.forced, false);
  }
  assert.equal(omikuji.snapshot().pityCount, 3, '保証は発動せず、数えは増え続ける');
  omikuji.close();
});
test('天井の残り（pityLeft）は、設定から今の数えを引いた数。大吉で数えが戻れば満タンに戻る', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji, sent } = setup({ pity: 2 });
  assert.equal(omikuji.snapshot().pityLeft, 2, 'まだ引いていないので満タン');
  drawAndSee(t, omikuji);
  assert.equal(omikuji.snapshot().pityLeft, 1);
  assert.equal(sent.at(-1).pityLeft, 1, '画面へ渡すお知らせにも載る');
  drawAndSee(t, omikuji);
  assert.equal(omikuji.snapshot().pityLeft, 0, '天井に届くと0');
  const hit = drawAndSee(t, omikuji); // 天井で大吉が確定し、数えは 0 に戻る
  assert.equal(hit.tier, 'daikichi');
  assert.equal(hit.forced, true);
  assert.equal(omikuji.snapshot().pityCount, 0);
  assert.equal(omikuji.snapshot().pityLeft, 2, '残りも満タンに戻る');
  omikuji.close();
});

test('大吉が自然に出たときも、残りは満タンに戻る', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ pity: 5 }, () => 0); // 先頭の大吉を引く
  drawAndSee(t, omikuji);
  assert.equal(omikuji.snapshot().pityCount, 0);
  assert.equal(omikuji.snapshot().pityLeft, 5);
  omikuji.close();
});

test('天井が無効（0）のときは、残りは null', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji, sent } = setup({ pity: 0 });
  assert.equal(omikuji.snapshot().pityLeft, null);
  drawAndSee(t, omikuji);
  assert.equal(omikuji.snapshot().pityCount, 1, '数え自体は進む');
  assert.equal(omikuji.snapshot().pityLeft, null);
  assert.equal(sent.at(-1).pityLeft, null);
  omikuji.close();
});

test('天井の対象の重みが 0 だけの設定では、残りは null（天井は実際には発動しない）', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const tiers = defaultsFor('omikuji').tiers.map((tier) => (tier.id === 'daikichi' ? { ...tier, weight: 0 } : tier));
  const { omikuji, sent } = setup({ pity: 2, tiers });
  assert.equal(omikuji.snapshot().pityLeft, null, '発動しない天井の残りは出さない');
  drawAndSee(t, omikuji);
  assert.equal(omikuji.snapshot().pityCount, 1, '数え自体は進む');
  assert.equal(omikuji.snapshot().pityLeft, null, '数えが進んでも残りは出さない');
  assert.equal(sent.at(-1).pityLeft, null, '画面へ渡すお知らせにも載らない');
  omikuji.close();
});

test('残りは 0 で止める（数えが設定を超えてもマイナスにしない）', () => {
  const { omikuji } = setup({ pity: 2 });
  omikuji.pityCount = 5;
  assert.equal(omikuji.snapshot().pityLeft, 0);
  omikuji.pityCount = 999;
  assert.equal(omikuji.snapshot().pityLeft, 0);
  omikuji.close();
});
