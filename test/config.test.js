import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 本物の config.yaml を触らないよう、一時ファイルを使う
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-config-'));
process.env.TW_CONFIG = path.join(dir, 'config.yaml');
const cfg = await import('../src/config.js');

before(() => fs.copyFileSync(cfg.EXAMPLE_PATH, cfg.CONFIG_PATH));

test('ひな形はエラーも警告もなく読める', () => {
  const { errors, warnings, config } = cfg.load();
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(config.roulettes.punishment.style, 'wheel');
  // 書かなかった項目は初期値で埋まる
  assert.equal(config.roulettes.punishment.duration, 6);
});

test('項目は「名前*重み」とオブジェクトのどちらでも書ける', () => {
  const { config } = cfg.normalize({ roulettes: { a: { items: ['歌う*3', { label: '変顔', color: 'gold', image: 'media/x.png' }] } } });
  assert.deepEqual(config.roulettes.a.items, [
    { label: '歌う', weight: 3 },
    { label: '変顔', weight: 1, color: 'gold', image: 'media/x.png' },
  ]);
});

test('間違いは場所と直し方つきでエラーになる', () => {
  const { errors, warnings } = cfg.normalize({
    roulettes: { 'bad id': { style: 'round', items: [{ weight: 0 }] } },
    jars: { default: { liquidColor: 'purple', shap: 'heart' } },
  });
  assert.ok(errors.some((e) => e.startsWith('roulettes.bad id: 名前は英数字')));
  assert.ok(errors.some((e) => e.includes('roulettes.bad id.style') && e.includes('wheel / strip')));
  assert.ok(errors.some((e) => e.includes('jars.default.liquidColor')));
  assert.ok(warnings.some((w) => w.startsWith('jars.default.shap')));
});

test('一部だけ書き換えても、コメントとほかの部分はそのまま', () => {
  const before = fs.readFileSync(cfg.CONFIG_PATH, 'utf8');
  const r = cfg.setValue('roulettes.punishment.gifts', ['Rose', 'GG']);
  assert.equal(r.ok, true);
  const after = fs.readFileSync(cfg.CONFIG_PATH, 'utf8');
  assert.equal(after, before.replace('gifts: [Rose]', 'gifts: [Rose, GG]'));
  cfg.setValue('roulettes.punishment.gifts', ['Rose']);
  assert.equal(fs.readFileSync(cfg.CONFIG_PATH, 'utf8'), before);
});

test('エラーになる変更は保存しない', () => {
  const before = fs.readFileSync(cfg.CONFIG_PATH, 'utf8');
  const r = cfg.setValue('theme.mode', 'neon');
  assert.equal(r.ok, false);
  assert.match(r.errors[0], /theme\.mode/);
  assert.equal(fs.readFileSync(cfg.CONFIG_PATH, 'utf8'), before);
});

test('merge は指定したキーだけ変え、削除もできる', () => {
  assert.equal(cfg.mergeValue('roulettes.vip', { gifts: ['Galaxy'], items: ['サイン'] }).ok, true);
  assert.equal(cfg.mergeValue('roulettes.vip', { style: 'strip' }).ok, true);
  const { config } = cfg.load();
  assert.deepEqual(config.roulettes.vip.gifts, ['Galaxy']);
  assert.equal(config.roulettes.vip.style, 'strip');
  assert.equal(cfg.deleteValue('roulettes.vip').ok, true);
  assert.equal(cfg.load().config.roulettes.vip, undefined);
});

test('ウィジェットの URL と推奨サイズ', () => {
  const list = cfg.widgetList(cfg.load().config, 'http://x');
  const reward = list.find((w) => w.section === 'roulettes' && w.id === 'reward');
  assert.equal(reward.url, 'http://x/widgets/roulette.html?ids=reward');
  assert.deepEqual(reward.size, [820, 330]);
  const elixir = list.find((w) => w.section === 'jars' && w.id === 'elixir');
  assert.equal(elixir.url, 'http://x/widgets/gift-jar.html?id=elixir');
});
