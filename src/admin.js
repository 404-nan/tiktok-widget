// 設定や動作確認の操作。MCP サーバー（mcp/server.js）と CLI（bin/tw.js）が共通で使う。
// 設定ファイルは直接読み書きし、テスト送信などは起動中のサーバーに HTTP で頼む。

import fs from 'node:fs';
import path from 'node:path';
import * as cfg from './config.js';
import { DEMO_GIFTS } from './demo.js';
import { readProfile, SUPERSTREAM_ACTIONS } from './superstream.js';
import * as presets from './presets.js';
import { prepareServer } from './server-setup.js';

export const SERVER = (process.env.TW_SERVER || `http://127.0.0.1:${process.env.PORT || 3939}`).replace(/\/$/, '');

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

export const setConfig = (p, value) => cfg.setValue(p, value);
export const mergeConfig = (p, value) => cfg.mergeValue(p, value);
export const deleteConfig = (p) => cfg.deleteValue(p);
export const replaceConfig = (yaml) => cfg.replaceText(yaml);
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
  await callServer('/api/simulate', { method: 'POST', body: { kind, ...opts } });
  return `${kind} を送りました`;
}

export async function spinRoulette(id) {
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

/** SuperStream のプロフィールに設定済みのギフトの演出 */
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

// --- 配信のひな形（presets/） ---

/** ひな形の一覧と、今使っているもの */
export function presetList() {
  return { current: presets.currentPreset(), presets: presets.listPresets().map(presets.summary) };
}

/** ひな形を config.yaml に入れる（前の config.yaml は data/backups/ に残る）。goal で目標の WIN 数も決められる */
export const applyPreset = (id, opts) => presets.applyPreset(id, opts);

/** ひな形に間違いがないか調べる（id を省くと全部） */
export function checkPresets(id) {
  const list = id ? [presets.readPreset(id)].filter(Boolean) : presets.listPresets();
  if (id && !list.length) throw new Error(`ひな形「${id}」がありません`);
  return list.map((p) => ({ id: p.id, name: p.name, ...presets.checkPreset(p) }));
}

/** Minecraft サーバーをひな形のゲームに合わせる（パネルなら 止める → 世界 → 起動 → コマンド） */
export async function preparePresetServer(id, onStep) {
  const p = presets.readPreset(id);
  if (!p) throw new Error(`ひな形「${id}」がありません`);
  if (!p.server) throw new Error('このひな形にはサーバーの準備（server）が書かれていません');
  const { config, errors } = cfg.load();
  if (errors.length) throw new Error(`設定ファイルにエラーがあります: ${errors[0]}`);
  return prepareServer(p, config.minecraft, { onStep });
}
