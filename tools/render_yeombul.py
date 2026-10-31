"""염불·목탁·종 음원 합성기 (audio/*.mp3 생성).

선법·반주 근거: Mills & Park, "Everyday Temple Chant in South Korean Chogye Sect
Buddhism" (AAWM 10.1, 2022) — 메나리 E-G-A-C-D(뼈대 E·A·C), 목탁의 일정한 맥,
바리톤 음역, 집전자 + 대중. 선율 자체는 이 곡을 위해 새로 지었다.

사용: python render_yeombul.py <출력 폴더> <곡 이름...>   (numpy, scipy, soundfile 필요)
곡 이름: yeombul gwaneum seokga moktak bell
"""
import os
import sys
import numpy as np
from scipy.signal import fftconvolve, lfilter, resample_poly
import soundfile as sf

SR = 22050          # 음성 내부 렌더링
OUT_SR = 44100
PULSE = 0.8         # 맥당 0.8초 = 분당 75맥
LINE_PULSES = 10    # 음절 + 끝 음절 늘임 + 쉼
MOKTAK_GAP = 4.0    # 목탁 간격(초)
PAD = 0.25          # MP3 앞뒤 인코더 여백을 흡수할 순환 여분(초). sound.js와 맞출 것
FRAME = 0.005
NOTE = {'E': 82.41, 'G': 98.0, 'A': 110.0, 'C': 130.81, 'D': 146.83}
LOOP = 8 * LINE_PULSES * PULSE
rng = np.random.default_rng(108)

#           F1    F2    F3   amp noise nasal
PH = {
    'a': (760, 1280, 2600, 1.0, 0.0, 0.0),
    'u': (350, 830, 2300, 1.0, 0.0, 0.0),
    'i': (290, 2150, 2950, 1.0, 0.0, 0.0),
    'e': (480, 1800, 2550, 1.0, 0.0, 0.0),
    'o': (410, 730, 2450, 1.0, 0.0, 0.0),
    'eu': (350, 1350, 2300, 0.95, 0.0, 0.0),
    'eo': (580, 960, 2450, 1.0, 0.0, 0.0),
    'n': (270, 1500, 2550, 0.38, 0.0, 1.0),
    'm': (260, 1050, 2250, 0.40, 0.0, 1.0),
    'b': (300, 850, 2200, 0.16, 0.0, 0.2),
    'g': (300, 1750, 2350, 0.16, 0.0, 0.1),
    'w': (340, 760, 2300, 0.7, 0.0, 0.0),
    'l': (340, 1100, 2550, 0.62, 0.0, 0.3),
    's': (320, 2000, 3100, 0.0, 0.3, 0.0),
    't': (450, 1650, 2700, 0.0, 0.0, 0.0),   # 폐쇄
    'h': (760, 1400, 2650, 0.0, 0.55, 0.0),  # 파열·기식
}

# 음절: (초성 [(음소, 길이)], 모음, 받침). 마지막 음절을 3맥 늘인다
N, M, B, G, S = [('n', 0.075)], [('m', 0.085)], [('b', 0.05)], [('g', 0.05)], [('s', 0.11)]
TEXTS = {
    'yeombul': ([(N, 'a', None), (M, 'u', None), ([], 'a', None), (M, 'i', None), ([('t', 0.05), ('h', 0.055)], 'a', None), (B, 'u', 'l')],
                ['AAGAGA', 'AACAAA', 'GAAAGA', 'AACAGA'], [0, 1, 0, 2, 1, 0, 3, 2]),
    'gwaneum': ([(G + [('w', 0.06)], 'a', 'n'), (S, 'e', None), ([], 'eu', 'm'), (B, 'o', None), (S, 'a', 'l')],
                ['AACAA', 'AAGAA', 'GAACA', 'ACAGA'], [0, 1, 0, 2, 3, 0, 1, 2]),
    'seokga': ([(S, 'eo', 't'), (G, 'a', None), (M, 'o', None), (N, 'i', None), (B, 'u', 'l')],
               ['AGAAA', 'ACAGA', 'AAAGA', 'GAACA'], [0, 1, 2, 1, 0, 3, 1, 2]),
}


