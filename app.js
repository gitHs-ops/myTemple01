import * as THREE from './vendor/three.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.min.js';
import { Sound } from './sound.js?v=11';
import { buildGarden, pondR, POND, GARDEN_BOUNDS, GROUND_Y, CAT } from './garden.js?v=8';
import { CONSTELLATIONS, SKY_LST, starDir } from './constellations.js?v=1';
import { CATHEDRAL, buildCathedral } from './cathedral.js?v=4';
import { MARY, buildMaryGarden } from './marygarden.js?v=2';
import { Cat, makeDish } from './cats.js?v=4';
import { BULDU, buildBuldu } from './buldu.js?v=5';

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
  { name: '', day: today(), bowsToday: 0, bowsTotal: 0, beads: 0, rounds: 0, stones: 0, candles: 0, season: 'auto', vows: {}, voiceOn: true, voiceVol: 80, chantTrack: 'yeombul', ambient: 'wind', npc: 11, vol: { wind: 55, chant: 60, perc: 70 } },
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
const skyDome = new THREE.Mesh(
  new THREE.SphereGeometry(400, 24, 16),
  new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, toneMapped: false, uniforms: skyUniforms,
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'uniform vec3 top; uniform vec3 bottom; varying vec3 p; void main(){ float k = pow(clamp(p.y*1.5+0.06,0.0,1.0),0.65); gl_FragColor = vec4(mix(bottom,top,k),1.0);\n#include <colorspace_fragment>\n}',
  })
);
scene.add(skyDome);
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
let skyZ = 0;
function setSkyZ(z) {
  skyZ = z;
  [skyDome, milky, stars, constGroup].forEach((o) => { o.position.z = z; });
}
const outsideNow = () => mode === 'garden' || mode === 'mary';
function updateConstellations(dt) {
  if (constStars) { constStars.visible = stars.visible; constStars.position.z = skyZ; }
  const on = outsideNow() && starUni.op.value > 0.5 && (skyBack || orbit.phi > 1.62);
  constK = damp(constK, on ? 1 : 0, 3, dt);
  constGroup.visible = constK > 0.01;
  garden.setFallHidden(constK > 0.3); maryGarden.setFallHidden(constK > 0.3);   // 눈앞의 눈송이와 낙엽이 별을 가리지 않게
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
  const toPx = (v) => { v.z += skyZ; v.project(camera); return v.z < 1 ? [(v.x + 1) / 2 * r.width + r.left, (1 - v.y) / 2 * r.height + r.top] : null; };
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
let cathedralNight = null;
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
  cathedralNight?.(lanternGlow);
}

/* ───────── 산·숲·마당 ───────── */
const forest = { leaf: null, items: [], trees: [] };
const ground = mesh(new THREE.CircleGeometry(420, 48), new THREE.MeshLambertMaterial({ color: 0x6f8f5d }), 0, -0.9, 0, scene);
ground.rotation.x = -Math.PI / 2;

const mountainMats = [];
const outdoors = new THREE.Group(); scene.add(outdoors);
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
  outdoors.add(new THREE.Mesh(g, mat));
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
    while ((Math.abs(x) < 14 && z > -14 && z < 13) || (Math.abs(x) < 25 && z > 12 && z < 51) || Math.hypot(x + 6, z - 58) < 13 || (Math.abs(x) < 16 && z < -52));   // 금동 불상 자리는 비운다
    const sc = rand(1, 2.2);
    forest.trees.push([x, z, 1.1 * sc]);
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
  outdoors.add(tr, lf); forest.leaf = lf;
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
// 정원 불상이 비치는 야외 빛: 법당 안의 붉은 반사 대신 맑은 금빛을 낸다
function makeGardenEnv() {
  const env = new THREE.Scene();
  const tex = canvasTex(256, 128, (g, w, h) => {
    const gr = g.createLinearGradient(0, 0, 0, h);
    gr.addColorStop(0, '#fffaf0'); gr.addColorStop(0.45, '#f7e6b8'); gr.addColorStop(0.6, '#c9a860'); gr.addColorStop(1, '#6b5a30');
    g.fillStyle = gr; g.fillRect(0, 0, w, h);
  });
  tex.mapping = THREE.EquirectangularReflectionMapping;
  env.background = tex;
  const pm = new THREE.PMREMGenerator(renderer);
  const rt = pm.fromScene(env, 0.03);
  pm.dispose(); tex.dispose();
  return rt.texture;
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
  // 절할 때 이마가 닿도록 앞뒤로 긴 직사각형 방석
  const CW = 1.2, CD = 1.7, CH = 0.16, BEVEL = 0.03;
  const roundRect = (S, w, d, r) => {
    S.moveTo(-w / 2 + r, -d / 2); S.lineTo(w / 2 - r, -d / 2); S.quadraticCurveTo(w / 2, -d / 2, w / 2, -d / 2 + r);
    S.lineTo(w / 2, d / 2 - r); S.quadraticCurveTo(w / 2, d / 2, w / 2 - r, d / 2);
    S.lineTo(-w / 2 + r, d / 2); S.quadraticCurveTo(-w / 2, d / 2, -w / 2, d / 2 - r);
    S.lineTo(-w / 2, -d / 2 + r); S.quadraticCurveTo(-w / 2, -d / 2, -w / 2 + r, -d / 2);
    return S;
  };
  const geo = new THREE.ExtrudeGeometry(roundRect(new THREE.Shape(), CW - BEVEL * 2, CD - BEVEL * 2, 0.07), { depth: CH - BEVEL * 2, bevelEnabled: true, bevelSize: BEVEL, bevelThickness: BEVEL, bevelSegments: 2, curveSegments: 5 });
  geo.rotateX(-Math.PI / 2); geo.translate(0, -(CH - BEVEL * 2) / 2, 0);
  const mats = [std(0xa33c3a), std(0x38708a), std(0x8a6a2d)];
  const trim = roundRect(new THREE.Shape(), CW - 0.1, CD - 0.1, 0.06);
  trim.holes.push(roundRect(new THREE.Path(), CW - 0.17, CD - 0.17, 0.04));
  const edge = new THREE.ShapeGeometry(trim, 5); edge.rotateX(-Math.PI / 2);
  const edgeMat = std(0xe8c35a);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 5; c++) {
    const x = -6 + c * 3, z = -2.5 + r * 2;
    const m = mesh(geo, mats[(r + c) % 3], x, 0.08, z - 0.12, cushionGroup);
    mesh(edge, edgeMat, 0, CH / 2 + 0.006, 0, m);
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
const cathedral = buildCathedral({ scene, mesh, std, canvasTex, seatGroup: cushionGroup });
cathedral.seats.forEach((q) => {
  q.mesh.userData.cushion = cushions.length;
  cushions.push(q);
});
const maryGarden = buildMaryGarden({ scene, mesh, std, canvasTex, seatGroup: cushionGroup });
maryGarden.seats.forEach((q) => {
  q.mesh.userData.cushion = cushions.length;
  cushions.push(q);
});
let mode = 'temple';
// 들어온 건물. 정원에서 돌아가는 곳이고 이웃이 앉는 곳이다
const HALLS = { temple: { name: '법당', x: 0, z: 8.6, door: 14 }, cathedral: { name: '성당', x: CATHEDRAL.start.x, z: CATHEDRAL.start.z, door: CATHEDRAL.door } };
let place = 'temple';

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
  summer: { name: '여름', desc: '짙은 녹음과 연꽃, 밤에는 반딧불이', ground: '#5f8a4d', hills: ['#4a7a4c', '#5c8768', '#7f9f8e'], broad: ['#4f8f4a', '#5d9c50', '#457f45', '#69a557'], fall: ['#5d9c50', '#76ab58'], fallN: 0, snow: 0 },
  autumn: { name: '가을', desc: '단풍이 들고 땅에 낙엽이 쌓입니다', ground: '#8b8f55', hills: ['#9a7a45', '#97825f', '#a2a08c'], broad: ['#c96f3a', '#b98a3a', '#d9552e', '#e0a33a'], fall: ['#d9852f', '#c95b2b', '#e4b23a', '#b9772b'], fallN: 0, snow: 0 },
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
  maryGarden.setSeason(k, c);
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
    name, root, body, robe, upper, head, arms, feet, mine, label, crown,
    x: 0, z: 0, yaw: Math.PI, yawTo: Math.PI, target: null, cushion: null, leaving: false,
    sit: 0, sitTo: 0, hap: 0, hapTo: 0, hapUntil: 0, bowT: null, phase: Math.random() * 6, walk: 0, stuck: 0, pop: 1, onArrive: null,
  };
}
const BOW_TIME = 6.4;
const OBSTACLES = [[-4.5, 7.4, 0.8], [4.5, 7.4, 0.8], ...garden.colliders, ...cathedral.colliders, ...maryGarden.colliders];
const POND_MARGIN = 0.55;
function pushOut(c, dx, dz, sp) {
  const slide = (ax, az, al, R) => {
    if (al >= R || al < 0.0001) return null;
    const tx = -az / al, tz = ax / al, sgn = tx * dx + tz * dz >= 0 ? 1 : -1;
    return [(ax / al) * R + tx * sgn * sp, (az / al) * R + tz * sgn * sp];
  };
  for (const [px, pz, R] of OBSTACLES) {
    if (c.target?.cush != null && Math.hypot(px - c.target.x, pz - c.target.z) < R + 0.3) continue;
    if (c.cushion != null) continue;
    const ax = c.x - px, az = c.z - pz, m = slide(ax, az, Math.hypot(ax, az), R);
    if (m) { c.x = px + m[0]; c.z = pz + m[1]; }
  }
  if (c.z > 15) {
    const ax = c.x - POND.x, az = c.z - POND.z, R = pondR(Math.atan2(ax, az)) + POND_MARGIN;
    const m = slide(ax, az, Math.hypot(ax, az), R);
    if (m) { c.x = POND.x + m[0]; c.z = POND.z + m[1]; }
  }
  for (const o of people()) {
    if (o === c) continue;
    const ax = c.x - o.x, az = c.z - o.z, m = slide(ax, az, Math.hypot(ax, az), PERSON_R);
    if (m) { c.x = o.x + m[0]; c.z = o.z + m[1]; }
  }
}

