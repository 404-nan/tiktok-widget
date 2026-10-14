// ギフト・フォロー・ルーレットの動作で、動画・音声・画像を1つずつ再生する。
// ファイルは配信者のデータの alert-media に置く。画面は /widgets/media.html。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { giftDisplayName, giftMatches } from './gifts.js';

export const MEDIA_LIMITS = {
  video: 32 * 1024 * 1024,
  audio: 12 * 1024 * 1024,
  image: 8 * 1024 * 1024,
};

export const MEDIA_MIME = {
  'video/mp4': 'video',
  'video/webm': 'video',
  'audio/mpeg': 'audio',
  'audio/wav': 'audio',
  'audio/ogg': 'audio',
  'audio/webm': 'audio',
  'image/png': 'image',
  'image/jpeg': 'image',
  'image/gif': 'image',
  'image/webp': 'image',
};

const MEDIA_EXT = {
  'video/mp4': '.mp4',
  'video/webm': '.webm',
  'audio/mpeg': '.mp3',
  'audio/wav': '.wav',
  'audio/ogg': '.ogg',
  'audio/webm': '.weba',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
};

const ID_RE = /^[a-f0-9]{16}$/;
const QUEUE_CAP = 30;
const IMAGE_HOLD_MS = 4000;

export const AUTOPLAY_NOTE = '音ありの自動再生が拒否されました。TikTok LIVE Studio ではミュートで再生されることがあります。';

const mimeOf = (value) => String(value || '').split(';')[0].trim().toLowerCase();

export class MediaAlerts {
  constructor({ dir, hub, bus = null }) {
    this.dir = dir;
    this.hub = hub;
    this.bus = bus;
    this.catalogFile = path.join(dir, 'catalog.json');
    this.items = [];
    this.config = { enabled: true, rules: [] };
    this.queue = [];
    this.playing = null;
    this.autoplay = { muted: false, note: null };
    this.#load();
  }

  setConfig(cfg) {
    this.config = {
      enabled: cfg?.enabled !== false,
      rules: Array.isArray(cfg?.rules) ? cfg.rules : [],
    };
  }

