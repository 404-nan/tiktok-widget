// 配信後の効果ログを、送信者情報なしでAIへ渡せる集計にする。
import fs from 'node:fs';
import path from 'node:path';

const safeId = id => String(id ?? '').replace(/[^A-Za-z0-9_-]/g, '');
const readLines = file => fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line));

export function analyzeEffects(dir, { sessionId, from = null, to = null } = {}) {
  const id = safeId(sessionId);
  if (!id) return { ok: false, reason: '配信の id が必要です', summary: null, peaks: [], effects: [], frequentEffects: [], insufficientEffects: [] };
  const eventsFile = path.join(dir, `${id}.events.jsonl`);
  const reportFile = path.join(dir, `${id}.report.json`);
  if (!fs.existsSync(eventsFile) || !fs.existsSync(reportFile)) {
    return { ok: false, reason: '効果ログまたは集計報告がありません', summary: null, peaks: [], effects: [], frequentEffects: [], insufficientEffects: [] };
  }
  let events;
  let report;
  try { events = readLines(eventsFile); report = JSON.parse(fs.readFileSync(reportFile, 'utf8')); }
  catch { return { ok: false, reason: '効果ログが壊れているため確定できません', summary: null, peaks: [], effects: [], frequentEffects: [], insufficientEffects: [] }; }
  const start = Number(from ?? report.startedAt);
  const end = Number(to ?? report.endedAt);
  const selected = events.filter(e => Number.isFinite(Number(e.ts)) && e.ts >= start && e.ts <= end && !e.test);
  const gifts = selected.filter(e => e.kind === 'gift');
  const byMinute = new Map();
  for (const gift of gifts) {
    const minute = Math.floor((gift.ts - start) / 60_000);
    byMinute.set(minute, (byMinute.get(minute) ?? 0) + (Number(gift.coins) || 0));
  }
  const peaks = [...byMinute.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([minute, coins]) => ({ minute, coins }));
  const effects = Object.entries(report.effects ?? {}).map(([name, item]) => ({
    name, count: Number(item.count) || 0,
    samples: (item.samples ?? []).map(sample => ({ beforePerMinute: sample.beforePerMinute ?? null, afterPerMinute: sample.afterPerMinute ?? null, multiplier: sample.multiplier ?? null })),
  }));
  return {
    ok: true,
    reason: null,
    summary: { sessionId: id, startedAt: report.startedAt, endedAt: report.endedAt, durationMs: report.durationMs, medianCoinsPerMinute: report.medianCoinsPerMinute },
    peaks,
    effects,
    frequentEffects: effects.filter(item => item.count >= 2).map(({ name, count }) => ({ name, count })),
    insufficientEffects: effects.filter(item => item.count < 2).map(({ name, count }) => ({ name, count, reason: '比較対象が足りません' })),
  };
}
