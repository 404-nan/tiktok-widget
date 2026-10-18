// docs/cards/ingest.md の完成条件(AC-1〜AC-13)を確かめる受け入れテスト。
// 実物の server.js を hosted で一時ポートに起こし、HTTP だけで確かめる(本物の data/ には触らない)。
// 時間がかかる窓(15秒・20秒・10分)の「切れたあと」は、時計を差し替える口が決まっていないので確かめない。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hub } from '../../src/hub.js';
import { startHostedServer } from '../helpers/guard-harness.js';

const sha256 = (v) => crypto.createHash('sha256').update(v).digest('hex');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const roots = [];
const children = [];
after(() => {
  for (const c of children) c.kill();
  for (const d of roots) fs.rmSync(d, { recursive: true, force: true });
});

const TENANTS = [
  { id: 'aaa', name: 'A', key: 'a'.repeat(24), obsKey: 'b'.repeat(24), enabled: true, widgets: ['alerts', 'chats', 'wins'], access: {} },
  { id: 'ccc', name: 'C', key: 'c'.repeat(24), obsKey: 'd'.repeat(24), enabled: true, widgets: ['alerts', 'chats', 'wins'], access: {} },
  { id: 'off', name: 'Off', key: 'e'.repeat(24), obsKey: 'f'.repeat(24), enabled: false, widgets: ['alerts'], access: {} },
  { id: 'pay', name: 'Pay', key: 'g'.repeat(24), obsKey: 'h'.repeat(24), enabled: true, widgets: ['alerts'], access: {} },
];

