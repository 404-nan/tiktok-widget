import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { WebSocketServer } from 'ws';
import * as cfg from './src/config.js';
import { createRuntime, featureOfPage, FEATURES } from './src/runtime.js';
import { Tenants, DATA_DIR } from './src/tenants.js';
import { overlayMessageAllowed } from './src/billing.js';
import { createVault } from './src/vault.js';
import { createSignKey } from './src/signkey.js';
import { NotesStore } from './src/notes.js';
import { ApiKeyStore } from './src/api-keys.js';
import { adminGuard } from './src/admin-auth.js';
import { createAi } from './src/ai.js';
import { createPinLogin, readCookie, COOKIE_DAYS } from './src/pinlogin.js';
import { AiTokenStore } from './src/ai-tokens.js';
import { createAiControl } from './src/ai-api.js';
import { createAiMcpHandler } from './src/ai-mcp.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(root, 'public');
const PORT = Number(process.env.PORT) || 3939;
const HOST = process.env.HOST || '127.0.0.1';
// TW_HOSTED=1: 配信者ごとの URL（/t/<鍵>/...）と管理画面だけを出す（1人用の /dashboard/ は出さない）
const HOSTED = process.env.TW_HOSTED === '1';

// Cloudflare などで動かすとき（TW_VAULT あり）: data/ を置き場から戻してから始める
const vault = process.env.TW_VAULT ? createVault({ url: process.env.TW_VAULT, dir: DATA_DIR }) : null;
if (vault) await vault.restore();

const notes = new NotesStore({ dir: DATA_DIR });

// 「AI にたのむ」（キーは管理画面で入れたものが data/ai.json、または環境変数 TW_AI_KEY）
const ai = createAi({ dir: DATA_DIR });

// --- 1人で使うとき（今までどおり config.yaml と data/ を使う） ---
const local = HOSTED
  ? null
  : createRuntime({ id: 'local', store: cfg.localStore, dataDir: DATA_DIR, mediaDirs: [cfg.MEDIA_DIR], ai, notes });

// --- 契約している配信者（data/tenants.json） ---
const tenants = new Tenants({ ai, notes });

// TikTok につなぐための API キー（管理画面で入れたものは data/sign-api-key.txt）
const signKey = createSignKey({ dir: DATA_DIR });
const apiKeys = new ApiKeyStore({ dir: DATA_DIR, signKey });

// 管理画面の合言葉。TW_ADMIN_TOKEN がなければ作って data/admin-token.txt に残す
const ADMIN_TOKEN_FILE = path.join(DATA_DIR, 'admin-token.txt');
const ADMIN_TOKEN = (() => {
  if (process.env.TW_ADMIN_TOKEN) return process.env.TW_ADMIN_TOKEN;
  try {
    return fs.readFileSync(ADMIN_TOKEN_FILE, 'utf8').trim();
  } catch {
    const t = crypto.randomBytes(18).toString('base64url');
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.writeFileSync(ADMIN_TOKEN_FILE, `${t}\n`, { mode: 0o600 });
    return t;
  }
})();

const app = express();
app.set('trust proxy', true);
app.use(express.json());
// 動いているかの確認（Cloudflare が定期的に呼ぶ）
app.get('/healthz', (_req, res) => res.json({ ok: true }));

// ライブラリ・フォント・アイコンは node_modules から直接配る（OBS がオフラインでも表示できる）
app.get('/vendor/matter.min.js', (_req, res) => {
  res.sendFile(path.join(root, 'node_modules/matter-js/build/matter.min.js'));
});
const vendor = (dir) => express.static(path.join(root, 'node_modules', dir), { maxAge: '7d' });
app.use('/vendor/fonts/zen-kaku-gothic-new', vendor('@fontsource/zen-kaku-gothic-new'));
app.use('/vendor/fonts/barlow-condensed', vendor('@fontsource/barlow-condensed'));
app.use('/vendor/fonts/dela-gothic-one', vendor('@fontsource/dela-gothic-one'));
app.use('/vendor/icons', vendor('lucide-static/icons'));

// --- 管理画面（/admin） ---

const admin = express.Router();
admin.use(adminGuard(ADMIN_TOKEN));

