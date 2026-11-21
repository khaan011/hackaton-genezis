/* Послевкусие — интерфейс: запись дня, архив, страница дня, папка дня, экспорт и импорт дневника. */
(function () {
'use strict';
const PV = globalThis.PV, U = PV.U;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const stripPriv = (o) => { if (!o) return o; const r = {}; for (const k of Object.keys(o)) if (k[0] !== '_') r[k] = o[k]; return r; };

/* внутри артефакта claude.ai: скачивание через возможность downloads, без микрофона, геолокации и чужих iframe */
const IN_ARTIFACT = !!(globalThis.claude && typeof globalThis.claude.use === 'function');
let dlNS = null;
if (IN_ARTIFACT) {
  document.documentElement.classList.add('in-artifact');
  try { globalThis.claude.use('downloads').then((ns) => { dlNS = ns; }).catch(() => {}); } catch (e) { /* без скачивания */ }
}
const state = { days: [], view: 'archive', day: null, S: null, renderer: null, player: null, audioBuf: null, voiceCtl: null, rec: null, urls: [], form: null };
const newForm = () => ({ photos: [], song: { mode: 'file', loaded: null, A: null, url: '', link: null, describe: { tempo: null, mood: null, genre: null } }, weather: null });

/* ---------- служебное ---------- */
function busy(on, text, p) {
  $('#busy').hidden = !on;
  if (text) $('#busy-text').textContent = text;
  if (p != null) {
    const v = U.clamp(p);
    $('#busy-bar').style.width = Math.round(v * 100) + '%';
    $('#busy').style.setProperty('--p', v.toFixed(3));
    let cur = false;
    $$('#busy-steps li').forEach((li) => {
      const done = v >= +li.dataset.at;
      li.classList.toggle('on', done);
      li.classList.toggle('cur', !done && !cur);
      if (!done) cur = true;
    });
  }
}

/* ---------- послевкусие: интерфейс окрашивается в цвета дня и хранит их оттенок после ухода ---------- */
const rgbVar = (c) => (c ? `${Math.round(c[0])} ${Math.round(c[1])} ${Math.round(c[2])}` : null);
function setGlow(sum, mode) {
  const root = document.documentElement;
  if (!sum) { root.classList.remove('has-glow', 'after'); return; }
  const pal = (sum.palette && sum.palette.length ? sum.palette : [sum.accent]).filter(Boolean);
  const a = sum.accent || pal[0] || [169, 68, 43];
  const g = [a, pal[0] || a, pal[1] || pal[0] || a];
  g.forEach((c, i) => root.style.setProperty(`--g${i + 1}`, rgbVar(c)));
  /* акцент для текста темнее, чтобы читался на бумаге */
  const lch = U.rgb2lch(a), tint = U.lch2rgb([Math.min(lch[0], 48), Math.max(lch[1], 30), lch[2]]);
  root.style.setProperty('--tint', rgbVar(tint));
  root.classList.add('has-glow');
  root.classList.toggle('after', mode === 'after');
}
let toastT = 0;
function toast(msg, ms = 4200) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms); }
async function download(blob, name) {
  if (IN_ARTIFACT) {
    if (!dlNS) { toast('Скачивание в этом окне недоступно. Откройте дневник как обычную страницу (index.html).', 6000); return false; }
    try { await dlNS.save({ filename: name, data: blob }); return true; }
    catch (e) { if (!e || e.code !== 'declined') toast('Файл не сохранён: ' + ((e && e.message) || 'недоступно')); return false; }
  }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  return true;
}
function askConfirm(text, yes = 'Да') {
  return new Promise((res) => {
    $('#dlg-text').textContent = text; $('#dlg-yes').textContent = yes; $('#dlg').hidden = false;
    const done = (v) => { $('#dlg').hidden = true; $('#dlg-yes').onclick = $('#dlg-no').onclick = null; res(v); };
    $('#dlg-yes').onclick = () => done(true); $('#dlg-no').onclick = () => done(false);
  });
}
const objURL = (blob) => { const u = URL.createObjectURL(blob); state.urls.push(u); return u; };
const debounce = (fn, ms) => { let t = 0; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

/* ---------- навигация ---------- */
function go(view) {
  if (state.view === 'day' && view !== 'day') stopDay();
  state.view = view;
  for (const v of ['archive', 'new', 'day', 'about']) $('#v-' + v).hidden = v !== view;
  $$('.nav').forEach((b) => b.classList.toggle('on', b.dataset.go === view));
  if (view !== 'day' && state.day) setGlow(state.day.summary, 'after');
  if (view === 'archive') renderArchive();
  if (view === 'new') { if (!state.form) resetForm(); }
  if (view === 'about') renderAbout();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

/* ---------- архив ---------- */
function sealIcon(d) {
  const s = d.summary || {};
  return PV.Seal.icon({ env: d.track && d.track.env, bpm: d.track && d.track.bpm, E: s.E, color: s.accent || [150, 120, 90], paper: s.paper || [243, 239, 231], tod: s.tod, number: d.number, style: s.register === 'ma' ? 'red' : 'ink', seed: d.seed }, 48);
}
const swatch = (d) => {
  const s = d.summary || {}, reg = PV.Mood.REG[s.register] || PV.Mood.REG.monet;
  const acc = U.hex(s.accent || reg.color), pal = (s.palette || []).map(U.hex);
  return pal.length ? `linear-gradient(90deg, ${pal[0]}, ${acc} 45%, ${acc} 60%, ${pal[1] || pal[0]})` : acc;
};
async function renderArchive() {
  state.urls.forEach((u) => URL.revokeObjectURL(u)); state.urls = [];
  state.days = await PV.Store.all();
  const n = state.days.length;
  const regs = new Set(state.days.map((d) => (d.summary || {}).register).filter(Boolean)).size;
  $('#arch-count').textContent = n ? `${n} ${U.plural(n, 'день', 'дня', 'дней')} · ${regs} ${U.plural(regs, 'настроение', 'настроения', 'настроений')}` : '';
  $('#arch-empty').hidden = n > 0;
  $('#arch-mode').hidden = n === 0;
  if (!state.day && n) setGlow(state.days[state.days.length - 1].summary, 'after');
  /* цвета дневника: каждый день — полоска из его собственной палитры, по порядку дат */
  const strip = $('#arch-strip');
  strip.hidden = n < 2;
  strip.querySelector('.bands').innerHTML = state.days.map((d) => `<button style="background:${swatch(d)}" data-id="${d.id}" title="${esc(d.title)} · ${esc(U.dateLong(d.date))}" aria-label="${esc(d.title)}"></button>`).join('');
  $$('#arch-strip .bands button').forEach((b) => { b.onclick = () => openDayById(b.dataset.id); });
  const grid = $('#arch-grid'), feed = $('#arch-feed');
  grid.innerHTML = ''; feed.innerHTML = '';
  const REG = PV.Mood.REG;
  [...state.days].reverse().forEach((d, i) => {
    const reg = REG[(d.summary || {}).register] || REG.monet;
    const b = document.createElement('button');
    b.className = 'day-card'; b.dataset.id = d.id;
    const rot = ((((d.seed || 0) % 9) + 9) % 9 - 4) * 0.28;
    b.style.cssText = `--rot:${rot.toFixed(2)}deg;--i:${Math.min(i, 12)}`;
    b.innerHTML = `<div class="cover" style="--accent:${U.hex(reg.color)}"><span class="tab"></span>${d.cover ? `<img class="c" alt="" src="${objURL(d.cover)}">` : `<span class="nocover">${esc(reg.short)}</span>`}<span class="glare"></span></div>
      <div class="cap"><div class="t">${esc(d.title)}</div><div class="m"><img alt="" src="${sealIcon(d)}">${esc(U.dateLong(d.date))} · ${esc(reg.short)}</div></div>`;
    b.onclick = () => openDayById(d.id);
    grid.appendChild(b);
  });
  for (const d of state.days) {
    const f = document.createElement('figure');
    f.innerHTML = `${d.cover ? `<img alt="" src="${objURL(d.cover)}">` : ''}<figcaption><b>${esc(d.title)}</b>${esc(U.dateStamp(d.date))}</figcaption>`;
    f.onclick = () => openDayById(d.id);
    feed.appendChild(f);
  }
}
/* карточка-снимок слегка наклоняется за курсором, по ней скользит блик */
function bindTilt() {
  const grid = $('#arch-grid');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || matchMedia('(hover: none)').matches) return;
  grid.addEventListener('pointermove', (e) => {
    const c = e.target.closest('.cover'); if (!c) return;
    const r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width, y = (e.clientY - r.top) / r.height;
    c.style.setProperty('--ry', `${((x - 0.5) * 10).toFixed(2)}deg`); c.style.setProperty('--rx', `${((0.5 - y) * 8).toFixed(2)}deg`);
    c.style.setProperty('--gx', `${(x * 100).toFixed(1)}%`); c.style.setProperty('--gy', `${(y * 100).toFixed(1)}%`);
  });
  grid.addEventListener('pointerout', (e) => {
    const c = e.target.closest('.cover');
    if (c && !c.contains(e.relatedTarget)) { c.style.removeProperty('--rx'); c.style.removeProperty('--ry'); }
  });
}

/* ---------- форма нового дня ---------- */
function resetForm() {
  state.form = newForm();
  $('#f-date').value = U.today();
  $('#f-text').value = '';
  $('#f-thumbs').innerHTML = ''; $('#f-photo-hint').textContent = '';
  $('#f-audio').value = ''; $('#f-audio-info').textContent = ''; $('#f-wave-wrap').hidden = true;
  $('#f-url').value = ''; $('#f-url-info').textContent = '';
  $('#f-artist').value = ''; $('#f-title').value = ''; $('#f-year').value = ''; $('#f-artist-hint').textContent = '';
  $$('.chips button').forEach((b) => b.classList.remove('on'));
  $('#f-weather-info').textContent = '';
  setSongMode('file');
  textHint(); validate();
}
function setSongMode(m) {
  state.form.song.mode = m;
  $$('#f-song-mode button').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  $('#f-song-file').hidden = m !== 'file'; $('#f-song-link').hidden = m !== 'link';
  validate();
}
const textHint = debounce(() => {
  const txt = $('#f-text').value;
  if (txt.trim().length < 12) { $('#f-text-hint').innerHTML = 'Пишите конкретно: какая была погода, какой свет, что звучало, кто был рядом.'; return; }
  const T = PV.Text.analyze(txt, $('#f-date').value);
  const bits = [];
  const TOD = PV.Mood.TOD_RU, SEA = PV.Mood.SEASON_RU;
  if (T.tod) bits.push(TOD[T.tod]);
  bits.push(SEA[T.season] + (T.seasonSource === 'date' ? ' (по дате)' : ''));
  const w = Object.keys(T.weather).filter((k) => T.weather[k]).map((k) => ({ rain: 'дождь', snow: 'снег', sun: 'солнце', wind: 'ветер', fog: 'туман', cold: 'холод', storm: 'гроза', heat: 'жара' }[k]));
  if (w.length) bits.push(w.join(', '));
  if (T.place) bits.push(T.place.nom);
  if (T.who) bits.push(T.who.ins);
  if (T.detail) bits.push(T.detail.nom);
  $('#f-text-hint').innerHTML = 'Система слышит: <b>' + esc(bits.join(' · ')) + '</b>';
}, 350);

async function addPhotos(files) {
  const f = state.form;
  const list = [...files].filter((x) => /^image\//.test(x.type) || /\.(jpe?g|png|webp|heic|gif)$/i.test(x.name)).slice(0, 8 - f.photos.length);
  if (!list.length) return;
  $('#f-photo-hint').textContent = 'Смотрю на свет и цвет…';
  for (const file of list) {
    try {
      const n = await PV.Img.normalizePhoto(file);
      const a = PV.Img.analyzePhoto(n.bitmap, U.hash(file.name + file.size));
      f.photos.push({ blob: n.blob, w: n.width, h: n.height, a });
    } catch (e) { console.warn(e); toast(`Не удалось открыть «${file.name}». Попробуйте JPEG или PNG.`); }
  }
  renderThumbs(); validate();
}
function renderThumbs() {
  const box = $('#f-thumbs');
  (state.thumbUrls || []).forEach((u) => URL.revokeObjectURL(u));
  state.thumbUrls = [];
  box.innerHTML = '';
  state.form.photos.forEach((p, i) => {
    const d = document.createElement('div'); d.className = 'thumb';
    const url = URL.createObjectURL(p.blob); state.thumbUrls.push(url);
    d.innerHTML = `<img alt="" src="${url}"><div class="pal">${p.a.palette.slice(0, 5).map((c) => `<i style="background:${U.hex(c.rgb)}"></i>`).join('')}</div><button aria-label="Убрать фото">×</button>`;
    d.querySelector('button').onclick = () => { state.form.photos.splice(i, 1); renderThumbs(); validate(); };
    box.appendChild(d);
  });
  const n = state.form.photos.length;
  if (!n) { $('#f-photo-hint').textContent = ''; return; }
  const P = PV.Img.mergePhotos(state.form.photos.map((p) => p.a), 1);
  const names = [...new Set(P.palette.slice(0, 3).map((c) => PV.Mood.colorName(c.rgb)))];
  $('#f-photo-hint').innerHTML = `${n} ${U.plural(n, 'фото', 'фото', 'фото')} · преобладают <b>${esc(names.join(', '))}</b> · свет ${P.lum > 0.62 ? 'яркий' : P.lum < 0.3 ? 'тёмный' : 'мягкий'}`;
}

function guessFromFileName(name) {
  const base = name.replace(/\.[^.]+$/, '').replace(/_/g, ' ').trim();
  const m = /^(.+?)\s+[-–—]\s+(.+)$/.exec(base);
  if (m) return { artist: m[1].trim(), title: m[2].trim() };
  return { artist: '', title: base };
}
async function loadAudio(file) {
  const info = $('#f-audio-info');
  info.textContent = 'Слушаю песню: темп, громкость, лад…';
  try {
    const song = await PV.Audio.loadSong(file);
    const A = PV.Audio.analyzeSong(song, { excerptLen: 45 });
    state.form.song.loaded = song; state.form.song.A = A;
    if (!$('#f-artist').value && !$('#f-title').value) { const g = guessFromFileName(file.name); $('#f-artist').value = g.artist; $('#f-title').value = g.title; artistHint(); }
    showAnalysis(); drawWave();
    const sl = $('#f-ex-start');
    sl.max = Math.max(0, A.duration - 15).toFixed(1); sl.value = A.start.toFixed(1);
    $('#f-wave-wrap').hidden = false;
  } catch (e) {
    console.warn(e);
    info.textContent = 'Этот файл браузер не смог прочитать. Попробуйте MP3 или вставьте ссылку на песню.';
    state.form.song.loaded = null; state.form.song.A = null;
  }
  validate();
}
function showAnalysis() {
  const A = state.form.song.A;
  if (!A) return;
  const loud = A.loud > 0.6 ? 'громкая' : A.loud < 0.35 ? 'тихая' : 'средняя громкость';
  $('#f-audio-info').textContent = `${Math.round(A.bpm)} BPM · ${A.keyName} (оценка) · ${loud} · ${U.fmtTime(A.duration)}`;
  $('#f-ex-label').textContent = `Фрагмент для воспоминания: с ${U.fmtTime(A.start)}. В дневник сохраняется только он, а не песня целиком. Передвиньте, если любимое место в другом.`;
}
function drawWave() {
  const song = state.form.song.loaded, A = state.form.song.A;
  if (!song) return;
  const c = $('#f-wave'), ctx = c.getContext('2d'), w = c.width, h = c.height;
  const d = song.audio.getChannelData(0), n = 300, step = Math.floor(d.length / n);
  ctx.clearRect(0, 0, w, h);
  const s0 = A.start / A.duration, s1 = Math.min(1, (A.start + 40) / A.duration);
  ctx.fillStyle = 'rgba(169,68,43,.12)'; ctx.fillRect(s0 * w, 0, (s1 - s0) * w, h);
  for (let i = 0; i < n; i++) {
    let m = 0; for (let j = i * step; j < (i + 1) * step; j += 16) { const v = Math.abs(d[j]); if (v > m) m = v; }
    const x = (i / n) * w, inside = i / n >= s0 && i / n <= s1;
    ctx.fillStyle = inside ? 'rgba(169,68,43,.9)' : 'rgba(30,27,24,.3)';
    ctx.fillRect(x, h / 2 - m * h * 0.45, w / n - 1.5, m * h * 0.9 + 1);
  }
}
const reanalyze = debounce(() => {
  const song = state.form.song.loaded;
  if (!song) return;
  state.form.song.A = PV.Audio.analyzeSong(song, { excerptLen: 45, start: parseFloat($('#f-ex-start').value) });
  showAnalysis(); drawWave();
}, 250);

function artistHint() {
  const q = `${$('#f-artist').value} ${$('#f-title').value}`;
  const hit = PV.Audio.lookupArtist(q);
  const box = $('#f-artist-hint');
  if (!hit) { box.textContent = ''; return; }
  const g = PV.Lex.genres[hit.genre];
  box.textContent = `Знаю этого исполнителя: ${g ? g.label : hit.genre}, около ${hit.year}. Жанр и эпоха тоже повлияют на оформление.`;
  if (!$('#f-year').value) $('#f-year').placeholder = String(hit.year);
  const D = state.form.song.describe;
  for (const [k, v] of [['tempo', hit.tempo], ['mood', hit.mood], ['genre', hit.genre]]) {
    if (!D[k]) { D[k] = v; $$(`.chips[data-k="${k}"] button`).forEach((b) => b.classList.toggle('on', b.dataset.v === v)); }
  }
}
function songMeta() {
  const artist = $('#f-artist').value.trim(), title = $('#f-title').value.trim();
  const hit = PV.Audio.lookupArtist(`${artist} ${title}`);
  const yearIn = parseInt($('#f-year').value, 10);
  const year = yearIn > 1500 && yearIn < 2100 ? yearIn : hit ? hit.year : null;
  const label = [artist, title].filter(Boolean).join(' — ') || (state.form.song.link ? state.form.song.link.service : 'песня дня');
  return { artist, title, year, label, genre: hit ? hit.genre : null, tempo: hit ? hit.tempo : null, mood: hit ? hit.mood : null };
}

function validate() {
  const f = state.form;
  if (!f) return;
  const need = [];
  if ($('#f-text').value.trim().length < 10) need.push('пара предложений о дне');
  if (!f.photos.length) need.push('хотя бы одно фото');
  const songOk = f.song.mode === 'file' ? !!f.song.A : !!(f.song.link || $('#f-artist').value.trim() || $('#f-title').value.trim());
  if (!songOk) need.push(f.song.mode === 'file' ? 'аудиофайл песни' : 'ссылка или название песни');
  const unnamed = f.song.mode === 'file' && f.song.A && !$('#f-artist').value.trim() && !$('#f-title').value.trim();
  $('#f-song-warn').hidden = !unnamed;
  $('#f-go').disabled = need.length > 0;
  $('#f-need').textContent = need.length ? 'Осталось: ' + need.join(', ') : 'Всё готово';
}

/* погода по геолокации (по желанию) */
const WMO = (c) => (c === 0 ? ['ясно', { sun: 1 }] : c <= 3 ? ['облачно', {}] : c <= 48 ? ['туман', { fog: 1 }] : c <= 67 ? ['дождь', { rain: 1 }] : c <= 77 ? ['снег', { snow: 1 }] : c <= 82 ? ['ливень', { rain: 1 }] : c <= 86 ? ['снегопад', { snow: 1 }] : ['гроза', { storm: 1, rain: 1 }]);
async function fetchWeather() {
  const info = $('#f-weather-info');
  if (!navigator.geolocation) { info.textContent = 'Браузер не даёт доступ к местоположению.'; return; }
  info.textContent = 'Спрашиваю местоположение…';
  try {
    const pos = await new Promise((res, rej) => navigator.geolocation.getCurrentPosition(res, rej, { timeout: 12000, maximumAge: 3600e3 }));
    const date = $('#f-date').value || U.today();
    const lat = pos.coords.latitude.toFixed(3), lon = pos.coords.longitude.toFixed(3);
    const ageDays = (Date.now() - U.parseDate(date).getTime()) / 864e5;
    const base = ageDays > 80 ? 'https://archive-api.open-meteo.com/v1/archive' : 'https://api.open-meteo.com/v1/forecast';
    const url = `${base}?latitude=${lat}&longitude=${lon}&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto&start_date=${date}&end_date=${date}`;
    const j = await (await fetch(url)).json();
    const code = j.daily.weather_code[0], tmax = j.daily.temperature_2m_max[0], tmin = j.daily.temperature_2m_min[0];
    const [label, tags] = WMO(code);
    if (tmax < 3) tags.cold = 1; if (tmax > 28) tags.heat = 1;
    state.form.weather = { code, label, tmax, tmin, tags };
    info.textContent = `${label}, от ${Math.round(tmin)} до ${Math.round(tmax)} °C — учтём в оформлении.`;
  } catch (e) {
    console.warn(e);
    info.textContent = 'Не получилось узнать погоду. Можно просто упомянуть её в записи.';
  }
}
function applyWeather(T, w) {
  if (!w) return;
  for (const k of Object.keys(w.tags)) { T.weather[k] = true; T.weatherHits[k] = [...(T.weatherHits[k] || []), 'погода: ' + w.label]; }
  const t = w.tmax;
  T.weatherTemp = t < 0 ? -0.8 : t < 8 ? -0.5 : t < 16 ? -0.15 : t < 24 ? 0.2 : 0.6;
  T.weatherTempSource = 'text';
}

/* ---------- сборка дня ---------- */
function estimateDuration(S, T, n) {
  const r = new PV.Render.Renderer({ style: S, text: T, photos: Array.from({ length: n }, () => ({ a: {} })), music: {} }, { scale: 0.1 });
  r.buildTimeline();
  return r.duration;
}
function styleFor(day) {
  return PV.Mood.buildStyle({ text: day.analysis.T, photos: day.analysis.P, music: day.analysis.M, seed: day.seed, overrides: day.overrides });
}
function summaryOf(S) {
  const m = S.mood;
  return { register: S.register, E: m.E, V: m.V, W: m.W, N: m.N, T: m.T, D: m.D, accent: S.register === 'ma' ? [194, 65, 45] : S.accent, paper: S.bg || S.paper, tod: S.tod, palette: (S.palette || []).slice(0, 4).map((c) => c.map(Math.round)) };
}
async function nextNumber() { const all = await PV.Store.all(); return all.reduce((m, d) => Math.max(m, d.number || 0), 0) + 1; }

async function buildDay() {
  const f = state.form, date = $('#f-date').value || U.today(), text = $('#f-text').value.trim();
  $('#busy').classList.add('build');
  busy(true, 'Читаю запись…', 0.04);
  try {
    await U.frame();
    const id = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
    const seed = U.hash(id + text);
    const T = PV.Text.analyze(text, date);
    applyWeather(T, f.weather);
    busy(true, 'Смотрю на свет и цвет фото…', 0.12); await U.frame();
    const P = PV.Img.mergePhotos(f.photos.map((p) => p.a), seed);
    busy(true, 'Слушаю песню…', 0.2); await U.frame();
    const meta = songMeta();
    let M, track, ex = null;
    if (f.song.mode === 'file' && f.song.A) {
      M = { ...stripPriv(f.song.A), genre: meta.genre, year: meta.year };
    } else {
      const D = f.song.describe;
      M = PV.Audio.describe({ tempo: D.tempo || meta.tempo, mood: D.mood || meta.mood, genre: D.genre || meta.genre, year: meta.year });
    }
    const S = PV.Mood.buildStyle({ text: T, photos: P, music: M, seed });
    const titles = PV.Title.make(T, { tod: S.tod, season: S.season, register: S.register, seed });
    const dur = estimateDuration(S, T, f.photos.length);
    if (f.song.mode === 'file' && f.song.A) {
      const A = f.song.A;
      ex = PV.Audio.makeExcerpt(f.song.loaded, A.start, Math.min(A.duration - A.start, dur + 1.5));
      const fin = PV.Audio.finalizeExcerpt(A, ex.t0, ex.dur);
      track = { ...fin, bpm: M.bpm, keyName: (M.modeConf ?? 1) >= 0.5 ? M.keyName : null, label: meta.label, dur: ex.dur };
    } else {
      track = { env: M.env, envRate: M.envRate, beats: M.beats, beatStrength: M.beatStrength, bpm: M.bpm, keyName: null, label: meta.label, dur: 45 };
    }
    const Mstore = stripPriv(M); delete Mstore.env; delete Mstore.beats; delete Mstore.beatStrength;
    const day = {
      id, seed, version: 1, createdAt: Date.now(), date, number: await nextNumber(), text,
      title: titles[0].s, titlePattern: titles[0].pattern, titleIdx: 0,
      photos: f.photos.map((p) => ({ blob: p.blob, w: p.w, h: p.h, a: p.a })),
      song: {
        mode: f.song.mode, artist: meta.artist, title: meta.title, year: meta.year, label: meta.label,
        url: f.song.mode === 'link' ? f.song.url : null, link: f.song.mode === 'link' ? f.song.link : null, describe: f.song.describe,
        excerpt: ex ? ex.blob : null, excerptExt: ex ? ex.ext : null, excerptStart: ex ? ex.t0 : null, excerptDur: ex ? ex.dur : null,
        fileName: f.song.loaded ? f.song.loaded.file.name : null,
      },
      analysis: { T, P, M: Mstore }, weather: f.weather, overrides: {}, track, voice: null, video: null,
    };
    await openDay(day, { fresh: true, onProgress: (p) => busy(true, 'Рисую страницу дня…', 0.3 + 0.65 * p) });
    state.form = null;
    toast(`День сохранён в папку «${day.title}»`);
  } catch (e) {
    console.error(e);
    toast('Не получилось собрать воспоминание: ' + e.message, 7000);
  } finally { busy(false); $('#busy').classList.remove('build'); }
}

/* ---------- страница дня ---------- */
function previewScale() {
  const h = Math.min(window.innerHeight * 0.78, 900), dpr = Math.min(2, window.devicePixelRatio || 1);
  return U.clamp((h * dpr) / 1920, 0.42, 0.75);
}
function stopDay() {
  if (state.player) state.player.destroy();
  state.player = null;
  if (state.voiceCtl) { state.voiceCtl.stop(); state.voiceCtl = null; }
  if (state.voiceAudio) { state.voiceAudio.pause(); state.voiceAudio = null; }
  $('#d-frame').classList.remove('playing');
}
async function makeRenderer(day, S, scale, quality, onProgress) {
  const bmps = await Promise.all(day.photos.map((p) => PV.Img.loadBitmap(p.blob)));
  const R = new PV.Render.Renderer({
    style: S, text: day.analysis.T, title: day.title, date: day.date, number: day.number,
    photos: bmps.map((b, i) => ({ bmp: b, a: day.photos[i].a })), music: { ...day.track },
  }, { scale, quality });
  await R.prepare(onProgress);
  return R;
}
async function coverBlob(R) {
  const c = document.createElement('canvas');
  c.width = Math.round(R.W * R.scale); c.height = Math.round(R.H * R.scale);
  const sh = R.shots[0], t = Math.max(2.4, sh.start + Math.min(sh.dur * 0.7, 3.2));
  R.drawFrame(c.getContext('2d'), t);
  return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.86));
}
async function openDayById(id) {
  const day = await PV.Store.get(id);
  if (!day) return toast('Этот день не найден');
  busy(true, 'Открываю страницу дня…', 0.1);
  $('#d-tune').open = false;
  try { await openDay(day, { onProgress: (p) => busy(true, 'Открываю страницу дня…', 0.1 + 0.85 * p) }); } catch (e) { console.error(e); toast('Не удалось открыть день: ' + e.message); } finally { busy(false); }
}
async function openDay(day, opts = {}) {
  stopDay();
  state.day = day;
  const S = styleFor(day);
  state.S = S;
  const R = await makeRenderer(day, S, previewScale(), 'preview', opts.onProgress);
  state.renderer = R;
  state.audioBuf = day.song.excerpt ? await PV.Player.decodeBlob(day.song.excerpt).catch((e) => { console.warn(e); return null; }) : null;
  if (opts.fresh || !day.cover) day.cover = await coverBlob(R);
  day.summary = summaryOf(S);
  await PV.Store.put(day);
  setGlow(day.summary, 'day');
  go('day');
  state.player = new PV.Player.Player($('#d-canvas'), R, state.audioBuf, {
    onTick: (t, d) => { $('#d-seek').value = Math.round((t / d) * 1000); $('#d-time').textContent = `${U.fmtTime(t)} / ${U.fmtTime(d)}`; },
    onEnd: () => setPlaying(false),
  });
  state.player.seek(Math.max(2.4, R.shots[0].start + Math.min(R.shots[0].dur * 0.7, 3.2)));
  fillPanel(day, S);
}
function setPlaying(on) {
  $('#d-play').textContent = on ? '❚❚' : '▶';
  $('#d-frame').classList.toggle('playing', on);
}
function togglePlay() {
  const p = state.player;
  if (!p) return;
  if (p.playing) { p.pause(); setPlaying(false); }
  else { if (p.t >= p.duration - 0.1 || p.t > 0.5 && !p.started) p.seek(0); p.started = true; p.play(); setPlaying(true); }
}

