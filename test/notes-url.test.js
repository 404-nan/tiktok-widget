// お知らせの「くわしいページ」の行き先は、同じサイトの中か https だけにする。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { NotesStore, cleanUrl } from '../src/notes.js';

test('くわしいページの行き先は / か https:// だけ受け付ける', () => {
  assert.equal(cleanUrl('/help/#roulette'), '/help/#roulette');
  assert.equal(cleanUrl('https://example.com/a'), 'https://example.com/a');
  for (const bad of ['javascript:alert(1)', '//evil.example', 'http://example.com', 'help', '']) assert.equal(cleanUrl(bad), '');
});

test('お知らせに行き先を付けて、あとで直せる', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'notes-'));
  const store = new NotesStore({ dir });
  const note = store.create({ title: 't', body: 'b', date: '2026-10-25', url: '/help/' });
  assert.equal(note.url, '/help/');
  assert.equal(store.update(note.id, { url: 'javascript:x' }).url, '');
});
