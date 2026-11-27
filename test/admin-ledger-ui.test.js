// 集金画面のフォーム送信と更新をサーバーなしで確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';

const source = fs.readFileSync(new URL('../public/admin/admin-ledger.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/m, '').replace(/^export /gm, '');

function ui(globals) {
  return vm.createContext(globals);
}

test('元データが最新なら集金の集計に null の文字を表示しない', async () => {
  const context = ui({
    api: async () => ({ totals: {}, streamers: [], stale: false }),
    el: (tag, props, ...children) => ({ tag, ...props, children }),
  });
  vm.runInContext(source, context);
  let children;
  const content = { replaceChildren(...nodes) {
    children = nodes.map((node) => typeof node === 'object' && node !== null ? node : String(node));
  } };
  await context.fill({ querySelector: () => content });
  assert.equal(children[0].className, 'ledger-metrics');
  assert.ok(!children.includes('null'));
});

test('ブラウザーのタイムゾーンにかかわらず集金日時を日本時間として送る', async () => {
  const requests = [];
  const context = ui({ api: async (url, body) => { requests.push([url, body]); return {}; }, message() {} });
  vm.runInContext(source + '\nfill = async () => {};', context);
  const form = {
    amount: { value: '1000' }, collectedAt: { value: '2026-12-01T00:30' },
    method: { value: 'cash' }, note: { value: '' }, clientRequestId: { value: 'request' },
    querySelector: () => ({}),
  };
  await context.submitCollection({}, 's1', form);
  assert.equal(requests[0][0], '/ledger/collections');
  assert.equal(requests[0][1].collectedAt, '2026-11-30T15:30:00.000Z');
});

test('集金の記録と取り消しのあとに集計と利用者一覧を読み直す', async () => {
  const calls = [];
  const context = ui({
    api: async (url) => { calls.push(url); return { totals: {}, streamers: [] }; },
    message() {}, confirm: () => true, prompt: () => '誤記', crypto: { randomUUID: () => 'request' },
    el: (tag, props, ...children) => ({ tag, ...props, children }),
  });
  vm.runInContext(source, context);
  const content = { replaceChildren() {} };
  const root = { querySelector: (selector) => {
    assert.equal(selector, '.ledger-content');
    return content;
  } };
  const form = {
    amount: { value: '1000' }, collectedAt: { value: '' },
    method: { value: 'cash' }, note: { value: '' }, clientRequestId: { value: 'request' },
    querySelector: () => ({}),
  };
  await context.submitCollection(root, 's1', form);
  await context.reverseLedgerEntry(root, { id: 'entry', signedAmountYen: -1000 });
  assert.deepEqual(calls, [
    '/ledger/collections', '/ledger/summary?months=6',
    '/ledger/entries/entry/reversal', '/ledger/summary?months=6',
  ]);
});
