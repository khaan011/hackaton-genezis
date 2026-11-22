// Запись видео-демо по живому интерфейсу: Playwright пишет экран, тайминги сцен — под готовую озвучку (test/out/demo/L*.mp3).
// Результат: test/out/demo/desk.webm, phone.webm, timeline.json (когда звучит голос и музыка дня). Озвучка — tools/demo_tts.mjs (tools/demo_lines.json), сведение — tools/mix_demo.py (запуск из test/out/demo).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process');
const DIR = path.join(__dirname, '..', 'test', 'out', 'demo');
const APP = `http://localhost:${process.env.PORT || 8765}/index.html`;
const FFPROBE = fs.existsSync(path.join(require('os').homedir(), '.local/bin/ffprobe')) ? path.join(require('os').homedir(), '.local/bin/ffprobe') : 'ffprobe';
const dur = (id) => +execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path.join(DIR, id + '.mp3')]).toString();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const tl = { voice: [], music: [] };
  /* ---------- компьютер ---------- */
  fs.rmSync(path.join(DIR, 'vd'), { recursive: true, force: true });
  const ctx = await b.newContext({ viewport: { width: 1280, height: 720 }, recordVideo: { dir: path.join(DIR, 'vd'), size: { width: 1280, height: 720 } } });
  const p = await ctx.newPage();
  const T0 = Date.now(), now = () => (Date.now() - T0) / 1000;
  const say = async (id, pad = 0.6) => { tl.voice.push({ id, at: now() }); await sleep((dur(id) + pad) * 1000); };
  const music = async (label) => {
    const info = await p.evaluate(async () => {
      const d = PV.App.state.day, pl = PV.App.state.player;
      const buf = await d.song.excerpt.arrayBuffer(); let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768));
      return { b64: btoa(s), ext: d.song.excerptExt || 'mp3', offset: pl.t };
    });
    const f = path.join(DIR, `music_${label}.${info.ext}`);
    fs.writeFileSync(f, Buffer.from(info.b64, 'base64'));
    return { file: f, offset: info.offset };
  };
  await p.goto(APP);
  await p.waitForSelector('#arch-grid .day-card', { timeout: 30000 });
  await sleep(4200); /* уведомление о демо-дневнике уходит */
  const start = now();
  tl.start = start;
  /* 1. архив */
  const s1 = say('L1', 0.8);
  await p.hover('#arch-strip .bands button:nth-child(2)'); await sleep(1500);
  await p.hover('.day-card:nth-child(1) .cover'); await sleep(1800);
  await p.hover('.day-card:nth-child(3) .cover'); await sleep(1500);
  await s1;
  /* 2. форма и пример */
  await p.click('header [data-go="new"]');
  const s2 = say('L2', 0.6);
  await sleep(700); await p.click('#f-sample');
  await p.waitForFunction(() => !document.querySelector('#f-go').disabled, null, { timeout: 30000 });
  await sleep(1500); await p.evaluate(() => document.querySelector('#f-drop').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await sleep(2600); await p.evaluate(() => document.querySelector('#f-song-mode').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await s2;
  /* 3. день Моне со звуком */
  await p.click('header [data-go="archive"]'); await sleep(300);
  await p.click('.day-card:has-text("Осенний парк")'); await p.waitForFunction(() => PV.App.state.view === 'day' && PV.App.state.player && document.querySelector('#busy').hidden, null, { timeout: 30000 }); await sleep(300);
  await p.evaluate(() => { PV.App.state.player.seek(0); });
  await p.click('#d-play');
  const m1 = await music('monet'); tl.music.push({ ...m1, at: now() });
  await say('L3', 0.4);
  /* 4. оси и объяснения */
  const s4 = say('L4', 0.8);
  await p.evaluate(() => document.querySelector('#d-axes').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await sleep(3800); await p.evaluate(() => document.querySelector('#d-why').scrollIntoView({ behavior: 'smooth', block: 'start' }));
  await s4;
  tl.music[tl.music.length - 1].until = now();
  await p.click('#d-play'); /* пауза */
  /* 5. ноктюрн */
  await p.evaluate(() => window.scrollTo({ top: 0 }));
  await p.click('header [data-go="archive"]'); await sleep(300);
  await p.click('.day-card:has-text("Вечер по дороге")'); await p.waitForFunction(() => PV.App.state.view === 'day' && PV.App.state.player && document.querySelector('#busy').hidden, null, { timeout: 30000 }); await sleep(300);
  await p.evaluate(() => { PV.App.state.player.seek(0); });
  await p.click('#d-play');
  const m2 = await music('nocturne'); tl.music.push({ ...m2, at: now() });
  await say('L5', 1.6);
  tl.music[tl.music.length - 1].until = now();
  await p.click('#d-play');
  /* 6–7. Instagram */
  await p.click('header [data-go="insta"]');
  const s6 = say('L6', 0.5);
  await sleep(1800); await p.hover('#ig-login'); await sleep(1400); await p.hover('.ig-way:nth-child(2) .btn'); await sleep(1200); await p.hover('.ig-way:nth-child(3) .btn');
  await s6;
  await p.click('#ig-demo');
  const s7 = say('L7', 0.6);
  await p.waitForSelector('#ig-found:not([hidden])');
  await sleep(2600);
  await p.click('#ig-days .ig-day:nth-child(2) .ig-open');
  await p.waitForSelector('#v-new:not([hidden])'); await sleep(400);
  await p.evaluate(() => document.querySelector('#f-text').scrollIntoView({ behavior: 'smooth', block: 'center' }));
  await s7;
  /* 8. собрать все */
  await p.click('header [data-go="insta"]'); await sleep(500);
  const s8 = say('L8', 0.4);
  await p.check('#ig-all'); await sleep(500); await p.click('#ig-build');
  await p.waitForSelector('#v-archive:not([hidden])', { timeout: 90000 });
  await s8; await sleep(1500);
  /* 9. телефон — накладывается отдельной записью */
  tl.phoneAt = now();
  await say('L9', 3.4);
  tl.phoneUntil = now();
  /* 10. лента и финал */
  await p.click('#arch-mode [data-mode="feed"]'); await sleep(400);
  await say('L10', 2.5);
  tl.end = now();
  const vpath = await p.video().path();
  await ctx.close();
  fs.renameSync(vpath, path.join(DIR, 'desk.webm'));
  /* ---------- телефон ---------- */
  fs.rmSync(path.join(DIR, 'vp'), { recursive: true, force: true });
  const mc = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, recordVideo: { dir: path.join(DIR, 'vp'), size: { width: 390, height: 844 } } });
  const q = await mc.newPage();
  const Q0 = Date.now();
  await q.goto(APP); await q.waitForSelector('#arch-grid .day-card', { timeout: 30000 }); await sleep(4500);
  tl.phoneClipStart = (Date.now() - Q0) / 1000;
  await q.click('.tabbar [data-go="new"]'); await sleep(900);
  await q.click('#f-sample'); await q.waitForFunction(() => !document.querySelector('#f-go').disabled, null, { timeout: 30000 }); await sleep(700);
  await q.click('#f-go'); await q.waitForSelector('#v-day:not([hidden])', { timeout: 60000 }); await q.waitForSelector('#busy', { state: 'hidden' });
  await q.click('#d-frame'); await sleep(2200);
  await q.click('#d-next'); await q.waitForSelector('#busy', { state: 'hidden' }); await sleep(1600);
  await q.click('.quick [data-jump="#d-files"]'); await sleep(1800);
  tl.phoneClipEnd = (Date.now() - Q0) / 1000;
  const ppath = await q.video().path();
  await mc.close();
  fs.renameSync(ppath, path.join(DIR, 'phone.webm'));
  fs.writeFileSync(path.join(DIR, 'timeline.json'), JSON.stringify(tl, null, 1));
  console.log(JSON.stringify(tl, null, 1));
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
