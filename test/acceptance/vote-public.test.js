import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

test('AC-11: 投票ウィジェットは ES5・日本語・CDNなしである', () => {
  const js = fs.readFileSync(path.join(root, 'public/widgets/vote.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'public/widgets/vote.html'), 'utf8');
  assert.doesNotMatch(js, /=>|`|\?\.|\?\?|\b(?:let|const|class|import|export)\b/);
  assert.doesNotMatch(`${js}\n${html}`, /https?:\/\//i);
  assert.match(`${js}\n${html}`, /受付中|しめきり|結果/);
});

test('AC-12: 投票がダッシュボードと全部まとめてに登録されている', () => {
  const simple = fs.readFileSync(path.join(root, 'public/dashboard/simple.js'), 'utf8');
  const editor = fs.readFileSync(path.join(root, 'public/dashboard/editor.js'), 'utf8');
  const all = fs.readFileSync(path.join(root, 'public/widgets/all.html'), 'utf8');
  assert.match(simple, /votes/);
  assert.match(editor, /votes/);
  assert.match(editor, /投票|はじめる|結果を出す/);
  assert.match(all, /votes|vote/);
});
