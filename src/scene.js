/* Послевкусие — сцены из текста: каждая фраза записи становится нарисованной сценой.
   Фото пользователя — только референс палитры и света: в сцены они не вставляются. */
(function () {
'use strict';
const PV = (globalThis.PV = globalThis.PV || {});
const U = PV.U;

const SW = 900, SH = 1200;

/* ---------- словарь сцен ---------- */
const K = {
  place: {
    office: ['офис', 'код', 'ноут', 'компьют', 'монитор', 'дедлайн', 'хакатон', 'программ', 'созвон', 'работ'],
    party: ['день рождения', 'праздн', 'вечерин', 'торт', 'шарик', 'концерт', 'клуб', 'танц', 'сюрприз', 'гост'],
    cafe: ['кафе', 'кофейн', 'ресторан', '=бар', 'пиццер'],
    home: ['=дома', 'квартир', 'комнат', 'кухн', '=окно', '=окна', '=окном', 'окне', 'кроват', 'диван', 'балкон', 'проснул', 'плед'],
    dacha: ['дач', 'деревн', 'бабушк', 'огород', 'домик', 'яблон', 'забор'],
    water: ['=река', '=реки', '=реке', '=рекой', '=реку', 'речк', '=море', '=моря', '=морем', 'озер', 'пляж', 'берег', 'набережн', 'пруд', 'купал', 'волн'],
    mountain: ['=горы', '=горах', '=гор', 'поход', 'вершин', 'ущель'],
    forest: ['=лес', 'лесу', 'леса', 'роща', '=бор', 'тайг'],
    park: ['парк', 'сквер', '=сад', 'саду', 'алле', 'скамей', 'скамейк', 'клён', 'клен'],
    road: ['дорог', 'поезд', 'трасс', 'машин', 'автобус', 'такси', '=домой', 'шла домой', 'шёл домой', 'шли домой', 'улиц', 'тротуар'],
    city: ['город', 'проспект', '=мост', 'центр', 'площад', 'метро', 'небоскр', 'огни города'],
  },
  weather: {
    rain: ['дожд', 'ливн', 'ливен', 'лужи', 'лужах', 'мокр', 'зонт', 'капл'],
    snow: ['снег', 'снеж', 'метел', 'сугроб', 'вьюг'],
    fog: ['туман', 'дымк', 'мгла'],
    sun: ['солнц', 'солнеч', 'ясно', 'жар', 'зной', 'лучи'],
    wind: ['ветер', 'ветр', 'ветрен'],
  },
  obj: {
    cup: ['какао', 'кофе', '=чай', 'чаю', 'чая', 'термос', 'кружк', 'чашк', 'глинтвейн'],
    laptop: ['ноут', '=код', 'кода', 'компьют', 'монитор', 'экран', 'программ'],
    cake: ['торт', 'свеч'],
    balloons: ['шарик', '=шары', 'шаров'],
    fire: ['костёр', 'костер', 'костр', 'огонь', 'камин'],
    guitar: ['гитар'],
    lamps: ['фонар', '=огни', 'огоньк', 'гирлянд', 'неон'],
    leaves: ['лист', 'листв', 'листопад'],
    stars: ['звезд', 'звёзд'],
    moon: ['=луна', '=луны', '=луной', 'лунн'],
    flowers: ['цвет', 'букет', '=роз', 'тюльпан', 'сирен'],
    books: ['книг', 'читал', 'библиот', 'учил', 'конспект'],
    music: ['музык', 'наушник', 'песн', 'слушал', 'пел'],
    confetti: ['конфетти', 'салют', 'фейерверк', 'хлопушк'],
    boat: ['лодк', 'катер', 'парус'],
    snowman: ['снегович'],
  },
  people: {
    alone: ['=одна', '=один', '=одной', 'одиноч', '=сам', '=сама', 'никого', 'наедине'],
    many: ['друз', 'команд', 'гост', 'компани', 'семь', '=всей', 'ребят', 'толп', 'родител'],
    two: ['вдвоём', 'вдвоем', '=мы', '=нас', 'девушк', '=парнем', '=парень', '=с ним', '=с ней', 'подруг', '=друг', '=другом', '=мама', '=мамой', '=папой', 'обнял', 'поцел'],
  },
  tod: {
    morning: ['утр', 'рассвет', 'проснул', 'завтрак'],
    day: ['=днём', '=днем', 'полдень', 'обед'],
    evening: ['вечер', 'закат', 'сумерк', 'ужин'],
    night: ['ноч', 'полноч', 'темнот', 'звёзд', 'звезд', 'бессон'],
  },
};
const INDOOR = new Set(['office', 'party', 'cafe', 'home']);
const PLACE_RU = { office: 'офис', party: 'праздник', cafe: 'кафе', home: 'дом', dacha: 'дача', water: 'вода', mountain: 'горы', forest: 'лес', park: 'парк', road: 'дорога', city: 'город' };
const OBJ_RU = { cup: 'кружка', laptop: 'ноутбук', cake: 'торт', balloons: 'шарики', fire: 'костёр', guitar: 'гитара', lamps: 'огни', leaves: 'листья', stars: 'звёзды', moon: 'луна', flowers: 'цветы', books: 'книги', music: 'музыка', confetti: 'конфетти', boat: 'лодка', snowman: 'снеговик' };
const WEATHER_RU = { rain: 'дождь', snow: 'снег', fog: 'туман', sun: 'солнце', wind: 'ветер' };
const PEOPLE_RU = { alone: 'одна фигура', two: 'двое', many: 'компания' };

function best(doc, group) {
  let bk = null, bv = 0;
  for (const k of Object.keys(group)) { const v = PV.Text.scan(doc, group[k]).score; if (v > bv) { bv = v; bk = k; } }
  return bk;
}
function all(doc, group) { return Object.keys(group).filter((k) => PV.Text.scan(doc, group[k]).score > 0); }

/* короткая подпись сцены: 2–7 слов из самой фразы */
function shortCap(s) {
  const words = String(s).replace(/[«»"]/g, '').split(/\s+/).filter(Boolean);
  let out = words.slice(0, 7).join(' ');
  if (words.length > 7) out = out.replace(/[,;:—-]+$/, '') + '…';
  return U.cap(out.replace(/[.!?]+$/, ''));
}

/* ---------- план сцен по записи ---------- */
function plan(T, S, seed) {
  const clauses = (T.clauses || []).map((c) => c.text).filter((c) => c && c.length > 2);
  const gdoc = PV.Text.prepare(clauses.join('. '));
  const gWeather = all(gdoc, K.weather);
  const gPeople = best(gdoc, { alone: K.people.alone, many: K.people.many, two: K.people.two });
  const fallbackPlace = best(gdoc, K.place) || (T.nature > T.urban ? 'park' : T.urban > 0 ? 'city' : 'home');
  /* соседние короткие фразы склеиваем, длинный текст ужимаем до 7 сцен */
  let parts = [];
  for (const c of clauses) {
    const last = parts[parts.length - 1];
    if (last && (c.split(/\s+/).length < 3 || last.split(/\s+/).length < 3)) parts[parts.length - 1] = last + ', ' + c.charAt(0).toLowerCase() + c.slice(1);
    else parts.push(c);
  }
  if (!parts.length) parts = [T.keyLine || 'День'];
  while (parts.length > 7) {
    let bi = 0, bl = Infinity;
    for (let i = 0; i < parts.length - 1; i++) { const l = parts[i].length + parts[i + 1].length; if (l < bl) { bl = l; bi = i; } }
    parts.splice(bi, 2, parts[bi] + ', ' + parts[bi + 1].charAt(0).toLowerCase() + parts[bi + 1].slice(1));
  }
  const scenes = [];
  let place = null, tod = S.tod || 'day', wState = gWeather.filter((w) => w === 'snow' || w === 'fog'), who = null;
  parts.forEach((text, i) => {
    const doc = PV.Text.prepare(text);
    /* «в шесть утра», «к десяти вечера» — это время, а не смена времени суток */
    const todDoc = PV.Text.prepare(text.replace(/(\d+|один|два|три|четыре|пять|шесть|семь|восемь|девять|десять|одиннадцать|двенадцать)\s+(утра|вечера|ночи|дня)/gi, ''));
    const p = best(doc, K.place);
    place = p || place || fallbackPlace;
    const t = best(todDoc, K.tod); if (t) tod = t;
    const objs = all(doc, K.obj);
    /* погода начинается с момента, когда о ней сказано, и держится дальше; снег и туман — на весь день */
    const wNow = all(doc, K.weather);
    if (wNow.length) wState = [...new Set([...wState.filter((w) => w === 'snow' || w === 'fog'), ...wNow])];
    const weather = wState.filter((w) => w !== 'sun' || !['evening', 'night'].includes(tod));
    /* люди держатся, пока текст их не сменит */
    const pNow = best(doc, { alone: K.people.alone, many: K.people.many, two: K.people.two });
    if (pNow) who = pNow; else if (!who && i === 0) who = gPeople === 'alone' ? null : gPeople;
    const people = who;
    /* фраза только о предмете — крупный план; иначе общий план места */
    const shot = !p && objs.some((o) => ['cup', 'cake', 'laptop', 'books', 'flowers', 'guitar'].includes(o)) ? 'close' : 'wide';
    scenes.push({ i, text, caption: shortCap(text), place, tod, weather, objs, people, shot, season: S.season, seed: (seed + i * 977) >>> 0 });
  });
  /* меньше трёх сцен — добавляем крупный план детали и общий план */
  if (scenes.length < 3) {
    const b = scenes[scenes.length - 1];
    const det = T.detail && T.detail.nom ? T.detail.nom : null;
    scenes.push({ ...b, i: scenes.length, text: '', caption: det ? U.cap(det) : null, shot: b.shot === 'close' ? 'wide' : 'close', seed: (b.seed + 31) >>> 0 });
    if (scenes.length < 3) scenes.push({ ...b, i: scenes.length, text: '', caption: null, shot: 'wide', people: null, seed: (b.seed + 77) >>> 0 });
  }
  return scenes;
}
function describe(sc) {
  const bits = [PLACE_RU[sc.place] || sc.place];
  sc.weather.forEach((w) => bits.push(WEATHER_RU[w]));
  sc.objs.forEach((o) => bits.push(OBJ_RU[o]));
  if (sc.people) bits.push(PEOPLE_RU[sc.people]);
  if (sc.shot === 'close') bits.push('крупный план');
  return [...new Set(bits)].filter(Boolean).join(', ');
}

/* ---------- палитра сцены: время суток + сезон + цвета фото как референс ---------- */
const mix = (a, b, t) => U.mix(a, b, t);
const css = (c, a = 1) => U.css(c, a);
function palette(sc, S) {
  const ref = (S.palette && S.palette.length ? S.palette : [[190, 160, 120], [90, 80, 70], [220, 210, 190]]);
  const byL = [...ref].sort((a, b) => U.luma(a) - U.luma(b));
  const dark = byL[0], light = byL[byL.length - 1];
  const sat = [...ref].sort((a, b) => U.rgb2lch(b)[1] - U.rgb2lch(a)[1])[0];
  const SKY = {
    morning: [[250, 214, 178], [168, 200, 226]],
    day: [[150, 196, 232], [232, 242, 248]],
    evening: [[86, 72, 140], [244, 160, 96]],
    night: [[10, 18, 44], [42, 52, 92]],
  }[sc.tod] || [[150, 196, 232], [232, 242, 248]];
  let skyTop = mix(SKY[0], sat, 0.12), skyBot = mix(SKY[1], light, 0.15);
  if (sc.weather.includes('rain') || sc.weather.includes('fog')) { skyTop = mix(skyTop, [120, 126, 136], 0.55); skyBot = mix(skyBot, [170, 174, 180], 0.55); }
  if (sc.weather.includes('snow')) { skyTop = mix(skyTop, [200, 208, 220], 0.45); skyBot = mix(skyBot, [236, 238, 242], 0.5); }
  const FOL = { autumn: [[214, 120, 40], [232, 176, 52], [180, 66, 40], [150, 110, 40]], winter: [[90, 98, 92], [120, 126, 120]], spring: [[150, 196, 110], [238, 176, 196], [120, 170, 90]], summer: [[70, 130, 60], [100, 160, 70], [50, 100, 50]] }[sc.season] || [[90, 140, 70]];
  const foliage = FOL.map((c) => mix(c, sat, 0.18));
  const ground = { autumn: [150, 110, 70], winter: [232, 236, 240], spring: [120, 160, 90], summer: [96, 140, 70] }[sc.season] || [120, 130, 90];
  const night = sc.tod === 'night', eve = sc.tod === 'evening';
  const shade = night ? 0.62 : eve ? 0.28 : sc.weather.includes('rain') ? 0.22 : 0;
  const dim = (c) => mix(c, night ? [12, 18, 40] : [60, 50, 70], shade);
  return { skyTop, skyBot, foliage: foliage.map(dim), ground: dim(mix(ground, dark, 0.15)), far: dim(mix(skyBot, [90, 100, 120], 0.45)), mid: dim(mix(ground, [60, 80, 60], 0.35)), ink: dim([46, 38, 34]), warm: [255, 196, 110], light: dim(light), sat, dark, night, eve };
}

/* ---------- примитивы ---------- */
function grad(ctx, x0, y0, x1, y1, stops) { const g = ctx.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, c, a]) => g.addColorStop(o, css(c, a == null ? 1 : a))); return g; }
function glow(ctx, x, y, r, c, a) { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, css(c, a)); g.addColorStop(1, css(c, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); }
function blob(ctx, x, y, r, rnd, n = 9) {
  ctx.beginPath();
  for (let i = 0; i <= n; i++) { const a = (i / n) * Math.PI * 2, rr = r * (0.8 + rnd() * 0.35); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.9; if (i) ctx.lineTo(px, py); else ctx.moveTo(px, py); }
  ctx.closePath(); ctx.fill();
}
function hills(ctx, y, amp, color, rnd, w = SW) {
  ctx.fillStyle = css(color); ctx.beginPath(); ctx.moveTo(0, SH);
  const ph = rnd() * 6, f = 1.5 + rnd() * 2;
  for (let x = 0; x <= w; x += 12) ctx.lineTo(x, y - Math.sin(x / w * Math.PI * f + ph) * amp - Math.sin(x / w * 11 + ph * 2) * amp * 0.25);
  ctx.lineTo(w, SH); ctx.closePath(); ctx.fill();
}
function tree(ctx, x, y, h, P, sc, rnd) {
  ctx.fillStyle = css(mix(P.ink, [90, 60, 40], 0.4)); ctx.fillRect(x - h * 0.03, y - h * 0.55, h * 0.06, h * 0.55);
  if (sc.season === 'winter') {
    ctx.strokeStyle = css(P.ink); ctx.lineCap = 'round';
    const br = (bx, by, a, l, d) => { if (d > 4 || l < 4) return; const ex = bx + Math.cos(a) * l, ey = by + Math.sin(a) * l; ctx.lineWidth = Math.max(1, 5 - d); ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(ex, ey); ctx.stroke(); br(ex, ey, a - 0.45 - rnd() * 0.2, l * 0.7, d + 1); br(ex, ey, a + 0.45 + rnd() * 0.2, l * 0.7, d + 1); };
    br(x, y - h * 0.5, -Math.PI / 2, h * 0.25, 0);
    ctx.fillStyle = css([245, 248, 252], 0.85); blob(ctx, x, y - h * 0.62, h * 0.12, rnd, 7);
    return;
  }
  for (let i = 0; i < 9; i++) { ctx.fillStyle = css(P.foliage[i % P.foliage.length], 0.92); blob(ctx, x + (rnd() - 0.5) * h * 0.45, y - h * (0.62 + rnd() * 0.3), h * (0.14 + rnd() * 0.1), rnd); }
}
function pine(ctx, x, y, h, P, sc) {
  const c = sc.season === 'winter' ? mix(P.foliage[0], [40, 70, 60], 0.6) : mix(P.foliage[0], [40, 80, 50], 0.6);
  ctx.fillStyle = css(c);
  for (let i = 0; i < 4; i++) { const w = h * (0.42 - i * 0.08), yy = y - h * (0.25 + i * 0.2); ctx.beginPath(); ctx.moveTo(x, yy - h * 0.28); ctx.lineTo(x + w / 2, yy); ctx.lineTo(x - w / 2, yy); ctx.closePath(); ctx.fill(); }
  if (sc.season === 'winter') { ctx.fillStyle = css([245, 248, 252], 0.8); ctx.beginPath(); ctx.moveTo(x, y - h * 1.03); ctx.lineTo(x + h * 0.06, y - h * 0.9); ctx.lineTo(x - h * 0.06, y - h * 0.9); ctx.fill(); }
}
function person(ctx, x, y, h, color, rnd, lean = 0) {
  ctx.save(); ctx.translate(x, y); ctx.rotate(lean); ctx.fillStyle = css(color);
  ctx.beginPath(); ctx.arc(0, -h * 0.86, h * 0.1, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(-h * 0.13, -h * 0.72); ctx.quadraticCurveTo(0, -h * 0.8, h * 0.13, -h * 0.72); ctx.lineTo(h * 0.16, -h * 0.3); ctx.lineTo(h * 0.07, 0); ctx.lineTo(-h * 0.07, 0); ctx.lineTo(-h * 0.16, -h * 0.3); ctx.closePath(); ctx.fill();
  ctx.restore();
}
function people(ctx, kind, x, y, h, P, rnd, warmLight) {
  const col = mix(P.ink, P.dark, 0.3);
  if (!kind) return;
  if (kind === 'alone') { person(ctx, x, y, h, col, rnd); return; }
  if (kind === 'two') { person(ctx, x - h * 0.13, y, h, col, rnd, 0.04); person(ctx, x + h * 0.13, y, h * 0.93, col, rnd, -0.04); return; }
  const n = 4 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) person(ctx, x + (i - (n - 1) / 2) * h * 0.34 + (rnd() - 0.5) * 10, y + (rnd() - 0.5) * 8, h * (0.85 + rnd() * 0.25), col, rnd, (rnd() - 0.5) * 0.12);
  if (warmLight) glow(ctx, x, y - h * 0.6, h * 1.6, P.warm, 0.18);
}
function lamp(ctx, x, y, h, P, lit) {
  ctx.fillStyle = css(P.ink); ctx.fillRect(x - 3, y - h, 6, h); ctx.fillRect(x - 16, y - h, 32, 6);
  if (lit) { glow(ctx, x, y - h + 14, h * 0.55, P.warm, 0.55); ctx.fillStyle = css([255, 236, 190]); ctx.beginPath(); ctx.arc(x, y - h + 12, 9, 0, Math.PI * 2); ctx.fill(); }
}
function skyline(ctx, base, P, rnd, lit) {
  let x = -10;
  while (x < SW) {
    const w = 50 + rnd() * 90, h = 120 + rnd() * 360;
    ctx.fillStyle = css(mix(P.far, P.ink, 0.35 + rnd() * 0.25)); ctx.fillRect(x, base - h, w, h);
    if (lit) for (let yy = base - h + 14; yy < base - 10; yy += 22) for (let xx = x + 8; xx < x + w - 10; xx += 16) if (rnd() < 0.42) { ctx.fillStyle = css(rnd() < 0.8 ? P.warm : [190, 220, 255], 0.55 + rnd() * 0.4); ctx.fillRect(xx, yy, 7, 10); }
    x += w + 4;
  }
}

/* ---------- предметы крупно ---------- */
function cup(ctx, x, y, s, P, rnd) {
  ctx.fillStyle = css(mix(P.sat, [240, 230, 220], 0.45));
  ctx.beginPath(); ctx.moveTo(x - s * 0.45, y - s); ctx.lineTo(x + s * 0.45, y - s); ctx.lineTo(x + s * 0.38, y); ctx.lineTo(x - s * 0.38, y); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = css(mix(P.sat, [240, 230, 220], 0.45)); ctx.lineWidth = s * 0.09; ctx.beginPath(); ctx.arc(x + s * 0.5, y - s * 0.55, s * 0.2, -1.3, 1.3); ctx.stroke();
  ctx.fillStyle = css([92, 56, 36]); ctx.beginPath(); ctx.ellipse(x, y - s, s * 0.45, s * 0.08, 0, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = css([255, 255, 255], 0.45); ctx.lineWidth = s * 0.05; ctx.lineCap = 'round';
  for (let i = 0; i < 3; i++) { const sx = x - s * 0.2 + i * s * 0.2; ctx.beginPath(); ctx.moveTo(sx, y - s * 1.1); ctx.bezierCurveTo(sx - s * 0.15, y - s * 1.35, sx + s * 0.15, y - s * 1.5, sx, y - s * 1.8 - rnd() * s * 0.2); ctx.stroke(); }
}
function laptop(ctx, x, y, s, P, rnd) {
  ctx.fillStyle = css([40, 42, 50]); ctx.fillRect(x - s, y - s * 1.2, s * 2, s * 1.2);
  ctx.fillStyle = css([16, 22, 36]); ctx.fillRect(x - s * 0.92, y - s * 1.12, s * 1.84, s * 1.04);
  const cols = [[120, 200, 255], [255, 190, 120], [180, 240, 160], [230, 150, 220]];
  for (let i = 0; i < 11; i++) { ctx.fillStyle = css(cols[Math.floor(rnd() * cols.length)], 0.85); ctx.fillRect(x - s * 0.84 + (i % 3) * 14, y - s * 1.04 + i * s * 0.088, s * (0.3 + rnd() * 0.9), s * 0.04); }
  ctx.fillStyle = css([70, 72, 80]); ctx.beginPath(); ctx.moveTo(x - s * 1.15, y); ctx.lineTo(x + s * 1.15, y); ctx.lineTo(x + s * 1.3, y + s * 0.12); ctx.lineTo(x - s * 1.3, y + s * 0.12); ctx.closePath(); ctx.fill();
  glow(ctx, x, y - s * 0.6, s * 1.9, [120, 170, 255], 0.22);
}
function cake(ctx, x, y, s, P, rnd) {
  ctx.fillStyle = css([248, 236, 224]); ctx.fillRect(x - s, y - s * 0.7, s * 2, s * 0.7);
  ctx.fillStyle = css(mix(P.sat, [240, 120, 160], 0.5)); ctx.fillRect(x - s, y - s * 0.7, s * 2, s * 0.14);
  for (let i = 0; i < 5; i++) { const cx = x - s * 0.7 + i * s * 0.35; ctx.fillStyle = css([250, 250, 255]); ctx.fillRect(cx - 4, y - s * 1.05, 8, s * 0.35); glow(ctx, cx, y - s * 1.12, 30, P.warm, 0.6); ctx.fillStyle = css([255, 210, 120]); ctx.beginPath(); ctx.ellipse(cx, y - s * 1.12, 5, 11, 0, 0, Math.PI * 2); ctx.fill(); }
}
function balloons(ctx, x, y, s, P, rnd) {
  const cols = [[232, 72, 80], [250, 196, 60], [80, 150, 230], [120, 200, 140], [230, 120, 200]];
  for (let i = 0; i < 6; i++) {
    const bx = x + (rnd() - 0.5) * s * 2.4, by = y - s * (1 + rnd() * 1.2);
    ctx.strokeStyle = css(P.ink, 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(bx, by + s * 0.3); ctx.quadraticCurveTo(bx + 10, by + s, x, y); ctx.stroke();
    ctx.fillStyle = css(cols[i % cols.length]); ctx.beginPath(); ctx.ellipse(bx, by, s * 0.24, s * 0.3, 0, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = css([255, 255, 255], 0.35); ctx.beginPath(); ctx.ellipse(bx - s * 0.08, by - s * 0.1, s * 0.05, s * 0.09, -0.4, 0, Math.PI * 2); ctx.fill();
  }
}
function fire(ctx, x, y, s, P, rnd) {
  glow(ctx, x, y - s * 0.4, s * 3, P.warm, 0.5);
  ctx.fillStyle = css([90, 56, 36]); ctx.save(); ctx.translate(x, y); ctx.rotate(0.3); ctx.fillRect(-s * 0.7, -8, s * 1.4, 16); ctx.rotate(-0.6); ctx.fillRect(-s * 0.7, -8, s * 1.4, 16); ctx.restore();
  [[255, 120, 40], [255, 180, 60], [255, 236, 150]].forEach((c, i) => { const k = 1 - i * 0.3; ctx.fillStyle = css(c); ctx.beginPath(); ctx.moveTo(x - s * 0.5 * k, y); ctx.quadraticCurveTo(x - s * 0.5 * k, y - s * 0.9 * k, x, y - s * 1.5 * k); ctx.quadraticCurveTo(x + s * 0.5 * k, y - s * 0.9 * k, x + s * 0.5 * k, y); ctx.closePath(); ctx.fill(); });
  for (let i = 0; i < 14; i++) { ctx.fillStyle = css([255, 200, 120], 0.8); ctx.fillRect(x + (rnd() - 0.5) * s * 1.6, y - s * (1.2 + rnd() * 2), 3, 3); }
}
function books(ctx, x, y, s, P, rnd) {
  const cols = [P.sat, [120, 90, 70], [80, 110, 140], [190, 160, 110]];
  for (let i = 0; i < 4; i++) { ctx.fillStyle = css(cols[i]); ctx.fillRect(x - s + rnd() * 16, y - (i + 1) * s * 0.26, s * 1.9, s * 0.22); }
}
function flowers(ctx, x, y, s, P, rnd) {
  ctx.fillStyle = css([200, 220, 230], 0.6); ctx.fillRect(x - s * 0.25, y - s * 0.7, s * 0.5, s * 0.7);
  ctx.strokeStyle = css([80, 130, 70]); ctx.lineWidth = 3;
  for (let i = 0; i < 7; i++) { const fx = x + (rnd() - 0.5) * s * 1.2, fy = y - s * (1.1 + rnd() * 0.6); ctx.beginPath(); ctx.moveTo(x, y - s * 0.6); ctx.lineTo(fx, fy); ctx.stroke(); ctx.fillStyle = css(i % 2 ? mix(P.sat, [240, 120, 150], 0.5) : [250, 220, 120]); blob(ctx, fx, fy, s * 0.13, rnd, 7); }
}
function guitar(ctx, x, y, s, P) {
  ctx.fillStyle = css([170, 110, 60]); ctx.beginPath(); ctx.ellipse(x, y - s * 0.35, s * 0.42, s * 0.35, 0, 0, Math.PI * 2); ctx.fill(); ctx.beginPath(); ctx.ellipse(x, y - s * 0.85, s * 0.32, s * 0.27, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = css([40, 30, 26]); ctx.beginPath(); ctx.arc(x, y - s * 0.6, s * 0.1, 0, Math.PI * 2); ctx.fill(); ctx.fillRect(x - s * 0.05, y - s * 1.9, s * 0.1, s * 1.1);
}
function headphones(ctx, x, y, s, P) {
  ctx.strokeStyle = css(P.ink); ctx.lineWidth = s * 0.1; ctx.beginPath(); ctx.arc(x, y, s * 0.5, Math.PI, 0); ctx.stroke();
  ctx.fillStyle = css(P.sat); ctx.fillRect(x - s * 0.62, y - s * 0.05, s * 0.24, s * 0.4); ctx.fillRect(x + s * 0.38, y - s * 0.05, s * 0.24, s * 0.4);
}
const OBJ_DRAW = { cup, laptop, cake, balloons, fire, books, flowers, guitar, music: headphones };

/* ---------- погода поверх ---------- */
function weather(ctx, sc, P, rnd, indoor) {
  if (indoor) return;
  if (sc.weather.includes('fog')) for (let i = 0; i < 5; i++) { ctx.fillStyle = grad(ctx, 0, 0, 0, SH, [[0, [230, 232, 236], 0], [0.35 + i * 0.1, [230, 232, 236], 0.28], [1, [230, 232, 236], 0]]); ctx.fillRect(0, 0, SW, SH); }
  if (sc.weather.includes('rain')) { ctx.strokeStyle = css([210, 220, 235], 0.45); ctx.lineWidth = 2; for (let i = 0; i < 260; i++) { const x = rnd() * SW, y = rnd() * SH; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 8, y + 34); ctx.stroke(); } }
  if (sc.weather.includes('snow')) { ctx.fillStyle = css([255, 255, 255], 0.9); for (let i = 0; i < 220; i++) { ctx.beginPath(); ctx.arc(rnd() * SW, rnd() * SH, 1.5 + rnd() * 3.5, 0, Math.PI * 2); ctx.fill(); } }
  if (sc.objs.includes('leaves') || (sc.season === 'autumn' && ['park', 'forest', 'road'].includes(sc.place))) for (let i = 0; i < 40; i++) { ctx.fillStyle = css(P.foliage[i % P.foliage.length], 0.9); ctx.save(); ctx.translate(rnd() * SW, rnd() * SH * 0.85); ctx.rotate(rnd() * 6); ctx.beginPath(); ctx.ellipse(0, 0, 9, 4.5, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore(); }
  if (sc.objs.includes('confetti')) for (let i = 0; i < 120; i++) { ctx.fillStyle = css([[232, 72, 80], [250, 196, 60], [80, 150, 230], [120, 200, 140]][i % 4]); ctx.fillRect(rnd() * SW, rnd() * SH, 6, 10); }
}

/* ---------- сцена под открытым небом ---------- */
function outdoor(ctx, sc, P, rnd) {
  ctx.fillStyle = grad(ctx, 0, 0, 0, SH * 0.7, [[0, P.skyTop], [1, P.skyBot]]); ctx.fillRect(0, 0, SW, SH);
  const clear = !sc.weather.some((w) => w === 'rain' || w === 'fog');
  if (P.night) {
    if (clear || sc.objs.includes('stars')) { ctx.fillStyle = css([255, 255, 240], 0.85); for (let i = 0; i < 140; i++) { ctx.globalAlpha = 0.3 + rnd() * 0.7; ctx.fillRect(rnd() * SW, rnd() * SH * 0.5, 2, 2); } ctx.globalAlpha = 1; }
    if (clear || sc.objs.includes('moon')) { glow(ctx, SW * 0.74, SH * 0.16, 160, [240, 240, 220], 0.35); ctx.fillStyle = css([246, 242, 222]); ctx.beginPath(); ctx.arc(SW * 0.74, SH * 0.16, 46, 0, Math.PI * 2); ctx.fill(); }
  } else if (clear) {
    const sy = sc.tod === 'evening' ? SH * 0.5 : sc.tod === 'morning' ? SH * 0.4 : SH * 0.14;
    glow(ctx, SW * 0.3, sy, 300, [255, 230, 170], sc.tod === 'day' ? 0.5 : 0.7);
    ctx.fillStyle = css(sc.tod === 'evening' ? [255, 170, 100] : [255, 240, 200]); ctx.beginPath(); ctx.arc(SW * 0.3, sy, sc.tod === 'day' ? 50 : 66, 0, Math.PI * 2); ctx.fill();
  }
  const hz = SH * (0.5 + rnd() * 0.06);
  const lit = P.night || P.eve || sc.objs.includes('lamps');
  const pl = sc.place;
  if (pl === 'mountain') { ctx.fillStyle = css(P.far); for (let i = 0; i < 4; i++) { const mx = rnd() * SW, mw = 260 + rnd() * 260, mh = 220 + rnd() * 200; ctx.beginPath(); ctx.moveTo(mx - mw, hz); ctx.lineTo(mx, hz - mh); ctx.lineTo(mx + mw, hz); ctx.fill(); ctx.fillStyle = css([245, 248, 252], 0.9); ctx.beginPath(); ctx.moveTo(mx - mw * 0.18, hz - mh * 0.82); ctx.lineTo(mx, hz - mh); ctx.lineTo(mx + mw * 0.18, hz - mh * 0.82); ctx.fill(); ctx.fillStyle = css(P.far); } }
  if (pl === 'city' || pl === 'road') skyline(ctx, hz + 20, P, rnd, lit);
  else hills(ctx, hz, 26, P.far, rnd);
  if (pl === 'water') {
    ctx.fillStyle = grad(ctx, 0, hz, 0, SH, [[0, mix(P.skyBot, [60, 100, 140], 0.4)], [1, mix(P.skyTop, [20, 40, 70], 0.5)]]); ctx.fillRect(0, hz, SW, SH - hz);
    ctx.strokeStyle = css([255, 255, 255], 0.25); ctx.lineWidth = 2; for (let i = 0; i < 40; i++) { const y = hz + 10 + rnd() * (SH - hz); ctx.beginPath(); ctx.moveTo(rnd() * SW, y); ctx.lineTo(rnd() * SW, y); ctx.stroke(); }
    if (!P.night) { ctx.fillStyle = css([255, 230, 170], 0.35); ctx.fillRect(SW * 0.25, hz, 70, SH - hz); }
    if (sc.objs.includes('boat')) { ctx.fillStyle = css(P.ink); ctx.beginPath(); ctx.moveTo(SW * 0.55, hz + 120); ctx.lineTo(SW * 0.75, hz + 120); ctx.lineTo(SW * 0.71, hz + 145); ctx.lineTo(SW * 0.59, hz + 145); ctx.fill(); }
    ctx.fillStyle = css(P.ground); ctx.beginPath(); ctx.moveTo(0, SH); ctx.lineTo(0, SH * 0.82); ctx.quadraticCurveTo(SW * 0.4, SH * 0.78, SW * 0.6, SH); ctx.fill();
    people(ctx, sc.people, SW * 0.24, SH * 0.88, 170, P, rnd, P.eve);
    if (sc.objs.includes('fire')) fire(ctx, SW * 0.56, SH * 0.94, 80, P, rnd);
    return;
  }
  hills(ctx, hz + 60, 18, P.mid, rnd);
  ctx.fillStyle = grad(ctx, 0, hz + 60, 0, SH, [[0, P.ground], [1, mix(P.ground, P.ink, 0.25)]]); ctx.fillRect(0, hz + 70, SW, SH);
  if (pl === 'park' || pl === 'forest' || pl === 'dacha') {
    const n = pl === 'forest' ? 9 : 5;
    for (let i = 0; i < n; i++) { const x = (i + 0.5) / n * SW + (rnd() - 0.5) * 60, y = hz + 70 + rnd() * 40, h = 200 + rnd() * 120; (pl === 'forest' && i % 2 ? pine : tree)(ctx, x, y, h, P, sc, rnd); }
  }
  if (pl === 'park' || pl === 'road' || pl === 'city') {
    ctx.fillStyle = css(mix(P.ground, sc.weather.includes('rain') ? [70, 80, 100] : [200, 190, 170], 0.45));
    ctx.beginPath(); ctx.moveTo(SW * 0.47, hz + 70); ctx.lineTo(SW * 0.53, hz + 70); ctx.lineTo(SW * 0.85, SH); ctx.lineTo(SW * 0.15, SH); ctx.fill();
    if (sc.weather.includes('rain') && lit) for (let i = 0; i < 6; i++) glow(ctx, SW * (0.3 + rnd() * 0.4), hz + 140 + rnd() * (SH - hz - 160), 60, P.warm, 0.35);
  }
  if (pl === 'park') { ctx.fillStyle = css(P.ink); ctx.fillRect(SW * 0.66, SH * 0.79, 150, 12); ctx.fillRect(SW * 0.66, SH * 0.755, 150, 8); ctx.fillRect(SW * 0.67, SH * 0.79, 8, 40); ctx.fillRect(SW * 0.66 + 136, SH * 0.79, 8, 40); }
  if (pl === 'dacha') {
    const hx = SW * 0.62, hy = hz + 150; ctx.fillStyle = css(mix(P.sat, [180, 130, 90], 0.5)); ctx.fillRect(hx - 120, hy - 150, 240, 150);
    ctx.fillStyle = css(mix(P.ink, [120, 50, 40], 0.5)); ctx.beginPath(); ctx.moveTo(hx - 145, hy - 150); ctx.lineTo(hx, hy - 250); ctx.lineTo(hx + 145, hy - 150); ctx.fill();
    ctx.fillStyle = css(lit ? P.warm : [190, 210, 230]); ctx.fillRect(hx - 40, hy - 110, 80, 60); if (lit) glow(ctx, hx, hy - 80, 140, P.warm, 0.4);
    ctx.fillStyle = css(P.ink, 0.6); for (let x = 0; x < SW; x += 26) ctx.fillRect(x, hy + 10, 8, 50);
  }
  if (lit || pl === 'city' || pl === 'road') for (let i = 0; i < 3; i++) lamp(ctx, SW * (0.12 + i * 0.36), hz + 110 + i * 60, 240 - i * 20, P, lit);
  if (sc.objs.includes('fire')) fire(ctx, SW * 0.56, SH * 0.88, 90, P, rnd);
  people(ctx, sc.people, sc.objs.includes('fire') ? SW * 0.28 : SW * 0.46, SH * 0.86, pl === 'forest' ? 150 : 190, P, rnd, lit);
  if (sc.objs.includes('snowman') || (sc.season === 'winter' && sc.weather.includes('snow') && rnd() < 0.3)) { ctx.fillStyle = css([250, 252, 255]); [[0, 40], [-60, 30], [-105, 20]].forEach(([dy, r]) => { ctx.beginPath(); ctx.arc(SW * 0.8, SH * 0.88 + dy, r, 0, Math.PI * 2); ctx.fill(); }); }
}

/* ---------- сцена в помещении ---------- */
function indoorScene(ctx, sc, P, rnd) {
  const night = P.night || P.eve;
  const wall = sc.place === 'office' ? mix([70, 78, 96], P.dark, 0.2) : sc.place === 'party' ? mix(P.sat, [250, 220, 200], 0.55) : mix([230, 214, 192], P.light, 0.3);
  const wallC = night ? mix(wall, [20, 22, 36], 0.55) : wall;
  ctx.fillStyle = grad(ctx, 0, 0, 0, SH, [[0, wallC], [1, mix(wallC, [0, 0, 0], 0.25)]]); ctx.fillRect(0, 0, SW, SH);
  /* окно — в нём погода и время суток */
  const wx = SW * (0.18 + rnd() * 0.3), wy = SH * 0.12, ww = SW * 0.48, wh = SH * 0.42;
  ctx.save(); ctx.beginPath(); ctx.rect(wx, wy, ww, wh); ctx.clip();
  ctx.translate(wx, wy); ctx.scale(ww / SW, wh / (SH * 0.62));
  outdoor(ctx, { ...sc, place: sc.place === 'office' ? 'city' : sc.place === 'home' && sc.season !== 'winter' ? 'park' : 'city', people: null, objs: sc.objs.filter((o) => ['stars', 'moon', 'lamps', 'leaves'].includes(o)) }, P, rnd);
  ctx.scale(SW / ww, SH * 0.62 / wh); weather(ctx, sc, P, rnd, false);
  ctx.restore();
  ctx.strokeStyle = css(mix(wallC, [255, 255, 255], 0.35)); ctx.lineWidth = 16; ctx.strokeRect(wx, wy, ww, wh); ctx.lineWidth = 7; ctx.beginPath(); ctx.moveTo(wx + ww / 2, wy); ctx.lineTo(wx + ww / 2, wy + wh); ctx.moveTo(wx, wy + wh / 2); ctx.lineTo(wx + ww, wy + wh / 2); ctx.stroke();
  if (night) glow(ctx, SW * 0.82, SH * 0.3, 380, P.warm, sc.place === 'office' ? 0.18 : 0.38);
  if (sc.place === 'party') { ctx.strokeStyle = css(P.ink, 0.5); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(0, SH * 0.08); ctx.quadraticCurveTo(SW / 2, SH * 0.2, SW, SH * 0.08); ctx.stroke(); for (let i = 0; i < 14; i++) { const x = i / 13 * SW, y = SH * 0.08 + Math.sin(i / 13 * Math.PI) * SH * 0.12 * 0.95; glow(ctx, x, y, 24, [[255, 210, 120], [255, 140, 160], [140, 200, 255]][i % 3], 0.8); } }
  /* стол */
  const ty = SH * 0.74;
  ctx.fillStyle = css(mix([120, 86, 60], P.dark, 0.3)); ctx.fillRect(0, ty, SW, SH - ty);
  ctx.fillStyle = css(mix([150, 110, 80], P.light, 0.15)); ctx.fillRect(0, ty, SW, 16);
  people(ctx, sc.people, SW * (sc.people === 'many' ? 0.3 : 0.16), ty + 6, sc.people === 'many' ? 190 : 230, P, rnd, night);
  const objs = sc.objs.filter((o) => OBJ_DRAW[o]);
  if (sc.place === 'office' && !objs.includes('laptop')) objs.unshift('laptop');
  if (sc.place === 'party' && !objs.includes('cake') && !objs.includes('balloons')) objs.push('cake');
  objs.slice(0, 3).forEach((o, i) => { const x = SW * (0.62 + (i - (Math.min(3, objs.length) - 1) / 2) * 0.26); OBJ_DRAW[o](ctx, x, ty + 2, o === 'laptop' ? 110 : o === 'balloons' ? 120 : 90, P, rnd); });
}

/* ---------- крупный план предмета ---------- */
function closeup(ctx, sc, P, rnd) {
  const base = INDOOR.has(sc.place) ? mix([200, 180, 160], P.light, 0.3) : mix(P.skyBot, P.ground, 0.4);
  const bg = P.night || P.eve ? mix(base, [20, 20, 40], 0.6) : base;
  ctx.fillStyle = grad(ctx, 0, 0, 0, SH, [[0, bg], [1, mix(bg, [0, 0, 0], 0.3)]]); ctx.fillRect(0, 0, SW, SH);
  for (let i = 0; i < 16; i++) glow(ctx, rnd() * SW, rnd() * SH * 0.6, 40 + rnd() * 90, i % 3 ? P.warm : P.sat, 0.25);
  ctx.fillStyle = css(mix([110, 80, 58], P.dark, 0.3)); ctx.fillRect(0, SH * 0.72, SW, SH);
  const o = sc.objs.find((x) => OBJ_DRAW[x]) || 'cup';
  OBJ_DRAW[o](ctx, SW / 2, SH * 0.78, o === 'laptop' ? 260 : 230, P, rnd);
  if (sc.weather.includes('rain')) { ctx.fillStyle = css([220, 230, 245], 0.35); for (let i = 0; i < 70; i++) { ctx.beginPath(); ctx.ellipse(rnd() * SW, rnd() * SH, 3 + rnd() * 5, 5 + rnd() * 8, 0, 0, Math.PI * 2); ctx.fill(); } }
}

function paint(sc, S) {
  const c = PV.Img.makeCanvas(SW, SH), ctx = c.getContext('2d');
  const rnd = U.rng(sc.seed), P = palette(sc, S);
  if (sc.shot === 'close') closeup(ctx, sc, P, rnd);
  else if (INDOOR.has(sc.place)) indoorScene(ctx, sc, P, rnd);
  else { outdoor(ctx, sc, P, rnd); weather(ctx, sc, P, rnd, false); }
  /* мягкая виньетка */
  const g = ctx.createRadialGradient(SW / 2, SH / 2, SH * 0.3, SW / 2, SH / 2, SH * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, SW, SH);
  return c;
}

PV.Scene = { plan, paint, describe, SW, SH };
})();