  snapshot() {
    return {
      items: this.items.map((item) => this.#public(item)),
      playing: this.playing ? { token: this.playing.token, item: this.#public(this.playing.item, { holdMs: this.playing.holdMs }) } : null,
      queue: this.queue.map((job) => ({ token: job.token, item: this.#public(job.item) })),
      autoplay: this.autoplay,
      enabled: this.config.enabled !== false,
    };
  }

  addBuffer({ mime, name, buffer }) {
    const type = mimeOf(mime);
    const kind = MEDIA_MIME[type];
    if (!kind) throw new Error('この種類のファイルは使えません（動画 mp4/webm、音声 mp3/wav/ogg、画像 png/jpeg/gif/webp）');
    const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer ?? []);
    if (!buf.length) throw new Error('空のファイルです');
    const limit = MEDIA_LIMITS[kind];
    if (buf.length > limit) throw new Error(`ファイルが大きすぎます（${kind} は ${Math.round(limit / (1024 * 1024))}MB まで）`);
    const id = crypto.randomBytes(8).toString('hex');
    const filename = `${id}${MEDIA_EXT[type]}`;
    fs.mkdirSync(this.dir, { recursive: true });
    fs.writeFileSync(path.join(this.dir, filename), buf);
    const item = {
      id,
      name: safeName(name),
      mime: type,
      kind,
      size: buf.length,
      file: filename,
      createdAt: Date.now(),
    };
    this.items.push(item);
    this.#save();
    return this.#public(item);
  }

  remove(id) {
    if (!ID_RE.test(String(id || ''))) throw new Error('メディアが見つかりません');
    const index = this.items.findIndex((item) => item.id === id);
    if (index < 0) throw new Error('メディアが見つかりません');
    const [item] = this.items.splice(index, 1);
    const file = this.#safeFile(item);
    if (file) fs.rmSync(file, { force: true });
    this.queue = this.queue.filter((job) => job.item.id !== id);
    if (this.playing?.item.id === id) {
      this.playing = null;
      this.#pump();
    }
    this.#save();
  }

  /** 配信用。ディレクトリの外には出さない */
  fileInfo(id) {
    if (!ID_RE.test(String(id || ''))) return null;
    const item = this.items.find((entry) => entry.id === id);
    if (!item) return null;
    const file = this.#safeFile(item);
    if (!file || !fs.existsSync(file)) return null;
    return { path: file, mime: item.mime, item: this.#public(item) };
  }

  /** 動作や開発用の再生。ファイルがあれば、オフのときでも並べる */
  play(mediaId, meta = {}) {
    const item = this.items.find((entry) => entry.id === String(mediaId || ''));
    if (!item) throw new Error('メディアが見つかりません');
    return this.#enqueue(item, meta);
  }

  /** ギフトとフォロー。enabled が false のときは動かない */
  onEvent(e) {
    if (this.config.enabled === false) return;
    for (const rule of this.config.rules) {
      if (!ruleMatches(rule, e)) continue;
      const item = this.items.find((entry) => entry.id === rule.mediaId);
      if (!item) continue;
      const meta = { source: e.kind };
      if (e.kind === 'gift') meta.giftLabel = giftDisplayName(e.gift);
      this.#enqueue(item, meta);
    }
  }

  ack(token) {
    if (!this.playing || this.playing.token !== token) return false;
    this.playing = null;
    this.hub.broadcast({ type: 'mediaAlert', event: 'done', token });
    this.#pump();
    return true;
  }

  reportAutoplay({ muted }) {
    this.autoplay = muted
      ? { muted: true, note: AUTOPLAY_NOTE }
      : { muted: false, note: null };
    this.hub.broadcast({ type: 'mediaAlert', event: 'autoplay', autoplay: this.autoplay });
    return this.autoplay;
  }

  #enqueue(item, meta) {
    while (this.queue.length >= QUEUE_CAP) this.queue.shift();
    const token = crypto.randomBytes(8).toString('hex');
    const job = { token, item, meta: meta ?? {}, holdMs: item.kind === 'image' ? IMAGE_HOLD_MS : 0 };
    this.queue.push(job);
    this.#pump();
    return { token, item: this.#public(item, { holdMs: job.holdMs, giftLabel: job.meta.giftLabel ?? null }) };
  }

  #pump() {
    if (this.playing || !this.queue.length) return;
    const job = this.queue.shift();
    this.playing = job;
    const payload = {
      type: 'mediaAlert',
      event: 'play',
      token: job.token,
      item: this.#public(job.item, { holdMs: job.holdMs, giftLabel: job.meta?.giftLabel ?? null }),
    };
    this.hub.broadcast(payload);
    this.bus?.emit('media.play', payload);
  }

  #public(item, extra = {}) {
    return {
      id: item.id,
      name: item.name,
      mime: item.mime,
      kind: item.kind,
      size: item.size,
      createdAt: item.createdAt,
      ...extra,
    };
  }

  #safeFile(item) {
    const name = item?.file;
    if (!item || !ID_RE.test(item.id) || typeof name !== 'string') return null;
    if (name.includes('/') || name.includes('\\') || name.includes('..')) return null;
    const root = path.resolve(this.dir);
    const full = path.resolve(this.dir, name);
    if (full !== root && !full.startsWith(root + path.sep)) return null;
    return full;
  }

  #load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.catalogFile, 'utf8'));
      const list = Array.isArray(data) ? data : data?.items;
      if (!Array.isArray(list)) return;
      for (const raw of list) {
        if (!raw || !ID_RE.test(String(raw.id || '')) || !MEDIA_MIME[raw.mime]) continue;
        const item = {
          id: String(raw.id),
          name: safeName(raw.name),
          mime: raw.mime,
          kind: MEDIA_MIME[raw.mime],
          size: Math.max(0, Number(raw.size) || 0),
          file: String(raw.file || ''),
          createdAt: Number(raw.createdAt) || 0,
        };
        if (!this.#safeFile(item)) continue;
        this.items.push(item);
      }
    } catch {}
  }

  #save() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      const items = this.items.map((item) => ({
        id: item.id,
        name: item.name,
        mime: item.mime,
        kind: item.kind,
        size: item.size,
        file: item.file,
        createdAt: item.createdAt,
      }));
      fs.writeFileSync(this.catalogFile, JSON.stringify({ items }, null, 2));
    } catch (err) {
      console.warn('[media-alerts] 保存できませんでした:', err.message);
    }
  }
}

function safeName(name) {
  const text = String(name || 'file').replace(/[^\w.\- ()\u3000-\u9fff]/g, '_').slice(0, 80);
  return text || 'file';
}

/**
 * gifts と minCoins は両方あるとき両方必要。
 * events の follow / share は、その出来事で再生する（ギフトの条件とは別）。
 * ギフト別サウンドも同じ判定を使う。
 */
export function ruleMatches(rule, e) {
  if (!rule?.mediaId) return false;
  const gifts = Array.isArray(rule.gifts) ? rule.gifts : [];
  const min = Number(rule.minCoins) || 0;
  const events = Array.isArray(rule.events) ? rule.events : [];
  const hasGift = gifts.length > 0;
  const hasMin = min > 0;
  const hasFollow = events.includes('follow');
  const hasShare = events.includes('share');
  if (!hasGift && !hasMin && !hasFollow && !hasShare) return false;
  if (e?.kind === 'follow') return hasFollow;
  if (e?.kind === 'share') return hasShare;
  if (e?.kind !== 'gift') return false;
  if (!hasGift && !hasMin) return false;
  if (hasGift && !giftMatches(e.gift, gifts)) return false;
  if (hasMin && (Number(e.totalDiamonds) || 0) < min) return false;
  return true;
}
