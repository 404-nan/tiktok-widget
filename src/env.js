// 開発環境かどうか。どれか判定できない、または例外のときは本番（false）。
// 判定は環境変数だけで行う（TW_DEV=1 か TW_ENV=dev）。ポートでは決めない（作業場所ごとに空いているポートで動かすため）。
// 本番は TW_DEV・TW_ENV を付けずに動かす。Host が本番ドメインなら環境変数に関係なく本番扱い。

const PROD_HOST = 'widget.lul.works';

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

/** TW_DEV=1 か TW_ENV=dev のとき、かつ req があるときは Host が本番ドメインでないときだけ true */
export function isDevEnv(req) {
  try {
    if (process.env.TW_DEV !== '1' && process.env.TW_ENV !== 'dev') return false;
    if (req != null) {
      const host = hostName(req);
      if (host == null || host === PROD_HOST) return false;
    }
    return true;
  } catch {
    return false;
  }
}
