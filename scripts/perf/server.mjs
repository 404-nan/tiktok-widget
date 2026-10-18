// 一時サーバーへイベントを送り、処理速度・メモリ・WebSocket・記録量を測る。

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket } from 'ws';
import { parseArgs } from './lib/args.mjs';
import { delay, processMemoryMB, startLocalServer } from './lib/process.mjs';
import { judge } from './lib/judge.mjs';
import { printServerTable, writeJson } from './lib/output.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const limits = JSON.parse(fs.readFileSync(path.join(root, 'scripts', 'perf', 'limits.json'), 'utf8')).server;

let server = null;
const options = parseArgs(process.argv.slice(2), { rate: 50, seconds: 60 });

try {
  server = await startLocalServer(root);
  const startRssMB = processMemoryMB(server.pid);
  const sockets = await openSockets(server.baseUrl, 3);
  const latencies = [];
  const startedAt = performance.now();
  const total = Math.max(1, Math.ceil(options.rate * options.seconds));
  const interval = (options.seconds * 1000) / total;
  for (let i = 0; i < total; i += 1) {
    const sentAt = performance.now();
    await postEvent(server.baseUrl, i, options.kinds);
    latencies.push(performance.now() - sentAt);
    const wait = startedAt + (i + 1) * interval - performance.now();
    if (wait > 0) await delay(wait);
  }
  await postJson(`${server.baseUrl}/api/demo`, { on: false });
  await delay(100);
  const endRssMB = processMemoryMB(server.pid);
  const websocketBytes = sockets.reduce((sum, socket) => sum + socket.bytes, 0);
  const elapsedSeconds = Math.max(0.001, (performance.now() - startedAt) / 1000);
  const writes = fileStats(path.join(server.dataDir, 'sessions'));
  const result = {
    tool: 'server',
    options,
    events: total,
    eventsPerSecond: total / elapsedSeconds,
    simulateP50Ms: percentile(latencies, 0.5),
    simulateP95Ms: percentile(latencies, 0.95),
    startRssMB,
    endRssMB,
    memoryGrowthMB: startRssMB != null && endRssMB != null ? endRssMB - startRssMB : 0,
    websocketMessages: sockets.reduce((sum, socket) => sum + socket.messages, 0),
    websocketBytes,
    websocketBytesPerEvent: websocketBytes / Math.max(1, total),
    sessionWrites: writes.count,
    sessionWriteBytes: writes.bytes,
  };
  for (const socket of sockets) socket.close();
  result.ok = judge(result, limits).ok;
  result.reasons = judge(result, limits).reasons;
  printServerTable(result);
  if (options.json) writeJson(options.json, result);
  process.exitCode = result.ok ? 0 : 1;
} catch (error) {
  console.error(`サーバー性能計測に失敗しました: ${error.message}`);
  process.exitCode = 1;
} finally {
  if (server) await server.stop().catch(() => {});
}

async function openSockets(baseUrl, count) {
  const sockets = [];
  const endpoint = baseUrl.replace(/^http/, 'ws') + '/ws';
  for (let i = 0; i < count; i += 1) {
    const socket = new WebSocket(endpoint);
    const state = { socket, bytes: 0, messages: 0, close: () => socket.close() };
    socket.on('message', (data) => { state.bytes += Buffer.byteLength(data); state.messages += 1; });
    await new Promise((resolve, reject) => { socket.once('open', resolve); socket.once('error', reject); });
    sockets.push(state);
  }
  await delay(100);
  return sockets;
}

async function postEvent(baseUrl, index, kinds) {
  const kind = kinds[index % kinds.length] ?? 'gift';
  if (kind === 'like') return postJson(`${baseUrl}/api/simulate`, { kind, count: 1, senderName: `計測${index % 20}` });
  if (kind === 'chat') return postJson(`${baseUrl}/api/simulate`, { kind, content: `計測コメント${index}`, senderName: `計測${index % 20}` });
  const gifts = [
    ['Rose', 1], ['Doughnut', 30], ['Corgi', 299], ['Galaxy', 1000], ['Lion', 29999],
  ];
  const [giftName, diamonds] = gifts[index % gifts.length];
  return postJson(`${baseUrl}/api/simulate`, { kind: 'gift', giftName, diamonds, count: 1, senderName: `計測${index % 20}` });
}

async function postJson(url, body) {
  const response = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(`${url} が HTTP ${response.status}`);
  return response.json();
}

function percentile(values, ratio) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)];
}

function fileStats(dir) {
  if (!fs.existsSync(dir)) return { count: 0, bytes: 0 };
  return fs.readdirSync(dir).filter((name) => name.endsWith('.json')).reduce((out, name) => {
    out.count += 1;
    out.bytes += fs.statSync(path.join(dir, name)).size;
    return out;
  }, { count: 0, bytes: 0 });
}
