// 視聴者ポイントの基盤。コメント・いいね・フォロー・ギフト・滞在で貯まり、
// おみくじ/ガチャをポイントで引くことと、!ポイント での残高確認に使う。
// 保存は配信者ごとの points.json（残高・累計・レベル）。履歴は points-log.jsonl に1行ずつ残す。
// イベントの受け口は Hub の 'event' に相乗りする（新しい接続は作らない）。
import fs from 'node:fs';
import path from 'node:path';
import { defaultsFor } from './schema.js';
import { eventCoinTotal } from './gifts.js';
import { recordError } from './error-log.js';

const isDemo = (event) => event?.test === true || String(event?.user?.id ?? '').startsWith('demo_');
const keyOf = (user) => String(user?.id || user?.name || '').trim();
const int = (value, fallback = 0) => {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

function emptyUser(name = '') {
  return {
    name: String(name || ''),
    balance: 0,
    total: 0,
    lastCommentAt: 0,
    likeCarry: 0,
    staySince: null,
    stayUnits: 0,
    stayLastSeen: 0,
  };
}

function cleanUser(value) {
  const out = emptyUser(value?.name);
  out.balance = int(value?.balance);
  out.total = int(value?.total);
  out.lastCommentAt = int(value?.lastCommentAt);
  out.likeCarry = int(value?.likeCarry);
  out.staySince = Number.isFinite(Number(value?.staySince)) && value?.staySince != null ? Number(value.staySince) : null;
  out.stayUnits = int(value?.stayUnits);
  out.stayLastSeen = int(value?.stayLastSeen);
  return out;
}

export class Points {
  constructor(hub, { file = null, logFile = null, now = Date.now, omikuji = null, stayTickMs = 60_000, saveDebounceMs = 250 } = {}) {
    this.hub = hub;
    this.file = file;
    this.logFile = logFile ?? (file ? path.join(path.dirname(file), 'points-log.jsonl') : null);
    this.now = now;
    this.omikuji = omikuji;
    this.config = defaultsFor('points');
    this.users = {};
    this.dirty = false;
    this.saveTimer = null;
    this.saveDebounceMs = saveDebounceMs;
    this.stopped = false;
    this.#load();
    this.onEvent = (event) => this.handleEvent(event);
    hub.on?.('event', this.onEvent);
    this.stayTimer = setInterval(() => this.stayTick(), stayTickMs);
    this.stayTimer.unref?.();
  }

  setOmikuji(omikuji) {
    this.omikuji = omikuji ?? null;
  }

  setConfig(cfg) {
    this.config = { ...defaultsFor('points'), ...(cfg ?? {}) };
  }

  enabled() {
    return this.config.enabled !== false && !this.stopped;
  }

  // --- 中核（add / spend / balance / ranking） ---

  #record(user) {
    const key = keyOf(user);
    if (!key) return null;
    const found = (this.users[key] ??= emptyUser(typeof user === 'object' ? user?.name : ''));
    if (user && typeof user === 'object' && user.name) found.name = String(user.name);
    return { key, user: found };
  }

  #peek(userId) {
    const key = String(userId ?? '').trim();
    return key ? this.users[key] ?? null : null;
  }

  #change(user, delta, reason, { earn = false } = {}) {
    const found = this.#record(user);
    if (!found || delta === 0) return found ? { key: found.key, balance: found.user.balance } : null;
    found.user.balance = Math.max(0, found.user.balance + delta);
    if (earn && delta > 0) found.user.total += delta;
    this.dirty = true;
    this.#scheduleSave();
    this.#log(found.key, delta, reason, found.user.balance);
    this.hub?.broadcast?.({
      type: 'points',
      user: { id: found.key, name: found.user.name },
      delta,
      reason,
      balance: found.user.balance,
      total: found.user.total,
      level: this.levelOf(found.key),
    });
    return { key: found.key, balance: found.user.balance };
  }

  /** ポイントを足す（獲得は累計にも積む）。戻り値は新しい残高。 */
  add(user, amount, reason = 'add') {
    const n = int(amount);
    if (!this.enabled() || n <= 0) return this.balance(keyOf(user));
    const result = this.#change(user, n, reason, { earn: true });
    return result?.balance ?? 0;
  }

  /** ポイントを使う。残高不足なら失敗して残高は変えない（負にはならない）。 */
  spend(user, amount, reason = 'spend') {
    const n = int(amount);
    const key = keyOf(user);
    if (!key || n <= 0) return { ok: false, reason: 'invalid', balance: this.balance(key) };
    const current = this.balance(key);
    if (current < n) return { ok: false, reason: 'insufficient', balance: current };
    if (user && typeof user === 'object') this.#record(user);
    const result = this.#change(typeof user === 'object' ? user : { id: key }, -n, reason);
    return { ok: true, balance: result?.balance ?? current - n };
  }

  /** 失敗した引き換えの返金。残高だけ戻し、累計（レベル）には積まない。 */
  refund(user, amount, reason = 'refund') {
    const n = int(amount);
    if (n <= 0) return this.balance(keyOf(user));
    const result = this.#change(user, n, reason);
    return result?.balance ?? 0;
  }

  balance(userId) {
    return this.#peek(userId)?.balance ?? 0;
  }

  totalOf(userId) {
    return this.#peek(userId)?.total ?? 0;
  }

  /** レベルは累計獲得だけから決まる表示専用の数字（既定は累計100ごとに+1）。 */
  levelOf(userId) {
    const every = Math.max(1, int(this.config.levelEvery, 100) || 100);
    return 1 + Math.floor(this.totalOf(userId) / every);
  }

  ranking(limit = 20) {
    const n = Math.max(0, int(limit, 20));
    return Object.entries(this.users)
      .map(([userId, user]) => ({ userId, name: user.name, balance: user.balance, total: user.total, level: this.levelOf(userId) }))
      .sort((a, b) => b.balance - a.balance || b.total - a.total || String(a.userId).localeCompare(String(b.userId)))
      .slice(0, n);
  }

  rankOf(userId) {
    const key = String(userId ?? '').trim();
    if (!key || !this.users[key]) return null;
    const all = Object.entries(this.users)
      .map(([id, user]) => ({ userId: id, balance: user.balance, total: user.total }))
      .sort((a, b) => b.balance - a.balance || b.total - a.total || String(a.userId).localeCompare(String(b.userId)));
    const index = all.findIndex((row) => row.userId === key);
    return index >= 0 ? index + 1 : null;
  }

  snapshot() {
    return {
      enabled: this.enabled(),
      users: Object.keys(this.users).length,
      ranking: this.ranking(20),
    };
  }

  // --- イベントからの付与 ---

  handleEvent(event) {
    if (!this.enabled() || !event || isDemo(event)) return null;
    const user = event.user;
    const key = keyOf(user);
    if (!key) return null;
    const now = this.now();
    switch (event.kind) {
      case 'chat':
        return this.#chat(event, key, now);
      case 'like': {
        this.#touchStay(key, user, now);
        const carry = (this.#peek(key)?.likeCarry ?? 0) + Math.max(0, Number(event.count) || 0);
        const every = Math.max(1, int(this.config.likeEvery, 100) || 100);
        const units = Math.floor(carry / every);
        const found = this.#record({ id: key, name: user?.name });
        if (found) {
          found.user.likeCarry = carry - units * every;
          this.dirty = true;
          this.#scheduleSave();
        }
        if (units > 0) this.add({ id: key, name: user?.name }, units * int(this.config.likePoints, 1), 'like');
        return null;
      }
      case 'follow':
        this.#touchStay(key, user, now);
        this.add(user, int(this.config.followPoints, 10), 'follow');
        return null;
      case 'gift': {
        this.#touchStay(key, user, now);
        const coins = Math.max(0, Number(eventCoinTotal(event)) || 0);
        const points = Math.floor(coins * Math.max(0, Number(this.config.giftMultiplier) || 0));
        if (points > 0) this.add(user, points, 'gift');
        return null;
      }
      case 'member':
        this.#touchStay(key, user, now);
        return null;
      default:
        return null;
    }
  }

  #chat(event, key, now) {
    const text = String(event.text ?? '').trim();
    const user = event.user;
    if (text === String(this.config.command || '!ポイント').trim()) return this.reply(user);
    if (text === String(this.config.omikujiCommand || '!おみくじ').trim()) return this.drawOmikuji(user);
    this.#touchStay(key, user, now);
    // コメントの付与は連投対策の間隔を空ける（コマンドには付けない）
    const cooldownMs = Math.max(0, int(this.config.commentCooldownSec, 10)) * 1000;
    const found = this.#record(user);
    if (!found) return null;
    if (now - found.user.lastCommentAt < cooldownMs) return null;
    found.user.lastCommentAt = now;
    this.dirty = true;
    this.#scheduleSave();
    this.add(user, int(this.config.commentPoints, 1), 'comment');
    return null;
  }

  /** !ポイント への返事。残高・累計・レベル・順位を画面へ流し、呼び出し元へも返す。 */
  reply(user) {
    const key = keyOf(user);
    if (!key) return null;
    this.#record(user);
    const result = {
      user: { id: key, name: this.users[key]?.name ?? String(user?.name ?? '') },
      balance: this.balance(key),
      total: this.totalOf(key),
      level: this.levelOf(key),
      rank: this.rankOf(key),
    };
    this.hub?.broadcast?.({ type: 'points', reply: true, ...result });
    return result;
  }

  /** おみくじをポイントで引く。引けなかったら払った分はそのまま戻す。 */
  drawOmikuji(user) {
    const key = keyOf(user);
    if (!key) return { ok: false, reason: 'user' };
    const cost = int(this.config.omikujiCost, 0);
    if (!this.omikuji || cost <= 0) return { ok: false, reason: 'disabled', balance: this.balance(key) };
    const paid = this.spend(user, cost, 'omikuji');
    if (!paid.ok) return { ok: false, reason: 'insufficient', balance: paid.balance, cost };
    const started = this.omikuji.start({ kind: 'points', source: 'points', cost: 'points', user: { id: key, name: this.users[key]?.name ?? String(user?.name ?? '') } });
    if (!started || started.ok === false) {
      this.refund(user, cost, 'omikuji-refund');
      return { ok: false, reason: started?.reason || 'disabled', balance: this.balance(key), cost };
    }
    return { ok: true, balance: this.balance(key), cost, started };
  }

  // --- 滞在 ---

  #touchStay(key, user, now) {
    const found = this.#record({ id: key, name: user?.name });
    if (!found) return;
    if (!found.user.staySince) {
      found.user.staySince = now;
      found.user.stayUnits = 0;
    }
    found.user.stayLastSeen = now;
    this.dirty = true;
    this.#scheduleSave();
  }

  /** 接続中の視聴者に、滞在の区切り（既定5分）ごとにポイントを付ける。 */
  stayTick(at = this.now()) {
    if (!this.enabled()) return;
    const spanMs = Math.max(1, int(this.config.stayMinutes, 5)) * 60_000;
    const graceMs = 2 * 60_000; // 直近2分に動きがあった人だけを「まだいる」とみなす
    for (const [key, user] of Object.entries(this.users)) {
      if (!user.staySince) continue;
      if (at - user.stayLastSeen > graceMs) {
        user.staySince = null;
        user.stayUnits = 0;
        this.dirty = true;
        continue;
      }
      const units = Math.floor((at - user.staySince) / spanMs);
      if (units > user.stayUnits) {
        const gained = units - user.stayUnits;
        user.stayUnits = units;
        this.add({ id: key, name: user.name }, gained * int(this.config.stayPoints, 2), 'stay');
      }
    }
    if (this.dirty) this.#scheduleSave();
  }

  /** 滞在の区切りを何個終えたか（確率アップ第2段の材料）。今も滞在中の人だけを数え、記録は作らない。 */
  stayUnitsFor(user) {
    const found = this.#peek(keyOf(user));
    if (!found?.staySince) return 0;
    if (this.now() - found.stayLastSeen > 2 * 60_000) return 0;
    return Math.max(0, int(found.stayUnits));
  }

  // --- 保存と履歴 ---

  #load() {
    if (!this.file) return;
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (saved?.version === 1 && saved.users && typeof saved.users === 'object') {
        for (const [key, value] of Object.entries(saved.users)) this.users[String(key)] = cleanUser(value);
      }
    } catch (error) {
      if (fs.existsSync(this.file)) {
        console.warn(`[points] 記録を読めません: ${error.message}`);
        recordError(error, { kind: 'store.read', level: 'warn', context: { op: 'points.load' } });
      }
    }
  }

  #scheduleSave() {
    if (!this.file) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), this.saveDebounceMs);
    this.saveTimer.unref?.();
  }

  flush() {
    clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (!this.file || !this.dirty) return false;
    const temp = `${this.file}.tmp-${process.pid}`;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.writeFileSync(temp, `${JSON.stringify({ version: 1, users: this.users }, null, 2)}\n`, { mode: 0o600 });
      fs.renameSync(temp, this.file);
      this.dirty = false;
      return true;
    } catch (error) {
      console.warn(`[points] 記録を書けません: ${error.message}`);
      recordError(error, { kind: 'store.write', level: 'warn', context: { op: 'points.save' } });
      try { fs.rmSync(temp, { force: true }); } catch {}
      return false;
    }
  }

  #log(userId, delta, reason, balance) {
    if (!this.logFile) return;
    try {
      fs.mkdirSync(path.dirname(this.logFile), { recursive: true });
      fs.appendFileSync(this.logFile, `${JSON.stringify({ ts: this.now(), user: userId, delta, reason, balance })}\n`);
    } catch (error) {
      console.warn(`[points] 履歴を書けません: ${error.message}`);
      recordError(error, { kind: 'store.write', level: 'warn', context: { op: 'points.appendLog' } });
    }
  }

  close() {
    this.stopped = true;
    this.flush();
    clearInterval(this.stayTimer);
    this.hub?.off?.('event', this.onEvent);
  }
}
