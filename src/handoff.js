// P3 の重ね引き継ぎ。古い側のイベントをためて流し、新しい側が状態を復元して適用役を1つに保つ。

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { WebSocket } from 'ws';
import { eventKeyOf, HANDOFF_KEY_WINDOW_MS } from './hub.js';
import { restoreLiveState } from './runtime.js';

const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value, (_key, item) => typeof item === 'bigint' ? item.toString() : item));
const liveish = (mode) => ['live', 'connecting', 'error'].includes(mode);

export function snapshotRuntime(runtime) {
  const hub = runtime.hub;
  return clone({
    hub: {
      state: hub.state,
      gifters: [...hub.gifters],
      likers: [...hub.likers],
      recentChats: hub.recentChats,
      seq: hub.seq,
      epoch: hub.epoch,
      replayRing: hub.replayRing,
      appliedKeys: [...hub.appliedKeys],
    },
    status: hub.status,
  });
}

export function restoreRuntime(runtime, snapshot) {
  if (!snapshot?.hub) return false;
  const hub = runtime.hub;
  restoreLiveState(hub, snapshot);
  if (snapshot.status && typeof snapshot.status === 'object') hub.status = clone(snapshot.status);
  return true;
}

function readStoredSnapshot(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function storedAppliedKeys(snapshot) {
  if (!Array.isArray(snapshot?.hub?.appliedKeys)) return [];
  const cutoff = Date.now() - HANDOFF_KEY_WINDOW_MS;
  return snapshot.hub.appliedKeys.filter(([key, at]) => key && Number.isFinite(at) && at >= cutoff).map(([key]) => String(key));
}

export class HandoffManager {
  constructor({ local = null, tenants = null, env = process.env, fetchImpl = null, WebSocketImpl = WebSocket, log = console } = {}) {
    this.local = local;
    this.tenants = tenants;
    this.env = env;
    this.fetch = fetchImpl ?? globalThis.fetch;
    this.WebSocket = WebSocketImpl;
    this.log = log;
    this.source = { state: 'idle', id: null, startedAt: null, order: 0, events: [], streams: new Set(), result: null };
    this.target = {
      enabled: Boolean(env.TW_HANDOFF_FROM),
      state: env.TW_HANDOFF_FROM ? 'created' : 'off',
      authoritative: false,
      finished: false,
      error: null,
      runtimes: new Map(),
      stream: null,
      retryTimer: null,
      missing: [],
    };
    this.runtimes = new Map();
  }

  registerRuntime(runtime) {
    if (!runtime?.hub || this.runtimes.get(runtime.id)?.runtime === runtime) return;
    this.runtimes.set(runtime.id, { runtime });
    if (this.target.enabled) {
      runtime.hub.handoffWritesPaused = !this.target.authoritative;
      this.#targetRuntime(runtime);
      runtime.hub.setPublishInterceptor((event) => this.#bufferTargetEvent(runtime, event));
    } else if (this.source.state === 'buffering') {
      this.#activateSourceRuntime(runtime);
    }
  }

  begin() {
    if (this.source.state === 'finished') {
      const error = new Error('この引き継ぎは終了しています');
      error.statusCode = 409;
      throw error;
    }
    if (this.source.state === 'buffering') return this.source.response;
    const id = `handoff_${crypto.randomUUID()}`;
    this.source = {
      ...this.source,
      state: 'buffering',
      id,
      startedAt: Date.now(),
      order: 0,
      events: [],
      streams: new Set(),
      result: null,
    };
    const runtimes = {};
    if (this.local) runtimes.local = this.#beginRuntime(this.local);
    const tenants = {};
    for (const tenant of this.tenants?.list?.() ?? []) {
      const runtime = this.tenants.runtimes.get(tenant.id);
      const entry = runtime ? this.#beginRuntime(runtime) : this.#storedTenant(tenant.id);
      tenants[tenant.id] = entry;
      runtimes[tenant.id] = entry;
    }
    const response = { ok: true, id, startedAt: this.source.startedAt, state: this.source.state, local: runtimes.local ?? null, tenants, runtimes };
    this.source.response = response;
    return response;
  }

  #beginRuntime(runtime) {
    this.#activateSourceRuntime(runtime);
    const snapshot = snapshotRuntime(runtime);
    return {
      id: runtime.id,
      state: 'buffering',
      snapshot,
      appliedKeys: runtime.hub.appliedKeysSince(Date.now() - HANDOFF_KEY_WINDOW_MS),
      lastSeq: runtime.hub.seq,
    };
  }

  #storedTenant(id) {
    const snapshot = readStoredSnapshot(path.join(this.tenants.dataDir(id), 'live-state.json'));
    return {
      id,
      state: 'stored',
      snapshot,
      appliedKeys: storedAppliedKeys(snapshot),
      lastSeq: snapshot?.hub?.seq ?? 0,
    };
  }

  #activateSourceRuntime(runtime) {
    runtime.hub.handoffWritesPaused = true;
    runtime.hub.setPublishInterceptor((event) => this.#bufferSourceEvent(runtime, event));
  }

  #bufferSourceEvent(runtime, event) {
    if (this.source.state !== 'buffering') return false;
    const message = {
      type: 'event',
      handoff: this.source.id,
      tenant: runtime.id,
      key: eventKeyOf(event),
      event: clone(event),
      receivedAt: Date.now(),
      order: ++this.source.order,
    };
    this.source.events.push(message);
    for (const ws of this.source.streams) this.#send(ws, message);
    return true;
  }

  attachStream(ws) {
    if (this.source.state !== 'buffering') {
      this.#send(ws, { type: 'error', error: '引き継ぎが始まっていません' });
      ws.close(1008, 'handoff not begun');
      return false;
    }
    this.source.streams.add(ws);
    ws.on('close', () => this.source.streams.delete(ws));
    this.#send(ws, { type: 'hello', handoff: this.source.id, startedAt: this.source.startedAt, state: this.source.state });
    for (const message of this.source.events) this.#send(ws, message);
    this.#send(ws, { type: 'catchup', handoff: this.source.id, events: this.source.events.length });
    return true;
  }

  async finish() {
    if (this.source.state === 'finished') return this.source.result;
    if (this.source.state !== 'buffering') {
      const error = new Error('引き継ぎが始まっていません');
      error.statusCode = 409;
      throw error;
    }
    const runtimes = [...this.runtimes.values()].map(({ runtime }) => runtime);
    await Promise.all(runtimes.map(async (runtime) => {
      runtime.hub.handoffWritesPaused = true;
      await runtime.tiktok?.disconnect?.().catch((error) => this.log.warn?.(`[handoff] ${runtime.id}: TikTok を切れませんでした: ${error.message}`));
    }));
    let movedClients = 0;
    for (const runtime of runtimes) {
      for (const ws of [...runtime.hub.clients]) {
        if (ws.readyState !== 1) continue;
        try {
          ws.send(JSON.stringify({ type: 'moved', handoff: this.source.id, reason: 'handoff' }));
          ws.close(1012, 'moved');
          movedClients++;
        } catch {}
      }
    }
    for (const ws of [...this.source.streams]) {
      this.#send(ws, { type: 'finished', handoff: this.source.id });
      try { ws.close(1000, 'finished'); } catch {}
    }
    this.source.state = 'finished';
    this.source.result = { ok: true, id: this.source.id, state: 'finished', movedClients, disconnected: runtimes.map((runtime) => runtime.id) };
    return this.source.result;
  }

  status() {
    return {
      ok: true,
      source: {
        state: this.source.state,
        id: this.source.id,
        startedAt: this.source.startedAt,
        bufferedEvents: this.source.events.length,
        streams: this.source.streams.size,
      },
      target: {
        state: this.target.state,
        enabled: this.target.enabled,
        authoritative: this.target.authoritative,
        finished: this.target.finished,
        error: this.target.error,
        missing: [...this.target.missing],
      },
    };
  }

  async startTarget() {
    if (!this.target.enabled) return false;
    if (this.target.promise) return this.target.promise;
    this.target.promise = this.#runTarget().catch((error) => {
      this.target.state = 'error';
      this.target.error = error.message;
      throw error;
    });
    return this.target.promise;
  }

  async #runTarget() {
    const from = String(this.env.TW_HANDOFF_FROM ?? '').replace(/\/+$/, '');
    const token = this.env.TW_HANDOFF_TOKEN || this.env.TW_ADMIN_TOKEN;
    if (!from) throw new Error('TW_HANDOFF_FROM がありません');
    if (!token) throw new Error('TW_HANDOFF_TOKEN か TW_ADMIN_TOKEN が必要です');
    this.target.state = 'connecting';
    const admin = await this.#fetchJson(`${from}/admin/api/tenants`, { token });
    for (const tenant of admin.tenants ?? []) {
      if (!liveish(tenant.status?.mode)) continue;
      if (!this.tenants?.get?.(tenant.id)) {
        if (!this.target.missing.includes(tenant.id)) this.target.missing.push(tenant.id);
        continue;
      }
      const runtime = this.tenants.runtime(tenant.id);
      this.registerRuntime(runtime);
      const handle = tenant.status?.username || tenant.tiktokId;
      if (handle) runtime.tiktok.connect(handle).catch((error) => this.log.warn?.(`[handoff] ${tenant.id}: 先つなぎに失敗: ${error.message}`));
    }
    if (this.local) {
      try {
        const status = await this.#fetchJson(`${from}/api/status`);
        const handle = status.status?.username;
        if (liveish(status.status?.mode) && handle) {
          this.registerRuntime(this.local);
          this.local.tiktok.connect(handle).catch((error) => this.log.warn?.(`[handoff] local: 先つなぎに失敗: ${error.message}`));
        }
      } catch {}
    }
    const settleMs = Number(this.env.TW_HANDOFF_SETTLE_MS ?? 250);
    if (settleMs > 0) await new Promise((resolve) => setTimeout(resolve, settleMs));

    this.target.state = 'beginning';
    const begin = await this.#fetchJson(`${from}/admin/api/handoff/begin`, { method: 'POST', token, body: {} });
    this.target.state = 'restoring';
    const beginIds = new Set(Object.keys(begin.runtimes ?? {}));
    for (const entry of Object.values(begin.runtimes ?? {})) {
      if (entry.state === 'stored' && entry.id !== 'local') {
        if (entry.snapshot && !this.#writeStoredSnapshot(entry.id, entry.snapshot) && !this.target.missing.includes(entry.id)) this.target.missing.push(entry.id);
        continue;
      }
      const runtime = this.#runtimeFor(entry.id);
      if (!runtime) {
        if (!this.target.missing.includes(entry.id)) this.target.missing.push(entry.id);
        continue;
      }
      this.registerRuntime(runtime);
      runtime.hub.handoffWritesPaused = true;
      const state = this.#targetRuntime(runtime);
      state.seen = new Set(entry.appliedKeys ?? []);
      if (restoreRuntime(runtime, entry.snapshot)) {
        for (const message of entry.snapshot?.hub?.replayRing ?? []) {
          const key = message?.event?.key;
          if (key) state.seen.add(String(key));
        }
        state.restored = true;
      }
    }
    // begin に無い配信者（新しい側だけにいる人）は、ローカルの P2 状態をそのまま使ってよい。
    for (const [id, state] of this.target.runtimes) if (!state.restored && !beginIds.has(id)) state.restored = true;
    this.target.authoritative = true;
    for (const { runtime } of this.runtimes.values()) runtime.hub.handoffWritesPaused = false;
    for (const { runtime } of this.runtimes.values()) this.#drainTargetRuntime(runtime);
    for (const { runtime } of this.runtimes.values()) runtime.flushLiveState?.();
    this.target.state = 'aligning';
    this.#openTargetStream(from, token);
    return true;
  }

  #writeStoredSnapshot(id, snapshot) {
    if (!snapshot?.hub || !this.tenants?.dataDir) return false;
    const dir = this.tenants.dataDir(id);
    const file = path.join(dir, 'live-state.json');
    const tempFile = `${file}.tmp-${process.pid}`;
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(tempFile, JSON.stringify(snapshot), { mode: 0o600 });
      fs.renameSync(tempFile, file);
      fs.chmodSync(file, 0o600);
      return true;
    } catch {
      try { fs.rmSync(tempFile, { force: true }); } catch {}
      return false;
    }
  }

  #runtimeFor(id) {
    if (id === 'local') return this.local;
    if (!this.tenants?.get?.(id)) return null;
    return this.tenants.runtime(id);
  }

  #targetRuntime(runtime) {
    let state = this.target.runtimes.get(runtime.id);
    if (!state) {
      state = { runtime, queue: [], seen: new Set(), restored: this.target.authoritative, applied: 0, duplicates: 0 };
      this.target.runtimes.set(runtime.id, state);
    }
    return state;
  }

  #bufferTargetEvent(runtime, event) {
    if (this.target.finished) return false;
    const state = this.#targetRuntime(runtime);
    state.queue.push({ key: eventKeyOf(event), event: clone(event), receivedAt: Date.now(), source: 'direct' });
    if (this.target.authoritative) this.#drainTargetRuntime(runtime);
    return true;
  }

  #drainTargetRuntime(runtime) {
    const state = this.#targetRuntime(runtime);
    if (!this.target.authoritative || !state.restored) return;
    const entries = state.queue.splice(0);
    for (const entry of entries) this.#applyTargetEntry(state, entry);
  }

  #applyTargetEntry(state, entry) {
    if (!entry.event) return;
    if (entry.key) {
      if (state.seen.has(entry.key)) {
        state.duplicates++;
        return;
      }
      state.seen.add(entry.key);
    }
    state.runtime.hub.publish(entry.event, { bypassInterceptor: true });
    state.applied++;
  }

  #openTargetStream(from, token) {
    if (this.target.finished) return;
    const url = `${from.replace(/^http/, 'ws')}/admin/api/handoff/stream`;
    const ws = new this.WebSocket(url, { headers: { 'x-admin-token': token } });
    this.target.stream = ws;
    ws.on('message', (raw) => {
      let message;
      try { message = JSON.parse(String(raw)); } catch { return; }
      this.#targetMessage(message);
    });
    ws.on('close', () => {
      if (this.target.stream === ws) this.target.stream = null;
      if (!this.target.finished && this.target.state !== 'error') this.#retryTargetStream(from, token);
    });
    ws.on('error', () => {});
  }

  #retryTargetStream(from, token) {
    clearTimeout(this.target.retryTimer);
    this.target.retryTimer = setTimeout(() => this.#openTargetStream(from, token), 250);
    this.target.retryTimer.unref?.();
  }

  #targetMessage(message) {
    if (message.type === 'error') {
      this.target.state = 'error';
      this.target.error = message.error ?? 'handoff stream error';
      clearTimeout(this.target.retryTimer);
      try { this.target.stream?.close(); } catch {}
      return;
    }
    if (message.type === 'event') {
      if (!message.key) return; // key が無い出来事は新しい側の分だけ使う
      const runtime = this.#runtimeFor(message.tenant);
      if (!runtime) return;
      const state = this.#targetRuntime(runtime);
      this.#applyTargetEntry(state, {
        key: String(message.key),
        event: message.event,
        receivedAt: message.receivedAt,
        source: 'stream',
      });
      return;
    }
    if (message.type === 'catchup') {
      for (const { runtime } of this.runtimes.values()) this.#drainTargetRuntime(runtime);
      this.target.state = 'ready';
      return;
    }
    if (message.type === 'finished') {
      for (const { runtime } of this.runtimes.values()) this.#drainTargetRuntime(runtime);
      this.target.finished = true;
      this.target.state = 'finished';
      clearTimeout(this.target.retryTimer);
      for (const { runtime } of this.runtimes.values()) {
        runtime.hub.setPublishInterceptor(null);
        runtime.hub.handoffWritesPaused = false;
      }
    }
  }

  async #fetchJson(url, { method = 'GET', token = null, body = undefined } = {}) {
    const response = await this.fetch(url, {
      method,
      headers: {
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
        ...(token ? { 'x-admin-token': token } : {}),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) throw new Error(`${method} ${url}: ${response.status} ${data?.error ?? text}`);
    return data;
  }

  close() {
    clearTimeout(this.target.retryTimer);
    try { this.target.stream?.close(); } catch {}
  }

  #send(ws, message) {
    if (ws.readyState !== 1) return false;
    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch {
      return false;
    }
  }
}
