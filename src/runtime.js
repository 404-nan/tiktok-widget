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
import { analyzeEffects } from './effect-analysis.js';
import { readProfile, SUPERSTREAM_ACTIONS } from './superstream.js';
import { RushEngine } from './rush.js';
import { StepupEngine } from './stepup.js';
import { SwarmEngine } from './swarm.js';
import { ComboEngine } from './combo.js';
import { drawCutin } from './cutin-draw.js';
import { WinsEngine } from './wins.js';
import { TimerEngine } from './timer.js';
import { BossEngine } from './boss.js';
import { createEventBus } from './events.js';
import { bindRouletteActions, runActions } from './actions.js';
import { MediaAlerts } from './media-alerts.js';
import { GiftSounds } from './gift-sounds.js';
import { Gacha } from './gacha.js';
import { GachaViewers } from './gacha-viewers.js';
import { SlotEngine } from './slot.js';
import { RelayStopEngine } from './relay-stop.js';
import { Peka } from './peka.js';
import { ThroneEngine } from './throne.js';
import { OotoriEngine } from './ootori.js';
import { DarebaEngine } from './dareba.js';
import { VoteEngine } from './vote.js';
import { CheerEngine } from './cheer.js';
import { PushButtonEngine } from './push-button.js';
import { checkChanges, MAX_REQUEST_CHARS } from './ai.js';
import { shouldAutoConnect } from './rental.js';
import { GiftCatalog, bundledGifts, mergeGiftCatalog } from './gifts.js';
import { EulerUsage } from './euler-usage.js';
import { giftNamesDocument } from './gift-display.js';
import { isDevEnv } from './env.js';
import { Ingest } from './ingest.js';
import { getTemplate, previewTemplate, templateList } from './templates.js';
import { InfoFeed } from './info-feed.js';
import { VisitorLog } from './visitors.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sectionOfChange = (change) => String(change.path).split('.')[0];
const LIVE_RECONNECT_GRACE_MS = 15 * 60 * 1000;

// 延長タイマーの秒数は seconds・minutes・value（秒）のどれでも受ける
const timerSeconds = (o) => {
  const pick = (v) => (v == null || v === '' ? null : Number(v));
  const m = pick(o.minutes);
  return pick(o.seconds) ?? (m != null ? m * 60 : pick(o.value));
};

