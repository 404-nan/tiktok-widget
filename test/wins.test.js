import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WinsEngine } from '../src/wins.js';
import { normalizeBattle } from '../src/normalize.js';
import { defaultsFor } from '../src/schema.js';

function setup(config = { default: { ...defaultsFor('wins') } }) {
  const hub = new EventEmitter();
  const sent = [];
  hub.broadcast = (msg) => sent.push(msg);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tw-wins-')), 'wins.json');
  const wins = new WinsEngine(hub, file);
  wins.setConfig(config);
  return { hub, wins, sent, file };
}

test('勝ちで連勝と勝ち数が増え、負けで連勝だけ 0 に戻る', () => {
  const { wins } = setup();
  wins.apply('default', 'win');
  wins.apply('default', 'win');
  wins.apply('default', 'draw');
  wins.apply('default', 'win');
  assert.deepEqual(pick(wins.get('default')), { wins: 3, losses: 0, draws: 1, streak: 3, best: 3 });
  wins.apply('default', 'lose');
  wins.apply('default', 'win');
  assert.deepEqual(pick(wins.get('default')), { wins: 4, losses: 1, draws: 1, streak: 1, best: 3 });
});

test('1つ戻すと前の状態に戻る（連勝が途切れたのも戻せる）', () => {
  const { wins } = setup();
  for (let i = 0; i < 4; i++) wins.apply('default', 'win');
  wins.apply('default', 'lose');
  assert.equal(wins.get('default').streak, 0);
  wins.apply('default', 'undo');
  assert.equal(wins.get('default').streak, 4);
  assert.equal(wins.get('default').losses, 0);
});

test('set は連勝モードなら連勝数、それ以外は勝ち数に入る', () => {
  const { wins } = setup({ a: { ...defaultsFor('wins') }, b: { ...defaultsFor('wins'), mode: 'total' } });
  wins.apply('a', 'set', { value: 7 });
  wins.apply('b', 'set', { value: 12 });
  assert.equal(wins.get('a').streak, 7);
  assert.equal(wins.get('a').best, 7);
  assert.equal(wins.get('b').wins, 12);
  assert.throws(() => wins.apply('a', 'jump'));
});

test('名前を省くと設定にある全部が変わり、ファイルに残る', () => {
  const { wins, file, hub } = setup({ a: { ...defaultsFor('wins') }, b: { ...defaultsFor('wins') } });
  wins.apply(null, 'win');
  assert.equal(wins.get('a').wins, 1);
  assert.equal(wins.get('b').wins, 1);
  const again = new WinsEngine(hub, file);
  assert.equal(again.get('a').wins, 1);
});

test('PK バトルの結果で、pk: true のものだけ数える', () => {
  const { hub, wins, sent } = setup({ a: { ...defaultsFor('wins') }, b: { ...defaultsFor('wins'), pk: false } });
  hub.emit('event', { kind: 'battle', result: 'win', opponent: { name: 'ライバル' } });
  assert.equal(wins.get('a').wins, 1);
  assert.equal(wins.get('b').wins, 0);
  assert.equal(sent.at(-1).event.battle.opponent.name, 'ライバル');
});

// --- TikTok の生データ ---
const anchors = [
  { key: '111', value: { user: { userId: '111', nickName: 'わたし', displayId: 'me', roomId: '900' } } },
  { key: '222', value: { user: { userId: '222', nickName: 'あいて', displayId: 'rival', roomId: '901' } } },
];

test('PK の終わりに、自分（roomId かユーザー名）の結果を取り出す', () => {
  const data = { action: 5, battleId: 'b1', anchorsInfo: anchors, battleResult: { 111: { userId: '111', result: 1, score: '300' }, 222: { userId: '222', result: 0, score: '900' } } };
  const e = normalizeBattle(data, { roomId: '900' });
  assert.equal(e.result, 'lose');
  assert.equal(e.opponent.name, 'あいて');
  assert.deepEqual(e.score, { me: 300, them: 900 });
  assert.equal(normalizeBattle(data, { username: 'RIVAL' }).result, 'win');
  assert.equal(normalizeBattle({ ...data, action: 4 }, { roomId: '900' }), null); // 始まりは数えない
});

test('結果が空なら、最後に届いた点数で比べる', () => {
  const data = { action: 5, battleId: 'b2', anchorsInfo: anchors, battleResult: {} };
  const last = { battleId: 'b2', scores: { 111: 1200, 222: 800 } };
  assert.equal(normalizeBattle(data, { roomId: '900' }, last).result, 'win');
  assert.equal(normalizeBattle(data, { roomId: '900' }, null), null);
});

function pick(c) {
  return { wins: c.wins, losses: c.losses, draws: c.draws, streak: c.streak, best: c.best };
}
