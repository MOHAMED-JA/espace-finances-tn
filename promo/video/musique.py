"""Bande-son Orbite (30 s, 120 BPM, la mineur), entièrement synthétisée. Sortie : musique.wav (48 kHz stéréo)."""
import numpy as np, wave

SR = 48000; DUR = 30.6; N = int(SR * DUR); BEAT = .5; BAR = 2.0
t = np.arange(N) / SR
rng = np.random.default_rng(42)
L = np.zeros(N); R = np.zeros(N)

def add(sig, start, gain=1.0, pan=0.0):
    i = int(start * SR)
    if i >= N: return
    s = sig[: N - i] * gain
    L[i:i + len(s)] += s * np.sqrt((1 - pan) / 2) * 1.414
    R[i:i + len(s)] += s * np.sqrt((1 + pan) / 2) * 1.414

def fft_filter(x, lo=None, hi=None):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR); m = np.ones_like(f)
    if lo: m *= 1 / (1 + (lo / np.maximum(f, 1)) ** 4)
    if hi: m *= 1 / (1 + (f / hi) ** 4)
    return np.fft.irfft(X * m, len(x))

def env(n, a=0.005, d=0.2):
    k = np.arange(n) / SR
    return np.minimum(1, k / a) * np.exp(-k / d)

# ---------- instruments ----------
def kick(big=False):
    n = int(SR * (0.7 if big else 0.42)); k = np.arange(n) / SR
    f = 46 + 110 * np.exp(-k * 28); ph = 2 * np.pi * np.cumsum(f) / SR
    s = np.sin(ph) * np.exp(-k * (4 if big else 7.5))
    s += 0.35 * rng.standard_normal(n) * np.exp(-k * 300)
    return np.tanh(s * 1.6)

def clap():
    n = int(SR * .3); k = np.arange(n) / SR
    nz = fft_filter(rng.standard_normal(n), 900, 5000)
    e = sum(np.exp(-np.maximum(k - o, 0) * 60) * (k >= o) for o in (0, .011, .022)) + 0.6 * np.exp(-k * 14)
    return nz * e * .5

HAT_NOISE = fft_filter(rng.standard_normal(SR), 7000, None)
def hat(open_=False):
    n = int(SR * (.22 if open_ else .05)); k = np.arange(n) / SR
    return HAT_NOISE[:n] * np.exp(-k * (14 if open_ else 80)) * .55

def saw_voice(freq, n, bright=1.0, h=28):
    k = np.arange(n) / SR; s = np.zeros(n)
    for j in range(1, h + 1):
        if freq * j > 15000: break
        s += np.sin(2 * np.pi * freq * j * k + j * .7) / j * np.exp(-j / (6 + 18 * bright))
    return s

def supersaw(freqs, dur, bright=1.0, voices=5):
    n = int(SR * dur); s = np.zeros(n)
    for f in freqs:
        for v in range(voices):
            det = 1 + (v - (voices - 1) / 2) * .0045
            s += saw_voice(f * det, n, bright) / voices
    k = np.arange(n) / SR
    return s * np.minimum(1, k / .02) * np.minimum(1, (dur - k) / .05) / len(freqs)

def pluck(freq, bright=1.0):
    n = int(SR * .35); k = np.arange(n) / SR; s = np.zeros(n)
    for j in (1, 2, 3, 4, 5, 6):
        s += np.sin(2 * np.pi * freq * j * k) / j ** 1.2 * np.exp(-k * (9 + j * 5 * (1.5 - bright)))
    return s * np.minimum(1, k / .002)

def sub(freq, dur):
    n = int(SR * dur); k = np.arange(n) / SR
    s = np.sin(2 * np.pi * freq * k) + .25 * np.sin(4 * np.pi * freq * k)
    return s * np.minimum(1, k / .01) * np.minimum(1, (dur - k) / .03)

def riser(dur):
    n = int(SR * dur); k = np.arange(n) / SR; x = k / dur
    nz = rng.standard_normal(n)
    lo = fft_filter(nz, 300, 2000); hi = fft_filter(nz, 3000, 12000)
    s = (lo * (1 - x) + hi * x) * x ** 2.2
    f = 200 * 2 ** (x * 4); s += .3 * np.sin(2 * np.pi * np.cumsum(f) / SR) * x ** 2
    return s * .6

def whoosh(dur=.45):
    n = int(SR * dur); k = np.arange(n) / SR; x = k / dur
    nz = fft_filter(rng.standard_normal(n), 500, 9000)
    return nz * np.sin(np.pi * x) ** 2 * .45

def impact(big=1.0):
    n = int(SR * 2.2); k = np.arange(n) / SR
    f = 30 + 70 * np.exp(-k * 10)
    boom = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-k * 2.2)
    nz = fft_filter(rng.standard_normal(n), 200, 7000) * np.exp(-k * 6) * .6
    return np.tanh((boom + nz) * 1.4) * big

def blip(freq):
    n = int(SR * .18); k = np.arange(n) / SR
    return (np.sin(2 * np.pi * freq * k) + .3 * np.sin(4 * np.pi * freq * k)) * np.exp(-k * 22) * .5

