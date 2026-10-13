// 延長タイマーの「このギフトで決まった時間」の目安。
// 100 コインで 1 分（1 コインあたり 0.6 秒）。1 秒に満たないときは 1 秒にする。
// 秒はいちばん近い整数にする。60 秒以上で、ちょうど分に分かれるときは分で返す。

/** 新しく作るタイマーの「1 コインで延びる秒」。すでにある設定の初期値とは別 */
export const TIMER_COIN_SECONDS = 0.6;

/**
 * ギフト1個のコインから、延ばす長さの目安。
 * @param {number} diamonds ギフト1個のコイン
 * @returns {{ seconds: number, amount: number, unit: 'seconds' | 'minutes' }}
 *   seconds は実際の秒。amount と unit は入力欄に入れる数と「秒 / 分」
 */
export function timerGiftLength(diamonds) {
  const coins = Number(diamonds);
  const raw = (Number.isFinite(coins) ? coins : 0) * TIMER_COIN_SECONDS;
  const seconds = Math.max(1, Math.round(raw));
  if (seconds >= 60 && seconds % 60 === 0) return { seconds, amount: seconds / 60, unit: 'minutes' };
  return { seconds, amount: seconds, unit: 'seconds' };
}
