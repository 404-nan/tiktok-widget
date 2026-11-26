// ダッシュボードの設定エディタ。config.yaml をフォームと YAML の両方から編集する。
// フォームの変更は1項目ずつ PATCH /api/config で保存する（ファイルのコメントは残る）。

import { icon, mediaUrl, BASE, giftLabel } from '/widgets/lib/overlay.js';
import { copyText, flashCopied } from './common.js';
import { WEIGHT_INPUT, parseWeight } from './weight.js';
import { GROUPS, INFO, SIMPLE, summaryOf, presetActive } from './simple.js';
import { widgetDescription } from './dashboard-descriptions.js';
import { shouldRenderDetails } from './editor-layout.js';
import { createStage } from './stage.js';
import { giftSoundStatusView } from './gift-sounds-form.js';
import { gachaViewersView } from './gacha-viewers-form.js';
import { drawResultsView } from './draw-results-form.js';
import { TIMER_COIN_SECONDS } from './timer-length.js';
import { createTemplatesView } from './templates.js';
import { TABS, BASIC } from './editor-constants.js';
import { buildMinecraft } from './editor-minecraft.js';
import { renderYamlIssues, setupYaml } from './editor-ai.js';
import { buildPreview } from './editor-preview.js';
import { buildRoulette } from './editor-roulette.js';
import { buildMedia } from './editor-media.js';
import { buildForms } from './editor-forms.js';

const $ = (id) => document.getElementById(id);

