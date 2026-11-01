import * as THREE from './vendor/three.min.js';

// 성당은 법당 뒤쪽 멀리 닫힌 건물로 둔다. 제단은 법당의 불상처럼 -z쪽에 있다
const CZ = -80;
export const CATHEDRAL = {
  start: { x: 0, z: CZ + 9 }, door: CZ + 14,
  zone: { xMin: -10, xMax: 10, zMin: CZ - 9.5, zMax: CZ + 13 },
  cam: { xMin: -10.6, xMax: 10.6, zMin: CZ - 17, zMax: CZ + 20.4, yMax: 9 },
};

const seeded = (seed) => () => {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const GLASS = ['#1e4fb4', '#2c7fd6', '#b3202c', '#d9a51e', '#2a8a57', '#6a2fa0', '#e8d9a0', '#143a8c'];

export function buildCathedral({ scene, mesh, std, canvasTex, seatGroup }) {
  const root = new THREE.Group(); scene.add(root);
  const colliders = [], seats = [];
  const Z = (d) => CZ + d;

  /* ───────── 재질 ───────── */
  const stoneTex = canvasTex(512, 512, (g, w, h) => {
    const r = seeded(11);
    g.fillStyle = '#b9b0a0'; g.fillRect(0, 0, w, h);
    for (let y = 0, row = 0; y < h; y += 64, row++) {
      for (let x = -64; x < w; x += 128) {
        const o = row % 2 ? 64 : 0, v = 150 + r() * 40;
        g.fillStyle = `rgb(${v + 22},${v + 15},${v})`;
        g.fillRect(x + o + 2, y + 2, 124, 60);
      }
    }
  }, [6, 2]);
  const wallMat = new THREE.MeshStandardMaterial({ map: stoneTex, roughness: 0.95, side: THREE.BackSide });
  const columnMat = std(0xc9c0ae, { roughness: 0.8 }), ribMat = std(0xa79d8b, { roughness: 0.85 });
  const woodMat = std(0x5c3a20, { roughness: 0.6 }), darkWood = std(0x3f2715, { roughness: 0.55 });
  const goldMat = std(0xd8ac45, { metalness: 0.75, roughness: 0.35, emissive: 0x3a2a08 });

  /* ───────── 바닥·벽·천장 ───────── */
  const floorTex = canvasTex(512, 512, (g, w, h) => {
    const n = 4, s = w / n;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = (x + y) % 2 ? '#d8d0c0' : '#6f5f55'; g.fillRect(x * s, y * s, s, s);
      g.strokeStyle = 'rgba(40,30,25,.35)'; g.strokeRect(x * s, y * s, s, s);
    }
  }, [7, 12]);
  const floor = mesh(new THREE.PlaneGeometry(22, 39), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.32, metalness: 0.08 }), 0, 0.005, Z(1.5), root);
  floor.rotation.x = -Math.PI / 2;
  // 통로의 붉은 카펫
  const carpet = mesh(new THREE.PlaneGeometry(2, 28), std(0x7c1f26, { roughness: 1 }), 0, 0.012, Z(4), root);
  carpet.rotation.x = -Math.PI / 2;

  const sideWall = new THREE.PlaneGeometry(39, 8.2);
  [-1, 1].forEach((s) => {
    const w = mesh(sideWall, wallMat, s * 11, 4.1, Z(1.5), root); w.rotation.y = s * Math.PI / 2;
    const c = mesh(new THREE.PlaneGeometry(5.4, 39), std(0x8f8676, { side: THREE.DoubleSide }), s * 8.3, 8.1, Z(1.5), root); c.rotation.x = Math.PI / 2;
  });
  const endWall = new THREE.PlaneGeometry(22, 16.4);
  const front = mesh(endWall, wallMat, 0, 8.2, Z(-18), root); front.rotation.y = Math.PI;
  mesh(endWall, wallMat, 0, 8.2, Z(21), root);

  // 별이 그려진 푸른 궁륭
  const vaultTex = canvasTex(512, 256, (g, w, h) => {
    const r = seeded(5);
    g.fillStyle = '#1d2f63'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8c66a';
    for (let i = 0; i < 130; i++) { g.beginPath(); g.arc(r() * w, r() * h, 1 + r() * 2.2, 0, 6.3); g.fill(); }
  }, [3, 3]);
  const vault = mesh(new THREE.CylinderGeometry(5.6, 5.6, 39, 32, 1, true, -Math.PI / 2, Math.PI), new THREE.MeshStandardMaterial({ map: vaultTex, side: THREE.BackSide, roughness: 1, emissive: 0x141c38, emissiveMap: vaultTex }), 0, 8, Z(1.5), root);
  vault.rotation.x = -Math.PI / 2; vault.scale.z = 1.3;

  /* ───────── 기둥·아치 ───────── */
  const shaft = new THREE.CylinderGeometry(0.42, 0.48, 5, 14), capGeo = new THREE.CylinderGeometry(0.72, 0.44, 0.5, 14), baseGeo = new THREE.CylinderGeometry(0.66, 0.74, 0.4, 14);
  const arcadeRib = new THREE.TorusGeometry(3, 0.16, 8, 22, Math.PI), crossRib = new THREE.TorusGeometry(5.6, 0.13, 8, 36, Math.PI);
  const BAYS = [-12, -6, 0, 6, 12, 18];
  BAYS.forEach((d) => {
    [-1, 1].forEach((s) => {
      mesh(baseGeo, columnMat, s * 5.6, 0.2, Z(d), root);
      mesh(shaft, columnMat, s * 5.6, 2.9, Z(d), root);
      mesh(capGeo, ribMat, s * 5.6, 5.6, Z(d), root);
      colliders.push([s * 5.6, Z(d), 0.78]);
      if (d < 18) { const a = mesh(arcadeRib, ribMat, s * 5.6, 5.8, Z(d + 3), root); a.rotation.y = Math.PI / 2; }
    });
    const c = mesh(crossRib, ribMat, 0, 8, Z(d), root); c.scale.y = 1.3;
  });
  // 아치 위 벽
  [-1, 1].forEach((s) => {
    for (let d = -15; d <= 15; d += 6) {
      const sp = new THREE.Shape();
      sp.moveTo(-3, 0); sp.lineTo(3, 0); sp.lineTo(3, 2.4); sp.lineTo(-3, 2.4); sp.lineTo(-3, 0);
      const hole = new THREE.Path(); hole.absarc(0, 0, 2.86, 0, Math.PI, false); hole.closePath(); sp.holes.push(hole);
      const m = mesh(new THREE.ShapeGeometry(sp, 14), std(0xb7ad9b, { side: THREE.DoubleSide }), s * 5.6, 5.8, Z(d + 3), root); m.rotation.y = Math.PI / 2;
    }
  });

  /* ───────── 스테인드글라스 ───────── */
  const windowMats = [];
  const glassMat = (tex) => {
    const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, toneMapped: false, fog: false });
    windowMats.push(m); return m;
  };
  const lancetTex = (seed) => canvasTex(160, 400, (g, w, h) => {
    const r = seeded(seed);
    const outline = () => { g.beginPath(); g.moveTo(6, h - 4); g.lineTo(6, 120); g.quadraticCurveTo(10, 40, w / 2, 6); g.quadraticCurveTo(w - 10, 40, w - 6, 120); g.lineTo(w - 6, h - 4); g.closePath(); };
    g.save(); outline(); g.clip();
    const cell = 26;
    for (let y = 0; y < h; y += cell) for (let x = 0; x < w; x += cell) {
      g.fillStyle = GLASS[Math.floor(r() * GLASS.length)]; g.fillRect(x, y, cell, cell);
    }
    g.strokeStyle = 'rgba(15,12,20,.9)'; g.lineWidth = 3;
    for (let y = 0; y < h; y += cell) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y + (r() - 0.5) * 6); g.stroke(); }
    for (let x = 0; x < w; x += cell) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, h); g.stroke(); }
    // 가운데 둥근 장식
    g.fillStyle = '#f2dc9a'; g.beginPath(); g.arc(w / 2, 150, 32, 0, 6.3); g.fill();
    g.fillStyle = '#b3202c'; g.beginPath(); g.arc(w / 2, 150, 20, 0, 6.3); g.fill();
    g.lineWidth = 4; g.beginPath(); g.arc(w / 2, 150, 32, 0, 6.3); g.stroke();
    g.restore();
    g.strokeStyle = '#2a2420'; g.lineWidth = 8; outline(); g.stroke();
  });
  const lancet = new THREE.PlaneGeometry(2, 5);
  const washTex = canvasTex(64, 128, (g, w, h) => {
    const r = seeded(2);
    for (let y = 0; y < h; y += 16) for (let x = 0; x < w; x += 16) { g.fillStyle = GLASS[Math.floor(r() * 7)]; g.fillRect(x, y, 16, 16); }
  });
  washTex.magFilter = THREE.LinearFilter;
  const washMat = new THREE.MeshBasicMaterial({ map: washTex, transparent: true, opacity: 0.2, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, fog: false });
  windowMats.push(washMat);
  [-1, 1].forEach((s) => {
    [-15, -9, -3, 3, 9, 15].forEach((d, i) => {
      const m = mesh(lancet, glassMat(lancetTex(20 + i * 2 + (s > 0 ? 1 : 0))), s * 10.94, 4.3, Z(d), root); m.rotation.y = s * Math.PI / 2;
      // 창빛이 바닥에 비친다
      const p = mesh(new THREE.PlaneGeometry(2, 4.4), washMat, s * 8.1, 0.018, Z(d), root); p.rotation.x = -Math.PI / 2; p.rotation.z = s * Math.PI / 2;
    });
  });
  const roseTex = canvasTex(512, 512, (g, w) => {
    const c = w / 2, R = c - 8, r = seeded(9);
    g.save(); g.translate(c, c);
    for (let ring = 3; ring >= 1; ring--) {
      const n = ring * 12, rad = (R * ring) / 3;
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        g.fillStyle = GLASS[Math.floor(r() * GLASS.length)];
        g.beginPath(); g.moveTo(0, 0); g.arc(0, 0, rad, a, a + (Math.PI * 2) / n); g.closePath(); g.fill();
        g.strokeStyle = '#17121c'; g.lineWidth = 5; g.stroke();
      }
    }
    g.fillStyle = '#f2dc9a'; g.beginPath(); g.arc(0, 0, R * 0.14, 0, 6.3); g.fill(); g.stroke();
    g.lineWidth = 12; g.beginPath(); g.arc(0, 0, R, 0, 6.3); g.stroke();
    g.restore();
  });
  const roseGeo = new THREE.CircleGeometry(3, 40);
  const roseFront = mesh(roseGeo, glassMat(roseTex), 0, 11.6, Z(-17.94), root); roseFront.rotation.y = 0;
  const roseBack = mesh(roseGeo, glassMat(roseTex), 0, 11, Z(20.94), root); roseBack.rotation.y = Math.PI;
  [-1, 1].forEach((s) => {
    mesh(new THREE.PlaneGeometry(2.4, 6), glassMat(lancetTex(40 + s)), s * 4.6, 5.6, Z(-17.94), root);
  });

  /* ───────── 제단 ───────── */
  const stepMat = std(0xd9d2c4, { roughness: 0.5 });
  [[16, 0.18, 8, -14], [14, 0.18, 6.6, -14.6], [11, 0.18, 5.2, -15.2]].forEach(([w, h, d, dz], i) => {
    mesh(new THREE.BoxGeometry(w, h, d), stepMat, 0, 0.09 + i * 0.18, Z(dz), root);
  });
  const ALTAR_Y = 0.54;
  mesh(new THREE.BoxGeometry(4.6, 1.1, 1.5), std(0xeee9dc, { roughness: 0.6 }), 0, ALTAR_Y + 0.55, Z(-14.6), root);
  mesh(new THREE.BoxGeometry(4.75, 0.06, 1.62), std(0xfbf8ef, { roughness: 0.7 }), 0, ALTAR_Y + 1.13, Z(-14.6), root);
  mesh(new THREE.BoxGeometry(4.77, 0.28, 0.02), goldMat, 0, ALTAR_Y + 0.98, Z(-13.8), root);
  mesh(new THREE.BoxGeometry(0.12, 0.7, 0.03), goldMat, 0, ALTAR_Y + 0.5, Z(-13.8), root);
  mesh(new THREE.BoxGeometry(0.46, 0.12, 0.03), goldMat, 0, ALTAR_Y + 0.6, Z(-13.8), root);

  // 십자가
  const halo = mesh(new THREE.CircleGeometry(3.3, 40), new THREE.MeshBasicMaterial({ color: 0xffdf9b, transparent: true, opacity: 0.2, depthWrite: false, toneMapped: false }), 0, 6.4, Z(-17.86), root);
  halo.renderOrder = 1;
  mesh(new THREE.BoxGeometry(0.42, 6.2, 0.26), darkWood, 0, 5.4, Z(-17.7), root);
  mesh(new THREE.BoxGeometry(3.4, 0.42, 0.26), darkWood, 0, 6.7, Z(-17.7), root);
  mesh(new THREE.BoxGeometry(0.5, 0.06, 0.3), goldMat, 0, 8.5, Z(-17.68), root);
  [-1, 1].forEach((s) => mesh(new THREE.BoxGeometry(0.06, 0.5, 0.3), goldMat, s * 1.7, 6.7, Z(-17.68), root));

  // 촛대와 촛불
  const flames = [];
  const flameMat = new THREE.MeshBasicMaterial({ color: 0xffc56b, toneMapped: false, fog: false });
  const flameGeo = new THREE.ConeGeometry(0.05, 0.2, 8); const stick = new THREE.CylinderGeometry(0.03, 0.05, 0.55, 8), wax = new THREE.CylinderGeometry(0.035, 0.035, 0.28, 8);
  const addFlame = (x, y, z, s = 1) => { const f = mesh(flameGeo, flameMat, x, y, z, root); f.scale.setScalar(s); flames.push({ f, ph: x * 7 + z, s }); };
  [-1.9, -1.2, -0.5, 0.5, 1.2, 1.9].forEach((x) => {
    const top = ALTAR_Y + 1.16;
    mesh(stick, goldMat, x, top + 0.27, Z(-14.9), root);
    mesh(wax, std(0xf6efdc), x, top + 0.68, Z(-14.9), root);
    addFlame(x, top + 0.93, Z(-14.9));
  });

  // 봉헌 촛불대
  [-1, 1].forEach((s) => {
    const x = s * 8.6, z = Z(-7);
    mesh(new THREE.BoxGeometry(2.4, 0.9, 0.7), woodMat, x, 0.45, z, root);
    mesh(new THREE.BoxGeometry(2.2, 0.35, 0.34), woodMat, x, 1.07, z - 0.18, root);
    colliders.push([x - 0.7, z, 0.75], [x + 0.7, z, 0.75]);
    for (let i = 0; i < 9; i++) addFlame(x - 1 + i * 0.25, 1.0, z + 0.18, 0.5);
    for (let i = 0; i < 7; i++) addFlame(x - 0.8 + i * 0.27, 1.34, z - 0.18, 0.5);
  });

  // 샹들리에
  [-5, 3, 11].forEach((d) => {
    const y = 8.6, z = Z(d);
    mesh(new THREE.CylinderGeometry(0.018, 0.018, 7, 6), darkWood, 0, y + 3.5, z, root);
    const ring = mesh(new THREE.TorusGeometry(1, 0.035, 8, 26), goldMat, 0, y, z, root); ring.rotation.x = Math.PI / 2;
    for (let i = 0; i < 8; i++) { const a = (i / 8) * 6.283; addFlame(Math.sin(a), y + 0.14, z + Math.cos(a), 0.8); }
  });

  // 큰 문
  const door = mesh(new THREE.BoxGeometry(4, 5, 0.2), woodMat, 0, 2.5, Z(20.88), root);
  mesh(new THREE.BoxGeometry(0.06, 5, 0.24), darkWood, 0, 2.5, Z(20.86), root);
  door.castShadow = false;

  /* ───────── 긴 의자 ───────── */
  const benchSeat = new THREE.BoxGeometry(3.7, 0.1, 1.16), benchBack = new THREE.BoxGeometry(3.7, 0.8, 0.08), benchEnd = new THREE.BoxGeometry(0.09, 1.2, 1.3), benchLeg = new THREE.BoxGeometry(3.5, 0.41, 0.1);
  const padGeo = new THREE.BoxGeometry(1.06, 0.05, 0.98), padMat = std(0x8b2430, { roughness: 1 });
  const ROWS = [-7, -4.4, -1.8, 0.8, 3.4, 6];
  ROWS.forEach((d) => {
    const z = Z(d);
    [-1, 1].forEach((s) => {
      const cx = s * 3.15;
      mesh(benchSeat, woodMat, cx, 0.46, z + 0.02, root);
      mesh(benchBack, woodMat, cx, 0.9, z + 0.6, root);
      mesh(benchLeg, darkWood, cx, 0.205, z + 0.5, root);
      [-1, 1].forEach((e) => mesh(benchEnd, darkWood, cx + e * 1.88, 0.6, z + 0.03, root));
      [1.7, 2.7, 3.7, 4.7].forEach((ax) => colliders.push([s * ax, z + 0.08, 0.64, true]));
      [2.2, 4.1].forEach((ax) => {
        const m = mesh(padGeo, padMat, s * ax, 0.535, z - 0.02, seatGroup);
        seats.push({ x: s * ax, z, yaw: Math.PI, h: 0.64, zone: 'cathedral', mesh: m, by: null });
      });
    });
  });

  /* ───────── 빛 ───────── */
  const lights = [
    new THREE.PointLight(0xffc98a, 46, 22, 1.4), new THREE.PointLight(0xffd9a8, 30, 22, 1.5),
  ];
  lights[0].position.set(0, 4.5, Z(-11)); lights[1].position.set(0, 6.5, Z(3));
  lights.forEach((l) => { l.visible = false; root.add(l); });

  root.visible = false;
  seats.forEach((q) => { q.mesh.visible = false; });

  return {
    root, seats, colliders,
    setActive(on) {
      root.visible = on;
      lights.forEach((l) => { l.visible = on; });
      seats.forEach((q) => { q.mesh.visible = on; });
    },
    setNight(n) { const k = 1 - 0.62 * n; windowMats.forEach((m) => m.color.setScalar(k)); washMat.opacity = 0.2 * (1 - n); },
    update(t) {
      for (const { f, ph, s } of flames) {
        const q = 1 + Math.sin(t * 9 + ph) * 0.09 + Math.sin(t * 17 + ph * 2) * 0.05;
        f.scale.set(s * (2 - q), s * q, s * (2 - q));
      }
    },
  };
}
