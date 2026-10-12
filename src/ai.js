// 「AI にたのむ」: 配信者の文章のたのみを、設定の変更案にする（Claude API）。
// ここでは案を作るだけで、設定は書き換えない。反映は配信者が案を見てから（src/runtime.js の /api/ai/apply）。
// キー・モデル・1日の回数は管理画面で決め、data/ai.json に残す（環境変数 TW_AI_KEY / TW_AI_MODEL でも指定できる）。

import fs from 'node:fs';
import path from 'node:path';
import * as cfg from './config.js';
import { SCHEMA, SECTIONS } from './schema.js';

export const AI_MODELS = ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'];
const DEFAULT_MODEL = 'claude-opus-5-5';
const DEFAULT_LIMIT = 20;
export const MAX_REQUEST_CHARS = 600;
const MAX_CHANGES = 30;

// Claude の SDK は、AI を初めて使うときに読み込む。
// （更新したあと npm ci をし忘れて部品がなくても、サーバーは起動でき、AI だけが使えない状態になる）
let sdk = null;
async function loadSdk() {
  if (sdk) return sdk;
  let Anthropic, z, zodOutputFormat;
  try {
    [{ default: Anthropic }, { z }, { zodOutputFormat }] = await Promise.all([import('@anthropic-ai/sdk'), import('zod'), import('@anthropic-ai/sdk/helpers/zod')]);
  } catch {
    throw new Error('AI の部品が入っていません（管理者に伝えてください。サーバーのフォルダで npm ci を実行すると入ります）');
  }
  // AI に返してもらう形。value は何でも入るので、JSON の文字で受け取る
  const Proposal = z.object({
    reply: z.string().describe('配信者に見せる短い説明（やさしい日本語。何をどう変えるか。できないときはその理由や聞きたいこと）'),
    changes: z.array(
      z.object({
        op: z.enum(['set', 'merge', 'delete']).describe('set: その場所の値を入れ替える / merge: 書いた項目だけ変える / delete: 消す'),
        path: z.string().describe('変える場所。ドット区切り（例: roulettes.batsu / wins.default.rules / theme.accent）'),
        value_json: z.string().describe('入れる値を JSON の文字で（例: "[\\"歌う*2\\",\\"変顔\\"]" や "{\\"goal\\":10}"）。delete のときは空の文字'),
        label: z.string().describe('この変更のひと言の説明（やさしい日本語。例: ルーレット「罰ゲーム」を作る）'),
      }),
    ),
  });
  sdk = { Anthropic, format: zodOutputFormat(Proposal) };
  return sdk;
}

const INSTRUCTIONS = `あなたは、TikTok LIVE の配信者が使う「配信画面のウィジェット」の設定を手伝うアシスタントです。
配信者は設定ファイルや専門用語を知りません。配信者のたのみを読み、設定をどう変えればよいかを changes に入れて返してください。
返したものは、配信者が内容を確かめてから設定に反映されます。

考え方:
- たのまれたところだけを変えます。今の設定のほかの部分は、そのまま残します。
- 1つの項目だけ変えるときは merge を使うか、その項目までの path を set します。一覧（items や rules）は、残したいものも含めた全体を set します。
- 「名前: { ... }」の形のセクション（roulettes や wins など）に新しく作るときは、名前を英数字と - _ で付けます（例: roulettes.batsu）。配信者に見せる名前は name や title に日本語で入れます。
- ギフトの名前は TikTok の英語名で書きます（Rose、Lion、Galaxy など）。配信者がカタカナで言ったら英語名に直します。知らないギフト名は、そのまま使ってかまいません。
- 色は #RRGGBB か、テーマの色の名前（accent / gold / ink / ink-2 / paper）で書きます。
- minecraft のアドレス・ポート・パスワード・連携のオン/オフは変えられません（minecraft.rules だけ変えられます）。
- たのみがあいまいなときは、いちばん自然な解釈で案を作り、どう解釈したかを reply に書きます。設定ではできないことをたのまれたら、changes を空にして、できない理由と近い方法を reply に書きます。
- reply と label は、やさしい日本語で短く書きます。設定の項目名（英字）は、どうしても必要なとき以外は出しません。

下は、設定に書ける項目の一覧です。ここにない項目は使えません。

`;

