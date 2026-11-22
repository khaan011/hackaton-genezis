/* Послевкусие — аудиоанализ в браузере: темп и доли, громкость, яркость, лад (мажор/минор),
   выбор фрагмента песни. В дневник сохраняется только фрагмент, а не песня целиком. */
(function () {
'use strict';
const PV = (globalThis.PV = globalThis.PV || {});
const U = PV.U;

/* ---------- БПФ ---------- */
const FFTS = {};
function makeFFT(N) {
  const levels = Math.round(Math.log2(N));
  const cos = new Float32Array(N / 2), sin = new Float32Array(N / 2);
  for (let i = 0; i < N / 2; i++) { cos[i] = Math.cos(2 * Math.PI * i / N); sin[i] = Math.sin(2 * Math.PI * i / N); }
  const rev = new Uint32Array(N);
  for (let i = 0; i < N; i++) { let x = i, y = 0; for (let j = 0; j < levels; j++) { y = (y << 1) | (x & 1); x >>>= 1; } rev[i] = y; }
  return function fft(re, im) {
    for (let i = 0; i < N; i++) { const j = rev[i]; if (j > i) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; } }
    for (let size = 2; size <= N; size <<= 1) {
      const half = size >> 1, step = N / size;
      for (let i = 0; i < N; i += size) {
        for (let j = i, k = 0; j < i + half; j++, k += step) {
          const l = j + half, c = cos[k], s = sin[k];
          const tre = re[l] * c + im[l] * s, tim = im[l] * c - re[l] * s;
          re[l] = re[j] - tre; im[l] = im[j] - tim; re[j] += tre; im[j] += tim;
        }
      }
    }
  };
}
const getFFT = (N) => FFTS[N] || (FFTS[N] = makeFFT(N));
const HANN = {};
const hann = (N) => { if (HANN[N]) return HANN[N]; const w = new Float32Array(N); for (let i = 0; i < N; i++) w[i] = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / (N - 1)); return (HANN[N] = w); };

/* профили тональностей Крумхансла — Кесслер */
const MAJ = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MIN = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
const NOTE_RU = ['до', 'до-диез', 'ре', 'ми-бемоль', 'ми', 'фа', 'фа-диез', 'соль', 'ля-бемоль', 'ля', 'си-бемоль', 'си'];
/* как принято называть: ре-бемоль мажор, но до-диез минор; ля-бемоль мажор, но соль-диез минор */
const NOTE_MAJ = ['до', 'ре-бемоль', 'ре', 'ми-бемоль', 'ми', 'фа', 'фа-диез', 'соль', 'ля-бемоль', 'ля', 'си-бемоль', 'си'];
const NOTE_MIN = ['до', 'до-диез', 'ре', 'ми-бемоль', 'ми', 'фа', 'фа-диез', 'соль', 'соль-диез', 'ля', 'си-бемоль', 'си'];

function pearson(a, b) {
  const n = a.length; let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; num += x * y; da += x * x; db += y * y; }
  return num / Math.sqrt(da * db + 1e-12);
}

function toMono(channels) {
  if (channels.length === 1) return channels[0];
  const n = channels[0].length, out = new Float32Array(n);
  for (const d of channels) for (let i = 0; i < n; i++) out[i] += d[i];
  for (let i = 0; i < n; i++) out[i] /= channels.length;
  return out;
}
function decimate(x, sr) {
  if (sr < 32000) return { x, sr };
  const n = x.length >> 1, y = new Float32Array(n);
  for (let i = 0; i < n; i++) y[i] = 0.5 * (x[2 * i] + x[2 * i + 1]);
  return { x: y, sr: sr / 2 };
}
function rmsEnvelope(x, sr, rate) {
  const hop = Math.max(1, Math.round(sr / rate)), n = Math.floor(x.length / hop), env = new Float32Array(n);
  for (let i = 0; i < n; i++) { let s = 0; const o = i * hop; for (let j = 0; j < hop; j++) { const v = x[o + j]; s += v * v; } env[i] = Math.sqrt(s / hop); }
  return { env, rate: sr / hop };
}

