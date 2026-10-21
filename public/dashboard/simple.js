import { giftLabel } from '/widgets/lib/overlay.js';
import { ROULETTE_DESCRIPTION } from './dashboard-descriptions.js';

// 「かんたん」モードの中身。
// iPhone の設定のように、まとまりごとの一覧 → 押すと中に入る、という形にする:
//   ホーム（画面に出しているものの一覧）→ ウィジェット1つの設定（まとまりごとの行）
// 細かい項目・YAML は「くわしく」モード（今までのフォーム）で触る。
// 新しいウィジェットや項目を足したら、ここに「かんたん」で出すもの（説明・まとまり・呼び名・型）も足す。

// 「出すものを足す」に並べる順（目的ごと）
export const GROUPS = [
  ['お礼・にぎやかし', ['alerts', 'chats', 'counters', 'goals', 'rankings', 'cheers', 'tickers', 'supporters', 'visitors']],
  ['企画・ゲーム', ['roulettes', 'votes', 'pushButtons', 'jars', 'wins', 'timers', 'bosses', 'peka', 'throne', 'ootori', 'dareba']],
  ['豪華な演出', ['obs', 'cutins', 'imageCutins', 'rush', 'stepup', 'swarm', 'combo', 'mediaAlerts', 'giftSounds', 'gacha', 'omikuji', 'slots', 'relayStop']],
];

// 初めて開いた人が選ぶ遊び方。使うものと、足りないときに作る設定をまとめる。
export const PLAY_MODES = [
  { id: 'talk', name: 'おしゃべり・歌', desc: 'コメントとギフトで、楽しく配信する', sections: ['alerts', 'chats', 'goals'] },
  { id: 'roulette', name: 'ルーレット企画', desc: 'ギフトで回る企画を始める', sections: ['alerts', 'roulettes', 'chats'], setup: { roulettes: 'punishment' } },
  { id: 'endurance', name: '耐久・カウントダウン', desc: 'ギフトで残り時間を延ばす', sections: ['timers', 'alerts', 'rankings'] },
  { id: 'clear', name: 'ゲームのクリア数を数える', desc: 'クリアした回数をみんなと数える', sections: ['wins', 'alerts', 'timers'] },
  { id: 'boss', name: 'ボスをみんなで倒す', desc: 'みんなのギフトでボスに挑む', sections: ['bosses', 'alerts', 'rankings'] },
  { id: 'custom', name: '自分で選ぶ', desc: '出すものを自分で足す', sections: [] },
];

// アイコンとひとこと（URL や設定の名前は書かない）
export const INFO = {
  obs: { icon: 'video', desc: '虹や大当たりのとき、OBSのカメラを揺らす・拡大する' },
  alerts: { icon: 'gift', desc: 'ギフトやフォローが来たら、名前つきのテロップを出す' },
  chats: { icon: 'message-circle', desc: 'コメントを画面に流す。読み上げもできる' },
  counters: { icon: 'heart', desc: 'いいねや視聴者の数を出す' },
  goals: { icon: 'target', desc: '「フォロー 100 人」のような目標までのバー' },
  rankings: { icon: 'trophy', desc: 'たくさんギフトをくれた人の順位' },
  roulettes: { icon: 'dices', desc: ROULETTE_DESCRIPTION },
  votes: { icon: 'list-ordered', desc: 'コメントの「1」「2」などで、みんなの投票を集計する' },
  cheers: { icon: 'heart', desc: 'いいねをみんなでためて、満タンで演出する' },
  pushButtons: { icon: 'mouse-pointer-2', desc: '「押」とコメントするか、いいねを連打して参加する' },
  tickers: { icon: 'newspaper', desc: 'お知らせ・目標・ギフトを下の帯に流す' },
  supporters: { icon: 'users', desc: '最近フォローやギフトをくれた人を表示する' },
  visitors: { icon: 'door-open', desc: '初見さんや何度も来ている人を迎える' },
  jars: { icon: 'flask-conical', desc: '届いたギフトが瓶に落ちて、たまっていく' },
  wins: { icon: 'flag', desc: 'クリアした回数。ギフトで増えたり減ったりする' },
  timers: { icon: 'timer', desc: 'ギフトで延びる残り時間（耐久配信）' },
  bosses: { icon: 'skull', desc: 'みんなのギフトでボスの HP を削って倒す。上の人とのコイン差にもできる' },
  mediaAlerts: { icon: 'clapperboard', desc: 'ギフトやフォローで、動画・音声・画像を出す' },
  giftSounds: { icon: 'volume-2', desc: 'ギフトごとに効果音を重ねて鳴らす' },
  gacha: { icon: 'sparkles', desc: 'ギフトでガチャを回して、結果を出す' },
  omikuji: { icon: 'scroll', desc: 'ギフトでおみくじを引いて、大吉や凶を出す' },
  slots: { icon: 'disc-3', desc: 'ギフトで3つの絵柄をそろえるスロット演出' },
  relayStop: { icon: 'users', desc: 'ギフトを送った人がスロットを1本ずつ止める演出' },
  peka: { icon: 'lightbulb', desc: 'ギフトのあと、隅のランプだけを遅れて光らせる' },
  throne: { icon: 'crown', desc: '直近10分の首位を王座にして、接近したときだけ VS を出す' },
  ootori: { icon: 'crown', desc: 'ラスト10分の最後にギフトを送った人を大トリにする' },
  dareba: { icon: 'sparkles', desc: 'ギフトの勢いが落ちたときに小さな事件を起こす' },
  cutins: { icon: 'zap', desc: '大きいギフトで「激アツ」の帯がドンと入る' },
  imageCutins: { icon: 'image', desc: '自分の写真が入るカットイン' },
  rush: { icon: 'flame', desc: '大きいギフトで RUSH に突入。画面の両側が光り続ける' },
  stepup: { icon: 'trending-up', desc: 'みんなのギフトの合計で STEP 1 から STEP 5 まで一段ずつ上がる' },
  swarm: { icon: 'groups', desc: '短い時間にギフトが集まると、ギフトの大群が画面を横切る' },
  combo: { icon: 'layers', desc: '続けてギフトすると ×2 ×3 と数字が出て、色が上がっていく' },
  minecraft: { icon: 'box', desc: 'マイクラの枠の時間が分かります。枠の間は自動で TikTok につながります' },
  theme: { icon: 'palette', desc: '全部のウィジェットの色と大きさ' },
};

