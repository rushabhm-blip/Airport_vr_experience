import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { AssetActions } from './lesson/asset-actions.mjs';
import { tileTexture, boxUV } from './world/images.js';

// Real textures (assets/images) laid over the pack's plain materials. [image, metres per repeat]
const MESH_TEX = {
  'terminal-floor-module': { FloorSlab: ['tex-floor', 2.4] },
  'terminal-wall-module': { Wall: ['tex-wall', 1.5] },
  'boarding-counter': { CounterTop: ['tex-counter', 0.9] },
  'checkin-counter': { CounterTop: ['tex-counter', 0.9] },
  'information-desk': { CounterTop: ['tex-counter', 0.9] },
  'aircraft-cabin-section': { CabinFloor: ['tex-carpet', 0.6] },
};
const MATERIAL_TEX = { 'Navy upholstery': ['tex-seat', 0.3] };
const HIDE = { 'terminal-floor-module': /^Grout/, 'terminal-window-module': /^GlassPane/ }; // the photo already has grout; windows show the real view

function retexture(id, root) {
  const hide = HIDE[id], byMesh = MESH_TEX[id];
  root.traverse((o) => {
    if (!o.isMesh || Array.isArray(o.material)) return;
    if (hide?.test(o.name)) { o.visible = false; return; }
    const cfg = byMesh?.[o.name] || MATERIAL_TEX[o.material?.name];
    if (!cfg) return;
    const tex = tileTexture(cfg[0]); if (!tex) return;
    boxUV(o.geometry, cfg[1]);
    o.material = o.material.clone(); o.material.userData.owned = true;
    o.material.map = tex; o.material.color?.set(0xffffff); o.material.needsUpdate = true;
  });
}

/** Clone a skinned model so each copy has its own skeleton (a plain scene.clone(true) would share the source bones). */
export function cloneSkinned(source) {
  const clone = source.clone(true);
  const src = [], dst = [];
  source.traverse((o) => { if (o.isSkinnedMesh) src.push(o); });
  clone.traverse((o) => { if (o.isSkinnedMesh) dst.push(o); });
  src.forEach((s, i) => {
    const c = dst[i];
    const bones = s.skeleton.bones.map((b) => clone.getObjectByName(b.name));
    c.skeleton = new THREE.Skeleton(bones, s.skeleton.boneInverses);
    c.bind(c.skeleton, s.bindMatrix);
    if (s.morphTargetInfluences) c.morphTargetInfluences = s.morphTargetInfluences.slice();
  });
  return clone;
}

/** Loads the Saath airport GLBs once and hands out clones that keep node names/hierarchy. */
export class Assets {
  constructor(base = './assets/') {
    this.base = base;
    this.loader = new GLTFLoader();
    this.cache = new Map();
    this.catalog = null;
    this.layouts = null;
    this.byId = new Map();
    this.live = new Set(); // AssetActions of instances currently in the scene
  }

  async init() {
    const [cat, lay] = await Promise.all([
      fetch(this.base + 'catalog.json').then((r) => r.json()),
      fetch(this.base + 'scene-layouts.json').then((r) => r.json()),
    ]);
    this.catalog = cat; this.layouts = lay;
    for (const a of cat.assets) this.byId.set(a.id, a);
  }

  /**
   * Optional rigged characters: assets/people/<role>.glb for driver, guard, checkin, security, gate, crew. Animation clips are kept.
   * A missing file is fine: that role keeps its photo cut-out.
   */
  async loadPeople(kinds = ['driver', 'guard', 'checkin', 'security', 'gate', 'crew']) {
    this.people = this.people || new Map();
    try { const r = await fetch(this.base + 'people/manifest.json'); if (!r.ok) return this.people; const m = await r.json(); kinds = kinds.filter((k) => m[k]); } catch { return this.people; }   // no manifest = no characters supplied yet
    await Promise.all(kinds.map(async (k) => {
      try { const g = await this.loader.loadAsync(`${this.base}people/${k}.glb`); this.people.set(k, { scene: g.scene, clips: g.animations }); }
      catch { /* not supplied yet */ }
    }));
    return this.people;
  }

  async preload(ids, onProgress) {
    let done = 0;
    await Promise.all(ids.map(async (id) => {
      if (!this.cache.has(id)) {
        const gltf = await this.loader.loadAsync(`${this.base}models/${id}.glb`);
        this.cache.set(id, gltf.scene);
      }
      onProgress?.(++done, ids.length);
    }));
  }

  /**
   * Clone a model. `unique` lists mesh names whose material must be private (screens, document faces)
   * so one instance can change its texture without affecting others.
   */
  make(id, { unique = [], actions = true } = {}) {
    const src = this.cache.get(id);
    if (!src) throw new Error('Asset not preloaded: ' + id);
    const root = src.clone(true);
    root.userData.assetId = id;
    root.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true; o.receiveShadow = true;
        if (unique.includes(o.name)) {
          o.material = o.material.clone();
          o.material.userData.owned = true;
          o.castShadow = false;
        }
      }
    });
    retexture(id, root);
    const meta = this.byId.get(id);
    if (actions && meta?.actions?.length) {
      try { root.userData.actions = new AssetActions(root, meta.actions); this.live.add(root.userData.actions); } catch (e) { console.warn('actions', id, e.message); }
    }
    return root;
  }

  node(root, name) { return root.getObjectByName(name); }

  /** Local position of a catalogued target node (mount, scan target...). */
  target(id, nodeName) {
    return this.byId.get(id)?.targets?.find((t) => t.node === nodeName)?.local_position ?? null;
  }
}

/** Put a canvas texture on a named mesh of a model (glTF UV convention: flipY = false). */
export function paintMesh(root, meshName, canvas) {
  const mesh = root.getObjectByName(meshName);
  if (!mesh) return null;
  const tex = new THREE.CanvasTexture(canvas);
  tex.flipY = false;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  mesh.material.map = tex;
  mesh.material.emissiveMap = null;
  mesh.material.needsUpdate = true;
  mesh.material.userData.ownedMap = true;
  return tex;
}
