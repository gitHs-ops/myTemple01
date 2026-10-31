// CC0 불상 스캔을 웹용으로 줄이고 금칠 질감으로 굽는다.
// 원본: Minneapolis Institute of Art, Chinese Amoghasiddhi Buddha, 1403-1424 CE (CC0)
// 사용: node build_buddha.mjs <입력.glb> <출력.glb>   (@gltf-transform, sharp, meshoptimizer 필요)
import { NodeIO } from '@gltf-transform/core';
import { dedup, prune, simplify, weld } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import sharp from 'sharp';

const [src, dst] = process.argv.slice(2);
const io = new NodeIO();
const doc = await io.read(src);
const root = doc.getRoot();
for (const m of root.listMeshes()) {
  const verts = m.listPrimitives().reduce((n, p) => n + p.getAttribute('POSITION').getCount(), 0);
  console.log('mesh', m.getName(), verts);
  if (verts < 100) m.dispose();
}
for (const n of root.listNodes()) if (n.getMesh() === null && n.listChildren().length === 0) n.dispose();

for (const mat of root.listMaterials()) {
  const tex = mat.getBaseColorTexture();
  const { data, info } = await sharp(Buffer.from(tex.getImage())).resize(1400, 1400, { fit: 'inside' })
    .removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const out = Buffer.alloc(data.length);
  // 칠이 벗겨진 얼룩은 줄이고 패인 곳의 어두움만 남긴다
  const soft = await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).blur(0.9).raw().toBuffer();
  const stops = [[0, [36, 22, 9]], [0.3, [108, 74, 26]], [0.6, [176, 132, 54]], [0.82, [212, 172, 88]], [1, [240, 210, 140]]];
  for (let i = 0; i < data.length; i += 3) {
    const L = (0.3 * soft[i] + 0.59 * soft[i + 1] + 0.11 * soft[i + 2]) / 255;
    const v = Math.min(1, 0.2 + 0.86 * Math.pow(L, 0.85));
    let s = 0; while (s < stops.length - 2 && v > stops[s + 1][0]) s++;
    const [a, ca] = stops[s], [b, cb] = stops[s + 1], k = (v - a) / (b - a);
    for (let c = 0; c < 3; c++) out[i + c] = Math.round(ca[c] + (cb[c] - ca[c]) * k);
  }
  const jpg = await sharp(out, { raw: { width: info.width, height: info.height, channels: 3 } }).jpeg({ quality: 82, mozjpeg: true }).toBuffer();
  tex.setImage(new Uint8Array(jpg)).setMimeType('image/jpeg');
  mat.setBaseColorFactor([1, 1, 1, 1]).setMetallicRoughnessTexture(null).setMetallicFactor(0.82).setRoughnessFactor(0.46);
}
await doc.transform(weld(), simplify({ simplifier: MeshoptSimplifier, ratio: 0.72, error: 0.0008 }), dedup(), prune());
root.listAccessors();
await io.write(dst, doc);
console.log('prims', root.listMeshes().map((m) => m.listPrimitives().map((p) => [p.getAttribute('POSITION').getCount(), p.getIndices()?.getCount() / 3, !!p.getAttribute('NORMAL')])));