// 前に Cloudflare などがあるときは、そこに届いた URL（X-Forwarded-Host / Proto）を使う
const origin = (req) => `${req.protocol}://${req.host}`;
function tenantView(req, t) {
  const rt = tenants.runtimes.get(t.id);
  const config = tenantConfig(rt, t);
  return {
    id: t.id,
    name: t.name,
    tiktokId: t.tiktokId ?? '',
    enabled: t.enabled,
    widgets: t.widgets,
    createdAt: t.createdAt,
    access: tenants.accessState(t.id),
    rental: tenants.info(t.id).rental,
    shortId: t.shortId,
    pin: t.pin,
    billing: tenants.billing.adminView(t.id),
    urls: tenantUrls(req, t),
    status: rt ? rt.hub.status : { mode: 'idle', message: 'まだ開かれていません' },
    settings: {
      widgets: [...(t.widgets ?? [])],
      roulettes: publicTenantSection(config, 'roulettes'),
      timers: publicTenantSection(config, 'timers'),
      rush: publicTenantSection(config, 'rush'),
    },
  };
}

function tenantConfig(runtime, tenant) {
  return runtime?.hub.config ?? cfg.createStore(path.join(tenants.dataDir(tenant.id), 'config.yaml')).load().config;
}

function tenantUrls(req, tenant) {
  const base = origin(req);
  return {
    short: `${base}/d/${tenant.shortId}`,
    dashboard: `${base}/t/${tenant.key}/dashboard/`,
    monitor: `${base}/t/${tenant.key}/monitor/`,
    obs: `${base}/t/${tenant.obsKey}/widgets/`,
  };
}

