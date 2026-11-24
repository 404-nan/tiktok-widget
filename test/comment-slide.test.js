// コメントスライドの決まりごとと、カタログへの登録を確かめる。
// - きっかけの言葉を含む判定（含む・上から最初の1つだけ）
// - 待ち行列（最大3つ・あふれた分は捨てる・1つずつ順に出す）
// - commentSlide が部品として登録され、部品一覧に出る
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { slideCombos, slideMatch, createSlideQueue, MAX_QUEUE } from '../public/widgets/lib/comment-slide.js';
import { normalize, widgetList } from '../src/config.js';
import { SCHEMA, SECTIONS } from '../src/schema.js';
import { FEATURES, featureOfPage } from '../src/runtime-features.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));

test('コメントスライド: 固定枠から、きっかけと言葉がそろった組み合わせだけを使う', () => {
  const combos = slideCombos({
    trigger1: 'おはよう', text1: 'おはようございます',
    trigger2: '  ', text2: '空のきっかけは使わない',
    trigger3: 'ありがとう', text3: '', // 言葉が空も使わない
    trigger4: '8888', text4: 'パチパチ〜',
  });
  assert.deepEqual(combos, [
    { trigger: 'おはよう', text: 'おはようございます' },
    { trigger: '8888', text: 'パチパチ〜' },
  ]);
  // 前後の空白は落とす
  assert.deepEqual(slideCombos({ trigger1: ' こんばんは ', text1: ' こんばんは！ ' }), [{ trigger: 'こんばんは', text: 'こんばんは！' }]);
});

test('コメントスライド: 含む判定で、上から最初に一致した1つだけを出す', () => {
  const combos = [
    { trigger: 'ありがとう', text: 'こちらこそ！' },
    { trigger: 'ありがとうございます', text: '重い方にはこちら' },
  ];
  // 両方を含んでも、上にある方だけ
  assert.deepEqual(slideMatch('いつもありがとうございます', combos), { trigger: 'ありがとう', text: 'こちらこそ！' });
  assert.equal(slideMatch('こんばんは', combos), null);
  assert.equal(slideMatch('', combos), null);
  assert.equal(slideMatch('ありがとう', []), null);
});

test('コメントスライド: 待ち行列は1つずつ順に出し、上限を超えた分は捨てる', async () => {
  const started = [];
  const gates = [];
  const run = (item) => new Promise((resolve) => { started.push(item); gates.push(resolve); });
  const q = createSlideQueue(run, MAX_QUEUE);
  assert.equal(MAX_QUEUE, 3);

  assert.equal(q.push('a'), true);
  assert.deepEqual(started, ['a'], 'すぐ1つ目を出し始める');
  assert.equal(q.push('b'), true);
  assert.equal(q.push('c'), true);
  assert.equal(q.push('d'), true);
  assert.equal(q.push('e'), false, '待ちが3つなので、あふれた分は捨てる');
  assert.equal(q.size, 4, '出している1つ + 待ち3つ');

  // 1つ目を終わらせると、待ちの先頭が出る
  gates[0]();
  await tick();
  assert.deepEqual(started, ['a', 'b']);

  // clear すると残りの待ちは出ない（出ている1つはそのまま）
  q.clear();
  assert.equal(q.size, 1);
  gates[1]();
  await tick();
  assert.deepEqual(started, ['a', 'b']);
});

test('コメントスライド: 設定の初期値と範囲', () => {
  const ok = normalize({ commentSlide: { default: {} } });
  assert.deepEqual(ok.errors, []);
  const c = ok.config.commentSlide.default;
  assert.equal(c.seconds, 4);
  assert.equal(c.color, 'accent');
  assert.equal(c.trigger1, '');
  assert.equal(c.text5, '');
  const bad = normalize({ commentSlide: { a: { seconds: 0 } } });
  assert.ok(bad.errors.some((e) => e.includes('commentSlide.a.seconds')));
});

test('カタログに commentSlide が登録され、部品一覧に出る', () => {
  assert.ok(SECTIONS.includes('commentSlide'), 'SECTIONS に commentSlide がない');
  assert.equal(SCHEMA.commentSlide.page, 'comment-slide');
  const row = widgetList({ commentSlide: { default: {} } }, 'http://x').find((w) => w.section === 'commentSlide');
  assert.deepEqual(row, {
    section: 'commentSlide', id: 'default', title: 'コメントスライド: default',
    url: 'http://x/widgets/comment-slide.html', size: [640, 120],
  });
  assert.equal(FEATURES.commentSlide.pages.includes('comment-slide.html'), true);
  assert.equal(featureOfPage('comment-slide.html'), 'commentSlide');
  assert.notEqual(FEATURES.commentSlide.premium, true);
});
