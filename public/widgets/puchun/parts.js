/* 演出の部品。どれも part(ctx, t, p, env): t は部品の中の進み(0〜1)、p はタイムラインの1行(強さや色)、env は画面の大きさ(W, H, S=短い辺/1080)。
   部品の一覧と値は README.md。絵はすべてコードで描く(外の素材は使わない)。光のにじみ・色ずれ・粒は fx.js の仕上げがかける */
(function (Fx) {
  'use strict';
  var U = Fx.util, clamp = U.clamp, lerp = U.lerp, smooth = U.smooth, ease = U.ease, rng = U.rng, hue = U.hue;
  var P = Fx.parts;
  var FONT = '"Reggae One"';
  var TAU = Math.PI * 2;

  function once(env, key, make) { return env.cache[key] || (env.cache[key] = make()); }
  function offscreen(w, h) { var c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(h)); return c; }
  // 出て・保って・消える(in と out は部品の中の割合)
  function envelope(t, inn, out) { return Math.min(inn ? smooth(0, inn, t) : 1, out ? 1 - smooth(1 - out, 1, t) : 1); }
  function rgba(c, a) { return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + a + ')'; }
  function f60(env) { return Math.floor(env.time * 60 + 1e-4); }
  // 画面全体の明るさを逆にする。mono: true で先に白黒にする
  function invertAll(ctx, env, mono) {
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    if (mono) { ctx.globalCompositeOperation = 'saturation'; ctx.fillStyle = '#808080'; ctx.fillRect(0, 0, env.W, env.H); }
    ctx.globalCompositeOperation = 'difference'; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, env.W, env.H);
    ctx.restore();
  }
  // 横の帯をいくつか左右にずらす(壊れた画面のずれ)
  function sliceShift(ctx, env, n, amp, seed) {
    var r = rng(seed), c = ctx.canvas;
    ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0);
    for (var i = 0; i < n; i++) {
      var y = Math.floor(r() * env.H), h = Math.ceil((6 + r() * 60) * env.S), dx = (r() - .5) * 2 * amp * env.S;
      if (y + h > env.H) h = env.H - y;
      if (h > 0) ctx.drawImage(c, 0, y, env.W, h, dx, y, env.W, h);
    }
    ctx.restore();
  }
  // 4本の光の筋(きらめき)
  function star(ctx, x, y, s, a) {
    ctx.globalAlpha = a;
    var g = ctx.createRadialGradient(x, y, 0, x, y, s * .5);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(x - s * .5, y - s * .5, s, s);
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.moveTo(x - s * 1.6, y); ctx.lineTo(x, y - s * .06); ctx.lineTo(x + s * 1.6, y); ctx.lineTo(x, y + s * .06); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(x, y - s); ctx.lineTo(x + s * .05, y); ctx.lineTo(x, y + s); ctx.lineTo(x - s * .05, y); ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 1;
  }
  // 三日月の形の光の軌跡(刀の斬撃)。aT から aH へ太くなる
  function crescent(ctx, cx, cy, R, aT, aH, w) {
    var n = 40, i, u, a, hw;
    ctx.beginPath();
    for (i = 0; i <= n; i++) { u = i / n; a = lerp(aT, aH, u); hw = w * .5 * Math.pow(u, .7) * (u > .9 ? (1 - u) / .1 * .7 + .3 : 1); ctx.lineTo(cx + Math.cos(a) * (R + hw), cy + Math.sin(a) * (R + hw)); }
    for (i = n; i >= 0; i--) { u = i / n; a = lerp(aT, aH, u); hw = w * .5 * Math.pow(u, .7) * (u > .9 ? (1 - u) / .1 * .7 + .3 : 1); ctx.lineTo(cx + Math.cos(a) * (R - hw), cy + Math.sin(a) * (R - hw)); }
    ctx.closePath(); ctx.fill();
  }

  /* 塗りつぶし(暗転・一瞬の黒・白飛び)。color, in, out(割合), alpha */
  P.fill = function (ctx, t, p, env) {
    ctx.globalAlpha = (p.alpha == null ? 1 : p.alpha) * envelope(t, p.in || 0, p.out || 0);
    ctx.fillStyle = p.color || '#000';
    ctx.fillRect(-env.W * .1, -env.H * .1, env.W * 1.2, env.H * 1.2);
  };

  /* 明るさを逆にする(それまでに描いたもの)。mono: true で白黒にしてから。frames: [0,2] なら部品の中の 0 と 2 コマ目(60fps)だけ */
  P.invert = function (ctx, t, p, env) {
    if (p.frames && p.frames.indexOf(Math.round(t * p.dur * 60)) < 0) return;
    invertAll(ctx, env, p.mono !== false);
  };

  /* ---------- プチュン: 赤い横の光。頭はネガとシアンが打ち分け、最後は光が縮んでまん中から黒が広がる ---------- */
  function puchunScene(ctx, env, s, col, life, off) {
    var W = env.W, H = env.H, S = env.S, cx = W / 2, cy = H * (env.portrait ? .46 : .5), D = Math.sqrt(W * W + H * H), i;
    // 地: 黒に近い赤。水平線のあたりだけ赤く明るい
    ctx.fillStyle = '#050001'; ctx.fillRect(-W * .1, -H * .1, W * 1.2, H * 1.2);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(1, .32);
    var g = ctx.createRadialGradient(0, 0, 0, 0, 0, W * .75);
    g.addColorStop(0, rgba(col, .75 * life)); g.addColorStop(.35, rgba(col, .32 * life)); g.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = g; ctx.fillRect(-W, -H * 3, W * 2, H * 6); ctx.restore();
    // 下の水面に映る光(ゆらぐ Z の形)。小さく描いて引きのばし、にじませる
    var wc = once(env, 'water' + W, function () { return offscreen(W / 10, H / 10); }), wg = wc.getContext('2d'), q = 1 / 10;
    wg.setTransform(q, 0, 0, q, 0, 0); wg.clearRect(0, 0, W, H); wg.lineCap = 'round'; wg.lineJoin = 'round';
    for (i = 0; i < 3; i++) {
      wg.strokeStyle = rgba(i === 2 ? [255, 160, 160] : col, life * [.22, .4, .22][i]); wg.lineWidth = [110, 46, 14][i] * S;
      wg.beginPath();
      for (var k = 0; k <= 12; k++) { var yy = cy + (30 + k * 26 * (1 + k * .06)) * S, xo = Math.sin(k * 1.1 + env.time * 6) * (30 + k * 8) * S + (k % 2 ? 110 : -110) * S * (1 + k * .18); wg.lineTo(cx + xo, yy); }
      wg.stroke();
    }
    // 光に照らされた水面(下半分に広く)と、暗い波
    wg.save(); wg.translate(cx, cy + H * .2); wg.scale(1, .45);
    var wgr = wg.createRadialGradient(0, 0, 0, 0, 0, W * .5); wgr.addColorStop(0, rgba(col, .55 * life)); wgr.addColorStop(.6, rgba(col, .2 * life)); wgr.addColorStop(1, rgba(col, 0));
    wg.fillStyle = wgr; wg.fillRect(-W, -H, W * 2, H * 2); wg.restore();
    var wr = rng(23);
    for (i = 0; i < 26; i++) { wg.fillStyle = 'rgba(0,0,0,' + (.35 + wr() * .4) + ')'; wg.beginPath(); wg.ellipse(wr() * W + Math.sin(env.time * 2 + i) * 20 * S, cy + (30 + wr() * wr() * 520) * S, W * (.06 + wr() * .18), (6 + wr() * 18) * S, (wr() - .5) * .2, 0, TAU); wg.fill(); }
    ctx.drawImage(wc, 0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    var col2 = [Math.min(255, col[0] + 40), Math.min(255, col[1] + 40), Math.min(255, col[2] + 40)];
    for (i = 0; i < 10; i++) { // 水面のきらめき
      var r0 = rng(300 + i), wx = cx + (r0() - .5) * 260 * S, wy = cy + (40 + r0() * 300) * S;
      ctx.fillStyle = rgba(col2, life * .5 * r0()); ctx.fillRect(wx, wy, (30 + r0() * 90) * S, 3 * S);
    }
    // 舞う光の粒
    var r = rng(9);
    for (i = 0; i < 240; i++) {
      var px = r() * W, py = r() * H - s * 60 * S * r(), sz = (1.5 + r() * r() * 9) * S, a = r() * .9 * Math.max(life, .15) * (1 - off);
      ctx.fillStyle = rgba(i % 5 ? col : col2, a);
      if (sz < 4 * S) ctx.fillRect(px - sz, py - sz, sz * 2, sz * 2); else { ctx.beginPath(); ctx.arc(px, py, sz, 0, TAU); ctx.fill(); }
    }
    // 光の線: 太く薄い帯から細く白い芯まで重ねる。縮むのは横の長さ
    var len = W * .62 * lerp(1, .015, ease.in(clamp((s - .12) / .44, 0, 1))), flick = .85 + .15 * Math.sin(env.time * 90);
    var bands = [[160, .22, col], [44, .55, col], [12, .9, col2], [3.5, 1, [255, 255, 255]]];
    for (i = 0; i < bands.length; i++) {
      var lg = ctx.createLinearGradient(cx - len, 0, cx + len, 0), b = bands[i], al = b[1] * life * flick;
      lg.addColorStop(0, rgba(b[2], 0)); lg.addColorStop(.3, rgba(b[2], al * .45)); lg.addColorStop(.5, rgba(b[2], al)); lg.addColorStop(.7, rgba(b[2], al * .45)); lg.addColorStop(1, rgba(b[2], 0));
      ctx.fillStyle = lg; ctx.fillRect(cx - len, cy - b[0] * S / 2, len * 2, b[0] * S);
    }
    // 線のまわりの細かい粉
    var r2 = rng(17 + Math.floor(env.time * 30));
    for (i = 0; i < 160; i++) {
      var dx = (r2() * 2 - 1) * len, dy = (r2() + r2() + r2() - 1.5) * 16 * S;
      ctx.fillStyle = rgba(r2() < .3 ? [255, 255, 255] : col2, life * r2());
      ctx.fillRect(cx + dx, cy + dy, 2.5 * S, 2.5 * S);
    }
    // 白く光る芯(横に伸びた玉)
    var core = (70 + 12 * Math.sin(env.time * 50)) * S * (.35 + .65 * life);
    ctx.save(); ctx.translate(cx, cy); ctx.scale(2.4, 1);
    var cg = ctx.createRadialGradient(0, 0, 0, 0, 0, core);
    cg.addColorStop(0, 'rgba(255,255,255,1)'); cg.addColorStop(.25, 'rgba(255,255,255,.95)'); cg.addColorStop(.55, rgba(col2, .6)); cg.addColorStop(1, rgba(col, 0));
    ctx.fillStyle = cg; ctx.fillRect(-core, -core, core * 2, core * 2); ctx.restore();
    ctx.globalCompositeOperation = 'source-over';
    // まん中から黒が広がる(古いテレビが消えるとき)。ふちだけ赤く焼ける
    if (off > 0) {
      var Rb = lerp(18 * S, D * .62, ease.in(off));
      ctx.save(); ctx.translate(cx, cy); ctx.scale(1.9, 1);
      var hg = ctx.createRadialGradient(0, 0, 0, 0, 0, Rb);
      hg.addColorStop(0, '#000'); hg.addColorStop(.78, '#000'); hg.addColorStop(.86, rgba(col2, .95 * (1 - off * .6))); hg.addColorStop(.93, rgba(col, .5 * (1 - off))); hg.addColorStop(1, rgba(col, 0));
      ctx.fillStyle = hg; ctx.fillRect(-Rb, -Rb, Rb * 2, Rb * 2); ctx.restore();
    }
  }
  P.puchun = function (ctx, t, p, env) {
    var s = t * p.dur, f = Math.floor(s * 60 + 1e-4);
    // 元の動画の頭6コマ: ネガ・ネガ・赤・赤・ネガ・ネガ・赤(暗)・シアン・シアン、そのあと赤
    var neg = f <= 1 || f === 4 || f === 5, cyan = f === 7 || f === 8;
    var red = [235, 18, 38], cy = [30, 235, 215];
    var col = neg ? [255 - red[0], 255 - red[1], 255 - red[2]] : cyan ? cy : red;
    var life = (f === 6 ? .45 : 1) * (1 - smooth(.3, .56, s));
    var off = smooth(.26, .6, s);
    if (neg) off = 0;
    if (s > .6) { ctx.fillStyle = '#000'; ctx.fillRect(-env.W * .1, -env.H * .1, env.W * 1.2, env.H * 1.2); return; }
    puchunScene(ctx, env, s, col, life, off);
    if (neg) invertAll(ctx, env, false);
  };

  /* 暗転のあいだに残る火の粉(消えかけの点) */
  P.embers = function (ctx, t, p, env) {
    var r = rng(p.seed || 5), W = env.W, H = env.H, S = env.S;
    ctx.fillStyle = '#000'; ctx.fillRect(-W * .1, -H * .1, W * 1.2, H * 1.2);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 60; i++) {
      var x = r() * W, y = H * .5 + (r() - .5) * 60 * S - t * 30 * S * r(), a = (1 - t) * r() * .5 * (.5 + .5 * Math.sin(env.time * 20 + i));
      ctx.fillStyle = 'rgba(200,30,40,' + a + ')'; ctx.fillRect(x, y, 3 * S, 3 * S);
    }
  };

  /* ---------- 斬撃: 白い刃の軌跡が斜めに走る → シアンの光 → 火の線 → 白地のひび → 火花(1コマずつ切りかわる) ---------- */
  function cut(env) {
    var W = env.W, H = env.H;
    var A = env.portrait ? [W * .22, -H * .05] : [W * .42, -H * .08], B = env.portrait ? [W * .8, H * 1.05] : [W * .6, H * 1.08];
    var dx = B[0] - A[0], dy = B[1] - A[1], L = Math.sqrt(dx * dx + dy * dy);
    return { A: A, B: B, L: L, d: [dx / L, dy / L], n: [-dy / L, dx / L], ang: Math.atan2(dy, dx), mid: [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2] };
  }
  function crackAlong(env, seed, offset) {
    return once(env, 'cr' + seed + env.W + 'x' + env.H, function () {
      var c = cut(env), r = rng(seed), pts = [], br = [], n = 26, i;
      for (i = 0; i <= n; i++) { var u = i / n, j = (i % 2 ? 1 : -1) * (20 + r() * 60) * env.S; pts.push([c.A[0] + c.d[0] * c.L * u + c.n[0] * j, c.A[1] + c.d[1] * c.L * u + c.n[1] * j]); }
      for (i = 1; i < n; i += 2) {
        var a = pts[i], seg = [a], x = a[0], y = a[1], side = r() < .5 ? -1 : 1, ang = c.ang + side * (.5 + r() * .9);
        for (var k = 0; k < 3; k++) { var l = (40 + r() * 90) * env.S; ang += (r() < .5 ? -1 : 1) * (.6 + r() * .8); x += Math.cos(ang) * l; y += Math.sin(ang) * l; seg.push([x, y]); }
        br.push(seg);
      }
      return { pts: pts, br: br };
    });
  }
  function poly(ctx, pts) { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (var i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]); ctx.stroke(); }
  P.slash = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, s = t * p.dur, c = cut(env), i, r;
    var big = [-W * .1, -H * .1, W * 1.2, H * 1.2];
    if (s < .06) { // 白い刃の軌跡が上から下へ
      ctx.fillStyle = '#000'; ctx.fillRect(big[0], big[1], big[2], big[3]);
      var u = ease.out(s / .06);
      // ゆるい弧に乗せる: 大きな円の一部
      var R = c.L * 2.2, ox = c.mid[0] - c.n[0] * R, oy = c.mid[1] - c.n[1] * R, half = Math.asin(.5 * c.L / R) * 1.08;
      var a0 = Math.atan2(c.n[1], c.n[0]) - half, a1 = Math.atan2(c.n[1], c.n[0]) + half;
      ctx.globalCompositeOperation = 'lighter';
      for (var gh = 2; gh >= 0; gh--) { // 残像
        var uu = Math.max(0, u - gh * .12), head = lerp(a0, a1, uu), tail = lerp(a0, a1, Math.max(0, uu - .55));
        ctx.fillStyle = gh ? 'rgba(120,200,255,' + (.35 / gh) + ')' : '#fff';
        ctx.shadowColor = '#6cf'; ctx.shadowBlur = gh ? 0 : 40 * S;
        crescent(ctx, ox, oy, R, tail, head, (gh ? 220 : 130) * S);
      }
      ctx.shadowBlur = 0;
      // 刃先の火花
      var hx = ox + Math.cos(lerp(a0, a1, u)) * R, hy = oy + Math.sin(lerp(a0, a1, u)) * R;
      r = rng(77 + f60(env));
      ctx.strokeStyle = '#fff6d0'; ctx.lineWidth = 3 * S;
      for (i = 0; i < 24; i++) { var aa = r() * TAU, l = (20 + r() * 140) * S; ctx.beginPath(); ctx.moveTo(hx, hy); ctx.lineTo(hx + Math.cos(aa) * l, hy + Math.sin(aa) * l); ctx.stroke(); }
      var hg = ctx.createRadialGradient(hx, hy, 0, hx, hy, 160 * S); hg.addColorStop(0, 'rgba(255,255,255,.9)'); hg.addColorStop(1, 'rgba(120,200,255,0)');
      ctx.fillStyle = hg; ctx.fillRect(hx - 160 * S, hy - 160 * S, 320 * S, 320 * S);
      return;
    }
    if (s < .1) { // シアンの光と、切り口の紺の帯(元の動画の 1.40 秒)
      var g = ctx.createRadialGradient(c.mid[0], c.mid[1], 0, c.mid[0], c.mid[1], Math.max(W, H) * .7);
      g.addColorStop(0, '#fff'); g.addColorStop(.35, '#c9fbff'); g.addColorStop(1, '#2ad0ee');
      ctx.fillStyle = g; ctx.fillRect(big[0], big[1], big[2], big[3]);
      r = rng(81);
      ctx.fillStyle = 'rgba(255,255,255,.55)';
      for (i = 0; i < 36; i++) { var a = r() * TAU, w = .01 + r() * .02, D = Math.max(W, H); ctx.beginPath(); ctx.moveTo(c.mid[0], c.mid[1]); ctx.lineTo(c.mid[0] + Math.cos(a - w) * D, c.mid[1] + Math.sin(a - w) * D); ctx.lineTo(c.mid[0] + Math.cos(a + w) * D, c.mid[1] + Math.sin(a + w) * D); ctx.fill(); }
      ctx.save(); ctx.translate(c.mid[0], c.mid[1]); ctx.rotate(c.ang);
      var cols = ['#060a3a', '#0f1f8a', '#000', '#2f7dff', '#bdf6ff', '#0a1460', '#4fd8ff'];
      ctx.fillStyle = '#071040'; ctx.fillRect(-c.L, -W * .07, c.L * 2, W * .14);
      for (i = 0; i < 40; i++) { var y = (r() - .5) * W * .2, h = (3 + r() * 22) * S; ctx.fillStyle = cols[i % cols.length]; ctx.fillRect(-c.L, y, c.L * 2, h); }
      ctx.restore();
      return;
    }
    ctx.fillStyle = s < .16 && s >= .13 ? '#fff' : '#000'; ctx.fillRect(big[0], big[1], big[2], big[3]);
    if (s < .13) { // 黒地に火の線(右へずれた位置)
      ctx.save(); ctx.translate(W * (env.portrait ? .2 : .26), 0);
      ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
      var lines = [[40, 'rgba(255,60,0,.35)'], [14, 'rgba(255,120,10,.9)'], [4, '#fff4c8']];
      for (i = 0; i < 3; i++) { ctx.strokeStyle = lines[i][1]; ctx.lineWidth = lines[i][0] * S; ctx.beginPath(); ctx.moveTo(c.A[0], c.A[1]); ctx.lineTo(c.B[0], c.B[1]); ctx.stroke(); }
      ctx.restore();
      return;
    }
    var cr = crackAlong(env, 3);
    if (s < .16) { // 白地に黒いひび
      ctx.lineJoin = 'miter'; ctx.strokeStyle = '#000'; ctx.lineWidth = 9 * S; poly(ctx, cr.pts);
      ctx.lineWidth = 4 * S; ctx.strokeStyle = '#222'; for (i = 0; i < cr.br.length; i++) poly(ctx, cr.br[i]);
      ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 18 * S; poly(ctx, cr.pts);
      ctx.fillStyle = '#ffb030'; ctx.beginPath(); ctx.arc(cr.pts[8][0], cr.pts[8][1], 6 * S, 0, TAU); ctx.fill();
      return;
    }
    // 黒地に、切り口にそって火花
    ctx.globalCompositeOperation = 'lighter'; r = rng(91 + f60(env));
    for (i = 0; i < 70; i++) {
      var q = cr.pts[Math.floor(r() * cr.pts.length)], l2 = (10 + r() * 70) * S, a2 = c.ang + (r() - .5) * .8;
      ctx.strokeStyle = r() < .5 ? 'rgba(255,170,40,.9)' : 'rgba(255,230,150,.9)'; ctx.lineWidth = (1.5 + r() * 2.5) * S;
      ctx.beginPath(); ctx.moveTo(q[0], q[1]); ctx.lineTo(q[0] + Math.cos(a2) * l2, q[1] + Math.sin(a2) * l2); ctx.stroke();
    }
  };

  /* ---------- 切られた画面: 灰色の横縞・ひび・切り口の帯・基板のかけら。切り口で2つに分かれて斜めにずれる ---------- */
  function cracks(env) {
    return once(env, 'webs' + env.W, function () {
      var r = rng(61), list = [], W = env.W, H = env.H, S = env.S;
      // ガラスのひび: 折れ線と、角から出る短い枝
      for (var i = 0; i < 40; i++) {
        var x = r() * W, y = r() * H, ang = (r() < .5 ? -.45 : .45) + (r() - .5) * .5, seg = [[x, y]];
        for (var k = 0; k < 4; k++) {
          var l = (40 + r() * 120) * S; ang += (r() - .5) * .5; x += Math.cos(ang) * l; y += Math.sin(ang) * l; seg.push([x, y]);
          if (r() < .6) { var ba = ang + (r() < .5 ? -1 : 1) * (.7 + r() * .6), bl = (20 + r() * 60) * S; list.push([[x, y], [x + Math.cos(ba) * bl, y + Math.sin(ba) * bl]]); }
        }
        list.push(seg);
      }
      return list;
    });
  }
  function stripes(ctx, env, r, mono) {
    var W = env.W, H = env.H, S = env.S, y = -H * .15;
    ctx.fillStyle = '#18181c'; ctx.fillRect(-W * .2, -H * .2, W * 1.4, H * 1.4);
    while (y < H * 1.15) {
      var h = (3 + r() * r() * 34) * S, v = Math.round(r() < .5 ? 10 + r() * 70 : 150 + r() * 105);
      ctx.fillStyle = 'rgb(' + v + ',' + v + ',' + Math.min(255, v + 8) + ')';
      ctx.fillRect(-W * .2 + r() * W * .1, y, W * 1.4, h);
      if (r() < .08) { var lg = ctx.createLinearGradient(0, 0, W, 0); lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(r() * .6 + .2, 'rgba(255,255,255,.85)'); lg.addColorStop(1, 'rgba(255,255,255,0)'); ctx.fillStyle = lg; ctx.fillRect(0, y, W, h * .5); }
      y += h;
    }
    if (!mono) for (var i = 0; i < 3; i++) { ctx.fillStyle = 'rgba(255,40,40,.9)'; ctx.fillRect(r() * W * .5, r() * H, W * (.3 + r() * .7), 2.5 * S); }
  }
  function glitchScene(ctx, env, s, seed) {
    var W = env.W, H = env.H, S = env.S, c = cut(env), r = rng(seed), i, k;
    stripes(ctx, env, r, false);
    // ひびの網(白)
    var webs = cracks(env);
    ctx.lineJoin = 'miter';
    for (i = 0; i < webs.length; i++) { ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 12 * S; poly(ctx, webs[i]); ctx.strokeStyle = '#fff'; ctx.lineWidth = 7 * S; poly(ctx, webs[i]); }
    // 基板のかけら(上の右と下の左)
    var boards = [[W * .5, 0, W * .5, H * .075], [0, H * .92, W * .3, H * .08]];
    for (i = 0; i < 2; i++) {
      var b = boards[i]; ctx.fillStyle = '#16573c'; ctx.fillRect(b[0], b[1], b[2], b[3]);
      ctx.fillStyle = 'rgba(150,230,170,.55)';
      for (k = 0; k < 40; k++) ctx.fillRect(b[0] + (k * 37 % 100) / 100 * b[2], b[1] + ((k * 53) % 100) / 100 * b[3], 10 * S, 5 * S);
    }
    ctx.fillStyle = '#ff2a2a'; ctx.fillRect(W * .52, H * .085, W * .48, 4 * S); ctx.fillRect(0, H * .9, W * .38, 4 * S);
    for (k = 0; k < 5; k++) ctx.fillRect(W * (.86 + k * .022), H * .095, W * .012, 3 * S);
    // 切り口の帯: 桃色の部品の列と縦の色の線。帯にそって流れる
    ctx.save(); ctx.translate(c.mid[0], c.mid[1]); ctx.rotate(c.ang);
    var bw = Math.max(W, H) * .1, scroll = (s * 900 * S) % (80 * S);
    ctx.fillStyle = 'rgba(150,90,120,.55)'; ctx.fillRect(-c.L, -bw / 2, c.L * 2, bw);
    for (k = -16; k < 16; k++) {
      var x = k * 80 * S + scroll;
      for (var lane = 0; lane < 2; lane++) {
        var yy = lane ? bw * .05 : -bw * .42;
        ctx.fillStyle = (k + lane) % 3 ? '#c9b3bd' : '#b0607f'; ctx.strokeStyle = '#3a1e2c'; ctx.lineWidth = 2 * S;
        ctx.fillRect(x, yy, 62 * S, bw * .34); ctx.strokeRect(x, yy, 62 * S, bw * .34);
      }
    }
    var lc = ['#7ff', '#ffd23f', '#fff', '#c4f', '#fff', '#5af'];
    for (k = 0; k < 6; k++) { ctx.fillStyle = lc[k]; ctx.fillRect(-c.L, -bw / 2 + bw * (k + .5) / 6, c.L * 2, (1.5 + (k % 2) * 2) * S); }
    ctx.restore();
  }
  P.glitch = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, s = t * p.dur, c = cut(env), f = f60(env), seed = (p.seed || 7) + Math.floor(env.time * 30);
    var shift = (24 + 70 * ease.out(clamp(s / .2, 0, 1))) * S + (rng(f)() - .5) * 14 * S;
    var D = Math.max(W, H) * 2;
    // 絵は 30fps で変わるので、1枚に描いておいて2回使う(左右の切り抜き)
    var sc = once(env, 'glitchc' + W, function () { return { c: offscreen(W * 1.3, H * 1.3), seed: -1 }; });
    if (sc.seed !== seed) { var g = sc.c.getContext('2d'); g.setTransform(1, 0, 0, 1, W * .15, H * .15); glitchScene(g, env, s, seed); sc.seed = seed; }
    for (var side = -1; side <= 1; side += 2) {
      ctx.save();
      ctx.beginPath(); // 切り口の片側だけを切り抜く
      ctx.moveTo(c.mid[0] - c.d[0] * D, c.mid[1] - c.d[1] * D); ctx.lineTo(c.mid[0] + c.d[0] * D, c.mid[1] + c.d[1] * D);
      ctx.lineTo(c.mid[0] + c.d[0] * D + c.n[0] * D * side, c.mid[1] + c.d[1] * D + c.n[1] * D * side); ctx.lineTo(c.mid[0] - c.d[0] * D + c.n[0] * D * side, c.mid[1] - c.d[1] * D + c.n[1] * D * side);
      ctx.closePath(); ctx.clip();
      ctx.translate(c.d[0] * shift * side, c.d[1] * shift * side);
      ctx.drawImage(sc.c, -W * .15, -H * .15);
      ctx.restore();
    }
    // 切り口の光
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    var ws = [[30, 'rgba(120,220,255,.25)'], [8, 'rgba(255,255,255,.9)']];
    for (var i = 0; i < 2; i++) { ctx.strokeStyle = ws[i][1]; ctx.lineWidth = ws[i][0] * S * (1 - t * .6); ctx.beginPath(); ctx.moveTo(c.A[0], c.A[1]); ctx.lineTo(c.B[0], c.B[1]); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
    sliceShift(ctx, env, 8, 40, seed + 3);
    if (p.negFrames && p.negFrames.indexOf(Math.round(s * 60)) >= 0) invertAll(ctx, env, true);
  };

  /* 墨の飛び散り(まん中から広がる)。color, x, y(0〜1), size */
  P.ink = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, cx = W * (p.x == null ? .5 : p.x), cy = H * (p.y == null ? .5 : p.y);
    var R = Math.max(W, H) * (p.size || .3) * ease.out(clamp(t * 4, 0, 1)), seed = p.seed || 21, i;
    var blobs = once(env, 'ink' + seed, function () { var r = rng(seed), b = []; for (var j = 0; j < 70; j++) { var a = r() * TAU, d = Math.pow(r(), .5) * 1.15; b.push([Math.cos(a) * d, Math.sin(a) * d * .9, .06 + r() * r() * .4]); } return b; });
    // 小さな画面に丸を描き、ぼかして輪郭を立てる(液体のようにつながる)。filter が使えないときはそのまま
    var q = 1 / 3, ic = once(env, 'inkc' + env.W, function () { return offscreen(W * q, H * q); }), ic2 = once(env, 'inkc2' + env.W, function () { return offscreen(W * q, H * q); }), out = ctx;
    ctx = ic.getContext('2d'); ctx.setTransform(q, 0, 0, q, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = p.color || '#0c0c0c';
    ctx.beginPath(); ctx.arc(cx, cy, R * .55, 0, TAU); ctx.fill();
    for (i = 0; i < blobs.length; i++) { var b = blobs[i]; ctx.beginPath(); ctx.arc(cx + b[0] * R, cy + b[1] * R, b[2] * R, 0, TAU); ctx.fill(); }
    // しずくと、のびる筋
    var r2 = rng(seed + 5);
    ctx.lineCap = 'round'; ctx.strokeStyle = ctx.fillStyle;
    for (i = 0; i < 46; i++) {
      var aa = r2() * TAU, d = R * (1.05 + r2() * 1.1), sz = (5 + r2() * 30) * S * ease.out(t);
      ctx.beginPath(); ctx.arc(cx + Math.cos(aa) * d, cy + Math.sin(aa) * d, sz, 0, TAU); ctx.fill();
      if (i % 3 === 0) { ctx.lineWidth = sz * .8; ctx.beginPath(); ctx.moveTo(cx + Math.cos(aa) * R * .7, cy + Math.sin(aa) * R * .7); ctx.lineTo(cx + Math.cos(aa) * d, cy + Math.sin(aa) * d); ctx.stroke(); }
    }
    var g2 = ic2.getContext('2d'); g2.clearRect(0, 0, ic2.width, ic2.height); g2.filter = 'url(#goo)'; g2.drawImage(ic, 0, 0); g2.filter = 'none';
    out.drawImage(ic2, 0, 0, W, H);
  };

  /* ---------- 立ち絵 ---------- */
  // 仮の立ち絵(配信者が自分の絵を入れるまでの影)。mode: 'mono' 白黒 / 'color'
  function figure(ctx, x, y, h, mode) {
    var u = h / 100;
    ctx.save(); ctx.translate(x, y);
    var line = mode === 'mono' ? '#000' : '#2C3A5C';
    var hair = mode === 'mono' ? '#fff' : '#E4ECF8', body = '#FFFFFF', skin = mode === 'mono' ? '#fff' : '#FBE9E1';
    ctx.lineJoin = 'round'; ctx.lineWidth = Math.max(2, 1.6 * u); ctx.strokeStyle = line;
    ctx.fillStyle = body;
    ctx.beginPath(); ctx.moveTo(-46 * u, 100 * u); ctx.quadraticCurveTo(-44 * u, 62 * u, -16 * u, 56 * u); ctx.lineTo(16 * u, 56 * u); ctx.quadraticCurveTo(44 * u, 62 * u, 46 * u, 100 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = skin;
    ctx.beginPath(); ctx.ellipse(0, 30 * u, 19 * u, 23 * u, 0, 0, TAU); ctx.fill(); ctx.stroke();
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.moveTo(-24 * u, 40 * u); ctx.quadraticCurveTo(-32 * u, 6 * u, -6 * u, 2 * u); ctx.lineTo(0, -6 * u); ctx.lineTo(6 * u, 2 * u); ctx.quadraticCurveTo(32 * u, 6 * u, 24 * u, 40 * u);
    ctx.quadraticCurveTo(18 * u, 18 * u, 8 * u, 16 * u); ctx.lineTo(2 * u, 24 * u); ctx.lineTo(-4 * u, 16 * u); ctx.quadraticCurveTo(-18 * u, 18 * u, -24 * u, 40 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-22 * u, 22 * u); ctx.quadraticCurveTo(-40 * u, 60 * u, -30 * u, 96 * u); ctx.lineTo(-22 * u, 70 * u); ctx.quadraticCurveTo(-24 * u, 46 * u, -18 * u, 34 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(22 * u, 22 * u); ctx.quadraticCurveTo(40 * u, 60 * u, 30 * u, 96 * u); ctx.lineTo(22 * u, 70 * u); ctx.quadraticCurveTo(24 * u, 46 * u, 18 * u, 34 * u); ctx.closePath(); ctx.fill(); ctx.stroke();
    if (mode === 'mono') {
      ctx.strokeStyle = '#000'; ctx.lineWidth = Math.max(2, 1.1 * u);
      for (var i = 0; i < 12; i++) { ctx.beginPath(); ctx.moveTo((-44 + i * 3) * u, 100 * u); ctx.lineTo((-30 + i * 3) * u, 70 * u); ctx.stroke(); }
    }
    ctx.fillStyle = mode === 'mono' ? '#000' : 'rgba(44,58,92,.55)';
    ctx.font = '700 ' + Math.round(5 * u) + 'px "Zen Kaku Gothic New", sans-serif'; ctx.textAlign = 'center';
    ctx.fillText('ここに立ち絵', 0, 88 * u);
    ctx.restore();
  }
  // 立ち絵を1枚の絵にしておく(opts.charImage があればそれ、なければ仮の影)。mono は白黒の2値
  function charArt(env, h, mode) {
    return once(env, 'char' + mode + Math.round(h), function () {
      var img = env.opts.charImage, w = img ? h * img.width / img.height : h, c = offscreen(w, h), g = c.getContext('2d');
      if (img) g.drawImage(img, 0, 0, w, h); else figure(g, w / 2, 0, h, mode);
      if (mode === 'mono' && img) {
        var d = g.getImageData(0, 0, c.width, c.height), a = d.data;
        for (var i = 0; i < a.length; i += 4) { var v = (a[i] * .3 + a[i + 1] * .59 + a[i + 2] * .11) > 120 ? 255 : 0; a[i] = a[i + 1] = a[i + 2] = v; }
        g.putImageData(d, 0, 0);
      }
      return c;
    });
  }

  /* 白黒のカットイン: 白黒の縞の上に斜めの黒白の大きなかけら、立ち絵が横から入る。accent は目の光の色 */
  P.monoCutin = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, s = t * p.dur, slide = ease.out(clamp((s - .1) / .12, 0, 1)), r = rng((p.seed || 31) + Math.floor(env.time * 20));
    stripes(ctx, env, r, true);
    // 斜めの大きなかけら(白と黒)
    var shards = once(env, 'mshard' + W, function () {
      var q = rng(33), list = [];
      for (var i = 0; i < 7; i++) { var x = q() * W, y = q() * H, l = (500 + q() * 900) * S, w = (200 + q() * 400) * S, a = -.55 + (q() - .5) * .3; list.push([x, y, l, w, a, i % 2]); }
      return list;
    });
    for (var i = 0; i < shards.length; i++) {
      var sh = shards[i], dx = (1 - slide) * (i % 2 ? 1 : -1) * 600 * S;
      ctx.save(); ctx.translate(sh[0] + dx - s * 60 * S, sh[1]); ctx.rotate(sh[4]);
      ctx.fillStyle = sh[5] ? '#fff' : '#000';
      var bw2 = sh[3] * .35; ctx.beginPath(); ctx.moveTo(-sh[2] / 2, -bw2); ctx.lineTo(sh[2] / 2, -bw2); ctx.lineTo(sh[2] / 2 - bw2 * 1.5, bw2); ctx.lineTo(-sh[2] / 2 + bw2 * .5, bw2); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
    var h = env.portrait ? H * .7 : H * 1.2, art = charArt(env, h, 'mono'), w = art.width;
    var x = lerp(W * 1.1, env.portrait ? W * .5 : W * .4, slide) - s * 50 * S, y = env.portrait ? H * .2 : -H * .12;
    if (s > .12) ctx.drawImage(art, x - w / 2, y);
    if (p.accent && s > .16) { // 目の光(仮の影の目の位置。立ち絵を入れたときは accentX/Y で合わせる)
      ctx.globalCompositeOperation = 'lighter';
      // 立ち絵に ?eyes=左目x,左目y,右目x,右目y(絵の px)があれば、その位置に光を置く
      var eyes = env.opts.eyes, img = env.opts.charImage, k = img && h / img.height;
      var ex = eyes && k ? x - w / 2 + (eyes[0] + eyes[2]) / 2 * k : x + h * (p.accentX || 0),
          ey = eyes && k ? y + (eyes[1] + eyes[3]) / 2 * k : y + h * (p.accentY || .3),
          gap = eyes && k ? (eyes[2] - eyes[0]) / 2 * k : h * .07;
      for (var e = -1; e <= 1; e += 2) {
        var gx = ex + e * gap, gg = ctx.createRadialGradient(gx, ey, 0, gx, ey, h * .06);
        gg.addColorStop(0, '#fff'); gg.addColorStop(.25, p.accent); gg.addColorStop(1, 'rgba(0,120,255,0)');
        ctx.fillStyle = gg; ctx.fillRect(gx - h * .06, ey - h * .06, h * .12, h * .12);
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    sliceShift(ctx, env, 6, 50, Math.floor(env.time * 20) + 9);
  };

  /* 白とシアンの白飛び: 横の光の筋が強まって真っ白になる */
  P.blowout = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, r = rng(101 + f60(env));
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(20,150,255,' + (.2 + .3 * t) + ')'; ctx.fillRect(-W * .1, -H * .1, W * 1.2, H * 1.2);
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < 40; i++) { var y = r() * H, h = (4 + r() * 40) * S; ctx.fillStyle = r() < .35 ? 'rgba(255,255,255,' + (.3 + t * .5) + ')' : 'rgba(30,120,255,.7)'; ctx.fillRect(r() * W * .5 - W * .2, y, W * (.4 + r() * .8), h); }
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(255,255,255,' + smooth(.5, 1, t) * .5 + ')'; ctx.fillRect(-W * .1, -H * .1, W * 1.2, H * 1.2);
  };

  /* けむりの地(暗い灰色のもや) */
  function smokeArt(env, tint) {
    return once(env, 'smoke' + tint + env.W, function () {
      var c = offscreen(env.W / 4, env.H / 4), g = c.getContext('2d'), r = rng(tint === 'blue' ? 5 : 6), W = c.width, H = c.height;
      g.fillStyle = tint === 'blue' ? '#0c0e18' : '#2a2a2e'; g.fillRect(0, 0, W, H);
      for (var i = 0; i < 70; i++) {
        var x = r() * W, y = r() * H, R = (20 + r() * 90), v = Math.round(tint === 'blue' ? 40 + r() * 60 : 70 + r() * 120);
        var gr = g.createRadialGradient(x, y, 0, x, y, R);
        gr.addColorStop(0, tint === 'blue' ? 'rgba(' + v + ',' + v + ',' + (v + 40) + ',.35)' : 'rgba(' + v + ',' + v + ',' + v + ',.4)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - R, y - R, R * 2, R * 2);
      }
      for (i = 0; i < 300; i++) { g.fillStyle = 'rgba(255,255,255,' + r() * .5 + ')'; g.fillRect(r() * W, r() * H, 1, 1); }
      return c;
    });
  }
  P.smoke = function (ctx, t, p, env) {
    var s = 1.05 + t * .05;
    ctx.translate(env.W / 2, env.H / 2); ctx.scale(s, s); ctx.translate(-env.W / 2, -env.H / 2);
    ctx.drawImage(smokeArt(env, p.tint || 'grey'), 0, 0, env.W, env.H);
  };

  /* 交差するレーザー: けむりの地に、色の光の線が増えていく。count 本 */
  P.lasers = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, n = p.count || 22, D = Math.sqrt(W * W + H * H), i, k;
    ctx.drawImage(smokeArt(env, 'blue'), 0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    var r = rng(p.seed || 41), pal = [[60, 200, 255], [255, 60, 200], [255, 50, 40], [190, 255, 60], [170, 90, 255], [80, 140, 255], [255, 210, 60]];
    var shown = Math.ceil(n * lerp(.35, 1, smooth(0, .5, t)));
    // 太い光は半分の大きさの画面に描いて引きのばす(にじむ光なので細かさはいらない)
    var lc = once(env, 'laserc' + W, function () { return offscreen(W / 2, H / 2); }), lg = lc.getContext('2d');
    lg.setTransform(.5, 0, 0, .5, 0, 0); lg.clearRect(0, 0, W, H); lg.globalCompositeOperation = 'lighter';
    for (i = 0; i < n; i++) {
      var a = r() * Math.PI, sp = (r() - .5) * 1.4, cx = W * (.1 + r() * .8), cy = H * (.1 + r() * .8), col = pal[i % pal.length];
      if (i >= shown) continue;
      a += sp * t;
      var flick = env.opts.reduced ? 1 : .7 + .3 * Math.sin(env.time * 37 + i * 2.1), dx = Math.cos(a) * D, dy = Math.sin(a) * D;
      var widths = [110, 34, 6], alphas = [.18, .7, .8];
      for (k = 0; k < 3; k++) {
        var gx = k === 2 ? ctx : lg;
        gx.strokeStyle = k === 2 ? 'rgba(255,255,255,' + flick + ')' : rgba(col, alphas[k] * flick);
        gx.lineWidth = widths[k] * S;
        gx.beginPath(); gx.moveTo(cx - dx, cy - dy); gx.lineTo(cx + dx, cy + dy); gx.stroke();
      }
    }
    ctx.drawImage(lc, 0, 0, W, H);
    // 舞う光の玉
    var r2 = rng(43);
    for (i = 0; i < 26; i++) { var x = r2() * W, y = r2() * H + t * 80 * S, R = (8 + r2() * 30) * S, gg = ctx.createRadialGradient(x, y, 0, x, y, R); gg.addColorStop(0, 'rgba(120,220,255,.8)'); gg.addColorStop(1, 'rgba(0,100,255,0)'); ctx.fillStyle = gg; ctx.fillRect(x - R, y - R, R * 2, R * 2); }
    // 終わりにまん中から白い光
    var wf = smooth(.8, 1, t);
    if (wf <= 0) return;
    var g = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, D * .45);
    g.addColorStop(0, 'rgba(255,255,255,' + wf + ')'); g.addColorStop(.4, 'rgba(255,255,255,' + wf * .6 + ')'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  };

  /* 三日月の斬撃(白と青の光が弧を描いて横切る)。x, y は円の中心(0〜1)、r は半径(長い辺に対して)、from/to は角度(度)、width */
  P.arc = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, M = Math.max(W, H), cx = W * p.x, cy = H * p.y, R = M * (p.r || .6);
    var a0 = p.from * Math.PI / 180, a1 = p.to * Math.PI / 180, w = (p.width || 140) * S;
    var head = lerp(a0, a1, ease.out(clamp(t * 1.5, 0, 1))), tail = lerp(a0, a1, ease.in(t));
    ctx.globalCompositeOperation = 'lighter';
    for (var gh = 3; gh >= 1; gh--) { // 残像
      ctx.fillStyle = 'rgba(' + (p.glow || '90,170,255') + ',' + (.22 * (4 - gh) / 3) + ')';
      crescent(ctx, cx, cy, R, tail, lerp(tail, head, 1 - gh * .12), w * (1 + gh * .35));
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.shadowColor = 'rgb(' + (p.glow || '90,170,255') + ')'; ctx.shadowBlur = 50 * S;
    ctx.fillStyle = p.color || '#fff';
    crescent(ctx, cx, cy, R, tail, head, w);
    ctx.shadowBlur = 0;
  };

  /* 速さの線(暗い地に黄と緑の筋が一方向へ流れる)。angle(度) */
  P.speedLines = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, r = rng(121 + f60(env)), a = (p.angle || -20) * Math.PI / 180, D = Math.max(W, H);
    ctx.fillStyle = p.bg || '#04030a'; ctx.fillRect(-W * .1, -H * .1, W * 1.2, H * 1.2);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    var cols = ['rgba(255,230,40,.9)', 'rgba(120,255,60,.85)', 'rgba(255,140,20,.85)', 'rgba(255,255,200,.9)'];
    ctx.save(); ctx.translate(W * .35, H * .5); ctx.rotate(a);
    for (var i = 0; i < 70; i++) { var y = (r() - .5) * D * .9, x = (r() - .3) * D, l = (100 + r() * 600) * S; ctx.strokeStyle = cols[i % 4]; ctx.lineWidth = (2 + r() * 9) * S; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y); ctx.stroke(); }
    for (i = 0; i < 30; i++) { ctx.fillStyle = cols[i % 4]; ctx.beginPath(); ctx.arc((r() - .3) * D, (r() - .5) * D * .9, (4 + r() * 10) * S, 0, TAU); ctx.fill(); }
    ctx.restore();
  };

  /* ガラスが割れる: 白と桃色の光の中、まん中に黒い穴があき、かけらが外へ飛ぶ。negFrames で白黒反転のコマ */
  P.hole = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, cx = W / 2, cy = H / 2, D = Math.sqrt(W * W + H * H), i;
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, D * .55);
    g.addColorStop(0, 'rgba(255,255,255,.95)'); g.addColorStop(.45, 'rgba(255,220,230,.55)'); g.addColorStop(1, 'rgba(240,130,160,.35)');
    ctx.fillStyle = g; ctx.fillRect(-W * .1, -H * .1, W * 1.2, H * 1.2);
    // 光の筋
    var r = rng(131);
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    for (i = 0; i < 30; i++) { var a = r() * TAU, w = .01 + r() * .03; ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a - w) * D, cy + Math.sin(a - w) * D); ctx.lineTo(cx + Math.cos(a + w) * D, cy + Math.sin(a + w) * D); ctx.fill(); }
    // 黒い穴(ぎざぎざ)
    var R = Math.min(W, H) * lerp(.18, .42, ease.out(t)), n = 22;
    ctx.fillStyle = '#050003'; ctx.beginPath();
    var rr = rng(133);
    for (i = 0; i <= n; i++) { var aa = i / n * TAU, k = .75 + rr() * .45; ctx.lineTo(cx + Math.cos(aa) * R * k, cy + Math.sin(aa) * R * k * .95); }
    ctx.fill();
    // かけら
    var r2 = rng(137);
    for (i = 0; i < 60; i++) {
      var ang = r2() * TAU, d0 = R * (.9 + r2() * .5), d = d0 + ease.out(t) * (200 + r2() * 700) * S, sz = (40 + r2() * 160) * S * (1 - t * .3), rot = r2() * TAU + t * (r2() - .5) * 6;
      ctx.save(); ctx.translate(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d * .9); ctx.rotate(rot);
      ctx.fillStyle = 'rgba(' + (200 + Math.round(r2() * 55)) + ',' + (170 + Math.round(r2() * 60)) + ',' + (190 + Math.round(r2() * 60)) + ',.72)';
      ctx.beginPath(); ctx.moveTo(-sz * .5, -sz * .3); ctx.lineTo(sz * .5, -sz * .1 * r2()); ctx.lineTo(sz * .1, sz * .45); ctx.closePath(); ctx.fill();
      ctx.strokeStyle = 'rgba(40,10,20,.85)'; ctx.lineWidth = 2.5 * S; ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,.95)'; ctx.lineWidth = 1.2 * S; ctx.beginPath(); ctx.moveTo(-sz * .45, -sz * .28); ctx.lineTo(sz * .45, -sz * .1); ctx.stroke();
      ctx.restore();
    }
    if (p.negFrames && p.negFrames.indexOf(Math.round(t * p.dur * 60)) >= 0) invertAll(ctx, env, p.mono !== false);
  };

  /* 爆発の光(字の後ろ): 暗い焦げ茶の地に、橙の光の筋・白い芯・火の粉 */
  P.burst = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, D = Math.sqrt(W * W + H * H), cx = W * (p.x == null ? .5 : p.x), cy = H * (p.y == null ? .5 : p.y), i;
    var bg = ctx.createRadialGradient(cx, cy, 0, cx, cy, D * .6);
    bg.addColorStop(0, '#5a1c02'); bg.addColorStop(.5, '#250800'); bg.addColorStop(1, '#070100');
    ctx.fillStyle = bg; ctx.fillRect(-W * .1, -H * .1, W * 1.2, H * 1.2);
    ctx.globalCompositeOperation = 'lighter';
    var r = rng(p.seed || 51), n = 50, grow = ease.out(clamp(t * 2.5, 0, 1));
    for (i = 0; i < n; i++) {
      var a = i / n * TAU + r() * .1 + t * .2, len = D * (.3 + r() * .6) * grow, w = (.006 + r() * .025);
      ctx.fillStyle = ['rgba(255,140,20,.35)', 'rgba(255,210,80,.3)', 'rgba(255,80,10,.35)', 'rgba(255,250,220,.25)'][i % 4];
      ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(cx + Math.cos(a - w) * len, cy + Math.sin(a - w) * len); ctx.lineTo(cx + Math.cos(a + w) * len, cy + Math.sin(a + w) * len); ctx.closePath(); ctx.fill();
    }
    var core = D * (.1 + .2 * grow) * (1 - t * .4), g = ctx.createRadialGradient(cx, cy, 0, cx, cy, core);
    g.addColorStop(0, 'rgba(255,255,240,.9)'); g.addColorStop(.4, 'rgba(255,200,90,.6)'); g.addColorStop(1, 'rgba(255,100,20,0)');
    ctx.fillStyle = g; ctx.fillRect(cx - core, cy - core, core * 2, core * 2);
    // 火の粉(尾を引く)
    ctx.lineCap = 'round';
    for (i = 0; i < 110; i++) {
      var aa = r() * TAU, sp = .2 + r(), d = D * .55 * ease.out(t) * sp, l = 30 * S * sp * (1 - t);
      ctx.strokeStyle = 'rgba(255,' + Math.round(180 + r() * 70) + ',90,' + (1 - t * .8) + ')'; ctx.lineWidth = (2 + r() * 4) * S;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(aa) * d, cy + Math.sin(aa) * d); ctx.lineTo(cx + Math.cos(aa) * (d - l), cy + Math.sin(aa) * (d - l)); ctx.stroke();
    }
  };

  /* ---------- 決めの字: 何枚も重ねた厚み・金属の金のふち・虹の面・光の筋・つや・外の光 ---------- */
  // 字の面の色。palette: 'rainbow'(虹)/ 'red'(赤)/ 'gold'(金)/ 'blue'(青)。パチンコの予告の色の段階(青 < 赤 < 金 < 虹)
  var PAL = { red: ['#ffd9c8', '#ff3b2a', '#c4000e', '#ff7a50', '#8a0010'], gold: ['#fffbe0', '#ffd23a', '#d08a00', '#fff0a8', '#b86a00'], blue: ['#e0f6ff', '#2ab4ff', '#0050d0', '#7ad8ff', '#0a2a90'] };
  function rainbowFace(w, h, seed, palette) {
    var c = offscreen(w, h), g = c.getContext('2d'), r = rng(seed), i, pal = PAL[palette];
    var band = g.createLinearGradient(0, 0, w * .7, h);
    for (i = 0; i <= 14; i++) band.addColorStop(i / 14, pal ? pal[i % pal.length] : hue(i / 7 + .02, 55));
    g.fillStyle = band; g.fillRect(0, 0, w, h);
    // 絞り染めのようなまだら(濃い色のまま重ねる)
    for (i = 0; i < 160; i++) {
      var x = r() * w, y = r() * h, rad = (.04 + r() * .14) * h, hh = r();
      var gr = g.createRadialGradient(x, y, 0, x, y, rad);
      if (pal) { gr.addColorStop(0, pal[Math.floor(hh * pal.length)]); gr.addColorStop(1, 'rgba(0,0,0,0)'); }
      else { gr.addColorStop(0, hue(hh, 58)); gr.addColorStop(.6, hue(hh + .08, 52, .85)); gr.addColorStop(1, hue(hh + .15, 50, 0)); }
      g.fillStyle = gr; g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    // 白い光の筋(斜め)と、細い白のひび
    g.lineCap = 'round';
    for (i = 0; i < 70; i++) {
      var y0 = r() * h * 1.4 - h * .2, x0 = r() * w, l = (.1 + r() * .35) * w;
      g.strokeStyle = 'rgba(255,255,255,' + (.35 + r() * .6) + ')'; g.lineWidth = (.002 + r() * r() * .02) * h;
      g.beginPath(); g.moveTo(x0, y0); g.lineTo(x0 + l, y0 - l * .45); g.stroke();
    }
    // 黒いひびの細い線(元の動画の字の面にある、ざらっとした濃さ)
    for (i = 0; i < 55; i++) {
      var x1 = r() * w, y1 = r() * h, an = r() * TAU; g.strokeStyle = 'rgba(30,0,40,' + (.3 + r() * .4) + ')'; g.lineWidth = (.002 + r() * .006) * h;
      g.beginPath(); g.moveTo(x1, y1); for (var k2 = 0; k2 < 4; k2++) { an += (r() - .5) * 1.5; x1 += Math.cos(an) * h * .05; y1 += Math.sin(an) * h * .05; g.lineTo(x1, y1); } g.stroke();
    }
    for (i = 0; i < 40; i++) { g.fillStyle = 'rgba(255,255,255,' + (.5 + r() * .5) + ')'; var sx = r() * w, sy = r() * h, ss = (.004 + r() * .012) * h; g.fillRect(sx, sy, ss * 4, ss); }
    return c;
  }
  function tint(src, fill) { var c = offscreen(src.width, src.height), g = c.getContext('2d'); g.drawImage(src, 0, 0); g.globalCompositeOperation = 'source-in'; g.fillStyle = fill; g.fillRect(0, 0, c.width, c.height); return c; }
  function textArt(env, lines, size, palette) {
    return once(env, 'art' + lines.join('|') + Math.round(size) + (palette || ''), function () {
      var g0 = offscreen(4, 4).getContext('2d'), i, j;
      g0.font = size + 'px ' + FONT;
      var maxw = 0; for (j = 0; j < lines.length; j++) maxw = Math.max(maxw, g0.measureText(lines[j]).width);
      var pad = size * .42, lh = size * 1.02, w = maxw + pad * 2, h = lines.length * lh + pad * 2;
      var thick = size * .085, rimW = size * .11, depth = Math.round(size * .1);
      function shape(g, extra, dx, dy) {
        g.font = size + 'px ' + FONT; g.textAlign = 'center'; g.textBaseline = 'top'; g.lineJoin = 'round'; g.lineWidth = thick + extra;
        for (var k = 0; k < lines.length; k++) { var y = pad + k * lh + (dy || 0); g.fillText(lines[k], w / 2 + (dx || 0), y); g.strokeText(lines[k], w / 2 + (dx || 0), y); }
      }
      var mask = offscreen(w, h), mg = mask.getContext('2d'); mg.fillStyle = mg.strokeStyle = '#fff'; shape(mg, 0);
      var rim = offscreen(w, h), rg = rim.getContext('2d'); rg.fillStyle = rg.strokeStyle = '#fff'; shape(rg, rimW * 2);
      // 面: 虹のまだらを字の形に切り抜き、ふちの内側にかげとつやを入れる(浮き彫り)
      var face = rainbowFace(w, h, 71, palette), fg = face.getContext('2d');
      fg.globalCompositeOperation = 'destination-in'; fg.drawImage(mask, 0, 0);
      var outside = offscreen(w, h), og = outside.getContext('2d'); og.fillStyle = '#fff'; og.fillRect(0, 0, w, h); og.globalCompositeOperation = 'destination-out'; og.drawImage(mask, 0, 0);
      fg.globalCompositeOperation = 'source-atop';
      fg.shadowBlur = size * .035; fg.shadowColor = 'rgba(40,0,30,.7)'; fg.shadowOffsetX = -size * .025; fg.shadowOffsetY = -size * .03; fg.drawImage(outside, 0, 0);
      fg.shadowColor = 'rgba(255,255,255,.6)'; fg.shadowOffsetX = size * .02; fg.shadowOffsetY = size * .025; fg.shadowBlur = size * .02; fg.drawImage(outside, 0, 0);
      fg.shadowColor = 'transparent';
      // 上半分にうすい白のつや
      var gl = fg.createLinearGradient(0, 0, 0, lh);
      gl.addColorStop(0, 'rgba(255,255,255,.22)'); gl.addColorStop(.45, 'rgba(255,255,255,.03)'); gl.addColorStop(.5, 'rgba(255,255,255,0)');
      fg.fillStyle = gl; for (j = 0; j < lines.length; j++) { fg.save(); fg.translate(0, pad + j * lh); fg.fillRect(0, 0, w, lh); fg.restore(); }
      // 金属の金: 行ごとに縞の入った縦のグラデーション
      var gold = offscreen(w, h), gg = gold.getContext('2d');
      for (j = 0; j < lines.length; j++) {
        var y0 = pad + j * lh - rimW, gr = gg.createLinearGradient(0, y0, 0, y0 + lh + rimW * 2);
        gr.addColorStop(0, '#fffbe6'); gr.addColorStop(.12, '#ffd65a'); gr.addColorStop(.3, '#b06a08'); gr.addColorStop(.42, '#ffe9a0'); gr.addColorStop(.55, '#d99a1e');
        gr.addColorStop(.7, '#7a3c00'); gr.addColorStop(.84, '#f5c44a'); gr.addColorStop(1, '#5a2a00');
        gg.fillStyle = gr; gg.fillRect(0, j === 0 ? 0 : y0, w, j === lines.length - 1 ? h : lh + rimW * 2);
      }
      gg.globalCompositeOperation = 'destination-in'; gg.drawImage(rim, 0, 0);
      // 金のふちにも斜めの光
      gg.globalCompositeOperation = 'source-atop'; gg.shadowBlur = size * .015; gg.shadowColor = 'rgba(255,255,230,1)'; gg.shadowOffsetX = size * .012; gg.shadowOffsetY = size * .015;
      var outR = offscreen(w, h), orc = outR.getContext('2d'); orc.fillStyle = '#fff'; orc.fillRect(0, 0, w, h); orc.globalCompositeOperation = 'destination-out'; orc.drawImage(rim, 0, 0);
      gg.drawImage(outR, 0, 0); gg.shadowColor = 'rgba(60,20,0,.9)'; gg.shadowOffsetX = -size * .012; gg.shadowOffsetY = -size * .015; gg.drawImage(outR, 0, 0);
      var art = offscreen(w + depth * 1.2, h + depth * 1.5), ag = art.getContext('2d');
      // 1) 外の光(赤と橙)
      ag.shadowColor = 'rgba(255,60,0,.95)'; ag.shadowBlur = size * .2; ag.drawImage(tint(rim, '#ff5a10'), depth * .5, depth * .8);
      ag.shadowColor = 'rgba(255,170,40,.9)'; ag.shadowBlur = size * .07; ag.drawImage(tint(rim, '#ff8a20'), depth * .5, depth * .8);
      ag.shadowColor = 'transparent';
      // 2) 厚み: 金のふちの形を、奥ほど暗い焦げ茶で何枚も重ねる
      var far = tint(rim, '#1a0800'), mid = tint(rim, '#3e1a02'), near = tint(rim, '#6a3206');
      for (i = depth; i >= 1; i--) ag.drawImage(i > depth * .66 ? far : i > depth * .25 ? mid : near, i * .45, i * .9);
      // 厚みの角に金の細い線(立体の稜線)
      ag.globalAlpha = .55; ag.drawImage(tint(rim, '#c88420'), depth * .45, depth * .9); ag.globalAlpha = 1;
      ag.drawImage(far, depth * .45 - 1, depth * .9 - 2);
      // 3) 金のふち 4) ふちと面の間の暗い線 5) 面
      ag.drawImage(gold, 0, 0);
      var inner = offscreen(w, h), ig = inner.getContext('2d'); ig.fillStyle = ig.strokeStyle = '#2a0e00'; shape(ig, size * .03);
      ag.drawImage(inner, 0, 0);
      ag.drawImage(face, 0, 0);
      // つやの点(白い玉)
      var r = rng(19);
      ag.globalCompositeOperation = 'source-atop';
      for (i = 0; i < 18; i++) { var px = pad + r() * maxw, py = pad + r() * lines.length * lh, R = size * (.02 + r() * .05), sg = ag.createRadialGradient(px, py, 0, px, py, R); sg.addColorStop(0, 'rgba(255,255,255,.95)'); sg.addColorStop(1, 'rgba(255,255,255,0)'); ag.fillStyle = sg; ag.fillRect(px - R, py - R, R * 2, R * 2); }
      ag.globalCompositeOperation = 'source-over';
      var stars = []; for (i = 0; i < 9; i++) stars.push([pad + r() * maxw, pad + r() * lines.length * lh, size * (.12 + r() * .18), r() * 6]);
      return { img: art, mask: mask, w: art.width, h: art.height, stars: stars, size: size, sheen: offscreen(w, h) };
    });
  }
  function drawText(ctx, env, art, cx, cy, sx, sy, sheenPos) {
    ctx.save(); ctx.translate(cx, cy); ctx.scale(sx, sy); ctx.translate(-art.w / 2, -art.h / 2);
    ctx.drawImage(art.img, 0, 0);
    if (sheenPos != null) { // 字の上を斜めに光が通る
      var sh = art.sheen, g = sh.getContext('2d'), w = sh.width, h = sh.height, x = lerp(-w * .3, w * 1.3, sheenPos);
      g.globalCompositeOperation = 'copy'; g.drawImage(art.mask, 0, 0);
      g.globalCompositeOperation = 'source-in';
      var lg = g.createLinearGradient(x - w * .12, 0, x + w * .12, h * .25);
      lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, 'rgba(255,255,255,.85)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = lg; g.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(sh, 0, 0); ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < art.stars.length; i++) { var s = art.stars[i], tw = Math.max(0, Math.sin(env.time * 7 + s[3])); if (tw > .05) star(ctx, s[0], s[1], s[2] * tw, tw); }
    ctx.restore();
  }
  // 縦の並びの字の大きさは幅で決め、1:1 などの低い枠では高さで抑える
  // 打ちこまれた字が長くても枠からはみ出さないように、いちばん長い行の幅で大きさを抑える(ふち・厚みの分 .84 を見る)
  function fitSize(lines, size, maxW, maxH) {
    var g = once({ cache: fitSize }, 'g', function () { return offscreen(4, 4).getContext('2d'); }), w = 0;
    g.font = '100px ' + FONT;
    for (var i = 0; i < lines.length; i++) w = Math.max(w, g.measureText(lines[i]).width / 100);
    return Math.max(8, Math.min(size, maxW / (w + .84), maxH / (lines.length * 1.02 + .84)));
  }
  function textLayout(p, env) {
    var W = env.W, H = env.H, lines = p.lines || ['ナイス', 'ギフト'], P2 = env.portrait, L;
    if (p.layout === 'side') L = P2 ? { size: Math.min(W * .27, H * .15), x: W * .5, y: H * .22, w: W, h: H * .42 } : { size: H * .36, x: W * .29, y: H * .5, w: W * .56, h: H };
    else if (p.layout === 'mid') L = P2 ? { size: Math.min(W * .22, H * .125), x: W * .5, y: H * .45, w: W, h: H * .6 } : { size: H * .3, x: W * .42, y: H * .5, w: W * .8, h: H };
    else L = P2 ? { size: Math.min(W * .36, H * .2), x: W * .5, y: H * .45, w: W, h: H * .8 } : { size: H * .66, x: W * .5, y: H * .5, w: W, h: H };
    var k = p.scale || 1; // scale: 小さめに出す(予告など)。y: 縦の位置(0〜1)を決める
    if (p.y != null) L.y = H * p.y;
    L.size = fitSize(lines, L.size * k, L.w * .96, L.h * .96); L.lines = lines;
    return L;
  }
  /* 虹と金の立体の大きな字。lines、layout: 'slam'(大きく叩きつけ)/ 'mid'(まん中に小さく)/ 'side'(左に置いて決め)、palette(面の色)、scale、y */
  P.rainbowText = function (ctx, t, p, env) {
    var L = textLayout(p, env), art = textArt(env, L.lines, L.size, p.palette), s = t * p.dur, S = env.S;
    var sc = 1, sx = 1, sy = 1, x = L.x, y = L.y, k;
    if (p.layout === 'side') {
      var inn = ease.out(clamp(s / .14, 0, 1));
      sc = lerp(1.35, 1, inn) * (1 + .015 * Math.sin(s * 5)); x = lerp(L.x - env.W * .25, L.x, inn); y += Math.sin(s * 3) * 6 * S;
    } else if (p.layout === 'mid') {
      sc = lerp(.6, 1, ease.back(clamp(s / .1, 0, 1)));
    } else {
      // 叩きつけ: 奥から大きく落ちてきて、当たった瞬間につぶれて跳ね返る
      var hit = .09;
      if (s < hit) { sc = lerp(2.2, 1, ease.in(s / hit)); }
      else { k = s - hit; var sq = Math.exp(-k * 14) * Math.cos(k * 48) * .2; sx = 1 + sq; sy = 1 - sq; sc = 1 + k * .08; }
      if (s < hit + .05) { // 残像(大きいほうへ)
        ctx.globalCompositeOperation = 'lighter';
        for (var gh = 1; gh <= 3; gh++) { ctx.globalAlpha = .28 / gh; var gs = sc * (1 + gh * .18); drawText(ctx, env, art, x, y, gs, gs); }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
      }
    }
    var sheen = ((s * .8) % 1.3);
    drawText(ctx, env, art, x, y, sc * sx, sc * sy, sheen < 1 ? sheen : null);
  };

  /* 決めの背景: 白い地に、まん中から虹の速さの線が広がる。x, y は光の位置 */
  P.rays = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, cx = W * (p.x == null ? .5 : p.x), cy = H * (p.y == null ? .5 : p.y), D = Math.sqrt(W * W + H * H), i;
    ctx.fillStyle = '#fbfbff'; ctx.fillRect(-W * .1, -H * .1, W * 1.2, H * 1.2);
    var r = rng(p.seed || 61), spin = env.opts.reduced ? 0 : env.time * .12, flow = env.opts.reduced ? 0 : env.time;
    var out = ctx, rc = once(env, 'raysc' + W, function () { return offscreen(W / 2, H / 2); });
    ctx = rc.getContext('2d'); ctx.setTransform(.5, 0, 0, .5, 0, 0); ctx.fillStyle = '#fbfbff'; ctx.fillRect(0, 0, W, H);
    ctx.lineCap = 'round';
    for (i = 0; i < 380; i++) {
      var a = r() * TAU + spin, hh = r(), r0 = D * (.08 + r() * .3), l = D * (.15 + r() * .5), sp = .4 + r();
      var off = ((flow * sp * .9 + r()) % 1) * D * .35;
      var a0 = r0 + off, a1 = a0 + l;
      ctx.strokeStyle = hue(hh, 30 + r() * 30, .6 + r() * .4); ctx.lineWidth = (3 + r() * r() * 30) * S;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * a0, cy + Math.sin(a) * a0); ctx.lineTo(cx + Math.cos(a) * a1, cy + Math.sin(a) * a1); ctx.stroke();
    }
    var g = ctx.createRadialGradient(cx, cy, 0, cx, cy, D * .22);
    g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(.4, 'rgba(255,255,255,.7)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx = out; ctx.drawImage(rc, -W * .02, -H * .02, W * 1.04, H * 1.04);
    ctx.globalCompositeOperation = 'lighter';
    for (i = 0; i < 40; i++) { var x = r() * W, y = r() * H, tw = Math.max(0, Math.sin(env.time * 6 + i)); if (tw > .1) star(ctx, x, y, (10 + r() * 30) * S * tw, tw * .9); }
    ctx.globalCompositeOperation = 'source-over';
  };

  /* 決めの立ち絵(色つき)。x は 0〜1。はじめは虹色に光って、だんだん本来の色になる */
  P.character = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, s = t * p.dur, h = env.portrait ? H * .6 : H * 1.08, art;
    h = Math.min(h, W * 1.3); art = charArt(env, h, 'color'); // 縦長でない比(1:1 など)でも枠の幅に収める
    var x = W * (env.portrait ? .5 : (p.x || .72)), y = env.portrait ? H * .47 : H * .0, sc = 1 + t * .04, slide = ease.out(clamp(s / .15, 0, 1));
    ctx.globalAlpha = slide;
    ctx.translate(x, y + h / 2); ctx.scale(sc, sc); ctx.translate(-x, -(y + h / 2));
    var dx = x - art.width / 2 + (1 - slide) * 120 * S;
    ctx.drawImage(art, dx, y);
    var glow = 1 - smooth(.3, .75, s); // 虹色の光(元の動画の 4.4〜5.1 秒)
    if (glow > 0) {
      var tmp = once(env, 'chartmp' + Math.round(h), function () { return offscreen(art.width, art.height); }), g = tmp.getContext('2d');
      g.globalCompositeOperation = 'copy'; g.drawImage(art, 0, 0); g.globalCompositeOperation = 'source-atop';
      var lg = g.createLinearGradient(0, 0, art.width, art.height);
      for (var i = 0; i <= 6; i++) lg.addColorStop(i / 6, hue(i / 6 + env.time * 1.5, 55));
      g.fillStyle = lg; g.fillRect(0, 0, art.width, art.height);
      ctx.globalAlpha = glow * .85; ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(tmp, dx, y);
    }
  };

  /* ---------- 予告・カットイン・図柄の部品(プチュンのほかの演出で使う) ---------- */
  var BAND = { red: ['#3a0006', '#c4000e', '#ff3b2a'], blue: ['#020a2a', '#0050d0', '#2ab4ff'], gold: ['#2a1400', '#b86a00', '#ffd23a'], green: ['#012008', '#0a8a2a', '#5aff7a'] };
  // 字を枠の幅に合わせて書く(長い字は小さくする)。白い字に黒いふちと色の影
  function boldText(ctx, text, x, y, size, maxW, opt) {
    opt = opt || {};
    var font = opt.font || '700 100px "Zen Kaku Gothic New", sans-serif';
    ctx.font = font;
    var w = ctx.measureText(text).width / 100, sz = Math.max(8, Math.min(size, maxW / (w + .2)));
    ctx.font = font.replace('100px', Math.round(sz) + 'px');
    ctx.textAlign = opt.align || 'center'; ctx.textBaseline = 'middle'; ctx.lineJoin = 'round';
    if (opt.shadow) { ctx.fillStyle = opt.shadow; ctx.fillText(text, x + sz * .06, y + sz * .08); }
    ctx.strokeStyle = opt.stroke || '#0a0306'; ctx.lineWidth = sz * (opt.strokeW || .16); ctx.strokeText(text, x, y);
    ctx.fillStyle = opt.fill || '#fff'; ctx.fillText(text, x, y);
    return sz;
  }

  /* テロップ: 斜めの色の帯が横から走りこみ、白い字をのせる。text、y(0〜1)、color('red'/'blue'/'gold'/'green')、from(1 で右から) */
  P.telop = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, s = t * p.dur, c = BAND[p.color || 'red'], dir = p.from === 1 ? -1 : 1;
    var inn = ease.out(clamp(s / .14, 0, 1)), out = ease.in(clamp((s - (p.dur - .14)) / .14, 0, 1));
    var hb = Math.min(H * .1, W * .17) * (p.size || 1), y = H * (p.y == null ? .78 : p.y), dx = (inn - 1) * W * 1.2 * dir + out * W * 1.2 * dir;
    ctx.save(); ctx.translate(W / 2 + dx, y); ctx.rotate(-.06 * dir);
    var bw = W * 1.3, sk = hb * .5;
    var g = ctx.createLinearGradient(0, -hb / 2, 0, hb / 2);
    g.addColorStop(0, c[2]); g.addColorStop(.18, c[1]); g.addColorStop(.75, c[0]); g.addColorStop(1, c[1]);
    ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-bw / 2 + sk, -hb / 2); ctx.lineTo(bw / 2 + sk, -hb / 2); ctx.lineTo(bw / 2 - sk, hb / 2); ctx.lineTo(-bw / 2 - sk, hb / 2); ctx.closePath(); ctx.fill();
    // 上下の金の線と、帯の中を流れる光
    ctx.fillStyle = '#ffd65a'; ctx.fillRect(-bw / 2, -hb / 2 - 5 * S, bw, 5 * S); ctx.fillRect(-bw / 2, hb / 2, bw, 5 * S);
    ctx.globalCompositeOperation = 'lighter';
    var lx = ((s * 1.6) % 1.4 - .7) * W, lg = ctx.createLinearGradient(lx - W * .15, 0, lx + W * .15, 0);
    lg.addColorStop(0, 'rgba(255,255,255,0)'); lg.addColorStop(.5, 'rgba(255,255,255,.35)'); lg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = lg; ctx.fillRect(-bw / 2, -hb / 2, bw, hb);
    ctx.globalCompositeOperation = 'source-over';
    boldText(ctx, p.text || '', 0, 0, hb * .62, W * .86, { shadow: 'rgba(0,0,0,.6)' });
    ctx.restore();
  };

  /* キャラのカットイン(色つき): 斜めの帯が開き、中を速さの線が流れ、立ち絵が右から入ってセリフが出る。text(セリフ)、color */
  P.charCutin = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, s = t * p.dur, c = BAND[p.color || 'blue'], r = rng(141 + f60(env));
    var open = ease.out(clamp(s / .1, 0, 1)) * (1 - ease.in(clamp((s - (p.dur - .12)) / .12, 0, 1)));
    var bh = (env.portrait ? Math.min(H * .34, W * .62) : H * .62) * open, cy = H * (env.portrait ? .42 : .5), ang = -.14;
    if (bh < 1) return;
    ctx.save(); ctx.translate(W / 2, cy); ctx.rotate(ang);
    var bw = Math.sqrt(W * W + H * H) * 1.1;
    ctx.save(); ctx.beginPath(); ctx.rect(-bw / 2, -bh / 2, bw, bh); ctx.clip();
    var g = ctx.createLinearGradient(0, -bh / 2, 0, bh / 2);
    g.addColorStop(0, c[1]); g.addColorStop(.5, c[0]); g.addColorStop(1, c[1]);
    ctx.fillStyle = g; ctx.fillRect(-bw / 2, -bh / 2, bw, bh);
    ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
    for (var i = 0; i < 46; i++) { var y = (r() - .5) * bh, x = (r() - .5) * bw, l = (150 + r() * 700) * S; ctx.strokeStyle = i % 3 ? 'rgba(255,255,255,.35)' : c[2]; ctx.lineWidth = (2 + r() * 7) * S; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + l, y); ctx.stroke(); }
    ctx.globalCompositeOperation = 'source-over';
    // 立ち絵: 帯より大きく描いて顔のまわりを見せる
    var h = (env.portrait ? Math.min(H * .34, W * .62) : H * .62) * 1.5, art = charArt(env, h, 'color'), slide = ease.out(clamp((s - .04) / .16, 0, 1));
    var px = lerp(bw * .5, W * .26, slide) - s * 30 * S;
    ctx.drawImage(art, px - art.width / 2, -h * .24);
    ctx.restore();
    // 帯の金のふち
    ctx.fillStyle = '#ffd65a'; ctx.fillRect(-bw / 2, -bh / 2 - 7 * S, bw, 7 * S); ctx.fillRect(-bw / 2, bh / 2, bw, 7 * S);
    ctx.fillStyle = '#fff'; ctx.fillRect(-bw / 2, -bh / 2 - 12 * S, bw, 3 * S); ctx.fillRect(-bw / 2, bh / 2 + 9 * S, bw, 3 * S);
    // セリフ: 左半分に、ぽんと大きく出る
    var pop = s < .14 ? 0 : ease.back(clamp((s - .14) / .1, 0, 1));
    if (pop > 0 && p.text) {
      var tx = env.portrait ? -W * .2 : -W * .2;
      ctx.save(); ctx.translate(tx, 0); ctx.scale(pop, pop);
      // 長いセリフは2行に分ける(カンマがあればそこで)。1行ずつ枠の幅に合わせる
      var ls = p.text.split(','), one = ls[0], n2;
      if (ls.length === 1 && one.length > 6) ls = [one.slice(0, Math.ceil(one.length / 2)), one.slice(Math.ceil(one.length / 2))];
      n2 = ls.length;
      for (var li = 0; li < n2; li++) boldText(ctx, ls[li], 0, (li - (n2 - 1) / 2) * bh * .8 / n2, bh * .42 * Math.min(1, 1.6 / n2), W * .44, { font: '400 100px ' + FONT, stroke: '#000', strokeW: .2, shadow: c[1] });
      ctx.restore();
    }
    ctx.restore();
  };

  /* 図柄がそろう: 字(数字)の数だけ回る窓が並び、左から順に止まる。最後のひとつは遅れて止まる(リーチ)。text、stops(止まる秒)、palette */
  P.reels = function (ctx, t, p, env) {
    var W = env.W, H = env.H, S = env.S, s = t * p.dur, chars = Array.from(p.text || '777').slice(0, 5), n = chars.length, i;
    var stops = p.stops || chars.map(function (_, k) { return .35 + k * .3 + (k === n - 1 ? .35 : 0); });
    var cw = Math.min(W * .86 / n, H * .4 * .78), ch = cw * 1.28, gap = cw * .06, x0 = W / 2 - (n * cw + (n - 1) * gap) / 2, y0 = H * .48 - ch / 2;
    ctx.fillStyle = '#050104'; ctx.fillRect(-W * .1, -H * .1, W * 1.2, H * 1.2);
    // リーチ: 最後のひとつ以外がそろったら、うしろが赤く脈打つ
    var reach = n > 1 && s >= stops[n - 2] && s < stops[n - 1] && chars.slice(0, n - 1).every(function (ch2) { return ch2 === chars[0]; });
    if (reach) {
      var pulse = .5 + .5 * Math.sin(s * 30), D = Math.max(W, H), rg = ctx.createRadialGradient(W / 2, H * .48, 0, W / 2, H * .48, D * .6);
      rg.addColorStop(0, 'rgba(255,30,20,' + (.35 + .3 * pulse) + ')'); rg.addColorStop(1, 'rgba(60,0,0,0)');
      ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H);
    }
    var pool = chars.concat('1234567890'.split('')), size = ch * .62;
    for (i = 0; i < n; i++) textArt(env, [chars[i]], size, p.palette || 'red'); // 止まる瞬間に作ると引っかかるので、先に全部作る(fx.warm で済む)
    for (i = 0; i < n; i++) {
      var x = x0 + i * (cw + gap), stopped = s >= stops[i], since = s - stops[i];
      // 窓: 金のふちと、奥の暗いかげ
      ctx.fillStyle = '#ffd65a'; ctx.fillRect(x - 6 * S, y0 - 6 * S, cw + 12 * S, ch + 12 * S);
      var wg = ctx.createLinearGradient(0, y0, 0, y0 + ch);
      wg.addColorStop(0, '#000'); wg.addColorStop(.18, '#2a2028'); wg.addColorStop(.5, '#3a3038'); wg.addColorStop(.82, '#2a2028'); wg.addColorStop(1, '#000');
      ctx.fillStyle = wg; ctx.fillRect(x, y0, cw, ch);
      ctx.save(); ctx.beginPath(); ctx.rect(x, y0, cw, ch); ctx.clip();
      if (!stopped) { // 回っている: 字が上から下へ流れて、縦にぶれる
        var speed = reach && i === n - 1 ? 6 : 14, pos = s * speed + i * .37, k0 = Math.floor(pos), fr = pos - k0;
        ctx.font = '400 ' + Math.round(size) + 'px ' + FONT; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        for (var j = -1; j <= 1; j++) {
          var sym = pool[(k0 + j + i * 3 + pool.length * 9) % pool.length], yy = y0 + ch / 2 + (fr - j) * ch;
          for (var b = 0; b < 3; b++) { ctx.globalAlpha = .32; ctx.fillStyle = b === 1 ? '#fff4c8' : '#ffb020'; ctx.fillText(sym, x + cw / 2, yy + (b - 1) * ch * .08); }
        }
        ctx.globalAlpha = 1;
      }
      ctx.restore();
      if (stopped) { // 止まった: 立体の字が跳ねて止まり、窓が一瞬光る
        var art = textArt(env, [chars[i]], size, p.palette || 'red'), bounce = Math.exp(-since * 16) * Math.cos(since * 40) * ch * .12;
        var k = Math.min(cw * 1.15 / art.w, ch * 1.15 / art.h) * (1 + Math.exp(-since * 20) * .25);
        drawText(ctx, env, art, x + cw / 2, y0 + ch / 2 - bounce, k, k, null);
        var fl = Math.max(0, 1 - since / .18);
        if (fl > 0) { ctx.globalCompositeOperation = 'lighter'; ctx.fillStyle = 'rgba(255,240,200,' + fl * .7 + ')'; ctx.fillRect(x, y0, cw, ch); ctx.globalCompositeOperation = 'source-over'; }
      }
    }
  };

  /* 消えて透明に戻る(配信の画面が見えてくる) */
  P.fadeOut = function (ctx, t, p, env) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'destination-out'; ctx.fillStyle = 'rgba(0,0,0,' + ease.inOut(t) + ')'; ctx.fillRect(0, 0, env.W, env.H);
  };
})(window.Fx);
