// docs/cards/ingest.md「2巡目」の完成条件(AC-14〜AC-21)だけを確かめる受け入れテスト。
// AC-1〜AC-13 は ingest.test.js。ここも実物の server.js を一時ポートで起こし、HTTP で確かめる。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { Hub } from '../../src/hub.js';
import { Ingest } from '../../src/ingest.js';
import { startHostedServer } from '../helpers/guard-harness.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const japanese = /[぀-ヿ一-鿿]/;

const roots = [];
const children = [];
after(() => {
  for (const c of children) c.kill();
  for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
});

const TENANTS = [
  { id: 'aaa', name: 'A', key: 'a'.repeat(24), obsKey: 'b'.repeat(24), enabled: true, widgets: ['alerts', 'chats'], access: {} },
  { id: 'ccc', name: 'C', key: 'c'.repeat(24), obsKey: 'd'.repeat(24), enabled: true, widgets: ['alerts', 'chats'], access: {} },
  { id: 'off', name: 'Off', key: 'e'.repeat(24), obsKey: 'f'.repeat(24), enabled: false, widgets: ['alerts'], access: {} },
];

async function boot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ingest-ac2-'));
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
  const api = (tenant, p, init = {}) => fetch(`${base}/t/${tenant.key}${p}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
  const json = async (res) => res.json();
  const makeKey = async (tenant) => (await json(await api(tenant, '/api/ingest/key', { method: 'POST' }))).value;
  const send = (key, body) => fetch(`${base}/in/${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const recent = async (tenant) => (await json(await api(tenant, '/api/status'))).recent;
  const state = async (tenant) => json(await api(tenant, '/api/ingest'));
  return { base, dataDir, api, json, makeKey, send, recent, state, A: TENANTS[0], C: TENANTS[1], OFF: TENANTS[2] };
}

test('AC-14 直接のコメントと同じ内容を kind: comment で送ると、捨てられて duplicates が1増える', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  const direct = await s.api(s.A, '/api/simulate', { method: 'POST', body: { kind: 'chat', user: 'v14', text: '同じ文14' } });
  assert.equal(direct.status, 200);
  const res = await s.send(key, { kind: 'comment', userId: 'demo_v14', comment: '同じ文14' });
  assert.equal(res.status, 200);
  assert.deepEqual(await s.json(res), { ok: true, duplicate: true });
  assert.equal((await s.state(s.A)).duplicates, 1);
  assert.equal((await s.recent(s.A)).filter((e) => e.text === '同じ文14').length, 1);
});

test('AC-15 userId と username が両方来たら username(先頭の @ なし)が uniqueId。片方だけでも空にならない', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  await s.send(key, { kind: 'follow', userId: 'idBoth', username: '@handleBoth', nickname: 'りょうほう' });
  await s.send(key, { kind: 'follow', userId: 'idOnly', nickname: 'あいでぃー' });
  await s.send(key, { kind: 'follow', username: '@handleOnly', nickname: 'はんどる' });
  const list = await s.recent(s.A);
  const idOf = (name) => list.find((e) => e.kind === 'follow' && e.user.name === name).user.id;
  assert.equal(idOf('りょうほう'), 'handleBoth');
  assert.equal(idOf('あいでぃー'), 'idOnly');
  assert.equal(idOf('はんどる'), 'handleOnly');
});

test('AC-16 25回送って2秒止めたあと、続けて40回送っても429にならない', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  for (let i = 0; i < 25; i++) assert.equal((await s.send(key, { kind: 'follow', userId: `a${i}` })).status, 200);
  await sleep(2100);
  const results = await Promise.all(Array.from({ length: 40 }, (_, i) => s.send(key, { kind: 'follow', userId: `b${i}` })));
  assert.deepEqual(results.map((r) => r.status).filter((st) => st !== 200), []);
});

// content-length を付けず chunked で送る
const sendChunked = (base, key, body) => new Promise((resolve, reject) => {
  const req = http.request(`${base}/in/${key}`, { method: 'POST', headers: { 'content-type': 'application/json' } }, (res) => {
    let text = '';
    res.setEncoding('utf8');
    res.on('data', (c) => { text += c; });
    res.on('end', () => resolve({ status: res.statusCode, text }));
  });
  req.on('error', reject);
  req.write(body.slice(0, 1000));
  req.write(body.slice(1000));
  req.end();
});

