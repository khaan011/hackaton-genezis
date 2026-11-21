/* Послевкусие — шесть художественных режимов. Каждый режим — это приём (техника + композиция + ритм),
   а оси настроения дня дозируют его: воздух, насыщенность, зерно, длительность кадра, слои погоды. */
(function () {
'use strict';
const PV = (globalThis.PV = globalThis.PV || {});
const U = PV.U;
const { W, H, LAY, cover, setFont, setSpacing, wrap, writeLines, roundRect, grade, feather, blurred, canvas } = PV.Render;

/* текущий и предыдущий кадр с учётом перехода */
function state(R, t) {
  const k = R.shotIndex(t);
  if (k < 0) return null;
  const shot = R.shots[k], lt = t - shot.start;
  const outro = t > R.shotsEnd ? 1 - U.smooth(R.shotsEnd, R.shotsEnd + 1.3, t) : 1;
  return { k, shot, lt, prev: k > 0 ? R.shots[k - 1] : null, outro };
}
const shotRnd = (R, j, salt = 0) => U.rng((R.S.seed + j * 7349 + salt * 131) >>> 0);

/* ======================================================================
   1. СВЕТ МОНЕ — мазки по направлению контуров, свет «дышит» с музыкой
   ====================================================================== */
function paintImpressionist(R, src, focus, bw, bh, pad, rnd, zoom) {
  const S = R.S, s = R.scale, hq = R.quality === 'high', k = 3;
  const sw = Math.max(8, Math.round(bw / k)), sh = Math.max(8, Math.round(bh / k));
  const smp = canvas(sw, sh), sctx = smp.getContext('2d', { willReadFrequently: true });
  cover(sctx, src, 0, 0, sw, sh, focus, zoom || 1);
  const id = sctx.getImageData(0, 0, sw, sh), d = id.data, n = sw * sh;
  const lum = new Float32Array(n), col = new Float32Array(n * 3);
  const sat = S.sat * 0.96, sh0 = S.shadowTint, hi0 = S.highlightTint, light = S.light;
  for (let i = 0; i < n; i++) {
    let r = d[i * 4], g = d[i * 4 + 1], b = d[i * 4 + 2];
    const l = 0.2126 * r + 0.7152 * g + 0.0722 * b, ln = l / 255;
    r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    const ws = (1 - ln) * (1 - ln) * (S.shadowK + 0.06), wh = ln * ln * (S.highlightK + 0.08);
    r += (sh0[0] - r) * ws + (hi0[0] - r) * wh; g += (sh0[1] - g) * ws + (hi0[1] - g) * wh; b += (sh0[2] - b) * ws + (hi0[2] - b) * wh;
    /* импрессионистский свет: тени не чёрные, а цветные и прозрачные */
    r = r * 0.9 + 18 + light[0] * 0.03; g = g * 0.9 + 16 + light[1] * 0.03; b = b * 0.9 + 18 + light[2] * 0.03;
    col[i * 3] = r; col[i * 3 + 1] = g; col[i * 3 + 2] = b;
    lum[i] = ln;
    d[i * 4] = r; d[i * 4 + 1] = g; d[i * 4 + 2] = b;
  }
  sctx.putImageData(id, 0, 0);
  /* поле направлений по градиенту яркости, сглаженное */
  let gx = new Float32Array(n), gy = new Float32Array(n);
  for (let y = 1; y < sh - 1; y++) for (let x = 1; x < sw - 1; x++) {
    const i = y * sw + x;
    gx[i] = lum[i - sw + 1] + 2 * lum[i + 1] + lum[i + sw + 1] - lum[i - sw - 1] - 2 * lum[i - 1] - lum[i + sw - 1];
    gy[i] = lum[i + sw - 1] + 2 * lum[i + sw] + lum[i + sw + 1] - lum[i - sw - 1] - 2 * lum[i - sw] - lum[i - sw + 1];
  }
  const boxBlur = (a) => {
    const o = new Float32Array(n), r = 2;
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
      let s2 = 0, c = 0;
      for (let yy = Math.max(0, y - r); yy <= Math.min(sh - 1, y + r); yy++) for (let xx = Math.max(0, x - r); xx <= Math.min(sw - 1, x + r); xx++) { s2 += a[yy * sw + xx]; c++; }
      o[y * sw + x] = s2 / c;
    }
    return o;
  };
  const mag = new Float32Array(n);
  for (let i = 0; i < n; i++) mag[i] = Math.hypot(gx[i], gy[i]);
  gx = boxBlur(gx); gy = boxBlur(gy);
  const smag = new Float32Array(n);
  for (let i = 0; i < n; i++) smag[i] = Math.hypot(gx[i], gy[i]);

  const out = canvas((bw + 2 * pad) * s, (bh + 2 * pad) * s), c = out.getContext('2d');
  c.scale(s, s); c.translate(pad, pad);
  /* подмалёвок */
  c.save();
  if ('filter' in c) c.filter = `blur(${7 * s}px)`;
  c.globalAlpha = 0.92;
  c.drawImage(smp, 10, 10, bw - 20, bh - 20);
  c.restore();
  const baseAng = -0.4 + (rnd() - 0.5) * 0.4;
  const layers = [
    { r: 15, sp: 13, len: [24, 46], a: 0.78 },
    { r: 8, sp: 7, len: [13, 27], a: 0.84 },
    { r: 3.8, sp: hq ? 4.2 : 6, len: [7, 14], a: 0.9, detail: true },
  ];
  c.lineCap = 'round';
  for (const L of layers) {
    const pts = [];
    for (let y = -10; y < bh + 10; y += L.sp) for (let x = -10; x < bw + 10; x += L.sp) pts.push([x + (rnd() - 0.5) * L.sp, y + (rnd() - 0.5) * L.sp]);
    U.shuffle(pts, rnd);
    for (const [x, y] of pts) {
      const inside = Math.min(x, y, bw - x, bh - y);
      if (rnd() > U.smooth(-18, 16, inside)) continue;
      const ix = U.clamp(Math.round(x / k), 0, sw - 1), iy = U.clamp(Math.round(y / k), 0, sh - 1), idx = iy * sw + ix;
      if (L.detail && mag[idx] < 0.07) continue;
      let ang = smag[idx] > 0.015 ? Math.atan2(gy[idx], gx[idx]) + Math.PI / 2 : baseAng + U.noise1(x * 0.01 + y * 0.013, 3) * 0.7;
      const len = U.lerp(L.len[0], L.len[1], rnd());
      const [h, sl, li] = U.rgb2hsl([col[idx * 3], col[idx * 3 + 1], col[idx * 3 + 2]]);
      const cc = U.hsl2rgb([h + (rnd() - 0.5) * 12, sl * (0.9 + rnd() * 0.25), U.clamp(li + (rnd() - 0.5) * 0.08)]);
      const dx = Math.cos(ang) * len / 2, dy = Math.sin(ang) * len / 2, bend = (rnd() - 0.5) * len * 0.3;
      c.beginPath();
      c.moveTo(x - dx, y - dy);
      c.quadraticCurveTo(x - Math.sin(ang) * bend, y + Math.cos(ang) * bend, x + dx, y + dy);
      c.lineWidth = L.r * 2 * (0.7 + 0.55 * rnd());
      c.strokeStyle = `rgb(${cc[0] | 0},${cc[1] | 0},${cc[2] | 0})`;
      c.globalAlpha = L.a;
      c.stroke();
    }
  }
  /* слой света для «дыхания» */
  const g = canvas(sw, sh), gctx = g.getContext('2d'), gid = gctx.createImageData(sw, sh);
  for (let i = 0; i < n; i++) {
    const v = U.clamp((lum[i] - 0.55) / 0.45);
    gid.data[i * 4] = light[0]; gid.data[i * 4 + 1] = light[1]; gid.data[i * 4 + 2] = light[2]; gid.data[i * 4 + 3] = v * 255;
  }
  gctx.putImageData(gid, 0, 0);
  return { paint: out, glow: blurred(g, 8, 1) };
}

PV.Regs = {};

PV.Regs.monet = (R) => {
  const S = R.S, inset = 16 + S.air * 70, PAD = 34;
  const box = { x: LAY.M + inset / 2, y: LAY.TOP + inset * 0.4, w: W - 2 * LAY.M - inset, h: LAY.IMG_B - LAY.TOP - inset * 0.9 };
  const needDetail = (i) => R.shots.some((sh) => sh.pi === i && sh.variant % 2 === 1);
  const draw = (ctx, shot, lt, alpha, t) => {
    const L = R.layers[shot.pi];
    if (!L || alpha <= 0) return;
    const layer = shot.variant % 2 === 1 && L.detail ? L.detail : L.base;
    const f = R.photos[shot.pi].a.focus;
    const p = U.clamp(lt / (shot.dur + S.transSec)), z = 1 + S.kenBurns * 0.6 * U.ease.sine(p);
    const fx = box.x + f[0] * box.w, fy = box.y + box.h;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(fx, fy); ctx.scale(z, z); ctx.translate(-fx, -fy);
    ctx.drawImage(layer.paint, box.x - PAD, box.y - PAD, box.w + 2 * PAD, box.h + 2 * PAD);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = alpha * (0.12 + 0.42 * R.env(t) * S.breathe);
    ctx.drawImage(layer.glow, box.x, box.y, box.w, box.h);
    ctx.restore();
  };
  return {
    box,
    async prepPhoto(i) {
      const ph = R.photos[i];
      const base = paintImpressionist(R, ph.bmp, ph.a.focus, box.w, box.h, PAD, U.rng(S.seed + i * 101), 1);
      const detail = needDetail(i) ? paintImpressionist(R, ph.bmp, ph.a.focus, box.w, box.h, PAD, U.rng(S.seed + i * 103), 1.7) : null;
      return { base, detail };
    },
    background(ctx) { R.drawPaper(ctx); },
    shots(ctx, t) {
      const st = state(R, t);
      if (!st) return;
      const fadeIn = st.k === 0 ? U.ease.sine(st.lt / Math.max(0.6, S.transSec)) : 1;
      if (st.prev && st.lt < S.transSec) draw(ctx, st.prev, st.lt + st.prev.dur, st.outro, t);
      const a = st.prev ? U.ease.sine(st.lt / Math.max(0.01, S.transSec)) : fadeIn;
      draw(ctx, st.shot, st.lt, a * st.outro, t);
    },
    particleClip() { return [box.x - 30, box.y - 30, box.w + 60, box.h + 60]; },
    particleAlpha(t) { const st = state(R, t); if (!st) return 0; return (st.k === 0 ? U.ease.sine(st.lt / Math.max(0.6, S.transSec)) : 1) * st.outro; },
  };
};

/* ======================================================================
   2. КОМПОЗИЦИЯ (Кандинский) — сетка, плакатные тона, геометрия на доли
   ====================================================================== */
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map((v) => (v + 0.5) / 16 - 0.5);
function posterize(src, S, tones, accent, maxSide) {
  const k = Math.min(1, maxSide / Math.max(src.width, src.height));
  const w = Math.round(src.width * k), h = Math.round(src.height * k);
  const c = canvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(src, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, w, h), d = id.data;
  const accH = U.rgb2hsl(accent)[0];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, r = d[i], g = d[i + 1], b = d[i + 2];
    let l = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    l = U.clamp(0.5 + (l - 0.5) * 1.25 * S.contrast);
    const [hh, ss] = U.rgb2hsl([r, g, b]);
    let col;
    const dh = Math.abs(U.mod(hh - accH + 180, 360) - 180);
    if (ss > 0.42 && dh < 28 && l > 0.2 && l < 0.85) col = accent;
    else { const q = U.clamp(Math.round(l * 3 + BAYER[(x & 3) + (y & 3) * 4] * 0.9), 0, 3); col = tones[q]; }
    d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2];
  }
  ctx.putImageData(id, 0, 0);
  return c;
}

