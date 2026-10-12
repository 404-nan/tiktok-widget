// 「AI にたのむ」: 配信者の文章のたのみを、設定の変更案にする。
// ここでは案を作るだけで、設定は書き換えない。反映は配信者が案を見てから（src/runtime.js の /api/ai/apply）。
// AI への指示（システムプロンプト）は src/ai-prompt.js。
// どの AI を使うか・キー・モデル・1日の回数・追加の指示は管理画面で決め、data/ai.json に残す
// （環境変数 TW_AI_PROVIDER / TW_AI_KEY / TW_AI_MODEL / TW_AI_BASE_URL でも指定できる）。

import fs from 'node:fs';
import path from 'node:path';
import * as cfg from './config.js';
import { SCHEMA, SECTIONS } from './schema.js';
import { buildSystem } from './ai-prompt.js';

// 使える AI。kind: 'claude' は Anthropic の SDK、'openai' は OpenAI と同じ形の API（chat/completions）
export const AI_PROVIDERS = {
  claude: { kind: 'claude', label: 'Claude（Anthropic）', models: ['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-4-5'], model: 'claude-opus-5-5' },
  spacebunny: { kind: 'openai', label: 'Space Bunny', baseUrl: 'https://spacebunnymodel.com/api/v1', model: 'space-bunny-alpha' },
  openai: { kind: 'openai', label: 'そのほか（OpenAI と同じ形の API）', baseUrl: '', model: '' },
};
export const AI_MODELS = AI_PROVIDERS.claude.models;
const DEFAULT_LIMIT = 20;
export const MAX_REQUEST_CHARS = 600;
const MAX_CHANGES = 30;
const MAX_EXTRA_CHARS = 2000;

// Claude の SDK は、Claude を初めて使うときに読み込む。
// （更新したあと npm ci をし忘れて部品がなくても、サーバーは起動でき、Claude だけが使えない状態になる）
let sdk = null;
async function loadSdk() {
  if (sdk) return sdk;
  let Anthropic, z, zodOutputFormat;
  try {
    [{ default: Anthropic }, { z }, { zodOutputFormat }] = await Promise.all([import('@anthropic-ai/sdk'), import('zod'), import('@anthropic-ai/sdk/helpers/zod')]);
  } catch {
    throw new Error('AI の部品が入っていません（管理者に伝えてください。サーバーのフォルダで npm ci を実行すると入ります）');
  }
  // 返してもらう形。value は何でも入るので、JSON の文字で受け取る
  const Proposal = z.object({
    reply: z.string().describe('配信者に見せる説明（やさしい日本語で 1〜3 文）'),
    changes: z.array(
      z.object({
        op: z.enum(['set', 'merge', 'delete']),
        path: z.string().describe('変える場所。ドット区切り'),
        value_json: z.string().describe('入れる値を JSON の文字で。delete のときは空の文字'),
        label: z.string().describe('この変更のひと言の説明（やさしい日本語）'),
      }),
    ),
  });
  sdk = { Anthropic, format: zodOutputFormat(Proposal) };
  return sdk;
}

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
      errors.push('Minecraft のアドレスやパスワード、連携のオン/オフは AI では変えられません（「くわしく」のマイクラ連携で設定してください）');
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
    changes.push({ op, path: keys.join('.'), ...(op === 'delete' ? {} : { value }), label: String(c.label ?? '').trim().slice(0, 120) || `${SCHEMA[keys[0]].title}の設定を変える` });
  }
  return { changes, errors };
}

/** たのみの文と今の設定から、AI に送る文を作る（パスワードなどは抜く） */
export function buildRequest({ text, config, focus, gifts = [] }) {
  const lines = ['今の設定（JSON。パスワードなどは抜いてあります）:', '<config>', JSON.stringify(cfg.publicConfig(config)), '</config>'];
  if (focus?.section) lines.push(`配信者がいま開いているウィジェット: ${[focus.section, focus.id].filter(Boolean).join('.')}`);
  if (gifts.length) lines.push(`配信者が知っているギフト（名前と1個のコイン）: ${gifts.map((g) => `${g.name}(${g.diamonds})`).join(', ')}`);
  lines.push('配信者のたのみ:', '<request>', text, '</request>');
  return lines.join('\n');
}

