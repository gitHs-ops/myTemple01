import * as THREE from './vendor/three.min.js';

export const GROUND_Y = -0.9;
export const POND = { x: -8, z: 30 };
export const pondR = (a) => 7 + 1.1 * Math.sin(2 * a + 1) + 0.7 * Math.sin(3 * a + 0.4) + 0.4 * Math.sin(5 * a);
export const GARDEN_BOUNDS = { xMin: -21, xMax: 21, zMin: 14.5, zMax: 47 };

const TOWER_SITES = [[12, 24.5], [14.6, 28], [12, 31.5], [14.6, 35]];
const PER_TOWER = 16;
const MAX_STONES = TOWER_SITES.length * PER_TOWER;

const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};

export function buildGarden({ scene, mesh, std, canvasTex, seatGroup }) {
  const rnd = seeded(2610);
  const r = (a, b) => a + rnd() * (b - a);
  const root = new THREE.Group(); scene.add(root);
  const colliders = [[8.5, 19, 2.6]];
  const lamb = (color, o = {}) => new THREE.MeshLambertMaterial({ color, ...o });
  const dummy = new THREE.Object3D();

  // 잔디와 흙길
  const lawnTex = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#7f9f62'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 2600; i++) {
      g.fillStyle = `hsl(${85 + Math.random() * 25},${28 + Math.random() * 16}%,${34 + Math.random() * 20}%)`;
      g.fillRect(Math.random() * w, Math.random() * h, 1.6, 3.4);
    }
  }, [16, 16]);
  const lawn = mesh(new THREE.PlaneGeometry(56, 46), lamb(0xffffff, { map: lawnTex }), 0, GROUND_Y + 0.012, 31, root);
  lawn.rotation.x = -Math.PI / 2;

  // 연못
  const shape = new THREE.Shape();
  const N = 72;
  for (let i = 0; i <= N; i++) {
    const a = (i / N) * Math.PI * 2, R = pondR(a);
    const x = Math.sin(a) * R, y = Math.cos(a) * R;
    if (i) shape.lineTo(x, y); else shape.moveTo(x, y);
  }
  const pondGeo = new THREE.ShapeGeometry(shape, 32);
  const place = (m, y) => { m.rotation.x = Math.PI / 2; m.position.set(POND.x, y, POND.z); root.add(m); return m; };
  const bedMat = lamb(0x2f4a44, { side: THREE.DoubleSide });
  place(new THREE.Mesh(pondGeo, bedMat), GROUND_Y + 0.03);
  const water = {
    time: { value: 0 }, sky: { value: new THREE.Color(0xbfd8e6) }, deep: { value: new THREE.Color(0x2d6a68) }, ripple: { value: new THREE.Vector4(0, 0, -100, 0) },
  };
  const waterMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false, uniforms: water,
    vertexShader: 'varying vec3 w; void main(){ vec4 p = modelMatrix * vec4(position,1.0); w = p.xyz; gl_Position = projectionMatrix * viewMatrix * p; }',
    fragmentShader: `uniform float time; uniform vec3 sky; uniform vec3 deep; uniform vec4 ripple; varying vec3 w;
      void main(){
        vec2 p = w.xz;
        vec2 n = vec2(
          cos(p.x*1.3+time*0.7)*0.5 + cos((p.x+p.y)*2.9-time*1.1)*0.3 + cos((p.x-p.y*0.6)*6.1+time*1.7)*0.14,
          cos(p.y*1.1-time*0.6)*0.5 + cos((p.y-p.x)*2.6+time*0.9)*0.3 + cos((p.y+p.x*0.7)*5.3-time*1.5)*0.14);
        float age = time - ripple.z;
        if (age > 0.0 && age < 4.0) {
          vec2 d = p - ripple.xy; float l = length(d) + 0.001;
          n += (d/l) * sin(l*7.0 - age*7.0) * exp(-abs(l-age*1.1)*2.2) * (1.0-age/4.0) * 2.4;
        }
        vec3 v = normalize(cameraPosition - w);
        vec3 nor = normalize(vec3(n.x*0.075, 1.0, n.y*0.075));
        float f = pow(1.0 - max(dot(v, nor), 0.0), 2.6);
        vec3 h = normalize(normalize(vec3(0.3,0.8,0.5)) + v);
        float s = pow(max(dot(nor, h), 0.0), 170.0);
        vec3 col = mix(deep, sky, 0.2 + f*0.8) + s*vec3(1.0,0.95,0.85)*0.75;
        gl_FragColor = vec4(col, 0.46 + f*0.42);
        #include <colorspace_fragment>
      }`,
  });
  const waterMesh = place(new THREE.Mesh(pondGeo, waterMat), GROUND_Y + 0.12);
  waterMesh.renderOrder = 2;

  // 연못 둘레 돌
  const rockGeo = new THREE.DodecahedronGeometry(1, 0);
  const rims = new THREE.InstancedMesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), 74);
  const col = new THREE.Color();
  for (let i = 0; i < 74; i++) {
    const a = (i / 74) * Math.PI * 2, R = pondR(a) + r(0, 0.14);
    dummy.position.set(POND.x + Math.sin(a) * R, GROUND_Y + 0.08, POND.z + Math.cos(a) * R);
    dummy.scale.set(r(0.34, 0.56), r(0.14, 0.26), r(0.34, 0.56));
    dummy.rotation.set(r(0, 1), r(0, 6), r(0, 1)); dummy.updateMatrix();
    rims.setMatrixAt(i, dummy.matrix); rims.setColorAt(i, col.setHSL(0.09, 0.05, r(0.48, 0.66)));
  }
  root.add(rims);

  // 연잎과 연꽃
  const inPond = (spread) => {
    const a = r(0, 6.28), R = pondR(a) * Math.sqrt(rnd()) * spread;
    return [POND.x + Math.sin(a) * R, POND.z + Math.cos(a) * R];
  };
  const padTex = canvasTex(128, 128, (g, w) => {
    g.fillStyle = '#4f8a4a'; g.beginPath(); g.arc(w / 2, w / 2, w / 2 - 2, 0.28, Math.PI * 2 - 0.28); g.lineTo(w / 2, w / 2); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(190,225,160,.5)'; g.lineWidth = 2;
    for (let i = 1; i < 13; i++) { const a = (i / 13) * Math.PI * 2; g.beginPath(); g.moveTo(w / 2, w / 2); g.lineTo(w / 2 + Math.cos(a) * 58, w / 2 + Math.sin(a) * 58); g.stroke(); }
  });
  const PADS = 30, pads = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshLambertMaterial({ map: padTex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide }), PADS);
  const flowerSpots = [];
  for (let i = 0; i < PADS; i++) {
    const [x, z] = inPond(0.86), s = r(0.65, 1.25);
    dummy.position.set(x, GROUND_Y + 0.135, z); dummy.scale.setScalar(s); dummy.rotation.set(-Math.PI / 2, 0, r(0, 6.28)); dummy.updateMatrix();
    pads.setMatrixAt(i, dummy.matrix);
    if (i % 3 === 0) flowerSpots.push([x, z]);
  }
  pads.renderOrder = 3; root.add(pads);
  const PET = 11, petals = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 8, 6), std(0xffffff, { roughness: 0.6 }), flowerSpots.length * PET);
  flowerSpots.forEach(([x, z], k) => {
    for (let i = 0; i < PET; i++) {
      const ring = i < 7 ? 0 : 1, c = ring ? 4 : 7, a = (i / c) * 6.28, dist = ring ? 0.07 : 0.15;
      dummy.position.set(x + Math.sin(a) * dist, GROUND_Y + 0.25 + ring * 0.05, z + Math.cos(a) * dist);
      dummy.rotation.set(ring ? 0.25 : 0.62, a, 0); dummy.scale.set(0.55, 1.3, 0.34); dummy.updateMatrix();
      petals.setMatrixAt(k * PET + i, dummy.matrix); petals.setColorAt(k * PET + i, col.set(ring ? 0xfbdbe2 : 0xf19cb5));
    }
  });
  petals.renderOrder = 3; root.add(petals);

  // 잉어
  const KOI = 9, koiBody = new THREE.CapsuleGeometry(0.1, 0.42, 4, 8); koiBody.rotateX(Math.PI / 2); koiBody.scale(0.9, 0.55, 1);
  const koiMesh = new THREE.InstancedMesh(koiBody, lamb(0xffffff), KOI);
  const koiTail = new THREE.ConeGeometry(0.09, 0.22, 5); koiTail.rotateX(-Math.PI / 2); koiTail.scale(1, 0.25, 1);
  const tailMesh = new THREE.InstancedMesh(koiTail, lamb(0xffffff), KOI);
  const koiCols = ['#f26b2e', '#fdf3e7', '#e9a43a', '#fdf3e7', '#d9412c', '#f4c04e', '#f26b2e', '#fdf3e7', '#22262b'];
  const koi = Array.from({ length: KOI }, (_, i) => {
    const [x, z] = inPond(0.7);
    koiMesh.setColorAt(i, col.set(koiCols[i])); tailMesh.setColorAt(i, col.set(koiCols[i]));
    return { x, z, h: r(0, 6.28), sp: r(0.35, 0.65), ph: r(0, 6), wob: r(0.2, 0.6) };
  });
  koiMesh.frustumCulled = tailMesh.frustumCulled = false;
  root.add(koiMesh, tailMesh);
  let feed = null;

  // 바위
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * 6.28 + 0.4, R = pondR(a) + r(0.7, 1.1);
    if (i % 3 !== 0) continue;
    const big = mesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0x8f8c84, flatShading: true }), POND.x + Math.sin(a) * R, GROUND_Y + 0.42, POND.z + Math.cos(a) * R, root);
    big.scale.set(r(0.75, 1.15), r(0.5, 0.8), r(0.75, 1.1)); big.rotation.set(r(0, 1), r(0, 6), 0);
  }
  [[-1.4, 41], [9, 42], [-19, 18.5], [18, 18]].forEach(([x, z]) => {
    const b = mesh(rockGeo, new THREE.MeshLambertMaterial({ color: 0x8f8c84, flatShading: true }), x, GROUND_Y + 0.5, z, root);
    b.scale.set(r(1, 1.5), r(0.6, 1), r(1, 1.4)); b.rotation.set(r(0, 1), r(0, 6), 0);
    colliders.push([x, z, 1.7]);
  });

  // 징검돌
  const stepGeo = new THREE.CylinderGeometry(0.46, 0.5, 0.08, 9);
  const steps = [];
  for (let k = 0; k <= 26; k++) { const t = k / 26, a = 1.05 + t * 3.4; steps.push([POND.x + Math.sin(a) * (pondR(a) + 2.6), POND.z + Math.cos(a) * (pondR(a) + 2.6)]); }
  for (let z = 39.6; z < 46; z += 1.15) steps.push([Math.sin(z) * 0.5, z]);
  const onPath = ([x, z]) => Math.abs(x) < 2.1 && z < 39.4;
  const stepList = steps.filter((q) => !onPath(q));
  const stepMesh = new THREE.InstancedMesh(stepGeo, std(0xb9b3a7), stepList.length);
  stepList.forEach(([x, z], i) => {
    dummy.position.set(x, GROUND_Y + 0.05, z); dummy.scale.set(r(0.85, 1.2), 1, r(0.8, 1.15)); dummy.rotation.set(0, r(0, 6), 0); dummy.updateMatrix();
    stepMesh.setMatrixAt(i, dummy.matrix);
  });
  root.add(stepMesh);

  // 단풍나무
  const trunkMat = lamb(0x4e3a2b), crownGeo = new THREE.IcosahedronGeometry(1, 1);
  const crownCols = [0xc8452d, 0xdb6a2b, 0xe08c2e, 0xb8382e];
  [[17, 22], [18.5, 38], [8, 43.5], [-3.5, 45], [-18.5, 42], [-19.5, 25], [18, 44], [5, 24.5]].forEach(([x, z], i) => {
    const t = new THREE.Group(); t.position.set(x, GROUND_Y, z); root.add(t);
    const s = r(0.9, 1.25);
    mesh(new THREE.CylinderGeometry(0.16 * s, 0.3 * s, 3 * s, 7), trunkMat, 0, 1.5 * s, 0, t);
    const mat = new THREE.MeshLambertMaterial({ color: crownCols[i % 4], flatShading: true });
    for (let k = 0; k < 5; k++) {
      const c = mesh(crownGeo, mat, r(-1.1, 1.1) * s, (3.1 + r(0, 1.3)) * s, r(-1.1, 1.1) * s, t);
      c.scale.set(r(1, 1.5) * s, r(0.75, 1.1) * s, r(1, 1.5) * s);
    }
    colliders.push([x, z, 0.8]);
  });

  // 대숲
  {
    const C = 46, culm = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.05, 0.07, 1, 6), lamb(0xffffff), C);
    const LEAF = 5, leaf = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), C * LEAF);
    for (let i = 0; i < C; i++) {
      const x = r(-24, -15) + (i % 2 ? 0 : 0.5), z = r(33, 47), h = r(5, 8.5);
      dummy.position.set(x, GROUND_Y + h / 2, z); dummy.rotation.set(r(-0.04, 0.04), 0, r(-0.05, 0.05)); dummy.scale.set(1, h, 1); dummy.updateMatrix();
      culm.setMatrixAt(i, dummy.matrix); culm.setColorAt(i, col.set(0x76934f).offsetHSL(0, 0, r(-0.05, 0.06)));
      for (let k = 0; k < LEAF; k++) {
        dummy.position.set(x + r(-0.7, 0.7), GROUND_Y + h - r(0, 2.6), z + r(-0.7, 0.7));
        dummy.rotation.set(r(0, 3), r(0, 3), 0); dummy.scale.set(r(0.6, 1), r(0.3, 0.55), r(0.6, 1)); dummy.updateMatrix();
        leaf.setMatrixAt(i * LEAF + k, dummy.matrix); leaf.setColorAt(i * LEAF + k, col.set(0x5e9150).offsetHSL(0, 0, r(-0.05, 0.05)));
      }
    }
    root.add(culm, leaf);
    for (let x = -22; x <= -15; x += 2.3) for (let z = 34; z <= 47; z += 2.3) colliders.push([x, z, 1.25]);
  }

  // 석등
  const lampGlow = [];
  [[4.2, 20], [-3.6, 21], [4.5, 35], [-20, 31]].forEach(([x, z]) => {
    const t = new THREE.Group(); t.position.set(x, GROUND_Y, z); root.add(t);
    const st = std(0x9c988e, { roughness: 1, flatShading: true });
    mesh(new THREE.CylinderGeometry(0.42, 0.54, 0.26, 8), st, 0, 0.13, 0, t);
    mesh(new THREE.CylinderGeometry(0.11, 0.15, 1.05, 8), st, 0, 0.78, 0, t);
    mesh(new THREE.CylinderGeometry(0.4, 0.26, 0.15, 8), st, 0, 1.36, 0, t);
    const glow = new THREE.MeshStandardMaterial({ color: 0xfff0c8, emissive: 0xffc26a, emissiveIntensity: 0.3 });
    mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.34, 8), glow, 0, 1.6, 0, t); lampGlow.push(glow);
    mesh(new THREE.ConeGeometry(0.56, 0.3, 8), st, 0, 1.92, 0, t);
    mesh(new THREE.SphereGeometry(0.08, 8, 6), st, 0, 2.12, 0, t);
    colliders.push([x, z, 0.75]);
  });

  // 돌 벤치(앉는 자리)
  const seats = [];
  const seatMat = std(0xa39d90, { roughness: 1, flatShading: true });
  const seatGeo = new THREE.CylinderGeometry(0.62, 0.72, 0.42, 9);
  [0.7, 1.55, 2.4, 3.3, 4.2, 5.05, 5.75].forEach((a) => {
    const R = pondR(a) + 1.25, x = POND.x + Math.sin(a) * R, z = POND.z + Math.cos(a) * R;
    if (x < GARDEN_BOUNDS.xMin + 0.5 || z > GARDEN_BOUNDS.zMax - 0.5) return;
    const m = mesh(seatGeo, seatMat, x, GROUND_Y + 0.21, z, seatGroup);
    seats.push({ x, z, yaw: Math.atan2(POND.x - x, POND.z - z), h: 0.6, zone: 'garden', mesh: m, by: null });
  });

  // 돌탑
  const stoneMesh = new THREE.InstancedMesh(new THREE.DodecahedronGeometry(1, 1), new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), MAX_STONES);
  stoneMesh.frustumCulled = false; stoneMesh.count = 0; root.add(stoneMesh);
  const slots = [];
  TOWER_SITES.forEach(([x, z], t) => {
    colliders.push([x, z, 0.85]);
    const base = mesh(new THREE.CylinderGeometry(0.72, 0.84, 0.12, 9), std(0x8e8a80, { flatShading: true }), x, GROUND_Y + 0.06, z, root);
    base.rotation.y = t;
    const s = seeded(100 + t);
    let y = GROUND_Y + 0.12;
    for (let i = 0; i < PER_TOWER; i++) {
      const w = 0.56 - (i / PER_TOWER) * 0.4, h = 0.1 + w * 0.13;
      y += h;
      slots.push({ x: x + (s() - 0.5) * 0.07, y, z: z + (s() - 0.5) * 0.07, w: w * (0.9 + s() * 0.2), d: w * (0.9 + s() * 0.2), h, rot: s() * 6.28, tone: 0.42 + s() * 0.24 });
      y += h * 0.85;
    }
  });
  slots.forEach((q, i) => stoneMesh.setColorAt(i, col.setHSL(0.08, 0.06, q.tone)));
  let drop = null;
  const writeStone = (i, n, off = 0) => {
    const q = slots[i % MAX_STONES];
    dummy.position.set(q.x, q.y + off, q.z); dummy.rotation.set(0, q.rot, 0); dummy.scale.set(q.w, q.h, q.d); dummy.updateMatrix();
    stoneMesh.setMatrixAt(i % MAX_STONES, dummy.matrix);
    stoneMesh.setColorAt(i % MAX_STONES, col.setHSL(0.08, 0.06, q.tone));
    stoneMesh.count = Math.min(MAX_STONES, n);
    stoneMesh.instanceMatrix.needsUpdate = true;
    if (stoneMesh.instanceColor) stoneMesh.instanceColor.needsUpdate = true;
  };

  return {
    seats, colliders,
    setStones(n) { for (let i = 0; i < Math.min(n, MAX_STONES); i++) writeStone(n - 1 - i, n); stoneMesh.count = Math.min(n, MAX_STONES); },
    placeStone(n) { drop = { i: n - 1, n, t: 0 }; writeStone(n - 1, n, 1.2); },
    stoneSite(n) { const k = Math.floor((n % MAX_STONES) / PER_TOWER); return TOWER_SITES[k]; },
    towerDone: (n) => n % PER_TOWER === 0,
    feed(x, z, now) { feed = { x, z, until: now + 13 }; water.ripple.value.set(x, z, now, 0); },
    setSky(color, night) { water.sky.value.copy(color); lampGlow.forEach((m) => { m.emissiveIntensity = 0.25 + night * 1.5; }); },
    update(t, dt) {
      water.time.value = t;
      if (drop) {
        drop.t += dt / 0.42;
        const k = Math.min(drop.t, 1), done = k >= 1;
        writeStone(drop.i, drop.n, (1 - k * k) * 1.2);
        if (done) { const cb = drop.onLand; drop = null; cb?.(); }
      }
      koi.forEach((f, i) => {
        const fed = feed && t < feed.until;
        let tx, tz;
        if (fed) { const ring = 0.75 + (i % 3) * 0.42, ang = i * 2.4 + t * 0.35; tx = feed.x + Math.sin(ang) * ring; tz = feed.z + Math.cos(ang) * ring; } else {
          f.ph += dt * f.wob;
          tx = POND.x + Math.sin(f.ph + i) * (3.8 + (i % 3));
          tz = POND.z + Math.cos(f.ph * 0.8 + i * 1.7) * (3.2 + (i % 3));
        }
        const want = Math.atan2(tx - f.x, tz - f.z);
        let dh = want - f.h; dh = Math.atan2(Math.sin(dh), Math.cos(dh));
        f.h += dh * Math.min(1, dt * (fed ? 3.2 : 1.1));
        const close = Math.hypot(tx - f.x, tz - f.z);
        const sp = (fed ? Math.min(1.9, 0.4 + close * 0.9) : f.sp) * dt;
        const nx = f.x + Math.sin(f.h) * sp, nz = f.z + Math.cos(f.h) * sp;
        const a = Math.atan2(nx - POND.x, nz - POND.z), R = Math.hypot(nx - POND.x, nz - POND.z);
        if (R < pondR(a) - 0.5) { f.x = nx; f.z = nz; } else f.h += dt * 2.6;
        const wag = Math.sin(t * (fed ? 11 : 6) + i) * 0.24;
        const fy = GROUND_Y + 0.05 + i * 0.006;
        dummy.position.set(f.x, fy, f.z); dummy.rotation.set(0, f.h + wag * 0.45, 0); dummy.scale.setScalar(1.4); dummy.updateMatrix();
        koiMesh.setMatrixAt(i, dummy.matrix);
        dummy.position.set(f.x - Math.sin(f.h) * 0.5, fy, f.z - Math.cos(f.h) * 0.5); dummy.rotation.set(0, f.h - wag, 0); dummy.updateMatrix();
        tailMesh.setMatrixAt(i, dummy.matrix);
      });
      koiMesh.instanceMatrix.needsUpdate = true; tailMesh.instanceMatrix.needsUpdate = true;
    },
    onStoneLand(cb) { if (drop) drop.onLand = cb; else cb(); },
  };
}
