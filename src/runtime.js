// 配信者1人分の仕組み: TikTok の接続、集計、ルーレット、RUSH、WIN数、延長タイマー、ボス討伐、Minecraft 連携、配信の記録、設定ファイル。
// 1人で使うときは1つだけ、配信者ごとに分けるときは配信者の数だけ作る（src/tenants.js）。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import YAML from 'yaml';
import { Hub } from './hub.js';
import { TikTokSource } from './tiktok.js';
import { DemoSource, DEMO_GIFTS, makeEvent } from './demo.js';
import * as cfg from './config.js';
import { SCHEMA, SECTIONS, COLOR_TOKENS, defaultsFor } from './schema.js';
import { RouletteEngine } from './roulette.js';
import { Minecraft } from './minecraft.js';
import { History } from './history.js';
import { readProfile, SUPERSTREAM_ACTIONS } from './superstream.js';
import { RushEngine } from './rush.js';
import { WinsEngine } from './wins.js';
import { TimerEngine } from './timer.js';
import { BossEngine } from './boss.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 延長タイマーの秒数は seconds・minutes・value（秒）のどれでも受ける
const timerSeconds = (o) => {
  const pick = (v) => (v == null || v === '' ? null : Number(v));
  const m = pick(o.minutes);
  return pick(o.seconds) ?? (m != null ? m * 60 : pick(o.value));
};

// 管理者が配信者ごとに「使える / 使えない」を決められるもの（ウィジェットと、WIN数の全画面演出・Minecraft 連携）。
// premium: true の豪華な演出は、最初は使えない。ほかは最初から使える
const FEATURE_ORDER = ['alerts', 'chats', 'wins', 'winsFx', 'timers', 'bosses', 'roulettes', 'jars', 'goals', 'counters', 'rankings', 'cutins', 'imageCutins', 'rush', 'minecraft'];
const PREMIUM_KEYS = ['cutins', 'imageCutins', 'rush', 'winsFx'];
export const FEATURES = Object.fromEntries(
  FEATURE_ORDER.map((key) => {
    if (key === 'winsFx') return [key, { label: 'WIN数の全画面演出', pages: ['wins-fx.html'], premium: true }];
    const def = SCHEMA[key];
    const pages = def.page ? [`${def.page}.html`] : [];
    if (key === 'roulettes') pages.push('roulette-strip.html');
    return [key, { label: def.title, pages, premium: PREMIUM_KEYS.includes(key) }];
  }),
);
export const PREMIUM = Object.fromEntries(Object.entries(FEATURES).filter(([, f]) => f.premium));
/** ページ名 → 使える/使えないを決めているもの（なければ null） */
export const featureOfPage = (page) => Object.entries(FEATURES).find(([, f]) => f.pages.includes(page))?.[0] ?? null;

// OBS 用の鍵でできること（読むだけ）
const OBS_ALLOWED = [/^\/api\/config$/, /^\/api\/wins$/, /^\/api\/rush$/, /^\/api\/timer$/, /^\/api\/boss$/, /^\/api\/me$/];

/**
 * 配信者1人分を作る。
 * store: 設定ファイル（cfg.createStore）、dataDir: 記録などを置く場所、mediaDirs: 画像の場所（前のほうが優先）
 * entitled(feature): そのウィジェット・演出を使えるか（管理者が決める）、info(): 配信者の情報（/api/me）、setWidgets(list): 使うウィジェットを保存
 */
