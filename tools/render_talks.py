# 법문과 말씀을 문장별로 합성해 audio/talk_*.mp3와 자막 시각표 talk_*.json을 만든다
# 글은 이 사이트에서 직접 쓴 것이고, 목소리는 Supertone Supertonic 3 합성 음성이다
# 사용: python render_talks.py <출력 폴더> [id ...]   (supertonic, numpy, scipy, soundfile 필요)
import json, os, sys
import numpy as np, soundfile as sf
from scipy.signal import fftconvolve
from supertonic import TTS

TALKS = {
    'monk_anger': ('M2', 0.84, """
도반 여러분, 오늘은 화가 날 때의 마음을 함께 들여다보겠습니다.
누가 나에게 모진 말을 했다고 해 봅시다. 가슴이 뜨거워지고, 그 말이 머릿속에서 자꾸 되풀이됩니다.
부처님께서는 이것을 두 번째 화살에 비유하셨습니다.
누구나 살다 보면 화살을 맞습니다. 그 아픔은 피할 수 없습니다.
그런데 우리는 그 자리에서, 왜 하필 나인가, 어떻게 나에게 그럴 수 있나 하며 스스로 두 번째 화살을 쏩니다.
첫 번째 화살은 남이 쏘았지만, 두 번째 화살은 내가 쏘는 것입니다.

그러니 화가 올라오면 먼저 알아차려 보십시오.
아, 지금 내 안에 화가 일어나는구나. 이렇게 조용히 이름만 불러 주십시오.
화를 누를 것도 없고, 화를 따라갈 것도 없습니다.
숨을 한 번 깊이 들이쉬고, 천천히 내쉬어 보십시오.
법구경에는 이런 말씀이 있습니다.
원한은 원한으로 결코 풀리지 않는다. 원한을 버릴 때 비로소 풀린다.

상대를 용서하라는 말이 지금은 너무 멀게 느껴질 수도 있습니다. 괜찮습니다.
오늘은 그저, 두 번째 화살 하나만 내려놓으십시오.
그것만으로도 마음이 한결 가벼워집니다.
"""),
    'monk_letgo': ('M2', 0.84, """
오늘은 내려놓는다는 말을 함께 생각해 보겠습니다.
내려놓으라는 말을 들으면, 포기하라는 말처럼 들릴 때가 있습니다.
하지만 내려놓음은 포기가 아닙니다. 손에 힘을 빼는 것입니다.
뜨거운 찻잔을 오래 쥐고 있으면 손이 데입니다. 찻잔이 나쁜 것이 아니라, 너무 꽉 쥐고 있었을 뿐입니다.

부처님께서는 뗏목의 비유를 말씀하셨습니다.
강을 건너는 데 뗏목은 참으로 고마운 것입니다.
그러나 강을 다 건너고도 뗏목을 머리에 이고 간다면 어떻겠습니까?
지나간 일, 지나간 후회, 지나간 영광도 그와 같습니다.
그때는 나를 건네주었지만, 이제는 짐이 되었을지 모릅니다.

지금 잠깐 눈을 감고, 오늘 내가 무엇을 쥐고 있는지 살펴보십시오.
어깨에 힘이 들어가 있다면 툭 떨어뜨려 보십시오.
걱정이 있다면, 그 걱정을 없애려 하지 말고 잠시 옆자리에 앉혀 두십시오.
일어날 일은 일어나고, 지나갈 일은 지나갑니다.
오늘 이 자리에 앉아 있는 동안만큼은, 아무것도 들고 있지 않아도 됩니다.
"""),
    'monk_breath': ('M2', 0.84, """
오늘은 긴 말씀보다, 함께 숨을 쉬어 보겠습니다.
편안히 앉으십시오. 허리는 곧게 펴되, 힘을 주지는 않습니다.
손은 무릎 위에 가볍게 올려놓으십시오.
숨을 일부러 조절할 필요는 없습니다. 그저 들어오고 나가는 것을 지켜봅니다.

코끝에 마음을 두십시오.
들이쉴 때, 들이쉬는 줄 압니다.
내쉴 때, 내쉬는 줄 압니다.
생각이 떠오르면 따라가지 마십시오. 생각이 떠올랐구나, 하고 다시 숨으로 돌아옵니다.
수십 번 놓쳐도 괜찮습니다. 돌아오는 그 순간이 바로 수행입니다.

부처님께서도 숨을 알아차리는 공부를 제자들에게 권하셨습니다.
특별한 재주가 필요한 일이 아닙니다. 숨은 언제나 지금 여기에 있으니까요.
지나간 숨은 다시 쉴 수 없고, 다음 숨은 아직 오지 않았습니다.
우리가 쉴 수 있는 숨은 오직 이 숨 하나뿐입니다.
일어나실 때에도 서두르지 마십시오. 오늘 하루, 가끔씩 이 숨을 기억해 주십시오.
"""),
    'priest_burden': ('M1', 0.88, """
사랑하는 형제자매 여러분, 오늘은 무거운 마음으로 이 자리에 오신 분들께 말씀드리고 싶습니다.
예수님께서는 말씀하셨습니다.
고생하며 무거운 짐을 진 너희는 모두 나에게 오너라. 내가 너희에게 안식을 주겠다.
이 말씀에는 조건이 붙어 있지 않습니다.
먼저 착해져서 오라고 하지 않으셨고, 다 해결하고 오라고 하지도 않으셨습니다.
그저 무거운 그대로 오라고 하셨습니다.

우리는 하느님 앞에서도 괜찮은 척할 때가 많습니다.
힘들어도 힘들다고 말하지 못하고, 혼자 다 짊어지려 합니다.
그러나 기도는 잘 차려입고 드리는 인사가 아닙니다.
주님, 오늘 너무 힘듭니다. 이 한마디도 훌륭한 기도입니다.

짐이 당장 사라지지 않을 수도 있습니다.
그래도 누군가와 함께 지는 짐은 혼자 지는 짐과 다릅니다.
오늘 잠시 앉아 계신 동안, 그 짐을 주님 곁에 내려놓아 보십시오.
주님의 평화가 여러분과 함께하기를 빕니다.
"""),
    'priest_son': ('M1', 0.88, """
사랑하는 형제자매 여러분, 오늘은 루카 복음의 되찾은 아들 이야기를 함께 나누겠습니다.
작은아들은 아버지에게서 재산을 받아 먼 고장으로 떠납니다. 그리고 가진 것을 모두 탕진합니다.
굶주림 끝에 그는 정신을 차리고 생각합니다. 아버지께 돌아가 품팔이꾼으로라도 써 달라고 해야겠다.
그는 돌아가는 길에 드릴 말씀을 몇 번이고 연습했을 것입니다.

그런데 복음은 이렇게 전합니다.
아들이 아직 멀리 있는데, 아버지가 그를 보고 달려갑니다.
그리고 아들의 목을 끌어안고 입을 맞춥니다.
아들이 준비한 말을 다 하기도 전에, 아버지는 잔치를 준비하라고 이릅니다.
저는 이 장면에서 아버지가 매일 먼 길을 바라보고 있었으리라 생각합니다.

혹시 너무 멀리 왔다고 느끼십니까?
이제 와서 돌아갈 수 있을까, 망설이고 계십니까?
하느님은 우리가 돌아오기로 마음먹은 그 순간, 이미 달려 나오시는 분입니다.
완벽한 말을 준비하지 않으셔도 됩니다. 그저 돌아서는 한 걸음이면 충분합니다.
"""),
    'priest_forgive': ('M1', 0.88, """
사랑하는 형제자매 여러분, 오늘은 용서에 대해 말씀드리겠습니다.
베드로가 예수님께 묻습니다. 형제가 제게 잘못하면 일곱 번까지 용서해야 합니까?
당시로서는 꽤 너그러운 숫자였을 것입니다.
그러나 예수님께서는 답하십니다. 일곱 번이 아니라 일흔일곱 번까지라도 용서해야 한다.
횟수를 세지 말라는 말씀일 것입니다.

그런데 솔직히 용서는 참 어렵습니다.
깊이 상처받은 분께 쉽게 용서하라고 말씀드릴 수 없습니다.
용서는 없었던 일로 하는 것이 아닙니다. 잘못이 잘못이 아니라고 말하는 것도 아닙니다.
또 한 번에 끝나는 일도 아닙니다. 오늘 용서했다가 내일 다시 미워질 수 있습니다.
그때마다 다시 시작하는 것, 어쩌면 그것이 일흔일곱 번의 뜻일지도 모릅니다.

아직 용서할 수 없다면, 이렇게 기도해 보십시오.
주님, 저는 아직 용서하지 못합니다. 그러나 용서하고 싶은 마음을 주십시오.
그 기도만으로 이미 시작하신 것입니다.
용서는 상대를 위한 것이기도 하지만, 무엇보다 여러분의 마음을 풀어 주는 일입니다.
"""),
}

