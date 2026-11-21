# Процедурные тестовые «снимки» для шести дней (свои, без чужих фото).
import numpy as np, os, sys, math
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else 'assets/photos'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(11)

def grad(w, h, top, bottom, axis=0):
    t = np.linspace(0, 1, h if axis == 0 else w)
    c = np.array(top)[None, :] * (1 - t[:, None]) + np.array(bottom)[None, :] * t[:, None]
    if axis == 0: return np.repeat(c[:, None, :], w, axis=1)
    return np.repeat(c[None, :, :], h, axis=0)

def to_img(a): return Image.fromarray(np.clip(a, 0, 255).astype(np.uint8))
def finish(img, blur=0.8, noise=7, name='x'):
    if blur: img = img.filter(ImageFilter.GaussianBlur(blur))
    a = np.asarray(img).astype(np.float32)
    a += rng.normal(0, noise, a.shape[:2])[:, :, None]
    # лёгкая виньетка, как у объектива
    h, w = a.shape[:2]; yy, xx = np.mgrid[0:h, 0:w]
    v = 1 - 0.22 * (((xx - w / 2) / (w / 2)) ** 2 + ((yy - h / 2) / (h / 2)) ** 2)
    a *= v[:, :, None]
    to_img(a).save(os.path.join(OUT, name + '.jpg'), quality=90)
    print('ok', name)

def blobs(draw, n, box, rmin, rmax, cols, alpha=255):
    x0, y0, x1, y1 = box
    for _ in range(n):
        x, y = rng.uniform(x0, x1), rng.uniform(y0, y1); r = rng.uniform(rmin, rmax)
        c = cols[rng.integers(len(cols))]
        c = tuple(int(np.clip(v + rng.normal(0, 12), 0, 255)) for v in c)
        draw.ellipse([x - r, y - r, x + r, y + r], fill=c + (alpha,) if alpha < 255 else c)

# 1. Осенний парк
W, H = 1200, 1600
a = grad(W, H, (196, 206, 214), (232, 214, 182))
img = to_img(a); d = ImageDraw.Draw(img, 'RGBA')
d.polygon([(0, 1050), (W, 980), (W, H), (0, H)], fill=(120, 104, 78))
d.polygon([(520, 1000), (680, 1000), (1050, H), (150, H)], fill=(168, 150, 120))
for x in [130, 330, 860, 1060]:
    d.rectangle([x - 22, 520, x + 22, 1080], fill=(58, 44, 34)); d.line([x, 700, x - 120, 560], fill=(58, 44, 34), width=14); d.line([x, 650, x + 110, 520], fill=(58, 44, 34), width=12)
blobs(d, 900, (-100, 120, W + 100, 820), 18, 60, [(226, 176, 50), (214, 132, 36), (236, 200, 90), (180, 92, 30), (240, 214, 120)], 230)
blobs(d, 400, (0, 1040, W, H), 5, 14, [(226, 176, 50), (200, 110, 30), (236, 200, 90)], 255)
d.rectangle([560, 930, 760, 950], fill=(80, 60, 45)); d.rectangle([570, 950, 584, 1000], fill=(80, 60, 45)); d.rectangle([736, 950, 750, 1000], fill=(80, 60, 45))
finish(img, 1.4, 6, 'autumn_park')

# 2. Опавшие листья крупно
W, H = 1600, 1200
img = to_img(grad(W, H, (70, 52, 38), (96, 70, 46))); d = ImageDraw.Draw(img, 'RGBA')
for _ in range(260):
    x, y, r = rng.uniform(-50, W + 50), rng.uniform(-50, H + 50), rng.uniform(40, 120)
    c = [(230, 170, 40), (210, 120, 30), (190, 70, 30), (240, 200, 80), (160, 110, 40)][rng.integers(5)]
    ang = rng.uniform(0, math.pi)
    pts = [(x + math.cos(ang + t) * r * (0.55 if abs(math.sin(t)) > .5 else 1) * (1 if i % 2 else .9), y + math.sin(ang + t) * r * 0.5) for i, t in enumerate(np.linspace(0, 2 * math.pi, 14))]
    d.polygon(pts, fill=tuple(int(np.clip(v + rng.normal(0, 14), 0, 255)) for v in c) + (240,))
    d.line([x - math.cos(ang) * r, y - math.sin(ang) * r * .5, x + math.cos(ang) * r, y + math.sin(ang) * r * .5], fill=(110, 70, 30, 200), width=3)
