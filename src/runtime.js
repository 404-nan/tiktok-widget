// 配信者1人分の仕組み: TikTok の接続、集計、ルーレット、RUSH、WIN数、延長タイマー、ボス討伐、Minecraft 連携、配信の記録、設定ファイル。
// 1人で使うときは1つだけ、配信者ごとに分けるときは配信者の数だけ作る（src/tenants.js）。

import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import { Hub } from './hub.js';
import { TikTokSource } from './tiktok.js';
import { DemoSource } from './demo.js';
import * as cfg from './config.js';
import { bindRoutes } from './runtime-routes.js';
import { RouletteEngine } from './roulette.js';
import { Minecraft } from './minecraft.js';
import { History } from './history.js';
import { analyzeEffects } from './effect-analysis.js';
import { RushEngine } from './rush.js';
import { StepupEngine } from './stepup.js';
import { SwarmEngine } from './swarm.js';
import { ComboEngine } from './combo.js';
import { drawCutin } from './cutin-draw.js';
import { puchunPlays } from './puchun.js';
import { WinsEngine } from './wins.js';
import { TimerEngine } from './timer.js';
import { BossEngine } from './boss.js';
import { DoorEngine } from './door.js';
import { createEventBus } from './events.js';
import { bindRouletteActions, runActions } from './actions.js';
import { MediaAlerts } from './media-alerts.js';
import { GiftSounds } from './gift-sounds.js';
import { CardDraw } from './card-draw.js';
import { StageQueue } from './stage-queue.js';
import { DrawResults } from './draw-results.js';
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
import { shouldAutoConnect } from './rental.js';
import { GiftCatalog } from './gifts.js';
import { EulerUsage } from './euler-usage.js';
import { bindControl } from './runtime-control.js';
import { Ingest } from './ingest.js';
import { InfoFeed } from './info-feed.js';
import { VisitorLog } from './visitors.js';
import { Points } from './points.js';
import { Presets } from './presets.js';
import { PreparationStore } from './preparation.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const LIVE_RECONNECT_GRACE_MS = 15 * 60 * 1000;

// 延長タイマーの秒数は seconds・minutes・value（秒）のどれでも受ける
const timerSeconds = (o) => {
  const pick = (v) => (v == null || v === '' ? null : Number(v));
  const m = pick(o.minutes);
  return pick(o.seconds) ?? (m != null ? m * 60 : pick(o.value));
};

// 公開名の保持: 呼び出し元（tenants.js 等）が runtime.js から import していた名前をそのまま使えるようにする
export { FEATURES, PREMIUM, featureOfPage, OBS_ALLOWED } from './runtime-features.js';

/**
 * 配信者1人分を作る。
 * store: 設定ファイル（cfg.createStore）、dataDir: 記録などを置く場所、mediaDirs: 画像の場所（前のほうが優先）
 * entitled(feature): そのウィジェット・演出を使えるか（管理者が決める）、info(): 配信者の情報（/api/me）、setWidgets(list): 使うウィジェットを保存
 */
