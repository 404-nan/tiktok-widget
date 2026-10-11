import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Hub } from './src/hub.js';
import { TikTokSource } from './src/tiktok.js';
import { DemoSource, DEMO_GIFTS, makeEvent } from './src/demo.js';
import * as cfg from './src/config.js';
import { SCHEMA, SECTIONS, COLOR_TOKENS, defaultsFor } from './src/schema.js';
import YAML from 'yaml';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3939;
const HOST = process.env.HOST || '127.0.0.1';

const hub = new Hub();
const tiktok = new TikTokSource(hub);
const demo = new DemoSource(hub);

const app = express();
app.use(express.json());
app.use(express.static(path.join(root, 'public')));
// ライブラリ・フォント・アイコンは node_modules から直接配る（OBS がオフラインでも表示できる）
app.get('/vendor/matter.min.js', (_req, res) => {
  res.sendFile(path.join(root, 'node_modules/matter-js/build/matter.min.js'));
});
const vendor = (dir) => express.static(path.join(root, 'node_modules', dir), { maxAge: '7d' });
app.use('/vendor/fonts/zen-kaku-gothic-new', vendor('@fontsource/zen-kaku-gothic-new'));
app.use('/vendor/fonts/barlow-condensed', vendor('@fontsource/barlow-condensed'));
app.use('/vendor/icons', vendor('lucide-static/icons'));
// ルーレットの画像などは media/ に置く
app.use('/media', express.static(cfg.MEDIA_DIR));
app.get('/', (_req, res) => res.redirect('/dashboard/'));

// --- ダッシュボード用 API ---

app.get('/api/status', (_req, res) => {
  res.json({ status: hub.status, state: hub.state, recent: hub.recent, demo: demo.running });
});

// テスト送信用のギフト一覧（seen: true は実際の配信で届いたギフト）
app.get('/api/gifts', (_req, res) => {
  const seen = [...hub.seenGifts.values()].map((g) => ({ ...g, seen: true }));
  res.json([...DEMO_GIFTS, ...seen.filter((g) => !DEMO_GIFTS.some((d) => d.name === g.name))]);
});

// --- 設定（config.yaml） ---

const baseUrl = (req) => `${req.protocol}://${req.get('host')}`;
let lastIssues = { errors: [], warnings: [] };

function configPayload(req) {
  const defaults = Object.fromEntries(SECTIONS.map((s) => [s, defaultsFor(s)]));
  return {
    path: cfg.CONFIG_PATH,
    yaml: cfg.readText(),
    config: hub.config,
    defaults,
    errors: lastIssues.errors,
    warnings: lastIssues.warnings,
    widgets: hub.config ? cfg.widgetList(hub.config, baseUrl(req)) : [],
  };
}

app.get('/api/config', (req, res) => res.json(configPayload(req)));
app.get('/api/config/reference', (_req, res) => res.type('text/markdown').send(cfg.reference()));
// フォームを作るための定義（関数は JSON にすると落ちる）
app.get('/api/config/schema', (_req, res) => res.json({ sections: SCHEMA, colorTokens: COLOR_TOKENS }));

// AI から使うための案内
app.get('/api/ai', (_req, res) => {
  const mcp = path.join(root, 'mcp', 'server.js');
  res.json({
    claudeCode: `claude mcp add tiktok-widget -- node ${mcp}`,
    desktop: JSON.stringify({ mcpServers: { 'tiktok-widget': { command: 'node', args: [mcp] } } }, null, 2),
    cli: 'npm run tw -- help',
    configPath: cfg.CONFIG_PATH,
  });
});

// YAML 全体を置き換える
app.put('/api/config', (req, res) => {
  const result = cfg.replaceText(String(req.body?.yaml ?? ''));
  applyConfigResult(result);
  res.status(result.ok ? 200 : 422).json({ ...result, ...configPayload(req) });
});

// 一部だけ変える: { path: "roulettes.main.items", value: [...] } / { path, merge: true, value } / { path, delete: true }
app.patch('/api/config', (req, res) => {
  const { path: p, merge, delete: del, yaml } = req.body ?? {};
  if (p == null || p === '') return res.status(400).json({ error: 'path が必要です' });
  let value = req.body?.value;
  // 値を YAML の文字で受け取ることもできる（ダッシュボードの rules の欄など）
  if (typeof yaml === 'string') {
    try {
      value = YAML.parse(yaml);
    } catch (err) {
      return res.status(422).json({ ok: false, errors: [`YAML の書き方: ${err.message}`], warnings: [], ...configPayload(req) });
    }
  }
  const result = del ? cfg.deleteValue(p) : merge ? cfg.mergeValue(p, value) : cfg.setValue(p, value);
  applyConfigResult(result);
  res.status(result.ok ? 200 : 422).json({ ...result, ...configPayload(req) });
});

