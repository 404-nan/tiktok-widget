// AI 用の MCP。stdio（TW_AI_TOKEN と TW_SERVER があるとき）と、開発環境の /ai/mcp で同じ道具を出す。
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { z } from 'zod';
import { reference } from './config.js';
import { AI_ROUTES } from './ai-api.js';
import { isDevEnv } from './env.js';

export const AI_MCP_INSTRUCTIONS = [
  'TikTok LIVE 配信用ウィジェットの設定を、サーバーの AI 用 API 経由で扱う。',
  'まず dry-run で差分を確認してから保存する。',
  '配信中は変更不可。配信が live または接続中のときは、書き込みも操作も拒否される（dry-run と読み取りはできる）。',
  '課金は申請だけ。反映は管理画面で人が承認したときだけ。課金のスイッチ、API キー、4桁の数字、接続は変更できない。',
  '接続・切断・再起動・トークンの発行・配信者の削除はできない。',
].join('\n');

const PATH_DESC = 'ドット区切りの場所。例: "roulettes.punishment.gifts" / "theme.accent"';
const readOnly = { readOnlyHint: true, openWorldHint: false };
const text = (value) => ({ content: [{ type: 'text', text: typeof value === 'string' ? value : JSON.stringify(value, null, 2) }] });

const ROUTE_BY_TOOL = Object.fromEntries(AI_ROUTES.map((route) => [route.tool, route]));

export async function callAiHttp(server, token, tool, args = {}) {
  const route = ROUTE_BY_TOOL[tool];
  if (!route) throw new Error('その操作はありません');
  const payload = { ...(args ?? {}) };
  if (!payload.tenant && process.env.TW_AI_TENANT) payload.tenant = process.env.TW_AI_TENANT;
  const base = String(server ?? '').replace(/\/$/, '');
  const url = new URL(`${base}/ai/v1${route.path}`);
  const headers = { authorization: `Bearer ${token}` };
  let body;
  if (route.method === 'GET') {
    for (const [key, value] of Object.entries(payload)) {
      if (value == null) continue;
      url.searchParams.set(key, typeof value === 'string' ? value : JSON.stringify(value));
    }
  } else {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(payload);
  }
  let res;
  try {
    res = await fetch(url, { method: route.method, headers, body });
  } catch {
    throw new Error(`サーバー（${base}）に接続できません`);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok && res.status !== 202) {
    const err = new Error(data.error || `HTTP ${res.status}`);
    err.data = data;
    throw err;
  }
  return data;
}

