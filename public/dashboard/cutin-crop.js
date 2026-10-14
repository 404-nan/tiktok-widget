/* 画像カットインのスタイル選択と切り抜き。保存するのは x, y, scale だけ。 */
(function (global) {
  var PLAIN = { id: 'plain', angle: 45, stripe: 0, border: 12, ink: '#111113', paper: '#111113', mark: 8 };

  function round3(n) {
    if (global.CutinStyle) return global.CutinStyle.round3(n);
    return Math.round(n * 1000) / 1000;
  }

  function choices(opts) {
    var row = document.createElement('div');
    var i;
    row.className = 'cutin-choice-row';
    for (i = 0; i < opts.choices.length; i++) {
      (function (choice) {
        var button = document.createElement('button');
        button.type = 'button';
        button.className = 'cutin-choice pressable';
        button.textContent = choice.label;
        button.setAttribute('aria-pressed', opts.value === choice.id ? 'true' : 'false');
        button.addEventListener('click', function () {
          var buttons = row.querySelectorAll('button');
          var n;
          for (n = 0; n < buttons.length; n++) buttons[n].setAttribute('aria-pressed', buttons[n] === button ? 'true' : 'false');
          opts.onChange(choice.id);
        });
        row.appendChild(button);
      })(opts.choices[i]);
    }
    return row;
  }

  function crop(opts) {
    var api = global.CutinStyle;
    var state = {
      x: opts.value && isFinite(Number(opts.value.x)) ? Number(opts.value.x) : 0.5,
      y: opts.value && isFinite(Number(opts.value.y)) ? Number(opts.value.y) : 0.5,
      scale: opts.value && isFinite(Number(opts.value.scale)) ? Number(opts.value.scale) : 1
    };
    var styleId = opts.style || '';
    var natW = 0;
    var natH = 0;
    var pointers = {};
    var pinch = null;
    var drag = null;
    var timer = null;
    var root = document.createElement('div');
    var shell = document.createElement('div');
    var top = document.createElement('div');
    var view = document.createElement('div');
    var bottom = document.createElement('div');
    var empty = document.createElement('div');
    var img = document.createElement('img');
    var scaleRow = document.createElement('div');
    var scaleLabel = document.createElement('span');
    var slider = document.createElement('input');
    var scaleNum = document.createElement('span');
    var reset = document.createElement('button');

    root.className = 'cutin-crop';
    shell.className = 'cutin-shell';
    top.className = 'cutin-hatch';
    bottom.className = 'cutin-hatch';
    view.className = 'cutin-viewport';
    view.setAttribute('aria-label', '切り抜き');
    empty.className = 'cutin-empty';
    empty.textContent = '写真を選ぶと、ここで切り抜きます';
    img.className = 'cutin-crop-img';
    img.alt = '';
    img.draggable = false;
    scaleRow.className = 'cutin-scale-row';
    scaleLabel.textContent = '拡大';
    slider.type = 'range';
    slider.min = '1';
    slider.max = '4';
    slider.step = '0.01';
    slider.value = String(state.scale);
    slider.setAttribute('aria-label', '拡大');
    scaleNum.className = 'cutin-scale-num';
    reset.type = 'button';
    reset.className = 'cutin-choice pressable';
    reset.textContent = '中央に戻す';

    view.appendChild(empty);
    view.appendChild(img);
    shell.appendChild(top);
    shell.appendChild(view);
    shell.appendChild(bottom);
    scaleRow.appendChild(scaleLabel);
    scaleRow.appendChild(slider);
    scaleRow.appendChild(scaleNum);
    root.appendChild(shell);
    root.appendChild(scaleRow);
    root.appendChild(reset);

    function spec() {
      if (api && api.isHatch(styleId)) return api.styleById(styleId);
      return PLAIN;
    }

    function viewSize() {
      var current = spec();
      var metrics;
      if (!shell.clientWidth || !shell.clientHeight) return { w: 240, h: 240 / (api ? api.BAND_ASPECT : 2.4) };
      metrics = api.frameMetrics(shell.clientWidth, shell.clientHeight, current);
      return { w: metrics.bandW, h: metrics.bandH };
    }

    function paintChrome() {
      var current = spec();
      var bg = api ? api.hatchBackground(current) : 'none';
      var metrics;
      shell.style.background = current.ink;
      shell.style.padding = current.border + 'px';
      top.style.backgroundColor = current.ink;
      bottom.style.backgroundColor = current.ink;
      top.style.backgroundImage = bg;
      bottom.style.backgroundImage = bg;
      top.style.display = '';
      bottom.style.display = '';
      if (!api || !shell.clientWidth || !shell.clientHeight) return;
      metrics = api.frameMetrics(shell.clientWidth, shell.clientHeight, current);
      view.style.flex = '0 0 ' + metrics.bandH + 'px';
      view.style.height = metrics.bandH + 'px';
    }

    function snapshot() {
      return { x: round3(state.x), y: round3(state.y), scale: round3(state.scale) };
    }

    function commit(now) {
      clearTimeout(timer);
      if (now) {
        opts.onChange(snapshot());
        return;
      }
      timer = setTimeout(function () { opts.onChange(snapshot()); }, 200);
    }

    function place() {
      var size = viewSize();
      var laid;
      var nw = natW || size.w;
      var nh = natH || size.h;
      if (!api) return;
      laid = api.layoutImage(nw, nh, size.w, size.h, state);
      state.x = laid.x;
      state.y = laid.y;
      state.scale = laid.scale;
      img.style.width = laid.width + 'px';
      img.style.height = laid.height + 'px';
      img.style.left = laid.left + 'px';
      img.style.top = laid.top + 'px';
      slider.value = String(laid.scale);
      scaleNum.textContent = laid.scale.toFixed(2);
    }

    function localPoint(clientX, clientY) {
      var rect = view.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function imagePoint(local) {
      var size = viewSize();
      var laid = api.layoutImage(natW || size.w, natH || size.h, size.w, size.h, state);
      return {
        x: (local.x - laid.left) / laid.width,
        y: (local.y - laid.top) / laid.height,
        laid: laid,
        size: size
      };
    }

    function applyZoom(localX, localY, imgX, imgY, nextScale) {
      var size = viewSize();
      var next = api.zoomKeepPoint(natW || size.w, natH || size.h, size.w, size.h, localX, localY, imgX, imgY, nextScale);
      state.x = next.x;
      state.y = next.y;
      state.scale = next.scale;
      place();
    }

    function pointList() {
      var list = [];
      var id;
      for (id in pointers) if (Object.prototype.hasOwnProperty.call(pointers, id)) list.push(pointers[id]);
      return list;
    }

    function setImage(url) {
      if (!url) {
        img.removeAttribute('src');
        img.style.display = 'none';
        empty.style.display = '';
        natW = 0;
        natH = 0;
        return;
      }
      img.style.display = '';
      empty.style.display = 'none';
      img.src = url;
    }

    function onPhoto(ev) {
      if (!root.isConnected) {
        document.removeEventListener('tw-cutin-photo', onPhoto);
        return;
      }
      setImage(opts.resolve ? opts.resolve(ev.detail || '') : (ev.detail || ''));
    }

    function onStyle(ev) {
      if (!root.isConnected) {
        document.removeEventListener('tw-cutin-style', onStyle);
        return;
      }
      styleId = ev.detail || '';
      paintChrome();
      place();
    }

    img.addEventListener('load', function () {
      natW = img.naturalWidth;
      natH = img.naturalHeight;
      place();
    });
    img.addEventListener('dragstart', function (ev) { ev.preventDefault(); });

    view.addEventListener('pointerdown', function (ev) {
      var pts;
      pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      if (view.setPointerCapture) {
        try { view.setPointerCapture(ev.pointerId); } catch (err) { /* ポインタがもう無いときは、移動の計算だけ続ける */ }
      }
      pts = pointList();
      if (pts.length >= 2) {
        var midX = (pts[0].x + pts[1].x) / 2;
        var midY = (pts[0].y + pts[1].y) / 2;
        var start = localPoint(midX, midY);
        var hit = imagePoint(start);
        pinch = {
          dist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y),
          scale: state.scale,
          imgX: hit.x,
          imgY: hit.y
        };
        drag = null;
      } else {
        drag = { x: ev.clientX, y: ev.clientY };
        pinch = null;
      }
    });

    view.addEventListener('pointermove', function (ev) {
      var prev;
      var pts;
      var dist;
      var mid;
      var local;
      var size;
      var laid;
      var dx;
      var dy;
      if (!pointers[ev.pointerId]) return;
      prev = pointers[ev.pointerId];
      pointers[ev.pointerId] = { x: ev.clientX, y: ev.clientY };
      pts = pointList();
      if (pts.length >= 2 && pinch && pinch.dist) {
        dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
        mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
        local = localPoint(mid.x, mid.y);
        applyZoom(local.x, local.y, pinch.imgX, pinch.imgY, pinch.scale * (dist / pinch.dist));
        return;
      }
      if (!drag) return;
      dx = ev.clientX - prev.x;
      dy = ev.clientY - prev.y;
      size = viewSize();
      laid = api.layoutImage(natW || size.w, natH || size.h, size.w, size.h, state);
      state = api.layoutImage(natW || size.w, natH || size.h, size.w, size.h, {
        x: (size.w / 2 - (laid.left + dx)) / laid.width,
        y: (size.h / 2 - (laid.top + dy)) / laid.height,
        scale: state.scale
      });
      place();
    });

    function endPointer(ev) {
      var pts;
      delete pointers[ev.pointerId];
      pts = pointList();
      if (pts.length < 2) pinch = null;
      if (!pts.length) {
        drag = null;
        commit(true);
      }
    }
    view.addEventListener('pointerup', endPointer);
    view.addEventListener('pointercancel', endPointer);

    view.addEventListener('wheel', function (ev) {
      var local;
      var hit;
      ev.preventDefault();
      local = localPoint(ev.clientX, ev.clientY);
      hit = imagePoint(local);
      applyZoom(local.x, local.y, hit.x, hit.y, state.scale * (ev.deltaY < 0 ? 1.08 : 1 / 1.08));
      commit(false);
    }, { passive: false });

    slider.addEventListener('input', function () {
      var size = viewSize();
      var local = { x: size.w / 2, y: size.h / 2 };
      var hit = imagePoint(local);
      applyZoom(local.x, local.y, hit.x, hit.y, Number(slider.value));
      commit(false);
    });

    reset.addEventListener('click', function () {
      state = { x: 0.5, y: 0.5, scale: 1 };
      place();
      commit(true);
    });

    document.addEventListener('tw-cutin-photo', onPhoto);
    document.addEventListener('tw-cutin-style', onStyle);
    if (typeof ResizeObserver === 'function') {
      var observer = new ResizeObserver(function () { paintChrome(); place(); });
      observer.observe(shell);
    }
    paintChrome();
    setImage(opts.imageUrl || '');
    place();
    return root;
  }

  global.CutinForm = { choices: choices, crop: crop };
})(typeof window !== 'undefined' ? window : this);
