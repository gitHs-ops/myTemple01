import * as THREE from './vendor/three.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.min.js';
import { Sound } from './sound.js?v=9';
import { buildGarden, pondR, POND, GARDEN_BOUNDS, GROUND_Y, CAT } from './garden.js?v=6';
import { CONSTELLATIONS, SKY_LST, starDir } from './constellations.js?v=1';
import { BULDU, buildBuldu } from './buldu.js?v=2';

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
  { name: '', day: today(), bowsToday: 0, bowsTotal: 0, beads: 0, rounds: 0, stones: 0, season: 'auto', fall: { summer: 'green', autumn: 'maple' }, vows: {}, voiceOn: true, voiceVol: 80, chantTrack: 'yeombul', ambient: 'wind', npc: 11, vol: { wind: 55, chant: 60, perc: 70 } },
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
const buddhaLight = new THREE.SpotLight(0xfff0d8, 24, 22, 0.34, 0.8, 1.3);
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
/* 은하수: 기울어진 대원을 따라 안개 같은 띠를 그리고 그 띠에 별을 더 모은다 */
const MW_N = new THREE.Vector3(0.75, 0.42, -0.5).normalize();
const MW_U = new THREE.Vector3().crossVectors(MW_N, new THREE.Vector3(0, 1, 0)).normalize();
const MW_W = new THREE.Vector3().crossVectors(MW_N, MW_U);
const MW_CENTER = new THREE.Vector3(0, 0.75, 0.66).normalize();   // 정원에서 올려다보는 쪽에 밝은 중심부
const milkyUni = { op: { value: 0 }, n: { value: MW_N }, u: { value: MW_U }, w: { value: MW_W }, l0: { value: Math.atan2(MW_CENTER.dot(MW_U), MW_CENTER.dot(MW_W)) } };
const milky = new THREE.Mesh(
  new THREE.SphereGeometry(390, 48, 32),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, transparent: true, blending: THREE.AdditiveBlending, fog: false, toneMapped: false, uniforms: milkyUni,
    vertexShader: 'varying vec3 p; void main(){ p = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: `uniform float op; uniform float l0; uniform vec3 n; uniform vec3 u; uniform vec3 w; varying vec3 p;
      float hash(vec3 q){ q = fract(q*0.3183099+0.1); q *= 17.0; return fract(q.x*q.y*q.z*(q.x+q.y+q.z)); }
      float noise(vec3 x){ vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
      float fbm(vec3 x){ float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a*noise(x); x = x*2.03+vec3(11.3); a *= 0.5; } return v; }
      void main(){
        vec3 d = normalize(p);
        float b = dot(d, n), l = atan(dot(d, u), dot(d, w));
        float dl = atan(sin(l-l0), cos(l-l0));
        float bulge = exp(-dl*dl/0.9);
        float width = 0.1 + 0.09*bulge;
        float core = exp(-b*b/(width*width)), wide = exp(-b*b/(width*width*6.0));
        float f = fbm(d*6.0+vec3(3.0)), g = fbm(d*18.0+vec3(9.0));
        float rift = smoothstep(0.44, 0.66, fbm(d*vec3(9.0,9.0,9.0)+vec3(1.7)))*exp(-b*b/(width*width*0.4));
        float a = (core*(0.3+0.9*f+0.35*g) + wide*0.2*(0.45+f))*(0.62+1.1*bulge);
        a *= 1.0 - 0.82*rift;
        a *= smoothstep(-0.02, 0.2, d.y);
        vec3 col = mix(vec3(0.55,0.67,1.0), vec3(1.0,0.86,0.68), clamp(core*bulge,0.0,1.0));
        gl_FragColor = vec4(col*(a*a*0.06 + a*0.028)*op, 1.0);
        #include <colorspace_fragment>
      }`,
  })
);
milky.renderOrder = -2; milky.visible = false; scene.add(milky);
const starUni = { op: { value: 0 }, time: { value: 0 }, ratio: { value: pixelRatio } };
const stars = (() => {
  const pos = [], size = [], tint = [], seed = [], v = new THREE.Vector3();
  const TINTS = [[1, 1, 1], [0.8, 0.88, 1], [1, 0.92, 0.78], [1, 0.8, 0.68]];
  const add = (x, y, z, sz) => {
    pos.push(x * 380, y * 380, z * 380); size.push(sz); seed.push(Math.random() * 6.28);
    tint.push(...pick(TINTS));
  };
  for (let i = 0; i < 1100; i++) {
    const a = Math.random() * Math.PI * 2, y = rand(0.04, 1), r = Math.sqrt(1 - y * y);
    const k = Math.random();
    add(Math.cos(a) * r, y, Math.sin(a) * r, k > 0.985 ? 3.4 : k > 0.88 ? 2.2 : 1.35);
  }
  for (let i = 0; i < 2400; i++) {               // 띠에 모인 작은 별
    const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
    const lat = gauss() * 0.26, lon = milkyUni.l0.value + (Math.random() < 0.45 ? gauss() * 1.4 : Math.random() * 6.28);
    v.copy(MW_U).multiplyScalar(Math.sin(lon) * Math.cos(lat)).addScaledVector(MW_W, Math.cos(lon) * Math.cos(lat)).addScaledVector(MW_N, Math.sin(lat));
    if (v.y < 0.03) continue;
    add(v.x, v.y, v.z, Math.random() > 0.95 ? 1.9 : 1.05);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  const pts = new THREE.Points(g, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, toneMapped: false, blending: THREE.AdditiveBlending, uniforms: starUni,
    vertexShader: `attribute float aSize; attribute vec3 aTint; attribute float aSeed; uniform float time; uniform float ratio; varying vec3 c; varying float a;
      void main(){ c = aTint; a = aSize > 2.0 ? 0.82 + 0.18*sin(time*1.6+aSeed) : 0.6 + 0.25*sin(time*0.9+aSeed); gl_PointSize = aSize*ratio; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float op; varying vec3 c; varying float a;
      void main(){ float r = length(gl_PointCoord-0.5)*2.0; float k = smoothstep(1.0, 0.25, r); gl_FragColor = vec4(c*k*a*op, 1.0);
        #include <colorspace_fragment>
      }`,
  }));
  pts.renderOrder = -1; pts.frustumCulled = false; pts.visible = false;
  return pts;
})();
scene.add(stars);

/* 별자리: 실제 좌표의 밝은 별과 선, 이름. 계절 저녁 하늘에 맞춰 놓는다 */
const SKY_R = 370;
const constGroup = new THREE.Group(); constGroup.visible = false; scene.add(constGroup);
let constStars = null, constShown = [], constK = 0, constSel = null;
function buildConstellations(season) {
  constGroup.clear();
  constStars?.geometry.dispose();
  constShown.forEach((c) => { c.line.geometry.dispose(); c.line.material.dispose(); c.label.material.map.dispose(); c.label.material.dispose(); });
  constShown = []; constSel = null;
  const lst = SKY_LST[season], pos = [], size = [], tint = [], seed = [];
  const TINT = [[0.92, 0.95, 1], [1, 0.74, 0.5], [0.72, 0.84, 1]];
  for (const c of CONSTELLATIONS) {
    const P = {};
    for (const [k, [ra, dec]] of Object.entries(c.stars)) P[k] = new THREE.Vector3(...starDir(ra, dec, lst)).multiplyScalar(SKY_R);
    const all = Object.values(P), mid = all.reduce((a, b) => a.add(b), new THREE.Vector3()).normalize();
    if (mid.y < 0.2) continue;                   // 이 계절에는 낮거나 지평선 아래
    const seg = [];
    for (const path of c.lines) for (let i = 0; i < path.length - 1; i++) {
      const a = P[path[i]], b = P[path[i + 1]];
      if (a.y > 8 && b.y > 8) seg.push([a, b]);
    }
    for (const [k, [, , mag, t]] of Object.entries(c.stars)) {
      if (P[k].y < 8) continue;
      pos.push(P[k].x, P[k].y, P[k].z); size.push(mag < 0.6 ? 6.4 : mag < 1.6 ? 5.2 : mag < 2.6 ? 4 : mag < 3.6 ? 3 : 2.3);
      tint.push(...TINT[t ?? 0]); seed.push(Math.random() * 6.28);
    }
    const geo = new THREE.BufferGeometry().setFromPoints(seg.flat());
    const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0xa9c3ff, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, toneMapped: false }));
    line.frustumCulled = false; line.renderOrder = -1;
    const label = constLabel(c.name);
    label.position.copy(mid).multiplyScalar(SKY_R - 4);
    constGroup.add(line, label);
    constShown.push({ c, seg, line, label });
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aSize', new THREE.Float32BufferAttribute(size, 1));
  g.setAttribute('aTint', new THREE.Float32BufferAttribute(tint, 3));
  g.setAttribute('aSeed', new THREE.Float32BufferAttribute(seed, 1));
  constStars = new THREE.Points(g, stars.material);
  constStars.renderOrder = -1; constStars.frustumCulled = false; constStars.visible = false;
  scene.add(constStars);
}
function constLabel(text) {
  const c = document.createElement('canvas'), g = c.getContext('2d'), font = '600 34px Pretendard, "Malgun Gothic", sans-serif';
  g.font = font; const w = Math.ceil(g.measureText(text).width) + 36; c.width = w; c.height = 56;
  g.font = font; g.fillStyle = 'rgba(15,23,60,.62)'; g.beginPath(); g.roundRect(0, 0, w, 56, 28); g.fill();
  g.fillStyle = '#e8efff'; g.textBaseline = 'middle'; g.textAlign = 'center'; g.fillText(text, w / 2, 30);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0, depthWrite: false, depthTest: false, fog: false, toneMapped: false }));
  sp.renderOrder = 5; sp.scale.set((w / 56) * 9.5, 9.5, 1); sp.userData.ratio = w / 56;
  return sp;
}
function updateConstellations(dt) {
  if (constStars) constStars.visible = stars.visible;
  const on = mode === 'garden' && starUni.op.value > 0.5 && (skyBack || orbit.phi > 1.62);
  constK = damp(constK, on ? 1 : 0, 3, dt);
  constGroup.visible = constK > 0.01;
  garden.setFallHidden(constK > 0.3);   // 눈앞의 눈송이와 낙엽이 별을 가리지 않게
  if (!constGroup.visible) return;
  for (const s of constShown) {
    const sel = s === constSel;
    s.line.material.opacity = (sel ? 0.95 : 0.5) * constK;
    s.line.material.color.set(sel ? 0xffd98a : 0xa9c3ff);
    s.label.material.opacity = constK;
  }
}
// 누른 곳에서 가까운 별자리 이름이나 선을 찾는다 (화면 픽셀 기준)
function pickConstellation(cx, cy) {
  const r = canvas.getBoundingClientRect(), a = new THREE.Vector3(), b = new THREE.Vector3();
  const toPx = (v) => { v.project(camera); return v.z < 1 ? [(v.x + 1) / 2 * r.width + r.left, (1 - v.y) / 2 * r.height + r.top] : null; };
  let best = null, bestD = 34;
  for (const s of constShown) {
    const l = toPx(a.copy(s.label.position));
    if (l) {
      const halfH = 16, halfW = halfH * s.label.userData.ratio;
      const d = Math.hypot(Math.max(0, Math.abs(cx - l[0]) - halfW), Math.max(0, Math.abs(cy - l[1]) - halfH));
      if (d < bestD) { bestD = d; best = s; }
    }
    for (const [p, q] of s.seg) {
      const A = toPx(a.copy(p)), B = toPx(b.copy(q));
      if (!A || !B) continue;
      const dx = B[0] - A[0], dy = B[1] - A[1], t = clamp(((cx - A[0]) * dx + (cy - A[1]) * dy) / (dx * dx + dy * dy || 1), 0, 1);
      const d = Math.hypot(cx - (A[0] + dx * t), cy - (A[1] + dy * t));
      if (d < bestD) { bestD = d; best = s; }
    }
  }
  return best;
}
function showConstellation(s) {
  constSel = s;
  const c = s.c;
  $('constTitle').textContent = c.name;
  $('constLatin').textContent = `${c.latin} · ${c.when}`;
  $('constStar').textContent = c.star;
  $('constFind').textContent = c.find;
  $('constStory').textContent = c.story;
  openModal('constModal');
}

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
let lanternGlow = 0, gardenSky = null, skyHour = null, realHour = 12;
const lanternMats = [];
const cA = new THREE.Color(), cB = new THREE.Color();
const mixHex = (a, b, t, out) => out.copy(cA.set(a)).lerp(cB.set(b), t);
function applyTime() {
  const d = new Date();
  const forced = parseFloat(params.get('hour'));
  const clock = Number.isFinite(forced) ? forced : d.getHours() + d.getMinutes() / 60;
  realHour = clock;
  const h = skyHour ?? clock;
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
  const nightOp = lanternGlow > 0.7 ? (lanternGlow - 0.7) / 0.3 : 0;
  starUni.op.value = milkyUni.op.value = nightOp;
  stars.visible = milky.visible = nightOp > 0;
  lanternMats.forEach((m) => { m.emissiveIntensity = 0.28 + lanternGlow * 0.95; });
  gardenSky?.(skyUniforms.bottom.value, lanternGlow);
}

/* ───────── 산·숲·마당 ───────── */
const forest = { leaf: null, items: [] };
const ground = mesh(new THREE.CircleGeometry(420, 48), new THREE.MeshLambertMaterial({ color: 0x6f8f5d }), 0, -0.9, 0, scene);
ground.rotation.x = -Math.PI / 2;

const mountainMats = [];
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
  const mat = new THREE.MeshLambertMaterial({ color, side: THREE.DoubleSide }); mountainMats.push(mat);
  scene.add(new THREE.Mesh(g, mat));
}
mountainRing(78, 10, 18, 0x5d7f58, 1.2);
mountainRing(112, 22, 26, 0x6c8a75, 4.1);
mountainRing(150, 38, 34, 0x8aa49a, 7.7);

{
  const COUNT = 170, trunk = new THREE.CylinderGeometry(0.16, 0.28, 2.2, 6), leaf = new THREE.ConeGeometry(1.6, 3, 7);
  const tr = new THREE.InstancedMesh(trunk, new THREE.MeshLambertMaterial({ color: 0x5b4634 }), COUNT);
  const lf = new THREE.InstancedMesh(leaf, new THREE.MeshLambertMaterial({ color: 0xffffff }), COUNT * 3);
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), p = new THREE.Vector3(), s = new THREE.Vector3(), col = new THREE.Color();
  const GREENS = ['#3f6b45', '#4d7a4c', '#356040', '#5c8551'];
  for (let i = 0; i < COUNT; i++) {
    let x, z;
    do { const a = Math.random() * Math.PI * 2, r = rand(15, 76); x = Math.sin(a) * r; z = Math.cos(a) * r; }
    while ((Math.abs(x) < 14 && z > -14 && z < 13) || (Math.abs(x) < 25 && z > 12 && z < 51) || Math.hypot(x + 6, z - 58) < 13);   // 청동 불두 자리는 비운다
    const sc = rand(1, 2.2);
    p.set(x, -0.9 + 1.1 * sc, z); s.set(sc, sc, sc); m.compose(p, q, s); tr.setMatrixAt(i, m);
    const broad = Math.random() < 0.34, c = pick(GREENS), shade = rand(0, 1);
    for (let t = 0; t < 3; t++) {
      const k = 1 - t * 0.24;
      p.set(x, -0.9 + (2.5 + t * 1.45) * sc, z); s.set(sc * k, sc, sc * k); m.compose(p, q, s);
      const jitter = rand(-0.03, 0.03);
      forest.items.push({ broad, base: c, shade, jitter });
      lf.setMatrixAt(i * 3 + t, m); lf.setColorAt(i * 3 + t, col.set(c).offsetHSL(0, 0, jitter));
    }
  }
  scene.add(tr, lf); forest.leaf = lf;
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
box(3.2, 0.03, 26, std(0xc4bdb0), 0, -0.88, 26, hall);
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
const procBuddha = new THREE.Group(); procBuddha.position.set(0, 1.17, -6.7); scene.add(procBuddha);
let halo = null;
{
  const b = procBuddha;
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
  halo = mesh(new THREE.PlaneGeometry(3.2, 3.2), new THREE.MeshBasicMaterial({ map: haloTex, transparent: true, depthWrite: false, toneMapped: false }), 0, hy + 0.05, -0.9, b);
  halo.renderOrder = -1;
}
// 실물 스캔 불상. 받지 못하면 위의 조립형 불상을 그대로 둔다.
const BUDDHA = { height: 4.35, yaw: 0 };
let scanBuddha = null;
function makeTempleEnv() {
  const env = new THREE.Scene();
  const tex = canvasTex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#fff3d6'); gr.addColorStop(0.42, '#c98c4a'); gr.addColorStop(0.62, '#6d3322'); gr.addColorStop(1, '#2c170e');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#fff6df';
    for (let i = 0; i < 7; i++) g.fillRect(i * 38 + 6, 24, 18, 10);
    g.fillStyle = '#ffd9a0'; g.fillRect(w * 0.42, 46, w * 0.16, 16);
  });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  env.background = tex;
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.03);
  pm.dispose(); tex.dispose();
  return rt.texture;
}
new GLTFLoader().load('models/buddha.glb', (gltf) => {
  const model = gltf.scene, envMap = makeTempleEnv();
  model.rotation.y = BUDDHA.yaw;
  model.updateMatrixWorld(true);
  const bb = new THREE.Box3().setFromObject(model), size = bb.getSize(new THREE.Vector3()), c = bb.getCenter(new THREE.Vector3());
  const k = BUDDHA.height / size.y;
  const holder = new THREE.Group();
  holder.scale.setScalar(k);
  holder.position.set(0, 1.17, -6.7);
  model.position.set(-c.x, -bb.min.y, -c.z);
  holder.add(model); scene.add(holder);
  model.traverse((o) => {
    if (!o.isMesh) return;
    o.material.envMap = envMap; o.material.envMapIntensity = 0.95;
    
  });
  const keep = halo; procBuddha.remove(keep);
  procBuddha.visible = false;
  keep.position.set(0, 1.17 + BUDDHA.height * 0.78, -7.75); keep.scale.setScalar(1.25);
  scene.add(keep);
  scanBuddha = { holder, size: size.toArray(), k };
}, undefined, () => { /* 조립형 불상 유지 */ });
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
    do { l.x = rand(-24, 24); l.z = rand(-14, 46); } while (Math.abs(l.x) < 12 && l.z < 10.5);
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
    cushions.push({ x, z, by: null, mesh: m, zone: 'temple', yaw: Math.PI, h: 0.14 });
  }
}

/* ───────── 정원 ───────── */
const garden = buildGarden({ scene, mesh, std, canvasTex, seatGroup: cushionGroup, still: reduceMotion });
garden.seats.forEach((q) => {
  q.mesh.userData.cushion = cushions.length;
  cushions.push(q);
});
garden.setStones(state.stones);
let mode = 'temple';

/* ───────── 고양이 ───────── */
// 실제 고양이 3D 스캔. 몸통의 높은 부분만 위아래로 움직여 숨 쉬게 한다
const catBreath = { value: 0 };
let catModel = null;
new GLTFLoader().load('models/cat.glb', (gltf) => {
  const cat = gltf.scene;
  cat.position.set(CAT.x, GROUND_Y + 0.016, CAT.z); cat.rotation.y = CAT.yaw; cat.scale.setScalar(CAT.len);
  cat.traverse((m) => {
    if (!m.isMesh) return;
    m.material.color.setScalar(0.92);
    m.material.onBeforeCompile = (shader) => {
      shader.uniforms.uBreath = catBreath;
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', '#include <common>\nuniform float uBreath;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\ntransformed.y += uBreath * smoothstep(0.035, 0.11, position.y);');
    };
  });
  scene.add(cat); catModel = cat;
  const shadowTex = canvasTex(128, 128, (g, w) => {
    const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
    r.addColorStop(0, 'rgba(0,0,0,.5)'); r.addColorStop(0.55, 'rgba(0,0,0,.3)'); r.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = r; g.fillRect(0, 0, w, w);
  });
  const blob = mesh(new THREE.PlaneGeometry(0.72 * CAT.len, 1.14 * CAT.len), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, toneMapped: false }), CAT.x, GROUND_Y + 0.026, CAT.z, scene);
  blob.rotation.set(-Math.PI / 2, 0, CAT.yaw);
}, undefined, () => { /* 고양이 없이 진행 */ });

/* ───────── 계절 ───────── */
const SEASONS = {
  spring: { name: '봄', desc: '벚꽃잎이 흩날리고 땅과 물에 쌓입니다', ground: '#7fa565', hills: ['#6f9a63', '#7fa183', '#9db6a6'], broad: ['#a9c96c', '#bcd67c', '#8fbf66', '#f0c3d0'], fall: ['#fbd5df', '#f7bccd'], fallN: 46, snow: 0 },
  summer: { name: '여름', desc: '짙은 녹음과 연꽃, 밤에는 반딧불이', ground: '#5f8a4d', hills: ['#4a7a4c', '#5c8768', '#7f9f8e'], broad: ['#4f8f4a', '#5d9c50', '#457f45', '#69a557'], fall: ['#5d9c50', '#76ab58'], fallN: 8, snow: 0 },
  autumn: { name: '가을', desc: '단풍이 들고 낙엽이 떨어집니다', ground: '#8b8f55', hills: ['#9a7a45', '#97825f', '#a2a08c'], broad: ['#c96f3a', '#b98a3a', '#d9552e', '#e0a33a'], fall: ['#d9852f', '#c95b2b', '#e4b23a', '#b9772b'], fallN: 46, snow: 0 },
  winter: { name: '겨울', desc: '눈이 내리고 연못이 얼어붙습니다', ground: '#dfe8ee', hills: ['#c3d0d6', '#d3dee3', '#e4ecf0'], broad: ['#cdd6dc', '#d8e0e5'], fall: ['#ffffff'], fallN: 46, snow: 0.62 },
};
const autoSeason = () => {
  const m = new Date().getMonth() + 1;
  return m >= 3 && m <= 5 ? 'spring' : m >= 6 && m <= 8 ? 'summer' : m >= 9 && m <= 11 ? 'autumn' : 'winter';
};
function currentSeason() {
  const forced = params.get('season');
  if (SEASONS[forced]) return forced;
  return SEASONS[state.season] ? state.season : autoSeason();
}
let seasonNow = null;
function applySeason() {
  const k = currentSeason();
  if (k === seasonNow) return;
  seasonNow = k;
  const c = SEASONS[k], col = new THREE.Color(), white = new THREE.Color(0xeef3f6);
  ground.material.color.set(c.ground);
  mountainMats.forEach((m, i) => m.color.set(c.hills[i]));
  forest.items.forEach((it, i) => {
    if (it.broad) col.set(c.broad[Math.floor(it.shade * c.broad.length)]);
    else col.set(it.base);
    col.offsetHSL(0, 0, it.jitter).lerp(white, c.snow);
    forest.leaf.setColorAt(i, col);
  });
  forest.leaf.instanceColor.needsUpdate = true;
  for (let i = 0; i < LEAVES; i++) leafMesh.setColorAt(i, col.set(c.fall[i % c.fall.length]));
  if (LEAVES) leafMesh.instanceColor.needsUpdate = true;
  leafMesh.count = Math.min(LEAVES, c.fallN);
  garden.setSeason(k);
  buildConstellations(k);
  const label = document.getElementById('seasonLabel');
  if (label) label.textContent = c.name;
}

/* ───────── 동자승 ───────── */
const G = {
  head: new THREE.SphereGeometry(0.43, 24, 18), robe: new THREE.LatheGeometry(
    [[0, 0.12], [0.44, 0.12], [0.46, 0.2], [0.38, 0.5], [0.27, 0.74], [0.16, 0.84], [0, 0.86]].map(([r, h]) => new THREE.Vector2(r, h)), 20),
  arm: new THREE.CapsuleGeometry(0.075, 0.14, 4, 8), fore: new THREE.CapsuleGeometry(0.07, 0.18, 4, 8), hand: new THREE.SphereGeometry(0.075, 12, 10),
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
/* 합장 자세: 팔꿈치를 90도로 굽혀 가슴 앞에서 손을 모은다 */
const ARM_UP = 0.24, ARM_FORE = 0.3;
const HAP_POSE = (() => {
  const down = new THREE.Vector3(0, -1, 0), out = {};
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12, 0, 0));
  for (const s of [-1, 1]) {
    const S = new THREE.Vector3(s * 0.25, 0.74, 0.02), E = new THREE.Vector3(s * 0.36, 0.4, 0.22), H = new THREE.Vector3(s * 0.058, 0.54, 0.58);
    const u = E.clone().sub(S), f = H.clone().sub(E);
    const qU = new THREE.Quaternion().setFromUnitVectors(down, u.clone().normalize());
    const qF = new THREE.Quaternion().setFromUnitVectors(down, f.clone().normalize());
    out[s] = {
      upper: qU, elbow: qU.clone().invert().multiply(qF), wrist: qF.clone().invert().multiply(tilt),
      lenU: u.length() / ARM_UP, lenF: f.length() / ARM_FORE,
    };
  }
  return out;
})();
const qRest = new THREE.Quaternion(), qOne = new THREE.Quaternion(), eulerArm = new THREE.Euler();
function makeMonk(name, mine = false) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  const blob = mesh(G.blob, M.blob, 0, 0.012, 0, root); blob.rotation.x = -Math.PI / 2;
  const robeMat = mine ? M.robes[0] : pick(M.robes);
  const robe = mesh(G.robe, robeMat, 0, 0, 0, body);
  const upper = new THREE.Group(); body.add(upper);
  const sash = mesh(G.sash, M.sash, 0, 0.52, 0, upper); sash.rotation.x = Math.PI / 2 - 0.16; sash.rotation.y = 0.5; sash.scale.set(1.02, 1, 0.5);
  const head = new THREE.Group(); head.position.y = 1.15; upper.add(head);
  mesh(G.head, M.skin, 0, 0, 0, head);
  const crown = mesh(new THREE.SphereGeometry(0.436, 24, 12, 0, Math.PI * 2, 0, 1.05), M.crown, 0, 0.01, -0.012, head); crown.rotation.x = -0.28;
  [-1, 1].forEach((s) => {
    mesh(G.ear, M.skin, s * 0.42, -0.03, 0, head);
    const e = mesh(G.eye, M.eye, s * 0.15, -0.03, 0.39, head); e.scale.set(1, 1.2, 0.5);
    const ch = mesh(G.cheek, M.cheek, s * 0.25, -0.13, 0.345, head); ch.rotation.y = s * 0.62;
  });
  const m = mesh(G.mouth, M.mouth, 0, -0.14, 0.405, head); m.rotation.z = Math.PI + 0.25;
  const arms = [-1, 1].map((s) => {
    const a = new THREE.Group(); a.position.set(s * 0.25, 0.74, 0.02); upper.add(a);
    const up = mesh(G.arm, robeMat, 0, -ARM_UP / 2, 0, a);
    const e = new THREE.Group(); e.position.y = -ARM_UP; a.add(e);
    const fore = mesh(G.fore, robeMat, 0, -ARM_FORE / 2, 0, e);
    const w = new THREE.Group(); w.position.y = -ARM_FORE; e.add(w);
    const hand = mesh(G.hand, M.skin, 0, 0, 0, w);
    return { a, s, up, e, fore, w, hand, pose: HAP_POSE[s] };
  });
  const feet = [-1, 1].map((s) => { const f = mesh(G.foot, M.foot, s * 0.17, 0.08, 0.1, root); f.scale.set(1, 0.7, 1.4); return { f, s }; });
  const label = nameSprite(name, mine); root.add(label);
  scene.add(root);
  return {
    name, root, body, robe, upper, head, arms, feet, mine, label,
    x: 0, z: 0, yaw: Math.PI, yawTo: Math.PI, target: null, cushion: null, leaving: false,
    sit: 0, sitTo: 0, hap: 0, hapTo: 0, hapUntil: 0, bowT: null, phase: Math.random() * 6, walk: 0, stuck: 0, pop: 1, onArrive: null,
  };
}
const BOW_TIME = 6.4;
const OBSTACLES = [[-4.5, 7.4, 0.8], [4.5, 7.4, 0.8], ...garden.colliders];
const POND_MARGIN = 0.55;
function pushOut(c, dx, dz, sp) {
  const slide = (ax, az, al, R) => {
    if (al >= R || al < 0.0001) return null;
    const tx = -az / al, tz = ax / al, sgn = tx * dx + tz * dz >= 0 ? 1 : -1;
    return [(ax / al) * R + tx * sgn * sp, (az / al) * R + tz * sgn * sp];
  };
  for (const [px, pz, R] of OBSTACLES) {
    const ax = c.x - px, az = c.z - pz, m = slide(ax, az, Math.hypot(ax, az), R);
    if (m) { c.x = px + m[0]; c.z = pz + m[1]; }
  }
  if (c.z > 15) {
    const ax = c.x - POND.x, az = c.z - POND.z, R = pondR(Math.atan2(ax, az)) + POND_MARGIN;
    const m = slide(ax, az, Math.hypot(ax, az), R);
    if (m) { c.x = POND.x + m[0]; c.z = POND.z + m[1]; }
  }
}
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
/* 먹이 주기: 왼손에 그릇을 받치고, 오른손으로 집어 세 번 흩뿌린다 */
const FEED_TIME = 3.9, FEED_TOSSES = 3, FEED_RELEASE = 0.58;
const FEED_BOWL = [-0.45, -0.28, -1.15];   // 위팔 앞뒤, 위팔 안팎, 팔꿈치
const FEED_KEYS = [[0, -0.55, -0.5, -1.45], [0.25, -0.55, -0.5, -1.45], [0.45, -1.15, 0.05, -1.8], [0.62, -1.5, 0.1, -0.25], [0.8, -1.2, 0.05, -0.4], [1, -0.55, -0.5, -1.45]];
const feedOut = [0, 0, 0], qFeed = new THREE.Quaternion(), handPos = new THREE.Vector3();
function feedArm(p) {
  let i = 0;
  while (i < FEED_KEYS.length - 2 && p > FEED_KEYS[i + 1][0]) i++;
  const A = FEED_KEYS[i], B = FEED_KEYS[i + 1], k = smooth(A[0], B[0], p);
  for (let j = 0; j < 3; j++) feedOut[j] = A[j + 1] + (B[j + 1] - A[j + 1]) * k;
  return feedOut;
}
function makeBowl(c) {
  const g = new THREE.Group();
  const wood = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 8, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x5f3b22, roughness: 0.55, side: THREE.DoubleSide }));
  const food = new THREE.Mesh(new THREE.CircleGeometry(0.11, 14), new THREE.MeshLambertMaterial({ color: 0xe6b56c }));
  food.rotation.x = -Math.PI / 2; food.position.y = -0.025;
  g.add(wood, food);
  g.position.z = 0.1; g.rotation.x = 1.6;   // 그릇이 수평이 되도록 팔꿈치 각도만큼 되돌린다
  c.arms.find((x) => x.s > 0).w.add(g);
  return g;
}
function updateMonk(c, dt, t) {
  let moving = 0;
  if (c.target) {
    const dx = c.target.x - c.x, dz = c.target.z - c.z, d = Math.hypot(dx, dz);
    if (d < 0.08) {
      if (c.target.cush != null) { c.cushion = c.target.cush; c.sitTo = 1; c.yawTo = cushions[c.cushion].yaw; }
      const done = c.onArrive; c.target = null; c.onArrive = null;
      if (c.mine) marker.visible = false;
      done?.();
    } else {
      const sp = (c.mine ? 3 : 2.1) * dt, ox = c.x, oz = c.z;
      c.x += (dx / d) * Math.min(sp, d); c.z += (dz / d) * Math.min(sp, d);
      pushOut(c, dx, dz, sp);
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

  let kneel = 0, down = 0, rise = 0, spread = 0;
  if (c.bowT != null) {
    c.bowT += dt / BOW_TIME;
    const b = c.bowT;
    // 일어나 → 양팔을 벌리며 앉고 → 이마를 숙였다가 → 일으켜 앉고 → 팔을 내리며 일어난다
    rise = smooth(0, 0.14, b) * (1 - smooth(0.24, 0.38, b));
    kneel = smooth(0.24, 0.38, b) * (1 - smooth(0.86, 1, b));
    down = smooth(0.38, 0.54, b) * (1 - smooth(0.68, 0.84, b));
    spread = smooth(0.1, 0.28, b) * (1 - smooth(0.84, 0.98, b));
    c.hapTo = 0; c.hapUntil = 0;
    if (!c.bowHit && b > 0.54) { c.bowHit = true; if (c.mine) sound.moktak(0.75); }
    if (b >= 1) { c.bowT = null; c.hapTo = 0; c.onBowDone?.(); }
  }
  c.hap = damp(c.hap, c.hapTo, 8, dt);

  let feedK = 0, feedP = 0;
  if (c.feedT != null) {
    if (c.target || moving || c.bowT != null || c.hapTo === 1 || c.sitTo === 1) c.feedT = null;
    else {
      c.feedT += dt / FEED_TIME;
      const b = Math.min(c.feedT, 1), step = Math.min(FEED_TOSSES - 1, Math.floor(b * FEED_TOSSES));
      feedK = smooth(0, 0.08, b) * (1 - smooth(0.93, 1, b));
      feedP = b * FEED_TOSSES - step;
      if (feedP > FEED_RELEASE && c.feedFired <= step) {
        c.feedFired = step + 1;
        c.arms.find((x) => x.s < 0).w.getWorldPosition(handPos);
        c.onToss?.(handPos, step);
      }
      if (c.feedT >= 1) c.feedT = null;
    }
  }
  if (feedK > 0.02 && !c.bowl) c.bowl = makeBowl(c);
  if (c.bowl) { c.bowl.visible = feedK > 0.02; c.bowl.scale.setScalar(Math.max(feedK, 0.01)); }
  const feedLean = feedK * (0.05 + 0.13 * smooth(0.42, 0.62, feedP) * (1 - smooth(0.7, 1, feedP)));

  const low = Math.max(c.sit * (1 - rise), kneel);
  const hop = Math.abs(Math.sin(c.phase)) * 0.05 * c.walk;
  const cushionY = c.cushion != null ? cushions[c.cushion].h * c.sit : 0;
  c.root.position.set(c.x, heightAt(c.z) + hop + cushionY, c.z);
  c.root.rotation.y = c.yaw;
  c.root.scale.setScalar(c.pop);
  if (!c.mine) {
    const d = camera.position.distanceTo(c.root.position);
    c.label.material.opacity = smooth(3, 4.5, d) * (1 - smooth(8, 11, d));
    c.label.visible = c.label.material.opacity > 0.01;
  }
  // 서면 옷자락이 길어져 키가 커지고, 앉으면 낮게 접힌다
  const tall = 1.55 + (0.72 - 1.55) * low, lift = 0.74 * (tall - 1);
  c.robe.scale.y = tall; c.robe.position.y = 0.12 * (1 - tall);
  c.upper.position.y = lift;
  c.body.position.y = -0.2 * low + 0.22 * down + Math.sin(t * 1.4 + c.phase) * 0.006;
  c.label.position.y = c.body.position.y + 1.87 + lift;
  if (c.mine) c.label.visible = !skyBack;
  c.body.scale.set(1 + 0.1 * low, 1 - 0.05 * low, 1 + 0.1 * low);
  c.body.rotation.x = 1.32 * down + feedLean;
  c.body.rotation.z = Math.sin(c.phase) * 0.05 * c.walk;
  c.head.rotation.x = -0.28 * down + 0.08 * c.hap * (1 - down) + 0.16 * feedK;
  const hapK = c.hap * (1 - down);
  for (const { a, s, up, e, fore, w, hand, pose } of c.arms) {
    const swing = Math.sin(c.phase + (s > 0 ? 0 : Math.PI)) * 0.55 * c.walk;
    const lap = c.sit * (1 - c.hap) * (1 - rise) * (1 - spread);
    eulerArm.set(swing * (1 - c.hap) - 0.72 * lap - 3.02 * down, 0, s * (0.2 * (1 - c.hap) * (1 - lap) - 0.5 * lap + 0.8 * down + 1.2 * spread * (1 - down)));
    qRest.setFromEuler(eulerArm);
    a.quaternion.slerpQuaternions(qRest, pose.upper, hapK);
    e.quaternion.slerpQuaternions(qOne, pose.elbow, hapK);
    w.quaternion.slerpQuaternions(qOne, pose.wrist, hapK);
    if (feedK > 0) {
      const [au, az, el] = s > 0 ? FEED_BOWL : feedArm(feedP);
      eulerArm.set(au, 0, s * az);
      a.quaternion.slerp(qFeed.setFromEuler(eulerArm), feedK);
      eulerArm.set(el, 0, 0);
      e.quaternion.slerp(qFeed.setFromEuler(eulerArm), feedK);
    }
    // 합장과 절의 숙임에서는 팔이 앞으로, 앉을 때는 양옆으로 길게 뻗는다
    const reach = 1.1 * down + 0.5 * spread * (1 - down);
    const lenU = 1 + (pose.lenU - 1) * hapK + reach, lenF = 1 + (pose.lenF - 1) * hapK + reach;
    up.scale.y = lenU; up.position.y = -ARM_UP / 2 * lenU;
    e.position.y = -ARM_UP * lenU;
    fore.scale.y = lenF; fore.position.y = -ARM_FORE / 2 * lenF;
    w.position.y = -ARM_FORE * lenF;
    hand.scale.set(1 - 0.22 * hapK, 1 + 1.5 * hapK, 1 + 0.35 * hapK);
    hand.position.y = 0.09 * hapK;
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

const freeCushions = (zone = mode) => cushions.map((c, i) => ({ c, i })).filter(({ c }) => !c.by && c.zone === zone);
const usedNames = new Set();
const uniqueName = () => { for (let i = 0; i < 40; i++) { const n = randomName(); if (!usedNames.has(n)) { usedNames.add(n); return n; } } return randomName(); };

function addNpc(seated) {
  const free = freeCushions('temple'); if (!free.length) return;
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

/* 정원을 거니는 동자승 */
const strollers = [];
const WAY = [[0, 18], [2.8, 26], [1.5, 37], [-3, 43], [-11, 41.5], [9, 37], [8.5, 28], [7, 15.6], [-9, 19], [-14, 21], [-1, 30]];
function strollerTick(t) {
  const want = state.npc ? 3 : 0;
  while (strollers.length < want) {
    const w = pick(WAY), n = makeMonk(uniqueName());
    n.x = w[0]; n.z = w[1]; n.nextAct = t + rand(1, 12); n.yaw = n.yawTo = rand(-3, 3);
    strollers.push(n);
  }
  while (strollers.length > want) {
    const n = strollers.pop();
    usedNames.delete(n.name);
    n.root.traverse((o) => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } });
    scene.remove(n.root);
  }
  for (const n of strollers) {
    if (n.target || t < n.nextAct) continue;
    if (Math.random() < 0.25) { n.hapTo = 1; n.hapUntil = t + rand(4, 8); n.nextAct = t + rand(8, 16); continue; }
    const w = pick(WAY);
    n.nextAct = t + 30;
    setTarget(n, w[0] + rand(-0.8, 0.8), w[1] + rand(-0.8, 0.8), null, () => { n.nextAct = performance.now() / 1000 + rand(6, 22); });
  }
}

/* ───────── 입력 ───────── */
const orbit = { theta: 0, phi: 1.22, dist: 8.2 };
const SKY_PHI = 2.15;
let skyGoal = null, skyBack = null, skyEl = 0.8, skyLookK = 0;   // 하늘 보기에서는 고개 각도(skyEl)로 둘러본다
const camTarget = new THREE.Vector3(0, 1.15, 7);
const pointers = new Map();
let tap = null, pinch = 0;
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitV = new THREE.Vector3();
let entered = false;
const modalOpen = () => !$('beadsModal').hidden || !$('settingsModal').hidden || !$('chantModal').hidden || !$('seasonModal').hidden || !$('vowModal').hidden || !$('constModal').hidden || !$('stoneModal').hidden;

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
    orbit.theta -= dx * 0.006; poseOff = true; atBuldu = false;
    if (skyBack) skyEl = clamp(skyEl - dy * 0.004, 0.08, 1.52);
    else {
      skyGoal = null;
      orbit.phi = clamp(orbit.phi - dy * 0.005, 0.42, mode === 'garden' ? SKY_PHI : 1.5);
    }
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
  if (mode === 'garden' && constK > 0.5) {
    const s = pickConstellation(cx, cy);
    if (s) { showConstellation(s); return; }
    if (skyBack) { toast('별자리 선이나 이름을 눌러 보세요', 2500); return; }
  }
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (mode === 'garden' && !skyBack && raycaster.intersectObject(bulduHead, true).length) { goToBuldu(); return; }
  const hit = raycaster.intersectObjects(cushionGroup.children, false).find((h) => cushions[h.object.userData.cushion].zone === mode);
  if (hit) { goToCushion(hit.object.userData.cushion); return; }
  floorPlane.constant = mode === 'garden' ? -GROUND_Y : 0;
  if (raycaster.ray.intersectPlane(floorPlane, hitV)) walkTo(hitV.x, hitV.z);
}
const ZONES = {
  temple: { xMin: -8.4, xMax: 8.4, zMin: -3.9, zMax: 11 },
  garden: GARDEN_BOUNDS,
};
function clampToZone(x, z) {
  const b = ZONES[mode];
  x = clamp(x, b.xMin, b.xMax); z = clamp(z, b.zMin, b.zMax);
  if (mode === 'garden') {
    const ax = x - POND.x, az = z - POND.z, a = Math.atan2(ax, az), R = pondR(a) + POND_MARGIN + 0.05;
    if (Math.hypot(ax, az) < R) { x = POND.x + Math.sin(a) * R; z = POND.z + Math.cos(a) * R; }
  }
  return [x, z];
}
function walkTo(x, z) {
  stopAuto();
  [x, z] = clampToZone(x, z);
  setTarget(player, x, z);
  marker.position.set(x, heightAt(z) + 0.03, z); marker.visible = true; marker.scale.setScalar(1);
  updateSitBtn();
}
function goToBuldu() {
  if (skyBack) $('skyBtn').click();
  stopAuto();
  poseOff = true;
  freeCushion(player); player.cushion = null;
  const { x, z } = BULDU.stand;
  setTarget(player, x, z, null, () => {
    player.yawTo = Math.atan2(BULDU.x - x, BULDU.z - z);
    bulduBack = { phi: orbit.phi, dist: orbit.dist };
    skyGoal = { phi: 1.42, dist: 18, theta: BULDU.viewTheta };
    atBuldu = true;
    updateSitBtn();
    toast('청동 불두 앞에 왔습니다. 합장해 보세요', 4000);
  });
  marker.position.set(x, heightAt(z) + 0.03, z); marker.visible = true; marker.scale.setScalar(1);
  updateSitBtn();
  toast('청동 불두를 찾아갑니다');
}
function goToCushion(i) {
  const c = cushions[i];
  if (c.zone !== mode) return;
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
  const zb = ZONES[mode];
  c.x = clamp(c.x + keyVec.x * 3 * dt, zb.xMin, zb.xMax);
  c.z = clamp(c.z + keyVec.y * 3 * dt, zb.zMin, zb.zMax);
  pushOut(c, keyVec.x, keyVec.y, 0);
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
let vowGoal = null, pendingVow = null, wakeLock = null;
const VOWS = [{ goal: 108, name: '108배' }, { goal: 1000, name: '천배' }, { goal: 10000, name: '만배' }];
const vowName = (g) => VOWS.find((v) => v.goal === g)?.name ?? `${g}배`;

/* 횟수 읽기: 숫자를 한글로 풀어 어느 음성이든 "백팔 배"로 읽게 한다 */
function korNum(n) {
  if (!n) return '영';
  const D = ['', '일', '이', '삼', '사', '오', '육', '칠', '팔', '구'];
  const under = (x) => {
    let out = '';
    [[1000, '천'], [100, '백'], [10, '십']].forEach(([u, w]) => {
      const d = Math.floor(x / u) % 10;
      if (d) out += (d === 1 ? '' : D[d]) + w;
    });
    return out + D[x % 10];
  };
  const man = Math.floor(n / 10000), rest = n % 10000;
  return (man ? (man === 1 ? '' : under(man)) + '만' : '') + under(rest);
}
const koVoice = () => window.speechSynthesis?.getVoices().find((v) => v.lang?.toLowerCase().startsWith('ko')) ?? null;
function speak(text) {
  const ss = window.speechSynthesis;
  if (!ss || !state.voiceOn || !window.SpeechSynthesisUtterance) return;
  ss.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ko-KR'; u.rate = 0.95; u.volume = state.voiceVol / 100;
  const v = koVoice(); if (v) u.voice = v;
  ss.speak(u);
}
async function holdScreen(on) {
  try {
    if (on && !wakeLock && navigator.wakeLock) {
      wakeLock = await navigator.wakeLock.request('screen');
      wakeLock.addEventListener?.('release', () => { wakeLock = null; });
    } else if (!on && wakeLock) { const w = wakeLock; wakeLock = null; await w.release(); }
  } catch { /* 지원하지 않거나 거절됨 */ }
}
document.addEventListener('visibilitychange', () => { if (autoBow && !document.hidden) holdScreen(true); });
function toast(msg, ms = 2800) {
  const el = $('toast'); el.textContent = msg; el.hidden = true; void el.offsetWidth; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}
function updateHud() {
  const inGarden = mode === 'garden';
  $('countLabel').textContent = inGarden ? '쌓은 돌' : vowGoal ? vowName(vowGoal) : '오늘 절';
  $('countOf').hidden = inGarden; $('bowBarWrap').hidden = inGarden;
  $('stoneReset').hidden = !inGarden || !state.stones;
  $('countOf').textContent = `/ ${(vowGoal ?? 108).toLocaleString()}`;
  $('bowToday').textContent = inGarden ? state.stones : vowGoal ? (state.vows[vowGoal] || 0).toLocaleString() : state.bowsToday;
  const barPct = vowGoal ? ((state.vows[vowGoal] || 0) / vowGoal) * 100 : ((state.bowsToday % 108 || (state.bowsToday ? 108 : 0)) / 108) * 100;
  $('bowBar').style.width = `${Math.min(100, barPct)}%`;
  $('statTotal').textContent = state.bowsTotal.toLocaleString();
  $('statRounds').textContent = state.rounds.toLocaleString();
}
function updateSitBtn() {
  const seated = player && (player.cushion != null || player.target?.cush != null);
  $('btnSitLabel').textContent = seated ? '일어서기' : '앉기';
}
function doHap() {
  if (player.target || player.bowT != null) return;
  if (mode === 'temple') player.yawTo = Math.PI;
  if (player.hapTo) { player.hapTo = 0; player.hapUntil = 0; return; }
  player.hapTo = 1; player.hapUntil = performance.now() / 1000 + 8; poseOff = false;
  sound.moktak(0.35);
}
function doBow() {
  if (mode !== 'temple') return;
  rollDay();
  if (!vowGoal) pendingVow = null;
  poseOff = false;
  if (player.target) { freeCushion(player); player.target = null; marker.visible = false; updateSitBtn(); }
  startBow(player);
}
function setAutoUi() {
  $('btnAuto').setAttribute('aria-pressed', String(autoBow));
  $('autoLabel').textContent = autoBow ? '멈추기' : '연속 절';
}
function stopAuto() {
  if (!autoBow) return;
  const g = vowGoal;
  autoBow = false; vowGoal = null; setAutoUi(); holdScreen(false); updateHud();
  if (g) toast(`${vowName(g)} ${(state.vows[g] || 0).toLocaleString()}배에서 멈췄습니다. 다시 고르면 이어집니다`, 4000);
}
function startVow(goal) {
  autoBow = true; vowGoal = goal; pendingVow = null; setAutoUi(); holdScreen(true); updateHud();
  const done = state.vows[goal] || 0;
  toast(done ? `${vowName(goal)}를 ${done.toLocaleString()}배부터 이어서 올립니다` : `${vowName(goal)}를 시작합니다. 다시 누르면 멈춥니다`);
  if (player.bowT == null) doBow();
}
function onPlayerBowDone() {
  rollDay();
  const g = vowGoal ?? pendingVow;
  pendingVow = null;
  state.bowsToday++; state.bowsTotal++;
  if (g) state.vows[g] = (state.vows[g] || 0) + 1;
  save(); updateHud();
  const n = g ? state.vows[g] : state.bowsToday;
  if (g && n >= g) {
    state.vows[g] = 0; save();
    autoBow = false; vowGoal = null; setAutoUi(); holdScreen(false); updateHud();
    sound.bell(); toast(`${vowName(g)}를 마쳤습니다`, 6000);
    speak(`${korNum(g)} 배를 마쳤습니다`);
    return;
  }
  speak(`${korNum(n)} 배`);
  if (g) {
    if (n % 108 === 0) { sound.bell(0.5); toast(`${n.toLocaleString()}배를 올렸습니다`, 3000); }
  } else if (n % 108 === 0) {
    sound.bell(); toast(`108배를 ${n / 108}번 마쳤습니다`, 5000);
    return;
  }
  if (autoBow) setTimeout(() => { if (autoBow) startBow(player); }, 350);
}

$('dock').addEventListener('click', (e) => { if (e.detail) document.activeElement?.blur(); });
$('btnHap').onclick = doHap;
$('btnBow').onclick = doBow;
$('btnAuto').onclick = () => {
  if (autoBow) {
    if (player.bowT != null) pendingVow = vowGoal;   // 하던 절까지는 센다
    stopAuto();
    return;
  }
  drawVows(); openModal('vowModal');
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
const TRACKS = [
  { id: 'yeombul', name: '나무아미타불', desc: '아미타불 정근' },
  { id: 'gwaneum', name: '관세음보살', desc: '관음 정근' },
  { id: 'seokga', name: '석가모니불', desc: '석가모니불 정근' },
  { id: 'moktak', name: '목탁', desc: '말 없이 목탁 소리만' },
  { id: 'bell', name: '범종', desc: '16초마다 울리는 큰 종' },
];
if (!TRACKS.some((x) => x.id === state.chantTrack)) state.chantTrack = 'yeombul';
const MEDITATIONS = [
  { id: 'bowl', name: '싱잉볼', desc: '16초마다 길게 번지는 울림' },
  { id: 'drone', name: '깊은 울림', desc: '끊기지 않고 낮게 이어지는 소리' },
  { id: 'breath', name: '호흡 안내', desc: '들숨 약 4초, 날숨 약 6초에 맞춘 소리' },
  { id: 'keshoe', name: '경쇠', desc: '32초에 한 번, 고요히 앉을 때' },
];
const AMBIENTS = [
  { id: 'wind', name: '산바람과 풍경', desc: '실제 바람 녹음에 풍경이 가끔 울립니다' },
  { id: 'stream', name: '계곡물', desc: '가까이에서 녹음한 냇물 소리' },
  { id: 'rain', name: '빗소리', desc: '실제 빗소리 녹음' },
  { id: 'forest', name: '새 우는 숲', desc: '아침 숲에서 녹음한 새소리' },
  { id: 'night', name: '풀벌레 밤', desc: '밤에 녹음한 풀벌레 소리' },
  { id: 'off', name: '끄기', desc: '배경 소리를 끕니다' },
];
if (!AMBIENTS.some((x) => x.id === state.ambient)) state.ambient = 'wind';
sound.ambId = state.ambient;
function markList(listId, currentId, stateOf) {
  document.querySelectorAll(`#${listId} button`).forEach((b) => {
    const id = b.dataset.track || null, on = id === currentId;
    b.setAttribute('aria-checked', String(on));
    b.querySelector('.track-state').textContent = stateOf(id, on);
  });
}
function drawTracks(loadingId = null) {
  for (const list of ['trackList', 'medList']) {
    markList(list, sound.chantId || null, (id, on) => (id && id === loadingId ? '불러오는 중…' : on && id ? '재생 중' : ''));
  }
  $('btnChant').setAttribute('aria-pressed', String(!!sound.chantId));
  $('setChant').value = sound.chantId || '';
}
let ambLoading = null;
const drawAmbients = () => {
  markList('ambList', state.ambient, (id, on) => (on && id !== 'off' ? (id === ambLoading ? '불러오는 중…' : '재생 중') : ''));
  $('setAmb').value = state.ambient;
  $('ambLabel').textContent = `배경 소리 · ${AMBIENTS.find((x) => x.id === state.ambient)?.name ?? ''}`;
};
const ambFail = () => toast('배경 소리를 불러오지 못했습니다. 다시 골라 주세요');
sound.onAmbError = ambFail;
function pickAmbient(id) {
  state.ambient = id; save();
  ambLoading = sound.ctx ? id : null; drawAmbients();
  sound.setAmbient(id).catch(() => { if (state.ambient === id) ambFail(); }).finally(() => {
    if (ambLoading === id) { ambLoading = null; drawAmbients(); }
  });
}
function playTrack(id) {
  if (TRACKS.some((x) => x.id === id)) { state.chantTrack = id; save(); }   // 예불 때는 염불만 튼다
  const run = sound.playChant(id);
  drawTracks(id);
  return run.then(() => {
    if (sound.chantId === id) drawTracks();
  }).catch(() => {
    if (sound.chantId !== id) return;
    sound.chantId = null; sound.chantOn = false;
    drawTracks();
    toast('음원을 불러오지 못했습니다. 다시 눌러 주세요');
  });
}
function setChant(on) { return playTrack(on ? state.chantTrack : null); }
function fillList(listId, items, onPick) {
  const list = $(listId);
  for (const { id, name, desc } of items) {
    const b = document.createElement('button');
    b.type = 'button'; b.setAttribute('role', 'radio');
    if (id) b.dataset.track = id;
    const t = document.createElement('span'); t.className = 'track-text';
    const n = document.createElement('b'); n.textContent = name;
    const d = document.createElement('small'); d.textContent = desc;
    t.append(n, d);
    const st = document.createElement('span'); st.className = 'track-state';
    b.append(t, st);
    b.onclick = () => onPick(id);
    list.append(b);
  }
}
fillList('trackList', [...TRACKS, { id: null, name: '끄기', desc: '조용히 머뭅니다' }], (id) => { chantUntil = 0; playTrack(id); });
fillList('medList', [...MEDITATIONS, { id: null, name: '끄기', desc: '조용히 머뭅니다' }], (id) => { chantUntil = 0; playTrack(id); });
fillList('ambList', AMBIENTS, pickAmbient);
function soundTab(which) {
  for (const [tab, panel, key] of [['tabChant', 'panelChant', 'chant'], ['tabMed', 'panelMed', 'med'], ['tabAmb', 'panelAmb', 'amb']]) {
    $(tab).setAttribute('aria-selected', String(which === key));
    $(panel).hidden = which !== key;
  }
}
$('ambBtn').onclick = () => { drawTracks(); drawAmbients(); soundTab('amb'); openModal('chantModal'); };
$('tabChant').onclick = () => soundTab('chant');
$('tabMed').onclick = () => soundTab('med');
$('tabAmb').onclick = () => soundTab('amb');
$('btnChant').onclick = () => {
  drawTracks(); drawAmbients(); soundTab('chant');
  ['volChant2', 'volChant3'].forEach((id) => { $(id).value = state.vol.chant; });
  $('volWind2').value = state.vol.wind;
  openModal('chantModal');
};
[[['volChant2', 'volChant3', 'volChant'], 'chant'], [['volWind2', 'volWind'], 'wind']].forEach(([ids, k]) => {
  ids.forEach((id) => {
    $(id).oninput = () => {
      state.vol[k] = +$(id).value;
      ids.forEach((o) => { $(o).value = state.vol[k]; });
      sound.applyVolumes(); save();
    };
  });
});
$('btnBeads').onclick = () => openModal('beadsModal');

