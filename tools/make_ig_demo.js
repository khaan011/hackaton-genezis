// Демо-архив Instagram (demo/instagram-demo.zip) в формате настоящей выгрузки «Скачать вашу информацию» → JSON:
// your_instagram_activity/media/posts_1.json, stories.json, файлы в media/…; текст — байтами UTF-8 в Latin-1, как у Instagram.
// Мгновения (Instants) Instagram в выгрузку пока не кладёт — для демо они лежат в media/instants/ с instants.json.
// Снимки — открытые фото (CC0 / CC BY), авторы в docs/CREDITS.md. Запуск: node tools/make_ig_demo.js <папка со снимками>
const fs = require('fs'), path = require('path');
const { zip, mojibake } = require('./zipwrite.js');
const src = process.argv[2] || '/tmp/igdemo';
const T = (s) => Math.floor(new Date(s).getTime() / 1000);
const R = 'instagram-poslevkusie_demo-2026-11-21/';
const files = [];
const media = (kind, ym, name) => { const uri = `media/${kind}/${ym}/${name}.jpg`; files.push({ name: R + uri, data: fs.readFileSync(path.join(src, name + '.jpg')) }); return uri; };
const m = mojibake;
const posts = [
  { media: [{ uri: media('posts', '202611', 'ig_forest_path'), creation_timestamp: T('2026-11-15T11:40:00'), title: '' }], title: m('Утро в лесопарке, листья шуршат под ногами 🍂 #осень'), creation_timestamp: T('2026-11-15T11:40:00') },
  { media: [{ uri: media('posts', '202611', 'office_night'), creation_timestamp: T('2026-11-17T19:05:00'), title: '' }], title: m('Офис опустел, остались только мы с командой. Дедлайн утром'), creation_timestamp: T('2026-11-17T19:05:00') },
  { media: [{ uri: media('posts', '202611', 'snow_trees'), creation_timestamp: T('2026-11-19T12:30:00'), title: '' }], title: m('Город в тумане и снегу. Тишина'), creation_timestamp: T('2026-11-19T12:30:00') },
  { media: [{ uri: media('posts', '202611', 'ig_cake'), creation_timestamp: T('2026-11-20T20:10:00'), title: '' }, { uri: media('posts', '202611', 'ig_balloons'), creation_timestamp: T('2026-11-20T20:10:00'), title: '' }], title: m('С днём рождения, Аня! Смеялись и танцевали с друзьями до ночи 🎉'), creation_timestamp: T('2026-11-20T20:10:00') },
];
const stories = { ig_stories: [
  { uri: media('stories', '202611', 'ig_lake_sunset'), creation_timestamp: T('2026-11-15T17:30:00'), title: m('закат у озера') },
  { uri: media('stories', '202611', 'ig_keyboard'), creation_timestamp: T('2026-11-17T23:40:00'), title: m('код не собирается, кофе остыл') },
  { uri: media('stories', '202611', 'snow_window'), creation_timestamp: T('2026-11-19T08:20:00'), title: '' },
  { uri: media('stories', '202611', 'ig_rain_blue'), creation_timestamp: T('2026-11-20T23:30:00'), title: m('домой под дождём ☔') },
] };
const instants = { ig_instants: [
  { uri: media('instants', '202611', 'ig_cocoa2'), creation_timestamp: T('2026-11-15T09:12:00'), title: m('какао перед прогулкой') },
  { uri: media('instants', '202611', 'keyboard_glow'), creation_timestamp: T('2026-11-17T23:55:00'), title: '' },
  { uri: media('instants', '202611', 'ig_snow_tree'), creation_timestamp: T('2026-11-19T08:05:00'), title: m('первый снег!') },
] };
files.unshift(
  { name: R + 'your_instagram_activity/media/posts_1.json', data: JSON.stringify(posts, null, 2) },
  { name: R + 'your_instagram_activity/media/stories.json', data: JSON.stringify(stories, null, 2) },
  { name: R + 'your_instagram_activity/media/instants.json', data: JSON.stringify(instants, null, 2) },
  { name: R + 'personal_information/personal_information/personal_information.json', data: JSON.stringify({ profile_user: [{ string_map_data: { Username: { value: 'poslevkusie.demo' } } }] }) },
);
const out = path.join(__dirname, '..', 'demo', 'instagram-demo.zip');
fs.writeFileSync(out, zip(files));
console.log(out, (fs.statSync(out).size / 1024).toFixed(0) + ' КБ', files.length + ' файлов');
