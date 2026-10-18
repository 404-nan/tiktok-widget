// roulette-one-url 2巡目(カード docs/cards/roulette-one-url.md の「2巡目」)の受け入れテスト。
// AC-7: タブの開き直し・戻る・フォーム再作成をどの順で行っても、ルーレットごとの ?ids= の URL は
//       毎回「ほかの項目」の折りたたみの中に1組だけ出て、折りたたみの外に出たり消えたりしない。

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRouletteUrls } from '../../public/dashboard/roulette-urls.js';
import { FakeDocument } from '../helpers/fake-dom.js';

test('AC-7 フォームを作り直しても URL の箱は新しい「ほかの項目」の中に1組だけ残る', () => {
  const documentRef = new FakeDocument();
  const form = documentRef.createElement('form');
  const firstTarget = documentRef.createElement('div');
  firstTarget.className = 'settings';
  form.append(firstTarget);
  const options = {
    documentRef,
    widget: { url: 'http://x/widgets/roulette.html' },
    roulettes: { one: { name: '一', items: ['a', 'b'] } },
    locationOrigin: 'http://x',
  };
  const box = renderRouletteUrls({ ...options, target: firstTarget });
  assert.equal(firstTarget.querySelectorAll('.roulette-url').length, 1);

  const secondDetails = documentRef.createElement('details');
  secondDetails.className = 'more others';
  const secondTarget = documentRef.createElement('div');
  secondTarget.className = 'settings';
  secondDetails.append(secondTarget);
  form.replaceChildren(secondDetails);
  renderRouletteUrls({ ...options, existingBox: box, target: secondTarget });

  assert.equal(firstTarget.children.length, 0);
  assert.equal(secondTarget.querySelector('#rouletteUrls'), box);
  assert.equal(secondTarget.querySelectorAll('.roulette-url').length, 1);
  assert.equal(secondTarget.querySelectorAll('input').length, 1);
});

test('AC-7 専用の置き場所が無いときは本線 URL の下に残る', () => {
  const documentRef = new FakeDocument();
  const fallback = documentRef.createElement('div');
  const box = renderRouletteUrls({
    documentRef,
    widget: { url: 'http://x/widgets/roulette.html' },
    roulettes: { one: { name: '一', items: ['a'] } },
    fallback,
    locationOrigin: 'http://x',
  });
  assert.equal(fallback.querySelector('#rouletteUrls'), box);
  assert.equal(fallback.children.length, 1);
});
