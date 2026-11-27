// 管理者が配信者ごとに「使える / 使えない」を決められるもの（ウィジェットと、WIN数の全画面演出・Minecraft 連携）の定義。
// runtime.js から切り出した定数群。どれをプランで分けるか（premium）と編集の操作は src/plans.json から作る。

import { SCHEMA } from './schema.js';
import { getEditCapabilities, getPremiumFeatureKeys } from './plans.js';

export const FEATURE_ORDER = ['alerts', 'chats', 'wins', 'winsFx', 'timers', 'bosses', 'doors', 'roulettes', 'votes', 'quizzes', 'cheers', 'pushButtons', 'jars', 'goals', 'counters', 'rankings', 'throne', 'ootori', 'dareba', 'tickers', 'supporters', 'visitors', 'cutins', 'puchuns', 'imageCutins', 'rush', 'stepup', 'swarm', 'mediaAlerts', 'giftSounds', 'gacha', 'omikuji', 'slots', 'relayStop', 'peka', 'mcGifts', 'superchats', 'commentSlide', 'cardDraw', 'ai', 'minecraft', 'combo'];
// プランで分ける機能（豪華な演出と AI）。初めの状態では使えず、手動の ON かプランで開く
export const PREMIUM_KEYS = getPremiumFeatureKeys();
// 編集の操作（edit.media・edit.cutinImage・edit.layout・edit.advanced・edit.ai）。どのプランでできるかは plans.json
export const EDIT_CAPABILITIES = Object.fromEntries(getEditCapabilities().map(({ key, ...rest }) => [key, rest]));
export const FEATURES = Object.fromEntries(
  FEATURE_ORDER.map((key) => {
    if (key === 'winsFx') return [key, { label: 'WIN数の全画面演出', pages: ['wins-fx.html'], premium: PREMIUM_KEYS.includes(key) }];
    // 文章でたのむと設定の案を作る（1回ごとに AI の料金がかかるので、初めは使えない）
    if (key === 'ai') return [key, { label: 'AI にたのむ', pages: [], premium: PREMIUM_KEYS.includes(key) }];
    if (key === 'relayStop') return [key, { label: 'リレー停止', pages: ['slot.html'], premium: PREMIUM_KEYS.includes(key) }];
    const def = SCHEMA[key];
    const pages = def.page ? [`${def.page}.html`] : [];
    if (key === 'roulettes') pages.push('roulette-strip.html');
    return [key, { label: def.title, pages, premium: PREMIUM_KEYS.includes(key) }];
  }),
);
export const PREMIUM = Object.fromEntries(Object.entries(FEATURES).filter(([, f]) => f.premium));
/** ページ名 → 使える/使えないを決めているもの（なければ null） */
export const featureOfPage = (page) => Object.entries(FEATURES).find(([, f]) => f.pages.includes(page))?.[0] ?? null;

// OBS 用の鍵でできること（読むだけ）
export const OBS_ALLOWED = [/^\/api\/config$/, /^\/api\/wins$/, /^\/api\/rush$/, /^\/api\/stepup$/, /^\/api\/swarm$/, /^\/api\/combo$/, /^\/api\/timer$/, /^\/api\/boss$/, /^\/api\/vote$/, /^\/api\/quiz$/, /^\/api\/cheer$/, /^\/api\/push-button$/, /^\/api\/me$/, /^\/api\/sample$/, /^\/api\/info-feed$/, /^\/api\/visitors$/, /^\/api\/gacha$/, /^\/api\/omikuji$/, /^\/api\/slot$/, /^\/api\/relay-stop$/, /^\/api\/peka$/, /^\/api\/throne$/, /^\/api\/ootori$/, /^\/api\/dareba$/, /^\/api\/minecraft\/goal-alert$/, /^\/api\/media-alerts$/, /^\/api\/media-alerts\/[a-f0-9]+\/file$/, /^\/api\/gift-sounds$/, /^\/api\/gift-names$/, /^\/api\/mc-gifts$/, /^\/api\/card-draw$/];
