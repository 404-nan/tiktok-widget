// 外部ツールの受け口の状態と鍵を、ダッシュボードに表示する。
// 鍵の全文は作成直後の画面にだけ置き、サーバーの状態から復元しない。再読み込み後は末尾4文字だけ表示する。
import { copyText, flashCopied } from './common.js';

const STATUS_TEXT = { live: 'つながっている', connecting: 'つなぎ中', idle: '未接続', demo: '未接続', error: 'エラー', ended: 'エラー' };
const $ = (id) => document.getElementById(id);
const timeText = (value) => {
  if (!value) return 'まだ届いていません';
  const seconds = Math.max(0, Math.floor((Date.now() - value) / 1000));
  if (seconds < 60) return `${seconds}秒前`;
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}分前`;
  return `${Math.floor(minutes / 60)}時間前`;
};
const setText = (id, value) => { const node = $(id); if (node) node.textContent = value; };

function row(label, value, at, id) {
  const node = document.createElement('div');
  node.className = 'ingest-status-row';
  node.id = id;
  const name = document.createElement('strong');
  name.textContent = label;
  const detail = document.createElement('span');
  detail.textContent = `${value}・最後に届いた時刻: ${timeText(at)}`;
  node.append(name, detail);
  return node;
}
function render(state, status) {
  $('ingestDirectStatus').replaceWith(row('TikTok（直接）', STATUS_TEXT[status.mode] ?? 'エラー', state.direct?.lastEventAt, 'ingestDirectStatus'));
  $('ingestExternalStatus').replaceWith(row('外部ツール（受け口）', state.enabled ? (state.lastEventAt ? '受信中' : '待機中') : '鍵なし', state.lastEventAt, 'ingestExternalStatus'));
  setText('ingestCounts', state.enabled ? `受けた数 ${state.accepted}・重複で捨てた数 ${state.duplicates}・多すぎて断った数 ${state.limited}` : '受け口の鍵を作ると、外部ツールからイベントを受けられます');
  setText('ingestKeyHint', state.keyHint ? `現在の鍵: …${state.keyHint}` : '');
  $('ingestCreateBtn').textContent = state.enabled ? '鍵を作り直す' : '受け口の鍵を作る';
  $('ingestRemoveBtn').hidden = !state.enabled;
  $('ingestKeyHint').hidden = !state.enabled;
}
async function refresh(api) {
  const [state, status] = await Promise.all([api('/api/ingest'), api('/api/status')]);
  render(state, status.status);
}
function showCreatedKey(value) {
  $('ingestCreatedKey').value = value;
  $('ingestCreatedUrl').value = `${location.origin}/in/${value}`;
  $('ingestKey').hidden = false;
}

export function setupIngest({ api }) {
  if (!$('ingestSection')) return;
  let timer = null;
  const poll = () => refresh(api).catch((error) => setText('ingestMessage', `受け口の状態を読み込めませんでした: ${error.message}`));
  const start = () => { if (!timer && !document.hidden) { poll(); timer = setInterval(poll, 10_000); } };
  const stop = () => { clearInterval(timer); timer = null; };
  document.addEventListener('visibilitychange', () => document.hidden ? stop() : start());
  $('ingestCreateBtn').addEventListener('click', async () => {
    try {
      const state = await api('/api/ingest');
      if (state.enabled && !confirm('今の鍵は使えなくなります。作り直しますか？')) return;
      const result = await api('/api/ingest/key', {}, 'POST');
      showCreatedKey(result.value);
      await refresh(api);
    }
    catch (error) { setText('ingestMessage', error.message); }
  });
  $('ingestRemoveBtn').addEventListener('click', async () => {
    if (!confirm('受け口を止めて、今の鍵を使えなくしますか？')) return;
    try { await api('/api/ingest/key', undefined, 'DELETE'); $('ingestKey').hidden = true; await refresh(api); }
    catch (error) { setText('ingestMessage', error.message); }
  });
  $('ingestCopyKeyBtn').addEventListener('click', (event) => { copyText($('ingestCreatedKey').value, $('ingestCreatedKey')); flashCopied(event.currentTarget); });
  $('ingestCopyUrlBtn').addEventListener('click', (event) => { copyText($('ingestCreatedUrl').value, $('ingestCreatedUrl')); flashCopied(event.currentTarget); });
  start();
}
