// 画面テストの候補(artifacts/candidates/)を見本にする。めにくんが画像を見て、よければ実行する。AIは実行しない。
//   npm run shot:approve -- tate/cutin yoko/cutin   … 選んだものだけ
//   npm run shot:approve -- --all                   … 候補を全部
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cand = path.join(root, 'artifacts', 'candidates');
const snapDir = path.join(root, 'test', 'visual', 'widgets.spec.mjs-snapshots');
const args = process.argv.slice(2);
if (!fs.existsSync(cand)) { console.error('候補がありません。先に npm run check:ui を実行してください'); process.exit(1); }
const all = fs.readdirSync(cand).flatMap((proj) => fs.readdirSync(path.join(cand, proj)).map((f) => `${proj}/${f.replace(/\.png$/, '')}`));
const pick = args.includes('--all') ? all : args.filter((a) => all.includes(a));
if (!pick.length) { console.error(`どれを見本にするか指定してください: ${all.join(' ')} または --all`); process.exit(2); }
fs.mkdirSync(snapDir, { recursive: true });
for (const item of pick) {
  const [proj, name] = item.split('/');
  fs.copyFileSync(path.join(cand, proj, `${name}.png`), path.join(snapDir, `${name}-${proj}.png`));
  console.log(`見本にしました: ${name}-${proj}.png`);
}