/* фрагмент с наибольшей энергией, не с самого начала песни */
function chooseExcerpt(env, rate, dur, len) {
  if (dur <= len + 4) return 0;
  const win = Math.round(len * rate);
  const ps = new Float64Array(env.length + 1);
  for (let i = 0; i < env.length; i++) ps[i + 1] = ps[i] + env[i];
  const minS = Math.round(Math.min(dur * 0.12, dur - len - 1) * rate), maxS = env.length - win;
  let best = -1, bs = minS;
  for (let s = minS; s <= maxS; s += 2) { const m = ps[s + win] - ps[s]; if (m > best) { best = m; bs = s; } }
  return bs / rate;
}

/* полосы для функции атак: бочка, бас, середина, присутствие, тарелки */
const BANDS = [[30, 160], [160, 420], [420, 1000], [1000, 2600], [2600, 6000], [6000, 11000]];

function spectral(x, sr, a, b) {
  const N = 1024, H = 512, fft = getFFT(N), win = hann(N);
  const i0 = Math.max(0, Math.floor(a * sr)), i1 = Math.min(x.length - N, Math.floor(b * sr));
  const frames = Math.max(0, Math.floor((i1 - i0) / H));
  const re = new Float32Array(N), im = new Float32Array(N);
  let prev = new Float32Array(N / 2), cur = new Float32Array(N / 2);
  const nb = BANDS.length;
  const bandFlux = Array.from({ length: nb }, () => new Float32Array(frames));
  const centroid = new Float32Array(frames), rms = new Float32Array(frames), hfr = new Float32Array(frames);
  const binHz = sr / N, k5 = Math.floor(5000 / binHz);
  const bandOf = new Int8Array(N / 2).fill(-1), bandCount = new Float32Array(nb);
  for (let k = 1; k < N / 2; k++) { const f = k * binHz; for (let j = 0; j < nb; j++) if (f >= BANDS[j][0] && f < BANDS[j][1]) { bandOf[k] = j; bandCount[j]++; } }
  const bf = new Float32Array(nb);
  for (let f = 0; f < frames; f++) {
    const o = i0 + f * H; let e = 0;
    for (let i = 0; i < N; i++) { const v = x[o + i]; re[i] = v * win[i]; im[i] = 0; e += v * v; }
    rms[f] = Math.sqrt(e / N);
    fft(re, im);
    bf.fill(0);
    let num = 0, den = 0, hf = 0, tot = 0;
    for (let k = 1; k < N / 2; k++) {
      const mag = Math.hypot(re[k], im[k]), lm = Math.log1p(100 * mag);
      cur[k] = lm;
      const j = bandOf[k];
      if (j >= 0) { const d = lm - prev[k]; if (d > 0) bf[j] += d; }
      num += k * binHz * mag; den += mag;
      const p = mag * mag; tot += p; if (k >= k5) hf += p;
    }
    for (let j = 0; j < nb; j++) bandFlux[j][f] = f === 0 ? 0 : bf[j] / Math.max(1, bandCount[j]);
    centroid[f] = den > 0 ? num / den : 0; hfr[f] = tot > 0 ? hf / tot : 0;
    const t = prev; prev = cur; cur = t;
  }
  return { bandFlux, centroid, rms, hfr, fr: sr / H, t0: i0 / sr };
}

