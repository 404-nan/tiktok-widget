import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import express from 'express';
import { WebSocketServer } from 'ws';
import { Hub } from './src/hub.js';
import { TikTokSource } from './src/tiktok.js';
import { DemoSource, DEMO_GIFTS, makeEvent } from './src/demo.js';

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
app.get('/', (_req, res) => res.redirect('/dashboard/'));

// --- ダッシュボード用 API ---

app.get('/api/status', (_req, res) => {
  res.json({ status: hub.status, state: hub.state, recent: hub.recent, demo: demo.running });
});

app.get('/api/gifts', (_req, res) => res.json(DEMO_GIFTS));

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
