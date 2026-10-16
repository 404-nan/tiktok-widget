// スロット画面の共通部分（ES5・Chromium 103）。絵柄名 → SVG 6 種の対応表と、開示演出の時刻表。
// 時刻表は src/slot.js の slotTimeline と同じ数字にする（サーバーの done はこの holdUntil に合わせて送られる）。
(function (root) {
  // SVG の絵柄（public/widgets/slot.html の <symbol id="s-…">）
  var PICS = ['7', 'bar', 'bell', 'suika', 'cherry', 'replay'];
  var PIC_LABELS = { '7': '7', bar: 'BAR', bell: 'ベル', suika: 'スイカ', cherry: 'チェリー', replay: 'リプレイ' };
  // 設定の絵柄名 → 絵。古い初期値の「さくらんぼ」「スター」もここで読み替える
  var ALIASES = {
    '7': '7', '７': '7', 'seven': '7', 'セブン': '7', 'せぶん': '7',
    'bar': 'bar', 'ｂａｒ': 'bar', 'バー': 'bar', 'ばー': 'bar',
    'スター': 'bar', 'すたー': 'bar', 'star': 'bar', '星': 'bar', 'ほし': 'bar', '★': 'bar', '☆': 'bar',
    'ベル': 'bell', 'べる': 'bell', 'bell': 'bell', '鈴': 'bell',
    'スイカ': 'suika', 'すいか': 'suika', '西瓜': 'suika', 'watermelon': 'suika', 'suika': 'suika',
    'チェリー': 'cherry', 'ちぇりー': 'cherry', 'さくらんぼ': 'cherry', 'サクランボ': 'cherry', 'cherry': 'cherry', '桜桃': 'cherry',
    'リプレイ': 'replay', 'りぷれい': 'replay', 'replay': 'replay'
  };
  // 対応表に無い名前は、まだ使われていない絵から順に割り当てる
  var SPARE_ORDER = ['bar', 'suika', 'replay', 'bell', 'cherry', '7'];

  var CELL_PX = 92;
  var BOUNCE_MS = 120;
  var REVIVAL_PAUSE_MS = 900;
  var REVIVAL_FLASH_MS = 80;
  var REVIVAL_DROP_MS = 160;
  var REVIVAL_TEXT_MS = 600;
  var RESULT_HOLD_MS = 2500;

  function trim(v) {
    return String(v == null ? '' : v).replace(/^\s+|\s+$/g, '');
  }

  /** src/slot.js の symbolName と同じ引き方（id → label → name → そのもの） */
  function symbolName(symbol) {
    if (symbol != null && typeof symbol === 'object') {
      if (symbol.id != null) return trim(symbol.id);
      if (symbol.label != null) return trim(symbol.label);
      if (symbol.name != null) return trim(symbol.name);
      return '';
    }
    return trim(symbol);
  }

  function aliasOf(name) {
    var key = trim(name);
    if (Object.prototype.hasOwnProperty.call(ALIASES, key)) return ALIASES[key];
    key = key.toLowerCase().replace(/\s+/g, '');
    if (Object.prototype.hasOwnProperty.call(ALIASES, key)) return ALIASES[key];
    return '';
  }

  function hashPic(name) {
    var h = 0;
    var i;
    for (i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) % 1000003;
    return PICS[h % PICS.length];
  }

  /**
   * 絵柄名 → 絵 の引き方を作る。names は設定の symbols と役の symbols を並べたもの。
   * 対応表にある名前を先に決め、残りは空いている絵へ順に割り当てる（文字だけの絵柄は出さない）。
   */
  function createSymbolMap(names) {
    var map = {};
    var used = {};
    var list = [];
    var i;
    var name;
    var pic;
    for (i = 0; i < (names || []).length; i++) {
      name = symbolName(names[i]);
      if (name && list.indexOf(name) < 0) list.push(name);
    }
    for (i = 0; i < list.length; i++) {
      pic = aliasOf(list[i]);
      if (pic) { map[list[i]] = pic; used[pic] = true; }
    }
    function assign(n) {
      var j;
      for (j = 0; j < SPARE_ORDER.length; j++) {
        if (!used[SPARE_ORDER[j]]) { used[SPARE_ORDER[j]] = true; return SPARE_ORDER[j]; }
      }
      return hashPic(n);
    }
    for (i = 0; i < list.length; i++) if (!map[list[i]]) map[list[i]] = assign(list[i]);
    return function picFor(value) {
      var n = symbolName(value);
      if (!n) return '7';
      if (!map[n]) map[n] = aliasOf(n) || assign(n);
      return map[n];
    };
  }

  /** 設定（slots）から、出てくる絵柄名を全部集める */
  function configSymbolNames(cfg) {
    var out = [];
    var i;
    var j;
    var symbols = cfg && cfg.symbols ? cfg.symbols : [];
    var payouts = cfg && cfg.payouts ? cfg.payouts : [];
    for (i = 0; i < symbols.length; i++) out.push(symbolName(symbols[i]));
    for (i = 0; i < payouts.length; i++) {
      var list = payouts[i] && payouts[i].symbols ? payouts[i].symbols : [];
      for (j = 0; j < list.length; j++) out.push(symbolName(list[j]));
    }
    return out;
  }

  function stopInterval(reelStopMs) {
    var n = Number(reelStopMs);
    return isFinite(n) && n > 0 ? n : 700;
  }

  /**
   * 開示演出の時刻表（start を受けた時刻からのミリ秒）。
   * stops: 各リールが止まる時刻 / reachAt: リーチ（無ければ -1）/ settleAt: 3 本目の跳ね返りが終わる時刻
   * revivalAt: 復活の光（無ければ -1）/ resultAt: payout.text を出す時刻 / holdUntil: 結果を最低これまで見せる
   */
  function timeline(result, reelStopMs) {
    var stop = stopInterval(reelStopMs);
    var r = result || {};
    var settleAt = stop * 3 + BOUNCE_MS;
    var revivalAt = r.revival ? settleAt + REVIVAL_PAUSE_MS : -1;
    var resultAt = r.revival ? revivalAt + REVIVAL_FLASH_MS + REVIVAL_DROP_MS + REVIVAL_TEXT_MS : settleAt;
    return {
      stops: [stop, stop * 2, stop * 3],
      reachAt: r.reach ? stop * 2 : -1,
      settleAt: settleAt,
      revivalAt: revivalAt,
      revivalTextAt: r.revival ? revivalAt + REVIVAL_FLASH_MS + REVIVAL_DROP_MS : -1,
      resultAt: resultAt,
      holdUntil: resultAt + RESULT_HOLD_MS
    };
  }

  /** ニアミスで 3 本目の上段に見せる絵柄名（中段の絵と同じ絵になるときは出さない＝空） */
  function nearMissName(symbols, picFor) {
    var s = symbols || [];
    var want = s[0] === s[1] ? s[0] : (s[0] !== s[2] ? s[0] : s[1]);
    if (want == null || picFor(want) === picFor(s[2])) return '';
    return want;
  }

  /** 復活で 3 本目が一度止まる「はずれ」の絵（当たりの絵と違うもの） */
  function revivalFakePic(winPic) {
    var i = PICS.indexOf(winPic);
    return PICS[(i + 2 + PICS.length) % PICS.length];
  }

  var api = {
    PICS: PICS,
    PIC_LABELS: PIC_LABELS,
    ALIASES: ALIASES,
    CELL_PX: CELL_PX,
    BOUNCE_MS: BOUNCE_MS,
    REVIVAL_PAUSE_MS: REVIVAL_PAUSE_MS,
    REVIVAL_FLASH_MS: REVIVAL_FLASH_MS,
    REVIVAL_DROP_MS: REVIVAL_DROP_MS,
    REVIVAL_TEXT_MS: REVIVAL_TEXT_MS,
    RESULT_HOLD_MS: RESULT_HOLD_MS,
    symbolName: symbolName,
    aliasOf: aliasOf,
    createSymbolMap: createSymbolMap,
    configSymbolNames: configSymbolNames,
    timeline: timeline,
    nearMissName: nearMissName,
    revivalFakePic: revivalFakePic
  };
  root.SlotCore = api;
  if (typeof module !== 'undefined' && module && module.exports) module.exports = api;
}(typeof window !== 'undefined' ? window : this));
