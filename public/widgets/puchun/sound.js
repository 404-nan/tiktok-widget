/* 演出の音。自作の合成音（se/*.wav、作り方は se/README 参照）を、プリセットの拍に合わせて鳴らす。
   音が出せない環境（音の仕組みが無い・読み込み失敗）では、映像だけが今までどおり流れる。 */
(function (Fx) {
  'use strict';
  var NAMES = ['charge', 'flash', 'slam', 'sparkle', 'out', 'whoosh'];
  var ctx = null, master = null, buffers = {}, loading = null;

  function ensure() {
    if (ctx) return ctx;
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try { ctx = new AC(); } catch (e) { return null; }
    master = ctx.createGain();
    master.connect(ctx.destination);
    loading = Promise.all(NAMES.map(function (name) {
      return fetch('se/' + name + '.wav')
        .then(function (r) { return r.arrayBuffer(); })
        .then(function (ab) { return ctx.decodeAudioData(ab); })
        .then(function (buf) { buffers[name] = buf; })
        .catch(function () {});
    }));
    return ctx;
  }

  /* cues: [{ t: 秒, name: '音の名前', gain: 0〜1 }]。opt: { volume: 0〜1, muted: bool }
     戻り値は、映像を始めるまでの待ち秒数（音の時計と映像の開始をそろえるため）。 */
  Fx.soundStart = function (cues, opt) {
    opt = opt || {};
    if (opt.muted || !cues || !cues.length) return 0;
    if (!ensure()) return 0;
    if (ctx.state === 'suspended') ctx.resume();
    master.gain.value = opt.volume == null ? 0.9 : Math.max(0, Math.min(1, opt.volume));
    var delay = 0.09, t0 = ctx.currentTime + delay;
    loading.then(function () {
      cues.forEach(function (cue) {
        var buf = buffers[cue.name];
        if (!buf) return;
        var src = ctx.createBufferSource();
        src.buffer = buf;
        var g = ctx.createGain();
        g.gain.value = cue.gain == null ? 1 : cue.gain;
        src.connect(g);
        g.connect(master);
        src.start(t0 + (cue.t || 0));
      });
    });
    return delay;
  };
})(window.Fx);
