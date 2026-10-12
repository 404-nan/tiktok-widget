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
const readPresetOrFail = (id) => presets.readPreset(id) ?? assert.fail(`${id} がありません`);

test('ひな形はどれもエラーも警告もない', () => {
  const list = presets.listPresets();
  assert.ok(list.length >= 3);
  for (const p of list) {
    const { errors, warnings } = presets.checkPreset(p);
    assert.deepEqual(errors, [], p.id);
    assert.deepEqual(warnings, [], p.id);
  }
});

test('妨害マイクラのひな形: 1 回で動く WIN は最大 ±100、-100 は連打しても 1 回だけ、救済もある', () => {
  for (const id of ['bougai-endra', 'bougai-diamond', 'bougai-parkour']) {
    const p = readPresetOrFail(id);
    const rules = p.config.wins.default.rules;
    const adds = rules.map((r) => r.add).filter((n) => n != null);
    assert.ok(adds.includes(-1) && adds.includes(-100), id);
    assert.ok(adds.every((n) => Math.abs(n) <= 100), id);
    assert.ok(rules.filter((r) => r.add === -100).every((r) => r.perCount === false), id);
    assert.ok(rules.some((r) => r.add > 0 && r.text?.includes('救済')), id);
    // WIN ガチャも ±100 まで
    for (const ro of Object.values(p.config.roulettes ?? {})) for (const it of ro.items) if (it.wins) assert.ok(Math.abs(it.wins) <= 100, `${id} ${ro.name}`);
  }
});

test('サバイバルのひな形は、99 コイン未満のギフトでは WIN が動かない（分析スプシの傾向）', () => {
  const coins = JSON.parse(fs.readFileSync(new URL('../src/data/gifts-jp.json', import.meta.url))).gifts;
  for (const id of ['bougai-endra', 'bougai-diamond']) {
    for (const r of readPresetOrFail(id).config.wins.default.rules) for (const g of r.gifts) assert.ok(coins[g] >= 99, `${id}: ${g}`);
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
  assert.ok(!('punishment' in config.roulettes)); // 前の罰ゲームルーレットは消える
  assert.ok('bougai' in config.roulettes && 'wingacha' in config.roulettes);
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
