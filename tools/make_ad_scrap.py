#!/usr/bin/env python3
"""Рекламный ролик «Послевкусия» 16:9 в стиле неонового скрапбука — тот же стиль, что у интерфейса.
Тёмная доска с неоновыми каракулями, полароиды на скотче, наклейки, слова-вырезки по озвучке,
неоновые вывески на крике, затемнение на шёпоте, удары в долю. Озвучка — ElevenLabs v3 с режиссурой (tools/ad_scrap_lines.json).
Запуск: uv run --with pillow --with numpy python tools/make_ad_scrap.py"""
import json, math, os, subprocess, pathlib, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter, ImageChops

ROOT = pathlib.Path(__file__).resolve().parent.parent
A4 = ROOT / 'test/out/ad4'; A2 = ROOT / 'test/out/ad2'; AD = ROOT / 'test/out/ad'; FT = ROOT / 'test/out/fonts'
FF = os.path.expanduser('~/.local/bin/ffmpeg'); FP = FF.replace('ffmpeg', 'ffprobe')
W, H, FPS = 1920, 1080, 30
BEAT = 60 / 119.9; MUSIC_AT = 32.466   # Rafael Krux — Inspiring Advertising (CC BY 4.0)
F_DISP = str(FT / 'unbounded-800.ttf'); F_DISP6 = str(FT / 'unbounded-600.ttf'); F_HAND = str(FT / 'caveat-700.ttf'); F_SANS = str(AD / 'mont700.ttf')
EMOJI = '/System/Library/Fonts/Apple Color Emoji.ttc'
PINK, CYAN, LIME, YEL, VIO = (255, 63, 164), (47, 240, 255), (200, 255, 61), (255, 225, 77), (161, 107, 255)
NOTE, NINK, BOARD = (255, 247, 227), (34, 26, 44), (20, 16, 28)
rnd = random.Random(11)
_f = {}
def font(p, s):
    k = (p, int(s))
    if k not in _f: _f[k] = ImageFont.truetype(p, int(s))
    return _f[k]
def dur(f): return float(subprocess.check_output([FP, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(f)]))
def cl(x, a=0.0, b=1.0): return a if x < a else b if x > b else x
def eo(x): x = cl(x); return 1 - (1 - x) ** 3
def eb(x):
    x = cl(x); c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
def mixc(a, b, t): return tuple(int(a[i] + (b[i] - a[i]) * t) for i in range(3))

# ---------- озвучка: слова сценария со временем Whisper (по доле символов) ----------
LINES = json.load(open(A4 / 'lines.json'))
VO, t = [], 0.4
for sid, txt, *_ in LINES:
    d = dur(A4 / f'{sid}.mp3')
    ww = []
    j = json.load(open(A4 / f'{sid}.json'))
    for seg in j.get('segments', []):
        for w in seg.get('words', []): ww.append((w['word'].strip(), w['start'], w['end']))
    script = txt.split()
    if ww:
        tot_w = sum(len(x[0]) for x in ww) or 1; acc = 0; marks = []
        for w, s, e in ww: marks.append((acc / tot_w, s, e)); acc += len(w)
        tot_s = sum(len(x) for x in script) or 1; acc = 0; words = []
        for x in script:
            fr = acc / tot_s; acc += len(x)
            m = max([mm for mm in marks if mm[0] <= fr + 1e-6] or [marks[0]], key=lambda q: q[0])
            words.append((x, m[1], m[2]))
    else:
        step = d / len(script); words = [(x, i * step, (i + 1) * step) for i, x in enumerate(script)]
    VO.append({'id': sid, 'at': t, 'dur': d, 'words': [(w, t + s, t + e) for w, s, e in words]})
    t += d + 0.3
TOTAL = t + 1.4
SC = {v['id']: (v['at'] - (0.4 if v['id'] == 's1' else 0.12), v['at'] + v['dur'] + 0.18) for v in VO}
SC['s12'] = (SC['s12'][0], TOTAL)
ORDER = [v['id'] for v in VO]
def word_at(sid, k):
    v = next(v for v in VO if v['id'] == sid); return v['words'][min(k, len(v['words']) - 1)][1]

