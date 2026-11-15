// 抽選の結果の記録。管理画面で「誰が・何に当たったか」を見るためのもの。
// 保存は JSONL（1行1件）へ追記し、メモリには直近 keep 件だけを持つ。
// ポイントや天井の数えと違って、落としても配信が壊れない軽い記録なので、失敗しても止めない。
import fs from 'node:fs';
import path from 'node:path';

export class DrawResults {
  constructor(file, { keep = 100 } = {}) {
    this.file = file ? String(file) : null;
    this.keep = Math.max(1, Math.floor(Number(keep)) || 100);
    this.items = [];
    this.appends = 0;
    this.#load();
  }

  #load() {
    if (!this.file) return;
    try {
      const lines = fs.readFileSync(this.file, 'utf8').split('\n');
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
    } catch {
      // ファイルが無い・読めないときは空で始める
    }
  }

  add(entry) {
    const item = { ts: Date.now(), ...(entry && typeof entry === 'object' ? entry : {}) };
    this.items.push(item);
    if (this.items.length > this.keep) this.items.splice(0, this.items.length - this.keep);
    if (this.file) {
      try {
        fs.mkdirSync(path.dirname(this.file), { recursive: true });
        fs.appendFileSync(this.file, `${JSON.stringify(item)}\n`);
        this.appends += 1;
        // 追記が貯まったら、保持している分だけで書き直してファイルを小さく保つ
        if (this.appends >= this.keep) {
          fs.writeFileSync(this.file, this.items.map((x) => JSON.stringify(x)).join('\n') + '\n');
          this.appends = 0;
        }
      } catch {
        // 記録に失敗しても抽選自体は止めない
      }
    }
    return item;
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
