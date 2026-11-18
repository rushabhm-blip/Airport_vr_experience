import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { cloneSkinned } from '../assets.js';

/**
 * Real, finished characters (the same people as the staff, shrunk to about 10,000 triangles) for the people nearest to you.
 * Six bodies, made different from each other by skin tone, hair colour, clothes, height and build. Each person near you is given one
 * of these and follows the crowd's own movement (walking, standing, queueing). Seated people stay with the crowd's own seated model.
 */
const GRIP = [-0.36, 0.88, -0.24];      // the rolling suitcase's handle top, in the person's own space (it stands at their right, a little behind)
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
const BASE = new URL('../../assets/people/lite/', import.meta.url).href, BASE_MID = new URL('../../assets/people/mid/', import.meta.url).href;
const FEMALE = ['checkin', 'crew', 'security', 'kameez-woman'], MALE = ['driver', 'gate', 'guard', 'kurta-man'];
const OPTIONAL = new Set(['saree-woman', 'kameez-woman', 'kurta-man']);      // newer bodies: if a file is missing the crowd simply uses the others
const KURTA = [0xf1ead8, 0xe3c27a, 0x1f6f8f, 0x8c2a3a, 0x3d4f91, 0xf6f3ea, 0x2f6b55, 0xb7413a, 0x5b6fa8, 0xd98c2f, 0xc9a24a, 0x7a3b69];
const PYJAMA = [0xf6f3ea, 0xe9d9b5, 0xf1ead8, 0x2b3040, 0xe9e4da];
// how strongly each kind of material is re-coloured (the garment texture's own average colour is divided out, so the pattern stays)
const FACE_SKIN = 0xc09070;
const SKIN_TONES = [0xc58f62, 0xb67e53, 0xa56b44, 0x935c3a, 0x7e4d2e, 0x663d25, 0xdcae86, 0xe0b48e, 0xd09a6a];
const HAIR_TONES = [0x0e0b09, 0x17110d, 0x261a12, 0x0a0807, 0x6b6762, 0x938e88, 0xb8b3ad];
const CLOTH = [0xe3c27a, 0x1f6f8f, 0x8c2a3a, 0xf1ead8, 0x3d4f91, 0xd98c2f, 0x2f6b55, 0xb7413a, 0x5b6fa8, 0xe9d9b5, 0x7a3b69, 0xf6f3ea, 0x3a7d7b, 0xc9a24a, 0x274472, 0x9a2f2f];
const DRESS = [0xa3223a, 0x1f7a5c, 0x1e4fa0, 0xe0a030, 0x8e2a6e, 0xc94f7c, 0x0f7f86, 0xd9641c, 0x5b3a8c, 0xf1e8d0, 0xb4472b, 0x2c7a3f];
const TROUSER = [0x2b3040, 0x3a3f4c, 0x57534b, 0x1f2630, 0x6b5a45, 0x41556b, 0x2a2a2a, 0x8a8470];

/**
 * Small Indian details built straight onto the skeleton at its rest pose: a bindi, glass/gold bangles, spectacles, and a dupatta draped across the chest.
 * Geometry is made in the model's own space (metres, rest pose) and moved into each bone's space, so it follows the animation.
 */
