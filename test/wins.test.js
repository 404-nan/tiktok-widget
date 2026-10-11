import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { WinsEngine } from '../src/wins.js';
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

test('クリアで +1、add で増減、0 より下には行かない', () => {
  const { wins } = setup();
  wins.apply('default', 'win');
  wins.apply('default', 'win');
  wins.apply('default', 'add', -1);
  assert.equal(wins.get('default').wins, 1);
  wins.apply('default', 'add', -5);
  assert.equal(wins.get('default').wins, 0);
});

test('negative: true ならマイナスまで減る', () => {
  const { wins } = setup({ default: counter({ negative: true }) });
  wins.apply('default', 'add', -2);
  assert.equal(wins.get('default').wins, -2);
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
