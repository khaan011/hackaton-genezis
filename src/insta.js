/* Послевкусие — мгновения из Instagram.
   Три пути, все без посредников между человеком и его снимками:
   1) архив Instagram («Скачать вашу информацию», ZIP или папка) — разбираем прямо в браузере, файл не покидает устройство;
   2) галерея телефона — снимки мгновений (Instants: моментальные снимки Instagram с мая 2026, по API недоступны); раскладываем по дате съёмки из EXIF;
   3) привязка аккаунта через официальный Instagram API with Instagram Login (профессиональные аккаунты):
      код входа меняется на токен в маленьком прокси (connect/instagram-proxy.js), потому что секрет приложения нельзя держать в браузере.
   Здесь — ядро без интерфейса: ZIP со сжатием и ZIP64, разбор выгрузки, EXIF, группировка по дням, черновик записи, клиент API. */
(function () {
'use strict';
const PV = (globalThis.PV = globalThis.PV || {});
const U = PV.U;

/* ---------- ZIP: чтение по частям (архив Instagram бывает в гигабайты), deflate, ZIP64 ---------- */
const IMG_RE = /\.(jpe?g|png|webp|heic|heif|gif)$/i, VID_RE = /\.(mp4|mov|m4v|webm)$/i;
const u64 = (dv, o) => Number(dv.getBigUint64(o, true));
function dosDate(date, time) {
  if (!date) return 0;
  return new Date(1980 + (date >> 9), ((date >> 5) & 15) - 1, date & 31, time >> 11, (time >> 5) & 63, (time & 31) * 2).getTime();
}
async function openZip(file) {
  const size = file.size;
  const tailLen = Math.min(size, 65535 + 22 + 20);
  const tail = new Uint8Array(await file.slice(size - tailLen).arrayBuffer());
  const tdv = new DataView(tail.buffer);
  let e = tail.length - 22;
  while (e >= 0 && tdv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Это не ZIP-архив');
  let count = tdv.getUint16(e + 10, true), cdSize = tdv.getUint32(e + 12, true), cdOff = tdv.getUint32(e + 16, true);
  if ((count === 0xffff || cdOff === 0xffffffff || cdSize === 0xffffffff) && e >= 20 && tdv.getUint32(e - 20, true) === 0x07064b50) {
    const z64 = u64(tdv, e - 20 + 8);
    const zdv = new DataView(await file.slice(z64, z64 + 56).arrayBuffer());
    if (zdv.getUint32(0, true) !== 0x06064b50) throw new Error('Повреждённый ZIP64');
    count = u64(zdv, 32); cdSize = u64(zdv, 40); cdOff = u64(zdv, 48);
  }
  const cd = new Uint8Array(await file.slice(cdOff, cdOff + cdSize).arrayBuffer()), dv = new DataView(cd.buffer);
  const utf8 = new TextDecoder();
  const entries = [];
  let p = 0;
  for (let i = 0; i < count && p + 46 <= cd.length; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Повреждённый архив');
    const method = dv.getUint16(p + 10, true), time = dv.getUint16(p + 12, true), date = dv.getUint16(p + 14, true);
    let csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), lo = dv.getUint32(p + 42, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true);
    const name = utf8.decode(cd.subarray(p + 46, p + 46 + nl));
    /* ZIP64: настоящие размеры и смещение — в дополнительном поле 0x0001 */
    let x = p + 46 + nl;
    const xEnd = x + xl;
    while (x + 4 <= xEnd) {
      const id = dv.getUint16(x, true), len = dv.getUint16(x + 2, true);
      if (id === 1) {
        let q = x + 4;
        if (usize === 0xffffffff) { usize = u64(dv, q); q += 8; }
        if (csize === 0xffffffff) { csize = u64(dv, q); q += 8; }
        if (lo === 0xffffffff) { lo = u64(dv, q); q += 8; }
      }
      x += 4 + len;
    }
    p = xEnd + cl;
    if (name.endsWith('/')) continue;
    entries.push({
      name, size: usize, mtime: dosDate(date, time),
      async read(type) {
        const lh = new DataView(await file.slice(lo, lo + 30).arrayBuffer());
        if (lh.getUint32(0, true) !== 0x04034b50) throw new Error('Повреждённый архив');
        const start = lo + 30 + lh.getUint16(26, true) + lh.getUint16(28, true);
        const raw = file.slice(start, start + csize);
        if (method === 0) return new Blob([raw], { type: type || '' });
        if (method === 8) {
          if (typeof DecompressionStream === 'undefined') throw new Error('Браузер не умеет распаковывать сжатые архивы. Распакуйте архив и выберите папку.');
          const out = await new Response(raw.stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
          return new Blob([out], { type: type || '' });
        }
        throw new Error('Неизвестный метод сжатия в архиве');
      },
    });
  }
  return entries;
}
/* папка, выбранная целиком (распакованный архив): те же записи, что у ZIP */
function folderEntries(files) {
  return [...files].map((f) => ({ name: f.webkitRelativePath || f.name, size: f.size, mtime: f.lastModified, read: async () => f }));
}

/* ---------- разбор выгрузки Instagram ---------- */
/* Instagram пишет текст в JSON как байты UTF-8, растянутые в Latin-1: «ÐÐ°ÐºÐ°Ð¾» вместо «какао» */
function fixText(s) {
  if (!s || typeof s !== 'string') return '';
  if (/[\u0080-ÿ]/.test(s) && !/[^\u0000-ÿ]/.test(s)) {
    try { return new TextDecoder('utf-8', { fatal: true }).decode(Uint8Array.from(s, (c) => c.charCodeAt(0))); } catch (e) { /* уже нормальный текст */ }
  }
  return s;
}
const SOURCE_RU = { instant: 'мгновение', post: 'пост', story: 'сторис', archived: 'архив', reel: 'рилс', gallery: 'снимок', api: 'пост' };
function sourceOf(path) {
  const p = path.toLowerCase();
  if (/instant/.test(p)) return 'instant';
  if (/stor/.test(p)) return 'story';
  if (/archiv/.test(p)) return 'archived';
  if (/reel/.test(p)) return 'reel';
  return 'post';
}
/* ищем во всех JSON выгрузки объекты с медиафайлом и временем — структура у Instagram меняется, поэтому обходим дерево целиком */
function collectMedia(json, path, out) {
  const src = sourceOf(path);
  const walk = (node, parent) => {
    if (Array.isArray(node)) { node.forEach((x) => walk(x, parent)); return; }
    if (!node || typeof node !== 'object') return;
    if (typeof node.uri === 'string' && (IMG_RE.test(node.uri) || VID_RE.test(node.uri))) {
      const ts = +(node.creation_timestamp || node.taken_at || (parent && parent.creation_timestamp) || 0);
      const cap = fixText(node.title || (parent && parent.title) || '');
      out.push({ uri: node.uri, ts: ts ? ts * 1000 : 0, caption: cap, source: /stor/i.test(path) || node.story ? 'story' : src });
    }
    for (const k of Object.keys(node)) if (node[k] && typeof node[k] === 'object') walk(node[k], node);
  };
  walk(json, null);
}
/* время из имени папки «media/posts/202311/…» — если в выгрузке нет JSON (формат HTML) */
function tsFromPath(name) {
  const m = /(?:^|\/)(20\d{2})(\d{2})(?:\d{2})?\//.exec(name);
  return m ? new Date(+m[1], +m[2] - 1, 1, 12).getTime() : 0;
}
async function parseExport(entries, onProgress) {
  const byName = new Map(entries.map((e) => [e.name, e]));
  /* uri в JSON — от корня выгрузки; архив иногда завёрнут в ещё одну папку */
  const resolve = (uri) => {
    const u = uri.replace(/^\.?\//, '');
    if (byName.has(u)) return byName.get(u);
    for (const e of entries) if (e.name.endsWith('/' + u)) return e;
    return null;
  };
  const jsons = entries.filter((e) => /\.json$/i.test(e.name) && /(media|content|instant|stor|post|reel|archiv)/i.test(e.name) && e.size < 40e6);
  const found = [];
  let k = 0;
  for (const e of jsons) {
    try { collectMedia(JSON.parse(await (await e.read()).text()), e.name, found); } catch (err) { console.warn('JSON выгрузки не прочитан:', e.name, err); }
    if (onProgress) onProgress(++k / Math.max(1, jsons.length) * 0.5);
  }
  const seen = new Set(), items = [];
  for (const f of found) {
    const e = resolve(f.uri);
    if (!e || seen.has(e.name)) continue;
    seen.add(e.name);
    items.push({ id: 'ig:' + e.name, name: e.name, entry: e, ts: f.ts || tsFromPath(e.name) || e.mtime, caption: f.caption, source: f.source, kind: VID_RE.test(e.name) ? 'video' : 'image', exact: !!f.ts });
  }
  /* медиа без записи в JSON: папка мгновений (если Instagram положит её в выгрузку) и выгрузка в формате HTML */
  const loose = entries.filter((e) => (IMG_RE.test(e.name) || VID_RE.test(e.name)) && !seen.has(e.name) && /(^|\/)(media|instants?|content)\//i.test(e.name) && !/(profile|avatar|sticker|thumbnail)/i.test(e.name));
  for (const e of loose) {
    let ts = 0, exact = false;
    if (/\.jpe?g$/i.test(e.name)) { try { ts = await exifDate(await e.read()); exact = !!ts; } catch (err) { /* без EXIF */ } }
    items.push({ id: 'ig:' + e.name, name: e.name, entry: e, ts: ts || tsFromPath(e.name) || e.mtime, caption: '', source: sourceOf(e.name), kind: VID_RE.test(e.name) ? 'video' : 'image', exact });
  }
  if (onProgress) onProgress(1);
  for (const it of items) it.getBlob = () => it.entry.read(it.kind === 'video' ? 'video/mp4' : mimeOf(it.name));
  return items.filter((x) => x.ts > 0);
}
const mimeOf = (n) => (/\.png$/i.test(n) ? 'image/png' : /\.webp$/i.test(n) ? 'image/webp' : /\.gif$/i.test(n) ? 'image/gif' : /\.hei[cf]$/i.test(n) ? 'image/heic' : 'image/jpeg');

/* ---------- EXIF: дата съёмки из JPEG (DateTimeOriginal, иначе DateTime) ---------- */
async function exifDate(blob) {
  const u8 = new Uint8Array(await blob.slice(0, 256 * 1024).arrayBuffer());
  return exifDateFromBytes(u8);
}
function exifDateFromBytes(u8) {
  const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
  if (dv.getUint16(0) !== 0xffd8) return 0;
  let p = 2;
  while (p + 4 < u8.length) {
    if (u8[p] !== 0xff) return 0;
    const marker = u8[p + 1], len = dv.getUint16(p + 2);
    if (marker === 0xe1 && u8[p + 4] === 0x45 && u8[p + 5] === 0x78 && u8[p + 6] === 0x69 && u8[p + 7] === 0x66) return parseTiffDate(dv, p + 10);
    if (marker === 0xda) return 0;
    p += 2 + len;
  }
  return 0;
}
function parseTiffDate(dv, t) {
  const le = dv.getUint16(t) === 0x4949;
  const g16 = (o) => dv.getUint16(t + o, le), g32 = (o) => dv.getUint32(t + o, le);
  const readAscii = (off, n) => { let s = ''; for (let i = 0; i < n - 1; i++) s += String.fromCharCode(dv.getUint8(t + off + i)); return s; };
  const tags = (ifd) => {
    const out = {}, n = g16(ifd);
    for (let i = 0; i < n; i++) {
      const e = ifd + 2 + i * 12, tag = g16(e), type = g16(e + 2), cnt = g32(e + 4);
      if (type === 2) out[tag] = readAscii(cnt > 4 ? g32(e + 8) : e + 8, cnt);
      else if (type === 4) out[tag] = g32(e + 8);
    }
    return out;
  };
  try {
    const ifd0 = tags(g32(4));
    const ex = ifd0[0x8769] ? tags(ifd0[0x8769]) : {};
    const s = ex[0x9003] || ex[0x9004] || ifd0[0x0132];
    const m = s && /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(s);
    if (!m || +m[1] < 1990) return 0;
    return new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime();
  } catch (e) { return 0; }
}
/* снимки из галереи телефона, в том числе мгновения Instagram */
async function galleryItems(files) {
  const out = [];
  for (const f of [...files]) {
    if (!(/^image\//.test(f.type) || IMG_RE.test(f.name))) continue;
    let ts = 0;
    if (/jpe?g/i.test(f.type) || /\.jpe?g$/i.test(f.name)) { try { ts = await exifDate(f); } catch (e) { /* без EXIF */ } }
    out.push({ id: 'g:' + f.name + ':' + f.size, name: f.name, ts: ts || f.lastModified || Date.now(), exact: !!ts, caption: '', source: 'gallery', kind: 'image', getBlob: async () => f });
  }
  return out;
}

/* ---------- кадр из видео сторис: снимок на 0,6 с ---------- */
async function videoFrame(blob, at = 0.6) {
  if (typeof document === 'undefined') return null;
  const url = URL.createObjectURL(blob);
  try {
    const v = document.createElement('video');
    v.muted = true; v.playsInline = true; v.preload = 'auto'; v.src = url;
    await new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), 8000); v.onloadeddata = () => { clearTimeout(t); res(); }; v.onerror = () => { clearTimeout(t); rej(new Error('video')); }; });
    v.currentTime = Math.min(at, Math.max(0, (v.duration || 1) - 0.05));
    await new Promise((res) => { const t = setTimeout(res, 3000); v.onseeked = () => { clearTimeout(t); res(); }; });
    const c = document.createElement('canvas');
    const k = Math.min(1, 1600 / Math.max(v.videoWidth, v.videoHeight));
    c.width = Math.round(v.videoWidth * k); c.height = Math.round(v.videoHeight * k);
    c.getContext('2d').drawImage(v, 0, 0, c.width, c.height);
    return await new Promise((r) => c.toBlob(r, 'image/jpeg', 0.88));
  } catch (e) { return null; } finally { URL.revokeObjectURL(url); }
}

/* ---------- дни: группировка по местной дате, выбор до 8 снимков ---------- */
const dateKey = (ts) => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const hhmm = (ts) => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
const todOf = (ts) => { const h = new Date(ts).getHours(); return h < 5 ? 'night' : h < 12 ? 'morning' : h < 17 ? 'day' : h < 22 ? 'evening' : 'night'; };
const SRC_RANK = { instant: 0, gallery: 1, post: 2, api: 2, archived: 3, story: 4, reel: 5 };
function groupDays(items) {
  const map = new Map();
  for (const it of items) {
    if (!it.ts) continue;
    const k = dateKey(it.ts);
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(it);
  }
  return [...map.entries()].map(([date, list]) => {
    list.sort((a, b) => a.ts - b.ts);
    const counts = {};
    list.forEach((x) => { counts[x.source] = (counts[x.source] || 0) + 1; });
    return { date, items: list, counts, approx: list.every((x) => !x.exact && x.source !== 'api') };
  }).sort((a, b) => (a.date < b.date ? 1 : -1));
}
/* до 8 снимков: сначала мгновения и посты, затем сторис; равномерно по дню, в порядке времени */
function pickForDay(items, max = 8) {
  if (items.length <= max) return items.slice();
  const imgs = items.filter((x) => x.kind === 'image'), pool = imgs.length >= Math.min(max, 3) ? imgs : items;
  const ranks = [...new Set(pool.map((x) => SRC_RANK[x.source] ?? 9))].sort((a, b) => a - b);
  const out = [];
  for (const r of ranks) {
    const group = pool.filter((x) => (SRC_RANK[x.source] ?? 9) === r).sort((a, b) => a.ts - b.ts);
    const left = max - out.length;
    if (left <= 0) break;
    if (group.length <= left) out.push(...group);
    else { const step = group.length / left; for (let i = 0; i < left; i++) out.push(group[Math.floor(i * step + step / 2)]); }
  }
  return out.sort((a, b) => a.ts - b.ts);
}

/* ---------- черновик записи: подписи, время, свет и цвет снимков ---------- */
const EMOJI = [[/[❤😍🥰💕💖😘]/u, 'с любовью'], [/[😂🤣😆😁]/u, 'смеялись'], [/[😢😭💔]/u, 'грустно'], [/[☀🌞]/u, 'солнце'], [/[🌧☔🌂]/u, 'дождь'],
  [/[❄☃⛄]/u, 'снег'], [/[🎉🥳🎂🎈]/u, 'праздник'], [/[☕]/u, 'кофе'], [/[🌊🏖]/u, 'море'], [/[🌲🌳🍂🍁]/u, 'деревья и листья'], [/[🌙🌃✨]/u, 'ночь и огни'], [/[🎶🎵🎧]/u, 'музыка']];
function cleanCaption(s) {
  let t = fixText(s || '');
  const extra = [];
  for (const [re, w] of EMOJI) if (re.test(t)) extra.push(w);
  t = t.replace(/https?:\/\/\S+/g, ' ').replace(/[#@][\p{L}\p{N}_.]+/gu, ' ')
    .replace(/[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}‍️]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (t.length > 160) t = t.slice(0, 160).replace(/\s+\S*$/, '') + '…';
  return { text: t, extra };
}
const TOD_WORD = { morning: 'Утро', day: 'День', evening: 'Вечер', night: 'Ночь' };
function lightWords(a, tod) {
  if (!a) return '';
  const bits = [];
  if (a.lum < 0.3) bits.push(tod === 'evening' || tod === 'night' ? 'темно, горят огни' : 'темно');
  else if (a.lum > 0.62) bits.push('светло');
  else bits.push('мягкий свет');
  if (a.warm > 0.3) bits.push('тёплые тона'); else if (a.warm < -0.3) bits.push('холодные тона');
  const names = PV.Mood && a.palette ? [...new Set(a.palette.slice(0, 2).map((p) => PV.Mood.colorName(p.rgb)))] : [];
  if (names.length) bits.push('в кадре ' + names.join(' и '));
  return bits.join(', ');
}
/* Черновик записи — только слова человека: подписи к снимкам по порядку, с временем суток («Утром — …»).
   Машинное описание света и цвета в запись НЕ идёт (иначе фото посчиталось бы дважды и попало в подписи кадров) —
   оно возвращается отдельно, как подсказка в форме. items: [{ts, source, caption}], analyses: Map(id → анализ снимка) */
const TOD_ADV = { morning: 'Утром', day: 'Днём', evening: 'Вечером', night: 'Ночью' };
function draftText(items, analyses) {
  const sentences = [], notes = [], tods = [];
  let lastTod = null, lastCap = null;
  for (const it of items) {
    const tod = todOf(it.ts);
    if (!tods.includes(tod)) tods.push(tod);
    let { text, extra } = cleanCaption(it.caption);
    if (text && text === lastCap) text = '';
    const a = analyses && analyses.get(it.id);
    if (a) notes.push(`${hhmm(it.ts)} ${SOURCE_RU[it.source] || 'снимок'}: ${lightWords(a, tod)}`);
    /* подпись из одних эмодзи («☔🌃») становится словами: «дождь, ночь и огни» */
    if (!text && extra.length) text = extra.join(', ');
    if (!text) continue;
    lastCap = text;
    const body = text.replace(/[.!?…]+$/, '');
    /* время суток пишем, только если оно сменилось и подпись сама о нём не говорит («Вечером пошёл дождь») */
    const saysTod = /^(утр|дн[её]м|полдень|вечер|ноч|рассвет|закат)/i.test(body);
    sentences.push(tod !== lastTod && !saysTod ? `${TOD_ADV[tod]} — ${body.charAt(0).toLowerCase()}${body.slice(1)}.` : `${U.cap(body)}.`);
    lastTod = tod;
  }
  /* подписей нет — только время суток, без выдуманных чувств */
  const text = sentences.length ? sentences.join(' ') : U.cap(tods.map((t) => TOD_ADV[t].toLowerCase()).join(', потом ')) + ' — снимки без подписей.';
  return { text, notes, captions: sentences.length };
}
/* без песни — ритм дня по снимкам: темп от числа кадров и света, характер от света и тепла */
function songFromPhotos(P, n) {
  const tempo = n >= 6 || (P && P.sat > 0.5) ? 'fast' : n <= 2 || (P && P.lum < 0.3) ? 'slow' : 'mid';
  const mood = P && (P.lum < 0.32 || P.warm < -0.3) ? 'dark' : 'light';
  return { tempo, mood };
}

/* ---------- привязка аккаунта: Instagram API with Instagram Login ---------- */
const LS_CFG = 'pv-ig-config', LS_TOKEN = 'pv-ig-token', SS_STATE = 'pv-ig-state';
const DEF = { authBase: 'https://www.instagram.com', graphBase: 'https://graph.instagram.com', apiVersion: 'v23.0', scope: 'instagram_business_basic' };
const ls = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* без хранилища */ } },
};
const meta = (n) => { const m = typeof document !== 'undefined' && document.querySelector(`meta[name="${n}"]`); return (m && m.content.trim()) || ''; };
function config() {
  const own = ls.get(LS_CFG) || {};
  const c = { ...DEF, appId: meta('pv-ig-app-id'), proxy: meta('pv-ig-proxy'), ...Object.fromEntries(Object.entries(own).filter(([, v]) => v)) };
  c.proxy = (c.proxy || '').replace(/\/+$/, '');
  c.redirectUri = c.redirectUri || (typeof location !== 'undefined' ? location.origin + location.pathname : '');
  return c;
}
const configured = () => { const c = config(); return !!(c.appId && c.proxy); };
function saveConfig(v) { ls.set(LS_CFG, v && Object.values(v).some(Boolean) ? v : null); }
function session() {
  const s = ls.get(LS_TOKEN);
  if (!s || !s.token) return null;
  if (s.exp && s.exp < Date.now()) { ls.set(LS_TOKEN, null); return null; }
  return s;
}
function authorizeUrl() {
  const c = config();
  const st = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try { sessionStorage.setItem(SS_STATE, st); } catch (e) { /* без хранилища state проверить не выйдет */ }
  const q = new URLSearchParams({ client_id: c.appId, redirect_uri: c.redirectUri, response_type: 'code', scope: c.scope, state: st });
  return `${c.authBase}/oauth/authorize?${q}`;
}
async function postJSON(url, body) {
  const r = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error((j.error && (j.error.message || j.error)) || j.error_message || 'HTTP ' + r.status);
  return j;
}
/* возвращение со страницы входа: ?code=…&state=… (или ?error=…) */
const POPUP = 'pv-ig-login';
/* обмен кода на токен (код приходит из окна входа Instagram) */
async function finishCode(code, st) {
  let want = null; try { want = sessionStorage.getItem(SS_STATE); sessionStorage.removeItem(SS_STATE); } catch (e) { /* нет хранилища */ }
  if (!want || want !== st) return { error: 'Вход не подтверждён. Попробуйте ещё раз.' };
  const c = config();
  const tok = await postJSON(`${c.proxy}/token`, { code, redirect_uri: c.redirectUri });
  const s = { token: tok.access_token, userId: tok.user_id, exp: tok.expires_in ? Date.now() + tok.expires_in * 1000 : 0, at: Date.now() };
  ls.set(LS_TOKEN, s);
  try { const me = await graph('/me', { fields: 'user_id,username,account_type' }); s.username = me.username; s.accountType = me.account_type; ls.set(LS_TOKEN, s); } catch (e) { console.warn(e); }
  return { ok: true, session: s };
}
const errText = (q) => (q.get('error_reason') === 'user_denied' ? 'Вход отменён.' : (q.get('error_description') || 'Instagram не пустил — попробуйте ещё раз.'));
/* возвращение со страницы входа: ?code=…&state=… (или ?error=…).
   Если это всплывающее окно — передаём код в дневник и закрываемся; иначе (окно заблокировали) — меняем код здесь же. */
async function handleRedirect() {
  if (typeof location === 'undefined') return null;
  const q = new URLSearchParams(location.search);
  if (!q.has('code') && !q.has('error')) return null;
  const code = (q.get('code') || '').replace(/#_$/, ''), st = q.get('state');
  history.replaceState(null, '', location.pathname + location.hash.replace(/^#_$/, ''));
  if (window.name === POPUP && window.opener && !window.opener.closed) {
    try { window.opener.postMessage({ pvIg: q.has('error') ? { error: errText(q) } : { code, state: st } }, location.origin); } catch (e) { /* дневник закрыт */ }
    window.close();
    return { popup: true };
  }
  if (q.has('error')) return { error: errText(q) };
  return finishCode(code, st);
}
/* открыть окно входа Instagram: ник и пароль вводятся на странице Instagram */
function loginPopup() {
  const url = authorizeUrl();
  const w = Math.min(480, screen.availWidth), h = Math.min(760, screen.availHeight);
  const win = window.open(url, POPUP, `width=${w},height=${h},left=${Math.round((screen.availWidth - w) / 2)},top=${Math.round((screen.availHeight - h) / 3)}`);
  if (!win) { location.href = url; return null; } /* окно заблокировали — обычный переход */
  return new Promise((resolve) => {
    const onMsg = (e) => {
      if (e.origin !== location.origin || !e.data || !e.data.pvIg) return;
      window.removeEventListener('message', onMsg); clearInterval(timer);
      const m = e.data.pvIg;
      resolve(m.error ? { error: m.error } : finishCode(m.code, m.state).catch((err) => ({ error: err.message })));
    };
    window.addEventListener('message', onMsg);
    const timer = setInterval(() => { if (win.closed) { clearInterval(timer); setTimeout(() => { window.removeEventListener('message', onMsg); resolve(null); }, 600); } }, 500);
  });
}
function logout() { ls.set(LS_TOKEN, null); }
async function graph(path, params = {}) {
  const c = config(), s = session();
  if (!s) throw new Error('Instagram не привязан');
  const url = path.startsWith('http') ? path : `${c.graphBase}/${c.apiVersion}${path}?${new URLSearchParams({ ...params, access_token: s.token })}`;
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) {
    if (r.status === 401 || (j.error && j.error.code === 190)) { logout(); throw new Error('Доступ к Instagram истёк — привяжите аккаунт заново.'); }
    throw new Error((j.error && j.error.message) || 'HTTP ' + r.status);
  }
  return j;
}
/* долгоживущий токен живёт 60 дней; продлеваем, если ему больше суток */
async function refreshIfOld() {
  const s = session(), c = config();
  if (!s || !c.proxy || Date.now() - (s.at || 0) < 864e5) return;
  try { const t = await postJSON(`${c.proxy}/refresh`, { access_token: s.token }); ls.set(LS_TOKEN, { ...s, token: t.access_token, exp: t.expires_in ? Date.now() + t.expires_in * 1000 : s.exp, at: Date.now() }); } catch (e) { console.warn('токен не продлён', e); }
}
/* снимки через прокси: CDN Instagram не отдаёт картинки чужим сайтам для анализа на canvas */
async function mediaBlob(url) {
  const c = config();
  const via = c.proxy ? `${c.proxy}/media?url=${encodeURIComponent(url)}` : url;
  const r = await fetch(via);
  if (!r.ok) throw new Error('снимок не загрузился: HTTP ' + r.status);
  return r.blob();
}
const FIELDS = 'id,caption,media_type,media_url,thumbnail_url,timestamp,permalink,children{id,media_type,media_url,thumbnail_url}';
async function fetchMedia({ sinceDays = 90, maxPages = 10 } = {}) {
  await refreshIfOld();
  const since = Date.now() - sinceDays * 864e5;
  const out = [];
  let page = await graph('/me/media', { fields: FIELDS, limit: 50 }), n = 0;
  for (;;) {
    let older = false;
    for (const m of page.data || []) {
      const ts = Date.parse(m.timestamp);
      if (ts < since) { older = true; continue; }
      const parts = m.media_type === 'CAROUSEL_ALBUM' && m.children && m.children.data ? m.children.data : [m];
      parts.forEach((p, i) => {
        const url = p.media_type === 'VIDEO' ? p.thumbnail_url : p.media_url;
        if (!url) return;
        out.push({ id: 'api:' + (p.id || m.id) + ':' + i, name: m.permalink || m.id, ts, exact: true, caption: i === 0 ? (m.caption || '') : '', source: 'api', kind: 'image', permalink: m.permalink, getBlob: () => mediaBlob(url) });
      });
    }
    n++;
    if (older || n >= maxPages || !page.paging || !page.paging.next) break;
    page = await graph(page.paging.next);
  }
  return out;
}

PV.Insta = {
  openZip, folderEntries, parseExport, galleryItems, exifDate, exifDateFromBytes, fixText, cleanCaption, videoFrame,
  groupDays, pickForDay, draftText, songFromPhotos, dateKey, hhmm, todOf, SOURCE_RU,
  api: { config, configured, saveConfig, session, authorizeUrl, handleRedirect, loginPopup, finishCode, logout, fetchMedia, graph },
};
})();