/* новизна по каждой полосе (минус локальное среднее), нормированная, затем сумма полос */
function novelty(bandFlux, fr) {
  const n = bandFlux[0].length, w = Math.max(1, Math.round(fr * 0.5)), out = new Float32Array(n);
  const tmp = new Float32Array(n), ps = new Float64Array(n + 1);
  for (const flux of bandFlux) {
    for (let i = 0; i < n; i++) ps[i + 1] = ps[i] + flux[i];
    let s2 = 0;
    for (let i = 0; i < n; i++) { const a = Math.max(0, i - w), b = Math.min(n, i + w + 1); const v = Math.max(0, flux[i] - (ps[b] - ps[a]) / (b - a)); tmp[i] = v; s2 += v * v; }
    const sd = Math.sqrt(s2 / Math.max(1, n));
    if (sd < 1e-6) continue;
    for (let i = 0; i < n; i++) out[i] += Math.min(tmp[i] / sd, 6);
  }
  /* лёгкое сглаживание против дрожания целых лагов */
  const sm = new Float32Array(n);
  for (let i = 0; i < n; i++) sm[i] = 0.25 * (out[i - 1] || 0) + 0.5 * out[i] + 0.25 * (out[i + 1] || 0);
  let mx = 0; for (const v of sm) if (v > mx) mx = v;
  if (mx > 0) for (let i = 0; i < n; i++) sm[i] /= mx;
  return sm;
}

function autocorr(nov, L) { let s = 0; const n = nov.length; for (let i = 0; i + L < n; i++) s += nov[i] * nov[i + L]; return s / Math.max(1, n - L); }

function phaseScore(nov, P, ph) { let s = 0; for (let t = ph; t < nov.length; t += P) { const i = Math.round(t); if (i < nov.length) s += nov[i] + 0.5 * (nov[i - 1] || 0) + 0.5 * (nov[i + 1] || 0); } return s; }
function bestPhase(nov, P) { let best = -1, ph = 0; for (let p = 0; p < P; p += 0.5) { const s = phaseScore(nov, P, p); if (s > best) { best = s; ph = p; } } return ph; }

/* темп: автокорреляция функции атак + выбор «октавы» по плотности атак.
   Тихая разреженная песня с хэтом на восьмые читается медленной, плотная — быстрой. */
function tempo(nov, fr, density) {
  const minL = Math.max(2, Math.floor(fr * 60 / 200)), maxL = Math.ceil(fr * 60 / 50);
  const ac = new Float32Array(2 * maxL + 4);
  for (let L = Math.max(1, minL - 1); L <= Math.min(2 * maxL + 2, nov.length - 2); L++) ac[L] = autocorr(nov, L);
  let best = -1, bestL = minL;
  for (let L = minL; L <= maxL; L++) {
    const bpm = 60 * fr / L, w = Math.exp(-0.5 * Math.pow(Math.log2(bpm / 100) / 1.2, 2));
    if (ac[L] * w > best) { best = ac[L] * w; bestL = L; }
  }
  const localMax = (L) => { let b = Math.round(L); for (const c of [b - 1, b + 1]) if (c >= 1 && ac[c] > ac[b]) b = c; return b; };
  const cands = [bestL];
  const half = localMax(bestL / 2), dbl = localMax(bestL * 2);
  if (60 * fr / half <= 200 && ac[half] >= 0.55 * ac[bestL]) cands.push(half);
  if (60 * fr / dbl >= 50 && dbl <= 2 * maxL && ac[dbl] >= 0.55 * ac[bestL]) cands.push(dbl);
  const pref = 64 + 70 * U.clamp(density);
  let L = bestL, bd = Infinity;
  for (const c of cands) { const d = Math.abs(Math.log2(60 * fr / c / pref)); if (d < bd) { bd = d; L = c; } }
  const y0 = ac[L - 1], y1 = ac[L], y2 = ac[L + 1], den = y0 - 2 * y1 + y2;
  const period = L + (den !== 0 ? U.clamp(0.5 * (y0 - y2) / den, -0.5, 0.5) : 0);
  let mean = 0, cnt = 0; for (let k = minL; k <= maxL; k++) { mean += ac[k]; cnt++; }
  mean /= cnt;
  return { bpm: 60 * fr / period, period, conf: U.clamp((y1 / (mean + 1e-9) - 1) / 1.5), pref };
}