PV.Regs.kandinsky = (R) => {
  const S = R.S, dark = S.dark;
  const ink = dark ? [236, 231, 220] : [20, 22, 28], pap = S.paper;
  const coolBase = [...(S.palette || [])].sort((a, b) => U.rgb2lch(a)[0] - U.rgb2lch(b)[0]);
  const hBase = coolBase.length ? U.rgb2lch(coolBase[0])[2] : 240;
  const deep = U.lch2rgb([dark ? 26 : 30, 22, U.hueToward(hBase, 240, 0.6)]);
  const mid = U.lch2rgb([dark ? 50 : 64, 18, U.hueToward(hBase, 220, 0.6)]);
  const tones = dark ? [[14, 15, 20], deep, mid, [210, 206, 196]] : [ink, deep, mid, pap];
  const accent = S.accent, accent2 = U.lch2rgb([70, 45, U.mod(U.rgb2lch(accent)[2] + 150, 360)]);
  const G = (c) => LAY.M + c * (W - 2 * LAY.M) / 12;
  const layouts = [
    [{ x: G(0), y: LAY.TOP, w: G(12) - G(0), h: 760 }],
    [{ x: G(4), y: LAY.TOP, w: G(12) - G(4), h: LAY.IMG_B - LAY.TOP }],
    [{ x: G(0), y: LAY.TOP, w: G(12) - G(0), h: 600 }, { x: G(0), y: LAY.TOP + 630, w: G(6) - G(0) - 12, h: 620, detail: true }],
    [{ x: G(0), y: LAY.TOP + 260, w: G(8) - G(0), h: 1028 }],
  ];
  const shapesFor = (j) => {
    const r = shotRnd(R, j, 5), lay = layouts[j % layouts.length], c0 = lay[0];
    const out = [];
    const free = lay.length === 1 && c0.h < 900 ? { x: G(0), y: c0.y + c0.h + 20, w: G(12) - G(0), h: LAY.IMG_B - (c0.y + c0.h) - 30 } : c0.x > G(1) ? { x: G(0), y: LAY.TOP, w: c0.x - G(0) - 20, h: LAY.IMG_B - LAY.TOP } : { x: G(6), y: LAY.TOP + 640, w: G(12) - G(6), h: 610 };
    out.push({ type: 'circle', x: c0.x + c0.w * (0.62 + r() * 0.3), y: c0.y + c0.h * (0.75 + r() * 0.3), r: 120 + r() * 110, col: accent });
    out.push({ type: 'ring', x: free.x + free.w * (0.2 + r() * 0.6), y: free.y + free.h * (0.2 + r() * 0.6), r: 40 + r() * 60, col: ink, lw: 6 });
    const nl = 4 + Math.round(S.mood.E * 4);
    for (let i = 0; i < nl; i++) {
      const ang = (r() < 0.5 ? -1 : 1) * (0.35 + r() * 0.75), len = 260 + r() * 640;
      out.push({ type: 'line', x: G(r() * 12), y: LAY.TOP + r() * (LAY.IMG_B - LAY.TOP), ang, len, lw: r() < 0.3 ? 9 + r() * 6 : 2 + r() * 3, col: r() < 0.15 ? accent : ink });
    }
    const nt = 1 + Math.round(S.mood.E * 2);
    for (let i = 0; i < nt; i++) out.push({ type: 'tri', x: free.x + free.w * r(), y: free.y + free.h * r(), r: 60 + r() * 90, ang: r() * 6.28, col: r() < 0.5 ? accent2 : ink, sharp: 0.25 + r() * 0.2 });
    out.push({ type: 'comb', x: free.x + free.w * r() * 0.7, y: free.y + free.h * (0.3 + r() * 0.5), n: 4, len: 120 + r() * 80, ang: r() < 0.5 ? 0 : Math.PI / 2, col: ink });
    for (let i = 0; i < 3 + Math.round(r() * 3); i++) out.push({ type: 'dot', x: G(r() * 12), y: LAY.TOP + r() * (LAY.IMG_B - LAY.TOP), r: 6 + r() * 16, col: r() < 0.3 ? accent : ink });
    out.push({ type: 'arc', x: free.x + free.w * r(), y: free.y + free.h * r(), r: 80 + r() * 90, a0: r() * 6.28, col: accent2, lw: 10 });
    out.push({ type: 'checker', x: free.x + free.w * r() * 0.8, y: free.y + free.h * r() * 0.8, n: 3, cell: 22, col: ink });
    return out;
  };
  const drawShape = (ctx, sh, sc) => {
    ctx.save(); ctx.translate(sh.x, sh.y); ctx.scale(sc, sc);
    ctx.fillStyle = U.css(sh.col); ctx.strokeStyle = U.css(sh.col); ctx.lineCap = 'butt';
    switch (sh.type) {
      case 'circle': ctx.globalAlpha *= 0.92; ctx.beginPath(); ctx.arc(0, 0, sh.r, 0, Math.PI * 2); ctx.fill(); break;
      case 'ring': ctx.lineWidth = sh.lw; ctx.beginPath(); ctx.arc(0, 0, sh.r, 0, Math.PI * 2); ctx.stroke(); ctx.beginPath(); ctx.arc(0, 0, sh.r * 0.45, 0, Math.PI * 2); ctx.fill(); break;
      case 'line': ctx.rotate(sh.ang); ctx.lineWidth = sh.lw; ctx.beginPath(); ctx.moveTo(-sh.len / 2, 0); ctx.lineTo(sh.len / 2, 0); ctx.stroke(); break;
      case 'tri': ctx.rotate(sh.ang); ctx.beginPath(); ctx.moveTo(0, -sh.r); ctx.lineTo(sh.r * sh.sharp, sh.r * 0.8); ctx.lineTo(-sh.r * sh.sharp, sh.r * 0.8); ctx.closePath(); ctx.fill(); break;
      case 'comb': ctx.rotate(sh.ang); ctx.lineWidth = 4; for (let i = 0; i < sh.n; i++) { ctx.beginPath(); ctx.moveTo(i * 22, 0); ctx.lineTo(i * 22, sh.len); ctx.stroke(); } break;
      case 'dot': ctx.beginPath(); ctx.arc(0, 0, sh.r, 0, Math.PI * 2); ctx.fill(); break;
      case 'arc': ctx.lineWidth = sh.lw; ctx.beginPath(); ctx.arc(0, 0, sh.r, sh.a0, sh.a0 + Math.PI); ctx.stroke(); break;
      case 'checker': for (let a = 0; a < sh.n; a++) for (let b = 0; b < sh.n; b++) if ((a + b) % 2 === 0) ctx.fillRect(a * sh.cell, b * sh.cell, sh.cell, sh.cell); ctx.lineWidth = 2; ctx.strokeRect(0, 0, sh.n * sh.cell, sh.n * sh.cell); break;
    }
    ctx.restore();
  };
  const cache = new Map();
  return {
    async prepPhoto(i) { return posterize(R.photos[i].bmp, S, tones, accent, R.quality === 'high' ? 1300 : 800); },
    background(ctx) {
      R.drawPaper(ctx);
      ctx.save(); ctx.strokeStyle = U.css(ink, 0.06); ctx.lineWidth = 1;
      for (let c = 0; c <= 12; c++) { ctx.beginPath(); ctx.moveTo(G(c), LAY.TOP - 30); ctx.lineTo(G(c), LAY.IMG_B + 30); ctx.stroke(); }
      ctx.restore();
    },
    shots(ctx, t) {
      const st = state(R, t);
      if (!st) return;
      const { shot, lt } = st;
      const lay = layouts[shot.j % layouts.length];
      const kick = 1 + 0.025 * R.pulse(t, 8) * (0.5 + S.pulse);
      ctx.save(); ctx.globalAlpha = st.outro;
      lay.forEach((cell, ci) => {
        const img = R.layers[ci === 0 ? shot.pi : (shot.pi + 1) % R.layers.length];
        const f = R.photos[ci === 0 ? shot.pi : (shot.pi + 1) % R.layers.length].a.focus;
        const z = (cell.detail || shot.variant % 2 === 1 ? 1.7 : 1.04) * (ci === 0 ? kick : 1);
        cover(ctx, img, cell.x, cell.y, cell.w, cell.h, f, z);
        ctx.strokeStyle = U.css(ink); ctx.lineWidth = 3; ctx.strokeRect(cell.x, cell.y, cell.w, cell.h);
      });
      if (!cache.has(shot.j)) cache.set(shot.j, shapesFor(shot.j));
      const shapes = cache.get(shot.j), beat = S.beat, n = shapes.length;
      /* фигуры живут только в зоне изображения: подписи, название и печать дня остаются читаемыми */
      ctx.beginPath(); ctx.rect(0, 0, W, LAY.IMG_B + 36); ctx.clip();
      shapes.forEach((sh, i) => {
        const at = Math.floor(i * R.shots[0].dur / beat / n) * beat;
        const p = U.clamp((lt - at) / 0.22);
        if (p <= 0) return;
        let sc = U.ease.outBack(p);
        if (sh.type === 'circle') sc *= 1 + 0.06 * R.pulse(t, 7);
        drawShape(ctx, sh, sc);
      });
      ctx.restore();
    },
  };
};

