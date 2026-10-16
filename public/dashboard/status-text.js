// 接続状態の表示文。設定・統計・モニターが /api/status と WebSocket の両方で使う。
const STATUS = { idle: '未接続', connecting: '接続中', live: 'LIVE', demo: 'デモ', error: 'エラー', ended: '配信終了' };

export const statusText = (status) =>
  status.username && status.mode === 'live' ? `LIVE · @${status.username}` : STATUS[status.mode] ?? status.mode;

/**
 * WebSocket の受信と /api/status のポーリングの、どちらが新しいかをシーケンスで決める。
 * ポーリングを出したあと、WebSocket の受信か、より新しいポーリングがあると、その返事は捨てる。
 */
export function createStatusGate() {
  let seq = 0;
  return {
    markReceived() {
      seq += 1;
      return seq;
    },
    startPoll() {
      seq += 1;
      return seq;
    },
    acceptPoll(ticket) {
      return ticket === seq;
    },
  };
}
