// ギフト瓶の「入れ物」の形。画面サイズから、物理の壁と描画に使う点列などを作る。
//
// 返す値:
//   pts        壁の点列（口は開いたまま）。左の口 → 左側を下へ → 底 → 右側を上へ → 右の口 の順
//   open       口 { l, r, y }。ギフトはここから落ちる
//   bounds     { top, bottom, left, right }
//   size       玉の大きさの基準（入れ物の幅）
//   maxRadius  口を通れる玉の最大半径
//   highlights ガラスの映り込み [{ pts, width, alpha }]
//   rim        口のふち { x, y, w, h } または null
//   label      ラベルの置き方 { kind: 'sticker' | 'tag', x, y }

const TAU = Math.PI * 2;

export const SHAPES = ['jar', 'heart', 'potion'];

export function buildVessel(shape, W, H) {
  const v = (SHAPE_BUILDERS[shape] ?? SHAPE_BUILDERS.jar)(W, H);
  // 物理の壁は外向きの法線で厚みを付けるので、点列の向きをそろえておく
  if (signedArea(v.pts) > 0) v.pts.reverse();
  return v;
}

function signedArea(pts) {
  let a = 0;
  for (let i = 0; i < pts.length; i++) {
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[(i + 1) % pts.length];
    a += x1 * y2 - x2 * y1;
  }
  return a / 2;
}

/** 点が入れ物の内側にあるか（口を閉じた多角形として判定） */
export function inside(pts, x, y) {
  let hit = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const [xi, yi] = pts[i];
    const [xj, yj] = pts[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
  }
  return hit;
}

