// 配信イベントの先書き日誌。処理前に JSONL へ同期追記し、
// 再起動・別機械へのコピー後に同じ epoch のイベントを復元する。
import fs from 'node:fs';
import path from 'node:path';

const MODE = 0o600;

const clone = (value) => JSON.parse(JSON.stringify(value));

export function eventKey(event) {
  const key = event?.msgId ?? event?.eventId ?? null;
  return key == null || key === '' ? null : String(key);
}

export function dedupeKey(epoch, event) {
  const key = eventKey(event);
  if (!key) return null;
  const bucket = event?.test === true ? 'test' : 'live';
  return `${epoch}|${bucket}|${key}`;
}

export class EventJournal {
  constructor(file) {
    this.file = file;
    this.rows = [];
    this.lastRow = null;
    this.corruptLines = 0;
    this.#load();
  }

  #load() {
    let text;
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch {
      return;
    }
    const lines = text.split('\n');
    if (lines.at(-1) === '') lines.pop();
    lines.forEach((line, index) => {
      try {
        const row = JSON.parse(line);
        if (!Number.isSafeInteger(row?.seq) || typeof row?.epoch !== 'string' || !row?.event) throw new Error('行の形が正しくありません');
        this.rows.push(row);
        this.lastRow = row;
      } catch (error) {
        // 書き込み途中で落ちた最終行だけを読み飛ばす。それ以外の破損も数えて、起動を止めない。
        this.corruptLines += 1;
        console.warn(`[journal] ${this.file}:${index + 1} を読み飛ばしました: ${error.message}`);
      }
    });
  }

  latestEpoch() {
    return this.lastRow?.epoch ?? null;
  }

  latestRoomId() {
    for (let index = this.rows.length - 1; index >= 0; index -= 1) {
      const roomId = this.rows[index]?.roomId;
      if (typeof roomId === 'string' && roomId) return roomId;
    }
    return null;
  }

  rowsForEpoch(epoch) {
    return this.rows.filter((row) => row.epoch === epoch);
  }

  append({ seq, epoch, event, visualOnly = false, roomId = null }) {
    const row = {
      seq,
      epoch,
      key: eventKey(event),
      kind: event?.kind ?? 'unknown',
      test: event?.test === true,
      visualOnly: visualOnly === true,
      roomId,
      event: clone(event),
    };
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.appendFileSync(this.file, `${JSON.stringify(row)}\n`, { mode: MODE });
    fs.chmodSync(this.file, MODE);
    this.rows.push(row);
    this.lastRow = row;
    return row;
  }
}

export function rowDedupeKey(row) {
  if (!row?.key) return null;
  const bucket = row.test === true ? 'test' : 'live';
  return `${row.epoch}|${bucket}|${row.key}`;
}
