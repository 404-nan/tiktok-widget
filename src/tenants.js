// 契約している配信者の一覧（data/tenants.json）と、ウィジェットごとの「使える / 使えない」。
// 配信者ごとに、ダッシュボード用の鍵（key）と OBS 用の鍵（obsKey）を持つ。URL は /t/<鍵>/...
// ウィジェットは、配信者ごと・全員まとめて、ON / OFF を「ずっと」か「○時間だけ」で決められる（管理画面 /admin）。
// 期限が切れたら、初めの状態（豪華な演出は使えない、ほかは使える）に戻る。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createStore } from './config.js';
import { SECTIONS } from './schema.js';
import { createRuntime, FEATURES } from './runtime.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DATA_DIR = path.resolve(process.env.TW_DATA || path.join(root, 'data'));
const MEDIA_DIR = path.join(root, 'media');

const newKey = () => crypto.randomBytes(18).toString('base64url');
const newId = () => `t${crypto.randomBytes(5).toString('hex')}`;

// 配信者が最初に使えるウィジェット（豪華な演出は管理者がオンにしてから選べる）
export const DEFAULT_WIDGETS = ['alerts', 'chats', 'counters', 'goals', 'rankings', 'roulettes', 'jars', 'wins', 'minecraft', 'timers', 'bosses'];

/** 管理者が決めた ON / OFF: { on, until }（until が null ならずっと）。期限が切れたら無いのと同じ */
const live = (o, now = Date.now()) => Boolean(o) && typeof o.on === 'boolean' && (o.until == null || o.until > now);

// 前の形（premium: { 名前: { until } } = オン）を、新しい形（access: { 名前: { on, until } }）に直す
function migrate(holder) {
  if (!holder) return;
  holder.access ??= {};
  for (const [f, g] of Object.entries(holder.premium ?? {})) holder.access[f] ??= { on: true, until: g?.until ?? null, at: g?.at };
  delete holder.premium;
}

export class Tenants {
  constructor({ dir = DATA_DIR, onChange = () => {}, ai = null } = {}) {
    this.dir = dir;
    this.ai = ai; // 「AI にたのむ」（全員で同じキーを使う）
    this.file = path.join(dir, 'tenants.json');
    this.onChange = onChange;
    this.data = { tenants: [], global: { access: {} } };
    this.runtimes = new Map(); // id → runtime
    this.#load();
    // 期限が切れたら、その配信者の画面を読み込み直す（使えなくなったものは止まり、使えるようになったものは出る）
    this.lastState = new Map();
    this.timer = setInterval(() => this.#checkExpiry(), 15_000);
    this.timer.unref();
  }

  // --- 読み書き ---

  #load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = { tenants: d.tenants ?? [], global: { access: {}, ...d.global } };
      for (const t of this.data.tenants) migrate(t);
      migrate(this.data.global);
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

  // --- 使える / 使えない ---

  /**
   * そのウィジェット・演出の今の状態。配信者ごとの設定 → 全員の設定 → 初めの状態 の順に見る。
   * { on, until（いつまでか。null はずっと）, source: 'own' | 'everyone' | 'default' }
   */
  access(id, feature, now = Date.now()) {
    const def = FEATURES[feature];
    const own = this.get(id)?.access?.[feature];
    const all = this.data.global.access?.[feature];
    if (live(own, now)) return { on: own.on, until: own.until ?? null, source: 'own' };
    if (live(all, now)) return { on: all.on, until: all.until ?? null, source: 'everyone' };
    return { on: def ? !def.premium : true, until: null, source: 'default' };
  }

  /** 使えるか（知らない名前は使える） */
  entitled(id, feature) {
    if (!this.get(id)) return false;
    return this.access(id, feature).on;
  }

  /** 全部のウィジェット・演出の状態 */
  accessState(id) {
    return Object.fromEntries(Object.keys(FEATURES).map((f) => [f, this.access(id, f)]));
  }

  /** 全員まとめての設定（なければ初めの状態） */
  globalState() {
    return Object.fromEntries(
      Object.entries(FEATURES).map(([f, def]) => {
        const g = this.data.global.access?.[f];
        return [f, live(g) ? { on: g.on, until: g.until ?? null, source: 'everyone' } : { on: !def.premium, until: null, source: 'default' }];
      }),
    );
  }

  /**
   * 使える / 使えないを決める。
   * target: 配信者の id / 'global'（全員まとめて）/ 'everyone'（全員の配信者ごとの設定を書き換える）
   * feature: 名前 / 'all'（全部）/ 'premium'（豪華な演出だけ）
   * on: true（使える）/ false（使えない）/ null（決めたのを消して、全員の設定か初めの状態に戻す）
   * hours: 0 か省略でずっと、数ならその時間だけ（過ぎたら戻る）
   */
  setAccess(target, feature, on, hours = 0) {
    const features = feature === 'all' ? Object.keys(FEATURES) : feature === 'premium' ? Object.keys(FEATURES).filter((f) => FEATURES[f].premium) : [feature];
    if (!features.every((f) => FEATURES[f])) throw new Error(`名前は ${Object.keys(FEATURES).join(' / ')} か all / premium です`);
    if (on !== true && on !== false && on !== null) throw new Error('on は true / false / null のどれかです');
    const h = Number(hours) || 0;
    if (h < 0) throw new Error('時間は 0（ずっと）か、それより大きい数にしてください');
    const value = on === null ? null : { on, until: h > 0 ? Date.now() + h * 3600_000 : null, at: Date.now() };
    const apply = (holder) => {
      holder.access ??= {};
      for (const f of features) {
        if (value) holder.access[f] = value;
        else delete holder.access[f];
      }
    };
    if (target === 'global') apply(this.data.global);
    else if (target === 'everyone') for (const t of this.data.tenants) apply(t);
    else {
      const t = this.get(target);
      if (!t) throw new Error('その配信者は見つかりません');
      apply(t);
    }
    this.#save();
    this.#notify(target === 'global' || target === 'everyone' ? null : target);
  }

  /** 前の形の呼び方（mode: 'on' ずっと / 'for' hours 時間 / 'off'） */
  setPremium(target, feature, mode, hours = 0) {
    if (!['on', 'for', 'off'].includes(mode)) throw new Error('mode は on / for / off のどれかです');
    if (mode === 'for' && !(Number(hours) > 0)) throw new Error('何時間オンにするか（hours）を入れてください');
    this.setAccess(target, feature === 'all' ? 'premium' : feature, mode === 'off' ? false : true, mode === 'for' ? hours : 0);
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
      access: {},
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
      access: this.accessState(id),
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
      ai: this.ai,
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
      this.lastState.set(t.id, JSON.stringify(this.onMap(t.id)));
      this.runtimes.get(t.id)?.entitlementsChanged();
    }
    this.onChange(id);
  }

  onMap(id) {
    return Object.fromEntries(Object.keys(FEATURES).map((f) => [f, this.entitled(id, f)]));
  }

  #checkExpiry() {
    for (const t of this.data.tenants) {
      const now = JSON.stringify(this.onMap(t.id));
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
