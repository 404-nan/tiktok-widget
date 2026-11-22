// 書体（フォント）の共通の作法。
// 設定の font / customFont から font-family を組み、根元の要素に効かせる。他のウィジェットも、
// 設定に同じ名前（font / customFont）を足して applyFont を呼べば、同じように書体を変えられる。
// 書体の実体は外部から読み込まない（置き場の決まり）。プリセットは端末や配信ソフト側にある
// 書体名の並びで当て、無い環境では今の見え方（overlay.css の --font）に落ちる。
// 設定側の選択肢は src/schema.js の fontFields() が持つ（番号がそろっていることはテストで固定する）。

export const DEFAULT_FONT = 'default';
export const CUSTOM_FONT = 'custom';

// 選べるプリセット。family は CSS のフォント名の並び（先頭がその書体の代表の名前）。
export const FONT_PRESETS = [
  { id: 'default', name: '既定（今の書体）', family: '' },
  { id: 'rounded', name: '丸ゴシック', family: '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Maru Gothic Pro", "Yu Gothic UI", "Yu Gothic", "Meiryo UI"' },
  { id: 'mincho', name: '明朝', family: '"Shippori Mincho", "Hiragino Mincho ProN", "Hiragino Mincho Pro", "Yu Mincho", "YuMincho", "MS PMincho", serif' },
  { id: 'pop', name: 'ポップ', family: '"Mochiy Pop One", "Hiragino Maru Gothic ProN", "M PLUS Rounded 1c", "Yu Gothic UI"' },
];

// 設定で選べる番号の一覧（schema 側と一致させる）
export const FONT_IDS = [...FONT_PRESETS.map((preset) => preset.id), CUSTOM_FONT];

// 後ろに置く標準のゴシックの積み重ね。書体が無い環境では、今の見え方（overlay.css の --font）に落ちる
const GOTHIC_STACK = 'var(--font, sans-serif)';

/** 番号からプリセットを引く。知らない番号は既定（default）に寄せる */
export function resolveFont(font) {
  return FONT_PRESETS.find((preset) => preset.id === font) ?? FONT_PRESETS[0];
}

/** 設定から font-family を組む。既定（今の書体）と、名前が空の custom では何も指定しない（''） */
export function fontFamily(font, customFont) {
  if (font === CUSTOM_FONT) {
    // 引用符や ; { } が混ざると CSS が壊れるので落とす
    const name = String(customFont ?? '').replace(/[";{}]/g, '').trim();
    return name ? `"${name}", ${GOTHIC_STACK}` : '';
  }
  const preset = resolveFont(font);
  return preset.family ? `${preset.family}, ${GOTHIC_STACK}` : '';
}

/**
 * 書体を読み込む口。実体は外部から読み込まない決まりなので何もしない
 * （プリセットは端末側の書体名で当てる）。形だけ gift 通知の作りとそろえてある。
 */
export function loadFont() {
  return null;
}

/**
 * 要素に書体を効かせる。根元に font-family を置くので中の文字は継承するが、
 * 自分の書体を持つ要素（数字の .num など）は、画面側で `[data-font] .num { font-family: inherit }`
 * のように対の決まりを置いて同じ書体にする。
 */
export function applyFont(el, { font, customFont } = {}) {
  const family = fontFamily(font, customFont);
  if (family) {
    el.style.fontFamily = family;
    el.dataset.font = font === CUSTOM_FONT ? CUSTOM_FONT : resolveFont(font).id;
  }
  return family;
}