# ---------- harmonie : Am F C G ----------
CH = [([220, 261.63, 329.63], 55), ([174.61, 220, 261.63], 43.65), ([261.63, 329.63, 392], 65.41), ([196, 246.94, 293.66], 49)]
DROP = [(4, 22), (22, 24), (27, 30)]
def in_drop(x): return any(a <= x < b for a, b in DROP)

PAD = np.zeros(N); BASS = np.zeros(N); ARP = np.zeros(N)
for bar in range(15):
    t0 = bar * BAR; notes, root = CH[bar % 4] if bar < 14 else CH[0]
    dur = BAR + (0.6 if bar == 14 else 0)
    if t0 < 4: bright = .15 + .2 * t0 / 4
    elif 24 <= t0 < 27: bright = .35
    else: bright = 1.0
    s = supersaw(notes + [notes[0] * 2], dur + .05, bright)
    i = int(t0 * SR); PAD[i:i + len(s)] += s[: N - i] * (.55 if t0 >= 4 else .4)
    if t0 >= 4 and not (24 <= t0 < 26):
        b = sub(root, dur); BASS[i:i + len(b)] += b[: N - i]
    # arpège en doubles croches
    seq = [notes[0], notes[1], notes[2], notes[0] * 2, notes[2], notes[1]]
    for st in range(16):
        tt = t0 + st * .125
        if tt >= 29.5: break
        p = pluck(seq[st % 6] * 2, .6 if t0 < 4 else 1.0)
        j = int(tt * SR); ARP[j:j + len(p)] += p[: N - j] * (.18 if t0 < 4 else .14)

# ducking (sidechain) sur les temps pendant les drops
duck = np.ones(N)
ph = (t % BEAT)
drop_mask = np.array([in_drop(x) for x in t[::480]]).repeat(480)[:N]
duck = np.where(drop_mask, 1 - .65 * np.exp(-ph * 9), 1)
PAD *= duck; BASS *= duck; ARP *= (.6 + .4 * duck)
add(PAD * .9, 0, pan=-.0)
# élargissement stéréo du pad : retard de 12 ms sur un côté
d = int(.012 * SR); R[d:] += PAD[:-d] * .25; L[:] += PAD * .05
add(BASS, 0, .55)
# arpège ping-pong
add(ARP, 0, .9, -.35); add(ARP, .375, .45, .5); add(ARP, .75, .22, -.5)

# ---------- batterie ----------
for b in range(int(30 / BEAT)):
    x = b * BEAT
    if in_drop(x): add(kick(), x, .95)
    if in_drop(x) and b % 2 == 1: add(clap(), x, .55, .1)
    if in_drop(x): add(hat(True), x + .25, .3, .25)
    if x < 4 and x >= 1.5: add(hat(), x + .25, .25, .3)
    if in_drop(x):
        for q in (0, .125, .375): add(hat(), x + q, .18, -.3)
# rafale fonctions : roulement de caisse claire avant la cassure
for i, x in enumerate(np.arange(23.0, 24.0, .0625)):
    add(clap(), x, .12 + .3 * i / 16, .0)
# pulsation douce pendant la cassure 24–27
for x in np.arange(25, 27, .5): add(kick() * .5, x, .45)

# ---------- accroche : impacts sur les mots ----------
for x in (0.05, 0.78, 1.52, 2.26):
    add(kick(True), x, .8); add(impact(.35), x, 1)
add(impact(.6), 3.02, 1); add(riser(1.0), 3.0, .9)
add(impact(1.0), 4.0, 1); add(kick(True), 4.0, 1)
# coupes : souffle + impact léger
for c in (7, 10, 13, 16, 19, 22, 24):
    add(whoosh(), c - .3, .9, -.6 + .2 * (c % 3)); add(impact(.25), c, 1)
add(riser(2.0), 25.0, 1.0); add(impact(1.0), 27.0, 1); add(kick(True), 27.0, 1)
# petits signaux d'interface synchronisés
for x, f in ((19.25, 1320), (20.3, 990), (22.05, 880), (22.3, 1047), (22.55, 1175), (22.8, 1319), (16.55, 1047), (14.25, 880)):
    add(blip(f), x, .6, .3)
add(impact(.6), 29.5, 1)

# ---------- réverbération par convolution ----------
irn = int(SR * 1.8); ik = np.arange(irn) / SR
for ch in (0, 1):
    ir = rng.standard_normal(irn) * np.exp(-ik * 3.2); ir = fft_filter(ir, 200, 7000); ir /= np.sqrt((ir ** 2).sum())
    src = L if ch == 0 else R
    M = 1 << int(np.ceil(np.log2(N + irn)))
    wet = np.fft.irfft(np.fft.rfft(src, M) * np.fft.rfft(ir, M), M)[:N]
    if ch == 0: L = L + wet * .22
    else: R = R + wet * .22

# fin : fondu
fade = np.clip((DUR - t) / .9, 0, 1); L *= fade; R *= fade
mix = np.stack([L, R], 1)
mix /= np.abs(mix).max() / .9
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix = mix[: int(30.0 * SR)]
with wave.open("musique.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32000).astype("<i2").tobytes())
print("ok", mix.shape)
