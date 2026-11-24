// 扉の確率ゲーム（src/door.js）のテスト。進行（段階が進む／外れたら終わる）、確率 0 と 100 の固定、
// テスト送信で状態が動かないこと、挑戦中のギフトで二重に始まらないことを確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DoorEngine, chanceFor, startsChallenge, STAGES } from '../src/door.js';
import { defaultsFor } from '../src/schema.js';

const door = (over = {}) => ({ ...defaultsFor('doors'), ...over });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function setup(config = { default: door() }, file) {
  const hub = new EventEmitter();
  const sent = [];
  hub.broadcast = (msg) => sent.push(msg);
  file ??= path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tw-door-')), 'doors.json');
  const engine = new DoorEngine(hub, file);
  engine.revealMs = 5; // 演出待ちを短くして、進行だけを見る
  engine.setConfig(config);
  return { hub, engine, sent, file };
}
const gift = (name, coins = 10, user = 'たろう', over = {}) => ({ kind: 'gift', user: { id: `u_${user}`, name: user }, gift: { name, id: '1', count: 1 }, totalDiamonds: coins, ...over });
const kinds = (sent) => sent.filter((m) => m.type === 'door').map((m) => m.event?.kind);

test('始まる条件: gifts があればそのギフトだけ、なければ minCoins 以上のギフト全部', () => {
  assert.equal(startsChallenge(door({ gifts: ['Rose'] }), gift('Rose')), true);
  assert.equal(startsChallenge(door({ gifts: ['Rose'] }), gift('Galaxy')), false);
  assert.equal(startsChallenge(door({ gifts: ['rose'] }), gift('Rose')), true, 'ギフト名は大文字小文字を区別しない');
  assert.equal(startsChallenge(door({ minCoins: 100 }), gift('Rose', 99)), false);
  assert.equal(startsChallenge(door({ minCoins: 100 }), gift('Rose', 100)), true);
  assert.equal(startsChallenge(door({ minCoins: 0 }), gift('Rose', 1)), true);
  assert.equal(startsChallenge(door(), { kind: 'like', count: 10 }), false);
  assert.equal(startsChallenge(door(), { kind: 'follow' }), false);
});

test('確率は chance1〜3 を 0〜100 に丸めて使う', () => {
  const c = door({ chance1: 80, chance2: 50, chance3: 30 });
  assert.deepEqual([1, 2, 3].map((s) => chanceFor(c, s)), [80, 50, 30]);
  assert.equal(chanceFor(door({ chance1: 140 }), 1), 100);
  assert.equal(chanceFor(door({ chance2: -5 }), 2), 0);
  assert.equal(STAGES, 3);
});

test('ギフトで挑戦が始まり、挑戦者が状態に載る', () => {
  const { hub, engine, sent } = setup();
  hub.emit('event', gift('Rose'));
  const d = engine.get('default');
  assert.equal(d.phase, 'pick');
  assert.equal(d.stage, 1);
  assert.equal(d.by?.name, 'たろう');
  assert.equal(d.plays, 1);
  assert.deepEqual(kinds(sent), ['start']);
  engine.close();
});

test('テスト送信では挑戦が始まらない（本番の状態を動かさない）', () => {
  const { hub, engine } = setup();
  hub.emit('event', gift('Rose', 10, 'たろう', { test: true }));
  assert.equal(engine.get('default').phase, 'idle');
  assert.equal(engine.get('default').plays, 0);
  engine.close();
});

test('挑戦中に来た対象ギフトは、新しい挑戦を始めない', () => {
  const { hub, engine } = setup();
  hub.emit('event', gift('Rose'));
  hub.emit('event', gift('Rose', 10, 'みお'));
  assert.equal(engine.get('default').plays, 1);
  assert.equal(engine.get('default').by?.name, 'たろう');
  engine.close();
});

test('確率100: 選ぶたびに段階が進み、3段目で突破。結果の後は待機に戻る', async () => {
  const { engine, sent } = setup({ default: door({ chance1: 100, chance2: 100, chance3: 100, resultSeconds: 0.05 }) });
  engine.apply('default', 'start');
  for (const want of [2, 3]) {
    const picked = engine.choose('default', 1);
    assert.equal(picked.ok, true);
    assert.equal(engine.get('default').phase, 'reveal');
    assert.equal(engine.get('default').win, true);
    await sleep(30);
    assert.equal(engine.get('default').phase, 'pick');
    assert.equal(engine.get('default').stage, want);
  }
  engine.choose('default', 2);
  await sleep(30);
  assert.equal(engine.get('default').phase, 'clear');
  assert.equal(engine.get('default').clears, 1);
  assert.ok(kinds(sent).includes('clear'));
  await sleep(90);
  assert.equal(engine.get('default').phase, 'idle');
  engine.close();
});

