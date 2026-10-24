// Euler Stream の呼び出しを配信者・種類・日ごとに小さく記録する。
import fs from 'node:fs';
import path from 'node:path';

const KINDS = new Set(['connect', 'isLive', 'roomId', 'gifts', 'signature']);
const dayOf = (at) => new Date(at).toISOString().slice(0, 10);

export class EulerUsage {
  constructor(file, { now = Date.now } = {}) { this.file = file; this.now = now; this.data = this.#load(); }
  #load() { try { const value = JSON.parse(fs.readFileSync(this.file, 'utf8')); return value && typeof value === 'object' ? value : {}; } catch { return {}; } }
  record(username, kind, at = this.now()) {
    const name = String(username ?? '').replace(/^@/, '').trim();
    if (!name || !KINDS.has(kind)) return;
    const day = dayOf(at);
    this.data[day] ??= {};
    this.data[day][name] ??= {};
    this.data[day][name][kind] = (this.data[day][name][kind] ?? 0) + 1;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
  }
  snapshot() { return this.data; }
}
