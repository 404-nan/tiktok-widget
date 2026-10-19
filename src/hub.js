// イベントの集約と配信。集計値（いいね・視聴者・フォローなど）を持ち、
// 接続中のウィジェット全員に WebSocket で流す。
// サーバー内のほかの仕組み（履歴・ルーレット・Minecraft）は 'event' / 'status' / 'reset' を購読する。

import { EventEmitter } from 'node:events';
import { publicConfig } from './config.js';
import { addCoins, coinCount, eventCoinTotal } from './gifts.js';

const RANKING_SIZE = 20; // ウィジェットに渡すランキングの件数
const RECENT_CHATS = 30; // 読み込み直したコメント欄に渡す、最近のコメントの件数

export function emptyState() {
  return {
    likes: 0,
    viewers: 0,
    follows: 0,
    shares: 0,
    diamonds: 0,
    gifts: 0,
    comments: 0,
    topGifters: [], // [{ key, user, diamonds, gifts }]
    topLikers: [], // [{ key, user, likes }]
  };
}

export class Hub extends EventEmitter {
  constructor() {
    super();
    this.gifters = new Map();
    this.likers = new Map();
    this.clients = new Set();
    this.state = emptyState();
    this.status = { mode: 'idle', username: null, message: '' };
    this.recent = [];
    this.recentChats = []; // 新しい順
    this.seq = 0;
    this.config = null;
  this.seenGifts = new Map(); // 配信中に届いたギフト（ID → TikTok の名前）
    this.testDirty = false; // テストやデモで数が増えているか
    this.sample = { on: false, until: null };
    this.sampleTimer = null;
  }

  addClient(ws) {
    this.clients.add(ws);
    ws.on('close', () => this.clients.delete(ws));
    // 未払いの配信画面には、中身もエラー文も出さない
    if (ws.quiet) {
      this.#send(ws, { type: 'hello', status: { mode: 'idle', message: '' }, state: emptyState(), sample: { on: false, until: null }, config: null, recentChats: [] });
      return;
    }
    // ウィジェットにはパスワードなどを抜いた設定を配る
    // recentChats: OBS を読み込み直しても、コメント欄が続きから出せるように
    this.#send(ws, { type: 'hello', status: this.status, state: this.state, sample: this.sampleState(), config: publicConfig(this.config), recentChats: this.recentChats });
  }

  sampleState() {
    if (this.sample.on && this.sample.until <= Date.now()) this.setSample(false);
    return { ...this.sample };
  }

  setSample(on) {
    if (on && this.status.mode === 'live') throw new Error('配信中は見本を出せません');
    clearTimeout(this.sampleTimer);
    this.sample = on ? { on: true, until: Date.now() + 15 * 60 * 1000 } : { on: false, until: null };
    if (on) {
      this.sampleTimer = setTimeout(() => this.setSample(false), 15 * 60 * 1000);
      this.sampleTimer.unref?.();
    }
    this.broadcast({ type: 'sample', on: this.sample.on });
    return this.sampleState();
  }

  /** 設定が変わったらウィジェットに知らせる */
  setConfig(config) {
    this.config = config;
    this.broadcast({ type: 'config', config: publicConfig(config) });
    this.emit('config', config);
  }

  /** 正規化済みイベントを集計に反映して配信する */
  publish(event) {
    if (!event) return;
    const e = { id: ++this.seq, ts: Date.now(), ...event };
    // テスト送信（test: true）は、本番の数を汚さない:
    // - 配信中（TikTok につないでいる間）は画面に出すだけ。集計・ランキングは変えず、
    //   ほかの仕組み（WIN数・タイマー・ボス・ルーレット・Minecraft・記録）にも渡さない
    // - つなぐ前に試した分は数えるが、つながったときに 0 に戻す（setStatus）
    if (e.test && this.status.mode === 'live') {
      this.broadcast({ type: 'event', event: e, state: this.state });
      this.emit('testEvent', e); // ルーレットだけは画面で回す（結果は記録・Minecraft に渡さない）
      return;
    }
    if (e.test) this.testDirty = true;
    this.#apply(e);
    this.recent.unshift(e);
    this.recent.length = Math.min(this.recent.length, 50);
    this.broadcast({ type: 'event', event: e, state: this.state });
    this.emit('event', e);
  }

  control(target, action, data = {}) {
    this.broadcast({ type: 'control', target, action, data });
  }

  setStatus(patch) {
    const prev = this.status;
    this.status = { ...this.status, ...patch };
    if (this.status.mode === 'live' && this.sample.on) this.setSample(false);
    this.broadcast({ type: 'status', status: this.status });
    this.emit('status', this.status, prev);
    // 配信が始まったら、その前のテストやデモで増えた数を 0 に戻す（途中で切れてつなぎ直したときは戻さない）
    if (this.status.mode === 'live' && prev.mode !== 'live' && this.testDirty) this.reset();
  }

