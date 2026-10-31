// 실제 고양이 스캔에서 바닥(담요·자갈)을 잘라내고 웹용으로 줄인다.
// 사용: node build_cat.mjs <입력.glb> <출력.glb> [낮은높이 높은높이 색거리 줄임비율 텍스처]
// (@gltf-transform, sharp, meshoptimizer 필요)
import { NodeIO } from '@gltf-transform/core';
import { dedup, normals, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [src, dst, T1 = '0.03', T2 = '0.16', CD = '46', RATIO = '0.15', TEX = '1024'] = process.argv.slice(2);
const io = new NodeIO();
const doc = await io.read(src);
const root = doc.getRoot();

// 월드 좌표로 굽고 텍스처 색을 정점마다 읽어 둔다
const parts = [];
const texCache = new Map();
const readTex = async (t) => {
  if (!texCache.has(t)) {
    const { data, info } = await sharp(Buffer.from(t.getImage())).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    texCache.set(t, { data, w: info.width, h: info.height });
  }
  return texCache.get(t);
};
for (const node of root.listNodes()) {
  const mesh = node.getMesh(); if (!mesh) continue;
  const M = node.getWorldMatrix();
  for (const prim of mesh.listPrimitives()) {
    const P = prim.getAttribute('POSITION'), UV = prim.getAttribute('TEXCOORD_0'), n = P.getCount();
    const pos = new Float64Array(n * 3), uv = UV.getArray(), col = new Float32Array(n * 3).fill(128);
    const a = P.getArray();
    for (let i = 0; i < n; i++) {
      const x = a[i * 3], y = a[i * 3 + 1], z = a[i * 3 + 2];
      pos[i * 3] = M[0] * x + M[4] * y + M[8] * z + M[12];
      pos[i * 3 + 1] = M[1] * x + M[5] * y + M[9] * z + M[13];
      pos[i * 3 + 2] = M[2] * x + M[6] * y + M[10] * z + M[14];
    }
    const tex = prim.getMaterial().getBaseColorTexture();
    if (tex) {
      const t = await readTex(tex);
      for (let i = 0; i < n; i++) {
        const u = ((uv[i * 2] % 1) + 1) % 1, v = ((uv[i * 2 + 1] % 1) + 1) % 1;
        const o = (Math.floor(v * t.h) * t.w + Math.floor(u * t.w)) * 3;
        col[i * 3] = t.data[o]; col[i * 3 + 1] = t.data[o + 1]; col[i * 3 + 2] = t.data[o + 2];
      }
    }
    const idx = prim.getIndices()?.getArray() ?? Uint32Array.from({ length: n }, (_, i) => i);
    parts.push({ prim, pos, col, idx, n });
  }
}
const all = (fn) => { for (const p of parts) for (let i = 0; i < p.n; i++) fn(p, i); };
let total = 0; all(() => total++);

// 바닥면 RANSAC
const samples = [];
all((p, i) => { if (Math.random() < Math.min(1, 40000 / total)) samples.push([p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]]); });
const bb = [Infinity, -Infinity, Infinity, -Infinity, Infinity, -Infinity];
samples.forEach(([x, y, z]) => { bb[0] = Math.min(bb[0], x); bb[1] = Math.max(bb[1], x); bb[2] = Math.min(bb[2], y); bb[3] = Math.max(bb[3], y); bb[4] = Math.min(bb[4], z); bb[5] = Math.max(bb[5], z); });
const diag = Math.hypot(bb[1] - bb[0], bb[3] - bb[2], bb[5] - bb[4]), tol = diag * 0.006;
let best = null, bestN = -1;
for (let k = 0; k < 900; k++) {
  const [a, b, c] = [0, 1, 2].map(() => samples[Math.floor(Math.random() * samples.length)]);
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  let n = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
  const L = Math.hypot(...n); if (L < 1e-9) continue; n = n.map((q) => q / L);
  let cnt = 0;
  for (const s of samples) if (Math.abs((s[0] - a[0]) * n[0] + (s[1] - a[1]) * n[1] + (s[2] - a[2]) * n[2]) < tol) cnt++;
  if (cnt > bestN) { bestN = cnt; best = { a, n }; }
}
// 평면 내 점으로 다시 맞춤(주성분 대신 평균 기준만 보정)
const dist = (x, y, z) => (x - best.a[0]) * best.n[0] + (y - best.a[1]) * best.n[1] + (z - best.a[2]) * best.n[2];
const hs = samples.map((s) => dist(...s)).sort((a, b) => a - b);
if (Math.abs(hs[Math.floor(hs.length * 0.005)]) > Math.abs(hs[Math.floor(hs.length * 0.995)])) best.n = best.n.map((q) => -q);
const hsu = samples.map((s) => dist(...s)).sort((a, b) => a - b);
const catH = hsu[Math.floor(hsu.length * 0.998)];
console.log('평면 일치', (bestN / samples.length).toFixed(3), '고양이 높이', catH.toFixed(3), '대각', diag.toFixed(3));

