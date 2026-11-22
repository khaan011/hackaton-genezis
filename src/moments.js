/* Послевкусие — экран «Мгновения из Instagram»: привязка аккаунта, архив, фотоплёнка → дни дневника. */
(function () {
'use strict';
const PV = globalThis.PV, U = PV.U, I = PV.Insta;
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const App = () => PV.App;

const st = { items: [], days: [], label: '', picked: new Set(), urls: [], prepared: new Map(), period: 90, loadedApi: false, seq: 0,
  want: typeof location !== 'undefined' && /[?&](code|error)=/.test(location.search) ? 'insta' : null };
const SRC_PL = { instant: ['мгновение', 'мгновения', 'мгновений'], post: ['пост', 'поста', 'постов'], api: ['публикация', 'публикации', 'публикаций'], story: ['сторис', 'сторис', 'сторис'], archived: ['из архива', 'из архива', 'из архива'], reel: ['рилс', 'рилс', 'рилс'], gallery: ['снимок', 'снимка', 'снимков'] };
const SRC_ICON = { instant: '⚡', post: '▦', api: '▦', story: '◔', archived: '▣', reel: '▶', gallery: '📷' };
const plural = (n, a, b, c) => `${n} ${U.plural(n, a, b, c)}`;
const status = (t) => { $('#ig-status').textContent = t || ''; };

/* ---------- аккаунт ---------- */
function renderAccount() {
  const api = I.api, s = api.session(), box = $('#ig-acc-state');
  const cfg = api.config();
  $('#ig-app-id').value = (JSON.parse(localStorage.getItem('pv-ig-config') || 'null') || {}).appId || '';
  $('#ig-proxy').value = (JSON.parse(localStorage.getItem('pv-ig-config') || 'null') || {}).proxy || '';
  $('#ig-refresh').hidden = $('#ig-logout').hidden = $('#ig-period').hidden = !s;
  $('#ig-login').hidden = !!s;
  if (s) {
    const type = { BUSINESS: 'бизнес-аккаунт', MEDIA_CREATOR: 'аккаунт автора', CREATOR: 'аккаунт автора' }[s.accountType] || 'аккаунт';
    box.innerHTML = `<span class="ok-dot"></span><b>${esc(s.username ? '@' + s.username : 'Instagram')}</b> · ${esc(type)} привязан${s.exp ? ` · доступ до ${esc(U.dateLong(I.dateKey(s.exp)))}` : ''}`;
  } else box.textContent = '';
}
async function login() {
  if (!I.api.configured()) {
    status('Вход через Instagram на этом сайте ещё не подключён. А пока — архив Instagram или мгновения из фотоплёнки: работает для любого аккаунта.');
    return;
  }
  $('#ig-login').disabled = true; $('#ig-login').textContent = 'Ждём окно Instagram…';
  try {
    const r = await I.api.loginPopup();
    if (r && r.error) status(r.error);
    else if (r && r.ok) { App().toast(`Instagram привязан${r.session.username ? ': @' + r.session.username : ''}`); st.loadedApi = false; show(); }
  } catch (e) { status('Не получилось войти: ' + e.message); }
  finally { $('#ig-login').disabled = false; $('#ig-login').textContent = 'Войти через Instagram'; }
}
async function loadFromApi() {
  const my = ++st.seq;
  status('Загружаю публикации из Instagram…');
  try {
    const items = await I.api.fetchMedia({ sinceDays: st.period });
    if (my !== st.seq) return;
    st.loadedApi = true;
    const s = I.api.session();
    setItems(items, s && s.username ? '@' + s.username : 'Instagram');
  } catch (e) {
    console.warn(e);
    status('Не получилось загрузить публикации: ' + e.message);
    renderAccount();
  }
}

/* ---------- источники ---------- */
async function fromZip(file, label) {
  const my = ++st.seq;
  App().busy(true, 'Читаю архив Instagram…', 0.05);
  try {
    const entries = await I.openZip(file);
    const items = await I.parseExport(entries, (p) => App().busy(true, 'Ищу снимки и подписи…', 0.05 + 0.9 * p));
    if (my !== st.seq) return;
    if (!items.length) { status('В архиве не нашлось снимков. Нужна выгрузка в формате JSON с разделом «Медиа».'); return; }
    setItems(items, label || 'архив Instagram');
  } catch (e) { console.warn(e); status('Архив не прочитан: ' + e.message); }
  finally { App().busy(false); }
}
async function fromFolder(files) {
  const my = ++st.seq;
  App().busy(true, 'Читаю папку архива…', 0.1);
  try {
    const items = await I.parseExport(I.folderEntries(files), (p) => App().busy(true, 'Ищу снимки и подписи…', 0.1 + 0.85 * p));
    if (my !== st.seq) return;
    if (!items.length) { status('В папке не нашлось снимков выгрузки Instagram.'); return; }
    setItems(items, 'архив Instagram');
  } catch (e) { status('Папка не прочитана: ' + e.message); } finally { App().busy(false); }
}
async function fromGallery(files) {
  const my = ++st.seq;
  App().busy(true, 'Смотрю даты съёмки…', 0.2);
  try {
    const items = await I.galleryItems(files);
    if (my !== st.seq) return;
    if (!items.length) { status('Не нашлось снимков.'); return; }
    setItems(items, 'фотоплёнка');
    const heic = items.filter((x) => /\.hei[cf]$/i.test(x.name)).length;
    const safari = /Safari/.test(navigator.userAgent) && !/Chrome|Chromium|Edg/.test(navigator.userAgent);
    status([items.some((x) => !x.exact) ? 'У части снимков нет даты съёмки в EXIF — для них взята дата файла, такие дни помечены «дата примерная».' : '', heic && !safari ? `${plural(heic, 'снимок', 'снимка', 'снимков')} в HEIC: этот браузер может их не открыть — выберите «Наиболее совместимый» формат в настройках камеры или откройте дневник в Safari.` : ''].filter(Boolean).join(' '));
  } catch (e) { console.warn(e); status('Снимки не прочитаны: ' + e.message); } finally { App().busy(false); }
}
async function demo() {
  App().busy(true, 'Загружаю демо-архив Instagram…', 0.1);
  try {
    const r = await fetch('demo/instagram-demo.zip', { cache: 'no-store' });
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const blob = await r.blob();
    App().busy(false);
    await fromZip(blob, 'демо-архив Instagram');
  } catch (e) { App().busy(false); status('Демо-архив недоступен: ' + e.message + '. Откройте дневник через сервер (start.sh) или по ссылке GitHub Pages.'); }
}

/* ---------- дни ---------- */
async function knownIds() {
  const ids = new Set();
  for (const d of await PV.Store.all()) for (const id of ((d.source && d.source.ids) || [])) ids.add(id);
  return ids;
}
function setItems(items, label) {
  st.items = items; st.label = label;
  st.days = I.groupDays(items);
  st.picked = new Set();
  st.prepared = new Map();
  status('');
  renderDays();
  $('#ig-found').scrollIntoView({ behavior: 'smooth', block: 'start' });
}
async function renderDays() {
  st.urls.forEach((u) => URL.revokeObjectURL(u)); st.urls = [];
  const box = $('#ig-days');
  $('#ig-found').hidden = !st.days.length;
  const n = st.items.length;
  $('#ig-found-title').textContent = `${U.cap(st.label)}: ${plural(st.days.length, 'день', 'дня', 'дней')}, ${plural(n, 'снимок', 'снимка', 'снимков')}`;
  const known = await knownIds();
  box.innerHTML = st.days.map((d, i) => {
    const chips = Object.entries(d.counts).map(([k, v]) => `<span class="chip">${SRC_ICON[k] || '·'} ${v} ${esc(SRC_PL[k] ? U.plural(v, ...SRC_PL[k]) : k)}</span>`).join('');
    const caps = [...new Set(d.items.map((x) => I.cleanCaption(x.caption).text).filter(Boolean))].slice(0, 2);
    const inDiary = d.items.some((x) => known.has(x.id));
    const times = `${I.hhmm(d.items[0].ts)}–${I.hhmm(d.items[d.items.length - 1].ts)}`;
    return `<article class="ig-day${inDiary ? ' done' : ''}" data-i="${i}">
      <label class="ig-check"><input type="checkbox" data-i="${i}" ${inDiary ? '' : ''}><span></span></label>
      <div class="ig-body">
        <div class="ig-date"><b>${esc(U.dateLong(d.date))}</b>, ${esc(U.weekday(d.date))}${d.approx ? ' <span class="muted">(дата примерная)</span>' : ` <span class="muted">· ${times}</span>`}${inDiary ? ' <span class="badge">уже в дневнике</span>' : ''}</div>
        <div class="ig-thumbs" data-i="${i}">${d.items.slice(0, 6).map(() => '<i></i>').join('')}${d.items.length > 6 ? `<em>+${d.items.length - 6}</em>` : ''}</div>
        <div class="ig-chips">${chips}</div>
        ${caps.length ? `<div class="ig-caps">${caps.map((c) => `«${esc(c)}»`).join(' · ')}</div>` : ''}
      </div>
      <button class="btn ghost smallb ig-open" data-i="${i}">Открыть в форме</button>
    </article>`;
  }).join('');
  $$('.ig-check input', box).forEach((c) => { c.onchange = () => { const i = +c.dataset.i; if (c.checked) st.picked.add(i); else st.picked.delete(i); syncPicked(); }; });
  $$('.ig-open', box).forEach((b) => { b.onclick = () => openInForm(+b.dataset.i).catch((e) => { console.error(e); App().toast('Не получилось открыть день: ' + e.message); }); });
  syncPicked();
  fillThumbs(st.seq);
}
function syncPicked() {
  const k = st.picked.size;
  $('#ig-build').disabled = !k;
  $('#ig-build').textContent = k ? `Собрать выбранные (${k})` : 'Собрать выбранные';
  $('#ig-all').checked = k > 0 && k === st.days.filter((d) => !d.approx).length;
}
/* миниатюры подгружаются по очереди — архив бывает большим */
async function fillThumbs(my) {
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((ents) => {
    for (const e of ents) if (e.isIntersecting) { io.unobserve(e.target); loadThumbs(+e.target.dataset.i, my); }
  }, { rootMargin: '300px' }) : null;
  $$('#ig-days .ig-thumbs').forEach((el) => { if (io) io.observe(el); else loadThumbs(+el.dataset.i, my); });
}
async function loadThumbs(i, my) {
  const d = st.days[i], el = $(`#ig-days .ig-thumbs[data-i="${i}"]`);
  if (!d || !el) return;
  const slots = $$('i', el);
  for (let k = 0; k < slots.length; k++) {
    if (my !== st.seq) return;
    try {
      const p = await prepare(d.items[k], true);
      if (!p) { slots[k].classList.add('none'); continue; }
      const u = URL.createObjectURL(p.thumb || p.blob); st.urls.push(u);
      slots[k].style.backgroundImage = `url("${u}")`;
      slots[k].title = `${I.hhmm(d.items[k].ts)} · ${I.SOURCE_RU[d.items[k].source] || ''}`;
    } catch (e) { slots[k].classList.add('none'); }
  }
}
/* снимок → нормализованный JPEG и анализ света и цвета (кэшируется) */
async function prepare(it, thumbOnly) {
  if (st.prepared.has(it.id)) return st.prepared.get(it.id);
  let blob = await it.getBlob();
  if (it.kind === 'video') { blob = await I.videoFrame(blob); if (!blob) { st.prepared.set(it.id, null); return null; } }
  if (thumbOnly && !st.prepared.has(it.id)) {
    /* для миниатюры хватает уменьшенной копии; полный анализ — при сборке */
    try {
      const bmp = await PV.Img.loadBitmap(blob);
      const k = Math.min(1, 220 / Math.max(bmp.width, bmp.height));
      const c = PV.Img.makeCanvas(bmp.width * k, bmp.height * k); c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
      const thumb = await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.8));
      return { thumb, blob };
    } catch (e) { return null; }
  }
  const n = await PV.Img.normalizePhoto(new File([blob], (it.name.split('/').pop() || 'photo').replace(/\.\w+$/, '') + '.jpg', { type: blob.type || 'image/jpeg' }));
  const p = { blob: n.blob, w: n.width, h: n.height, a: PV.Img.analyzePhoto(n.bitmap, U.hash(it.id)) };
  st.prepared.set(it.id, p);
  return p;
}
async function prepareDay(d, onStep) {
  const picks = I.pickForDay(d.items, 8), photos = [], used = [], analyses = new Map();
  for (let k = 0; k < picks.length; k++) {
    if (onStep) onStep(k / picks.length);
    try { const p = await prepare(picks[k]); if (p) { photos.push(p); used.push(picks[k]); analyses.set(picks[k].id, p.a); } } catch (e) { console.warn('снимок пропущен', picks[k].name, e); }
  }
  /* в черновик идут все снимки дня с подписями — не только попавшие в кадр */
  const forText = d.items.filter((x) => analyses.has(x.id) || I.cleanCaption(x.caption).text);
  const dr = I.draftText(forText.length ? forText : used, analyses);
  return { photos, used, text: dr.text, notes: dr.notes, captions: dr.captions, ids: d.items.map((x) => x.id) };
}

