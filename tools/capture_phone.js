// Съёмка экрана телефона в высоком разрешении (CDP screencast, 1170×2532) для вертикального ролика.
// Пишет кадры JPEG с отметками времени: test/out/ad2/cap_<сцена>/NNNNN.jpg + times.json
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'test', 'out', 'ad2');
const APP = `http://localhost:${process.env.PORT || 8765}/index.html`;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function capture(page, name, fn) {
  const dir = path.join(OUT, 'cap_' + name); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.context().newCDPSession(page);
  const times = []; let n = 0, t0 = null;
  cdp.on('Page.screencastFrame', async (f) => {
    const ts = f.metadata.timestamp; if (t0 == null) t0 = ts;
    const file = String(n++).padStart(5, '0') + '.jpg';
    fs.writeFileSync(path.join(dir, file), Buffer.from(f.data, 'base64')); times.push([file, ts - t0]);
    cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 88, maxWidth: 1170, maxHeight: 2532, everyNthFrame: 1 });
  await fn();
  await cdp.send('Page.stopScreencast');
  fs.writeFileSync(path.join(dir, 'times.json'), JSON.stringify(times));
  console.log(name, n, 'кадров', times.length ? times[times.length - 1][1].toFixed(1) + ' с' : '');
}
const openDay = async (p) => p.waitForFunction(() => PV.App.state.view === 'day' && PV.App.state.player && document.querySelector('#busy').hidden, null, { timeout: 60000 });
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const c = await b.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
  const p = await c.newPage();
  await p.goto(APP); await p.waitForSelector('#arch-grid .day-card', { timeout: 30000 }); await sleep(5200);
  await p.evaluate(() => { try { localStorage.setItem('pv-hello-done', '1'); } catch (e) {} });
  await p.click('.tabbar [data-go="insta"]'); await sleep(500);
  const only = (process.argv[2] || 'insta,build,archive,form,tune').split(',');
  if (only.includes('form')) await capture(p, 'form', async () => {
    await p.click('.tabbar [data-go="new"]'); await sleep(800);
    await p.click('#f-sample'); await p.waitForFunction(() => !document.querySelector('#f-go').disabled, null, { timeout: 30000 }); await sleep(900);
    await p.evaluate(() => document.querySelector('#f-thumbs').scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(1300);
    await p.evaluate(() => document.querySelector('#f-wave-wrap').scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(1300);
  });
  if (only.includes('tune')) await capture(p, 'tune', async () => {
    await p.click('.tabbar [data-go="archive"]'); await sleep(500);
    await p.click('.day-card:has-text("Осенний парк")'); await openDay(p); await sleep(400);
    await p.click('.quick [data-jump="#d-tune"]'); await sleep(900);
    const r = await p.locator('#d-tune-rows input[data-k="E"]').boundingBox();
    await p.mouse.move(r.x + r.width * 0.25, r.y + r.height / 2); await p.mouse.down();
    for (let i = 1; i <= 12; i++) { await p.mouse.move(r.x + r.width * (0.25 + 0.06 * i), r.y + r.height / 2); await sleep(45); }
    await p.mouse.up(); await sleep(700); await openDay(p); await sleep(400);
    await p.evaluate(() => window.scrollTo({ top: 0, behavior: 'smooth' })); await sleep(900);
    await p.click('#d-play'); await sleep(2600);
  });
  if (!only.includes('insta')) { await b.close(); return; }
  await p.click('.tabbar [data-go="insta"]'); await p.evaluate(() => window.scrollTo(0, 0)); await sleep(600);
  /* сцена 1: мгновения → дни */
  await capture(p, 'insta', async () => {
    await sleep(700); await p.click('#ig-demo');
    await p.waitForSelector('#ig-found:not([hidden])'); await sleep(1400);
    await p.evaluate(() => window.scrollBy({ top: 420, behavior: 'smooth' })); await sleep(1500);
    await p.evaluate(() => window.scrollBy({ top: 360, behavior: 'smooth' })); await sleep(1300);
  });
  /* сцена 2: день из мгновений → форма с подписями → сборка → клип */
  await capture(p, 'build', async () => {
    await p.click('#ig-days .ig-day:nth-child(2) .ig-open');
    await p.waitForFunction(() => !document.querySelector('#f-go').disabled, null, { timeout: 30000 }); await sleep(900);
    await p.evaluate(() => document.querySelector('#f-thumbs').scrollIntoView({ behavior: 'smooth', block: 'center' })); await sleep(1300);
    await p.click('#f-go'); await openDay(p); await sleep(300);
    await p.evaluate(() => { PV.App.state.player.seek(0); }); await p.click('#d-play'); await sleep(5200);
  });
  /* сцена 3: архив и свайп по дням */
  await capture(p, 'archive', async () => {
    await p.click('.tabbar [data-go="archive"]'); await sleep(900);
    await p.evaluate(() => window.scrollBy({ top: 500, behavior: 'smooth' })); await sleep(1200);
    await p.click('.day-card:has-text("Ночь в офисе")'); await openDay(p); await sleep(200);
    await p.click('#d-play'); await sleep(2200);
    await p.click('#d-next'); await openDay(p); await p.click('#d-play'); await sleep(2200);
  });
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
