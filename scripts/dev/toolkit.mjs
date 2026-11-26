#!/usr/bin/env node
// LuL 共通の開発ツール。依存を増やさず、lint・format・pre-commit・静的サーバー・setup doctor を1つにまとめる。
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const EXPECTED_NODE = '25.4.0';
const root = process.cwd();
const MAX_TEXT_BYTES = 2 * 1024 * 1024;
const SKIP_DIRS = new Set([
  '.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.venv', 'venv', '__pycache__',
  '.pytest_cache', '.mypy_cache', '.ruff_cache', '.dev', '.wrangler', '.sync-state', '.turbo',
]);
const TEXT_EXTENSIONS = new Set([
  '.cjs', '.css', '.html', '.ini', '.js', '.json', '.jsonl', '.lane-impl', '.mako', '.mcfunction', '.mcmeta',
  '.md', '.mjs', '.py', '.service', '.sh', '.timer', '.toml', '.ts', '.txt', '.yaml', '.yml',
]);
const JSON_SKIP = /^(?:tsconfig|jsconfig)/;
const SECRET_VALUE = new RegExp([
  'ghp_[A-Za-z0-9]{20,}',
  'github_pat_[A-Za-z0-9_]{20,}',
  'sk-[A-Za-z0-9]{20,}',
  'AKIA[0-9A-Z]{16}',
  '-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----',
].join('|'));
const SENSITIVE_FILE = /(?:^|\/)(?:\.env|\.env\..+|.+\.pem|.+\.key|secrets?\/.+)$/i;
const TEST_PATH = /(?:^|\/)(?:test|tests|__tests__)(?:\/|$)|\.test\.[^/]+$/i;

function rel(file) {
  return path.relative(root, file).split(path.sep).join('/');
}

function walk(dir = root, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const file = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(file, out);
    else if (entry.isFile()) out.push(file);
  }
  return out;
}

function readText(file) {
  const stat = fs.statSync(file);
  if (stat.size > MAX_TEXT_BYTES) return null;
  const buffer = fs.readFileSync(file);
  if (buffer.includes(0)) return null;
  try {
    return buffer.toString('utf8');
  } catch {
    return null;
  }
}

function textFile(file) {
  const ext = path.extname(file).toLowerCase();
  if (TEXT_EXTENSIONS.has(ext)) return true;
  if (path.basename(file).startsWith('.')) return true;
  if (ext !== '') return false;
  const text = readText(file);
  return typeof text === 'string' && (text.startsWith('#!') || fs.statSync(file).mode & 0o111);
}

function fixedWhitespace(text, file = '') {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const clean = /\.md(?:own)?$/i.test(file) ? lines : lines.map((line) => line.replace(/[ \t]+$/u, ''));
  const normalized = clean.join('\n');
  return normalized.endsWith('\n') ? normalized : `${normalized}\n`;
}

function whitespaceProblem(file, text) {
  const fixed = fixedWhitespace(text, file);
  return fixed === text ? null : 'EditorConfig の空白・改行ルールと違います';
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { cwd: root, encoding: 'utf8', ...options });
}

function firstLine(text) {
  return text.split('\n', 1)[0] ?? '';
}

function syntaxProblems(file, text) {
  const name = rel(file);
  const ext = path.extname(file).toLowerCase();
  const bang = firstLine(text);
  const problems = [];
  const addFailure = (kind, result) => {
    if (result.status === 0) return;
    const detail = `${result.stderr || result.stdout || ''}`.trim().split('\n').slice(0, 3).join(' / ');
    problems.push(`${name}: ${kind} の文法エラー${detail ? `（${detail}）` : ''}`);
  };

  if (['.js', '.mjs', '.cjs'].includes(ext) || (ext === '' && bang.startsWith('#!') && /node/.test(bang))) {
    addFailure('JavaScript', run(process.execPath, ['--check', file]));
  } else if (ext === '.ts' && !name.endsWith('.d.ts')) {
    // node --check は型注釈を剥がさず誤検出するため、TS は各リポジトリの test/typecheck に任せる。
  } else if (ext === '.py' || (ext === '' && bang.startsWith('#!') && /python/.test(bang))) {
    addFailure('Python', run('python3', ['-c', 'import sys; compile(open(sys.argv[1], encoding="utf8").read(), sys.argv[1], "exec")', file]));
  } else if (ext === '.sh' || (ext === '' && bang.startsWith('#!') && /(?:bash|sh)/.test(bang))) {
    addFailure('shell', run('bash', ['-n', file]));
  } else if (ext === '.json' && !JSON_SKIP.test(path.basename(file))) {
    try { JSON.parse(text); } catch (error) { problems.push(`${name}: JSON が読めません（${error.message}）`); }
  }
  return problems;
}

