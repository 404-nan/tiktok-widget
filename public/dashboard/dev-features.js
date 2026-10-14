/* 開発用のテスト送信。本番では /api/env が dev でないのでボタンを結ばない。 */
(function () {
  var base = '';
  var pathMatch = location.pathname.match(/^\/t\/[^/]+/);
  if (pathMatch) base = pathMatch[0];

  function xhr(method, url, body, cb) {
    var req = new XMLHttpRequest();
    req.open(method, base + url, true);
    if (body != null) req.setRequestHeader('Content-Type', 'application/json');
    req.onreadystatechange = function () {
      if (req.readyState !== 4) return;
      var data = {};
      try { data = JSON.parse(req.responseText || '{}'); } catch (e) {}
      cb(req.status, data);
    };
    req.send(body == null ? null : JSON.stringify(body));
  }

  function msg(text) {
    var el = document.getElementById('devFeatureMsg');
    if (el) el.textContent = text || '';
  }

  function num(id) {
    var el = document.getElementById(id);
    return el ? el.value : '';
  }

  function buildAction() {
    var typeEl = document.getElementById('devActionType');
    var type = typeEl ? typeEl.value : '';
    var raw = num('devActionValue');
    var id = num('devActionId');
    var action = { type: type };
    if (id) action.id = id;
    if (type === 'timer.add') action.seconds = Number(raw);
    else if (type === 'wins.add') action.n = Number(raw);
    else if (type === 'media.play') action.mediaId = raw;
    else if (type === 'sound.play') action.mediaId = raw;
    else if (type === 'boss.damage' || type === 'boss.heal') action.amount = Number(raw);
    return action;
  }

  function trigger(body) {
    xhr('POST', '/api/dev/trigger', body, function (status, data) {
      if (status === 200) msg('実行しました');
      else msg(data.error || '失敗しました');
    });
  }

  function bind() {
    var actionBtn = document.getElementById('devActionBtn');
    var damageBtn = document.getElementById('devBossDamage');
    var healBtn = document.getElementById('devBossHeal');
    var mediaBtn = document.getElementById('devMediaBtn');
    var gachaBtn = document.getElementById('devGachaBtn');
    if (actionBtn) actionBtn.onclick = function () { trigger({ target: 'roulette-action', actions: [buildAction()] }); };
    if (damageBtn) damageBtn.onclick = function () { trigger({ target: 'boss', action: 'damage', amount: Number(num('devBossAmount')) }); };
    if (healBtn) healBtn.onclick = function () { trigger({ target: 'boss', action: 'heal', amount: Number(num('devBossAmount')) }); };
    if (mediaBtn) mediaBtn.onclick = function () { trigger({ target: 'media', mediaId: num('devMediaId') }); };
    if (gachaBtn) gachaBtn.onclick = function () { trigger({ target: 'gacha' }); };
  }

  function pollNote() {
    xhr('GET', '/api/media-alerts', null, function (status, data) {
      var note = document.getElementById('devAutoplayNote');
      if (note) note.textContent = status === 200 && data.autoplay && data.autoplay.note ? data.autoplay.note : '';
    });
    setTimeout(pollNote, 5000);
  }

  xhr('GET', '/api/env', null, function (status, data) {
    if (status !== 200 || !data.dev) return;
    bind();
    pollNote();
  });
})();
