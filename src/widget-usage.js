// 配信中の人が「使っている」部品の一覧。
// 判定の物差しは設定の enabled だけ：節（セクション）の page が部品に対応し、
// 実効設定（既定＋保存値）で enabled が false でなければ使用中とみなす。
// 迷ったら使用中側に倒す（配信中の部分更新は、使っていない部品だけが対象）。
import { SCHEMA, defaultsFor } from './schema.js';

export function inUseWidgets(configs) {
  const used = new Set();
  for (const config of configs) {
    if (!config) continue;
    for (const [section, def] of Object.entries(SCHEMA)) {
      const page = def?.page;
      if (!page) continue;
      const effective = { ...defaultsFor(section), ...(config[section] ?? {}) };
      if (effective.enabled === false) continue;
      used.add(String(page).split('/')[0]);
    }
  }
  return used;
}

export function collectWidgetUsage({ local = null, tenants = null } = {}) {
  const runtimes = [];
  if (local?.isLive?.()) runtimes.push(local);
  if (typeof tenants?.liveRuntimes === 'function') runtimes.push(...tenants.liveRuntimes());
  const configs = runtimes.map((runtime) => runtime.getConfig?.() ?? null);
  return { live: runtimes.length, inUse: [...inUseWidgets(configs)].sort() };
}
