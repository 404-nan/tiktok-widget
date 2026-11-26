// 外部 API の呼び出しを data/api-usage.jsonl に追記し、管理画面用に集計する。
// 鍵やプロンプトは受け取らず、記録に失敗しても本体の動作を止めない。
import fs from 'node:fs';
import path from 'node:path';

export const AI_SERVICES = new Set(['anthropic', 'openai', 'spacebunny']);
export const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;

const STRING_KEYS = ['tenant', 'service', 'operation', 'source', 'handle', 'provider', 'model'];
const NUMBER_KEYS = ['t', 'units', 'status', 'input', 'output', 'cacheRead', 'cacheWrite'];

export function jstDayStart(time) {
  return Math.floor((time + JST_OFFSET_MS) / DAY_MS) * DAY_MS - JST_OFFSET_MS;
}

function cleanRow(entry, fallbackTime) {
  if (!entry || typeof entry !== 'object') return null;
  const row = {};
  for (const key of STRING_KEYS) {
    if (typeof entry[key] === 'string' && entry[key]) row[key] = entry[key];
  }
  for (const key of NUMBER_KEYS) {
    if (Number.isFinite(entry[key])) row[key] = entry[key];
  }
  if (!row.service || !row.operation) return null;
  row.t = Number.isFinite(row.t) ? row.t : fallbackTime;
  row.units = Number.isFinite(row.units) ? row.units : 1;
  row.ok = entry.ok !== false;
  return row;
}

function wanted(row, { service, services, tenant, from, to } = {}) {
  if (service && row.service !== service) return false;
  if (services && !services.includes(row.service)) return false;
  if (tenant && row.tenant !== tenant) return false;
  if (Number.isFinite(from) && row.t < from) return false;
  if (Number.isFinite(to) && row.t > to) return false;
  return true;
}

export function aggregateRows(rows) {
  const out = {
    total: 0,
    ok: 0,
    failed: 0,
    operations: {},
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    lastAt: null,
  };
  for (const row of rows) {
    const units = Number.isFinite(row.units) ? row.units : 1;
    out.total += units;
    if (row.ok === false) out.failed += units;
    else out.ok += units;
    const op = row.operation || 'unknown';
    if (!out.operations[op]) out.operations[op] = { total: 0, ok: 0, failed: 0 };
    out.operations[op].total += units;
    if (row.ok === false) out.operations[op].failed += units;
    else out.operations[op].ok += units;
    for (const key of ['input', 'output', 'cacheRead', 'cacheWrite']) {
      if (Number.isFinite(row[key])) out[key] += row[key];
    }
    if (Number.isFinite(row.t) && (out.lastAt === null || row.t > out.lastAt)) out.lastAt = row.t;
  }
  return out;
}

export class ApiUsage {
  constructor({ dir, file, now = Date.now } = {}) {
    this.dir = dir ?? (file ? path.dirname(file) : undefined);
    this.file = file ?? path.join(this.dir, 'api-usage.jsonl');
    this.now = now;
    this.cache = null;
    this.signature = '';
  }

