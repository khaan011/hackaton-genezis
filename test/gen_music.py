# Синтез тестовых песен (свои, без чужой музыки) для проверки аудиоанализа и демо.
import numpy as np, wave, subprocess, os, sys

SR = 44100
OUT = sys.argv[1] if len(sys.argv) > 1 else 'assets/music'
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(7)

def midi(n): return 440.0 * 2 ** ((n - 69) / 12)
NOTE = {'C': 0, 'C#': 1, 'Db': 1, 'D': 2, 'Eb': 3, 'E': 4, 'F': 5, 'F#': 6, 'Gb': 6, 'G': 7, 'Ab': 8, 'A': 9, 'Bb': 10, 'B': 11}
def n(name, octv): return 12 * (octv + 1) + NOTE[name]

def env_adsr(length, a=0.01, d=0.2, s=0.6, r=0.3, sus=None):
    t = np.arange(length) / SR
    sus = sus if sus is not None else max(0, length / SR - a - d - r)
    e = np.piecewise(t, [t < a, (t >= a) & (t < a + d), (t >= a + d) & (t < a + d + sus), t >= a + d + sus],
                     [lambda t: t / a, lambda t: 1 - (1 - s) * (t - a) / d, lambda t: s, lambda t: s * np.maximum(0, 1 - (t - a - d - sus) / r)])
    return e

def piano(f, dur, vel=0.5):
    L = int(dur * SR); t = np.arange(L) / SR
    y = np.zeros(L)
    for h, amp in [(1, 1), (2, 0.45), (3, 0.22), (4, 0.12), (5, 0.06)]:
        y += amp * np.sin(2 * np.pi * f * h * t * (1 + 0.0004 * h)) * np.exp(-t * (1.6 + h * 0.9))
    y *= np.minimum(1, t / 0.004)
    return vel * y

def pad(f, dur, vel=0.2, bright=0.3):
    L = int(dur * SR); t = np.arange(L) / SR
    y = np.zeros(L)
    for det in (-0.004, 0, 0.0035):
        for h, amp in [(1, 1), (2, bright), (3, bright * 0.5)]:
            y += amp * np.sin(2 * np.pi * f * h * (1 + det) * t)
    return vel * y * env_adsr(L, a=0.8, d=0.5, s=0.8, r=0.8) / 3

def pluck(f, dur, vel=0.5):  # Karplus–Strong
    L = int(dur * SR); p = int(SR / f)
    buf = rng.uniform(-1, 1, p); y = np.zeros(L)
    for i in range(L):
        y[i] = buf[i % p]
        buf[i % p] = 0.996 * 0.5 * (buf[i % p] + buf[(i + 1) % p])
    return vel * y

def saw(f, dur, vel=0.3, cutoff=0.25):
    L = int(dur * SR); t = np.arange(L) / SR
    y = 2 * ((f * t) % 1) - 1
    # простой однополюсный ФНЧ
    out = np.zeros(L); a = cutoff; acc = 0
    for i in range(L): acc += a * (y[i] - acc); out[i] = acc
    return vel * out * env_adsr(L, a=0.005, d=0.08, s=0.5, r=0.05)

def kick(vel=0.9):
    L = int(0.35 * SR); t = np.arange(L) / SR
    f = 50 + 90 * np.exp(-t * 30)
    return vel * np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 9)

def noise_hit(dur, decay, vel, hp=True):
    L = int(dur * SR); t = np.arange(L) / SR
    y = rng.normal(0, 1, L)
    if hp: y = np.diff(np.concatenate([[0], y]))
    return vel * y * np.exp(-t * decay)

def lowpass(y, a):
    out = np.zeros_like(y); acc = 0.0
    for i in range(len(y)): acc += a * (y[i] - acc); out[i] = acc
    return out

def place(track, sig, t):
    i = int(t * SR); j = min(len(track), i + len(sig))
    if i < len(track): track[i:j] += sig[: j - i]

def chord_notes(root, kind, octv=4):
    iv = {'maj': [0, 4, 7], 'min': [0, 3, 7], 'maj7': [0, 4, 7, 11], 'min7': [0, 3, 7, 10], 'dom7': [0, 4, 7, 10]}[kind]
    r = n(root, octv)
    return [r + i for i in iv]

