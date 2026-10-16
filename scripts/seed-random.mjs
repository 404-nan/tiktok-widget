// 開発・画面テスト専用。TW_SEED があるとき Math.random を決まった順の乱数に置き換える。
// 同じ結果(ガチャの当たり、ルーレットの止まる位置)で撮影するため。本番では読み込まない。
const seed = Number(process.env.TW_SEED);
if (Number.isFinite(seed)) {
  let s = seed >>> 0 || 1;
  Math.random = () => {
    // mulberry32
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// crypto.randomInt も同じ乱数から作る(スロットなどが使う)
if (Number.isFinite(seed)) {
  const crypto = (await import('node:crypto')).default;
  crypto.randomInt = (min, max, cb) => {
    if (typeof max !== 'number') { cb = max; max = min; min = 0; }
    const n = min + Math.floor(Math.random() * (max - min));
    if (typeof cb === 'function') { queueMicrotask(() => cb(null, n)); return undefined; }
    return n;
  };
}
