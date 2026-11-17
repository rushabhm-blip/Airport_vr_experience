import * as THREE from 'three';
import { applyPbr, loadAirportEnv } from './pbr.js';
import { shadowTextures, skylineRing } from './realism3d.js';
import { placeProps, propGroup } from './realprops.js';

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
  const roadMesh = add(new THREE.PlaneGeometry(160, 15.2).rotateX(-Math.PI / 2), road, 0, -0.02, KERB_Z + 7.6); rep(road, 48, 5);
  // painted lines: dashed white lane marks and a solid line near the kerb
  const paint = std(0xf2f2f0, { roughness: 0.7 });
  for (let x = -40; x <= 40; x += 4) add(new THREE.PlaneGeometry(1.8, 0.16).rotateX(-Math.PI / 2), paint, x, -0.005, 9.5);
  add(new THREE.PlaneGeometry(120, 0.14).rotateX(-Math.PI / 2), paint, 0, -0.005, 3.2);

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
  const CZ = 5.4, CURVE = (x) => CZ + 1.5 * Math.cos(x * 0.085) - 0.6 * Math.cos(x * 0.21);       // the canopy's sweeping front edge
  { const N = 68, pos = [], idx = [];
    for (let i = 0; i <= N; i++) { const x = -wallX + (2 * wallX * i) / N; pos.push(x, 5.9, WALL_Z - 0.1, x, 5.9, CURVE(x)); }
    for (let i = 0; i < N; i++) { const a = i * 2; idx.push(a, a + 1, a + 2, a + 1, a + 3, a + 2); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); geo.setIndex(idx); geo.computeVertexNormals();
    const u = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x143a78, roughness: 0.55, emissive: 0x08183a, emissiveIntensity: 0.7, side: THREE.DoubleSide })); g.add(u);
    const teal = std(0x12a3a1, { roughness: 0.4 });
    for (let i = 0; i < N; i++) {
      const x0 = -wallX + (2 * wallX * i) / N, x1 = -wallX + (2 * wallX * (i + 1)) / N, z0 = CURVE(x0), z1 = CURVE(x1), len = Math.hypot(x1 - x0, z1 - z0) + 0.02, ry = -Math.atan2(z1 - z0, x1 - x0), mx = (x0 + x1) / 2, mz = (z0 + z1) / 2;
      add(new THREE.BoxGeometry(len, 0.75, 0.32), white, mx, 6.2, mz, ry); add(new THREE.BoxGeometry(len, 0.22, 0.34), teal, mx, 5.88, mz, ry);
    }
    for (let x = -30; x <= 30; x += 3) for (let z = WALL_Z + 1.3; z < CURVE(x) - 0.7; z += 2.3) add(new THREE.CircleGeometry(0.12, 16).rotateX(Math.PI / 2), glow, x, 5.88, z);
  }
  const fascia = add(new THREE.BoxGeometry(wallX * 2, 1.0, 0.3), white, 0, 6.8, WALL_Z); fascia.name = 'WallFascia';   // the face of the building above the glass
  const clad = std(0xe6e7e4, { roughness: 0.55 }); withEnv(clad, 0.6); add(new THREE.BoxGeometry(wallX * 2, 6, 0.3), clad, 0, 9.8, WALL_Z - 0.2);
  const joint = std(0x9aa0a4, { roughness: 0.7 });
  for (let x = -wallX; x <= wallX; x += 2.4) add(new THREE.BoxGeometry(0.04, 6, 0.04), joint, x, 9.8, WALL_Z - 0.03);
  for (const y of [8.0, 10.0, 12.0]) add(new THREE.BoxGeometry(wallX * 2, 0.04, 0.04), joint, 0, y, WALL_Z - 0.03);
  add(new THREE.BoxGeometry(wallX * 2, 0.5, 0.34), std(0x12a3a1, { roughness: 0.4 }), 0, 7.5, WALL_Z - 0.05);
  add(new THREE.BoxGeometry(wallX * 2, 0.06, 0.4), steel, 0, 12.8, WALL_Z - 0.2);

  // ---------- white Y-shaped columns holding the canopy
  const colMat = std(0xf3f3ef, { roughness: 0.42 }); withEnv(colMat, 0.8);
  const Y = (x, z) => {
    const col = new THREE.Group(); col.position.set(x, 0, z); g.add(col);
    add(new THREE.CylinderGeometry(0.3, 0.46, 3.3, 32), colMat, 0, 1.65, 0, 0, col);
    add(new THREE.CylinderGeometry(0.56, 0.6, 0.18, 28), steel, 0, 0.09, 0, 0, col);
    for (const s of [-1, 1]) {
      const a = new THREE.Vector3(0, 3.2, 0), b = new THREE.Vector3(s * 2.1, 5.9, -0.6), len = a.distanceTo(b);
      const br = add(new THREE.CylinderGeometry(0.19, 0.31, len, 28), colMat, (a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2, 0, col);
      br.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), b.clone().sub(a).normalize());
      add(new THREE.CylinderGeometry(0.34, 0.34, 0.1, 24), steel, b.x, 5.86, b.z, 0, col);                                   // a flange where it meets the canopy
    }
    add(new THREE.SphereGeometry(0.44, 24, 16), colMat, 0, 3.25, 0, 0, col);
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
  const bark = std(0x5b4636, { roughness: 1 }), leaves = [std(0x2f7d3a, { roughness: 0.85, flatShading: true }), std(0x3d9448, { roughness: 0.85, flatShading: true }), std(0x28692f, { roughness: 0.85, flatShading: true })];
  const palms = [];
  const tree = (x, z, h = 3.4, r = 1.5) => {                          // a slender trunk topped with real fern fronds, like a palm
    add(new THREE.CylinderGeometry(0.1, 0.17, h, 10), bark, x, h / 2, z);
    for (let k = 0; k < 4; k++) palms.push(['fern_02', x + Math.cos(k * 1.6) * 0.15, h - 0.1, z + Math.sin(k * 1.6) * 0.15, k * 1.6 + x, r * 1.4]);
  };
  for (const x of [-27, -20, -14, -8, -1.5, 1.5, 8, 14, 20, 27]) tree(x, WALL_Z - 4.5 - ((x * 13) % 3), 3.6, 1.3);          // atrium trees seen through the glass
  for (let x = -44; x <= 44; x += 9) tree(x + ((x * 7) % 3), 35 + ((x * 11) % 3), 5.5, 2.3);                                    // street trees across the road
  placeProps(g, palms);

  // =================== the road side: median, far carriageway, car park and buildings ===================
  const canvasTex = (w, h, draw, rx = 1, ry = 1) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rx, ry); t.anisotropy = 4; return t; };
  const grassTex = canvasTex(256, 256, (x) => { x.fillStyle = '#58803f'; x.fillRect(0, 0, 256, 256); for (let i = 0; i < 4200; i++) { x.fillStyle = ['#4a7335', '#66904a', '#6f9a52', '#3f6a2e'][i % 4]; x.globalAlpha = 0.5; x.fillRect(Math.random() * 256, Math.random() * 256, 1 + Math.random() * 2, 2 + Math.random() * 3); } }, 40, 40);
  const grass = std(0xffffff, { roughness: 1, map: grassTex });
  add(new THREE.PlaneGeometry(260, 200).rotateX(-Math.PI / 2), grass, 0, -0.04, 40);                                  // the ground under everything, so there is never a bare horizon
  // median: a grass strip with stone edges between the two carriageways
  const MZ0 = 14.0, MZ1 = 17.2;
  add(new THREE.BoxGeometry(160, 0.16, MZ1 - MZ0), grass, 0, 0.0, (MZ0 + MZ1) / 2); (g.children[g.children.length - 1].material = std(0xffffff, { roughness: 1, map: grassTex.clone() })).map.repeat.set(60, 2);
  for (const z of [MZ0, MZ1]) add(new THREE.BoxGeometry(160, 0.2, 0.3), top, 0, 0.08, z);
  // far carriageway, with a dashed centre line
  const road2 = std(0xffffff, { roughness: 0.95 }); applyPbr(road2, 'asphalt_02', 24, 24, { normal: 0.8, rough: 1, tint: 0xa9adb1 });
  add(new THREE.PlaneGeometry(160, 14.4).rotateX(-Math.PI / 2), road2, 0, -0.02, 24.4); rep(road2, 48, 5);
  for (let x = -76; x <= 76; x += 5) add(new THREE.PlaneGeometry(2.2, 0.16).rotateX(-Math.PI / 2), paint, x, -0.005, 24.4);
  for (const z of [MZ1 + 0.4, 31.2 - 0.4]) add(new THREE.PlaneGeometry(160, 0.14).rotateX(-Math.PI / 2), paint, 0, -0.005, z);
  add(new THREE.BoxGeometry(160, 0.2, 0.3), top, 0, 0.08, 31.6);
  // the far pavement, then a car park of tarmac with bay lines
  const walk2 = std(0xffffff, { roughness: 0.6 }); applyPbr(walk2, 'large_floor_tiles_02', 40, 4, { normal: 0.5, rough: 0.7, tint: 0xc9cdd0 });
  add(new THREE.PlaneGeometry(160, 4).rotateX(-Math.PI / 2), walk2, 0, 0.004, 33.8); rep(walk2, 80, 4);
  const lot = std(0xffffff, { roughness: 1 }); applyPbr(lot, 'asphalt_02', 24, 24, { normal: 0.7, rough: 1, tint: 0x8f9398 });
  add(new THREE.PlaneGeometry(160, 30).rotateX(-Math.PI / 2), lot, 0, -0.01, 52.8); rep(lot, 48, 10);
  for (let x = -60; x <= 60; x += 3.1) { add(new THREE.PlaneGeometry(0.1, 5).rotateX(-Math.PI / 2), paint, x, -0.004, 41); add(new THREE.PlaneGeometry(0.1, 5).rotateX(-Math.PI / 2), paint, x, -0.004, 52); }

  // ---------- buildings behind: a multi-storey car park and a glass hotel tower
  const slabTex = canvasTex(512, 256, (x, w, h) => { x.fillStyle = '#c9c8c2'; x.fillRect(0, 0, w, h); for (let r = 0; r < 4; r++) { x.fillStyle = '#d9d8d2'; x.fillRect(0, r * 64, w, 8); x.fillStyle = '#3d4044'; x.fillRect(0, r * 64 + 14, w, 40); for (let c = 0; c < 16; c++) { x.fillStyle = '#b3b2ac'; x.fillRect(c * 32 + 14, r * 64 + 14, 4, 40); } } }, 3, 1);
  add(new THREE.BoxGeometry(52, 13, 18), std(0xffffff, { roughness: 0.85, map: slabTex }), 14, 6.5, 66);
  const glassTex = canvasTex(256, 512, (x, w, h) => { x.fillStyle = '#7fa9c4'; x.fillRect(0, 0, w, h); for (let r = 0; r < 24; r++) for (let c = 0; c < 8; c++) { x.fillStyle = (r * 7 + c * 3) % 5 === 0 ? '#e9f3f7' : '#3f6e8c'; x.fillRect(c * 32 + 3, r * 21 + 3, 26, 15); } }, 1, 1);
  add(new THREE.BoxGeometry(16, 36, 16), std(0xffffff, { roughness: 0.2, metalness: 0.2, map: glassTex }), -34, 18, 62);
  add(new THREE.BoxGeometry(30, 16, 14), std(0xdcd8cf, { roughness: 0.8 }), -58, 8, 50);

  // ---------- an overhead sign for DEPARTURES over the near carriageway, and street lamps along the median
  const signTex = canvasTex(1024, 256, (x, w, h) => { x.fillStyle = '#12306a'; x.fillRect(0, 0, w, h); x.strokeStyle = '#fff'; x.lineWidth = 8; x.strokeRect(10, 10, w - 20, h - 20); x.fillStyle = '#fff'; x.font = 'bold 110px Segoe UI, Arial, sans-serif'; x.fillText('Departures', 60, 150); x.font = 'bold 70px Segoe UI, Arial, sans-serif'; x.fillStyle = '#ffd23f'; x.fillText('Terminal 2', 60, 225); x.fillStyle = '#fff'; x.fillText('\u2192', 860, 190); });
  for (const x of [-9, 9]) add(new THREE.CylinderGeometry(0.16, 0.2, 7.5, 14), steel, x, 3.75, 8.8);
  add(new THREE.BoxGeometry(18.4, 0.3, 0.3), steel, 0, 7.4, 8.8);
  add(new THREE.BoxGeometry(11, 2.4, 0.16), new THREE.MeshBasicMaterial({ map: signTex, toneMapped: false }), 0, 6.1, 8.7);
  const lampGlow = new THREE.MeshBasicMaterial({ color: 0xfff0cc, toneMapped: false });
  for (let x = -66; x <= 66; x += 14) { add(new THREE.CylinderGeometry(0.1, 0.15, 8.2, 12), steel, x, 4.1, (MZ0 + MZ1) / 2); add(new THREE.BoxGeometry(3.4, 0.1, 0.1), steel, x + 1.6, 8.1, (MZ0 + MZ1) / 2 - 0.0); add(new THREE.BoxGeometry(0.9, 0.12, 0.35), lampGlow, x + 3.2, 8.0, (MZ0 + MZ1) / 2); add(new THREE.BoxGeometry(3.4, 0.1, 0.1), steel, x - 1.6, 8.1, (MZ0 + MZ1) / 2); add(new THREE.BoxGeometry(0.9, 0.12, 0.35), lampGlow, x - 3.2, 8.0, (MZ0 + MZ1) / 2); }

  // ---------- parked cars in the car park: three instanced meshes, so forty cars cost three draw calls
  { const N = 44, body = new THREE.InstancedMesh(new THREE.BoxGeometry(1.8, 0.62, 4.2), std(0xffffff, { roughness: 0.35, metalness: 0.4 }), N), cab = new THREE.InstancedMesh(new THREE.BoxGeometry(1.6, 0.55, 2.2), std(0x1b2430, { roughness: 0.15, metalness: 0.5 }), N), wheels = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.34, 0.34, 0.26, 14).rotateZ(Math.PI / 2), std(0x111214, { roughness: 0.9 }), N * 4);
    const cols = [0xf2f2f0, 0xd7d9dc, 0x23262b, 0x8a1f1f, 0x1d3f7a, 0x9aa0a6, 0xe9e3d4, 0x3d4a3a], M = new THREE.Matrix4(), Q = new THREE.Quaternion(), V = new THREE.Vector3(), Sc = new THREE.Vector3(1, 1, 1), C = new THREE.Color();
    let n = 0;
    for (let row = 0; row < 2 && n < N; row++) for (let x = -62; x <= 62 && n < N; x += 3.1) { if (((x * 5 + row * 3) | 0) % 7 === 0) continue; const z = row ? 52 : 41, ry = row ? Math.PI : 0;
      Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), ry); M.compose(V.set(x, 0.62, z), Q, Sc); body.setMatrixAt(n, M); M.compose(V.set(x, 1.2, z - 0.2 * Math.cos(ry)), Q, Sc); cab.setMatrixAt(n, M); body.setColorAt(n, C.setHex(cols[n % cols.length]));
      let k = 0; for (const [dx, dz] of [[-0.86, -1.35], [0.86, -1.35], [-0.86, 1.35], [0.86, 1.35]]) { M.compose(V.set(x + dx, 0.34, z + dz), Q, Sc); wheels.setMatrixAt(n * 4 + k++, M); } n++; }
    body.count = cab.count = n; wheels.count = n * 4; body.instanceColor.needsUpdate = true; g.add(body, cab, wheels); }

  // ---------- life on the road: real taxis (the Rodin model) driving slowly along the far carriageway, one stopped at the kerb across
  const movers = [];
  [[0xf2f2f0, 3.2, 21.2, 1, -50], [0x1d3f7a, 4.4, 27.6, -1, 20], [0x8a1f1f, 2.6, 21.2, 1, 10], [0xd7d9dc, 3.6, 27.6, -1, -40]].forEach(([col, v, z, dir, x0]) => {
    const car = propGroup('taxi', 2.1, 0, (m) => m.traverse((o) => { if (o.isMesh) { o.material = o.material.clone(); o.material.color.set(col); } }));
    const holder = new THREE.Group(); holder.add(car); car.rotation.y = dir > 0 ? Math.PI / 2 : -Math.PI / 2; holder.position.set(x0, 0, z); g.add(holder); movers.push({ holder, v: v * dir });
  });
  g.userData.update = (dt) => { for (const m of movers) { m.holder.position.x += m.v * dt; if (m.holder.position.x > 62) m.holder.position.x = -62; if (m.holder.position.x < -62) m.holder.position.x = 62; } };

  // ---------- median planting: ferns and palms between the lamps
  const median = [];
  for (let x = -66; x <= 66; x += 4.5) median.push(['fern_02', x, 0.16, (MZ0 + MZ1) / 2 + ((x * 3) % 1) * 0.6, x * 1.3, 1.0]);
  for (let x = -60; x <= 60; x += 15) { add(new THREE.CylinderGeometry(0.12, 0.2, 5.5, 10), bark, x, 2.75, (MZ0 + MZ1) / 2 + 0.3); for (let k = 0; k < 4; k++) median.push(['fern_02', x + Math.cos(k * 1.6) * 0.15, 5.4, (MZ0 + MZ1) / 2 + 0.3 + Math.sin(k * 1.6) * 0.15, k * 1.6 + x, 2.6]); }
  placeProps(g, median);


  // =================== finer detail ===================
  const dkSteel = std(0x474c52, { metalness: 0.8, roughness: 0.4 }), wood = std(0x9b7048, { roughness: 0.65 }), blackM = std(0x1c1d20, { roughness: 0.8 }), yellowM = std(0xf0bf10, { roughness: 0.6 });
  // ---------- a zebra crossing from the kerb to the median, stop lines, road arrows, drains and manholes
  for (let z = 0.6; z < 13.2; z += 0.95) add(new THREE.PlaneGeometry(3.4, 0.5).rotateX(-Math.PI / 2), paint, 11.5, -0.003, z);
  add(new THREE.PlaneGeometry(0.3, 13.4).rotateX(-Math.PI / 2), paint, 9.6, -0.004, 6.4); add(new THREE.PlaneGeometry(0.3, 13.4).rotateX(-Math.PI / 2), paint, 13.4, -0.004, 6.4);
  const arrow = (x, z, ry = 0) => { const gp = new THREE.Group(); gp.position.set(x, -0.002, z); gp.rotation.y = ry; g.add(gp); add(new THREE.PlaneGeometry(0.34, 2.2).rotateX(-Math.PI / 2), paint, 0, 0, 0, 0, gp); const tri = new THREE.Mesh(new THREE.CircleGeometry(0.6, 3).rotateX(-Math.PI / 2), paint); tri.position.set(0, 0, -1.35); tri.rotation.y = Math.PI / 2; gp.add(tri); };
  for (const x of [-30, -18, -6, 28]) arrow(x, 4.5, Math.PI / 2);
  for (const x of [-26, 4, 22]) { add(new THREE.PlaneGeometry(1.3, 0.55).rotateX(-Math.PI / 2), blackM, x, 0.002, KERB_Z + 0.6); for (let k = 0; k < 6; k++) add(new THREE.PlaneGeometry(1.1, 0.04).rotateX(-Math.PI / 2), steel, x, 0.004, KERB_Z + 0.4 + k * 0.1); }   // drain grates
  for (const [x, z] of [[-14, 6.5], [-3, 11], [18, 8]]) { add(new THREE.CircleGeometry(0.38, 24).rotateX(-Math.PI / 2), dkSteel, x, 0.003, z); add(new THREE.RingGeometry(0.28, 0.32, 24).rotateX(-Math.PI / 2), steel, x, 0.004, z); }

  // ---------- street furniture on the forecourt: signs, bins, benches, a trolley bay
  const poleSign = (x, z, tex, w, h) => { add(new THREE.CylinderGeometry(0.045, 0.045, 2.6, 10), dkSteel, x, 1.3, z); add(new THREE.BoxGeometry(w, h, 0.04), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false }), x, 2.35, z - 0.02); };
  const taxiTex = canvasTex(256, 256, (x, w, h) => { x.fillStyle = '#12306a'; x.fillRect(0, 0, w, h); x.fillStyle = '#f0bf10'; x.font = 'bold 84px Segoe UI, Arial'; x.textAlign = 'center'; x.fillText('TAXI', 128, 120); x.fillStyle = '#fff'; x.font = 'bold 38px Segoe UI, Arial'; x.fillText('Pre-paid', 128, 180); x.fillText('rank', 128, 224); });
  const dropTex = canvasTex(256, 384, (x, w, h) => { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.fillStyle = '#12306a'; x.fillRect(0, 0, w, 120); x.fillStyle = '#fff'; x.font = 'bold 40px Segoe UI, Arial'; x.textAlign = 'center'; x.fillText('Passenger', 128, 54); x.fillText('drop-off', 128, 100); x.fillStyle = '#c0392b'; x.font = 'bold 46px Segoe UI, Arial'; x.fillText('Max 10 min', 128, 200); x.fillStyle = '#222'; x.font = '30px Segoe UI, Arial'; x.fillText('No waiting', 128, 260); x.fillText('beyond this point', 128, 304); });
  poleSign(-6.8, KERB_Z - 0.35, taxiTex, 0.7, 0.7); poleSign(7.4, KERB_Z - 0.35, dropTex, 0.65, 0.98);
  for (const x of [-9.4, 10.2, -15.6]) { const bin = add(new THREE.CylinderGeometry(0.27, 0.24, 0.95, 18), dkSteel, x, 0.48, WALL_Z + 0.55); add(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 18), steel, x, 0.97, WALL_Z + 0.55); add(new THREE.BoxGeometry(0.22, 0.1, 0.02), blackM, x, 0.7, WALL_Z + 0.82); }
  for (const x of [-11.2, 12.4]) { for (let k = 0; k < 3; k++) { add(new THREE.BoxGeometry(1.7, 0.04, 0.13), wood, x, 0.45, WALL_Z + 0.55 + k * 0.15); add(new THREE.BoxGeometry(1.7, 0.1, 0.03), wood, x, 0.68 + k * 0.14, WALL_Z + 0.27); } for (const dx of [-0.75, 0.75]) add(new THREE.BoxGeometry(0.05, 0.45, 0.6), dkSteel, x + dx, 0.22, WALL_Z + 0.5); }
  const trolley = (x, z, ry = 0) => { const gt = new THREE.Group(); gt.position.set(x, 0, z); gt.rotation.y = ry; g.add(gt);
    add(new THREE.BoxGeometry(0.55, 0.035, 0.95), steel, 0, 0.26, 0, 0, gt); for (const dx of [-0.27, 0.27]) { add(new THREE.BoxGeometry(0.025, 0.5, 0.025), steel, dx, 0.5, 0.45, 0, gt); add(new THREE.BoxGeometry(0.025, 0.025, 0.95), steel, dx, 0.5, 0, 0, gt); add(new THREE.BoxGeometry(0.025, 0.5, 0.025), steel, dx, 0.5, -0.45, 0, gt); }
    add(new THREE.BoxGeometry(0.58, 0.03, 0.03), blackM, 0, 1.0, -0.5, 0, gt); for (const dx of [-0.27, 0.27]) add(new THREE.BoxGeometry(0.03, 0.76, 0.03), steel, dx, 0.62, -0.5, 0, gt);
    for (const [dx, dz] of [[-0.24, 0.42], [0.24, 0.42], [-0.24, -0.42], [0.24, -0.42]]) add(new THREE.SphereGeometry(0.05, 8, 6), blackM, dx, 0.07, dz, 0, gt); };
  for (let k = 0; k < 7; k++) trolley(-19.5 + k * 0.1, WALL_Z + 0.9 + k * 0.3, 0);          // a nested row of trolleys against the glass
  for (let k = 0; k < 5; k++) trolley(17.0 - k * 0.1, WALL_Z + 0.9 + k * 0.3, 0);
  // CCTV domes and flag poles
  for (const x of [-16, -7, 7, 16]) { add(new THREE.CylinderGeometry(0.035, 0.035, 0.5, 8), dkSteel, x, 5.65, WALL_Z + 1.1); add(new THREE.SphereGeometry(0.13, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2).rotateX(Math.PI), blackM, x, 5.4, WALL_Z + 1.1); }

  // ---------- canopy underside: ribs, light strips and a hanging sign
  for (let x = -33; x <= 33; x += 3) add(new THREE.BoxGeometry(0.12, 0.14, CZ - WALL_Z + 0.5), white, x, 5.82, (WALL_Z + CZ) / 2 - 0.15);
  const hang = canvasTex(1024, 192, (x, w, h) => { x.fillStyle = '#0b2a5e'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.font = 'bold 104px Segoe UI, Arial'; x.fillText('Departures', 40, 124); x.fillStyle = '#ffd23f'; x.fillText('\u2191', 860, 124); x.fillStyle = '#12a3a1'; x.fillRect(0, h - 12, w, 12); });
  const hs = add(new THREE.BoxGeometry(4.4, 0.8, 0.1), new THREE.MeshBasicMaterial({ map: hang, toneMapped: false }), 0, 4.9, WALL_Z + 0.6); for (const dx of [-1.8, 1.8]) add(new THREE.CylinderGeometry(0.012, 0.012, 1.0, 6), steel, dx, 5.4, WALL_Z + 0.6);
  // lettering on the building face
  const face = canvasTex(2048, 256, (x, w, h) => { x.fillStyle = 'rgba(0,0,0,0)'; x.clearRect(0, 0, w, h); x.fillStyle = '#12306a'; x.font = 'bold 190px Segoe UI, Arial'; x.fillText('TERMINAL 2', 40, 200); x.fillStyle = '#12a3a1'; x.fillRect(1180, 90, 8, 120); x.fillStyle = '#12306a'; x.font = 'bold 120px Segoe UI, Arial'; x.fillText('Practice Air', 1240, 195); });
  const lt = add(new THREE.PlaneGeometry(14, 1.75), new THREE.MeshBasicMaterial({ map: face, transparent: true, toneMapped: false }), -11, 10.4, WALL_Z - 0.36);

  // ---------- the lobby seen through the glass: a row of check-in counters with their signs
  const lobby = [];
  for (let i = 0; i < 9; i++) { const x = -24 + i * 6; lobby.push(['checkin_counter', x, 0, WALL_Z - 10, 0, 0.95], ['checkin_counter', x + 1.9, 0, WALL_Z - 10, 0, 0.95], ['checkin_counter', x + 3.8, 0, WALL_Z - 10, 0, 0.95]); }
  placeProps(g, lobby);
  for (let i = 0; i < 9; i++) { const x = -22 + i * 6 + 1.9; add(new THREE.BoxGeometry(5.2, 0.7, 0.08), std(0x12306a, { roughness: 0.5, emissive: 0x0a1c40, emissiveIntensity: 0.6 }), x, 4.4, WALL_Z - 10.9); add(new THREE.BoxGeometry(5.2, 0.12, 0.1), std(0x12a3a1, { roughness: 0.4 }), x, 4.0, WALL_Z - 10.9); for (const dx of [-2.3, 2.3]) add(new THREE.CylinderGeometry(0.02, 0.02, 1.4, 6), steel, x + dx, 5.15, WALL_Z - 10.9); }
  const board = canvasTex(1024, 384, (x, w, h) => { x.fillStyle = '#05101f'; x.fillRect(0, 0, w, h); x.fillStyle = '#ffd23f'; x.font = 'bold 54px Segoe UI, Arial'; x.fillText('DEPARTURES', 30, 70); x.font = '40px Consolas, monospace'; ['10:40  MUMBAI    PA101  12', '11:10  DELHI     PA205  06', '11:30  CHENNAI   PA309  09', '12:05  KOLKATA   PA411  04'].forEach((t, i) => { x.fillStyle = i % 2 ? '#fff' : '#9ee7ff'; x.fillText(t, 30, 150 + i * 56); }); });
  add(new THREE.BoxGeometry(4.2, 1.6, 0.1), new THREE.MeshBasicMaterial({ map: board, toneMapped: false }), 0, 3.6, WALL_Z - 6.2);
  for (const dx of [-1.9, 1.9]) add(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 6), steel, dx, 5.0, WALL_Z - 6.2);

  // ---------- sky life: soft clouds and an aircraft crossing slowly
  const cloudTex = canvasTex(256, 128, (x, w, h) => { const gr = x.createRadialGradient(w / 2, h / 2, 4, w / 2, h / 2, h / 2); gr.addColorStop(0, 'rgba(255,255,255,0.95)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); x.fillStyle = gr; x.fillRect(0, 0, w, h); for (let k = 0; k < 5; k++) { x.beginPath(); x.arc(40 + k * 40, 64 + ((k * 13) % 3) * 8 - 8, 30 + (k % 2) * 10, 0, 7); x.fillStyle = 'rgba(255,255,255,0.5)'; x.fill(); } });
  const cmat = new THREE.MeshBasicMaterial({ map: cloudTex, transparent: true, depthWrite: false, toneMapped: false, fog: false });
  for (const [x, y, z, sc] of [[-30, 38, 45, 1.2], [15, 46, 30, 1.5], [40, 34, 55, 1.0], [-5, 52, 20, 1.7], [-48, 44, 12, 1.3], [55, 50, 8, 1.4]]) { const c = add(new THREE.PlaneGeometry(36 * sc, 14 * sc), cmat, x, y, z); c.rotation.x = -0.25; c.renderOrder = -7; }
  const plane = new THREE.Group(); g.add(plane);
  add(new THREE.CylinderGeometry(0.5, 0.42, 6.5, 14).rotateZ(Math.PI / 2), white, 0, 0, 0, 0, plane); add(new THREE.ConeGeometry(0.42, 1.4, 14).rotateZ(-Math.PI / 2), white, 3.9, 0, 0, 0, plane);
  add(new THREE.BoxGeometry(1.4, 0.06, 6.4), white, 0.4, -0.1, 0, 0, plane); add(new THREE.BoxGeometry(0.9, 1.1, 0.08), std(0x12a3a1, { roughness: 0.5 }), -2.9, 0.7, 0, 0, plane); add(new THREE.BoxGeometry(0.7, 0.05, 2.2), white, -2.9, 0.1, 0, 0, plane);
  plane.position.set(-70, 48, 40); plane.rotation.z = 0.06;
  const prevUpdate = g.userData.update; let tPlane = 0;
  g.userData.update = (dt) => { prevUpdate?.(dt); tPlane += dt; plane.position.x = -70 + ((tPlane * 3.4) % 140); plane.position.y = 48 + Math.sin(tPlane * 0.2) * 1.5; };


  // ---------- flags on tall poles by the kerb, auto-rickshaws and an airport shuttle bus on the road
  const flagTex = canvasTex(256, 170, (x, w, h) => { x.fillStyle = '#ff9933'; x.fillRect(0, 0, w, h / 3); x.fillStyle = '#fff'; x.fillRect(0, h / 3, w, h / 3); x.fillStyle = '#138808'; x.fillRect(0, 2 * h / 3, w, h / 3 + 1); x.strokeStyle = '#000080'; x.lineWidth = 3; x.beginPath(); x.arc(w / 2, h / 2, 17, 0, 7); x.stroke(); for (let k = 0; k < 12; k++) { x.beginPath(); x.moveTo(w / 2, h / 2); x.lineTo(w / 2 + 17 * Math.cos(k * Math.PI / 6), h / 2 + 17 * Math.sin(k * Math.PI / 6)); x.stroke(); } });
  const airTex = canvasTex(256, 170, (x, w, h) => { x.fillStyle = '#12a3a1'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.beginPath(); x.moveTo(60, 120); x.lineTo(130, 30); x.lineTo(150, 36); x.lineTo(110, 124); x.fill(); x.font = 'bold 30px Segoe UI, Arial'; x.fillText('Practice Air', 118, 120); });
  const flags = [];
  [[-3.6, flagTex], [-2.4, airTex], [2.4, airTex], [3.6, flagTex]].forEach(([x, tex], i) => {
    add(new THREE.CylinderGeometry(0.05, 0.075, 8.4, 12), steel, x, 4.2, KERB_Z - 0.9); add(new THREE.SphereGeometry(0.09, 10, 8), yellowM, x, 8.45, KERB_Z - 0.9);
    const pivot = new THREE.Group(); pivot.position.set(x, 7.6, KERB_Z - 0.9); g.add(pivot);
    const fl = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.0), new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false })); fl.position.set(0.76, 0, 0); pivot.add(fl); flags.push({ pivot, ph: i * 1.3 });
  });
  const auto = (x, z, ry, body = 0x1f1f22, roof = 0xf0bf10) => { const ga = new THREE.Group(); ga.position.set(x, 0, z); ga.rotation.y = ry; g.add(ga);
    add(new THREE.BoxGeometry(1.25, 0.5, 2.3), std(roof, { roughness: 0.5 }), 0, 0.62, 0, 0, ga); add(new THREE.BoxGeometry(1.2, 0.6, 1.2), std(body, { roughness: 0.5 }), 0, 0.5, 0.3, 0, ga);
    add(new THREE.BoxGeometry(1.3, 0.07, 1.7), std(body, { roughness: 0.6 }), 0, 1.72, 0.25, 0, ga); for (const [dx, dz] of [[-0.6, -0.5], [0.6, -0.5], [-0.6, 0.95], [0.6, 0.95]]) add(new THREE.BoxGeometry(0.04, 1.0, 0.04), dkSteel, dx, 1.2, dz, 0, ga);
    add(new THREE.BoxGeometry(1.1, 0.8, 0.04), new THREE.MeshStandardMaterial({ color: 0x9fc9d8, roughness: 0.05, transparent: true, opacity: 0.35 }), 0, 1.25, -0.5, 0.0, ga);
    add(new THREE.BoxGeometry(0.9, 0.4, 0.6), std(roof, { roughness: 0.5 }), 0, 0.55, -1.2, 0, ga); add(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 14).rotateZ(Math.PI / 2), blackM, 0, 0.28, -1.35, 0, ga); for (const dx of [-0.55, 0.55]) add(new THREE.CylinderGeometry(0.28, 0.28, 0.12, 14).rotateZ(Math.PI / 2), blackM, dx, 0.28, 0.9, 0, ga); };
  auto(-12, 31.0 - 0.2, Math.PI / 2, 0x1f1f22, 0xf0bf10); auto(-4, 31.0 - 0.2, Math.PI / 2, 0x138808, 0xf0bf10); auto(10, 31.0 - 0.2, -Math.PI / 2, 0x1f1f22, 0xf0bf10);
  const busTex = canvasTex(1024, 256, (x, w, h) => { x.fillStyle = '#f4f5f6'; x.fillRect(0, 0, w, h); x.fillStyle = '#12a3a1'; x.fillRect(0, 150, w, 34); x.fillStyle = '#12306a'; x.fillRect(0, 184, w, 14); x.fillStyle = '#26323c'; for (let k = 0; k < 8; k++) x.fillRect(40 + k * 118, 36, 100, 90); x.fillStyle = '#12306a'; x.font = 'bold 36px Segoe UI, Arial'; x.fillText('Practice Air   Airport shuttle', 150, 232); });
  const bus = new THREE.Group(); bus.position.set(-40, 0, 27.4); g.add(bus);
  { const bm = new THREE.Mesh(new THREE.BoxGeometry(9.4, 3.0, 2.5), [std(0xf4f5f6), std(0xf4f5f6), std(0xf4f5f6), std(0x777b80), new THREE.MeshStandardMaterial({ map: busTex, roughness: 0.4 }), new THREE.MeshStandardMaterial({ map: busTex, roughness: 0.4 })]); bm.position.y = 1.7; bus.add(bm);
    for (const dx of [-3, 3]) for (const dz of [-1.05, 1.05]) add(new THREE.CylinderGeometry(0.5, 0.5, 0.3, 18).rotateX(Math.PI / 2), blackM, dx, 0.5, dz, 0, bus); }
  const prevU = g.userData.update; let tF = 0;
  g.userData.update = (dt) => { prevU?.(dt); tF += dt; bus.position.x += 3.6 * dt; if (bus.position.x > 62) bus.position.x = -62; for (const f of flags) f.pivot.rotation.y = Math.sin(tF * 1.6 + f.ph) * 0.35 - 0.2; };
  // uplights at the foot of the columns, glowing white
  for (const x of [-20, -12, -4.6, 4.6, 12, 20]) add(new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12), glow, x + 0.55, 0.04, -1.55 + 0.55);

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
