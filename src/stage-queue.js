// 舞台の順番待ち: 配信者ごとに「大きな演出が流れている間」を1つだけ持ち、終わったら待っている側へ知らせる。
// おみくじの抽選と結果表示、カードめくりの開示が持ち主になる。待ち列そのものは各部品が持ち、ここは持ち主の管理だけをする。

export class StageQueue {
  constructor() {
    this.owners = new Map(); // 配信者の鍵 → 持ち主の名前
    this.waiters = new Map(); // 配信者の鍵 → 空いたら呼ぶ関数の並び
  }

  /** 今の持ち主。空いていれば null */
  ownerOf(key) {
    return this.owners.get(key) ?? null;
  }

  /** 舞台が使われているか */
  isBusy(key) {
    return this.owners.has(key);
  }

  /**
   * 舞台を取る。空いていれば持ち主になって true、すでに自分のものなら true、
   * 他の部品が使っていれば取らずに false。
   */
  acquire(key, name) {
    const owner = this.owners.get(key);
    if (owner === undefined) {
      this.owners.set(key, name);
      return true;
    }
    return owner === name;
  }

  /** 舞台を返す。持ち主のときだけ返せて、待っている側へ知らせる */
  release(key, name) {
    if (this.owners.get(key) !== name) return false;
    this.owners.delete(key);
    const list = this.waiters.get(key) ?? [];
    this.waiters.delete(key);
    for (const fn of list) fn();
    return true;
  }

  /** 空いたら1回だけ呼ぶ。すでに空いていればその場で呼ぶ */
  whenFree(key, fn) {
    if (!this.owners.has(key)) {
      fn();
      return;
    }
    const list = this.waiters.get(key) ?? [];
    list.push(fn);
    this.waiters.set(key, list);
  }

  /** 待ちの登録を取り消す（配信が終わって待ち列を空にするとき） */
  cancelWait(key, fn) {
    const list = this.waiters.get(key);
    if (!list) return;
    const next = list.filter((f) => f !== fn);
    if (next.length) this.waiters.set(key, next);
    else this.waiters.delete(key);
  }

  /** 配信者の状態を全部消す */
  clear(key) {
    this.owners.delete(key);
    this.waiters.delete(key);
  }
}