finish(img, 1.2, 7, 'autumn_leaves')

# 3. Какао на скамейке
W, H = 1200, 1600
img = to_img(grad(W, H, (120, 96, 70), (70, 52, 38))); d = ImageDraw.Draw(img, 'RGBA')
blobs(d, 60, (0, 0, W, 700), 40, 110, [(250, 210, 140), (240, 180, 100), (255, 230, 170)], 90)
for y in range(1000, H, 70): d.rectangle([0, y, W, y + 52], fill=(132, 92, 58)); d.line([0, y + 52, W, y + 52], fill=(70, 45, 28), width=6)
d.ellipse([380, 760, 820, 880], fill=(236, 226, 210)); d.rectangle([380, 820, 820, 1220], fill=(222, 210, 190)); d.ellipse([380, 1160, 820, 1280], fill=(206, 194, 174))
d.ellipse([400, 772, 800, 868], fill=(96, 58, 36)); d.arc([780, 900, 940, 1100], -80, 80, fill=(222, 210, 190), width=34)
for k in range(3):
    pts = [(560 + k * 60 + 30 * math.sin(t * 3 + k), 740 - t * 380) for t in np.linspace(0, 1, 30)]
    d.line(pts, fill=(255, 250, 240, 110), width=26)
finish(img, 2.2, 6, 'cocoa')

# 4. Офис ночью: окно и монитор
W, H = 1600, 1200
img = to_img(grad(W, H, (16, 22, 40), (10, 12, 22))); d = ImageDraw.Draw(img, 'RGBA')
d.rectangle([80, 60, 900, 760], fill=(22, 30, 54))
for bx in range(100, 900, 150):
    bh = rng.integers(250, 620); d.rectangle([bx, 760 - bh, bx + 120, 760], fill=(28, 36, 62))
    for wy in range(780 - bh, 750, 34):
        for wx in range(bx + 10, bx + 110, 26):
            if rng.random() < 0.45: d.rectangle([wx, wy, wx + 14, wy + 18], fill=(255, 214, 140) if rng.random() < .7 else (180, 210, 255))
d.rectangle([80, 60, 900, 760], outline=(8, 10, 16), width=22); d.line([490, 60, 490, 760], fill=(8, 10, 16), width=14)
d.rectangle([980, 260, 1520, 620], fill=(200, 220, 255)); d.rectangle([1000, 280, 1500, 600], fill=(24, 30, 48))
for i, y in enumerate(range(300, 590, 22)):
    x = 1020 + (i % 4) * 22; d.rectangle([x, y, x + rng.integers(80, 380), y + 10], fill=[(120, 200, 255), (255, 150, 120), (200, 230, 140), (230, 230, 240)][i % 4])
d.rectangle([1200, 620, 1300, 760], fill=(40, 44, 56)); d.rectangle([0, 860, W, H], fill=(30, 26, 26))
blobs(d, 40, (950, 200, 1560, 700), 60, 160, [(120, 160, 255)], 18)
finish(img, 1.0, 9, 'office_window')

# 5. Ноутбук и кофе ночью
W, H = 1200, 1600
img = to_img(grad(W, H, (12, 14, 26), (20, 18, 24))); d = ImageDraw.Draw(img, 'RGBA')
blobs(d, 30, (100, 200, 1100, 900), 120, 260, [(80, 120, 220)], 22)
d.polygon([(170, 380), (1030, 380), (1000, 960), (200, 960)], fill=(210, 225, 250)); d.polygon([(190, 400), (1010, 400), (982, 940), (218, 940)], fill=(20, 26, 44))
for i, y in enumerate(range(430, 920, 26)):
    x = 250 + (i % 5) * 26; d.rectangle([x, y, x + rng.integers(90, 520), y + 12], fill=[(120, 200, 255), (255, 160, 120), (200, 230, 150), (235, 235, 245), (190, 150, 255)][i % 5])