def tracks(line_list, syls, formant_k, jitter_t):
    """줄 시작 시각 목록에서 5ms 프레임 궤적을 만든다."""
    n = int(LOOP / FRAME)
    t = np.arange(n) * FRAME
    keys = []  # (time, F1, F2, F3, amp, noise, nasal)
    pitch_t, pitch_v, vib = [], [], np.zeros(n)
    for start, cell in line_list:
        T = start
        for i, (onset, v, coda) in enumerate(syls):
            last = i == len(syls) - 1
            D = PULSE * (3 if last else 1)
            on = T + jitter_t
            accent = 1.0 if i % 2 == 0 else 0.94
            shape = accent * (1 - 0.035 * i)
            cur = on - sum(d for _, d in onset)
            for ph, d in onset:
                keys += [(cur, *PH[ph]), (cur + d * 0.75, *PH[ph])]
                cur += d
            vow = PH[v]
            a = (vow[0], vow[1], vow[2], vow[3] * shape, vow[4], vow[5])
            keys.append((on + 0.045, *a))
            if not last:
                end = T + D - 0.09 + jitter_t
                if coda:
                    c = PH[coda]
                    keys += [(end - 0.13, *a), (end - 0.07, *c), (end, *c)]
                else:
                    keys.append((end, *a))
            else:
                keys.append((T + D * 0.52, *a))
                c = PH[coda]
                keys += [(T + D * 0.62, c[0], c[1], c[2], c[3] * shape, 0, c[5]),
                         (T + D * 0.74, c[0], c[1], c[2], c[3] * shape * 0.55, 0, c[5]),
                         (T + D * 0.82, c[0], c[1], c[2], 0, 0, c[5]),
                         (T + D * 0.98, c[0], c[1], c[2], 0, 0, c[5])]
                s0, s1 = np.searchsorted(t, [T + 0.45, T + D * 0.74])
                vib[s0:s1] = np.linspace(0, 1, max(s1 - s0, 1))
            pitch_t += [on - 0.03, on + D - 0.1]
            f = NOTE[cell[i]]
            pitch_v += [f, f]
            T += D
    keys.sort(key=lambda k: k[0])
    k = np.array(keys)
    out = [np.interp(t, k[:, 0], k[:, j]) for j in range(1, 7)]
    F1, F2, F3 = (o * formant_k for o in out[:3])
    amp, noise, nasal = out[3:]
    f0 = np.interp(t, pitch_t, np.log(pitch_v))
    win = np.hanning(19)
    win /= win.sum()
    smooth = lambda x: np.convolve(np.r_[x[-20:], x, x[:20]], win, 'same')[20:-20]
    return t, F1, F2, F3, smooth(smooth(amp)), noise, nasal, smooth(f0), vib


def voice(lines, syls, detune_cents, formant_k, jitter_t, rate, depth, breath=0.035, rasp=0.02):
    t, F1, F2, F3, amp, noise, nasal, logf0, vib = tracks(lines, syls, formant_k, jitter_t)
    n_s = int(LOOP * SR)
    ts = np.arange(n_s) / SR
    wander = np.interp(ts, np.linspace(0, LOOP, 240), np.convolve(rng.normal(0, 1, 240), np.ones(5) / 5, 'same'))
    f0 = np.exp(np.interp(ts, t, logf0)) * 2 ** (detune_cents / 1200)
    f0 *= 2 ** ((np.interp(ts, t, vib) * depth * np.sin(2 * np.pi * rate * ts) + wander * 7) / 1200)
    f0 *= 1 + rng.normal(0, 0.0022, n_s)          # 지터
    phase = np.cumsum(f0) / SR
    p = phase % 1.0
    op, cl = 0.58, 0.72                           # Rosenberg 성문 흐름 → 미분
    flow = np.where(p < op, 0.5 * (1 - np.cos(np.pi * p / op)),
                    np.where(p < cl, np.cos(np.pi * (p - op) / (2 * (cl - op))), 0.0))
    src = np.diff(flow, prepend=flow[0]) * SR / 110
    a_s = np.interp(ts, t, amp)
    cyc = np.floor(phase).astype(int)
    shim = 1 + rng.normal(0, 0.028, cyc.max() + 2)[cyc]  # 시머
    white = rng.normal(0, 1, n_s)
    src = src * a_s * shim * (1 + rasp * white)
    src += white * (breath * a_s * (flow * 0.8 + 0.2) + 0.5 * np.interp(ts, t, noise))

    hop = int(SR * FRAME)                         # 포먼트 직렬 공명기, 5ms 블록마다 계수 갱신
    nb = n_s // hop
    F = [F1, F2, F3, np.full_like(F1, 3350 * formant_k), np.full_like(F1, 4150 * formant_k)]
    BW = [80 + 50 * nasal, 100 + 40 * nasal, 140 + 60 * nasal, 220 * np.ones_like(F1), 300 * np.ones_like(F1)]
    y = src[:nb * hop].copy()
    tb = (np.arange(nb) + 0.5) * hop / SR
    for f, bw in zip(F, BW):
        f = np.interp(tb, t, f); bw = np.interp(tb, t, bw)
        r = np.exp(-np.pi * bw / SR)
        a1 = 2 * r * np.cos(2 * np.pi * f / SR)
        a2 = -r * r
        b0 = 1 - a1 - a2
        zi = np.zeros(2)
        for b in range(nb):
            s = b * hop
            y[s:s + hop], zi = lfilter([b0[b]], [1, -a1[b], -a2[b]], y[s:s + hop], zi=zi)
    na = np.interp(ts[:nb * hop], t, nasal)       # 비음 공명
    r = np.exp(-np.pi * 90 / SR)
    nres = lfilter([1 - 2 * r * np.cos(2 * np.pi * 270 / SR) + r * r], [1, -2 * r * np.cos(2 * np.pi * 270 / SR), r * r], y)
    y = y * (1 - 0.65 * na) + nres * 0.9 * na
    y = np.pad(y, (0, n_s - len(y)))
    y = resample_poly(y, OUT_SR, SR)
    return y / (np.max(np.abs(y)) + 1e-9)