// 配信者4人(通常2人・停止1人・課金停止1人)の hosted サーバーを起こす
async function boot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ingest-ac-'));
  roots.push(root);
  const dataDir = path.join(root, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const configPath = path.join(root, 'config.yaml');
  fs.writeFileSync(configPath, '');
  fs.writeFileSync(path.join(dataDir, 'tenants.json'), JSON.stringify({ tenants: TENANTS, global: { access: {} } }));
  fs.writeFileSync(path.join(dataDir, 'billing.json'), JSON.stringify({ accounts: { pay: { status: 'suspended' } } }));
  const server = await startHostedServer({
    env: { TW_CONFIG: configPath, TW_DATA: dataDir, TW_ENV: 'dev', TW_BILLING: 'on', TW_RESUME_CONNECT: '0', TW_ADMIN_TOKEN: 'admin-token-for-test' },
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
  const send = (key, body, { method = 'POST', query = '' } = {}) => fetch(`${base}/in/${key}${query}`, {
    method,
    headers: { 'content-type': 'application/json' },
    body: method === 'GET' ? undefined : JSON.stringify(body),
  });
  const recent = async (tenant) => (await json(await api(tenant, '/api/status'))).recent;
  return { root, dataDir, base, api, json, makeKey, send, recent, A: TENANTS[0], C: TENANTS[1], OFF: TENANTS[2], PAY: TENANTS[3] };
}

const user = { userId: 'viewer1', nickname: 'ゆうた' };

test('AC-1 鍵の作成: 全文は作った1回だけ、保存は要約・時刻・末尾4文字・0600', async () => {
  const s = await boot();
  const res = await s.api(s.A, '/api/ingest/key', { method: 'POST' });
  assert.equal(res.status, 200);
  const body = await s.json(res);
  assert.match(body.value, /^twin_[0-9a-f]{48}$/);
  const file = path.join(s.dataDir, 'tenants', 'aaa', 'ingest.json');
  const text = fs.readFileSync(file, 'utf8');
  assert.ok(!text.includes(body.value), '鍵の全文を保存してはいけない');
  assert.ok(text.includes(sha256(body.value)), 'sha256 の要約を保存する');
  assert.ok(text.includes(body.value.slice(-4)), '末尾4文字の目印を保存する');
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
  const siblings = fs.readdirSync(path.dirname(file)).filter((f) => f.includes('ingest.json') && f !== 'ingest.json');
  assert.deepEqual(siblings, [], '一時ファイルを残さない');
});

test('AC-2 作り直しと削除で前の鍵が即座に死ぬ。鍵は配信者あたり1本', async () => {
  const s = await boot();
  const first = await s.makeKey(s.A);
  assert.equal((await s.send(first, { kind: 'follow', ...user })).status, 200);
  const second = await s.makeKey(s.A);
  assert.notEqual(first, second);
  assert.equal((await s.send(first, { kind: 'follow', ...user })).status, 404);
  assert.equal((await s.send(second, { kind: 'follow', ...user })).status, 200);
  const del = await s.api(s.A, '/api/ingest/key', { method: 'DELETE' });
  assert.equal(del.status, 200);
  assert.equal((await s.send(second, { kind: 'follow', ...user })).status, 404);
});

test('AC-3 管理用 API: 状態は全文を返さず、OBS 用の鍵は 403、作成だけが全文を返す', async () => {
  const s = await boot();
  const value = await s.makeKey(s.A);
  const get = await s.api(s.A, '/api/ingest');
  assert.equal(get.status, 200);
  const text = await get.text();
  assert.ok(!text.includes(value));
  assert.ok(!text.includes(sha256(value)));
  const obs = { key: s.A.obsKey };
  for (const [method, p] of [['GET', '/api/ingest'], ['POST', '/api/ingest/key'], ['DELETE', '/api/ingest/key']]) {
    assert.equal((await s.api(obs, p, { method })).status, 403, `${method} ${p}`);
  }
  // OBS 用の鍵で作ろうとしても、鍵は増えない
  assert.equal((await s.send(value, { kind: 'follow', ...user })).status, 200);
});

test('AC-4 照合: 違う鍵は 404、止められた配信者は 403、受け口の鍵でダッシュボードは開けない', async () => {
  const s = await boot();
  const bad = await s.send(`twin_${'0'.repeat(48)}`, { kind: 'follow', ...user });
  assert.equal(bad.status, 404);
  assert.match(await bad.text(), /[぀-ヿ一-鿿]/);
  const keyA = await s.makeKey(s.A);
  // 別の配信者の鍵は、その配信者のものとして働く(混ざらない)
  const keyC = await s.makeKey(s.C);
  await s.send(keyC, { kind: 'chat', ...user, comment: 'cだけ' });
  assert.ok(!(await s.recent(s.A)).some((e) => e.text === 'cだけ'));
  assert.ok((await s.recent(s.C)).some((e) => e.text === 'cだけ'));
  // 受け口の鍵は /t/<鍵> として使えない
  assert.equal((await fetch(`${s.base}/t/${keyA}/api/ingest`)).status, 404);
  // 止められた配信者
  const keyOff = await s.makeKey(s.OFF);
  assert.equal((await s.send(keyOff, { kind: 'follow', ...user })).status, 404);
});

test('AC-4 Authorization: Bearer でも渡せる(URL は /in)', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  const ok = await fetch(`${s.base}/in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ kind: 'follow', ...user }),
  });
  assert.equal(ok.status, 200);
  const ng = await fetch(`${s.base}/in`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer twin_${'1'.repeat(48)}` },
    body: JSON.stringify({ kind: 'follow', ...user }),
  });
  assert.equal(ng.status, 404);
});

test('AC-5 種類: gift like follow comment chat share と event・type の名前を受け、ほかは 400', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  for (const kind of ['gift', 'like', 'follow', 'comment', 'chat', 'share']) {
    const res = await s.send(key, { kind, ...user, comment: 'こんにちは', giftId: '5655', giftName: 'Rose', coins: 1 });
    assert.equal(res.status, 200, kind);
  }
  assert.equal((await s.send(key, { event: 'share', ...user })).status, 200);
  assert.equal((await s.send(key, { type: 'follow', ...user })).status, 200);
  const bad = await s.send(key, { kind: 'dance', ...user });
  assert.equal(bad.status, 400);
  assert.match(await bad.text(), /[぀-ヿ一-鿿]/);
  assert.equal((await s.send(key, { ...user })).status, 400);
  // GET とフォームも受ける
  assert.equal((await s.send(key, null, { method: 'GET', query: '?kind=follow&userId=g1&nickname=gg' })).status, 200);
  const form = await fetch(`${s.base}/in/${key}`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'kind=follow&userId=f1&nickname=ff',
  });
  assert.equal(form.status, 200);
});

