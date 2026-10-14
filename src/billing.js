// 配信者ごとのプランと支払い。決済サービスは使わず、状態・期限・プランを手で入れる。
// 確認スイッチ（enforcement）は全体の非常停止。
// オフ（初期値・未設定）: 状態や日付に関係なく、配信画面・新しい接続・機能・ウィジェットは全部許可する。停止と書いてあっても止めない。
// オン: 停止（手で止めた、または支払い待ちが7日を過ぎた）のとき、新しい接続を始めず配信画面を出さない。配信中の接続は切らない。
// 5000円プランだけの機能を限るのも、スイッチがオンのときだけ。
// 状態の計算、管理画面の表示、有料化のお知らせ、支払い待ちの案内は、スイッチがオフでも今までどおり出す。
// 支払いファイルが壊れていてスイッチがオンのときだけ止める。ファイルが無いときと、判定が例外のときは通す。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PLANS = [
  { id: 'pct5', label: '5%プラン', price: null },
  { id: 'flat2000', label: '2000円プラン', price: 2000 },
  { id: 'flat5000', label: '5000円プラン', price: 5000 },
];
// 以前の保存名。読み込みでは新しい名前と同じものとして扱う（ファイルは読み込みでは書き換えない）
const PLAN_ALIAS = {
  pct5: 'pct5',
  percent5: 'pct5',
  flat2000: 'flat2000',
  yen2000: 'flat2000',
  flat5000: 'flat5000',
  yen5000: 'flat5000',
};
const STATUS_IDS = new Set(['trial', 'active', 'past_due', 'suspended']);
export const GRACE_MS = 7 * 24 * 60 * 60 * 1000;
export const TRIAL_NOTICE_MS = 30 * 24 * 60 * 60 * 1000;
export const STATUS_LABEL = {
  trial: 'お試し',
  active: '支払い済み',
  past_due: '支払い待ち',
  suspended: '停止',
  free: '無料提供',
  unpaid: '未払い',
};
const HISTORY_FIELDS = ['status', 'trialEndsAt', 'paidUntil', 'plan', 'note'];
const DAY_FMT = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });

// 5000円プランだけにできる機能。管理画面の名前と、短い別名の両方を受ける
const FLAG_GROUPS = [
  ['bosses', 'boss'],
  ['gacha'],
  ['mediaAlerts', 'media'],
  ['rouletteLinks'],
  ['roulettes'],
];
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

export function canonicalPlan(value) {
  const id = PLAN_ALIAS[String(value ?? '').trim()];
  return id ?? null;
}

export function canonicalStatus(value) {
  const status = String(value ?? '').trim();
  return STATUS_IDS.has(status) ? status : null;
}

const planOf = (id) => PLANS.find((p) => p.id === canonicalPlan(id)) ?? null;

/** 判定が落ちたら止めない。ログだけ残す */
export function safely(label, fn, fallback) {
  try {
    return fn();
  } catch (err) {
    console.warn(`[billing] ${label}に失敗したので通します: ${err?.message ?? err}`);
    return fallback;
  }
}

/** 環境変数と管理画面のどちらで、5000円プランだけの機能を限るか */
export function enforcementOn({ setting = null, env = process.env } = {}) {
  if (setting === true || setting === 'on') return true;
  if (setting === false || setting === 'off') return false;
  const flag = String(env?.TW_BILLING ?? '').trim().toLowerCase();
  if (flag === 'on' || flag === '1' || flag === 'true') return true;
  if (flag === 'off' || flag === '0' || flag === 'false') return false;
  return env?.TW_ENV === 'dev';
}

/** YYYY-MM-DD はその日の終わり（日本時間）まで有効。壊れた値は null */
export function paidUntilEnd(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const s = String(value).trim();
  const day = s.match(/^(\d{4}-\d{2}-\d{2})/);
  if (day) {
    const t = Date.parse(`${day[1]}T23:59:59.999+09:00`);
    return Number.isFinite(t) ? t : null;
  }
  const t = Date.parse(s);
  return Number.isFinite(t) ? t : null;
}