def strike(buf, at, modes, level):
    i = int(at * OUT_SR) % len(buf)
    dur = int(max(m[2] for m in modes) * 7 * OUT_SR)
    tt = np.arange(dur) / OUT_SR
    w = np.zeros(dur)
    for f, a, d in modes:
        w += a * np.sin(2 * np.pi * f * tt) * np.exp(-tt / d)
    w[:40] *= np.linspace(0, 1, 40)
    idx = (i + np.arange(dur)) % len(buf)
    np.add.at(buf, idx, w * level)


def impulse(rt, seed):
    r = np.random.default_rng(seed)
    n = int(rt * 1.3 * OUT_SR)
    tt = np.arange(n) / OUT_SR
    ir = r.normal(0, 1, n) * np.exp(-6.9 * tt / rt)
    ir = lfilter([0.3], [1, -0.7], ir)         # 나무 법당의 고역 흡음
    ir = np.r_[np.zeros(int(0.02 * OUT_SR)), ir]
    for d, a in [(0.031, 0.5), (0.047, 0.42), (0.071, 0.3), (0.093, 0.26), (0.127, 0.18)]:
        ir[int(d * r.uniform(0.9, 1.1) * OUT_SR)] += a * 3
    return ir / np.sqrt(np.sum(ir ** 2))


def circular(x, ir):
    y = fftconvolve(x, ir)
    out = y[:len(x)].copy()
    tail = y[len(x):]
    for k in range(0, len(tail), len(x)):
        seg = tail[k:k + len(x)]
        out[:len(seg)] += seg
    return out


hp = lambda x: x - lfilter([0.012], [1, -0.988], x)
MOKTAK = lambda: [(500 * rng.uniform(.997, 1.003), 1, 0.06), (830, 0.2, 0.03)]


def write(path, st):
    pad = int(PAD * OUT_SR)
    full = np.concatenate([st[-pad:], st, st[:pad]])
    sf.write(path, full, OUT_SR, format='MP3', bitrate_mode='CONSTANT', compression_level=0.62)
    print(os.path.basename(path), 'peak', round(float(np.max(np.abs(st))), 3), 'rms dB', round(float(20 * np.log10(np.sqrt(np.mean(st ** 2)))), 1))