OUT = sys.argv[1]
only = set(sys.argv[2:])
GAP, PARA, TARGET = 0.75, 1.5, -21
tts = TTS(auto_download=True)
SR = tts.sample_rate

# 작고 낮은 울림
rng = np.random.default_rng(3)
def room(x, secs, wet):
    n = int(secs * SR)
    ir = rng.standard_normal(n) * np.exp(-6.9 * np.arange(n) / n)
    ir /= np.sqrt((ir ** 2).sum())
    w = fftconvolve(x, ir)[:len(x) + n]
    y = np.zeros(len(x) + n); y[:len(x)] = x * (1 - wet); y[:len(w)] += w * wet
    return y

def clip(text, style, speed):
    wav, _ = tts.synthesize(text, voice_style=style, lang='ko', speed=speed, total_steps=30)
    x = np.squeeze(np.asarray(wav)).astype(float)
    fr = int(SR * 0.01); e = np.array([np.sqrt((x[i:i + fr] ** 2).mean()) for i in range(0, len(x) - fr, fr)])
    on = np.where(e > e.max() * 0.015)[0]
    x = x[max(0, on[0] * fr - fr * 2):min(len(x), (on[-1] + 1) * fr + fr * 5)]
    x *= 10 ** (TARGET / 20) / np.sqrt((x ** 2).mean())
    f = int(SR * 0.008); x[:f] *= np.linspace(0, 1, f); x[-f * 3:] *= np.linspace(1, 0, f * 3)
    return x

