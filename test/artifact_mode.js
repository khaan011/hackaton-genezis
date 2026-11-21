const { chromium } = require('playwright');
(async () => {
  const browser = await chromium.launchPersistentContext(require('path').join(require('os').tmpdir(), 'pv-profile'), { viewport: { width: 1300, height: 950 } });
  const page = browser.pages()[0] || await browser.newPage();
  // имитация рантайма артефакта: claude.use('downloads') → save()
  await page.addInitScript(() => { window.__saved = []; window.claude = { use: async (n) => (n === 'downloads' ? { save: async ({ filename, data }) => { window.__saved.push({ filename, size: data.size || data.length }); return { status: 'saved' }; } } : null) }; });
  const errs = []; page.on('pageerror', e => errs.push(e.message));
  await page.goto(`http://localhost:${process.env.PORT || 8765}/index.html`);
  await page.waitForSelector('#arch-grid .day-card');
  await page.click('.day-card:has-text("Осенний парк")');
  await page.waitForSelector('#v-day:not([hidden])'); await page.waitForSelector('#busy', { state: 'hidden' });
  const hidden = await page.evaluate(() => ({ artifact: PV.App.IN_ARTIFACT, rec: getComputedStyle(document.querySelector('#d-rec')).display, weather: getComputedStyle(document.querySelector('.card.optional')).display }));
  await page.click('#d-zip');
  await page.waitForFunction(() => window.__saved.length > 0, null, { timeout: 120000 });
  const saved = await page.evaluate(() => window.__saved);
  // удаление через своё окно: отмена, затем подтверждение
  await page.click('#d-del'); await page.waitForSelector('#dlg:not([hidden])');
  await page.click('#dlg-no'); const still = await page.evaluate(() => !!PV.App.state.day);
  await page.click('#d-del'); await page.click('#dlg-yes');
  await page.waitForSelector('#v-archive:not([hidden])');
  const left = await page.$$eval('#arch-grid .day-card', e => e.length);
  console.log(JSON.stringify({ hidden, saved, cancelKeptDay: still, daysLeft: left, errs }, null, 1));
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
