// Тестовый стенд входа через Instagram: имитация API Instagram (порт 8790) и настоящий прокси connect/instagram-proxy.js (порт 8791).
// Запуск отдельно: node test/ig_mock.mjs  (или импортом из test/ig_e2e.js)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import worker from '../connect/instagram-proxy.js';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const APP = process.env.APP_ORIGIN || `http://localhost:${process.env.PORT || 8765}`;
export const MOCK = 'http://localhost:8790', PROXY = 'http://localhost:8791';
const now = Date.now();
/* фиксированное местное время: вчера 10:30 и 20:30, 50 дней назад — день не «разъезжается» в зависимости от часа запуска */
const at = (daysAgo, hh, mm) => { const d = new Date(now); d.setDate(d.getDate() - daysAgo); d.setHours(hh, mm, 0, 0); return d.toISOString().replace('Z', '+0000'); };
export const MEDIA = [
  { id: '901', media_type: 'IMAGE', caption: 'Утро в парке, жёлтые клёны и какао ☕ #осень', media_url: `${MOCK}/cdn/p1.jpg`, timestamp: at(1, 10, 30), permalink: 'https://www.instagram.com/p/demo1/' },
  { id: '902', media_type: 'CAROUSEL_ALBUM', caption: 'Вечером дождь, фонари в лужах', timestamp: at(1, 20, 30), permalink: 'https://www.instagram.com/p/demo2/',
    children: { data: [{ id: '9021', media_type: 'IMAGE', media_url: `${MOCK}/cdn/p2.jpg` }, { id: '9022', media_type: 'VIDEO', thumbnail_url: `${MOCK}/cdn/p3.jpg`, media_url: `${MOCK}/cdn/v.mp4` }] } },
  { id: '903', media_type: 'IMAGE', caption: 'Снег за окном', media_url: `${MOCK}/cdn/p1.jpg`, timestamp: at(50, 12, 0), permalink: 'https://www.instagram.com/p/demo3/' },
];
const log = [];
const send = (res, code, body, type = 'application/json') => { res.writeHead(code, { 'Content-Type': type, 'Access-Control-Allow-Origin': '*' }); res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)); };
const readBody = (req) => new Promise((r) => { const b = []; req.on('data', (c) => b.push(c)); req.on('end', () => r(Buffer.concat(b).toString())); });

export function startMock(imgDir) {
  const ig = http.createServer(async (req, res) => {
    const u = new URL(req.url, MOCK);
    log.push(req.method + ' ' + u.pathname);
    if (u.pathname === '/oauth/authorize') {
      const back = new URL(u.searchParams.get('redirect_uri'));
      if (u.searchParams.get('client_id') !== '1234567890' || u.searchParams.get('scope') !== 'instagram_business_basic') return send(res, 400, { error: 'bad client' });
      back.searchParams.set('code', 'MOCKCODE'); back.searchParams.set('state', u.searchParams.get('state'));
      res.writeHead(302, { Location: back.toString() + '#_' }); return res.end();
    }
    if (u.pathname === '/oauth/access_token' && req.method === 'POST') {
      const f = new URLSearchParams(await readBody(req));
      if (f.get('code') !== 'MOCKCODE' || f.get('client_secret') !== 'SECRET' || f.get('grant_type') !== 'authorization_code') return send(res, 400, { error_message: 'bad exchange' });
      return send(res, 200, { access_token: 'SHORT', user_id: 17841400000000 });
    }
    if (u.pathname === '/access_token') return u.searchParams.get('access_token') === 'SHORT' && u.searchParams.get('client_secret') === 'SECRET' ? send(res, 200, { access_token: 'LONG', token_type: 'bearer', expires_in: 5184000 }) : send(res, 400, { error: { message: 'bad' } });
    if (u.pathname === '/refresh_access_token') return send(res, 200, { access_token: 'LONG2', expires_in: 5184000 });
    const tokOk = ['LONG', 'LONG2'].includes(u.searchParams.get('access_token'));
    if (u.pathname === '/v23.0/me') return tokOk ? send(res, 200, { user_id: '17841400000000', username: 'demo.moments', account_type: 'MEDIA_CREATOR' }) : send(res, 401, { error: { code: 190, message: 'bad token' } });
    if (u.pathname === '/v23.0/me/media') {
      if (!tokOk) return send(res, 401, { error: { code: 190, message: 'bad token' } });
      const after = u.searchParams.get('after');
      const page = after ? MEDIA.slice(2) : MEDIA.slice(0, 2);
      const q = new URLSearchParams(u.searchParams); q.set('after', 'CUR2');
      return send(res, 200, { data: page, paging: after ? {} : { next: `${MOCK}/v23.0/me/media?${q}` } });
    }
    if (u.pathname.startsWith('/cdn/')) {
      const f = path.join(imgDir, path.basename(u.pathname));
      if (!fs.existsSync(f)) return send(res, 404, 'no');
      res.writeHead(200, { 'Content-Type': 'image/jpeg' }); return res.end(fs.readFileSync(f)); /* как у CDN Instagram — без CORS */
    }
    send(res, 404, { error: 'mock: not found ' + u.pathname });
  });
  const env = { IG_APP_ID: '1234567890', IG_APP_SECRET: 'SECRET', ALLOWED_ORIGINS: APP, ALLOWED_REDIRECTS: `${APP}/index.html,${APP}/`, IG_API_BASE: MOCK, IG_GRAPH_BASE: MOCK, EXTRA_MEDIA_HOSTS: 'localhost' };
  const px = http.createServer(async (req, res) => {
    const body = ['GET', 'HEAD', 'OPTIONS'].includes(req.method) ? undefined : await readBody(req);
    const r = await worker.fetch(new Request(PROXY + req.url, { method: req.method, headers: req.headers, body }), env);
    res.writeHead(r.status, Object.fromEntries(r.headers));
    res.end(Buffer.from(await r.arrayBuffer()));
  });
  return Promise.all([new Promise((r) => ig.listen(8790, r)), new Promise((r) => px.listen(8791, r))]).then(() => ({ log, close: () => { ig.close(); px.close(); } }));
}
if (process.argv[1] === fileURLToPath(import.meta.url)) startMock(process.argv[2] || path.join(DIR, 'out/igcdn')).then(() => console.log('mock 8790, proxy 8791'));
