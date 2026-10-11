// ダッシュボードの設定エディタ。config.yaml をフォームと YAML の両方から編集する。
// フォームの変更は1項目ずつ PATCH /api/config で保存する（ファイルのコメントは残る）。

import { icon } from '/widgets/lib/overlay.js';

const $ = (id) => document.getElementById(id);
const TABS = ['alerts', 'cutins', 'imageCutins', 'roulettes', 'jars', 'rankings', 'counters', 'goals', 'wins', 'rush', 'minecraft', 'theme'];

// 選択肢の表示名
const ENUM_LABELS = {
  dark: 'ダーク', light: 'ライト', top: '上', center: '中央', bottom: '下', left: '左', right: '右',
  jar: '保存瓶', heart: 'ハート', potion: 'エリクサーのフラスコ', auto: '自動', on: '表示', off: '表示しない',
  wheel: '丸（ホイール）', strip: '横スライド', row: '横', column: '縦',
  follows: 'フォロー', likes: 'いいね', diamonds: 'コイン', gifts: 'ギフト数', shares: 'シェア', comments: 'コメント', viewers: '視聴者',
  gift: 'ギフト', follow: 'フォロー', share: 'シェア', like: 'いいね', coins: 'コイン',
  avatar: '送った人のアイコン', band: '色の帯', photo: '写真の帯（縁が木炭）', 'image.photo': '写真（なければ何も乗せない）', 'image.gift': 'ギフトの画像',
  plate: '横長の板', big: '大きい数字',
  inside: '帯の中いっぱい（縁が木炭）', side: '帯の横に大きく乗る',
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
  negative: 'マイナスまで減らせる', winText: 'クリアの文字', milestone: '大きく祝う間隔',
  enabled: '連携する', 'rush.enabled': 'RUSH を使う', 'rush.gifts': '突入するギフト名（カンマ区切り）', enterCoins: '突入するコイン',
  extendMinCoins: '時間が延びるコイン', extendSeconds: '延びる秒数', maxSeconds: '最長の秒数', 'rush.duration': 'RUSH の秒数',
  'rush.text': '帯に流れる文字', enterText: '突入の文字', host: 'サーバーのアドレス', port: 'RCON のポート', password: 'RCON のパスワード',
  superstreamProfile: 'SuperStream のプロフィール名', superstreamFile: 'SuperStream のプロフィールのファイル',
  forwardGifts: 'ギフトを SuperStream に渡す',
  greenCoins: '緑になるコイン', redCoins: '赤（激アツ）になるコイン', goldCoins: '金になるコイン', rainbowCoins: '虹（確定）になるコイン',
  blueText: '青の文字', greenText: '緑の文字', redText: '赤の文字', goldText: '金の文字', rainbowText: '虹の文字',
  image: '帯に乗せる画像', character: 'キャラ画像', photo: '写真', word: '文字を出す', 'imageCutins.layout': '写真の置き方', yieldToImage: '画像付きが出るときは出さない', angle: '帯の傾き', shake: '揺れの強さ', freeze: 'フリーズ演出', lines: '集中線', show: '表示する数値', layout: '並べ方', labels: 'ラベル', hearts: 'ハート',
  name: '表示名', style: '形', perCount: '個数分まわす', hold: '結果の秒数', hint: '案内文', palette: '自動の色の順番',
  pointerColor: '針の色', frameColor: '縁の色', fontScale: '文字の倍率', items: '項目',
};
// フォームの上に出す、よく使う設定
const BASIC = {
  alerts: ['events', 'gifts', 'minCoins', 'bigCoins', 'position', 'align', 'rules'],
  roulettes: ['name', 'style', 'gifts', 'minCoins', 'events', 'items'],
  jars: ['shape', 'title', 'gifts', 'minCoins', 'liquid', 'liquidColor'],
  counters: ['show', 'layout', 'align', 'color'],
  goals: ['title', 'metric', 'goal', 'step', 'color'],
  rankings: ['title', 'metric', 'limit', 'avatars'],
  cutins: ['minCoins', 'greenCoins', 'redCoins', 'goldCoins', 'rainbowCoins', 'gifts', 'word', 'yieldToImage'],
  imageCutins: ['photo', 'layout', 'minCoins', 'greenCoins', 'redCoins', 'goldCoins', 'rainbowCoins', 'gifts'],
  wins: ['title', 'goal', 'rules', 'negative', 'winText', 'milestone', 'style', 'color'],
  rush: ['enabled', 'gifts', 'enterCoins', 'duration', 'extendMinCoins', 'extendSeconds', 'maxSeconds', 'text', 'enterText'],
  minecraft: ['enabled', 'host', 'port', 'password', 'superstreamProfile', 'superstreamFile', 'forwardGifts', 'rules'],
};
const TOKEN_LABELS = { accent: '朱（accent）', gold: '金（gold）', ink: '墨（ink）', 'ink-2': '墨2（ink-2）', paper: '白（paper）' };

