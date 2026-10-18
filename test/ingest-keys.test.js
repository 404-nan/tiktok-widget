// IngestKeyStore の鍵の保存、作り直し、削除を単体で確かめるテスト。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { IngestKeyStore } from '../src/ingest-keys.js';

const roots = [];
after(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true });
});

test('鍵ストアは要約だけを保存し、作り直しと削除で前の鍵を無効にする', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ingest-keys-'));
  roots.push(dir);
  const store = new IngestKeyStore({ dir, now: () => 1_700_000_000_000 });
  const file = path.join(dir, 'ingest.json');

  const first = store.create();
  const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.deepEqual(Object.keys(saved).sort(), ['createdAt', 'hash', 'hint']);
  assert.equal(saved.hash, crypto.createHash('sha256').update(first.value).digest('hex'));
  assert.equal(saved.hint, first.value.slice(-4));
  assert.equal(saved.createdAt, '2023-11-14T22:13:20.000Z');
  assert.equal(store.authenticate(first.value), true);
  assert.equal(JSON.stringify(saved).includes(first.value), false);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);

  const second = store.create();
  assert.notEqual(second.value, first.value);
  assert.equal(store.authenticate(first.value), false);
  assert.equal(store.authenticate(second.value), true);

  store.remove();
  assert.equal(store.authenticate(second.value), false);
  assert.equal(fs.existsSync(file), false);
});
