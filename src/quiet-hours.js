// 配信の記録から、曜日 × 時間ごとの混み具合と静かな時間帯を計算する。
// ファイルの読み込みは scripts/quiet-hours.mjs が行い、このファイルは計算だけを持つ。

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const DEFAULT_TZ = 'Asia/Tokyo';

const formatters = new Map();
function formatterFor(tz) {
  let formatter = formatters.get(tz);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
      hourCycle: 'h23',
    });
    formatters.set(tz, formatter);
  }
  return formatter;
}

function zonedParts(ms, tz) {
  const parts = {};
  for (const part of formatterFor(tz).formatToParts(ms)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour % 24,
    minute: parts.minute,
    second: parts.second,
  };
}

function offsetMsAt(ms, tz) {
  const p = zonedParts(ms, tz);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(ms / 1000) * 1000;
}

// Intl は「この場所の時刻 → UTC」の逆変換を持たないため、ずれを調べて数回だけ寄せる。
function zonedTimeToUtc({ year, month, day, hour = 0, minute = 0, second = 0 }, tz) {
  const wanted = Date.UTC(year, month - 1, day, hour, minute, second);
  let utc = wanted;
  for (let i = 0; i < 3; i += 1) {
    const next = wanted - offsetMsAt(utc, tz);
    if (next === utc) break;
    utc = next;
  }
  return utc;
}

function normalizedDateTime(year, month, day, hour) {
  const d = new Date(Date.UTC(year, month - 1, day, hour, 0, 0));
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate(), hour: d.getUTCHours() };
}

function addLocalHours(ms, tz, hours) {
  const p = zonedParts(ms, tz);
  const shifted = normalizedDateTime(p.year, p.month, p.day, p.hour + hours);
  return zonedTimeToUtc(shifted, tz);
}

