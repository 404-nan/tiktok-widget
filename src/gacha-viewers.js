// ガチャの視聴者ごとの無料回・有料回。配信ごとか日本時間0時で無料回を戻し、ギフトのコインで有料回を足す。
import fs from 'node:fs';
import path from 'node:path';
import { defaultsFor } from './schema.js';
import { eventCoinTotal, giftMatches } from './gifts.js';

const HISTORY_SIZE = 20;
const VIEWER_LIMIT = 50;
const JST = 'Asia/Tokyo';

const DENY = {
  cooldown: 'まだ続けて回せません',
  'no-credits': '回数がありません',
  follow: 'フォローすると無料で回せます',
  disabled: 'ガチャはオフです',
  user: '視聴者が分かりません',
  '端数': 'コインが1回に足りません',
};

const int = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isInteger(n) && n >= 0 ? n : fallback;
};

function countOf(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return fallback;
  return Math.floor(n);
}

function fail(reason, extra = {}) {
  return { ok: false, reason, error: DENY[reason] || '回せませんでした', ...extra };
}

function emptyViewer(name = '') {
  return { name: String(name || '名無し'), free: { used: 0, resetAt: null }, paid: { credits: 0, used: 0 }, history: [] };
}

function blankViewer(viewer) {
  return viewer.free.used === 0 && viewer.paid.credits === 0 && viewer.paid.used === 0 && viewer.history.length === 0;
}

function cleanViewer(value) {
  const out = emptyViewer(value?.name);
  out.free.used = int(value?.free?.used);
  out.free.resetAt = Number.isFinite(Number(value?.free?.resetAt)) ? Number(value.free.resetAt) : null;
  out.paid.credits = int(value?.paid?.credits);
  out.paid.used = int(value?.paid?.used);
  out.history = Array.isArray(value?.history)
    ? value.history.slice(-HISTORY_SIZE).map((item) => ({
        tier: String(item?.tier ?? item?.tierId ?? 'none'),
        label: String(item?.label ?? item?.tier ?? '？'),
        at: String(item?.at ?? ''),
        cost: item?.cost === 'paid' ? 'paid' : 'free',
      }))
    : [];
  return out;
}

/** 視聴者の回数だけを保存する。書き込みはまとめ、途中ファイルは rename で隠す。 */
export class GachaViewerStore {
  constructor(file, { now = Date.now, debounceMs = 100 } = {}) {
    this.file = file;
    this.now = now;
    this.debounceMs = debounceMs;
    this.data = {};
    this.timer = null;
    this.dirty = false;
    this.#load();
  }

  #load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return;
      for (const [id, value] of Object.entries(raw)) this.data[String(id)] = cleanViewer(value);
    } catch {}
  }

  #touch() {
    this.dirty = true;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), this.debounceMs);
    this.timer.unref?.();
  }

  get(userId, name = '') {
    const id = String(userId ?? '').trim();
    if (!id) return null;
    const viewer = (this.data[id] ??= emptyViewer(name));
    if (name != null && String(name).trim()) viewer.name = String(name).trim();
    return viewer;
  }

  all() {
    return this.data;
  }

  /** 最後に無料回を戻した配信の roomId（再起動しても覚えておく）。 */
  #roomFile() {
    return this.file ? `${this.file.replace(/\.json$/, '')}-room.json` : null;
  }

  lastRoomId() {
    const file = this.#roomFile();
    if (!file) return this.memRoomId ?? null;
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
      return raw && raw.roomId != null ? String(raw.roomId) : null;
    } catch {
      return this.memRoomId ?? null;
    }
  }

  setLastRoomId(roomId) {
    this.memRoomId = String(roomId);
    const file = this.#roomFile();
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      const tmp = `${file}.tmp-${process.pid}`;
      fs.writeFileSync(tmp, `${JSON.stringify({ roomId: String(roomId), at: this.now() })}\n`, { mode: 0o600 });
      fs.renameSync(tmp, file);
    } catch {}
  }

  changed() {
    this.#touch();
  }

  flush() {
    clearTimeout(this.timer);
    this.timer = null;
    if (!this.dirty) return false;
    if (!Object.keys(this.data).length && !fs.existsSync(this.file)) {
      this.dirty = false;
      return false;
    }
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, this.file);
    fs.chmodSync(this.file, 0o600);
    this.dirty = false;
    return true;
  }

  close() {
    this.flush();
  }
}

function jstParts(now) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: JST, year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date(now));
  return Object.fromEntries(parts.filter((p) => p.type !== 'literal').map((p) => [p.type, Number(p.value)]));
}

function nextJstMidnight(now) {
  const p = jstParts(now);
  return Date.UTC(p.year, p.month - 1, p.day + 1) - 9 * 60 * 60 * 1000;
}

export function gachaResetAt(now = Date.now()) {
  return nextJstMidnight(now);
}

export class GachaViewers {
  #continuing = false;