// 配信の大きさで、演出が出るコインの境目をまとめて決める
const CUTIN_SCALE = {
  title: '配信の大きさ',
  options: [
    { label: '小さめ（10 コインから）', value: { minCoins: 10, greenCoins: 30, redCoins: 100, goldCoins: 500, rainbowCoins: 2000 } },
    { label: 'ふつう（100 コインから）', value: { minCoins: 100, greenCoins: 300, redCoins: 1000, goldCoins: 5000, rainbowCoins: 20000 } },
    { label: '大きい（500 コインから）', value: { minCoins: 500, greenCoins: 2000, redCoins: 10000, goldCoins: 30000, rainbowCoins: 100000 } },
  ],
};

/**
 * ウィジェットごとの設定のまとまり。
 * groups: [{ title, presets?（押すとまとめて値が入る型）, fields（出す項目） }]、note: 項目の代わりに出す案内
 */
export const SIMPLE = {
  obs: {
    groups: [
      { title: '使う', fields: ['enabled', 'port'] },
      { title: 'どのカメラを', fields: ['scene', 'source'] },
      { title: 'どんなとき・どう動かす', fields: ['rules', 'cooldownSeconds', 'reduce'] },
    ],
    help: 'OBSのツール → WebSocketサーバー設定で有効にし、ブラウザソースにこのURLを入れ、末尾に #pw= とOBSのパスワードを自分で足します（サーバーには送られません）。',
    size: () => [320, 120],
  },
  visitors: {
    groups: [
      { title: '迎える人', fields: ['showFirst', 'showReturning', 'showRegular', 'regularVisits'] },
      { title: '迎える文', fields: ['firstText', 'returningText', 'regularText'] },
      { title: '見た目', fields: ['duration', 'avatars'] },
      { title: '記録', fields: ['keepDays'] },
    ],
  },
  tickers: {
    groups: [
      { title: '流すもの', fields: ['label', 'messages', 'showGifts', 'giftCount'] },
      { title: '目標', fields: ['showGoals', 'goals'] },
      { title: '見た目', fields: ['speed', 'color'] },
    ],
  },
  supporters: {
    groups: [
      { title: '出すもの', fields: ['events', 'limit', 'minCoins'] },
      { title: '見た目', fields: ['avatars', 'lifetime', 'color'] },
    ],
  },
  alerts: {
    groups: [
      { title: 'いつ出す', fields: ['events', 'gifts', 'minCoins'] },
      {
        title: '見た目',
        presets: [
          {
            title: '出しかた',
            options: [
              { label: 'ひかえめ', value: { duration: 3, sound: false } },
              { label: 'ふつう', value: { duration: 4.5, sound: true, volume: 0.3 } },
              { label: 'しっかり', value: { duration: 7, sound: true, volume: 0.5 } },
            ],
          },
        ],
        fields: ['position', 'align'],
      },
      { title: '大きいギフト・特別なギフト', fields: ['bigCoins', 'rules'] },
    ],
  },
  chats: {
    groups: [
      { title: '見た目', fields: ['style', 'fontSize', 'maxItems'] },
      { title: 'ギフトした人', fields: ['highlight'] },
      { title: '読み上げ・出さない言葉', fields: ['tts', 'hideWords'] },
    ],
  },
  counters: {
    groups: [
      { title: '出す数', fields: ['show'] },
      { title: '見た目', fields: ['layout', 'color'] },
    ],
  },
  goals: {
    groups: [
      { title: '目標', fields: ['title', 'metric', 'goal', 'step'] },
      { title: '見た目', fields: ['color'] },
    ],
  },
  rankings: {
    groups: [{ title: '中身', fields: ['title', 'metric', 'limit'] }],
  },
  throne: {
    groups: [
      { title: 'いつ出す', fields: ['enabled', 'approachPercent', 'maxMoves'] },
      { title: '見た目', fields: ['showDifference'] },
    ],
  },
  ootori: {
    groups: [
      { title: 'いつ出す', fields: ['enabled', 'mode', 'durationMs'] },
      { title: '演出', fields: ['seatChangedMs', 'rollMaxMs', 'staticAfterMs', 'hideWords'] },
    ],
  },
  dareba: {
    groups: [
      { title: '使う', fields: ['enabled', 'type'] },
    ],
  },
  roulettes: {
    groups: [
      { title: 'いつ回す', fields: ['gifts'] },
      {
        title: '項目',
        presets: [
          {
            title: '型から選ぶ（今の項目と入れ替わります）',
            confirm: '今の項目を、この型の項目に入れ替えますか？',
            options: [
              { label: '罰ゲーム', value: { items: ['歌う*2', '変顔*2', '一発ギャグ', 'モノマネ', 'セーフ*2'] } },
              { label: 'ごほうび', value: { items: ['名前を呼ぶ*3', '質問に答える*2', 'リクエストに応える', '大当たり'] } },
              { label: '当たり・ハズレ', value: { items: ['当たり', 'ハズレ*3'] } },
            ],
          },
        ],
        fields: ['rushOdds', 'items'],
      },
      { title: '見た目', fields: ['name', 'style', 'scale'] },
    ],
  },
  votes: {
    groups: [
      { title: '投票の中身', fields: ['title', 'options', 'durationSeconds', 'autoReveal'] },
      { title: '結果の動作', fields: ['resultActions'] },
      { title: '見た目', fields: ['showNames', 'sound', 'volume', 'color'] },
    ],
  },
  cheers: {
    groups: [
      { title: 'たまり方', fields: ['title', 'goal', 'growth', 'loop', 'fullActions'] },
      { title: '見た目', fields: ['fullText', 'sound', 'volume', 'color', 'fullColor'] },
    ],
  },
  pushButtons: {
    groups: [
      { title: '受付', fields: ['label', 'seconds', 'keyword', 'likesPerPush', 'steps'] },
      { title: '段階の動作', fields: ['blueActions', 'greenActions', 'redActions', 'goldActions'] },
      { title: '見た目', fields: ['missText', 'sound', 'volume', 'color'] },
    ],
  },
  jars: {
    groups: [
      { title: '入れるギフト', fields: ['gifts'] },
      { title: '見た目', fields: ['shape', 'title', 'liquidColor'] },
    ],
  },
  wins: {
    groups: [
      { title: '数えかた', fields: ['title', 'goal', 'negative'] },
      { title: 'ギフトで増やす・減らす', fields: ['rules'] },
      {
        title: '演出',
        presets: [
          {
            title: '派手になる増え方・減り方',
            options: [
              { label: '±1 から', value: { lossPreset: 'small', gainPreset: 'small' } },
              { label: '±3 から', value: { lossPreset: 'medium', gainPreset: 'medium' } },
              { label: '±10 から', value: { lossPreset: 'large', gainPreset: 'large' } },
            ],
          },
        ],
        fields: ['style'],
      },
    ],
  },
  timers: {
    groups: [
      { title: '時間', fields: ['startMinutes', 'maxHours'] },
      { title: 'ギフトで延ばす', fields: ['coinSeconds', 'rules'] },
      { title: 'フォロー・いいねで延ばす', fields: ['followSeconds', 'likeEvery', 'likeSeconds'] },
    ],
  },
  bosses: {
    groups: [
      { title: 'ボス', fields: ['name', 'image'] },
      { title: 'コイン差', fields: ['mode', 'rankSource', 'rivalCoins'] },
      { title: '固定HP', fields: ['hp', 'hpScale'] },
      { title: 'ダメージ', fields: ['damageFrom'] },
      { title: '倒したとき', fields: ['defeatText'] },
    ],
  },
  cutins: {
    groups: [
      { title: 'いつ出す', presets: [CUTIN_SCALE], fields: ['gifts'] },
      { title: '文字と音', fields: ['textWeight', 'redText', 'goldText', 'rainbowText', 'sound'] },
    ],
  },
  imageCutins: {
    groups: [
      { title: '写真', fields: ['photo', 'imageStyle', 'crop'] },
      { title: 'いつ出す', presets: [CUTIN_SCALE], fields: ['gifts'] },
      { title: '文字と音', fields: ['redText', 'goldText', 'sound'] },
    ],
  },
  rush: {
    groups: [
      { title: '使う', fields: ['enabled'] },
      {
        title: 'いつ入る',
        presets: [
          {
            title: '配信の大きさ',
            options: [
              { label: '小さめ（1,000 コイン）', value: { enterCoins: 1000, extendMinCoins: 10 } },
              { label: 'ふつう（5,000 コイン）', value: { enterCoins: 5000, extendMinCoins: 50 } },
              { label: '大きい（20,000 コイン）', value: { enterCoins: 20000, extendMinCoins: 100 } },
            ],
          },
        ],
        fields: ['gifts'],
      },
      { title: '中身', fields: ['duration', 'text', 'enterText'] },
    ],
  },
  stepup: {
    groups: [
      { title: '使う', fields: ['enabled'] },
      {
        title: 'いつ上がる',
        presets: [
          {
            title: '配信の大きさ',
            options: [
              { label: '小さめ', value: { scale: 'small' } },
              { label: 'ふつう', value: { scale: 'medium' } },
              { label: '大きい', value: { scale: 'large' } },
            ],
          },
        ],
        fields: ['windowSeconds', 'scale', 'minCoins'],
      },
      { title: '表示する文字', fields: ['step1Text', 'step2Text', 'step3Text', 'step4Text', 'step5Text', 'finalText'] },
      { title: '音と待ち時間', fields: ['cooldownSeconds', 'sound', 'volume', 'edge'] },
    ],
  },
  swarm: {
    groups: [
      { title: '使う', fields: ['enabled'] },
      {
        title: 'いつ出る',
        presets: [
          {
            title: '配信の大きさ',
            options: [
              { label: '小さめ', value: { scale: 'small' } },
              { label: 'ふつう', value: { scale: 'medium' } },
              { label: '大きい', value: { scale: 'large' } },
            ],
          },
        ],
        fields: ['windowSeconds', 'scale', 'threshold', 'cooldownSeconds'],
      },
      { title: '見た目', fields: ['text', 'maxIcons'] },
      { title: '音', fields: ['sound', 'volume'] },
    ],
  },
  combo: {
    groups: [
      { title: '使う', fields: ['enabled'] },
      {
        title: 'いつつながる',
        presets: [{ title: 'つながる速さ', options: [
          { label: 'ゆっくり 15秒', value: { seconds: 15 } },
          { label: 'ふつう 10秒', value: { seconds: 10 } },
          { label: 'はやい 5秒', value: { seconds: 5 } },
        ] }],
        fields: ['seconds', 'gifts', 'minCoins'],
      },
      {
        title: '段の境目',
        presets: [{ title: '上がりかた', options: [
          { label: 'すぐ上がる 2・3・4・5・6', value: { blueAt: 2, greenAt: 3, redAt: 4, goldAt: 5, rainbowAt: 6 } },
          { label: 'ゆっくり上がる 2・4・7・12・20', value: { blueAt: 2, greenAt: 4, redAt: 7, goldAt: 12, rainbowAt: 20 } },
        ] }],
        fields: [],
      },
      { title: '文字', fields: ['endText'] },
    ],
  },
  mediaAlerts: {
    groups: [
      { title: '使う', fields: ['enabled'] },
      { title: '再生のきっかけ', fields: ['rules'] },
    ],
  },
  giftSounds: {
    groups: [
      { title: '使う', fields: ['enabled'] },
      { title: '音量', fields: ['masterVolume', 'maxSeconds', 'maxConcurrent'] },
      { title: 'ルール', fields: ['rules'] },
    ],
  },
  gacha: {
    groups: [
      { title: '使う', fields: ['enabled'] },
      { title: 'いつ回す', fields: ['minCoins', 'gifts'] },
      { title: 'レアリティと天井', fields: ['tiers', 'pity'] },
    ],
  },
  omikuji: {
    groups: [
      { title: '使う', fields: ['enabled'] },
      { title: 'いつ引く', fields: ['minCoins', 'gifts'] },
      { title: '運勢と出やすさ', fields: ['tiers'] },
    ],
  },
  slots: {
    groups: [
      { title: 'いつ回す', fields: ['trigger'] },
      { title: '絵柄と役', fields: ['symbols', 'payouts'] },
      { title: '演出の割合', fields: ['revivalRate', 'nearMissRate', 'reelStopMs'] },
    ],
  },
  relayStop: {
    groups: [{ title: 'リレー停止', fields: ['enabled', 'trigger', 'waitMs'] }],
  },
  peka: {
    groups: [
      { title: '使う', fields: ['enabled', 'minCoins', 'chance'] },
      { title: '光りかた', fields: ['bonusSeconds', 'sound', 'volume'] },
    ],
  },
  minecraft: {
    note: 'マイクラの連携とゴール接近警報を設定します。ゴールのワールドと座標がないと警報は動きません。',
    groups: [{ title: 'ゴール接近警報', fields: ['goalAlert'] }],
  },
  theme: {
    groups: [
      {
        title: '色',
        presets: [
          {
            title: '色の組み合わせ',
            options: [
              { label: '朱と金', value: { accent: '#FF4F1F', gold: '#FFC53D' } },
              { label: '青', value: { accent: '#3FA9F5', gold: '#FFC53D' } },
              { label: 'ピンク', value: { accent: '#FF4F9A', gold: '#FFC53D' } },
              { label: '緑', value: { accent: '#2ECC71', gold: '#FFC53D' } },
              { label: '紫', value: { accent: '#9B5DE5', gold: '#FFC53D' } },
            ],
          },
        ],
        fields: ['mode', 'accent', 'gold'],
      },
      { title: '大きさ', fields: ['scale'] },
    ],
  },
};

