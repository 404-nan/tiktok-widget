// 配信者向けAI入口の受け入れテスト。発行範囲、提案、テスト送信、失効を確認する。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AiTokenStore } from '../src/ai-tokens.js';
import { createAiControl } from '../src/ai-api.js';

const originalEnv = { TW_ENV: process.env.TW_ENV, PORT: process.env.PORT };
process.env.TW_ENV = 'dev';
process.env.PORT = '3940';
test.after(() => {
  if (originalEnv.TW_ENV == null) delete process.env.TW_ENV; else process.env.TW_ENV = originalEnv.TW_ENV;
  if (originalEnv.PORT == null) delete process.env.PORT; else process.env.PORT = originalEnv.PORT;
});

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tiktok-widget-ai-streamer-'));
}

function fakeTarget() {
  let saved = 0;
  let testEvents = 0;
  const config = { theme: { accent: '#FF4F1F' } };
  return {
    target: {
      runtime: {
        aiLive: () => false,
        configVersion: () => 'v1',
        getConfig: () => structuredClone(config),
        previewConfig: (_op, key, value) => ({ ok: true, config: { theme: { accent: value } }, errors: [], warnings: [] }),
        readIssues: () => ({ errors: [], warnings: [] }),
        readStatus: () => ({ likes: 0 }),
        simulateEvent: () => { testEvents += 1; return { status: 200, body: { ok: true, test: true } }; },
        setConfig: () => { saved += 1; return { ok: true, warnings: [] }; },
      },
    },
    get saved() { return saved; },
    get testEvents() { return testEvents; },
  };
}

function setup() {
  const dir = tempDir();
  const tokens = new AiTokenStore({ dir });
  const fake = fakeTarget();
  const control = createAiControl({
    dataDir: dir,
    tokens,
    resolveTenant: (id) => id === 'tenant-a' ? fake.target : null,
  });
  const issued = tokens.issueStreamer({ tenantId: 'tenant-a', name: '配信者のAI', days: 7, now: Date.now() });
  return { dir, tokens, control, fake, issued };
}

test('配信者トークンは自分のテナント1つと read/suggest/test だけを持つ', () => {
  const { issued } = setup();
  assert.deepEqual(issued.token.tenants, ['tenant-a']);
  assert.deepEqual(issued.token.scopes, ['read', 'suggest', 'test']);
  assert.equal(issued.token.kind, 'streamer');
});

test('配信者トークンは別テナント、管理者scope、書き込みscopeを選べない', () => {
  const { tokens } = setup();
  assert.throws(() => tokens.issueStreamer({ tenantId: 'tenant-a', name: '全体', tenants: ['*'], scopes: ['admin'] }), /配信者専用/);
  assert.throws(() => tokens.issueStreamer({ tenantId: 'tenant-a', name: '別人', tenant: 'tenant-b' }), /配信者専用/);
});

test('設定提案は差分・検証・配信中を返すが設定を保存しない', async () => {
  const { control, issued, fake } = setup();
  const result = await control.dispatch(issued.token, 'suggest_config', { tenant: 'tenant-a', path: 'theme.accent', value: '#FFC53D' }, { req: { headers: {} }, tokenValue: issued.value });
  assert.equal(result.status, 200);
  assert.equal(result.body.dryRun, true);
  assert.deepEqual(result.body.diff.after, '#FFC53D');
  assert.deepEqual(result.body.validation, { ok: true, errors: [], warnings: [] });
  assert.equal(result.body.live, false);
  assert.equal(fake.saved, 0);
});

test('配信者トークンの設定保存・操作・課金申請は拒否する', async () => {
  const { control, issued } = setup();
  const result = await control.dispatch(issued.token, 'set_config', { tenant: 'tenant-a', path: 'theme.accent', value: '#111113' }, { req: { headers: {} }, tokenValue: issued.value });
  assert.equal(result.status, 403);
  assert.match(result.body.error, /権限/);
});

test('テスト送信は開発環境だけで、ランタイムの保存値を変えない', async () => {
  const { control, issued, fake } = setup();
  const result = await control.dispatch(issued.token, 'test_event', { tenant: 'tenant-a', kind: 'like', count: 1 }, { req: { headers: {}, protocol: 'http', get: () => '127.0.0.1:3940' }, tokenValue: issued.value });
  assert.equal(result.status, 200);
  assert.equal(fake.testEvents, 1);
  assert.equal(fake.saved, 0);
});

test('失効後は同じBearer値を認証できない', () => {
  const { tokens, issued } = setup();
  tokens.revoke(issued.token.id);
  assert.equal(tokens.authenticate(issued.value), null);
});
