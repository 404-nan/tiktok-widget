// カード docs/cards/effect-log-coins.md の完成条件 AC-1〜4 を確かめる受け入れテスト。AC-5(npm test 全体・一時サーバー)と AC-6(README)は別に確かめるので書かない。
// ギフトは src/normalize.js を通した本物の形で EffectLog に渡す。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EffectLog } from '../../src/effect-log.js';
import { normalizeGift } from '../../src/normalize.js';
import { eventCoinTotal } from '../../src/gifts.js';
import { Hub } from '../../src/hub.js';
import { History } from '../../src/history.js';

const root = new URL('../../', import.meta.url).pathname;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-effect-coins-'));

// TikTok から届く生のギフト(連打しないタイプ)を normalize に通す
const realGift = ({ id = '5655', name = 'Rose', diamondCount = 1, repeatCount = 1, userId = 'u1', ts }) => {
  const e = normalizeGift({
    giftId: id, repeatCount, repeatEnd: true,
    user: { userId, uniqueId: userId, nickname: userId },
    gift: { id, name, type: 2, diamondCount },
  });
  return { ...e, ts };
};
const readEvents = (dir, id) => fs.readFileSync(path.join(dir, `${id}.events.jsonl`), 'utf8').trim().split('\n').map((l) => JSON.parse(l));

test('AC-1: normalize を通した本物のギフトのコインが eventCoinTotal と同じ値で events.jsonl に残る', () => {
  const dir = tmp();
  const log = new EffectLog(dir, { secret: 's' });
  log.start('s1', 0);
  const gifts = [
    realGift({ diamondCount: 1, repeatCount: 1, ts: 1 }),
    realGift({ id: '5760', name: 'Corgi', diamondCount: 299, repeatCount: 3, ts: 2 }),
    realGift({ id: '5655', diamondCount: 10, repeatCount: 5, ts: 3 }),
  ];
  for (const g of gifts) log.gift(g);
  log.end(1000);
  const rows = readEvents(dir, 's1');
  assert.equal(rows.length, 3);
  gifts.forEach((g, i) => {
    assert.ok(eventCoinTotal(g) > 0);
    assert.equal(rows[i].coins, eventCoinTotal(g));
  });
  assert.equal(rows[1].coins, 299 * 3);
  assert.equal(rows[2].coins, 50);
});

test('AC-2: 効果ログのコインの合計が history.js の配信の合計と同じ数字になる', () => {
  const dir = tmp();
  const hub = new Hub();
  const history = new History(hub, path.join(dir, 'sessions'));
  clearInterval(history.timer);
  const log = new EffectLog(path.join(dir, 'effects'), { secret: 's' });
  hub.setStatus({ mode: 'live', username: 'sakura' });
  log.start('s2', Date.now());
  const gifts = [
    realGift({ diamondCount: 1, repeatCount: 5, userId: 'a' }),
    realGift({ id: '5760', name: 'Corgi', diamondCount: 299, repeatCount: 1, userId: 'b' }),
    realGift({ id: '6000', name: 'Lion', diamondCount: 29999, repeatCount: 2, userId: 'c' }),
  ];
  for (const g of gifts) { hub.publish(g); log.gift(g); }
  log.end();
  const total = readEvents(path.join(dir, 'effects'), 's2').reduce((sum, r) => sum + r.coins, 0);
  assert.ok(history.current.totals.coins > 0);
  assert.equal(total, history.current.totals.coins);
});

test('AC-2: 効果ログは自前でコインを数えず eventCoinTotal と同じ値を出す(文字の "1,000"・個数かけ算・欠損)', () => {
  const dir = tmp();
  const log = new EffectLog(dir, { secret: 's' });
  log.start('s3', 0);
  const shapes = [
    { kind: 'gift', ts: 1, user: { id: 'a' }, totalDiamonds: '1,000', gift: { id: '1', name: 'X' } },
    { kind: 'gift', ts: 2, user: { id: 'a' }, gift: { id: '2', name: 'Y', diamonds: 7, count: 3 } },
    { kind: 'gift', ts: 3, user: { id: 'a' }, gift: { id: '3', name: 'Z', diamonds: 7 } },
    { kind: 'gift', ts: 4, user: { id: 'a' }, gift: { id: '4', name: 'W' } },
  ];
  for (const s of shapes) log.gift(s);
  log.end(1000);
  const rows = readEvents(dir, 's3');
  shapes.forEach((s, i) => assert.equal(rows[i].coins, eventCoinTotal(s)));
  assert.equal(rows[0].coins, 1000);
  assert.equal(rows[1].coins, 21);
});

test('AC-3: ギフトの前後に演出がある配信の報告で medianCoinsPerMinute が0より大きく倍率が数字になる', () => {
  const dir = tmp();
  const log = new EffectLog(dir, { secret: 's' });
  const M = 60_000;
  log.start('s4', 0);
  // 演出の前(0〜1分)は少なめ、後(2〜3分)は多め
  log.gift(realGift({ diamondCount: 10, ts: 0 * M + 1 }));
  log.gift(realGift({ diamondCount: 10, ts: 1 * M + 1 }));
  log.effect('roulette', {}, { ts: 2 * M });
  log.gift(realGift({ diamondCount: 30, ts: 2 * M + 1 }));
  log.gift(realGift({ diamondCount: 30, ts: 3 * M + 1 }));
  log.end(4 * M);
  const report = JSON.parse(fs.readFileSync(path.join(dir, 's4.report.json'), 'utf8'));
  assert.ok(report.medianCoinsPerMinute > 0);
  const sample = report.effects.roulette.samples[0];
  assert.equal(typeof sample.multiplier, 'number');
  assert.ok(Number.isFinite(sample.multiplier));
  assert.equal(sample.beforePerMinute, 10);
  assert.equal(sample.afterPerMinute, 30);
  assert.equal(sample.multiplier, 3);
});

test('AC-4: test/effect-log.test.js の log.gift は本物の形(totalDiamonds・gift.diamonds)で、古い coins: 10 の形ではない', () => {
  const text = fs.readFileSync(path.join(root, 'test/effect-log.test.js'), 'utf8');
  const giftCalls = text.split('\n').filter((line) => /log\.gift\(/.test(line));
  assert.ok(giftCalls.length > 0);
  for (const line of giftCalls) {
    assert.match(line, /totalDiamonds/);
    assert.match(line, /diamonds/);
    assert.doesNotMatch(line, /(^|[^.\w])coins\s*:/);
  }
  // makeEffectReport の入力は記録の行の形なので coins のままでよい
  assert.match(text, /makeEffectReport\(\[[\s\S]*coins: 10/);
});
