// docs/cards/ingest.md「3巡目」の完成条件(AC-22〜AC-24)だけを確かめる受け入れテスト。
// AC-1〜AC-13 は ingest.test.js、AC-14〜AC-21 は ingest-round2.test.js。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Tenants } from '../../src/tenants.js';
import { IngestKeyStore } from '../../src/ingest-keys.js';
import { startHostedServer } from '../helpers/guard-harness.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const roots = [];
const children = [];
after(() => {
  for (const c of children) c.kill();
  for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
});

const TENANTS = [
  { id: 'aaa', name: 'A', key: 'a'.repeat(24), obsKey: 'b'.repeat(24), enabled: true, widgets: ['alerts', 'chats'], access: {} },
  { id: 'off', name: 'Off', key: 'e'.repeat(24), obsKey: 'f'.repeat(24), enabled: false, widgets: ['alerts'], access: {} },
];

async function boot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ingest-ac3-'));
  roots.push(root);
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const configPath = path.join(root, 'config.yaml');
  fs.writeFileSync(configPath, '');
  fs.writeFileSync(path.join(dataDir, 'tenants.json'), JSON.stringify({ tenants: TENANTS, global: { access: {} } }));
  const server = await startHostedServer({
    env: { TW_CONFIG: configPath, TW_DATA: dataDir, TW_ENV: 'dev', TW_RESUME_CONNECT: '0', TW_ADMIN_TOKEN: 'admin-token-for-test' },
  });
  children.push(server.child);
  const base = await server.ready;
  const api = (tenant, p, init = {}) => fetch(`${base}/t/${tenant.key}${p}`, init);
  const send = (key) => fetch(`${base}/in/${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ kind: 'follow', userId: 'u23' }),
  });
  return { dataDir, api, send, A: TENANTS[0], OFF: TENANTS[1] };
}

test('AC-22 止められた配信者が POST /api/ingest/key を叩いても、403 に鍵が含まれず ingest.json も作られず変わらない', async () => {
  const s = await boot();
  const file = path.join(s.dataDir, 'tenants', s.OFF.id, 'ingest.json');

  const first = await s.api(s.OFF, '/api/ingest/key', { method: 'POST' });
  assert.equal(first.status, 403);
  assert.ok(!(await first.text()).includes('twin_'), '403 の本文に鍵がある');
  assert.ok(!fs.existsSync(file), 'ingest.json が作られた');

  // すでに鍵がある場合: 中身が変わらない
  const store = new IngestKeyStore({ dir: path.dirname(file) });
  store.create();
  const before = fs.readFileSync(file, 'utf8');
  const second = await s.api(s.OFF, '/api/ingest/key', { method: 'POST' });
  assert.equal(second.status, 403);
  assert.ok(!(await second.text()).includes('twin_'), '403 の本文に鍵がある');
  assert.equal(fs.readFileSync(file, 'utf8'), before);
});

test('AC-23 鍵の作り直し・削除が、runtime があっても再起動なしで /in と keyHint に反映される', async () => {
  const s = await boot();
  const create = async () => (await (await s.api(s.A, '/api/ingest/key', { method: 'POST' })).json()).value;
  const hint = async () => (await (await s.api(s.A, '/api/ingest')).json()).keyHint;

  const oldKey = await create(); // この時点で A の runtime はできている
  assert.equal((await s.send(oldKey)).status, 200);

  const newKey = await create();
  assert.notEqual(newKey, oldKey);
  assert.equal((await s.send(newKey)).status, 200);
  assert.equal((await s.send(oldKey)).status, 404);
  assert.equal(await hint(), newKey.slice(-4));

  assert.equal((await s.api(s.A, '/api/ingest/key', { method: 'DELETE' })).status, 200);
  assert.equal((await s.send(newKey)).status, 404);
});

test('AC-24 違う鍵を何回送っても ingest.json を毎回読み直さず、chmod も鍵の保存時以外には走らない', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ingest-ac3-unit-'));
  roots.push(dir);
  fs.writeFileSync(path.join(dir, 'tenants.json'), JSON.stringify({ tenants: TENANTS, global: { access: {} } }));
  const tenants = new Tenants({ dir });
  const dataDirOf = (id) => path.join(dir, 'tenants', id);
  const created = new IngestKeyStore({ dir: dataDirOf('aaa') }).create();

  const realRead = fs.readFileSync;
  const realChmod = fs.chmodSync;
  let reads = 0;
  let chmods = 0;
  fs.readFileSync = (p, ...rest) => {
    if (String(p).endsWith('ingest.json')) reads++;
    return realRead.call(fs, p, ...rest);
  };
  fs.chmodSync = (...args) => {
    chmods++;
    return realChmod.apply(fs, args);
  };
  try {
    // 1回目は読んでよい(覚えるため)。その後は読み直さない
    assert.equal(tenants.byIngestKey(`twin_${'0'.repeat(48)}`), null);
    reads = 0;
    chmods = 0;
    for (let i = 0; i < 20; i++) assert.equal(tenants.byIngestKey(`twin_${String(i % 10).repeat(48)}`), null);
    assert.equal(reads, 0, `ingest.json を ${reads} 回読み直した`);
    assert.equal(chmods, 0, `chmod が ${chmods} 回走った`);
    assert.equal(tenants.byIngestKey(created.value)?.id, 'aaa');

    // ファイルが変わったときは読み直して、新しい鍵が通る
    await sleep(20);
    const next = new IngestKeyStore({ dir: dataDirOf('aaa') }).create();
    assert.equal(tenants.byIngestKey(next.value)?.id, 'aaa');
    assert.equal(tenants.byIngestKey(created.value), null);
  } finally {
    fs.readFileSync = realRead;
    fs.chmodSync = realChmod;
  }
});
