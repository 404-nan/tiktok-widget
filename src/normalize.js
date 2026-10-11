// tiktok-live-connector が返す生データ（protobuf v3 由来）を、ウィジェットが扱いやすい形にそろえる。
// ライブラリのバージョンによってフィールド名が変わるので、旧形式（giftDetails / profilePicture など）も見る。

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
export function normalizeGift(data) {
  const g = data.gift;
  const d = data.giftDetails;
  const x = data.extendedGiftInfo;
  const type = g?.type ?? d?.giftType ?? x?.type;
  const streakable = type === 1;
  if (streakable && !data.repeatEnd) return null;

  const diamonds = toNumber(g?.diamondCount ?? d?.diamondCount ?? x?.diamond_count);
  const count = Math.max(1, toNumber(data.repeatCount) || 1);
  return {
    kind: 'gift',
    user: normalizeUser(data.user),
    gift: {
      id: String(data.giftId ?? g?.id ?? ''),
      name: g?.name || d?.giftName || x?.name || 'Gift',
      image: firstUrl(g?.image, g?.icon, x?.image) || d?.giftImage?.giftPictureUrl || null,
      diamonds,
      count,
    },
    totalDiamonds: diamonds * count,
  };
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

// --- PK バトル ---
// LinkMicBattle の action が FINISH のとき、battleResult（配信者の userId → 勝ち/負け/引き分け）に結果が入る。
// 自分がどれかは anchorsInfo の roomId か displayId（ユーザー名）で探す。
const BATTLE_FINISH = 5;
const RESULTS = { 0: 'win', 1: 'lose', 2: 'draw', WIN: 'win', LOSE: 'lose', DRAW: 'draw' };

const entriesOf = (m) => (Array.isArray(m) ? m.map((w) => [w.key, w.value]) : Object.entries(m ?? {}));

/** 自分と相手の配信者（anchorsInfo から） */
function battleAnchors(data, { roomId, username }) {
  const anchors = entriesOf(data.anchorsInfo).map(([key, v]) => ({ key: String(key), ...(v?.user ?? {}) }));
  const isMe = (a) =>
    (roomId && String(a.roomId) === String(roomId)) ||
    (username && String(a.displayId ?? '').toLowerCase() === String(username).toLowerCase());
  const me = anchors.find(isMe);
  const others = anchors.filter((a) => a !== me);
  return { me, others };
}

/** 対戦中の点数（LinkMicArmies）。battleId ごとに最新を覚えておき、結果がないときの判定に使う */
export function battleScores(data) {
  const scores = {};
  for (const [key, v] of entriesOf(data.armies)) scores[String(v?.anchorIdStr || key)] = toNumber(v?.hostscore);
  return { battleId: String(data.battleId ?? ''), scores };
}

/**
 * PK バトルの結果。終わったときだけ { kind: 'battle', result, battleId, opponent, score } を返す。
 * lastScores: battleScores で覚えた最新の点数（battleResult が空のときに比べる）
 */
export function normalizeBattle(data, ctx = {}, lastScores = null) {
  const action = data.action;
  if (action !== BATTLE_FINISH && action !== 'FINISH') return null;
  const battleId = String(data.battleId ?? data.battleSettings?.battleId ?? '');
  const { me, others } = battleAnchors(data, ctx);
  const results = Object.fromEntries(entriesOf(data.battleResult).map(([k, v]) => [String(v?.userId || k), v]));
  const myId = me?.userId ?? me?.key;
  let result = null;
  let mine = myId != null ? results[String(myId)] : null;
  if (mine) result = RESULTS[mine.result] ?? null;
  // 結果が入っていないときは、最後に届いた点数で比べる
  const scores = lastScores?.battleId === battleId ? lastScores.scores : {};
  const myScore = mine ? toNumber(mine.score) : toNumber(scores[String(myId)]);
  const otherScores = others.map((o) => (results[String(o.userId ?? o.key)] ? toNumber(results[String(o.userId ?? o.key)].score) : toNumber(scores[String(o.userId ?? o.key)])));
  const best = otherScores.length ? Math.max(...otherScores) : 0;
  if (!result && myId != null && (myScore || best)) result = myScore > best ? 'win' : myScore < best ? 'lose' : 'draw';
  if (!result) return null;
  const o = others[0];
  return {
    kind: 'battle',
    result,
    battleId,
    opponent: o ? { id: o.displayId || '', name: o.nickName || o.displayId || '相手', avatar: firstUrl(o.avatarThumb) } : null,
    score: { me: myScore, them: best },
  };
}