export function makeAccessories(model) {
  let face = false, skin = false; model.traverse((o) => { if (o.isMesh) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (m.name === 'Face') face = true; if (m.name === 'Skin') skin = true; } });
  if (face && !skin) return { bindi: null };       // a whole sculpted character already carries its own jewellery, glasses and scarves
  model.updateMatrixWorld(true);
  const bone = (n) => model.getObjectByName(n), rest = (b) => new THREE.Matrix4().copy(b.matrixWorld).invert();
  const skins = []; model.traverse((o) => { if (o.isSkinnedMesh) { o.skeleton.update(); skins.push(o); } });
  const rc = new THREE.Raycaster(), SKIP = /^(Hair|Eyes|Eyebrows|Eyelashes|Beard)$/;
  // z of the first body or clothing surface seen from the front at (x, y); `only` restricts it to one material (the bare skin, for the bindi)
  const hit = (x, y, only = null) => { rc.set(new THREE.Vector3(x, y, 0.8), new THREE.Vector3(0, 0, -1)); for (const h of rc.intersectObjects(skins, false)) { const mt = Array.isArray(h.object.material) ? h.object.material[h.face.materialIndex] : h.object.material, n = mt?.name || ''; if (only ? n === only : !SKIP.test(n)) return h.point.z; } return null; };
  const mk = (geo, bn, mat) => { const b = bone(bn); if (!b) return null; geo.applyMatrix4(rest(b)); const m = new THREE.Mesh(geo, mat); m.frustumCulled = false; m.visible = false; m.castShadow = false; b.add(m); return m; };
  const out = {};
  out.bindi = null;      // no forehead dot on anyone
  // spectacles: two thin rims and a bridge in front of the eyes
  const rim = (x) => new THREE.TorusGeometry(0.0135, 0.0012, 6, 18).translate(x, 1.474, 0.137);
  out.glasses = mk(mergeGeometries([rim(0.028), rim(-0.028), new THREE.BoxGeometry(0.014, 0.002, 0.002).translate(0, 1.478, 0.137), new THREE.BoxGeometry(0.0015, 0.0015, 0.07).translate(0.0415, 1.474, 0.102), new THREE.BoxGeometry(0.0015, 0.0015, 0.07).translate(-0.0415, 1.474, 0.102)]), 'Head', new THREE.MeshStandardMaterial({ color: 0x2a2623, roughness: 0.4, metalness: 0.4 }));
  // bangles on both wrists: a stack of thin rings around the forearm, just above the hand
  const rings = [];
  for (const side of ['Left', 'Right']) {
    const f = bone(side + 'ForeArm'), h = bone(side + 'Hand'); if (!f || !h) continue;
    const a = new THREE.Vector3().setFromMatrixPosition(f.matrixWorld), c = new THREE.Vector3().setFromMatrixPosition(h.matrixWorld), dir = c.clone().sub(a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir), base = a.clone().lerp(c, 0.84);
    const g = mergeGeometries(Array.from({ length: 6 }, (_, k) => new THREE.TorusGeometry(0.029, 0.0036, 6, 16).applyQuaternion(q).translate(...base.clone().addScaledVector(dir, -k * 0.0085).toArray())));
    out['bangle' + side[0]] = mk(g, side + 'ForeArm', new THREE.MeshStandardMaterial({ color: 0xd4a437, roughness: 0.3, metalness: 0.8 }));
  }
  // dupatta: a soft band over the left shoulder, across the chest to the right hip, following the body surface
  const A = [0.095, 1.30], B = [-0.125, 0.985], N = 9, pos = [], idx = [], W = 0.04;
  const dx = B[0] - A[0], dy = B[1] - A[1], L = Math.hypot(dx, dy), px = -dy / L, py = dx / L;
  for (let i = 0; i <= N; i++) {
    const t = i / N, cx = A[0] + dx * t, cy = A[1] + dy * t;
    for (const sgn of [1, -1]) { const x = cx + px * W * sgn, y = cy + py * W * sgn, z = hit(x, y) ?? 0.12; pos.push(x, y, z + 0.011); }
    if (i) { const k = i * 2; idx.push(k - 2, k - 1, k, k - 1, k + 1, k); }
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); sg.setIndex(idx); sg.computeVertexNormals();
  out.sash = mk(sg, 'Spine2', new THREE.MeshStandardMaterial({ color: 0xe0a030, roughness: 0.8, side: THREE.DoubleSide }));
  return out;
}