const AX = [
  ['E', 'Энергия', 'спокойно', 'напряжённо'], ['V', 'Тон', 'тяжело', 'светло'], ['W', 'Тепло', 'отстранённо', 'близко'],
  ['N', 'Ностальгия', 'сейчас', 'память'], ['T', 'Погода', 'холодно', 'тепло'], ['D', 'События', 'пусто', 'насыщенно'],
];
function fillPanel(day, S) {
  const REG = PV.Mood.REG[S.register];
  $('#d-title').value = day.title;
  const w = day.weather ? ` · погода: ${day.weather.label}, до ${Math.round(day.weather.tmax)} °C` : '';
  $('#d-meta').textContent = `${U.dateLong(day.date)}, ${U.weekday(day.date)} · № ${String(day.number).padStart(3, '0')} · ♪ ${day.song.label}${w}`;
  $('#d-reg').innerHTML = `<div class="sw" style="background:${U.hex(REG.color)}"></div><div><b>Режим «${esc(REG.name)}»</b><p>${esc(U.cap(REG.mood))}. ${esc(REG.why)}</p></div>`;
  $('#d-axes').innerHTML = AX.map(([k, name, lo, hi]) => `<div class="axis"><span>${name}</span><div><div class="track"><i style="width:${Math.round(S.mood[k] * 100)}%"></i></div><div class="ends"><span>${lo}</span><span>${hi}</span></div></div></div>`).join('');
  $('#d-tune-rows').innerHTML = AX.slice(0, 4).map(([k, name]) => `<div class="tune-row"><span>${name}</span><input type="range" min="0" max="100" value="${Math.round(S.mood[k] * 100)}" data-k="${k}"><span class="muted" data-v="${k}">${day.overrides[k] != null ? 'вручную' : 'авто'}</span></div>`).join('');
  $$('#d-tune-rows input').forEach((inp) => { inp.oninput = () => { $(`[data-v="${inp.dataset.k}"]`).textContent = 'вручную'; retune(); }; });
  const lines = PV.Mood.explain({ text: day.analysis.T, photos: day.analysis.P, music: day.analysis.M }, S);
  lines.push({ k: 'Название', t: `${day.titlePattern || 'по правилам'} — 3–7 слов, как подпись на обороте фотографии, без глаголов и эмоций «в лоб».` });
  $('#d-why').innerHTML = lines.map((l) => `<li><b>${esc(l.k)}</b>${esc(l.t)}</li>`).join('');
  $('#d-voice-note').textContent = 'Голос по правилам дня: ' + PV.Voice.describe(S.voice) + (day.voice ? '. Есть запись вашим голосом — играет она.' : '.');
  $('#d-voice').textContent = day.voice ? 'Послушать запись (ваш голос)' : 'Послушать запись';
  const emb = $('#d-embed');
  emb.innerHTML = '';
  if (day.song.link && day.song.link.embed && !IN_ARTIFACT) {
    emb.innerHTML = `<div class="muted small" style="margin-top:12px">Песня по ссылке (${esc(day.song.link.service)}): включите её здесь — кадры сменяются в её темпе.</div><iframe loading="lazy" allow="autoplay; encrypted-media" height="${day.song.link.height || 200}" src="${esc(day.song.link.embed)}"></iframe>`;
  } else if (day.song.url) emb.innerHTML = `<p class="small"><a href="${esc(day.song.url)}" target="_blank" rel="noopener">Открыть песню дня</a></p>`;
  renderFiles(day, S);
}
function folderFiles(day, S) {
  const base = U.safeName(day.title), files = [];
  const lines = PV.Mood.explain({ text: day.analysis.T, photos: day.analysis.P, music: day.analysis.M }, S);
  files.push({ name: 'запись.txt', data: `${U.dateLong(day.date)}, ${U.weekday(day.date)}\n\n${day.text}\n` });
  day.photos.forEach((p, i) => files.push({ name: `фото-${String(i + 1).padStart(2, '0')}.jpg`, data: p.blob }));
  if (day.song.excerpt) files.push({ name: `песня-фрагмент.${day.song.excerptExt}`, data: day.song.excerpt });
  const M = day.analysis.M;
  files.push({ name: 'песня.txt', data: [`Песня: ${day.song.label}`, day.song.url ? `Ссылка: ${day.song.url}` : '', day.song.excerpt ? `Фрагмент: с ${U.fmtTime(day.song.excerptStart)}, ${Math.round(day.song.excerptDur)} с (песня целиком не хранится)` : '', `Темп: ${Math.round(M.bpm)} BPM${M.keyName ? ', ' + M.keyName : ''}${M.source === 'described' ? ' (по описанию)' : ''}`].filter(Boolean).join('\n') + '\n' });
  if (day.video) files.push({ name: `воспоминание.${day.video.ext}`, data: day.video.blob });
  if (day.cover) files.push({ name: 'обложка.jpg', data: day.cover });
  if (day.voice) files.push({ name: `озвучка.${day.voice.ext || 'webm'}`, data: day.voice.blob });
  files.push({ name: 'озвучка.txt', data: `Голос по правилам дня: ${PV.Voice.describe(S.voice)}.\n\n${day.text}\n` });
  files.push({ name: 'почему-так.txt', data: `«${day.title}»\nРежим: ${PV.Mood.REG[S.register].name}\n\n` + lines.map((l) => `• ${l.k}: ${l.t}`).join('\n') + '\n' });
  files.push({ name: 'день.json', data: JSON.stringify({ title: day.title, date: day.date, number: day.number, register: S.register, mood: Object.fromEntries(['E', 'V', 'W', 'T', 'D', 'N'].map((k) => [k, +S.mood[k].toFixed(3)])), tod: S.tod, season: S.season, bpm: M.bpm, key: M.keyName || null, palette: S.palette.map(U.hex), overrides: day.overrides }, null, 2) });
  return { base, files };
}
function renderFiles(day, S) {
  const { base, files } = folderFiles(day, S);
  const size = (d) => (d instanceof Blob ? d.size : new TextEncoder().encode(d).length);
  $('#d-files').innerHTML = `<li><span>📁 ${esc(base)}/</span><span>${files.length} ${U.plural(files.length, 'файл', 'файла', 'файлов')}</span></li>` +
    files.map((f) => `<li><span>${esc(f.name)}</span><span>${U.sizeLabel(size(f.data))}</span></li>`).join('') +
    (day.video ? '' : `<li><span class="muted">воспоминание (видео) — добавится при скачивании</span><span></span></li>`);
}