export function createEditor({ api, setMessage }) {
  let schema = null;
  let payload = null; // GET /api/config の結果
  let media = [];
  let gifts = [];
  let tab = TABS[0];
  let id = null;
  let yamlDirty = false;
  let superstream = { gifts: [] };
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

  function renderTabs() {
    const tabs = $('tabs');
    tabs.replaceChildren();
    for (const section of TABS) {
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
    tab = section;
    store.set('tab', tab);
    const ids = entriesOf(section);
    id = nextId ?? (ids.includes(store.get(`id:${section}`)) ? store.get(`id:${section}`) : ids[0] ?? null);
    if (id) store.set(`id:${section}`, id);
    renderTabs();
    render();
  }

  function renderEntries() {
    const box = $('entries');
    box.replaceChildren();
    if (isObj(tab)) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    for (const name of entriesOf(tab)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'entry pressable';
      b.setAttribute('aria-pressed', String(name === id));
      const title = payload.config[tab][name].name;
      b.textContent = title ? `${title}（${name}）` : name;
      b.addEventListener('click', () => select(tab, name));
      box.append(b);
    }
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'entry add pressable';
    add.append(icon('plus'), '追加');
    add.addEventListener('click', addEntry);
    box.append(add);
  }

  async function addEntry() {
    const name = prompt('新しい設定の名前（英数字と - _。URL に使います）', tab === 'roulettes' ? 'new-roulette' : 'new');
    if (!name) return;
    if (!/^[A-Za-z0-9_-]+$/.test(name)) return alert('名前は英数字と - _ だけにしてください');
    if (entriesOf(tab).includes(name)) return alert('同じ名前がもうあります');
    const value = tab === 'roulettes' ? { name, gifts: [], items: ['当たり', 'ハズレ*2'] } : {};
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
    renderEntries();
    const def = schema.sections[tab];
    $('widgetDesc').textContent = def.desc;
    const form = $('settings');
    form.replaceChildren();
    showIssues();

    const values = isObj(tab) ? payload.config[tab] : payload.config[tab]?.[id];
    if (!isObj(tab) && !values) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'まだ設定がありません。「追加」で作ってください。';
      form.append(empty);
      $('previewCol').hidden = true;
      return;
    }
    $('previewCol').hidden = false;
    renderSide();
    // よく使う設定を上に、それ以外は「詳しい設定」に畳む
    const basic = BASIC[tab] ?? Object.keys(def.fields);
    for (const key of basic) form.append(fieldFor(key, def.fields[key], values[key]));
    const rest = Object.keys(def.fields).filter((k) => !basic.includes(k));
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
    if (!isObj(tab)) {
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

  function labelFor(key, field) {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const label = document.createElement('span');
    label.className = 'field-label';
    label.textContent = LABELS[`${tab}.${key}`] ?? LABELS[key] ?? key;
    wrap.append(label);
    if (field.desc && field.desc !== LABELS[key]) {
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = field.desc;
      wrap.hint = hint;
    }
    return wrap;
  }

  function fieldFor(key, field, value) {
    if (field.type === 'items') return itemsEditor(value);

    if (field.type === 'boolean') {
      const wrap = document.createElement('label');
      wrap.className = 'check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(value);
      input.addEventListener('change', () => save(key, input.checked));
      wrap.append(input, LABELS[`${tab}.${key}`] ?? LABELS[key] ?? key);
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
      control = document.createElement('input');
      control.value = (value ?? []).join(', ');
      control.placeholder = key === 'gifts' ? '例: Rose, Doughnut' : '';
      control.addEventListener('input', () =>
        save(key, control.value.split(',').map((s) => s.trim()).filter(Boolean), 500),
      );
      if (key === 'gifts') {
        wrap.append(control, giftChips(control, key));
        control = null;
      }
    } else if (key === 'photo') {
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
    } else if (field.type === 'rules' || field.type === 'mcRules' || field.type === 'winRules') {
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
            : '- gifts: [Lion]\n  big: true\n  color: "#3FA9F5"';
      control.rows = field.type === 'mcRules' ? 10 : 6;
      control.addEventListener('input', () => patch(pathOf(key), { yaml: control.value.trim() || '[]' }, 700));
    } else {
      control = document.createElement('input');
      control.type = field.secret ? 'password' : field.type === 'number' ? 'number' : 'text';
      if (field.type === 'number') {
        if (field.min != null) control.min = String(field.min);
        if (field.max != null) control.max = String(field.max);
        control.step = Number.isInteger(field.default) && field.max !== 1 ? '1' : '0.1';
      }
      control.value = value ?? '';
      control.addEventListener('input', () => {
        if (field.type !== 'number') return save(key, control.value, 500);
        const n = Number(control.value);
        if (control.value !== '' && Number.isFinite(n)) save(key, n, 500);
      });
    }
    if (control) wrap.append(control);
    if (wrap.hint) wrap.append(wrap.hint);
    return wrap;
  }

  // ギフト名の欄の下に、知っているギフトをチップで出す（押すと追加）
  function giftChips(input, key) {
    const box = document.createElement('span');
    box.className = 'gift-chips';
    for (const g of gifts.slice(0, 14)) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mini-chip pressable';
      b.textContent = g.name;
      b.title = `${g.diamonds} コイン${g.seen ? '・配信で受信' : ''}`;
      b.addEventListener('click', () => {
        const names = input.value.split(',').map((s) => s.trim()).filter(Boolean);
        if (!names.includes(g.name)) names.push(g.name);
        input.value = names.join(', ');
        save(key, names);
      });
      box.append(b);
    }
    return box;
  }

  function colorControl(value, onChange) {
    const box = document.createElement('span');
    box.className = 'color-control';
    const sel = document.createElement('select');
    const isToken = schema.colorTokens.includes(value);
    for (const t of schema.colorTokens) sel.append(new Option(TOKEN_LABELS[t] ?? t, t, false, t === value));
    sel.append(new Option('指定する', 'custom', false, !isToken && !!value));
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
      const thumb = document.createElement('span');
      thumb.className = 'thumb';
      const paint = () => {
        thumb.style.background = r.color ? (schema.colorTokens.includes(r.color) ? `var(--tok-${r.color})` : r.color) : '';
        thumb.replaceChildren();
        if (r.image) {
          const img = new Image();
          img.src = /^(https?:|data:|\/)/.test(r.image) ? r.image : `/${r.image}`;
          thumb.append(img);
        }
      };
      paint();

      const label = document.createElement('input');
      label.value = r.label ?? '';
      label.placeholder = '名前';
      label.addEventListener('input', () => ((r.label = label.value), commit()));

      const weight = document.createElement('input');
      weight.type = 'number';
      weight.min = '0.1';
      weight.step = '1';
      weight.value = r.weight ?? 1;
      weight.title = '当たりやすさ';
      weight.className = 'weight';
      weight.addEventListener('input', () => {
        const n = Number(weight.value);
        if (n > 0) (r.weight = n), commit();
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

      const top = document.createElement('div');
      top.className = 'item-top';
      top.append(thumb, label, weight, del);
      const bottom = document.createElement('div');
      bottom.className = 'item-bottom';
      bottom.append(color, picker, image, url);

      // 当たったら Minecraft で起こすこと（SuperStream の演出かコマンド）
      const ss = document.createElement('select');
      ss.title = '当たったら SuperStream の演出を起こす';
      ss.append(new Option('Minecraft: なし', ''));
      for (const g of superstream.gifts) {
        ss.append(new Option(`SuperStream ${g.id}${g.name ? `（${g.name}）` : ''}: ${g.actions.join('・')}`, g.id));
      }
      if (r.superstreamGift && !superstream.gifts.some((g) => g.id === r.superstreamGift)) ss.append(new Option(`SuperStream ${r.superstreamGift}`, r.superstreamGift));
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
    return payload.widgets.find((w) => w.section === section && w.id === wid);
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
    // WIN 数は、ゲーム中でも Stream Deck などから押せる URL を出す
    if (tab === 'wins') {
      const base = new URL(w.url).origin;
      $('sizeHint').textContent +=
        ` ゲーム中は Stream Deck の「Webサイト」などで次の URL を開くと押せます: クリア +1 ${base}/api/wins/${id}/win ／ -1 ${base}/api/wins/${id}/add?value=-1 ／ 1つ戻す ${base}/api/wins/${id}/undo`;
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
    const scale = Math.min(1, box.clientWidth / w);
    const frame = $('frame');
    frame.style.width = `${w}px`;
    frame.style.height = `${h}px`;
    frame.style.transform = `scale(${scale})`;
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
    const box = $('actions');
    box.replaceChildren(chip('条件に合うテストギフト', 'gift', () => testGift().catch((e) => setMessage(e.message, true))));
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
        // ルールに書いたギフトを1つずつ試せる
        ...(e.rules ?? [])
          .filter((r) => r.gifts?.length || r.minCoins != null)
          .slice(0, 4)
          .map((r) =>
            chip(`${r.gifts?.[0] ?? `${r.minCoins} コイン`}（${r.set != null ? `WIN ${r.set} に` : `WIN ${r.add > 0 ? '+' : ''}${r.add}`}）`, 'gift', () =>
              api('/api/simulate', r.gifts?.length ? { kind: 'gift', giftName: r.gifts[0], count: 1, diamonds: 1 } : { kind: 'gift', giftName: 'テストギフト', diamonds: r.minCoins }),
            ),
          ),
        chip('0 に戻す', 'rotate-ccw', () => confirm('WIN 数を 0 に戻しますか？') && w('reset')()),
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
    } else if (tab === 'counters' || tab === 'goals' || tab === 'rankings') {
      box.append(
        chip('いいね ×20', 'heart', () => api('/api/simulate', { kind: 'like', count: 20 })),
        chip('フォロー', 'user-plus', () => api('/api/simulate', { kind: 'follow' })),
      );
    }
  }

  // --- Minecraft / SuperStream ---

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

    // SuperStream のプロフィールに設定済みの演出
    const ssBox = document.createElement('div');
    ssBox.className = 'field';
    const ssLabel = document.createElement('span');
    ssLabel.className = 'field-label';
    ssLabel.textContent = 'SuperStream のプロフィールの演出（押すと試せます）';
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
    $('aiPath').textContent = ai.configPath;
    $('aiClaude').textContent = ai.claudeCode;
    $('aiDesktop').textContent = ai.desktop;
    for (const btn of document.querySelectorAll('[data-copy]')) {
      btn.addEventListener('click', async () => {
        const src = $(btn.dataset.copy).textContent;
        try {
          await navigator.clipboard.writeText(src);
        } catch {}
        const span = btn.querySelector('span');
        span.textContent = 'コピーしました';
        setTimeout(() => (span.textContent = 'コピー'), 1400);
      });
    }
  }

  return {
    async start() {
      [schema, payload, media, gifts, superstream, mcStatus] = await Promise.all([
        api('/api/config/schema'),
        api('/api/config'),
        api('/api/media').catch(() => []),
        api('/api/gifts').catch(() => []),
        api('/api/superstream').catch(() => ({ gifts: [] })),
        api('/api/minecraft').catch(() => null),
      ]);
      $('yamlText').value = payload.yaml;
      renderYamlIssues(payload.errors, payload.warnings);
      await setupYaml();
      new ResizeObserver(() => fitPreview()).observe($('preview'));
      $('copyBtn').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText($('widgetUrl').value);
        } catch {
          $('widgetUrl').select();
          document.execCommand('copy');
        }
        const label = $('copyBtn').querySelector('span');
        label.textContent = 'コピーしました';
        setTimeout(() => (label.textContent = 'コピー'), 1500);
      });
      select(TABS.includes(store.get('tab')) ? store.get('tab') : TABS[0]);
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
