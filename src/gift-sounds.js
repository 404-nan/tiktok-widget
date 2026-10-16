// ギフト・フォロー・シェアで効果音を重ねて鳴らす。
// 音源はメディア通知（MediaAlerts）の catalog のうち音声だけを使う。保存先は増やさない。
// どの音を鳴らすかはここで決め、画面（/widgets/sounds.html）は届いたものを鳴らすだけ。

import crypto from 'node:crypto';
import { giftDisplayName } from './gifts.js';
import { ruleMatches } from './media-alerts.js';

export const GIFT_SOUND_QUEUE = 10;
export const GIFT_SOUND_AUTOPLAY_NOTE = 'LIVE Studio のソース設定で音声を有効にしてください';

export function clampRange(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export function clampInt(value, min, max, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** 再生する音量（0〜1）。全体 × ルール。どちらも 0〜100 */
export function soundGain(master, rule) {
  return (clampRange(master, 0, 100, 80) / 100) * (clampRange(rule, 0, 100, 100) / 100);
}

/** 連打の途中だけ飛ばす。repeatEnd が無い正規化済みのギフトは、終わった1回として鳴らす */
export function comboStillGoing(e) {
  if (e?.kind !== 'gift' || e.repeatEnd == null || e.repeatEnd === '') return false;
  return e.repeatEnd === false || e.repeatEnd === 0 || e.repeatEnd === '0';
}

function labelFor(e) {
  if (e?.kind === 'gift') return giftDisplayName(e.gift);
  if (e?.kind === 'follow') return 'フォロー';
  if (e?.kind === 'share') return 'シェア';
  return '';
}

export class GiftSounds {
  constructor({ media, hub }) {
    this.media = media;
    this.hub = hub;
    this.config = { enabled: true, masterVolume: 80, maxSeconds: 8, maxConcurrent: 3, rules: [] };
    this.playing = [];
    this.queue = [];
    this.recent = [];
    this.autoplay = { muted: false, note: null };
  }

  setConfig(cfg) {
    const rules = Array.isArray(cfg?.rules) ? cfg.rules.map((rule) => ({
      ...rule,
      volume: clampRange(rule?.volume, 0, 100, 100),
    })) : [];
    this.config = {
      enabled: cfg?.enabled !== false,
      masterVolume: clampRange(cfg?.masterVolume, 0, 100, 80),
      maxSeconds: clampInt(cfg?.maxSeconds, 1, 30, 8),
      maxConcurrent: clampInt(cfg?.maxConcurrent, 1, 5, 3),
      rules,
    };
  }

  snapshot() {
    return {
      enabled: this.config.enabled !== false,
      masterVolume: this.config.masterVolume,
      maxSeconds: this.config.maxSeconds,
      maxConcurrent: this.#limit(),
      playing: this.playing.map((job) => this.#public(job)),
      queue: this.queue.map((job) => this.#public(job)),
      recent: this.recent.slice(0, 5),
      autoplay: this.autoplay,
    };
  }

  /** ルーレットの動作や開発用。音声が無いときはエラー。オフでも直接なら鳴らせる */
  play(mediaId, meta = {}) {
    const item = this.#audio(mediaId);
    if (!item) throw new Error('音声が見つかりません');
    return this.#enqueue(item, {
      volume: clampRange(meta.volume, 0, 100, 100),
      source: meta.source ?? 'action',
      label: meta.label ?? item.name,
    });
  }

  /** 上から最初に合った1件だけ。ファイルが無ければ鳴らさず、次のルールにも進まない */
  onEvent(e) {
    if (this.config.enabled === false) return;
    if (comboStillGoing(e)) return;
    for (const rule of this.config.rules) {
      if (!ruleMatches(rule, e)) continue;
      const item = this.#audio(rule.mediaId);
      if (!item) return;
      this.#enqueue(item, {
        volume: clampRange(rule.volume, 0, 100, 100),
        source: e.kind,
        label: labelFor(e),
      });
      return;
    }
  }

  ack(token) {
    return this.#finish(String(token || ''));
  }

  reportAutoplay({ muted }) {
    this.autoplay = muted
      ? { muted: true, note: GIFT_SOUND_AUTOPLAY_NOTE }
      : { muted: false, note: null };
    this.hub.broadcast({ type: 'giftSound', event: 'autoplay', autoplay: this.autoplay });
    return this.autoplay;
  }

  close() {
    for (const job of this.playing) clearTimeout(job.timer);
    this.playing = [];
    this.queue = [];
  }

  #limit() {
    return clampInt(this.config.maxConcurrent, 1, 5, 3);
  }

  #audio(mediaId) {
    const info = this.media?.fileInfo?.(String(mediaId || ''));
    if (!info || info.item?.kind !== 'audio') return null;
    return info.item;
  }

  #enqueue(item, meta) {
    const token = crypto.randomBytes(8).toString('hex');
    const job = { token, item, meta, volume: meta.volume };
    if (this.playing.length < this.#limit()) this.#start(job);
    else {
      while (this.queue.length >= GIFT_SOUND_QUEUE) this.queue.shift();
      this.queue.push(job);
    }
    return this.#public(job);
  }

  #start(job) {
    this.playing.push(job);
    const payload = { type: 'giftSound', event: 'play', ...this.#public(job) };
    this.recent.unshift({
      at: Date.now(),
      mediaId: job.item.id,
      name: job.item.name,
      label: job.meta.label || job.item.name,
      volume: job.volume,
    });
    this.recent.length = Math.min(this.recent.length, 5);
    this.hub.broadcast(payload);
    const ms = this.config.maxSeconds * 1000;
    job.timer = setTimeout(() => this.#finish(job.token), ms);
    job.timer.unref?.();
  }

  #finish(token) {
    const index = this.playing.findIndex((job) => job.token === token);
    if (index < 0) return false;
    const [job] = this.playing.splice(index, 1);
    clearTimeout(job.timer);
    this.#pump();
    return true;
  }

  #pump() {
    while (this.playing.length < this.#limit() && this.queue.length) this.#start(this.queue.shift());
  }

  #public(job) {
    return {
      token: job.token,
      mediaId: job.item.id,
      name: job.item.name,
      volume: job.volume,
      masterVolume: this.config.masterVolume,
      maxSeconds: this.config.maxSeconds,
      maxConcurrent: this.#limit(),
      giftLabel: job.meta?.label || null,
      queued: this.queue.some((entry) => entry.token === job.token),
    };
  }
}