function secretProblems(file, text, { includeTests = false } = {}) {
  const name = rel(file);
  if (!includeTests && TEST_PATH.test(name)) return [];
  return text.split('\n').flatMap((line, index) => {
    if (!SECRET_VALUE.test(line)) return [];
    if (/(?:dummy|fake|example|sample|test-only)/i.test(line)) return [];
    return [`${name}:${index + 1}: 秘密らしい文字列があります（値は出しません）`];
  });
}

function sensitiveFileProblem(file) {
  const name = rel(file);
  if (name === '.env.example') return null;
  return SENSITIVE_FILE.test(name) ? `${name}: 秘密用ファイルはコミットできません` : null;
}

export function lint() {
  const problems = [];
  for (const file of walk()) {
    const sensitive = sensitiveFileProblem(file);
    if (sensitive) problems.push(sensitive);
    if (!textFile(file)) continue;
    const text = readText(file);
    if (text == null) continue;
    problems.push(...syntaxProblems(file, text));
    problems.push(...secretProblems(file, text));
  }
  if (problems.length) {
    console.error(problems.map((problem) => `FAIL: ${problem}`).join('\n'));
    process.exitCode = 1;
    return;
  }
  console.log('lint OK');
}

export function format({ check = false } = {}) {
  const bad = [];
  for (const file of walk()) {
    if (!textFile(file)) continue;
    const text = readText(file);
    if (text == null) continue;
    if (!whitespaceProblem(file, text)) continue;
    bad.push(rel(file));
    if (!check) fs.writeFileSync(file, fixedWhitespace(text, file));
  }
  if (bad.length) {
    const action = check ? '要format' : 'formatした';
    console.log(`${action}: ${bad.length}件`);
    for (const file of bad) console.log(`- ${file}`);
    if (check) process.exitCode = 1;
    return;
  }
  console.log('format OK');
}

function stagedFiles() {
  const result = run('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z']);
  if (result.status !== 0) return [];
  return result.stdout.split('\0').filter(Boolean);
}

export function precommit() {
  const problems = [];
  const whitespace = run('git', ['diff', '--cached', '--check']);
  if (whitespace.status !== 0) {
    problems.push(`${whitespace.stdout || whitespace.stderr}`.trim().split('\n').filter(Boolean).map((line) => `git diff --check: ${line}`));
  }
  for (const name of stagedFiles()) {
    const file = path.join(root, name);
    if (!fs.existsSync(file) || !fs.statSync(file).isFile()) continue;
    const sensitive = sensitiveFileProblem(file);
    if (sensitive) problems.push(sensitive);
    if (!textFile(file)) continue;
    const text = readText(file);
    if (text == null) continue;
    problems.push(...syntaxProblems(file, text));
    problems.push(...secretProblems(file, text, { includeTests: true }));
  }
  const flat = problems.flat();
  if (flat.length) {
    console.error(flat.map((problem) => `pre-commit: ${problem}`).join('\n'));
    process.exit(1);
  }
  console.log('pre-commit OK');
}

export function installHooks() {
  const gitPath = run('git', ['rev-parse', '--git-path', 'hooks']);
  if (gitPath.status !== 0) {
    console.error('git hooks の場所が分かりません');
    process.exit(1);
  }
  const hooksDir = path.resolve(root, gitPath.stdout.trim());
  fs.mkdirSync(hooksDir, { recursive: true });
  const hook = path.join(hooksDir, 'pre-commit');
  if (fs.existsSync(hook) && !fs.readFileSync(hook, 'utf8').includes('LuL dev toolkit pre-commit')) {
    console.error(`${rel(hook)} に既存の pre-commit があります。中身を確認してから統合してください`);
    process.exit(1);
  }
  fs.writeFileSync(hook, `#!/bin/sh\n# LuL dev toolkit pre-commit\nif [ -f scripts/dev/toolkit.mjs ]; then\n  exec node scripts/dev/toolkit.mjs precommit\nfi\nexit 0\n`, { mode: 0o755 });
  console.log(`pre-commit hook を入れました: ${hook}`);
}

