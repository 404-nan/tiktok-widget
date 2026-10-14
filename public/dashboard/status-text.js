// 接続状態の表示文。設定・統計・モニターが /api/status と WebSocket の両方で使う。
const STATUS = { idle: '未接続', connecting: '接続中', live: 'LIVE', demo: 'デモ', error: 'エラー', ended: '配信終了' };

export const statusText = (status) =>
  status.username && status.mode === 'live' ? `LIVE · @${status.username}` : STATUS[status.mode] ?? status.mode;
