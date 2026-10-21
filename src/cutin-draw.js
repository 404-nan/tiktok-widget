// カットインの抽選値をサーバーで一度だけ作り、表示段階を決める。
// 公開ウィジェットにも同じ計算規則を持たせ、画面ごとの差をなくす。

export const CUTIN_TIERS = ['blue', 'green', 'red', 'gold', 'rainbow'];
const PATTERNS = ['giraffe', 'zebra', 'gold'];

const unit = () => Math.random();

/** イベントを配る前に付ける、画面共有用の抽選値を作る。 */
export function drawCutin({ rush = false } = {}) {
  return {
    premium: unit(),
    pattern: unit(),
    promote: unit(),
    from: unit(),
    seed: Math.floor(unit() * 900) + 1,
    rush: rush === true,
  };
}

function validUnit(value) {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && value < 1;
}

function validDraw(draw) {
  return Boolean(draw) && ['premium', 'pattern', 'promote', 'from'].every((key) => validUnit(draw[key]))
    && Number.isInteger(draw.seed) && draw.seed >= 1 && draw.seed <= 900
    && typeof draw.rush === 'boolean';
}

function safeSettings(settings = {}) {
  return {
    premium: settings.premium === true,
    premiumRate: Number.isFinite(Number(settings.premiumRate)) ? Number(settings.premiumRate) : 1,
    premiumPatterns: Array.isArray(settings.premiumPatterns) ? settings.premiumPatterns.filter((id) => PATTERNS.includes(id)) : [],
    promote: settings.promote === true,
    promoteRate: Number.isFinite(Number(settings.promoteRate)) ? Number(settings.promoteRate) : 20,
    rushBoost: settings.rushBoost === true,
  };
}

/** 抽選値と金額で決まった段階から、最終的な表示結果を決める。 */
export function resolveCutin(draw, baseTier, settings) {
  const baseIndex = CUTIN_TIERS.indexOf(baseTier);
  const fallback = { tier: baseIndex < 0 ? null : baseTier, from: null, pattern: null };
  if (!validDraw(draw) || baseIndex < 0) return fallback;

  const config = safeSettings(settings);
  const rushIndex = config.rushBoost && draw.rush ? Math.min(CUTIN_TIERS.length - 1, baseIndex + 1) : baseIndex;
  const tier = CUTIN_TIERS[rushIndex];
  const pattern = config.premium && draw.premium < config.premiumRate / 100 && config.premiumPatterns.length
    ? config.premiumPatterns[Math.min(config.premiumPatterns.length - 1, Math.floor(draw.pattern * config.premiumPatterns.length))]
    : null;
  const from = config.promote && rushIndex >= 1 && draw.promote < config.promoteRate / 100
    ? CUTIN_TIERS[Math.floor(draw.from * rushIndex)]
    : null;
  return { tier, from, pattern };
}
