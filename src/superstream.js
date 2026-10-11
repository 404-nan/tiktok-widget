// SuperStream（Minecraft のプラグイン）のプロフィールを読む。
// プロフィールの GiftListener にある「ギフト ID → 演出」を一覧にして、
// ダッシュボードや AI が superstreamGift を選べるようにする（読むだけで書き換えない）。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import YAML from 'yaml';
import { DEMO_GIFTS } from './demo.js';

// プロフィールの説明に書かれている、SuperStream に組み込みの演出
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