/* 정원 행동 */
let placing = false, placingDrop = false, stoneClearing = false;
const STONE_FULL = 64;   // 돌탑 넷 × 16단
function clackStones() { [0, 240, 520].forEach((ms) => setTimeout(() => { if (mode === 'garden') sound.stone(); }, ms)); }
function askStoneReset(full) {
  $('stoneAsk').textContent = full
    ? '돌탑 넷을 모두 쌓았습니다. 허물고 처음부터 다시 쌓을까요?'
    : `쌓은 돌 ${state.stones}개를 모두 내려놓고 처음부터 다시 쌓습니다. 내려놓은 돌은 되돌릴 수 없습니다.`;
  openModal('stoneModal');
}
$('stoneReset').onclick = () => { if (state.stones > 0) askStoneReset(false); };
$('stoneResetGo').onclick = () => {
  closeModals();
  if (placingDrop || !state.stones) return;
  if (placing) { player.target = null; player.onArrive = null; marker.visible = false; updateSitBtn(); }
  placing = placingDrop = true;
  state.stones = 0; save(); updateHud();
  clackStones();
  stoneClearing = true;
  garden.clearStones(() => {
    stoneClearing = false; placing = placingDrop = false;
    toast('돌을 모두 내려놓았습니다. 처음부터 다시 쌓아 보세요', 3500);
  });
};
$('btnStone').onclick = () => {
  if (placing) return;
  if (state.stones >= STONE_FULL) { askStoneReset(true); return; }
  placing = true;
  const [sx, sz] = garden.stoneSite(state.stones);
  const a = Math.atan2(player.x - sx, player.z - sz);
  const go = clampToZone(sx + Math.sin(a) * 1.15, sz + Math.cos(a) * 1.15);
  setTarget(player, go[0], go[1], null, () => {
    placingDrop = true;
    player.yawTo = Math.atan2(sx - player.x, sz - player.z);
    state.stones++; save();
    garden.placeStone(state.stones);
    garden.onStoneLand(() => {
      placing = placingDrop = false; sound.stone(); updateHud();
      if (garden.towerDone(state.stones)) { sound.bell(0.7); toast(state.stones >= STONE_FULL ? '돌탑 넷을 모두 쌓았습니다. 새로 쌓기로 다시 시작할 수 있습니다' : '돌탑 하나를 다 쌓았습니다', 4000); }
    });
  });
  updateSitBtn();
};
$('btnFeed').onclick = () => {
  if (player.feedT != null) return;
  const a = Math.atan2(player.x - POND.x, player.z - POND.z), R = pondR(a);
  const go = clampToZone(POND.x + Math.sin(a) * (R + 0.75), POND.z + Math.cos(a) * (R + 0.75));
  setTarget(player, go[0], go[1], null, () => {
    player.yawTo = a + Math.PI;
    poseOff = false;
    const tx = POND.x + Math.sin(a) * (R - 1.7), tz = POND.z + Math.cos(a) * (R - 1.7);
    player.feedT = 0; player.feedFired = 0;
    feedTheta = pickFeedTheta(a + Math.PI);
    feedViewUntil = performance.now() / 1000 + FEED_TIME + 5;   // 잉어가 받아먹는 모습까지 본다
    player.onToss = (hand, step) => {
      garden.tossFeed(hand, tx, tz, () => { if (mode === 'garden') sound.plop(); });
      if (step === 0) toast('잉어가 모여듭니다');
    };
  });
  updateSitBtn();
};

