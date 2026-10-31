import * as THREE from './vendor/three.min.js';
import { Sound } from './sound.js?v=2';

const $ = (id) => document.getElementById(id);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const smooth = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const damp = (cur, to, rate, dt) => cur + (to - cur) * (1 - Math.exp(-rate * dt));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
const params = new URLSearchParams(location.search);

/* ───────── 저장 ───────── */
const KEY = 'goyoam.v1';
const today = () => { const d = new Date(); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* 사생활 모드 등 */ } };
const state = Object.assign(
  { name: '', day: today(), bowsToday: 0, bowsTotal: 0, beads: 0, rounds: 0, npc: 11, vol: { wind: 55, chant: 60, perc: 70 } },
  (() => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } })()
);
const rollDay = () => { if (state.day !== today()) { state.day = today(); state.bowsToday = 0; save(); updateHud(); } };

const ADJ = ['맑은', '고요한', '가벼운', '푸른', '따뜻한', '잔잔한', '작은', '늦은', '포근한', '은은한', '너른', '새벽'];
const NOUN = ['바람', '달', '구름', '솔잎', '이슬', '물결', '산새', '등불', '돌멩이', '오솔길', '풀잎', '별빛'];
const randomName = () => `${pick(ADJ)} ${pick(NOUN)}`;

/* ───────── 렌더러 ───────── */
const canvas = $('scene');
let renderer;
try {
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
} catch {
  $('fatal').hidden = false; $('gate').hidden = true;
  throw new Error('WebGL unavailable');
}
let pixelRatio = Math.min(devicePixelRatio || 1, 2);
renderer.setPixelRatio(pixelRatio);
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.toneMappingExposure = 1;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0xcfe0ea, 34, 170);
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 600);

function canvasTex(w, h, draw, repeat) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(repeat[0], repeat[1]); }
  return t;
}
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.85, metalness: 0, ...o });
function mesh(geo, mat, x = 0, y = 0, z = 0, parent) {
  const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z);
  if (parent) parent.add(m);
  return m;
}
const box = (w, h, d, mat, x, y, z, parent = scene) => mesh(new THREE.BoxGeometry(w, h, d), mat, x, y, z, parent);

/* ───────── 조명·하늘 ───────── */
const hemi = new THREE.HemisphereLight(0xffffff, 0x8a7a68, 1.5); scene.add(hemi);
const sun = new THREE.DirectionalLight(0xfff0dd, 1.5); sun.position.set(10, 26, 30); scene.add(sun);
const buddhaLight = new THREE.SpotLight(0xfff0d8, 42, 22, 0.34, 0.8, 1.3);
buddhaLight.position.set(0, 6.6, 2.5); buddhaLight.target.position.set(0, 3.6, -6.8); scene.add(buddhaLight, buddhaLight.target);
const candles = [-1.15, 1.15].map((x) => {
  const l = new THREE.PointLight(0xffb066, 14, 13, 1.5); l.position.set(x, 1.7, -4.7); scene.add(l); return l;
});

const skyUniforms = { top: { value: new THREE.Color() }, bottom: { value: new THREE.Color() } };
scene.add(new THREE.Mesh(
  new THREE.SphereGeometry(400, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, uniforms: skyUniforms,
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 p; void main(){ float k = pow(clamp(p.y*1.5+0.06,0.0,1.0),0.65); gl_FragColor = vec4(mix(bottom,top,k),1.0);\n#include <colorspace_fragment>\n}',
  })
));
const starGeo = new THREE.BufferGeometry();
{
  const pts = [];
  for (let i = 0; i < 500; i++) {
    const a = Math.random() * Math.PI * 2, y = rand(0.08, 1), r = Math.sqrt(1 - y * y);
    pts.push(Math.cos(a) * r * 380, y * 380, Math.sin(a) * r * 380);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
}
const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.5, sizeAttenuation: false, transparent: true, opacity: 0, fog: false, depthWrite: false }));
scene.add(stars);

const SKY = [
  { h: 0, top: '#0b1430', bot: '#1f2c52', fog: '#1b2746', hemi: 0.75, sun: 0.15, sunC: '#8fa6ff', glow: 1 },
  { h: 5, top: '#1d2a58', bot: '#77708f', fog: '#55587a', hemi: 0.85, sun: 0.25, sunC: '#b8b3ff', glow: 0.9 },
  { h: 7, top: '#7fb2e6', bot: '#fde4c8', fog: '#e8dccb', hemi: 1.35, sun: 1.2, sunC: '#ffe0bb', glow: 0.25 },
  { h: 12, top: '#6fb1ec', bot: '#e3f2f8', fog: '#d4e6ee', hemi: 1.6, sun: 1.6, sunC: '#fff4e2', glow: 0 },
  { h: 17, top: '#88a8d8', bot: '#ffe3ba', fog: '#ecdcc2', hemi: 1.35, sun: 1.25, sunC: '#ffd9a8', glow: 0.25 },
  { h: 19, top: '#3b4076', bot: '#ef9f72', fog: '#8d6f73', hemi: 0.95, sun: 0.45, sunC: '#ff9f70', glow: 0.8 },
  { h: 21, top: '#0e1736', bot: '#25335c', fog: '#1f2b4c', hemi: 0.78, sun: 0.15, sunC: '#8fa6ff', glow: 1 },
  { h: 24, top: '#0b1430', bot: '#1f2c52', fog: '#1b2746', hemi: 0.75, sun: 0.15, sunC: '#8fa6ff', glow: 1 },
];
let lanternGlow = 0;
const lanternMats = [];
const cA = new THREE.Color(), cB = new THREE.Color();
const mixHex = (a, b, t, out) => out.copy(cA.set(a)).lerp(cB.set(b), t);
function applyTime() {
  const d = new Date();
  const forced = parseFloat(params.get('hour'));
  const h = Number.isFinite(forced) ? forced : d.getHours() + d.getMinutes() / 60;
  let i = SKY.findIndex((k, n) => h >= k.h && h < SKY[n + 1]?.h);
  if (i < 0) i = 0;
  const a = SKY[i], b = SKY[i + 1], t = (h - a.h) / (b.h - a.h);
  mixHex(a.top, b.top, t, skyUniforms.top.value);
  mixHex(a.bot, b.bot, t, skyUniforms.bottom.value);
  mixHex(a.fog, b.fog, t, scene.fog.color);
  hemi.intensity = THREE.MathUtils.lerp(a.hemi, b.hemi, t);
  sun.intensity = THREE.MathUtils.lerp(a.sun, b.sun, t);
  mixHex(a.sunC, b.sunC, t, sun.color);
  lanternGlow = THREE.MathUtils.lerp(a.glow, b.glow, t);
  stars.material.opacity = lanternGlow > 0.7 ? (lanternGlow - 0.7) / 0.3 : 0;
  lanternMats.forEach((m) => { m.emissiveIntensity = 0.28 + lanternGlow * 0.95; });
}

/* ───────── 산·숲·마당 ───────── */
const ground = mesh(new THREE.CircleGeometry(420, 48), new THREE.MeshLambertMaterial({ color: 0x6f8f5d }), 0, -0.9, 0, scene);
ground.rotation.x = -Math.PI / 2;

function mountainRing(radius, base, amp, color, seed) {
  const N = 96, pos = [], idx = [];
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2;
    const n = Math.sin(a * 3 + seed) * 0.5 + Math.sin(a * 7 + seed * 2.1) * 0.3 + Math.sin(a * 13 + seed * 3.7) * 0.2;
    const y = base + amp * (0.55 + 0.5 * n);
    pos.push(Math.sin(a) * radius, -1, Math.cos(a) * radius, Math.sin(a) * (radius + 12), y, Math.cos(a) * (radius + 12));
    if (i < N) { const k = i * 2; idx.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx); g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide })));
}
mountainRing(78, 10, 18, 0x5d7f58, 1.2);
mountainRing(112, 22, 26, 0x6c8a75, 4.1);
mountainRing(150, 38, 34, 0x8aa49a, 7.7);

