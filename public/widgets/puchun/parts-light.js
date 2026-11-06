/* 光と爆発の部品: lasers(交差するレーザー)、arc(三日月の斬撃)、speedLines(速さの線)、hole(ガラスが割れる)、burst(爆発の光)。
   共通の道具は Fx._pi から取る。 */
(function (Fx) {
  'use strict';
  var _ = Fx._pi, P = _.P, rng = _.rng, lerp = _.lerp, smooth = _.smooth, ease = _.ease, clamp = _.clamp;
  var TAU = _.TAU, once = _.once, offscreen = _.offscreen, rgba = _.rgba;
  var invertAll = _.invertAll, crescent = _.crescent, star = _.star, smokeArt = _.smokeArt, hue = _.hue;

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
    var W = env.W, H = env.H, S = env.S, r = rng(121 + _.f60(env)), a = (p.angle || -20) * Math.PI / 180, D = Math.max(W, H);
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
})(window.Fx);
