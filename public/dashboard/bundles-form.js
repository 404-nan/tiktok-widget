// リンクまとめの編集画面。まとめごとに「名前」「入れるウィジェット」「配信ソフトに入れる URL」を出す。
// 保存は onSave(新しい一覧) に丸ごと渡す（検証と正規化はサーバー側 src/config.js の bundleList が正本）。
export function bundleListView({ value, eligible, titles, links, onSave }) {
  const root = document.createElement('div');
  root.className = 'bundle-list';
  let list = (Array.isArray(value) ? value : []).map((b) => ({ id: b.id, name: b.name, widgets: [...(b.widgets ?? [])] }));

  const newId = () => `b${Date.now().toString(36)}${Math.floor(Math.random() * 1296).toString(36)}`;
  const linkFor = (id) => links.find((w) => w.id === id)?.url ?? '';

  function render() {
    root.replaceChildren();
    if (!list.length) {
      const empty = document.createElement('p');
      empty.className = 'hint';
      empty.textContent = 'まだまとめがありません。下のボタンから作れます。';
      root.append(empty);
    }
    list.forEach((bundle, index) => {
      const box = document.createElement('div');
      box.className = 'bundle-box';

      const nameRow = document.createElement('div');
      nameRow.className = 'bundle-row';
      const nameLabel = document.createElement('span');
      nameLabel.className = 'field-label';
      nameLabel.textContent = '名前';
      const name = document.createElement('input');
      name.type = 'text';
      name.value = bundle.name ?? '';
      name.maxLength = 40;
      name.setAttribute('aria-label', 'まとめの名前');
      name.addEventListener('input', () => {
        bundle.name = name.value;
        onSave(list);
      });
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = 'このまとめを消す';
      del.addEventListener('click', () => {
        list = list.filter((_, i) => i !== index);
        onSave(list);
        render();
      });
      nameRow.append(nameLabel, name, del);
      box.append(nameRow);

      const pickLabel = document.createElement('span');
      pickLabel.className = 'field-label';
      pickLabel.textContent = '入れるウィジェット';
      box.append(pickLabel);
      const picks = document.createElement('div');
      picks.className = 'bundle-picks';
      for (const key of eligible) {
        const lab = document.createElement('label');
        lab.className = 'bundle-pick';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = bundle.widgets.includes(key);
        cb.addEventListener('change', () => {
          bundle.widgets = cb.checked ? [...bundle.widgets, key] : bundle.widgets.filter((w) => w !== key);
          onSave(list);
        });
        lab.append(cb, document.createTextNode(titles[key] ?? key));
        picks.append(lab);
      }
      box.append(picks);

      const url = linkFor(bundle.id);
      const urlRow = document.createElement('div');
      urlRow.className = 'bundle-row';
      const urlLabel = document.createElement('span');
      urlLabel.className = 'field-label';
      urlLabel.textContent = '配信ソフトに入れる URL';
      urlRow.append(urlLabel);
      if (url) {
        const input = document.createElement('input');
        input.type = 'text';
        input.readOnly = true;
        input.value = url;
        input.setAttribute('aria-label', '配信ソフトに入れる URL');
        const copy = document.createElement('button');
        copy.type = 'button';
        copy.textContent = 'コピー';
        copy.addEventListener('click', () => {
          input.select();
          navigator.clipboard?.writeText(url).catch(() => {});
        });
        urlRow.append(input, copy);
      } else {
        const note = document.createElement('span');
        note.className = 'hint';
        note.textContent = '保存すると URL が出ます';
        urlRow.append(note);
      }
      box.append(urlRow);
      root.append(box);
    });

    const add = document.createElement('button');
    add.type = 'button';
    add.textContent = 'まとめを作る';
    add.disabled = list.length >= 10;
    add.addEventListener('click', () => {
      list = [...list, { id: newId(), name: 'まとめ', widgets: [] }];
      onSave(list);
      render();
    });
    root.append(add);
    if (list.length >= 10) {
      const note = document.createElement('p');
      note.className = 'hint';
      note.textContent = 'まとめは10個までです。';
      root.append(note);
    }
  }

  render();
  return root;
}
