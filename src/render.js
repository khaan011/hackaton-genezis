/* Послевкусие — ядро рендера воспоминания: вертикальная страница 1080×1920.
   Постоянное (одинаково для всех дней): бумага, сетка, дата сверху, название и подпись снизу,
   печать дня справа внизу, дорожка песни. Переменное отдаётся художественному режиму (regs.js). */
(function () {
'use strict';
const PV = (globalThis.PV = globalThis.PV || {});
const U = PV.U;

const W = 1080, H = 1920;
const LAY = { M: 72, TOP: 168, IMG_B: 1420, CAP_Y: 1544, TITLE_B: 1706, SEAL: [940, 1650, 70], TRACK_Y: 1790, META_Y: 1852 };
const FONT = { serif: '"PV Serif", Georgia, "Times New Roman", serif', sans: '"PV Sans", "Helvetica Neue", Arial, sans-serif', mono: '"PV Mono", "Courier New", monospace' };

const canvas = (w, h) => PV.Img.makeCanvas(w, h);

function cover(ctx, img, dx, dy, dw, dh, focus = [0.5, 0.5], zoom = 1, pan = [0, 0]) {
  const iw = img.width, ih = img.height;
  if (!iw || !ih || dw <= 0 || dh <= 0) return;
  const scale = Math.max(dw / iw, dh / ih) * Math.max(1, zoom);
  const sw = dw / scale, sh = dh / scale;
  const sx = U.clamp(focus[0] * iw - sw / 2 + pan[0] * sw, 0, iw - sw), sy = U.clamp(focus[1] * ih - sh / 2 + pan[1] * sh, 0, ih - sh);
  ctx.drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh);
}
function setFont(ctx, fam, size, weight = 400, style = 'normal') { ctx.font = `${style} ${weight} ${size}px ${FONT[fam]}`; }
function setSpacing(ctx, px) { if ('letterSpacing' in ctx) ctx.letterSpacing = px + 'px'; }
function wrap(ctx, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean);
  const lines = []; let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (!line || ctx.measureText(test).width <= maxW) line = test; else { lines.push(line); line = w; }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const keep = lines.slice(0, maxLines);
    let last = lines.slice(maxLines - 1).join(' ');
    while (last.length > 1 && ctx.measureText(last + '…').width > maxW) last = last.slice(0, -1);
    keep[maxLines - 1] = last.replace(/[\s,.;:]+$/, '') + '…';
    return keep;
  }
  return lines;
}
/* текст «пишется»: символы появляются слева направо, следующий проявляется */
function writeOn(ctx, text, x, y, p) {
  const n = text.length, k = U.clamp(p) * n, full = Math.floor(k);
  if (full > 0) ctx.fillText(text.slice(0, full), x, y);
  if (full < n && k > full) {
    const w = ctx.measureText(text.slice(0, full)).width, a = ctx.globalAlpha;
    ctx.globalAlpha = a * (k - full);
    ctx.fillText(text[full], x + w, y);
    ctx.globalAlpha = a;
  }
}
function writeLines(ctx, lines, x, yLast, lh, p) {
  const total = lines.reduce((s, l) => s + l.length, 0) || 1;
  let done = 0, y = yLast - (lines.length - 1) * lh;
  for (const ln of lines) {
    const lp = (p * total - done) / Math.max(1, ln.length);
    if (lp > 0) writeOn(ctx, ln, x, y, lp);
    done += ln.length; y += lh;
  }
}
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
/* попиксельная тонировка: насыщенность, контраст, раздельное тонирование теней и света */
function grade(img, w, h, S, opts = {}) {
  const c = canvas(w, h), ctx = c.getContext('2d', { willReadFrequently: true });
  if (opts.draw) opts.draw(ctx, w, h); else ctx.drawImage(img, 0, 0, w, h);
  const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data;
  const sat = opts.sat != null ? opts.sat : S.sat, con = opts.contrast != null ? opts.contrast : S.contrast;
  const sh = opts.shadowTint || S.shadowTint, hi = opts.highlightTint || S.highlightTint;
  const shK = opts.shadowK != null ? opts.shadowK : S.shadowK, hiK = opts.highlightK != null ? opts.highlightK : S.highlightK;
  const lift = opts.lift || 0, gain = opts.gain || 1, fn = opts.fn;
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i], g = d[i + 1], b = d[i + 2];
    const l = (0.2126 * r + 0.7152 * g + 0.0722 * b);
    r = l + (r - l) * sat; g = l + (g - l) * sat; b = l + (b - l) * sat;
    r = 128 + (r - 128) * con; g = 128 + (g - 128) * con; b = 128 + (b - 128) * con;
    const ln = U.clamp(l / 255), ws = (1 - ln) * (1 - ln) * shK, wh = ln * ln * hiK;
    r += (sh[0] - r) * ws + (hi[0] - r) * wh; g += (sh[1] - g) * ws + (hi[1] - g) * wh; b += (sh[2] - b) * ws + (hi[2] - b) * wh;
    r = r * gain * (1 - lift) + 255 * lift; g = g * gain * (1 - lift) + 255 * lift; b = b * gain * (1 - lift) + 255 * lift;
    if (fn) { const o = fn(r, g, b, ln); r = o[0]; g = o[1]; b = o[2]; }
    d[i] = r; d[i + 1] = g; d[i + 2] = b;
  }
  ctx.putImageData(id, 0, 0);
  return c;
}
/* мягкая маска краёв */
function feather(src, radius) {
  const c = canvas(src.width, src.height), ctx = c.getContext('2d');
  ctx.drawImage(src, 0, 0);
  const m = canvas(src.width, src.height), mc = m.getContext('2d');
  if ('filter' in mc) { mc.filter = `blur(${radius}px)`; mc.fillStyle = '#000'; mc.fillRect(radius * 1.6, radius * 1.6, src.width - radius * 3.2, src.height - radius * 3.2); }
  else { mc.fillStyle = '#000'; mc.fillRect(0, 0, src.width, src.height); }
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(m, 0, 0);
  return c;
}
function blurred(src, radius, scale = 0.5) {
  const c = canvas(src.width * scale, src.height * scale), ctx = c.getContext('2d');
  if ('filter' in ctx) ctx.filter = `blur(${radius * scale}px)`;
  ctx.drawImage(src, 0, 0, c.width, c.height);
  return c;
}