# ---------- материалы ----------
def load(p): return Image.open(p).convert('RGB')
def cover(im, w, h):
    k = max(w / im.width, h / im.height); im = im.resize((int(im.width * k + 1), int(im.height * k + 1)), Image.LANCZOS)
    return im.crop(((im.width - w) // 2, (im.height - h) // 2, (im.width - w) // 2 + w, (im.height - h) // 2 + h))
def shadow(el, r=18, op=150, off=(0, 18)):
    sh = Image.new('RGBA', (el.width + r * 4, el.height + r * 4), (0, 0, 0, 0))
    m = el.getchannel('A').point(lambda v: v * op // 255); sh.paste((0, 0, 0, 255), (r * 2 + off[0], r * 2 + off[1]), m)
    sh = sh.filter(ImageFilter.GaussianBlur(r)); sh.alpha_composite(el, (r * 2, r * 2)); return sh
def tape(color, w=130, h=36, rot=-4):
    el = Image.new('RGBA', (w, h), color + (150,)); d = ImageDraw.Draw(el)
    for x in range(-h, w, 16): d.polygon([(x, 0), (x + 8, 0), (x + 8 + h, h), (x + h, h)], fill=(255, 255, 255, 70))
    for x in range(0, w, 6): d.line([(x, 0), (x + 3, 0)], fill=(0, 0, 0, 0))
    return el.rotate(rot, resample=Image.BICUBIC, expand=True)
def polaroid(im, w, h, tape_c=PINK, bottom=58, caption=None):
    card = Image.new('RGBA', (w + 28, h + 14 + bottom), (255, 253, 247, 255)); card.paste(cover(im, w, h), (14, 14))
    if caption:
        ImageDraw.Draw(card).text((card.width // 2, h + 14 + bottom // 2 + 2), caption, font=font(F_HAND, bottom * 0.62), fill=NINK, anchor='mm')
    el = shadow(card, 16, 160)
    tp = tape(tape_c, int(w * 0.38), 34, rnd.uniform(-6, 6)); el.alpha_composite(tp, (el.width // 2 - tp.width // 2, 32 - tp.height // 2 + 4))
    return el
_em = {}
def sticker(ch, size=140):
    k = (ch, size)
    if k not in _em:
        e = Image.new('RGBA', (200, 200), (0, 0, 0, 0)); ImageDraw.Draw(e).text((10, 10), ch, font=font(EMOJI, 160), embedded_color=True)
        e = e.crop(e.getbbox()).resize((size, size), Image.LANCZOS)
        pad = size // 8; base = Image.new('RGBA', (size + pad * 2, size + pad * 2), (0, 0, 0, 0)); base.alpha_composite(e, (pad, pad))
        a = base.getchannel('A').filter(ImageFilter.MaxFilter(15)).point(lambda v: 255 if v > 30 else 0)
        white = Image.new('RGBA', base.size, (255, 255, 255, 255)); white.putalpha(a)
        white.alpha_composite(base); _em[k] = shadow(white, 8, 140, (0, 8))
    return _em[k]
_neon = {}
def neon(text, fnt, size, color, pad=60):
    """неоновая трубка: широкое свечение + ядро светлее цвета"""
    k = (text, fnt, size, color)
    if k not in _neon:
        f = font(fnt, size); d0 = ImageDraw.Draw(Image.new('L', (1, 1)))
        bb = d0.textbbox((0, 0), text, font=f); tw, th = bb[2] - bb[0], bb[3] - bb[1]
        Wd, Hd = tw + pad * 2, th + pad * 2
        m = Image.new('L', (Wd, Hd), 0); ImageDraw.Draw(m).text((pad - bb[0], pad - bb[1]), text, font=f, fill=255)
        glow1 = m.filter(ImageFilter.GaussianBlur(size * 0.18)); glow2 = m.filter(ImageFilter.GaussianBlur(size * 0.06))
        out = Image.new('RGBA', (Wd, Hd), color + (0,))
        a = ImageChops.add(glow1.point(lambda v: min(255, v * 2)), glow2)
        out.putalpha(a)
        core = Image.new('RGBA', (Wd, Hd), mixc(color, (255, 255, 255), 0.65) + (255,)); core.putalpha(m)
        out.alpha_composite(core); _neon[k] = out
    return _neon[k]
def flick(tt, seed=0):
    """мигание неона при включении и редкие сбои"""
    q = int(tt * 30) + seed * 17
    return 0.35 if (q % 97) in (3, 4) else 1.0

GAL_N = ['autumn_path', 'cocoa', 'snow_trees', 'river_sunset', 'balloons', 'umbrella_rain', 'office_night', 'campfire', 'dacha_house', 'cake_candles', 'snow_window', 'autumn_leaves', 'ig_lake_sunset', 'ig_forest_path', 'keyboard_rgb', 'night_street']
GAL = [cover(load(ROOT / f'test/assets/real/{n}.jpg'), 260, 260) for n in GAL_N]
REGS = [('monet', 'Моне', PINK), ('kandinsky', 'Кандинский', CYAN), ('ma', 'Ма', LIME), ('film', 'Плёнка', YEL), ('matisse', 'Матисс', VIO), ('nocturne', 'Ноктюрн', PINK)]
REGP = {k: polaroid(load(ROOT / f'docs/img/{k}.jpg'), 240, 426, c, 50, n) for k, n, c in REGS}
INST = [polaroid(load(ROOT / f'test/assets/real/{n}.jpg'), 250, 270, c, 56, cap) for n, c, cap in
        (('ig_cocoa2', CYAN, 'какао'), ('ig_snow_tree', LIME, 'первый снег!'), ('keyboard_glow', PINK, 'дедлайн…'))]
COCOA = load(ROOT / 'test/assets/real/autumn_path.jpg')
def story(p, w=210, segs=3, on=1):
    im = cover(load(p), w, int(w * 16 / 9)).convert('RGBA'); d = ImageDraw.Draw(im)
    for i in range(segs):
        x0 = 10 + i * (w - 20) / segs; d.rounded_rectangle((x0 + 2, 10, x0 + (w - 20) / segs - 2, 15), radius=3, fill=(255, 255, 255, 230 if i < on else 110))
    m = Image.new('L', im.size, 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, im.width - 1, im.height - 1), radius=18, fill=255); im.putalpha(m)
    return shadow(im, 14, 160)
STORIES = [story(ROOT / 'test/assets/real/ig_lake_sunset.jpg', on=1), story(ROOT / 'test/assets/real/ig_rain_blue.jpg', on=2)]
POSTS = [polaroid(load(ROOT / f'test/assets/real/{n}.jpg'), 200, 200, c, 44, cap) for n, c, cap in (('ig_forest_path', YEL, 'утро'), ('ig_cake', PINK, 'др у Ани'))]
def login_note(nick_p, pass_p, pressed):
    card = Image.new('RGBA', (520, 470), NOTE + (255,)); d = ImageDraw.Draw(card)
    d.text((260, 62), 'окошко Instagram', font=font(F_HAND, 46), fill=(110, 95, 125), anchor='mm')
    nick = '@твой_ник'[:max(0, int(len('@твой_ник') * nick_p))]
    for i, (lab, val) in enumerate((('ник', nick), ('пароль', '•' * int(8 * pass_p)))):
        y = 130 + i * 110
        d.text((50, y), lab, font=font(F_SANS, 26), fill=(110, 95, 125))
        d.rounded_rectangle((44, y + 36, 476, y + 92), radius=14, fill=(255, 255, 255), outline=(200, 190, 210), width=2)
        d.text((64, y + 64), val, font=font(F_SANS, 30), fill=NINK, anchor='lm')
    bc = mixc(PINK, (255, 255, 255), 0.15 if pressed else 0)
    d.rounded_rectangle((44, 370, 476, 432), radius=31, fill=bc); d.text((260, 401), 'Войти', font=font(F_DISP, 30), fill=(255, 255, 255), anchor='mm')
    el = shadow(card, 16, 160); tp = tape(CYAN, 150, 36, -5); el.alpha_composite(tp, (el.width // 2 - tp.width // 2, 18))
    return el
CAP = {}
for n in ('form', 'insta', 'build', 'archive', 'tune'):
    d = A2 / f'cap_{n}'; CAP[n] = (d, json.load(open(d / 'times.json')))
_cc = {}
def cap_at(name, tt):
    d, times = CAP[name]; tt = cl(tt, 0, times[-1][1]); lo, hi = 0, len(times) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if times[mid][1] <= tt: lo = mid
        else: hi = mid - 1
    k = (name, lo)
    if k not in _cc:
        if len(_cc) > 24: _cc.clear()
        _cc[k] = load(d / times[lo][0])
    return _cc[k]
def cap_len(n): return CAP[n][1][-1][1]
def vframes(src, start, count, name):
    out = A4 / f'vf_{name}'; out.mkdir(exist_ok=True)
    if not (out / f'{count:05d}.jpg').exists():
        subprocess.run([FF, '-v', 'error', '-y', '-ss', str(start), '-i', str(src), '-frames:v', str(count), '-vf', f'fps={FPS},scale=540:960', '-q:v', '3', str(out / '%05d.jpg')], check=True)
    return out
MONET = vframes(next(AD.glob('day_Осенний*.mp4')), 3.5, 420, 'monet')
PARTY = vframes(next(AD.glob('day_День*.mp4')), 3.0, 420, 'party')
def vf(dp, i): return load(dp / f'{max(1, min(420, i)):05d}.jpg')

# ---------- доска и неоновые каракули ----------
def make_board():
    rng = np.random.default_rng(3)
    base = np.zeros((H, W, 3), np.float32) + np.array(BOARD, np.float32)
    yy, xx = np.mgrid[0:H, 0:W]
    vign = 1 - 0.45 * (((xx - W / 2) / (W * 0.75)) ** 2 + ((yy - H / 2) / (H * 0.8)) ** 2)
    base *= vign[..., None]; base += rng.normal(0, 4, (H, W, 1))
    img = Image.fromarray(np.clip(base, 0, 255).astype(np.uint8)).convert('RGBA'); d = ImageDraw.Draw(img)
    for y in range(11, H, 24):
        for x in range(11, W, 24): d.point((x, y), fill=(255, 255, 255, 20))
    return img
BOARD_IMG = make_board()
def star(cx, cy, r):
    pts = []
    for i in range(11):
        a = -math.pi / 2 + i * math.pi / 5; rr = r if i % 2 == 0 else r * 0.45; pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return pts
def heart(cx, cy, r):
    return [(cx + r * 16 * math.sin(t) ** 3 / 16, cy - r * (13 * math.cos(t) - 5 * math.cos(2 * t) - 2 * math.cos(3 * t) - math.cos(4 * t)) / 16) for t in np.linspace(0, 2 * math.pi, 40)]
def squiggle(x, y, w):
    return [(x + i * w / 30, y + 18 * math.sin(i / 30 * 4 * math.pi)) for i in range(31)]
DOODLES = [(star(170, 150, 46), YEL), (heart(1760, 180, 3.2), PINK), (squiggle(80, 960, 260), CYAN), (star(1830, 930, 34), LIME), ([(1600, 1010), (1660, 1050), (1720, 1000)], VIO), (heart(330, 990, 2.2), CYAN)]
def neon_lines(img, paths, alpha=1.0, width=5, prog=None):
    lay = Image.new('RGBA', (W // 2, H // 2), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    core = Image.new('RGBA', (W, H), (0, 0, 0, 0)); dc = ImageDraw.Draw(core)
    for i, (pts, c) in enumerate(paths):
        n = len(pts) if prog is None else max(2, int(len(pts) * cl(prog[i] if isinstance(prog, list) else prog)))
        p = pts[:n]
        if len(p) < 2: continue
        d.line([(x / 2, y / 2) for x, y in p], fill=c + (int(220 * alpha),), width=width * 2, joint='curve')
        dc.line(p, fill=mixc(c, (255, 255, 255), 0.55) + (int(255 * alpha),), width=width, joint='curve')
    g = lay.filter(ImageFilter.GaussianBlur(9)).resize((W, H), Image.BILINEAR)
    img.alpha_composite(g); img.alpha_composite(g); img.alpha_composite(core)

def put(img, el, cx, cy, ang=0, sc=1.0, al=1.0):
    if sc <= 0.01 or al <= 0.01: return
    e = el if abs(sc - 1) < 1e-3 else el.resize((max(1, int(el.width * sc)), max(1, int(el.height * sc))), Image.BILINEAR)
    if ang: e = e.rotate(ang, resample=Image.BICUBIC, expand=True)
    if al < 1: e = e.copy(); e.putalpha(e.getchannel('A').point(lambda v: int(v * al)))
    x, y = int(cx - e.width / 2), int(cy - e.height / 2)
    if x >= 0 and y >= 0 and x + e.width <= W and y + e.height <= H: img.alpha_composite(e, (x, y))
    else: img.paste(e, (x, y), e)
_ph = {}
def phone(img, screen, cx, cy, ang=0, sc=1.0, h=820, tape_c=CYAN):
    sw = int(h * screen.width / screen.height); scr = screen.resize((sw, h), Image.LANCZOS); bz = 15
    if (sw, h) not in _ph:
        body = Image.new('RGBA', (sw + bz * 2, h + bz * 2), (0, 0, 0, 0)); ImageDraw.Draw(body).rounded_rectangle((0, 0, body.width - 1, body.height - 1), radius=58, fill=(12, 10, 16, 255))
        m = Image.new('L', (sw, h), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, sw - 1, h - 1), radius=44, fill=255); _ph[(sw, h)] = (body, m)
    body, m = _ph[(sw, h)]; b = body.copy(); b.paste(scr, (bz, bz), m)
    ImageDraw.Draw(b).rounded_rectangle((b.width // 2 - 52, bz + 9, b.width // 2 + 52, bz + 32), radius=12, fill=(12, 10, 16, 255))
    el = shadow(b, 22, 170)
    tp = tape(tape_c, 150, 38, -8); el.alpha_composite(tp, (el.width - tp.width - 20, 18)); tp2 = tape(tape_c, 150, 38, 10); el.alpha_composite(tp2, (14, el.height - tp2.height - 26))
    put(img, el, cx, cy, ang, sc)
def hand(img, text, x, y, color=YEL, size=58, ang=-4, al=1.0, glow=True):
    el = neon(text, F_HAND, size, color, 40) if glow else None
    if not glow:
        f = font(F_HAND, size); bb = ImageDraw.Draw(img).textbbox((0, 0), text, font=f)
        el = Image.new('RGBA', (bb[2] - bb[0] + 20, bb[3] - bb[1] + 20), (0, 0, 0, 0)); ImageDraw.Draw(el).text((10 - bb[0], 10 - bb[1]), text, font=f, fill=color)
    put(img, el, x, y, ang, 1, al)
def arrow(x0, y0, x1, y1, bend=60):
    pts = []
    mx, my = (x0 + x1) / 2 - bend * (y1 - y0) / max(1, math.hypot(x1 - x0, y1 - y0)), (y0 + y1) / 2 + bend * (x1 - x0) / max(1, math.hypot(x1 - x0, y1 - y0))
    for i in range(25):
        t = i / 24; pts.append(((1 - t) ** 2 * x0 + 2 * (1 - t) * t * mx + t * t * x1, (1 - t) ** 2 * y0 + 2 * (1 - t) * t * my + t * t * y1))
    a = math.atan2(y1 - pts[-3][1], x1 - pts[-3][0])
    head = [(x1 - 26 * math.cos(a - 0.5), y1 - 26 * math.sin(a - 0.5)), (x1, y1), (x1 - 26 * math.cos(a + 0.5), y1 - 26 * math.sin(a + 0.5))]
    return pts, head
def beat(tt): ph = ((tt - 0.02) / (BEAT * 2)) % 1; return 1 + 0.03 * math.exp(-ph * 9)

# ---------- слова-вырезки ----------
SCRAP = [((255, 253, 247), NINK), (YEL, NINK), (PINK, (255, 255, 255)), (CYAN, NINK), (LIME, NINK), ((255, 253, 247), PINK)]
_sc = {}
def scrap(word, i, size):
    k = (word, i % len(SCRAP), size)
    if k not in _sc:
        bg, fg = SCRAP[i % len(SCRAP)]; f = font(F_DISP if i % 3 else F_DISP6, size); bb = ImageDraw.Draw(Image.new('L', (1, 1))).textbbox((0, 0), word, font=f)
        tw, th = bb[2] - bb[0], bb[3] - bb[1]; px, py = int(size * 0.32), int(size * 0.24)
        el = Image.new('RGBA', (tw + px * 2, th + py * 2), (0, 0, 0, 0)); d = ImageDraw.Draw(el)
        r2 = random.Random(hash(word) + i); jag = []
        for j in range(9): jag.append((j / 8 * el.width, r2.uniform(0, 5)))
        for j in range(9): jag.append((el.width - j / 8 * el.width, el.height - r2.uniform(0, 5)))
        d.polygon(jag, fill=bg + (255,)); d.text((px - bb[0], py - bb[1]), word, font=f, fill=fg)
        _sc[k] = shadow(el, 6, 150, (0, 6))
    return _sc[k]
def captions(img, tt, y=930, size=50, maxw=1500, cx=W / 2):
    v = next((v for v in VO if v['at'] - 0.1 <= tt <= v['at'] + v['dur'] + 0.35), None)
    if not v: return
    ws = v['words']; idx = max([i for i, w in enumerate(ws) if w[1] <= tt + 0.02] or [-1])
    # строки по ширине; показываем строку с текущим словом и предыдущую
    els = [(scrap(w[0], i + hash(v['id']) % 5, size), i) for i, w in enumerate(ws)]
    lines, cur, cw = [], [], 0
    for el, i in els:
        if cur and cw + el.width > maxw: lines.append(cur); cur, cw = [], 0
        cur.append((el, i)); cw += el.width - 10
    if cur: lines.append(cur)
    li = next((k for k, l in enumerate(lines) if any(i == idx for _, i in l)), 0)
    show = lines[max(0, li - 1):li + 1]
    yy = y - (len(show) - 1) * (size * 1.6) / 2
    for l in show:
        lw = sum(el.width - 10 for el, _ in l); x = cx - lw / 2
        for el, i in l:
            if i <= idx:
                age = tt - ws[i][1]; k = eb(age / 0.22); hot = i == idx
                rot = ((i * 37) % 9 - 4) * 0.9
                put(img, el, x + el.width / 2, yy + (1 - k) * 30, rot, (1.12 if hot else 1.0) * (0.7 + 0.3 * k))
            x += el.width - 10
        yy += size * 1.6

# ---------- сцены ----------
def frame_scene(tt, force=None):
    sid = ORDER[0]
    for k in ORDER:
        if tt >= SC[k][0]: sid = k
    if force: sid = force
    a, b = SC[sid]; lt = tt - a; L = b - a; bp = beat(tt)
    img = BOARD_IMG.copy()
    dim = 0.0; shake = (0, 0); cap = dict(y=950, size=48)
    # фоновые каракули мерцают в долю
    neon_lines(img, DOODLES, alpha=0.42 + 0.18 * (bp - 1) / 0.03 * 0.3)
    if sid == 's1':   # шёпот: темно, луч фонарика на телефоне с галереей
        dim = 0.55
        sh = Image.new('RGBA', (W, H), (0, 0, 0, 0))
        g = Image.new('RGBA', (W, H), (0, 0, 0, 0)); ImageDraw.Draw(g)
        for i, gimg in enumerate(GAL[:9]):
            r, c = divmod(i, 3); put(img, shadow(gimg.convert('RGBA'), 6, 120, (0, 4)), 1260 + c * 230 - 230, 300 + r * 230 + 60 - lt * 10, 0, 0.82)
        hand(img, 'псс…', 520, 380, CYAN, 120, -8, eo(lt / 0.5))
    elif sid == 's2':  # галерея листается, фото выцветают, вопрос
        for i in range(16):
            r, c = divmod(i, 4); gray = cl((lt - 2.6) / 1.4)
            g = GAL[i]; g = Image.blend(g, g.convert('L').convert('RGB'), gray) if gray > 0 else g
            yy = 140 + r * 250 - (lt * 70) % 250
            put(img, shadow(g.convert('RGBA'), 6, 110, (0, 4)), 1100 + c * 230 - 230, yy + 100, 0, 0.85)
        hand(img, 'тысячи фоток…', 480, 330, YEL, 84, -5, eo((lt - 0.8) / 0.4))
        if lt > word_at('s2', 6) - a: put(img, neon('?', F_DISP, 300, PINK), 1520, 520, 8, eb((tt - word_at('s2', 6)) / 0.3), flick(tt, 2))
        cap = dict(y=880, size=46, maxw=900)
    elif sid == 's3':  # СТОП! → неоновая вывеска с логотипом
        ws = word_at('s3', 2)
        if tt < ws:
            k = eb(lt / 0.18); shake = (int(14 * math.sin(lt * 90) * (1 - cl(lt / 0.5))), int(10 * math.cos(lt * 70) * (1 - cl(lt / 0.5))))
            put(img, neon('СТОП!', F_DISP, 230, PINK), W / 2, 430, -4, 0.6 + 0.4 * k, flick(tt))
            put(img, sticker('✋', 170), 1500, 280, 12, eb(lt / 0.3))
        else:
            k = eb((tt - ws) / 0.4)
            put(img, neon('Послевкусие', F_DISP, 150, PINK), W / 2, 420, -2, 0.75 + 0.25 * k, (0.25 if (tt - ws) < 0.12 else 1) * flick(tt, 5))
            for i, (e, x, y) in enumerate((('✨', 380, 230), ('💜', 1560, 260), ('⭐', 300, 650), ('🎞️', 1620, 640))):
                put(img, sticker(e, 110), x, y, (i - 1.5) * 10, eb((tt - ws - 0.15 - i * 0.08) / 0.35))
    elif sid == 's4':  # не картинка, а ощущение
        sw = word_at('s4', 5)
        pol = polaroid(COCOA, 360, 360, YEL, 64, 'просто фото')
        put(img, pol, 620, 470, -5, eb(lt / 0.4))
        if tt > word_at('s4', 3):  # «не картинку» — зачёркнуто маркером
            pr = cl((tt - word_at('s4', 3)) / 0.35)
            neon_lines(img, [([(420, 300), (820, 650)], PINK), ([(820, 300), (420, 650)], PINK)], 1.0, 8, [pr, cl(pr * 2 - 1)])
        if tt > sw:
            k = eb((tt - sw) / 0.45); fr = vf(MONET, int((tt - sw) * FPS) + 60)
            put(img, polaroid(fr, 300, 533, PINK, 60, 'ощущение'), 1330, 520, 4, 0.6 + 0.4 * k, k)
            hand(img, 'вот!', 1660, 230, LIME, 90, 10, k)
        cap = dict(y=965, size=46)
    elif sid == 's5':  # запись: телефон и заметки маркером
        k = eb(lt / 0.45); phone(img, cap_at('form', lt * cap_len('form') / max(1, L - 0.4)), 1300, 540 + (1 - k) * 600, -3, bp)
        notes = [('пара фраз', 0, 470, 260, CYAN), ('фотки', 6, 420, 470, LIME), ('та самая песня', 9, 520, 680, PINK)]
        for txt, wi, x, y, c in notes:
            ts = word_at('s5', wi)
            if tt > ts:
                kk = eo((tt - ts) / 0.3); hand(img, txt, x, y, c, 74, -4, kk)
                pts, head = arrow(x + 230, y + 10, 1020, y + 40, 50); neon_lines(img, [(pts, c), (head, c)], kk, 5, [cl((tt - ts) / 0.4), cl((tt - ts - 0.3) / 0.2)])
        cap = dict(y=900, size=42, maxw=820, cx=520)
    elif sid == 's6':  # магия: три заметки-анализа
        put(img, neon('магия', F_HAND, 150, VIO), W / 2, 170, -3, eb(lt / 0.3), flick(tt, 7))
        items = [('Текст', 'настроение', 3, CYAN, '📝'), ('Фото', 'свет и цвет', 7, LIME, '🖼️'), ('Песня', 'темп · громкость · лад', 12, PINK, '🎵')]
        for i, (ttl, sub, wi, c, em) in enumerate(items):
            ts = word_at('s6', wi)
            if tt < ts - 0.1: continue
            kk = eb((tt - ts + 0.1) / 0.4)
            card = Image.new('RGBA', (440, 420), NOTE + (255,)); d = ImageDraw.Draw(card)
            d.text((220, 250), ttl, font=font(F_DISP, 58), fill=NINK, anchor='mm'); d.text((220, 320), sub, font=font(F_HAND, 44), fill=(110, 95, 125), anchor='mm')
            if i == 2:
                for jx in range(24):
                    hh = 10 + 34 * abs(math.sin(jx * 0.7 + tt * 9)); d.rounded_rectangle((52 + jx * 14, 375 - hh / 2, 60 + jx * 14, 375 + hh / 2), radius=3, fill=PINK)
            if i == 1:
                for jx, col in enumerate([(217, 165, 90), (106, 138, 48), (47, 79, 162), (232, 178, 58), (30, 27, 24)]): d.rounded_rectangle((70 + jx * 62, 355, 120 + jx * 62, 395), radius=8, fill=col)
            if i == 0:
                for jx, wdt in enumerate([260, 200]): d.line([(90, 362 + jx * 20), (90 + wdt, 362 + jx * 20)], fill=(200, 190, 215), width=8)
            s = sticker(em, 120); card.alpha_composite(s, (220 - s.width // 2, 40))
            el = shadow(card, 14, 150); tp = tape(c, 140, 36, (i - 1) * 6); el.alpha_composite(tp, (el.width // 2 - tp.width // 2, 20))
            put(img, el, 420 + i * 540, 560 + (1 - kk) * 300, (i - 1) * 3, (0.9 + 0.1 * kk) * (bp if tt > ts + 0.5 else 1))
        cap = dict(y=990, size=40, maxw=1700)
    elif sid == 's7':  # БАМ! → клип дня в полароиде, ноты в бит
        bam = word_at('s7', 1)
        if tt < bam + 0.55:
            k = eb((tt - bam + 0.05) / 0.2) if tt > bam - 0.05 else 0
            shake = (int(16 * math.sin(lt * 80) * k * (1 - cl((tt - bam) / 0.5))), int(12 * math.cos(lt * 66) * k * (1 - cl((tt - bam) / 0.5))))
            if k: put(img, neon('БАМ!', F_DISP, 260, YEL), W / 2, 460, -6, 0.5 + 0.5 * k, flick(tt, 3))
            if k and tt - bam < 0.12: img.alpha_composite(Image.new('RGBA', (W, H), (255, 255, 255, int(200 * (1 - (tt - bam) / 0.12)))))
        else:
            k = eb((tt - bam - 0.55) / 0.45); fr = vf(MONET, int((tt - bam - 0.55) * FPS) + 1)
            z = 1 + 0.035 * math.exp(-(((tt) / (BEAT * 2)) % 1) * 7)
            put(img, polaroid(fr, 420, 747, PINK, 66, 'клип твоего дня'), W / 2, 540, -2, (0.7 + 0.3 * k) * z * 0.98, k)
            for i, (e, x, y) in enumerate((('🎵', 520, 330), ('🎶', 1420, 300), ('🎧', 460, 760), ('🔥', 1460, 780))):
                ph = ((tt / (BEAT * 2)) + i * 0.25) % 1
                put(img, sticker(e, 110), x, y - 20 * math.exp(-ph * 6), (i - 1.5) * 12, k)
            if tt > word_at('s7', 7): hand(img, 'в бит!', 1530, 520, CYAN, 96, 8, eo((tt - word_at('s7', 7)) / 0.3))
        cap = dict(y=1010, size=40, maxw=1600)
    elif sid == 's8':  # шесть стилей на доске
        names = [2, 3, 4, 5, 5, 6]
        for i, (key, name, c) in enumerate(REGS):
            ts = word_at('s8', names[i]) if i < 4 else word_at('s8', 6) + (i - 4) * 0.25
            if tt < ts - 0.05: continue
            kk = eb((tt - ts + 0.05) / 0.35)
            put(img, REGP[key], 260 + i * 280, 470 + (i % 2) * 40 + (1 - kk) * 200, (-6 + (i * 5) % 12), (0.62 + 0.04 * kk) * (bp if i == 5 else 1), min(1, kk * 1.4))
        if lt > L - 2.2: hand(img, 'каждый день — в своём', W / 2, 160, LIME, 80, -2, eo((lt - (L - 2.2)) / 0.4))
        cap = dict(y=1000, size=40, maxw=1700)
    elif sid == 's9':  # ползунок → пересборка, объяснение
        phone(img, cap_at('tune', cl(lt * cap_len('tune') / max(1, L - 0.2), 0, cap_len('tune'))), 1320, 540, 2, bp, tape_c=LIME)
        hand(img, 'двигаешь', 560, 360, YEL, 96, -6, eo((lt - 1.2) / 0.3))
        if tt > word_at('s9', 9): hand(img, 'всё объяснено!', 560, 600, LIME, 80, -3, eo((tt - word_at('s9', 9)) / 0.3))
        cap = dict(y=880, size=42, maxw=820, cx=560)
    elif sid == 's10a':  # вход: ник и пароль в окошке Instagram
        put(img, neon('Войти через Instagram', F_DISP, 70, CYAN), 660, 190, -2, eb(lt / 0.3), flick(tt, 9))
        put(img, sticker('⚡', 100), 1290, 150, 14, eb((lt - 0.2) / 0.3))
        np_ = cl((tt - word_at('s10a', 8)) / 0.9); pp = cl((tt - word_at('s10a', 10)) / 0.6); pressed = tt > word_at('s10a', 12)
        put(img, login_note(np_, pp, pressed), 620, 600, -2, eb((lt - 0.3) / 0.4) * (0.97 if pressed and tt - word_at('s10a', 12) < 0.15 else 1))
        if tt > word_at('s10a', 8): hand(img, 'ник + пароль — и всё!', 1300, 420, LIME, 76, -5, eo((tt - word_at('s10a', 8)) / 0.3))
        if tt > word_at('s10a', 12):
            kk = eb((tt - word_at('s10a', 12)) / 0.5); phone(img, cap_at('insta', 0.4), 1560, 720 + (1 - kk) * 600, -3, 0.62 * bp, tape_c=PINK)
        cap = dict(y=1000, size=40, maxw=1500, cx=760)
    elif sid == 's10b':  # день из публикаций, сторис и мгновений
        cols = [('публикации', 8, 380, PINK), ('сторис', 9, 960, CYAN), ('мгновения', 11, 1540, LIME)]
        for k_, (lab, wi, x, c) in enumerate(cols):
            ts = word_at('s10b', wi)
            if tt < ts - 0.1: continue
            kk = eb((tt - ts + 0.1) / 0.35)
            put(img, scrap(lab, k_ * 2 + 1, 46), x, 170, (k_ - 1) * 3, kk)
            if k_ == 0:
                for q, el in enumerate(POSTS): put(img, el, x - 110 + q * 220, 470 + q * 40, -6 + q * 10, 0.95 * kk)
            elif k_ == 1:
                for q, el in enumerate(STORIES): put(img, el, x - 100 + q * 200, 520, -4 + q * 8, 0.95 * kk)
            else:
                out = eo((tt - word_at('s10b', 17) - 0.2) / 0.6) if tt > word_at('s10b', 17) else 0
                for q in range(2):
                    put(img, INST[q], x - 110 + q * 210, 500 + q * 30, -8 + q * 12, 0.62 * kk * (1 - 0.4 * out), 1 - out * 0.85)
                if out > 0: put(img, sticker('💨', 120), x + 150, 360, 0, eb((tt - word_at('s10b', 17)) / 0.3))
                put(img, sticker('⚡', 80), x + 200, 120, 12, kk)
        cap = dict(y=1000, size=40, maxw=1600)
    elif sid == 's10c':  # утро, обед, вечер — страница дня готова
        phone(img, cap_at('build', cl(lt * cap_len('build') / max(1, L), 0, cap_len('build'))), 1420, 540, -2, bp, tape_c=YEL)
        for k_, (lab, wi, y, c) in enumerate((('утро', 0, 300, YEL), ('обед', 1, 460, CYAN), ('вечер', 2, 620, PINK))):
            ts = word_at('s10c', wi)
            if tt > ts - 0.05:
                hand(img, lab, 420, y, c, 110, -4, eo((tt - ts + 0.05) / 0.25))
                if k_ < 2: pts, head = arrow(470, y + 50, 470, y + 110, -60); neon_lines(img, [(pts, c)], 0.9, 4, cl((tt - ts) / 0.4))
        if tt > word_at('s10c', 6): pts, head = arrow(620, 640, 1080, 560, 80); neon_lines(img, [(pts, LIME), (head, LIME)], 1, 6, [cl((tt - word_at('s10c', 6)) / 0.4), cl((tt - word_at('s10c', 6) - 0.35) / 0.2)])
        cap = dict(y=900, size=42, maxw=820, cx=560)
    elif sid == 's11':  # никакого фишинга, данные остаются у тебя
        phone(img, cap_at('archive', lt * 1.3), 1460, 540, -2, bp, tape_c=YEL)
        lock = [(1010, 300), (1010, 230), (1035, 190), (1080, 178), (1125, 190), (1150, 230), (1150, 300)]
        body = [(980, 300), (1180, 300), (1180, 430), (980, 430), (980, 300)]
        neon_lines(img, [(lock, LIME), (body, LIME)], 1.0, 7, [cl(lt / 0.6), cl((lt - 0.3) / 0.5)])
        items = [('никакого фишинга', 1, 300, 2), ('пароль видит только Instagram', 3, 470, 3), ('мы его даже не видим', 11, 610, 0), ('фото и записи — у тебя', 17, 760, 4)]
        for lab, wi, y, col in items:
            ts = word_at('s11', wi)
            if tt > ts - 0.05:
                put(img, scrap(lab, col, 46), 520, y, ((wi * 7) % 7 - 3) * 0.8, eb((tt - ts + 0.05) / 0.3))
        if tt > word_at('s11', 2): put(img, sticker('🛡️', 120), 880, 250, -10, eb((tt - word_at('s11', 2)) / 0.3))
        cap = dict(y=960, size=38, maxw=900, cx=520)
    elif sid == 's12':  # финал: неоновая вывеска + шёпот
        fr = vf(PARTY, int(lt * FPS) + 1)
        put(img, polaroid(fr, 230, 409, CYAN, 46, 'твой день'), 330, 560, -9, eb((lt - 0.3) / 0.4))
        put(img, polaroid(vf(MONET, int(lt * FPS) + 100), 230, 409, LIME, 46, 'и этот'), 1590, 560, 8, eb((lt - 0.45) / 0.4))
        k = eb(lt / 0.3)
        put(img, neon('Послевкусие', F_DISP, 140, PINK), W / 2, 420, -2, 0.7 + 0.3 * k, flick(tt, 11) * (0.3 if lt < 0.1 else 1))
        ws = word_at('s12', 1)
        if tt > ws: hand(img, 'запомни, как ощущался день', W / 2, 600, YEL, 80, -2, eo((tt - ws) / 0.4)); dim = 0.0
        if lt > 2.4:
            put(img, scrap('khaan011.github.io/hackaton-genezis', 3, 34), W / 2, 760, -1, eb((lt - 2.4) / 0.4))
        cap = None
    if cap: captions(img, tt, **cap)
    if dim: img.alpha_composite(Image.new('RGBA', (W, H), (8, 5, 12, int(255 * dim * 0.5))))
    out = img.convert('RGB')
    if shake != (0, 0): out = ImageChops.offset(out, *shake)
    return out

# ---------- переходы: рваная бумага, хлёсткий сдвиг, зум со вспышкой, полоса скотча ----------
TR = 0.46
KINDS = ['tear', 'whip', 'zoom', 'tape']
_jag = [rnd.uniform(-38, 38) for _ in range(40)]
def smear(im, k):
    if k < 0.05: return im
    w = max(8, int(W / (1 + 30 * k)))
    return im.resize((w, H), Image.BILINEAR).resize((W, H), Image.BILINEAR)
def transition(A, B, p, kind):
    e = 0.5 - 0.5 * math.cos(math.pi * p)
    if kind == 'whip':
        sp = math.sin(math.pi * p)
        out = Image.new('RGB', (W, H), BOARD); off = int(e * W)
        out.paste(smear(A, sp), (-off, 0)); out.paste(smear(B, sp), (W - off, 0)); return out
    if kind == 'zoom':
        if p < 0.5:
            z = 1 + 0.6 * (p / 0.5) ** 2; a = A.resize((int(W * z), int(H * z)), Image.BILINEAR)
            out = a.crop(((a.width - W) // 2, (a.height - H) // 2, (a.width - W) // 2 + W, (a.height - H) // 2 + H))
        else:
            z = 1.3 - 0.3 * eo((p - 0.5) / 0.5); b = B.resize((int(W * z), int(H * z)), Image.BILINEAR)
            out = b.crop(((b.width - W) // 2, (b.height - H) // 2, (b.width - W) // 2 + W, (b.height - H) // 2 + H))
        fl = max(0, 1 - abs(p - 0.5) / 0.18)
        return Image.blend(out, Image.new('RGB', (W, H), (255, 255, 255)), 0.85 * fl) if fl > 0 else out
    if kind == 'tear':  # B проступает из-под рваного края бумаги
        x = -120 + e * (W + 240)
        pts = [(x + _jag[i] + 30 * math.sin(i * 0.9), i * H / 39) for i in range(40)]
        m = Image.new('L', (W, H), 0); ImageDraw.Draw(m).polygon([(-10, -10)] + [(px, py) for px, py in pts] + [(-10, H + 10)], fill=255)
        out = A.copy(); out.paste(B, (0, 0), m)
        edge = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(edge)
        d.line([(px + 10, py + 6) for px, py in pts], fill=(0, 0, 0, 120), width=26)
        d.line(pts, fill=(255, 251, 240, 255), width=16)
        o = out.convert('RGBA'); o.alpha_composite(edge.filter(ImageFilter.GaussianBlur(1.2))); return o.convert('RGB')
    # tape: широкая полоса скотча проезжает по диагонали и меняет кадр под собой
    out = (A if p < 0.5 else B).copy().convert('RGBA')
    band = Image.new('RGBA', (int(W * 1.6), 520), (0, 0, 0, 0)); d = ImageDraw.Draw(band)
    col = [PINK, CYAN, LIME, YEL][int(p * 1000) % 1 + 0]
    d.rectangle((0, 0, band.width, band.height), fill=col + (235,))
    for xx in range(-520, band.width, 70): d.polygon([(xx, 0), (xx + 34, 0), (xx + 34 + 520, 520), (xx + 520, 520)], fill=(255, 255, 255, 60))
    band = band.rotate(-14, resample=Image.BICUBIC, expand=True)
    cx = -band.width / 2 + e * (W + band.width); out.alpha_composite(band, (int(cx - band.width / 2 + W / 2 - W / 2), int(H / 2 - band.height / 2)))
    return out.convert('RGB')
def frame(tt):
    for k in range(1, len(ORDER)):
        st = SC[ORDER[k]][0]
        if st - TR / 2 <= tt < st + TR / 2:
            p = (tt - (st - TR / 2)) / TR
            return transition(frame_scene(tt, ORDER[k - 1]), frame_scene(tt, ORDER[k]), p, KINDS[k % len(KINDS)])
    return frame_scene(tt)

if __name__ == '__main__':
    silent = A4 / 'video.mp4'; n = int(TOTAL * FPS)
    pr = subprocess.Popen([FF, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                           '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-pix_fmt', 'yuv420p', str(silent)], stdin=subprocess.PIPE)
    for i in range(n):
        pr.stdin.write(frame(i / FPS).tobytes())
        if i % 300 == 0: print(f'кадр {i}/{n}', flush=True)
    pr.stdin.close(); pr.wait()
    ins = ['-i', str(silent), '-i', str(ROOT / 'test/assets/real/music/krux.mp3')]
    fc = [f"[1:a]aloop=loop=1:size=2147483647,atrim=start={MUSIC_AT}:duration={TOTAL},asetpts=PTS-STARTPTS,afade=t=in:d=0.4,afade=t=out:st={TOTAL - 2}:d=2,volume=0.5[mus]"]
    vo = []
    for i, v in enumerate(VO):
        ins += ['-i', str(A4 / f"{v['id']}.mp3")]; ms = int(v['at'] * 1000)
        fc.append(f"[{i + 2}:a]adelay={ms}|{ms},volume=1.35[v{i}]"); vo.append(f'[v{i}]')
    fc.append(f"{''.join(vo)}amix=inputs={len(vo)}:normalize=0,asplit[a1][a2]")
    fc.append("[mus][a1]sidechaincompress=threshold=0.025:ratio=6:attack=12:release=280[duck]")
    fc.append(f"[duck][a2]amix=inputs=2:normalize=0,alimiter=limit=0.95,atrim=duration={TOTAL}[a]")
    dst = ROOT / 'docs/demo.mp4'
    subprocess.run([FF, '-v', 'error', '-y', *ins, '-filter_complex', ';'.join(fc), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(dst)], check=True)
    print('готово:', dst, f'{TOTAL:.1f} с')
