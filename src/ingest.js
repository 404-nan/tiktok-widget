import { normalizeChat, normalizeFollow, normalizeGift, normalizeLike, normalizeShare } from './normalize.js';
import { IngestKeyStore } from './ingest-keys.js';

const KINDS = new Set(['gift', 'like', 'follow', 'comment', 'chat', 'share']);
const LIMIT = 16 * 1024;
const MAX_NAME = 40;
const MAX_COMMENT = 150;
const MAX_REPEAT = 9999;

const text = (value, max = Infinity) => String(value ?? '').trim().slice(0, max);
const number = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};
const fields = (value) => Object.fromEntries(Object.entries(value ?? {}).map(([key, item]) => [key.toLowerCase(), item]));
const firstText = (body, names, max) => {
  for (const name of names) {
    const value = text(body[name], max);
    if (value) return value;
  }
  return '';
};

export class Ingest {
  constructor(hub, { dataDir, connectionAllowed = () => true, now = () => Date.now(), keyStore = null } = {}) {
    this.hub = hub;
    this.now = now;
    this.connectionAllowed = connectionAllowed;
    this.keys = keyStore ?? new IngestKeyStore({ dir: dataDir, now });
    this.stateData = { accepted: 0, duplicates: 0, limited: 0, rejected: 0, byKind: {}, lastEventAt: null, direct: { lastEventAt: null } };
    this.tokens = 40;
    this.emptyAt = now();
    this.events = new Map();
    this.eventIds = new Map();
    hub.on('event', (event) => {
      if (event?.source !== 'ingest') {
        this.stateData.direct.lastEventAt = this.now();
        this.events.set(this.fingerprint(event.kind, event), { source: 'direct', at: this.now() });
      }
    });
  }

  create() {
    const key = this.keys.create();
    return { value: key.value, keyHint: key.hint, keyCreatedAt: key.createdAt };
  }

  remove() { this.keys.remove(); }

  state() {
    return {
      enabled: Boolean(this.keys.data),
      keyHint: this.keys.data?.hint ?? null,
      keyCreatedAt: this.keys.data?.createdAt ?? null,
      lastEventAt: this.stateData.lastEventAt,
      accepted: this.stateData.accepted,
      duplicates: this.stateData.duplicates,
      limited: this.stateData.limited,
      rejected: this.stateData.rejected,
      byKind: { ...this.stateData.byKind },
      direct: { lastEventAt: this.stateData.direct.lastEventAt },
    };
  }

  accepts(key) { return this.keys.authenticate(key); }

  handle(req, res, key) {
    if (!this.accepts(key)) return res.status(404).type('text/plain; charset=utf-8').send('この受け口は使えません');
    const body = req.method === 'GET' ? req.query : req.body;
    if (req.method !== 'GET' && Number(req.headers['content-length'] ?? 0) > LIMIT) return this.reject(res, 413, '本文が大きすぎます');
    if (!this.connectionAllowedSafe()) return res.status(403).type('text/plain; charset=utf-8').send('この配信者は現在、接続を受け付けていません');
    if (!this.limited()) return res.status(429).set('Retry-After', '1').type('text/plain; charset=utf-8').send('送信が多すぎます。少し待ってください');
    const data = fields(body);
    const kind = text(data.kind || data.event || data.type).toLowerCase();
    if (!KINDS.has(kind)) return this.reject(res, 400, 'イベントの種類が正しくありません');
    if (data.eventid != null && this.seenEvent(String(data.eventid))) return this.duplicate(res);
    const event = this.normalize(kind, data);
    const fingerprint = this.fingerprint(kind, event);
    if (kind === 'like' && this.stateData.direct.lastEventAt != null && this.now() - this.stateData.direct.lastEventAt <= 20_000) return this.duplicate(res);
    if (kind !== 'like' && this.events.get(fingerprint)?.source === 'direct' && this.now() - this.events.get(fingerprint).at <= 15_000) return this.duplicate(res);
    const test = data.test === true || data.test === 'true' || data.test === '1' || req.query?.test === '1';
    this.hub.publish({ ...event, source: 'ingest', ...(test ? { test: true } : {}) });
    this.events.set(fingerprint, { source: 'ingest', at: this.now() });
    this.stateData.accepted++;
    this.stateData.lastEventAt = this.now();
    this.stateData.byKind[kind === 'comment' ? 'chat' : kind] = (this.stateData.byKind[kind === 'comment' ? 'chat' : kind] ?? 0) + 1;
    return res.json({ ok: true });
  }

  normalize(kind, data) {
    const avatar = text(data.avatar || data.avatarurl || data.avatar_url || data.profilepictureurl);
    const user = { uniqueId: text(data.userid || data.username, MAX_NAME), nickname: text(data.nickname, MAX_NAME), profilePicture: avatar ? { urls: [avatar] } : null };
    const raw = { user };
    if (kind === 'gift') Object.assign(raw, { giftId: text(data.giftid), repeatCount: Math.min(MAX_REPEAT, Math.max(1, number(data.repeatcount, 1))), repeatEnd: true, gift: { name: text(data.giftname, MAX_NAME), diamondCount: data.coins } });
    if (kind === 'like') Object.assign(raw, { count: number(data.likecount), totalLikeCount: number(data.totallikecount) });
    if (kind === 'comment' || kind === 'chat') raw.content = firstText(data, ['comment', 'content', 'text', 'commandparams'], MAX_COMMENT);
    const result = kind === 'gift' ? normalizeGift(raw) : kind === 'like' ? normalizeLike(raw) : kind === 'comment' || kind === 'chat' ? normalizeChat(raw) : kind === 'follow' ? normalizeFollow(raw) : normalizeShare(raw);
    return result;
  }

  fingerprint(kind, event) {
    const user = event.user?.id || event.user?.name || '';
    if (kind === 'gift') return `${kind}|${user}|${event.gift?.id}|${event.gift?.count}`;
    if (kind === 'comment' || kind === 'chat') return `${kind}|${user}|${event.text}`;
    return `${kind}|${user}|${event.count}|${event.total}`;
  }

  seenEvent(id) {
    const now = this.now();
    for (const [key, at] of this.eventIds) if (now - at > 600_000) this.eventIds.delete(key);
    if (this.eventIds.has(id)) return true;
    this.eventIds.set(id, now);
    while (this.eventIds.size > 1000) this.eventIds.delete(this.eventIds.keys().next().value);
    return false;
  }

  // 瞬間は 40 回まで、続けて来るときは 1 秒あたり 20 回まで。
  // 1 秒未満の間は補充しないので、まとめて来ても余分に通らない。
  limited() {
    const now = this.now();
    if (this.tokens < 1) {
      const elapsed = now - this.emptyAt;
      if (elapsed >= 1000) {
        this.tokens = Math.min(40, Math.floor(elapsed / 1000) * 20);
        this.emptyAt = now;
      }
    }
    if (this.tokens < 1) { this.stateData.limited++; return false; }
    this.tokens -= 1;
    if (this.tokens < 1) this.emptyAt = now;
    return true;
  }

  connectionAllowedSafe() { try { return this.connectionAllowed() !== false; } catch { return true; } }
  duplicate(res) { this.stateData.duplicates++; return res.json({ ok: true, duplicate: true }); }
  reject(res, status, message) { this.stateData.rejected++; return res.status(status).type('text/plain; charset=utf-8').send(message); }
}