// 바닥색: 평면 위 정점의 중앙값
const rs = [], gs = [], bs = [];
all((p, i) => { const h = dist(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]); if (Math.abs(h) < catH * 0.02 && Math.random() < 0.2) { rs.push(p.col[i * 3]); gs.push(p.col[i * 3 + 1]); bs.push(p.col[i * 3 + 2]); } });
const med = (q) => q.sort((a, b) => a - b)[q.length >> 1];
const base = [med(rs), med(gs), med(bs)];
console.log('바닥색', base);

const t1 = catH * +T1, t2 = catH * +T2, cd = +CD;
const keepV = (p, i) => {
  const h = dist(p.pos[i * 3], p.pos[i * 3 + 1], p.pos[i * 3 + 2]);
  if (h < t1) return false;
  if (h > t2) return true;
  const d = Math.hypot(p.col[i * 3] - base[0], p.col[i * 3 + 1] - base[1], p.col[i * 3 + 2] - base[2]);
  return d > cd;
};

// 남은 삼각형의 가장 큰 덩어리만 남긴다 (위치 기준으로 묶음)
const key = (p, i) => `${Math.round(p.pos[i * 3] / (diag * 2e-4))},${Math.round(p.pos[i * 3 + 1] / (diag * 2e-4))},${Math.round(p.pos[i * 3 + 2] / (diag * 2e-4))}`;
const parent = new Map();
const find = (a) => { while (parent.get(a) !== a) { parent.set(a, parent.get(parent.get(a))); a = parent.get(a); } return a; };
const union = (a, b) => { const ra = find(a), rb = find(b); if (ra !== rb) parent.set(ra, rb); };
const tris = [];
for (const p of parts) {
  p.keys = new Array(p.n);
  p.flag = new Uint8Array(p.n);
  for (let i = 0; i < p.n; i++) { p.keys[i] = key(p, i); p.flag[i] = keepV(p, i) ? 1 : 0; if (!parent.has(p.keys[i])) parent.set(p.keys[i], p.keys[i]); }
  for (let t = 0; t < p.idx.length; t += 3) {
    const [a, b, c] = [p.idx[t], p.idx[t + 1], p.idx[t + 2]];
    if (!(p.flag[a] && p.flag[b] && p.flag[c])) continue;
    union(p.keys[a], p.keys[b]); union(p.keys[b], p.keys[c]);
    tris.push([p, a, b, c]);
  }
}
const count = new Map();
for (const [p, a] of tris) { const r = find(p.keys[a]); count.set(r, (count.get(r) || 0) + 1); }
const big = [...count.entries()].sort((a, b) => b[1] - a[1]);
console.log('덩어리', big.slice(0, 5).map((q) => q[1]), '전체', tris.length);
const mainRoot = big[0][0];