{
  const COUNT = 170, trunk = new THREE.CylinderGeometry(0.16, 0.28, 2.2, 6), leaf = new THREE.ConeGeometry(1.6, 3, 7);
  const tr = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x5b4634 }), COUNT);
  const lf = new THREE.InstancedMesh(leaf, new THREE.MeshLambertMaterial({ color: 0xffffff }), COUNT * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  const GREENS = ['#3f6b45', '#4d7a4c', '#356040', '#5c8551', '#b98a3a', '#c96f3a'];
  for (let i = 0; i < COUNT; i++) {
    let x, z;
    do { const a = Math.random() * Math.PI * 2, r = rand(15, 72); x = Math.sin(a) * r; z = Math.cos(a) * r; }
    while ((Math.abs(x) < 14 && z > -14 && z < 26) || (Math.abs(x) < 5 && z > 0));
    const sc = rand(1, 2.2);
    p.set(x, -0.9 + 1.1 * sc, z); s.set(sc, sc, sc); m.compose(p, q, s); tr.setMatrixAt(i, m);
    const c = pick(GREENS);
    for (let t = 0; t < 3; t++) {
      const k = 1 - t * 0.24;
      p.set(x, -0.9 + (2.5 + t * 1.45) * sc, z); s.set(sc * k, sc, sc * k); m.compose(p, q, s);
      lf.setMatrixAt(i * 3 + t, m); lf.setColorAt(i * 3 + t, col.set(c).offsetHSL(0, 0, rand(-0.03, 0.03)));
    }
  }
  scene.add(tr, lf);
}

/* ───────── 법당 건물 ───────── */
const woodTex = canvasTex(512, 512, (g, w, h) => {
  g.fillStyle = '#a97a4d'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 8; i++) {
    const y = (i / 8) * h;
    g.fillStyle = `hsl(${28 + (i % 3) * 2},${40 + (i * 7) % 10}%,${44 + ((i * 5) % 7)}%)`;
    g.fillRect(0, y, w, h / 8);
    g.fillStyle = 'rgba(70,40,15,.45)'; g.fillRect(0, y, w, 2);
    for (let k = 0; k < 16; k++) {
      g.strokeStyle = `rgba(80,45,20,${0.04 + Math.random() * 0.08})`;
      g.beginPath();
      const yy = y + Math.random() * (h / 8);
      g.moveTo(0, yy); g.bezierCurveTo(w * 0.3, yy + 3, w * 0.7, yy - 3, w, yy); g.stroke();
    }
    g.fillStyle = 'rgba(70,40,15,.4)'; g.fillRect(((i * 197) % w), y, 2, h / 8);
  }
}, [4, 5]);
const stoneTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#bdb8ae'; g.fillRect(0, 0, w, h);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) {
    g.fillStyle = `hsl(36,8%,${68 + Math.random() * 10}%)`;
    g.fillRect(x * 64 + 1.5 + (y % 2 ? 32 : 0), y * 64 + 1.5, 61, 61);
    g.fillRect(x * 64 - 62.5 + 1.5 + (y % 2 ? 32 : 0), y * 64 + 1.5, 61, 61);
  }
}, [6, 2]);
const dancheongTex = canvasTex(256, 64, (g, w, h) => {
  g.fillStyle = '#2f8f83'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#1f5e57'; g.fillRect(0, 0, w, 6); g.fillRect(0, h - 6, w, 6);
  for (let i = 0; i < 4; i++) {
    const cx = 32 + i * 64, cy = h / 2;
    g.fillStyle = '#c0392b'; g.beginPath(); g.arc(cx, cy, 20, 0, 7); g.fill();
    g.fillStyle = '#f4efe2'; g.beginPath(); g.arc(cx, cy, 14, 0, 7); g.fill();
    g.fillStyle = '#e0a526';
    for (let p = 0; p < 8; p++) { g.beginPath(); g.arc(cx + Math.cos(p * Math.PI / 4) * 9, cy + Math.sin(p * Math.PI / 4) * 9, 3.4, 0, 7); g.fill(); }
    g.fillStyle = '#2c5fa8'; g.beginPath(); g.arc(cx, cy, 5, 0, 7); g.fill();
    g.fillStyle = '#e8c35a'; g.fillRect(cx + 26, 12, 12, h - 24);
  }
});
dancheongTex.wrapS = THREE.RepeatWrapping;
const beamMat = (rep) => { const t = dancheongTex.clone(); t.needsUpdate = true; t.repeat.set(rep, 1); return std(0xffffff, { map: t }); };
const pillarMat = std(0x8c3a2b, { roughness: 0.65 });

