// プランの定義 src/plans.json と、その読み込み・検査・判定（src/plans.js）を確かめる。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  PLANS_FILE,
  PlansError,
  getEditCapabilities,
  getPlan,
  getPremiumFeatureKeys,
  loadPlans,
  normalizePlanId,
  planAllowsCapability,
  planAllowsFeature,
  requiredPlanFor,
  selectablePlans,
  storedPlanId,
  toPublicCatalog,
} from '../src/plans.js';
import { EDIT_CAPABILITIES, FEATURE_ORDER, FEATURES, PREMIUM_KEYS } from '../src/runtime-features.js';
import { BillingStore, monthlyPriceYen } from '../src/billing.js';
import { setActiveErrorLog } from '../src/error-log.js';

const EDIT_KEYS = ['edit.media', 'edit.cutinImage', 'edit.layout', 'edit.advanced', 'edit.ai'];
const shipped = () => JSON.parse(fs.readFileSync(PLANS_FILE, 'utf8'));
const tmpDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'tw-plans-'));
const writeTmp = (data) => {
  const file = path.join(tmpDir(), 'plans.json');
  fs.writeFileSync(file, typeof data === 'string' ? data : JSON.stringify(data));
  return file;
};

/** recordError の行き先を差し替えて、記録された中身を集める */
function captureErrors() {
  const rows = [];
  setActiveErrorLog({ record: (error, options) => { rows.push({ error, ...options }); return options; } });
  return { rows, restore: () => setActiveErrorLog(null) };
}

test('同梱の plans.json は 無料・Plus・Pro と、お試し・猶予・支払いの案内を持つ', () => {
  const c = toPublicCatalog();
  assert.deepEqual(c.plans.map((p) => p.id), ['free', 'plus', 'pro']);
  assert.deepEqual(c.plans.map((p) => p.priceYen), [0, 2980, 4980]);
  assert.deepEqual(c.plans.map((p) => p.draft), [false, true, true]);
  assert.equal(c.trialDays, 14);
  assert.equal(c.trialNoticeDays, 3);
  assert.equal(c.graceDays, 7);
  assert.equal(typeof c.paymentNote, 'string');
  assert.ok(c.paymentNote.length > 0);
  assert.equal(c.defaultPlan, 'free');
  // 画面に出す形には、環境変数の名前を入れない
  assert.equal(JSON.stringify(c).includes('priceEnv'), false);
});

test('プランで分ける機能と編集の操作は、runtime-features.js の定義と同じ', () => {
  assert.deepEqual(PREMIUM_KEYS, getPremiumFeatureKeys());
  for (const key of getPremiumFeatureKeys()) assert.ok(FEATURE_ORDER.includes(key), `${key} は機能の一覧にある`);
  for (const key of FEATURE_ORDER) assert.equal(FEATURES[key].premium, getPremiumFeatureKeys().includes(key), key);
  assert.deepEqual(getEditCapabilities().map((c) => c.key), EDIT_KEYS);
  assert.deepEqual(Object.keys(EDIT_CAPABILITIES), EDIT_KEYS);
  assert.equal(EDIT_CAPABILITIES['edit.ai'].feature, 'ai');
});

test('無料は基本だけ、Plus は豪華演出まで、Pro は編集の操作まで使える', () => {
  assert.equal(planAllowsFeature('free', 'alerts'), true);
  assert.equal(planAllowsFeature('free', 'cutins'), false);
  for (const key of ['cutins', 'imageCutins', 'rush', 'stepup', 'swarm', 'winsFx', 'combo']) {
    assert.equal(planAllowsFeature('plus', key), true, key);
    assert.equal(planAllowsFeature('pro', key), true, key);
  }
  assert.equal(planAllowsFeature('plus', 'ai'), false);
  assert.equal(planAllowsFeature('pro', 'ai'), true);
  for (const key of EDIT_KEYS) {
    assert.equal(planAllowsCapability('free', key), false, key);
    assert.equal(planAllowsCapability('plus', key), false, key);
    assert.equal(planAllowsCapability('pro', key), true, key);
  }
  // 知らないプランは豪華演出も編集も開かない。知らない操作はどのプランでもできない
  assert.equal(planAllowsFeature('gold', 'cutins'), false);
  assert.equal(planAllowsCapability('pro', 'edit.nope'), false);
  assert.equal(requiredPlanFor('alerts'), 'free');
  assert.equal(requiredPlanFor('cutins'), 'plus');
  assert.equal(requiredPlanFor('ai'), 'pro');
  for (const key of EDIT_KEYS) assert.equal(requiredPlanFor(key), 'pro', key);
});

