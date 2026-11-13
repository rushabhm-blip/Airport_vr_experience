import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { cloneSkinned } from '../assets.js';

/**
 * Real, finished characters (the same people as the staff, shrunk to about 10,000 triangles) for the people nearest to you.
 * Six bodies, made different from each other by skin tone, hair colour, clothes, height and build. Each person near you is given one
 * of these and follows the crowd's own movement (walking, standing, queueing). Seated people stay with the crowd's own seated model.
 */
const BASE = new URL('../../assets/people/lite/', import.meta.url).href;
const FEMALE = ['checkin', 'crew', 'security'], MALE = ['driver', 'gate', 'guard'];
// how strongly each kind of material is re-coloured (the garment texture's own average colour is divided out, so the pattern stays)
const SKIN_TONES = [0xf3cfb0, 0xe0b48e, 0xc99063, 0xa97248, 0x8a5a3a, 0x6a4430];
const HAIR_TONES = [0x1a1410, 0x2c2018, 0x4a3426, 0x120f0c, 0x6a6a6a, 0xb8b8b8, 0xd6d6d6];
const CLOTH = [0xc2573a, 0x2f6f9f, 0x7aa05a, 0xd8b04a, 0x8a5a9b, 0xe9e4da, 0x395a5a, 0xb03a48, 0x4b8f8a, 0xe8c9a0, 0x3d4f91, 0xf3f0e8, 0x7a8c3a, 0xd97b3c, 0x1f8a70, 0xc0392b];
const DRESS = [0xc0392b, 0x1f8a70, 0x2c5aa0, 0xe0a030, 0x8e3a7a, 0xd45a8a, 0x138d90, 0xe9e4da, 0x3d4f91, 0xd97b3c];
const TROUSER = [0x2b3040, 0x3a3f4c, 0x57534b, 0x1f2630, 0x6b5a45, 0x41556b, 0x2a2a2a, 0x8a8470];

let cache = null;
export function loadGlbPeople() {
  if (cache) return cache;
  cache = Promise.all([...FEMALE, ...MALE].map((n) => new GLTFLoader().loadAsync(BASE + n + '-lite.glb').then((g) => [n, g]))).then((list) => Object.fromEntries(list)).catch(() => null);
  return cache;
}

const avgOf = (mat) => {
  if (mat.userData.avg) return mat.userData.avg;
  let a = [0.6, 0.6, 0.6];
  try {
    const img = mat.map?.image; if (img) { const c = document.createElement('canvas'); c.width = c.height = 8; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 8, 8); const d = x.getImageData(0, 0, 8, 8).data; let r = 0, g = 0, b = 0, n = 0; for (let i = 0; i < d.length; i += 4) { if (d[i + 3] < 30) continue; r += d[i]; g += d[i + 1]; b += d[i + 2]; n++; } if (n) { const col = new THREE.Color().setRGB(r / n / 255, g / n / 255, b / n / 255, THREE.SRGBColorSpace); a = [col.r, col.g, col.b]; } }
  } catch { /* keep the default */ }
  mat.userData.avg = a; return a;
};
/** Re-colour a material so its average colour becomes `hex`, keeping the texture's pattern. */
const tint = (mat, hex, boost = 1) => {
  const want = new THREE.Color(hex);
  if (!mat.map) { mat.color.copy(want).multiplyScalar(boost); return; }
  const a = avgOf(mat); mat.color.setRGB(Math.min(4, want.r / Math.max(0.03, a[0])) * boost, Math.min(4, want.g / Math.max(0.03, a[1])) * boost, Math.min(4, want.b / Math.max(0.03, a[2])) * boost);
};

export class GlbPeople {
  constructor(parent, { size = 12, radius = 9 } = {}) {
    this.group = new THREE.Group(); this.group.name = 'GlbPeople'; parent.add(this.group);
    this.size = size; this.radius = radius; this.entries = []; this.ready = false; this.bound = new Map();
    loadGlbPeople().then((models) => { if (!models || this.disposed) return; this._build(models); this.ready = true; });
  }