const hall = new THREE.Group(); scene.add(hall);
// 기단·마룻바닥·마당
box(20, 0.9, 16.4, std(0xffffff, { map: woodTex, roughness: 0.6 }), 0, -0.45, -0.6, hall);
box(20, 0.9, 4.2, std(0xffffff, { map: stoneTex }), 0, -0.45, 9.7, hall);
for (let i = 0; i < 3; i++) box(7, 0.3, 0.7, std(0xb7b2a8), 0, -0.15 - i * 0.3, 12.05 + i * 0.6, hall);
box(4.6, 0.03, 26, std(0xc4bdb0), 0, -0.88, 26, hall);
// 뒷벽·측면벽 (안쪽만 보임)
const wallMat = std(0xe9dfca, { roughness: 0.95 });
const backWall = mesh(new THREE.PlaneGeometry(19.4, 7), wallMat, 0, 3.5, -8.6, hall);
backWall.name = 'backWall';
const latticeTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#f7f0dd'; g.fillRect(0, 0, w, h);
  g.strokeStyle = '#7a4a28'; g.lineWidth = 4;
  for (let i = 0; i <= 8; i++) { g.beginPath(); g.moveTo(i * 32, 0); g.lineTo(i * 32, h); g.moveTo(0, i * 32); g.lineTo(w, i * 32); g.stroke(); }
  g.lineWidth = 12; g.strokeRect(0, 0, w, h);
}, [3, 1]);
const latticeMat = std(0xffffff, { map: latticeTex, emissive: 0xffe9c4, emissiveIntensity: 0.15 });
[[-1, Math.PI / 2], [1, -Math.PI / 2]].forEach(([sx, ry]) => {
  const low = mesh(new THREE.PlaneGeometry(7.6, 1.5), wallMat, sx * 9.6, 0.75, -4.8, hall); low.rotation.y = ry;
  const win = mesh(new THREE.PlaneGeometry(7.6, 3.9), latticeMat, sx * 9.6, 3.45, -4.8, hall); win.rotation.y = ry;
  const top = mesh(new THREE.PlaneGeometry(7.6, 0.9), wallMat, sx * 9.6, 5.85, -4.8, hall); top.rotation.y = ry;
  // 트인 쪽 난간
  box(0.12, 0.12, 8.2, pillarMat, sx * 9.25, 0.85, 3.1, hall);
  for (let z = -0.6; z <= 7; z += 1.2) box(0.08, 0.85, 0.08, pillarMat, sx * 9.25, 0.42, z, hall);
});
// 후불 벽화
const muralTex = canvasTex(1024, 512, (g, w, h) => {
  const gr = g.createRadialGradient(w / 2, h * 0.62, 30, w / 2, h * 0.62, w * 0.6);
  gr.addColorStop(0, '#8f3a2a'); gr.addColorStop(0.5, '#6d2626'); gr.addColorStop(1, '#3f171d');
  g.fillStyle = gr; g.fillRect(0, 0, w, h);
  for (let r = 110; r < 620; r += 42) {
    g.strokeStyle = `rgba(247,214,130,${0.42 - r / 1900})`; g.lineWidth = 3;
    g.beginPath(); g.arc(w / 2, h * 0.62, r, 0, Math.PI * 2); g.stroke();
  }
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2;
    g.fillStyle = 'rgba(247,214,130,.28)';
    g.beginPath(); g.ellipse(w / 2 + Math.cos(a) * 300, h * 0.62 + Math.sin(a) * 215, 26, 12, a, 0, 7); g.fill();
  }
  g.strokeStyle = '#e8c35a'; g.lineWidth = 14; g.strokeRect(7, 7, w - 14, h - 14);
});
mesh(new THREE.PlaneGeometry(13, 6), std(0xffffff, { map: muralTex, emissive: 0x2a1010, emissiveIntensity: 0.25 }), 0, 3.5, -8.52, hall);
// 기둥·창방
[[-9, 7.4], [-4.5, 7.4], [4.5, 7.4], [9, 7.4], [-9, -1], [9, -1], [-9, 3.2], [9, 3.2], [-9, -8.4], [9, -8.4], [-4.5, -8.4], [4.5, -8.4]].forEach(([x, z]) => {
  mesh(new THREE.CylinderGeometry(0.3, 0.36, 6.5, 14), pillarMat, x, 3.25, z, hall);
  mesh(new THREE.CylinderGeometry(0.5, 0.56, 0.22, 14), std(0xa8a297), x, 0.1, z, hall);
});
box(18.7, 0.7, 0.5, beamMat(9), 0, 6.65, 7.4, hall);
box(18.7, 0.7, 0.3, beamMat(9), 0, 6.65, -8.45, hall);
[-1, 1].forEach((sx) => { const b = box(0.4, 0.7, 16, beamMat(8), sx * 9, 6.65, -0.5, hall); b.material.side = THREE.FrontSide; });
// 천장
const ceilTex = canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#6d3b2a'; g.fillRect(0, 0, w, h);
  g.fillStyle = '#2f8f83'; g.fillRect(12, 12, w - 24, h - 24);
  g.fillStyle = '#f4efe2'; g.beginPath(); g.arc(w / 2, h / 2, 76, 0, 7); g.fill();
  g.fillStyle = '#c0392b';
  for (let i = 0; i < 8; i++) { g.beginPath(); g.ellipse(w / 2 + Math.cos(i * Math.PI / 4) * 44, h / 2 + Math.sin(i * Math.PI / 4) * 44, 22, 13, i * Math.PI / 4, 0, 7); g.fill(); }
  g.fillStyle = '#e0a526'; g.beginPath(); g.arc(w / 2, h / 2, 22, 0, 7); g.fill();
}, [11, 10]);
const ceil = mesh(new THREE.PlaneGeometry(22.6, 19.6), std(0xffffff, { map: ceilTex }), 0, 7, -0.1, hall);
ceil.rotation.x = Math.PI / 2;
// 기와지붕
const tileTex = canvasTex(128, 128, (g, w, h) => {
  g.fillStyle = '#4b5158'; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 4; i++) { g.fillStyle = i % 2 ? '#3c4147' : '#5a6068'; g.fillRect(i * 32, 0, 22, h); }
  g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 0, w, 7);
}, [30, 7]);
const roofMat = std(0xffffff, { map: tileTex, side: THREE.DoubleSide });
[1, -1].forEach((side) => {
  const g = new THREE.PlaneGeometry(2, 1, 40, 12), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i), v = 0.5 - p.getY(i);
    const y = 12.2 - 5 * (1 - Math.pow(1 - v, 1.8)) + 1.1 * Math.pow(Math.abs(u), 5) * v * v;
    p.setXYZ(i, u * (11.4 + 1.3 * v), y, -0.1 + side * v * 10.4);
  }
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, roofMat));
});
box(23.4, 0.5, 0.7, std(0x33373c), 0, 12.3, -0.1, hall);
[-1, 1].forEach((sx) => {
  const shape = new THREE.Shape(); shape.moveTo(-9.6, 7); shape.lineTo(9.4, 7); shape.lineTo(-0.1, 12.2); shape.closePath();
  const gb = mesh(new THREE.ShapeGeometry(shape), std(0x6e4a34, { side: THREE.DoubleSide }), sx * 10.2, 0, 0, hall);
  gb.rotation.y = -Math.PI / 2 * -1; gb.rotation.y = Math.PI / 2;
  gb.scale.x = 1;
});
// 마당 석탑
{
  const pag = new THREE.Group(); pag.position.set(8.5, -0.9, 19); scene.add(pag);
  const st = std(0x9c988e, { roughness: 1 });
  box(3, 0.5, 3, st, 0, 0.25, 0, pag);
  let y = 0.5;
  for (let i = 0; i < 5; i++) {
    const w = 1.5 - i * 0.2;
    box(w, 0.8 - i * 0.08, w, st, 0, y + 0.4, 0, pag); y += 0.8 - i * 0.08;
    box(w + 0.8, 0.14, w + 0.8, st, 0, y + 0.07, 0, pag); y += 0.14;
  }
  mesh(new THREE.ConeGeometry(0.1, 1, 8), st, 0, y + 0.5, 0, pag);
}

/* ───────── 연등 ───────── */
const lanterns = [];
{
  const geo = new THREE.SphereGeometry(0.36, 14, 10), thread = new THREE.CylinderGeometry(0.008, 0.008, 1, 4);
  const tagGeo = new THREE.PlaneGeometry(0.1, 0.42), threadMat = std(0x7a5a3a), tagMat = std(0xfaf3e3, { side: THREE.DoubleSide });
  const colors = [0xf29bb3, 0xf6d36b, 0x9fd8a4, 0x9fc6ee, 0xf7efe0, 0xf29bb3, 0xf6d36b];
  const mats = colors.map((c) => { const m = std(c, { emissive: c, emissiveIntensity: 0.3 }); lanternMats.push(m); return m; });
  for (const z of [-2.2, 1.6, 5.2]) for (let i = 0; i < 7; i++) {
    if (i === 3) continue;
    const g = new THREE.Group(); const x = -7.2 + i * 2.4;
    const drop = 1 + ((i * 3 + Math.abs(Math.round(z))) % 3) * 0.14;
    g.position.set(x, 7, z);
    const th = mesh(thread, threadMat, 0, -drop / 2, 0, g); th.scale.y = drop;
    const l = mesh(geo, mats[(((i + Math.round(z)) % 7) + 7) % 7], 0, -drop - 0.26, 0, g); l.scale.y = 0.86;
    mesh(tagGeo, tagMat, 0, -drop - 0.8, 0, g);
    scene.add(g); lanterns.push({ g, ph: Math.random() * 6.28 });
  }
}

