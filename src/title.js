/* Послевкусие — названия папок дня. Тон: как подпись на обороте фотографии.
   3–7 слов, без глаголов и эмоций «в лоб», с одной конкретной деталью. */
(function () {
'use strict';
const PV = (globalThis.PV = globalThis.PV || {});
const U = PV.U, L = PV.Lex;

const wc = (s) => s.trim().split(/\s+/).length;

function makeTitles(T, ctx) {
  const r = U.rng(ctx.seed || 1);
  const todKey = ctx.tod || T.tod || 'day';
  const tod = L.todNoun[todKey];
  const sA = L.seasonAdj[ctx.season || T.season] || L.seasonAdj.autumn;
  const place = T.place, who = T.who, detail = T.detail, ev = T.event;
  let wAdj = null;
  for (const k of ['snow', 'rain', 'fog', 'storm', 'cold', 'wind', 'sun']) if (T.weather && T.weather[k]) { wAdj = L.weatherAdj[k]; break; }
  const regList = L.moodAdj[ctx.register] || L.moodAdj.monet;
  const mAdj = todKey === 'night' && ctx.register === 'kandinsky' ? L.nightAdj : regList[Math.floor(r() * regList.length)];
  const A = (adj, g, c = 'nom') => adj[c][g];
  const Tod = U.cap(tod.noun);
  const out = [];
  const add = (s, score, pattern) => {
    s = U.cap(s.replace(/\s+/g, ' ').trim());
    const n = wc(s);
    if (n < 3 || n > 7) return;
    if (!out.find((c) => c.s === s)) out.push({ s, score, pattern });
  };
  const loc = (p) => (p.case === 'adv' ? p.noun : `${p.prep} ${p.noun}`);

  if (ev && ev.before && place) add(`${Tod} ${loc(place)} ${ev.before}`, 10, 'время суток + место + событие');
  if (ev && ev.before) add(`${A(mAdj, tod.g)} ${tod.noun} ${ev.before}`, 8.5, 'настроение + время суток + событие');
  if (ev && !ev.before && who && !who.alone) add(`${ev.nom} ${who.ins}`, 8.8, 'событие + с кем');
  if (ev && !ev.before && place && place.case !== 'adv') add(`${ev.nom} ${loc(place)}`, 8.4, 'событие + место');
  if (who && place && place.case !== 'adv') add(`${Tod} ${sA.adv} ${who.ins} ${loc(place)}`, todKey === 'day' ? 7 : 9, 'время суток + сезон + с кем + место');
  if (who && wAdj) add(`${A(wAdj, tod.g)} ${tod.noun} ${who.ins}`, 7.6, 'погода + время суток + с кем');
  if (place && detail && !place.fixed && place.case !== 'adv') add(`${A(sA, place.g)} ${place.nom} и ${detail.nom}`, 8.6, 'сезон + место + деталь');
  if (place && who) add(`${Tod} ${loc(place)} ${who.ins}`, 8.2, 'время суток + место + с кем');
  if (detail && place && place.case !== 'adv' && !place.fixed) add(`${U.cap(detail.nom)} ${place.prep} ${A(sA, place.g, place.case)} ${place.noun}`, 8, 'деталь + место в сезоне');
  if (who && detail && detail.kind !== 'weather') add(`${U.cap(detail.nom)} ${who.ins} ${tod.adv}`, 6.4, 'деталь + с кем + время суток');
  if (who) add(`${A(mAdj, tod.g)} ${tod.noun} ${who.ins}`, 7.2, 'настроение + время суток + с кем');
  if (place && who && !place.fixed && place.case !== 'adv') add(`${A(sA, place.g)} ${place.nom} ${who.ins}`, 7.4, 'сезон + место + с кем');
  if (place && detail) add(`${U.cap(detail.nom)} ${loc(place)} ${tod.adv}`, 7, 'деталь + место + время суток');
  if (place) add(`${A(wAdj || mAdj, tod.g)} ${tod.noun} ${loc(place)}`, 6.8, 'погода или настроение + время суток + место');
  if (detail && detail.kind !== 'weather') add(`${A(wAdj || mAdj, tod.g)} ${tod.noun} и ${detail.nom}`, 6.6, 'настроение + время суток + деталь');
  add(`${A(wAdj || mAdj, tod.g)} ${A(sA, tod.g)} ${tod.noun}`, 6.2, 'погода или настроение + сезон + время суток');
  add(`${A(mAdj, tod.g)} ${A(sA, tod.g)} ${tod.noun}`, 5, 'настроение + сезон + время суток');
  add(`${A(mAdj, 'm')} ${A(sA, 'm')} день`, 4, 'настроение + сезон');
  out.sort((a, b) => b.score - a.score);
  return out;
}

PV.Title = { make: makeTitles };
})();
