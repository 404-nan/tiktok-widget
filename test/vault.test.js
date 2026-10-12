import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createServer } from 'node:http';
import { createVault } from '../src/vault.js';

// Cloudflare の Vault と同じ受け答えをする、メモリだけの置き場
function fakeVault() {
  const files = new Map();
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    const chunks = [];
    for await (const c of req) chunks.push(c);
    if (url.pathname === '/list') {
      res.end(JSON.stringify([...files].map(([p, f]) => ({ path: p, size: f.body.length, mtime: f.mtime }))));
      return;
    }
    const p = decodeURIComponent(url.pathname.slice(3));
    if (req.method === 'GET') {
      if (!files.has(p)) return res.writeHead(404).end();
      return res.end(files.get(p).body);
    }
    if (req.method === 'PUT') files.set(p, { body: Buffer.concat(chunks), mtime: Number(url.searchParams.get('mtime')) });
    if (req.method === 'DELETE') files.delete(p);
    res.end('ok');
  });
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ files, server, url: `http://127.0.0.1:${server.address().port}` })));
}

const quiet = { log() {}, warn() {} };

test('data/ を置き場に送り、別の場所に戻せる（消したファイルは置き場からも消える）', async () => {
  const v = await fakeVault();
  const a = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-a-'));
  fs.mkdirSync(path.join(a, 'tenants', 't1', 'media'), { recursive: true });
  fs.writeFileSync(path.join(a, 'tenants.json'), '{"tenants":[]}');
  fs.writeFileSync(path.join(a, 'tenants', 't1', 'config.yaml'), 'wins:\n  goal: 10\n');
  fs.writeFileSync(path.join(a, 'tenants', 't1', 'media', 'ネコ 画像.png'), Buffer.from([1, 2, 3, 250]));
  fs.writeFileSync(path.join(a, 'tenants.json.tmp-123'), '書きかけ');

  const va = createVault({ url: v.url, dir: a, log: quiet });
  await va.restore();
  await va.sync();
  assert.deepEqual([...v.files.keys()].sort(), ['tenants.json', 'tenants/t1/config.yaml', 'tenants/t1/media/ネコ 画像.png']);

  // 変わっていなければ送らない
  v.files.get('tenants.json').body = Buffer.from('置き場の中身');
  await va.sync();
  assert.equal(v.files.get('tenants.json').body.toString(), '置き場の中身');

  // 消したら置き場からも消える
  fs.rmSync(path.join(a, 'tenants', 't1', 'config.yaml'));
  await va.sync();
  assert.ok(!v.files.has('tenants/t1/config.yaml'));

  // 新しい場所（作り直したコンテナ）に戻す
  const b = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-b-'));
  await createVault({ url: v.url, dir: b, log: quiet }).restore();
  assert.deepEqual([...fs.readFileSync(path.join(b, 'tenants', 't1', 'media', 'ネコ 画像.png'))], [1, 2, 3, 250]);
  assert.equal(fs.readFileSync(path.join(b, 'tenants.json'), 'utf8'), '置き場の中身');
  v.server.close();
});

test('置き場につながらないときは、空のまま始めずに失敗する', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vault-c-'));
  const vault = createVault({ url: 'http://127.0.0.1:9', dir, log: quiet });
  await assert.rejects(vault.restore({ tries: 1 }));
});
