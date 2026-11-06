/* 演出の部品の共通の道具と、塗りつぶし・反転。
   分割ファイル(parts-scene, parts-effect, parts-light, parts-text)が使う道具を
   Fx._pi に置く。部品の呼び出し側(fx.js, presets.js)からは使わない内部用。 */
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

  // 斬撃と切られた画面で使う、切り口の線と角度
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

  // 立ち絵(仮の影)と立ち絵をキャッシュする関数。monoCutin, character, charCutin で使う
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
    ctx.restore();
  }
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

  // けむりの地(暗い灰色のもや)。smoke と lasers で使う
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

  // 分割ファイルが使う内部の道具を1つの入れ物に置く
  Fx._pi = {
    U: U, clamp: clamp, lerp: lerp, smooth: smooth, ease: ease, rng: rng, hue: hue,
    P: P, FONT: FONT, TAU: TAU,
    once: once, offscreen: offscreen, envelope: envelope, rgba: rgba, f60: f60,
    invertAll: invertAll, sliceShift: sliceShift, star: star, crescent: crescent,
    cut: cut, crackAlong: crackAlong, poly: poly,
    figure: figure, charArt: charArt,
    smokeArt: smokeArt
  };
})(window.Fx);
