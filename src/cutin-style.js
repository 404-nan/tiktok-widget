// カットインの見た目と切り抜き。元画像は触らず、位置と拡大だけを残す。
// ダッシュボードとウィジェットの公開 JS（ES5）も同じ数値にする。

export const BAND_ASPECT = 12 / 5;
export const FRAME_RATIO = 16 / 9;
export const TEXT_WEIGHTS = ['normal', 'bold'];
export const TEXT_WEIGHT_LABELS = { normal: '普通', bold: '太字' };
export const IMAGE_STYLES = ['stripe', 'invert', 'thick'];

export const STYLES = {
  stripe: { id: 'stripe', label: '縞・標準', angle: 45, stripe: 12, border: 12, ink: '#111113', paper: '#F6F5F1', mark: 8 },
  invert: { id: 'invert', label: '縞・反転', angle: -45, stripe: 12, border: 12, ink: '#F6F5F1', paper: '#111113', mark: 8 },
  thick: { id: 'thick', label: '縞・枠太', angle: 45, stripe: 32, border: 32, ink: '#111113', paper: '#F6F5F1', mark: 16 },
};

const CROP_DEFAULT = { x: 0.5, y: 0.5, scale: 1 };

export function round3(n) {
  return Math.round(n * 1000) / 1000;
}

function readNum(value) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string' && value.trim() !== '') return Number(value);
  return NaN;
}

export function parseImageStyle(value) {
  if (value == null || value === '') return { ok: true, value: '' };
  if (IMAGE_STYLES.includes(value)) return { ok: true, value };
  return { ok: false, value: '' };
}

export function parseCrop(value) {
  const errors = [];
  const warnings = [];
  if (value == null) return { value: { ...CROP_DEFAULT }, errors, warnings };
  if (typeof value !== 'object' || Array.isArray(value)) {
    errors.push('{ x, y, scale } で書いてください');
    return { value: { ...CROP_DEFAULT }, errors, warnings };
  }
  for (const key of Object.keys(value)) {
    if (!['x', 'y', 'scale'].includes(key)) warnings.push(`${key}: 使われない項目です`);
  }
  const axis = (key, fallback, min, max) => {
    if (value[key] == null || value[key] === '') return fallback;
    const n = readNum(value[key]);
    if (!Number.isFinite(n)) {
      errors.push(`${key}: 数値で書いてください`);
      return fallback;
    }
    if (n < min || n > max) errors.push(`${key}: ${min}〜${max} にしてください`);
    return round3(Math.min(max, Math.max(min, n)));
  };
  return {
    value: {
      x: axis('x', 0.5, 0, 1),
      y: axis('y', 0.5, 0, 1),
      scale: axis('scale', 1, 1, 4),
    },
    errors,
    warnings,
  };
}

export function hatchBackground(spec) {
  if (!spec?.stripe) return 'none';
  const a = spec.stripe;
  return `repeating-linear-gradient(${spec.angle}deg, ${spec.ink} 0 ${a}px, ${spec.paper} ${a}px ${a * 2}px)`;
}

export function frameSize(screenW, screenH) {
  const w = Math.round(Math.min(screenW, screenH) * (screenH > screenW ? 0.78 : 0.42));
  return { w, h: Math.round(w * FRAME_RATIO) };
}

export function frameMetrics(outerW, outerH, spec) {
  const border = spec.border;
  const innerW = Math.max(1, outerW - border * 2);
  const innerH = Math.max(1, outerH - border * 2);
  const bandH = innerW / BAND_ASPECT;
  const hatch = (innerH - bandH - spec.mark) / 2;
  return { innerW, innerH, bandW: innerW, bandH, hatch, border, mark: spec.mark };
}

function clampScale(scale) {
  const n = Number(scale);
  if (!Number.isFinite(n)) return 1;
  return Math.min(4, Math.max(1, n));
}

function clampFocal(focal, view, disp) {
  const half = view / (2 * disp);
  if (!(half < 0.5)) return 0.5;
  const n = Number(focal);
  const value = Number.isFinite(n) ? n : 0.5;
  return Math.min(1 - half, Math.max(half, value));
}

/** 帯の中での画像の位置。scale 1 は帯を覆う最小、x・y は画像の中で帯の中央に来る点（0〜1）。 */
export function layoutImage(natW, natH, viewW, viewH, crop) {
  const scale = clampScale(crop?.scale);
  const base = Math.max(viewW / natW, viewH / natH);
  const width = natW * base * scale;
  const height = natH * base * scale;
  const x = clampFocal(crop?.x, viewW, width);
  const y = clampFocal(crop?.y, viewH, height);
  const left = round3(viewW / 2 - x * width);
  const top = round3(viewH / 2 - y * height);
  return {
    x: round3(x),
    y: round3(y),
    scale: round3(scale),
    width,
    height,
    left: left === 0 ? 0 : left,
    top: top === 0 ? 0 : top,
  };
}

/** ポインタの下の画像の点が動かないように拡大する。 */
export function zoomKeepPoint(natW, natH, viewW, viewH, localX, localY, imgX, imgY, nextScale) {
  const scale = clampScale(nextScale);
  const base = Math.max(viewW / natW, viewH / natH);
  const width = natW * base * scale;
  const height = natH * base * scale;
  const left = localX - imgX * width;
  const top = localY - imgY * height;
  return layoutImage(natW, natH, viewW, viewH, {
    x: (viewW / 2 - left) / width,
    y: (viewH / 2 - top) / height,
    scale,
  });
}
