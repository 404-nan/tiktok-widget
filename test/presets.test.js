// プリセット基盤の合格条件：切替で発火先が切り替わる／間引きが効く／
// 壊れた規則があっても全体が止まらない（規則単位で無効化して記録）／設定の保存・復元で規則が欠けない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { Presets, parsePresetRule } from '../src/presets.js';
import { normalize } from '../src/config.js';
import { defaultsFor } from '../src/schema.js';

function setup(over = {}, startAt = 1_000_000) {
  const hub = new EventEmitter();
  const sent = [];
  hub.broadcast = (msg) => sent.push(msg);
  const calls = [];
  let now = startAt;
  const presets = new Presets(hub, {
    now: () => now,
    run: (actions, meta) => { calls.push({ actions, meta }); return actions.map(() => ({ ok: true })); },
  });
  presets.setConfig({ ...defaultsFor('presets'), ...over });
  return { hub, presets, calls, sent, setNow: (v) => { now = v; }, getNow: () => now };
}

const taro = { id: 'taro', name: 'たろう' };
const gift = (coins = 10, name = 'Rose') => ({ kind: 'gift', user: taro, gift: { id: '5655', name, diamondCount: coins, count: 1 } });

const AB = {
  active: 'a',
  base: [{ on: 'follow', actions: [{ type: 'wins.add', n: 1 }] }],
  list: [
    { id: 'a', name: 'A', rules: [{ on: 'gift', actions: [{ type: 'gacha.start' }] }] },
    { id: 'b', name: 'B', rules: [{ on: 'gift', actions: [{ type: 'omikuji.start' }] }] },
  ],
};

test('プリセット切替で発火先が切り替わり、基本規則は常時有効', () => {
  const { presets, calls } = setup(AB);
  presets.handleEvent(gift());
  assert.equal(calls.length, 1);
  assert.equal(calls[0].actions[0].type, 'gacha.start');
  assert.equal(calls[0].meta.preset, 'a');
  presets.handleEvent({ kind: 'follow', user: taro });
  assert.equal(calls.length, 2);
  assert.equal(calls[1].actions[0].type, 'wins.add');
  assert.equal(calls[1].meta.preset, '', '基本規則はプリセットに属さない');
  assert.deepEqual(presets.switchTo('b'), { ok: true, active: 'b' });
  presets.handleEvent(gift());
  assert.equal(calls[2].actions[0].type, 'omikuji.start');
  assert.equal(calls[2].meta.preset, 'b');
  assert.equal(presets.switchTo('zzz').ok, false, '無いプリセットには切り替わらない');
  assert.deepEqual(presets.switchTo(''), { ok: true, active: '' });
  presets.handleEvent(gift());
  assert.equal(calls.length, 3, 'プリセット無しではギフト規則は発火しない');
  presets.handleEvent({ kind: 'follow', user: taro });
  assert.equal(calls.length, 4, '基本規則はプリセット無しでも発火する');
  presets.close();
});

test('間引き（cooldownSec）が効く', () => {
  const { presets, calls, setNow, getNow } = setup({
    base: [{ on: 'gift', cooldownSec: 60, actions: [{ type: 'wins.add', n: 1 }] }],
  });
  const t0 = getNow();
  presets.handleEvent(gift());
  assert.equal(calls.length, 1);
  setNow(t0 + 30_000);
  presets.handleEvent(gift());
  assert.equal(calls.length, 1, '60秒以内の連続発火は間引かれる');
  setNow(t0 + 61_000);
  presets.handleEvent(gift());
  assert.equal(calls.length, 2, '間隔が空けばまた発火する');
  presets.close();
});

test('条件：ギフト名・最低コイン・コメントの語・いいね到達', () => {
  const { presets, calls } = setup({
    base: [
      { on: 'gift', gift: 'Rose', minCoins: 100, actions: [{ type: 'wins.add', n: 1 }] },
      { on: 'chat', keyword: '参加', actions: [{ type: 'wins.add', n: 2 }] },
      { on: 'like', every: 100, actions: [{ type: 'wins.add', n: 3 }] },
    ],
  });
  presets.handleEvent(gift(50));
  assert.equal(calls.length, 0, '最低コイン未満では発火しない');
  presets.handleEvent(gift(150, 'Lion'));
  assert.equal(calls.length, 0, 'ギフト名が違えば発火しない');
  presets.handleEvent(gift(150));
  assert.equal(calls.length, 1);
  presets.handleEvent({ kind: 'chat', user: taro, text: 'こんにちは' });
  assert.equal(calls.length, 1);
  presets.handleEvent({ kind: 'chat', user: taro, text: '参加します' });
  assert.equal(calls.length, 2);
  presets.handleEvent({ kind: 'like', user: taro, count: 60 });
  assert.equal(calls.length, 2, '100に届くまでは発火しない');
  presets.handleEvent({ kind: 'like', user: taro, count: 50 });
  assert.equal(calls.length, 3, '累計100を越えたら発火する');
  presets.handleEvent({ kind: 'like', user: taro, count: 30 });
  assert.equal(calls.length, 3, '次の区切りまでは発火しない');
  presets.close();
});

