// 성당의 정원: 동굴 속 성모상, 장미 화단, 분수, 사이프러스. 형태는 모두 코드로 빚는다
import * as THREE from './vendor/three.min.js';

const MZ = -250;   // 다른 건물이 보이지 않게 멀리 떨어져 있다
export const MARY = {
  z: MZ, start: { x: 0, z: MZ + 15 }, stand: { x: 0, z: MZ - 7.5 },
  zone: { xMin: -21, xMax: 21, zMin: MZ - 9.6, zMax: MZ + 20 },
};

const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

// y(0~1)와 θ에 따라 반지름을 주는 몸체. θ=0이 앞(+z)
function surface(h, rad, { ny = 44, nt = 56, from = 0, to = Math.PI * 2, squash = 0.76 } = {}) {
  const pos = [], idx = [];
  for (let j = 0; j <= ny; j++) {
    for (let i = 0; i <= nt; i++) {
      const v = j / ny, th = from + (to - from) * (i / nt), r = rad(v, th);
      pos.push(Math.sin(th) * r, v * h, Math.cos(th) * r * squash);
    }
  }
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nt; i++) {
      const a = j * (nt + 1) + i, b = a + 1, c = a + nt + 1, d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}
const curve = (pts, v) => {
  for (let i = 1; i < pts.length; i++) {
    if (v <= pts[i][0]) {
      const [a, ra] = pts[i - 1], [b, rb] = pts[i], t = (v - a) / (b - a), s = t * t * (3 - 2 * t);
      return ra + (rb - ra) * s;
    }
  }
  return pts[pts.length - 1][1];
};

function faceTexture(canvasTex) {
  return canvasTex(256, 320, (g, w, h) => {
    g.fillStyle = '#f2ddc8'; g.fillRect(0, 0, w, h);
    const blush = (x) => {
      const gr = g.createRadialGradient(x, 196, 2, x, 196, 34);
      gr.addColorStop(0, 'rgba(226,150,140,.42)'); gr.addColorStop(1, 'rgba(226,150,140,0)');
      g.fillStyle = gr; g.fillRect(x - 40, 156, 80, 80);
    };
    blush(78); blush(178);
    g.lineCap = 'round';
    // 내리뜬 눈과 눈썹
    g.strokeStyle = '#5b4031'; g.lineWidth = 3.5;
    [[92, 1], [164, -1]].forEach(([x]) => {
      g.beginPath(); g.moveTo(x - 20, 158); g.quadraticCurveTo(x, 170, x + 20, 158); g.stroke();
    });
    g.strokeStyle = '#7a5a45'; g.lineWidth = 3;
    [92, 164].forEach((x) => { g.beginPath(); g.moveTo(x - 22, 134); g.quadraticCurveTo(x, 124, x + 22, 134); g.stroke(); });
    // 코
    g.strokeStyle = 'rgba(150,105,85,.65)'; g.lineWidth = 2.5;
    g.beginPath(); g.moveTo(128, 150); g.lineTo(124, 200); g.quadraticCurveTo(128, 207, 136, 203); g.stroke();
    // 입
    g.fillStyle = '#b8605c';
    g.beginPath(); g.moveTo(106, 232); g.quadraticCurveTo(128, 222, 150, 232); g.quadraticCurveTo(128, 246, 106, 232); g.fill();
  });
}

