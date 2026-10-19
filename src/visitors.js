// 配信者ごとに来場回数を匿名の番号で記録し、初見・おかえり・常連を配る。
// 名前やユーザー ID は保存せず、記録は配信者の秘密鍵で作った HMAC だけにする。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const KINDS = new Set(['member', 'chat', 'gift', 'follow', 'share', 'like']);
const DAY = 24 * 60 * 60 * 1000;
const DEFAULTS = { regularVisits: 3, keepDays: 90 };

const dateText = (time) => new Date(time).toISOString().slice(0, 10);
const isDemo = (event) => event?.test === true || String(event?.user?.id ?? '').startsWith('demo_');

export class VisitorLog {
  constructor(hub, { dir, now = Date.now } = {}) {
    this.hub = hub;
    this.dir = dir;
    this.now = now;
    this.file = path.join(dir, 'visitors.json');
    this.keyFile = path.join(dir, 'visitors.key');
    this.people = {};
    this.dirty = false;
    this.key = null;
    this.stream = null;
    this.streamPeople = new Set();
    this.streamCounts = { first: 0, returning: 0, regular: 0 };
    this.stopped = false;
    this.onStatus = (status, previous) => this.handleStatus(status, previous);
    this.onEvent = (event) => this.handleEvent(event);
    this.onTestEvent = (event) => this.handleTestEvent(event);
    this.onConfig = () => this.refreshConfig();
    hub.on('status', this.onStatus);
    hub.on('event', this.onEvent);
    hub.on('testEvent', this.onTestEvent);
    hub.on('config', this.onConfig);
    this.refreshConfig();
    this.timer = setInterval(() => this.removeExpired(), DAY);
    this.timer.unref?.();
    this.saveTimer = setInterval(() => this.flush(), 5000);
    this.saveTimer.unref?.();
  }

  refreshConfig() {
    const settings = this.hub.config?.visitors ?? null;
    if (!settings || Object.keys(settings).length === 0) {
      this.config = null;
      return;
    }
    const entries = Object.values(settings).filter((entry) => entry && typeof entry === 'object');
    this.config = {
      regularVisits: Math.min(...entries.map((entry) => Number(entry.regularVisits ?? DEFAULTS.regularVisits)), DEFAULTS.regularVisits),
      keepDays: Math.min(...entries.map((entry) => Number(entry.keepDays ?? DEFAULTS.keepDays)), DEFAULTS.keepDays),
    };
    if (this.dirty && !this.flush()) return;
    this.loadFromDisk();
  }

  enabled() {
    return Boolean(this.config && Object.keys(this.config).length);
  }

  handleStatus(status, previous = {}) {
    if (status?.mode === 'live' && !this.stream) {
      this.stream = this.now();
      this.streamPeople.clear();
      this.streamCounts = { first: 0, returning: 0, regular: 0 };
    }
    if (['idle', 'ended', 'demo'].includes(status?.mode)) {
      this.stream = null;
      this.streamPeople.clear();
      this.streamCounts = { first: 0, returning: 0, regular: 0 };
    }
    // connecting / error は同じ配信の続きなので stream を消さない。
    void previous;
  }

  handleEvent(event) {
    if (!this.enabled() || this.stopped) return;
    if (!event?.user?.id || String(event.user.id).startsWith('demo_')) return;
    if (event?.test) {
      const visits = Math.max(1, Number(event.testVisits) || 1);
      this.broadcast(event.user, visits, true);
      return;
    }
    if (this.hub.status?.mode !== 'live') return;
    if (!KINDS.has(event?.kind)) return;
    this.record(event, false);
  }

  handleTestEvent(event) {
    if (!this.enabled() || !event?.user?.id) return;
    const visits = Math.max(1, Number(event.testVisits) || 1);
    this.broadcast(event.user, visits, true);
  }