/** AI の返事の文から JSON を取り出す（前後に文章や ``` が付いていても読む） */
export function parseReply(content) {
  const text = String(content ?? '');
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    const out = JSON.parse(text.slice(start, end + 1));
    return out && typeof out === 'object' && !Array.isArray(out) ? out : null;
  } catch {
    return null;
  }
}

// --- Claude（Anthropic の SDK） ---

async function askClaude({ key, model, system, messages, makeClient }) {
  const { Anthropic, format } = await loadSdk();
  const client = makeClient(key, Anthropic);
  let response;
  try {
    response = await client.messages.parse({
      model,
      max_tokens: 16000,
      // 指示と項目の一覧は変わらないので、先頭に固めて置く（同じ部分は安く読まれる）
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      messages,
      // Haiku 4.5 は effort を受け付けない
      output_config: { ...(model === 'claude-haiku-4-5' ? {} : { effort: 'medium' }), format },
    });
  } catch (err) {
    console.warn(`[ai] ${err?.status ?? ''} ${err?.message ?? err}`);
    if (err instanceof Anthropic.AuthenticationError || err instanceof Anthropic.PermissionDeniedError) throw new Error('AI のキーが正しくないようです（管理者に伝えてください）');
    if (err instanceof Anthropic.RateLimitError) throw new Error('AI が混み合っています。少し待ってから、もう一度たのんでください');
    if (err instanceof Anthropic.BadRequestError || err instanceof Anthropic.NotFoundError) throw new Error(`AI への頼み方に問題がありました（管理者に伝えてください）: ${err.message}`);
    if (err instanceof Anthropic.APIConnectionError) throw new Error('AI につながりませんでした。少し待ってから、もう一度たのんでください');
    if (err instanceof Anthropic.APIError) throw new Error(`AI でエラーになりました（${err.status ?? '不明'}）。少し待ってから、もう一度たのんでください`);
    throw new Error(`AI でエラーになりました: ${err?.message ?? err}`);
  }
  if (response.stop_reason === 'refusal') throw new Error('AI がこのたのみには答えられませんでした。言い方を変えて、もう一度たのんでください');
  if (response.stop_reason === 'max_tokens' || !response.parsed_output) throw new Error('AI の返事を最後まで受け取れませんでした。たのみを短く分けて、もう一度たのんでください');
  return response.parsed_output;
}

// --- OpenAI と同じ形の API（Space Bunny など） ---

async function askOpenAi({ key, model, baseUrl, system, messages, fetchImpl = fetch }) {
  const call = async (jsonMode) => {
    let res;
    try {
      res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          model,
          max_tokens: 4000,
          temperature: 0,
          ...(jsonMode ? { response_format: { type: 'json_object' } } : {}),
          messages: [{ role: 'system', content: system }, ...messages],
        }),
        signal: AbortSignal.timeout(90_000),
      });
    } catch (err) {
      console.warn(`[ai] ${err?.message ?? err}`);
      throw new Error('AI につながりませんでした。少し待ってから、もう一度たのんでください');
    }
    const data = await res.json().catch(() => ({}));
    return { res, data };
  };
  let { res, data } = await call(true);
  // JSON で返す指定（response_format）を知らない API なら、指定なしでもう一度
  if (res.status === 400) ({ res, data } = await call(false));
  if (!res.ok) {
    console.warn(`[ai] ${res.status} ${JSON.stringify(data).slice(0, 300)}`);
    if (res.status === 401 || res.status === 403) throw new Error('AI のキーが正しくないようです（管理者に伝えてください）');
    if (res.status === 402) throw new Error('AI の残高が足りないようです（管理者に伝えてください）');
    if (res.status === 429) throw new Error('AI が混み合っています。少し待ってから、もう一度たのんでください');
    throw new Error(`AI でエラーになりました（${res.status}）。少し待ってから、もう一度たのんでください`);
  }
  const choice = data.choices?.[0];
  const out = parseReply(choice?.message?.content);
  if (!out) {
    if (choice?.finish_reason === 'length') throw new Error('AI の返事を最後まで受け取れませんでした。たのみを短く分けて、もう一度たのんでください');
    throw new Error('AI の返事を読めませんでした。言い方を変えて、もう一度たのんでください');
  }
  return out;
}

