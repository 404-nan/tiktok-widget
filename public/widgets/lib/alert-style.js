// 通知の型（style）の定義を解釈するための共有部品。
// 型の定義そのものは public/widgets/gift-alert/styles.json（データ）にあり、
// ここは「番号から型を引く」「型の形が正しいか確かめる」だけを持つ。
// styles.json が読めない環境でも標準の型で出せるよう、標準の型はここにも写しを持つ
// （写しが styles.json の standard と一致することはテストで固定する）。

export const STANDARD_STYLE = {
  id: 'standard',
  name: '標準（今の見え方）',
  band: true,
  badge: { show: true, imageSize: 68 },
  avatar: { show: true, size: 30 },
  text: { name: true, desc: true, coins: true },
  motion: 'wipe',
  bigBadge: 'gold',
};

const MOTIONS = ['wipe', 'fade'];
const BIG_BADGES = ['gold', 'accent'];

/** 番号から型を引く。無い番号なら標準の型を返す（既存設定を壊さないための既定） */
export function resolveAlertStyle(defs, id) {
  const list = Array.isArray(defs) ? defs : [];
  return (
    list.find((d) => d?.id === id) ??
    list.find((d) => d?.id === STANDARD_STYLE.id) ??
    STANDARD_STYLE
  );
}

/** 型の定義1件の形を確かめる。問題があれば文の配列を返す（空なら正しい） */
export function validateStyleDef(def) {
  const issues = [];
  if (!def || typeof def !== 'object') return ['型の定義が物ではありません'];
  if (typeof def.id !== 'string' || !def.id) issues.push('id（番号）がありません');
  if (typeof def.band !== 'boolean') issues.push('band（帯の有無）は真偽で書きます');
  if (typeof def.badge?.show !== 'boolean') issues.push('badge.show（画像を出すか）は真偽で書きます');
  if (!(Number(def.badge?.imageSize) > 0)) issues.push('badge.imageSize（画像の大きさ）は正の数で書きます');
  if (typeof def.avatar?.show !== 'boolean') issues.push('avatar.show（顔を出すか）は真偽で書きます');
  if (!(Number(def.avatar?.size) > 0)) issues.push('avatar.size（顔の大きさ）は正の数で書きます');
  for (const key of ['name', 'desc', 'coins']) {
    if (typeof def.text?.[key] !== 'boolean') issues.push(`text.${key} は真偽で書きます`);
  }
  if (!MOTIONS.includes(def.motion)) issues.push(`motion（出方）は ${MOTIONS.join(' / ')} のどれかです`);
  if (!BIG_BADGES.includes(def.bigBadge)) issues.push(`bigBadge（高額時の面の色）は ${BIG_BADGES.join(' / ')} のどれかです`);
  return issues;
}
