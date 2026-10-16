// tiktok-live-connector が返す生データ（protobuf v3 由来）を、ウィジェットが扱いやすい形にそろえる。
// ライブラリのバージョンによってフィールド名が変わるので、旧形式（giftDetails / profilePicture など）も見る。
import { bundledCoinCount, coinCount } from './gifts.js';

const firstUrl = (...images) => {
  for (const img of images) {
    const url = img?.mUrls?.[0] ?? img?.urls?.[0] ?? img?.urlList?.[0] ?? img?.url_list?.[0];
    if (url) return url;
  }
  return null;
};

const toNumber = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

/** ギフト1個のコイン。オブジェクトなら各キー、生の値ならその数。読めなければ null */
function pickCoins(gift) {
  if (gift == null || gift === '') return null;
  return coinCount(typeof gift === 'object' ? gift : { diamondCount: gift });
}

export function normalizeUser(u) {
  if (!u) return { id: '', name: '名無し', avatar: null };
  const id = u.uniqueId || u.displayId || u.username || '';
  return {
    id,
    name: u.nickname || id || '名無し',
    avatar: firstUrl(u.avatarThumb, u.avatarMedium, u.profilePicture),
  };
}

/**
 * ギフト。連打（ストリーク）可能なギフトは連打が終わった最後のイベントだけを採用し、
 * 途中経過は null を返す。
 */
export function normalizeGift(data, catalog = null) {
  const g = data.gift;
  const d = data.giftDetails;
  const x = data.extendedGiftInfo;
  const type = g?.type ?? d?.giftType ?? x?.type;
  const streakable = type === 1;
  if (streakable && !data.repeatEnd) return null;

  // イベントにコインがあればそれを使う（0 もそのまま）。無いときだけ gift-coins.json で補い、表にも無ければ 0
  const giftId = String(data.giftId ?? g?.id ?? d?.id ?? x?.id ?? '');
  const known = pickCoins(g) ?? pickCoins(d) ?? pickCoins(x);
  const diamonds = known ?? bundledCoinCount(giftId) ?? 0;
  const count = Math.max(1, toNumber(data.repeatCount) || 1);
  const gift = {
    kind: 'gift',
    user: normalizeUser(data.user),
    gift: {
      id: String(data.giftId ?? g?.id ?? ''),
      name: g?.name || d?.giftName || x?.name || 'Gift',
      nameJa: null,
      image: firstUrl(g?.image, g?.icon, x?.image) || d?.giftImage?.giftPictureUrl || null,
      diamonds,
      count,
    },
    totalDiamonds: diamonds * count,
  };
  gift.gift = catalog?.enrich(gift.gift) ?? gift.gift;
  return gift;
}

export function normalizeLike(data) {
  return {
    kind: 'like',
    user: normalizeUser(data.user),
    count: toNumber(data.count ?? data.likeCount),
    total: toNumber(data.total ?? data.totalLikeCount),
  };
}

export function normalizeViewers(data) {
  return { kind: 'viewers', viewers: toNumber(data.total ?? data.viewerCount) };
}

export function normalizeChat(data) {
  return { kind: 'chat', user: normalizeUser(data.user), text: data.content ?? data.comment ?? '' };
}

export const normalizeFollow = (data) => ({ kind: 'follow', user: normalizeUser(data.user) });
export const normalizeShare = (data) => ({ kind: 'share', user: normalizeUser(data.user) });
export const normalizeMember = (data) => ({ kind: 'member', user: normalizeUser(data.user) });
