// 配信中のギフトとサーバー側の演出を匿名で記録し、配信後の簡単な比較を作る。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DAY = 24 * 60 * 60 * 1000;
const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;

export function actorDigest(secret, actor) {
  return crypto.createHmac('sha256', String(secret)).update(String(actor || '?')).digest('hex').slice(0, 12);
}

export function makeEffectReport(events, { startedAt, endedAt }) {
  const real = events.filter((event) => !event.test);
  const minutes = new Map();
  for (const event of real) {
    if (event.kind !== 'gift') continue;
    const minute = Math.floor((event.ts - startedAt) / 60_000);
    minutes.set(minute, (minutes.get(minute) || 0) + finite(event.coins));
  }
  const values = [...minutes.values()].sort((a, b) => a - b);
  const median = values.length ? values[Math.floor(values.length / 2)] : 0;
  const effects = {};
  for (const event of real.filter((item) => item.kind === 'effect')) {
    const key = event.type || 'unknown';
    const atMinute = Math.floor((event.ts - startedAt) / 60_000);
    const before = [atMinute - 2, atMinute - 1].map((m) => minutes.get(m) || 0);
    const after = [atMinute, atMinute + 1].map((m) => minutes.get(m) || 0);
    const average = (items) => items.reduce((sum, item) => sum + item, 0) / items.length;
    const row = effects[key] || { count: 0, samples: [] };
    row.count += 1;
    row.samples.push({ ts: event.ts, beforePerMinute: average(before), afterPerMinute: average(after), multiplier: average(before) ? average(after) / average(before) : null });
    effects[key] = row;
  }
  return { startedAt, endedAt, durationMs: endedAt - startedAt, medianCoinsPerMinute: median, effects };
}

export class EffectLog {
  constructor(dir, { secret = crypto.randomBytes(32).toString('hex'), now = Date.now, retentionDays = 90 } = {}) {
    this.dir = dir;
    this.secret = secret;
    this.now = now;
    this.retentionDays = retentionDays;
    this.queue = [];
    this.session = null;
    this.timer = setInterval(() => this.flush(), 1000);
    this.timer.unref?.();
  }

  start(id, startedAt = this.now()) {
    this.session = { id, startedAt, endedAt: null, actors: new Map(), ordinal: 0 };
    this.queue = [];
  }

  gift(event) {
    if (!this.session || event.kind !== 'gift') return;
    const actor = event.user?.id || event.user?.name || '?';
    const actorKey = actorDigest(this.secret, actor);
    const ordinal = (this.session.actors.get(actorKey) || 0) + 1;
    this.session.actors.set(actorKey, ordinal);
    const gift = event.gift || {};
    this.queue.push({ ts: event.ts ?? this.now(), kind: 'gift', giftId: gift.id ?? null, giftName: gift.name ?? null, coins: finite(event.coins ?? gift.coins ?? gift.diamondCount), actor: actorKey, ordinal, test: Boolean(event.test) });
  }

  effect(type, values = {}, { test = false, ts = this.now() } = {}) {
    if (!this.session) return;
    this.queue.push({ ts, kind: 'effect', type, ...values, test: Boolean(test) });
  }

  flush() {
    if (!this.session || !this.queue.length) return;
    const session = this.session;
    const file = path.join(this.dir, `${session.id}.events.jsonl`);
    const lines = this.queue.splice(0).map((event) => JSON.stringify(event)).join('\n') + '\n';
    try { fs.mkdirSync(this.dir, { recursive: true }); fs.appendFileSync(file, lines); } catch (error) { console.warn(`[effect-log] 記録を書けませんでした: ${error.message}`); }
  }

  end(endedAt = this.now()) {
    if (!this.session) return;
    this.flush();
    const session = this.session;
    session.endedAt = endedAt;
    const eventsFile = path.join(this.dir, `${session.id}.events.jsonl`);
    let events = [];
    try { events = fs.readFileSync(eventsFile, 'utf8').trim().split('\n').filter(Boolean).map((line) => JSON.parse(line)); } catch {}
    if (events.length) {
      try { fs.writeFileSync(path.join(this.dir, `${session.id}.report.json`), JSON.stringify(makeEffectReport(events, session))); } catch (error) { console.warn(`[effect-log] 報告を書けませんでした: ${error.message}`); }
    }
    this.session = null;
    this.prune(endedAt);
  }

  prune(at = this.now()) {
    const cutoff = at - this.retentionDays * DAY;
    try {
      for (const name of fs.readdirSync(this.dir)) {
        const full = path.join(this.dir, name);
        if (fs.statSync(full).mtimeMs < cutoff && (name.endsWith('.events.jsonl') || name.endsWith('.report.json'))) fs.unlinkSync(full);
      }
    } catch {}
  }

  close() { clearInterval(this.timer); this.end(); }
}