const retune = debounce(async () => {
  const day = state.day;
  if (!day) return;
  const o = {};
  $$('#d-tune-rows input').forEach((inp) => { if ($(`[data-v="${inp.dataset.k}"]`).textContent === 'вручную') o[inp.dataset.k] = inp.value / 100; });
  day.overrides = o;
  day.video = null;
  busy(true, 'Пересобираю страницу…', 0.2);
  try { await openDay(day, { fresh: true, onProgress: (p) => busy(true, 'Пересобираю страницу…', 0.2 + 0.75 * p) }); } finally { busy(false); }
  $('#d-tune').open = true;
}, 500);

async function retitle() {
  const day = state.day, S = state.S;
  const titles = PV.Title.make(day.analysis.T, { tod: S.tod, season: S.season, register: S.register, seed: day.seed });
  day.titleIdx = ((day.titleIdx || 0) + 1) % Math.max(1, titles.length);
  day.title = titles[day.titleIdx].s; day.titlePattern = titles[day.titleIdx].pattern;
  await applyTitle();
}
async function applyTitle() {
  const day = state.day, R = state.renderer;
  R.day.title = day.title; R._title = null;
  $('#d-title').value = day.title;
  day.cover = await coverBlob(R); day.video = null;
  await PV.Store.put(day);
  if (state.player) state.player.draw(state.player.t);
  fillPanel(day, state.S);
}

