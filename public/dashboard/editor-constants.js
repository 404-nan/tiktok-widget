// editor.js の定数。タブ一覧・表示名・フォームの構成など。
export const TABS = ['alerts', 'chats', 'cutins', 'puchuns', 'imageCutins', 'roulettes', 'votes', 'cheers', 'tickers', 'supporters', 'visitors', 'superchats', 'commentSlide', 'pushButtons', 'jars', 'rankings', 'counters', 'goals', 'wins', 'timers', 'bosses', 'doors', 'peka', 'throne', 'ootori', 'dareba', 'rush', 'stepup', 'swarm', 'combo', 'mediaAlerts', 'giftSounds', 'gacha', 'omikuji', 'slots', 'relayStop', 'mcGifts', 'cardDraw', 'obs', 'minecraft', 'theme'];

// 選択肢の表示名
export const ENUM_LABELS = {
  dark: 'ダーク', light: 'ライト', top: '上', center: '中央', bottom: '下', left: '左', right: '右',
  jar: '保存瓶', heart: 'ハート', potion: 'エリクサーのフラスコ', auto: '自動', on: '表示', off: '表示しない',
  prize: '本格ホイール（ピンでカチカチ）', wheel: '丸（シンプル）', strip: '横スライド', casino: 'カジノ', slot: 'スロット台（1本）', slot3: 'スロット（3本）', 'slotLook.neon': 'ネオン', 'slotLook.wa': '和風（朱塗り）', judo: '柔道', wa: '和パチスロ', radial: '中心から外へ', around: '円周にそって横向き', row: '横', column: '縦',
  follows: 'フォロー', likes: 'いいね', diamonds: 'コイン', gifts: 'ギフト数', shares: 'シェア', comments: 'コメント', viewers: '視聴者',
  gift: 'ギフト', follow: 'フォロー', share: 'シェア', like: 'いいね', coins: 'コイン',
  avatar: '送った人のアイコン', band: '色の帯', photo: '写真の帯（縁が木炭）', 'image.photo': '写真（なければ何も乗せない）', 'image.gift': 'ギフトの画像',
  plate: '横長の板', big: '大きい数字',
  'lossPreset.large': '大きく減る配信（-10 大妨害 / -100 超妨害 / -1000 壊滅）', 'lossPreset.medium': '中くらい（-3 / -10 / -30）',
  'lossPreset.small': '-1 から派手に（-1 / -3 / -5）', 'lossPreset.custom': '自分で決める（下の詳しい設定）',
  'gainPreset.large': '大きく増える配信（+10 大 / +100 超 / +1000 最大）', 'gainPreset.medium': '中くらい（+3 / +10 / +30）',
  'gainPreset.small': '+1 から派手に（+1 / +3 / +5）', 'gainPreset.custom': '自分で決める（下の詳しい設定）',
  inside: '帯の中いっぱい（縁が木炭）', side: '帯の横に大きく乗る',
  normal: '普通', bold: '太字',
  stripe: '縞・標準', invert: '縞・反転', thick: '縞・枠太',
  'mode.hp': '固定HP', 'mode.rank-gap': '上の人とのコイン差',
  'resetMode.stream': '配信ごと', 'resetMode.daily': '日本時間の0時',
  'freeRequires.none': '条件なし', 'freeRequires.follow': 'フォローした人だけ',
  'pickMode.viewer': '送った人がコメントで選ぶ', 'pickMode.random': 'おまかせ（ランダム）', 'pickMode.streamer': '配信者が選ぶ',
  'displayMode.long': 'じっくり（番号を選ぶ）', 'displayMode.short': '短い（番号選びなし）',
  'resultFont.simple': 'ゴシック', 'resultFont.mincho': '明朝', 'resultFont.brush': '筆文字',
  'timeoutMode.random': 'ランダムで引く', 'timeoutMode.streamer': '配信者が選ぶ（押さなければ同じ秒数のあとランダム）',
  'rankSource.manual': '手入力', 'rankSource.live': '配信の順位（無ければ手入力）',
  telop: 'テロップ風（下から積み上がる一覧）', bubble: '吹き出し風',
  chance: 'チャンス予告', cutin: 'キャラのカットイン', jackpot: '大当たり', puchun: 'プチュン', full: '全画面',
  'idleMode.small': '右下に小さく出す', 'idleMode.hide': '出さない',
  'queuePriority.off': '入った順（今までどおり）', 'queuePriority.big': '大きいギフトを先に',
};
// 項目の短い名前（説明は下に小さく出す）
export const LABELS = {
  mode: 'モード', accent: '差し色（朱）', gold: '金', ink: '墨', paper: '白', scale: '拡大率',
  events: '反応するイベント', gifts: 'ギフト名（カンマ区切り）', minCoins: '最低コイン', bigCoins: '金色にするコイン', queuePriority: '通知の順番',
  maxCoins: '上限コイン', duration: '秒数', position: '縦の位置', align: '横の位置', sound: '効果音', volume: '音量',
  followText: 'フォローの文', shareText: 'シェアの文', rules: '条件ごとの上書き',
  shape: '入れ物の形', title: 'タイトル', label: '合計コインのラベル', maxItems: '最大個数', perGift: '連打1回の最大数',
  keep: '中身を残す', sizeMin: '小さい玉の倍率', sizeMax: '大きい玉の倍率', liquid: '中の液体', liquidColor: '液体の色',
  glassColor: 'ガラスの色', metric: '数えるもの', goal: '目標', start: '最初に足す数', step: '達成後に上げる幅',
  color: '色', doneColor: '達成後の色', avatars: 'アイコン', hideEmpty: '空なら隠す', limit: '人数',
  'wins.title': '見出し', 'wins.goal': '目標（0 で出さない）', 'wins.rules': 'ギフトで増減する条件', 'wins.style': '形',
  negative: 'マイナス WIN まで減らせる', lossPreset: '減ったときの段階の境目', gainPreset: '増えたときの段階の境目', clearFx: 'クリア（+1）を大きく祝う',
  bigGain: '増えたとき「大」になる数', hugeGain: '増えたとき「超」になる数', topGain: '増えたとき「最大」になる数', comboUp: '続けて減る・増えると段階を上げる', power: '演出の強さ（倍率）', minusAmbient: 'マイナスの間、画面の縁を赤く', celebrate: '目標達成などを全画面で祝う', bigLoss: '大妨害になる減り方', hugeLoss: '超妨害になる減り方', ruinLoss: '壊滅になる減り方',
  bigLossText: '大妨害の文字', hugeLossText: '超妨害の文字', ruinLossText: '壊滅の文字', winText: 'クリアの文字', milestone: '大きく祝う間隔',
  enabled: '連携する', 'rush.enabled': 'RUSH を使う', 'rush.gifts': '突入するギフト名（カンマ区切り）', enterCoins: '突入するコイン',
  extendMinCoins: '時間が延びるコイン', extendSeconds: '延びる秒数', maxSeconds: '最長の秒数', 'rush.duration': 'RUSH の秒数',
  'rush.text': '帯に流れる文字', enterText: '突入の文字', host: 'サーバーのアドレス', port: 'RCON のポート', password: 'RCON のパスワード',
  superstreamProfile: 'マイクラ側の演出プロフィール名', superstreamFile: 'マイクラ側の演出プロフィールのファイル',
  forwardGifts: 'ギフトをマイクラ側の演出に渡す',
  greenCoins: '緑になるコイン', redCoins: '赤（激アツ）になるコイン', goldCoins: '金になるコイン', rainbowCoins: '虹（確定）になるコイン',
  blueText: '青の文字', greenText: '緑の文字', redText: '赤の文字', goldText: '金の文字', rainbowText: '虹の文字',
  image: '帯に乗せる画像', character: 'キャラ画像', photo: '写真', word: '文字を出す', 'imageCutins.layout': '写真の置き方', yieldToImage: '画像付きが出るときは出さない', rouletteWin: 'ルーレットの演出を出す', slotWin: 'スロットの大当たりで出す', rouletteWinText: '当たりの文字', angle: '帯の傾き', shake: '揺れの強さ', freeze: 'フリーズ演出', lines: '集中線', show: '表示する数値', layout: '並べ方', labels: 'ラベル', hearts: 'ハート',
  textWeight: '文字の太さ', imageStyle: '画像のスタイル', crop: '切り抜き',
  premium: 'まれな柄を使う', premiumRate: '柄が出る割合（%）', premiumPatterns: '使う柄', promote: '昇格を見せる', promoteRate: '昇格の割合（%）', rushBoost: 'RUSH中は1段階上げる',
  bluePhoto: '青の写真', greenPhoto: '緑の写真', redPhoto: '赤の写真', goldPhoto: '金の写真', rainbowPhoto: '虹の写真',
  'bosses.name': 'ボスの名前', hp: '最大 HP', hpScale: '次のボスの HP の倍率', 'bosses.image': 'ボスの画像', damageFrom: 'ダメージにするもの',
  rankSource: '順位の参照', rivalCoins: '相手のコイン',
  'mediaAlerts.enabled': 'メディア通知を使う', 'gacha.enabled': 'ガチャを使う',
  'giftSounds.enabled': 'ギフト別サウンドを使う', 'giftSounds.masterVolume': '全体の音量', 'giftSounds.maxSeconds': '1回の最長（秒）', 'giftSounds.maxConcurrent': '同時に鳴らす数', 'giftSounds.rules': 'ルール',
  'gacha.minCoins': '何コインから回す', 'gacha.gifts': 'このギフトで回す', 'gacha.pity': '天井（この回数で確定）', 'gacha.tiers': 'レアリティと当たりやすさ',
  'gacha.freePerReset': '1人の無料回数', 'gacha.resetMode': '無料回数のリセット', 'gacha.freeRequires': '無料回数の条件',
  'gacha.paidRule': '有料回数のたまり方', 'gacha.command': '回すコメント', 'gacha.cooldownSec': '同じ人の間隔',
  'omikuji.enabled': 'おみくじを使う', 'omikuji.minCoins': '何コインから引く', 'omikuji.gifts': 'このギフトで引く', 'omikuji.tiers': '運勢と出やすさ',
  'omikuji.pickMode': '番号の選び方', 'omikuji.pickSeconds': '番号を待つ秒数', 'omikuji.timeoutMode': '時間切れのとき',
  'slots.enabled': 'スロットを使う', 'slots.trigger': '回すきっかけ', 'slots.symbols': '絵柄と重み', 'slots.payouts': '役・表示文・当選時の動作', 'slots.revivalRate': '当たりの復活割合', 'slots.nearMissRate': '外れのニアミス割合', 'slots.reelStopMs': 'リールの停止間隔', 'slots.idleMode': '待機中の表示',
  'votes.title': '見出し', 'votes.options': '選択肢（カンマ区切り）', 'votes.durationSeconds': '受付時間（秒）', 'votes.autoReveal': '時間で結果を出す', 'votes.resultActions': '結果が出たときの動作', 'votes.showNames': '投票した人の名前を出す', 'votes.sound': '効果音', 'votes.volume': '音量', 'votes.color': '色', 'cheers.title': '見出し', 'cheers.goal': '満タンまでのいいね', 'cheers.growth': '次の目標の倍率', 'cheers.loop': '満タン後も続ける', 'cheers.fullText': '満タンの文', 'cheers.fullActions': '満タンの動作', 'cheers.sound': '効果音', 'cheers.volume': '音量', 'cheers.color': 'ゲージの色', 'cheers.fullColor': '満タンの色',
  'pushButtons.label': 'ボタンの文字', 'pushButtons.seconds': '受付時間（秒）', 'pushButtons.keyword': '押しと数える言葉', 'pushButtons.likesPerPush': '何いいねで1押しか', 'pushButtons.steps': '段階の境目', 'pushButtons.blueActions': '青の動作', 'pushButtons.greenActions': '緑の動作', 'pushButtons.redActions': '赤の動作', 'pushButtons.goldActions': '金の動作', 'pushButtons.missText': '不発の文字', 'pushButtons.sound': '効果音', 'pushButtons.volume': '音量', 'pushButtons.color': '色',
  rollMs: '回転のミリ秒', revealMs: '結果のミリ秒', doneMs: '終了のミリ秒',
  coinDamage: '1 コインのダメージ', likeDamage: 'いいね 1 回のダメージ', 'bosses.gifts': 'ダメージにするギフト名（カンマ区切り。空なら全部）',
  bigHit: '大ダメージになるダメージ', lowHp: '赤く点滅する残り HP（%）', nextNames: '2体目からの名前（カンマ区切り）', autoNext: '倒したら次のボスを出す',
  nextDelay: '次のボスが出るまでの秒数', defeatText: '討伐の文字', 'bosses.roulette': '討伐で回すルーレット', commands: '討伐で Minecraft に送るコマンド（1行に1つ）',
  'bosses.superstreamGift': '討伐で起こすマイクラの演出（ギフト ID）', 'bosses.superstreamAction': '討伐で起こすマイクラの演出（種類）', 'bosses.color': 'HP の色',
  name: '表示名', style: '形', perCount: '個数分まわす', hold: '結果の秒数', hint: '案内文', palette: '自動の色の順番',
  pointerColor: '針の色', frameColor: '縁の色', fontScale: '文字の倍率', rushOdds: 'RUSH中は確率を変える', sameSize: '扇を同じ大きさにする', labelDirection: '文字の向き', slotLook: '3本スロットの見た目', chance: '当たりそうで当たらない演出', items: '中身',
  'chats.maxItems': '最大件数', 'chats.avatars': 'アイコンを出す', 'chats.color': '新しいコメントの帯の色', lifetime: '消すまでの秒数（0 で消さない）',
  fontSize: '文字の大きさ（px）', highlight: 'ギフトした人のコメントを目立たせる', showCoins: '送ったコインの合計を出す',
  gifterCoins: '目立たせるコイン（1段目・金の帯）', bigGifterCoins: '2段目（金の縁）のコイン', topGifterCoins: '3段目（金の面）のコイン',
  hideWords: 'NG ワード（カンマ区切り）', hideUsers: '隠すユーザー（ID か名前、カンマ区切り）', hideCommands: '「!」で始まるコマンドを隠す',
  tts: '読み上げる', ttsSkipBadWords: '悪口は読み上げない', ttsRate: '読み上げの速さ', ttsVolume: '読み上げの音量', ttsName: '名前も読む', ttsGiftersOnly: 'ギフトした人だけ読み上げる',
  'timers.title': '見出し', startMinutes: '初めの時間（分）', maxHours: '上限（時間。0 で上限なし）', coinSeconds: '1 コインで延びる秒数',
  'timers.minCoins': '延びる最低コイン', 'timers.rules': '指定のギフトで延ばす（YAML）', followSeconds: 'フォローで延びる秒数',
  shareSeconds: 'シェアで延びる秒数', likeEvery: 'いいね何回ごとに延ばすか（0 で延ばさない）', likeSeconds: 'いいねで延びる秒数',
  pausedExtend: '一時停止中もギフトで延びる', 'timers.hint': '案内文（空なら自動）', showHint: '案内文と延長の合計を出す',
  'timers.avatars': '延ばした人のアイコン', warnMinutes: '時計を朱にする残り（分）', dangerMinutes: '赤く脈打つ残り（分）', endText: '0 になったときの文字',
  'commentSlide.trigger1': 'きっかけの言葉1', 'commentSlide.text1': '出す言葉1', 'commentSlide.trigger2': 'きっかけの言葉2', 'commentSlide.text2': '出す言葉2', 'commentSlide.trigger3': 'きっかけの言葉3', 'commentSlide.text3': '出す言葉3', 'commentSlide.trigger4': 'きっかけの言葉4', 'commentSlide.text4': '出す言葉4', 'commentSlide.trigger5': 'きっかけの言葉5', 'commentSlide.text5': '出す言葉5', 'commentSlide.seconds': '出す秒数', 'commentSlide.color': '帯の色',
};

