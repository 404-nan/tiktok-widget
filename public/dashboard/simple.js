import { giftLabel } from '/widgets/lib/overlay.js';

// 「かんたん」モードの中身。
// iPhone の設定のように、まとまりごとの一覧 → 押すと中に入る、という形にする:
//   ホーム（画面に出しているものの一覧）→ ウィジェット1つの設定（まとまりごとの行）
// 細かい項目・YAML は「くわしく」モード（今までのフォーム）で触る。
// 新しいウィジェットや項目を足したら、ここに「かんたん」で出すもの（説明・まとまり・呼び名・型）も足す。

// 「出すものを足す」に並べる順（目的ごと）
export const GROUPS = [
  ['お礼・にぎやかし', ['alerts', 'chats', 'counters', 'goals', 'rankings']],
  ['企画・ゲーム', ['roulettes', 'jars', 'wins', 'timers', 'bosses']],
  ['豪華な演出', ['cutins', 'imageCutins', 'rush', 'mediaAlerts', 'giftSounds', 'gacha', 'slots']],
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
  alerts: { icon: 'gift', desc: 'ギフトやフォローが来たら、名前つきのテロップを出す' },
  chats: { icon: 'message-circle', desc: 'コメントを画面に流す。読み上げもできる' },
  counters: { icon: 'heart', desc: 'いいねや視聴者の数を出す' },
  goals: { icon: 'target', desc: '「フォロー 100 人」のような目標までのバー' },
  rankings: { icon: 'trophy', desc: 'たくさんギフトをくれた人の順位' },
  roulettes: { icon: 'dices', desc: 'ギフトで回る、罰ゲームやごほうびのルーレット' },
  jars: { icon: 'flask-conical', desc: '届いたギフトが瓶に落ちて、たまっていく' },
  wins: { icon: 'flag', desc: 'クリアした回数。ギフトで増えたり減ったりする' },
  timers: { icon: 'timer', desc: 'ギフトで延びる残り時間（耐久配信）' },
  bosses: { icon: 'skull', desc: 'みんなのギフトでボスの HP を削って倒す。上の人とのコイン差にもできる' },
  mediaAlerts: { icon: 'clapperboard', desc: 'ギフトやフォローで、動画・音声・画像を出す' },
  giftSounds: { icon: 'volume-2', desc: 'ギフトごとに効果音を重ねて鳴らす' },
  gacha: { icon: 'sparkles', desc: 'ギフトでガチャを回して、結果を出す' },
  slots: { icon: 'disc-3', desc: 'ギフトで3つの絵柄をそろえるスロット演出' },
  cutins: { icon: 'zap', desc: '大きいギフトで「激アツ」の帯がドンと入る' },
  imageCutins: { icon: 'image', desc: '自分の写真が入るカットイン' },
  rush: { icon: 'flame', desc: '大きいギフトで RUSH に突入。画面の両側が光り続ける' },
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
        fields: ['rushOdds', 'sameSize', 'items'],
      },
      { title: '見た目', fields: ['name', 'style', 'scale'] },
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
      { title: 'ルーレットの当たり', fields: ['rouletteWin', 'rouletteWinText'] },
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
  slots: {
    groups: [
      { title: 'いつ回す', fields: ['trigger'] },
      { title: '絵柄と役', fields: ['symbols', 'payouts'] },
      { title: '演出の割合', fields: ['revivalRate', 'nearMissRate', 'reelStopMs'] },
    ],
  },
  minecraft: {
    note: 'マイクラの枠の時間を表示します。枠の間は自動で TikTok につながります。',
    groups: [],
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
  'alerts.events': '出すきっかけ', 'alerts.minCoins': '何コインから出す', 'alerts.position': 'たての位置', 'alerts.align': 'よこの位置',
  'alerts.bigCoins': '何コインから金色にする', 'alerts.rules': 'このギフトのときだけ特別にする',
  'chats.style': '形', 'chats.fontSize': '文字の大きさ', 'chats.maxItems': '一度に出す数', 'chats.highlight': 'ギフトした人を目立たせる',
  'chats.tts': 'コメントを読み上げる', 'chats.hideWords': '出さない言葉（、で区切る）',
  'counters.show': '出す数', 'counters.layout': '並べかた', 'counters.color': '色',
  'goals.title': '見出し', 'goals.metric': '数えるもの', 'goals.goal': '目標の数', 'goals.step': '達成したら目標を上げる数', 'goals.color': 'バーの色',
  'rankings.title': '見出し', 'rankings.metric': '順位を決めるもの', 'rankings.limit': '出す人数',
  'roulettes.gifts': '回すギフト', 'roulettes.rushOdds': 'RUSH中は確率を変える', 'roulettes.sameSize': '扇を同じ大きさにする', 'roulettes.items': '項目と当たりやすさ', 'roulettes.name': '名前', 'roulettes.style': '形', 'roulettes.scale': '大きさ（倍）',
  'jars.gifts': '入れるギフト（空なら全部）', 'jars.shape': '入れ物の形', 'jars.title': 'ラベルの文字', 'jars.liquidColor': '中の液体の色',
  'wins.title': '見出し', 'wins.goal': '目標（0 で出さない）', 'wins.negative': 'マイナスまで減らせる', 'wins.rules': 'ギフトで WIN 数を変える', 'wins.style': '形',
  'timers.startMinutes': '初めの時間（動かしたあとは「リセット」で反映）', 'timers.maxHours': '上限（0 でなし）', 'timers.coinSeconds': '1 コインで延びる', 'timers.rules': 'このギフトで決まった時間だけ延ばす',
  'timers.followSeconds': 'フォローで延びる', 'timers.likeEvery': 'いいね何回ごとに延ばす', 'timers.likeSeconds': 'そのとき延びる',
  'bosses.name': 'ボスの名前', 'bosses.hp': '最大 HP', 'bosses.hpScale': '次のボスの HP', 'bosses.image': 'ボスの画像', 'bosses.damageFrom': 'ダメージにするもの', 'bosses.defeatText': '倒したときの文字',
  'bosses.mode': 'HPの出し方', 'bosses.rankSource': '相手コインの出どころ', 'bosses.rivalCoins': '相手のコイン',
  'mediaAlerts.enabled': 'メディア通知を使う', 'mediaAlerts.rules': '再生のきっかけ',
  'giftSounds.enabled': 'ギフト別サウンドを使う', 'giftSounds.masterVolume': '全体の音量', 'giftSounds.maxSeconds': '1回の最長（秒）', 'giftSounds.maxConcurrent': '同時に鳴らす数', 'giftSounds.rules': 'ルール',
  'gacha.enabled': 'ガチャを使う', 'gacha.minCoins': '何コインから回す', 'gacha.gifts': 'このギフトで回す', 'gacha.pity': '天井（この回数で確定）', 'gacha.tiers': 'レアリティと当たりやすさ',
  'slots.enabled': 'スロットを使う', 'slots.trigger': '回すきっかけ', 'slots.symbols': '絵柄と重み', 'slots.payouts': '役・表示文・当選時の動作', 'slots.revivalRate': '当たりの復活割合', 'slots.nearMissRate': '外れのニアミス割合', 'slots.reelStopMs': 'リールの停止間隔',
  'cutins.gifts': 'このギフトなら必ず出す', 'cutins.redText': '赤の文字', 'cutins.goldText': '金の文字', 'cutins.rainbowText': '虹の文字', 'cutins.sound': '効果音',
  'cutins.textWeight': '文字の太さ',
  'imageCutins.photo': '写真', 'imageCutins.layout': '写真の置きかた', 'imageCutins.gifts': 'このギフトなら必ず出す', 'imageCutins.redText': '赤の文字', 'imageCutins.goldText': '金の文字', 'imageCutins.sound': '効果音',
  'imageCutins.imageStyle': '画像のスタイル', 'imageCutins.crop': '切り抜き',
  'rush.enabled': 'RUSH を使う', 'rush.gifts': 'このギフトで突入', 'rush.duration': 'RUSH の長さ', 'rush.text': '帯に流れる文字', 'rush.enterText': '突入のときの文字',
  'theme.mode': '明るさ', 'theme.accent': '差し色', 'theme.gold': 'コイン・達成の色', 'theme.scale': '全体の大きさ',
};

