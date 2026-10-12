// 「かんたん」モードの中身: ウィジェットのやさしい説明、よく使う項目だけの一覧、押すだけで決まる「型」。
// 細かい項目・YAML は「くわしく」モード（今までのフォーム）で触る。

// カードの並び（グループごと）
export const GROUPS = [
  ['まずはこれ', ['alerts', 'chats', 'counters', 'goals', 'rankings']],
  ['企画・ゲーム', ['roulettes', 'jars', 'wins', 'timers', 'bosses']],
  ['豪華な演出', ['cutins', 'imageCutins', 'rush']],
  ['そのほか', ['minecraft', 'theme']],
];

// カードに出すアイコンとひとこと（URL や設定の名前は書かない）
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
  bosses: { icon: 'skull', desc: 'みんなのギフトでボスの HP を削って倒す' },
  cutins: { icon: 'zap', desc: '大きいギフトで「激アツ」の帯がドンと入る' },
  imageCutins: { icon: 'image', desc: '自分の写真が入るカットイン' },
  rush: { icon: 'flame', desc: '大きいギフトで RUSH に突入。画面の両側が光り続ける' },
  minecraft: { icon: 'box', desc: 'ギフトで Minecraft の中に何かを起こす' },
  theme: { icon: 'palette', desc: '全部のウィジェットの色と大きさ' },
};

// 配信の大きさで、演出が出るコインの境目をまとめて決める
const CUTIN_SCALE = {
  title: '配信の大きさ（演出が出るコインの境目）',
  options: [
    { label: '小さめ（10 コインから）', value: { minCoins: 10, greenCoins: 30, redCoins: 100, goldCoins: 500, rainbowCoins: 2000 } },
    { label: 'ふつう（100 コインから）', value: { minCoins: 100, greenCoins: 300, redCoins: 1000, goldCoins: 5000, rainbowCoins: 20000 } },
    { label: '大きい（500 コインから）', value: { minCoins: 500, greenCoins: 2000, redCoins: 10000, goldCoins: 30000, rainbowCoins: 100000 } },
  ],
};

/**
 * ウィジェットごとの「かんたん」の中身。
 * fields: 出す項目（上から順）。presets: 押すとまとめて値が入る「型」。note: 項目の代わりに出す案内。
 */
export const SIMPLE = {
  alerts: {
    presets: [
      {
        title: '出しかた',
        options: [
          { label: 'ひかえめ（短く・音なし）', value: { duration: 3, sound: false } },
          { label: 'ふつう', value: { duration: 4.5, sound: true, volume: 0.3 } },
          { label: 'しっかり見せる（長め）', value: { duration: 7, sound: true, volume: 0.5 } },
        ],
      },
    ],
    fields: ['events', 'position', 'align', 'minCoins', 'bigCoins', 'rules'],
  },
  chats: {
    fields: ['style', 'fontSize', 'maxItems', 'highlight', 'hideWords', 'tts'],
  },
  counters: {
    fields: ['show', 'layout', 'color'],
  },
  goals: {
    fields: ['title', 'metric', 'goal', 'step', 'color'],
  },
  rankings: {
    fields: ['title', 'metric', 'limit'],
  },
  roulettes: {
    presets: [
      {
        title: '項目の型（押すと今の項目と入れ替わります）',
        confirm: '今の項目を、この型の項目に入れ替えますか？',
        options: [
          { label: '罰ゲーム', value: { items: ['歌う*2', '変顔*2', '一発ギャグ', 'モノマネ', 'セーフ*2'] } },
          { label: 'ごほうび', value: { items: ['名前を呼ぶ*3', '質問に答える*2', 'リクエストに応える', '大当たり'] } },
          { label: '当たり・ハズレ', value: { items: ['当たり', 'ハズレ*3'] } },
        ],
      },
    ],
    fields: ['name', 'style', 'gifts', 'items'],
  },
  jars: {
    fields: ['shape', 'title', 'gifts', 'liquidColor'],
  },
  wins: {
    presets: [
      {
        title: '配信の大きさ（演出が派手になる増え方・減り方）',
        options: [
          { label: '±1 から派手に', value: { lossPreset: 'small', gainPreset: 'small' } },
          { label: '中くらい（±3 から）', value: { lossPreset: 'medium', gainPreset: 'medium' } },
          { label: '大きく動く配信（±10 から）', value: { lossPreset: 'large', gainPreset: 'large' } },
        ],
      },
    ],
    fields: ['title', 'goal', 'rules', 'negative', 'style'],
  },
  timers: {
    fields: ['startMinutes', 'coinSeconds', 'rules', 'followSeconds', 'likeEvery', 'likeSeconds', 'maxHours'],
  },
  bosses: {
    fields: ['name', 'hp', 'hpScale', 'image', 'damageFrom', 'defeatText'],
  },
  cutins: {
    presets: [CUTIN_SCALE],
    fields: ['gifts', 'redText', 'goldText', 'rainbowText', 'sound'],
  },
  imageCutins: {
    presets: [CUTIN_SCALE],
    fields: ['photo', 'layout', 'gifts', 'redText', 'goldText', 'sound'],
  },
  rush: {
    presets: [
      {
        title: '配信の大きさ（突入するコイン）',
        options: [
          { label: '小さめ（1,000 コインで突入）', value: { enterCoins: 1000, extendMinCoins: 10 } },
          { label: 'ふつう（5,000 コインで突入）', value: { enterCoins: 5000, extendMinCoins: 50 } },
          { label: '大きい（20,000 コインで突入）', value: { enterCoins: 20000, extendMinCoins: 100 } },
        ],
      },
    ],
    fields: ['enabled', 'gifts', 'duration', 'text', 'enterText'],
  },
  minecraft: {
    note: 'Minecraft 連携は、サーバーのアドレスやパスワードを入れる必要があるので「くわしく」で設定します。',
    fields: [],
  },
  theme: {
    presets: [
      {
        title: '色の組み合わせ',
        options: [
          { label: '朱と金（初めの色）', value: { accent: '#FF4F1F', gold: '#FFC53D' } },
          { label: '青', value: { accent: '#3FA9F5', gold: '#FFC53D' } },
          { label: 'ピンク', value: { accent: '#FF4F9A', gold: '#FFC53D' } },
          { label: '緑', value: { accent: '#2ECC71', gold: '#FFC53D' } },
          { label: '紫', value: { accent: '#9B5DE5', gold: '#FFC53D' } },
        ],
      },
    ],
    fields: ['mode', 'accent', 'gold', 'scale'],
  },
};

/** 今の値が、その型の値と同じか（選ばれている型に印を付ける） */
export const presetActive = (values, preset) => Object.entries(preset).every(([k, v]) => JSON.stringify(values?.[k]) === JSON.stringify(v));
