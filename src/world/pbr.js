import * as THREE from 'three';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

/** Real photographed surface materials (Poly Haven, CC0): polished floor tiles and ceiling panels, with roughness and normal maps. */
const BASE = new URL('../../assets/pbr/', import.meta.url).href;
const loader = new THREE.TextureLoader();
const cache = {};
const tex = (file, srgb, rx, ry, renderer) => {
  const key = file + rx + ry; if (cache[key]) return cache[key];
  const t = loader.load(BASE + file); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = renderer?.capabilities.getMaxAnisotropy?.() ?? 8;
  return (cache[key] = t);
};
/** Apply a PBR set to a MeshStandardMaterial. `name` is the prefix of the files, `rx`/`ry` how many times it tiles over the surface. */
export function applyPbr(mat, name, rx, ry, { normal = 0.8, rough = 1, tint = 0xffffff } = {}) {
  mat.map = tex(name + '_Diffuse.jpg', true, rx, ry); mat.roughnessMap = tex(name + '_Rough.jpg', false, rx, ry); mat.normalMap = tex(name + '_nor_gl.jpg', false, rx, ry);
  mat.normalScale = new THREE.Vector2(normal, normal); mat.roughness = rough; mat.color.set(tint); mat.needsUpdate = true;
}
let envP = null;
/** A real airport-terminal HDR panorama used for lighting and reflections. Resolves to a PMREM texture, or null if it can't load. */
export function loadAirportEnv(renderer) {
  if (envP) return envP;
  envP = new HDRLoader().loadAsync(BASE.replace('pbr/', 'hdri/') + 'airport_1k.hdr').then((t) => { t.mapping = THREE.EquirectangularReflectionMapping; const pm = new THREE.PMREMGenerator(renderer); const e = pm.fromEquirectangular(t).texture; pm.dispose(); t.dispose(); return e; }).catch(() => null);
  return envP;
}
/** The ceiling panels as a colour map for an unlit vault. */
export const pbrMap = (name, rx, ry) => tex(name + '_Diffuse.jpg', true, rx, ry);
