// 配信の準備。配信の種類（presets/ のひな形）を選んで config.yaml に入れ、目標の WIN 数を決め、
// OBS に入れる URL を出す。配信中は WIN のボタン（クリア・ボーナス・戻す）をここで押せる。

import { connect, icon } from '/widgets/lib/overlay.js';
import { $, api, setupChrome, statusText, store } from '/dashboard/common.js';
import { fmtNum } from '/dashboard/charts.js';

setupChrome('stream');

const WIN_ID = 'default'; // ひな形は wins.default を使う
let presets = [];
let current = null; // 今使っているひな形（{ id, name, appliedAt }）
let selected = null; // 一覧で見ているひな形の id
let config = null;
let winCount = { wins: 0 };

const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const shown = () => presets.find((p) => p.id === selected) ?? presets.find((p) => p.id === current?.id) ?? presets[0] ?? null;
const active = () => presets.find((p) => p.id === current?.id) ?? null;

// --- ひな形の一覧 ---

async function loadPresets() {
  const r = await api('/api/presets');
  presets = r.presets;
  current = r.current;
  if (!presets.some((p) => p.id === selected)) selected = current?.id ?? presets[0]?.id ?? null;
  renderAll();
}

function renderPresets() {
  const box = $('presets');
  if (!presets.length) {
    box.replaceChildren(el('p', 'hint', 'presets/ にひな形がありません'));
    return;
  }
  box.replaceChildren(
    ...presets.map((p) => {
      const isCurrent = p.id === current?.id;
      const row = el('div', `preset${isCurrent ? ' current' : ''}`);
      row.setAttribute('aria-selected', String(p.id === selected));
      const mark = el('span', 'mark');
      mark.title = isCurrent ? '使用中' : '';
      const name = el('button', 'name text-btn pressable', p.name ?? p.id);
      name.type = 'button';
      name.addEventListener('click', () => {
        selected = p.id;
        renderAll();
      });
      const btn = el('button', `btn pressable${isCurrent ? '' : ' primary'}`, isCurrent ? '使用中' : 'この配信にする');
      btn.type = 'button';
      btn.addEventListener('click', () => applyPreset(p));
      row.append(mark, name, btn, el('div', 'sum', p.summary ?? ''), el('div', 'game', p.game ?? ''));
      return row;
    }),
  );
}

async function applyPreset(p) {
  const again = p.id === current?.id;
  const ask = `「${p.name ?? p.id}」${again ? 'をもう一度入れ直します' : 'にします'}。\nWIN・ルーレット・RUSH・Minecraft のルールが入れ替わります（前の設定は data/backups/ に残ります）。\nWIN の数はそのままです。`;
  if (!confirm(ask)) return;
  const msg = $('presetMsg');
  msg.classList.remove('error');
  msg.textContent = '切り替えています…';
  try {
    const r = await api(`/api/presets/${encodeURIComponent(p.id)}/apply`, {});
    current = r.current;
    selected = p.id;
    msg.textContent = `「${p.name ?? p.id}」にしました。目標は ${p.goal ?? 0} WIN。Minecraft は「配信の前に」の「Minecraft をこのゲームにする」で切り替えます`;
    await loadPresets();
  } catch (err) {
    msg.classList.add('error');
    msg.textContent = `切り替えられませんでした: ${err.message}`;
  }
}

// --- 今の配信（WIN 数・目標・ボタン） ---

function goal() {
  return config?.wins?.[WIN_ID]?.goal ?? 0;
}

function renderNow() {
  const p = active();
  $('nowName').textContent = p ? p.name : 'ひな形を選んでください';
  $('nowClear').textContent = p?.clear ? `クリア: ${p.clear}` : '';
  const v = $('winValue');
  v.textContent = fmtNum(winCount.wins ?? 0);
  v.classList.toggle('minus', (winCount.wins ?? 0) < 0);
  $('winGoal').textContent = goal() > 0 ? `/ ${fmtNum(goal())}` : '';
  const input = $('goalInput');
  if (document.activeElement !== input) input.value = goal();
  renderWinButtons(p);
}

