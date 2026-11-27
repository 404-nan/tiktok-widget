// 配信者からのプランの申し込み（上のプランにする upgrade・次の更新をしない cancel）を、
// data/tenants/<id>/plan-requests.jsonl に追記だけで残す。管理画面で確かめて有効にする・断るのもここに追記する。
// お金の出入り（いくら受け取ったか）は持たない。それは支払いの台帳（PR #24 / #9）の役目。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { recordError } from './error-log.js';
import { defaultPlanId, getPlan, listPlans } from './plans.js';

export const REQUEST_TYPES = ['upgrade', 'cancel'];
export const REQUEST_STATES = ['pending', 'approved', 'rejected'];
export const PLAN_REQUESTS_FILE = 'plan-requests.jsonl';
const NOTIFY_TIMEOUT_MS = 5000;
const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** 申し込みを受けられないときの例外。status は HTTP で返す番号 */
export class PlanRequestError extends Error {
  constructor(message, { status = 400, cause } = {}) {
    super(message, cause ? { cause } : undefined);
    this.name = 'PlanRequestError';
    this.status = status;
  }
}

const TYPE_LABEL = { upgrade: 'プランの申し込み', cancel: '解約（次の更新をしない）' };
const STATE_LABEL = { pending: '確認中', approved: '有効にしました', rejected: '見送りました' };

/** 画面に出す形。type・state の日本語の名前と、プランの表示名を足す */
export function describeRequest(request) {
  if (!request) return null;
  const planLabel = request.plan ? getPlan(request.plan)?.label ?? request.plan : '';
  const cancelDone = request.type === 'cancel' && request.state === 'approved';
  return {
    ...request,
    typeLabel: TYPE_LABEL[request.type] ?? request.type,
    stateLabel: cancelDone ? '解約を受けました' : STATE_LABEL[request.state] ?? request.state,
    planLabel,
  };
}

/**
 * 日本時間の今日から1か月後の日付（YYYY-MM-DD）。月末は次の月の末日にそろえる（1/31 → 2/28）。
 * 有効にした日を1日目と数えるので、支払った日まで（paidUntil）はこの日の終わりまで。
 */
export function oneMonthLater(now = Date.now()) {
  const [y, m, d] = DAY_FMT.format(new Date(now)).split('-').map(Number);
  const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const next = new Date(Date.UTC(y, m, Math.min(d, lastDay)));
  return next.toISOString().slice(0, 10);
}

/**
 * 配信者1人分の申し込みの記録。1行が申し込み1件のその時点の姿で、同じ id の後の行が新しい姿。
 * 行は消さず、書き換えもしない（何がいつ起きたかを後から全部たどれるようにする）。
 */
export class PlanRequests {
  constructor({ dir, tenant = null, now = Date.now } = {}) {
    if (!dir) throw new Error('dir がありません');
    this.file = path.join(dir, PLAN_REQUESTS_FILE);
    this.tenant = tenant;
    this.now = now;
  }

