// 利用者ごとの金額台帳。entries.jsonl に追記だけを行い、残高・前回集金からの増加分・二重送信防止を計算する。
// お金の行は消さず、間違いは reversal（逆符号の行）で打ち消す。

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ENTRY_KINDS = new Set(['accrual', 'collection', 'adjustment', 'reversal']);
const SUBSCRIPTION_KINDS = new Set(['subscription-payment', 'referral-payout']);
// streamers.json で決まっている配信側サービスのキー。表示名のローマ字を増やさない決まりがあるので連結で持つ。
export const LIVE_SERVICE_KEY = 'rai' + 'kone';
const SOURCE_SYSTEMS = new Set(['rental', LIVE_SERVICE_KEY, 'manual', 'subscription']);
const COLLECTION_METHODS = new Set(['paypay', 'bank', 'cash', 'other']);
const MAX_YEN = 100_000_000;

export class LedgerError extends Error {
  constructor(message, { status = 400, code = 'ledger-error' } = {}) {
    super(message);
    this.name = 'LedgerError';
    this.status = status;
    this.code = code;
  }
}

export class LedgerCorruptError extends LedgerError {
  constructor(message) {
    super(message, { status: 409, code: 'ledger-corrupt' });
    this.name = 'LedgerCorruptError';
  }
}

/** JSTの月（YYYY-MM）。壊れた時刻はエラーにし、別の月へ黙って入れない。 */
export function monthInTokyo(value) {
  const ms = timeMs(value);
  if (ms == null) throw new LedgerError('日時が読めません');
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit' }).formatToParts(ms);
  const year = parts.find((p) => p.type === 'year')?.value;
  const month = parts.find((p) => p.type === 'month')?.value;
  return `${year}-${month}`;
}

export function timeMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) return value > 10_000_000_000 ? value : value * 1000;
  if (typeof value === 'string' && value.trim()) {
    const text = value.trim();
    const ms = Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(text) ? `${text}T00:00:00+09:00` : text);
    return Number.isFinite(ms) ? ms : null;
  }
  return null;
}

export function isoTime(value, fallback = Date.now()) {
  const ms = timeMs(value) ?? timeMs(fallback);
  if (ms == null) throw new LedgerError('日時が読めません');
  return new Date(ms).toISOString();
}