function renderWinButtons(p) {
  const send = (action, value) => api('/api/control', { target: 'wins', action, data: { id: WIN_ID, value } });
  const btn = (label, iconName, cls, onClick) => {
    const b = el('button', `chip pressable ${cls}`);
    b.type = 'button';
    b.append(icon(iconName), label);
    b.addEventListener('click', onClick);
    return b;
  };
  const custom = (p?.buttons?.length ? p.buttons : [{ label: 'クリア', action: 'win' }]).map((b, i) => {
    const isWin = b.action === 'win';
    const n = Number(b.value);
    const label = isWin ? `${b.label} +1` : `${b.label} ${n > 0 ? '+' : ''}${n}`;
    return btn(label, isWin ? 'trophy' : n > 0 ? 'plus' : 'minus', i === 0 && isWin ? 'win-btn' : '', () => (isWin ? send('win') : send('add', n)));
  });
  $('winButtons').replaceChildren(
    ...custom,
    btn('戻す', 'undo-2', 'sub', () => send('undo')),
    btn('リセット', 'rotate-ccw', 'sub', () => {
      if (confirm('WIN を 0 にリセットしますか？（「戻す」で元に戻せます）')) send('reset');
    }),
  );
}

// 目標は打ったら少し待って保存する（config.yaml の wins.default.goal）
let goalTimer = null;
function saveGoal(n) {
  const value = Math.max(0, Math.round(Number(n) || 0));
  $('goalInput').value = value;
  clearTimeout(goalTimer);
  goalTimer = setTimeout(async () => {
    const msg = $('goalMsg');
    msg.classList.remove('error');
    if (!config?.wins?.[WIN_ID]) {
      msg.classList.add('error');
      msg.textContent = '先に配信の種類を選んでください';
      return;
    }
    try {
      await api('/api/config', { path: `wins.${WIN_ID}.goal`, value }, 'PATCH');
      msg.textContent = value > 0 ? `目標を ${value} WIN にしました` : '目標を出さないようにしました';
    } catch (err) {
      msg.classList.add('error');
      msg.textContent = `保存できませんでした: ${err.message}`;
    }
  }, 500);
}
$('goalInput').addEventListener('input', (e) => saveGoal(e.target.value));
$('goalDown').addEventListener('click', () => saveGoal(Number($('goalInput').value) - 1));
$('goalUp').addEventListener('click', () => saveGoal(Number($('goalInput').value) + 1));

// --- ギフトの早見表 ---

function renderGifts() {
  const p = shown();
  const body = $('giftRows');
  if (!p?.gifts?.length) {
    const tr = el('tr');
    const td = el('td', 'empty', 'ひな形を選ぶと出ます');
    td.colSpan = 3;
    tr.append(td);
    body.replaceChildren(tr);
    return;
  }
  body.replaceChildren(
    ...p.gifts.map((g) => {
      const tr = el('tr');
      const name = el('td', 'gift', g.gift);
      if (g.coins != null) name.append(el('span', 'coins', `${fmtNum(g.coins)} コイン`));
      const win = el('td', 'num');
      if (g.win === 'reset') win.textContent = '0 に戻す';
      else if (typeof g.win === 'number') {
        win.textContent = `${g.win > 0 ? '+' : ''}${g.win}`;
        win.classList.add(g.win < 0 ? 'loss' : 'gain');
      } else if (g.win) win.textContent = g.win;
      const what = el('td', 'what');
      if (g.rush) what.append(el('span', 'tag', 'RUSH 突入'));
      if (g.roulette) what.append(el('span', 'tag', `${g.roulette}を回す`));
      what.append(g.effects.join('・'));
      tr.append(name, win, what);
      return tr;
    }),
  );
}

// --- 配信画面に出す ---

const origin = location.origin;
$('stageUrl').value = `${origin}/widgets/stage.html`;

function renderStage() {
  const box = $('stagePreview');
  if (!box.firstChild) {
    const f = document.createElement('iframe');
    f.title = 'まとめ表示の見本';
    f.src = '/widgets/stage.html';
    box.append(f);
    const fit = () => (f.style.transform = `scale(${box.clientWidth / 1080})`);
    new ResizeObserver(fit).observe(box);
  }
  const p = shown();
  $('widgetLinks').replaceChildren(
    ...(p?.layout ?? []).map((l, i) => {
      const li = el('li');
      const title = el('div', 'w-title', l.widget);
      title.append(el('span', 'w-size', `${l.w} × ${l.h}`));
      const row = el('div', 'url-row');
      const input = el('input');
      input.readOnly = true;
      input.id = `wl-${i}`;
      input.value = `${origin}/widgets/${l.widget}.html${l.query ? `?${l.query}` : ''}`;
      const copy = el('button', 'btn pressable');
      copy.type = 'button';
      copy.dataset.copy = input.id;
      copy.append(icon('copy'), 'コピー');
      row.append(input, copy);
      li.append(title, row);
      return li;
    }),
  );
}

document.addEventListener('click', async (e) => {
  const b = e.target.closest('[data-copy]');
  if (!b) return;
  const input = $(b.dataset.copy);
  try {
    await navigator.clipboard.writeText(input.value);
  } catch {
    input.select();
    document.execCommand('copy');
  }
  const prev = b.lastChild.textContent;
  b.lastChild.textContent = 'コピーしました';
  setTimeout(() => (b.lastChild.textContent = prev), 1400);
});