async function saveVideo(thenZip) {
  const day = state.day;
  if (!day) return;
  if (state.player) { state.player.pause(); setPlaying(false); }
  busy(true, 'Готовлю видео в 1080×1920…', 0.02);
  try {
    const R = await makeRenderer(day, state.S, 1, 'high', (p) => busy(true, 'Готовлю видео в 1080×1920…', 0.02 + 0.1 * p));
    const { blob, ext } = await PV.Player.exportVideo(R, state.audioBuf, (p) => busy(true, `Записываю видео: ${Math.round(p * 100)}% (идёт в реальном времени)`, 0.12 + 0.86 * p));
    day.video = { blob, ext, mime: blob.type };
    try { await PV.Store.put(day); } catch (e) { console.warn(e); day.video = { blob, ext, mime: blob.type, unsaved: true }; }
    if (!thenZip) await download(blob, `${U.safeName(day.title)}.${ext}`);
    renderFiles(day, state.S);
  } catch (e) { console.error(e); toast(e.message || 'Не получилось записать видео', 7000); throw e; }
  finally { busy(false); }
}
async function downloadFolder() {
  const day = state.day;
  if (!day) return;
  if (!day.video && PV.Player.pickMime() !== null) { try { await saveVideo(true); } catch (e) { /* соберём папку без видео */ } }
  const { base, files } = folderFiles(day, state.S);
  busy(true, 'Собираю папку дня…', 0.9);
  let zipBlob;
  try { zipBlob = await PV.Zip.zip(files.map((f) => ({ name: base + '/' + f.name, data: f.data }))); }
  finally { busy(false); }
  await download(zipBlob, base + '.zip');
}

