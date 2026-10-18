// 外からは、動いているかと配信中の人数だけを返す。
export function liveCount({ local = null, tenants = null } = {}) {
  const localLive = local?.isLive?.() === true ? 1 : 0;
  return localLive + (tenants?.liveCount?.() ?? 0);
}

export function healthz(sources) {
  return (_req, res) => res.json({ ok: true, live: liveCount(sources) });
}
