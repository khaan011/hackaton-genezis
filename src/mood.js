/* Послевкусие — сведение текста, фото и музыки в настроение дня, выбор режима и параметров визуальной системы.
   Режим = художественный приём. Оси настроения = дозировка этого приёма. */
(function () {
'use strict';
const PV = (globalThis.PV = globalThis.PV || {});
const U = PV.U;

const REG = {
  monet: {
    name: 'Свет Моне', short: 'Моне', mood: 'спокойный, светлый, тёплый день',
    technique: 'фото переписаны короткими мазками по направлению контуров, мягкий свет «дышит» с музыкой, медленные наплывы, подпись курсивом пишется как от руки',
    why: 'Импрессионисты писали не предметы, а свет и миг. Раздробленный мазок размывает границы, как это делает память, а медленный ритм даёт задержаться в моменте.',
    refs: 'Клод Моне, Камиль Писсарро, импрессионизм', color: [217, 165, 90],
  },
  kandinsky: {
    name: 'Композиция', short: 'Кандинский', mood: 'напряжённый, собранный, быстрый день',
    technique: 'строгая модульная сетка, плакатная обработка фото в 3–4 тона, линии, круги и острые треугольники появляются на доли песни, склейки ровно в такт',
    why: 'Кандинский связывал острые углы и диагонали с напряжением, а ритм форм — со звуком. Склейка в долю передаёт давление и концентрацию.',
    refs: 'Василий Кандинский («Точка и линия на плоскости»), конструктивизм', color: [47, 79, 162],
  },
  ma: {
    name: 'Ма', short: 'Ма', mood: 'тихий, пустой, одинокий день',
    technique: 'много пустой бумаги, маленькое приглушённое фото не по центру, тонкая вертикальная линия и красная печать, между кадрами пауза пустой страницы',
    why: '«Ма» — японское понятие паузы и промежутка. Пустота даёт тишине прозвучать и не навязывает чувство.',
    refs: 'японская эстетика ма, ширма «Сосны» Хасэгавы Тохаку, минимализм', color: [194, 65, 45],
  },
  film: {
    name: 'Плёнка', short: 'Плёнка', mood: 'ностальгия, лето, друзья, старые песни',
    technique: 'отпечатки с белой рамкой ложатся стопкой на страницу, зерно, ореол вокруг светлых мест, засветки пульсируют с музыкой, оранжевая дата в углу кадра',
    why: 'Дефекты плёнки — визуальный язык самой памяти: кадр выглядит «вспомненным», а не снятым.',
    refs: 'плёночная фотография 35 мм, домашние фотоальбомы', color: [224, 123, 57],
  },
  matisse: {
    name: 'Вырезки', short: 'Матисс', mood: 'радость, шум, праздник, много людей',
    technique: 'фото вырезаны в живые формы и наклеены коллажем на яркий фон, вокруг плавают бумажные водоросли, звёзды и спирали, подпрыгивая в такт',
    why: 'Цикл Матисса «Джаз» переводит ритм и радость в вырезанную бумагу, асимметричные формы заставляют взгляд танцевать вместе с песней.',
    refs: 'Анри Матисс, «Джаз» (1947), бумажные вырезки, коллаж', color: [232, 178, 58],
  },
  nocturne: {
    name: 'Ноктюрн', short: 'Ноктюрн', mood: 'ночь, дождь, тяжёлый или грустный день',
    technique: 'глубокие цветовые поля из тёмных тонов фото, кадр проступает как через мокрое стекло, капли и блики фонарей, один тёплый источник света',
    why: 'Ноктюрны Уистлера сводят мир к тону и туману, цветовые поля Ротко держат тяжёлое чувство без слов. Грустный день остаётся красивым, а не иллюстрированным.',
    refs: 'Джеймс Уистлер («Ноктюрны»), Марк Ротко, ночная фотография', color: [51, 64, 107],
  },
};
const ORDER = ['monet', 'kandinsky', 'ma', 'film', 'matisse', 'nocturne'];

/* ---------- 1. сведение каналов в оси настроения ---------- */
function fuse(T, P, M, overrides) {
  const mConf = M ? (M.source === 'audio' ? 1 : 0.6) : 0;
  const tempoN = M ? U.norm(M.bpm, 60, 160) : 0.5;
  const musicE = M ? U.clamp(0.35 * tempoN + 0.3 * M.loud + 0.2 * M.onsetN + 0.15 * M.brightness) : 0.5;
  const modeSign = M ? (M.mode === 'major' ? 1 : -1) * (M.modeConf == null ? 0.5 : M.modeConf) : 0;
  const musicV = M ? U.clamp(0.5 + 0.22 * modeSign + 0.2 * (tempoN - 0.5) + 0.12 * (M.brightness - 0.5)) : 0.5;
  const musicW = M ? U.clamp(M.warmth != null ? M.warmth : 0.55 + 0.3 * (0.5 - M.brightness)) : 0.5;
  const photoE = U.clamp(0.6 * P.edges + 0.4 * U.norm(P.contrast, 0.08, 0.3));
  const photoV = U.clamp(0.55 * P.lum + 0.45 * Math.min(1, P.sat * 1.4));
  const photoW = U.clamp((P.warm + 1) / 2);
  const tE = (T.arousal + 1) / 2, tV = (T.valence + 1) / 2, tW = (T.warmth + 1) / 2;

  const m = {
    E: U.wavg([[musicE, 0.45 * mConf], [tE, 0.35 * T.arousalConf + 0.05], [photoE, 0.2]]),
    V: U.wavg([[tV, 0.5 * T.valenceConf + 0.05], [musicV, 0.3 * mConf], [photoV, 0.2]]),
    W: U.wavg([[tW, 0.45 * T.warmthConf + 0.05], [photoW, 0.35], [musicW, 0.2 * mConf]]),
    /* погода из текста главнее цвета снимков: «было холодно» холодит тени даже на тёплых осенних фото */
    T: T.weatherTempSource === 'text' ? 0.85 * (T.weatherTemp + 1) / 2 + 0.15 * photoW : 0.5 * (T.weatherTemp + 1) / 2 + 0.5 * photoW,
    D: U.clamp(0.4 * T.density + 0.3 * U.norm(P.count, 1, 6) + 0.3 * (M ? M.onsetN : 0.4)),
  };
  const yearN = M && M.year ? (M.year < 1980 ? 0.4 : M.year < 2000 ? 0.25 : M.year < 2010 ? 0.08 : 0) : 0;
  m.N = U.clamp(T.nostalgia + 0.35 * (M && M.vintage ? M.vintage : 0) + yearN);
  m.auto = { ...m };
  if (overrides) for (const k of ['E', 'V', 'W', 'N']) if (overrides[k] != null) m[k] = overrides[k];
  m.parts = { musicE, musicV, musicW, photoE, photoV, photoW, tE, tV, tW, mConf, tempoN, yearN };
  return m;
}

function resolveTod(T, P) {
  if (T.tod) return { tod: T.tod, source: 'текст' };
  if (P.darkFrac > 0.42 && P.lum < 0.3) return { tod: 'night', source: 'фото' };
  if (P.warm > 0.25 && P.lum < 0.55) return { tod: 'evening', source: 'фото' };
  return { tod: 'day', source: 'по умолчанию' };
}

/* ---------- 2. выбор режима ---------- */
function scoreRegisters(m, T, M, tod) {
  const night = tod === 'night' ? 1 : 0;
  const w = T.weather || {};
  const electronic = M && M.genre === 'electronic' ? 1 : 0;
  const major = M && M.mode === 'major' ? 1 : 0, minor = M && M.mode === 'minor' ? 1 : 0;
  const s = {
    monet: 1.0 * (1 - m.E) + 0.9 * m.V + 0.6 * m.W + 0.5 * T.nature + (tod !== 'night' ? 0.2 : 0) - 0.5 * night - 0.3 * (w.rain ? 1 : 0) - 0.4 * m.N,
    kandinsky: 1.3 * m.E + 0.6 * (1 - m.W) + 0.7 * T.urban + 0.4 * electronic + 0.2 * (1 - m.V) - 0.3 * T.social,
    ma: 0.9 * (1 - m.E) + 0.9 * (1 - m.D) + 0.8 * T.solitude + 0.35 * (w.snow || w.fog ? 1 : 0) + 0.3 * (1 - m.W) - 0.4 * T.social - 0.35 * (w.rain ? 1 : 0),
    film: 1.7 * m.N + 0.45 * T.travel + 0.3 * m.W + 0.2 * T.social + 0.25 * (T.season === 'summer' ? 1 : 0),
    matisse: 1.0 * m.V + 0.75 * m.E + 0.4 * m.D + 0.9 * T.social + 0.2 * major - 0.3 * night - 0.3 * T.urban,
    nocturne: 1.25 * (1 - m.V) + 0.55 * night + 0.3 * (tod === 'evening' ? 1 : 0) + 0.5 * (w.rain ? 1 : 0) + 0.3 * (1 - m.E) + 0.25 * minor + 0.2 * (w.fog ? 1 : 0) - 0.2 * T.social,
  };
  let best = 'monet';
  for (const k of ORDER) if (s[k] > s[best]) best = k;
  return { key: best, scores: s };
}

/* ---------- 3. палитра ---------- */
function transformPalette(base, reg, m) {
  const tf = (rgb) => {
    let [L, C, h] = U.rgb2lch(rgb);
    switch (reg) {
      case 'monet': L = L + (100 - L) * 0.22; C *= 0.85; h = U.hueToward(h, m.W > 0.5 ? 75 : 235, 0.12); break;
      case 'kandinsky': C = C * 0.75; break;
      case 'ma': C *= 0.28; L = L * 0.7 + 28; break;
      case 'film': h = U.hueToward(h, 65, 0.1); C *= 0.92; L = L * 0.9 + 8; break;
      case 'matisse': C = Math.max(C * 1.4, 52); L = U.clamp(L, 42, 78); break;
      case 'nocturne': L = L * 0.38 + 5; C *= 0.65; h = U.hueToward(h, 255, m.T < 0.5 ? 0.45 : 0.3); break;
    }
    return U.lch2rgb([L, C, h]);
  };
  return base.map(tf);
}

function mostChromatic(cols) {
  let best = cols[0], bc = -1;
  for (const c of cols) { const ch = U.rgb2lch(c)[1]; if (ch > bc) { bc = ch; best = c; } }
  return best;
}

/* ---------- 4. все параметры визуальной системы ---------- */
function buildStyle(day) {
  const T = day.text, P = day.photos, M = day.music;
  const seed = day.seed >>> 0;
  const m = fuse(T, P, M, day.overrides);
  const { tod, source: todSource } = resolveTod(T, P);
  const reg = scoreRegisters(m, T, M, tod);
  const R = reg.key;
  const w = T.weather || {};
  const S = { register: R, regScores: reg.scores, mood: m, tod, todSource, season: T.season, seed };

  /* бумага, чернила и цвет страницы — постоянная часть дневника */
  const base = (P.palette && P.palette.length ? P.palette.map((p) => p.rgb) : [[180, 160, 140], [90, 80, 70], [220, 210, 190]]).slice(0, 6);
  const pal = transformPalette(base, R, m);
  S.palette = pal;
  S.dark = R === 'nocturne' || (R === 'kandinsky' && tod === 'night' && m.V < 0.5);
  const paperLight = [243, 239, 231], paperDark = [18, 19, 24];
  S.paper = S.dark ? U.mix(paperDark, pal[0], 0.12) : U.mix(paperLight, base[0], 0.05);
  if (R === 'ma') S.paper = [242, 238, 230];
  if (R === 'film') S.paper = U.mix([239, 229, 211], base[0], 0.04);
  if (R === 'matisse') {
    const [L0, C0, h0] = U.rgb2lch(base[0]);
    S.bg = U.lch2rgb([66, Math.max(45, C0 * 1.2), U.mod(h0 + 180, 360)]);
  }
  if (R === 'kandinsky') S.paper = S.dark ? [20, 22, 28] : [236, 235, 230];
  S.ink = S.dark ? [234, 229, 218] : [31, 28, 25];
  S.inkSoft = S.dark ? [170, 168, 160] : [110, 104, 96];
  S.accent = R === 'ma' ? [194, 65, 45] : mostChromatic(pal);
  if (R === 'kandinsky') { const [L, C, h] = U.rgb2lch(mostChromatic(base)); S.accent = U.lch2rgb([56, Math.max(C, 62), h]); }
  S.light = m.W > 0.45 ? [255, 196, 120] : [214, 228, 255];

  /* правило: погода красит тени, люди красят свет */
  S.shadowTint = m.T < 0.5 ? [38, 72, 128] : [128, 74, 34];
  S.shadowK = U.clamp(Math.abs(m.T - 0.5) * 2) * 0.32 + 0.04;
  S.highlightTint = m.W > 0.5 ? [255, 206, 156] : [206, 224, 246];
  S.highlightK = U.clamp(Math.abs(m.W - 0.5) * 2) * 0.3 + 0.04;

  const minor = M && M.mode === 'minor';
  S.air = U.clamp(0.12 + 0.45 * (1 - m.D) + (minor ? 0.1 : 0) - (M && M.mode === 'major' && m.E > 0.6 ? 0.1 : 0));
  S.sat = U.clamp(0.72 + 0.35 * m.V + 0.15 * m.E - (minor ? 0.08 : 0), 0.55, 1.25);
  S.contrast = U.clamp(0.9 + 0.25 * m.E - 0.1 * m.N, 0.85, 1.2);
  S.grain = U.clamp(0.05 + 0.35 * m.N + { film: 0.22, nocturne: 0.08, monet: 0.04, ma: 0.03, kandinsky: 0.05, matisse: 0.02 }[R], 0, 0.6);
  S.vignette = U.clamp((tod === 'evening' ? 0.2 : tod === 'night' ? 0.35 : 0.05) + { film: 0.25, nocturne: 0.3, monet: 0.05, ma: 0, kandinsky: 0, matisse: 0 }[R], 0, 0.7);

  /* ритм: темп песни задаёт длину кадра в долях */
  const bpm = M && M.bpm ? M.bpm : 90;
  const beat = 60 / bpm;
  let bps = m.E < 0.35 ? 8 : m.E < 0.6 ? 4 : m.E < 0.8 ? 4 : 2;
  if (R === 'kandinsky' || R === 'matisse') bps = Math.min(bps, 4);
  let shot = bps * beat;
  while (shot > 7.5 && bps > 1) { bps /= 2; shot = bps * beat; }
  while (shot < 1.5) { bps *= 2; shot = bps * beat; }
  if (R === 'ma') while (shot < 5.5 && bps * 2 * beat <= 9) { bps *= 2; shot = bps * beat; }
  S.bpm = bpm; S.beat = beat; S.beatsPerShot = bps; S.shotSec = shot;
  S.transition = { monet: 'dissolve', kandinsky: 'cut', ma: 'pause', film: 'drop', matisse: 'pop', nocturne: 'dissolve' }[R];
  S.transSec = { dissolve: Math.min(2.2, shot * 0.42), cut: 0, pause: Math.min(1.6, shot * 0.3), drop: 0.55, pop: 0.45 }[S.transition];
  if (R === 'ma') S.pauseSec = Math.min(1.4, beat * 2);
  S.introSec = U.clamp(Math.round(2.4 / beat) * beat, 1.6, 3.2);
  S.outroSec = 3.6;
  S.kenBurns = U.clamp(0.1 - 0.06 * m.E, 0.03, 0.1);
  S.pulse = U.clamp((m.E - 0.35) * 1.6);
  S.breathe = U.clamp(0.35 + 0.5 * (1 - m.E));

  /* слои погоды и деталей: слова текста → частицы в кадре */
  const ov = {}, why = {};
  const wh = T.weatherHits || {};
  const q = (arr) => (arr && arr.length ? '«' + arr.slice(0, 2).join('», «') + '»' : '');
  if (T.leaves || (T.season === 'autumn' && T.nature > 0)) { ov.leaves = 0.55 + 0.3 * m.E; why.leaves = T.leaves ? 'листья в тексте' : 'осень и природа в тексте'; }
  if (w.snow || (T.season === 'winter' && w.cold)) { ov.snow = 0.7; why.snow = q(wh.snow) || q(wh.cold); }
  if (w.rain) { ov[R === 'nocturne' ? 'glassRain' : 'rain'] = 0.75; why[R === 'nocturne' ? 'glassRain' : 'rain'] = q(wh.rain); }
  if (T.season === 'spring' && T.nature > 0) { ov.petals = 0.5; why.petals = 'весна и природа в тексте'; }
  if ((T.season === 'summer' || w.sun) && (R === 'monet' || R === 'film')) { ov.dust = 0.45; why.dust = w.sun ? q(wh.sun) : 'лето'; }
  if ((tod === 'night' || tod === 'evening') && (T.lights > 0 || T.urban > 0) && S.dark) { ov.bokeh = 0.6; why.bokeh = T.lights > 0 ? 'огни в тексте' : 'город в темноте'; }
  if (w.fog) { ov.fog = 0.6; why.fog = q(wh.fog); } else if (R === 'ma' && (tod === 'morning' || w.snow)) { ov.fog = 0.3; why.fog = 'тихое утро'; }
  if (T.stars && (tod === 'night' || tod === 'evening')) { ov.stars = 0.6; why.stars = 'звёзды в тексте'; }
  if (R === 'film') { ov.leaks = 0.5 + 0.4 * m.N; why.leaks = 'ностальгия ' + Math.round(m.N * 100) + '%'; }
  if (R === 'matisse' && T.social > 0.4) { ov.confetti = 0.6; why.confetti = 'праздник и люди в тексте'; }
  S.overlays = ov; S.overlayWhy = why;

  S.type = { voice: R === 'kandinsky' || R === 'matisse' ? 'struct' : 'lyric', upper: R === 'kandinsky' };

  /* голос озвучки по правилам системы */
  const rate = +(0.8 + 0.35 * m.E).toFixed(2);
  const pitch = +(0.85 + 0.25 * m.V).toFixed(2);
  const pauseMs = Math.round(250 + 900 * (1 - m.E));
  const timbre = m.V < 0.4 || tod === 'night' ? 'low' : 'bright';
  const parts = [];
  parts.push(m.E < 0.35 ? 'медленно' : m.E > 0.65 ? 'живо, в темпе дня' : 'спокойно');
  if (m.V < 0.4) parts.push('негромко и ниже обычного');
  if (m.W > 0.6) parts.push('тепло, как близкому другу');
  if (pauseMs > 800) parts.push('с долгими паузами');
  S.voice = { rate, pitch, pauseMs, timbre, remark: parts.join(', ') };
  return S;
}

/* ---------- 5. названия цветов ---------- */
function colorName(rgb) {
  const [L, C, h] = U.rgb2lch(rgb);
  if (L < 16) return 'почти чёрный';
  if (C < 9) return L > 88 ? 'белый' : L > 64 ? 'светло-серый' : L > 34 ? 'серый' : 'графитовый';
  if (h < 25 || h >= 345) return L > 72 ? 'розовый' : L < 36 ? 'бордовый' : 'красный';
  if (h < 50) return L > 72 ? 'персиковый' : C > 55 ? 'красный' : L < 42 ? 'бордовый' : 'терракотовый';
  if (h < 76) return L < 45 ? 'коричневый' : L > 74 && C < 35 ? 'бежевый' : 'оранжевый';
  if (h < 96) return L > 80 && C < 30 ? 'песочный' : L < 50 ? 'коричневый' : 'охристый';
  if (h < 116) return L > 74 ? 'жёлтый' : 'охристый';
  if (h < 162) return C < 25 ? 'оливковый' : L < 40 ? 'тёмно-зелёный' : 'зелёный';
  if (h < 216) return 'бирюзовый';
  if (h < 276) return L > 62 ? 'голубой' : 'синий';
  if (h < 316) return L < 30 ? 'тёмно-синий' : C < 30 && L > 55 ? 'сизый' : 'синий';
  return L > 65 ? 'сиреневый' : 'фиолетовый';
}

/* ---------- 6. объяснение: сигнал → правило → эффект ---------- */
const KEYS_RU = { major: 'мажор', minor: 'минор' };
/* тональность называем, только если анализ в ней уверен: иначе честно «лад неоднозначен» */
const KEY_CONF = 0.6;
const keyShown = (M) => (M && M.keyName && (M.modeConf ?? 1) >= KEY_CONF ? M.keyName : null);
const TOD_RU = { morning: 'утро', day: 'день', evening: 'вечер', night: 'ночь' };
const SEASON_RU = { autumn: 'осень', winter: 'зима', spring: 'весна', summer: 'лето' };
const pct = (x) => Math.round(x * 100) + '%';
const beatsWord = (n) => `${n} ${U.plural(n, 'долю', 'доли', 'долей')}`;

function explain(day, S) {
  const T = day.text, P = day.photos, M = day.music, m = S.mood;
  const lines = [];
  const reg = REG[S.register];
  const trans = { dissolve: 'мягкие наплывы', cut: 'склейки ровно в долю', pause: 'между кадрами пауза пустой страницы', drop: 'новый отпечаток падает на стопку', pop: 'кадры выпрыгивают на сильную долю' }[S.transition];
  if (M && M.source === 'audio') {
    const loud = M.loud > 0.6 ? 'плотная и громкая' : M.loud < 0.35 ? 'тихая' : 'средней громкости';
    lines.push({ k: 'Музыка', t: `${M.bpmConf != null && M.bpmConf < 0.4 ? '≈' : ''}${Math.round(M.bpm)} BPM${M.bpmConf != null && M.bpmConf < 0.4 ? ' (темп — оценка: доли в песне выражены слабо)' : ''}, ${keyShown(M) ? keyShown(M) + ' (оценка)' : `лад неоднозначен (скорее ${KEYS_RU[M.mode]}, уверенность ${pct(M.modeConf || 0)})`}, ${loud} → кадр меняется каждые ${beatsWord(S.beatsPerShot)} (≈${U.fmtNum(S.shotSec, 1)} с), ${trans}. Громкость песни в каждый момент управляет светом и «дыханием» кадра.` });
  } else if (M) {
    lines.push({ k: 'Музыка', t: `по описанию: ${M.describeLabel} → темп ${Math.round(M.bpm)} BPM, кадр каждые ${beatsWord(S.beatsPerShot)} (≈${U.fmtNum(S.shotSec, 1)} с), ${trans}.` });
  }
  if (M) {
    const modeTxt = (M.mode === 'minor' ? 'Минор' : 'Мажор') + (M.source === 'audio' && !keyShown(M) ? ' (оценка)' : '');
    lines.push({ k: 'Лад и воздух', t: `${modeTxt} и ${m.D < 0.4 ? 'мало событий' : m.D > 0.65 ? 'много событий' : 'средний ритм дня'} → воздух вокруг фото ${pct(S.air)}, насыщенность ×${U.fmtNum(S.sat, 2)}.` });
  }
  lines.push({ k: 'Режим', t: `энергия ${pct(m.E)}, тон ${pct(m.V)}, тепло ${pct(m.W)}${m.N > 0.35 ? ', ностальгия ' + pct(m.N) : ''} → «${reg.name}»: ${reg.technique}.` });
  const weatherWords = Object.keys(T.weatherHits || {}).flatMap((k) => T.weatherHits[k]).slice(0, 3);
  const shadowsSrc = weatherWords.length ? `«${weatherWords.join('», «')}»` : `${SEASON_RU[T.season]}${T.seasonSource === 'date' ? ' (по дате)' : ''}`;
  const lightWords = ((T.hits && (m.W > 0.5 ? T.hits.warm : T.hits.cold)) || []).slice(0, 3);
  const lightSrc = lightWords.length ? `«${lightWords.join('», «')}»` : (m.W > 0.5 ? 'тёплые тона фото' : 'холодные тона фото');
  lines.push({ k: 'Тени и свет', t: `погода красит тени, люди красят свет: ${shadowsSrc} → тени ${m.T < 0.5 ? 'холодные, синеватые' : 'тёплые, янтарные'}; ${lightSrc} → свет ${m.W > 0.5 ? 'тёплый, персиковый' : 'серебристый, прохладный'}.` });
  const todLight = { morning: 'бледное золото, низкий контраст', day: 'ровный чистый свет', evening: 'тёплая виньетка, свет сбоку', night: 'глубокая тень и точечные огни' }[S.tod];
  lines.push({ k: 'Время суток', t: `${TOD_RU[S.tod]} (${S.todSource}) → ${todLight}.` });
  const ovNames = { leaves: 'падают листья', snow: 'идёт снег', rain: 'косой дождь', glassRain: 'капли стекают по стеклу', petals: 'летят лепестки', dust: 'в свете плавает пыль', bokeh: 'размытые огни', fog: 'стелется туман', stars: 'мерцают звёзды', leaks: 'плёночные засветки', confetti: 'летит конфетти' };
  const ovs = Object.keys(S.overlays).filter((k) => ovNames[k]).map((k) => `${(S.overlayWhy && S.overlayWhy[k]) || 'текст'} → ${ovNames[k]}`);
  if (ovs.length) lines.push({ k: 'Детали', t: ovs.join('; ') + '.' });
  if (P && P.palette) {
    const names = [...new Set(P.palette.slice(0, 4).map((p) => colorName(p.rgb)))].slice(0, 3);
    const light = P.lum > 0.62 ? 'светлые' : P.lum < 0.3 ? 'тёмные' : 'среднего света';
    lines.push({ k: 'Фото', t: `${P.count} ${U.plural(P.count, 'снимок', 'снимка', 'снимков')}, ${light}, преобладают ${names.join(', ')} → палитра дня собрана из самих снимков и переработана под режим.` });
  }
  const v = S.voice;
  lines.push({ k: 'Голос', t: `${v.timbre === 'low' ? 'низкий тембр' : 'светлый тембр'}, темп ${U.fmtNum(v.rate, 2)}, паузы ${U.fmtNum(v.pauseMs / 1000, 1)} с — читать ${v.remark}.` });
  return lines;
}

PV.Mood = { keyShown, KEY_CONF, REG, ORDER, fuse, scoreRegisters, buildStyle, explain, colorName, resolveTod, TOD_RU, SEASON_RU };
})();