export function createRuntime({ id = 'local', store, dataDir, mediaDirs, entitled = () => true, info = () => ({ mode: 'local' }), setWidgets = null, setTemplate = null, setGuideDone = null, setDisplayName = null, rememberTiktokId = null, setStayConnected = null, widgetBase, ai = null, notes = null, connectionAllowed = () => true, onIngestKeyChange = () => {}, now = Date.now }) {
  const hub = new Hub();
  const preparation = new PreparationStore(path.join(dataDir, 'preparation.json'), now);
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
  hub.on('clientChange', ({ role, connected }) => {
    if (role !== 'obs') return;
    if (connected) {
      preparation.mark('widgetAt');
      const handle = info().tiktokId;
      if (preparation.snapshot().autoConnect !== false && handle && !tiktok.username) {
        tiktok.connect(handle).catch((error) => console.warn(`[tiktok] ${id}: 自動接続に失敗: ${error.message}`));
      }
    }
  });
  hub.on('testEvent', () => preparation.mark('testedAt'));
  hub.on('status', (status) => {
    if (status.mode === 'live' && hub.hasClient('obs')) preparation.mark('liveAt');
  });
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
  const door = new DoorEngine(hub, path.join(dataDir, 'doors.json'));
  const bus = createEventBus();
  bus.on('*', (event) => {
    if (!history.current || event.type === 'gift') return;
    history.effectLog.effect(event.type, { value: event.value, result: event.result, amount: event.amount }, { test: Boolean(event.test), ts: event.ts });
  });
  const mediaAlerts = new MediaAlerts({ dir: path.join(dataDir, 'alert-media'), hub, bus });
  const giftSounds = new GiftSounds({ media: mediaAlerts, hub });
  // 大きな演出の順番待ち（おみくじの抽選・カードめくりの開示が持ち主になる）。配信者ごとに1つ
  const stage = new StageQueue();
  const gacha = new Gacha(hub, { bus, storeFile: path.join(dataDir, 'gacha-pity.json'), stage, stageKey: id });
  const omikuji = new Gacha(hub, { bus, name: 'omikuji', storeFile: path.join(dataDir, 'omikuji-pity.json'), stage, stageKey: id });
  // 抽選の結果の記録（管理画面で「誰が・何に当たったか」を見るため）。テストの結果は記録しない
  const drawResults = new DrawResults(path.join(dataDir, 'draw-results.jsonl'));
  const recordDraw = (kind) => ({ tier, trigger, results, forced }) => {
    if (trigger?.test === true || trigger?.kind === 'test' || trigger?.kind === 'dev') return;
    const user = trigger?.user?.name ?? null;
    const gift = trigger?.giftLabel ?? null;
    if (Array.isArray(results)) {
      for (const r of results) {
        drawResults.add({ kind, user, result: r.tier?.label ?? '', win: r.tier?.pity === true, forced: Boolean(r.forced), gift, session: history.sessionIdAt(trigger?.ts ?? null) });
      }
      return;
    }
    if (tier) drawResults.add({ kind, user, result: tier.label ?? '', win: tier.pity === true, forced: Boolean(forced), gift, session: history.sessionIdAt(trigger?.ts ?? null) });
  };
  bus.on('omikuji.reveal', recordDraw('omikuji'));
  bus.on('omikuji.ten', recordDraw('omikuji'));
  bus.on('gacha.reveal', recordDraw('gacha'));
  const cardDraw = new CardDraw(hub, {
    stage, stageKey: id,
    onResult: ({ user, win, label, giftLabel, test, at }) => {
      if (test) return;
      drawResults.add({ kind: 'cardDraw', user, result: label ?? '', win, gift: giftLabel ?? null, session: history.sessionIdAt(at ?? null) });
    },
  });
  const gachaViewers = new GachaViewers(path.join(dataDir, 'gacha-viewers.json'), { gacha, bus });
  const points = new Points(hub, { file: path.join(dataDir, 'points.json'), omikuji });
  gachaViewers.setPoints(points);
  omikuji.setStaySource(points); // 確率アップ第2段（滞在ベース）の材料
  const slot = new SlotEngine(hub, { bus });
  const relayStop = new RelayStopEngine(hub, { slot });
  const peka = new Peka(hub);
  const throne = new ThroneEngine({ broadcast: (message) => hub.broadcast(message) });
  const ootori = new OotoriEngine({ broadcast: (message) => hub.broadcast(message) });
  const dareba = new DarebaEngine({ hub });
  boss.setBus(bus);
  const actionDeps = () => ({ roulette, timer, wins, rush, media: mediaAlerts, sounds: giftSounds, boss, gacha, omikuji, bus });
  const presets = new Presets(hub, { run: (actions, meta) => runActions(actions, actionDeps(), meta) });
  const vote = new VoteEngine(hub, {
    onResult: ({ id: voteId, actions, result }) => runActions(actions, actionDeps(), { source: 'vote', voteId, result }),
  });
  const cheer = new CheerEngine(hub, {
    onFull: ({ id: cheerId, actions, round, cheer: state }) => runActions(actions, actionDeps(), { source: 'cheer', cheerId, round, cheer: state }),
  });
  const push = new PushButtonEngine(hub, {
    onResult: ({ id: pushId, actions, result }) => runActions(actions, actionDeps(), { source: 'push', pushId, result }),
  });
  bus.on('gacha.reveal', ({ tier, trigger }) => {
    // テスト・開発の開始では、設定済みの動作（WIN数・タイマー・ボス等）を実行しない
    if (trigger?.test === true || trigger?.kind === 'test' || trigger?.kind === 'dev') return;
    runActions(tier?.actions, actionDeps(), { source: 'gacha', tierId: tier?.id, trigger });
  });
  bindRouletteActions(hub, bus, actionDeps);
  bus.on('slot.result', ({ result, payout, trigger }) => {
    // テストで回したスロットでは、払い出しに設定した動作（WIN数など）を実行しない
    if (trigger?.test === true || trigger?.kind === 'test' || trigger?.kind === 'dev') return;
    runActions(payout?.actions, actionDeps(), { source: 'slot', slotId: result?.id, trigger });
  });
  hub.on('event', (e) => {
    if (entitled('puchuns')) {
      for (const play of puchunPlays(hub.config, e)) hub.broadcast({ type: 'puchun', play, test: e.test === true });
    }
    dareba.record(e);
    throne.onEvent(e);
    mediaAlerts.onEvent(e);
    giftSounds.onEvent(e);
    gachaViewers.onEvent(e);
    gacha.onEvent(e);
    omikuji.onEvent(e);
    cardDraw.onEvent(e);
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
  const currentAutoId = { value: null };
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
    door.setConfig(config.doors);
    mediaAlerts.setConfig(config.mediaAlerts);
    giftSounds.setConfig(entitled('giftSounds') ? config.giftSounds : { ...config.giftSounds, enabled: false });
    gacha.setConfig(config.gacha);
    omikuji.setConfig(config.omikuji);
    cardDraw.setConfig(config.cardDraw);
    gachaViewers.setConfig(config.gacha);
    points.setConfig(config.points);
    presets.setConfig(config.presets);
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
      if (cfg.widgetList(result.config).some((widget) => widget.section !== 'all')) preparation.mark('selectedAt');
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

  // --- API（/api/...） ---
  const r = express.Router();
  // control の関数は遅延参照で渡す（OBS ミドルウェアが先に登録される必要があるため bindRoutes → bindControl の順）
  let _control;
  const { readGifts } = bindRoutes(r, {
    id, hub, store, info: () => info(), entitled, widgetBase, mediaDirs, root, notes, ai,
    setWidgets, setTemplate, setGuideDone, setDisplayName,
    preparation, ingest, eulerUsage, infoFeed, visitors, points, presets, history,
    minecraft, rush, stepup, swarm, combo, wins, timer, boss, door, vote, cheer, push,
    roulette, mediaAlerts, giftSounds, gacha, omikuji, cardDraw, gachaViewers, slot, relayStop, peka, throne, ootori, dareba,
    drawResults, giftCatalog, demo, applyConfigResult, lastIssues: () => lastIssues, timerSeconds,
    performControl: (...args) => _control.performControl(...args),
  });
  _control = bindControl(r, {
    hub, tiktok, demo, roulette, rush, stepup, swarm, combo, wins, timer, boss, door,
    mediaAlerts, giftSounds, gacha, omikuji, cardDraw, gachaViewers, slot, relayStop,
    peka, throne, ootori, dareba, vote, cheer, push, visitors, preparation,
    actionDeps, mayConnect, streamLive, entitled,
    setStayConnected, rememberTiktokId,
    auto, currentAutoId, timerSeconds,
  });
  const { simulateEvent, performControl } = _control;

  // API ルートは runtime-routes.js (bindRoutes) と runtime-control.js (bindControl) で登録済み

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
    preparation,
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
      currentAutoId.value = slot.id;
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
    readDoor() { return door.snapshot(); },
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
      return me.mode === 'tenant' ? list.filter((widget) => widget.section === 'all' || widget.section === 'bundles' || (me.widgets ?? []).includes(widget.section)) : list;
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
      cardDraw.close();
      gachaViewers.close();
      points.close();
      presets.close();
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
