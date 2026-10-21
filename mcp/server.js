#!/usr/bin/env node
// AI から設定を変えるための MCP サーバー（stdio）。
// 登録例（Claude Code）: claude mcp add tiktok-widget -- node /path/to/tiktok-widget/mcp/server.js

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as admin from '../src/admin.js';
import { giftDisplayName } from '../src/gift-display.js';
import { AI_MCP_INSTRUCTIONS, registerAiTools, callAiHttp } from '../src/ai-mcp.js';
import { isDevelopmentServer } from '../src/ai-screenshot.js';

// TW_AI_TOKEN と TW_SERVER があるときは /ai/v1 を呼ぶ。無ければ今までの1人用のまま。
const remote = Boolean(process.env.TW_AI_TOKEN && process.env.TW_SERVER);

const server = new McpServer(
  { name: 'tiktok-widget', version: '0.2.0' },
  {
    instructions: remote
      ? AI_MCP_INSTRUCTIONS
      : [
          'TikTok LIVE 配信用ウィジェット（ギフト通知・ギフト瓶・ルーレット・目標バー・カウンター）の設定を扱う。',
          '設定は config.yaml。書き換えると開いているウィジェットに自動で反映される。',
          '初めて使うときは get_config_reference で書き方を確認してから、get_config で今の設定を見ること。',
          '小さな変更は set_config / merge_config（コメントが残る）、大きな作り直しは replace_config を使う。',
          '保存前に検証され、エラーがあれば保存されずに理由が返るので、それを直して再度呼ぶ。',
          '変えたら test_event や spin_roulette で動きを確かめ、list_widget_urls で OBS に入れる URL を伝える。',
        ].join('\n'),
  },
);