/* 길찾기: 앞을 더듬어 물체와 사람을 미리 돌아간다 */
const PERSON_R = 0.8, AVOID_LOOK = 2.4, OBJ_CLEAR = 0.2, ARRIVE_NEAR = 0.9, GIVE_UP = 14;
const AVOID_TURNS = [0.3, 0.6, 0.9, 1.2, 1.5, 1.8, 2.2, 2.6];
const people = () => (player ? [player, ...npcs, ...strollers, ...tourMates] : [...npcs, ...strollers, ...tourMates]);
const nearObs = [], nearPeople = [];
let hitX = 0, hitZ = 0, hitBig = false;   // 앞을 막은 물체의 중심. 큰 것은 한번 고른 방향으로 끝까지 돈다
function gatherNear(c, look) {
  nearObs.length = 0; nearPeople.length = 0;
  for (const q of OBSTACLES) if (Math.hypot(c.x - q[0], c.z - q[1]) < look + q[2] + OBJ_CLEAR) nearObs.push(q);
  for (const o of people()) if (o !== c && !o.gone && Math.hypot(c.x - o.x, c.z - o.z) < look + PERSON_R + 3) nearPeople.push(o);
}
// 0: 뚫림, 1: 물체나 연못, 2: 사람. 이미 가까이 있어도 멀어지는 쪽은 막지 않는다
function pathHit(c, ux, uz, look, speed) {
  const zb = ZONES[mode], inZone = c.x >= zb.xMin && c.x <= zb.xMax && c.z >= zb.zMin && c.z <= zb.zMax;
  for (const f of [0.34, 0.67, 1]) {
    const s = look * f, px = c.x + ux * s, pz = c.z + uz * s;
    if (inZone && !c.leaving && (px < zb.xMin || px > zb.xMax || pz < zb.zMin || pz > zb.zMax)) { hitX = c.x; hitZ = c.z; hitBig = false; return 1; }
    // 물가나 탑 옆 자리는 코앞까지 다가갈 수 있어야 한다
    const atGoal = Math.hypot(px - c.target.x, pz - c.target.z) < 1.5;
    if (!atGoal) for (const [ox, oz, R] of nearObs) {
      const da = Math.hypot(px - ox, pz - oz);
      if (da < R + OBJ_CLEAR && da < Math.hypot(c.x - ox, c.z - oz)) { hitX = ox; hitZ = oz; hitBig = R > 2; return 1; }
    }
    if (!atGoal && (c.z > 13 || pz > 13)) {
      const ax = px - POND.x, az = pz - POND.z, da = Math.hypot(ax, az);
      if (da < pondR(Math.atan2(ax, az)) + POND_MARGIN + 0.12 && da < Math.hypot(c.x - POND.x, c.z - POND.z)) { hitX = POND.x; hitZ = POND.z; hitBig = true; return 1; }
    }
    const lead = s / speed;
    for (const o of nearPeople) {
      const ox = o.x + (o.vx || 0) * lead, oz = o.z + (o.vz || 0) * lead, da = Math.hypot(px - ox, pz - oz);
      if (da < PERSON_R + 0.25 && da < Math.hypot(c.x - ox, c.z - oz)) return 2;
    }
  }
  return 0;
}
function steerDir(c, ux, uz, d, t, speed) {
  if (d < ARRIVE_NEAR) return [ux, uz];
  const look = Math.min(AVOID_LOOK, d);
  gatherNear(c, look);
  const base = Math.atan2(ux, uz), hit = pathHit(c, ux, uz, look, speed);
  if (!hit) {
    if (t > (c.avoidUntil || 0)) c.avoidSide = 0;
    return [ux, uz];
  }
  c.avoidUntil = t + 0.9;
  // 사람은 서로 오른쪽으로 비켜서 마주 오는 두 사람이 엇갈린다. 한번 고른 쪽은 지나갈 때까지 유지한다
  // 물체는 목적지까지 더 짧은 쪽으로 돈다
  let first = c.avoidSide || -1;
  if (!c.avoidSide && hit === 1 && (hitX !== c.x || hitZ !== c.z)) {
    const from = Math.atan2(c.x - hitX, c.z - hitZ), to = Math.atan2(c.target.x - hitX, c.target.z - hitZ), way = Math.atan2(Math.sin(to - from), Math.cos(to - from)) >= 0 ? 1 : -1;
    first = Math.sin(base + 1) * way * Math.cos(from) - Math.cos(base + 1) * way * Math.sin(from) >= 0 ? 1 : -1;
    if (hitBig) { if (c.wrapSide) first = c.wrapSide; else c.wrapSide = first; }
  }
  for (const turn of AVOID_TURNS) {
    for (const side of c.avoidSide ? [first] : [first, -first]) {
      const a = base + side * turn, vx = Math.sin(a), vz = Math.cos(a);
      if (!pathHit(c, vx, vz, look, speed)) { c.avoidSide = side; return [vx, vz]; }
    }
  }
  c.avoidSide = -first;   // 이쪽이 막혔으면 다음에는 반대쪽으로 돈다
  if (c.wrapSide) c.wrapSide = -first;
  return [ux, uz];
}
const heightAt = (z) => (z > 11.7 ? -Math.min(0.9, (z - 11.7) * 0.45) : 0);

