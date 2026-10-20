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

/** RUSH 中かつ rushOdds のとき、weight を rushWeight に差し替える。index は元の items の位置 */
export function effectiveItems(r, rushActive) {
  const items = Array.isArray(r?.items) ? r.items : [];
  const useRush = !!(r?.rushOdds && rushActive);
  return items.map((it, index) => {
    const base = Number(it?.weight);
    const baseWeight = Number.isFinite(base) ? base : 0;
    let weight = baseWeight;
    if (useRush && it?.rushWeight != null && it.rushWeight !== '') {
      const n = Number(it.rushWeight);
      if (Number.isFinite(n) && n >= 0) weight = n;
    }
    return { ...it, index, weight, baseWeight };
  });
}

function chooseWeighted(pool, random) {
  const total = pool.reduce((a, b) => a + b.weight, 0);
  if (!(total > 0)) return null;
  let x = random() * total;
  for (const it of pool) {
    if (!(it.weight > 0)) continue;
    x -= it.weight;
    if (x <= 0) return it;
  }
  return pool[pool.length - 1];
}

/** weight が 0 以下の項目は飛ばす。合計が 0 なら通常の weight（baseWeight）に戻す */
export function pickWeighted(items, random = Math.random) {
  if (!items?.length) return undefined;
  const hit = chooseWeighted(items.filter((it) => it.weight > 0), random);
  if (hit) return hit;
  const normal = [];
  for (const it of items) {
    const weight = it.baseWeight != null ? Number(it.baseWeight) : Number(it.weight);
    if (weight > 0) normal.push({ ...it, weight });
  }
  const fallback = chooseWeighted(normal, random);
  if (fallback) return fallback;
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
  constructor(hub, options = {}) {
    this.hub = hub;
    this.roulettes = [];
    this.busyUntil = 0;
    this.active = null;
    this.seq = 0;
    this.timers = new Set();
    const opts = options || {};
    this.isRushActive = typeof opts.isRushActive === 'function' ? opts.isRushActive : () => false;
    hub.on('event', (e) => this.onEvent(e));
    hub.on('testEvent', (e) => this.onEvent(e, { dry: true }));
    hub.on('reset', () => this.clear());
  }

  /** スピンのたびに呼ぶ。RUSH 中なら true を返す関数 */
  setIsRushActive(fn) {
    this.isRushActive = typeof fn === 'function' ? fn : () => false;
  }

  setConfig(config) {
    this.roulettes = Object.entries(config?.roulettes ?? {}).map(([id, r]) => ({ id, ...r }));
    if (!this.roulettes.some((r) => r.id === this.active)) this.active = this.roulettes[0]?.id ?? null;
  }

  onEvent(e, opts = {}) {
    const r = rouletteFor(this.roulettes, e);
    if (!r) return;
    // 連打 ×N は1件で届くので、既定で個数分まわす（perCount: false で1回だけ）
    const times = r.perCount !== false && e.kind === 'gift' ? Math.min(20, e.gift.count) : 1;
    for (let i = 0; i < times; i++) this.spin(r, e, opts);
  }

  /** 回す。id を省くと表示中のルーレット */
  spin(target, trigger = null, { dry = false } = {}) {
    const r = typeof target === 'object' && target ? target : this.roulettes.find((x) => x.id === target) ?? this.roulettes.find((x) => x.id === this.active) ?? this.roulettes[0];
    if (!r) return null;
    const rushOn = typeof this.isRushActive === 'function' && this.isRushActive();
    const pool = effectiveItems(r, rushOn);
    const winner = pickWeighted(pool);
    if (!winner) return null;
    const index = Number.isInteger(winner.index) ? winner.index : r.items.indexOf(winner);
    const item = r.items[index] || winner;
    const now = Date.now();
    // 待ちがなければ（画面の外にいるので）すべり込む時間を足す。戻っている途中なら、戻りきるのを待つ
    const idle = now >= this.busyUntil;
    const start = idle ? Math.max(now, this.leftAt ?? 0) + ENTER_MS : this.busyUntil;
    const reveal = start + (this.active === r.id ? 0 : SWITCH_MS) + r.duration * 1000;
    this.busyUntil = reveal + r.hold * 1000 + AFTER_MS;
    this.leftAt = this.busyUntil + LEAVE_MS;
    this.active = r.id;

    const spin = { seq: ++this.seq, id: r.id, name: r.name || r.id, index, label: item.label, trigger: slim(trigger), at: now, revealAt: reveal };
    this.hub.broadcast({ type: 'roulette', spin });

    // 当たりが画面に出るころに結果を知らせる（Minecraft・履歴・モニター）
    const timer = setTimeout(() => {
      this.timers.delete(timer);
      this.hub.broadcast({ type: 'rouletteResult', spin });
      if (!dry) this.hub.emit('roulette', { roulette: r, item, trigger, spin });
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
