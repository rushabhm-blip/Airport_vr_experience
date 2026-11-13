import * as THREE from 'three';
import { mergeStatic } from './merge.js';
import { terrazzoTexture } from './floors.js';
import { Crowd } from './crowd.js';
import { makeRealism, skylineRing } from './realism3d.js';
import { makeProps } from './props3d.js';

/**
 * The departures hall as real 3D geometry (not a photograph): a high barrel-vaulted roof, branching white columns, a glass curtain wall,
 * a glossy terrazzo floor, rows of check-in islands with canopies, queue stanchions, planters and seating.
 * Everything is built from simple shapes and merged by material, so the whole hall costs only a handful of draw calls.
 * The learner stands at the origin looking down -z. The hall spans x -30..30 and z -34..26.
 */
const HX = 30, Z0 = -34, Z1 = 26, CROWN = 13.5, EAVE = 8.8;

export function buildHall3D({ envMap = null, floorTex = null, ceilTex = null, density = 1 } = {}) {
  const g = new THREE.Group(); g.name = 'Hall3D';
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, envMap, envMapIntensity: 0.7, ...o });
  const white = std(0xf4f3ef, { roughness: 0.34, emissive: 0x4a4944, emissiveIntensity: 1 }), steel = std(0xc9ced2, { metalness: 0.85, roughness: 0.26, envMapIntensity: 1 });
  const dark = std(0x23272c, { roughness: 0.55 }), navy = std(0x15305a, { roughness: 0.4 }), teal = std(0x12a3a1, { roughness: 0.4 });
  const leaf = std(0x2f8a3f, { roughness: 0.8 }), leaf2 = std(0x3ea34d, { roughness: 0.8 }), seatMat = std(0x2b3a52, { roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xaed6ee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMap, envMapIntensity: 1 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xfff3d2, toneMapped: false }), skyGlow = new THREE.MeshBasicMaterial({ color: 0xcfeaff, toneMapped: false });
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = false; static_.add(m); return m; };
  const static_ = new THREE.Group(); g.add(static_);

  // ---- floor: glossy terrazzo that mirrors the hall around it
  floorTex = terrazzoTexture(); floorTex.repeat.set((HX * 2) / 3, (Z1 - Z0) / 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, Z1 - Z0).rotateX(-Math.PI / 2), std(0xffffff, { roughness: 0.16, map: floorTex, envMapIntensity: 0.9 }));
  floor.position.set(0, 0, (Z0 + Z1) / 2); g.add(floor);

  // ---- barrel-vaulted roof (a shallow arch along z), with light strips, downlights and skylights
  const span = HX * 2, sag = CROWN - EAVE, R = (span * span) / (8 * sag) + sag / 2, half = Math.asin(HX / R);
  const vy = (x) => CROWN - R + Math.sqrt(Math.max(0, R * R - x * x));
  const RL = makeRealism(static_, { steel, white, dark, teal, navy, glow, vy });
  if (ceilTex) { ceilTex = ceilTex.clone(); ceilTex.wrapS = ceilTex.wrapT = THREE.RepeatWrapping; ceilTex.repeat.set(14, 12); ceilTex.needsUpdate = true; }
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(R, R, Z1 - Z0, 96, 1, true, -half, 2 * half).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xeeece6, side: THREE.BackSide, toneMapped: false }));
  vault.position.set(0, CROWN - R, (Z0 + Z1) / 2); g.add(vault);
  for (const x of [-22, -14, -6, 6, 14, 22]) add(new THREE.BoxGeometry(0.3, 0.07, Z1 - Z0 - 2), glow, x, vy(x) - 0.06, (Z0 + Z1) / 2);
  const down = new THREE.CircleGeometry(0.16, 16).rotateX(Math.PI / 2);
  for (let x = -26; x <= 26; x += 4) for (let z = Z0 + 3; z < Z1; z += 6) add(down, glow, x + 2, vy(x + 2) - 0.1, z);
  for (const [x, z] of [[0, -8], [0, -26], [0, 12], [-16, -16], [16, -16]]) add(new THREE.BoxGeometry(5, 0.06, 9), skyGlow, x, vy(x) - 0.08, z);

  // ---- glass curtain wall on three sides, with steel mullions
  const WH = EAVE;
  const wall = (w, rotY, x, z) => { const m = add(new THREE.PlaneGeometry(w, WH), glass, x, WH / 2, z); m.rotation.y = rotY; };
  wall(Z1 - Z0, Math.PI / 2, -HX, (Z0 + Z1) / 2); wall(Z1 - Z0, -Math.PI / 2, HX, (Z0 + Z1) / 2); wall(HX * 2, 0, 0, Z0);
  for (let z = Z0; z <= Z1; z += 3) for (const x of [-HX, HX]) add(new THREE.BoxGeometry(0.14, WH, 0.14), steel, x, WH / 2, z);
  for (let x = -HX; x <= HX; x += 3) add(new THREE.BoxGeometry(0.14, WH, 0.14), steel, x, WH / 2, Z0);
  for (const y of [0.1, 3.2, 6.2, WH]) { add(new THREE.BoxGeometry(0.12, 0.12, Z1 - Z0), steel, -HX, y, (Z0 + Z1) / 2); add(new THREE.BoxGeometry(0.12, 0.12, Z1 - Z0), steel, HX, y, (Z0 + Z1) / 2); add(new THREE.BoxGeometry(HX * 2, 0.12, 0.12), steel, 0, y, Z0); }
  // the solid back wall behind the learner
  add(new THREE.PlaneGeometry(HX * 2, WH).rotateY(Math.PI), white, 0, WH / 2, Z1);

  // ---- branching white columns ("Y" shaped): a trunk, then two limbs that open out and reach the roof
  const limb = (x, y, z, dx, dy, dz, r0, r1) => {
    const dir = new THREE.Vector3(dx, dy, dz), len = dir.length(), geo = new THREE.CylinderGeometry(r1, r0, len, 14).translate(0, len / 2, 0);
    const m = add(geo, white, x, y, z); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  };
  for (const cx of [-15, 15]) for (const cz of [-28, -16, -4, 8, 20]) {
    const top = vy(cx) - 0.2, trunkH = 6.2;
    limb(cx, 0, cz, 0, trunkH, 0, 0.62, 0.46);
    const spread = 3.4, upH = top - trunkH - 0.1;
    limb(cx, trunkH - 0.1, cz, -spread, upH, 0.5, 0.34, 0.2); limb(cx, trunkH - 0.1, cz, spread, upH, -0.5, 0.34, 0.2);
    add(new THREE.CylinderGeometry(0.7, 0.7, 0.35, 20), steel, cx, 0.18, cz);       // steel foot ring
  }

  // ---- check-in islands: back-to-back counters, a navy and teal canopy over each, and queue stanchions in front
  const island = (cx, cz, n) => {
    const len = n * 1.9;
    for (const side of [-1, 1]) for (let i = 0; i < n; i++) {
      const x = cx - len / 2 + 0.95 + i * 1.9, z = cz + side * 0.95;
      add(new THREE.BoxGeometry(1.8, 1.0, 0.7), white, x, 0.5, z);
      add(new THREE.BoxGeometry(1.84, 0.05, 0.78), dark, x, 1.03, z);
      add(new THREE.BoxGeometry(1.82, 0.05, 0.72), teal, x, 0.72, z);
      add(new THREE.BoxGeometry(0.5, 0.32, 0.04), dark, x, 1.5, z + side * 0.05, 0, 0, 0);
      add(new THREE.BoxGeometry(0.05, 0.4, 0.05), steel, x, 1.25, z + side * 0.05);
    }
    add(new THREE.BoxGeometry(len + 0.4, 0.5, 3.6), navy, cx, 5.0, cz);              // canopy
    add(new THREE.BoxGeometry(len + 0.42, 0.14, 3.62), teal, cx, 4.68, cz);
    add(new THREE.BoxGeometry(len, 0.06, 2.4), glow, cx, 4.64, cz);                    // light under it
    for (const sx of [-len / 2 + 0.5, len / 2 - 0.5]) add(new THREE.CylinderGeometry(0.03, 0.03, vy(cx) - 5.2, 8), steel, cx + sx, 5.2 + (vy(cx) - 5.2) / 2, cz);
    for (let i = -1; i <= 1; i += 2) for (let k = 0; k < Math.floor(len / 2.2); k++) {      // stanchions and belts in front of the counters
      const px = cx - len / 2 + 1 + k * 2.2, pz = cz + i * 3.2;
      add(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 8), steel, px, 0.5, pz); add(new THREE.CylinderGeometry(0.2, 0.22, 0.03, 14), steel, px, 0.02, pz);
      if (k > 0) add(new THREE.BoxGeometry(2.2, 0.05, 0.02), navy, px - 1.1, 0.88, pz);
    }
  };
  for (const [cx, cz] of [[-18, -24], [0, -24], [18, -24], [-18, -10], [18, -10]]) island(cx, cz, 6);

  // ---- planters with leafy plants
  const plants = [], plant = (x, z, s = 1) => { plants.push([x, z, s]); };      // drawn later, with the leafy plant model
  for (const [x, z] of [[-9, -17], [9, -17], [-9, -3], [9, -3], [-24, -12], [24, -12], [-24, 6], [24, 6], [-6, 12], [6, 12], [-26, -28], [26, -28]]) plant(x, z, 1.1);

  // ---- seating lounge to the left and right
  const bench = (x, z, n, ry = 0) => { for (let i = 0; i < n; i++) { const g2 = new THREE.Group(); const sx = i * 0.62; const seat = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.52), seatMat), back = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.45, 0.08), seatMat), leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.5), steel);
    seat.position.set(sx, 0.45, 0); back.position.set(sx, 0.72, -0.24); leg.position.set(sx, 0.2, 0); g2.add(seat, back, leg); g2.position.set(x, 0, z); g2.rotation.y = ry; static_.add(g2); } };
  for (let r = 0; r < 4; r++) { bench(-27 + 0, 2 + r * 2.4, 5, Math.PI / 2); bench(26, 2 + r * 2.4, 5, -Math.PI / 2); }

  // ---- outside the glass: sky and the apron
  const sky = new THREE.Mesh(new THREE.SphereGeometry(72, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 vP; void main(){ float h = clamp(vP.y*1.5+0.1,0.,1.); vec3 c = mix(vec3(0.86,0.92,0.97), vec3(0.36,0.62,0.9), pow(h,0.6)); gl_FragColor = vec4(c,1.0);}' }));
  sky.renderOrder = -12; g.add(sky);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(200, 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x7d8488, roughness: 1 })); apron.position.set(0, -0.05, -70); g.add(apron);


  // ================= MORE DETAIL =================
  const sRGB = THREE.SRGBColorSpace;
  const label = (draw, pw, ph) => { const c = document.createElement('canvas'); c.width = pw; c.height = ph; draw(c.getContext('2d'), pw, ph); const t = new THREE.CanvasTexture(c); t.colorSpace = sRGB; t.anisotropy = 4; return t; };
  const sign = (tex, w, hh, x, y, z, ry = 0) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide })); m.position.set(x, y, z); m.rotation.y = ry; static_.add(m); return m; };      // merged with the rest (same picture = one draw)
  const rods = (x, y, z, w) => { for (const sx of [-w / 2 + 0.3, w / 2 - 0.3]) add(new THREE.CylinderGeometry(0.015, 0.015, vy(x) - y, 6), steel, x + sx, y + (vy(x) - y) / 2, z); };

  // roof ribs (arches across the hall) and cove lights along the eaves
  for (const z of [-30, -18, -6, 6, 18]) {
    const pts = []; for (let i = 0; i <= 24; i++) { const x = -HX + (i / 24) * HX * 2; pts.push(new THREE.Vector3(x, vy(x) - 0.12, z)); }
    add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 48, 0.16, 8), white);
  }
  for (const sx of [-1, 1]) add(new THREE.BoxGeometry(0.2, 0.08, Z1 - Z0), glow, sx * (HX - 0.4), EAVE + 0.1, (Z0 + Z1) / 2);

  // mezzanine along the right-hand side, with a glass balustrade, stairs and cafe tables
  const MZ = 5.4, mzx0 = 18, mzx1 = HX, mzz0 = Z0, mzz1 = 10, mzc = (mzx0 + mzx1) / 2, mzl = mzz1 - mzz0, mzm = (mzz0 + mzz1) / 2;
  add(new THREE.BoxGeometry(mzx1 - mzx0, 0.4, mzl), white, mzc, MZ - 0.2, mzm);
  add(new THREE.BoxGeometry(0.3, 0.5, mzl), navy, mzx0, MZ - 0.25, mzm);
  add(new THREE.BoxGeometry(0.16, 0.05, mzl), glow, mzx0 + 0.3, MZ - 0.43, mzm);
  const bal = add(new THREE.PlaneGeometry(mzl, 1.1), glass, mzx0, MZ + 0.55, mzm); bal.rotation.y = Math.PI / 2;
  add(new THREE.BoxGeometry(0.08, 0.06, mzl), steel, mzx0, MZ + 1.12, mzm);
  for (let z = mzz0; z <= mzz1; z += 2) add(new THREE.BoxGeometry(0.06, 1.1, 0.06), steel, mzx0, MZ + 0.55, z);
  for (let i = 0; i < 22; i++) add(new THREE.BoxGeometry(2.6, 0.18, 0.34), white, 23, 0.1 + i * (MZ / 22), mzz1 + 0.2 + (21 - i) * 0.34);   // stairs up to the mezzanine
  for (const sx of [21.6, 24.4]) add(new THREE.BoxGeometry(0.06, 1.0, 8), steel, sx, MZ / 2 + 0.55, mzz1 + 4, -0.6, 0, 0);
  for (const [tx, tz] of [[24, -30], [27, -24], [24, -18], [27, -12], [24, -6], [27, 0]]) {
    add(new THREE.CylinderGeometry(0.5, 0.5, 0.05, 20), white, tx, MZ + 0.75, tz); add(new THREE.CylinderGeometry(0.05, 0.05, 0.75, 8), steel, tx, MZ + 0.37, tz);
    for (const a of [0, 2.1, 4.2]) add(new THREE.BoxGeometry(0.42, 0.06, 0.42), teal, tx + Math.cos(a) * 0.85, MZ + 0.46, tz + Math.sin(a) * 0.85);
  }
  plant(21, -32, 1.0); plant(28, -32, 1.0); plant(28, 6, 1.0);

  // floor details: guide strips, a tactile path from the entrance to the counters, and rings of planters around the column feet
  for (const x of [-9, 9]) add(new THREE.PlaneGeometry(1.6, Z1 - Z0 - 4).rotateX(-Math.PI / 2), std(0x9aa1a8, { roughness: 0.25, envMapIntensity: 0.4 }), x, 0.012, (Z0 + Z1) / 2);
  add(new THREE.PlaneGeometry(0.5, 40).rotateX(-Math.PI / 2), std(0xe6c22a, { roughness: 0.6 }), 0, 0.014, 6);
  for (const cx of [-15, 15]) for (const cz of [-28, -16, -4, 8, 20]) { add(new THREE.CylinderGeometry(1.15, 1.15, 0.5, 24), steel, cx, 0.25, cz); add(new THREE.CylinderGeometry(1.0, 1.0, 0.04, 24), leaf2, cx, 0.52, cz); }

  // flight information boards and island signs
  const FIDS = label((x, w, hh) => {
    x.fillStyle = '#0b1b33'; x.fillRect(0, 0, w, hh); x.fillStyle = '#ffc928'; x.font = '700 52px sans-serif'; x.fillText('DEPARTURES', 30, 70);
    x.font = '600 36px sans-serif'; const rows = [['PA101', 'MUMBAI', '10:40', 'C5'], ['PA205', 'DELHI', '11:10', 'C6'], ['PA309', 'CHENNAI', '11:30', 'C7'], ['PA412', 'KOLKATA', '12:05', 'C8'], ['PA518', 'HYDERABAD', '12:25', 'C9']];
    rows.forEach((r, i) => { const y = 130 + i * 64; x.fillStyle = i % 2 ? '#10284a' : '#0d2140'; x.fillRect(16, y - 40, w - 32, 56); x.fillStyle = '#ffffff'; x.fillText(r[0], 34, y); x.fillText(r[1], 220, y); x.fillStyle = '#7de0ff'; x.fillText(r[2], 620, y); x.fillStyle = '#ffc928'; x.fillText(r[3], 800, y); });
  }, 1024, 480);
  for (const [bx, bz] of [[-8, -8], [8, -8], [0, 8]]) { sign(FIDS, 4.4, 2.06, bx, 8.2, bz, bz > 0 ? Math.PI : 0); rods(bx, 9.3, bz, 4.4); }
  const CHK = label((x, w, hh) => { x.fillStyle = '#15305a'; x.fillRect(0, 0, w, hh); x.fillStyle = '#12a3a1'; x.fillRect(0, hh - 14, w, 14); x.fillStyle = '#ffffff'; x.font = '700 78px sans-serif'; x.textBaseline = 'middle'; x.fillText('CHECK-IN', 40, hh / 2 - 4); }, 1024, 160);
  [0, 1, 2, 3, 4].forEach((i) => {
    const cx = [-18, 0, 18, -18, 18][i], cz = [-24, -24, -24, -10, -10][i], t = CHK;
    for (const side of [-1, 1]) sign(t, 6.4, 1.0, cx, 4.98, cz + side * 1.83, side > 0 ? 0 : Math.PI);
  });
  const INFO = label((x, w, hh) => { x.fillStyle = '#12a3a1'; x.fillRect(0, 0, w, hh); x.fillStyle = '#ffffff'; x.font = '700 70px sans-serif'; x.textBaseline = 'middle'; x.fillText('i  INFORMATION', 40, hh / 2); }, 1024, 150);
  // information desk and a row of luggage trolleys near the entrance
  add(new THREE.BoxGeometry(5, 1.1, 1.2), white, 0, 0.55, 15); add(new THREE.BoxGeometry(5.1, 0.06, 1.3), dark, 0, 1.13, 15); add(new THREE.BoxGeometry(5.02, 0.06, 1.22), teal, 0, 0.78, 15);
  add(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8), steel, -2.2, 1.15, 15); add(new THREE.CylinderGeometry(0.04, 0.04, 2.3, 8), steel, 2.2, 1.15, 15);
  sign(INFO, 4.4, 0.65, 0, 2.55, 15, Math.PI);
  for (let i = 0; i < 9; i++) { const x = -9 + i * 0.62, z = 19; add(new THREE.BoxGeometry(0.5, 0.04, 0.8), steel, x, 0.2, z); add(new THREE.BoxGeometry(0.03, 0.8, 0.03), steel, x - 0.23, 0.6, z + 0.35); add(new THREE.BoxGeometry(0.03, 0.8, 0.03), steel, x + 0.23, 0.6, z + 0.35); add(new THREE.BoxGeometry(0.5, 0.03, 0.03), steel, x, 1.0, z + 0.35); add(new THREE.BoxGeometry(0.5, 0.4, 0.03), steel, x, 0.45, z - 0.3); }

  // outside the glass: a tree line, low hills and a kerb
  for (let x = -80; x <= 80; x += 6) { const z = -50 - ((x * 7) % 6); add(new THREE.CylinderGeometry(0.3, 0.4, 3.4, 8), dark, x, 1.7, z); add(new THREE.SphereGeometry(2.6 + ((x * 13) % 5) / 6, 10, 8), leaf, x, 5.0, z); add(new THREE.SphereGeometry(1.9, 10, 8), leaf2, x + 1.0, 6.2, z); }
  
  add(new THREE.BoxGeometry(HX * 2 + 40, 0.15, 3), std(0xcfd3d6, { roughness: 0.9 }), 0, 0.04, Z0 - 6);

  // ================= SHOPS, ADVERTS, KIOSKS AND FURNISHINGS =================
  const P = makeProps(static_, { steel, white, dark, teal, navy, glass, glow });
  for (const a of plants) { P.plant(...a); RL.blob(a[0], a[1], 0.95 * a[2]); }
  // ---- realism: window sunlight, contact shadows, ceiling fittings, belts, doors and safety equipment
  RL.sun([-HX, Z0], [HX, Z0], [0, 1], 11, { opacity: 0.4 }); RL.sun([-HX, Z0], [-HX, Z1], [1, 0], 9, { opacity: 0.34, shear: 0.3 }); RL.sun([HX, Z0], [HX, Z1], [-1, 0], 9, { opacity: 0.34, shear: -0.3 });
  for (const cx of [-15, 15]) for (const cz of [-28, -16, -4, 8, 20]) RL.blob(cx, cz, 1.7);
  for (const [cx, cz] of [[-18, -24], [0, -24], [18, -24], [-18, -10], [18, -10]]) {
    RL.slab(cx, cz, 12.8, 4.6);
    for (let i = 0; i < 6; i++) { const x = cx - 4.75 + 1.9 * i; RL.belt(x, cz + 1.62, 1); RL.belt(x, cz - 1.62, -1); }
  }
  RL.slab(11.2, -4.2, 6.4, 1.2); RL.slab(-11.2, -4.2, 6.4, 1.2); RL.slab(0, 15, 5.8, 2.0); RL.slab(-4.5, 19, 6.2, 1.4);
  for (const x of [-20, -8, 8, 20]) RL.slab(x, 24.4, 9.6, 3.8);
  RL.slab(24, -12, 12.4, 44.4);        // the floor in the shade under the mezzanine
  for (const cx of [-15, 15]) for (const cz of [-16, -4, 8, 20]) RL.blob(cx - 1.6, cz + 0.4, 0.4);
  for (const x of [-24, -8, 8, 24]) for (const z of [-28, -12, 4, 20]) RL.cctv(x, z);
  for (const x of [-18, 0, 18]) for (const z of [-20, -4, 12]) RL.speaker(x, z);
  for (let x = -26; x <= 26; x += 6) for (let z = -30; z <= 22; z += 6) RL.sprinkler(x, z);
  for (const x of [-12, 12]) for (const z of [-30, -12, 6, 22]) RL.vent(x, z);
  RL.exit(-27.4, 7.0, 24.6, Math.PI); RL.exit(27.4, 7.0, 24.6, Math.PI); RL.exit(-20, 7.4, -31.5, 0); RL.exit(20, 7.4, -31.5, 0);
  RL.door(-27.5, 25.9, -1, 2.2); RL.door(27.5, 25.9, -1, 2.2); RL.extinguisher(-25.6, 1.3, 25.78, Math.PI); RL.extinguisher(25.6, 1.3, 25.78, Math.PI); RL.wallScreen(-24.6, 3.0, 25.85, Math.PI, 1.6, 0.9);
  { const ring = skylineRing(58, 24); ring.position.z = -4; g.add(ring); }
  P.shop(-20, 25.6, -1, 9, 'DUTY FREE', 0x15305a, ['#e8c06a', '#c95b4a', '#5a8fd0', '#e0e0e0']); P.shop(-8, 25.6, -1, 9, 'CAFE & BAKERY', 0x8a4b2a, ['#d9a05b', '#f2e0c0', '#8a4b2a', '#e8c06a']);
  P.shop(8, 25.6, -1, 9, 'BOOKS & GIFTS', 0x12a3a1, ['#5a8fd0', '#c95b4a', '#7bbf6a', '#e8c06a']); P.shop(20, 25.6, -1, 9, 'PHARMACY', 0x2f8a3f, ['#ffffff', '#7bbf6a', '#5a8fd0', '#e0e0e0']);
  P.lightbox(-14, 7.3, 25.85, Math.PI, 7, 2.1, 'Fly Practice Air', 'Mumbai · Delhi · Chennai', '#15305a', '#12a3a1'); P.lightbox(0, 7.3, 25.85, Math.PI, 7, 2.1, 'Discover India', 'Your journey starts here', '#c0392b', '#e0a030'); P.lightbox(14, 7.3, 25.85, Math.PI, 7, 2.1, 'Welcome Aboard', 'Calm. Clear. Cared for.', '#2c5aa0', '#7de0ff');
  P.clock(-4, 7.0, 25.8, Math.PI); P.clock(4, 7.0, 25.8, Math.PI);
  for (let i = 0; i < 4; i++) { P.kiosk(8 + i * 1.25, -4.2); P.kiosk(-8 - i * 1.25, -4.2); }
  for (const cx of [-15, 15]) for (const cz of [-16, -4, 8, 20]) P.bin(cx - 1.6, cz + 0.4);
  for (const z of [13, 14.3]) { P.vending(-29.2, z, Math.PI / 2, z === 13 ? 0xd63a3a : 0x2c6bd0); P.vending(29.2, z, -Math.PI / 2, z === 13 ? 0x2c6bd0 : 0x1f8a70); }
  P.lightbox(-29.88, 4.2, -2, Math.PI / 2, 5, 1.8, 'Lounge', 'Level 2', '#15305a', '#35c6c2'); P.lightbox(-29.88, 4.2, 8, Math.PI / 2, 5, 1.8, 'Wi-Fi Free', 'Practice-Air-Guest', '#7a1f2b', '#d97b3c');

  mergeStatic(static_);                       // a few hundred shapes become a handful of draw calls

  // ================= PEOPLE =================
  const crowd = new Crowd({ capacity: 150, seed: 11, density, glb: density < 0.7 ? { size: 4, radius: 5 } : { size: 12, radius: 9 } });
  const rr = crowd.rng, between = (a, b) => a + rr() * (b - a);
  // queues in front of the check-in counters (they shuffle forward and are served)
  const lane = (cx, cz, i, side, n) => {
    const x = cx - 4.75 + 1.9 * i, slots = []; for (let k = 0; k < 5; k++) slots.push([x + (rr() - 0.5) * 0.1, cz + side * (1.95 + k * 0.85)]);
    crowd.queue(slots, side > 0 ? Math.PI : 0, { n, interval: 12 + rr() * 8, exit: [x + 7, cz + side * 2.4], entry: [x + 7, cz + side * 5.6] });
  };
  lane(-18, -24, 1, 1, 4); lane(-18, -24, 3, -1, 3); lane(0, -24, 2, 1, 5); lane(0, -24, 4, 1, 3); lane(18, -24, 1, 1, 4); lane(18, -24, 2, -1, 3);
  lane(-18, -10, 3, 1, 3); lane(18, -10, 2, 1, 4); lane(18, -10, 4, -1, 3); lane(0, -24, 0, -1, 3);
  // walkers on cross lanes (the learner stays clear of them: they pass behind and well in front)
  const cross = (z, count, opts = {}) => { for (let k = 0; k < count; k++) { const x0 = between(-20, 20), dir = rr() < 0.5 ? 1 : -1, a = [x0, z + (rr() - 0.5) * 1.6], b = [dir * 25, a[1]], c = [-dir * 25, a[1] + (rr() - 0.5) * 1.2]; crowd.walker([a, b, c], { speed: between(0.95, 1.4), bag: rr() < 0.55 ? (rr() < 0.7 ? 'roll' : 'pack') : null, ...opts }); } };
  cross(7.5, 5); cross(12, 5); cross(-15.5, 5); cross(17.5, 3);
  for (let k = 0; k < 3; k++) { const x0 = between(-20, 20), z = 9.5; crowd.trolley([[x0, z], [x0 > 0 ? -22 : 22, z]], { speed: 0.9 }); }
  for (let k = 0; k < 2; k++) crowd.walker([[between(-8, 8), 21], [between(-8, 8), -7.5]], { speed: 1.1, bag: 'roll' });
  // a late traveller running for the gate, with a bag
  crowd.walker([[-22, 4.8], [22, 4.8]], { run: true, bag: 'roll', speed: 1.0 });
  crowd.walker([[22, 13.8], [-22, 13.8]], { run: true, bag: 'pack', speed: 1.0 });
  // families: an adult with a child or two following, and some elders
  for (const [x0, z, dir] of [[-14, 11, 1], [10, 6.4, -1], [-3, 14.5, 1]]) {
    const lead = crowd.walker([[x0, z], [dir * 24, z], [-dir * 24, z]], { speed: 0.85, bag: 'roll', elder: rr() < 0.3, female: rr() < 0.5 });
    if (lead) { crowd.follower(lead, 0.55, -0.7, { child: true }); if (rr() < 0.7) crowd.follower(lead, -0.55, -1.1, { child: true }); }
  }
  // standing groups: chatting, on phones, waiting with luggage
  const stand = (x, z, yaw, o = {}) => crowd.stander(x, z, yaw, o);
  stand(-12, -2, 0.5, { bag: 'roll', talkTo: true }); stand(-11.2, -1.4, 3.6, { bag: 'pack', talkTo: true }); stand(12.5, 2, 2.2, { phone: true, bag: 'roll' });
  stand(11.4, 2.7, 5.1, { talkTo: true }); stand(-24, -14, 1.3, { phone: true, bag: 'roll' }); stand(24, -13, -1.4, { bag: 'roll', phone: true }); stand(-6.5, 14, 0.3, { bag: 'pack' });
  stand(-1.6, 13.6, 0, { phone: false, bag: 'roll' }); stand(0.4, 13.6, 0.1, { bag: 'roll' }); stand(1.9, 13.7, -0.1, { bag: 'pack', elder: true }); stand(-22, 18, 0.5, { phone: true }); stand(23, 19, -0.6, { phone: true, bag: 'roll' });
  // seated in the lounges at both sides, with bags at their feet
  for (let r = 0; r < 4; r++) for (let i = 0; i < 5; i++) {
    if (rr() < 0.55) crowd.sitter(-26.9, 2 + r * 2.4 - i * 0.62, Math.PI / 2, { phone: rr() < 0.5, bag: null });
    if (rr() < 0.55) crowd.sitter(25.9, 2 + r * 2.4 - i * 0.62, -Math.PI / 2, { phone: rr() < 0.5 });
  }
  // up on the mezzanine, at the cafe tables
  for (const [tx, tz] of [[24, -30], [27, -24], [24, -18], [27, -12], [24, -6], [27, 0]]) for (const a of [0, 2.1, 4.2]) {
    if (rr() < 0.6) { const px = tx + Math.cos(a) * 0.85, pz = tz + Math.sin(a) * 0.85; crowd.sitter(px, pz, Math.atan2(tx - px, tz - pz), { y: 5.4, phone: rr() < 0.3, elder: rr() < 0.4 }); }
  }
  g.add(crowd.group);
  g.userData.crowd = crowd; g.userData.update = (dt, cam) => crowd.update(dt, cam);
  crowd.update(0.016, null);

  g.userData.dims = { HX, Z0, Z1, CROWN };
  return g;
}
