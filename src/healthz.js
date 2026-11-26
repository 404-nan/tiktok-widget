// 外からは、動いているか・配信中の人数・起動した時の版数とコミットだけを返す。
import { BUILD_INFO } from './build-info.js';

export function liveCount({ local = null, tenants = null } = {}) {
  const localLive = local?.isLive?.() === true ? 1 : 0;
  return localLive + (tenants?.liveCount?.() ?? 0);
}

export function healthz(sources) {
  return (_req, res) => res.json({
    ok: true,
    live: liveCount(sources),
    version: BUILD_INFO.version,
    commit: BUILD_INFO.commit,
  });
}
