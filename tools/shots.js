// Картинки для README и презентации из живого прототипа: кадры дней, экраны компьютера и телефона, лента, og.jpg.
// Запуск: npm run serve, затем node tools/shots.js [frames|pick|screens]. Нужен Playwright.
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
const APP = `http://localhost:${process.env.PORT || 8765}/index.html`;
const OUT = path.join(__dirname, '..', 'docs', 'img');
const mode = process.argv[2] || 'screens';
const PICK = JSON.parse(process.env.PICK || '{}'); /* {monet: 2, …} — номер кадра для каждого режима */
(async () => {
  const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await b.newContext({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 1 });
  const p = await ctx.newPage();
  await p.goto(APP); await p.waitForSelector('#arch-grid .day-card', { timeout: 30000 }); await p.waitForTimeout(800);
  if (mode === 'frames' || mode === 'pick') {
    fs.mkdirSync(path.join(__dirname, '..', 'test', 'out', 'shots'), { recursive: true });
    const res = await p.evaluate(async ({ PICK, all }) => {
      const out = {};
      for (const d of await PV.Store.all()) {
        if (!d.demo) continue;
        await PV.App.openDayById(d.id);
        const R = PV.App.state.renderer, reg = PV.App.state.S.register;
        const c = document.createElement('canvas'); c.width = Math.round(R.W * R.scale); c.height = Math.round(R.H * R.scale);
        const ctx = c.getContext('2d');
        const ts = R.shots.map((s) => s.start + s.dur * 0.72);
        const pick = all ? ts.map((_, i) => i) : [PICK[reg] ?? 1];
        out[reg] = pick.map((i) => { R.drawFrame(ctx, ts[Math.min(i, ts.length - 1)]); return c.toDataURL('image/jpeg', 0.9); });
      }
      return out;
    }, { PICK, all: mode === 'pick' });
    for (const [reg, list] of Object.entries(res)) list.forEach((u, i) => fs.writeFileSync(mode === 'pick' ? path.join(__dirname, '..', 'test', 'out', 'shots', `${reg}_${i}.jpg`) : path.join(OUT, `${reg}.jpg`), Buffer.from(u.split(',')[1], 'base64')));
    console.log('кадры:', Object.keys(res).join(', '));
  }
  if (mode === 'screens') {
    const shot = async (name, el) => { await p.waitForTimeout(500); await (el ? p.locator(el).screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 86 }) : p.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 86 })); };
    await p.click('.day-card:has-text("Осенний парк")');
    await p.waitForFunction(() => PV.App.state.view === 'day' && PV.App.state.player && document.querySelector('#busy').hidden, null, { timeout: 30000 }); await p.waitForTimeout(1500);
    await shot('desktop-day.jpg');
    await p.click('header [data-go="insta"]'); await p.click('#ig-demo');
    await p.waitForFunction(() => document.querySelectorAll('#ig-days .ig-thumbs i[style*="background-image"]').length >= 8, null, { timeout: 30000 });
    await p.evaluate(() => window.scrollTo(0, 0)); 
    await p.evaluate(() => document.querySelector('#ig-found').scrollIntoView()); await p.waitForTimeout(400); await shot('instagram-days.jpg');
    await p.click('header [data-go="archive"]'); await p.click('#arch-mode [data-mode="feed"]'); await p.waitForTimeout(700);
    await p.setViewportSize({ width: 3352, height: 1100 }); await p.waitForTimeout(700);
    await p.locator('#arch-feed').screenshot({ path: path.join(__dirname, '..', 'docs', 'lenta.jpg'), type: 'jpeg', quality: 84 });
    await p.setViewportSize({ width: 1440, height: 1000 });
    const m = await b.newContext({ viewport: { width: 390, height: 664 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
    const q = await m.newPage();
    await q.goto(APP); await q.waitForSelector('#arch-grid .day-card', { timeout: 30000 }); await q.waitForTimeout(5200);
    const ms = async (name) => { await q.waitForTimeout(500); await q.screenshot({ path: path.join(OUT, name), type: 'jpeg', quality: 84 }); };
    await ms('m-archive.jpg');
    await q.click('.day-card:has-text("Ночь в офисе")'); await q.waitForFunction(() => PV.App.state.view === 'day' && PV.App.state.player && document.querySelector('#busy').hidden, null, { timeout: 30000 }); await q.waitForTimeout(4600); await ms('m-day.jpg');
    await q.click('.tabbar [data-go="new"]'); await q.click('#f-sample'); await q.waitForFunction(() => !document.querySelector('#f-go').disabled, null, { timeout: 30000 }); await q.waitForTimeout(4500); await q.evaluate(() => window.scrollTo(0, 0)); await ms('m-form.jpg');
    
    console.log('экраны готовы');
  }
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
