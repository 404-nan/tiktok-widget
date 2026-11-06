// 管理画面の API キーと AI トークン: keysDetail、AI 定数群、aiTokensDetail。
// admin.js が initKeys() で遅延バインディングを渡す。

import { $, copyText } from '/dashboard/common.js';
import { el, button, api, message, act } from './admin-parts.js';

let _getData, _load, _renderDetail;

export function initKeys({ getData, load, renderDetail }) {
  _getData = getData;
  _load = load;
  _renderDetail = renderDetail;
}

// --- API キー ---

export function keysDetail() {
  const data = _getData();
  const addForm = el('form', { className: 'key-form stack' });
  const name = el('input', { placeholder: '名前', required: true });
  const type = el('input', { placeholder: '種類', required: true });
  const value = el('input', { type: 'password', placeholder: 'API キー', autocomplete: 'off', required: true });
  addForm.append(el('div', { className: 'field-row' }, name, type), value, el('div', { className: 'btn-row' }, button('追加', () => addForm.requestSubmit(), { cls: 'btn primary' })));
  addForm.addEventListener('submit', (event) => { event.preventDefault(); act(() => api('/keys', { name: name.value, type: type.value, value: value.value }), 'API キーを追加しました')(); });
  const rows = (data.keys ?? []).map((key) => {
    const nameInput = el('input', { value: key.name, disabled: key.id === 'eulerstream' && key.readOnly });
    const typeInput = el('input', { value: key.type, disabled: key.id === 'eulerstream' && key.readOnly });
    const secret = el('input', { type: 'password', placeholder: key.set ? '新しいキーに入れ替える' : 'API キー', autocomplete: 'off', disabled: key.readOnly });
    const save = button('保存', () => {
      const patch = { name: nameInput.value, type: typeInput.value };
      if (secret.value) patch.value = secret.value;
      if (key.id === 'eulerstream' && !patch.value) return message('新しいキーを入れてください', true);
      act(() => api(`/keys/${key.id}`, patch, 'PATCH'), 'API キーを保存しました')();
    }, { cls: 'btn primary' });
    const remove = key.readOnly ? null : button('削除', () => { if (confirm(`${key.name}を削除しますか？`)) act(() => api(`/keys/${key.id}`, undefined, 'DELETE'), 'API キーを削除しました')(); });
    return el('article', { className: 'admin-key' }, el('div', { className: 'key-meta' }, el('strong', { textContent: key.name }), el('span', { className: 'hint', textContent: `${key.type}・${key.environment === 'data' ? 'この画面で保存' : key.environment}・${key.savedAt ? key.savedAt.slice(0, 10) : '保存日なし'}` })), el('code', { textContent: key.masked || '未設定' }), el('div', { className: 'field-row' }, nameInput, typeInput, secret), el('div', { className: 'btn-row' }, save, remove));
  });
  return [el('div', { className: 'detail-head' }, el('h2', { textContent: 'API キー' }), el('p', { className: 'sub', textContent: 'キーの値は最初の8文字と末尾4文字だけ表示します。環境変数のキーは読み取り専用です。' })), el('section', { className: 'form-card' }, el('h3', { textContent: 'API キーを追加' }), addForm), el('div', { className: 'admin-key-list' }, ...rows)];
}

// --- AI トークン ---

