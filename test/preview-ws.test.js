// ダッシュボードの中の見本(preview=1)のウィジェットが、配信ソフトからの接続(obs)として数えられないことを確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const dir = path.join(import.meta.dirname, '..', 'public', 'widgets');

test('WebSocket を開くウィジェットは、見本のとき preview=1 をサーバーに伝える', () => {
  const files = fs.readdirSync(dir).filter((f) => /\.(js|html)$/.test(f) && f !== 'obs-bridge.js').map((f) => path.join(dir, f));
  files.push(path.join(dir, 'lib', 'overlay.js'));
  const missing = files.filter((f) => {
    const s = fs.readFileSync(f, 'utf8');
    return /new WebSocket/.test(s) && !/preview=1/.test(s);
  });
  assert.deepEqual(missing.map((f) => path.basename(f)), []);
});

test('サーバーは preview=1 の OBS 用の接続を preview として分け、未払いの止め方は obs と同じにする', () => {
  const s = fs.readFileSync(path.join(import.meta.dirname, '..', 'server.js'), 'utf8');
  assert.match(s, /found\.role === 'obs' && requestUrl\.searchParams\.get\('preview'\) === '1' \? 'preview'/);
  assert.match(s, /const keyRole = role === 'preview' \? 'obs' : role;/);
});
