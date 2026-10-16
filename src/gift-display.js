// 画面に出すギフト名。判定（ID・英語名・日本語名の一致）には使わない。
// 引き方: GiftID → 英語名（大文字小文字と空白は無視）→ nameJa → そのまま。表は src/gift-names-ja.json。
import fs from 'node:fs';

let raw = { names: {} };
try {
  raw = JSON.parse(fs.readFileSync(new URL('./gift-names-ja.json', import.meta.url), 'utf8'));
} catch {}

const byId = new Map();
const byName = new Map();
const list = [];
for (const [id, pair] of Object.entries(raw.names ?? {})) {
  const en = text(pair?.[0]);
  const ja = text(pair?.[1]);
  if (!ja) continue;
  byId.set(String(id), ja);
  const key = compact(en);
  if (key && !byName.has(key)) {
    byName.set(key, ja);
    list.push({ id: String(id), name: en, nameJa: ja });
  }
}

function text(v) {
  return v == null ? '' : String(v).trim();
}

/** Heart Me と HeartMe を同じ英語名として引く */
function compact(v) {
  return text(v).toLowerCase().replace(/\s+/g, '');
}

/** ブラウザへ渡す対応表（{ names: { id: [英語, 日本語] } }） */
export function giftNamesDocument() {
  return raw;
}

/** 控えの一覧（コイン数・画像はなし）。英語名が同じものは最初の1件 */
export function bundledGiftList() {
  return list.map((g) => ({ ...g }));
}

/** 対応表にあれば日本語、なければ null。表示用 */
export function lookupGiftJa(gift) {
  if (gift == null || gift === '') return null;
  if (typeof gift === 'string' || typeof gift === 'number') {
    const rawName = text(gift);
    if (!rawName) return null;
    return byId.get(rawName) ?? byName.get(compact(rawName)) ?? null;
  }
  const id = text(gift.id ?? gift.giftId);
  if (id && byId.has(id)) return byId.get(id);
  const name = text(gift.name ?? gift.giftName);
  if (name && byName.has(compact(name))) return byName.get(compact(name));
  return null;
}

/** 画面に出す名前。文字列でも { id, name, nameJa } でもよい */
export function giftDisplayName(gift) {
  const ja = lookupGiftJa(gift);
  if (ja) return ja;
  if (gift == null || gift === '') return 'Gift';
  if (typeof gift === 'string' || typeof gift === 'number') return text(gift) || 'Gift';
  return text(gift.nameJa) || text(gift.name) || text(gift.giftName) || text(gift.id) || text(gift.giftId) || 'Gift';
}

/** アラート・カットインに出す「バラ ×2」 */
export function giftOverlayText(gift) {
  const count = Number(gift?.count) || 1;
  return `${giftDisplayName(gift)} ×${count}`;
}

/**
 * ルーレットの下の案内。「ドーナツ / 100コイン以上のギフトでガチャ」
 * format はコイン数の表示（ウィジェットの fmt を渡せる）
 */
export function rouletteTriggerText(r, format = (n) => String(n)) {
  if (r?.hint) return String(r.hint);
  const parts = [];
  const gifts = Array.isArray(r?.gifts) ? r.gifts : [];
  if (gifts.length) parts.push(gifts.map((g) => giftDisplayName(g)).join('・'));
  const min = Number(r?.minCoins) || 0;
  const max = Number(r?.maxCoins) || 0;
  if (min > 0) parts.push(max ? `${format(min)}〜${format(max)}コインのギフト` : `${format(min)}コイン以上のギフト`);
  const events = Array.isArray(r?.events) ? r.events : [];
  if (events.includes('follow')) parts.push('フォロー');
  if (events.includes('share')) parts.push('シェア');
  const title = r?.name || 'ルーレット';
  return parts.length ? `${parts.join(' / ')}で${title}` : title;
}

/** 延長タイマーの案内に出すギフト名（最大2件、秒数が正のもの） */
export function timerTriggerText(timer) {
  const names = [];
  const rules = Array.isArray(timer?.rules) ? timer.rules : [];
  for (const rule of rules) {
    if (rule?.gifts?.length && Number(rule.seconds) > 0) {
      names.push(giftDisplayName(rule.gifts[0]));
      if (names.length >= 2) break;
    }
  }
  return names.join(' / ');
}
