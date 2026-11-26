import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { busyGrid, quietWindows, nextQuiet } from '../src/quiet-hours.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tool = path.join(root, 'scripts', 'quiet-hours.mjs');
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

function makeGrid(fill = 1) {
  return {
    timezone: 'Asia/Tokyo',
    weeks: 8,
    days: Array.from({ length: 7 }, (_, weekday) => Array.from({ length: 24 }, (_, hour) => ({
      weekday,
      hour,
      busyWeeks: fill,
      seenWeeks: 8,
      busyWeekKeys: Array.from({ length: fill }, (_, i) => i),
    }))),
  };
}

function setBusy(grid, weekday, hour, count) {
  const cell = grid.days[weekday][hour];
  cell.busyWeeks = count;
  cell.busyWeekKeys = Array.from({ length: count }, (_, i) => i);
}

function runTool(args, options = {}) {
  return spawnSync(process.execPath, [tool, ...args], { cwd: root, encoding: 'utf8', ...options });
}

function writeJson(file, value) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value));
}

function snapshotFiles(dir) {
  const out = {};
  const walk = (current) => {
    for (const name of fs.readdirSync(current).sort()) {
      const file = path.join(current, name);
      const stat = fs.statSync(file);
      const rel = path.relative(dir, file);
      if (stat.isDirectory()) walk(file);
      else out[rel] = {
        size: stat.size,
        mtimeMs: stat.mtimeMs,
        hash: crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),
      };
    }
  };
  walk(dir);
  return out;
}

test('日本時間の曜日と時間に入る（UTC の日付とずれる時刻でも）', () => {
  const now = Date.parse('2026-01-08T12:00:00Z'); // 日本時間 2026-01-08 21:00
  const grid = busyGrid([
    // UTC では 1/2 だが、日本時間では 1/3（土）00:30〜01:30
    { startedAt: Date.parse('2026-01-02T15:30:00Z'), endedAt: Date.parse('2026-01-02T16:30:00Z') },
  ], { now, weeks: 1 });

  assert.equal(grid.days[6][0].busyWeeks, 1, '土曜 00 時台に入る');
  assert.equal(grid.days[6][1].busyWeeks, 1, '土曜 01 時台に入る');
  assert.equal(grid.days[5][15].busyWeeks, 0, 'UTC の金曜 15 時台には入らない');
  assert.equal(grid.days[5][16].busyWeeks, 0, 'UTC の金曜 16 時台には入らない');
  assert.equal(grid.days[6][0].seenWeeks, 1);
  assert.equal(grid.sessionCount, 1);
});

test('日付をまたぐ配信は、両方の日の時間に入る', () => {
  const now = Date.parse('2026-01-08T12:00:00Z');
  const grid = busyGrid([
    // 日本時間 1/4（日）23:30 〜 1/5（月）01:30
    { startedAt: Date.parse('2026-01-04T14:30:00Z'), endedAt: Date.parse('2026-01-04T16:30:00Z') },
  ], { now, weeks: 1 });

  assert.equal(grid.days[0][23].busyWeeks, 1, '日曜 23 時台');
  assert.equal(grid.days[1][0].busyWeeks, 1, '月曜 00 時台');
  assert.equal(grid.days[1][1].busyWeeks, 1, '月曜 01 時台');
  assert.equal(grid.days[1][2].busyWeeks, 0, '終わった後の 02 時台には入らない');
});

test('endedAt の無い記録は開始から 6 時間として数え、件数を返す', () => {
  const now = Date.parse('2026-01-08T12:00:00Z');
  const grid = busyGrid([
    // 日本時間 1/3（土）00:00 開始。終わりが無いので 06:00 まで
    { startedAt: Date.parse('2026-01-02T15:00:00Z') },
  ], { now, weeks: 1 });

  for (const hour of [0, 1, 2, 3, 4, 5]) assert.equal(grid.days[6][hour].busyWeeks, 1, `土曜 ${hour} 時台`);
  assert.equal(grid.days[6][6].busyWeeks, 0, '6 時間を超えた時間には入らない');
  assert.equal(grid.missingEndCount, 1);
});

