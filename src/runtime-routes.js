// API ルート定義（設定の読み書き、状態、ギフト、テンプレート、AI、メディア等）。
// runtime.js の createRuntime から bindRoutes(r, ctx) で呼ばれる。

import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import YAML from 'yaml';
import * as cfg from './config.js';
import { SCHEMA, SECTIONS, COLOR_TOKENS, defaultsFor } from './schema.js';
import { FEATURES, OBS_ALLOWED } from './runtime-features.js';
import { DEMO_GIFTS } from './demo.js';
import { readProfile, SUPERSTREAM_ACTIONS, giftTable } from './superstream.js';
import { checkChanges, MAX_REQUEST_CHARS } from './ai.js';
import { bundledGifts, mergeGiftCatalog, bundledCoinCount } from './gifts.js';
import { giftNamesDocument, lookupGiftJa } from './gift-display.js';
import { isDevEnv } from './env.js';
import { PRODUCT_VERSION } from './version.js';
import { listAnnouncements } from './announcements.js';
import { getTemplate, previewTemplate, templateList } from './templates.js';

const sectionOfChange = (change) => String(change.path).split('.')[0];

import { createWidgetVersions } from './widget-versions.js';

let sharedWidgetVersions = null;

export function bindRoutes(r, ctx) {
  const {
    id, hub, store, info, entitled, widgetBase, mediaDirs, root, notes, ai,
    setWidgets, setTemplate, setGuideDone, setDisplayName,
    preparation, ingest, eulerUsage, infoFeed, visitors, points, presets, history,
    minecraft, rush, stepup, swarm, combo, wins, timer, boss, vote, cheer, push,
    roulette, mediaAlerts, giftSounds, gacha, omikuji, cardDraw, gachaViewers, slot, relayStop, peka, throne, ootori, dareba,
    drawResults, giftCatalog, demo, applyConfigResult, lastIssues, timerSeconds, performControl,
  } = ctx;

  const origin = (req) => `${req.protocol}://${req.host}`;
  function configPayload(req) {
    const defaults = Object.fromEntries(SECTIONS.map((s) => [s, defaultsFor(s)]));
    if (req.role === 'obs') return { config: cfg.publicConfig(hub.config), defaults: cfg.publicConfig(defaults) };
    const me = info();
    const widgets = hub.config ? cfg.widgetList(hub.config, widgetBase ? widgetBase(origin(req)) : origin(req)) : [];
    const visibleWidgets = me.mode === 'tenant' ? widgets.filter((widget) => widget.section === 'all' || widget.section === 'bundles' || (me.widgets ?? []).includes(widget.section)) : widgets;
    return {
      path: store.path,
      yaml: store.readText(),
      config: hub.config,
      defaults,
      errors: lastIssues().errors,
      warnings: lastIssues().warnings,
      widgets: visibleWidgets,
    };
  }

  // --- API（/api/...） ---

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

  // /api/me と、その更新系（widgets / template / guide / name）で返す形をそろえる。
  // ダッシュボードは更新の返事で画面の状態（me）を丸ごと入れ替えるので、
  // features が欠けた返事を受けると「使えるもの」の判定が全部ずれて、カードが消えてしまう。
  const meJson = (req) => {
    const me = info();
    const tenant = me.mode === 'tenant';
    const features = tenant ? Object.fromEntries(Object.entries(FEATURES).filter(([key]) => entitled(key))) : FEATURES;
    const access = tenant ? Object.fromEntries(Object.entries(me.access ?? {}).filter(([, state]) => state?.on)) : me.access;
    return { ...me, role: req.role ?? 'owner', features, ...(tenant ? { access } : {}) };
  };

  r.get('/api/me', (req, res) => {
    res.json(meJson(req));
  });
  r.get('/api/env', (req, res) => {
    const dev = isDevEnv(req);
    res.json({ dev, environment: dev ? 'dev' : 'prod' });
  });
  r.get('/api/notes', (_req, res) => res.json({ notes: notes?.list?.() ?? [] }));
  // 製品の更新お知らせ（バージョン付き）。データはコードと一緒に版管理する src/announcements.json。
  r.get('/api/announcements', (_req, res) => res.json({ version: PRODUCT_VERSION, announcements: listAnnouncements() }));
  r.put('/api/me/widgets', (req, res) => {
    if (!setWidgets) return res.status(400).json({ error: '1人で使うときは選べません（全部使えます）' });
    const list = Array.isArray(req.body?.widgets) ? req.body.widgets.filter((w) => SECTIONS.includes(w) && entitled(w)) : null;
    if (!list) return res.status(400).json({ error: 'widgets を一覧で送ってください' });
    setWidgets(list);
    res.json({ ok: true, ...meJson(req) });
  });
  r.put('/api/me/template', (req, res) => {
    if (!setTemplate) return res.status(400).json({ error: '1人で使うときは遊び方を選びません' });
    try { setTemplate(req.body?.template); res.json({ ok: true, ...meJson(req) }); } catch (err) { res.status(400).json({ error: err.message }); }
  });
  r.put('/api/me/guide', (req, res) => {
    if (!setGuideDone) return res.status(400).json({ error: '1人で使うときは案内を保存しません' });
    try { setGuideDone(req.body?.done !== false); res.json({ ok: true, ...meJson(req) }); } catch (err) { res.status(400).json({ error: err.message }); }
  });
  r.put('/api/me/name', (req, res) => {
    if (!setDisplayName) return res.status(400).json({ error: 'この画面では表示名を変更できません' });
    try { setDisplayName(req.body?.name); res.json({ ok: true, ...meJson(req) }); } catch (err) { res.status(400).json({ error: err.message }); }
  });

  r.get('/api/status', (_req, res) => {
    res.json({ status: hub.status, widgetConnected: hub.hasClient('obs'), state: hub.state, recent: hub.recent, demo: demo.running, minecraft: minecraft.status, session: history.current?.summary() ?? null });
  });
  r.get('/api/preparation', (_req, res) => res.json(preparation.snapshot()));
  r.put('/api/preparation/auto', (req, res) => res.json(preparation.setAutoConnect(req.body?.on !== false)));
  r.put('/api/preparation/dismiss', (_req, res) => { preparation.mark('prepDismissedAt'); res.json(preparation.snapshot()); });
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
  // 抽選の結果（誰が・何に当たったか）。kind = omikuji / gacha / cardDraw
  r.get('/api/draw-results', (req, res) => {
    const kind = typeof req.query?.kind === 'string' ? req.query.kind : '';
    res.json({ results: drawResults ? drawResults.list(kind || undefined, 50) : [] });
  });
  // 配信ごとの1件ごとの記録。kind は gift / follow / share / roulette / draw（抽選）/ omikuji / gacha / cardDraw、空なら全部
  r.get('/api/session-records', (req, res) => {
    const id = typeof req.query?.id === 'string' ? req.query.id : '';
    if (!id) return res.status(400).json({ error: 'id が必要です' });
    const kind = typeof req.query?.kind === 'string' ? req.query.kind : '';
    const offset = Math.max(0, Math.floor(Number(req.query?.offset)) || 0);
    const limit = Math.min(500, Math.max(1, Math.floor(Number(req.query?.limit)) || 50));
    const DRAW_KINDS = ['omikuji', 'gacha', 'cardDraw'];
    // 種類が詳細側だけ・抽選側だけに決まる読みは、ページをそのまま渡して全件を抱えない
    if (kind === 'gift' || kind === 'follow' || kind === 'share' || kind === 'roulette') {
      return res.json(history.details.read(id, { kind, offset, limit }));
    }
    if (kind === 'draw' || DRAW_KINDS.includes(kind)) {
      const draws = drawResults ? drawResults.readFile({ kind: DRAW_KINDS.includes(kind) ? kind : '', session: id }) : [];
      draws.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
      return res.json({ total: draws.length, items: draws.slice(offset, offset + limit).map((d) => ({ ...d, kind: 'draw', drawKind: d.kind })) });
    }
    let items = history.details.read(id, { offset: 0, limit: 1_000_000_000 }).items;
    if (drawResults) {
      items = items.concat(drawResults.readFile({ session: id }).map((d) => ({ ...d, kind: 'draw', drawKind: d.kind })));
    }
    items.sort((a, b) => (b.ts ?? 0) - (a.ts ?? 0));
    res.json({ total: items.length, items: items.slice(offset, offset + limit) });
  });
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
  // 妨害マイクラのギフト表(配信画面のウィジェット用)。配信者の設定のファイルが無ければ、貸出サーバーのモードの表(TW_MC_GIFT_TABLE)を使う
  r.get('/api/mc-gifts', (_req, res) => {
    const mc = hub.config.minecraft ?? {};
    const file = mc.superstreamFile || process.env.TW_MC_GIFT_TABLE || '';
    const nameJaOf = (id) => lookupGiftJa({ id });
    res.json(giftTable(file, { coinOf: bundledCoinCount, nameJaOf, catalog: [...giftCatalog.list(), ...hub.seenGifts.values()] }));
  });
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
  r.get('/api/points', (_req, res) => res.json(points ? points.snapshot() : { enabled: false, users: 0, ranking: [] }));
  r.get('/api/presets', (_req, res) => res.json(presets ? presets.snapshot() : { enabled: false, active: '', base: 0, presets: [], disabled: [] }));
  r.post('/api/presets/active', (req, res) => {
    if (!presets) return res.status(404).json({ error: 'プリセットがありません' });
    const result = presets.switchTo(req.body?.id ?? '');
    if (!result.ok) return res.status(400).json({ error: result.error });
    return res.json(result);
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
  // 部品ごとの版（部分更新の第1段）。画面が自分の版の変化だけを見て読み直すために使う
  if (!sharedWidgetVersions) sharedWidgetVersions = createWidgetVersions(path.join(root, 'public'));
  r.get('/api/widget-versions', (req, res) => {
    const ids = String(req.query.ids || '').split(',').map((x) => x.trim()).filter(Boolean).slice(0, 40);
    res.json({ versions: sharedWidgetVersions.versionsOf(ids) });
  });
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

  return { readGifts, configPayload };
}
