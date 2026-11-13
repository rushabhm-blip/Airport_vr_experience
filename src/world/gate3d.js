import * as THREE from 'three';
import { mergeStatic } from './merge.js';

/**
 * The gate lounge as real 3D geometry: a glass wall onto a 3D apron with parked aircraft, a jet bridge running out to one of them,
 * rows of seating, round columns, planters and hanging signs. Everything is merged by material (a handful of draw calls).
 * The learner stands at the origin looking down -z towards the windows. Lounge: x -26..26, z -8.5 (glass) .. 22.
 */
const HX = 26, ZW = -8.5, Z1 = 22, CROWN = 8.4, EAVE = 6.4;

export function buildGate3D({ envMap = null, floorTex = null } = {}) {
  const g = new THREE.Group(); g.name = 'Gate3D';
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, envMap, envMapIntensity: 0.7, ...o });
  const white = std(0xf4f3ef, { roughness: 0.32 }), steel = std(0xc9ced2, { metalness: 0.85, roughness: 0.26, envMapIntensity: 1 });
  const dark = std(0x23272c, { roughness: 0.55 }), navy = std(0x15305a, { roughness: 0.4 }), teal = std(0x12a3a1, { roughness: 0.4 });
  const leaf = std(0x2f8a3f, { roughness: 0.8 }), leaf2 = std(0x3ea34d, { roughness: 0.8 }), seatMat = std(0x2d333b, { roughness: 0.7 }), wood = std(0x9b7048, { roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xaed6ee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, envMap, envMapIntensity: 1 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xfff3d2, toneMapped: false });
  const static_ = new THREE.Group(); g.add(static_);
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); static_.add(m); return m; };

  // ---- floor
  if (floorTex) { floorTex = floorTex.clone(); floorTex.wrapS = floorTex.wrapT = THREE.RepeatWrapping; floorTex.repeat.set(20, 14); floorTex.needsUpdate = true; }
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, Z1 - ZW).rotateX(-Math.PI / 2), std(0xffffff, { roughness: 0.2, map: floorTex, envMapIntensity: 0.6 }));
  floor.position.set(0, 0, (ZW + Z1) / 2); g.add(floor);

  // ---- a gentle barrel vault with light strips and downlights
  const span = HX * 2, sag = CROWN - EAVE, R = (span * span) / (8 * sag) + sag / 2, half = Math.asin(HX / R), len = Z1 - ZW;
  const vy = (x) => CROWN - R + Math.sqrt(Math.max(0, R * R - x * x));
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(R, R, len, 96, 1, true, -half, 2 * half).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xe9e7e1, side: THREE.BackSide, toneMapped: false }));
  vault.position.set(0, CROWN - R, (ZW + Z1) / 2); g.add(vault);
  for (const x of [-18, -10, -3, 3, 10, 18]) add(new THREE.BoxGeometry(0.28, 0.06, len - 2), glow, x, vy(x) - 0.05, (ZW + Z1) / 2);
  const down = new THREE.CircleGeometry(0.15, 16).rotateX(Math.PI / 2);
  for (let x = -22; x <= 22; x += 4) for (let z = ZW + 2; z < Z1; z += 5) add(down, glow, x + 2, vy(x + 2) - 0.08, z);
  for (const z of [-2, 8, 18]) { const pts = []; for (let i = 0; i <= 20; i++) { const x = -HX + (i / 20) * HX * 2; pts.push(new THREE.Vector3(x, vy(x) - 0.1, z)); } add(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 40, 0.13, 8), white); }

  // ---- glass wall onto the apron (floor to roof), steel mullions, and the side and back walls
  const m = add(new THREE.PlaneGeometry(HX * 2, EAVE), glass, 0, EAVE / 2, ZW);
  for (let x = -HX; x <= HX; x += 3) add(new THREE.BoxGeometry(0.14, EAVE, 0.14), steel, x, EAVE / 2, ZW);
  for (const y of [0.08, 2.6, 4.6, EAVE]) add(new THREE.BoxGeometry(HX * 2, 0.12, 0.12), steel, 0, y, ZW);
  add(new THREE.BoxGeometry(HX * 2, 0.5, 0.5), white, 0, EAVE + 0.25, ZW);                  // the beam above the glass
  for (const sx of [-1, 1]) { add(new THREE.PlaneGeometry(len, EAVE).rotateY(-sx * Math.PI / 2), white, sx * HX, EAVE / 2, (ZW + Z1) / 2); }
  add(new THREE.PlaneGeometry(HX * 2, EAVE + 1).rotateY(Math.PI), white, 0, (EAVE + 1) / 2, Z1);
  for (let i = 0; i < 36; i++) add(new THREE.BoxGeometry(0.1, 3.6, 0.12), wood, -HX + 0.08, 2.1, ZW + 0.8 + i * 0.28, 0, Math.PI / 2, 0);     // wood slats on the left wall

  // ---- round columns with a steel base band
  for (const [cx, cz] of [[-20, -3], [-8, -3], [8, -3], [20, -3], [-20, 10], [-8, 10], [8, 10], [20, 10]]) {
    add(new THREE.CylinderGeometry(0.55, 0.55, vy(cx) - 0.1, 24), white, cx, (vy(cx) - 0.1) / 2, cz);
    add(new THREE.CylinderGeometry(0.58, 0.58, 1.6, 24), steel, cx, 0.8, cz);
  }

  // ---- seating: rows facing the windows, plus two rows back to back
  const seats = (x0, z, n, facing = -1) => {
    for (let i = 0; i < n; i++) { const x = x0 + i * 0.56; add(new THREE.BoxGeometry(0.5, 0.1, 0.5), seatMat, x, 0.46, z); add(new THREE.BoxGeometry(0.5, 0.46, 0.08), seatMat, x, 0.78, z - facing * 0.24, -0.1 * facing, 0, 0); add(new THREE.BoxGeometry(0.08, 0.14, 0.4), steel, x + 0.27, 0.58, z); }
    add(new THREE.BoxGeometry(n * 0.56, 0.06, 0.07), steel, x0 + (n - 1) * 0.28, 0.34, z);
    for (const lx of [0, n - 1]) add(new THREE.BoxGeometry(0.06, 0.4, 0.5), steel, x0 + lx * 0.56, 0.2, z);
  };
  for (const [bx, n] of [[-22, 14], [8, 14]]) seats(bx, -7.2, n, -1);                       // along the glass, facing the aircraft
  for (const bx of [-22, -12, 6, 16]) for (const z of [3, 4.1]) seats(bx, z, 16 > 0 ? 8 : 8, z === 3 ? -1 : 1);
  for (const bx of [-22, 14]) for (const z of [14, 15.1]) seats(bx, z, 10, z === 14 ? -1 : 1);

  // ---- planters
  const plant = (x, z, s = 1) => { add(new THREE.CylinderGeometry(0.46 * s, 0.4 * s, 0.9 * s, 18), steel, x, 0.45 * s, z); for (let i = 0; i < 7; i++) { const a = i * 0.9, r = 0.28 * s; add(new THREE.IcosahedronGeometry((0.5 + (i % 3) * 0.1) * s, 1), i % 2 ? leaf : leaf2, x + Math.cos(a) * r, (1.35 + (i % 4) * 0.22) * s, z + Math.sin(a) * r); } };
  for (const [x, z] of [[-14, -6.5], [14, -6.5], [-4, 6], [4, 6], [-24, 2], [24, 2], [-24, 18], [24, 18], [0, 19]]) plant(x, z, 1.1);

  // ---- hanging signs
  const label = (draw, pw, ph) => { const c = document.createElement('canvas'); c.width = pw; c.height = ph; draw(c.getContext('2d'), pw, ph); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
  const sign = (tex, w, hh, x, y, z, ry = 0) => { const p = new THREE.Mesh(new THREE.PlaneGeometry(w, hh), new THREE.MeshBasicMaterial({ map: tex, toneMapped: false, side: THREE.DoubleSide })); p.position.set(x, y, z); p.rotation.y = ry; static_.add(p); for (const sx of [-w / 2 + 0.25, w / 2 - 0.25]) add(new THREE.CylinderGeometry(0.012, 0.012, vy(x) - y, 6), steel, x + sx, y + (vy(x) - y) / 2, z); };
  const GATES = label((x, w, hh) => { x.fillStyle = '#15305a'; x.fillRect(0, 0, w, hh); x.fillStyle = '#ffc928'; x.font = '700 90px sans-serif'; x.textBaseline = 'middle'; x.fillText('✈  GATES 10 - 20', 30, hh / 2); x.fillStyle = '#7de0ff'; x.fillText('→', w - 150, hh / 2); }, 1024, 170);
  sign(GATES, 5.4, 0.9, -14, 5.2, 1.5); sign(GATES, 5.4, 0.9, 14, 5.2, 1.5);

  // ---- outside: the apron, markings, a jet bridge out to an aircraft, and a parked aircraft and vehicles further off
  const apron = new THREE.Mesh(new THREE.PlaneGeometry(220, 120).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4b5156, roughness: 1 })); apron.position.set(0, -0.04, -60); g.add(apron);
  const yellow = std(0xe6c22a, { roughness: 0.7 }), whiteLine = std(0xe9e9e6, { roughness: 0.7 });
  add(new THREE.BoxGeometry(0.4, 0.02, 40), yellow, -0.2, 0.0, -30); add(new THREE.BoxGeometry(14, 0.02, 0.35), whiteLine, -0.2, 0.0, -46);
  for (const [x, z, w] of [[-40, -30, 0.3], [40, -30, 0.3]]) add(new THREE.BoxGeometry(w, 0.02, 60), yellow, x, 0.0, z);
  for (let z = -30; z > -66; z -= 9) add(new THREE.BoxGeometry(0.4, 0.02, 4.5), whiteLine, 44, 0.0, z);
  const aircraft = (x, z, ry, s = 1) => {
    // built along its own length (z): nose at +z, tail at -z, wings out along x. ry turns it on the apron.
    const a = new THREE.Group(), put = (geo, mat, px, py, pz, rx = 0, rY = 0, rz = 0) => { const mm = new THREE.Mesh(geo, mat); mm.position.set(px, py, pz); mm.rotation.set(rx, rY, rz); a.add(mm); return mm; };
    const body = std(0xf6f6f4, { roughness: 0.3 }), grey = std(0x8a9096, { roughness: 0.5 }), wnd = std(0x0b1b33, { roughness: 0.3 });
    put(new THREE.CylinderGeometry(1.95, 1.95, 24, 28), body, 0, 3.4, 0, Math.PI / 2, 0, 0);                              // fuselage barrel along z
    const nose = put(new THREE.SphereGeometry(1.95, 24, 16), body, 0, 3.4, 12); nose.scale.set(1, 1, 1.9);                // rounded nose
    const tail = put(new THREE.ConeGeometry(1.95, 7, 24), body, 0, 3.9, -15.5, -Math.PI / 2 - 0.1, 0, 0);                  // tapered tail cone
    for (const side of [-1, 1]) {
      put(new THREE.BoxGeometry(0.06, 0.34, 17), wnd, side * 1.96, 4.2, 1);                                                // window band
      put(new THREE.BoxGeometry(0.07, 0.55, 15), teal, side * 1.97, 2.2, 0);                                               // livery stripe
      const wing = put(new THREE.BoxGeometry(16, 0.28, 5.2), body, side * 8.6, 2.5, -0.5); wing.rotation.y = side * 0.5;    // swept wing
      put(new THREE.CylinderGeometry(1.05, 0.95, 4.2, 18), grey, side * 5.8, 1.4, 1.4, Math.PI / 2, 0, 0);                // engine
      put(new THREE.CylinderGeometry(0.85, 0.85, 0.4, 18), dark, side * 5.8, 1.4, 3.6, Math.PI / 2, 0, 0);               // intake
      put(new THREE.BoxGeometry(5.2, 0.2, 2.4), body, side * 3.0, 4.2, -17.5).rotation.y = side * 0.4;                    // tail plane
    }
    put(new THREE.BoxGeometry(0.34, 6.2, 5.0), navy, 0, 7.6, -16.2).rotation.x = 0.4;                                      // tail fin
    put(new THREE.BoxGeometry(0.36, 3.2, 2.0), teal, 0, 7.2, -17.2).rotation.x = 0.4;
    put(new THREE.CylinderGeometry(0.28, 0.28, 2.0, 10), steel, 0, 1.0, 9.5); put(new THREE.CylinderGeometry(0.5, 0.5, 0.38, 14), dark, 0, 0.5, 9.5, 0, 0, Math.PI / 2);
    for (const side of [-1, 1]) { put(new THREE.CylinderGeometry(0.26, 0.26, 2.0, 10), steel, side * 2.2, 1.0, -1.0); put(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 14), dark, side * 2.2, 0.62, -1.0, 0, 0, Math.PI / 2); }
    a.scale.setScalar(s); a.position.set(x, 0, z); a.rotation.y = ry; static_.add(a);
  };
  aircraft(-0.2 + 7, -46, Math.PI / 2, 1);              // parked parallel to the terminal, nose to the right; its door meets the jet bridge
  aircraft(-30, -60, -Math.PI / 2 + 0.25, 1);
  aircraft(36, -68, Math.PI / 2 - 0.15, 1);
  // jet bridge: a corridor from the glass out to the aircraft door
  const bridge = std(0xd3d6d9, { roughness: 0.6 });
  add(new THREE.BoxGeometry(3.4, 3.0, 36), bridge, -0.2, 2.9, ZW - 18 - 0.4);
  add(new THREE.BoxGeometry(3.42, 0.7, 35), glass, -0.2, 3.5, ZW - 18 - 0.4);
  for (const sx of [-1.6, 1.6]) add(new THREE.CylinderGeometry(0.22, 0.22, 3.2, 12), steel, -0.2 + sx, 1.5, ZW - 34);
  add(new THREE.CylinderGeometry(1.9, 1.9, 3.0, 20), bridge, -0.2, 2.9, ZW - 36.4);                                     // the rotunda at the aircraft end
  // vehicles
  const tractor = (x, z, ry) => { const t = new THREE.Group(); const p = (geo, mat, px, py, pz) => { const mm = new THREE.Mesh(geo, mat); mm.position.set(px, py, pz); t.add(mm); }; p(new THREE.BoxGeometry(2.4, 1.1, 1.4), std(0xf2f2ee), 0, 0.9, 0); p(new THREE.BoxGeometry(1.1, 0.9, 1.3), teal, 0.5, 1.8, 0); for (const wx of [-0.8, 0.8]) for (const wz of [-0.7, 0.7]) p(new THREE.CylinderGeometry(0.36, 0.36, 0.3, 12), dark, wx, 0.36, wz); t.position.set(x, 0, z); t.rotation.y = ry; static_.add(t); };
  tractor(-18, -22, 0.4); tractor(24, -26, -0.3);
  for (const [cx, cz] of [[-16, -24], [-14.6, -24], [-13.2, -24]]) { add(new THREE.BoxGeometry(1.2, 1.0, 2.4), std(0x8a949c, { roughness: 0.6 }), cx, 0.8, cz + 2); }
  // tower, tree line and hills
  add(new THREE.CylinderGeometry(1.4, 2.0, 26, 16), white, 52, 13, -64); add(new THREE.CylinderGeometry(3.6, 2.6, 3.6, 16), std(0x4c6a7f, { roughness: 0.3 }), 52, 27.6, -64);
  for (let x = -90; x <= 90; x += 6) { const z = -66 - ((x * 7) % 6); add(new THREE.CylinderGeometry(0.4, 0.5, 4, 8), dark, x, 2, z); add(new THREE.SphereGeometry(3.2, 10, 8), x % 2 ? leaf : leaf2, x, 6, z); }
  for (const [hx, hz, hs] of [[-60, -110, 60], [30, -120, 70], [90, -105, 50]]) add(new THREE.SphereGeometry(hs, 18, 10), std(0x6a8f78, { roughness: 1 }), hx, -hs * 0.72, hz);

  const sky = new THREE.Mesh(new THREE.SphereGeometry(72, 24, 16), new THREE.ShaderMaterial({ side: THREE.BackSide, depthWrite: false, toneMapped: false,
    vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec3 vP; void main(){ float h = clamp(vP.y*1.4+0.08,0.,1.); vec3 c = mix(vec3(0.70,0.84,0.96), vec3(0.20,0.48,0.88), pow(h,0.5)); gl_FragColor = vec4(c,1.0);}' }));
  sky.renderOrder = -12; g.add(sky);

  mergeStatic(static_);
  g.userData.dims = { HX, ZW, Z1, CROWN, ceil: vy(0) - 0.3 };
  return g;
}
