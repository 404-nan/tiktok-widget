// ルーレットの見た目に使う素材画像（public/widgets/img/roulette/）が、そろっていて重すぎないことを確かめる
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { SKINS } from '../public/widgets/lib/roulette-skins.js';
import { defaultsFor, SCHEMA } from '../src/schema.js';

const MAX_BYTES = 400 * 1024; // 配信中に読み込むので、1枚数百KBまで
const read = (file) => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

test('丸型の画像のスキン（カジノ・柔道）は、縁・針・中心・扇の模様の画像がすべてある', () => {
  for (const style of ['casino', 'judo']) {
    const images = SKINS[style].images;
    for (const part of ['rim', 'pointer', 'hub']) assert.ok(images[part], `${style} の ${part}`);
    assert.ok(Object.keys(images).filter((k) => k.startsWith('tex-')).length >= 3, `${style} の扇の模様`);
    for (const url of Object.values(images)) {
      const file = fileURLToPath(url);
      assert.ok(fs.existsSync(file), file);
      assert.ok(fs.statSync(file).size <= MAX_BYTES, `${file} が重すぎる`);
    }
  }
});

test('3本スロットの見た目（slotLook）ごとに、CSS が使う筐体の画像がある', () => {
  assert.deepEqual(SCHEMA.roulettes.fields.slotLook.values, ['neon', 'wa']);
  assert.equal(defaultsFor('roulettes').slotLook, 'neon');
  const css = read('public/widgets/lib/roulette-reel.css');
  for (const look of SCHEMA.roulettes.fields.slotLook.values) {
    const urls = [...css.matchAll(new RegExp(`url\\("?(\\.\\./img/roulette/slot3-${look}/[^")]+)"?\\)`, 'g'))].map((m) => m[1]);
    assert.ok(urls.length >= 3, `${look} の画像が CSS にない`);
    for (const url of urls) {
      const file = fileURLToPath(new URL(url, new URL('../public/widgets/lib/', import.meta.url)));
      assert.ok(fs.existsSync(file), file);
      assert.ok(fs.statSync(file).size <= MAX_BYTES, `${file} が重すぎる`);
    }
  }
});
