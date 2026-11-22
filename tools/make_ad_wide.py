#!/usr/bin/env python3
"""Рекламный ролик «Послевкусия» 16:9 (1920×1080): в основном о приложении, мгновения Instagram — одна сцена.
Яркие градиенты, телефон с живым интерфейсом, настоящие видео-воспоминания, титры по словам (тайминг — Whisper по озвучке).
Запуск: uv run --with pillow --with numpy python tools/make_ad_wide.py
Входы: test/out/ad3/s1..s10.mp3 (+ s*.json — слова Whisper), test/out/ad2/cap_*/ (tools/capture_phone.js),
test/out/ad/day_*.mp4 (tools/export_day.js), docs/img/*.jpg, test/assets/real/*.jpg, музыка dance.mp3 (CC0)."""
import json, math, os, subprocess, pathlib, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
A3 = ROOT / 'test/out/ad3'; A2 = ROOT / 'test/out/ad2'; AD = ROOT / 'test/out/ad'
FF = os.path.expanduser('~/.local/bin/ffmpeg'); FP = FF.replace('ffmpeg', 'ffprobe')
W, H, FPS = 1920, 1080, 30
BEAT = 60 / 171.0; MUSIC_AT = 13.257
F_BOLD = str(AD / 'mont700.ttf'); F_HEAVY = str(AD / 'mont800.ttf'); F_MED = str(AD / 'mont500.ttf'); F_SERIF = str(AD / 'lora-it500.ttf')
EMOJI = '/System/Library/Fonts/Apple Color Emoji.ttc'
INK = (24, 18, 30); YEL = (255, 222, 60)
_fonts = {}
def font(p, s):
    k = (p, int(s))
    if k not in _fonts: _fonts[k] = ImageFont.truetype(p, int(s))
    return _fonts[k]
def dur(f): return float(subprocess.check_output([FP, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(f)]))
def eo(x): x = max(0, min(1, x)); return 1 - (1 - x) ** 3
def eb(x):
    x = max(0, min(1, x)); c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
