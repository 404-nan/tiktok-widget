/* 場面の部品: puchun(赤い横の光)、embers(火の粉)、slash(斬撃)。
   共通の道具は Fx._pi から取る。 */
(function (Fx) {
  'use strict';
  var _ = Fx._pi, P = _.P, rng = _.rng, lerp = _.lerp, smooth = _.smooth, ease = _.ease, clamp = _.clamp;
  var TAU = _.TAU, once = _.once, offscreen = _.offscreen, rgba = _.rgba, f60 = _.f60;
  var invertAll = _.invertAll, crescent = _.crescent, cut = _.cut, crackAlong = _.crackAlong, poly = _.poly;

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
})(window.Fx);