function setTarget(c, x, z, cush = null, onArrive = null) {
  freeCushion(c);
  c.bowT = null; c.sitTo = 0; c.hapTo = 0; c.hapUntil = 0; c.target = { x, z, cush }; c.onArrive = onArrive; c.stuck = 0;
  c.bestD = Infinity; c.bestAt = performance.now() / 1000; c.avoidSide = 0; c.wrapSide = 0; c.freshTarget = true;
  if (cush != null) cushions[cush].by = c;
}
function freeCushion(c) {
  if (c.cushion != null) { cushions[c.cushion].by = null; c.cushion = null; }
  if (c.target?.cush != null) { cushions[c.target.cush].by = null; }
  if (c.target?.seat != null) { cushions[c.target.seat].by = null; }
}
const PEW_FRONT = 1.24, PEW_AISLE = 0.6;
function walkToSeat(c, i, done = null) {
  const q = cushions[i];
  if (q.zone !== 'cathedral') { setTarget(c, q.x, q.z, i, done); return; }
  const front = q.z - PEW_FRONT;
  const leg = (x, next) => { setTarget(c, x, front, null, next); c.target.seat = i; q.by = c; c.freshTarget = true; };
  const along = () => leg(q.x, () => setTarget(c, q.x, q.z, i, done));
  if (Math.abs(c.z - front) < 0.5) along();
  else leg(q.x > 0 ? PEW_AISLE : -PEW_AISLE, along);
}
// 앉았던 긴 의자에서 앞으로 나온다
function leavePew(c, q, done = null) {
  setTarget(c, q.x, q.z - PEW_FRONT, null, done);
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
  const startX = c.x, startZ = c.z;
  const arrive = () => {
    if (c.target.cush != null) { c.cushion = c.target.cush; c.sitTo = 1; c.yawTo = cushions[c.cushion].yaw; }
    const done = c.onArrive; c.target = null; c.onArrive = null;
    if (c.mine) marker.visible = false;
    done?.();
  };
  const giveUp = () => {
    const cu = c.target.cush ?? c.target.seat;
    if (cu != null) cushions[cu].by = null;
    c.target = null; c.onArrive = null;
    if (c.mine) marker.visible = false;
  };
  if (c.target) {
    const dx = c.target.x - c.x, dz = c.target.z - c.z, d = Math.hypot(dx, dz);
    const blocker = d < PERSON_R + 0.5 ? people().find((o) => o !== c && Math.hypot(o.x - c.target.x, o.z - c.target.z) < PERSON_R) : null;
    if (d < 0.08 || (blocker && c.target.cush == null)) arrive();   // 목적지에 누가 서 있으면 그 앞에서 멈춘다
    else if (blocker) {
      // 앉을 자리에 서 있는 사람은 비켜 주고, 그동안 기다린다
      if (!blocker.mine && !blocker.target && blocker.cushion == null) {
        const ax = blocker.x - c.target.x, az = blocker.z - c.target.z, al = Math.hypot(ax, az) || 1;
        const [nx, nz] = clampToZone(c.target.x + (ax || al) / al * 1.8, c.target.z + az / al * 1.8);
        setTarget(blocker, nx, nz);
      }
      c.yawTo = Math.atan2(dx, dz);
      if (t - c.bestAt > GIVE_UP) giveUp();
    } else {
      const speed = c.walkSpeed || (c.mine ? 3 : 2.1), sp = speed * dt, ox = c.x, oz = c.z;
      const [wx, wz] = steerDir(c, dx / d, dz / d, d, t, speed);
      // 방향을 부드럽게 틀어 지그재그를 막는다
      const k = 1 - Math.exp(-9 * dt);
      c.dirX = c.dirX == null || c.stuck === 0 && c.freshTarget ? wx : c.dirX + (wx - c.dirX) * k;
      c.dirZ = c.dirZ == null || c.stuck === 0 && c.freshTarget ? wz : c.dirZ + (wz - c.dirZ) * k;
      c.freshTarget = false;
      const dl = Math.hypot(c.dirX, c.dirZ) || 1, mx = c.dirX / dl, mz = c.dirZ / dl;
      c.x += mx * Math.min(sp, d); c.z += mz * Math.min(sp, d);
      pushOut(c, mx, mz, sp);
      c.yawTo = Math.atan2(mx, mz); moving = 1;
      c.stuck = Math.hypot(c.x - ox, c.z - oz) < sp * 0.2 ? c.stuck + dt : 0;
      if (d < c.bestD - 0.2) { c.bestD = d; c.bestAt = t; }
      if (c.stuck > 0.8 || t - c.bestAt > GIVE_UP) {
        // 목적지 코앞을 누가 막고 있으면 다 온 것으로 친다
        if (d < 1.2 && c.target.cush == null) arrive();
        else giveUp();
      }
    }
  }
  moveKeys(c, dt, () => { moving = 1; });
  if (dt > 0) { c.vx = (c.x - startX) / dt; c.vz = (c.z - startZ) / dt; }

  let dy = c.yawTo - c.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  c.yaw += dy * (1 - Math.exp(-9 * dt));
  c.walk = damp(c.walk, moving, 10, dt);
  c.phase += dt * (c.walkSpeed ? c.walkSpeed * 4.5 : 10) * moving;   // 천천히 걸을 때는 발걸음도 느리게
  c.sit = damp(c.sit, c.sitTo, 6, dt);
  if (c.hapUntil && t > c.hapUntil) { c.hapTo = 0; c.hapUntil = 0; }

  let kneel = 0, down = 0, rise = 0, spread = 0;
  if (c.bowT != null) {
    c.bowT += dt / BOW_TIME;
    const b = c.bowT;
    // 일어나 → 양팔을 앞으로 내밀며 앉고 → 이마를 숙였다가 → 일으켜 앉고 → 팔을 내리며 일어난다
    rise = smooth(0, 0.14, b) * (1 - smooth(0.24, 0.38, b));
    kneel = smooth(0.24, 0.38, b) * (1 - smooth(0.86, 1, b));
    down = smooth(0.38, 0.54, b) * (1 - smooth(0.68, 0.84, b));
    spread = smooth(0.1, 0.28, b) * (1 - smooth(0.84, 0.98, b));
    c.hapTo = 0; c.hapUntil = 0;
    if (place === 'cathedral') { spread = 0; down *= 0.22; c.hapTo = b < 0.9 ? 1 : 0; }
    if (!c.bowHit && b > 0.54) { c.bowHit = true; if (c.mine) { if (place === 'cathedral') sound.bead(); else sound.moktak(0.75); } }
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
    eulerArm.set(swing * (1 - c.hap) - 0.72 * lap - 3.02 * down - 1.5 * spread * (1 - down), 0, s * (0.2 * (1 - c.hap) * (1 - lap) * (1 - spread) - 0.5 * lap + 0.15 * down));
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
    // 합장과 절에서는 팔을 앞으로 길게 뻗는다
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
sound.voiceVol = state.voiceVol;
let player = null;
const npcs = [];
const marker = mesh(new THREE.RingGeometry(0.18, 0.28, 24), new THREE.MeshBasicMaterial({ color: 0x6366f1, transparent: true, opacity: 0.8, depthWrite: false }), 0, 0.03, 0);
marker.rotation.x = -Math.PI / 2; marker.visible = false; scene.add(marker);

const freeCushions = (zone = mode) => cushions.map((c, i) => ({ c, i })).filter(({ c }) => !c.by && c.zone === zone);
const usedNames = new Set();
const uniqueName = () => { for (let i = 0; i < 40; i++) { const n = randomName(); if (!usedNames.has(n)) { usedNames.add(n); return n; } } return randomName(); };

function addNpc(seated) {
  const free = freeCushions(place); if (!free.length) return;
  const { i } = pick(free);
  const name = uniqueName();
  const n = makeMonk(name);
  n.nextAct = performance.now() / 1000 + rand(6, 40);
  n.onBowDone = () => { n.nextAct = performance.now() / 1000 + rand(14, 55); };
  if (seated) {
    n.x = cushions[i].x; n.z = cushions[i].z; n.cushion = i; cushions[i].by = n; n.sit = n.sitTo = 1;
    if (Math.random() < 0.4) n.bowT = Math.random() * 0.8;
  } else {
    n.x = rand(-2.8, 2.8); n.z = HALLS[place].door; n.pop = 0.01;
    walkToSeat(n, i);
  }
  npcs.push(n);
}
function leaveNpc(n) {
  if (n.leaving) return;
  n.leaving = true;
  const out = () => setTarget(n, rand(-2.8, 2.8), HALLS[place].door, null, () => { n.gone = true; });
  const q = n.cushion != null ? cushions[n.cushion] : null;
  if (q?.zone !== 'cathedral') { out(); return; }
  const front = q.z - PEW_FRONT;
  leavePew(n, q, () => setTarget(n, q.x > 0 ? PEW_AISLE : -PEW_AISLE, front, null, out));
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
    if (n.leaving) { const door = HALLS[place].door; n.pop = n.z > door - 1.2 ? Math.max(0.02, (door - n.z) / 1.2) : n.pop; }
    if (n.cushion == null || n.target || n.bowT != null) continue;
    if (t > n.nextAct) {
      if (place !== 'cathedral' && Math.random() < 0.72) startBow(n);
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
const tourMates = [];   // 탑돌기를 함께 도는 이웃
const WAY = [[0, 18], [2.8, 26], [1.5, 37], [-3, 43], [-11, 41.5], [9, 37], [8.5, 28], [7, 15.6], [-9, 19], [-14, 21], [1, 32.5]];
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
let tap = null, pinch = 0, zoomGoal = null;   // 줌은 목표만 바꾸고 카메라는 천천히 따라간다
const ZOOM_RATE = 1.6;
const raycaster = new THREE.Raycaster(), ndc = new THREE.Vector2();
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0), hitV = new THREE.Vector3();
let entered = false;
const modalOpen = () => !$('talkModal').hidden || !$('confessModal').hidden || !$('beadsModal').hidden || !$('settingsModal').hidden || !$('chantModal').hidden || !$('seasonModal').hidden || !$('vowModal').hidden || !$('constModal').hidden || !$('stoneModal').hidden;

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
    if (pinch) zoomGoal = clamp((zoomGoal ?? orbit.dist) * Math.pow(pinch / d, 0.7), 3.2, 16);
    pinch = d; return;
  }
  if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap.moved = true;
  if (tap?.moved) {
    orbit.theta -= dx * 0.006; poseOff = true; atBuldu = false;
    if (skyBack) skyEl = clamp(skyEl - dy * 0.004, 0.08, 1.52);
    else {
      skyGoal = null;
      orbit.phi = clamp(orbit.phi - dy * 0.005, 0.42, outsideNow() ? SKY_PHI : 1.5);
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
canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (entered) zoomGoal = clamp((zoomGoal ?? orbit.dist) * Math.exp(e.deltaY * 0.0006), 3.2, 16); }, { passive: false });
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

function handleTap(cx, cy) {
  if (outsideNow() && constK > 0.5) {
    const s = pickConstellation(cx, cy);
    if (s) { showConstellation(s); return; }
    if (skyBack) { toast('별자리 선이나 이름을 눌러 보세요', 2500); return; }
  }
  const r = canvas.getBoundingClientRect();
  ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  if (mode === 'garden' && !skyBack && raycaster.intersectObject(bulduHead, true).length) { goToBuldu(); return; }
  if (mode === 'mary' && !skyBack && raycaster.intersectObject(maryGarden.statue, true).length) { goToBuldu(); return; }
  if (mode === 'cathedral' && raycaster.intersectObject(cathedral.booth, true).length) { goConfess(); return; }
  const hit = raycaster.intersectObjects(cushionGroup.children, false).find((h) => cushions[h.object.userData.cushion].zone === mode);
  if (hit) { goToCushion(hit.object.userData.cushion); return; }
  floorPlane.constant = mode === 'garden' ? -GROUND_Y : 0;
  if (raycaster.ray.intersectPlane(floorPlane, hitV)) walkTo(hitV.x, hitV.z);
}
const ZONES = {
  temple: { xMin: -8.4, xMax: 8.4, zMin: -3.9, zMax: 11 },
  garden: GARDEN_BOUNDS,
  cathedral: CATHEDRAL.zone,
  mary: MARY.zone,
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
  const atMary = mode === 'mary';
  const { x, z } = atMary ? MARY.stand : BULDU.stand;
  setTarget(player, x, z, null, () => {
    player.yawTo = atMary ? Math.PI : Math.atan2(BULDU.x - x, BULDU.z - z);
    bulduBack = { phi: orbit.phi, dist: orbit.dist };
    skyGoal = atMary ? { phi: 1.34, dist: 8.6, theta: 0 } : { phi: 1.42, dist: 18, theta: BULDU.viewTheta };
    atBuldu = true;
    updateSitBtn();
    toast(atMary ? '성모상 앞에 왔습니다. 기도해 보세요' : '금동 불상 앞에 왔습니다. 합장해 보세요', 4000);
  });
  marker.position.set(x, heightAt(z) + 0.03, z); marker.visible = true; marker.scale.setScalar(1);
  updateSitBtn();
  toast(atMary ? '성모상을 찾아갑니다' : '금동 불상을 찾아갑니다');
}
function goToCushion(i) {
  const c = cushions[i];
  if (c.zone !== mode) return;
  if (c.by && c.by !== player) { toast('다른 분이 앉아 있는 자리입니다'); return; }
  stopAuto();
  walkToSeat(player, i, updateSitBtn);
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
// 108까지는 통째로 녹음한 조각, 그 위는 낱말 조각을 잇는다
function sayBows(n, finished = false) {
  if (!state.voiceOn || place === 'cathedral') return;
  const keys = finished ? [...korNum(n), '배를 마쳤습니다'] : n <= 108 ? [String(n)] : [...korNum(n), '배'];
  sound.say(keys).catch(() => toast('안내 음성을 불러오지 못했습니다'));
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
  const inGarden = mode === 'garden', atMary = mode === 'mary';
  $('countLabel').textContent = inGarden ? '쌓은 돌' : atMary ? '봉헌한 초' : place === 'cathedral' ? '오늘 기도' : vowGoal ? vowName(vowGoal) : '오늘 절';
  $('countOf').hidden = inGarden || atMary; $('bowBarWrap').hidden = inGarden || atMary;
  $('stoneReset').hidden = !inGarden || !state.stones;
  $('countOf').textContent = `/ ${(vowGoal ?? 108).toLocaleString()}`;
  $('bowToday').textContent = inGarden ? state.stones : atMary ? state.candles : vowGoal ? (state.vows[vowGoal] || 0).toLocaleString() : state.bowsToday;
  const barPct = vowGoal ? ((state.vows[vowGoal] || 0) / vowGoal) * 100 : ((state.bowsToday % 108 || (state.bowsToday ? 108 : 0)) / 108) * 100;
  $('bowBar').style.width = `${Math.min(100, barPct)}%`;
  $('statTotal').textContent = state.bowsTotal.toLocaleString();
  $('statRounds').textContent = state.rounds.toLocaleString();
}
function updateSitBtn() {
  const seated = player && (player.cushion != null || player.target?.cush != null || player.target?.seat != null);
  $('btnSitLabel').textContent = seated ? '일어서기' : '앉기';
}
function doHap() {
  if (skyBack) $('skyBtn').click();   // 하늘을 보는 중이면 돌아와서 합장한다
  if (player.target || player.bowT != null) return;
  if (mode !== 'garden') player.yawTo = Math.PI;
  if (player.hapTo) { player.hapTo = 0; player.hapUntil = 0; return; }
  player.hapTo = 1; player.hapUntil = performance.now() / 1000 + 8; poseOff = false;
  if (place === 'cathedral') sound.bead(); else sound.moktak(0.35);
}
function doBow() {
  if (outsideNow()) return;
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
    sayBows(g, true);
    return;
  }
  sayBows(n);
  if (g) {
    if (n % 108 === 0) { sound.bell(0.5); toast(`${n.toLocaleString()}배를 올렸습니다`, 3000); }
  } else if (n % 108 === 0) {
    sound.bell(); toast(place === 'cathedral' ? `기도 ${n}번을 드렸습니다` : `108배를 ${n / 108}번 마쳤습니다`, 5000);
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
  if (player.cushion != null || player.target?.cush != null || player.target?.seat != null) {
    const pew = player.cushion != null && cushions[player.cushion].zone === 'cathedral' ? cushions[player.cushion] : null;
    stopAuto(); freeCushion(player); player.cushion = null; player.target = null; player.sitTo = 0; player.hapTo = 0;
    if (pew) leavePew(player, pew, updateSitBtn);
    updateSitBtn(); return;
  }
  const i = nearestFreeCushion();
  if (i == null) { toast('빈 자리가 없습니다'); return; }
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
  { id: 'organ', name: '오르간', desc: '천천히 이어지는 파이프 오르간 화음' },
  { id: 'choir', name: '성가대 허밍', desc: '넓은 성당에 울리는 합창 화음' },
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
  updateAmbNote();
}
let ambLoading = null;
// 배경 소리를 꺼도 염불·명상은 따로 남는다. 무슨 소리인지 설정 창에서 바로 알 수 있게 한다
function updateAmbNote() {
  const box = $('ambNote'), left = state.ambient === 'off' && sound.chantId;
  box.hidden = !left;
  if (left) box.textContent = `지금 나는 소리는 ${[...TRACKS, ...MEDITATIONS].find((x) => x.id === sound.chantId)?.name ?? '염불·명상'}입니다. 아래 염불·명상에서 끄기를 고르면 멈춥니다.`;
}
// 다른 탭에서 들어오면 이 탭의 소리를 멈춘다. 이 탭으로 돌아오면 다시 낸다
const tabs = window.BroadcastChannel ? new BroadcastChannel('goyoam-sound') : null;
let tabMuted = false;
if (tabs) tabs.onmessage = () => { if (sound.ctx) { sound.ctx.suspend(); tabMuted = true; } };
document.addEventListener('visibilitychange', () => {
  if (document.hidden || !tabMuted) return;
  tabMuted = false; sound.ctx.resume(); tabs.postMessage('entered');
});
const drawAmbients = () => {
  markList('ambList', state.ambient, (id, on) => (on && id !== 'off' ? (id === ambLoading ? '불러오는 중…' : '재생 중') : ''));
  $('setAmb').value = state.ambient;
  $('ambLabel').textContent = `배경 소리 · ${AMBIENTS.find((x) => x.id === state.ambient)?.name ?? ''}`;
  updateAmbNote();
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
  drawTracks(); drawAmbients(); soundTab(place === 'cathedral' ? 'med' : 'chant');
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
const LEFT_KEY = 'goyoam.left';
$('exitBtn').onclick = () => {
  stopAuto(); save();
  talkToken = null; stopTalk();
  sound.stopVoice();
  sound.ctx?.close();
  try { sessionStorage.setItem(LEFT_KEY, '1'); } catch { /* 사생활 모드 등 */ }
  window.close();   // 스크립트로 연 창이 아니면 브라우저가 막으므로 입구로 돌아간다
  location.reload();
};
try {
  if (sessionStorage.getItem(LEFT_KEY)) { sessionStorage.removeItem(LEFT_KEY); $('gateNote').hidden = false; }
} catch { /* 사생활 모드 등 */ }

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
let offering = false;
function offerCandle() {
  const q = MARY.stand;
  setTarget(player, q.x, q.z, null, () => {
    player.yawTo = Math.PI;
    if (offering) return;
    offering = true;
    setTimeout(() => {
      offering = false;
      if (mode !== 'mary' || player.target) return;
      state.candles++; save();
      maryGarden.setCandles(state.candles); updateHud();
      sound.bead(); toast('촛불을 봉헌했습니다');
    }, 500);
  });
  updateSitBtn();
  toast('성모상 앞으로 갑니다');
}
$('btnStone').onclick = () => {
  if (mode === 'mary') { offerCandle(); return; }
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
function feedDoves() {
  const F = MARY_FOUNTAIN, a = Math.atan2(player.x - F.x, player.z - F.z);
  setTarget(player, F.x + Math.sin(a) * 5.5, F.z + Math.cos(a) * 5.5, null, () => {
    player.yawTo = a + Math.PI;
    poseOff = false;
    const tx = F.x + Math.sin(a) * 4.2, tz = F.z + Math.cos(a) * 4.2;
    player.feedT = 0; player.feedFired = 0;
    feedTheta = pickFeedTheta(a + Math.PI);
    feedViewUntil = performance.now() / 1000 + FEED_TIME + 11;
    player.onToss = (hand, step) => {
      maryGarden.tossFeed(hand, tx, tz, () => { if (mode === 'mary') sound.bead(); });
      if (step === 0) toast('비둘기가 모여듭니다');
      if (step === 0) callCatsToDish();
      if (step === 1) toast('고양이도 밥을 먹으러 옵니다');
    };
  });
  updateSitBtn();
}
$('btnFeed').onclick = () => {
  if (player.feedT != null) return;
  if (mode === 'mary') { feedDoves(); return; }
  const a = Math.atan2(player.x - POND.x, player.z - POND.z), R = pondR(a);
  const go = clampToZone(POND.x + Math.sin(a) * (R + 0.75), POND.z + Math.cos(a) * (R + 0.75));
  setTarget(player, go[0], go[1], null, () => {
    player.yawTo = a + Math.PI;
    poseOff = false;
    const tx = POND.x + Math.sin(a) * (R - 1.7), tz = POND.z + Math.cos(a) * (R - 1.7);
    player.feedT = 0; player.feedFired = 0;
    feedTheta = pickFeedTheta(a + Math.PI);
    feedViewUntil = performance.now() / 1000 + FEED_TIME + 11;   // 잉어가 받아먹는 모습까지 본다
    player.onToss = (hand, step) => {
      garden.tossFeed(hand, tx, tz, () => { if (mode === 'garden') sound.plop(); });
      if (step === 0) toast('잉어가 모여듭니다');
      if (step === 0) callCatsToDish();
      if (step === 1) toast('고양이도 밥을 먹으러 옵니다');
    };
  });
  updateSitBtn();
};

/* 탑돌기: 탑을 오른쪽에 두고 손을 모은 채 세 바퀴 돈다 */
const TOWER = { x: 8.5, z: 19, R: 3.6 }, TOWER_ROUNDS = 3, TOWER_STEPS = 24;
const MARY_FOUNTAIN = { x: 0, z: MARY.z + 6, R: 5 };
const tourName = () => (mode === 'mary' ? '묵주 걷기' : '탑돌기');
let tour = null;
function stopTour() {
  if (!tour) return;
  tour = null;
  player.walkSpeed = 0; player.hapTo = 0; player.hapUntil = 0;
  $('btnTower').setAttribute('aria-pressed', 'false');
  const now = performance.now() / 1000;
  for (const m of tourMates) if (!m.leaving) { m.target = null; m.onArrive = null; m.walkSpeed = 0; m.hapTo = 0; m.hapUntil = 0; m.leaveAt = now + 0.6; }
}
/* 함께 도는 이웃: 자기 자리 바로 바깥에서 나타나 내 앞뒤에 서서 같은 걸음으로 돈다 */
function callMates(C) {
  const live = tourMates.filter((m) => !m.leaving);
  live.forEach((m) => { m.leaveAt = null; });
  const off = 2 * Math.asin(1.25 / C.R), want = state.npc ? [off, -off] : [];
  for (const o of want) {
    const held = live.find((m) => m.off === o);
    if (held) continue;
    const m = makeMonk(uniqueName());
    const slot = Math.atan2(player.x - C.x, player.z - C.z) + o;
    let x = C.x + Math.sin(slot) * C.R, z = C.z + Math.cos(slot) * C.R;
    for (const out of [3, 2.2, 1.4]) {
      const px = C.x + Math.sin(slot) * (C.R + out), pz = C.z + Math.cos(slot) * (C.R + out);
      const inPond = mode === 'garden' && Math.hypot(px - POND.x, pz - POND.z) < pondR(Math.atan2(px - POND.x, pz - POND.z)) + 1;
      const [cx, cz] = clampToZone(px, pz);
      if (!inPond && cx === px && cz === pz && !OBSTACLES.some(([ox, oz, R]) => Math.hypot(px - ox, pz - oz) < R + 0.6)) { x = px; z = pz; break; }
    }
    m.x = x; m.z = z; m.pop = 0.01; m.off = o; m.joined = false; m.leaveAt = null; m.joinBy = performance.now() / 1000 + 8;
    m.yaw = m.yawTo = Math.atan2(C.x - x, C.z - z);
    tourMates.push(m);
  }
}
function matesFinish(C) {
  const now = performance.now() / 1000;
  for (const m of tourMates) {
    if (m.leaving || !m.joined) continue;
    m.yawTo = mode === 'mary' ? Math.PI : Math.atan2(C.x - m.x, C.z - m.z);
    m.hapTo = 1; m.hapUntil = now + 4; m.leaveAt = now + 4.6; m.home = C;
  }
}
function removeMate(m) {
  usedNames.delete(m.name);
  m.root.traverse((o) => { if (o.isSprite) { o.material.map.dispose(); o.material.dispose(); } });
  m.crown.geometry.dispose();
  scene.remove(m.root);
  tourMates.splice(tourMates.indexOf(m), 1);
}
function aimMate(m, x, z, t) {
  if (m.target) { m.target.x = x; m.target.z = z; m.bestAt = t; return; }
  const hap = m.hapTo;
  setTarget(m, x, z);
  m.hapTo = hap;
}
function matesTick(dt, t) {
  for (const m of [...tourMates]) {
    if (m.leaving) {
      const near = !m.target || Math.hypot(m.target.x - m.x, m.target.z - m.z) < 1.5;
      if (near) m.pop = Math.max(0.01, m.pop - dt / 0.6);
      if (m.pop <= 0.01) removeMate(m);
      continue;
    }
    m.pop = Math.min(1, m.pop + dt / 0.6);
    if (tour) {
      const C = tour.c, pa = Math.atan2(player.x - C.x, player.z - C.z), slot = pa + m.off;
      const sx = C.x + Math.sin(slot) * C.R, sz = C.z + Math.cos(slot) * C.R;
      if (!m.joined) {
        m.walkSpeed = 0;
        aimMate(m, sx, sz, t);
        if (Math.hypot(sx - m.x, sz - m.z) < 1.1) m.joined = true;
        else if (t > m.joinBy) { m.x = sx; m.z = sz; m.pop = 0.01; m.target = null; m.joined = true; }   // 길이 막혔으면 제자리에 다시 나타난다
        continue;
      }
      // 도는 방향은 각도가 줄어드는 쪽. 자리보다 앞서면 늦추고 뒤처지면 서두른다
      const ma = Math.atan2(m.x - C.x, m.z - C.z), ahead = wrapAngle(slot - ma), base = player.walkSpeed || 0.9;
      m.hapTo = 1; m.hapUntil = 0;
      const pace = THREE.MathUtils.clamp(1 - ahead * 7, 0, 1.9);
      if (pace < 0.15) { m.target = null; continue; }
      m.walkSpeed = base * pace;
      const la = ma - 1.2 / C.R;
      aimMate(m, C.x + Math.sin(la) * C.R, C.z + Math.cos(la) * C.R, t);
    } else if (m.leaveAt != null && t > m.leaveAt) {
      const C = m.home || TOWER_NEAR(), a = Math.atan2(m.x - C.x, m.z - C.z);
      const [x, z] = clampToZone(m.x + Math.sin(a) * 8, m.z + Math.cos(a) * 8);
      m.leaving = true; m.walkSpeed = 0; m.hapTo = 0; m.hapUntil = 0;
      setTarget(m, x, z);
    }
  }
}
const TOWER_NEAR = () => (mode === 'mary' ? MARY_FOUNTAIN : TOWER);
function clearMates() { [...tourMates].forEach(removeMate); }
function tourStep() {
  const a = tour.start - (tour.step / TOWER_STEPS) * Math.PI * 2;
  const C = tour.c, x = C.x + Math.sin(a) * C.R, z = C.z + Math.cos(a) * C.R;
  setTarget(player, x, z);
  player.freshTarget = tour.step === 0;
  player.hapTo = 1; player.hapUntil = 0;
  tour.wp = player.target;
}
function towerTick(dt) {
  if (!tour) return;
  if (keys.size || (player.target && player.target !== tour.wp)) { stopTour(); updateSitBtn(); return; }
  if (!pointers.size) {
    const out = Math.atan2(player.x - tour.c.x, player.z - tour.c.z);
    orbit.theta += wrapAngle(out - orbit.theta) * (1 - Math.exp(-1.6 * dt));
  }
  if (player.target) return;
  tour.step++;
  if (tour.step % TOWER_STEPS === 0) {
    const round = tour.step / TOWER_STEPS;
    if (round >= TOWER_ROUNDS) {
      const C = tour.c, name = tourName();
      stopTour();
      matesFinish(C);
      player.yawTo = mode === 'mary' ? Math.PI : Math.atan2(C.x - player.x, C.z - player.z);
      player.hapTo = 1; player.hapUntil = performance.now() / 1000 + 4; poseOff = tourMates.some((m) => m.joined);   // 함께 돈 이웃과 탑이 다 보이도록 뒤에서 본다
      sound.bell(0.7); toast(`${name} ${TOWER_ROUNDS}바퀴를 마쳤습니다`, 4000);
      return;
    }
    sound.bead(); toast(`${tourName()} ${round}바퀴`);
  }
  tourStep();
}
$('btnTower').onclick = () => {
  if (tour) { stopTour(); player.target = null; player.onArrive = null; updateSitBtn(); toast(`${tourName()}를 멈췄습니다`); return; }
  if (skyBack) $('skyBtn').click();
  stopAuto();
  const C = mode === 'mary' ? MARY_FOUNTAIN : TOWER;
  tour = { c: C, start: Math.atan2(player.x - C.x, player.z - C.z), step: 0, wp: null };
  player.walkSpeed = mode === 'mary' ? 0.55 : 0.9;
  callMates(C);
  $('btnTower').setAttribute('aria-pressed', 'true');
  tourStep();
  updateSitBtn();
  toast(mode === 'mary' ? `분수를 오른쪽에 두고 손을 모은 채 ${TOWER_ROUNDS}바퀴 걷습니다` : `탑을 오른쪽에 두고 ${TOWER_ROUNDS}바퀴 돕니다`);
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
  stopTour();
  clearMates();
  if (stoneClearing) { stoneClearing = false; garden.setStones(0); }
  marker.visible = false; keys.clear();
  const outside = inGarden || next === 'mary';
  const at = inGarden ? { x: 0, z: 16 } : next === 'mary' ? MARY.start : HALLS[next];
  player.x = at.x; player.z = at.z;
  player.yaw = player.yawTo = inGarden ? 0 : Math.PI;
  orbit.theta = inGarden ? Math.PI : 0; orbit.phi = 1.22; orbit.dist = outside ? 9.5 : 8.2; zoomGoal = null;
  camSnap = true;
  $('btnTalk').hidden = outside;
  $('btnBow').hidden = outside; $('btnAuto').hidden = next !== 'temple'; $('btnConfess').hidden = next !== 'cathedral';
  const church = place === 'cathedral';
  $('btnBowLabel').textContent = place === 'cathedral' ? '무릎 꿇기' : '절하기';
  $('btnHapLabel').textContent = place === 'cathedral' ? '기도' : '합장';
  $('btnBeadsLabel').textContent = church ? '묵주' : '염주';
  $('beadsTitle').textContent = church ? '108묵주' : '108염주';
  $('tabChant').hidden = church;
  cathedral.setActive(next === 'cathedral');
  outdoors.visible = next === 'temple' || inGarden;
  maryGarden.setActive(next === 'mary');
  ['btnStone', 'btnFeed', 'btnTower', 'seasonBtn', 'skyBtn', 'bulduBtn'].forEach((id) => { $(id).hidden = !outside; });
  $('ambBtn').classList.toggle('below', outside);
  $('dock').classList.toggle('outside', outside);
  setSkyZ(next === 'mary' ? MARY.z : 0);
  catsReset();
  skyGoal = null; skyBack = null; $('skyLabel').textContent = '하늘 보기';
  setStarMode(false, true);
  leafMesh.visible = next === 'temple';
  garden.setActive(inGarden);
  $('modeLabel').textContent = outside ? `${HALLS[place].name}으로` : church ? '성모 동산으로' : '정원으로';
  $('modeIconLeaf').style.display = outside ? 'none' : ''; $('modeIconHall').style.display = outside ? '' : 'none';
  sound.setGarden(outside);
  updateHud(); updateSitBtn();
  toast(inGarden ? '정원입니다. 연못가 돌에 앉아 쉬어 가세요' : next === 'mary' ? '성모 동산입니다. 벤치에 앉아 쉬어 가세요' : next === 'cathedral' ? '성당입니다. 긴 의자에 앉아 쉬어 가세요' : '법당으로 돌아왔습니다');
}
$('modeBtn').onclick = () => {
  if (switching) return;
  switching = true;
  const fade = $('fade'), next = mode === place ? (place === 'cathedral' ? 'mary' : 'garden') : place, wait = reduceMotion ? 0 : 420;
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
$('setVoice').onchange = () => {
  state.voiceOn = $('setVoice').checked; save();
  if (state.voiceOn) sayBows(1); else sound.stopVoice();
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
}
$('vowReset').onclick = () => {
  if (!vowResetArmed) { vowResetArmed = true; $('vowReset').textContent = '한 번 더 누르면 지웁니다'; return; }
  state.vows = {}; save(); drawVows(); updateHud();
};
$('voiceOn').onchange = () => {
  state.voiceOn = $('voiceOn').checked; save();
  if (state.voiceOn) sayBows(1); else sound.stopVoice();
};
$('volVoice').oninput = () => { state.voiceVol = sound.voiceVol = +$('volVoice').value; sound.applyVolumes(); save(); };
$('volVoice').onchange = () => sayBows(108);
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
  leaveBooth();
  ['beadsModal', 'settingsModal', 'chantModal', 'seasonModal', 'vowModal', 'constModal', 'stoneModal', 'confessModal', 'talkModal'].forEach((id) => { $(id).hidden = true; });
  lastFocus?.focus?.(); lastFocus = null;
}
document.querySelectorAll('[data-close]').forEach((b) => { b.onclick = closeModals; });
document.querySelectorAll('.overlay').forEach((o) => {
  o.addEventListener('pointerdown', (e) => { if (e.target === o) closeModals(); });
  o.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = [...o.querySelectorAll('button, input, textarea')].filter((el) => el.offsetParent), first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
});

/* 정원을 지나다니는 고양이 */
const CAT_KIT = { scene, mesh, std, canvasTex };
const strays = [new Cat(2, CAT_KIT, 3 + Math.random() * 6), new Cat(0, CAT_KIT, 14 + Math.random() * 14), new Cat(1, CAT_KIT, 28 + Math.random() * 25)];
const catDish = makeDish(CAT_KIT, scene);
let dishUntil = 0;
const catRand = (a, b) => a + Math.random() * (b - a);
function catEdge(side) {
  const b = ZONES[mode];
  if (side === 0) return [b.xMin - 4, catRand(b.zMin + 3, b.zMax - 3)];
  if (side === 1) return [b.xMax + 4, catRand(b.zMin + 3, b.zMax - 3)];
  return [mode === 'mary' ? catRand(-14, 14) : catRand(4, 18), b.zMax + 4];
}
const catSpotClear = (x, z, pad, lowToo = false) => {
  const b = ZONES[mode];
  if (x < b.xMin + 0.5 || x > b.xMax - 0.5 || z < b.zMin + 0.5 || z > b.zMax - 0.5) return false;
  if (mode === 'garden' && Math.hypot(x - POND.x, z - POND.z) < pondR(Math.atan2(x - POND.x, z - POND.z)) + 0.5 + pad) return false;
  return ![...OBSTACLES, ...garden.rimRocks].some(([ox, oz, R, low]) => (lowToo || !low) && Math.hypot(x - ox, z - oz) < R + pad);
};
/* 먹이 주기: 내 옆에 밥그릇을 놓으면 고양이들이 달려와 먹는다 */
function callCatsToDish() {
  // 먹이 줄 때의 카메라로 미리 비춰 보고, 그릇과 고양이가 화면에 가장 잘 들어오는 자리를 고른다
  const now = performance.now() / 1000, vx = -Math.sin(feedTheta), vz = -Math.cos(feedTheta), rx = -vz, rz = vx;
  const gy = heightAt(player.z), reach = FEED_DIST * viewFit(player.x, player.z, feedTheta, FEED_DIST * Math.sin(FEED_PHI));
  const eye = camera.clone();
  eye.position.set(player.x - vx * reach * Math.sin(FEED_PHI), gy + 1.15 + reach * Math.cos(FEED_PHI), player.z - vz * reach * Math.sin(FEED_PHI));
  eye.lookAt(player.x, gy + 0.8, player.z); eye.updateMatrixWorld(true);
  const ndc = new THREE.Vector3();
  const room = (x, z) => { ndc.set(x, heightAt(z) + 0.2, z).project(eye); return Math.min(1 - Math.abs(ndc.x), ndc.y + (camera.aspect < 1 ? 0.68 : 0.5), 0.75 - ndc.y); };
  const spread = camera.aspect < 1 ? 0.62 : 1.05, away = Math.atan2(vx, vz);   // 고양이는 그릇 건너편에서 카메라 쪽을 보고 먹는다
  let dx = player.x + vx * 1.8, dz = player.z + vz * 1.8, best = -9;
  for (let side = -3.2; side <= 3.2; side += 0.4) for (let on = -3.2; on <= 3.2; on += 0.4) {
    const x = player.x + rx * side + vx * on, z = player.z + rz * side + vz * on;
    if (Math.hypot(x - player.x, z - player.z) < 2.4 || !catSpotClear(x, z, 0.6, true)) continue;   // 고양이 자리가 내 몸과 겹치지 않게 띄운다
    let score = room(x, z);
    for (const k of [-1, 0, 1]) {
      const a = away + k * spread;
      score = Math.min(score, room(x + Math.sin(a) * 1.5, z + Math.cos(a) * 1.5));
    }
    if (score < 0) score *= 4;   // 화면 밖은 무엇보다 피한다
    score -= Math.abs(side) < 0.9 && on > 0 && on < 1.2 ? 0.3 : 0;   // 내 몸에 가리는 자리는 피한다
    // 카메라와 그릇 사이를 바위나 석등이 막으면 고양이가 가린다
    for (let f = 0.55; f < 0.98; f += 0.07) {
      const qx = eye.position.x + (x - eye.position.x) * f, qz = eye.position.z + (z - eye.position.z) * f;
      if (OBSTACLES.some(([ox, oz, R]) => Math.hypot(qx - ox, qz - oz) < R + 0.25) || (mode === 'garden' && garden.rimRocks.some(([ox, oz, R]) => Math.hypot(qx - ox, qz - oz) < R + 0.25))) { score -= 0.3; break; }
    }
    if (mode === 'garden' && Math.hypot(x - POND.x, z - POND.z) < pondR(Math.atan2(x - POND.x, z - POND.z)) + 3) score -= 0.1;   // 연못가 큰 바위에 가리지 않게 물가에서 떨어진다
    if (score > best) { dx = x; dz = z; best = score; }
  }
  catDish.position.set(dx, heightAt(dz) + 0.005, dz); catDish.visible = true; catDish.scale.setScalar(1);
  dishUntil = now + 4;
  strays.forEach((c, i) => {
    const a = away + (i - 1) * spread, x = dx + Math.sin(a) * 0.6, z = dz + Math.cos(a) * 0.6;
    let near = [dx + Math.sin(a) * 2, dz + Math.cos(a) * 2];
    for (let k = 0; k < 20; k++) {
      const q = a + catRand(-0.9, 0.9), r = catRand(4.5, 6.5), px = dx + Math.sin(q) * r, pz = dz + Math.cos(q) * r;
      if (catSpotClear(px, pz, 0.5)) { near = [px, pz]; break; }
    }
    c.callFood({ x, z, dx, dz, eat: 8 + i * 1.2, until: Infinity }, near);
  });
}
function catRoute() {
  // 가장자리에서 들어와 안쪽을 두어 곳 들렀다가 다른 가장자리로 나간다
  const atMary = mode === 'mary', b = ZONES[mode], edge = catEdge;
  const a = Math.floor(Math.random() * 3);
  const c = (a + 1 + Math.floor(Math.random() * 2)) % 3;
  const inside = () => {
    for (let k = 0; k < 24; k++) {
      const x = catRand(b.xMin + 2, b.xMax - 2), z = catRand(b.zMin + 2, b.zMax - 2);
      const hit = OBSTACLES.some(([ox, oz, R, low]) => !low && Math.hypot(x - ox, z - oz) < R + 0.7);
      const pond = !atMary && Math.hypot(x - POND.x, z - POND.z) < pondR(Math.atan2(x - POND.x, z - POND.z)) + 0.9;
      if (!hit && !pond) return [x, z];
    }
    return [0, b.zMax - 4];
  };
  const mids = 1 + Math.floor(Math.random() * 3), points = [edge(a)];
  for (let i = 0; i < mids; i++) points.push(inside());
  points.push(edge(c));
  return { points };
}
const catEnv = {
  get obstacles() { return mode === 'garden' ? [...OBSTACLES, ...garden.rimRocks] : OBSTACLES; }, people,
  route: catRoute,
  exit: () => catEdge(Math.floor(Math.random() * 3)),
  nextWait: () => catRand(10, 45),
  y: (z) => heightAt(z),
  big: (x, z) => {
    if (mode !== 'garden') return null;
    const a = Math.atan2(x - POND.x, z - POND.z);
    return [POND.x, POND.z, pondR(a) + 0.35];
  },
};
function catsReset() { catDish.visible = false; dishUntil = 0; strays.forEach((c, i) => c.hide(i === 0 ? catRand(3, 10) : catRand(14, 30) + (i - 1) * 14)); }
function catsTick(dt, t) {
  if (mode !== 'garden' && mode !== 'mary') return;
  strays.forEach((c) => c.update(dt, catEnv));
  if (catDish.visible && t > dishUntil && !strays.some((c) => c.food)) {
    const k = catDish.scale.x - dt * 1.5;
    if (k <= 0.02) catDish.visible = false; else catDish.scale.setScalar(k);
  }
}

/* 법문과 말씀: 미리 쓴 글을 합성 음성으로 들려주고 자막을 보여 준다 */
const TALKS = {
  temple: [
    { id: 'monk_anger', name: '화가 날 때', desc: '두 번째 화살 이야기' },
    { id: 'monk_letgo', name: '내려놓는다는 것', desc: '뗏목의 비유' },
    { id: 'monk_breath', name: '이 숨 하나', desc: '함께 호흡을 바라봅니다' },
    { id: 'monk_mustard', name: '겨자씨 한 줌', desc: '소중한 사람을 잃은 분께' },
    { id: 'monk_elephant', name: '코끼리를 만진 사람들', desc: '내가 아는 것은 어디까지일까' },
    { id: 'monk_teacup', name: '넘치는 찻잔', desc: '마음을 비운다는 것' },
    { id: 'monk_lotus', name: '진흙 속의 연꽃', desc: '고단한 자리에서' },
    { id: 'monk_wonhyo', name: '원효 스님의 물 한 모금', desc: '모든 것은 마음이 짓는다' },
    { id: 'monk_strings', name: '거문고 줄', desc: '너무 애쓰고 있는 분께' },
    { id: 'monk_meal', name: '밥 한 그릇', desc: '공양의 마음' },
    { id: 'monk_change', name: '이것도 지나간다', desc: '모든 것은 변합니다' },
    { id: 'monk_metta', name: '모두가 편안하기를', desc: '함께 자비의 마음을 냅니다' },
  ],
  cathedral: [
    { id: 'priest_burden', name: '무거운 짐을 진 사람들에게', desc: '마태오 복음 11장' },
    { id: 'priest_son', name: '되찾은 아들', desc: '루카 복음 15장' },
    { id: 'priest_forgive', name: '일흔일곱 번의 용서', desc: '마태오 복음 18장' },
    { id: 'priest_lilies', name: '내일을 걱정하지 마라', desc: '마태오 복음 6장' },
    { id: 'priest_sheep', name: '잃어버린 양 한 마리', desc: '루카 복음 15장' },
    { id: 'priest_martha', name: '마르타야, 마르타야', desc: '루카 복음 10장' },
    { id: 'priest_emmaus', name: '엠마오로 가는 길', desc: '루카 복음 24장' },
    { id: 'priest_storm', name: '풍랑 속의 배', desc: '마르코 복음 4장' },
    { id: 'priest_samaritan', name: '누가 이웃이 되어 주었느냐', desc: '루카 복음 10장' },
    { id: 'priest_widow', name: '렙톤 두 닢', desc: '마르코 복음 12장' },
    { id: 'priest_love', name: '사랑은 참고 기다립니다', desc: '코린토 1서 13장' },
    { id: 'priest_zacchaeus', name: '오늘은 네 집에', desc: '루카 복음 19장' },
  ],
};
/* 오늘의 말씀: 날짜로 섞어 그날은 같은 세 편을 보여 주고, 다 돌 때까지 겹치지 않게 날마다 바꾼다 */
const TALKS_PER_DAY = 3;
const dayNumber = () => { const d = new Date(); return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000); };
function shuffledTalks(where, seed) {
  const list = [...TALKS[where]];
  let x = (seed * 2654435761 + (where === 'temple' ? 17 : 91)) >>> 0;
  for (let i = list.length - 1; i > 0; i--) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    const j = (x >>> 8) % (i + 1);
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list;
}
function talksFor(where, day, page = 0) {
  const days = Math.floor(TALKS[where].length / TALKS_PER_DAY), order = shuffledTalks(where, Math.floor(day / days));
  const start = ((day % days) + page) % days * TALKS_PER_DAY;
  return order.slice(start, start + TALKS_PER_DAY);
}
let talkPage = 0;
const TALK_NAME = { temple: { who: '스님', verb: '법문' }, cathedral: { who: '신부님', verb: '말씀' } };
let talk = null, speaker = null;
function makeSpeaker() {
  if (speaker) return speaker;
  const church = place === 'cathedral', w = TALK_NAME[place].who;
  const c = makeMonk(w), oldRobe = c.robe.material, oldCrown = M.crown;
  const robe = std(church ? 0xf4f0e6 : 0x7f8180), cape = new THREE.MeshStandardMaterial({ color: church ? 0x2f6b45 : 0xa8562e, roughness: 0.85, side: THREE.DoubleSide });
  const hair = church ? std(0x3a2c22) : null;
  c.root.traverse((o) => {
    if (!o.isMesh) return;
    if (o.material === oldRobe) o.material = robe;
    else if (o.material === M.sash) o.material = church ? std(0xd8ac45, { metalness: 0.5, roughness: 0.4 }) : cape;
    else if (hair && o.material === oldCrown) o.material = hair;
  });
  // 가사 또는 제의: 옷 위에 한 겹을 더 입는다
  const over = mesh(new THREE.LatheGeometry([[0.47, 0.3], [0.4, 0.5], [0.29, 0.74], [0.18, 0.85]].map(([r, h]) => new THREE.Vector2(r, h)), 20), cape, 0, 0, 0, c.robe);
  over.scale.setScalar(1.02);
  if (church) {
    const A = cathedral.ambo;
    c.x = A.x; c.z = A.z - 0.62; c.baseY = A.y; c.yaw = c.yawTo = 0;
  } else {
    // 법상에 앉아 대중을 바라본다
    const X = -4.7, Z = -4.75;
    mesh(new THREE.BoxGeometry(1.8, 0.42, 1.7), std(0x7c2a24), X, 0.21, Z, scene);
    mesh(new THREE.BoxGeometry(1.92, 0.05, 1.82), std(0xd8ac45, { metalness: 0.4, roughness: 0.45 }), X, 0.44, Z, scene);
    mesh(new THREE.BoxGeometry(1.15, 0.1, 1.15), std(0xa33c3a), X, 0.51, Z, scene);
    c.x = X; c.z = Z; c.baseY = 0.5; c.yaw = c.yawTo = 0.45; c.sit = c.sitTo = 1;
  }
  speaker = c;
  return c;
}
function speakerTick(dt, t) {
  if (!speaker) return;
  speaker.root.visible = !!talk;
  if (!talk) return;
  speaker.yawTo = speaker.yaw;
  updateMonk(speaker, dt, t);
  speaker.root.position.y = speaker.baseY;
  // 말하는 동안 고개를 조금씩 끄덕인다
  speaker.head.rotation.x += Math.sin(t * 1.3) * 0.05;
  speaker.head.rotation.y = Math.sin(t * 0.43) * 0.16;
}
function showCue() {
  if (!talk) return;
  const now = talk.el.currentTime, cues = talk.cues;
  let cue = null;
  for (const q of cues) { if (q[0] <= now + 0.05 && now <= q[0] + q[1] + 0.7) cue = q; }
  const text = cue ? cue[2] : '';
  if (text !== talk.shown) { talk.shown = text; $('talkText').textContent = text; }
  $('talkFill').style.width = `${Math.min(100, (now / (talk.dur || 1)) * 100)}%`;
}
function stopTalk(done = false) {
  if (!talk) return;
  const verb = TALK_NAME[place].verb;
  talk = null;
  sound.stopTalk();
  $('talkBar').hidden = true;
  document.body.classList.remove('talk-on');
  $('btnTalk').setAttribute('aria-pressed', 'false');
  if (done) { sound.bell(0.45); toast(`${verb}이 끝났습니다`, 4000); }
}
async function startTalk(id) {
  stopTalk();
  const item = TALKS[place].find((q) => q.id === id), token = {};
  talkToken = token;
  $('talkWho').textContent = `${TALK_NAME[place].who} · ${item.name}`;
  $('talkText').textContent = '불러오는 중입니다…';
  $('talkFill').style.width = '0';
  $('talkPause').setAttribute('aria-label', '일시정지'); $('talkPause').classList.remove('paused');
  $('talkBar').hidden = false; document.body.classList.add('talk-on');
  let info;
  try {
    const r = await fetch(`audio/talk_${id}.json?v=1`);
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    info = await r.json();
  } catch {
    if (talkToken === token) { $('talkBar').hidden = true; document.body.classList.remove('talk-on'); toast('음성을 불러오지 못했습니다'); }
    return;
  }
  if (talkToken !== token) return;
  const el = sound.playTalk(`audio/talk_${id}.mp3?v=1`);
  talk = { id, el, cues: info.cues, dur: info.dur, shown: null };
  makeSpeaker();
  $('btnTalk').setAttribute('aria-pressed', 'true');
  el.addEventListener('timeupdate', showCue);
  el.addEventListener('ended', () => { if (talk?.el === el) stopTalk(true); });
  el.addEventListener('error', () => { if (talk?.el === el) { stopTalk(); toast('음성을 불러오지 못했습니다'); } });
  el.play().catch(() => { if (talk?.el === el) { $('talkPause').classList.add('paused'); toast('재생 버튼을 눌러 주세요'); } });
  // 자리가 없으면 가까운 자리에 가서 듣는다
  if (mode === place && player.cushion == null && player.target?.cush == null && player.target?.seat == null) {
    const i = nearestFreeCushion();
    if (i != null) goToCushion(i);
  }
}
let talkToken = null;
function openTalks() {
  const { who, verb } = TALK_NAME[place];
  $('talkTitle').textContent = `오늘의 ${who} ${verb}`;
  $('talkMore').textContent = `다른 ${verb} 보기`;
  drawTalks();
  openModal('talkModal');
}
function drawTalks() {
  $('talkList').textContent = '';
  fillList('talkList', talksFor(place, dayNumber(), talkPage), (id) => { closeModals(); startTalk(id); });
  markList('talkList', talk?.id ?? null, (id, on) => (on ? '듣는 중' : ''));
}
$('talkMore').onclick = () => { talkPage++; drawTalks(); };
$('btnTalk').onclick = openTalks;
$('talkPause').onclick = () => {
  if (!talk) return;
  if (talk.el.paused) { sound.ctx.resume(); talk.el.play().catch(() => {}); } else talk.el.pause();
  const paused = talk.el.paused;
  $('talkPause').classList.toggle('paused', paused);
  $('talkPause').setAttribute('aria-label', paused ? '다시 듣기' : '일시정지');
};
$('talkStop').onclick = () => { talkToken = null; stopTalk(); };

/* 고해성사: 쓴 글은 어디에도 저장하거나 보내지 않고, 다음 단계로 넘어가면 바로 지운다 */
const CONFESS_TOPICS = [
  { id: 'god', name: '하느님과의 관계', q: '기도와 주일 미사를 소홀히 하지 않았습니까?', adv: '하루 한 번, 짧아도 좋으니 하느님께 말을 건네 보십시오. 관계는 긴 기도보다 자주 찾는 데서 회복됩니다.' },
  { id: 'family', name: '가족', q: '가까운 사람에게 함부로 대하거나 무심하지 않았습니까?', adv: '가까운 사람일수록 고맙다는 말과 미안하다는 말이 늦어집니다. 오늘 한마디만 먼저 건네 보십시오.' },
  { id: 'neighbor', name: '이웃과 미움', q: '누군가를 미워하거나 험담하지 않았습니까?', adv: '미움을 바로 없애려 애쓰기보다, 그 사람을 위해 짧게 기도해 보십시오. 마음은 그렇게 조금씩 풀립니다.' },
  { id: 'truth', name: '거짓과 정직', q: '거짓말로 자신을 지키거나 남을 속이지 않았습니까?', adv: '바로잡을 수 있는 거짓이라면 작은 것부터 바로잡아 보십시오. 진실은 말하는 사람을 먼저 가볍게 합니다.' },
  { id: 'work', name: '일과 책임', q: '맡은 일을 미루거나 남에게 떠넘기지 않았습니까?', adv: '모든 것을 한꺼번에 만회하려 하지 말고, 오늘 할 수 있는 일 하나를 정성껏 해 보십시오.' },
  { id: 'self', name: '나 자신', q: '탐욕과 교만에 휩쓸리거나 자신을 함부로 대하지 않았습니까?', adv: '자신을 너무 몰아세우지 마십시오. 하느님께서 아끼시는 사람을 함부로 대하는 것도 돌아볼 일입니다.' },
];
const CONFESS_GENERAL = '오늘 이 자리에 앉아 자신을 돌아본 것만으로도 귀한 걸음입니다. 서두르지 말고, 할 수 있는 만큼 조금씩 고쳐 가십시오.';
const CONFESS_PENANCE = ['주님의 기도와 성모송을 세 번 천천히 바치십시오.', '묵주 한 단, 열 알을 천천히 넘기며 기도하십시오.', '오늘 한 사람에게 먼저 따뜻한 말을 건네십시오.', '잠들기 전 오늘 고마웠던 일 세 가지를 떠올리며 감사드리십시오.'];
const CONFESS_TITLES = ['들어가며', '양심 성찰', '고백', '통회', '권고와 보속'];
let inBooth = false, confessTopics = new Set();
function confessStep(n) {
  document.querySelectorAll('#confessModal [data-step]').forEach((el) => { el.hidden = +el.dataset.step !== n; });
  $('confessTitle').textContent = CONFESS_TITLES[n];
  $('confessProgress').textContent = `${n + 1} / ${CONFESS_TITLES.length}`;
  $('confessModal').querySelector('.modal').scrollTop = 0;
}
function drawConfessTopics() {
  const box = $('confessTopics'); box.textContent = '';
  CONFESS_TOPICS.forEach((tp) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'confess-topic'; b.setAttribute('aria-pressed', 'false');
    const nm = document.createElement('b'); nm.textContent = tp.name;
    const qs = document.createElement('span'); qs.textContent = tp.q;
    b.append(nm, qs);
    b.onclick = () => {
      const on = !confessTopics.has(tp.id);
      if (on) confessTopics.add(tp.id); else confessTopics.delete(tp.id);
      b.setAttribute('aria-pressed', String(on));
    };
    box.append(b);
  });
}
function goConfess() {
  if (mode !== 'cathedral' || inBooth) return;
  stopAuto();
  const q = cathedral.confessSpot;
  setTarget(player, q.x, q.z, null, () => {
    player.yawTo = -Math.PI / 2;
    setTimeout(() => {
      if (mode !== 'cathedral' || player.target || modalOpen()) return;
      inBooth = true;
      player.root.visible = false;
      confessTopics = new Set();
      $('confessText').value = '';
      drawConfessTopics(); confessStep(0);
      sound.bead();
      openModal('confessModal');
    }, 450);
  });
  marker.visible = false; updateSitBtn();
  toast('고해소로 갑니다');
}
function leaveBooth() {
  if (!inBooth) return;
  inBooth = false;
  $('confessText').value = '';
  confessTopics = new Set();
  player.root.visible = true;
}
$('btnConfess').onclick = goConfess;
$('confessStart').onclick = () => { sound.bead(); confessStep(1); };
$('confessNext').onclick = () => { sound.bead(); confessStep(2); $('confessText').focus(); };
$('confessDone').onclick = () => {
  $('confessText').value = '';   // 쓴 글은 여기서 지운다
  sound.bead(); confessStep(3);
};
$('confessContrite').onclick = () => {
  const picked = CONFESS_TOPICS.filter((tp) => confessTopics.has(tp.id)).slice(0, 2);
  const box = $('confessAdvice'); box.textContent = '';
  (picked.length ? picked.map((tp) => tp.adv) : [CONFESS_GENERAL]).forEach((txt) => {
    const para = document.createElement('p'); para.textContent = txt; box.append(para);
  });
  $('confessPenance').textContent = pick(CONFESS_PENANCE);
  sound.bell(0.45); confessStep(4);
};
$('confessRosary').onclick = () => {
  closeModals();
  $('btnBeads').click();
};
$('confessFinish').onclick = () => {
  closeModals();
  sound.bell(0.6); toast('평안히 가십시오', 4000);
};

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
    toast(place === 'cathedral' ? (h === 6 ? '아침 종이 울립니다' : '저녁 종이 울립니다') : h === 6 ? '아침 예불이 시작됩니다' : '저녁 예불이 시작됩니다', 6000);
    sound.bell(); setTimeout(() => sound.bell(), 7000); setTimeout(() => sound.bell(), 14000);
    if (place === 'temple' && !sound.chantOn) { setChant(true); chantUntil = Date.now() + 600000; }
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
const POSE_TURN = 1.7, POSE_TURN_BOW = 1.95, POSE_DIST = 4.8, FEED_TURN = 2.45, FEED_DIST = 6.4, FEED_PHI = 0.92;
const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const VIEW_BLOCKERS = [...OBSTACLES, [-9, 7.4, 0.45], [9, 7.4, 0.45], ...forest.trees.filter(([x, z]) => Math.abs(x) < 36 && z > -14 && z < 62)];   // 정원 둘레 숲의 나무에도 카메라가 파묻히지 않게 한다
function viewFit(x, z, theta, reach) {
  const ox = reach * Math.sin(theta), oz = reach * Math.cos(theta);
  for (let k = 6; k <= 24; k++) {
    const s = k / 24, px = x + ox * s, pz = z + oz * s;
    for (const [cx, cz, R, low] of VIEW_BLOCKERS) {
      if (!low && Math.hypot(px - cx, pz - cz) < R + 0.75) return Math.max(0.3, (k - 1) / 24);
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
  if (zoomGoal != null) {
    orbit.dist = damp(orbit.dist, zoomGoal, ZOOM_RATE, dt);
    if (Math.abs(orbit.dist - zoomGoal) < 0.01 || skyGoal) zoomGoal = null;
  }
  const groundY = player ? heightAt(player.z) : 0;
  if (player) camTarget.set(snap ? player.x : damp(camTarget.x, player.x, 5, dt), snap ? groundY + 1.15 : damp(camTarget.y, groundY + 1.15, 5, dt), snap ? player.z : damp(camTarget.z, player.z, 5, dt));
  // 합장과 절은 앞모습이라 뒤에서는 손이 가려진다. 그동안 카메라를 옆으로 돌린다
  const feedView = player && performance.now() / 1000 < feedViewUntil && player.hapTo !== 1 && player.sitTo !== 1;
  const posing = player && !poseOff && !skyBack && !atBuldu && !player.target && player.walk < 0.2 && (player.bowT != null || autoBow || player.hapTo === 1 || player.feedT != null || feedView);
  poseK = snap ? 0 : damp(poseK, posing ? 1 : 0, 1.3, dt);
  feedViewK = snap ? 0 : damp(feedViewK, posing && feedView ? 1 : 0, 1.3, dt);
  const camPhi = orbit.phi + (Math.min(orbit.phi, 1.32) - orbit.phi) * poseK * (1 - feedViewK) + (FEED_PHI - orbit.phi) * feedViewK, sinP = Math.sin(camPhi);
  let camTheta = orbit.theta;
  if (player && poseK > 0.001) {
    const front = feedView ? feedTheta : player.yawTo;
    const side = wrapAngle(orbit.theta - front) >= 0 ? 1 : -1;
    const turn = feedView ? 0 : player.bowT != null || autoBow ? POSE_TURN_BOW : POSE_TURN;   // 앞으로 내민 팔은 옆에서 잘 보인다
    camTheta = orbit.theta + wrapAngle(front + side * turn - orbit.theta) * poseK;
  }
  const baseDist = orbit.dist + (Math.min(orbit.dist, POSE_DIST) - orbit.dist) * poseK * (1 - feedViewK) + (FEED_DIST - orbit.dist) * feedViewK;
  // 정원에서는 탑이나 나무에 시야가 막히면 카메라를 앞으로 당긴다
  let fit = 1;
  if ((mode !== 'temple' || poseK > 0.01) && !atBuldu) {
    fit = viewFit(camTarget.x, camTarget.z, camTheta, baseDist * sinP);
  }
  camFit = snap ? fit : damp(camFit, fit, fit < camFit ? 2.6 : 1.1, dt);
  const camDist = baseDist * camFit;
  camPos.set(
    camTarget.x + camDist * sinP * Math.sin(camTheta),
    clamp(camTarget.y + camDist * Math.cos(camPhi), groundY + 0.5, mode === 'garden' || mode === 'mary' ? 13 : mode === 'cathedral' ? CATHEDRAL.cam.yMax : 6.4),
    camTarget.z + camDist * sinP * Math.cos(camTheta)
  );
  if (mode === 'cathedral') { const b = CATHEDRAL.cam; camPos.x = clamp(camPos.x, b.xMin, b.xMax); camPos.z = clamp(camPos.z, b.zMin, b.zMax); }
  camera.position.copy(camPos);
  skyLookK = snap ? 0 : damp(skyLookK, skyBack ? 1 : 0, 2.4, dt);
  if (atBuldu && (player.target || keys.size)) { atBuldu = false; skyGoal = bulduBack; }
  bulduLift = snap ? 0 : damp(bulduLift, atBuldu ? (mode === 'mary' ? 1.15 : 3.4) : 0, 2.4, dt);   // 큰 불상이 화면에 들어오게 올려다본다
  const lookY = camTarget.y + 0.75 - 1.1 * poseK + bulduLift + Math.max(0, camPhi - 1.5) * 3.2;
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
  tourMates.forEach((n) => updateMonk(n, dt, t));
  npcTick(t);
  strollerTick(t);
  garden.update(t, dt);
  if (mode === 'cathedral') cathedral.update(t);
  else if (mode === 'mary') maryGarden.update(t, dt);
  towerTick(dt);
  matesTick(dt, t);
  speakerTick(dt, t);
  catsTick(dt, t);
  bulduHead.userData.setLight(THREE.MathUtils.clamp((hemi.intensity - 0.7) / 0.7, 0.38, 1));
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

function enter(kind = 'temple') {
  const name = $('nameInput').value.trim().slice(0, 10) || randomName();
  $('btnTalkLabel').textContent = kind === 'cathedral' ? '말씀 듣기' : '법문 듣기';
  if (kind === 'cathedral') {
    $('btnStoneLabel').textContent = '촛불 봉헌'; $('btnStone').title = '성모상 앞에 촛불 봉헌하기';
    $('btnStone').querySelector('svg').innerHTML = '<path d="M9 21h6M10 21V11h4v10M12 11V9M12 3c-1.6 2-2 3-2 4a2 2 0 0 0 4 0c0-1-.4-2-2-4z"/>';
    $('btnFeed').title = '비둘기와 고양이에게 모이 주기';
    $('btnFeed').querySelector('svg').innerHTML = '<path d="M3 15c3 3 8 3 11 0l7-7-5 1-2-3c-2 0-4 2-4 4l-7 5zM14 6l-1-2"/>';
    $('btnTowerLabel').textContent = '묵주 걷기'; $('btnTower').title = '분수를 오른쪽에 두고 세 바퀴 걷기';
    $('btnTower').querySelector('svg').innerHTML = '<circle cx="12" cy="12" r="8" stroke-dasharray="2 3"/><path d="M12 9v6M10 11h4"/>';
    $('bulduLabel').textContent = '성모상'; $('bulduBtn').title = '성모상 앞으로 걸어가기';
    $('bulduBtn').querySelector('svg').innerHTML = '<path d="M12 3a3 3 0 0 1 3 3v3l3 11H6L9 9V6a3 3 0 0 1 3-3z"/>';
    // 수도복 차림으로 바꾸고 이웃을 성당 의자로 옮긴다
    place = kind;
    [0x3a2d26, 0x2e2826, 0x44352a, 0x332b28].forEach((c, i) => M.robes[i].color.set(c));
    M.sash.color.set(0xe9e2d0);
    const count = npcs.length;
    [...npcs].forEach(disposeNpc);
    cushions.forEach((q) => { q.by = null; });
    for (let i = 0; i < count; i++) addNpc(true);
  }
  state.name = name; rollDay(); save();
  usedNames.add(name);
  player = makeMonk(name, true);
  player.x = 0; player.z = 8.6; player.onBowDone = onPlayerBowDone;
  $('whoName').textContent = name;
  updateHud(); drawBeads();
  sound.start();
  if (state.voiceOn) sound.loadVoice().catch(() => {});
  tabs?.postMessage('entered');
  entered = true;
  orbit.theta = 0;
  $('hud').hidden = false; $('dock').hidden = false; $('modeBtn').hidden = false; $('ambBtn').hidden = false; drawAmbients();
  const gate = $('gate');
  gate.classList.add('leaving'); setTimeout(() => { gate.hidden = true; }, 400);
  sound.bell(0.6);
  if (kind === 'cathedral') applyMode('cathedral');
  canvas.focus?.();
}
$('enterBtn').onclick = () => enter('temple');
$('enterCathBtn').onclick = () => enter('cathedral');
$('nameInput').addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('enterBtn').disabled) enter('temple'); });

gardenSky = garden.setSky;
cathedralNight = (n) => { cathedral.setNight(n); maryGarden.setNight(n); };
maryGarden.setCandles(state.candles);
const bulduHead = buildBuldu(scene, GROUND_Y, makeGardenEnv);
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
$('enterCathBtn').disabled = false;

// 자동 점검용 진입점
window.__goyoam = { state, orbit, camera, talksFor, TALKS, dayNumber, strays, tourMates, forest, catDish, callCatsToDish, get zoomGoal() { return zoomGoal; }, get talk() { return talk; }, get speaker() { return speaker; }, get skyZ() { return skyZ; }, maryGarden, MARY, goConfess, get inBooth() { return inBooth; }, get hall() { return place; }, get tour() { return tour; }, TOWER, CATHEDRAL, leafCount: () => leafMesh.count, walkTarget: (x, z, cb) => setTarget(player, x, z, null, cb), walkOther: (n, x, z) => setTarget(n, x, z), walkCush: (i) => walkToSeat(player, i), get npcs() { return npcs; }, get strollers() { return strollers; }, OBSTACLES, get cushions() { return cushions; }, get garden() { return garden; }, get player() { return player; }, get buddha() { return scanBuddha; }, get mode() { return mode; }, get season() { return seasonNow; }, BULDU, get bulduHead() { return bulduHead; }, set skyEl(v) { skyEl = v; }, get fallInfo() { return garden.fallInfo(); }, get constK() { return constK; }, get skyHour() { return skyHour; },
  constShown: () => constShown.map((s) => ({ id: s.c.id, name: s.c.name, px: (() => { const v = s.label.position.clone().project(camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight, v.z]; })() })), get poseK() { return poseK; }, korNum, get vowGoal() { return vowGoal; }, get cat() { return catModel; }, catBreath, milky: milkyUni, garden, strollers, npcs, cushions, sound };
