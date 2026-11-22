/* Послевкусие — анализ фотографий: палитра (k-средних в Lab), свет, контраст, насыщенность,
   тёплость, «занятость» кадра и точка интереса для движения камеры. */
(function () {
'use strict';
const PV = (globalThis.PV = globalThis.PV || {});
const U = PV.U;

function makeCanvas(w, h) {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w)); c.height = Math.max(1, Math.round(h));
  return c;
}

/* загрузка с учётом поворота из EXIF */
async function loadBitmap(blob) {
  if (globalThis.createImageBitmap) {
    try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); } catch (e) { /* ниже запасной путь */ }
  }
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.decoding = 'async';
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const c = makeCanvas(img.naturalWidth, img.naturalHeight);
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  } finally { URL.revokeObjectURL(url); }
}

/* уменьшаем до 1440 px по длинной стороне (видео — 1080×1920) и сохраняем JPEG для дневника */
async function normalizePhoto(file) {
  const bmp = await loadBitmap(file);
  const w = bmp.width, h = bmp.height, k = Math.min(1, 1440 / Math.max(w, h));
  const c = makeCanvas(w * k, h * k);
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.85));
  return { blob, width: c.width, height: c.height, bitmap: c };
}

/* взвешенные k-средних в Lab */
function kmeans(points, weights, k, rnd, iters = 10) {
  const n = points.length;
  if (!n) return [];
  k = Math.min(k, n);
  const cent = [points[Math.floor(rnd() * n)].slice()];
  const d2 = new Float64Array(n);
  while (cent.length < k) {
    let sum = 0;
    for (let i = 0; i < n; i++) {
      let m = Infinity; for (const c of cent) { const d = (points[i][0] - c[0]) ** 2 + (points[i][1] - c[1]) ** 2 + (points[i][2] - c[2]) ** 2; if (d < m) m = d; }
      d2[i] = m * weights[i]; sum += d2[i];
    }
    let r = rnd() * sum, idx = 0;
    for (; idx < n - 1; idx++) { r -= d2[idx]; if (r <= 0) break; }
    cent.push(points[idx].slice());
  }
  const assign = new Int32Array(n);
  for (let it = 0; it < iters; it++) {
    for (let i = 0; i < n; i++) {
      let best = 0, bd = Infinity;
      for (let j = 0; j < cent.length; j++) { const c = cent[j]; const d = (points[i][0] - c[0]) ** 2 + (points[i][1] - c[1]) ** 2 + (points[i][2] - c[2]) ** 2; if (d < bd) { bd = d; best = j; } }
      assign[i] = best;
    }
    const acc = cent.map(() => [0, 0, 0, 0]);
    for (let i = 0; i < n; i++) { const a = acc[assign[i]], w = weights[i]; a[0] += points[i][0] * w; a[1] += points[i][1] * w; a[2] += points[i][2] * w; a[3] += w; }
    for (let j = 0; j < cent.length; j++) if (acc[j][3] > 0) cent[j] = [acc[j][0] / acc[j][3], acc[j][1] / acc[j][3], acc[j][2] / acc[j][3]];
  }
  const wsum = new Float64Array(cent.length); let tot = 0;
  for (let i = 0; i < n; i++) { wsum[assign[i]] += weights[i]; tot += weights[i]; }
  return cent.map((c, j) => ({ lab: c, rgb: U.lab2rgb(c).map(Math.round), weight: wsum[j] / (tot || 1) })).filter((c) => c.weight > 0.005).sort((a, b) => b.weight - a.weight);
}

function analyzePhoto(src, seed) {
  const W = src.width, H = src.height, k = 160 / Math.max(W, H);
  const w = Math.max(8, Math.round(W * k)), h = Math.max(8, Math.round(H * k));
  const c = makeCanvas(w, h);
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, w, h);
  const d = ctx.getImageData(0, 0, w, h).data;
  const n = w * h, lum = new Float32Array(n);
  let sumL = 0, sumS = 0, warm = 0, cool = 0, satW = 0, dark = 0, bright = 0;
  const pts = [], wts = [];
  for (let i = 0; i < n; i++) {
    const r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    lum[i] = l; sumL += l;
    const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
    const s = mx > 0 ? (mx - mn) / mx : 0;
    sumS += s;
    if (s > 0.12 && mx > 30) {
      const [hue] = U.rgb2hsl([r, g, b]);
      if (hue < 70 || hue >= 320) warm += s; else if (hue >= 160 && hue < 280) cool += s;
      satW += s;
    }
    if (l < 0.18) dark++; else if (l > 0.82) bright++;
    if (i % 2 === 0) { pts.push(U.rgb2lab([r, g, b])); wts.push(1); }
  }
  const meanL = sumL / n;
  let varL = 0; for (let i = 0; i < n; i++) varL += (lum[i] - meanL) ** 2;
  /* Собель: занятость кадра и точка интереса */
  let eSum = 0, fx = 0, fy = 0, fw = 0;
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    const i = y * w + x;
    const gx = lum[i - w + 1] + 2 * lum[i + 1] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - 1] - lum[i + w - 1];
    const gy = lum[i + w - 1] + 2 * lum[i + w] + lum[i + w + 1] - lum[i - w - 1] - 2 * lum[i - w] - lum[i - w + 1];
    const m = Math.hypot(gx, gy);
    eSum += m;
    const cx = x / w - 0.5, cy = y / h - 0.45, bias = Math.exp(-(cx * cx + cy * cy) / 0.18);
    const wgt = m * m * bias;
    fx += x * wgt; fy += y * wgt; fw += wgt;
  }
  const edges = eSum / ((w - 2) * (h - 2));
  const palette = kmeans(pts, wts, 5, U.rng(seed || 1));
  return {
    width: W, height: H, aspect: W / H,
    lum: meanL, contrast: Math.sqrt(varL / n), sat: sumS / n,
    warm: satW > 0 ? (warm - cool) / (warm + cool + 1e-6) * U.clamp(satW / (n * 0.08)) : 0,
    edges: U.clamp(edges / 0.55), darkFrac: dark / n, brightFrac: bright / n,
    focus: fw > 0 ? [U.clamp(fx / fw / w, 0.2, 0.8), U.clamp(fy / fw / h, 0.2, 0.8)] : [0.5, 0.45],
    palette: palette.map((p) => ({ rgb: p.rgb, weight: +p.weight.toFixed(3) })),
  };
}

/* сводка по всем фото дня */
function mergePhotos(list, seed) {
  const n = list.length || 1;
  const avg = (k) => list.reduce((s, p) => s + p[k], 0) / n;
  const pts = [], wts = [];
  for (const p of list) for (const c of p.palette) { pts.push(U.rgb2lab(c.rgb)); wts.push(c.weight / n); }
  const pal = kmeans(pts, wts, Math.min(6, pts.length), U.rng(seed || 7), 12);
  return {
    count: list.length, lum: avg('lum'), contrast: avg('contrast'), sat: avg('sat'), warm: avg('warm'), edges: avg('edges'),
    darkFrac: avg('darkFrac'), brightFrac: avg('brightFrac'),
    palette: pal.map((p) => ({ rgb: p.rgb, weight: +p.weight.toFixed(3) })),
  };
}

PV.Img = { makeCanvas, loadBitmap, normalizePhoto, analyzePhoto, mergePhotos, kmeans };
})();
