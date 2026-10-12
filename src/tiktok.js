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
    await this.#open();
  }

  async disconnect() {
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
      this.hub.setStatus({ mode: 'ended', message: '配信が終了しました' });
    });
    conn.on(ControlEvent.ERROR, (err) => console.warn('[tiktok] error:', err?.info ?? err));
    conn.on(ControlEvent.DISCONNECTED, () => {
      if (this.connection !== conn) return; // 自分で切ったか、配信終了
      this.connection = null;
      this.#scheduleRetry();
    });
  }

  #scheduleRetry() {
    if (this.retry >= RETRY_DELAYS.length) {
      this.hub.setStatus({ mode: 'error', message: '接続が切れました。再接続をあきらめました' });
      return;
    }
    const delay = RETRY_DELAYS[this.retry++];
    this.hub.setStatus({ mode: 'connecting', message: `接続が切れました。${delay / 1000}秒後に再接続します` });
    this.retryTimer = setTimeout(() => {
      this.#open().catch(() => this.#scheduleRetry());
    }, delay);
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
