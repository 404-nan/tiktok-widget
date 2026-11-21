// 背景の項目（透明／クロマキー用の色／単色／背景画像）が全ウィジェットに行き渡っていることの固定。
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { SCHEMA, defaultsFor } from '../src/schema.js';
import { normalize } from '../src/config.js';

const EXCLUDED = ['giftSounds', 'obs', 'relayStop', 'minecraft'];

test('画面に出る節には背景の4項目があり、画面に出ない部品には無い', () => {
  for (const [name, section] of Object.entries(SCHEMA)) {
    if (!section.page) continue;
    if (EXCLUDED.includes(name)) {
      assert.equal(section.fields.background, undefined, `${name} は対象外`);
      continue;
    }
    assert.equal(section.fields.background?.type, 'enum', name);
    assert.deepEqual(section.fields.background.values, ['transparent', 'chroma', 'solid', 'image'], name);
    assert.equal(section.fields.background.default, 'transparent', name);
    assert.equal(section.fields.chromaColor?.type, 'color', name);
    assert.equal(section.fields.solidColor?.type, 'color', name);
    assert.equal(section.fields.backgroundImage?.type, 'string', name);
    if (name !== 'puchuns') assert.equal(defaultsFor(name).background, 'transparent', name);
  }
});

test('背景の値が検証を通り、不正な形は初期値に戻る', () => {
  const ok = normalize({ alerts: { default: { background: 'chroma', chromaColor: '#00FF00' } } });
  assert.equal(ok.config.alerts.default.background, 'chroma');
  assert.equal(ok.config.alerts.default.chromaColor, '#00FF00');
  const bad = normalize({ alerts: { default: { background: 'rainbow' } } });
  assert.equal(bad.config.alerts.default.background, 'transparent');
  assert.ok(bad.errors.some((e) => e.includes('background')));
});

test('前面の共通土台が背景を当てる形になっている', () => {
  const overlay = readFileSync(new URL('../public/widgets/lib/overlay.js', import.meta.url), 'utf8');
  assert.ok(overlay.includes('export function applyPageBackground'), 'overlay.js に applyPageBackground がある');
  assert.ok(overlay.includes('applyBackgroundFromSocket'), 'connect の設定でも背景が効く');
  const gacha = readFileSync(new URL('../public/widgets/gacha.js', import.meta.url), 'utf8');
  assert.ok(gacha.includes("entry.background || 'transparent'"), 'ガチャ系の前面も背景を読む');
  const roulette = readFileSync(new URL('../public/widgets/lib/roulette.js', import.meta.url), 'utf8');
  assert.ok(roulette.includes('applyPageBackground'), 'ルーレットも背景を当てる');
});
