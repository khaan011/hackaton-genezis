// Сквозная проверка «Мгновений из Instagram» в Chrome: вход через Instagram (стенд API + настоящий прокси),
// архив Instagram (ZIP со сжатием), фотоплёнка, сборка дней. Запуск: node test/ig_e2e.js (Playwright).
const { chromium } = require('playwright');
const fs = require('fs'), path = require('path'), { spawn } = require('child_process');
const { zip, mojibake } = require('../tools/zipwrite.js');
const PORT = process.env.PORT || 8765, APP = `http://localhost:${PORT}`;
const OUT = path.join(__dirname, 'out'), CDN = path.join(OUT, 'igcdn');
let fails = 0;
const check = (c, m) => { if (c) console.log('  ✓', m); else { fails++; console.log('  ✗', m); } };

(async () => {
  fs.mkdirSync(CDN, { recursive: true });
  const ff = process.env.FFMPEG || (fs.existsSync(path.join(require('os').homedir(), '.local/bin/ffmpeg')) ? path.join(require('os').homedir(), '.local/bin/ffmpeg') : 'ffmpeg');
  for (const [n, a, b] of [['p1', 'd8a040', '6a8a30'], ['p2', '1a2550', '6a8a30'], ['p3', '1a2550', 'f0e8d8']]) {
    const f = path.join(CDN, n + '.jpg');
    if (!fs.existsSync(f)) require('child_process').execFileSync(ff, ['-v', 'error', '-y', '-f', 'lavfi', '-i', `gradients=s=900x1100:c0=0x${a}:c1=0x${b}:duration=1`, '-frames:v', '1', f]);
  }
  const srv = process.env.NO_SERVER ? null : spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  const { startMock, MOCK, PROXY } = await import('./ig_mock.mjs');
  const mock = await startMock(CDN);
  await new Promise((r) => setTimeout(r, 700));
  const browser = await chromium.launch({ args: ['--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !/favicon|ERR_FILE_NOT_FOUND|404/.test(m.text())) errors.push('console: ' + m.text()); });
  try {
    await page.goto(`${APP}/index.html`);
    await page.waitForSelector('#v-archive:not([hidden])');
    console.log('== вход через Instagram');
    await page.click('header [data-go="insta"]');
    await page.waitForSelector('#v-insta:not([hidden])');
    await page.click('#ig-login');
    check(/ещё не подключён/.test(await page.textContent('#ig-status')), 'без подключения вход честно предлагает архив и фотоплёнку');
    await page.evaluate(([proxy, mock]) => localStorage.setItem('pv-ig-config', JSON.stringify({ appId: '1234567890', proxy, authBase: mock, graphBase: mock })), [PROXY, MOCK]);
    const [popup] = await Promise.all([ctx.waitForEvent('page'), page.click('#ig-login')]);
    await popup.waitForEvent('close', { timeout: 30000 });
    check(true, 'окно входа Instagram открылось и само закрылось после входа');
    await page.waitForSelector('#ig-found:not([hidden])', { timeout: 30000 });
    const acc = await page.textContent('#ig-acc-state');
    check(/@demo\.moments/.test(acc) && /автора/.test(acc), `аккаунт привязан: «${acc.trim()}»`);
    check(!/code=/.test(page.url()), 'код входа убран из адресной строки');
    check(mock.log.some((l) => l === 'POST /oauth/access_token') && mock.log.some((l) => l.startsWith('GET /access_token')), 'прокси обменял код на долгоживущий токен');
    const tok = await page.evaluate(() => JSON.parse(localStorage.getItem('pv-ig-token')));
    check(tok && tok.token === 'LONG' && tok.exp > Date.now() + 50 * 864e5, 'токен на 60 дней сохранён только на устройстве');
    const title = await page.textContent('#ig-found-title');
    check(/@demo\.moments: 2 дня/.test(title) && /4 снимка/.test(title), `публикации разложены по дням: «${title}»`);
    await page.waitForFunction(() => [...document.querySelectorAll('#ig-days .ig-thumbs i')].filter((i) => i.style.backgroundImage).length >= 3, null, { timeout: 20000 });
    check(true, 'миниатюры загружены через прокси (CDN без CORS)');
    console.log('\n== день из Instagram в форме');
    await page.click('#ig-days .ig-day:first-child .ig-open');
    await page.waitForSelector('#v-new:not([hidden])');
    await page.waitForFunction(() => document.querySelectorAll('#f-thumbs .thumb').length > 0);
    const form = await page.evaluate(() => ({ text: document.querySelector('#f-text').value, date: document.querySelector('#f-date').value, mode: PV.App.state.form.song.mode, go: !document.querySelector('#f-go').disabled, note: document.querySelector('#f-ig-note').textContent }));
    console.log('   черновик:', form.text);
    check(/жёлтые клёны и какао/.test(form.text) && !/пост|сторис|тона|\d\d:\d\d|#/.test(form.text), 'черновик записи: только подписи человека, без служебных слов');
    check(/Что дневник увидел/.test(form.note), 'описание света снимков — отдельной подсказкой');
    check(form.mode === 'none' && form.go, 'без песни можно собрать сразу (ритм по снимкам)');
    check(/Черновик из Instagram/.test(form.note), 'плашка объясняет, откуда черновик');
    await page.click('#f-go');
    await page.waitForSelector('#v-day:not([hidden])', { timeout: 60000 });
    await page.waitForSelector('#busy', { state: 'hidden', timeout: 60000 });
    const day = await page.evaluate(() => ({ src: PV.App.state.day.source, label: PV.App.state.day.song.label, title: PV.App.state.day.title }));
    check(day.src && day.src.kind === 'instagram' && day.src.ids.length > 0, `день собран и помнит источник («${day.title}», ♪ ${day.label})`);
    console.log('\n== пакетная сборка');
    const before = await page.evaluate(async () => (await PV.Store.all()).length);
    await page.click('header [data-go="insta"]');
    await page.waitForSelector('#ig-days .badge');
    check(true, 'собранный день помечен «уже в дневнике»');
    await page.check('#ig-all');
    page.once('dialog', (d) => d.accept());
    await page.click('#ig-build');
    await page.waitForSelector('#dlg:not([hidden]), #v-archive:not([hidden])', { timeout: 90000 });
    if (await page.isVisible('#dlg:not([hidden])')) await page.click('#dlg-yes');
    await page.waitForSelector('#v-archive:not([hidden])', { timeout: 90000 });
    const after = await page.evaluate(async () => (await PV.Store.all()).length);
    check(after - before >= 2, `собрано дней: ${after - before}`);
    console.log('\n== архив Instagram (ZIP)');
    const ts = (hh) => { const d = new Date(); d.setDate(d.getDate() - 3); d.setHours(hh, 0, 0, 0); return Math.floor(d.getTime() / 1000); };
    const z = zip([
      { name: 'ig/your_instagram_activity/media/posts_1.json', data: JSON.stringify([{ media: [{ uri: 'media/posts/202611/a.jpg', creation_timestamp: ts(13), title: mojibake('Дача, речка и костёр') }] }]) },
      { name: 'ig/your_instagram_activity/media/stories.json', data: JSON.stringify({ ig_stories: [{ uri: 'media/stories/202611/b.jpg', creation_timestamp: ts(14), title: '' }] }) },
      { name: 'ig/media/posts/202611/a.jpg', data: fs.readFileSync(path.join(CDN, 'p1.jpg')) },
      { name: 'ig/media/stories/202611/b.jpg', data: fs.readFileSync(path.join(CDN, 'p2.jpg')) },
    ]);
    fs.writeFileSync(path.join(OUT, 'ig-export-test.zip'), z);
    await page.click('header [data-go="insta"]');
    await page.setInputFiles('#ig-zip', path.join(OUT, 'ig-export-test.zip'));
    await page.waitForFunction(() => /Архив Instagram: 1 день, 2 снимка/.test(document.querySelector('#ig-found-title').textContent), null, { timeout: 20000 });
    await page.waitForFunction(() => /Дача/.test([...document.querySelectorAll('#ig-days .ig-caps')].map((e) => e.textContent).join(' ')), null, { timeout: 10000 }).catch(() => {});
    const caps = (await page.$$eval('#ig-days .ig-caps', (e) => e.map((x) => x.textContent))).join(' ');
    console.log('   подписи:', caps);
    check(/Дача, речка и костёр/.test(caps), 'подпись из сжатого JSON выгрузки прочитана по-русски');
    console.log('\n== фотоплёнка');
    await page.setInputFiles('#ig-gallery', ['p1', 'p2', 'p3'].map((n) => path.join(CDN, n + '.jpg')));
    await page.waitForFunction(() => /Фотоплёнка: \d+ д/.test(document.querySelector('#ig-found-title').textContent), null, { timeout: 20000 });
    check(true, 'снимки из фотоплёнки разложены по дням');
    console.log('\n== демо-архив Instagram');
    await page.click('#ig-demo');
    await page.waitForFunction(() => /Демо-архив Instagram: 4 дня, 12 снимков/.test(document.querySelector('#ig-found-title').textContent), null, { timeout: 30000 });
    const chips = await page.$$eval('#ig-days .chip', (els) => els.map((e) => e.textContent).join(' | '));
    check(/мгновени/.test(chips) && /сторис/.test(chips) && /пост/.test(chips), `источники распознаны: ${chips}`);
    const before2 = await page.evaluate(async () => (await PV.Store.all()).length);
    await page.check('#ig-all');
    await page.click('#ig-build');
    await page.waitForSelector('#v-archive:not([hidden])', { timeout: 120000 });
    const made = await page.evaluate(async () => (await PV.Store.all()).filter((d) => d.source && d.source.from === 'демо-архив Instagram').map((d) => `${d.date} «${d.title}» ${d.summary.register}`));
    console.log('   ', made.join('\n    '));
    check(made.length === 4 && (await page.evaluate(async () => (await PV.Store.all()).length)) - before2 === 4, 'демо-архив: собраны 4 дня');
    check(new Set(made.map((m) => m.split(' ').pop())).size >= 3, 'дни из Instagram получили разные режимы');
    await page.screenshot({ path: path.join(OUT, 'ig_archive.png') });
    await page.click('header [data-go="insta"]');
    console.log('\n== отвязать');
    await page.click('#ig-logout'); await page.click('#dlg-yes');
    check(await page.evaluate(() => !localStorage.getItem('pv-ig-token')), 'токен удалён');
    await page.setViewportSize({ width: 390, height: 844 });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.join(OUT, 'ig_phone.png'), fullPage: false });
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.screenshot({ path: path.join(OUT, 'ig_desk.png'), fullPage: true });
  } catch (e) { fails++; console.error(e); await page.screenshot({ path: path.join(OUT, 'ig_fail.png') }).catch(() => {}); }
  check(!errors.length, 'ошибок в консоли нет' + (errors.length ? ': ' + errors.join(' | ') : ''));
  await browser.close(); mock.close(); if (srv) srv.kill();
  console.log(fails ? `\nПровалено проверок: ${fails}` : '\nВсе проверки пройдены');
  process.exit(fails ? 1 : 0);
})();