def render(name, bpm, dur, prog, style, lofi=False):
    beat = 60 / bpm; L = int(dur * SR); tr = np.zeros(L)
    bars = int(dur / (beat * 4)) + 1
    for b in range(bars):
        root, kind = prog[b % len(prog)]
        t0 = b * 4 * beat
        notes = chord_notes(root, kind)
        if style == 'ballad':
            for k in range(4):
                for j, m in enumerate(notes):
                    place(tr, piano(midi(m), beat * 1.8, 0.22 if k else 0.3), t0 + k * beat + j * 0.012)
                place(tr, noise_hit(0.05, 70, 0.025), t0 + k * beat + beat / 2)  # тихий хэт на восьмые
            place(tr, piano(midi(n(root, 2)), beat * 3.5, 0.45), t0)
            place(tr, piano(midi(n(root, 2) + 7), beat * 1.5, 0.3), t0 + 2 * beat)
            mel = notes[-1] + 12
            for k, off in enumerate([0, 2, -1, 4]):
                place(tr, piano(midi(mel + off), beat * 0.9, 0.18), t0 + k * beat + beat * 0.5)
        elif style == 'techno':
            for k in range(4):
                place(tr, kick(0.9), t0 + k * beat)
                place(tr, noise_hit(0.08, 60, 0.12), t0 + k * beat + beat / 2)
                if k in (1, 3): place(tr, noise_hit(0.18, 22, 0.28, hp=False), t0 + k * beat)
                for s in range(4):
                    m = notes[(k * 4 + s) % 3] - 12
                    place(tr, saw(midi(m), beat / 4 * 0.95, 0.16, 0.12 + 0.05 * s), t0 + k * beat + s * beat / 4)
            for m in notes: place(tr, pad(midi(m), beat * 4, 0.05, 0.6), t0)
        elif style == 'ambient':
            for m in notes: place(tr, pad(midi(m - 12), beat * 4.2, 0.07, 0.15), t0)
            for k in (0, 2, 3):
                place(tr, piano(midi(notes[k % len(notes)] + 12), beat * 3, 0.16), t0 + k * beat)
        elif style == 'folk':
            for k in range(8):
                m = notes[[0, 1, 2, 1, 0, 2, 1, 2][k]] - 12 + (12 if k % 4 == 3 else 0)
                place(tr, pluck(midi(m), beat * 1.5, 0.35), t0 + k * beat / 2)
                place(tr, noise_hit(0.04, 90, 0.03), t0 + k * beat / 2 + beat / 4)
            place(tr, pluck(midi(n(root, 2)), beat * 2, 0.5), t0)
            place(tr, pluck(midi(n(root, 2) + 7), beat * 2, 0.4), t0 + 2 * beat)
        elif style == 'pop':
            for k in range(4):
                if k in (0, 2): place(tr, kick(0.8), t0 + k * beat)
                if k in (1, 3): place(tr, noise_hit(0.2, 18, 0.35, hp=False), t0 + k * beat)
                place(tr, noise_hit(0.05, 80, 0.08), t0 + k * beat + beat / 2)
                place(tr, noise_hit(0.05, 80, 0.06), t0 + k * beat)
                for m in notes: place(tr, saw(midi(m), beat * 0.45, 0.07, 0.35), t0 + k * beat + beat / 2)
            place(tr, saw(midi(n(root, 2)), beat * 1.9, 0.25, 0.08), t0)
            place(tr, saw(midi(n(root, 2)), beat * 1.9, 0.25, 0.08), t0 + 2 * beat)
            mel = [notes[2] + 12, notes[1] + 12, notes[0] + 12, notes[1] + 12]
            for k, m in enumerate(mel): place(tr, piano(midi(m), beat * 0.8, 0.2), t0 + k * beat)
        elif style == 'rain':
            for m in notes: place(tr, pad(midi(m - 12), beat * 4.1, 0.08, 0.2), t0)
            for k, idx in enumerate([0, 2, 1, 2]):
                place(tr, piano(midi(notes[idx % len(notes)] + 12), beat * 2, 0.17), t0 + k * beat)
            place(tr, piano(midi(n(root, 2)), beat * 4, 0.3), t0)
    if lofi:
        tr = lowpass(tr, 0.35)
        tr += rng.normal(0, 0.004, len(tr))
    tr /= (np.max(np.abs(tr)) + 1e-9)
    fade = int(1.5 * SR); tr[:fade] *= np.linspace(0, 1, fade); tr[-fade:] *= np.linspace(1, 0, fade)
    st = np.stack([tr, np.roll(tr, 90) * 0.98], axis=1)
    pcm = (st * 0.85 * 32767).astype(np.int16)
    wav = os.path.join(OUT, name + '.wav')
    with wave.open(wav, 'wb') as w:
        w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())
    subprocess.run(['ffmpeg', '-y', '-loglevel', 'error', '-i', wav, '-codec:a', 'libmp3lame', '-b:a', '160k', os.path.join(OUT, name + '.mp3')], check=True)
    print('ok', name)

songs = {
    'ballad_C_major_72': (72, 70, [('C', 'maj7'), ('A', 'min7'), ('F', 'maj7'), ('G', 'dom7')], 'ballad', False),
    'techno_A_minor_128': (128, 64, [('A', 'min'), ('F', 'maj'), ('C', 'maj'), ('G', 'maj')], 'techno', False),
    'ambient_D_minor_60': (60, 70, [('D', 'min'), ('Bb', 'maj'), ('F', 'maj'), ('A', 'min')], 'ambient', False),
    'folk_G_major_96': (96, 64, [('G', 'maj'), ('E', 'min'), ('C', 'maj'), ('D', 'maj')], 'folk', True),
    'pop_D_major_120': (120, 64, [('D', 'maj'), ('A', 'maj'), ('B', 'min'), ('G', 'maj')], 'pop', False),
    'rain_E_minor_66': (66, 70, [('E', 'min'), ('C', 'maj'), ('G', 'maj'), ('D', 'maj')], 'rain', False),
}
only = sys.argv[2:] if len(sys.argv) > 2 else list(songs)
for k in only:
    bpm, dur, prog, style, lofi = songs[k]
    render(k, bpm, dur, prog, style, lofi)
