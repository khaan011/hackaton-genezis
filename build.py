#!/usr/bin/env python3
"""Сборка «Послевкусия» в один самодостаточный index.html (шрифты встроены, внешних зависимостей нет)."""
import base64, pathlib, sys

ROOT = pathlib.Path(__file__).parent
SRC, FONTS, OUT = ROOT / 'src', ROOT / 'fonts', ROOT / 'build'
JS = ['util', 'lexicon', 'text', 'title', 'mood', 'audio', 'image', 'scene', 'seal', 'render', 'regs', 'store', 'voice', 'player', 'insta', 'app', 'moments']
FACES = [
    ('PV Serif', 'lora.woff', '400 700', 'normal'),
    ('PV Serif', 'lora-italic.woff', '400 700', 'italic'),
    ('PV Sans', 'montserrat.woff', '100 900', 'normal'),
    ('PV Mono', 'anon.woff', '400', 'normal'),
    ('PV Mono', 'anon-bold.woff', '700', 'normal'),
    ('PV Display', 'unbounded-800.woff2', '800', 'normal'),
    ('PV Display', 'unbounded-600.woff2', '600', 'normal'),
    ('PV Hand', 'caveat-700.woff2', '700', 'normal'),
]

def main():
    OUT.mkdir(exist_ok=True)
    fonts = []
    for fam, file, weight, style in FACES:
        b64 = base64.b64encode((FONTS / file).read_bytes()).decode()
        kind = 'woff2' if file.endswith('.woff2') else 'woff'
        fonts.append(f'@font-face{{font-family:"{fam}";src:url(data:font/{kind};base64,{b64}) format("{kind}");font-weight:{weight};font-style:{style};font-display:swap}}')
    css = (SRC / 'styles.css').read_text(encoding='utf-8') + '\n' + (SRC / 'theme.css').read_text(encoding='utf-8')
    js = '\n'.join((SRC / f'{n}.js').read_text(encoding='utf-8') for n in JS)
    if '</script' in js:
        sys.exit('в JS встречается </script — сборка прервана')
    html = (SRC / 'index.html').read_text(encoding='utf-8')
    html = html.replace('/*FONTS*/', '\n'.join(fonts)).replace('/*STYLE*/', css).replace('/*SCRIPT*/', js)
    out = OUT / 'index.html'
    out.write_text(html, encoding='utf-8')
    print(f'{out} — {out.stat().st_size / 1024:.0f} КБ')

if __name__ == '__main__':
    main()
