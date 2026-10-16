#!/usr/bin/env node
// Claude Code の PreToolUse フック。守るファイルとブランチへの操作を、文字列の照合だけで止める(AIは呼ばない)。
// 止めるとき: 終了コード 2 と理由(標準エラー)を返す。Claude Code はその操作をしない。
//   - config.yaml、data/(実データ)への書き込み。.dev/ の使い捨てデータは除く
//   - test/acceptance/(受け入れテスト)と test/visual/**/*-snapshots/(見本画像)の書き換え
//   - --update-snapshots、npm run shot:approve
//   - main / next / release* への git push、--force 系
//   - 作業場所の外を消す rm -r
// 受け入れテストを書く係として起動した Claude(環境変数 TW_GUARD_ROLE=acceptance)だけは test/acceptance/ に書ける。
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROTECTED_BRANCH = /^(main|master|next|release.*)$/;

function rel(file, cwd) {
  const abs = path.resolve(cwd, file);
  return { abs, rel: path.relative(cwd, abs).split(path.sep).join('/') };
}

/** 書き込みを止めるべきパスなら理由を返す */
export function protectedPath(file, cwd) {
  if (!file) return null;
  const { abs, rel: r } = rel(file, cwd);
  const outside = r.startsWith('../') || r === '..' || path.isAbsolute(r);
  if (!outside && (r === '.dev' || r.startsWith('.dev/'))) return null;
  const base = path.basename(abs);
  if (base === 'config.yaml') return `${file} は設定の実データです(config.yaml は書き換え禁止)`;
  if (/(^|\/)[^/]*-data(\/|$)/.test(abs)) return `${file} は実データの置き場です`;
  if (!outside && (r === 'data' || r.startsWith('data/'))) return `${file} は実データです(data/ は書き換え禁止)`;
  if (!outside && r.startsWith('test/acceptance/') && base !== '.gitkeep' && process.env.TW_GUARD_ROLE !== 'acceptance') return `${file} は受け入れテストです。書くのは実装したAIとは別のAI(Codex)とめにくんだけ`;
  if (!outside && /^test\/visual\/.*-snapshots(\/|$)/.test(r)) return `${file} は見本画像です。見本にするのはめにくんの npm run shot:approve だけ`;
  return null;
}

const WRITE_HINT = /(^|[^<>&0-9])>{1,2}(?!&)|\btee\b|\bsed\s+(-[a-zA-Z]*i|--in-place)|\b(cp|mv|rm|truncate|install|ln|rsync|dd|unlink|shred)\b|\bgit\s+(checkout|restore|rm|mv)\b|\bperl\s+-[a-zA-Z]*i|writeFile|open\([^)]*['"]w/;

function words(cmd) {
  return cmd.match(/"[^"]*"|'[^']*'|\S+/g)?.map((w) => w.replace(/^['"]|['"]$/g, '')) ?? [];
}

function currentBranch(cwd) {
  try {
    return execFileSync('git', ['symbolic-ref', '--short', 'HEAD'], { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return null;
  }
}

function checkPush(seg, cwd) {
  const w = words(seg);
  const i = w.indexOf('push');
  if (w[0] !== 'git' || i < 0) return null;
  const rest = w.slice(i + 1);
  if (rest.some((a) => /^(--force(-with-lease)?(=.*)?|-f|--mirror|--delete|-d)$/.test(a) || /^-[a-zA-Z]*f/.test(a)))
    return 'git push の --force・--delete・--mirror は禁止です';
  const pos = rest.filter((a) => !a.startsWith('-'));
  const refs = pos.slice(1);
  if (refs.some((r) => r.startsWith('+'))) return 'git push の + 付き(強制)は禁止です';
  if (rest.includes('--all') || rest.includes('--tags')) return 'git push --all / --tags は禁止です';
  const here = currentBranch(cwd);
  if (!refs.length && !here) return '今のブランチが分からないので、push 先を書いてください(例: git push origin dev/<件名>)';
  const targets = refs.length ? refs.map((r) => r.split(':').pop().replace(/^refs\/heads\//, '')) : [here];
  const bad = targets.find((t) => t && (PROTECTED_BRANCH.test(t) || t === 'HEAD' && PROTECTED_BRANCH.test(here || '')));
  if (bad) return `${bad} への push は禁止です。作業用ブランチに push して PR を作ってください`;
  return null;
}

function checkRm(seg, cwd) {
  const w = words(seg);
  if (w[0] !== 'rm') return null;
  const flags = w.filter((a) => a.startsWith('-'));
  if (!flags.some((f) => /^-[a-zA-Z]*[rR]/.test(f) || f === '--recursive')) return null;
  for (const t of w.slice(1).filter((a) => !a.startsWith('-'))) {
    if (t.startsWith('~') || t.includes('$') || t === '*' || t === '/' || t === '.') return `rm -r ${t} は作業場所の外や全体を消すおそれがあります`;
    const r = path.relative(cwd, path.resolve(cwd, t));
    if (r === '' || r.startsWith('..') || path.isAbsolute(r)) return `rm -r ${t} は作業場所の外です`;
  }
  return null;
}

/** Bash のコマンドを調べて、止めるなら理由を返す */
export function checkCommand(cmd, cwd) {
  if (!cmd) return null;
  if (/--update-snapshots\b|(^|\s)-u(\s|$).*playwright|playwright.*\s-u(\s|$)/.test(cmd)) return '見本画像の更新(--update-snapshots)は禁止です。候補を出して、めにくんに承認してもらってください';
  if (/shot:approve|shot-approve\.mjs/.test(cmd)) return 'npm run shot:approve はめにくんが実行します';
  for (const seg of cmd.split(/&&|\|\||;|\n|\|/).map((s) => s.trim()).filter(Boolean)) {
    const s = seg.replace(/^(sudo|env\s+\S+=\S+|\S+=\S+)\s+/, '');
    const reason = checkPush(s, cwd) || checkRm(s, cwd);
    if (reason) return reason;
  }
  if (WRITE_HINT.test(cmd)) {
    for (const w of words(cmd)) {
      const target = w.replace(/^[0-9]*>{1,2}/, '');
      if (!/[./]|config\.yaml|data/.test(target)) continue;
      const reason = protectedPath(target, cwd);
      if (reason) return reason;
    }
  }
  return null;
}

/** フックの入力(JSON)から、止める理由を返す */
export function check(input, cwd = input?.cwd || process.cwd()) {
  const tool = input?.tool_name;
  const t = input?.tool_input ?? {};
  if (['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(tool)) return protectedPath(t.file_path || t.notebook_path, cwd);
  if (tool === 'Bash') return checkCommand(t.command, cwd);
  return null;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let raw = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', (c) => { raw += c; });
  process.stdin.on('end', () => {
    let input;
    try {
      input = JSON.parse(raw || '{}');
    } catch {
      process.exit(0);
    }
    const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
    const reason = check(input, input.cwd || root);
    if (reason) {
      process.stderr.write(`止めました(guard): ${reason}\n`);
      process.exit(2);
    }
    process.exit(0);
  });
}
