// 設定や動作確認の操作。MCP サーバー（mcp/server.js）と CLI（bin/tw.js）が共通で使う。
// 設定ファイルは直接読み書きし、テスト送信などは起動中のサーバーに HTTP で頼む。

import fs from 'node:fs';
import path from 'node:path';
import * as cfg from './config.js';
import { DEMO_GIFTS } from './demo.js';
import { readProfile, SUPERSTREAM_ACTIONS } from './superstream.js';

export const SERVER = (process.env.TW_SERVER || `http://127.0.0.1:${process.env.PORT || 3939}`).replace(/\/$/, '');
const DATA_DIR = path.resolve(process.env.TW_DATA || path.join(path.dirname(cfg.CONFIG_PATH), 'data'));

const localGuardReason = '本番（マルチテナント）ではローカルモードの操作は使えません。代わりに TW_SERVER と TW_AI_TOKEN を付けて /ai/v1 を使うリモートモードを利用してください。';
const isHosted = () => process.env.TW_HOSTED === '1' || fs.existsSync(path.join(DATA_DIR, 'tenants.json'));
const refused = () => ({ ok: false, errors: [localGuardReason], warnings: [] });
const refuseLocalOperation = () => {
  if (isHosted()) throw new Error(localGuardReason);
};

async function callServer(pathname, { method = 'GET', body } = {}) {
  let res;
  try {
    res = await fetch(`${SERVER}${pathname}`, {
      method,
      headers: body ? { 'content-type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error(`サーバー（${SERVER}）に接続できません。先に npm start で起動してください`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

/** 設定を検証した結果（エラーと警告）を文字にする */
export function describeResult(result) {
  const lines = [];
  if (result.ok === false) lines.push('保存していません。次のエラーを直してください:');
  else if (result.ok) lines.push('保存しました。開いているウィジェットに自動で反映されます。');
  for (const e of result.errors ?? []) lines.push(`  エラー: ${e}`);
  for (const w of result.warnings ?? []) lines.push(`  注意: ${w}`);
  return lines.join('\n');
}

export function getConfig(p) {
  const { text, config, errors, warnings } = cfg.load();
  if (!p) return { path: cfg.CONFIG_PATH, yaml: text, errors, warnings };
  let value = config;
  for (const key of cfg.toPath(p)) value = value?.[key];
  return { path: p, value: value ?? null, errors, warnings };
}

export const setConfig = (p, value) => isHosted() ? refused() : cfg.setValue(p, value);
export const mergeConfig = (p, value) => isHosted() ? refused() : cfg.mergeValue(p, value);
export const deleteConfig = (p) => isHosted() ? refused() : cfg.deleteValue(p);
export const replaceConfig = (yaml) => isHosted() ? refused() : cfg.replaceText(yaml);
export const reference = () => cfg.reference();

export function validate() {
  const { errors, warnings } = cfg.load();
  return { ok: errors.length === 0, errors, warnings };
}

export function widgetUrls() {
  const { config, errors } = cfg.load();
  if (!config) return { errors, widgets: [] };
  return { errors, widgets: cfg.widgetList(config, SERVER) };
}

/** ギフト一覧。サーバーが動いていれば、実際の配信で届いたギフトも含む */
export async function gifts() {
  try {
    return { source: 'server', gifts: await callServer('/api/gifts') };
  } catch {
    return { source: 'demo', gifts: DEMO_GIFTS };
  }
}

export function media() {
  const out = [];
  const walk = (dir, prefix) => {
    if (!fs.existsSync(dir)) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isDirectory()) walk(path.join(dir, ent.name), `${prefix}${ent.name}/`);
      else if (/\.(png|jpe?g|gif|webp|svg|avif)$/i.test(ent.name)) out.push(`media/${prefix}${ent.name}`);
    }
  };
  walk(cfg.MEDIA_DIR, '');
  return out;
}

const IMAGE_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg', 'image/avif': 'avif' };

/** 画像を URL から media/ に保存する（ルーレットの項目などに使う） */
export async function addMediaFromUrl(url, name) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`画像を取得できませんでした（HTTP ${res.status}）`);
  const type = (res.headers.get('content-type') || '').split(';')[0].trim();
  const ext = IMAGE_TYPES[type];
  if (!ext) throw new Error(`画像ではありません（${type || '種類不明'}）`);
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 5 * 1024 * 1024) throw new Error('5MB より大きい画像は保存できません');
  const base = (name || path.basename(new URL(url).pathname).replace(/\.[^.]+$/, '') || 'image')
    .replace(/[^\p{L}\p{N}_-]+/gu, '-')
    .slice(0, 60);
  fs.mkdirSync(cfg.MEDIA_DIR, { recursive: true });
  const file = `${base}.${ext}`;
  fs.writeFileSync(path.join(cfg.MEDIA_DIR, file), buf);
  return `media/${file}`;
}

/** テスト用のイベントを送る（サーバーが必要） */
export async function testEvent(kind, opts = {}) {
  refuseLocalOperation();
  await callServer('/api/simulate', { method: 'POST', body: { kind, ...opts } });
  return `${kind} を送りました`;
}