// puchun.html の presets.js と同じ順・キーで、ダッシュボードに字の欄を出す。
export const PUCHUN_TEXT_FIELDS = {
  chance: [{ key: 'main', label: '大きい字', def: 'チャンス!' }, { key: 'sub', label: '帯の字', def: 'ギフトありがとう!' }],
  cutin: [{ key: 'say', label: 'セリフ', def: 'いくぞ!', max: 14 }, { key: 'main', label: '決めの字', def: '激アツ' }],
  jackpot: [{ key: 'num', label: 'そろう図柄', def: '777', max: 5 }, { key: 'main', label: '決めの字', def: '大当たり' }, { key: 'sub', label: '帯の字', def: 'ギフトありがとう!' }],
  puchun: [{ key: 'main', label: '決めの字', def: 'ナイス,ギフト' }],
};
// フォームの上に出す、よく使う設定
export const BASIC = {
  alerts: ['events', 'gifts', 'minCoins', 'bigCoins', 'style', 'queuePriority', 'position', 'align', 'rules'],
  chats: ['style', 'maxItems', 'lifetime', 'fontSize', 'avatars', 'highlight', 'hideWords', 'hideUsers', 'hideCommands', 'tts', 'ttsGiftersOnly'],
  roulettes: ['name', 'style', 'slotLook', 'gifts', 'minCoins', 'events', 'rushOdds', 'sameSize', 'chance', 'labelDirection', 'items'],
  jars: ['shape', 'title', 'gifts', 'minCoins', 'liquid', 'liquidColor'],
  counters: ['show', 'layout', 'align', 'color'],
  goals: ['title', 'metric', 'goal', 'step', 'color'],
  rankings: ['title', 'metric', 'limit', 'avatars'],
  cutins: ['minCoins', 'greenCoins', 'redCoins', 'goldCoins', 'rainbowCoins', 'gifts', 'premium', 'premiumRate', 'premiumPatterns', 'promote', 'promoteRate', 'rushBoost', 'word', 'textWeight', 'yieldToImage', 'rouletteWin', 'rouletteWinText', 'slotWin'],
  puchuns: ['preset', 'ratio', 'charImage', 'texts', 'gifts', 'minCoins', 'maxCoins'],
  imageCutins: ['photo', 'bluePhoto', 'greenPhoto', 'redPhoto', 'goldPhoto', 'rainbowPhoto', 'imageStyle', 'crop', 'layout', 'minCoins', 'greenCoins', 'redCoins', 'goldCoins', 'rainbowCoins', 'gifts', 'premium', 'premiumRate', 'premiumPatterns', 'promote', 'promoteRate', 'rushBoost'],
  wins: ['title', 'goal', 'rules', 'negative', 'lossPreset', 'gainPreset', 'comboUp', 'power', 'clearFx', 'minusAmbient', 'celebrate', 'winText', 'milestone', 'style', 'color'],
  timers: ['title', 'startMinutes', 'maxHours', 'coinSeconds', 'minCoins', 'rules', 'followSeconds', 'likeEvery', 'likeSeconds'],
  bosses: ['name', 'mode', 'rankSource', 'rivalCoins', 'hp', 'hpScale', 'image', 'damageFrom', 'coinDamage', 'likeDamage', 'gifts', 'nextNames', 'roulette', 'commands'],
  rush: ['enabled', 'gifts', 'enterCoins', 'duration', 'extendMinCoins', 'extendSeconds', 'maxSeconds', 'text', 'enterText'],
  mediaAlerts: ['enabled', 'rules'],
  giftSounds: ['enabled', 'masterVolume', 'maxSeconds', 'maxConcurrent', 'rules'],
  gacha: ['enabled', 'minCoins', 'gifts', 'freePerReset', 'resetMode', 'freeRequires', 'paidRule', 'command', 'cooldownSec', 'pity', 'tiers'],
  omikuji: ['enabled', 'displayMode', 'resultFont', 'minCoins', 'gifts', 'pickMode', 'pickSeconds', 'timeoutMode', 'tiers'],
  slots: ['enabled', 'trigger', 'look', 'symbols', 'payouts', 'revivalRate', 'nearMissRate', 'reelStopMs', 'idleMode'],
  votes: ['title', 'options', 'durationSeconds', 'autoReveal', 'resultActions', 'showNames', 'sound', 'volume', 'color'],
  cheers: ['title', 'goal', 'growth', 'loop', 'fullText', 'fullActions', 'sound', 'volume', 'color', 'fullColor'],
  pushButtons: ['label', 'seconds', 'keyword', 'likesPerPush', 'steps', 'blueActions', 'greenActions', 'redActions', 'goldActions', 'missText', 'sound', 'volume', 'color'],
  commentSlide: ['trigger1', 'text1', 'trigger2', 'text2', 'trigger3', 'text3', 'trigger4', 'text4', 'trigger5', 'text5', 'seconds', 'color'],
  minecraft: ['enabled', 'host', 'port', 'password', 'superstreamProfile', 'superstreamFile', 'forwardGifts', 'rules'],
};
// WIN数の演出の段階の境目（src/wins.js の LOSS_PRESETS と同じ）
export const LOSS_PRESETS = { large: [10, 100, 1000], medium: [3, 10, 30], small: [1, 3, 5] };
export const lossSteps = (e) => {
  const nums = e.lossPreset === 'custom' ? [e.bigLoss, e.hugeLoss, e.ruinLoss] : LOSS_PRESETS[e.lossPreset] ?? LOSS_PRESETS.large;
  return [e.bigLossText, e.hugeLossText, e.ruinLossText].map((t, i) => [t ?? '', nums[i] ?? 10]);
};
export const gainSteps = (e) => {
  const nums = e.gainPreset === 'custom' ? [e.bigGain, e.hugeGain, e.topGain] : LOSS_PRESETS[e.gainPreset] ?? LOSS_PRESETS.large;
  return ['大', '超', '最大'].map((t, i) => [t, nums[i] ?? 10]);
};
export const TOKEN_LABELS = { accent: '朱（accent）', gold: '金（gold）', ink: '墨（ink）', 'ink-2': '墨2（ink-2）', paper: '白（paper）' };
