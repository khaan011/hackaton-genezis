const { chromium } = require('/opt/npm-tools/node_modules/playwright');
const fs = require('fs');
(async () => {
  const browser = await chromium.launchPersistentContext('/tmp/pv-profile', { executablePath: '/usr/bin/google-chrome', viewport: { width: 1200, height: 900 }, args: ['--autoplay-policy=no-user-gesture-required'] });
  const page = browser.pages()[0] || await browser.newPage();
  await page.goto('http://localhost:8765/index.html');
  await page.waitForSelector('#arch-grid .day-card');
  const ids = await page.evaluate(async () => (await PV.Store.all()).map(d => ({ id: d.id, reg: d.summary.register, title: d.title })));
  fs.mkdirSync('out/videos', { recursive: true });
  for (const d of ids) {
    const t0 = Date.now();
    const res = await page.evaluate(async (id) => {
      const day = await PV.Store.get(id);
      const S = PV.Mood.buildStyle({ text: day.analysis.T, photos: day.analysis.P, music: day.analysis.M, seed: day.seed, overrides: day.overrides });
      const bmps = await Promise.all(day.photos.map(p => PV.Img.loadBitmap(p.blob)));
      const R = new PV.Render.Renderer({ style: S, text: day.analysis.T, title: day.title, date: day.date, number: day.number, photos: bmps.map((b, i) => ({ bmp: b, a: day.photos[i].a })), music: { ...day.track } }, { scale: 1, quality: 'high' });
      await R.prepare();
      const buf = await PV.Player.decodeBlob(day.song.excerpt);
      const { blob, ext } = await PV.Player.exportVideo(R, buf);
      const b64 = await new Promise(r => { const fr = new FileReader(); fr.onload = () => r(fr.result.split(',')[1]); fr.readAsDataURL(blob); });
      return { b64, ext, dur: R.duration };
    }, d.id);
    const file = `out/videos/${d.reg}.${res.ext}`;
    fs.writeFileSync(file, Buffer.from(res.b64, 'base64'));
    console.log(d.reg, d.title, res.dur.toFixed(1) + ' с', ((Date.now() - t0) / 1000).toFixed(1) + ' с записи', file);
  }
  await browser.close();
})().catch(e => { console.error(e); process.exit(1); });
