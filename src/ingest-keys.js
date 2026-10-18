import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const hash = (value) => crypto.createHash('sha256').update(String(value)).digest('hex');

const equal = (stored, value) => {
  const digest = Buffer.from(hash(value), 'hex');
  const saved = Buffer.from(String(stored ?? ''), 'hex');
  return saved.length === digest.length && crypto.timingSafeEqual(saved, digest);
};

export class IngestKeyStore {
  constructor({ dir, file = path.join(dir, 'ingest.json'), now = () => Date.now() } = {}) {
    this.dir = dir;
    this.file = file;
    this.now = now;
    this.data = null;
    this.load();
  }

  load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!this.data?.hash || !this.data?.createdAt || !this.data?.hint) this.data = null;
    } catch {
      this.data = null;
    }
    return this.data;
  }

  create() {
    const value = `twin_${crypto.randomBytes(24).toString('hex')}`;
    this.data = { hash: hash(value), createdAt: new Date(this.now()).toISOString(), hint: value.slice(-4) };
    this.save();
    return { value, ...this.data };
  }

  remove() {
    this.data = null;
    try { fs.unlinkSync(this.file); } catch (err) { if (err.code !== 'ENOENT') throw err; }
  }

  authenticate(value) {
    return Boolean(this.data?.hash) && equal(this.data.hash, value);
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}-${crypto.randomBytes(4).toString('hex')}`;
    fs.writeFileSync(tmp, `${JSON.stringify(this.data, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, this.file);
    fs.chmodSync(this.file, 0o600);
  }
}
