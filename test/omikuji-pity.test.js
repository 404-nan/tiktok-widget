// おみくじの天井：大吉が出ない回数が設定に届いたら、次の1回は大吉が確定する。
// 数えるのは配信全体（引いた人ごとではない）。大吉が出たら 0 に戻る。
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
  t.mock.timers.tick(400);
  assert.equal(omikuji.phase, 'reveal');
  const seen = { tier: omikuji.tier?.id, forced: omikuji.forced };
  t.mock.timers.tick(2550); // 大吉の結果表示は1.5倍（1700→2550）。ふつうは1700で done へ進み、残りは空走り
  t.mock.timers.tick(500);
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