function chroma(x, sr, a, b) {
  const N = 4096, H = 2048, fft = getFFT(N), win = hann(N);
  const i0 = Math.max(0, Math.floor(a * sr)), i1 = Math.min(x.length - N, Math.floor(b * sr));
  /* средние частоты (мелодия, аккорды) и бас отдельно: бас подсказывает тонику */
  const mid = new Float64Array(12), bass = new Float64Array(12), binHz = sr / N;
  const kLo = Math.ceil(52 / binHz), kSplit = Math.floor(220 / binHz), kHi = Math.min(N / 2 - 2, Math.floor(2000 / binHz));
  const pc = new Int8Array(N / 2);
  for (let k = kLo; k <= kHi; k++) pc[k] = U.mod(Math.round(12 * Math.log2(k * binHz / 440)) + 9, 12);
  const re = new Float32Array(N), im = new Float32Array(N), mag = new Float32Array(N / 2);
  for (let o = i0; o < i1; o += H) {
    for (let i = 0; i < N; i++) { re[i] = x[o + i] * win[i]; im[i] = 0; }
    fft(re, im);
    for (let k = kLo - 1; k <= kHi + 1; k++) mag[k] = Math.hypot(re[k], im[k]);
    for (let k = kLo; k <= kHi; k++) if (mag[k] > mag[k - 1] && mag[k] >= mag[k + 1]) (k < kSplit ? bass : mid)[pc[k]] += Math.sqrt(mag[k]);
  }
  const sm = mid.reduce((s, v) => s + v, 0) || 1, sb = bass.reduce((s, v) => s + v, 0) || 1;
  const ch = new Float64Array(12);
  for (let i = 0; i < 12; i++) ch[i] = mid[i] / sm + 0.9 * bass[i] / sb;
  ch.bass = Array.from(bass, (v) => v / sb);
  return ch;
}

function detectKey(ch) {
  /* корреляция с профилями Крумхансла для всех 24 тональностей; бас на тонике — подсказка,
     без неё параллельные мажор и минор (до мажор / ля минор) почти неразличимы */
  const bass = ch.bass || new Array(12).fill(1 / 12), BW = 0.3;
  const cand = [];
  for (let t = 0; t < 12; t++) {
    const rMaj = [], rMin = [];
    for (let p = 0; p < 12; p++) { rMaj.push(MAJ[U.mod(p - t, 12)]); rMin.push(MIN[U.mod(p - t, 12)]); }
    const cj = pearson(ch, rMaj), cn = pearson(ch, rMin);
    cand.push({ mode: 'major', tonic: t, corr: cj, score: cj + BW * bass[t] });
    cand.push({ mode: 'minor', tonic: t, corr: cn, score: cn + BW * bass[t] });
  }
  cand.sort((a, b) => b.score - a.score);
  const best = cand[0];
  /* параллельная тональность (общий звукоряд) проверяется явно, а не только когда она — ближайший соперник:
     иначе ноктюрн си-бемоль минор уверенно становится ре-бемоль мажором */
  const relOf = (c) => (c.mode === 'major' ? U.mod(c.tonic + 9, 12) : U.mod(c.tonic + 3, 12));

  const rival = cand.find((c) => c.mode !== best.mode);
  let conf = U.clamp(Math.abs(best.score - rival.score) / 0.12);
  /* параллельная тональность (общий звукоряд) близко — честно снижаем уверенность */
  const rel = relOf(best), relBest = cand.find((c) => c.mode !== best.mode && c.tonic === rel);
  /* общий звукоряд: чем ближе параллельная тональность, тем ниже уверенность — даже если она не ближайший соперник */
  if (relBest) conf = Math.min(conf, U.clamp((best.score - relBest.score) / 0.3));
  if (relBest && (rival === relBest || Math.abs(best.score - relBest.score) < 0.1)) conf = Math.min(conf, bass[best.tonic] - bass[rel] > 0.08 ? 0.75 : 0.45);
  /* тоника под вопросом, если соседняя по квинте тональность почти так же вероятна */
  const twin = cand.find((c) => c.mode === best.mode && c.tonic !== best.tonic);
  if (twin && best.score - twin.score < 0.1) conf = Math.min(conf, 0.45);
  const { mode, tonic } = best;
  return { mode, tonic, modeConf: conf, keyName: `${(mode === 'major' ? NOTE_MAJ : NOTE_MIN)[tonic]} ${mode === 'major' ? 'мажор' : 'минор'}`, keyCorr: best.corr };
}

