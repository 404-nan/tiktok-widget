// 説明していない「待ちを捨てる」ルールを防ぐ。捨てるコードがあるファイルは README の「上限と飛ばすルール」の表に載っていないといけない。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
// 長さを比べてから先頭を捨てる（.shift()）か、満杯で受け付けない（ok: false / 'full'）コード
const DROP = /(length\s*>=?\s*[^;\n]+\)\s*[^;\n]*\.shift\(\))|(while\s*\([^)]*length\s*>=?[^)]*\)\s*[^;\n]*\.shift\(\))|(length\s*>=?\s*[A-Z_0-9]+\)\s*return\s*\{\s*ok:\s*false)|(createQueue\([^)]*max:\s*\d+)/;

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    if (d.isDirectory()) return files(p);
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
