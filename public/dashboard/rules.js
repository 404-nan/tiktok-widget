// ギフトごとのルールを、行を足して作る（YAML を書かなくてよいように）。
// 「かんたん」モードで使う。ここで触らない項目（users・perCount など）は、そのまま残す。

import { icon } from '/widgets/lib/overlay.js';
import { giftPicker } from './gift-picker.js';
import { timerGiftLength } from './timer-length.js';

// この画面で長さ・増減・単位を自分で触った行。触るまでは、ギフトを選ぶと目安で上書きする。
const lengthTouched = new WeakSet();
const lengthFields = new WeakMap();

const giftByName = (gifts, name) => {
  const key = String(name ?? '').toLocaleLowerCase();
  if (!key) return null;
  return gifts.find((g) => g?.name && String(g.name).toLocaleLowerCase() === key) ?? null;
};

/** まだ長さを触っていない行だけ、選んだギフトのコインから目安を入れる */
function fillTimerLength(r, name, gifts) {
  if (lengthTouched.has(r)) return;
  const gift = giftByName(gifts, name);
  if (!gift || !Number.isFinite(Number(gift.diamonds))) return;
  const len = timerGiftLength(gift.diamonds);
  delete r.seconds;
  delete r.minutes;
  r[len.unit] = len.amount;
  const f = lengthFields.get(r);
  if (!f) return;
  f.op.value = 'plus';
  f.n.value = String(len.amount);
  f.unit.value = len.unit;
}

const el = (tag, props = {}, ...children) => {
  const n = Object.assign(document.createElement(tag), props);
  n.append(...children.filter((c) => c != null && c !== false));
  return n;
};
const num = (value, { min, step = 1, title }) => {
  const input = el('input', { type: 'number', value: value ?? '', className: 'rule-num' });
  if (min != null) input.min = String(min);
  input.step = String(step);
  if (title) input.title = title;
  return input;
};

// ルールの種類ごとの「何をするか」の欄
const KINDS = {
  // WIN数: { gifts: [Lion], add: -1 } / { set: 0 } / { reset: true }
  winRules: {
    blank: { gifts: [], add: -1 },
    effect(r, commit) {
      const op = el('select', { className: 'rule-op' });
      for (const [v, text] of [['minus', 'WIN を減らす'], ['plus', 'WIN を増やす'], ['set', 'WIN をこの数にする'], ['reset', 'WIN を 0 に戻す']]) op.append(new Option(text, v));
      op.value = r.reset ? 'reset' : r.set != null ? 'set' : (r.add ?? -1) < 0 ? 'minus' : 'plus';
      const n = num(r.reset ? 1 : r.set != null ? r.set : Math.abs(r.add ?? 1), { min: 0, title: '数' });
      const apply = (delay) => {
        const v = Number(n.value);
        delete r.add;
        delete r.set;
        delete r.reset;
        if (op.value === 'reset') r.reset = true;
        else if (op.value === 'set') r.set = Number.isFinite(v) ? v : 0;
        else r.add = (op.value === 'minus' ? -1 : 1) * (v > 0 ? v : 1);
        n.hidden = op.value === 'reset';
        commit(delay);
      };
      n.hidden = op.value === 'reset';
      op.addEventListener('change', () => apply(0));
      n.addEventListener('input', () => apply(500));
      return [op, n];
    },
  },
  // 延長タイマー: { gifts: [Galaxy], minutes: 10 } / { seconds: -30 }
  timerRules: {
    blank: { gifts: [], seconds: 30 },
    effect(r, commit) {
      // 設定は秒で残るので、ちょうど何分かのときは分で見せる
      const asMinutes = r.minutes != null || (r.seconds != null && r.seconds % 60 === 0 && Math.abs(r.seconds) >= 60);
      const raw = r.minutes != null ? r.minutes : asMinutes ? r.seconds / 60 : (r.seconds ?? 30);
      const op = el('select', { className: 'rule-op' });
      for (const [v, text] of [['plus', '時間を延ばす'], ['minus', '時間を減らす']]) op.append(new Option(text, v));
      op.value = raw < 0 ? 'minus' : 'plus';
      const n = num(Math.abs(raw), { min: 0, title: '長さ' });
      const unit = el('select', { className: 'rule-unit' });
      for (const [v, text] of [['seconds', '秒'], ['minutes', '分']]) unit.append(new Option(text, v));
      unit.value = asMinutes ? 'minutes' : 'seconds';
      const apply = (delay) => {
        const v = Number(n.value);
        delete r.seconds;
        delete r.minutes;
        r[unit.value] = (op.value === 'minus' ? -1 : 1) * (v > 0 ? v : 0);
        commit(delay);
      };
      lengthFields.set(r, { op, n, unit });
      const touch = () => lengthTouched.add(r);
      op.addEventListener('change', () => { touch(); apply(0); });
      unit.addEventListener('change', () => { touch(); apply(0); });
      n.addEventListener('input', () => { touch(); apply(500); });
      return [op, n, unit];
    },
  },
  // ギフト通知: { gifts: [Lion], big: true, text: "…" }
  rules: {
    blank: { gifts: [], big: true },
    effect(r, commit) {
      const big = el('input', { type: 'checkbox', checked: Boolean(r.big) });
      big.addEventListener('change', () => {
        if (big.checked) r.big = true;
        else delete r.big;
        commit(0);
      });
      const text = el('input', { value: r.text ?? '', placeholder: '出すひと言（例: 本当にありがとう！）', className: 'rule-text' });
      text.addEventListener('input', () => {
        if (text.value.trim()) r.text = text.value;
        else delete r.text;
        commit(500);
      });
      return [el('label', { className: 'check rule-check' }, big, '金色にする'), text];
    },
  },
};

