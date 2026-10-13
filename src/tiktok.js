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

const log = (msg) => console.log(`[tiktok] ${new Date().toISOString()} ${msg}`);
const RETRY_DELAYS = [5_000, 10_000, 20_000, 40_000, 60_000];

export function connectionOptions(signApiKey) {
  return { signApiKey, processInitialData: false };
}

export class TikTokSource {
  constructor(hub, gifts = null) {
    this.hub = hub;
    this.connection = null;
    this.username = null;
    this.signApiKey = undefined;
    this.retry = 0;
    this.retryTimer = null;
    this.gifts = gifts;
  }

  async connect(username, { signApiKey } = {}) {
    await this.disconnect();
    this.username = username.replace(/^@/, '').trim();
    this.signApiKey = signApiKey || process.env.TIKTOK_SIGN_API_KEY || undefined;
    this.retry = 0;
    this.stay = true; // 切るまでつなぎ続ける（落ちても配信が終わっても再接続を続ける）
    log(`@${this.username} に接続します`);
    try {
      await this.#open();
    } catch (err) {
      this.#scheduleRetry(err.message);
      throw err;
    }
  }

  async disconnect() {
    if (this.username) log(`@${this.username} から切断しました（手動または接続し直し）`);
    this.stay = false;
    clearTimeout(this.retryTimer);
    this.retryTimer = null;
    const conn = this.connection;
    this.connection = null;
    this.username = null;
    if (conn) {
      conn.removeAllListeners();
      await conn.disconnect().catch(() => {});
    }
  }

  async #open() {
    const username = this.username;
    this.hub.setStatus({ mode: 'connecting', username, message: `@${username} に接続中…` });

    const conn = new TikTokLiveConnection(username, connectionOptions(this.signApiKey));
    this.connection = conn;
    this.#wire(conn);

    try {
      const state = await conn.connect();
      if (this.connection !== conn) return; // 接続中に切断・再接続された
      const giftResult = await this.gifts?.refresh({
        fetchGifts: (language) => fetchGifts(username, state.roomId, this.signApiKey, language),
      });
      if (giftResult?.error) console.warn('[tiktok] ギフト一覧を取得できませんでした:', giftResult.error.message);
      this.retry = 0;
      log(`@${username} の LIVE に接続しました（room ${state.roomId}）`);
      this.hub.setStatus({ mode: 'live', username, message: `@${username} の LIVE に接続しました`, roomId: state.roomId });
    } catch (err) {
      if (this.connection !== conn) return;
      conn.removeAllListeners();
      this.connection = null;
      const message = describeError(err);
      this.hub.setStatus({ mode: 'error', username, message });
      throw new Error(message);
    }
  }

  #wire(conn) {
    const pub = (fn) => (data) => {
      try {
        this.hub.publish(fn(data));
      } catch (err) {
        console.warn('[tiktok] イベントの変換に失敗:', err);
      }
    };
    conn.on(WebcastEvent.GIFT, pub((data) => normalizeGift(data, this.gifts)));
    conn.on(WebcastEvent.LIKE, pub(normalizeLike));
    conn.on(WebcastEvent.ROOM_USER, pub(normalizeViewers));
    conn.on(WebcastEvent.CHAT, pub(normalizeChat));
    conn.on(WebcastEvent.FOLLOW, pub(normalizeFollow));
    conn.on(WebcastEvent.SHARE, pub(normalizeShare));
    conn.on(WebcastEvent.MEMBER, pub(normalizeMember));

    conn.on(WebcastEvent.STREAM_END, () => {
      if (this.connection !== conn) return;
      this.connection = null;
      log(`@${this.username} の配信が終了しました`);
      this.hub.setStatus({ mode: 'ended', message: '配信が終了しました' });
      if (this.stay) this.#scheduleRetry('配信終了');
    });
    conn.on(ControlEvent.ERROR, (err) => console.warn('[tiktok] error:', err?.info ?? err));
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (this.connection !== conn) return; // 自分で切ったか、配信終了
      this.connection = null;
      this.#scheduleRetry('接続が切れた');
    });
  }

  #scheduleRetry(reason = '') {
    if (!this.stay || !this.username) return;
    clearTimeout(this.retryTimer);
    const delay = RETRY_DELAYS[Math.min(this.retry++, RETRY_DELAYS.length - 1)];
    log(`@${this.username}: ${reason} → ${delay / 1000}秒後に再接続します（${this.retry}回目）`);
    this.hub.setStatus({ mode: 'connecting', username: this.username, message: `接続が切れました。${delay / 1000}秒後に再接続します` });
    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      this.#open().catch((err) => this.#scheduleRetry(err.message));
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
    return 'まだ配信が始まっていません。TikTok で配信を始めてから、もう一度「接続」を押してください';
  }
  if (/sign|rate.?limit|429|api key/i.test(msg)) {
    return `署名サーバーでエラーになりました（API キーの設定を確認してください）: ${msg}`;
  }
  return `接続できませんでした: ${msg}`;
}
