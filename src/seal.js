/* Послевкусие — «печать дня»: круглый знак, контур которого нарисован огибающей громкости песни.
   Число зубцов = темп/8, рваность края = энергия, знак в центре = время суток. Постоянный элемент дневника. */
(function () {
'use strict';
const PV = (globalThis.PV = globalThis.PV || {});
const U = PV.U;

function envAt(env, u) {
  if (!env || !env.length) return 0.5;
  const x = U.mod(u, 1) * env.length, i = Math.floor(x), f = x - i;
  /* сглаживаем, чтобы контур был плавным */
  let s = 0, n = 0;
  for (let k = -4; k <= 4; k++) { const j = U.mod(i + k, env.length); s += env[j] * (1 - Math.abs(k) / 5); n += 1 - Math.abs(k) / 5; }
  const a = s / n;
  const j2 = U.mod(i + 1, env.length);
  return U.lerp(a, env[j2] * 0.3 + a * 0.7, f);
}

function sealPath(ctx, cx, cy, R, o, rot) {
  const N = 120, spikes = Math.max(5, Math.round((o.bpm || 90) / 8));
  const jag = R * (0.012 + 0.05 * (o.E == null ? 0.5 : o.E));
  ctx.beginPath();
  for (let i = 0; i <= N; i++) {
    const u = i / N, th = u * Math.PI * 2 + rot;
    const r = R * (0.8 + 0.17 * envAt(o.env, u)) + jag * Math.sin(u * Math.PI * 2 * spikes + (o.seed || 0) % 7);
    const x = cx + Math.cos(th) * r, y = cy + Math.sin(th) * r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  }
  ctx.closePath();
}

function glyph(ctx, cx, cy, r, tod, col) {
  ctx.fillStyle = col; ctx.strokeStyle = col; ctx.lineWidth = Math.max(1, r * 0.12);
  ctx.beginPath();
  if (tod === 'night') {
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath(); ctx.arc(cx + r * 0.45, cy - r * 0.25, r * 0.85, 0, Math.PI * 2); ctx.fill();
    ctx.globalCompositeOperation = 'source-over';
  } else if (tod === 'evening') {
    ctx.arc(cx, cy + r * 0.25, r, Math.PI, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx - r * 1.5, cy + r * 0.25); ctx.lineTo(cx + r * 1.5, cy + r * 0.25); ctx.stroke();
  } else if (tod === 'morning') {
    ctx.arc(cx, cy + r * 0.25, r, Math.PI, 0); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx - r * 1.5, cy + r * 0.25); ctx.lineTo(cx + r * 1.5, cy + r * 0.25); ctx.stroke();
  } else {
    ctx.arc(cx, cy, r * 0.8, 0, Math.PI * 2); ctx.fill();
  }
}

/* o: {env, bpm, E, color, paper, ink, tod, number, style: 'ink'|'red', t, level, progress, seed} */
function draw(ctx, cx, cy, R, o) {
  const p = o.progress == null ? 1 : U.clamp(o.progress);
  if (p <= 0) return;
  ctx.save();
  const sc = (1.25 - 0.25 * U.ease.outBack(p)) * (1 + 0.035 * (o.level || 0));
  ctx.translate(cx, cy); ctx.scale(sc, sc); ctx.translate(-cx, -cy);
  ctx.globalAlpha *= p;
  const rot = (o.t || 0) * (0.04 + 0.12 * (o.E || 0.4));
  const fill = o.style === 'red' ? [194, 65, 45] : o.color;
  const inner = o.style === 'red' ? o.paper : o.paper;
  sealPath(ctx, cx, cy, R, o, rot);
  ctx.fillStyle = U.css(fill, 0.94);
  ctx.fill();
  if (o.style === 'red') {
    /* фактура штемпеля: пропуски краски */
    const r = U.rng(o.seed || 3);
    ctx.globalCompositeOperation = 'destination-out';
    for (let i = 0; i < 26; i++) {
      const a = r() * Math.PI * 2, d = Math.sqrt(r()) * R * 0.9;
      ctx.globalAlpha = 0.25 + r() * 0.5;
      ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, R * (0.012 + r() * 0.035), 0, Math.PI * 2); ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = p;
  }
  ctx.lineWidth = Math.max(1, R * 0.03);
  ctx.strokeStyle = U.css(inner, 0.85);
  ctx.beginPath(); ctx.arc(cx, cy, R * 0.6, 0, Math.PI * 2); ctx.stroke();
  glyph(ctx, cx, cy - R * 0.12, R * 0.2, o.tod, U.css(inner, 0.95));
  if (o.number != null && R > 30) {
    ctx.fillStyle = U.css(inner, 0.9);
    ctx.font = `700 ${Math.round(R * 0.2)}px "PV Mono", monospace`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'alphabetic';
    ctx.fillText(String(o.number).padStart(3, '0'), cx, cy + R * 0.38);
  }
  ctx.restore();
}

/* маленькая печать для архива (dataURL) */
function icon(o, size = 96) {
  const c = document.createElement('canvas');
  c.width = c.height = size * 2;
  const ctx = c.getContext('2d');
  ctx.scale(2, 2);
  draw(ctx, size / 2, size / 2, size * 0.46, { ...o, t: 0, level: 0, progress: 1 });
  return c.toDataURL('image/png');
}

PV.Seal = { draw, icon };
})();
