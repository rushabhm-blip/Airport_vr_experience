import * as THREE from 'three';
import { mergeStatic } from './merge.js';

/**
 * The departures hall as real 3D geometry (not a photograph): a high barrel-vaulted roof, branching white columns, a glass curtain wall,
 * a glossy terrazzo floor, rows of check-in islands with canopies, queue stanchions, planters and seating.
 * Everything is built from simple shapes and merged by material, so the whole hall costs only a handful of draw calls.
 * The learner stands at the origin looking down -z. The hall spans x -30..30 and z -34..26.
 */
const HX = 30, Z0 = -34, Z1 = 26, CROWN = 13.5, EAVE = 8.8;

export function buildHall3D({ envMap = null, floorTex = null, ceilTex = null } = {}) {
  const g = new THREE.Group(); g.name = 'Hall3D';
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, envMap, envMapIntensity: 0.7, ...o });
  const white = std(0xf4f3ef, { roughness: 0.32 }), steel = std(0xc9ced2, { metalness: 0.85, roughness: 0.26, envMapIntensity: 1 });
  const dark = std(0x23272c, { roughness: 0.55 }), navy = std(0x15305a, { roughness: 0.4 }), teal = std(0x12a3a1, { roughness: 0.4 });
  const leaf = std(0x2f8a3f, { roughness: 0.8 }), leaf2 = std(0x3ea34d, { roughness: 0.8 }), seatMat = std(0x2b3a52, { roughness: 0.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xaed6ee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide, envMap, envMapIntensity: 1 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xfff3d2, toneMapped: false }), skyGlow = new THREE.MeshBasicMaterial({ color: 0xcfeaff, toneMapped: false });
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = false; static_.add(m); return m; };
  const static_ = new THREE.Group(); g.add(static_);

  // ---- floor: glossy terrazzo that mirrors the hall around it
  if (floorTex) { floorTex = floorTex.clone(); floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(24, 24); floorTex.needsUpdate = true; }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, Z1 - Z0).rotateX(-Math.PI / 2), std(0xffffff, { roughness: 0.2, map: floorTex, envMapIntensity: 0.6 }));
  floor.position.set(0, 0, (Z0 + Z1) / 2); g.add(floor);

  // ---- barrel-vaulted roof (a shallow arch along z), with light strips, downlights and skylights
  const span = HX * 2, sag = CROWN - EAVE, R = (span * span) / (8 * sag) + sag / 2, half = Math.asin(HX / R);
  const vy = (x) => CROWN - R + Math.sqrt(Math.max(0, R * R - x * x));
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
  const plant = (x, z, s = 1) => {
    add(new THREE.CylinderGeometry(0.46 * s, 0.4 * s, 0.9 * s, 18), steel, x, 0.45 * s, z);
    for (let i = 0; i < 7; i++) { const a = i * 0.9, r = 0.28 * s; add(new THREE.IcosahedronGeometry((0.5 + (i % 3) * 0.1) * s, 1), i % 2 ? leaf : leaf2, x + Math.cos(a) * r, (1.35 + (i % 4) * 0.22) * s, z + Math.sin(a) * r); }
  };
  for (const [x, z] of [[-9, -17], [9, -17], [-9, -3], [9, -3], [-24, -12], [24, -12], [-24, 6], [24, 6], [-6, 12], [6, 12], [-26, -28], [26, -28]]) plant(x, z, 1.1);

  // ---- seating lounge to the left and right
  const bench = (x, z, n, ry = 0) => { for (let i = 0; i < n; i++) { const g2 = new THREE.Group(); const sx = i * 0.62; const seat = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.1, 0.52), seatMat), back = new THREE.Mesh(new THREE.BoxGeometry(0.58, 0.45, 0.08), seatMat), leg = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.4, 0.5), steel);
    seat.position.set(sx, 0.45, 0); back.position.set(sx, 0.72, -0.24); leg.position.set(sx, 0.2, 0); g2.add(seat, back, leg); g2.position.set(x, 0, z); g2.rotation.y = ry; static_.add(g2); } };
  for (let r = 0; r < 4; r++) { bench(-27 + 0, 2 + r * 2.4, 5, Math.PI / 2); bench(26, 2 + r * 2.4, 5, -Math.PI / 2); }

  // ---- outside the glass: sky and the apron
  const sky = new THREE.Mesh(new THREE.SphereGeometry(300, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 vP; void main(){ float h = clamp(vP.y*1.5+0.1,0.,1.); vec3 c = mix(vec3(0.86,0.92,0.97), vec3(0.36,0.62,0.9), pow(h,0.6)); gl_FragColor = vec4(c,1.0);}' }));
  sky.renderOrder = -12; g.add(sky);
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(600, 600).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x9aa1a5, roughness: 1 })); apron.position.y = -0.05; g.add(apron);

  mergeStatic(static_);                       // a few hundred shapes become a handful of draw calls
  g.userData.dims = { HX, Z0, Z1, CROWN };
  return g;
}