export function createRuntime({ id = 'local', store, dataDir, mediaDirs, entitled = () => true, info = () => ({ mode: 'local' }), setWidgets = null, widgetBase }) {
  const hub = new Hub();
  const tiktok = new TikTokSource(hub);
  const demo = new DemoSource(hub);
  const roulette = new RouletteEngine(hub);
  const minecraft = new Minecraft(hub);
  const history = new History(hub, path.join(dataDir, 'sessions'));
  const rush = new RushEngine(hub);
  const wins = new WinsEngine(hub, path.join(dataDir, 'wins.json'));
  const timer = new TimerEngine(hub, path.join(dataDir, 'timers.json'));
  const boss = new BossEngine(hub, path.join(dataDir, 'boss.json'));
  let lastIssues = { errors: [], warnings: [] };

  // 設定を仕組みに反映する（使えない豪華な演出は止める）
  const applyEngines = (config) => {
    roulette.setConfig(config);
    // 管理者が使えなくしたものは止める
    minecraft.setConfig(entitled('minecraft') ? config.minecraft : { ...config.minecraft, enabled: false });
    rush.setConfig(entitled('rush') ? config.rush : { ...config.rush, enabled: false });
    wins.setConfig(config.wins);
    timer.setConfig(config.timers);
    boss.setConfig(config.bosses);
  };
  hub.on('config', applyEngines);
  // ルーレットの当たりが出たら、その項目のコマンドを Minecraft に送る
  hub.on('roulette', ({ roulette: r, item, trigger }) => minecraft.onRouletteResult(r, item, trigger));
  // ボスを討伐したら、設定にあるルーレットを回し、Minecraft にコマンドを送る
  hub.on('bossDefeated', ({ config: c, boss: b, by, trigger }) => {
    if (c.roulette && hub.config?.roulettes?.[c.roulette]) roulette.spin(c.roulette, trigger ?? (by?.user ? { kind: 'boss', user: by.user } : null));
    minecraft.onBossDefeated(c, b, by, trigger);
  });

  const applyConfigResult = (result) => {
    if (!result.ok && result.errors?.length) return;
    if (result.config) {
      lastIssues = { errors: [], warnings: result.warnings ?? [] };
      hub.setConfig(result.config);
    }
  };

  store.ensure();
  const unwatch = store.watch((result) => {
    if (result.errors.length) {
      // 壊れた設定は使わず、前の設定のまま動かす
      lastIssues = { errors: result.errors, warnings: result.warnings };
      hub.broadcast({ type: 'configError', errors: result.errors });
      console.warn(`[config:${id}] 設定ファイルにエラーがあるため反映していません:\n  ${result.errors.join('\n  ')}`);
      return;
    }
    lastIssues = { errors: [], warnings: result.warnings };
    if (JSON.stringify(result.config) !== JSON.stringify(hub.config)) hub.setConfig(result.config);
  });

  const origin = (req) => `${req.protocol}://${req.get('host')}`;
  function configPayload(req) {
    const defaults = Object.fromEntries(SECTIONS.map((s) => [s, defaultsFor(s)]));
    if (req.role === 'obs') return { config: cfg.publicConfig(hub.config), defaults: cfg.publicConfig(defaults) };
    return {
      path: store.path,
      yaml: store.readText(),
      config: hub.config,
      defaults,
      errors: lastIssues.errors,
      warnings: lastIssues.warnings,
      widgets: hub.config ? cfg.widgetList(hub.config, widgetBase ? widgetBase(origin(req)) : origin(req)) : [],
    };
  }

  // --- API（/api/...） ---
  const r = express.Router();

  // OBS 用の鍵では、ウィジェットが読むものだけ
  r.use((req, res, next) => {
    if (req.role !== 'obs') return next();
    if (req.method === 'GET' && (req.path.startsWith('/media/') || OBS_ALLOWED.some((re) => re.test(req.path)))) return next();
    res.status(403).json({ error: 'OBS 用の URL ではこの操作はできません（ダッシュボードの URL を使ってください）' });
  });

  r.get('/api/me', (req, res) => res.json({ ...info(), role: req.role ?? 'owner', features: FEATURES }));
  r.put('/api/me/widgets', (req, res) => {
    if (!setWidgets) return res.status(400).json({ error: '1人で使うときは選べません（全部使えます）' });
    const list = Array.isArray(req.body?.widgets) ? req.body.widgets.filter((w) => SECTIONS.includes(w)) : null;
    if (!list) return res.status(400).json({ error: 'widgets を一覧で送ってください' });
    setWidgets(list);
    res.json({ ok: true, ...info() });
  });

  r.get('/api/status', (_req, res) => {
    res.json({ status: hub.status, state: hub.state, recent: hub.recent, demo: demo.running, minecraft: minecraft.status, session: history.current?.summary() ?? null });
  });

  // 配信の記録
  r.get('/api/history', (_req, res) => res.json(history.list()));
  r.get('/api/history/:id', (req, res) => {
    const s = history.get(req.params.id);
    if (!s) return res.status(404).json({ error: '見つかりません' });
    res.json(s);
  });
  r.delete('/api/history/:id', (req, res) => res.json({ ok: history.remove(req.params.id) }));

  // Minecraft・RUSH・WIN数
  r.get('/api/minecraft', (_req, res) => res.json(minecraft.status));
  r.get('/api/rush', (_req, res) => res.json(rush.snapshot()));
  r.get('/api/wins', (_req, res) => res.json(wins.snapshot()));
  // Stream Deck やブラウザのブックマークから押せるように GET でも受ける
  // 例: /api/wins/default/win（+1）・/api/wins/default/add?value=-1・/api/wins/default/undo・/api/wins/all/reset
  r.all('/api/wins/:id/:action', (req, res) => {
    try {
      const wid = req.params.id === 'all' ? null : req.params.id;
      res.json({ ok: true, wins: wins.apply(wid, req.params.action, req.query.value ?? req.body?.value) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  // 延長タイマー。Stream Deck などから GET でも押せる
  // 例: /api/timer/default/toggle（止める・動かす）・/api/timer/default/add?seconds=60（+1分）・?minutes=-1（-1分）・/api/timer/all/pause
  r.get('/api/timer', (_req, res) => res.json(timer.snapshot()));
  r.all('/api/timer/:id/:action', (req, res) => {
    try {
      const tid = req.params.id === 'all' ? null : req.params.id;
      res.json({ ok: true, timers: timer.apply(tid, req.params.action, timerSeconds({ ...req.body, ...req.query })) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  // ボス討伐。例: /api/boss/default/damage?value=100・/api/boss/default/heal（HP を戻す）・/api/boss/default/defeat・/api/boss/all/reset
  r.get('/api/boss', (_req, res) => res.json(boss.snapshot()));
  r.all('/api/boss/:id/:action', (req, res) => {
    try {
      const bid = req.params.id === 'all' ? null : req.params.id;
      res.json({ ok: true, boss: boss.apply(bid, req.params.action, req.query.value ?? req.body?.value) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  // SuperStream のプロフィールに設定済みの演出（読むだけ）
  r.get('/api/superstream', (_req, res) => {
    const mc = hub.config?.minecraft ?? {};
    res.json({ ...readProfile(mc.superstreamFile, [...hub.seenGifts.values()]), configuredProfile: mc.superstreamProfile, actions: SUPERSTREAM_ACTIONS });
  });
  r.post('/api/minecraft/check', async (_req, res) => res.json(await minecraft.check()));
  r.post('/api/minecraft/command', async (req, res) => {
    const command = String(req.body?.command ?? '').trim();
    if (!command) return res.status(400).json({ error: 'コマンドを入力してください' });
    try {
      res.json({ ok: true, response: await minecraft.test(command) });
    } catch (err) {
      res.status(502).json({ error: err.message });
    }
  });

  // テスト送信用のギフト一覧（seen: true は実際の配信で届いたギフト）
  r.get('/api/gifts', (_req, res) => {
    const seen = [...hub.seenGifts.values()].map((g) => ({ ...g, seen: true }));
    res.json([...DEMO_GIFTS, ...seen.filter((g) => !DEMO_GIFTS.some((d) => d.name === g.name))]);
  });

  // AI から使うための案内（1人で使うときだけ。配信者ごとの URL では出さない）
  r.get('/api/ai', (_req, res) => {
    if (id !== 'local') return res.json({ tenant: true });
    const mcp = path.join(root, 'mcp', 'server.js');
    res.json({
      claudeCode: `claude mcp add tiktok-widget -- node ${mcp}`,
      desktop: JSON.stringify({ mcpServers: { 'tiktok-widget': { command: 'node', args: [mcp] } } }, null, 2),
      cli: 'npm run tw -- help',
      configPath: store.path,
    });
  });

  // 設定
  r.get('/api/config', (req, res) => res.json(configPayload(req)));
  r.get('/api/config/reference', (_req, res) => res.type('text/markdown').send(cfg.reference()));
  // フォームを作るための定義（関数は JSON にすると落ちる）
  r.get('/api/config/schema', (_req, res) => res.json({ sections: SCHEMA, colorTokens: COLOR_TOKENS }));
  r.put('/api/config', (req, res) => {
    const result = store.replaceText(String(req.body?.yaml ?? ''));
    applyConfigResult(result);
    res.status(result.ok ? 200 : 422).json({ ...result, ...configPayload(req) });
  });
  // 一部だけ変える: { path: "roulettes.main.items", value: [...] } / { path, merge: true, value } / { path, delete: true }
  r.patch('/api/config', (req, res) => {
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
    const result = del ? store.deleteValue(p) : merge ? store.mergeValue(p, value) : store.setValue(p, value);
    applyConfigResult(result);
    res.status(result.ok ? 200 : 422).json({ ...result, ...configPayload(req) });
  });

  // 画像（配信者の media/ と、見本の media/）
  r.get('/api/media', (_req, res) => {
    const out = new Set();
    const walk = (dir, prefix) => {
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        if (ent.isDirectory()) walk(path.join(dir, ent.name), `${prefix}${ent.name}/`);
        else if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(ent.name)) out.add(`media/${prefix}${ent.name}`);
      }
    };
    for (const dir of mediaDirs) if (fs.existsSync(dir)) walk(dir, '');
    res.json([...out]);
  });
  for (const dir of mediaDirs) r.use('/media', express.static(dir));

  // 接続・デモ・テスト
  r.post('/api/connect', async (req, res) => {
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
  r.post('/api/disconnect', async (_req, res) => {
    await tiktok.disconnect();
    demo.stop();
    hub.setStatus({ mode: 'idle', username: null, message: '切断しました' });
    res.json({ ok: true });
  });
  r.post('/api/demo', async (req, res) => {
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
  r.post('/api/simulate', (req, res) => {
    const event = makeEvent(req.body?.kind, req.body ?? {});
    if (!event) return res.status(400).json({ error: '不明なイベント種類です' });
    hub.publish(event);
    res.json({ ok: true });
  });
  r.post('/api/control', (req, res) => {
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
      if (!entitled('rush')) return res.status(403).json({ error: 'RUSH は管理者が使えるようにすると使えます' });
      const out = action === 'stop' ? rush.stop() : rush.start({ reason: 'manual' });
      return res.json({ ok: true, rush: out ?? rush.snapshot() });
    }
    // WIN 数もサーバーで持つ
    if (target === 'wins') {
      try {
        return res.json({ ok: true, wins: wins.apply(data?.id || null, String(action), data?.value) });
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }
    // 延長タイマーもサーバーで持つ（data: { id, seconds } か { id, minutes }）
    if (target === 'timer') {
      try {
        return res.json({ ok: true, timers: timer.apply(data?.id || null, String(action), timerSeconds(data ?? {})) });
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }
    // ボス討伐もサーバーで持つ（damage / defeat / heal / next / set / reset）
    if (target === 'boss') {
      try {
        return res.json({ ok: true, boss: boss.apply(data?.id || null, String(action), data?.value) });
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }
    }
    hub.control(String(target), String(action), data ?? {});
    res.json({ ok: true });
  });
  r.post('/api/reset', (_req, res) => {
    hub.reset();
    res.json({ ok: true });
  });

  return {
    id,
    hub,
    tiktok,
    demo,
    router: r,
    /** 豪華な演出のオン/オフが変わったとき: 仕組みに反映し、開いている画面に読み込み直してもらう */
    entitlementsChanged() {
      if (hub.config) applyEngines(hub.config);
      hub.broadcast({ type: 'entitlements', info: info() });
    },
    async close() {
      unwatch();
      demo.stop();
      await tiktok.disconnect().catch(() => {});
      history.end();
      clearInterval(history.timer);
      timer.close();
      boss.flush();
    },
  };
}
