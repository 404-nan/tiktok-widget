// Minecraft の演出プラグインのプロフィールを読む。
// プロフィールの GiftListener にある「ギフト ID → 演出」を一覧にして、
// ダッシュボードや AI が superstreamGift を選べるようにする（読むだけで書き換えない）。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { DEMO_GIFTS } from './demo.js';

// プロフィールの説明に書かれている、演出プラグインに組み込みの演出
export const SUPERSTREAM_ACTIONS = [
  'execute', 'random-execute', 'actionbar', 'message', 'effect', 'sound', 'spawn', 'shape', 'formation', 'title',
  'randomaction', 'teleport', 'launch', 'inventory', 'weather', 'time', 'fire', 'freeze', 'explode', 'lightning',
  'blockrain', 'cage', 'trap', 'potion-random', 'bossbar', 'xp', 'health', 'scoreboard', 'acidrain', 'meteorite',
  'earthquake', 'redstoneigniter',
];

const expand = (p) => (p.startsWith('~') ? path.join(os.homedir(), p.slice(1)) : p);

/**
 * プロフィールのファイルを読む。
 * knownGifts: ID からギフト名を引くための一覧（配信で届いたギフトなど）
 */
export function readProfile(file, knownGifts = []) {
  if (!file) return { file: '', gifts: [], error: 'minecraft.superstreamFile にプロフィールのファイルの場所を書くと、設定済みの演出を一覧できます' };
  const full = path.resolve(expand(file));
  let doc;
  try {
    doc = YAML.parse(fs.readFileSync(full, 'utf8')) ?? {};
  } catch (err) {
    return { file: full, gifts: [], error: err.code === 'ENOENT' ? `ファイルがありません: ${full}` : `読めませんでした: ${err.message}` };
  }
  const names = new Map([...DEMO_GIFTS, ...knownGifts].map((g) => [String(g.id), g.name]));
  const listener = doc.GiftListener ?? {};
  const gifts = Object.entries(listener)
    .filter(([key]) => /^\d+$/.test(key))
    .map(([id, def]) => ({
      id,
      name: names.get(id) ?? null,
      actions: Object.keys(def?.actions ?? {}),
      foreach: Boolean(def?.foreach),
    }));
  const listeners = Object.fromEntries(
    ['CommentListener', 'JoinListener', 'LikeListener', 'FollowListener', 'ShareListener', 'SubscriptionListener']
      .filter((k) => doc[k])
      .map((k) => [k, { enabled: doc[k].enabled !== false, actions: Object.keys(doc[k].actions ?? {}) }]),
  );
  return {
    file: full,
    profile: path.basename(full).replace(/\.ya?ml$/, ''),
    tiktokUsername: doc.TiktokUsername ?? null,
    players: doc.Players ?? [],
    gifts,
    hasDefault: Boolean(listener.default),
    listeners,
  };
}

// 色の記号(&e など)と、送った人の名前の部分を消して、視聴者に見せる短い言葉にする
const plainMessage = (text) => String(text ?? '').replace(/&[0-9a-fk-or]/gi, '').replace(/^\s*<sender>\s*[:：]?\s*/i, '').trim();

/**
 * 妨害マイクラのギフト表(配信画面に出す用)。プロフィールの GiftListener から、ギフトごとに何が起きるかを読む。
 * effect は message の文(「<sender>: ゾンビ」の「ゾンビ」)。なければ空。coins と日本語の名前は手元の一覧から引く。
 */
export function giftTable(file, { coinOf = () => null, nameJaOf = () => null, catalog = [] } = {}) {
  if (!file) return { gifts: [], error: 'ギフト表のファイルがありません' };
  let doc;
  try { doc = YAML.parse(fs.readFileSync(path.resolve(expand(file)), 'utf8')) ?? {}; } catch (err) { return { gifts: [], error: `読めませんでした: ${err.code ?? err.message}` }; }
  const byId = new Map(catalog.map((g) => [String(g.id), g]));
  const gifts = Object.entries(doc.GiftListener ?? {})
    .filter(([key]) => /^\d+$/.test(key))
    .map(([id, def]) => {
      const known = byId.get(id) ?? {};
      const messages = def?.actions?.message?.messages ?? [];
      return {
        id,
        name: known.name ?? null,
        nameJa: known.nameJa ?? nameJaOf(id) ?? null,
        coins: Number(known.diamonds ?? coinOf(id) ?? 0) || null,
        image: known.image ?? null,
        effect: plainMessage(messages[0]),
      };
    })
    .sort((a, b) => (a.coins ?? Infinity) - (b.coins ?? Infinity));
  return { gifts };
}