// 数字の後ろに付ける単位
export const UNITS = {
  minCoins: 'コイン', bigCoins: 'コイン', fontSize: 'px', maxItems: '件', limit: '人', startMinutes: '分', maxHours: '時間',
  coinSeconds: '秒', followSeconds: '秒', likeEvery: '回', likeSeconds: '秒', hpScale: '倍', duration: '秒', scale: '倍',
  rivalCoins: 'コイン', pity: '回',
};

const EVENT = { gift: 'ギフト', follow: 'フォロー', share: 'シェア' };
const METRIC = { follows: 'フォロー', likes: 'いいね', diamonds: 'コイン', gifts: 'ギフト', shares: 'シェア', comments: 'コメント', viewers: '視聴者', coins: 'コイン' };
const giftsOr = (list, fallback) => (list?.length ? list.slice(0, 2).map((name) => giftLabel(name)).join('・') + (list.length > 2 ? ' ほか' : '') : fallback);

// ホームの一覧に出す、今の設定のひとこと（1件目の設定から作る）
const SUMMARY = {
  alerts: (e) => `${(e.events ?? []).map((v) => EVENT[v] ?? v).join('・') || 'なし'}で出す`,
  chats: (e) => `${e.style === 'bubble' ? '吹き出し' : 'テロップ'}${e.tts ? '・読み上げあり' : ''}`,
  counters: (e) => (e.show ?? []).map((v) => METRIC[v] ?? v).join('・'),
  goals: (e) => `${e.title}（目標 ${e.goal}）`,
  rankings: (e) => e.title,
  roulettes: (e) => `${giftsOr(e.gifts, '手で')}で回る・${e.items?.length ?? 0} 項目${e.rushOdds ? '・RUSH中は確率が変わる' : ''}`,
  jars: (e) => ({ jar: '保存瓶', heart: 'ハート', potion: 'フラスコ' })[e.shape] ?? '',
  wins: (e) => [e.goal ? `目標 ${e.goal}` : null, e.rules?.length ? `ギフトのルール ${e.rules.length} つ` : 'ボタンで数える'].filter(Boolean).join('・'),
  timers: (e) => `${e.startMinutes >= 60 ? `${Math.floor(e.startMinutes / 60)} 時間${e.startMinutes % 60 ? `${e.startMinutes % 60} 分` : ''}` : `${e.startMinutes} 分`}から${e.coinSeconds ? `・1 コインで +${e.coinSeconds} 秒` : ''}`,
  bosses: (e) => (e.mode === 'rank-gap' ? `${e.name}（上の人まで ${e.rivalCoins} コイン）` : `${e.name}（HP ${e.hp}）`),
  cutins: (e) => `${e.minCoins} コインから・${e.textWeight === 'bold' ? '太字' : '普通'}`,
  imageCutins: (e) => `${e.minCoins} コインから${{ stripe: '・縞・標準', invert: '・縞・反転', thick: '・縞・枠太' }[e.imageStyle] ?? ''}${e.photo ? '' : '・写真なし'}`,
  rush: (e) => (e.enabled ? `${e.enterCoins ? `${e.enterCoins} コイン` : giftsOr(e.gifts, 'ボタン')}で突入` : '使わない設定'),
  mediaAlerts: (e) => (e.enabled === false ? '使わない設定' : `きっかけ ${e.rules?.length ?? 0} 件`),
  giftSounds: (e) => (e.enabled === false ? '使わない設定' : `ルール ${e.rules?.length ?? 0} 件`),
  gacha: (e) => (e.enabled === false ? '使わない設定' : `${e.minCoins ? `${e.minCoins} コインから` : '金額では回さない'}・${e.tiers?.length ?? 0} 段階`),
  slots: (e) => (e.enabled === false ? '使わない設定' : `${e.revivalRate}% 復活・${e.nearMissRate}% ニアミス`),
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
