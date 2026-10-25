/* コメント投票の表示。集計はサーバーから受け取り、ここでは見せ方と音だけを行う（ES5）。 */
(function () {
  var root = document.getElementById('vote');
  var title = document.getElementById('title');
  var timer = document.getElementById('timer');
  var state = document.getElementById('state');
  var rows = document.getElementById('rows');
  var names = document.getElementById('names');
  var base = '';
  var id = new URLSearchParams(location.search).get('id') || 'default';
  var config = { votes: {} };
  var revealTimer = null;
  var clockTimer = null;
  var nameTimer = null;
  var audioContext = null;
  var lastCounts = null;

  var pathMatch = location.pathname.match(/^\/t\/[^/]+/);
  if (pathMatch) base = pathMatch[0];

  function clearRevealTimer() {
    if (revealTimer) clearTimeout(revealTimer);
    revealTimer = null;
  }

  function clearNameTimer() {
    if (nameTimer) clearTimeout(nameTimer);
    nameTimer = null;
  }

  function clearTimers() {
    clearRevealTimer();
    clearNameTimer();
    if (clockTimer) clearInterval(clockTimer);
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

  function renderRows(vote, event) {
    var max = 0;
    var changed = [];
    var i;
    var optionCount = (vote.options || []).length;
    if (event === 'tally' && lastCounts) {
      for (i = 0; i < optionCount; i++) changed[i] = Number(vote.counts[i]) > Number(lastCounts[i] || 0);
    }
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
      count.textContent = vote.phase === 'result' && vote.result && vote.result.total === 0
        ? '0票'
        : numberText(vote.counts[i]) + '・' + text(percent) + '%';
      if (changed[i]) row.className += ' voted';
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
    lastCounts = (vote.counts || []).slice();
  }

  function renderTimer(vote) {
    var tick = function () {
      var left = vote.endsAt ? Math.max(0, vote.endsAt - Date.now()) : 0;
      timer.textContent = vote.phase === 'open' && vote.endsAt ? String(Math.ceil(left / 1000)) : '';
    };
    if (clockTimer) clearInterval(clockTimer);
    clockTimer = null;
    tick();
    if (vote.phase === 'open' && vote.endsAt) clockTimer = setInterval(tick, 250);
  }

  function voteSettings() {
    return config.votes && config.votes[id] ? config.votes[id] : {};
  }

  function soundVolume() {
    var volume = Number(voteSettings().volume);
    if (!isFinite(volume)) volume = 0.3;
    return Math.max(0, Math.min(1, volume));
  }

  function audio() {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!audioContext) audioContext = new AudioContext();
    if (audioContext.resume) audioContext.resume();
    return audioContext;
  }

  function playTone(startFrequency, endFrequency, duration, level) {
    var context;
    var oscillator;
    var gain;
    var now;
    if (voteSettings().sound === false || soundVolume() <= 0) return;
    try {
      context = audio();
      if (!context) return;
      now = context.currentTime;
      oscillator = context.createOscillator();
      gain = context.createGain();
      oscillator.type = 'sine';
      oscillator.frequency.setValueAtTime(startFrequency, now);
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(1, endFrequency), now + duration);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, soundVolume() * level), now + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(now);
      oscillator.stop(now + duration);
    } catch (error) {}
  }

  function playSuspense() {
    playTone(260, 90, 0.55, 0.2);
  }

  function playResult() {
    playTone(130, 48, 0.32, 0.8);
  }

  function showRecentNames(vote) {
    var entry = voteSettings();
    var queue;
    var next;
    clearNameTimer();
    if (entry.showNames === false) {
      names.textContent = '';
      return;
    }
    queue = (vote.recent || []).slice(0, 3);
    next = function () {
      if (!queue.length) {
        names.textContent = '';
        return;
      }
      names.textContent = text(queue.shift());
      nameTimer = setTimeout(function () {
        names.textContent = '';
        nameTimer = setTimeout(next, 180);
      }, 1000);
    };
    next();
  }

  function render(vote, event) {
    if (!vote || vote.phase === 'idle') {
      clearTimers();
      root.className = 'idle';
      names.textContent = '';
      lastCounts = null;
      return;
    }
    clearRevealTimer();
    root.className = vote.phase === 'result' && event === 'result' ? 'revealing' : vote.phase;
    title.textContent = text(vote.title || 'どれにする?');
    state.textContent = phaseText(vote.phase);
    renderRows(vote, event);
    showRecentNames(vote);
    renderTimer(vote);
    if (event === 'close') playSuspense();
    if (vote.phase === 'result' && event === 'result') {
      revealTimer = setTimeout(function () {
        playResult();
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
    var socket = new WebSocket(protocol + '//' + location.host + base + '/ws' + (/[?&]preview=1/.test(location.search) ? '?preview=1' : ''));
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
