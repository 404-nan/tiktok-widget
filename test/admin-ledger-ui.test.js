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

test('ブラウザーのタイムゾーンにかかわらず集金日時を日本時間として送る', async () => {
  const requests = [];
  const context = ui({ api: async (url, body) => { requests.push([url, body]); return {}; }, message() {} });
  vm.runInContext(source + '\nrenderDetailPanel = async () => {};', context);
  const form = {
    amount: { value: '1000' }, collectedAt: { value: '2026-12-01T00:30' },
    method: { value: 'cash' }, note: { value: '' }, clientRequestId: { value: 'request' },
    querySelector: () => ({}),
  };
  await context.submitCollection({}, 's1', form);
  assert.equal(requests[0][0], '/ledger/collections');
  assert.equal(requests[0][1].collectedAt, '2026-11-30T15:30:00.000Z');
});
