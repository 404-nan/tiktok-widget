// ルーレット共通: 項目の読み込み、重み付きの抽選、待ち列、結果の表示。
// 丸型（roulette.html）と横スライド型（roulette-strip.html）で使う。
// 見た目の回し方だけを各ページが spin(winner) として渡す。

import { params, list, connect, isFor, giftMatches, createQueue, chime, sleep, fmt, icon } from './overlay.js';

export const DEFAULTS = {
  items: 'ハズレ,歌う*2,一発ギャグ,ハズレ,変顔*2,質問に答える*2', // 「名前*重み」で出やすさを変えられる
  gifts: '',        // このギフト名（または ID）でまわす。カンマ区切り
  minCoins: 30,     // 合計コインがこれ以上のギフトでまわす（0 で無効）
  perCount: false,  // ×5 なら 5 回まわす
  duration: 6,      // 回る秒数
  hold: 4,          // 結果の表示秒数
  hint: '',         // 案内文（空なら自動）
  sound: true,
  volume: 0.3,
};

export function readParams() {
  return params(DEFAULTS);
}

/** 4色だけを順に使う。[塗り, 文字] */
export function swatches() {
  const css = getComputedStyle(document.documentElement);
  const c = (name) => css.getPropertyValue(name).trim();
  return [
    [c('--signal'), c('--paper')],
    [c('--paper'), c('--ink')],
    [c('--gold'), c('--ink')],
    [c('--ink-2'), c('--paper')],
  ];
}

/**
 * 「名前*重み」のカンマ区切りを読む。
 * 各項目に weight / 累積の割合 start・end（0〜1）/ 色 fill・ink を付けて返す。
 */
export function parseItems(text) {
  const items = list(text).map((raw) => {
    const m = raw.match(/^(.*?)\*(\d+(?:\.\d+)?)$/);
    return { name: (m ? m[1] : raw).trim(), weight: m ? Math.max(0.01, Number(m[2])) : 1 };
  });
  if (items.length === 0) items.push({ name: '？', weight: 1 });
  const total = items.reduce((a, b) => a + b.weight, 0);
  const sw = swatches();
  let acc = 0;
  items.forEach((it, i) => {
    it.index = i;
    it.start = acc / total;
    acc += it.weight;
    it.end = acc / total;
    let si = i % sw.length;
    // 輪にしたとき最後と最初が同じ色で隣り合わないようにする
    if (i === items.length - 1 && i > 0 && si === 0) si = 2;
    [it.fill, it.ink] = sw[si];
  });
  return items;
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

/**
 * ギフトやダッシュボードの操作を受けて、順番に spin(winner) を呼び、結果を出す。
 * ページには #hint #queue #queueNum #result #kicker #resultName #resultBy が必要。
 */
export function startRoulette({ p, items, spin, name = 'roulette' }) {
  const $ = (id) => document.getElementById(id);
  const gifts = list(p.gifts);

  $('hint').append(
    icon('gift'),
    p.hint ||
      (gifts.length
        ? `${gifts.join('・')} でルーレット`
        : p.minCoins > 0
          ? `${fmt(p.minCoins)}コイン以上のギフトでルーレット`
          : 'ルーレット'),
  );
  $('kicker').append(icon('trophy'));

  async function run(trigger) {
    renderQueue();
    const winner = pickWeighted(items);
    await spin(winner);

    $('resultName').textContent = winner.name;
    $('resultBy').textContent = trigger?.user ? `${trigger.user.name} の ${trigger.gift.name}` : '';
    const result = $('result');
    result.classList.remove('hide');
    result.classList.add('show');
    if (p.sound) chime('win', p.volume);
    await sleep(p.hold * 1000);
    result.classList.add('hide');
    await sleep(400);
    result.classList.remove('show', 'hide');
  }

  const queue = createQueue(run, { max: 100 });
  function renderQueue() {
    const waiting = queue.size - 1;
    $('queueNum').textContent = String(waiting);
    $('queue').classList.toggle('show', waiting > 0);
  }

  connect({
    event(e) {
      if (!giftMatches(e, { gifts, minCoins: p.minCoins })) return;
      const times = p.perCount ? Math.min(20, e.gift.count) : 1;
      for (let i = 0; i < times; i++) queue.push(e);
      renderQueue();
    },
    control(msg) {
      // 丸型・横型どちらのルーレットも 'roulette' 宛ての操作で動く
      if (!isFor(msg, 'roulette') && !isFor(msg, name)) return;
      if (msg.action === 'spin') {
        queue.push(null);
        renderQueue();
      } else if (msg.action === 'reset') {
        queue.clear();
        renderQueue();
      }
    },
  });
}

/** 針が項目の境目を越えたときの音 */
export function tick(p) {
  if (p.sound) chime('tick', p.volume);
}
