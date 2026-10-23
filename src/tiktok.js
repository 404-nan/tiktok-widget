// TikTok LIVE への接続。受け取ったイベントを正規化して Hub に流す。

import { TikTokLiveConnection, WebcastEvent, ControlEvent } from 'tiktok-live-connector';
import {
  normalizeChat,
  normalizeFollow,
  normalizeGift,
  normalizeLike,
  normalizeMember,
  normalizeShare,
  normalizeViewers,
} from './normalize.js';
import { GiftStreaks } from './gift-streaks.js';

const log = (msg) => console.log(`[tiktok] ${new Date().toISOString()} ${msg}`);
const RETRY_DELAYS = [5_000, 10_000, 20_000, 40_000, 60_000];
const WATCHDOG_MS = 3 * 60 * 1000;
const JITTER = 0.2;

function jittered(delay, ratio) {
  if (!ratio) return delay;
  const spread = (Math.random() * 2 - 1) * ratio; // ±ratio
  return Math.max(0, Math.round(delay * (1 + spread)));
}

function formatSeconds(ms) {
  const sec = ms / 1000;
  if (Number.isInteger(sec)) return String(sec);
  // 1秒未満や細かい待ちも 0 に丸めない（30ミリ秒が「0.0秒」にならないように）
  const digits = sec >= 10 ? 1 : 2;
  return sec.toFixed(digits).replace(/0+$/, '').replace(/\.$/, '');
}

// ControlEvent.DISCONNECTED の引数（文字、または { code, reason }）をログ用の文にする
function reasonText(reason) {
  if (reason == null || reason === '') return '';
  if (typeof reason === 'string') return reason.trim();
  if (typeof reason === 'number' || typeof reason === 'boolean') return String(reason);
  if (typeof reason === 'object') {
    const text = reason.reason != null && reason.reason !== '' ? reasonText(reason.reason) : '';
    const code = reason.code != null && reason.code !== '' ? String(reason.code) : '';
    if (text && code) return `${text}（${code}）`;
    if (text) return text;
    if (code) return code;
    if (reason.message) return reasonText(reason.message);
  }
  return '';
}

export function connectionOptions(signApiKey) {
  return { signApiKey, processInitialData: false };
}

export class TikTokSource {
  // createConnection(username, signApiKey) で接続を差し替えられる（テスト用）
  // retryDelays: 再接続までの待ち（ミリ秒）。既定は 5, 10, 20, 40, 60 秒で頭打ち
  // jitter: 待ちのばらつき。0.2 なら ±20%。テストでは 0 にすると待ちが固定になる
  // watchdogMs: 何もイベントが来ないときに切り直すまでの時間。既定は 3 分
  constructor(hub, gifts = null, { createConnection, retryDelays, jitter, watchdogMs, connectionAllowed, waitAllowed } = {}) {
    this.hub = hub;
    this.gifts = gifts;
    // 連打の終わりの合図が来ないまま切れても、投げた分を数え落とさない
    this.streaks = new GiftStreaks((data) => this.#publishGift(data));
    this.connection = null;
    this.username = null;
    this.signApiKey = undefined;
    this.retry = 0;
    this.retryTimer = null;
    this.watchdogTimer = null;
    this.stay = false; // true のあいだは、落ちても配信が終わっても再接続を続ける
    // 配信していないあいだも接続を試し続けてよいか。だめなら待つのをやめ、wake() で再開する(接続の費用を抑える)
    this.waitAllowed = waitAllowed ?? (() => true);
    this.parked = false;
    this.connected = false;
    this.retryDelays = Array.isArray(retryDelays) && retryDelays.length ? retryDelays : RETRY_DELAYS;
    this.jitter = jitter ?? JITTER;
    this.watchdogMs = watchdogMs ?? WATCHDOG_MS;
    this.connectionAllowed = typeof connectionAllowed === 'function' ? connectionAllowed : () => true;
    this.createConnection = createConnection ?? ((username, signApiKey) => new TikTokLiveConnection(username, connectionOptions(signApiKey)));
  }

  #mayWait() {
    try {
      return this.waitAllowed() !== false;
    } catch {
      return true;
    }
  }