test('昔のプラン名は新しいプランに置き換えて判定し、保存する名前と値段は昔のまま', () => {
  assert.equal(normalizePlanId('flat5000'), 'pro');
  assert.equal(normalizePlanId('yen5000'), 'pro');
  assert.equal(normalizePlanId('flat2000'), 'plus');
  assert.equal(normalizePlanId('yen2000'), 'plus');
  assert.equal(normalizePlanId('pct5'), 'plus');
  assert.equal(normalizePlanId('percent5'), 'plus');
  assert.equal(normalizePlanId(' pro '), 'pro');
  assert.equal(normalizePlanId('gold'), null);
  assert.equal(normalizePlanId(''), null);
  assert.equal(normalizePlanId(null), null);
  assert.equal(storedPlanId('yen5000'), 'flat5000');
  assert.equal(storedPlanId('percent5'), 'pct5');
  assert.equal(storedPlanId('plus'), 'plus');
  assert.equal(getPlan('flat5000').id, 'pro');
  assert.equal(planAllowsCapability('flat5000', 'edit.media'), true);
  assert.equal(planAllowsCapability('pct5', 'edit.media'), false);
  // 紹介の割引や月額は、昔の値段のまま（置き換えでお金の計算を変えない）
  assert.equal(monthlyPriceYen({ plan: 'flat5000' }), 5000);
  assert.equal(monthlyPriceYen({ plan: 'flat2000' }), 2000);
  assert.equal(monthlyPriceYen({ plan: 'pct5' }), 0);
  assert.deepEqual(selectablePlans().map((p) => p.id), ['free', 'plus', 'pro', 'pct5', 'flat2000', 'flat5000']);
});

test('壊れた plans.json は読み込まず、原因と場所を plans.load で記録し、前の定義を残す', () => {
  const file = writeTmp('{ "plans": [ ');
  const errors = captureErrors();
  try {
    assert.throws(() => loadPlans(file), (err) => err instanceof PlansError && err.file === file && /plans\.json/.test(err.message));
    assert.equal(errors.rows.length, 1);
    assert.equal(errors.rows[0].kind, 'plans.load');
    assert.equal(errors.rows[0].level, 'error');
    assert.equal(errors.rows[0].context.file, file);
    // 前に読めた定義のまま判定できる
    assert.equal(getPlan('pro').priceYen, 4980);
  } finally {
    errors.restore();
    loadPlans();
  }
});

test('定義がおかしい plans.json は、どの欄かを書いて読み込まない', () => {
  const cases = [
    [(d) => { d.plans[1].features.push('nope'); }, /plans\[1\]\.features の nope/],
    [(d) => { d.plans[2].capabilities.push('edit.nope'); }, /plans\[2\]\.capabilities の edit\.nope/],
    [(d) => { d.defaultPlan = 'gold'; }, /defaultPlan gold/],
    [(d) => { d.plans[1].id = 'free'; }, /id が重なっています/],
    [(d) => { d.plans[0].priceYen = -1; }, /plans\[0\]\.priceYen/],
    [(d) => { d.trialDays = '14'; }, /trialDays/],
    [(d) => { d.legacyPlans[0].plan = 'gold'; }, /legacyPlans\[0\]\.plan gold/],
    [(d) => { d.legacyPlans[0].aliases.push('pro'); }, /名前 pro がほかのプランと重なっています/],
    [(d) => { d.editCapabilities[0].key = 'media'; }, /editCapabilities\[0\]\.key/],
  ];
  const errors = captureErrors();
  try {
    for (const [breakIt, message] of cases) {
      const data = shipped();
      breakIt(data);
      assert.throws(() => loadPlans(writeTmp(data)), message);
    }
    assert.equal(errors.rows.length, cases.length);
    assert.ok(errors.rows.every((row) => row.kind === 'plans.load' && row.level === 'error' && row.context.file));
  } finally {
    errors.restore();
    loadPlans();
  }
});

test('仮の値段は環境変数で差し替えられ、プランの表示・月額・管理画面の選択肢の全部に出る', () => {
  try {
    loadPlans(PLANS_FILE, { env: { TW_DRAFT_PLUS_YEN: '2480', TW_DRAFT_PRO_YEN: '3980' } });
    assert.equal(getPlan('plus').priceYen, 2480);
    assert.equal(getPlan('pro').priceYen, 3980);
    assert.equal(toPublicCatalog().plans.find((p) => p.id === 'pro').priceYen, 3980);
    assert.equal(monthlyPriceYen({ plan: 'pro' }), 3980);
    const store = new BillingStore({ dir: tmpDir(), env: {} });
    assert.equal(store.globalView().plans.find((p) => p.id === 'pro').price, 3980);
    // 昔のプランの値段は変わらない
    assert.equal(monthlyPriceYen({ plan: 'flat5000' }), 5000);
  } finally {
    loadPlans();
  }
  assert.equal(getPlan('pro').priceYen, 4980);
});

test('おかしな値段の環境変数は使わず、plans.json の値段のままにして記録する', () => {
  const errors = captureErrors();
  try {
    loadPlans(PLANS_FILE, { env: { TW_DRAFT_PRO_YEN: '安い' } });
    assert.equal(getPlan('pro').priceYen, 4980);
    assert.equal(errors.rows.length, 1);
    assert.equal(errors.rows[0].kind, 'plans.load');
    assert.equal(errors.rows[0].level, 'warn');
    assert.equal(errors.rows[0].context.env, 'TW_DRAFT_PRO_YEN');
  } finally {
    errors.restore();
    loadPlans();
  }
});
