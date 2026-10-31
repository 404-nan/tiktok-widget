// パチンコ演出の条件判定と、ギフト連打を画面へ渡す指示を作る。
// ギフト名を先に見て、名前に合わないときだけコイン数の条件を使う。
import { eventCoinTotal, giftMatches } from './gifts.js';

const named = (entry, event) => event?.kind === 'gift' && giftMatches(event.gift, entry.gifts);

const coinMatch = (entry, event) => {
  if (event?.kind !== 'gift' || !(Number(entry.minCoins) > 0)) return false;
  const coins = eventCoinTotal(event);
  return coins >= Number(entry.minCoins) && (!Number(entry.maxCoins) || coins <= Number(entry.maxCoins));
};

/** ギフト名の条件を優先し、次にコイン数の条件で演出を選ぶ。 */
export function puchunFor(entries, event) {
  if (event?.kind !== 'gift') return undefined;
  const list = Array.isArray(entries) ? entries : [];
  return list.find((entry) => named(entry, event)) ?? list.find((entry) => coinMatch(entry, event));
}

/** ギフト1件を、連打の個数ぶん順番に流す指示へ展開する。 */
export function puchunPlays(config, event) {
  const entry = puchunFor(Object.entries(config?.puchuns ?? {}).map(([id, value]) => ({ id, ...value })), event);
  if (!entry) return [];
  const rawCount = Number(event.gift?.count);
  const count = Number.isInteger(rawCount) && rawCount > 0 ? rawCount : 1;
  return Array.from({ length: count }, () => ({
    id: entry.id,
    preset: entry.preset,
    ratio: entry.ratio,
    charImage: entry.charImage ?? '',
    texts: { ...(entry.texts ?? {}) },
  }));
}

/** ダッシュボードの「見本を出す」用に、保存せず1件だけ作る。 */
export function puchunTestPlay(config, id) {
  const entry = config?.puchuns?.[id];
  if (!entry) return null;
  return { id, preset: entry.preset, ratio: entry.ratio, texts: { ...(entry.texts ?? {}) } };
}