  constructor(fileOrStore, { gacha, bus = null, now = Date.now } = {}) {
    this.store = fileOrStore && typeof fileOrStore.get === 'function' ? fileOrStore : new GachaViewerStore(fileOrStore, { now });
    this.gacha = gacha;
    this.bus = bus;
    this.now = now;
    this.config = defaultsFor('gacha');
    this.followers = new Set();
    this.lastSpin = new Map();
    this.lastActivity = new Map();
    // 途中で切れてつなぎ直した live は同じ配信。idle / ended / demo のあとは新しい配信。
    this.#continuing = false;
    this.offResult = bus?.on('gacha.reveal', (event) => this.#result(event));
  }

  setConfig(value) {
    this.config = { ...defaultsFor('gacha'), ...(value || {}) };
    this.config.paidRule = { ...defaultsFor('gacha').paidRule, ...(value?.paidRule || {}) };
  }

  #id(user) {
    return String(user?.id || user?.name || '').trim();
  }

  #command() {
    return String(this.config.command || '!ガチャ').trim() || '!ガチャ';
  }

  #freeLimit() {
    return countOf(this.config.freePerReset, 1);
  }

  #refresh(viewer, now) {
    if (this.config.resetMode !== 'daily') return;
    if (viewer.free.resetAt && now < viewer.free.resetAt) return;
    const resetAt = nextJstMidnight(now);
    if (viewer.free.used === 0 && viewer.free.resetAt === resetAt) return;
    viewer.free.used = 0;
    viewer.free.resetAt = resetAt;
    this.store.changed();
  }

  #viewer(user, now = this.now()) {
    const id = this.#id(user);
    if (!id) return null;
    const created = !Object.prototype.hasOwnProperty.call(this.store.all(), id);
    const viewer = this.store.get(id, user?.name);
    this.#refresh(viewer, now);
    this.lastActivity.set(id, now);
    return { id, viewer, created };
  }

  #forget(found) {
    if (!found?.created || !blankViewer(found.viewer)) return;
    delete this.store.all()[found.id];
    this.lastActivity.delete(found.id);
  }

  #activity(id) {
    const viewer = this.store.all()[id];
    const mem = this.lastActivity.get(id) || 0;
    const at = viewer?.history?.length ? Date.parse(viewer.history[viewer.history.length - 1].at) : 0;
    return Math.max(mem, Number.isFinite(at) ? at : 0);
  }

  onStatus(status, previous = {}) {
    const mode = status?.mode;
    const before = previous?.mode;
    // runtime の再接続判定と同じ。error を挟んでも、配信終了までは同じ配信。
    if (mode === 'connecting' && before === 'live') this.#continuing = true;
    else if (mode === 'idle' || mode === 'ended' || mode === 'demo') this.#continuing = false;
    else if (mode === 'connecting' && (before === 'idle' || before === 'ended' || before === 'demo')) this.#continuing = false;

    if (mode !== 'live' || before === 'live') return;
    // roomId が分かるときは「本当に新しい配信か」で決める。再起動後の再接続（同じ room）では戻さない。
    const roomId = status?.roomId != null && String(status.roomId) !== '' ? String(status.roomId) : null;
    if (roomId && typeof this.store.lastRoomId === 'function') {
      this.#continuing = true;
      if (this.store.lastRoomId() === roomId) return;
      this.store.setLastRoomId(roomId);
      this.followers.clear();
      if (this.config.resetMode === 'stream') this.resetFree();
      return;
    }
    const continuing = this.#continuing && before !== 'idle' && before !== 'ended' && before !== 'demo';
    this.#continuing = true;
    if (continuing) return;
    this.followers.clear();
    if (this.config.resetMode === 'stream') this.resetFree();
  }

  onEvent(event) {
    if (this.config.enabled === false || !event) return null;
    const user = event.user;
    if (event.kind === 'follow') {
      const id = this.#id(user);
      if (id) this.followers.add(id);
      return null;
    }
    if (event.kind === 'gift') return this.#gift(event);
    if (event.kind === 'chat' && String(event.text ?? '').trim() === this.#command()) return this.spin(user, { source: 'comment' });
    return null;
  }

  #gift(event) {
    const rule = this.config.paidRule || {};
    const gifts = Array.isArray(rule.gifts) ? rule.gifts : [];
    const coins = Math.max(0, Number(eventCoinTotal(event)) || 0);
    const minCoins = Math.max(0, Number(rule.minCoins) || 0);
    const matchedGift = gifts.length > 0 && giftMatches(event.gift, gifts);
    const matchedCoins = minCoins > 0 && coins >= minCoins;
    if (!matchedGift && !matchedCoins) return null;
    const perRaw = Number(rule.spinsPerCoins);
    const per = Number.isFinite(perRaw) && perRaw >= 1 ? Math.floor(perRaw) : 100;
    const credits = Math.floor(coins / per);
    if (!credits) return fail('端数', { credits: 0 });
    const found = this.#viewer(event.user, this.now());
    if (!found) return fail('user');
    found.viewer.paid.credits += credits;
    this.store.changed();
    return { ok: true, credits, viewer: this.public(found.id) };
  }

  spin(user, { source = 'comment', dev = false, prefer = null } = {}) {
    if (this.config.enabled === false || !this.gacha) return fail('disabled');
    const now = this.now();
    const found = this.#viewer(user, now);
    if (!found) return fail('user');
    const cooldown = Math.max(0, Number(this.config.cooldownSec) || 0) * 1000;
    const last = this.lastSpin.get(found.id);
    if (!dev && last != null && now - last < cooldown) {
      this.#forget(found);
      return fail('cooldown', { waitMs: cooldown - Math.max(0, now - last) });
    }

    const freeAllowed = this.config.freeRequires !== 'follow' || this.followers.has(found.id) || dev;
    const freeLeft = freeAllowed && found.viewer.free.used < this.#freeLimit();
    const paidLeft = found.viewer.paid.credits > 0;
    let cost = null;
    if (prefer === 'paid') cost = paidLeft ? 'paid' : null;
    else if (prefer === 'free') cost = freeLeft ? 'free' : null;
    else if (freeLeft) cost = 'free';
    else if (paidLeft) cost = 'paid';
    if (!cost) {
      this.#forget(found);
      return fail(!freeAllowed && !paidLeft ? 'follow' : 'no-credits');
    }

    const started = this.gacha.start({
      kind: 'viewer',
      source,
      cost,
      user: { id: found.id, name: found.viewer.name },
    });
    if (!started || started.ok === false) {
      this.#forget(found);
      return fail(started?.reason || 'disabled');
    }
    if (cost === 'free') found.viewer.free.used += 1;
    else {
      found.viewer.paid.credits -= 1;
      found.viewer.paid.used += 1;
    }
    this.lastSpin.set(found.id, now);
    this.store.changed();
    return { ...started, cost, viewer: this.public(found.id) };
  }

  devSpin(user, paid = false) {
    const id = this.#id(user);
    if (!id) return fail('user');
    if (this.config.enabled === false || !this.gacha) return fail('disabled');
    if (paid) {
      const viewer = this.store.get(id, user.name);
      viewer.paid.credits += 1;
      this.store.changed();
      return this.spin(user, { source: 'dev', dev: true, prefer: 'paid' });
    }
    return this.spin(user, { source: 'dev', dev: true, prefer: 'free' });
  }

  adjust(userId, amount, type = 'paid') {
    const n = Number(amount);
    if (!Number.isInteger(n) || n === 0) throw new Error('回数は 0 以外の整数にしてください');
    const id = String(userId ?? '').trim();
    const viewer = id ? this.store.all()[id] : null;
    if (!viewer) return null;
    if (type === 'free') viewer.free.used = Math.max(0, viewer.free.used - n);
    else viewer.paid.credits = Math.max(0, viewer.paid.credits + n);
    this.lastActivity.set(id, this.now());
    this.store.changed();
    return this.public(id);
  }

  resetFree() {
    const resetAt = this.config.resetMode === 'daily' ? nextJstMidnight(this.now()) : this.now();
    for (const viewer of Object.values(this.store.all())) {
      viewer.free.used = 0;
      viewer.free.resetAt = resetAt;
    }
    this.store.changed();
  }

  public(id) {
    const viewer = this.store.all()[id];
    if (!viewer) return null;
    this.#refresh(viewer, this.now());
    const recent = viewer.history.slice(-HISTORY_SIZE).reverse();
    return {
      userId: id,
      name: viewer.name,
      free: { used: viewer.free.used, remaining: Math.max(0, this.#freeLimit() - viewer.free.used), resetAt: viewer.free.resetAt },
      paid: { credits: viewer.paid.credits, used: viewer.paid.used },
      history: recent,
    };
  }

  list() {
    return Object.keys(this.store.all())
      .sort((a, b) => {
        const byTime = this.#activity(b) - this.#activity(a);
        if (byTime) return byTime;
        const byPaid = (this.store.all()[b]?.paid?.credits || 0) - (this.store.all()[a]?.paid?.credits || 0);
        if (byPaid) return byPaid;
        return String(this.store.all()[a]?.name || '').localeCompare(String(this.store.all()[b]?.name || ''), 'ja');
      })
      .slice(0, VIEWER_LIMIT)
      .map((id) => this.public(id));
  }

  snapshot() {
    return {
      viewers: this.list(),
      total: Object.keys(this.store.all()).length,
      freePerReset: this.#freeLimit(),
      resetMode: this.config.resetMode,
      command: this.#command(),
    };
  }

  close() {
    this.offResult?.();
    this.store.close?.();
  }

  #result(event) {
    const trigger = event?.trigger;
    if (trigger?.kind !== 'viewer') return;
    const id = this.#id(trigger.user);
    if (!id) return;
    const viewer = this.store.get(id, trigger.user.name);
    viewer.history.push({
      tier: String(event.tier?.id ?? 'none'),
      label: String(event.tier?.label ?? event.tier?.id ?? '？'),
      at: new Date(event.ts || this.now()).toISOString(),
      cost: trigger.cost === 'paid' ? 'paid' : 'free',
    });
    viewer.history = viewer.history.slice(-HISTORY_SIZE);
    this.store.changed();
  }
}
