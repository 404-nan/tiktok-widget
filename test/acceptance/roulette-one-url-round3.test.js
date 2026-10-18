// roulette-one-url 3巡目(カード docs/cards/roulette-one-url.md の「3巡目」)の受け入れテスト。
// AC-8: 「くわしく」表示でルーレットのタブを開いても、ルーレットごとの ?ids= の URL が
//       「1つだけ出したいとき」として折りたたみの中に1組だけ出て、コピーできる。
// この環境には DOM を動かす道具が無いので、editor.js の置き場所の決め方をソースで確かめる。
// 「くわしく」の折りたたみは class="more"(others なし)の details。「かんたん」の「ほかの項目」は class="more others"。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const editor = fs.readFileSync(path.join(repoRoot, 'public/dashboard/editor.js'), 'utf8');

const start = editor.indexOf('function renderRouletteUrls');
const end = editor.indexOf('\n  function ', start + 1);
const body = start < 0 ? '' : editor.slice(start, end < 0 ? undefined : end);
const selectors = [...body.matchAll(/querySelector(?:All)?\(\s*(['"`])(.*?)\1/g)].map((m) => m[2]);

test('AC-8 ルーレットごとの URL を置く処理が見つかる', () => {
  assert.ok(body.includes('rouletteUrls'), 'renderRouletteUrls が見つかりません');
});

test('AC-8 置き場所の探し方が「くわしく」の折りたたみ(.more で others なし)にも当たる', () => {
  const reachesDetail = selectors.some((s) => /\.more\b/.test(s) && !/\.others\b/.test(s));
  const branchesOnMode = /simple\(\)/.test(body);
  assert.ok(
    reachesDetail || branchesOnMode,
    `「くわしく」の折りたたみに置く処理がありません(探している場所: ${selectors.join(' | ')})`,
  );
});

test('AC-8 かんたん専用の場所だけを探して、くわしくでは箱が消える作りになっていない', () => {
  const onlySimpleTarget = selectors.length > 0 && selectors.every((s) => /\.others\b/.test(s)) && !/simple\(\)/.test(body);
  assert.ok(!onlySimpleTarget, '「くわしく」表示では箱がどこにも置かれず消えます');
});