// 管理者が配信者ごとに「使える / 使えない」を決められるもの（ウィジェットと、WIN数の全画面演出・Minecraft 連携）。
// premium: true の豪華な演出は、最初は使えない。ほかは最初から使える
const FEATURE_ORDER = ['alerts', 'chats', 'wins', 'winsFx', 'timers', 'bosses', 'roulettes', 'votes', 'cheers', 'pushButtons', 'jars', 'goals', 'counters', 'rankings', 'throne', 'ootori', 'dareba', 'tickers', 'supporters', 'visitors', 'cutins', 'imageCutins', 'rush', 'stepup', 'swarm', 'mediaAlerts', 'giftSounds', 'gacha', 'omikuji', 'slots', 'relayStop', 'peka', 'ai', 'minecraft', 'combo'];
const PREMIUM_KEYS = ['cutins', 'imageCutins', 'rush', 'stepup', 'swarm', 'winsFx', 'combo'];
export const FEATURES = Object.fromEntries(
  FEATURE_ORDER.map((key) => {
    if (key === 'winsFx') return [key, { label: 'WIN数の全画面演出', pages: ['wins-fx.html'], premium: true }];
    // 文章でたのむと設定の案を作る（1回ごとに AI の料金がかかるので、初めは使えない）
    if (key === 'ai') return [key, { label: 'AI にたのむ', pages: [], premium: true }];
    if (key === 'relayStop') return [key, { label: 'リレー停止', pages: ['slot.html'], premium: false }];
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
export const OBS_ALLOWED = [/^\/api\/config$/, /^\/api\/wins$/, /^\/api\/rush$/, /^\/api\/stepup$/, /^\/api\/swarm$/, /^\/api\/combo$/, /^\/api\/timer$/, /^\/api\/boss$/, /^\/api\/vote$/, /^\/api\/cheer$/, /^\/api\/push-button$/, /^\/api\/me$/, /^\/api\/sample$/, /^\/api\/info-feed$/, /^\/api\/visitors$/, /^\/api\/gacha$/, /^\/api\/omikuji$/, /^\/api\/slot$/, /^\/api\/relay-stop$/, /^\/api\/peka$/, /^\/api\/throne$/, /^\/api\/ootori$/, /^\/api\/dareba$/, /^\/api\/minecraft\/goal-alert$/, /^\/api\/media-alerts$/, /^\/api\/media-alerts\/[a-f0-9]+\/file$/, /^\/api\/gift-sounds$/, /^\/api\/gift-names$/];

/**
 * 配信者1人分を作る。
 * store: 設定ファイル（cfg.createStore）、dataDir: 記録などを置く場所、mediaDirs: 画像の場所（前のほうが優先）
 * entitled(feature): そのウィジェット・演出を使えるか（管理者が決める）、info(): 配信者の情報（/api/me）、setWidgets(list): 使うウィジェットを保存
 */
export function createRuntime({ id = 'local', store, dataDir, mediaDirs, entitled = () => true, info = () => ({ mode: 'local' }), setWidgets = null, setTemplate = null, setGuideDone = null, setDisplayName = null, rememberTiktokId = null, setStayConnected = null, widgetBase, ai = null, notes = null, connectionAllowed = () => true, onIngestKeyChange = () => {}, now = Date.now }) {
  const hub = new Hub();
  const infoFeed = new InfoFeed(hub);
  const visitors = new VisitorLog(hub, { dir: dataDir });
  // connecting は「直前まで live だった再接続」だけ配信中。未接続・配信終了のあとは新しい接続。
  // 再接続が一度失敗して error になっても、配信終了か手動切断までは同じ配信の続きとみなす。
  let reconnectFromLive = false;
  let lastLiveAt = null;
  hub.on('status', (status, prev) => {
    const mode = status?.mode;
    const before = prev?.mode;
    if (mode === 'live') {
      reconnectFromLive = true;
      lastLiveAt = now();
    }
    else if (mode === 'idle' || mode === 'ended' || mode === 'demo') reconnectFromLive = false;
    if (mode === 'idle' || mode === 'ended' || mode === 'demo') lastLiveAt = null;
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
  const ingest = new Ingest(hub, { dataDir, connectionAllowed: () => mayConnect(streamLive()), onKeyChange: onIngestKeyChange });
  const giftCatalog = new GiftCatalog(path.join(dataDir, 'gifts.json'));
  const eulerUsage = new EulerUsage(path.join(dataDir, 'euler-usage.json'));
  // 配信者ごと(hosted)は、配信していないあいだ OBS のウィジェットが開いているときだけ接続を試す。
  // 使っていない配信者のぶんまで1分ごとに試すと、接続の費用(署名の回数)がかさむため。1人用(local)は今までどおり
  const waitAllowed = () => id === 'local' || streamLive() || hub.hasClient('obs');
  const tiktok = new TikTokSource(hub, giftCatalog, { connectionAllowed: () => mayConnect(streamLive()), waitAllowed, usage: eulerUsage });
  hub.on('client', (ws) => { if (ws.role === 'obs') tiktok.wake(); });
  const demo = new DemoSource(hub);
  const roulette = new RouletteEngine(hub);
  const minecraft = new Minecraft(hub, { namedSabotageStatePath: path.join(dataDir, 'named-sabotage.json') });
  const history = new History(hub, path.join(dataDir, 'sessions'), { id });
  const rush = new RushEngine(hub);
  const stepup = new StepupEngine(hub);
  const swarm = new SwarmEngine(hub);
  const combo = new ComboEngine(hub);
  // 画面ごとに別のくじを引かないよう、配信直前に1回だけ作る。
  hub.on('prepare', (event) => {
    if (!['gift', 'follow', 'share'].includes(event.kind)) return;
    event.cutinDraw = drawCutin({ rush: rush.state.active === true });
  });
  // RUSH 中は、ルーレットの rushOdds に従って当たりやすさを変える
  roulette.setIsRushActive(() => rush.snapshot().active === true || rush.state.active === true);
  const wins = new WinsEngine(hub, path.join(dataDir, 'wins.json'));
  minecraft.setGoalReachedHandler(() => {
    minecraft.enqueue(['bossbar set tw:goal_alert visible false'], {}, 'goal-alert');
    const setting = hub.config?.minecraft?.goalAlert ?? {};
    const id = setting.winsId || cfg.activeId(hub.config, 'wins');
    wins.apply(id, 'win');
  });
  const timer = new TimerEngine(hub, path.join(dataDir, 'timers.json'));
  const boss = new BossEngine(hub, path.join(dataDir, 'boss.json'));
  const bus = createEventBus();
  bus.on('*', (event) => {
    if (!history.current || event.type === 'gift') return;
    history.effectLog.effect(event.type, { value: event.value, result: event.result, amount: event.amount }, { test: Boolean(event.test), ts: event.ts });
  });
  const mediaAlerts = new MediaAlerts({ dir: path.join(dataDir, 'alert-media'), hub, bus });
  const giftSounds = new GiftSounds({ media: mediaAlerts, hub });
  const gacha = new Gacha(hub, { bus });
  const omikuji = new Gacha(hub, { bus, name: 'omikuji' });
  const gachaViewers = new GachaViewers(path.join(dataDir, 'gacha-viewers.json'), { gacha, bus });
  const slot = new SlotEngine(hub, { bus });
  const relayStop = new RelayStopEngine(hub, { slot });
  const peka = new Peka(hub);
  const throne = new ThroneEngine({ broadcast: (message) => hub.broadcast(message) });
  const ootori = new OotoriEngine({ broadcast: (message) => hub.broadcast(message) });
  const dareba = new DarebaEngine({ hub });
  boss.setBus(bus);
  const actionDeps = () => ({ roulette, timer, wins, rush, media: mediaAlerts, sounds: giftSounds, boss, gacha, omikuji, bus });
  const vote = new VoteEngine(hub, {
    onResult: ({ id: voteId, actions, result }) => runActions(actions, actionDeps(), { source: 'vote', voteId, result }),
  });
  const cheer = new CheerEngine(hub, {
    onFull: ({ id: cheerId, actions, round, cheer: state }) => runActions(actions, actionDeps(), { source: 'cheer', cheerId, round, cheer: state }),
  });
  const push = new PushButtonEngine(hub, {
    onResult: ({ id: pushId, actions, result }) => runActions(actions, actionDeps(), { source: 'push', pushId, result }),
  });
  bus.on('gacha.reveal', ({ tier, trigger }) => runActions(tier?.actions, actionDeps(), { source: 'gacha', tierId: tier?.id, trigger }));
  bindRouletteActions(hub, bus, actionDeps);
  bus.on('slot.result', ({ result, payout, trigger }) => runActions(payout?.actions, actionDeps(), { source: 'slot', slotId: result?.id, trigger }));
  hub.on('event', (e) => {
    dareba.record(e);
    throne.onEvent(e);
    mediaAlerts.onEvent(e);
    giftSounds.onEvent(e);
    gachaViewers.onEvent(e);
    gacha.onEvent(e);
    omikuji.onEvent(e);
    const relay = relayStop.onEvent(e);
    if (!relay) slot.onEvent(e);
    peka.onEvent(e);
    ootori.onEvent(e);
  });
  hub.on('testEvent', (e) => peka.onEvent(e));
  hub.on('testEvent', (e) => throne.testEvent(e));
  hub.on('testEvent', (e) => ootori.testEvent(e));
  hub.on('testEvent', (e) => dareba.testEvent(e));
  hub.on('testEvent', (e) => relayStop.onEvent(e));
  hub.on('testEvent', (e) => minecraft.testNamedSabotage(e));
  hub.on('reset', () => peka.reset());
  hub.on('reset', () => throne.reset());
  hub.on('reset', () => ootori.reset());
  let darebaLiveSession = false;
  hub.on('status', (status, prev) => {
    if (status?.mode === 'ended') throne.finish();
    if (status?.mode === 'live' && throne.snapshot().state === 'finished') throne.reset();
    if (status?.mode === 'live' && !darebaLiveSession && prev?.mode !== 'live') {
      darebaLiveSession = true;
      dareba.startLive(status.startedAt ?? Date.now());
    }
    if (status?.mode === 'idle' || status?.mode === 'ended' || status?.mode === 'demo') {
      darebaLiveSession = false;
      dareba.resetForLive(null);
    }
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
    stepup.setConfig(entitled('stepup') ? config.stepup : { ...config.stepup, enabled: false });
    swarm.setConfig(entitled('swarm') ? config.swarm : { ...config.swarm, enabled: false });
    combo.setConfig(entitled('combo') ? config.combo : { ...config.combo, enabled: false });
    wins.setConfig(config.wins);
    timer.setConfig(config.timers);
    boss.setConfig(config.bosses);
    mediaAlerts.setConfig(config.mediaAlerts);
    giftSounds.setConfig(entitled('giftSounds') ? config.giftSounds : { ...config.giftSounds, enabled: false });
    gacha.setConfig(config.gacha);
    omikuji.setConfig(config.omikuji);
    gachaViewers.setConfig(config.gacha);
    slot.setConfig(config.slots);
    relayStop.setConfig(config.relayStop ?? config.slots?.relayStop);
    peka.setConfig(config.peka);
    throne.setConfig(config.throne);
    ootori.setConfig(config.ootori);
    dareba.setConfig(config.dareba);
    vote.setEnabled(entitled('votes'));
    vote.setConfig(entitled('votes') ? config.votes : {});
    cheer.setEnabled(entitled('cheers'));
    cheer.setConfig(entitled('cheers') ? config.cheers : {});
    push.setEnabled(entitled('pushButtons'));
    push.setConfig(entitled('pushButtons') ? config.pushButtons : {});
  };
  hub.on('config', applyEngines);
  hub.on('status', (status, previous) => gachaViewers.onStatus(status, previous));
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

  r.get('/api/ingest', (req, res) => res.json(ingest.state()));
  r.post('/api/ingest/key', (req, res) => {
    const key = ingest.create();
    res.json(key);
  });
  r.delete('/api/ingest/key', (_req, res) => {
    ingest.remove();
    res.json({ ok: true });
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
  r.put('/api/me/name', (req, res) => {
    if (!setDisplayName) return res.status(400).json({ error: 'この画面では表示名を変更できません' });
    try { setDisplayName(req.body?.name); res.json({ ok: true, ...info() }); } catch (err) { res.status(400).json({ error: err.message }); }
  });

  r.get('/api/status', (_req, res) => {
    res.json({ status: hub.status, state: hub.state, recent: hub.recent, demo: demo.running, minecraft: minecraft.status, session: history.current?.summary() ?? null });
  });
  r.get('/api/euler-usage', (_req, res) => res.json(eulerUsage.snapshot()));

  // 見本は設定中だけ出す。OBS 用の鍵では読むだけにする。
  r.get('/api/sample', (_req, res) => res.json(hub.sampleState()));
  r.get('/api/info-feed', (_req, res) => res.json(infoFeed.snapshot()));
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
  r.get('/api/minecraft/goal-alert', (_req, res) => res.json(minecraft.goalAlertSnapshot()));
  r.get('/api/minecraft/named-sabotage', (_req, res) => res.json(minecraft.namedSabotage.snapshot()));
  r.get('/api/rush', (_req, res) => res.json(rush.snapshot()));
  r.get('/api/stepup', (_req, res) => res.json(stepup.snapshot()));
  r.get('/api/swarm', (_req, res) => res.json(swarm.snapshot()));
  r.get('/api/combo', (_req, res) => res.json(combo.snapshot()));
  r.all('/api/combo/:action', (req, res) => {
    const out = performControl('combo', req.params.action, { ...req.query, ...req.body });
    res.status(out.status).json(out.body);
  });
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
  // コメント投票。Stream Deck から押せるように GET と POST の両方を受ける。
  r.get('/api/vote', (_req, res) => res.json(vote.snapshot()));
  r.all('/api/vote/:id/:action', (req, res) => {
    const requested = req.params.id;
    const action = req.params.action;
    const allowedActions = ['status', 'start', 'close', 'result', 'reset'];
    if (!allowedActions.includes(action)) return res.status(400).json({ error: '投票の動作は start / close / result / reset / status のどれかです' });
    const ids = requested === 'all'
      ? vote.ids()
      : [requested === 'active' ? cfg.activeId(hub.config, 'votes') : requested];
    try {
      if (action === 'status') return res.json({ ok: true, votes: vote.snapshot() });
      if (!ids.length || ids.some((id) => !id || !vote.ids().includes(id))) throw new Error('投票の設定がありません');
      const data = { ...req.body, ...req.query };
      const out = {};
      for (const id of ids) {
        if (action === 'start') out[id] = vote.start(id, { options: data.options, seconds: data.seconds });
        else if (action === 'close') out[id] = vote.close(id);
        else if (action === 'result') out[id] = vote.result(id);
        else if (action === 'reset') out[id] = (vote.reset(id), vote.snapshot()[id]);
      }
      return res.json({ ok: true, vote: ids.length === 1 ? out[ids[0]] : undefined, votes: out });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });
  // いいね応援ゲージ。Stream Deck から押せるように GET と POST の両方を受ける。
  r.get('/api/cheer', (_req, res) => res.json(cheer.snapshot()));
  r.all('/api/cheer/:id/:action', (req, res) => {
    const action = req.params.action;
    if (!['status', 'add', 'fill', 'reset'].includes(action)) return res.status(400).json({ error: '応援ゲージの動作は add / fill / reset / status のどれかです' });
    try {
      const id = req.params.id === 'active' ? cfg.activeId(hub.config, 'cheers') : req.params.id;
      if (action === 'status') return res.json({ ok: true, cheers: cheer.snapshot() });
      if (action === 'add') return res.json({ ok: true, cheer: cheer.add(id, req.body?.value ?? req.query?.value) });
      if (action === 'fill') return res.json({ ok: true, cheer: cheer.fill(id) });
      cheer.reset(id);
      return res.json({ ok: true, cheer: cheer.snapshot()[id] });
    } catch (err) { return res.status(400).json({ error: err.message }); }
  });
  // 押しボタン。Stream Deck から押せるように GET と POST の両方を受ける。
  r.get('/api/push-button', (_req, res) => res.json(push.snapshot()));
  r.all('/api/push-button/:id/:action', (req, res) => {
    const action = req.params.action; const id = req.params.id === 'active' ? cfg.activeId(hub.config, 'pushButtons') : req.params.id;
    if (!['status', 'start', 'finish', 'reset'].includes(action)) return res.status(400).json({ error: '押しボタンの動作は start / finish / reset / status のどれかです' });
    try {
      if (action === 'status') return res.json({ ok: true, push: push.snapshot() });
      if (!push.ids().includes(id)) throw new Error('押しボタンの設定がありません');
      const state = action === 'start' ? push.start(id, { seconds: req.body?.seconds ?? req.query?.seconds }) : action === 'finish' ? push.finish(id) : (push.reset(id), push.snapshot()[id]);
      return res.json({ ok: true, push: state, pushes: push.snapshot() });
    } catch (err) { return res.status(400).json({ error: err.message }); }
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
  r.get('/api/visitors', (_req, res) => res.json(visitors.snapshot()));

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

  // 配信テンプレート。変更内容はサーバー側の JSON から作り直し、画面の本文は信じない。
  const templateContext = (template) => {
    const me = info();
    return { config: hub.config, widgets: me.widgets ?? [], tenant: me.mode === 'tenant', entitled };
  };
  const previewOne = (template) => ({ ...previewTemplate(template, templateContext(template)), live: hub.status.mode === 'live' });
  r.get('/api/templates', (_req, res) => res.json(templateList()));
  r.post('/api/templates/preview', (req, res) => {
    const template = getTemplate(req.body?.id);
    if (!template) return res.status(404).json({ error: 'その配信テンプレートはありません' });
    res.json(previewOne(template));
  });

  const currentUndoState = () => ({ widgets: info().mode === 'tenant' ? [...(info().widgets ?? [])] : null, template: info().mode === 'tenant' ? (info().template ?? null) : null });
  const matchesUndoState = (entry) => {
    if (!entry) return false;
    const current = currentUndoState();
    return store.readText() === entry.after && JSON.stringify(current) === JSON.stringify(entry.afterState ?? { widgets: null, template: null });
  };
  const applyTemplate = (template, req) => {
    const before = store.readText();
    const context = templateContext(template);
    const allowed = template.changes.filter((change) => context.entitled(sectionOfChange(change)));
    const checked = checkChanges(allowed, { allowedSections: SECTIONS.filter((section) => entitled(section)) });
    if (checked.errors.length) return { status: 422, body: { error: checked.errors[0], errors: checked.errors } };
    const next = cfg.applyChanges(before, checked.changes);
    if (!next.ok) return { status: 422, body: { error: `反映できませんでした: ${next.errors.join(' / ')}`, errors: next.errors } };
    const result = store.replaceText(next.text);
    if (!result.ok) return { status: 422, body: { error: `反映できませんでした: ${result.errors.join(' / ')}`, errors: result.errors } };
    const beforeState = currentUndoState();
    const templateWidgets = [...(template.widgets ?? []), ...(template.optionalWidgets ?? [])];
    if (setWidgets) setWidgets([...new Set([...(info().widgets ?? []), ...templateWidgets.filter((section) => entitled(section))])]);
    if (setTemplate) setTemplate(template.id);
    const afterState = currentUndoState();
    aiUndo = { before, after: store.readText(), beforeState, afterState };
    applyConfigResult(result);
    return { status: 200, body: { ok: true, id: template.id, warnings: result.warnings, canUndo: true, ...configPayload(req) } };
  };
  r.post('/api/templates/apply', (req, res) => {
    const template = getTemplate(req.body?.id);
    if (!template) return res.status(404).json({ error: 'その配信テンプレートはありません' });
    if (hub.status.mode === 'live' && req.body?.confirmLive !== true) return res.status(409).json({ error: '配信中です。確認してから入れてください' });
    const out = applyTemplate(template, req);
    res.status(out.status).json(out.body);
  });
  r.post('/api/templates/undo', (req, res) => undoTemplate(req, res));

  // --- AI にたのむ ---
  // たのむ → 案を見る → 反映する → 気に入らなければ元に戻す。1日の回数は管理者が決める
  const aiUse = { day: '', count: 0, busy: false };
  // 反映の前と後の設定ファイルの文字。反映のあとに別の変更が入っていたら、元に戻さない（その変更まで消してしまうので）
  let aiUndo = null;
  function undoTemplate(req, res) {
    if (aiUndo == null) return res.status(400).json({ error: '元に戻せるものがありません' });
    if (!canUndo()) {
      aiUndo = null;
      return res.status(409).json({ error: '入れたあとに別の変更があるので、まとめて元には戻せません（変えたところを手で直してください）' });
    }
    const result = store.replaceText(aiUndo.before);
    if (!result.ok) return res.status(422).json({ ok: false, error: `元に戻せませんでした: ${result.errors.join(' / ')}` });
    if (aiUndo.beforeState && setWidgets && aiUndo.beforeState.widgets !== null) setWidgets(aiUndo.beforeState.widgets);
    if (aiUndo.beforeState && setTemplate) setTemplate(aiUndo.beforeState.template);
    aiUndo = null;
    applyConfigResult(result);
    res.json({ ok: true, ...configPayload(req) });
  }
  const canUndo = () => matchesUndoState(aiUndo);
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
    aiUndo = { before, after: store.readText(), beforeState: currentUndoState(), afterState: currentUndoState() };
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
    if (aiUndo.beforeState && setWidgets && aiUndo.beforeState.widgets !== null) setWidgets(aiUndo.beforeState.widgets);
    if (aiUndo.beforeState && setTemplate) setTemplate(aiUndo.beforeState.template);
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
      if (body.target === 'omikuji') {
        const started = omikuji.start({ kind: 'dev', source: 'dev' });
        if (!started) return res.status(400).json({ error: 'おみくじはオフです' });
        return res.json({ ok: true, omikuji: started });
      }
      if (body.target === 'gacha-viewer') {
        const name = String(body.name || 'テスト視聴者').trim() || 'テスト視聴者';
        const started = gachaViewers.devSpin({ id: `dev_${name}`, name }, body.paid === true);
        if (!started.ok) return res.status(400).json({ ...started, error: started.error || '回せませんでした' });
        return res.json({ ok: true, gacha: started, viewers: gachaViewers.list() });
      }
      if (body.target === 'slot') {
        const started = slot.start({ kind: 'dev', source: 'dev', user: { name: 'テストさん' }, gift: null });
        if (!started) return res.status(400).json({ error: 'スロットはオフです' });
        return res.json({ ok: true, slot: started });
      }
      if (body.target === 'relay-stop') {
        const started = relayStop.start({ kind: 'dev', source: 'dev', user: { name: 'テストさん' }, gift: null });
        if (!started.ok) return res.status(400).json(started);
        return res.json({ ok: true, relayStop: started, visualOnly: true });
      }
      if (body.target === 'peka') {
        const result = peka.onEvent({ kind: 'gift', gift: { name: 'テストギフト', count: 1, diamonds: 1 }, totalDiamonds: 1, user: { name: 'テストさん' }, test: true });
        return res.json({ ok: true, peka: result });
      }
      return res.status(400).json({ error: '不明な target です' });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });
  r.get('/api/gacha', (_req, res) => res.json(gacha.snapshot()));
  r.get('/api/omikuji', (_req, res) => res.json(omikuji.snapshot()));
  r.get('/api/gacha-viewers', (_req, res) => res.json(gachaViewers.snapshot()));
  r.post('/api/gacha-viewers/reset-free', (_req, res) => {
    gachaViewers.resetFree();
    res.json({ ok: true, viewers: gachaViewers.list() });
  });
  r.post('/api/gacha-viewers/:id/adjust', (req, res) => {
    try {
      const viewer = gachaViewers.adjust(req.params.id, Number(req.body?.amount), req.body?.type === 'free' ? 'free' : 'paid');
      if (!viewer) return res.status(404).json({ error: '視聴者が見つかりません' });
      return res.json({ ok: true, viewer });
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
  });
  r.get('/api/slot', (_req, res) => res.json(slot.snapshot()));
  r.get('/api/relay-stop', (_req, res) => res.json(relayStop.snapshot()));
  r.get('/api/peka', (_req, res) => res.json(peka.snapshot()));
  r.get('/api/throne', (_req, res) => res.json(throne.snapshot()));
  r.get('/api/ootori', (_req, res) => res.json(ootori.snapshot()));
  r.get('/api/dareba', (_req, res) => res.json(dareba.snapshot()));
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
    // 実際のTikTok経路を再現したい受け入れテストだけ、明示的に印を付ける。
    hub.publish({ ...event, ...(body?.source === 'tiktok' ? { source: 'tiktok' } : {}), test: true });
    // 配信中のテストは画面に出るだけ（数は変わらない）
    return { status: 200, body: { ok: true, visualOnly: hub.status.mode === 'live' } };
  }

  // ルーレット・タイマー・WIN数・ボス・RUSH。画面の /api/control と AI 用 API で同じ
  function performControl(target, action, data = {}) {
    if (!target || !action) return { status: 400, body: { error: 'target と action が必要です' } };
    if (target === 'visitors' && action === 'forget') return { status: 200, body: { ok: visitors.forget(), visitors: visitors.snapshot() } };
    // ルーレットは何が当たるかをサーバーで決める
    if (target === 'roulette' && action === 'spin') {
      const spin = roulette.spin(data?.id ?? null);
      return spin ? { status: 200, body: { ok: true, spin } } : { status: 404, body: { error: 'ルーレットの設定がありません' } };
    }
    if (target === 'roulette' && action === 'reset') roulette.clear();
    if (target === 'peka') {
      if (action !== 'bonusResolved' && action !== 'resolve') return { status: 400, body: { error: 'Peka は bonusResolved で解決してください' } };
      return { status: 200, body: { ok: true, peka: peka.resolve('bonusResolved') } };
    }
    if (target === 'throne') {
      if (action === 'status') return { status: 200, body: { ok: true, throne: throne.snapshot() } };
      if (action === 'reset') return { status: 200, body: { ok: true, throne: throne.reset() } };
      if (action === 'finish' || action === 'end') return { status: 200, body: { ok: true, throne: throne.finish() } };
      if (action === 'stop') return { status: 200, body: { ok: true, throne: throne.stopEffects() } };
      return { status: 400, body: { error: '王座は status / reset / finish / stop を指定してください' } };
    }
    if (target === 'ootori') {
      if (action === 'status') return { status: 200, body: { ok: true, ootori: ootori.snapshot() } };
      if (action === 'start') return { status: 200, body: { ok: true, ootori: ootori.start() } };
      if (action === 'finish' || action === 'end') return { status: 200, body: { ok: true, ootori: ootori.finish() } };
      if (action === 'reset') return { status: 200, body: { ok: true, ootori: ootori.reset() } };
      return { status: 400, body: { error: '大トリは status / start / finish / reset を指定してください' } };
    }
    if (target === 'dareba') {
      if (action === 'status') return { status: 200, body: { ok: true, dareba: dareba.snapshot() } };
      if (action === 'stop') return { status: 200, body: { ok: true, dareba: dareba.stop() } };
      if (action === 'start') return { status: 200, body: { ok: true, dareba: dareba.trigger({ user: data?.user ?? null }) ? dareba.snapshot() : dareba.snapshot() } };
      return { status: 400, body: { error: 'ダレ場は status / start / stop を指定してください' } };
    }
    if (target === 'relay-stop' || target === 'relayStop') return { status: 200, body: { ok: true, relayStop: relayStop.snapshot() } };
    // RUSH はサーバーで状態を持つ
    if (target === 'rush') {
      if (action === 'status') return { status: 200, body: { ok: true, rush: rush.snapshot() } };
      if (!entitled('rush')) return { status: 403, body: { error: 'RUSH は管理者が使えるようにすると使えます' } };
      const out = action === 'stop' ? rush.stop() : rush.start({ reason: 'manual' });
      return { status: 200, body: { ok: true, rush: out ?? rush.snapshot() } };
    }
    if (target === 'stepup') {
      if (action === 'status') return { status: 200, body: { ok: true, stepup: stepup.snapshot() } };
      if (!entitled('stepup')) return { status: 403, body: { error: 'ステップアップ予告は管理者が使えるようにすると使えます' } };
      if (!['start', 'stop', 'reset', 'demo'].includes(action)) return { status: 400, body: { error: 'stepup の action は start / stop / reset / demo / status です' } };
      const out = action === 'stop' ? stepup.stop() : action === 'reset' ? stepup.reset() : action === 'demo' ? stepup.demo() : stepup.start();
      return { status: 200, body: { ok: true, stepup: out ?? stepup.snapshot() } };
    }
    if (target === 'swarm') {
      if (action === 'status') return { status: 200, body: { ok: true, swarm: swarm.snapshot() } };
      if (!entitled('swarm')) return { status: 403, body: { error: '群予告は管理者が使えるようにすると使えます' } };
      if (!['trigger', 'reset'].includes(action)) return { status: 400, body: { error: 'swarm の action は trigger / reset / status です' } };
      const out = action === 'reset' ? swarm.reset() : swarm.trigger();
      return { status: 200, body: { ok: true, swarm: out ?? swarm.snapshot() } };
    }
    if (target === 'combo') {
      if (action === 'status') return { status: 200, body: { ok: true, combo: combo.snapshot() } };
      if (!entitled('combo')) return { status: 403, body: { error: 'コンボは管理者が使えるようにすると使えます' } };
      if (action === 'reset') {
        combo.reset();
        return { status: 200, body: { ok: true, combo: combo.snapshot() } };
      }
      if (action === 'test') {
        if (!isDevEnv()) return { status: 403, body: { error: 'コンボのテストは開発環境でだけ使えます' } };
        if (data?.user !== undefined) {
          const user = data.user;
          const valid = user && typeof user === 'object' && (user.id || user.name);
          if (!valid) return { status: 400, body: { error: 'テストする人は id または name を持つ必要があります' } };
        }
        combo.test(data?.user ?? { id: 'test', name: 'テスト' }, data?.count);
        return { status: 200, body: { ok: true } };
      }
      return { status: 400, body: { error: 'コンボの操作が違います' } };
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
    if (target === 'vote') {
      if (!entitled('votes')) return { status: 403, body: { error: 'コメント投票は管理者が使えるようにすると使えます' } };
      const requested = data?.id;
      const ids = requested === 'all' ? vote.ids() : [requested === 'active' || !requested ? cfg.activeId(hub.config, 'votes') : requested];
      try {
        const allowedActions = ['status', 'start', 'close', 'result', 'reset'];
        if (!allowedActions.includes(action)) throw new Error('投票の動作は start / close / result / reset / status のどれかです');
        if (action === 'status') return { status: 200, body: { ok: true, votes: vote.snapshot() } };
        if (!ids.length || ids.some((id) => !id || !vote.ids().includes(id))) throw new Error('投票の設定がありません');
        const out = {};
        for (const id of ids) {
          if (action === 'start') out[id] = vote.start(id, data);
          else if (action === 'close') out[id] = vote.close(id);
          else if (action === 'result') out[id] = vote.result(id);
          else if (action === 'reset') { vote.reset(id); out[id] = vote.snapshot()[id]; }
          else throw new Error('動作は start / close / result / reset / status のどれかです');
        }
        return { status: 200, body: { ok: true, vote: ids.length === 1 ? out[ids[0]] : undefined, votes: out } };
      } catch (err) {
        return { status: 400, body: { error: err.message } };
      }
    }
    if (target === 'cheer') {
      if (!entitled('cheers')) return { status: 403, body: { error: 'いいね応援ゲージは管理者が使えるようにすると使えます' } };
      const requested = data?.id;
      const ids = requested === 'all' ? cheer.ids() : [requested === 'active' || !requested ? cfg.activeId(hub.config, 'cheers') : requested];
      try {
        if (!['status', 'add', 'fill', 'reset'].includes(action)) throw new Error('応援ゲージの動作は add / fill / reset / status のどれかです');
        if (action === 'status') return { status: 200, body: { ok: true, cheers: cheer.snapshot() } };
        if (!ids.length || ids.some((id) => !id || !cheer.ids().includes(id))) throw new Error('応援ゲージの設定がありません');
        const out = {};
        for (const id of ids) out[id] = action === 'add' ? cheer.add(id, data?.value) : action === 'fill' ? cheer.fill(id) : (cheer.reset(id), cheer.snapshot()[id]);
        return { status: 200, body: { ok: true, cheer: ids.length === 1 ? out[ids[0]] : undefined, cheers: out } };
      } catch (err) { return { status: 400, body: { error: err.message } }; }
    }
    if (target === 'push') {
      if (!entitled('pushButtons')) return { status: 403, body: { error: '押しボタンは管理者が使えるようにすると使えます' } };
      const id = data?.id === 'active' || !data?.id ? cfg.activeId(hub.config, 'pushButtons') : data.id;
      try {
        if (!['status', 'start', 'finish', 'reset'].includes(action)) throw new Error('押しボタンの動作は start / finish / reset / status のどれかです');
        if (action === 'status') return { status: 200, body: { ok: true, push: push.snapshot() } };
        if (!push.ids().includes(id)) throw new Error('押しボタンの設定がありません');
        const state = action === 'start' ? push.start(id, data) : action === 'finish' ? push.finish(id) : (push.reset(id), push.snapshot()[id]);
        return { status: 200, body: { ok: true, push: state, pushes: push.snapshot() } };
      } catch (err) { return { status: 400, body: { error: err.message } }; }
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
    ingest,
    demo,
    // 切断直後は同じ配信の再接続として15分だけ /healthz に残す。
    isLive: () => hub.status.mode === 'live'
      || (reconnectFromLive
        && ['connecting', 'error'].includes(hub.status.mode)
        && lastLiveAt != null
        && now() - lastLiveAt < LIVE_RECONNECT_GRACE_MS),
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
    readEffectAnalysis(sessionId, range) {
      return analyzeEffects(history.effectLog.dir, { sessionId, ...(range ?? {}) });
    },
    readGifts,
    readWins() { return wins.snapshot(); },
    readTimer() { return timer.snapshot(); },
    readBoss() { return boss.snapshot(); },
    readVote() { return vote.snapshot(); },
    readCheer() { return cheer.snapshot(); },
    readPush() { return push.snapshot(); },
    readVisitors() { return visitors.snapshot(); },
    readRush() { return rush.snapshot(); },
    readRelayStop() { return relayStop.snapshot(); },
    readThrone() { return throne.snapshot(); },
    readOotori() { return ootori.snapshot(); },
    readDareba() { return dareba.snapshot(); },
    readGoalAlert() { return minecraft.goalAlertSnapshot(); },
    readStepup() { return stepup.snapshot(); },
    readSwarm() { return swarm.snapshot(); },
    readCombo() { return combo.snapshot(); },
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
      vote.reset();
      cheer.reset();
      push.reset();
      demo.stop();
      await tiktok.disconnect().catch(() => {});
      history.end();
      clearInterval(history.timer);
      history.effectLog.close();
      timer.close();
      stepup.close();
      swarm.close();
      gacha.close();
      omikuji.close();
      gachaViewers.close();
      slot.close();
      relayStop.close();
      ootori.close();
      dareba.close();
      minecraft.goalAlert.stop();
      combo.close();
      giftSounds.close();
      boss.flush();
      infoFeed.close();
      visitors.close();
    },
  };
}