/* ======================================================================
   3. МА — пустота и пауза: маленькое фото, линия, красная печать
   ====================================================================== */
PV.Regs.ma = (R) => {
  const S = R.S, ink = [35, 32, 30];
  const rects = [];
  const rectFor = (shot) => {
    if (rects[shot.j]) return rects[shot.j];
    const a = R.photos[shot.pi].a.aspect || 1.33, r = shotRnd(R, shot.j, 9);
    let w = 500 + (1 - S.air) * 260, h = w / a;
    if (h > 720) { h = 720; w = h * a; }
    const left = shot.j % 2 === 0;
    const x = left ? LAY.M + 30 + r() * 50 : W - LAY.M - 30 - r() * 50 - w;
    const y = (left ? 300 : 520) + r() * 80;
    return (rects[shot.j] = { x, y, w, h, left });
  };
  return {
    async prepPhoto(i) {
      const ph = R.photos[i], a = ph.a.aspect || 1.33, s = R.scale;
      const w = Math.round(700 * s), h = Math.round(700 / a * s);
      const g = grade(ph.bmp, w, h, S, { sat: 0.48, contrast: 1.0, lift: 0.02, draw: (ctx, cw, ch) => cover(ctx, ph.bmp, 0, 0, cw, ch, ph.a.focus, 1) });
      return feather(g, Math.round(8 * s));
    },
    background(ctx, t) {
      R.drawPaper(ctx);
      const p = U.ease.out(U.clamp(t / 3));
      const st = state(R, t), rc = st ? rectFor(st.shot) : null;
      const x = rc ? (rc.left ? rc.x + rc.w + 70 : rc.x - 70) : W * 0.62;
      ctx.save(); ctx.strokeStyle = U.css(ink, 0.28); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.moveTo(x, LAY.TOP); ctx.lineTo(x, LAY.TOP + (LAY.IMG_B - LAY.TOP) * p); ctx.stroke();
      ctx.restore();
    },
    shots(ctx, t) {
      const st = state(R, t);
      if (!st) return;
      const { shot, lt } = st, rc = rectFor(shot);
      const fi = Math.min(1.3, shot.dur * 0.2), fo = Math.min(1.1, shot.dur * 0.16);
      const a = U.ease.sine(lt / fi) * (1 - U.smooth(shot.dur - fo, shot.dur, lt)) * st.outro;
      if (a <= 0) return;
      ctx.save(); ctx.globalAlpha = a * 0.4; ctx.strokeStyle = U.css(ink); ctx.lineWidth = 1.2;
      ctx.strokeRect(rc.x - 16, rc.y - 16, rc.w + 32, rc.h + 32); ctx.restore();
      const z = 1 + 0.025 * U.clamp(lt / shot.dur), img = R.layers[shot.pi];
      ctx.save(); ctx.globalAlpha = a; ctx.globalCompositeOperation = 'multiply';
      ctx.translate(rc.x + rc.w / 2, rc.y + rc.h / 2); ctx.scale(z, z); ctx.translate(-(rc.x + rc.w / 2), -(rc.y + rc.h / 2));
      if (shot.variant % 2 === 1) { ctx.beginPath(); ctx.rect(rc.x, rc.y, rc.w, rc.h); ctx.clip(); ctx.drawImage(img, rc.x - rc.w * 0.3, rc.y - rc.h * 0.3, rc.w * 1.6, rc.h * 1.6); }
      else ctx.drawImage(img, rc.x, rc.y, rc.w, rc.h);
      ctx.restore();
    },
    particleClip(t) { const st = state(R, t); if (!st) return [0, 0, 0, 0]; const rc = rectFor(st.shot); return [rc.x, rc.y, rc.w, rc.h]; },
    particleAlpha(t) { const st = state(R, t); if (!st) return 0; const d = st.shot.dur; return U.ease.sine(st.lt / Math.min(1.3, d * 0.2)) * (1 - U.smooth(d - Math.min(1.1, d * 0.16), d, st.lt)) * st.outro; },
    drawCaption(ctx, t, text, lt, dur, shot) {
      const rc = rectFor(shot);
      const a = U.ease.sine((lt - 0.6) / 1.0) * (1 - U.smooth(dur - Math.min(1.1, dur * 0.16), dur, lt));
      if (a <= 0) return true;
      ctx.save(); ctx.globalAlpha *= a; ctx.fillStyle = U.css(ink, 0.92);
      setFont(ctx, 'serif', 38, 400, 'italic');
      const maxW = Math.max(360, rc.w);
      const lines = wrap(ctx, text, maxW, 2);
      writeLines(ctx, lines, rc.x, Math.min(LAY.IMG_B + 20, rc.y + rc.h + 74 + (lines.length - 1) * 48), 48, U.clamp((lt - 0.6) / 2.4));
      ctx.restore();
      return true;
    },
  };
};