d.polygon([(120, 980), (1080, 980), (1180, 1260), (20, 1260)], fill=(46, 48, 58))
for r in range(6):
    for c in range(14): d.rectangle([150 + c * 64 + r * 6, 1010 + r * 38, 196 + c * 64 + r * 6, 1038 + r * 38], fill=(30, 32, 40))
d.rectangle([880, 1260, 1060, 1500], fill=(60, 44, 36)); d.ellipse([880, 1236, 1060, 1290], fill=(40, 26, 20))
finish(img, 1.0, 9, 'laptop_night')

# 6. Зимнее утро: поле, дерево, туман
W, H = 1600, 1200
img = to_img(grad(W, H, (214, 222, 230), (236, 238, 240))); d = ImageDraw.Draw(img, 'RGBA')
d.polygon([(0, 700), (W, 640), (W, H), (0, H)], fill=(246, 248, 252))
for k in range(5):
    xa = rng.uniform(-200, W - 300); d.ellipse([xa, 760 + k * 80, xa + rng.uniform(300, 900), 840 + k * 90], fill=(206, 216, 232, 70))
def branch(x, y, ang, ln, wd, depth):
    if depth == 0 or ln < 8: return
    x2, y2 = x + math.cos(ang) * ln, y - math.sin(ang) * ln
    d.line([x, y, x2, y2], fill=(52, 50, 54), width=max(1, int(wd)))
    for da in (-0.45, 0.4):
        branch(x2, y2, ang + da + rng.normal(0, .12), ln * rng.uniform(.62, .78), wd * .62, depth - 1)
branch(1040, 700, math.pi / 2, 210, 22, 8)
d.rectangle([0, 520, W, 640], fill=(240, 242, 246, 120))
finish(img, 1.5, 5, 'winter_field')

# 7. Окно с изморозью
W, H = 1200, 1600
img = to_img(grad(W, H, (226, 232, 238), (244, 245, 247))); d = ImageDraw.Draw(img, 'RGBA')
blobs(d, 50, (0, 300, W, 1300), 60, 180, [(200, 210, 224)], 60)
d.rectangle([40, 40, W - 40, H - 40], outline=(90, 86, 84), width=46); d.line([W / 2, 40, W / 2, H - 40], fill=(90, 86, 84), width=30); d.line([40, 640, W - 40, 640], fill=(90, 86, 84), width=26)
for _ in range(900):
    x, y = rng.uniform(60, W - 60), rng.uniform(60, H - 60)
    edge = min(x, y, W - x, H - y)
    if rng.random() < math.exp(-edge / 160): d.line([x, y, x + rng.normal(0, 30), y + rng.normal(0, 30)], fill=(255, 255, 255, 170), width=2)
finish(img, 1.2, 5, 'frost_window')

# 8. Дача летом
W, H = 1600, 1200
img = to_img(grad(W, H, (120, 176, 232), (206, 228, 240))); d = ImageDraw.Draw(img, 'RGBA')
d.polygon([(0, 720), (W, 680), (W, H), (0, H)], fill=(96, 150, 62))
d.rectangle([300, 420, 760, 760], fill=(150, 98, 60)); d.polygon([(260, 430), (530, 240), (800, 430)], fill=(120, 60, 46))
d.rectangle([420, 520, 520, 620], fill=(250, 236, 200)); d.rectangle([580, 560, 680, 760], fill=(90, 58, 36))
blobs(d, 260, (950, 260, 1500, 640), 26, 70, [(70, 130, 50), (90, 150, 60), (60, 110, 46)], 255)
d.rectangle([1200, 560, 1240, 760], fill=(80, 56, 36))
blobs(d, 30, (980, 300, 1480, 620), 8, 13, [(210, 40, 40)], 255)
blobs(d, 300, (0, 760, W, H), 3, 9, [(250, 240, 120), (255, 255, 255)], 220)
finish(img, 1.0, 7, 'dacha_house')