function buildStatue({ mesh, std, canvasTex }) {
  const s = new THREE.Group();
  const white = std(0xf3efe6, { roughness: 0.55 }), blue = std(0x3f6fb5, { roughness: 0.5 }), gold = std(0xe0b64e, { metalness: 0.6, roughness: 0.35, emissive: 0x3a2a08 });
  const skin = std(0xf2ddc8, { roughness: 0.6 });

  // 흰 옷: 허리를 묶고 아래로 주름이 흐른다
  const GOWN = [[0, 0.56], [0.12, 0.5], [0.45, 0.33], [0.62, 0.28], [0.8, 0.34], [0.92, 0.27], [1, 0.08]];
  const gown = surface(2.5, (v, th) => curve(GOWN, v) + 0.024 * Math.sin(th * 11 + v * 2) * (1 - Math.min(1, v / 0.6)), { squash: 0.72 });
  mesh(gown, white, 0, 0, 0, s);
  // 띠
  const sash = mesh(new THREE.TorusGeometry(0.29, 0.032, 8, 32), blue, 0, 1.54, 0, s); sash.rotation.x = Math.PI / 2; sash.scale.y = 0.74;
  // 옷자락 밑 발과 금빛 장미
  [-1, 1].forEach((k) => {
    const f = mesh(new THREE.SphereGeometry(0.1, 12, 10), skin, k * 0.16, 0.06, 0.42, s); f.scale.set(0.9, 0.55, 1.5);
    mesh(new THREE.IcosahedronGeometry(0.06, 1), gold, k * 0.16, 0.13, 0.5, s);
  });

  // 푸른 망토: 앞이 열리고 머리까지 덮는다
  const MANT = [[0, 0.66], [0.2, 0.6], [0.5, 0.45], [0.66, 0.46], [0.74, 0.44], [0.8, 0.3], [0.86, 0.28], [0.95, 0.27], [0.985, 0.17], [1, 0.02]];
  const OPEN = 0.82, mantle = surface(3.2, (v, th) => curve(MANT, v) + 0.03 * Math.sin(th * 9 + v * 3) * (1 - Math.min(1, v / 0.72)), { from: OPEN, to: Math.PI * 2 - OPEN, squash: 0.82, nt: 72 });
  mesh(mantle, new THREE.MeshStandardMaterial({ color: 0x3f6fb5, roughness: 0.5, side: THREE.DoubleSide }), 0, 0, 0, s);
  // 망토 가장자리의 금테
  [OPEN, Math.PI * 2 - OPEN].forEach((th) => {
    const pts = [];
    for (let i = 0; i <= 40; i++) {
      const v = i / 40 * 0.985, r = curve(MANT, v) + 0.03 * Math.sin(th * 9 + v * 3) * (1 - Math.min(1, v / 0.72));
      pts.push(new THREE.Vector3(Math.sin(th) * r, v * 3.2, Math.cos(th) * r * 0.82));
    }
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.018, 6), gold, 0, 0, 0, s);
  });

  // 흰 머릿수건과 얼굴
  const veil = mesh(new THREE.SphereGeometry(0.255, 28, 18, Math.PI / 2 + 0.95, Math.PI * 2 - 1.9), new THREE.MeshStandardMaterial({ color: 0xf3efe6, roughness: 0.55, side: THREE.DoubleSide }), 0, 2.77, -0.02, s); veil.scale.set(0.96, 1.16, 0.96);
  const face = mesh(new THREE.SphereGeometry(0.205, 28, 22), new THREE.MeshStandardMaterial({ map: faceTexture(canvasTex), roughness: 0.6 }), 0, 2.76, 0.07, s);
  face.scale.set(0.9, 1.2, 0.86); face.rotation.y = -Math.PI / 2; face.rotation.x = 0.1;
  face.geometry = (() => {   // 구의 앞쪽에 얼굴 그림이 오도록 UV를 앞면 기준으로 다시 잡는다
    const g = face.geometry, p = g.attributes.position, uv = g.attributes.uv;
    for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 - p.getZ(i) / 0.42, 0.5 + p.getY(i) / 0.42);
    return g;
  })();

  // 모은 손
  [-1, 1].forEach((k) => {
    const shoulder = new THREE.Vector3(k * 0.33, 2.2, 0), elbow = new THREE.Vector3(k * 0.32, 1.76, 0.2), wrist = new THREE.Vector3(k * 0.06, 1.95, 0.42);
    mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3([shoulder, elbow, wrist]), 14, 0.085, 10), white, 0, 0, 0, s);
    const hand = mesh(new THREE.SphereGeometry(0.075, 12, 10), skin, k * 0.028, 2.05, 0.46, s);
    hand.scale.set(0.45, 1.6, 0.9); hand.rotation.x = -0.25;
  });
  // 손에 걸린 묵주
  const beads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.013, 6, 5), gold, 40), dm = new THREE.Object3D();
  for (let i = 0; i < 40; i++) {
    const t = i / 40;
    dm.position.set(Math.sin(t * Math.PI * 2) * 0.1, 1.72 + 0.2 * Math.abs(Math.cos(t * Math.PI)), 0.48);
    dm.updateMatrix(); beads.setMatrixAt(i, dm.matrix);
  }
  s.add(beads);
  // 머리 위의 열두 별
  const star = new THREE.Shape();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2, r = i % 2 ? 0.024 : 0.058;
    if (i) star.lineTo(Math.sin(a) * r, Math.cos(a) * r); else star.moveTo(Math.sin(a) * r, Math.cos(a) * r);
  }
  const starGeo = new THREE.ShapeGeometry(star);
  const starMat = new THREE.MeshStandardMaterial({ color: 0xffd76a, emissive: 0xb88a1c, side: THREE.DoubleSide, metalness: 0.4, roughness: 0.4 });
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    mesh(starGeo, starMat, Math.sin(a) * 0.44, 2.98 + Math.cos(a) * 0.44, 0.1, s);
  }
  return s;
}

