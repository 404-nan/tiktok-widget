// ルーレット共通: 設定の読み込み、どのルーレットを回すかの判定、抽選、待ち列、結果の表示。
// 見た目（丸型・横スライド）は roulette-wheel.js / roulette-strip.js が受け持つ。

import {
  loadConfig, applyTheme, setupPage, params, list, connect, isFor, createQueue, chime, sleep, fmt, icon, mediaUrl,
  reloadOnConfigChange, resolveColor, readableOn, giftLabel,
} from './overlay.js';
import { giftUserName } from './roulette-gift.js';

export { giftUserName };

// config.yaml がないとき（古い URL パラメータだけで使うとき）の初期値
const FALLBACK = {
  name: '', style: 'wheel', gifts: [], minCoins: 30, maxCoins: 0, events: [], perCount: false, duration: 6, hold: 4,
  hint: '', sound: true, volume: 0.3, palette: ['accent', 'paper', 'gold', 'ink-2'], pointerColor: 'accent',
  frameColor: 'ink', fontScale: 1, items: ['ハズレ', '歌う*2', '一発ギャグ', 'ハズレ', '変顔*2', '質問に答える*2'],
};

/**
 * 設定からルーレットの一覧を作る。
 * ?ids=a,b で絞り込み。?style= などの URL パラメータは全部のルーレットに効く。
 */
export async function loadRoulettes() {
  const { config, defaults } = await loadConfig();
  applyTheme(config?.theme);
  setupPage();
  const ids = list(new URLSearchParams(location.search).get('ids'));
  const all = config?.roulettes ?? {};
  let entries = ids.length ? ids.filter((id) => all[id]).map((id) => [id, all[id]]) : Object.entries(all);
  if (entries.length === 0) entries = [['default', {}]];

  reloadOnConfigChange((c) => [c?.theme, ids.length ? ids.map((id) => c?.roulettes?.[id]) : c?.roulettes], config);
  return entries.map(([id, entry]) => prepare(id, params({ ...FALLBACK, ...defaults.roulettes, ...entry })));
}


/** 項目に色・文字色・画像の URL・扇の範囲（0〜1）を付ける */
function prepare(id, r) {
  const items = r.items.map((raw) => {
    if (typeof raw === 'object' && raw) return { ...raw, label: raw.label ?? '', weight: Number(raw.weight) || 1 };
    const m = String(raw).match(/^(.*?)\*(\d+(?:\.\d+)?)$/);
    return { label: (m ? m[1] : String(raw)).trim(), weight: m ? Number(m[2]) : 1 };
  });
  if (items.length === 0) items.push({ label: '？', weight: 1 });

  const palette = list(r.palette).length ? list(r.palette) : FALLBACK.palette;
  const total = items.reduce((a, b) => a + b.weight, 0);
  let acc = 0;
  let auto = 0; // 色を指定していない項目の何番目か
  items.forEach((it, i) => {
    it.index = i;
    it.start = acc / total;
    acc += it.weight;
    it.end = acc / total;
    if (!it.color) {
      let pi = auto++ % palette.length;
      // 輪にしたとき最後と最初が同じ色で隣り合わないようにする
      if (i === items.length - 1 && i > 0 && pi === 0 && palette.length > 2) pi = 2;
      it.color = palette[pi];
    }
    it.fill = resolveColor(it.color);
    it.ink = it.textColor ? resolveColor(it.textColor) : readableOn(it.fill);
    if (it.image) it.src = mediaUrl(it.image);
  });
  return {
    ...r,
    id,
    items,
    gifts: list(r.gifts),
    events: list(r.events),
    pointer: resolveColor(r.pointerColor),
    frame: resolveColor(r.frameColor),
  };
}

export function pickWeighted(items) {
  const total = items.reduce((a, b) => a + b.weight, 0);
  let x = Math.random() * total;
  for (const it of items) {
    x -= it.weight;
    if (x <= 0) return it;
  }
  return items[items.length - 1];
}

export function hintFor(r) {
  if (r.hint) return r.hint;
  if (globalThis.__twGiftNamesReady && typeof globalThis.rouletteTriggerText === 'function') {
    return globalThis.rouletteTriggerText(r, fmt);
  }
  const parts = [];
  const gifts = r.gifts ?? [];
  if (gifts.length) parts.push(gifts.map((name) => giftLabel(name)).join('・'));
  if (r.minCoins > 0) parts.push(r.maxCoins ? `${fmt(r.minCoins)}〜${fmt(r.maxCoins)}コインのギフト` : `${fmt(r.minCoins)}コイン以上のギフト`);
  if (r.events?.includes('follow')) parts.push('フォロー');
  if (r.events?.includes('share')) parts.push('シェア');
  return parts.length ? `${parts.join(' / ')}で${r.name || 'ルーレット'}` : r.name || 'ルーレット';
}

/**
 * 回す順番の管理と結果の表示。
 * どのルーレットで何が当たるかはサーバーが決めて 'roulette' で知らせてくる（全部の画面で結果がそろう）。
 * views: { wheel, strip }。それぞれ show(r) / spin(r, winner) / hide() を持つ。
 * ページには #hint #queue #queueNum #result #kicker #resultName #resultBy #spinBy が必要。
 */
