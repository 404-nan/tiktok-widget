// ideas-sync の完成条件(AC-1〜3)を、docs/IDEAS.md の見出しと public/widgets の実物で受け入れる。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const headings = fs.readFileSync(path.join(root, 'docs', 'IDEAS.md'), 'utf8')
  .split('\n').filter((l) => l.startsWith('### '));
const find = (word) => {
  const hit = headings.filter((h) => h.includes(word));
  assert.equal(hit.length, 1, `IDEAS.md の見出しに「${word}」が1つ有る`);
  return hit[0];
};

// 実物が有る演出: 見出しの言葉 → 画面のパス(public/widgets に有る)
const real = {
  'カットイン': ['/widgets/cutin.html', '/widgets/image-cutin.html'],
  '擬似連': ['/widgets/combo.html'],
  'スロット': ['/widgets/slot.html'],
  'ステップアップ': ['/widgets/stepup.html'],
  '群予告': ['/widgets/swarm.html'],
  'PUSH ボタン': ['/widgets/push-button.html'],
  'RUSH': ['/widgets/rush.html'],
  'OBS 連携': ['/widgets/obs-bridge.html'],
};
// 実物が無い演出(public/widgets にも src にも動く処理が無い)
const absent = ['保留変化', '役物落下', 'しきい値の自動調整'];

test('AC-1 実物がある演出は ✅ で、見出しの横に画面のパスがある', () => {
  for (const [word, paths] of Object.entries(real)) {
    const h = find(word);
    assert.ok(h.startsWith('### ✅'), `「${word}」は ✅: ${h}`);
    for (const p of paths) assert.ok(h.includes(p), `「${word}」の見出しに ${p}: ${h}`);
  }
});

test('AC-2 実物が無い演出には ✅ が付いていない', () => {
  for (const word of absent) {
    const h = find(word);
    assert.ok(!h.includes('✅'), `「${word}」に ✅ なし: ${h}`);
  }
});

test('AC-3 ✅ の見出しに書かれた /widgets/*.html が public/widgets に全部ある', () => {
  const done = headings.filter((h) => h.includes('✅'));
  assert.ok(done.length > 0);
  let n = 0;
  for (const h of done) {
    for (const [, p] of h.matchAll(/(\/widgets\/[\w./-]+\.html)/g)) {
      n += 1;
      assert.ok(fs.existsSync(path.join(root, 'public', p)), `${p} がある (${h})`);
    }
  }
  assert.ok(n > 0);
});
