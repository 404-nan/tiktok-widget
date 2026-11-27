// 管理画面のエラー一覧。期間ごとの集計を出し、行を押すと新しい5件の詳しい中身を読む。
import { el, button, api, message } from './admin-parts.js';

const STATUS = {
  regressed: '直したのに、また起きています',
  open: 'まだ直していません',
  fixed: '直しました',
};

function japanTime(iso) {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return String(iso || '—');
  const shifted = new Date(ms + 9 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
}

function textOf(value, fallback = '—') {
  return value == null || value === '' ? fallback : String(value);
}

function errorRow(group) {
  const detail = el('div', { className: 'error-detail', hidden: true });
  const rowButton = el('button', { className: 'error-row pressable', type: 'button', 'aria-expanded': 'false' },
    el('span', { className: `error-status ${group.status}`, textContent: STATUS[group.status] ?? group.status }),
    el('span', { className: 'error-times', textContent: `${japanTime(group.firstTs)} から・最後 ${japanTime(group.lastTs)}` }),
    el('span', { className: 'error-count', textContent: `${group.count}回・${group.tenants}人の配信者` }),
    el('span', { className: 'error-place', textContent: `${group.where?.file ?? '場所不明'} ${group.where?.fn ?? ''}` }),
    el('span', { className: 'error-message', textContent: group.message }),
  );
  rowButton.addEventListener('click', async () => {
    const open = detail.hidden;
    detail.hidden = !open;
    rowButton.setAttribute('aria-expanded', String(open));
    if (!open || detail.dataset.loaded) return;
    detail.replaceChildren(el('p', { className: 'hint', textContent: '読んでいます…' }));
    try {
      const data = await api(`/errors/${encodeURIComponent(group.fingerprint)}?limit=5`);
      detail.replaceChildren(...(data.rows ?? []).map((row) => el('article', { className: 'error-item' },
        ...[
          el('strong', { textContent: japanTime(row.ts) }),
          el('p', { textContent: row.message }),
          row.cause ? el('p', { className: 'hint', textContent: `原因: ${row.cause}` }) : null,
          row.context && Object.keys(row.context).length ? el('code', { textContent: JSON.stringify(row.context) }) : null,
          row.stack?.length ? el('pre', { textContent: row.stack.join('\n') }) : null,
        ].filter(Boolean))));
      if (!data.rows?.length) detail.replaceChildren(el('p', { className: 'hint', textContent: '詳しい記録はありません' }));
      detail.dataset.loaded = '1';
    } catch (error) {
      detail.replaceChildren(el('p', { className: 'hint', textContent: error.message }));
    }
  });
  return el('article', { className: 'error-entry' }, rowButton, detail);
}

export function errorsDetail() {
  const range = el('select', { className: 'error-range' },
    el('option', { value: '24h', textContent: '24時間' }),
    el('option', { value: '7d', textContent: '7日', selected: true }),
    el('option', { value: '30d', textContent: '30日' }),
  );
  const summary = el('p', { className: 'sub', textContent: '読んでいます…' });
  const list = el('div', { className: 'error-list' });
  async function load() {
    try {
      const data = await api(`/errors?range=${encodeURIComponent(range.value)}`);
      summary.textContent = `${data.total ?? 0}回・${data.groups?.length ?? 0}種類（${japanTime(data.generatedAt)} 時点）`;
      const rows = (data.groups ?? []).map(errorRow);
      list.replaceChildren(...rows);
      if (!rows.length) list.replaceChildren(el('p', { className: 'hint empty', textContent: 'この期間のエラーはありません' }));
    } catch (error) {
      summary.textContent = 'エラーの一覧を読めませんでした';
      list.replaceChildren(el('p', { className: 'hint empty', textContent: error.message }));
    }
  }
  range.addEventListener('change', load);
  const refresh = button('読み直す', () => load());
  load();
  return [
    el('div', { className: 'detail-head' },
      el('h2', { textContent: 'エラー' }),
      el('p', { className: 'sub', textContent: 'サーバーと配信画面で起きたエラーを、同じ種類ごとにまとめて見ます。' }),
    ),
    el('section', { className: 'form-card error-controls' },
      el('div', { className: 'field-row' }, range, refresh),
      summary,
    ),
    list,
  ];
}
