// 本番前レビューの指摘を、実際のAI制御・トークンストア・公開画面の形で再現する。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { AiTokenStore } from '../src/ai-tokens.js';
import { createAiControl } from '../src/ai-api.js';

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'tiktok-widget-review-'));
}

test('ウィジェット一覧はリクエストHostから外部URLを作らない', async () => {
  const dir = tempDir();
  const tokens = new AiTokenStore({ dir });
  const issued = tokens.issue({ name: '確認', tenants: ['tenant-a'], scopes: ['read'] });
  const control = createAiControl({
    dataDir: dir,
    tokens,
    resolveTenant: () => ({
      runtime: { readWidgets: (base) => [{ section: 'alerts', id: 'default', url: `${base}/widgets/alerts.html` }], aiLive: () => false },
      widgetBaseFor: (req) => `http://${req.get('host')}/t/secret`,
    }),
  });

  const result = await control.dispatch(issued.token, 'list_widget_urls', { tenant: 'tenant-a' }, {
    req: { protocol: 'http', get: () => 'evil.example:3940' },
  });
  assert.equal(result.status, 403);
  assert.match(result.body.error, /開発用の接続先/);
});

test('配信者トークンはテナントごとに有効な10件までで、期限切れを整理する', () => {
  const tokens = new AiTokenStore({ dir: tempDir() });
  const now = Date.parse('2026-10-19T00:00:00.000Z');
  tokens.issueStreamer({ tenantId: 'tenant-a', name: '期限切れ', expiresAt: '2026-10-18T00:00:00.000Z', now });
  for (let i = 0; i < 10; i += 1) tokens.issueStreamer({ tenantId: 'tenant-a', name: `有効${i}`, days: 1, now });
  assert.equal(tokens.listForTenant('tenant-a').length, 10);
  assert.throws(() => tokens.issueStreamer({ tenantId: 'tenant-a', name: '11件目', days: 1, now }), /10件まで/);
});

test('配信者トークンの発行は保存を1回だけ行う', () => {
  const tokens = new AiTokenStore({ dir: tempDir() });
  let saves = 0;
  const originalSave = tokens.save.bind(tokens);
  tokens.save = () => { saves += 1; originalSave(); };
  tokens.issueStreamer({ tenantId: 'tenant-a', name: '1回保存', days: 1 });
  assert.equal(saves, 1);
});

test('管理画面は提案権限を選べ、一覧でも日本語名を表示する', () => {
  const tokens = new AiTokenStore({ dir: tempDir() });
  assert.throws(() => tokens.issue({ name: '不正な権限', tenants: ['tenant-a'], scopes: ['unknown'] }), /設定を提案する/);
  const source = fs.readFileSync(path.join(process.cwd(), 'public/admin/admin.js'), 'utf8');
  assert.match(source, /\['suggest',\s*'設定を提案する'\]/);
  assert.match(source, /AI_SCOPE_LABEL\[scope\]/);
});

test('配信者画面は期限切れと期限間近を日本語で示す', () => {
  const source = fs.readFileSync(path.join(process.cwd(), 'public/dashboard/ai-streamer.js'), 'utf8');
  assert.match(source, /function streamerTokenStatus\(token, now/);
  assert.match(source, /期限切れ/);
  assert.match(source, /まもなく期限/);
});
