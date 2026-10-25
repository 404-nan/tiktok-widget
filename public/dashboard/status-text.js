// 接続状態の表示文。設定・統計・モニターが /api/status と WebSocket の両方で使う。
const STATUS = { idle: '配信につながっていません', connecting: 'つないでいます…', live: '配信中', demo: 'ためし中', error: 'つながりませんでした', ended: '配信が終わりました' };

export const statusText = (status) =>
  status.username && status.mode === 'live' ? `配信中 · @${status.username}`
    : status.username && status.mode === 'idle' ? '配信を待っています（始まると自動でつながります）'
      : STATUS[status.mode] ?? status.mode;

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