function percentile(arr, p) { const a = Array.from(arr).sort((x, y) => x - y); return a.length ? a[Math.min(a.length - 1, Math.floor(p * a.length))] : 0; }

/* ---------- главный анализ по сырым отсчётам (работает и в node) ---------- */
function analyzeSamples(channels, sr0, opts = {}) {
  const len = opts.excerptLen || 45;
  const mono = toMono(channels);
  const dur = mono.length / sr0;
  const { x, sr } = decimate(mono, sr0);
  const { env, rate } = rmsEnvelope(x, sr, 20);
  let start = opts.start != null ? U.clamp(opts.start, 0, Math.max(0, dur - 5)) : chooseExcerpt(env, rate, dur, len);
  const exLen = Math.min(len, dur - start);
  const a = Math.max(0, start - 6), b = Math.min(dur, start + exLen + 4);
  const sp = spectral(x, sr, a, b);
  const nov = novelty(sp.bandFlux, sp.fr);

  /* признаки фрагмента */
  const f0 = Math.max(0, Math.floor((start - sp.t0) * sp.fr)), f1 = Math.min(sp.rms.length, Math.floor((start + exLen - sp.t0) * sp.fr));
  let eSum = 0, cSum = 0; const dbs = [];
  for (let f = f0; f < f1; f++) { const e = sp.rms[f]; eSum += e; cSum += sp.centroid[f] * e; dbs.push(20 * Math.log10(e + 1e-9)); }
  const meanRms = eSum / Math.max(1, f1 - f0);
  const meanDb = 20 * Math.log10(meanRms + 1e-9);
  const centroidHz = eSum > 0 ? cSum / eSum : 1500;
  const dyn = percentile(dbs, 0.9) - percentile(dbs, 0.15);
  /* частота атак */
  let mean = 0, sd = 0; const seg = nov.subarray(f0, f1);
  for (const v of seg) mean += v; mean /= Math.max(1, seg.length);
  for (const v of seg) sd += (v - mean) * (v - mean); sd = Math.sqrt(sd / Math.max(1, seg.length));
  const thr = mean + 0.8 * sd, minGap = Math.round(0.1 * sp.fr);
  let onsets = 0, last = -1e9;
  for (let i = 1; i < seg.length - 1; i++) if (seg[i] > thr && seg[i] >= seg[i - 1] && seg[i] >= seg[i + 1] && i - last >= minGap) { onsets++; last = i; }
  const onsetRate = onsets / Math.max(1, exLen);
  const loud = U.norm(meanDb, -30, -8), onsetN = U.norm(onsetRate, 0.4, 4.5);

  const tp = tempo(nov, sp.fr, 0.7 * onsetN + 0.3 * loud);
  const ph = bestPhase(nov, tp.period);
  const beatSec = 60 / tp.bpm;
  const firstBeat = sp.t0 + ph / sp.fr;
  if (opts.start == null) { const k = Math.round((start - firstBeat) / beatSec); start = Math.max(0, firstBeat + k * beatSec); }
  const key = detectKey(chroma(x, sr, start, start + exLen));
  const hfRatio = percentile(sp.hfr.subarray(f0, f1), 0.5);

  return {
    source: 'audio', duration: dur, start, excerptLen: exLen,
    bpm: +tp.bpm.toFixed(1), bpmConf: +tp.conf.toFixed(2), beatSec, firstBeat,
    mode: key.mode, modeConf: +key.modeConf.toFixed(2), keyName: key.keyName,
    meanDb: +meanDb.toFixed(1), dynamics: +dyn.toFixed(1), centroidHz: Math.round(centroidHz), hfRatio: +hfRatio.toFixed(4),
    onsetRate: +onsetRate.toFixed(2),
    loud: +loud.toFixed(3),
    onsetN: +onsetN.toFixed(3),
    brightness: +U.norm(centroidHz, 700, 3200).toFixed(3),
    vintage: 0,
    _env: env, _envRate: rate, _nov: nov, _novT0: sp.t0, _novFr: sp.fr,
  };
}