def hexc(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

# ---------- озвучка и слова ----------
LINES = json.load(open(A3 / 'lines.json'))
VO, t = [], 0.5
for sid, txt, *_ in LINES:
    d = dur(A3 / f'{sid}.mp3')
    words = []
    wj = A3 / f'{sid}.json'
    if wj.exists():
        for seg in json.load(open(wj)).get('segments', []):
            for w in seg.get('words', []): words.append((w['word'].strip(), w['start'], w['end']))
    if not words:  # запасной путь — равномерно по тексту
        ws = txt.split(); step = d / max(1, len(ws)); words = [(w, i * step, (i + 1) * step) for i, w in enumerate(ws)]
    # слова берём из текста сценария (Whisper ошибается в написании), время — от Whisper по порядку
    ws = txt.split()
    if len(ws) == len(words): words = [(ws[i], s, e) for i, (_, s, e) in enumerate(words)]
    else:
        step = d / max(1, len(ws)); words = [(w, i * step, (i + 1) * step) for i, w in enumerate(ws)]
    VO.append({'id': sid, 'at': t, 'dur': d, 'words': [(w, t + s, t + e) for w, s, e in words]})
    t += d + 0.35
TOTAL = t + 1.6
SC = {v['id']: (v['at'] - (0.5 if v['id'] == 's1' else 0.15), v['at'] + v['dur'] + 0.2) for v in VO}
SC['s10'] = (SC['s10'][0], TOTAL)
ORDER = [v['id'] for v in VO]

# ---------- материалы ----------
def load(p): return Image.open(p).convert('RGB')
def cover(im, w, h):
    k = max(w / im.width, h / im.height); im = im.resize((int(im.width * k + 1), int(im.height * k + 1)), Image.LANCZOS)
    return im.crop(((im.width - w) // 2, (im.height - h) // 2, (im.width - w) // 2 + w, (im.height - h) // 2 + h))
def shadowed(el, r=26, op=110, off=(0, 26)):
    sh = Image.new('RGBA', (el.width + r * 4, el.height + r * 4), (0, 0, 0, 0))
    m = el.getchannel('A').point(lambda v: v * op // 255); sh.paste((0, 0, 0, 255), (r * 2 + off[0], r * 2 + off[1]), m)
    sh = sh.filter(ImageFilter.GaussianBlur(r)); sh.alpha_composite(el, (r * 2, r * 2)); return sh
def rounded(im, rad):
    im = im.convert('RGBA'); m = Image.new('L', im.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=rad, fill=255)
    im.putalpha(m); return im
def polaroid(p, w=360):
    ph = cover(load(p), w, int(w * 1.1)); card = Image.new('RGBA', (w + 30, int(w * 1.1) + 90), (255, 253, 248, 255)); card.paste(ph, (15, 15))
    return shadowed(card, 18, 120)
GALLERY = ['autumn_path', 'cocoa', 'snow_trees', 'river_sunset', 'balloons', 'umbrella_rain', 'office_night', 'campfire', 'dacha_house', 'cake_candles', 'snow_window', 'autumn_leaves']
GAL = [cover(load(ROOT / f'test/assets/real/{n}.jpg'), 300, 300) for n in GALLERY]
INST = [polaroid(ROOT / f'test/assets/real/{n}.jpg') for n in ('ig_cocoa2', 'ig_snow_tree', 'keyboard_glow')]
REGS = [('monet', 'Моне', '#ffb347'), ('kandinsky', 'Кандинский', '#3d5afe'), ('ma', 'Ма', '#efe7da'), ('film', 'Плёнка', '#ff7a45'), ('matisse', 'Матисс', '#00b8c9'), ('nocturne', 'Ноктюрн', '#3b2a6b')]
REGIMG = {k: rounded(cover(load(ROOT / f'docs/img/{k}.jpg'), 420, 746), 22) for k, _, _ in REGS}

CAP = {}
for n in ('form', 'insta', 'build', 'archive', 'tune'):
    d = A2 / f'cap_{n}'; CAP[n] = (d, json.load(open(d / 'times.json')))
_cc = {}
def cap_at(name, tt):
    d, times = CAP[name]; tt = max(0, min(tt, times[-1][1]))
    lo, hi = 0, len(times) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if times[mid][1] <= tt: lo = mid
        else: hi = mid - 1
    k = (name, lo)
    if k not in _cc:
        if len(_cc) > 30: _cc.clear()
        _cc[k] = load(d / times[lo][0])
    return _cc[k]
def cap_len(name): return CAP[name][1][-1][1]

def vframes(src, start, count, name):
    out = A3 / f'vf_{name}'; out.mkdir(exist_ok=True)
    if not (out / f'{count:05d}.jpg').exists():
        subprocess.run([FF, '-v', 'error', '-y', '-ss', str(start), '-i', str(src), '-frames:v', str(count), '-vf', f'fps={FPS},scale=608:1080', '-q:v', '3', str(out / '%05d.jpg')], check=True)
    return out
MONET = vframes(next(AD.glob('day_Осенний*.mp4')), 3.5, 420, 'monet')
PARTY = vframes(next(AD.glob('day_День*.mp4')), 3.0, 420, 'party')
def vf(dirp, i): return load(dirp / f'{max(1, min(420, i)):05d}.jpg')

# ---------- фон ----------
GR = {'s1': ('#ff5f6d', '#ffc371'), 's2': ('#ff2e88', '#7b2ff7'), 's3': ('#ff9a3c', '#ff2e88'), 's4': ('#2bd2ff', '#7b2ff7'), 's5': ('#1b1030', '#1b1030'),
      's6': ('#ffb347', '#ff5f6d'), 's7': ('#00c9a7', '#2b8cff'), 's8': ('#ff2e88', '#ff9a3c'), 's9': ('#7b2ff7', '#2bd2ff'), 's10': ('#1b1030', '#4a1d6e')}
_g = {}
def gradient(a, b, tt):
    if (a, b) not in _g:
        ca, cb = np.array(hexc(a), float), np.array(hexc(b), float)
        yy, xx = np.mgrid[0:H:4, 0:W * 2:4]
        k = ((xx / (W * 2)) * 0.75 + (yy / H) * 0.25)[..., None]; k = 0.5 - 0.5 * np.cos(k * 2 * math.pi)
        _g[(a, b)] = Image.fromarray((ca * (1 - k) + cb * k).astype(np.uint8)).resize((W * 2, H), Image.BILINEAR)
    off = int((math.sin(tt * 0.5) * 0.5 + 0.5) * W)
    return _g[(a, b)].crop((off, 0, off + W, H)).convert('RGBA')
rnd = random.Random(3)
BL = [(rnd.random(), rnd.random(), rnd.uniform(180, 340), rnd.uniform(0.2, 0.5)) for _ in range(6)]
_blob = {}
def blobs(img, tt):
    q = int(tt * 10)
    if q not in _blob:
        if len(_blob) > 4: _blob.clear()
        lay = Image.new('RGBA', (W // 4, H // 4), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
        for i, (x, y, r, sp) in enumerate(BL):
            cx = (x + 0.08 * math.sin(q / 10 * sp + i)) * W / 4; cy = (y + 0.08 * math.cos(q / 10 * sp * 1.3 + i)) * H / 4; r /= 4
            d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, 55))
        _blob[q] = lay.filter(ImageFilter.GaussianBlur(18)).resize((W, H), Image.BILINEAR)
    img.alpha_composite(_blob[q])

# ---------- элементы ----------
def put(img, el, cx, cy, ang=0, sc=1.0, al=1.0):
    if sc <= 0.01 or al <= 0.01: return
    e = el if sc == 1 else el.resize((max(1, int(el.width * sc)), max(1, int(el.height * sc))), Image.BILINEAR)
    if ang: e = e.rotate(ang, resample=Image.BICUBIC, expand=True)
    if al < 1: e = e.copy(); e.putalpha(e.getchannel('A').point(lambda v: int(v * al)))
    img.alpha_composite(e, (int(cx - e.width / 2), int(cy - e.height / 2))) if 0 <= int(cx - e.width / 2) and int(cx + e.width / 2) <= W and 0 <= int(cy - e.height / 2) and int(cy + e.height / 2) <= H else img.paste(e, (int(cx - e.width / 2), int(cy - e.height / 2)), e)
_ph = {}
def phone(img, screen, cx, cy, ang=0, sc=1.0, h=920):
    sw = int(h * screen.width / screen.height); scr = screen.resize((sw, h), Image.LANCZOS)
    bz = 16
    if (sw, h) not in _ph:
        body = Image.new('RGBA', (sw + bz * 2, h + bz * 2), (0, 0, 0, 0)); d = ImageDraw.Draw(body)
        d.rounded_rectangle((0, 0, body.width - 1, body.height - 1), radius=60, fill=(18, 14, 22, 255))
        m = Image.new('L', (sw, h), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, sw - 1, h - 1), radius=46, fill=255)
        _ph[(sw, h)] = (body, m)
    body, m = _ph[(sw, h)]; b = body.copy(); b.paste(scr, (bz, bz), m)
    ImageDraw.Draw(b).rounded_rectangle((b.width // 2 - 55, bz + 10, b.width // 2 + 55, bz + 34), radius=12, fill=(18, 14, 22, 255))
    put(img, shadowed(b, 24, 120), cx, cy, ang, sc)
_em = {}
def emoji(img, ch, cx, cy, size=120, ang=0, sc=1.0):
    if ch not in _em:
        e = Image.new('RGBA', (200, 200), (0, 0, 0, 0)); ImageDraw.Draw(e).text((10, 10), ch, font=font(EMOJI, 160), embedded_color=True); _em[ch] = e.crop(e.getbbox())
    put(img, _em[ch].resize((size, size), Image.LANCZOS), cx, cy, ang, sc)
def pill(img, txt, x, y, bg=(255, 255, 255), fg=INK, size=34, al=1.0, anchor='l', em=None):
    f = font(F_BOLD, size); tw = ImageDraw.Draw(img).textlength(txt, font=f); pad = int(size * 0.7); ew = int(size * 1.25) if em else 0
    el = Image.new('RGBA', (int(tw + pad * 2 + ew), int(size * 1.9)), (0, 0, 0, 0)); d = ImageDraw.Draw(el)
    d.rounded_rectangle((0, 0, el.width - 1, el.height - 1), radius=el.height // 2, fill=bg + (255,))
    if em:
        if em not in _em: emoji(Image.new('RGBA', (1, 1)), em, 0, 0)
        e = _em[em].resize((size, size), Image.LANCZOS); el.paste(e, (pad - 4, (el.height - size) // 2), e)
    d.text((pad + ew, el.height // 2), txt, font=f, fill=fg, anchor='lm')
    put(img, el, x + (el.width / 2 if anchor == 'l' else 0), y, 0, 1, al)
def beat(tt):
    ph = ((tt - 0.02) / (BEAT * 2)) % 1; return 1 + 0.025 * math.exp(-ph * 9)

def captions(img, tt, x0=110, y0=None, maxw=760, size=64, color=(255, 255, 255), center=False):
    """фраза целиком, слова проявляются по мере речи, текущее слово — на жёлтом маркере"""
    v = next((v for v in VO if v['at'] - 0.1 <= tt <= v['at'] + v['dur'] + 0.3), None)
    if not v: return
    ws = v['words']; d = ImageDraw.Draw(img); f = font(F_BOLD, size)
    lines, cur = [], []
    for i, w in enumerate(ws):
        test = ' '.join(x[0] for x in cur + [w])
        if cur and d.textlength(test, font=f) > maxw: lines.append(cur); cur = []
        cur.append(w + (i,))
    if cur: lines.append(cur)
    # показываем по 3 строки: окно вокруг текущего слова
    idx = max([i for i, w in enumerate(ws) if w[1] <= tt] or [0])
    li = next(k for k, l in enumerate(lines) if any(w[3] == idx for w in l))
    start = (li // 3) * 3; show = lines[start:start + 3]
    lh = int(size * 1.28); y = (y0 if y0 is not None else H / 2) - (len(show) - 1) * lh / 2
    for l in show:
        lw = d.textlength(' '.join(w[0] for w in l), font=f); x = (W - lw) / 2 if center else x0
        for w in l:
            word, s, e, i = w; ww = d.textlength(word, font=f)
            on = tt >= s - 0.05
            if i == idx and tt <= e + 0.3:
                d.rounded_rectangle((x - 10, y - size * 0.62, x + ww + 10, y + size * 0.6), radius=14, fill=YEL + (255,))
                d.text((x, y), word, font=f, fill=INK, anchor='lm')
            else:
                d.text((x + 3, y + 4), word, font=f, fill=(0, 0, 0, 70 if on else 25), anchor='lm')
                d.text((x, y), word, font=f, fill=color + ((255,) if on else (110,)), anchor='lm')
            x += ww + d.textlength(' ', font=f)
        y += lh

# ---------- сцены ----------
def frame(tt):
    sid = ORDER[0]
    for k in ORDER:
        if tt >= SC[k][0]: sid = k
    a, b = SC[sid]; lt = tt - a; L = b - a; bp = beat(tt)
    img = gradient(*GR[sid], tt)
    if sid not in ('s5', 's10'): blobs(img, tt)
    cap = dict(x0=110, y0=540, maxw=780)
    if sid == 's1':   # галерея: фото есть — ощущения нет
        for i, g in enumerate(GAL):
            r, c = divmod(i, 4); k = eo((lt - i * 0.05) / 0.4)
            gray = min(1, max(0, (lt - 2.2) / 1.2))
            tile = Image.blend(g, g.convert('L').convert('RGB'), gray) if gray else g
            put(img, shadowed(rounded(tile, 18), 10, 80), 1090 + c * 210, 250 + r * 290 + (1 - k) * 80, 0, 0.62 * (0.85 + 0.15 * k), k)
        if lt > 2.4: emoji(img, '🤷', 1720, 880, 150, 8 * math.sin(lt * 4), eb((lt - 2.4) / 0.4))
    elif sid == 's2':  # логотип и веер воспоминаний
        k = eb(lt / 0.45)
        for i, (key, _, _) in enumerate([REGS[0], REGS[4], REGS[5]]):
            ki = eb((lt - 0.25 - i * 0.12) / 0.45)
            put(img, shadowed(REGIMG[key], 20, 120), 1420 + (i - 1) * 240, 560 + (1 - ki) * 500, (i - 1) * 10 * ki, 0.95 * bp, min(1, ki * 1.3))
        el = Image.new('RGBA', (900, 220), (0, 0, 0, 0)); ImageDraw.Draw(el).text((450, 110), 'Послевкусие', font=font(F_SERIF, 128), fill=(255, 255, 255), anchor='mm')
        put(img, shadowed(el, 14, 90), 520, 330, -3 * (1 - k), 0.7 + 0.3 * k)
        cap = dict(x0=130, y0=640, maxw=760, size=56)
    elif sid == 's3':  # запись дня
        k = eb(lt / 0.5); phone(img, cap_at('form', lt * cap_len('form') / max(1, L - 0.6)), 1430, 545 + (1 - k) * 700, -3 * (1 - k), bp)
        pill(img, 'Запись · Фото · Песня', 110, 330, al=eo((lt - 0.2) / 0.3), em='✍️')
    elif sid == 's4':  # анализ: три карточки
        items = [('📝', 'Текст', 'настроение, погода, люди'), ('🖼️', 'Фото', 'свет, цвет, палитра'), ('🎵', 'Песня', 'темп, громкость, лад')]
        for i, (em, ttl, sub) in enumerate(items):
            ki = eb((lt - 0.35 - i * 0.9) / 0.45)
            if ki <= 0: continue
            card = Image.new('RGBA', (500, 560), (0, 0, 0, 0)); d = ImageDraw.Draw(card)
            d.rounded_rectangle((0, 0, 499, 559), radius=36, fill=(255, 255, 255, 240))
            d.text((250, 300), ttl, font=font(F_HEAVY, 64), fill=INK, anchor='mm'); d.text((250, 380), sub, font=font(F_MED, 30), fill=(90, 80, 100), anchor='mm')
            if i == 1:
                for j, c in enumerate(['#d9a55a', '#6a8a30', '#2f4fa2', '#e8b23a', '#1e1b18']): d.rounded_rectangle((95 + j * 66, 440, 95 + j * 66 + 52, 492), radius=12, fill=hexc(c))
            if i == 2:
                for j in range(26):
                    hh = 12 + 44 * abs(math.sin(j * 0.7 + lt * 9)); d.rounded_rectangle((70 + j * 14, 466 - hh / 2, 70 + j * 14 + 8, 466 + hh / 2), radius=4, fill=hexc('#ff2e88'))
            if i == 0:
                for j, wd in enumerate([300, 240, 320]): d.rounded_rectangle((100, 440 + j * 26, 100 + wd, 454 + j * 26), radius=7, fill=(210, 200, 225))
            if em not in _em: emoji(Image.new('RGBA', (1, 1)), em, 0, 0)
            e = _em[em].resize((130, 130), Image.LANCZOS); card.alpha_composite(e, (185, 110))
            put(img, shadowed(card, 22, 100), 400 + i * 560, 430 + (1 - ki) * 300, (i - 1) * 2, (0.92 + 0.08 * ki) * (bp if lt > 3 else 1))
        cap = dict(x0=0, y0=900, maxw=1500, size=54, center=True)
    elif sid == 's5':  # клип дня на весь экран
        fr = vf(MONET, int(lt * FPS) + 1)
        bg = fr.resize((W, int(W * fr.height / fr.width))).crop((0, 400, W, 400 + H)).filter(ImageFilter.GaussianBlur(30)).convert('RGBA')
        img.alpha_composite(bg); img.alpha_composite(Image.new('RGBA', (W, H), (20, 12, 30, 90)))
        z = 1.0 + 0.04 * math.exp(-(((tt) / (BEAT * 2)) % 1) * 7)
        put(img, shadowed(rounded(fr, 26), 26, 140), 1400, 540, 0, 0.92 * z)
        pill(img, 'клип дня — в ритме песни', 110, 330, bg=YEL, em='🎬', al=eo(lt / 0.3))
    elif sid == 's6':  # шесть стилей — карусель
        span = L / 6; i = min(5, int(lt / span)); li = lt - i * span
        key, name, col = REGS[i]
        img = Image.new('RGBA', (W, H), hexc(col) + (255,)); blobs(img, tt)
        for j in range(-2, 3):
            n = i + j
            if 0 <= n < 6:
                kk = eo(li / 0.3); x = W / 2 + (j + (1 - kk)) * 470
                put(img, shadowed(REGIMG[REGS[n][0]], 18, 110), x, 600, j * 4, (1.0 if j == 0 else 0.78) * (bp if j == 0 else 1), 1 if j == 0 else 0.75)
        dark = key == 'ma'
        d = ImageDraw.Draw(img); f = font(F_HEAVY, 92)
        d.text((W / 2, 120), name, font=f, fill=INK if dark else (255, 255, 255), anchor='mm')
        cap = dict(x0=0, y0=1010, maxw=1700, size=44, center=True, color=INK if dark else (255, 255, 255))
    elif sid == 's7':  # ползунок → пересборка
        phone(img, cap_at('tune', min(cap_len('tune'), lt * cap_len('tune') / max(1, L - 0.3))), 1430, 545, 2 * math.sin(lt), bp)
        pill(img, 'каждое решение — с объяснением', 110, 330, em='🎚️', al=eo(lt / 0.3))
    elif sid == 's8':  # момент про мгновения Instagram
        pill(img, 'Мгновения Instagram', 110, 230, bg=YEL, size=42, em='⚡', al=eo(lt / 0.25))
        for i in range(3):
            st = 0.3 + i * 0.7; k = eb((lt - st) / 0.4)
            gone = eo((lt - (3.9 + i * 0.25)) / 0.5) if lt > 3.9 else 0
            if k > 0 and gone < 1: put(img, INST[i], 300 + i * 220, 790, -10 + i * 10, 0.62 * (1 - 0.5 * gone) * (0.8 + 0.2 * k), 1 - gone)
        if 3.9 < lt < 5.4: emoji(img, '💨', 760, 700, 130, 0, eb((lt - 4.0) / 0.3))
        if lt > 3.2:
            k = eb((lt - 3.2) / 0.5); phone(img, cap_at('insta', (lt - 3.2) * 1.0), 1430, 545 + (1 - k) * 700, -3 * (1 - k), bp)
        cap = dict(x0=110, y0=420, maxw=760, size=50)
    elif sid == 's9':  # приватность
        phone(img, cap_at('archive', lt * 1.5), 1430, 545, -2, bp)
        emoji(img, '🔒', 300, 330, 140, 6 * math.sin(lt * 3), eb(lt / 0.4))
        cap = dict(x0=110, y0=620, maxw=780, size=64)
    elif sid == 's10':  # финал
        fr = vf(PARTY, int(lt * FPS) + 1)
        bg = fr.resize((W, int(W * fr.height / fr.width))).crop((0, 300, W, 300 + H)).filter(ImageFilter.GaussianBlur(26)).convert('RGBA')
        img.alpha_composite(bg); img.alpha_composite(Image.new('RGBA', (W, H), (24, 14, 34, 150)))
        for j in range(26):
            jx = (j * 73 % 100) / 100 * W; jy = ((lt * (260 + j * 19) + j * 90) % (H + 160)) - 80
            ImageDraw.Draw(img).rounded_rectangle((jx, jy, jx + 18, jy + 32), radius=5, fill=hexc(['#ff2e88', '#ffde3c', '#2bd2ff', '#00c9a7', '#ff9a3c'][j % 5]))
        k = eb(lt / 0.45)
        el = Image.new('RGBA', (1200, 240), (0, 0, 0, 0)); ImageDraw.Draw(el).text((600, 120), 'Послевкусие', font=font(F_SERIF, 170), fill=(255, 255, 255), anchor='mm')
        put(img, el, W / 2, 400, 0, 0.6 + 0.4 * k)
        if lt > 0.5: pill(img, 'запомни, как ощущался день', W / 2 - 300, 590, bg=YEL, size=44, al=eo((lt - 0.5) / 0.3), em='✨')
        if lt > 1.0: ImageDraw.Draw(img).text((W / 2, 720), 'khaan011.github.io/hackaton-genezis', font=font(F_MED, 40), fill=(255, 255, 255), anchor='mm')
        if lt > 1.4: pill(img, 'всё в браузере — фото не покидают телефон', W / 2 - 330, 830, bg=(255, 255, 255), size=34, al=eo((lt - 1.4) / 0.3), em='🔒')
        return img.convert('RGB')
    captions(img, tt, **cap)
    return img.convert('RGB')

if __name__ == '__main__':
    silent = A3 / 'video.mp4'; n = int(TOTAL * FPS)
    pr = subprocess.Popen([FF, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', str(silent)], stdin=subprocess.PIPE)
    for i in range(n):
        pr.stdin.write(frame(i / FPS).tobytes())
        if i % 300 == 0: print(f'кадр {i}/{n}', flush=True)
    pr.stdin.close(); pr.wait()
    ins = ['-i', str(silent), '-i', str(ROOT / 'test/assets/real/music/dance.mp3')]
    fc = [f"[1:a]atrim=start={MUSIC_AT}:duration={TOTAL},asetpts=PTS-STARTPTS,afade=t=in:d=0.3,afade=t=out:st={TOTAL - 2}:d=2,volume=0.42[mus]"]
    vo = []
    for i, v in enumerate(VO):
        ins += ['-i', str(A3 / f"{v['id']}.mp3")]; ms = int(v['at'] * 1000)
        fc.append(f"[{i + 2}:a]adelay={ms}|{ms},volume=1.3[v{i}]"); vo.append(f'[v{i}]')
    fc.append(f"{''.join(vo)}amix=inputs={len(vo)}:normalize=0,asplit[a1][a2]")
    fc.append("[mus][a1]sidechaincompress=threshold=0.03:ratio=5:attack=15:release=300[duck]")
    fc.append(f"[duck][a2]amix=inputs=2:normalize=0,alimiter=limit=0.95,atrim=duration={TOTAL}[a]")
    dst = ROOT / 'docs/demo.mp4'
    subprocess.run([FF, '-v', 'error', '-y', *ins, '-filter_complex', ';'.join(fc), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(dst)], check=True)
    print('готово:', dst, f'{TOTAL:.1f} с')
