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

// 縦の配信画面で置き場所を決める項目。YAML に書かなくても初期値で使える。
const placementFields = (x = 12, y = 12) => ({
  posX: num(x, '配信画面の左端（幅に対する %）', { min: 0, max: 100 }),
  posY: num(y, '配信画面の上端（高さに対する %）', { min: 0, max: 100 }),
  posScale: num(1, '配信画面での大きさの倍率', { min: 0.2, max: 3 }),
  inAll: bool(true, '「全部まとめて」に出す'),
});

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
      ...placementFields(4, 62),
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

  chats: {
    kind: 'map',
    page: 'chat',
    title: 'コメント欄',
    desc:
      '配信のコメントを流して見せる。テロップ風（下から積み上がる一覧）か吹き出し風。' +
      'この配信でギフトを送った人のコメントは金の縁と送ったコインの合計で目立たせ、多く送った人ほど目立つ（3段階）。' +
      'NG ワード・隠すユーザー・「!」で始まるコマンドは出さない。読み上げ（パソコンの日本語の声）もできる。' +
      'URL は /widgets/chat.html?id=<名前>',
    size: () => [460, 640],
    fields: {
      ...placementFields(70, 10),
      style: oneOf(['telop', 'bubble'], 'telop', 'telop テロップ風（下から積み上がる一覧）/ bubble 吹き出し風'),
      maxItems: num(8, '一度に出しておく最大件数。超えたら古いものから消える', { min: 1, max: 30 }),
      lifetime: num(60, 'この秒数がたったコメントは消す（0 で消さない）', { min: 0, max: 3600 }),
      avatars: bool(true, 'アイコンを出す'),
      fontSize: num(22, 'コメントの文字の大きさ（px）', { min: 12, max: 60 }),
      color: color('accent', 'いちばん新しいコメントの帯の色'),
      highlight: bool(true, 'この配信でギフトを送った人のコメントを目立たせる'),
      showCoins: bool(true, '送ったコインの合計を名前の横に出す'),
      gifterCoins: num(1, '合計がこのコイン以上の人を目立たせる（1段目: 金の帯・細い縁）', { min: 1 }),
      bigGifterCoins: num(1000, '2段目（太い金の縁）になる合計コイン', { min: 1 }),
      topGifterCoins: num(10000, '3段目（金の面）になる合計コイン', { min: 1 }),
      hideWords: list([], 'この言葉を含むコメントは出さない（NG ワード。大文字小文字は区別しない）'),
      hideUsers: list([], 'このユーザー（ID か名前）のコメントは出さない'),
      hideCommands: bool(true, '「!」で始まるコメント（ボットへのコマンド）を出さない'),
      tts: bool(false, 'コメントを読み上げる（パソコンに入っている日本語の声）'),
      ttsRate: num(1.1, '読み上げの速さ（1 がふつう）', { min: 0.5, max: 2 }),
      ttsVolume: num(1, '読み上げの音量（0〜1）', { min: 0, max: 1 }),
      ttsName: bool(true, '名前も読む（「さくらさん、こんばんは」）'),
      ttsGiftersOnly: bool(false, 'ギフトを送った人（1段目以上）のコメントだけ読む'),
    },
  },

  jars: {
    kind: 'map',
    page: 'gift-jar',
    title: 'ギフト瓶',
    desc: '届いたギフトが入れ物に落ちてたまる。URL は /widgets/gift-jar.html?id=<名前>',
    size: (e) => ({ jar: [500, 700], heart: [600, 600], potion: [520, 700] })[e.shape] ?? [500, 700],
    fields: {
      ...placementFields(10, 22),
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
      ...placementFields(40, 18),
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
      ...placementFields(4, 84),
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

  timers: {
    kind: 'map',
    page: 'timer',
    title: '延長タイマー',
    desc:
      '配信の残り時間（サブアソン）。ギフト・フォロー・シェア・いいねで時間が延びる。長時間配信・妨害マイクラの耐久配信向け。' +
      'スタート・一時停止・時間の足し引き・リセットは、ダッシュボード・モニター・URL（Stream Deck など。例 /api/timer/<名前>/pause・/api/timer/<名前>/add?seconds=60）でできる。' +
      '状態はサーバーの data/timers.json に残るので、OBS やサーバーを再起動しても続きから。URL は /widgets/timer.html?id=<名前>',
    size: () => [720, 280],
    fields: {
      ...placementFields(4, 55),
      title: str('残り', '時計の左に出す見出し'),
      startMinutes: num(60, '初めの時間（分）', { min: 0 }),
      maxHours: num(0, '延びても合計（初めの時間 + 延びた時間）はこの時間まで（時間。0 で上限なし。ボタンでの足し引きは数えない）', { min: 0 }),
      coinSeconds: num(10, 'ギフト 1 コインで延びる秒数（0 で金額では延ばさない）', { min: 0, max: 3600 }),
      minCoins: num(1, 'この合計コイン未満のギフトでは延ばさない（rules のギフトは別）', { min: 0 }),
      rules: {
        type: 'timerRules',
        default: [],
        desc:
          '指定のギフトで延ばす秒数・分数。上から順に最初に合ったものを使い、合ったときは coinSeconds の計算はしない。' +
          '条件: gifts（ギフト名の一覧）/ minCoins（この合計コイン以上）/ users。' +
          '延ばす量: seconds か minutes（マイナスで減らす）。連打の個数分かかる（perCount: false で1回だけ）。text は延びたときに出すひと言',
      },
      followSeconds: num(0, 'フォロー1人で延びる秒数（0 で延びない）', { min: 0, max: 3600 }),
      shareSeconds: num(0, 'シェア1回で延びる秒数（0 で延びない）', { min: 0, max: 3600 }),
      likeEvery: num(0, 'いいねがこの回数たまるごとに延ばす（0 でいいねでは延びない）', { min: 0 }),
      likeSeconds: num(10, 'いいね likeEvery 回で延びる秒数', { min: 0, max: 3600 }),
      pausedExtend: bool(true, '一時停止中もギフトなどで延びる（false なら走っている間だけ）'),
      hint: str('', '時計の下に出す案内文（空なら条件から「1コイン +10秒」のように自動で作る）'),
      showHint: bool(true, '時計の下の案内文と、延びた合計を出す'),
      avatars: bool(true, '延ばした人のアイコンを出す'),
      warnMinutes: num(10, '残りがこの分数を切ったら時計を朱にする', { min: 0 }),
      dangerMinutes: num(1, '残りがこの分数を切ったら板が赤く脈打つ（残り 10 秒はカウントの音と点滅）', { min: 0 }),
      endText: str('終了', '0 になったときに叩きつける文字'),
      color: color('accent', '見出しの色'),
      sound: bool(true, '効果音'),
      volume: num(0.4, '効果音の音量（0〜1）', { min: 0, max: 1 }),
    },
  },


  bosses: {
    kind: 'map',
    page: 'boss',
    title: 'ボス討伐',
    desc:
      'ギフトのコイン（といいね）がダメージになり、視聴者みんなでボスの HP を削る。HP が 0 になったら討伐。' +
      'ダメージで HP バーが削れて白い残像が追いかけ、数字が飛び、ボスが揺れる。大ダメージは画面ごと揺れる。' +
      '討伐で「討伐!」のハンコと金の演出、とどめを刺した人のアイコン。少し待つと HP を hpScale 倍にした次のボスが出てくる。' +
      '討伐でルーレットを回したり（roulette）、Minecraft にコマンドを送ったり（commands）できる。' +
      'HP はサーバーの data/boss.json に残るので、OBS を読み込み直しても続きから。URL は /widgets/boss.html?id=<名前>',
    size: () => [720, 260],
    fields: {
      ...placementFields(5, 39),
      name: str('魔王', 'ボスの名前（1体目）'),
      mode: oneOf(['hp', 'rank-gap'], 'hp', 'hp は固定HP。rank-gap は一つ上の人とのコイン差をHPにする（自分のコインが増えると減り、相手のコインが増えると増える）'),
      rankSource: oneOf(['manual', 'live'], 'manual', 'rank-gap の相手コインの出どころ。live は配信の順位。取れなければ manual の目標コインを使う'),
      rivalCoins: num(0, 'rank-gap の相手コイン（手入力の目標。API でも変えられる）。自分のコインとの差がHP', { min: 0 }),
      hp: num(10000, '1体目の最大 HP', { min: 1 }),
      hpScale: num(1.5, '倒すたびに次のボスの HP を何倍にするか（1 で同じ）', { min: 1, max: 10 }),
      image: str('', 'ボスの画像（media/ のファイルか URL）。空なら図形の鬼を描く'),
      damageFrom: list(['coins'], 'ダメージにするもの（coins ギフトのコイン / likes いいね）', ['coins', 'likes']),
      coinDamage: num(1, '1 コインあたりのダメージ', { min: 0 }),
      likeDamage: num(1, 'いいね 1 回あたりのダメージ', { min: 0 }),
      gifts: list([], 'このギフト名（または ID）だけダメージにする。空なら全部'),
      bigHit: num(1000, 'このダメージ以上は「大ダメージ」（画面ごと揺れる）。その 10 倍で「特大」', { min: 1 }),
      lowHp: num(20, '残り HP がこの % 以下になると HP が赤く点滅する（0 で点滅しない）', { min: 0, max: 100 }),
      nextNames: list([], '2体目からの名前（順に使う。足りなければ最後の名前。空なら同じ名前）'),
      autoNext: bool(true, '倒したら次のボスを出す（false なら倒れたまま。「HP を戻す」か「次のボス」で再開）'),
      nextDelay: num(6, '討伐から次のボスが出るまでの秒数', { min: 2, max: 120 }),
      defeatText: str('討伐!', '討伐のときに叩きつける文字'),
      roulette: str('', '討伐で回すルーレットの名前（roulettes の名前。空なら回さない）'),
      commands: {
        type: 'commands',
        default: [],
        desc:
          '討伐で Minecraft に送るコマンドの一覧（先頭の / は不要。minecraft の設定が必要）。' +
          '{user} はとどめを刺した人、{boss} はボスの名前、{round} は何体目に置き換わる',
      },
      superstreamGift: str('', '討伐で起こすマイクラの演出（そのギフト ID に設定した演出。minecraft の設定が必要）'),
      superstreamAction: str('', '討伐で起こすマイクラの演出を1つ（例 lightning）'),
      power: num(1, '演出の強さ（揺れ・ダメージの数字の大きさの倍率）', { min: 0.3, max: 3 }),
      color: color('accent', 'HP の色'),
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
      ...placementFields(5, 55),
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
    size: (e) => (e.style === 'strip' ? [820, 330] : [600, 680]).map((v) => Math.round(v * (Number(e.scale) || 1))),
    fields: {
      ...placementFields(40, 43),
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
      scale: num(1, 'ルーレット全体の大きさの倍率（1 がふつう）', { min: 0.5, max: 2 }),
      rushOdds: bool(false, 'RUSH中は確率を変える'),
      items: {
        type: 'items',
        default: ['ハズレ', '歌う*2', '一発ギャグ', 'ハズレ', '変顔*2', '質問に答える*2'],
        desc:
          '項目の一覧。「歌う*2」のような文字か、{ label, weight, rushWeight, color, textColor, image, commands } で書く。' +
          'weight は当たりやすさ（丸型では扇の大きさも比例）。' +
          'rushWeight は RUSH 中の当たりやすさ（0 以上の数。書かなければ weight と同じ。rushOdds が true のときだけ使う）。' +
          'image は画像の URL か media/ フォルダのファイル名。' +
          'image がなければ文字だけを中央に出す。commands はその項目が当たったときに Minecraft に送るコマンドの一覧、' +
          'superstreamGift / superstreamAction は当たったときに起こすマイクラの演出（minecraft の設定が必要）。rush: true は当たったら RUSH 突入。' +
          'actions は当たったときに実行する動作の一覧。type は timer.add（seconds。マイナスで減らす）/ wins.add（n）/ rush.start / media.play（mediaId）/ boss.damage（amount）/ boss.heal（amount）/ gacha.start。id を書くとそのタイマー・WIN数・ボスだけ',
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
    textWeight: oneOf(['normal', 'bold'], 'normal', '文字だけの太さ。normal 普通 / bold 太字'),
    yieldToImage: bool(false, '画像付きカットインが出るギフトのときは、こちらを出さない（両方を OBS に入れて重ならないように）'),
  },
};

SCHEMA.imageCutins = {
  kind: 'map',
  page: 'image-cutin',
  title: '画像付きカットイン',
  desc:
    '写真を使うカットイン。imageStyle を選ぶと縦長のフレームになり、中央の帯に写真、上下に斜めの縞が入る' +
    '（縞・標準 / 縞・反転 / 縞・枠太）。空なら今までの帯のまま。' +
    'inside は斜めの帯の中いっぱいに写真が入り、上下の縁が木炭でかすれた線になる。' +
    'side は色の帯の横に写真が大きく乗る（背景を切り抜いた PNG がおすすめ）。' +
    '切り抜きは位置と拡大だけを保存し、元の画像は変えない。段階・文字・動きは通常カットインと同じ。' +
    'URL は /widgets/image-cutin.html?id=<名前>',
  size: () => [1080, 1920],
  fields: {
    photo: str('', '写真（media/ のファイルか URL）。inside で空のときは段階の色で埋める'),
    imageStyle: {
      type: 'cutinStyle',
      default: '',
      desc: '縦長フレームの画像スタイル。stripe 縞・標準 / invert 縞・反転 / thick 縞・枠太。空なら今までの帯（layout）',
    },
    crop: {
      type: 'crop',
      default: { x: 0.5, y: 0.5, scale: 1 },
      desc: '写真の切り抜き。x と y は 0〜1 の位置、scale は 1〜4 の拡大。元の画像ファイルは変えない',
    },
    layout: oneOf(['inside', 'side'], 'inside', 'imageStyle が空のとき。inside 帯の中いっぱい（縁が木炭のかすれ線）/ side 色の帯の横に大きく乗る'),
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

SCHEMA.mediaAlerts = {
  kind: 'object',
  page: 'media',
  title: 'メディア通知',
  size: () => [640, 360],
  desc:
    'ギフト・フォロー・ルーレットの動作で、動画・音声・画像を順番に再生する。' +
    'ファイルは配信者のデータの alert-media に置く。URL は /widgets/media.html',
  fields: {
    enabled: bool(true, 'メディア通知を使う'),
    rules: {
      type: 'mediaRules',
      default: [],
      desc:
        '再生のきっかけ。上から順に、合ったものを全部再生待ちに入れる。' +
        '条件: gifts（ギフトIDか名前）/ minCoins（この合計コイン以上）/ events（follow）。' +
        'mediaId はアップロードしたメディアのID。条件が無いルールは再生しない',
    },
  },
};

SCHEMA.giftSounds = {
  kind: 'object',
  page: 'sounds',
  title: 'ギフト別サウンド',
  size: () => [1080, 1920],
  desc:
    'ギフト・フォロー・シェアで効果音を重ねて鳴らす。音源はメディア通知に入れた音声を使う。' +
    '上から順に見て、最初に合ったルールだけ鳴らす。同時に鳴らせる数と、鳴らし終わるまでの待ちには上限がある。' +
    'URL は /widgets/sounds.html',
  fields: {
    enabled: bool(true, 'ギフト別サウンドを使う'),
    masterVolume: num(80, '全体の音量（0〜100）。ルールの音量と掛けて鳴らす', { min: 0, max: 100 }),
    maxSeconds: num(8, '1回の再生を止める秒数', { min: 1, max: 30 }),
    maxConcurrent: num(3, '同時に鳴らす数', { min: 1, max: 5 }),
    rules: {
      type: 'soundRules',
      default: [],
      desc:
        '鳴らすルール。上から順に、最初に合った1つだけ鳴らす。' +
        '条件: gifts（ギフトIDか名前）/ minCoins（この合計コイン以上）/ events（follow, share）。' +
        'mediaId は音声のID。volume は 0〜100（全体の音量と掛ける）。条件が無いルールは鳴らさない',
    },
  },
};

SCHEMA.gacha = {
  kind: 'object',
  page: 'gacha',
  title: 'ガチャ',
  size: () => [640, 360],
  desc:
    '高額ギフトなどで回すガチャ。待機 → 回転 → 結果 → 終了 の順に進み、各段階の長さ（ミリ秒）を画面へ渡す。' +
    'きっかけ: gifts のギフト / minCoins 以上のギフト / ルーレットなどの gacha.start。' +
    'pity が 1 以上のとき、pity 対象のレアリティがそれ回出なければ次は確定。URL は /widgets/gacha.html',
  fields: {
    enabled: bool(true, 'ガチャを使う'),
    minCoins: num(0, 'この合計コイン以上のギフトで回す（0 で金額では回さない）', { min: 0 }),
    gifts: list([], 'このギフトID（または名前）で回す'),
    rollMs: num(3000, '回転しているミリ秒', { min: 0, max: 60000 }),
    revealMs: num(2500, '結果を出しているミリ秒', { min: 0, max: 60000 }),
    doneMs: num(1200, '終了表示のミリ秒', { min: 0, max: 60000 }),
    pity: num(0, 'この回数、当たり（pity: true のレアリティ）が出なかったら次は確定（0 で無効）', { min: 0, max: 999 }),
    tiers: {
      type: 'gachaTiers',
      default: [
        { id: 'common', label: 'ふつう', weight: 70, pity: false },
        { id: 'rare', label: 'レア', weight: 25, pity: false },
        { id: 'legend', label: '激アツ', weight: 5, pity: true },
      ],
      desc: 'レアリティ。id / label / weight（当たりやすさ）/ pity（true なら天井の対象。1つだけ）',
    },
  },
};

SCHEMA.slots = {
  kind: 'object',
  page: 'slot',
  title: 'スロット',
  size: () => [720, 520],
  desc:
    'ギフトで回る3リールのスロット。結果はサーバーで先に決まり、画面はリーチ・ニアミス・復活を含む開示演出だけを行う。' +
    '景品は演出・特典のみで、賭博・現金の表現は使わない。URL は /widgets/slot.html',
  fields: {
    enabled: bool(true, 'スロットを使う'),
    trigger: {
      type: 'slotTrigger',
      default: { gifts: ['5655'], minCoins: 0 },
      desc: '回すきっかけ。gifts のギフト、または minCoins 以上のギフト',
    },
    symbols: {
      type: 'items',
      default: [
        { label: 'さくらんぼ', weight: 40 },
        { label: 'ベル', weight: 30 },
        { label: 'スター', weight: 20 },
        { label: '7', weight: 10 },
      ],
      desc: '絵柄と出現の重み。payouts の symbols にはここで書いた絵柄名を使う',
    },
    payouts: {
      type: 'slotPayouts',
      default: [
        { id: 'lose', text: 'はずれ', tier: 'lose', weight: 70, symbols: [] },
        { id: 'small', text: '小当たり', tier: 'small', weight: 20, symbols: ['さくらんぼ', 'さくらんぼ', 'ベル'] },
        { id: 'big', text: '大当たり', tier: 'big', weight: 9, symbols: ['ベル', 'ベル', 'ベル'] },
        { id: 'jackpot', text: 'ジャックポット', tier: 'jackpot', weight: 1, symbols: ['7', '7', '7'] },
      ],
      desc: '役ごとの重み、表示文、当たり絵柄、当選時の actions',
    },
    revivalRate: num(20, '当たりのうち復活演出で見せる割合（0〜100）', { min: 0, max: 100 }),
    nearMissRate: num(30, '外れのうちニアミス演出にする割合（0〜100）', { min: 0, max: 100 }),
    reelStopMs: num(700, 'リール1本が止まる間隔（ミリ秒）', { min: 100, max: 10000 }),
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
// ランキングは右側の空いた場所に置く。
SCHEMA.rankings.fields = { ...placementFields(60, 48), ...SCHEMA.rankings.fields };

SCHEMA.minecraft = {
  kind: 'object',
  title: 'マイクラ連携',
  desc:
    'Minecraft サーバーの RCON にコマンドを送る。マイクラ側の演出プラグインのコマンドもそのまま書ける。' +
    'server.properties で enable-rcon=true / rcon.port / rcon.password を設定しておく。' +
    'コマンドの中の {user} {userId} {gift} {giftId} {count} {coins} {item} {roulette} は置き換わる（{user} などは記号を取り除いた安全な文字になる）',
  fields: {
    enabled: bool(false, 'コマンドを送る'),
    host: str('127.0.0.1', 'Minecraft サーバーのアドレス'),
    port: num(25575, 'RCON のポート', { min: 1, max: 65535 }),
    password: str('', 'RCON のパスワード（rcon.password）', { secret: true }),
    superstreamProfile: str('default_profile', 'マイクラ側の演出プロフィール名（profiles の .yml を除いた名前）'),
    forwardGifts: bool(
      false,
      '届いたギフトをマイクラ側の演出に渡して、そのギフトの演出を実行する（ss test profile）。' +
        'マイクラ側でプロフィールを start していないとき用（両方動かすと演出が二重になる）',
    ),
    superstreamFile: str('', 'マイクラ側の演出プロフィールのファイルの場所。書くと、設定済みのギフト ID と演出をダッシュボードや AI で確認できる'),
    rules: {
      type: 'mcRules',
      default: [],
      desc:
        'イベントごとに送るコマンド。条件: gifts（ギフト名）/ minCoins / events（gift, follow, share, like）/ users。' +
        '送るもの: commands（コマンドの一覧。先頭の / は不要）/ superstreamGift（マイクラ側のそのギフト ID の演出）/ ' +
        'superstreamAction（マイクラの演出1つ。例 "lightning" や "spawn type=ZOMBIE amount=3"）。' +
        'perCount: true で ×5 なら5回（最大50回）。合ったルールは全部実行される',
    },
  },
};

SCHEMA.votes = {
  kind: 'map',
  page: 'vote',
  title: 'コメント投票',
  desc:
    'コメントの「1」「2」など、選択肢の番号を1人1票で集計する。始める・締める・結果を出すはダッシュボード、Stream Deck、MCP、CLIから操作できる。' +
    'URL は /widgets/vote.html?id=<名前>',
  size: () => [720, 360],
  fields: {
    ...placementFields(8, 55),
    title: str('どれにする?', '投票の見出し'),
    options: list(['A', 'B', 'C'], '番号で選ぶ選択肢（2〜9個）'),
    durationSeconds: num(60, '投票を受け付ける秒数（0 で時間では締めない）', { min: 0, max: 3600 }),
    autoReveal: bool(true, '時間で締め切ったら続けて結果を出す'),
    resultActions: { type: 'actions', default: [], desc: '結果が出たときに1回だけ動かす動作の一覧' },
    showNames: bool(true, '直近に投票した人の名前を表示する'),
    sound: bool(true, '結果発表の効果音'),
    volume: num(0.3, '効果音の音量（0〜1）', { min: 0, max: 1 }),
    color: color('accent', '投票バーの色'),
  },
};

// コメントといいねで押す、時間制の参加型ボタン。
SCHEMA.pushButtons = {
  kind: 'map', page: 'push-button', title: '押しボタン',
  desc: 'コメント「押」か、いいねの連打で参加する PUSH ボタン。', size: () => [640, 360],
  fields: {
    ...placementFields(8, 55), label: str('押せ!', '画面に出す文字'), seconds: num(5, '受付時間（1〜60秒）', { min: 1, max: 60 }),
    keyword: str('押', '押しとして数えるコメント'), likesPerPush: num(5, '何いいねで1押しか（0で数えない）', { min: 0, max: 1000 }),
    steps: list([3, 10, 30, 100], '青・緑・赤・金になる押し数（4個、昇順）'),
    blueActions: { type: 'actions', default: [], desc: '青の動作' }, greenActions: { type: 'actions', default: [], desc: '緑の動作' },
    redActions: { type: 'actions', default: [], desc: '赤の動作' }, goldActions: { type: 'actions', default: [], desc: '金の動作' },
    missText: str('不発', '届かなかったときの文字'), sound: bool(true, '効果音'), volume: num(0.3, '効果音の音量（0〜1）', { min: 0, max: 1 }), color: color('accent', 'ボタンの色'),
  },
};

// 画面で見せる「種類の名前」。ウィジェット自身の見出し（title / name）とは別に持つ。
for (const section of Object.keys(SCHEMA)) {
  if (SCHEMA[section].kind === 'map' && !SCHEMA[section].fields.kindName) {
    SCHEMA[section].fields = { kindName: str('', '種類の名前'), ...SCHEMA[section].fields };
  }
}

export const SECTIONS = Object.keys(SCHEMA);

/** 各セクションの初期値（map のセクションは1件分） */
export function defaultsFor(section) {
  const out = {};
  for (const [key, f] of Object.entries(SCHEMA[section].fields)) out[key] = structuredClone(f.default);
  return out;
}
