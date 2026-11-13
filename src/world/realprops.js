import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

/** Real photographed-and-scanned props (Poly Haven, CC0), shrunk to a few thousand triangles each. They arrive a moment after the hall is built. */
const BASE = new URL('../../assets/props/', import.meta.url).href;
const cache = {};
const load = (n) => (cache[n] ??= new GLTFLoader().loadAsync(BASE + n + '.glb').then((g) => g.scene).catch(() => null));
/** items: [name, x, y, z, rotationY, scale] */
export function placeProps(group, items, envMap = null) {
  const holder = new THREE.Group(); holder.name = 'RealProps'; group.add(holder);
  for (const n of new Set(items.map((i) => i[0]))) load(n).then((scene) => {
    if (!scene) return;
    for (const [name, x, y, z, ry, s] of items) {
      if (name !== n) continue;
      const m = scene.clone(true); m.position.set(x, y, z); m.rotation.y = ry; m.scale.setScalar(s);
      m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = true; if (envMap && o.material) o.material.envMapIntensity = 0.8; } });
      holder.add(m);
    }
  });
  return holder;
}
