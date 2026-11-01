// 정원의 금동 불상: 법당 불상과 같은 3D 스캔을 크게 키워 금빛으로 입힌다
import * as THREE from './vendor/three.min.js';
import { GLTFLoader } from './vendor/GLTFLoader.min.js';

export const BULDU = { x: -6, z: 58, yaw: 2.82, stand: { x: -1.5, z: 44.4 }, viewTheta: 2.82 };

const HEIGHT = 17, PLINTH = 1.1;

export function buildBuldu(scene, groundY, getEnv) {
  const root = new THREE.Group(), gilded = [];
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
    const envMap = getEnv();
    model.traverse((o) => {
      if (!o.isMesh) return;
      o.material = o.material.clone();
      o.material.color.set(0xffffff);
      o.material.metalness = 0.6; o.material.roughness = 0.34;
      o.material.envMap = envMap;
      o.material.emissive.set(0xffffff);
      // 스캔의 명암만 남기고 색은 금박으로 칠한다. 등진 해에도 어두워지지 않게 금색이 스스로 은은히 빛난다
      o.material.onBeforeCompile = (sh) => {
        sh.fragmentShader = sh.fragmentShader
          .replace('#include <map_fragment>', `#include <map_fragment>
            float goldL = dot(diffuseColor.rgb, vec3(0.3, 0.6, 0.1));
            diffuseColor.rgb = mix(vec3(0.42, 0.22, 0.03), vec3(1.0, 0.72, 0.2), smoothstep(0.04, 0.42, goldL));`)
          .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
            totalEmissiveRadiance *= diffuseColor.rgb;`);
      };
      gilded.push(o.material);
    });
    holder.add(model); root.add(holder);
  });
  // 밤에는 금빛 반사도 함께 잦아든다
  root.userData.setLight = (k) => { for (const m of gilded) { m.envMapIntensity = 1.0 * k; m.emissiveIntensity = 0.38 - 0.2 * k; } };
  return root;
}
