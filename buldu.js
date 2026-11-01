// 정원의 청동 불두: 금빛 얼굴, 짙은 나발, 납작한 윗머리. 형태는 코드로 빚고 얼굴 그림은 캔버스로 그린다
import * as THREE from './vendor/three.min.js';

export const BULDU = { x: -6, z: 58, yaw: 2.82, stand: { x: -1.5, z: 44.4 }, viewTheta: 2.82 };

const SCALE = 8.25;
const sm = (a, b, v) => { const t = Math.min(1, Math.max(0, (v - a) / (b - a))); return t * t * (3 - 2 * t); };
const gs = (X, Y, cx, cy, sx, sy) => Math.exp(-(((X - cx) / sx) ** 2) - (((Y - cy) / sy) ** 2));
const browY = (X) => 0.34 - 1.9 * (Math.abs(X) - 0.3) ** 2;
const hairY = (az) => 0.61 - 0.19 * sm(0.5, 1.5, Math.abs(az)) - 0.14 * sm(1.6, 2.8, Math.abs(az));
const faceW = 0.9, faceH = 1.3;

// 구의 점을 머리 모양으로
function shape(x, y, z) {
  const w = 0.8 * (1 + 0.1 * sm(0.2, -0.7, y)) * (1 - 0.24 * sm(-0.68, -1, y));
  return [x * w, y * 1.15, z * 0.88 * (1 - 0.1 * sm(-0.6, -1, y))];
}
// 앞얼굴의 돋음과 들어감
function relief(X, Y) {
  const ax = Math.abs(X);
  let d = 0;
  // 코
  const ridge = 0.05 + 0.2 * (1 - (Y + 0.3) / 0.52);
  d += ridge * Math.exp(-((X / 0.1) ** 2)) * sm(0.32, 0.16, Y) * sm(-0.37, -0.28, Y);
  d += 0.05 * gs(X, Y, 0, -0.26, 0.11, 0.09);
  d += 0.055 * gs(ax, Y, 0.13, -0.3, 0.07, 0.06);
  // 눈두덩과 눈꺼풀
  d -= 0.09 * gs(ax, Y, 0.3, 0.13, 0.19, 0.13);
  d += 0.045 * gs(ax, Y, 0.3, 0.1, 0.15, 0.065);
  // 눈썹뼈
  d += 0.06 * Math.exp(-(((Y - browY(X)) / 0.055) ** 2)) * sm(0.66, 0.5, ax) * sm(0.02, 0.1, ax);
  // 입
  d += 0.055 * gs(X, Y, 0, -0.525, 0.2, 0.04);
  d += 0.08 * gs(X, Y, 0, -0.62, 0.17, 0.055);
  d -= 0.015 * gs(X, Y, 0, -0.575, 0.2, 0.012);
  d -= 0.016 * gs(X, Y, 0, -0.44, 0.022, 0.05);
  // 턱과 볼
  d += 0.06 * gs(X, Y, 0, -0.86, 0.22, 0.12);
  d += 0.04 * gs(ax, Y, 0.45, -0.25, 0.22, 0.25);
  return d;
}

