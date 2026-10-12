// 「AI にたのむ」: 文章でたのむ → 変更の案を見る → 押して反映 → 気に入らなければ元に戻す。
// 使えるのは、管理者が AI のキーを入れて、この配信者に使えるようにしているときだけ（そうでなければ何も出さない）。

import { icon } from '/widgets/lib/overlay.js';

const EXAMPLES = [
  'Rose で回る罰ゲームルーレットを作って。項目は 歌う・変顔・激辛',
  'Lion が来たら WIN を 1 減らして',
  'フォロー 100 人の目標バーを作って',
  '全体の色を青っぽくして',
];

const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children.filter((c) => c != null && c !== false));
  return n;
};

export function setupAi({ box, api, editor }) {
  let state = { available: false };
  let pending = null; // 見せている案（{ reply, changes }）

  const left = el('span', { className: 'hint' });
  const text = el('textarea', { rows: 2, placeholder: 'どうしたいかを、ふつうの言葉で書いてください' });
  text.setAttribute('aria-label', 'AI にたのむこと');
  const ask = el('button', { type: 'submit', className: 'btn primary pressable' }, icon('sparkles'), 'たのむ');
  const form = el('form', { className: 'ai-form' }, text, ask);
  const examples = el('div', { className: 'ai-examples' });
  for (const ex of EXAMPLES) {
    const b = el('button', { type: 'button', className: 'mini-chip pressable', textContent: ex });
    b.addEventListener('click', () => {
      text.value = ex;
      text.focus();
    });
    examples.append(b);
  }
  const result = el('div', { className: 'ai-result', hidden: true });
  result.setAttribute('role', 'status');
  box.replaceChildren(el('div', { className: 'ai-head' }, icon('sparkles'), 'AI にたのむ', left), form, examples, result);

  const renderState = () => {
    box.hidden = !state.available;
    left.textContent = state.available ? `今日はあと ${state.left} 回` : '';
    ask.disabled = !state.available || state.left <= 0;
  };
  const note = (message, cls = '') => el('p', { className: `ai-reply ${cls}`, textContent: message });
  const undoButton = () => {
    const b = el('button', { type: 'button', className: 'chip pressable' }, icon('undo-2'), '元に戻す');
    b.addEventListener('click', async () => {
      try {
        const data = await api('/api/ai/undo', {});
        state = data.state ?? state;
        result.replaceChildren(note('元に戻しました。'));
        await editor.refresh();
      } catch (err) {
        result.replaceChildren(note(err.message, 'error'));
      }
      renderState();
    });
    return b;
  };

  function showProposal() {
    const { reply, changes, errors = [], warnings = [] } = pending;
    const parts = [note(reply || '（返事がありませんでした）')];
    if (changes.length) parts.push(el('ul', { className: 'ai-changes' }, ...changes.map((c) => el('li', { textContent: c.label }))));
    if (errors.length) {
      parts.push(note(`この案はそのままでは使えませんでした: ${errors.join(' / ')}。言い方を変えて、もう一度たのんでください。`, 'error'));
    } else if (changes.length) {
      if (warnings.length) parts.push(note(`注意: ${warnings.join(' / ')}`, 'hint'));
      const apply = el('button', { type: 'button', className: 'btn primary pressable' }, icon('check'), 'この内容で変える');
      const cancel = el('button', { type: 'button', className: 'btn pressable', textContent: 'やめる' });
      apply.addEventListener('click', async () => {
        apply.disabled = true;
        try {
          const data = await api('/api/ai/apply', { changes });
          state = data.state ?? state;
          // 変えたウィジェットを開いて、結果を見せる
          const [section, entry] = changes[0].path.split('.');
          result.replaceChildren(note('変えました。プレビューで確かめてください。'), el('div', { className: 'row wrap' }, undoButton()));
          text.value = '';
          pending = null;
          await editor.refresh(section, entry);
        } catch (err) {
          apply.disabled = false;
          parts.push(note(err.message, 'error'));
          result.replaceChildren(...parts);
        }
        renderState();
      });
      cancel.addEventListener('click', () => {
        pending = null;
        result.hidden = true;
      });
      parts.push(el('div', { className: 'row wrap' }, apply, cancel));
    }
    result.replaceChildren(...parts);
  }

  form.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const request = text.value.trim();
    if (!request) return text.focus();
    ask.disabled = true;
    result.hidden = false;
    result.replaceChildren(note('考えています…（30秒ほどかかることがあります）', 'thinking'));
    try {
      const data = await api('/api/ai/ask', { text: request, focus: editor.current() });
      state = data.state ?? state;
      pending = data;
      showProposal();
    } catch (err) {
      result.replaceChildren(note(err.message, 'error'));
      state = await api('/api/ai/state').catch(() => state);
    }
    renderState();
  });
  // Enter で送る（Shift + Enter で改行）
  text.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.shiftKey && !ev.isComposing) {
      ev.preventDefault();
      form.requestSubmit();
    }
  });

  const refresh = async () => {
    state = await api('/api/ai/state').catch(() => ({ available: false }));
    if (state.maxChars) text.maxLength = state.maxChars;
    renderState();
  };
  refresh();
  return { refresh };
}