/* ───────── 불상·불단 ───────── */
const gold = std(0xd6a743, { metalness: 0.75, roughness: 0.34, emissive: 0x4a3208, emissiveIntensity: 0.35 });
const altarRed = std(0x7d2a22, { roughness: 0.55 }), trim = std(0xc69a3f, { metalness: 0.5, roughness: 0.4 });
box(7.6, 1.1, 2.9, altarRed, 0, 0.55, -6.65);
box(7.8, 0.1, 3.05, trim, 0, 1.12, -6.65);
box(7.8, 0.1, 3.05, trim, 0, 0.05, -6.65);
{
  const b = new THREE.Group(); b.position.set(0, 1.17, -6.7); scene.add(b);
  const lathe = (pts, y = 0) => mesh(new THREE.LatheGeometry(pts.map(([r, h]) => new THREE.Vector2(r, h)), 32), gold, 0, y, 0, b);
  lathe([[0, 0], [1.75, 0], [1.85, 0.16], [1.6, 0.34], [1.35, 0.42], [0, 0.42]]);
  const petal = new THREE.SphereGeometry(0.34, 12, 8);
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, p = mesh(petal, gold, Math.sin(a) * 1.75, 0.42, Math.cos(a) * 1.75, b);
    p.scale.set(0.9, 0.62, 0.55); p.rotation.y = a; p.rotation.x = -0.35;
  }
  const by = 0.55, s1 = mesh(new THREE.SphereGeometry(1, 28, 18), gold, 0, by + 0.36, 0.12, b); s1.scale.set(1.58, 0.52, 1.14);
  lathe([[0.8, 0], [0.8, 0.3], [0.76, 0.85], [0.74, 1.22], [0.5, 1.5], [0.26, 1.6], [0, 1.62]], by + 0.42);
  const sh = mesh(new THREE.SphereGeometry(0.72, 22, 14), gold, 0, by + 1.62, 0, b); sh.scale.set(1.42, 0.5, 0.72);
  mesh(new THREE.CylinderGeometry(0.2, 0.26, 0.3, 14), gold, 0, by + 1.98, 0, b);
  const skin = std(0xe5ba5a, { metalness: 0.55, roughness: 0.32, emissive: 0x4a3208, emissiveIntensity: 0.35 });
  const hy = by + 2.52;
  const head = mesh(new THREE.SphereGeometry(0.58, 28, 22), skin, 0, hy, 0, b); head.scale.set(0.94, 1.08, 0.94);
  const hair = std(0x3b4358, { roughness: 0.75 });
  const cap = mesh(new THREE.SphereGeometry(0.6, 28, 14, 0, Math.PI * 2, 0, 1.28), hair, 0, hy + 0.05, -0.03, b); cap.scale.set(0.94, 1.03, 0.95);
  mesh(new THREE.SphereGeometry(0.26, 18, 14), hair, 0, hy + 0.66, -0.03, b);
  [-1, 1].forEach((s) => {
    const ear = mesh(new THREE.SphereGeometry(0.13, 12, 10), skin, s * 0.56, hy - 0.08, 0, b); ear.scale.set(0.45, 2.1, 0.8);
    const eye = mesh(new THREE.TorusGeometry(0.1, 0.014, 6, 14, Math.PI * 0.72), std(0x4b3210), s * 0.21, hy - 0.01, 0.525, b);
    eye.rotation.z = Math.PI + Math.PI * 0.14;
    const brow = mesh(new THREE.TorusGeometry(0.15, 0.011, 6, 16, Math.PI * 0.62), std(0x6e4c17), s * 0.21, hy + 0.04, 0.518, b);
    brow.rotation.z = Math.PI * 0.19;
    // 팔·손
    const up = mesh(new THREE.CapsuleGeometry(0.2, 0.86, 6, 12), gold, s * 0.92, by + 1.25, 0.1, b); up.rotation.z = s * 0.18; up.rotation.x = -0.14;
    const fore = mesh(new THREE.CapsuleGeometry(0.18, 0.75, 6, 12), gold, s * 0.56, by + 0.72, 0.56, b); fore.rotation.z = s * 1.12; fore.rotation.x = 0.1;
    const hand = mesh(new THREE.SphereGeometry(0.19, 14, 10), skin, s * 0.13, by + 0.68, 0.85, b); hand.scale.set(1.2, 0.5, 0.9);
  });
  const nose = mesh(new THREE.SphereGeometry(0.055, 10, 8), skin, 0, hy - 0.12, 0.55, b); nose.scale.set(1, 1.5, 0.9);
  const mouth = mesh(new THREE.TorusGeometry(0.075, 0.01, 6, 14, Math.PI * 0.8), std(0x8a4b1a), 0, hy - 0.24, 0.5, b);
  mouth.rotation.z = Math.PI + Math.PI * 0.1;
  mesh(new THREE.SphereGeometry(0.024, 8, 6), std(0xfaf0d0, { emissive: 0xffe7a8, emissiveIntensity: 0.6 }), 0, hy + 0.08, 0.545, b);
  const haloTex = canvasTex(512, 512, (g, w) => {
    const c = w / 2, gr = g.createRadialGradient(c, c, 40, c, c, c);
    gr.addColorStop(0, 'rgba(255,240,190,.9)'); gr.addColorStop(0.55, 'rgba(240,200,120,.5)');
    gr.addColorStop(0.82, 'rgba(224,170,80,.32)'); gr.addColorStop(1, 'rgba(224,170,80,0)');
    g.fillStyle = gr; g.fillRect(0, 0, w, w);
    g.strokeStyle = 'rgba(160,80,30,.6)'; g.lineWidth = 4;
    [110, 150, 190].forEach((r) => { g.beginPath(); g.arc(c, c, r, 0, 7); g.stroke(); });
  });
  const halo = mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, toneMapped: false }), 0, hy + 0.05, -0.9, b);
  halo.renderOrder = -1;
}
// 예불상·촛대·향로·연꽃
box(4.2, 0.1, 1, altarRed, 0, 0.85, -4.75); box(4.3, 0.04, 1.08, trim, 0, 0.92, -4.75);
[-1.7, 1.7].forEach((x) => box(0.12, 0.82, 0.8, altarRed, x, 0.41, -4.75));
const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc66e, toneMapped: false });
const flames = [-1.15, 1.15].map((x) => {
  mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.05, 12), trim, x, 0.96, -4.72);
  mesh(new THREE.CylinderGeometry(0.06, 0.07, 0.42, 10), std(0xfaf3e3), x, 1.19, -4.72);
  const f = mesh(new THREE.SphereGeometry(0.055, 8, 8), flameMat, x, 1.48, -4.72, scene); f.scale.y = 2; return f;
});
mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.2, 14), trim, 0, 1.04, -4.72);
{
  const pink = std(0xf4a7bb), yel = std(0xf6d36b);
  [-0.62, 0.62].forEach((x) => {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * 6.28, p = mesh(new THREE.SphereGeometry(0.1, 8, 6), pink, x + Math.sin(a) * 0.1, 1.04, -4.72 + Math.cos(a) * 0.1);
      p.scale.set(0.55, 1.2, 0.5); p.rotation.y = a; p.rotation.x = 0.42;
    }
    mesh(new THREE.SphereGeometry(0.05, 8, 6), yel, x, 1.04, -4.72);
  });
}
const smokeTex = canvasTex(64, 64, (g, w) => {
  const gr = g.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2);
  gr.addColorStop(0, 'rgba(255,255,255,.55)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, w, w);
});
const smoke = Array.from({ length: reduceMotion ? 0 : 12 }, (_, i) => {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTex, transparent: true, depthWrite: false, opacity: 0 }));
  scene.add(s); return { s, t: i / 12, seed: Math.random() * 6 };
});

/* ───────── 낙엽 ───────── */
const LEAVES = reduceMotion ? 0 : 46;
const leafMesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.2, 0.13), new THREE.MeshLambertMaterial({ color: 0xffffff, side: THREE.DoubleSide }), Math.max(LEAVES, 1));
leafMesh.frustumCulled = false; leafMesh.count = LEAVES; scene.add(leafMesh);
const leaves = [];
{
  const col = new THREE.Color(), palette = ['#d9852f', '#c95b2b', '#e4b23a', '#b9772b'];
  const spot = (l) => {
    do { l.x = rand(-24, 24); l.z = rand(-14, 30); } while (Math.abs(l.x) < 12 && l.z < 10.5);
  };
  for (let i = 0; i < LEAVES; i++) {
    const l = { y: rand(0, 13), sp: rand(0.5, 1.1), ph: Math.random() * 6.28, spot };
    spot(l); leaves.push(l); leafMesh.setColorAt(i, col.set(pick(palette)));
  }
}

