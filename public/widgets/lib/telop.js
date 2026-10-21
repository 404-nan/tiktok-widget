// テロップの文を区切り記号つきで並べ、ニュースティッカーと一覧で使う。
// ES5 で書き、OBS の古いブラウザでも読み込める形にする。
(function (global) {
  function join(items) {
    return items.filter(function (item) { return item != null && String(item).trim(); }).map(function (item) {
      return String(item).trim();
    }).join(' ■ ');
  }

  global.Telop = { join: join };
}(window));
