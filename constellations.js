// 별자리 자료. 별 좌표는 J2000 [적경(시), 적위(도), 등급, 색]. 색은 1 주황, 2 푸름
// 계절마다 저녁 9시 무렵 서울 하늘을 기준으로 놓는다
export const SKY_LST = { spring: 11.5, summer: 18, autumn: 23.5, winter: 5.5 };
export const SKY_LAT = 37.5;

export const CONSTELLATIONS = [
  {
    id: 'uma', name: '큰곰자리', latin: 'Ursa Major', when: '봄에 높이 뜨고 북쪽 하늘에서 오래 보입니다',
    star: '북두칠성: 국자 모양의 일곱 별',
    find: '국자 끝의 두 별을 이어 다섯 배쯤 늘이면 북극성에 닿습니다.',
    story: '그리스 신화에서 곰으로 변한 칼리스토가 하늘에 올랐다고 합니다. 우리 절의 칠성각에서는 북두칠성을 칠성신으로 모시고 수명과 복을 빌었습니다.',
    stars: { dubhe: [11.06, 61.75, 1.8, 1], merak: [11.03, 56.38, 2.3], phecda: [11.9, 53.69, 2.4], megrez: [12.26, 57.03, 3.3], alioth: [12.9, 55.96, 1.8], mizar: [13.4, 54.93, 2.2], alkaid: [13.79, 49.31, 1.9] },
    lines: [['dubhe', 'merak', 'phecda', 'megrez', 'dubhe'], ['megrez', 'alioth', 'mizar', 'alkaid']],
  },
  {
    id: 'umi', name: '작은곰자리', latin: 'Ursa Minor', when: '한 해 내내 북쪽 하늘에 보입니다',
    star: '북극성(폴라리스)',
    find: '꼬리 끝의 북극성은 거의 움직이지 않아 북쪽을 알려 줍니다.',
    story: '다른 별들이 북극성을 중심으로 도는 것처럼 보여, 옛 사람들은 밤길과 뱃길의 길잡이로 삼았습니다.',
    stars: { polaris: [2.53, 89.26, 2.0], yildun: [17.54, 86.59, 4.4], eps: [16.77, 82.04, 4.2], zeta: [15.73, 77.79, 4.3], eta: [16.29, 75.76, 5.0], pherkad: [15.35, 71.83, 3.0], kochab: [14.85, 74.16, 2.1, 1] },
    lines: [['polaris', 'yildun', 'eps', 'zeta', 'eta', 'pherkad', 'kochab', 'zeta']],
  },
  {
    id: 'leo', name: '사자자리', latin: 'Leo', when: '봄 저녁 남쪽 하늘',
    star: '레굴루스: 사자의 심장',
    find: '거꾸로 된 물음표 모양이 사자의 머리이고, 그 끝에 레굴루스가 있습니다.',
    story: '헤라클레스가 맨손으로 물리친 네메아의 사자라고 전합니다.',
    stars: { regulus: [10.14, 11.97, 1.4, 2], eta: [10.12, 16.76, 3.5], algieba: [10.33, 19.84, 2.1, 1], zeta: [10.28, 23.42, 3.4], mu: [9.88, 26.01, 3.9], eps: [9.76, 23.77, 3.0], zosma: [11.24, 20.52, 2.6], chertan: [11.24, 15.43, 3.3], denebola: [11.82, 14.57, 2.1] },
    lines: [['regulus', 'eta', 'algieba', 'zeta', 'mu', 'eps'], ['regulus', 'chertan', 'denebola', 'zosma', 'algieba']],
  },
  {
    id: 'boo', name: '목동자리', latin: 'Boötes', when: '봄부터 초여름까지',
    star: '아르크투루스: 주황빛으로 빛나는 밝은 별',
    find: '북두칠성 손잡이의 곡선을 그대로 이어 가면 아르크투루스를 만납니다.',
    story: '이 곡선을 처녀자리 스피카까지 늘인 것을 봄의 대곡선이라 부릅니다. 아르크투루스는 곰을 지키는 이라는 뜻입니다.',
    stars: { arcturus: [14.26, 19.18, 0, 1], izar: [14.75, 27.07, 2.4, 1], delta: [15.26, 33.31, 3.5], nekkar: [15.03, 40.39, 3.5], seginus: [14.53, 38.31, 3.0], rho: [14.53, 30.37, 3.6], muphrid: [13.91, 18.4, 2.7] },
    lines: [['arcturus', 'izar', 'delta', 'nekkar', 'seginus', 'rho', 'arcturus', 'muphrid']],
  },
  {
    id: 'vir', name: '처녀자리', latin: 'Virgo', when: '봄 저녁 남쪽 하늘',
    star: '스피카: 푸른빛의 밝은 별',
    find: '봄의 대곡선이 아르크투루스를 지나 닿는 푸른 별이 스피카입니다.',
    story: '스피카는 곡식 이삭이라는 뜻으로, 곡식의 여신과 이어져 있습니다.',
    stars: { spica: [13.42, -11.16, 1.0, 2], porrima: [12.69, -1.45, 2.7], vindemiatrix: [13.04, 10.96, 2.8, 1], auva: [12.93, 3.4, 3.4], zaniah: [12.33, -0.67, 3.9] },
    lines: [['spica', 'porrima', 'auva', 'vindemiatrix'], ['porrima', 'zaniah']],
  },
  {
    id: 'lyr', name: '거문고자리', latin: 'Lyra', when: '여름 밤 머리 위',
    star: '베가: 직녀성',
    find: '여름 밤하늘 가장 높은 곳의 밝고 푸른 별이 베가입니다. 여름의 대삼각형을 이루는 한 꼭짓점입니다.',
    story: '칠월 칠석 이야기의 직녀입니다. 서양에서는 오르페우스가 타던 수금이라 전합니다.',
    stars: { vega: [18.62, 38.78, 0, 2], zeta: [18.75, 37.61, 4.3], delta: [18.91, 36.9, 4.2], sulafat: [18.98, 32.69, 3.2], sheliak: [18.83, 33.36, 3.5] },
    lines: [['vega', 'zeta', 'sheliak', 'sulafat', 'delta', 'zeta']],
  },
  {
    id: 'cyg', name: '백조자리', latin: 'Cygnus', when: '여름부터 가을까지',
    star: '데네브: 백조의 꼬리',
    find: '은하수 위에 놓인 커다란 십자 모양이라 북십자성이라고도 합니다.',
    story: '은하수를 따라 남쪽으로 날아가는 백조의 모습입니다. 제우스가 변한 모습이라는 이야기가 전합니다.',
    stars: { deneb: [20.69, 45.28, 1.3], sadr: [20.37, 40.26, 2.2], gienah: [20.77, 33.97, 2.5, 1], delta: [19.75, 45.13, 2.9], eta: [19.94, 35.08, 3.9], albireo: [19.51, 27.96, 3.1, 1] },
    lines: [['deneb', 'sadr', 'eta', 'albireo'], ['gienah', 'sadr', 'delta']],
  },
  {
    id: 'aql', name: '독수리자리', latin: 'Aquila', when: '여름 저녁 남쪽 하늘',
    star: '알타이르: 견우성',
    find: '은하수를 사이에 두고 베가와 마주 보는 밝은 별입니다.',
    story: '칠월 칠석 이야기의 견우입니다. 서양에서는 제우스의 독수리라 전합니다.',
    stars: { altair: [19.85, 8.87, 0.8], tarazed: [19.77, 10.61, 2.7, 1], alshain: [19.92, 6.41, 3.7], theta: [20.19, -0.82, 3.2], delta: [19.43, 3.11, 3.4], zeta: [19.09, 13.86, 3.0], lambda: [19.1, -4.88, 3.4] },
    lines: [['zeta', 'tarazed', 'altair', 'alshain', 'theta', 'delta', 'zeta'], ['delta', 'lambda']],
  },
  {
    id: 'sco', name: '전갈자리', latin: 'Scorpius', when: '여름 저녁 남쪽 낮은 하늘',
    star: '안타레스: 붉게 빛나는 전갈의 심장',
    find: '남쪽 지평선 위에 S자로 휘어진 별들을 찾으면 됩니다.',
    story: '사냥꾼 오리온을 쓰러뜨린 전갈이라 전합니다. 그래서 둘은 하늘의 반대편에 있어 함께 보이지 않는다고 합니다.',
    stars: { graffias: [16.09, -19.81, 2.6], dschubba: [16.01, -22.62, 2.3], pi: [15.98, -26.11, 2.9], sigma: [16.35, -25.59, 2.9], antares: [16.49, -26.43, 1.0, 1], tau: [16.6, -28.22, 2.8], eps: [16.84, -34.29, 2.3], mu: [16.86, -38.05, 3.0], zeta: [16.9, -42.36, 3.6], eta: [17.2, -43.24, 3.3], theta: [17.62, -43.0, 1.9], iota: [17.79, -40.13, 3.0], kappa: [17.71, -39.03, 2.4], shaula: [17.56, -37.1, 1.6] },
    lines: [['graffias', 'dschubba', 'pi'], ['dschubba', 'sigma', 'antares', 'tau', 'eps', 'mu', 'zeta', 'eta', 'theta', 'iota', 'kappa', 'shaula']],
  },
  {
    id: 'peg', name: '페가수스자리', latin: 'Pegasus', when: '가을 저녁 높은 하늘',
    star: '가을의 대사각형',
    find: '밝은 별이 많지 않은 가을 하늘에서 커다란 네모를 찾으면 됩니다.',
    story: '메두사의 피에서 태어났다는 날개 달린 말입니다. 네모의 한 꼭짓점은 안드로메다자리의 별입니다.',
    stars: { markab: [23.08, 15.21, 2.5], scheat: [23.06, 28.08, 2.4, 1], algenib: [0.22, 15.18, 2.8], alpheratz: [0.14, 29.09, 2.1], homam: [22.69, 10.83, 3.4], biham: [22.17, 6.2, 3.5], enif: [21.74, 9.88, 2.4, 1] },
    lines: [['markab', 'scheat', 'alpheratz', 'algenib', 'markab', 'homam', 'biham', 'enif']],
  },
  {
    id: 'and', name: '안드로메다자리', latin: 'Andromeda', when: '가을 저녁 높은 하늘',
    star: '안드로메다 은하: 맨눈으로 볼 수 있는 먼 은하',
    find: '가을의 대사각형 한 모서리에서 북동쪽으로 별을 따라갑니다.',
    story: '바다 괴물에게서 페르세우스가 구해 낸 공주입니다. 안드로메다 은하의 빛은 약 250만 년 전에 출발해 지금 우리 눈에 닿습니다.',
    stars: { alpheratz: [0.14, 29.09, 2.1], delta: [0.66, 30.86, 3.3, 1], mirach: [1.16, 35.62, 2.1, 1], almach: [2.06, 42.33, 2.1, 1] },
    lines: [['alpheratz', 'delta', 'mirach', 'almach']],
  },
  {
    id: 'cas', name: '카시오페이아자리', latin: 'Cassiopeia', when: '가을에 높이 뜨고 북쪽 하늘에서 오래 보입니다',
    star: 'W자 모양의 다섯 별',
    find: '북두칠성이 낮게 내려간 계절에는 이 W자로 북극성을 찾습니다.',
    story: '안드로메다의 어머니인 왕비로, 자신의 미모를 자랑하다 벌을 받아 의자에 앉은 채 하늘을 돈다고 전합니다.',
    stars: { caph: [0.15, 59.15, 2.3], schedar: [0.68, 56.54, 2.2, 1], gamma: [0.95, 60.72, 2.4], ruchbah: [1.43, 60.24, 2.7], segin: [1.91, 63.67, 3.4] },
    lines: [['caph', 'schedar', 'gamma', 'ruchbah', 'segin']],
  },
  {
    id: 'ori', name: '오리온자리', latin: 'Orion', when: '겨울 저녁 남쪽 하늘',
    star: '베텔게우스(붉은 별)와 리겔(푸른 별)',
    find: '나란히 선 세 별, 사냥꾼의 허리띠를 찾으면 바로 알 수 있습니다.',
    story: '이름난 사냥꾼으로, 전갈에 쏘여 쓰러졌다고 전합니다. 우리 옛 사람들은 허리띠의 세 별을 삼태성이라고도 불렀습니다.',
    stars: { betelgeuse: [5.92, 7.41, 0.5, 1], bellatrix: [5.42, 6.35, 1.6, 2], alnitak: [5.68, -1.94, 1.8, 2], alnilam: [5.6, -1.2, 1.7, 2], mintaka: [5.53, -0.3, 2.2, 2], saiph: [5.8, -9.67, 2.1, 2], rigel: [5.24, -8.2, 0.1, 2] },
    lines: [['betelgeuse', 'bellatrix', 'mintaka', 'rigel', 'saiph', 'alnitak', 'betelgeuse'], ['alnitak', 'alnilam', 'mintaka']],
  },
  {
    id: 'cma', name: '큰개자리', latin: 'Canis Major', when: '겨울 저녁 남쪽 하늘',
    star: '시리우스: 밤하늘에서 가장 밝은 별',
    find: '오리온의 허리띠를 왼쪽 아래로 이어 가면 시리우스가 나옵니다.',
    story: '오리온을 따르는 사냥개입니다. 시리우스는 약 8.6광년 떨어져 있어 태양에 무척 가까운 별입니다.',
    stars: { sirius: [6.75, -16.72, -1.5, 2], mirzam: [6.38, -17.96, 2.0, 2], wezen: [7.14, -26.39, 1.8], adhara: [6.98, -28.97, 1.5, 2], aludra: [7.4, -29.3, 2.4, 2], furud: [6.34, -30.06, 3.0, 2] },
    lines: [['mirzam', 'sirius', 'wezen', 'adhara', 'furud'], ['wezen', 'aludra']],
  },
  {
    id: 'tau', name: '황소자리', latin: 'Taurus', when: '겨울 저녁 높은 하늘',
    star: '알데바란: 황소의 붉은 눈',
    find: '오리온의 허리띠를 오른쪽 위로 이어 가면 붉은 알데바란이 나옵니다. 그 너머의 작은 별 무리가 플레이아데스, 우리말로 좀생이별입니다.',
    story: '제우스가 변한 흰 소라고 전합니다. 옛 농부들은 좀생이별을 보고 그해 농사를 점쳤습니다.',
    stars: { aldebaran: [4.6, 16.51, 0.9, 1], gamma: [4.33, 15.63, 3.6], lambda: [4.01, 12.49, 3.4], eps: [4.48, 19.18, 3.5], elnath: [5.44, 28.61, 1.7, 2], zeta: [5.63, 21.14, 3.0, 2] },
    lines: [['zeta', 'aldebaran', 'gamma', 'lambda'], ['gamma', 'eps', 'elnath']],
  },
  {
    id: 'gem', name: '쌍둥이자리', latin: 'Gemini', when: '겨울 저녁 높은 하늘',
    star: '카스토르와 폴룩스',
    find: '나란히 빛나는 두 별이 쌍둥이의 머리입니다.',
    story: '우애가 깊은 쌍둥이 형제로, 죽음도 함께 나누고자 해 나란히 하늘에 올랐다고 전합니다.',
    stars: { castor: [7.58, 31.89, 1.6], pollux: [7.76, 28.03, 1.1, 1], mebsuta: [6.73, 25.13, 3.0, 1], tejat: [6.38, 22.51, 2.9, 1], wasat: [7.34, 21.98, 3.5], mekbuda: [7.07, 20.57, 3.9], alhena: [6.63, 16.4, 1.9] },
    lines: [['castor', 'pollux', 'wasat', 'mekbuda', 'alhena'], ['castor', 'mebsuta', 'tejat']],
  },
];

// 계절 저녁 하늘에서 별의 방향. x 동쪽, y 위, -z 북쪽 (정원에서 처음 바라보는 +z가 남쪽)
export function starDir(ra, dec, lst) {
  const r = Math.PI / 180, phi = SKY_LAT * r, d = dec * r, H = (lst - ra) * 15 * r;
  const east = -Math.cos(d) * Math.sin(H);
  const north = Math.cos(phi) * Math.sin(d) - Math.sin(phi) * Math.cos(d) * Math.cos(H);
  const up = Math.sin(phi) * Math.sin(d) + Math.cos(phi) * Math.cos(d) * Math.cos(H);
  return [east, up, -north];
}
