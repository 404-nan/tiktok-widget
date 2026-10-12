// 契約している配信者の一覧（data/tenants.json）と、豪華な演出のオン/オフ。
// 配信者ごとに、ダッシュボード用の鍵（key）と OBS 用の鍵（obsKey）を持つ。URL は /t/<鍵>/...
// 豪華な演出は、配信者ごと・全員まとめて、ずっとオン／期限つきでオン にできる（管理画面 /admin）。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStore } from './config.js';
import { SECTIONS } from './schema.js';
import { createRuntime, PREMIUM } from './runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(process.env.TW_DATA || path.join(root, 'data'));
const MEDIA_DIR = path.join(root, 'media');

const newKey = () => crypto.randomBytes(18).toString('base64url');
const newId = () => `t${crypto.randomBytes(5).toString('hex')}`;

// 配信者が最初に使えるウィジェット（豪華な演出は管理者がオンにしてから選べる）
export const DEFAULT_WIDGETS = ['alerts', 'chats', 'counters', 'goals', 'rankings', 'roulettes', 'jars', 'wins', 'minecraft'];

/** 期限つきのオン: { until: null }（ずっと）/ { until: 時刻 } / なし（オフ） */
const active = (grant, now = Date.now()) => Boolean(grant) && (grant.until == null || grant.until > now);

