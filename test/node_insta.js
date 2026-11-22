// Мгновения из Instagram: ZIP со сжатием и ZIP64, разбор выгрузки, EXIF, дни, черновик записи (node 22+).
require('../src/util.js'); require('../src/lexicon.js'); require('../src/text.js'); require('../src/mood.js'); require('../src/insta.js');
const PV = globalThis.PV, I = PV.Insta;
const { zip, mojibake } = require('../tools/zipwrite.js');
const fs = require('fs'), os = require('os'), path = require('path'), { execSync } = require('child_process');
let fails = 0;
const check = (cond, msg) => { if (cond) console.log('  ✓', msg); else { fails++; console.log('  ✗', msg); } };

/* JPEG с EXIF DateTimeOriginal (без картинки — разбору даты она не нужна) */
function jpegWithExif(dt) {
  const ascii = Buffer.from(dt + '\0', 'ascii');
  const tiff = Buffer.alloc(8 + 2 + 12 + 4 + 2 + 12 + 4 + ascii.length);
  tiff.write('II', 0); tiff.writeUInt16LE(42, 2); tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(1, 8); /* IFD0: одна запись — указатель на Exif IFD */
  tiff.writeUInt16LE(0x8769, 10); tiff.writeUInt16LE(4, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt32LE(26, 18); tiff.writeUInt32LE(0, 22);
  tiff.writeUInt16LE(1, 26); /* Exif IFD: DateTimeOriginal */
  tiff.writeUInt16LE(0x9003, 28); tiff.writeUInt16LE(2, 30); tiff.writeUInt32LE(ascii.length, 32); tiff.writeUInt32LE(44, 36); tiff.writeUInt32LE(0, 40);
  ascii.copy(tiff, 44);
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'binary'), tiff]);
  const len = Buffer.alloc(2); len.writeUInt16BE(app1.length + 2);
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), len, app1, Buffer.from([0xff, 0xda, 0, 2, 0xff, 0xd9])]);
}
const ts = (s) => Math.floor(new Date(s).getTime() / 1000);

