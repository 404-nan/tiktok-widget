// スロット台型ルーレットで、各リールをどの項目で止めるかを決める（画面に触らない。テストからも使う）。
// 結果（サーバーが決めた index）は最後のリールに出す。リールが3本のときは、ふだんは3本とも結果でそろえ、
// ギリギリ演出（fx.chance）で結果が当たりの隣なら、前の2本を当たりでそろえて（リーチ）最後の1本だけギリギリで外す。

/**
 * items: 項目（win: true が当たり）、index: 結果、fx: サーバーの spin（land / chance）、reels: リールの本数
 * 返す値: stops 各リールで中段に止める項目の添字 / reach リーチの演出をするか / land 最後のリールが止まる位置（0〜1）
 */
export function reelPlan(items, index, fx = {}, reels = 1) {
  const n = items.length;
  const at = (i) => items[(i + n) % n];
  let shown = index;
  if (fx.chance && at(index)?.win !== true) {
    // 次に来る項目（index - 1）が当たりならそれで、でなければ通り過ぎた項目（index + 1）でそろえる
    shown = at(index - 1)?.win === true ? (index - 1 + n) % n : (index + 1) % n;
  }
  const stops = Array.from({ length: reels }, (_, i) => (i === reels - 1 ? index : shown));
  // 3本のときは、ギリギリ演出のほかは真ん中にピタッと止める
  const land = fx.chance || reels === 1 ? fx.land ?? null : 0.5;
  return { stops, reach: reels > 1 && !!fx.chance, land };
}
