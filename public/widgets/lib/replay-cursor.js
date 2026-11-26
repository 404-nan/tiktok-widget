// WebSocket の再接続で使う epoch・連番の保持と重複除外。

export class ReplayCursor {
  constructor(limit = 1000) {
    this.limit = limit;
    this.epoch = null;
    this.lastSeq = null;
    this.sequences = new Set();
    this.order = [];
  }

  hello(message) {
    const sameEpoch = this.epoch != null && this.epoch === message.epoch;
    if (!sameEpoch) {
      this.sequences.clear();
      this.order = [];
      this.lastSeq = sequenceOf(message.seq);
    } else if (message.gap) {
      this.sequences.clear();
      this.order = [];
    } else if (this.lastSeq == null) {
      this.lastSeq = sequenceOf(message.seq);
    }
    this.epoch = message.epoch ?? null;
  }

  accept(message) {
    const sequence = sequenceOf(message.event?.id);
    if (sequence == null) return true;
    if (this.sequences.has(sequence) || (this.lastSeq != null && sequence <= this.lastSeq)) return false;
    this.sequences.add(sequence);
    this.order.push(sequence);
    if (this.order.length > this.limit) this.sequences.delete(this.order.shift());
    this.lastSeq = sequence;
    return true;
  }
}

function sequenceOf(value) {
  const sequence = Number(value);
  return Number.isSafeInteger(sequence) && sequence >= 0 ? sequence : null;
}