  reset() {
    this.state = emptyState();
    this.gifters.clear();
    this.likers.clear();
    this.recent = [];
    this.recentChats = [];
    this.testDirty = false;
    this.broadcast({ type: 'state', state: this.state });
    this.control('all', 'reset');
    this.emit('reset');
  }

  broadcast(msg) {
    const text = JSON.stringify(msg);
    const compactText = msg.type === 'event'
      ? JSON.stringify({ type: 'event', event: msg.event, statePatch: statePatch(msg.event, msg.state) })
      : null;
    for (const ws of this.clients) {
      if (ws.readyState !== 1) continue;
      if (typeof ws.allowMessage === 'function' && !ws.allowMessage(msg)) continue;
      if (ws.compact && msg.type === 'event') {
        ws.send(compactText);
        continue;
      }
      ws.send(text);
    }
  }

  // ユーザーごとの集計の行（なければ作る）
  #row(map, user, init) {
    const key = user?.id || user?.name || '?';
    let row = map.get(key);
    if (!row) map.set(key, (row = { key, user, ...init }));
    row.user = user;
    return row;
  }

  #send(ws, msg) {
    ws.send(JSON.stringify(msg));
  }

  #apply(e) {
    const s = this.state;
    switch (e.kind) {
      case 'gift': {
        const gift = e.gift ?? {};
        const coins = eventCoinTotal(e);
        const count = finiteCount(gift.count);
        if (gift.name && !String(e.user?.id ?? '').startsWith('demo_')) {
          const { id, name, nameJa, image } = gift;
          this.seenGifts.set(String(id || name), { id, name, nameJa: nameJa ?? null, diamonds: coinCount(gift), image });
        }
        s.gifts = addCoins(s.gifts, count);
        s.diamonds = addCoins(s.diamonds, coins);
        const row = this.#row(this.gifters, e.user, { diamonds: 0, gifts: 0 });
        row.diamonds = addCoins(row.diamonds, coins);
        row.gifts = addCoins(row.gifts, count);
        s.topGifters = top(this.gifters, 'diamonds');
        break;
      }
      case 'like': {
        // TikTok からは配信全体の累計が届く。届かないとき（デモなど）は足し上げる。
        s.likes = e.total > 0 ? Math.max(s.likes, e.total) : s.likes + e.count;
        e.total = s.likes;
        const row = this.#row(this.likers, e.user, { likes: 0 });
        row.likes += e.count;
        s.topLikers = top(this.likers, 'likes');
        break;
      }
      case 'viewers':
        s.viewers = e.viewers;
        break;
      case 'follow':
        s.follows += 1;
        break;
      case 'share':
        s.shares += 1;
        break;
      case 'chat': {
        s.comments += 1;
        // この配信でこの人が送ったコインの合計（コメント欄で目立たせる）
        const key = e.user?.id || e.user?.name || '?';
        e.giftCoins = this.gifters.get(key)?.diamonds ?? 0;
        this.recentChats.unshift(e);
        this.recentChats.length = Math.min(this.recentChats.length, RECENT_CHATS);
        break;
      }
    }
  }
}

const finiteCount = (v) => {
  const n = coinCount({ diamondCount: v });
  return n == null ? 0 : n;
};

const top = (map, field) =>
  [...map.values()]
    .sort((a, b) => finiteCount(b[field]) - finiteCount(a[field]))
    .slice(0, RANKING_SIZE)
    .map((r) => ({ ...r, [field]: finiteCount(r[field]) }));

function statePatch(event, state) {
  const patch = {};
  if (event.kind === 'gift') Object.assign(patch, { diamonds: state.diamonds, gifts: state.gifts, topGifters: rankingPatch(state.topGifters, event.user) });
  if (event.kind === 'like') Object.assign(patch, { likes: state.likes, topLikers: rankingPatch(state.topLikers, event.user) });
  if (event.kind === 'follow') patch.follows = state.follows;
  if (event.kind === 'share') patch.shares = state.shares;
  if (event.kind === 'chat') patch.comments = state.comments;
  if (event.kind === 'viewers') patch.viewers = state.viewers;
  return patch;
}

function rankingPatch(rows, user) {
  const changedKey = user?.id || user?.name || '?';
  const order = [];
  const changed = [];
  for (const row of rows) {
    order.push(row.key);
    if (row.key === changedKey) changed.push({ ...row });
  }
  return { order, changed };
}
