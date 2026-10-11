// 小さなグラフ部品（SVG）。管理画面のトークンで描き、色を足すのは強調する1点だけ。
// - 縦棒: 太さ 24px まで、先端だけ 4px の角丸、棒どうしは 2px のすき間
// - 折れ線: 2px、下に 10% の塗り、ホバーで縦線と値
// - 目盛り線は 1px の実線、軸の文字は 12px の控えめな色
// 値はツールチップのほか、表（統計ページ）でも読める。

const NS = 'http://www.w3.org/2000/svg';
const el = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};
const compact = new Intl.NumberFormat('ja-JP', { notation: 'compact', maximumFractionDigits: 1 });
const plain = new Intl.NumberFormat('ja-JP');
export const fmtNum = (n) => (Math.abs(n) >= 10_000 ? compact.format(n) : plain.format(Math.round(n)));

/** 0 から始まるきりのいい目盛り（最大 4 本） */
function ticks(max) {
  if (max <= 0) return [0, 1];
  const raw = max / 3;
  const pow = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * pow).find((s) => s >= raw) ?? raw;
  const out = [];
  for (let v = 0; v <= max + step * 0.001; v += step) out.push(v);
  if (out.at(-1) < max) out.push(out.at(-1) + step);
  return out;
}

function tooltip(host) {
  let tip = host.querySelector('.chart-tip');
  if (!tip) {
    tip = document.createElement('div');
    tip.className = 'chart-tip';
    tip.hidden = true;
    host.append(tip);
  }
  return {
    show(x, y, value, label) {
      tip.replaceChildren();
      const v = document.createElement('strong');
      v.textContent = value;
      const l = document.createElement('span');
      l.textContent = label;
      tip.append(v, l);
      tip.hidden = false;
      const w = host.clientWidth;
      tip.style.left = `${Math.min(Math.max(x, 50), w - 50)}px`;
      tip.style.top = `${y}px`;
    },
    hide() {
      tip.hidden = true;
    },
  };
}

/**
 * グラフを描いて、大きさが変わったら描き直す。
 * draw(svg, width, height, tip) を受け取る
 */
function mount(host, height, draw) {
  host.classList.add('chart');
  const render = () => {
    const width = host.clientWidth;
    if (!width) return;
    host.querySelector('svg')?.remove();
    const svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' });
    host.prepend(svg);
    draw(svg, width, height, tooltip(host));
  };
  render();
  if (!host._ro) {
    host._ro = new ResizeObserver(() => host._render?.());
    host._ro.observe(host);
  }
  host._render = render;
}

/**
 * 縦棒グラフ。data: [{ value, label }]。highlight: 朱色にする棒の添字（なければ最大値）
 * opts.axis: 軸を出すか（小さいスパークラインでは出さない）
 */
export function columnChart(host, data, { height = 180, axis = true, highlight, unit = '', ariaLabel = '' } = {}) {
  mount(host, height, (svg, W, H, tip) => {
    svg.setAttribute('aria-label', ariaLabel);
    const pad = axis ? { l: 40, r: 8, t: 12, b: 24 } : { l: 0, r: 0, t: 4, b: 2 };
    const max = Math.max(1, ...data.map((d) => d.value));
    const tk = axis ? ticks(max) : [0, max];
    const top = tk.at(-1);
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const y = (v) => pad.t + ih - (v / top) * ih;

    if (axis) {
      for (const t of tk) {
        svg.append(el('line', { x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t), class: 'grid' }));
        const label = el('text', { x: pad.l - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'axis' });
        label.textContent = fmtNum(t);
        svg.append(label);
      }
    }
    if (!data.length) return;
    const slot = iw / data.length;
    const bw = Math.max(1, Math.min(24, slot - 2));
    const hi = highlight ?? data.reduce((best, d, i) => (d.value > data[best].value ? i : best), 0);

    data.forEach((d, i) => {
      const x = pad.l + i * slot + (slot - bw) / 2;
      const h = Math.max(d.value > 0 ? 2 : 0, (d.value / top) * ih);
      const r = Math.min(4, bw / 2, h);
      const yb = pad.t + ih;
      // 先端だけ角を丸める
      const path = `M${x},${yb} V${yb - h + r} Q${x},${yb - h} ${x + r},${yb - h} H${x + bw - r} Q${x + bw},${yb - h} ${x + bw},${yb - h + r} V${yb} Z`;
      const bar = el('path', { d: path, class: i === hi && d.value > 0 ? 'bar hi' : 'bar' });
      svg.append(bar);
      // 当たり判定は棒より大きく（列全体）
      const hit = el('rect', { x: pad.l + i * slot, y: pad.t, width: slot, height: ih, class: 'hit', tabindex: axis ? 0 : -1 });
      const show = () => {
        bar.classList.add('hover');
        tip.show(x + bw / 2, y(d.value) - 8, `${fmtNum(d.value)}${unit}`, d.label);
      };
      const hide = () => (bar.classList.remove('hover'), tip.hide());
      hit.addEventListener('pointerenter', show);
      hit.addEventListener('pointerleave', hide);
      hit.addEventListener('focus', show);
      hit.addEventListener('blur', hide);
      svg.append(hit);
    });

    // 一番の棒にだけ値を出す
    if (axis && data[hi]?.value > 0) {
      const lx = pad.l + hi * slot + slot / 2;
      const label = el('text', { x: lx, y: y(data[hi].value) - 6, 'text-anchor': lx > W - 60 ? 'end' : lx < pad.l + 40 ? 'start' : 'middle', class: 'value' });
      label.textContent = `${fmtNum(data[hi].value)}${unit}`;
      svg.append(label);
    }
    // 横軸は最初・真ん中・最後だけ
    if (axis) {
      for (const i of [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])]) {
        const t = el('text', { x: pad.l + i * slot + slot / 2, y: H - 6, 'text-anchor': 'middle', class: 'axis' });
        t.textContent = data[i].label;
        svg.append(t);
      }
    }
  });
}

