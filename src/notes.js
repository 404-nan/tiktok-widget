// 管理者が配信者へ知らせる更新のお知らせ。
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const clean = (value, max) => String(value ?? '').trim().slice(0, max);

export class NotesStore {
  constructor({ dir, file = path.join(dir, 'notes.json') }) {
    this.dir = dir;
    this.file = file;
    this.notes = [];
    this.load();
  }

  load() {
    try {
      const data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      this.notes = Array.isArray(data.notes) ? data.notes.filter((note) => note && note.id) : [];
    } catch {
      this.notes = [];
    }
    return this.list();
  }

  list() {
    return this.notes
      .map((note) => ({ ...note }))
      .sort((a, b) => String(b.date).localeCompare(String(a.date)) || String(b.id).localeCompare(String(a.id)));
  }

  create(input = {}) {
    const note = {
      id: crypto.randomBytes(8).toString('hex'),
      title: clean(input.title, 200),
      body: clean(input.body, 10_000),
      date: clean(input.date, 40) || new Date().toISOString().slice(0, 10),
    };
    this.#validate(note);
    this.notes.push(note);
    this.save();
    return { ...note };
  }

  update(id, patch = {}) {
    const note = this.notes.find((item) => item.id === id);
    if (!note) throw new Error('そのお知らせは見つかりません');
    for (const key of ['title', 'body', 'date']) if (patch[key] != null) note[key] = clean(patch[key], key === 'body' ? 10_000 : key === 'title' ? 200 : 40);
    this.#validate(note);
    this.save();
    return { ...note };
  }

  remove(id) {
    const before = this.notes.length;
    this.notes = this.notes.filter((note) => note.id !== id);
    if (this.notes.length === before) return false;
    this.save();
    return true;
  }

  save() {
    fs.mkdirSync(this.dir, { recursive: true });
    const tmp = `${this.file}.tmp-${process.pid}`;
    fs.writeFileSync(tmp, `${JSON.stringify({ notes: this.notes }, null, 2)}\n`);
    fs.renameSync(tmp, this.file);
  }

  #validate(note) {
    if (!note.title) throw new Error('タイトルを入れてください');
    if (!note.body) throw new Error('本文を入れてください');
    if (!note.date) throw new Error('日付を入れてください');
  }
}

