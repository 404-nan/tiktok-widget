// 「最後の1人」型（Last X）の枠の状態を持つ、画面とテストで共用する純粋な部品。
// 種類ごとに最後の1人を覚え、その種類の新しい出来事だけで枠が差し替わる。
export const LAST_KINDS = ['follow', 'gift', 'share', 'like', 'chat'];
export const LAST_LABELS = {
  follow: '最後のフォロー',
  gift: '最後のギフト',
  share: '最後のシェア',
  like: '最後のいいね',
  chat: '最後の発言',
};
const LABEL_KEYS = {
  follow: 'lastFollowLabel',
  gift: 'lastGiftLabel',
  share: 'lastShareLabel',
  like: 'lastLikeLabel',
  chat: 'lastChatLabel',
};

export function emptyLastState() {
  return { follow: null, gift: null, share: null, like: null, chat: null };
}

export function lastEventCoins(event) {
  const n = Number(event?.coins ?? event?.totalDiamonds ?? 0);
  return Number.isFinite(n) ? n : 0;
}

/**
 * 出来事を枠の状態へ反映する。差し替わった種類を返し、関係なければ null。
 * ギフトは minCoins 未満なら差し替えない。
 */
export function applyLastEvent(state, event, { minCoins = 0 } = {}) {
  const kind = event?.kind;
  if (!state || !LAST_KINDS.includes(kind)) return null;
  if (!event?.user || (!event.user.name && !event.user.id)) return null;
  if (kind === 'gift' && lastEventCoins(event) < Math.max(0, Number(minCoins) || 0)) return null;
  state[kind] = {
    kind,
    user: { name: String(event.user.name ?? ''), avatar: event.user.avatar ?? null },
    gift: event.gift
      ? { name: String(event.gift.name ?? ''), nameJa: event.gift.nameJa ?? null, count: Number(event.gift.count ?? 1) }
      : null,
    coins: lastEventCoins(event),
    ts: event.ts ?? null,
    id: event.id ?? null,
  };
  return kind;
}

/** 初期状態（サーバーの控え）から枠を埋める。控えは種類ごとの最後の項目。 */
export function seedLastState(state, last) {
  if (!last || typeof last !== 'object') return state;
  for (const kind of LAST_KINDS) {
    const item = last[kind];
    if (item && item.user) state[kind] = { ...item, gift: item.gift ?? null, coins: lastEventCoins(item) };
  }
  return state;
}

/** 枠の並び：lastOrder の順で、lastKinds にあるものだけ。漏れは後ろに足す。 */
export function orderedLastKinds(config) {
  const enabled = Array.isArray(config?.lastKinds) ? config.lastKinds : LAST_KINDS;
  const order = Array.isArray(config?.lastOrder) ? config.lastOrder : LAST_KINDS;
  const out = [];
  for (const kind of order) if (enabled.includes(kind) && LAST_KINDS.includes(kind) && !out.includes(kind)) out.push(kind);
  for (const kind of enabled) if (LAST_KINDS.includes(kind) && !out.includes(kind)) out.push(kind);
  return out;
}

export function lastLabel(config, kind) {
  const fromConfig = config?.[LABEL_KEYS[kind]];
  return String(fromConfig ?? '').trim() || LAST_LABELS[kind];
}
