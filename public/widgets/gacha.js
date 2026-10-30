/* ガチャ・おみくじ共通（body の data-kind で切り替え）。待機 →（番号を選ぶ）→ 回転中 → 結果 → 終了。段階の長さはサーバーの durations に合わせる。
   おみくじの番号を選ぶ段階では、棒の番号の一覧・だれが選ぶか・残り秒を #pick に出す（おみくじの画面にだけある）。 */
(function () {
  var phaseEl = document.getElementById('phase');
  var resultEl = document.getElementById('result');
  var timeEl = document.getElementById('time');
  var stageEl = document.getElementById('stage');
  var plateEl = document.getElementById('plate');
  var pickEl = document.getElementById('pick');
  var countdown = null;
  var lastPhase = 'idle';
  var kind = document.body.getAttribute('data-kind') || 'gacha';
  var base = '';
  var pathMatch = location.pathname.match(/^\/t\/[^/]+/);
  if (pathMatch) base = pathMatch[0];
  if (location.search.indexOf('preview=1') >= 0) document.body.classList.add('preview');
  var wsProto = location.protocol.indexOf('https') === 0 ? 'wss:' : 'ws:';
  var phases = (kind === 'omikuji'
    ? { idle: '待機', pick: '番号を選んでいます', rolling: '引いています', reveal: '運勢', done: '終了' }
    : { idle: '待機', rolling: '回転中', reveal: '結果', done: '終了' });

  function seconds(n) {
    var x = Number(n);
    if (!isFinite(x) || x < 0) x = 0;
    return (x / 1000) + 's';
  }

  function toneOf(tier) {
    if (!tier) return '';
    if (kind === 'omikuji') return String(tier.id || '');
    var id = String(tier.id || '');
    if (id === 'legend' || tier.pity) return 'legend';
    if (id === 'rare') return 'rare';
    return 'common';
  }

  var KANJI = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  function kanji(n) {
    var s = '';
    if (n >= 10) s += (n >= 20 ? KANJI[Math.floor(n / 10)] : '') + '十';
    if (n % 10) s += KANJI[n % 10];
    return s;
  }

  function setText(id, text) {
    var el = document.getElementById(id);
    if (el) el.textContent = text;
  }

  // 選ばれた札に印をつけ、筒の口までの距離を渡す（札が筒へ落ちて棒になる）
  function markChosen(n) {
    var li = document.querySelector('#pickList li[data-n="' + n + '"]');
    var hole = document.querySelector('.tube-hole');
    if (!li || !hole) return;
    pickEl.classList.add('has-chosen');
    var a = li.getBoundingClientRect();
    var b = hole.getBoundingClientRect();
    li.style.setProperty('--dx', Math.round(b.left + b.width / 2 - (a.left + a.width / 2)) + 'px');
    li.style.setProperty('--dy', Math.round(b.top - (a.top + a.height / 2)) + 'px');
    li.className = 'chosen';
  }

  // 番号を選ぶ段階: 一覧と残り秒。だれも選ばなければサーバーが時間切れで進める
  function showPick(data) {
    if (countdown) clearInterval(countdown);
    countdown = null;
    if (!pickEl) return;
    // 番号待ちから回るときだけ（おまかせで始まったときは札を出さない）
    if (data.phase !== 'rolling') pickEl.classList.remove('has-chosen');
    if (data.phase === 'rolling' && lastPhase === 'pick' && data.stick) markChosen(data.stick);
    lastPhase = data.phase;
    var pick = data.phase === 'pick' ? data.pick : null;
    if (!pick) return;
    var user = data.trigger && data.trigger.user;
    pickEl.setAttribute('data-by', pick.by);
    setText('pickWho', pick.by === 'viewer' ? ((user && user.name ? user.name + ' さん' : '送った人') + 'の番') : '配信者の番');
    setText('pickHow', pick.by === 'viewer' ? '番号をコメントしてね' : '番号を選んでいます');
    var list = document.getElementById('pickList');
    if (list) {
      list.textContent = '';
      for (var n = 1; n <= pick.count; n++) {
        var li = document.createElement('li');
        var board = document.createElement('b');
        board.textContent = String(n);
        li.setAttribute('data-n', String(n));
        li.appendChild(board);
        list.appendChild(li);
      }
    }
    // 残りはサーバーから受け取った時点からの経過で数える（配信 PC の時計がずれていても合う）
    var endsAt = Date.now() + Math.max(0, Number(pick.leftMs) || 0);
    var tick = function () {
      var left = Math.max(0, Math.ceil((endsAt - Date.now()) / 1000));
      var leftEl = document.getElementById('pickLeft');
      if (leftEl.textContent !== String(left) && left <= 3) {
        // 3秒を切ったら、1秒ごとに判を押し直す
        leftEl.classList.remove('tick');
        leftEl.offsetWidth;
        leftEl.classList.add('tick');
      }
      setText('pickLeft', String(left));
      pickEl.classList.toggle('soon', left <= 3);
    };
    tick();
    countdown = setInterval(tick, 250);
  }

  function show(data) {
    if (!data) return;
    var phase = data.phase || 'idle';
    phaseEl.textContent = phases[phase] || phase;
    var tier = data.tier;
    if ((phase === 'reveal' || phase === 'done') && tier) resultEl.textContent = tier.label || tier.id || '';
    else if (phase === 'idle' || phase === 'rolling') resultEl.textContent = '';
    var d = data.durations || {};
    timeEl.textContent = '回転 ' + (d.rollMs || 0) + ' / 結果 ' + (d.revealMs || 0) + ' / 終了 ' + (d.doneMs || 0);
    stageEl.setAttribute('data-phase', phase);
    if (data.stick) {
      setText('stickNo', '第' + kanji(data.stick) + '番');
      setText('slipNo', '第' + kanji(data.stick) + '番');
      setText('stickNum', String(data.stick));
    }
    showPick(data);
    stageEl.setAttribute('data-tier', (phase === 'reveal' || phase === 'done') ? toneOf(tier) : '');
    stageEl.style.setProperty('--roll', seconds(d.rollMs));
    stageEl.style.setProperty('--reveal', seconds(d.revealMs));
    stageEl.style.setProperty('--done', seconds(d.doneMs));
    if (phase === 'idle') document.body.classList.remove('on');
    else document.body.classList.add('on');
    plateEl.classList.remove('go');
    if (phase !== 'idle') {
      plateEl.offsetWidth;
      plateEl.classList.add('go');
    }
  }

  function onText(text) {
    var data;
    try { data = JSON.parse(text); } catch (e) { return; }
    if (!data || data.type !== kind) return;
    show(data);
  }

  function connect() {
    var ws = new WebSocket(wsProto + '//' + location.host + base + '/ws' + (/[?&]preview=1/.test(location.search) ? '?preview=1' : ''));
    ws.onmessage = function (ev) { onText(ev.data); };
    ws.onclose = function () { setTimeout(connect, 1000); };
  }

  var req = new XMLHttpRequest();
  req.open('GET', base + '/api/' + kind, true);
  req.onreadystatechange = function () {
    if (req.readyState !== 4 || req.status !== 200) return;
    try { show(JSON.parse(req.responseText)); } catch (e) {}
  };
  req.send(null);
  connect();
})();