// six saree colourways (body cloth and pallu), swapped onto the one saree model
const SAREE_FIELD = [0x8c1b2a, 0x0a5c3c, 0x1c3f9e, 0xd1901a, 0xa31260, 0x0a6166];
let sareeTex = null;
function loadSareeTextures() {
  if (sareeTex) return sareeTex;
  const base = new URL('../../assets/people/cloth/', import.meta.url).href, tl = new THREE.TextureLoader();
  const mk = (n) => { const t = tl.load(base + n + '.webp'); t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  sareeTex = { body: [0, 1, 2, 3, 4, 5].map((k) => mk('saree_body_' + k)), pallu: [0, 1, 2, 3, 4, 5].map((k) => mk('saree_pallu_' + k)) };
  return sareeTex;
}

/**
 * The hair texture is a card atlas with pale highlights and dark roots. Tinted dark, that contrast shows up as stripes (cornrows) on the scalp.
 * This pulls every pixel most of the way to the texture's average colour (keeping the alpha shape), so the hair stays dark with soft strands.
 */
const softHair = new WeakMap();
export function softenHair(mat, keep = 0.3) {
  const img = mat.map?.image; if (!img || mat.userData.soft) return; mat.userData.soft = true;
  let tex = softHair.get(img);
  if (!tex) {
    try {
      const c = document.createElement('canvas'); c.width = c.height = 512; const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(img, 0, 0, 512, 512);
      const d = x.getImageData(0, 0, 512, 512), px = d.data; let r = 0, g = 0, b = 0, n = 0;
      for (let i = 0; i < px.length; i += 4) if (px[i + 3] > 128) { r += px[i]; g += px[i + 1]; b += px[i + 2]; n++; }
      if (n) { r /= n; g /= n; b /= n; for (let i = 0; i < px.length; i += 4) { px[i] = px[i] * keep + r * (1 - keep); px[i + 1] = px[i + 1] * keep + g * (1 - keep); px[i + 2] = px[i + 2] * keep + b * (1 - keep); } }
      x.putImageData(d, 0, 0); tex = new THREE.CanvasTexture(c); tex.flipY = mat.map.flipY; tex.colorSpace = mat.map.colorSpace; tex.anisotropy = 4; softHair.set(img, tex);
    } catch { return; }
  }
  mat.map = tex; mat.userData.avg = undefined; mat.needsUpdate = true;
}

/** Extra body-language clips (phone, talking, hands clasped, arms crossed, watch, sitting), authored on the same skeleton so they play on every body. */
let animsP = null;
export function loadAnims() {
  animsP ??= new GLTFLoader().loadAsync(new URL('../../assets/people/anims.glb', import.meta.url).href).then((g) => Object.fromEntries(g.animations.map((a) => [a.name, a]))).catch(() => null);
  return animsP;
}

/** A fine, tiling skin-pore / micro-relief normal map, so skin keeps detail when you are close. */
let skinDetailTex = null;
export function skinDetail() {
  if (skinDetailTex) return skinDetailTex;
  const N = 256, h = new Float32Array(N * N); let seed = 12345; const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (const [cell, amp] of [[2, 0.5], [4, 0.35], [8, 0.2], [16, 0.12]]) {          // value noise at several scales, wrapped so it tiles
    const g = new Float32Array(cell * cell).map(() => rnd());
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      const fx = (x / N) * cell, fy = (y / N) * cell, x0 = Math.floor(fx) % cell, y0 = Math.floor(fy) % cell, x1 = (x0 + 1) % cell, y1 = (y0 + 1) % cell, tx = fx - Math.floor(fx), ty = fy - Math.floor(fy);
      const sx = tx * tx * (3 - 2 * tx), sy = ty * ty * (3 - 2 * ty);
      h[y * N + x] += amp * ((g[y0 * cell + x0] * (1 - sx) + g[y0 * cell + x1] * sx) * (1 - sy) + (g[y1 * cell + x0] * (1 - sx) + g[y1 * cell + x1] * sx) * sy);
    }
  }
  for (let i = 0; i < h.length; i++) h[i] += 0.18 * rnd();                                  // fine pore speckle
  const c = document.createElement('canvas'); c.width = c.height = N; const x2 = c.getContext('2d'), img = x2.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const dx = h[y * N + ((x + 1) % N)] - h[y * N + ((x + N - 1) % N)], dy = h[((y + 1) % N) * N + x] - h[((y + N - 1) % N) * N + x], l = Math.hypot(dx * 3, dy * 3, 1), i = (y * N + x) * 4;
    img.data[i] = (-dx * 3 / l * 0.5 + 0.5) * 255; img.data[i + 1] = (-dy * 3 / l * 0.5 + 0.5) * 255; img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255; img.data[i + 3] = 255;
  }
  x2.putImageData(img, 0, 0); skinDetailTex = new THREE.CanvasTexture(c); skinDetailTex.wrapS = skinDetailTex.wrapT = THREE.RepeatWrapping; skinDetailTex.repeat.set(10, 10); skinDetailTex.anisotropy = 4;
  return skinDetailTex;
}

