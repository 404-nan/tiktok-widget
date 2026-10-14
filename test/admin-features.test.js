import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import express from 'express';
import { createStore } from '../src/config.js';
import { createRuntime } from '../src/runtime.js';
import { NotesStore } from '../src/notes.js';
import { ApiKeyStore } from '../src/api-keys.js';
import { createSignKey } from '../src/signkey.js';
import { adminGuard } from '../src/admin-auth.js';

const tmp = (prefix) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

test('更新のお知らせは追加・変更・削除でき、JSON に残る', () => {
  const dir = tmp('tw-notes-');
  const store = new NotesStore({ dir });
  const note = store.create({ title: '更新', body: '新しい画面です', date: '2026-10-13' });
  assert.equal(store.list()[0].title, '更新');
  assert.equal(store.update(note.id, { body: '変更しました' }).body, '変更しました');
  assert.equal(store.remove(note.id), true);
  assert.deepEqual(new NotesStore({ dir }).list(), []);
});

test('管理 API は正しい合言葉がないと開けない', async () => {
  const app = express();
  app.use(adminGuard('manager-token'));
  app.get('/notes', (_req, res) => res.json({ ok: true }));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  try {
    const denied = await fetch(`http://127.0.0.1:${port}/notes`);
    assert.equal(denied.status, 401);
    const allowed = await fetch(`http://127.0.0.1:${port}/notes`, { headers: { 'x-admin-token': 'manager-token' } });
    assert.equal(allowed.status, 200);
  } finally {
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
  }
});

test('API キーは伏せ字だけ返し、保存ファイルは 0600', () => {
  const dir = tmp('tw-keys-');
  const before = process.env.TIKTOK_SIGN_API_KEY;
  try {
    delete process.env.TIKTOK_SIGN_API_KEY;
    const signKey = createSignKey({ dir });
    const keys = new ApiKeyStore({ dir, signKey });
    const added = keys.add({ name: '外部サービス', type: '通知', value: '12345678-secret-9012' });
    assert.equal(added.masked, '12345678…9012');
    assert.equal(JSON.stringify(added).includes('12345678-secret-9012'), false);
    assert.equal(fs.statSync(path.join(dir, 'api-keys.json')).mode & 0o777, 0o600);
    assert.equal(keys.list().find((key) => key.name === '外部サービス').masked, '12345678…9012');
  } finally {
    if (before === undefined) delete process.env.TIKTOK_SIGN_API_KEY;
    else process.env.TIKTOK_SIGN_API_KEY = before;
  }
});

test('テスト送信 API は開発環境以外で 403、開発環境では Hub に流れる', async () => {
  const dir = tmp('tw-simulate-');
  const runtime = createRuntime({ id: 'test', store: createStore(path.join(dir, 'config.yaml')), dataDir: dir, mediaDirs: [dir] });
  const app = express();
  app.use(express.json());
  app.use(runtime.router);
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const send = async () => fetch(`http://127.0.0.1:${port}/api/simulate`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind: 'gift', senderName: 'テストさん', giftName: 'Rose', count: 1 }) });
  const before = process.env.TW_ENV;
  const beforePort = process.env.PORT;
  try {
    delete process.env.TW_ENV;
    assert.equal((await send()).status, 403);
    process.env.TW_ENV = 'dev';
    process.env.PORT = '3940';
    assert.equal((await send()).status, 200);
    assert.equal(runtime.hub.recent[0].user.name, 'テストさん');
  } finally {
    if (before === undefined) delete process.env.TW_ENV;
    else process.env.TW_ENV = before;
    if (beforePort === undefined) delete process.env.PORT;
    else process.env.PORT = beforePort;
    server.closeAllConnections?.();
    await new Promise((resolve) => server.close(resolve));
    await runtime.close();
  }
});
