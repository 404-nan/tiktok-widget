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
  intro.textContent = state.explanation;
  const help = el('p', { className: 'desc', textContent: 'Claude・ChatGPT など外部AIの秘密の欄にトークンを貼ってください。最初は読み取り、次に保存しない提案、最後に開発環境のテスト送信の順です。' });
  const endpoint = el('p', { className: 'hint', textContent: `API: ${state.connection.api}　MCP: ${state.connection.mcp}　テナント指定: ${state.connection.tenant}` });
  const form = el('form', { className: 'streamer-ai-form' });
  const name = el('input', { required: true, maxLength: 80, placeholder: '例：配信設定用', 'aria-label': 'トークンの名前' });
  const days = el('input', { type: 'number', min: 1, max: 366, value: '30', 'aria-label': '期限（日）' });
  const issue = el('button', { type: 'submit', className: 'btn primary pressable', textContent: 'トークンを発行' });
  form.append(el('label', {}, '名前', name), el('label', {}, '期限（日）', days), issue);
  const issued = el('div', { className: 'streamer-ai-issued', hidden: true });
  const list = el('div', { className: 'streamer-ai-list' });
  body.replaceChildren(help, endpoint, form, issued, list);

  const renderList = () => {
    list.replaceChildren(el('h4', { textContent: '発行済み（値は表示しません）' }));
    for (const token of state.tokens ?? []) {
      const status = streamerTokenStatus(token);
      const revoke = el('button', { type: 'button', className: 'chip pressable', textContent: '取り消す' });
      revoke.addEventListener('click', async () => {
        revoke.disabled = true;
        try { await api(`/api/ai/streamer/${encodeURIComponent(token.id)}`, {}, 'DELETE'); state.tokens = state.tokens.filter((item) => item.id !== token.id); renderList(); }
        catch (err) { list.append(message(err.message, true)); revoke.disabled = false; }
      });
      list.append(el('div', { className: `streamer-ai-token${status.expired ? ' expired' : status.urgent ? ' expiring' : ''}` }, el('div', {}, el('strong', { textContent: token.name }), el('span', { className: 'hint', textContent: `${status.label}・期限 ${token.expiresAt}・対象 ${token.tenants[0]}` })), revoke));
    }
  };
  renderList();
  form.addEventListener('submit', async (event) => {
    event.preventDefault(); issue.disabled = true; issued.hidden = true;
    try {
      const result = await api('/api/ai/streamer', { name: name.value.trim(), days: Number(days.value) });
      const tokenField = el('input', { readOnly: true, value: result.value, 'aria-label': '発行直後のトークン' });
      const connectionText = JSON.stringify({ mcpUrl: result.connection.mcp, apiUrl: result.connection.api, tenant: result.connection.tenant, token: '<外部AIの秘密の欄に貼る>' }, null, 2);
      issued.replaceChildren(message(result.warning), el('div', { className: 'streamer-ai-copy' }, tokenField, copyButton(result.value)), el('p', { className: 'hint', textContent: `接続先: ${result.connection.api}　MCP: ${result.connection.mcp}　テナント: ${result.connection.tenant}` }), el('div', { className: 'streamer-ai-copy' }, el('pre', { className: 'code', textContent: connectionText }), copyButton(connectionText, '接続設定をコピー')), el('p', { className: 'hint', textContent: 'この値は再表示できません。コピーしたら外部AI側の秘密の欄へ貼ってください。' }));
      issued.hidden = false; state.tokens = [result.token, ...(state.tokens ?? [])]; renderList(); name.value = '';
    } catch (err) { issued.replaceChildren(message(err.message, true)); issued.hidden = false; }
    issue.disabled = false;
  });
}
