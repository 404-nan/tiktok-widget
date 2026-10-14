// TikTok から受け取ったギフトの台帳。名前は TikTok が返したものだけを保存する。
import fs from 'node:fs';
import path from 'node:path';

const DAY = 24 * 60 * 60 * 1000;

// TikTok の gift/list（webcast_language=ja-JP）で取った日本語名の控え。取得できないときに ID→英語名の順で引く
let BUNDLED = { byId: new Map(), byName: new Map(), coins: new Map(), list: [] };
try {
  const raw = JSON.parse(fs.readFileSync(new URL('./gift-names-ja.json', import.meta.url), 'utf8'));
  for (const [id, [en, ja]] of Object.entries(raw.names ?? {})) {
    BUNDLED.byId.set(String(id), ja);
    const nameKey = String(en).trim().toLocaleLowerCase().replace(/\s+/g, '');
    if (nameKey && !BUNDLED.byName.has(nameKey)) {
      BUNDLED.byName.set(nameKey, ja);
      BUNDLED.list.push({ id: String(id), name: String(en), nameJa: ja });
    }
  }
} catch {}
try {
  // 公開 gift/list の diamond_count。名前の対応表とは別に置く（名前の形は変えない）
  const raw = JSON.parse(fs.readFileSync(new URL('./gift-coins.json', import.meta.url), 'utf8'));
  for (const [id, n] of Object.entries(raw.coins ?? {})) {
    const coins = coinCount({ diamonds: n });
    if (coins != null) BUNDLED.coins.set(String(id), coins);
  }
} catch {}
/** 控えにある全ギフト。コインが分かっているものは数、無いものは null（画面では「? コイン」） */
export function bundledGifts() {
  return BUNDLED.list.map((g) => ({ ...g, diamonds: BUNDLED.coins.has(g.id) ? BUNDLED.coins.get(g.id) : null }));
}

/** gift-coins.json の1個あたりのコイン。表に無いときは null（0 にはしない） */
export function bundledCoinCount(id) {
  const key = String(id ?? '').trim();
  return key && BUNDLED.coins.has(key) ? BUNDLED.coins.get(key) : null;
}

const nameKey = (value) => text(value).toLocaleLowerCase().replace(/\s+/g, '');

export function bundledNameJa(gift) {
  const id = String(gift?.id ?? gift?.giftId ?? '').trim();
  if (id && BUNDLED.byId.has(id)) return BUNDLED.byId.get(id);
  const key = nameKey(gift?.name ?? gift?.giftName);
  return (key && BUNDLED.byName.get(key)) || null;
}

const text = (v) => (v == null ? '' : String(v).trim());

export function giftDisplayName(gift) {
  return text(gift?.nameJa) || bundledNameJa(gift) || text(gift?.name) || text(gift?.id) || 'Gift';
}

export function giftMatches(gift, values) {
  if (!gift || !Array.isArray(values) || !values.length) return false;
  const keys = [gift.id, gift.name, gift.nameJa].map(nameKey).filter(Boolean);
  return values.some((value) => keys.includes(nameKey(value)));
}

/**
 * 1個あたりのコイン。TikTok の一覧は diamond_count、配信イベントは diamondCount、
 * テスト用は diamonds / coins。文字列の "5000" も数にする。無い・壊れているときは null（0 や NaN にしない）
 */
export function coinCount(gift) {
  if (gift == null || typeof gift !== 'object') return null;
  const raw = gift.diamonds ?? gift.diamond_count ?? gift.diamondCount ?? gift.coins ?? gift.coin_count ?? gift.coinCount;
  if (raw == null || raw === '') return null;
  const n = typeof raw === 'number' ? raw : Number(String(raw).replace(/,/g, '').trim());
  return Number.isFinite(n) ? n : null;
}

/** 集計に足すコイン。欠損・undefined・NaN・壊れた文字は 0。"1,000" は 1000 */
export function addCoins(current, add) {
  const base = coinCount({ diamondCount: current });
  const extra = coinCount({ diamondCount: add });
  return (base ?? 0) + (extra ?? 0);
}

/**
 * 1回のギフトで足すコイン。
 * totalDiamonds が数（または "1,000" のような文字）ならそれ。
 * 無ければ 1個あたり × 個数。欠損・undefined・壊れた値は 0（NaN にしない）
 */
export function eventCoinTotal(event) {
  const direct = event?.totalDiamonds;
  if (direct != null && direct !== '') {
    const n = coinCount({ diamondCount: direct });
    if (n != null) return n;
  }
  const gift = event?.gift;
  const each = coinCount(gift);
  if (each == null) return 0;
  const rawCount = gift?.count;
  if (rawCount == null || rawCount === '') return each;
  const count = coinCount({ diamondCount: rawCount });
  if (count == null) return 0;
  return each * Math.max(0, count);
}

/** 画面に出すコイン。数なら「5000 コイン」、分からなければ「? コイン」（NaN にはしない） */
export function coinText(diamonds) {
  if (diamonds == null || diamonds === '') return '? コイン';
  const n = Number(diamonds);
  if (!Number.isFinite(n)) return '? コイン';
  return `${n} コイン`;
}

const goodCoins = (n) => (typeof n === 'number' && Number.isFinite(n) && n > 0 ? n : null);