/* ======================================================================
   4. ПЛЁНКА — отпечатки стопкой, зерно, ореол, засветки, оранжевая дата
   ====================================================================== */
PV.Regs.film = (R) => {
  const S = R.S;
  const geom = (pi) => {
    const a = R.photos[pi].a.aspect || 1.33;
    let iw, ih;
    if (a >= 1) { iw = 780 - S.air * 60; ih = iw / a; } else { ih = 860 - S.air * 60; iw = ih * a; }
    return { iw, ih, side: 26, top: 26, bottom: 104 };
  };
  const pose = (shot) => {
    const r = shotRnd(R, shot.j, 3), g = geom(shot.pi);
    const pw = g.iw + 2 * g.side, phh = g.ih + g.top + g.bottom;
    return { g, pw, ph: phh, cx: W / 2 + (r() - 0.5) * 110, cy: LAY.TOP + (LAY.IMG_B - LAY.TOP) / 2 + (r() - 0.5) * 90, rot: (r() - 0.5) * 0.13, tape: (r() - 0.5) * 0.3, tapeX: (r() - 0.5) * 0.4 };
  };
  const stamp = (() => { const d = U.parseDate(R.day.date); return `'${String(d.getFullYear()).slice(2)} ${String(d.getMonth() + 1).padStart(2, ' ')} ${String(d.getDate()).padStart(2, '0')}`; })();
  const drawPrint = (ctx, shot, a, sc, dy, rotAdd, t, captionP) => {
    const P = pose(shot), L = R.layers[shot.pi];
    if (!L) return;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(P.cx, P.cy + dy); ctx.rotate(P.rot + rotAdd); ctx.scale(sc, sc);
    const x0 = -P.pw / 2, y0 = -P.ph / 2;
    ctx.shadowColor = 'rgba(40,25,10,0.32)'; ctx.shadowBlur = 26 * R.scale; ctx.shadowOffsetY = 10 * R.scale;
    ctx.fillStyle = 'rgb(247,243,234)'; ctx.fillRect(x0, y0, P.pw, P.ph);
    ctx.shadowColor = 'transparent';
    const jx = Math.sin(t * 37) * 0.5, jy = Math.cos(t * 29) * 0.5;
    const ix = x0 + P.g.side, iy = y0 + P.g.top;
    if (shot.variant % 2 === 1) { ctx.save(); ctx.beginPath(); ctx.rect(ix, iy, P.g.iw, P.g.ih); ctx.clip(); ctx.drawImage(L, ix - P.g.iw * 0.3 + jx, iy - P.g.ih * 0.3 + jy, P.g.iw * 1.6, P.g.ih * 1.6); ctx.restore(); }
    else ctx.drawImage(L, ix + jx, iy + jy, P.g.iw, P.g.ih);
    /* оранжевая дата, как у плёночной мыльницы */
    setFont(ctx, 'mono', 30, 700); setSpacing(ctx, 2);
    ctx.textAlign = 'right'; ctx.fillStyle = 'rgba(255,150,60,0.92)';
    ctx.shadowColor = 'rgba(255,90,20,0.8)'; ctx.shadowBlur = 8 * R.scale;
    ctx.fillText(stamp, ix + P.g.iw - 24, iy + P.g.ih - 22);
    ctx.shadowColor = 'transparent'; setSpacing(ctx, 0); ctx.textAlign = 'left';
    /* скотч */
    ctx.save(); ctx.translate(P.tapeX * P.pw, y0 + 4); ctx.rotate(P.tape);
    ctx.fillStyle = 'rgba(236,224,196,0.62)'; ctx.fillRect(-70, -22, 140, 44); ctx.restore();
    /* подпись на белом поле отпечатка */
    const text = R.capOf[shot.j];
    if (text && captionP > 0) {
      ctx.fillStyle = 'rgba(40,34,30,0.88)';
      setFont(ctx, 'serif', 34, 400, 'italic');
      const lines = wrap(ctx, text, P.g.iw - 20, 2);
      writeLines(ctx, lines, ix + 6, y0 + P.ph - (lines.length > 1 ? 30 : 38), 38, captionP);
    }
    ctx.restore();
  };
  return {
    async prepPhoto(i) {
      const ph = R.photos[i], g = geom(i), s = R.scale;
      const w = Math.round(g.iw * s), h = Math.round(g.ih * s);
      const base = grade(ph.bmp, w, h, S, {
        sat: S.sat * 0.92, contrast: 1.04, lift: 0.07,
        draw: (ctx, cw, ch) => cover(ctx, ph.bmp, 0, 0, cw, ch, ph.a.focus, 1),
        fn: (r, gg, b) => [r * 1.04 + 6, gg * 1.0 + 2, b * 0.9],
      });
      /* ореол вокруг светлых мест */
      const hl = canvas(w, h), hctx = hl.getContext('2d', { willReadFrequently: true });
      hctx.drawImage(base, 0, 0);
      const id = hctx.getImageData(0, 0, w, h), d = id.data;
      for (let k = 0; k < d.length; k += 4) { const l = (0.2126 * d[k] + 0.7152 * d[k + 1] + 0.0722 * d[k + 2]) / 255; const v = U.clamp((l - 0.68) / 0.32); d[k] = 255 * v; d[k + 1] = 70 * v; d[k + 2] = 30 * v; }
      hctx.putImageData(id, 0, 0);
      const ctx = base.getContext('2d');
      ctx.globalCompositeOperation = 'screen'; ctx.globalAlpha = 0.55;
      ctx.drawImage(blurred(hl, 14 * s, 1), 0, 0, w, h);
      ctx.globalCompositeOperation = 'multiply'; ctx.globalAlpha = 1;
      const vg = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.3, w / 2, h / 2, Math.max(w, h) * 0.75);
      vg.addColorStop(0, 'rgba(255,255,255,1)'); vg.addColorStop(1, 'rgba(150,120,100,1)');
      ctx.fillStyle = vg; ctx.fillRect(0, 0, w, h);
      return base;
    },
    background(ctx) { R.drawPaper(ctx); },
    shots(ctx, t) {
      const st = state(R, t);
      if (!st) return;
      const from = Math.max(0, st.k - 3);
      for (let i = from; i <= st.k; i++) {
        const sh = R.shots[i];
        const cur = i === st.k, lt = t - sh.start;
        const p = cur ? U.clamp(lt / S.transSec) : 1;
        const e = U.ease.outBack(p);
        const capP = U.clamp((lt - 0.5) / Math.min(2.6, sh.dur * 0.6));
        const fade = (cur ? 1 : 0.94 - (st.k - i) * 0.04) * st.outro;
        drawPrint(ctx, sh, U.clamp(p * 1.6) * fade, 1.1 - 0.1 * e, -60 * (1 - e), (1 - e) * 0.08, t, capP);
      }
    },
    after(ctx, t) {
      const lk = (S.overlays || {}).leaks || 0;
      if (lk <= 0) return;
      const e = R.env(t), fl = 0.85 + 0.15 * Math.sin(t * 9.3) * Math.sin(t * 2.1);
      const lightPage = U.luma(R.pageColor()) > 0.5;
      ctx.save(); ctx.globalCompositeOperation = lightPage ? 'multiply' : 'screen';
      const leak = (x, y, rad, col, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, rad); g.addColorStop(0, U.css(col, a)); g.addColorStop(1, U.css(col, 0)); ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2); };
      const k = lightPage ? 1.25 : 1, c1 = lightPage ? [255, 168, 104] : [255, 120, 40], c2 = lightPage ? [250, 140, 120] : [230, 60, 30];
      leak(-40, 420 + Math.sin(t * 0.3) * 160, 560, c1, U.clamp(k * lk * (0.14 + 0.42 * e) * fl));
      leak(W + 30, 1250 + Math.cos(t * 0.23) * 200, 640, c2, U.clamp(k * lk * (0.1 + 0.32 * e) * fl));
      ctx.restore();
    },
    drawCaption() { return true; },
  };
};