/* ───────── 방석 ───────── */
const cushions = [];
const cushionGroup = new THREE.Group(); scene.add(cushionGroup);
{
  const geo = new THREE.CylinderGeometry(0.62, 0.68, 0.16, 26);
  const mats = [std(0xa33c3a), std(0x38708a), std(0x8a6a2d)];
  const edge = new THREE.TorusGeometry(0.65, 0.025, 6, 26), edgeMat = std(0xe8c35a);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    const x = -6 + c * 3, z = -2.5 + r * 2;
    const m = mesh(geo, mats[(r + c) % 3], x, 0.08, z, cushionGroup);
    const e = mesh(edge, edgeMat, 0, 0.05, 0, m); e.rotation.x = Math.PI / 2;
    m.userData.cushion = cushions.length;
    cushions.push({ x, z, by: null, mesh: m });
  }
}

/* ───────── 동자승 ───────── */
const G = {
  head: new THREE.SphereGeometry(0.43, 24, 18), robe: new THREE.LatheGeometry(
    [[0, 0.12], [0.44, 0.12], [0.46, 0.2], [0.38, 0.5], [0.27, 0.74], [0.16, 0.84], [0, 0.86]].map(([r, h]) => new THREE.Vector2(r, h)), 20),
  arm: new THREE.CapsuleGeometry(0.075, 0.26, 4, 8), hand: new THREE.SphereGeometry(0.075, 10, 8),
  foot: new THREE.SphereGeometry(0.11, 10, 8), eye: new THREE.SphereGeometry(0.038, 8, 8),
  cheek: new THREE.CircleGeometry(0.058, 12), ear: new THREE.SphereGeometry(0.07, 10, 8),
  mouth: new THREE.TorusGeometry(0.04, 0.009, 5, 10, Math.PI * 0.85), sash: new THREE.TorusGeometry(0.31, 0.04, 6, 18),
  blob: new THREE.CircleGeometry(0.55, 20),
};
const M = {
  skin: std(0xfde6d3, { roughness: 0.7 }), crown: std(0xcfc6c2, { roughness: 0.85 }), eye: std(0x2a2320, { roughness: 0.3 }),
  cheek: new THREE.MeshBasicMaterial({ color: 0xf5a7a2, transparent: true, opacity: 0.55, depthWrite: false }),
  mouth: std(0xb4665a), sash: std(0x8a4b2e), foot: std(0xf3efe6),
  robes: [std(0x9095a0), std(0x7f8794), std(0xa3a39b), std(0x8a8f86)],
  blob: new THREE.MeshBasicMaterial({ color: 0x20140a, transparent: true, opacity: 0.2, depthWrite: false }),
};
function nameSprite(text, mine) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), font = '600 40px Pretendard, "Malgun Gothic", sans-serif';
  const label = mine ? `나: ${text}` : text;
  g.font = font; const w = Math.ceil(g.measureText(label).width) + 44; c.width = w; c.height = 68;
  g.font = font; g.fillStyle = mine ? 'rgba(79,70,229,.9)' : 'rgba(255,255,255,.76)';
  g.beginPath(); g.roundRect(0, 0, w, 68, 34); g.fill();
  g.fillStyle = mine ? '#fff' : '#334155'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(label, w / 2, 36);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, depthWrite: false, depthTest: !mine, toneMapped: false }));
  if (mine) s.renderOrder = 10;
  s.scale.set((w / 68) * 0.27, 0.27, 1); s.position.y = 1.86;
  return s;
}
function makeMonk(name, mine = false) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const blob = mesh(G.blob, M.blob, 0, 0.012, 0, root); blob.rotation.x = -Math.PI / 2;
  const robeMat = mine ? M.robes[0] : pick(M.robes);
  mesh(G.robe, robeMat, 0, 0, 0, body);
  const sash = mesh(G.sash, M.sash, 0, 0.52, 0, body); sash.rotation.x = Math.PI / 2 - 0.16; sash.rotation.y = 0.5; sash.scale.set(1.02, 1, 0.5);
  const head = new THREE.Group(); head.position.y = 1.15; body.add(head);
  mesh(G.head, M.skin, 0, 0, 0, head);
  const crown = mesh(new THREE.SphereGeometry(0.436, 24, 12, 0, Math.PI * 2, 0, 1.05), M.crown, 0, 0.01, -0.012, head); crown.rotation.x = -0.28;
  [-1, 1].forEach((s) => {
    mesh(G.ear, M.skin, s * 0.42, -0.03, 0, head);
    const e = mesh(G.eye, M.eye, s * 0.15, -0.03, 0.39, head); e.scale.set(1, 1.2, 0.5);
    const ch = mesh(G.cheek, M.cheek, s * 0.25, -0.13, 0.345, head); ch.rotation.y = s * 0.62;
  });
  const m = mesh(G.mouth, M.mouth, 0, -0.14, 0.405, head); m.rotation.z = Math.PI + 0.25;
  const arms = [-1, 1].map((s) => {
    const a = new THREE.Group(); a.position.set(s * 0.25, 0.74, 0.02); body.add(a);
    mesh(G.arm, robeMat, 0, -0.17, 0, a); mesh(G.hand, M.skin, 0, -0.39, 0, a);
    return { a, s };
  });
  const feet = [-1, 1].map((s) => { const f = mesh(G.foot, M.foot, s * 0.17, 0.08, 0.1, root); f.scale.set(1, 0.7, 1.4); return { f, s }; });
  const label = nameSprite(name, mine); root.add(label);
  scene.add(root);
  return {
    name, root, body, head, arms, feet, mine, label,
    x: 0, z: 0, yaw: Math.PI, yawTo: Math.PI, target: null, cushion: null, leaving: false,
    sit: 0, sitTo: 0, hap: 0, hapTo: 0, hapUntil: 0, bowT: null, phase: Math.random() * 6, walk: 0, stuck: 0, pop: 1, onArrive: null,
  };
}
const BOW_TIME = 4.8;
const PILLARS = [[-4.5, 7.4], [4.5, 7.4]];
const heightAt = (z) => (z > 11.7 ? -Math.min(0.9, (z - 11.7) * 0.45) : 0);

