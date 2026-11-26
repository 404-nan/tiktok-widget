// エラーを原因・場所・文脈つきで JSON Lines に残す。記録に失敗しても本体は止めない。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { PRODUCT_VERSION } from './version.js';
import { readErrorFixes } from './error-fixes.js';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MINUTE_MS = 60_000;
const MAX_STACK_LINES = 8;

/** 鍵・トークン・配信者 URL・メール・長い英数字を、記録へ入る前に伏せる */
export function scrub(value) {
  if (value == null) return '';
  let text = String(value);
  text = text.replace(/\/t\/[^/\s?]+/g, '/t/***');
  text = text.replace(/\b((?:key|token|sign|signature)=)([^\s&]+)/gi, '$1***');
  text = text.replace(/\b(authorization)(\s*[:=]\s*)(bearer\s+)?([^\s,;]+)/gi, (_m, name, sep, bearer) => `${name}${sep}${bearer ?? ''}***`);
  text = text.replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '***');
  text = text.replace(/\b[A-Za-z0-9_-]{32,}\b/g, '***');
  return text;
}

function scrubData(value, depth = 0, seen = new WeakSet()) {
  if (typeof value === 'string') return scrub(value);
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (depth > 4) return '[deep]';
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => scrubData(item, depth + 1, seen));
  if (typeof value === 'object') {
    if (seen.has(value)) return '[circular]';
    seen.add(value);
    const out = {};
    for (const [key, item] of Object.entries(value).slice(0, 40)) {
      if (item === undefined || typeof item === 'function') continue;
      out[key] = scrubData(item, depth + 1, seen);
    }
    seen.delete(value);
    return out;
  }
  return scrub(String(value));
}

function normalizeDigitsAndIds(message) {
  return String(message ?? '')
    .replace(/\b[A-Za-z0-9_-]{8,}\b/g, '<id>')
    .replace(/\b\d+(?:\.\d+)?\b/g, '<num>')
    .replace(/\s+/g, ' ')
    .trim();
}

/** 同じ種類のエラーを1つにまとめる鍵。場所と、数字や ID をならした文から作る */
export function fingerprintOf(row) {
  const basis = [
    row?.service ?? '',
    row?.kind ?? '',
    row?.where?.file ?? '',
    row?.where?.fn ?? '',
    normalizeDigitsAndIds(row?.message ?? ''),
  ].join('|');
  return crypto.createHash('sha256').update(basis).digest('hex').slice(0, 12);
}

function filePathFromStack(value) {
  let text = String(value ?? '').trim();
  if (!text || text.startsWith('node:')) return null;
  if (text.startsWith('file://')) {
    try { text = fileURLToPath(text); } catch { return null; }
  }
  if (!path.isAbsolute(text)) return null;
  const rel = path.relative(repoRoot, text);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return rel.split(path.sep).join('/');
}

function parseFrame(line) {
  let match = line.match(/^at\s+(.*?)\s+\((.+):(\d+):(\d+)\)$/);
  if (match) {
    const file = filePathFromStack(match[2]);
    if (!file) return null;
    return { file, fn: match[1].replace(/^async\s+/, '') || null, line: Number(match[3]) };
  }
  match = line.match(/^at\s+(.+):(\d+):(\d+)$/);
  if (!match) return null;
  const file = filePathFromStack(match[1]);
  if (!file) return null;
  return { file: file, fn: null, line: Number(match[2]) };
}

function rawStackLines(stack) {
  return String(stack ?? '')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('at '));
}

function relativizeStackLine(line) {
  return scrub(line.replace(/(file:\/\/)?\/[^\s()]+?:(\d+):(\d+)/g, (whole, protocol, row, col) => {
    const withoutPosition = whole.slice(0, -(String(row).length + String(col).length + 2));
    let target = withoutPosition;
    try { target = protocol ? fileURLToPath(withoutPosition) : withoutPosition; } catch { return whole; }
    const rel = path.relative(repoRoot, target);
    if (rel.startsWith('..') || path.isAbsolute(rel)) return `<external>/${path.basename(target)}:${row}:${col}`;
    return `${rel.split(path.sep).join('/')}:${row}:${col}`;
  }));
}

function stackOf(error) {
  return rawStackLines(error?.stack).slice(0, MAX_STACK_LINES).map(relativizeStackLine);
}

function whereFromStack(stack) {
  for (const line of rawStackLines(stack)) {
    const frame = parseFrame(line);
    if (!frame || frame.file === 'src/error-log.js') continue;
    return frame;
  }
  return null;
}

function partsOf(error) {
  if (error instanceof Error) return { message: error.message, stack: error.stack, cause: error.cause };
  if (error && typeof error === 'object') {
    return {
      message: error.message ?? String(error),
      stack: error.stack ?? '',
      cause: error.cause,
    };
  }
  return { message: String(error ?? 'unknown error'), stack: '', cause: undefined };
}

function mergeWhere(explicit, inferred) {
  const base = { ...(inferred ?? {}) };
  for (const key of ['file', 'fn', 'line']) {
    if (explicit?.[key] != null && explicit[key] !== '') base[key] = explicit[key];
  }
  if (base.file) base.file = scrub(String(base.file)).replace(/^\/+/, '');
  if (base.fn) base.fn = scrub(String(base.fn));
  if (!Number.isFinite(Number(base.line))) delete base.line;
  else base.line = Number(base.line);
  return base;
}

