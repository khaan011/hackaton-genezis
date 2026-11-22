const { chromium } = require('playwright');
const fs = require('fs'), path = require('path');
(async () => {
  const browser = await chromium.launchPersistentContext(require('path').join(require('os').tmpdir(), 'pv-profile'), { viewport: { width: 1440, height: 1000 }, acceptDownloads: true, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = browser.pages()[0] || await browser.newPage();
  const errs = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(`http://localhost:${process.env.PORT || 8765}/index.html`);
  await page.waitForSelector('#arch-grid .day-card');
  await page.screenshot({ path: 'test/out/ui_archive.png' });
  await page.click('#arch-mode [data-mode="feed"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'test/out/ui_feed.png' });
  await page.click('#arch-mode [data-mode="folders"]');
  // открыть день «Осенний парк»
  await page.click('.day-card:has-text("Осенний парк")');
  await page.waitForSelector('#v-day:not([hidden])'); await page.waitForSelector('#busy', { state: 'hidden' });
  await page.waitForTimeout(400);
  await page.screenshot({ path: 'test/out/ui_day.png' });
  await page.screenshot({ path: 'test/out/ui_day_full.png', fullPage: true });
  // проигрывание 2 с
  await page.click('#d-play'); await page.waitForTimeout(2000);
  const playing = await page.evaluate(() => ({ t: PV.App.state.player.t, playing: PV.App.state.player.playing, hasAudio: !!PV.App.state.audioBuf }));
  await page.click('#d-play');
  // скачать папку дня (с видео — запись идёт в реальном времени)
  const t0 = Date.now();
  const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 120000 }), page.click('#d-zip')]);
  const zipPath = path.join(__dirname, 'out', 'folder.zip'); await dl.saveAs(zipPath);
  const zipMs = Date.now() - t0;
  // экспорт дневника
  await page.click('nav [data-go="archive"]'); await page.waitForSelector('#arch-grid .day-card');
  const [dl2] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('#btn-export')]);
  const diaryPath = path.join(__dirname, 'out', 'diary.zip'); await dl2.saveAs(diaryPath);
  // как это работает
  await page.click('nav [data-go="about"]'); await page.waitForTimeout(300);
  await page.screenshot({ path: 'test/out/ui_about.png', fullPage: true });
  // мобильный вид
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('nav [data-go="archive"]:visible'); await page.waitForTimeout(400);
  await page.screenshot({ path: 'test/out/ui_mobile_archive.png' });
  await page.click('.day-card:has-text("Ночь в офисе")');
  await page.waitForSelector('#busy', { state: 'hidden' }); await page.waitForTimeout(400);
  await page.screenshot({ path: 'test/out/ui_mobile_day.png', fullPage: true });
  console.log(JSON.stringify({ playing, zipMs, errs }, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
