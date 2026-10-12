// ダッシュボードの設定エディタ。config.yaml をフォームと YAML の両方から編集する。
// フォームの変更は1項目ずつ PATCH /api/config で保存する（ファイルのコメントは残る）。

import { icon, mediaUrl, BASE } from '/widgets/lib/overlay.js';
import { copyText, flashCopied } from './common.js';
import { WEIGHT_INPUT, parseWeight } from './weight.js';
import { GROUPS, INFO, SIMPLE, SIMPLE_LABELS, UNITS, summaryOf, presetActive } from './simple.js';
import { createStage } from './stage.js';
import { rulesEditor, hasRulesEditor } from './rules.js';
import { giftPicker } from './gift-picker.js';
import { TIMER_COIN_SECONDS } from './timer-length.js';

const $ = (id) => document.getElementById(id);
const TABS = ['alerts', 'chats', 'cutins', 'imageCutins', 'roulettes', 'jars', 'rankings', 'counters', 'goals', 'wins', 'timers', 'bosses', 'rush', 'minecraft', 'theme'];

// 選択肢の表示名
const ENUM_LABELS = {
  dark: 'ダーク', light: 'ライト', top: '上', center: '中央', bottom: '下', left: '左', right: '右',
  jar: '保存瓶', heart: 'ハート', potion: 'エリクサーのフラスコ', auto: '自動', on: '表示', off: '表示しない',
  wheel: '丸（ホイール）', strip: '横スライド', row: '横', column: '縦',
  follows: 'フォロー', likes: 'いいね', diamonds: 'コイン', gifts: 'ギフト数', shares: 'シェア', comments: 'コメント', viewers: '視聴者',
  gift: 'ギフト', follow: 'フォロー', share: 'シェア', like: 'いいね', coins: 'コイン',
  avatar: '送った人のアイコン', band: '色の帯', photo: '写真の帯（縁が木炭）', 'image.photo': '写真（なければ何も乗せない）', 'image.gift': 'ギフトの画像',
  plate: '横長の板', big: '大きい数字',
  'lossPreset.large': '大きく減る配信（-10 大妨害 / -100 超妨害 / -1000 壊滅）', 'lossPreset.medium': '中くらい（-3 / -10 / -30）',
  'lossPreset.small': '-1 から派手に（-1 / -3 / -5）', 'lossPreset.custom': '自分で決める（下の詳しい設定）',
  'gainPreset.large': '大きく増える配信（+10 大 / +100 超 / +1000 最大）', 'gainPreset.medium': '中くらい（+3 / +10 / +30）',
  'gainPreset.small': '+1 から派手に（+1 / +3 / +5）', 'gainPreset.custom': '自分で決める（下の詳しい設定）',
  inside: '帯の中いっぱい（縁が木炭）', side: '帯の横に大きく乗る',
  telop: 'テロップ風（下から積み上がる一覧）', bubble: '吹き出し風',
};
// 項目の短い名前（説明は下に小さく出す）
const LABELS = {
  mode: 'モード', accent: '差し色（朱）', gold: '金', ink: '墨', paper: '白', scale: '拡大率',
  events: '反応するイベント', gifts: 'ギフト名（カンマ区切り）', minCoins: '最低コイン', bigCoins: '金色にするコイン',
  maxCoins: '上限コイン', duration: '秒数', position: '縦の位置', align: '横の位置', sound: '効果音', volume: '音量',
  followText: 'フォローの文', shareText: 'シェアの文', rules: '条件ごとの上書き（YAML）',
  shape: '入れ物の形', title: 'タイトル', label: '合計コインのラベル', maxItems: '最大個数', perGift: '連打1回の最大数',
  keep: '中身を残す', sizeMin: '小さい玉の倍率', sizeMax: '大きい玉の倍率', liquid: '中の液体', liquidColor: '液体の色',
  glassColor: 'ガラスの色', metric: '数えるもの', goal: '目標', start: '最初に足す数', step: '達成後に上げる幅',
  color: '色', doneColor: '達成後の色', avatars: 'アイコン', hideEmpty: '空なら隠す', limit: '人数',
  'wins.title': '見出し', 'wins.goal': '目標（0 で出さない）', 'wins.rules': 'ギフトで増減するルール（YAML）', 'wins.style': '形',
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
  image: '帯に乗せる画像', character: 'キャラ画像', photo: '写真', word: '文字を出す', 'imageCutins.layout': '写真の置き方', yieldToImage: '画像付きが出るときは出さない', angle: '帯の傾き', shake: '揺れの強さ', freeze: 'フリーズ演出', lines: '集中線', show: '表示する数値', layout: '並べ方', labels: 'ラベル', hearts: 'ハート',
  'bosses.name': 'ボスの名前', hp: '最大 HP', hpScale: '次のボスの HP の倍率', 'bosses.image': 'ボスの画像', damageFrom: 'ダメージにするもの',
  coinDamage: '1 コインのダメージ', likeDamage: 'いいね 1 回のダメージ', 'bosses.gifts': 'ダメージにするギフト名（カンマ区切り。空なら全部）',
  bigHit: '大ダメージになるダメージ', lowHp: '赤く点滅する残り HP（%）', nextNames: '2体目からの名前（カンマ区切り）', autoNext: '倒したら次のボスを出す',
  nextDelay: '次のボスが出るまでの秒数', defeatText: '討伐の文字', 'bosses.roulette': '討伐で回すルーレット', commands: '討伐で Minecraft に送るコマンド（1行に1つ）',
  'bosses.superstreamGift': '討伐で起こすマイクラの演出（ギフト ID）', 'bosses.superstreamAction': '討伐で起こすマイクラの演出（種類）', 'bosses.color': 'HP の色',
  name: '表示名', style: '形', perCount: '個数分まわす', hold: '結果の秒数', hint: '案内文', palette: '自動の色の順番',
  pointerColor: '針の色', frameColor: '縁の色', fontScale: '文字の倍率', items: '項目',
  'chats.maxItems': '最大件数', 'chats.avatars': 'アイコンを出す', 'chats.color': '新しいコメントの帯の色', lifetime: '消すまでの秒数（0 で消さない）',
  fontSize: '文字の大きさ（px）', highlight: 'ギフトした人のコメントを目立たせる', showCoins: '送ったコインの合計を出す',
  gifterCoins: '目立たせるコイン（1段目・金の帯）', bigGifterCoins: '2段目（金の縁）のコイン', topGifterCoins: '3段目（金の面）のコイン',
  hideWords: 'NG ワード（カンマ区切り）', hideUsers: '隠すユーザー（ID か名前、カンマ区切り）', hideCommands: '「!」で始まるコマンドを隠す',
  tts: '読み上げる', ttsRate: '読み上げの速さ', ttsVolume: '読み上げの音量', ttsName: '名前も読む', ttsGiftersOnly: 'ギフトした人だけ読み上げる',
  'timers.title': '見出し', startMinutes: '初めの時間（分）', maxHours: '上限（時間。0 で上限なし）', coinSeconds: '1 コインで延びる秒数',
  'timers.minCoins': '延びる最低コイン', 'timers.rules': '指定のギフトで延ばす（YAML）', followSeconds: 'フォローで延びる秒数',
  shareSeconds: 'シェアで延びる秒数', likeEvery: 'いいね何回ごとに延ばすか（0 で延ばさない）', likeSeconds: 'いいねで延びる秒数',
  pausedExtend: '一時停止中もギフトで延びる', 'timers.hint': '案内文（空なら自動）', showHint: '案内文と延長の合計を出す',
  'timers.avatars': '延ばした人のアイコン', warnMinutes: '時計を朱にする残り（分）', dangerMinutes: '赤く脈打つ残り（分）', endText: '0 になったときの文字',
};
// フォームの上に出す、よく使う設定
const BASIC = {
  alerts: ['events', 'gifts', 'minCoins', 'bigCoins', 'position', 'align', 'rules'],
  chats: ['style', 'maxItems', 'lifetime', 'fontSize', 'avatars', 'highlight', 'hideWords', 'hideUsers', 'hideCommands', 'tts', 'ttsGiftersOnly'],
  roulettes: ['name', 'style', 'gifts', 'minCoins', 'events', 'items'],
  jars: ['shape', 'title', 'gifts', 'minCoins', 'liquid', 'liquidColor'],
  counters: ['show', 'layout', 'align', 'color'],
  goals: ['title', 'metric', 'goal', 'step', 'color'],
  rankings: ['title', 'metric', 'limit', 'avatars'],
  cutins: ['minCoins', 'greenCoins', 'redCoins', 'goldCoins', 'rainbowCoins', 'gifts', 'word', 'yieldToImage'],
  imageCutins: ['photo', 'layout', 'minCoins', 'greenCoins', 'redCoins', 'goldCoins', 'rainbowCoins', 'gifts'],
  wins: ['title', 'goal', 'rules', 'negative', 'lossPreset', 'gainPreset', 'comboUp', 'power', 'clearFx', 'minusAmbient', 'celebrate', 'winText', 'milestone', 'style', 'color'],
  timers: ['title', 'startMinutes', 'maxHours', 'coinSeconds', 'minCoins', 'rules', 'followSeconds', 'likeEvery', 'likeSeconds'],
  bosses: ['name', 'hp', 'hpScale', 'image', 'damageFrom', 'coinDamage', 'likeDamage', 'gifts', 'nextNames', 'roulette', 'commands'],
  rush: ['enabled', 'gifts', 'enterCoins', 'duration', 'extendMinCoins', 'extendSeconds', 'maxSeconds', 'text', 'enterText'],
  minecraft: ['enabled', 'host', 'port', 'password', 'superstreamProfile', 'superstreamFile', 'forwardGifts', 'rules'],
};
// WIN数の演出の段階の境目（src/wins.js の LOSS_PRESETS と同じ）
const LOSS_PRESETS = { large: [10, 100, 1000], medium: [3, 10, 30], small: [1, 3, 5] };
const lossSteps = (e) => {
  const nums = e.lossPreset === 'custom' ? [e.bigLoss, e.hugeLoss, e.ruinLoss] : LOSS_PRESETS[e.lossPreset] ?? LOSS_PRESETS.large;
  return [e.bigLossText, e.hugeLossText, e.ruinLossText].map((t, i) => [t ?? '', nums[i] ?? 10]);
};
const gainSteps = (e) => {
  const nums = e.gainPreset === 'custom' ? [e.bigGain, e.hugeGain, e.topGain] : LOSS_PRESETS[e.gainPreset] ?? LOSS_PRESETS.large;
  return ['大', '超', '最大'].map((t, i) => [t, nums[i] ?? 10]);
};
const TOKEN_LABELS = { accent: '朱（accent）', gold: '金（gold）', ink: '墨（ink）', 'ink-2': '墨2（ink-2）', paper: '白（paper）' };

