// 정원을 지나다니는 고양이. 스캔 고양이는 누운 채로 굳어 있어 걷는 고양이는 코드로 빚는다
import * as THREE from './vendor/three.min.js';

const COATS = [
  { base: '#8f8d88', stripe: '#3f3d3b', belly: '#e9e4da', ear: '#d9a6a0', eye: 0x8fbf4a },   // 회색 줄무늬
  { base: '#d98c3f', stripe: '#a55a1e', belly: '#f6e6cc', ear: '#eeb4a4', eye: 0xc9b23a },   // 치즈 줄무늬
];
// 사진 속 긴 털 흰 고양이: 납작한 얼굴, 풍성한 가슴털과 꼬리
const WHITE = { fluffy: true, tilt: 0.5, tailUp: -1.15, tailCurl: 0.2 };
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// 긴 털: 같은 몸을 겉으로 조금씩 부풀린 껍질을 겹치고, 껍질마다 털 끝만 남겨 보송하게 만든다
const FUR_SHELLS = 12;
let furTex = null;
function strandTexture() {
  if (furTex) return furTex;
  const n = 64, data = new Uint8Array(n * n * 4);
  for (let i = 0; i < n * n; i++) { const v = 40 + Math.random() * 215; data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = v; data[i * 4 + 3] = 255; }
  furTex = new THREE.DataTexture(data, n, n);
  furTex.wrapS = furTex.wrapT = THREE.RepeatWrapping;
  furTex.magFilter = THREE.NearestFilter; furTex.minFilter = THREE.LinearFilter;
  furTex.needsUpdate = true;
  return furTex;
}
function furMaterial(color, o) {
  const mat = new THREE.MeshLambertMaterial({ color, emissive: 0x5c5b57 });
  mat.onBeforeCompile = (sh) => {
    sh.uniforms.furTex = { value: strandTexture() };
    sh.uniforms.furLen = { value: o.len };
    sh.uniforms.furFace = { value: o.face || 0 };
    sh.uniforms.furLay = { value: new THREE.Vector3(...(o.lay || [0, -0.03, -0.04])) };
    sh.uniforms.furUv = { value: new THREE.Vector2(...(o.uv || [5, 2.5])) };
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float furLen; uniform float furFace; uniform vec3 furLay; uniform vec2 furUv;
        varying float vShell; varying vec2 vFurUv;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vShell = (float(gl_InstanceID) + 1.0) / ${FUR_SHELLS}.0;
        vFurUv = uv * furUv;
        transformed += normal * furLen * (1.0 - furFace * smoothstep(0.45, 0.8, normal.z)) * vShell;
        transformed += furLay * vShell * vShell;`);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        uniform sampler2D furTex; varying float vShell; varying vec2 vFurUv;`)
      .replace('#include <map_fragment>', `#include <map_fragment>
        if (texture2D(furTex, vFurUv).r < vShell) discard;
        diffuseColor.rgb *= mix(0.74, 1.04, vShell);`);
  };
  mat.customProgramCacheKey = () => 'catfur';
  return mat;
}
function addFur(base, o = {}) {
  const shells = new THREE.InstancedMesh(base.geometry, furMaterial(o.color ?? base.material.color, { len: 0.07, ...o }), FUR_SHELLS);
  const one = new THREE.Matrix4();
  for (let i = 0; i < FUR_SHELLS; i++) shells.setMatrixAt(i, one);
  shells.frustumCulled = false;
  base.add(shells);
  return base;
}