function jstDay(ms) {
  const shifted = new Date(ms + 9 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function listRows(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((name) => /^errors-\d{4}-\d{2}-\d{2}\.jsonl$/.test(name)).sort();
  } catch {
    return [];
  }
  const rows = [];
  for (const name of names) {
    let lines = [];
    try { lines = fs.readFileSync(path.join(dir, name), 'utf8').split('\n').filter(Boolean); } catch { continue; }
    for (const line of lines) {
      try { rows.push(JSON.parse(line)); } catch {}
    }
  }
  return rows;
}

const timeOf = (row) => Date.parse(row?.ts ?? '') || 0;

function endOfFixedDay(fixedAt) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(fixedAt ?? ''))) return 0;
  return Date.parse(`${fixedAt}T23:59:59.999Z`);
}

function reportWriteFailure(error) {
  // 記録そのものの失敗で errorLog を再帰呼び出しすると止まらないので、ここだけ console.error に残す。
  try { console.error(`[error-log] 記録できませんでした: ${error?.message ?? error}`); } catch {}
}

export function createErrorLog({ dir, service = 'raikone', env = process.env.TW_ENV || 'prod', version = PRODUCT_VERSION, now = Date.now } = {}) {
  const writes = new Map(); // fingerprint → { lastAt, repeat }

  function append(row) {
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `errors-${jstDay(Date.parse(row.ts))}.jsonl`);
    const fd = fs.openSync(file, 'a', 0o600);
    try {
      fs.writeSync(fd, `${JSON.stringify(row)}\n`);
    } finally {
      fs.closeSync(fd);
    }
    try { fs.chmodSync(file, 0o600); } catch {}
  }

  function record(error, { kind = 'unknown', level = 'error', where, context, cause } = {}) {
    try {
      if (!dir) throw new Error('dir がありません');
      const at = Number(now());
      const parts = partsOf(error);
      const inferred = whereFromStack(parts.stack);
      const row = {
        ts: new Date(at).toISOString(),
        service,
        env,
        version,
        level: level === 'warn' ? 'warn' : 'error',
        kind: String(kind || 'unknown'),
        where: mergeWhere(where, inferred),
        message: scrub(parts.message),
        cause: scrub(cause ?? parts.cause ?? ''),
        stack: stackOf(parts),
        context: scrubData(context ?? {}),
      };
      row.fingerprint = fingerprintOf(row);

      const atMs = Date.parse(row.ts);
      const previous = writes.get(row.fingerprint);
      if (previous && atMs - previous.lastAt < MINUTE_MS) {
        previous.repeat += 1;
        return null;
      }
      const repeat = previous?.repeat ?? 0;
      writes.set(row.fingerprint, { lastAt: atMs, repeat: 0 });
      if (repeat) row.repeat = repeat;
      append(row);
      return row;
    } catch (error) {
      reportWriteFailure(error);
      return null;
    }
  }

  function recent({ sinceMs = 0, limit = Infinity } = {}) {
    return listRows(dir)
      .map((row, index) => ({ row, index }))
      .filter(({ row }) => timeOf(row) >= sinceMs)
      .sort((a, b) => (timeOf(b.row) - timeOf(a.row)) || (b.index - a.index))
      .slice(0, limit)
      .map(({ row }) => row);
  }

  function groups({ sinceMs = 0, fixes = null } = {}) {
    const fixList = Array.isArray(fixes) ? fixes : readErrorFixes();
    const fixMap = new Map(fixList.map((fix) => [fix.fingerprint, fix]));
    const grouped = new Map();
    for (const row of recent({ sinceMs }).reverse()) {
      const key = row.fingerprint ?? fingerprintOf(row);
      let group = grouped.get(key);
      if (!group) {
        group = {
          fingerprint: key,
          kind: row.kind,
          where: row.where ?? {},
          message: row.message,
          level: row.level,
          count: 0,
          firstTs: row.ts,
          lastTs: row.ts,
          tenantSet: new Set(),
          rows: [],
        };
        grouped.set(key, group);
      }
      group.count += 1 + (Number(row.repeat) || 0);
      if (timeOf(row) < timeOf({ ts: group.firstTs })) group.firstTs = row.ts;
      if (timeOf(row) >= timeOf({ ts: group.lastTs })) {
        group.lastTs = row.ts;
        group.kind = row.kind;
        group.where = row.where ?? {};
        group.message = row.message;
        group.level = row.level;
      }
      if (row.context?.tenant) group.tenantSet.add(String(row.context.tenant));
    }
    return [...grouped.values()].map((group) => {
      const fix = fixMap.get(group.fingerprint);
      const status = !fix ? 'open' : timeOf({ ts: group.lastTs }) > endOfFixedDay(fix.fixedAt) ? 'regressed' : 'fixed';
      const { tenantSet, rows, ...rest } = group;
      return { ...rest, tenants: tenantSet.size, status };
    }).sort((a, b) => timeOf({ ts: b.lastTs }) - timeOf({ ts: a.lastTs }));
  }

  return {
    record,
    recent,
    groups,
    close() {},
  };
}

// server.js が起動時に置く、プロセス全体の記録先。深い部品は recordError だけ呼べばよい。
let activeErrorLog = null;
export function setActiveErrorLog(log) {
  activeErrorLog = log ?? null;
}

/**
 * 深い部品からの短い記録口。文字しか無い場所では Error をここで作り、
 * stack の error-log.js の次の行（呼んだ場所）を where にする。
 */
export function recordError(error, options = {}) {
  try {
    if (!activeErrorLog) return null;
    const hasStack = error && typeof error === 'object' && typeof error.stack === 'string' && error.stack !== '';
    let input = error;
    if (!hasStack && !(error instanceof Error)) {
      input = new Error(error && typeof error === 'object' && error.message ? String(error.message) : String(error ?? 'unknown error'));
    }
    return activeErrorLog.record(input, options);
  } catch {
    return null;
  }
}