const okBaseUrl = (u) => /^https:\/\/[^\s]+$/.test(u) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?(\/[^\s]*)?$/.test(u);

/**
 * dir: data/ の場所。makeClient / fetchImpl はテスト用（にせの AI を入れる）。
 */
export function createAi({ dir, makeClient = (apiKey, Anthropic) => new Anthropic({ apiKey, maxRetries: 1 }), fetchImpl }) {
  const file = path.join(dir, 'ai.json');
  const env = {
    provider: (process.env.TW_AI_PROVIDER || '').trim(),
    key: (process.env.TW_AI_KEY || '').trim(),
    model: (process.env.TW_AI_MODEL || '').trim(),
    baseUrl: (process.env.TW_AI_BASE_URL || '').trim(),
  };
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8')) ?? {};
  } catch {}
  // 前の形（key が1つだけ）は Claude のキーとして読む
  if (saved.key && !saved.keys) saved = { ...saved, keys: { claude: saved.key } };
  delete saved.key;

  const provider = () => (AI_PROVIDERS[saved.provider] ? saved.provider : AI_PROVIDERS[env.provider] ? env.provider : 'claude');
  // キーは AI ごとに分けて持つ（切り替えたときに、別の会社へ送らないように）
  const key = () => saved.keys?.[provider()] || (provider() === (AI_PROVIDERS[env.provider] ? env.provider : 'claude') ? env.key : '');
  const model = () => {
    const def = AI_PROVIDERS[provider()];
    const m = saved.models?.[provider()] || env.model;
    if (def.kind === 'claude') return def.models.includes(m) ? m : def.model;
    return m || def.model;
  };
  const baseUrl = () => (provider() === 'openai' ? saved.baseUrl || env.baseUrl || '' : AI_PROVIDERS[provider()].baseUrl ?? '');
  const dailyLimit = () => (Number.isInteger(saved.dailyLimit) && saved.dailyLimit >= 0 ? saved.dailyLimit : DEFAULT_LIMIT);
  const extra = () => String(saved.extra ?? '');
  const usable = () => !!key() && (AI_PROVIDERS[provider()].kind === 'claude' || (!!baseUrl() && !!model()));

  return {
    /** 管理画面に見せる状態（キーそのものは返さない） */
    state() {
      const k = key();
      return {
        provider: provider(),
        providers: Object.entries(AI_PROVIDERS).map(([id, p]) => ({ id, label: p.label, kind: p.kind })),
        set: !!k,
        ready: usable(),
        source: saved.keys?.[provider()] ? 'admin' : k ? 'env' : null,
        tail: k.length >= 12 ? k.slice(-4) : '',
        model: model(),
        models: AI_PROVIDERS[provider()].models ?? null,
        baseUrl: baseUrl(),
        dailyLimit: dailyLimit(),
        extra: extra(),
      };
    },
    get ready() {
      return usable();
    },
    get dailyLimit() {
      return dailyLimit();
    },
    /** 管理画面から: { provider?, key?（空の文字で消す）, model?, baseUrl?, dailyLimit?, extra? }。書いたものだけ変える */
    update(body = {}) {
      const next = structuredClone(saved);
      if (body.provider !== undefined) {
        if (!AI_PROVIDERS[body.provider]) throw new Error(`AI は ${Object.keys(AI_PROVIDERS).join(' / ')} から選んでください`);
        next.provider = body.provider;
      }
      const prov = AI_PROVIDERS[next.provider] ? next.provider : provider();
      if (body.key !== undefined) {
        const k = String(body.key ?? '').trim();
        if (k.length > 300 || /[^\x21-\x7e]/.test(k)) throw new Error('キーの形が正しくありません（空白や日本語が混ざっていないか確かめてください）');
        next.keys = { ...next.keys };
        if (k) next.keys[prov] = k;
        else delete next.keys[prov];
      }
      if (body.model !== undefined) {
        const m = String(body.model ?? '').trim();
        const def = AI_PROVIDERS[prov];
        if (def.kind === 'claude' && !def.models.includes(m)) throw new Error(`モデルは ${def.models.join(' / ')} から選んでください`);
        if (m.length > 120 || /\s/.test(m)) throw new Error('モデルの名前が正しくありません');
        next.models = { ...next.models };
        if (m) next.models[prov] = m;
        else delete next.models[prov];
      }
      if (body.baseUrl !== undefined) {
        const u = String(body.baseUrl ?? '').trim();
        if (u && !okBaseUrl(u)) throw new Error('API の場所は https:// で始まる URL にしてください');
        next.baseUrl = u;
      }
      if (body.dailyLimit !== undefined) {
        const n = Number(body.dailyLimit);
        if (!Number.isInteger(n) || n < 0 || n > 1000) throw new Error('1日の回数は 0〜1000 で決めてください');
        next.dailyLimit = n;
      }
      if (body.extra !== undefined) {
        const t = String(body.extra ?? '');
        if (t.length > MAX_EXTRA_CHARS) throw new Error(`追加の指示は ${MAX_EXTRA_CHARS} 文字までにしてください`);
        next.extra = t;
      }
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`, { mode: 0o600 });
      fs.chmodSync(file, 0o600);
      saved = next;
      return this.state();
    },
    /**
     * たのみから変更案を作る。{ reply, changes: [{ op, path, value, label }], errors, warnings } を返す。
     * 設定は書き換えない。AI を呼べなかったときは、配信者に見せる文でエラーを投げる。
     * check(changes): その案を設定に当てて確かめる関数（{ errors, warnings } を返す）。
     * 問題があれば、それを AI に伝えて1回だけ直してもらう。
     */
    async ask({ text, config, focus, gifts, check = () => ({ errors: [], warnings: [] }) }) {
      if (!usable()) throw new Error('AI はまだ使えません（管理者がキーを入れると使えます）');
      const kind = AI_PROVIDERS[provider()].kind;
      const system = buildSystem({ reference: cfg.reference(), extra: extra(), valueAsText: kind === 'claude' });
      const call = (messages) =>
        kind === 'claude'
          ? askClaude({ key: key(), model: model(), system, messages, makeClient })
          : askOpenAi({ key: key(), model: model(), baseUrl: baseUrl(), system, messages, fetchImpl });
      const judge = (out) => {
        const { changes, errors } = checkChanges(out.changes ?? []);
        const dry = changes.length && !errors.length ? check(changes) : { errors: [], warnings: [] };
        return { reply: String(out.reply ?? ''), changes, errors: [...errors, ...(dry.errors ?? [])], warnings: dry.warnings ?? [] };
      };
      const messages = [{ role: 'user', content: buildRequest({ text, config, focus, gifts }) }];
      const raw = await call(messages);
      const first = judge(raw);
      const issues = [...first.errors, ...first.warnings];
      if (!issues.length) return first;
      // 確かめて出た問題を伝えて、直した案をもらう（直らなければ初めの案を返す）
      try {
        const fixed = judge(
          await call([
            ...messages,
            { role: 'assistant', content: JSON.stringify(raw) },
            {
              role: 'user',
              content: `この案を設定に当てて確かめたら、次の問題が出ました。問題を直した案を、同じ形でもう一度返してください（一覧にない項目は使わない。たのみの内容は変えない）。\n${issues.map((i) => `- ${i}`).join('\n')}`,
            },
          ]),
        );
        if (fixed.errors.length + fixed.warnings.length < issues.length) return fixed;
      } catch {}
      return first;
    },
  };
}
