// Быстрые проверки разбора текста, названий и выбора режима (node).
require('../src/util.js'); require('../src/lexicon.js'); require('../src/text.js'); require('../src/title.js'); require('../src/mood.js'); require('../src/scene.js');
const PV = globalThis.PV;
const assert = require('assert');
let fails = 0;
const check = (cond, msg) => { if (cond) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };

const photo = (o) => Object.assign({ count: 3, lum: 0.55, sat: 0.35, warm: 0.2, edges: 0.3, contrast: 0.18, darkFrac: 0.1,
  palette: [{ rgb: [200, 150, 60], weight: 0.4 }, { rgb: [120, 90, 50], weight: 0.3 }, { rgb: [230, 220, 200], weight: 0.3 }] }, o);
const music = (o) => Object.assign({ source: 'audio', bpm: 100, loud: 0.5, onsetN: 0.4, brightness: 0.5, mode: 'major', modeConf: 0.6, vintage: 0, year: null }, o);

const days = [
  { name: 'осенний парк (ждём Моне)', expect: 'monet', date: '2026-10-20', text: 'Гуляли по парку, всё в жёлтых листьях, было холодно, но мы пили какао и долго разговаривали.',
    P: photo({ warm: 0.5, lum: 0.6 }), M: music({ bpm: 72, loud: 0.35, onsetN: 0.25, mode: 'major', brightness: 0.4, year: 1957, genre: 'jazz' }) },
  { name: 'ночь в офисе (ждём Кандинского)', expect: 'kandinsky', date: '2026-11-12', text: 'Срочная сдача проекта, ночь в офисе, в наушниках электронная музыка. Кофе, код, дедлайн в шесть утра.',
    P: photo({ warm: -0.5, lum: 0.25, darkFrac: 0.5, edges: 0.55, contrast: 0.28, sat: 0.2 }), M: music({ bpm: 128, loud: 0.8, onsetN: 0.8, mode: 'minor', brightness: 0.7, genre: 'electronic' }) },
  { name: 'тихое зимнее утро (ждём Ма)', expect: 'ma', date: '2026-01-14', text: 'Проснулась рано, одна. За окном снег и туман, тишина. Долго смотрела в окно.',
    P: photo({ count: 2, warm: -0.3, lum: 0.75, sat: 0.08, edges: 0.12, contrast: 0.1 }), M: music({ bpm: 62, loud: 0.25, onsetN: 0.12, mode: 'minor', brightness: 0.35 }) },
  { name: 'дача как в детстве (ждём Плёнку)', expect: 'film', date: '2026-07-18', text: 'Поехали с друзьями на дачу, как в детстве. Купались в реке, жгли костёр, слушали старые песни на кассетах. Вспомнили школу.',
    P: photo({ count: 4, warm: 0.6, lum: 0.62, sat: 0.45 }), M: music({ bpm: 96, loud: 0.45, onsetN: 0.45, mode: 'major', year: 1978, vintage: 0.5 }) },
  { name: 'день рождения (ждём Вырезки)', expect: 'matisse', date: '2026-05-03', text: 'День рождения подруги! Шарики, торт, все смеялись и танцевали до ночи, было очень весело.',
    P: photo({ count: 5, warm: 0.4, lum: 0.6, sat: 0.6, edges: 0.45 }), M: music({ bpm: 120, loud: 0.75, onsetN: 0.7, mode: 'major', brightness: 0.65 }) },
  { name: 'дождливый вечер (ждём Ноктюрн)', expect: 'nocturne', date: '2026-09-28', text: 'Долгий тяжёлый день. Вечером шёл дождь, я шла домой одна, фонари расплывались в лужах. Было грустно.',
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
  check(S.register === d.expect, `режим ${d.expect}`);
  const words = titles[0].s.split(/\s+/).length;
  check(words >= 3 && words <= 7, `название из 3–7 слов («${titles[0].s}»)`);
  check(PV.Text.pickCaptions(T, 3).length > 0, 'есть подписи из текста');
}
// «домой» — это дорога, а не «дома»
{
  const T = PV.Text.analyze('Вечером я шла домой одна под дождём.', '2026-09-28');
  check(!(T.place && T.place.nom === 'дом'), '«шла домой» не превращается в «дома»');
}
// сцены из текста: кто в кадре, погода по ходу дня, подписи без обрывов
{
  const text = 'Утром мы с подругой пили кофе в кафе у окна, за окном шёл снег и было очень уютно и тепло. Потом позвонила мама. Днём гуляли по набережной, дул ветер. Вечером зажглись огни. Домой ехала в пустом трамвае и слушала музыку.';
  const T = PV.Text.analyze(text, '2026-12-05');
  const S = PV.Mood.buildStyle({ text: T, photos: photo({}), music: music({}), seed: 7 });
  const sc = PV.Scene.plan(T, S, 7);
  console.log('\n== сцены');
  sc.forEach((x) => console.log('  ', `«${x.caption}» → ${PV.Scene.describe(x)} [${x.tod}]`));
  check(sc.length >= 3 && sc.length <= 7, `сцен от 3 до 7 (${sc.length})`);
  check(sc.every((x) => !x.caption || (!/…$/.test(x.caption) && !/\s(и|а|но|с|в|на)$/i.test(x.caption))), 'подписи не обрываются на полуслове');
  check(sc.every((x) => !x.caption || x.caption.split(/\s+/).length <= 12), 'подписи не длиннее 12 слов');
  check(sc[0].people === 'two', 'утром в кафе — двое');
  const call = sc.find((x) => /позвонила/.test(x.text));
  check(!call || call.people !== 'two', '«позвонила мама» не рисует маму рядом');
  const tram = sc.find((x) => /трамва/.test(x.text));
  check(tram && tram.people === 'alone', '«домой ехала в пустом трамвае» — одна фигура');
  check(sc[0].place === 'cafe', 'первая сцена — кафе');
  const rainT = PV.Text.analyze('Утром гуляли с подругой по парку. Пили какао на скамейке. Вечером пошёл дождь. Я шла домой одна.', '2026-10-10');
  const rs = PV.Scene.plan(rainT, PV.Mood.buildStyle({ text: rainT, photos: photo({}), music: music({}), seed: 3 }), 3);
  check(!rs[0].weather.includes('rain') && rs[rs.length - 1].weather.includes('rain'), 'дождь начинается с момента, когда о нём сказано');
  check(rs[0].people === 'two' && rs[rs.length - 1].people === 'alone', 'двое держатся, пока текст не скажет «одна»');
}
// место и название: транспорт важнее цели, «о доме» — тема, звонок — не спутник
{
  const text = 'Утром мне позвонила мама. Потом я одна ехала на работу в пустом автобусе. Днём с друзьями гуляли в парке, под ногами шуршали листья. Вечером сидели в кафе, и мы долго говорили о доме. Ночью смотрела в окно на огни города.';
  const T = PV.Text.analyze(text, '2026-10-20');
  const S = PV.Mood.buildStyle({ text: T, photos: photo({}), music: music({}), seed: 11 });
  const sc = PV.Scene.plan(T, S, 11);
  console.log('\n== место и название');
  sc.forEach((x) => console.log('  ', `«${x.caption}» → ${PV.Scene.describe(x)} [${x.tod}]`));
  const titles = PV.Title.make(T, { tod: S.tod, season: S.season, register: S.register, seed: 11 });
  console.log('   название:', titles[0].s);
  const bus = sc.find((x) => /автобус/.test(x.text));
  check(bus && bus.place === 'road', '«ехала на работу в автобусе» — дорога, а не офис');
  check(!sc.some((x) => x.place === 'office'), 'офиса нет ни в одной сцене');
  check(sc[0].place !== 'office' && sc[0].objs.includes('phone'), 'звонок утром — телефон, не офис');
  const talk = sc.find((x) => /о доме/.test(x.text));
  check(talk && talk.place === 'cafe', '«говорили о доме» — всё ещё кафе');
  check(!/мам/.test(titles[0].s) && !/дома/.test(titles[0].s), `в названии нет мамы и «дома» («${titles[0].s}»)`);
  // «Вместе»: тёмный синий снимок — к ночи, жёлтый — к парку
  const parkA = { lum: 0.6, darkFrac: 0.1, warm: 0.4, sat: 0.45, palette: [{ rgb: [220, 170, 50], weight: 0.6 }, { rgb: [110, 140, 60], weight: 0.4 }] };
  const nightA = { lum: 0.2, darkFrac: 0.7, warm: -0.2, sat: 0.3, palette: [{ rgb: [30, 40, 90], weight: 0.7 }, { rgb: [240, 200, 120], weight: 0.3 }] };
  const m = PV.Scene.matchPhotos(sc, [nightA, parkA]);
  const parkIdx = sc.findIndex((x) => x.place === 'park'), nightIdx = sc.findIndex((x) => x.tod === 'night');
  check(m.bySc.get(parkIdx) === 1, 'жёлто-зелёный снимок встал в сцену парка');
  check(m.bySc.get(nightIdx) === 0 || m.extra.includes(0), 'тёмный снимок — к ночи или в конец, но не в парк');
}
// «Вместе» на дне жюри: фото по месту и предмету, фразы без места остаются нарисованными
{
  const text = 'Утром мне позвонила мама. Потом я одна ехала на работу в пустом автобусе. В офисе мы с командой пили кофе и спорили о дизайне. Вечером мы с друзьями гуляли по парку, под ногами шуршали листья. И мы долго говорили о доме. Ночью смотрела в окно на огни города.';
  const T = PV.Text.analyze(text, '2026-10-20');
  const S = PV.Mood.buildStyle({ text: T, photos: photo({}), music: music({}), seed: 5 });
  const sc = PV.Scene.plan(T, S, 5);
  const title = PV.Title.make(T, { tod: S.tod, season: S.season, register: S.register, seed: 5 })[0].s;
  const park = { lum: 0.58, darkFrac: 0.08, warm: 0.3, sat: 0.45, palette: [{ rgb: [120, 160, 60], weight: 0.45 }, { rgb: [225, 185, 60], weight: 0.35 }, { rgb: [200, 200, 190], weight: 0.2 }] };
  const cocoa = { lum: 0.42, darkFrac: 0.2, warm: 0.5, sat: 0.4, palette: [{ rgb: [110, 70, 45], weight: 0.55 }, { rgb: [200, 160, 120], weight: 0.3 }, { rgb: [240, 230, 220], weight: 0.15 }] };
  const office = { lum: 0.22, darkFrac: 0.65, warm: -0.3, sat: 0.3, palette: [{ rgb: [25, 35, 80], weight: 0.6 }, { rgb: [90, 140, 220], weight: 0.25 }, { rgb: [240, 220, 160], weight: 0.15 }] };
  const m = PV.Scene.matchPhotos(sc, [park, cocoa, office]);
  console.log('\n== «Вместе» на дне жюри   название:', title);
  sc.forEach((x, i) => console.log('  ', `«${x.caption}» → ${PV.Scene.describe(x)} [${x.tod}]`, m.bySc.has(i) ? `📷 ${['парк', 'какао', 'офис'][m.bySc.get(i)]}` : ''));
  const at = (re) => sc.findIndex((x) => re.test(x.text));
  check(sc[at(/В офисе/)].place === 'office', '«В офисе … пили кофе» — офис, а не дорога');
  check(m.bySc.get(at(/парку/)) === 0, 'фото парка — к фразе про парк');
  check(m.bySc.get(at(/кофе/)) === 1, 'фото какао — к фразе про кофе');
  check(!m.bySc.has(at(/о доме/)), '«говорили о доме» остаётся нарисованным');
  check(!/офис/i.test(title) || !/ночь/i.test(title), `время суток и место в названии — из одной части дня («${title}»)`);
}
// первая фраза без места берёт место следующей, если та называет его сразу (замечание жюри: «сдача проекта» → «дом»)
{
  const T = PV.Text.analyze('Срочная сдача проекта. Ночь в офисе, в наушниках электронная музыка, кофе остыл, код не собирается. Дедлайн в шесть утра.', '2026-11-12');
  const S = PV.Mood.buildStyle({ text: T, photos: photo({}), music: music({}), seed: 9 });
  const sc = PV.Scene.plan(T, S, 9);
  console.log('\n== сдача проекта');
  sc.forEach((x) => console.log('  ', `«${x.caption}» → ${PV.Scene.describe(x)} [${x.tod}]`));
  check(sc[0].place === 'office', '«Срочная сдача проекта» — офис, а не дом');
  const T2 = PV.Text.analyze('Проснулась рано, за окном ещё темно. Потом поехала в офис на автобусе.', '2026-11-12');
  const sc2 = PV.Scene.plan(T2, PV.Mood.buildStyle({ text: T2, photos: photo({}), music: music({}), seed: 9 }), 9);
  check(sc2[0].place === 'home', '«Проснулась рано» — всё ещё дом');
}
// тональность в кадре — только при уверенности анализа
{
  check(PV.Mood.keyShown({ keyName: 'соль мажор', modeConf: 0.45 }) === null, 'при уверенности 0,45 тональность не называется');
  check(PV.Mood.keyShown({ keyName: 'ми минор', modeConf: 0.8 }) === 'ми минор', 'при уверенности 0,8 тональность называется');
}
console.log(fails ? `\nПровалено проверок: ${fails}` : '\nВсе проверки пройдены');
process.exitCode = fails ? 1 : 0;
