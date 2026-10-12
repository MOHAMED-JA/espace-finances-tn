"""Bande-son de la vidéo 45 s (120 BPM, la mineur, cadence finale en do majeur), entièrement synthétisée.
Calée sur les scènes : intro 0–4, logo 4–8, drop 8–22, respiration 22–30, second drop 30–40, final 40–45.
Sortie : musique.wav (48 kHz stéréo)."""
import numpy as np, wave

SR = 48000; DUR = 45.6; N = int(SR * DUR); BEAT = .5; BAR = 2.0
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

# ---------- harmonie : Am F C G, final F G C ----------
AM, F, C, G = ([220, 261.63, 329.63], 55), ([174.61, 220, 261.63], 43.65), ([261.63, 329.63, 392], 65.41), ([196, 246.94, 293.66], 49)
PROG = [AM, F, C, G]
def accord(bar): return {20: F, 21: G, 22: C}.get(bar, PROG[bar % 4])
PLEIN = [(8, 22), (30, 40)]
def in_drop(x): return any(a <= x < b for a, b in PLEIN)
def calme(x): return 22 <= x < 30

PAD = np.zeros(N); BASS = np.zeros(N); ARP = np.zeros(N)
for bar in range(23):
    t0 = bar * BAR; notes, root = accord(bar)
    dur = BAR + (1.6 if bar == 22 else 0)
    if t0 < 4: bright = .15 + .2 * t0 / 4
    elif t0 < 8: bright = .65
    elif calme(t0): bright = .4
    else: bright = 1.0
    s = supersaw(notes + [notes[0] * 2], dur + .05, bright)
    i = int(t0 * SR); PAD[i:i + len(s)] += s[: N - i] * (.55 if t0 >= 4 else .4)
    if t0 >= 4 and not (22 <= t0 < 24):
        b = sub(root, dur); BASS[i:i + len(b)] += b[: N - i] * (.7 if calme(t0) else 1)
    seq = [notes[0], notes[1], notes[2], notes[0] * 2, notes[2], notes[1]]
    pas = 16 if bar < 20 else 8
    for st in range(pas):
        tt = t0 + st * (BAR / pas)
        if tt >= 44.4: break
        p = pluck(seq[st % 6] * 2, .6 if t0 < 4 else 1.0)
        j = int(tt * SR); ARP[j:j + len(p)] += p[: N - j] * (.18 if t0 < 4 else .14)

# ducking (sidechain) sur les temps pendant les drops
ph = (t % BEAT)
drop_mask = np.array([in_drop(x) for x in t[::480]]).repeat(480)[:N]
duck = np.where(drop_mask, 1 - .65 * np.exp(-ph * 9), 1)
PAD *= duck; BASS *= duck; ARP *= (.6 + .4 * duck)
add(PAD * .9, 0)
d = int(.012 * SR); R[d:] += PAD[:-d] * .25; L[:] += PAD * .05
add(BASS, 0, .55)
add(ARP, 0, .9, -.35); add(ARP, .375, .45, .5); add(ARP, .75, .22, -.5)

# ---------- batterie ----------
for b in range(int(45 / BEAT)):
    x = b * BEAT
    if in_drop(x):
        add(kick(), x, .95)
        if b % 2 == 1: add(clap(), x, .55, .1)
        add(hat(True), x + .25, .3, .25)
        for q in (0, .125, .375): add(hat(), x + q, .18, -.3)
    elif 4 <= x < 8:                       # logo : demi-temps
        if b % 2 == 0: add(kick(), x, .8)
        add(hat(), x + .25, .22, .3)
    elif 26 <= x < 30:                     # respiration : pouls doux
        if b % 2 == 0: add(kick() * .55, x, .5)
        add(hat(), x + .25, .14, .3)
    elif 2.5 <= x < 4: add(hat(), x + .25, .25, .3)
# roulement de caisse claire avant le second drop
for i, x in enumerate(np.arange(29.0, 30.0, .0625)):
    add(clap(), x, .12 + .3 * i / 16, .0)

# ---------- accroche, coupes, temps forts ----------
add(kick(True), .25, .8); add(impact(.4), .25, 1)
add(kick(True), 1.75, .8); add(impact(.5), 1.75, 1)
add(riser(1.0), 3.0, .9)
for x in (4.0, 30.0, 40.0):
    add(impact(1.0), x, 1); add(kick(True), x, 1)
add(impact(.6), 8.0, 1)
for c in (8, 13, 18, 22, 26, 34):
    add(whoosh(), c - .3, .9, -.6 + .2 * (c % 3)); add(impact(.25), c, 1)
add(riser(2.0), 28.0, 1.0)
# signaux d'interface synchronisés aux images
for x, f in ((9.0, 880), (9.25, 988), (9.5, 1175), (13.95, 1320), (18.7, 1047), (24.4, 1319)):
    add(blip(f), x, .6, .3)
for i in range(8): add(blip(784 * 2 ** (i / 12 * 2)), 30.5 + i * .25, .5, -.3 + .1 * i)
for i in range(8): add(blip(1047 * 2 ** ((i % 4) / 12 * 3)), 35.0 + i * .18, .35, .4 - .1 * i)
add(impact(.7), 44.0, 1)

# ---------- réverbération par convolution ----------
irn = int(SR * 1.8); ik = np.arange(irn) / SR
for ch in (0, 1):
    ir = rng.standard_normal(irn) * np.exp(-ik * 3.2); ir = fft_filter(ir, 200, 7000); ir /= np.sqrt((ir ** 2).sum())
    src = L if ch == 0 else R
    M = 1 << int(np.ceil(np.log2(N + irn)))
    wet = np.fft.irfft(np.fft.rfft(src, M) * np.fft.rfft(ir, M), M)[:N]
    if ch == 0: L = L + wet * .22
    else: R = R + wet * .22

fade = np.clip((45.0 - t) / 1.4, 0, 1); L *= fade; R *= fade
mix = np.stack([L, R], 1)
mix /= np.abs(mix).max() / .9
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix = mix[: int(45.0 * SR)]
with wave.open("musique.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32000).astype("<i2").tobytes())
print("ok", mix.shape)
