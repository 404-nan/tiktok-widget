/* ライコネのイベントを、同じPCのOBS WebSocketへ演出命令として送る。DOMに依存しない。 */
(function (root) {
  function b64(hex) { var out = '', i; for (i = 0; i < hex.length; i += 2) out += String.fromCharCode(parseInt(hex.substr(i, 2), 16)); return btoa(out); }
  function auth(password, salt, challenge) { return b64(root.sha256(b64(root.sha256(password + salt)) + challenge)); }
  function eventsFor(msg, config) {
    var out = [], e = msg && msg.event, type = msg && msg.type, c = config || {}, settings = c.obs || c;
    var cutins = c.cutins || settings.cutins || {}, active = c.active || settings.active || {}, selected = cutins[active.cutins] || cutins.default || {}, coins = Number(e && e.totalDiamonds || 0);
    if (!settings.enabled) return out;
    if (type === 'event' && e && e.kind === 'gift') { if (coins >= Number(selected.rainbowCoins || 20000)) out.push('rainbow'); else if (coins >= Number(selected.goldCoins || 5000)) out.push('gold'); }
    if (type === 'slot' && msg.event === 'start') { if (msg.result && msg.result.tier === 'jackpot') out.push('jackpot'); if (msg.result && msg.result.tier === 'big') out.push('slotBig'); }
    if (type === 'rush' && e && (e.kind === 'start' || e.kind === 'end')) out.push(e.kind === 'start' ? 'rushStart' : 'rushEnd');
    if (type === 'boss' && e && e.kind === 'defeat') out.push('bossDefeat');
    if (type === 'gacha' && msg.event === 'reveal' && msg.tier && msg.tier.pity) out.push('gachaTop');
    return out;
  }
  function createClient(WebSocketCtor, opts) {
    opts = opts || {};
    var socket, identified = false, sceneReady = false, currentScene = '', nextId = 1, pending = {}, queue = [], closed = false, retry = 0, original = null, timers = [], cooldown = {}, active = false, moving = 0, sequenceDone = true;
    var hash = root.location && root.location.hash || '', match = /(?:^#|[&#])pw=([^&]*)/.exec(hash), password = match ? decodeURIComponent(match[1]) : '';
    function sceneName() { return opts.config.scene || currentScene; }
    function send(op, data) { if (socket && socket.readyState === 1) socket.send(JSON.stringify({ op: op, d: data })); }
    function request(type, data, done) { queue.push({ type: type, data: data || {}, done: done || function () {} }); drain(); }
    function drain() {
      var item, id;
      if (!identified || !queue.length || Object.keys(pending).length) return;
      item = queue[0]; if (!sceneReady && item.type !== 'GetCurrentProgramScene') return;
      queue.shift(); id = 'r' + nextId++; pending[id] = { item: item, timer: setTimeout(function () { delete pending[id]; active = false; drain(); }, 5000) };
      send(6, { requestType: item.type, requestId: id, requestData: item.data });
    }
    function sceneData(data) { data.sceneName = sceneName(); return data; }
    function resetTransforms() { if (original && identified && sceneName()) request('SetSceneItemTransform', sceneData({ sceneItemId: original.id, sceneItemTransform: original.value }), function () {}); }
    function retryConnect() { var wait; if (closed || !opts.config.enabled) return; wait = [5000, 10000, 20000, 40000, 60000][Math.min(retry++, 4)]; timers.push(setTimeout(connect, wait)); }
    function connect() {
      var url;
      if (closed || !opts.config.enabled || (socket && (socket.readyState === 0 || socket.readyState === 1))) return;
      url = 'ws://127.0.0.1:' + Number(opts.config.port || 4455);
      try { socket = new WebSocketCtor(url, 'obswebsocket.json'); } catch (e) { retryConnect(); return; }
      socket.onopen = function () {};
      socket.onmessage = function (ev) {
        var msg, data, item, id;
        try { msg = JSON.parse(ev.data); } catch (e) { return; }
        data = msg.d || {};
        if (msg.op === 0) {
          var identify = { rpcVersion: 1, eventSubscriptions: 0 };
          if (data.authentication && password) identify.authentication = auth(password, data.authentication.salt, data.authentication.challenge);
          send(1, identify);
          if (hash && root.history && root.history.replaceState) root.history.replaceState(null, '', (root.location.pathname || '') + (root.location.search || ''));
        } else if (msg.op === 2) {
          identified = true;
          currentScene = opts.config.scene || '';
          sceneReady = !!currentScene;
          if (sceneReady) { resetTransforms(); drain(); }
          else request('GetCurrentProgramScene', {}, function (result) { currentScene = result.currentProgramSceneName || ''; sceneReady = true; resetTransforms(); drain(); });
          retry = 0;
        } else if (msg.op === 7) {
          id = data.requestId; item = pending[id]; if (!item) return; clearTimeout(item.timer); delete pending[id]; if (data.requestStatus && data.requestStatus.result) item.item.done(data.responseData || {}); drain();
        }
      };
      socket.onclose = function () { identified = false; sceneReady = false; if (active) active = false; if (original) original.needsRestore = true; socket = null; retryConnect(); };
      socket.onerror = function () {};
    }
    function transform(id, value, done) {
      var filtered = {}, keys = ['positionX', 'positionY', 'scaleX', 'scaleY'], i;
      for (i = 0; i < keys.length; i += 1) if (value[keys[i]] !== undefined) filtered[keys[i]] = value[keys[i]];
      request('SetSceneItemTransform', sceneData({ sceneItemId: id, sceneItemTransform: filtered }), done);
    }
    function withSource(fn) {
      if (!opts.config.source || !sceneName()) return;
      request('GetSceneItemId', sceneData({ sourceName: opts.config.source }), function (data) { if (!data.sceneItemId) return; request('GetSceneItemTransform', sceneData({ sceneItemId: data.sceneItemId }), function (result) { if (!result.sceneItemTransform) return; original = { id: data.sceneItemId, value: result.sceneItemTransform, needsRestore: false }; fn(data.sceneItemId, result.sceneItemTransform); }); });
    }
    function animate(id, base, type, rule, done) {
      var total = Number(rule.seconds || (type === 'shake' ? 0.8 : 1.2)) * (opts.config.reduce ? 0.6 : 1) * 1000, start = Date.now(), scale = Number(rule.scale || 1.08), strength = Number(rule.strength || 1.5) * (opts.config.reduce ? 0.5 : 1);
      if (opts.config.reduce && type === 'zoom') scale = 1 + (scale - 1) * 0.5;
      // 動いている間は active を落とさない（ルールの秒数が過ぎても、元に戻すところまで動かす）
      moving += 1;
      var callerDone = done;
      done = function () { moving -= 1; if (!moving && sequenceDone) active = false; callerDone(); };
      function frame() {
        var progress = Math.min(1, (Date.now() - start) / total), value = {}, n = Math.sin(progress * Math.PI);
        if (!active) { done(); return; }
        if (progress >= 1) { transform(id, type === 'zoom' ? { scaleX: base.scaleX, scaleY: base.scaleY } : base, done); return; }
        if (type === 'shake') { value.positionX = base.positionX + Math.sin(progress * 30) * base.width * strength / 100 * n; value.positionY = base.positionY + Math.cos(progress * 25) * base.height * strength / 100 * n; }
        else { value.scaleX = base.scaleX * (1 + (scale - 1) * n); value.scaleY = base.scaleY * (1 + (scale - 1) * n); }
        transform(id, value, function () { timers.push(setTimeout(frame, 33)); });
      }
      frame();
    }
    function run(rule) {
      if (rule.do === 'scene') {
        request('GetCurrentProgramScene', {}, function (data) {
          request('SetCurrentProgramScene', { sceneName: rule.name }, function () {
            if (Number(rule.backSeconds || 3) > 0) timers.push(setTimeout(function () {
              request('SetCurrentProgramScene', { sceneName: data.currentProgramSceneName });
            }, Number(rule.backSeconds || 3) * 1000));
          });
        });
        return;
      }
      if (rule.do === 'show' || rule.do === 'hide') {
        request('GetSceneItemId', sceneData({ sourceName: rule.item }), function (data) {
          request('SetSceneItemEnabled', sceneData({ sceneItemId: data.sceneItemId, sceneItemEnabled: rule.do === 'show' }), function () {
            timers.push(setTimeout(function () {
              request('SetSceneItemEnabled', sceneData({ sceneItemId: data.sceneItemId, sceneItemEnabled: rule.do !== 'show' }));
            }, Number(rule.seconds || 3) * 1000));
          });
        });
        return;
      }
      withSource(function (id, base) { animate(id, base, rule.do, rule, function () {}); });
    }
    function runOn(on) {
      var now = Date.now(), rules = (opts.config.rules || []).filter(function (rule) { return rule.on === on; }), cooldownSeconds = opts.config.cooldownSeconds == null ? 4 : Number(opts.config.cooldownSeconds), i = 0, motion = false, j;
      for (j = 0; j < rules.length; j += 1) if (rules[j].do === 'shake' || rules[j].do === 'zoom') motion = true;
      if ((motion && active) || (cooldown[on] && now - cooldown[on] < cooldownSeconds * 1000)) return;
      cooldown[on] = now; active = motion; sequenceDone = false;
      function next() { if (i >= rules.length) { sequenceDone = true; if (!moving) active = false; return; } run(rules[i]); timers.push(setTimeout(next, Number(rules[i].seconds || 0.8) * 1000 * (opts.config.reduce ? 0.6 : 1) + 40)); i += 1; }
      next();
    }
    function updateConfig(next) {
      var incoming = next || {}, obs = incoming.obs || incoming, key;
      for (key in obs) if (Object.prototype.hasOwnProperty.call(obs, key)) opts.config[key] = obs[key];
      if (incoming.cutins) opts.config.cutins = incoming.cutins;
      if (incoming.active) opts.config.active = incoming.active;
    }
    function message(msg) {
      var ons, i;
      if (msg.type === 'config') { updateConfig(msg.config); if (!opts.config.enabled) { active = false; resetTransforms(); } else if (!socket || socket.readyState === 3) connect(); return; }
      if (msg.type === 'control' && (msg.target === 'obs' || msg.target === 'all')) { if (msg.action === 'off') { active = false; resetTransforms(); } else if (msg.action === 'test') runOn(msg.data && msg.data.rule); return; }
      ons = eventsFor(msg, opts.config); for (i = 0; i < ons.length; i += 1) runOn(ons[i]);
    }
    connect();
    return { message: message, close: function () { closed = true; active = false; resetTransforms(); if (socket) socket.close(); } };
  }
  root.OBSBridge = { createClient: createClient, eventsFor: eventsFor };
  function start() {
    var client, lul, sample = false, bridgeConfig;
    if (!root.WebSocket || !root.location) return;
    lul = new root.WebSocket((root.location.protocol === 'https:' ? 'wss://' : 'ws://') + root.location.host + root.location.pathname.replace(/\/widgets\/obs-bridge\.html$/, '/ws'));
    lul.onmessage = function (ev) { var msg; try { msg = JSON.parse(ev.data); } catch (e) { return; } if (msg.type === 'hello') { sample = msg.sample && msg.sample.on; bridgeConfig = msg.config && msg.config.obs; if (!sample && bridgeConfig) { bridgeConfig.cutins = msg.config.cutins; bridgeConfig.active = msg.config.active; client = createClient(root.WebSocket, { config: bridgeConfig }); } } else if (client && !sample) client.message(msg); };
  }
  if (root.document && root.document.readyState === 'loading') root.document.addEventListener('DOMContentLoaded', start); else if (root.location) start();
}(this));
