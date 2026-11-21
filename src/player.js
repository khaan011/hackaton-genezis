/* Послевкусие — проигрывание воспоминания синхронно с фрагментом песни и сохранение в видео. */
(function () {
'use strict';
const PV = (globalThis.PV = globalThis.PV || {});
const U = PV.U;

let AC = null;
function audioCtx() {
  if (!AC) { const C = globalThis.AudioContext || globalThis.webkitAudioContext; AC = C ? new C() : null; }
  return AC;
}

class Player {
  constructor(canvas, renderer, audioBuffer, opts = {}) {
    this.canvas = canvas; this.r = renderer; this.buf = audioBuffer || null; this.opts = opts;
    canvas.width = Math.round(renderer.W * renderer.scale); canvas.height = Math.round(renderer.H * renderer.scale);
    this.ctx = canvas.getContext('2d');
    this.t = 0; this.playing = false; this.raf = 0; this.onTick = opts.onTick || null;
    this.draw(0);
  }
  get duration() { return this.r.duration; }
  draw(t) { this.r.drawFrame(this.ctx, t); if (this.onTick) this.onTick(t, this.duration); }
  play() {
    if (this.playing) return;
    if (this.t >= this.duration - 0.05) this.t = 0;
    this.playing = true;
    const ac = this.buf ? audioCtx() : null;
    if (ac) {
      if (ac.state === 'suspended') ac.resume();
      this.gain = ac.createGain();
      this.src = ac.createBufferSource(); this.src.buffer = this.buf;
      this.src.connect(this.gain).connect(ac.destination);
      const now = ac.currentTime, left = this.duration - this.t;
      this.gain.gain.setValueAtTime(0.0001, now);
      this.gain.gain.linearRampToValueAtTime(this.duckLevel || 1, now + (this.t < 0.1 ? 0.9 : 0.25));
      this.gain.gain.setValueAtTime(this.duckLevel || 1, now + Math.max(0.3, left - 1.8));
      this.gain.gain.linearRampToValueAtTime(0.0001, now + left);
      this.src.start(now, Math.min(this.t, this.buf.duration - 0.05));
      this.clock0 = now - this.t;
      this.now = () => ac.currentTime - this.clock0;
    } else {
      const p0 = performance.now() - this.t * 1000;
      this.now = () => (performance.now() - p0) / 1000;
    }
    const loop = () => {
      if (!this.playing) return;
      this.t = this.now();
      if (this.t >= this.duration) { this.t = this.duration; this.draw(this.t); this.pause(); if (this.opts.onEnd) this.opts.onEnd(); return; }
      this.draw(this.t);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }
  pause() {
    this.playing = false;
    cancelAnimationFrame(this.raf);
    if (this.src) { try { this.src.stop(); } catch (e) { /* уже остановлен */ } this.src.disconnect(); this.src = null; }
  }
  seek(t) { const was = this.playing; this.pause(); this.t = U.clamp(t, 0, this.duration); this.draw(this.t); if (was) this.play(); }
  duck(on) {
    this.duckLevel = on ? 0.22 : 1;
    const ac = audioCtx();
    if (this.gain && ac) this.gain.gain.setTargetAtTime(this.duckLevel, ac.currentTime, 0.25);
  }
  destroy() { this.pause(); }
}

async function decodeBlob(blob) {
  if (!blob) return null;
  const ac = audioCtx();
  if (!ac) return null;
  const ab = await blob.arrayBuffer();
  return await new Promise((res, rej) => { const p = ac.decodeAudioData(ab, res, rej); if (p && p.then) p.then(res, rej); });
}

function pickMime() {
  const list = ['video/mp4;codecs=avc1.42E01F,mp4a.40.2', 'video/mp4;codecs=avc1.4D401F,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a', 'video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4'];
  if (!globalThis.MediaRecorder) return null;
  return list.find((m) => MediaRecorder.isTypeSupported(m)) || '';
}

/* MediaRecorder пишет WebM без длительности: дописываем элемент Duration в Segment › Info,
   чтобы плееры показывали длину и умели перематывать */
function fixWebmDuration(u8, durationMs) {
  const vint = (p) => { const b = u8[p]; let len = 1, mask = 0x80; while (len <= 8 && !(b & mask)) { mask >>= 1; len++; } if (len > 8) return null; let v = b & (mask - 1); for (let i = 1; i < len; i++) v = v * 256 + u8[p + i]; return { len, v, unknown: v === Math.pow(2, 7 * len) - 1 }; };
  const eid = (p) => { const b = u8[p]; let len = 1, mask = 0x80; while (len <= 4 && !(b & mask)) { mask >>= 1; len++; } let id = 0; for (let i = 0; i < len; i++) id = id * 256 + u8[p + i]; return { len, id }; };
  try {
    let p = 0;
    const h = eid(p); if (h.id !== 0x1a45dfa3) return null;
    const hs = vint(p + h.len); p += h.len + hs.len + hs.v;
    const s = eid(p); if (s.id !== 0x18538067) return null;
    const ss = vint(p + s.len); p += s.len + ss.len;
    while (p < u8.length) {
      const c = eid(p), cs = vint(p + c.len);
      if (!cs) return null;
      const d0 = p + c.len + cs.len, d1 = d0 + cs.v;
      if (c.id === 0x1549a966) {
        for (let q = d0; q < d1;) {
          const e = eid(q), es = vint(q + e.len);
          if (e.id === 0x4489) { const dv = new DataView(u8.buffer, u8.byteOffset + q + e.len + es.len, es.v); if (es.v === 8) dv.setFloat64(0, durationMs); else if (es.v === 4) dv.setFloat32(0, durationMs); return u8; }
          q += e.len + es.len + es.v;
        }
        const dur = new Uint8Array(11); dur[0] = 0x44; dur[1] = 0x89; dur[2] = 0x88; new DataView(dur.buffer).setFloat64(3, durationMs);
        const size = new Uint8Array(8); size[0] = 0x01; let v = cs.v + 11; for (let i = 7; i >= 1; i--) { size[i] = v % 256; v = Math.floor(v / 256); }
        const out = new Uint8Array(u8.length + 11 + 8 - cs.len);
        let o = 0;
        out.set(u8.subarray(0, p + c.len), o); o += p + c.len;
        out.set(size, o); o += 8;
        out.set(u8.subarray(d0, d1), o); o += d1 - d0;
        out.set(dur, o); o += 11;
        out.set(u8.subarray(d1), o);
        return out;
      }
      if (cs.unknown) return null;
      p = d1;
    }
  } catch (e) { /* оставим файл как есть */ }
  return null;
}

/* запись видео в реальном времени: холст + фрагмент песни */
async function exportVideo(renderer, audioBuffer, onProgress) {
  const mime = pickMime();
  if (mime === null) throw new Error('Этот браузер не умеет записывать видео. Откройте дневник в Chrome, Edge или Safari.');
  const c = document.createElement('canvas');
  c.width = Math.round(renderer.W * renderer.scale); c.height = Math.round(renderer.H * renderer.scale);
  const ctx = c.getContext('2d');
  renderer.drawFrame(ctx, 0);
  const stream = c.captureStream(30);
  const ac = audioCtx();
  let src = null;
  if (audioBuffer && ac) {
    if (ac.state === 'suspended') await ac.resume();
    const dest = ac.createMediaStreamDestination(), g = ac.createGain();
    src = ac.createBufferSource(); src.buffer = audioBuffer;
    src.connect(g).connect(dest);
    const D = renderer.duration, now = ac.currentTime + 0.15;
    g.gain.setValueAtTime(0.0001, now); g.gain.linearRampToValueAtTime(1, now + 0.9);
    g.gain.setValueAtTime(1, now + D - 1.8); g.gain.linearRampToValueAtTime(0.0001, now + D);
    dest.stream.getAudioTracks().forEach((tr) => stream.addTrack(tr));
  }
  const rec = new MediaRecorder(stream, { mimeType: mime || undefined, videoBitsPerSecond: 6_000_000, audioBitsPerSecond: 160_000 });
  const chunks = [];
  rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
  const stopped = new Promise((res) => { rec.onstop = res; });
  rec.start(500);
  const D = renderer.duration;
  let t0;
  if (src) { t0 = ac.currentTime + 0.15; src.start(t0); }
  else t0 = performance.now() / 1000;
  const now = () => (src ? ac.currentTime : performance.now() / 1000) - t0;
  await new Promise((resolve) => {
    const step = () => {
      const t = Math.max(0, now());
      renderer.drawFrame(ctx, Math.min(t, D));
      if (onProgress) onProgress(Math.min(1, t / D));
      if (t >= D + 0.2) return resolve();
      if (document.hidden) setTimeout(step, 33); else requestAnimationFrame(step);
    };
    step();
  });
  rec.stop();
  await stopped;
  if (src) { try { src.stop(); } catch (e) { /* ok */ } }
  stream.getTracks().forEach((tr) => tr.stop());
  const type = (rec.mimeType || mime || 'video/webm').split(';')[0];
  let blob = new Blob(chunks, { type });
  if (/webm/.test(type)) {
    const fixed = fixWebmDuration(new Uint8Array(await blob.arrayBuffer()), D * 1000);
    if (fixed) blob = new Blob([fixed], { type });
  }
  return { blob, ext: /mp4/.test(type) ? 'mp4' : 'webm' };
}

PV.Player = { Player, decodeBlob, exportVideo, audioCtx, pickMime, fixWebmDuration };
})();
