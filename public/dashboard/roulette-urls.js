// ルーレットごとの旧 URL を、editor.js の詳細設定の折りたたみ内へ描画する。
// 短い説明の定数は dashboard-descriptions.js に置き、simple.js からも使う。

export function renderRouletteUrls({
  documentRef = document,
  existingBox = null,
  widget,
  roulettes = {},
  schemaTitle = 'ルーレット',
  target = null,
  fallback = null,
  copyText = () => {},
  flashCopied = () => {},
  locationOrigin = location.origin,
}) {
  let box = existingBox;
  if (!widget) {
    if (box) box.replaceChildren();
    return box;
  }
  if (!box) {
    box = documentRef.createElement('div');
    box.id = 'rouletteUrls';
    box.className = 'roulette-urls';
  }
  box.replaceChildren();

  const title = documentRef.createElement('span');
  title.className = 'field-label';
  title.textContent = '1つだけ出したいときの LIVE Studio / OBS URL';
  const hint = documentRef.createElement('p');
  hint.className = 'hint';
  hint.textContent = 'ルーレットごとに分けて出したいときだけ使います。';
  box.append(title, hint);

  Object.entries(roulettes).forEach(([name, entry], index) => {
    if (!Array.isArray(entry?.items) || entry.items.length === 0) return;
    const label = entry.kindName || entry.name || entry.title || `${schemaTitle} ${index + 1}`;
    const row = documentRef.createElement('div');
    row.className = 'roulette-url';
    const lab = documentRef.createElement('span');
    lab.className = 'field-label';
    lab.textContent = label;
    const line = documentRef.createElement('div');
    line.className = 'stage-url';
    const input = documentRef.createElement('input');
    input.readOnly = true;
    input.value = rouletteSourceUrl(widget, name, locationOrigin);
    input.setAttribute('aria-label', label);
    const button = documentRef.createElement('button');
    button.type = 'button';
    button.className = 'btn primary pressable';
    button.textContent = 'コピー';
    button.addEventListener('click', () => {
      copyText(input.value, input);
      flashCopied(button, button);
    });
    line.append(input, button);
    row.append(lab, line);
    box.append(row);
  });

  // render() が作った専用の箱を優先し、無ければ本線 URL の下で URL を失わせない。
  (target || fallback)?.append(box);
  return box;
}

export function rouletteSourceUrl(widget, id, locationOrigin = location.origin) {
  const url = new URL(widget.url, locationOrigin);
  url.searchParams.delete('ids');
  if (id == null) return url.href;
  return `${url.href}${url.search ? '&' : '?'}ids=${encodeURIComponent(id)}`;
}
