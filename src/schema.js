// 設定ファイル（config.yaml）の定義。
// ここに書いた項目・初期値・説明が、検証、ウィジェットの初期値、ダッシュボード、
// AI 向けの説明（MCP / CLI の reference）すべての元になる。

export const COLOR_TOKENS = ['accent', 'gold', 'ink', 'ink-2', 'paper'];
export const GIFT_EVENTS = ['gift', 'follow', 'share'];
export const METRICS = ['follows', 'likes', 'diamonds', 'gifts', 'shares', 'comments', 'viewers'];

const str = (def, desc, extra) => ({ type: 'string', default: def, desc, ...extra });
const num = (def, desc, extra) => ({ type: 'number', default: def, desc, ...extra });
const bool = (def, desc) => ({ type: 'boolean', default: def, desc });
const oneOf = (values, def, desc) => ({ type: 'enum', values, default: def, desc });
const color = (def, desc) => ({ type: 'color', default: def, desc });
const list = (def, desc, values) => ({ type: 'list', default: def, desc, values });

export const SCHEMA = {
  theme: {
    kind: 'object',
    title: 'テーマ',
    desc: '全ウィジェット共通の色と大きさ。色は #RRGGBB か、accent / gold / ink / ink-2 / paper の名前で書ける。',
    fields: {
      mode: oneOf(['dark', 'light'], 'dark', 'dark は墨の面に白文字、light は白の面に墨文字'),
      accent: color('#FF4F1F', '差し色（朱）。「今起きたこと」を示す色'),
      gold: color('#FFC53D', 'コインや達成を示す色'),
      ink: color('#111113', '墨（暗い面）の色'),
      paper: color('#F6F5F1', '白（明るい面・文字）の色'),
      scale: num(1, '全体の拡大率', { min: 0.3, max: 4 }),
    },
  },

  alerts: {
    kind: 'map',
    page: 'gift-alert',
    title: 'ギフト通知',
    desc: 'ギフト・フォロー・シェアを中継テロップのように出す。URL は /widgets/gift-alert.html?id=<名前>',
    size: () => [760, 200],
    fields: {
      events: list(['gift', 'follow'], '通知するイベント', GIFT_EVENTS),
      gifts: list([], 'このギフト名（または ID）だけ通知する。空なら全部'),
      minCoins: num(1, 'この合計コイン未満のギフトは通知しない', { min: 0 }),
      bigCoins: num(100, 'この合計コイン以上は金色の演出にする', { min: 0 }),
      duration: num(4.5, '1件の表示秒数', { min: 1, max: 30 }),
      position: oneOf(['top', 'center', 'bottom'], 'top', '縦の位置'),
      align: oneOf(['left', 'center', 'right'], 'left', '横の位置'),
      sound: bool(true, '効果音を鳴らす'),
      volume: num(0.3, '効果音の音量（0〜1）', { min: 0, max: 1 }),
      followText: str('フォローしてくれました', 'フォローのときの文'),
      shareText: str('配信をシェアしてくれました', 'シェアのときの文'),
      rules: {
        type: 'rules',
        default: [],
        desc:
          '条件ごとに見た目を上書きする。上から順に最初に合ったものを使う。' +
          '条件: gifts（ギフト名の一覧）/ users（ユーザー ID の一覧）/ minCoins。' +
          '上書き: color（帯と面の色）/ big（金色の演出）/ duration / sound / text（2行目の文）',
      },
    },
  },

  jars: {
    kind: 'map',
    page: 'gift-jar',
    title: 'ギフト瓶',
    desc: '届いたギフトが入れ物に落ちてたまる。URL は /widgets/gift-jar.html?id=<名前>',
    size: (e) => ({ jar: [500, 700], heart: [600, 600], potion: [520, 700] })[e.shape] ?? [500, 700],
    fields: {
      shape: oneOf(['jar', 'heart', 'potion'], 'jar', '入れ物の形。jar 保存瓶 / heart ハート / potion エリクサーのフラスコ'),
      title: str('ギフト瓶', 'ラベルの文字'),
      label: bool(true, '合計コインのラベルを出す'),
      gifts: list([], 'このギフト名（または ID）だけ入れる。空なら全部'),
      minCoins: num(1, 'この合計コイン未満のギフトは入れない', { min: 0 }),
      maxItems: num(300, '入れておく最大数。超えたら古いものから消える', { min: 10, max: 2000 }),
      perGift: num(30, '連打1回で落とす最大数', { min: 1, max: 200 }),
      keep: bool(true, '読み込み直しても中身を残す'),
      sizeMin: num(1, '小さいギフトの玉の大きさの倍率', { min: 0.2, max: 4 }),
      sizeMax: num(1, '大きいギフトの玉の大きさの倍率', { min: 0.2, max: 4 }),
      liquid: oneOf(['auto', 'on', 'off'], 'auto', '中の液体。auto はフラスコだけ表示'),
      liquidColor: color('accent', '液体の色'),
      glassColor: color('paper', 'ガラスの線の色'),
    },
  },

  goals: {
    kind: 'map',
    page: 'goal',
    title: '目標バー',
    desc: 'フォロー数などの目標までの進み具合。URL は /widgets/goal.html?id=<名前>',
    size: () => [640, 180],
    fields: {
      title: str('フォロー目標', 'タイトル'),
      metric: oneOf(METRICS, 'follows', '数えるもの'),
      goal: num(100, '目標値', { min: 1 }),
      start: num(0, '最初から足しておく数', { min: 0 }),
      step: num(0, '達成したら目標をこの数だけ上げる（0 で上げない）', { min: 0 }),
      sound: bool(true, '達成時の効果音'),
      volume: num(0.3, '効果音の音量（0〜1）', { min: 0, max: 1 }),
      color: color('accent', 'バーの色'),
      doneColor: color('gold', '達成後のバーの色'),
    },
  },

  wins: {
    kind: 'map',
    page: 'wins',
    title: 'WIN数',
    desc:
      'WIN 数（妨害マイクラなどのゲームクリア回数）。クリアしたらダッシュボード・モニター・URL（Stream Deck など）で +1。' +
      '一度に大きく減ったときは 大妨害・超妨害・壊滅 の段階で演出が派手になり、全画面の演出は /widgets/wins-fx.html?id=<名前> を配信画面いっぱいに重ねる。' +
      'rules で「このギフトで WIN -1」「このギフトで 0 に戻す」のようにギフトで増減できる。' +
      '数はサーバーの data/wins.json に残るので、配信をまたいで続けられる。URL は /widgets/wins.html?id=<名前>',
    size: (e) => (e.style === 'big' ? [380, 400] : [600, 200]),
    // 大妨害・超妨害・壊滅を配信画面いっぱいに出すページ（板とは別に OBS に入れる）
    extraPages: [{ page: 'wins-fx', title: 'WIN数の全画面演出', size: () => [1080, 1920] }],
    fields: {
      title: str('WIN', '大きく出す見出し'),
      goal: num(0, '目標（例 10 で「/ 10」と出し、達成で祝う。0 で出さない）', { min: 0 }),
      rules: {
        type: 'winRules',
        default: [],
        desc:
          'ギフトで WIN 数を変える。上から順に最初に合ったものを使う。' +
          '条件: gifts（ギフト名の一覧）/ minCoins（この合計コイン以上）/ users。' +
          '変え方: add（足す数。-1 で減らす）/ set（その数にする）/ reset: true（0 にリセット）。' +
          'add は連打の個数分かかる（perCount: false で1回だけ）。text は演出に出す文（例 "妨害成功"）',
      },
      negative: bool(true, 'マイナス（-1 WIN など）まで減らせる（false なら 0 で止まる）'),
      winText: str('WIN!', 'クリアで +1 したときに出す文字'),
      lossPreset: oneOf(
        ['large', 'medium', 'small', 'custom'],
        'large',
        '演出の段階の境目（大妨害 / 超妨害 / 壊滅になる減り方）。large 10 / 100 / 1000、medium 3 / 10 / 30、small 1 / 3 / 5（-1 から派手に）、custom は bigLoss / hugeLoss / ruinLoss で決める',
      ),
      gainPreset: oneOf(
        ['large', 'medium', 'small', 'custom'],
        'large',
        '増えたときの演出の段階の境目（大 / 超 / 最大）。large +10 / +100 / +1000、medium +3 / +10 / +30、small +1 / +3 / +5、custom は bigGain / hugeGain / topGain',
      ),
      comboUp: bool(true, '続けて減る・増える（15 秒以内）と段階を上げる。×3 で1段、×5 で2段、×8 で最大'),
      clearFx: bool(true, 'クリア（+1 ボタン）を大きく祝う（全画面にも WIN を出す）'),
      power: num(1, '演出の強さ（揺れ・ひび・ダメージの数字の大きさの倍率）', { min: 0.3, max: 3 }),
      minusAmbient: bool(true, 'マイナスの間、全画面演出の縁を赤く脈打たせる（深いほど強く）'),
      celebrate: bool(true, '目標達成・マイナス脱出・リーチを全画面演出で祝う'),
      bigLoss: num(10, '「大妨害」になる減り方（lossPreset が custom のとき。一度にこの数以上減ったら）', { min: 1 }),
      hugeLoss: num(100, '「超妨害」になる減り方（custom のとき）', { min: 1 }),
      ruinLoss: num(1000, '「壊滅」になる減り方（custom のとき）', { min: 1 }),
      bigGain: num(10, '増えたときの「大」になる数（gainPreset が custom のとき）', { min: 1 }),
      hugeGain: num(100, '増えたときの「超」になる数（custom のとき）', { min: 1 }),
      topGain: num(1000, '増えたときの「最大」になる数（custom のとき）', { min: 1 }),
      bigLossText: str('大妨害', '大妨害のときの文字'),
      hugeLossText: str('超妨害', '超妨害のときの文字'),
      ruinLossText: str('壊滅', '壊滅のときの文字'),
      milestone: num(5, 'この数ごとに大きく祝う（5 なら 5・10・15…。0 で祝わない）', { min: 0 }),
      style: oneOf(['plate', 'big'], 'plate', 'plate 横長の板 / big 大きい数字（画面の端に置く用）'),
      color: color('accent', '見出しの色'),
      sound: bool(true, '効果音'),
      volume: num(0.4, '効果音の音量（0〜1）', { min: 0, max: 1 }),
    },
  },

  counters: {
    kind: 'map',
    page: 'counter',
    title: 'いいね・視聴者数',
    desc: 'いいね・視聴者などのスコアボード。URL は /widgets/counter.html?id=<名前>',
    size: () => [560, 220],
    fields: {
      show: list(['likes', 'viewers'], '表示する数値（並べる順）', METRICS),
      layout: oneOf(['row', 'column'], 'row', '横に並べるか縦に並べるか'),
      align: oneOf(['left', 'center', 'right'], 'left', '寄せ'),
      labels: bool(true, 'ラベルを出す'),
      hearts: bool(true, 'いいねが来たらハートを浮かべる'),
      color: color('accent', '左の帯とアイコンの色'),
    },
  },

  roulettes: {
    kind: 'map',
    page: 'roulette',
    title: 'ルーレット',
    desc:
      'ギフトで回るルーレット。複数作ると、届いたギフトに合うルーレットへ切り替わって回る。' +
      'URL は /widgets/roulette.html（全部）か ?ids=<名前>,<名前>（絞り込み）',
    size: (e) => (e.style === 'strip' ? [820, 330] : [600, 680]),
    fields: {
      name: str('', '表示名（ダッシュボード用）'),
      style: oneOf(['wheel', 'strip'], 'wheel', 'wheel 丸いホイール / strip 横に流れるカード'),
      gifts: list([], 'このギフト名（または ID）で回す。ギフト名の指定は minCoins より優先される'),
      minCoins: num(0, '合計コインがこれ以上のギフトでも回す（0 で無効）', { min: 0 }),
      maxCoins: num(0, 'minCoins で回すときの上限コイン（0 で上限なし）', { min: 0 }),
      events: list([], 'フォロー・シェアでも回す', ['follow', 'share']),
      perCount: bool(false, '×5 なら 5 回まわす（最大 20 回）'),
      duration: num(6, '回る秒数', { min: 1, max: 30 }),
      hold: num(4, '結果を出しておく秒数', { min: 1, max: 30 }),
      hint: str('', '下に出す案内文（空なら条件から自動）'),
      sound: bool(true, '効果音'),
      volume: num(0.3, '効果音の音量（0〜1）', { min: 0, max: 1 }),
      palette: list(['accent', 'paper', 'gold', 'ink-2'], '色を指定していない項目に順番に使う色'),
      pointerColor: color('accent', '針の色'),
      frameColor: color('ink', '縁・枠の色'),
      fontScale: num(1, '項目の文字の大きさの倍率', { min: 0.5, max: 2 }),
      items: {
        type: 'items',
        default: ['ハズレ', '歌う*2', '一発ギャグ', 'ハズレ', '変顔*2', '質問に答える*2'],
        desc:
          '項目の一覧。「歌う*2」のような文字か、{ label, weight, color, textColor, image, commands } で書く。' +
          'weight は当たりやすさ（丸型では扇の大きさも比例）。image は画像の URL か media/ フォルダのファイル名。' +
          'image がなければ文字だけを中央に出す。commands はその項目が当たったときに Minecraft に送るコマンドの一覧、' +
          'superstreamGift / superstreamAction は当たったときに起こす SuperStream の演出（minecraft の設定が必要）。rush: true は当たったら RUSH 突入',
      },
    },
  },
};

