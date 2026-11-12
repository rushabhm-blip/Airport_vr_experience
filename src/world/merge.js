import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Static batching: bakes every plain mesh under `root` that shares the same look (material values, shadow flags)
 * into one mesh per look. The picture is unchanged; the headset draws far fewer objects.
 * Skips anything animated, skinned, multi-material, invisible, or flagged `userData.noMerge` (on it or an ancestor).
 */
export function mergeStatic(root) {
  root.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const groups = new Map(); let before = 0;
  const blocked = (o) => { for (let p = o; p && p !== root.parent; p = p.parent) if (p.userData?.noMerge || p.visible === false) return true; return false; };
  root.traverse((o) => {
    if (!o.isMesh || o.isSkinnedMesh || o.isInstancedMesh || Array.isArray(o.material) || blocked(o)) return;
    const m = o.material, g = o.geometry;
    if (!m || !(m.isMeshStandardMaterial || m.isMeshBasicMaterial || m.isMeshLambertMaterial) || m.vertexColors || g.morphAttributes?.position) return;
    if (!g.attributes.position) return;
    const key = [m.type, m.color?.getHex(), m.map?.uuid, m.emissive?.getHex(), m.emissiveIntensity, m.emissiveMap?.uuid, m.roughness, m.metalness, m.side, m.transparent, m.opacity, m.alphaTest,
      m.toneMapped, m.envMapIntensity, m.normalMap?.uuid, m.roughnessMap?.uuid, m.aoMap?.uuid, m.depthWrite, o.castShadow, o.receiveShadow, o.renderOrder, o.layers.mask].join('|');
    (groups.get(key) ?? groups.set(key, { material: m, items: [] }).get(key)).items.push(o); before++;
  });

  const tmp = new THREE.Matrix4(); let after = 0;
  for (const { material, items } of groups.values()) {
    if (items.length < 2) continue;
    const parts = [];
    for (const o of items) {
      let g = o.geometry.clone();
      for (const n of Object.keys(g.attributes)) if (n !== 'position' && n !== 'normal' && n !== 'uv') g.deleteAttribute(n);
      g.morphAttributes = {};
      if (g.index) g = g.toNonIndexed();
      if (!g.attributes.normal) g.computeVertexNormals();
      if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
      tmp.multiplyMatrices(inv, o.matrixWorld);
      g.applyMatrix4(tmp);
      if (tmp.determinant() < 0) {          // a mirrored copy: turn the triangles round so they face out
        for (const n of ['position', 'normal', 'uv']) {
          const a = g.attributes[n], s = a.itemSize, arr = a.array;
          for (let i = 0; i + 2 < a.count; i += 3) for (let k = 0; k < s; k++) { const x = arr[(i + 1) * s + k]; arr[(i + 1) * s + k] = arr[(i + 2) * s + k]; arr[(i + 2) * s + k] = x; }
        }
      }
      parts.push(g);
    }
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    if (!merged) continue;
    merged.computeBoundingSphere(); merged.computeBoundingBox();
    const mesh = new THREE.Mesh(merged, material);
    mesh.castShadow = items[0].castShadow; mesh.receiveShadow = items[0].receiveShadow; mesh.renderOrder = items[0].renderOrder; mesh.layers.mask = items[0].layers.mask;
    mesh.name = 'merged'; mesh.userData.merged = true;
    for (const o of items) { o.parent?.remove(o); if (o.material !== material && o.material.userData?.owned) o.material.dispose(); }
    root.add(mesh); after++;
  }
  return { before, after, groups: groups.size };
}