function timeValue(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (value instanceof Date && Number.isFinite(value.getTime())) return value.getTime();
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function datePartsFromMs(ms) {
  const d = new Date(ms);
  return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

function weekKeyForDate(year, month, day) {
  const dateMs = Date.UTC(year, month - 1, day);
  const weekday = new Date(dateMs).getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  return Math.floor((dateMs - mondayOffset * DAY) / (7 * DAY));
}

function weekdayForDate(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function emptyWeekSets() {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => new Set()));
}

function normalizeSession(raw) {
  const start = timeValue(raw?.startedAt);
  if (start == null) return null;
  let end = timeValue(raw?.endedAt);
  const missingEnd = end == null;
  if (missingEnd) end = start + 6 * HOUR;
  if (end <= start) return null;
  return { start, end, missingEnd, source: raw?.source == null ? '' : String(raw.source) };
}

/**
 * sessions を日本時間の 7 × 24 の表にする。
 * busyWeeks は「その曜日のその 1 時間に配信があった週の数」、seenWeeks は「その時間帯を見られた週の数」。
 * 期間は now から weeks 週間前まで。端で同じ曜日・時間の一部だけが入ることがあるため、seenWeeks は weeks と同じとは限らない。
 */
export function busyGrid(sessions, { now = Date.now(), weeks = 8, tz = DEFAULT_TZ } = {}) {
  const nowMs = timeValue(now);
  const weekCount = Number(weeks);
  if (nowMs == null) throw new Error('now は時刻にしてください');
  if (!Number.isFinite(weekCount) || weekCount <= 0) throw new Error('weeks は 0 より大きい数にしてください');

  const windowStart = nowMs - weekCount * 7 * DAY;
  const counted = [];
  let missingEndCount = 0;
  const sources = new Set();
  for (const raw of Array.isArray(sessions) ? sessions : []) {
    if (raw?.demo) continue;
    const session = normalizeSession(raw);
    if (!session) continue;
    if (session.end <= windowStart || session.start >= nowMs) continue;
    counted.push(session);
    if (session.missingEnd) missingEndCount += 1;
    if (session.source) sources.add(session.source);
  }

  const busySets = emptyWeekSets();
  const seenSets = emptyWeekSets();
  const first = zonedParts(windowStart, tz);
  const last = zonedParts(nowMs, tz);
  const firstDayMs = Date.UTC(first.year, first.month - 1, first.day) - DAY;
  const lastDayMs = Date.UTC(last.year, last.month - 1, last.day) + DAY;

  for (let dayMs = firstDayMs; dayMs <= lastDayMs; dayMs += DAY) {
    const date = datePartsFromMs(dayMs);
    const weekday = weekdayForDate(date.year, date.month, date.day);
    const weekKey = weekKeyForDate(date.year, date.month, date.day);
    for (let hour = 0; hour < 24; hour += 1) {
      const start = zonedTimeToUtc({ ...date, hour }, tz);
      const nextDate = normalizedDateTime(date.year, date.month, date.day, hour + 1);
      let end = zonedTimeToUtc(nextDate, tz);
      if (end <= start) end = start + HOUR; // サマータイムで欠けた時刻を持つ地域でも止まらないようにする
      if (start >= nowMs || end <= windowStart) continue;
      seenSets[weekday][hour].add(weekKey);
      if (counted.some((s) => s.start < end && s.end > start)) busySets[weekday][hour].add(weekKey);
    }
  }

  const days = Array.from({ length: 7 }, (_, weekday) => Array.from({ length: 24 }, (_, hour) => ({
    weekday,
    hour,
    busyWeeks: busySets[weekday][hour].size,
    seenWeeks: seenSets[weekday][hour].size,
    busyWeekKeys: [...busySets[weekday][hour]].sort((a, b) => a - b),
  })));

  return {
    timezone: tz,
    weeks: weekCount,
    windowStart,
    windowEnd: nowMs,
    sessionCount: counted.length,
    streamerCount: sources.size || (counted.length ? 1 : 0),
    missingEndCount,
    days,
  };
}

function unionBusyWeeks(cells) {
  if (cells.every((cell) => Array.isArray(cell.busyWeekKeys))) {
    const union = new Set();
    for (const cell of cells) for (const key of cell.busyWeekKeys) union.add(key);
    return union.size;
  }
  // busyGrid を通さない表でも止まらないようにする。正確な週の和集合は分からないので最大値を使う
  return Math.max(...cells.map((cell) => cell.busyWeeks));
}

function makeWindow(weekday, startHour, endHour, cells, quiet) {
  const slice = cells.slice(startHour, endHour);
  return {
    weekday,
    startHour,
    endHour,
    minutes: (endHour - startHour) * 60,
    busyWeeks: quiet ? 0 : unionBusyWeeks(slice),
    seenWeeks: Math.max(...slice.map((cell) => cell.seenWeeks ?? 0)),
    quiet,
  };
}

function zeroRuns(weekday, hours) {
  const runs = [];
  let start = null;
  for (let hour = 0; hour <= 24; hour += 1) {
    const isQuiet = hour < 24 && hours[hour].busyWeeks === 0;
    if (isQuiet && start == null) start = hour;
    if (!isQuiet && start != null) {
      runs.push(makeWindow(weekday, start, hour, hours, true));
      start = null;
    }
  }
  return runs;
}

function leastBusyRun(weekday, hours) {
  const minBusy = Math.min(...hours.map((cell) => cell.busyWeeks));
  const candidates = [];
  let start = null;
  for (let hour = 0; hour <= 24; hour += 1) {
    const low = hour < 24 && hours[hour].busyWeeks === minBusy;
    if (low && start == null) start = hour;
    if (!low && start != null) {
      candidates.push(makeWindow(weekday, start, hour, hours, false));
      start = null;
    }
  }
  candidates.sort((a, b) => b.minutes - a.minutes || a.startHour - b.startHour);
  return candidates[0] ?? null;
}

/**
 * 曜日ごとの静かな時間帯を返す。windows は配信 0 回だけ、長い順。
 * 0 回の時間帯が 1 つも無い曜日だけ、best にいちばん少ない時間帯を入れる。
 */
export function quietWindows(grid, { minMinutes = 60 } = {}) {
  const min = Number(minMinutes);
  if (!Number.isFinite(min) || min <= 0) throw new Error('minMinutes は 0 より大きい数にしてください');
  return {
    minMinutes: min,
    days: (grid?.days ?? []).map((hours, weekday) => {
      const allZeroRuns = zeroRuns(weekday, hours);
      const windows = allZeroRuns
        .filter((window) => window.minutes >= min)
        .sort((a, b) => b.minutes - a.minutes || a.startHour - b.startHour);
      return {
        weekday,
        windows,
        best: allZeroRuns.length === 0 ? leastBusyRun(weekday, hours) : null,
      };
    }),
  };
}

function cellAt(grid, ts, tz) {
  const p = zonedParts(ts, tz);
  const weekday = weekdayForDate(p.year, p.month, p.day);
  return grid.days?.[weekday]?.[p.hour] ?? null;
}

function localHourStart(ms, tz) {
  const p = zonedParts(ms, tz);
  return zonedTimeToUtc({ year: p.year, month: p.month, day: p.day, hour: p.hour }, tz);
}

function nextLocalHourStart(ms, tz) {
  const p = zonedParts(ms, tz);
  const exact = p.minute === 0 && p.second === 0 && ms % 1000 === 0;
  const at = normalizedDateTime(p.year, p.month, p.day, p.hour + (exact ? 0 : 1));
  return zonedTimeToUtc(at, tz);
}

/**
 * 今入っている時間帯か、今より後に始まるいちばん近い静かな時間帯を返す。
 * 完全に 0 回の時間帯が無いときは quiet:false で、いちばん少ない時間帯を返す。
 */
export function nextQuiet(grid, { now = Date.now(), minMinutes = 60 } = {}) {
  const nowMs = timeValue(now);
  const min = Number(minMinutes);
  if (nowMs == null) throw new Error('now は時刻にしてください');
  if (!Number.isFinite(min) || min <= 0) throw new Error('minMinutes は 0 より大きい数にしてください');
  const tz = grid?.timezone || DEFAULT_TZ;
  const allCells = (grid?.days ?? []).flat();
  if (!allCells.some((cell) => cell.busyWeeks > 0)) return null;

  if (cellAt(grid, nowMs, tz)?.busyWeeks === 0) {
    let start = localHourStart(nowMs, tz);
    for (;;) {
      const previousStart = addLocalHours(start, tz, -1);
      if (cellAt(grid, previousStart, tz)?.busyWeeks !== 0) break;
      start = previousStart;
    }
    let hours = 0;
    let end = start;
    while (hours < 168 && cellAt(grid, end, tz)?.busyWeeks === 0) {
      hours += 1;
      end = addLocalHours(end, tz, 1);
    }
    const minutes = hours * 60;
    if (minutes >= min) return { start, end, minutes, busyWeeks: 0, quiet: true, alreadyOpen: true };
  }

  let cursor = nextLocalHourStart(nowMs, tz);
  for (let i = 0; i < 168; i += 1) {
    const cell = cellAt(grid, cursor, tz);
    const previous = cellAt(grid, addLocalHours(cursor, tz, -1), tz);
    if (cell?.busyWeeks === 0 && previous?.busyWeeks !== 0) {
      let hours = 0;
      let end = cursor;
      while (hours < 168 && cellAt(grid, end, tz)?.busyWeeks === 0) {
        hours += 1;
        end = addLocalHours(end, tz, 1);
      }
      const minutes = hours * 60;
      if (minutes >= min) return { start: cursor, end, minutes, busyWeeks: 0, quiet: true };
    }
    cursor = addLocalHours(cursor, tz, 1);
  }

  const windows = quietWindows(grid, { minMinutes: 60 });
  const candidates = [];
  cursor = nextLocalHourStart(nowMs, tz);
  for (let i = 0; i < 168; i += 1) {
    const p = zonedParts(cursor, tz);
    const weekday = weekdayForDate(p.year, p.month, p.day);
    const day = windows.days[weekday];
    if (day?.best && day.best.startHour === p.hour && !candidates.some((c) => c.weekday === weekday && c.startHour === p.hour)) {
      const hours = day.best.endHour - day.best.startHour;
      candidates.push({
        start: cursor,
        end: addLocalHours(cursor, tz, hours),
        minutes: day.best.minutes,
        busyWeeks: day.best.busyWeeks,
        quiet: false,
        weekday,
        startHour: p.hour,
      });
    }
    cursor = addLocalHours(cursor, tz, 1);
  }
  candidates.sort((a, b) => a.busyWeeks - b.busyWeeks || a.start - b.start);
  if (!candidates.length) return null;
  const { weekday, startHour, ...result } = candidates[0];
  return result;
}