// カットイン（通常・画像付き）で共通の項目: 段階のしきい値・文字・動き
const cutinFields = () => ({
  minCoins: num(100, 'この合計コイン以上のギフトで出す（ここからが青）', { min: 1 }),
  greenCoins: num(300, 'ここから緑', { min: 1 }),
  redCoins: num(1000, 'ここから赤（激アツ）', { min: 1 }),
  goldCoins: num(5000, 'ここから金', { min: 1 }),
  rainbowCoins: num(20000, 'ここから虹（フリーズ演出つき）', { min: 1 }),
  gifts: list([], 'このギフト名なら金額に関係なく出す（赤から）'),
  events: list([], 'フォロー・シェアでも出す（青）', ['follow', 'share']),
  word: bool(true, '「激アツ」などの文字を出す'),
  blueText: str('チャンス', '青の文字'),
  greenText: str('チャンス!!', '緑の文字'),
  redText: str('激アツ', '赤の文字'),
  goldText: str('超激アツ', '金の文字'),
  rainbowText: str('確定', '虹の文字'),
  angle: num(-8, '帯の傾き（度）', { min: -30, max: 30 }),
  hold: num(1.1, 'ガガガと揺れている秒数', { min: 0.3, max: 5 }),
  shake: num(1, '揺れの強さの倍率（0 で揺らさない）', { min: 0, max: 3 }),
  freeze: bool(true, '虹のときフリーズ演出を入れる'),
  lines: bool(true, '集中線を出す'),
  sound: bool(true, '効果音'),
  volume: num(0.5, '効果音の音量（0〜1）', { min: 0, max: 1 }),
});

