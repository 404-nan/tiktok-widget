// カードめくりの天井（全体 pity／個人 pityPersonal）：おみくじと同じ意味で、
// 当たりが出ない回数が設定値に届いたら次の1回は当たり確定。数えは配信の中だけ、
// 当たりで 0 に戻り、テスト送信では進まず、保存先があれば再起動でも消えない。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { CardDraw } from '../src/card-draw.js';
import { defaultsFor } from '../src/schema.js';

function makeHub() {
  const hub = new EventEmitter();
  hub.sent = [];
  hub.broadcast = (m) => hub.sent.push(m);
  return hub;
}

async function waitPhase(draw, phase, timeout = 3000) {
  const t0 = Date.now();
  while (draw.phase !== phase) {
    if (Date.now() - t0 > timeout) throw new Error(`phase が ${phase} にならない（今は ${draw.phase}）`);
    await new Promise((r) => setTimeout(r, 5));
  }
}

const BASE = { count: 4, showMs: 0, shuffleMs: 0, pickSeconds: 60, revealMs: 0, doneMs: 0 };

/** 1回めくって結果（win / forced）を返す */
async function play(draw, user, pick = 1) {
  draw.start({ kind: 'gift', user, giftLabel: 'Rose' });
  await waitPhase(draw, 'pick');
  draw.onEvent({ kind: 'chat', text: String(pick), user });
  await waitPhase(draw, 'reveal');
  const out = { win: draw.round.win, forced: draw.round.forced };
  await waitPhase(draw, 'idle');
  return out;
}

test('初期値はどちらも 0（無効）で、設定しなければ何回外れても確定しない', async () => {
  assert.equal(defaultsFor('cardDraw').pity, 0);
  assert.equal(defaultsFor('cardDraw').pityPersonal, 0);
  const draw = new CardDraw(makeHub(), { random: () => 0.99 });
  draw.setConfig({ ...BASE, winRate: 0 });
  const user = { id: 'u1', name: 'ゆず' };
  for (let i = 0; i < 5; i++) {
    const r = await play(draw, user);
    assert.equal(r.win, false);
    assert.equal(r.forced, false);
  }
  draw.close();
});

test('全体の天井：設定回数だけ外れたら次の1回は当たり確定で、数えは 0 に戻る', async () => {
  const draw = new CardDraw(makeHub(), { random: () => 0.99 });
  draw.setConfig({ ...BASE, winRate: 0, pity: 3 });
  const user = { id: 'u1', name: 'ゆず' };
  for (let i = 1; i <= 3; i++) {
    const r = await play(draw, user);
    assert.equal(r.win, false);
    assert.equal(draw.pityCount, i);
    assert.equal(draw.snapshot().pityLeft, 3 - i);
  }
  const r = await play(draw, user);
  assert.equal(r.forced, true);
  assert.equal(r.win, true);
  assert.equal(draw.pityCount, 0);
  assert.equal(draw.snapshot().pityLeft, 3);
  draw.close();
});

test('個人の天井：その人だけ数え、届いたらその人の次が確定。他の人の数えは残る', async () => {
  const draw = new CardDraw(makeHub(), { random: () => 0.99 });
  draw.setConfig({ ...BASE, winRate: 0, pityPersonal: 2 });
  const a = { id: 'ua', name: 'A' };
  const b = { id: 'ub', name: 'B' };
  await play(draw, a);
  await play(draw, a);
  assert.equal(draw.pityUsers.get('id:ua'), 2);
  await play(draw, b);
  assert.equal(draw.pityUsers.get('id:ub'), 1);
  const r = await play(draw, a);
  assert.equal(r.forced, true);
  assert.equal(r.win, true);
  assert.equal(draw.pityUsers.has('id:ua'), false); // 当たった本人の数えは消える
  assert.equal(draw.pityUsers.get('id:ub'), 1); // 他の人の数えは残る
  draw.close();
});

test('当たりが出たら全体の数えは 0 に戻る（枚数方式の自然な当たりでも）', async () => {
  const draw = new CardDraw(makeHub(), { random: () => 0.99 });
  draw.setConfig({ ...BASE, winRate: 0, pity: 5 });
  const user = { id: 'u1', name: 'ゆず' };
  await play(draw, user);
  await play(draw, user);
  assert.equal(draw.pityCount, 2);
  draw.setConfig({ ...BASE, winCount: 4, pity: 5 }); // 全部当たりの並び（裏）
  const r = await play(draw, user);
  assert.equal(r.win, true);
  assert.equal(r.forced, false);
  assert.equal(draw.pityCount, 0);
  draw.close();
});

test('枚数方式（winCount）でも天井は効く。当たりが0枚の設定でも天井の回は当たりになる', async () => {
  const draw = new CardDraw(makeHub(), { random: () => 0.99 });
  draw.setConfig({ ...BASE, winCount: 0, pity: 2 });
  const user = { id: 'u1', name: 'ゆず' };
  const first = await play(draw, user, 2);
  assert.equal(first.win, false);
  await play(draw, user); // 2回目の外れで数えが 2 に届く
  assert.equal(draw.pityCount, 2);
  const r = await play(draw, user, 3);
  assert.equal(r.forced, true);
  assert.equal(r.win, true);
  assert.equal(draw.pityCount, 0);
  draw.close();
});