/* 법당 ↔ 정원 */
let switching = false, camSnap = false;
function applyMode(next) {
  stopAuto();
  freeCushion(player);
  mode = next;
  const inGarden = next === 'garden';
  player.cushion = null; player.target = null; player.onArrive = null;
  player.bowT = null; player.sit = player.sitTo = 0; player.hapTo = 0; player.hapUntil = 0;
  placing = placingDrop = false; player.feedT = null; feedViewUntil = 0;
  if (stoneClearing) { stoneClearing = false; garden.setStones(0); }
  marker.visible = false; keys.clear();
  player.x = 0; player.z = inGarden ? 16 : 8.6;
  player.yaw = player.yawTo = inGarden ? 0 : Math.PI;
  orbit.theta = inGarden ? Math.PI : 0; orbit.phi = 1.22; orbit.dist = inGarden ? 9.5 : 8.2;
  camSnap = true;
  ['btnBow', 'btnAuto'].forEach((id) => { $(id).hidden = inGarden; });
  ['btnStone', 'btnFeed', 'seasonBtn', 'skyBtn', 'bulduBtn'].forEach((id) => { $(id).hidden = !inGarden; });
  $('ambBtn').classList.toggle('below', inGarden);
  skyGoal = null; skyBack = null; $('skyLabel').textContent = '하늘 보기';
  setStarMode(false, true);
  leafMesh.visible = !inGarden;
  garden.setActive(inGarden);
  $('modeLabel').textContent = inGarden ? '법당으로' : '정원으로';
  $('modeIconLeaf').style.display = inGarden ? 'none' : ''; $('modeIconHall').style.display = inGarden ? '' : 'none';
  sound.setGarden(inGarden);
  updateHud(); updateSitBtn();
  toast(inGarden ? '정원입니다. 연못가 돌에 앉아 쉬어 가세요' : '법당으로 돌아왔습니다');
}
$('modeBtn').onclick = () => {
  if (switching) return;
  switching = true;
  const fade = $('fade'), next = mode === 'garden' ? 'temple' : 'garden', wait = reduceMotion ? 0 : 420;
  fade.classList.add('on');
  setTimeout(() => {
    applyMode(next);
    setTimeout(() => { fade.classList.remove('on'); switching = false; }, 60);
  }, wait);
};
/* 설정 창의 선택 상자 */
{
  const option = (parent, value, text) => { const o = document.createElement('option'); o.value = value; o.textContent = text; parent.append(o); };
  const group = (label, items) => {
    const g = document.createElement('optgroup'); g.label = label;
    items.forEach((x) => option(g, x.id, x.name));
    $('setChant').append(g);
  };
  AMBIENTS.forEach((x) => option($('setAmb'), x.id, x.name));
  option($('setChant'), '', '끄기');
  group('염불', TRACKS);
  group('명상', MEDITATIONS);
  option($('setSeason'), 'auto', '오늘 날짜에 맞추기');
  Object.entries(SEASONS).forEach(([id, c]) => option($('setSeason'), id, c.name));
}
$('setAmb').onchange = () => pickAmbient($('setAmb').value);
$('setChant').onchange = () => { chantUntil = 0; playTrack($('setChant').value || null); };
$('setSeason').onchange = () => pickSeason($('setSeason').value);
const FALL_CHOICE = {
  summer: [['green', '초록 잎'], ['seed', '민들레 홀씨'], ['rain', '여름비'], ['none', '없음']],
  autumn: [['maple', '단풍잎'], ['ginkgo', '은행잎'], ['rain', '가을비'], ['none', '없음']],
};
for (const [season, sel] of [['summer', 'setFallSummer'], ['autumn', 'setFallAutumn']]) {
  const box = $(sel), items = FALL_CHOICE[season];
  items.forEach(([id, label]) => { const o = document.createElement('option'); o.value = id; o.textContent = label; box.append(o); });
  if (!items.some(([id]) => id === state.fall[season])) state.fall[season] = items[0][0];
  box.value = state.fall[season];
  box.onchange = () => { state.fall[season] = box.value; save(); garden.setFall(state.fall); };
}
garden.setFall(state.fall);
$('setVoice').onchange = () => {
  state.voiceOn = $('setVoice').checked; save();
  if (state.voiceOn) speak('일 배'); else window.speechSynthesis?.cancel();
};
$('openSettings').onclick = () => {
  drawTracks(); drawAmbients(); drawSeasons();
  $('setVoice').checked = state.voiceOn;
  openModal('settingsModal');
};
/* 연속 절 고르기 */
const BOW_SECONDS = BOW_TIME + 0.35;
const vowTime = (goal) => {
  const min = Math.round((goal * BOW_SECONDS) / 60), h = Math.floor(min / 60), m = min % 60;
  return `약 ${h ? `${h}시간 ` : ''}${m ? `${m}분` : ''}`.trim();
};
fillList('vowList', VOWS.map((v) => ({ id: String(v.goal), name: v.name, desc: vowTime(v.goal) })), (id) => {
  // 모바일 음성은 누르는 순간 한 번 깨워 두어야 이후에 나온다
  if (state.voiceOn && window.speechSynthesis && window.SpeechSynthesisUtterance) {
    const wake = new SpeechSynthesisUtterance(' '); wake.volume = 0; window.speechSynthesis.speak(wake);
  }
  closeModals();
  startVow(+id);
});
let vowResetArmed = false;
function drawVows() {
  markList('vowList', null, (id) => {
    const done = state.vows[+id] || 0;
    return done ? `이어서 ${done.toLocaleString()}배부터` : '';
  });
  const any = VOWS.some((v) => state.vows[v.goal]);
  $('vowReset').hidden = !any;
  vowResetArmed = false; $('vowReset').textContent = '진행 기록 지우기';
  $('voiceOn').checked = state.voiceOn;
  $('volVoice').value = state.voiceVol;
  drawVoiceNote();
}
function drawVoiceNote() {
  const ss = window.speechSynthesis, voices = ss?.getVoices() ?? [];
  const none = !ss || !window.SpeechSynthesisUtterance || (voices.length > 0 && !koVoice());
  $('voiceNote').hidden = !none;
}
if (window.speechSynthesis) window.speechSynthesis.addEventListener?.('voiceschanged', drawVoiceNote);
$('vowReset').onclick = () => {
  if (!vowResetArmed) { vowResetArmed = true; $('vowReset').textContent = '한 번 더 누르면 지웁니다'; return; }
  state.vows = {}; save(); drawVows(); updateHud();
};
$('voiceOn').onchange = () => {
  state.voiceOn = $('voiceOn').checked; save();
  if (state.voiceOn) speak('일 배'); else window.speechSynthesis?.cancel();
};
$('volVoice').oninput = () => { state.voiceVol = +$('volVoice').value; save(); };
$('volVoice').onchange = () => speak('백팔 배');
$('skyBtn').onclick = () => {
  if (skyBack) { skyGoal = skyBack; skyBack = null; $('skyLabel').textContent = '하늘 보기'; setStarMode(false); return; }
  skyBack = { phi: orbit.phi, dist: orbit.dist };
  skyGoal = { phi: SKY_PHI, dist: 3.6 };
  skyEl = 0.8;
  $('skyLabel').textContent = '돌아오기';
  const night = isRealNight();
  $('starBtn').hidden = night;
  toast(night ? STAR_HINT : '별 보기를 누르면 밤하늘로 바뀝니다', 4000);
};
/* 별 보기: 낮에도 하늘을 밤으로 바꿔 별자리를 본다 */
const isRealNight = () => realHour >= 20 || realHour < 5;
const STAR_HINT = '별자리를 누르면 설명이 나옵니다. 끌어서 둘러보세요';
const STAR_FADE = 2.2;
let starMode = false, starAnim = null;
function setStarMode(on, instant = false) {
  $('starBtn').setAttribute('aria-pressed', String(on));
  $('starLabel').textContent = on ? '별 끄기' : '별 보기';
  if (!on) $('starBtn').hidden = true;
  if (on === starMode) return;
  starMode = on;
  const from = skyHour ?? realHour, to = on ? (realHour < 6 ? 1 : 23) : realHour;
  if (instant) { starAnim = null; skyHour = on ? to : null; applyTime(); return; }
  starAnim = { from, to, t: 0 };
}
function stepStarAnim(dt) {
  if (!starAnim) return;
  starAnim.t = Math.min(1, starAnim.t + dt / STAR_FADE);
  const k = smooth(0, 1, starAnim.t);
  skyHour = starAnim.from + (starAnim.to - starAnim.from) * k;
  if (starAnim.t >= 1) {
    starAnim = null;
    if (!starMode) skyHour = null;
    else toast(STAR_HINT, 4000);
  }
  applyTime();
}
$('starBtn').onclick = () => setStarMode(!starMode);
$('bulduBtn').onclick = goToBuldu;
fillList('seasonList', [
  { id: 'auto', name: '오늘 날짜에 맞추기', desc: '3~5월 봄, 6~8월 여름, 9~11월 가을, 12~2월 겨울' },
  ...Object.entries(SEASONS).map(([id, c]) => ({ id, name: c.name, desc: c.desc })),
], pickSeason);
function pickSeason(id) {
  state.season = id; save();
  params.delete('season');
  applySeason(); drawSeasons();
}
function drawSeasons() {
  markList('seasonList', state.season, (id, on) => (on && id === 'auto' ? `지금 ${SEASONS[seasonNow].name}` : on ? '선택됨' : ''));
  $('setSeason').options[0].textContent = `오늘 날짜에 맞추기 (지금 ${SEASONS[autoSeason()].name})`;
  $('setSeason').value = SEASONS[state.season] ? state.season : 'auto';
}
$('seasonBtn').onclick = () => { drawSeasons(); openModal('seasonModal'); };

