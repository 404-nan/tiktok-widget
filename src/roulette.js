// ルーレットの抽選（サーバー側）。
// どのルーレットを回すか・何が当たるかをここで決めてウィジェットに配る。
// こうすると、OBS とダッシュボードのプレビューなど複数の画面で結果がそろい、
// 当たりが画面に出るタイミングで Minecraft へのコマンドや履歴の記録ができる。

const SWITCH_MS = 450; // 別のルーレットに切り替わるときの待ち（ウィジェットと合わせる）
const AFTER_MS = 400; // 結果を消すアニメーション
const ENTER_MS = 500; // 何も回っていないときは、画面の外からすべり込む時間（ウィジェットと合わせる）
const LEAVE_MS = 500; // 終わって画面の外へ戻る時間
import { giftMatches } from './gifts.js';

const named = (gift, names) => {
  if (!gift || !names?.length) return false;
  return giftMatches(gift, names);
};

/** イベントで回すルーレット。ギフト名の指定が合うものを優先し、なければコイン数・フォローなどで探す */
export function rouletteFor(roulettes, e) {
  if (e.kind === 'gift') {
    const byName = roulettes.find((r) => named(e.gift, r.gifts));
    if (byName) return byName;
    return roulettes.find((r) => r.minCoins > 0 && e.totalDiamonds >= r.minCoins && (!r.maxCoins || e.totalDiamonds <= r.maxCoins));
  }
  return roulettes.find((r) => r.events?.includes(e.kind));
}

export function pickWeighted(items, random = Math.random) {
  const total = items.reduce((a, b) => a + b.weight, 0);
  let x = random() * total;
  for (const it of items) {
    x -= it.weight;
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

const slim = (e) =>
  e && {
    kind: e.kind,
    user: e.user && { id: e.user.id, name: e.user.name, avatar: e.user.avatar },
    gift: e.gift && { id: e.gift.id, name: e.gift.name, nameJa: e.gift.nameJa ?? null, count: e.gift.count },
    totalDiamonds: e.totalDiamonds,
  };

export class RouletteEngine {
  constructor(hub) {
    this.hub = hub;
    this.roulettes = [];
    this.busyUntil = 0;
    this.active = null;
    this.seq = 0;
    this.timers = new Set();
    hub.on('event', (e) => this.onEvent(e));
    hub.on('testEvent', (e) => this.onEvent(e, { dry: true }));
    hub.on('reset', () => this.clear());
  }

  setConfig(config) {
    this.roulettes = Object.entries(config?.roulettes ?? {}).map(([id, r]) => ({ id, ...r }));
    if (!this.roulettes.some((r) => r.id === this.active)) this.active = this.roulettes[0]?.id ?? null;
  }

  onEvent(e, opts = {}) {
    const r = rouletteFor(this.roulettes, e);
    if (!r) return;
    const times = r.perCount && e.kind === 'gift' ? Math.min(20, e.gift.count) : 1;
    for (let i = 0; i < times; i++) this.spin(r, e, opts);
  }

  /** 回す。id を省くと表示中のルーレット */
  spin(target, trigger = null, { dry = false } = {}) {
    const r = typeof target === 'object' && target ? target : this.roulettes.find((x) => x.id === target) ?? this.roulettes.find((x) => x.id === this.active) ?? this.roulettes[0];
    if (!r) return null;
    const winner = pickWeighted(r.items);
    const now = Date.now();
    // 待ちがなければ（画面の外にいるので）すべり込む時間を足す。戻っている途中なら、戻りきるのを待つ
    const idle = now >= this.busyUntil;
    const start = idle ? Math.max(now, this.leftAt ?? 0) + ENTER_MS : this.busyUntil;
    const reveal = start + (this.active === r.id ? 0 : SWITCH_MS) + r.duration * 1000;
    this.busyUntil = reveal + r.hold * 1000 + AFTER_MS;
    this.leftAt = this.busyUntil + LEAVE_MS;
    this.active = r.id;

    const spin = { seq: ++this.seq, id: r.id, name: r.name || r.id, index: r.items.indexOf(winner), label: winner.label, trigger: slim(trigger), at: now, revealAt: reveal };
    this.hub.broadcast({ type: 'roulette', spin });

    // 当たりが画面に出るころに結果を知らせる（Minecraft・履歴・モニター）
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.hub.broadcast({ type: 'rouletteResult', spin });
      if (!dry) this.hub.emit('roulette', { roulette: r, item: winner, trigger, spin });
    }, reveal - now);
    this.timers.add(timer);
    return spin;
  }

  /** 待ち列を消す（まだ出ていない結果も取り消す） */
  clear() {
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.busyUntil = 0;
    this.leftAt = 0;
  }
}
