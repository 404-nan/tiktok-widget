#!/usr/bin/env node
// エラー記録と「直した印」から、AI の共通の記憶へ載せる短い Markdown を作る。
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createErrorLog, scrub } from '../src/error-log.js';
import { readErrorFixes } from '../src/error-fixes.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DAY_MS = 24 * 60 * 60 * 1000;
const STATUS_LABEL = { regressed: '直したのに、また起きています', open: 'まだ直していません', fixed: '直しました' };

function japanTime(iso) {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return String(iso || '');
  const shifted = new Date(ms + 9 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())} JST`;
}

function oneLine(text) {
  return String(text ?? '').replace(/\s+/g, ' ').trim();
}

function placeOf(group) {
  const file = group.where?.file || '場所不明';
  const fn = group.where?.fn ? ` の ${group.where.fn}` : '';
  return `${file}${fn}`;
}

function statusRank(status) {
  return status === 'regressed' ? 0 : status === 'open' ? 1 : 2;
}

export function buildErrorDigest({ dir, days = 7, max = 20, now = Date.now(), fixesFile = null } = {}) {
  const at = Number(now);
  const errorDir = dir ?? process.env.TW_ERROR_DIR ?? path.join(process.env.TW_DATA || path.join(root, 'data'), 'errors');
  const log = createErrorLog({ dir: errorDir, now: () => at });
  const fixes = readErrorFixes({ file: fixesFile });
  const groups = log.groups({ sinceMs: at - days * DAY_MS, fixes });
  const active = groups
    .filter((group) => group.status !== 'fixed')
    .sort((a, b) => (statusRank(a.status) - statusRank(b.status)) || (b.count - a.count) || (Date.parse(b.lastTs) - Date.parse(a.lastTs)))
    .slice(0, max);

  const lines = [
    `# エラーのまとめ（${japanTime(new Date(at).toISOString())} に作成・過去${days}日）`,
    '',
    '## いま起きているエラー',
  ];
  if (!active.length) lines.push('- なし');
  for (const group of active) {
    lines.push(`- [${STATUS_LABEL[group.status] ?? group.status}] ${oneLine(group.message)}（${placeOf(group)}）— ${group.count}回・最後は ${japanTime(group.lastTs)}・${group.tenants}人の配信者で`);
  }
  lines.push('', '## 直したエラーと、守っているテスト');
  if (!fixes.length) lines.push('- なし');
  for (const fix of fixes) {
    lines.push(`- [直しました] ${oneLine(fix.summary)}（${oneLine(fix.fixedIn)}）— 守っているテスト: ${fix.test?.file ?? ''} の「${fix.test?.name ?? ''}」`);
  }

  const capped = lines.slice(0, 60);
  if (lines.length > 60) capped[59] = '- …（残りは省略）';
  return `${scrub(capped.join('\n'))}\n`;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dir') out.dir = argv[++i];
    else if (argv[i] === '--days') out.days = Number(argv[++i]);
    else if (argv[i] === '--max') out.max = Number(argv[++i]);
  }
  return out;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const args = parseArgs(process.argv.slice(2));
  process.stdout.write(buildErrorDigest(args));
}
