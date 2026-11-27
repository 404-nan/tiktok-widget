// 説明していない「待ちを捨てる」ルールを防ぐ。捨てるコードがあるファイルは README の「上限と飛ばすルール」の表に載っていないといけない。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
// 長さを比べてから先頭を捨てる（.shift()）か、満杯で受け付けない（ok: false / 'full'）コード
// 外から持ってきた Three.js（omikuji/three/ の下）だけは、自分たちの待ちの決まりではないので見ない
const VENDOR = path.join(root, 'public/widgets/omikuji/three');
const DROP = /(length\s*>=?\s*[^;\n]+\)\s*[^;\n]*\.shift\(\))|(while\s*\([^)]*length\s*>=?[^)]*\)\s*[^;\n]*\.shift\(\))|(length\s*>=?\s*[A-Z_0-9]+\)\s*return\s*\{\s*ok:\s*false)|(createQueue\([^)]*max:\s*\d+)/;

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return p === VENDOR ? [] : files(p);
    return /\.(js|html)$/.test(d.name) ? [p] : [];
  });
}

test('待ちを捨てるコードは、README の「上限と飛ばすルール」に全部書いてある', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const section = readme.split('## 上限と飛ばすルール')[1]?.split('\n## ')[0] ?? '';
  assert.ok(section, 'README に「上限と飛ばすルール」がありません');
  const missing = [...files(path.join(root, 'src')), ...files(path.join(root, 'public/widgets'))]
    .filter((f) => DROP.test(fs.readFileSync(f, 'utf8')))
    .map((f) => path.relative(root, f))
    .filter((rel) => !section.includes(`\`${rel}\``));
  assert.deepEqual(missing, [], '説明のない上限があります。README の表とダッシュボードの説明に書いてください');
});

test('お試しの日数・事前のお知らせ・期限後は無料に落ちること・配信中は切らないことが「上限と飛ばすルール」に書いてある', () => {
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const section = readme.split('## 上限と飛ばすルール')[1]?.split('\n## ')[0] ?? '';
  const plans = JSON.parse(fs.readFileSync(path.join(root, 'src/plans.json'), 'utf8'));
  const row = section.split('\n').find((line) => line.startsWith('| 新しい配信者のお試し')) ?? '';
  assert.ok(row, '「新しい配信者のお試し」の行がありません');
  assert.ok(row.includes('`trialDays`') && row.includes(`${plans.trialDays}日`), 'お試しの日数');
  assert.ok(row.includes('`trialNoticeDays`') && row.includes(`${plans.trialNoticeDays}日`), '事前のお知らせ');
  assert.match(row, /停止にせず無料に落とす/);
  assert.match(row, /配信中（live）の接続は切らない/);
  assert.ok(row.includes('`src/billing.js`'));
});
