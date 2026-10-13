/* メディア通知。サーバーの待ち列を1つずつ再生する。音が拒否されたらミュートでやり直す。 */
(function () {
  var statusEl = document.getElementById('status');
  var labelEl = document.getElementById('label');
  var stage = document.getElementById('stage');
  var base = '';
  var pathMatch = location.pathname.match(/^\/t\/[^/]+/);
  if (pathMatch) base = pathMatch[0];
  var wsProto = location.protocol.indexOf('https') === 0 ? 'wss:' : 'ws:';
  var current = '';
  var holdTimer = null;

  function xhr(method, url, body, cb) {
    var req = new XMLHttpRequest();
    req.open(method, base + url, true);
    if (body != null) req.setRequestHeader('Content-Type', 'application/json');
    req.onreadystatechange = function () {
      if (req.readyState === 4 && cb) cb(req.status, req.responseText);
    };
    req.send(body == null ? null : JSON.stringify(body));
  }

  function clearStage() {
    if (holdTimer) {
      clearTimeout(holdTimer);
      holdTimer = null;
    }
    while (stage.firstChild) stage.removeChild(stage.firstChild);
  }

  function finish(token) {
    if (current !== token) return;
    current = '';
    statusEl.textContent = '待機';
    labelEl.textContent = '';
    clearStage();
    xhr('POST', '/api/media-alerts/ack', { token: token });
  }

  function reportMuted() {
    xhr('POST', '/api/media-alerts/autoplay', { muted: true });
    labelEl.textContent = '音ありの自動再生が拒否されました。ミュートで再生しています。';
  }

  function playMedia(el, token) {
    var tried = false;
    function fallback() {
      if (tried) return;
      tried = true;
      el.muted = true;
      reportMuted();
      var again = el.play && el.play();
      if (again && again.catch) again.catch(function () { finish(token); });
    }
    var started = el.play && el.play();
    if (started && started.then) started.then(function () {}).catch(fallback);
  }

  function play(msg) {
    var item = msg && msg.item;
    if (!msg || !msg.token || !item || !item.id) return;
    if (current === msg.token) return;
    current = msg.token;
    statusEl.textContent = '再生中';
    labelEl.textContent = item.giftLabel || item.name || '';
    clearStage();
    var url = base + '/api/media-alerts/' + item.id + '/file';
    if (item.kind === 'image') {
      var img = document.createElement('img');
      img.alt = item.giftLabel || item.name || '画像';
      img.src = url;
      stage.appendChild(img);
      holdTimer = setTimeout(function () { finish(msg.token); }, item.holdMs || 4000);
      return;
    }
    var el = document.createElement(item.kind === 'audio' ? 'audio' : 'video');
    el.src = url;
    el.controls = true;
    el.autoplay = true;
    if (item.kind !== 'audio') el.setAttribute('playsinline', '');
    el.onended = function () { finish(msg.token); };
    el.onerror = function () { finish(msg.token); };
    stage.appendChild(el);
    playMedia(el, msg.token);
  }

  function onText(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return; }
    if (!data || data.type !== 'mediaAlert' || data.event !== 'play') return;
    play(data);
  }

  function connect() {
    var ws = new WebSocket(wsProto + '//' + location.host + base + '/ws');
    ws.onmessage = function (ev) { onText(ev.data); };
    ws.onclose = function () { setTimeout(connect, 1000); };
  }

  xhr('GET', '/api/media-alerts', null, function (status, text) {
    if (status !== 200) return;
    var data;
    try { data = JSON.parse(text); } catch (e) { return; }
    if (data.playing) play({ token: data.playing.token, item: data.playing.item });
  });
  connect();
})();
