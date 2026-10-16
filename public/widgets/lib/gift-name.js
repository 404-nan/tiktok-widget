// 画面に出すギフト名（Chromium 103 / LIVE Studio 向けの素のスクリプト）。
// 上の src/gift-display.js と同じ引き方: GiftID → 英語名（大文字小文字と空白は無視）→ そのまま。
// 対応表は installGiftNames で渡す（/api/gift-names）。トップレベル await・.at・replaceAll は使わない。
(function (root) {
  var byId = {};
  var byName = {};

  function trim(v) {
    return String(v == null ? '' : v).replace(/^\s+|\s+$/g, '');
  }

  function compact(v) {
    return trim(v).toLowerCase().replace(/\s+/g, '');
  }

  function installGiftNames(data) {
    byId = {};
    byName = {};
    var names = data && data.names ? data.names : null;
    if (!names) return;
    for (var id in names) {
      if (!Object.prototype.hasOwnProperty.call(names, id)) continue;
      var pair = names[id];
      if (!pair || !pair.length) continue;
      var en = trim(pair[0]);
      var ja = trim(pair[1]);
      if (!ja) continue;
      byId[String(id)] = ja;
      var key = compact(en);
      if (key && !byName[key]) byName[key] = ja;
    }
    root.__twGiftNamesReady = true;
  }

  function lookup(gift) {
    var id = '';
    var name = '';
    if (gift != null && typeof gift === 'object') {
      id = trim(gift.id || gift.giftId);
      name = trim(gift.name || gift.giftName);
    } else if (gift != null && gift !== '') {
      name = trim(gift);
      if (byId[name]) return byId[name];
    }
    if (id && byId[id]) return byId[id];
    var key = compact(name);
    if (key && byName[key]) return byName[key];
    return '';
  }

  function giftDisplayName(gift) {
    var ja = lookup(gift);
    if (ja) return ja;
    if (gift == null || gift === '') return 'Gift';
    if (typeof gift === 'string' || typeof gift === 'number') {
      var raw = trim(gift);
      return raw || 'Gift';
    }
    var nameJa = trim(gift.nameJa);
    var name = trim(gift.name || gift.giftName);
    var id = trim(gift.id || gift.giftId);
    return nameJa || name || id || 'Gift';
  }

  function giftOverlayText(gift) {
    var count = Number(gift && gift.count) || 1;
    return giftDisplayName(gift) + ' ×' + count;
  }

  function rouletteTriggerText(r, format) {
    if (r && r.hint) return String(r.hint);
    var fmt = typeof format === 'function' ? format : function (n) { return String(n); };
    var parts = [];
    var gifts = r && r.gifts && r.gifts.length ? r.gifts : [];
    if (gifts.length) {
      var names = [];
      var i;
      for (i = 0; i < gifts.length; i++) names.push(giftDisplayName(gifts[i]));
      parts.push(names.join('・'));
    }
    var min = Number(r && r.minCoins) || 0;
    var max = Number(r && r.maxCoins) || 0;
    if (min > 0) parts.push(max ? fmt(min) + '〜' + fmt(max) + 'コインのギフト' : fmt(min) + 'コイン以上のギフト');
    var events = r && r.events && r.events.length ? r.events : [];
    var j;
    for (j = 0; j < events.length; j++) {
      if (events[j] === 'follow') parts.push('フォロー');
      if (events[j] === 'share') parts.push('シェア');
    }
    var title = (r && r.name) || 'ルーレット';
    return parts.length ? parts.join(' / ') + 'で' + title : title;
  }

  function timerTriggerText(timer) {
    var names = [];
    var rules = timer && timer.rules && timer.rules.length ? timer.rules : [];
    var i;
    for (i = 0; i < rules.length; i++) {
      var rule = rules[i];
      if (rule && rule.gifts && rule.gifts.length && Number(rule.seconds) > 0) {
        names.push(giftDisplayName(rule.gifts[0]));
        if (names.length >= 2) break;
      }
    }
    return names.join(' / ');
  }

  root.installGiftNames = installGiftNames;
  root.giftDisplayName = giftDisplayName;
  root.giftOverlayText = giftOverlayText;
  root.rouletteTriggerText = rouletteTriggerText;
  root.timerTriggerText = timerTriggerText;
})(typeof globalThis !== 'undefined' ? globalThis : this);