/** AI に渡す今の設定（パスワードなどは抜く） */
const safeConfig = (config) => cfg.publicConfig(config);

/**
 * AI が返した変更・画面から戻ってきた変更を確かめて、設定に当てられる形にする。
 * だめなものがあれば errors に理由を入れる。
 */
export function checkChanges(raw) {
  const errors = [];
  const changes = [];
  if (!Array.isArray(raw)) return { changes, errors: ['変更の一覧がありません'] };
  if (raw.length > MAX_CHANGES) return { changes, errors: [`一度に変えられるのは ${MAX_CHANGES} か所までです`] };
  for (const c of raw) {
    const p = String(c?.path ?? '').trim();
    const keys = cfg.toPath(p);
    const op = c?.op;
    if (!['set', 'merge', 'delete'].includes(op) || !keys.length) {
      errors.push(`変更の形が正しくありません（${p || '場所なし'}）`);
      continue;
    }
    if (!SECTIONS.includes(keys[0])) {
      errors.push(`${p}: そのセクションはありません`);
      continue;
    }
    if (keys[0] === 'minecraft' && keys[1] !== 'rules') {
      errors.push('Minecraft のアドレスやパスワード、連携のオン/オフは AI では変えられません（「くわしく」の Minecraft 連携で設定してください）');
      continue;
    }
    // 「名前: { ... }」のセクションを丸ごと入れ替える・消すのは止める（ほかの設定を消してしまうので）
    if (keys.length === 1 && (op === 'delete' || (op === 'set' && SCHEMA[keys[0]].kind === 'map'))) {
      errors.push(`${p}: セクションを丸ごと入れ替えることはできません`);
      continue;
    }
    let value = c.value;
    if (op !== 'delete' && value === undefined && typeof c.value_json === 'string') {
      try {
        value = JSON.parse(c.value_json);
      } catch {
        errors.push(`${p}: 値を読めませんでした`);
        continue;
      }
    }
    if (op !== 'delete' && value === undefined) {
      errors.push(`${p}: 入れる値がありません`);
      continue;
    }
    changes.push({ op, path: keys.join('.'), ...(op === 'delete' ? {} : { value }), label: String(c.label ?? '').slice(0, 120) || keys.join('.') });
  }
  return { changes, errors };
}

/** たのみの文と今の設定から、AI に送る文を作る */
export function buildRequest({ text, config, focus, gifts = [] }) {
  const lines = ['今の設定（JSON。パスワードなどは抜いてあります）:', '<config>', JSON.stringify(safeConfig(config)), '</config>'];
  if (focus?.section) lines.push(`配信者がいま開いているところ: ${[focus.section, focus.id].filter(Boolean).join('.')}（「これ」「この」はここを指すことが多い）`);
  if (gifts.length) lines.push(`この配信者が知っているギフト（名前と1個のコイン）: ${gifts.map((g) => `${g.name}(${g.diamonds})`).join(', ')}`);
  lines.push('配信者のたのみ:', '<request>', text, '</request>');
  return lines.join('\n');
}

// API のエラーを、配信者に見せる文にする
function describeError(err, Anthropic) {
  if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) return 'AI のキーが正しくないようです（管理者に伝えてください）';
  if (err instanceof Anthropic.RateLimitError) return 'AI が混み合っています。少し待ってから、もう一度たのんでください';
  if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) return `AI への頼み方に問題がありました（管理者に伝えてください）: ${err.message}`;
  if (err instanceof Anthropic.APIConnectionError) return 'AI につながりませんでした。少し待ってから、もう一度たのんでください';
  if (err instanceof Anthropic.APIError) return `AI でエラーになりました（${err.status ?? '不明'}）。少し待ってから、もう一度たのんでください`;
  return `AI でエラーになりました: ${err?.message ?? err}`;
}

/**
 * dir: data/ の場所。makeClient はテスト用（にせの AI を入れる）。
 */