SCHEMA.cutins = {
  kind: 'map',
  page: 'cutin',
  title: 'カットイン',
  desc:
    '通常カットイン。筆でかすれた帯がフィーンと入り、「激アツ」の文字が叩きつけられ、ガガガと揺れてスッと抜ける。' +
    'ギフトのコインで 青→緑→赤→金→虹 と格上げし、虹は画面が止まってから入る（フリーズ）。' +
    '配信画面いっぱいに重ねる。URL は /widgets/cutin.html?id=<名前>',
  size: () => [1080, 1920],
  fields: {
    ...cutinFields(),
    yieldToImage: bool(false, '画像付きカットインが出るギフトのときは、こちらを出さない（両方を OBS に入れて重ならないように）'),
  },
};

SCHEMA.imageCutins = {
  kind: 'map',
  page: 'image-cutin',
  title: '画像付きカットイン',
  desc:
    '写真を使うカットイン。inside は斜めの帯の中いっぱいに写真が入り、上下の縁が木炭でかすれた線になる。' +
    'side は色の帯の横に写真が大きく乗る（背景を切り抜いた PNG がおすすめ）。段階・文字・動きは通常カットインと同じ。' +
    'URL は /widgets/image-cutin.html?id=<名前>',
  size: () => [1080, 1920],
  fields: {
    photo: str('', '写真（media/ のファイルか URL）。inside で空のときは段階の色で埋める'),
    layout: oneOf(['inside', 'side'], 'inside', 'inside 帯の中いっぱい（縁が木炭のかすれ線）/ side 色の帯の横に大きく乗る'),
    ...cutinFields(),
  },
};

