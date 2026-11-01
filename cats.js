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
    this.route = null; this.root.visible = false; this.wait = wait; this.pause = 0;
    this.food = null; this.eating = false; this.eatTo = 0; this.eatK = 0;
  }

  // 밥그릇으로 불러온다. 멀리 있거나 숨어 있으면 근처에서 나타난다
  callFood(food, near) {
    const far = !this.route || Math.hypot(this.x - food.x, this.z - food.z) > 11;
    if (far) { this.x = near[0]; this.z = near[1]; this.scale = 0; this.yaw = Math.atan2(food.x - this.x, food.z - this.z); }
    this.route = [[this.x, this.z], [food.x, food.z]]; this.i = 1;
    this.food = food; this.eating = false; this.eatTo = 0;
    this.pause = 0; this.sitTo = 0; this.bestD = Infinity; this.bestAt = performance.now() / 1000; this.trips++;
    this.root.visible = true;
  }

  update(dt, t, env) {
    if (!this.route) {
      this.wait -= dt;
      if (this.wait > 0) return;
      const r = env.route();
      this.route = r.points; this.i = 1;
      this.x = r.points[0][0]; this.z = r.points[0][1];
      this.yaw = Math.atan2(r.points[1][0] - this.x, r.points[1][1] - this.z);
      this.pause = 0; this.sitTo = 0; this.bestD = Infinity; this.bestAt = t; this.scale = 0; this.trips++;
      this.root.visible = true;
    }
    const [wx, wz] = this.route[this.i], last = this.i === this.route.length - 1;
    const dx = wx - this.x, dz = wz - this.z, d = Math.hypot(dx, dz);
    let moving = 0;
    const running = this.food && !this.eating;
    if (this.eating) {
      this.yaw += wrap(Math.atan2(this.food.dx - this.x, this.food.dz - this.z) - this.yaw) * (1 - Math.exp(-6 * dt));
      if (t > this.food.until) {
        this.eating = false; this.food = null; this.eatTo = 0;
        this.route = [[this.x, this.z], env.exit()]; this.i = 1; this.bestD = Infinity; this.bestAt = t;
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
    } else if (d < (running ? 0.16 : 0.5)) {
      if (running) { this.eating = true; this.eatTo = 1; }
      else if (last) { this.hide(env.nextWait()); return; }
      else {
      this.i++; this.bestD = Infinity; this.bestAt = t;
      if (Math.random() < 0.5) {
        this.pause = 1.5 + Math.random() * 5;
        this.sitTo = this.pause > 2.5 ? 1 : 0;
        this.lookAt = (Math.random() - 0.5) * 1.6;
      }
      }
    } else {
      // 목적지로 가면서 물체와 사람을 피한다
      let vx = dx / d, vz = dz / d;
      const side = this.i % 2 ? 1 : -1;
      const avoid = (ox, oz, R, gain) => {
        const ax = this.x - ox, az = this.z - oz, D = Math.hypot(ax, az) || 0.001, gap = D - R;
        if (gap > 1.1) return;
        const k = (1.1 - Math.max(0, gap)) / 1.1;
        vx += (ax / D) * k * gain - (az / D) * k * side * gain;
        vz += (az / D) * k * gain + (ax / D) * k * side * gain;
        if (gap < 0) { this.x = ox + (ax / D) * R; this.z = oz + (az / D) * R; }
      };
      for (const [ox, oz, R, low] of env.obstacles) if (!low) avoid(ox, oz, R + 0.15, 1.3);
      const big = env.big?.(this.x, this.z);
      if (big) avoid(big[0], big[1], big[2], 1.6);
      if (!running || d > 1.3) for (const p of env.people()) avoid(p.x, p.z, 0.75, 1.3);
      const to = Math.atan2(vx, vz);
      this.yaw += wrap(to - this.yaw) * (1 - Math.exp(-5 * dt));
      const sp = (running ? 2.3 : 1.05) * dt;
      this.x += Math.sin(this.yaw) * sp; this.z += Math.cos(this.yaw) * sp;
      moving = 1;
      if (d < this.bestD - 0.25) { this.bestD = d; this.bestAt = t; }
      if (t - this.bestAt > 7) {
        // 막혔으면 다음 지점으로, 마지막이면 조용히 사라진다
        if (running && d < 1.5) { this.eating = true; this.eatTo = 1; this.bestAt = t; }
        else if (last) { this.hide(env.nextWait()); return; }
        else
        this.i++; this.bestD = Infinity; this.bestAt = t;
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
