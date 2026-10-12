import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import express from 'express';
import { WebSocketServer } from 'ws';
import * as cfg from './src/config.js';
import { SCHEMA, SECTIONS } from './src/schema.js';
import { createRuntime, featureOfPage, FEATURES } from './src/runtime.js';
import { Tenants, DATA_DIR } from './src/tenants.js';
import { createVault } from './src/vault.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(root, 'public');
const PORT = Number(process.env.PORT) || 3939;
const HOST = process.env.HOST || '127.0.0.1';
// TW_HOSTED=1: 配信者ごとの URL（/t/<鍵>/...）と管理画面だけを出す（1人用の /dashboard/ は出さない）
const HOSTED = process.env.TW_HOSTED === '1';

// Cloudflare などで動かすとき（TW_VAULT あり）: data/ を置き場から戻してから始める
const vault = process.env.TW_VAULT ? createVault({ url: process.env.TW_VAULT, dir: DATA_DIR }) : null;
if (vault) await vault.restore();

// --- 1人で使うとき（今までどおり config.yaml と data/ を使う） ---
const local = HOSTED
  ? null
  : createRuntime({ id: 'local', store: cfg.localStore, dataDir: DATA_DIR, mediaDirs: [cfg.MEDIA_DIR] });

// --- 契約している配信者（data/tenants.json） ---
const tenants = new Tenants();

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

const sameToken = (t) => typeof t === 'string' && t.length === ADMIN_TOKEN.length && crypto.timingSafeEqual(Buffer.from(t), Buffer.from(ADMIN_TOKEN));
const admin = express.Router();
admin.use((req, res, next) => (sameToken(req.get('x-admin-token')) ? next() : res.status(401).json({ error: '合言葉が違います' })));

// 前に Cloudflare などがあるときは、そこに届いた URL（X-Forwarded-Host / Proto）を使う
const origin = (req) => `${req.protocol}://${req.host}`;
function tenantView(req, t) {
  const rt = tenants.runtimes.get(t.id);
  return {
    id: t.id,
    name: t.name,
    enabled: t.enabled,
    widgets: t.widgets,
    createdAt: t.createdAt,
    access: tenants.accessState(t.id),
    urls: { dashboard: `${origin(req)}/t/${t.key}/dashboard/`, monitor: `${origin(req)}/t/${t.key}/monitor/`, obs: `${origin(req)}/t/${t.obsKey}/widgets/` },
    status: rt ? rt.hub.status : { mode: 'idle', message: 'まだ開かれていません' },
  };
}
admin.get('/tenants', (req, res) => {
  res.json({
    tenants: tenants.list().map((t) => tenantView(req, t)),
    global: tenants.globalState(),
    features: FEATURES,
  });
});
admin.post('/tenants', (req, res) => {
  const t = tenants.create({ name: req.body?.name });
  res.json({ ok: true, tenant: tenantView(req, t) });
});
admin.patch('/tenants/:id', (req, res) => {
  try {
    res.json({ ok: true, tenant: tenantView(req, tenants.update(req.params.id, req.body ?? {})) });
  } catch (err) {
    res.status(404).json({ error: err.message });
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
app.use('/admin/api', admin);

// --- 配信者ごとの URL（/t/<鍵>/...） ---

const lockedPage = path.join(PUBLIC, 'widgets', 'locked.html');
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
  if (role === 'obs' && !(p.startsWith('/widgets/') || p.startsWith('/media/') || p.startsWith('/api/'))) {
    return res.status(403).type('text/plain; charset=utf-8').send('これは OBS 用の URL です。ダッシュボードはダッシュボードの URL で開いてください');
  }
  if (p === '/' || p === '') return res.redirect(`${req.baseUrl}/${role === 'obs' ? 'widgets/' : 'dashboard/'}`);
  // 管理者が使えなくしているウィジェットは、何も出さないページにする
  const page = p.startsWith('/widgets/') ? p.slice('/widgets/'.length) : null;
  const feature = page && featureOfPage(page);
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
}

// --- WebSocket（ウィジェットへの配信） ---

const server = createServer(app);
const wss = new WebSocketServer({ noServer: true });
server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://x');
  let rt = null;
  let role = 'owner';
  const m = pathname.match(/^\/t\/([^/]+)\/ws$/);
  if (m) {
    const found = tenants.byKey(m[1]);
    if (found?.tenant.enabled) {
      rt = tenants.runtime(found.tenant.id);
      role = found.role;
    }
  } else if (pathname === '/ws') {
    rt = local;
  }
  if (!rt) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    ws.role = role;
    ws.isAlive = true;
    ws.on('pong', () => (ws.isAlive = true));
    rt.hub.addClient(ws);
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
