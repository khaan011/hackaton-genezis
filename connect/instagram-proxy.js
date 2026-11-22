/* Послевкусие — прокси входа через Instagram (Cloudflare Worker, ~80 строк, без зависимостей).
   Зачем: Instagram меняет код входа на токен только вместе с секретом приложения, а секрет нельзя держать в браузере.
   Прокси ничего не хранит: меняет код на долгоживущий токен (60 дней), продлевает его и отдаёт снимки с CDN Instagram
   с CORS — чтобы дневник мог посмотреть на свет и цвет снимка на canvas.

   Переменные окружения (wrangler secret / vars):
     IG_APP_ID, IG_APP_SECRET   — из Meta for Developers → приложение → Instagram → API setup with Instagram login
     ALLOWED_ORIGINS            — откуда можно звать прокси, через запятую: https://khaan011.github.io
     ALLOWED_REDIRECTS          — разрешённые redirect_uri через запятую: https://khaan011.github.io/hackaton-genezis/
   Для тестов: IG_API_BASE, IG_GRAPH_BASE (адреса API), EXTRA_MEDIA_HOSTS (доп. хосты снимков). */
const MEDIA_HOSTS = ['.cdninstagram.com', '.fbcdn.net'];
const list = (s) => String(s || '').split(',').map((x) => x.trim()).filter(Boolean);

function cors(env, origin) {
  const ok = list(env.ALLOWED_ORIGINS).includes(origin);
  return ok ? { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400', Vary: 'Origin' } : null;
}
const json = (obj, status, h) => new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...h } });

async function exchange(env, code, redirectUri) {
  const api = env.IG_API_BASE || 'https://api.instagram.com', graph = env.IG_GRAPH_BASE || 'https://graph.instagram.com';
  const form = new URLSearchParams({ client_id: env.IG_APP_ID, client_secret: env.IG_APP_SECRET, grant_type: 'authorization_code', redirect_uri: redirectUri, code });
  const r1 = await fetch(`${api}/oauth/access_token`, { method: 'POST', body: form });
  const short = await r1.json();
  if (!r1.ok || !short.access_token) throw new Error(short.error_message || (short.error && short.error.message) || 'code exchange failed');
  const q = new URLSearchParams({ grant_type: 'ig_exchange_token', client_secret: env.IG_APP_SECRET, access_token: short.access_token });
  const r2 = await fetch(`${graph}/access_token?${q}`);
  const long = await r2.json();
  if (!r2.ok || !long.access_token) throw new Error((long.error && long.error.message) || 'long-lived token failed');
  return { access_token: long.access_token, user_id: short.user_id, expires_in: long.expires_in };
}
async function refresh(env, token) {
  const graph = env.IG_GRAPH_BASE || 'https://graph.instagram.com';
  const r = await fetch(`${graph}/refresh_access_token?${new URLSearchParams({ grant_type: 'ig_refresh_token', access_token: token })}`);
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error((j.error && j.error.message) || 'refresh failed');
  return { access_token: j.access_token, expires_in: j.expires_in };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), origin = req.headers.get('Origin') || '';
    const h = cors(env, origin);
    if (req.method === 'OPTIONS') return new Response(null, { status: h ? 204 : 403, headers: h || {} });
    if (!h) return json({ error: 'origin not allowed' }, 403, {});
    try {
      if (url.pathname === '/token' && req.method === 'POST') {
        const { code, redirect_uri } = await req.json();
        if (!code || !list(env.ALLOWED_REDIRECTS).includes(redirect_uri)) return json({ error: 'bad code or redirect_uri' }, 400, h);
        return json(await exchange(env, code, redirect_uri), 200, h);
      }
      if (url.pathname === '/refresh' && req.method === 'POST') {
        const { access_token } = await req.json();
        if (!access_token) return json({ error: 'no token' }, 400, h);
        return json(await refresh(env, access_token), 200, h);
      }
      if (url.pathname === '/media' && req.method === 'GET') {
        let target;
        try { target = new URL(url.searchParams.get('url') || ''); } catch (e) { return json({ error: 'bad url' }, 400, h); }
        const hosts = [...MEDIA_HOSTS, ...list(env.EXTRA_MEDIA_HOSTS)];
        const okHost = hosts.some((s) => (s.startsWith('.') ? target.hostname.endsWith(s) : target.hostname === s));
        if (!okHost || !/^https?:$/.test(target.protocol) || (target.protocol === 'http:' && !list(env.EXTRA_MEDIA_HOSTS).length)) return json({ error: 'host not allowed' }, 400, h);
        const r = await fetch(target.toString());
        const type = r.headers.get('Content-Type') || '';
        if (!r.ok || !/^image\//.test(type)) return json({ error: 'not an image' }, 502, h);
        return new Response(r.body, { status: 200, headers: { 'Content-Type': type, 'Cache-Control': 'private, max-age=3600', ...h } });
      }
      return json({ error: 'not found' }, 404, h);
    } catch (e) {
      return json({ error: String(e.message || e) }, 502, h);
    }
  },
};