const AI_SCOPES = [
  ['read', '読む'],
  ['write', '設定を変える'],
  ['operate', '操作する'],
  ['test', 'テスト送信'],
  ['suggest', '設定を提案する'],
  ['admin', '配信者の設定'],
];
const AI_SCOPE_LABEL = Object.fromEntries(AI_SCOPES);
const AI_PATH_LABEL = {
  'billing.plan': 'プラン',
  'billing.status': '状態',
  'billing.paidUntil': '支払った日まで',
  'billing.trialEndsAt': 'お試しの終わり',
  'billing.multiplier': '紹介の倍率',
  'billing.note': 'メモ',
  'billing.free': '無料提供',
  'billing.monthlyPrice': '月額（円）',
  'billing.premiumFeatures': '5000円プランだけの機能',
};
const AI_VALUE_LABEL = {
  flat2000: '2000円プラン',
  pct5: '売上5%プラン',
  flat5000: '5000円プラン',
  percent5: '売上5%プラン',
  yen2000: '2000円プラン',
  yen5000: '5000円プラン',
  trial: 'お試し',
  active: '支払い済み',
  past_due: '支払い待ち',
  suspended: '停止',
};
const AI_TOOL_LABEL = {
  get_status: '状態を見た',
  get_config: '設定を見た',
  validate_config: '設定を確かめた',
  get_history: '履歴を見た',
  list_widget_urls: 'ウィジェットのURLを見た',
  list_gifts: 'ギフトを見た',
  list_changes: '変更を見た',
  set_config: '設定を変えた',
  merge_config: '設定を一部変えた',
  delete_config: '設定を消した',
  spin_roulette: 'ルーレットを回した',
  timer: 'タイマーを動かした',
  wins: '勝ち数を動かした',
  boss: 'ボスを動かした',
  rush: 'ラッシュを動かした',
  test_event: 'テストを送った',
  tenant_widgets: 'ウィジェットを変えた',
  tenant_template: 'テンプレートを変えた',
  undo: '元に戻した',
  request_billing_change: '課金の変更を申請した',
};
let revealedToken = null;

function japanTime(iso) {
  const ms = Date.parse(iso || '');
  if (!Number.isFinite(ms)) return String(iso || '');
  try {
    const fmt = new Intl.DateTimeFormat('sv-SE', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    return fmt.format(new Date(ms));
  } catch (err) {
    const shifted = new Date(ms + 9 * 60 * 60 * 1000);
    const pad = (n) => (n < 10 ? '0' : '') + n;
    return `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())} ${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`;
  }
}

function streamerName(id) {
  const data = _getData();
  if (!id) return '';
  const found = (data?.tenants || []).find((t) => t.id === id);
  return found && found.name ? found.name : id;
}

function aiPathText(path) {
  if (!path) return '課金';
  return AI_PATH_LABEL[path] || path;
}

function aiValueText(value) {
  if (value == null || value === '') return 'なし';
  if (typeof value === 'string') return AI_VALUE_LABEL[value] || value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) return value.map(aiValueText).join('、');
  if (typeof value === 'object') {
    const parts = [];
    for (const key of Object.keys(value)) {
      const label = AI_PATH_LABEL[`billing.${key}`] || key;
      parts.push(`${label}: ${aiValueText(value[key])}`);
    }
    return parts.join('、') || 'なし';
  }
  return String(value);
}

