// 集金画面のフォーム送信と更新をサーバーなしで確かめる。
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { FakeElement } from './helpers/fake-dom.js';

const source = fs.readFileSync(new URL('../public/admin/admin-ledger.js', import.meta.url), 'utf8')
  .replace(/^import .*;$/m, '').replace(/^export /gm, '');

function ui(globals) {
  return vm.createContext({ document: {}, ...globals });
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
  const panel = { dataset: {}, replaceChildren() {} };
  await context.fill({ isConnected: true, querySelector: (selector) => selector === '.ledger-content' ? content : panel });
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
  const panel = { dataset: {}, replaceChildren() {} };
  const root = { isConnected: true, querySelector: (selector) => {
    assert.ok(['.ledger-content', '.ledger-detail-panel'].includes(selector));
    return selector === '.ledger-content' ? content : panel;
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

test('台帳の自動更新は古いページとスクロールと開閉を保ち、そのページから取り消せる', async () => {
  const scroller = { scrollTop: 0 };
  class Element extends FakeElement {
    dataset = {};
    get isConnected() { return this === detailBody || Boolean(this.parentNode?.isConnected); }
    replaceChildren(...nodes) {
      super.replaceChildren(...nodes);
      if (this.isConnected) scroller.scrollTop = 0;
    }
  }
  const detailBody = new Element('main');
  const el = (tag, props, ...children) => {
    const node = Object.assign(new Element(tag), props);
    node.append(...children.filter(Boolean));
    return node;
  };
  const calls = [];
  let resolveOlder;
  let reversed = false;
  let collected = 100;
  const streamer = { id: 's1', name: '利用者' };
  const detail = (offset) => ({
    streamer, balance: {}, entryPage: { total: 21, offset, limit: 20 },
    entries: offset === 20 ? [{ id: 'old-entry', kind: 'collection', signedAmountYen: -100, reversed }] : [],
  });
  const context = ui({
    page: 'ledger', detailBody, renderShell() {},
    document: { scrollingElement: scroller, activeElement: null },
    api: async (url) => {
      calls.push(url);
      if (url === '/ledger/summary?months=6') return { totals: { monthCollectedYen: collected }, streamers: [streamer] };
      if (url === '/ledger/streamers/s1?offset=0') return detail(0);
      if (url === '/ledger/streamers/s1?offset=20') {
        if (!resolveOlder) return new Promise((resolve) => { resolveOlder = resolve; });
        return detail(20);
      }
      assert.equal(url, '/ledger/entries/old-entry/reversal');
      reversed = true;
      return {};
    },
    el, button: (text, click) => {
      const node = el('button', { textContent: text });
      node.addEventListener('click', click);
      return node;
    },
    message() {}, confirm: () => true, prompt: () => '誤記', crypto: { randomUUID: () => 'request' },
    Option: class extends FakeElement { constructor(text) { super('option'); this.textContent = text; } },
  });
  const adminSource = fs.readFileSync(new URL('../public/admin/admin.js', import.meta.url), 'utf8');
  const renderDetail = adminSource.slice(adminSource.indexOf('function renderDetail('), adminSource.indexOf('// --- 読み込み ---'));
  vm.runInContext(source + '\n' + renderDetail, context);
  await context.renderDetail();
  const root = detailBody.querySelector('.ledger-page');
  const panel = root.querySelector('.ledger-detail-panel');
  const button = (text) => panel.querySelectorAll('button').find((node) => node.textContent === text);
  panel.querySelector('.ledger-collection-form').open = false;
  panel.querySelector('.ledger-adjustment-form').open = true;
  scroller.scrollTop = 500;
  const changingPage = button('古い行').listeners.get('click')();
  assert.equal(scroller.scrollTop, 500);
  assert.ok(button('古い行'));
  scroller.scrollTop = 525;
  resolveOlder(detail(20));
  await changingPage;
  assert.equal(scroller.scrollTop, 525);
  assert.ok(button('取り消す'));

  collected = 200;
  await context.renderDetail();
  assert.equal(detailBody.querySelector('.ledger-page'), root);
  assert.match(root.querySelector('.ledger-metrics').textContent, /今月の集金200円/);
  assert.equal(calls.at(-1), '/ledger/streamers/s1?offset=20');
  assert.equal(scroller.scrollTop, 525);
  assert.equal(panel.querySelector('.ledger-collection-form').open, false);
  assert.equal(panel.querySelector('.ledger-adjustment-form').open, true);
  await button('取り消す').listeners.get('click')();
  assert.deepEqual(calls.slice(-3), [
    '/ledger/entries/old-entry/reversal', '/ledger/summary?months=6', '/ledger/streamers/s1?offset=20',
  ]);
  assert.equal(button('取り消す'), undefined);
});