test('demo:true の記録は数えない', () => {
  const now = Date.parse('2026-01-08T12:00:00Z');
  const grid = busyGrid([
    { startedAt: Date.parse('2026-01-02T15:30:00Z'), endedAt: Date.parse('2026-01-02T16:30:00Z'), demo: true },
  ], { now, weeks: 1 });

  assert.equal(grid.sessionCount, 0);
  assert.equal(grid.days[6][0].busyWeeks, 0);
});

test('0 回の時間帯だけを出し、minMinutes より短い切れ目は出さない', () => {
  const grid = makeGrid(1);
  for (const hour of [3, 4, 5, 8]) setBusy(grid, 1, hour, 0);

  const result = quietWindows(grid, { minMinutes: 120 });
  const monday = result.days.find((d) => d.weekday === 1);
  assert.deepEqual(monday.windows.map((w) => [w.startHour, w.endHour, w.minutes]), [[3, 6, 180]]);
  assert.equal(monday.windows.some((w) => w.startHour === 8), false, '1 時間だけの切れ目は出ない');
});

test('0 回の時間帯が無い曜日は、いちばん少ない時間帯を返す', () => {
  const grid = makeGrid(2);
  setBusy(grid, 1, 4, 1);
  setBusy(grid, 1, 5, 1);

  const result = quietWindows(grid, { minMinutes: 60 });
  const monday = result.days.find((d) => d.weekday === 1);
  assert.equal(monday.windows.length, 0);
  assert.equal(monday.best.startHour, 4);
  assert.equal(monday.best.endHour, 6);
  assert.equal(monday.best.busyWeeks, 1);
  assert.equal(monday.best.quiet, false);
});

test('nextQuiet は今より後のいちばん近い時間帯を、週の終わりをまたいで返す', () => {
  const grid = makeGrid(1);
  setBusy(grid, 0, 23, 0); // 日曜 23 時台
  setBusy(grid, 1, 0, 0); // 月曜 00 時台
  setBusy(grid, 1, 1, 0); // 月曜 01 時台
  const now = Date.parse('2026-01-04T13:30:00Z'); // 日本時間 日曜 22:30

  const next = nextQuiet(grid, { now, minMinutes: 60 });
  assert.ok(next.start > now);
  assert.equal(next.start, Date.parse('2026-01-04T14:00:00Z')); // 日本時間 日曜 23:00
  assert.equal(next.end, Date.parse('2026-01-04T17:00:00Z')); // 日本時間 月曜 02:00
  assert.equal(next.minutes, 180);
  assert.equal(next.busyWeeks, 0);
  assert.equal(next.quiet, true);
});

test('nextQuiet は、今入っている静かな時間帯をそのまま返す', () => {
  const grid = makeGrid(1);
  setBusy(grid, 0, 23, 0);
  setBusy(grid, 1, 0, 0);
  setBusy(grid, 1, 1, 0);
  const now = Date.parse('2026-01-04T14:30:00Z'); // 日本時間 日曜 23:30（静かな時間帯の中）

  const next = nextQuiet(grid, { now, minMinutes: 60 });
  assert.equal(next.start, Date.parse('2026-01-04T14:00:00Z'));
  assert.equal(next.end, Date.parse('2026-01-04T17:00:00Z'));
  assert.equal(next.alreadyOpen, true);
});

