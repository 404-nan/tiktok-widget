// 外部の AI 向け API（/ai/v1）。配信者の runtime を直接呼び、自分自身へ HTTP は出さない。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import express from 'express';
import * as cfg from './config.js';
import { publicToken } from './ai-tokens.js';
import { isDevEnv } from './env.js';

const WRITE_LIMIT = 30;
const WRITE_WINDOW_MS = 60_000;
const UNDO_KEEP = 50;

const POLLUTION = new Set(['__proto__', 'constructor', 'prototype']);
const EXACT_FORBIDDEN = new Set([
  'keys',
  'stayconnected', 'tiktok', 'tiktokid',
  'signkey', 'eulerstream',
  'enforcement', 'billingswitch', 'billingenabled',
  'authorization', 'cookie', 'cookies', 'credential', 'credentials',
  'privatekey', 'clientsecret',
]);
const PREFIX_FORBIDDEN = [
  'pin', 'connect', 'disconnect', 'reconnect', 'restart',
  'stayconnected', 'tiktok', 'eulerstream', 'signkey', 'signapikey',
];

const ACCOUNT_FIELDS = {
  plan: 'plan',
  status: 'status',
  free: 'free',
  paiduntil: 'paidUntil',
  trialendsat: 'trialEndsAt',
  note: 'note',
  monthlyprice: 'monthlyPrice',
};
const GLOBAL_FIELDS = {
  multiplier: 'multiplier',
  premiumfeatures: 'premiumFeatures',
};

export const AI_ROUTES = [
  { method: 'GET', path: '/status', tool: 'get_status' },
  { method: 'GET', path: '/config', tool: 'get_config' },
  { method: 'GET', path: '/validate', tool: 'validate_config' },
  { method: 'GET', path: '/history', tool: 'get_history' },
  { method: 'GET', path: '/widget-urls', tool: 'list_widget_urls' },
  { method: 'GET', path: '/gifts', tool: 'list_gifts' },
  { method: 'GET', path: '/changes', tool: 'list_changes' },
  { method: 'POST', path: '/config/set', tool: 'set_config' },
  { method: 'POST', path: '/config/merge', tool: 'merge_config' },
  { method: 'POST', path: '/config/delete', tool: 'delete_config' },
  { method: 'POST', path: '/roulette/spin', tool: 'spin_roulette' },
  { method: 'POST', path: '/timer', tool: 'timer' },
  { method: 'POST', path: '/wins', tool: 'wins' },
  { method: 'POST', path: '/boss', tool: 'boss' },
  { method: 'POST', path: '/rush', tool: 'rush' },
  { method: 'POST', path: '/test/event', tool: 'test_event' },
  { method: 'POST', path: '/tenant/widgets', tool: 'tenant_widgets' },
  { method: 'POST', path: '/tenant/template', tool: 'tenant_template' },
  { method: 'POST', path: '/undo', tool: 'undo' },
  { method: 'POST', path: '/billing/request', tool: 'request_billing_change' },
];

const TOOLS = {
  get_status: { scope: 'read' },
  get_config: { scope: 'read' },
  get_history: { scope: 'read' },
  list_widget_urls: { scope: 'read' },
  list_gifts: { scope: 'read' },
  validate_config: { scope: 'read' },
  list_changes: { scope: 'read' },
  set_config: { scope: 'write', mutate: true, op: 'set' },
  merge_config: { scope: 'write', mutate: true, op: 'merge' },
  delete_config: { scope: 'write', mutate: true, op: 'delete' },
  spin_roulette: { scope: 'operate', mutate: true, operate: true },
  timer: { scope: 'operate', mutate: true, operate: true },
  wins: { scope: 'operate', mutate: true, operate: true },
  boss: { scope: 'operate', mutate: true, operate: true },
  rush: { scope: 'operate', mutate: true, operate: true },
  test_event: { scope: 'test', mutate: true, test: true },
  tenant_widgets: { scope: 'admin', mutate: true },
  tenant_template: { scope: 'admin', mutate: true },
  undo: { scope: 'write', mutate: true },
  request_billing_change: { scope: 'write', mutate: true, billing: true },
};

const SECRET_KEY = /pin|password|secret|token|apikey|api_key|authorization|signkey|cookie/i;
const TOKEN_TEXT = /twai_[A-Za-z0-9_-]+|eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}|bearer\s+[A-Za-z0-9._~+/-]{12,}/i;

function segments(configPath) {
  return String(configPath ?? '').split('.').filter(Boolean).map((part) => part.trim().toLowerCase());
}

