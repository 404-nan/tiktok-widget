// 本番前レビューの5指摘を、実装のつなぎ方に近い形で再現する回帰テスト。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Hub } from '../../src/hub.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const cutin = () => fs.readFileSync(path.join(root, 'public/widgets/lib/cutin.js'), 'utf8');

test('レビュー1: 昇格は段階の色・文字・画像を上の段階へ再描画する', () => {
  const source = cutin();
  assert.match(source, /result\.from/);
  assert.match(source, /const tier = result\.from \|\| result\.tier/);
  assert.match(source, /await play\(e, \{ \.\.\.result, from: null \}\)/);
  assert.match(source, /TEXT\[tier\]/);
});

test('レビュー2: プレミア柄は通常帯だけでなく縦長・写真の帯にも描く', () => {
  const source = cutin();
  assert.match(source, /result\.pattern && mounted\?\.patternTargets/);
  assert.match(source, /if \(result\.pattern\)[\s\S]*patternImage\(result\.pattern, bw, sh \* 0\.06/);
});

test('レビュー3: cutinDraw が無い古い接続は従来どおりランダムなseedを使う', () => {
  assert.match(cutin(), /Math\.floor\(Math\.random\(\) \* 900\) \+ 1/);
});

test('レビュー4: 昇格して虹になったときのキュインは1回だけ', () => {
  const source = cutin();
  assert.match(source, /result\.from[\s\S]*sfx\('kyuin'\)/);
  assert.match(source, /tier === 'rainbow'[\s\S]*!result\.from[\s\S]*sfx\('kyuin'\)/);
});

test('レビュー5: prepare listenerの例外でpublish全体を止めない', () => {
  const hub = new Hub();
  let delivered = false;
  hub.on('prepare', () => { throw new Error('壊れた準備処理'); });
  hub.on('event', () => { delivered = true; });
  assert.doesNotThrow(() => hub.publish({ kind: 'follow', user: { id: 'u1', name: 'テスト' } }));
  assert.equal(delivered, true);
});