test('枚数方式の天井では、選んだ位置へ当たりが寄り、当たりの総数は変わらない', async () => {
  const draw = new CardDraw(makeHub(), { random: () => 0.999 });
  const user = { id: 'u1', name: 'ゆず' };
  // random 0.999 では裏の並びは [当たり, ハズレ, ハズレ, ハズレ] のまま。3番（ハズレ）を選んで外す
  draw.setConfig({ ...BASE, winCount: 1, pity: 1 });
  const first = await play(draw, user, 3);
  assert.equal(first.win, false);
  assert.equal(draw.pityCount, 1);
  // 次は天井の回。同じく3番を選ぶと、当たりが3番へ寄って総数1のまま当たる
  draw.setConfig({ ...BASE, winCount: 1, pity: 1, revealMs: 10000 });
  draw.start({ kind: 'gift', user, giftLabel: 'Rose' });
  await waitPhase(draw, 'pick');
  draw.onEvent({ kind: 'chat', text: '3', user });
  await waitPhase(draw, 'reveal');
  assert.equal(draw.round.forced, true);
  assert.equal(draw.round.win, true);
  assert.equal(draw.round.reals[2], true);
  assert.equal(draw.round.reals.filter(Boolean).length, 1);
  draw.close();
});

test('確率 0 でも天井の回は、めくれたカードが当たりの顔で出る', async () => {
  const hub = makeHub();
  const draw = new CardDraw(hub, { random: () => 0.99 });
  const user = { id: 'u1', name: 'ゆず' };
  draw.setConfig({ ...BASE, winRate: 0, pity: 1 });
  const first = await play(draw, user, 2);
  assert.equal(first.win, false);
  assert.equal(draw.pityCount, 1);
  // 天井の回。結果の知らせで、選んだ位置の顔が当たりになっていること
  draw.setConfig({ ...BASE, winRate: 0, pity: 1, revealMs: 10000 });
  draw.start({ kind: 'gift', user, giftLabel: 'Rose' });
  await waitPhase(draw, 'pick');
  draw.onEvent({ kind: 'chat', text: '2', user });
  await waitPhase(draw, 'reveal');
  const last = hub.sent.at(-1);
  assert.equal(last.round.result.win, true);
  assert.equal(last.round.faces[1], true);
  draw.close();
});

test('結果の記録に、天井で当たった回は forced の印が付く', async () => {
  const results = [];
  const draw = new CardDraw(makeHub(), { random: () => 0.99, onResult: (r) => results.push(r) });
  draw.setConfig({ ...BASE, winRate: 0, pity: 1 });
  const user = { id: 'u1', name: 'ゆず' };
  await play(draw, user);
  const r = await play(draw, user);
  assert.equal(r.forced, true);
  assert.equal(results.length, 2);
  assert.equal(results[0].forced, false);
  assert.equal(results[1].forced, true);
  assert.equal(results[1].win, true);
  draw.close();
});

test('テスト送信のめくりでは天井の数えは進まない', async () => {
  const draw = new CardDraw(makeHub(), { random: () => 0.99 });
  draw.setConfig({ ...BASE, winRate: 0, pity: 2, pityPersonal: 2 });
  const user = { id: 'u1', name: 'ゆず' };
  draw.start({ kind: 'gift', test: true, user, giftLabel: 'Rose' });
  await waitPhase(draw, 'pick');
  draw.onEvent({ kind: 'chat', text: '1', user });
  await waitPhase(draw, 'reveal');
  assert.equal(draw.round.win, false);
  await waitPhase(draw, 'idle');
  assert.equal(draw.pityCount, 0);
  assert.equal(draw.pityUsers.size, 0);
  draw.close();
});

test('配信が終わると数えは 0 に戻る。接続し直しの途中では戻らない', async () => {
  const hub = makeHub();
  const draw = new CardDraw(hub, { random: () => 0.99 });
  draw.setConfig({ ...BASE, winRate: 0, pity: 9, pityPersonal: 9 });
  const user = { id: 'u1', name: 'ゆず' };
  hub.emit('status', { mode: 'live' });
  await play(draw, user);
  await play(draw, user);
  assert.equal(draw.pityCount, 2);
  hub.emit('status', { mode: 'connecting' });
  assert.equal(draw.pityCount, 2);
  hub.emit('status', { mode: 'error' });
  assert.equal(draw.pityCount, 2);
  hub.emit('status', { mode: 'ended' });
  assert.equal(draw.pityCount, 0);
  assert.equal(draw.pityUsers.size, 0);
  draw.close();
});

test('数えは保存され、作り直しても（再起動でも）残る', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'card-pity-'));
  const file = path.join(dir, 'card-draw-pity.json');
  const user = { id: 'u1', name: 'ゆず' };
  const first = new CardDraw(makeHub(), { random: () => 0.99, storeFile: file });
  first.setConfig({ ...BASE, winRate: 0, pity: 9, pityPersonal: 9 });
  await play(first, user);
  await play(first, user);
  first.close();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.equal(saved.version, 1);
  assert.equal(saved.pityCount, 2);
  assert.equal(saved.pityUsers['id:u1'], 2);
  const second = new CardDraw(makeHub(), { random: () => 0.99, storeFile: file });
  assert.equal(second.pityCount, 2);
  assert.equal(second.pityUsers.get('id:u1'), 2);
  second.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
