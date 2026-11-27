// 集金ページ: 利用者ごとの未集金額、前回集金からの増分、月次の売上推移を見て、
// 集金・訂正・取り消しを記録する。コインは円に換算せず参考値として出す。

import { el, button, api, message } from './admin-parts.js';

const liveService = 'rai' + 'kone';
let selectedStreamer = null;
const yen = (n) => `${Number(n ?? 0).toLocaleString('ja-JP')}円`;
const signedYen = (n) => `${n < 0 ? '−' : ''}${Math.abs(Number(n ?? 0)).toLocaleString('ja-JP')}円`;
const dateText = (iso) => iso ? new Date(iso).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'まだありません';
const monthText = (month) => `${Number(month.slice(5))}月`;

function metric(label, value, note = '') {
  return el('div', { className: 'ledger-metric' }, el('span', { className: 'ledger-metric-label', textContent: label }), el('strong', { textContent: value }), note ? el('span', { className: 'hint', textContent: note }) : null);
}

function warningText(warnings = []) {
  const unreported = warnings.find((w) => w.kind === 'rental-unreported');
  if (unreported?.count) return `申告待ち ${unreported.count}枠`;
  if (warnings.some((w) => w.kind === 'streamer-unlinked')) return 'どちらかのサービスと未連携';
  return '';
}

function salesTable(rows = []) {
  const body = rows.map((row) => el('tr', {},
    el('td', { textContent: monthText(row.month) }),
    el('td', { textContent: row.salesYenKnown == null ? '未入力' : yen(row.salesYenKnown) }),
    el('td', { textContent: `${row.rental?.sessions ?? 0}枠 / ${row.rental?.minutes ?? 0}分` }),
    el('td', { textContent: `${row[liveService]?.sessions ?? 0}回` }),
    el('td', { textContent: `${(row.giftCoinsReference ?? 0).toLocaleString('ja-JP')}コイン` }),
    el('td', { textContent: yen(row.rental?.chargeYen ?? 0) }),
  ));
  return el('div', { className: 'table-wrap' }, el('table', { className: 'ledger-table ledger-sales' },
    el('thead', {}, el('tr', {}, ...['月', '売上(円・確定分だけ)', '貸出', '配信', 'コイン(参考)', '今の請求'].map((h) => el('th', { textContent: h })))),
    el('tbody', {}, ...body),
  ));
}

function entryRow(entry, reverseControl = null) {
  const kind = { accrual: '発生', collection: '集金', adjustment: '訂正', reversal: '取り消し' }[entry.kind] ?? entry.kind;
  const note = entry.reason || entry.note || entry.method || '';
  return el('tr', {},
    el('td', { textContent: dateText(entry.at) }),
    el('td', { textContent: kind }),
    el('td', { className: entry.signedAmountYen < 0 ? 'money negative' : 'money', textContent: signedYen(entry.signedAmountYen) }),
    el('td', { textContent: note }),
    el('td', {}, reverseControl),
  );
}

async function submitCollection(root, id, form) {
  const amountYen = Number(form.amount.value);
  if (!Number.isInteger(amountYen) || amountYen <= 0) return message('集金額は1円以上の整数で入れてください', true);
  const submit = form.querySelector('button[type=submit]');
  submit.disabled = true;
  try {
    const result = await api('/ledger/collections', {
      streamerId: id,
      amountYen,
      collectedAt: form.collectedAt.value ? new Date(`${form.collectedAt.value}+09:00`).toISOString() : undefined,
      method: form.method.value,
      note: form.note.value,
      clientRequestId: form.clientRequestId.value,
    });
    message(result.duplicate ? '同じ集金はすでに記録されています' : '集金を記録しました');
    await fill(root);
  } catch (err) {
    message(err.message, true);
  } finally {
    submit.disabled = false;
  }
}

async function submitAdjustment(root, id, form) {
  const amountYen = Number(form.amount.value);
  if (!Number.isInteger(amountYen) || amountYen <= 0) return message('金額は1円以上の整数で入れてください', true);
  if (!form.reason.value.trim()) return message('訂正には理由が必要です', true);
  try {
    await api('/ledger/adjustments', {
      streamerId: id,
      amountYen,
      direction: form.direction.value,
      reason: form.reason.value,
      note: form.note.value,
      clientRequestId: form.clientRequestId.value,
    });
    message('訂正を記録しました');
    await renderDetailPanel(root, id);
  } catch (err) {
    message(err.message, true);
  }
}