/** 折れ線グラフ（1系列）。data: [{ value, label }] */
export function lineChart(host, data, { height = 180, unit = '', ariaLabel = '' } = {}) {
  mount(host, height, (svg, W, H, tip) => {
    svg.setAttribute('aria-label', ariaLabel);
    const pad = { l: 40, r: 12, t: 16, b: 24 };
    const max = Math.max(1, ...data.map((d) => d.value));
    const tk = ticks(max);
    const top = tk.at(-1);
    const iw = W - pad.l - pad.r;
    const ih = H - pad.t - pad.b;
    const x = (i) => pad.l + (data.length <= 1 ? iw / 2 : (i / (data.length - 1)) * iw);
    const y = (v) => pad.t + ih - (v / top) * ih;

    for (const t of tk) {
      svg.append(el('line', { x1: pad.l, x2: W - pad.r, y1: y(t), y2: y(t), class: 'grid' }));
      const label = el('text', { x: pad.l - 8, y: y(t) + 4, 'text-anchor': 'end', class: 'axis' });
      label.textContent = fmtNum(t);
      svg.append(label);
    }
    if (!data.length) return;
    const pts = data.map((d, i) => [x(i), y(d.value)]);
    const line = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px},${py}`).join(' ');
    svg.append(el('path', { d: `${line} L${pts.at(-1)[0]},${pad.t + ih} L${pts[0][0]},${pad.t + ih} Z`, class: 'area' }));
    svg.append(el('path', { d: line, class: 'line' }));

    // 最大の点に印と値
    const mi = data.reduce((b, d, i) => (d.value > data[b].value ? i : b), 0);
    svg.append(el('circle', { cx: pts[mi][0], cy: pts[mi][1], r: 4, class: 'dot' }));
    const vl = el('text', { x: pts[mi][0], y: pts[mi][1] - 10, 'text-anchor': pts[mi][0] > W - 60 ? 'end' : pts[mi][0] < pad.l + 40 ? 'start' : 'middle', class: 'value' });
    vl.textContent = `${fmtNum(data[mi].value)}${unit}`;
    svg.append(vl);

    for (const i of [...new Set([0, Math.floor((data.length - 1) / 2), data.length - 1])]) {
      const t = el('text', { x: x(i), y: H - 6, 'text-anchor': i === 0 ? 'start' : i === data.length - 1 ? 'end' : 'middle', class: 'axis' });
      t.textContent = data[i].label;
      svg.append(t);
    }

    // 縦線が一番近い点に吸い付く
    const cross = el('line', { y1: pad.t, y2: pad.t + ih, class: 'cross', visibility: 'hidden' });
    const hover = el('circle', { r: 4, class: 'dot', visibility: 'hidden' });
    const hit = el('rect', { x: pad.l, y: pad.t, width: iw, height: ih, class: 'hit' });
    svg.append(cross, hover, hit);
    hit.addEventListener('pointermove', (ev) => {
      const rect = svg.getBoundingClientRect();
      const px = ev.clientX - rect.left;
      const i = Math.max(0, Math.min(data.length - 1, Math.round(((px - pad.l) / iw) * (data.length - 1))));
      cross.setAttribute('x1', x(i));
      cross.setAttribute('x2', x(i));
      cross.setAttribute('visibility', 'visible');
      hover.setAttribute('cx', x(i));
      hover.setAttribute('cy', y(data[i].value));
      hover.setAttribute('visibility', 'visible');
      tip.show(x(i), y(data[i].value) - 10, `${fmtNum(data[i].value)}${unit}`, data[i].label);
    });
    hit.addEventListener('pointerleave', () => {
      cross.setAttribute('visibility', 'hidden');
      hover.setAttribute('visibility', 'hidden');
      tip.hide();
    });
  });
}
