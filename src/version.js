// 製品バージョンの正本は package.json の version 欄。ここはそれを読むだけの窓口で、
// バージョンの数字を書く場所は package.json 以外に作らない。
// 上げ方と、お知らせ（src/announcements.json）の書き方は docs/VERSIONING.md にある。
import fs from 'node:fs';

const pkg = JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

export const PRODUCT_VERSION = String(pkg.version ?? '').trim();
