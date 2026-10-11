import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WinsEngine, lossTier } from '../src/wins.js';
import { defaultsFor } from '../src/schema.js';
import { normalize } from '../src/config.js';

const counter = (over = {}) => ({ ...defaultsFor('wins'), ...over });

function setup(config = { default: counter() }) {
  const hub = new EventEmitter();
  const sent = [];
  hub.broadcast = (msg) => sent.push(msg);
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'tw-wins-')), 'wins.json');
  const wins = new WinsEngine(hub, file);
  wins.setConfig(config);
  return { hub, wins, sent, file };
}
const gift = (name, count = 1, coins = 1) => ({ kind: 'gift', user: { id: 'u1', name: 'たろう' }, gift: { name, id: '1', count }, totalDiamonds: coins * count });

test('クリアで +1、add で増減、negative: false なら 0 より下には行かない', () => {
  const { wins } = setup({ default: counter({ negative: false }) });
  wins.apply('default', 'win');
  wins.apply('default', 'win');
  wins.apply('default', 'add', -1);
  assert.equal(wins.get('default').wins, 1);
  wins.apply('default', 'add', -5);
  assert.equal(wins.get('default').wins, 0);
});

test('初期設定ではマイナス WIN まで減る', () => {
  const { wins, hub } = setup({ default: counter({ rules: [{ gifts: ['Lion'], add: -1 }] }) });
  wins.apply('default', 'add', -2);
  hub.emit('event', gift('Lion', 2));
  assert.equal(wins.get('default').wins, -4);
  wins.apply('default', 'set', -7);
  assert.equal(wins.get('default').wins, -7);
});

test('1つ戻すと前の数に戻る（ギフトで減ったのも戻せる）', () => {
  const { wins, hub } = setup({ default: counter({ rules: [{ gifts: ['Lion'], add: -1 }] }) });
  wins.apply('default', 'set', 4);
  hub.emit('event', gift('lion'));
  assert.equal(wins.get('default').wins, 3);
  wins.apply('default', 'undo');
  assert.equal(wins.get('default').wins, 4);
});

test('ギフトのルール: 上から最初に合ったもの、add は個数分', () => {
  const rules = [
    { gifts: ['Universe'], set: 0 },
    { gifts: ['Lion'], add: -1, text: '妨害成功' },
    { gifts: ['GG'], add: 1, perCount: false },
    { minCoins: 1000, add: -1 },
  ];
  const { wins, hub, sent } = setup({ default: counter({ rules }) });
  wins.apply('default', 'set', 10);
  hub.emit('event', gift('Lion', 3, 29999));
  assert.equal(wins.get('default').wins, 7); // Lion ×3 で -3（minCoins のルールは使わない）
  assert.equal(sent.at(-1).event.by.text, '妨害成功');
  assert.equal(sent.at(-1).event.delta, -3);
  hub.emit('event', gift('GG', 5));
  assert.equal(wins.get('default').wins, 8); // perCount: false で1回だけ
  hub.emit('event', gift('Galaxy', 1, 1000));
  assert.equal(wins.get('default').wins, 7);
  hub.emit('event', gift('Universe'));
  assert.equal(wins.get('default').wins, 0);
  hub.emit('event', gift('Rose'));
  assert.equal(wins.get('default').wins, 0);
});

test('名前を省くと全部、知らない名前はエラー、数はファイルに残る', () => {
  const { wins, file, hub } = setup({ a: counter(), b: counter() });
  wins.apply(null, 'win');
  assert.equal(wins.get('a').wins, 1);
  assert.equal(wins.get('b').wins, 1);
  assert.throws(() => wins.apply('c', 'win'), /c/);
  assert.throws(() => wins.apply('a', 'add', 'x'));
  assert.throws(() => wins.apply('a', 'jump'));
  assert.equal(new WinsEngine(hub, file).get('a').wins, 1);
});