for tid, (voice, speed, text) in TALKS.items():
    if only and tid not in only: continue
    style = tts.get_voice_style(voice)
    parts, cues, pos = [np.zeros(int(SR * 0.5))], [], 0.5
    for para in text.strip().split('\n\n'):
        for line in para.strip().split('\n'):
            line = line.strip()
            x = clip(line, style, speed)
            cues.append([round(pos, 2), round(len(x) / SR, 2), line])
            parts += [x, np.zeros(int(SR * GAP))]; pos += len(x) / SR + GAP
        parts.append(np.zeros(int(SR * (PARA - GAP)))); pos += PARA - GAP
    dry = np.concatenate(parts)
    y = room(dry, 1.6 if tid.startswith('priest') else 0.7, 0.2 if tid.startswith('priest') else 0.1)
    y *= 10 ** (TARGET / 20) / np.sqrt((dry ** 2)[dry != 0].mean())
    y = np.clip(y, -0.97, 0.97)
    path = os.path.join(OUT, f'talk_{tid}')
    sf.write(path + '.mp3', y, SR, format='MP3', bitrate_mode='CONSTANT', compression_level=0.82)
    json.dump({'dur': round(len(y) / SR, 1), 'cues': cues}, open(path + '.json', 'w', encoding='utf-8'), ensure_ascii=False, separators=(',', ':'))
    print(tid, round(len(y) / SR), 's', os.path.getsize(path + '.mp3') // 1024, 'KB', len(cues), 'cues', flush=True)