/* 모달 */
let lastFocus = null;
function openModal(id) {
  lastFocus = document.activeElement;
  $(id).hidden = false; keys.clear();
  $(id).querySelector('.modal-x').focus();
}
function closeModals() {
  ['beadsModal', 'settingsModal', 'chantModal', 'seasonModal', 'vowModal', 'constModal', 'stoneModal'].forEach((id) => { $(id).hidden = true; });
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
  if (id === 'volPerc') $(id).oninput = () => { state.vol[k] = +$(id).value; sound.applyVolumes(); save(); };
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
    if (!sound.chantOn) { setChant(true); chantUntil = Date.now() + 600000; }
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
let camFit = 1;
let feedViewK = 0, feedViewUntil = 0, feedTheta = 0;   // 먹이 줄 때는 어깨 너머 위에서 손과 연못을 함께 본다
let poseK = 0, poseOff = false, atBuldu = false, bulduLift = 0, bulduBack = null;
const POSE_TURN = 1.7, POSE_TURN_BOW = 2.5, POSE_DIST = 4.8, FEED_TURN = 2.45, FEED_DIST = 6.4, FEED_PHI = 0.92;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
function viewFit(x, z, theta, reach) {
  const ox = reach * Math.sin(theta), oz = reach * Math.cos(theta);
  for (let k = 3; k <= 12; k++) {
    const s = k / 12, px = x + ox * s, pz = z + oz * s;
    for (const [cx, cz, R, low] of OBSTACLES) {
      if (!low && Math.hypot(px - cx, pz - cz) < R + 0.3) return Math.max(0.3, (k - 1) / 12);
    }
  }
  return 1;
}
// 나무와 탑에 막히지 않는 어깨 너머 방향을 고른다
function pickFeedTheta(front) {
  const side = wrapAngle(orbit.theta - front) >= 0 ? 1 : -1;
  let best = front + side * FEED_TURN, bestFit = 0;
  for (const turn of [FEED_TURN, 2.05, 2.85, 1.65]) {
    for (const sg of [side, -side]) {
      const th = front + sg * turn, f = viewFit(player.x, player.z, th, FEED_DIST * Math.sin(FEED_PHI));
      if (f > bestFit + 0.01) { best = th; bestFit = f; }
    }
    if (bestFit >= 1) break;
  }
  return best;
}
function updateCamera(dt) {
  const snap = camSnap; camSnap = false;
  const groundY = player ? heightAt(player.z) : 0;
  if (player) camTarget.set(snap ? player.x : damp(camTarget.x, player.x, 5, dt), snap ? groundY + 1.15 : damp(camTarget.y, groundY + 1.15, 5, dt), snap ? player.z : damp(camTarget.z, player.z, 5, dt));
  // 합장과 절은 앞모습이라 뒤에서는 손이 가려진다. 그동안 카메라를 옆으로 돌린다
  const feedView = player && performance.now() / 1000 < feedViewUntil && player.hapTo !== 1 && player.sitTo !== 1;
  const posing = player && !poseOff && !skyBack && !player.target && player.walk < 0.2 && (player.bowT != null || autoBow || player.hapTo === 1 || player.feedT != null || feedView);
  poseK = snap ? 0 : damp(poseK, posing ? 1 : 0, 2, dt);
  feedViewK = snap ? 0 : damp(feedViewK, posing && feedView ? 1 : 0, 2, dt);
  const camPhi = orbit.phi + (FEED_PHI - orbit.phi) * feedViewK, sinP = Math.sin(camPhi);
  let camTheta = orbit.theta;
  if (player && poseK > 0.001) {
    const front = feedView ? feedTheta : player.yawTo;
    const side = wrapAngle(orbit.theta - front) >= 0 ? 1 : -1;
    const turn = feedView ? 0 : player.bowT != null || autoBow ? POSE_TURN_BOW : POSE_TURN;   // 벌린 팔은 등 뒤 비스듬한 쪽에서 잘 보인다
    camTheta = orbit.theta + wrapAngle(front + side * turn - orbit.theta) * poseK;
  }
  const baseDist = orbit.dist + (Math.min(orbit.dist, POSE_DIST) - orbit.dist) * poseK * (1 - feedViewK) + (FEED_DIST - orbit.dist) * feedViewK;
  // 정원에서는 탑이나 나무에 시야가 막히면 카메라를 앞으로 당긴다
  let fit = 1;
  if ((mode === 'garden' || poseK > 0.01) && !atBuldu) {
    fit = viewFit(camTarget.x, camTarget.z, camTheta, baseDist * sinP);
  }
  camFit = snap ? fit : damp(camFit, fit, fit < camFit ? 9 : 2.5, dt);
  const camDist = baseDist * camFit;
  camPos.set(
    camTarget.x + camDist * sinP * Math.sin(camTheta),
    clamp(camTarget.y + camDist * Math.cos(camPhi), groundY + 0.5, mode === 'garden' ? 13 : 6.4),
    camTarget.z + camDist * sinP * Math.cos(camTheta)
  );
  camera.position.copy(camPos);
  skyLookK = snap ? 0 : damp(skyLookK, skyBack ? 1 : 0, 2.4, dt);
  if (atBuldu && (player.target || keys.size)) { atBuldu = false; skyGoal = bulduBack; }
  bulduLift = snap ? 0 : damp(bulduLift, atBuldu ? 4.8 : 0, 2.4, dt);   // 큰 불두가 화면에 들어오게 올려다본다
  const lookY = camTarget.y + 0.75 - 1.1 * poseK + bulduLift + Math.max(0, orbit.phi - 1.5) * 3.2;
  if (skyLookK > 0.001) {
    const ce = Math.cos(skyEl);   // 카메라에서 하늘 쪽으로 향하는 점으로 시선을 옮긴다
    const fx = camPos.x - Math.sin(camTheta) * ce * 10, fy = camPos.y + Math.sin(skyEl) * 10, fz = camPos.z - Math.cos(camTheta) * ce * 10;
    camera.lookAt(camTarget.x + (fx - camTarget.x) * skyLookK, lookY + (fy - lookY) * skyLookK, camTarget.z + (fz - camTarget.z) * skyLookK);
  } else camera.lookAt(camTarget.x, lookY, camTarget.z);
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
  strollers.forEach((n) => updateMonk(n, dt, t));
  npcTick(t);
  strollerTick(t);
  garden.update(t, dt);
  starUni.time.value = t; starUni.ratio.value = pixelRatio;
  stepStarAnim(dt); updateConstellations(dt);
  if (!reduceMotion) catBreath.value = 0.007 * (0.5 + 0.5 * Math.sin(t * 2));
  if (skyGoal) {
    orbit.phi = damp(orbit.phi, skyGoal.phi, 2.4, dt); orbit.dist = damp(orbit.dist, skyGoal.dist, 2.4, dt);
    if (skyGoal.theta != null) orbit.theta += wrapAngle(skyGoal.theta - orbit.theta) * (1 - Math.exp(-2.4 * dt));
    if (Math.abs(orbit.phi - skyGoal.phi) < 0.004 && Math.abs(orbit.dist - skyGoal.dist) < 0.02 && (skyGoal.theta == null || Math.abs(wrapAngle(skyGoal.theta - orbit.theta)) < 0.01)) skyGoal = null;
  }
  if (placing && !placingDrop && !player?.onArrive) placing = false;

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
  $('hud').hidden = false; $('dock').hidden = false; $('modeBtn').hidden = false; $('ambBtn').hidden = false; drawAmbients();
  const gate = $('gate');
  gate.classList.add('leaving'); setTimeout(() => { gate.hidden = true; }, 400);
  sound.bell(0.6);
  canvas.focus?.();
}
$('enterBtn').onclick = enter;
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('enterBtn').disabled) enter(); });

gardenSky = garden.setSky;
const bulduHead = buildBuldu(scene, GROUND_Y);
applyTime();
applySeason();
setInterval(() => { applyTime(); applySeason(); }, 60000);
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
window.__goyoam = { state, orbit, camera, get garden() { return garden; }, get player() { return player; }, get buddha() { return scanBuddha; }, get mode() { return mode; }, get season() { return seasonNow; }, BULDU, get bulduHead() { return bulduHead; }, set skyEl(v) { skyEl = v; }, get fallInfo() { return garden.fallInfo(); }, get constK() { return constK; }, get skyHour() { return skyHour; },
  constShown: () => constShown.map((s) => ({ id: s.c.id, name: s.c.name, px: (() => { const v = s.label.position.clone().project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z]; })() })), get poseK() { return poseK; }, korNum, get vowGoal() { return vowGoal; }, get cat() { return catModel; }, catBreath, milky: milkyUni, garden, strollers, npcs, cushions, sound };
