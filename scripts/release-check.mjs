// 出す前の関門を一続きで回す道具（2026-11-22）。
// 使い方: node scripts/release-check.mjs [--base <比較する先>] [--skip-tests]
// 見る物: 一時置き場の空き／全体テスト／版数とお知らせの対応／保存形式を変えた時の読み込みテストの有無。
// テストの中の関門（設定の届き方・お知らせの形・外部読み込み）は test/release-gates.test.js が毎回見ている。
import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, readdirSync, mkdirSync, rmSync, statfsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const base = args.includes('--base') ? args[args.indexOf('--base') + 1] : 'HEAD';
const skipTests = args.includes('--skip-tests');
const root = process.cwd();
let failed = 0;
const say = (mark, name, detail = '') => { console.log(`${mark} ${name}${detail ? ` — ${detail}` : ''}`); if (mark === '✖') failed += 1; };
const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).trim();

// 1. 一時置き場の空き（満杯だとテストが大量に誤って落ちる。2026-11-21 の事故）
try {
  const free = Number(statfsSync('/tmp').bavail) * Number(statfsSync('/tmp').bsize);
  if (free < 200 * 1024 * 1024) say('✖', '一時置き場の空き', `残り ${Math.round(free / 1048576)}MB（200MB 未満）。/tmp の残骸を消してから回すこと`);
  else say('✔', '一時置き場の空き', `残り ${Math.round(free / 1048576)}MB`);
} catch { say('✖', '一時置き場の空き', '確認できなかった'); }

// 2. 全体テスト（/tmp の中の専用の置き場で回し、終わったら消す。
// 置き場を置く場所でテストの結果が変わる物がある（メディアのテストが実測で確認済み）ので、通常の実行と同じ /tmp の中にする）
if (!skipTests) {
  const tmp = join(process.env.TMPDIR || '/tmp', 'release-gates-tmp');
  mkdirSync(tmp, { recursive: true });
  const run = spawnSync('node', ['--test', ...readdirSync(join(root, 'test')).filter((f) => f.endsWith('.test.js')).map((f) => join('test', f))], { cwd: root, encoding: 'utf8', env: { ...process.env, TMPDIR: tmp }, timeout: 15 * 60 * 1000 });
  const timedOut = run.error?.code === 'ETIMEDOUT';
  const counts = timedOut ? null : (run.stdout + run.stderr).match(/ℹ tests (\d+)[\s\S]*?ℹ pass (\d+)[\s\S]*?ℹ fail (\d+)/);
  rmSync(tmp, { recursive: true, force: true });
  if (timedOut) say('✖', '全体テスト', '15分で終わらなかった（止まったテストが無いか、ログで切り分けること）');
  else if (counts && counts[3] === '0') say('✔', '全体テスト', `${counts[1]} 件・失敗 0`);
  else {
    writeFileSync(join(root, 'release-check-test.log'), (run.stdout ?? '') + (run.stderr ?? ''));
    say('✖', '全体テスト', `${counts ? `${counts[1]} 件・失敗 ${counts[3]}` : '結果を読めなかった'}（記録: release-check-test.log）`);
  }
} else say('–', '全体テスト', '省略（--skip-tests）');

// 3. 版数とお知らせの対応（利用者に見える変更があるのに、版数もお知らせも無い束を止める）
const changed = git('diff', '--name-only', `${base}..HEAD`).split('\n').filter(Boolean);
const userVisible = changed.filter((f) => f.startsWith('public/') || f === 'src/schema.js');
const pkgNow = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version;
let pkgBase = pkgNow;
try { pkgBase = JSON.parse(git('show', `${base}:package.json`)).version; } catch { /* 土台に package.json が無い場合は今の版数で見る */ }
if (userVisible.length > 0) {
  if (pkgNow === pkgBase) say('✖', '版数とお知らせ', `利用者に見える変更 ${userVisible.length} 件があるのに版数が ${pkgNow} のまま。版数を上げてお知らせを足すこと`);
  else say('✔', '版数とお知らせ', `${pkgBase} → ${pkgNow}`);
} else say('✔', '版数とお知らせ', '利用者に見える変更なし');

// 4. 保存形式の後方互換（版数つき保存を変えたら、読み込みのテストが有るか）
const srcChanged = changed.filter((f) => f.startsWith('src/') && f.endsWith('.js'));
const testCode = readdirSync(join(root, 'test')).filter((f) => f.endsWith('.test.js')).map((f) => readFileSync(join(root, 'test', f), 'utf8')).join('\n');
for (const file of srcChanged) {
  const diff = git('diff', `${base}..HEAD`, '--', file);
  if (/version:\s*\d/.test(diff) && /writeFileSync|renameSync/.test(readFileSync(join(root, file), 'utf8'))) {
    const mod = file.replace('src/', '').replace('.js', '');
    if (testCode.includes(mod)) say('✔', `後方互換の材料: ${file}`, '読み込み側のテストがある');
    else say('✖', `後方互換の材料: ${file}`, '版数つき保存を変えたのに、その読み込みを見るテストが無い。旧形式の保存を新しいコードで読めること（と、その逆）を示すテストを足すこと');
  }
}

console.log(failed === 0 ? '\n関門：全部通った' : `\n関門：${failed} 件で止まった`);
process.exit(failed === 0 ? 0 : 1);
