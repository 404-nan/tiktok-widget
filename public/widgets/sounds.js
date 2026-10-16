/* ギフト別サウンド。サーバーが決めた音を鳴らすだけ。画面には何も出さない。Chromium 103（ES5）向け。 */
(function () {
  var base = '';
  var pathMatch = location.pathname.match(/^\/t\/[^/]+/);
  if (pathMatch) base = pathMatch[0];
  var wsProto = location.protocol.indexOf('https') === 0 ? 'wss:' : 'ws:';
  var active = [];
  var wait = [];
  var seen = {};
  var cap = 3;
  var reported = false;

  function xhr(method, url, body, cb) {
    var req = new XMLHttpRequest();
    req.open(method, base + url, true);
    if (body != null) req.setRequestHeader('Content-Type', 'application/json');
    req.onreadystatechange = function () {
      if (req.readyState === 4 && cb) cb(req.status, req.responseText);
    };
    req.send(body == null ? null : JSON.stringify(body));
  }

  function clamp(n, min, max, fallback) {
    var v = Number(n);
    if (!isFinite(v)) return fallback;
    if (v < min) return min;
    if (v > max) return max;
    return v;
  }

  function limit() {
    return clamp(cap, 1, 5, 3);
  }

  function reportMuted() {
    if (reported) return;
    reported = true;
    xhr('POST', '/api/gift-sounds/autoplay', { muted: true });
  }

  function pump() {
    while (active.length < limit() && wait.length) start(wait.shift());
  }

  function start(msg) {
    var queued, audio, master, rule, gain, maxSeconds, stopped, slot;
    if (!msg || !msg.token || !msg.mediaId) return;
    if (seen[msg.token]) return;
    if (msg.maxConcurrent != null) cap = clamp(msg.maxConcurrent, 1, 5, 3);
    if (active.length >= limit()) {
      for (queued = 0; queued < wait.length; queued++) {
        if (wait[queued].token === msg.token) return;
      }
      wait.push(msg);
      while (wait.length > 10) wait.shift();
      return;
    }
    seen[msg.token] = 1;
    audio = document.createElement('audio');
    audio.src = base + '/api/media-alerts/' + msg.mediaId + '/file';
    audio.preload = 'auto';
    master = clamp(msg.masterVolume, 0, 100, 80) / 100;
    rule = clamp(msg.volume, 0, 100, 100) / 100;
    gain = master * rule;
    if (gain < 0) gain = 0;
    if (gain > 1) gain = 1;
    audio.volume = gain;
    maxSeconds = clamp(msg.maxSeconds, 1, 30, 8);
    stopped = false;
    slot = { token: msg.token, audio: audio, timer: null };
    function done() {
      var i;
      if (stopped) return;
      stopped = true;
      if (slot.timer) clearTimeout(slot.timer);
      try { audio.pause(); } catch (e) {}
      if (audio.parentNode) audio.parentNode.removeChild(audio);
      i = active.indexOf(slot);
      if (i >= 0) active.splice(i, 1);
      xhr('POST', '/api/gift-sounds/ack', { token: msg.token });
      pump();
    }
    active.push(slot);
    document.body.appendChild(audio);
    slot.timer = setTimeout(done, maxSeconds * 1000);
    audio.onended = done;
    audio.onerror = done;
    audio.ontimeupdate = function () {
      if (audio.currentTime >= maxSeconds) done();
    };
    playMedia(audio);
  }

  function playMedia(el) {
    var tried = false;
    function fallback() {
      var again;
      if (tried) return;
      tried = true;
      reportMuted();
      el.muted = true;
      again = el.play && el.play();
      if (again && again.catch) again.catch(function () {});
    }
    var started = el.play && el.play();
    if (started && started.then) started.then(function () {}).catch(fallback);
  }

  function onText(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return; }
    if (!data || data.type !== 'giftSound' || data.event !== 'play') return;
    start(data);
  }

  function connect() {
    var ws = new WebSocket(wsProto + '//' + location.host + base + '/ws');
    ws.onmessage = function (ev) { onText(ev.data); };
    ws.onclose = function () { setTimeout(connect, 1000); };
  }

  xhr('GET', '/api/gift-sounds', null, function (status, text) {
    var data, list, i;
    if (status !== 200) return;
    try { data = JSON.parse(text); } catch (e) { return; }
    list = data.playing || [];
    for (i = 0; i < list.length; i++) start(list[i]);
  });
  connect();
})();
