// 配信者ごとのプランと支払い。決済サービスは使わず、支払った日までを手で入れる。
// 記録が無い配信者は無料提供（配信画面は止めない）。強制は TW_BILLING=on か、管理画面でオンにしたときだけ。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const PLANS = [
  { id: 'percent5', label: '5%プラン', price: null },
  { id: 'yen2000', label: '2000円プラン', price: 2000 },
  { id: 'yen5000', label: '5000円プラン', price: 5000 },
];
const PLAN_IDS = new Set(PLANS.map((p) => p.id));
export const STATUS_LABEL = { active: '支払い済み', free: '無料提供', unpaid: '未払い' };

// 5000円プランだけにできる機能。管理画面の名前と、短い別名の両方を受ける
const FLAG_GROUPS = [
  ['bosses', 'boss'],
  ['gacha'],
  ['mediaAlerts', 'media'],
  ['rouletteLinks'],
  ['roulettes'],
];
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';

const planOf = (id) => PLANS.find((p) => p.id === id) ?? null;

/** 環境変数と管理画面のどちらで、未払いの配信画面を止めるか */
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
 * active: 支払った日までが来ていない。free: 無料提供。unpaid: それ以外でプランがある。
 * 記録が無い、プランも日付も無いときは free（今までの配信を止めない）
 */
export function computeStatus(entry, now = Date.now()) {
  if (!entry || typeof entry !== 'object') return 'free';
  if (entry.free === true) return 'free';
  const until = paidUntilEnd(entry.paidUntil);
  if (until == null) return entry.plan ? 'unpaid' : 'free';
  return until >= now ? 'active' : 'unpaid';
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

export function blocksOverlay(entry, { enforcement = false, now = Date.now() } = {}) {
  return Boolean(enforcement) && computeStatus(entry, now) === 'unpaid';
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
 * 5000円プランだけの機能か。強制がオフ、または記録が無い（無料扱い）なら今までどおり使える。
 * 未払いのときは、どの機能も配信画面に出さない
 */
export function allowsFeature(entry, feature, { enforcement = false, premiumFeatures = [], now = Date.now() } = {}) {
  if (!enforcement) return true;
  if (computeStatus(entry, now) === 'unpaid') return false;
  if (!isPremiumOnly(feature, premiumFeatures)) return true;
  if (!entry?.plan) return true;
  return entry.plan === 'yen5000';
}

/** ウィジェットの HTML を空白にするか。feature が無いページ（全部まとめて）は未払いのときだけ */
export function widgetPageBlocked({ entry = null, feature = null, enforcement = false, premiumFeatures = [], now = Date.now() } = {}) {
  if (!enforcement) return false;
  if (blocksOverlay(entry, { enforcement, now })) return true;
  if (feature && !allowsFeature(entry, feature, { enforcement, premiumFeatures, now })) return true;
  return false;
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
    this.load();
  }

  load() {
    try {
      const d = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.data = {
        enforcement: d.enforcement === true ? true : d.enforcement === false ? false : null,
        multiplier: d.multiplier === 2 ? 2 : 1.5,
        premiumFeatures: Array.isArray(d.premiumFeatures) ? d.premiumFeatures.map((name) => String(name)).filter(Boolean) : [],
        accounts: d.accounts && typeof d.accounts === 'object' && !Array.isArray(d.accounts) ? d.accounts : {},
      };
    } catch {
      // ファイルが無い・壊れているときは無料提供のまま。壊れたファイルは読み込みでは上書きしない
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
      plan: entry.plan ?? null,
      planLabel: plan?.label ?? '',
      free: entry.free === true,
      paidUntil: typeof entry.paidUntil === 'string' ? entry.paidUntil : '',
      monthlyPrice: entry.monthlyPrice ?? null,
      price: monthlyPriceYen(entry),
      credit: Math.max(0, Math.round(Number(entry.credit) || 0)),
      code: entry.code ?? '',
      referredBy: entry.referredBy ?? null,
      status,
      statusLabel: STATUS_LABEL[status],
      discount: monthDiscount(entry),
    };
  }

  /** 配信者のダッシュボード向け。show が偽のときはカードを出さない（本番で記録が無い人） */
  clientView(id, now = Date.now()) {
    const entry = this.account(id);
    const enforcement = this.enforcement();
    const status = computeStatus(entry, now);
    const plan = planOf(entry?.plan);
    return {
      show: enforcement || entry != null,
      enforcement,
      status,
      statusLabel: STATUS_LABEL[status],
      plan: entry?.plan ?? null,
      planLabel: plan?.label ?? '',
      paidUntil: typeof entry?.paidUntil === 'string' ? entry.paidUntil : '',
      monthlyPrice: monthlyPriceYen(entry),
      credit: Math.max(0, Math.round(Number(entry?.credit) || 0)),
      code: entry?.code ?? '',
      overlay: !blocksOverlay(entry, { enforcement, now }),
    };
  }

  isOverlayBlocked(id, now = Date.now()) {
    return blocksOverlay(this.account(id), { enforcement: this.enforcement(), now });
  }

  isFeatureAllowed(id, feature, now = Date.now()) {
    return allowsFeature(this.account(id), feature, {
      enforcement: this.enforcement(),
      premiumFeatures: this.data.premiumFeatures,
      now,
    });
  }

  widgetBlocked(id, feature, now = Date.now()) {
    return widgetPageBlocked({
      entry: this.account(id),
      feature,
      enforcement: this.enforcement(),
      premiumFeatures: this.data.premiumFeatures,
      now,
    });
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
    if ('plan' in patch) {
      if (patch.plan == null || patch.plan === '') delete cur.plan;
      else if (!PLAN_IDS.has(patch.plan)) throw new Error('プランは 5%プラン、2000円プラン、5000円プラン のどれかです');
      else cur.plan = patch.plan;
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
    if ('monthlyPrice' in patch) {
      if (patch.monthlyPrice == null || patch.monthlyPrice === '') delete cur.monthlyPrice;
      else {
        const n = Number(patch.monthlyPrice);
        if (!Number.isFinite(n) || n < 0 || n > 10_000_000) throw new Error('月額は 0 以上の金額です');
        cur.monthlyPrice = Math.round(n);
      }
    }
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