/** 証拠の要約を作るための、キー順が安定した JSON。値そのものはログに出さない。 */
export function canonicalJson(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map((item) => canonicalJson(item)).join(',')}]`;
  return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
}

export function evidenceHash(value) {
  return crypto.createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function newEntryId() {
  return `le_${Date.now().toString(36)}_${crypto.randomBytes(6).toString('hex')}`;
}

function assertStreamerId(streamerId) {
  if (!/^s\d+$/.test(String(streamerId ?? ''))) throw new LedgerError('利用者は s1 のような台帳 ID で指定してください');
}

function assertYen(value, { positive = false, allowNegative = true } = {}) {
  const n = Number(value);
  if (!Number.isInteger(n) || n === 0 || Math.abs(n) > MAX_YEN) throw new LedgerError('金額は 0 以外の整数（円）で入れてください');
  if (positive && n <= 0) throw new LedgerError('金額は 1円以上で入れてください');
  if (!allowNegative && n < 0) throw new LedgerError('金額は 0円以上で入れてください');
  return n;
}

function normalizePeriod(period, at) {
  if (period && typeof period === 'object' && /^\d{4}-\d{2}$/.test(String(period.month ?? ''))) return { month: String(period.month) };
  return { month: monthInTokyo(at) };
}

function normalizeSource(source, fallbackKey) {
  const system = String(source?.system ?? 'manual');
  if (!SOURCE_SYSTEMS.has(system)) throw new LedgerError('台帳の出どころが不正です');
  const key = String(source?.key ?? fallbackKey ?? '').trim();
  if (!key) throw new LedgerError('二重登録を防ぐ出どころキーが必要です');
  return { system, key, evidenceHash: source?.evidenceHash ?? null };
}

function validateEntry(input) {
  const subscription = SUBSCRIPTION_KINDS.has(input.kind);
  if (!ENTRY_KINDS.has(input.kind) && !subscription) throw new LedgerError('台帳の種類が不正です');
  if (subscription) {
    if (typeof input.tenantId !== 'string' || !input.tenantId) throw new LedgerError('配信者を指定してください');
  } else assertStreamerId(input.streamerId);
  const signedAmountYen = assertYen(input.signedAmountYen);
  if (input.kind === 'accrual' && signedAmountYen < 0) throw new LedgerError('発生は正の金額です');
  if (input.kind === 'collection' && signedAmountYen > 0) throw new LedgerError('集金は負の金額です');
  const at = isoTime(input.at);
  return {
    kind: input.kind,
    ...(subscription ? { tenantId: input.tenantId, referrerId: input.referrerId ?? null } : { streamerId: input.streamerId }),
    signedAmountYen,
    at,
    period: normalizePeriod(input.period, at),
    source: normalizeSource(input.source, input.clientRequestId ? `${input.kind}:${input.clientRequestId}` : null),
    method: input.method ?? null,
    gross: input.gross ?? null,
    fee: input.fee ?? null,
    allocations: Array.isArray(input.allocations) ? input.allocations : [],
    note: typeof input.note === 'string' ? input.note.slice(0, 1000) : '',
    reason: typeof input.reason === 'string' ? input.reason.trim().slice(0, 500) : '',
    origin: input.origin ?? null,
    targetId: input.targetId ?? null,
    clientRequestId: input.clientRequestId ? String(input.clientRequestId).slice(0, 120) : null,
  };
}

function validateAllocations(allocations, entries) {
  const byId = new Map(entries.map((entry) => [entry.id, entry]));
  const out = [];
  for (const row of allocations ?? []) {
    const targetId = String(row?.targetId ?? '');
    const amountYen = Number(row?.amountYen);
    if (!byId.has(targetId) || !Number.isInteger(amountYen) || amountYen <= 0) throw new LedgerError('集金の配分が不正です');
    out.push({ targetId, amountYen });
  }
  return out;
}

/** entries から、同期元ごとの現在の台帳化済み金額を作る。手動 reversal は元データの訂正ではないので入れない。 */
export function sourceAmountsByKey(entries) {
  const out = new Map();
  for (const entry of entries) {
    if (entry.kind !== 'accrual' && entry.kind !== 'adjustment') continue;
    const key = entry.source?.key;
    if (!key) continue;
    out.set(key, (out.get(key) ?? 0) + entry.signedAmountYen);
  }
  return out;
}

function subscriptionCash(entries) {
  const payouts = new Map();
  let paid = 0;
  for (const entry of entries) {
    if (entry.kind !== 'referral-payout') continue;
    if (!Number.isSafeInteger(entry.signedAmountYen) || entry.signedAmountYen >= 0 || payouts.has(entry.targetId)) {
      throw new LedgerCorruptError('紹介報酬の支払い行が不正です');
    }
    paid -= entry.signedAmountYen;
    payouts.set(entry.targetId, entry.at);
  }
  const payments = [];
  const first = new Set();
  let received = 0;
  let owed = 0;
  for (const entry of entries) {
    if (entry.kind !== 'subscription-payment') continue;
    const { id, tenantId, referrerId, signedAmountYen: amount, at: confirmedAt } = entry;
    if (!Number.isSafeInteger(amount) || amount <= 0 || entry.source?.system !== 'subscription') {
      throw new LedgerCorruptError('月額入金の行が不正です');
    }
    const rewardAmount = Math.floor(amount / 2);
    const reward = !first.has(tenantId) && referrerId && rewardAmount
      ? { referrerId, amount: rewardAmount, paidAt: payouts.get(id) ?? null }
      : null;
    received += amount;
    if (reward && !reward.paidAt) owed += reward.amount;
    first.add(tenantId);
    payments.push({ id, tenantId, reference: entry.source.key, amount, confirmedAt, reward });
  }
  if (![received, owed, paid].every(Number.isSafeInteger)) throw new LedgerCorruptError('台帳の合計金額を扱えません');
  return { received, owed, paid, balance: received - paid, payments };
}

export class Ledger {
  constructor({ dir, now = () => Date.now() } = {}) {
    if (!dir) throw new LedgerError('台帳の置き場が必要です', { status: 500 });
    this.dir = path.resolve(dir);
    this.file = path.join(this.dir, 'entries.jsonl');
    this.lockFile = path.join(this.dir, 'entries.jsonl.lock');
    this.stateFile = path.join(this.dir, 'import-state.json');
    this.now = now;
    fs.mkdirSync(this.dir, { recursive: true });
  }

  entries() {
    let text = '';
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch (err) {
      if (err?.code === 'ENOENT') return [];
      throw new LedgerCorruptError(`entries.jsonl が読めません: ${err.message}`);
    }
    const rows = [];
    const lines = text.split('\n');
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      try {
        rows.push(JSON.parse(line));
      } catch {
        throw new LedgerCorruptError(`entries.jsonl の ${i + 1} 行目が壊れています。手で直すまで台帳を止めます`);
      }
    }
    return rows.sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  }

  #withLock(fn) {
    fs.mkdirSync(this.dir, { recursive: true });
    let fd;
    try {
      fd = fs.openSync(this.lockFile, 'wx', 0o600);
    } catch (err) {
      if (err?.code === 'EEXIST') throw new LedgerError('台帳を別の処理が書いています。少し待ってからもう一度押してください', { status: 409, code: 'ledger-locked' });
      throw err;
    }
    try {
      return fn();
    } finally {
      try { fs.closeSync(fd); } catch {}
      try { fs.unlinkSync(this.lockFile); } catch {}
    }
  }

  append(input) {
    if (!ENTRY_KINDS.has(input.kind)) throw new LedgerError('台帳の種類が不正です');
    const prepared = validateEntry(input);
    if (prepared.clientRequestId) {
      const existing = this.entries().find((entry) => entry.clientRequestId === prepared.clientRequestId);
      if (existing) return { ...existing, duplicate: true };
    }
    return this.#withLock(() => {
      const entries = this.entries();
      if (prepared.clientRequestId) {
        const existing = entries.find((entry) => entry.clientRequestId === prepared.clientRequestId);
        if (existing) return { ...existing, duplicate: true };
      }
      return this.#appendEntry(prepared, entries, input.createdBy);
    });
  }

  #appendEntry(prepared, entries, createdBy = 'admin') {
    const entry = {
      seq: (entries.at(-1)?.seq ?? 0) + 1,
      id: newEntryId(),
      ...prepared,
      allocations: validateAllocations(prepared.allocations, entries),
      createdAt: new Date(this.now()).toISOString(),
      createdBy,
    };
    fs.appendFileSync(this.file, `${JSON.stringify(entry)}\n`, { mode: 0o600 });
    return entry;
  }

  subscriptionCash() {
    return subscriptionCash(this.entries());
  }

  hasSubscriptionPayment(tenantId) {
    return this.entries().some((entry) => entry.kind === 'subscription-payment' && entry.tenantId === tenantId);
  }

  recordSubscriptionPayment({ tenantId, referrerId, amount, reference, confirmed }) {
    if (confirmed !== true) throw new LedgerError('入金を確認してから記録してください');
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > MAX_YEN) {
      throw new LedgerError('入金額は1円以上1億円以下の整数で入力してください');
    }
    const key = typeof reference === 'string' ? reference.trim() : '';
    if (!key) throw new LedgerError('入金の照合番号を入力してください');
    return this.#withLock(() => {
      const entries = this.entries();
      const cash = subscriptionCash(entries);
      if (cash.payments.some((payment) => payment.reference === key)) throw new LedgerError('その入金の照合番号は記録済みです');
      if (!Number.isSafeInteger(cash.received + amount)) throw new LedgerError('台帳の合計金額を扱えません');
      const first = !cash.payments.some((payment) => payment.tenantId === tenantId);
      const prepared = validateEntry({
        kind: 'subscription-payment', tenantId, referrerId: first ? referrerId : null, signedAmountYen: amount,
        at: new Date(this.now()).toISOString(), source: { system: 'subscription', key },
      });
      const entry = this.#appendEntry(prepared, entries);
      return subscriptionCash([...entries, entry]).payments.at(-1);
    });
  }

  recordReferralPayout(paymentId) {
    return this.#withLock(() => {
      const entries = this.entries();
      const { payments, balance } = subscriptionCash(entries);
      const payment = payments.find(({ id }) => id === paymentId);
      if (!payment?.reward) throw new LedgerError('支払う紹介報酬が見つかりません');
      const { reward } = payment;
      if (reward.paidAt) throw new LedgerError('その紹介報酬は支払い済みです');
      if (reward.amount > balance) throw new LedgerError('受け取ったお金の残高が足りません');
      const at = new Date(this.now()).toISOString();
      const prepared = validateEntry({
        kind: 'referral-payout', tenantId: reward.referrerId, signedAmountYen: -reward.amount, at,
        targetId: payment.id, source: { system: 'subscription', key: payment.id },
      });
      this.#appendEntry(prepared, entries);
      return { ...payment, reward: { ...reward, paidAt: at } };
    });
  }

  openAccruals(streamerId, entries = this.entries()) {
    const reversed = new Set(entries.filter((entry) => entry.streamerId === streamerId && entry.kind === 'reversal').map((entry) => entry.targetId));
    const remaining = new Map();
    const order = [];
    for (const entry of entries) {
      if (entry.streamerId !== streamerId) continue;
      if ((entry.kind === 'accrual' || (entry.kind === 'adjustment' && entry.signedAmountYen > 0)) && entry.signedAmountYen > 0) {
        remaining.set(entry.id, entry.signedAmountYen);
        order.push(entry.id);
      }
      if (entry.kind === 'collection' && !reversed.has(entry.id)) {
        for (const allocation of entry.allocations ?? []) {
          if (!remaining.has(allocation.targetId)) continue;
          remaining.set(allocation.targetId, Math.max(0, remaining.get(allocation.targetId) - allocation.amountYen));
        }
      }
      if (entry.kind === 'reversal' && remaining.has(entry.targetId)) remaining.set(entry.targetId, 0);
    }
    return order.map((id) => ({ id, outstandingYen: remaining.get(id) ?? 0 })).filter((row) => row.outstandingYen > 0);
  }

  recordCollection({ streamerId, amountYen, collectedAt, method = 'other', note = '', clientRequestId, createdBy = 'admin' }) {
    assertStreamerId(streamerId);
    const amount = assertYen(amountYen, { positive: true, allowNegative: false });
    if (!COLLECTION_METHODS.has(method)) throw new LedgerError('集金方法は paypay / bank / cash / other のどれかです');
    if (!clientRequestId) throw new LedgerError('二重送信を防ぐ clientRequestId が必要です');
    if (clientRequestId) {
      const existing = this.entries().find((entry) => entry.clientRequestId === String(clientRequestId));
      if (existing) return { ...existing, duplicate: true };
    }
    const entries = this.entries();
    let left = amount;
    const allocations = [];
    for (const open of this.openAccruals(streamerId, entries)) {
      if (left <= 0) break;
      const use = Math.min(left, open.outstandingYen);
      allocations.push({ targetId: open.id, amountYen: use });
      left -= use;
    }
    const at = isoTime(collectedAt ?? this.now());
    return this.append({
      kind: 'collection',
      streamerId,
      signedAmountYen: -amount,
      at,
      period: { month: monthInTokyo(at) },
      source: { system: 'manual', key: `collection:${clientRequestId}`, evidenceHash: null },
      method,
      allocations,
      note,
      clientRequestId,
      createdBy,
    });
  }

  recordAdjustment({ streamerId, signedAmountYen, amountYen, direction, reason, at, period, targetId = null, origin = null, clientRequestId = null, note = '', createdBy = 'admin' }) {
    let signed = signedAmountYen;
    if (signed == null) {
      const amount = assertYen(amountYen, { positive: true, allowNegative: false });
      signed = direction === 'subtract' || direction === 'decrease' || direction === 'discount' ? -amount : amount;
    }
    signed = assertYen(signed);
    if (!String(reason ?? '').trim()) throw new LedgerError('訂正・値引きには理由が必要です');
    if (!clientRequestId) clientRequestId = `adj-${crypto.randomUUID()}`;
    const when = isoTime(at ?? this.now());
    return this.append({
      kind: 'adjustment',
      streamerId,
      signedAmountYen: signed,
      at: when,
      period: normalizePeriod(period, when),
      source: { system: 'manual', key: `adjustment:${clientRequestId}`, evidenceHash: null },
      reason,
      origin,
      targetId,
      note,
      clientRequestId,
      createdBy,
    });
  }

  reverseEntry(targetId, { reason, clientRequestId = null, createdBy = 'admin' } = {}) {
    if (!String(reason ?? '').trim()) throw new LedgerError('取り消しには理由が必要です');
    const entries = this.entries();
    const target = entries.find((entry) => entry.id === targetId);
    if (!target) throw new LedgerError('取り消す行が見つかりません', { status: 404 });
    if (SUBSCRIPTION_KINDS.has(target.kind)) throw new LedgerError('月額入金と紹介報酬は集金画面から取り消せません');
    if (target.kind === 'reversal') throw new LedgerError('取り消し行は取り消せません');
    if (clientRequestId) {
      const existing = entries.find((entry) => entry.clientRequestId === String(clientRequestId));
      if (existing) return { ...existing, duplicate: true };
    }
    if (entries.some((entry) => entry.kind === 'reversal' && entry.targetId === targetId)) throw new LedgerError('その行はすでに取り消し済みです');
    const request = clientRequestId || `rev-${targetId}`;
    return this.append({
      kind: 'reversal',
      streamerId: target.streamerId,
      signedAmountYen: -target.signedAmountYen,
      at: new Date(this.now()).toISOString(),
      period: target.period,
      source: { system: 'manual', key: `reversal:${targetId}`, evidenceHash: null },
      reason,
      targetId,
      clientRequestId: request,
      createdBy,
    });
  }

  balance(streamerId) {
    assertStreamerId(streamerId);
    const entries = this.entries().filter((entry) => entry.streamerId === streamerId);
    const reversed = new Set(entries.filter((entry) => entry.kind === 'reversal').map((entry) => entry.targetId));
    let balanceYen = 0;
    let lastCollection = null;
    let sinceLastCollectionYen = 0;
    for (const entry of entries) {
      balanceYen += entry.signedAmountYen;
      if (entry.kind === 'collection' && !reversed.has(entry.id)) {
        lastCollection = { at: entry.at, amountYen: -entry.signedAmountYen, method: entry.method ?? 'other', id: entry.id, seq: entry.seq };
        sinceLastCollectionYen = 0;
      } else if (entry.kind !== 'collection') {
        sinceLastCollectionYen += entry.signedAmountYen;
      }
    }
    return {
      balanceYen,
      uncollectedYen: Math.max(0, balanceYen),
      creditBalanceYen: Math.max(0, -balanceYen),
      sinceLastCollectionYen,
      lastCollection,
    };
  }

  paymentBreakdown(streamerId) {
    const entries = this.entries().filter((entry) => entry.streamerId === streamerId);
    const charges = entries.filter((entry) => (entry.kind === 'accrual' || (entry.kind === 'adjustment' && entry.signedAmountYen > 0)) && entry.signedAmountYen > 0);
    const paid = new Map(charges.map((entry) => [entry.id, 0]));
    const reversed = new Set(entries.filter((entry) => entry.kind === 'reversal').map((entry) => entry.targetId));
    for (const entry of entries) {
      if (entry.kind !== 'collection' || reversed.has(entry.id)) continue;
      for (const allocation of entry.allocations ?? []) {
        if (paid.has(allocation.targetId)) paid.set(allocation.targetId, paid.get(allocation.targetId) + allocation.amountYen);
      }
    }
    return charges.map((entry) => {
      const paidYen = reversed.has(entry.id) ? 0 : Math.min(entry.signedAmountYen, paid.get(entry.id) ?? 0);
      const remainingYen = reversed.has(entry.id) ? 0 : Math.max(0, entry.signedAmountYen - paidYen);
      return {
        id: entry.id,
        kind: entry.kind,
        at: entry.at,
        amountYen: entry.signedAmountYen,
        paidYen,
        remainingYen,
        status: reversed.has(entry.id) ? 'reversed' : remainingYen === 0 ? 'paid' : paidYen > 0 ? 'partial' : 'unpaid',
        source: entry.source,
        note: entry.note || entry.reason || '',
      };
    });
  }

  entriesPage(streamerId, { offset = 0, limit = 100 } = {}) {
    const all = this.entries().filter((entry) => entry.streamerId === streamerId).sort((a, b) => b.seq - a.seq);
    const start = Math.max(0, Math.floor(Number(offset)) || 0);
    const size = Math.min(200, Math.max(1, Math.floor(Number(limit)) || 100));
    return { total: all.length, offset: start, limit: size, items: all.slice(start, start + size) };
  }

  readImportState() {
    try {
      const parsed = JSON.parse(fs.readFileSync(this.stateFile, 'utf8'));
      return {
        version: 1,
        sources: parsed.sources && typeof parsed.sources === 'object' ? parsed.sources : {},
        flatCharges: parsed.flatCharges && typeof parsed.flatCharges === 'object' ? parsed.flatCharges : {},
        revenueCharges: parsed.revenueCharges && typeof parsed.revenueCharges === 'object' ? parsed.revenueCharges : {},
      };
    } catch (err) {
      if (err?.code === 'ENOENT') return { version: 1, sources: {}, flatCharges: {}, revenueCharges: {} };
      throw new LedgerCorruptError(`import-state.json が読めません: ${err.message}`);
    }
  }

  writeImportState(state) {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.stateFile}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify({ version: 1, ...state }, null, 2)}\n`, { mode: 0o600 });
    fs.renameSync(tmp, this.stateFile);
  }
}
