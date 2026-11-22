#!/usr/bin/env python3
"""Рекламный ролик «Послевкусия» (16:9, ~42 с): склейки в долю бодрого трека, наезды камеры, крупные титры,
настоящие видео-воспоминания 9:16 на весь экран, энергичная озвучка. Всё — из живого интерфейса.
Входы (test/out): demo/desk.webm + demo/timeline.json (tools/record_demo.js), demo/phone.webm,
ad/day_*.mp4 (видео дней, экспорт из приложения), ad/[A-H].mp3 (озвучка), docs/img/*.jpg (кадры режимов),
test/assets/real/music/dance.mp3 (Soft and Furious — Dance Like Crazy, CC0). Запуск: python3 tools/make_ad.py"""
import json, os, subprocess, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / 'test/out/ad'; DEMO = ROOT / 'test/out/demo'
FF = os.path.expanduser('~/.local/bin/ffmpeg') if os.path.exists(os.path.expanduser('~/.local/bin/ffmpeg')) else 'ffmpeg'
FP = FF.replace('ffmpeg', 'ffprobe')
B = 60 / 171.0                     # доля трека
MUSIC_AT = 13.257                  # первая сильная доля в dance.mp3
W, H, FPS = 1920, 1080, 30
BOLD, MED, SERIF = OUT / 'mont800.ttf', OUT / 'mont500.ttf', OUT / 'lora-it500.ttf'
PAPER, INK, RUST = '0xf3efe7', '0x1e1b18', '0xa9442b'
tl = json.load(open(DEMO / 'timeline.json'))
V = {v['id']: v['at'] for v in tl['voice']}

def dur(f): return float(subprocess.check_output([FP, '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', str(f)]))
def run(args): subprocess.run([FF, '-v', 'error', '-y', *args], check=True)
def esc(s): return s.replace('\\', '\\\\').replace(':', '\\:').replace("'", "’").replace('%', '\\%')

def text(t, size, y, color='white', font=BOLD, delay=0.0, box=None):
    """появление снизу с проявлением; y — центр строки в долях высоты"""
    a = f"if(lt(t,{delay}),0,min((t-{delay})/0.18,1))"
    yy = f"h*{y}-th/2+36*(1-min(max(t-{delay},0)/0.22,1))"
    bx = f":box=1:boxcolor={box}:boxborderw=26" if box else ''
    return f"drawtext=fontfile='{font}':text='{esc(t)}':fontsize={size}:fontcolor={color}:x=(w-tw)/2:y='{yy}':alpha='{a}'{bx}"

segs = []
def seg(name, beats, vf_inputs, filt):
    segs.append((name, beats * B, vf_inputs, filt))

# 1–2. крючок
seg('hook1', 8, [], lambda d: f"color=c={INK}:s={W}x{H}:r={FPS}:d={d}," + text('Фото помнят,', 112, .40) + ',' + text('как выглядел день.', 112, .56, delay=0.45))
seg('hook2', 4, [], lambda d: f"color=c={RUST}:s={W}x{H}:r={FPS}:d={d}," + text('А как он', 96, .38, color=PAPER) + ',' + text('ОЩУЩАЛСЯ?', 168, .58, color='white', delay=0.2))
# 3. шесть режимов — по 2 доли на кадр, кадр на цветной бумаге с наездом
REG = [('monet', '0xd9a55a', 'Свет Моне'), ('kandinsky', '0x2f4fa2', 'Кандинский'), ('ma', '0xe9e2d6', 'Ма'), ('film', '0xe07b39', 'Плёнка'), ('matisse', '0x29a3c4', 'Матисс'), ('nocturne', '0x232a45', 'Ноктюрн')]
for k, col, name in REG:
    img = ROOT / f'docs/img/{k}.jpg'
    seg('reg_' + k, 2, [img], (lambda col, name: lambda d: (
        f"color=c={col}:s={W}x{H}:r={FPS}:d={d}[bg];[0:v]scale=-2:900,loop=loop=-1:size=1:start=0,trim=duration={d},fps={FPS},"
        f"scale='iw*(1+0.08*t/{d})':'ih*(1+0.08*t/{d})':eval=frame[im];[bg][im]overlay=x=(W-w)/2:y=(H-h)/2:shortest=1,"
        + text(name, 64, .93, color='white' if col not in ('0xe9e2d6',) else INK, font=BOLD)))(col, name))
# 4. запись дня: пример в форме, ускорено
def screen(src, t0, length, speed, cap, cap_y=.9, zoom=0.14, z0=1.18):
    def f(d):
        return (f"[0:v]trim=start={t0}:duration={length},setpts=(PTS-STARTPTS)/{speed},fps={FPS},scale={W}:{H},"
                f"scale='iw*({z0}+{zoom}*t/{d})':'ih*({z0}+{zoom}*t/{d})':eval=frame,crop={W}:{H},trim=duration={d}," + text(cap, 58, cap_y, color='white', box='0x1e1b18cc'))
    return f
seg('form', 12, [DEMO / 'desk.webm'], screen(DEMO / 'desk.webm', V['L2'] + 0.3, 12 * B * 1.8, 1.8, 'Пара фраз · фото · песня'))
# 5. настоящее воспоминание 9:16 на весь экран
def memory(cap):
    def f(d):
        return (f"[0:v]trim=start=4:duration={d},setpts=PTS-STARTPTS,fps={FPS},split[a][b];[a]scale={W}:-2,crop={W}:{H},gblur=sigma=28,eq=brightness=-0.12[bg];"
                f"[b]scale=-2:1040[fg];[bg][fg]overlay=x=(W-w)/2:y=20,"
                + text(cap, 54, .5, color='white', box='0x1e1b18cc', delay=0.3).replace("x=(w-tw)/2", "x=w*0.04"))
    return f