/* открыть день в обычной форме: снимки, черновик записи, дата; песню можно выбрать */
async function openInForm(i) {
  const d = st.days[i];
  App().busy(true, 'Готовлю день из Instagram…', 0.1);
  let prep;
  try { prep = await prepareDay(d, (p) => App().busy(true, 'Смотрю на свет и цвет снимков…', 0.1 + 0.8 * p)); } finally { App().busy(false); }
  if (!prep.photos.length) { App().toast('Снимки этого дня не открылись'); return; }
  App().go('new');
  App().resetForm();
  const f = App().state.form;
  $('#f-date').value = d.date;
  $('#f-text').value = prep.text;
  f.photos = prep.photos.slice(0, 8);
  f.source = { kind: 'instagram', from: st.label, ids: prep.ids };
  App().renderThumbs();
  App().setSongMode('none');
  App().textHint(); App().validate();
  const note = $('#f-ig-note');
  note.hidden = false;
  note.innerHTML = `<b>Черновик из Instagram</b> · ${esc(U.dateLong(d.date))} · ${plural(prep.photos.length, 'снимок', 'снимка', 'снимков')}. В записи — ${prep.captions ? 'ваши подписи по времени дня' : 'только время суток: подписей не было'}. Допишите пару фраз о том, как день <em>ощущался</em>, и выберите песню, если она была.${prep.notes.length ? `<details class="ig-notes"><summary>Что дневник увидел на снимках</summary>${prep.notes.map((n) => esc(n)).join('<br>')}</details>` : ''}`;
}

