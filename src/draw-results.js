// 抽選の結果の記録。管理画面で「誰が・何に当たったか」を見るためのもの。
// 保存は JSONL（1行1件）へ追記するだけで、全件残す（切り捨てない）。
// 表示（list）は直近分だけでよいので、メモリには直近 keep 件だけを持ち、
// 起動時の読み戻しもファイルの末尾だけを読む（保存と表示を分ける）。
// ポイントや天井の数えと違って、落としても配信が壊れない軽い記録なので、失敗しても止めない。
import fs from 'node:fs';
import path from 'node:path';

// 読み戻しで読む末尾の大きさ。1件は数百バイトなので、直近 keep 件（既定100）には十分すぎる量
const TAIL_BYTES = 512 * 1024;

export class DrawResults {
  constructor(file, { keep = 100 } = {}) {
    this.file = file ? String(file) : null;
    this.keep = Math.max(1, Math.floor(Number(keep)) || 100);
    this.items = [];
    this.needsSeparator = false;
    this.#load();
  }

  #load() {
    if (!this.file) return;
    try {
      const lines = this.#readTail().split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          if (item && typeof item === 'object') this.items.push(item);
        } catch {
          // 壊れた行は飛ばす（書き込みの途中で切れた行など）
        }
      }
      if (this.items.length > this.keep) this.items = this.items.slice(-this.keep);
      // 末尾が改行で終わっていない（書き込みの途中で切れた等）ときは、次の追記の前に区切りが要る
      const size = fs.statSync(this.file).size;
      if (size > 0) {
        const fd = fs.openSync(this.file, 'r');
        try {
          const last = Buffer.alloc(1);
          fs.readSync(fd, last, 0, 1, size - 1);
          this.needsSeparator = last[0] !== 0x0a;
        } finally {
          fs.closeSync(fd);
        }
      }
    } catch {
      // ファイルが無い・読めないときは空で始める
    }
  }

  // ファイルの末尾だけを読む。全件保存でファイルが大きくなっても、読み戻しは直近分で足りる
  #readTail() {
    const fd = fs.openSync(this.file, 'r');
    try {
      const size = fs.fstatSync(fd).size;
      const start = Math.max(0, size - TAIL_BYTES);
      const buf = Buffer.alloc(size - start);
      fs.readSync(fd, buf, 0, buf.length, start);
      const text = buf.toString('utf8');
      // 途中から読み始めたときは、最初の行は途中で切れているので捨てる
      return start > 0 ? text.slice(text.indexOf('\n') + 1) : text;
    } finally {
      fs.closeSync(fd);
    }
  }

  add(entry) {
    const item = { ts: Date.now(), ...(entry && typeof entry === 'object' ? entry : {}) };
    this.items.push(item);
    if (this.items.length > this.keep) this.items.splice(0, this.items.length - this.keep);
    if (this.file) {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        // 末尾の途中行に新しい記録をくっつけて一緒に壊さないよう、先に区切りの改行を入れる
        fs.appendFileSync(this.file, `${this.needsSeparator ? '\n' : ''}${JSON.stringify(item)}\n`);
        this.needsSeparator = false;
      } catch {
        // 記録に失敗しても抽選自体は止めない
      }
    }
    return item;
  }

  /** ファイルから全件を読む（古い順）。配信単位の全件表示など、直近分でない読み出し用 */
  readFile({ kind = '', session = '' } = {}) {
    if (!this.file) return [];
    const items = [];
    try {
      const text = fs.readFileSync(this.file, 'utf8');
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          if (!item || typeof item !== 'object') continue;
          if (kind && item.kind !== kind) continue;
          if (session && item.session !== session) continue;
          items.push(item);
        } catch {
          // 壊れた行は飛ばす
        }
      }
    } catch {
      return [];
    }
    return items;
  }

  /** 新しい順。kind を渡すとその種類だけ */
  list(kind, limit = 50) {
    const n = Math.max(1, Math.floor(Number(limit)) || 50);
    const out = [];
    for (let i = this.items.length - 1; i >= 0 && out.length < n; i--) {
      const item = this.items[i];
      if (kind && item.kind !== kind) continue;
      out.push(item);
    }
    return out;
  }
}
