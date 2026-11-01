# 절 횟수 안내 음성을 남자 목소리 한 파일로 렌더링한다. 원본 출처는 audio/CREDITS.txt
# 사용: python render_voice.py <출력 폴더>   (supertonic, numpy, soundfile 필요)
import json, os, sys
import numpy as np, soundfile as sf
from supertonic import TTS

OUT = sys.argv[1]
VOICE, SPEED, STEPS = "M2", 0.85, 30
GAP = 0.3      # 조각 사이 무음(초)
TARGET = -20   # 조각 RMS(dB)

D = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구']
def kor(n):
    # app.js의 korNum과 같은 규칙 (1000 미만)
    out = ''
    for u, w in ((100, '백'), (10, '십')):
        d = n // u % 10
        if d: out += ('' if d == 1 else D[d]) + w
    return out + D[n % 10]

# 108까지는 통째로 읽고, 그 위는 낱말을 이어 붙인다
ITEMS = {str(n): kor(n) + ' 배' for n in range(1, 109)}
for w in ['일', '이', '삼', '사', '오', '육', '칠', '팔', '구', '십', '백', '천', '만', '배', '배를 마쳤습니다']:
    ITEMS[w] = w + '.'

tts = TTS(auto_download=True)
style = tts.get_voice_style(VOICE)
SR = tts.sample_rate

def clip(text):
    wav, _ = tts.synthesize(text, voice_style=style, lang='ko', speed=SPEED, total_steps=STEPS)
    x = np.squeeze(np.asarray(wav)).astype(float)
    # 앞뒤 무음을 잘라내고 크기를 맞춘다
    fr = int(SR * 0.01); e = np.array([np.sqrt((x[i:i + fr] ** 2).mean()) for i in range(0, len(x) - fr, fr)])
    on = np.where(e > e.max() * 0.015)[0]
    a, b = max(0, on[0] * fr - fr * 2), min(len(x), (on[-1] + 1) * fr + fr * 4)
    x = x[a:b]
    x *= 10 ** (TARGET / 20) / np.sqrt((x ** 2).mean())
    x = np.clip(x, -0.95, 0.95)
    f = int(SR * 0.008); x[:f] *= np.linspace(0, 1, f); x[-f * 3:] *= np.linspace(1, 0, f * 3)
    return x

gap = np.zeros(int(SR * GAP))
parts, table, pos = [gap], {}, GAP
for key, text in ITEMS.items():
    x = clip(text)
    dur = len(x) / SR
    table[key] = [round(pos, 3), round(dur, 3)]
    parts += [x, gap]; pos += dur + GAP
    print(key, text, round(dur, 2))

sf.write(os.path.join(OUT, 'voice_count.mp3'), np.concatenate(parts), SR, format='MP3', bitrate_mode='CONSTANT', compression_level=0.75)
json.dump(table, open(os.path.join(OUT, 'voice_count.json'), 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
print('total', round(pos, 1), 's', os.path.getsize(os.path.join(OUT, 'voice_count.mp3')) // 1024, 'KB')
