import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// 本物の config.yaml を触らないよう、一時ファイルを使う
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-cardwheel-'));
process.env.TW_CONFIG = path.join(dir, 'config.yaml');
const cfg = await import('../src/config.js');
const { SCHEMA } = await import('../src/schema.js');

test('cardWheel の初期値は大アルカナ22枚で、背景は透明', () => {
  const { config, errors } = cfg.normalize({});
  assert.deepEqual(errors, []);
  assert.equal(config.cardWheel.background, 'transparent');
  assert.equal(config.cardWheel.deck.length, 22);
  assert.equal(config.cardWheel.deck[17].title, 'THE STAR');
  assert.ok(config.cardWheel.deck.every((c) => c.weight === 1 && c.image && c.title));
});

test('deck の差し替えはそのまま通り、足りない項目は初期値で埋まる', () => {
  const { config, errors } = cfg.normalize({
    cardWheel: { deck: [{ title: '当たり', image: 'hit.webp', text: 'おめでとう', weight: 3 }] },
  });
  assert.deepEqual(errors, []);
  assert.equal(config.cardWheel.deck.length, 1);
  assert.deepEqual(config.cardWheel.deck[0], { numeral: '', title: '当たり', subtitle: '', image: 'hit.webp', text: 'おめでとう', weight: 3 });
});

test('deck が空・題名なし・画像なし・重みが負だとエラーになる', () => {
  assert.ok(cfg.normalize({ cardWheel: { deck: [] } }).errors.length > 0);
  assert.ok(cfg.normalize({ cardWheel: { deck: [{ image: 'x.webp' }] } }).errors.some((e) => e.includes('.title')));
  assert.ok(cfg.normalize({ cardWheel: { deck: [{ title: 'x' }] } }).errors.some((e) => e.includes('.image')));
  assert.ok(cfg.normalize({ cardWheel: { deck: [{ title: 'x', image: 'x.webp', weight: -1 }] } }).errors.some((e) => e.includes('.weight')));
});

test('deck の知らない項目は警告になる', () => {
  const { warnings } = cfg.normalize({ cardWheel: { deck: [{ title: 'x', image: 'x.webp', bogus: 1 }] } });
  assert.ok(warnings.some((w) => w.includes('bogus')));
});

test('背景は4通りだけ通る', () => {
  for (const bg of ['transparent', 'chroma', 'solid', 'image']) {
    assert.deepEqual(cfg.normalize({ cardWheel: { background: bg } }).errors, []);
  }
  assert.ok(cfg.normalize({ cardWheel: { background: 'rainbow' } }).errors.length > 0);
});

test('SCHEMA.cardWheel の deck 初期値は検証を通る形をしている', () => {
  const deck = SCHEMA.cardWheel.fields.deck.default;
  const { config, errors, warnings } = cfg.normalize({ cardWheel: { deck } });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
  assert.equal(config.cardWheel.deck.length, 22);
});