/* собрать выбранные дни сразу: черновик записи, ритм по снимкам */
async function buildPicked() {
  const list = [...st.picked].sort((a, b) => (st.days[a].date < st.days[b].date ? -1 : 1));
  if (!list.length) return;
  const known = await knownIds();
  const fresh = list.filter((i) => !st.days[i].items.some((x) => known.has(x.id)));
  if (fresh.length < list.length && !(await App().askConfirm(`${plural(list.length - fresh.length, 'день уже есть', 'дня уже есть', 'дней уже есть')} в дневнике. Собрать их ещё раз?`, 'Собрать все'))) list.splice(0, list.length, ...fresh);
  if (!list.length) return;
  $('#busy').classList.add('build');
  let done = 0;
  try {
    for (const i of list) {
      const d = st.days[i], base = done / list.length, part = 1 / list.length;
      const head = `День ${done + 1} из ${list.length}: ${U.dateLong(d.date)}`;
      App().busy(true, head + ' — смотрю снимки…', base + part * 0.05);
      const prep = await prepareDay(d, (p) => App().busy(true, head + ' — смотрю снимки…', base + part * 0.6 * p));
      if (!prep.photos.length) continue;
      App().busy(true, head + ' — рисую страницу…', base + part * 0.7);
      const day = await App().composeDay({
        date: d.date, text: prep.text, photos: prep.photos, weather: null,
        song: { mode: 'none', describe: {} }, meta: { artist: '', title: '', year: null, label: '', genre: null, tempo: null, mood: null },
        source: { kind: 'instagram', from: st.label, ids: prep.ids },
      });
      await App().saveDayQuiet(day);
      done++;
    }
  } catch (e) { console.error(e); App().toast('Сборка остановилась: ' + e.message, 7000); }
  finally { App().busy(false); $('#busy').classList.remove('build'); }
  if (done) {
    App().go('archive');
    App().toast(`Из Instagram собрано: ${plural(done, 'день', 'дня', 'дней')}. Откройте день, чтобы дописать, как он ощущался.`, 6500);
  }
}

