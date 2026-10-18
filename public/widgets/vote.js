/* コメント投票の表示。集計と結果はサーバーから受け取り、ここでは見せ方だけを行う（ES5）。 */
(function () {
  var root = document.getElementById('vote');
  var title = document.getElementById('title');
  var timer = document.getElementById('timer');
  var state = document.getElementById('state');
  var rows = document.getElementById('rows');
  var names = document.getElementById('names');
  var base = '';
  var id = new URLSearchParams(location.search).get('id') || 'default';
  var current = null;
  var config = { votes: {} };
  var revealTimer = null;
  var clockTimer = null;

  var pathMatch = location.pathname.match(/^\/t\/[^/]+/);
  if (pathMatch) base = pathMatch[0];

  function clearTimers() {
    if (revealTimer) clearTimeout(revealTimer);
    if (clockTimer) clearInterval(clockTimer);
    revealTimer = null;
    clockTimer = null;
  }

  function text(value) {
    return value == null ? '' : String(value);
  }

  function sampleVote() {
    return { phase: 'open', title: 'どれにする?', options: ['A', 'B', 'C'], counts: [12, 7, 3], total: 22, endsAt: Date.now() + 45000, now: Date.now(), result: null, recent: ['さくら', 'たろう', 'みどり'] };
  }

  function phaseText(phase) {
    if (phase === 'open') return '受付中';
    if (phase === 'closed') return 'しめきり';
    if (phase === 'result') return '結果発表';
    return '';
  }

  function numberText(value) {
    return Number(value) === 0 ? '0票' : text(value) + '票';
  }

  function renderRows(vote) {
    var max = 0;
    var i;
    var optionCount = (vote.options || []).length;
    for (i = 0; i < optionCount; i++) max = Math.max(max, Number(vote.counts[i]) || 0);
    rows.innerHTML = '';
    for (i = 0; i < optionCount; i++) {
      var row = document.createElement('div');
      var number = document.createElement('div');
      var label = document.createElement('div');
      var bar = document.createElement('div');
      var fill = document.createElement('div');
      var count = document.createElement('div');
      var percent = vote.result && vote.result.percent ? vote.result.percent[i] : (vote.total ? Math.round((vote.counts[i] / vote.total) * 1000) / 10 : 0);
      row.className = 'row';
      number.className = 'number';
      label.className = 'label';
      bar.className = 'bar';
      fill.className = 'fill';
      count.className = 'count';
      number.textContent = String(i + 1);
      label.textContent = text(vote.options[i]);
      fill.style.width = (max ? ((Number(vote.counts[i]) || 0) / max * 100) : 0) + '%';
      count.textContent = numberText(vote.counts[i]) + '・' + text(percent) + '%';
      if (max && Number(vote.counts[i]) === max) row.className += ' leading';
      if (vote.result && vote.result.winners && vote.result.winners.indexOf(i + 1) >= 0) row.className += ' winner';
      if (vote.result && vote.result.winners && vote.result.winners.indexOf(i + 1) < 0) row.className += ' loser';
      bar.appendChild(fill);
      row.appendChild(number);
      row.appendChild(label);
      row.appendChild(bar);
      row.appendChild(count);
      rows.appendChild(row);
    }
  }

  function renderTimer(vote) {
    var tick = function () {
      var left = vote.endsAt ? Math.max(0, vote.endsAt - Date.now()) : 0;
      timer.textContent = vote.phase === 'open' && vote.endsAt ? String(Math.ceil(left / 1000)) : '';
    };
    if (clockTimer) clearInterval(clockTimer);
    tick();
    if (vote.phase === 'open' && vote.endsAt) clockTimer = setInterval(tick, 250);
  }

  function render(vote, event) {
    if (!vote || vote.phase === 'idle') {
      clearTimers();
      root.className = 'idle';
      current = vote;
      return;
    }
    current = vote;
    root.className = vote.phase;
    title.textContent = text(vote.title || 'どれにする?');
    state.textContent = phaseText(vote.phase);
    renderRows(vote);
    var entry = config.votes && config.votes[id] ? config.votes[id] : {};
    names.textContent = entry.showNames === false ? '' : (vote.recent || []).slice(0, 3).join('　');
    renderTimer(vote);
    if (vote.phase === 'result' && event === 'result') {
      root.className = 'revealing';
      revealTimer = setTimeout(function () {
        root.className = 'result hit';
        state.textContent = vote.result && vote.result.tie ? '同票' : '結果発表';
      }, 1000);
    }
  }

  function receive(message) {
    if (!message) return;
    if (message.type === 'hello') {
      config = message.config || config;
      return;
    }
    if (message.type !== 'vote' || (message.id && message.id !== id)) return;
    render(message.vote, message.event);
  }

  function connect() {
    var protocol = location.protocol.indexOf('https') === 0 ? 'wss:' : 'ws:';
    var socket = new WebSocket(protocol + '//' + location.host + base + '/ws');
    socket.onmessage = function (event) {
      try { receive(JSON.parse(event.data)); } catch (error) {}
    };
    socket.onclose = function () { setTimeout(connect, 1000); };
  }

  function loadState() {
    var request = new XMLHttpRequest();
    request.open('GET', base + '/api/vote', true);
    request.onreadystatechange = function () {
      var data;
      if (request.readyState !== 4 || request.status !== 200) return;
      try {
        data = JSON.parse(request.responseText);
        if (data[id]) render(data[id]);
      } catch (error) {}
    };
    request.send(null);
  }

  if (new URLSearchParams(location.search).has('preview')) render(sampleVote());
  else loadState();
  connect();
}());