test('AC-6 欄の名前: ユーザー・ギフト・いいね・コメントの別名を大文字小文字なしで読み、数は文字でもよい', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  await s.send(key, { kind: 'gift', USERID: 'u6', Nickname: 'ろく', AvatarUrl: 'https://example.com/a.png', GiftId: '5655', GiftName: 'Rose', Coins: '10', RepeatCount: '3' });
  await s.send(key, { kind: 'like', userId: 'u6', nickname: 'ろく', likeCount: '5', totalLikeCount: '50' });
  for (const [i, field] of ['avatar', 'avatar_url', 'profilePictureUrl'].entries()) {
    await s.send(key, { kind: 'follow', userId: `av${i}`, [field]: `https://example.com/${field}.png` });
  }
  const list = await s.recent(s.A);
  const gift = list.find((e) => e.kind === 'gift');
  assert.equal(gift.user.id, 'u6');
  assert.equal(gift.user.name, 'ろく');
  assert.equal(gift.user.avatar, 'https://example.com/a.png');
  assert.equal(gift.gift.id, '5655');
  assert.equal(gift.gift.name, 'Rose');
  assert.equal(gift.gift.diamonds, 10);
  assert.equal(gift.gift.count, 3);
  assert.equal(gift.totalDiamonds, 30);
  const like = list.find((e) => e.kind === 'like');
  assert.equal(like.count, 5);
  assert.equal(like.total, 50);
  for (const field of ['avatar_url', 'profilePictureUrl', 'avatar']) {
    const e = list.find((x) => x.user?.avatar === `https://example.com/${field}.png`);
    assert.ok(e, field);
  }
  // username は @ハンドル(id)になる
  await s.send(key, { kind: 'follow', username: 'handle7', nickname: 'なな' });
  const f = (await s.recent(s.A)).find((e) => e.kind === 'follow' && e.user.name === 'なな');
  assert.equal(f.user.id, 'handle7');
});

test('AC-6 コメントは comment/content/text/commandParams の順で最初の空でないもの', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  await s.send(key, { kind: 'chat', userId: 'c1', comment: '', content: '', text: 'テキスト', commandParams: 'パラム' });
  await s.send(key, { kind: 'chat', userId: 'c2', commandParams: 'だけパラム' });
  await s.send(key, { kind: 'chat', userId: 'c3', comment: 'コメント', content: 'コンテント' });
  const chats = (await s.recent(s.A)).filter((e) => e.kind === 'chat');
  const text = (id) => chats.find((e) => e.user.id === id).text;
  assert.equal(text('c1'), 'テキスト');
  assert.equal(text('c2'), 'だけパラム');
  assert.equal(text('c3'), 'コメント');
});

test('AC-7 正規化: source: ingest が付き、coins が無いギフトは gift-coins.json で補い、連打途中は来ない前提', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  const bundled = JSON.parse(fs.readFileSync(path.join(process.cwd(), 'src', 'gift-coins.json'), 'utf8')).coins;
  const id = Object.keys(bundled).find((k) => Number(bundled[k]) > 0);
  assert.ok(id, 'gift-coins.json に値がある');
  const res = await s.send(key, { kind: 'gift', ...user, giftId: id, giftName: 'Bundled', repeatCount: 2 });
  assert.equal(res.status, 200);
  const e = (await s.recent(s.A)).find((x) => x.kind === 'gift');
  assert.equal(e.source, 'ingest');
  assert.equal(e.gift.diamonds, Number(bundled[id]));
  assert.equal(e.totalDiamonds, Number(bundled[id]) * 2);
  const chat = await s.send(key, { kind: 'chat', ...user, comment: 'やあ' });
  assert.equal(chat.status, 200);
  assert.equal((await s.recent(s.A)).find((x) => x.kind === 'chat').source, 'ingest');
});