function setTarget(c, x, z, cush = null, onArrive = null) {
  freeCushion(c);
  c.bowT = null; c.sitTo = 0; c.hapTo = 0; c.hapUntil = 0; c.target = { x, z, cush }; c.onArrive = onArrive; c.stuck = 0;
  if (cush != null) cushions[cush].by = c;
}
function freeCushion(c) {
  if (c.cushion != null) { cushions[c.cushion].by = null; c.cushion = null; }
  if (c.target?.cush != null) { cushions[c.target.cush].by = null; }
}
function startBow(c) {
  if (c.bowT != null || c.target) return false;
  c.bowT = 0; c.yawTo = Math.PI; c.bowHit = false; return true;
}
function updateMonk(c, dt, t) {
  let moving = 0;
  if (c.target) {
    const dx = c.target.x - c.x, dz = c.target.z - c.z, d = Math.hypot(dx, dz);
    if (d < 0.08) {
      if (c.target.cush != null) { c.cushion = c.target.cush; c.sitTo = 1; c.yawTo = Math.PI; }
      const done = c.onArrive; c.target = null; c.onArrive = null;
      if (c.mine) marker.visible = false;
      done?.();
    } else {
      const sp = (c.mine ? 3 : 2.1) * dt, ox = c.x, oz = c.z;
      c.x += (dx / d) * Math.min(sp, d); c.z += (dz / d) * Math.min(sp, d);
      for (const [px, pz] of PILLARS) {
        const ax = c.x - px, az = c.z - pz, al = Math.hypot(ax, az);
        if (al < 0.8 && al > 0.0001) {
          const tx = -az / al, tz = ax / al, sgn = tx * dx + tz * dz >= 0 ? 1 : -1;
          c.x = px + (ax / al) * 0.8 + tx * sgn * sp; c.z = pz + (az / al) * 0.8 + tz * sgn * sp;
        }
      }
      c.yawTo = Math.atan2(dx, dz); moving = 1;
      c.stuck = Math.hypot(c.x - ox, c.z - oz) < sp * 0.2 ? c.stuck + dt : 0;
      if (c.stuck > 0.8) { const cu = c.target.cush; if (cu != null) cushions[cu].by = null; c.target = null; c.onArrive = null; if (c.mine) marker.visible = false; }
    }
  }
  moveKeys(c, dt, () => { moving = 1; });

  let dy = c.yawTo - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  c.yaw += dy * (1 - Math.exp(-9 * dt));
  c.walk = damp(c.walk, moving, 10, dt);
  c.phase += dt * 10 * moving;
  c.sit = damp(c.sit, c.sitTo, 6, dt);
  if (c.hapUntil && t > c.hapUntil) { c.hapTo = 0; c.hapUntil = 0; }

  let kneel = 0, down = 0;
  if (c.bowT != null) {
    c.bowT += dt / BOW_TIME;
    const b = c.bowT;
    kneel = smooth(0, 0.22, b) * (1 - smooth(0.78, 1, b));
    down = smooth(0.22, 0.48, b) * (1 - smooth(0.62, 0.84, b));
    c.hapTo = 1;
    if (!c.bowHit && b > 0.5) { c.bowHit = true; if (c.mine) sound.moktak(0.75); }
    if (b >= 1) { c.bowT = null; c.hapTo = 0; c.onBowDone?.(); }
  }
  c.hap = damp(c.hap, c.hapTo, 8, dt);

  const low = Math.max(c.sit, kneel);
  const hop = Math.abs(Math.sin(c.phase)) * 0.05 * c.walk;
  const cushionY = c.cushion != null ? 0.14 * c.sit : 0;
  c.root.position.set(c.x, heightAt(c.z) + hop + cushionY, c.z);
  c.root.rotation.y = c.yaw;
  c.root.scale.setScalar(c.pop);
  if (!c.mine) {
    const d = camera.position.distanceTo(c.root.position);
    c.label.material.opacity = smooth(3, 4.5, d) * (1 - smooth(8, 11, d));
    c.label.visible = c.label.material.opacity > 0.01;
  }
  c.body.position.y = -0.2 * low + Math.sin(t * 1.4 + c.phase) * 0.006;
  c.body.scale.set(1 + 0.1 * low, 1 - 0.05 * low, 1 + 0.1 * low);
  c.body.rotation.x = 1.32 * down;
  c.body.rotation.z = Math.sin(c.phase) * 0.05 * c.walk;
  c.head.rotation.x = -0.28 * down + 0.08 * c.hap * (1 - down);
  for (const { a, s } of c.arms) {
    const swing = Math.sin(c.phase + (s > 0 ? 0 : Math.PI)) * 0.55 * c.walk;
    const lap = c.sit * (1 - c.hap);
    const rx = swing * (1 - c.hap) - 0.72 * lap - 1.28 * c.hap * (1 - down) - 1.65 * down;
    const rz = s * (0.2 * (1 - c.hap) * (1 - lap) - 0.5 * lap - 1.07 * c.hap * (1 - down) + 0.05 * down);
    a.rotation.set(rx, 0, rz);
  }
  for (const { f, s } of c.feet) {
    f.position.z = 0.1 + Math.sin(c.phase + (s > 0 ? Math.PI : 0)) * 0.14 * c.walk + 0.08 * low;
    f.position.x = s * (0.17 + 0.2 * low);
  }
}

/* ───────── 나와 이웃 ───────── */
const sound = new Sound(state.vol);
let player = null;
const npcs = [];
const marker = mesh(new THREE.RingGeometry(0.18, 0.28, 24), new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.8, depthWrite: false }), 0, 0.03, 0);
marker.rotation.x = -Math.PI / 2; marker.visible = false; scene.add(marker);

const freeCushions = () => cushions.map((c, i) => ({ c, i })).filter(({ c }) => !c.by);
const usedNames = new Set();
const uniqueName = () => { for (let i = 0; i < 40; i++) { const n = randomName(); if (!usedNames.has(n)) { usedNames.add(n); return n; } } return randomName(); };

function addNpc(seated) {
  const free = freeCushions(); if (!free.length) return;
  const { i } = pick(free);
  const name = uniqueName();
  const n = makeMonk(name);
  n.nextAct = performance.now() / 1000 + rand(6, 40);
  n.onBowDone = () => { n.nextAct = performance.now() / 1000 + rand(14, 55); };
  if (seated) {
    n.x = cushions[i].x; n.z = cushions[i].z; n.cushion = i; cushions[i].by = n; n.sit = n.sitTo = 1;
    if (Math.random() < 0.4) n.bowT = Math.random() * 0.8;
  } else {
    n.x = rand(-2.8, 2.8); n.z = 14; n.pop = 0.01;
    setTarget(n, cushions[i].x, cushions[i].z, i);
  }
  npcs.push(n);
}
function leaveNpc(n) {
  if (n.leaving) return;
  n.leaving = true;
  setTarget(n, rand(-2.8, 2.8), 14, null, () => { n.gone = true; });
}
function disposeNpc(n) {
  scene.remove(n.root);
  usedNames.delete(n.name);
  n.root.traverse((o) => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } });
  npcs.splice(npcs.indexOf(n), 1);
}
const liveNpcs = () => npcs.filter((n) => !n.leaving);
function syncNpcCount() {
  const live = liveNpcs();
  if (live.length < state.npc) addNpc(false);
  else if (live.length > state.npc) leaveNpc(pick(live));
}
function npcTick(t) {
  for (const n of [...npcs]) {
    if (n.gone) { disposeNpc(n); continue; }
    if (n.pop < 1) n.pop = Math.min(1, n.pop + 0.03);
    if (n.leaving) n.pop = n.z > 12.8 ? Math.max(0.02, (14 - n.z) / 1.2) : n.pop;
    if (n.cushion == null || n.target || n.bowT != null) continue;
    if (t > n.nextAct) {
      if (Math.random() < 0.72) startBow(n);
      else { n.hapTo = 1; n.hapUntil = t + rand(6, 16); n.nextAct = t + rand(20, 60); }
    }
  }
}
let nextSwap = performance.now() / 1000 + 45;
function communityTick(t) {
  if (t > nextSwap) {
    nextSwap = t + rand(35, 90);
    const live = liveNpcs().filter((n) => n.cushion != null);
    if (live.length && live.length === state.npc) { leaveNpc(pick(live)); addNpc(false); }
  }
  syncNpcCount();
}

/* ───────── 입력 ───────── */
const orbit = { theta: 0, phi: 1.22, dist: 8.2 };
const camTarget = new THREE.Vector3(0, 1, 7);
const pointers = new Map();
let tap = null, pinch = 0;
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitV = new THREE.Vector3();
let entered = false;
const modalOpen = () => !$('beadsModal').hidden || !$('settingsModal').hidden;

