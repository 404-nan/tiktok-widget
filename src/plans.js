// プラン（無料・Plus・Pro）の定義 src/plans.json を読み、検査し、「このプランで何が使えるか」に答える。
// 値段・名前・使える機能はここだけで決める。billing.js・tenants.js・runtime-features.js・runtime-routes.js はここを見る。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { recordError } from './error-log.js';

export const PLANS_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'plans.json');

const PLAN_ID = /^[a-z][a-z0-9]*$/;
const CAPABILITY_KEY = /^edit\.[A-Za-z]+$/;

/** plans.json の中身がおかしいときの例外。file と、どの欄かを message に入れる */
export class PlansError extends Error {
  constructor(message, { file, cause } = {}) {
    super(`${file ? `${path.basename(file)}: ` : ''}${message}`, cause ? { cause } : undefined);
    this.name = 'PlansError';
    this.file = file ?? null;
  }
}

let active = null;

// --- 検査 ---

const isText = (value) => typeof value === 'string' && value.trim() !== '';
const isDays = (value) => Number.isInteger(value) && value >= 0;
const isYen = (value) => Number.isInteger(value) && value >= 0;
// 案内のリンクは http(s) だけ（javascript: などを画面のリンクにしない）
const isContactUrl = (value) => {
  try { return ['https:', 'http:'].includes(new URL(value).protocol); } catch { return false; }
};

function textList(value, where) {
  if (!Array.isArray(value)) throw new Error(`${where} は一覧にしてください`);
  const seen = new Set();
  for (const item of value) {
    if (!isText(item)) throw new Error(`${where} に空の名前があります`);
    if (seen.has(item)) throw new Error(`${where} に ${item} が2回あります`);
    seen.add(item);
  }
  return [...value];
}

function checkCapabilities(raw, premiumFeatures) {
  if (!Array.isArray(raw)) throw new Error('editCapabilities は一覧にしてください');
  const seen = new Set();
  return raw.map((item, index) => {
    const where = `editCapabilities[${index}]`;
    if (!CAPABILITY_KEY.test(String(item?.key ?? ''))) throw new Error(`${where}.key は edit.名前 の形にしてください`);
    if (seen.has(item.key)) throw new Error(`${where}.key ${item.key} が2回あります`);
    if (!isText(item.label)) throw new Error(`${where}.label がありません`);
    if (item.feature != null && !premiumFeatures.includes(item.feature)) throw new Error(`${where}.feature ${item.feature} は premiumFeatures にありません`);
    seen.add(item.key);
    return { key: item.key, label: item.label, ...(item.feature ? { feature: item.feature } : {}) };
  });
}

function checkPlan(item, index, { premiumFeatures, capabilityKeys }) {
  const where = `plans[${index}]`;
  if (!PLAN_ID.test(String(item?.id ?? ''))) throw new Error(`${where}.id は英小文字と数字にしてください`);
  if (!isText(item.label)) throw new Error(`${where}.label がありません`);
  if (!isYen(item.priceYen)) throw new Error(`${where}.priceYen は 0 以上の整数（円）にしてください`);
  if (typeof item.draft !== 'boolean') throw new Error(`${where}.draft は true か false にしてください`);
  if (item.priceEnv != null && !isText(item.priceEnv)) throw new Error(`${where}.priceEnv は環境変数の名前にしてください`);
  const features = textList(item.features ?? [], `${where}.features`);
  const capabilities = textList(item.capabilities ?? [], `${where}.capabilities`);
  for (const key of features) if (!premiumFeatures.includes(key)) throw new Error(`${where}.features の ${key} は premiumFeatures にありません`);
  for (const key of capabilities) if (!capabilityKeys.includes(key)) throw new Error(`${where}.capabilities の ${key} は editCapabilities にありません`);
  return {
    id: item.id,
    label: item.label,
    description: typeof item.description === 'string' ? item.description : '',
    priceYen: item.priceYen,
    draft: item.draft,
    ...(item.priceEnv ? { priceEnv: item.priceEnv } : {}),
    features,
    capabilities,
  };
}

function checkLegacy(raw, planIds) {
  if (raw == null) return [];
  if (!Array.isArray(raw)) throw new Error('legacyPlans は一覧にしてください');
  const names = new Set(planIds);
  return raw.map((item, index) => {
    const where = `legacyPlans[${index}]`;
    if (!PLAN_ID.test(String(item?.id ?? ''))) throw new Error(`${where}.id は英小文字と数字にしてください`);
    if (!isText(item.label)) throw new Error(`${where}.label がありません`);
    if (item.priceYen !== null && !isYen(item.priceYen)) throw new Error(`${where}.priceYen は 0 以上の整数か null にしてください`);
    if (!planIds.includes(item.plan)) throw new Error(`${where}.plan ${item.plan} は plans にありません`);
    const aliases = textList(item.aliases ?? [], `${where}.aliases`);
    for (const name of [item.id, ...aliases]) {
      if (names.has(name)) throw new Error(`${where} の名前 ${name} がほかのプランと重なっています`);
      names.add(name);
    }
    return { id: item.id, label: item.label, priceYen: item.priceYen, plan: item.plan, aliases };
  });
}