test('rules の書き方を確かめる', () => {
  const { config, errors, warnings } = normalize({
    wins: {
      default: {
        rules: [{ gifts: ['Lion'], add: -1 }, { gifts: ['Universe'], set: 0 }, { gifts: ['GG'] }, { gifts: ['Rose'], add: 1, set: 2 }, { add: 1.5 }],
      },
    },
  });
  assert.deepEqual(config.wins.default.rules[0], { gifts: ['Lion'], add: -1 });
  assert.deepEqual(config.wins.default.rules[1], { gifts: ['Universe'], set: 0 });
  assert.equal(errors.length, 4); // add/set がない・両方ある・整数でない（その結果 add/set もない）
  assert.ok(warnings.some((w) => w.includes('条件')));
});

test('reset: true は 0 に戻すルール、ボタンのリセットも 1つ戻すで戻せる', () => {
  const { config, errors } = normalize({ wins: { default: { rules: [{ gifts: ['Universe'], reset: true }] } } });
  assert.deepEqual(errors, []);
  assert.deepEqual(config.wins.default.rules[0], { gifts: ['Universe'], set: 0 });
  const { wins, hub } = setup({ default: counter({ rules: config.wins.default.rules }) });
  wins.apply('default', 'set', 6);
  hub.emit('event', gift('Universe'));
  assert.equal(wins.get('default').wins, 0);
  wins.apply('default', 'undo');
  wins.apply('default', 'reset');
  assert.equal(wins.get('default').wins, 0);
  wins.apply('default', 'undo');
  assert.equal(wins.get('default').wins, 6);
});

test('いちばん下まで行った数（最低記録）を覚える。リセットで 0、1つ戻すで戻る', () => {
  const { wins } = setup();
  wins.apply('default', 'add', -3);
  wins.apply('default', 'add', 5);
  assert.deepEqual([wins.get('default').wins, wins.get('default').low], [2, -3]);
  wins.apply('default', 'add', -6);
  assert.equal(wins.get('default').low, -4);
  wins.apply('default', 'undo');
  assert.equal(wins.get('default').low, -3);
  wins.apply('default', 'reset');
  assert.equal(wins.get('default').low, 0);
});

test('演出の段階: プリセットで境目が変わり、連続妨害でも上がる', () => {
  assert.equal(lossTier({}, -9), 0);
  assert.equal(lossTier({}, -10), 1);
  assert.equal(lossTier({ lossPreset: 'large' }, -1000), 3);
  assert.equal(lossTier({ lossPreset: 'small' }, -1), 1);
  assert.equal(lossTier({ lossPreset: 'small' }, -5), 3);
  assert.equal(lossTier({ lossPreset: 'medium' }, -10), 2);
  assert.equal(lossTier({ lossPreset: 'custom', bigLoss: 2, hugeLoss: 4, ruinLoss: 6 }, -4), 2);
  // 連続妨害 ×3 で1段、×5 で2段、×8 で3段
  assert.equal(lossTier({}, -1, 3), 1);
  assert.equal(lossTier({}, -1, 5), 2);
  assert.equal(lossTier({}, -1, 8), 3);
  assert.equal(lossTier({ comboUp: false }, -1, 8), 0);
});

test('減るたびに連続妨害の数と段階をウィジェットに送る（戻す・手で入れ直すは数えない）', () => {
  const { wins, sent } = setup({ default: counter({ lossPreset: 'small' }) });
  wins.apply('default', 'add', -1);
  wins.apply('default', 'add', -1);
  wins.apply('default', 'add', -3);
  assert.deepEqual(pickEvent(sent.at(-1)), { combo: 3, tier: 2 });
  wins.apply('default', 'undo');
  assert.equal(sent.at(-1).event.combo, undefined);
  wins.apply('default', 'set', -10);
  assert.equal(sent.at(-1).event.tier, undefined);
});

function pickEvent(msg) {
  return { combo: msg.event.combo, tier: msg.event.tier };
}