  // 配信が始まっていなくて、ウィジェットも開いていない。試すのをやめて、wake() を待つ
  #park() {
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    if (!this.parked) log(`@${this.username}: ウィジェットが開いていないので、接続を試すのを止めます（開いたら再開）`);
    this.parked = true;
    this.hub.setStatus({ mode: 'idle', username: this.username, message: 'OBS のウィジェットを開くと、配信への接続を始めます' });
  }

  // ウィジェットが開いたなど、また試してよくなったとき。待っていなければ何もしない
  wake(reason = 'ウィジェットが開いた') {
    if (!this.stay || !this.username || !this.parked || this.connection || this.retryTimer || this.connected) return false;
    this.parked = false;
    this.retry = 0;
    log(`@${this.username}: ${reason}ので、接続を再開します`);
    const name = this.username;
    this.#open({ reconnect: true, reason }).catch((err) => {
      if (this.stay && this.username === name) this.#scheduleRetry(err.message);
    });
    return true;
  }

  // 停止中の新しい接続は始めない。判定が落ちたときは止めない
  #allowed() {
    try {
      return this.connectionAllowed() !== false;
    } catch (err) {
      console.warn(`[billing] 接続の判定に失敗したので通します: ${err?.message ?? err}`);
      return true;
    }
  }

  async connect(username, { signApiKey } = {}) {
    const name = String(username ?? '').replace(/^@/, '').trim();
    if (!name) throw new Error('ユーザー名を入力してください');
    if (!this.#allowed()) throw new Error('お支払いの確認が取れていません。LuLにご連絡ください');
    // 前の接続を片づける処理は stay を消さない。消すのは手動の disconnect() だけ
    if (this.username && (this.connection || this.retryTimer || this.connected)) {
      log(`@${this.username} から切断しました（接続し直し）`);
    }
    await this.#close();
    this.username = name;
    this.signApiKey = signApiKey || process.env.TIKTOK_SIGN_API_KEY || undefined;
    this.retry = 0;
    this.stay = true;
    this.parked = false;
    try {
      await this.#open({ reconnect: false });
    } catch (err) {
      // 最初の接続に失敗しても、予約した再接続は残す
      if (this.stay && this.username) this.#scheduleRetry(err.message);
      throw err;
    }
  }

  async disconnect() {
    const username = this.username;
    this.stay = false;
    this.parked = false;
    this.connected = false;
    this.username = null;
    await this.#close();
    if (username) log(`@${username} から切断しました（手動）`);
  }

  // ソケットとタイマーだけ止める。stay と username は触らない
  async #close() {
    this.streaks.flushAll();
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.#clearWatchdog();
    const conn = this.connection;
    this.connection = null;
    this.connected = false;
    if (!conn) return;
    conn.removeAllListeners();
    await Promise.resolve(conn.disconnect?.()).catch(() => {});
  }

  async #open({ reconnect = false, reason = '' } = {}) {
    const username = this.username;
    if (!this.stay || !username) return;
    log(reconnect
      ? `@${username} に再接続します${reason ? `（${reason}）` : ''}`
      : `@${username} に接続します`);
    this.hub.setStatus({ mode: 'connecting', username, message: `@${username} に接続中…` });

    let conn = null;
    try {
      conn = this.createConnection(username, this.signApiKey);
      this.connection = conn;
      this.#wire(conn);
      const state = await conn.connect();
      if (this.connection !== conn || !this.stay) return; // 接続中に切断・再接続された
      const giftResult = await this.gifts?.refresh({
        fetchGifts: (language) => fetchGifts(username, state.roomId, this.signApiKey, language),
      });
      if (this.connection !== conn || !this.stay) return;
      if (giftResult?.error) console.warn('[tiktok] ギフト一覧を取得できませんでした:', giftResult.error.message);
      this.retry = 0;
      this.connected = true;
      this.#armWatchdog();
      log(`@${username} の LIVE に接続しました（room ${state.roomId}）`);
      this.hub.setStatus({ mode: 'live', username, message: `@${username} の LIVE に接続しました`, roomId: state.roomId });
    } catch (err) {
      if (conn && this.connection !== conn) return;
      if (conn) {
        conn.removeAllListeners();
        if (this.connection === conn) this.connection = null;
      }
      this.connected = false;
      this.#clearWatchdog();
      const message = describeError(err);
      this.hub.setStatus({ mode: 'error', username, message });
      if (reconnect) log(`@${username}: 再接続に失敗しました（${message}）`);
      throw new Error(message);
    }
  }

  #wire(conn) {
    // どの種類のイベントでも「生きている」とみなす。3分何も来なければ切り直す
    const emit = conn.emit.bind(conn);
    conn.emit = (type, ...args) => {
      try {
        return emit(type, ...args);
      } finally {
        if (this.connection === conn && this.connected) this.#armWatchdog();
      }
    };
    const pub = (fn) => (data) => {
      try {
        this.hub.publish({ ...fn(data), source: 'tiktok' });
      } catch (err) {
        console.warn('[tiktok] イベントの変換に失敗:', err);
      }
    };
    conn.on(WebcastEvent.GIFT, (data) => {
      try {
        if (!data?.repeatEnd && !normalizeGift(data, this.gifts)) return this.streaks.progress(data); // 連打の途中
        const done = this.streaks.end(data);
        if (done) this.#publishGift(done);
      } catch (err) {
        console.warn('[tiktok] イベントの変換に失敗:', err);
      }
    });
    conn.on(WebcastEvent.LIKE, pub(normalizeLike));
    conn.on(WebcastEvent.ROOM_USER, pub(normalizeViewers));
    conn.on(WebcastEvent.CHAT, pub(normalizeChat));
    conn.on(WebcastEvent.FOLLOW, pub(normalizeFollow));
    conn.on(WebcastEvent.SHARE, pub(normalizeShare));
    conn.on(WebcastEvent.MEMBER, pub(normalizeMember));

    conn.on(WebcastEvent.STREAM_END, () => {
      if (this.connection !== conn) return;
      this.connection = null;
      this.connected = false;
      this.#clearWatchdog();
      this.streaks.flushAll();
      log(`@${this.username} の配信が終了しました`);
      this.hub.setStatus({ mode: 'ended', message: '配信が終了しました' });
      if (this.stay) this.#scheduleRetry('配信終了');
    });
    conn.on(ControlEvent.ERROR, (err) => console.warn('[tiktok] error:', err?.info ?? err));
    conn.on(ControlEvent.DISCONNECTED, (reason) => {
      if (this.connection !== conn) return; // 自分で切ったか、配信終了
      this.connection = null;
      this.connected = false;
      this.#clearWatchdog();
      this.streaks.flushAll();
      const why = reasonText(reason);
      log(`@${this.username} から切断しました（${why || '接続が切れた'}）`);
      this.#scheduleRetry(why || '接続が切れた');
    });
  }

  #publishGift(data) {
    try {
      const event = normalizeGift(data, this.gifts);
      if (event) this.hub.publish({ ...event, source: 'tiktok' });
    } catch (err) {
      console.warn('[tiktok] イベントの変換に失敗:', err);
    }
  }

  #armWatchdog() {
    this.#clearWatchdog();
    if (!this.connected || !this.stay) return;
    this.watchdogTimer = setTimeout(() => {
      this.watchdogTimer = null;
      if (!this.connected || !this.stay || !this.connection || !this.username) return;
      const reason = 'イベントが3分来ない';
      log(`@${this.username}: ${reason}`);
      this.#forceReconnect(reason);
    }, this.watchdogMs);
    this.watchdogTimer.unref?.();
  }

  #clearWatchdog() {
    clearTimeout(this.watchdogTimer);
    this.watchdogTimer = null;
  }

  #forceReconnect(reason) {
    this.streaks.flushAll();
    const conn = this.connection;
    this.connection = null;
    this.connected = false;
    this.#clearWatchdog();
    if (conn) {
      conn.removeAllListeners();
      Promise.resolve(conn.disconnect?.()).catch(() => {});
    }
    log(`@${this.username} から切断しました（${reason}）`);
    this.#scheduleRetry(reason);
  }

  // stay が真のあいだは、待ちの上限に達しても止めずに繰り返す
  #scheduleRetry(reason = '') {
    if (!this.stay || !this.username) return;
    if (!this.#allowed()) return;
    if (!this.#mayWait()) return this.#park();
    clearTimeout(this.retryTimer);
    const base = this.retryDelays[Math.min(this.retry, this.retryDelays.length - 1)];
    this.retry += 1;
    const delay = jittered(base, this.jitter);
    const why = reason || '接続が切れた';
    const sec = formatSeconds(delay);
    log(`@${this.username}: ${why} → ${sec}秒後に再接続します（${this.retry}回目）`);
    this.hub.setStatus({ mode: 'connecting', username: this.username, message: `接続が切れました。${sec}秒後に再接続します` });
    const scheduledFor = this.username;
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (!this.stay || this.username !== scheduledFor) return;
      if (!this.#allowed()) return;
      this.#open({ reconnect: true, reason: why }).catch((err) => {
        if (this.stay && this.username === scheduledFor) this.#scheduleRetry(err.message);
      });
    }, delay);
    this.retryTimer.unref?.();
  }
}

async function fetchGifts(username, roomId, signApiKey, language) {
  const conn = new TikTokLiveConnection(username, connectionOptions(signApiKey));
  conn.webClient.roomId = roomId;
  if (language === 'ja') {
    Object.assign(conn.webClient.clientParams, {
      app_language: 'ja-JP',
      browser_language: 'ja-JP',
      webcast_language: 'ja-JP', // 'ja' だと英語名のまま返る
      region: 'JP',
      priority_region: 'JP',
    });
  }
  return conn.fetchAvailableGifts();
}

function describeError(err) {
  const name = err?.constructor?.name ?? '';
  const msg = err?.message ?? String(err);
  if (name === 'UserOfflineError' || /offline|isn't online|not live/i.test(msg)) {
    return 'まだ配信が始まっていません。配信が始まると、自動でつながります';
  }
  if (/sign|rate.?limit|429|api key/i.test(msg)) {
    return `署名サーバーでエラーになりました（API キーの設定を確認してください）: ${msg}`;
  }
  return `接続できませんでした: ${msg}`;
}
