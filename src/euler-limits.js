// Euler Stream の公式 rate_limits を読み、上限だけを短時間キャッシュする。
// API キーは送信ヘッダだけに使い、キャッシュやログへ書かない。
import fs from 'node:fs';
import path from 'node:path';

const FIVE_MINUTES = 5 * 60 * 1000;
const ONE_MINUTE = 60 * 1000;

function normalizeWindow(value) {
  if (!value || typeof value !== 'object') return null;
  if (!Number.isFinite(value.max) || !Number.isFinite(value.remaining)) return null;
  return { max: value.max, remaining: value.remaining, reset_at: typeof value.reset_at === 'string' ? value.reset_at : null };
}

export class EulerLimits {
  constructor({
    file,
    key = () => process.env.TIKTOK_SIGN_API_KEY,
    baseUrl = 'https://api.eulerstream.com',
    fetchImpl = fetch,
    now = Date.now,
    staleMs = FIVE_MINUTES,
    manualMinIntervalMs = ONE_MINUTE,
  } = {}) {
    this.file = file;
    this.key = key;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.fetchImpl = fetchImpl;
    this.now = now;
    this.staleMs = staleMs;
    this.manualMinIntervalMs = manualMinIntervalMs;
    this.lastFetchAt = 0;
    this.lastError = null;
  }

  #readCache() {
    if (!this.file) return null;
    try {
      const saved = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (!saved || typeof saved !== 'object' || !saved.limits) return null;
      return saved;
    } catch {
      return null;
    }
  }

  state() {
    const saved = this.#readCache();
    const fetchedAt = Number.isFinite(saved?.fetchedAt) ? saved.fetchedAt : null;
    return {
      available: Boolean(saved?.limits),
      fetchedAt,
      stale: fetchedAt === null ? true : this.now() - fetchedAt > this.staleMs,
      limits: saved?.limits ?? null,
      error: this.lastError,
    };
  }

  async refreshIfStale() {
    const state = this.state();
    if (!state.stale) return state;
    return this.refresh({ force: false });
  }

  async refresh({ force = false } = {}) {
    const now = this.now();
    if (this.lastFetchAt && now - this.lastFetchAt < this.manualMinIntervalMs) {
      return { ...this.state(), throttled: true };
    }
    const token = typeof this.key === 'function' ? this.key() : this.key;
    if (!token) {
      this.lastError = { message: 'Euler Stream の API キーが入っていません', at: now, status: null };
      return { ...this.state(), error: this.lastError };
    }
    this.lastFetchAt = now;
    const previous = this.state();
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      let res;
      try {
        res = await this.fetchImpl(`${this.baseUrl}/accounts/me/rate_limits?type=WEBCAST`, {
          headers: { accept: 'application/json', 'x-api-key': token },
          signal: controller.signal,
        });
      } finally {
        clearTimeout(timer);
      }
      if (!res.ok) {
        this.lastError = { message: `rate limits を読めませんでした`, at: now, status: res.status ?? null };
        return { ...previous, error: this.lastError, fetchedAt: previous.fetchedAt };
      }
      const body = await res.json();
      const limits = {
        minute: normalizeWindow(body?.minute),
        hour: normalizeWindow(body?.hour),
        day: normalizeWindow(body?.day),
      };
      if (!limits.minute && !limits.hour && !limits.day) throw new Error('rate limits の形が違います');
      const saved = { fetchedAt: now, limits };
      if (this.file) {
        fs.mkdirSync(path.dirname(this.file), { recursive: true, mode: 0o700 });
        fs.writeFileSync(this.file, JSON.stringify(saved, null, 2), { mode: 0o600 });
        try { fs.chmodSync(this.file, 0o600); } catch {}
      }
      this.lastError = null;
      return { available: true, fetchedAt: now, stale: false, limits, error: null };
    } catch (err) {
      this.lastError = { message: err.name === 'AbortError' ? 'rate limits の読み込みが時間切れでした' : err.message, at: now, status: null };
      return { ...previous, error: this.lastError, fetchedAt: previous.fetchedAt };
    }
  }
}
