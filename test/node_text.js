// Быстрые проверки разбора текста, названий и выбора режима (node).
require('../src/util.js'); require('../src/lexicon.js'); require('../src/text.js'); require('../src/title.js'); require('../src/mood.js');
const PV = globalThis.PV;

const photo = (o) => Object.assign({ count: 3, lum: 0.55, sat: 0.35, warm: 0.2, edges: 0.3, contrast: 0.18, darkFrac: 0.1,
  palette: [{ rgb: [200, 150, 60], weight: 0.4 }, { rgb: [120, 90, 50], weight: 0.3 }, { rgb: [230, 220, 200], weight: 0.3 }] }, o);
const music = (o) => Object.assign({ source: 'audio', bpm: 100, loud: 0.5, onsetN: 0.4, brightness: 0.5, mode: 'major', modeConf: 0.6, vintage: 0, year: null }, o);

const days = [
  { name: 'осенний парк (ждём Моне)', date: '2026-10-20', text: 'Гуляли по парку, всё в жёлтых листьях, было холодно, но мы пили какао и долго разговаривали.',
    P: photo({ warm: 0.5, lum: 0.6 }), M: music({ bpm: 72, loud: 0.35, onsetN: 0.25, mode: 'major', brightness: 0.4, year: 1957, genre: 'jazz' }) },
  { name: 'ночь в офисе (ждём Кандинского)', date: '2026-11-12', text: 'Срочная сдача проекта, ночь в офисе, в наушниках электронная музыка. Кофе, код, дедлайн в шесть утра.',
    P: photo({ warm: -0.5, lum: 0.25, darkFrac: 0.5, edges: 0.55, contrast: 0.28, sat: 0.2 }), M: music({ bpm: 128, loud: 0.8, onsetN: 0.8, mode: 'minor', brightness: 0.7, genre: 'electronic' }) },
  { name: 'тихое зимнее утро (ждём Ма)', date: '2026-01-14', text: 'Проснулась рано, одна. За окном снег и туман, тишина. Долго смотрела в окно.',
    P: photo({ count: 2, warm: -0.3, lum: 0.75, sat: 0.08, edges: 0.12, contrast: 0.1 }), M: music({ bpm: 62, loud: 0.25, onsetN: 0.12, mode: 'minor', brightness: 0.35 }) },
  { name: 'дача как в детстве (ждём Плёнку)', date: '2026-07-18', text: 'Поехали с друзьями на дачу, как в детстве. Купались в реке, жгли костёр, слушали старые песни на кассетах. Вспомнили школу.',
    P: photo({ count: 4, warm: 0.6, lum: 0.62, sat: 0.45 }), M: music({ bpm: 96, loud: 0.45, onsetN: 0.45, mode: 'major', year: 1978, vintage: 0.5 }) },
  { name: 'день рождения (ждём Вырезки)', date: '2026-05-03', text: 'День рождения подруги! Шарики, торт, все смеялись и танцевали до ночи, было очень весело.',
    P: photo({ count: 5, warm: 0.4, lum: 0.6, sat: 0.6, edges: 0.45 }), M: music({ bpm: 120, loud: 0.75, onsetN: 0.7, mode: 'major', brightness: 0.65 }) },
  { name: 'дождливый вечер (ждём Ноктюрн)', date: '2026-09-28', text: 'Долгий тяжёлый день. Вечером шёл дождь, я шла домой одна, фонари расплывались в лужах. Было грустно.',
    P: photo({ count: 2, warm: -0.2, lum: 0.22, darkFrac: 0.55, sat: 0.25 }), M: music({ bpm: 66, loud: 0.3, onsetN: 0.2, mode: 'minor', brightness: 0.35 }) },
];

for (const d of days) {
  const T = PV.Text.analyze(d.text, d.date);
  const S = PV.Mood.buildStyle({ text: T, photos: d.P, music: d.M, seed: 42 });
  const titles = PV.Title.make(T, { tod: S.tod, season: S.season, register: S.register, seed: 42 });
  const sc = Object.entries(S.regScores).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}:${v.toFixed(2)}`).join(' ');
  console.log(`\n== ${d.name}\n  режим: ${S.register}   [${sc}]`);
  console.log(`  E=${S.mood.E.toFixed(2)} V=${S.mood.V.toFixed(2)} W=${S.mood.W.toFixed(2)} T=${S.mood.T.toFixed(2)} D=${S.mood.D.toFixed(2)} N=${S.mood.N.toFixed(2)}  tod=${S.tod} season=${S.season}`);
  console.log(`  место=${T.place && T.place.nom} кто=${T.who && T.who.ins} деталь=${T.detail && T.detail.nom} событие=${T.event && T.event.nom}`);
  console.log('  названия:', titles.slice(0, 4).map((t) => t.s).join(' | '));
  console.log('  подписи:', PV.Text.pickCaptions(T, 3).join(' / '));
  console.log('  слои:', JSON.stringify(S.overlays), 'кадр', S.shotSec.toFixed(2), 'с', S.transition);
  for (const l of PV.Mood.explain({ text: T, photos: d.P, music: d.M }, S)) console.log('   •', l.k + ':', l.t);
}