  record(entry) {
    const row = cleanRow(entry, this.now());
    if (!row) return null;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
      if (!fs.existsSync(this.file)) fs.writeFileSync(this.file, '', { mode: 0o600 });
      fs.appendFileSync(this.file, `${JSON.stringify(row)}\n`);
      try { fs.chmodSync(this.file, 0o600); } catch {}
      if (this.cache) {
        this.cache.push(row);
        try {
          const stat = fs.statSync(this.file);
          this.signature = `${stat.mtimeMs}:${stat.size}`;
        } catch {}
      } else this.signature = '';
    } catch (err) {
      console.warn(`[api-usage] 記録できませんでした: ${err.message}`);
    }
    return row;
  }

  #load() {
    let stat;
    try { stat = fs.statSync(this.file); } catch {
      this.cache = [];
      this.signature = 'missing';
      return this.cache;
    }
    const signature = `${stat.mtimeMs}:${stat.size}`;
    if (this.cache && this.signature === signature) return this.cache;
    const rows = [];
    try {
      for (const line of fs.readFileSync(this.file, 'utf8').split('\n')) {
        if (!line.trim()) continue;
        try {
          const row = JSON.parse(line);
          if (row && typeof row === 'object' && Number.isFinite(row.t)) rows.push(row);
        } catch {}
      }
    } catch (err) {
      console.warn(`[api-usage] 読み込めませんでした: ${err.message}`);
    }
    this.cache = rows;
    this.signature = signature;
    return rows;
  }

  rows(filter = {}) {
    return this.#load().filter((row) => wanted(row, filter));
  }

  services() {
    return [...new Set(this.#load().map((row) => row.service).filter(Boolean))].sort();
  }

  summary({ service, services, now = this.now() } = {}) {
    const serviceList = services ?? (service ? [service] : undefined);
    const filter = serviceList ? { services: serviceList } : {};
    const dayStart = jstDayStart(now);
    const hourStart = now - HOUR_MS;
    return {
      today: aggregateRows(this.rows({ ...filter, from: dayStart, to: now })),
      hour: aggregateRows(this.rows({ ...filter, from: hourStart, to: now })),
    };
  }

  tenants({ service, services, from = 0, now = this.now() } = {}) {
    const filter = services ? { services } : service ? { service } : {};
    const rows = this.rows({ ...filter, from, to: now });
    const dayStart = jstDayStart(now);
    const hourStart = now - HOUR_MS;
    const byTenant = new Map();
    for (const row of rows) {
      const id = row.tenant || 'unknown';
      if (!byTenant.has(id)) byTenant.set(id, []);
      byTenant.get(id).push(row);
    }
    return [...byTenant.entries()].map(([tenant, tenantRows]) => ({
      tenant,
      handle: tenantRows.map((row) => row.handle).find(Boolean) ?? null,
      range: aggregateRows(tenantRows),
      today: aggregateRows(tenantRows.filter((row) => row.t >= dayStart)),
      hour: aggregateRows(tenantRows.filter((row) => row.t >= hourStart)),
    })).sort((a, b) => b.range.total - a.range.total);
  }

  timeseries({ service, services, tenant, granularity = 'hour', from, to = this.now() } = {}) {
    const step = granularity === 'day' ? DAY_MS : HOUR_MS;
    const count = Math.max(1, Math.ceil((to - from) / step));
    const first = granularity === 'day' ? jstDayStart(from) : from;
    const points = Array.from({ length: count }, (_, index) => ({
      start: first + index * step,
      total: 0,
      ok: 0,
      failed: 0,
      input: 0,
      output: 0,
      cacheRead: 0,
      cacheWrite: 0,
    }));
    const filter = services ? { services } : service ? { service } : {};
    if (tenant) filter.tenant = tenant;
    for (const row of this.rows({ ...filter, from: first, to })) {
      const index = Math.floor((row.t - first) / step);
      if (index < 0 || index >= points.length) continue;
      const point = points[index];
      const units = Number.isFinite(row.units) ? row.units : 1;
      point.total += units;
      if (row.ok === false) point.failed += units;
      else point.ok += units;
      for (const key of ['input', 'output', 'cacheRead', 'cacheWrite']) {
        if (Number.isFinite(row[key])) point[key] += row[key];
      }
    }
    return points;
  }
  importRows(entries) {
    const rows = (entries ?? []).map((entry) => cleanRow(entry, this.now())).filter(Boolean);
    if (!rows.length) return 0;
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
      if (!fs.existsSync(this.file)) fs.writeFileSync(this.file, '', { mode: 0o600 });
      fs.appendFileSync(this.file, rows.map((row) => JSON.stringify(row)).join('\n') + '\n');
      try { fs.chmodSync(this.file, 0o600); } catch {}
      if (this.cache) this.cache.push(...rows);
      try {
        const stat = fs.statSync(this.file);
        this.signature = `${stat.mtimeMs}:${stat.size}`;
      } catch {}
    } catch (err) {
      console.warn(`[api-usage] 移行記録を書けませんでした: ${err.message}`);
      return 0;
    }
    return rows.length;
  }

  summaryCache(now = this.now()) {
    const services = [...new Set(['euler', ...AI_SERVICES, ...this.services()])];
    return {
      generatedAt: now,
      timezone: 'Asia/Tokyo',
      services: Object.fromEntries(services.map((service) => [service, this.summary({ service, now })])),
    };
  }

  persistSummary(file = this.file.replace(/api-usage\.jsonl$/, 'api-usage-summary.json')) {
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
      fs.writeFileSync(file, `${JSON.stringify(this.summaryCache(), null, 2)}\n`, { mode: 0o600 });
      try { fs.chmodSync(file, 0o600); } catch {}
      return file;
    } catch (err) {
      console.warn(`[api-usage] 集計キャッシュを書けませんでした: ${err.message}`);
      return null;
    }
  }

}

