// Запуск: python3 -m http.server 8765 (в корне репозитория), затем node test/<файл>.js. Нужен Playwright: npm i -D playwright.
// Сквозная проверка в Chrome: создаём дни через интерфейс, снимаем кадры, собираем ошибки.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const A = (p) => path.join(__dirname, 'assets', p);
const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

const DAYS = [
  { key: 'monet', date: '2026-10-18', text: 'Гуляли по парку, всё в жёлтых листьях. Было холодно, но мы пили какао из термоса и долго разговаривали на скамейке.', photos: ['autumn_park', 'autumn_leaves', 'cocoa'], song: 'ballad_C_major_72', artist: 'Тестовый синтез', title: 'Какао на скамейке' },
  { key: 'kandinsky', date: '2026-11-12', text: 'Срочная сдача проекта. Ночь в офисе, в наушниках электронная музыка, кофе остыл, код не собирается. Дедлайн в шесть утра.', photos: ['office_window', 'laptop_night'], song: 'techno_A_minor_128', artist: 'Тестовый синтез', title: 'Ночной билд' },
  { key: 'ma', date: '2026-01-14', text: 'Проснулась рано, одна. За окном снег и туман, тишина. Долго смотрела, как медленно падает снег, и ничего не делала.', photos: ['winter_field', 'frost_window'], song: 'ambient_D_minor_60', artist: 'Тестовый синтез', title: 'Снег за окном' },
  { key: 'film', date: '2026-07-18', text: 'Поехали с друзьями на дачу, как в детстве. Купались в реке, жгли костёр до темноты, слушали старые песни на кассетах. Вспомнили школу и смеялись.', photos: ['dacha_house', 'river_sunset', 'campfire'], song: 'folk_G_major_96', artist: 'Тестовый синтез', title: 'Летняя песня', year: '1978' },
  { key: 'matisse', date: '2026-05-03', text: 'День рождения подруги! Шарики, торт со свечами, все смеялись и танцевали до ночи, было очень весело и шумно.', photos: ['balloons', 'cake', 'party'], song: 'pop_D_major_120', artist: 'Тестовый синтез', title: 'Шарики и свечи' },
  { key: 'nocturne', date: '2026-09-28', text: 'Долгий тяжёлый день. Вечером шёл дождь, я шла домой одна, фонари расплывались в лужах. Было грустно, но спокойно.', photos: ['rain_street', 'rain_window'], song: 'rain_E_minor_66', artist: 'Тестовый синтез', title: 'Фонари в лужах' },
];

(async () => {
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  if (process.env.FRESH) fs.rmSync(require('path').join(require('os').tmpdir(), 'pv-profile'), { recursive: true, force: true });
  const browser = await chromium.launchPersistentContext(require('path').join(require('os').tmpdir(), 'pv-profile'), { viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1, acceptDownloads: true, args: ['--autoplay-policy=no-user-gesture-required', '--use-fake-ui-for-media-stream'] });
  const page = browser.pages()[0] || await browser.newPage();
  /* DEMO_EXPORT=путь.zip: собрать дни с нуля (без автозагрузки демо) и сохранить дневник — так пересобирается demo/diary.zip */
  if (process.env.DEMO_EXPORT) await page.route('**/demo/diary.zip', (r) => r.fulfill({ status: 404, body: '' }));
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') errors.push(m.type() + ': ' + m.text()); });
  await page.goto(`http://localhost:${process.env.PORT || 8765}/index.html`);
  await page.waitForSelector('#v-archive:not([hidden])');
  const report = [];
  for (const d of DAYS) {
    if (only && !only.includes(d.key)) continue;
    const t0 = Date.now();
    await page.click('nav [data-go="new"]');
    await page.fill('#f-date', d.date);
    await page.fill('#f-text', d.text);
    await page.setInputFiles('#f-photos', d.photos.map((p) => A(`photos/${p}.jpg`)));
    await page.waitForFunction((n) => document.querySelectorAll('#f-thumbs .thumb').length === n, d.photos.length, { timeout: 30000 });
    await page.setInputFiles('#f-audio', A(`music/${d.song}.mp3`));
    await page.waitForFunction(() => /BPM/.test(document.querySelector('#f-audio-info').textContent), null, { timeout: 30000 });
    await page.fill('#f-artist', d.artist); await page.fill('#f-title', d.title);
    if (d.year) await page.fill('#f-year', d.year);
    await page.waitForTimeout(400);
    const hint = await page.textContent('#f-text-hint');
    const audioInfo = await page.textContent('#f-audio-info');
    await page.click('#f-go');
    await page.waitForSelector('#v-day:not([hidden])', { timeout: 120000 });
    await page.waitForSelector('#busy', { state: 'hidden', timeout: 120000 });
    const info = await page.evaluate(() => {
      const st = PV.App.state, R = st.renderer;
      return { title: st.day.title, reg: st.S.register, dur: R.duration, shots: R.shots.length, shotSec: R.shotSec, mood: st.S.mood, why: [...document.querySelectorAll('#d-why li')].map((li) => li.textContent), files: [...document.querySelectorAll('#d-files li')].map((li) => li.textContent) };
    });
    const R = info;
    const times = [0.9, 2.6, R.dur * 0.3, R.dur * 0.55, R.dur * 0.8, R.dur - 0.3];
    const frames = await page.evaluate(async (times) => {
      const R = PV.App.state.renderer, c = document.createElement('canvas');
      c.width = Math.round(R.W * R.scale); c.height = Math.round(R.H * R.scale);
      const ctx = c.getContext('2d');
      return times.map((t) => { R.drawFrame(ctx, t); return c.toDataURL('image/jpeg', 0.88); });
    }, times);
    frames.forEach((u, i) => fs.writeFileSync(path.join(OUT, `${d.key}_${i}.jpg`), Buffer.from(u.split(',')[1], 'base64')));
    report.push({ key: d.key, ms: Date.now() - t0, hint, audioInfo, ...info, mood: Object.fromEntries(Object.entries(info.mood).filter(([k]) => k.length === 1).map(([k, v]) => [k, +v.toFixed(2)])) });
    await page.click('nav [data-go="archive"]');
  }
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, 'archive.png') });
  await page.click('#arch-mode [data-mode="feed"]');
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(OUT, 'feed.png') });
  fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ report, errors }, null, 2));
  if (process.env.DEMO_EXPORT) {
    await page.evaluate(async () => { for (const d of await PV.Store.all()) { d.demo = true; await PV.Store.put(d); } });
    const dl = page.waitForEvent('download');
    await page.click('#btn-export');
    await (await dl).saveAs(process.env.DEMO_EXPORT);
    console.log('дневник сохранён:', process.env.DEMO_EXPORT);
  }
  for (const r of report) console.log(`${r.key}: «${r.title}» → ${r.reg}, ${r.dur.toFixed(1)} с, ${r.shots} кадров по ${r.shotSec.toFixed(2)} с, ${r.ms} мс | ${r.audioInfo}`);
  console.log('ошибки:', errors.length ? errors.join('\n') : 'нет');
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
