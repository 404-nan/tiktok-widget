// 開発用ウィジェット撮影の受け入れテスト。実ブラウザや本番データは使わない。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { takeWidgetScreenshot, MAX_SCREENSHOT_WAIT_MS } from '../src/ai-screenshot.js';
import { registerAiTools } from '../src/ai-mcp.js';

function fixture() {
  const calls = [];
  const captures = [];
  const call = async (tool, args) => {
    calls.push({ tool, args });
    if (tool === 'list_widget_urls') {
      return {
        widgets: [
          { section: 'alerts', id: 'default', title: '通知: default', url: 'http://127.0.0.1:3940/t/a/widgets/alerts.html', size: [800, 450] },
          { section: 'goals', id: 'default', title: '目標: default', url: 'http://127.0.0.1:3940/t/a/widgets/goals.html', size: [600, 300] },
        ],
        live: false,
      };
    }
    if (tool === 'test_event') return { ok: true, visualOnly: true };
    throw new Error(`想定外の道具: ${tool}`);
  };
  const capture = async (url, options) => {
    captures.push({ url, options });
    return { data: Buffer.from('png fixture'), mimeType: 'image/png' };
  };
  return { call, capture, calls, captures };
}

test('AC-1/3/4/5/6: テスト送信の完了後に対象だけを撮影し、画像と要約を返す', async () => {
  const f = fixture();
  const result = await takeWidgetScreenshot({
    call: f.call,
    capture: f.capture,
    isDevelopment: true,
    now: () => '2026-10-19T12:34:56.000Z',
    args: { tenant: 'a', widget: 'alerts:default', kind: 'gift', giftName: 'Rose', count: 2, waitMs: 0 },
  });

  assert.equal(f.calls[0].tool, 'list_widget_urls');
  assert.equal(f.calls[0].args.tenant, 'a');
  assert.deepEqual(f.calls[1], { tool: 'test_event', args: { tenant: 'a', kind: 'gift', giftName: 'Rose', count: 2 } });
  assert.deepEqual(f.captures, [{ url: 'http://127.0.0.1:3940/t/a/widgets/alerts.html', options: { width: 800, height: 450 } }]);
  assert.deepEqual(result.metadata, { widget: 'alerts:default', kind: 'gift', waitMs: 0, capturedAt: '2026-10-19T12:34:56.000Z' });
  assert.equal(result.image.type, 'image');
  assert.equal(result.image.mimeType, 'image/png');
  assert.equal(result.image.data, Buffer.from('png fixture').toString('base64'));
});

test('AC-2/8/10/12: 一覧にない URL、別テナント省略、対象外ウィジェットは撮影しない', async () => {
  const f = fixture();
  await assert.rejects(
    takeWidgetScreenshot({ call: f.call, capture: f.capture, isDevelopment: true, args: { tenant: 'a', widget: 'http://任意.example/', kind: 'chat', waitMs: 0 } }),
    /一覧にあるウィジェットを指定してください/,
  );
  await assert.rejects(
    takeWidgetScreenshot({ call: f.call, capture: f.capture, isDevelopment: true, args: { widget: 'alerts:default', kind: 'chat', waitMs: 0 } }),
    /配信者を指定してください/,
  );
  assert.equal(f.calls.length, 1);
  assert.equal(f.captures.length, 0);
});

test('AC-4: 待ち時間は0以上の整数で上限以内にする', async () => {
  const f = fixture();
  for (const waitMs of [-1, 1.5, MAX_SCREENSHOT_WAIT_MS + 1]) {
    await assert.rejects(
      takeWidgetScreenshot({ call: f.call, capture: f.capture, isDevelopment: true, args: { tenant: 'a', widget: 'alerts:default', kind: 'chat', waitMs } }),
      /待ち時間は0以上の整数で、30秒以内にしてください/,
    );
  }
  assert.equal(f.calls.length, 0);
});

test('AC-7/9/11/14: 開発環境でない、送信失敗、撮影不能は画像を返さず理由を返す', async () => {
  const f = fixture();
  await assert.rejects(
    takeWidgetScreenshot({ call: f.call, capture: f.capture, isDevelopment: false, args: { tenant: 'a', widget: 'alerts:default', kind: 'chat', waitMs: 0 } }),
    /開発環境でだけ使えます/,
  );
  assert.equal(f.calls.length, 0);

  const failed = fixture();
  failed.call = async (tool, args) => {
    failed.calls.push({ tool, args });
    if (tool === 'list_widget_urls') return { widgets: [{ section: 'alerts', id: 'default', title: '通知', url: 'http://127.0.0.1:3940/widgets/alerts.html', size: [800, 450] }] };
    return { ok: false, error: 'テスト送信に失敗しました' };
  };
  await assert.rejects(
    takeWidgetScreenshot({ call: failed.call, capture: failed.capture, isDevelopment: true, args: { tenant: 'a', widget: 'alerts:default', kind: 'chat', waitMs: 0 } }),
    /テスト送信に失敗しました/,
  );
  assert.equal(failed.captures.length, 0);

  const unavailable = fixture();
  unavailable.capture = async () => { throw new Error('撮影機能が使えません'); };
  await assert.rejects(
    takeWidgetScreenshot({ call: unavailable.call, capture: unavailable.capture, isDevelopment: true, args: { tenant: 'a', widget: 'alerts:default', kind: 'chat', waitMs: 0 } }),
    /撮影に失敗しました/,
  );
});

test('AC-1: MCPに撮影道具を登録し、画像コンテンツを返す', async () => {
  const f = fixture();
  const tools = new Map();
  registerAiTools({ registerTool(name, _definition, handler) { tools.set(name, handler); } }, f.call, {
    isDevelopment: true,
    capture: f.capture,
  });
  assert.equal(tools.has('take_widget_screenshot'), true);
  const result = await tools.get('take_widget_screenshot')({ tenant: 'a', widget: 'alerts:default', kind: 'chat', waitMs: 0 });
  assert.equal(result.isError, undefined);
  assert.equal(result.content[0].type, 'text');
  assert.equal(result.content[1].type, 'image');
});
