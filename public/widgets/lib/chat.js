// コメント欄の決まりごと（画面に触らない部分）。ウィジェットとテスト（test/chat.test.js）の両方から使う。
// - どのコメントを出すか（NG ワード・隠すユーザー・「!」のコマンド）
// - ギフトを送った人の段階（送ったコインの合計で 0〜3）
// - 読み上げる文（絵文字や「www」「8888」を読みやすくする）

// 全角・半角や大文字小文字の違いをそろえて比べる
const fold = (s) => String(s ?? '').normalize('NFKC').toLowerCase();

const toList = (v) =>
  (Array.isArray(v) ? v : String(v ?? '').split(','))
    .map((x) => String(x).trim())
    .filter(Boolean);

/** 設定から「このコメントを出すか」を決める関数を作る */
export function chatFilter(p = {}) {
  const words = toList(p.hideWords).map(fold);
  const users = new Set(toList(p.hideUsers).map((u) => fold(u.replace(/^@/, ''))));
  return (e) => {
    const text = String(e?.text ?? '').trim();
    if (!text) return false;
    if (p.hideCommands !== false && /^[!！]/.test(text)) return false;
    if (users.size && (users.has(fold(e.user?.id)) || users.has(fold(e.user?.name)))) return false;
    if (words.length) {
      const t = fold(text);
      if (words.some((w) => t.includes(w))) return false;
    }
    return true;
  };
}

/** 送ったコインの合計から段階を出す。0 は送っていない（目立たせない）、1〜3 は上ほど目立つ */
export function gifterTier(coins, p = {}) {
  const c = Number(coins) || 0;
  const t1 = Math.max(1, Number(p.gifterCoins) || 1);
  const t2 = Math.max(t1, Number(p.bigGifterCoins) || 1000);
  const t3 = Math.max(t2, Number(p.topGifterCoins) || 10000);
  if (c >= t3) return 3;
  if (c >= t2) return 2;
  if (c >= t1) return 1;
  return 0;
}

const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}]/gu;
const MAX_SPEECH = 60; // これより長いコメントは途中まで読む

/** 読み上げる文。読むものが残らなければ空文字 */
export function speechText(e, p = {}) {
  let text = String(e?.text ?? '')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(EMOJI, ' ')
    .replace(/[wWｗＷ]{2,}/g, ' わら ')
    .replace(/[8８]{3,}/g, ' ぱちぱち ')
    .replace(/(.)\1{4,}/gu, '$1$1$1') // 「ーーーーー」「！！！！！」は短く
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return '';
  if ([...text].length > MAX_SPEECH) text = `${[...text].slice(0, MAX_SPEECH).join('')}、以下略`;
  const name = String(e?.user?.name ?? '').replace(EMOJI, '').trim();
  return p.ttsName !== false && name ? `${name}さん、${text}` : text;
}
