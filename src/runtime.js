// 配信者1人分の仕組み: TikTok の接続、集計、ルーレット、RUSH、WIN数、延長タイマー、ボス討伐、Minecraft 連携、配信の記録、設定ファイル。
// 1人で使うときは1つだけ、配信者ごとに分けるときは配信者の数だけ作る（src/tenants.js）。

import fs from 'node:fs';
import crypto from 'node:crypto';
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
import { createEventBus } from './events.js';
import { bindRouletteActions, runActions } from './actions.js';
import { MediaAlerts } from './media-alerts.js';
import { GiftSounds } from './gift-sounds.js';
import { Gacha } from './gacha.js';
import { SlotEngine } from './slot.js';
import { checkChanges, MAX_REQUEST_CHARS } from './ai.js';
import { shouldAutoConnect } from './rental.js';
import { GiftCatalog, bundledGifts, mergeGiftCatalog } from './gifts.js';
import { giftNamesDocument } from './gift-display.js';
import { isDevEnv } from './env.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// 延長タイマーの秒数は seconds・minutes・value（秒）のどれでも受ける
const timerSeconds = (o) => {
  const pick = (v) => (v == null || v === '' ? null : Number(v));
  const m = pick(o.minutes);
  return pick(o.seconds) ?? (m != null ? m * 60 : pick(o.value));
};

