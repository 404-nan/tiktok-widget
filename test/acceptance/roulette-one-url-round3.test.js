// roulette-one-url 3巡目(カード docs/cards/roulette-one-url.md の「3巡目」)の受け入れテスト。
// AC-8: 「くわしく」表示でルーレットのタブを開いても、ルーレットごとの ?ids= の URL が
//       「1つだけ出したいとき」として折りたたみの中に1組だけ出て、コピーできる。

import test from 'node:test';
import assert from 'node:assert/strict';
import { renderRouletteUrls } from '../../public/dashboard/roulette-urls.js';
import { FakeDocument } from '../helpers/fake-dom.js';

test('AC-8 「くわしく」の折りたたみ内にもルーレットごとの URL が出る', () => {
  const documentRef = new FakeDocument();
  const details = documentRef.createElement('details');
  details.className = 'more';
  const target = documentRef.createElement('div');
  target.className = 'settings';
  details.append(target);
  const fallback = documentRef.createElement('div');
  let copied = '';
  let flashed = false;
  renderRouletteUrls({
    documentRef,
    widget: { url: 'http://x/widgets/roulette.html' },
    roulettes: { one: { name: '一', items: ['a'] }, two: { name: '二', items: ['b'] } },
    target,
    fallback,
    locationOrigin: 'http://x',
    copyText: (value) => { copied = value; },
    flashCopied: () => { flashed = true; },
  });

  const inputs = target.querySelectorAll('input');
  assert.equal(details.querySelectorAll('.roulette-url').length, 2);
  assert.equal(inputs.length, 2);
  assert.ok(inputs[0].value.includes('ids=one'));
  assert.ok(inputs[1].value.includes('ids=two'));
  assert.equal(fallback.children.length, 0);
  target.querySelectorAll('button')[0].click();
  assert.equal(copied, inputs[0].value);
  assert.equal(flashed, true);
});
