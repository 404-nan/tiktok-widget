// 配信の準備がどこまで済んだかを、名前や URL を残さず記録する。
import fs from 'node:fs';
import path from 'node:path';

const EMPTY = { selectedAt: null, widgetAt: null, testedAt: null, liveAt: null, autoConnect: true };

export class PreparationStore {
  constructor(file, now = Date.now) {
    this.file = file;
    this.now = now;
    this.state = { ...EMPTY };
    try { this.state = { ...EMPTY, ...JSON.parse(fs.readFileSync(file, 'utf8')) }; } catch {}
  }

  snapshot() { return { ...this.state }; }

  setAutoConnect(on) {
    this.state.autoConnect = Boolean(on);
    this.#save();
    return this.snapshot();
  }

  mark(step) {
    if (!Object.hasOwn(EMPTY, step) || step === 'autoConnect' || this.state[step]) return false;
    this.state[step] = this.now();
    this.#save();
    return true;
  }

  #save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const temp = `${this.file}.tmp-${process.pid}`;
    fs.writeFileSync(temp, JSON.stringify(this.state, null, 2));
    fs.renameSync(temp, this.file);
  }
}