const SHAPE_BUILDERS = {
  // 広口の保存瓶
  jar(W, H) {
    const bottom = H - 12;
    const height = Math.min(H * 0.82, bottom - 16);
    const width = Math.min(W * 0.86, height * 0.85);
    const top = bottom - height;
    const neck = width * 0.72;
    const neckH = height * 0.06;
    const shoulder = height * 0.1;
    const rr = width * 0.16;
    const cx = W / 2;
    const L = cx - width / 2, R = cx + width / 2;

    const pts = [
      [cx - neck / 2, top],
      [cx - neck / 2, top + neckH],
      [L, top + neckH + shoulder],
    ];
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI - (Math.PI / 2) * (i / 6);
      pts.push([L + rr + Math.cos(a) * rr, bottom - rr + Math.sin(a) * rr]);
    }
    for (let i = 0; i <= 6; i++) {
      const a = Math.PI / 2 - (Math.PI / 2) * (i / 6);
      pts.push([R - rr + Math.cos(a) * rr, bottom - rr + Math.sin(a) * rr]);
    }
    pts.push([R, top + neckH + shoulder], [cx + neck / 2, top + neckH], [cx + neck / 2, top]);

    const hTop = top + neckH + shoulder + width * 0.08;
    const len = (bottom - hTop) * 0.62;
    return {
      pts,
      open: { l: cx - neck / 2, r: cx + neck / 2, y: top },
      bounds: { top, bottom, left: L, right: R },
      size: width,
      maxRadius: neck * 0.4,
      highlights: [
        { pts: [[L + width * 0.09, hTop], [L + width * 0.09, hTop + len]], width: 7, alpha: 0.4 },
        { pts: [[L + width * 0.15, hTop], [L + width * 0.15, hTop + len * 0.35]], width: 3, alpha: 0.4 },
      ],
      rim: { x: cx - neck / 2 - 12, y: top - 10, w: neck + 24, h: 18 },
      label: { kind: 'sticker', x: cx, y: bottom - height * 0.3 },
    };
  },

  // ハート。上のくぼみが口になっている
  heart(W, H) {
    const fx = (t) => 16 * Math.sin(t) ** 3;
    const fy = (t) => -(13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t));
    let minY = Infinity, maxY = -Infinity;
    for (let i = 0; i <= 200; i++) {
      const y = fy((i / 200) * TAU);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
    const bottom = H - 12;
    const availH = Math.min(H * 0.86, bottom - 12);
    const s = Math.min((W * 0.9) / 32, availH / (maxY - minY));
    const cx = W / 2;
    const map = (t, k = 1) => {
      // k < 1 でハートの中心へ寄せる（映り込み用）
      const midY = (minY + maxY) / 2;
      return [cx + fx(t) * s * k, bottom - (maxY - (midY + (fy(t) - midY) * k)) * s];
    };

    const t0 = 0.78; // くぼみの左右をこの分だけ開ける
    const pts = [];
    const steps = 90;
    for (let i = 0; i <= steps; i++) pts.push(map(t0 + ((TAU - 2 * t0) * i) / steps));

    const [rx, ry] = map(t0);
    const [lx] = map(TAU - t0);
    const width = 32 * s;
    const top = bottom - (maxY - minY) * s;

    const arc = (a, b, k) => {
      const out = [];
      for (let i = 0; i <= 16; i++) out.push(map(a + ((b - a) * i) / 16, k));
      return out;
    };
    return {
      pts,
      open: { l: lx, r: rx, y: ry },
      bounds: { top, bottom, left: cx - width / 2, right: cx + width / 2 },
      size: width,
      maxRadius: (rx - lx) * 0.36,
      highlights: [
        { pts: arc(TAU - 2.2, TAU - 1.25, 0.84), width: 7, alpha: 0.4 },
        { pts: arc(TAU - 1.05, TAU - 0.85, 0.84), width: 7, alpha: 0.4 },
      ],
      rim: null,
      label: { kind: 'sticker', x: cx, y: bottom - (bottom - top) * 0.36 },
    };
  },

  // エリクサーの丸底フラスコ。細い首から入る
  potion(W, H) {
    const bottom = H - 12;
    const availH = bottom - 40;
    const R = Math.min((W * 0.84) / 2, availH / 2.85);
    const nw = R * 0.56; // 首の太さ
    const nh = R * 0.8; // 首の長さ
    const cx = W / 2;
    const cy = bottom - R;
    const d = Math.asin(nw / 2 / R);
    const join = cy - R * Math.cos(d);
    const top = join - nh;

    const pts = [[cx - nw / 2, top], [cx - nw / 2, join]];
    const a0 = -Math.PI / 2 - d;
    const sweep = TAU - 2 * d;
    const steps = 60;
    for (let i = 0; i <= steps; i++) {
      const a = a0 - (sweep * i) / steps;
      pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
    }
    pts.push([cx + nw / 2, top]);

    const arc = (from, to, r) => {
      const out = [];
      for (let i = 0; i <= 16; i++) {
        const a = from + ((to - from) * i) / 16;
        out.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
      }
      return out;
    };
    return {
      pts,
      open: { l: cx - nw / 2, r: cx + nw / 2, y: top },
      bounds: { top, bottom, left: cx - R, right: cx + R },
      size: R * 2,
      maxRadius: nw * 0.4,
      neck: { x: cx + nw / 2, y: top + nh * 0.3, join },
      highlights: [
        { pts: arc(Math.PI * 1.08, Math.PI * 1.36, R * 0.8), width: 8, alpha: 0.4 },
        { pts: arc(Math.PI * 1.42, Math.PI * 1.47, R * 0.8), width: 8, alpha: 0.4 },
        { pts: [[cx - nw / 2 + 9, top + 14], [cx - nw / 2 + 9, join - 6]], width: 4, alpha: 0.35 },
      ],
      rim: { x: cx - nw / 2 - 10, y: top - 9, w: nw + 20, h: 16 },
      cork: { x: cx + nw / 2 + nw * 0.5, y: top + nw * 0.05, w: nw * 0.52, h: nw * 0.42 },
      liquid: { top: join, bottom },
      label: { kind: 'tag', x: cx + nw / 2 + 18, y: top + nh * 0.42 },
    };
  },
};
