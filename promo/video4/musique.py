"""Bande-son de la vidéo 4 « Orbite » (30 s, 16:9), entièrement synthétisée (aucun son sous licence) :
électro-pop 120 BPM, ré majeur (si m – sol – ré – la), calée sur les images :
écran qui s'allume et question tapée 0–3 (frappes), envoi 3,0 (impact), courbe brut → net 3–7 (demi-temps),
pistes 7–11 (drop), noyau 3D 11–15, compteur qui ralentit 15–17 puis « 1 seule application » 17 (impact),
lanceur 19–22,7 (icônes qui tombent, palette tapée), explosion du logo 23,0, logo reformé 25,45,
drapeau 25,75, final 27 (accord tenu), fondu 29,7–30. Sortie : musique.wav (48 kHz stéréo)."""
import numpy as np, wave

SR = 48000; DUR = 31.0; N = int(SR * DUR); BEAT = .5; BAR = 2.0
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


def lead(freq, dur=.24):
    s = pluck(freq, 1.0) * .8
    st = supersaw([freq], dur, 1.0, voices=3); n = min(len(s), len(st))
    out = s.copy(); out[:n] += st[:n] * .45 * np.exp(-np.arange(n) / SR * 9)
    return out

def bell(freq, dur=1.6):
    n = int(SR * dur); k = np.arange(n) / SR; s = np.zeros(n)
    for j, a in ((1, 1), (2.76, .5), (5.4, .25), (8.9, .12)):
        s += a * np.sin(2 * np.pi * freq * j * k) * np.exp(-k * (2.2 + j * .9))
    return s * np.minimum(1, k / .003) * .35

def sweep(dur):
    n = int(SR * dur); x = np.arange(n) / n
    nz = rng.standard_normal(n); lo = fft_filter(nz, 400, 1500); hi = fft_filter(nz, 2500, 9000)
    return (lo * (1 - x) + hi * x) * np.sin(np.pi * x) ** 1.5 * .5


# ---------- harmonie : si m – sol – ré – la, final ré ----------
BM, G, D, A = ([246.94, 293.66, 369.99], 61.74), ([196, 246.94, 293.66], 49.0), ([293.66, 369.99, 440], 73.42), ([220, 277.18, 329.63], 55.0)
def accord(bar): return D if bar >= 13 else [BM, G, D, A][bar % 4]
def plein(x): return 7 <= x < 15 or 17 <= x < 21
def demi(x): return 3 <= x < 7 or 21 <= x < 22.5 or 25.5 <= x < 27
def coupe(x): return 22.5 <= x < 23.0 or 15.0 <= x < 15.5

PAD = np.zeros(N); BASS = np.zeros(N); ARP = np.zeros(N); LEAD = np.zeros(N)
for bar in range(15):
    t0 = bar * BAR; notes, root = accord(bar); dur = BAR + (1.2 if bar == 14 else 0)
    bright = .12 + .3 * t0 / 3 if t0 < 3 else (.55 if t0 < 7 else (1.0 if t0 < 27 else .75))
    s = supersaw(notes + [notes[0] * 2], dur + .05, bright)
    i = int(t0 * SR); PAD[i:i + len(s)] += s[: N - i] * (.42 if t0 < 3 else .5)
    if t0 >= 3:
        for q in range(4):
            tq = t0 + q * BEAT
            if tq >= 27 or coupe(tq) or 23 <= tq < 25.5: continue
            b = sub(root * (2 if q % 2 else 1), .22); j = int((tq + .25) * SR); BASS[j:j + len(b)] += b[: N - j] * .9
            b0 = sub(root, .2); j = int(tq * SR); BASS[j:j + len(b0)] += b0[: N - j] * .6
    seq = [notes[0], notes[2], notes[1] * 2, notes[0] * 2, notes[2], notes[1]]
    for st in range(16):
        tt = t0 + st * .125
        if tt >= 29.5 or coupe(tt) or tt < 1.0: continue
        p = pluck(seq[st % 6] * 2, .5 if t0 < 7 else 1.0)
        j = int(tt * SR); ARP[j:j + len(p)] += p[: N - j] * (.08 if t0 < 3 else (.07 if 23 <= tt < 25.5 else .12))

B4, CS5, D5, E5, FS5, A5 = 493.88, 554.37, 587.33, 659.26, 739.99, 880.0
MEL = [[FS5, 0, FS5, E5, D5, 0, B4, D5], [E5, 0, D5, B4, D5, 0, E5, 0], [FS5, 0, A5, 0, FS5, E5, D5, 0], [E5, 0, CS5, 0, E5, 0, FS5, E5]]
for bar in range(15):
    t0 = bar * BAR
    for st, f in enumerate(MEL[bar % 4]):
        tt = t0 + st * .25
        if not f or not plein(tt): continue
        l = lead(f); j = int(tt * SR); LEAD[j:j + len(l)] += l[: N - j] * .3

ph = (t % BEAT)
mask = np.array([plein(x) or demi(x) for x in t[::480]]).repeat(480)[:N]
duck = np.where(mask, 1 - .6 * np.exp(-ph * 9), 1)
PAD *= duck; BASS *= duck; ARP *= (.6 + .4 * duck)
add(PAD * .85, 0); d = int(.012 * SR); R[d:] += PAD[:-d] * .25; L[:] += PAD * .05
add(BASS, 0, .55)
add(ARP, 0, .8, -.4); add(ARP, .375, .4, .45)
add(LEAD, 0, .9, .1); add(LEAD, .25, .25, -.4)

