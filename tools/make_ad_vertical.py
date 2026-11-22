#!/usr/bin/env python3
"""Вертикальный рекламный ролик «Послевкусия» 1080×1920 в стиле TikTok: яркие градиенты, карточки-мгновения,
телефон с живым интерфейсом, титры по словам (тайминг слов из озвучки), удары в долю, финальная карточка.
Кадры рисуются Pillow и уходят в ffmpeg. Запуск: uv run --with pillow --with numpy python tools/make_ad_vertical.py
Входы: test/out/ad2/v1..v8.mp3 + .json (озвучка ElevenLabs с таймингом символов), test/out/ad2/cap_*/ (tools/capture_phone.js),
test/out/ad/day_*.mp4 (видео дней из приложения), docs/img/*.jpg, test/assets/real/*.jpg, музыка dance.mp3 (CC0)."""
import json, math, os, subprocess, pathlib, random
import numpy as np
from PIL import Image, ImageDraw, ImageFont, ImageFilter

ROOT = pathlib.Path(__file__).resolve().parent.parent
A2 = ROOT / 'test/out/ad2'; AD = ROOT / 'test/out/ad'
FF = os.path.expanduser('~/.local/bin/ffmpeg'); FP = FF.replace('ffmpeg', 'ffprobe')
W, H, FPS = 1080, 1920, 30
BEAT = 60 / 171.0; MUSIC_AT = 13.257
F_BOLD = str(AD / 'mont800.ttf'); F_MED = str(AD / 'mont500.ttf'); F_SERIF = str(AD / 'lora-it500.ttf')
EMOJI = '/System/Library/Fonts/Apple Color Emoji.ttc'
rnd = random.Random(7)

def font(p, s): return ImageFont.truetype(p, s)
def dur(f): return float(subprocess.check_output([FP, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(f)]))
def ease_out(x): x = max(0, min(1, x)); return 1 - (1 - x) ** 3
def ease_back(x):
    x = max(0, min(1, x)); c1 = 1.70158; c3 = c1 + 1
    return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2
def hexc(h): h = h.lstrip('#'); return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))

# ---------- озвучка и слова ----------
LINES = json.load(open(A2 / 'lines.json'))
VO, t = [], 0.6
for vid, txt in LINES:
    d = dur(A2 / f'{vid}.mp3')
    al = json.load(open(A2 / f'{vid}.json')) if (A2 / f'{vid}.json').exists() else None
    words = []
    if al:
        chars, st, en = al['characters'], al['character_start_times_seconds'], al['character_end_times_seconds']
        cur, cs = '', None; inbr = False
        for ch, s, e in zip(chars, st, en):
            if ch == '[': inbr = True
            if inbr:
                if ch == ']': inbr = False
                continue
            if ch.isspace():
                if cur.strip(): words.append((cur.strip(), cs, e))
                cur, cs = '', None
            else:
                if cs is None: cs = s
                cur += ch; last_e = e
        if cur.strip(): words.append((cur.strip(), cs, last_e))
    else:
        clean = [w for w in txt.replace('[', ' [').split() if not w.startswith('[') and not w.endswith(']')]
        step = d / max(1, len(clean)); words = [(w, i * step, (i + 1) * step) for i, w in enumerate(clean)]
    words = [(w, s, e) for w, s, e in words if any(c.isalnum() for c in w)]
    VO.append({'id': vid, 'at': t, 'dur': d, 'words': [(w, t + s, t + e) for w, s, e in words]})
    t += d + 0.25
TOTAL = t + 1.4
SC = {v['id']: (v['at'], v['at'] + v['dur'] + 0.25) for v in VO}
SC['v8'] = (SC['v8'][0], TOTAL)

# ---------- материалы ----------
def load(p, size=None):
    im = Image.open(p).convert('RGB')
    if size: im = im.resize(size, Image.LANCZOS)
    return im
