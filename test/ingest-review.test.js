// ingest 3巡目レビューの再現テスト。HTTPの外側に依存しない不具合を直接確かめる。
import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Hub } from '../src/hub.js';
import { Ingest } from '../src/ingest.js';
import { IngestKeyStore } from '../src/ingest-keys.js';
import { Tenants } from '../src/tenants.js';

const roots = [];
after(() => {
  for (const dir of roots) fs.rmSync(dir, { recursive: true, force: true });
});

function response() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    set(name, value) { this.headers.set(name, value); return this; },
    type(value) { this.headers.set('content-type', value); return this; },
    send(value) { this.body = value; return this; },
    json(value) { this.body = value; return this; },
  };
}

function request(raw, { contentLength = undefined } = {}) {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(contentLength === undefined ? {} : { 'content-length': String(contentLength) }) },
    query: {},
    async *[Symbol.asyncIterator]() { yield Buffer.from(raw); },
  };
}

function keyStore() {
  return { data: { hash: 'present', hint: 'test', createdAt: 'now' }, authenticate: () => true };
}

test('JSONのnull本文は応答なしにならず、日本語の400になる', async () => {
  const ingest = new Ingest(new Hub(), { keyStore: keyStore() });
  const res = response();

  await ingest.handle(request('null'), res, 'twin_test');

  assert.equal(res.statusCode, 400);
  assert.match(res.body, /[぀-ヿ一-鿿]/);
});

test('username が @ だけなら userId に戻り、uniqueId を空にしない', () => {
  const ingest = new Ingest(new Hub(), { keyStore: keyStore() });
  const event = ingest.normalize('comment', { username: '@', userid: 'fallback-user', comment: '本文' });
  assert.equal(event.user.id, 'fallback-user');
});

test('本文が16KBを超えたら、chunkedの読み込みを続けず413にする', async () => {
  const ingest = new Ingest(new Hub(), { keyStore: keyStore() });
  const res = response();
  let calls = 0;
  const req = {
    headers: { 'content-type': 'application/json' },
    async *[Symbol.asyncIterator]() {
      calls++;
      yield Buffer.alloc(16 * 1024 + 1);
      calls++;
      throw new Error('上限を超えた後も読み込んだ');
    },
  };

  await ingest.readBody(req, res);

  assert.equal(res.statusCode, 413);
  assert.equal(calls, 1);
});

test('429の判定は本文を読み込む前に行う', async () => {
  const ingest = new Ingest(new Hub(), { keyStore: keyStore() });
  ingest.tokens = 0;
  ingest.emptyAt = Date.now();
  const res = response();
  let read = false;
  const req = {
    method: 'POST',
    headers: {},
    query: {},
    [Symbol.asyncIterator]() {
      read = true;
      return { next: () => new Promise(() => {}) };
    },
  };

  await Promise.race([
    ingest.handle(req, res, 'twin_test'),
    new Promise((_, reject) => setTimeout(() => reject(new Error('本文を待ち続けた')), 300)),
  ]);

  assert.equal(res.statusCode, 429);
  assert.equal(read, false);
});

test('配信者を削除したら ingest key のキャッシュも消す', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ingest-cache-'));
  roots.push(dir);
  fs.writeFileSync(path.join(dir, 'tenants.json'), JSON.stringify({ tenants: [{ id: 'aaa', name: 'A' }], global: { access: {} } }));
  const tenants = new Tenants({ dir });
  const tenantDir = tenants.dataDir('aaa');
  const key = new IngestKeyStore({ dir: tenantDir }).create();
  assert.equal(tenants.byIngestKey(key.value)?.id, 'aaa');
  assert.equal(tenants.ingestKeys.has('aaa'), true);

  await tenants.remove('aaa');

  assert.equal(tenants.ingestKeys.has('aaa'), false);
});

test('デモのテストイベントは直接接続の重複防止を発動させない', async () => {
  let now = 1_000_000;
  const hub = new Hub();
  const ingest = new Ingest(hub, { keyStore: keyStore(), now: () => now });
  hub.publish({ kind: 'like', count: 1, total: 1, user: { id: 'demo', name: 'デモ' }, test: true, source: 'demo' });
  const res = response();

  await ingest.handle(request(JSON.stringify({ kind: 'like', userId: 'real', likeCount: 1, eventId: 'live-like-1' })), res, 'twin_test');

  assert.deepEqual(res.body, { ok: true });
});

test('直接のTikTokイベントだけが外部いいねを重複扱いにする', async () => {
  let now = 1_000_000;
  const hub = new Hub();
  const ingest = new Ingest(hub, { keyStore: keyStore(), now: () => now });
  hub.publish({ kind: 'like', count: 1, total: 1, user: { id: 'live', name: '配信者' }, source: 'tiktok' });
  const res = response();

  await ingest.handle(request(JSON.stringify({ kind: 'like', userId: 'external', likeCount: 1, eventId: 'live-like-2' })), res, 'twin_test');

  assert.deepEqual(res.body, { ok: true, duplicate: true });
});

test('重複で捨てたeventIdは記録せず、同じIDを後で受け付ける', async () => {
  let now = 1_000_000;
  const hub = new Hub();
  const ingest = new Ingest(hub, { keyStore: keyStore(), now: () => now });
  hub.publish({ kind: 'like', count: 1, total: 1, user: { id: 'live', name: '配信者' }, source: 'tiktok' });
  const rejected = response();
  await ingest.handle(request(JSON.stringify({ kind: 'like', userId: 'external', likeCount: 1, eventId: 'reuse-1' })), rejected, 'twin_test');

  now += 21_000;
  const accepted = response();
  await ingest.handle(request(JSON.stringify({ kind: 'follow', userId: 'external', eventId: 'reuse-1' })), accepted, 'twin_test');

  assert.deepEqual(accepted.body, { ok: true });
});

test('test=trueのeventIdは本番イベントの同じIDを塞がない', async () => {
  let now = 1_000_000;
  const hub = new Hub();
  const ingest = new Ingest(hub, { keyStore: keyStore(), now: () => now });
  const testResponse = response();
  await ingest.handle(request(JSON.stringify({ kind: 'follow', userId: 'demo', eventId: 'same-1', test: true })), testResponse, 'twin_test');
  const liveResponse = response();
  await ingest.handle(request(JSON.stringify({ kind: 'follow', userId: 'real', eventId: 'same-1' })), liveResponse, 'twin_test');

  assert.deepEqual(liveResponse.body, { ok: true });
});