export async function spinRoulette(id) {
  refuseLocalOperation();
  await callServer('/api/control', { method: 'POST', body: { target: 'roulette', action: 'spin', data: id ? { id } : {} } });
  return id ? `ルーレット ${id} を回しました` : 'ルーレットを回しました';
}

/** WIN 数を変える・見る（サーバーが必要）。action: win / add / set / undo / reset / status。id を省くと全部 */
export async function wins(action = 'status', id = null, value) {
  const line = (k, c) => `${k}: WIN ${c.wins}`;
  if (action === 'status') {
    const all = await callServer('/api/wins');
    const rows = Object.entries(all).filter(([k]) => !id || k === id);
    return rows.length ? rows.map(([k, c]) => line(k, c)).join('\n') : 'WIN 数の設定がありません';
  }
  const { wins: out } = await callServer('/api/control', { method: 'POST', body: { target: 'wins', action, data: { id, value } } });
  return Object.entries(out).map(([k, c]) => line(k, c)).join('\n');
}

/**
 * 延長タイマーを動かす・見る（サーバーが必要）。
 * action: start / pause / resume / toggle / add（seconds を足す。マイナスで引く）/ set（残りを seconds に）/ reset / status。id を省くと全部
 */
export async function timer(action = 'status', id = null, seconds) {
  const STATE = { idle: 'スタート前', running: '動いている', paused: '一時停止中', ended: '終了' };
  const clock = (ms) => {
    const s = Math.ceil(ms / 1000);
    return `${Math.floor(s / 3600)}時間${Math.floor((s % 3600) / 60)}分${s % 60}秒`;
  };
  const line = (k, t) => `${k}: ${STATE[t.status] ?? t.status}　残り ${clock(t.remaining)}${t.extended ? `（延長 ${t.extended} 秒）` : ''}`;
  if (action === 'status') {
    const all = await callServer('/api/timer');
    const rows = Object.entries(all).filter(([k]) => !id || k === id);
    return rows.length ? rows.map(([k, t]) => line(k, t)).join('\n') : '延長タイマーの設定がありません';
  }
  const { timers: out } = await callServer('/api/control', { method: 'POST', body: { target: 'timer', action, data: { id, seconds } } });
  return Object.entries(out).map(([k, t]) => line(k, t)).join('\n');
}

/** ボス討伐の HP を変える・見る（サーバーが必要）。action: damage / defeat / heal / next / set / reset / status。id を省くと全部 */
export async function boss(action = 'status', id = null, value) {
  const line = (k, b) => `${k}: ${b.round}体目 ${b.name} HP ${b.hp} / ${b.maxHp}${b.defeated ? '（討伐済み）' : ''}`;
  if (action === 'status') {
    const all = await callServer('/api/boss');
    const rows = Object.entries(all).filter(([k]) => !id || k === id);
    return rows.length ? rows.map(([k, b]) => line(k, b)).join('\n') : 'ボス討伐の設定がありません';
  }
  const { boss: out } = await callServer('/api/control', { method: 'POST', body: { target: 'boss', action, data: { id, value } } });
  return Object.entries(out).map(([k, b]) => line(k, b)).join('\n');
}

/** RUSH に入る・終わらせる・今の状態（サーバーが必要） */
export async function rush(action = 'status') {
  if (action === 'start' || action === 'stop') {
    const { rush: r } = await callServer('/api/control', { method: 'POST', body: { target: 'rush', action } });
    if (action === 'stop') return r?.total != null ? `RUSH を終わらせました（合計 ${r.total} コイン / ギフト ${r.gifts} 個）` : 'RUSH 中ではありません';
    return r?.active ? `RUSH に入りました（残り ${Math.ceil((r.endsAt - r.now) / 1000)} 秒）` : 'RUSH が無効です（rush.enabled）';
  }
  const r = await callServer('/api/rush');
  if (r.active) return `RUSH 中: 残り ${Math.ceil((r.endsAt - r.now) / 1000)} 秒、合計 ${r.total} コイン、ギフト ${r.gifts} 個`;
  return r.last ? `待機中（前回 合計 ${r.last.total} コイン / ギフト ${r.last.gifts} 個）` : '待機中';
}

export async function control(target, action, data) {
  await callServer('/api/control', { method: 'POST', body: { target, action, data } });
  return `${target} に ${action} を送りました`;
}

export async function status() {
  return callServer('/api/status');
}

/** マイクラ側の演出プロフィールに設定済みのギフトの演出 */
export async function superstream() {
  const { config } = cfg.load();
  const mc = config?.minecraft ?? {};
  const { gifts: known } = await gifts();
  return { ...readProfile(mc.superstreamFile, known), configuredProfile: mc.superstreamProfile, actions: SUPERSTREAM_ACTIONS };
}

/** Minecraft にコマンドを送って返事を見る（サーバーが必要） */
export async function minecraftCommand(command) {
  const { response } = await callServer('/api/minecraft/command', { method: 'POST', body: { command } });
  return response;
}

export async function minecraftStatus() {
  return callServer('/api/minecraft');
}

/** 配信の履歴（一覧、または id を指定して1回分） */
export async function history(id) {
  return callServer(id ? `/api/history/${encodeURIComponent(id)}` : '/api/history');
}