class Renderer {
  /* day: {style S, text T, title, date, number, photos: [{bmp, a}], music: {env, envRate, beats, beatStrength, bpm, keyName, label, dur}} */
  constructor(day, opts = {}) {
    this.day = day; this.S = day.style; this.T = day.text;
    this.scale = opts.scale || 0.5;
    this.quality = opts.quality || (this.scale >= 0.9 ? 'high' : 'preview');
    this.music = day.music || { env: [], envRate: 20, beats: [], beatStrength: [], bpm: this.S.bpm };
    this.photos = day.photos;
    this.W = W; this.H = H; this.LAY = LAY;
    this.ready = false;
  }
  async prepare(onProgress) {
    const S = this.S;
    this.reg = PV.Regs[S.register](this);
    this.buildTimeline();
    this.paper = this.makePaper();
    this.grain = this.makeGrain();
    this.vig = S.vignette > 0.02 ? this.makeVignette() : null;
    this.parts = this.makeParticles();
    this.layers = [];
    for (let i = 0; i < this.photos.length; i++) {
      if (onProgress) onProgress(i / this.photos.length);
      this.layers[i] = await this.reg.prepPhoto(i);
      await U.sleep(0);
    }
    if (this.reg.prepare) await this.reg.prepare();
    if (onProgress) onProgress(1);
    this.ready = true;
  }

  /* ---------- тайм-лайн: длина кадра = целое число долей ---------- */
  buildTimeline() {
    const S = this.S, n = Math.max(1, this.photos.length);
    let shot = S.shotSec;
    const pause = S.pauseSec || 0, intro = S.introSec, outro = S.outroSec;
    const len = (k, sh) => intro + k * sh + Math.max(0, k - 1) * pause + outro;
    let k = n;
    while (len(k, shot) > 45 && shot / 2 >= 1.5) shot /= 2;
    while (len(k, shot) > 45 && k > 1) k--;
    let total = k;
    while (len(total, shot) < 16) total++;
    this.shotSec = shot;
    this.shots = [];
    let t = intro;
    for (let j = 0; j < total; j++) { this.shots.push({ j, pi: j % k, variant: Math.floor(j / k), start: t, dur: shot }); t += shot + pause; }
    this.shotsEnd = t - pause;
    this.duration = this.shotsEnd + outro;
    this.capOf = new Array(total).fill(null);
    if (this.day.captions) {
      /* сцены из текста: у каждой сцены своя реплика, она звучит один раз — при первом показе сцены */
      this.shots.forEach((sh, j) => { if (sh.variant === 0) this.capOf[j] = this.day.captions[sh.pi] || null; });
    } else {
      const caps = PV.Text.pickCaptions(this.T, Math.min(total, 6));
      caps.forEach((c, i) => { this.capOf[Math.min(total - 1, Math.round(i * total / caps.length))] = c; });
    }
  }
  shotIndex(t) {
    const s = this.shots;
    if (!s.length || t < s[0].start) return -1;
    for (let i = s.length - 1; i >= 0; i--) if (t >= s[i].start) return i;
    return -1;
  }