function publicTenantSection(config, section) {
  return config ? cfg.publicConfig({ [section]: config[section] ?? {} })[section] : {};
}
admin.get('/tenants', (req, res) => {
  res.json({
    tenants: tenants.list().map((t) => tenantView(req, t)),
    global: tenants.globalState(),
    features: FEATURES,
    signKey: signKey.state(),
    ai: ai.state(),
    keys: apiKeys.list(),
    notes: notes.list(),
    billing: tenants.billing.globalView(),
    aiTokens: aiControl.tokens.list(),
    aiAudit: aiControl.recent(20),
    aiApprovals: aiControl.pending(),
  });
});
admin.get('/lul', (req, res) => res.json({ tenants: tenants.list().map((t) => tenantView(req, t)), features: FEATURES }));
admin.post('/tenants', (req, res) => {
  try {
    const t = tenants.create({ name: req.body?.name, referralCode: req.body?.referralCode });
    res.json({ ok: true, tenant: tenantView(req, t) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
admin.patch('/tenants/:id', (req, res) => {
  try {
    res.json({ ok: true, tenant: tenantView(req, tenants.update(req.params.id, req.body ?? {})) });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});
admin.patch('/tenants/:id/settings', (req, res) => {
  try {
    const rt = tenants.runtime(req.params.id);
    const p = req.body?.path;
    if (p == null || p === '') return res.status(400).json({ error: 'path が必要です' });
    const result = req.body?.delete ? rt.deleteConfig(p) : req.body?.merge ? rt.mergeConfig(p, req.body?.value) : rt.setConfig(p, req.body?.value);
    if (!result.ok) return res.status(422).json(result);
    res.json({ ok: true, tenant: tenantView(req, tenants.get(req.params.id)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
admin.post('/tenants/:id/rekey', (req, res) => {
  try {
    const t = tenants.rekey(req.params.id, req.body?.which);
    tenants.close(t.id);
    res.json({ ok: true, tenant: tenantView(req, t) });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});
// 4桁の数字を作り直す（前の数字で覚えた端末は入れ直し）
admin.post('/tenants/:id/repin', (req, res) => {
  try {
    res.json({ ok: true, tenant: tenantView(req, tenants.repin(req.params.id)) });
  } catch (err) {
    res.status(404).json({ error: err.message });
  }
});
admin.delete('/tenants/:id', async (req, res) => {
  await tenants.remove(req.params.id);
  res.json({ ok: true });
});
// 使える / 使えない: { target: 配信者の id | 'global' | 'everyone', feature: 名前 | 'all' | 'premium', on: true | false | null（初めに戻す）, hours: 0（ずっと）| 時間 }
admin.put('/access', (req, res) => {
  const { target, feature, on, hours } = req.body ?? {};
  try {
    tenants.setAccess(target, feature, on, hours);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
// TikTok につなぐための API キー: { key: 文字 }（空なら消す）。次に接続するときから使う
admin.put('/sign-key', (req, res) => {
  try {
    res.json({ ok: true, signKey: signKey.set(req.body?.key) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
for (const route of ['/keys', '/api-keys']) {
  admin.get(route, (_req, res) => res.json({ keys: apiKeys.list() }));
  admin.post(route, (req, res) => {
    try { res.status(201).json({ ok: true, key: apiKeys.add(req.body ?? {}) }); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });
  admin.patch(`${route}/:id`, (req, res) => {
    try { res.json({ ok: true, key: apiKeys.update(req.params.id, req.body ?? {}) }); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });
  admin.put(`${route}/:id`, (req, res) => {
    try { res.json({ ok: true, key: apiKeys.update(req.params.id, req.body ?? {}) }); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });
  admin.delete(`${route}/:id`, (req, res) => {
    try { res.json({ ok: apiKeys.remove(req.params.id) }); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });
}
admin.get('/notes', (_req, res) => res.json({ notes: notes.list() }));
admin.post('/notes', (req, res) => {
  try { res.status(201).json({ ok: true, note: notes.create(req.body ?? {}) }); }
  catch (err) { res.status(400).json({ error: err.message }); }
});
for (const method of ['patch', 'put']) {
  admin[method]('/notes/:id', (req, res) => {
    try { res.json({ ok: true, note: notes.update(req.params.id, req.body ?? {}) }); }
    catch (err) { res.status(400).json({ error: err.message }); }
  });
}
admin.delete('/notes/:id', (req, res) => res.json({ ok: notes.remove(req.params.id) }));
// プランと支払い。決済はせず、状態・期限・プランを手で入れる
admin.put('/billing', (req, res) => {
  try {
    res.json({ ok: true, billing: tenants.updateBillingSettings(req.body ?? {}) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
admin.put('/tenants/:id/billing', (req, res) => {
  try {
    res.json({ ok: true, billing: tenants.updateBilling(req.params.id, req.body ?? {}), tenant: tenantView(req, tenants.get(req.params.id)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
admin.post('/tenants/:id/billing/code', (req, res) => {
  try {
    res.json({ ok: true, code: tenants.issueReferralCode(req.params.id), tenant: tenantView(req, tenants.get(req.params.id)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
admin.post('/tenants/:id/referral', (req, res) => {
  try {
    const result = tenants.applyReferral(req.params.id, req.body?.code);
    res.json({ ok: true, ...result, tenant: tenantView(req, tenants.get(req.params.id)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
admin.post('/tenants/:id/billing/credit', (req, res) => {
  try {
    res.json({ ok: true, discount: tenants.useBillingCredit(req.params.id), tenant: tenantView(req, tenants.get(req.params.id)) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
// 「AI にたのむ」の設定: { key?（空なら消す）, model?, dailyLimit?（配信者1人の1日の回数） }
admin.put('/ai', (req, res) => {
  try {
    res.json({ ok: true, ai: ai.update(req.body ?? {}) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
// 外部 AI のトークン。値は発行時だけ返し、ファイルには照合用の要約だけを残す。
const aiTokens = new AiTokenStore({ dir: DATA_DIR });
const aiControl = createAiControl({
  dataDir: DATA_DIR,
  tokens: aiTokens,
  resolveTenant(id) {
    if (id === 'local') {
      if (!local) return null;
      return { id: 'local', runtime: local, widgetBase: null };
    }
    const tenant = tenants.get(id);
    if (!tenant) return null;
    if (!tenant.enabled) return { disabled: true };
    return {
      id: tenant.id,
      runtime: tenants.runtime(tenant.id),
      widgetBaseFor: (req) => `${origin(req)}/t/${tenant.obsKey}`,
      getWidgets: () => [...(tenants.get(id)?.widgets ?? [])],
      setWidgets: (list) => tenants.update(id, { widgets: list }),
      getTemplate: () => tenants.get(id)?.template ?? null,
      setTemplate: (template) => tenants.setTemplate(id, template),
    };
  },
  applyBilling({ global, tenant, patch }) {
    if (global) return tenants.updateBillingSettings(patch);
    if (!tenants.get(tenant)) throw new Error('その配信者は見つかりません');
    return tenants.updateBilling(tenant, patch);
  },
});
aiControl.mountAdmin(admin);
app.use('/admin/api', admin);

// 外部の AI（Bearer トークン）。接続・切断・再起動・トークン発行・配信者の削除はここには無い。
app.use('/ai/v1', aiControl.router);
app.use('/ai/mcp', createAiMcpHandler(aiControl));

// --- 短い URL と 4桁の数字（/d/<短いID>） ---
// 正しい数字かクッキーがあれば、今までのダッシュボードの URL（/t/<鍵>/dashboard/）へ送る

const pinLogin = createPinLogin({ dir: DATA_DIR });
const pinPage = path.join(PUBLIC, 'pin', 'index.html');
const cookieName = (t) => `twd_${t.shortId}`;
const text = (res, code, msg) => res.status(code).type('text/plain; charset=utf-8').send(msg);
const untilText = (until) => `${Math.max(1, Math.ceil((until - Date.now()) / 60_000))}分`;
app.get('/d/:sid', (req, res) => {
  const t = tenants.byShortId(req.params.sid);
  if (!t) {
    pinLogin.miss(req.ip);
    return text(res, 404, 'この URL は使えません（管理者に確認してください）');
  }
  if (!t.enabled) return text(res, 403, 'この配信者の利用は止められています');
  res.set('Cache-Control', 'no-store');
  if (pinLogin.cookieOk(t, readCookie(req.headers.cookie, cookieName(t)))) return res.redirect(`/t/${t.key}/dashboard/`);
  res.sendFile(pinPage);
});
app.post('/d/:sid', (req, res) => {
  res.set('Cache-Control', 'no-store');
  const t = tenants.byShortId(req.params.sid);
  if (!t) {
    const until = pinLogin.miss(req.ip);
    return res.status(until ? 429 : 404).json({ error: until ? `入れすぎです。${untilText(until)}ほど待ってください` : 'この URL は使えません' });
  }
  if (!t.enabled) return res.status(403).json({ error: 'この配信者の利用は止められています' });
  const r = pinLogin.check(t, String(req.body?.pin ?? ''), req.ip);
  if (r.reason === 'locked') return res.status(429).json({ error: `入れすぎです。${untilText(r.until)}ほど待ってください` });
  if (!r.ok) return res.status(401).json({ error: `数字が違います（あと${r.left}回）`, left: r.left });
  res.cookie(cookieName(t), pinLogin.cookieFor(t), { httpOnly: true, secure: req.secure, sameSite: 'lax', path: `/d/${t.shortId}`, maxAge: COOKIE_DAYS * 86400_000 });
  res.json({ ok: true, url: `/t/${t.key}/dashboard/` });
});

// --- 配信者ごとの URL（/t/<鍵>/...） ---

const lockedPage = path.join(PUBLIC, 'widgets', 'locked.html');
function billingAllows(fn, fallback) {
  try {
    return fn();
  } catch (err) {
    console.warn(`[billing] 判定に失敗したので通します: ${err?.message ?? err}`);
    return fallback;
  }
}
const tenantStatic = express.static(PUBLIC);
app.use('/t/:key', (req, res, next) => {
  const found = tenants.byKey(req.params.key);
  if (!found) return res.status(404).type('text/plain; charset=utf-8').send('この URL は使えません（管理者に確認してください）');
  const { tenant, role } = found;
  if (!tenant.enabled) return res.status(403).type('text/plain; charset=utf-8').send('この配信者の利用は止められています');
  req.role = role;
  req.tenant = tenant;
  const p = req.path;
  // OBS 用の鍵で開けるのはウィジェットと画像と、ウィジェットが読む API だけ
  if (role === 'obs' && !(p === '/widgets' || p.startsWith('/widgets/') || p.startsWith('/media/') || p.startsWith('/api/'))) {
    return res.status(403).type('text/plain; charset=utf-8').send('これは OBS 用の URL です。ダッシュボードはダッシュボードの URL で開いてください');
  }
  if (p === '/' || p === '') return res.redirect(`${req.baseUrl}/${role === 'obs' ? 'widgets/' : 'dashboard/'}`);
  // OBS の土台 URL（/widgets/）には index が無いので、API に落ちて JSON 403 になるのを防ぐ
  if (role === 'obs' && (p === '/widgets' || p === '/widgets/')) {
    return res.type('text/plain; charset=utf-8').send('OBS 用の土台 URL です。ダッシュボードで各ウィジェットの URL をコピーして OBS に貼ってください');
  }
  // 停止中、またはプランに含まれないウィジェットは、何も出さないページにする（配信画面にエラーは出さない）
  const page = p.startsWith('/widgets/') ? p.slice('/widgets/'.length) : null;
  const feature = page && featureOfPage(page);
  if (page && /\.html$/i.test(page) && billingAllows(() => tenants.billing.widgetBlocked(tenant.id, feature), false)) return res.sendFile(lockedPage);
  if (feature && !tenants.entitled(tenant.id, feature)) return res.sendFile(lockedPage);
  const rt = tenants.runtime(tenant.id);
  tenantStatic(req, res, () => rt.router(req, res, next));
});

// --- 1人で使うときの URL（/dashboard/ など） ---

if (local) {
  app.get('/', (_req, res) => res.redirect('/dashboard/'));
  app.use(express.static(PUBLIC));
  app.use(local.router);
} else {
  app.get('/', (_req, res) => res.redirect('/admin/'));
  app.use('/admin', express.static(path.join(PUBLIC, 'admin')));
  app.use('/dashboard', express.static(path.join(PUBLIC, 'dashboard'))); // 共通の CSS・部品だけ（API は /t/<鍵>/ の下）
  app.use('/widgets', express.static(path.join(PUBLIC, 'widgets')));
  app.use('/help', express.static(path.join(PUBLIC, 'help'))); // 配信者向け使い方（鍵なしで開ける）
}

// --- WebSocket（ウィジェットへの配信） ---

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
function websocketTarget(pathname) {
  const tenantPath = pathname.match(/^\/t\/([^/]+)\/ws$/);
  if (tenantPath) {
    const found = tenants.byKey(tenantPath[1]);
    if (!found?.tenant.enabled) return null;
    return { runtime: tenants.runtime(found.tenant.id), role: found.role, tenantId: found.tenant.id };
  }
  if (pathname === '/ws') return local ? { runtime: local, role: 'owner', tenantId: null } : null;
  return null;
}

function acceptWebsocket(ws, target) {
  const { runtime, role, tenantId } = target;
  ws.role = role;
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
  const overlayBlocked = () => billingAllows(() => tenantId != null && tenants.billing.isOverlayBlocked(tenantId), false);
  // 未払いの OBS 用接続は、配信に映るものを流さない。読み込み直しだけは届ける
  ws.quiet = role === 'obs' && overlayBlocked();
  ws.allowMessage = (msg) => overlayMessageAllowed({ role, blocked: overlayBlocked(), type: msg?.type });
  runtime.hub.addClient(ws);
}

server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://x');
  const target = websocketTarget(pathname);
  if (!target) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    acceptWebsocket(ws, target);
  });
});

// 切れた接続を掃除する
setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) {
      ws.terminate();
      continue;
    }
    ws.isAlive = false;
    ws.ping();
  }
}, 30_000).unref();

server.listen(PORT, HOST, () => {
  vault?.start();
  const base = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  console.log(`\n  TikTok LIVE ウィジェット`);
  if (local) console.log(`  ダッシュボード  ${base}/dashboard/`);
  console.log(`  管理画面        ${base}/admin/  （合言葉: ${process.env.TW_ADMIN_TOKEN ? '環境変数 TW_ADMIN_TOKEN' : ADMIN_TOKEN_FILE}）\n`);

  if (!local) return;
  if (process.argv.includes('--demo')) {
    local.demo.start();
    local.hub.setStatus({ mode: 'demo', message: 'デモモードでイベントを流しています' });
  } else if (process.env.TIKTOK_USERNAME) {
    local.tiktok.connect(process.env.TIKTOK_USERNAME).catch((err) => console.warn(`[tiktok] ${err.message}`));
  }
});
