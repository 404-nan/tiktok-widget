// ポイント基盤の合格条件：付与の上限（連投・バッチ）／spend の残高不足／保存と復元／
// テナント間で混ざらない／!ポイント が残高と順位を返す／おみくじ・ガチャのポイント引き。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { Points } from '../src/points.js';
import { Gacha } from '../src/gacha.js';
import { GachaViewers, GachaViewerStore } from '../src/gacha-viewers.js';
import { createEventBus } from '../src/events.js';
import { defaultsFor } from '../src/schema.js';

const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-points-'));

function setup(over = {}, startAt = 1_000_000) {
  const hub = new EventEmitter();
  const sent = [];
  hub.broadcast = (msg) => sent.push(msg);
  let now = startAt;
  const dir = tmpDir();
  const file = path.join(dir, 'points.json');
  const points = new Points(hub, { file, now: () => now, saveDebounceMs: 60_000 });
  points.setConfig({ ...defaultsFor('points'), ...over });
  return {
    hub, points, file, dir, sent,
    setNow: (v) => { now = v; },
    getNow: () => now,
  };
}

const taro = { id: 'taro', name: 'たろう' };
const hana = { id: 'hana', name: 'はな' };
const chat = (user, text = 'こんにちは') => ({ kind: 'chat', user, text });
const gift = (user, coins) => ({ kind: 'gift', user, gift: { diamondCount: coins, count: 1 } });

test('コメントで貯まり、連投の間隔（10秒）より速いと増えない', () => {
  const { points, setNow, getNow } = setup();
  points.handleEvent(chat(taro));
  assert.equal(points.balance('taro'), 1);
  setNow(getNow() + 5_000);
  points.handleEvent(chat(taro));
  assert.equal(points.balance('taro'), 1, '10秒以内の連投では増えない');
  setNow(getNow() + 5_000);
  points.handleEvent(chat(taro));
  assert.equal(points.balance('taro'), 2, '10秒たてばまた増える');
  points.close();
});

test('いいねは100件ごとの区切りで貯まる（余りは持ち越す）', () => {
  const { points } = setup();
  points.handleEvent({ kind: 'like', user: taro, count: 60 });
  assert.equal(points.balance('taro'), 0);
  points.handleEvent({ kind: 'like', user: taro, count: 50 });
  assert.equal(points.balance('taro'), 1);
  points.handleEvent({ kind: 'like', user: taro, count: 90 });
  assert.equal(points.balance('taro'), 2);
  points.close();
});

test('フォロー +10、ギフトはコイン数×倍率で貯まる', () => {
  const { points } = setup();
  points.handleEvent({ kind: 'follow', user: taro });
  assert.equal(points.balance('taro'), 10);
  points.handleEvent(gift(taro, 30));
  assert.equal(points.balance('taro'), 40);
  points.close();
});

test('spend は残高不足で失敗し、残高は負にならない', () => {
  const { points } = setup();
  points.add(taro, 50, 'test');
  const ng = points.spend(taro, 80, 'test');
  assert.equal(ng.ok, false);
  assert.equal(points.balance('taro'), 50);
  const ok = points.spend(taro, 50, 'test');
  assert.equal(ok.ok, true);
  assert.equal(points.balance('taro'), 0);
  const ng2 = points.spend(taro, 1, 'test');
  assert.equal(ng2.ok, false);
  assert.equal(points.balance('taro'), 0);
  points.close();
});

test('再起動で残高が戻る（保存と復元）', () => {
  const { points, hub, file } = setup();
  points.add(taro, 120, 'test');
  points.add(hana, 30, 'test');
  points.flush();
  points.close();
  const again = new Points(hub, { file, saveDebounceMs: 60_000 });
  assert.equal(again.balance('taro'), 120);
  assert.equal(again.balance('hana'), 30);
  assert.equal(again.totalOf('taro'), 120);
  again.close();
});

test('テナント間で混ざらない（保存先が違えば残高は別）', () => {
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const a = new Points(hub, { file: path.join(tmpDir(), 'points.json'), saveDebounceMs: 60_000 });
  const b = new Points(hub, { file: path.join(tmpDir(), 'points.json'), saveDebounceMs: 60_000 });
  a.add(taro, 70, 'test');
  assert.equal(a.balance('taro'), 70);
  assert.equal(b.balance('taro'), 0);
  a.close();
  b.close();
});

test('!ポイント が残高と順位を返す。レベルは累計で上がり、使っても下がらない', () => {
  const { points, sent } = setup();
  points.handleEvent(gift(taro, 300));
  points.handleEvent({ kind: 'follow', user: hana });
  const reply = points.handleEvent(chat(hana, '!ポイント'));
  assert.equal(reply.balance, 10);
  assert.equal(reply.rank, 2);
  assert.equal(reply.level, 1);
  assert.equal(points.rankOf('taro'), 1);
  const ranking = points.ranking(20);
  assert.equal(ranking[0].userId, 'taro');
  assert.equal(ranking[0].balance, 300);
  assert.ok(sent.some((msg) => msg.type === 'points' && msg.reply === true && msg.balance === 10), '返事が画面へ流れる');
  // レベル：累計250で3、使用で残高が減ってもレベルは下がらない
  points.add(hana, 240, 'test');
  assert.equal(points.levelOf('hana'), 3);
  points.spend(hana, 200, 'test');
  assert.equal(points.levelOf('hana'), 3);
  points.close();
});