if (!remote) {

const text = (t) => ({ content: [{ type: 'text', text: typeof t === 'string' ? t : JSON.stringify(t, null, 2) }] });
const fail = (err) => ({ content: [{ type: 'text', text: `失敗しました: ${err.message ?? err}` }], isError: true });
const wrap = (fn) => async (args) => {
  try {
    return await fn(args ?? {});
  } catch (err) {
    return fail(err);
  }
};
const saved = (result) => ({ ...text(admin.describeResult(result)), isError: result.ok === false });
const templateCall = async (pathname, body) => {
  if (process.env.TW_HOSTED === '1') throw new Error('本番（マルチテナント）ではテンプレート操作を使えません。開発サーバーを指定してください');
  const serverUrl = (process.env.TW_SERVER || `http://127.0.0.1:${process.env.PORT || 3939}`).replace(/\/$/, '');
  const destination = await fetch(`${serverUrl}/api/me`).then((res) => res.json().catch(() => ({})));
  if (destination?.mode === 'tenant') throw new Error('本番（マルチテナント）ではテンプレート操作を使えません。開発サーバーを指定してください');
  const res = await fetch(`${serverUrl}${pathname}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? undefined : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
};

const PATH_DESC = 'ドット区切りの場所。例: "roulettes.punishment.gifts" / "roulettes.punishment.items.2.color" / "theme.accent"';
const readOnly = { readOnlyHint: true, openWorldHint: false };

server.registerTool(
  'get_config_reference',
  { title: '設定の書き方', description: 'config.yaml に書ける項目・型・初期値・説明の一覧（Markdown）。', annotations: readOnly },
  wrap(() => text(admin.reference())),
);

server.registerTool(
  'get_config',
  {
    title: '今の設定',
    description: 'path を省くと config.yaml 全体（YAML）を返す。path を指定すると、初期値で埋めた後の値（JSON）を返す。',
    inputSchema: { path: z.string().optional().describe(PATH_DESC) },
    annotations: readOnly,
  },
  wrap(({ path }) => {
    const r = admin.getConfig(path);
    const issues = [...r.errors.map((e) => `エラー: ${e}`), ...r.warnings.map((w) => `注意: ${w}`)].join('\n');
    const body = path ? JSON.stringify(r.value, null, 2) : r.yaml;
    return text(`${path ? `# ${path}` : `# ${r.path}`}\n${body}${issues ? `\n\n${issues}` : ''}`);
  }),
);

server.registerTool(
  'set_config',
  {
    title: '設定を変える',
    description: '指定した場所に値を入れて保存する（その場所の中身は置き換わる。ファイルのほかの部分とコメントはそのまま）。',
    inputSchema: {
      path: z.string().describe(PATH_DESC),
      value: z.any().describe('入れる値（文字・数値・真偽・配列・オブジェクト）'),
    },
  },
  wrap(({ path, value }) => saved(admin.setConfig(path, value))),
);

server.registerTool(
  'merge_config',
  {
    title: '設定を一部だけ変える',
    description: 'オブジェクトの指定したキーだけを変えて保存する。例: path "roulettes.reward", value { "style": "strip", "duration": 8 }。なければ新しく作る。',
    inputSchema: { path: z.string().describe(PATH_DESC), value: z.record(z.string(), z.any()) },
  },
  wrap(({ path, value }) => saved(admin.mergeConfig(path, value))),
);

server.registerTool(
  'delete_config',
  {
    title: '設定を消す',
    description: '指定した場所を消して保存する。例: "roulettes.old" でルーレットごと、"roulettes.main.items.3" で項目を1つ消す。',
    inputSchema: { path: z.string().describe(PATH_DESC) },
    annotations: { destructiveHint: true },
  },
  wrap(({ path }) => saved(admin.deleteConfig(path))),
);

server.registerTool(
  'replace_config',
  {
    title: '設定を丸ごと書き換える',
    description: 'config.yaml 全体を渡した YAML に置き換える。エラーがあれば保存しない。大きく作り直すとき用。',
    inputSchema: { yaml: z.string().describe('config.yaml の新しい中身') },
    annotations: { destructiveHint: true },
  },
  wrap(({ yaml }) => saved(admin.replaceConfig(yaml))),
);

server.registerTool(
  'validate_config',
  { title: '設定を検証', description: '今の config.yaml にエラーや使われない項目がないか調べる。', annotations: readOnly },
  wrap(() => {
    const r = admin.validate();
    return text(r.ok && !r.warnings.length ? '問題ありません' : admin.describeResult({ ...r, ok: undefined }));
  }),
);

server.registerTool(
  'list_widget_urls',
  {
    title: 'ウィジェットの URL',
    description: '設定にあるウィジェットごとに、OBS / TikTok LIVE Studio のブラウザソースに入れる URL と推奨サイズを返す。',
    annotations: readOnly,
  },
  wrap(() => {
    const { widgets, errors } = admin.widgetUrls();
    const lines = widgets.map((w) => `- ${w.title}: ${w.url}（幅 ${w.size[0]} × 高さ ${w.size[1]}）`);
    return text([...lines, ...errors.map((e) => `エラー: ${e}`)].join('\n') || 'ウィジェットの設定がありません');
  }),
);

server.registerTool('list_templates', {
  title: '配信テンプレート一覧',
  description: '選べる配信テンプレートを一覧にする。',
  annotations: readOnly,
}, wrap(() => templateCall('/api/templates')));

server.registerTool('preview_template', {
  title: '配信テンプレートの差分',
  description: 'テンプレートを入れたときの変更を見せる。設定は保存しない。',
  inputSchema: { id: z.string() },
  annotations: readOnly,
}, wrap(({ id }) => templateCall('/api/templates/preview', { id })));

server.registerTool('apply_template', {
  title: '配信テンプレートを入れる',
  description: '確認済みの配信テンプレートを入れる。',
  inputSchema: { id: z.string(), confirmLive: z.boolean().optional() },
}, wrap(({ id, confirmLive }) => templateCall('/api/templates/apply', { id, confirmLive })));

server.registerTool(
  'list_gifts',
  {
    title: 'ギフト一覧',
    description: 'テスト用のギフトと、サーバー起動中に実際の配信で届いたギフト（名前・コイン・画像）。ギフト名の指定に使う。',
    annotations: { readOnlyHint: true },
  },
  wrap(async () => {
    const { source, gifts } = await admin.gifts();
    const lines = gifts.map((g) => `- ${giftDisplayName(g)}（${g.diamonds} コイン${g.seen ? '・配信で受信' : ''}）${g.image ? ` ${g.image}` : ''}`);
    return text(`${source === 'demo' ? 'サーバーが起動していないので、テスト用の一覧だけです。\n' : ''}${lines.join('\n')}`);
  }),
);

server.registerTool(
  'list_media',
  {
    title: '画像一覧',
    description: 'media/ フォルダにある画像。ルーレットの項目の image に「media/ファイル名」で指定できる。',
    annotations: readOnly,
  },
  wrap(() => text(admin.media().join('\n') || 'media/ に画像はありません')),
);

server.registerTool(
  'add_media_from_url',
  {
    title: '画像を取り込む',
    description: 'URL の画像（png / jpg / gif / webp / svg、5MB まで）を media/ に保存し、image に書くパスを返す。',
    inputSchema: { url: z.string().url(), name: z.string().optional().describe('保存するファイル名（拡張子なし）') },
    annotations: { openWorldHint: true },
  },
  wrap(async ({ url, name }) => text(`保存しました: ${await admin.addMediaFromUrl(url, name)}`)),
);

server.registerTool(
  'test_event',
  {
    title: 'テスト送信',
    description:
      'ウィジェットにテストのイベントを送って動きを確かめる（サーバー起動中のみ）。' +
      'gift はギフト名とコインを指定でき、一覧にない名前でもルーレットの条件を確かめられる。',
    inputSchema: {
      kind: z.enum(['gift', 'like', 'follow', 'share', 'chat', 'viewers']),
      giftName: z.string().optional(),
      count: z.number().int().min(1).max(999).optional().describe('ギフトの個数・いいねの数'),
      diamonds: z.number().int().min(1).optional().describe('一覧にないギフト名のときの1個あたりのコイン'),
      user: z.string().optional().describe('送った人の名前'),
      viewers: z.number().int().min(0).optional(),
    },
    annotations: { openWorldHint: false },
  },
  wrap(async ({ kind, ...opts }) => text(await admin.testEvent(kind, opts))),
);

server.registerTool('obs', {
  title: 'OBS演出を試す',
  description: 'OBSブリッジに演出を試しに送る。',
  inputSchema: { rule: z.enum(['rainbow', 'gold', 'jackpot', 'slotBig', 'rushStart', 'rushEnd', 'bossDefeat', 'gachaTop']) },
}, wrap(async ({ rule }) => text(await admin.control('obs', 'test', { rule }))));

server.registerTool(
  'relay_stop',
  {
    title: 'リレー停止',
    description: 'スロットのリレー停止状態を見る。ギフトを送った人が3本を順番に止める。',
    inputSchema: { action: z.enum(['status']).default('status') },
    annotations: { readOnlyHint: true, openWorldHint: false },
  },
  wrap(async ({ action }) => text(await admin.relayStop(action))),
);

server.registerTool(
  'spin_roulette',
  {
    title: 'ルーレットを回す',
    description: 'ルーレットを回す（サーバー起動中のみ）。id を省くと表示中のルーレット。',
    inputSchema: { id: z.string().optional().describe('roulettes の名前') },
  },
  wrap(async ({ id }) => text(await admin.spinRoulette(id))),
);

server.registerTool(
  'peka',
  {
    title: '告知ランプ',
    description: '遅れて光る告知ランプの状態を見る、またはボーナス解決を伝える。',
    inputSchema: { action: z.enum(['status', 'bonusResolved']).default('status') },
  },
  wrap(async ({ action }) => text(await admin.peka(action))),
);

server.registerTool(
  'throne',
  { title: '王座を操作', description: '王座の状態を見る、終了時の称号を確定する、演出を止める、リセットする。', inputSchema: { action: z.enum(['status', 'finish', 'stop', 'reset']).default('status') } },
  wrap(async ({ action }) => text(await admin.throne(action))),
);

server.registerTool(
  'ootori',
  { title: '大トリ', description: 'ラスト10分の開始、終了、大トリの固定、リセットを操作する。', inputSchema: { action: z.enum(['status', 'start', 'finish', 'reset']).default('status') } },
  wrap(async ({ action }) => text(await admin.ootori(action))),
);

server.registerTool(
  'wins',
  {
    title: 'WIN数',
    description:
      'WIN 数（ゲームクリア回数）を変える・見る（サーバー起動中のみ）。win で +1、add で value を足す（-1 で減らす）、set で value にする、undo で1つ戻す、reset で 0 に戻す、status で今の数。id は wins の名前（省くと全部）。' +
      'ギフトで増減させたいときは set_config で wins.<名前>.rules を書く（例 [{gifts: [Lion], add: -1}]）。',
    inputSchema: {
      action: z.enum(['status', 'win', 'add', 'set', 'undo', 'reset']).default('status'),
      id: z.string().optional().describe('wins の名前'),
      value: z.number().int().optional().describe('add / set のときの数'),
    },
  },
  wrap(async ({ action, id, value }) => text(await admin.wins(action, id ?? null, value))),
);

server.registerTool(
  'timer',
  {
    title: '延長タイマー',
    description:
      '延長タイマー（配信の残り時間・サブアソン）を動かす・見る（サーバー起動中のみ）。start でスタート（止まっていれば再開）、pause で一時停止、toggle で切り替え、' +
      'add で seconds 秒を足す（マイナスで引く）、set で残りを seconds 秒にする、reset で初めの時間に戻してスタート前に、status で今の残り。id は timers の名前（省くと全部）。' +
      'ギフトで延びる量は set_config で timers.<名前> の coinSeconds / followSeconds / likeEvery / rules（例 [{gifts: [Galaxy], minutes: 10}]）を書く。',
    inputSchema: {
      action: z.enum(['status', 'start', 'pause', 'resume', 'toggle', 'add', 'set', 'reset']).default('status'),
      id: z.string().optional().describe('timers の名前'),
      seconds: z.number().optional().describe('add / set のときの秒数'),
    },
  },
  wrap(async ({ action, id, seconds }) => text(await admin.timer(action, id ?? null, seconds))),
);

server.registerTool(
  'boss',
  {
    title: 'ボス討伐',
    description:
      'ボス討伐の HP を変える・見る（サーバー起動中のみ）。damage で value のダメージ、defeat で今すぐ討伐、heal で HP を満タンに戻す、next で次のボス、set で HP を value にする、reset で1体目からやり直す、status で今の HP。id は bosses の名前（省くと全部）。' +
      'ボスの名前・HP・討伐で回すルーレットなどは set_config で bosses.<名前> に書く。',
    inputSchema: {
      action: z.enum(['status', 'damage', 'defeat', 'heal', 'next', 'set', 'reset']).default('status'),
      id: z.string().optional().describe('bosses の名前'),
      value: z.number().int().optional().describe('damage / set のときの数'),
    },
  },
  wrap(async ({ action, id, value }) => text(await admin.boss(action, id ?? null, value))),
);

server.registerTool(
  'vote',
  {
    title: 'コメント投票',
    description: 'コメントの番号投票を始める・締める・結果を出す・リセットする・状態を見る。id は votes の名前（省くと今の投票）。',
    inputSchema: {
      action: z.enum(['status', 'start', 'close', 'result', 'reset']).default('status'),
      id: z.string().optional().describe('votes の名前'),
      options: z.array(z.string()).optional().describe('start のときだけ使う今回の選択肢'),
      seconds: z.number().optional().describe('start のときだけ使う今回の秒数'),
    },
  },
  wrap(async ({ action, id, options, seconds }) => text(await admin.vote(action, id ?? null, { options, seconds }))),
);

server.registerTool(
  'cheer',
  {
    title: 'いいね応援ゲージ',
    description: 'いいね応援ゲージを足す・満タンにする・リセットする・状態を見る。',
    inputSchema: { action: z.enum(['status', 'add', 'fill', 'reset']).default('status'), id: z.string().optional().describe('cheers の名前'), value: z.number().optional().describe('add の数') },
  },
  wrap(async ({ action, id, value }) => text(await admin.cheer(action, id ?? null, value))),
);

server.registerTool(
  'rush',
  {
    title: 'RUSH',
    description: 'RUSH（確変）モードに入る・終わらせる・今の状態を見る（サーバー起動中のみ）。設定は config.yaml の rush。',
    inputSchema: { action: z.enum(['start', 'stop', 'status']).default('status').describe('start 突入 / stop 終了 / status 状態') },
  },
  wrap(async ({ action }) => text(await admin.rush(action))),
);

server.registerTool(
  'dareba',
  {
    title: 'ダレ場の小さな事件',
    description: 'ギフトの勢いが落ちたときの小さな事件を確認・開始・停止する。判定の数字は画面に出さず、状態はサーバーが持つ。',
    inputSchema: { action: z.enum(['status', 'start', 'stop']).default('status') },
  },
  wrap(async ({ action }) => text(await admin.dareba(action))),
);

server.registerTool(
  'push_button',
  {
    title: '押しボタン',
    description: '押しボタンを始める・締める・リセットする・状態を見る。',
    inputSchema: { action: z.enum(['status', 'start', 'finish', 'reset']).default('status'), id: z.string().optional(), seconds: z.number().optional() },
  },
  wrap(async ({ action, id, seconds }) => text(await admin.pushButton(action, id ?? null, { seconds }))),
);

server.registerTool(
  'stepup',
  {
    title: 'ステップアップ予告',
    description: 'ステップアップ予告を始める・止める・待機に戻す・見本を出す・状態を見る。',
    inputSchema: { action: z.enum(['start', 'stop', 'reset', 'demo', 'status']).default('status') },
  },
  wrap(async ({ action }) => text(await admin.stepup(action))),
);

server.registerTool(
  'swarm',
  {
    title: '群予告',
    description: '群予告の見本を出す・待機に戻す・状態を見る。',
    inputSchema: { action: z.enum(['trigger', 'reset', 'status']).default('status') },
  },
  wrap(async ({ action }) => text(await admin.swarm(action))),
);

server.registerTool(
  'list_superstream_actions',
  {
    title: 'SuperStream の演出一覧',
    description:
      'SuperStream（Minecraft のプラグイン）のプロフィールに設定済みの「ギフト ID → 演出」と、組み込みの演出の種類。' +
      'minecraft.rules やルーレットの項目の superstreamGift / superstreamAction を決めるのに使う。' +
      'minecraft.superstreamFile にプロフィールのファイルの場所が必要。',
    annotations: readOnly,
  },
  wrap(async () => {
    const r = await admin.superstream();
    const lines = [
      r.error ? `注意: ${r.error}` : `プロフィール: ${r.profile}（${r.file}）${r.tiktokUsername ? ` TikTok: @${r.tiktokUsername}` : ''}`,
      `config の superstreamProfile: ${r.configuredProfile}`,
      ...r.gifts.map((g) => `- ギフト ${g.id}${g.name ? `（${giftDisplayName({ id: g.id, name: g.name })}）` : ''}: ${g.actions.join(', ') || '演出なし'}`),
      '',
      `組み込みの演出（superstreamAction に書ける種類）: ${r.actions.join(', ')}`,
    ];
    return text(lines.join('\n'));
  }),
);

server.registerTool(
  'minecraft_command',
  {
    title: 'Minecraft にコマンドを送る',
    description: 'RCON で Minecraft サーバーにコマンドを1つ送り、返事を返す（サーバー起動中・minecraft.enabled が必要）。接続の確認や SuperStream の演出の試し打ちに。',
    inputSchema: { command: z.string().describe('例: "list" / "ss status" / "ss test action default_profile lightning"') },
    annotations: { openWorldHint: true },
  },
  wrap(async ({ command }) => text((await admin.minecraftCommand(command)) || '（返事なし）')),
);

server.registerTool(
  'get_history',
  {
    title: '配信の履歴',
    description: 'id を省くと過去の配信の一覧（日時・長さ・コイン・フォロー・最大視聴者）。id を指定すると1回分の詳細（1分ごとの推移・ギフトを送った人・ギフトの種類・ルーレットの結果）。',
    inputSchema: { id: z.string().optional() },
    annotations: { readOnlyHint: true },
  },
  wrap(async ({ id }) => text(await admin.history(id))),
);

server.registerTool(
  'get_status',
  { title: '接続状態と集計', description: 'TikTok との接続状態と、いいね・視聴者・コインなどの集計（サーバー起動中のみ）。', annotations: { readOnlyHint: true } },
  wrap(async () => {
    const { status, state } = await admin.status();
    const { topGifters, ...counts } = state;
    return text({ status, counts, topGifters: topGifters.slice(0, 5).map((g) => ({ name: g.user.name, coins: g.diamonds })) });
  }),
);

}

if (remote) {
  registerAiTools(
    server,
    (tool, args) => callAiHttp(process.env.TW_SERVER, process.env.TW_AI_TOKEN, tool, args),
    { isDevelopment: () => isDevelopmentServer(process.env.TW_SERVER) },
  );
}

await server.connect(new StdioServerTransport());
