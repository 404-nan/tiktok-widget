// フォームの項目を組み立てる関数群。editor.js の buildField/fieldFor/labelFor 等を抽出したもの。
// buildForms(ctx) → { labelText, fieldFor, puchunPreviewButton, colorControl, rulesToYaml }

import { mediaUrl, BASE } from '/widgets/lib/overlay.js';
import { giftPicker } from './gift-picker.js';
import { giftSoundRulesView } from './gift-sounds-form.js';
import { masterVolumeField } from './gift-sounds-form.js';
import { bundleListView } from './bundles-form.js';
import { rulesEditor, hasRulesEditor } from './rules.js';
import { LABELS, ENUM_LABELS, PUCHUN_TEXT_FIELDS, TOKEN_LABELS } from './editor-constants.js';
import { SIMPLE_LABELS, UNITS } from './simple.js';

const $ = (id) => document.getElementById(id);

export function buildForms(ctx) {
  // --- 呼び名 ---

  // 呼び名がない項目は、設定の名前（英字）ではなく説明の頭を呼び名にする
  const descLabel = (key) => {
    const schema = ctx.getSchema();
    const tab = ctx.getTab();
    const d = schema.sections[tab]?.fields?.[key]?.desc;
    return d ? d.split(/[（(。]/)[0].trim() || key : key;
  };
  const labelText = (key) => {
    const tab = ctx.getTab();
    return (ctx.simple() && SIMPLE_LABELS[`${tab}.${key}`]) || LABELS[`${tab}.${key}`] || LABELS[key] || descLabel(key);
  };

  function labelFor(key, field) {
    const wrap = document.createElement('label');
    wrap.className = 'field';
    const label = document.createElement('span');
    label.className = 'field-label';
    label.textContent = labelText(key);
    wrap.append(label);
    if ((ctx.getWithHints() || !ctx.simple()) && field.desc && field.desc !== LABELS[key] && field.desc.split(/[（(。]/)[0].trim() !== label.textContent) {
      const hint = document.createElement('span');
      hint.className = 'hint';
      hint.textContent = field.desc;
      wrap.hint = hint;
    }
    return wrap;
  }

  // --- 項目の組み立て ---

  // かんたんでは、短い項目は「呼び名 | 入れるところ」の1行に、長い項目は呼び名の下に置く
  const WIDE_TYPES = ['list', 'items', 'rules', 'actions', 'winRules', 'timerRules', 'mcRules', 'commands', 'mediaRules', 'soundRules', 'gachaTiers', 'gachaPaidRule', 'slotPayouts', 'bundleList', 'cardDeck'];

  function fieldFor(key, field, value) {
    const el = buildField(key, field, value);
    if (ctx.simple()) el.classList.add(WIDE_TYPES.includes(field.type) || key === 'gifts' || key === 'photo' || key === 'image' || key === 'masterVolume' || key === 'crop' || key === 'imageStyle' || key === 'textWeight' ? 'wide' : 'inline');
    return el;
  }

  function buildField(key, field, value) {
    const tab = ctx.getTab();
    const id = ctx.getId();
    const schema = ctx.getSchema();
    const payload = ctx.getPayload();
    const media = ctx.getMedia();
    const gifts = ctx.getGifts();
    const devMode = ctx.getDevMode();
    const { save, pathOf, isObj, setMessage, patch } = ctx;

    // 横の位置は「出す場所」の3×3のマスで一緒に選ぶので、別のプルダウンは出さない
    if (ctx.simple() && tab === 'alerts' && (key === 'align' || key === 'position')) return Object.assign(document.createElement('div'), { hidden: true });
    if (ctx.simple() && tab === 'alerts' && key === 'position') {
      const wrap = document.createElement('div');
      wrap.className = 'field wide placement-field';
      wrap.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: '出す場所' }));
      const grid = document.createElement('div');
      grid.className = 'placement-grid';
      const align = payload.config.alerts?.[id]?.align ?? 'left';
      for (const position of ['top', 'center', 'bottom']) for (const nextAlign of ['left', 'center', 'right']) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'placement-cell pressable';
        button.setAttribute('aria-label', `${{ top: '上', center: 'まんなか', bottom: '下' }[position]}の${{ left: '左', center: 'まんなか', right: '右' }[nextAlign]}`);
        button.setAttribute('aria-pressed', String(value === position && align === nextAlign));
        button.addEventListener('click', async () => { await save(key, position); await save('align', nextAlign); });
        grid.append(button);
      }
      wrap.append(grid);
      return wrap;
    }
    if (field.type === 'gachaPaidRule') return ctx.getGachaPaidRuleEditor()(key, value);
    if (tab === 'puchuns' && key === 'texts') return puchunTextEditor(value);
    if (field.type === 'slotTrigger') {
      const wrap = document.createElement('div');
      wrap.className = 'field items-field';
      const head = document.createElement('span');
      head.className = 'field-label';
      head.textContent = labelText(key);
      const giftControl = giftPicker({ value: value?.gifts ?? [], gifts, onChange: (names) => save(key, { gifts: names, minCoins: Number(coins.value) || 0 }) });
      const coins = document.createElement('input');
      coins.type = 'number';
      coins.min = '0';
      coins.step = '1';
      coins.value = value?.minCoins ?? 0;
      coins.setAttribute('aria-label', '最低コイン');
      coins.addEventListener('input', () => save(key, { gifts: value?.gifts ?? [], minCoins: Number(coins.value) || 0 }));
      const coinLabel = document.createElement('span');
      coinLabel.className = 'field-label';
      coinLabel.textContent = '最低コイン';
      wrap.append(head, giftControl, coinLabel, coins);
      return wrap;
    }
    if (field.type === 'bundleList') {
      const wrap = labelFor(key, field);
      const titles = Object.fromEntries((field.eligible ?? []).map((s) => [s, s === 'winsFx' ? 'WIN数の全画面演出' : schema.sections[s]?.title ?? s]));
      wrap.append(bundleListView({
        value,
        eligible: field.eligible ?? [],
        titles,
        links: (payload.widgets ?? []).filter((w) => w.section === 'bundles'),
        onSave: (next) => save(key, next),
      }));
      return wrap;
    }
    if (field.type === 'cardDeck') {
      const wrap = labelFor(key, field);
      const control = document.createElement('textarea');
      control.rows = 12;
      control.className = 'mono';
      control.spellcheck = false;
      control.value = rulesToYaml(value);
      control.placeholder = '- {numeral: XVII, title: THE STAR, subtitle: 星, image: card-17-star.webp, text: 願いが報われはじめます, weight: 1}';
      control.addEventListener('input', () => patch(pathOf(key), { yaml: control.value.trim() || '[]' }, 700));
      wrap.append(control);
      return wrap;
    }
    if (field.type === 'slotPayouts') {
      const wrap = labelFor(key, field);
      const control = document.createElement('textarea');
      control.rows = 10;
      control.className = 'mono';
      control.spellcheck = false;
      control.value = rulesToYaml(value);
      control.placeholder = '- {id: lose, text: はずれ, tier: lose, weight: 70, symbols: []}\n- {id: jackpot, text: ジャックポット, tier: jackpot, weight: 1, symbols: [7, 7, 7]}';
      control.addEventListener('input', () => patch(pathOf(key), { yaml: control.value.trim() || '[]' }, 700));
      wrap.append(control);
      return wrap;
    }
    if (field.type === 'mediaRules' || field.type === 'gachaTiers' || field.type === 'soundRules') {
      const editor = field.type === 'mediaRules' ? ctx.getMediaRulesEditor()(value) : field.type === 'soundRules' ? giftSoundRulesView({
        rules: value,
        gifts,
        dev: devMode,
        api: ctx.api,
        onChange: (rules, delay) => save(key, rules, delay),
        setMessage,
        masterVolume: () => (isObj(tab) ? payload.config[tab]?.masterVolume : 80) ?? 80,
      }) : ctx.getGachaTiersEditor()(value);
      if (ctx.simple()) {
        const lab = editor.querySelector('.field-label');
        if (lab) lab.textContent = labelText(key);
      }
      return editor;
    }
    if (tab === 'giftSounds' && key === 'masterVolume') return masterVolumeField(value, (n) => save(key, n, 200));
    if (field.type === 'items') {
      const entry = isObj(tab) ? payload.config[tab] : payload.config[tab]?.[id];
      const editor = ctx.getItemsEditor()(value, { rushOdds: tab === 'roulettes' && key === 'items' && !!(entry && entry.rushOdds) });
      if (ctx.simple()) editor.querySelector('.field-label').textContent = labelText(key);
      return editor;
    }

    if ((key === 'textWeight' || key === 'imageStyle') && window.CutinForm) {
      const wrap = labelFor(key, field);
      const choices = key === 'textWeight'
        ? [{ id: 'normal', label: '普通' }, { id: 'bold', label: '太字' }]
        : [{ id: 'stripe', label: '縞・標準' }, { id: 'invert', label: '縞・反転' }, { id: 'thick', label: '縞・枠太' }];
      wrap.append(window.CutinForm.choices({
        value: value || '',
        choices,
        onChange: (id) => {
          save(key, id);
          if (key === 'imageStyle') document.dispatchEvent(new CustomEvent('tw-cutin-style', { detail: id }));
        },
      }));
      if (wrap.hint) wrap.append(wrap.hint);
      return wrap;
    }
    if (key === 'crop' && window.CutinForm) {
      const wrap = labelFor(key, field);
      const entry = isObj(tab) ? payload.config[tab] : payload.config[tab]?.[id] ?? {};
      wrap.append(window.CutinForm.crop({
        value: value || { x: 0.5, y: 0.5, scale: 1 },
        imageUrl: entry.photo ? mediaUrl(entry.photo) : '',
        style: entry.imageStyle || '',
        resolve: mediaUrl,
        onChange: (next) => save(key, next, 200),
      }));
      if (wrap.hint) wrap.append(wrap.hint);
      return wrap;
    }

    if (field.type === 'boolean') {
      const wrap = document.createElement('label');
      wrap.className = 'check';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = Boolean(value);
      input.addEventListener('change', () => {
        save(key, input.checked);
        if (key === 'rushOdds' && tab === 'roulettes') {
          const entry = payload.config.roulettes?.[id];
          if (entry) entry.rushOdds = input.checked;
          ctx.getSyncRushOdds()(input.checked);
        }
      });
      wrap.append(input, labelText(key));
      wrap.title = field.desc ?? '';
      return wrap;
    }

    if (field.type === 'object') {
      const wrap = labelFor(key, field);
      const control = document.createElement('textarea');
      control.rows = 4;
      control.className = 'mono';
      control.value = JSON.stringify(value ?? {}, null, 2);
      control.addEventListener('change', () => {
        try {
          const next = JSON.parse(control.value);
          if (!next || Array.isArray(next) || typeof next !== 'object') throw new Error('object');
          save(key, next);
        } catch {
          setMessage('字の形は JSON で入力してください', true);
        }
      });
      wrap.append(control);
      if (wrap.hint) wrap.append(wrap.hint);
      return wrap;
    }

    const wrap = labelFor(key, field);
    let control;
    let winRateHint = null;
    if (field.type === 'enum') {
      control = document.createElement('select');
      for (const v of field.values) control.append(new Option(ENUM_LABELS[`${key}.${v}`] ?? ENUM_LABELS[v] ?? v, v, false, v === value));
      control.addEventListener('change', () => {
        // 演出を変えたら字の欄も変わる。前の演出の字が残ると保存が断られるので、1回の保存で字を空にする
        if (tab === 'puchuns' && key === 'preset') {
          patch([tab, id], { merge: true, value: { preset: control.value, texts: {} } });
          setTimeout(ctx.getRender(), 200);
        } else save(key, control.value);
      });
      if (tab === 'puchuns' && (key === 'preset' || key === 'ratio')) control.dataset[`puchun${key[0].toUpperCase()}${key.slice(1)}`] = '1';
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
        control.placeholder = { gifts: '例: バラ, ドーナツ', hideWords: '例: 宣伝, 荒らし', hideUsers: '例: spam_bot, @someone' }[key] ?? '';
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
    } else if (tab === 'alerts' && key === 'style') {
      // 通知の型: 定義ファイル（styles.json）から選ぶ。値は定義の番号、表示は定義の名前。
      // 定義が読めなければ、今の値をそのまま書けるテキスト入力へ倒す
      control = document.createElement('select');
      const current = value ?? field.default ?? 'standard';
      control.append(new Option(current, current, false, true));
      control.addEventListener('change', () => save(key, control.value));
      fetch(`${BASE}/widgets/gift-alert/styles.json`)
        .then((res) => (res.ok ? res.json() : Promise.reject(new Error('styles'))))
        .then((defs) => {
          if (!Array.isArray(defs) || !defs.length) throw new Error('styles');
          control.replaceChildren();
          for (const def of defs) control.append(new Option(def.name ?? def.id, def.id, false, def.id === current));
          if (!defs.some((def) => def.id === current)) control.append(new Option(`${current}（見つかりません）`, current, false, true));
        })
        .catch(() => {
          const input = document.createElement('input');
          input.value = current;
          input.addEventListener('input', () => save(key, input.value.trim(), 500));
          control.replaceWith(input);
        });
    } else if (field.mediaKind) {
      // 入れたメディアの名前から選ぶ（保存するのは mediaId）
      control = document.createElement('select');
      const options = { kind: field.mediaKind, empty: 'なし', missing: '見つからないメディア' };
      ctx.fillSelect(control, value, options);
      ctx.addMediaRefresher(() => ctx.fillSelect(control, control.value, options));
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
    } else if (key === 'photo' || (tab === 'imageCutins' && /Photo$/.test(key)) || (tab === 'bosses' && key === 'image')) {
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
      control.addEventListener('input', () => {
        save(key, control.value.trim(), 500);
        if (tab === 'imageCutins' && key === 'photo') document.dispatchEvent(new CustomEvent('tw-cutin-photo', { detail: control.value.trim() }));
      });
    } else if (ctx.simple() && hasRulesEditor(field.type)) {
      control = rulesEditor({ type: field.type, value, gifts, onChange: (rules, delay) => save(key, rules, delay) });
    } else if (field.type === 'rules' || field.type === 'actions' || field.type === 'mcRules' || field.type === 'winRules' || field.type === 'timerRules') {
      control = document.createElement('textarea');
      control.rows = 6;
      control.className = 'mono';
      control.spellcheck = false;
      control.value = rulesToYaml(value);
      control.placeholder =
        field.type === 'actions'
          ? '- {type: roulette.spin, id: punishment}\n- {type: wins.add, n: 1}'
          : field.type === 'mcRules'
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
      // 下で control を単位つきの枠に入れ替えることがあるので、入力欄そのものを別の名前で持っておく
      const input = control;
      input.addEventListener('input', () => {
        if (field.type !== 'number') return save(key, input.value, 500);
        const n = Number(input.value);
        if (input.value !== '' && Number.isFinite(n)) save(key, n, 500);
      });
      // カードめくりの当たりの確率は小数（0〜1）で書く決まりだが、そのままだと分かりにくいので横に % の目安を出す（0%・100% もそのまま出す）
      if (key === 'winRate') {
        winRateHint = document.createElement('span');
        winRateHint.className = 'hint';
        const paintWinRate = () => {
          const n = Number(input.value);
          winRateHint.textContent = input.value !== '' && Number.isFinite(n) ? `＝ 当たり ${Math.round(n * 100)}%` : '';
        };
        input.addEventListener('input', paintWinRate);
        paintWinRate();
      }
    }
    // かんたんでは、数字の後ろに単位を付ける
    if (control && ctx.simple() && field.type === 'number' && UNITS[key]) {
      const unit = document.createElement('span');
      unit.className = 'with-unit';
      unit.dataset.unit = UNITS[key];
      unit.append(control);
      control = unit;
    }
    if (control) wrap.append(control);
    if (winRateHint) wrap.append(winRateHint);
    if (wrap.hint) wrap.append(wrap.hint);
    return wrap;
  }

  function puchunTextEditor(value) {
    const tab = ctx.getTab();
    const id = ctx.getId();
    const schema = ctx.getSchema();
    const payload = ctx.getPayload();
    const { save } = ctx;

    const wrap = labelFor('texts', schema.sections.puchuns.fields.texts);
    const preset = payload.config.puchuns?.[id]?.preset ?? 'puchun';
    const fields = PUCHUN_TEXT_FIELDS[preset] ?? PUCHUN_TEXT_FIELDS.puchun;
    const box = document.createElement('div');
    box.className = 'stack';
    const texts = value && typeof value === 'object' ? value : {};
    for (const field of fields) {
      const label = document.createElement('label');
      label.className = 'field';
      label.append(Object.assign(document.createElement('span'), { className: 'field-label', textContent: field.label }));
      const input = document.createElement('input');
      input.type = 'text';
      input.maxLength = field.max ?? 20;
      input.value = texts[field.key] ?? '';
      input.placeholder = field.def;
      input.dataset.puchunText = field.key;
      input.addEventListener('input', () => {
        const next = {};
        for (const item of box.querySelectorAll('[data-puchun-text]')) next[item.dataset.puchunText] = item.value;
        save('texts', next, 500);
      });
      label.append(input);
      box.append(label);
    }
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = '空なら見本の字を使います。20字まで。連打は個数ぶん、上限なしで順に流します。';
    box.append(hint);
    wrap.append(box);
    if (wrap.hint) wrap.append(wrap.hint);
    return wrap;
  }

  function puchunPreviewButton() {
    const box = document.createElement('div');
    box.className = 'field wide';
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'btn primary pressable';
    button.textContent = '見本';
    button.addEventListener('click', () => {
      const widget = ctx.getCurrentWidget()();
      const url = new URL(widget?.url ?? `${BASE}/widgets/puchun/puchun.html`, location.origin);
      const preset = document.querySelector('[data-puchun-preset]')?.value ?? 'puchun';
      const ratio = document.querySelector('[data-puchun-ratio]')?.value ?? 'full';
      url.searchParams.set('preset', preset);
      url.searchParams.set('ratio', ratio);
      url.searchParams.set('play', '1');
      url.searchParams.set('preview', '1');
      for (const input of document.querySelectorAll('[data-puchun-text]')) {
        if (input.value) url.searchParams.set(input.dataset.puchunText, input.value);
      }
      ctx.getResetPreviewUrl()();
      $('frame').src = `${url.pathname}${url.search}`;
      ctx.getFitPreview()([1080, 1920]);
    });
    const hint = document.createElement('span');
    hint.className = 'hint';
    hint.textContent = 'いま入力している演出・字・比率を、ダッシュボードの中で1回流します。配信画面には出ません。';
    box.append(button, hint);
    return box;
  }

  function colorControl(value, onChange) {
    const schema = ctx.getSchema();
    const box = document.createElement('span');
    box.className = 'color-control';
    const sel = document.createElement('select');
    const isToken = schema.colorTokens.includes(value);
    const tokenLabel = (t) => (ctx.simple() ? (TOKEN_LABELS[t] ?? t).replace(/（.*）/, '') : TOKEN_LABELS[t] ?? t);
    for (const t of schema.colorTokens) sel.append(new Option(tokenLabel(t), t, false, t === value));
    sel.append(new Option(ctx.simple() ? '自分で選ぶ' : '指定する', 'custom', false, !isToken && !!value));
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

  return { labelText, fieldFor, puchunPreviewButton, colorControl, rulesToYaml };
}
