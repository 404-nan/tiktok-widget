/* スロットの結果をサーバーから受け取り、順番に開示する（ES5）。 */
(function () {
  var root = document.getElementById('slot');
  var reels = document.querySelectorAll('.reel');
  var message = document.getElementById('message');
  var meta = document.getElementById('meta');
  var base = '';
  var pathMatch = location.pathname.match(/^\/t\/[^/]+/);
  if (pathMatch) base = pathMatch[0];
  var cfg = { reelStopMs: 700, symbols: [] };
  var timers = [];
  var current = null;

  function clearTimers() {
    var i;
    for (i = 0; i < timers.length; i++) clearTimeout(timers[i]);
    timers = [];
  }

  function wait(ms, fn) {
    var timer = setTimeout(function () { timers.splice(timers.indexOf(timer), 1); fn(); }, Math.max(0, Number(ms) || 0));
    timers.push(timer);
  }

  function symbolNames() {
    var out = [];
    var list = cfg.symbols || [];
    var i;
    for (i = 0; i < list.length; i++) out.push(String(list[i].label || list[i].id || list[i]));
    return out.length ? out : ['？'];
  }

  function setReel(index, value, spinning) {
    if (!reels[index]) return;
    reels[index].querySelector('.symbol').textContent = value || '？';
    reels[index].className = 'reel' + (spinning ? ' spin' : '');
  }

  function fakeSymbol(actual) {
    var list = symbolNames();
    var i;
    for (i = 0; i < list.length; i++) if (list[i] !== actual) return list[i];
    return actual;
  }

  function displayResult(result, trigger, payout) {
    var symbols = result.symbols || ['？', '？', '？'];
    var stop = Number(cfg.reelStopMs) || 700;
    var i;
    clearTimers();
    current = result;
    root.setAttribute('data-tier', result.tier || 'lose');
    root.className = '';
    message.textContent = '';
    meta.textContent = '';
    for (i = 0; i < 3; i++) setReel(i, '？', true);
    if (result.revival || result.nearMiss) setReel(2, fakeSymbol(symbols[2]), true);
    for (i = 0; i < 3; i++) (function (index) {
      wait(stop * (index + 1), function () {
        setReel(index, (result.revival || result.nearMiss) && index === 2 ? fakeSymbol(symbols[2]) : symbols[index], false);
        if (index === 2) finishReveal(result, trigger, payout);
      });
    }(i));
  }

  function finishReveal(result, trigger, payout) {
    var name = trigger && trigger.gift ? giftDisplayName(trigger.gift) : '';
    if (result.nearMiss) root.className = 'near-miss';
    if (result.reach) root.className += ' reach';
    message.textContent = payout && payout.text ? payout.text : (result.tier === 'lose' ? 'はずれ' : result.tier);
    meta.textContent = name ? name + '・' + (trigger.user && trigger.user.name ? trigger.user.name : '') : '';
    if (result.revival) {
      wait(900, function () {
        root.className = 'revival flash';
        setReel(2, result.symbols[2], false);
        message.textContent = payout && payout.text ? payout.text : '復活';
        wait(250, function () { root.className = 'revival'; });
      });
    } else if (result.nearMiss) {
      wait(650, function () { setReel(2, result.symbols[2], false); });
    }
  }

  function onMessage(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return; }
    if (!data || data.type !== 'slot') return;
    if (data.event === 'start' && data.result) displayResult(data.result, data.trigger, data.payout);
    if (data.event === 'done' && !data.result) { current = null; }
  }

  function connect() {
    var proto = location.protocol.indexOf('https') === 0 ? 'wss:' : 'ws:';
    var ws = new WebSocket(proto + '//' + location.host + base + '/ws');
    ws.onmessage = function (ev) { onMessage(ev.data); };
    ws.onclose = function () { setTimeout(connect, 1000); };
  }

  var req = new XMLHttpRequest();
  req.open('GET', base + '/api/config', true);
  req.onreadystatechange = function () {
    var data;
    if (req.readyState !== 4 || req.status !== 200) return;
    try { data = JSON.parse(req.responseText); cfg = data.config && data.config.slots ? data.config.slots : cfg; } catch (e) {}
  };
  req.send(null);

  var state = new XMLHttpRequest();
  state.open('GET', base + '/api/slot', true);
  state.onreadystatechange = function () {
    var data;
    if (state.readyState !== 4 || state.status !== 200) return;
    try {
      data = JSON.parse(state.responseText);
      if (data.result && data.phase !== 'idle') displayResult(data.result, data.trigger, data.payout);
    } catch (e) {}
  };
  state.send(null);
  connect();
}());
