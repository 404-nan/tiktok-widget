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
    ? { idle: '', pick: '番号を選んでいます', rolling: '引いています', reveal: '運勢', ten: '連', done: '終了' }
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
      stageEl.removeAttribute('data-ten-rows');
      return;
    }
    stageEl.setAttribute('data-ten', 'flip');
    // 段数（5列で折り返した段。舞台側の CSS が段数に合わせて札の中身を縮める、対の決まり）
    stageEl.setAttribute('data-ten-rows', String(Math.ceil(results.length / 5)));
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

  // いいねの進み具合（おみくじの画面にだけある #likeGauge と、舞台の中の #boostBadge）。
  // 形（likeGauge: bar / liquid / text / off）と総いいね数の的はサーバーの公開状態から取る。個人の残りは出さない。
  // 倍率が掛かっている間は、舞台の左下に「確率○倍中」の札も出す
  var lgTarget = 0; // 液体の目標の溜まり具合（0〜1）
  var lgShown = 0; // 液体の表示上の溜まり具合（なめらかに追う）
  var lgSplash = 0; // 液体の波の勢い（いいねが増えた瞬間に立ち、時間で収まる）
  var lgPrevTotal = null;

  function fmtTimes(v) {
    var t = Number(v);
    if (!isFinite(t) || t <= 0) t = 1;
    return String(Math.round(t * 100) / 100);
  }

  function showLike(data) {
    var badge = document.getElementById('boostBadge');
    if (badge) {
      if (data && data.likeBoost) {
        setText('boostTimes', fmtTimes(data.likeBoostTimes));
        badge.hidden = false;
      } else badge.hidden = true;
    }
    var box = document.getElementById('likeGauge');
    if (!box) return;
    var style = data ? data.likeGauge : null;
    var total = data ? Number(data.likeBoostTotal) : 0;
    if (!style || style === 'off' || !(total > 0)) { box.hidden = true; return; }
    var now = Math.max(0, Number(data.likeTotal) || 0);
    if (lgPrevTotal != null && now > lgPrevTotal) lgSplash = Math.min(lgSplash + (now - lgPrevTotal) / 60, 1.6);
    lgPrevTotal = now;
    var left = Math.max(total - now, 0);
    lgTarget = Math.min(now / total, 1);
    box.hidden = false;
    box.setAttribute('data-style', style);
    box.classList.toggle('full', Boolean(data.likeBoost));
    var fill = document.getElementById('lgFill');
    if (fill) fill.style.width = (lgTarget * 100) + '%';
    setText('lgBig', left.toLocaleString('ja-JP'));
    var status = document.getElementById('lgStatus');
    if (status) {
      if (data.likeBoost) {
        status.textContent = '確率' + fmtTimes(data.likeBoostTimes) + '倍中';
        status.classList.add('on');
      } else {
        status.textContent = 'あと ' + left.toLocaleString('ja-JP') + ' で確率' + fmtTimes(data.likeBoostTimes) + '倍';
        status.classList.remove('on');
      }
    }
  }

  // 液体バーの波（canvas）。ゲージが液体の形で出ている間だけ描く
  (function () {
    var cv = document.getElementById('lgLiquid');
    if (!cv || typeof cv.getContext !== 'function') return;
    var ctx = cv.getContext('2d');
    if (!ctx) return;
    var t0 = performance.now();
    function wave(nowMs) {
      requestAnimationFrame(wave);
      var box = document.getElementById('likeGauge');
      if (!box || box.hidden || box.getAttribute('data-style') !== 'liquid') return;
      var rect = cv.getBoundingClientRect();
      var dpr = window.devicePixelRatio || 1;
      var wantW = Math.max(1, Math.round(rect.width * dpr));
      var wantH = Math.max(1, Math.round(rect.height * dpr));
      if (cv.width !== wantW || cv.height !== wantH) { cv.width = wantW; cv.height = wantH; }
      var t = (nowMs - t0) / 1000;
      lgShown += (lgTarget - lgShown) * 0.06;
      if (Math.abs(lgTarget - lgShown) < 0.0005) lgShown = lgTarget;
      lgSplash *= 0.965;
      var W = cv.width, H = cv.height;
      ctx.clearRect(0, 0, W, H);
      if (lgShown <= 0.001) return;
      var level = H * (1 - lgShown);
      var amp = (3 + lgSplash * 9) * dpr;
      function layer(speed, len, top, bottom) {
        ctx.beginPath();
        ctx.moveTo(0, H);
        for (var x = 0; x <= W; x += 6) {
          var y = level + Math.sin(x / len + t * speed) * amp + Math.sin(x / (len * 0.37) - t * speed * 1.6) * amp * 0.45;
          ctx.lineTo(x, y);
        }
        ctx.lineTo(W, H);
        ctx.closePath();
        var g = ctx.createLinearGradient(0, level, 0, H);
        g.addColorStop(0, top);
        g.addColorStop(1, bottom);
        ctx.fillStyle = g;
        ctx.fill();
      }
      layer(1.1, 90, 'rgba(246, 196, 69, .45)', 'rgba(168, 122, 12, .45)');
      layer(1.9, 55, 'rgba(255, 233, 138, .9)', 'rgba(154, 116, 31, .9)');
    }
    requestAnimationFrame(wave);
  })();

  // 天井までの残り（おみくじの画面にだけある #pityBadge）。数値のときだけ出し、null や未定義なら何も出さない
  function showPity(data) {
    var badge = document.getElementById('pityBadge');
    if (!badge) return;
    var left = data ? data.pityLeft : null;
    if (typeof left !== 'number' || !isFinite(left)) { badge.hidden = true; return; }
    var leftEl = document.getElementById('pityLeft');
    if (leftEl) leftEl.textContent = String(Math.max(0, Math.round(left)));
    badge.hidden = false;
  }

  function show(data) {
    if (!data) return;
    var phase = data.phase || 'idle';
    // まとめ引きの段階表示は結果の実際の件数で出す（11連なら「11連」）
    phaseEl.textContent = phase === 'ten' && data.results && data.results.length ? data.results.length + '連' : (phases[phase] ?? phase);
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
    showPity(data);
    showLike(data);
    if (kind === 'omikuji') {
      var who = data.trigger && data.trigger.user;
      var drawerName = phase !== 'idle' && who && who.name ? who.name : '';
      setText('slipName', drawerName);
      setText('stickName', data.displayMode === 'short' ? '' : drawerName);
      var results = data.results;
      // まとめ引きの札は、実際の件数で「〜さんの◯連」と出す（既定の10なら今までと同じ「10連」）
      setText('drawWho', results && results.length && drawerName ? drawerName + ' さんの' + results.length + '連' : '');
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
    if (!data) return;
    if (data.type === 'hello' || data.type === 'config') {
      applyBg((data.config || {})[kind]);
      if (window.__twApplyFont) window.__twApplyFont(data.config);
      return;
    }
    if (data.type !== kind) return;
    // 進み具合だけの知らせは、抽選の表示を動かさずゲージと倍率の札だけ直す
    if (data.event === 'progress') { showLike(data); return; }
    show(data);
  }

  function connect() {
    window.twReplaySocket.connect(
      wsProto + '//' + location.host + base + '/ws' + (/[?&]preview=(?:1|live)/.test(location.search) ? '?preview=1' : ''),
      function (ev) { onText(ev.data); },
      1000,
    );
  }

  // 背景（透明／クロマキー用の色／単色／背景画像）。設定は /api/config の自分の節から取る
  function applyBg(entry) {
    entry = entry || {};
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
  }
  var bgReq = new XMLHttpRequest();
  bgReq.open('GET', base + '/api/config', true);
  bgReq.onreadystatechange = function () {
    if (bgReq.readyState !== 4 || bgReq.status !== 200) return;
    try {
      var cfg = JSON.parse(bgReq.responseText).config || {};
      applyBg(cfg[kind]);
      if (window.__twApplyFont) window.__twApplyFont(cfg);
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
