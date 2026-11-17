// 실제 접속자 동기화. 서버 없이 WebRTC(P2P)로 같은 사이트에 들어온 사람끼리 이름·있는 곳·절·합장을 주고받는다.
// 신호 교환은 Trystero 의 공개 릴레이(Nostr)를 쓰며, 이름과 동작 횟수 외의 정보는 보내지 않는다.
const LIB = 'https://esm.sh/trystero@0.27.0';
const APP_ID = 'github.com/gitHs-ops/myTemple01';

export async function goOnline({ onUser, onLeave, onChat, onStream, onError }) {
  const { joinRoom } = await import(LIB);
  const room = joinRoom({ appId: APP_ID }, 'hall-v1');
  room.onError?.((e) => onError?.(e));
  const monk = room.makeUserState('monk', null);
  monk.onChange((v, { userId, self, removed }) => {
    if (self) return;
    if (removed || !v) onLeave(userId); else onUser(userId, v);
  });
  room.onUserLeave?.(({ userId }) => onLeave(userId));
  // 채팅: 보낸 순간 연결된 사람에게만 가고, 어디에도 저장하지 않는다
  const chat = room.makeAction('chat');
  chat.onMessage((text, { userId }) => { if (typeof text === 'string') onChat?.(userId, text.slice(0, 60)); });
  // 음성: 누르고 말하기. 마이크는 처음 누를 때 열고, 누르는 동안만 트랙을 켠다. 녹음·저장하지 않는다
  let mic = null;
  room.onUserJoin?.(({ userId }) => { if (mic) room.addStream(mic, { target: userId }); });
  room.onPeerStream?.((stream, { userId }) => onStream?.(userId, stream));
  async function micOn() {
    if (mic) return;
    mic = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
    mic.getAudioTracks().forEach((t) => { t.enabled = false; });
    await room.addStream(mic);
  }
  function micOff() {
    if (!mic) return;
    try { room.removeStream(mic); } catch { /* 이미 끊김 */ }
    mic.getTracks().forEach((t) => t.stop()); mic = null;
  }
  let mine = { name: '', mode: '', bow: 0, hap: 0, talk: false };
  const set = (patch) => { mine = { ...mine, ...patch }; monk.set(mine); };
  addEventListener('pagehide', () => { try { monk.clear(); room.leave(); } catch { /* 닫히는 중 */ } });
  return {
    set,
    bow: () => set({ bow: mine.bow + 1 }),
    hap: () => set({ hap: mine.hap + 1 }),
    say: (text) => chat.send(text),
    talk: async (on) => {
      if (on) await micOn();
      mic?.getAudioTracks().forEach((t) => { t.enabled = on; });
      set({ talk: on });
    },
    micOff: () => { if (!mic) return; micOff(); set({ talk: false }); },
  };
}
