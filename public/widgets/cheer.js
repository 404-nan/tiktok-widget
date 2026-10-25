// いいね応援ゲージを表示する公開ウィジェット。ES5で書き、外部通信先を持たない。
(function () {
  'use strict';
  function query(name) { var match = new RegExp('[?&]' + name + '=([^&]*)').exec(location.search); return match ? decodeURIComponent(match[1]) : ''; }
  var id = query('id') || 'default';
  var preview = query('preview') === '1';
  var state = { value: preview ? 340 : 0, goal: 500, round: 0, full: false };
  var config = { title: 'みんなで応援', fullText: '満タン!', sound: true, volume: 0.3 };
  var root = document.getElementById('cheer');
  var title = document.getElementById('title');
  var numbers = document.getElementById('numbers');
  var round = document.getElementById('round');
  var fill = document.getElementById('fill');
  var note = document.getElementById('note');
  var full = document.getElementById('full');
  var canvas = document.getElementById('confetti');
  var revealTimer = null;

  function draw() {
    var ratio = state.goal ? Math.min(1, state.value / state.goal) : 0;
    title.textContent = config.title || 'みんなで応援';
    numbers.textContent = state.value + ' / ' + state.goal;
    round.textContent = state.round + ' 周目';
    fill.style.width = (ratio * 100) + '%';
    fill.className = ratio >= 0.8 ? 'near' : '';
    note.textContent = ratio >= 0.8 && !state.full ? 'あと少し' : '';
    root.className = state.full ? 'is-full' : '';
  }

  function sound() {
    if (!config.sound) return;
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    var audio = new AudioContext();
    var oscillator = audio.createOscillator();
    var gain = audio.createGain();
    oscillator.frequency.value = 440;
    gain.gain.value = Number(config.volume || 0.3) * 0.08;
    oscillator.connect(gain); gain.connect(audio.destination);
    oscillator.start(); oscillator.stop(audio.currentTime + 0.12);
  }

  function celebrate() {
    clearTimeout(revealTimer);
    full.textContent = config.fullText || '満タン!';
    root.className = 'is-full';
    sound();
    var context = canvas.getContext('2d');
    context.clearRect(0, 0, canvas.width, canvas.height);
    var i;
    for (i = 0; i < 18; i += 1) {
      context.fillStyle = i % 2 ? '#FFC53D' : '#FF4F1F';
      context.fillRect((i * 47) % canvas.width, (i * 19) % canvas.height, 5, 9);
    }
    revealTimer = setTimeout(function () { full.textContent = ''; draw(); }, 1300);
  }

  function apply(message) {
    if (!message || message.id !== id) return;
    if (message.cheer) state = message.cheer;
    if (message.event === 'full') celebrate(); else draw();
  }

  function connect() {
    // 配信者ごとの URL（/t/<鍵>/...）で開いたときは、その下の /ws と /api を使う
    var base = (location.pathname.match(/^\/t\/[^/]+/) || [''])[0];
    var socket = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + base + '/ws' + (/[?&]preview=1/.test(location.search) ? '?preview=1' : ''));
    socket.onmessage = function (event) {
      var message = JSON.parse(event.data);
      if (message.type === 'hello') {
        config = (message.config && message.config.cheers && message.config.cheers[id]) || config;
        fetch(base + '/api/cheer').then(function (response) { return response.json(); }).then(function (all) { if (all[id]) state = all[id]; draw(); });
      } else if (message.type === 'cheer') apply(message);
    };
    socket.onclose = function () { setTimeout(connect, 1500); };
  }

  draw();
  if (!preview) connect();
}());