export function createEditor({ api, setMessage }) {
  let schema = null;
  let payload = null; // GET /api/config の結果
  let media = [];
  let gifts = [];
  let tab = TABS[0];
  let me = { mode: 'local' }; // 配信者ごとの URL のときは、使うウィジェットと豪華な演出の状態（/api/me）
  let id = null;
  let yamlDirty = false;
  let superstream = { gifts: [] };
  let stage = null;
  // 「かんたん」は、左のサイドバーで選ぶと右が切り替わる:
  //   detail（ウィジェット1つの設定）/ catalog（出すものを足す）/ obs（OBS に入れる URL）/ ai（AI にたのむ）
  // 「くわしく」は今までのタブとフォーム
  let mode = 'simple';
  let view = 'obs';
  let live = false; // TikTok につないでいる間は、テスト送信は画面に出るだけ
  const simple = () => mode === 'simple';
  const isObj = (t) => schema.sections[t]?.kind === 'object';

  const store = {
    get: (k, d) => {
      try {
        return JSON.parse(localStorage.getItem(`tw:${k}`)) ?? d;
      } catch {
        return d;
      }
    },
    set: (k, v) => {
      try {
        localStorage.setItem(`tw:${k}`, JSON.stringify(v));
      } catch {}
    },
  };

  // --- 保存 ---

  const timers = new Map();
  function patch(path, body, delay = 0) {
    const key = path.join('.');
    clearTimeout(timers.get(key));
    timers.set(
      key,
      setTimeout(async () => {
        const res = await fetch('/api/config', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path, ...body }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.config) payload = data;
        // WIN数・延長タイマー・ボス討伐の「試す」ボタンは設定で変わる
        if (data.config && (tab === 'wins' || tab === 'timers' || tab === 'bosses')) renderActions();
        showIssues(data.errors, data.warnings, data.ok ? '保存しました' : null);
        updateUrl();
        if (!yamlDirty && data.yaml) $('yamlText').value = data.yaml;
      }, delay),
    );
  }
  const save = (key, value, delay = 0) => patch(pathOf(key), { value }, delay);
  const pathOf = (key) => (isObj(tab) ? [tab, key] : [tab, id, key]);

  function showIssues(errors = [], warnings = [], ok) {
    const el = $('formMessage');
    el.replaceChildren();
    el.className = 'form-message';
    if (errors.length) {
      el.classList.add('error');
      el.append('保存していません: ', errors.join(' / '));
    } else if (warnings.length) {
      el.append(`注意: ${warnings.join(' / ')}`);
    } else if (ok) {
      el.classList.add('ok');
      el.append(icon('check'), ok);
      clearTimeout(showIssues.t);
      showIssues.t = setTimeout(() => el.replaceChildren(), 1600);
    }
  }

  async function reload() {
    payload = await api('/api/config');
    if (!yamlDirty) $('yamlText').value = payload.yaml;
    renderYamlIssues(payload.errors, payload.warnings);
  }

  // --- タブと名前 ---

  function entriesOf(section) {
    return Object.keys(payload?.config?.[section] ?? {});
  }

  // --- 使うウィジェット（配信者ごとの URL のとき） ---

  const isTenant = () => me.mode === 'tenant';
  const usesMinecraft = () => (isTenant() ? me.widgets.includes('minecraft') && unlocked('minecraft') : payload.config.minecraft?.enabled === true);
  const isMinecraftField = (section, key) =>
    (section === 'bosses' && ['commands', 'superstreamGift', 'superstreamAction'].includes(key)) ||
    (section === 'minecraft' && ['host', 'port', 'password', 'superstreamProfile', 'superstreamFile'].includes(key));
  // 管理者が使えなくしているものは選べない（1人で使うときは全部使える）
  const unlocked = (section) => !isTenant() || me.access?.[section]?.on !== false;
  /** タブに出すもの: 1人で使うときは全部、配信者ごとのときは選んだものとテーマ */
  const visibleTabs = () => (isTenant() ? TABS.filter((s) => s === 'theme' || (me.widgets.includes(s) && unlocked(s))) : TABS);

  const untilText = (st) => {
    if (!st?.on) return '';
    if (st.until == null) return '';
    const h = Math.max(0, (st.until - Date.now()) / 3600_000);
    return h < 1 ? `あと${Math.max(1, Math.round(h * 60))}分` : `あと${Math.round(h)}時間`;
  };

  function renderPicker() {
    const box = $('picker');
    if (!box) return;
    box.hidden = !isTenant();
    if (!isTenant()) return;
    box.replaceChildren();
    const head = document.createElement('div');
    head.className = 'picker-head';
    head.textContent = '使うウィジェット';
    box.append(head);
    const chips = document.createElement('div');
    chips.className = 'picker-chips';
    for (const section of TABS.filter((s) => s !== 'theme')) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pick pressable';
      const on = me.widgets.includes(section);
      const open = unlocked(section);
      b.setAttribute('aria-pressed', String(on && open));
      if (!open) {
        b.disabled = true;
        b.classList.add('locked');
        b.title = '管理者が使えるようにすると選べます';
        b.append(icon('lock'));
      } else if (on) {
        b.append(icon('check'));
      }
      b.append(schema.sections[section].title);
      const left = untilText(me.access?.[section]);
      if (left) b.append(Object.assign(document.createElement('small'), { textContent: left }));
      b.addEventListener('click', async () => {
        const next = on ? me.widgets.filter((w) => w !== section) : [...me.widgets, section];
        try {
          me = await api('/api/me/widgets', { widgets: next }, 'PUT');
          renderPicker();
          select(visibleTabs().includes(tab) ? tab : on ? visibleTabs()[0] : section);
        } catch (err) {
          setMessage(err.message, true);
        }
      });
      chips.append(b);
    }
    // WIN数の全画面演出（ウィジェットの選択ではなく、使えるかどうかだけ）
    const fx = me.access?.winsFx;
    const info = document.createElement('span');
    info.className = `pick info${fx?.on ? '' : ' locked'}`;
    info.append(icon(fx?.on ? 'sparkles' : 'lock'), 'WIN数の全画面演出');
    if (untilText(fx)) info.append(Object.assign(document.createElement('small'), { textContent: untilText(fx) }));
    if (!fx?.on) info.title = '管理者が使えるようにすると使えます';
    chips.append(info);
    box.append(chips);
    const note = document.createElement('p');
    note.className = 'hint';
    note.textContent = '🔒 の付いたものは、管理者が使えるようにすると選べます。';
    box.append(note);
  }

  function renderTabs() {
    const tabs = $('tabs');
    tabs.replaceChildren();
    for (const section of visibleTabs()) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pressable';
      b.role = 'tab';
      b.textContent = schema.sections[section].title;
      b.setAttribute('aria-selected', String(section === tab));
      b.addEventListener('click', () => select(section));
      tabs.append(b);
    }
  }

  function select(section, nextId) {
    if (!visibleTabs().includes(section)) section = visibleTabs()[0];
    tab = section;
    store.set('tab', tab);
    const ids = entriesOf(section);
    id = nextId ?? (ids.includes(store.get(`id:${section}`)) ? store.get(`id:${section}`) : ids[0] ?? null);
    if (id) store.set(`id:${section}`, id);
    renderTabs();
    render();
  }

  // --- かんたん / くわしく ---

  function setMode(next, { keepView = false } = {}) {
    // 「くわしく」は「かんたん」にまとめた（細かい項目は各ウィジェットの「ほかの項目」、YAML は「設定ファイル」）
    mode = 'simple';
    store.set('mode', mode);
    document.body.dataset.mode = mode;
    if (mode === 'advanced') restoreChrome();
    if (!keepView) view = mode === 'simple' ? 'obs' : 'detail';
    if (payload) select(tab);
  }

  /** カードを押した: 使っていなければ使うものに足して、設定を開く */
  async function openCard(section) {
    if (isTenant() && section !== 'theme' && !me.widgets.includes(section)) {
      try {
        me = await api('/api/me/widgets', { widgets: [...me.widgets, section] }, 'PUT');
        renderPicker();
      } catch (err) {
        return setMessage(err.message, true);
      }
    }
    view = 'detail';
    select(section);
    $('widgetsPanel').scrollIntoView({ block: 'start', behavior: 'smooth' });
  }

  /** 使うのをやめる（配信者ごとの URL のとき） */
  async function dropCard(section) {
    try {
      me = await api('/api/me/widgets', { widgets: me.widgets.filter((w) => w !== section) }, 'PUT');
      renderPicker();
      view = 'detail';
      select(visibleTabs()[0]);
    } catch (err) {
      setMessage(err.message, true);
    }
  }

  // 一覧の1行（アイコン・名前・ひとこと・右向きの矢印）
  function listRow({ iconName, title, sub, onClick, trailing = 'chevron-right' }) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'srow pressable';
    const main = document.createElement('span');
    main.className = 'srow-main';
    main.append(Object.assign(document.createElement('span'), { className: 'srow-title', textContent: title }));
    if (sub) main.append(Object.assign(document.createElement('span'), { className: 'srow-sub', textContent: sub }));
    if (iconName) b.append(icon(iconName));
    b.append(main);
    if (trailing) b.append(Object.assign(icon(trailing), { className: 'icon srow-go' }));
    b.addEventListener('click', onClick);
    return b;
  }
  function listGroup(title, rows) {
    const g = document.createElement('div');
    g.className = 'sgroup';
    if (title) g.append(Object.assign(document.createElement('p'), { className: 'sgroup-title', textContent: title }));
    const body = document.createElement('div');
    body.className = 'sgroup-body';
    body.append(...rows);
    g.append(body);
    return g;
  }
  function viewHead(title, desc) {
    const head = document.createElement('div');
    head.className = 'view-title';
    head.append(Object.assign(document.createElement('h3'), { textContent: title }));
    if (desc) head.append(Object.assign(document.createElement('p'), { className: 'desc', textContent: desc }));
    return head;
  }
  const goTo = (next) => () => {
    view = next;
    render();
  };

  /** いま画面に出しているもの（配信者ごとの URL では選んだもの、1人で使うときは設定があるもの） */
  function usedSections() {
    const all = TABS.filter((t) => t !== 'theme');
    if (isTenant()) return all.filter((t) => me.widgets.includes(t) && unlocked(t));
    return all.filter((t) => (isObj(t) ? payload.config[t]?.enabled !== false : entriesOf(t).length > 0));
  }
  /** OBS に入れる URL（かんたん用: ルーレットは全部まとめた1つだけ） */
  function obsList() {
    const used = usedSections();
    return payload.widgets.filter((w) => {
      if (w.section === 'all') return true;
      if (!used.includes(w.section)) return false;
      if (w.section === 'roulettes') return w.id === '*';
      if (w.extra) return !isTenant() || me.access?.winsFx?.on;
      return true;
    });
  }
  const obsTitle = (w) => {
    const def = schema.sections[w.section];
    if (w.section === 'roulettes') return 'ルーレット';
    const base = w.extra ? w.title.split(':')[0] : def.title;
    const names = entriesOf(w.section);
    return w.id && names.length > 1 ? `${base} ${names.indexOf(w.id) + 1}` : base;
  };

  // サイドバー: いつも出ていて、押すと右が切り替わる（スマホでは横に流れるボタンの列になる）
  function renderNav() {
    const side = $('side');
    const topbar = document.querySelector('.topbar');
    const brand = topbar.querySelector('.brand') || document.querySelector('.brand');
    const nav = $('nav');
    const themeBtn = $('themeBtn');
    const connection = $('connectionSection');
    const desktop = window.matchMedia('(min-width: 900px)').matches;
    const used = usedSections();
    const item = (iconName, label, current, onClick, cls = '') => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `side-item pressable ${cls}`;
      b.setAttribute('aria-current', String(current));
      b.append(icon(iconName), Object.assign(document.createElement('span'), { textContent: label }));
      b.addEventListener('click', onClick);
      return b;
    };
    const label = (text) => Object.assign(document.createElement('p'), { className: 'side-label', textContent: text });
    const onDetail = (t) => view === 'detail' && tab === t;
    const menu = document.createElement('div');
    menu.className = 'side-menu';
    menu.append(
      item('monitor-up', 'OBSに入れるURL', view === 'obs', goTo('obs'), 'side-stage'),
      item('sparkles', 'AI にたのむ', view === 'ai', goTo('ai'), 'side-ai'),
      label('配信画面に出すもの'),
      ...used.map((t) => item(INFO[t].icon, schema.sections[t].title, onDetail(t), () => openCard(t))),
      item('plus', '出すものを選ぶ', view === 'catalog', goTo('catalog')),
      label('じゅんび'),
      item('monitor-up', '1つにまとめる', view === 'stage', goTo('stage')),
      ...(isTenant() ? [item('sparkles', '遊び方をえらびなおす', false, async () => { await api('/api/me/template', { template: null }, 'PUT'); me = await api('/api/me'); view = 'stage'; renderNav(); stage?.render(); })] : []),
      item(INFO.theme.icon, '色とテーマ', onDetail('theme'), () => openCard('theme')),
      item('file-code', '設定ファイル', view === 'files', goTo('files')),
    );
    if (desktop) {
      const head = document.createElement('div');
      head.className = 'side-head';
      head.append(brand);
      const footer = document.createElement('div');
      footer.className = 'side-footer';
      footer.append(nav, themeBtn);
      side.replaceChildren(head, connection, menu, footer);
    } else {
      const col = document.querySelector('.col');
      topbar.prepend(brand);
      topbar.append(nav, themeBtn);
      col.prepend(connection);
      side.replaceChildren(menu);
    }
    // スマホの横並びでは、選んでいるものが見えるところまで流す
    side.querySelector('[aria-current=true]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function restoreChrome() {
    const topbar = document.querySelector('.topbar');
    const col = document.querySelector('.col');
    topbar.prepend(document.querySelector('.brand'));
    topbar.append($('nav'), $('themeBtn'));
    col.prepend($('connectionSection'));
  }

  // 出すものを選ぶ: 目的ごとに並べる（配信者ごとの URL では、押すと出す・出さないが切り替わる）
  function renderCatalog() {
    const box = $('cards');
    const used = usedSections();
    box.replaceChildren(viewHead('出すものを選ぶ', isTenant() ? '押すと出す・出さないが切り替わります。出さないものの設定は消えずに残ります。' : '使いたいものを押すと、左に入って設定できるようになります。'));
    for (const [title, sections] of GROUPS) {
      // 配信者ごとの URL では、使っているものも並べて、押すと出さないようにできる
      const rest = isTenant() ? sections : sections.filter((t) => !used.includes(t));
      if (!rest.length) continue;
      const group = document.createElement('div');
      group.className = 'card-group';
      group.append(Object.assign(document.createElement('p'), { className: 'card-group-title', textContent: title }));
      const grid = document.createElement('div');
      grid.className = 'card-grid';
      for (const section of rest) {
        const open = unlocked(section);
        const on = used.includes(section);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `card pressable${open ? '' : ' locked'}${on ? ' used' : ''}`;
        b.setAttribute('aria-pressed', String(on));
        b.disabled = !open;
        const head = document.createElement('span');
        head.className = 'card-head';
        head.append(icon(INFO[section].icon), Object.assign(document.createElement('span'), { className: 'card-title', textContent: schema.sections[section].title }));
        const state = document.createElement('span');
        state.className = 'card-state';
        if (open && on) state.append(icon('check'), '出している（押すと出さない）');
        else if (open) state.append(icon('plus'), '使う');
        else state.append(icon('lock'), '管理者に頼むと使えます');
        b.append(head, Object.assign(document.createElement('span'), { className: 'card-desc', textContent: INFO[section].desc }), state);
        b.addEventListener('click', async () => {
          if (!on) return openCard(section);
          await dropCard(section);
          view = 'catalog';
          render();
        });
        grid.append(b);
      }
      group.append(grid);
      box.append(group);
    }
  }

  // OBS に入れる URL をまとめて見る
  function renderObs() {
    const box = $('cards');
    const sample = document.createElement('div'); sample.className = 'sample-control';
    const sampleRow = document.createElement('label'); sampleRow.className = 'check';
    const sampleBtn = document.createElement('input'); sampleBtn.type = 'checkbox'; sampleBtn.setAttribute('aria-label', '見本を出す');
    const sampleLabel = document.createElement('span'); sampleLabel.textContent = '見本を出す';
    sampleRow.append(sampleLabel, sampleBtn);
    const sampleText = document.createElement('p'); sampleText.className = 'hint';
    const updateSample = (s) => { sampleBtn.checked = Boolean(s.on); sampleText.textContent = s.on && s.until ? `あと ${Math.max(1, Math.ceil((s.until - Date.now()) / 60000))} 分` : '場所と大きさを決めるときに使います。15分で自動で消えます（配信中は出ません）'; };
    sampleBtn.onchange = async () => { try { updateSample(await api('/api/sample', { on: sampleBtn.checked }, 'POST')); } catch (e) { sampleBtn.checked = false; setMessage(e.message, true); } };
    api('/api/sample').then(updateSample).catch(() => {}); sample.append(sampleRow, sampleText);
    const rows = obsList().filter((w) => w.section !== 'all').map((w) => {
      const row = document.createElement('div');
      row.className = 'srow url-item';
      const main = document.createElement('span');
      main.className = 'srow-main';
      const full = w.size[0] === 1080 && w.size[1] === 1920;
      main.append(
        Object.assign(document.createElement('span'), { className: 'srow-title', textContent: obsTitle(w) }),
        Object.assign(document.createElement('span'), { className: 'srow-sub', textContent: `幅 ${w.size[0]}・高さ ${w.size[1]}${full ? '（配信画面いっぱいに重ねる）' : ''}` }),
      );
      const label = document.createTextNode('コピー');
      const copy = chip(label, 'copy', () => {
        copyText(w.url);
        flashCopied(copy, label);
      });
      const setting = chip('', 'settings-2', () => { view = 'detail'; select(w.section, w.id === '*' ? undefined : w.id); });
      setting.setAttribute('aria-label', `${obsTitle(w)}の設定`);
      row.append(icon(INFO[w.section].icon), main, copy, setting);
      return row;
    });
    box.replaceChildren(viewHead('OBSに入れるURL', 'コピーしたURLを、OBS や TikTok LIVE Studio の「ブラウザ」ソースに貼ると配信画面に出ます'), sample);
    if (rows.length) box.append(listGroup('コピーして貼るURL（1つにつき1ソース）', rows));
    else box.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'まだ出すものがありません。左の「出すものを選ぶ」から選んでください。' }));
    const all = obsList().find((w) => w.section === 'all');
    if (all) { const link = Object.assign(document.createElement('button'), { className: 'text-btn pressable', type: 'button', textContent: '1つにまとめて入れたいときは「1つにまとめる」へ' }); link.onclick = goTo('stage'); box.append(link); }
  }

  /** 押すとまとめて値が入る「型」 */
  function presetRow(preset, values) {
    const wrap = document.createElement('div');
    wrap.className = 'field presets';
    wrap.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: preset.title }));
    const chips = document.createElement('div');
    chips.className = 'preset-chips';
    for (const opt of preset.options) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'preset pressable';
      b.textContent = opt.label;
      b.setAttribute('aria-pressed', String(presetActive(values, opt.value)));
      b.addEventListener('click', async () => {
        if (preset.confirm && !confirm(preset.confirm)) return;
        const res = await fetch('/api/config', {
          method: 'PATCH',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ path: isObj(tab) ? [tab] : [tab, id], merge: true, value: opt.value }),
        });
        const data = await res.json().catch(() => ({}));
        if (data.config) payload = data;
        if (!yamlDirty && data.yaml) $('yamlText').value = data.yaml;
        render();
        showIssues(data.errors, data.warnings, data.ok ? '変えました' : null);
      });
      chips.append(b);
    }
    wrap.append(chips);
    return wrap;
  }

  function renderEntries() {
    const box = $('entries');
    box.replaceChildren();
    if (isObj(tab)) {
      box.hidden = true;
      return;
    }
    const names = entriesOf(tab);
    box.hidden = simple() && names.length < 2 && tab !== 'roulettes';
    for (const name of names) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'entry pressable';
      b.setAttribute('aria-pressed', String(name === id));
      const title = payload.config[tab][name].name;
      // かんたんでは URL 用の名前（英数字）は見せない
      if (simple()) b.textContent = title || (names.length > 1 ? `${schema.sections[tab].title} ${names.indexOf(name) + 1}` : schema.sections[tab].title);
      else b.textContent = title ? `${title}（${name}）` : name;
      b.addEventListener('click', () => select(tab, name));
      box.append(b);
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'entry add pressable';
    add.append(icon('plus'), simple() ? 'もう1つ作る' : '追加');
    add.addEventListener('click', addEntry);
    box.append(add);
  }

  async function addEntry() {
    let name;
    let value = {};
    if (simple()) {
      // かんたんでは URL 用の名前は自動で付ける（default → roulette-2 → roulette-3 …）
      const used = entriesOf(tab);
      const base = tab.replace(/s$/, '').replace(/([A-Z])/g, '-$1').toLowerCase();
      name = used.includes('default') || used.length ? null : 'default';
      for (let n = 2; !name; n++) if (!used.includes(`${base}-${n}`)) name = `${base}-${n}`;
      if (tab === 'roulettes') {
        const title = prompt('ルーレットの名前（例: 罰ゲーム）', '');
        if (title == null) return;
        value = { name: title.trim() || 'ルーレット', gifts: [], items: ['当たり', 'ハズレ*2'] };
      }
    } else {
      name = prompt('新しい設定の名前（英数字と - _。URL に使います）', tab === 'roulettes' ? 'new-roulette' : 'new');
      if (!name) return;
      if (!/^[A-Za-z0-9_-]+$/.test(name)) return alert('名前は英数字と - _ だけにしてください');
      if (entriesOf(tab).includes(name)) return alert('同じ名前がもうあります');
      if (tab === 'roulettes') value = { name, gifts: [], items: ['当たり', 'ハズレ*2'] };
    }
    // 新しく作るタイマーだけ、100 コインで 1 分。すでにある設定と、schema の初期値は変えない
    if (tab === 'timers') value = { ...value, coinSeconds: TIMER_COIN_SECONDS };
    await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: [tab, name], value }),
    });
    await reload();
    select(tab, name);
  }

  async function removeEntry() {
    if (!confirm(`「${id}」の設定を消します。よろしいですか？`)) return;
    await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: [tab, id], delete: true }),
    });
    await reload();
    select(tab);
  }

  // --- フォーム ---

  function render() {
    // 色見本をテーマの色に合わせる
    const theme = payload.config.theme ?? {};
    for (const t of ['accent', 'gold', 'ink', 'paper']) {
      if (/^#/.test(theme[t] ?? '')) document.documentElement.style.setProperty(`--tok-${t}`, theme[t]);
    }
    // かんたんの一覧: カードだけ出す
    // かんたんで、まだ何も出していないときは「出すものを足す」から始める
    if (simple() && view === 'detail' && tab !== 'theme' && !usedSections().includes(tab)) view = usedSections().length ? view : 'catalog';
    const listView = simple() && (view === 'catalog' || view === 'obs');
    const aiView = simple() && view === 'ai';
    const stageView = simple() && view === 'stage';
    const filesView = view === 'files';
    document.querySelector('.config-panel').hidden = !filesView;
    $('cards').hidden = !listView;
    $('stageView').hidden = !stageView;
    $('aiView').classList.toggle('show', aiView);
    $('detail').hidden = listView || aiView || stageView || filesView;
    $('detailHead').hidden = !simple();
    if (simple()) renderNav();
    if (filesView) return;
    if (stageView) { stage?.render(); return; }
    if (listView) {
      if (view === 'catalog') renderCatalog();
      else renderObs();
      return;
    }
    if (aiView) return;
    renderEntries();
    const def = schema.sections[tab];
    $('widgetDesc').textContent = simple() ? INFO[tab].desc : def.desc;
    $('detailTitle').textContent = def.title;
    const form = $('settings');
    form.replaceChildren();
    showIssues();

    const values = isObj(tab) ? payload.config[tab] : payload.config[tab]?.[id];
    if (!isObj(tab) && !values) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = simple() ? 'まだ作っていません。' : 'まだ設定がありません。「追加」で作ってください。';
      form.append(empty);
      if (simple()) {
        const make = document.createElement('button');
        make.type = 'button';
        make.className = 'btn primary pressable';
        make.textContent = `${def.title}を作る`;
        make.addEventListener('click', addEntry);
        form.append(make);
      }
      $('previewCol').hidden = true;
      return;
    }
    $('previewCol').hidden = false;
    renderSide();
    // かんたん: まとまりごとに、型とよく使う項目だけ。細かいものは「くわしく」へ
    const easy = simple() ? SIMPLE[tab] : null;
    if (easy) {
      if (easy.note && (section !== 'minecraft' || isTenant())) form.append(Object.assign(document.createElement('p'), { className: 'desc', textContent: easy.note }));
      for (const g of easy.groups) {
        const fields = g.fields.filter((key) => !(isMinecraftField(tab, key) && !usesMinecraft()));
        form.append(listGroup(g.title, [...(g.presets ?? []).map((preset) => presetRow(preset, values)), ...fields.map((key) => fieldFor(key, def.fields[key], values[key]))]));
      }
      // まとまりに入っていない項目は、ここに畳んでおく（押したときだけ開く）
      const shown = new Set(easy.groups.flatMap((g) => g.fields));
      const others = Object.keys(def.fields).filter((k) => !shown.has(k) && !(isMinecraftField(tab, k) && !usesMinecraft()));
      if (others.length || streamDeckUrls().length) {
        const more = document.createElement('details');
        more.className = 'more others';
        more.open = store.get(`others-open:${tab}`, false);
        more.addEventListener('toggle', () => store.set(`others-open:${tab}`, more.open));
        const summary = document.createElement('summary');
        summary.textContent = `ほかの項目（${others.length}）`;
        const inner = document.createElement('div');
        inner.className = 'settings';
        withHints = true;
        try {
          for (const key of others) inner.append(fieldFor(key, def.fields[key], values[key]));
        } finally {
          withHints = false;
        }
        const urls = streamDeckUrls();
        if (urls.length) {
          const box = document.createElement('div');
          box.className = 'field wide';
          box.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: 'Stream Deck などから押す URL' }));
          for (const [name, u] of urls) {
            const line = document.createElement('div');
            line.className = 'url-row';
            const input = Object.assign(document.createElement('input'), { value: u, readOnly: true });
            input.setAttribute('aria-label', name);
            line.append(Object.assign(document.createElement('span'), { className: 'hint', textContent: name }), input);
            box.append(line);
          }
          inner.append(box);
        }
        more.append(summary, inner);
        form.append(more);
      }
      const tail = [];
      if (isTenant() && tab !== 'theme') tail.push(listRow({ iconName: 'eye-off', title: `${def.title}を使うのをやめる`, sub: '設定は残ります', trailing: null, onClick: () => dropCard(tab) }));
      if (!isObj(tab) && entriesOf(tab).length > 1) tail.push(listRow({ iconName: 'trash-2', title: 'この設定を消す', trailing: null, onClick: removeEntry }));
      if (tail.length) form.append(listGroup('そのほか', tail));
    }
    // よく使う設定を上に、それ以外は「詳しい設定」に畳む
    const basic = easy ? [] : (BASIC[tab] ?? Object.keys(def.fields)).filter((key) => !(isMinecraftField(tab, key) && !usesMinecraft()));
    for (const key of basic) form.append(fieldFor(key, def.fields[key], values[key]));
    const rest = easy ? [] : Object.keys(def.fields).filter((k) => !basic.includes(k) && !(isMinecraftField(tab, k) && !usesMinecraft()));
    if (rest.length) {
      const more = document.createElement('details');
      more.className = 'more';
      more.open = store.get('more-open', false);
      more.addEventListener('toggle', () => store.set('more-open', more.open));
      const summary = document.createElement('summary');
      summary.textContent = '詳しい設定';
      const inner = document.createElement('div');
      inner.className = 'settings';
      for (const key of rest) inner.append(fieldFor(key, def.fields[key], values[key]));
      more.append(summary, inner);
      form.append(more);
    }
    if (!isObj(tab) && !simple()) {
      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'text-btn danger pressable';
      del.textContent = 'この設定を消す';
      del.addEventListener('click', removeEntry);
      form.append(del);
    }
    renderActions();
    updateUrl(true);
  }

  let withHints = false; // 「ほかの項目」では、項目の説明も出す
  /** WIN数・タイマー・ボスを Stream Deck などから押す URL（[呼び名, URL]） */
  function streamDeckUrls() {
    const base = `${location.origin}${BASE}`;
    if (tab === 'wins') return [['クリア +1', `${base}/api/wins/${id}/win`], ['-1', `${base}/api/wins/${id}/add?value=-1`], ['1つ戻す', `${base}/api/wins/${id}/undo`], ['リセット', `${base}/api/wins/${id}/reset`]];
    if (tab === 'timers') return [['スタート', `${base}/api/timer/${id}/start`], ['一時停止', `${base}/api/timer/${id}/pause`], ['止める・動かす', `${base}/api/timer/${id}/toggle`], ['+1分', `${base}/api/timer/${id}/add?seconds=60`], ['-1分', `${base}/api/timer/${id}/add?seconds=-60`], ['リセット', `${base}/api/timer/${id}/reset`]];
    if (tab === 'bosses') return [['HP を戻す', `${base}/api/boss/${id}/heal`], ['ダメージ 100', `${base}/api/boss/${id}/damage?value=100`], ['討伐', `${base}/api/boss/${id}/defeat`], ['次のボス', `${base}/api/boss/${id}/next`], ['1体目から', `${base}/api/boss/${id}/reset`]];
    return [];
  }

  // 呼び名がない項目は、設定の名前（英字）ではなく説明の頭を呼び名にする
  const descLabel = (key) => {
    const d = schema.sections[tab]?.fields?.[key]?.desc;
    return d ? d.split(/[（(。]/)[0].trim() || key : key;
  };
  const labelText = (key) => (simple() && SIMPLE_LABELS[`${tab}.${key}`]) || LABELS[`${tab}.${key}`] || LABELS[key] || descLabel(key);

  function labelFor(key, field) {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const label = document.createElement('span');
    label.className = 'field-label';
    label.textContent = labelText(key);
    wrap.append(label);
    if ((withHints || !simple()) && field.desc && field.desc !== LABELS[key] && field.desc.split(/[（(。]/)[0].trim() !== label.textContent) {
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = field.desc;
      wrap.hint = hint;
    }
    return wrap;
  }

  // かんたんでは、短い項目は「呼び名 | 入れるところ」の1行に、長い項目は呼び名の下に置く
  const WIDE_TYPES = ['list', 'items', 'rules', 'winRules', 'timerRules', 'mcRules', 'commands'];

  function fieldFor(key, field, value) {
    const el = buildField(key, field, value);
    if (simple()) el.classList.add(WIDE_TYPES.includes(field.type) || key === 'gifts' || key === 'photo' || key === 'image' ? 'wide' : 'inline');
    return el;
  }

  function buildField(key, field, value) {
    if (field.type === 'items') {
      const editor = itemsEditor(value);
      if (simple()) editor.querySelector('.field-label').textContent = labelText(key);
      return editor;
    }

    if (field.type === 'boolean') {
      const wrap = document.createElement('label');
      wrap.className = 'check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(value);
      input.addEventListener('change', () => save(key, input.checked));
      wrap.append(input, labelText(key));
      wrap.title = field.desc ?? '';
      return wrap;
    }

    const wrap = labelFor(key, field);
    let control;
    if (field.type === 'enum') {
      control = document.createElement('select');
      for (const v of field.values) control.append(new Option(ENUM_LABELS[`${key}.${v}`] ?? ENUM_LABELS[v] ?? v, v, false, v === value));
      control.addEventListener('change', () => save(key, control.value));
    } else if (field.type === 'color') {
      control = colorControl(value, (v) => save(key, v, 250));
    } else if (field.type === 'list' && field.values) {
      control = document.createElement('span');
      control.className = 'checks';
      const selected = new Set(value);
      for (const v of field.values) {
        const l = document.createElement('label');
        l.className = 'check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = selected.has(v);
        cb.addEventListener('change', () => {
          cb.checked ? selected.add(v) : selected.delete(v);
          save(key, field.values.filter((x) => selected.has(x)));
        });
        l.append(cb, ENUM_LABELS[v] ?? v);
        control.append(l);
      }
    } else if (field.type === 'list') {
      if (key === 'gifts') {
        control = giftPicker({ value: value ?? [], gifts, onChange: (names) => save(key, names) });
        wrap.append(control);
        control = null;
      } else {
        control = document.createElement('input');
        control.value = (value ?? []).join(', ');
        control.placeholder = { gifts: '例: Rose, Doughnut', hideWords: '例: 宣伝, 荒らし', hideUsers: '例: spam_bot, @someone' }[key] ?? '';
        control.addEventListener('input', () =>
          save(key, control.value.split(',').map((s) => s.trim()).filter(Boolean), 500),
        );
      }
    } else if (tab === 'bosses' && key === 'roulette') {
      // 討伐で回すルーレット: 設定にあるルーレットから選ぶ
      control = document.createElement('select');
      const names = Object.entries(payload.config.roulettes ?? {});
      control.append(new Option('回さない', '', false, !value));
      for (const [rid, r] of names) control.append(new Option(r.name ? `${r.name}（${rid}）` : rid, rid, false, rid === value));
      if (value && !names.some(([rid]) => rid === value)) control.append(new Option(`${value}（見つかりません）`, value, false, true));
      control.addEventListener('change', () => save(key, control.value));
    } else if (field.type === 'commands') {
      // コマンドの一覧: 1行に1つ
      control = document.createElement('textarea');
      control.rows = 3;
      control.className = 'mono';
      control.spellcheck = false;
      control.value = (value ?? []).join('\n');
      control.placeholder = 'say {user} が {boss} を討伐！\ngive {user} diamond 3';
      control.addEventListener('input', () => save(key, control.value.split('\n').map((c) => c.trim()).filter(Boolean), 700));
    } else if (key === 'photo' || (tab === 'bosses' && key === 'image')) {
      // media/ の画像を候補に出す（URL も書ける）
      control = document.createElement('input');
      control.value = value ?? '';
      control.placeholder = 'media/my-photo.png または https://…';
      const listId = `media-${Math.random().toString(36).slice(2)}`;
      control.setAttribute('list', listId);
      const dl = document.createElement('datalist');
      dl.id = listId;
      for (const m of media) dl.append(new Option(m, m));
      wrap.append(dl);
      control.addEventListener('input', () => save(key, control.value.trim(), 500));
    } else if (simple() && hasRulesEditor(field.type)) {
      control = rulesEditor({ type: field.type, value, gifts, onChange: (rules, delay) => save(key, rules, delay) });
    } else if (field.type === 'rules' || field.type === 'mcRules' || field.type === 'winRules' || field.type === 'timerRules') {
      control = document.createElement('textarea');
      control.rows = 6;
      control.className = 'mono';
      control.spellcheck = false;
      control.value = rulesToYaml(value);
      control.placeholder =
        field.type === 'mcRules'
          ? '- gifts: [Rose]\n  superstreamGift: 6001\n- events: [follow]\n  commands: ["say {user} ありがとう"]'
          : field.type === 'winRules'
            ? '- {gifts: [Lion], add: -1}\n- {gifts: [Universe], set: 0}\n- {gifts: [GG], add: 1}'
            : field.type === 'timerRules'
              ? '- {gifts: [Galaxy], minutes: 10}\n- {gifts: [Rose], seconds: 30}\n- {minCoins: 5000, minutes: 30}'
              : '- gifts: [Lion]\n  big: true\n  color: "#3FA9F5"';
      control.rows = field.type === 'mcRules' ? 10 : 6;
      control.addEventListener('input', () => patch(pathOf(key), { yaml: control.value.trim() || '[]' }, 700));
    } else {
      control = document.createElement('input');
      control.type = field.secret ? 'password' : field.type === 'number' ? 'number' : 'text';
      if (field.type === 'number') {
        control.step = Number.isInteger(field.default) && field.max !== 1 ? '1' : '0.1';
        // 目盛りの起点は min なので、min が目盛りに乗らないと ▲▼ が 1.1 → 2.1 のようにずれる。そのときは min を付けない（保存のときにサーバーが確かめる）
        if (field.min != null && Number.isInteger(Math.round(field.min / Number(control.step) * 1e6) / 1e6)) control.min = String(field.min);
        if (field.max != null) control.max = String(field.max);
      }
      control.value = value ?? '';
      control.addEventListener('input', () => {
        if (field.type !== 'number') return save(key, control.value, 500);
        const n = Number(control.value);
        if (control.value !== '' && Number.isFinite(n)) save(key, n, 500);
      });
    }
    // かんたんでは、数字の後ろに単位を付ける
    if (control && simple() && field.type === 'number' && UNITS[key]) {
      const unit = document.createElement('span');
      unit.className = 'with-unit';
      unit.dataset.unit = UNITS[key];
      unit.append(control);
      control = unit;
    }
    if (control) wrap.append(control);
    if (wrap.hint) wrap.append(wrap.hint);
    return wrap;
  }

  function colorControl(value, onChange) {
    const box = document.createElement('span');
    box.className = 'color-control';
    const sel = document.createElement('select');
    const isToken = schema.colorTokens.includes(value);
    const tokenLabel = (t) => (simple() ? (TOKEN_LABELS[t] ?? t).replace(/（.*）/, '') : TOKEN_LABELS[t] ?? t);
    for (const t of schema.colorTokens) sel.append(new Option(tokenLabel(t), t, false, t === value));
    sel.append(new Option(simple() ? '自分で選ぶ' : '指定する', 'custom', false, !isToken && !!value));
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = !isToken && /^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '#3fa9f5';
    picker.hidden = isToken || !value;
    sel.addEventListener('change', () => {
      picker.hidden = sel.value !== 'custom';
      onChange(sel.value === 'custom' ? picker.value.toUpperCase() : sel.value);
    });
    picker.addEventListener('input', () => onChange(picker.value.toUpperCase()));
    box.append(sel, picker);
    return box;
  }

  function rulesToYaml(rules = []) {
    // 小さな YAML を手で組む（ダッシュボードに YAML ライブラリを持ち込まないため）
    const scalar = (v) => (typeof v === 'string' && !/^[\w　-鿿＀-￯ ！!。、]+$/.test(v) ? JSON.stringify(v) : String(v));
    return rules
      .map((r) =>
        Object.entries(r)
          .map(([k, v], i) => `${i === 0 ? '- ' : '  '}${k}: ${Array.isArray(v) ? `[${v.map(scalar).join(', ')}]` : scalar(v)}`)
          .join('\n'),
      )
      .join('\n');
  }

  // --- ルーレットの項目 ---

  function itemsEditor(items) {
    const wrap = document.createElement('div');
    wrap.className = 'field items-field';
    const head = document.createElement('span');
    head.className = 'field-label';
    head.textContent = '項目（色と画像は項目ごとに指定できます）';
    const list = document.createElement('div');
    list.className = 'items';
    let rows = items.map((it) => ({ ...it }));

    const commit = (delay = 400) => {
      // 色も画像もない項目は「名前*重み」の短い形で書く
      const value = rows.map((r) => {
        const out = { label: r.label };
        if (r.weight && r.weight !== 1) out.weight = r.weight;
        if (r.color) out.color = r.color;
        if (r.textColor) out.textColor = r.textColor;
        if (r.image) out.image = r.image;
        if (r.commands?.length) out.commands = r.commands;
        if (r.superstreamGift) out.superstreamGift = r.superstreamGift;
        if (r.superstreamAction) out.superstreamAction = r.superstreamAction;
        const keys = Object.keys(out);
        if (keys.length === 1) return r.label;
        if (keys.length === 2 && out.weight) return `${r.label}*${r.weight}`;
        return out;
      });
      save('items', value, delay);
    };

    const draw = () => {
      list.replaceChildren(...rows.map((r, i) => itemRow(r, i)));
    };

    const itemRow = (r, i) => {
      const row = document.createElement('div');
      row.className = 'item-row';
      // 画像の四角は押すと画像を選べる（ファイルを落としても入る）
      const thumb = document.createElement('button');
      thumb.type = 'button';
      thumb.className = 'thumb pressable';
      thumb.title = '押して画像を選ぶ（ここに画像を落としても入ります）';
      thumb.setAttribute('aria-label', `${r.label ?? '項目'}の画像を選ぶ`);
      const file = Object.assign(document.createElement('input'), { type: 'file', accept: 'image/png,image/jpeg,image/gif,image/webp,image/avif', hidden: true });
      const takeFile = async (f) => {
        if (!f) return;
        thumb.classList.add('loading');
        try {
          const res = await fetch('/api/media', { method: 'POST', headers: { 'content-type': f.type }, body: f });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || '画像を入れられませんでした');
          if (!media.includes(data.path)) media.push(data.path);
          r.image = data.path;
          paint();
          commit(0);
          draw();
        } catch (err) {
          setMessage(err.message, true);
        } finally {
          thumb.classList.remove('loading');
        }
      };
      thumb.addEventListener('click', () => file.click());
      file.addEventListener('change', () => takeFile(file.files[0]));
      thumb.addEventListener('dragover', (e) => (e.preventDefault(), thumb.classList.add('drop')));
      thumb.addEventListener('dragleave', () => thumb.classList.remove('drop'));
      thumb.addEventListener('drop', (e) => {
        e.preventDefault();
        thumb.classList.remove('drop');
        takeFile([...(e.dataTransfer?.files ?? [])].find((f) => f.type.startsWith('image/')));
      });
      const paint = () => {
        thumb.style.background = r.color ? (schema.colorTokens.includes(r.color) ? `var(--tok-${r.color})` : r.color) : '';
        thumb.replaceChildren();
        if (r.image) {
          const img = new Image();
          img.src = mediaUrl(r.image);
          img.alt = '';
          thumb.append(img);
        } else {
          thumb.append(icon('image-plus'));
        }
      };
      paint();

      const label = document.createElement('input');
      label.value = r.label ?? '';
      label.placeholder = '名前';
      label.addEventListener('input', () => ((r.label = label.value), commit()));

      const weight = document.createElement('input');
      weight.type = 'number';
      Object.assign(weight, WEIGHT_INPUT);
      weight.value = r.weight ?? 1;
      weight.title = '当たりやすさ';
      weight.className = 'weight';
      weight.addEventListener('input', () => {
        const n = parseWeight(weight.value);
        if (n != null) (r.weight = n), commit();
      });

      const color = document.createElement('select');
      color.title = '色';
      color.append(new Option('色: 自動', ''));
      for (const t of schema.colorTokens) color.append(new Option(`色: ${TOKEN_LABELS[t]}`, t));
      color.append(new Option('色: 指定する', 'custom'));
      const picker = document.createElement('input');
      picker.type = 'color';
      const custom = r.color && !schema.colorTokens.includes(r.color);
      color.value = custom ? 'custom' : r.color ?? '';
      picker.value = custom && /^#[0-9a-f]{6}$/i.test(r.color) ? r.color : '#3fa9f5';
      picker.hidden = !custom;
      color.addEventListener('change', () => {
        picker.hidden = color.value !== 'custom';
        r.color = color.value === 'custom' ? picker.value.toUpperCase() : color.value || undefined;
        paint();
        commit(0);
      });
      picker.addEventListener('input', () => ((r.color = picker.value.toUpperCase()), paint(), commit(250)));

      const image = document.createElement('select');
      image.title = '画像';
      image.append(new Option('画像: なし', ''));
      for (const m of media) image.append(new Option(`画像: ${m.replace(/^media\//, '')}`, m));
      image.append(new Option('画像: URL を入れる', 'url'));
      const url = document.createElement('input');
      url.placeholder = 'https://… または media/…';
      const isMedia = media.includes(r.image);
      image.value = !r.image ? '' : isMedia ? r.image : 'url';
      url.value = r.image && !isMedia ? r.image : '';
      url.hidden = image.value !== 'url';
      image.addEventListener('change', () => {
        url.hidden = image.value !== 'url';
        r.image = image.value === 'url' ? url.value || undefined : image.value || undefined;
        paint();
        commit(0);
      });
      url.addEventListener('input', () => ((r.image = url.value.trim() || undefined), paint(), commit(600)));

      const del = document.createElement('button');
      del.type = 'button';
      del.className = 'icon-btn small pressable';
      del.title = 'この項目を消す';
      del.append(icon('x'));
      del.addEventListener('click', () => {
        rows.splice(i, 1);
        draw();
        commit(0);
      });

      // 色・画像の選び直しは、必要なときだけ「…」で開く
      const more = document.createElement('button');
      more.type = 'button';
      more.className = 'icon-btn small pressable';
      more.title = '色と画像';
      more.setAttribute('aria-expanded', 'false');
      more.append(icon('ellipsis'));
      more.addEventListener('click', () => more.setAttribute('aria-expanded', String(row.classList.toggle('open'))));

      const top = document.createElement('div');
      top.className = 'item-top';
      top.append(thumb, file, label, weight, more, del);
      const bottom = document.createElement('div');
      bottom.className = 'item-bottom';
      bottom.append(color, picker, image, url);

      if (!usesMinecraft()) {
        row.append(top, bottom);
        return row;
      }

      // 当たったらマイクラで起こすこと（マイクラ側の演出かコマンド）
      const ss = document.createElement('select');
      ss.title = '当たったらマイクラの演出を起こす';
      ss.append(new Option('マイクラの演出: なし', ''));
      for (const g of superstream.gifts) {
        ss.append(new Option(`マイクラの演出 ${g.id}${g.name ? `（${g.name}）` : ''}: ${g.actions.join('・')}`, g.id));
      }
      if (r.superstreamGift && !superstream.gifts.some((g) => g.id === r.superstreamGift)) ss.append(new Option(`マイクラの演出 ${r.superstreamGift}`, r.superstreamGift));
      ss.value = r.superstreamGift ?? '';
      ss.addEventListener('change', () => ((r.superstreamGift = ss.value || undefined), commit(0)));
      const cmd = document.createElement('input');
      cmd.placeholder = '当たったら送るコマンド（; 区切り。例: give {user} diamond）';
      cmd.value = (r.commands ?? []).join('; ');
      cmd.addEventListener('input', () => {
        r.commands = cmd.value.split(';').map((c) => c.trim()).filter(Boolean);
        commit(600);
      });
      const mc = document.createElement('div');
      mc.className = 'item-bottom item-mc';
      mc.append(ss, cmd);
      row.append(top, bottom, mc);
      return row;
    };

    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'chip pressable';
    add.append(icon('plus'), '項目を追加');
    add.addEventListener('click', () => {
      rows.push({ label: '新しい項目', weight: 1 });
      draw();
      commit(0);
      list.lastElementChild?.querySelector('input')?.select();
    });

    draw();
    wrap.append(head, list, add);
    return wrap;
  }

  // --- URL・プレビュー・操作 ---

  function currentWidget() {
    if (tab === 'minecraft') return null;
    const section = tab === 'theme' ? 'alerts' : tab;
    const wid = tab === 'theme' ? Object.keys(payload.config.alerts ?? {})[0] : isObj(tab) ? null : id;
    return payload.widgets.find((w) => w.section === section && w.id === wid && !w.extra);
  }

  let previewTimer = null;
  let previewUrl = null;
  function updateUrl(immediate = false) {
    const w = currentWidget();
    if (!w) {
      $('widgetUrl').value = '';
      return;
    }
    $('widgetUrl').value = w.url;
    $('sizeHint').textContent =
      tab === 'roulettes'
        ? `OBS / TikTok LIVE Studio に「ブラウザ」ソースとして幅 ${w.size[0]}・高さ ${w.size[1]} で追加します。全部のルーレットを1つのソースで使うときは …/widgets/roulette.html（届いたギフトに合うものに切り替わります）。`
        : `OBS / TikTok LIVE Studio に「ブラウザ」ソースとして追加し、幅 ${w.size[0]}・高さ ${w.size[1]} に設定してください。`;
    if (simple()) $('sizeHint').textContent = `幅 ${w.size[0]}・高さ ${w.size[1]}`;
    // WIN 数は、ゲーム中でも Stream Deck などから押せる URL を出す
    if (simple()) {
      // ボタン用の URL などは「くわしく」で出す
    } else if (tab === 'wins') {
      // ボタン用の URL は、このダッシュボードの URL の下（配信者ごとの URL なら /t/<鍵>/）
      const base = `${location.origin}${BASE}`;
      const fx = payload.widgets.find((x) => x.section === 'wins' && x.id === id && x.extra);
      if (fx && isTenant() && !me.access?.winsFx?.on) $('sizeHint').textContent += ' 全画面の演出（大妨害・目標達成など）は、管理者が使えるようにすると使えます。';
      else if (fx) $('sizeHint').textContent += ` 大妨害・超妨害・壊滅の全画面演出は ${fx.url} を配信画面と同じ大きさ（${fx.size[0]} × ${fx.size[1]}）で重ねてください。`;
      $('sizeHint').textContent +=
        ` ゲーム中は Stream Deck の「Webサイト」などで次の URL を開くと押せます: クリア +1 ${base}/api/wins/${id}/win ／ -1 ${base}/api/wins/${id}/add?value=-1 ／ 1つ戻す ${base}/api/wins/${id}/undo ／ リセット ${base}/api/wins/${id}/reset`;
    }
    // 延長タイマーも、Stream Deck などから押せる URL を出す
    if (!simple() && tab === 'timers') {
      const base = `${location.origin}${BASE}/api/timer/${id}`;
      $('sizeHint').textContent +=
        ` Stream Deck の「Webサイト」などで次の URL を開くと押せます: スタート ${base}/start ／ 一時停止 ${base}/pause ／ 止める・動かすを1つで ${base}/toggle ／ +1分 ${base}/add?seconds=60 ／ -1分 ${base}/add?seconds=-60 ／ リセット ${base}/reset`;
    }
    // ボス討伐も、Stream Deck などから押せる URL を出す
    if (!simple() && tab === 'bosses') {
      const base = `${location.origin}${BASE}`;
      $('sizeHint').textContent +=
        ` Stream Deck の「Webサイト」などで次の URL を開くと押せます: HP を戻す ${base}/api/boss/${id}/heal ／ ダメージ 100 ${base}/api/boss/${id}/damage?value=100 ／ 討伐 ${base}/api/boss/${id}/defeat ／ 次のボス ${base}/api/boss/${id}/next ／ 1体目から ${base}/api/boss/${id}/reset`;
    }
    const url = new URL(w.url, location.origin);
    url.searchParams.set('preview', '1');
    url.searchParams.set('sound', '0');
    url.searchParams.set('keep', '0');
    const next = `${url.pathname}${url.search}`;
    clearTimeout(previewTimer);
    // 同じ URL なら読み込み直さない（設定が変わればウィジェットが自分で読み込み直す）
    if (next === previewUrl) return fitPreview(w.size);
    previewTimer = setTimeout(
      () => {
        previewUrl = next;
        $('frame').src = next;
        fitPreview(w.size);
      },
      immediate ? 0 : 300,
    );
  }

  function fitPreview(size = currentWidget()?.size) {
    if (!size) return;
    const [w, h] = size;
    const box = $('preview');
    // スマホでは画面の上に貼り付くので、低めにする
    const maxH = matchMedia('(max-width: 760px)').matches ? innerHeight * 0.34 : Math.min(560, innerHeight * 0.6);
    const scale = Math.min(1, box.clientWidth / w, maxH / h);
    const frame = $('frame');
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    frame.style.transform = `scale(${scale})`;
    frame.style.left = `${Math.max(0, (box.clientWidth - w * scale) / 2)}px`;
    box.style.height = `${h * scale}px`;
  }

  function chip(label, iconName, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip pressable';
    if (iconName) b.append(icon(iconName));
    b.append(label);
    b.addEventListener('click', onClick);
    return b;
  }

  // そのウィジェットの条件に合うテストのギフトを送る
  function testGift() {
    const e = isObj(tab) ? {} : payload.config[tab]?.[id] ?? {};
    if (e.gifts?.length) return api('/api/simulate', { kind: 'gift', giftName: e.gifts[0], diamonds: 10 });
    if (e.minCoins > 1) return api('/api/simulate', { kind: 'gift', giftName: 'テストギフト', diamonds: e.minCoins });
    if (e.events?.length && !e.events.includes('gift')) return api('/api/simulate', { kind: e.events[0] });
    return api('/api/simulate', { kind: 'gift' });
  }

  function renderActions() {
    fillActions();
    // かんたんでは、試すボタンが多いときは初めの4つだけ出す
    const box = $('actions');
    box.classList.remove('open');
    box.classList.toggle('live', live);
    const chips = [...box.children];
    if (!simple() || chips.length <= 5) return;
    chips.slice(4).forEach((c) => c.classList.add('extra'));
    const more = chip('ほかも試す', 'plus', () => {
      box.classList.add('open');
      more.remove();
    });
    box.append(more);
  }

  function fillActions() {
    const box = $('actions');
    box.replaceChildren(chip(simple() ? '見本のギフトを出してみる' : '条件に合うテストギフト', 'gift', () => testGift().catch((e) => setMessage(e.message, true))));
    if (!live) {
      const sample = chip('見本を出す', 'layout-template', async () => {
        try {
          const now = await api('/api/sample');
          await api('/api/sample', { on: !now.on }, 'POST');
          fillActions();
        } catch (e) { setMessage(e.message, true); }
      });
      box.append(sample);
    }
    const control = (target, action, data) => () => api('/api/control', { target, action, data });
    if (tab === 'roulettes') {
      box.append(chip('まわす', 'rotate-cw', control('roulette', 'spin', { id })), chip('待ち列を消す', null, control('roulette', 'reset')));
    } else if (tab === 'jars') {
      box.append(chip('ゆらす', null, control('gift-jar', 'shake', { id })), chip('中身を空にする', null, control('gift-jar', 'reset', { id })));
    } else if (tab === 'cutins' || tab === 'imageCutins') {
      // 段階ごとに試す（そのコイン数のテストギフトを送る）
      const e = payload.config[tab]?.[id] ?? {};
      const tiers = [['青', e.minCoins], ['緑', e.greenCoins], ['赤', e.redCoins], ['金', e.goldCoins], ['虹', e.rainbowCoins]];
      box.replaceChildren(
        ...tiers.map(([label, coins]) =>
          chip(`${label}（${coins} コイン）`, null, () => api('/api/simulate', { kind: 'gift', giftName: 'テストギフト', diamonds: coins })),
        ),
      );
    } else if (tab === 'wins') {
      const w = (action, value) => control('wins', action, { id, value });
      const e = payload.config.wins?.[id] ?? {};
      box.replaceChildren(
        chip('クリア（WIN +1）', 'trophy', w('win')),
        chip('WIN -1', 'minus', w('add', -1)),
        chip('1つ戻す', 'undo-2', w('undo')),
        // 段階ごとの演出を試す（境目は選んだプリセットのもの）
        ...lossSteps(e).map(([text, n]) => chip(`${text}（-${n}）を試す`, 'zap', w('add', -n))),
        ...gainSteps(e).map(([text, n]) => chip(`${text}（+${n}）を試す`, 'sparkles', w('add', n))),
        chip('リセット（0 に戻す）', 'rotate-ccw', () => confirm('WIN 数を 0 にリセットしますか？（「1つ戻す」で元に戻せます）') && w('reset')()),
        // ルールに書いたギフトを1つずつ試せる
        ...(e.rules ?? [])
          .filter((r) => r.gifts?.length || r.minCoins != null)
          .slice(0, 4)
          .map((r) =>
            chip(`${r.gifts?.[0] ?? `${r.minCoins} コイン`}（${r.set != null ? `WIN ${r.set} に` : `WIN ${r.add > 0 ? '+' : ''}${r.add}`}）`, 'gift', () =>
              api('/api/simulate', r.gifts?.length ? { kind: 'gift', giftName: r.gifts[0], count: 1, diamonds: 1 } : { kind: 'gift', giftName: 'テストギフト', diamonds: r.minCoins }),
            ),
          ),
      );
    } else if (tab === 'timers') {
      const tm = (action, seconds) => control('timer', action, { id, seconds });
      const e = payload.config.timers?.[id] ?? {};
      const extra = [];
      if (e.coinSeconds > 0) {
        const coins = Math.max(10, e.minCoins ?? 1);
        extra.push(chip(`${coins} コインのギフト`, 'gift', () => api('/api/simulate', { kind: 'gift', giftName: 'テストギフト', diamonds: coins, count: 1 })));
      }
      for (const r of (e.rules ?? []).filter((r) => r.gifts?.length).slice(0, 2)) {
        extra.push(chip(r.gifts[0], 'gift', () => api('/api/simulate', { kind: 'gift', giftName: r.gifts[0], diamonds: 1, count: 1 })));
      }
      if (e.followSeconds > 0) extra.push(chip('フォロー', 'user-plus', () => api('/api/simulate', { kind: 'follow' })));
      if (e.likeEvery > 0) extra.push(chip(`いいね ×${e.likeEvery}`, 'heart', () => api('/api/simulate', { kind: 'like', count: e.likeEvery })));
      box.replaceChildren(
        chip('スタート', 'play', tm('start')),
        chip('一時停止', 'pause', tm('pause')),
        chip('+1分', 'plus', tm('add', 60)),
        chip('-1分', 'minus', tm('add', -60)),
        chip('リセット（初めの時間に戻す）', 'rotate-ccw', () => confirm('タイマーを初めの時間に戻して、スタート前にしますか？') && tm('reset')()),
        ...extra,
      );
    } else if (tab === 'bosses') {
      const b = (action, value) => control('boss', action, { id, value });
      const e = payload.config.bosses?.[id] ?? {};
      box.replaceChildren(
        chip('ダメージ 100 を与える', 'swords', b('damage', 100)),
        chip(`大ダメージ（${e.bigHit ?? 1000}）`, 'zap', b('damage', e.bigHit ?? 1000)),
        chip('討伐する', 'skull', b('defeat')),
        chip('HP を戻す', 'heart-pulse', b('heal')),
        chip('次のボス', 'skip-forward', b('next')),
        chip('1体目からやり直す', 'rotate-ccw', () => confirm('1体目のボスからやり直しますか？') && b('reset')()),
        chip('テストギフト（Rose ×10）', 'gift', () => api('/api/simulate', { kind: 'gift', giftName: e.gifts?.[0] ?? 'Rose', count: 10, diamonds: 1 })),
        ...(e.damageFrom?.includes('likes') ? [chip('いいね ×50', 'heart', () => api('/api/simulate', { kind: 'like', count: 50 }))] : []),
      );
    } else if (tab === 'rush') {
      const r = payload.config.rush ?? {};
      box.replaceChildren(
        chip('RUSH 突入', 'zap', control('rush', 'start')),
        chip(`RUSH 中のギフト（${r.extendMinCoins ?? 100} コイン）`, 'gift', () =>
          api('/api/simulate', { kind: 'gift', giftName: 'テストギフト', diamonds: r.extendMinCoins ?? 100 }),
        ),
        chip('RUSH 終了', 'square', control('rush', 'stop')),
      );
    } else if (tab === 'chats') {
      // コメントと、ギフトを送った人のコメント（先にその人のギフトを送り、同じ人がコメントする）
      const e = payload.config.chats?.[id] ?? {};
      const say = (body) => api('/api/simulate', { kind: 'chat', ...body });
      const gifterSays = (user, coins, text) => async () => {
        try {
          await api('/api/simulate', { kind: 'gift', giftName: 'テストギフト', diamonds: coins, count: 1, user });
          await say({ user, text });
        } catch (err) {
          setMessage(err.message, true);
        }
      };
      box.replaceChildren(
        chip('コメントを送る', 'message-square', () => say({})),
        chip(`ギフトした人のコメント（${e.gifterCoins ?? 1}〜）`, 'gift', gifterSays('みお', Math.max(30, e.gifterCoins ?? 1), 'ギフト送りました！')),
        chip(`2段目（${e.bigGifterCoins ?? 1000}〜）`, 'gift', gifterSays('Ken', e.bigGifterCoins ?? 1000, 'いつも楽しい配信ありがとう')),
        chip(`3段目（${e.topGifterCoins ?? 10000}〜）`, 'gift', gifterSays('つむぎ', e.topGifterCoins ?? 10000, '今日もがんばって！応援してます')),
        chip('長いコメント', null, () =>
          say({ text: 'はじめまして！いつも切り抜きから見ていて、今日やっと生で見られました。声がすごく落ち着くので作業用に流してます' }),
        ),
        chip('「!」のコマンド', null, () => say({ text: '!roulette' })),
        chip('コメント欄を空にする', null, control('chat', 'reset')),
      );
    } else if (tab === 'counters' || tab === 'goals' || tab === 'rankings') {
      box.append(
        chip('いいね ×20', 'heart', () => api('/api/simulate', { kind: 'like', count: 20 })),
        chip('フォロー', 'user-plus', () => api('/api/simulate', { kind: 'follow' })),
      );
    }
  }

  // --- マイクラ連携 ---

  const mcLog = [];
  let mcStatus = null;

  function renderSide() {
    const col = $('previewCol');
    let panel = $('mcPanel');
    if (tab !== 'minecraft') {
      col.classList.remove('mc-mode');
      if (panel) panel.hidden = true;
      return;
    }
    col.classList.add('mc-mode');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'mcPanel';
      panel.className = 'stack mc-panel';
      col.prepend(panel);
    }
    panel.hidden = false;
    panel.replaceChildren();

    const status = document.createElement('div');
    status.className = 'status mc-status';
    status.id = 'mcStatus';
    if (isTenant()) {
      const line = document.createElement('p');
      line.className = 'desc';
      const clock = (iso) => new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', hour: 'numeric', minute: '2-digit' }).format(new Date(iso));
      const day = (iso) => {
        const fmt = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' });
        const target = fmt.format(new Date(iso));
        const today = fmt.format(new Date());
        const tomorrow = fmt.format(new Date(Date.now() + 24 * 3600_000));
        return target === today ? '今日' : target === tomorrow ? '明日' : target.slice(5).replace('-', '/');
      };
      if (me.rental?.now) line.textContent = `いまあなたの枠です（${clock(me.rental.now.until)} まで）。マイクラのサーバーは用意されています`;
      else if (me.rental?.next) line.textContent = `次の枠: ${day(me.rental.next.start)} ${clock(me.rental.next.start)}〜${clock(me.rental.next.end)}`;
      else line.textContent = '予約はありません';
      panel.append(line);
      return;
    }

    const head = document.createElement('div');
    head.className = 'row wrap';
    head.append(status, chip('接続を確認', 'plug', async () => renderMcStatus(await api('/api/minecraft/check', {}))));
    panel.append(head);

    const form = document.createElement('form');
    form.className = 'url-row';
    const input = document.createElement('input');
    input.placeholder = 'コマンドを試す（例: list / ss status）';
    input.className = 'mono';
    const send = document.createElement('button');
    send.className = 'btn primary pressable';
    send.type = 'submit';
    send.append(icon('send'), '送る');
    form.append(input, send);
    const out = document.createElement('pre');
    out.className = 'code';
    out.hidden = true;
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      if (!input.value.trim()) return;
      out.hidden = false;
      try {
        const r = await api('/api/minecraft/command', { command: input.value.trim() });
        out.textContent = r.response || '（返事なし）';
      } catch (err) {
        out.textContent = err.message;
      }
    });
    panel.append(form, out);

    // マイクラ側の演出プロフィールに設定済みの演出
    const ssBox = document.createElement('div');
    ssBox.className = 'field';
    const ssLabel = document.createElement('span');
    ssLabel.className = 'field-label';
    ssLabel.textContent = 'マイクラ側の演出プロフィール（押すと試せます）';
    ssBox.append(ssLabel);
    if (superstream.error) {
      const p = document.createElement('span');
      p.className = 'hint';
      p.textContent = superstream.error;
      ssBox.append(p);
    }
    const ssList = document.createElement('div');
    ssList.className = 'ss-list';
    for (const g of superstream.gifts) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'ss-item pressable';
      const idEl = document.createElement('span');
      idEl.className = 'num';
      idEl.textContent = g.id;
      const name = document.createElement('span');
      name.textContent = g.name ?? '';
      const acts = document.createElement('span');
      acts.className = 'hint';
      acts.textContent = g.actions.join('・');
      b.append(idEl, name, acts);
      b.addEventListener('click', async () => {
        out.hidden = false;
        const profile = payload.config.minecraft.superstreamProfile;
        try {
          const r = await api('/api/minecraft/command', { command: `ss test profile ${profile} ${g.id}` });
          out.textContent = r.response || `ss test profile ${profile} ${g.id} を送りました`;
        } catch (err) {
          out.textContent = err.message;
        }
      });
      ssList.append(b);
    }
    ssBox.append(ssList);
    panel.append(ssBox);

    const logBox = document.createElement('div');
    logBox.className = 'field';
    const logLabel = document.createElement('span');
    logLabel.className = 'field-label';
    logLabel.textContent = '送ったコマンド';
    const log = document.createElement('ol');
    log.className = 'log mc-log';
    log.id = 'mcLog';
    logBox.append(logLabel, log);
    panel.append(logBox);
    renderMcStatus(mcStatus);
    renderMcLog();
  }

  function renderMcStatus(st) {
    if (st) mcStatus = st;
    const el = $('mcStatus');
    if (!el || !mcStatus) return;
    el.dataset.mode = { ok: 'live', error: 'error', off: 'idle' }[mcStatus.state] ?? 'idle';
    el.replaceChildren(Object.assign(document.createElement('span'), { className: 'dot' }), mcStatus.message ?? '');
  }

  function renderMcLog() {
    const el = $('mcLog');
    if (!el) return;
    el.replaceChildren(
      ...mcLog.slice(0, 30).map((l) => {
        const li = document.createElement('li');
        const t = document.createElement('span');
        t.className = 'time';
        t.textContent = new Date(l.ts).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const c = document.createElement('span');
        c.className = `text mono ${l.ok ? '' : 'fail'}`;
        c.textContent = l.command;
        c.title = l.response ?? '';
        li.append(t, icon(l.ok ? 'check' : 'x'), c);
        return li;
      }),
    );
    if (!mcLog.length) el.append(Object.assign(document.createElement('li'), { className: 'empty', textContent: 'まだ送っていません' }));
  }

  // --- YAML と AI ---

  function renderYamlIssues(errors = [], warnings = []) {
    const el = $('yamlIssues');
    el.replaceChildren();
    for (const e of errors) {
      const li = document.createElement('li');
      li.className = 'error';
      li.textContent = e;
      el.append(li);
    }
    for (const w of warnings) {
      const li = document.createElement('li');
      li.textContent = w;
      el.append(li);
    }
  }

  async function setupYaml() {
    const text = $('yamlText');
    text.addEventListener('input', () => {
      yamlDirty = true;
      $('yamlState').textContent = '未保存の変更があります';
    });
    $('yamlSave').addEventListener('click', async () => {
      const res = await fetch('/api/config', {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ yaml: text.value }),
      });
      const data = await res.json();
      renderYamlIssues(data.errors, data.warnings);
      if (data.ok) {
        yamlDirty = false;
        payload = data;
        $('yamlState').textContent = '保存しました';
        render();
      } else {
        $('yamlState').textContent = '保存していません（エラーを直してください）';
      }
    });
    $('yamlRevert').addEventListener('click', async () => {
      yamlDirty = false;
      $('yamlState').textContent = '';
      await reload();
    });

    const ai = await api('/api/ai');
    // 配信者ごとの URL では、AI の案内（サーバーの場所など）は出さない
    if (ai.tenant) {
      document.querySelector('.config-body .ai').hidden = true;
      document.querySelector('.config-body').classList.add('single');
      document.querySelector('.config-panel h3').textContent = '設定ファイル（YAML）';
      return;
    }
    $('aiPath').textContent = ai.configPath;
    $('aiClaude').textContent = ai.claudeCode;
    $('aiDesktop').textContent = ai.desktop;
    for (const btn of document.querySelectorAll('[data-copy]')) {
      btn.addEventListener('click', () => {
        copyText($(btn.dataset.copy).textContent);
        flashCopied(btn);
      });
    }
  }

  return {
    async start() {
      [schema, payload, media, gifts, superstream, mcStatus, me] = await Promise.all([
        api('/api/config/schema'),
        api('/api/config'),
        api('/api/media').catch(() => []),
        api('/api/gifts').catch(() => []),
        api('/api/superstream').catch(() => ({ gifts: [] })),
        api('/api/minecraft').catch(() => null),
        api('/api/me').catch(() => ({ mode: 'local' })),
      ]);
      if (isTenant()) document.querySelector('.brand-title').textContent = `${me.name} のウィジェット`;
      // TikTok の署名キーは、配信者ごとの URL では管理者が入れる
      if (isTenant()) document.querySelector('#connectForm details').hidden = true;
      stage = createStage({
        api,
        getPayload: () => payload,
        getMe: () => me,
        onChanged: (data) => { if (data.config) payload = data; render(); },
        onTemplate: async () => { me = await api('/api/me'); renderPicker(); renderNav(); },
        openWidget: (section, entry) => { view = 'detail'; select(section, entry); },
      });
      renderPicker();
      $('yamlText').value = payload.yaml;
      renderYamlIssues(payload.errors, payload.warnings);
      await setupYaml();
      new ResizeObserver(() => fitPreview()).observe($('preview'));
      $('copyBtn').addEventListener('click', () => {
        const btn = $('copyBtn');
        copyText($('widgetUrl').value, $('widgetUrl'));
        // アイコンも span なので、見える「コピー」の文字だけを変える
        flashCopied(btn, btn.querySelector('span:not(.icon)'));
      });
      tab = TABS.includes(store.get('tab')) ? store.get('tab') : TABS[0];
      // 設定ファイル（YAML）は、右の中身の1つとして出す
      document.querySelector('.shell-main').append(document.querySelector('.config-panel'));
      setMode('simple');
      window.addEventListener('resize', () => {
        if (simple()) renderNav();
      });
    },
    /** AI などがまとめて設定を変えたあと: 読み直して、そのウィジェットを開く */
    async refresh(section, entry) {
      await reload();
      if (section && TABS.includes(section)) {
        view = 'detail';
        select(section, entry && entriesOf(section).includes(entry) ? entry : undefined);
      } else render();
    },
    current: () => ({ section: tab, id: isObj(tab) ? null : id, view: simple() ? view : 'detail' }),
    /** TikTok につながった・切れた（配信中のテスト送信は画面に出るだけになる） */
    onStatus(status) {
      live = status.mode === 'live';
      $('actions').classList.toggle('live', live);
    },
    /** 管理者が豪華な演出をオン/オフしたとき */
    async onEntitlements() {
      me = await api('/api/me').catch(() => me);
      renderPicker();
      select(tab);
    },
    /** ほかのツール（AI・エディタ）で設定が変わったとき */
    async onConfigChanged() {
      const prev = JSON.stringify(payload?.config);
      await reload();
      superstream = await api('/api/superstream').catch(() => superstream);
      // フォームを触っている最中に作り直すと入力が消えるので、フォーカスがないときだけ
      if (JSON.stringify(payload.config) !== prev && !$('settings').contains(document.activeElement)) render();
      else updateUrl();
    },
    onConfigError(errors) {
      renderYamlIssues(errors, []);
    },
    /** Minecraft にコマンドを送った・接続状態が変わった */
    onMinecraft(msg) {
      renderMcStatus(msg.status);
      if (msg.log) {
        mcLog.unshift(msg.log);
        mcLog.length = Math.min(mcLog.length, 100);
        renderMcLog();
      }
    },
  };
}