/** 先に入っている正のコインを残し、無いときだけあとの一覧で埋める */
function preferCoins(prev, next) {
  return goodCoins(prev) ?? goodCoins(next) ?? (Number.isFinite(prev) ? prev : (Number.isFinite(next) ? next : null));
}

export function normalizeGiftRecord(gift) {
  const id = text(gift?.id ?? gift?.giftId);
  const name = text(gift?.name ?? gift?.giftName);
  if (!id || !name) return null;
  return {
    id,
    name,
    nameJa: text(gift?.nameJa) || bundledNameJa(gift) || null,
    diamonds: coinCount(gift),
    image: gift?.image ?? gift?.icon ?? null,
  };
}

/**
 * テスト送信などのギフト一覧。id が同じものは1つにまとめ、コインのキーが違う・片方にしか無いときも数を落とさない。
 * lists: ギフトの配列を、優先したい順に並べる
 */
export function mergeGiftCatalog(lists) {
  const byId = new Map();
  for (const list of lists) {
    for (const item of list ?? []) {
      const row = normalizeGiftRecord(item);
      if (!row) continue;
      const prev = byId.get(row.id);
      if (!prev) {
        byId.set(row.id, { ...row, seen: Boolean(item?.seen), icon: item?.icon ?? null });
        continue;
      }
      byId.set(row.id, {
        ...prev,
        ...row,
        name: row.name || prev.name,
        nameJa: row.nameJa || prev.nameJa || null,
        image: row.image || prev.image || null,
        icon: item?.icon || prev.icon || null,
        seen: Boolean(prev.seen || item?.seen),
        diamonds: preferCoins(prev.diamonds, row.diamonds),
      });
    }
  }
  return [...byId.values()];
}

export class GiftCatalog {
  constructor(file) {
    this.file = file;
    this.records = new Map();
    this.updatedAt = 0;
    this.loggedPairs = false;
    this.load();
  }

  load() {
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.updatedAt = Number(saved.updatedAt) || 0;
      for (const item of saved.gifts ?? []) {
        const gift = normalizeGiftRecord(item);
        if (gift) this.records.set(gift.id, gift);
      }
    } catch {}
    return this.list();
  }

  list() { return [...this.records.values()]; }
  stale(now = Date.now()) { return now - this.updatedAt >= DAY; }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(this.file, `${JSON.stringify({ updatedAt: this.updatedAt, gifts: this.list() }, null, 2)}\n`);
  }

  import(list, now = Date.now()) {
    let count = 0;
    for (const item of list ?? []) {
      const gift = normalizeGiftRecord(item);
      if (!gift) continue;
      const old = this.records.get(gift.id);
      // 新しい一覧にコインがあればそれで更新し、無い再取得では前の数を残す
      const diamonds = preferCoins(gift.diamonds, old?.diamonds);
      this.records.set(gift.id, { ...old, ...gift, diamonds, nameJa: gift.nameJa ?? old?.nameJa ?? null, image: gift.image ?? old?.image ?? null });
      count++;
    }
    if (count) { this.updatedAt = now; this.save(); }
    return { count, gifts: this.list() };
  }

  find(value) {
    const key = text(value).toLocaleLowerCase();
    return this.list().find((g) => [g.id, g.name, g.nameJa].some((v) => text(v).toLocaleLowerCase() === key)) ?? null;
  }

  enrich(gift) {
    const known = this.records.get(text(gift?.id)) ?? this.find(gift?.name);
    return known ? { ...gift, nameJa: known.nameJa ?? bundledNameJa(gift) } : { ...gift, nameJa: bundledNameJa(gift) };
  }

  async refresh({ fetchGifts, timeoutMs = 10_000 }) {
    if (!this.stale()) return { refreshed: false, gifts: this.list() };
    let timeoutTimer;
    try {
      const deadline = Date.now() + timeoutMs;
      const [english, japanese] = await Promise.race([
        Promise.all([fetchGifts('en'), fetchGifts('ja')]),
        new Promise((_, reject) => {
          timeoutTimer = setTimeout(() => reject(new Error('ギフト一覧の取得が10秒で終わりませんでした')), timeoutMs);
        }),
      ]);
      if (Date.now() > deadline) throw new Error('ギフト一覧の取得が10秒で終わりませんでした');
      const japaneseById = new Map((japanese ?? []).map((gift) => [text(gift?.id ?? gift?.giftId), gift]));
      const paired = (english ?? []).map((gift) => {
        const japaneseGift = japaneseById.get(text(gift?.id ?? gift?.giftId));
        const japaneseName = text(japaneseGift?.name ?? japaneseGift?.giftName);
        return { ...gift, nameJa: japaneseName && japaneseName !== text(gift?.name ?? gift?.giftName) ? japaneseName : (bundledNameJa(gift) ?? null) };
      });
      const imported = this.import(paired, Date.now());
      if (imported.count && !this.loggedPairs) {
        this.loggedPairs = true;
        for (const gift of paired.slice(0, 8)) {
          console.info(`[gifts] ${gift.id ?? gift.giftId} ${gift.name ?? gift.giftName} → ${text(gift.nameJa) || text(gift.name ?? gift.giftName)}`);
        }
      }
      return { refreshed: true, ...imported };
    } catch (error) {
      return { refreshed: false, gifts: this.list(), error };
    } finally {
      clearTimeout(timeoutTimer);
    }
  }
}
