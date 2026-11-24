// コメントスライドの決まりごと（画面に触らない部分）。ウィジェットとテスト（test/comment-slide.test.js）の両方から使う。
// - 設定の固定枠（きっかけ1・言葉1 … きっかけ5・言葉5）から、使う組み合わせを作る
// - コメントの本文に「きっかけの言葉」を含むかで、上から最初に一致した1つだけを選ぶ
// - 同時に来た分を入れる待ち行列。最大3つまでで、あふれた分は入れずに捨てる

export const MAX_COMBOS = 5;
export const MAX_QUEUE = 3;

/** 設定の固定枠から、きっかけと言葉の両方が入っている組み合わせだけを順に取り出す */
export function slideCombos(p = {}) {
  const out = [];
  for (let i = 1; i <= MAX_COMBOS; i += 1) {
    const trigger = String(p[`trigger${i}`] ?? '').trim();
    const text = String(p[`text${i}`] ?? '').trim();
    if (trigger && text) out.push({ trigger, text });
  }
  return out;
}

/** コメントの本文に「きっかけの言葉」を含む、上から最初の1つだけを返す（無ければ null） */
export function slideMatch(text, combos = []) {
  const body = String(text ?? '');
  if (!body) return null;
  return combos.find((c) => body.includes(c.trigger)) ?? null;
}

/**
 * 1つずつ順に出していく待ち行列。
 * max を超えて入ってきた分は入れず false を返す（捨てる）。run が終わってから次の1つを出す。
 */
export function createSlideQueue(run, max = MAX_QUEUE) {
  const items = [];
  let busy = false;
  const next = async () => {
    if (busy || items.length === 0) return;
    busy = true;
    try {
      await run(items.shift());
    } finally {
      busy = false;
      next();
    }
  };
  return {
    push(item) {
      if (items.length >= max) return false; // あふれた分は捨てる
      items.push(item);
      next();
      return true;
    },
    clear() {
      items.length = 0;
    },
    get size() {
      return items.length + (busy ? 1 : 0);
    },
  };
}
