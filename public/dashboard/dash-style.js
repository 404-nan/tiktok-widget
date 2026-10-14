// ダッシュボードの見た目（3案）を切り替える。
// 選んだ案は localStorage の dash-style に残す。?style=a|b|c で開くと、その案にして残す。
// 描く前に <html data-style> を決めたいので、<head> で同期読み込みする（ES5 で書く）。
(function () {
  var KEY = 'dash-style';
  var STYLES = {
    a: { name: 'ライト・ニュートラル', scheme: 'light' },
    b: { name: 'ダーク・高密度', scheme: 'dark' },
    c: { name: '配信ツール・高コントラスト', scheme: 'dark' }
  };
  var root = document.documentElement;

  function read(key) {
    try { return localStorage.getItem(key); } catch (e) { return null; }
  }
  function save(value) {
    try { localStorage.setItem(KEY, value); } catch (e) {}
  }

  // 初めて開いたときは、今までの明るさの設定に近い案にする（明るい → A、暗い → B）
  function initial() {
    var m = /[?&]style=([abc])(?:&|$)/.exec(location.search);
    if (m) {
      save(m[1]);
      return m[1];
    }
    var saved = read(KEY);
    if (STYLES[saved]) return saved;
    return read('tw:theme') === '"light"' ? 'a' : 'b';
  }

  function render(style) {
    var box = document.getElementById('styleSwitch');
    if (!box) return;
    var name = document.getElementById('styleName');
    if (name) name.textContent = STYLES[style].name;
    var buttons = box.querySelectorAll('[data-set-style]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute('aria-pressed', String(buttons[i].getAttribute('data-set-style') === style));
    }
  }

  function apply(style) {
    root.setAttribute('data-style', style);
    // 案ごとに明るさが決まっている。ほかの画面（モニター・統計）の明るさの設定は変えない
    root.setAttribute('data-theme', STYLES[style].scheme);
    render(style);
  }

  function bind() {
    var box = document.getElementById('styleSwitch');
    if (!box) return;
    box.addEventListener('click', function (ev) {
      var target = ev.target;
      while (target && target !== box && !target.getAttribute('data-set-style')) target = target.parentNode;
      if (!target || target === box) return;
      var style = target.getAttribute('data-set-style');
      if (!STYLES[style]) return;
      apply(style);
      save(style);
    });
    render(root.getAttribute('data-style'));
  }

  apply(initial());
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind);
  else bind();
})();
