// 정원의 청동 불상: 법당 불상과 같은 3D 스캔을 크게 키워 청동빛으로 입힌다
import * as THREE from './vendor/three.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.min.js';

export const BULDU = { x: -6, z: 58, yaw: 2.82, stand: { x: -1.5, z: 44.4 }, viewTheta: 2.82 };

const HEIGHT = 17, PLINTH = 1.1;

export function buildBuldu(scene, groundY) {
  const root = new THREE.Group();
  root.position.set(BULDU.x, groundY, BULDU.z);
  root.rotation.y = BULDU.yaw;
  scene.add(root);

  const stone = new THREE.MeshStandardMaterial({ color: 0x8b8a84, roughness: 0.95 });
  const plinth = new THREE.Mesh(new THREE.CylinderGeometry(7.6, 8.3, PLINTH, 48), stone);
  plinth.position.y = PLINTH / 2; root.add(plinth);

  new GLTFLoader().load('models/buddha.glb', (gltf) => {
    const model = gltf.scene;
    model.updateMatrixWorld(true);
    const bb = new THREE.Box3().setFromObject(model), c = bb.getCenter(new THREE.Vector3());
    const holder = new THREE.Group();
    holder.scale.setScalar(HEIGHT / (bb.max.y - bb.min.y));
    holder.position.y = PLINTH;
    model.position.set(-c.x, -bb.min.y, -c.z);
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.color.set(0x8c8064);    // 금빛 질감 위에 곱해 청동빛으로 낮춘다
      o.material.metalness = 0.25; o.material.roughness = 0.5;
      o.material.emissive?.set(0x171208);
    });
    holder.add(model); root.add(holder);
  });
  return root;
}