canvas.addEventListener('pointerdown', (e) => {
  if (!entered) return;
  canvas.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  tap = pointers.size === 1 ? { x: e.clientX, y: e.clientY, t: performance.now(), moved: false } : null;
  if (pointers.size === 2) { const [a, b] = [...pointers.values()]; pinch = Math.hypot(a.x - b.x, a.y - b.y); }
});
canvas.addEventListener('pointermove', (e) => {
  const p = pointers.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
    if (pinch) orbit.dist = clamp(orbit.dist * (pinch / d), 3.2, 16);
    pinch = d; return;
  }
  if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap.moved = true;
  if (tap?.moved) {
    orbit.theta -= dx * 0.006;
    orbit.phi = clamp(orbit.phi - dy * 0.005, 0.42, 1.5);
  }
});
const endPointer = (e) => {
  const had = pointers.delete(e.pointerId);
  if (had && e.type === 'pointerup' && tap && !tap.moved && performance.now() - tap.t < 500) handleTap(e.clientX, e.clientY);
  if (!pointers.size) tap = null;
};
canvas.addEventListener('pointerup', endPointer);
canvas.addEventListener('pointercancel', endPointer);
canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (entered) orbit.dist = clamp(orbit.dist * Math.exp(e.deltaY * 0.001), 3.2, 16); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function handleTap(cx, cy) {
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  const hit = raycaster.intersectObjects(cushionGroup.children, false)[0];
  if (hit) { goToCushion(hit.object.userData.cushion); return; }
  if (raycaster.ray.intersectPlane(floorPlane, hitV)) walkTo(hitV.x, hitV.z);
}
const BOUNDS = { x: 8.4, zMin: -3.9, zMax: 11 };
function walkTo(x, z) {
  stopAuto();
  x = clamp(x, -BOUNDS.x, BOUNDS.x); z = clamp(z, BOUNDS.zMin, BOUNDS.zMax);
  setTarget(player, x, z);
  marker.position.set(x, 0.03, z); marker.visible = true; marker.scale.setScalar(1);
  updateSitBtn();
}
function goToCushion(i) {
  const c = cushions[i];
  if (c.by && c.by !== player) { toast('다른 분이 앉아 있는 자리입니다'); return; }
  stopAuto();
  setTarget(player, c.x, c.z, i, updateSitBtn);
  marker.visible = false; updateSitBtn();
}
function nearestFreeCushion() {
  let best = null, bd = 1e9;
  freeCushions().forEach(({ c, i }) => { const d = Math.hypot(c.x - player.x, c.z - player.z); if (d < bd) { bd = d; best = i; } });
  return best;
}

/* 키보드 */
const keys = new Set();
const keyVec = new THREE.Vector2();
function moveKeys(c, dt, onMove) {
  if (!c.mine || !keys.size || modalOpen()) return;
  keyVec.set((keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
    (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0) - (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0));
  if (!keyVec.lengthSq()) return;
  if (c.cushion != null || c.target || c.bowT != null) { freeCushion(c); c.cushion = null; c.target = null; c.bowT = null; c.sitTo = 0; c.hapTo = 0; stopAuto(); marker.visible = false; updateSitBtn(); }
  keyVec.normalize().rotateAround({ x: 0, y: 0 }, -orbit.theta);
  c.x = clamp(c.x + keyVec.x * 3 * dt, -BOUNDS.x, BOUNDS.x);
  c.z = clamp(c.z + keyVec.y * 3 * dt, BOUNDS.zMin, BOUNDS.zMax);
  for (const [px, pz] of PILLARS) {
    const ax = c.x - px, az = c.z - pz, al = Math.hypot(ax, az);
    if (al < 0.8 && al > 0.0001) { c.x = px + (ax / al) * 0.8; c.z = pz + (az / al) * 0.8; }
  }
  c.yawTo = Math.atan2(keyVec.x, keyVec.y); onMove();
}
addEventListener('keydown', (e) => {
  if (e.key === 'Escape') { closeModals(); return; }
  if (!entered || modalOpen()) return;
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space' && e.target.tagName !== 'BUTTON') { e.preventDefault(); if (!e.repeat) doBow(); return; }
  if (e.code === 'KeyH' && !e.repeat) { doHap(); return; }
  if (/^(Key[WASD]|Arrow(Up|Down|Left|Right))$/.test(e.code)) { keys.add(e.code); if (e.code.startsWith('Arrow')) e.preventDefault(); }
});
addEventListener('keyup', (e) => keys.delete(e.code));
addEventListener('blur', () => keys.clear());

/* ───────── 행동·HUD ───────── */
let autoBow = false, toastTimer;
function toast(msg, ms = 2800) {
  const el = $('toast'); el.textContent = msg; el.hidden = true; void el.offsetWidth; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
function updateHud() {
  $('bowToday').textContent = state.bowsToday;
  $('bowBar').style.width = `${Math.min(100, ((state.bowsToday % 108 || (state.bowsToday ? 108 : 0)) / 108) * 100)}%`;
  $('statTotal').textContent = state.bowsTotal.toLocaleString();
  $('statRounds').textContent = state.rounds.toLocaleString();
}
function updateSitBtn() {
  const seated = player && (player.cushion != null || player.target?.cush != null);
  $('btnSitLabel').textContent = seated ? '일어서기' : '앉기';
}
function doHap() {
  if (player.target || player.bowT != null) return;
  player.yawTo = Math.PI;
  if (player.hapTo) { player.hapTo = 0; player.hapUntil = 0; return; }
  player.hapTo = 1; player.hapUntil = performance.now() / 1000 + 8;
  sound.moktak(0.35);
}
function doBow() {
  rollDay();
  if (player.target) { freeCushion(player); player.target = null; marker.visible = false; updateSitBtn(); }
  startBow(player);
}
function stopAuto() {
  if (!autoBow) return;
  autoBow = false; $('btnAuto').setAttribute('aria-pressed', 'false');
}
function onPlayerBowDone() {
  rollDay();
  state.bowsToday++; state.bowsTotal++; save(); updateHud();
  if (state.bowsToday % 108 === 0) { sound.bell(); toast(`108배를 ${state.bowsToday / 108}번 마쳤습니다`, 5000); stopAuto(); return; }
  if (autoBow) setTimeout(() => { if (autoBow) startBow(player); }, 350);
}

$('dock').addEventListener('click', (e) => { if (e.detail) document.activeElement?.blur(); });
$('btnHap').onclick = doHap;
$('btnBow').onclick = doBow;
$('btnAuto').onclick = () => {
  autoBow = !autoBow;
  $('btnAuto').setAttribute('aria-pressed', String(autoBow));
  if (autoBow) { toast('절을 이어서 올립니다. 다시 누르면 멈춥니다'); doBow(); }
};
$('btnSit').onclick = () => {
  if (player.cushion != null || player.target?.cush != null) {
    stopAuto(); freeCushion(player); player.cushion = null; player.target = null; player.sitTo = 0; player.hapTo = 0;
    updateSitBtn(); return;
  }
  const i = nearestFreeCushion();
  if (i == null) { toast('빈 방석이 없습니다'); return; }
  goToCushion(i);
};
function setChant(on, quiet) {
  $('btnChant').setAttribute('aria-pressed', String(on));
  sound.setChant(on).then(() => {
    if (on && !quiet && sound.chantOn) toast('나무아미타불');
  }).catch(() => {
    sound.chantOn = false; $('btnChant').setAttribute('aria-pressed', 'false');
    toast('염불 음원을 불러오지 못했습니다. 다시 눌러 주세요');
  });
}
$('btnChant').onclick = () => { chantUntil = 0; setChant(!sound.chantOn); };
$('btnBeads').onclick = () => openModal('beadsModal');
$('openSettings').onclick = () => openModal('settingsModal');

/* 모달 */
let lastFocus = null;
function openModal(id) {
  lastFocus = document.activeElement;
  $(id).hidden = false; keys.clear();
  $(id).querySelector('.modal-x').focus();
}
function closeModals() {
  ['beadsModal', 'settingsModal'].forEach((id) => { $(id).hidden = true; });
  lastFocus?.focus?.(); lastFocus = null;
}
document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = closeModals; });
document.querySelectorAll('.overlay').forEach((o) => {
  o.addEventListener('pointerdown', (e) => { if (e.target === o) closeModals(); });
  o.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...o.querySelectorAll('button, input')], first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
});