export function doctor() {
  const rows = [];
  const add = (name, ok, detail = '') => rows.push({ name, ok, detail });
  add(`Node v${EXPECTED_NODE}`, process.version === `v${EXPECTED_NODE}`, process.version);
  const npm = run('npm', ['--version']);
  add('npm', npm.status === 0, (npm.stdout || npm.stderr).trim());
  const git = run('git', ['--version']);
  add('git', git.status === 0, (git.stdout || git.stderr).trim());
  const hookPath = run('git', ['rev-parse', '--git-path', 'hooks/pre-commit']);
  const hookFile = hookPath.status === 0 ? path.resolve(root, hookPath.stdout.trim()) : null;
  add('pre-commit hook', Boolean(hookFile && fs.existsSync(hookFile)), hookFile ? rel(hookFile) : 'git repo ではありません');
  for (const row of rows) console.log(`${row.ok ? 'OK' : 'NG'} ${row.name}${row.detail ? ` … ${row.detail}` : ''}`);
  if (rows.some((row) => !row.ok)) process.exitCode = 1;
}

export function devMenu(lines = []) {
  console.log('開発用コマンド:');
  console.log('- npm run setup … 依存と pre-commit hook を用意');
  console.log('- npm test … テスト');
  console.log('- npm run lint … 文法・秘密混入・機密ファイルの検査');
  console.log('- npm run format / format:check … EditorConfig の空白と改行');
  for (const line of lines) console.log(`- ${line}`);
}

const MIME = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'], ['.mjs', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.json', 'application/json; charset=utf-8'], ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'], ['.jpeg', 'image/jpeg'], ['.webp', 'image/webp'], ['.svg', 'image/svg+xml'],
  ['.mp3', 'audio/mpeg'], ['.wav', 'audio/wav'], ['.mp4', 'video/mp4'], ['.woff2', 'font/woff2'],
]);

export function serveStatic(dir = '.', port = 4173) {
  const base = path.resolve(root, dir);
  if (!fs.existsSync(base) || !fs.statSync(base).isDirectory()) {
    console.error(`serve-static: ディレクトリがありません: ${dir}`);
    process.exit(1);
  }
  const server = http.createServer((req, res) => {
    try {
      const url = new URL(req.url ?? '/', 'http://localhost');
      let name = decodeURIComponent(url.pathname);
      if (name.endsWith('/')) name += 'index.html';
      const file = path.resolve(base, `.${name}`);
      if (!file.startsWith(`${base}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
        if (name === '/index.html') {
          const pages = walk(base).filter((item) => item.endsWith(`${path.sep}index.html`)).slice(0, 200);
          const links = pages.map((item) => {
            const page = path.relative(base, item).split(path.sep).join('/');
            return `<li><a href="/${page}">${page}</a></li>`;
          }).join('\n');
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
          res.end(`<!doctype html><meta charset="utf-8"><title>dev pages</title><h1>開発用ページ一覧</h1><ul>${links}</ul>`);
          return;
        }
        res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
        res.end('not found');
        return;
      }
      res.writeHead(200, { 'content-type': MIME.get(path.extname(file).toLowerCase()) ?? 'application/octet-stream', 'cache-control': 'no-store' });
      fs.createReadStream(file).pipe(res);
    } catch (error) {
      res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'static server error', message: error.message }));
    }
  });
  server.listen(port, '127.0.0.1', () => console.log(`http://127.0.0.1:${port}/ (${rel(base) || '.'})`));
}

export function setup() {
  if (!fs.existsSync(path.join(root, 'node_modules')) && fs.existsSync(path.join(root, 'package.json'))) {
    const install = run('npm', ['install'], { stdio: 'inherit' });
    if (install.status !== 0) process.exit(install.status ?? 1);
  }
  installHooks();
  doctor();
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === 'lint') return lint();
  if (command === 'format') return format();
  if (command === 'format-check') return format({ check: true });
  if (command === 'precommit') return precommit();
  if (command === 'install-hooks') return installHooks();
  if (command === 'doctor') return doctor();
  if (command === 'dev-menu') return devMenu(args);
  if (command === 'serve-static') return serveStatic(args[0] ?? '.', Number(args[1] ?? 4173));
  if (command === 'setup') return setup();
  console.log('usage: toolkit.mjs lint|format|format-check|precommit|install-hooks|doctor|dev-menu|serve-static|setup');
  process.exitCode = 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