export function normalizeDate(value) {
  const s = String(value ?? '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00+09:00`);
  if (!Number.isFinite(t)) return null;
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
  return fmt.format(t) === s ? s : null;
}

/**
 * trial: お試し（記録が無い人もここ。止めない）
 * active: 支払った日までが来ていない
 * past_due: 期限を過ぎてから7日以内
 * suspended: 手で停止、または支払い待ちの7日が過ぎた
 * 状態を手で入れているときはそれが優先。無料提供（free）は、状態が空の古い記録だけお試しにする。
 * お試しの期限を過ぎても、自動では止めない。
 */
export function computeStatus(entry, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return 'trial';
  const explicit = canonicalStatus(entry.status);
  if (explicit === 'suspended') return 'suspended';
  if (entry.free === true && explicit == null) return 'trial';
  if (explicit === 'trial') return 'trial';

  const paidEnd = paidUntilEnd(entry.paidUntil);
  if (explicit === 'past_due') {
    const since = graceStart(entry, paidEnd);
    if (since == null) return 'past_due';
    return now < since + GRACE_MS ? 'past_due' : 'suspended';
  }
  if (explicit === 'active' || (explicit == null && paidEnd != null)) {
    if (paidEnd == null || paidEnd >= now) return 'active';
    return now < paidEnd + GRACE_MS ? 'past_due' : 'suspended';
  }
  return 'trial';
}

export const effectiveStatus = computeStatus;

/** 支払い待ちが始まった時刻。手で入れた時刻、無ければ支払った日の終わり */
function graceStart(entry, paidEnd = paidUntilEnd(entry?.paidUntil)) {
  const at = Number(entry?.pastDueAt);
  if (Number.isFinite(at)) return at;
  if (paidEnd != null) return paidEnd;
  const statusAt = Number(entry?.statusAt);
  if (Number.isFinite(statusAt)) return statusAt;
  return null;
}

/** お試し終了の30日前から、お試しのあいだ出す */
export function trialNotice(entry, now = Date.now()) {
  return safely('有料化のお知らせの判定', () => {
    if (computeStatus(entry, now) !== 'trial') return false;
    const end = paidUntilEnd(entry?.trialEndsAt);
    if (end == null) return false;
    return now >= end - TRIAL_NOTICE_MS;
  }, false);
}

function graceUntilDay(entry, now = Date.now()) {
  if (computeStatus(entry, now) !== 'past_due') return '';
  const since = graceStart(entry);
  if (since == null) return '';
  return DAY_FMT.format(new Date(since + GRACE_MS));
}

/** 紹介や割引に使う月額（円）。手入力がプランの金額より優先。5%プランは手入力が無いと 0 */
export function monthlyPriceYen(entry) {
  if (!entry) return 0;
  if (entry.monthlyPrice != null && entry.monthlyPrice !== '') {
    const n = Number(entry.monthlyPrice);
    if (Number.isFinite(n) && n >= 0) return Math.round(n);
  }
  return planOf(entry.plan)?.price ?? 0;
}

export function referralCreditYen(monthlyPrice, multiplier = 1.5) {
  const price = Math.max(0, Math.round(Number(monthlyPrice) || 0));
  const m = Number(multiplier);
  const mult = Number.isFinite(m) && m > 0 ? m : 1.5;
  return Math.round(price * mult);
}

/** 双方の割引残高に、それぞれの月額 × 倍率を足す。現金は増えない */
export function grantReferral({ referrer, referee, multiplier = 1.5 } = {}) {
  const referrerCredit = referralCreditYen(monthlyPriceYen(referrer), multiplier);
  const refereeCredit = referralCreditYen(monthlyPriceYen(referee), multiplier);
  return {
    referrerCredit,
    refereeCredit,
    referrer: { ...referrer, credit: Math.max(0, Math.round(Number(referrer?.credit) || 0)) + referrerCredit },
    referee: {
      ...referee,
      credit: Math.max(0, Math.round(Number(referee?.credit) || 0)) + refereeCredit,
      referredBy: referrer?.id ?? referee?.referredBy ?? null,
    },
  };
}

/** 次の1か月に残高から引ける割引。支払う額は 0 未満にしない */
export function monthDiscount(entry) {
  const price = monthlyPriceYen(entry);
  const credit = Math.max(0, Math.round(Number(entry?.credit) || 0));
  const discount = Math.min(credit, price);
  return { price, discount, due: price - discount, creditAfter: credit - discount };
}

export function blocksOverlay(entry, { now = Date.now(), enforcement = false } = {}) {
  return safely('配信画面を止める判定', () => {
    if (!enforcement) return false;
    return computeStatus(entry, now) === 'suspended';
  }, false);
}

/** 新しい配信接続を始めてよいか。オフのときはいつも許可。オンでも配信中（live）は止めない */
export function allowsNewConnection(entry, { live = false, now = Date.now(), enforcement = false } = {}) {
  return safely('配信接続の判定', () => {
    if (!enforcement) return true;
    if (live) return true;
    return computeStatus(entry, now) !== 'suspended';
  }, true);
}

function namesFor(feature) {
  const key = String(feature ?? '').trim();
  return FLAG_GROUPS.find((group) => group.includes(key)) ?? [key];
}

export function isPremiumOnly(feature, premiumFeatures = []) {
  const flags = new Set((premiumFeatures ?? []).map((name) => String(name ?? '').trim()).filter(Boolean));
  return namesFor(feature).some((name) => flags.has(name));
}

/**
 * 機能を配信画面に出してよいか。オフ（初期値）のときは状態に関係なく許可。
 * オンで停止のときは、どの機能も出さない。5000円プランだけの機能は、オンのときだけ限る。
 */
export function allowsFeature(entry, feature, { enforcement = false, premiumFeatures = [], now = Date.now() } = {}) {
  return safely('機能の判定', () => {
    if (!enforcement) return true;
    if (computeStatus(entry, now) === 'suspended') return false;
    if (!isPremiumOnly(feature, premiumFeatures)) return true;
    if (!entry?.plan) return true;
    return canonicalPlan(entry.plan) === 'flat5000';
  }, true);
}

/** ウィジェットの HTML を空白にするか。オフのときは出さない判定をしない */
export function widgetPageBlocked({ entry = null, feature = null, enforcement = false, premiumFeatures = [], now = Date.now() } = {}) {
  return safely('ウィジェットの判定', () => {
    if (!enforcement) return false;
    if (blocksOverlay(entry, { now, enforcement: true })) return true;
    if (feature && !allowsFeature(entry, feature, { enforcement: true, premiumFeatures, now })) return true;
    return false;
  }, false);
}

function recordBillingChange(cur, before) {
  const changes = {};
  for (const key of HISTORY_FIELDS) {
    const prev = before[key] ?? null;
    const next = cur[key] ?? null;
    if (prev !== next) changes[key] = { before: prev, after: next };
  }
  if (!Object.keys(changes).length) return;
  if (!Array.isArray(cur.history)) cur.history = [];
  cur.history.push({ at: new Date().toISOString(), changes });
  if (cur.history.length > 50) cur.history.splice(0, cur.history.length - 50);
}

/** 未払いの配信画面には、読み込み直し以外のメッセージを流さない */
export function overlayMessageAllowed({ role = 'owner', blocked = false, type = '' } = {}) {
  if (role !== 'obs' || !blocked) return true;
  return type === 'hello' || type === 'entitlements';
}

const normCode = (value) => String(value ?? '').trim().toLowerCase();

function makeCode() {
  return Array.from(crypto.randomBytes(8), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
}

export class BillingStore {
  constructor({ dir, env = process.env } = {}) {
    this.dir = dir;
    this.env = env;
    this.file = path.join(dir, 'billing.json');
    this.data = { enforcement: null, multiplier: 1.5, premiumFeatures: [], accounts: {} };
    this.corrupt = false;
    this.load();
  }

  load() {
    this.corrupt = false;
    let raw = '';
    try {
      raw = fs.readFileSync(this.file, 'utf8');
    } catch (err) {
      // ファイルが無いときはお試しのまま。無いファイルは読み込みでは作らない
      if (err?.code !== 'ENOENT') this.corrupt = true;
      return this.data;
    }
    try {
      const d = JSON.parse(raw);
      this.data = {
        enforcement: d.enforcement === true ? true : d.enforcement === false ? false : null,
        multiplier: d.multiplier === 2 ? 2 : 1.5,
        premiumFeatures: Array.isArray(d.premiumFeatures) ? d.premiumFeatures.map((name) => String(name)).filter(Boolean) : [],
        accounts: d.accounts && typeof d.accounts === 'object' && !Array.isArray(d.accounts) ? d.accounts : {},
      };
    } catch {
      // 壊れたファイルは読み込みでは上書きしない。スイッチがオンのときだけ、中身が読めないので止める
      this.corrupt = true;
      this.data = { enforcement: null, multiplier: 1.5, premiumFeatures: [], accounts: {} };
    }
    return this.data;
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify(this.data, null, 2)}\n`);
    fs.renameSync(tmp, this.file);
  }

  enforcement() {
    return enforcementOn({ setting: this.data.enforcement, env: this.env });
  }

  account(id) {
    const row = this.data.accounts?.[id];
    return row ? { ...row } : null;
  }

  findByCode(code) {
    const want = normCode(code);
    if (!want) return null;
    for (const [id, row] of Object.entries(this.data.accounts ?? {})) {
      if (normCode(row?.code) === want) return id;
    }
    return null;
  }

  assertUsableCode(code) {
    if (!String(code ?? '').trim()) throw new Error('紹介コードを入れてください');
    if (!this.findByCode(code)) throw new Error('その紹介コードは見つかりません');
  }

  globalView() {
    return {
      enforcement: this.data.enforcement,
      effective: this.enforcement(),
      multiplier: this.data.multiplier === 2 ? 2 : 1.5,
      premiumFeatures: [...this.data.premiumFeatures],
      plans: PLANS.map((p) => ({ ...p })),
    };
  }

  adminView(id, now = Date.now()) {
    const entry = this.account(id) ?? {};
    const status = computeStatus(this.account(id), now);
    const plan = planOf(entry.plan);
    return {
      plan: canonicalPlan(entry.plan),
      planLabel: plan?.label ?? '',
      free: entry.free === true,
      paidUntil: typeof entry.paidUntil === 'string' ? entry.paidUntil : '',
      trialEndsAt: typeof entry.trialEndsAt === 'string' ? entry.trialEndsAt : '',
      note: typeof entry.note === 'string' ? entry.note : '',
      monthlyPrice: entry.monthlyPrice ?? null,
      price: monthlyPriceYen(entry),
      credit: Math.max(0, Math.round(Number(entry.credit) || 0)),
      code: entry.code ?? '',
      referredBy: entry.referredBy ?? null,
      status,
      storedStatus: canonicalStatus(entry.status),
      statusLabel: STATUS_LABEL[status] ?? '',
      graceUntil: this.account(id) ? graceUntilDay(entry, now) : '',
      trialNotice: trialNotice(this.account(id), now),
      history: Array.isArray(entry.history) ? entry.history.slice(-50) : [],
      discount: monthDiscount(entry),
    };
  }

  /** 配信者のダッシュボード向け。show が偽のときはカードを出さない（記録が無く、伝えることも無い人） */
  clientView(id, now = Date.now()) {
    return safely('表示の判定', () => {
      const entry = this.account(id);
      const enforcement = this.enforcement();
      const status = computeStatus(entry, now);
      const plan = planOf(entry?.plan);
      const notice = trialNotice(entry, now);
      const suspended = status === 'suspended';
      return {
        show: enforcement || entry != null || suspended || notice,
        enforcement,
        status,
        statusLabel: STATUS_LABEL[status] ?? '',
        plan: canonicalPlan(entry?.plan),
        planLabel: plan?.label ?? '',
        paidUntil: typeof entry?.paidUntil === 'string' ? entry.paidUntil : '',
        trialEndsAt: typeof entry?.trialEndsAt === 'string' ? entry.trialEndsAt : '',
        note: typeof entry?.note === 'string' ? entry.note : '',
        trialNotice: notice,
        suspended,
        monthlyPrice: monthlyPriceYen(entry),
        credit: Math.max(0, Math.round(Number(entry?.credit) || 0)),
        code: entry?.code ?? '',
        overlay: !(enforcement && this.corrupt) && !blocksOverlay(entry, { now, enforcement }),
      };
    }, {
      show: false,
      enforcement: false,
      status: 'trial',
      statusLabel: STATUS_LABEL.trial,
      plan: null,
      planLabel: '',
      paidUntil: '',
      trialEndsAt: '',
      note: '',
      trialNotice: false,
      suspended: false,
      monthlyPrice: 0,
      credit: 0,
      code: '',
      overlay: true,
    });
  }

  /** スイッチがオンで、ファイルが壊れているときは中身が読めないので止める。配信中は切らない */
  #stoppedByFile(live = false) {
    if (!this.corrupt || !this.enforcement()) return false;
    return live !== true;
  }

  isOverlayBlocked(id, now = Date.now()) {
    return safely('配信画面の判定', () => {
      if (this.#stoppedByFile()) return true;
      return blocksOverlay(this.account(id), { now, enforcement: this.enforcement() });
    }, false);
  }

  allowsConnection(id, { live = false, now = Date.now() } = {}) {
    return safely('配信接続の判定', () => {
      if (live) return allowsNewConnection(this.account(id), { live: true, now, enforcement: this.enforcement() });
      if (this.#stoppedByFile(false)) return false;
      return allowsNewConnection(this.account(id), { live: false, now, enforcement: this.enforcement() });
    }, true);
  }

  isFeatureAllowed(id, feature, now = Date.now()) {
    return safely('機能の判定', () => {
      if (this.#stoppedByFile()) return false;
      return allowsFeature(this.account(id), feature, {
        enforcement: this.enforcement(),
        premiumFeatures: this.data.premiumFeatures,
        now,
      });
    }, true);
  }

  widgetBlocked(id, feature, now = Date.now()) {
    return safely('ウィジェットの判定', () => {
      if (this.#stoppedByFile()) return true;
      return widgetPageBlocked({
        entry: this.account(id),
        feature,
        enforcement: this.enforcement(),
        premiumFeatures: this.data.premiumFeatures,
        now,
      });
    }, false);
  }

  setGlobal(patch = {}) {
    if ('enforcement' in patch) {
      if (patch.enforcement === true || patch.enforcement === 'on') this.data.enforcement = true;
      else if (patch.enforcement === false || patch.enforcement === 'off') this.data.enforcement = false;
      else this.data.enforcement = null;
    }
    if ('multiplier' in patch) {
      const n = Number(patch.multiplier);
      if (n !== 1.5 && n !== 2) throw new Error('紹介の倍率は 1.5 か 2 です');
      this.data.multiplier = n;
    }
    if ('premiumFeatures' in patch) {
      if (!Array.isArray(patch.premiumFeatures)) throw new Error('機能の一覧で送ってください');
      const next = [];
      const seen = new Set();
      for (const item of patch.premiumFeatures) {
        const name = String(item ?? '').trim();
        if (!name || seen.has(name) || name.length > 40) continue;
        seen.add(name);
        next.push(name);
        if (next.length >= 40) break;
      }
      this.data.premiumFeatures = next;
    }
    this.save();
    return this.globalView();
  }

  setAccount(id, patch = {}) {
    const cur = { ...(this.data.accounts[id] ?? {}) };
    const before = {};
    for (const key of HISTORY_FIELDS) before[key] = cur[key] ?? null;
    const prevStatus = canonicalStatus(cur.status);
    if ('plan' in patch) {
      if (patch.plan == null || patch.plan === '') delete cur.plan;
      else {
        const plan = canonicalPlan(patch.plan);
        if (!plan) throw new Error('プランは 5%プラン、2000円プラン、5000円プラン のどれかです');
        cur.plan = plan;
      }
    }
    if ('status' in patch) {
      if (patch.status == null || patch.status === '') delete cur.status;
      else {
        const status = canonicalStatus(patch.status);
        if (!status) throw new Error('状態は お試し、支払い済み、支払い待ち、停止 のどれかです');
        cur.status = status;
        cur.statusAt = Date.now();
        if (status === 'past_due' && prevStatus !== 'past_due') cur.pastDueAt = Date.now();
        if (status !== 'past_due') delete cur.pastDueAt;
      }
    }
    if ('free' in patch) cur.free = Boolean(patch.free);
    if ('paidUntil' in patch) {
      if (patch.paidUntil == null || patch.paidUntil === '') delete cur.paidUntil;
      else {
        const day = normalizeDate(patch.paidUntil);
        if (!day) throw new Error('支払った日までは 2026-11-30 のような日付です');
        cur.paidUntil = day;
      }
    }
    if ('trialEndsAt' in patch) {
      if (patch.trialEndsAt == null || patch.trialEndsAt === '') delete cur.trialEndsAt;
      else {
        const day = normalizeDate(patch.trialEndsAt);
        if (!day) throw new Error('お試しの終わりは 2026-11-30 のような日付です');
        cur.trialEndsAt = day;
      }
    }
    if ('note' in patch) {
      if (patch.note == null || String(patch.note).trim() === '') delete cur.note;
      else cur.note = String(patch.note).trim().slice(0, 500);
    }
    if ('monthlyPrice' in patch) {
      if (patch.monthlyPrice == null || patch.monthlyPrice === '') delete cur.monthlyPrice;
      else {
        const n = Number(patch.monthlyPrice);
        if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new Error('月額は 0 以上の金額です');
        cur.monthlyPrice = Math.round(n);
      }
    }
    recordBillingChange(cur, before);
    this.data.accounts[id] = cur;
    this.save();
    return this.adminView(id);
  }

  ensureCode(id) {
    const cur = { ...(this.data.accounts[id] ?? {}) };
    if (cur.code) return cur.code;
    let code = '';
    do {
      code = makeCode();
    } while (this.findByCode(code));
    cur.code = code;
    this.data.accounts[id] = cur;
    this.save();
    return code;
  }

  applyCode(refereeId, raw) {
    const code = String(raw ?? '').trim();
    if (!code) throw new Error('紹介コードを入れてください');
    const referrerId = this.findByCode(code);
    if (!referrerId) throw new Error('その紹介コードは見つかりません');
    if (referrerId === refereeId) throw new Error('自分の紹介コードは使えません');
    const referee = { ...(this.data.accounts[refereeId] ?? {}) };
    if (referee.referredBy) throw new Error('紹介コードはすでに使っています');
    const referrer = { ...(this.data.accounts[referrerId] ?? {}) };
    const granted = grantReferral({
      referrer: { ...referrer, id: referrerId },
      referee: { ...referee, id: refereeId },
      multiplier: this.data.multiplier === 2 ? 2 : 1.5,
    });
    const { id: _referrerId, ...referrerNext } = granted.referrer;
    const { id: _refereeId, ...refereeNext } = granted.referee;
    refereeNext.usedCode = code;
    this.data.accounts[referrerId] = referrerNext;
    this.data.accounts[refereeId] = refereeNext;
    this.save();
    return { referrerId, referrerCredit: granted.referrerCredit, refereeCredit: granted.refereeCredit };
  }

  useMonth(id) {
    const cur = { ...(this.data.accounts[id] ?? {}) };
    const discount = monthDiscount(cur);
    if (discount.discount <= 0) throw new Error('引ける割引がありません');
    cur.credit = discount.creditAfter;
    this.data.accounts[id] = cur;
    this.save();
    return { ...discount, credit: cur.credit };
  }

  remove(id) {
    if (!this.data.accounts?.[id]) return;
    delete this.data.accounts[id];
    this.save();
  }
}