  _build(models) {
    const names = Object.keys(models);
    for (let i = 0; i < this.size; i++) {
      const name = i < this.size / 2 ? FEMALE[i % 3] : MALE[i % 3], g = models[name];
      const model = cloneSkinned(g.scene);
      model.traverse((o) => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); o.frustumCulled = false; o.castShadow = false; } });
      const box = new THREE.Box3().setFromObject(model), h = box.max.y - box.min.y;
      const root = new THREE.Group(); root.add(model); model.scale.setScalar(1.74 / h); root.visible = false; this.group.add(root);
      const mixer = new THREE.AnimationMixer(model), idle = g.animations.find((a) => a.name === 'Idle'), walk = g.animations.find((a) => a.name === 'Walk');
      const aI = mixer.clipAction(idle).play(), aW = mixer.clipAction(walk).play(); aI.setEffectiveWeight(1); aW.setEffectiveWeight(0);
      const bones = { arm: model.getObjectByName('RightArm'), fore: model.getObjectByName('RightForeArm') }; for (const b of Object.values(bones)) if (b) b.userData.rest = b.quaternion.clone();
      const mats = {}; model.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { mats[m.name] = m; }); });
      this.entries.push({ name, female: FEMALE.includes(name), root, model, mixer, aI, aW, mats, bones, who: null, wI: 1, wW: 0, phase: Math.random() * 3 });
    }
  }

  _dress(e, p) {
    const m = e.mats, r = (arr, k) => arr[((p.seedA + k * 7) >>> 0) % arr.length];
    tint(m.Skin, SKIN_TONES[p.skinIdx ?? 2], 1.0);
    if (m.Hair) tint(m.Hair, HAIR_TONES[p.hairIdx ?? 0], p.hairIdx >= 4 ? 1.35 : 1);
    if (m.Beard) tint(m.Beard, HAIR_TONES[p.hairIdx ?? 0], 1);
    const cloth = p.female ? r(DRESS, 1) : r(CLOTH, 1);
    if (m.Outfit) tint(m.Outfit, p.female ? cloth : (e.name === 'gate' ? r([0x22303f, 0x3a3f4c, 0x57534b, 0x6b5a45, 0x2a2a2a, 0x41556b], 3) : cloth));
    if (m['Uniform shirt']) tint(m['Uniform shirt'], cloth);
    if (m['Uniform trousers']) tint(m['Uniform trousers'], r(TROUSER, 2));
    if (m.Shoes) tint(m.Shoes, r([0x1c1c1e, 0x3a2a1d, 0xe8e8e8, 0x2a3a5a, 0x5a4a3a], 4));
    e.root.userData.wide = 0.92 + (((p.seedA >>> 3) % 20) / 100);          // build: narrower to broader
  }

  /** Give the nearest standing or walking people a real character; free the ones that moved away. Returns the set of bound people. */
  assign(people, cam) {
    if (!this.ready) return;
    const R2 = this.radius * this.radius, R2out = (this.radius + 1.5) ** 2;
    for (const [p, e] of [...this.bound]) {                                           // release those that left, sat down or are gone
      const d2 = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2;
      if (d2 > R2out || p.mode === 'sit') { e.who = null; e.root.visible = false; this.bound.delete(p); p.glb = null; }
    }
    const want = []; for (const p of people) { if (p.glb || p.mode === 'sit') continue; const d2 = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2; if (d2 < R2) want.push([d2, p]); }
    want.sort((a, b) => a[0] - b[0]);
    for (const [, p] of want) {
      const free = this.entries.find((e) => !e.who && e.female === p.female) || this.entries.find((e) => !e.who); if (!free) break;
      free.who = p; this.bound.set(p, free); p.glb = free; this._dress(free, p); free.root.visible = true; free.phase = Math.random() * 3;
    }
  }

  update(dt) {
    for (const [p, e] of this.bound) {
      const s = p.scale * (p.child ? 1 : 1), wide = e.root.userData.wide ?? 1;
      e.root.position.set(p.x, p.y, p.z); e.root.rotation.y = p.yaw; e.root.scale.set(s * wide, s, s * (0.96 + (wide - 0.92) * 0.4));
      const moving = p.stride > 0.05, k = Math.min(1, dt * 6);
      e.wW += ((moving ? 1 : 0) - e.wW) * k; e.wI = 1 - e.wW; e.aW.setEffectiveWeight(e.wW); e.aI.setEffectiveWeight(Math.max(0.001, e.wI));
      e.aW.setEffectiveTimeScale(Math.max(0.25, Math.min(1.6, (p.vNow || 0.7) / 1.25))); e.aI.setEffectiveTimeScale(0.9 + ((p.seedA >>> 5) % 20) / 100);
      e.mixer.update(dt);
      if (p.bag === 'roll' && e.bones.arm) { const a = window.__arm ?? [-0.75, 0, 0.42], f = window.__fore ?? [0.25, 0, 0]; this._hold(e.bones.arm, a); this._hold(e.bones.fore, f); }     // the right hand takes the suitcase handle, held low and a little behind
    }
  }

  _hold(b, eu) { if (!b?.userData.rest) return; this._q ??= new THREE.Quaternion(); this._e ??= new THREE.Euler(); b.quaternion.copy(b.userData.rest).multiply(this._q.setFromEuler(this._e.set(eu[0], eu[1], eu[2]))); }

  dispose() { this.disposed = true; this.group.removeFromParent(); for (const e of this.entries) e.model.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }); }
}