# 9. Река на закате
W, H = 1600, 1200
img = to_img(grad(W, H, (250, 196, 130), (240, 150, 110))); d = ImageDraw.Draw(img, 'RGBA')
d.ellipse([900, 380, 1080, 560], fill=(255, 236, 180))
d.rectangle([0, 600, W, 900], fill=(90, 120, 150))
for _ in range(500):
    x, y = rng.uniform(0, W), rng.uniform(610, 890); d.line([x, y, x + rng.uniform(20, 70), y], fill=(255, 220, 160, 170), width=3)
d.polygon([(0, 560), (500, 600), (700, 610), (0, 640)], fill=(60, 80, 50)); d.polygon([(0, 880), (W, 860), (W, H), (0, H)], fill=(70, 100, 50))
blobs(d, 180, (0, 880, W, H), 10, 30, [(90, 130, 60), (110, 150, 70)], 255)
finish(img, 1.2, 7, 'river_sunset')

# 10. Костёр в сумерках
W, H = 1200, 1600
img = to_img(grad(W, H, (40, 52, 96), (22, 20, 34))); d = ImageDraw.Draw(img, 'RGBA')
blobs(d, 70, (0, 0, W, 600), 1, 3, [(255, 250, 230)], 255)
blobs(d, 30, (300, 900, 900, 1400), 90, 260, [(255, 140, 40)], 26)
for k in range(9):
    cx = 600 + rng.normal(0, 60); hgt = rng.uniform(180, 360)
    d.polygon([(cx - 60, 1250), (cx + 60, 1250), (cx + rng.normal(0, 20), 1250 - hgt)], fill=[(255, 200, 80, 220), (255, 130, 40, 220), (255, 230, 150, 230)][k % 3])
d.rectangle([420, 1250, 780, 1290], fill=(60, 36, 24))
for px, sc in [(220, 1.0), (960, 0.9), (360, 0.8)]:
    d.ellipse([px - 50 * sc, 980 - 60 * sc, px + 50 * sc, 1080 - 60 * sc], fill=(14, 12, 18)); d.rectangle([px - 80 * sc, 1060, px + 80 * sc, 1420], fill=(14, 12, 18))
d.rectangle([0, 1380, W, H], fill=(18, 14, 16))
finish(img, 1.4, 9, 'campfire')

# 11. Шарики
W, H = 1200, 1600
img = to_img(grad(W, H, (250, 226, 200), (236, 196, 168))); d = ImageDraw.Draw(img, 'RGBA')
for _ in range(16):
    x, y, r = rng.uniform(100, 1100), rng.uniform(150, 1050), rng.uniform(90, 150)
    c = [(230, 50, 70), (250, 200, 40), (60, 120, 230), (240, 120, 180), (80, 190, 140)][rng.integers(5)]
    d.line([x, y + r, x + rng.normal(0, 60), 1600], fill=(120, 110, 100), width=3)
    d.ellipse([x - r * .85, y - r, x + r * .85, y + r], fill=c); d.ellipse([x - r * .45, y - r * .7, x - r * .1, y - r * .25], fill=(255, 255, 255, 120))
finish(img, 1.0, 6, 'balloons')