async function playVoice() {
  const day = state.day, S = state.S;
  if (state.voiceCtl || state.voiceAudio) { stopVoice(); return; }
  if (state.player && state.player.playing) state.player.duck(true);
  $('#d-voice').textContent = 'Остановить';
  if (day.voice) {
    const a = new Audio(URL.createObjectURL(day.voice.blob));
    state.voiceAudio = a; a.onended = stopVoice; a.play();
    return;
  }
  if (!PV.Voice.supported()) { toast('Этот браузер не умеет синтезировать речь. Запишите запись своим голосом.'); stopVoice(); return; }
  await PV.Voice.ready();
  state.voiceCtl = PV.Voice.speak(day.text, S.voice, { onEnd: () => { state.voiceCtl = null; stopVoice(); } });
}
function stopVoice() {
  if (state.voiceCtl) { const c = state.voiceCtl; state.voiceCtl = null; c.stop(); }
  if (state.voiceAudio) { state.voiceAudio.pause(); state.voiceAudio = null; }
  if (state.player) state.player.duck(false);
  if (state.day) $('#d-voice').textContent = state.day.voice ? 'Послушать запись (ваш голос)' : 'Послушать запись';
}
async function toggleRecord() {
  const btn = $('#d-rec');
  if (state.rec) {
    const blob = await state.rec.stop(); state.rec = null;
    btn.textContent = 'Перезаписать своим голосом';
    state.day.voice = { blob, ext: /mp4/.test(blob.type) ? 'm4a' : /ogg/.test(blob.type) ? 'ogg' : 'webm' };
    await PV.Store.put(state.day);
    fillPanel(state.day, state.S);
    toast('Голос сохранён в папку дня');
    return;
  }
  try { state.rec = await PV.Voice.record(); btn.textContent = '● Остановить запись'; toast('Читайте запись вслух. Нажмите ещё раз, чтобы закончить.'); }
  catch (e) { toast('Нет доступа к микрофону'); }
}

