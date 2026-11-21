/* Послевкусие — разбор записи дня: настроение, сезон, время суток, погода, места, люди, детали, фразы для подписей. */
(function () {
'use strict';
const PV = (globalThis.PV = globalThis.PV || {});
const U = PV.U, L = PV.Lex;

const yo = (s) => s.replace(/ё/g, 'е').replace(/Ё/g, 'Е');
const NEGATORS = new Set(['не', 'нет', 'без', 'ни', 'not', "don't", 'no']);

/* компиляция шаблонов словаря */
const cache = new Map();
function compile(list) {
  if (cache.has(list)) return cache.get(list);
  const out = list.map((p) => {
    let w = 1, s = p;
    const m = /^(.*):([0-9.]+)$/.exec(p);
    if (m) { s = m[1]; w = parseFloat(m[2]); }
    s = yo(s.toLowerCase());
    if (s.startsWith('=')) return { type: 'exact', w: s.slice(1), weight: w };
    if (s.includes(' ')) return { type: 'phrase', w: s, weight: w };
    return { type: 'prefix', w: s, weight: w };
  });
  cache.set(list, out);
  return out;
}

function prepare(text) {
  const norm = yo(String(text || '').toLowerCase());
  const tokens = norm.match(/[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*/gu) || [];
  const padded = ' ' + tokens.join(' ') + ' ';
  return { norm, tokens, padded };
}

/* подсчёт совпадений; при negate — учитываем «не» перед словом */
function scan(doc, list, opts = {}) {
  const pats = compile(list);
  let score = 0, negScore = 0;
  const hits = [], pos = [];
  const { tokens, padded } = doc;
  for (const p of pats) {
    if (p.type === 'phrase') {
      let idx = padded.indexOf(' ' + p.w);
      while (idx !== -1) {
        score += p.weight; hits.push(p.w);
        pos.push(padded.slice(0, idx).split(' ').length - 1);
        idx = padded.indexOf(' ' + p.w, idx + 1);
      }
      continue;
    }
    for (let i = 0; i < tokens.length; i++) {
      const t = tokens[i];
      const ok = p.type === 'exact' ? t === p.w : t.startsWith(p.w);
      if (!ok) continue;
      const negated = opts.negate && (NEGATORS.has(tokens[i - 1]) || (tokens[i - 2] === 'не' && /^(очень|слишком|так|особо|совсем)$/.test(tokens[i - 1] || '')));
      if (negated) negScore += p.weight; else { score += p.weight; hits.push(t); pos.push(i); }
    }
  }
  return { score, negScore, hits: [...new Set(hits)], pos, first: pos.length ? Math.min(...pos) : Infinity };
}

function pickEntity(doc, entries) {
  let best = null;
  for (const e of entries) {
    const r = scan(doc, e.k);
    if (!r.hits.length) continue;
    const cand = { e, n: r.hits.length + r.score * 0.01, first: r.first };
    if (!best || cand.n > best.n || (cand.n === best.n && cand.first < best.first)) best = cand;
  }
  return best ? best.e : null;
}

const PAST_STOP = new Set(['был', 'была', 'было', 'были', 'стол', 'пол', 'зал', 'мол', 'тепло', 'светло', 'холодно', 'тихо', 'мило', 'весело', 'ясно', 'около', 'сколько', 'только', 'столько', 'очень', 'стало', 'мало', 'мало']);
function countPastVerbs(tokens) {
  let n = 0; const seen = new Set();
  for (const t of tokens) {
    if (t.length < 4 || PAST_STOP.has(t) || seen.has(t)) continue;
    if (/(ли|ла|лся|лась|лись|лось)$/.test(t) || /[аеиоуыяю]л$/.test(t)) { n++; seen.add(t); }
  }
  return n;
}

/* разбиваем текст на фразы для подписей */
function splitClauses(text) {
  const src = String(text || '').replace(/\s+/g, ' ').trim();
  const sentences = [];
  let cur = '';
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]; cur += ch;
    if (/[.!?…]/.test(ch) && (i + 1 >= src.length || src[i + 1] === ' ')) { sentences.push(cur.trim()); cur = ''; }
  }
  if (cur.trim()) sentences.push(cur.trim());
  const out = [];
  for (const s of sentences) {
    const parts = s.split(/\s*[,;:]\s+|\s+[—–-]\s+|\s+(?=(?:но|а потом|и потом|потом|а ещё|а еще)\s)/i);
    for (let p of parts) {
      p = p.replace(/^[\s«"'(]+|[\s.!?…»"')]+$/g, '').trim();
      if (!p) continue;
      const words = p.split(/\s+/);
      if (words.length > 13) {
        /* длинную фразу режем по «и» ближе к середине */
        const cut = words.findIndex((w, i) => i >= 4 && i <= words.length - 3 && /^(и|а|чтобы|когда)$/i.test(w));
        if (cut > 0) { out.push(words.slice(0, cut).join(' ')); out.push(words.slice(cut).join(' ')); continue; }
        out.push(words.slice(0, 11).join(' ') + '…');
        continue;
      }
      out.push(p);
    }
  }
  return out.filter((c) => c.split(/\s+/).length >= 2 || c.length >= 8);
}

function scoreClause(c) {
  const d = prepare(c);
  let s = 0;
  const lists = [L.senses, L.colors, L.nature, L.warm, L.lights, L.details.flatMap((x) => x.k), L.weather.rain, L.weather.snow, L.weather.sun, L.weather.cold, L.weather.fog];
  for (const lst of lists) s += Math.min(1.5, scan(d, lst).hits.length);
  if (d.tokens.includes('мы')) s += 0.3;
  const n = d.tokens.length;
  if (n >= 4 && n <= 9) s += 0.6; else if (n < 3) s -= 0.6; else if (n > 11) s -= 0.3;
  if (/^(было|были|был|все|всё)\s/i.test(c) && n < 4) s -= 0.3;
  return s;
}

function analyzeText(text, dateStr) {
  const doc = prepare(text);
  const T = { raw: String(text || ''), words: doc.tokens.length };

  const pos = scan(doc, L.pos, { negate: true }), neg = scan(doc, L.neg, { negate: true });
  const P = pos.score + neg.negScore * 0.5, N = neg.score + pos.negScore * 0.7;
  T.valence = (P - N) / (P + N + 1);
  T.valenceConf = U.clamp((P + N) / 3);
  const hi = scan(doc, L.high), lo = scan(doc, L.low);
  T.arousal = (hi.score - lo.score) / (hi.score + lo.score + 1);
  T.arousalConf = U.clamp((hi.score + lo.score) / 3);
  const wa = scan(doc, L.warm), co = scan(doc, L.cold);
  T.warmth = (wa.score - co.score) / (wa.score + co.score + 1);
  T.warmthConf = U.clamp((wa.score + co.score) / 3);

  /* погода */
  T.weather = {}; T.weatherHits = {};
  for (const k of Object.keys(L.weather)) { const r = scan(doc, L.weather[k]); T.weather[k] = r.hits.length > 0; T.weatherHits[k] = r.hits; }

  /* сезон */
  let bestS = null, bestV = 0;
  for (const k of Object.keys(L.season)) { const v = scan(doc, L.season[k]).score; if (v > bestV) { bestV = v; bestS = k; } }
  if (bestS) { T.season = bestS; T.seasonSource = 'text'; } else {
    const m = dateStr ? U.month(dateStr) : new Date().getMonth();
    T.season = m <= 1 || m === 11 ? 'winter' : m <= 4 ? 'spring' : m <= 7 ? 'summer' : 'autumn';
    T.seasonSource = 'date';
  }

  /* время суток */
  let bestT = null, bestTV = 0;
  for (const k of Object.keys(L.tod)) { const v = scan(doc, L.tod[k]).score; if (v > bestTV) { bestTV = v; bestT = k; } }
  T.tod = bestT; T.todSource = bestT ? 'text' : null;

  /* температура погоды −1..1 */
  const cold = scan(doc, L.weather.cold).score + scan(doc, L.weather.snow).score * 0.6 + scan(doc, L.weather.wind).score * 0.3 + scan(doc, L.weather.rain).score * 0.25;
  const hot = scan(doc, L.weather.heat).score + scan(doc, L.weather.sun).score * 0.4;
  const seasonT = { winter: -0.6, autumn: -0.25, spring: 0.1, summer: 0.55 }[T.season];
  if (cold + hot > 0) { T.weatherTemp = U.clamp((hot - cold) / (hot + cold + 0.5), -1, 1) * 0.75 + seasonT * 0.25; T.weatherTempSource = 'text'; } else { T.weatherTemp = seasonT; T.weatherTempSource = 'season'; }

  /* темы */
  const lvl = (lst) => U.clamp(scan(doc, lst).score / 2);
  T.nature = lvl(L.nature); T.urban = lvl(L.urban); T.solitude = lvl(L.solitude); T.social = lvl(L.social);
  T.travel = lvl(L.travel); T.lights = lvl(L.lights);
  T.stars = scan(doc, ['звезд', 'звёзд', 'stars']).hits.length > 0;
  T.leaves = scan(doc, ['листопад', 'листья', 'листв', 'leaves']).hits.length > 0;
  const nos = scan(doc, L.nostalgia);
  T.nostalgia = U.clamp(nos.score * 0.35);

  /* плотность событий */
  const verbs = countPastVerbs(doc.tokens);
  const seq = scan(doc, L.events).score;
  const clauses = splitClauses(text);
  T.verbs = verbs;
  T.density = U.clamp((verbs + seq * 1.5 + clauses.length * 0.6) / 14);

  /* сущности для названия */
  T.place = pickEntity(doc, L.places);
  const companions = L.who.filter((w) => !w.alone);
  T.who = pickEntity(doc, companions) || pickEntity(doc, L.who.filter((w) => w.alone));
  const kindOrder = ['taste', 'light', 'sound', 'thing', 'weather'];
  let det = null;
  for (const kind of kindOrder) { det = pickEntity(doc, L.details.filter((d) => d.kind === kind)); if (det) break; }
  T.detail = det;
  T.event = null;
  for (const ev of L.eventsTitle) { if (scan(doc, ev.k).hits.length) { T.event = ev; break; } }

  T.hits = {
    pos: pos.hits, neg: neg.hits, high: hi.hits, low: lo.hits, warm: wa.hits, cold: co.hits, nostalgia: nos.hits,
  };

  /* фразы для подписей */
  const scored = clauses.map((c, i) => ({ text: U.cap(c), score: +scoreClause(c).toFixed(2), i }));
  T.clauses = scored;
  const top = [...scored].sort((a, b) => b.score - a.score);
  T.keyLine = top.length ? top[0].text : '';
  return T;
}

/* n лучших фраз в порядке текста */
function pickCaptions(T, n) {
  const scored = (T && T.clauses) || [];
  if (!scored.length) return [];
  const top = [...scored].sort((a, b) => b.score - a.score);
  return top.slice(0, Math.max(1, Math.min(n, scored.length))).sort((a, b) => a.i - b.i).map((c) => c.text);
}

PV.Text = { analyze: analyzeText, prepare, scan, splitClauses, pickCaptions };
})();
