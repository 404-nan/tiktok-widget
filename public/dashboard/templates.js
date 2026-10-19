// 「かんたん」の配信テンプレート画面。カード、差分確認、適用、元戻しを担当する。

const LABELS = { alerts: 'ギフト通知', chats: 'コメント欄', wins: 'WIN数', cutins: 'カットイン', rush: 'RUSH', rankings: 'ランキング', roulettes: 'ルーレット', goals: '目標バー', timers: '延長タイマー' };
const valueText = (value) => value === undefined ? 'まだありません' : JSON.stringify(value, null, 2);

function button(text, className = 'btn pressable') {
  const out = document.createElement('button');
  out.type = 'button';
  out.className = className;
  out.textContent = text;
  return out;
}

export function createTemplatesView({ api, isLive, onChanged }) {
  let list = [];
  let selected = null;
  let preview = null;
  let applied = false;

  const render = async (root) => {
    root.replaceChildren();
    const head = document.createElement('div');
    head.className = 'view-title';
    head.append(Object.assign(document.createElement('h3'), { textContent: '配信テンプレート' }));
    head.append(Object.assign(document.createElement('p'), { className: 'desc', textContent: 'どの配信をするか選ぶと、使うものと設定がそろいます。入れる前に、何が変わるかを見せます。' }));
    root.append(head);
    const cards = document.createElement('div');
    cards.className = 'template-cards';
    for (const item of list) {
      const card = button('', 'template-card pressable');
      card.setAttribute('aria-pressed', String(selected?.id === item.id));
      card.append(Object.assign(document.createElement('strong'), { textContent: item.name }));
      card.append(Object.assign(document.createElement('span'), { textContent: item.desc }));
      card.append(Object.assign(document.createElement('small'), { textContent: `山場: ${(item.peaks ?? []).join('、')}` }));
      card.append(Object.assign(document.createElement('small'), { textContent: `使うもの: ${(item.widgets ?? []).map((key) => LABELS[key] ?? key).join('・')}` }));
      card.addEventListener('click', async () => { selected = item; preview = await api('/api/templates/preview', { id: item.id }); applied = false; render(root); });
      cards.append(card);
    }
    root.append(cards);
    if (!selected || !preview) return;
    const detail = document.createElement('section');
    detail.className = 'template-preview sgroup';
    detail.append(Object.assign(document.createElement('h4'), { textContent: '入れると、こう変わります' }));
    const rows = document.createElement('div');
    rows.className = 'sgroup-body';
    for (const row of preview.rows) {
      const line = document.createElement('div');
      line.className = 'template-row';
      const title = row.kind === 'widget' ? '使うものに足す' : row.kind === 'create' ? '新しく作る' : row.kind === 'change' ? '変える' : '入れない';
      line.append(Object.assign(document.createElement('strong'), { textContent: `${title}：${row.label ?? LABELS[row.section] ?? row.section}` }));
      if (row.kind === 'change' || row.kind === 'create') line.append(Object.assign(document.createElement('span'), { textContent: row.kind === 'change' ? `${valueText(row.before)} → ${valueText(row.after)}` : valueText(row.after) }));
      if (row.reason) line.append(Object.assign(document.createElement('span'), { textContent: row.reason }));
      rows.append(line);
    }
    if (preview.nothingToDo) rows.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: 'もう入っています' }));
    detail.append(rows);
    if (preview.notes?.length) detail.append(Object.assign(document.createElement('p'), { className: 'hint', textContent: preview.notes.join('、') }));
    const live = isLive();
    if (live) {
      const check = document.createElement('label');
      check.className = 'check template-live-check';
      check.append(Object.assign(document.createElement('input'), { type: 'checkbox', id: 'confirmLive' }), '配信中なので、すぐ画面が変わることを確認しました');
      detail.append(check);
    }
    const actions = document.createElement('div');
    actions.className = 'row wrap';
    const apply = button('この内容で入れる', 'btn primary pressable');
    apply.disabled = preview.nothingToDo || (live && !detail.querySelector('#confirmLive')?.checked);
    detail.querySelector('#confirmLive')?.addEventListener('change', (event) => { apply.disabled = !event.target.checked; });
    apply.addEventListener('click', async () => { await api('/api/templates/apply', { id: selected.id, confirmLive: detail.querySelector('#confirmLive')?.checked === true }); applied = true; await onChanged(); render(root); });
    const cancel = button('やめる', 'btn pressable');
    cancel.addEventListener('click', () => { selected = null; preview = null; render(root); });
    actions.append(apply, cancel);
    if (applied) {
      actions.append(Object.assign(document.createElement('span'), { className: 'form-message ok', textContent: '入れました。' }));
      const undo = button('元に戻す', 'chip pressable');
      undo.addEventListener('click', async () => { await api('/api/templates/undo', {}); await onChanged(); applied = false; render(root); });
      actions.append(undo);
    }
    detail.append(actions);
    root.append(detail);
  };

  return {
    async start(root) { list = await api('/api/templates'); await render(root); },
    render(root) { return render(root); },
  };
}
