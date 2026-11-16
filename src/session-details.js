// 配信ごとの1件ごとの記録（ギフト・フォロー・シェア・ルーレット）。
// 集計（history.js の配信のまとめ）とは別に、「誰が・いつ・何を」を配信単位の JSONL に全部残す。
// 書き込みは1秒ごとにまとめて追記し、失敗しても配信は止めない。記録は消さない。
import fs from 'node:fs';
import path from 'node:path';

export class SessionDetails {
  constructor(dir) {
    this.dir = dir;
    this.sessionId = null;
    this.queue = [];
    this.timer = setInterval(() => this.flush(), 1000);
    this.timer.unref?.();
  }

  start(id) {
    this.flush();
    this.sessionId = id;
    this.queue = [];
  }

  record(entry) {
    if (!this.sessionId || !entry || typeof entry !== 'object') return;
    this.queue.push(entry);
  }

  flush() {
    if (!this.sessionId || !this.queue.length) return;
    const count = this.queue.length;
    const lines = this.queue.map((entry) => JSON.stringify(entry)).join('\n') + '\n';
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.appendFileSync(path.join(this.dir, `${this.sessionId}.jsonl`), lines);
      // 書けた分だけキューから外す。失敗したらキューに残し、次の flush で書き直す
      this.queue.splice(0, count);
    } catch (error) {
      console.warn(`[session-details] 記録を書けませんでした: ${error.message}`);
    }
  }

  /** 今の配信でない配信（終わった直前の配信など）へ、遅れて届いた結果を直接書く */
  recordTo(id, entry) {
    if (!id || !entry || typeof entry !== 'object') return;
    if (id === this.sessionId) { this.record(entry); return; }
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      fs.appendFileSync(path.join(this.dir, `${path.basename(String(id))}.jsonl`), `${JSON.stringify(entry)}\n`);
    } catch (error) {
      console.warn(`[session-details] 記録を書けませんでした: ${error.message}`);
    }
  }

  end() {
    this.flush();
    this.sessionId = null;
    this.queue = [];
  }

  close() {
    clearInterval(this.timer);
    this.end();
  }

  /** 配信1件分の記録を新しい順に返す。kind で絞り、offset と limit でページ単位に取る */
  read(id, { kind = '', offset = 0, limit = 50 } = {}) {
    const safeId = path.basename(String(id ?? ''));
    let items = [];
    try {
      const text = fs.readFileSync(path.join(this.dir, `${safeId}.jsonl`), 'utf8');
      for (const line of text.split('\n')) {
        if (!line.trim()) continue;
        try {
          const item = JSON.parse(line);
          if (item && typeof item === 'object') items.push(item);
        } catch {
          // 壊れた行は飛ばす
        }
      }
    } catch {
      // ファイルが無い配信は空で返す
    }
    // 今の配信は、まだ書き出していない分も含める
    if (this.sessionId === safeId && this.queue.length) items = items.concat(this.queue);
    if (kind) items = items.filter((item) => item.kind === kind);
    items.reverse();
    const total = items.length;
    const off = Math.max(0, Math.floor(Number(offset)) || 0);
    const n = Math.max(1, Math.floor(Number(limit)) || 50);
    return { total, items: items.slice(off, off + n) };
  }
}
