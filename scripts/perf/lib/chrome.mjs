// Chromeをheadlessで起動し、依存を増やさず既存の ws でCDPを操作する。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';
import { delay, findFreePort } from './process.mjs';

const DEFAULT_CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';

export function chromePath() {
  return process.env.PERF_CHROME || DEFAULT_CHROME;
}

export async function launchChrome() {
  const executable = chromePath();
  if (!fs.existsSync(executable)) throw new Error(`Chrome が見つかりません: ${executable}（PERF_CHROME で変更できます）`);
  const port = await findFreePort();
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'tw-perf-chrome-'));
  const child = spawn(executable, [
    '--headless=new',
    '--no-sandbox',
    '--disable-features=RendererCodeIntegrity',
    '--use-angle=swiftshader',
    '--in-process-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--remote-allow-origins=*',
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${profile}`,
  ], { stdio: ['ignore', 'ignore', 'ignore'], windowsHide: true });

  try {
    const version = await waitForJson(`http://127.0.0.1:${port}/json/version`);
    const connection = await CdpConnection.connect(version.webSocketDebuggerUrl);
    connection.httpBase = `http://127.0.0.1:${port}`;
    return {
      connection,
      async stop() {
        await Promise.race([
          connection.command('Browser.close'),
          delay(1_000),
        ]).catch(() => {});
        connection.close();
        if (child.exitCode == null) child.kill();
        await Promise.race([
          new Promise((resolve) => child.once('close', resolve)),
          delay(2_000),
        ]);
        fs.rmSync(profile, { recursive: true, force: true });
      },
    };
  } catch (error) {
    if (child.exitCode == null) child.kill();
    fs.rmSync(profile, { recursive: true, force: true });
    throw error;
  }
}

export async function waitForJson(url, timeoutMs = 15_000) {
  const started = Date.now();
  let lastError = null;
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await delay(100);
  }
  throw new Error(`ChromeのCDPが起動しませんでした: ${lastError?.message ?? 'タイムアウト'}`);
}

class CdpConnection {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    this.events = new Set();
    socket.on('message', (raw) => this.receive(JSON.parse(String(raw))));
    socket.on('close', () => {
      for (const { reject } of this.pending.values()) reject(new Error('ChromeとのCDP接続が閉じました'));
      this.pending.clear();
    });
  }

  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.once('open', resolve);
      socket.once('error', reject);
    });
    return new CdpConnection(socket);
  }

  receive(message) {
    if (message.id && this.pending.has(message.id)) {
      const pending = this.pending.get(message.id);
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result ?? {});
    }
    for (const listener of this.events) listener(message);
  }

  command(method, params = {}, sessionId = undefined) {
    const id = this.nextId++;
    const message = { id, method, params };
    if (sessionId) message.sessionId = sessionId;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify(message));
    });
  }

  waitForEvent(method, sessionId, timeoutMs = 15_000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.events.delete(listener);
        reject(new Error(`${method} を待っている間にタイムアウトしました`));
      }, timeoutMs);
      const listener = (message) => {
        if (message.method !== method || message.sessionId !== sessionId) return;
        clearTimeout(timer);
        this.events.delete(listener);
        resolve(message.params ?? {});
      };
      this.events.add(listener);
    });
  }

  close() {
    try { this.socket.close(); } catch {}
  }
}

const INSTRUMENTATION = `(() => {
  let listeners = 0;
  let audioContexts = 0;
  let frames = 0;
  let droppedFrames = 0;
  let worstFrameMs = 0;
  let previousFrame = null;
  const add = EventTarget.prototype.addEventListener;
  const remove = EventTarget.prototype.removeEventListener;
  EventTarget.prototype.addEventListener = function (...args) { listeners += 1; return add.apply(this, args); };
  EventTarget.prototype.removeEventListener = function (...args) { listeners = Math.max(0, listeners - 1); return remove.apply(this, args); };
  const originalRaf = window.requestAnimationFrame;
  if (originalRaf) {
    const frame = (time) => {
      if (previousFrame != null) {
        const gap = time - previousFrame;
        worstFrameMs = Math.max(worstFrameMs, gap);
        if (gap > 33) droppedFrames += 1;
      }
      previousFrame = time;
      frames += 1;
      originalRaf(frame);
    };
    originalRaf(frame);
  }
  const OriginalAudioContext = window.AudioContext;
  if (OriginalAudioContext) {
    const WrappedAudioContext = function (...args) { audioContexts += 1; return new OriginalAudioContext(...args); };
    WrappedAudioContext.prototype = OriginalAudioContext.prototype;
    Object.setPrototypeOf(WrappedAudioContext, OriginalAudioContext);
    window.AudioContext = WrappedAudioContext;
  }
  window.__twPerfSnapshot = () => ({ listeners, audioContexts, frames, droppedFrames, worstFrameMs });
})();`;

export async function openPage(connection, url) {
  const response = await fetch(`${connection.httpBase}/json/new?about:blank`, { method: 'PUT' });
  if (!response.ok) throw new Error(`Chromeの新しいページを作れませんでした: HTTP ${response.status}`);
  const target = await response.json();
  const targetId = target.id;
  const pageConnection = await CdpConnection.connect(target.webSocketDebuggerUrl);
  await pageConnection.command('Page.enable');
  await pageConnection.command('Runtime.enable');
  await pageConnection.command('Performance.enable');
  await pageConnection.command('Page.addScriptToEvaluateOnNewDocument', { source: INSTRUMENTATION });
  const loaded = pageConnection.waitForEvent('Page.loadEventFired');
  await pageConnection.command('Page.navigate', { url });
  await loaded;
  return {
    sessionId: undefined,
    async evaluate(expression) {
      const result = await pageConnection.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
      if (result.exceptionDetails) throw new Error(result.exceptionDetails.text || 'ページ内の評価に失敗しました');
      return result.result?.value;
    },
    async metrics() {
      const [performance, heap, snapshot, domNodes] = await Promise.all([
        pageConnection.command('Performance.getMetrics'),
        pageConnection.command('Runtime.getHeapUsage'),
        this.evaluate('window.__twPerfSnapshot ? window.__twPerfSnapshot() : {}'),
        this.evaluate('document.querySelectorAll("*").length'),
      ]);
      const values = Object.fromEntries((performance.metrics ?? []).map((metric) => [metric.name, metric.value]));
      return { taskDuration: values.TaskDuration ?? 0, heapUsed: heap.usedSize ?? 0, heapTotal: heap.totalSize ?? 0, domNodes: domNodes ?? 0, ...snapshot };
    },
    async collectGarbage() {
      await pageConnection.command('HeapProfiler.collectGarbage');
    },
    async close() {
      await fetch(`${connection.httpBase}/json/close/${targetId}`).catch(() => {});
      pageConnection.close();
    },
  };
}
