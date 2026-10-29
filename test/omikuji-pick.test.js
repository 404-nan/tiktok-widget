// おみくじの番号の選び方: 送った本人のコメントだけ拾う・時間切れ・配信者が選ぶ・配信者も押さないときはランダム・選んでいる間は待ち列。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Gacha, STICKS } from '../src/gacha.js';
import { defaultsFor } from '../src/schema.js';

function setup(over = {}, random = () => 0) {
  const sent = [];
  const omikuji = new Gacha({ broadcast: (m) => sent.push(m) }, { name: 'omikuji', random });
  omikuji.setConfig({ ...defaultsFor('omikuji'), minCoins: 10, rollMs: 1000, revealMs: 500, doneMs: 200, ...over });
  return { omikuji, sent };
}
const gift = (id, name) => ({ kind: 'gift', totalDiamonds: 10, gift: { id: '1', name: 'Rose' }, user: { id, name } });
const chat = (id, name, text) => ({ kind: 'chat', text, user: { id, name } });

test('初期値は「送った人がコメントで選ぶ」・10秒・時間切れはランダム', () => {
  const d = defaultsFor('omikuji');
  assert.equal(d.pickMode, 'viewer');
  assert.equal(d.pickSeconds, 10);
  assert.equal(d.timeoutMode, 'random');
  assert.equal(defaultsFor('gacha').pickMode, undefined); // ガチャは今までどおりすぐ回す
});

test('送った本人のコメントの番号だけで引く。ほかの人・範囲外は無視', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji, sent } = setup();
  omikuji.onEvent(gift('u1', 'ゆず'));
  assert.equal(omikuji.phase, 'pick');
  assert.equal(sent.at(-1).pick.by, 'viewer');
  assert.equal(sent.at(-1).pick.count, STICKS);
  omikuji.onEvent(chat('u2', 'ほかの人', '3'));
  omikuji.onEvent(chat('u1', 'ゆず', '99'));
  assert.equal(omikuji.phase, 'pick');
  omikuji.onEvent(chat('u1', 'ゆず', '７番で！'));
  assert.equal(omikuji.phase, 'rolling');
  assert.equal(omikuji.stick, 7);
  assert.equal(sent.at(-1).pick, null);
  omikuji.close();
});

test('時間切れ(ランダム): 秒数がたつとランダムな番号で引く', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ pickSeconds: 5 }, () => 0.5);
  omikuji.onEvent(gift('u1', 'ゆず'));
  t.mock.timers.tick(4999);
  assert.equal(omikuji.phase, 'pick');
  t.mock.timers.tick(1);
  assert.equal(omikuji.phase, 'rolling');
  assert.equal(omikuji.stick, 6); // 1 + floor(0.5 × 10)
  omikuji.close();
});

test('時間切れ(配信者が選ぶ): 配信者の番になり、ボタンの番号で引く。本人のコメントはもう拾わない', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji, sent } = setup({ pickSeconds: 5, timeoutMode: 'streamer' });
  omikuji.onEvent(gift('u1', 'ゆず'));
  assert.equal(omikuji.choose(2).ok, false); // 送った人の番には押せない
  t.mock.timers.tick(5000);
  assert.equal(omikuji.phase, 'pick');
  assert.equal(sent.at(-1).pick.by, 'streamer');
  omikuji.onEvent(chat('u1', 'ゆず', '3'));
  assert.equal(omikuji.phase, 'pick');
  assert.equal(omikuji.choose(11).ok, false);
  assert.deepEqual(omikuji.choose(4), { ok: true, stick: 4 });
  assert.equal(omikuji.phase, 'rolling');
  omikuji.close();
});

test('配信者も押さなければ、同じ秒数のあとランダムで引く(止まったままにしない)', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji } = setup({ pickMode: 'streamer', pickSeconds: 8 }, () => 0);
  omikuji.start({ kind: 'action' });
  assert.equal(omikuji.pick.by, 'streamer');
  t.mock.timers.tick(8000);
  assert.equal(omikuji.phase, 'rolling');
  assert.equal(omikuji.stick, 1);
  omikuji.close();
});

test('おまかせはすぐ引く。運勢は番号と関係なく重みで決まる', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const tierOf = (stick, random) => {
    const { omikuji, sent } = setup({ pickMode: 'streamer', timeoutMode: 'random' }, random);
    omikuji.start({ kind: 'action' });
    omikuji.choose(stick);
    t.mock.timers.tick(1000);
    omikuji.close();
    return sent.at(-1).tier.id;
  };
  // 同じ乱数なら番号を変えても同じ運勢、乱数が変われば同じ番号でも変わる
  assert.equal(tierOf(1, () => 0), tierOf(9, () => 0));
  assert.notEqual(tierOf(1, () => 0), tierOf(1, () => 0.999));
  const { omikuji } = setup({ pickMode: 'random' });
  omikuji.onEvent(gift('u1', 'ゆず'));
  assert.equal(omikuji.phase, 'rolling');
  omikuji.close();
});

test('選んでいる間の次のギフトは待ち列で待ち、終わったら順に選ぶ', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const { omikuji, sent } = setup();
  omikuji.onEvent(gift('u1', 'ゆず'));
  omikuji.onEvent(gift('u2', 'もも'));
  assert.equal(omikuji.pending.length, 1);
  omikuji.onEvent(chat('u1', 'ゆず', '1'));
  t.mock.timers.tick(1000);
  t.mock.timers.tick(500);
  t.mock.timers.tick(200);
  assert.equal(omikuji.phase, 'pick');
  assert.equal(sent.at(-1).trigger.user.name, 'もも');
  omikuji.close();
});
