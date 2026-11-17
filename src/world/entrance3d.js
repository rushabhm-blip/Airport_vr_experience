import * as THREE from 'three';
import { applyPbr, loadAirportEnv } from './pbr.js';
import { shadowTextures, skylineRing } from './realism3d.js';
import { placeProps } from './realprops.js';

/**
 * The terminal entrance as a real 3D place, modelled on the photograph: a road with painted lines, a yellow and black striped kerb,
 * bollards, a stone forecourt, white Y-shaped columns holding a deep blue canopy with a white and teal edge and downlights, a glass
 * curtain wall with steel mullions, an open doorway, concrete planters with ferns. The learner stands in the road at the origin and the
 * doors are straight ahead (-z), exactly where the lesson steps expect them.
 *
 * Layout (metres): kerb at z = -1.2, columns on the pavement at z = -1.5, glass wall at z = -2.9 with a 3.4 m opening at x = 0.
 */
const WALL_Z = -2.9, KERB_Z = -1.2, OPEN_W = 3.4;
const rep = (m, rx, ry) => { for (const k of ['map', 'roughnessMap', 'normalMap']) if (m[k]) m[k].repeat.set(rx, ry); };

export function buildEntrance3D({ renderer = null } = {}) {
  const g = new THREE.Group(); g.name = 'Entrance3D';
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, ...o });
  const add = (geo, mat, x = 0, y = 0, z = 0, ry = 0, parent = g) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.y = ry; parent.add(m); return m; };
  const envMats = [];
  const withEnv = (m, k = 1) => { m.envMapIntensity = k; envMats.push(m); return m; };

  // ---------- light
  g.add(new THREE.HemisphereLight(0xd6ecff, 0x8d8576, 0.85));
  const sun = new THREE.DirectionalLight(0xfff0d8, 1.25); sun.position.set(7, 14, 9); sun.target.position.set(0, 0, -2); g.add(sun, sun.target);

  // ---------- road
  const road = std(0xffffff, { roughness: 0.95 }); applyPbr(road, 'asphalt_02', 24, 24, { normal: 0.8, rough: 1, tint: 0xb8bcc0 });
  const roadMesh = add(new THREE.PlaneGeometry(120, 70).rotateX(-Math.PI / 2), road, 0, -0.02, KERB_Z + 35); rep(road, 36, 20);
  // painted lines: dashed white lane marks and a solid line near the kerb
  const paint = std(0xf2f2f0, { roughness: 0.7 });
  for (let x = -40; x <= 40; x += 4) add(new THREE.PlaneGeometry(1.8, 0.16).rotateX(-Math.PI / 2), paint, x, -0.005, 9.5);
  add(new THREE.PlaneGeometry(120, 0.14).rotateX(-Math.PI / 2), paint, 0, -0.005, 3.2);
  for (let x = -40; x <= 40; x += 4) add(new THREE.PlaneGeometry(1.8, 0.16).rotateX(-Math.PI / 2), paint, x, -0.005, 19);

  // ---------- kerb: striped face, light top
  const yel = std(0xf0bf10, { roughness: 0.6 }), blk = std(0x1b1c1e, { roughness: 0.7 }), top = std(0xb9b9b3, { roughness: 0.8 });
  for (let i = -24; i < 24; i++) add(new THREE.BoxGeometry(1.0, 0.17, 0.34), (i & 1 ? blk : yel), i + 0.5, 0.075, KERB_Z);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(48, 0.17, 0.34), top, s * 48, 0.075, KERB_Z);
  add(new THREE.BoxGeometry(120, 0.02, 0.36), top, 0, 0.17, KERB_Z);

  // ---------- forecourt: stone slabs
  const stone = std(0xffffff, { roughness: 0.4, metalness: 0 }); applyPbr(stone, 'large_floor_tiles_02', 22, 1, { normal: 0.6, rough: 0.55, tint: 0xd9dde0 });
  withEnv(stone, 0.9);
  const fcLen = 120, fcDepth = (KERB_Z - 0.17) - WALL_Z - 6;       // from the kerb to the wall, plus the floor inside
  add(new THREE.PlaneGeometry(fcLen, 8.5).rotateX(-Math.PI / 2), stone, 0, 0.003, KERB_Z - 0.17 - 8.5 / 2 + 0.17); rep(stone, 50, 6);
  // a tactile guidance strip from the kerb to the doorway
  const tact = std(0xe5b800, { roughness: 0.6 }); add(new THREE.PlaneGeometry(0.6, 1.6).rotateX(-Math.PI / 2), tact, 0, 0.008, (KERB_Z + WALL_Z) / 2);

  // ---------- bollards along the kerb, with a gap at the entrance path
  const steel = std(0xc9ced2, { metalness: 0.9, roughness: 0.28 }); withEnv(steel, 1.2);
  const bolGeo = new THREE.CylinderGeometry(0.07, 0.07, 0.95, 14), capGeo = new THREE.SphereGeometry(0.075, 12, 8, 0, Math.PI * 2, 0, Math.PI / 2);
  for (let x = -22; x <= 22; x += 2.2) { if (Math.abs(x) < 1.3) continue; add(bolGeo, steel, x, 0.48, KERB_Z - 0.55); add(capGeo, steel, x, 0.95, KERB_Z - 0.55); }

  // ---------- glass wall with steel mullions and a transom, with an opening for the doors
  const glass = new THREE.MeshStandardMaterial({ color: 0x9fc9d8, roughness: 0.04, metalness: 0.1, transparent: true, opacity: 0.2, depthWrite: false, side: THREE.DoubleSide }); withEnv(glass, 1.4);
  const dark = std(0x2b3238, { roughness: 0.6, metalness: 0.4 });
  const WH = 6.2, wallX = 34;
  for (const s of [-1, 1]) {
    const x0 = s * OPEN_W / 2, x1 = s * wallX, w = Math.abs(x1 - x0), cx = (x0 + x1) / 2;
    add(new THREE.PlaneGeometry(w, WH), glass, cx, WH / 2, WALL_Z);
    for (let x = Math.abs(x0); x <= wallX; x += 1.55) add(new THREE.BoxGeometry(0.09, WH, 0.16), dark, s * x, WH / 2, WALL_Z);
  }
  for (const y of [0.08, 3.1, WH]) add(new THREE.BoxGeometry(wallX * 2, 0.14, 0.18), dark, 0, y, WALL_Z);
  add(new THREE.BoxGeometry(OPEN_W + 0.3, 0.4, 0.22), steel, 0, 2.7, WALL_Z); add(new THREE.PlaneGeometry(OPEN_W, WH - 2.9), glass, 0, 2.9 + (WH - 2.9) / 2, WALL_Z);   // glass above the opening
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.14, 2.8, 0.22), steel, s * (OPEN_W / 2 + 0.05), 1.4, WALL_Z);                                            // door posts

  // ---------- inside the building: floor, ceiling, light strips, columns and planting, so the glass shows a real lobby
  const floorIn = std(0xe8e6e0, { roughness: 0.35 }); applyPbr(floorIn, 'marble_01', 14, 6, { normal: 0.5, rough: 0.5, tint: 0xffffff }); withEnv(floorIn, 0.9);
  add(new THREE.PlaneGeometry(80, 22).rotateX(-Math.PI / 2), floorIn, 0, 0.004, WALL_Z - 11); rep(floorIn, 20, 6);
  const ceilIn = std(0xeeece6, { roughness: 0.8, emissive: 0x3a3935, emissiveIntensity: 1 }); add(new THREE.PlaneGeometry(80, 22).rotateX(Math.PI / 2), ceilIn, 0, 5.8, WALL_Z - 11);
  const back = std(0x24373e, { roughness: 0.7 }); add(new THREE.PlaneGeometry(80, 8), back, 0, 4, WALL_Z - 22);
  const glow = new THREE.MeshBasicMaterial({ color: 0xfff2d4, toneMapped: false });
  for (let z = WALL_Z - 3; z > WALL_Z - 20; z -= 4.5) add(new THREE.BoxGeometry(60, 0.06, 0.4), glow, 0, 5.74, z);
  const white = std(0xf2f2ee, { roughness: 0.4 });
  for (let x = -24; x <= 24; x += 12) add(new THREE.CylinderGeometry(0.38, 0.38, 5.8, 20), white, x, 2.9, WALL_Z - 7);

  // ---------- canopy: deep blue underside with downlights, a white edge with a teal band
  const blue = std(0x143a78, { roughness: 0.55, emissive: 0x08183a, emissiveIntensity: 0.7 });
  const slope = (zA, yA, zB, yB, w) => { const len = Math.hypot(zB - zA, yB - yA), m = add(new THREE.PlaneGeometry(w, len).rotateX(Math.PI / 2), blue, 0, (yA + yB) / 2, (zA + zB) / 2); m.rotation.x = Math.atan2(yB - yA, zB - zA); return m; };
  const CZ = 5.6;                                                                       // the canopy's front edge
  const under = add(new THREE.PlaneGeometry(wallX * 2, WALL_Z - CZ > 0 ? 1 : CZ - WALL_Z + 0.2).rotateX(Math.PI / 2), blue, 0, 5.9, (WALL_Z + CZ) / 2);
  under.rotation.x = 0;                                                                  // laid flat, facing down
  under.geometry.dispose(); under.geometry = new THREE.PlaneGeometry(wallX * 2, CZ - WALL_Z + 0.2).rotateX(Math.PI / 2);
  under.position.y = 5.9; under.position.z = (WALL_Z + CZ) / 2;
  const edge = add(new THREE.BoxGeometry(wallX * 2, 0.7, 0.34), white, 0, 6.15, CZ); add(new THREE.BoxGeometry(wallX * 2, 0.2, 0.36), std(0x12a3a1, { roughness: 0.4 }), 0, 5.9, CZ);
  for (let x = -30; x <= 30; x += 3) for (let z = WALL_Z + 1.2; z < CZ - 0.6; z += 2.4) add(new THREE.CircleGeometry(0.11, 16).rotateX(Math.PI / 2), glow, x + ((z * 7) % 1) * 0.0, 5.88, z);
  const fascia = add(new THREE.BoxGeometry(wallX * 2, 1.0, 0.3), white, 0, 6.8, WALL_Z); fascia.name = 'WallFascia';   // the face of the building above the glass
  add(new THREE.BoxGeometry(wallX * 2, 6, 0.3), std(0xdfe0dd, { roughness: 0.6 }), 0, 9.8, WALL_Z - 0.2);

  // ---------- white Y-shaped columns holding the canopy
  const colMat = std(0xf3f3ef, { roughness: 0.42 }); withEnv(colMat, 0.8);
  const Y = (x, z) => {
    const col = new THREE.Group(); col.position.set(x, 0, z); g.add(col);
    add(new THREE.CylinderGeometry(0.24, 0.32, 3.5, 28), colMat, 0, 1.75, 0, 0, col);
    add(new THREE.CylinderGeometry(0.4, 0.4, 0.22, 24), steel, 0, 0.11, 0, 0, col);
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(0, 3.45, 0), b = new THREE.Vector3(s * 1.9, 5.85, -0.55), len = a.distanceTo(b);
      const br = add(new THREE.CylinderGeometry(0.15, 0.24, len, 22), colMat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 0, col);
      br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
    }
    add(new THREE.SphereGeometry(0.34, 18, 12), colMat, 0, 3.5, 0, 0, col);
  };
  for (const x of [-12, -4.6, 4.6, 12]) Y(x, -1.55);
  Y(-20, -1.55); Y(20, -1.55);

  // ---------- planters and plants along the glass
  const conc = std(0x6e7377, { roughness: 0.85 });
  const real = [];
  for (const [x, i] of [[-8.2, 0], [-6.2, 1], [6.2, 2], [8.2, 3], [-14, 4], [14, 5]]) {
    add(new THREE.BoxGeometry(1.5, 0.9, 1.1), conc, x, 0.45, WALL_Z + 0.75); add(new THREE.BoxGeometry(1.34, 0.04, 0.94), std(0x3a2a1d, { roughness: 1 }), x, 0.9, WALL_Z + 0.75);
    for (let k = 0; k < 3; k++) real.push(['fern_02', x - 0.35 + k * 0.35, 0.9, WALL_Z + 0.75 + (k - 1) * 0.15, i * 2.3 + k * 1.7, 0.8]);
  }
  // lobby planting seen through the glass: low planters with ferns, in groups
  const potMat = std(0x8a8f92, { roughness: 0.8 });
  for (const [x, z] of [[-18, -5.2], [-11, -6], [-3.5, -7.2], [3.5, -6.4], [11, -5.4], [18, -6.6], [-26, -6.2], [26, -5.6]]) {
    add(new THREE.CylinderGeometry(0.7, 0.55, 0.7, 20), potMat, x, 0.35, WALL_Z + z + 2.9 - 2.9);
    for (let k = 0; k < 4; k++) real.push(['fern_02', x - 0.45 + k * 0.3, 0.7, WALL_Z + z + (k % 2 ? 0.2 : -0.2), k * 2.1 + x, 1.2]);
  }
  const holder = placeProps(g, real);

  // ---------- soft contact shadows under the columns, planters and bollards
  const T = shadowTextures(), sh = new THREE.MeshBasicMaterial({ map: T.round, transparent: true, opacity: 0.85, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const blob = (x, z, r) => { const m = add(flat, sh, x, 0.012, z); m.scale.set(r * 2, 1, r * 2); };
  for (const x of [-20, -12, -4.6, 4.6, 12, 20]) blob(x, -1.55, 1.1);
  for (const x of [-14, -8.2, -6.2, 6.2, 8.2, 14]) blob(x, WALL_Z + 0.75, 1.3);

  // ---------- the far distance: a low skyline and trees beyond the road
  const sk = skylineRing(58, 22); sk.position.set(0, 0, 0); g.add(sk);

  // ---------- reflections from a real airport panorama, once it has loaded
  if (renderer) loadAirportEnv(renderer).then((e) => { if (!e) return; for (const m of envMats) { m.envMap = e; m.needsUpdate = true; } });
  g.userData.dispose = () => { g.removeFromParent(); };
  return g;
}
