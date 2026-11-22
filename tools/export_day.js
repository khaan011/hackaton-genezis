// Экспорт настоящего видео-воспоминания дня (1080×1920, со звуком) из приложения — для рекламного ролика
const { chromium } = require('playwright'); const fs = require('fs'), path = require('path');
(async () => { const b = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] }); const p = await b.newPage({ viewport: { width: 1280, height: 900 } });
await p.goto('http://localhost:8765/index.html'); await p.waitForSelector('#arch-grid .day-card', { timeout: 30000 });
for (const name of (process.argv[2] || 'Осенний парк').split(',')) {
  await p.click('header [data-go="archive"]'); await p.click(`.day-card:has-text("${name}")`);
  await p.waitForFunction(() => PV.App.state.view === 'day' && PV.App.state.player && document.querySelector('#busy').hidden, null, { timeout: 30000 });
  const r = await p.evaluate(async () => {
    const st = PV.App.state; st.player.pause();
    const blobP = new Promise((res) => { const orig = PV.App.download; });
    /* saveVideo пишет в day.video — берём оттуда */
    document.querySelector('#d-video'); 
    return null; });
  await p.evaluate(() => { window.__dl = null; const a = HTMLAnchorElement.prototype.click; HTMLAnchorElement.prototype.click = function () { if (this.download) { window.__dl = this.href; return; } return a.call(this); }; });
  await p.click('#d-video');
  await p.waitForFunction(() => window.__dl, null, { timeout: 180000 });
  const b64 = await p.evaluate(async () => { const bl = await (await fetch(window.__dl)).blob(); const u = new Uint8Array(await bl.arrayBuffer()); let s = ''; for (let i = 0; i < u.length; i += 32768) s += String.fromCharCode.apply(null, u.subarray(i, i + 32768)); return { d: btoa(s), t: bl.type }; });
  const ext = /mp4/.test(b64.t) ? 'mp4' : 'webm';
  const f = path.join(__dirname, '..', 'test', 'out', 'ad', `day_${name.split(' ')[0]}.${ext}`); fs.writeFileSync(f, Buffer.from(b64.d, 'base64')); console.log(f, b64.t);
}
await b.close(); })().catch((e) => { console.error(e); process.exit(1); });
