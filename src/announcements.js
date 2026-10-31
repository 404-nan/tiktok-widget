// 製品の更新お知らせ（バージョン付き）。データはコードと一緒に版管理する src/announcements.json に置く。
// 運営がその場で書く連絡用のお知らせ（src/notes.js、置き場所は実行時データ）とは別物で、
// こちらは「どのバージョンで何が変わったか」を残すためのもの。書き方のルールは docs/VERSIONING.md。
import fs from 'node:fs';

export const ANNOUNCEMENT_TYPES = {
  new: '新機能',
  fix: '修正',
  add: '追加',
};

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

const compareVersion = (a, b) => {
  const pa = String(a).split('.').map((n) => Number(n) || 0);
  const pb = String(b).split('.').map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    if (pa[i] !== pb[i]) return pa[i] - pb[i];
  }
  return 0;
};

// 壊れたエントリが混ざっていても、画面が壊れないように正しいものだけを通す。
export function parseAnnouncements(raw) {
  const data = JSON.parse(raw);
  const list = Array.isArray(data) ? data : data?.announcements;
  if (!Array.isArray(list)) return [];
  return list
    .map((entry) => {
      const type = ANNOUNCEMENT_TYPES[entry?.type] ? entry.type : '';
      return {
        version: clean(entry?.version, 40),
        date: clean(entry?.date, 10),
        type,
        typeLabel: type ? ANNOUNCEMENT_TYPES[type] : '',
        title: clean(entry?.title, 200),
        body: clean(entry?.body, 5000),
      };
    })
    .filter((entry) => entry.version && /^\d{4}-\d{2}-\d{2}$/.test(entry.date) && entry.type && entry.title && entry.body)
    .sort((a, b) => b.date.localeCompare(a.date) || compareVersion(b.version, a.version));
}

export function listAnnouncements() {
  try {
    return parseAnnouncements(fs.readFileSync(new URL('./announcements.json', import.meta.url), 'utf8'));
  } catch {
    return [];
  }
}
