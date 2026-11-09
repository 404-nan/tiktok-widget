// 読み上げの決まりごと（画面に触らない部分）。ウィジェットとテスト（test/tts.test.js）の両方から使う。
// - どの出来事を、どの声で、どう読むか（または読まないか）を決める
// - 読み上げる文の整形は、チャット部品の speechText と同じ作法にそろえる
import { hasBadWord } from './chat.js';
import { giftLabel } from './gift-names.js';

const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu;
const fold = (s) => String(s ?? '').normalize('NFKC').toLowerCase();
const toList = (v) =>
  (Array.isArray(v) ? v : String(v ?? '').split(','))
    .map((x) => String(x).trim())
    .filter(Boolean);

/** 声の型。速さと高さの倍率（設定の速さ・高さに掛ける） */
export const VOICE_TYPES = {
  normal: { rate: 1, pitch: 1 },
  high: { rate: 1.05, pitch: 1.4 },
  low: { rate: 0.95, pitch: 0.7 },
  fast: { rate: 1.3, pitch: 1 },
  slow: { rate: 0.8, pitch: 1 },
};

/** 読み上げる文の整形。読むものが残らなければ空文字 */
export function cleanSpeechText(raw, maxChars = 60) {
  let text = String(raw ?? '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(EMOJI, ' ')
    .replace(/[wWｗＷ]{2,}/g, ' わら ')
    .replace(/[8８]{3,}/g, ' ぱちぱち ')
    .replace(/(.)\1{4,}/gu, '$1$1$1')
    .replace(/\s+/g, ' ')
    .trim();
  const max = Math.max(1, Number(maxChars) || 60);
  if ([...text].length > max) text = `${[...text].slice(0, max).join('')}、以下略`;
  return text;
}

/** 読み方の型に名前などを差し込む */
export function fillTemplate(tpl, vars) {
  return String(tpl ?? '')
    .replaceAll('{name}', vars.name ?? '')
    .replaceAll('{text}', vars.text ?? '')
    .replaceAll('{gift}', vars.gift ?? '');
}

const cleanName = (name) => String(name ?? '').replace(EMOJI, '').trim();

/** 読み上げの状態（このページを開いている間の分） */
export function createTtsState() {
  return {
    gifters: new Set(),      // ギフトを送った人の ID
    followers: new Set(),    // フォローした人の ID
    unlockUntil: new Map(),  // ID -> 解錠の期限（時刻）
    lastReadAt: new Map(),   // ID -> 最後に読み上げへ回した時刻
    waiting: 0,              // 待ち行列の数（画面側と共有する目安）
  };
}

function numOr(value, fallback) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
const VOICE_TYPE_KEYS = Object.keys(VOICE_TYPES);
function voiceFor(p, channel) {
  let key = p[channel + 'VoiceType'];
  if (key === 'random') key = VOICE_TYPE_KEYS[Math.floor(Math.random() * VOICE_TYPE_KEYS.length)];
  const type = VOICE_TYPES[key] ?? VOICE_TYPES.normal;
  return {
    rate: Math.min(2, Math.max(0.5, numOr(p[channel + 'Rate'], 1.1) * type.rate)),
    pitch: Math.min(2, Math.max(0, numOr(p[channel + 'Pitch'], 1) * type.pitch)),
    volume: Math.min(1, Math.max(0, numOr(p[channel + 'Volume'], 1))),
  };
}

function blocked(state, p, userId, now) {
  const ng = toList(p.ngWords).map(fold);
  return {
    ngHit: (text) => ng.some((w) => fold(text).includes(w)),
    cooling: () => {
      const cd = Math.max(0, Number(p.cooldownSec) || 0) * 1000;
      const last = state.lastReadAt.get(userId);
      return cd > 0 && last !== undefined && now - last < cd;
    },
  };
}

/**
 * 出来事1つへの判断。{ speak: { channel, text, voice } } か { skip: 理由 } を返す。
 * ギフトとフォローは、読み上げの可否にかかわらず状態（送った人・解錠）へ記録する。
 */
export function decideTts(e, p = {}, state, now = Date.now()) {
  if (!state) throw new Error('state が要ります');
  if (e?.test) return { skip: 'テスト送信は読まない' };
  const userId = String(e?.user?.id ?? '');
  const name = cleanName(e?.user?.name);
  const maxQueue = Math.max(1, Number(p.maxQueue) || 5);

  if (e?.kind === 'gift') {
    if (userId) {
      state.gifters.add(userId);
      const minutes = Math.max(1, Number(p.unlockMinutes) || 30);
      state.unlockUntil.set(userId, now + minutes * 60000);
    }
    if (p.giftOn === false) return { skip: 'ギフトの読み上げが切' };
    const coins = Number(e?.coins ?? e?.totalDiamonds) || 0;
    if (coins < (Number(p.giftMinCoins) || 0)) return { skip: '最低コイン未満' };
    if (state.waiting >= maxQueue) return { skip: '待ち行列が上限' };
    if (blocked(state, p, userId, now).cooling()) return { skip: 'クールダウン中' };
    const giftName = cleanSpeechText((e?.gift ? giftLabel(e.gift) : '') || 'ギフト', 30);
    const text = fillTemplate(p.giftTemplate || '{name}さん、{gift}ありがとう！', { name, gift: giftName });
    state.lastReadAt.set(userId, now);
    return { speak: { channel: 'gift', text, voice: voiceFor(p, 'gift') } };
  }

  if (e?.kind === 'follow') {
    if (userId) state.followers.add(userId);
    if (p.followOn === false) return { skip: 'フォローの読み上げが切' };
    if (state.waiting >= maxQueue) return { skip: '待ち行列が上限' };
    const text = fillTemplate(p.followTemplate || '{name}さん、フォローありがとう！', { name });
    return { speak: { channel: 'gift', text, voice: voiceFor(p, 'gift') } };
  }

  if (e?.kind === 'member') {
    if (p.joinOn !== true) return { skip: '入室の読み上げが切' };
    if (state.waiting >= maxQueue) return { skip: '待ち行列が上限' };
    const text = fillTemplate(p.joinTemplate || '{name}さん、いらっしゃい', { name });
    return { speak: { channel: 'gift', text, voice: voiceFor(p, 'gift') } };
  }

  if (e?.kind === 'chat') {
    if (p.chatOn === false) return { skip: 'コメントの読み上げが切' };
    const raw = String(e?.text ?? '');
    if (!raw.trim()) return { skip: '本文が空' };
    if (p.chatMode === 'cmd' && !/^[!！]/.test(raw.trim())) return { skip: 'コマンドだけ読む設定' };
    const scope = p.chatScope || 'all';
    if (scope === 'follower' && !state.followers.has(userId)) return { skip: 'フォロワーだけ読む設定' };
    if (scope === 'gifter' && !state.gifters.has(userId)) return { skip: 'ギフトした人だけ読む設定' };
    if (p.unlockOn === true && (state.unlockUntil.get(userId) ?? 0) <= now) return { skip: '読み上げ権がない' };
    const chk = blocked(state, p, userId, now);
    if (chk.ngHit(raw)) return { skip: 'NGワードを含む' };
    if (p.skipBadWords !== false && hasBadWord(raw)) return { skip: '悪口を含む' };
    if (chk.cooling()) return { skip: 'クールダウン中' };
    if (state.waiting >= maxQueue) return { skip: '待ち行列が上限' };
    const body = cleanSpeechText(raw, p.maxChars);
    if (!body) return { skip: '読むものが残らない' };
    const text = p.chatName === false ? body : fillTemplate(p.chatTemplate || '{name}さん、{text}', { name, text: body });
    state.lastReadAt.set(userId, now);
    return { speak: { channel: 'chat', text, voice: voiceFor(p, 'chat') } };
  }

  return { skip: '対象外の出来事' };
}