def chant(name, path):
    syls, cells, order = TEXTS[name]
    # 첫 줄을 한 맥 뒤에서 시작해 반복 이음매가 쉼 구간에 오게 한다
    line_t = [((i * LINE_PULSES + 1) * PULSE, cells[c]) for i, c in enumerate(order)]
    N_ = int(LOOP * OUT_SR)
    # 집전 스님 한 분과 멀리서 따라 하는 두 분. 숨을 섞어 낮게 부른다
    leader = voice(line_t, syls, 0, 1.0, 0.0, 4.4, 9, breath=0.06, rasp=0.008)
    L, R = leader * 0.7, leader * 0.7
    for det, fk, jit, rate, depth, pan, gain in [(-7, 0.97, 0.03, 4.8, 6, 0.28, 0.2), (6, 1.03, -0.028, 4.1, 7, 0.72, 0.18)]:
        v = voice(line_t, syls, det, fk, jit, rate, depth, breath=0.07, rasp=0.008)
        L += v * gain * np.cos(pan * np.pi / 2)
        R += v * gain * np.sin(pan * np.pi / 2)
    # 목탁은 멀리서 들리듯 낮고 둥글게, 4초(다섯 맥)에 한 번
    per_l, per_r = np.zeros(N_), np.zeros(N_)
    for p in range(1, len(order) * LINE_PULSES, 5):
        m = MOKTAK()
        strike(per_l, p * PULSE, m, 0.13)
        strike(per_r, p * PULSE, m, 0.13)
    for li in range(0, len(order), 4):   # 경쇠는 네 줄에 한 번, 아주 작게
        kk = [(1046, 1, 1.1), (2410, 0.18, 0.5)]
        at = li * LINE_PULSES * PULSE + 0.1
        strike(per_l, at, kk, 0.016)
        strike(per_r, at, kk, 0.016)
    soften = lambda x: lfilter([0.27], [1, -0.73], x)
    L, R = soften(L), soften(R)
    irl, irr = impulse(2.8, 11), impulse(2.8, 22)
    vl, vr = L * 0.62 + circular(L, irl) * 0.5, R * 0.62 + circular(R, irr) * 0.5
    wl, wr = per_l * 0.6 + circular(per_l, irl) * 0.35, per_r * 0.6 + circular(per_r, irr) * 0.35
    st = np.stack([hp(vl) + wl, hp(vr) + wr], 1)
    st *= 10 ** (-27 / 20) / np.sqrt(np.mean(st ** 2))
    write(path, st)


def moktak(path):
    N_ = int(LOOP * OUT_SR)
    l, r = np.zeros(N_), np.zeros(N_)
    # 4초에 한 번, 아주 느리게. 이음매가 울림 사이에 오도록 2초 뒤부터 친다
    for k, at in enumerate(np.arange(2.0, LOOP, MOKTAK_GAP)):
        lv = 0.3 if k % 2 == 0 else 0.24
        m = MOKTAK()
        strike(l, at, m, lv * 0.97)
        strike(r, at, m, lv)
    irl, irr = impulse(2.8, 31), impulse(2.8, 32)
    st = np.stack([l * 0.7 + circular(l, irl) * 0.42, r * 0.7 + circular(r, irr) * 0.42], 1)
    st *= 0.34 / np.max(np.abs(st))
    write(path, st)


def bell(path):
    N_ = int(LOOP * OUT_SR)
    l, r = np.zeros(N_), np.zeros(N_)
    base = 88
    parts = [(0.5, 0.5, 9), (1, 0.42, 7.5), (1.009, 0.3, 7), (1.19, 0.14, 5), (1.5, 0.12, 4), (2, 0.11, 3.2), (2.51, 0.06, 2.2), (3.01, 0.04, 1.5), (4.17, 0.02, 0.9)]
    for at in (0.0, 16.0, 32.0, 48.0):
        ml = [(base * a, b, c) for a, b, c in parts]
        mr = [(base * a * 1.0015, b, c) for a, b, c in parts]
        strike(l, at, ml, 1)
        strike(r, at, mr, 1)
    irl, irr = impulse(3.6, 41), impulse(3.6, 42)
    st = np.stack([l * 0.8 + circular(l, irl) * 0.3, r * 0.8 + circular(r, irr) * 0.3], 1)
    st = np.stack([hp(st[:, 0]), hp(st[:, 1])], 1)
    st *= 0.34 / np.max(np.abs(st))
    write(path, st)


if __name__ == '__main__':
    out = sys.argv[1]
    for name in sys.argv[2:]:
        path = os.path.join(out, name + '.mp3')
        if name in TEXTS:
            chant(name, path)
        elif name == 'moktak':
            moktak(path)
        elif name == 'bell':
            bell(path)
        else:
            raise SystemExit('모르는 곡: ' + name)
