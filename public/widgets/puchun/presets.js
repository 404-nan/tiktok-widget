/* 演出の一覧(プリセット)。どれも parts.js の部品を「何秒目に何を出すか」で並べたもの。
   puchun.html?preset=名前 で選ぶ。fields は画面に出る字(?キー=字 で変えられる。カンマで行を分ける)。size は合うギフトの大きさ */
(function (Fx) {
  'use strict';
  function L(v) { return String(v).split(','); }

  Fx.presets = {
    // 小さいギフト: 画面を暗くしない短い予告。配信の画面の上に、帯と赤い字だけが出る
    chance: {
      label: 'チャンス予告', size: '小', about: '画面をふさがない短い予告。1.6秒',
      fields: [{ key: 'main', label: '大きい字', def: 'チャンス!' }, { key: 'sub', label: '帯の字', def: 'ギフトありがとう!' }],
      timeline: function (T) {
        return [
          { t: 0,    part: 'post',        dur: 0.1,  flash: .3, decay: true },
          { t: 0,    part: 'telop',       dur: 1.6,  text: T.sub, y: .66, color: 'red' },
          { t: 0.06, part: 'rainbowText', dur: 1.54, lines: L(T.main), palette: 'red', scale: .62, y: .46 },
          { t: 0.06, part: 'post',        dur: 0.1,  zoom: .1, ca: 2, decay: true },
          { t: 0.13, part: 'shake',       dur: 0.25, power: .6 },
          { t: 1.3,  part: 'fadeOut',     dur: 0.3 }
        ];
      }
    },
    // 中くらいのギフト: 斜めの帯で立ち絵が飛びこみ、セリフ → 金の字の叩きつけ
    cutin: {
      label: 'キャラのカットイン', size: '中', about: '立ち絵が飛びこんでセリフ、赤と金の字で決める。2.9秒',
      fields: [{ key: 'say', label: 'セリフ', def: 'いくぞ!', max: 14 }, { key: 'main', label: '決めの字', def: '激アツ' }],
      timeline: function (T) {
        return [
          { t: 0,    part: 'fill',        dur: 2.9,  color: '#000', alpha: .65, in: .04, out: .08 },
          { t: 0,    part: 'arc',         dur: 0.14, x: .1, y: 1.5, r: .85, from: -100, to: -30, width: 150 },
          { t: 0,    part: 'post',        dur: 0.12, blur: 40, angle: -10 },
          { t: 0.08, part: 'charCutin',   dur: 1.45, text: T.say, color: 'blue' },
          { t: 0.08, part: 'shake',       dur: 0.25, power: .9 },
          { t: 0.08, part: 'post',        dur: 0.2,  ca: 2.5, decay: true },
          { t: 1.53, part: 'invert',      dur: 0.034 },
          { t: 1.56, part: 'burst',       dur: 1.34, y: .45 },
          { t: 1.56, part: 'rainbowText', dur: 1.34, lines: L(T.main), palette: 'red' },
          { t: 1.56, part: 'post',        dur: 0.14, flash: .5, zoom: .15, decay: true },
          { t: 1.62, part: 'shake',       dur: 0.35, power: 1.3 },
          { t: 2.55, part: 'fadeOut',     dur: 0.35 }
        ];
      }
    },
    // 大きいギフト: 暗転 → 斬撃 → 図柄が回ってリーチ → そろってガラスが割れ、大当たり
    jackpot: {
      label: '大当たり', size: '大', about: '図柄がそろって大当たり。図柄の字も変えられる。5.4秒',
      fields: [{ key: 'num', label: 'そろう図柄', def: '777', max: 5 }, { key: 'main', label: '決めの字', def: '大当たり' }, { key: 'sub', label: '帯の字', def: 'ギフトありがとう!' }],
      timeline: function (T) {
        return [
          { t: 0,    part: 'fill',        dur: 0.4,  color: '#000', in: .4 },
          { t: 0.4,  part: 'embers',      dur: 0.3 },
          { t: 0.55, part: 'slash',       dur: 0.2 },
          { t: 0.55, part: 'post',        dur: 0.07, blur: 60, angle: 80, bloom: .6 },
          { t: 0.62, part: 'shake',       dur: 0.3,  power: 1.2 },
          { t: 0.75, part: 'glitch',      dur: 0.2,  negFrames: [2] },
          { t: 0.95, part: 'reels',       dur: 1.9,  text: T.num },
          { t: 0.95, part: 'post',        dur: 1.9,  scan: .2, ca: .6 },
          { t: 2.6,  part: 'post',        dur: 0.25, flash: .5, decay: true },
          { t: 2.6,  part: 'shake',       dur: 0.25, power: 1 },
          { t: 2.85, part: 'hole',        dur: 0.3,  negFrames: [3, 4] },
          { t: 2.85, part: 'post',        dur: 0.3,  ca: 2, swirl: 5, zoom: .12, decay: true },
          { t: 3.15, part: 'burst',       dur: 0.3 },
          { t: 3.15, part: 'rainbowText', dur: 0.3,  lines: L(T.main) },
          { t: 3.15, part: 'post',        dur: 0.12, flash: .4, zoom: .15, decay: true },
          { t: 3.2,  part: 'shake',       dur: 0.3,  power: 1.5 },
          { t: 3.45, part: 'rays',        dur: 1.95 },
          { t: 3.45, part: 'character',   dur: 1.95, x: .72 },
          { t: 3.45, part: 'rainbowText', dur: 1.95, lines: L(T.main), layout: 'side' },
          { t: 3.6,  part: 'telop',       dur: 1.8,  text: T.sub, y: .9, color: 'gold' },
          { t: 3.45, part: 'post',        dur: 0.2,  flash: .6, bloom: .4, zoom: .15, decay: true },
          { t: 3.45, part: 'post',        dur: 1.95, thr: .25, ca: .3 },
          { t: 5.0,  part: 'fadeOut',     dur: 0.4 }
        ];
      }
    },
    // いちばん大きいギフト: 元の動画(ref/reference.mp4)を部品で組み直したもの。時刻は元の動画に合わせた
    puchun: {
      label: 'プチュン', size: '特大', about: '暗転・斬撃・虹の字の大当たり。6.8秒',
      fields: [{ key: 'main', label: '決めの字', def: 'ナイス,ギフト' }],
      timeline: function (T) {
        var lines = L(T.main);
        return [
          // 0.0〜0.6 プチュン: 赤い光。頭はネガとシアンの打ち分け、最後は光が縮んでまん中から黒が広がる
          { t: 0,    part: 'puchun',      dur: 0.62 },
          { t: 0,    part: 'post',        dur: 0.2,  bloom: .9, ca: 1.5, decay: true },
          { t: 0.62, part: 'embers',      dur: 0.71 },
          // 1.3〜1.53 斬撃: 白い刃の軌跡 → シアン → 火の線 → 白地のひび → 火花(1コマずつ)
          { t: 1.33, part: 'slash',       dur: 0.2 },
          { t: 1.33, part: 'post',        dur: 0.07, blur: 60, angle: 80, bloom: .6 },
          { t: 1.4,  part: 'post',        dur: 0.13, ca: 3, decay: true },
          { t: 1.4,  part: 'shake',       dur: 0.3,  power: 1.4 },
          // 1.53〜1.9 切られた画面が斜めにずれて壊れる
          { t: 1.53, part: 'glitch',      dur: 0.37, negFrames: [2, 3] },
          { t: 1.53, part: 'post',        dur: 0.37, ca: 1.2, scan: .4 },
          // 1.9〜2.27 白い墨 → 白黒反転 → 黒白のかけら
          { t: 1.9,  part: 'glitch',      dur: 0.37 },
          { t: 1.9,  part: 'ink',         dur: 0.37, color: '#fff', seed: 22, size: .26, x: .4, y: .45 },
          { t: 1.93, part: 'invert',      dur: 0.07 },
          { t: 1.9,  part: 'shake',       dur: 0.2,  power: .8 },
          // 2.27〜2.9 白黒のカットイン → 反転1コマ → シアンの白飛び
          { t: 2.2,  part: 'monoCutin',   dur: 0.7,  accent: '#3FC8FF' },
          { t: 2.2,  part: 'post',        dur: 0.7,  ca: 1.2, scan: .25 },
          { t: 2.6,  part: 'invert',      dur: 0.034 },
          { t: 2.72, part: 'blowout',     dur: 0.18 },
          { t: 2.72, part: 'post',        dur: 0.18, blur: 40, angle: 0 },
          // 2.9〜3.55 レーザー。3.03 に白い三日月の斬撃が横切る。終わりは白く光る
          { t: 2.9,  part: 'lasers',      dur: 0.95, count: 26 },
          { t: 2.9,  part: 'post',        dur: 0.65, bloom: .15, ca: .8 },
          { t: 3.02, part: 'arc',         dur: 0.16, x: .1, y: 1.6, r: .9, from: -100, to: -30, width: 150 },
          { t: 3.02, part: 'post',        dur: 0.16, blur: 30, angle: 20 },
          { t: 3.45, part: 'post',        dur: 0.1,  scan: .8 },
          // 3.55〜3.85 ガラスが割れて黒い穴
          { t: 3.55, part: 'hole',        dur: 0.3,  negFrames: [3, 4, 9, 10] },
          { t: 3.55, part: 'shake',       dur: 0.3,  power: 1.2 },
          { t: 3.55, part: 'post',        dur: 0.3,  ca: 2, swirl: 5, zoom: .12, decay: true },
          // 3.85〜4.05 決めの字を叩きつける
          { t: 3.85, part: 'burst',       dur: 0.27 },
          { t: 3.85, part: 'rainbowText', dur: 0.27, lines: lines },
          { t: 3.85, part: 'post',        dur: 0.12, flash: .4, zoom: .15, decay: true },
          { t: 3.88, part: 'invert',      dur: 0.034, mono: false },
          { t: 3.93, part: 'shake',       dur: 0.35, power: 1.5 },
          // 4.05〜4.42 青白い斬撃 → 速さの線 → 反転 → けむりの上に字
          { t: 4.05, part: 'arc',         dur: 0.1,  x: .3, y: 1.5, r: .85, from: -95, to: -20, width: 170 },
          { t: 4.12, part: 'speedLines',  dur: 0.07, angle: -25 },
          { t: 4.12, part: 'post',        dur: 0.07, blur: 50, angle: -25 },
          { t: 4.19, part: 'smoke',       dur: 0.23 },
          { t: 4.19, part: 'rainbowText', dur: 0.23, lines: lines, layout: 'mid' },
          { t: 4.19, part: 'invert',      dur: 0.05 },
          { t: 4.24, part: 'arc',         dur: 0.16, x: .75, y: 1.3, r: .7, from: -150, to: -60, width: 70 },
          // 4.42〜 決め: 虹の速さの線・立ち絵・字
          { t: 4.42, part: 'rays',        dur: 2.38 },
          { t: 4.42, part: 'character',   dur: 2.38, x: .72 },
          { t: 4.42, part: 'rainbowText', dur: 2.38, lines: lines, layout: 'side' },
          { t: 4.42, part: 'post',        dur: 0.2,  flash: .6, bloom: .4, zoom: .15, decay: true },
          { t: 4.42, part: 'post',        dur: 2.38, thr: .25, ca: .3 },
          { t: 6.4,  part: 'fadeOut',     dur: 0.4 }
        ];
      }
    }
  };

  // 動きを減らす設定: 光の点滅・ゆれ・砕けを抜いて、決めの字だけをやわらかく出す(どの演出も同じ)
  Fx.reducedTimeline = function (T) {
    return [
      { t: 0,   part: 'fill',        dur: 0.6, color: '#000', in: .5 },
      { t: 0.6, part: 'rays',        dur: 3 },
      { t: 0.6, part: 'character',   dur: 3, x: .72 },
      { t: 0.6, part: 'rainbowText', dur: 3, lines: L(T.main), layout: 'side' },
      { t: 0.6, part: 'fill',        dur: 0.5, color: '#000', out: 1 },
      { t: 3.2, part: 'fadeOut',     dur: 0.4 }
    ];
  };
})(window.Fx);