/* ======================================================================
   5. ВЫРЕЗКИ (Матисс) — фото в живых формах, бумажные водоросли в такт
   ====================================================================== */
function blobPts(r, n = 9) {
  const pts = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + (r() - 0.5) * 0.35; const rad = 0.82 + r() * 0.18; pts.push([Math.cos(a) * rad, Math.sin(a) * rad]); }
  return pts;
}
function smoothPath(ctx, pts, cx, cy, sx, sy) {
  const n = pts.length, P = (i) => { const p = pts[U.mod(i, n)]; return [cx + p[0] * sx, cy + p[1] * sy]; };
  ctx.beginPath();
  const p0 = P(0); ctx.moveTo(p0[0], p0[1]);
  for (let i = 0; i < n; i++) {
    const a = P(i - 1), b = P(i), c = P(i + 1), d = P(i + 2);
    ctx.bezierCurveTo(b[0] + (c[0] - a[0]) / 6, b[1] + (c[1] - a[1]) / 6, c[0] - (d[0] - b[0]) / 6, c[1] - (d[1] - b[1]) / 6, c[0], c[1]);
  }
  ctx.closePath();
}
function cutShape(ctx, sh) {
  ctx.beginPath();
  if (sh.type === 'algae') {
    const L = sh.size;
    ctx.save();
    for (let i = 0; i < sh.lobes; i++) {
      const t = i / (sh.lobes - 1), y = -L / 2 + t * L, side = i % 2 ? 1 : -1, len = L * (0.32 - 0.16 * Math.abs(t - 0.45));
      ctx.moveTo(0, y);
      ctx.ellipse(side * len * 0.55, y - len * 0.15, len * 0.6, len * 0.2, side * -0.5, 0, Math.PI * 2);
    }
    ctx.moveTo(L * 0.06, -L / 2); ctx.ellipse(0, 0, L * 0.06, L / 2, 0, 0, Math.PI * 2);
    ctx.restore();
  } else if (sh.type === 'star') {
    const n = sh.points;
    for (let i = 0; i <= n * 2; i++) { const a = (i / (n * 2)) * Math.PI * 2, rr = i % 2 ? sh.size * 0.42 : sh.size; const x = Math.cos(a) * rr, y = Math.sin(a) * rr; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.closePath();
  } else if (sh.type === 'circle') {
    ctx.arc(0, 0, sh.size / 2, 0, Math.PI * 2);
  } else if (sh.type === 'leaf') {
    const L = sh.size;
    ctx.moveTo(0, L / 2);
    for (let i = 0; i <= 10; i++) { const a = -Math.PI / 2 + (i / 10) * Math.PI * 2; const rr = L * 0.42 * (0.65 + 0.35 * Math.abs(Math.cos(a * 2.5))); ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr * 1.15); }
    ctx.closePath();
  }
}
PV.Regs.matisse = (R) => {
  const S = R.S;
  const pal = (S.palette || []).map((c) => { const [L, C, h] = U.rgb2lch(c); return U.lch2rgb([U.clamp(L, 40, 75), Math.max(C, 55), h]); });
  const cols = [...pal.slice(0, 4), [250, 247, 240], [22, 22, 26]].filter((c) => U.dist(c, S.bg || [0, 0, 0]) > 60);
  let shapes = [];
  const blobs = [];
  const place = (j) => {
    const r = shotRnd(R, j, 11), left = j % 2 === 0;
    return { cx: W / 2 + (left ? -1 : 1) * (60 + r() * 60), cy: LAY.TOP + 520 + r() * 160, sx: 330 + r() * 40, sy: 380 + r() * 50, rot: (r() - 0.5) * 0.12, prevCorner: left ? 1 : -1 };
  };
  const drawBlob = (ctx, pi, variant, pts, cx, cy, sx, sy, rot, sc, a) => {
    const img = R.layers[pi];
    if (!img) return;
    ctx.save(); ctx.globalAlpha = a;
    ctx.translate(cx, cy); ctx.rotate(rot); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
    smoothPath(ctx, pts, cx + 12, cy + 14, sx * 1.04, sy * 1.04);
    ctx.fillStyle = 'rgba(250,247,240,1)'; ctx.fill();
    smoothPath(ctx, pts, cx, cy, sx, sy);
    ctx.save(); ctx.clip();
    cover(ctx, img, cx - sx, cy - sy, sx * 2, sy * 2, R.photos[pi].a.focus, variant % 2 === 1 ? 1.6 : 1.02);
    ctx.restore();
    ctx.restore();
  };
  return {
    async prepPhoto(i) {
      const ph = R.photos[i], s = R.scale, w = Math.round(760 * s), h = Math.round(w / (ph.a.aspect || 1));
      blobs[i] = blobPts(U.rng(S.seed + i * 17));
      return grade(ph.bmp, w, h, S, { sat: Math.max(1.15, S.sat * 1.2), contrast: 1.06, draw: (ctx, cw, ch) => ctx.drawImage(ph.bmp, 0, 0, cw, ch) });
    },
    async prepare() {
      const r = U.rng(S.seed ^ 0x77);
      const spots = [[150, 340], [930, 320], [120, 1000], [960, 900], [210, 1330], [880, 1340], [540, 280], [560, 1300], [80, 660], [1000, 640]];
      shapes = spots.map(([x, y], i) => ({
        x: x + (r() - 0.5) * 80, y: y + (r() - 0.5) * 80, type: r.pick(['algae', 'algae', 'star', 'circle', 'leaf']), size: 120 + r() * 170,
        lobes: 6 + Math.floor(r() * 5), points: 5 + Math.floor(r() * 4), rot: r() * 6.28, ph: r() * 6.28, col: cols[i % cols.length], front: r() < 0.3,
      }));
    },
    background(ctx) { R.drawPaper(ctx); },
    shots(ctx, t) {
      const st = state(R, t);
      const bounce = R.pulse(t, 5) * (0.4 + S.pulse);
      const drawShapes = (front) => {
        for (const sh of shapes) {
          if (sh.front !== front) continue;
          ctx.save(); ctx.translate(sh.x, sh.y + Math.sin(t * 0.9 + sh.ph) * 8);
          ctx.rotate(sh.rot + Math.sin(t * 0.7 + sh.ph) * 0.12); ctx.scale(1 + 0.07 * bounce, 1 + 0.07 * bounce);
          cutShape(ctx, sh); ctx.fillStyle = U.css(sh.col); ctx.fill('nonzero');
          ctx.restore();
        }
      };
      drawShapes(false);
      if (st) {
        const { shot, lt, prev } = st;
        if (prev) { const q = place(prev.j); drawBlob(ctx, prev.pi, prev.variant, blobs[prev.pi], W / 2 + q.prevCorner * 300, LAY.TOP + 260, q.sx * 0.52, q.sy * 0.52, q.rot - 0.1 * q.prevCorner, 1, 0.98 * st.outro); }
        const q = place(shot.j), p = U.clamp(lt / S.transSec), e = U.ease.outElastic(p);
        drawBlob(ctx, shot.pi, shot.variant, blobs[shot.pi], q.cx, q.cy, q.sx, q.sy, q.rot + (1 - e) * 0.25, 0.55 + 0.45 * e, U.clamp(p * 3) * st.outro);
      }
      drawShapes(true);
    },
    particleClip() { return null; },
    drawCaption(ctx, t, text, lt, dur, shot) {
      const q = place(shot.j), p = U.clamp((lt - 0.35) / 0.4), e = U.ease.outBack(p);
      if (p <= 0) return true;
      const a = 1 - U.smooth(dur - 0.35, dur, lt);
      ctx.save(); ctx.globalAlpha *= a;
      setFont(ctx, 'sans', 38, 700);
      const lines = wrap(ctx, text, 760, 2), lh = 50;
      const wMax = Math.max(...lines.map((l) => ctx.measureText(l).width));
      const x = U.clamp(q.cx - wMax / 2, LAY.M, W - LAY.M - wMax - 40), y = Math.min(LAY.IMG_B - 20, q.cy + q.sy + 40);
      ctx.translate(x + wMax / 2, y); ctx.rotate(-0.03 * (shot.j % 2 ? -1 : 1)); ctx.scale(e, e); ctx.translate(-(x + wMax / 2), -y);
      ctx.fillStyle = 'rgba(250,247,240,0.97)';
      ctx.fillRect(x - 20, y - 46, wMax + 40, lines.length * lh + 24);
      ctx.fillStyle = 'rgb(22,22,26)';
      lines.forEach((l, i) => ctx.fillText(l, x, y + i * lh));
      ctx.restore();
      return true;
    },
  };
};