  #ioError(op, cause) {
    const err = new PlanRequestError(op === 'read' ? '申し込みの記録を読めませんでした' : '申し込みを記録できませんでした', { status: 500, cause });
    console.error(`[plan-requests] ${err.message}: ${cause?.message ?? cause}`);
    recordError(err, { kind: 'plan.request.io', cause, context: { tenant: this.tenant, op: `plan.request.${op}`, file: path.basename(this.file) } });
    return err;
  }

  /** 全部の申し込み（新しいものが先）。壊れた行は飛ばして、何行飛ばしたかを記録に残す */
  list() {
    let text = '';
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch (err) {
      if (err?.code === 'ENOENT') return [];
      throw this.#ioError('read', err);
    }
    const byId = new Map();
    let broken = 0;
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { broken++; continue; }
      if (!row || typeof row.id !== 'string' || !REQUEST_TYPES.includes(row.type) || !REQUEST_STATES.includes(row.state)) { broken++; continue; }
      byId.set(row.id, row);
    }
    if (broken) {
      const err = new PlanRequestError(`申し込みの記録に読めない行が ${broken} 行あったので飛ばしました`, { status: 500 });
      console.warn(`[plan-requests] ${err.message}`);
      recordError(err, { kind: 'plan.request.io', level: 'warn', context: { tenant: this.tenant, op: 'plan.request.parse', file: path.basename(this.file), broken } });
    }
    return [...byId.values()].sort((a, b) => String(b.lastAt ?? b.at).localeCompare(String(a.lastAt ?? a.at)));
  }

  pending() {
    return this.list().filter((row) => row.state === 'pending');
  }

  get(requestId) {
    return this.list().find((row) => row.id === requestId) ?? null;
  }

  #append(row) {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      fs.appendFileSync(this.file, `${JSON.stringify(row)}\n`);
    } catch (err) {
      throw this.#ioError('write', err);
    }
    return row;
  }

  /**
   * 申し込みを受ける。同じ type・plan の確認中の申し込みがあれば、新しく作らずに1件へまとめる
   * （押し直し・二重送信を捨てずに数える）。返り値の merged が true なら、まとめた。
   */
  submit({ type, plan = null } = {}) {
    if (!REQUEST_TYPES.includes(type)) throw new PlanRequestError('申し込みの種類は upgrade か cancel です');
    const planId = plan == null || plan === '' ? null : String(plan);
    if (type === 'upgrade') {
      const paid = listPlans().filter((p) => p.id !== defaultPlanId()).map((p) => p.id);
      if (!paid.includes(planId)) throw new PlanRequestError(`申し込めるプランは ${paid.map((id) => getPlan(id)?.label ?? id).join('・')} です`);
    }
    const at = new Date(this.now()).toISOString();
    const same = this.pending().find((row) => row.type === type && (row.plan ?? null) === planId);
    if (same) {
      const request = this.#append({ ...same, count: (Number(same.count) || 1) + 1, lastAt: at });
      return { request, merged: true };
    }
    const request = this.#append({ id: crypto.randomBytes(6).toString('hex'), type, plan: planId, at, lastAt: at, state: 'pending', count: 1 });
    return { request, merged: false };
  }

  /** 確認中の申し込みを、有効にした（approved）・見送った（rejected）にする */
  decide(requestId, state) {
    if (state !== 'approved' && state !== 'rejected') throw new PlanRequestError('approved か rejected を選んでください');
    const current = this.get(String(requestId ?? ''));
    if (!current) throw new PlanRequestError('その申し込みは見つかりません', { status: 404 });
    if (current.state !== 'pending') throw new PlanRequestError(`その申し込みはもう「${STATE_LABEL[current.state]}」です`, { status: 409 });
    return this.#append({ ...current, state, decidedAt: new Date(this.now()).toISOString() });
  }
}

/** オーナーへ送る1行。配信者の名前と、何の申し込みか */
export function notifyText({ tenantName, tenantId, request }) {
  const who = tenantName ? `${tenantName}（${tenantId}）` : tenantId;
  const what = request.type === 'cancel'
    ? '解約（次の更新をしない）の申し込み'
    : `${getPlan(request.plan)?.label ?? request.plan} の申し込み`;
  return `[ライコネ] ${who} から${what}がありました。管理画面で確かめてください`;
}

/**
 * TW_NOTIFY_WEBHOOK（Discord の webhook など）が設定されているときだけ、オーナーへ1行送る。
 * 失敗しても例外は投げない（申し込みそのものは受けたままにする）。原因は plan.request.notify に残す。
 * webhook の URL には鍵が入っているので、記録にも返り値にも入れない。
 * 返り値: 'sent'（送った）/ 'off'（設定なし）/ 'failed'（送れなかった）
 */
export async function notifyOwner(text, { env = process.env, fetchImpl = globalThis.fetch, context = {}, timeoutMs = NOTIFY_TIMEOUT_MS } = {}) {
  const url = String(env?.TW_NOTIFY_WEBHOOK ?? '').trim();
  if (!url) return 'off';
  try {
    let protocol = '';
    try { protocol = new URL(url).protocol; } catch {}
    if (protocol !== 'https:' && protocol !== 'http:') throw new Error('TW_NOTIFY_WEBHOOK は http(s):// で始まる URL にしてください');
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: text, allowed_mentions: { parse: [] } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!res.ok) throw new Error(`通知先が HTTP ${res.status} を返しました`);
    return 'sent';
  } catch (err) {
    console.warn(`[plan-requests] オーナーへの通知を送れませんでした: ${err?.message ?? err}`);
    recordError(err, { kind: 'plan.request.notify', level: 'warn', context: { ...context, op: 'plan.request.notify' } });
    return 'failed';
  }
}