function buildFluffy({ mesh, std }) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  body.position.y = 0.5;
  const fur = new THREE.MeshLambertMaterial({ color: 0xffffff, emissive: 0x3a3936 });
  const cream = new THREE.MeshLambertMaterial({ color: 0xf5e8d4, emissive: 0x3a362f });
  const pink = std(new THREE.Color('#eeb7b4'), { roughness: 0.9 });
  const ball = (r, w = 14, h = 10) => new THREE.SphereGeometry(r, w, h);

  addFur(mesh(ball(1, 18, 12).scale(0.3, 0.31, 0.58), fur, 0, 0.04, -0.02, body), { len: 0.11, lay: [0, -0.05, -0.08], uv: [7, 4] });
  const chest = addFur(mesh(ball(0.26), cream, 0, -0.02, 0.33, body), { len: 0.13, color: 0xfff6e8, lay: [0, -0.09, 0.015] }); chest.scale.set(1, 1.12, 0.9);
  addFur(mesh(ball(0.28), fur, 0, 0.03, -0.33, body), { len: 0.12, lay: [0, -0.08, -0.05] });

  // 머리: 둥글고 납작한 얼굴. 얼굴 쪽 털은 짧고 볼과 뒤통수 털은 길다
  const head = new THREE.Group(); head.position.set(0, 0.25, 0.54); body.add(head);
  const skull = addFur(mesh(ball(0.225, 18, 14), fur, 0, 0, 0, head), { len: 0.075, face: 0.72, color: 0xfffaf0, lay: [0, -0.012, -0.03], uv: [6, 3] }); skull.scale.set(1.12, 0.98, 0.86);
  [-1, 1].forEach((s) => { addFur(mesh(ball(0.1, 12, 9), fur, s * 0.135, -0.085, 0.07, head), { len: 0.06, lay: [s * 0.02, -0.03, -0.02], uv: [3, 1.5] }); });
  [-1, 1].forEach((s) => {
    const e = mesh(new THREE.ConeGeometry(0.082, 0.15, 12), fur, s * 0.165, 0.215, -0.015, head); e.rotation.set(-0.05, 0, s * -0.42); e.scale.z = 0.55;
    const i = mesh(new THREE.ConeGeometry(0.056, 0.11, 10), pink, s * 0.163, 0.207, 0.018, head); i.rotation.set(-0.05, 0, s * -0.42); i.scale.z = 0.3;
  });
  const muzzle = addFur(mesh(ball(0.07, 12, 9), cream, 0, -0.078, 0.185, head), { len: 0.016, color: 0xfffbf2, lay: [0, 0, 0], uv: [2, 1] }); muzzle.scale.set(1.2, 0.72, 0.62);
  const nose = mesh(ball(0.022, 8, 6), std(0xe88f9c), 0, -0.048, 0.238, head); nose.scale.set(1.15, 0.72, 0.5);
  const lip = mesh(new THREE.BoxGeometry(0.006, 0.026, 0.006), std(0xc98a8c), 0, -0.076, 0.238, head); lip.rotation.x = 0.1;
  const eye = std(0x8d8a45, { roughness: 0.2 }), pupil = std(0x15120d, { roughness: 0.15 }), shine = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const white = new THREE.MeshBasicMaterial({ color: 0xf4f2ec });
  [-1, 1].forEach((s) => {
    const a = mesh(ball(0.053), eye, s * 0.098, 0.022, 0.19, head); a.scale.z = 0.55;
    const b = mesh(ball(0.035, 12, 8), pupil, s * 0.098, 0.022, 0.212, head); b.scale.z = 0.5;
    mesh(ball(0.009, 6, 5), shine, s * 0.098 + 0.012, 0.04, 0.228, head);
    for (const k of [-1, 0, 1]) {
      const w = mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.3, 3), white, s * 0.2, -0.08 + k * 0.016, 0.17, head);
      w.rotation.z = s * (Math.PI / 2 + k * 0.17 + 0.1);
    }
  });

  // 굵고 짧은 다리와 털 많은 발
  const legGeo = new THREE.CapsuleGeometry(0.075, 0.24, 4, 10), pawGeo = ball(0.092, 12, 9);
  const legs = [[-0.145, 0.33, 0], [0.145, 0.33, Math.PI], [-0.155, -0.34, Math.PI], [0.155, -0.34, 0]].map(([x, z, ph]) => {
    const pivot = new THREE.Group(); pivot.position.set(x, -0.08, z); body.add(pivot);
    addFur(mesh(legGeo, fur, 0, -0.17, 0, pivot), { len: 0.05, lay: [0, -0.02, -0.01], uv: [3, 3] });
    const paw = addFur(mesh(pawGeo, fur, 0, -0.35, 0.03, pivot), { len: 0.028, lay: [0, 0, 0.01], uv: [2.5, 1.2] }); paw.scale.set(0.95, 0.56, 1.25);
    return { pivot, ph, front: z > 0 };
  });

  // 풍성한 꼬리
  const tail = [];
  let parent = new THREE.Group(); parent.position.set(0, 0.16, -0.7); body.add(parent);
  const radii = [0.085, 0.1, 0.105, 0.095, 0.08, 0.055];
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    if (i) g.position.y = 0.17;
    parent.add(g);
    const r = radii[i];
    const seg = addFur(mesh(ball(r, 10, 8), fur, 0, 0.085, 0, g), { len: 0.075 + r * 0.45, lay: [0, 0.03, -0.01], uv: [3, 2] }); seg.scale.y = 1.6;
    tail.push(g); parent = g;
  }
  return { root, body, head, legs, tail };
}

