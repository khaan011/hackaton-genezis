/* Послевкусие — хранение дневника в браузере (IndexedDB) и ZIP без сжатия для папок дня. */
(function () {
'use strict';
const PV = (globalThis.PV = globalThis.PV || {});

const DB_NAME = 'poslevkusie', STORE = 'days';
let dbp = null;
function db() {
  if (dbp) return dbp;
  dbp = new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, 1);
    r.onupgradeneeded = () => { const d = r.result; if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' }); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbp;
}
async function tx(mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(STORE, mode), st = t.objectStore(STORE);
    let out;
    Promise.resolve(fn(st)).then((v) => { out = v; });
    t.oncomplete = () => res(out);
    t.onerror = () => rej(t.error);
    t.onabort = () => rej(t.error || new Error('Не удалось сохранить: возможно, закончилось место в браузере'));
  });
}
const reqP = (r) => new Promise((res, rej) => { r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });

let memory = null;
async function usable() {
  if (memory) return false;
  try { if (!globalThis.indexedDB) throw new Error('нет IndexedDB'); await db(); return true; }
  catch (e) { memory = new Map(); return false; }
}
const Store = {
  get mode() { return memory ? 'memory' : 'indexeddb'; },
  async ready() { return usable(); },
  async all() {
    if (!(await usable())) return [...memory.values()].sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1)); const list = await tx('readonly', (st) => reqP(st.getAll())); return (list || []).sort((a, b) => (a.date === b.date ? a.createdAt - b.createdAt : a.date < b.date ? -1 : 1)); },
  async get(id) { if (!(await usable())) return memory.get(id); return tx('readonly', (st) => reqP(st.get(id))); },
  async put(day) { if (!(await usable())) { memory.set(day.id, day); return day; } await tx('readwrite', (st) => { st.put(day); }); return day; },
  async remove(id) { if (!(await usable())) { memory.delete(id); return; } await tx('readwrite', (st) => { st.delete(id); }); },
};

/* ---------- ZIP (метод «хранение», имена в UTF-8) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function dosTime(d) { return { time: (d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1), date: ((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate() }; }

/* files: [{name, data: Uint8Array|Blob|string}] */
async function zip(files) {
  const enc = new TextEncoder(), parts = [], central = [];
  let offset = 0;
  const now = dosTime(new Date());
  for (const f of files) {
    let data = f.data;
    if (typeof data === 'string') data = enc.encode(data);
    else if (data instanceof Blob) data = new Uint8Array(await data.arrayBuffer());
    const name = enc.encode(f.name), crc = crc32(data);
    const lh = new DataView(new ArrayBuffer(30));
    lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
    lh.setUint16(10, now.time, true); lh.setUint16(12, now.date, true); lh.setUint32(14, crc, true);
    lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true); lh.setUint16(28, 0, true);
    parts.push(new Uint8Array(lh.buffer), name, data);
    const ch = new DataView(new ArrayBuffer(46));
    ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true); ch.setUint16(10, 0, true);
    ch.setUint16(12, now.time, true); ch.setUint16(14, now.date, true); ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true);
    ch.setUint16(28, name.length, true); ch.setUint16(30, 0, true); ch.setUint16(32, 0, true); ch.setUint16(34, 0, true); ch.setUint16(36, 0, true);
    ch.setUint32(38, f.name.endsWith('/') ? 0x10 : 0, true); ch.setUint32(42, offset, true);
    central.push(new Uint8Array(ch.buffer), name);
    offset += 30 + name.length + data.length;
  }
  const cdSize = central.reduce((s, p) => s + p.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, cdSize, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
}

/* чтение ZIP, созданного этим же приложением (без сжатия) */
async function unzip(blob) {
  const u8 = new Uint8Array(await blob.arrayBuffer()), dv = new DataView(u8.buffer);
  let e = u8.length - 22;
  while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error('Это не ZIP-архив');
  const count = dv.getUint16(e + 10, true);
  let p = dv.getUint32(e + 16, true);
  const dec = new TextDecoder(), out = {};
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('Повреждённый архив');
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true);
    const nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    if (method !== 0) throw new Error('Архив сжат другой программой. Используйте экспорт из «Послевкусия».');
    const lnl = dv.getUint16(lo + 26, true), lxl = dv.getUint16(lo + 28, true);
    out[name] = u8.subarray(lo + 30 + lnl + lxl, lo + 30 + lnl + lxl + size);
    p += 46 + nl + xl + cl;
  }
  return out;
}

PV.Store = Store;
PV.Zip = { zip, unzip, crc32 };
})();