  /* ---------- музыка во времени ---------- */
  env(t) {
    const m = this.music, e = m.env;
    if (!e || !e.length) return 0.5;
    const x = U.clamp(t * (m.envRate || 20), 0, e.length - 1), i = Math.floor(x), f = x - i;
    return e[i] + ((e[Math.min(e.length - 1, i + 1)]) - e[i]) * f;
  }
  beatInfo(t) {
    const b = this.music.beats || [];
    let lo = 0, hi = b.length - 1, idx = -1;
    while (lo <= hi) { const mid = (lo + hi) >> 1; if (b[mid] <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1; }
    if (idx < 0) return { i: -1, since: t, str: 0 };
    return { i: idx, since: t - b[idx], str: (this.music.beatStrength || [])[idx] || 0.6 };
  }
  pulse(t, decay = 6) { const bi = this.beatInfo(t); return bi.i < 0 ? 0 : Math.exp(-bi.since * decay) * (0.35 + 0.65 * bi.str); }

  /* ---------- цвета текста по фону ---------- */
  pageColor() { return this.S.bg || this.S.paper; }
  inkColor() { const bg = this.pageColor(); return U.luma(bg) < 0.5 ? [240, 235, 225] : [30, 27, 24]; }
  /* приглушённый цвет служебных строк: 72% цвета текста и 28% цвета бумаги — читается на любом фоне режима */
  softColor() { return U.mix(this.inkColor(), this.pageColor(), 0.28); }

  /* ---------- постоянные слои ---------- */
  makePaper() {
    const s = this.scale, S = this.S, c = canvas(W * s, H * s), ctx = c.getContext('2d', { willReadFrequently: true });
    const base = this.pageColor();
    ctx.fillStyle = U.css(base); ctx.fillRect(0, 0, c.width, c.height);
    const r = U.rng(S.seed ^ 0x9e37);
    for (let i = 0; i < 16; i++) {
      const x = r() * c.width, y = r() * c.height, rad = (200 + r() * 520) * s;
      const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
      const k = S.bg ? 0.4 : 1; g.addColorStop(0, r() < 0.5 ? `rgba(0,0,0,${0.035 * k})` : `rgba(255,255,255,${0.05 * k})`); g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
    const dark = U.luma(base) < 0.5;
    ctx.lineWidth = Math.max(0.6, 0.9 * s);
    for (let i = 0; i < 260; i++) {
      const x = r() * c.width, y = r() * c.height, l = (16 + r() * 60) * s, a = r() * Math.PI;
      ctx.strokeStyle = dark ? `rgba(255,255,255,${0.02 + r() * 0.03})` : `rgba(90,70,50,${0.025 + r() * 0.04})`;
      ctx.beginPath(); ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 10 * s, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 10 * s, x + Math.cos(a) * l, y + Math.sin(a) * l);
      ctx.stroke();
    }
    const id = ctx.getImageData(0, 0, c.width, c.height), d = id.data;
    for (let i = 0; i < d.length; i += 4) { const v = (r() - 0.5) * 9; d[i] += v; d[i + 1] += v; d[i + 2] += v; }
    ctx.putImageData(id, 0, 0);
    return c;
  }
  makeGrain() {
    const size = 256, c = canvas(size, size), ctx = c.getContext('2d'), id = ctx.createImageData(size, size), r = U.rng(this.S.seed ^ 0x51f);
    for (let i = 0; i < id.data.length; i += 4) { const g = U.clamp(128 + r.gauss() * 44, 0, 255); id.data[i] = id.data[i + 1] = id.data[i + 2] = g; id.data[i + 3] = 255; }
    ctx.putImageData(id, 0, 0);
    return c;
  }
  makeVignette() {
    const s = this.scale, c = canvas(W * s, H * s), ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(W * s / 2, H * s * 0.45, H * s * 0.28, W * s / 2, H * s * 0.45, H * s * 0.78);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, `rgba(0,0,0,${0.55 * this.S.vignette})`);
    ctx.fillStyle = g; ctx.fillRect(0, 0, c.width, c.height);
    return c;
  }
  drawPaper(ctx) { ctx.drawImage(this.paper, 0, 0, W, H); }
  drawGrain(ctx, t, amount) {
    const a = amount != null ? amount : this.S.grain;
    if (a <= 0.01) return;
    const frame = Math.floor(t * 24), r = U.rng((this.S.seed + frame * 7919) >>> 0);
    const tile = 300, ox = -r() * tile, oy = -r() * tile;
    ctx.save(); ctx.globalCompositeOperation = 'overlay'; ctx.globalAlpha = U.clamp(a);
    for (let y = oy; y < H; y += tile) for (let x = ox; x < W; x += tile) ctx.drawImage(this.grain, x, y, tile, tile);
    ctx.restore();
  }