(async () => {
  console.log('== EXIF и текст');
  const exifTs = I.exifDateFromBytes(new Uint8Array(jpegWithExif('2026:10:18 09:41:07')));
  check(exifTs === new Date(2026, 9, 18, 9, 41, 7).getTime(), 'дата съёмки из EXIF DateTimeOriginal');
  check(I.fixText(mojibake('Какао в парке ☕')) === 'Какао в парке ☕', 'русский текст из JSON Instagram восстанавливается');
  check(I.fixText('Already fine') === 'Already fine' && I.fixText('Уже нормально') === 'Уже нормально', 'нормальный текст не портится');
  const cc = I.cleanCaption('Наконец-то дома 🌧 #осень @friend https://t.co/x');
  check(cc.text === 'Наконец-то дома' && cc.extra.includes('дождь'), `подпись чистится от тегов и ссылок, эмодзи → слова («${cc.text}» + ${cc.extra})`);

  console.log('\n== выгрузка Instagram (ZIP, deflate, папка-обёртка)');
  const img = (name) => jpegWithExif('2026:01:01 12:00:00');
  const posts = [
    { media: [{ uri: 'media/posts/202610/a1.jpg', creation_timestamp: ts('2026-10-18T09:40:00'), title: mojibake('Утро, какао и жёлтые клёны') }], title: '', creation_timestamp: ts('2026-10-18T09:40:00') },
    { media: [{ uri: 'media/posts/202610/a2.jpg', creation_timestamp: ts('2026-10-18T18:05:00'), title: '' }, { uri: 'media/posts/202610/a3.jpg', creation_timestamp: ts('2026-10-18T18:06:00'), title: '' }], title: mojibake('Вечером пошёл дождь'), creation_timestamp: ts('2026-10-18T18:05:00') },
  ];
  const stories = { ig_stories: [{ uri: 'media/stories/202610/s1.mp4', creation_timestamp: ts('2026-10-19T22:30:00'), title: '' }, { uri: 'media/stories/202610/s2.jpg', creation_timestamp: ts('2026-10-19T23:10:00'), title: mojibake('ночь, огни') }] };
  const root = 'instagram-user-2026-11-20/';
  const files = [
    { name: root + 'your_instagram_activity/media/posts_1.json', data: JSON.stringify(posts) },
    { name: root + 'your_instagram_activity/media/stories.json', data: JSON.stringify(stories) },
    { name: root + 'media/posts/202610/a1.jpg', data: img() }, { name: root + 'media/posts/202610/a2.jpg', data: img() }, { name: root + 'media/posts/202610/a3.jpg', data: img() },
    { name: root + 'media/stories/202610/s1.mp4', data: Buffer.from('fake') }, { name: root + 'media/stories/202610/s2.jpg', data: img() },
    { name: root + 'media/instants/202611/i1.jpg', data: jpegWithExif('2026:11:02 08:15:00') },
    { name: root + 'media/other/profile.jpg', data: img() },
  ];
  const buf = zip(files);
  const entries = await I.openZip(new Blob([buf]));
  check(entries.length === files.length, `в архиве ${entries.length} файлов`);
  const back = await (await entries.find((e) => e.name.endsWith('posts_1.json')).read()).text();
  check(JSON.parse(back).length === 2, 'сжатый JSON распаковывается (deflate-raw)');
  const items = await I.parseExport(entries);
  check(items.length === 6, `найдено 6 снимков из постов, сторис и мгновений (${items.length}); аватар не попал`);
  const car = items.find((x) => x.name.endsWith('a3.jpg'));
  check(car && car.caption === 'Вечером пошёл дождь', 'у снимка карусели — подпись поста');
  const inst = items.find((x) => /i1\.jpg$/.test(x.name));
  check(inst && inst.source === 'instant' && inst.exact && I.dateKey(inst.ts) === '2026-11-02', 'мгновение без JSON: источник и дата из EXIF');
  check(items.find((x) => /s1\.mp4$/.test(x.name)).kind === 'video', 'видео сторис распознано');
  const days = I.groupDays(items);
  check(days.map((d) => d.date).join(',') === '2026-11-02,2026-10-19,2026-10-18', `дни по местной дате, новые сверху (${days.map((d) => d.date)})`);
  const oct18 = days.find((d) => d.date === '2026-10-18');
  check(oct18.items.length === 3 && oct18.counts.post === 3, '18 октября — три снимка из постов');

  console.log('\n== черновик записи');
  const an = new Map([[oct18.items[0].id, { lum: 0.7, warm: 0.5, palette: [{ rgb: [220, 170, 50] }] }], [oct18.items[1].id, { lum: 0.2, warm: -0.4, palette: [{ rgb: [30, 40, 90] }] }]]);
  const dr = I.draftText(oct18.items, an);
  console.log('   ', dr.text, '|', dr.notes.join(' / '));
  check(dr.text === 'Утро, какао и жёлтые клёны. Вечером пошёл дождь.', 'в записи только слова человека, по порядку, без повторов карусели');
  check(!/пост|сторис|тона|в кадре|\d\d:\d\d/i.test(dr.text), 'в записи нет «пост», времени и машинного описания цвета');
  check(dr.notes.length === 2 && /тёплые тона/.test(dr.notes[0]) && /холодные тона/.test(dr.notes[1]), 'описание света — отдельно, как подсказка');
  const T = PV.Text.analyze(dr.text, oct18.date);
  check(T.weather.rain && !T.weather.cold, 'разбор видит дождь из подписи, а не «холод» из цвета снимка');
  const night = I.draftText([{ id: 'n1', ts: new Date(2026, 10, 19, 22, 30).getTime(), source: 'story', caption: mojibake('ночь, огни') }, { id: 'n2', ts: new Date(2026, 10, 19, 8, 0).getTime(), source: 'instant', caption: 'кофе ☕' }].sort((a, b) => a.ts - b.ts), null);
  check(night.text === 'Утром — кофе. Ночь, огни.', `время суток приписывается, когда подпись о нём молчит («${night.text}»)`);
  const emo = I.draftText([{ id: 'e', ts: new Date(2026, 10, 19, 23, 0).getTime(), source: 'story', caption: '☔🌃' }], null);
  check(emo.text === 'Ночью — дождь, ночь и огни.', `подпись из эмодзи → слова («${emo.text}»)`);
  const none = I.draftText([{ id: 'x', ts: new Date(2026, 10, 19, 9, 0).getTime(), source: 'instant', caption: '' }, { id: 'y', ts: new Date(2026, 10, 19, 20, 0).getTime(), source: 'post', caption: '#tbt' }], null);
  check(none.text === 'Утром, потом вечером — снимки без подписей.' && none.captions === 0, `без подписей — только время суток («${none.text}»)`);

  console.log('\n== выбор снимков дня');
  const many = Array.from({ length: 14 }, (_, i) => ({ id: 's' + i, ts: i * 1000, source: i < 3 ? 'instant' : i < 6 ? 'post' : 'story', kind: 'image' }));
  const pick = I.pickForDay(many, 8);
  check(pick.length === 8 && pick.filter((x) => x.source === 'instant').length === 3 && pick.filter((x) => x.source === 'post').length === 3, 'из 14 — 8: все мгновения и посты, остальное — сторис');
  check(pick.every((x, i) => !i || pick[i - 1].ts <= x.ts), 'снимки дня идут по времени');
  const song = I.songFromPhotos({ lum: 0.2, warm: -0.4, sat: 0.2 }, 3);
  check(song.mood === 'dark' && song.tempo === 'slow', 'без песни: тёмные снимки → медленно и грустно');

  console.log('\n== ZIP64 (большие архивы)');
  try {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pvz64-'));
    fs.writeFileSync(path.join(dir, 'a.json'), JSON.stringify(posts));
    execSync(`cd "${dir}" && zip -q -fz z64.zip a.json`);
    const e64 = await I.openZip(new Blob([fs.readFileSync(path.join(dir, 'z64.zip'))]));
    check(e64.length === 1 && JSON.parse(await (await e64[0].read()).text()).length === 2, 'архив ZIP64 читается');
  } catch (e) { console.log('  ⚠ ПРОПУЩЕНО: нет утилиты zip для ZIP64 —', e.message.split('\n')[0]); }

  console.log(fails ? `\nПровалено проверок: ${fails}` : '\nВсе проверки пройдены');
  process.exitCode = fails ? 1 : 0;
})().catch((e) => { console.error(e); process.exit(1); });
