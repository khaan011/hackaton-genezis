/* Послевкусие — общие утилиты: числа, случайность с зерном, цвет, даты. */
(function () {
'use strict';
const PV = (globalThis.PV = globalThis.PV || {});
const U = {};

U.clamp = (x, a = 0, b = 1) => (x < a ? a : x > b ? b : x);
U.lerp = (a, b, t) => a + (b - a) * t;
U.norm = (x, a, b) => U.clamp((x - a) / (b - a));
U.smooth = (e0, e1, x) => { const t = U.clamp((x - e0) / (e1 - e0)); return t * t * (3 - 2 * t); };
U.fract = (x) => x - Math.floor(x);
U.mod = (a, n) => ((a % n) + n) % n;
U.avg = (arr) => (arr.length ? arr.reduce((s, v) => s + v, 0) / arr.length : 0);
/* взвешенное среднее: [[value, weight], ...] */
U.wavg = (pairs) => {
  let s = 0, w = 0;
  for (const [v, k] of pairs) { if (v == null || !isFinite(v) || !k) continue; s += v * k; w += k; }
  return w > 0 ? s / w : 0.5;
};

U.ease = {
  inOut: (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2),
  out: (t) => 1 - Math.pow(1 - t, 3),
  in: (t) => t * t * t,
  sine: (t) => 0.5 - 0.5 * Math.cos(Math.PI * U.clamp(t)),
  outBack: (t) => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); },
  outElastic: (t) => (t <= 0 ? 0 : t >= 1 ? 1 : Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 3) + 1),
};

U.hash = (str) => {
  let h = 2166136261 >>> 0;
  str = String(str);
  for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
};

/* mulberry32 + удобные методы */
U.rng = (seed) => {
  let a = seed >>> 0;
  const f = () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  f.range = (lo, hi) => lo + (hi - lo) * f();
  f.int = (lo, hi) => Math.floor(lo + (hi - lo + 1) * f());
  f.pick = (arr) => arr[Math.floor(f() * arr.length)];
  f.chance = (p) => f() < p;
  f.gauss = () => { let u = 0, v = 0; while (!u) u = f(); while (!v) v = f(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); };
  return f;
};
U.shuffle = (arr, r) => { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; };

/* гладкий 1D-шум для покачиваний */
U.noise1 = (x, seed = 0) => {
  const i = Math.floor(x), f = x - i;
  const h = (n) => { const s = Math.sin((n + seed * 131.7) * 127.1) * 43758.5453; return s - Math.floor(s); };
  const u = f * f * (3 - 2 * f);
  return U.lerp(h(i), h(i + 1), u) * 2 - 1;
};

/* ---------- цвет: [r,g,b] 0..255 ---------- */
U.rgb2hsl = ([r, g, b]) => {
  r /= 255; g /= 255; b /= 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  let h = 0, s = 0; const l = (mx + mn) / 2;
  if (mx !== mn) {
    const d = mx - mn;
    s = l > 0.5 ? d / (2 - mx - mn) : d / (mx + mn);
    if (mx === r) h = (g - b) / d + (g < b ? 6 : 0); else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4;
    h *= 60;
  }
  return [h, s, l];
};
U.hsl2rgb = ([h, s, l]) => {
  h = U.mod(h, 360) / 360; s = U.clamp(s); l = U.clamp(l);
  if (s === 0) { const v = l * 255; return [v, v, v]; }
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s, p = 2 * l - q;
  const f = (t) => { if (t < 0) t += 1; if (t > 1) t -= 1; if (t < 1 / 6) return p + (q - p) * 6 * t; if (t < 1 / 2) return q; if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6; return p; };
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255];
};
const s2l = (c) => { c /= 255; return c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
const l2s = (c) => { const v = c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(Math.max(c, 0), 1 / 2.4) - 0.055; return U.clamp(v) * 255; };
U.rgb2lab = ([r, g, b]) => {
  const R = s2l(r), G = s2l(g), B = s2l(b);
  const x = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, y = R * 0.2126 + G * 0.7152 + B * 0.0722, z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(x), fy = f(y), fz = f(z);
  return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
};
U.lab2rgb = ([L, a, b]) => {
  const fy = (L + 16) / 116, fx = a / 500 + fy, fz = fy - b / 200;
  const fi = (t) => { const t3 = t * t * t; return t3 > 0.008856 ? t3 : (t - 16 / 116) / 7.787; };
  const x = fi(fx) * 0.95047, y = fi(fy), z = fi(fz) * 1.08883;
  return [l2s(x * 3.2406 + y * -1.5372 + z * -0.4986), l2s(x * -0.9689 + y * 1.8758 + z * 0.0415), l2s(x * 0.0557 + y * -0.204 + z * 1.057)];
};
U.lab2lch = ([L, a, b]) => [L, Math.hypot(a, b), U.mod(Math.atan2(b, a) * 180 / Math.PI, 360)];
U.lch2lab = ([L, C, h]) => [L, C * Math.cos(h * Math.PI / 180), C * Math.sin(h * Math.PI / 180)];
U.rgb2lch = (c) => U.lab2lch(U.rgb2lab(c));
U.lch2rgb = (c) => U.lab2rgb(U.lch2lab(c));
/* сдвиг оттенка по кратчайшей дуге */
U.hueToward = (h, target, k) => { const d = U.mod(target - h + 180, 360) - 180; return U.mod(h + d * k, 360); };
U.mix = (a, b, t) => [U.lerp(a[0], b[0], t), U.lerp(a[1], b[1], t), U.lerp(a[2], b[2], t)];
U.css = (c, a = 1) => `rgba(${Math.round(c[0])},${Math.round(c[1])},${Math.round(c[2])},${+a.toFixed(3)})`;
U.hex = (c) => '#' + c.map((v) => Math.round(U.clamp(v, 0, 255)).toString(16).padStart(2, '0')).join('');
U.fromHex = (h) => { h = h.replace('#', ''); return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16)); };
U.luma = (c) => (0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2]) / 255;
U.dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/* ---------- даты по-русски ---------- */
const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WEEKDAYS = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
U.parseDate = (s) => { const [y, m, d] = String(s).split('-').map(Number); return new Date(y, (m || 1) - 1, d || 1); };
U.today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
U.dateLong = (s) => { const d = U.parseDate(s); return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]} ${d.getFullYear()}`; };
U.dateStamp = (s) => { const d = U.parseDate(s); return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${d.getFullYear()}`; };
U.weekday = (s) => WEEKDAYS[U.parseDate(s).getDay()];
U.month = (s) => U.parseDate(s).getMonth();
U.fmtTime = (sec) => { sec = Math.max(0, sec || 0); const m = Math.floor(sec / 60), s = Math.floor(sec % 60); return `${m}:${String(s).padStart(2, '0')}`; };
U.plural = (n, one, few, many) => { const a = Math.abs(n) % 100, b = a % 10; if (a > 10 && a < 20) return many; if (b > 1 && b < 5) return few; if (b === 1) return one; return many; };
U.cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
U.fmtNum = (x, d = 0) => Number(x).toFixed(d).replace('.', ',');
U.sizeLabel = (bytes) => (bytes > 1048576 ? U.fmtNum(bytes / 1048576, 1) + ' МБ' : Math.max(1, Math.round(bytes / 1024)) + ' КБ');
U.safeName = (s) => String(s).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'День';

U.sleep = (ms) => new Promise((r) => setTimeout(r, ms));
U.frame = () => new Promise((r) => (typeof requestAnimationFrame !== 'undefined' ? requestAnimationFrame(() => r()) : setTimeout(r, 0)));

PV.U = U;
})();
