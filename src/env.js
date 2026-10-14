// 開発環境かどうか。どれか判定できない、または例外のときは本番（false）。
// 待ち受けポートの既定は server.js の listen と同じ 3939。

const DEFAULT_PORT = 3939;
const PROD_HOST = 'widget.lul.works';

function listenPort() {
  const raw = process.env.PORT;
  if (raw == null || String(raw).trim() === '') return DEFAULT_PORT;
  const port = Number(String(raw).trim());
  if (!Number.isInteger(port) || port < 0) return null;
  return port;
}

function hostName(req) {
  const raw = typeof req.get === 'function' ? req.get('host') : (req.headers?.host ?? req.headers?.Host);
  if (raw == null) return null;
  let host = String(raw).trim().toLowerCase();
  if (!host) return null;
  if (host.startsWith('[')) {
    const end = host.indexOf(']');
    return end > 1 ? host.slice(1, end) : null;
  }
  const colon = host.indexOf(':');
  if (colon !== -1) host = host.slice(0, colon);
  return host || null;
}

/** TW_ENV=dev かつ待ち受けが 3939 以外かつ、req があるときは Host が本番ドメインでないときだけ true */
export function isDevEnv(req) {
  try {
    if (process.env.TW_ENV !== 'dev') return false;
    const port = listenPort();
    if (port == null || port === DEFAULT_PORT) return false;
    if (req != null) {
      const host = hostName(req);
      if (host == null || host === PROD_HOST) return false;
    }
    return true;
  } catch {
    return false;
  }
}
