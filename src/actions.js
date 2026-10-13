// ルーレットの当たりなどで実行する動作。
// 設定の actions を検証し、タイマー・WIN数・RUSH・メディア・ボス・ガチャへ渡す。

export const ACTION_TYPES = ['timer.add', 'wins.add', 'rush.start', 'media.play', 'boss.damage', 'boss.heal', 'gacha.start'];
const ID_RE = /^[A-Za-z0-9_-]+$/;

/** 動作1件を検証する。壊れていれば null（issues.errors に理由） */
export function parseAction(raw, where, issues = { errors: [], warnings: [] }) {
  const before = issues.errors.length;
  const err = (msg) => issues.errors.push(`${where}: ${msg}`);
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    err('動作は { type: ... } で書いてください');
    return null;
  }
  const type = String(raw.type ?? '');
  if (!ACTION_TYPES.includes(type)) {
    err(`type は ${ACTION_TYPES.join(' / ')} のどれかです`);
    return null;
  }
  const action = { type };
  if (raw.id != null && raw.id !== '') {
    const id = String(raw.id);
    if (!ID_RE.test(id)) err('id は英数字と - _ だけにしてください');
    else action.id = id;
  }
  if (type === 'timer.add') {
    const n = Number(raw.seconds);
    if (!Number.isFinite(n) || n === 0) err('seconds に 0 以外の秒数を入れてください（マイナスで減らす）');
    else action.seconds = n;
  } else if (type === 'wins.add') {
    const n = Number(raw.n);
    if (!Number.isInteger(n) || n === 0) err('n に 0 以外の整数を入れてください（マイナスで減らす）');
    else action.n = n;
  } else if (type === 'media.play') {
    const mediaId = String(raw.mediaId ?? '').trim();
    if (!mediaId) err('mediaId が必要です');
    else action.mediaId = mediaId;
  } else if (type === 'boss.damage' || type === 'boss.heal') {
    const n = Number(raw.amount);
    if (!Number.isFinite(n) || n <= 0) err('amount に 1 以上の数を入れてください');
    else action.amount = n;
  }
  const known = ['type', 'id', 'seconds', 'n', 'mediaId', 'amount'];
  for (const key of Object.keys(raw)) if (!known.includes(key)) issues.warnings.push(`${where}.${key}: 使われない項目です`);
  if (issues.errors.length > before) return null;
  return action;
}

/** 動作の一覧。壊れた要素は捨てて、エラーは issues に積む */
export function checkActions(value, where, issues) {
  if (value == null) return [];
  if (!Array.isArray(value)) {
    issues.errors.push(`${where}: 動作は一覧で書いてください`);
    return [];
  }
  return value.map((raw, i) => parseAction(raw, `${where}[${i}]`, issues)).filter(Boolean);
}

function runOne(action, deps) {
  const id = action.id ?? null;
  switch (action.type) {
    case 'timer.add':
      if (!deps.timer) throw new Error('タイマーがありません');
      return deps.timer.apply(id, 'add', action.seconds);
    case 'wins.add':
      if (!deps.wins) throw new Error('WIN数がありません');
      return deps.wins.apply(id, 'add', action.n);
    case 'rush.start': {
      if (!deps.rush) throw new Error('RUSHがありません');
      const out = deps.rush.start({ reason: 'action' });
      if (!out) throw new Error('RUSH はオフです');
      return out;
    }
    case 'media.play':
      if (!deps.media) throw new Error('メディア通知がありません');
      return deps.media.play(action.mediaId, { source: 'action' });
    case 'boss.damage':
      if (!deps.boss) throw new Error('ボスがありません');
      return deps.boss.apply(id, 'damage', action.amount);
    case 'boss.heal':
      if (!deps.boss) throw new Error('ボスがありません');
      return deps.boss.healBy(id, action.amount);
    case 'gacha.start': {
      if (!deps.gacha) throw new Error('ガチャがありません');
      const started = deps.gacha.start({ kind: 'action', source: 'action' });
      if (!started) throw new Error('ガチャはオフです');
      return started;
    }
    default:
      throw new Error(`未対応の動作です: ${action.type}`);
  }
}

/** 動作を順に実行する。1件が失敗しても残りは続ける */
export function runActions(actions, deps, meta = {}) {
  const results = [];
  const list = Array.isArray(actions) ? actions : [];
  list.forEach((raw, i) => {
    const issues = { errors: [], warnings: [] };
    const action = parseAction(raw, `actions[${i}]`, issues);
    if (!action) {
      results.push({ ok: false, action: raw, error: issues.errors.join(' / ') || '不正な動作です' });
      return;
    }
    try {
      const result = runOne(action, deps);
      results.push({ ok: true, action, result });
      deps.bus?.emit('action.done', { action, result, ...meta });
    } catch (err) {
      results.push({ ok: false, action, error: err.message });
      deps.bus?.emit('action.error', { action, error: err.message, ...meta });
    }
  });
  return results;
}

/** ルーレットの当たり（Hub の roulette）を roulette.result にして、項目の actions を実行する */
export function bindRouletteActions(hub, bus, getDeps) {
  hub.on('roulette', (payload) => {
    const actions = Array.isArray(payload?.item?.actions) ? payload.item.actions : [];
    bus.emit('roulette.result', {
      rouletteId: payload?.roulette?.id ?? null,
      label: payload?.item?.label ?? '',
      index: payload?.spin?.index ?? null,
      actions,
      trigger: payload?.trigger ?? null,
      spin: payload?.spin ?? null,
    });
    return runActions(actions, getDeps(), { source: 'roulette', rouletteId: payload?.roulette?.id ?? null });
  });
}