export function buildMaryGarden({ scene, mesh, std, canvasTex, seatGroup }) {
  const root = new THREE.Group(); root.position.z = 0; scene.add(root);
  const colliders = [], seats = [], flames = [];
  const Z = (d) => MZ + d;
  const rnd = seeded(31);

  /* 땅과 길 */
  const grassTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#5e8549'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2200; i++) {
      const v = 90 + rnd() * 60; g.fillStyle = `rgb(${v - 28},${v + 12},${v - 50})`;
      g.fillRect(rnd() * w, rnd() * h, 1.5, 3);
    }
  }, [50, 50]);
  const ground = mesh(new THREE.CircleGeometry(220, 48), new THREE.MeshStandardMaterial({ map: grassTex, roughness: 1 }), 0, -0.02, MZ, root); ground.rotation.x = -Math.PI / 2;
  const gravelTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#d3c6ac'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      const v = 165 + rnd() * 60; g.fillStyle = `rgb(${v},${v - 8},${v - 26})`;
      g.beginPath(); g.arc(rnd() * w, rnd() * h, 0.8 + rnd() * 1.6, 0, 6.3); g.fill();
    }
  }, [2, 16]);
  const gravel = new THREE.MeshStandardMaterial({ map: gravelTex, roughness: 1 });
  const flat = (geo, mat, x, z, y = 0.008) => { const m = mesh(geo, mat, x, y, Z(z), root); m.rotation.x = -Math.PI / 2; return m; };
  flat(new THREE.PlaneGeometry(3.4, 32), gravel, 0, 5);
  const across = flat(new THREE.PlaneGeometry(3.4, 32), gravel, 0, 6, 0.006); across.rotation.z = Math.PI / 2;
  flat(new THREE.CircleGeometry(6.6, 44), gravel, 0, 6, 0.012);
  flat(new THREE.CircleGeometry(5.6, 40), gravel, 0, -7, 0.01);

  /* 먼 언덕 */
  [[72, 11, 14, 0x5f8560, 2.1], [108, 24, 22, 0x7a9b86, 5.3]].forEach(([R, base, amp, color, seed]) => {
    const N = 72, pos = [], idx = [];
    for (let i = 0; i <= N; i++) {
      const a = (i / N) * Math.PI * 2, n = Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 7 + seed * 2) * 0.3 + Math.sin(a * 13 + seed * 3) * 0.2;
      const x = Math.sin(a) * R, z = MZ + Math.cos(a) * R;
      pos.push(x, -0.2, z, x, base + amp * (0.5 + 0.5 * n), z);
    }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setIndex(idx); g.computeVertexNormals();
    root.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })));
  });

  /* 사이프러스와 생울타리 */
  const leafMat = std(0x2c5a38, { roughness: 0.95, flatShading: true }), trunkMat = std(0x5a4632);
  const cypress = (x, z, sc = 1) => {
    mesh(new THREE.CylinderGeometry(0.16, 0.22, 1.2, 7), trunkMat, x, 0.6, Z(z), root);
    const c = mesh(new THREE.SphereGeometry(1, 10, 10), leafMat, x, 1 + 4 * sc, Z(z), root); c.scale.set(1.15 * sc, 4.2 * sc, 1.15 * sc);
    colliders.push([x, Z(z), 1.15]);
  };
  [-24, 24].forEach((x) => { for (let z = -8; z <= 22; z += 5) cypress(x, z, 1 + rnd() * 0.35); });
  [-20, -14, -8, 8, 14, 20].forEach((x) => cypress(x, 24, 1 + rnd() * 0.3));
  [-16, -11, 11, 16].forEach((x) => cypress(x, -11, 1.2 + rnd() * 0.3));
  const hedgeMat = std(0x3d6f3f, { roughness: 1, flatShading: true });
  const hedge = (x, z, w, d) => {
    mesh(new THREE.BoxGeometry(w, 0.8, d), hedgeMat, x, 0.4, Z(z), root);
    const long = Math.max(w, d), n = Math.round(long / 1.1);
    for (let i = 0; i <= n; i++) {
      const k = i / n - 0.5;
      colliders.push(w > d ? [x + k * long, Z(z), 0.72, true] : [x, Z(z + k * long), 0.72, true]);
    }
  };
  [-1, 1].forEach((s) => {
    hedge(s * 12.4, 13.2, 19.2, 0.7); hedge(s * 12.4, -1.2, 19.2, 0.7);
    hedge(s * 2.1, 17.2, 0.7, 8.6);
  });

  /* 장미 화단 */
  const roseBed = (cx, cz, w, d, colors) => {
    const n = Math.round(w * d * 2.4);
    const bush = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.42, 1), std(0x34663a, { flatShading: true }), n);
    const fl = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.1, 1), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.6 }), n * 5);
    const dm = new THREE.Object3D(), col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const x = cx + (rnd() - 0.5) * w, z = Z(cz + (rnd() - 0.5) * d), sc = 0.8 + rnd() * 0.5;
      dm.position.set(x, 0.32, z); dm.scale.setScalar(sc); dm.rotation.set(rnd() * 3, rnd() * 3, 0); dm.updateMatrix(); bush.setMatrixAt(i, dm.matrix);
      for (let k = 0; k < 5; k++) {
        const a = rnd() * 6.28, b = rnd() * 1.4;
        dm.position.set(x + Math.sin(a) * Math.sin(b) * 0.42 * sc, 0.34 + Math.cos(b) * 0.4 * sc, z + Math.cos(a) * Math.sin(b) * 0.42 * sc);
        dm.scale.setScalar(0.8 + rnd() * 0.6); dm.updateMatrix();
        fl.setMatrixAt(i * 5 + k, dm.matrix); fl.setColorAt(i * 5 + k, col.set(colors[Math.floor(rnd() * colors.length)]));
      }
    }
    root.add(bush, fl);
    const wide = w >= d, long = wide ? w : d, R = (wide ? d : w) / 2 + 0.2, parts = Math.max(1, Math.round(long / 2));
    for (let i = 0; i < parts; i++) {
      const k = ((i + 0.5) / parts - 0.5) * long;
      colliders.push(wide ? [cx + k, Z(cz), R, true] : [cx, Z(cz + k), R, true]);
    }
  };
  const RED = ['#b3202c', '#d13b48', '#8f1a26'], PINK = ['#f2a7ba', '#ffffff', '#e77f9c'], WHITE = ['#ffffff', '#f7efd8', '#fffaf0'];
  roseBed(-13.6, 1.2, 13, 3.4, RED); roseBed(13.6, 1.2, 13, 3.4, RED);
  roseBed(-13.6, 10.8, 13, 3.4, PINK); roseBed(13.6, 10.8, 13, 3.4, PINK);
  roseBed(-4.2, 17.2, 3, 8.6, WHITE); roseBed(4.2, 17.2, 3, 8.6, WHITE);
  // 동굴 앞 흰 백합과 장미
  roseBed(-5.2, -8.6, 2.6, 1.6, WHITE); roseBed(5.2, -8.6, 2.6, 1.6, WHITE);

  /* 가운데 분수 */
  const stone = std(0xc9c3b4, { roughness: 0.85 }), stoneDark = std(0x9c978a, { roughness: 0.9 });
  mesh(new THREE.CylinderGeometry(3.2, 3.4, 0.62, 40), stone, 0, 0.31, Z(6), root);
  const waterTex = canvasTex(128, 128, (g, w, h) => {
    g.fillStyle = '#7fb3c4'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2;
    for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(rnd() * w, rnd() * h, 6 + rnd() * 16, 0, 2); g.stroke(); }
  }, [2, 2]);
  const water = mesh(new THREE.CircleGeometry(2.92, 36), new THREE.MeshStandardMaterial({ map: waterTex, roughness: 0.2, metalness: 0.2 }), 0, 0.64, Z(6), root); water.rotation.x = -Math.PI / 2;
  mesh(new THREE.CylinderGeometry(0.34, 0.5, 1.5, 16), stone, 0, 1.2, Z(6), root);
  mesh(new THREE.CylinderGeometry(1.15, 0.5, 0.26, 28), stone, 0, 2, Z(6), root);
  mesh(new THREE.CylinderGeometry(0.16, 0.24, 0.7, 12), stone, 0, 2.45, Z(6), root);
  const jets = [];
  const jetMat = new THREE.MeshBasicMaterial({ color: 0xe6f6ff, transparent: true, opacity: 0.7, depthWrite: false });
  for (let i = 0; i < 26; i++) {
    const m = mesh(new THREE.SphereGeometry(0.05, 6, 5), jetMat, 0, 2.8, Z(6), root);
    jets.push({ m, a: (i / 26) * 6.283, ph: i / 26 });
  }
  colliders.push([0, Z(6), 3.7]);

  /* 돌 벤치: 성모를 향해 앉는다 */
  const slab = new THREE.BoxGeometry(1.5, 0.12, 1.08), legGeo = new THREE.BoxGeometry(0.2, 0.46, 0.86);
  [[-8, 3.8], [8, 3.8], [-8, 8.2], [8, 8.2], [-3.9, -3], [3.9, -3]].forEach(([x, dz]) => {
    const z = Z(dz);
    const m = mesh(slab, stone, x, 0.52, z, seatGroup);
    [-1, 1].forEach((k) => mesh(legGeo, stoneDark, x + k * 0.55, 0.23, z, root));
    seats.push({ x, z, yaw: Math.PI, h: 0.66, zone: 'mary', mesh: m, by: null });
    colliders.push([x, z, 0.72, true]);
  });

  /* 동굴 */
  const G = -13;
  const rockMat = std(0x8d8679, { roughness: 1, flatShading: true });
  const backRock = mesh(new THREE.SphereGeometry(5.6, 24, 18, 0, Math.PI * 2, 0, Math.PI * 0.62), new THREE.MeshStandardMaterial({ color: 0x4a443b, roughness: 1, side: THREE.BackSide }), 0, 0, Z(G + 0.2), root);
  backRock.scale.set(1.05, 1.5, 0.8);
  const ROCK = 92;
  const rocks = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 0), rockMat, ROCK);
  const dm = new THREE.Object3D();
  for (let i = 0; i < ROCK; i++) {
    const t = i / (ROCK - 1), a = -Math.PI / 2 + t * Math.PI;
    const R = 5.4 + rnd() * 1.6, y = Math.cos(a) * 8.4 + rnd() * 0.8, x = Math.sin(a) * R;
    const back = rnd();
    dm.position.set(x + (rnd() - 0.5) * 1.3, Math.max(0.3, y), Z(G - 0.5 - back * 2.8));
    const sc = 1 + rnd() * 1.1; dm.scale.set(sc, sc * (0.7 + rnd() * 0.5), sc); dm.rotation.set(rnd() * 3, rnd() * 3, rnd() * 3);
    dm.updateMatrix(); rocks.setMatrixAt(i, dm.matrix);
  }
  root.add(rocks);
  // 바위를 타고 오르는 덩굴
  const ivy = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(0.34, 0), std(0x3f7a41, { flatShading: true }), 90);
  for (let i = 0; i < 90; i++) {
    const a = -Math.PI / 2 + rnd() * Math.PI, R = 4.6 + rnd() * 2.2;
    dm.position.set(Math.sin(a) * R, Math.max(0.2, Math.cos(a) * 8.2 + (rnd() - 0.4) * 1.6), Z(G + 0.1 - rnd() * 0.9));
    dm.scale.setScalar(0.7 + rnd() * 0.9); dm.rotation.set(rnd() * 3, rnd() * 3, 0); dm.updateMatrix(); ivy.setMatrixAt(i, dm.matrix);
  }
  root.add(ivy);
  colliders.push([-5.6, Z(G), 2.6], [5.6, Z(G), 2.6], [0, Z(G - 0.6), 4]);

  /* 받침대와 성모상 */
  mesh(new THREE.CylinderGeometry(1.1, 1.3, 0.42, 24), stoneDark, 0, 0.21, Z(G), root);
  mesh(new THREE.CylinderGeometry(0.82, 0.95, 1.15, 24), stone, 0, 0.97, Z(G), root);
  mesh(new THREE.CylinderGeometry(0.98, 0.84, 0.18, 24), stone, 0, 1.63, Z(G), root);
  const statue = buildStatue({ mesh, std, canvasTex });
  statue.position.set(0, 1.72, Z(G)); statue.scale.setScalar(1.28);
  root.add(statue);
  const glowTex = canvasTex(128, 128, (g, w) => {
    const gr = g.createRadialGradient(w / 2, w / 2, 4, w / 2, w / 2, w / 2);
    gr.addColorStop(0, 'rgba(255,236,180,.55)'); gr.addColorStop(1, 'rgba(255,236,180,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
  });
  const glow = mesh(new THREE.PlaneGeometry(6, 7.6), new THREE.MeshBasicMaterial({ map: glowTex, transparent: true, depthWrite: false, toneMapped: false }), 0, 3.6, Z(G - 1.2), root);
  glow.renderOrder = 1;
  const light = new THREE.PointLight(0xffe2b0, 34, 13, 1.5); light.position.set(0, 3.2, Z(G + 2.8)); light.visible = false; root.add(light);

  /* 봉헌 촛불 */
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc56b, toneMapped: false, fog: false });
  const flameGeo = new THREE.ConeGeometry(0.045, 0.17, 8), waxGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.2, 8), waxMat = std(0xf6efdc);
  const rackMat = std(0x3a342c, { metalness: 0.5, roughness: 0.5 });
  [-1, 1].forEach((k) => {
    const x = k * 3.7, z = Z(-8.2);
    mesh(new THREE.BoxGeometry(1.7, 0.08, 0.62), rackMat, x, 0.82, z, root);
    [-1, 1].forEach((e) => mesh(new THREE.BoxGeometry(0.07, 0.82, 0.5), rackMat, x + e * 0.75, 0.41, z, root));
    colliders.push([x - 0.45, z, 0.62, true], [x + 0.45, z, 0.62, true]);
    for (let i = 0; i < 8; i++) {
      const cx = x - 0.66 + (i % 4) * 0.44, cz = z + (i < 4 ? -0.14 : 0.14);
      mesh(waxGeo, waxMat, cx, 0.96, cz, root);
      const f = mesh(flameGeo, flameMat, cx, 1.15, cz, root);
      flames.push({ f, ph: cx * 9 + cz });
    }
  });

  root.visible = false;
  seats.forEach((q) => { q.mesh.visible = false; });

  return {
    root, seats, colliders, statue,
    setActive(on) {
      root.visible = on; light.visible = on;
      seats.forEach((q) => { q.mesh.visible = on; });
    },
    update(t) {
      for (const { f, ph } of flames) {
        const q = 1 + Math.sin(t * 9 + ph) * 0.1 + Math.sin(t * 17 + ph * 2) * 0.05;
        f.scale.set(2 - q, q, 2 - q);
      }
      for (const { m, a, ph } of jets) {
        const k = (t * 0.55 + ph) % 1;
        m.position.set(Math.sin(a) * 1.05 * k, 2.8 + 0.5 * Math.sin(k * Math.PI) - 2.1 * k * k, Z(6) + Math.cos(a) * 1.05 * k);
      }
      waterTex.offset.set(t * 0.012, t * 0.008);
    },
  };
}