/* ---------- экспорт и импорт всего дневника ---------- */
async function exportDiary() {
  const days = await PV.Store.all();
  if (!days.length) return toast('Дневник пока пуст');
  busy(true, 'Упаковываю дневник…', 0.3);
  try {
    const files = [], meta = [];
    for (const d of days) {
      const dir = `days/${d.id}/`, rec = { ...d, cover: null, video: null };
      rec.photos = d.photos.map((p, i) => { files.push({ name: `${dir}photo-${i + 1}.jpg`, data: p.blob }); return { ...p, blob: null, file: `${dir}photo-${i + 1}.jpg` }; });
      rec.song = { ...d.song, excerpt: null, excerptFile: null };
      if (d.song.excerpt) { rec.song.excerptFile = `${dir}song.${d.song.excerptExt}`; files.push({ name: rec.song.excerptFile, data: d.song.excerpt }); }
      if (d.cover) { rec.coverFile = `${dir}cover.jpg`; files.push({ name: rec.coverFile, data: d.cover }); }
      if (d.voice) { rec.voice = { ext: d.voice.ext, file: `${dir}voice.${d.voice.ext}` }; files.push({ name: rec.voice.file, data: d.voice.blob }); }
      meta.push(rec);
    }
    files.unshift({ name: 'diary.json', data: JSON.stringify({ app: 'poslevkusie', version: 1, exported: new Date().toISOString(), days: meta }) });
    const z = await PV.Zip.zip(files);
    busy(false);
    await download(z, 'дневник-послевкусие.zip');
  } finally { busy(false); }
}
async function importDiary(blob, opts = {}) {
  const files = await PV.Zip.unzip(blob);
  if (!files['diary.json']) throw new Error('В архиве нет diary.json');
  const data = JSON.parse(new TextDecoder().decode(files['diary.json']));
  const mk = (name, type) => (name && files[name] ? new Blob([files[name]], { type }) : null);
  const VOICE_TYPE = { m4a: 'audio/mp4', mp4: 'audio/mp4', ogg: 'audio/ogg', webm: 'audio/webm' };
  const existing = await PV.Store.all();
  const used = new Map(existing.map((d) => [d.number, d.id]));
  let top = existing.reduce((m, d) => Math.max(m, d.number || 0), 0);
  let n = 0;
  for (const rec of data.days || []) {
    const owner = used.get(rec.number);
    if (!rec.number || (owner && owner !== rec.id)) rec.number = Math.max(top, ...(data.days || []).map((d) => d.number || 0)) + 1;
    used.set(rec.number, rec.id); top = Math.max(top, rec.number);
    rec.photos = rec.photos.map((p) => ({ ...p, blob: mk(p.file, 'image/jpeg') }));
    rec.song.excerpt = mk(rec.song.excerptFile, rec.song.excerptExt === 'mp3' ? 'audio/mpeg' : 'audio/wav');
    rec.cover = mk(rec.coverFile, 'image/jpeg');
    if (rec.voice && rec.voice.file) rec.voice = { ext: rec.voice.ext, blob: mk(rec.voice.file, VOICE_TYPE[rec.voice.ext] || 'audio/webm') };
    rec.video = null;
    if (opts.demo) rec.demo = true;
    await PV.Store.put(rec); n++;
  }
  return n;
}

