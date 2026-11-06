/* 画面の効果の部品: glitch(切られた画面)、ink(墨の飛び散り)、monoCutin(白黒のカットイン)、blowout(白飛び)、smoke(けむり)。
   共通の道具は Fx._pi から取る。 */
(function (Fx) {
  'use strict';
  var _ = Fx._pi, P = _.P, rng = _.rng, lerp = _.lerp, smooth = _.smooth, ease = _.ease, clamp = _.clamp;
  var TAU = _.TAU, once = _.once, offscreen = _.offscreen, rgba = _.rgba, f60 = _.f60;
  var invertAll = _.invertAll, sliceShift = _.sliceShift;
  var cut = _.cut, crackAlong = _.crackAlong, poly = _.poly, charArt = _.charArt, smokeArt = _.smokeArt;

  /* ---------- 切られた画面: 灰色の横縞・ひび・切り口の帯・基板のかけら。切り口で2つに分かれて斜めにずれる ---------- */
  function cracks(env) {
    // ガラスの割れ: 切り口の中心を衝撃点として、放射状の折れ線＋枝＋同心の弧で「割れた」と読める網を作る
    return once(env, 'glass' + env.W, function () {
      var r = rng(61), W = env.W, H = env.H, S = env.S, c = cut(env);
      var cx = c.mid[0], cy = c.mid[1], D = Math.max(W, H), lines = [], shards = [], i, k;
      var prim = [];
      for (i = 0; i < 16; i++) {
        var ang = (i / 16) * TAU + (r() - .5) * .35, len = D * (.3 + r() * .34), seg = [[cx, cy]], x = cx, y = cy, a = ang;
        var steps = 5 + Math.floor(r() * 3), stepLen = len / steps;
        for (k = 0; k < steps; k++) {
          a += (r() - .5) * .38; x += Math.cos(a) * stepLen; y += Math.sin(a) * stepLen; seg.push([x, y]);
          if (k > 0 && k < steps - 1 && r() < .45) { // 枝
            var ba = a + (r() < .5 ? -1 : 1) * (.6 + r() * .5), bx = x, by = y, bl = stepLen * (0.7 + r() * 0.9), bseg = [[x, y]];
            bx += Math.cos(ba) * bl * .55; by += Math.sin(ba) * bl * .55; bseg.push([bx, by]);
            bx += Math.cos(ba + (r() - .5) * .4) * bl * .45; by += Math.sin(ba + (r() - .5) * .4) * bl * .45; bseg.push([bx, by]);
            lines.push({ pts: bseg, w: .9 });
          }
        }
        prim.push(seg); lines.push({ pts: seg, w: 1 });
      }
      // 同心の弧: 隣り合う放射線の間をつなぐ（所々欠ける）
      [.16, .3, .46].forEach(function (rad) {
        for (var j = 0; j < prim.length; j++) {
          if (r() < .3) continue;
          var p1 = prim[j], p2 = prim[(j + 1) % prim.length], arc = [], N = 6;
          for (var m = 0; m <= N; m++) {
            var tt = m / N, idx = rad * (p1.length - 1), i0 = Math.floor(idx), fr = idx - i0;
            var ax = p1[i0][0] + (p1[Math.min(i0 + 1, p1.length - 1)][0] - p1[i0][0]) * fr, ay = p1[i0][1] + (p1[Math.min(i0 + 1, p1.length - 1)][1] - p1[i0][1]) * fr;
            var bx2 = p2[i0][0] + (p2[Math.min(i0 + 1, p2.length - 1)][0] - p2[i0][0]) * fr, by2 = p2[i0][1] + (p2[Math.min(i0 + 1, p2.length - 1)][1] - p2[i0][1]) * fr;
            arc.push([ax + (bx2 - ax) * tt, ay + (by2 - ay) * tt]);
          }
          lines.push({ pts: arc, w: .8 });
        }
      });
      // 衝撃点のまわりの破片
      for (i = 0; i < 12; i++) {
        var sa = r() * TAU, sd = D * (.02 + r() * .07), sx = cx + Math.cos(sa) * sd, sy = cy + Math.sin(sa) * sd, ss = D * (.012 + r() * .02);
        shards.push([[sx, sy], [sx + ss, sy + ss * .4], [sx + ss * .3, sy + ss]]);
      }
      return { lines: lines, shards: shards };
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
    var W = env.W, H = env.H, S = env.S;
    // 地: 上下のわずかな濃淡だけ（帯は引かない）
    var bg = ctx.createLinearGradient(0, -H * .15, 0, H * 1.15);
    bg.addColorStop(0, '#17171c'); bg.addColorStop(.5, '#0c0c10'); bg.addColorStop(1, '#131318');
    ctx.fillStyle = bg; ctx.fillRect(-W * .2, -H * .2, W * 1.4, H * 1.4);
    var web = cracks(env), i;
    // 破片（うっすら白）
    for (i = 0; i < web.shards.length; i++) { ctx.fillStyle = 'rgba(255,255,255,.10)'; poly(ctx, web.shards[i]); ctx.fill(); }
    // ひび: 黒い影→白い芯の順で引くと、光る割れ目として読める
    ctx.lineJoin = 'miter'; ctx.lineCap = 'round';
    for (i = 0; i < web.lines.length; i++) { ctx.strokeStyle = 'rgba(0,0,0,.55)'; ctx.lineWidth = 5.5 * S * web.lines[i].w; poly(ctx, web.lines[i].pts); ctx.stroke(); }
    for (i = 0; i < web.lines.length; i++) { ctx.strokeStyle = 'rgba(255,255,255,.92)'; ctx.lineWidth = 2.1 * S * web.lines[i].w; poly(ctx, web.lines[i].pts); ctx.stroke(); }
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
    sliceShift(ctx, env, 4, 16, seed + 3);
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
  P.smoke = function (ctx, t, p, env) {
    var s = 1.05 + t * .05;
    ctx.translate(env.W / 2, env.H / 2); ctx.scale(s, s); ctx.translate(-env.W / 2, -env.H / 2);
    ctx.drawImage(smokeArt(env, p.tint || 'grey'), 0, 0, env.W, env.H);
  };
})(window.Fx);
