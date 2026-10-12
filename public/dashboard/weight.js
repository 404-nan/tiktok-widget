// ルーレットの「当たりやすさ」の入力欄。
// 前は min=0.1・step=1 にしていたため、ブラウザの ▲▼ が「最小値 0.1 から 1 ずつ」の目盛り
// （0.1 → 1.1 → 2.1 …）に合わせてしまい、1 の次が 1.1、その次が 2.1 になっていた。
// 目盛りの起点を 0 にし（min=0）、0 以下は保存しないことで、▲▼ は 1 → 2 → 3 と整数で動く。
// 0.5 のような小数も手で入れられる（保存はするが、▲▼ は整数の目盛りで動く）。
export const WEIGHT_INPUT = { min: '0', step: '1' };

/** 入れた文字から当たりやすさを読む。0 以下・数字でないものは null（保存しない） */
export function parseWeight(text) {
  if (String(text).trim() === '') return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100) / 100;
}

/** ブラウザの ▲▼ と同じ計算: min を起点に step の目盛りへ合わせて1つ進める */
export function stepUp(value, { min, step }, dir = 1) {
  const base = Number(min) || 0;
  const s = Number(step);
  const k = (value - base) / s;
  // 目盛りの上にない値からは、その向きでいちばん近い目盛りへ（Chrome と同じ）
  const next = dir > 0 ? Math.floor(k + 1e-9) + 1 : Math.ceil(k - 1e-9) - 1;
  return Math.round((base + next * s) * 1e6) / 1e6;
}
