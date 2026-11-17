import * as THREE from 'three';

/**
 * Photographic cut-outs for the airport entrance (made with ChatGPT, green removed): trees, shrubs, planters, vehicles, signs, skyline strips,
 * clouds, aircraft, and a sky. They stand in the 3D scene as flat pictures: plants always turn to face you, vehicles and buildings keep
 * their side-on view like a stage set, so everything sits on the same ground as the real 3D parts.
 */
const BASE = new URL('../../assets/entrance/', import.meta.url).href;
const loader = new THREE.TextureLoader();
let manifest = null; const texCache = new Map();
const loadManifest = () => (manifest ??= fetch(BASE + 'manifest.json').then((r) => (r.ok ? r.json() : {})).catch(() => ({})));
const tex = (name, ext = 'webp', srgb = true) => {
  const k = name + ext; if (texCache.has(k)) return texCache.get(k);
  const t = loader.load(BASE + name + '.' + ext); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; texCache.set(k, t); return t;
};

// vehicles and aircraft whose picture shows the front pointing to the right (everything else points left)
const FACES_RIGHT = new Set(['bus-teal', 'bus-grey', 'taxivan-silver', 'plane-1', 'plane-2', 'plane-3', 'plane-4', 'auto-green', 'auto-black']);

export async function addEntrancePictures(g, { MZ0, MZ1, KERB_Z, WALL_Z }) {
  const man = await loadManifest(); if (!man || !Object.keys(man).length) return null;
  const root = new THREE.Group(); root.name = 'EntrancePictures'; g.add(root);
  const bbs = [], movers = [], drifters = [];
  const matCache = new Map();
  const mat = (name, tint = 0xf2f2f0) => { const k = name + tint; if (!matCache.has(k)) matCache.set(k, new THREE.MeshBasicMaterial({ map: tex(name), transparent: true, alphaTest: 0.38, side: THREE.DoubleSide, toneMapped: false, color: tint })); return matCache.get(k); };
  /** A picture standing on the ground at (x, z). height (or width) sets its size in metres. mode 'bb': always faces you; 'fixed': faces the road (the learner's side). */
  const pic = (name, { x = 0, z = 0, y = 0, h = null, w = null, mode = 'fixed', flip = false, tint = 0xf2f2f0, order = 0 } = {}) => {
    const m = man[name]; if (!m) return null;
    const hh = h ?? (w / m.aspect), ww = hh * m.aspect;
    const geo = new THREE.PlaneGeometry(ww, hh).translate(0, hh / 2, 0);
    const mesh = new THREE.Mesh(geo, mat(name, tint)); mesh.position.set(x, y, z); mesh.renderOrder = order; mesh.userData.flip = flip;
    if (mode === 'fixed') { mesh.rotation.y = Math.PI; if (flip) mesh.scale.x = -1; } else bbs.push(mesh);
    root.add(mesh); return mesh;
  };
  const rnd = (i) => { const v = Math.sin(i * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); };

  // ---------- the median: palms and low planting between the lamps
  const palms = ['palm-1', 'palm-2', 'palm-3', 'palm-4'], low = ['shrub-croton', 'shrub-ixora', 'shrub-hibiscus', 'shrub-pampas', 'shrub-agave'];
  const mz = (MZ0 + MZ1) / 2;
  for (let i = 0, x = -66; x <= 66; x += 9, i++) pic(palms[i % 4], { x: x + rnd(i) * 3, z: mz + 0.3, h: 8.5 + rnd(i + 9) * 2.5, mode: 'bb' });
  for (let i = 0, x = -64; x <= 64; x += 4.6, i++) { const k = i % 7; if (k === 3) pic('hedge', { x, z: mz - 0.7, h: 0.95, w: 4.4, mode: 'fixed' }); else pic(low[(i + k) % 5], { x: x + rnd(i + 3), z: mz - 0.4 + rnd(i + 5), h: 1.0 + rnd(i + 1) * 0.7, mode: 'bb' }); }

  // ---------- the far pavement: shade trees, flowering trees, planters, auto-rickshaws and motorbikes
  const trees = ['tree-banyan', 'tree-1', 'tree-acacia', 'tree-yellow', 'tree-mango'], bloom = ['bloom-gulmohar', 'bloom-frangipani', 'bloom-bougainvillea'];
  for (let i = 0, x = -64; x <= 64; x += 11, i++) pic(trees[i % 5], { x: x + rnd(i + 20) * 4, z: 36.5 + rnd(i + 21) * 1.5, h: 9 + rnd(i + 22) * 3.5, mode: 'bb' });
  for (let i = 0, x = -58; x <= 58; x += 17, i++) pic(bloom[i % 3], { x: x + rnd(i + 40) * 3, z: 33.4 + rnd(i + 41), h: 6.5 + rnd(i + 42) * 1.8, mode: 'bb' });
  for (let i = 0, x = -60; x <= 60; x += 13, i++) pic(['planter-concrete', 'planter-bird', 'planter-ficus', 'planter-snake'][i % 4], { x: x + 3, z: 32.4, h: i % 4 === 3 ? 0.8 : 1.6, mode: 'bb' });
  pic('auto-green', { x: -14, z: 33.0, h: 1.75, mode: 'fixed' }); pic('auto-black', { x: -9.6, z: 33.2, h: 1.75, mode: 'fixed' }); pic('auto-green', { x: 6, z: 33.0, h: 1.75, mode: 'fixed', flip: true }); pic('auto-rear', { x: 14, z: 33.3, h: 1.7, mode: 'fixed' });
  pic('moto-black', { x: -4, z: 33.4, h: 1.15, mode: 'bb' }); pic('moto-red', { x: 20, z: 33.4, h: 1.15, mode: 'bb' }); pic('moto-sport', { x: 24, z: 33.0, h: 1.1, mode: 'bb' });

  // ---------- the car park: rows of parked vehicles, side-on and from behind
  const sides = [['sedan-silver', 1.42], ['suv-white', 1.75], ['hatch-blue', 1.45], ['pickup-white', 1.85], ['sedan-black', 1.42], ['suv-dark', 1.75], ['hatch-white', 1.45], ['taxivan-white', 1.8], ['pickup-blue', 1.85], ['taxivan-silver', 1.8]];
  for (let r = 0; r < 2; r++) for (let i = 0, x = -60; x <= 60; x += 5.6 + rnd(i + r * 50) * 1.2, i++) { const [n, h] = sides[(i * 3 + r * 4) % sides.length]; pic(n, { x, z: 42 + r * 8, h, mode: 'fixed', flip: rnd(i + r * 7) > 0.5 }); }
  const rears = [['suv-rear', 1.75], ['sedan-rear', 1.45], ['hatch-rear', 1.45], ['pickup-rear', 1.85], ['taxivan-rear', 1.8]];
  for (let i = 0, x = -56; x <= 56; x += 6.4, i++) { const [n, h] = rears[i % 5]; pic(n, { x: x + rnd(i + 70), z: 60, h, mode: 'fixed' }); }

  // ---------- traffic on the far carriageway: buses and vans driving past (the learner sees them side-on)
  const traffic = [['bus-teal', 3.1, 23.4, 1, -40, 3.6], ['taxivan-white', 1.8, 29.4, -1, 25, 4.2], ['bus-grey', 3.2, 29.6, -1, -30, 3.2], ['taxivan-silver', 1.8, 23.2, 1, 30, 4.4], ['sedan-black', 1.42, 23.0, 1, 0, 5.2], ['suv-white', 1.75, 29.0, -1, 50, 4.8]];
  for (const [n, h, z, dir, x0, v] of traffic) { const m = pic(n, { x: x0, z, h, mode: 'fixed', flip: (dir > 0) === FACES_RIGHT.has(n) }); if (m) movers.push({ m, v: v * dir }); }

  // ---------- road signs on poles along the median, facing the near carriageway
  const steel = new THREE.MeshStandardMaterial({ color: 0xaab0b6, metalness: 0.8, roughness: 0.35 });
  [['sign-departures', -22, 1.7], ['sign-terminal2', -12, 1.6], ['sign-30', -2.5, 0.95], ['sign-taxi', 6, 1.5], ['sign-arrivals', 16, 1.7], ['sign-carpark', 26, 1.6], ['sign-prepaid', 36, 1.5], ['sign-noentry', 46, 1.1]].forEach(([n, x, w]) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 3.2, 10), steel); p.position.set(x, 1.6, MZ0 + 0.3); root.add(p);
    pic(n, { x, z: MZ0 + 0.22, y: 2.0, w, mode: 'fixed' });
  });

  // ---------- the far distance: skyline strips behind the car park, left and right
  const sky = [['skyline-city', 0, 74, 140], ['skyline-lowrise', -70, 66, 120], ['skyline-lowrise', 78, 68, 120], ['skyline-towers', -42, 71, 42], ['skyline-hotel', 38, 71, 46], ['skyline-carpark', 4, 69, 62], ['skyline-hangar', 68, 62, 36], ['skyline-towers', 20, 76, 48]];
  for (const [n, x, z, w] of sky) pic(n, { x, z, w, mode: 'fixed', tint: 0xdfe6ec, order: -3 });

  // ---------- sky: the picture sky as a dome, drifting clouds and aircraft
  const skyDome = new THREE.Mesh(new THREE.SphereGeometry(68, 48, 24, 0, Math.PI * 2, 0, Math.PI / 2), new THREE.MeshBasicMaterial({ map: tex('sky-clear', 'jpg'), side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false }));
  skyDome.renderOrder = -9; skyDome.rotation.y = 0.4; root.add(skyDome);
  const clouds = ['cloud-1', 'cloud-2', 'cloud-3', 'cloud-4', 'cloud-5', 'cloud-6'];
  clouds.forEach((n, i) => { const c = pic(n, { x: -55 + i * 22, z: 44 + (i % 3) * 8, y: 26 + (i % 3) * 9, w: 30 + (i % 2) * 14, mode: 'fixed', order: -6 }); if (c) { c.material = c.material.clone(); c.material.depthWrite = false; c.material.opacity = 0.92; drifters.push({ m: c, v: 0.5 + (i % 3) * 0.25 }); } });
  const planes = [['plane-4', 46, 3.4, 1, -70], ['plane-1', 36, 2.6, -1, 60]];
  for (const [n, y, v, dir, x0] of planes) { const m = pic(n, { x: x0, z: 58, y, w: 14, mode: 'fixed', flip: (dir > 0) === FACES_RIGHT.has(n), order: -4 }); if (m) movers.push({ m, v: v * dir, wrap: 85 }); }

  const cam = new THREE.Vector3();
  const update = (dt, camera) => {
    if (camera) { camera.getWorldPosition(cam); g.worldToLocal(cam); for (const b of bbs) b.rotation.y = Math.atan2(cam.x - b.position.x, cam.z - b.position.z); }
    for (const m of movers) { const lim = m.wrap ?? 62; m.m.position.x += m.v * dt; if (m.m.position.x > lim) m.m.position.x = -lim; if (m.m.position.x < -lim) m.m.position.x = lim; }
    for (const d of drifters) { d.m.position.x += d.v * dt; if (d.m.position.x > 80) d.m.position.x = -80; }
  };
  return { root, update };
}