// 「かんたん」での呼び名（そのまま読んで分かる言い方にする。説明文は出さない）
export const SIMPLE_LABELS = {
  'obs.enabled': 'OBS連携を使う', 'obs.source': '動かすカメラのソース', 'obs.scene': '動かす場面', 'obs.rules': '動作ルール', 'obs.cooldownSeconds': '同じ動作の間隔', 'obs.reduce': '動きを弱める',
  'tickers.label': '札の文字', 'tickers.messages': '流す文', 'tickers.showGifts': '最近のギフトを流す', 'tickers.giftCount': 'ギフトの件数', 'tickers.showGoals': '目標を流す', 'tickers.goals': '流す目標', 'tickers.speed': '流れる速さ', 'tickers.color': '札の色',
  'supporters.events': '出すイベント', 'supporters.limit': '出す人数', 'supporters.minCoins': '何コインから', 'supporters.avatars': 'アイコンを出す', 'supporters.lifetime': '消すまでの秒数', 'supporters.color': '新しいカードの印',
  'visitors.showFirst': '初見さんを迎える', 'visitors.showReturning': 'おかえりの人を迎える', 'visitors.showRegular': '常連さんを迎える', 'visitors.regularVisits': '何回目から常連さん', 'visitors.firstText': '初見さんの文', 'visitors.returningText': 'おかえりの文', 'visitors.regularText': '常連さんの文', 'visitors.duration': '出す秒数', 'visitors.avatars': 'アイコンを出す', 'visitors.keepDays': '記録を残す日数',
  'alerts.events': '出すきっかけ', 'alerts.minCoins': '何コインから出す', 'alerts.position': 'たての位置', 'alerts.align': 'よこの位置',
  'alerts.bigCoins': '何コインから金色にする', 'alerts.rules': 'このギフトのときだけ特別にする',
  'chats.style': '形', 'chats.fontSize': '文字の大きさ', 'chats.maxItems': '一度に出す数', 'chats.highlight': 'ギフトした人を目立たせる',
  'chats.tts': 'コメントを読み上げる', 'chats.hideWords': '出さない言葉（、で区切る）',
  'counters.show': '出す数', 'counters.layout': '並べかた', 'counters.color': '色',
  'goals.title': '見出し', 'goals.metric': '数えるもの', 'goals.goal': '目標の数', 'goals.step': '達成したら目標を上げる数', 'goals.color': 'バーの色',
  'rankings.title': '見出し', 'rankings.metric': '順位を決めるもの', 'rankings.limit': '出す人数',
  'roulettes.gifts': '回すギフト', 'roulettes.rushOdds': 'RUSH中は確率を変える', 'roulettes.items': '項目と当たりやすさ', 'roulettes.name': '名前', 'roulettes.style': '形', 'roulettes.scale': '大きさ（倍）',
  'votes.title': '見出し', 'votes.options': '選択肢（カンマ区切り）', 'votes.durationSeconds': '受付時間', 'votes.autoReveal': '時間で結果を出す', 'votes.resultActions': '結果が出たときの動作', 'votes.showNames': '投票した人の名前を出す', 'votes.sound': '効果音', 'votes.volume': '音量', 'votes.color': '色',
  'cheers.title': '見出し', 'cheers.goal': '満タンまでのいいね', 'cheers.growth': '次の目標の倍率', 'cheers.loop': '満タン後も続ける', 'cheers.fullText': '満タンの文', 'cheers.fullActions': '満タンの動作', 'cheers.sound': '効果音', 'cheers.volume': '音量', 'cheers.color': 'ゲージの色', 'cheers.fullColor': '満タンの色',
  'pushButtons.label': 'ボタンの文字', 'pushButtons.seconds': '受付時間（秒）', 'pushButtons.keyword': '押しと数える言葉', 'pushButtons.likesPerPush': '何いいねで1押しか', 'pushButtons.steps': '段階の境目', 'pushButtons.blueActions': '青の動作', 'pushButtons.greenActions': '緑の動作', 'pushButtons.redActions': '赤の動作', 'pushButtons.goldActions': '金の動作', 'pushButtons.missText': '不発の文字', 'pushButtons.sound': '効果音', 'pushButtons.volume': '音量', 'pushButtons.color': '色',
  'jars.gifts': '入れるギフト（空なら全部）', 'jars.shape': '入れ物の形', 'jars.title': 'ラベルの文字', 'jars.liquidColor': '中の液体の色',
  'wins.title': '見出し', 'wins.goal': '目標（0 で出さない）', 'wins.negative': 'マイナスまで減らせる', 'wins.rules': 'ギフトで WIN 数を変える', 'wins.style': '形',
  'timers.startMinutes': '初めの時間（動かしたあとは「リセット」で反映）', 'timers.maxHours': '上限（0 でなし）', 'timers.coinSeconds': '1 コインで延びる', 'timers.rules': 'このギフトで決まった時間だけ延ばす',
  'timers.followSeconds': 'フォローで延びる', 'timers.likeEvery': 'いいね何回ごとに延ばす', 'timers.likeSeconds': 'そのとき延びる',
  'bosses.name': 'ボスの名前', 'bosses.hp': '最大 HP', 'bosses.hpScale': '次のボスの HP', 'bosses.image': 'ボスの画像', 'bosses.damageFrom': 'ダメージにするもの', 'bosses.defeatText': '倒したときの文字',
  'bosses.mode': 'HPの出し方', 'bosses.rankSource': '相手コインの出どころ', 'bosses.rivalCoins': '相手のコイン',
  'mediaAlerts.enabled': 'メディア通知を使う', 'mediaAlerts.rules': '再生のきっかけ',
  'giftSounds.enabled': 'ギフト別サウンドを使う', 'giftSounds.masterVolume': '全体の音量', 'giftSounds.maxSeconds': '1回の最長（秒）', 'giftSounds.maxConcurrent': '同時に鳴らす数', 'giftSounds.rules': 'ルール',
  'gacha.enabled': 'ガチャを使う', 'gacha.minCoins': '何コインから回す', 'gacha.gifts': 'このギフトで回す', 'gacha.pity': '天井（この回数で確定）', 'gacha.tiers': 'レアリティと当たりやすさ',
  'omikuji.enabled': 'おみくじを使う', 'omikuji.minCoins': '何コインから引く', 'omikuji.gifts': 'このギフトで引く', 'omikuji.tiers': '運勢と出やすさ',
  'slots.enabled': 'スロットを使う', 'slots.trigger': '回すきっかけ', 'slots.symbols': '絵柄と重み', 'slots.payouts': '役・表示文・当選時の動作', 'slots.revivalRate': '当たりの復活割合', 'slots.nearMissRate': '外れのニアミス割合', 'slots.reelStopMs': 'リールの停止間隔',
  'cutins.gifts': 'このギフトなら必ず出す', 'cutins.redText': '赤の文字', 'cutins.goldText': '金の文字', 'cutins.rainbowText': '虹の文字', 'cutins.sound': '効果音',
  'cutins.textWeight': '文字の太さ',
  'imageCutins.photo': '写真', 'imageCutins.layout': '写真の置きかた', 'imageCutins.gifts': 'このギフトなら必ず出す', 'imageCutins.redText': '赤の文字', 'imageCutins.goldText': '金の文字', 'imageCutins.sound': '効果音',
  'imageCutins.imageStyle': '画像のスタイル', 'imageCutins.crop': '切り抜き',
  'rush.enabled': 'RUSH を使う', 'rush.gifts': 'このギフトで突入', 'rush.duration': 'RUSH の長さ', 'rush.text': '帯に流れる文字', 'rush.enterText': '突入のときの文字',
  'dareba.enabled': 'ダレ場の事件を使う', 'dareba.type': '起こす事件',
  'minecraft.goalAlert': 'ゴール接近警報',
  'stepup.enabled': 'ステップアップ予告を使う', 'stepup.windowSeconds': '数える時間', 'stepup.scale': '配信の大きさ', 'stepup.minCoins': '何コインから数える',
  'stepup.step1Text': 'STEP 1 の文字', 'stepup.step2Text': 'STEP 2 の文字', 'stepup.step3Text': 'STEP 3 の文字', 'stepup.step4Text': 'STEP 4 の文字', 'stepup.step5Text': 'STEP 5 の文字', 'stepup.finalText': '最後の文字',
  'stepup.cooldownSeconds': '次までの待ち時間', 'stepup.sound': '効果音', 'stepup.volume': '音量', 'stepup.edge': '積み上がる側',
  'swarm.enabled': '群予告を使う', 'swarm.windowSeconds': '数える時間', 'swarm.scale': '配信の大きさ', 'swarm.threshold': '群を出す個数',
  'swarm.cooldownSeconds': '次までの待ち時間', 'swarm.text': '出す文字', 'swarm.maxIcons': '飛ばすアイコンの上限', 'swarm.sound': '効果音', 'swarm.volume': '音量',
  'combo.enabled': 'コンボを使う', 'combo.seconds': 'つながる秒数', 'combo.gifts': '数えるギフト', 'combo.minCoins': '何コインから数える', 'combo.endText': '終わるときの文字',
  'theme.mode': '明るさ', 'theme.accent': '差し色', 'theme.gold': 'コイン・達成の色', 'theme.scale': '全体の大きさ',
};

