/* カットインの縦長フレームと切り抜き（ES5）。元画像は変えない。 */
(function (global) {
  var BAND_ASPECT = 12 / 5;
  var FRAME_RATIO = 16 / 9;
  var STYLES = {
    stripe: { id: 'stripe', label: '縞・標準', angle: 45, stripe: 12, border: 12, ink: '#111113', paper: '#F6F5F1', mark: 8 },
    invert: { id: 'invert', label: '縞・反転', angle: -45, stripe: 12, border: 12, ink: '#F6F5F1', paper: '#111113', mark: 8 },
    thick: { id: 'thick', label: '縞・枠太', angle: 45, stripe: 32, border: 32, ink: '#111113', paper: '#F6F5F1', mark: 16 }
  };

  function round3(n) {
    return Math.round(n * 1000) / 1000;
  }

  function styleById(id) {
    return STYLES[id] || null;
  }

  function styles() {
    return [STYLES.stripe, STYLES.invert, STYLES.thick];
  }

  function isHatch(id) {
    return !!STYLES[id];
  }

  function hatchBackground(spec) {
    var a;
    if (!spec || !spec.stripe) return 'none';
    a = spec.stripe;
    return 'repeating-linear-gradient(' + spec.angle + 'deg, ' + spec.ink + ' 0 ' + a + 'px, ' + spec.paper + ' ' + a + 'px ' + (a * 2) + 'px)';
  }

  function frameSize(screenW, screenH) {
    var w = Math.round(Math.min(screenW, screenH) * (screenH > screenW ? 0.78 : 0.42));
    return { w: w, h: Math.round(w * FRAME_RATIO) };
  }

  function frameMetrics(outerW, outerH, spec) {
    var border = spec.border;
    var innerW = Math.max(1, outerW - border * 2);
    var innerH = Math.max(1, outerH - border * 2);
    var bandH = innerW / BAND_ASPECT;
    return {
      innerW: innerW,
      innerH: innerH,
      bandW: innerW,
      bandH: bandH,
      hatch: (innerH - bandH - spec.mark) / 2,
      border: border,
      mark: spec.mark
    };
  }

  function clampScale(scale) {
    var n = Number(scale);
    if (!(typeof n === 'number' && isFinite(n))) return 1;
    return Math.min(4, Math.max(1, n));
  }

  function clampFocal(focal, view, disp) {
    var half = view / (2 * disp);
    var n;
    var value;
    if (!(half < 0.5)) return 0.5;
    n = Number(focal);
    value = typeof n === 'number' && isFinite(n) ? n : 0.5;
    return Math.min(1 - half, Math.max(half, value));
  }

  function layoutImage(natW, natH, viewW, viewH, crop) {
    var scale = clampScale(crop && crop.scale);
    var base = Math.max(viewW / natW, viewH / natH);
    var width = natW * base * scale;
    var height = natH * base * scale;
    var x = clampFocal(crop && crop.x, viewW, width);
    var y = clampFocal(crop && crop.y, viewH, height);
    var left = round3(viewW / 2 - x * width);
    var top = round3(viewH / 2 - y * height);
    return {
      x: round3(x),
      y: round3(y),
      scale: round3(scale),
      width: width,
      height: height,
      left: left === 0 ? 0 : left,
      top: top === 0 ? 0 : top
    };
  }

  function zoomKeepPoint(natW, natH, viewW, viewH, localX, localY, imgX, imgY, nextScale) {
    var scale = clampScale(nextScale);
    var base = Math.max(viewW / natW, viewH / natH);
    var width = natW * base * scale;
    var height = natH * base * scale;
    var left = localX - imgX * width;
    var top = localY - imgY * height;
    return layoutImage(natW, natH, viewW, viewH, {
      x: (viewW / 2 - left) / width,
      y: (viewH / 2 - top) / height,
      scale: scale
    });
  }

  function hatchEl(spec) {
    var el = document.createElement('div');
    el.className = 'hatch';
    el.style.flex = '1 1 auto';
    el.style.minHeight = '0';
    el.style.backgroundColor = spec.ink;
    el.style.backgroundImage = hatchBackground(spec);
    return el;
  }

  function mount(el, opts) {
    var spec = styleById(opts.style);
    var metrics;
    var frame;
    var top;
    var mark;
    var view;
    var bottom;
    var wait = [];
    var img;
    if (!spec || !el) return null;
    metrics = frameMetrics(opts.width, opts.height, spec);
    el.className = 'band hatch-host';
    while (el.firstChild) el.removeChild(el.firstChild);
    frame = document.createElement('div');
    frame.className = 'hatch-frame style-' + spec.id;
    frame.style.background = spec.ink;
    frame.style.padding = spec.border + 'px';
    frame.style.boxSizing = 'border-box';
    frame.style.width = '100%';
    frame.style.height = '100%';
    frame.style.display = 'flex';
    frame.style.flexDirection = 'column';
    frame.style.overflow = 'hidden';
    top = hatchEl(spec);
    mark = document.createElement('div');
    mark.className = 'tier-mark';
    mark.style.flex = '0 0 ' + spec.mark + 'px';
    mark.style.height = spec.mark + 'px';
    mark.style.background = opts.accent || '#FF2D2D';
    view = document.createElement('div');
    view.className = 'band-window';
    view.style.position = 'relative';
    view.style.overflow = 'hidden';
    view.style.flex = '0 0 ' + metrics.bandH + 'px';
    view.style.height = metrics.bandH + 'px';
    view.style.background = '#111113';
    bottom = hatchEl(spec);
    if (opts.photo) {
      img = document.createElement('img');
      img.className = 'crop-img';
      img.alt = '';
      img.draggable = false;
      img.onload = function () {
        var laid;
        if (!img.naturalWidth) return;
        laid = layoutImage(img.naturalWidth, img.naturalHeight, metrics.bandW, metrics.bandH, opts.crop || { x: 0.5, y: 0.5, scale: 1 });
        img.style.position = 'absolute';
        img.style.width = laid.width + 'px';
        img.style.height = laid.height + 'px';
        img.style.left = laid.left + 'px';
        img.style.top = laid.top + 'px';
        img.style.maxWidth = 'none';
      };
      img.src = opts.photo;
      view.appendChild(img);
      wait.push(img);
      if (img.complete && img.naturalWidth) img.onload();
    }
    frame.appendChild(top);
    frame.appendChild(mark);
    frame.appendChild(view);
    frame.appendChild(bottom);
    el.appendChild(frame);
    return { wait: wait, bandHeight: metrics.bandH, patternTargets: [top, bottom] };
  }

  global.CutinStyle = {
    BAND_ASPECT: BAND_ASPECT,
    styles: styles,
    isHatch: isHatch,
    styleById: styleById,
    frameSize: frameSize,
    frameMetrics: frameMetrics,
    layoutImage: layoutImage,
    zoomKeepPoint: zoomKeepPoint,
    hatchBackground: hatchBackground,
    mount: mount,
    round3: round3
  };
})(typeof window !== 'undefined' ? window : this);
