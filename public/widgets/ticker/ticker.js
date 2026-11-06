// ニュースティッカー用の公開スクリプト。ES5 の共有部品を読み込むページであることを示す。
// 実際のデータは /api/sample と WebSocket の 'sample' から ticker.html が受け取る。
// ?preview=1 の見本表示にも対応する。
// goals の進み具合と、giftCount / minCoins も ticker.html の表示条件に使う。
// goal の step があるときは達成ごとに次の目標へ進める。
(function () {
  var path = location.pathname;
  var theme = new URLSearchParams(location.search).get('theme');
  window.TickerPage = { path: path, theme: theme };
}());
