// 接続・デモ・テスト送信・コントロール（ルーレット・タイマー・WIN数・ボス・RUSH 等）の API ルートと関数。
// createRuntime の中から bindControl(r, ctx) で呼ばれ、Express Router にルートを登録し、
// simulateEvent・performControl を返す。

import express from 'express';
import * as cfg from './config.js';
import { isDevEnv } from './env.js';
import { makeEvent } from './demo.js';
import { runActions } from './actions.js';

/**
 * 接続・デモ・テスト送信・コントロールルーティングを Express Router に登録する。
 * @param {import('express').Router} r
 * @param {object} ctx - createRuntime 内のクロージャ変数
 * @returns {{ simulateEvent: Function, performControl: Function }}
 */
export function bindControl(r, ctx) {
  const {
    hub, tiktok, demo, roulette, rush, stepup, swarm, combo, wins, timer, boss,
    mediaAlerts, giftSounds, gacha, omikuji, cardDraw, gachaViewers, slot, relayStop,
    peka, throne, ootori, dareba, vote, cheer, push, visitors, preparation,
    actionDeps, mayConnect, streamLive, entitled,
    setStayConnected, rememberTiktokId,
    auto, currentAutoId, timerSeconds,
  } = ctx;

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
    if (currentAutoId.value && auto.has(currentAutoId.value)) auto.get(currentAutoId.value).manuallyStopped = true;
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
      preparation.mark('testedAt');
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
        const results = runActions(body.actions, actionDeps(), { source: 'dev', trigger: { kind: 'dev', test: true } });
        const bad = results.find((item) => !item.ok);
        if (bad) return res.status(400).json({ error: bad.error, results });
        return res.json({ ok: true, results });
      }
      if (body.target === 'boss') {
        const id = body.id || null;
        if (body.action === 'damage') return res.json({ ok: true, boss: boss.apply(id, 'damage', body.amount, { test: true }) });
        if (body.action === 'heal') return res.json({ ok: true, boss: boss.healBy(id, body.amount, { test: true }) });
        return res.status(400).json({ error: 'action は damage か heal です' });
      }
      if (body.target === 'media') return res.json({ ok: true, media: mediaAlerts.play(body.mediaId, { source: 'dev', test: true }) });
      if (body.target === 'gift-sound') {
        const count = Number(body.count) || 1;
        if (!Number.isInteger(count) || count < 1 || count > 4) return res.status(400).json({ error: 'count は 1 から 4 です' });
        const sounds = [];
        for (let i = 0; i < count; i++) sounds.push(giftSounds.play(body.mediaId, { volume: body.volume, source: 'dev', test: true }));
        return res.json({ ok: true, sounds, giftSounds: giftSounds.snapshot() });
      }
      if (body.target === 'gacha') {
        const started = gacha.start({ kind: 'dev', source: 'dev', test: true });
        if (!started) return res.status(400).json({ error: 'ガチャはオフです' });
        return res.json({ ok: true, gacha: started });
      }
      if (body.target === 'cardDraw') {
        const started = cardDraw.start({ kind: 'dev', test: true, user: body.user ? { id: `demo_${body.user}`, name: body.user } : null });
        if (!started) return res.status(400).json({ error: 'カードめくりはオフです' });
        return res.json({ ok: true, cardDraw: started });
      }
      if (body.target === 'omikuji') {
        const started = omikuji.start({ kind: 'dev', source: 'dev', test: true, user: body.user ? { id: `demo_${body.user}`, name: body.user } : null });
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
        const started = slot.start({ kind: 'dev', source: 'dev', test: true, user: { name: 'テストさん' }, gift: null });
        if (!started) return res.status(400).json({ error: 'スロットはオフです' });
        return res.json({ ok: true, slot: started });
      }
      if (body.target === 'relay-stop') {
        const started = relayStop.start({ kind: 'dev', source: 'dev', test: true, user: { name: 'テストさん' }, gift: null });
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
  r.get('/api/card-draw', (_req, res) => res.json(cardDraw.snapshot()));
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

  // テスト送信。開発環境では今までどおり開け、本番では所有者だけに開ける。
  // 配信画面用の鍵（obs）には開けない：配信画面の URL は人に渡る性質で秘匿性が弱く、
  // 開けると配信中に他人がテスト表示を出せる。役割が付いていない呼び出し（1人用の画面）は
  // /api/me と同じく所有者として扱う。AI 用 API は ai-api.js 側で開発環境だけに絞ったまま変えない。
  function simulateEvent(body, req) {
    if (!isDevEnv(req) && (req?.role ?? 'owner') !== 'owner') return { status: 403, body: { error: 'テスト送信は配信者本人の画面でだけ使えます' } };
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
    // おみくじの「配信者が選ぶ」番の番号ボタン
    if (target === 'omikuji' && action === 'pick') {
      const chosen = omikuji.choose(data?.n);
      return chosen.ok ? { status: 200, body: { ok: true, omikuji: omikuji.snapshot() } } : { status: 409, body: { error: chosen.error } };
    }
    // おみくじのテスト開始（編集画面の「試す」用。開発用口から移した本番の線）
    if (target === 'omikuji' && action === 'start') {
      const started = omikuji.start({ kind: 'test', source: 'test', test: true, user: data?.user ? { id: `demo_${data.user}`, name: String(data.user) } : null });
      if (!started) return { status: 400, body: { error: 'おみくじはオフです' } };
      if (started.ok === false) return { status: 400, body: { error: started.error || '今は試せません' } };
      return { status: 200, body: { ok: true, omikuji: started } };
    }
    // ガチャ視聴者のテスト回し（記録に残らない一時状態で無料・有料を試す。開発用口から移した本番の線）
    if (target === 'gacha-viewer' && action === 'spin') {
      const name = String(data?.name || 'テスト視聴者').trim() || 'テスト視聴者';
      const started = gachaViewers.testSpin({ id: `test_${name}`, name }, data?.paid === true);
      if (!started.ok) return { status: 400, body: { ...started, error: started.error || '回せませんでした' } };
      return { status: 200, body: { ok: true, gacha: started, viewers: gachaViewers.list() } };
    }
    // ギフト音の試聴（配信画面側で鳴らして確認する。開発用口から移した本番の線）
    if (target === 'gift-sound' && action === 'play') {
      const count = Number(data?.count ?? 1);
      if (!Number.isInteger(count) || count < 1 || count > 4) return { status: 400, body: { error: 'count は 1 から 4 です' } };
      try {
        const sounds = [];
        for (let i = 0; i < count; i++) sounds.push(giftSounds.play(data?.mediaId, { volume: data?.volume, source: 'test', test: true }));
        return { status: 200, body: { ok: true, sounds, giftSounds: giftSounds.snapshot() } };
      } catch (err) {
        return { status: 400, body: { error: err.message } };
      }
    }
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
        return { status: 200, body: { ok: true, boss: boss.apply(wid, String(action), data?.value, { test: true }) } };
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

  return { simulateEvent, performControl };
}
