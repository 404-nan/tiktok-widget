import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { createStore } from '../src/config.js';
import { createRuntime } from '../src/runtime.js';
import { AiTokenStore, hashToken } from '../src/ai-tokens.js';
import { createAiControl, classifyConfigPath } from '../src/ai-api.js';
import { SCHEMA } from '../src/schema.js';
import { createAiMcpHandler } from '../src/ai-mcp.js';
import { adminGuard } from '../src/admin-auth.js';
import { BillingStore } from '../src/billing.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function withEnv(patch, fn) {
  const before = {};
  for (const key of Object.keys(patch)) before[key] = process.env[key];
  for (const [key, value] of Object.entries(patch)) {
    if (value == null) delete process.env[key];
    else process.env[key] = value;
  }
  const done = () => {
    for (const [key, value] of Object.entries(before)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  };
  try {
    const out = fn();
    if (out && typeof out.then === 'function') return out.finally(done);
    done();
    return out;
  } catch (err) {
    done();
    throw err;
  }
}

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-ai-'));
  const billing = new BillingStore({ dir, env: { TW_ENV: 'dev', TW_BILLING: 'off' } });
  const a = createRuntime({ id: 'a', store: createStore(path.join(dir, 'tenants', 'a', 'config.yaml')), dataDir: path.join(dir, 'tenants', 'a'), mediaDirs: [dir] });
  const b = createRuntime({ id: 'b', store: createStore(path.join(dir, 'tenants', 'b', 'config.yaml')), dataDir: path.join(dir, 'tenants', 'b'), mediaDirs: [dir] });
  const widgets = { a: ['alerts'], b: ['goals'] };
  const templates = { a: null, b: 'custom' };
  const tokens = new AiTokenStore({ dir });
  const control = createAiControl({
    dataDir: dir,
    tokens,
    resolveTenant(id) {
      const runtime = id === 'a' ? a : id === 'b' ? b : null;
      if (!runtime) return null;
      return {
        id,
        runtime,
        widgetBase: 'http://127.0.0.1/t/obs',
        getWidgets: () => [...widgets[id]],
        setWidgets: (list) => { widgets[id] = [...list]; },
        getTemplate: () => templates[id],
        setTemplate: (template) => { templates[id] = template ?? null; },
      };
    },
    applyBilling({ global, tenant, patch }) {
      if (global) return billing.setGlobal(patch);
      return billing.setAccount(tenant, patch);
    },
  });
  const app = express();
  app.use(express.json());
  const admin = express.Router();
  admin.use(adminGuard('admin-secret'));
  control.mountAdmin(admin);
  app.use('/admin/api', admin);
  app.use('/ai/v1', control.router);
  app.use('/ai/mcp', createAiMcpHandler(control));
  const server = createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return {
    dir, base, tokens, billing, a, b, widgets, templates,
    async close() {
      server.closeAllConnections?.();
      await new Promise((resolve) => server.close(resolve));
      await a.close();
      await b.close();
    },
  };
}

const adminHeaders = { 'content-type': 'application/json', 'x-admin-token': 'admin-secret' };
const bearer = (value) => ({ authorization: `Bearer ${value}`, 'content-type': 'application/json' });

function mcpClient(child) {
  let buf = '';
  const queue = [];
  const waiters = [];
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk) => {
    buf += chunk;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).replace(/\r$/, '');
      buf = buf.slice(nl + 1);
      if (!line.trim()) continue;
      let msg;
      try { msg = JSON.parse(line); } catch { continue; }
      if (waiters.length) waiters.shift()(msg);
      else queue.push(msg);
    }
  });
  return {
    send(msg) {
      child.stdin.write(`${JSON.stringify(msg)}\n`);
      if (queue.length) return Promise.resolve(queue.shift());
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('MCP の返事がありません')), 8000);
        waiters.push((value) => { clearTimeout(timer); resolve(value); });
      });
    },
  };
}