// 축 맞춤: 평면 법선을 +Y, 고양이 중심을 원점, 긴 변을 길이 1로
const up = best.n;
let ax = Math.abs(up[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
const e1 = [ax[1] * up[2] - ax[2] * up[1], ax[2] * up[0] - ax[0] * up[2], ax[0] * up[1] - ax[1] * up[0]]; const l1 = Math.hypot(...e1); e1.forEach((v, i) => { e1[i] = v / l1; });
const e2 = [up[1] * e1[2] - up[2] * e1[1], up[2] * e1[0] - up[0] * e1[2], up[0] * e1[1] - up[1] * e1[0]];
const toLocal = (p, i) => {
  const x = p.pos[i * 3] - best.a[0], y = p.pos[i * 3 + 1] - best.a[1], z = p.pos[i * 3 + 2] - best.a[2];
  return [x * e1[0] + y * e1[1] + z * e1[2], x * up[0] + y * up[1] + z * up[2], x * e2[0] + y * e2[1] + z * e2[2]];
};
let mn = [Infinity, Infinity, Infinity], mx = [-Infinity, -Infinity, -Infinity];
const picked = tris.filter(([p, a]) => find(p.keys[a]) === mainRoot);
for (const [p, a, b, c] of picked) for (const i of [a, b, c]) { const q = toLocal(p, i); for (let k = 0; k < 3; k++) { mn[k] = Math.min(mn[k], q[k]); mx[k] = Math.max(mx[k], q[k]); } }
const cx = (mn[0] + mx[0]) / 2, cz = (mn[2] + mx[2]) / 2, scale = 1 / Math.max(mx[0] - mn[0], mx[2] - mn[2]);
console.log('크기(길이1 기준)', ((mx[0] - mn[0]) * scale).toFixed(3), ((mx[1] - mn[1]) * scale).toFixed(3), ((mx[2] - mn[2]) * scale).toFixed(3));

// 다시 쓰기
for (const part of parts) {
  const mine = picked.filter((t) => t[0] === part);
  const remap = new Map(), outPos = [], outUv = [], outIdx = [];
  const uv = part.prim.getAttribute('TEXCOORD_0').getArray();
  for (const [, a, b, c] of mine) for (const i of [a, b, c]) {
    if (!remap.has(i)) {
      remap.set(i, outPos.length / 3);
      const q = toLocal(part, i);
      outPos.push((q[0] - cx) * scale, (q[1] - mn[1]) * scale, (q[2] - cz) * scale);
      outUv.push(uv[i * 2], uv[i * 2 + 1]);
    }
    outIdx.push(remap.get(i));
  }
  if (!outIdx.length) { part.prim.dispose?.(); part.dead = true; continue; }
  part.prim.getAttribute('POSITION').setArray(new Float32Array(outPos));
  part.prim.getAttribute('TEXCOORD_0').setArray(new Float32Array(outUv));
  for (const s of part.prim.listSemantics()) if (!['POSITION', 'TEXCOORD_0'].includes(s)) part.prim.setAttribute(s, null);
  part.prim.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(outIdx)).setBuffer(root.listBuffers()[0]));
}
for (const node of root.listNodes()) { node.setMatrix([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]); }
// 트리 단순화: 메시 노드를 부모 없이 쓴다
for (const scene of root.listScenes()) {
  for (const node of root.listNodes()) if (node.getMesh()) scene.addChild(node);
}
for (const mesh of root.listMeshes()) for (const prim of mesh.listPrimitives()) {
  if (parts.find((q) => q.prim === prim)?.dead) mesh.removePrimitive(prim);
}
// UV 경계를 고정해야 표면에 틈이 생기지 않는다
const steps = [weld()];
if (+RATIO < 1) steps.push(simplify({ simplifier: MeshoptSimplifier, ratio: +RATIO, error: 0.0012, lockBorder: true }));
await doc.transform(...steps, dedup(), prune(), normals({ overwrite: true }));

const size = +TEX;
for (const mat of root.listMaterials()) {
  const tex = mat.getBaseColorTexture();
  if (tex) {
    const jpg = await sharp(Buffer.from(tex.getImage())).resize(size, size, { fit: 'inside' }).removeAlpha().jpeg({ quality: 80, mozjpeg: true }).toBuffer();
    tex.setImage(new Uint8Array(jpg)).setMimeType('image/jpeg');
  }
  mat.setMetallicRoughnessTexture(null).setNormalTexture(null).setOcclusionTexture(null).setEmissiveTexture(null).setEmissiveFactor([0, 0, 0]).setMetallicFactor(0).setRoughnessFactor(0.92).setBaseColorFactor([1, 1, 1, 1]).setAlphaMode('OPAQUE').setDoubleSided(true);
}
await doc.transform(prune());
await io.write(dst, doc);
console.log('결과 삼각형', root.listMeshes().map((m) => m.listPrimitives().map((p) => (p.getIndices()?.getCount() ?? p.getAttribute('POSITION').getCount()) / 3)));
