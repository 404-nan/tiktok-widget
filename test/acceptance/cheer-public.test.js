// いいね応援ゲージの公開画面・操作一覧の受け入れテスト。

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('AC-11・12: cheer の公開画面と操作一覧が日本語・ES5・CDNなしである', () => {
  const js = fs.readFileSync('public/widgets/cheer.js', 'utf8');
  const html = fs.readFileSync('public/widgets/cheer.html', 'utf8');
  const simple = fs.readFileSync('public/dashboard/simple.js', 'utf8');
  const editor = fs.readFileSync('public/dashboard/editor.js', 'utf8');
  const all = fs.readFileSync('public/widgets/all.html', 'utf8');
  assert.doesNotMatch(js, /=>|`|\?\.|\?\?|\b(?:let|const|class|import|export)\b/);
  assert.doesNotMatch(`${js}\n${html}`, /https?:\/\//i);
  assert.match(`${js}\n${html}`, /満タン|あと少し|みんなで応援/);
  assert.match(simple, /cheers/);
  assert.match(editor, /cheers|いいね|満タン/);
  assert.match(all, /cheers|cheer/);
});