test('AC-8(c) eventId つきの再送は 200 で duplicate、2回目は数えない', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  const body = { kind: 'share', ...user, eventId: 'evt-1' };
  const first = await s.json(await s.send(key, body));
  assert.equal(first.ok, true);
  assert.notEqual(first.duplicate, true);
  const second = await s.send(key, body);
  assert.equal(second.status, 200);
  assert.deepEqual(await s.json(second), { ok: true, duplicate: true });
  assert.equal((await s.recent(s.A)).filter((e) => e.kind === 'share').length, 1);
  const state = await s.json(await s.api(s.A, '/api/ingest'));
  assert.equal(state.duplicates, 1);
  assert.equal(state.accepted, 1);
});

test('AC-8(b) 直近に別の経路から同じ内容が来ていたら捨てる(直接の TikTok 接続のかわりにテスト送信を使う)', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  // 直接の経路(source なし)で同じ内容のコメントが先に届く。テスト送信のユーザー id は demo_ が付く
  const direct = await s.api(s.A, '/api/simulate', { method: 'POST', body: { kind: 'chat', user: 'viewer1', text: '同じ文' } });
  assert.equal(direct.status, 200);
  const res = await s.send(key, { kind: 'chat', userId: 'demo_viewer1', comment: '同じ文' });
  assert.equal(res.status, 200);
  assert.deepEqual(await s.json(res), { ok: true, duplicate: true });
  assert.equal((await s.recent(s.A)).filter((e) => e.text === '同じ文').length, 1);
  // 違う内容は捨てない
  const other = await s.json(await s.send(key, { kind: 'chat', userId: 'viewer1', comment: '別の文' }));
  assert.notEqual(other.duplicate, true);
  // 同じ受け口から同じ内容が続けて来ても(別の経路ではないので)捨てない
  const again = await s.json(await s.send(key, { kind: 'chat', userId: 'viewer1', comment: '別の文' }));
  assert.notEqual(again.duplicate, true);
});

test('AC-8(a) 直接の接続が20秒以内に届けているあいだ、受け口の like は捨てる', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  const before = await s.json(await s.api(s.A, '/api/ingest'));
  assert.equal(before.direct.lastEventAt, null);
  // 直接の経路(source なし)で何か届ける
  await s.api(s.A, '/api/simulate', { method: 'POST', body: { kind: 'follow', user: 'direct1' } });
  const mid = await s.json(await s.api(s.A, '/api/ingest'));
  assert.ok(mid.direct.lastEventAt > 0, '直接の最後の時刻を持つ');
  const like = await s.json(await s.send(key, { kind: 'like', ...user, likeCount: 3, totalLikeCount: 30 }));
  assert.equal(like.duplicate, true);
  // like 以外は(内容が別なら)通る
  const share = await s.json(await s.send(key, { kind: 'share', userId: 'someone-else' }));
  assert.notEqual(share.duplicate, true);
  const state = await s.json(await s.api(s.A, '/api/ingest'));
  assert.equal(state.duplicates >= 1, true);
});

test('AC-9 送りすぎ: 瞬間 40 回を超えると 429 と Retry-After と日本語の理由、少し待てば戻る', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  const results = await Promise.all(Array.from({ length: 80 }, (_, i) => s.send(key, { kind: 'follow', userId: `r${i}` })));
  const limited = results.filter((r) => r.status === 429);
  assert.ok(limited.length > 0, '429 が出る');
  assert.ok(results.filter((r) => r.status === 200).length <= 45, '通るのは瞬間 40 回前後まで');
  assert.ok(Number(limited[0].headers.get('retry-after')) >= 1);
  assert.match(await limited[0].text(), /[぀-ヿ一-鿿]/);
  // 別の鍵(別の配信者)は影響を受けない
  const other = await s.makeKey(s.C);
  assert.equal((await s.send(other, { kind: 'follow', userId: 'x' })).status, 200);
  await sleep(1500);
  assert.equal((await s.send(key, { kind: 'follow', userId: 'back' })).status, 200);
  const state = await s.json(await s.api(s.A, '/api/ingest'));
  assert.equal(state.limited, limited.length);
});

