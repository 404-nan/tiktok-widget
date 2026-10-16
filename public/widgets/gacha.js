/* ガチャ。待機 → 回転中 → 結果 → 終了。段階の長さはサーバーの durations に合わせる。 */
(function () {
  var phaseEl = document.getElementById('phase');
  var resultEl = document.getElementById('result');
  var timeEl = document.getElementById('time');
  var stageEl = document.getElementById('stage');
  var plateEl = document.getElementById('plate');
  var base = '';
  var pathMatch = location.pathname.match(/^\/t\/[^/]+/);
  if (pathMatch) base = pathMatch[0];
  if (location.search.indexOf('preview=1') >= 0) document.body.classList.add('preview');
  var wsProto = location.protocol.indexOf('https') === 0 ? 'wss:' : 'ws:';
  var phases = { idle: '待機', rolling: '回転中', reveal: '結果', done: '終了' };

  function seconds(n) {
    var x = Number(n);
    if (!isFinite(x) || x < 0) x = 0;
    return (x / 1000) + 's';
  }

  function toneOf(tier) {
    if (!tier) return '';
    var id = String(tier.id || '');
    if (id === 'legend' || tier.pity) return 'legend';
    if (id === 'rare') return 'rare';
    return 'common';
  }

  function show(data) {
    if (!data) return;
    var phase = data.phase || 'idle';
    phaseEl.textContent = phases[phase] || phase;
    var tier = data.tier;
    if ((phase === 'reveal' || phase === 'done') && tier) resultEl.textContent = tier.label || tier.id || '';
    else if (phase === 'idle' || phase === 'rolling') resultEl.textContent = '';
    var d = data.durations || {};
    timeEl.textContent = '回転 ' + (d.rollMs || 0) + ' / 結果 ' + (d.revealMs || 0) + ' / 終了 ' + (d.doneMs || 0);
    stageEl.setAttribute('data-phase', phase);
    stageEl.setAttribute('data-tier', (phase === 'reveal' || phase === 'done') ? toneOf(tier) : '');
    stageEl.style.setProperty('--roll', seconds(d.rollMs));
    stageEl.style.setProperty('--reveal', seconds(d.revealMs));
    stageEl.style.setProperty('--done', seconds(d.doneMs));
    if (phase === 'idle') document.body.classList.remove('on');
    else document.body.classList.add('on');
    plateEl.classList.remove('go');
    if (phase !== 'idle') {
      plateEl.offsetWidth;
      plateEl.classList.add('go');
    }
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