/* ======================================================================
   6. НОКТЮРН — цветовые поля, кадр сквозь мокрое стекло, один тёплый свет
   ====================================================================== */
PV.Regs.nocturne = (R) => {
  const S = R.S;
  const dk = [...(S.palette || [[30, 34, 60]])].sort((a, b) => U.rgb2lch(a)[0] - U.rgb2lch(b)[0]);
  const fieldCols = [
    U.lch2rgb([18, 18, U.hueToward(U.rgb2lch(dk[0])[2], 255, 0.5)]),
    U.lch2rgb([26, 22, U.hueToward(U.rgb2lch(dk[Math.min(1, dk.length - 1)])[2], 235, 0.4)]),
    U.lch2rgb([9, 8, 260]),
  ];
  const inset = S.air * 70;
  const box = { x: LAY.M + inset, y: 360 + inset * 0.5, w: W - 2 * LAY.M - 2 * inset, h: 900 - inset };
  let fields = null;
  const lamp = { x: box.x + box.w * 0.78, y: box.y + box.h * 0.18 };
  return {
    box,
    async prepare() {
      const s = R.scale, c = canvas(W * s, H * s), ctx = c.getContext('2d');
      ctx.scale(s, s);
      ctx.fillStyle = U.css(fieldCols[2]); ctx.fillRect(0, 0, W, H);
      if ('filter' in ctx) ctx.filter = `blur(${40 * s}px)`;
      ctx.fillStyle = U.css(fieldCols[0]); ctx.fillRect(40, 40, W - 80, H * 0.36);
      ctx.fillStyle = U.css(fieldCols[1]); ctx.fillRect(60, H * 0.33, W - 120, H * 0.42);
      ctx.fillStyle = U.css(U.mix(fieldCols[2], fieldCols[0], 0.3)); ctx.fillRect(40, H * 0.77, W - 80, H * 0.2);
      fields = c;
    },
    async prepPhoto(i) {
      const ph = R.photos[i], s = R.scale, w = Math.round(box.w * s), h = Math.round(box.h * s);
      const light = S.light;
      const sharp = grade(ph.bmp, w, h, S, {
        sat: S.sat * 0.8, contrast: 1.05,
        draw: (ctx, cw, ch) => cover(ctx, ph.bmp, 0, 0, cw, ch, ph.a.focus, 1),
        fn: (r, g, b, ln) => {
          const k = Math.pow(ln, 1.12) * 0.95 / Math.max(0.02, ln);
          let rr = r * k * 0.8, gg = g * k * 0.88, bb = b * k * 1.15 + 10;
          const w2 = U.clamp((ln - 0.62) / 0.38);
          rr += (light[0] - rr) * w2 * 0.55; gg += (light[1] - gg) * w2 * 0.55; bb += (light[2] - bb) * w2 * 0.55;
          return [rr, gg, bb];
        },
      });
      return { sharp: feather(sharp, Math.round(24 * s)), soft: blurred(sharp, 16 * s, 0.5) };
    },
    background(ctx, t) {
      ctx.drawImage(fields, 0, 0, W, H);
      ctx.save(); ctx.globalCompositeOperation = 'soft-light'; ctx.globalAlpha = 0.6;
      ctx.drawImage(R.paper, 0, 0, W, H);
      ctx.restore();
      ctx.save(); ctx.globalCompositeOperation = 'soft-light';
      ctx.fillStyle = U.css(S.light, 0.05 + 0.12 * R.env(t) * S.breathe); ctx.fillRect(0, 0, W, H);
      ctx.restore();
    },
    shots(ctx, t) {
      const st = state(R, t);
      if (!st) return;
      const drawOne = (shot, lt, a) => {
        const L = R.layers[shot.pi];
        if (!L || a <= 0) return;
        const z = 1 + S.kenBurns * U.clamp(lt / (shot.dur + S.transSec)) + (shot.variant % 2 ? 0.5 : 0);
        ctx.save(); ctx.globalAlpha = a;
        const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
        ctx.translate(cx, cy); ctx.scale(z, z); ctx.translate(-cx, -cy);
        ctx.drawImage(L.soft, box.x - 20, box.y - 20, box.w + 40, box.h + 40);
        ctx.globalAlpha = a * (0.64 + 0.3 * R.env(t));
        ctx.drawImage(L.sharp, box.x, box.y, box.w, box.h);
        ctx.restore();
      };
      if (st.prev && st.lt < S.transSec) drawOne(st.prev, st.lt + st.prev.dur, st.outro);
      const a = st.prev ? U.ease.sine(st.lt / S.transSec) : U.ease.sine(st.lt / 1.6);
      drawOne(st.shot, st.lt, a * st.outro);
      /* один тёплый источник света */
      ctx.save(); ctx.globalCompositeOperation = 'screen';
      const rad = 260 + 80 * R.env(t), g = ctx.createRadialGradient(lamp.x, lamp.y, 0, lamp.x, lamp.y, rad);
      g.addColorStop(0, U.css(S.light, 0.22 + 0.25 * R.env(t))); g.addColorStop(1, U.css(S.light, 0));
      ctx.fillStyle = g; ctx.fillRect(lamp.x - rad, lamp.y - rad, rad * 2, rad * 2);
      ctx.restore();
    },
    particleClip() { return [box.x - 40, box.y - 40, box.w + 80, box.h + 80]; },
  };
};
})();