test('確率0: 1段目で必ず外れて終わる', async () => {
  const { engine, sent } = setup({ default: door({ chance1: 0, resultSeconds: 0.05 }) });
  engine.apply('default', 'start');
  const picked = engine.choose('default', 2);
  assert.equal(picked.ok, true);
  assert.equal(engine.get('default').win, false);
  await sleep(30);
  assert.equal(engine.get('default').phase, 'failed');
  assert.equal(engine.get('default').clears, 0);
  assert.ok(kinds(sent).includes('fail'));
  await sleep(90);
  assert.equal(engine.get('default').phase, 'idle');
  engine.close();
});

test('最後だけ外れる形: 確率 [100, 100, 0] では3段目まで進んで失敗する', async () => {
  const { engine } = setup({ default: door({ chance1: 100, chance2: 100, chance3: 0, resultSeconds: 0.05 }) });
  engine.apply('default', 'start');
  engine.choose('default', 1);
  await sleep(30);
  assert.equal(engine.get('default').stage, 2);
  engine.choose('default', 1);
  await sleep(30);
  assert.equal(engine.get('default').stage, 3);
  assert.equal(engine.get('default').phase, 'pick');
  engine.choose('default', 1);
  await sleep(30);
  assert.equal(engine.get('default').phase, 'failed');
  assert.equal(engine.get('default').clears, 0);
  engine.close();
});

test('選べないとき: 待機中の選択と、1・2 以外の番号はエラー', () => {
  const { engine } = setup();
  assert.equal(engine.choose('default', 1).ok, false, '待機中は選べない');
  engine.apply('default', 'start');
  assert.equal(engine.choose('default', 3).ok, false);
  assert.equal(engine.choose('default', 0).ok, false);
  assert.throws(() => engine.apply('default', 'pick', 3), /扉は 1/);
  assert.throws(() => engine.apply('default', 'start'), /挑戦中/, '挑戦中の start はエラー');
  engine.close();
});

test('reset で待機に戻り、挑戦の数と突破の数は残る', async () => {
  const { engine } = setup({ default: door({ chance1: 100, chance2: 100, chance3: 100, resultSeconds: 60 }) });
  engine.apply('default', 'start');
  engine.choose('default', 1);
  await sleep(30);
  engine.choose('default', 1);
  await sleep(30);
  engine.choose('default', 1);
  await sleep(30);
  assert.equal(engine.get('default').phase, 'clear');
  engine.apply('default', 'reset');
  const d = engine.get('default');
  assert.equal(d.phase, 'idle');
  assert.equal(d.plays, 1);
  assert.equal(d.clears, 1);
  engine.close();
});

test('保存と読み込み: 挑戦の数・突破の数は残り、進行は待機に戻る', async () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tw-door-')), 'doors.json');
  const first = setup({ default: door({ chance1: 100, chance2: 100, chance3: 100, resultSeconds: 60 }) }, file);
  first.engine.apply('default', 'start');
  first.engine.choose('default', 1);
  await sleep(30);
  first.engine.choose('default', 1);
  await sleep(30);
  first.engine.choose('default', 1);
  await sleep(30);
  assert.equal(first.engine.get('default').phase, 'clear');
  first.engine.flush();
  first.engine.close();
  const second = setup({ default: door() }, file);
  const d = second.engine.get('default');
  assert.equal(d.plays, 1);
  assert.equal(d.clears, 1);
  assert.equal(d.phase, 'idle', '途中で止まっても挑戦の途中には戻らない');
  second.engine.close();
});

test('開発用の操作（test つき）は知らせの出来事に test が付く', () => {
  const { engine, sent } = setup();
  engine.apply('default', 'start', undefined, { test: true });
  const started = sent.filter((m) => m.type === 'door').at(-1);
  assert.equal(started?.event?.test, true);
  engine.close();
});
