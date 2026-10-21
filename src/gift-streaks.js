// 連打ギフトの途中経過を覚えておき、終わりの合図（repeatEnd）が来ないまま途切れても、投げた分を数え落とさない。
// 途切れたときは最後に見えた個数で出し、そのあと続きや終わりの合図が来たら、増えた分だけ出す（二重に数えない）。

const IDLE_MS = 15000; // 最後の途中経過からこれだけ何も来なければ、終わったとみなす

// 人の見分けは normalize.js の normalizeUser と同じ順。groupId があれば別の連打として分ける
const keyOf = (data) => {
  const u = data?.user ?? {};
  return [u.userId, u.uniqueId || u.displayId || u.username, data?.giftId ?? data?.gift?.id, data?.groupId].map((v) => v ?? '').join(':');
};
const countOf = (data) => Math.max(1, Number(data?.repeatCount) || 1);

export class GiftStreaks {
  /** emit(data) には、終わったものとして扱う生のギフトデータを渡す */
  constructor(emit, { idleMs = IDLE_MS } = {}) {
    this.emit = emit;
    this.idleMs = idleMs;
    this.open = new Map(); // 途中の連打: key → { data, timer }
    this.flushed = new Map(); // 途切れたとして出した個数: key → count
  }

  /** 連打の途中経過。終わりの合図が来るまで覚えておく */
  progress(data) {
    const key = keyOf(data);
    const cur = this.open.get(key);
    if (cur) clearTimeout(cur.timer);
    else if (countOf(data) < (this.flushed.get(key) ?? 0)) this.flushed.delete(key); // 個数が戻った = 新しい連打
    const timer = setTimeout(() => this.#flush(key), this.idleMs);
    timer.unref?.();
    this.open.set(key, { data, timer });
  }

  /** 終わりの合図。出すべきデータを返す（もう全部出していれば null） */
  end(data) {
    const key = keyOf(data);
    const cur = this.open.get(key);
    if (cur) {
      clearTimeout(cur.timer);
      this.open.delete(key);
    }
    const sent = this.flushed.get(key);
    this.flushed.delete(key);
    if (sent == null) return data;
    const rest = countOf(data) - sent;
    return rest > 0 ? { ...data, repeatCount: rest } : null;
  }

  /** 接続が切れたときなど。途中の連打を全部、終わったものとして出す */
  flushAll() {
    for (const key of [...this.open.keys()]) this.#flush(key);
  }

  #flush(key) {
    const cur = this.open.get(key);
    if (!cur) return;
    clearTimeout(cur.timer);
    this.open.delete(key);
    const sent = this.flushed.get(key) ?? 0;
    const count = countOf(cur.data);
    this.flushed.set(key, Math.max(sent, count));
    if (count > sent) this.emit({ ...cur.data, repeatCount: count - sent, repeatEnd: true });
  }
}
