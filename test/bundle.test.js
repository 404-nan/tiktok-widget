// リンクまとめ：設定の検証（bundleList）と、一覧（widgetList）への URL の追加を見る
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

import { normalize, widgetList } from '../src/config.js';

test('まとめはそのまま通る（重複したウィジェットは落とす）', () => {
  const { config, errors } = normalize({ bundles: { list: [{ id: 'main', name: 'いつもの', widgets: ['alerts', 'omikuji', 'alerts'] }] } });
  assert.deepEqual(config.bundles.list, [{ id: 'main', name: 'いつもの', widgets: ['alerts', 'omikuji'] }]);
  assert.deepEqual(errors, []);
});

test('まとめに入れられないウィジェットはエラーで落とす', () => {
  const { config, errors } = normalize({ bundles: { list: [{ id: 'a', name: 'x', widgets: ['alerts', 'theme'] }] } });
  assert.deepEqual(config.bundles.list[0].widgets, ['alerts']);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /入れられない/);
});

test('id が形に合わないまとめと、重なった id は落とす', () => {
  const { config, errors } = normalize({
    bundles: {
      list: [
        { id: 'BAD!', name: 'x', widgets: [] },
        { id: 'ok', name: '最初', widgets: [] },
        { id: 'ok', name: '二つ目', widgets: [] },
      ],
    },
  });
  assert.deepEqual(config.bundles.list.map((b) => b.id), ['ok']);
  assert.equal(config.bundles.list[0].name, '最初');
  assert.equal(errors.length, 2);
});

test('名前が空なら「まとめ」になり、まとめは10個まで', () => {
  const many = Array.from({ length: 12 }, (_, i) => ({ id: `b${i}`, name: '', widgets: [] }));
  const { config, errors } = normalize({ bundles: { list: many } });
  assert.equal(config.bundles.list.length, 10);
  assert.equal(config.bundles.list[0].name, 'まとめ');
  assert.ok(errors.some((e) => e.includes('10個まで')));
});

test('widgetList にまとめの URL が付く', () => {
  const { config } = normalize({ bundles: { list: [{ id: 'main', name: 'いつもの', widgets: ['alerts'] }] } });
  const list = widgetList(config, 'http://x');
  const entry = list.find((w) => w.section === 'bundles');
  assert.deepEqual(entry, { section: 'bundles', id: 'main', title: 'リンクまとめ: いつもの', url: 'http://x/widgets/bundle.html?b=main', size: [1920, 1080] });
});

test('まとめページは、まとめの選択だけを出す形になっている', () => {
  const html = fs.readFileSync(new URL('../public/widgets/bundle.html', import.meta.url), 'utf8');
  assert.match(html, /config\.bundles\?\.list/);
  assert.match(html, /bundle\.widgets/);
  // 単体ウィジェットの表（おみくじ・ガチャ・カードめくり）を持つ
  for (const key of ['omikuji', 'gacha', 'cardDraw']) assert.ok(html.includes(`'${key}'`) || html.includes(`${key}:`), key);
});
