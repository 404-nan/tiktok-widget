/* 文字と立ち絵の部品: rainbowText(虹と金の立体の字)、rays(虹の速さの線)、character(決めの立ち絵)、telop(テロップ)、charCutin(キャラのカットイン)、reels(図柄がそろう)、fadeOut(消えて透明に)。
   共通の道具は Fx._pi から取る。 */
(function (Fx) {
  'use strict';
  var _ = Fx._pi, P = _.P, rng = _.rng, lerp = _.lerp, smooth = _.smooth, ease = _.ease, clamp = _.clamp, hue = _.hue;
  var TAU = _.TAU, FONT = _.FONT, once = _.once, offscreen = _.offscreen, rgba = _.rgba, f60 = _.f60;
  var star = _.star, charArt = _.charArt;

  /* ---------- 決めの字: 何枚も重ねた厚み・金属の金のふち・虹の面・光の筋・つや・外の光 ---------- */
  // 字の面の色。palette: 'rainbow'(虹)/ 'red'(赤)/ 'gold'(金)/ 'blue'(青)。パチンコの予告の色の段階(青 < 赤 < 金 < 虹)
  var BRUSH_FONT = '"Yuji Syuku", "Reggae One"'; // 決め字の筆書体（大きい演出だけ）
  var PAL = { red: ['#ffd9c8', '#ff3b2a', '#c4000e', '#ff7a50', '#8a0010'], gold: ['#fffbe0', '#ffd23a', '#d08a00', '#fff0a8', '#b86a00'], blue: ['#e0f6ff', '#2ab4ff', '#0050d0', '#7ad8ff', '#0a2a90'] };
  function rainbowFace(w, h, seed, palette) {
    var c = offscreen(w, h), g = c.getContext('2d'), r = rng(seed), i, pal = PAL[palette];
    if (palette === 'ink') {
      // 墨: 上が少し明るい黒→深い黒。縦の筆の筋を薄く入れる（虹色は使わない。本人の検品で禁止）
      var ig = g.createLinearGradient(0, 0, 0, h);
      ig.addColorStop(0, '#5b6579'); ig.addColorStop(.45, '#272d3a'); ig.addColorStop(1, '#0a0d13');
      g.fillStyle = ig; g.fillRect(0, 0, w, h);
      var tl = g.createLinearGradient(0, 0, 0, h * .5);
      tl.addColorStop(0, 'rgba(255,255,255,.20)'); tl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = tl; g.fillRect(0, 0, w, h * .5);
      for (i = 0; i < 90; i++) {
        var ix = r() * w, iw = (.004 + r() * .014) * w, il = (.2 + r() * .6) * h, iy = r() * h * .5;
        g.fillStyle = 'rgba(255,255,255,' + (.04 + r() * .08) + ')'; g.fillRect(ix, iy, iw, il);
      }
      for (i = 0; i < 50; i++) {
        var jx = r() * w, jw = (.003 + r() * .01) * w, jl = (.15 + r() * .5) * h, jy = r() * h * .6;
        g.fillStyle = 'rgba(0,0,0,' + (.06 + r() * .1) + ')'; g.fillRect(jx, jy, jw, jl);
      }
      return c;
    }
    if (palette === 'bronze') {
      // 古金: 濃い茶金の下地に金の筋。ふちの明るい金と分けて読ませる
      var bg2 = g.createLinearGradient(0, 0, 0, h);
      bg2.addColorStop(0, '#a8741c'); bg2.addColorStop(.5, '#6e4305'); bg2.addColorStop(1, '#33200a');
      g.fillStyle = bg2; g.fillRect(0, 0, w, h);
      for (i = 0; i < 70; i++) {
        var bx = r() * w, bw = (.004 + r() * .012) * w, bl = (.2 + r() * .55) * h, by = r() * h * .55;
        g.fillStyle = 'rgba(255,215,110,' + (.05 + r() * .09) + ')'; g.fillRect(bx, by, bw, bl);
      }
      var tl2 = g.createLinearGradient(0, 0, 0, h * .45);
      tl2.addColorStop(0, 'rgba(255,240,200,.22)'); tl2.addColorStop(1, 'rgba(255,240,200,0)');
      g.fillStyle = tl2; g.fillRect(0, 0, w, h * .45);
      return c;
    }
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
  function textArt(env, lines, size, palette, brush) {
    return once(env, 'art' + lines.join('|') + Math.round(size) + (palette || '') + (brush ? '|brush' : ''), function () {
      var FONT_USE = brush ? BRUSH_FONT : FONT;
      var g0 = offscreen(4, 4).getContext('2d'), i, j;
      g0.font = size + 'px ' + FONT_USE;
      var maxw = 0; for (j = 0; j < lines.length; j++) maxw = Math.max(maxw, g0.measureText(lines[j]).width);
      var pad = size * .42, lh = size * 1.02, w = maxw + pad * 2, h = lines.length * lh + pad * 2;
      // 筆のときは線を細くし、字そのものの輪郭（払い・止め）を残す
      var thick = size * (brush ? .04 : .085), rimW = size * (brush ? .07 : .11), depth = Math.round(size * .1);
      function shape(g, extra, dx, dy) {
        g.font = size + 'px ' + FONT_USE; g.textAlign = 'center'; g.textBaseline = 'top'; g.lineJoin = 'round'; g.lineWidth = thick + extra;
        for (var k = 0; k < lines.length; k++) { var y = pad + k * lh + (dy || 0); g.fillText(lines[k], w / 2 + (dx || 0), y); g.strokeText(lines[k], w / 2 + (dx || 0), y); }
      }
      var mask = offscreen(w, h), mg = mask.getContext('2d'); mg.fillStyle = mg.strokeStyle = '#fff'; shape(mg, 0);
      var drips = [];
      if (brush) {
        // 筆の質感: 下端からインクの垂れを1〜2本、面には掠れの欠け（縁で輪郭が欠ける）
        var br = rng(131), di, ei;
        for (di = 0; di < 2; di++) {
          if (di === 1 && br() < 0.4) break;
          drips.push({ x: w * (0.3 + br() * 0.4), dw: size * (0.012 + br() * 0.008), dl: size * (0.10 + br() * 0.08), y0: pad + lines.length * lh - size * 0.30 });
        }
        mg.globalCompositeOperation = 'destination-out';
        for (ei = 0; ei < 300; ei++) {
          var ex = br() * w, ey = br() * h, er = size * (0.005 + br() * br() * 0.02);
          mg.globalAlpha = 0.35 + br() * 0.65;
          mg.beginPath(); mg.ellipse(ex, ey, er * (1 + br() * 2), er, br() * 3.2, 0, 6.3); mg.fill();
        }
        mg.globalAlpha = 1; mg.globalCompositeOperation = 'source-over';
      }
      function drawDrips(g) {
        for (var di2 = 0; di2 < drips.length; di2++) {
          var D = drips[di2];
          g.beginPath(); g.moveTo(D.x - D.dw, D.y0); g.lineTo(D.x + D.dw, D.y0); g.lineTo(D.x + D.dw * 0.25, D.y0 + D.dl); g.lineTo(D.x - D.dw * 0.25, D.y0 + D.dl); g.closePath(); g.fill();
        }
      }
      drawDrips(mg);
      var rim = offscreen(w, h), rg = rim.getContext('2d'); rg.fillStyle = rg.strokeStyle = '#fff'; shape(rg, rimW * 2); drawDrips(rg);
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
  function fitSize(lines, size, maxW, maxH, font) {
    var g = once({ cache: fitSize }, 'g', function () { return offscreen(4, 4).getContext('2d'); }), w = 0;
    g.font = '100px ' + (font || FONT);
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
    L.size = fitSize(lines, L.size * k, L.w * .96, L.h * .96, p.brush ? BRUSH_FONT : null); L.lines = lines;
    return L;
  }
  /* 虹と金の立体の大きな字。lines、layout: 'slam'(大きく叩きつけ)/ 'mid'(まん中に小さく)/ 'side'(左に置いて決め)、palette(面の色)、scale、y */
  P.rainbowText = function (ctx, t, p, env) {
    var L = textLayout(p, env), art = textArt(env, L.lines, L.size, p.palette, p.brush), s = t * p.dur, S = env.S;
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

  /* 決めの背景: 白い地に、まん中から金と白の速さの線が広がる。x, y は光の位置 */
  var RAYC = ['#ffd23a', '#ffb300', '#ffe98a', '#fff6cf', '#ffffff'];
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
      ctx.strokeStyle = RAYC[Math.floor(hh * RAYC.length)]; ctx.globalAlpha = .5 + r() * .5; ctx.lineWidth = (3 + r() * r() * 30) * S;
      ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * a0, cy + Math.sin(a) * a0); ctx.lineTo(cx + Math.cos(a) * a1, cy + Math.sin(a) * a1); ctx.stroke();
    }
    ctx.globalAlpha = 1;
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
    var glow = 1 - smooth(.3, .75, s); // 金の光の走査（虹色は使わない）
    if (glow > 0) {
      var tmp = once(env, 'chartmp' + Math.round(h), function () { return offscreen(art.width, art.height); }), g = tmp.getContext('2d');
      g.globalCompositeOperation = 'copy'; g.drawImage(art, 0, 0); g.globalCompositeOperation = 'source-atop';
      var lg = g.createLinearGradient(0, 0, art.width, art.height);
      var GOLDSCAN = ['#8a5a00', '#ffd23a', '#fff6cf', '#ffd23a', '#8a5a00'];
      for (var i = 0; i <= 4; i++) lg.addColorStop(i / 4, GOLDSCAN[i]);
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