# 12. Торт со свечами
W, H = 1600, 1200
img = to_img(grad(W, H, (120, 70, 60), (60, 34, 30))); d = ImageDraw.Draw(img, 'RGBA')
blobs(d, 60, (0, 0, W, 600), 30, 90, [(255, 200, 120), (255, 160, 200)], 70)
d.ellipse([420, 520, 1180, 680], fill=(250, 220, 230)); d.rectangle([420, 600, 1180, 920], fill=(240, 180, 200)); d.ellipse([420, 840, 1180, 1000], fill=(220, 150, 170))
for k in range(7):
    x = 520 + k * 95; d.rectangle([x, 470, x + 14, 600], fill=(120, 200, 255)); d.ellipse([x - 10, 410, x + 24, 470], fill=(255, 210, 90)); d.ellipse([x - 40, 380, x + 54, 500], fill=(255, 200, 90, 40))
blobs(d, 140, (0, 0, W, H), 5, 12, [(230, 50, 70), (250, 200, 40), (60, 120, 230), (80, 190, 140)], 255)
finish(img, 1.0, 7, 'cake')

# 13. Танцы в огнях
W, H = 1600, 1200
img = to_img(grad(W, H, (60, 30, 70), (30, 16, 40))); d = ImageDraw.Draw(img, 'RGBA')
blobs(d, 90, (0, 0, W, 800), 20, 70, [(255, 120, 200), (120, 200, 255), (255, 220, 120), (180, 255, 160)], 90)
for k in range(7):
    x = 150 + k * 210 + rng.normal(0, 30); s = rng.uniform(.8, 1.1)
    d.ellipse([x - 45 * s, 520, x + 45 * s, 610], fill=(20, 12, 24)); d.polygon([(x - 90 * s, 1200), (x + 90 * s, 1200), (x + 50 * s, 610), (x - 50 * s, 610)], fill=(20, 12, 24))
    d.line([x, 650, x + rng.choice([-1, 1]) * 140 * s, 480 + rng.normal(0, 40)], fill=(20, 12, 24), width=int(26 * s))
finish(img, 1.2, 8, 'party')

# 14. Дождливая улица ночью
W, H = 1200, 1600
img = to_img(grad(W, H, (20, 26, 44), (12, 14, 22))); d = ImageDraw.Draw(img, 'RGBA')
d.polygon([(0, 900), (W, 900), (W, H), (0, H)], fill=(24, 28, 40))
for x in [180, 520, 900]:
    d.rectangle([x - 6, 300, x + 6, 900], fill=(30, 32, 40)); d.ellipse([x - 26, 270, x + 26, 320], fill=(255, 210, 140))
    blobs(d, 6, (x - 60, 220, x + 60, 360), 60, 140, [(255, 190, 110)], 30)
    for k in range(40): yy = 920 + k * 16; d.line([x + rng.normal(0, 12), yy, x + rng.normal(0, 12), yy + 10], fill=(255, 200, 130, max(10, 160 - k * 4)), width=int(rng.uniform(4, 14)))
for _ in range(500):
    x, y = rng.uniform(0, W), rng.uniform(0, H); d.line([x, y, x - 8, y + 40], fill=(200, 210, 230, 60), width=1)
d.ellipse([560, 980, 700, 1030], fill=(10, 10, 14)); d.rectangle([600, 1010, 660, 1340], fill=(10, 10, 14)); d.pieslice([520, 900, 740, 1040], 180, 360, fill=(14, 14, 20))
finish(img, 1.2, 9, 'rain_street')

# 15. Капли на стекле
W, H = 1600, 1200
img = to_img(grad(W, H, (26, 30, 50), (14, 16, 26))); d = ImageDraw.Draw(img, 'RGBA')
blobs(d, 70, (0, 200, W, 1000), 30, 90, [(255, 190, 110), (255, 120, 90), (140, 180, 255)], 70)
img = img.filter(ImageFilter.GaussianBlur(14)); d = ImageDraw.Draw(img, 'RGBA')
for _ in range(700):
    x, y, r = rng.uniform(0, W), rng.uniform(0, H), rng.uniform(2, 11)
    d.ellipse([x - r, y - r, x + r, y + r], fill=(30, 34, 50, 140)); d.ellipse([x - r * .4, y - r * .6, x + r * .1, y - r * .1], fill=(230, 236, 255, 110))
finish(img, 0.6, 8, 'rain_window')
