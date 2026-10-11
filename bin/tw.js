#!/usr/bin/env node
// 設定と動作確認の CLI。npm run tw -- <コマンド> でも使える。

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import * as admin from '../src/admin.js';

const HELP = `使い方: tw <コマンド>

設定（config.yaml）
  reference                 書ける項目の一覧
  get [path]                今の設定（path 例: roulettes.punishment.items）
  set <path> <value>        値を入れる。value は YAML として読む
                              例: tw set roulettes.punishment.gifts "[Rose, GG]"
                                  tw set roulettes.punishment.items.0 "{label: 歌う, color: '#3FA9F5'}"
  merge <path> <value>      オブジェクトの一部のキーだけ変える
                              例: tw merge roulettes.reward "{style: strip, duration: 8}"
  unset <path>              消す
  validate                  エラーや使われない項目がないか調べる

確認
  urls                      OBS に入れる URL と推奨サイズ
  gifts                     ギフト一覧（サーバー起動中は配信で届いたギフトも）
  media                     media/ の画像一覧
  media add <url> [name]    画像を media/ に取り込む

Minecraft / SuperStream
  superstream               SuperStream のプロフィールに設定済みの演出
  mc <command>              Minecraft にコマンドを送る（例: tw mc "ss status"）

履歴（サーバー起動中のみ）
  history [id]              配信の一覧、または1回分の詳細

テスト（サーバー起動中のみ）
  test gift <名前> [個数] [1個のコイン]
  test like [数] | test follow | test share | test chat
  spin [ルーレットの名前]
  status

AI と使う
  mcp                       MCP サーバーの登録方法を表示
`;

const [cmd, ...args] = process.argv.slice(2);
const parseValue = (s) => {
  if (s === undefined) throw new Error('値を指定してください');
  return YAML.parse(s);
};
const print = (s) => console.log(typeof s === 'string' ? s : JSON.stringify(s, null, 2));
const report = (result) => {
  print(admin.describeResult(result));
  if (result.ok === false) process.exitCode = 1;
};

try {
  switch (cmd) {
    case 'reference':
      print(admin.reference());
      break;
    case 'get': {
      const r = admin.getConfig(args[0]);
      print(args[0] ? YAML.stringify(r.value) : r.yaml);
      if (r.errors.length || r.warnings.length) report({ errors: r.errors, warnings: r.warnings });
      break;
    }
    case 'set':
      report(admin.setConfig(args[0], parseValue(args[1])));
      break;
    case 'merge':
      report(admin.mergeConfig(args[0], parseValue(args[1])));
      break;
    case 'unset':
      report(admin.deleteConfig(args[0]));
      break;
    case 'validate': {
      const r = admin.validate();
      if (r.ok && !r.warnings.length) print('問題ありません');
      else report({ ...r, ok: r.ok ? undefined : false });
      break;
    }
    case 'urls': {
      const { widgets, errors } = admin.widgetUrls();
      for (const w of widgets) print(`${w.title}\n  ${w.url}\n  幅 ${w.size[0]} × 高さ ${w.size[1]}`);
      for (const e of errors) print(`エラー: ${e}`);
      break;
    }
    case 'gifts': {
      const { source, gifts } = await admin.gifts();
      if (source === 'demo') print('（サーバーが起動していないので、テスト用の一覧だけです）');
      for (const g of gifts) print(`${g.name}\t${g.diamonds} コイン${g.seen ? '\t配信で受信' : ''}`);
      break;
    }
    case 'media':
      if (args[0] === 'add') print(`保存しました: ${await admin.addMediaFromUrl(args[1], args[2])}`);
      else print(admin.media().join('\n') || 'media/ に画像はありません');
      break;
    case 'test': {
      const [kind, a, b, c] = args;
      const opts =
        kind === 'gift'
          ? { giftName: a, count: Number(b) || 1, diamonds: Number(c) || undefined }
          : kind === 'like'
            ? { count: Number(a) || 20 }
            : kind === 'viewers'
              ? { viewers: Number(a) || undefined }
              : {};
      print(await admin.testEvent(kind, opts));
      break;
    }
    case 'superstream': {
      const r = await admin.superstream();
      if (r.error) print(`注意: ${r.error}`);
      else print(`プロフィール: ${r.profile}（${r.file}）`);
      for (const g of r.gifts) print(`  ${g.id}${g.name ? `（${g.name}）` : ''}: ${g.actions.join(', ')}`);
      print(`組み込みの演出: ${r.actions.join(', ')}`);
      break;
    }
    case 'mc':
      print((await admin.minecraftCommand(args.join(' '))) || '（返事なし）');
      break;
    case 'history': {
      const r = await admin.history(args[0]);
      if (args[0]) print(r);
      else for (const s of r) print(`${s.id}${s.live ? '（配信中）' : ''}\t${Math.round(s.durationMs / 60000)}分\tコイン ${s.totals.coins}\tフォロー ${s.totals.follows}\t最大視聴者 ${s.totals.peakViewers}`);
      break;
    }
    case 'spin':
      print(await admin.spinRoulette(args[0]));
      break;
    case 'status':
      print(await admin.status().then(({ status, state }) => ({ status, state: { ...state, topGifters: undefined } })));
      break;
    case 'mcp': {
      const server = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../mcp/server.js');
      print(`Claude Code:
  claude mcp add tiktok-widget -- node ${server}

Claude Desktop など（claude_desktop_config.json の mcpServers に追加）:
  "tiktok-widget": { "command": "node", "args": ["${server}"] }

サーバーが別のポートや PC で動いているときは環境変数 TW_SERVER=http://ホスト:ポート を渡してください。`);
      break;
    }
    default:
      print(HELP);
  }
} catch (err) {
  console.error(`失敗しました: ${err.message}`);
  process.exitCode = 1;
}