SCHEMA.rush = {
  kind: 'object',
  page: 'rush',
  title: 'RUSH',
  size: () => [1080, 1920],
  desc:
    'RUSH（確変）モード。突入すると画面の左右に「RUSH中」の帯が出て、その内側に虹色の筆のかすれ線と光のシャワーが流れる。' +
    'RUSH 中のギフトで時間が延び、合計コインが数え上がり、終わると結果を出す。' +
    '突入のきっかけ: gifts のギフト / enterCoins 以上のギフト / ルーレットの rush: true の項目 / ダッシュボードのボタン。' +
    '配信画面いっぱいに重ねる。URL は /widgets/rush.html',
  fields: {
    enabled: bool(true, 'RUSH を使う'),
    gifts: list([], 'このギフト名で突入'),
    enterCoins: num(20000, 'この合計コイン以上のギフトで突入（0 で無効）', { min: 0 }),
    duration: num(60, 'RUSH の長さ（秒）', { min: 5, max: 600 }),
    extendMinCoins: num(100, 'RUSH 中、この合計コイン以上のギフトで時間が延びる', { min: 1 }),
    extendSeconds: num(5, '1回で延びる秒数（0 で延びない）', { min: 0, max: 120 }),
    maxSeconds: num(300, '延びても最長この秒数まで', { min: 5, max: 3600 }),
    text: str('RUSH中', '左右の帯に流れる文字'),
    enterText: str('RUSH突入', '突入のときの文字'),
    sound: bool(true, '効果音'),
    volume: num(0.5, '効果音の音量（0〜1）', { min: 0, max: 1 }),
  },
};