function faceTexture() {
  const W = 1024, H = 1480, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  const px = (X, Y) => [(0.5 + X / (2 * faceW)) * W, (0.5 - Y / (2 * faceH)) * H];
  const base = g.createLinearGradient(0, 0, 0, H);
  base.addColorStop(0, '#c49a45'); base.addColorStop(0.55, '#b08232'); base.addColorStop(1, '#8e6426');
  g.fillStyle = base; g.fillRect(0, 0, W, H);
  // 얼룩: 세월에 벗겨진 금빛
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 90; i++) {
    const x = rnd() * W, y = rnd() * H, r = 30 + rnd() * 140, gr = g.createRadialGradient(x, y, 0, x, y, r);
    const col = rnd() > 0.5 ? '226,190,110' : '110,76,28';
    gr.addColorStop(0, `rgba(${col},${0.06 + rnd() * 0.1})`); gr.addColorStop(1, `rgba(${col},0)`);
    g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const path = (pts) => { g.beginPath(); pts.forEach(([X, Y], i) => { const [a, b] = px(X, Y); if (i) g.lineTo(a, b); else g.moveTo(a, b); }); };
  const lw = (n) => { g.lineWidth = n; g.lineCap = 'round'; g.lineJoin = 'round'; };
  // 머리카락 경계 위는 짙게
  g.fillStyle = '#17151a';
  const hair = [];
  for (let X = -faceW; X <= faceW + 0.001; X += 0.03) hair.push([X, hairY((X / 0.8) * 1.45) - 0.01]);
  path([...hair, [faceW, faceH], [-faceW, faceH]]); g.closePath(); g.fill();
  [-1, 1].forEach((s) => {
    // 눈썹
    g.strokeStyle = 'rgba(62,40,20,.85)'; lw(7);
    const brow = []; for (let t = 0.06; t <= 0.62; t += 0.02) brow.push([s * t, browY(t) + 0.018]);
    path(brow); g.stroke();
    // 눈: 가늘게 뜬 아몬드 꼴
    const eye = [], low = [];
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const X = 0.12 + t * 0.36, up = 0.042 * Math.sin(Math.PI * t) ** 0.8, dn = 0.02 * Math.sin(Math.PI * t);
      eye.push([s * X, 0.1 + up]); low.push([s * X, 0.1 - dn]);
    }
    path([...eye, ...low.reverse()]); g.closePath(); g.fillStyle = '#ece4d6'; g.fill();
    g.save(); g.clip();
    const [ix, iy] = px(s * 0.285, 0.112);
    g.fillStyle = '#14100e'; g.beginPath(); g.arc(ix, iy, 0.062 / (2 * faceW) * W, 0, 7); g.fill();
    g.restore();
    g.strokeStyle = '#2a1a12'; lw(6); path(eye); g.stroke();
    g.strokeStyle = 'rgba(70,44,20,.6)'; lw(3); path(low); g.stroke();
    // 위 눈꺼풀 주름
    g.strokeStyle = 'rgba(80,52,24,.5)'; lw(3);
    path(eye.map(([X, Y]) => [X, Y + 0.035])); g.stroke();
    // 콧수염 끝의 말림
    g.strokeStyle = 'rgba(40,26,16,.9)'; lw(4);
    const curl = [];
    for (let t = 0; t <= 1.0001; t += 0.04) {
      const X = 0.215 + t * 0.075, Y = -0.565 + Math.sin(t * Math.PI * 2) * 0.016 + t * 0.012;
      curl.push([s * X, Y]);
    }
    for (let t = 0; t <= 1.0001; t += 0.1) curl.push([s * (0.29 + 0.016 * Math.sin(t * 3.4)), -0.545 + 0.022 * Math.cos(t * 3.4)]);
    path(curl); g.stroke();
    // 인중 위 잔선
    [0, 1, 2].forEach((n) => {
      const ln = [];
      for (let t = 0; t <= 1.0001; t += 0.1) ln.push([s * (0.012 + t * 0.09), -0.455 - n * 0.012 + 0.012 * Math.sin(t * Math.PI)]);
      g.strokeStyle = 'rgba(50,34,20,.7)'; lw(2.5); path(ln); g.stroke();
    });
  });
  // 입술
  const top = [], bot = [];
  for (let t = -1; t <= 1.0001; t += 0.05) {
    const X = t * 0.17;
    top.push([X, -0.565 + 0.05 * (1 - t * t) - 0.02 * Math.exp(-((t / 0.13) ** 2))]);
    bot.push([X, -0.565 - 0.075 * (1 - t * t)]);
  }
  path([...top, ...[...bot].reverse()]); g.closePath(); g.fillStyle = '#a7322f'; g.fill();
  path(bot.map(([X, Y]) => [X * 0.72, -0.585 + (Y + 0.565) * 0.62])); g.closePath(); g.fillStyle = 'rgba(208,92,92,.75)'; g.fill();
  const mid = []; for (let t = -1; t <= 1.0001; t += 0.05) mid.push([t * 0.17, -0.565 - 0.006 * (1 - t * t)]);
  g.strokeStyle = '#5c1414'; lw(3.5); path(mid); g.stroke();
  // 턱의 소용돌이 두 개
  [[-0.74, 0.03], [-0.93, 0.045]].forEach(([cy, R]) => {
    const sp = []; for (let t = 0; t <= 1.0001; t += 0.02) { const a = t * Math.PI * 5, r = R * t; sp.push([Math.cos(a) * r, cy + Math.sin(a) * r]); }
    g.strokeStyle = 'rgba(46,30,18,.8)'; lw(2.8); path(sp); g.stroke();
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

function capTexture() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#a78e63'; g.fillRect(0, 0, 512, 256);
  let seed = 31; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(70,54,34,${rnd() * 0.25})`; g.fillRect(rnd() * 512, rnd() * 256, 20 + rnd() * 90, 8 + rnd() * 40); }
  for (let i = 0; i < 70; i++) { g.fillStyle = rnd() > 0.5 ? 'rgba(245,240,225,.9)' : 'rgba(30,24,18,.85)'; const s = 1.5 + rnd() * 3; g.fillRect(rnd() * 512, rnd() * 256, s, s); }
  g.strokeStyle = 'rgba(35,28,20,.6)'; g.lineWidth = 1.5;
  for (const y of [90, 170]) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y + 6); g.stroke(); }
  for (let x = 40; x < 512; x += 110) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 6, 256); g.stroke(); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = THREE.RepeatWrapping;
  return t;
}

export function buildBuldu(scene, groundY) {
  const root = new THREE.Group();
  root.position.set(BULDU.x, groundY + 10.86, BULDU.z);
  root.rotation.y = BULDU.yaw;
  root.scale.setScalar(SCALE);
  scene.add(root);
  const gold = new THREE.MeshStandardMaterial({ map: faceTexture(), roughness: 0.55, metalness: 0.1, emissive: 0x3a2a10, emissiveIntensity: 0.55 });
  const bronze = new THREE.MeshStandardMaterial({ color: 0xb08232, roughness: 0.55, metalness: 0.1, emissive: 0x3a2a10, emissiveIntensity: 0.55 });

  // 얼굴과 두개
  const geo = new THREE.SphereGeometry(1, 144, 108), pos = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    const [X, Y, Z0] = shape(x, y, z);
    const Z = Z0 + (z > 0 ? relief(X, Y) * sm(0.05, 0.45, z) : 0);
    pos.setXYZ(i, X, Y, Z);
    if (z > -0.05) uv.setXY(i, 0.5 + X / (2 * faceW), 0.5 + Y / (2 * faceH));
    else uv.setXY(i, 0.02, 0.32);
  }
  geo.computeVertexNormals();
  const head = new THREE.Mesh(geo, gold); root.add(head);

  // 얼굴 위의 점(백호) 높이는 실제 표면에서 읽는다
  let urnaZ = 0.7, nearest = 9;
  for (let i = 0; i < pos.count; i++) {
    if (pos.getZ(i) < 0.2) continue;
    const d = Math.hypot(pos.getX(i), pos.getY(i) - 0.335);
    if (d < nearest) { nearest = d; urnaZ = pos.getZ(i); }
  }
  const urna = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), new THREE.MeshStandardMaterial({ color: 0x6a3f86, roughness: 0.2, metalness: 0.3 }));
  urna.position.set(0, 0.335, urnaZ + 0.008); root.add(urna);
  const ring = new THREE.Mesh(new THREE.TorusGeometry(0.041, 0.011, 8, 24), bronze);
  ring.position.set(0, 0.335, urnaZ + 0.006); root.add(ring);

  // 나발: 짙은 소라 모양 머리칼을 줄지어 얹는다
  const rows = 7, curls = [];
  for (let r = 0; r < rows; r++) {
    const n = Math.round(62 - r * 3.4);
    for (let i = 0; i < n; i++) {
      const az = (((i + (r % 2) * 0.5) / n) * 2 - 1) * Math.PI;
      const Y = hairY(az) + (0.98 - hairY(az)) * (r / (rows - 1)) + 0.012;
      const y = Y / 1.15, rr = Math.sqrt(Math.max(0.0001, 1 - y * y));
      const [X, , Z] = shape(Math.sin(az) * rr, y, Math.cos(az) * rr);
      curls.push([X, Y, Z]);
    }
  }
  const curl = new THREE.InstancedMesh(new THREE.SphereGeometry(0.056, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1b191e, roughness: 0.62, metalness: 0.2 }), curls.length);
  const dm = new THREE.Object3D();
  curls.forEach(([x, y, z], i) => { dm.position.set(x, y, z); dm.scale.set(1, 0.92, 1); dm.updateMatrix(); curl.setMatrixAt(i, dm.matrix); });
  curl.instanceMatrix.needsUpdate = true; root.add(curl);

  // 납작하게 깎인 윗머리
  const capMat = new THREE.MeshStandardMaterial({ map: capTexture(), roughness: 0.82, metalness: 0.05 });
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.64, 0.42, 40, 1), capMat);
  cap.position.y = 1.19; root.add(cap);

  // 귀: 길게 늘어진 귓불
  [-1, 1].forEach((s) => {
    const e = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 16), bronze);
    e.position.set(s * 0.8, 0.0, -0.08); e.scale.set(0.06, 0.34, 0.17); e.rotation.z = s * 0.1; root.add(e);
    const lobe = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 12), bronze);
    lobe.position.set(s * 0.82, -0.36, -0.07); lobe.scale.set(0.07, 0.17, 0.11); root.add(lobe);
  });

  // 목과 받침
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.46, 0.56, 0.5, 32), bronze);
  neck.position.y = -1.14; root.add(neck);
  const baseMat = new THREE.MeshStandardMaterial({ color: 0x8b8a84, roughness: 0.95 });
  const base = new THREE.Mesh(new THREE.CylinderGeometry(0.86, 0.96, 0.12, 40), baseMat);
  base.position.y = -1.3; root.add(base);

  return root;
}