let cache = null;
export function loadGlbPeople() {
  if (cache) return cache;
  const load = (base, suffix) => Promise.all([...new Set([...FEMALE, ...MALE, 'saree-woman'])].map((n) => new GLTFLoader().loadAsync(base + n + suffix).then((g) => [n, g]).catch((e) => (OPTIONAL.has(n) ? [n, null] : Promise.reject(e))))).then((list) => Object.fromEntries(list)).catch(() => null);      // the saree body is optional
  cache = Promise.all([load(BASE, '-lite.glb'), load(BASE_MID, '-mid.glb')]).then(([lite, mid]) => (lite ? { lite, mid } : null));     // the close-up set, and a lighter set for the next ring out
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
export const tint = (mat, hex, boost = 1) => {
  const want = new THREE.Color(hex);
  if (!mat.map) { mat.color.copy(want).multiplyScalar(boost); return; }
  const a = avgOf(mat); mat.color.setRGB(Math.min(4, want.r / Math.max(0.03, a[0])) * boost, Math.min(4, want.g / Math.max(0.03, a[1])) * boost, Math.min(4, want.b / Math.max(0.03, a[2])) * boost);
};

export class GlbPeople {
  constructor(parent, { size = 12, radius = 9, mid = null, sarees = 2 } = {}) {
    this.group = new THREE.Group(); this.group.name = 'GlbPeople'; this.group.userData.owner = this; parent.add(this.group);      // owner: reachable from the scene for debugging
    this.size = size; this.radius = radius; this.mid = mid; this.sarees = sarees; this.anims = null; loadAnims().then((a) => { this.anims = a; }); this.entries = []; this.ready = false; this.bound = new Map();
    loadGlbPeople().then((sets) => { if (!sets || this.disposed) return; this._build(sets.lite, this.size, 'near', this.sarees); if (this.mid && sets.mid) this._build(sets.mid, this.mid.size, 'mid', this.mid.sarees ?? 4); this.ready = true; });
  }

  _build(models, count, tier, sarees = 0) {
    const list = Array.from({ length: count }, (_, i) => (i < count / 2 ? FEMALE[i % FEMALE.length] : MALE[i % MALE.length])).map((n) => (models[n] ? n : (FEMALE.includes(n) ? 'checkin' : 'gate')));
    if (models['saree-woman']) for (let i = 0; i < sarees; i++) list.push('saree-woman');
    for (const name of list) {
      const g = models[name];
      const model = cloneSkinned(g.scene);
      model.traverse((o) => { if (o.isMesh) { o.material = Array.isArray(o.material) ? o.material.map((m) => m.clone()) : o.material.clone(); o.frustumCulled = false; o.castShadow = false; } });
      const acc = tier === 'near' ? makeAccessories(model) : null;
      let phone = null; const rh = model.getObjectByName('RightHand');
      if (tier === 'near' && rh) {          // a phone that appears in the right hand during the phone posture
        phone = new THREE.Group(); phone.visible = false;
        const pb = new THREE.Mesh(new THREE.BoxGeometry(0.074, 0.152, 0.009), new THREE.MeshStandardMaterial({ color: 0x16181c, roughness: 0.35, metalness: 0.3 }));
        const ps = new THREE.Mesh(new THREE.PlaneGeometry(0.066, 0.140), new THREE.MeshBasicMaterial({ color: 0x8fc0ff, toneMapped: false })); ps.position.z = 0.0052;
        phone.add(pb, ps); phone.position.set(...(window.__phPos ?? [0.0, 0.045, 0.02])); phone.rotation.set(...(window.__phRot ?? [0, 0, 0])); rh.add(phone);
      }
      const box = new THREE.Box3().setFromObject(model), h = box.max.y - box.min.y;
      const root = new THREE.Group(); root.add(model); model.scale.setScalar(1.74 / h); root.visible = false; this.group.add(root);
      const mixer = new THREE.AnimationMixer(model), idle = g.animations.find((a) => a.name === 'Idle'), walk = g.animations.find((a) => a.name === 'Walk');
      const aI = mixer.clipAction(idle).play(), aW = walk ? mixer.clipAction(walk).play() : null; aI.setEffectiveWeight(1); aW?.setEffectiveWeight(0);      // the saree body has no walk: sarees stand, queue and gesture
      const bones = { arm: model.getObjectByName('RightArm'), fore: model.getObjectByName('RightForeArm'), hand: model.getObjectByName('RightHand'), head: model.getObjectByName('Head'), neck: model.getObjectByName('Neck'), chest: model.getObjectByName('Spine2'), hips: model.getObjectByName('Hips') }; for (const b of Object.values(bones)) if (b) b.userData.rest = b.quaternion.clone();
      const mats = {}; model.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => { mats[m.name] = m; }); });
      this.entries.push({ tier, name, female: FEMALE.includes(name) || name === 'saree-woman', kind: (name === 'saree-woman' || name === 'kameez-woman') ? 'saree' : 'body', root, model, mixer, aI, aW, mats, bones, phone, who: null, wI: 1, wW: 0, wA: 0, alt: null, altName: null, phase: Math.random() * 3, acc, hy: 0, hp: 0, gy: 0, gp: 0, gT: 1 + Math.random() * 3, hold: 0 });
    }
  }

  _dress(e, p) {
    const m = e.mats, r = (arr, k) => arr[((p.seedA + k * 7) >>> 0) % arr.length];
    const faced = !!m.Face, tone = faced ? FACE_SKIN : SKIN_TONES[p.skinIdx ?? 2];      // a sculpted head brings its own skin: the body skin is matched to it instead
    if (m.Skin) tint(m.Skin, tone, 0.9); if (m['Skin body']) m['Skin body'].color.set(tone);
    if (e.tier === 'near' && m.Skin && !m.Skin.normalMap) { m.Skin.normalMap = skinDetail(); m.Skin.normalScale.set(0.45, 0.45); m.Skin.needsUpdate = true; }
    if (m.Hair) softenHair(m.Hair);
    if (m.Hair) tint(m.Hair, HAIR_TONES[p.hairIdx ?? 0], p.hairIdx >= 4 ? 1.1 : 1);
    if (m.Beard) tint(m.Beard, HAIR_TONES[p.hairIdx ?? 0], 1);
    const cloth = p.female ? r(DRESS, 1) : r(CLOTH, 1);
    if (m.Kurta && e.kind !== 'saree') { tint(m.Kurta, p.female ? r(DRESS, 1) : r(KURTA, 1)); if (m.Trousers) tint(m.Trousers, p.female ? r(DRESS, 2) : r(PYJAMA, 2)); }
    if (m.Outfit) tint(m.Outfit, p.female ? cloth : (e.name === 'gate' ? r([0x22303f, 0x3a3f4c, 0x57534b, 0x6b5a45, 0x2a2a2a, 0x41556b], 3) : cloth));
    if (m['Uniform shirt']) tint(m['Uniform shirt'], cloth);
    if (m['Uniform trousers']) tint(m['Uniform trousers'], r(TROUSER, 2));
    if (m.Shoes) tint(m.Shoes, r([0x1c1c1e, 0x3a2a1d, 0xe8e8e8, 0x2a3a5a, 0x5a4a3a], 4));
    for (const k of (e.kind === 'saree' ? [] : ['Outfit', 'Uniform shirt', 'Uniform trousers'])) if (m[k]) { m[k].map = null; m[k].roughness = 0.85; m[k].needsUpdate = true; }      // plain cloth instead of the knit pattern
    if (e.kind === 'saree') {
      const k = (p.seedA >>> 2) % 6, T = loadSareeTextures();
      if (m.Saree) { m.Saree.map = T.body[k]; m.Saree.needsUpdate = true; }
      if (m['Saree pallu']) { m['Saree pallu'].map = T.pallu[k]; m['Saree pallu'].needsUpdate = true; }
      if (m.Blouse) { m.Blouse.map = null; m.Blouse.color.set(SAREE_FIELD[k]); m.Blouse.roughness = 0.6; m.Blouse.needsUpdate = true; }
    }
    const A = e.acc, rr = (k) => ((p.seedA >>> k) % 100) / 100, elder = (p.hairIdx ?? 0) >= 4;
    if (A) {
      const f = !!p.female;
      if (A.bindi) A.bindi.visible = f && rr(3) < 0.8;
      if (A.glasses) A.glasses.visible = !m.Face && elder ? rr(5) < 0.55 : rr(5) < 0.12;
      for (const k of ['bangleL', 'bangleR']) if (A[k]) { A[k].visible = f && rr(9) < 0.85; A[k].material.color.set([0xd4a437, 0xd4a437, 0xb3262e, 0x2f7d4a, 0x2c5aa0][((p.seedA >>> 11) % 5)]); }
      if (A.sash) { A.sash.visible = e.kind !== 'saree' && f && rr(13) < 0.6; A.sash.material.color.set(r(DRESS, 5)); }
    }
    e.root.userData.wide = 0.92 + (((p.seedA >>> 3) % 20) / 100);          // build: narrower to broader
    e.model.scale.x = Math.abs(e.model.scale.x) * (p.bag !== 'roll' && ((p.seedA >>> 15) & 1) ? -1 : 1);      // a mirror image half the time, so the same body is less recognisable (not with a suitcase in the right hand)
  }

  /** Give the nearest standing or walking people a real character (the full one very close, the lighter one further out); free the ones that moved away. */
  assign(people, cam) {
    if (!this.ready) return;
    this.cam = cam;
    const Rn = this.radius, Rm = this.mid ? Math.max(this.mid.radius, Rn) : Rn, far = (Rm + 1.5) ** 2;
    for (const [p, e] of [...this.bound]) {                                           // release those that left, sat down or are gone
      const d2 = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2;
      if (d2 > far || (p.mode === 'sit' && !(this.anims && e.tier === 'near')) || (e.kind === 'saree' && p.stride > 0.05)) { e.who = null; e.root.visible = false; this.bound.delete(p); p.glb = null; }
    }
    const want = []; for (const p of people) { if (p.mode === 'sit' && !this.anims) continue; const d2 = (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2; if (d2 < far) want.push([d2, p]); }
    want.sort((a, b) => a[0] - b[0]);
    let nNear = 0, nMid = 0;
    for (const [d2, p] of want) {
      const was = p.glb?.tier, hy = (t) => (was === t ? 1.2 : 0);
      let tier = null;
      if (nNear < this.size && d2 < (Rn + hy('near')) ** 2) { tier = 'near'; nNear++; }
      else if (this.mid && p.mode !== 'sit' && nMid < this.mid.size && d2 < (Rm + hy('mid')) ** 2) { tier = 'mid'; nMid++; }
      if (was && was !== tier) { const e = p.glb; e.who = null; e.root.visible = false; this.bound.delete(p); p.glb = null; }
      if (!tier || p.glb) continue;
      const pool = this.entries.filter((e) => !e.who && e.tier === tier), still = p.female && p.dress && p.stride < 0.05 && (p.mode === 'idle' || p.mode === 'queue');
      // avoid twins: prefer a body nobody within 7 m is already wearing
      const near = new Set(); for (const [q, e] of this.bound) if ((q.x - p.x) ** 2 + (q.z - p.z) ** 2 < 49) near.add(e.name);
      const pick = (ok) => pool.find((e) => ok(e) && !near.has(e.name)) || pool.find(ok);
      const free = (still && pick((e) => e.kind === 'saree')) || pick((e) => e.kind !== 'saree' && e.female === p.female) || pick((e) => e.kind !== 'saree'); if (!free) continue;
      free.who = p; this.bound.set(p, free); p.glb = free; this._dress(free, p); free.root.visible = true; free.phase = Math.random() * 3;
    }
  }

  update(dt) {
    for (const [p, e] of this.bound) {
      const s = p.scale * (p.child ? 1 : 1), wide = e.root.userData.wide ?? 1;
      e.root.position.set(p.x, p.y, p.z); e.root.rotation.y = p.yaw; e.root.scale.set(s * wide, s, s * (0.96 + (wide - 0.92) * 0.4));
      const moving = p.stride > 0.05, k = Math.min(1, dt * 6), wantClip = this._clipFor(e, p, moving);
      // posture clips (phone, talking, hands clasped...) fade in over the plain idle; a change of posture fades out first, then the next fades in
      if (e.alt && wantClip !== e.altName) { e.wA += (0 - e.wA) * k; if (e.wA < 0.04) { e.alt.stop(); e.alt = null; e.altName = null; e.wA = 0; } }
      if (!e.alt && wantClip && this.anims?.[wantClip]) { e.alt = e.mixer.clipAction(this.anims[wantClip]); e.alt.reset().play(); e.alt.setEffectiveWeight(0.001); e.altName = wantClip; }
      if (e.alt && e.altName === wantClip) e.wA += (1 - e.wA) * k;
      if (e.aW) { e.wW += ((moving ? 1 : 0) - e.wW) * k; e.aW.setEffectiveWeight(e.wW); }
      e.alt?.setEffectiveWeight(Math.max(0.001, e.wA));
      if (e.phone) e.phone.visible = e.altName === 'Phone' && e.wA > 0.5;
      e.wI = Math.max(0.001, 1 - e.wW - e.wA); e.aI.setEffectiveWeight(e.wI);
      e.aW?.setEffectiveTimeScale(Math.max(0.55, Math.min(1.5, (p.vNow || 0.7) / 0.95))); e.aI.setEffectiveTimeScale(0.9 + ((p.seedA >>> 5) % 20) / 100);
      e.mixer.update(dt);
      if (e.tier === 'near') this._life(e, p, dt);
      if (p.bag === 'roll' && e.bones.arm && e.bones.hand) this._reach(e, GRIP);     // the right hand takes the suitcase handle, low at the side and a little behind
    }
  }

  /** Which posture clip this person should be in right now (null = the plain idle). */
  _clipFor(e, p, moving) {
    if (moving || !this.anims) return null;
    if (p.mode === 'sit') return 'Sit';
    if (p.pose === 'phone') return 'Phone';
    if (p.pose === 'talk') return 'Talk';
    const v = (p.seedA >>> 9) % 10;
    if (e.kind === 'saree') return v < 3 ? 'Clasp' : null;
    return v < 2 ? 'Clasp' : v === 2 ? 'Cross' : v === 3 ? 'Watch' : null;
  }

  /** Small human details on top of the animation: breathing, a slow weight shift, and head glances (towards you when you are close and in front of them, otherwise a casual look round). */
  _life(e, p, dt) {
    const b = e.bones, T = (this.clock = (this.clock || 0) + 0), t = performance.now() / 1000;
    this._qa ??= new THREE.Quaternion(); this._ea ??= new THREE.Euler();
    const turn = (bone, x, y, z) => { if (bone) bone.quaternion.multiply(this._qa.setFromEuler(this._ea.set(x, y, z))); };
    e.gT -= dt;
    if (e.gT <= 0) {
      const c = this.cam, dx = c ? c.x - p.x : 0, dz = c ? c.z - p.z : 0, dist = Math.hypot(dx, dz), rel = c ? wrapPi(Math.atan2(dx, dz) - p.yaw) : 9;
      if (c && dist < 4.5 && Math.abs(rel) < 1.7 && Math.random() < 0.55) { e.gy = Math.max(-1, Math.min(1, rel)); e.gp = -0.06; }       // a glance at you
      else { e.gy = (Math.random() - 0.5) * 1.3; e.gp = (Math.random() - 0.5) * 0.2; }
      e.hold = 0.9 + Math.random() * 1.6; e.gT = e.hold + 1.5 + Math.random() * 4.5;
    }
    if (e.hold > 0) e.hold -= dt; else { e.gy = 0; e.gp = 0; }
    const k = Math.min(1, dt * (e.hold > 0 ? 5 : 2.2));
    e.hy += (e.gy - e.hy) * k; e.hp += (e.gp - e.hp) * k;
    const moving = e.wW > 0.5;
    turn(b.neck, e.hp * 0.4, e.hy * 0.4, 0); turn(b.head, e.hp * 0.6, e.hy * 0.6, 0);
    turn(b.chest, Math.sin(t * 1.7 + e.phase) * 0.012, 0, 0);                                    // breathing
    if (!moving) turn(b.hips, 0, Math.sin(t * 0.37 + e.phase) * 0.03, Math.sin(t * 0.5 + e.phase) * 0.03);         // shifting weight from foot to foot
  }

  /**
   * Two-bone reach: puts the right hand on a point given in the person's own space (the suitcase handle), elbow out and back.
   * Works in world space, so it does not depend on how a skeleton's rest pose is set up.
   */
  _reach(e, local) {
    const b = e.bones, v = this._v ??= Array.from({ length: 7 }, () => new THREE.Vector3());
    e.root.updateMatrixWorld(true);
    const S = b.arm.getWorldPosition(v[0]), F = b.fore.getWorldPosition(v[1]), H = b.hand.getWorldPosition(v[2]);
    const l1 = S.distanceTo(F), l2 = F.distanceTo(H), T = e.root.localToWorld(v[3].set(local[0], local[1], local[2]));
    const dir = v[6].copy(T).sub(S); const L = Math.min(Math.max(dir.length(), Math.abs(l1 - l2) + 1e-3), (l1 + l2) * 0.995); dir.normalize();
    const a = (l1 * l1 + L * L - l2 * l2) / (2 * L), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
    const pole = v[4].set(-0.6, 0, -1).transformDirection(e.root.matrixWorld); pole.addScaledVector(dir, -pole.dot(dir)).normalize();
    const E = v[5].copy(S).addScaledVector(dir, a).addScaledVector(pole, h), hand = v[3].copy(S).addScaledVector(dir, L);
    this._aim(b.arm, F, E); b.arm.updateMatrixWorld(true);
    this._aim(b.fore, b.hand.getWorldPosition(v[2]), hand);
  }

  /** Turn a bone so that the point `child` (world) moves onto the line towards `want` (world). */
  _aim(bone, child, want) {
    const q = this._q ??= new THREE.Quaternion(), pw = this._pw ??= new THREE.Quaternion(), bw = this._bw ??= new THREE.Quaternion(), o = this._o ??= new THREE.Vector3(), c = this._c ??= new THREE.Vector3(), w = this._w ??= new THREE.Vector3();
    bone.getWorldPosition(o); c.copy(child).sub(o).normalize(); w.copy(want).sub(o).normalize();
    q.setFromUnitVectors(c, w); bone.getWorldQuaternion(bw); bone.parent.getWorldQuaternion(pw);
    bone.quaternion.copy(pw.invert().multiply(q.multiply(bw)));
  }

  dispose() { this.disposed = true; this.group.removeFromParent(); for (const e of this.entries) e.model.traverse((o) => { if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); }); }
}

