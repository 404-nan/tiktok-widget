// API キーの保存と表示。値は保存時以外、決して外へ返さない。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const maskApiKey = (value) => {
  const key = String(value ?? '');
  return key.length > 12 ? `${key.slice(0, 8)}…${key.slice(-4)}` : '…';
};

const safeText = (value, max) => String(value ?? '').trim().slice(0, max);

export class ApiKeyStore {
  constructor({ dir, file = path.join(dir, 'api-keys.json'), signKey }) {
    this.dir = dir;
    this.file = file;
    this.signKey = signKey;
    this.keys = [];
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.keys = Array.isArray(data.keys) ? data.keys.filter((key) => key && key.id && key.value) : [];
      fs.chmodSync(this.file, 0o600);
    } catch {
      this.keys = [];
    }
    return this.list();
  }

  list() {
    const sign = this.signKey.state(true);
    const eulerstream = {
      id: 'eulerstream',
      name: 'Eulerstream',
      type: 'TikTok 接続',
      savedAt: sign.savedAt,
      environment: sign.source === 'env' ? '環境変数' : sign.source === 'admin' ? 'data' : '未設定',
      source: sign.source,
      masked: sign.masked,
      readOnly: sign.source === 'env',
      set: sign.set,
    };
    return [eulerstream, ...this.keys.map((key) => this.#public(key))];
  }

  add({ name, type, value }) {
    const key = this.#secret({
      id: crypto.randomBytes(8).toString('hex'),
      name,
      type,
      value,
    });
    this.keys.push(key);
    this.save();
    return this.#public(key);
  }

  update(id, patch = {}) {
    if (id === 'eulerstream') {
      if (patch.value == null) throw new Error('Eulerstream のキーを入れてください');
      this.signKey.set(patch.value);
      return this.list().find((key) => key.id === id);
    }
    const key = this.keys.find((item) => item.id === id);
    if (!key) throw new Error('その API キーは見つかりません');
    if (patch.name != null) key.name = safeText(patch.name, 120);
    if (patch.type != null) key.type = safeText(patch.type, 120);
    if (patch.value != null && String(patch.value).trim()) {
      key.value = this.#checkValue(patch.value);
      key.savedAt = new Date().toISOString();
    }
    if (!key.name || !key.type) throw new Error('名前と種類を入れてください');
    this.save();
    return this.#public(key);
  }

  remove(id) {
    if (id === 'eulerstream') {
      this.signKey.set('');
      return true;
    }
    const before = this.keys.length;
    this.keys = this.keys.filter((key) => key.id !== id);
    if (before === this.keys.length) throw new Error('その API キーは見つかりません');
    this.save();
    return true;
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify({ keys: this.keys }, null, 2)}\n`, { mode: 0o600 });
    fs.chmodSync(tmp, 0o600);
    fs.renameSync(tmp, this.file);
    fs.chmodSync(this.file, 0o600);
  }

  #secret(input) {
    const key = {
      id: input.id,
      name: safeText(input.name, 120),
      type: safeText(input.type, 120),
      value: this.#checkValue(input.value),
      savedAt: new Date().toISOString(),
    };
    if (!key.name || !key.type) throw new Error('名前と種類を入れてください');
    return key;
  }

  #checkValue(value) {
    const key = String(value ?? '').trim();
    if (!key || key.length > 1000 || /[\r\n]/.test(key)) throw new Error('API キーの形が正しくありません');
    return key;
  }

  #public(key) {
    return { id: key.id, name: key.name, type: key.type, savedAt: key.savedAt, environment: 'data', source: 'admin', masked: maskApiKey(key.value), readOnly: false, set: true };
  }
}
