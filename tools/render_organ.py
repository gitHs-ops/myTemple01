"""성당 소리 합성기 (audio/organ.mp3, audio/choir.mp3 생성). 녹음을 쓰지 않고 새로 지은 화음이다.

사용: python render_organ.py <출력 폴더>   (numpy, soundfile 필요)
64초 고리이고 앞뒤에 0.25초를 덧붙인다 (sound.js의 CHANT_PAD, CHANT_LOOP와 같아야 한다).
"""
import os, sys
import numpy as np, soundfile as sf

SR, PAD, LOOP = 44100, 0.25, 64
L = SR * LOOP
rng = np.random.default_rng(7)
hz = lambda m: 440 * 2 ** ((m - 69) / 12)

# F장조 8화음, 화음당 8초
CHORDS = [[41, 57, 60, 65], [38, 57, 62, 65], [34, 58, 62, 65], [36, 55, 60, 64],
          [41, 57, 60, 69], [33, 57, 60, 64], [31, 55, 58, 62], [36, 55, 60, 64]]
BEAT = LOOP / len(CHORDS)

def env(n, a, r):
    e = np.ones(n); A, R = int(a * SR), int(r * SR)
    e[:A] = np.sin(np.linspace(0, np.pi / 2, A)) ** 2
    e[-R:] = np.cos(np.linspace(0, np.pi / 2, R)) ** 2
    return e

def put(buf, start, sig):
    idx = (start + np.arange(len(sig))) % L
    np.add.at(buf, idx, sig)

def organ_note(m, n):
    t = np.arange(n) / SR; f = hz(m); s = np.zeros(n)
    # 8', 4', 2' 관의 배음
    for k, a in [(1, 1), (2, .55), (3, .18), (4, .3), (5, .06), (6, .07), (8, .05)]:
        if f * k > 7000: continue
        s += a * np.sin(2 * np.pi * f * k * (1 + rng.uniform(-.0004, .0004)) * t + rng.uniform(0, 6.28))
    return s * (1 + .05 * np.sin(2 * np.pi * 4.6 * t))   # 바람이 흔들리는 정도

def choir_note(m, n):
    t = np.arange(n) / SR; out = np.zeros(n)
    # 몇 사람이 조금씩 어긋나게 '아' 모음으로 부른다
    for _ in range(5):
        f0 = hz(m) * (1 + rng.uniform(-.0035, .0035))
        ph = 2 * np.pi * np.cumsum(f0 * (1 + .006 * np.sin(2 * np.pi * rng.uniform(4.6, 5.4) * t + rng.uniform(0, 6.28)))) / SR
        for k in range(1, 16):
            fk = f0 * k
            if fk > 5000: break
            g = sum(a * np.exp(-((fk - c) / w) ** 2) for c, w, a in [(700, 170, 1), (1150, 190, .55), (2600, 300, .14)]) + .05 / k
            out += g * np.sin(k * ph + rng.uniform(0, 6.28))
    return out

def hall(dry, secs, wet):
    """원형 합성곱이라 고리 이음매에 잔향이 끊기지 않는다"""
    out = np.zeros((L, 2))
    tail = int(secs * SR)
    for c in range(2):
        ir = np.zeros(L); ir[:tail] = rng.standard_normal(tail) * np.exp(-6.9 * np.arange(tail) / tail)
        spec = np.fft.rfft(ir); spec[np.fft.rfftfreq(L, 1 / SR) > 4200] *= .25
        w = np.fft.irfft(np.fft.rfft(dry) * spec, L)
        out[:, c] = dry * (1 - wet) + w / np.sqrt((ir ** 2).sum()) * wet
    return out

def render(note, name, voices, secs, wet, target):
    dry = np.zeros(L)
    for i, ch in enumerate(CHORDS):
        n = int((BEAT + 2.4) * SR)
        for j, m in enumerate(ch):
            if j not in voices: continue
            put(dry, int(i * BEAT * SR), note(m, n) * env(n, 1.5, 2.4) * (1.25 if j == 0 else 1))
    x = hall(dry, secs, wet)
    x -= x.mean(0)
    x *= 10 ** (target / 20) / np.sqrt((x ** 2).mean())
    x = .8 * np.tanh(x / .8)
    P = int(PAD * SR)
    full = np.concatenate([x[-P:], x, x[:P]])
    sf.write(os.path.join(OUT, name + '.mp3'), full, SR, format='MP3', bitrate_mode='CONSTANT', compression_level=.72)
    print(name, 'rms', round(20 * np.log10(np.sqrt((x ** 2).mean())), 1), 'peak', round(float(np.abs(x).max()), 2))

OUT = sys.argv[1]
render(organ_note, 'organ', {0, 1, 2, 3}, 4.5, .5, -22)
render(choir_note, 'choir', {1, 2, 3}, 5, .55, -22)
