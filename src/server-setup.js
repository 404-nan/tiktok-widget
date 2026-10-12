// 配信のひな形の server（どの世界で・どんな設定で遊ぶか）に合わせて、Minecraft サーバーを準備する。
// パネル（via: panel）なら 止める → server.properties を書き換える → 起動する → コマンドを送る。
// RCON のときはサーバーを止められないので、コマンドだけ送る。
//
// ひな形の書き方:
//   server:
//     world: new            # new は毎回新しい世界を作る。名前を書くとその世界のフォルダを使う（例 parkour）
//     properties: {difficulty: normal, gamemode: survival}   # server.properties に書く（パネルのときだけ）
//     commands: ["difficulty normal", "gamemode survival @a"] # 起動したあとに送る

import { Panel } from './panel.js';
import { Rcon } from './rcon.js';

const WAIT_STOP_MS = 90_000;
const WAIT_START_MS = 240_000;
const POLL_MS = 2000;
const AFTER_START_MS = 3000; // 起動した直後は世界の読み込みが続くので、少し待ってからコマンドを送る

const pad = (n) => String(n).padStart(2, '0');

/** 新しい世界の名前（例 bougai-endra-20261012-2130） */
export function newWorldName(presetId, now = new Date()) {
  const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
  return `${String(presetId).replace(/[^A-Za-z0-9_-]/g, '')}-${stamp}`;
}

// server.properties の値は : と = と \ を \ で逃がす（Java の properties の書き方）
const escapeValue = (v) => String(v).replace(/\\/g, '\\\\').replace(/[:=]/g, (c) => `\\${c}`).replace(/[\r\n]/g, '');

/** server.properties の中身の、指定した項目だけを書き換える（コメントや並びは残す。ない項目は最後に足す） */
export function updateProperties(text, values) {
  const lines = String(text ?? '').split(/\r?\n/);
  if (lines.at(-1) === '') lines.pop();
  const left = new Map(Object.entries(values).map(([k, v]) => [k, escapeValue(v)]));
  const out = lines.map((line) => {
    const m = line.match(/^\s*([^#!][^=:\s]*)\s*[=:]/);
    if (!m || !left.has(m[1])) return line;
    const v = left.get(m[1]);
    left.delete(m[1]);
    return `${m[1]}=${v}`;
  });
  for (const [k, v] of left) out.push(`${k}=${v}`);
  return `${out.join('\n')}\n`;
}

/** ひな形の server の書き方を確かめる（presets.checkPreset から使う） */
export function checkServer(server, at = 'server') {
  const errors = [];
  if (server == null) return errors;
  if (typeof server !== 'object' || Array.isArray(server)) return [`${at}: { world, properties, commands } の形で書いてください`];
  if (server.world != null && !/^[A-Za-z0-9_-]+$/.test(String(server.world))) errors.push(`${at}.world: new か、世界のフォルダの名前（英数字と - _）にしてください`);
  if (server.properties != null && (typeof server.properties !== 'object' || Array.isArray(server.properties))) errors.push(`${at}.properties: 「項目: 値」の形で書いてください`);
  for (const [k, v] of Object.entries(server.properties ?? {})) {
    if (!/^[a-z0-9.-]+$/.test(k)) errors.push(`${at}.properties.${k}: server.properties の項目の名前ではありません`);
    if (k === 'level-name') errors.push(`${at}.properties.level-name: 世界は world で決めてください`);
    if (/rcon|management-server|password|secret/.test(k)) errors.push(`${at}.properties.${k}: 接続やパスワードの項目はひな形では変えられません`);
    if (v != null && typeof v === 'object') errors.push(`${at}.properties.${k}: 値は文字か数で書いてください`);
  }
  if (server.commands != null && (!Array.isArray(server.commands) || server.commands.some((c) => typeof c !== 'string' || /[\r\n]/.test(c)))) {
    errors.push(`${at}.commands: コマンドを1行ずつ一覧で書いてください`);
  }
  return errors;
}

/**
 * サーバーをひな形のゲームに合わせる。
 * mc: config の minecraft、onStep(text): 途中経過を知らせる
 * 戻り値: { world, steps }
 */
export async function prepareServer(preset, mc, { onStep = () => {}, now = new Date(), pollMs = POLL_MS, afterStartMs = AFTER_START_MS, client } = {}) {
  const setup = preset.server ?? {};
  if (!mc?.enabled) throw new Error('Minecraft 連携がオフです（設定 → Minecraft 連携 で enabled をオンにしてください）');
  const steps = [];
  const step = (text) => {
    steps.push(text);
    onStep(text);
  };
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const commands = (setup.commands ?? []).map((c) => c.replace(/^\//, ''));
  let world = null;

  if (mc.via === 'panel') {
    const panel = client ?? new Panel({ url: mc.panelUrl, server: mc.panelServer, key: mc.panelKey });
    const waitFor = async (want, ms) => {
      const until = Date.now() + ms;
      for (;;) {
        const s = await panel.state();
        if (want.includes(s)) return s;
        if (Date.now() > until) return s;
        await sleep(pollMs);
      }
    };
    const properties = { ...(setup.properties ?? {}) };
    if (setup.world) {
      world = setup.world === 'new' ? newWorldName(preset.id, now) : String(setup.world);
      properties['level-name'] = world;
    }
    if (Object.keys(properties).length) {
      if ((await panel.state()) !== 'offline') {
        step('Minecraft サーバーを止めています');
        await panel.power('stop');
        if ((await waitFor(['offline'], WAIT_STOP_MS)) !== 'offline') {
          step('止まらないので、強制的に止めます');
          await panel.power('kill');
          await waitFor(['offline'], 20_000);
        }
      }
      step(world ? `server.properties を書き換えています（世界: ${world}）` : 'server.properties を書き換えています');
      let text = '';
      try {
        text = await panel.readFile('/server.properties');
      } catch {} // まだ一度も起動していないサーバーにはファイルがない
      await panel.writeFile('/server.properties', updateProperties(text, properties));
    }
    if ((await panel.state()) !== 'running') {
      step(setup.world === 'new' ? '起動しています（新しい世界を作るので、少しかかります）' : '起動しています');
      await panel.power('start');
      const s = await waitFor(['running'], WAIT_START_MS);
      if (s !== 'running') throw new Error(`起動が終わりませんでした（今: ${s}）。パネルのコンソールを見てください`);
      await sleep(afterStartMs);
    }
    if (commands.length) {
      step('ゲームの設定のコマンドを送っています');
      for (const c of commands) await panel.send(c);
    }
  } else {
    if (setup.world || setup.properties) step('RCON では世界と server.properties は変えられないので、コマンドだけ送ります');
    if (commands.length) {
      const rcon = client ?? new Rcon(mc);
      step('ゲームの設定のコマンドを送っています');
      try {
        for (const c of commands) await rcon.send(c);
      } finally {
        rcon.close();
      }
    }
  }
  step('準備ができました');
  return { world, steps };
}