/* доли, сила долей и огибающая громкости относительно начала фрагмента t0 */
function finalizeExcerpt(A, t0, dur) {
  const beats = [], strength = [];
  const k0 = Math.ceil((t0 - A.firstBeat) / A.beatSec - 1e-6);
  for (let t = A.firstBeat + k0 * A.beatSec; t < t0 + dur; t += A.beatSec) {
    beats.push(+(t - t0).toFixed(3));
    let s = 0;
    if (A._nov) { const c = Math.round((t - A._novT0) * A._novFr); for (let i = c - 2; i <= c + 2; i++) if (A._nov[i] > s) s = A._nov[i]; }
    strength.push(+s.toFixed(2));
  }
  const env = [];
  if (A._env) {
    const i0 = Math.floor(t0 * A._envRate), i1 = Math.min(A._env.length, Math.ceil((t0 + dur) * A._envRate));
    const raw = Array.from(A._env.subarray(i0, i1));
    const p95 = percentile(raw, 0.95) || 1;
    for (let i = 0; i < raw.length; i++) {
      let s = 0, n = 0; for (let j = i - 3; j <= i + 3; j++) if (j >= 0 && j < raw.length) { s += raw[j]; n++; }
      env.push(+U.clamp(s / n / p95).toFixed(3));
    }
  }
  return { beats, beatStrength: strength, env, envRate: A._envRate || 20 };
}

/* ---------- песня по описанию (ссылка без файла) ---------- */
function lookupArtist(s) {
  const q = String(s || '').toLowerCase().replace(/ё/g, 'е');
  if (!q.trim()) return null;
  let best = null;
  for (const [name, genre, year, tempo, mood] of PV.Lex.artists) {
    const n = name.replace(/ё/g, 'е');
    const re = new RegExp('(^|[^\\p{L}])' + n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^\\p{L}])', 'u');
    if (re.test(q) && (!best || n.length > best.name.length)) best = { name, genre, year, tempo, mood };
  }
  return best;
}