export function registerAiTools(server, call) {
  const wrap = (fn) => async (args) => {
    try {
      return await fn(args ?? {});
    } catch (err) {
      return { content: [{ type: 'text', text: `失敗しました: ${err.message ?? err}` }], isError: true };
    }
  };
  const shown = (data) => text(data?.error ? data : data);

  server.registerTool('get_config_reference', {
    title: '設定の書き方',
    description: 'config.yaml に書ける項目・型・初期値・説明の一覧（Markdown）。',
    annotations: readOnly,
  }, wrap(() => text(reference())));

  server.registerTool('get_config', {
    title: '今の設定',
    description: 'path を省くと今の設定（パスワードは除く）を返す。path を指定するとその場所の値を返す。',
    inputSchema: { path: z.string().optional().describe(PATH_DESC), tenant: z.string().optional().describe('配信者の id') },
    annotations: readOnly,
  }, wrap(async (args) => shown(await call('get_config', args))));

  server.registerTool('validate_config', {
    title: '設定を検証',
    description: '今の設定にエラーや使われない項目がないか調べる。保存はしない。',
    inputSchema: { tenant: z.string().optional() },
    annotations: readOnly,
  }, wrap(async (args) => shown(await call('validate_config', args))));

  const dry = {
    dryRun: z.boolean().optional().describe('true なら差分と検証だけ返し、保存しない'),
    baseVersion: z.string().optional().describe('本番で保存するとき、直前に読んだ configVersion'),
    tenant: z.string().optional().describe('配信者の id'),
  };
  server.registerTool('set_config', {
    title: '設定を変える',
    description: '指定した場所に値を入れる。まず dryRun を true にすること。配信中は保存できない。課金は申請だけ。',
    inputSchema: { path: z.string().describe(PATH_DESC), value: z.any().describe('入れる値'), ...dry },
  }, wrap(async (args) => shown(await call('set_config', args))));

  server.registerTool('merge_config', {
    title: '設定を一部だけ変える',
    description: 'オブジェクトの指定したキーだけを変える。まず dryRun を true にすること。配信中は保存できない。',
    inputSchema: { path: z.string().describe(PATH_DESC), value: z.record(z.string(), z.any()), ...dry },
  }, wrap(async (args) => shown(await call('merge_config', args))));

  server.registerTool('delete_config', {
    title: '設定を消す',
    description: '指定した場所を消す。まず dryRun を true にすること。配信中は保存できない。',
    inputSchema: { path: z.string().describe(PATH_DESC), ...dry },
    annotations: { destructiveHint: true },
  }, wrap(async (args) => shown(await call('delete_config', args))));

  server.registerTool('dry_run', {
    title: '保存せずに差分を見る',
    description: '設定の変更を保存せず、差分・検証結果・配信中か・configVersion を返す。まずこれを使う。',
    inputSchema: {
      op: z.enum(['set', 'merge', 'delete']).describe('set / merge / delete'),
      path: z.string().describe(PATH_DESC),
      value: z.any().optional(),
      tenant: z.string().optional(),
    },
    annotations: readOnly,
  }, wrap(async ({ op, path, value, tenant }) => shown(await call(op === 'merge' ? 'merge_config' : op === 'delete' ? 'delete_config' : 'set_config', { path, value, tenant, dryRun: true }))));

  server.registerTool('undo', {
    title: '変更を元に戻す',
    description: 'changeId の変更を戻す。今の値が変更後のままのときだけ。ルーレットを回すなどの操作は取り消せない。',
    inputSchema: { changeId: z.string(), tenant: z.string().optional() },
  }, wrap(async (args) => shown(await call('undo', args))));

  server.registerTool('list_changes', {
    title: '戻せる変更',
    description: 'この配信者に残っている変更の一覧（新しい順、最大50件）。',
    inputSchema: { tenant: z.string().optional() },
    annotations: readOnly,
  }, wrap(async (args) => shown(await call('list_changes', args))));

  server.registerTool('request_billing_change', {
    title: '課金の変更を申請する',
    description: '課金の変更は申請だけ。承認待ちになり、管理画面で人が承認するまで反映しない。課金のスイッチは申請できない。',
    inputSchema: {
      path: z.string().describe('例: billing.plan / billing.paidUntil'),
      value: z.any().optional(),
      op: z.enum(['set', 'merge', 'delete']).optional(),
      tenant: z.string().optional(),
    },
  }, wrap(async (args) => shown(await call('request_billing_change', args))));

  server.registerTool('list_widget_urls', {
    title: 'ウィジェットの URL',
    description: 'OBS に入れる URL と推奨サイズ。',
    inputSchema: { tenant: z.string().optional() },
    annotations: readOnly,
  }, wrap(async (args) => shown(await call('list_widget_urls', args))));

  server.registerTool('list_gifts', {
    title: 'ギフト一覧',
    description: 'ギフトの名前・コイン・画像。画面の名前は日本語の対応表から引く。',
    inputSchema: { tenant: z.string().optional() },
    annotations: readOnly,
  }, wrap(async (args) => shown(await call('list_gifts', args))));

  server.registerTool('get_history', {
    title: '配信の履歴',
    description: 'id を省くと過去の配信の一覧。id を指定すると1回分。',
    inputSchema: { id: z.string().optional(), tenant: z.string().optional() },
    annotations: readOnly,
  }, wrap(async (args) => shown(await call('get_history', args))));

  server.registerTool('get_status', {
    title: '接続状態と集計',
    description: 'TikTok との接続状態と、いいね・視聴者・コインなどの集計。',
    inputSchema: { tenant: z.string().optional() },
    annotations: readOnly,
  }, wrap(async (args) => shown(await call('get_status', args))));

  server.registerTool('test_event', {
    title: 'テスト送信',
    description: 'ウィジェットにテストのイベントを送る。開発環境でだけ使える。',
    inputSchema: {
      kind: z.enum(['gift', 'like', 'follow', 'share', 'chat', 'viewers']),
      giftName: z.string().optional(),
      count: z.number().int().min(1).max(999).optional(),
      diamonds: z.number().int().min(1).optional(),
      user: z.string().optional(),
      viewers: z.number().int().min(0).optional(),
      tenant: z.string().optional(),
    },
  }, wrap(async (args) => shown(await call('test_event', args))));

  server.registerTool('spin_roulette', {
    title: 'ルーレットを回す',
    description: 'ルーレットを回す。配信中の本番では拒否される。この操作は取り消せない。',
    inputSchema: { id: z.string().optional(), dryRun: z.boolean().optional(), tenant: z.string().optional() },
  }, wrap(async (args) => shown(await call('spin_roulette', args))));

  server.registerTool('wins', {
    title: 'WIN数',
    description: 'WIN 数を変える・見る。status で今の数。配信中の本番では変更できない。',
    inputSchema: {
      action: z.enum(['status', 'win', 'add', 'set', 'undo', 'reset']).default('status'),
      id: z.string().optional(),
      value: z.number().int().optional(),
      dryRun: z.boolean().optional(),
      tenant: z.string().optional(),
    },
  }, wrap(async (args) => shown(await call('wins', args))));

  server.registerTool('timer', {
    title: '延長タイマー',
    description: '延長タイマーを動かす・見る。配信中の本番では変更できない。',
    inputSchema: {
      action: z.enum(['status', 'start', 'pause', 'resume', 'toggle', 'add', 'set', 'reset']).default('status'),
      id: z.string().optional(),
      seconds: z.number().optional(),
      dryRun: z.boolean().optional(),
      tenant: z.string().optional(),
    },
  }, wrap(async (args) => shown(await call('timer', args))));

  server.registerTool('boss', {
    title: 'ボス討伐',
    description: 'ボス討伐の HP を変える・見る。配信中の本番では変更できない。',
    inputSchema: {
      action: z.enum(['status', 'damage', 'defeat', 'heal', 'next', 'set', 'reset']).default('status'),
      id: z.string().optional(),
      value: z.number().int().optional(),
      dryRun: z.boolean().optional(),
      tenant: z.string().optional(),
    },
  }, wrap(async (args) => shown(await call('boss', args))));

  server.registerTool('rush', {
    title: 'RUSH',
    description: 'RUSH（確変）に入る・終わらせる・状態を見る。配信中の本番では変更できない。',
    inputSchema: {
      action: z.enum(['start', 'stop', 'status']).default('status'),
      dryRun: z.boolean().optional(),
      tenant: z.string().optional(),
    },
  }, wrap(async (args) => shown(await call('rush', args))));
}

