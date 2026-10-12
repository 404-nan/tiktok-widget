// 配信画面の見本と、置き場所を動かす操作。
const SIZE = [1080, 1920];
const PAGES = {
  alerts: ['ギフト通知', 'gift-alert', [760, 200]], chats: ['コメント欄', 'chat', [460, 640]], jars: ['ギフト瓶', 'gift-jar', [500, 700]],
  goals: ['目標バー', 'goal', [640, 180]], wins: ['WIN数', 'wins', [600, 200]], timers: ['タイマー', 'timer', [720, 260]],
  bosses: ['ボス討伐', 'boss', [720, 260]], counters: ['いいね・視聴者数', 'counter', [560, 220]], rankings: ['ランキング', 'ranking', [420, 416]], roulettes: ['ルーレット', 'roulette', [600, 680]],
};
const DEFAULTS = { alerts: [4, 9], chats: [55, 4], jars: [10, 22], goals: [40, 18], wins: [4, 84], timers: [52, 70], bosses: [5, 39], counters: [4, 55], rankings: [60, 48], roulettes: [40, 43] };

export function createStage({ api, getPayload, getMe, onChanged, openWidget }) {
  const root = document.querySelector('#stageView');
  let preview = null;
  let frame = null;
  let viewScale = 1;
  const patch = async (section, id, key, value) => {
    const data = await api('/api/config', { path: [section, id, key], value }, 'PATCH');
    onChanged?.(data);
  };
  const copy = async (text) => {
    try { await navigator.clipboard.writeText(text); } catch { prompt('この URL をコピーしてください', text); }
  };
  const fit = () => {
    if (!frame || !preview) return;
    const maxH = Math.min(innerHeight * .7, 720);
    viewScale = Math.min(1, preview.clientWidth / SIZE[0], maxH / SIZE[1]);
    frame.style.width = `${SIZE[0]}px`; frame.style.height = `${SIZE[1]}px`;
    frame.style.transform = `scale(${viewScale})`;
    frame.style.left = `${Math.max(0, (preview.clientWidth - SIZE[0] * viewScale) / 2)}px`;
    const boxes = preview.querySelector('.stage-boxes');
    if (boxes) { boxes.style.transform = `scale(${viewScale})`; boxes.style.left = frame.style.left; }
    preview.style.height = `${SIZE[1] * viewScale}px`;
  };
  const label = (text) => Object.assign(document.createElement('span'), { className: 'stage-box-label', textContent: text });
  function bounds(box, x, y, w, h) {
    const maxX = Math.max(0, SIZE[0] - w); const maxY = Math.max(0, SIZE[1] - h);
    return [Math.max(0, Math.min(maxX, x)), Math.max(0, Math.min(maxY, y))];
  }
  function drawBox(box, section, id, entry, index) {
    const [, , baseSize] = PAGES[section];
    const scale = Math.max(.2, Math.min(3, Number(entry.posScale) || 1));
    const w = baseSize[0] * scale; const h = baseSize[1] * scale;
    const defaults = DEFAULTS[section] ?? [8, 9];
    const [x, y] = bounds(box, SIZE[0] * ((Number.isFinite(entry.posX) ? entry.posX : defaults[0] + index * 3) / 100), SIZE[1] * ((Number.isFinite(entry.posY) ? entry.posY : defaults[1] + index * 4) / 100), w, h);
    box.style.width = `${w}px`; box.style.height = `${h}px`; box.style.left = `${x}px`; box.style.top = `${y}px`; box.style.transform = '';
    box.dataset.x = x; box.dataset.y = y; box.dataset.w = w; box.dataset.h = h;
    const handle = document.createElement('span'); handle.className = 'stage-box-handle'; handle.setAttribute('aria-label', '大きさを変える');
    box.replaceChildren(label(PAGES[section][0]), handle);
    let moved = false; let start = null;
    const move = (ev) => {
      if (!start) return;
      moved = true;
      const dx = (ev.clientX - start.x) / viewScale; const dy = (ev.clientY - start.y) / viewScale;
      const [nx, ny] = bounds(box, start.left + dx, start.top + dy, w, h);
      box.style.left = `${nx}px`; box.style.top = `${ny}px`;
    };
    const end = async () => {
      if (!start) return;
      try { box.releasePointerCapture?.(start.pointerId); } catch {}
      document.removeEventListener('pointermove', move); document.removeEventListener('pointerup', end);
      const xValue = Math.round(parseFloat(box.style.left) / SIZE[0] * 1000) / 10;
      const yValue = Math.round(parseFloat(box.style.top) / SIZE[1] * 1000) / 10;
      if (moved) {
        const data = await api('/api/config', { path: [section, id], merge: true, value: { posX: xValue, posY: yValue } }, 'PATCH');
        onChanged?.(data);
      }
      else openWidget?.(section, id);
      start = null;
    };
    box.onpointerdown = (ev) => { if (ev.target === handle) return; start = { x: ev.clientX, y: ev.clientY, left: x, top: y, pointerId: ev.pointerId }; moved = false; try { box.setPointerCapture?.(ev.pointerId); } catch {} document.addEventListener('pointermove', move); document.addEventListener('pointerup', end); };
    box.onpointerup = end; box.onpointercancel = end;
    handle.onpointerdown = (ev) => {
      ev.stopPropagation(); ev.preventDefault();
      const sx = ev.clientX; const sy = ev.clientY; const startScale = scale;
      const resize = (e) => { const next = Math.max(.2, Math.min(3, startScale + Math.max(e.clientX - sx, e.clientY - sy) / viewScale / Math.max(baseSize[0], baseSize[1]))); box.style.width = `${baseSize[0] * next}px`; box.style.height = `${baseSize[1] * next}px`; };
      const done = async () => { document.removeEventListener('pointermove', resize); document.removeEventListener('pointerup', done); await patch(section, id, 'posScale', Math.round(parseFloat(box.style.width) / baseSize[0] * 100) / 100); };
      document.addEventListener('pointermove', resize); document.addEventListener('pointerup', done, { once: true });
    };
  }
  function render() {
    const payload = getPayload(); if (!payload || !root) return;
    const config = payload.config ?? {}; const me = getMe() ?? {};
    const full = payload.widgets?.find((w) => w.section === 'all')?.url ?? `${location.origin}/widgets/all.html`;
    root.replaceChildren();
    const head = document.createElement('div'); head.className = 'stage-head';
    head.append(Object.assign(document.createElement('h3'), { textContent: '配信画面' }), Object.assign(document.createElement('p'), { className: 'desc', textContent: 'この1つの URL を OBS / TikTok LIVE Studio に入れると、下の画面がそのまま出ます。' }));
    const url = document.createElement('div'); url.className = 'stage-url';
    const input = Object.assign(document.createElement('input'), { readOnly: true, value: full, 'aria-label': '全部まとめての URL' });
    const copyButton = Object.assign(document.createElement('button'), { className: 'btn primary pressable', type: 'button', textContent: 'コピー' }); copyButton.onclick = async () => { await copy(full); copyButton.textContent = 'コピーしました'; setTimeout(() => copyButton.textContent = 'コピー', 1400); };
    url.append(input, copyButton); root.append(head, url, Object.assign(document.createElement('p'), { className: 'hint stage-size', textContent: '幅 1080・高さ 1920' }));
    preview = document.createElement('div'); preview.className = 'stage-preview';
    frame = document.createElement('iframe'); frame.title = '配信画面の見本'; frame.src = `${new URL(full, location.href).pathname}?preview=1&sound=0`; preview.append(frame);
    const boxes = document.createElement('div'); boxes.className = 'stage-boxes';
    for (const [section, info] of Object.entries(PAGES)) {
      if (me.mode === 'tenant' && !me.widgets?.includes(section)) continue;
      const entries = Object.entries(config[section] ?? {});
      entries.forEach(([id, entry], index) => { if (entry.inAll !== false) { const box = document.createElement('button'); box.type = 'button'; box.className = 'stage-box'; drawBox(box, section, id, entry, index); boxes.append(box); } });
    }
    preview.append(boxes); root.append(preview);
    const actions = document.createElement('div'); actions.className = 'row wrap stage-actions';
    const gift = Object.assign(document.createElement('button'), { className: 'btn primary pressable', type: 'button', textContent: 'テストのギフトを送る' }); gift.onclick = () => api('/api/simulate', { kind: 'gift' });
    const demo = Object.assign(document.createElement('button'), { className: 'btn pressable', type: 'button', textContent: 'デモを流す / 止める' }); demo.onclick = async () => { const status = await api('/api/status'); await api('/api/demo', { on: !status.demo }); };
    actions.append(gift, demo); root.append(actions);
    const rows = document.createElement('div'); rows.className = 'stage-list'; rows.append(Object.assign(document.createElement('h4'), { textContent: '出しているもの' }));
    for (const [section, info] of Object.entries(PAGES)) for (const [id, entry] of Object.entries(config[section] ?? {})) {
      const row = document.createElement('label'); row.className = 'stage-row'; const name = document.createElement('span'); name.textContent = `${info[0]}${Object.keys(config[section]).length > 1 ? ` ${id}` : ''}`;
      const toggle = Object.assign(document.createElement('input'), { type: 'checkbox', checked: entry.inAll !== false }); toggle.onchange = () => patch(section, id, 'inAll', toggle.checked); row.append(name, toggle); rows.append(row);
    }
    root.append(rows); requestAnimationFrame(fit);
  }
  window.addEventListener('resize', fit);
  return { render };
}
