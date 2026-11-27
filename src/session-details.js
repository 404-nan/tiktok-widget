// 配信ごとの1件ごとの記録（ギフト・フォロー・シェア・ルーレット）。
// 集計（history.js の配信のまとめ）とは別に、「誰が・いつ・何を」を配信単位の JSONL に全部残す。
// 書き込みは1秒ごとにまとめて追記し、失敗しても配信は止めない。記録は消さない。
import fs from 'node:fs';
import path from 'node:path';
import { recordError } from './error-log.js';

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
      recordError(error, { kind: 'store.write', level: 'warn', context: { op: 'sessionDetails.flush' } });
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
      recordError(error, { kind: 'store.write', level: 'warn', context: { op: 'sessionDetails.recordTo' } });
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

  /** 配信1件分の記録を新しい順に返す。kind で絞り、offset と limit でページ単位に取る。
   * ファイルは追記順（古い順）で、欲しいのは新しい方からなので、行を後ろから見て、
   * 種類の合う行だけを読み解く（種類の違う行は文字列の段階で落とす） */
  read(id, { kind = '', offset = 0, limit = 50 } = {}) {
    const safeId = path.basename(String(id ?? ''));
    const off = Math.max(0, Math.floor(Number(offset)) || 0);
    const n = Math.max(1, Math.floor(Number(limit)) || 50);
    // まだ書き出していない分が一番新しい。新しい順に並べる
    const queued = (this.sessionId === safeId ? this.queue : [])
      .filter((item) => !kind || item.kind === kind)
      .reverse();
    let total = queued.length;
    const page = [];
    // 欲しいページは、新しい順の off から n 件。キューの分で足りなければファイル側から続ける
    let skip = off;
    for (const item of queued) {
      if (skip > 0) { skip--; continue; }
      if (page.length < n) page.push(item);
    }
    let lines = [];
    try {
      lines = fs.readFileSync(path.join(this.dir, `${safeId}.jsonl`), 'utf8').split('\n');
    } catch {
      // ファイルが無い配信は、キューの分だけ
    }
    const kindMark = kind ? `"kind":${JSON.stringify(kind)}` : '';
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      if (!line.trim()) continue;
      if (kindMark && !line.includes(kindMark)) continue;
      let item;
      try {
        item = JSON.parse(line);
      } catch {
        // 壊れた行は飛ばす
        continue;
      }
      if (!item || typeof item !== 'object' || (kind && item.kind !== kind)) continue;
      total++;
      if (skip > 0) { skip--; continue; }
      if (page.length < n) page.push(item);
    }
    return { total, items: page };
  }
}
