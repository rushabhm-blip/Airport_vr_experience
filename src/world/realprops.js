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

/** One real prop as a group (a clone made once the file has loaded), for code that wants to animate or hide it. onReady(scene) runs after loading. */
export function propGroup(name, scale = 1, ry = 0, onReady = null) {
  const g = new THREE.Group(); g.name = 'Prop-' + name;
  load(name).then((scene) => { if (!scene) return; const m = scene.clone(true); m.scale.setScalar(scale); m.rotation.y = ry; m.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.frustumCulled = false; } }); g.add(m); g.userData.body = m; onReady?.(m); });
  return g;
}