test('禁止パスは表記ゆれと中身も拒否し、普通の項目は通す', () => {
  const denied = [
    'apiKey', 'api-key', 'API_KEY', 'api.keys', 'accessToken', 'refreshToken',
    'pinCode', 'pinDigits', 'connectionUrl', 'connectOptions', 'theme.nested.apiKey',
    '__proto__.polluted', 'constructor.prototype.x', 'theme.constructor', 'minecraft.host', 'minecraft.port',
  ];
  for (const configPath of denied) assert.equal(classifyConfigPath(configPath), 'deny', configPath);
  assert.equal(classifyConfigPath('theme', { nested: { apiKey: 'sekret' } }), 'deny');
  assert.equal(classifyConfigPath('alerts.default.rules', [{ pinCode: '1234', label: 'x' }]), 'deny');
  assert.equal(classifyConfigPath('theme.extra', { list: [{ accessToken: 'x' }] }), 'deny');
  assert.equal(classifyConfigPath('theme.extra', JSON.parse('{"__proto__":{"polluted":true}}')), 'deny');
  assert.equal(classifyConfigPath('theme.extra', { constructor: { prototype: { polluted: true } } }), 'deny');
  assert.equal(classifyConfigPath('theme', { switch: true }), 'deny');
  assert.equal(classifyConfigPath('theme.accent', '#112233'), 'ok');
  assert.equal(classifyConfigPath('billing.plan'), 'billing');
  assert.equal(classifyConfigPath('billing.multiplier'), 'billing');
  assert.equal(classifyConfigPath('billing', { plan: 'flat2000' }), 'billing');
  for (const [section, def] of Object.entries(SCHEMA)) {
    for (const field of Object.keys(def.fields)) {
      const secret = section === 'minecraft' && ['host', 'port', 'password'].includes(field);
      assert.equal(classifyConfigPath(`${section}.${field}`), secret ? 'deny' : 'ok', `${section}.${field}`);
      if (def.kind === 'map') assert.equal(classifyConfigPath(`${section}.default.${field}`), 'ok', `${section}.default.${field}`);
    }
  }
});

