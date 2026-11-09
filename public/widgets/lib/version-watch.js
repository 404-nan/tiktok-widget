// 自分の部品の版が変わったら、待機のときだけ画面を読み直す（部分更新の第1段）。
// 使い方: startVersionWatch('<部品の名前>', { isIdle })
// isIdle は true（待機）/ false（演出中）/ null（分からない）を返す。分からない場合は
// 「変わった状態が3回続いたら」を待機の代わりにする。読み直しは5分に1回まで。
const BASE = (typeof location !== 'undefined' && location.pathname.match(/^\/t\/[^/]+/)?.[0]) || '';

export function startVersionWatch(id, { isIdle = null, intervalMs = 20000 } = {}) {
  if (!id || typeof fetch !== 'function' || typeof location === 'undefined') return;
  let baseline = null;
  let changedPolls = 0;
  let lastReloadAt = 0;
  try {
    lastReloadAt = Number(sessionStorage.getItem('tw-vw-reload') || 0);
  } catch { /* 保存できない環境では抑止なしで続ける */ }

  const tick = async () => {
    let version = null;
    try {
      const res = await fetch(`${BASE}/api/widget-versions?ids=${encodeURIComponent(id)}`);
      if (res.ok) version = (await res.json())?.versions?.[id] ?? null;
    } catch { /* 取れないときは何もしない */ }
    if (!version) return;
    if (baseline === null) {
      baseline = version;
      return;
    }
    if (version === baseline) {
      changedPolls = 0;
      return;
    }
    changedPolls += 1;
    const idleResult = isIdle ? isIdle() : null;
    const idle = idleResult === null || idleResult === undefined ? changedPolls >= 3 : Boolean(idleResult);
    if (!idle) return;
    if (Date.now() - lastReloadAt < 5 * 60 * 1000) return;
    try {
      sessionStorage.setItem('tw-vw-reload', String(Date.now()));
    } catch { /* 同上 */ }
    location.reload();
  };
  setInterval(tick, intervalMs);
  tick();
}