/** 仮の値段（draft のプランだけ）を環境変数で差し替える。おかしな値は使わず、記録だけ残す */
function applyPriceEnv(plans, env, file) {
  return plans.map((plan) => {
    if (!plan.draft || !plan.priceEnv) return plan;
    const raw = env?.[plan.priceEnv];
    if (raw == null || String(raw).trim() === '') return plan;
    const yen = Number(String(raw).trim());
    if (Number.isInteger(yen) && yen > 0) return { ...plan, priceYen: yen };
    const err = new PlansError(`${plan.priceEnv} は正の整数（円）にしてください。${plan.priceYen}円のままにします`, { file });
    console.warn(`[plans] ${err.message}`);
    recordError(err, { kind: 'plans.load', level: 'warn', context: { file, env: plan.priceEnv } });
    return plan;
  });
}

/** 問い合わせ先のリンク。環境変数（contactEnv）があればそちら。おかしな値は使わず、記録だけ残す */
function contactUrlOf(data, env, file) {
  const fromEnv = data.contactEnv ? String(env?.[data.contactEnv] ?? '').trim() : '';
  if (fromEnv) {
    if (isContactUrl(fromEnv)) return fromEnv;
    const err = new PlansError(`${data.contactEnv} は http(s):// で始まる URL にしてください。plans.json の contactUrl を使います`, { file });
    console.warn(`[plans] ${err.message}`);
    recordError(err, { kind: 'plans.load', level: 'warn', context: { file, env: data.contactEnv } });
  }
  return data.contactUrl ?? '';
}

/** 読んだ JSON を検査して、使う形に直す。おかしいところがあれば Error を投げる */
export function validatePlans(data, { env = process.env, file = null } = {}) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('中身は { ... } の形にしてください');
  for (const key of ['trialDays', 'trialNoticeDays', 'graceDays']) {
    if (!isDays(data[key])) throw new Error(`${key} は 0 以上の整数（日）にしてください`);
  }
  if (typeof data.paymentNote !== 'string') throw new Error('paymentNote は文字にしてください');
  if (data.contactUrl != null && data.contactUrl !== '' && !isContactUrl(data.contactUrl)) throw new Error('contactUrl は http(s):// で始まる URL か空にしてください');
  if (data.contactEnv != null && !isText(data.contactEnv)) throw new Error('contactEnv は環境変数の名前にしてください');
  const premiumFeatures = textList(data.premiumFeatures, 'premiumFeatures');
  const editCapabilities = checkCapabilities(data.editCapabilities, premiumFeatures);
  const capabilityKeys = editCapabilities.map((c) => c.key);
  if (!Array.isArray(data.plans) || data.plans.length === 0) throw new Error('plans に1つ以上のプランを入れてください');
  const plans = data.plans.map((item, index) => checkPlan(item, index, { premiumFeatures, capabilityKeys }));
  const planIds = plans.map((p) => p.id);
  if (new Set(planIds).size !== planIds.length) throw new Error('plans の id が重なっています');
  if (!planIds.includes(data.defaultPlan)) throw new Error(`defaultPlan ${data.defaultPlan} は plans にありません`);
  const legacyPlans = checkLegacy(data.legacyPlans, planIds);
  return {
    version: Number(data.version) || 1,
    defaultPlan: data.defaultPlan,
    trialDays: data.trialDays,
    trialNoticeDays: data.trialNoticeDays,
    graceDays: data.graceDays,
    paymentNote: data.paymentNote,
    contactUrl: contactUrlOf(data, env, file),
    premiumFeatures,
    editCapabilities,
    plans: applyPriceEnv(plans, env, file),
    legacyPlans,
  };
}

// --- 読み込み ---

/**
 * plans.json を読み、検査して、これからの判定に使う。
 * 読めない・壊れている・定義がおかしいときは、原因と場所を記録して PlansError を投げる（それまでの定義は残す）。
 */
export function loadPlans(filePath = PLANS_FILE, { env = process.env } = {}) {
  const file = path.resolve(filePath);
  let catalog;
  try {
    catalog = validatePlans(JSON.parse(fs.readFileSync(file, 'utf8')), { env, file });
  } catch (cause) {
    const err = cause instanceof PlansError ? cause : new PlansError(cause?.message ?? String(cause), { file, cause });
    console.error(`[plans] プランの定義を読めませんでした: ${err.message}`);
    recordError(err, { kind: 'plans.load', level: 'error', context: { file } });
    throw err;
  }
  active = catalog;
  return catalog;
}

// 最初に使うときに src/plans.json を読む。コードと一緒に版を管理するファイルなので、壊れていたら起動を止める
function catalog() {
  return active ?? loadPlans();
}

// --- 名前 ---

