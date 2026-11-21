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
    ? { idle: '', pick: '番号を選んでいます', rolling: '引いています', reveal: '運勢', ten: '10連', done: '終了' }
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

  // 10連: 結果の札を並べる（おみくじの画面にだけ #ten がある）。札は1枚ずつ裏から表へ返る（試作v3の見た目。
  // 舞台側の [data-ten="flip"] の決まりと対）。大吉の札だけ、返る動きと金の光を長くして見せる
  function renderTen(data) {
    var box = document.getElementById('ten');
    if (!box) return;
    var results = (data.phase === 'ten' || data.phase === 'done') ? data.results : null;
    if (!results || !results.length) {
      box.textContent = '';
      box.hidden = true;
      stageEl.removeAttribute('data-ten');
      return;
    }
    stageEl.setAttribute('data-ten', 'flip');
    box.hidden = false;
    box.textContent = '';
    var who = data.trigger && data.trigger.user;
    var drawerName = who && who.name ? who.name : '';
    results.forEach(function (r, i) {
      var cell = document.createElement('div');
      cell.className = 'ten-slip';
      cell.setAttribute('data-tier', toneOf(r && r.tier));
      var label = (r && r.tier && (r.tier.label || r.tier.id)) || '';
      cell.appendChild(flipCard(label, drawerName, i));
      box.appendChild(cell);
    });
  }

  // 裏（おみくじの字）から表（小さい紙の意匠）へ返る札を作る。表の足には引いた人の名前を出す
  function flipCard(label, drawerName, i) {
    var flip = document.createElement('div');
    flip.className = 'flip';
    flip.style.animationDelay = (0.05 + i * 0.45) + 's';
    var back = document.createElement('div');
    back.className = 'face back';
    var backText = document.createElement('span');
    backText.textContent = 'おみくじ';
    back.appendChild(backText);
    var front = document.createElement('div');
    front.className = 'face front';
    var head = document.createElement('span');
    head.className = 'm-head';
    head.textContent = 'おみくじ';
    var result = document.createElement('span');
    result.className = 'm-result len' + Math.min(6, label.length);
    result.textContent = label;
    var foot = document.createElement('span');
    foot.className = 'm-foot';
    foot.textContent = drawerName;
    var seal = document.createElement('span');
    seal.className = 'm-seal';
    seal.innerHTML = '開運<br>守護';
    front.appendChild(head);
    front.appendChild(result);
    front.appendChild(foot);
    front.appendChild(seal);
    flip.appendChild(back);
    flip.appendChild(front);
    return flip;
  }

  function show(data) {
    if (!data) return;
    var phase = data.phase || 'idle';
    phaseEl.textContent = phases[phase] ?? phase;
    var tier = data.tier;
    if ((phase === 'reveal' || phase === 'done') && tier) resultEl.textContent = tier.label || tier.id || '';
    else if (phase === 'idle' || phase === 'rolling') resultEl.textContent = '';
    var d = data.durations || {};
    timeEl.textContent = '回転 ' + (d.rollMs || 0) + ' / 結果 ' + (d.revealMs || 0) + ' / 終了 ' + (d.doneMs || 0);
    stageEl.setAttribute('data-phase', phase);
    if (data.displayMode) stageEl.setAttribute('data-display', data.displayMode);
    if (data.resultFont) stageEl.setAttribute('data-font', data.resultFont);
    showPick(data);
    renderTen(data);
    if (kind === 'omikuji') {
      var who = data.trigger && data.trigger.user;
      var drawerName = phase !== 'idle' && who && who.name ? who.name : '';
      setText('slipName', drawerName);
      setText('stickName', data.displayMode === 'short' ? '' : drawerName);
      setText('drawWho', data.results && drawerName ? drawerName + ' さんの10連' : '');
    }
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
    var ws = new WebSocket(wsProto + '//' + location.host + base + '/ws' + (/[?&]preview=(?:1|live)/.test(location.search) ? '?preview=1' : ''));
    ws.onmessage = function (ev) { onText(ev.data); };
    ws.onclose = function () { setTimeout(connect, 1000); };
  }

  // 背景（透明／クロマキー用の色／単色／背景画像）。設定は /api/config の自分の節から取る
  var bgReq = new XMLHttpRequest();
  bgReq.open('GET', base + '/api/config', true);
  bgReq.onreadystatechange = function () {
    if (bgReq.readyState !== 4 || bgReq.status !== 200) return;
    try {
      var entry = (JSON.parse(bgReq.responseText).config || {})[kind] || {};
      var mode = entry.background || 'transparent';
      var els = [document.documentElement, document.body];
      for (var i = 0; i < els.length; i++) { els[i].style.backgroundColor = ''; els[i].style.backgroundImage = ''; els[i].style.backgroundSize = ''; els[i].style.backgroundPosition = ''; }
      if (mode === 'chroma' || mode === 'solid') {
        var c = (mode === 'chroma' ? entry.chromaColor : entry.solidColor) || (mode === 'chroma' ? '#00FF00' : '#0B1030');
        for (var j = 0; j < els.length; j++) els[j].style.backgroundColor = c;
      } else if (mode === 'image' && entry.backgroundImage) {
        var u = 'url("' + String(entry.backgroundImage).replace(/"/g, '%22') + '")';
        for (var k = 0; k < els.length; k++) { els[k].style.backgroundImage = u; els[k].style.backgroundSize = 'cover'; els[k].style.backgroundPosition = 'center'; }
      }
    } catch (e) {}
  };
  bgReq.send(null);

  var req = new XMLHttpRequest();
  req.open('GET', base + '/api/' + kind, true);
  req.onreadystatechange = function () {
    if (req.readyState !== 4 || req.status !== 200) return;
    try { show(JSON.parse(req.responseText)); } catch (e) {}
  };
  req.send(null);
  connect();
})();