export class Tenants {
  constructor({ dir = DATA_DIR, onChange = () => {} } = {}) {
    this.dir = dir;
    this.file = path.join(dir, 'tenants.json');
    this.onChange = onChange;
    this.data = { tenants: [], global: { premium: {} } };
    this.runtimes = new Map(); // id → runtime
    this.#load();
    // 期限が切れたら、その配信者の画面を読み込み直す（豪華な演出が止まる）
    this.lastState = new Map();
    this.timer = setInterval(() => this.#checkExpiry(), 15_000);
    this.timer.unref();
  }

  // --- 読み書き ---

  #load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = { tenants: d.tenants ?? [], global: { premium: {}, ...d.global } };
    } catch {}
  }

  #save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  list() {
    return this.data.tenants;
  }

  get(id) {
    return this.data.tenants.find((t) => t.id === id) ?? null;
  }

  /** URL の鍵から配信者と役割（owner: ダッシュボード / obs: OBS）を探す */
  byKey(key) {
    for (const t of this.data.tenants) {
      if (safeEqual(t.key, key)) return { tenant: t, role: 'owner' };
      if (safeEqual(t.obsKey, key)) return { tenant: t, role: 'obs' };
    }
    return null;
  }

  // --- 豪華な演出 ---

  /** その配信者が豪華な演出を使えるか（配信者ごとのオン か 全員のオン） */
  entitled(id, feature) {
    const t = this.get(id);
    if (!t || !PREMIUM[feature]) return Boolean(t) && !PREMIUM[feature];
    return active(t.premium?.[feature]) || active(this.data.global.premium?.[feature]);
  }

  /** 豪華な演出ごとの状態（いつまでか、全員の設定から来ているか） */
  premiumState(id) {
    const t = this.get(id);
    const now = Date.now();
    const out = {};
    for (const f of Object.keys(PREMIUM)) {
      const own = t?.premium?.[f];
      const all = this.data.global.premium?.[f];
      const ownOn = active(own, now);
      const allOn = active(all, now);
      // 長いほうの期限を見せる
      const until = ownOn && own.until == null ? null : allOn && all.until == null ? null : Math.max(ownOn ? own.until : 0, allOn ? all.until : 0) || null;
      out[f] = { active: ownOn || allOn, until: ownOn || allOn ? until : null, own: ownOn ? own : null, everyone: allOn ? all : null };
    }
    return out;
  }

  /**
   * 豪華な演出をオン/オフする。
   * target: 配信者の id / 'global'（全員のオン。配信者ごとの設定はそのまま）/ 'everyone'（全員の配信者ごとの設定を書き換える）
   * feature: PREMIUM の名前か 'all'、mode: 'on'（ずっと）/ 'for'（hours 時間）/ 'off'
   */
  setPremium(target, feature, mode, hours = 0) {
    const features = feature === 'all' ? Object.keys(PREMIUM) : [feature];
    if (!features.every((f) => PREMIUM[f])) throw new Error(`演出の名前は ${Object.keys(PREMIUM).join(' / ')} か all です`);
    if (!['on', 'for', 'off'].includes(mode)) throw new Error('mode は on / for / off のどれかです');
    if (mode === 'for' && !(Number(hours) > 0)) throw new Error('何時間オンにするか（hours）を入れてください');
    const grant = mode === 'off' ? null : { until: mode === 'on' ? null : Date.now() + Number(hours) * 3600_000, at: Date.now() };
    const apply = (premium) => {
      for (const f of features) {
        if (grant) premium[f] = grant;
        else delete premium[f];
      }
    };
    if (target === 'global') apply((this.data.global.premium ??= {}));
    else if (target === 'everyone') for (const t of this.data.tenants) apply((t.premium ??= {}));
    else {
      const t = this.get(target);
      if (!t) throw new Error('その配信者は見つかりません');
      apply((t.premium ??= {}));
    }
    this.#save();
    this.#notify(target === 'global' || target === 'everyone' ? null : target);
  }

  // --- 配信者の追加・変更 ---

  create({ name }) {
    const t = {
      id: newId(),
      name: String(name ?? '').trim() || '名前なし',
      key: newKey(),
      obsKey: newKey(),
      enabled: true,
      widgets: [...DEFAULT_WIDGETS],
      premium: {},
      createdAt: Date.now(),
    };
    this.data.tenants.push(t);
    this.#save();
    return t;
  }

  update(id, patch) {
    const t = this.get(id);
    if (!t) throw new Error('その配信者は見つかりません');
    if (patch.name != null) t.name = String(patch.name).trim() || t.name;
    if (patch.enabled != null) t.enabled = Boolean(patch.enabled);
    if (Array.isArray(patch.widgets)) t.widgets = patch.widgets.filter((w) => SECTIONS.includes(w));
    this.#save();
    if (patch.enabled === false) this.close(id);
    else this.#notify(id);
    return t;
  }

  /** 鍵を作り直す（URL が漏れたとき）。古い URL は使えなくなる */
  rekey(id, which = 'both') {
    const t = this.get(id);
    if (!t) throw new Error('その配信者は見つかりません');
    if (which === 'both' || which === 'key') t.key = newKey();
    if (which === 'both' || which === 'obs') t.obsKey = newKey();
    this.#save();
    return t;
  }

  async remove(id) {
    await this.close(id);
    this.data.tenants = this.data.tenants.filter((t) => t.id !== id);
    this.#save();
  }

  // --- 配信者ごとの仕組み（runtime） ---

  dataDir(id) {
    return path.join(this.dir, 'tenants', id);
  }

  /** 配信者の情報（ダッシュボードの /api/me） */
  info(id) {
    const t = this.get(id);
    return {
      mode: 'tenant',
      id,
      name: t?.name ?? '',
      widgets: t?.widgets ?? [],
      premium: this.premiumState(id),
    };
  }

  runtime(id) {
    let rt = this.runtimes.get(id);
    if (rt) return rt;
    const dir = this.dataDir(id);
    rt = createRuntime({
      id,
      store: createStore(path.join(dir, 'config.yaml')),
      dataDir: dir,
      mediaDirs: [path.join(dir, 'media'), MEDIA_DIR],
      entitled: (f) => this.entitled(id, f),
      info: () => this.info(id),
      setWidgets: (list) => this.update(id, { widgets: list }),
      widgetBase: (origin) => `${origin}/t/${this.get(id)?.obsKey}`,
    });
    this.runtimes.set(id, rt);
    return rt;
  }

  async close(id) {
    const rt = this.runtimes.get(id);
    if (!rt) return;
    this.runtimes.delete(id);
    await rt.close();
  }

  // 配信者の画面に「変わったよ」と知らせる（id を省くと全員）
  #notify(id) {
    for (const t of this.data.tenants) {
      if (id && t.id !== id) continue;
      this.lastState.set(t.id, JSON.stringify(this.premiumActiveMap(t.id)));
      this.runtimes.get(t.id)?.entitlementsChanged();
    }
    this.onChange(id);
  }

  premiumActiveMap(id) {
    return Object.fromEntries(Object.keys(PREMIUM).map((f) => [f, this.entitled(id, f)]));
  }

  #checkExpiry() {
    for (const t of this.data.tenants) {
      const now = JSON.stringify(this.premiumActiveMap(t.id));
      const before = this.lastState.get(t.id);
      this.lastState.set(t.id, now);
      if (before != null && before !== now) this.runtimes.get(t.id)?.entitlementsChanged();
    }
  }
}

function safeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
