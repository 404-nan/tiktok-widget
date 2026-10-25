// 配信者本人のAI接続を表示し、発行直後の値をコピーできるようにする。
// 一覧には値を出さず、ブラウザ保存領域にもトークンを保存しない。
import { copyText, flashCopied } from './common.js';

const el = (tag, props = {}, ...children) => {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children.filter((child) => child != null));
  return node;
};

function message(text, error = false) {
  return el('p', { className: error ? 'form-message error' : 'form-message', textContent: text, role: 'status' });
}

function copyButton(value, label = 'コピー') {
  const button = el('button', { type: 'button', className: 'chip pressable' }, el('span', { textContent: label }));
  button.addEventListener('click', () => { copyText(value); flashCopied(button); });
  return button;
}

/** 配信者が一覧で期限の状態を判断できるよう、日本語の短い状態を返す。 */
function streamerTokenStatus(token, now = Date.now()) {
  const expiresAt = Date.parse(token?.expiresAt || '');
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return { label: '期限切れ', expired: true, urgent: false };
  const urgent = expiresAt - now <= 3 * 24 * 60 * 60 * 1000;
  return { label: urgent ? 'まもなく期限' : '有効', expired: false, urgent };
}

export async function setupStreamerAi({ box, intro, body, api }) {
  if (!box || !body) return;
  let state;
  try { state = await api('/api/ai/streamer'); } catch { return; }
  box.hidden = false;
  // 設定の「AI とつなぐ」: Claude・ChatGPT の「コネクタ(MCP)を足す」に、つなぐ先と合言葉を貼るだけにする
  intro.textContent = 'Claude や ChatGPT から、ライコネの設定を手伝ってもらえます。AI の側で「コネクタを追加」して、下の2つを貼ってください。';
  const mcpRow = el('div', { className: 'streamer-ai-copy' }, el('input', { readOnly: true, value: state.connection.mcp, 'aria-label': 'つなぐ先の URL' }), copyButton(state.connection.mcp));
  const step1 = el('div', { className: 'ai-step' }, el('h4', { textContent: '1. つなぐ先の URL をコピーする' }), mcpRow);
  const form = el('form', { className: 'streamer-ai-form' });
  const name = el('input', { required: true, maxLength: 80, value: '配信設定用', 'aria-label': '合言葉の名前' });
  const days = el('input', { type: 'number', min: 1, max: 366, value: '30', 'aria-label': '使える日数' });
  const issue = el('button', { type: 'submit', className: 'btn primary pressable', textContent: '合言葉を作る' });
  const allowWrite = el('input', { type: 'checkbox' });
  form.append(el('label', {}, '名前', name), el('label', {}, '使える日数', days), el('label', { className: 'check' }, allowWrite, 'AI に設定を変えてもらう(変えたら元に戻せます)'), issue);
  const issued = el('div', { className: 'streamer-ai-issued', hidden: true });
  const step2 = el('div', { className: 'ai-step' }, el('h4', { textContent: '2. 合言葉を作って、AI の「秘密」の欄に貼る' }), form, issued);
  const more = el('details', { className: 'more' }, el('summary', { textContent: 'くわしい人向け' }), el('p', { className: 'hint', textContent: `API: ${state.connection.api}　配信者の番号: ${state.connection.tenant}。最初は読むだけ、次に保存しない提案、最後に開発用のテスト送信の順に使えます。` }));
  const list = el('div', { className: 'streamer-ai-list' });
  body.replaceChildren(step1, step2, list, more);
  body.hidden = false;

  const renderList = () => {
    list.replaceChildren(el('h4', { textContent: '作った合言葉(中身はもう見られません)' }));
    for (const token of state.tokens ?? []) {
      const status = streamerTokenStatus(token);
      const revoke = el('button', { type: 'button', className: 'chip pressable', textContent: '取り消す' });
      revoke.addEventListener('click', async () => {
        revoke.disabled = true;
        try { await api(`/api/ai/streamer/${encodeURIComponent(token.id)}`, {}, 'DELETE'); state.tokens = state.tokens.filter((item) => item.id !== token.id); renderList(); }
        catch (err) { list.append(message(err.message, true)); revoke.disabled = false; }
      });
      list.append(el('div', { className: `streamer-ai-token${status.expired ? ' expired' : status.urgent ? ' expiring' : ''}` }, el('div', {}, el('strong', { textContent: token.name }), el('span', { className: 'hint', textContent: `${status.label}・${String(token.expiresAt).slice(0, 10)} まで・${token.scopes?.includes('write') ? '設定を変えられる' : '見る・案を出すだけ'}` })), revoke));
    }
  };
  renderList();
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); issue.disabled = true; issued.hidden = true;
    try {
      const result = await api('/api/ai/streamer', { name: name.value.trim(), days: Number(days.value), allowWrite: allowWrite.checked });
      const tokenField = el('input', { readOnly: true, value: result.value, 'aria-label': '作った合言葉' });
      const connectionText = JSON.stringify({ mcpUrl: result.connection.mcp, apiUrl: result.connection.api, tenant: result.connection.tenant, token: '<外部AIの秘密の欄に貼る>' }, null, 2);
      issued.replaceChildren(el('div', { className: 'streamer-ai-copy' }, tokenField, copyButton(result.value, '合言葉をコピー')), el('p', { className: 'hint', textContent: 'この合言葉は、あとから見られません。今コピーして、AI の「秘密」の欄に貼ってください。' }), el('details', { className: 'more' }, el('summary', { textContent: 'まとめてコピー(くわしい人向け)' }), el('div', { className: 'streamer-ai-copy' }, el('pre', { className: 'code', textContent: connectionText }), copyButton(connectionText, '接続設定をコピー'))));
      issued.hidden = false; state.tokens = [result.token, ...(state.tokens ?? [])]; renderList(); name.value = '';
    } catch (err) { issued.replaceChildren(message(err.message, true)); issued.hidden = false; }
    issue.disabled = false;
  });
}