/* ---------- как это работает ---------- */
function renderAbout() {
  const REG = PV.Mood.REG, box = $('#v-about');
  if (box.dataset.ready) return;
  box.dataset.ready = '1';
  box.innerHTML = `
  <div class="hero"><div>
    <h1>Невидимое — ощущение дня. Видимое — страница дневника.</h1>
    <p>«Послевкусие» превращает запись, фотографии и песню в вертикальное видео-воспоминание 9:16 под фрагмент этой песни. Каждый день выглядит по-своему, но все дни остаются страницами одного дневника: правила, по которым настроение превращается в форму, едины.</p>
  </div><div class="note"><b>Главное правило.</b> Погода красит тени, люди красят свет. «Было холодно, но мы пили какао» — значит тени холодные и синеватые, а свет тёплый и персиковый. Связь дня и картинки глубже, чем «грустно — значит синий».</div></div>
  <h3>Как день становится страницей</h3>
  <div class="flow">
    <div><b>1. Текст</b>настроение, энергия, тепло близости, ностальгия, сезон, время суток, погода, места, люди, детали и фразы для подписей.</div>
    <div><b>2. Фото</b>палитра (k-средних в Lab), свет, контраст, насыщенность, тёплость, «занятость» кадра, точка интереса.</div>
    <div><b>3. Музыка</b>аудиоанализ в браузере: темп и доли, громкость, плотность атак, яркость звука, лад. По ссылке — по описанию.</div>
    <div><b>4. Страница</b>шесть осей настроения выбирают художественный режим и дозируют его. Каждое решение объяснено в «Почему день выглядит так».</div>
  </div>
  <h3>Шесть художественных режимов</h3>
  <div class="regs">${PV.Mood.ORDER.map((k) => { const r = REG[k]; return `<div class="regcard" style="--c:${U.hex(r.color)}"><h3>${esc(r.name)}</h3><div class="when">${esc(r.mood)}</div><p>${esc(U.cap(r.technique))}.</p><p>${esc(r.why)}</p><p class="refs">Опоры: ${esc(r.refs)}</p></div>`; }).join('')}</div>
  <h3>Постоянное и переменное</h3>
  <ul class="rules">
    <li><b>Постоянно для всех дней:</b> формат 9:16, сетка с полями 72 px, бумага с волокнами, дата и номер страницы сверху моноширинным шрифтом, название внизу слева, печать дня внизу справа, «дорожка дня» — линия громкости песни с бегущей точкой.</li>
    <li><b>Печать дня:</b> контур нарисован огибающей громкости самой песни, число зубцов — темп ÷ 8, рваность края — энергия, знак внутри — время суток. В архиве это иконка папки.</li>
    <li><b>Шрифты:</b> Lora для лирических дней и подписей курсивом, Montserrat — «конструктивный» голос для напряжённых и шумных, Anonymous Pro — для даты, номера и меток.</li>
    <li><b>Переменно:</b> палитра (всегда из самих фото), обработка снимков, фактура, композиция, ритм, анимация, слои погоды.</li>
  </ul>
  <h3>Правила, по которым день превращается в форму</h3>
  <ul class="rules">
    <li><b>Темп песни → ритм.</b> Кадр длится целое число долей: спокойный день — 8 долей, средний — 4, напряжённый — 2. Склейки и появления фигур попадают в доли.</li>
    <li><b>Громкость в каждый момент → свет.</b> Огибающая громкости управляет свечением, засветками, пульсом печати.</li>
    <li><b>Лад и плотность событий → воздух.</b> Минор и мало событий — больше пустого места вокруг фото и приглушённые цвета.</li>
    <li><b>Погода → тени, люди → свет.</b> Раздельное тонирование: холод, снег, дождь холодят тени; близкие люди, какао, плед согревают свет.</li>
    <li><b>Время суток → освещение.</b> Утро — бледное золото и туман, вечер — тёплая виньетка, ночь — глубокая тень и точечные огни.</li>
    <li><b>Слова → детали в кадре.</b> Листья, снег, дождь, лепестки, огни фонарей, звёзды, конфетти появляются, только если о них есть в записи (или в погоде).</li>
    <li><b>Год песни → память.</b> Старые песни и слова о прошлом добавляют зерно и плёночные засветки.</li>
    <li><b>Название папки:</b> 3–7 слов, как подпись на обороте фотографии, по формуле «время суток + место + деталь или событие»: «Осенний парк и какао», «Ночь в офисе перед сдачей».</li>
    <li><b>Голос озвучки:</b> темп 0,80–1,15 по энергии, высота по тону, паузы между фразами длиннее в спокойные дни, тембр ниже в тяжёлые и ночные.</li>
  </ul>
  <div class="note"><b>Послевкусие интерфейса.</b> Когда вы открываете день, сам дневник окрашивается в цвета его фотографий и акцент режима. Вы возвращаетесь в архив — а оттенок дня ещё держится в комнате, пока не откроете другой. Над архивом — «цвета дневника»: каждый день полоской из собственной палитры, по порядку дат.</div>
  <div class="note">Всё хранится только в вашем браузере. Из песни сохраняется лишь фрагмент, который звучит в воспоминании. Оценка настроения — это подбор оформления, а не психологическая диагностика. Шрифты Lora, Montserrat и Anonymous Pro распространяются по лицензии SIL Open Font License. Внешние библиотеки не используются: Canvas 2D, Web Audio API, MediaRecorder, Web Speech API и IndexedDB встроены в браузер.</div>`;
}

