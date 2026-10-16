// 配信ごとの記録。接続（またはデモ開始）から切断までを1回の配信として、
// 1分ごとの推移・ギフトを送った人・ギフトの種類・ルーレットの結果などを data/sessions/ に保存する。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { addCoins, coinCount, eventCoinTotal } from './gifts.js';
import { isDevEnv } from './env.js';

/** 1時間あたりのコイン。時間が 0 以下、またはコインが数でないときは 0（NaN や Infinity にしない） */
export function coinsPerHour(coins, durationMs) {
  const parsed = coinCount({ diamondCount: coins });
  const c = parsed == null ? Number(coins) : parsed;
  const ms = Number(durationMs);
  if (!Number.isFinite(c) || c < 0 || !Number.isFinite(ms) || ms <= 0) return 0;
  const per = (c * 3_600_000) / ms;
  return Number.isFinite(per) ? per : 0;
}

const finiteCount = (v) => {
  const n = coinCount({ diamondCount: v });
  return n == null ? 0 : n;
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const HISTORY_DIR = path.resolve(process.env.TW_DATA || path.join(root, 'data'), 'sessions');
const SAVE_EVERY_MS = 15_000;
const KEEP = { gifters: 100, likers: 30 };

const pad = (n) => String(n).padStart(2, '0');
const stamp = (d) => `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;

class Session {
  constructor({ username, demo }) {
    const now = new Date();
    this.id = `${stamp(now)}-${(username || (demo ? 'demo' : 'live')).replace(/[^\w-]/g, '')}`;
    this.username = username;
    this.demo = demo;
    this.startedAt = now.getTime();
    this.endedAt = null;
    this.totals = { coins: 0, gifts: 0, likes: 0, follows: 0, shares: 0, comments: 0, peakViewers: 0 };
    this.timeline = []; // 1分ごと
    this.gifters = new Map();
    this.likers = new Map();
    this.giftTypes = new Map();
    this.roulettes = new Map();
    this.minecraft = { sent: 0, failed: 0 };
    this.viewerMinutes = new Set(); // 視聴者数が届いた分（届くまでは前の分の値を表示に使う）
    this.dirty = true;
  }

  #minute(ts) {
    const t = Math.max(0, Math.floor((ts - this.startedAt) / 60_000));
    while (this.timeline.length <= t) {
      const prev = this.timeline.at(-1);
      this.timeline.push({ t: this.timeline.length, coins: 0, gifts: 0, likes: 0, follows: 0, comments: 0, viewers: prev?.viewers ?? 0 });
    }
    return this.timeline[t];
  }

  record(e) {
    const m = this.#minute(e.ts ?? Date.now());
    const T = this.totals;
    const user = e.user ?? {};
    const key = user.id || user.name;
    switch (e.kind) {
      case 'gift': {
        const gift = e.gift ?? {};
        const coins = eventCoinTotal(e);
        const count = finiteCount(gift.count);
        T.coins = addCoins(T.coins, coins);
        T.gifts = addCoins(T.gifts, count);
        m.coins = addCoins(m.coins, coins);
        m.gifts = addCoins(m.gifts, count);
        const g = this.gifters.get(key) ?? { key, name: user.name, avatar: user.avatar, coins: 0, gifts: 0 };
        g.coins = addCoins(g.coins, coins);
        g.gifts = addCoins(g.gifts, count);
        g.name = user.name;
        g.avatar = user.avatar ?? g.avatar;
        this.gifters.set(key, g);
        const giftKey = String(gift.id || gift.name || '?');
        const each = coinCount(gift);
        const t = this.giftTypes.get(giftKey) ?? { id: gift.id, name: gift.name, nameJa: gift.nameJa ?? null, image: gift.image, icon: gift.icon, diamonds: each ?? 0, count: 0, coins: 0 };
        t.nameJa = gift.nameJa ?? t.nameJa ?? null;
        if (each != null) t.diamonds = each;
        else if (!Number.isFinite(Number(t.diamonds))) t.diamonds = 0;
        t.count = addCoins(t.count, count);
        t.coins = addCoins(t.coins, coins);
        this.giftTypes.set(giftKey, t);
        break;
      }
      case 'like': {
        T.likes += e.count;
        m.likes += e.count;
        const l = this.likers.get(key) ?? { key, name: user.name, avatar: user.avatar, likes: 0 };
        l.likes += e.count;
        this.likers.set(key, l);
        break;
      }
      case 'follow':
        T.follows += 1;
        m.follows += 1;
        break;
      case 'share':
        T.shares += 1;
        break;
      case 'chat':
        T.comments += 1;
        m.comments += 1;
        break;
      case 'viewers':
        // その分で最初に届いた値で置き換え、あとはその分の最大を取る
        m.viewers = this.viewerMinutes.has(m.t) ? Math.max(m.viewers, e.viewers) : e.viewers;
        this.viewerMinutes.add(m.t);
        T.peakViewers = Math.max(T.peakViewers, e.viewers);
        break;
      default:
        return;
    }
    this.dirty = true;
  }

  recordRoulette({ roulette, item }) {
    const r = this.roulettes.get(roulette.id) ?? { id: roulette.id, name: roulette.name || roulette.id, spins: 0, results: {} };
    r.spins += 1;
    r.results[item.label] = (r.results[item.label] ?? 0) + 1;
    this.roulettes.set(roulette.id, r);
    this.dirty = true;
  }

  summary() {
    const durationMs = (this.endedAt ?? Date.now()) - this.startedAt;
    return {
      id: this.id,
      username: this.username,
      demo: this.demo,
      startedAt: this.startedAt,
      endedAt: this.endedAt,
      durationMs,
      totals: { ...this.totals, uniqueGifters: this.gifters.size },
      coinsPerHour: coinsPerHour(this.totals.coins, durationMs),
    };
  }

  toJSON() {
    const top = (map, field, n) => [...map.values()].sort((a, b) => finiteCount(b[field]) - finiteCount(a[field])).slice(0, n);
    return {
      ...this.summary(),
      timeline: this.timeline,
      gifters: top(this.gifters, 'coins', KEEP.gifters),
      likers: top(this.likers, 'likes', KEEP.likers),
      giftTypes: top(this.giftTypes, 'coins', 100),
      roulettes: [...this.roulettes.values()].map((r) => ({
        ...r,
        results: Object.entries(r.results).map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
      })),
      minecraft: this.minecraft,
    };
  }
}

export class History {
  constructor(hub, dir = HISTORY_DIR) {
    this.hub = hub;
    this.dir = dir;
    this.current = null;
    fs.mkdirSync(dir, { recursive: true });
    hub.on('status', (status) => this.#onStatus(status));
    hub.on('event', (e) => {
      // 開発環境で配信前に押したテスト送信は、デモの配信として記録する
      if (isDevEnv() && e.test && !this.current) this.current = new Session({ username: null, demo: true });
      // 本番の配信中に押したテスト送信は記録しない
      if (this.current && (this.current.demo || !String(e.user?.id ?? '').startsWith('demo_'))) this.current.record(e);
    });
    hub.on('roulette', (r) => {
      if (isDevEnv() && r?.trigger?.test && !this.current) this.current = new Session({ username: null, demo: true });
      this.current?.recordRoulette(r);
    });
    hub.on('minecraft', (log) => {
      if (!this.current || log.source === 'test') return;
      this.current.minecraft[log.ok ? 'sent' : 'failed'] += 1;
      this.current.dirty = true;
    });
    this.timer = setInterval(() => this.save(), SAVE_EVERY_MS);
    this.timer.unref();
  }

  #onStatus(status) {
    const active = status.mode === 'live' || status.mode === 'demo';
    if (active) {
      const demo = status.mode === 'demo';
      const username = demo ? null : status.username;
      if (this.current && (this.current.demo !== demo || this.current.username !== username)) this.end();
      if (!this.current) this.current = new Session({ username, demo });
    } else if (status.mode !== 'connecting') {
      this.end();
    }
  }

  end() {
    if (!this.current) return;
    this.current.endedAt = Date.now();
    this.current.dirty = true;
    this.save();
    this.current = null;
  }

  save() {
    const s = this.current;
    if (!s?.dirty) return;
    s.dirty = false;
    // 何も起きなかった配信は残さない
    if (!s.timeline.length) return;
    fs.writeFileSync(path.join(this.dir, `${s.id}.json`), JSON.stringify(s));
  }

  list() {
    const out = [];
    for (const f of fs.readdirSync(this.dir)) {
      if (!f.endsWith('.json')) continue;
      try {
        const data = JSON.parse(fs.readFileSync(path.join(this.dir, f), 'utf8'));
        const { timeline, gifters, likers, giftTypes, roulettes, minecraft, ...summary } = data;
        out.push({ ...summary, topGifter: gifters?.[0] ?? null });
      } catch {}
    }
    if (this.current) {
      const idx = out.findIndex((s) => s.id === this.current.id);
      const live = { ...this.current.summary(), live: true, topGifter: this.current.toJSON().gifters[0] ?? null };
      if (idx >= 0) out[idx] = live;
      else out.push(live);
    }
    return out.sort((a, b) => b.startedAt - a.startedAt);
  }

  get(id) {
    if (this.current?.id === id) return { ...this.current.toJSON(), live: true };
    const file = path.join(this.dir, `${path.basename(id)}.json`);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  }

  remove(id) {
    if (this.current?.id === id) return false;
    const file = path.join(this.dir, `${path.basename(id)}.json`);
    if (!fs.existsSync(file)) return false;
    fs.unlinkSync(file);
    return true;
  }
}