/** Make one of the named staff characters look like the people they serve: warm brown skin, black hair, a bindi and bangles for the women. */
const STAFF_LOOK = { checkin: [0xa56b44, true], crew: [0xb67e53, true], security: [0x935c3a, true], gate: [0xa56b44, false], guard: [0x7e4d2e, false], driver: [0x935c3a, false] };
export function indianiseStaff(model, kind) {
  const look = STAFF_LOOK[kind]; if (!look) return null;
  let faced = false; model.traverse((o) => { if (o.isMesh) for (const m of (Array.isArray(o.material) ? o.material : [o.material])) if (m.name === 'Face') faced = true; });
  model.traverse((o) => { if (!o.isMesh) return; for (const m of (Array.isArray(o.material) ? o.material : [o.material])) { if (m.name === 'Skin') { tint(m, faced ? FACE_SKIN : look[0]); if (!m.normalMap) { m.normalMap = skinDetail(); m.normalScale.set(0.45, 0.45); m.needsUpdate = true; } } else if (m.name === 'Skin body') m.color.set(faced ? FACE_SKIN : look[0]); else if (m.name === 'Hair') { softenHair(m); tint(m, 0x0e0b09); } else if (m.name === 'Beard') tint(m, 0x0e0b09); } });
  const acc = makeAccessories(model);
  if (acc.bindi) acc.bindi.visible = look[1]; for (const k of ['bangleL', 'bangleR']) if (acc[k]) acc[k].visible = look[1];
  if (acc.sash) acc.sash.visible = false; if (acc.glasses) acc.glasses.visible = false;
  return acc;
}