function buildCat(coat, { mesh, std, canvasTex }) {
  const root = new THREE.Group(), body = new THREE.Group(); root.add(body);
  body.position.y = 0.5;
  const fur = std(new THREE.Color(coat.base), { roughness: 0.95 });
  const belly = std(new THREE.Color(coat.belly), { roughness: 0.95 });
  const dark = std(new THREE.Color(coat.stripe), { roughness: 0.95 });
  const tex = canvasTex(256, 128, (g, w, h) => {
    g.fillStyle = coat.base; g.fillRect(0, 0, w, h);
    g.strokeStyle = coat.stripe; g.lineCap = 'round';
    for (let i = 0; i < 11; i++) {
      const y = 8 + (i / 11) * (h - 12);
      g.lineWidth = 5 + (i % 3) * 2;
      [[0, 0.3], [0.5, 0.8]].forEach(([a, b]) => { g.beginPath(); g.moveTo(a * w, y); g.quadraticCurveTo(((a + b) / 2) * w, y + 9, b * w, y); g.stroke(); });
    }
  });
  const coatMat = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95 });

  const torso = mesh(new THREE.CapsuleGeometry(0.2, 0.62, 6, 16), coatMat, 0, 0, 0, body); torso.rotation.x = Math.PI / 2;
  const under = mesh(new THREE.SphereGeometry(0.18, 12, 10), belly, 0, -0.07, 0.02, body); under.scale.set(0.9, 0.7, 2.1);
  mesh(new THREE.SphereGeometry(0.205, 14, 12), fur, 0, 0.02, 0.32, body);
  mesh(new THREE.SphereGeometry(0.215, 14, 12), fur, 0, 0.02, -0.33, body);

  // 머리
  const head = new THREE.Group(); head.position.set(0, 0.24, 0.5); body.add(head);
  const skull = mesh(new THREE.SphereGeometry(0.19, 18, 14), fur, 0, 0, 0, head); skull.scale.set(1.08, 0.94, 0.96);
  const earIn = std(new THREE.Color(coat.ear), { roughness: 0.9 });
  [-1, 1].forEach((s) => {
    const e = mesh(new THREE.ConeGeometry(0.075, 0.16, 4), fur, s * 0.115, 0.17, -0.02, head); e.rotation.set(-0.08, 0.78, s * -0.18);
    const i = mesh(new THREE.ConeGeometry(0.044, 0.1, 4), earIn, s * 0.113, 0.16, 0.012, head); i.rotation.set(-0.08, 0.78, s * -0.18);
  });
  const muzzle = mesh(new THREE.SphereGeometry(0.085, 12, 9), belly, 0, -0.055, 0.145, head); muzzle.scale.set(1.15, 0.72, 0.8);
  mesh(new THREE.SphereGeometry(0.018, 8, 6), std(0xd97f88), 0, -0.024, 0.205, head);
  const eye = std(coat.eye, { roughness: 0.25 }), pupil = std(0x121214, { roughness: 0.2 });
  [-1, 1].forEach((s) => {
    const a = mesh(new THREE.SphereGeometry(0.033, 10, 8), eye, s * 0.078, 0.03, 0.15, head); a.scale.z = 0.6;
    const b = mesh(new THREE.SphereGeometry(0.018, 8, 6), pupil, s * 0.08, 0.03, 0.168, head); b.scale.set(0.55, 1.2, 0.5);
    for (const k of [-1, 0, 1]) {
      const w = mesh(new THREE.CylinderGeometry(0.0025, 0.0025, 0.17, 3), belly, s * 0.13, -0.05 + k * 0.012, 0.15, head);
      w.rotation.z = s * (Math.PI / 2 + k * 0.14);
    }
  });
  // 이마의 줄무늬
  [-0.045, 0, 0.045].forEach((x) => { const st = mesh(new THREE.BoxGeometry(0.018, 0.09, 0.012), dark, x, 0.135, 0.125, head); st.rotation.x = -0.65; });

  // 다리
  const legGeo = new THREE.CapsuleGeometry(0.055, 0.28, 4, 8), pawGeo = new THREE.SphereGeometry(0.07, 10, 7);
  const legs = [[-0.12, 0.33, 0], [0.12, 0.33, Math.PI], [-0.13, -0.34, Math.PI], [0.13, -0.34, 0]].map(([x, z, ph]) => {
    const pivot = new THREE.Group(); pivot.position.set(x, -0.08, z); body.add(pivot);
    mesh(legGeo, fur, 0, -0.17, 0, pivot);
    const paw = mesh(pawGeo, belly, 0, -0.35, 0.025, pivot); paw.scale.set(0.9, 0.55, 1.25);
    return { pivot, ph, front: z > 0 };
  });

  // 꼬리
  const tail = [];
  let parent = new THREE.Group(); parent.position.set(0, 0.1, -0.52); body.add(parent);
  const segGeo = new THREE.CapsuleGeometry(0.043, 0.12, 4, 8);
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Group();
    if (i) g.position.y = 0.15;
    parent.add(g);
    mesh(segGeo, i % 2 ? dark : fur, 0, 0.075, 0, g);
    tail.push(g); parent = g;
  }
  return { root, body, head, legs, tail };
}