export function aiTokensDetail() {
  const data = _getData();
  const name = el('input', { placeholder: '名前（例: 設定係）', required: true, autocomplete: 'off' });
  const tenants = el('input', { placeholder: '配信者の id。カンマで複数。* で全員', required: true, autocomplete: 'off' });
  const days = el('input', { type: 'number', min: '1', max: '366', value: '30' });
  days.setAttribute('aria-label', '有効な日数');
  const scopeBoxes = AI_SCOPES.map(([id, label]) => {
    const input = el('input', { type: 'checkbox', value: id });
    if (id === 'read') input.checked = true;
    return el('label', {}, input, label);
  });
  const form = el('form', { className: 'key-form stack' });
  form.append(
    el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '名前' }), name),
    el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '使える配信者' }), tenants),
    el('label', { className: 'field' }, el('span', { className: 'field-label', textContent: '有効な日数' }), days, el('span', { className: 'hint', textContent: '初めは30日です。' })),
    el('div', { className: 'flag-row' }, ...scopeBoxes),
    el('div', { className: 'btn-row' }, button('発行する', () => form.requestSubmit(), { cls: 'btn primary' })),
  );
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const scopes = scopeBoxes.map((label) => label.querySelector('input')).filter((input) => input.checked).map((input) => input.value);
    try {
      const issued = await api('/ai-tokens', {
        name: name.value,
        tenants: tenants.value.split(',').map((item) => item.trim()).filter(Boolean),
        scopes,
        days: Number(days.value || 30),
      });
      revealedToken = issued.value;
      await _load();
      _renderDetail(true);
      message('トークンを発行しました。値はこの画面に一度だけ出します');
    } catch (err) {
      message(err.message, true);
    }
  });

  const revealedInput = revealedToken ? el('input', { readOnly: true, value: revealedToken, spellcheck: false }) : null;
  const revealed = revealedToken
    ? el('div', { className: 'admin-key' },
      el('p', { className: 'form-message', textContent: 'この値は今だけ表示します。控えてください。あとから見ることはできません。' }),
      revealedInput,
      el('div', { className: 'btn-row' },
        button('コピー', () => { copyText(revealedToken, revealedInput); message('コピーしました'); }, { cls: 'btn primary' }),
        button('閉じる', () => { revealedToken = null; _renderDetail(true); }),
      ))
    : null;

  const rows = (data.aiTokens ?? []).map((token) => {
    const when = String(token.expiresAt || '').slice(0, 10);
    const scopes = (token.scopes ?? []).map((scope) => AI_SCOPE_LABEL[scope] || scope).join('、');
    return el('article', { className: 'admin-key' },
      el('div', { className: 'key-meta' }, el('strong', { textContent: token.name }), el('span', { className: 'hint', textContent: `${when} まで` })),
      el('p', { className: 'hint', textContent: `配信者: ${(token.tenants ?? []).map(streamerName).join('、') || 'なし'}　権限: ${scopes}` }),
      el('div', { className: 'btn-row' }, button('失効させる', () => {
        if (!confirm(`${token.name} を失効させますか？この値ではもう操作できません。`)) return;
        act(() => api(`/ai-tokens/${token.id}`, undefined, 'DELETE'), 'トークンを失効させました')();
      })),
    );
  });

  const auditRows = (data.aiAudit ?? []).map((entry) => {
    const when = japanTime(entry.ts);
    const result = entry.ok ? (entry.dryRun ? '確認のみ' : '成功') : (entry.error || '失敗');
    const who = entry.tenant ? streamerName(entry.tenant) : '配信者なし';
    return el('article', { className: 'admin-key' },
      el('div', { className: 'key-meta' }, el('strong', { textContent: AI_TOOL_LABEL[entry.tool] || entry.tool || '操作' }), el('span', { className: 'hint', textContent: when })),
      el('p', { className: 'hint', textContent: `${who}　${result}` }),
    );
  });

  const approvalRows = (data.aiApprovals ?? []).map((item) => el('article', { className: 'admin-key' },
    el('div', { className: 'key-meta' }, el('strong', { textContent: aiPathText(item.path) }), el('span', { className: 'hint', textContent: '承認待ち' })),
    el('p', { className: 'hint', textContent: `${item.tenant ? streamerName(item.tenant) : '全体'}　${aiValueText(item.value)}` }),
    el('div', { className: 'btn-row' },
      button('承認する', () => act(() => api(`/ai-approvals/${item.id}/approve`, {}, 'POST'), '承認して反映しました')(), { cls: 'btn primary' }),
      button('却下する', () => act(() => api(`/ai-approvals/${item.id}/reject`, {}, 'POST'), '申請を却下しました')()),
    ),
  ));

  return [
    el('div', { className: 'detail-head' }, el('h2', { textContent: 'AIトークン' }), el('p', { className: 'sub', textContent: 'AI が設定を読んだり変えたりするときの合言葉です。値そのものは保存しません。' })),
    el('section', { className: 'form-card' }, el('h3', { textContent: 'トークンを発行' }), form, revealed),
    el('section', { className: 'form-card' }, el('h3', { textContent: '発行済み' }), el('div', { className: 'admin-key-list' }, ...(rows.length ? rows : [el('p', { className: 'hint', textContent: 'まだありません' })]))),
    el('section', { className: 'form-card' }, el('h3', { textContent: '承認待ちの課金' }), el('div', { className: 'admin-key-list' }, ...(approvalRows.length ? approvalRows : [el('p', { className: 'hint', textContent: '承認待ちはありません' })]))),
    el('section', { className: 'form-card' }, el('h3', { textContent: '最近の操作' }), el('p', { className: 'hint', textContent: '新しい20件です。トークンの値は残りません。' }), el('div', { className: 'admin-key-list' }, ...(auditRows.length ? auditRows : [el('p', { className: 'hint', textContent: 'まだありません' })]))),
  ];
}
