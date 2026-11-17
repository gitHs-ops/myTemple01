// 실제 접속자 동기화. 서버 없이 WebRTC(P2P)로 같은 사이트에 들어온 사람끼리 이름·있는 곳·절·합장을 주고받는다.
// 신호 교환은 Trystero 의 공개 릴레이(Nostr)를 쓰며, 이름과 동작 횟수 외의 정보는 보내지 않는다.
const LIB = 'https://esm.sh/trystero@0.27.0';
const APP_ID = 'github.com/gitHs-ops/myTemple01';

export async function goOnline({ onUser, onLeave, onError }) {
  const { joinRoom } = await import(LIB);
  const room = joinRoom({ appId: APP_ID }, 'hall-v1');
  room.onError?.((e) => onError?.(e));
  const monk = room.makeUserState('monk', null);
  monk.onChange((v, { userId, self, removed }) => {
    if (self) return;
    if (removed || !v) onLeave(userId); else onUser(userId, v);
  });
  room.onUserLeave?.(({ userId }) => onLeave(userId));
  let mine = { name: '', mode: '', bow: 0, hap: 0 };
  const set = (patch) => { mine = { ...mine, ...patch }; monk.set(mine); };
  addEventListener('pagehide', () => { try { monk.clear(); room.leave(); } catch { /* 닫히는 중 */ } });
  return {
    set,
    bow: () => set({ bow: mine.bow + 1 }),
    hap: () => set({ hap: mine.hap + 1 }),
  };
}