const findPlan = (id) => catalog().plans.find((p) => p.id === id) ?? null;
const findLegacy = (name) => catalog().legacyPlans.find((p) => p.id === name || p.aliases.includes(name)) ?? null;

/**
 * 保存されている名前のまま、正式な綴りにそろえる。昔の名前（flat5000 など）は昔の名前のまま返す。
 * 支払いの記録は読み込みでは書き換えないので、保存する名前と判定に使う名前（normalizePlanId）を分けている。
 */
export function storedPlanId(raw) {
  const name = String(raw ?? '').trim();
  if (!name) return null;
  if (findPlan(name)) return name;
  return findLegacy(name)?.id ?? null;
}

/** どんな名前でも、判定に使うプランの id（free / plus / pro）にする。知らない名前は null */
export function normalizePlanId(raw) {
  const name = String(raw ?? '').trim();
  if (!name) return null;
  if (findPlan(name)) return name;
  return findLegacy(name)?.plan ?? null;
}

/** プランの定義（昔の名前は、置き換え先のプラン）。知らない名前は null */
export function getPlan(planId) {
  const plan = findPlan(normalizePlanId(planId));
  return plan ? structuredClone(plan) : null;
}

/**
 * 保存されている名前の表示名と月額。昔のプランは、そのとき決めた名前と値段のまま
 * （紹介の割引や月額の計算を、置き換えで変えないため）。
 */
export function describeStoredPlan(raw) {
  const id = storedPlanId(raw);
  if (!id) return null;
  const legacy = findLegacy(id);
  if (legacy) return { id, label: legacy.label, priceYen: legacy.priceYen, plan: legacy.plan, legacy: true };
  const plan = findPlan(id);
  return { id, label: plan.label, priceYen: plan.priceYen, plan: plan.id, legacy: false };
}

/** 管理画面で選べるプラン（今のプラン、そのあとに昔のプラン） */
export function selectablePlans() {
  const { plans, legacyPlans } = catalog();
  return [
    ...plans.map((p) => ({ id: p.id, label: p.label, price: p.priceYen, draft: p.draft })),
    ...legacyPlans.map((p) => ({ id: p.id, label: p.label, price: p.priceYen, legacy: true, plan: p.plan })),
  ];
}

export const listPlans = () => structuredClone(catalog().plans);
export const defaultPlanId = () => catalog().defaultPlan;
/** いちばん上のプラン（plans.json で最後に書いたもの） */
export const topPlanId = () => catalog().plans.at(-1).id;

// --- 使えるもの ---

/** プランを分けて開く機能（豪華な演出と AI）。ここに無い機能はどのプランでも使える */
export const getPremiumFeatureKeys = () => [...catalog().premiumFeatures];
/** 編集の操作の一覧 [{ key, label, feature? }]。feature は、同じ操作を手で開け閉めする機能の名前 */
export const getEditCapabilities = () => structuredClone(catalog().editCapabilities);
export const isEditCapability = (key) => catalog().editCapabilities.some((c) => c.key === key);

/** そのプランで機能を使えるか。プランで分けない機能はいつも true、知らないプランは豪華な演出を開かない */
export function planAllowsFeature(planId, featureKey) {
  if (!catalog().premiumFeatures.includes(featureKey)) return true;
  return findPlan(normalizePlanId(planId))?.features.includes(featureKey) ?? false;
}

/** そのプランで編集の操作ができるか。知らないプランや知らない操作は false */
export function planAllowsCapability(planId, capabilityKey) {
  return findPlan(normalizePlanId(planId))?.capabilities.includes(capabilityKey) ?? false;
}

/** その機能・操作が使えるいちばん安いプランの id（plans.json の並び順）。どのプランでも使えないときは null */
export function requiredPlanFor(key) {
  const allows = isEditCapability(key) ? (plan) => plan.capabilities.includes(key) : (plan) => planAllowsFeature(plan.id, key);
  return catalog().plans.find(allows)?.id ?? null;
}

/** 画面や案内に出してよい形（環境変数の名前などは出さない） */
export function toPublicCatalog() {
  const c = catalog();
  return {
    defaultPlan: c.defaultPlan,
    trialDays: c.trialDays,
    trialNoticeDays: c.trialNoticeDays,
    graceDays: c.graceDays,
    paymentNote: c.paymentNote,
    contactUrl: c.contactUrl,
    editCapabilities: structuredClone(c.editCapabilities),
    plans: c.plans.map(({ id, label, description, priceYen, draft, features, capabilities }) => ({ id, label, description, priceYen, draft, features: [...features], capabilities: [...capabilities] })),
  };
}

/** 支払い待ちの猶予と、お試しの日数 */
export function planTimings() {
  const { trialDays, trialNoticeDays, graceDays } = catalog();
  return { trialDays, trialNoticeDays, graceDays };
}

/** 支払いとプランの変更の案内（文と、あればリンク） */
export function planContact() {
  const { paymentNote, contactUrl } = catalog();
  return { note: paymentNote, url: contactUrl };
}
