#!/usr/bin/env node
// 設定と動作確認の CLI。npm run tw -- <コマンド> でも使える。

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import * as admin from '../src/admin.js';
import { giftDisplayName } from '../src/gift-display.js';

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
  peka [status|bonusResolved] 告知ランプを見る・ボーナスを解決する
  throne [status|finish|stop|reset] 王座を見る・終了・演出停止・リセット
  ootori [status|start|finish|reset] ラスト10分と大トリを操作する
  dareba [status|start|stop]    ダレ場の小さな事件を見る・操作する
  rush [start|stop]         RUSH に入る・終わらせる（省くと今の状態）
  win [名前]                WIN 数を +1（クリア。名前を省くと全部）
  wins [名前]               WIN 数を見る
  wins add <数> [名前]      足す（-1 で減らす）
  wins set <数> [名前]      その数にする
  wins undo|reset [名前]    1つ戻す・0 に戻す
  timer [名前]              延長タイマーの残りを見る
  timer start|pause|toggle|reset [名前]   スタート・一時停止・切り替え・初めの時間に戻す
  timer add <秒> [名前]     足す（-60 で 1 分引く）
  timer set <秒> [名前]     残りをその秒にする
  boss [名前]               ボス討伐の HP を見る
  boss damage <数> [名前]   ダメージを与える
  boss set <数> [名前]      HP をその数にする
  boss defeat|heal|next|reset [名前]  討伐・HP を戻す・次のボス・1体目から
  status
  relay-stop                 リレー停止の状態を見る

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
      if (!args[0]) throw new Error('unset は path が必要です。使い方: tw unset <path>');
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
      for (const g of gifts) print(`${giftDisplayName(g)}\t${g.diamonds} コイン${g.seen ? '\t配信で受信' : ''}`);
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
      for (const g of r.gifts) print(`  ${g.id}${g.name ? `（${giftDisplayName({ id: g.id, name: g.name })}）` : ''}: ${g.actions.join(', ')}`);
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
    case 'win':
      print(await admin.wins('win', args[0]));
      break;
    case 'wins': {
      const [action, ...rest] = args;
      if (action === 'add' || action === 'set') print(await admin.wins(action, rest[1], Number(rest[0])));
      else if (action === 'undo' || action === 'reset') print(await admin.wins(action, rest[0]));
      else print(await admin.wins('status', action));
      break;
    }
    case 'timer': {
      const [action, ...rest] = args;
      if (action === 'add' || action === 'set') print(await admin.timer(action, rest[1], Number(rest[0])));
      else if (['start', 'pause', 'resume', 'toggle', 'reset'].includes(action)) print(await admin.timer(action, rest[0]));
      else print(await admin.timer('status', action));
      break;
    }
    case 'boss': {
      const [action, ...rest] = args;
      if (action === 'damage' || action === 'set') print(await admin.boss(action, rest[1], Number(rest[0])));
      else if (['defeat', 'heal', 'next', 'reset'].includes(action)) print(await admin.boss(action, rest[0]));
      else print(await admin.boss('status', action));
      break;
    }
    case 'rush':
      print(await admin.rush(args[0]));
      break;
    case 'obs':
      if (!args[0]) throw new Error('obsのきっかけを指定してください');
      print(await admin.control('obs', 'test', { rule: args[0] }));
      break;
    case 'spin':
      print(await admin.spinRoulette(args[0]));
      break;
    case 'peka':
      print(await admin.peka(args[0] || 'status'));
      break;
    case 'throne':
      print(await admin.throne(args[0] || 'status'));
      break;
    case 'ootori':
      print(await admin.ootori(args[0] || 'status'));
      break;
    case 'dareba':
      print(await admin.dareba(args[0] || 'status'));
      break;
    case 'status':
      print(await admin.status().then(({ status, state }) => ({ status, state: { ...state, topGifters: undefined } })));
      break;
    case 'relay-stop':
      print(await admin.relayStop());
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
