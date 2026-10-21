// 一時サーバー上の各ウィジェットをChrome headlessで開き、画面の負荷を同じ条件で測る。

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from './lib/args.mjs';
import { launchChrome, openPage } from './lib/chrome.mjs';
import { delay, startLocalServer } from './lib/process.mjs';
import { judge } from './lib/judge.mjs';
import { printWidgetTable, writeJson } from './lib/output.mjs';
import fs from 'node:fs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const WIDGETS = ['rush', 'wins', 'wins-fx', 'boss', 'gift-jar', 'timer', 'gacha', 'chat', 'ranking', 'gift-alert', 'media'];
const limits = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'perf', 'limits.json'), 'utf8')).widgets;

let server = null;
let chrome = null;

try {
  const options = parseArgs(process.argv.slice(2), { rate: 50, seconds: 60 });
  const names = options.only ? options.only.split(',').map((name) => name.trim()).filter((name) => WIDGETS.includes(name)) : WIDGETS;
  if (!names.length) throw new Error(`測れる画面がありません（${WIDGETS.join(', ')}）`);
  server = await startLocalServer(root);
  chrome = await launchChrome();
  const rows = [];
  for (const widget of names) rows.push(await measureWidget(widget, options));
  printWidgetTable(rows);
  const output = { tool: 'widgets', options, rows };
  if (options.json) writeJson(options.json, output);
  process.exitCode = rows.some((row) => !row.ok) ? 1 : 0;
} catch (error) {
  console.error(`性能計測を始められません: ${error.message}`);
  process.exitCode = error.message.includes('Chrome が見つかりません') ? 2 : 1;
} finally {
  if (chrome) await chrome.stop().catch(() => {});
  if (server) await server.stop().catch(() => {});
}

async function measureWidget(widget, options) {
  const page = await openPage(chrome.connection, `${server.baseUrl}/widgets/${widget}.html`);
  try {
    await delay(500);
    const start = await page.metrics();
    const startedAt = performance.now();
    const samples = [start];
    const sampler = setInterval(() => {
      page.metrics().then((sample) => samples.push(sample)).catch(() => {});
    }, 250);
    await prepareState(widget);
    try {
      await sendEvents(options);
    } finally {
      clearInterval(sampler);
    }
    await delay(400);
    const end = await page.metrics();
    samples.push(end);
    await page.collectGarbage();
    await delay(100);
    const afterGc = await page.metrics();
    const elapsedSeconds = Math.max(0.001, (performance.now() - startedAt) / 1000);
    const cpuPercent = Math.max(0, ((end.taskDuration - start.taskDuration) / elapsedSeconds) * 100);
    const heapMaxMB = Math.max(...samples.map((sample) => sample.heapUsed)) / 1024 / 1024;
    const heapGrowthMB = (afterGc.heapUsed - start.heapUsed) / 1024 / 1024;
    const result = {
      widget,
      seconds: elapsedSeconds,
      cpuPercent,
      heapStartMB: start.heapUsed / 1024 / 1024,
      heapMaxMB,
      heapEndMB: end.heapUsed / 1024 / 1024,
      heapAfterGcMB: afterGc.heapUsed / 1024 / 1024,
      heapGrowthMB,
      domStart: start.domNodes,
      domEnd: end.domNodes,
      domGrowth: end.domNodes - start.domNodes,
      eventListenersStart: start.listeners ?? 0,
      eventListenersEnd: end.listeners ?? 0,
      audioContexts: Math.max(start.audioContexts ?? 0, end.audioContexts ?? 0),
      frames: end.frames - start.frames,
      droppedFrames: end.droppedFrames - start.droppedFrames,
      droppedFramePercent: end.frames > start.frames ? ((end.droppedFrames - start.droppedFrames) / (end.frames - start.frames)) * 100 : 0,
      worstFrameMs: end.worstFrameMs,
    };
    result.ok = judge(result, limits).ok;
    result.reasons = judge(result, limits).reasons;
    return result;
  } finally {
    await page.close().catch(() => {});
  }
}

async function prepareState(widget) {
  const controls = {
    rush: { target: 'rush', action: 'start' },
    timer: { target: 'timer', action: 'start', data: { id: 'active' } },
    wins: { target: 'wins', action: 'win', data: { id: 'active' } },
    'wins-fx': { target: 'wins', action: 'add', data: { id: 'active', value: 10 } },
    boss: { target: 'boss', action: 'damage', data: { id: 'active', value: 1 } },
  };
  const control = controls[widget];
  if (control) await postJson(`${server.baseUrl}/api/control`, control);
}

async function sendEvents(options) {
  const total = Math.max(1, Math.ceil(options.rate * options.seconds));
  const interval = (options.seconds * 1000) / total;
  const gifts = [
    { giftName: 'Rose', diamonds: 1 },
    { giftName: 'Doughnut', diamonds: 30 },
    { giftName: 'Corgi', diamonds: 299 },
    { giftName: 'Galaxy', diamonds: 1000 },
    { giftName: 'Lion', diamonds: 29999 },
  ];
  const kinds = options.kinds.length ? options.kinds : ['gift'];
  const startedAt = performance.now();
  for (let i = 0; i < total; i += 1) {
    const kind = kinds[i % kinds.length];
    const body = kind === 'gift' ? { kind, ...gifts[i % gifts.length], count: 1, senderName: `計測${i % 10}` } : { kind, count: 1, senderName: `計測${i % 10}`, content: `計測コメント${i}` };
    await postJson(`${server.baseUrl}/api/simulate`, body);
    const wait = startedAt + (i + 1) * interval - performance.now();
    if (wait > 0) await delay(wait);
  }
}

async function postJson(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${url} が HTTP ${response.status}`);
  return response.json();
}