monet = next(OUT.glob('day_Осенний*'))
party = next(OUT.glob('day_День*'))
seg('memory', 16, [monet], memory('Видео в ритме вашей песни'))
# 6. почему так
seg('why', 6, [DEMO / 'desk.webm'], screen(DEMO / 'desk.webm', V['L4'] + 3.6, 6 * B * 1.4, 1.4, 'Каждое решение объяснено', zoom=0.14))
# 7. Instagram — удар
seg('ig_slam', 6, [], lambda d: f"color=c={RUST}:s={W}x{H}:r={FPS}:d={d}," + text('НОВОЕ', 64, .32, color=PAPER, font=MED) + ',' + text('Мгновения Instagram', 132, .5, delay=0.12) + ',' + text('моментальные снимки становятся днями', 52, .68, color=PAPER, font=MED, delay=0.35))
seg('ig_list', 12, [DEMO / 'desk.webm'], screen(DEMO / 'desk.webm', V['L7'] - 0.2, 12 * B * 1.3, 1.3, 'Снимки сами раскладываются по дням'))
seg('ig_build', 12, [DEMO / 'desk.webm'], screen(DEMO / 'desk.webm', V['L8'] - 0.3, 12 * B * 1.9, 1.9, 'Страницы собираются в одно касание'))
seg('memory2', 8, [party], memory('Каждый день — в своём режиме'))
# 11. телефон
def phone(d):
    ps = tl['phoneClipStart']
    return (f"color=c={PAPER}:s={W}x{H}:r={FPS}:d={d}[bg];[0:v]trim=start={ps}:duration={d * 1.6},setpts=(PTS-STARTPTS)/1.6,fps={FPS},scale=-2:960[ph];"
            f"[bg][ph]overlay=x=W*0.56:y=60:shortest=1,"
            + text('Сначала — телефон', 84, .40, color=INK).replace("x=(w-tw)/2", "x=w*0.08")
            + ',' + text('Всё в браузере.', 54, .55, color=INK, font=MED, delay=0.3).replace("x=(w-tw)/2", "x=w*0.08")
            + ',' + text('Снимки никуда не уходят.', 54, .63, color=RUST, font=MED, delay=0.5).replace("x=(w-tw)/2", "x=w*0.08"))
seg('phone', 10, [DEMO / 'phone.webm'], phone)
# 12. финал
seg('end', 12, [], lambda d: f"color=c={INK}:s={W}x{H}:r={FPS}:d={d}," + text('Послевкусие', 150, .40, font=SERIF) + ',' + text('Запомни, как ощущался день.', 58, .56, color=PAPER, font=MED, delay=0.35) + ',' + text('khaan011.github.io/hackaton-genezis', 40, .74, color='0xd9a55a', font=MED, delay=0.7))

# ---------- рендер сегментов ----------
parts, t, starts = [], 0.0, {}
for i, (name, d, ins, filt) in enumerate(segs):
    f = OUT / f'seg_{i:02d}_{name}.mp4'
    args = []
    for x in ins: args += ['-i', str(x)]
    fc = filt(d)
    if not ins: args = ['-f', 'lavfi', '-i', fc.split(',', 1)[0]]; fc = '[0:v]' + fc.split(',', 1)[1]
    # короткая белая вспышка на стыке — как удар
    fc += f",fade=t=in:st=0:d=0.08:color=white,format=yuv420p,trim=duration={d}[v]"
    run([*args, '-filter_complex', fc, '-map', '[v]', '-t', f'{d:.4f}', '-r', str(FPS), '-c:v', 'libx264', '-preset', 'medium', '-crf', '19', '-an', str(f)])
    starts[name] = t; t += d; parts.append(f)
    print(f'{name:10s} {d:5.2f} с')
total = t
(OUT / 'list.txt').write_text(''.join(f"file '{p}'\n" for p in parts))
run(['-f', 'concat', '-safe', '0', '-i', str(OUT / 'list.txt'), '-c', 'copy', str(OUT / 'video.mp4')])

# ---------- звук: трек + голос поверх (трек приглушается под голосом) ----------
VO = [('A', 'hook1', .15), ('B', 'reg_monet', .1), ('C', 'form', .1), ('D', 'memory', .15), ('E', 'ig_slam', .1), ('F', 'ig_build', .05), ('G', 'phone', .15), ('H', 'end', .45)]
ins = ['-i', str(OUT / 'video.mp4'), '-i', str(ROOT / 'test/assets/real/music/dance.mp3')]
fc = [f"[1:a]atrim=start={MUSIC_AT}:duration={total},asetpts=PTS-STARTPTS,afade=t=in:d=0.3,afade=t=out:st={total - 2.2}:d=2.2,volume=0.55[mus]"]
vo = []
for i, (k, s, off) in enumerate(VO):
    ins += ['-i', str(OUT / f'{k}.mp3')]
    at = int((starts[s] + off) * 1000)
    fc.append(f"[{i + 2}:a]adelay={at}|{at},volume=1.25[v{i}]"); vo.append(f'[v{i}]')
fc.append(f"{''.join(vo)}amix=inputs={len(vo)}:normalize=0,asplit[vo1][vo2]")
fc.append("[mus][vo1]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=350[duck]")
fc.append(f"[duck][vo2]amix=inputs=2:normalize=0,alimiter=limit=0.95,atrim=duration={total}[a]")
dst = ROOT / 'docs/demo.mp4'
run([*ins, '-filter_complex', ';'.join(fc), '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart', '-t', f'{total:.3f}', str(dst)])
print('готово:', dst, f'{total:.1f} с')
