#!/usr/bin/env node
// AI から設定を変えるための MCP サーバー（stdio）。
// 登録例（Claude Code）: claude mcp add tiktok-widget -- node /path/to/tiktok-widget/mcp/server.js

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import * as admin from '../src/admin.js';

const server = new McpServer(
  { name: 'tiktok-widget', version: '0.2.0' },
  {
    instructions: [
      'TikTok LIVE 配信用ウィジェット（ギフト通知・ギフト瓶・ルーレット・目標バー・カウンター）の設定を扱う。',
      '設定は config.yaml。書き換えると開いているウィジェットに自動で反映される。',
      '初めて使うときは get_config_reference で書き方を確認してから、get_config で今の設定を見ること。',
      '小さな変更は set_config / merge_config（コメントが残る）、大きな作り直しは replace_config を使う。',
      '保存前に検証され、エラーがあれば保存されずに理由が返るので、それを直して再度呼ぶ。',
      '変えたら test_event や spin_roulette で動きを確かめ、list_widget_urls で OBS に入れる URL を伝える。',
    ].join('\n'),
  },
);

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

server.registerTool(
  'list_gifts',
  {
    title: 'ギフト一覧',
    description: 'テスト用のギフトと、サーバー起動中に実際の配信で届いたギフト（名前・コイン・画像）。ギフト名の指定に使う。',
    annotations: { readOnlyHint: true },
  },
  wrap(async () => {
    const { source, gifts } = await admin.gifts();
    const lines = gifts.map((g) => `- ${g.name}（${g.diamonds} コイン${g.seen ? '・配信で受信' : ''}）${g.image ? ` ${g.image}` : ''}`);
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
  'get_status',
  { title: '接続状態と集計', description: 'TikTok との接続状態と、いいね・視聴者・コインなどの集計（サーバー起動中のみ）。', annotations: { readOnlyHint: true } },
  wrap(async () => {
    const { status, state } = await admin.status();
    const { topGifters, ...counts } = state;
    return text({ status, counts, topGifters: topGifters.slice(0, 5).map((g) => ({ name: g.user.name, coins: g.diamonds })) });
  }),
);

await server.connect(new StdioServerTransport());