  record(event, test) {
    if (!this.stream) this.stream = this.now();
    if (this.streamPeople.has(event.user.id)) return;
    this.streamPeople.add(event.user.id);
    const key = this.anonymousKey(event.user.id);
    if (!key) return;
    const today = dateText(this.now());
    const old = this.people[key];
    // 再起動で streamPeople が空になっても、同じ日に同じ人を二重に迎えない。
    if (old?.last === today) return;
    const visits = old && old.stream !== this.stream ? old.visits + 1 : old?.visits ?? 1;
    this.people[key] = {
      visits,
      first: old?.first ?? today,
      last: today,
      stream: this.stream,
    };
    this.dirty = true;
    this.streamCounts[visits === 1 ? 'first' : visits >= (this.config.regularVisits ?? DEFAULTS.regularVisits) ? 'regular' : 'returning'] += 1;
    this.broadcast(event.user, visits, test);
  }

  broadcast(user, visits, test) {
    this.hub.broadcast({
      type: 'visitor',
      visitor: { user: { name: user.name, avatar: user.avatar ?? null }, visits, first: visits === 1, ...(test ? { test: true } : {}) },
    });
  }

  anonymousKey(userId) {
    if (!this.ensureKey()) return null;
    return crypto.createHmac('sha256', this.key).update(String(userId)).digest('hex').slice(0, 16);
  }

  ensureKey() {
    if (this.key) return this.key;
    if (this.stopped) return null;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      if (fs.existsSync(this.keyFile)) {
        const text = fs.readFileSync(this.keyFile, 'utf8').trim();
        if (!/^[a-f0-9]{64}$/i.test(text)) throw new Error('visitors.key の形式が壊れています');
        this.key = Buffer.from(text, 'hex');
      } else {
        this.key = crypto.randomBytes(32);
        fs.writeFileSync(this.keyFile, this.key.toString('hex'), { mode: 0o600 });
        fs.chmodSync(this.keyFile, 0o600);
      }
      return this.key;
    } catch (error) {
      console.error(`[visitors] 秘密鍵を読めないため記録を止めます: ${error.message}`);
      this.stopped = true;
      return null;
    }
  }

  loadFromDisk() {
    if (!this.enabled() || !fs.existsSync(this.file)) return;
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.people = saved?.version === 1 && saved.people && typeof saved.people === 'object' ? saved.people : {};
      this.removeExpired();
    } catch (error) {
      console.warn(`[visitors] 記録を読めません: ${error.message}`);
    }
  }

  load(saved) {
    this.people = saved?.version === 1 && saved.people && typeof saved.people === 'object' ? { ...saved.people } : {};
    this.removeExpired();
  }

  removeExpired() {
    if (!this.enabled()) return;
    const keepDays = Number(this.config.keepDays ?? DEFAULTS.keepDays);
    const cutoff = this.now() - keepDays * DAY;
    let changed = false;
    for (const [key, person] of Object.entries(this.people)) {
      if (!person.last || Date.parse(`${person.last}T00:00:00Z`) < cutoff) {
        delete this.people[key];
        changed = true;
      }
    }
    if (changed) this.dirty = true;
  }

  flush() {
    if (!this.enabled() || !this.dirty) return false;
    this.removeExpired();
    const temp = `${this.file}.tmp`;
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.writeFileSync(temp, JSON.stringify({ version: 1, people: this.people }, null, 2));
      fs.renameSync(temp, this.file);
      this.dirty = false;
      return true;
    } catch (error) {
      console.warn(`[visitors] 記録を書けません: ${error.message}`);
      try { fs.rmSync(temp, { force: true }); } catch { /* 次の保存で再試行する */ }
      return false;
    }
  }

  forget() {
    if (!this.enabled()) return false;
    this.people = {};
    this.dirty = false;
    this.key = null;
    for (const file of [this.file, this.keyFile]) {
      try { fs.rmSync(file, { force: true }); } catch (error) { console.warn(`[visitors] ${file} を消せません: ${error.message}`); }
    }
    return true;
  }

  snapshot() {
    return { enabled: this.enabled(), stored: Object.keys(this.people).length, stream: { ...this.streamCounts } };
  }

  close() {
    this.flush();
    clearInterval(this.timer);
    clearInterval(this.saveTimer);
    this.hub.off('status', this.onStatus);
    this.hub.off('event', this.onEvent);
    this.hub.off('testEvent', this.onTestEvent);
    this.hub.off('config', this.onConfig);
  }
}
