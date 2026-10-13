/* ガチャ。待機 → 回転中 → 結果 → 終了。見た目は後で作る。 */
(function () {
  var phaseEl = document.getElementById('phase');
  var resultEl = document.getElementById('result');
  var timeEl = document.getElementById('time');
  var base = '';
  var pathMatch = location.pathname.match(/^\/t\/[^/]+/);
  if (pathMatch) base = pathMatch[0];
  var wsProto = location.protocol.indexOf('https') === 0 ? 'wss:' : 'ws:';
  var phases = { idle: '待機', rolling: '回転中', reveal: '結果', done: '終了' };

  function show(data) {
    if (!data) return;
    var phase = data.phase || 'idle';
    phaseEl.textContent = phases[phase] || phase;
    var tier = data.tier;
    if ((phase === 'reveal' || phase === 'done') && tier) resultEl.textContent = tier.label || tier.id || '';
    else if (phase === 'idle' || phase === 'rolling') resultEl.textContent = '';
    var d = data.durations || {};
    timeEl.textContent = '回転 ' + (d.rollMs || 0) + ' / 結果 ' + (d.revealMs || 0) + ' / 終了 ' + (d.doneMs || 0);
  }

  function onText(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return; }
    if (!data || data.type !== 'gacha') return;
    show(data);
  }

  function connect() {
    var ws = new WebSocket(wsProto + '//' + location.host + base + '/ws');
    ws.onmessage = function (ev) { onText(ev.data); };
    ws.onclose = function () { setTimeout(connect, 1000); };
  }

  var req = new XMLHttpRequest();
  req.open('GET', base + '/api/gacha', true);
  req.onreadystatechange = function () {
    if (req.readyState !== 4 || req.status !== 200) return;
    try { show(JSON.parse(req.responseText)); } catch (e) {}
  };
  req.send(null);
  connect();
})();