# ---------- batterie ----------
for b in range(60):
    x = b * BEAT
    if plein(x):
        add(kick(), x, .95)
        if b % 2 == 1: add(clap(), x, .55, .1)
        add(hat(True), x + .25, .26, .25)
        for q in (0, .125, .375): add(hat(), x + q, .16, -.3)
    elif demi(x):
        if b % 2 == 0: add(kick(), x, .85)
        if b % 4 == 2: add(clap(), x, .5)
        add(hat(), x + .25, .2, .3)
    elif 1.2 <= x < 3 and b % 2 == 1: add(kick() * .5, x, .45)          # battement de cœur pendant la frappe

# ---------- bruitages calés sur l'image ----------
def touche():
    n = int(SR * .05); k = np.arange(n) / SR
    return fft_filter(rng.standard_normal(n), 1800, 9000) * np.exp(-k * 120) * .5
for (q0, q1, nb, g) in ((.8, 2.8, 28, .22), (21.35, 22.1, 14, .2)):  # frappes : la question, puis « assurance auto »
    for i in range(nb): add(touche(), q0 + i * (q1 - q0) / (nb - 1) + rng.uniform(-.01, .01), g * rng.uniform(.7, 1.1), rng.uniform(-.3, .3))
add(bell(FS5), .25, .4, .2); add(bell(A5), .9, .3, -.1)              # l'écran s'allume
add(whoosh(.6), .35, .6, -.4)                                         # trait de lumière
add(riser(1.6), 1.4, .7)
add(impact(.8), 3.0, 1); add(kick(True), 3.0, .9); add(blip(1568), 2.85, .4, .2)   # envoi de la question
add(sweep(1.0), 3.15, .4, .2)                                         # la courbe s'élance
add(bell(D5 * 2, 1.6), 5.55, .45, .2); add(blip(1320), 5.55, .35)     # le net apparaît
for c in (7.0, 11.0, 19.0):
    add(whoosh(), c - .3, .8, -.5 + .3 * (c % 2)); add(impact(.3), c, 1)
add(impact(.35), 9.5, 1); add(bell(A5, 1.4), 9.5, .35, .3); add(blip(1175), 9.85, .4, -.2)   # fin du crédit, +520 DT
add(sweep(1.0), 13.2, .45, -.3)                                       # l'anneau se dessine
for i in range(3): add(blip((1320, 1568, 1760)[i]), 13.75 + i * .12, .3, -.3 + .3 * i)
# compteur : tambour qui ralentit puis s'arrête sur « 1 »
x = 15.7
while x < 17.0:
    add(touche() * 1.4, x, .35, rng.uniform(-.2, .2)); u = (x - 15.7) / 1.3; x += .035 + .2 * u ** 2
add(riser(1.3), 15.7, .5)
add(impact(1.0), 17.0, 1); add(kick(True), 17.0, 1); add(bell(D5 * 2, 2.0), 17.0, .45)
for i in range(4): add(kick() * .6, 19.05 + i * .18 + .5, .5, -.45 + .3 * i); add(blip(880 * (1 + i * .25)), 19.6 + i * .18, .2, -.45 + .3 * i)   # icônes qui tombent
add(whoosh(.4), 20.75, .7, .3)                                        # palette Ctrl K
add(blip(1760), 21.95, .45, .2)                                       # « Assurance auto » choisie
add(riser(.7), 22.3, .9)
add(impact(1.0), 23.0, 1); add(kick(True), 23.0, 1)                   # le logo éclate en pixels
add(sweep(2.4), 23.1, .55, .2)
for i, f in enumerate((D5 * 2, FS5 * 2, A5 * 2, E5 * 2, D5 * 4)): add(bell(f, 1.4), 23.3 + i * .38, .18, -.4 + .2 * i)   # pixels qui scintillent
add(riser(.8), 24.7, .5)
add(impact(.6), 25.45, 1); add(bell(D5 * 2, 1.6), 25.45, .4)          # logo reformé
for f in (D5, FS5, A5): add(bell(f, 1.8), 25.75, .25, .1)            # drapeau
add(impact(1.0), 27.0, 1); add(kick(True), 27.0, 1)
for f in (D5, FS5, A5, D5 * 2): add(bell(f, 3.0), 27.0, .35, .1)
add(bell(A5, 2.0), 28.2, .35, -.2)                                    # adresse du site

# ---------- réverbération par convolution ----------
irn = int(SR * 2.0); ik = np.arange(irn) / SR
for ch in (0, 1):
    ir = rng.standard_normal(irn) * np.exp(-ik * 2.8); ir = fft_filter(ir, 200, 7000); ir /= np.sqrt((ir ** 2).sum())
    src = L if ch == 0 else R
    M = 1 << int(np.ceil(np.log2(N + irn)))
    wet = np.fft.irfft(np.fft.rfft(src, M) * np.fft.rfft(ir, M), M)[:N]
    if ch == 0: L = L + wet * .24
    else: R = R + wet * .24

fade = np.clip((30.0 - t) / 1.4, 0, 1); L *= fade; R *= fade
mix = np.stack([L, R], 1)
mix /= np.abs(mix).max() / .9
mix = np.tanh(mix * 1.3) / np.tanh(1.3)
mix = mix[: int(30.0 * SR)]
with wave.open("musique.wav", "wb") as w:
    w.setnchannels(2); w.setsampwidth(2); w.setframerate(SR)
    w.writeframes((mix * 32000).astype("<i2").tobytes())
print("ok", mix.shape)