// 数字の後ろに付ける単位
export const UNITS = {
  minCoins: 'コイン', bigCoins: 'コイン', fontSize: 'px', maxItems: '件', limit: '人', startMinutes: '分', maxHours: '時間',
  coinSeconds: '秒', followSeconds: '秒', likeEvery: '回', likeSeconds: '秒', hpScale: '倍', duration: '秒', seconds: '秒', scale: '倍',
  rivalCoins: 'コイン', pity: '回',
};

const EVENT = { gift: 'ギフト', follow: 'フォロー', share: 'シェア' };
const METRIC = { follows: 'フォロー', likes: 'いいね', diamonds: 'コイン', gifts: 'ギフト', shares: 'シェア', comments: 'コメント', viewers: '視聴者', coins: 'コイン' };
const giftsOr = (list, fallback) => (list?.length ? list.slice(0, 2).map((name) => giftLabel(name)).join('・') + (list.length > 2 ? ' ほか' : '') : fallback);

// ホームの一覧に出す、今の設定のひとこと（1件目の設定から作る）
const SUMMARY = {
  obs: (e) => (e.enabled === false ? '使わない設定' : `${e.source || 'カメラ未指定'}を${e.reduce ? '弱めに' : '動かす'}・ルール ${e.rules?.length ?? 0}件`),
  tickers: (e) => `${e.messages?.length ?? 0} 個のお知らせ・${e.showGifts ? 'ギフトあり' : 'ギフトなし'}`,
  supporters: (e) => `${(e.events ?? []).map((v) => EVENT[v] ?? v).join('・')}を${e.limit} 人`,
  visitors: (e) => `${e.regularVisits} 回目から常連さん・${e.keepDays} 日記録`,
  alerts: (e) => `${(e.events ?? []).map((v) => EVENT[v] ?? v).join('・') || 'なし'}で出す`,
  chats: (e) => `${e.style === 'bubble' ? '吹き出し' : 'テロップ'}${e.tts ? '・読み上げあり' : ''}`,
  counters: (e) => (e.show ?? []).map((v) => METRIC[v] ?? v).join('・'),
  goals: (e) => `${e.title}（目標 ${e.goal}）`,
  rankings: (e) => e.title,
  throne: (e) => (e.enabled === false ? '使わない設定' : `直近10分・接近 ${e.approachPercent}%・移動 ${e.maxMoves} 回まで`),
  ootori: (e) => (e.enabled === false ? '使わない設定' : `${e.mode === 'raise' ? 'せり上げ式' : '誰でも式'}・${Math.round((e.durationMs ?? 600000) / 60000)} 分`),
  dareba: (e) => (e.enabled === false ? '使わない設定' : `${e.type || '野良ボス'}を起こす`),
  roulettes: (e) => `${giftsOr(e.gifts, '手で')}で回る・${e.items?.length ?? 0} 項目${e.rushOdds ? '・RUSH中は確率が変わる' : ''}`,
  votes: (e) => `${e.title}・${e.options?.length ?? 0} 択${e.durationSeconds ? `・${e.durationSeconds} 秒` : '・手動で締める'}`,
  cheers: (e) => `${e.title}・${e.goal} いいねで満タン${e.loop === false ? '・1回で止まる' : ''}`,
  pushButtons: (e) => `${e.label}・${e.seconds} 秒・${e.keyword} / いいね ${e.likesPerPush} 回で1押し`,
  jars: (e) => ({ jar: '保存瓶', heart: 'ハート', potion: 'フラスコ' })[e.shape] ?? '',
  wins: (e) => [e.goal ? `目標 ${e.goal}` : null, e.rules?.length ? `ギフトのルール ${e.rules.length} つ` : 'ボタンで数える'].filter(Boolean).join('・'),
  timers: (e) => `${e.startMinutes >= 60 ? `${Math.floor(e.startMinutes / 60)} 時間${e.startMinutes % 60 ? `${e.startMinutes % 60} 分` : ''}` : `${e.startMinutes} 分`}から${e.coinSeconds ? `・1 コインで +${e.coinSeconds} 秒` : ''}`,
  bosses: (e) => (e.mode === 'rank-gap' ? `${e.name}（上の人まで ${e.rivalCoins} コイン）` : `${e.name}（HP ${e.hp}）`),
  cutins: (e) => `${e.minCoins} コインから・${e.textWeight === 'bold' ? '太字' : '普通'}`,
  imageCutins: (e) => `${e.minCoins} コインから${{ stripe: '・縞・標準', invert: '・縞・反転', thick: '・縞・枠太' }[e.imageStyle] ?? ''}${e.photo ? '' : '・写真なし'}`,
  rush: (e) => (e.enabled ? `${e.enterCoins ? `${e.enterCoins} コイン` : giftsOr(e.gifts, 'ボタン')}で突入` : '使わない設定'),
  stepup: (e) => (e.enabled ? `${e.windowSeconds} 秒で ${e.scale === 'small' ? '小さめ' : e.scale === 'large' ? '大きめ' : 'ふつう'}の境目` : '使わない設定'),
  swarm: (e) => (e.enabled ? `${e.windowSeconds} 秒で ${e.scale === 'small' ? '小さめ' : e.scale === 'large' ? '大きめ' : e.scale === 'custom' ? `${e.threshold} 個` : 'ふつう'}の群` : '使わない設定'),
  combo: (e) => (e.enabled ? `${e.seconds} 秒つながる・${e.blueAt} 回から出す` : '使わない設定'),
  mediaAlerts: (e) => (e.enabled === false ? '使わない設定' : `きっかけ ${e.rules?.length ?? 0} 件`),
  giftSounds: (e) => (e.enabled === false ? '使わない設定' : `ルール ${e.rules?.length ?? 0} 件`),
  gacha: (e) => (e.enabled === false ? '使わない設定' : `${e.minCoins ? `${e.minCoins} コインから` : '金額では回さない'}・${e.tiers?.length ?? 0} 段階`),
  omikuji: (e) => (e.enabled === false ? '使わない設定' : `${e.minCoins ? `${e.minCoins} コインから` : '金額では引かない'}・${e.tiers?.length ?? 0} 種類`),
  slots: (e) => (e.enabled === false ? '使わない設定' : `${e.revivalRate}% 復活・${e.nearMissRate}% ニアミス`),
  peka: (e) => (e.enabled === false ? '使わない設定' : `${e.minCoins} コインから・当たり ${Math.round(e.chance * 100)}%`),
  minecraft: (e) => (e.enabled ? '連携する設定' : '連携していない'),
  theme: (e) => (e.mode === 'light' ? '明るい' : '暗い'),
};

/** ホームの一覧に出すひとこと。config はそのセクションの設定（「名前: {…}」か、そのまま） */
export function summaryOf(section, value, isObject) {
  try {
    if (isObject) return SUMMARY[section]?.(value ?? {}) ?? '';
    const entries = Object.values(value ?? {});
    if (!entries.length) return 'まだ作っていません';
    const first = SUMMARY[section]?.(entries[0]) ?? '';
    return entries.length > 1 ? `${entries.length} つ・${first}` : first;
  } catch {
    return '';
  }
}

/** 今の値が、その型の値と同じか（選ばれている型に印を付ける） */
export const presetActive = (values, preset) => Object.entries(preset).every(([k, v]) => JSON.stringify(values?.[k]) === JSON.stringify(v));