/**
 * type: 'winRules' | 'timerRules' | 'rules'、value: 今のルールの一覧、gifts: 知っているギフト（{ name, diamonds }）
 * onChange(rules, delay): 条件が入っている行だけを渡す（書きかけの行は保存しない）
 */
export function rulesEditor({ type, value = [], gifts = [], onChange }) {
  const kind = KINDS[type];
  let rows = value.map((r) => structuredClone(r));
  const list = el('div', { className: 'rule-list' });
  const complete = (r) => r.gifts?.length > 0 || r.minCoins != null || r.users?.length > 0;
  const commit = (delay = 0) => onChange(rows.filter(complete).map((r) => structuredClone(r)), delay);

  const rowFor = (r, i) => {
    // 条件: ギフトの名前か、コインの数
    const cond = el('select', { className: 'rule-cond' });
    cond.append(new Option('このギフト', 'gifts'), new Option('このコイン以上', 'minCoins'));
    cond.value = !r.gifts?.length && r.minCoins != null ? 'minCoins' : 'gifts';
    const picker = giftPicker({
      value: r.gifts ?? [],
      gifts,
      onChange: (names) => {
        const prev = new Set(r.gifts ?? []);
        const added = names.filter((n) => !prev.has(n));
        r.gifts = names;
        // 新しく選んだギフト。長さを自分で変えていなければ、コインの目安を入れる
        if (type === 'timerRules' && added.length) fillTimerLength(r, added.at(-1), gifts);
        commit(0);
      },
    });
    const coins = num(r.minCoins ?? 100, { min: 0, title: 'コイン' });
    const show = () => {
      const byGift = cond.value === 'gifts';
      picker.hidden = !byGift;
      coins.hidden = byGift;
    };
    show();
    cond.addEventListener('change', () => {
      if (cond.value === 'gifts') {
        delete r.minCoins;
      } else {
        delete r.gifts;
        r.minCoins = Number(coins.value) || 0;
      }
      show();
      commit(0);
    });
    coins.addEventListener('input', () => ((r.minCoins = Number(coins.value) || 0), commit(500)));

    const del = el('button', { type: 'button', className: 'icon-btn small pressable', title: 'このルールを消す' }, icon('x'));
    del.addEventListener('click', () => {
      rows.splice(i, 1);
      draw();
      commit(0);
    });
    return el(
      'div',
      { className: 'rule-row' },
      el('div', { className: 'rule-when' }, cond, picker, coins),
      el('div', { className: 'rule-then' }, icon('arrow-right'), ...kind.effect(r, commit), del),
    );
  };

  const draw = () => {
    list.replaceChildren(...rows.map(rowFor));
    if (!rows.length) list.append(el('p', { className: 'hint', textContent: 'まだルールはありません。' }));
  };
  const add = el('button', { type: 'button', className: 'chip pressable' }, icon('plus'), 'ルールを足す');
  add.addEventListener('click', () => {
    rows.push(structuredClone(kind.blank));
    draw();
    list.lastElementChild?.querySelector('.rule-gifts')?.focus();
  });
  draw();
  const note = type === 'timerRules'
    ? el('p', { className: 'hint', textContent: '目安: 100 コインで 1 分。コンボは来た数だけ足されます' })
    : null;
  return el('div', { className: 'rules' }, list, note, add);
}

export const hasRulesEditor = (type) => type in KINDS;