test('AC-17 chunked でも本文が16KBを超えたら413。違う鍵は解析せず404、壊れたJSONは日本語1行の400', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  const big = JSON.stringify({ kind: 'chat', userId: 'u17', comment: 'あ'.repeat(7000) });
  assert.ok(Buffer.byteLength(big) > 16 * 1024);
  const res = await sendChunked(s.base, key, big);
  assert.equal(res.status, 413);
  assert.match(res.text, japanese);

  const broken = '{"kind": "follow", ';
  const wrongKey = await fetch(`${s.base}/in/twin_${'0'.repeat(48)}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: broken });
  assert.equal(wrongKey.status, 404);
  const bad = await fetch(`${s.base}/in/${key}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: broken });
  assert.equal(bad.status, 400);
  const text = (await bad.text()).trim();
  assert.match(text, japanese);
  assert.ok(!text.includes('\n') && !/<[a-z]/i.test(text), '日本語1行');
});

test('AC-18 /in 以外の既存ルートにフォーム形式で送っても、本文は解析されない', async () => {
  const s = await boot();
  // 同じ中身を JSON で送れば受かる(ルートと環境が正しい確認)
  const ok = await s.api(s.A, '/api/simulate', { method: 'POST', body: { kind: 'follow', user: 'jsonuser' } });
  assert.equal(ok.status, 200);
  const form = await fetch(`${s.base}/t/${s.A.key}/api/simulate`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'kind=follow&user=formuser',
  });
  assert.notEqual(form.status, 200);
  assert.ok(!(await s.recent(s.A)).some((e) => e.user?.id === 'demo_formuser' || e.user?.name === 'formuser'));
});

test('AC-19 違う鍵で /in を何回送っても、まだ runtime を作っていない配信者の runtime は作られない', async () => {
  const s = await boot();
  const tenantsDir = path.join(s.dataDir, 'tenants');
  const list = () => (fs.existsSync(tenantsDir) ? fs.readdirSync(tenantsDir) : []);
  const before = list();
  for (let i = 0; i < 5; i++) {
    assert.equal((await s.send(`twin_${String(i).repeat(48)}`, { kind: 'follow', userId: 'x' })).status, 404);
  }
  assert.deepEqual(list(), before);
  // 対照: 配信者の API を使えば runtime ができ、その場所が作られる(上の確認が効くことの裏付け)
  await s.api(s.C, '/api/ingest');
  assert.ok(list().includes('ccc'));
});

test('AC-20 止められた配信者は、ダッシュボードの鍵で /api/ingest と /api/ingest/key を叩いても403', async () => {
  const s = await boot();
  for (const [method, p] of [['GET', '/api/ingest'], ['POST', '/api/ingest/key'], ['DELETE', '/api/ingest/key']]) {
    assert.equal((await s.api(s.OFF, p, { method })).status, 403, `${method} ${p}`);
  }
});

test('AC-21 直接の接続から1万件流しても、重複判定の記録は直近15秒の分を超えない', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ingest-ac2-unit-'));
  roots.push(dataDir);
  let clock = 1_000_000;
  const hub = new Hub();
  const ingest = new Ingest(hub, { dataDir, now: () => clock });
  const STEP = 20;
  for (let i = 0; i < 10_000; i++) {
    clock += STEP;
    hub.publish({ kind: 'chat', user: { id: `u${i}`, name: `u${i}`, avatar: null }, text: `m${i}` });
  }
  // Ingest が持つ入れ物(Map・Set・配列)の中身の数を合わせる
  const held = Object.values(ingest).reduce((n, v) => n + (v instanceof Map || v instanceof Set ? v.size : Array.isArray(v) ? v.length : 0), 0);
  const withinWindow = 15_000 / STEP + 1;
  assert.ok(held <= withinWindow, `記録が ${held} 件ある(直近15秒は ${withinWindow} 件まで)`);
});