test('AI のトークンと安全柵', { concurrency: false }, async (t) => {
  const previousEnv = { TW_ENV: process.env.TW_ENV, TW_AI_WRITE: process.env.TW_AI_WRITE };
  process.env.TW_ENV = 'dev';
  process.env.TW_AI_WRITE = 'on';
  const ctx = await boot();
  t.after(() => {
    if (previousEnv.TW_ENV === undefined) delete process.env.TW_ENV;
    else process.env.TW_ENV = previousEnv.TW_ENV;
    if (previousEnv.TW_AI_WRITE === undefined) delete process.env.TW_AI_WRITE;
    else process.env.TW_AI_WRITE = previousEnv.TW_AI_WRITE;
    return ctx.close();
  });
  const yaml = () => ctx.a.readText();
  const issue = (scopes, tenants = ['a'], extra = {}) => ctx.tokens.issue({ name: '試験', tenants, scopes, ...extra });
  const call = (value, url, options = {}) => fetch(`${ctx.base}${url}`, { ...options, headers: { ...bearer(value), ...options.headers } });

  await t.test('トークンは要約だけ保存し、期限切れと失効で使えない', async () => {
    const issued = issue(['read']);
    const file = fs.readFileSync(path.join(ctx.dir, 'ai-tokens.json'), 'utf8');
    assert.equal(file.includes(issued.value), false);
    assert.equal(file.includes('twai_'), false);
    assert.equal(file.includes(hashToken(issued.value).toString('hex')), true);
    assert.equal(fs.statSync(path.join(ctx.dir, 'ai-tokens.json')).mode & 0o777, 0o600);
    const listed = await fetch(`${ctx.base}/admin/api/ai-tokens`, { headers: adminHeaders });
    const listBody = await listed.json();
    assert.equal(JSON.stringify(listBody).includes(issued.value), false);
    const ok = await call(issued.value, '/ai/v1/status?tenant=a');
    assert.equal(ok.status, 200);
    const expired = ctx.tokens.issue({ name: '期限', tenants: ['a'], scopes: ['read'], expiresAt: '2000-01-01T00:00:00.000Z' });
    assert.equal((await call(expired.value, '/ai/v1/status?tenant=a')).status, 401);
    const revoked = await fetch(`${ctx.base}/admin/api/ai-tokens`, {
      method: 'POST',
      headers: adminHeaders,
      body: JSON.stringify({ name: '消す', tenants: ['a'], scopes: ['read'] }),
    });
    const revokedBody = await revoked.json();
    assert.equal(revoked.status, 201);
    assert.equal(String(revokedBody.value).startsWith('twai_'), true);
    const gone = await fetch(`${ctx.base}/admin/api/ai-tokens/${revokedBody.token.id}`, { method: 'DELETE', headers: adminHeaders });
    assert.equal(gone.status, 200);
    assert.equal((await call(revokedBody.value, '/ai/v1/status?tenant=a')).status, 401);
    assert.equal((await call('twai_not-a-real-token', '/ai/v1/status?tenant=a')).status, 401);
  });

  await t.test('権限ごとに可否が分かれ、他の配信者は拒否する', async () => {
    await withEnv({ TW_ENV: 'dev', TW_AI_WRITE: 'on' }, async () => {
      const read = issue(['read']);
      assert.equal((await call(read.value, '/ai/v1/status?tenant=a')).status, 200);
      assert.equal((await call(read.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.accent', value: '#112233' }) })).status, 403);
      const write = issue(['write']);
      const wrote = await call(write.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.accent', value: '#112233' }) });
      assert.equal(wrote.status, 200);
      assert.equal((await call(write.value, '/ai/v1/roulette/spin', { method: 'POST', body: JSON.stringify({ tenant: 'a', id: 'punishment' }) })).status, 403);
      const operate = issue(['operate', 'write']);
      const spun = await call(operate.value, '/ai/v1/roulette/spin', { method: 'POST', body: JSON.stringify({ tenant: 'a', id: 'punishment' }) });
      assert.equal(spun.status, 200);
      const spunBody = await spun.json();
      const foreignUndo = await call(issue(['write']).value, '/ai/v1/undo', { method: 'POST', body: JSON.stringify({ tenant: 'a', changeId: spunBody.changeId }) });
      assert.equal(foreignUndo.status, 403);
      assert.equal((await foreignUndo.json()).error, 'この変更は別のトークンが作ったので取り消せません');
      const undone = await call(operate.value, '/ai/v1/undo', { method: 'POST', body: JSON.stringify({ tenant: 'a', changeId: spunBody.changeId }) });
      assert.equal(undone.status, 400);
      assert.equal((await undone.json()).error, 'ルーレットを回すなどの操作は取り消せません');
      const admin = issue(['admin']);
      const widgets = await call(admin.value, '/ai/v1/tenant/widgets', { method: 'POST', body: JSON.stringify({ tenant: 'a', widgets: ['alerts', 'goals'] }) });
      assert.equal(widgets.status, 200);
      assert.deepEqual(ctx.widgets.a, ['alerts', 'goals']);
      assert.equal((await call(admin.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.accent', value: '#AABBCC' }) })).status, 403);
      const foreign = issue(['read'], ['b']);
      assert.equal((await call(foreign.value, '/ai/v1/status?tenant=a')).status, 403);
      assert.equal((await call(foreign.value, '/ai/v1/status?tenant=b')).status, 200);
      const all = issue(['read'], ['*']);
      assert.equal((await call(all.value, '/ai/v1/config?tenant=b')).status, 200);
    });
  });

  await t.test('本番のテスト送信と、書き込み停止と、配信中を拒否する', async () => {
    const writer = issue(['write', 'read']);
    const tester = issue(['test']);
    const before = yaml();
    await withEnv({ TW_ENV: 'production', TW_AI_WRITE: 'on' }, async () => {
      const denied = await call(tester.value, '/ai/v1/test/event', { method: 'POST', body: JSON.stringify({ tenant: 'a', kind: 'gift', giftName: 'Rose' }) });
      assert.equal(denied.status, 403);
      ctx.a.hub.setStatus({ mode: 'live', username: 'tester' });
      try {
        const blocked = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.accent', value: '#010101' }) });
        assert.equal(blocked.status, 403);
        assert.equal((await blocked.json()).error, '配信中はAIから変更できません');
        const preview = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.accent', value: '#010101', dryRun: true }) });
        assert.equal(preview.status, 200);
        assert.equal(yaml(), before);
        const status = await call(writer.value, '/ai/v1/status?tenant=a');
        assert.equal(status.status, 200);
        ctx.a.hub.setStatus({ mode: 'connecting' });
        const operator = issue(['operate']);
        const connecting = await call(operator.value, '/ai/v1/roulette/spin', { method: 'POST', body: JSON.stringify({ tenant: 'a', id: 'punishment' }) });
        assert.equal(connecting.status, 403);
        assert.equal((await connecting.json()).error, '配信中はAIから変更できません');
      } finally {
        ctx.a.hub.setStatus({ mode: 'idle', username: null, message: '' });
      }
    });
    await withEnv({ TW_ENV: 'production', TW_AI_WRITE: null }, async () => {
      const off = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.accent', value: '#020202', dryRun: true }) });
      assert.equal(off.status, 403);
      assert.equal((await call(writer.value, '/ai/v1/status?tenant=a')).status, 200);
    });
    await withEnv({ TW_ENV: 'dev', TW_AI_WRITE: 'on' }, async () => {
      const allowed = await call(tester.value, '/ai/v1/test/event', { method: 'POST', body: JSON.stringify({ tenant: 'a', kind: 'chat', user: '試験さん' }) });
      assert.equal(allowed.status, 200);
    });
  });

  await t.test('課金は申請だけ、禁止パスは保存しない', async () => {
    const writer = issue(['write']);
    const before = yaml();
    const blocked = ['minecraft.password', 'pin', 'apiKeys.main', 'connect.user', 'billing.enforcement', 'stayConnected'];
    for (const configPath of blocked) {
      const res = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: configPath, value: 'super-secret-pass' }) });
      assert.equal(res.status, 403, configPath);
    }
    assert.equal(yaml(), before);
    assert.equal(fs.existsSync(path.join(ctx.dir, 'ai-approvals.json')), false);
    const asked = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'billing.plan', value: 'flat2000' }) });
    assert.equal(asked.status, 202);
    const askedBody = await asked.json();
    assert.equal(askedBody.status, '承認待ち');
    assert.equal(yaml(), before);
    const stored = fs.readFileSync(path.join(ctx.dir, 'ai-approvals.json'), 'utf8');
    assert.equal(stored.includes('承認待ち'), true);
    assert.equal(stored.includes('flat2000'), true);
    assert.equal(ctx.billing.adminView('a').plan, null);
    const approved = await fetch(`${ctx.base}/admin/api/ai-approvals/${askedBody.approvalId}/approve`, { method: 'POST', headers: adminHeaders });
    assert.equal(approved.status, 200);
    assert.equal(ctx.billing.adminView('a').plan, 'flat2000');
    assert.equal(yaml(), before);
  });

  await t.test('dry-run は保存せず、版が違うと 409、undo は値が同じときだけ', async () => {
    const writer = issue(['write', 'read']);
    const original = await (await call(writer.value, '/ai/v1/config?tenant=a&path=theme.accent')).json();
    const before = yaml();
    const preview = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.accent', value: '#334455', dryRun: true }) });
    const previewBody = await preview.json();
    assert.equal(preview.status, 200);
    assert.equal(previewBody.dryRun, true);
    assert.equal(previewBody.validation.ok, true);
    assert.equal(typeof previewBody.live, 'boolean');
    assert.equal(typeof previewBody.configVersion, 'string');
    assert.equal(previewBody.diff.after, '#334455');
    assert.equal(yaml(), before);
    const changed = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.accent', value: '#334455' }) });
    const changedBody = await changed.json();
    assert.equal(changed.status, 200);
    assert.notEqual(yaml(), before);
    const back = await call(writer.value, '/ai/v1/undo', { method: 'POST', body: JSON.stringify({ tenant: 'a', changeId: changedBody.changeId }) });
    assert.equal(back.status, 200);
    const restored = await (await call(writer.value, '/ai/v1/config?tenant=a&path=theme.accent')).json();
    assert.equal(restored.value, original.value);
    const first = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.accent', value: '#445566' }) });
    const firstBody = await first.json();
    const second = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.accent', value: '#556677' }) });
    assert.equal(second.status, 200);
    const conflict = await call(writer.value, '/ai/v1/undo', { method: 'POST', body: JSON.stringify({ tenant: 'a', changeId: firstBody.changeId }) });
    assert.equal(conflict.status, 409);
    assert.equal((await conflict.json()).error, '後から変更されています');
    const still = await (await call(writer.value, '/ai/v1/config?tenant=a&path=theme.accent')).json();
    assert.equal(still.value, '#556677');
    await withEnv({ TW_ENV: 'production', TW_AI_WRITE: 'on' }, async () => {
      const version = (await (await call(writer.value, '/ai/v1/config?tenant=a')).json()).configVersion;
      const mismatch = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.accent', value: '#667788', baseVersion: 'old' }) });
      assert.equal(mismatch.status, 409);
      const matched = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.accent', value: '#667788', baseVersion: version }) });
      assert.equal(matched.status, 200);
    });
  });

  await t.test('監査にトークンの値と秘密が残らず、書き込みは1分に30回', async () => {
    const writer = issue(['write']);
    await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'minecraft.password', value: 'super-secret-pass' }) });
    await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.gold', value: '#FFC53D' }) });
    const audit = fs.readFileSync(path.join(ctx.dir, 'ai-audit.jsonl'), 'utf8');
    assert.equal(audit.includes(writer.value), false);
    assert.equal(audit.includes('twai_'), false);
    assert.equal(audit.includes('super-secret-pass'), false);
    assert.equal(audit.includes(writer.token.id), true);
    const limited = issue(['write']);
    let last = 0;
    for (let i = 0; i < 31; i += 1) {
      const res = await call(limited.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.scale', value: 1, dryRun: true }) });
      last = res.status;
      if (i < 30) assert.equal(res.status, 200, `回 ${i}`);
    }
    assert.equal(last, 429);
    assert.equal((await call(writer.value, '/ai/v1/connect', { method: 'POST', body: '{}' })).status, 404);
    assert.equal((await call(writer.value, '/ai/v1/disconnect', { method: 'POST', body: '{}' })).status, 404);
  });

  await t.test('禁止パスはネストでも保存せず、読み取りも拒否する', async () => {
    const writer = issue(['write', 'read']);
    const before = yaml();
    const paths = ['apiKey', 'accessToken', 'refreshToken', 'pinCode', 'connectOptions', 'connectionUrl', '__proto__.polluted', 'constructor.prototype.polluted'];
    for (const configPath of paths) {
      const wrote = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: configPath, value: 'sekret-value' }) });
      assert.equal(wrote.status, 403, configPath);
      const read = await call(writer.value, `/ai/v1/config?tenant=a&path=${encodeURIComponent(configPath)}`);
      assert.equal(read.status, 403, `get ${configPath}`);
    }
    const nested = await call(writer.value, '/ai/v1/config/set', {
      method: 'POST',
      body: JSON.stringify({ tenant: 'a', path: 'theme', value: { nested: { apiKey: 'sekret-value' } } }),
    });
    assert.equal(nested.status, 403);
    const listed = await call(writer.value, '/ai/v1/config/set', {
      method: 'POST',
      body: '{"tenant":"a","path":"theme.extra","value":[{"pinCode":"1234"},{"__proto__":{"polluted":true}}]}',
    });
    assert.equal(listed.status, 403);
    assert.equal(yaml(), before);
    assert.equal(({}).polluted, undefined);
    ctx.a.setConfig('minecraft.password', 'read-me-not');
    const hidden = await call(writer.value, '/ai/v1/config?tenant=a&path=minecraft.password');
    assert.equal(hidden.status, 403);
    const section = await call(writer.value, '/ai/v1/config?tenant=a&path=minecraft');
    assert.equal(section.status, 200);
    assert.equal(JSON.stringify(await section.json()).includes('read-me-not'), false);
    const whole = await call(writer.value, '/ai/v1/config?tenant=a');
    assert.equal(JSON.stringify(await whole.json()).includes('read-me-not'), false);
  });

  await t.test('全体の課金は全配信者のトークンだけ申請できる', async () => {
    const limited = issue(['write'], ['a']);
    const starred = issue(['write'], ['*', 'a']);
    for (const token of [limited, starred]) {
      const denied = await call(token.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'billing.multiplier', value: 2 }) });
      assert.equal(denied.status, 403);
      assert.equal((await denied.json()).error, '全体の課金は、全配信者のトークンからだけ申請できます');
      const dry = await call(token.value, '/ai/v1/billing/request', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'billing.premiumFeatures', value: ['rush'], dryRun: true }) });
      assert.equal(dry.status, 403);
    }
    assert.equal(ctx.billing.globalView().multiplier, 1.5);
    const all = issue(['write'], ['*']);
    const asked = await call(all.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'billing.multiplier', value: 2 }) });
    assert.equal(asked.status, 202);
    const askedBody = await asked.json();
    const queued = await fetch(`${ctx.base}/admin/api/ai-approvals`, { headers: adminHeaders });
    const queuedRow = (await queued.json()).approvals.find((item) => item.id === askedBody.approvalId);
    assert.equal(queuedRow.global, true);
    const approved = await fetch(`${ctx.base}/admin/api/ai-approvals/${askedBody.approvalId}/approve`, { method: 'POST', headers: adminHeaders });
    assert.equal(approved.status, 200);
    assert.equal(ctx.billing.globalView().multiplier, 2);
  });

  await t.test('本番の承認は配信中と接続中を拒否し、開発環境では通す', async () => {
    const writer = issue(['write'], ['a']);
    const ask = async (note) => {
      const res = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'billing.note', value: note }) });
      assert.equal(res.status, 202, note);
      return (await res.json()).approvalId;
    };
    const approve = (id) => fetch(`${ctx.base}/admin/api/ai-approvals/${id}/approve`, { method: 'POST', headers: adminHeaders });
    await withEnv({ TW_ENV: 'production', TW_AI_WRITE: 'on' }, async () => {
      const id = await ask('本番では止める');
      ctx.a.hub.setStatus({ mode: 'live', username: 'tester' });
      try {
        const live = await approve(id);
        assert.equal(live.status, 403);
        assert.equal((await live.json()).error, '配信中はAIから変更できません');
        assert.equal(ctx.billing.adminView('a').note, '');
        ctx.a.hub.setStatus({ mode: 'connecting' });
        const connecting = await approve(id);
        assert.equal(connecting.status, 403);
        assert.equal(ctx.billing.adminView('a').note, '');
      } finally {
        ctx.a.hub.setStatus({ mode: 'idle', username: null, message: '' });
      }
      const ok = await approve(id);
      assert.equal(ok.status, 200);
      assert.equal(ctx.billing.adminView('a').note, '本番では止める');
    });
    // TW_ENV=dev では配信中でも変更・承認できる（意図した仕様）
    await withEnv({ TW_ENV: 'dev', TW_AI_WRITE: 'on' }, async () => {
      const id = await ask('開発では通す');
      ctx.a.hub.setStatus({ mode: 'live', username: 'tester' });
      try {
        const allowed = await approve(id);
        assert.equal(allowed.status, 200);
        assert.equal(ctx.billing.adminView('a').note, '開発では通す');
      } finally {
        ctx.a.hub.setStatus({ mode: 'idle', username: null, message: '' });
      }
    });
  });

  await t.test('本番のウィジェットと遊び方は版が違うと拒否する', async () => {
    const admin = issue(['admin', 'read']);
    const widgetsBefore = [...ctx.widgets.a];
    await withEnv({ TW_ENV: 'production', TW_AI_WRITE: 'on' }, async () => {
      const version = (await (await call(admin.value, '/ai/v1/config?tenant=a')).json()).configVersion;
      const preview = await call(admin.value, '/ai/v1/tenant/widgets', { method: 'POST', body: JSON.stringify({ tenant: 'a', widgets: ['alerts'], dryRun: true }) });
      assert.equal(preview.status, 200);
      assert.deepEqual(ctx.widgets.a, widgetsBefore);
      const badWidgets = await call(admin.value, '/ai/v1/tenant/widgets', { method: 'POST', body: JSON.stringify({ tenant: 'a', widgets: ['alerts'], baseVersion: 'old' }) });
      assert.equal(badWidgets.status, 409);
      assert.equal((await badWidgets.json()).error, '設定の版が違います。読み直してからやり直してください');
      assert.deepEqual(ctx.widgets.a, widgetsBefore);
      const okWidgets = await call(admin.value, '/ai/v1/tenant/widgets', { method: 'POST', body: JSON.stringify({ tenant: 'a', widgets: ['alerts'], baseVersion: version }) });
      assert.equal(okWidgets.status, 200);
      assert.deepEqual(ctx.widgets.a, ['alerts']);
      const badTemplate = await call(admin.value, '/ai/v1/tenant/template', { method: 'POST', body: JSON.stringify({ tenant: 'a', template: 'custom', baseVersion: 'old' }) });
      assert.equal(badTemplate.status, 409);
      assert.equal(ctx.templates.a, null);
      const okTemplate = await call(admin.value, '/ai/v1/tenant/template', { method: 'POST', body: JSON.stringify({ tenant: 'a', template: 'custom', baseVersion: version }) });
      assert.equal(okTemplate.status, 200);
      assert.equal(ctx.templates.a, 'custom');
    });
  });

  await t.test('監査の差分は秘密のキーとトークンっぽい値を伏せる', async () => {
    const writer = issue(['write']);
    ctx.a.setConfig('minecraft.password', 'diff-secret-value');
    const merged = await call(writer.value, '/ai/v1/config/merge', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'minecraft', value: { enabled: true } }) });
    assert.equal(merged.status, 200);
    const mergedBody = await merged.json();
    assert.equal(JSON.stringify(mergedBody).includes('diff-secret-value'), false);
    const tokenish = 'twai_audit-leak-value';
    const titled = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'goals.default.title', value: tokenish }) });
    assert.equal(titled.status, 200);
    const hex = 'ab'.repeat(20);
    const hexed = await call(writer.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'goals.default.title', value: hex }) });
    assert.equal(hexed.status, 200);
    const audit = fs.readFileSync(path.join(ctx.dir, 'ai-audit.jsonl'), 'utf8');
    assert.equal(audit.includes('diff-secret-value'), false);
    assert.equal(audit.includes(tokenish), false);
    assert.equal(audit.includes(hex), false);
    assert.equal(audit.includes('[伏せる]'), true);
    assert.equal(audit.includes('"enabled":true'), true);
  });

  await t.test('取り消しは同じトークンが作った変更だけ', async () => {
    const owner = issue(['write', 'read']);
    const other = issue(['write']);
    const changed = await call(owner.value, '/ai/v1/config/set', { method: 'POST', body: JSON.stringify({ tenant: 'a', path: 'theme.accent', value: '#102030' }) });
    assert.equal(changed.status, 200);
    const changeId = (await changed.json()).changeId;
    const denied = await call(other.value, '/ai/v1/undo', { method: 'POST', body: JSON.stringify({ tenant: 'a', changeId }) });
    assert.equal(denied.status, 403);
    assert.equal((await denied.json()).error, 'この変更は別のトークンが作ったので取り消せません');
    assert.equal((await (await call(owner.value, '/ai/v1/config?tenant=a&path=theme.accent')).json()).value, '#102030');
    const back = await call(owner.value, '/ai/v1/undo', { method: 'POST', body: JSON.stringify({ tenant: 'a', changeId }) });
    assert.equal(back.status, 200);
    assert.notEqual((await (await call(owner.value, '/ai/v1/config?tenant=a&path=theme.accent')).json()).value, '#102030');
  });

  await t.test('開発環境だけ /ai/mcp を開き、従来の stdio MCP も動く', async () => {
    const read = issue(['read']);
    await withEnv({ TW_ENV: 'production' }, async () => {
      const hidden = await call(read.value, '/ai/mcp', { method: 'POST', body: '{}' });
      assert.equal(hidden.status, 404);
    });
    await withEnv({ TW_ENV: 'dev' }, async () => {
      const denied = await fetch(`${ctx.base}/ai/mcp`, { method: 'POST', headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' }, body: '{}' });
      assert.equal(denied.status, 401);
      const init = await call(read.value, '/ai/mcp', {
        method: 'POST',
        headers: { accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } } }),
      });
      assert.equal(init.status, 200);
      const initBody = await init.json();
      assert.match(initBody.result.instructions, /まず dry-run/);
      assert.match(initBody.result.instructions, /配信中は変更不可/);
      assert.match(initBody.result.instructions, /課金は申請だけ/);
    });

    const legacyDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-mcp-'));
    const legacy = spawn(process.execPath, [path.join(root, 'mcp', 'server.js')], {
      cwd: root,
      env: { ...process.env, TW_CONFIG: path.join(legacyDir, 'config.yaml'), TW_AI_TOKEN: '', TW_SERVER: '' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    let legacyErr = '';
    legacy.stderr.setEncoding('utf8');
    legacy.stderr.on('data', (chunk) => { legacyErr += chunk; });
    try {
      const io = mcpClient(legacy);
      const hello = await io.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
      assert.equal(hello.id, 1);
      assert.equal(typeof hello.result.serverInfo.name, 'string');
      legacy.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
      const tools = await io.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      const names = tools.result.tools.map((tool) => tool.name);
      assert.equal(names.includes('get_config'), true);
      assert.equal(names.includes('set_config'), true);
      assert.equal(names.includes('minecraft_command'), true);
      assert.equal(names.includes('dry_run'), false);
    } finally {
      legacy.kill();
      if (legacy.exitCode == null) await new Promise((resolve) => legacy.once('exit', resolve));
    }
    assert.equal(legacyErr.includes('Error'), false);

    const remote = spawn(process.execPath, [path.join(root, 'mcp', 'server.js')], {
      cwd: root,
      env: { ...process.env, TW_CONFIG: path.join(legacyDir, 'remote.yaml'), TW_AI_TOKEN: 'twai_example', TW_SERVER: 'http://127.0.0.1:9' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    try {
      const io = mcpClient(remote);
      const hello = await io.send({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-03-26', capabilities: {}, clientInfo: { name: 'test', version: '0' } } });
      assert.match(hello.result.instructions, /まず dry-run/);
      remote.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
      const tools = await io.send({ jsonrpc: '2.0', id: 2, method: 'tools/list' });
      const names = tools.result.tools.map((tool) => tool.name);
      for (const name of ['get_config', 'set_config', 'dry_run', 'undo', 'list_changes', 'request_billing_change']) assert.equal(names.includes(name), true, name);
      assert.equal(names.includes('minecraft_command'), false);
      assert.equal(names.includes('replace_config'), false);
    } finally {
      remote.kill();
    }
  });
});
