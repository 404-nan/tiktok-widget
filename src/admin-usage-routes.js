// 管理画面の API 使用量ページへ、集計・配信者別・時間別・Euler の上限を返す。
// ここでは数えるだけで、鍵や本文は返さない。
import { AI_SERVICES, aggregateRows, jstDayStart } from './api-usage.js';

const DAY_MS = 24 * 60 * 60 * 1000;
const AI_SERVICE_LIST = [...AI_SERVICES];

function rangeDays(range) {
  if (range === '30d') return 30;
  if (range === '24h' || range === 'today') return 1;
  return 7;
}

function percentView(limit) {
  if (!limit || !Number.isFinite(limit.max) || !Number.isFinite(limit.remaining)) return null;
  const used = Math.max(0, limit.max - limit.remaining);
  return {
    max: limit.max,
    remaining: limit.remaining,
    used,
    percent: limit.max > 0 ? Math.round((used / limit.max) * 1000) / 10 : null,
    reset_at: limit.reset_at ?? null,
  };
}

function serviceSummary(apiUsage, selector, now, rangeStart, limitWindows = null) {
  const base = apiUsage.summary({ ...selector, now });
  const rows = apiUsage.rows({ ...selector, from: rangeStart, to: now });
  const out = { ...base, range: aggregateRows(rows) };
  if (limitWindows?.day) out.today.limit = percentView(limitWindows.day);
  if (limitWindows?.hour) out.hour.limit = percentView(limitWindows.hour);
  return out;
}

async function freshLimits(limits) {
  try {
    await limits.refreshIfStale();
  } catch {}
  try { return limits.state(); } catch { return null; }
}

function buildAlerts(apiUsage, limitsState, now) {
  const alerts = [];
  const dayPercent = percentView(limitsState?.limits?.day)?.percent;
  const hourPercent = percentView(limitsState?.limits?.hour)?.percent;
  if (dayPercent != null && dayPercent >= 95) alerts.push({ level: 'danger', text: `Euler の今日の上限まで ${dayPercent}% です` });
  else if (dayPercent != null && dayPercent >= 80) alerts.push({ level: 'warning', text: `Euler の今日の上限の ${dayPercent}% を使っています` });
  if (hourPercent != null && hourPercent >= 95) alerts.push({ level: 'danger', text: `Euler の1時間の上限まで ${hourPercent}% です` });
  else if (hourPercent != null && hourPercent >= 80) alerts.push({ level: 'warning', text: `Euler の1時間の上限の ${hourPercent}% を使っています` });
  const rows = apiUsage.rows({ service: 'euler', from: now - DAY_MS, to: now });
  const limited = rows.filter((row) => row.status === 429).length;
  if (limited) alerts.push({ level: 'danger', text: `24時間以内に Euler から 429 が ${limited} 件返っています` });
  const tenants = apiUsage.tenants({ service: 'euler', from: now - DAY_MS, now });
  const total = tenants.reduce((sum, row) => sum + row.range.total, 0);
  if (tenants.length >= 2 && total >= 10) {
    const average = total / tenants.length;
    const top = tenants[0];
    if (top.range.total >= average * 3 && top.range.total >= 10) {
      alerts.push({ level: 'warning', tenant: top.tenant, text: `配信者 ${top.handle ?? top.tenant} の Euler 呼び出しが他より多くなっています` });
    }
  }
  return alerts;
}

export function bindAdminUsageRoutes(admin, { apiUsage, limits, tenantInfo = () => ({}), now: clock = Date.now }) {
  const now = () => clock();

  admin.get('/usage/summary', async (req, res) => {
    const at = now();
    const range = typeof req.query.range === 'string' ? req.query.range : '7d';
    const days = rangeDays(range);
    const rangeStart = range === '24h' ? at - DAY_MS : jstDayStart(at - (days - 1) * DAY_MS);
    const limitsState = await freshLimits(limits);
    const byService = {};
    for (const service of new Set(['euler', ...AI_SERVICE_LIST, ...apiUsage.services()])) {
      byService[service] = serviceSummary(apiUsage, { service }, at, rangeStart, service === 'euler' ? limitsState?.limits : null);
    }
    res.json({
      now: at,
      timezone: 'Asia/Tokyo',
      range,
      services: {
        euler: byService.euler,
        ai: serviceSummary(apiUsage, { services: AI_SERVICE_LIST }, at, rangeStart),
        byService,
      },
      limits: limitsState,
      alerts: buildAlerts(apiUsage, limitsState ?? {}, at),
    });
  });

  admin.get('/usage/tenants', (req, res) => {
    const at = now();
    const service = typeof req.query.service === 'string' && req.query.service ? req.query.service : 'euler';
    const range = typeof req.query.range === 'string' ? req.query.range : '7d';
    const days = rangeDays(range);
    const from = range === '24h' ? at - DAY_MS : jstDayStart(at - (days - 1) * DAY_MS);
    const rows = apiUsage.tenants({ service, from, now: at }).map((row) => ({
      ...row,
      ...tenantInfo(row.tenant),
    }));
    res.json({ now: at, timezone: 'Asia/Tokyo', service, range, tenants: rows });
  });

  admin.get('/usage/timeseries', (req, res) => {
    const at = now();
    const service = typeof req.query.service === 'string' && req.query.service ? req.query.service : 'euler';
    const range = typeof req.query.range === 'string' ? req.query.range : '24h';
    const granularity = req.query.granularity === 'day' || range !== '24h' ? 'day' : 'hour';
    const days = rangeDays(range);
    const from = range === '24h' ? at - DAY_MS : jstDayStart(at - (days - 1) * DAY_MS);
    res.json({
      now: at,
      timezone: 'Asia/Tokyo',
      service,
      range,
      tenant: typeof req.query.tenant === 'string' && req.query.tenant ? req.query.tenant : null,
      granularity,
      points: apiUsage.timeseries({ service, tenant: typeof req.query.tenant === 'string' && req.query.tenant ? req.query.tenant : undefined, granularity, from, to: at }),
    });
  });

  admin.get('/usage/euler/limits', async (_req, res) => {
    res.json(await freshLimits(limits));
  });

  admin.post('/usage/euler/refresh', async (_req, res) => {
    try {
      res.json(await limits.refresh({ force: true }));
    } catch (err) {
      res.status(502).json({ error: err.message, ...limits.state() });
    }
  });
}