function collectionForm(root, id) {
  const form = el('form', { className: 'ledger-form' });
  const now = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 16);
  form.append(
    el('input', { type: 'hidden', name: 'clientRequestId', value: crypto.randomUUID() }),
    el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '受け取った金額' }), el('input', { name: 'amount', type: 'number', min: '1', step: '1', required: true, placeholder: '例: 1000' })),
    el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '受け取った日時（日本時間）' }), el('input', { name: 'collectedAt', type: 'datetime-local', value: now })),
    el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '方法' }), (() => { const s = el('select', { name: 'method' }); for (const [v, t] of [['paypay', 'PayPay'], ['bank', '銀行'], ['cash', '現金'], ['other', 'その他']]) s.append(new Option(t, v)); return s; })()),
    el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: 'メモ（なくてもよい）' }), el('input', { name: 'note', autocomplete: 'off' })),
    el('div', { className: 'btn-row' }, el('button', { className: 'btn primary pressable', type: 'submit', textContent: '集金を記録' })),
  );
  form.addEventListener('submit', (e) => { e.preventDefault(); submitCollection(root, id, form); });
  return form;
}

function adjustmentForm(root, id) {
  const form = el('form', { className: 'ledger-form' });
  form.append(
    el('input', { type: 'hidden', name: 'clientRequestId', value: crypto.randomUUID() }),
    (() => { const s = el('select', { name: 'direction' }); s.append(new Option('増やす', 'add'), new Option('減らす・値引き', 'subtract')); return el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '訂正の向き' }), s); })(),
    el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '金額' }), el('input', { name: 'amount', type: 'number', min: '1', step: '1', required: true })),
    el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '理由（必須）' }), el('input', { name: 'reason', required: true, placeholder: '例: 手数料の入れ忘れ' })),
    el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: 'メモ（なくてもよい）' }), el('input', { name: 'note', autocomplete: 'off' })),
    el('div', { className: 'btn-row' }, el('button', { className: 'btn pressable', type: 'submit', textContent: '訂正を記録' })),
  );
  form.addEventListener('submit', (e) => { e.preventDefault(); submitAdjustment(root, id, form); });
  return form;
}

async function reverseLedgerEntry(root, entry) {
  if (!confirm(`${entry.signedAmountYen < 0 ? '−' : ''}${Math.abs(entry.signedAmountYen).toLocaleString('ja-JP')}円の行を取り消しますか？ 元の行は残り、逆符号の行が足されます。`)) return;
  const reason = prompt('取り消す理由を入れてください');
  if (!reason?.trim()) return message('取り消しには理由が必要です', true);
  try {
    await api(`/ledger/entries/${entry.id}/reversal`, { reason, clientRequestId: crypto.randomUUID() });
    message('取り消しを記録しました');
    await fill(root);
  } catch (err) {
    message(err.message, true);
  }
}

async function renderDetailPanel(root, id, offset = 0) {
  const panel = root.querySelector('.ledger-detail-panel');
  panel.replaceChildren(el('p', { className: 'hint', textContent: '読み込んでいます…' }));
  try {
    const detail = await api(`/ledger/streamers/${id}?offset=${offset}`);
    if (selectedStreamer !== id) return;
    const entries = detail.entries ?? [];
    const page = detail.entryPage;
    panel.replaceChildren(
      el('div', { className: 'ledger-detail-head' },
        el('h3', { textContent: detail.streamer.name }),
        el('div', { className: 'ledger-balance' }, el('span', { textContent: '未集金' }), el('strong', { textContent: yen(detail.balance.uncollectedYen) })),
      ),
      el('p', { className: 'hint', textContent: `前回集金: ${detail.balance.lastCollection ? `${dateText(detail.balance.lastCollection.at)}・${yen(detail.balance.lastCollection.amountYen)}` : 'まだありません'} / 前回から ${signedYen(detail.balance.sinceLastCollectionYen)}` }),
      el('details', { open: true }, el('summary', { textContent: '集金を記録する' }), collectionForm(root, id)),
      el('details', {}, el('summary', { textContent: '訂正・値引きを記録する' }), adjustmentForm(root, id)),
      el('h4', { textContent: '売上と配信の推移' }),
      salesTable(detail.sales ?? []),
      el('p', { className: 'hint', textContent: 'コインは円に換算していません。TikTok の確定額入力はまだなので、売上(円)は貸出の申告がある分だけです。' }),
      el('h4', { textContent: '台帳の履歴' }),
      entries.length ? el('div', { className: 'table-wrap' }, el('table', { className: 'ledger-table' }, el('thead', {}, el('tr', {}, ...['日時', '種類', '金額', '理由・メモ', ''].map((h) => el('th', { textContent: h })))), el('tbody', {}, ...entries.map((entry) => entryRow(entry, entry.kind !== 'reversal' && !entry.reversed ? button('取り消す', () => reverseLedgerEntry(root, entry)) : null))))) : el('p', { className: 'hint', textContent: 'このページに台帳の行はありません' }),
      page.total > page.limit || page.offset > 0 ? el('div', { className: 'btn-row loose' },
        page.offset > 0 ? button('新しい行', () => renderDetailPanel(root, id, Math.max(0, page.offset - page.limit))) : null,
        page.offset + page.limit < page.total ? button('古い行', () => renderDetailPanel(root, id, page.offset + page.limit)) : null,
      ) : null,
    );
  } catch (err) {
    panel.replaceChildren(el('p', { className: 'form-message error', textContent: err.message }));
  }
}

