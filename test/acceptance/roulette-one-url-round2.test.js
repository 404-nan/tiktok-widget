// roulette-one-url 2巡目(カード docs/cards/roulette-one-url.md の「2巡目」)の受け入れテスト。
// AC-7: タブの開き直し・戻る・フォーム再作成をどの順で行っても、ルーレットごとの ?ids= の URL は
//       毎回「ほかの項目」の折りたたみの中に1組だけ出て、折りたたみの外に出たり消えたりしない。
// この環境には DOM を動かす道具(jsdom など)が無いので、editor.js の置き場所の決め方をソースで確かめる。
// 既存の AC-3 のテストも同じ方式。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const editor = fs.readFileSync(path.join(repoRoot, 'public/dashboard/editor.js'), 'utf8');

// ルーレットごとの URL の箱を作って置く関数(名前は実装に任せ、箱の id から探す)
const idAt = editor.indexOf("'rouletteUrls'");
const from = editor.lastIndexOf('\n  function ', idAt);
const to = editor.indexOf('\n  function ', idAt);
const body = idAt < 0 ? '' : editor.slice(from, to < 0 ? undefined : to);

test('AC-7 ルーレットごとの URL の箱を置く処理が見つかる', () => {
  assert.ok(body.includes('append') || body.includes('insert'), '箱を置く処理が見つかりません');
});

test('AC-7 箱を折りたたみの外(サイズ説明の直後など)に置く逃げ道が無い', () => {
  // 「ほかの項目」が見つからないとき sizeHint の後ろに置くと、折りたたみの外に出てしまう
  assert.ok(!/sizeHint/.test(body), '箱を折りたたみの外(sizeHint の後ろ)に置く処理が残っています');
  assert.ok(!/insertAdjacentElement/.test(body), '箱を折りたたみの外に差し込む処理が残っています');
});
