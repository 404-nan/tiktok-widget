import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createSignKey } from '../src/signkey.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-signkey-'));

test('管理画面で入れた API キーは残り、環境変数より先に使う。消すと環境変数に戻る', () => {
  const before = process.env.TIKTOK_SIGN_API_KEY;
  try {
    const dir = tmp();
    process.env.TIKTOK_SIGN_API_KEY = 'env-key-0000000000';
    const k = createSignKey({ dir });
    assert.deepEqual(k.state(), { set: true, source: 'env', tail: '0000' });

    assert.deepEqual(k.set('  admin-key-12345678 '), { set: true, source: 'admin', tail: '5678' });
    assert.equal(process.env.TIKTOK_SIGN_API_KEY, 'admin-key-12345678');
    assert.equal(fs.statSync(path.join(dir, 'sign-api-key.txt')).mode & 0o777, 0o600);

    // 起動し直しても残っている
    process.env.TIKTOK_SIGN_API_KEY = 'env-key-0000000000';
    assert.equal(createSignKey({ dir }).state().source, 'admin');
    assert.equal(process.env.TIKTOK_SIGN_API_KEY, 'admin-key-12345678');

    // 消すと環境変数のキーに戻る
    process.env.TIKTOK_SIGN_API_KEY = 'env-key-0000000000';
    assert.equal(createSignKey({ dir }).set('').source, 'env');
    assert.equal(process.env.TIKTOK_SIGN_API_KEY, 'env-key-0000000000');
  } finally {
    if (before === undefined) delete process.env.TIKTOK_SIGN_API_KEY;
    else process.env.TIKTOK_SIGN_API_KEY = before;
  }
});

test('キーがないときは何も入れず、おかしな形は断る。短いキーは末尾を見せない', () => {
  const before = process.env.TIKTOK_SIGN_API_KEY;
  try {
    delete process.env.TIKTOK_SIGN_API_KEY;
    const k = createSignKey({ dir: tmp() });
    assert.deepEqual(k.state(), { set: false, source: null, tail: '' });
    assert.equal(process.env.TIKTOK_SIGN_API_KEY, undefined);
    assert.throws(() => k.set('abc def'), /形が正しくありません/);
    assert.throws(() => k.set('あいう'), /形が正しくありません/);
    assert.equal(k.state().set, false);
    assert.equal(k.set('short').tail, '');
    assert.equal(k.set('').set, false);
    assert.equal(process.env.TIKTOK_SIGN_API_KEY, undefined);
  } finally {
    if (before === undefined) delete process.env.TIKTOK_SIGN_API_KEY;
    else process.env.TIKTOK_SIGN_API_KEY = before;
  }
});
