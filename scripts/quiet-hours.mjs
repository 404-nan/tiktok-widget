// 配信の記録を読み、配信者がいない可能性が高い時間帯を出す読み取り専用の道具。
// 使い方: node scripts/quiet-hours.mjs [--data <置き場>] [--weeks 8] [--min-minutes 60] [--json]

import fs from 'node:fs';
import path from 'node:path';
import { busyGrid, quietWindows, nextQuiet } from '../src/quiet-hours.js';

const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const OUTPUT_ORDER = [1, 2, 3, 4, 5, 6, 0];
const CAUTION = 'これは過去の記録です。作業の直前に、今の配信が 0 人であることを必ず確かめてください。';

function usage() {
  return '使い方: node scripts/quiet-hours.mjs [--data <置き場>] [--weeks 8] [--min-minutes 60] [--json]';
}

function parseArgs(argv) {
  const options = {
    data: process.env.TW_DATA || './data',
    weeks: 8,
    minMinutes: 60,
    json: false,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      options.json = true;
    } else if (arg === '--data' || arg === '--weeks' || arg === '--min-minutes') {
      const value = argv[i + 1];
      if (value == null || value.startsWith('--')) throw new Error(`${arg} には値が必要です`);
      i += 1;
      if (arg === '--data') options.data = value;
      if (arg === '--weeks') options.weeks = Number(value);
      if (arg === '--min-minutes') options.minMinutes = Number(value);
    } else if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else {
      throw new Error(`知らない引数です: ${arg}`);
    }
  }
  if (!Number.isFinite(options.weeks) || options.weeks <= 0) throw new Error('--weeks は 0 より大きい数にしてください');
  if (!Number.isFinite(options.minMinutes) || options.minMinutes <= 0) throw new Error('--min-minutes は 0 より大きい数にしてください');
  return options;
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readSessionDir(dir, source) {
  const sessions = [];
  let unreadable = 0;
  let entries = [];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return { sessions, unreadable };
  }
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith('.json') || entry.name.endsWith('.report.json')) continue;
    const data = readJson(path.join(dir, entry.name));
    if (!data || typeof data !== 'object') unreadable += 1;
    else sessions.push({ ...data, source });
  }
  return { sessions, unreadable };
}

function tenantIds(dataDir) {
  const data = readJson(path.join(dataDir, 'tenants.json'));
  if (!data || typeof data !== 'object') return { ids: [], unreadable: fs.existsSync(path.join(dataDir, 'tenants.json')) ? 1 : 0 };
  return {
    ids: (Array.isArray(data.tenants) ? data.tenants : [])
      .map((tenant) => (typeof tenant?.id === 'string' ? tenant.id : ''))
      .filter((id) => /^[A-Za-z0-9_-]+$/.test(id)),
    unreadable: 0,
  };
}

function readSessions(dataDir) {
  const sessions = [];
  let unreadable = 0;
  const local = readSessionDir(path.join(dataDir, 'sessions'), 'local');
  sessions.push(...local.sessions);
  unreadable += local.unreadable;

  const tenants = tenantIds(dataDir);
  unreadable += tenants.unreadable;
  const tenantsRoot = path.resolve(dataDir, 'tenants');
  for (const id of tenants.ids) {
    const dir = path.resolve(tenantsRoot, id, 'sessions');
    if (!dir.startsWith(`${tenantsRoot}${path.sep}`)) continue;
    const tenant = readSessionDir(dir, `tenant:${id}`);
    sessions.push(...tenant.sessions);
    unreadable += tenant.unreadable;
  }
  return { sessions, unreadable };
}