/** 画面の外からすべり込む・戻る時間（サーバーの ENTER_MS と同じ） */
export const ENTER_MS = 500;

export function startRoulettes({ roulettes, views, onSwitch }) {
  const $ = (id) => document.getElementById(id);
  const styleOverride = new URLSearchParams(location.search).get('style');
  const viewOf = (r) => views[styleOverride || r.style] ?? views.wheel;
  let active = null;

  // ギフトが来たときだけ出す: ふだんは画面の外（下）に置いて何も映さず、回すときにすべり込み、
  // 結果を見せて待ちがなくなったら外へ戻る。ダッシュボードのプレビュー（?preview=1）と ?always=1 では出したまま
  const stageEl = $('stage');
  const q = new URLSearchParams(location.search);
  const autoHide = stageEl && q.get('preview') !== '1' && q.get('always') !== '1';
  let shown = !autoHide;
  // ふだんは CSS で外に置いておく（読み込んだ瞬間に一度映ってから消えることがないように）
  if (stageEl && !autoHide) stageEl.classList.add('on');
  async function enter() {
    if (shown) return;
    shown = true;
    stageEl.classList.add('on');
    await sleep(ENTER_MS);
  }
  async function leave() {
    if (!autoHide || !shown) return;
    shown = false;
    stageEl.classList.remove('on');
    await sleep(ENTER_MS);
  }

  function activate(r) {
    if (active === r) return;
    const prev = active;
    active = r;
    if (prev && viewOf(prev) !== viewOf(r)) viewOf(prev).hide();
    viewOf(r).show(r);
    $('hint').replaceChildren(icon('gift'), hintFor(r));
    onSwitch?.(r, styleOverride || r.style);
  }

  function setSpinBy(trigger) {
    const el = $('spinBy');
    if (!el) return;
    const name = giftUserName(trigger);
    if (!name) {
      el.classList.remove('show');
      el.replaceChildren();
      return;
    }
    const text = document.createElement('span');
    text.textContent = `${name}さんのギフトで回転中`;
    const kids = [];
    if (trigger.user.avatar) {
      const img = new Image();
      img.className = 'spin-by-av';
      img.alt = '';
      img.referrerPolicy = 'no-referrer';
      img.src = trigger.user.avatar;
      img.onerror = () => img.remove();
      kids.push(img);
    }
    kids.push(text);
    el.replaceChildren(...kids);
    el.classList.add('show');
  }

  function hideSpinBy() {
    const el = $('spinBy');
    if (!el) return;
    el.classList.remove('show');
    el.replaceChildren();
  }

  async function run({ r, index, trigger }) {
    renderQueue();
    setSpinBy(trigger); // 回り始めたときから、誰のギフトかを出す
    await enter();
    if (active !== r) {
      activate(r);
      await sleep(450); // 切り替わったことが見えるよう少し待つ（サーバーの SWITCH_MS と同じ）
    }
    const winner = r.items[index] ?? pickWeighted(r.items);
    await viewOf(r).spin(r, winner);

    hideSpinBy();
    $('resultName').textContent = winner.label;
    const byName = giftUserName(trigger);
    $('resultBy').textContent = byName ? `${byName}さんのギフト` : '';
    const kicker = $('kicker');
    if (winner.src) {
      const img = new Image();
      img.src = winner.src;
      img.alt = '';
      kicker.replaceChildren(img);
      kicker.classList.add('has-image');
    } else {
      kicker.replaceChildren(icon('trophy'));
      kicker.classList.remove('has-image');
    }
    kicker.style.background = r.pointer;
    const result = $('result');
    result.classList.remove('hide');
    result.classList.add('show');
    if (r.sound) chime('win', r.volume);
    await sleep(r.hold * 1000);
    result.classList.add('hide');
    await sleep(400);
    result.classList.remove('show', 'hide');
    // 次が待っていなければ、画面の外へ戻る（連続のギフトは出たまま順番に回す）
    if (queue.size <= 1) await leave();
  }

  const queue = createQueue(run, { max: 100 });
  function renderQueue() {
    const waiting = queue.size - 1;
    $('queueNum').textContent = String(waiting);
    $('queue').classList.toggle('show', waiting > 0);
  }
  activate(roulettes[0]);

  connect({
    roulette({ spin }) {
      const r = roulettes.find((x) => x.id === spin.id);
      if (!r) return; // ?ids= でこの画面に出さないルーレット
      queue.push({ r, index: spin.index, trigger: spin.trigger });
      renderQueue();
    },
    control(msg) {
      if (!isFor(msg, 'roulette')) return;
      if (msg.action === 'show') {
        const r = roulettes.find((x) => x.id === msg.data?.id);
        if (r) activate(r);
      } else if (msg.action === 'reset') {
        queue.clear();
        renderQueue();
        hideSpinBy();
      }
    },
  });
}

/** 項目の境目を越えたときの音 */
export function tick(r) {
  if (r.sound) chime('tick', r.volume);
}
