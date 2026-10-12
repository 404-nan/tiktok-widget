// ギフト名を一覧から選ぶ共通部品。保存する値は今までどおり名前の配列。

let giftListPromise;

async function giftList() {
  giftListPromise ??= fetch('/api/gifts').then((r) => (r.ok ? r.json() : [])).catch(() => []);
  return giftListPromise;
}

const sortGifts = (gifts) => [...new Map(gifts.filter((g) => g?.name).map((g) => [g.name, g])).values()]
  .sort((a, b) => Number(Boolean(b.seen)) - Number(Boolean(a.seen)) || (a.diamonds ?? 0) - (b.diamonds ?? 0) || a.name.localeCompare(b.name));

export function giftPicker({ value = [], gifts = [], onChange }) {
  const root = document.createElement('div');
  root.className = 'gift-picker';
  let selected = [...new Set(value.filter(Boolean))];
  let all = sortGifts(gifts);
  let open = false;

  const chips = document.createElement('div');
  chips.className = 'gift-picker-chips';
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'gift-picker-add pressable';
  add.textContent = '＋ ギフトを足す';
  chips.append(add);

  const panel = document.createElement('div');
  panel.className = 'gift-picker-panel';
  panel.hidden = true;
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'gift-picker-search';
  search.placeholder = 'ギフト名で絞り込む';
  search.setAttribute('aria-label', 'ギフト名で絞り込む');
  const list = document.createElement('div');
  list.className = 'gift-picker-list';
  panel.append(search, list);
  root.append(chips, panel);

  const notify = () => onChange?.([...selected]);
  const drawChips = () => {
    chips.replaceChildren();
    for (const name of selected) {
      const chip = document.createElement('span');
      chip.className = 'gift-picker-chip';
      chip.append(Object.assign(document.createElement('span'), { textContent: name }));
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'gift-picker-remove pressable';
      remove.setAttribute('aria-label', `${name}を外す`);
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        selected = selected.filter((v) => v !== name);
        drawChips();
        notify();
      });
      chip.append(remove);
      chips.append(chip);
    }
    chips.append(add);
  };
  const choose = (name) => {
    if (!name || selected.includes(name)) return;
    selected.push(name);
    drawChips();
    notify();
  };
  const drawList = () => {
    const query = search.value.trim().toLocaleLowerCase();
    list.replaceChildren();
    const filtered = all.filter((g) => g.name.toLocaleLowerCase().includes(query));
    const seen = filtered.filter((g) => g.seen);
    const normal = filtered.filter((g) => !g.seen);
    const group = (title, rows) => {
      if (!rows.length) return;
      list.append(Object.assign(document.createElement('p'), { className: 'gift-picker-group', textContent: title }));
      for (const g of rows) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'gift-picker-option pressable';
        b.disabled = selected.includes(g.name);
        b.append(Object.assign(document.createElement('span'), { textContent: g.name }), Object.assign(document.createElement('small'), { textContent: `${g.diamonds ?? 0} コイン` }));
        b.addEventListener('click', () => choose(g.name));
        list.append(b);
      }
    };
    group('この配信で届いたギフト', seen);
    group('ギフト一覧', normal);
    if (query && !all.some((g) => g.name.toLocaleLowerCase() === query)) {
      const custom = document.createElement('button');
      custom.type = 'button';
      custom.className = 'gift-picker-custom pressable';
      custom.textContent = `「${search.value.trim()}」を足す`;
      custom.addEventListener('click', () => { choose(search.value.trim()); search.value = ''; drawList(); });
      list.prepend(custom);
    }
    if (!seen.length && !normal.length && !query) list.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'ギフトがありません。名前を入力してください。' }));
  };
  const setOpen = (next) => {
    open = next;
    panel.hidden = !open;
    add.setAttribute('aria-expanded', String(open));
    if (open) { drawList(); requestAnimationFrame(() => search.focus()); }
  };
  add.setAttribute('aria-expanded', 'false');
  add.addEventListener('click', () => setOpen(!open));
  search.addEventListener('input', drawList);
  root.addEventListener('keydown', (e) => { if (e.key === 'Escape') { setOpen(false); add.focus(); } });
  document.addEventListener('click', (e) => { if (open && !root.contains(e.target)) setOpen(false); });
  giftList().then((remote) => { all = sortGifts([...all, ...remote]); if (open) drawList(); });
  drawChips();
  return root;
}
