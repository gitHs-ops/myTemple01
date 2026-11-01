# 받은 녹음을 잘라 고리로 잇고 크기를 맞춘다. 원본 출처는 audio/CREDITS.txt
# 사용: python render_ambience.py <원본 폴더> <출력 폴더>   (numpy, scipy, soundfile 필요)
# 원본 파일 이름은 wind2, stream1, rain4, forest1, night1. libsndfile이 읽지 못하는 것은 .f32(+.meta "표본율 채널수")로 풀어 둔다
import os, sys
import numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt, resample_poly

RAW, OUT = sys.argv[1], sys.argv[2]
SR, PAD, XF = 44100, 0.25, 3.0   # PAD는 sound.js의 CHANT_PAD와 같아야 한다

def load(k):
    f32 = os.path.join(RAW, k + ".f32")
    if os.path.exists(f32):
        sr, nc = map(int, open(os.path.join(RAW, k + ".meta")).read().split())
        return np.fromfile(f32, dtype='<f4').reshape(-1, nc).astype(float), sr
    f = [x for x in os.listdir(RAW) if x.startswith(k + ".")][0]
    return sf.read(os.path.join(RAW, f), always_2d=True)

# 이름, 원본, 시작(초), 고리 길이(초, sound.js의 AMB_LOOP와 맞출 것), 저역 제거, 고역 제거, 목표 RMS(dB)
JOBS = [("amb_wind",   "wind2",   95, 58, 110, None,  -28),
        ("amb_stream", "stream1",  4, 60,  80, 3800,  -28),
        ("amb_rain",   "rain4",    0, 57, 320, None,  -28),
        ("amb_forest", "forest1",  3, 47, 200, None,  -34),
        ("amb_night",  "night1",   0, 27, 200, 13000, -36)]

for name, k, st, dur, hp, lp, target in JOBS:
    d, sr = load(k)
    if sr != SR: d = resample_poly(d, SR, sr, axis=0)
    a, L, X = int(st * SR), int(dur * SR), int(XF * SR)
    seg = d[a:a + L + X].copy()
    assert len(seg) == L + X, (name, len(seg) / SR)
    seg = sosfilt(butter(2, hp, 'hp', fs=SR, output='sos'), seg, axis=0)
    if lp: seg = sosfilt(butter(2, lp, 'lp', fs=SR, output='sos'), seg, axis=0)
    w = np.linspace(0, 1, X)[:, None]
    loop = seg[:L].copy()
    loop[:X] = seg[:X] * np.sqrt(w) + seg[L:L + X] * np.sqrt(1 - w)
    loop -= loop.mean(0)
    loop *= 10 ** (target / 20) / np.sqrt((loop ** 2).mean())
    loop = 0.65 * np.tanh(loop / 0.65)   # 드물게 튀는 소리만 눌러 준다
    P = int(PAD * SR)
    full = np.concatenate([loop[-P:], loop, loop[:P]])
    path = os.path.join(OUT, name + ".mp3")
    sf.write(path, full, SR, format='MP3', bitrate_mode='CONSTANT', compression_level=0.72)
    print(name, dur, "rms", round(20 * np.log10(np.sqrt((loop ** 2).mean())), 1), "peak", round(float(np.abs(loop).max()), 2), "ch", loop.shape[1], os.path.getsize(path) // 1024, "KB")