export function createEditor({ api, setMessage }) {
  let devMode = false;
  let schema = null;
  let payload = null; // GET /api/config の結果
  let media = [];
  let gifts = [];
  let tab = TABS[0];
  let me = { mode: 'local' }; // 配信者ごとの URL のときは、使うウィジェットと豪華な演出の状態（/api/me）
  let preparation = { autoConnect: true };
  let id = null;
  let yamlDirty = false;
  let superstream = { gifts: [] };
  let stage = null;
  let rouletteUrlsTarget = null;
  // 「かんたん」は、左のサイドバーで選ぶと右が切り替わる:
  //   detail（ウィジェット1つの設定）/ catalog（出すものを足す）/ obs（OBS に入れる URL）/ ai（AI にたのむ）
  // 「くわしく」は今までのタブとフォーム
  let mode = 'simple';
  let view = 'home';
  let live = false; // TikTok につないでいる間は、テスト送信は画面に出るだけ
  let liveStatus = { mode: 'idle', startedAt: null, widgetConnected: false };
  let liveStartedAt = null;
  let alertMedia = []; // メディア通知に入れたファイル
  let templatesView = null;
  // 入れたメディアから選ぶ欄を作り直す関数。画面を描き直すたびに空にする
  let mediaSelectRefreshers = [];
  const refreshMediaSelects = () => mediaSelectRefreshers.forEach((refresh) => refresh());
  // 入れたメディアから選ぶ select の中身を詰める。kind を渡すとその種類（audio/image/video）だけ並べる
  const fillSelect = (sel, current, { kind, empty, missing } = {}) => {
    const chosen = current || sel.value || '';
    sel.replaceChildren(new Option(empty, ''));
    for (const item of alertMedia) if (!kind || item.kind === kind) sel.append(new Option(`${item.name}（${item.id}）`, item.id));
    if (chosen && !alertMedia.some((item) => item.id === chosen && (!kind || item.kind === kind))) sel.append(new Option(`${chosen}（${missing}）`, chosen));
    sel.value = chosen;
  };
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
        if (data.config && (tab === 'wins' || tab === 'timers' || tab === 'bosses' || tab === 'doors')) renderActions();
        showIssues(data.errors, data.warnings, data.ok ? '保存しました' : null);
        updateUrl();
        if (!yamlDirty && data.yaml) $('yamlText').value = data.yaml;
      }, delay),
    );
  }
  // 続けて変えたときは、最後の1回だけ送る(打つたび・押すたびに保存とウィジェットの描き直しが走って重くならないように)
  const save = (key, value, delay = 150) => patch(pathOf(key), { value }, delay);
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
  const unlocked = (section) => !isTenant() || me.features?.[section] != null;
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
    for (const section of TABS.filter((s) => s !== 'theme' && unlocked(s))) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'pick pressable';
      const on = me.widgets.includes(section);
      const open = true;
      b.setAttribute('aria-pressed', String(on && open));
      if (on) {
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
    if (fx?.on) {
      const info = document.createElement('span');
      info.className = 'pick info';
      info.append(icon('sparkles'), 'WIN数の全画面演出');
      if (untilText(fx)) info.append(Object.assign(document.createElement('small'), { textContent: untilText(fx) }));
      chips.append(info);
    }
    box.append(chips);
  }

  function renderTabs() {
    const tabs = $('sectionTabs');
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
    // 開いたときは「配信に出している種類」を出す（選んだ種類 = 配信に出る種類、を保つ）。
    // ルーレットだけは全部の種類が同時に有効なので、前に見ていた種類を覚えておく
    const onAir = payload?.config?.active?.[section];
    const remembered = store.get(`id:${section}`);
    id = nextId ?? (section !== 'roulettes' && ids.includes(onAir) ? onAir : ids.includes(remembered) ? remembered : ids[0] ?? null);
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
    if (!keepView) view = mode === 'simple' ? 'home' : 'detail';
    if (payload) select(tab);
  }

  /** カードを押した: 使っていなければ使うものに足して、設定を開く */
  async function openCard(section, { activeId = payload?.config.active?.[section] } = {}) {
    if (isTenant() && section !== 'theme' && !me.widgets.includes(section)) {
      try {
        me = await api('/api/me/widgets', { widgets: [...me.widgets, section] }, 'PUT');
        renderPicker();
      } catch (err) {
        return setMessage(err.message, true);
      }
    }
    view = 'detail';
    const ids = entriesOf(section);
    // 使用中のプリセットを開く。使用中が不明なときだけ最後の種類を開く。
    const preferredId = activeId && ids.includes(activeId) ? activeId : ids[ids.length - 1];
    select(section, ids.includes(preferredId) ? preferredId : undefined);
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

  const railName = (title) => title.split('・')[0].replace(/(通知|欄|バー)$/, '').slice(0, 5);
  let sideObserver = null;
  // サイドバー: いつも出ていて、押すと右が切り替わる（スマホでは横に流れるボタンの列になる）
  function renderNav() {
    const side = $('side');
    const menuButton = $('mobileMenuBtn');
    const menuBackdrop = $('mobileMenuBackdrop');
    const closeMobileMenu = () => {
      side?.classList.remove('is-open');
      menuBackdrop?.classList.remove('is-open');
      menuButton?.setAttribute('aria-expanded', 'false');
    };
    if (menuButton && !menuButton.dataset.bound) {
      menuButton.dataset.bound = 'true';
      menuButton.addEventListener('click', () => {
        const open = !side.classList.contains('is-open');
        side.classList.toggle('is-open', open);
        menuBackdrop.classList.toggle('is-open', open);
        menuButton.setAttribute('aria-expanded', String(open));
      });
      menuBackdrop?.addEventListener('click', closeMobileMenu);
    }
    const topbar = document.querySelector('.topbar');
    const brand = topbar.querySelector('.brand') || document.querySelector('.brand');
    const nav = $('nav');
    const connection = $('connectionSection');
    const desktop = window.matchMedia('(min-width: 900px)').matches;
    const used = usedSections();
    const item = (iconName, label, current, onClick, cls = '', fullName) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = `side-item pressable ${cls}`;
      b.dataset.name = fullName ?? label;
      b.setAttribute('aria-current', String(current));
      b.append(icon(iconName), Object.assign(document.createElement('span'), { textContent: label }));
      b.addEventListener('click', () => { closeMobileMenu(); onClick(); });
      return b;
    };
    const label = (text) => Object.assign(document.createElement('p'), { className: 'side-label', textContent: text });
    const onDetail = (t) => view === 'detail' && tab === t;
    const menu = document.createElement('div');
    menu.className = 'side-menu';
    menu.append(
      item('house', 'ホーム', view === 'home', goTo('home')),
      label('ウィジェット'),
      // 左の細い列では短い名前(ギフト通知→ギフト、目標バー→目標)。全部の名前は押したあとの見出しに出る
      ...used.map((t) => item(INFO[t].icon, desktop ? railName(schema.sections[t].title) : schema.sections[t].title, onDetail(t), () => openCard(t), '', schema.sections[t].title)),
      item('plus', desktop ? 'その他' : 'その他のウィジェット', view === 'catalog', goTo('catalog'), '', 'その他のウィジェット'),
      item('chart-column', '配信の記録', view === 'history', goTo('history')),
    );
    // 設定は、PC ではサイドバーのいちばん左下に固定する
    const bottom = [
      item('book-open', '使い方', false, () => window.open(`${BASE}/help/`, '_blank', 'noopener')),
      item('settings', '設定', view === 'settings', goTo('settings'), 'side-settings'),
    ];
    if (desktop) {
      // PC は「放送卓」の並び: 左は細いアイコンの列、名前・状態・つなぐ・ためす・配信中に見る・配信の記録は上の帯
      $('rkTabs')?.remove();
      document.body.classList.remove('has-tabs');
      let top = $('rkTop');
      if (!top) { top = Object.assign(document.createElement('header'), { id: 'rkTop', className: 'rk-top' }); document.body.append(top); }
      const go = (label, next) => { const b = Object.assign(document.createElement('button'), { type: 'button', className: 'btn pressable', textContent: label }); b.setAttribute('aria-current', String(view === next)); b.addEventListener('click', goTo(next)); return b; };
      const links = Object.assign(document.createElement('div'), { className: 'rk-links' });
      links.append(go('配信の記録', 'history'));
      top.replaceChildren(brand, connection, links);
      menu.querySelectorAll('.side-item').forEach((b) => { if (/配信中に見る|配信の記録/.test(b.textContent)) b.remove(); });
      const head = document.createElement('div');
      head.className = 'side-head';
      head.append(Object.assign(document.createElement('div'), { className: 'rk-logo', textContent: 'ラ', title: 'ライコネ' }));
      const footer = document.createElement('div');
      footer.className = 'side-footer';
      footer.append(...bottom, nav);
      sideObserver?.disconnect();
      sideObserver = new ResizeObserver(() => {});
      sideObserver.observe(menu);
      side.replaceChildren(head, menu, footer);
    } else {
      const col = document.querySelector('.col');
      $('rkTop')?.remove();
      document.body.classList.add('has-tabs');
      sideObserver?.disconnect();
      side.classList.remove('has-more');
      topbar.prepend(brand);
      topbar.append(nav);
      col.prepend(connection);
      menu.append(...bottom);
      side.replaceChildren(menu);
      // 幕はサイドバーと同じ重なりの中に置く(外に置くと、サイドバーの上にかぶって押せなくなる)
      if (menuBackdrop && menuBackdrop.nextElementSibling !== side) side.before(menuBackdrop);
      // スマホは下のタブ。ウィジェットとその他は、横から出る一覧(使い方と設定もここ)を開く
      let tabsBar = $('rkTabs');
      if (!tabsBar) { tabsBar = Object.assign(document.createElement('nav'), { id: 'rkTabs', className: 'rk-tabs' }); tabsBar.setAttribute('aria-label', 'タブ'); document.body.append(tabsBar); }
      const openMenu = () => { side.classList.add('is-open'); menuBackdrop?.classList.add('is-open'); menuButton?.setAttribute('aria-expanded', 'true'); };
      const tabBtn = (iconName, label, current, onClick) => {
        const b = Object.assign(document.createElement('button'), { type: 'button', className: 'rk-tab pressable' });
        b.setAttribute('aria-current', String(current));
        b.append(icon(iconName), label); // 文字はボタンに直に置く(押せる大きさ = ボタンの大きさ)
        b.addEventListener('click', () => { closeMobileMenu(); onClick(); });
        return b;
      };
      tabsBar.replaceChildren(
        tabBtn('house', 'ホーム', view === 'home', goTo('home')),
        tabBtn('gift', 'ウィジェット', view === 'detail' || view === 'catalog', openMenu),
        tabBtn('chart-column', '記録', view === 'history', goTo('history')),
        tabBtn('menu', 'その他', view === 'more' || view === 'settings', goTo('more')),
      );
    }
    // スマホの横並びでは、選んでいるものが見えるところまで流す
    side.querySelector('[aria-current=true]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }

  function restoreChrome() {
    const topbar = document.querySelector('.topbar');
    const col = document.querySelector('.col');
    topbar.prepend(document.querySelector('.brand'));
    topbar.append($('nav'));
    col.prepend($('connectionSection'));
  }

  // 出すものを選ぶ: 目的ごとに並べる（配信者ごとの URL では、押すと出す・出さないが切り替わる）
  function renderCatalog() {
    const box = $('cards');
    const used = usedSections();
    box.replaceChildren(viewHead('その他のウィジェット', isTenant() ? '押すと出す・出さないが切り替わります。出さないものの設定は消えずに残ります。' : '使いたいものを押すと、左に入って設定できるようになります。'));
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
        if (!open) continue;
        const on = used.includes(section);
        const b = document.createElement('button');
        b.type = 'button';
        b.className = `card pressable${on ? ' used' : ''}`;
        b.setAttribute('aria-pressed', String(on));
        const head = document.createElement('span');
        head.className = 'card-head';
        head.append(icon(INFO[section].icon), Object.assign(document.createElement('span'), { className: 'card-title', textContent: schema.sections[section].title }));
        const state = document.createElement('span');
        state.className = 'card-state';
        if (on) state.append(icon('check'), '出している（押すと出さない）');
        else state.append(icon('plus'), '使う');
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

  const homeTopCards = document.querySelector('.top-cards');

  // ホームは配信前に見る3つだけに絞る。
  // 配信中に見る・配信の記録は、ダッシュボードの枠の中に開く(左の列と上の帯を残す)
  function embeddedFrame(which) {
    return Object.assign(document.createElement('iframe'), { className: 'embedded-page', title: which === 'monitor' ? '配信中に見る' : '配信の記録', src: `${BASE}/${which}/?embed=1` });
  }

  function renderEmbedded(which) {
    $('cards').replaceChildren(viewHead(which === 'monitor' ? '配信中に見る' : '配信の記録'), embeddedFrame(which));
  }

  // スマホの「その他」: 設定・使い方・その他のウィジェット
  function renderMore() {
    const list = Object.assign(document.createElement('div'), { className: 'more-list' });
    for (const [iconName, label, onClick] of [
      ['settings', '設定', goTo('settings')],
      ['book-open', '使い方', () => window.open(`${BASE}/help/`, '_blank', 'noopener')],
      ['plus', 'その他のウィジェット', goTo('catalog')],
    ]) {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: 'side-item pressable more-item' });
      b.append(icon(iconName), Object.assign(document.createElement('span'), { textContent: label }));
      b.addEventListener('click', onClick);
      list.append(b);
    }
    $('cards').replaceChildren(viewHead('その他'), list);
  }

  // ホームは「配信中に見る」。配信の準備は、初配信が終わるまで（か、バツで消すまで）だけ上に置く
  function renderHome() {
    const box = $('cards');
    const parts = [viewHead('ホーム')];
    const notice = liveNoWidgetCard();
    if (notice) parts.push(notice);
    if (!preparation.liveAt && !preparation.prepDismissedAt) parts.push(prepCard());
    parts.push(embeddedFrame('monitor'), homeTopCards);
    box.replaceChildren(...parts);
    api('/api/preparation').then((next) => {
      if (JSON.stringify(next) === JSON.stringify(preparation)) return;
      preparation = next;
      if (view === 'home') renderHome();
    }).catch(() => {});
  }

  function liveNoWidgetCard() {
    const { mode, startedAt, widgetConnected } = liveStatus;
    const liveSince = liveStartedAt ?? startedAt;
    if (mode !== 'live' || widgetConnected || !startedAt || !liveSince || Date.now() - liveSince < 60 * 1000) return null;
    const key = `live-no-widget:${startedAt}`;
    if (store.get(key, false)) return null;
    const card = Object.assign(document.createElement('section'), { className: 'home-card live-no-widget' });
    card.append(
      Object.assign(document.createElement('h2'), { textContent: '配信画面にライコネが出ていません' }),
      Object.assign(document.createElement('p'), { textContent: '配信ソフトに URL を入れると出ます。わざと使っていないなら、閉じてかまいません' }),
      Object.assign(document.createElement('p'), { textContent: '一瞬切れても、画面は直近2,000件の出来事と演出の知らせを受け取り直します。それより前の分は受け取れないことがあります' }),
    );
    const actions = Object.assign(document.createElement('div'), { className: 'row wrap' });
    const guide = Object.assign(document.createElement('button'), { type: 'button', className: 'btn primary pressable', textContent: '入れ方を見る' });
    const close = Object.assign(document.createElement('button'), { type: 'button', className: 'btn pressable', textContent: '閉じる' });
    guide.addEventListener('click', goTo('obs'));
    close.addEventListener('click', () => { store.set(key, true); card.remove(); });
    actions.append(guide, close);
    card.append(actions);
    return card;
  }

  function prepCard() {
    // GOV.UK の Task list の形: 行ごとに「済み・まだ」と、まだの行にはそれをするボタン
    const steps = [
      ['出すものを選ぶ', Boolean(preparation.selectedAt) || usedSections().length > 0, '選ぶ', goTo('catalog')],
      ['配信ソフトに入れる', Boolean(preparation.widgetAt), '入れ方を見る', goTo('obs')],
      ['ためしに動かす', Boolean(preparation.testedAt) || Boolean(store.get('sample-tried', false)), 'ためす', () => $('demoBtn')?.click()],
      ['配信で使う', Boolean(preparation.liveAt), null, null],
    ];
    const list = document.createElement('ol');
    list.className = 'home-prep';
    steps.forEach(([label, done, action, onClick]) => {
      const item = document.createElement('li');
      item.className = done ? 'done' : '';
      const state = Object.assign(document.createElement('span'), { className: 'prep-state', textContent: done ? '済み' : 'まだ' });
      item.append(icon(done ? 'check' : 'circle'), Object.assign(document.createElement('span'), { className: 'prep-label', textContent: label }), state);
      if (!done && action) {
        const b = document.createElement('button');
        b.type = 'button'; b.className = 'btn pressable'; b.textContent = action;
        b.addEventListener('click', onClick);
        item.append(b);
      } else if (!done) {
        item.append(Object.assign(document.createElement('span'), { className: 'hint', textContent: '配信を始めると印が付きます' }));
      }
      list.append(item);
    });
    const card = document.createElement('section');
    card.className = 'home-card';
    const head = document.createElement('div');
    head.className = 'home-card-head';
    head.append(Object.assign(document.createElement('h3'), { textContent: '配信の準備' }));
    const close = Object.assign(document.createElement('button'), { type: 'button', className: 'icon-btn pressable' });
    close.setAttribute('aria-label', '配信の準備を閉じる');
    close.append(icon('x'));
    close.addEventListener('click', async () => {
      try {
        preparation = await api('/api/preparation/dismiss', {}, 'PUT');
        if (view === 'home') renderHome();
      } catch (e) { setMessage(e.message, true); }
    });
    head.append(close);
    card.append(head, list);
    return card;
  }

  const fmtNum = (n) => Number(n ?? 0).toLocaleString('ja-JP');
  const fmtDuration = (ms) => { const m = Math.round((ms ?? 0) / 60000); return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60 ? `${m % 60}分` : ''}` : `${m}分`; };
  // 前回の配信のまとめ(配信中なら今の配信)。記録の一覧(/api/history)の新しいものから出す
  let historyCache = null;
  function lastStreamCard() {
    const card = Object.assign(document.createElement('section'), { className: 'home-card home-last' });
    const head = Object.assign(document.createElement('div'), { className: 'home-card-head' });
    head.append(Object.assign(document.createElement('h3'), { textContent: '前回の配信' }));
    const more = Object.assign(document.createElement('button'), { type: 'button', className: 'btn pressable', textContent: '配信の記録を見る' });
    more.addEventListener('click', goTo('history'));
    head.append(more);
    const body = Object.assign(document.createElement('div'), { className: 'home-last-body' });
    card.append(head, body);
    const fill = (list) => {
      const real = (list ?? []).filter((x) => !x.demo).sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
      const last = real[0];
      if (!last) { body.replaceChildren(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'まだ配信の記録がありません。配信すると、ここに前回のまとめが出ます。' })); return; }
      if (last.live) head.firstChild.textContent = '今の配信';
      const prev = real[1];
      const t = last.totals ?? {};
      const when = new Date(last.startedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' });
      const big = Object.assign(document.createElement('div'), { className: 'home-coins' });
      big.append(Object.assign(document.createElement('span'), { className: 'home-coins-num', textContent: fmtNum(t.coins) }), Object.assign(document.createElement('span'), { className: 'home-coins-unit', textContent: 'コイン' }));
      if (prev) {
        const diff = (t.coins ?? 0) - (prev.totals?.coins ?? 0);
        big.append(Object.assign(document.createElement('span'), { className: `home-diff ${diff >= 0 ? 'up' : 'down'}`, textContent: `前の配信より ${diff >= 0 ? '+' : ''}${fmtNum(diff)}` }));
      }
      const meta = Object.assign(document.createElement('p'), { className: 'hint', textContent: `${when}から ${fmtDuration(last.durationMs)}` });
      const stats = Object.assign(document.createElement('dl'), { className: 'home-stats' });
      for (const [k, v] of [['ギフト', `${fmtNum(t.gifts)}個`], ['送ってくれた人', `${fmtNum(t.uniqueGifters)}人`], ['いちばん送ってくれた人', last.topGifter ? `${last.topGifter.name ?? '名前なし'}(${fmtNum(last.topGifter.coins)}コイン)` : 'まだいません']]) {
        stats.append(Object.assign(document.createElement('dt'), { textContent: k }), Object.assign(document.createElement('dd'), { textContent: v }));
      }
      body.replaceChildren(meta, big, stats);
    };
    if (historyCache) fill(historyCache);
    api('/api/history').then((list) => { historyCache = list; fill(list); }).catch(() => fill([]));
    return card;
  }

  // 配信ごとの準備: 配信の種類に合わせたテンプレートと、この配信の数のリセット
  function perStreamCard() {
    const card = Object.assign(document.createElement('section'), { className: 'home-card home-per-stream' });
    card.append(Object.assign(document.createElement('h3'), { textContent: '配信ごとに' }));
    const row = Object.assign(document.createElement('div'), { className: 'home-actions' });
    const tpl = Object.assign(document.createElement('button'), { type: 'button', className: 'btn pressable', textContent: 'テンプレートから選ぶ' });
    tpl.addEventListener('click', goTo('templates'));
    // リセットは戻せないので、3秒以内にもう一度押したときだけ動く(確かめのウィンドウは出さない)
    const reset = Object.assign(document.createElement('button'), { type: 'button', className: 'btn pressable', textContent: 'この配信の数をリセット' });
    let armed = null;
    reset.addEventListener('click', async () => {
      if (!armed) {
        reset.textContent = 'もう一度押すとリセット';
        reset.classList.add('is-armed');
        armed = setTimeout(() => { armed = null; reset.textContent = 'この配信の数をリセット'; reset.classList.remove('is-armed'); }, 3000);
        return;
      }
      clearTimeout(armed); armed = null;
      reset.disabled = true;
      try { await api('/api/reset', {}); reset.textContent = 'リセットしました'; }
      catch (err) { reset.textContent = `できませんでした: ${err.message}`; }
      setTimeout(() => { reset.disabled = false; reset.textContent = 'この配信の数をリセット'; reset.classList.remove('is-armed'); }, 2500);
    });
    row.append(tpl, reset);
    card.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'テンプレートは配信の種類(雑談・罰ゲーム・耐久など)に合わせて設定をまとめて変えます。リセットはギフトの数・ランキング・WIN数などを0に戻します。' }), row);
    return card;
  }

  // 使っているウィジェット: 押すとその設定へ。URL のコピーもここから
  function usedWidgetsCard() {
    const card = Object.assign(document.createElement('section'), { className: 'home-card home-used' });
    const head = Object.assign(document.createElement('div'), { className: 'home-card-head' });
    head.append(Object.assign(document.createElement('h3'), { textContent: '使っているもの' }));
    const add = Object.assign(document.createElement('button'), { type: 'button', className: 'btn pressable', textContent: '＋ 足す' });
    add.addEventListener('click', goTo('catalog'));
    head.append(add);
    const list = Object.assign(document.createElement('ul'), { className: 'home-used-list' });
    for (const t of usedSections()) {
      const li = document.createElement('li');
      const open = Object.assign(document.createElement('button'), { type: 'button', className: 'home-used-open pressable' });
      const activeId = payload.config.active?.[t];
      const preset = activeId && payload.config[t]?.[activeId] ? (payload.config[t][activeId].kindName || payload.config[t][activeId].name || '') : '';
      open.append(icon(INFO[t]?.icon ?? 'square'), Object.assign(document.createElement('span'), { className: 'home-used-name', textContent: schema.sections[t].title }), Object.assign(document.createElement('span'), { className: 'hint', textContent: preset }));
      open.addEventListener('click', () => openCard(t, { activeId }));
      const w = payload.widgets.find((x) => x.section === t && (x.id === activeId || x.id === '*' || !x.id));
      li.append(open);
      if (w?.url) {
        const copy = Object.assign(document.createElement('button'), { type: 'button', className: 'btn pressable', textContent: 'URL をコピー' });
        copy.addEventListener('click', () => { copyText(new URL(w.url, location.href).href); flashCopied(copy, copy); });
        li.append(copy);
      }
      list.append(li);
    }
    if (!list.children.length) list.append(Object.assign(document.createElement('li'), { className: 'hint', textContent: 'まだ何も出していません。「その他のウィジェット」から選びます。' }));
    card.append(head, list);
    return card;
  }

  function autoConnectSetting() {
    const card = document.createElement('section');
    card.className = 'panel section';
    const label = document.createElement('label');
    label.className = 'check settings-auto-connect';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.checked = preparation.autoConnect !== false;
    input.addEventListener('change', async () => {
      preparation = await api('/api/preparation/auto', { on: input.checked }, 'PUT');
    });
    label.append(input, '配信が始まったら自動でつなぐ');
    card.append(
      Object.assign(document.createElement('h2'), { textContent: '配信につなぐ' }),
      Object.assign(document.createElement('p'), { className: 'hint', textContent: '配信ソフトにライコネの画面が入っていれば、配信を始めたときに自動でつながります。' }),
      label,
    );
    return card;
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
    sampleBtn.onchange = async () => { try { updateSample(await api('/api/sample', { on: sampleBtn.checked }, 'POST')); if (sampleBtn.checked) store.set('sample-tried', true); } catch (e) { sampleBtn.checked = false; setMessage(e.message, true); } };
    api('/api/sample').then(updateSample).catch(() => {}); sample.append(sampleRow, sampleText);
    const primaryRows = [];
    const otherRows = [];
    obsList().filter((w) => w.section !== 'all').forEach((w) => {
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
        copyText(new URL(w.url, location.origin).href);
        flashCopied(copy, label);
      });
      const setting = chip('設定', 'settings-2', () => { view = 'detail'; select(w.section, w.id === '*' ? undefined : w.id); });
      setting.setAttribute('aria-label', `${obsTitle(w)}の設定`);
      row.append(icon(INFO[w.section].icon), main, copy, setting);
      // map の設定がある URLを先に出し、初期設定だけの URL は下へまとめる。
      (!isObj(w.section) && entriesOf(w.section).length > 0 ? primaryRows : otherRows).push(row);
    });
    box.replaceChildren(viewHead('配信ソフトに入れる URL', 'コピーした URL を、OBS や TikTok LIVE Studio の「ブラウザ」ソースに貼ります'), sample);
    if (primaryRows.length) box.append(listGroup('コピーして貼るURL（1つにつき1ソース）', primaryRows));
    else box.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'まだ出すものがありません。左の「出すものを選ぶ」から選んでください。' }));
    if (otherRows.length) {
      const more = document.createElement('details');
      more.className = 'url-others';
      more.open = primaryRows.length === 0;
      const summary = document.createElement('summary');
      summary.textContent = 'ほかの URL';
      more.append(summary, listGroup('', otherRows));
      box.append(more);
    }
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

  let closeEntryMenuOutside = null;
  let entryMenuListening = false;
  function renderEntries() {
    const box = $('entries');
    box.replaceChildren();
    if (isObj(tab)) {
      box.hidden = true;
      return;
    }
    const names = entriesOf(tab);
    // プリセットがまだ無いときは選ぶものが無いので出さない（空のときは render 側の「まだ作っていません」が出る）
    if (!names.length) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const isRoulette = tab === 'roulettes';
    const label = document.createElement('span');
    label.className = isRoulette ? 'entry-label is-roulette' : 'entry-label';
    label.textContent = isRoulette ? '保存したルーレット' : 'プリセット';
    // プリセットの選び方: 名前の欄(ダブルクリックでその場で直せる) + ▾ のメニュー(切り替え・新しく作る・名前を変える・消す)
    const titleOf = (name) => payload.config[tab][name]?.kindName || payload.config[tab][name]?.name || payload.config[tab][name]?.title || `${schema.sections[tab].title} ${names.indexOf(name) + 1}`;
    const picker = Object.assign(document.createElement('div'), { className: 'entry-picker' });
    const nameInput = Object.assign(document.createElement('input'), { className: 'entry-name', value: titleOf(id), readOnly: true });
    nameInput.setAttribute('aria-label', isRoulette ? '保存したルーレットの名前' : `${schema.sections[tab].title}のプリセットの名前`);
    nameInput.title = 'ダブルクリックで名前を直せます';
    const toggle = Object.assign(document.createElement('button'), { type: 'button', className: 'entry-toggle pressable' });
    toggle.setAttribute('aria-label', isRoulette ? '保存したルーレットを選ぶ' : 'プリセットを選ぶ');
    toggle.setAttribute('aria-haspopup', 'menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.append(icon('chevron-down'));
    const menu = Object.assign(document.createElement('div'), { className: 'entry-menu', hidden: true });
    menu.setAttribute('role', 'menu');
    const closeMenu = () => { menu.hidden = true; toggle.setAttribute('aria-expanded', 'false'); };
    const menuItem = (text, onClick, cls = '') => {
      const b = Object.assign(document.createElement('button'), { type: 'button', className: `entry-menu-item pressable ${cls}`, textContent: text });
      b.setAttribute('role', 'menuitem');
      b.addEventListener('click', () => { closeMenu(); onClick(); });
      return b;
    };
    for (const name of names) {
      const b = menuItem(titleOf(name), async () => {
        if (name === id) return;
        select(tab, name);
        await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: ['active', tab], value: name }) });
        await reload();
        select(tab, name);
      }, name === id ? 'is-current' : '');
      menu.append(b);
    }
    menu.append(Object.assign(document.createElement('hr'), { className: 'entry-menu-line' }), menuItem('＋ 新しいプリセット', addEntry), menuItem('名前を変える', () => startInlineRename()));
    if (names.length > 1) menu.append(menuItem('このプリセットを消す', removeEntry, 'danger'));
    toggle.addEventListener('click', () => { menu.hidden = !menu.hidden; toggle.setAttribute('aria-expanded', String(!menu.hidden)); });
    // 外を押したら閉じる(描き直すたびに足さないよう、1つだけ置いて今のメニューを差し替える)
    closeEntryMenuOutside = (event) => { if (!picker.contains(event.target)) closeMenu(); };
    if (!entryMenuListening) { entryMenuListening = true; document.addEventListener('click', (event) => closeEntryMenuOutside?.(event)); }
    // その場で名前を直す: Enter か外を押したら決まる、Esc でやめる
    const startInlineRename = () => { nameInput.readOnly = false; picker.classList.add('is-editing'); nameInput.focus(); nameInput.select(); };
    const finishRename = async (save) => {
      if (nameInput.readOnly) return;
      nameInput.readOnly = true;
      picker.classList.remove('is-editing');
      const next = nameInput.value.trim();
      if (!save || !next || next === titleOf(id)) { nameInput.value = titleOf(id); return; }
      const res = await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: [tab, id], merge: true, value: { kindName: next } }) });
      const data = await res.json();
      if (data.config) payload = data;
      render();
    };
    // 1回押すとメニュー、2回続けて押すとその場で名前を直す(2回目を待ってからメニューを開く)
    let clickTimer = null;
    nameInput.addEventListener('dblclick', () => { clearTimeout(clickTimer); closeMenu(); startInlineRename(); });
    nameInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') { event.preventDefault(); finishRename(true); }
      if (event.key === 'Escape') finishRename(false);
    });
    nameInput.addEventListener('blur', () => finishRename(true));
    nameInput.addEventListener('click', () => { if (!nameInput.readOnly) return; clearTimeout(clickTimer); clickTimer = setTimeout(() => toggle.click(), 250); });
    picker.append(nameInput, toggle, menu);
    box.append(label, picker);
    if (payload.config.active?.[tab] === id) {
      const active = document.createElement('span');
      active.className = 'entry-active';
      active.textContent = '配信ではこれが出る';
      box.append(active);
    }
  }

  function openNameDialog({ title, value = '', hint = '', choices = false }) {
    const dialog = $('nameDialog');
    const form = $('nameDialogForm');
    $('nameDialogTitle').textContent = title;
    $('nameDialogInput').value = value;
    $('nameDialogHint').textContent = hint;
    $('nameDialogChoice').hidden = !choices;
    dialog.showModal();
    $('nameDialogInput').focus();
    $('nameDialogInput').select();
    dialog.onclick = (event) => { if (event.target === dialog) dialog.close('cancel'); };
    return new Promise((resolve) => dialog.addEventListener('close', () => resolve(dialog.returnValue === 'save' ? $('nameDialogInput').value.trim() : null), { once: true }));
  }

  async function renameEntry() {
    const current = payload.config[tab]?.[id];
    if (!current) return;
    const next = await openNameDialog({ title: '名前を変える', value: current.kindName || current.name || current.title || schema.sections[tab].title, hint: 'Enterで決定、Escでやめられます。' });
    if (next == null || !next.trim()) return;
    const value = { kindName: next.trim() };
    const res = await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: [tab, id], merge: true, value }) });
    const data = await res.json();
    if (data.config) payload = data;
    render();
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
      const title = await openNameDialog({ title: '新しいプリセット', hint: '配信中に見て分かる名前にしてください。', choices: true });
      if (title == null) return;
      const copy = document.querySelector('input[name="preset-copy"]:checked')?.value !== 'blank';
      value = copy ? structuredClone(payload.config[tab]?.[id] ?? {}) : {};
      value.kindName = title.trim() || `${schema.sections[tab].title} ${used.length + 1}`;
      if (tab === 'roulettes') {
        value.name = value.name || 'ルーレット';
      }
    } else {
      name = await openNameDialog({ title: '新しい設定', value: tab === 'roulettes' ? 'new-roulette' : 'new', hint: 'URLに使う名前です。英数字と - _ が使えます。' });
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
    await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: ['active', tab], value: name }) });
    await reload();
    select(tab, name);
  }

  async function removeEntry() {
    if (entriesOf(tab).length <= 1) return;
    const removed = structuredClone(payload.config[tab]?.[id]);
    const removedId = id;
    await fetch('/api/config', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ path: [tab, id], delete: true }),
    });
    await reload();
    select(tab);
    const message = $('toast') || $('formMessage');
    message.replaceChildren('消しました。');
    const undo = document.createElement('button');
    undo.type = 'button'; undo.className = 'text-btn pressable'; undo.textContent = '元に戻す';
    undo.addEventListener('click', async () => {
      await fetch('/api/config', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ path: [tab, removedId], value: removed }) });
      await reload();
      select(tab, removedId);
    }, { once: true });
    message.append(' ', undo);
    clearTimeout(removeEntry.timer);
    removeEntry.timer = setTimeout(() => message.replaceChildren(), 10_000);
  }

  // --- フォーム ---

  function render() {
    syncRushOdds = () => {};
    mediaSelectRefreshers = [];
    // 色見本をテーマの色に合わせる
    const theme = payload.config.theme ?? {};
    for (const t of ['accent', 'gold', 'ink', 'paper']) {
      if (/^#/.test(theme[t] ?? '')) document.documentElement.style.setProperty(`--tok-${t}`, theme[t]);
    }
    // かんたんの一覧: カードだけ出す
    // かんたんで、まだ何も出していないときは「出すものを足す」から始める
    if (simple() && view === 'detail' && tab !== 'theme' && !usedSections().includes(tab)) view = usedSections().length ? view : 'catalog';
    const listView = simple() && (view === 'home' || view === 'catalog' || view === 'obs' || view === 'monitor' || view === 'history' || view === 'more');
    const aiView = simple() && view === 'ai';
    const settingsViewActive = simple() && view === 'settings';
    const stageView = simple() && view === 'stage';
    const templatesViewActive = simple() && view === 'templates';
    const filesView = view === 'files';
    document.querySelector('.config-panel').hidden = !filesView;
    $('cards').hidden = !listView;
    $('profileSection').hidden = !settingsViewActive;
    $('stageView').hidden = !stageView;
    if (templatesViewActive) $('cards').hidden = false;
    $('aiView').classList.toggle('show', aiView);
    $('settingsView').hidden = !settingsViewActive;
    $('detail').hidden = listView || aiView || stageView || templatesViewActive || filesView || settingsViewActive;
    $('detailHead').hidden = !simple();
    if (simple()) renderNav();
    if (filesView) return;
    if (stageView) { stage?.render(); return; }
    if (templatesViewActive) { templatesView?.render($('cards')); return; }
    if (listView) {
      if (view === 'catalog') renderCatalog();
      else if (view === 'home') renderHome();
      else if (view === 'monitor' || view === 'history') renderEmbedded(view);
      else if (view === 'more') renderMore();
      else renderObs();
      return;
    }
    if (settingsViewActive) {
      $('profileSection').hidden = false;
      $('settingsBody').replaceChildren($('profileSection'), autoConnectSetting());
      $('settingsView').append($('advancedConnection'));
      return;
    }
    if (aiView) return;
    renderEntries();
    const def = schema.sections[tab];
    $('widgetDesc').textContent = widgetDescription(simple(), tab, INFO, def);
    $('detailTitle').textContent = def.title;
    const form = $('settings');
    form.replaceChildren();
    rouletteUrlsTarget = null;
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
    // 今の設定では効かない項目は、かんたん表示では出さない（値は消さずに残す）
    const unusable = (key) =>
      key === 'kindName' || // 種類の名前は上のプルダウン横で変える
      ['posX', 'posY', 'posScale'].includes(key) || // 位置と大きさは「1つにまとめる」で動かす
      (key === 'volume' && values.sound === false) ||
      (key === 'maxCoins' && !Number(values.minCoins));
    if (easy) {
      if (easy.note && (tab !== 'minecraft' || isTenant())) form.append(Object.assign(document.createElement('p'), { className: 'desc', textContent: easy.note }));
      for (const g of easy.groups) {
        const fields = g.fields.filter((key) => !(isMinecraftField(tab, key) && !usesMinecraft()));
        form.append(listGroup(g.title, [...(g.presets ?? []).map((preset) => presetRow(preset, values)), ...fields.map((key) => fieldFor(key, def.fields[key], values[key]))]));
      }
      // メディアは名前から選ぶ必要があるので、種類を持つ欄だけはかんたんにも出す。
      const mediaFields = Object.keys(def.fields).filter((key) => def.fields[key].mediaKind);
      if (mediaFields.length) form.append(listGroup('メディア', mediaFields.map((key) => fieldFor(key, def.fields[key], values[key]))));
      // まとまりに入っていない項目は、ここに畳んでおく（押したときだけ開く）
      const shown = new Set([...easy.groups.flatMap((g) => g.fields), ...mediaFields]);
      const others = Object.keys(def.fields).filter((k) => !shown.has(k) && !unusable(k) && !(isMinecraftField(tab, k) && !usesMinecraft()));
      if (shouldRenderDetails({ tab, restCount: others.length, streamDeckUrlCount: streamDeckUrls().length })) {
        const more = document.createElement('details');
        more.className = 'more others';
        more.open = store.get(`others-open:${tab}`, false);
        more.addEventListener('toggle', () => store.set(`others-open:${tab}`, more.open));
        const summary = document.createElement('summary');
        summary.textContent = `もっと細かく（${others.length}）`;
        const inner = document.createElement('div');
        inner.className = 'settings';
        if (tab === 'roulettes') rouletteUrlsTarget = inner;
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
      if (isTenant() && tab !== 'theme') tail.push(listRow({ iconName: 'eye-off', title: `${def.title}を使わない`, sub: '設定は残ります', trailing: null, onClick: () => dropCard(tab) }));
      if (!isObj(tab) && entriesOf(tab).length > 1) tail.push(listRow({ iconName: 'trash-2', title: 'この設定を消す', trailing: null, onClick: removeEntry }));
      if (tail.length) form.append(listGroup('そのほか', tail));
    }
    // よく使う設定を上に、それ以外は「詳しい設定」に畳む
    const basic = easy ? [] : (BASIC[tab] ?? Object.keys(def.fields)).filter((key) => !(isMinecraftField(tab, key) && !usesMinecraft()));
    for (const key of basic) form.append(fieldFor(key, def.fields[key], values[key]));
    const rest = easy ? [] : Object.keys(def.fields).filter((k) => k !== 'kindName' && !basic.includes(k) && !(isMinecraftField(tab, k) && !usesMinecraft()));
    if (shouldRenderDetails({ tab, restCount: rest.length, streamDeckUrlCount: 0 })) {
      const more = document.createElement('details');
      more.className = 'more';
      more.open = store.get('more-open', false);
      more.addEventListener('toggle', () => store.set('more-open', more.open));
      const summary = document.createElement('summary');
      summary.textContent = '詳しい設定';
      const inner = document.createElement('div');
      inner.className = 'settings';
      if (tab === 'roulettes') rouletteUrlsTarget = inner;
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
    if (tab === 'mediaAlerts') form.append(mediaLibrary());
    if (tab === 'puchuns') form.append(puchunPreviewButton());
    if (tab === 'giftSounds') {
      form.append(giftSoundStatusView({
        dev: devMode,
        api,
        setMessage,
        rules: () => (isObj(tab) ? payload.config[tab]?.rules : []) ?? [],
      }));
    }
    if (tab === 'gacha') form.append(gachaViewersView({ api, setMessage, dev: devMode }));
    // 抽選の結果（誰が・何に当たったか）は、その部品の画面に出す
    if (tab === 'omikuji' || tab === 'cardDraw' || tab === 'gacha') form.append(drawResultsView({ api, kind: tab }));
    renderActions();
    updateUrl(true);
  }

  let withHints = false; // 「ほかの項目」では、項目の説明も出す
  let syncRushOdds = () => {}; // ルーレット項目の「RUSH中の当たりやすさ」を出し入れする
  /** WIN数・タイマー・ボスを Stream Deck などから押す URL（[呼び名, URL]） */
  function streamDeckUrls() {
    const base = `${location.origin}${BASE}`;
    if (tab === 'votes') return [['はじめる', `${base}/api/vote/active/start`], ['しめきる', `${base}/api/vote/active/close`], ['結果を出す', `${base}/api/vote/active/result`], ['リセット', `${base}/api/vote/active/reset`]];
    if (tab === 'quizzes') return [['出題する', `${base}/api/quiz/active/start`], ['締めて答えを出す', `${base}/api/quiz/active/finish`], ['リセット', `${base}/api/quiz/active/reset`]];
    if (tab === 'cheers') return [['いいね ×20（テスト）', `${base}/api/cheer/active/add?value=20`], ['いいね ×100（テスト）', `${base}/api/cheer/active/add?value=100`], ['満タンにする', `${base}/api/cheer/active/fill`], ['リセット', `${base}/api/cheer/active/reset`]];
    if (tab === 'wins') return [['クリア +1', `${base}/api/wins/active/win`], ['-1', `${base}/api/wins/active/add?value=-1`], ['1つ戻す', `${base}/api/wins/active/undo`], ['リセット', `${base}/api/wins/active/reset`]];
    if (tab === 'timers') return [['スタート', `${base}/api/timer/active/start`], ['一時停止', `${base}/api/timer/active/pause`], ['止める・動かす', `${base}/api/timer/active/toggle`], ['+1分', `${base}/api/timer/active/add?seconds=60`], ['-1分', `${base}/api/timer/active/add?seconds=-60`], ['リセット', `${base}/api/timer/active/reset`]];
    if (tab === 'bosses') return [['ボス戦を開始', `${base}/api/boss/active/start`], ['HP を戻す', `${base}/api/boss/active/heal`], ['ダメージ 100', `${base}/api/boss/active/damage?value=100`], ['討伐', `${base}/api/boss/active/defeat`], ['次のボス', `${base}/api/boss/active/next`], ['1体目から', `${base}/api/boss/active/reset`]];
    if (tab === 'doors') return [['挑戦を始める', `${base}/api/door/active/start`], ['左の扉', `${base}/api/door/active/pick?n=1`], ['右の扉', `${base}/api/door/active/pick?n=2`], ['待機に戻す', `${base}/api/door/active/reset`]];
    return [];
  }

  // --- フォームの項目 (editor-forms.js) ---

  const fm = buildForms({
    api, save, pathOf, patch, isObj, simple, setMessage,
    fillSelect,
    addMediaRefresher: (fn) => mediaSelectRefreshers.push(fn),
    getSchema: () => schema, getTab: () => tab, getId: () => id,
    getPayload: () => payload, getMedia: () => media, getGifts: () => gifts,
    getDevMode: () => devMode, getWithHints: () => withHints,
    getMediaRulesEditor: () => mediaRulesEditor,
    getGachaPaidRuleEditor: () => gachaPaidRuleEditor,
    getGachaTiersEditor: () => gachaTiersEditor,
    getItemsEditor: () => itemsEditor,
    getSyncRushOdds: () => syncRushOdds,
    getCurrentWidget: () => currentWidget,
    getResetPreviewUrl: () => resetPreviewUrl,
    getFitPreview: () => fitPreview,
    getRender: () => render,
  });
  const { labelText, fieldFor, puchunPreviewButton } = fm;

  // --- メディア通知のきっかけ・ガチャの段階 (editor-media.js) ---

  const md = buildMedia({
    api, save, setMessage, fillSelect, labelText,
    getGifts: () => gifts,
    addMediaRefresher: (fn) => mediaSelectRefreshers.push(fn),
    setAlertMedia: (items) => { alertMedia = items; },
    refreshMediaSelects,
  });
  const { mediaRulesEditor, gachaPaidRuleEditor, gachaTiersEditor, mediaLibrary } = md;

  // 小さい操作ボタン（editor-preview.js / editor-minecraft.js へ渡す）
  function chip(label, iconName, onClick) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'chip pressable';
    if (iconName) b.append(icon(iconName));
    b.append(label);
    b.addEventListener('click', onClick);
    return b;
  }

  // --- ルーレットの項目 (editor-roulette.js) ---

  const rl = buildRoulette({
    save, setMessage,
    getSchema: () => schema, getMedia: () => media,
    getSuperstream: () => superstream, usesMinecraft,
    setSyncRushOdds: (fn) => { syncRushOdds = fn; },
  });
  const { itemsEditor } = rl;

  // --- URL・プレビュー・操作 (editor-preview.js) ---

  const pv = buildPreview({
    api, setMessage, chip, goTo,
    getTab: () => tab, getId: () => id,
    getPayload: () => payload, getSchema: () => schema,
    getLive: () => live, getDevMode: () => devMode,
    getSuperstream: () => superstream,
    getRouletteUrlsTarget: () => rouletteUrlsTarget,
    simple, isObj, isTenant,
  });
  const { currentWidget, updateUrl, fitPreview, renderActions, resetPreviewUrl } = pv;


  // --- マイクラ連携 (editor-minecraft.js) ---

  const mc = buildMinecraft({
    tab: () => tab, api, isTenant, chip,
    me: () => me, payload: () => payload, superstream: () => superstream,
  });
  const { renderSide, renderMcStatus, renderMcLog } = mc;
  const mcLog = mc.mcLog;

  // --- YAML と AI (editor-ai.js) ---

  return {
    async start() {
      let env = { dev: false };
      let mcStatusInit;
      [schema, payload, media, gifts, superstream, mcStatusInit, me, env] = await Promise.all([
        api('/api/config/schema'),
        api('/api/config'),
        api('/api/media').catch(() => []),
        api('/api/gifts').catch(() => []),
        api('/api/superstream').catch(() => ({ gifts: [] })),
        api('/api/minecraft').catch(() => null),
        api('/api/me').catch(() => ({ mode: 'local' })),
        api('/api/env').catch(() => ({ dev: false })),
      ]);
      mc.setMcStatus(mcStatusInit);
      alertMedia = (await api('/api/media-alerts').catch(() => ({}))).items || [];
      preparation = await api('/api/preparation').catch(() => preparation);
      devMode = env?.dev === true;
      if (isTenant()) document.querySelector('.brand-title').textContent = `${me.name} のライコネ`;
      // TikTok の署名キーは、配信者ごとの URL では管理者が入れる
      if (isTenant()) document.querySelector('#connectForm details')?.toggleAttribute('hidden', true);
      stage = createStage({
        api,
        getPayload: () => payload,
        getMe: () => me,
        onChanged: (data) => { if (data.config) payload = data; render(); },
        onTemplate: async () => { me = await api('/api/me'); renderPicker(); renderNav(); },
        openWidget: (section, entry) => { view = 'detail'; select(section, entry); },
      });
      templatesView = createTemplatesView({
        api,
        isLive: () => live,
        onChanged: async () => { await reload(); me = await api('/api/me').catch(() => me); renderNav(); },
      });
      await templatesView.start($('cards'));
      renderPicker();
      $('yamlText').value = payload.yaml;
      renderYamlIssues(payload.errors, payload.warnings);
      await setupYaml({
        api, isTenant, render, reload,
        getPayload: () => payload, setPayload: (d) => { payload = d; },
        getYamlDirty: () => yamlDirty, setYamlDirty: (v) => { yamlDirty = v; },
      });
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
      const next = { mode: status.mode, startedAt: status.startedAt ?? null, widgetConnected: typeof status.widgetConnected === 'boolean' ? status.widgetConnected : liveStatus.widgetConnected };
      if (next.mode === 'live' && liveStatus.mode !== 'live') liveStartedAt = Date.now();
      if (next.mode !== 'live') liveStartedAt = null;
      liveStatus = next;
      $('actions').classList.toggle('live', live);
      // 出す・消すが変わるときだけ描き直す(毎回描き直すと見本の iframe が読み直しになる)
      if (view === 'home' && !!liveNoWidgetCard() !== !!document.querySelector('.live-no-widget')) renderHome();
      // デモ中は状態が5秒ごとに来る。済みになるまでの1回だけ描き直す(見本の iframe を読み直さない)
      if (view === 'home' && status.mode === 'demo' && !preparation.testedAt) {
        api('/api/preparation').then((nextPreparation) => {
          preparation = nextPreparation;
          if (view === 'home') renderHome();
        }).catch(() => {});
      }
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