function describe(d) {
  const g = PV.Lex.genres[d.genre] || null;
  const tempoBpm = { slow: 70, mid: 100, fast: 128 };
  const bpm = tempoBpm[d.tempo] || (g ? Math.round(68 + g.energy * 66) : 96);
  const mode = d.mood === 'light' ? 'major' : d.mood === 'dark' ? 'minor' : g ? (g.valence >= 0.5 ? 'major' : 'minor') : 'major';
  const beatSec = 60 / bpm, dur = 45;
  const beats = [], beatStrength = [], env = [];
  for (let t = 0, i = 0; t < dur; t += beatSec, i++) { beats.push(+t.toFixed(3)); beatStrength.push(i % 4 === 0 ? 1 : i % 2 === 0 ? 0.7 : 0.45); }
  for (let i = 0; i < dur * 20; i++) {
    const t = i / 20, ph = U.fract(t / beatSec);
    env.push(+U.clamp(0.5 + 0.2 * Math.sin(2 * Math.PI * t / (beatSec * 16)) + 0.25 * Math.exp(-ph * 6) * (g ? g.energy : 0.5)).toFixed(3));
  }
  const tempoWord = { slow: 'медленная', mid: 'средний темп', fast: 'быстрая' }[d.tempo] || 'темп по жанру';
  const moodWord = { light: 'светлая', dark: 'грустная' }[d.mood] || 'характер по жанру';
  return {
    source: 'described', bpm, beatSec, firstBeat: 0, mode, modeConf: d.mood && d.mood !== 'unknown' ? 0.8 : 0.4, keyName: null,
    loud: g ? g.energy : U.norm(bpm, 60, 150), onsetN: U.norm(bpm, 60, 150) * 0.8, brightness: g ? g.bright : 0.5,
    warmth: g ? g.warmth : null, genre: d.genre || null, year: d.year || null, vintage: 0,
    beats, beatStrength, env, envRate: 20, excerptLen: dur,
    describeLabel: [tempoWord, moodWord, g ? g.label : null, d.year || null].filter(Boolean).join(', '),
  };
}

/* ---------- срез MP3 по границам кадров, без перекодирования ---------- */
function mp3Slice(u8, t0, t1) {
  let pos = 0;
  if (u8[0] === 0x49 && u8[1] === 0x44 && u8[2] === 0x33) {
    const size = ((u8[6] & 0x7f) << 21) | ((u8[7] & 0x7f) << 14) | ((u8[8] & 0x7f) << 7) | (u8[9] & 0x7f);
    pos = 10 + size + (u8[5] & 0x10 ? 10 : 0);
  }
  const BR1 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0];
  const BR2 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0];
  const SR = { 3: [44100, 48000, 32000], 2: [22050, 24000, 16000], 0: [11025, 12000, 8000] };
  let t = 0, startByte = -1, endByte = -1, startT = 0, first = true, frames = 0;
  const isSync = (p) => p + 1 < u8.length && u8[p] === 0xff && (u8[p + 1] & 0xe0) === 0xe0;
  while (pos + 4 <= u8.length) {
    if (isSync(pos)) {
      const ver = (u8[pos + 1] >> 3) & 3, layer = (u8[pos + 1] >> 1) & 3, bri = (u8[pos + 2] >> 4) & 15, sri = (u8[pos + 2] >> 2) & 3, pad = (u8[pos + 2] >> 1) & 1;
      if (ver !== 1 && layer === 1 && bri > 0 && bri < 15 && sri < 3) {
        const sr = SR[ver][sri], br = (ver === 3 ? BR1 : BR2)[bri] * 1000;
        const spf = ver === 3 ? 1152 : 576;
        const flen = Math.floor((ver === 3 ? 144 : 72) * br / sr) + pad;
        if (flen >= 24 && (pos + flen + 1 >= u8.length || isSync(pos + flen))) {
          if (first) {
            first = false;
            let tag = '';
            for (let i = pos + 4; i < Math.min(pos + 64, u8.length); i++) tag += String.fromCharCode(u8[i]);
            if (/Xing|Info|VBRI/.test(tag)) { pos += flen; continue; }
          }
          if (startByte < 0 && t >= t0) { startByte = pos; startT = t; }
          if (t >= t1) { endByte = pos; break; }
          t += spf / sr; pos += flen; frames++;
          continue;
        }
      }
    }
    pos++;
  }
  if (startByte < 0 || frames < 10) return null;
  if (endByte < 0) endByte = pos;
  return { data: u8.slice(startByte, endByte), t0: startT, t1: Math.min(t, t1) };
}