// --- 配信の前に（チェックはこのブラウザに覚えておく） ---

function renderSetup() {
  const p = shown();
  const key = `setup:${p?.id}`;
  const done = new Set(store.get(key, []));
  $('setup').replaceChildren(
    ...(p?.setup ?? []).map((text, i) => {
      const li = el('li');
      const label = el('label');
      const box = el('input');
      box.type = 'checkbox';
      box.checked = done.has(i);
      box.addEventListener('change', () => {
        if (box.checked) done.add(i);
        else done.delete(i);
        store.set(key, [...done]);
      });
      label.append(box, el('span', '', text));
      li.append(label);
      return li;
    }),
  );
}

function renderMinecraft(status) {
  const line = $('mcLine');
  if (config && !config.minecraft?.enabled) {
    line.dataset.state = 'off';
    $('mcText').textContent = 'Minecraft 連携はオフ（設定 → Minecraft 連携）';
    return;
  }
  if (!status) return;
  line.dataset.state = status.state;
  $('mcText').textContent = status.state === 'ok' ? 'Minecraft につながっています' : status.message;
}

// --- Minecraft をこのゲームにする（パネルなら 止める → 世界 → 起動 → コマンド） ---

let preparing = false;

function renderServerPrep() {
  const p = active();
  const btn = $('serverBtn');
  const panel = config?.minecraft?.via === 'panel';
  btn.disabled = preparing || !p?.server;
  const world = p?.server?.world;
  $('serverHint').textContent = !p
    ? '先に配信の種類を選んでください'
    : !p.server
      ? 'このひな形にはサーバーの準備が書かれていません'
      : panel
        ? `サーバーを一度止めて、${world === 'new' ? '新しい世界' : world ? `世界「${world}」` : '今の世界'}で起動し直し、ゲームの設定のコマンドを送ります（入っている人は一度抜けます）`
        : 'RCON では世界は変えられないので、ゲームの設定のコマンドだけ送ります';
}

$('serverBtn').addEventListener('click', async () => {
  const p = active();
  if (!p) return;
  const panel = config?.minecraft?.via === 'panel';
  if (panel && !confirm(`Minecraft サーバーを「${p.name}」用にします。\nサーバーを一度止めて起動し直します。入っている人は一度抜けます。`)) return;
  const msg = $('serverMsg');
  msg.className = 'message';
  msg.textContent = '始めています…';
  try {
    await api(`/api/presets/${encodeURIComponent(p.id)}/server`, {});
    preparing = true;
    renderServerPrep();
  } catch (err) {
    msg.classList.add('error');
    msg.textContent = err.message;
  }
});

function onServerSetup(m) {
  const msg = $('serverMsg');
  msg.className = `message${m.state === 'error' ? ' error' : m.state === 'done' ? ' done' : ''}`;
  msg.textContent = m.state === 'error' ? `できませんでした: ${m.text}` : m.state === 'done' && m.world ? `準備ができました（世界: ${m.world}）` : m.text;
  preparing = m.state === 'step';
  renderServerPrep();
}

// --- まとめて描く ---

function renderAll() {
  renderPresets();
  renderNow();
  renderGifts();
  renderStage();
  renderSetup();
  renderServerPrep();
}

let mcStatus = null;
function renderStatus(status) {
  $('status').dataset.mode = status.mode;
  $('statusText').textContent = statusText(status);
}

connect({
  hello(status) {
    renderStatus(status);
  },
  status: renderStatus,
  config(c) {
    config = c;
    renderNow();
    renderServerPrep();
    renderMinecraft(mcStatus);
  },
  wins(msg) {
    if (msg.id !== WIN_ID) return;
    winCount = msg.counter;
    renderNow();
  },
  minecraft(msg) {
    mcStatus = msg.status;
    renderMinecraft(mcStatus);
  },
  preset() {
    loadPresets();
  },
  serverSetup: onServerSetup,
});

// hello では config が handlers.config に来ないので、最初に取りに行く
api('/api/config').then((r) => {
  config = r.config;
  renderNow();
  renderServerPrep();
  renderMinecraft(mcStatus);
});
api('/api/wins').then((w) => {
  winCount = w[WIN_ID] ?? { wins: 0 };
  renderNow();
});
api('/api/status').then((st) => {
  renderStatus(st.status);
  mcStatus = st.minecraft;
  renderMinecraft(mcStatus);
});
loadPresets().catch((err) => {
  $('presetMsg').classList.add('error');
  $('presetMsg').textContent = `ひな形を読めませんでした: ${err.message}`;
});