// 前の記録(euler-usage.json / ai-usage.jsonl)を、最初の1回だけ中央の JSONL へ移す。
// euler の古い記録は時刻が分からないので、その日の昼(UTC)に件数まとめ(units)で置く。時間別グラフの過去分は正確な時刻ではない。
export function migrateLegacyUsage({ dir, apiUsage, now = Date.now } = {}) {
  const markerFile = path.join(dir, 'api-usage-migration.json');
  try {
    const marker = JSON.parse(fs.readFileSync(markerFile, 'utf8'));
    if (marker?.version >= 1) return { imported: 0, skipped: true };
  } catch {}

  const rows = [];
  const readEuler = (file, tenant) => {
    let data;
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
    for (const [day, byHandle] of Object.entries(data ?? {})) {
      const t = Date.parse(`${day}T12:00:00Z`);
      if (!Number.isFinite(t)) continue;
      for (const [handle, kinds] of Object.entries(byHandle ?? {})) {
        for (const [operation, count] of Object.entries(kinds ?? {})) {
          if (!Number.isFinite(count) || count <= 0) continue;
          rows.push({ t, tenant, service: 'euler', operation, units: count, ok: true, source: 'legacy-import', handle });
        }
      }
    }
  };
  readEuler(path.join(dir, 'euler-usage.json'), 'local');
  const tenantsDir = path.join(dir, 'tenants');
  try {
    for (const tenant of fs.readdirSync(tenantsDir)) {
      readEuler(path.join(tenantsDir, tenant, 'euler-usage.json'), tenant);
    }
  } catch {}

  try {
    for (const line of fs.readFileSync(path.join(dir, 'ai-usage.jsonl'), 'utf8').split('\n')) {
      if (!line.trim()) continue;
      try {
        const row = JSON.parse(line);
        if (!Number.isFinite(row?.t)) continue;
        rows.push({
          t: row.t,
          tenant: typeof row.tenant === 'string' && row.tenant ? row.tenant : 'unknown',
          service: row.provider === 'claude' ? 'anthropic' : row.provider || 'unknown-ai',
          operation: 'aiAsk',
          units: 1,
          ok: true,
          source: 'legacy-import',
          provider: row.provider,
          model: row.model,
          input: row.input,
          output: row.output,
          cacheRead: row.cacheRead,
          cacheWrite: row.cacheWrite,
        });
      } catch {}
    }
  } catch {}

  const imported = apiUsage.importRows(rows);
  try {
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    fs.writeFileSync(markerFile, `${JSON.stringify({ version: 1, at: now(), imported }, null, 2)}\n`, { mode: 0o600 });
    try { fs.chmodSync(markerFile, 0o600); } catch {}
  } catch (err) {
    console.warn(`[api-usage] 移行印を書けませんでした: ${err.message}`);
  }
  return { imported, skipped: false };
}