SCHEMA.rankings = {
  kind: 'map',
  page: 'ranking',
  title: 'ランキング',
  desc: 'この配信のトップギフター・いいねランキング。URL は /widgets/ranking.html?id=<名前>',
  size: (e) => [420, 96 + e.limit * 64],
  fields: {
    title: str('トップギフター', 'タイトル'),
    metric: oneOf(['coins', 'gifts', 'likes'], 'coins', 'coins コイン / gifts ギフトの個数 / likes いいね'),
    limit: num(5, '表示する人数', { min: 1, max: 10 }),
    avatars: bool(true, 'アイコンを出す'),
    color: color('accent', '帯と1位の色'),
    hideEmpty: bool(false, 'まだ誰もいないときは隠す'),
  },
};

SCHEMA.minecraft = {
  kind: 'object',
  title: 'Minecraft 連携',
  desc:
    'Minecraft サーバーの RCON にコマンドを送る。SuperStream などのプラグインのコマンドもそのまま書ける。' +
    'server.properties で enable-rcon=true / rcon.port / rcon.password を設定しておく。' +
    'コマンドの中の {user} {userId} {gift} {giftId} {count} {coins} {item} {roulette} は置き換わる（{user} などは記号を取り除いた安全な文字になる）',
  fields: {
    enabled: bool(false, 'コマンドを送る'),
    host: str('127.0.0.1', 'Minecraft サーバーのアドレス'),
    port: num(25575, 'RCON のポート', { min: 1, max: 65535 }),
    password: str('', 'RCON のパスワード（rcon.password）', { secret: true }),
    superstreamProfile: str('default_profile', 'SuperStream のプロフィール名（plugins/SuperStream/profiles の .yml を除いた名前）'),
    forwardGifts: bool(
      false,
      '届いたギフトを SuperStream に渡して、そのギフトの演出を実行する（ss test profile）。' +
        'SuperStream 側でプロフィールを start していないとき用（両方動かすと演出が二重になる）',
    ),
    superstreamFile: str('', 'SuperStream のプロフィールのファイルの場所。書くと、設定済みのギフト ID と演出をダッシュボードや AI で確認できる'),
    rules: {
      type: 'mcRules',
      default: [],
      desc:
        'イベントごとに送るコマンド。条件: gifts（ギフト名）/ minCoins / events（gift, follow, share, like）/ users。' +
        '送るもの: commands（コマンドの一覧。先頭の / は不要）/ superstreamGift（SuperStream のそのギフト ID の演出）/ ' +
        'superstreamAction（SuperStream の演出1つ。例 "lightning" や "spawn type=ZOMBIE amount=3"）。' +
        'perCount: true で ×5 なら5回（最大50回）。合ったルールは全部実行される',
    },
  },
};

export const SECTIONS = Object.keys(SCHEMA);

/** 各セクションの初期値（map のセクションは1件分） */
export function defaultsFor(section) {
  const out = {};
  for (const [key, f] of Object.entries(SCHEMA[section].fields)) out[key] = structuredClone(f.default);
  return out;
}