  /* ---------- частицы: погода и детали из текста ---------- */
  makeParticles() {
    const S = this.S, ov = S.overlays || {}, r = U.rng(S.seed ^ 0xabc), P = {};
    const warm = (S.palette || []).filter((c) => { const h = U.rgb2lch(c)[2]; return h < 100 || h > 340; });
    const leafCols = warm.length >= 2 ? warm.map((c) => U.lch2rgb([U.clamp(U.rgb2lch(c)[0], 40, 70), Math.max(45, U.rgb2lch(c)[1]), U.rgb2lch(c)[2]])) : [[201, 130, 43], [164, 71, 28], [217, 165, 58], [150, 92, 32]];
    const n = (base, v) => Math.round(base * v);
    if (ov.leaves) P.leaves = Array.from({ length: n(26, ov.leaves) + 4 }, () => ({ x: r() * W, y: r() * H, z: 0.5 + r() * 0.5, ph: r() * 6.3, rot: r() * 6.3, vr: (r() - 0.5) * 1.6, size: 20 + r() * 22, col: r.pick(leafCols) }));
    if (ov.snow) P.snow = Array.from({ length: n(150, ov.snow) }, () => ({ x: r() * W, y: r() * H, z: 0.35 + r() * 0.65, ph: r() * 6.3 }));
    if (ov.rain) P.rain = Array.from({ length: n(150, ov.rain) }, () => ({ x: r() * W * 1.3, y: r() * H, z: 0.4 + r() * 0.6 }));
    if (ov.glassRain) {
      P.drops = Array.from({ length: n(150, ov.glassRain) }, () => ({ x: r() * W, y: r() * H, rad: 1.5 + Math.pow(r(), 2.2) * 9 }));
      P.streaks = Array.from({ length: n(14, ov.glassRain) }, () => ({ x: r() * W, y: r() * H, sp: 40 + r() * 120, len: 60 + r() * 160, ph: r() * 10 }));
    }
    if (ov.petals) P.petals = Array.from({ length: n(30, ov.petals) }, () => ({ x: r() * W, y: r() * H, z: 0.5 + r() * 0.5, ph: r() * 6.3, rot: r() * 6.3, size: 7 + r() * 8 }));
    if (ov.dust) P.dust = Array.from({ length: n(90, ov.dust) }, () => ({ x: r() * W, y: r() * H, z: 0.4 + r() * 0.6, ph: r() * 6.3 }));
    if (ov.bokeh) {
      const cols = [S.light, [255, 210, 150], [170, 200, 255], S.accent];
      P.bokeh = Array.from({ length: n(22, ov.bokeh) }, () => ({ x: r() * W, y: LAY.TOP + r() * (LAY.IMG_B - LAY.TOP), rad: 18 + r() * 60, col: r.pick(cols), ph: r() * 6.3, a: 0.15 + r() * 0.3 }));
    }
    if (ov.fog) P.fog = Array.from({ length: 4 }, (_, i) => ({ y: LAY.TOP + (0.2 + 0.2 * i) * (LAY.IMG_B - LAY.TOP), sp: 8 + r() * 14, ph: r() * W, rad: 380 + r() * 260 }));
    if (ov.stars) P.stars = Array.from({ length: n(80, ov.stars) }, () => ({ x: r() * W, y: LAY.TOP + r() * (LAY.IMG_B - LAY.TOP) * 0.45, ph: r() * 6.3, s: 0.8 + r() * 1.8 }));
    if (ov.confetti) {
      const cols = [...(S.palette || []).slice(0, 4), [255, 255, 255], [20, 20, 24]];
      P.confetti = Array.from({ length: n(70, ov.confetti) }, () => ({ x: r() * W, y: r() * H, z: 0.5 + r() * 0.5, ph: r() * 6.3, rot: r() * 6.3, col: r.pick(cols), w: 8 + r() * 10, h: 4 + r() * 6 }));
    }
    return P;
  }
  drawParticles(ctx, t, clip) {
    const P = this.parts, S = this.S, ov = S.overlays || {};
    if (!P || !Object.keys(P).length) return;
    const e = this.env(t);
    const pa = this.reg.particleAlpha ? this.reg.particleAlpha(t) : 1;
    if (pa <= 0.001) return;
    ctx.save();
    ctx.globalAlpha = pa;
    if (clip) { ctx.beginPath(); ctx.rect(clip[0], clip[1], clip[2], clip[3]); ctx.clip(); }
    const wrapY = (y) => U.mod(y + 80, H + 160) - 80;
    if (P.fog) {
      for (const f of P.fog) {
        const x = U.mod(f.ph + t * f.sp, W + f.rad * 2) - f.rad;
        const g = ctx.createRadialGradient(x, f.y, 0, x, f.y, f.rad);
        g.addColorStop(0, `rgba(240,240,245,${0.3 * ov.fog})`); g.addColorStop(1, 'rgba(240,240,245,0)');
        ctx.fillStyle = g; ctx.fillRect(x - f.rad, f.y - f.rad, f.rad * 2, f.rad * 2);
      }
    }
    if (P.stars) {
      for (const s of P.stars) { const a = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * 2.2 + s.ph)); ctx.fillStyle = `rgba(255,250,235,${a * 0.9})`; ctx.fillRect(s.x, s.y, s.s, s.s); }
    }
    if (P.bokeh) {
      ctx.globalCompositeOperation = 'screen';
      for (const b of P.bokeh) {
        const x = b.x + Math.sin(t * 0.13 + b.ph) * 30, y = b.y + Math.cos(t * 0.11 + b.ph) * 18, rad = b.rad * (1 + 0.08 * e);
        const g = ctx.createRadialGradient(x, y, rad * 0.55, x, y, rad);
        g.addColorStop(0, U.css(b.col, b.a * (0.7 + 0.5 * e))); g.addColorStop(0.85, U.css(b.col, b.a * 0.55)); g.addColorStop(1, U.css(b.col, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, rad, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (P.dust) {
      ctx.globalCompositeOperation = 'lighter';
      for (const d of P.dust) {
        const x = U.mod(d.x + Math.sin(t * 0.3 * d.z + d.ph) * 40 + t * 6, W), y = wrapY(d.y - t * 9 * d.z);
        const a = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.7 + d.ph));
        ctx.fillStyle = `rgba(255,236,190,${a * ov.dust})`;
        ctx.beginPath(); ctx.arc(x, y, 1.2 + 1.8 * d.z, 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (P.snow) {
      const snowCol = U.luma(this.pageColor()) > 0.6 ? [255, 255, 255] : [250, 250, 255];
      for (const s of P.snow) {
        const y = wrapY(s.y + t * (26 + 40 * s.z)), x = U.mod(s.x + Math.sin(t * 0.8 * s.z + s.ph) * 22 + t * 5, W);
        ctx.fillStyle = U.css(snowCol, 0.55 + 0.4 * s.z);
        ctx.beginPath(); ctx.arc(x, y, 1.2 + 3.4 * s.z, 0, Math.PI * 2); ctx.fill();
      }
    }
    if (P.rain) {
      ctx.lineCap = 'round';
      for (const d of P.rain) {
        const sp = 900 + 600 * d.z, y = wrapY(d.y + t * sp), x = U.mod(d.x - y * 0.25, W * 1.3) - W * 0.15;
        ctx.strokeStyle = `rgba(200,210,225,${0.16 + 0.22 * d.z})`; ctx.lineWidth = 1 + d.z;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 12 * d.z, y - 48 * d.z - 20); ctx.stroke();
      }
    }
    if (P.drops) {
      for (const d of P.drops) {
        ctx.fillStyle = 'rgba(10,14,24,0.22)'; ctx.beginPath(); ctx.arc(d.x, d.y, d.rad, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(230,236,255,${0.28 + 0.2 * e})`; ctx.beginPath(); ctx.arc(d.x - d.rad * 0.3, d.y - d.rad * 0.35, d.rad * 0.45, 0, Math.PI * 2); ctx.fill();
      }
      ctx.lineCap = 'round';
      for (const s of P.streaks) {
        const y = U.mod(s.y + (t + s.ph) * s.sp, H + s.len) - s.len;
        const g = ctx.createLinearGradient(s.x, y - s.len, s.x, y);
        g.addColorStop(0, 'rgba(220,230,255,0)'); g.addColorStop(1, 'rgba(220,230,255,0.4)');
        ctx.strokeStyle = g; ctx.lineWidth = 2.2;
        ctx.beginPath(); ctx.moveTo(s.x, y - s.len); ctx.quadraticCurveTo(s.x + 3, y - s.len / 2, s.x - 1, y); ctx.stroke();
      }
    }
    if (P.leaves) {
      for (const l of P.leaves) {
        const y = wrapY(l.y + t * (38 + 46 * l.z)), x = U.mod(l.x + Math.sin(t * 1.1 * l.z + l.ph) * 46 + t * 12, W + 60) - 30;
        const rot = l.rot + t * l.vr + Math.sin(t * 1.3 + l.ph) * 0.6, flip = Math.cos(t * 1.7 * l.z + l.ph);
        ctx.save(); ctx.translate(x, y); ctx.rotate(rot); ctx.scale(1, 0.35 + 0.65 * Math.abs(flip));
        const sz = l.size * l.z;
        ctx.fillStyle = U.css(flip > 0 ? l.col : U.mix(l.col, [60, 30, 10], 0.25), 0.92);
        ctx.beginPath(); ctx.moveTo(-sz, 0); ctx.quadraticCurveTo(0, -sz * 0.6, sz, 0); ctx.quadraticCurveTo(0, sz * 0.6, -sz, 0); ctx.fill();
        ctx.strokeStyle = U.css(U.mix(l.col, [50, 25, 10], 0.5), 0.6); ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(-sz * 1.15, 0); ctx.lineTo(sz * 0.9, 0); ctx.stroke();
        ctx.restore();
      }
    }
    if (P.petals) {
      for (const p of P.petals) {
        const y = wrapY(p.y + t * (30 + 30 * p.z)), x = U.mod(p.x + Math.sin(t * 0.9 + p.ph) * 50 + t * 16, W);
        ctx.save(); ctx.translate(x, y); ctx.rotate(p.rot + t * 0.9); ctx.scale(1, 0.5 + 0.5 * Math.abs(Math.cos(t * 1.6 + p.ph)));
        ctx.fillStyle = 'rgba(248,200,214,0.9)'; ctx.beginPath(); ctx.ellipse(0, 0, p.size, p.size * 0.6, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
      }
    }
    if (P.confetti) {
      for (const c of P.confetti) {
        const y = wrapY(c.y + t * (70 + 70 * c.z)), x = U.mod(c.x + Math.sin(t * 1.4 + c.ph) * 30, W);
        ctx.save(); ctx.translate(x, y); ctx.rotate(c.rot + t * (2 + c.z * 3)); ctx.scale(1, Math.cos(t * 3 + c.ph));
        ctx.fillStyle = U.css(c.col, 0.95); ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
        ctx.restore();
      }
    }
    ctx.restore();
  }

  /* ---------- постоянная рамка дневника ---------- */
  drawChrome(ctx, t) {
    const S = this.S, d = this.day, ink = this.inkColor(), soft = this.softColor();
    ctx.save();
    ctx.globalAlpha = U.clamp(t / 0.8);
    setFont(ctx, 'mono', 30, 700); setSpacing(ctx, 2);
    ctx.fillStyle = U.css(soft, 1); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillText(`${U.dateStamp(d.date)} · ${U.weekday(d.date)}`, LAY.M, 112);
    ctx.textAlign = 'right';
    ctx.fillText(`№ ${String(d.number || 1).padStart(3, '0')}`, W - LAY.M, 112);
    ctx.textAlign = 'left'; setSpacing(ctx, 0);
    ctx.restore();
    { const a = this.titleAlpha(t); if (a > 0.001) { ctx.save(); ctx.globalAlpha *= a; this.drawTitle(ctx, t); ctx.restore(); } }
    const m = this.music;
    let sealCol = S.register === 'ma' ? [194, 65, 45] : S.accent;
    {
      const [sl, sc, sh] = U.rgb2lch(sealCol), pl = U.rgb2lch(this.pageColor())[0];
      if (Math.abs(sl - pl) < 28) sealCol = U.lch2rgb([pl > 50 ? Math.max(18, pl - 34) : Math.min(92, pl + 40), Math.max(sc, 30), sh]);
    }
    PV.Seal.draw(ctx, LAY.SEAL[0], LAY.SEAL[1], LAY.SEAL[2], {
      env: m.env, bpm: m.bpm || S.bpm, E: S.mood.E, color: sealCol, paper: this.pageColor(), tod: S.tod,
      number: d.number || 1, style: S.register === 'ma' ? 'red' : 'ink', t, level: this.env(t) * S.breathe, progress: U.clamp((t - 0.5) / 0.7), seed: S.seed,
    });
    this.drawTrack(ctx, t);
  }
  titleLayout(ctx) {
    if (this._title) return this._title;
    const S = this.S, struct = S.type.voice === 'struct', maxW = W - 2 * LAY.M - 170;
    const text = S.type.upper ? String(this.day.title || '').toUpperCase() : String(this.day.title || '');
    let size = struct ? 52 : 66, lines;
    for (;;) {
      if (struct) { setFont(ctx, 'sans', size, 700); setSpacing(ctx, 3); } else { setFont(ctx, 'serif', size, 500); setSpacing(ctx, 0); }
      lines = wrap(ctx, text, maxW, 2);
      const fits = !lines.some((l) => l.endsWith('…'));
      if (fits || size <= 40) break;
      size -= 4;
    }
    setSpacing(ctx, 0);
    return (this._title = { lines, size, struct, lh: Math.round(size * (struct ? 1.16 : 1.12)) });
  }
  drawTitle(ctx, t) {
    const L = this.titleLayout(ctx);
    ctx.save();
    if (L.struct) { setFont(ctx, 'sans', L.size, 700); setSpacing(ctx, 3); } else setFont(ctx, 'serif', L.size, 500);
    ctx.fillStyle = U.css(this.inkColor()); ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    writeLines(ctx, L.lines, LAY.M, LAY.TITLE_B, L.lh, U.clamp((t - 0.25) / 1.5));
    setSpacing(ctx, 0);
    ctx.restore();
  }
  drawTrack(ctx, t) {
    const m = this.music, S = this.S, D = this.duration, x0 = LAY.M, x1 = W - LAY.M, y = LAY.TRACK_Y;
    const ink = this.inkColor(), soft = this.softColor();
    const N = 220, show = U.clamp((t - 0.15) / 1.3), p = U.clamp(t / D);
    const pts = [];
    for (let i = 0; i <= N; i++) { const u = i / N; pts.push([x0 + u * (x1 - x0), this.env(u * D)]); }
    const stroke = (from, to, col, a, amp) => {
      if (to <= from) return;
      ctx.strokeStyle = U.css(col, a); ctx.beginPath();
      const i0 = Math.floor(from * N), i1 = Math.ceil(to * N);
      for (let i = i0; i <= i1; i++) { const [x, e] = pts[i]; const yy = y - 4 - e * amp; if (i === i0) ctx.moveTo(x, yy); else ctx.lineTo(x, yy); }
      for (let i = i1; i >= i0; i--) { const [x, e] = pts[i]; ctx.lineTo(x, y + 4 + e * amp * 0.6); }
      ctx.closePath(); ctx.fillStyle = U.css(col, a); ctx.fill();
    };
    ctx.save();
    stroke(0, show, ink, 0.16, 18);
    stroke(0, Math.min(p, show), ink, 0.78, 18);
    if (show > 0.02) {
      const [px, pe] = pts[Math.round(Math.min(p, show) * N)];
      ctx.fillStyle = U.css(S.register === 'ma' ? [194, 65, 45] : S.accent); ctx.beginPath(); ctx.arc(px, y - 4 - pe * 18 * 0.2, 6 + 3 * this.pulse(t), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalAlpha = U.clamp((t - 0.6) / 1);
    setFont(ctx, 'mono', 22, 400); setSpacing(ctx, 1);
    ctx.fillStyle = U.css(soft, 0.95); ctx.textAlign = 'left';
    const bits = [m.label || 'песня дня', `${Math.round(m.bpm || S.bpm)} BPM`];
    if (m.keyName) bits.push(m.keyName);
    let txt = '♪ ' + bits.join('  ·  ');
    while (txt.length > 4 && ctx.measureText(txt).width > x1 - x0) txt = txt.slice(0, -2) + '…';
    ctx.fillText(txt, x0, LAY.META_Y);
    setSpacing(ctx, 0);
    ctx.restore();
  }

  /* ---------- подписи из текста дня ---------- */
  drawCaptions(ctx, t) {
    const k = this.shotIndex(t);
    if (k < 0 || t > this.shotsEnd + 0.3) return;
    const shot = this.shots[k], text = this.capOf[k];
    if (!text) return;
    const lt = t - shot.start, dur = shot.dur;
    const hold = Math.max(1.1, dur * 0.72);
    const env = U.smooth(0.15, 0.55, lt) * (1 - U.smooth(hold, hold + 0.45, lt));
    if (env <= 0.001) return;
    ctx.save(); ctx.globalAlpha *= env;
    const own = this.reg.drawCaption && this.reg.drawCaption(ctx, t, text, lt, dur, shot);
    ctx.restore();
    if (own) return;
    ctx.save(); ctx.globalAlpha *= env;
    const S = this.S, struct = S.type.voice === 'struct';
    const fadeOut = 1 - U.smooth(dur - 0.45, dur, lt);
    ctx.save();
    ctx.globalAlpha = fadeOut;
    ctx.fillStyle = U.css(this.inkColor(), 0.92);
    ctx.textBaseline = 'alphabetic';
    if (struct) {
      setFont(ctx, 'mono', 30, 400); setSpacing(ctx, 1);
      const lines = wrap(ctx, text, W - 2 * LAY.M, 2);
      const p = U.clamp(lt * 26 / Math.max(1, text.length));
      writeLines(ctx, lines, LAY.M, LAY.CAP_Y, 40, p);
      if (Math.floor(t * 3) % 2 === 0 || p < 1) {
        const last = lines[lines.length - 1];
        const shown = p >= 1 ? last : '';
        ctx.fillRect(LAY.M + ctx.measureText(shown).width + 6, LAY.CAP_Y - 24, 14, 28);
      }
    } else {
      setFont(ctx, 'serif', 44, 400, 'italic');
      const lines = wrap(ctx, text, W - 2 * LAY.M, 2);
      writeLines(ctx, lines, LAY.M, LAY.CAP_Y, 54, U.clamp(lt / Math.min(2.4, dur * 0.55)));
    }
    setSpacing(ctx, 0);
    ctx.restore();
    ctx.restore();
  }
  /* название дня: в сценах из текста — только в начале и в конце, а не всё видео */
  titleAlpha(t) {
    if (!this.day.captions || !this.shots.length) return 1;
    const s0 = this.shots[0], endFirst = s0.start + s0.dur;
    const head = 1 - U.smooth(endFirst - 0.7, endFirst - 0.1, t);
    const tail = U.smooth(this.shotsEnd - 0.6, this.shotsEnd + 0.2, t);
    return Math.max(head, tail);
  }

  /* ---------- кадр целиком ---------- */
  drawFrame(ctx, t) {
    const s = this.scale;
    ctx.setTransform(s, 0, 0, s, 0, 0);
    ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingQuality = 'high';
    this.reg.background(ctx, t);
    this.reg.shots(ctx, t);
    if (!this.reg.ownParticles) this.drawParticles(ctx, t, this.reg.particleClip ? this.reg.particleClip(t) : [0, LAY.TOP - 20, W, LAY.IMG_B - LAY.TOP + 40]);
    if (this.reg.after) this.reg.after(ctx, t);
    if (this.vig) ctx.drawImage(this.vig, 0, 0, W, H);
    this.drawGrain(ctx, t);
    this.drawCaptions(ctx, t);
    this.drawChrome(ctx, t);
  }
}

PV.Render = { Renderer, W, H, LAY, FONT, cover, setFont, setSpacing, wrap, writeOn, writeLines, roundRect, grade, feather, blurred, canvas };
})();