test('壊れた規則があっても全体は止まらず、その規則だけ無効化して記録する', () => {
  const { presets, calls } = setup({
    active: 'x',
    list: [{
      id: 'x', name: 'X',
      rules: [
        { on: 'bogus', actions: [{ type: 'wins.add', n: 1 }] },
        { on: 'gift', actions: [{ type: 'nope.start' }] },
        { on: 'gift', actions: [{ type: 'wins.add', n: 5 }] },
      ],
    }],
  });
  const snap = presets.snapshot();
  assert.equal(snap.disabled.length, 2, '壊れた2件が記録される');
  assert.equal(snap.presets[0].rules, 1, '正しい規則だけが残る');
  assert.doesNotThrow(() => presets.handleEvent(gift()));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].actions[0].n, 5);
  presets.close();
});

test('設定の保存・復元（normalize）で規則が欠けない', () => {
  const { config, errors } = normalize({
    presets: {
      active: 'a',
      base: [{ on: 'follow', actions: [{ type: 'wins.add', n: 1 }] }],
      list: [{ id: 'a', name: 'A', rules: [{ on: 'gift', gift: 'Rose', minCoins: 10, cooldownSec: 30, actions: [{ type: 'timer.add', seconds: 60 }] }] }],
    },
  });
  assert.deepEqual(errors, []);
  assert.equal(config.presets.active, 'a');
  assert.deepEqual(config.presets.base, [{ on: 'follow', cooldownSec: 0, actions: [{ type: 'wins.add', n: 1 }] }]);
  assert.deepEqual(config.presets.list[0].rules, [{ on: 'gift', gift: 'Rose', minCoins: 10, cooldownSec: 30, actions: [{ type: 'timer.add', seconds: 60 }] }]);
});

test('設定の検証でも、壊れた規則は警告つきで落とし、全体は通る', () => {
  const { config, errors, warnings } = normalize({
    presets: {
      base: [
        { on: 'xxx', actions: [{ type: 'wins.add', n: 1 }] },
        { on: 'follow', actions: [{ type: 'wins.add', n: 2 }] },
      ],
    },
  });
  assert.deepEqual(errors, []);
  assert.equal(config.presets.base.length, 1);
  assert.equal(config.presets.base[0].actions[0].n, 2);
  assert.ok(warnings.some((w) => w.includes('無効化')), '落としたことが記録される');
});

test('コメントコマンドで切り替えられる（任意・設定したときだけ）', () => {
  const { presets } = setup({ ...AB, active: 'a', switchCommand: '!プリセット' });
  presets.handleEvent({ kind: 'chat', user: taro, text: '!プリセット b' });
  assert.equal(presets.activeId(), 'b');
  const off = setup({ ...AB, active: 'a' });
  off.presets.handleEvent({ kind: 'chat', user: taro, text: '!プリセット b' });
  assert.equal(off.presets.activeId(), 'a', 'switchCommand が空なら切り替わらない');
  presets.close();
  off.presets.close();
});

test('テスト送信とデモでは発火しない。parsePresetRule の形も確かめる', () => {
  const { presets, calls } = setup({ base: [{ on: 'follow', actions: [{ type: 'wins.add', n: 1 }] }] });
  presets.handleEvent({ kind: 'follow', user: taro, test: true });
  presets.handleEvent({ kind: 'follow', user: { id: 'demo_1', name: 'デモ' } });
  assert.equal(calls.length, 0);
  presets.handleEvent({ kind: 'follow', user: taro });
  assert.equal(calls.length, 1);
  const bad = parsePresetRule({ on: 'gift', actions: [] });
  assert.equal(bad.rule, null);
  assert.ok(bad.errors.length > 0);
  presets.close();
});
