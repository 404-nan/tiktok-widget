// 初見・おかえり・常連の来場テロップを、設定と WebSocket の通知から表示する ES5 スクリプト。
// 設定を画面側に持たず、来場回数と表示順はサーバーの通知だけを使う。
(function () {
  'use strict';
  function queryValue(key) {
    var match = location.search.match(new RegExp('[?&]' + key + '=([^&]*)'));
    return match ? decodeURIComponent(match[1].replace(/\+/g, ' ')) : null;
  }
  var id = queryValue('id') || 'default';
  var config = null;
  var queue = [];
  var showing = false;
  var card = document.getElementById('card');
  var badge = document.getElementById('badge');
  var name = document.getElementById('name');
  var message = document.getElementById('message');
  var avatar = document.getElementById('avatar');
  var defaults = { showFirst: true, showReturning: false, showRegular: true, regularVisits: 3, firstText: 'はじめまして！ゆっくりしていってね', returningText: 'また来てくれてありがとう', regularText: '{visits}回目の来場、いつもありがとう', duration: 4, maxQueue: 5, avatars: true };

  function basePath() {
    var match = location.pathname.match(/^(\/t\/[^/]+)/);
    return match ? match[1] : '';
  }
  function applyTheme(theme) { document.documentElement.setAttribute('data-theme', theme === 'light' ? 'light' : 'dark'); }
  function loadConfig(done) {
    var req = new XMLHttpRequest();
    req.open('GET', basePath() + '/api/config', true);
    req.onreadystatechange = function () {
      var data;
      if (req.readyState !== 4) return;
      try { data = JSON.parse(req.responseText); } catch (e) { data = {}; }
      var maps = data.config && data.config.visitors;
      var first = maps && (maps[id] || maps.default || maps[Object.keys(maps)[0]]);
      config = {};
      Object.keys(defaults).forEach(function (key) { config[key] = defaults[key]; });
      Object.keys(first || {}).forEach(function (key) { config[key] = first[key]; });
      applyTheme(queryValue('theme') || data.config && data.config.theme && data.config.theme.mode);
      done();
    };
    req.send();
  }
  function kindOf(visits) { return visits === 1 ? 'first' : visits >= config.regularVisits ? 'regular' : 'returning'; }
  function textOf(kind, visits) { var text = kind === 'first' ? config.firstText : kind === 'regular' ? config.regularText : config.returningText; return text.replace(/\{visits\}/g, String(visits)); }
  function allowed(kind) { return (kind === 'first' && config.showFirst) || (kind === 'returning' && config.showReturning) || (kind === 'regular' && config.showRegular); }
  function show(item) {
    showing = true;
    var kind = kindOf(item.visits);
    card.className = kind;
    badge.textContent = kind === 'first' ? '初見' : kind === 'regular' ? '常連' : 'おかえり';
    name.textContent = (item.user && item.user.name || '名無し') + 'さん';
    message.textContent = textOf(kind, item.visits);
    avatar.innerHTML = '';
    if (config.avatars && item.user && item.user.avatar) { var image = new Image(48, 48); image.alt = ''; image.src = item.user.avatar; avatar.appendChild(image); }
    card.hidden = false;
    card.classList.remove('out');
    window.setTimeout(function () { card.classList.add('out'); window.setTimeout(function () { card.hidden = true; showing = false; next(); }, 380); }, Math.max(1, Number(config.duration) || 4) * 1000);
  }
  function next() { if (!showing && queue.length) show(queue.shift()); }
  function add(item) { var kind = kindOf(item.visits); if (!config || !allowed(kind)) return; queue.push(item); while (queue.length > (Number(config.maxQueue) || 5)) queue.shift(); next(); }
  function connect() {
    var proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    var socket = new WebSocket(proto + '//' + location.host + basePath() + '/ws');
    socket.onmessage = function (event) { var data; try { data = JSON.parse(event.data); } catch (e) { return; } if (data.type === 'visitor') add(data.visitor); if (data.type === 'config') loadConfig(function () {}); };
    socket.onclose = function () { window.setTimeout(connect, 1500); };
  }
  function preview() { if (!queryValue('preview')) return; window.setTimeout(function () { add({ user: { name: 'はじめての人' }, visits: 1 }); window.setTimeout(function () { add({ user: { name: 'いつもの人' }, visits: config.regularVisits }); }, 1200); }, 100); }
  card.addEventListener('animationend', function () { card.classList.remove('in'); });
  loadConfig(function () { connect(); preview(); });
}());
