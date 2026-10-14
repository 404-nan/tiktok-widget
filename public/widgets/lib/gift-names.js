// ギフトの日本語表示名。データは scripts/build-gift-names.js が生成する。
import table from './gift-names-ja.js';

const compact = (value) => String(value ?? '').trim().toLowerCase().replace(/\s+/g, '');

/** ギフトオブジェクト、ID、英語名のいずれかから日本語名を引く。無ければ渡された名前（または文字列）を返す */
export function giftNameJa(value) {
  if (value != null && typeof value === 'object') {
    const id = String(value.id ?? value.giftId ?? '').trim();
    if (id && table.byId[id]) return table.byId[id];
    const name = String(value.name ?? value.giftName ?? '');
    const key = compact(name);
    if (key && table.byName[key]) return table.byName[key];
    return name.trim() || id;
  }
  const raw = value == null ? '' : String(value);
  const trimmed = raw.trim();
  if (trimmed && table.byId[trimmed]) return table.byId[trimmed];
  const key = compact(trimmed);
  if (key && table.byName[key]) return table.byName[key];
  return raw;
}

/** 画面に出す名前。GiftID → 英語名 → nameJa → 今の名前。表に無いときだけ nameJa を使う */
export function giftLabel(gift) {
  if (gift != null && typeof gift === 'object') {
    const id = String(gift.id ?? gift.giftId ?? '').trim();
    if (id && table.byId[id]) return table.byId[id];
    const name = String(gift.name ?? gift.giftName ?? '').trim();
    const key = compact(name);
    if (key && table.byName[key]) return table.byName[key];
    const nameJa = String(gift.nameJa ?? '').trim();
    return nameJa || name || id || 'Gift';
  }
  const named = giftNameJa(gift);
  if (named) return named;
  if (gift == null || gift === '') return 'Gift';
  return String(gift);
}