test('CLI は tenants.json に無い配信者と demo を数えず、置き場を 1 バイトも変えない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-quiet-hours-'));
  const now = Date.now();
  writeJson(path.join(dir, 'tenants.json'), { tenants: [{ id: 'ttestactive', name: 'テストA' }] });
  writeJson(path.join(dir, 'sessions', 'root.json'), {
    id: 'root-session', username: 'テストB', startedAt: now - 4 * DAY - 3 * HOUR, endedAt: now - 4 * DAY - 90 * 60 * 1000,
  });
  writeJson(path.join(dir, 'sessions', 'outside-window.json'), {
    id: 'outside-session', username: 'テストB', startedAt: now - 9 * 7 * DAY, endedAt: now - 9 * 7 * DAY + HOUR,
  });
  writeJson(path.join(dir, 'tenants', 'ttestactive', 'sessions', 'live.json'), {
    id: 'tenant-session', username: 'テストA', startedAt: now - 2 * DAY - 2 * HOUR, endedAt: now - 2 * DAY,
  });
  writeJson(path.join(dir, 'tenants', 'ttestactive', 'sessions', 'demo.json'), {
    id: 'demo-session', username: 'テストA', demo: true, startedAt: now - DAY, endedAt: now - DAY + HOUR,
  });
  writeJson(path.join(dir, 'tenants', 'ttestactive', 'sessions', 'open.json'), {
    id: 'open-session', username: 'テストA', startedAt: now - DAY - HOUR,
  });
  writeJson(path.join(dir, 'tenants', 'ttestold', 'sessions', 'old.json'), {
    id: 'old-session', username: 'テストC', startedAt: now - DAY, endedAt: now - DAY + 2 * HOUR,
  });
  const before = snapshotFiles(dir);

  const plain = runTool(['--data', dir, '--weeks', '8', '--min-minutes', '60']);
  assert.equal(plain.status, 0, plain.stderr);
  assert.match(plain.stdout, /配信の記録 8 週分（配信 3 回、配信者 2 人）から/);
  assert.match(plain.stdout, /終わりの無い記録が 1 件/);
  assert.match(plain.stdout, /曜日ごとの静かな時間/);
  assert.match(plain.stdout, /作業の直前に、今の配信が 0 人であることを必ず確かめてください/);

  const asJson = runTool(['--data', dir, '--weeks', '8', '--json']);
  assert.equal(asJson.status, 0, asJson.stderr);
  const result = JSON.parse(asJson.stdout);
  assert.equal(result.sessions.count, 3);
  assert.equal(result.sessions.streamers, 2);
  assert.equal(result.sessions.missingEnd, 1);

  const combined = plain.stdout + plain.stderr + asJson.stdout + asJson.stderr;
  assert.doesNotMatch(combined, /テストA|テストB|テストC|ttestactive|ttestold/);
  assert.deepEqual(snapshotFiles(dir), before, 'ファイルの一覧・更新時刻・中身が変わらない');
});

test('CLI の --min-minutes より短い 0 回の切れ目は JSON に出ない', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-quiet-hours-min-'));
  const now = Date.now();
  const parts = {};
  for (const part of new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(now)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  const yesterdayMs = Date.UTC(parts.year, parts.month - 1, parts.day) - DAY;
  const yesterday = new Date(yesterdayMs);
  const year = yesterday.getUTCFullYear();
  const month = yesterday.getUTCMonth();
  const day = yesterday.getUTCDate();
  const weekday = yesterday.getUTCDay();
  const jstHour = (hour) => Date.UTC(year, month, day, hour) - 9 * HOUR;
  const quietHours = new Set([3, 6, 7]);
  for (let hour = 0; hour < 24; hour += 1) {
    if (quietHours.has(hour)) continue;
    writeJson(path.join(dir, 'sessions', `hour-${hour}.json`), {
      id: `hour-${hour}`, startedAt: jstHour(hour), endedAt: jstHour(hour + 1),
    });
  }

  const run = runTool(['--data', dir, '--weeks', '8', '--min-minutes', '90', '--json']);
  assert.equal(run.status, 0, run.stderr);
  const result = JSON.parse(run.stdout);
  const target = result.weekdays.find((d) => d.weekday === weekday);
  assert.deepEqual(target.windows.map((w) => [w.startHour, w.endHour, w.minutes]), [[6, 8, 120]]);
});

test('記録が 1 件も無いときは、落ちずに出せないことを伝える', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-quiet-hours-empty-'));
  const run = runTool(['--data', dir]);
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /記録が無いので出せません/);
});
