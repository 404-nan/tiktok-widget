// overlay.js を読まない公開ウィジェットが、配信者ごとの URL（/t/<鍵>/）の下の API と WebSocket を使うことを確かめる。
// 先頭が / の '/api' '/ws' に直接つなぐと、本番（複数の配信者）では別の接続先になって動かない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const dir = new URL('../public/widgets/', import.meta.url);

test('overlay.js を使わないウィジェットは /api と /ws の前に配信者の base を付ける', () => {
  const files = fs.readdirSync(dir).filter((f) => /\.(html|js)$/.test(f));
  const bad = [];
  for (const file of files) {
    const src = fs.readFileSync(new URL(file, dir), 'utf8');
    if (src.includes('overlay.js')) continue; // overlay.js が fetch と WebSocket の行き先を直す
    if (/fetch\('\/api\//.test(src) || /location\.host \+ '\/ws'/.test(src)) bad.push(file);
  }
  assert.deepEqual(bad, []);
});
