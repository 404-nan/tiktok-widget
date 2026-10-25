// 妨害マイクラのギフト表: プロフィールから、ギフトごとに何が起きるかを読む。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { giftTable } from '../src/superstream.js';

test('GiftListener のギフトを、コインの安い順に「何が起きるか」つきで返す', () => {
  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mcg-')), 'p.yml');
  fs.writeFileSync(file, `GiftListener:\n  SubscriberDoubleAction: false\n  '5655':\n    actions:\n      message:\n        messages:\n        - '&e<sender>&f: ゾンビ'\n  '6064':\n    actions:\n      execute:\n        commands: [x]\n  default:\n    actions: {}\n`);
  const out = giftTable(file, { coinOf: (id) => ({ 5655: 1, 6064: 30 })[id] ?? null, nameJaOf: (id) => (id === '5655' ? 'バラ' : null) });
  assert.deepEqual(out.gifts.map((g) => [g.id, g.nameJa, g.coins, g.effect]), [['5655', 'バラ', 1, 'ゾンビ'], ['6064', null, 30, '']]);
});

test('ファイルが無いときは空の表と理由を返す(落ちない)', () => {
  assert.deepEqual(giftTable('').gifts, []);
  assert.match(giftTable('/nope/none.yml').error, /読めませんでした/);
});