/* 염주 */
const beadEls = [];
{
  const NS = 'http://www.w3.org/2000/svg';
  const add = (x, y, r, cls) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', r); if (cls) c.setAttribute('class', cls);
    $('beadSvg').appendChild(c); return c;
  };
  add(150, 14, 7.2, 'head');
  for (let i = 0; i < 108; i++) {
    const a = ((i + 1) / 109) * Math.PI * 2;
    beadEls.push(add(150 + Math.sin(a) * 136, 150 - Math.cos(a) * 136, 3.5));
  }
}
function drawBeads() {
  beadEls.forEach((b, i) => b.classList.toggle('on', i < state.beads));
  $('beadCount').textContent = state.beads;
  $('beadRounds').textContent = state.rounds ? `${state.rounds}바퀴 돌림` : '';
  $('statRounds').textContent = state.rounds.toLocaleString();
}
function advanceBead() {
  state.beads++;
  navigator.vibrate?.(8);
  sound.bead();
  if (state.beads >= 108) { state.beads = 0; state.rounds++; sound.bell(); toast('염주 한 바퀴를 다 돌렸습니다', 4000); }
  drawBeads(); save();
}
{
  const ring = $('beadRing'); let start = null, acc = 0, moved = false;
  ring.addEventListener('pointerdown', (e) => { ring.setPointerCapture?.(e.pointerId); start = e.clientY + e.clientX; acc = 0; moved = false; });
  ring.addEventListener('pointermove', (e) => {
    if (start == null) return;
    const v = e.clientY + e.clientX; acc += Math.abs(v - start); start = v;
    while (acc >= 30) { acc -= 30; moved = true; advanceBead(); }
  });
  const end = () => { if (start != null && !moved) advanceBead(); start = null; };
  ring.addEventListener('pointerup', end);
  ring.addEventListener('pointercancel', () => { start = null; });
  $('beadReset').onclick = () => { state.beads = 0; drawBeads(); save(); };
}

/* 설정 */
[['volWind', 'wind'], ['volChant', 'chant'], ['volPerc', 'perc']].forEach(([id, k]) => {
  $(id).value = state.vol[k];
  $(id).oninput = () => { state.vol[k] = +$(id).value; sound.applyVolumes(); save(); };
});
const npcLabel = () => { $('npcLabel').textContent = state.npc ? `${state.npc}명` : '혼자'; };
$('npcCount').value = state.npc; npcLabel();
$('npcCount').oninput = () => { state.npc = +$('npcCount').value; npcLabel(); save(); };

/* 예불 */
let lastYebul = '', chantUntil = 0;
function yebulTick() {
  const d = new Date(), h = d.getHours(), m = d.getMinutes(), id = `${today()}-${h}`;
  if ((h === 6 || h === 18) && m < 2 && lastYebul !== id && entered) {
    lastYebul = id;
    toast(h === 6 ? '아침 예불이 시작됩니다' : '저녁 예불이 시작됩니다', 6000);
    sound.bell(); setTimeout(() => sound.bell(), 7000); setTimeout(() => sound.bell(), 14000);
    if (!sound.chantOn) { setChant(true, true); chantUntil = Date.now() + 600000; }
    npcs.forEach((n) => { if (n.cushion != null) n.nextAct = performance.now() / 1000 + rand(0, 8); });
  }
  if (chantUntil && Date.now() > chantUntil) { chantUntil = 0; setChant(false); }
}

/* ───────── 루프 ───────── */
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h;
  camera.fov = w < h ? 62 : 50;
  camera.updateProjectionMatrix();
}
addEventListener('resize', resize); resize();

const camPos = new THREE.Vector3();
function updateCamera(dt, snap) {
  if (player) camTarget.set(snap ? player.x : damp(camTarget.x, player.x, 5, dt), 0.95, snap ? player.z : damp(camTarget.z, player.z, 5, dt));
  const sinP = Math.sin(orbit.phi);
  camPos.set(
    camTarget.x + orbit.dist * sinP * Math.sin(orbit.theta),
    clamp(camTarget.y + orbit.dist * Math.cos(orbit.phi), 0.5, 6.4),
    camTarget.z + orbit.dist * sinP * Math.cos(orbit.theta)
  );
  camera.position.copy(camPos);
  camera.lookAt(camTarget.x, camTarget.y + 0.25, camTarget.z);
}

const dummy = new THREE.Object3D();
let lastTime = performance.now(), slowFor = 0, gateSpin = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.05), t = now / 1000, raw = (now - lastTime) / 1000;
  lastTime = now;
  if (raw > 0.04 && raw < 0.5) slowFor += raw; else slowFor = Math.max(0, slowFor - raw);
  if (slowFor > 4 && pixelRatio > 1) { pixelRatio = 1; renderer.setPixelRatio(1); resize(); slowFor = 0; }

  if (player) updateMonk(player, dt, t);
  npcs.forEach((n) => updateMonk(n, dt, t));
  npcTick(t);

  if (!reduceMotion) {
    lanterns.forEach((l) => { l.g.rotation.z = Math.sin(t * 0.7 + l.ph) * 0.025; l.g.rotation.x = Math.cos(t * 0.5 + l.ph) * 0.02; });
    smoke.forEach((p) => {
      p.t = (p.t + dt * 0.085) % 1;
      const k = p.t;
      p.s.position.set(Math.sin(k * 7 + p.seed) * 0.22 * k, 1.15 + k * 3.8, -4.72 + Math.cos(k * 5 + p.seed) * 0.12 * k);
      p.s.scale.setScalar(0.18 + k * 1.1);
      p.s.material.opacity = 0.34 * Math.sin(Math.PI * k);
    });
    leaves.forEach((l, i) => {
      l.y -= l.sp * dt; if (l.y < -0.85) { l.y = 13; l.spot(l); }
      dummy.position.set(l.x + Math.sin(t * l.sp + l.ph) * 1.1, l.y, l.z + Math.cos(t * 0.7 + l.ph) * 0.7);
      dummy.rotation.set(t * 1.3 + l.ph, t + l.ph, t * 0.6);
      dummy.updateMatrix(); leafMesh.setMatrixAt(i, dummy.matrix);
    });
    if (LEAVES) leafMesh.instanceMatrix.needsUpdate = true;
    candles.forEach((c, i) => { c.intensity = (11 + 8 * lanternGlow) * (0.92 + 0.08 * Math.sin(t * 9 + i * 2) * Math.sin(t * 3.1 + i)); });
    flames.forEach((f, i) => { f.scale.set(1, 2 + 0.25 * Math.sin(t * 11 + i), 1); });
  }
  if (marker.visible) { marker.scale.setScalar(1 + Math.sin(t * 5) * 0.15); }

  if (!entered) { gateSpin += dt; orbit.theta = Math.sin(gateSpin * 0.09) * 0.18; }
  updateCamera(dt);
  renderer.render(scene, camera);
}

/* ───────── 시작 ───────── */
$('nameInput').value = state.name || randomName();
$('rerollName').onclick = () => { $('nameInput').value = randomName(); };

function enter() {
  const name = $('nameInput').value.trim().slice(0, 10) || randomName();
  state.name = name; rollDay(); save();
  usedNames.add(name);
  player = makeMonk(name, true);
  player.x = 0; player.z = 8.6; player.onBowDone = onPlayerBowDone;
  $('whoName').textContent = name;
  updateHud(); drawBeads();
  sound.start();
  entered = true;
  orbit.theta = 0;
  $('hud').hidden = false; $('dock').hidden = false;
  const gate = $('gate');
  gate.classList.add('leaving'); setTimeout(() => { gate.hidden = true; }, 400);
  sound.bell(0.6);
  canvas.focus?.();
}
$('enterBtn').onclick = enter;
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('enterBtn').disabled) enter(); });

applyTime();
setInterval(applyTime, 60000);
setInterval(yebulTick, 15000);
setInterval(() => { rollDay(); communityTick(performance.now() / 1000); }, 3000);

await Promise.race([
  document.fonts.load('600 40px Pretendard', '동자승').catch(() => {}),
  new Promise((r) => setTimeout(r, 1500)),
]);
for (let i = 0; i < state.npc; i++) addNpc(true);
requestAnimationFrame(frame);
$('enterBtn').disabled = false;
$('enterBtn').textContent = '법당에 들어가기';

// 자동 점검용 진입점
window.__goyoam = { state, orbit, camera, get player() { return player; }, npcs, cushions, sound };