function streamerTable(root, streamers) {
  const rows = streamers.map((row) => {
    const tr = el('tr', { className: row.id === selectedStreamer ? 'selected' : '' },
      el('td', { textContent: row.name }),
      el('td', { className: 'money', textContent: yen(row.uncollectedYen) }),
      el('td', { className: 'money', textContent: signedYen(row.sinceLastCollectionYen) }),
      el('td', { textContent: dateText(row.lastCollection?.at) }),
      el('td', { textContent: row.month?.salesYenKnown == null ? '未入力' : yen(row.month.salesYenKnown) }),
      el('td', { textContent: warningText(row.warnings) }),
    );
    tr.addEventListener('click', () => {
      selectedStreamer = row.id;
      root.querySelectorAll('.ledger-streamers tbody tr').forEach((n) => n.classList.remove('selected'));
      tr.classList.add('selected');
      renderDetailPanel(root, row.id);
    });
    return tr;
  });
  return el('div', { className: 'table-wrap' }, el('table', { className: 'ledger-table ledger-streamers' },
    el('thead', {}, el('tr', {}, ...['名前', '未集金', '前回集金から', '前回集金', '今月の売上(確定分)', '注意'].map((h) => el('th', { textContent: h })))),
    el('tbody', {}, ...rows),
  ));
}

async function fill(root) {
  root.querySelector('.ledger-content').replaceChildren(el('p', { className: 'hint', textContent: '読み込んでいます…' }));
  try {
    const data = await api('/ledger/summary?months=6');
    const content = root.querySelector('.ledger-content');
    content.replaceChildren(
      el('div', { className: 'ledger-metrics' },
        metric('未集金の合計', yen(data.totals.uncollectedYen)),
        metric('前回集金からの合計', signedYen(data.totals.sinceLastCollectionYen)),
        metric('今月の請求', yen(data.totals.monthChargeYen)),
        metric('今月の集金', yen(data.totals.monthCollectedYen)),
        metric('申告待ち', `${data.totals.unreportedCount}枠`),
      ),
      data.stale ? el('p', { className: 'form-message error', textContent: '元データの一部が読めません。売上推移は古いか欠けている可能性があります。台帳残高は entries.jsonl から読んでいます。' }) : null,
      data.streamers.length ? streamerTable(root, data.streamers) : el('div', { className: 'empty-card' }, el('p', { textContent: 'まだ台帳に出せる人がいません' }), el('p', { className: 'hint', textContent: 'streamers.json に利用者が入ると、ここに残高が出ます。' })),
      el('div', { className: 'ledger-detail-panel' }, el('p', { className: 'hint', textContent: '上の表で人を選ぶと、推移と記録欄がここに出ます。' })),
    );
    if (!selectedStreamer && data.streamers[0]) {
      selectedStreamer = data.streamers[0].id;
      renderDetailPanel(root, selectedStreamer);
    } else if (selectedStreamer && data.streamers.some((row) => row.id === selectedStreamer)) {
      renderDetailPanel(root, selectedStreamer);
    }
  } catch (err) {
    root.querySelector('.ledger-content').replaceChildren(el('p', { className: 'form-message error', textContent: err.message }));
  }
}

export function ledgerDetail() {
  const root = el('div', { className: 'ledger-page' });
  const sync = button('既存データを読み込む', async () => {
    sync.disabled = true;
    try {
      const result = await api('/ledger/sync', {});
      message(`台帳へ発生 ${result.added.accrual}件・訂正 ${result.added.adjustment}件を足しました`);
      await fill(root);
    } catch (err) {
      message(err.message, true);
    } finally {
      sync.disabled = false;
    }
  }, { cls: 'btn primary', iconName: 'refresh-cw' });
  root.append(
    el('div', { className: 'ledger-page-head' }, el('div', {}, el('h2', { textContent: '集金' }), el('p', { className: 'hint', textContent: '入金の事実と残高を記録します。プラン・支払いとは別で、コインは円に換算しません。' })), sync),
    el('div', { className: 'ledger-content' }, el('p', { className: 'hint', textContent: '読み込んでいます…' })),
  );
  fill(root);
  return [root];
}