export function createAi({ dir, makeClient = (apiKey, Anthropic) => new Anthropic({ apiKey, maxRetries: 1 }) }) {
  const file = path.join(dir, 'ai.json');
  const env = { key: (process.env.TW_AI_KEY || '').trim(), model: (process.env.TW_AI_MODEL || '').trim() };
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8')) ?? {};
  } catch {}
  let client = null;
  let clientKey = null;

  const key = () => saved.key || env.key;
  const model = () => (AI_MODELS.includes(saved.model) ? saved.model : AI_MODELS.includes(env.model) ? env.model : DEFAULT_MODEL);
  const dailyLimit = () => (Number.isInteger(saved.dailyLimit) && saved.dailyLimit >= 0 ? saved.dailyLimit : DEFAULT_LIMIT);

  // 設定に書ける項目の一覧は変わらないので、先頭に固めて置く（同じ部分は安く読まれる）
  let system = null;
  const systemBlocks = () => (system ??= [{ type: 'text', text: INSTRUCTIONS + cfg.reference(), cache_control: { type: 'ephemeral' } }]);

  return {
    /** 管理画面に見せる状態（キーそのものは返さない） */
    state() {
      const k = key();
      return { set: !!k, source: saved.key ? 'admin' : env.key ? 'env' : null, tail: k.length >= 12 ? k.slice(-4) : '', model: model(), models: AI_MODELS, dailyLimit: dailyLimit() };
    },
    get ready() {
      return !!key();
    },
    get dailyLimit() {
      return dailyLimit();
    },
    /** 管理画面から: { key?（空の文字で消す）, model?, dailyLimit? }。書いたものだけ変える */
    update(body = {}) {
      const next = { ...saved };
      if (body.key !== undefined) {
        const k = String(body.key ?? '').trim();
        if (k.length > 300 || /[^\x21-\x7e]/.test(k)) throw new Error('キーの形が正しくありません（空白や日本語が混ざっていないか確かめてください）');
        if (k) next.key = k;
        else delete next.key;
      }
      if (body.model !== undefined) {
        if (!AI_MODELS.includes(body.model)) throw new Error(`モデルは ${AI_MODELS.join(' / ')} から選んでください`);
        next.model = body.model;
      }
      if (body.dailyLimit !== undefined) {
        const n = Number(body.dailyLimit);
        if (!Number.isInteger(n) || n < 0 || n > 1000) throw new Error('1日の回数は 0〜1000 で決めてください');
        next.dailyLimit = n;
      }
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      fs.chmodSync(file, 0o600);
      saved = next;
      return this.state();
    },
    /**
     * たのみから変更案を作る。{ reply, changes: [{ op, path, value, label }], errors } を返す。
     * 設定は書き換えない。AI を呼べなかったときは、配信者に見せる文でエラーを投げる。
     */
    async ask({ text, config, focus, gifts }) {
      const k = key();
      if (!k) throw new Error('AI はまだ使えません（管理者がキーを入れると使えます）');
      const { Anthropic, format } = await loadSdk();
      if (!client || clientKey !== k) {
        client = makeClient(k, Anthropic);
        clientKey = k;
      }
      const m = model();
      let response;
      try {
        response = await client.messages.parse({
          model: m,
          max_tokens: 16000,
          system: systemBlocks(),
          messages: [{ role: 'user', content: buildRequest({ text, config, focus, gifts }) }],
          // Haiku 4.5 は effort を受け付けない
          output_config: { ...(m === 'claude-haiku-4-5' ? {} : { effort: 'medium' }), format },
        });
      } catch (err) {
        console.warn(`[ai] ${err?.status ?? ''} ${err?.message ?? err}`);
        throw new Error(describeError(err, Anthropic));
      }
      if (response.stop_reason === 'refusal') throw new Error('AI がこのたのみには答えられませんでした。言い方を変えて、もう一度たのんでください');
      if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new Error('AI の返事を最後まで受け取れませんでした。たのみを短く分けて、もう一度たのんでください');
      const out = response.parsed_output;
      const { changes, errors } = checkChanges(out.changes);
      return { reply: String(out.reply ?? ''), changes, errors, usage: response.usage ?? null };
    },
  };
}