/* ---------- запуск ---------- */
function show() {
  renderAccount();
  if (st.days.length) renderDays(); /* отметки «уже в дневнике» могли измениться */
  else if (I.api.session() && !st.loadedApi) loadFromApi();
}
function bind() {
  $('#ig-login').onclick = login;
  $('#ig-refresh').onclick = loadFromApi;
  $('#ig-logout').onclick = async () => { if (!(await App().askConfirm('Отвязать Instagram? Собранные дни останутся в дневнике.', 'Отвязать'))) return; I.api.logout(); st.loadedApi = false; renderAccount(); status('Instagram отвязан. Токен удалён с этого устройства.'); };
  $$('#ig-period button').forEach((b) => { b.onclick = () => { $$('#ig-period button').forEach((x) => x.classList.toggle('on', x === b)); st.period = +b.dataset.d; loadFromApi(); }; });
  $('#ig-save-cfg').onclick = () => { I.api.saveConfig({ appId: $('#ig-app-id').value.trim(), proxy: $('#ig-proxy').value.trim() }); renderAccount(); App().toast(I.api.configured() ? 'Подключение сохранено на этом устройстве' : 'Настройки очищены'); };
  $('#ig-zip').onchange = (e) => { const f = e.target.files[0]; e.target.value = ''; if (f) fromZip(f); };
  $('#ig-dir').onchange = (e) => { const fs = e.target.files; if (fs && fs.length) fromFolder([...fs]); e.target.value = ''; };
  $('#ig-gallery').onchange = (e) => { const fs = [...e.target.files]; e.target.value = ''; if (fs.length) fromGallery(fs); };
  $('#ig-demo').onclick = demo;
  /* «выбрать все» не берёт дни с примерной датой — их снимки могли быть сделаны в другие дни */
  $('#ig-all').onchange = (e) => { st.picked = new Set(e.target.checked ? st.days.map((d, i) => (d.approx ? -1 : i)).filter((i) => i >= 0) : []); $$('#ig-days .ig-check input').forEach((c) => { c.checked = st.picked.has(+c.dataset.i); }); syncPicked(); };
  $('#ig-build').onclick = () => buildPicked();
}
async function init() {
  bind();
  /* возвращение со страницы входа Instagram */
  try {
    const r = await I.api.handleRedirect();
    if (r) {
      if (App().state.view !== 'insta' && App().state.ready) App().go('insta');
      if (r.popup) return;
      if (r.error) status(r.error);
      else { App().toast(`Instagram привязан${r.session.username ? ': @' + r.session.username : ''}`); show(); }
    }
  } catch (e) { console.warn(e); App().go('insta'); status('Не получилось завершить вход: ' + e.message); }
}

PV.Moments = { show, setItems, state: st, openInForm, buildPicked, fromZip };
document.addEventListener('DOMContentLoaded', () => { init(); });
})();