/* ---------- запуск ---------- */
function bind() {
  $$('[data-go]').forEach((b) => { b.onclick = () => go(b.dataset.go); });
  $$('#arch-mode button').forEach((b) => { b.onclick = () => { $$('#arch-mode button').forEach((x) => x.classList.toggle('on', x === b)); $('#arch-grid').hidden = b.dataset.mode !== 'folders'; $('#arch-feed').hidden = b.dataset.mode !== 'feed'; }; });
  $('#btn-export').onclick = exportDiary;
  $('#btn-import').onclick = () => $('#in-import').click();
  $('#in-import').onchange = async (e) => {
    const f = e.target.files[0]; e.target.value = '';
    if (!f) return;
    busy(true, 'Распаковываю дневник…', 0.4);
    try { const n = await importDiary(f); toast(`Импортировано: ${n} ${U.plural(n, 'день', 'дня', 'дней')}`); renderArchive(); } catch (err) { toast(err.message); } finally { busy(false); }
  };
  $('#f-text').oninput = () => { textHint(); validate(); };
  $('#f-date').onchange = () => textHint();
  $('#f-photos').onchange = (e) => { addPhotos(e.target.files); e.target.value = ''; };
  const drop = $('#f-drop');
  ['dragenter', 'dragover'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
  ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
  drop.addEventListener('drop', (e) => { e.preventDefault(); addPhotos(e.dataTransfer.files); });
  $$('#f-song-mode button').forEach((b) => { b.onclick = () => setSongMode(b.dataset.m); });
  $('#f-audio').onchange = (e) => { const f = e.target.files[0]; if (f) loadAudio(f); };
  $('#f-ex-start').oninput = () => { const A = state.form.song.A; if (A) { A.start = parseFloat($('#f-ex-start').value); drawWave(); } reanalyze(); };
  $('#f-url').oninput = () => {
    const link = PV.Audio.parseLink($('#f-url').value);
    state.form.song.url = $('#f-url').value.trim(); state.form.song.link = link;
    $('#f-url-info').textContent = link ? (link.embed ? `${link.service}: песня откроется прямо на странице дня. Опишите её, чтобы она повлияла на оформление.` : 'Ссылка сохранится в папке дня.') : '';
    validate();
  };
  $('#f-genres').innerHTML = Object.entries(PV.Lex.genres).map(([k, g]) => `<button data-v="${k}">${g.label}</button>`).join('');
  $$('.chips').forEach((ch) => ch.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const k = ch.dataset.k, on = !b.classList.contains('on');
    $$('button', ch).forEach((x) => x.classList.remove('on'));
    if (on) b.classList.add('on');
    state.form.song.describe[k] = on ? b.dataset.v : null;
  }));
  ['#f-artist', '#f-title'].forEach((s) => { $(s).oninput = debounce(() => { artistHint(); validate(); }, 300); });
  $('#f-weather').onclick = fetchWeather;
  $('#f-go').onclick = buildDay;
  $('#d-play').onclick = togglePlay;
  $('#d-frame').onclick = togglePlay;
  $('#d-seek').oninput = (e) => { if (state.player) state.player.seek((e.target.value / 1000) * state.player.duration); };
  $('#d-voice').onclick = playVoice;
  $('#d-rec').onclick = toggleRecord;
  $('#d-video').onclick = () => saveVideo(false).catch(() => {});
  $('#d-zip').onclick = downloadFolder;
  $('#d-del').onclick = async () => {
    if (!state.day || !(await askConfirm(`Удалить «${state.day.title}» из дневника? Это нельзя отменить.`, 'Удалить'))) return;
    await PV.Store.remove(state.day.id); state.day = null; go('archive');
  };
  $('#d-title').onchange = async (e) => { const v = e.target.value.trim(); if (!v || !state.day) return; state.day.title = v.slice(0, 70); state.day.titlePattern = 'название изменено вручную'; await applyTitle(); };
  $('#d-retitle').onclick = retitle;
  $('#d-tune-reset').onclick = () => { if (!state.day) return; $$('#d-tune-rows [data-v]').forEach((s) => { s.textContent = 'авто'; }); state.day.overrides = {}; retune(); };
  document.addEventListener('keydown', (e) => { if (state.view === 'day' && e.code === 'Space' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); togglePlay(); } });
}

async function init() {
  bind();
  try {
    await Promise.all(['400 28px "PV Mono"', '700 28px "PV Mono"', '500 66px "PV Serif"', 'italic 400 44px "PV Serif"', '700 52px "PV Sans"', '400 30px "PV Sans"'].map((f) => document.fonts.load(f)));
  } catch (e) { /* шрифты подставятся системные */ }
  let days = [];
  try { days = await PV.Store.all(); } catch (e) { days = []; }
  if (PV.Store.mode === 'memory') toast('Браузер не даёт хранить дневник: дни будут жить до закрытия вкладки. Чтобы сохранить, используйте «Экспорт дневника».', 9000);
  bindTilt();
  go('archive');
  /* демо-дневник грузится в фоне и не уводит человека с экрана, который он уже открыл */
  if (!days.length && location.protocol.startsWith('http')) {
    try {
      const r = await fetch('demo/diary.zip', { cache: 'no-store' });
      if (r.ok) {
        const n = await importDiary(await r.blob(), { demo: true });
        if (n) toast(`Загружен демо-дневник: ${n} ${U.plural(n, 'день', 'дня', 'дней')}`);
        if (state.view === 'archive') renderArchive();
      }
    } catch (e) { /* демо нет — начнём с пустого дневника */ }
  }
}

PV.App = { IN_ARTIFACT, state, go, openDayById, importDiary, exportDiary, buildDay, addPhotos, loadAudio };
document.addEventListener('DOMContentLoaded', init);
})();