function normalizedName(part) {
  return String(part ?? '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

/** パスの1区切り、またはオブジェクトのキーが秘密・接続・原型汚染なら true */
export function isForbiddenSegment(part) {
  const raw = String(part ?? '').trim().toLowerCase();
  if (!raw) return false;
  if (POLLUTION.has(raw)) return true;
  const name = normalizedName(raw);
  if (!name) return false;
  if (POLLUTION.has(name)) return true;
  if (name.includes('token') || name.includes('password') || name.includes('passwd') || name.includes('secret') || name.includes('apikey')) return true;
  if (name === 'keys') return true;
  if (PREFIX_FORBIDDEN.some((prefix) => name.startsWith(prefix))) return true;
  return EXACT_FORBIDDEN.has(name);
}

function forbiddenKey(key) {
  return isForbiddenSegment(key) || String(key ?? '').trim().toLowerCase() === 'switch';
}

function containsForbidden(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return false;
  if (seen.has(value)) return false;
  seen.add(value);
  if (Array.isArray(value)) return value.some((item) => containsForbidden(item, seen));
  for (const key of Object.keys(value)) {
    if (forbiddenKey(key) || containsForbidden(value[key], seen)) return true;
  }
  return false;
}

function forbiddenPath(configPath) {
  const segs = segments(configPath);
  if (segs.some((part) => isForbiddenSegment(part))) return true;
  for (let i = 0; i < segs.length - 1; i += 1) {
    if (isForbiddenSegment(`${segs[i]}${segs[i + 1]}`)) return true;
  }
  if (segs[0] === 'minecraft' && ['host', 'port', 'password'].includes(segs[1])) return true;
  if (segs[0] === 'billing' && segs[1] === 'switch') return true;
  return false;
}

/** 設定パスを、拒否・課金の申請・通常の変更に分ける。値の中のネストと配列も見る */
export function classifyConfigPath(configPath, value) {
  if (forbiddenPath(configPath) || containsForbidden(value)) return 'deny';
  if (segments(configPath)[0] === 'billing') return 'billing';
  return 'ok';
}

function allTenantsToken(token) {
  return Array.isArray(token?.tenants) && token.tenants.length === 1 && token.tenants[0] === '*';
}

/** 読んだ設定から、秘密のキーを除く */
function stripSecrets(value, seen = new WeakSet()) {
  if (!value || typeof value !== 'object') return value;
  if (seen.has(value)) return null;
  seen.add(value);
  if (Array.isArray(value)) return value.map((item) => stripSecrets(item, seen));
  const out = {};
  for (const [key, item] of Object.entries(value)) {
    if (isForbiddenSegment(key)) continue;
    out[key] = stripSecrets(item, seen);
  }
  return out;
}

function fieldOf(key) {
  const name = String(key ?? '').toLowerCase();
  if (['enforcement', 'switch', 'billingenabled', 'enabled'].includes(name)) return { deny: true };
  if (ACCOUNT_FIELDS[name]) return { name: ACCOUNT_FIELDS[name], global: false };
  if (GLOBAL_FIELDS[name]) return { name: GLOBAL_FIELDS[name], global: true };
  return {};
}

function billingRequest(configPath, op, value) {
  const parts = String(configPath ?? '').split('.').filter(Boolean);
  if ((parts[0] || '').toLowerCase() !== 'billing') return { status: 400, error: '課金の項目だけ申請できます' };
  if (parts.length === 1) {
    if (value == null || typeof value !== 'object' || Array.isArray(value)) return { status: 400, error: '課金の項目を指定してください' };
    const patch = {};
    let global = null;
    for (const [key, item] of Object.entries(value)) {
      const field = fieldOf(key);
      if (field.deny) return { status: 403, error: 'この項目は AI からは変えられません' };
      if (!field.name) return { status: 400, error: `課金の項目ではありません: ${key}` };
      if (global == null) global = field.global;
      else if (global !== field.global) return { status: 400, error: '全体の設定と配信者の設定は分けて申請してください' };
      patch[field.name] = op === 'delete' ? null : item;
    }
    if (!Object.keys(patch).length) return { status: 400, error: '課金の項目を指定してください' };
    return { global: Boolean(global), patch };
  }
  const field = fieldOf(parts[1]);
  if (field.deny) return { status: 403, error: 'この項目は AI からは変えられません' };
  if (!field.name) return { status: 400, error: '課金の項目ではありません' };
  return { global: field.global, patch: { [field.name]: op === 'delete' ? null : value } };
}

function lookup(config, configPath) {
  const keys = cfg.toPath(configPath);
  let cur = config;
  for (const key of keys) {
    if (cur == null || typeof cur !== 'object' || !Object.prototype.hasOwnProperty.call(cur, key)) return { defined: false, value: null };
    cur = cur[key];
  }
  return { defined: true, value: cur ?? null };
}

function clonePlace(place) {
  return { defined: place.defined, value: place.value == null ? null : structuredClone(place.value) };
}

function samePlace(a, b) {
  if (!a || !b || a.defined !== b.defined) return false;
  return JSON.stringify(a.value ?? null) === JSON.stringify(b.value ?? null);
}

function safeTenantId(id) {
  const text = String(id ?? '');
  return /^[A-Za-z0-9_-]{1,64}$/.test(text) ? text : null;
}

function looksLikeToken(text) {
  if (TOKEN_TEXT.test(text)) return true;
  const trimmed = text.trim();
  if (/^[A-Fa-f0-9]{32,}$/.test(trimmed)) return true;
  if (/^[A-Za-z0-9_-]{40,}$/.test(trimmed) && /\d/.test(trimmed) && /[A-Za-z]/.test(trimmed)) return true;
  return false;
}

function redact(value, tokenValue, seen = new WeakSet()) {
  if (typeof value === 'string') {
    let out = value;
    if (tokenValue && out.includes(tokenValue)) out = out.split(tokenValue).join('[伏せる]');
    if (looksLikeToken(out)) return '[伏せる]';
    return out.length > 500 ? `${out.slice(0, 500)}…` : out;
  }
  if (Array.isArray(value)) return value.map((item) => redact(item, tokenValue, seen));
  if (value && typeof value === 'object') {
    if (seen.has(value)) return null;
    seen.add(value);
    const out = {};
    for (const [key, item] of Object.entries(value)) {
      out[key] = isForbiddenSegment(key) || SECRET_KEY.test(key) ? '[伏せる]' : redact(item, tokenValue, seen);
    }
    return out;
  }
  return value ?? null;
}

function redactArgs(args, tokenValue) {
  const out = redact(args, tokenValue);
  if (out && typeof out === 'object' && !Array.isArray(out) && classifyConfigPath(out.path, args?.value) === 'deny' && 'value' in out) out.value = '[伏せる]';
  return out;
}

function isProd(req) {
  return !isDevEnv(req);
}

function staleVersion(args, version, live, req) {
  if (!isProd(req) || args.baseVersion === version) return null;
  return { status: 409, body: { error: '設定の版が違います。読み直してからやり直してください', configVersion: version, live } };
}

function writesOpen() {
  return process.env.TW_AI_WRITE === 'on';
}

function asBool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function tenantAllowed(token, tenantId) {
  return token.tenants.includes('*') || token.tenants.includes(tenantId);
}

function pickTenant(token, args) {
  const requested = args?.tenant ?? args?.tenantId ?? null;
  if (requested != null && String(requested).trim() !== '') return String(requested).trim();
  const ids = token.tenants.filter((id) => id !== '*');
  if (ids.length === 1 && token.tenants.length === 1) return ids[0];
  return null;
}

export function createAiControl({ dataDir, tokens, resolveTenant, applyBilling, now = () => Date.now() }) {
  const hits = new Map();
  const auditFile = path.join(dataDir, 'ai-audit.jsonl');
  const approvalFile = path.join(dataDir, 'ai-approvals.json');
  let approvals = [];

  function loadApprovals() {
    try {
      const data = JSON.parse(fs.readFileSync(approvalFile, 'utf8'));
      approvals = Array.isArray(data.approvals) ? data.approvals : [];
      fs.chmodSync(approvalFile, 0o600);
    } catch {
      approvals = [];
    }
  }
  function saveApprovals() {
    fs.mkdirSync(dataDir, { recursive: true });
    const tmp = `${approvalFile}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmp, `${JSON.stringify({ approvals }, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, approvalFile);
    fs.chmodSync(approvalFile, 0o600);
  }
  loadApprovals();

  function undoPath(tenantId) {
    return path.join(dataDir, 'tenants', tenantId, 'ai-undo.json');
  }
  function loadUndo(tenantId) {
    try {
      const data = JSON.parse(fs.readFileSync(undoPath(tenantId), 'utf8'));
      return {
        changes: Array.isArray(data.changes) ? data.changes : [],
        operations: Array.isArray(data.operations) ? data.operations : [],
      };
    } catch {
      return { changes: [], operations: [] };
    }
  }
  function saveUndo(tenantId, data) {
    const file = undoPath(tenantId);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    const next = {
      changes: data.changes.slice(-UNDO_KEEP),
      operations: data.operations.slice(-UNDO_KEEP),
    };
    fs.writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, file);
    fs.chmodSync(file, 0o600);
    return next;
  }

  function appendAudit(record, tokenValue) {
    fs.mkdirSync(dataDir, { recursive: true });
    let line = JSON.stringify(record);
    if (tokenValue && line.includes(tokenValue)) line = line.split(tokenValue).join('[伏せる]');
    fs.appendFileSync(auditFile, `${line}\n`, { mode: 0o600 });
    try { fs.chmodSync(auditFile, 0o600); } catch { /* 追記だけを守る */ }
  }

  function recent(limit = 20) {
    let text = '';
    try { text = fs.readFileSync(auditFile, 'utf8'); } catch { return []; }
    const rows = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try { rows.push(JSON.parse(line)); } catch { /* 壊れた行は飛ばす */ }
    }
    return rows.slice(-limit).reverse();
  }

  function takeSlot(tokenId, at) {
    const fresh = (hits.get(tokenId) ?? []).filter((ts) => at - ts < WRITE_WINDOW_MS);
    if (fresh.length >= WRITE_LIMIT) {
      hits.set(tokenId, fresh);
      return false;
    }
    fresh.push(at);
    hits.set(tokenId, fresh);
    return true;
  }

  function queueApproval({ tenant, tokenId, configPath, op, value, request }) {
    const row = {
      id: crypto.randomBytes(8).toString('hex'),
      status: '承認待ち',
      tenant,
      tokenId,
      path: configPath,
      op,
      value: value ?? null,
      global: request.global,
      patch: request.patch,
      createdAt: new Date(now()).toISOString(),
      decidedAt: null,
    };
    approvals.push(row);
    saveApprovals();
    return row;
  }

  function pending() {
    return approvals.filter((row) => row.status === '承認待ち').map(publicApproval);
  }

  function decide(id, status) {
    const row = approvals.find((item) => item.id === id);
    if (!row) throw new Error('その申請は見つかりません');
    if (row.status !== '承認待ち') throw new Error('すでに処理しています');
    if (status === '承認済み') {
      if (!applyBilling) throw new Error('反映先がありません');
      if (isProd()) {
        const target = resolveTenant(row.tenant);
        if (target?.runtime?.aiLive?.()) {
          const err = new Error('配信中はAIから変更できません');
          err.status = 403;
          throw err;
        }
      }
      applyBilling({ global: row.global, tenant: row.tenant, patch: row.patch });
    }
    row.status = status;
    row.decidedAt = new Date(now()).toISOString();
    saveApprovals();
    return publicApproval(row);
  }

  function finish(tool, ctx, result, extra = {}) {
    const body = result.body ?? {};
    appendAudit({
      ts: new Date(now()).toISOString(),
      tokenId: ctx.token.id,
      tenant: ctx.tenantId ?? null,
      tool,
      args: redactArgs(ctx.auditArgs ?? {}, ctx.tokenValue),
      dryRun: Boolean(ctx.dryRun),
      ok: result.status < 400,
      error: body.error ?? null,
      diff: redact(extra.diff ?? body.diff ?? null, ctx.tokenValue),
      changeId: extra.changeId ?? body.changeId ?? null,
    }, ctx.tokenValue);
    return result;
  }

  function readTool(runtime, target, tenantId, tool, args, context) {
    if (tool === 'get_status') {
      return { status: 200, body: { ...runtime.readStatus(), live: runtime.aiLive(), configVersion: runtime.configVersion() } };
    }
    if (tool === 'get_config' || tool === 'validate_config') {
      const issues = runtime.readIssues();
      const version = runtime.configVersion();
      const live = runtime.aiLive();
      if (tool === 'validate_config') return { status: 200, body: { ok: issues.errors.length === 0, ...issues, configVersion: version, live } };
      const shown = stripSecrets(cfg.publicConfig(runtime.getConfig()));
      if (args.path) {
        if (classifyConfigPath(args.path, lookup(shown, args.path).value) === 'deny') return { status: 403, body: { error: 'この項目は AI からは変えられません' } };
        const place = lookup(shown, args.path);
        return { status: 200, body: { path: args.path, value: place.defined ? place.value : null, ...issues, configVersion: version, live } };
      }
      return { status: 200, body: { config: shown, ...issues, configVersion: version, live } };
    }
    if (tool === 'get_history') {
      const row = runtime.readHistory(args.id);
      if (args.id && !row) return { status: 404, body: { error: '見つかりません' } };
      return { status: 200, body: row };
    }
    if (tool === 'list_widget_urls') {
      const base = typeof target.widgetBaseFor === 'function'
        ? target.widgetBaseFor(context.req)
        : (target.widgetBase || (context.req ? `${context.req.protocol}://${context.req.get('host')}` : 'http://127.0.0.1:3939'));
      return { status: 200, body: { widgets: runtime.readWidgets(base), live: runtime.aiLive() } };
    }
    if (tool === 'list_gifts') return { status: 200, body: { gifts: runtime.readGifts() } };
    if (tool === 'list_changes') {
      const data = loadUndo(tenantId);
      return { status: 200, body: { changes: [...data.changes].reverse().map(publicChange) } };
    }
    return null;
  }

  async function dispatch(token, tool, args = {}, ctx = {}) {
    const spec = TOOLS[tool];
    const context = {
      token,
      tokenValue: ctx.tokenValue ?? '',
      req: ctx.req ?? null,
      dryRun: asBool(args.dryRun) || asBool(args.dry_run),
      auditArgs: args,
      tenantId: null,
    };
    if (!spec) return finish(tool, context, { status: 404, body: { error: 'その操作はありません' } });
    if (!token.scopes.includes(spec.scope)) {
      return finish(tool, context, { status: 403, body: { error: 'この操作の権限がありません' } });
    }
    const tenantId = pickTenant(token, args);
    if (!tenantId) return finish(tool, context, { status: 400, body: { error: '配信者を指定してください' } });
    if (!safeTenantId(tenantId)) return finish(tool, context, { status: 400, body: { error: '配信者の id の形が正しくありません' } });
    if (!tenantAllowed(token, tenantId)) return finish(tool, context, { status: 403, body: { error: 'この配信者には使えません' } });
    context.tenantId = tenantId;
    const target = resolveTenant(tenantId);
    if (!target) return finish(tool, context, { status: 404, body: { error: 'その配信者は見つかりません' } });
    if (target.disabled) return finish(tool, context, { status: 403, body: { error: 'この配信者の利用は止められています' } });
    const runtime = target.runtime;
    if (spec.test && !isDevEnv(context.req)) {
      return finish(tool, context, { status: 403, body: { error: 'テスト送信は開発環境でだけ使えます' } });
    }
    if (spec.mutate && isProd(context.req) && !writesOpen()) {
      return finish(tool, context, { status: 403, body: { error: '本番では、読み取り以外は止められています' } });
    }
    if (spec.mutate && !takeSlot(token.id, now())) {
      return finish(tool, context, { status: 429, body: { error: '書き込みは1分に30回までです' } });
    }

    const readResult = readTool(runtime, target, tenantId, tool, args, context);
    if (readResult) return finish(tool, context, readResult);
    if (tool === 'undo') return finish(tool, context, undoChange(runtime, target, tenantId, args.changeId, token.id, context.req));
    if (spec.op || spec.billing) return finish(tool, context, writeConfig(runtime, context, spec, args));
    if (spec.operate) return finish(tool, context, operate(runtime, tenantId, tool, args, context));
    if (spec.test) return finish(tool, context, runtime.simulateEvent(args));
    if (tool === 'tenant_widgets' || tool === 'tenant_template') return finish(tool, context, writeTenant(target, tenantId, tool, args, context));
    return finish(tool, context, { status: 404, body: { error: 'その操作はありません' } });
  }

  function writeBillingConfig(configPath, op, args, ctx, request, live, version) {
    if (request.error) return { status: request.status, body: { error: request.error } };
    if (request.global && !allTenantsToken(ctx.token)) {
      return { status: 403, body: { error: '全体の課金は、全配信者のトークンからだけ申請できます' } };
    }
    if (ctx.dryRun) {
      return {
        status: 200,
        body: {
          ok: true,
          dryRun: true,
          pending: true,
          diff: { path: configPath, op, before: null, after: request.patch },
          validation: { ok: true, errors: [], warnings: [] },
          live,
          configVersion: version,
          message: '承認待ちにします。管理画面で人が承認するまで反映しません',
        },
      };
    }
    const row = queueApproval({ tenant: ctx.tenantId, tokenId: ctx.token.id, configPath, op, value: args.value ?? null, request });
    return {
      status: 202,
      body: {
        ok: true,
        pending: true,
        status: '承認待ち',
        approvalId: row.id,
        changeId: row.id,
        message: '承認待ちにしました。管理画面で人が承認するまで反映しません',
        live,
        configVersion: version,
      },
    };
  }

  function writeRegularConfig(runtime, ctx, spec, args, op, configPath, live, version) {
    const preview = runtime.previewConfig(op, configPath, args.value);
    const before = clonePlace(lookup(runtime.getConfig(), configPath));
    const after = preview.config ? clonePlace(lookup(preview.config, configPath)) : { defined: false, value: null };
    const shown = (place) => (place.defined ? stripSecrets(place.value) : null);
    const diff = { path: configPath, op, before: shown(before), after: shown(after) };
    const validation = { ok: preview.ok, errors: preview.errors, warnings: preview.warnings };
    const body = { ok: preview.ok, dryRun: ctx.dryRun, diff, validation, live, configVersion: version };
    if (!preview.ok) return { status: 422, body: { ...body, error: preview.errors[0] ?? '設定を確認できません' } };
    if (ctx.dryRun) return { status: 200, body };
    if (isProd(ctx.req) && live) return { status: 403, body: { error: '配信中はAIから変更できません', live: true, configVersion: version } };
    const stale = staleVersion(args, version, live, ctx.req);
    if (stale) return stale;
    const applied = op === 'delete' ? runtime.deleteConfig(configPath) : op === 'merge' ? runtime.mergeConfig(configPath, args.value) : runtime.setConfig(configPath, args.value);
    if (!applied.ok) return { status: 422, body: { ...body, ok: false, validation: { ok: false, errors: applied.errors ?? [], warnings: applied.warnings ?? [] }, error: applied.errors?.[0] ?? '保存できません' } };
    const storedAfter = clonePlace(lookup(runtime.getConfig(), configPath));
    const changeId = crypto.randomBytes(8).toString('hex');
    const book = loadUndo(ctx.tenantId);
    book.changes.push({
      id: changeId,
      at: new Date(now()).toISOString(),
      tool: spec.op ? Object.keys(TOOLS).find((name) => TOOLS[name].op === op) : 'set_config',
      op,
      path: configPath,
      before,
      after: storedAfter,
      undoable: true,
      tokenId: ctx.token.id,
    });
    saveUndo(ctx.tenantId, book);
    return {
      status: 200,
      body: {
        ...body,
        ok: true,
        dryRun: false,
        diff: { ...diff, after: shown(storedAfter) },
        validation: { ok: true, errors: [], warnings: applied.warnings ?? [] },
        configVersion: runtime.configVersion(),
        changeId,
      },
    };
  }

  function writeConfig(runtime, ctx, spec, args) {
    const op = spec.op || (args.op === 'merge' || args.op === 'delete' || args.op === 'set' ? args.op : 'set');
    const configPath = args.path;
    if (configPath == null || configPath === '') return { status: 400, body: { error: 'path が必要です' } };
    const kind = classifyConfigPath(configPath, args.value);
    const live = runtime.aiLive();
    const version = runtime.configVersion();
    if (kind === 'deny') return { status: 403, body: { error: 'この項目は AI からは変えられません' }, diff: null };
    if (kind === 'billing' || spec.billing) {
      return writeBillingConfig(configPath, op, args, ctx, billingRequest(configPath, op, args.value), live, version);
    }
    return writeRegularConfig(runtime, ctx, spec, args, op, configPath, live, version);
  }

  function operationStatus(runtime, tool, live, version) {
    if (tool === 'wins') return { status: 200, body: { ok: true, wins: runtime.readWins(), live, configVersion: version } };
    if (tool === 'timer') return { status: 200, body: { ok: true, timers: runtime.readTimer(), live, configVersion: version } };
    if (tool === 'boss') return { status: 200, body: { ok: true, boss: runtime.readBoss(), live, configVersion: version } };
    return { status: 200, body: { ok: true, rush: runtime.readRush(), live, configVersion: version } };
  }

  function performOperation(runtime, tool, action, args) {
    if (tool === 'spin_roulette') return runtime.performControl('roulette', 'spin', { id: args.id });
    if (tool === 'timer') return runtime.performControl('timer', action, { id: args.id, seconds: args.seconds, minutes: args.minutes, value: args.value });
    if (tool === 'wins') return runtime.performControl('wins', action, { id: args.id, value: args.value });
    if (tool === 'boss') return runtime.performControl('boss', action, { id: args.id, value: args.value });
    return runtime.performControl('rush', action, {});
  }

  function operate(runtime, tenantId, tool, args, ctx) {
    const live = runtime.aiLive();
    const version = runtime.configVersion();
    const action = tool === 'spin_roulette' ? 'spin' : (args.action || 'status');
    if (ctx.dryRun) {
      return {
        status: 200,
        body: {
          ok: true,
          dryRun: true,
          diff: null,
          validation: { ok: true, errors: [], warnings: ['操作は保存しないので、実行した結果は戻りません'] },
          live,
          configVersion: version,
          message: '実行しません',
        },
      };
    }
    if (action === 'status') return operationStatus(runtime, tool, live, version);
    if (isProd(ctx.req) && live) return { status: 403, body: { error: '配信中はAIから変更できません', live: true, configVersion: version } };
    const out = performOperation(runtime, tool, action, args);
    const changeId = crypto.randomBytes(8).toString('hex');
    if (out.status < 400 && action !== 'status') {
      const book = loadUndo(tenantId);
      book.operations.push({ id: changeId, at: new Date(now()).toISOString(), tool, undoable: false, tokenId: ctx.token.id });
      saveUndo(tenantId, book);
    }
    return { status: out.status, body: { ...out.body, changeId: out.status < 400 && action !== 'status' ? changeId : null, live, configVersion: version } };
  }

  function writeTenantWidgets(target, tenantId, args, ctx, live, version) {
    if (!Array.isArray(args.widgets)) return { status: 400, body: { error: 'widgets を一覧で送ってください' } };
    if (typeof target.setWidgets !== 'function') return { status: 400, body: { error: 'この配信者のウィジェットは選べません' } };
    const before = typeof target.getWidgets === 'function' ? target.getWidgets() : [];
    if (ctx.dryRun) {
      return { status: 200, body: { ok: true, dryRun: true, diff: { path: 'widgets', op: 'set', before, after: args.widgets }, validation: { ok: true, errors: [], warnings: [] }, live, configVersion: version } };
    }
    const stale = staleVersion(args, version, live, ctx.req);
    if (stale) return stale;
    target.setWidgets(args.widgets);
    const after = typeof target.getWidgets === 'function' ? target.getWidgets() : args.widgets;
    const changeId = rememberTenant(tenantId, ctx.token.id, { tool: 'tenant_widgets', path: 'widgets', before, after });
    return { status: 200, body: { ok: true, widgets: after, changeId, live, configVersion: version } };
  }

  function writeTenantTemplate(target, tenantId, args, ctx, live, version) {
    if (typeof target.setTemplate !== 'function') return { status: 400, body: { error: 'この配信者の遊び方は選べません' } };
    const before = typeof target.getTemplate === 'function' ? target.getTemplate() : null;
    if (ctx.dryRun) {
      return { status: 200, body: { ok: true, dryRun: true, diff: { path: 'template', op: 'set', before, after: args.template ?? null }, validation: { ok: true, errors: [], warnings: [] }, live, configVersion: version } };
    }
    const stale = staleVersion(args, version, live, ctx.req);
    if (stale) return stale;
    try {
      target.setTemplate(args.template);
    } catch (err) {
      return { status: 400, body: { error: err.message } };
    }
    const after = typeof target.getTemplate === 'function' ? target.getTemplate() : args.template ?? null;
    const changeId = rememberTenant(tenantId, ctx.token.id, { tool: 'tenant_template', path: 'template', before, after });
    return { status: 200, body: { ok: true, template: after, changeId, live, configVersion: version } };
  }

  function writeTenant(target, tenantId, tool, args, ctx) {
    const runtime = target.runtime;
    const live = runtime.aiLive();
    const version = runtime.configVersion();
    if (!ctx.dryRun && isProd(ctx.req) && live) return { status: 403, body: { error: '配信中はAIから変更できません', live: true } };
    if (tool === 'tenant_widgets') return writeTenantWidgets(target, tenantId, args, ctx, live, version);
    return writeTenantTemplate(target, tenantId, args, ctx, live, version);
  }

  function rememberTenant(tenantId, tokenId, { tool, path: configPath, before, after }) {
    const changeId = crypto.randomBytes(8).toString('hex');
    const book = loadUndo(tenantId);
    book.changes.push({
      id: changeId,
      at: new Date(now()).toISOString(),
      tool,
      op: 'set',
      path: configPath,
      kind: configPath,
      before: { defined: true, value: before ?? null },
      after: { defined: true, value: after ?? null },
      undoable: true,
      tokenId,
    });
    saveUndo(tenantId, book);
    return changeId;
  }

  function restoreTenantChange(change, target, runtime, live) {
    if (change.kind === 'widgets' || change.path === 'widgets') {
      const current = typeof target.getWidgets === 'function' ? target.getWidgets() : null;
      if (JSON.stringify(current ?? null) !== JSON.stringify(change.after?.value ?? null)) {
        return { status: 409, body: { error: '後から変更されています' } };
      }
      target.setWidgets(change.before?.value ?? []);
      return { status: 200, body: { ok: true, changeId: change.id, restored: true, configVersion: runtime.configVersion(), live } };
    }
    if (change.kind === 'template' || change.path === 'template') {
      const current = typeof target.getTemplate === 'function' ? target.getTemplate() : null;
      if (JSON.stringify(current ?? null) !== JSON.stringify(change.after?.value ?? null)) {
        return { status: 409, body: { error: '後から変更されています' } };
      }
      target.setTemplate(change.before?.value ?? null);
      return { status: 200, body: { ok: true, changeId: change.id, restored: true, configVersion: runtime.configVersion(), live } };
    }
    return null;
  }

  function undoChange(runtime, target, tenantId, changeId, tokenId, req) {
    if (!changeId) return { status: 400, body: { error: 'changeId が必要です' } };
    const book = loadUndo(tenantId);
    const owned = (row) => row?.tokenId === tokenId;
    const operation = book.operations.find((item) => item.id === changeId);
    if (operation) {
      if (!owned(operation)) return { status: 403, body: { error: 'この変更は別のトークンが作ったので取り消せません' } };
      return { status: 400, body: { error: 'ルーレットを回すなどの操作は取り消せません' } };
    }
    const change = book.changes.find((item) => item.id === changeId);
    if (!change) return { status: 404, body: { error: 'その変更は見つかりません' } };
    if (!owned(change)) return { status: 403, body: { error: 'この変更は別のトークンが作ったので取り消せません' } };
    if (change.undoable === false) return { status: 400, body: { error: 'ルーレットを回すなどの操作は取り消せません' } };
    const live = runtime.aiLive();
    if (isProd(req) && live) return { status: 403, body: { error: '配信中はAIから変更できません', live: true } };
    const tenantRestore = restoreTenantChange(change, target, runtime, live);
    if (tenantRestore) return tenantRestore;
    const current = clonePlace(lookup(runtime.getConfig(), change.path));
    if (!samePlace(current, change.after)) return { status: 409, body: { error: '後から変更されています' } };
    const restored = change.before?.defined ? runtime.setConfig(change.path, change.before.value) : runtime.deleteConfig(change.path);
    if (!restored.ok) return { status: 422, body: { error: restored.errors?.[0] ?? '元に戻せません', errors: restored.errors ?? [] } };
    return { status: 200, body: { ok: true, changeId, restored: true, configVersion: runtime.configVersion(), live, warnings: restored.warnings ?? [] } };
  }

  const router = express.Router();
  router.use((req, res, next) => {
    const header = req.get('authorization') || '';
    const matched = header.match(/^Bearer\s+(\S+)\s*$/i);
    if (!matched) return res.status(401).json({ error: 'トークンが違います' });
    const auth = tokens.authenticate(matched[1], now());
    if (!auth) return res.status(401).json({ error: 'トークンが違います' });
    if (auth.expired) return res.status(401).json({ error: 'トークンの期限が切れています' });
    req.aiToken = auth.token;
    req.aiTokenValue = matched[1];
    next();
  });
  for (const route of AI_ROUTES) {
    router[route.method.toLowerCase()](route.path, async (req, res) => {
      const query = req.query ?? {};
      const body = req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {};
      const args = route.method === 'GET' ? { ...query } : { ...query, ...body };
      try {
        const result = await dispatch(req.aiToken, route.tool, args, { req, tokenValue: req.aiTokenValue });
        res.status(result.status).json(result.body ?? {});
      } catch (err) {
        res.status(500).json({ error: '処理できませんでした' });
      }
    });
  }
  router.use((_req, res) => {
    res.status(404).json({ error: 'その操作はありません' });
  });

  function mountAdmin(admin) {
    admin.get('/ai-tokens', (_req, res) => res.json({ tokens: tokens.list() }));
    admin.post('/ai-tokens', (req, res) => {
      try {
        const issued = tokens.issue(req.body ?? {});
        res.status(201).json({ ok: true, token: issued.token, value: issued.value });
      } catch (err) {
        res.status(400).json({ error: err.message });
      }
    });
    admin.delete('/ai-tokens/:id', (req, res) => {
      try {
        res.json({ ok: tokens.revoke(req.params.id) });
      } catch (err) {
        res.status(404).json({ error: err.message });
      }
    });
    admin.get('/ai-audit', (req, res) => {
      const limit = Math.min(100, Math.max(1, Number(req.query?.limit) || 20));
      res.json({ entries: recent(limit) });
    });
    admin.get('/ai-approvals', (_req, res) => res.json({ approvals: pending() }));
    admin.post('/ai-approvals/:id/approve', (req, res) => {
      try {
        res.json({ ok: true, approval: decide(req.params.id, '承認済み') });
      } catch (err) {
        res.status(err.status || 400).json({ error: err.message });
      }
    });
    admin.post('/ai-approvals/:id/reject', (req, res) => {
      try {
        res.json({ ok: true, approval: decide(req.params.id, '却下') });
      } catch (err) {
        res.status(err.status || 400).json({ error: err.message });
      }
    });
  }

  return { router, dispatch, mountAdmin, recent, pending, tokens, decide };
}

function publicApproval(row) {
  return {
    id: row.id,
    status: row.status,
    tenant: row.tenant,
    tokenId: row.tokenId,
    path: row.path,
    op: row.op,
    value: row.value ?? null,
    global: row.global,
    createdAt: row.createdAt,
    decidedAt: row.decidedAt,
  };
}

function publicChange(change) {
  return {
    id: change.id,
    at: change.at,
    tool: change.tool,
    path: change.path,
    op: change.op,
    undoable: change.undoable !== false,
  };
}

export { publicToken };
