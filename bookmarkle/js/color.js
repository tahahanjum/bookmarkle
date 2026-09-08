(global => {
  'use strict';

  const DARK_L = [0.58, 0.80];
  const LIGHT_L = [0.48, 0.72];
  const MIN_SAT = 0.42;
  const GREY_DARK = '#ededf2';
  const GREY_LIGHT = '#3a3a42';
  const GREY_THRESHOLD = 0.08;

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function rgbToHsl(r, g, b) {
    r /= 255;g /= 255;b /= 255;
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    let h = 0;
    let s = 0;
    const l = (mx + mn) / 2;
    const d = mx - mn;
    if (d) {
      s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
      if (mx === r) { h = ((g - b) / d + (g < b ? 6 : 0)); }
      else if (mx === g) { h = (b - r) / d + 2; }
      else { h = (r - g) / d + 4; }
      h *= 60;
    }
    return [h, s, l];
  }

  function hslToHex(h, s, l) {
    h = ((h % 360) + 360) % 360;
    s = clamp(s, 0, 1);
    l = clamp(l, 0, 1);
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0;
    let g = 0;
    let b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    function hx(v) {
      return (`0${Math.round(clamp((v + m) * 255, 0, 255)).toString(16)}`).slice(-2);
    }
    return `#${hx(r)}${hx(g)}${hx(b)}`;
  }

  function hexToRgb(hex) {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) { h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]; }
    const n = parseInt(h, 16);
    if (isNaN(n)) { return null; }
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  function normaliseAccent(hex, isLight) {
    const rgb = hexToRgb(hex);
    if (!rgb) { return isLight ? GREY_LIGHT : GREY_DARK; }

    const hsl = rgbToHsl(rgb[0], rgb[1], rgb[2]);
    const h = hsl[0];
    let s = hsl[1];
    let l = hsl[2];

    const chroma = Math.max(rgb[0], rgb[1], rgb[2]) - Math.min(rgb[0], rgb[1], rgb[2]);
    if (chroma < 24 || s < GREY_THRESHOLD) { return isLight ? GREY_LIGHT : GREY_DARK; }

    s = clamp(Math.max(s, MIN_SAT), MIN_SAT, 0.95);
    const band = isLight ? LIGHT_L : DARK_L;
    l = clamp(l, band[0], band[1]);

    return hslToHex(h, s, l);
  }

  function onAccent(hex) {
    const rgb = hexToRgb(hex);
    if (!rgb) { return '#ffffff'; }
    const lum = (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255;
    return lum > 0.62 ? '#16161a' : '#ffffff';
  }

  function fromImageData(data, width, height) {
    const buckets = {};
    let lum = 0;
    let rs = 0;
    let gs = 0;
    let bs = 0;
    let n = 0;
    const step = 4;

    for (let i = 0; i < data.length; i += 4 * step) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 128) { continue; }
      lum += 0.2126 * r + 0.7152 * g + 0.0722 * b;
      rs += r;gs += g;bs += b;n++;

      const hsl = rgbToHsl(r, g, b);

      if (hsl[2] < 0.12 || hsl[2] > 0.92 || hsl[1] < 0.18) { continue; }
      const key = Math.round(hsl[0] / 15) * 15;
      const bucket = buckets[key] || (buckets[key] = { w: 0, h: 0, s: 0, l: 0 });

      const w = hsl[1] * (1 - Math.abs(hsl[2] - 0.55) * 1.4);
      if (w <= 0) { continue; }
      bucket.w += w;
      bucket.h += hsl[0] * w;
      bucket.s += hsl[1] * w;
      bucket.l += hsl[2] * w;
    }

    n ||= 1;
    const avgLum = lum / n;
    const isLight = avgLum > 140;

    let best = null;
    Object.keys(buckets).forEach(k => {
      const b = buckets[k];
      if (!best || b.w > best.w) { best = b; }
    });

    let accent;
    if (best && best.w > 0) {
      accent = hslToHex(best.h / best.w, best.s / best.w, best.l / best.w);
    } else {
      accent = isLight ? GREY_LIGHT : GREY_DARK;
    }

    return {
      accent: normaliseAccent(accent, isLight),
      isLight,
      average: [rs / n, gs / n, bs / n]
    };
  }

  function fromImage(img) {
    const size = 64;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0, size, size);
    try {
      const d = ctx.getImageData(0, 0, size, size).data;
      return fromImageData(d, size, size);
    } catch {
      return { accent: normaliseAccent('#6f8cff', false), isLight: false, average: [30, 30, 34], tainted: true };
    }
  }

  global.ColorUtil = {
    rgbToHsl,
    hslToHex,
    hexToRgb,
    normaliseAccent,
    onAccent,
    fromImage,
    fromImageData
  };
})(typeof window !== 'undefined' ? window : globalThis);
