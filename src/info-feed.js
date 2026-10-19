// フォロー・ギフト・シェアの最近の一覧をメモリに持ち、ウィジェットへ渡す。
// 配信中のテスト送信は画面にだけ届け、保存対象の一覧には入れない。

const MAX_ITEMS = 30;
const FEED_KINDS = new Set(['follow', 'gift', 'share']);

const isDemoUser = (user) => String(user?.id ?? '').startsWith('demo_');

function publicUser(user) {
  return { name: String(user?.name ?? ''), avatar: user?.avatar ?? null };
}

function publicGift(gift) {
  if (!gift) return undefined;
  return { id: gift.id ?? null, name: gift.name ?? '', nameJa: gift.nameJa ?? null, count: Number(gift.count ?? 1), diamonds: Number(gift.diamonds ?? gift.diamondCount ?? 0) };
}

function feedItem(event) {
  const item = { id: event.id, ts: event.ts, kind: event.kind, user: publicUser(event.user), coins: Number(event.totalDiamonds ?? event.coins ?? 0) };
  const gift = publicGift(event.gift);
  if (gift) item.gift = gift;
  if (event.test || isDemoUser(event.user)) item.test = true;
  return item;
}

export class InfoFeed {
  constructor(hub) {
    this.items = [];
    this.hub = hub;
    this.onEvent = (event) => this.add(event);
    // Hub が testEvent と同時に画面へ event を配っているため、ここでは購読だけする。
    this.onTestEvent = () => {};
    this.onReset = () => { this.items = []; };
    hub.on('event', this.onEvent);
    hub.on('testEvent', this.onTestEvent);
    hub.on('reset', this.onReset);
  }

  add(event) {
    if (!FEED_KINDS.has(event?.kind)) return;
    this.items.unshift(feedItem(event));
    this.items.length = Math.min(this.items.length, MAX_ITEMS);
  }

  snapshot() {
    return { items: this.items.map((item) => ({ ...item, user: { ...item.user }, gift: item.gift && { ...item.gift } })) };
  }

  close() {
    this.hub.off('event', this.onEvent);
    this.hub.off('testEvent', this.onTestEvent);
    this.hub.off('reset', this.onReset);
  }
}
