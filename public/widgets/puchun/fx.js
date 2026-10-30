/* 演出の土台(タイムライン)。部品(parts.js)を「何秒目から・何秒間・どの強さで」の並びで裏の Canvas に描き、
   最後に WebGL2 の仕上げ(光のにじみ・色ずれ・ぶれ・粒・走査線・白飛び)をかけて画面に出す。WebGL2 がなければ仕上げなしで出す。
   同じ時刻なら毎回同じ絵になる(乱数は部品ごとの seed で決める)ので、1コマずつ撮って動画にもできる。ES5 で書く(配信ソフトの古いブラウザでも動くように) */
(function (root) {
  'use strict';

  // --- 小さな道具 ---
  function clamp(x, a, b) { return x < a ? a : x > b ? b : x; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, x) { var t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  var ease = {
    linear: function (t) { return t; },
    in: function (t) { return t * t * t; },
    out: function (t) { var u = 1 - t; return 1 - u * u * u; },
    inOut: function (t) { return t < .5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; },
    back: function (t) { var c = 1.7, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
  };
  // 決まった並びの乱数(seed が同じなら同じ数が出る)
  function rng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  // 虹の色(h は 0〜1)
  function hue(h, l, a) { return 'hsla(' + Math.round(((h % 1) + 1) % 1 * 360) + ',100%,' + (l || 60) + '%,' + (a == null ? 1 : a) + ')'; }

  // --- 仕上げ(WebGL2)。裏の Canvas を1枚の絵として受け取り、画面全体に効果をかける ---
  var VS = '#version 300 es\nout vec2 v;void main(){vec2 p=vec2(gl_VertexID==1?3.:-1.,gl_VertexID==2?3.:-1.);v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}';
  var FS = [
    '#version 300 es', 'precision highp float;',
    'uniform sampler2D T;uniform vec2 R;uniform float uT,uBloom,uCA,uGrain,uVig,uFlash,uScan,uThr,uZoom,uSwirl;uniform vec2 uBlur;',
    'in vec2 v;out vec4 o;',
    // 色ずれ: 赤と青を中心から外へ少しずらす
    'vec4 sc(vec2 uv){vec2 c=(uv-.5)*uCA*.012;vec4 g=texture(T,uv);float r=texture(T,uv+c).r;float b=texture(T,uv-c).b;return vec4(r,g.g,b,max(g.a,max(r,b)));}',
    'float h(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}',
    'void main(){',
    '  vec4 c;vec2 u=v;',
    // うず: まん中ほど強くねじる
    '  if(uSwirl!=0.){vec2 q=(u-.5)*vec2(R.x/R.y,1.);float r=length(q),a=uSwirl*pow(max(0.,1.-r/.9),2.);q=mat2(cos(a),-sin(a),sin(a),cos(a))*q;u=q/vec2(R.x/R.y,1.)+.5;}',
    // ぶれ: 決めた向き(blur)と、まん中から外へ(zoom)。9 回ずらして重ねる
    '  if(dot(uBlur,uBlur)>.25||uZoom>0.){c=vec4(0.);for(int i=0;i<9;i++){float k=float(i)/8.-.5;c+=sc(u+uBlur/R*k+(u-.5)*uZoom*k);}c/=9.;}else c=sc(u);',
    // 光のにじみ: 小さくした絵(mipmap)の明るいところだけを足す
    '  vec3 b=vec3(0.);vec2 px=1./R;',
    '  b+=max(textureLod(T,v,3.).rgb-uThr,0.)*.6;',
    '  b+=max(textureLod(T,v+px*vec2(24.,10.),4.5).rgb-uThr,0.)*.5+max(textureLod(T,v-px*vec2(20.,14.),4.5).rgb-uThr,0.)*.5;',
    '  b+=max(textureLod(T,v,6.).rgb-uThr*.8,0.)*1.1;',
    '  c.rgb+=b*uBloom;c.a=max(c.a,min(1.,dot(b,vec3(.4))*uBloom));',
    '  vec2 d=v-.5;c.rgb*=1.-uVig*dot(d,d)*1.6;',
    '  c.rgb*=1.-uScan*.45*step(.5,fract(gl_FragCoord.y*.25));',
    '  c.rgb+=(h(gl_FragCoord.xy+fract(uT*7.31)*917.)-.5)*uGrain*c.a;',
    '  c.rgb=mix(c.rgb,vec3(1.),uFlash);c.a=mix(c.a,1.,uFlash);',
    '  c.rgb=clamp(c.rgb,0.,1.);c.a=max(c.a,max(c.r,max(c.g,c.b)));o=c;}'
  ].join('\n');
  function initPost(canvas) {
    var gl = canvas.getContext('webgl2', { premultipliedAlpha: true, alpha: true, antialias: false, preserveDrawingBuffer: true });
    if (!gl) return null;
    function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; }
    var pr = gl.createProgram();
    gl.attachShader(pr, sh(gl.VERTEX_SHADER, VS)); gl.attachShader(pr, sh(gl.FRAGMENT_SHADER, FS)); gl.linkProgram(pr);
    if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
    gl.useProgram(pr);
    var tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    var u = {};
    ['T', 'R', 'uT', 'uBloom', 'uCA', 'uGrain', 'uVig', 'uFlash', 'uScan', 'uThr', 'uBlur', 'uZoom', 'uSwirl'].forEach(function (n) { u[n] = gl.getUniformLocation(pr, n); });
    gl.clearColor(0, 0, 0, 0);
    return { gl: gl, u: u };
  }

  // 仕上げのふだんの強さ。タイムラインの part: 'post' の行が、その間だけ足す
  var POST_BASE = { bloom: .55, ca: .35, grain: .07, vig: .12, flash: 0, scan: 0, blur: 0, angle: 0, thr: .62, zoom: 0, swirl: 0 };

  /**
   * timeline: [{ t: 始まる秒, part: '部品の名前', dur: 秒数, ...部品ごとの値 }](t の代わりに at でもよい)
   * 並びの順に重ねて描く(あとの行ほど上)。'shake' は画面のゆれ、'post' は仕上げの強さ(描く前にまとめて効く)
   */
  function Fx(canvas, timeline, opts) {
    this.opts = opts || {};
    this.out = canvas;
    this.post = null;
    if (this.opts.post !== false) { try { this.post = initPost(canvas); } catch (e) { this.post = null; if (root.console) console.warn('post off:', e.message); } }
    // 仕上げがあるときは裏の Canvas に描き、ないときは見えている Canvas にそのまま描く
    this.canvas = this.post ? document.createElement('canvas') : canvas;
    this.canvas.width = canvas.width; this.canvas.height = canvas.height;
    this.ctx = this.canvas.getContext('2d');
    this.timeline = timeline;
    this.cache = {};
    this.length = 0;
    for (var i = 0; i < timeline.length; i++) if (timeline[i].at == null) timeline[i].at = timeline[i].t || 0;
    for (i = 0; i < timeline.length; i++) this.length = Math.max(this.length, timeline[i].at + timeline[i].dur);
  }

  Fx.parts = {};
  Fx.util = { clamp: clamp, lerp: lerp, smooth: smooth, ease: ease, rng: rng, hue: hue };

  Fx.prototype.env = function (time) {
    var W = this.canvas.width, H = this.canvas.height;
    return { W: W, H: H, S: Math.min(W, H) / 1080, portrait: W / H < 1.4 /* 1:1 や 4:3 も縦の並び。横の並びは 16:9 向け */, time: time, cache: this.cache, opts: this.opts, fx: this };
  };

  /** time 秒の絵を描く */
  Fx.prototype.render = function (time) {
    var ctx = this.ctx, env = this.env(time), tl = this.timeline, i, c, local, k;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.clearRect(0, 0, env.W, env.H);
    var sx = 0, sy = 0, rot = 0, post = {}, reduced = this.opts.reduced;
    for (k in POST_BASE) post[k] = POST_BASE[k];
    for (i = 0; i < tl.length; i++) {
      c = tl[i];
      if (time < c.at || time >= c.at + c.dur) continue;
      local = (time - c.at) / c.dur;
      // 画面のゆれ(動きを減らす設定のときは付けない)。ゆれた分だけ、その向きにぶれも付ける
      if (c.part === 'shake' && !reduced) {
        var amp = (c.power || 1) * 24 * env.S * (1 - local), r = rng((c.seed || 1) + Math.floor(time * 60));
        sx += (r() * 2 - 1) * amp; sy += (r() * 2 - 1) * amp; rot += (r() * 2 - 1) * .012 * (c.power || 1) * (1 - local);
      }
      // 仕上げの強さ: decay: true ならはじめが強く、だんだん弱まる
      if (c.part === 'post') {
        var w = c.decay ? 1 - local : 1;
        for (k in POST_BASE) if (c[k] != null && k !== 'angle') post[k] += c[k] * w;
        if (c.angle != null) post.angle = c.angle;
      }
    }
    if (reduced) { post.blur = 0; post.zoom = 0; post.swirl = 0; post.flash = Math.min(post.flash, .3); post.ca = POST_BASE.ca; }
    var shakeBlur = Math.sqrt(sx * sx + sy * sy);
    for (i = 0; i < tl.length; i++) {
      c = tl[i];
      if (c.part === 'shake' || c.part === 'post' || time < c.at || time >= c.at + c.dur) continue;
      var part = Fx.parts[c.part];
      if (!part) continue;
      local = clamp((time - c.at) / c.dur, 0, 1);
      ctx.save();
      ctx.translate(env.W / 2 + sx, env.H / 2 + sy); ctx.rotate(rot); ctx.translate(-env.W / 2, -env.H / 2);
      part(ctx, local, c, env);
      ctx.restore();
    }
    if (this.post && !this.warming) this.finish(env, post, shakeBlur, sx, sy);
  };

  /** 仕上げ: 裏の絵を WebGL に渡して効果をかける */
  Fx.prototype.finish = function (env, p, shakeBlur, sx, sy) {
    var P = this.post, gl = P.gl, u = P.u, W = env.W, H = env.H;
    if (this.out.width !== W || this.out.height !== H) { this.out.width = W; this.out.height = H; }
    gl.viewport(0, 0, W, H);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas);
    gl.generateMipmap(gl.TEXTURE_2D);
    var a = p.angle * Math.PI / 180, bl = p.blur * env.S, bx = Math.cos(a) * bl, by = Math.sin(a) * bl;
    if (shakeBlur > 0) { bx += sx * .5; by += sy * .5; }
    gl.uniform1i(u.T, 0); gl.uniform2f(u.R, W, H); gl.uniform1f(u.uT, env.time);
    gl.uniform1f(u.uBloom, p.bloom); gl.uniform1f(u.uCA, p.ca); gl.uniform1f(u.uGrain, p.grain); gl.uniform1f(u.uVig, p.vig);
    gl.uniform1f(u.uFlash, clamp(p.flash, 0, 1)); gl.uniform1f(u.uScan, p.scan); gl.uniform1f(u.uThr, p.thr); gl.uniform2f(u.uBlur, bx, by); gl.uniform1f(u.uZoom, p.zoom); gl.uniform1f(u.uSwirl, p.swirl);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  /** 重い下ごしらえ(字の立体など)を先に済ませる。流す前に1回呼ぶと、途中で止まらない */
  Fx.prototype.warm = function () {
    this.warming = true;
    for (var i = 0; i < this.timeline.length; i++) { var c = this.timeline[i]; this.render(c.at + c.dur * .5); }
    this.warming = false;
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    if (this.post) this.post.gl.clear(this.post.gl.COLOR_BUFFER_BIT);
  };

  /** 仕上げをやめて、2D の絵をそのまま出す(遅いパソコン用) */
  Fx.prototype.dropPost = function () {
    if (!this.post) return;
    var out = this.out, c = this.canvas;
    c.id = out.id; c.className = out.className; c.style.cssText = out.style.cssText;
    if (out.parentNode) out.parentNode.replaceChild(c, out);
    this.out = c; this.post = null;
  };

  /** 頭から最後まで流す。終わったら onEnd。仕上げこみで 25fps を切るようなら、仕上げを外して続ける */
  Fx.prototype.play = function (onEnd) {
    var self = this, start = null, last = null, gaps = [];
    self.stats = [];
    function frame(now) {
      if (start === null) start = now;
      if (last !== null && self.post && gaps.length < 20) {
        gaps.push(now - last);
        if (gaps.length === 20 && gaps.slice().sort(function (a, b) { return a - b; })[10] > 40) self.dropPost();
      }
      last = now;
      var t = (now - start) / 1000;
      var t0 = performance.now();
      self.render(Math.min(t, self.length - 1e-4));
      self.stats.push(performance.now() - t0);
      if (t < self.length) requestAnimationFrame(frame);
      else {
        self.ctx.clearRect(0, 0, self.canvas.width, self.canvas.height);
        if (self.post) self.post.gl.clear(self.post.gl.COLOR_BUFFER_BIT);
        if (onEnd) onEnd();
      }
    }
    requestAnimationFrame(frame);
  };

  root.Fx = Fx;
})(window);