function partsInTimeZone(ms, tz) {
  const parts = {};
  for (const part of new Intl.DateTimeFormat('en-US', {
    timeZone: tz,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(ms)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return { ...parts, hour: parts.hour % 24 };
}

const pad = (n) => String(n).padStart(2, '0');

function weekdayOf(parts) {
  return new Date(Date.UTC(parts.year, parts.month - 1, parts.day)).getUTCDay();
}

function formatTime(ms, tz) {
  const p = partsInTimeZone(ms, tz);
  return `${pad(p.hour)}:${pad(p.minute)}`;
}

function formatDateTime(ms, tz) {
  const p = partsInTimeZone(ms, tz);
  return `${p.month}/${p.day}（${WEEKDAYS[weekdayOf(p)]}）${pad(p.hour)}:${pad(p.minute)}`;
}

function sameDay(a, b, tz) {
  const pa = partsInTimeZone(a, tz);
  const pb = partsInTimeZone(b, tz);
  return pa.year === pb.year && pa.month === pb.month && pa.day === pb.day;
}

function formatRange(next, tz) {
  if (sameDay(next.start, next.end, tz)) return `${formatDateTime(next.start, tz)}〜${formatTime(next.end, tz)}`;
  return `${formatDateTime(next.start, tz)}〜${formatDateTime(next.end, tz)}`;
}

function hourText(hour) {
  return `${pad(hour)}:00`;
}

function windowText(window) {
  return `${hourText(window.startHour)}〜${hourText(window.endHour)}`;
}

function publicWindow(window) {
  return {
    startHour: window.startHour,
    endHour: window.endHour,
    minutes: window.minutes,
    busyWeeks: window.busyWeeks,
    quiet: window.quiet,
  };
}

function buildReport(grid, windows, next, options, unreadable) {
  return {
    weeks: grid.weeks,
    minMinutes: options.minMinutes,
    timezone: grid.timezone,
    window: {
      start: new Date(grid.windowStart).toISOString(),
      end: new Date(grid.windowEnd).toISOString(),
    },
    sessions: {
      count: grid.sessionCount,
      streamers: grid.streamerCount,
      missingEnd: grid.missingEndCount,
      unreadable,
    },
    nextQuiet: next ? {
      start: new Date(next.start).toISOString(),
      end: new Date(next.end).toISOString(),
      minutes: next.minutes,
      busyWeeks: next.busyWeeks,
      quiet: next.quiet,
      alreadyOpen: Boolean(next.alreadyOpen),
    } : null,
    weekdays: OUTPUT_ORDER.map((weekday) => {
      const day = windows.days[weekday];
      return {
        weekday,
        name: WEEKDAYS[weekday],
        windows: (day?.windows ?? []).map(publicWindow),
        best: day?.best ? publicWindow(day.best) : null,
      };
    }),
    caution: CAUTION,
  };
}

function printHuman(report, grid, windows, next) {
  console.log(`配信の記録 ${report.weeks} 週分（配信 ${report.sessions.count} 回、配信者 ${report.sessions.streamers} 人）から`);
  if (report.sessions.missingEnd > 0) console.log(`終わりの無い記録が ${report.sessions.missingEnd} 件ありました（開始から 6 時間で終わったものとして数えています）`);
  if (report.sessions.unreadable > 0) console.log(`読めなかった記録が ${report.sessions.unreadable} 件ありました（その記録は数えていません）`);
  if (!next) {
    console.log('いちばん近い静かな時間: 見つかりませんでした');
  } else if (next.quiet) {
    const openNow = next.alreadyOpen ? 'いまこの時間帯です。' : '';
    console.log(`いちばん近い静かな時間: ${formatRange(next, grid.timezone)}（${openNow}過去 ${report.weeks} 週、この時間の配信は 0 回）`);
  } else {
    console.log(`いちばん近い比較的静かな時間: ${formatRange(next, grid.timezone)}（過去 ${report.weeks} 週、この時間には配信が ${next.busyWeeks} 週ありました）`);
  }
  console.log('曜日ごとの静かな時間（配信 0 回が続く時間帯）');
  for (const weekday of OUTPUT_ORDER) {
    const day = windows.days[weekday];
    const name = WEEKDAYS[weekday];
    if (day?.windows?.length) {
      console.log(`  ${name} ${day.windows.map(windowText).join(' / ')}`);
    } else if (day?.best) {
      console.log(`  ${name} なし（いちばん静か: ${windowText(day.best)}、ただし ${day.best.busyWeeks} 週は配信あり）`);
    } else {
      console.log(`  ${name} なし`);
    }
  }
  console.log(`注意: ${CAUTION}`);
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    console.error(usage());
    process.exit(1);
  }
  if (options.help) {
    console.log(usage());
    return;
  }

  const dataDir = path.resolve(process.cwd(), options.data);
  const { sessions, unreadable } = readSessions(dataDir);
  const now = Date.now();
  const grid = busyGrid(sessions, { now, weeks: options.weeks });
  if (grid.sessionCount === 0) {
    if (options.json) {
      console.log(JSON.stringify({ message: '記録が無いので出せません', sessions: { count: 0, streamers: 0, missingEnd: 0, unreadable } }, null, 2));
    } else {
      console.log('記録が無いので出せません');
    }
    return;
  }
  const windows = quietWindows(grid, { minMinutes: options.minMinutes });
  const next = nextQuiet(grid, { now, minMinutes: options.minMinutes });
  const report = buildReport(grid, windows, next, options, unreadable);
  if (options.json) console.log(JSON.stringify(report, null, 2));
  else printHuman(report, grid, windows, next);
}

main();
