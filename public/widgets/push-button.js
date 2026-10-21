// 押しボタンの待機・受付中・結果発表を描く公開用 ES5 スクリプト。
(function () {
  'use strict';
  var root = document.getElementById('push');
  var count = document.getElementById('count');
  var id = new URLSearchParams(location.search).get('id') || 'default';
  var preview = location.search.indexOf('preview=1') >= 0;
  // 配信者ごとの URL（/t/<鍵>/...）で開いたときは、その下の /ws と /api を使う
  var base = (location.pathname.match(/^\/t\/[^/]+/) || [''])[0];
  function draw(state) {
    if (!state || state.phase === 'idle') { root.className = 'idle'; return; }
    if (state.phase === 'open') { root.className = 'open'; count.textContent = state.pushes + ' 押し'; return; }
    var result = state.result || { pushes: state.pushes, tierName: 'miss' };
    root.className = 'result ' + result.tierName;
    root.innerHTML = '<div>' + (result.tierName === 'miss' ? '不発' : result.pushes + ' 押し') + '</div><div>' + (result.tierName === 'miss' ? '' : result.tierName === 'gold' ? '金' : result.tierName === 'red' ? '赤' : result.tierName === 'green' ? '緑' : '青') + '</div>';
  }
  function connect() {
    var socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + base + '/ws');
    socket.onmessage = function (event) { var message = JSON.parse(event.data); if (message.type === 'hello' && message.config && message.config.pushButtons) draw(message.config.pushButtons[id]); if (message.type === 'push' && message.id === id) draw(message.push); };
    socket.onclose = function () { setTimeout(connect, 1000); };
  }
  if (preview) draw({ phase: 'result', pushes: 14, result: { pushes: 14, tierName: 'green' } }); else fetch(base + '/api/push-button').then(function (response) { return response.json(); }).then(function (states) { draw(states[id]); }).catch(function () {});
  connect();
}());
