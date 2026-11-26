// 構造化エラーログ。原因・発生場所・文脈を1行JSONで残し、鍵らしい値は伏せる。
import { fileURLToPath } from 'node:url';

const SECRET_KEY = /(?:token|secret|password|passwd|authorization|cookie|api[-_]?key|private[-_]?key)/i;
const SECRET_VALUE = /(sk-[A-Za-z0-9_-]{12,}|ghp_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]{12,}|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})/g;
const MAX_DEPTH = 4;

function redactString(value) {
  return value.replace(SECRET_VALUE, '[redacted]');
}

function redactValue(value, depth = 0) {
  if (typeof value === 'string') return redactString(value);
  if (value == null || typeof value === 'number' || typeof value === 'boolean') return value;
  if (value instanceof Error) return serializeError(value, depth + 1);
  if (Array.isArray(value)) return depth >= MAX_DEPTH ? '[truncated]' : value.map((item) => redactValue(item, depth + 1));
  if (typeof value === 'object') {
    if (depth >= MAX_DEPTH) return '[truncated]';
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [
      key,
      SECRET_KEY.test(key) ? '[redacted]' : redactValue(item, depth + 1),
    ]));
  }
  return String(value);
}

function frameLocation(line) {
  const match = line.match(/at (?:(?<fn>.*?) )?\(?(?<url>file:\/\/[^)]+):(?<line>\d+):(?<column>\d+)\)?/);
  if (!match?.groups) return null;
  let file = match.groups.url;
  try { file = fileURLToPath(match.groups.url); } catch {}
  return {
    file,
    line: Number(match.groups.line),
    column: Number(match.groups.column),
    function: match.groups.fn || null,
  };
}

export function locationOf(error) {
  if (!(error instanceof Error) || typeof error.stack !== 'string') return null;
  for (const line of error.stack.split('\n').slice(1)) {
    if (line.includes('error-logger.js') || line.includes('error-logger.mjs')) continue;
    const location = frameLocation(line.trim());
    if (location) return location;
  }
  return null;
}

function serializeError(error, depth = 0) {
  if (!(error instanceof Error)) {
    return { name: 'Error', message: redactString(String(error)) };
  }
  const out = {
    name: error.name || 'Error',
    message: redactString(error.message || String(error)),
  };
  const location = locationOf(error);
  if (location) out.location = location;
  if (error.cause != null && depth < MAX_DEPTH) out.cause = serializeError(error.cause, depth + 1);
  return out;
}

function writeLine(write, record) {
  try {
    write(JSON.stringify(record));
  } catch {
    // ログでアプリを止めない。出力先の失敗は呼び出し側の責任にする。
  }
}

export function createErrorLogger({ service = 'app', write = null, context: baseContext = {} } = {}) {
  const output = write ?? ((line) => process.stderr.write(`${line}\n`));
  const base = redactValue(baseContext);

  function log(level, error, context = {}) {
    const serialized = serializeError(error);
    const record = {
      time: new Date().toISOString(),
      level,
      service,
      message: serialized.message,
      error: { name: serialized.name, message: serialized.message },
      location: serialized.location ?? null,
      context: redactValue({ ...base, ...context }),
    };
    if (serialized.cause) record.cause = serialized.cause;
    writeLine(output, record);
    return record;
  }

  return {
    error: (error, context) => log('error', error, context),
    warn: (error, context) => log('warn', error, context),
    child: (context) => createErrorLogger({ service, write: output, context: { ...base, ...context } }),
  };
}
