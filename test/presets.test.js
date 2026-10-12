import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 本物の config.yaml と data/ を触らないよう、一時フォルダを使う
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-presets-'));
process.env.TW_CONFIG = path.join(dir, 'config.yaml');
process.env.TW_DATA = path.join(dir, 'data');
const cfg = await import('../src/config.js');
const presets = await import('../src/presets.js');

beforeEach(() => fs.copyFileSync(cfg.EXAMPLE_PATH, cfg.CONFIG_PATH));

test('ひな形はどれもエラーも警告もない', () => {
  const list = presets.listPresets();
  assert.ok(list.length >= 3);
  for (const p of list) {
    const { errors, warnings } = presets.checkPreset(p);
    assert.deepEqual(errors, [], p.id);
    assert.deepEqual(warnings, [], p.id);
  }
});

test('妨害マイクラのひな形は -1・-10・-100 で減り、-100 より大きくは減らない', () => {
  for (const id of ['bougai-endra', 'bougai-diamond', 'bougai-parkour']) {
    const rules = presets.readPreset(id).config.wins.default.rules;
    const losses = rules.filter((r) => r.add < 0).map((r) => r.add);
    assert.deepEqual([...new Set(losses)].sort((a, b) => a - b), [-100, -10, -1], id);
    // -100 は連打しても 1 回だけ
    assert.ok(rules.filter((r) => r.add === -100).every((r) => r.perCount === false), id);
    assert.ok(rules.some((r) => r.add > 0 && r.text === '救済'), id);
  }
});

test('切り替えると wins・roulettes は入れ替わり、RCON の接続設定は残る', () => {
  cfg.setValue('minecraft.password', 'secret');
  cfg.setValue('minecraft.enabled', true);
  const r = presets.applyPreset('bougai-endra');
  assert.equal(r.ok, true, r.errors?.join('\n'));
  const { config, errors } = cfg.load();
  assert.deepEqual(errors, []);
  assert.equal(config.minecraft.password, 'secret');
  assert.equal(config.minecraft.enabled, true);
  assert.ok(config.minecraft.rules.some((x) => x.gifts?.includes('Rose')));
  assert.deepEqual(Object.keys(config.roulettes), ['bougai']); // 前の罰ゲームルーレットは消える
  assert.equal(config.wins.default.goal, 3);
  assert.equal(config.wins.default.lossPreset, 'custom');
  // 切り替えに関係ないセクションとコメントはそのまま
  assert.equal(config.rankings.likes.limit, 3);
  assert.match(cfg.readText(), /# ランキング/);
  // 前の設定が残っている
  assert.ok(fs.existsSync(r.backup));
  assert.match(fs.readFileSync(r.backup, 'utf8'), /punishment:/);
  assert.equal(presets.currentPreset().id, 'bougai-endra');
});

test('目標の WIN 数は切り替えるときに決められる', () => {
  assert.equal(presets.applyPreset('bougai-diamond', { goal: 7 }).ok, true);
  assert.equal(cfg.load().config.wins.default.goal, 7);
});

test('ないひな形・おかしな名前は何も書き換えない', () => {
  const before = cfg.readText();
  assert.equal(presets.applyPreset('nothing-here').ok, false);
  assert.equal(presets.applyPreset('../config').ok, false);
  assert.equal(cfg.readText(), before);
});

test('ひな形の間違いは場所つきで分かる', () => {
  const { errors } = presets.checkPreset({
    id: 'x',
    name: 'x',
    config: { wins: { default: { rules: [{ gifts: ['Rose'], add: 'many' }] } } },
    buttons: [{ label: '' }],
    layout: [{ widget: 'nope', x: 0, y: 0, w: 1, h: 1 }],
  });
  assert.ok(errors.some((e) => e.startsWith('config.wins.default.rules[0].add')));
  assert.ok(errors.some((e) => e.startsWith('buttons[0]')));
  assert.ok(errors.some((e) => e.startsWith('layout[0].widget')));
});