/* 고양이 길찾기: 정원을 격자로 나눠 물체가 있는 칸을 막고, 그 사이로 갈 수 있는 길을 찾는다 */
const CELL = 0.5;
const segNear = (a, b, x, z) => {
  const ux = b[0] - a[0], uz = b[1] - a[1], k = Math.max(0, Math.min(1, ((x - a[0]) * ux + (z - a[1]) * uz) / (ux * ux + uz * uz || 1)));
  return Math.hypot(a[0] + ux * k - x, a[1] + uz * k - z);
};
export class CatNav {
  constructor(b, blocked, seed, isEdge) {
    this.b = b;
    this.nx = Math.ceil((b.xMax - b.xMin) / CELL); this.nz = Math.ceil((b.zMax - b.zMin) / CELL);
    const n = this.nx * this.nz;
    this.open = new Uint8Array(n); this.reach = new Uint8Array(n); this.from = new Int32Array(n);
    for (let i = 0; i < n; i++) { const [x, z] = this.center(i); this.open[i] = blocked(x, z) ? 0 : 1; }
    // 정원 안쪽과 이어진 칸만 쓴다. 울타리로 막힌 곳에는 들어가지 않는다
    const s0 = this.nearestOpen(seed[0], seed[1]);
    const stack = s0 < 0 ? [] : [s0];
    if (s0 >= 0) this.reach[s0] = 1;
    while (stack.length) {
      const i = stack.pop();
      for (const j of this.neighbors(i)) if (!this.reach[j]) { this.reach[j] = 1; stack.push(j); }
    }
    this.cells = []; this.edges = []; this.roomy = [];
    for (let i = 0; i < n; i++) {
      if (!this.reach[i]) continue;
      const [x, z] = this.center(i);
      this.cells.push(i);
      if (isEdge(x, z)) this.edges.push(i);
      else if (this.neighbors(i).length === 8) this.roomy.push(i);
    }
  }
  center(i) { const iz = Math.floor(i / this.nx), ix = i - iz * this.nx; return [this.b.xMin + (ix + 0.5) * CELL, this.b.zMin + (iz + 0.5) * CELL]; }
  index(x, z) {
    const ix = Math.floor((x - this.b.xMin) / CELL), iz = Math.floor((z - this.b.zMin) / CELL);
    return ix < 0 || iz < 0 || ix >= this.nx || iz >= this.nz ? -1 : iz * this.nx + ix;
  }
  // 대각선은 양옆이 모두 뚫렸을 때만 지난다
  neighbors(i) {
    const out = [], { nx, nz, open } = this, iz = Math.floor(i / nx), ix = i - iz * nx;
    const ok = (a, c) => a >= 0 && c >= 0 && a < nx && c < nz && open[c * nx + a];
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (ok(ix + dx, iz + dz)) out.push((iz + dz) * nx + ix + dx);
    for (const [dx, dz] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) if (ok(ix + dx, iz + dz) && ok(ix + dx, iz) && ok(ix, iz + dz)) out.push((iz + dz) * nx + ix + dx);
    return out;
  }
  nearestOpen(x, z) {
    let best = -1, bd = Infinity;
    for (let i = 0; i < this.open.length; i++) {
      if (!this.open[i]) continue;
      const [cx, cz] = this.center(i), d = (cx - x) ** 2 + (cz - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  free(x, z) { const i = this.index(x, z); return i >= 0 && this.reach[i] === 1; }
  // 가까운 갈 수 있는 칸. 없으면 -1
  snap(x, z, within = 3) {
    if (this.free(x, z)) return this.index(x, z);
    let best = -1, bd = within * within;
    for (const i of this.cells) {
      const [cx, cz] = this.center(i), d = (cx - x) ** 2 + (cz - z) ** 2;
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  sees(a, b) {
    const d = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(d / 0.2);
    for (let k = 1; k < n; k++) if (!this.free(a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n)) return false;
    return true;
  }
  pick(list) { return list.length ? this.center(list[Math.floor(Math.random() * list.length)]) : null; }
  // 길찾기: 칸을 따라 찾은 뒤, 직선으로 이어지는 곳은 줄여 자연스럽게 걷게 한다
  path(a, b, around = []) {
    const s = this.snap(a[0], a[1]), g = this.snap(b[0], b[1]);
    if (s < 0 || g < 0) return null;
    const { from } = this;
    from.fill(-1); from[s] = s;
    const q = [s];
    for (let h = 0; h < q.length && from[g] < 0; h++) {
      for (const j of this.neighbors(q[h])) {
        if (from[j] >= 0 || !this.reach[j]) continue;
        if (around.length) { const [cx, cz] = this.center(j); if (around.some(([ox, oz]) => Math.hypot(cx - ox, cz - oz) < 1.3)) continue; }
        from[j] = q[h]; q.push(j);
      }
    }
    if (from[g] < 0) return null;
    const raw = [];
    for (let i = g; ; i = from[i]) { raw.push(this.center(i)); if (i === s) break; }
    raw.reverse();
    const out = [raw[0]];
    let k = 0;
    const clear = (u, v) => this.sees(u, v) && (!around.length || !around.some(([ox, oz]) => segNear(u, v, ox, oz) < 1.3));
    while (k < raw.length - 1) {
      let m = raw.length - 1;
      while (m > k + 1 && !clear(raw[k], raw[m])) m--;
      out.push(raw[m]); k = m;
    }
    return out;
  }
}

// 고양이 밥그릇
export function makeDish({ mesh, std }, scene) {
  const g = new THREE.Group();
  mesh(new THREE.CylinderGeometry(0.2, 0.15, 0.085, 22), std(0xd9d2c3, { roughness: 0.45 }), 0, 0.045, 0, g);
  const food = mesh(new THREE.SphereGeometry(0.165, 16, 8), std(0x9a6a3c, { roughness: 0.95 }), 0, 0.075, 0, g); food.scale.y = 0.22;
  g.visible = false; scene.add(g);
  return g;
}

export class Cat {
  constructor(coatIdx, kit, firstWait) {
    this.coat = coatIdx === 2 ? WHITE : COATS[coatIdx];
    Object.assign(this, this.coat.fluffy ? buildFluffy(kit) : buildCat(this.coat, kit));
    this.root.visible = false; kit.scene.add(this.root);
    const shadowTex = kit.canvasTex(64, 64, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, 'rgba(0,0,0,.42)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    });
    const blob = kit.mesh(new THREE.PlaneGeometry(0.85, 1.55), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), 0, 0.012, 0, this.root);
    blob.rotation.x = -Math.PI / 2;
    this.wait = firstWait; this.eatK = 0; this.eatTo = 0; this.food = null; this.eating = false; this.walkK = 0; this.sitK = 0; this.phase = Math.random() * 6; this.scale = 0; this.route = null; this.trips = 0;
  }

  hide(wait) {
    this.route = null; this.root.visible = false; this.wait = wait; this.pause = 0; this.fadeOut = false;
    this.food = null; this.eating = false; this.eatTo = 0; this.eatK = 0;
  }

  // 밥그릇으로 불러온다. 멀리 있거나 숨어 있으면 근처에서 나타난다
  callFood(food, near, nav) {
    const far = !this.route || Math.hypot(this.x - food.x, this.z - food.z) > 11 || !nav.free(this.x, this.z);
    if (far) { this.x = near[0]; this.z = near[1]; this.scale = 0; this.yaw = Math.atan2(food.x - this.x, food.z - this.z); }
    const way = nav.path([this.x, this.z], [food.x, food.z]);
    this.route = way && way.length > 1 ? [[this.x, this.z], ...way.slice(1, -1), [food.x, food.z]] : [[this.x, this.z], [food.x, food.z]];
    this.i = 1; this.retries = 0; this.fadeOut = false;
    this.food = food; this.eating = false; this.eatTo = 0;
    this.pause = 0; this.sitTo = 0; this.bestD = Infinity; this.bestAt = this.clock || 0; this.trips++;
    this.root.visible = true;
  }

  update(dt, env) {
    // 느린 기기에서도 걸음과 시간이 어긋나지 않게 자기 시계로 잰다
    this.clock = (this.clock || 0) + dt;
    const t = this.clock;
    if (!this.route) {
      this.wait -= dt;
      if (this.wait > 0) return;
      const r = env.route();
      if (!r) { this.wait = 10; return; }
      this.route = r.points; this.i = 1;
      this.x = r.points[0][0]; this.z = r.points[0][1];
      this.yaw = Math.atan2(r.points[1][0] - this.x, r.points[1][1] - this.z);
      this.pause = 0; this.sitTo = 0; this.bestD = Infinity; this.bestAt = t; this.tripAt = t; this.scale = 0; this.trips++; this.retries = 0;
      this.root.visible = true;
    }
    // 길이 끝내 막혔거나 너무 오래 헤매면 작아지며 조용히 사라진다
    if (this.fadeOut) {
      this.scale -= dt / 0.6;
      if (this.scale <= 0) { this.hide(env.nextWait()); return; }
      this.root.scale.setScalar(0.88 * this.scale);
      return;
    }
    if (!this.food && t - this.tripAt > 300) { this.fades = (this.fades || 0) + 1; this.fadeOut = true; return; }
    const [wx, wz] = this.route[this.i], last = this.i === this.route.length - 1;
    const dx = wx - this.x, dz = wz - this.z, d = Math.hypot(dx, dz);
    let moving = 0;
    const running = this.food && !this.eating;
    if (this.eating) {
      this.yaw += wrap(Math.atan2(this.food.dx - this.x, this.food.dz - this.z) - this.yaw) * (1 - Math.exp(-6 * dt));
      if (t > this.food.until) {
        this.eating = false; this.food = null; this.eatTo = 0;
        const out = env.nav().path([this.x, this.z], env.exit());
        if (!out || out.length < 2) { this.hide(env.nextWait()); return; }
        this.route = out; this.i = 1; this.retries = 0; this.tripAt = t; this.bestD = Infinity; this.bestAt = t;
      }
    } else if (this.eatK > 0.1) {
      // 고개를 드는 중
    } else if (this.pause > 0) {
      this.pause -= dt;
      // 사람이 바짝 다가오면 일어나 자리를 뜬다
      if (env.people().some((p) => Math.hypot(p.x - this.x, p.z - this.z) < 1.3)) this.pause = 0;
      if (this.pause <= 0) this.sitTo = 0;
    } else if (this.sitK > 0.1) {
      // 일어나는 중
    } else if (d < (running && last ? 0.22 : 0.4)) {
      if (running && last) { this.eating = true; this.eatTo = 1; this.food.until = t + this.food.eat; }
      else if (last) { this.hide(env.nextWait()); return; }
      else {
      const stop = this.route[this.i][2];
      this.i++; this.bestD = Infinity; this.bestAt = t; this.retries = 0;
      if (stop && Math.random() < 0.5) {
        this.pause = 1.5 + Math.random() * 5;
        this.sitTo = this.pause > 2.5 ? 1 : 0;
        this.lookAt = (Math.random() - 0.5) * 1.6;
      }
      }
    } else {
      // 길을 따라가며 사람과 다른 고양이는 그때그때 비켜 간다
      let vx = dx / d, vz = dz / d;
      const side = this.i % 2 ? 1 : -1;
      const avoid = (ox, oz, R, gain) => {
        const ax = this.x - ox, az = this.z - oz, D = Math.hypot(ax, az) || 0.001, gap = D - R;
        if (gap > 0.9) return;
        const k = (0.9 - Math.max(0, gap)) / 0.9;
        vx += (ax / D) * k * gain - (az / D) * k * side * gain;
        vz += (az / D) * k * gain + (ax / D) * k * side * gain;
      };
      if (!running || d > 1.3) for (const p of env.people()) avoid(p.x, p.z, 0.75, 1.3);
      for (const o of env.cats()) if (o !== this && o.route && !(running && d < 1)) avoid(o.x, o.z, 0.75, 0.9);
      const to = Math.atan2(vx, vz);
      // 그릇 앞에서는 속도를 줄이고 바로 틀어 그 자리를 맴돌지 않는다
      const close = running && d < 1.2;
      this.yaw += wrap(to - this.yaw) * (1 - Math.exp(-(close ? 16 : 7) * dt));
      const sp = (running ? Math.min(2.3, 0.6 + d * 1.5) : 1.05) * dt;
      const mx = Math.sin(this.yaw) * sp, mz = Math.cos(this.yaw) * sp, nav = env.nav();
      // 막힌 칸으로는 들어가지 않고 옆으로 미끄러진다
      if (nav.free(this.x + mx, this.z + mz) || !nav.free(this.x, this.z)) { this.x += mx; this.z += mz; }
      else if (nav.free(this.x + mx, this.z)) this.x += mx;
      else if (nav.free(this.x, this.z + mz)) this.z += mz;
      moving = 1;
      if (d < this.bestD - 0.2) { this.bestD = d; this.bestAt = t; }
      if (t - this.bestAt > (running ? 3.5 : 6)) {
        // 사람에게 막혔으면 길을 다시 찾는다. 밥그릇으로 가던 길이 막히면 그 앞에 다시 나타난다
        const goal = this.route[this.route.length - 1];
        const around = [...env.people().map((p) => [p.x, p.z]), ...env.cats().filter((o) => o !== this && o.route).map((o) => [o.x, o.z])];
        const again = !running && this.retries < 3 ? nav.path([this.x, this.z], goal, around) : null;
        if (running) { if (d > 1.5) { this.x = wx; this.z = wz; this.scale = 0; } this.eating = true; this.eatTo = 1; this.food.until = t + this.food.eat; }
        else if (again && again.length > 1) { this.route = again; this.i = 1; this.retries++; }
        else { this.fades = (this.fades || 0) + 1; this.fadeOut = true; return; }
        this.bestD = Infinity; this.bestAt = t;
      }
    }
    this.scale = Math.min(1, this.scale + dt / 0.7);
    const end = last && !this.food ? Math.min(1, d / 1.2) : 1;
    this.root.scale.setScalar(0.88 * Math.min(this.scale, end));
    this.root.position.set(this.x, env.y(this.z), this.z);
    this.root.rotation.y = this.yaw;

    this.walkK = damp(this.walkK, moving, 8, dt);
    this.sitK = damp(this.sitK, this.sitTo, 4, dt);
    this.eatK = damp(this.eatK, this.eatTo, 4, dt);
    this.phase += dt * (running ? 13 : 7.5) * moving;
    const W = this.walkK, S = this.sitK, E = this.eatK;
    this.body.position.y = 0.5 - 0.16 * S - 0.07 * E + Math.abs(Math.sin(this.phase)) * 0.012 * W;
    this.body.rotation.x = -0.72 * S + 0.3 * E;
    this.body.rotation.z = Math.sin(this.phase) * 0.018 * W;
    for (const l of this.legs) {
      const swing = Math.sin(this.phase + l.ph) * 0.48 * W;
      if (l.front) { l.pivot.rotation.x = swing + 0.72 * S - 0.3 * E; l.pivot.scale.y = 1 + 0.46 * S - 0.3 * E; }
      else { l.pivot.rotation.x = swing - 0.82 * S - 0.3 * E; l.pivot.scale.y = 1 + 0.1 * E; }
    }
    // 앉으면 고개를 돌려 둘러본다
    const look = this.pause > 0 ? (this.lookAt || 0) * (0.7 + 0.3 * Math.sin(t * 0.7)) : 0;
    this.head.rotation.y = damp(this.head.rotation.y, look, 3, dt);
    this.head.rotation.x = 0.72 * S + Math.sin(this.phase * 0.5) * 0.035 * W + E * (0.62 + Math.sin(t * 9) * 0.07);
    this.head.rotation.z = damp(this.head.rotation.z, (this.coat.tilt || 0) * S, 2.5, dt);   // 앉으면 고개를 갸웃한다
    // 걸을 때는 꼬리를 세우고, 앉으면 내려 땅 위로 뒤에 놓는다
    const up = this.coat.tailUp ?? -0.55, curl = this.coat.tailCurl ?? 0.1;
    this.tail.forEach((g, i) => {
      const k = i / 5;
      g.rotation.x = i === 0 ? up * (1 - S) - 1.3 * S : (curl + 0.08 * k) * (1 - S) + 0.32 * S * (i < 3 ? 1 : 0.2);
      g.rotation.z = Math.sin(t * 1.9 + i * 0.75) * (0.1 + 0.11 * k);
    });
  }
}