test('おみくじをポイントで引ける。残高不足では引けず、開始できなかったら返金される', () => {
  const calls = [];
  const omikuji = { start: (trigger) => { calls.push(trigger); return { ok: true, queued: false }; } };
  const { points } = setup();
  points.setOmikuji(omikuji);
  points.add(taro, 150, 'test');
  const ok = points.handleEvent(chat(taro, '!おみくじ'));
  assert.equal(ok.ok, true);
  assert.equal(points.balance('taro'), 50);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].kind, 'points');
  const ng = points.handleEvent(chat(taro, '!おみくじ'));
  assert.equal(ng.ok, false);
  assert.equal(ng.reason, 'insufficient');
  assert.equal(calls.length, 1, '残高不足では開始しない');
  // 開始に失敗したら払った分が戻る（累計は増えない）
  points.setOmikuji({ start: () => null });
  points.add(hana, 100, 'test');
  const refunded = points.drawOmikuji(hana);
  assert.equal(refunded.ok, false);
  assert.equal(points.balance('hana'), 100);
  assert.equal(points.totalOf('hana'), 100);
  points.close();
});

test('ガチャは無料回・有料回が無いとき、ポイントで引ける', () => {
  const hub = new EventEmitter();
  hub.broadcast = () => {};
  const bus = createEventBus();
  const gacha = new Gacha(hub, { bus, random: () => 0 });
  const cfg = { ...defaultsFor('gacha'), rollMs: 100, revealMs: 100, doneMs: 100, cooldownSec: 0, freePerReset: 0, pointsCost: 100 };
  gacha.setConfig(cfg);
  const dir = tmpDir();
  const store = new GachaViewerStore(path.join(dir, 'gacha-viewers.json'), { debounceMs: 60_000 });
  const viewers = new GachaViewers(store, { gacha, bus });
  viewers.setConfig(cfg);
  const points = new Points(hub, { file: path.join(dir, 'points.json'), saveDebounceMs: 60_000 });
  viewers.setPoints(points);
  points.add(taro, 150, 'test');
  const spun = viewers.spin(taro, { source: 'comment' });
  assert.equal(spun.ok, true);
  assert.equal(spun.cost, 'points');
  assert.equal(points.balance('taro'), 50);
  const ng = viewers.spin(taro, { source: 'comment' });
  assert.equal(ng.ok, false, '残高が値段に足りなければ回せない');
  viewers.close();
  points.close();
  gacha.close();
});

test('滞在は5分の区切りごとに貯まり、離れたら止まる', () => {
  const { points, setNow, getNow } = setup();
  const t0 = getNow();
  points.handleEvent({ kind: 'member', user: taro });
  setNow(t0 + 240_000);
  points.handleEvent({ kind: 'member', user: taro }); // まだいる動き
  points.stayTick(t0 + 300_000);
  assert.equal(points.balance('taro'), 2, '5分で +2');
  points.stayTick(t0 + 600_000); // その後、動きが無い＝離れた
  assert.equal(points.balance('taro'), 2, '離れたら増えない');
  points.close();
});

test('テスト送信とデモの視聴者では貯まらない', () => {
  const { points } = setup();
  points.handleEvent({ kind: 'follow', user: taro, test: true });
  points.handleEvent({ kind: 'follow', user: { id: 'demo_1', name: 'デモ' } });
  points.handleEvent(gift(taro, 500));
  assert.equal(points.balance('taro'), 500, '本物のギフトだけ貯まる');
  assert.equal(points.balance('demo_1'), 0);
  points.close();
});

test('履歴（points-log.jsonl）に増減が残る', () => {
  const { points, dir } = setup();
  points.add(taro, 10, 'comment');
  points.spend(taro, 4, 'gacha');
  points.close();
  const lines = fs.readFileSync(path.join(dir, 'points-log.jsonl'), 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  assert.equal(lines.length, 2);
  assert.equal(lines[0].delta, 10);
  assert.equal(lines[1].delta, -4);
  assert.equal(lines[1].balance, 6);
});

test('stayUnitsFor は滞在中の区切りだけを返し、記録を作らない', () => {
  const { points, getNow } = setup();
  const now = getNow();
  points.users['taro'] = { name: 'たろう', staySince: now - 35 * 60_000, stayLastSeen: now, stayUnits: 7 };
  assert.equal(points.stayUnitsFor(taro), 7);
  points.users['hana'] = { name: 'はな', staySince: now - 35 * 60_000, stayLastSeen: now - 3 * 60_000, stayUnits: 7 };
  assert.equal(points.stayUnitsFor(hana), 0, '最後の動きから2分を超えたら滞在中とみなさない');
  assert.equal(points.stayUnitsFor({ id: 'nobody', name: 'だれ' }), 0);
  assert.equal(points.users['nobody'], undefined, '引いただけでは記録を作らない');
});
