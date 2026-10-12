// TikTok から受け取ったギフトの台帳。名前は TikTok が返したものだけを保存する。
import fs from 'node:fs';
import path from 'node:path';

const DAY = 24 * 60 * 60 * 1000;

const text = (v) => (v == null ? '' : String(v).trim());

export function giftDisplayName(gift) {
  return text(gift?.nameJa) || text(gift?.name) || text(gift?.id) || 'Gift';
}

export function giftMatches(gift, values) {
  if (!gift || !Array.isArray(values) || !values.length) return false;
  const keys = [gift.id, gift.name, gift.nameJa].map((v) => text(v).toLocaleLowerCase()).filter(Boolean);
  return values.some((value) => keys.includes(text(value).toLocaleLowerCase()));
}

export function normalizeGiftRecord(gift) {
  const id = text(gift?.id ?? gift?.giftId);
  const name = text(gift?.name ?? gift?.giftName);
  if (!id || !name) return null;
  return {
    id,
    name,
    nameJa: text(gift?.nameJa) || null,
    diamonds: Number(gift?.diamonds ?? gift?.diamond_count ?? 0) || 0,
    image: gift?.image ?? gift?.icon ?? null,
  };
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
      this.records.set(gift.id, { ...old, ...gift, nameJa: gift.nameJa ?? old?.nameJa ?? null });
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
    return known ? { ...gift, nameJa: known.nameJa } : { ...gift, nameJa: null };
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
        return { ...gift, nameJa: japaneseName && japaneseName !== text(gift?.name ?? gift?.giftName) ? japaneseName : null };
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