app.get('/api/media', (_req, res) => {
  const out = [];
  const walk = (dir, prefix) => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) walk(path.join(dir, ent.name), `${prefix}${ent.name}/`);
      else if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(ent.name)) out.push(`media/${prefix}${ent.name}`);
    }
  };
  if (fs.existsSync(cfg.MEDIA_DIR)) walk(cfg.MEDIA_DIR, '');
  res.json(out);
});

app.post('/api/connect', async (req, res) => {
  const username = String(req.body?.username ?? '').trim();
  if (!username) return res.status(400).json({ error: 'ユーザー名を入力してください' });
  demo.stop();
  try {
    await tiktok.connect(username, { signApiKey: req.body?.signApiKey });
    res.json({ ok: true, status: hub.status });
  } catch (err) {
    res.status(502).json({ error: err.message, status: hub.status });
  }
});

app.post('/api/disconnect', async (_req, res) => {
  await tiktok.disconnect();
  demo.stop();
  hub.setStatus({ mode: 'idle', username: null, message: '切断しました' });
  res.json({ ok: true });
});

app.post('/api/demo', async (req, res) => {
  if (req.body?.on) {
    await tiktok.disconnect();
    demo.start();
    hub.setStatus({ mode: 'demo', username: null, message: 'デモモードでイベントを流しています' });
  } else {
    demo.stop();
    hub.setStatus({ mode: 'idle', message: 'デモモードを止めました' });
  }
  res.json({ ok: true, demo: demo.running });
});

app.post('/api/simulate', (req, res) => {
  const event = makeEvent(req.body?.kind, req.body ?? {});
  if (!event) return res.status(400).json({ error: '不明なイベント種類です' });
  hub.publish(event);
  res.json({ ok: true });
});

app.post('/api/control', (req, res) => {
  const { target, action, data } = req.body ?? {};
  if (!target || !action) return res.status(400).json({ error: 'target と action が必要です' });
  hub.control(String(target), String(action), data ?? {});
  res.json({ ok: true });
});

app.post('/api/reset', (_req, res) => {
  hub.reset();
  res.json({ ok: true });
});

// --- WebSocket（ウィジェットへの配信） ---

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
wss.on('connection', (ws) => hub.addClient(ws));

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
wss.on('connection', (ws) => {
  ws.isAlive = true;
  ws.on('pong', () => (ws.isAlive = true));
});

// --- 設定ファイルを読み、変わったら反映する ---

function applyConfigResult(result) {
  if (!result.ok && result.errors?.length) return;
  if (result.config) {
    lastIssues = { errors: [], warnings: result.warnings ?? [] };
    hub.setConfig(result.config);
  }
}

if (cfg.ensureConfigFile()) console.log(`  設定ファイルを作りました: ${cfg.CONFIG_PATH}`);
cfg.watch((result) => {
  if (result.errors.length) {
    // 壊れた設定は使わず、前の設定のまま動かす
    lastIssues = { errors: result.errors, warnings: result.warnings };
    hub.broadcast({ type: 'configError', errors: result.errors });
    console.warn(`[config] 設定ファイルにエラーがあるため反映していません:\n  ${result.errors.join('\n  ')}`);
    return;
  }
  lastIssues = { errors: [], warnings: result.warnings };
  if (JSON.stringify(result.config) !== JSON.stringify(hub.config)) hub.setConfig(result.config);
});

server.listen(PORT, HOST, () => {
  const base = `http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}`;
  console.log(`\n  TikTok LIVE ウィジェット  ${base}/dashboard/\n`);

  if (process.argv.includes('--demo')) {
    demo.start();
    hub.setStatus({ mode: 'demo', message: 'デモモードでイベントを流しています' });
  } else if (process.env.TIKTOK_USERNAME) {
    tiktok.connect(process.env.TIKTOK_USERNAME).catch((err) => console.warn(`[tiktok] ${err.message}`));
  }
});