def cover(im, w, h):
    k = max(w / im.width, h / im.height); im = im.resize((int(im.width * k + 1), int(im.height * k + 1)), Image.LANCZOS)
    return im.crop(((im.width - w) // 2, (im.height - h) // 2, (im.width - w) // 2 + w, (im.height - h) // 2 + h))
def polaroid(p, w=420):
    ph = cover(load(p), w, int(w * 1.12))
    card = Image.new('RGBA', (w + 36, int(w * 1.12) + 110), (255, 253, 248, 255))
    card.paste(ph, (18, 18))
    sh = Image.new('RGBA', (card.width + 60, card.height + 60), (0, 0, 0, 0))
    m = Image.new('L', card.size, 110); sh.paste((0, 0, 0, 255), (30, 40), m); sh = sh.filter(ImageFilter.GaussianBlur(18))
    sh.alpha_composite(card, (30, 30))
    return sh
INST = ['ig_cocoa2', 'ig_snow_tree', 'keyboard_glow', 'ig_lake_sunset', 'ig_balloons', 'umbrella_rain']
CARDS = [polaroid(ROOT / f'test/assets/real/{n}.jpg') for n in INST]
CAPS = ['какао перед прогулкой', 'первый снег!', 'ночь перед дедлайном', 'закат у озера', 'др у Ани 🎉', 'домой под дождём']
REGS = [('monet', 'Моне', '#ffb347'), ('kandinsky', 'Кандинский', '#3d5afe'), ('ma', 'Ма', '#f5f0e6'), ('film', 'Плёнка', '#ff7a45'), ('matisse', 'Матисс', '#00c2d1'), ('nocturne', 'Ноктюрн', '#3b2a6b')]
REGIMG = {k: load(ROOT / f'docs/img/{k}.jpg') for k, _, _ in REGS}

def cap_frames(name):
    d = A2 / f'cap_{name}'; times = json.load(open(d / 'times.json'))
    return d, times
CAP = {n: cap_frames(n) for n in ('insta', 'build', 'archive')}
_capcache = {}
def cap_at(name, tt):
    d, times = CAP[name]; tt = max(0, min(tt, times[-1][1]))
    i = 0
    lo, hi = 0, len(times) - 1
    while lo < hi:
        mid = (lo + hi + 1) // 2
        if times[mid][1] <= tt: lo = mid
        else: hi = mid - 1
    key = (name, lo)
    if key not in _capcache:
        if len(_capcache) > 40: _capcache.clear()
        _capcache[key] = Image.open(d / times[lo][0]).convert('RGB')
    return _capcache[key]

def video_frames(src, start, count, name):
    out = A2 / f'vf_{name}'; out.mkdir(exist_ok=True)
    if not (out / f'{count:05d}.jpg').exists():
        subprocess.run([FF, '-v', 'error', '-y', '-ss', str(start), '-i', str(src), '-frames:v', str(count), '-vf', f'fps={FPS},scale={W}:{H}', '-q:v', '3', str(out / '%05d.jpg')], check=True)
    return out
MONET = video_frames(next(AD.glob('day_Осенний*.mp4')), 3.5, 400, 'monet')
PARTY = video_frames(next(AD.glob('day_День*.mp4')), 3.0, 400, 'party')

# ---------- фон ----------
GRADS = {'v1': ('#ff2e88', '#ff9a3c'), 'v2': ('#7b2ff7', '#2bd2ff'), 'v3': ('#ff5f6d', '#ffc371'), 'v4': ('#00c9a7', '#845ec2'),
         'v5': ('#ff9a3c', '#ff2e88'), 'v6': ('#141018', '#141018'), 'v7': ('#2bd2ff', '#7b2ff7'), 'v8': ('#141018', '#3b1d5e')}
_gcache = {}
def gradient(a, b, tt):
    key = (a, b)
    if key not in _gcache:
        ca, cb = np.array(hexc(a), float), np.array(hexc(b), float)
        yy, xx = np.mgrid[0:H * 2:4, 0:W:4]
        k = ((yy / (H * 2)) * 0.8 + (xx / W) * 0.2)[..., None]
        k = 0.5 - 0.5 * np.cos(k * 2 * math.pi)
        g = (ca * (1 - k) + cb * k).astype(np.uint8)
        _gcache[key] = Image.fromarray(g).resize((W, H * 2), Image.BILINEAR)
    off = int((math.sin(tt * 0.6) * 0.5 + 0.5) * H)
    return _gcache[key].crop((0, off, W, off + H)).copy()
BLOBS = [(rnd.random(), rnd.random(), rnd.uniform(160, 320), rnd.uniform(0.2, 0.5)) for _ in range(6)]
def blobs(img, tt, alpha=60):
    lay = Image.new('RGBA', (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(lay)
    for i, (x, y, r, sp) in enumerate(BLOBS):
        cx = (x + 0.08 * math.sin(tt * sp + i)) * W; cy = (y + 0.06 * math.cos(tt * sp * 1.3 + i)) * H
        d.ellipse((cx - r, cy - r, cx + r, cy + r), fill=(255, 255, 255, alpha))
    lay = lay.filter(ImageFilter.GaussianBlur(70))
    img.paste(lay, (0, 0), lay)

# ---------- элементы ----------
def paste_rot(img, el, cx, cy, ang=0, scale=1.0, alpha=1.0):
    if scale <= 0.01 or alpha <= 0.01: return
    e = el
    if scale != 1: e = e.resize((max(1, int(e.width * scale)), max(1, int(e.height * scale))), Image.BILINEAR)
    if ang: e = e.rotate(ang, resample=Image.BICUBIC, expand=True)
    if alpha < 1:
        a = e.getchannel('A').point(lambda v: int(v * alpha)); e = e.copy(); e.putalpha(a)
    img.paste(e, (int(cx - e.width / 2), int(cy - e.height / 2)), e)

PHONE_W = 640
def phone(img, screen, cx, cy, ang=0, scale=1.0):
    sw = PHONE_W; sh = int(sw * screen.height / screen.width)
    scr = screen.resize((sw, sh), Image.LANCZOS)
    bez = 22
    body = Image.new('RGBA', (sw + bez * 2, sh + bez * 2), (0, 0, 0, 0)); d = ImageDraw.Draw(body)
    d.rounded_rectangle((0, 0, body.width - 1, body.height - 1), radius=78, fill=(18, 16, 20, 255))
    m = Image.new('L', (sw, sh), 0); ImageDraw.Draw(m).rounded_rectangle((0, 0, sw - 1, sh - 1), radius=58, fill=255)
    body.paste(scr, (bez, bez), m)
    d.rounded_rectangle((body.width // 2 - 70, bez + 14, body.width // 2 + 70, bez + 44), radius=15, fill=(18, 16, 20, 255))
    sh_ = Image.new('RGBA', (body.width + 120, body.height + 120), (0, 0, 0, 0))
    sm = Image.new('L', body.size, 0); ImageDraw.Draw(sm).rounded_rectangle((0, 0, body.width - 1, body.height - 1), radius=78, fill=120)
    sh_.paste((0, 0, 0, 255), (60, 80), sm); sh_ = sh_.filter(ImageFilter.GaussianBlur(28)); sh_.alpha_composite(body, (60, 60))
    paste_rot(img, sh_, cx, cy, ang, scale)

def outlined(d, xy, txt, f, fill, stroke=(20, 16, 24), sw=8, anchor='mm'):
    d.text(xy, txt, font=f, fill=fill, stroke_width=sw, stroke_fill=stroke, anchor=anchor)

def karaoke(img, tt, y=300):
    """титры по словам: фраза из 3–4 слов, текущее слово — жёлтое и крупнее"""
    v = next((v for v in VO if v['at'] - 0.05 <= tt <= v['at'] + v['dur'] + 0.2), None)
    if not v or not v['words']: return
    ws = v['words']; idx = max([i for i, w in enumerate(ws) if w[1] <= tt] or [0])
    g0 = (idx // 3) * 3; group = ws[g0:g0 + 3]
    d = ImageDraw.Draw(img)
    parts = [(w[0].upper(), i + g0 == idx and tt <= w[2] + 0.25) for i, w in enumerate(group)]
    def width(line, sz): return sum(d.textlength(p + ' ', font=font(F_BOLD, int(sz * (1.14 if hot else 1)))) for p, hot in line)
    lines = [parts] if width(parts, 92) <= W - 110 else [parts[:2], parts[2:]] if len(parts) > 2 else [parts[:1], parts[1:]]
    lines = [l for l in lines if l]
    yy = y - (len(lines) - 1) * 60
    for line in lines:
        sz = min(92, int(92 * (W - 110) / max(1, width(line, 92))))
        x = (W - width(line, sz)) / 2
        for p, hot in line:
            f_ = font(F_BOLD, int(sz * (1.14 if hot else 1)))
            outlined(d, (x, yy), p, f_, (255, 230, 60) if hot else (255, 255, 255), anchor='lm')
            x += d.textlength(p + ' ', font=f_)
        yy += int(sz * 1.25)

def chip(img, txt, cx, cy, bg=(255, 255, 255), fg=(20, 16, 24), size=44, alpha=1.0, emoji=None):
    f = font(F_BOLD, size); d0 = ImageDraw.Draw(img)
    tw = d0.textlength(txt, font=f); pad = 30; ew = size + 14 if emoji else 0
    el = Image.new('RGBA', (int(tw + pad * 2 + ew), size + 40), (0, 0, 0, 0)); d = ImageDraw.Draw(el)
    d.rounded_rectangle((0, 0, el.width - 1, el.height - 1), radius=(size + 40) // 2, fill=bg + (255,))
    if emoji:
        e = Image.new('RGBA', (180, 180), (0, 0, 0, 0)); ImageDraw.Draw(e).text((10, 10), emoji, font=font(EMOJI, 160), embedded_color=True)
        e = e.crop(e.getbbox() or (0, 0, 1, 1)).resize((size, size), Image.LANCZOS); el.paste(e, (pad - 6, 20), e)
    d.text((pad + ew, el.height // 2), txt, font=f, fill=fg, anchor='lm')
    paste_rot(img, el, cx, cy, 0, 1.0, alpha)

_emo = {}
def emoji(img, ch, cx, cy, size=150, ang=0, scale=1.0):
    if ch not in _emo:
        e = Image.new('RGBA', (200, 200), (0, 0, 0, 0)); ImageDraw.Draw(e).text((10, 10), ch, font=font(EMOJI, 160), embedded_color=True)
        _emo[ch] = e.crop(e.getbbox())
    e = _emo[ch].resize((size, size), Image.LANCZOS)
    paste_rot(img, e, cx, cy, ang, scale)

def beat_pulse(tt):
    ph = ((tt - 0.02) / (BEAT * 2)) % 1
    return 1 + 0.035 * math.exp(-ph * 9)

# ---------- сцены ----------
def scene(tt):
    sid = next(k for k in ('v8', 'v7', 'v6', 'v5', 'v4', 'v3', 'v2', 'v1') if tt >= SC[k][0] - (0.6 if k == 'v1' else 0))
    a, b = SC[sid]; lt = tt - a; L = b - a
    img = gradient(*GRADS[sid], tt).convert('RGB')
    if sid not in ('v6',): blobs(img, tt)
    img = img.convert('RGBA')
    bp = beat_pulse(tt)
    if sid == 'v1':   # ливень мгновений сверху
        for i, c in enumerate(CARDS):
            st = 0.25 + i * 0.45; k = ease_back((lt - st) / 0.55)
            if lt < st: continue
            x = W * (0.26 + 0.48 * ((i * 0.37) % 1)); y = -500 + k * (1350 + (i % 3) * 120)
            paste_rot(img, c, x, y, (-14 + i * 6) * (1 - 0.3 * k), 0.95 * bp)
        emoji(img, '🤔', W * 0.82, 1640, 190, 10 * math.sin(lt * 4), ease_back((lt - L * 0.55) / 0.4))
    elif sid == 'v2':  # щёлк → мгновение → видно → исчезло
        flash = max(0, 1 - (lt - 0.15) / 0.25) if lt > 0.15 else 0
        for i in range(3):
            st = 0.4 + i * 1.6; k = ease_back((lt - st) / 0.45)
            if lt < st: continue
            gone = ease_out((lt - (L - 1.6) + (2 - i) * 0.25) / 0.6) if lt > L - 2.4 else 0
            x = W * (0.3 + 0.2 * i); y = 1180 + (i % 2) * 60
            paste_rot(img, CARDS[i], x, y, -10 + i * 10, (0.82 + 0.18 * k) * (1 - 0.6 * gone), 1 - gone)
            if lt > st + 0.3 and gone < 0.5:
                chip(img, CAPS[i], x, y + 300 + (i % 2) * 70, alpha=min(1, (lt - st - 0.3) / 0.25) * (1 - gone * 2))
        chip(img, 'МГНОВЕНИЯ', W / 2, 640, bg=(255, 230, 60), size=58, emoji='⚡', alpha=ease_out(lt / 0.3))
        chip(img, 'без фильтров · только близким · исчезают после просмотра', W / 2, 740, bg=(20, 16, 24), fg=(255, 255, 255), size=30, alpha=ease_out((lt - 0.6) / 0.4))
        if lt > L - 2.4: emoji(img, '💨', W * 0.8, 1520, 170, 0, ease_back((lt - (L - 2.2)) / 0.4))
        if flash: img.alpha_composite(Image.new('RGBA', (W, H), (255, 255, 255, int(200 * flash))))
    elif sid == 'v3':  # архив копится: стопка и счётчик
        n = int(min(365, 365 * ease_out(lt / (L * 0.8))))
        for i in range(6):
            k = ease_out((lt - i * 0.18) / 0.4)
            paste_rot(img, CARDS[i], W / 2 + (i - 2.5) * 22, 1250 - i * 26 + (1 - k) * 600, -8 + i * 3.5, 0.78 * bp, min(1, k * 1.5))
        d = ImageDraw.Draw(img)
        outlined(d, (W / 2, 760), f'{n}', font(F_BOLD, 220), (255, 255, 255), sw=10)
        chip(img, 'дней в архиве мгновений', W / 2, 910, size=40)
        emoji(img, '📦', W * 0.82, 1680, 170, 8 * math.sin(lt * 5), ease_back((lt - 0.8) / 0.4))
    elif sid == 'v4':  # логотип-удар → телефон с мгновениями по дням
        if lt < 1.3:
            k = ease_back(lt / 0.35); d = ImageDraw.Draw(img)
            el = Image.new('RGBA', (W, 300), (0, 0, 0, 0)); ImageDraw.Draw(el).text((W / 2, 150), 'Послевкусие', font=font(F_SERIF, 136), fill=(255, 255, 255), anchor='mm', stroke_width=6, stroke_fill=(20, 16, 24))
            paste_rot(img, el, W / 2, 960, -4 * (1 - k), 0.6 + 0.4 * k)
            emoji(img, '✨', W * 0.18, 760, 140, 0, k); emoji(img, '✨', W * 0.84, 1180, 120, 0, k)
        else:
            k = ease_back((lt - 1.3) / 0.5)
            phone(img, cap_at('insta', (lt - 1.3) * 0.95), W / 2, 1180 + (1 - k) * 900, -3 * (1 - k), 0.98 * bp)
            emoji(img, '⚡', W * 0.12, 900, 130, -12, k)
    elif sid == 'v5':  # форма из мгновений → сборка → клип
        k = ease_out(lt / 0.3)
        sp = CAP['build'][1][-1][1] / max(1, L - 1.6)
        if lt < L - 1.6:
            phone(img, cap_at('build', lt * sp), W / 2, 1180 + (1 - k) * 200, 2 * math.sin(lt * 1.3), bp)
        else:  # готовый клип на весь экран
            fr = Image.open(MONET / f'{min(399, int((lt - (L - 1.6)) * FPS) + 1):05d}.jpg').convert('RGBA')
            z = 1.08 - 0.06 * ease_out((lt - (L - 1.6)) / 1.6)
            paste_rot(img, fr, W / 2, H / 2, 0, z)
            chip(img, 'КЛИП ДНЯ ГОТОВ', W / 2, 1640, bg=(255, 230, 60), size=56, emoji='🎬')
    elif sid == 'v6':  # шесть стилей — быстрые склейки на ярком
        i = min(5, int(lt / (L / 6))); key, name, col = REGS[i]; li = lt - i * (L / 6)
        img = Image.new('RGBA', (W, H), hexc(col) + (255,)); blobs(img, tt, 50)
        fr = cover(REGIMG[key], 760, 1350).convert('RGBA')
        paste_rot(img, fr, W / 2, 1060, (-5 + 10 * (i % 2)) * (1 - ease_out(li / 0.25)), (0.9 + 0.1 * ease_back(li / 0.3)) * bp)
        d = ImageDraw.Draw(img)
        outlined(d, (W / 2, 260 + 0 * i), name.upper(), font(F_BOLD, 120), (255, 255, 255) if key != 'ma' else (20, 16, 24), stroke=(20, 16, 24) if key != 'ma' else (255, 255, 255), sw=9)
        chip(img, f'стиль {i + 1} из 6', W / 2, 1830, size=36)
        return img.convert('RGB')  # без титров по словам: названия стилей и так крупно
    elif sid == 'v7':  # всё в браузере — телефон + замок
        phone(img, cap_at('archive', lt * 1.4), W / 2, 1200, -2 + 2 * math.sin(lt), bp)
        emoji(img, '🔒', W * 0.84, 820, 170, 10 * math.sin(lt * 3), ease_back(lt / 0.4))
        chip(img, 'фото не покидают телефон', W / 2, 1830, size=40, alpha=ease_out((lt - 0.3) / 0.3))
    elif sid == 'v8':  # финал: клип-праздник + логотип
        fr = Image.open(PARTY / f'{min(399, int(lt * FPS) + 1):05d}.jpg').convert('RGB').filter(ImageFilter.GaussianBlur(14))
        img = fr.convert('RGBA'); img.alpha_composite(Image.new('RGBA', (W, H), (20, 16, 24, 150)))
        for j in range(18):  # конфетти
            jx = (j * 97 % 100) / 100 * W; jy = ((lt * (300 + j * 23) + j * 140) % (H + 200)) - 100
            ImageDraw.Draw(img).rounded_rectangle((jx, jy, jx + 22, jy + 38), radius=6, fill=hexc(['#ff2e88', '#ffe63c', '#2bd2ff', '#00c9a7', '#ff9a3c'][j % 5]))
        d = ImageDraw.Draw(img)
        k = ease_back(lt / 0.45)
        el = Image.new('RGBA', (W, 300), (0, 0, 0, 0)); ImageDraw.Draw(el).text((W / 2, 150), 'Послевкусие', font=font(F_SERIF, 138), fill=(255, 255, 255), anchor='mm')
        paste_rot(img, el, W / 2, 820, 0, 0.5 + 0.5 * k)
        if lt > 0.6: chip(img, 'мгновение исчезло — ощущение осталось', W / 2, 1000, bg=(255, 230, 60), size=38, alpha=ease_out((lt - 0.6) / 0.3))
        if lt > 1.2: outlined(d, (W / 2, 1180), 'khaan011.github.io/hackaton-genezis', font(F_MED, 40), (255, 255, 255), sw=0)
        return img.convert('RGB')
    karaoke(img, tt, 300)
    return img.convert('RGB')

# ---------- рендер ----------
silent = A2 / 'video.mp4'
n = int(TOTAL * FPS)
proc = subprocess.Popen([FF, '-v', 'error', '-y', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', f'{W}x{H}', '-r', str(FPS), '-i', '-',
                         '-c:v', 'libx264', '-preset', 'medium', '-crf', '20', '-pix_fmt', 'yuv420p', str(silent)], stdin=subprocess.PIPE)
for i in range(n):
    proc.stdin.write(scene(i / FPS).tobytes())
    if i % 150 == 0: print(f'кадр {i}/{n}', flush=True)
proc.stdin.close(); proc.wait()

# ---------- звук ----------
ins = ['-i', str(silent), '-i', str(ROOT / 'test/assets/real/music/dance.mp3')]
fc = [f"[1:a]atrim=start={MUSIC_AT}:duration={TOTAL},asetpts=PTS-STARTPTS,afade=t=in:d=0.2,afade=t=out:st={TOTAL - 1.8}:d=1.8,volume=0.5[mus]"]
vo = []
for i, v in enumerate(VO):
    ins += ['-i', str(A2 / f"{v['id']}.mp3")]; ms = int(v['at'] * 1000)
    fc.append(f"[{i + 2}:a]adelay={ms}|{ms},volume=1.3[v{i}]"); vo.append(f'[v{i}]')
fc.append(f"{''.join(vo)}amix=inputs={len(vo)}:normalize=0,asplit[a1][a2]")
fc.append("[mus][a1]sidechaincompress=threshold=0.03:ratio=5:attack=15:release=300[duck]")
fc.append(f"[duck][a2]amix=inputs=2:normalize=0,alimiter=limit=0.95,atrim=duration={TOTAL}[a]")
dst = ROOT / 'docs/ad-vertical.mp4'
subprocess.run([FF, '-v', 'error', '-y', *ins, '-filter_complex', ';'.join(fc), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', str(dst)], check=True)
print('готово:', dst, f'{TOTAL:.1f} с')
