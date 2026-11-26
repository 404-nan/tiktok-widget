// 標準ウィジェットランタイムの固定: 1ページ1本のWebSocket、個別APIを書かない宣言バインド、counter の見本移行。
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  createWidgetSocketBus,
  evaluateTemplateValue,
  testTemplateCondition,
  selectWidgetConfig,
} from '../public/widgets/lib/widget-runtime.js';

test('標準ランタイムの式は安全な path と pipe だけを解決する', () => {
  const ctx = {
    state: { likes: 123456, user: { name: '花子' }, rows: [1, 2, 3], emptyRows: [] },
    config: { show: ['likes', 'viewers'], title: '見出し' },
    event: { kind: 'gift' },
  };
  assert.equal(evaluateTemplateValue('state.user.name', ctx), '花子');
  assert.equal(evaluateTemplateValue('state.likes | number', ctx), '12.3万');
  assert.equal(evaluateTemplateValue('config.show | contains:likes', ctx), true);
  assert.equal(evaluateTemplateValue('config.show | contains:follows', ctx), false);
  assert.deepEqual(evaluateTemplateValue('state.rows | slice:2', ctx), [1, 2]);
  assert.equal(evaluateTemplateValue('state.emptyRows | empty', ctx), true);
  assert.equal(evaluateTemplateValue('state.missing | default:未入力', ctx), '未入力');
  assert.equal(evaluateTemplateValue('state.user.name;alert(1)', ctx), undefined);
});

test('標準ランタイムの条件は一致・否定・真偽だけを判定する', () => {
  const ctx = { state: { count: 3, active: true }, message: { phase: 'open' }, config: { mode: 'a' } };
  assert.equal(testTemplateCondition('message.phase=open', ctx), true);
  assert.equal(testTemplateCondition('message.phase=closed', ctx), false);
  assert.equal(testTemplateCondition('message.phase!=closed', ctx), true);
  assert.equal(testTemplateCondition('state.count>2', ctx), true);
  assert.equal(testTemplateCondition('state.count>=3', ctx), true);
  assert.equal(testTemplateCondition('state.active', ctx), true);
  assert.equal(testTemplateCondition('!state.active', ctx), false);
});

test('設定の選択は map と object の両方で、既定値・config・URLパラメータの順に合体する', () => {
  const map = selectWidgetConfig({
    config: { active: { counters: 'b' }, counters: { a: { hearts: false }, b: { show: ['likes'], layout: 'column' } } },
    defaults: { counters: { show: ['likes', 'viewers'], hearts: true, layout: 'row' } },
    section: 'counters',
    kind: 'map',
    fallback: { show: ['likes', 'viewers'], hearts: true, layout: 'row', align: 'left' },
    search: '?align=right&hearts=0',
  });
  assert.equal(map.id, 'b');
  assert.deepEqual(map.values.show, ['likes']);
  assert.equal(map.values.layout, 'column');
  assert.equal(map.values.align, 'right');
  assert.equal(map.values.hearts, false);

  const object = selectWidgetConfig({
    config: { combo: { volume: 0.2, enabled: true } },
    defaults: { combo: { volume: 0.5 } },
    section: 'combo',
    kind: 'object',
    fallback: { volume: 0.5, enabled: false },
  });
  assert.equal(object.id, 'default');
  assert.equal(object.values.volume, 0.2);
  assert.equal(object.values.enabled, true);
});

test('ランタイムのWebSocketは複数の利用者で1本だけ共有する', () => {
  let connectCalls = 0;
  let handlers = null;
  const bus = createWidgetSocketBus({
    connect(h) {
      connectCalls += 1;
      handlers = h;
    },
  });
  const seenA = [];
  const seenB = [];
  bus.subscribe((type, args) => { seenA.push([type, args]); return false; });
  bus.subscribe((type, args) => { seenB.push([type, args]); return false; });
  assert.equal(connectCalls, 1, '2つ購読しても接続は1回だけ');
  handlers.hello('live', { likes: 1 }, { type: 'hello', config: { theme: {} } });
  assert.equal(seenA.length, 1);
  assert.equal(seenB.length, 1);
  assert.equal(seenA[0][0], 'hello');
  assert.equal(seenA[0][1][1].likes, 1);
});

test('標準テンプレートはHTML宣言だけで接続し、個別APIや独自WebSocketを持たない', () => {
  const file = new URL('../public/widgets/_template/index.html', import.meta.url);
  assert.ok(fs.existsSync(file), 'public/widgets/_template/index.html がある');
  const src = fs.readFileSync(file, 'utf8');
  assert.match(src, /<body[^>]*data-tw-widget/);
  assert.match(src, /src="lib\/widget-runtime\.js"/);
  assert.doesNotMatch(src, /new\s+WebSocket|fetch\(|XMLHttpRequest/);
  const inlineScripts = [...src.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)].filter((m) => !/\ssrc=/.test(m[1] ?? '') && m[2].trim());
  assert.deepEqual(inlineScripts, [], 'テンプレート本体にJavaScriptを書かない');
});

test('counter は見本として widget-runtime に移行し、独自接続を書かない', () => {
  const src = fs.readFileSync(new URL('../public/widgets/counter/index.html', import.meta.url), 'utf8');
  assert.match(src, /defineWidget\(\{/);
  assert.match(src, /section:\s*'counters'/);
  assert.doesNotMatch(src, /\bconnect\(\{/);
  assert.doesNotMatch(src, /\bsetupWidget\(/);
  assert.doesNotMatch(src, /new\s+WebSocket|fetch\(|XMLHttpRequest/);
});
