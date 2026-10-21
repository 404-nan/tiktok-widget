/* スロットの結果をサーバーから受け取り、和パチスロ風に開示する（ES5・Chromium 103）。
   見た目と時刻は docs/slot-design/spec.md。結果（絵柄・役・リーチ・ニアミス・復活）はサーバーが先に決めたものをそのまま見せる。 */
(function () {
  var Core = window.SlotCore;
  var PICS = Core.PICS;
  var CELL = Core.CELL_PX;
  var STAGE_W = 1080;
  var STAGE_H = 600;
  var QUEUE_CAP = 20;
  var STOP_LEAD_MS = 120;
  var NEAR_LEAD_MS = 190;
  var SAFETY_MS = 5000;
  // 上段・下段に見せる絵のずらし方（リールごとに変え、3 本とも同じ並びに見えないようにする）
  var ROW_OFFSETS = [[-1, 1], [2, -2], [3, 1]];

  var stage = document.getElementById('stage');
  var cabWrap = document.getElementById('cabWrap');
  var cab = document.getElementById('cab');
  var call = document.getElementById('call');
  var queueEl = document.getElementById('queue');
  var who = document.getElementById('who');
  var avatar = document.getElementById('avatar');
  var nameEl = document.getElementById('name');
  var giftEl = document.getElementById('gift');
  var mini = document.getElementById('mini');
  var miniGift = document.getElementById('miniGift');
  var reels = cab.querySelectorAll('.reel');
  var lamps = cab.querySelectorAll('.lamp');
  var stoppers = document.getElementById('stoppers');

  var base = '';
  var pathMatch = location.pathname.match(/^\/t\/[^/]+/);
  if (pathMatch) base = pathMatch[0];
  var preview = location.search.indexOf('preview=1') >= 0;

  var cfg = { enabled: true, reelStopMs: 700, idleMode: 'small', symbols: [], payouts: [], trigger: {} };
  var picFor = Core.createSymbolMap([]);
  var runTimers = [];
  var active = false;
  var holdUntil = 0;
  var queue = [];
  var queueTimer = null;
  var retractTimer = null;
  var current = null;
  var doneSeq = 0;

  function now() { return new Date().getTime(); }

  // ---- 枠を画面の幅に合わせて丸ごと縮める（中の寸法は 1080×600 のまま。文字は折り返さない） ----
  function fitStage() {
    var w = window.innerWidth || STAGE_W;
    var h = window.innerHeight || STAGE_H;
    var s = Math.min(w / STAGE_W, h / STAGE_H);
    if (!(s > 0)) s = 1;
    stage.style.transform = 'translate(' + Math.max(0, (w - STAGE_W * s) / 2) + 'px,0) scale(' + s + ')';
  }

  function wait(ms, fn) {
    var timer = setTimeout(function () {
      var i = runTimers.indexOf(timer);
      if (i >= 0) runTimers.splice(i, 1);
      fn();
    }, Math.max(0, Number(ms) || 0));
    runTimers.push(timer);
  }

  function clearRun() {
    var i;
    for (i = 0; i < runTimers.length; i++) clearTimeout(runTimers[i]);
    runTimers = [];
  }

  // アニメーションを最初からやり直す（同じクラスを付け直すと動かないため）
  function restart(el, cls) {
    el.classList.remove(cls);
    void el.offsetWidth;
    el.classList.add(cls);
  }

  function text(value) {
    return String(value == null ? '' : value).replace(/^\s+|\s+$/g, '');
  }

  function giftName(gift) {
    if (gift == null || gift === '') return '';
    return typeof window.giftDisplayName === 'function' ? window.giftDisplayName(gift) : text(gift.name || gift);
  }

  // ---- リール ----
  function cellHTML(pic, cls) {
    return '<div class="cell' + (cls ? ' ' + cls : '') + '"><svg class="sym" viewBox="0 0 100 100" role="img" aria-label="' +
      Core.PIC_LABELS[pic] + '"><use href="#s-' + pic + '"/></svg></div>';
  }

  function neighbor(pic, step) {
    var i = PICS.indexOf(pic);
    if (i < 0) i = 0;
    return PICS[((i + step) % PICS.length + PICS.length) % PICS.length];
  }

  function spinReel(index) {
    var reel = reels[index];
    var strip = reel.firstChild;
    var html = '';
    var i;
    for (i = 0; i < PICS.length * 2; i++) html += cellHTML(PICS[i % PICS.length]);
    strip.className = 'strip';
    strip.innerHTML = html;
    reel.classList.remove('win');
    reel.classList.remove('slow');
    reel.classList.add('spin');
  }

  /** 上段・中段・下段を決めて止める。上から 3 コマ流れてきて中段に止まり、下へ 10px 行き過ぎて戻る */
  function stopReel(index, top, mid, bottom, near) {
    var reel = reels[index];
    var strip = reel.firstChild;
    var html = cellHTML(top) + cellHTML(mid) + cellHTML(bottom);
    var pic = bottom;
    var i;
    for (i = 0; i < 3; i++) { pic = neighbor(pic, 1); html += cellHTML(pic); }
    reel.classList.remove('spin');
    reel.classList.remove('slow');
    strip.innerHTML = html;
    strip.className = 'strip';
    void strip.offsetWidth;
    strip.className = 'strip ' + (near ? 'stop-near' : 'stop');
  }

  /** 復活: 3 本目を 1 コマ下へ落とし、上段にあった当たりの絵を中段へ */
  function dropReel(index) {
    var strip = reels[index].firstChild;
    var first = strip.firstChild;
    var holder = document.createElement('div');
    holder.innerHTML = cellHTML(neighbor(first ? first.querySelector('use').getAttribute('href').slice(3) : PICS[0], -1));
    strip.insertBefore(holder.firstChild, first);
    strip.className = 'strip';
    void strip.offsetWidth;
    strip.className = 'strip drop';
  }

  function middleCell(index) {
    return reels[index].firstChild.children[1];
  }

  function setLamps(count) {
    var i;
    for (i = 0; i < lamps.length; i++) lamps[i].className = 'lamp' + (i < count ? ' on' : '');
  }

  // ---- 帯 ----
  function fitCall() {
    var size;
    call.style.fontSize = '';
    size = parseFloat(window.getComputedStyle(call).fontSize) || 60;
    while (call.scrollWidth > call.clientWidth + 1 && size > 32) {
      size -= 4;
      call.style.fontSize = size + 'px';
    }
  }

  function setCall(value, slam) {
    call.textContent = value;
    call.classList.remove('slam');
    call.classList.remove('slam-big');
    fitCall();
    if (slam) restart(call, slam);
  }

  function setState(name) {
    cab.className = 'cab' + (name ? ' ' + name : '');
  }

  function setQueue(count) {
    if (count > 0) {
      queueEl.textContent = 'あと' + count + '回';
      queueEl.hidden = false;
    } else {
      queueEl.hidden = true;
    }
  }

  function setWho(trigger) {
    var user = trigger && trigger.user ? trigger.user : null;
    var userName = user ? text(user.name) : '';
    var gift = trigger && trigger.gift ? trigger.gift : null;
    var count = Number(trigger && trigger.count) || Number(gift && gift.count) || 1;
    var img;
    if (!userName) { who.hidden = true; return; }
    who.hidden = false;
    nameEl.textContent = userName;
    giftEl.textContent = gift ? giftName(gift) + ' ×' + count : '';
    avatar.textContent = '';
    if (user.avatar) {
      img = document.createElement('img');
      img.alt = '';
      img.onerror = function () { avatar.textContent = userName.charAt(0); };
      img.src = user.avatar;
      avatar.appendChild(img);
    } else {
      avatar.textContent = userName.charAt(0);
    }
  }

  // ---- 待機の小表示 ----
  function idleLabel() {
    var trigger = cfg.trigger || {};
    var gifts = trigger.gifts || [];
    var minCoins = Number(trigger.minCoins) || 0;
    if (gifts.length) return giftName(gifts[0]);
    if (minCoins > 0) return minCoins + 'コイン以上';
    return 'ギフト';
  }

  function updateMini() {
    var show = !active && cfg.enabled !== false && (cfg.idleMode !== 'hide' || preview);
    miniGift.textContent = idleLabel();
    if (show) {
      mini.hidden = false;
      void mini.offsetWidth;
      mini.classList.remove('off');
    } else if (!mini.hidden) {
      mini.classList.add('off');
    }
  }

  // ---- 開示 ----
  function stopCells(index, result, t) {
    var symbols = result.symbols || [];
    var mid = picFor(symbols[index]);
    var offset = ROW_OFFSETS[index];
    var cells = { top: neighbor(mid, offset[0]), mid: mid, bottom: neighbor(mid, offset[1]), near: false };
    var nearName;
    if (index !== 2) return cells;
    if (result.revival && result.tier !== 'lose') {
      // 一度はずれの絵で止め、上段に当たりの絵を見せておく（あとで 1 コマ落とす）
      cells.top = mid;
      cells.mid = Core.revivalFakePic(mid);
      cells.bottom = neighbor(cells.mid, 1);
    } else if (result.nearMiss && result.tier === 'lose') {
      nearName = Core.nearMissName(symbols, picFor);
      if (nearName) {
        cells.top = picFor(nearName);
        cells.near = true;
      }
    }
    if (cells.bottom === cells.top || cells.bottom === cells.mid) cells.bottom = neighbor(cells.mid, cells.top === neighbor(cells.mid, 1) ? 2 : 1);
    return cells;
  }

  function showResult(result, payout) {
    var tier = result.tier || 'lose';
    var label = payout && text(payout.text) ? text(payout.text) : (tier === 'lose' ? 'はずれ' : '当たり');
    var i;
    setQueue(0);
    reels[2].classList.remove('slow');
    if (tier === 'lose') {
      // はずれは静かに: 叩きつけない・光らせない
      setState('is-lose');
      setCall(label, '');
      return;
    }
    for (i = 0; i < reels.length; i++) {
      reels[i].classList.add('win');
      if (middleCell(i)) middleCell(i).classList.add('win');
    }
    if (tier === 'jackpot') {
      cab.classList.add('flash-on');
      wait(80, function () {
        setState('is-jackpot');
        setCall(label, 'slam-big');
      });
      return;
    }
    setState(tier === 'big' ? 'is-big' : 'is-small');
    setCall(label, 'slam');
  }

  function play(data) {
    var result = data.result;
    var payout = data.payout;
    var t = Core.timeline(result, data.reelStopMs || cfg.reelStopMs);
    var i;
    clearRun();
    current = data;
    holdUntil = now() + t.holdUntil;
    // サーバーの done がもう来ている（待たせていた回）ならすぐ、来なくても余裕を見て筐体を戻す
    scheduleRetract(data.seq && data.seq <= doneSeq ? 1200 : t.holdUntil + SAFETY_MS);

    setState('is-spin');
    setCall('回転！', '');
    wait(120, function () { restart(call, 'slam'); });
    setQueue((Number(data.pending) || 0) + queue.length);
    setWho(data.trigger);
    setLamps(0);
    for (i = 0; i < reels.length; i++) spinReel(i);
    if (!active) {
      active = true;
      updateMini();
      cabWrap.classList.add('up');
    }

    for (i = 0; i < 3; i++) (function (index) {
      var cells = stopCells(index, result, t);
      var lead = cells.near ? NEAR_LEAD_MS : STOP_LEAD_MS;
      wait(t.stops[index] - lead, function () { stopReel(index, cells.top, cells.mid, cells.bottom, cells.near); });
      wait(t.stops[index], function () { setLamps(index + 1); });
    }(i));

    // リーチはサーバーの result.reach のときだけ。3 本目を遅くし、帯と 3 本目の縁を点滅
    if (t.reachAt >= 0) {
      wait(t.reachAt, function () {
        setState('is-reach');
        setQueue(0);
        setCall('リーチ！', 'slam');
        // 停止間隔が短く 3 本目がもう止まっているときは、止まったリールを点滅させない
        if (reels[2].classList.contains('spin')) reels[2].classList.add('slow');
      });
    }

    if (t.revivalAt >= 0) {
      wait(t.settleAt, function () {
        setState('is-pause');
        setQueue(0);
        setCall('', '');
      });
      wait(t.revivalAt, function () { cab.classList.add('flash-on'); });
      wait(t.revivalAt + Core.REVIVAL_FLASH_MS, function () {
        cab.classList.remove('flash-on');
        dropReel(2);
      });
      wait(t.revivalTextAt, function () {
        setState('is-revival');
        setCall('復活！', 'slam');
      });
    } else if (t.reachAt >= 0) {
      wait(t.settleAt, function () { setState(''); });
    }
    wait(t.resultAt, function () { showResult(result, payout); });
  }

  function retract() {
    retractTimer = null;
    if (queue.length) return;
    active = false;
    current = null;
    cabWrap.classList.remove('up');
    clearRun();
    wait(240, updateMini);
  }

  function drainQueue() {
    var next;
    queueTimer = null;
    next = queue.shift();
    if (next) play(next);
    if (queue.length) scheduleQueue();
  }

  function scheduleQueue() {
    if (queueTimer) return;
    queueTimer = setTimeout(drainQueue, Math.max(0, holdUntil - now()));
  }

  // 結果は最低 2.5 秒見せる。見せ終わる前に次の start が来たら、見せ終わるまで待たせる
  function onStart(data) {
    if (active && current && now() < holdUntil) {
      if (queue.length >= QUEUE_CAP) queue.shift();
      queue.push(data);
      scheduleQueue();
      return;
    }
    play(data);
  }

  function scheduleRetract(ms) {
    clearTimeout(retractTimer);
    retractTimer = setTimeout(retract, Math.max(ms, holdUntil - now()));
  }

  function onDone(data) {
    if (data.seq) doneSeq = Math.max(doneSeq, Number(data.seq) || 0);
    if (queue.length || !active || !current) return;
    if (data.seq && current.seq && Number(current.seq) > Number(data.seq)) return;
    scheduleRetract(1200);
  }

  // ---- 設定・接続 ----
  function applyConfig(slots) {
    if (!slots || typeof slots !== 'object') return;
    cfg = slots;
    // 見た目: wa 和パチスロ（いつもの） / casino カジノ
    document.getElementById('stage').className = cfg.look === 'casino' ? 'look-casino' : '';
    picFor = Core.createSymbolMap(Core.configSymbolNames(cfg));
    if (cfg.enabled === false && active) {
      queue = [];
      retract();
    }
    updateMini();
  }

  // リレー停止: ギフトを送った人が1本ずつ止める。結果はサーバーが先に決めて送ってくる
  function onRelay(data) {
    var names = [];
    var result = data.fixedResult;
    var i;
    var mid;
    for (i = 0; i < (data.stoppers || []).length; i++) names.push(data.stoppers[i] && data.stoppers[i].name ? data.stoppers[i].name : '');
    stoppers.textContent = names.join(' / ');
    if (data.message) setCall(data.message);
    if (!result || !result.symbols) return;
    clearRun();
    for (i = 0; i < 3; i++) {
      if (!(data.stoppedAt && data.stoppedAt[i])) { spinReel(i); continue; }
      mid = picFor(result.symbols[i]);
      stopReel(i, neighbor(mid, ROW_OFFSETS[i][0]), mid, neighbor(mid, ROW_OFFSETS[i][1]), false);
    }
    if (data.stoppedCount === 3) {
      setState('relay-done');
      wait(250, playRelaySound);
      wait(3000, function () { setState(''); });
    }
  }

  function playRelaySound() {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    var context;
    var oscillator;
    if (!AudioContext) return;
    try {
      context = new AudioContext();
      oscillator = context.createOscillator();
      oscillator.frequency.value = 440;
      oscillator.connect(context.destination);
      oscillator.start();
      oscillator.stop(context.currentTime + 0.08);
    } catch (e) {}
  }

  function onMessage(raw) {
    var data;
    try { data = JSON.parse(raw); } catch (e) { return; }
    if (!data) return;
    if ((data.type === 'hello' || data.type === 'config') && data.config) applyConfig(data.config.slots);
    if (data.type === 'relay-stop') { onRelay(data); return; }
    if (data.type !== 'slot') return;
    if (data.event === 'start' && data.result) onStart(data);
    if (data.event === 'done') onDone(data);
  }

  function connect() {
    var proto = location.protocol.indexOf('https') === 0 ? 'wss:' : 'ws:';
    var ws = new WebSocket(proto + '//' + location.host + base + '/ws');
    ws.onmessage = function (ev) { onMessage(ev.data); };
    ws.onclose = function () { setTimeout(connect, 1000); };
  }

  function getJSON(path, fn) {
    var req = new XMLHttpRequest();
    req.open('GET', base + path, true);
    req.onreadystatechange = function () {
      var data;
      if (req.readyState !== 4 || req.status !== 200) return;
      try { data = JSON.parse(req.responseText); } catch (e) { return; }
      fn(data);
    };
    req.send(null);
  }

  fitStage();
  window.addEventListener('resize', fitStage);
  for (var r = 0; r < reels.length; r++) stopReel(r, PICS[(r + 5) % 6], '7', PICS[(r + 1) % 6], false);
  updateMini();

  getJSON('/api/gift-names', function (data) {
    if (typeof window.installGiftNames === 'function') window.installGiftNames(data);
    updateMini();
    if (current) setWho(current.trigger);
  });
  getJSON('/api/relay-stop', function (data) {
    if (!data) return;
    data.type = 'relay-stop';
    onRelay(data);
  });
  getJSON('/api/config', function (data) {
    if (data && data.config) applyConfig(data.config.slots);
    getJSON('/api/slot', function (state) {
      if (state && state.result && state.phase !== 'idle' && !current) onStart(state);
    });
  });
  connect();
}());
