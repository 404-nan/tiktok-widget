import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkActions, parseAction, runActions } from '../src/actions.js';
import { normalize } from '../src/config.js';

test('動作の検証: 種類・秒・枚数・メディア・ダメージ', () => {
  const issues = { errors: [], warnings: [] };
  const ok = checkActions([
    { type: 'timer.add', seconds: -5, id: 'main' },
    { type: 'wins.add', n: 2 },
    { type: 'rush.start' },
    { type: 'media.play', mediaId: 'abc' },
    { type: 'boss.damage', amount: 10 },
    { type: 'boss.heal', amount: 3 },
    { type: 'gacha.start' },
  ], 'actions', issues);
  assert.deepEqual(issues.errors, []);
  assert.equal(ok.length, 7);
  assert.equal(ok[0].seconds, -5);
  assert.equal(ok[0].id, 'main');

  const bad = { errors: [], warnings: [] };
  assert.equal(parseAction({ type: 'timer.add', seconds: 0 }, 'a', bad), null);
  assert.equal(parseAction({ type: 'wins.add', n: 1.5 }, 'a', bad), null);
  assert.equal(parseAction({ type: 'media.play' }, 'a', bad), null);
  assert.equal(parseAction({ type: 'boss.damage', amount: -1 }, 'a', bad), null);
  assert.equal(parseAction({ type: 'nope' }, 'a', bad), null);
  assert.ok(bad.errors.length >= 5);
});

test('1件失敗しても残りは実行する', () => {
  const calls = [];
  const deps = {
    timer: { apply: (...args) => calls.push(['timer', ...args]) },
    wins: { apply: () => { throw new Error('失敗'); } },
    gacha: { start: () => ({ ok: true }) },
    bus: { emit: (...args) => calls.push(['bus', ...args]) },
  };
  const results = runActions([
    { type: 'timer.add', seconds: 5 },
    { type: 'wins.add', n: 1 },
    { type: 'gacha.start' },
    { type: 'nope' },
  ], deps);
  assert.equal(results[0].ok, true);
  assert.equal(results[1].ok, false);
  assert.match(results[1].error, /失敗/);
  assert.equal(results[2].ok, true);
  assert.equal(results[3].ok, false);
  assert.deepEqual(calls[0], ['timer', null, 'add', 5]);
  assert.equal(calls.some((c) => c[0] === 'bus' && c[1] === 'action.error'), true);
  assert.equal(calls.some((c) => c[0] === 'bus' && c[1] === 'action.done'), true);
});

test('古い設定はそのまま読め、動作は項目に残る', () => {
  const old = normalize({
    bosses: { default: { name: '鬼', hp: 5000 } },
    roulettes: { main: { items: ['歌う', { label: '変顔', weight: 2 }] } },
  });
  assert.deepEqual(old.errors, []);
  assert.deepEqual(old.warnings, []);
  assert.equal(old.config.bosses.default.mode, 'hp');
  assert.equal(old.config.bosses.default.rankSource, 'manual');
  assert.equal(old.config.bosses.default.rivalCoins, 0);
  assert.equal(old.config.bosses.default.hp, 5000);
  assert.equal(old.config.mediaAlerts.enabled, true);
  assert.deepEqual(old.config.mediaAlerts.rules, []);
  assert.equal(old.config.gacha.enabled, true);
  assert.equal(old.config.gacha.minCoins, 0);
  assert.equal(old.config.gacha.tiers[2].id, 'legend');
  assert.equal(old.config.gacha.tiers[2].pity, true);
  assert.equal(old.config.roulettes.main.items[0].actions, undefined);

  const round = normalize({
    roulettes: {
      main: {
        items: [{
          label: '歌う',
          actions: [{ type: 'wins.add', n: 1 }, { type: 'timer.add', id: 'clock', seconds: -5 }, { type: 'boss.heal', amount: 0 }],
        }],
      },
    },
  });
  assert.equal(round.config.roulettes.main.items[0].actions.length, 2);
  assert.equal(round.config.roulettes.main.items[0].actions[1].seconds, -5);
  assert.ok(round.errors.some((e) => e.includes('amount')));
});