function isMp3(bytes, file) {
  if (file && /mpeg|mp3/i.test(file.type || '')) return true;
  if (file && /\.mp3$/i.test(file.name || '')) return true;
  if (bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return true;
  return bytes[0] === 0xff && (bytes[1] & 0xe6) === 0xe2;
}

function encodeWAV(chs, sr) {
  const nCh = chs.length, n = chs[0].length, buf = new ArrayBuffer(44 + n * nCh * 2), v = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + n * nCh * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); v.setUint16(22, nCh, true); v.setUint32(24, sr, true); v.setUint32(28, sr * nCh * 2, true);
  v.setUint16(32, nCh * 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * nCh * 2, true);
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < nCh; c++) { const s = Math.max(-1, Math.min(1, chs[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Blob([buf], { type: 'audio/wav' });
}

/* ---------- браузерные обёртки ---------- */
async function decode(arrayBuffer) {
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const ctx = new OAC(1, 2, 44100);
  return await ctx.decodeAudioData(arrayBuffer.slice(0));
}

async function loadSong(file) {
  const ab = await file.arrayBuffer();
  const bytes = new Uint8Array(ab);
  const audio = await decode(ab);
  return { file, bytes, audio, mp3: isMp3(bytes, file) };
}

function analyzeSong(song, opts) {
  const chs = [];
  for (let c = 0; c < Math.min(2, song.audio.numberOfChannels); c++) chs.push(song.audio.getChannelData(c));
  return analyzeSamples(chs, song.audio.sampleRate, opts);
}

/* фрагмент для дневника: MP3 режем по кадрам, остальное — в WAV */
function makeExcerpt(song, start, dur) {
  if (song.mp3) {
    const s = mp3Slice(song.bytes, start, start + dur);
    if (s) return { blob: new Blob([s.data], { type: 'audio/mpeg' }), t0: s.t0, dur: s.t1 - s.t0, mime: 'audio/mpeg', ext: 'mp3' };
  }
  const a = song.audio, sr = a.sampleRate;
  const i0 = Math.floor(start * sr), i1 = Math.min(a.length, Math.floor((start + dur) * sr));
  const chs = [];
  for (let c = 0; c < Math.min(2, a.numberOfChannels); c++) chs.push(a.getChannelData(c).subarray(i0, i1));
  return { blob: encodeWAV(chs, sr), t0: i0 / sr, dur: (i1 - i0) / sr, mime: 'audio/wav', ext: 'wav' };
}

/* ссылки на музыкальные сервисы → официальный встраиваемый плеер */
function parseLink(url) {
  url = String(url || '').trim();
  if (!url) return null;
  let m;
  if ((m = /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/)|youtu\.be\/|music\.youtube\.com\/watch\?(?:.*&)?v=)([\w-]{6,})/i.exec(url))) return { service: 'YouTube', url, embed: `https://www.youtube.com/embed/${m[1]}` };
  if ((m = /open\.spotify\.com\/(?:intl-\w+\/)?(track|album|playlist)\/(\w+)/i.exec(url))) return { service: 'Spotify', url, embed: `https://open.spotify.com/embed/${m[1]}/${m[2]}`, height: 152 };
  if ((m = /music\.yandex\.\w+\/album\/(\d+)\/track\/(\d+)/i.exec(url))) return { service: 'Яндекс Музыка', url, embed: `https://music.yandex.ru/iframe/#track/${m[2]}/${m[1]}`, height: 180 };
  if (/soundcloud\.com\//i.test(url)) return { service: 'SoundCloud', url, embed: `https://w.soundcloud.com/player/?url=${encodeURIComponent(url)}`, height: 166 };
  if ((m = /music\.apple\.com\/(.+)/i.exec(url))) return { service: 'Apple Music', url, embed: `https://embed.music.apple.com/${m[1]}`, height: 175 };
  if (/^https?:\/\//i.test(url)) return { service: 'ссылка', url, embed: null };
  return null;
}

PV.Audio = { analyzeSamples, finalizeExcerpt, describe, lookupArtist, mp3Slice, isMp3, encodeWAV, decode, loadSong, analyzeSong, makeExcerpt, parseLink, getFFT, NOTE_RU };
})();
