// 정원을 지나다니는 고양이. 스캔 고양이는 누운 채로 굳어 있어 걷는 고양이는 코드로 빚는다
import * as THREE from './vendor/three.min.js';

const COATS = [
  { base: '#8f8d88', stripe: '#3f3d3b', belly: '#e9e4da', ear: '#d9a6a0', eye: 0x8fbf4a },   // 회색 줄무늬
  { base: '#d98c3f', stripe: '#a55a1e', belly: '#f6e6cc', ear: '#eeb4a4', eye: 0xc9b23a },   // 치즈 줄무늬
];
const damp = (a, b, k, dt) => a + (b - a) * (1 - Math.exp(-k * dt));
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

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

export class Cat {
  constructor(coatIdx, kit, firstWait) {
    Object.assign(this, buildCat(COATS[coatIdx], kit));
    this.root.visible = false; kit.scene.add(this.root);
    const shadowTex = kit.canvasTex(64, 64, (g, w) => {
      const r = g.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2);
      r.addColorStop(0, 'rgba(0,0,0,.42)'); r.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = r; g.fillRect(0, 0, w, w);
    });
    const blob = kit.mesh(new THREE.PlaneGeometry(0.85, 1.55), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false }), 0, 0.012, 0, this.root);
    blob.rotation.x = -Math.PI / 2;
    this.wait = firstWait; this.walkK = 0; this.sitK = 0; this.phase = Math.random() * 6; this.scale = 0; this.route = null; this.trips = 0;
  }

  hide(wait) {
    this.route = null; this.root.visible = false; this.wait = wait; this.pause = 0;
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
    if (this.pause > 0) {
      this.pause -= dt;
      // 사람이 바짝 다가오면 일어나 자리를 뜬다
      if (env.people().some((p) => Math.hypot(p.x - this.x, p.z - this.z) < 1.3)) this.pause = 0;
      if (this.pause <= 0) this.sitTo = 0;
    } else if (this.sitK > 0.1) {
      // 일어나는 중
    } else if (d < 0.5) {
      if (last) { this.hide(env.nextWait()); return; }
      this.i++; this.bestD = Infinity; this.bestAt = t;
      if (Math.random() < 0.5) {
        this.pause = 1.5 + Math.random() * 5;
        this.sitTo = this.pause > 2.5 ? 1 : 0;
        this.lookAt = (Math.random() - 0.5) * 1.6;
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
      for (const p of env.people()) avoid(p.x, p.z, 0.75, 1.3);
      const to = Math.atan2(vx, vz);
      this.yaw += wrap(to - this.yaw) * (1 - Math.exp(-5 * dt));
      const sp = 1.05 * dt;
      this.x += Math.sin(this.yaw) * sp; this.z += Math.cos(this.yaw) * sp;
      moving = 1;
      if (d < this.bestD - 0.25) { this.bestD = d; this.bestAt = t; }
      if (t - this.bestAt > 7) {
        // 막혔으면 다음 지점으로, 마지막이면 조용히 사라진다
        if (last) { this.hide(env.nextWait()); return; }
        this.i++; this.bestD = Infinity; this.bestAt = t;
      }
    }
    this.scale = Math.min(1, this.scale + dt / 0.7);
    const end = last ? Math.min(1, d / 1.2) : 1;
    this.root.scale.setScalar(0.88 * Math.min(this.scale, end));
    this.root.position.set(this.x, env.y(this.z), this.z);
    this.root.rotation.y = this.yaw;

    this.walkK = damp(this.walkK, moving, 8, dt);
    this.sitK = damp(this.sitK, this.sitTo, 4, dt);
    this.phase += dt * 7.5 * moving;
    const W = this.walkK, S = this.sitK;
    this.body.position.y = 0.5 - 0.16 * S + Math.abs(Math.sin(this.phase)) * 0.012 * W;
    this.body.rotation.x = -0.72 * S;
    this.body.rotation.z = Math.sin(this.phase) * 0.018 * W;
    for (const l of this.legs) {
      const swing = Math.sin(this.phase + l.ph) * 0.48 * W;
      if (l.front) { l.pivot.rotation.x = swing + 0.72 * S; l.pivot.scale.y = 1 + 0.46 * S; }
      else l.pivot.rotation.x = swing - 0.82 * S;
    }
    // 앉으면 고개를 돌려 둘러본다
    const look = this.pause > 0 ? (this.lookAt || 0) * (0.7 + 0.3 * Math.sin(t * 0.7)) : 0;
    this.head.rotation.y = damp(this.head.rotation.y, look, 3, dt);
    this.head.rotation.x = 0.72 * S + Math.sin(this.phase * 0.5) * 0.035 * W;
    // 걸을 때는 꼬리를 세우고, 앉으면 내려 뒤로 뻗는다
    this.tail.forEach((g, i) => {
      const k = i / 5;
      g.rotation.x = i === 0 ? -0.55 + 2.1 * S : (0.1 + 0.08 * k) * (1 - S) + 0.2 * S * (i < 3 ? 1 : -0.4);
      g.rotation.z = Math.sin(t * 1.9 + i * 0.75) * (0.1 + 0.11 * k);
    });
  }
}
