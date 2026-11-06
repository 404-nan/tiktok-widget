// 最近のサポーター用の公開スクリプト。OBS で使う URL のテーマと配信者階層を保持する。
// 初期一覧は /api/info-feed、更新は WebSocket の 'event' と 'reset' を使う。
// lifetime 秒、minCoins、events で表示を絞る。
(function () {
  var path = location.pathname;
  var theme = new URLSearchParams(location.search).get('theme');
  window.SupportersPage = { path: path, theme: theme };
}());
