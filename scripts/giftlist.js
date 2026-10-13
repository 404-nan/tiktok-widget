#!/usr/bin/env node
// ギフトの日本語名の対応表 src/gift-names-ja.json を作り直す。
// TikTok の公開 gift/list API を、署名なしで英語（webcast_language=en）と日本語（webcast_language=ja-JP）の2回呼び、GiftID で対にする。
// 注意: webcast_language=ja だけだと英語名で返る。必ず ja-JP。ログイン・API キー・有料プランは不要。
// 使い方: node scripts/giftlist.js [roomId ...]   （roomId を付けるとその部屋のギフトも足す。無くても約700件取れる）
import fs from 'node:fs';
const OUT = new URL('../src/gift-names-ja.json', import.meta.url);
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126 Safari/537.36';
async function fetchList(lang, roomId) {
  const q = new URLSearchParams({ aid: '1988', device_platform: 'web', webcast_language: lang, app_language: lang, region: 'JP', priority_region: 'JP' });
  if (roomId) q.set('room_id', roomId);
  const res = await fetch(`https://webcast.tiktok.com/webcast/gift/list/?${q}`, { headers: { 'User-Agent': UA } });
  const json = await res.json();
  return json?.data?.gifts ?? [];
}
const rooms = [null, ...process.argv.slice(2)];
const en = new Map(), ja = new Map();
for (const room of rooms) {
  for (const g of await fetchList('en', room)) if (!en.has(String(g.id))) en.set(String(g.id), g.name);
  for (const g of await fetchList('ja-JP', room)) if (!ja.has(String(g.id))) ja.set(String(g.id), g.name);
}
const old = fs.existsSync(OUT) ? JSON.parse(fs.readFileSync(OUT, 'utf8')).names ?? {} : {};
const names = { ...old }; // 前に取れたものは残す（そのときの部屋にしか無いギフトがあるため）
let added = 0;
for (const [id, nameEn] of en) {
  const nameJa = ja.get(id);
  if (nameJa && nameJa !== nameEn) { if (!names[id]) added++; names[id] = [nameEn, nameJa]; }
}
if (ja.size && [...ja.values()].every((n, i, a) => en.get([...ja.keys()][i]) === n)) {
  console.error('日本語名が1件も返っていません（webcast_language=ja-JP になっているか確認）'); process.exit(1);
}
fs.writeFileSync(OUT, JSON.stringify({ source: `TikTok webcast gift/list (webcast_language=ja-JP), ${new Date().toISOString().slice(0, 10)}`, names }, null, 0).replace(/\],"/g, '],\n"') + '\n');
console.log(`en ${en.size} / ja ${ja.size} → 対応表 ${Object.keys(names).length} 件（新規 ${added}）`);
