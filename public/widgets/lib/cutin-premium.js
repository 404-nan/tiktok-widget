// カットインのプレミア柄と抽選結果を公開画面で再現するES5の小さな部品。
// 外部画像やCDNを使わず、サーバーから届いたseedだけで同じSVGを作る。
(function (root) {
  'use strict';

  var TIERS = ['blue', 'green', 'red', 'gold', 'rainbow'];
  var PATTERNS = ['giraffe', 'zebra', 'gold'];

  function validUnit(value) {
    return typeof value === 'number' && isFinite(value) && value >= 0 && value < 1;
  }

  function validDraw(draw) {
    var i;
    if (!draw) return false;
    for (i = 0; i < 4; i += 1) if (!validUnit(draw[['premium', 'pattern', 'promote', 'from'][i]])) return false;
    return draw.seed % 1 === 0 && draw.seed >= 1 && draw.seed <= 900 && typeof draw.rush === 'boolean';
  }

  function resolve(draw, baseTier, settings) {
    var baseIndex = TIERS.indexOf(baseTier);
    var fallback = { tier: baseIndex < 0 ? null : baseTier, from: null, pattern: null };
    var premiumPatterns;
    var tierIndex;
    if (!validDraw(draw) || baseIndex < 0) return fallback;
    settings = settings || {};
    premiumPatterns = Array.isArray(settings.premiumPatterns) ? settings.premiumPatterns.filter(function (id) { return PATTERNS.indexOf(id) >= 0; }) : [];
    tierIndex = settings.rushBoost === true && draw.rush ? Math.min(4, baseIndex + 1) : baseIndex;
    return {
      tier: TIERS[tierIndex],
      from: settings.promote === true && tierIndex >= 1 && draw.promote < Number(settings.promoteRate == null ? 20 : settings.promoteRate) / 100 ? TIERS[Math.floor(draw.from * tierIndex)] : null,
      pattern: settings.premium === true && draw.premium < Number(settings.premiumRate == null ? 1 : settings.premiumRate) / 100 && premiumPatterns.length ? premiumPatterns[Math.min(premiumPatterns.length - 1, Math.floor(draw.pattern * premiumPatterns.length))] : null
    };
  }

  function random(seed) {
    var value = (seed * 1664525 + 1013904223) % 4294967296;
    return value / 4294967296;
  }

  function paint(id, width, height, seed, unit) {
    var safe = String(id || '');
    var n = Math.max(1, Number(unit) || 10);
    var w = Math.max(1, Number(width) || 1);
    var h = Math.max(1, Number(height) || 1);
    var key = 'cutin-' + safe + '-' + String(seed);
    var defs = '';
    var fill = '';
    var i;
    if (PATTERNS.indexOf(safe) < 0) return null;
    if (safe === 'giraffe') {
      defs = '<pattern id="' + key + '" width="' + (n * 5) + '" height="' + (n * 4) + '" patternUnits="userSpaceOnUse">' +
        '<rect width="100%" height="100%" fill="#D69424"/>' +
        '<path d="M0 ' + (n * 2) + ' L' + (n * 2) + ' ' + n + ' L' + (n * 4) + ' ' + (n * 2) + ' L' + (n * 3) + ' ' + (n * 4) + ' Z" fill="#4B2917"/>' +
        '</pattern>';
    } else if (safe === 'zebra') {
      defs = '<pattern id="' + key + '" width="' + (n * 6) + '" height="' + (n * 6) + '" patternUnits="userSpaceOnUse" patternTransform="rotate(' + (20 + Math.floor(random(Number(seed) || 1) * 25)) + ')">' +
        '<rect width="100%" height="100%" fill="#F6F5F1"/><path d="M0 0 L' + n + ' 0 L' + (n * 5) + ' ' + (n * 6) + ' L' + (n * 3) + ' ' + (n * 6) + ' Z" fill="#111113"/>' +
        '</pattern>';
    } else {
      defs = '<linearGradient id="' + key + '" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFF3B8"/><stop offset=".35" stop-color="#C98A00"/><stop offset=".62" stop-color="#FFF8D0"/><stop offset="1" stop-color="#8A5A00"/></linearGradient>';
    }
    fill = '<rect width="' + w + '" height="' + h + '" fill="' + (safe === 'gold' ? 'url(#' + key + ')' : 'url(#' + key + ')') + '"/>';
    for (i = 0; i < 2; i += 1) fill += '<path d="M0 ' + Math.round(h * (0.25 + i * 0.35)) + ' Q' + Math.round(w * 0.5) + ' ' + Math.round(h * (0.05 + random((Number(seed) || 1) + i) * 0.9)) + ' ' + w + ' ' + Math.round(h * (0.3 + i * 0.3)) + '" fill="none" stroke="#FFFFFF" stroke-opacity=".18" stroke-width="' + Math.max(1, n / 2) + '"/>';
    return { defs: defs, fill: fill };
  }

  root.CutinPremium = { resolve: resolve, paint: paint, tiers: TIERS.slice(), patterns: PATTERNS.slice() };
}(window));