export function createAiMcpHandler(control) {
  return async (req, res) => {
    if (!isDevEnv(req)) {
      res.status(404).json({ error: 'この入口は開発環境でだけ開きます' });
      return;
    }
    const header = req.get('authorization') || '';
    const matched = header.match(/^Bearer\s+(\S+)\s*$/i);
    if (!matched) {
      res.status(401).json({ error: 'トークンが違います' });
      return;
    }
    const auth = control.tokens.authenticate(matched[1]);
    if (!auth) {
      res.status(401).json({ error: 'トークンが違います' });
      return;
    }
    if (auth.expired) {
      res.status(401).json({ error: 'トークンの期限が切れています' });
      return;
    }
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST で送ってください' });
      return;
    }
    const mcp = new McpServer(
      { name: 'tiktok-widget', version: '0.2.0' },
      { instructions: AI_MCP_INSTRUCTIONS },
    );
    registerAiTools(mcp, async (tool, args) => {
      const result = await control.dispatch(auth.token, tool, args ?? {}, { req, tokenValue: matched[1] });
      if (result.status >= 400) {
        const err = new Error(result.body?.error || `HTTP ${result.status}`);
        err.data = result.body;
        throw err;
      }
      return result.body;
    });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try {
      await mcp.connect(transport);
      await transport.handleRequest(req, res, req.body);
      res.on('close', () => {
        transport.close().catch(() => {});
        mcp.close().catch(() => {});
      });
    } catch {
      if (!res.headersSent) res.status(500).json({ error: 'MCP で失敗しました' });
    }
  };
}
