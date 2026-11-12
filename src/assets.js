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
