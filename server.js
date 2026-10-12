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
import { RouletteEngine } from './src/roulette.js';
import { Minecraft } from './src/minecraft.js';
import { History } from './src/history.js';
import { readProfile, SUPERSTREAM_ACTIONS } from './src/superstream.js';
import { RushEngine } from './src/rush.js';
import { WinsEngine } from './src/wins.js';
import * as presets from './src/presets.js';

const root = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3939;
const HOST = process.env.HOST || '127.0.0.1';

const hub = new Hub();
const tiktok = new TikTokSource(hub);
const demo = new DemoSource(hub);
const roulette = new RouletteEngine(hub);
const minecraft = new Minecraft(hub);
const history = new History(hub);
const rush = new RushEngine(hub);
const wins = new WinsEngine(hub);

hub.on('config', (config) => {
  roulette.setConfig(config);
  minecraft.setConfig(config.minecraft);
  rush.setConfig(config.rush);
  wins.setConfig(config.wins);
});
// ルーレットの当たりが出たら、その項目のコマンドを Minecraft に送る
hub.on('roulette', ({ roulette: r, item, trigger }) => minecraft.onRouletteResult(r, item, trigger));

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
app.use('/vendor/fonts/dela-gothic-one', vendor('@fontsource/dela-gothic-one'));
app.use('/vendor/icons', vendor('lucide-static/icons'));
// ルーレットの画像などは media/ に置く
app.use('/media', express.static(cfg.MEDIA_DIR));
app.get('/', (_req, res) => res.redirect('/dashboard/'));

// --- ダッシュボード用 API ---

app.get('/api/status', (_req, res) => {
  res.json({ status: hub.status, state: hub.state, recent: hub.recent, demo: demo.running, minecraft: minecraft.status, session: history.current?.summary() ?? null });
});

// --- 配信の履歴 ---

app.get('/api/history', (_req, res) => res.json(history.list()));
app.get('/api/history/:id', (req, res) => {
  const s = history.get(req.params.id);
  if (!s) return res.status(404).json({ error: '見つかりません' });
  res.json(s);
});
app.delete('/api/history/:id', (req, res) => res.json({ ok: history.remove(req.params.id) }));

// --- Minecraft 連携 ---

app.get('/api/minecraft', (_req, res) => res.json(minecraft.status));
app.get('/api/rush', (_req, res) => res.json(rush.snapshot()));
app.get('/api/wins', (_req, res) => res.json(wins.snapshot()));
// Stream Deck やブラウザのブックマークから押せるように GET でも受ける
// 例: /api/wins/default/win（+1）・/api/wins/default/add?value=-1・/api/wins/default/undo・/api/wins/all/reset
app.all('/api/wins/:id/:action', (req, res) => {
  try {
    const id = req.params.id === 'all' ? null : req.params.id;
    res.json({ ok: true, wins: wins.apply(id, req.params.action, req.query.value ?? req.body?.value) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});
// --- 配信のひな形（presets/）。切り替えると config.yaml が書き換わり、監視で全画面に反映される ---

app.get('/api/presets', (_req, res) => res.json({ current: presets.currentPreset(), presets: presets.listPresets().map(presets.summary) }));
app.get('/api/presets/:id', (req, res) => {
  const p = presets.readPreset(req.params.id);
  if (!p) return res.status(404).json({ error: 'ひな形がありません' });
  res.json(presets.summary(p));
});
app.post('/api/presets/:id/apply', (req, res) => {
  const goal = req.body?.goal ?? req.query.goal;
  const result = presets.applyPreset(req.params.id, { goal: goal != null && goal !== '' ? Number(goal) : undefined });
  applyConfigResult(result);
  if (result.ok) hub.broadcast({ type: 'preset', current: presets.currentPreset() });
  res.status(result.ok ? 200 : 422).json({ ok: result.ok, errors: result.errors, warnings: result.warnings, backup: result.backup, current: presets.currentPreset() });
});

// SuperStream のプロフィールに設定済みの演出（読むだけ）
app.get('/api/superstream', (_req, res) => {
  const mc = hub.config?.minecraft ?? {};
  res.json({ ...readProfile(mc.superstreamFile, [...hub.seenGifts.values()]), configuredProfile: mc.superstreamProfile, actions: SUPERSTREAM_ACTIONS });
});
app.post('/api/minecraft/check', async (_req, res) => res.json(await minecraft.check()));
app.post('/api/minecraft/command', async (req, res) => {
  const command = String(req.body?.command ?? '').trim();
  if (!command) return res.status(400).json({ error: 'コマンドを入力してください' });
  try {
    res.json({ ok: true, response: await minecraft.test(command) });
  } catch (err) {
    res.status(502).json({ error: err.message });
  }
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
  // ルーレットは何が当たるかをサーバーで決める
  if (target === 'roulette' && action === 'spin') {
    const spin = roulette.spin(data?.id ?? null);
    return spin ? res.json({ ok: true, spin }) : res.status(404).json({ error: 'ルーレットの設定がありません' });
  }
  if (target === 'roulette' && action === 'reset') roulette.clear();
  // RUSH はサーバーで状態を持つ
  if (target === 'rush') {
    const r = action === 'stop' ? rush.stop() : rush.start({ reason: 'manual' });
    return res.json({ ok: true, rush: r ?? rush.snapshot() });
  }
  // WIN 数もサーバーで持つ（data/wins.json に残す）
  if (target === 'wins') {
    try {
      return res.json({ ok: true, wins: wins.apply(data?.id || null, String(action), data?.value) });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  }
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