// 管理者が配信者ごとに「使える / 使えない」を決められるもの（ウィジェットと、WIN数の全画面演出・Minecraft 連携）。
// premium: true の豪華な演出は、最初は使えない。ほかは最初から使える
const FEATURE_ORDER = ['alerts', 'chats', 'wins', 'winsFx', 'timers', 'bosses', 'roulettes', 'jars', 'goals', 'counters', 'rankings', 'cutins', 'imageCutins', 'rush', 'mediaAlerts', 'giftSounds', 'gacha', 'slots', 'ai', 'minecraft'];
const PREMIUM_KEYS = ['cutins', 'imageCutins', 'rush', 'winsFx'];
export const FEATURES = Object.fromEntries(
  FEATURE_ORDER.map((key) => {
    if (key === 'winsFx') return [key, { label: 'WIN数の全画面演出', pages: ['wins-fx.html'], premium: true }];
    // 文章でたのむと設定の案を作る（1回ごとに AI の料金がかかるので、初めは使えない）
    if (key === 'ai') return [key, { label: 'AI にたのむ', pages: [], premium: true }];
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
export const OBS_ALLOWED = [/^\/api\/config$/, /^\/api\/wins$/, /^\/api\/rush$/, /^\/api\/timer$/, /^\/api\/boss$/, /^\/api\/me$/, /^\/api\/sample$/, /^\/api\/gacha$/, /^\/api\/slot$/, /^\/api\/media-alerts$/, /^\/api\/media-alerts\/[a-f0-9]+\/file$/, /^\/api\/gift-sounds$/, /^\/api\/gift-names$/];

/**
 * 配信者1人分を作る。
 * store: 設定ファイル（cfg.createStore）、dataDir: 記録などを置く場所、mediaDirs: 画像の場所（前のほうが優先）
 * entitled(feature): そのウィジェット・演出を使えるか（管理者が決める）、info(): 配信者の情報（/api/me）、setWidgets(list): 使うウィジェットを保存
 */
export function createRuntime({ id = 'local', store, dataDir, mediaDirs, entitled = () => true, info = () => ({ mode: 'local' }), setWidgets = null, setTemplate = null, setGuideDone = null, rememberTiktokId = null, setStayConnected = null, widgetBase, ai = null, notes = null, connectionAllowed = () => true }) {
  const hub = new Hub();
  // connecting は「直前まで live だった再接続」だけ配信中。未接続・配信終了のあとは新しい接続。
  // 再接続が一度失敗して error になっても、配信終了か手動切断までは同じ配信の続きとみなす。
  let reconnectFromLive = false;
  hub.on('status', (status, prev) => {
    const mode = status?.mode;
    const before = prev?.mode;
    if (mode === 'live') reconnectFromLive = true;
    else if (mode === 'idle' || mode === 'ended' || mode === 'demo') reconnectFromLive = false;
    else if (mode === 'connecting' && (before === 'idle' || before === 'ended' || before === 'demo')) reconnectFromLive = false;
    else if (mode === 'connecting' && before === 'live') reconnectFromLive = true;
  });
  const streamLive = () => {
    const mode = hub.status.mode;
    if (mode === 'live') return true;
    return reconnectFromLive && (mode === 'connecting' || mode === 'error');
  };
  const mayConnect = (live) => {
    try {
      return connectionAllowed({ live: Boolean(live) }) !== false;
    } catch (err) {
      console.warn(`[billing] 接続の判定に失敗したので通します: ${err?.message ?? err}`);
      return true;
    }
  };
  const giftCatalog = new GiftCatalog(path.join(dataDir, 'gifts.json'));
  const tiktok = new TikTokSource(hub, giftCatalog, { connectionAllowed: () => mayConnect(streamLive()) });
  const demo = new DemoSource(hub);
  const roulette = new RouletteEngine(hub);
  const minecraft = new Minecraft(hub);
  const history = new History(hub, path.join(dataDir, 'sessions'));
  const rush = new RushEngine(hub);
  // RUSH 中は、ルーレットの rushOdds に従って当たりやすさを変える
  roulette.setIsRushActive(() => rush.snapshot().active === true || rush.state.active === true);
  const wins = new WinsEngine(hub, path.join(dataDir, 'wins.json'));
  const timer = new TimerEngine(hub, path.join(dataDir, 'timers.json'));
  const boss = new BossEngine(hub, path.join(dataDir, 'boss.json'));
  const bus = createEventBus();
  const mediaAlerts = new MediaAlerts({ dir: path.join(dataDir, 'alert-media'), hub, bus });
  const giftSounds = new GiftSounds({ media: mediaAlerts, hub });
  const gacha = new Gacha(hub, { bus });
  const slot = new SlotEngine(hub, { bus });
  boss.setBus(bus);
  const actionDeps = () => ({ timer, wins, rush, media: mediaAlerts, sounds: giftSounds, boss, gacha, bus });
  bindRouletteActions(hub, bus, actionDeps);
  bus.on('slot.result', ({ result, payout, trigger }) => runActions(payout?.actions, actionDeps(), { source: 'slot', slotId: result?.id, trigger }));
  hub.on('event', (e) => {
    mediaAlerts.onEvent(e);
    giftSounds.onEvent(e);
    gacha.onEvent(e);
    slot.onEvent(e);
  });
  let lastIssues = { errors: [], warnings: [] };
  const auto = new Map();
  let currentAutoId = null;
  // 停止中でも、すでに配信へつながっている接続は切らない。止まっているときだけ新しい接続を始めない

  // 設定を仕組みに反映する（使えない豪華な演出は止める）
  const applyEngines = (config) => {
    roulette.setConfig(config);
    // 管理者が使えなくしたものは止める
    minecraft.setConfig(entitled('minecraft') ? config.minecraft : { ...config.minecraft, enabled: false });
    rush.setConfig(entitled('rush') ? config.rush : { ...config.rush, enabled: false });
    wins.setConfig(config.wins);
    timer.setConfig(config.timers);
    boss.setConfig(config.bosses);
    mediaAlerts.setConfig(config.mediaAlerts);
    giftSounds.setConfig(entitled('giftSounds') ? config.giftSounds : { ...config.giftSounds, enabled: false });
    gacha.setConfig(config.gacha);
    slot.setConfig(config.slots);
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

  const origin = (req) => `${req.protocol}://${req.host}`;
  function configPayload(req) {
    const defaults = Object.fromEntries(SECTIONS.map((s) => [s, defaultsFor(s)]));
    if (req.role === 'obs') return { config: cfg.publicConfig(hub.config), defaults: cfg.publicConfig(defaults) };
    const me = info();
    const widgets = hub.config ? cfg.widgetList(hub.config, widgetBase ? widgetBase(origin(req)) : origin(req)) : [];
    const visibleWidgets = me.mode === 'tenant' ? widgets.filter((widget) => widget.section === 'all' || (me.widgets ?? []).includes(widget.section)) : widgets;
    return {
      path: store.path,
      yaml: store.readText(),
      config: hub.config,
      defaults,
      errors: lastIssues.errors,
      warnings: lastIssues.warnings,
      widgets: visibleWidgets,
    };
  }

  // --- API（/api/...） ---
  const r = express.Router();

  // OBS 用の鍵では、ウィジェットが読むものだけ
  r.use((req, res, next) => {
    if (req.role !== 'obs') return next();
    if (req.method === 'GET' && (req.path.startsWith('/media/') || OBS_ALLOWED.some((re) => re.test(req.path)))) return next();
    if (req.method === 'POST' && /^\/api\/media-alerts\/(ack|autoplay)$/.test(req.path)) return next();
    if (req.method === 'POST' && /^\/api\/gift-sounds\/(ack|autoplay)$/.test(req.path)) return next();
    res.status(403).json({ error: 'OBS 用の URL ではこの操作はできません（ダッシュボードの URL を使ってください）' });
  });

  r.get('/api/me', (req, res) => {
    const me = info();
    const tenant = me.mode === 'tenant';
    const features = tenant ? Object.fromEntries(Object.entries(FEATURES).filter(([key]) => entitled(key))) : FEATURES;
    const access = tenant ? Object.fromEntries(Object.entries(me.access ?? {}).filter(([, state]) => state?.on)) : me.access;
    res.json({ ...me, role: req.role ?? 'owner', features, ...(tenant ? { access } : {}) });
  });
  r.get('/api/env', (req, res) => {
    const dev = isDevEnv(req);
    res.json({ dev, environment: dev ? 'dev' : 'prod' });
  });
  r.get('/api/notes', (_req, res) => res.json({ notes: notes?.list?.() ?? [] }));
  r.put('/api/me/widgets', (req, res) => {
    if (!setWidgets) return res.status(400).json({ error: '1人で使うときは選べません（全部使えます）' });
    const list = Array.isArray(req.body?.widgets) ? req.body.widgets.filter((w) => SECTIONS.includes(w) && entitled(w)) : null;
    if (!list) return res.status(400).json({ error: 'widgets を一覧で送ってください' });
    setWidgets(list);
    res.json({ ok: true, ...info() });
  });
  r.put('/api/me/template', (req, res) => {
    if (!setTemplate) return res.status(400).json({ error: '1人で使うときは遊び方を選びません' });
    try { setTemplate(req.body?.template); res.json({ ok: true, ...info() }); } catch (err) { res.status(400).json({ error: err.message }); }
  });
  r.put('/api/me/guide', (req, res) => {
    if (!setGuideDone) return res.status(400).json({ error: '1人で使うときは案内を保存しません' });
    try { setGuideDone(req.body?.done !== false); res.json({ ok: true, ...info() }); } catch (err) { res.status(400).json({ error: err.message }); }
  });

  r.get('/api/status', (_req, res) => {
    res.json({ status: hub.status, state: hub.state, recent: hub.recent, demo: demo.running, minecraft: minecraft.status, session: history.current?.summary() ?? null });
  });

  // 見本は設定中だけ出す。OBS 用の鍵では読むだけにする。
  r.get('/api/sample', (_req, res) => res.json(hub.sampleState()));
  r.post('/api/sample', (req, res) => {
    try {
      const on = req.body?.on;
      if (on !== true && on !== false) return res.status(400).json({ error: 'on は true か false にしてください' });
      res.json(hub.setSample(on));
    } catch (err) {
      res.status(409).json({ error: err.message });
    }
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
      const wid = req.params.id === 'all' ? null : cfg.activeId(hub.config, 'wins', req.params.id === 'active' ? null : req.params.id);
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
      const tid = req.params.id === 'all' ? null : cfg.activeId(hub.config, 'timers', req.params.id === 'active' ? null : req.params.id);
      res.json({ ok: true, timers: timer.apply(tid, req.params.action, timerSeconds({ ...req.body, ...req.query })) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  // ボス討伐。例: /api/boss/default/damage?value=100・/api/boss/default/heal（HP を戻す）・/api/boss/default/defeat・/api/boss/all/reset
  r.get('/api/boss', (_req, res) => res.json(boss.snapshot()));
  r.all('/api/boss/:id/:action', (req, res) => {
    try {
      const bid = req.params.id === 'all' ? null : cfg.activeId(hub.config, 'bosses', req.params.id === 'active' ? null : req.params.id);
      res.json({ ok: true, boss: boss.apply(bid, req.params.action, req.query.value ?? req.body?.value) });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  // マイクラ側の演出プロフィールに設定済みの演出（読むだけ）
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

  // 画面に出すギフト名の対応表（GiftID → [英語名, 日本語名]）。ウィジェットが読む
  r.get('/api/gift-names', (_req, res) => {
    res.set('Cache-Control', 'no-cache');
    res.json(giftNamesDocument());
  });

  // テスト送信用のギフト一覧（seen: true は実際の配信で届いたギフト）
  // 名前だけの控えはコインが無いので、分かっている数（diamond_count など）を id で埋める
  function readGifts() {
    const seen = [...hub.seenGifts.values()].map((g) => ({ ...g, seen: true }));
    const saved = giftCatalog.list();
    const known = mergeGiftCatalog([DEMO_GIFTS.map((g) => giftCatalog.enrich(g)), saved, seen]);
    const names = new Set(known.map((g) => String(g.name ?? '').toLocaleLowerCase()));
    const extra = bundledGifts().filter((g) => g.name && !names.has(g.name.toLocaleLowerCase()));
    return mergeGiftCatalog([known, extra]);
  }
  r.get('/api/gifts', (_req, res) => {
    res.json(readGifts());
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

  // --- AI にたのむ ---
  // たのむ → 案を見る → 反映する → 気に入らなければ元に戻す。1日の回数は管理者が決める
  const aiUse = { day: '', count: 0, busy: false };
  // 反映の前と後の設定ファイルの文字。反映のあとに別の変更が入っていたら、元に戻さない（その変更まで消してしまうので）
  let aiUndo = null;
  const canUndo = () => aiUndo != null && store.readText() === aiUndo.after;
  const aiLeft = () => {
    const day = new Date().toDateString();
    if (aiUse.day !== day) Object.assign(aiUse, { day, count: 0 });
    return Math.max(0, (ai?.dailyLimit ?? 0) - aiUse.count);
  };
  const aiState = () => {
    if (!ai?.ready) return { available: false, reason: id === 'local' ? '環境変数 TW_AI_KEY に Claude API のキーを入れると使えます' : '管理者が AI のキーを入れると使えます' };
    if (!entitled('ai')) return { available: false, reason: '管理者が使えるようにすると使えます' };
    return { available: true, left: aiLeft(), limit: ai.dailyLimit, canUndo: canUndo(), maxChars: MAX_REQUEST_CHARS };
  };
  const knownGifts = () => {
    return [...DEMO_GIFTS.map((g) => giftCatalog.enrich(g)), ...giftCatalog.list(), ...hub.seenGifts.values()]
      .slice(0, 60).map((g) => ({ name: g.name, nameJa: g.nameJa ?? null, id: g.id, diamonds: g.diamonds }));
  };
  r.get('/api/ai/state', (_req, res) => res.json(aiState()));
  r.post('/api/ai/ask', async (req, res) => {
    const st = aiState();
    if (!st.available) return res.status(403).json({ error: st.reason });
    const text = String(req.body?.text ?? '').trim();
    if (!text) return res.status(400).json({ error: 'たのみたいことを書いてください' });
    if (text.length > MAX_REQUEST_CHARS) return res.status(400).json({ error: `たのみは ${MAX_REQUEST_CHARS} 文字までにしてください` });
    if (st.left <= 0) return res.status(429).json({ error: `今日はもう ${st.limit} 回たのみました。明日また使えます` });
    if (aiUse.busy) return res.status(429).json({ error: '前のたのみを考えているところです。少し待ってください' });
    aiUse.busy = true;
    aiUse.count++;
    try {
      const focus = { section: SECTIONS.includes(req.body?.focus?.section) ? req.body.focus.section : null, id: typeof req.body?.focus?.id === 'string' ? req.body.focus.id.slice(0, 64) : null };
      // そのまま当てたらどうなるかを確かめながら、案を作ってもらう（ファイルには書かない）
      const availableWidgets = Object.entries(FEATURES).filter(([key]) => entitled(key)).map(([, feature]) => feature.label);
      const allowedSections = SECTIONS.filter((section) => section === 'theme' || entitled(section));
      const out = await ai.ask({ text, config: hub.config, focus, gifts: knownGifts(), availableWidgets, allowedSections, check: (changes) => cfg.applyChanges(store.readText(), changes) });
      if (!out.changes.length && out.ignored) out.reply = 'それはこのツールではできません。';
      res.json({ ok: true, reply: out.reply, changes: out.changes, errors: out.errors, warnings: out.warnings, state: aiState() });
    } catch (err) {
      // AI を呼べなかったときは、回数に数えない
      aiUse.count = Math.max(0, aiUse.count - 1);
      res.status(502).json({ error: err.message, state: aiState() });
    } finally {
      aiUse.busy = false;
    }
  });
  r.post('/api/ai/apply', (req, res) => {
    if (!aiState().available) return res.status(403).json({ error: aiState().reason });
    const { changes, errors, ignored } = checkChanges(req.body?.changes, { allowedSections: SECTIONS.filter((section) => section === 'theme' || entitled(section)) });
    if (!changes.length && ignored) return res.status(400).json({ error: 'それはこのツールではできません。' });
    if (errors.length || !changes.length) return res.status(400).json({ error: errors[0] ?? '変えるところがありません' });
    const before = store.readText();
    const next = cfg.applyChanges(before, changes);
    if (!next.ok) return res.status(422).json({ ok: false, error: `反映できませんでした: ${next.errors.join(' / ')}`, errors: next.errors });
    const result = store.replaceText(next.text);
    if (!result.ok) return res.status(422).json({ ok: false, error: `反映できませんでした: ${result.errors.join(' / ')}`, errors: result.errors });
    aiUndo = { before, after: store.readText() };
    applyConfigResult(result);
    res.json({ ok: true, warnings: result.warnings, state: aiState(), ...configPayload(req) });
  });
  r.post('/api/ai/undo', (req, res) => {
    if (aiUndo == null) return res.status(400).json({ error: '元に戻せるものがありません' });
    if (!canUndo()) {
      aiUndo = null;
      return res.status(409).json({ error: 'AI が変えたあとに別の変更があるので、まとめて元には戻せません（変えたところを手で直してください）' });
    }
    const result = store.replaceText(aiUndo.before);
    if (!result.ok) return res.status(422).json({ ok: false, error: `元に戻せませんでした: ${result.errors.join(' / ')}` });
    aiUndo = null;
    applyConfigResult(result);
    res.json({ ok: true, state: aiState(), ...configPayload(req) });
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
  // 画像を足す（ダッシュボードで画像を押して選んだもの）。配信者の media/uploads/ に置き、media/… の名前を返す
  const UPLOAD_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/avif': 'avif' };
  r.post('/api/media', express.raw({ type: Object.keys(UPLOAD_TYPES), limit: '8mb' }), (req, res) => {
    const ext = UPLOAD_TYPES[String(req.get('content-type') ?? '').split(';')[0].trim()];
    if (!ext || !Buffer.isBuffer(req.body) || req.body.length === 0) return res.status(400).json({ error: '画像（PNG・JPEG・GIF・WebP・AVIF）を選んでください' });
    const dir = path.join(mediaDirs[0], 'uploads');
    fs.mkdirSync(dir, { recursive: true });
    const name = `${Date.now().toString(36)}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
    fs.writeFileSync(path.join(dir, name), req.body);
    res.json({ ok: true, path: `media/uploads/${name}` });
  });

  // 接続・デモ・テスト
  r.post('/api/connect', async (req, res) => {
    const username = String(req.body?.username ?? '').trim();
    if (!username) return res.status(400).json({ error: 'ユーザー名を入力してください' });
    if (!mayConnect(streamLive())) {
      return res.status(403).json({ error: 'お支払いの確認が取れていません。LuLにご連絡ください' });
    }
    demo.stop();
    const handle = username.replace(/^@/, '').trim();
    // 成功しても、配信前で失敗しても、切るまでは再接続を続ける
    const keep = () => {
      const id = tiktok.username || handle;
      if (id) setStayConnected?.(id);
    };
    try {
      await tiktok.connect(username, { signApiKey: req.body?.signApiKey });
      rememberTiktokId?.(tiktok.username);
      keep();
      res.json({ ok: true, status: hub.status });
    } catch (err) {
      keep();
      res.status(502).json({ error: err.message, status: hub.status });
    }
  });
  r.post('/api/disconnect', async (_req, res) => {
    if (currentAutoId && auto.has(currentAutoId)) auto.get(currentAutoId).manuallyStopped = true;
    try {
      await tiktok.disconnect();
    } finally {
      setStayConnected?.(null);
    }
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
    const out = simulateEvent(req.body, req);
    res.status(out.status).json(out.body);
  });
  // 開発用。ルーレットの動作・ボス・メディア・ガチャを、配信イベントを作らずに試す
  r.post('/api/dev/trigger', (req, res) => {
    if (!isDevEnv(req)) return res.status(403).json({ error: 'テスト送信は開発環境でだけ使えます' });
    const body = req.body ?? {};
    try {
      if (body.target === 'roulette-action') {
        if (!Array.isArray(body.actions) || !body.actions.length) return res.status(400).json({ error: 'actions を一覧で送ってください' });
        const results = runActions(body.actions, actionDeps(), { source: 'dev' });
        const bad = results.find((item) => !item.ok);
        if (bad) return res.status(400).json({ error: bad.error, results });
        return res.json({ ok: true, results });
      }
      if (body.target === 'boss') {
        const id = body.id || null;
        if (body.action === 'damage') return res.json({ ok: true, boss: boss.apply(id, 'damage', body.amount) });
        if (body.action === 'heal') return res.json({ ok: true, boss: boss.healBy(id, body.amount) });
        return res.status(400).json({ error: 'action は damage か heal です' });
      }
      if (body.target === 'media') return res.json({ ok: true, media: mediaAlerts.play(body.mediaId, { source: 'dev' }) });
      if (body.target === 'gift-sound') {
        const count = Number(body.count) || 1;
        if (!Number.isInteger(count) || count < 1 || count > 4) return res.status(400).json({ error: 'count は 1 から 4 です' });
        const sounds = [];
        for (let i = 0; i < count; i++) sounds.push(giftSounds.play(body.mediaId, { volume: body.volume, source: 'dev' }));
        return res.json({ ok: true, sounds, giftSounds: giftSounds.snapshot() });
      }
      if (body.target === 'gacha') {
        const started = gacha.start({ kind: 'dev', source: 'dev' });
        if (!started) return res.status(400).json({ error: 'ガチャはオフです' });
        return res.json({ ok: true, gacha: started });
      }
      if (body.target === 'slot') {
        const started = slot.start({ kind: 'dev', source: 'dev', user: { name: 'テストさん' }, gift: null });
        if (!started) return res.status(400).json({ error: 'スロットはオフです' });
        return res.json({ ok: true, slot: started });
      }
      return res.status(400).json({ error: '不明な target です' });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });
  r.get('/api/gacha', (_req, res) => res.json(gacha.snapshot()));
  r.get('/api/slot', (_req, res) => res.json(slot.snapshot()));
  r.get('/api/media-alerts', (_req, res) => res.json(mediaAlerts.snapshot()));
  r.post('/api/media-alerts', express.raw({ type: () => true, limit: '32mb' }), (req, res) => {
    try {
      const mime = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
      let name = 'file';
      if (typeof req.query?.name === 'string' && req.query.name) name = req.query.name;
      else if (req.headers['x-filename']) name = String(req.headers['x-filename']);
      const item = mediaAlerts.addBuffer({ mime, name, buffer: req.body });
      res.json({ ok: true, item });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });
  r.post('/api/media-alerts/ack', (req, res) => {
    res.json({ ok: mediaAlerts.ack(req.body?.token) });
  });
  r.post('/api/media-alerts/autoplay', (req, res) => {
    res.json({ ok: true, autoplay: mediaAlerts.reportAutoplay({ muted: req.body?.muted === true }) });
  });
  r.delete('/api/media-alerts/:id', (req, res) => {
    try {
      mediaAlerts.remove(req.params.id);
      res.json({ ok: true });
    } catch (err) {
      res.status(404).json({ error: err.message });
    }
  });
  r.get('/api/gift-sounds', (_req, res) => res.json(giftSounds.snapshot()));
  r.post('/api/gift-sounds/ack', (req, res) => {
    res.json({ ok: giftSounds.ack(req.body?.token) });
  });
  r.post('/api/gift-sounds/autoplay', (req, res) => {
    res.json({ ok: true, autoplay: giftSounds.reportAutoplay({ muted: req.body?.muted === true }) });
  });
  r.get('/api/media-alerts/:id/file', (req, res) => {
    const info = mediaAlerts.fileInfo(req.params.id);
    if (!info) return res.status(404).json({ error: 'メディアが見つかりません' });
    res.type(info.mime);
    res.sendFile(info.path, (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'メディアが見つかりません' });
    });
  });
  r.post('/api/control', (req, res) => {
    const { target, action, data } = req.body ?? {};
    const out = performControl(target, action, data);
    res.status(out.status).json(out.body);
  });
  r.post('/api/reset', (_req, res) => {
    hub.reset();
    res.json({ ok: true });
  });

  // テスト送信。開発環境以外は拒否する（画面の API と AI 用 API で同じ）
  function simulateEvent(body, req) {
    if (!isDevEnv(req)) return { status: 403, body: { error: 'テスト送信は開発環境でだけ使えます' } };
    const event = makeEvent(body?.kind, body ?? {});
    if (!event) return { status: 400, body: { error: '不明なイベント種類です' } };
    hub.publish({ ...event, test: true });
    // 配信中のテストは画面に出るだけ（数は変わらない）
    return { status: 200, body: { ok: true, visualOnly: hub.status.mode === 'live' } };
  }

  // ルーレット・タイマー・WIN数・ボス・RUSH。画面の /api/control と AI 用 API で同じ
  function performControl(target, action, data = {}) {
    if (!target || !action) return { status: 400, body: { error: 'target と action が必要です' } };
    // ルーレットは何が当たるかをサーバーで決める
    if (target === 'roulette' && action === 'spin') {
      const spin = roulette.spin(data?.id ?? null);
      return spin ? { status: 200, body: { ok: true, spin } } : { status: 404, body: { error: 'ルーレットの設定がありません' } };
    }
    if (target === 'roulette' && action === 'reset') roulette.clear();
    // RUSH はサーバーで状態を持つ
    if (target === 'rush') {
      if (action === 'status') return { status: 200, body: { ok: true, rush: rush.snapshot() } };
      if (!entitled('rush')) return { status: 403, body: { error: 'RUSH は管理者が使えるようにすると使えます' } };
      const out = action === 'stop' ? rush.stop() : rush.start({ reason: 'manual' });
      return { status: 200, body: { ok: true, rush: out ?? rush.snapshot() } };
    }
    // WIN 数もサーバーで持つ
    if (target === 'wins') {
      try {
        const wid = data?.id === 'active' ? cfg.activeId(hub.config, 'wins') : data?.id || null;
        return { status: 200, body: { ok: true, wins: wins.apply(wid, String(action), data?.value) } };
      } catch (err) {
        return { status: 400, body: { error: err.message } };
      }
    }
    // 延長タイマーもサーバーで持つ（data: { id, seconds } か { id, minutes }）
    if (target === 'timer') {
      try {
        const wid = data?.id === 'active' ? cfg.activeId(hub.config, 'timers') : data?.id || null;
        return { status: 200, body: { ok: true, timers: timer.apply(wid, String(action), timerSeconds(data ?? {})) } };
      } catch (err) {
        return { status: 400, body: { error: err.message } };
      }
    }
    // ボス討伐もサーバーで持つ（damage / defeat / heal / next / set / reset）
    if (target === 'boss') {
      try {
        const wid = data?.id === 'active' ? cfg.activeId(hub.config, 'bosses') : data?.id || null;
        return { status: 200, body: { ok: true, boss: boss.apply(wid, String(action), data?.value) } };
      } catch (err) {
        return { status: 400, body: { error: err.message } };
      }
    }
    hub.control(String(target), String(action), data ?? {});
    return { status: 200, body: { ok: true } };
  }

  const configVersion = () => crypto.createHash('sha256').update(store.readText()).digest('hex');
  // 配信中（live）と、つなぎ直し中（connecting）は AI からの変更を止める対象
  const aiLive = () => {
    const mode = hub.status?.mode;
    return mode === 'live' || mode === 'connecting';
  };
  function previewConfig(op, configPath, value) {
    const beforeText = store.readText();
    const change = op === 'delete' ? { op: 'delete', path: configPath } : { op, path: configPath, value };
    const next = cfg.applyChanges(beforeText, [change]);
    return {
      ok: Boolean(next.ok),
      errors: next.errors ?? [],
      warnings: next.warnings ?? [],
      text: next.text,
      config: next.config ?? null,
      configVersion: crypto.createHash('sha256').update(beforeText).digest('hex'),
    };
  }

  return {
    id,
    hub,
    tiktok,
    demo,
    autoConnect({ handle, slot, now = Date.now() }) {
      const state = auto.get(slot.id) ?? { attempts: 0, lastAttempt: 0, manuallyStopped: false };
      auto.set(slot.id, state);
      if (!mayConnect(streamLive())) return false;
      if (!shouldAutoConnect({ now, slot, status: hub.status, ...state })) return false;
      state.attempts += 1;
      state.lastAttempt = now;
      currentAutoId = slot.id;
      console.log(`[rental] ${id}: TikTok @${handle} への自動接続を試します（${state.attempts}/40）`);
      tiktok.connect(handle).catch((err) => console.warn(`[rental] ${id}: 自動接続に失敗: ${err.message}`));
      return true;
    },
    router: r,
    getConfig() { return hub.config; },
    setConfig(p, value) {
      const result = store.setValue(p, value);
      applyConfigResult(result);
      return result;
    },
    mergeConfig(p, value) {
      const result = store.mergeValue(p, value);
      applyConfigResult(result);
      return result;
    },
    deleteConfig(p) {
      const result = store.deleteValue(p);
      applyConfigResult(result);
      return result;
    },
    readText() {
      return store.readText();
    },
    readIssues() {
      return { errors: [...lastIssues.errors], warnings: [...lastIssues.warnings] };
    },
    configVersion,
    previewConfig,
    replaceConfig(text) {
      const result = store.replaceText(text);
      applyConfigResult(result);
      return result;
    },
    readStatus() {
      return { status: hub.status, state: hub.state, recent: hub.recent, demo: demo.running, minecraft: minecraft.status, session: history.current?.summary() ?? null };
    },
    readHistory(sessionId) {
      if (sessionId) return history.get(sessionId);
      return history.list();
    },
    readGifts,
    readWins() { return wins.snapshot(); },
    readTimer() { return timer.snapshot(); },
    readBoss() { return boss.snapshot(); },
    readRush() { return rush.snapshot(); },
    readWidgets(base) {
      const list = hub.config ? cfg.widgetList(hub.config, base) : [];
      const me = info();
      return me.mode === 'tenant' ? list.filter((widget) => widget.section === 'all' || (me.widgets ?? []).includes(widget.section)) : list;
    },
    performControl,
    simulateEvent,
    aiLive,
    /** 豪華な演出のオン/オフが変わったとき: 仕組みに反映し、開いている画面に読み込み直してもらう */
    entitlementsChanged() {
      if (hub.config) applyEngines(hub.config);
      hub.broadcast({ type: 'entitlements', info: info() });
    },
    async close() {
      unwatch();
      roulette.clear();
      demo.stop();
      await tiktok.disconnect().catch(() => {});
      history.end();
      clearInterval(history.timer);
      timer.close();
      gacha.close();
      slot.close();
      giftSounds.close();
      boss.flush();
    },
  };
}