test('AC-9 本文は 16KB まで(413)。個数 9999・コメント 150 文字・名前 40 文字に切る', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  const big = await s.send(key, { kind: 'chat', ...user, comment: 'あ'.repeat(17 * 1024) });
  assert.equal(big.status, 413);
  await sleep(1100);
  await s.send(key, { kind: 'gift', userId: 'cap', nickname: 'N'.repeat(100), giftId: '1', giftName: 'G', coins: 1, repeatCount: 100000 });
  await s.send(key, { kind: 'chat', userId: 'cap2', comment: 'あ'.repeat(500) });
  const list = await s.recent(s.A);
  const gift = list.find((e) => e.kind === 'gift');
  assert.equal(gift.gift.count, 9999);
  assert.equal(gift.user.name.length, 40);
  assert.equal(list.find((e) => e.kind === 'chat').text.length, 150);
});

test('AC-10 test=true(または ?test=1)は test: true を付けて流す。付けなければ付かない', async () => {
  const s = await boot();
  const key = await s.makeKey(s.A);
  await s.send(key, { kind: 'follow', userId: 't1', test: true });
  await s.send(key, { kind: 'follow', userId: 't2' }, { query: '?test=1' });
  await s.send(key, { kind: 'follow', userId: 't3' });
  const list = await s.recent(s.A);
  const by = (id) => list.find((e) => e.user.id === id);
  assert.equal(by('t1').test, true);
  assert.equal(by('t2').test, true);
  assert.notEqual(by('t3').test, true);
});

test('AC-11 課金で接続が止められた配信者は 403(日本語)。判定が通る配信者は受ける', async () => {
  const s = await boot();
  const keyPay = await s.makeKey(s.PAY);
  const res = await s.send(keyPay, { kind: 'follow', ...user });
  assert.equal(res.status, 403);
  assert.match(await res.text(), /[぀-ヿ一-鿿]/);
  const keyA = await s.makeKey(s.A);
  assert.equal((await s.send(keyA, { kind: 'follow', ...user })).status, 200);
});

test('AC-12 hub.publish は source を落とさない', () => {
  const hub = new Hub();
  let seen = null;
  hub.on('event', (e) => { seen = e; });
  hub.publish({ kind: 'follow', user: { id: 'u', name: 'u', avatar: null }, source: 'ingest' });
  assert.equal(seen.source, 'ingest');
  assert.equal(hub.recent[0].source, 'ingest');
});

test('AC-13 状態: 決まった形で、鍵の全文・要約は入れず、ingest.json に数は残さない', async () => {
  const s = await boot();
  const empty = await s.json(await s.api(s.A, '/api/ingest'));
  assert.equal(empty.enabled, false);
  const key = await s.makeKey(s.A);
  await s.send(key, { kind: 'follow', ...user });
  await s.send(key, { kind: 'follow', ...user, eventId: 'e' });
  await s.send(key, { kind: 'follow', ...user, eventId: 'e' });
  await s.send(key, { kind: 'dance' });
  const res = await s.api(s.A, '/api/ingest');
  const text = await res.text();
  const state = JSON.parse(text);
  for (const k of ['enabled', 'keyHint', 'keyCreatedAt', 'lastEventAt', 'accepted', 'duplicates', 'limited', 'rejected', 'byKind', 'direct']) {
    assert.ok(k in state, k);
  }
  assert.equal(state.enabled, true);
  assert.equal(state.keyHint.endsWith(key.slice(-4)), true);
  assert.equal(state.accepted, 2);
  assert.equal(state.duplicates, 1);
  assert.equal(state.rejected, 1);
  assert.equal(state.byKind.follow, 2);
  assert.ok(state.lastEventAt > 0);
  assert.ok('lastEventAt' in state.direct);
  assert.ok(!text.includes(key));
  assert.ok(!text.includes(sha256(key)));
  const saved = JSON.parse(fs.readFileSync(path.join(s.dataDir, 'tenants', 'aaa', 'ingest.json'), 'utf8'));
  assert.ok(!('accepted' in saved) && !('byKind' in saved) && !('lastEventAt' in saved));
});
