import * as THREE from 'three';
import { mergeStatic } from './merge.js';
import { terrazzoTexture } from './floors.js';
import { applyPbr, pbrMap } from './pbr.js';
import { placeProps } from './realprops.js';
import { Crowd } from './crowd.js';
import { makeRealism, skylineRing } from './realism3d.js';
import { makeProps } from './props3d.js';

/**
 * The gate lounge as real 3D geometry: a glass wall onto a 3D apron with parked aircraft, a jet bridge running out to one of them,
 * rows of seating, round columns, planters and hanging signs. Everything is merged by material (a handful of draw calls).
 * The learner stands at the origin looking down -z towards the windows. Lounge: x -26..26, z -8.5 (glass) .. 22.
 */
const HX = 26, ZW = -8.5, Z1 = 22, CROWN = 8.4, EAVE = 6.4;

export function buildGate3D({ envMap = null, floorTex = null, density = 1 } = {}) {
  const g = new THREE.Group(); g.name = 'Gate3D';
  const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0, envMap, envMapIntensity: 0.7, ...o });
  const white = std(0xf4f3ef, { roughness: 0.34, emissive: 0x4a4944, emissiveIntensity: 1 }), steel = std(0xc9ced2, { metalness: 0.85, roughness: 0.26, envMapIntensity: 1 });
  const dark = std(0x23272c, { roughness: 0.55 }), navy = std(0x15305a, { roughness: 0.4 }), teal = std(0x12a3a1, { roughness: 0.4 });
  const leaf = std(0x2f8a3f, { roughness: 0.8 }), leaf2 = std(0x3ea34d, { roughness: 0.8 }), seatMat = std(0x2d333b, { roughness: 0.7 }), wood = std(0x9b7048, { roughness: 0.6 });
  const glass = new THREE.MeshStandardMaterial({ color: 0xaed6ee, roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.14, depthWrite: false, side: THREE.DoubleSide, envMap, envMapIntensity: 1 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xfff3d2, toneMapped: false });
  const static_ = new THREE.Group(); g.add(static_);
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); static_.add(m); return m; };

  // ---- floor
  floorTex = terrazzoTexture(); floorTex.repeat.set((HX * 2) / 3, (Z1 - ZW) / 3);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HX * 2, Z1 - ZW).rotateX(-Math.PI / 2), std(0xffffff, { roughness: 0.16, map: floorTex, envMapIntensity: 0.9 }));
  floor.position.set(0, 0, (ZW + Z1) / 2); g.add(floor);
  applyPbr(floor.material, 'marble_01', HX * 2 / 5, (Z1 - ZW) / 5, { normal: 0.6, rough: 0.38, tint: 0xc4c9ce });   // real polished tile, photographed (Poly Haven, CC0)

  // ---- a gentle barrel vault with light strips and downlights
  const span = HX * 2, sag = CROWN - EAVE, R = (span * span) / (8 * sag) + sag / 2, half = Math.asin(HX / R), len = Z1 - ZW;
  const vy = (x) => CROWN - R + Math.sqrt(Math.max(0, R * R - x * x));
  const RL = makeRealism(static_, { steel, white, dark, teal, navy, glow, vy });
  const vault = new THREE.Mesh(new THREE.CylinderGeometry(R, R, len, 96, 1, true, -half, 2 * half).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0xf2f0ea, side: THREE.BackSide, toneMapped: false }));
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
    for (let i = 0; i < n; i++) {
      const x = x0 + i * 0.56;
      add(new THREE.BoxGeometry(0.5, 0.09, 0.48), seatMat, x, 0.45, z); add(new THREE.BoxGeometry(0.46, 0.012, 0.44), teal, x, 0.5, z);                                       // seat pad and a teal cushion strip
      add(new THREE.BoxGeometry(0.5, 0.4, 0.07), seatMat, x, 0.76, z - facing * 0.23, -0.12 * facing, 0, 0); add(new THREE.BoxGeometry(0.3, 0.1, 0.075), seatMat, x, 1.04, z - facing * 0.255, -0.12 * facing, 0, 0);   // back and headrest
      add(new THREE.BoxGeometry(0.045, 0.04, 0.4), steel, x + 0.28, 0.64, z); add(new THREE.BoxGeometry(0.035, 0.2, 0.035), steel, x + 0.28, 0.54, z + 0.12 * -facing);   // armrest and its post
    }
    add(new THREE.BoxGeometry(n * 0.56, 0.06, 0.07), steel, x0 + (n - 1) * 0.28, 0.34, z);
    for (const lx of [0, n - 1]) add(new THREE.BoxGeometry(0.06, 0.4, 0.5), steel, x0 + lx * 0.56, 0.2, z);
  };
  for (const [bx, n] of [[-22, 14], [8, 14]]) seats(bx, -7.2, n, -1);                       // along the glass, facing the aircraft
  for (const bx of [-22, -12, 6, 16]) for (const z of [3, 4.1]) seats(bx, z, 16 > 0 ? 8 : 8, z === 3 ? -1 : 1);
  for (const bx of [-22, 14]) for (const z of [14, 15.1]) seats(bx, z, 10, z === 14 ? -1 : 1);

  // ---- planters
  const plants = [], plant = (x, z, s = 1) => { plants.push([x, z, s]); };
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
      for (let wi = 0; wi < 26; wi++) put(new THREE.BoxGeometry(0.05, 0.3, 0.34), wnd, side * 1.955, 4.15, -9 + wi * 0.72).rotation.y = 0;      // one window per row
      put(new THREE.BoxGeometry(0.06, 1.1, 0.04), grey, side * 1.95, 3.4, 11.6); put(new THREE.BoxGeometry(0.06, 1.8, 0.9), std(0xdfe3e6, { roughness: 0.4 }), side * 1.955, 3.2, 8.0);    // the doors
      put(new THREE.CylinderGeometry(0.88, 0.88, 0.05, 18), std(0x6d747a, { roughness: 0.3, metalness: 0.7 }), side * 5.8, 1.4, 3.55, Math.PI / 2, 0, 0); put(new THREE.ConeGeometry(0.28, 0.45, 12), std(0xbfc5ca, { roughness: 0.3, metalness: 0.6 }), side * 5.8, 1.4, 3.8, Math.PI / 2, 0, 0);   // engine fan and spinner
      put(new THREE.BoxGeometry(0.12, 1.4, 1.0), navy, side * 17.4, 3.1, -4.4).rotation.z = side * 0.25;                                  // winglet
      put(new THREE.CylinderGeometry(0.62, 0.62, 0.5, 14), dark, side * 2.2, 0.62, -1.4, 0, 0, Math.PI / 2);       // second wheel of the main gear
      put(new THREE.BoxGeometry(0.07, 0.55, 15), teal, side * 1.97, 2.2, 0);                                               // livery stripe
      const wing = put(new THREE.BoxGeometry(16, 0.28, 5.2), body, side * 8.6, 2.5, -0.5); wing.rotation.y = side * 0.5;    // swept wing
      put(new THREE.CylinderGeometry(1.05, 0.95, 4.2, 18), grey, side * 5.8, 1.4, 1.4, Math.PI / 2, 0, 0);                // engine
      put(new THREE.CylinderGeometry(0.85, 0.85, 0.4, 18), dark, side * 5.8, 1.4, 3.6, Math.PI / 2, 0, 0);               // intake
      put(new THREE.BoxGeometry(5.2, 0.2, 2.4), body, side * 3.0, 4.2, -17.5).rotation.y = side * 0.4;                    // tail plane
    }
    put(new THREE.BoxGeometry(0.34, 6.2, 5.0), navy, 0, 7.6, -16.2).rotation.x = 0.4;                                      // tail fin
    put(new THREE.BoxGeometry(0.36, 3.2, 2.0), teal, 0, 7.2, -17.2).rotation.x = 0.4;
    put(new THREE.CylinderGeometry(0.28, 0.28, 2.0, 10), steel, 0, 1.0, 9.5); put(new THREE.CylinderGeometry(0.5, 0.5, 0.38, 14), dark, 0, 0.5, 9.5, 0, 0, Math.PI / 2);
    put(new THREE.BoxGeometry(2.3, 0.5, 0.06), wnd, 0, 4.5, 13.5).rotation.x = -0.35; put(new THREE.BoxGeometry(0.5, 0.45, 0.06), wnd, -0.95, 4.5, 13.4); put(new THREE.BoxGeometry(0.5, 0.45, 0.06), wnd, 0.95, 4.5, 13.4);     // the cockpit windscreen
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

  // ================= SHOPS, ADVERTS AND FURNISHINGS =================
  const P = makeProps(static_, { steel, white, dark, teal, navy, glass, glow });
  for (const a of plants) { P.plant(...a); RL.blob(a[0], a[1], 0.95 * a[2]); }
  const real = plants.map((a, i) => ['fern_02', a[0] - 0.25 * a[2], 0.78 * a[2], a[1] - 0.2 * a[2], i * 2.1, 0.55 * a[2]]);       // a real fern in every planter
  // ---- realism: window sunlight, contact shadows, ceiling fittings and signs
  RL.sun([-HX, ZW], [HX, ZW], [0, 1], 12, { opacity: 0.2, shear: 0.35 });
  for (const [cx, cz] of [[-20, -3], [-8, -3], [8, -3], [20, -3], [-20, 10], [-8, 10], [8, 10], [20, 10]]) RL.blob(cx, cz, 1.6);
  for (const [x0, z, n] of [[-22, -7.2, 14], [8, -7.2, 14]]) RL.slab(x0 + (n - 1) * 0.28, z, n * 0.56 + 0.4, 0.95);
  for (const bx of [-22, -12, 6, 16]) { RL.slab(bx + 7 * 0.28, 3, 8 * 0.56 + 0.4, 0.95); RL.slab(bx + 7 * 0.28, 4.1, 8 * 0.56 + 0.4, 0.95); }
  for (const bx of [-22, 14]) { RL.slab(bx + 9 * 0.28, 14, 10 * 0.56 + 0.4, 0.95); RL.slab(bx + 9 * 0.28, 15.1, 10 * 0.56 + 0.4, 0.95); }
  for (const x of [-16, 0, 16]) RL.slab(x, 20.6, 8.6, 3.4); RL.slab(25.2, 9.2, 1.6, 4.2); RL.slab(19.5, 17.5, 5.4, 4.4);
  for (const x of [-24, -8, 8, 24]) for (const z of [-5, 6, 17]) RL.cctv(x, z);
  for (const x of [-16, 0, 16]) for (const z of [-2, 9, 18]) RL.speaker(x, z);
  for (let x = -22; x <= 22; x += 6) for (let z = -6; z <= 20; z += 6) RL.sprinkler(x, z);
  for (const x of [-12, 12]) for (const z of [-4, 7, 18]) RL.vent(x, z);
  RL.exit(-23.5, 5.2, 19.5, Math.PI); RL.exit(23.5, 5.2, 19.5, Math.PI); RL.extinguisher(-10, 1.3, 21.8, Math.PI); RL.extinguisher(10, 1.3, 21.8, Math.PI); RL.wallScreen(-25.7, 2.4, 14, Math.PI / 2, 1.6, 0.9); RL.door(-24, 21.9, -1, 2.2);
  for (const x of [-18, 18]) real.push(['korean_fire_extinguisher_01', x, 0, 21.4, Math.PI, 1.0]);
  placeProps(g, real, envMap);
  { const ring = skylineRing(56, 24); ring.position.z = -22; g.add(ring); }
  P.shop(-16, 21.6, -1, 8, 'CAFE', 0x8a4b2a, ['#d9a05b', '#f2e0c0', '#8a4b2a', '#e8c06a']); P.shop(0, 21.6, -1, 8, 'NEWS & BOOKS', 0x12a3a1, ['#5a8fd0', '#c95b4a', '#7bbf6a', '#e8c06a']); P.shop(16, 21.6, -1, 8, 'DUTY FREE', 0x15305a, ['#e8c06a', '#c95b4a', '#5a8fd0', '#e0e0e0']);
  for (const z of [4, 10, 16]) { P.lightbox(-25.88, 3.4, z, Math.PI / 2, 4.6, 1.7, ['Fly Practice Air', 'Visit Kerala', 'Meet the Taj'][(z / 6) | 0 ? 0 : 1], 'Book at practiceair.example', '#15305a', '#12a3a1'); P.lightbox(25.88, 3.4, z, -Math.PI / 2, 4.6, 1.7, ['Discover Goa', 'Welcome Aboard', 'Fly Calm'][((z / 6) | 0) % 3], 'Your journey starts here', '#c0392b', '#e0a030'); }
  P.clock(0, 6.0, 21.8, Math.PI); P.gateSign(-10, 5.2, -4.5, 'GATE 12  \u2192', 0, vy(-10)); P.gateSign(11, 5.2, -4.5, 'GATE 18  \u2190', 0, vy(11));
  for (const bx of [-22, -12, 6, 16]) P.charger(bx + 8 * 0.28, 3.55);
  for (const [cx, cz] of [[-20, -3], [-8, -3], [8, -3], [20, -3], [-20, 10], [-8, 10], [8, 10], [20, 10]]) P.bin(cx + 1.2, cz + 0.3);
  for (const z of [8, 9.2, 10.4]) P.vending(25.2, z, -Math.PI / 2, [0xd63a3a, 0x2c6bd0, 0x1f8a70][((z - 8) / 1.2) | 0]);
  P.play(19.5, 17.5);

  mergeStatic(static_);

  // ================= PEOPLE =================
  const crowd = new Crowd({ capacity: 130, seed: 23, density, glb: density < 0.7 ? { size: 4, radius: 5 } : { size: 12, radius: 9 } });
  const rr = crowd.rng, between = (a, b) => a + rr() * (b - a);
  // seated, rows facing the windows and back-to-back rows: most seats taken, bags at their feet, phones in hand
  const sit = (x0, z, n, yaw, p = 0.62) => { for (let i = 0; i < n; i++) if (rr() < p) crowd.sitter(x0 + i * 0.56, z + 0.04, yaw, { phone: rr() < 0.45, bag: rr() < 0.45 ? 'roll' : null, elder: rr() < 0.35 }); };
  sit(-22, -7.2, 14, Math.PI); sit(8, -7.2, 14, Math.PI);
  for (const bx of [-22, -12, 6, 16]) { sit(bx, 3, 8, Math.PI); sit(bx, 4.1, 8, 0); }
  for (const bx of [-22, 14]) { sit(bx, 14, 10, Math.PI); sit(bx, 15.1, 10, 0); }
  // standing at the glass watching the aircraft, with luggage; a few chatting
  for (const x of [-19, -18.2, -6.5, 4.5, 5.4, 21]) crowd.stander(x, -7.9, Math.PI + (rr() - 0.5) * 0.4, { bag: rr() < 0.6 ? 'roll' : 'pack', talkTo: rr() < 0.4, phone: rr() < 0.3 });
  crowd.stander(-12, -7.8, Math.PI, { child: true }); crowd.stander(-11.4, -7.8, Math.PI - 0.2, { bag: 'roll', elder: true });
  // walkers: along the glass (clear of the boarding desk in the middle), through the lounge and at the back
  const lane = (z, xa, xb, count, opts = {}) => { for (let k = 0; k < count; k++) { const dir = rr() < 0.5 ? 1 : -1, a = [between(xa, xb), z + (rr() - 0.5) * 1.0], b = dir > 0 ? [xb, a[1]] : [xa, a[1]], c = dir > 0 ? [xa, a[1]] : [xb, a[1]]; crowd.walker([a, b, c], { speed: between(0.95, 1.4), bag: rr() < 0.55 ? (rr() < 0.7 ? 'roll' : 'pack') : null, ...opts }); } };
  lane(-3.5, -24, -7, 3); lane(-3.5, 7, 24, 3); lane(0.6, -24, 24, 4); lane(9.5, -24, 24, 6); lane(18.5, -24, 24, 4);
  for (let k = 0; k < 2; k++) { const x0 = between(-20, 20); crowd.trolley([[x0, 9.2], [x0 > 0 ? -23 : 23, 9.2]], { speed: 0.9 }); }
  crowd.walker([[-23, 11.8], [23, 11.8]], { run: true, bag: 'roll', speed: 1.0 });
  crowd.walker([[22, 7.0], [-22, 7.0]], { run: true, bag: 'pack', speed: 1.0 });
  for (const [x0, z, dir] of [[-15, 11.5, 1], [12, 7.5, -1], [-4, 16.5, 1], [4, 1.5, -1]]) {
    const lead = crowd.walker([[x0, z], [dir * 23, z], [-dir * 23, z]], { speed: 0.85, bag: 'roll', elder: rr() < 0.3, female: rr() < 0.5 });
    if (lead) { crowd.follower(lead, 0.55, -0.7, { child: true }); if (rr() < 0.7) crowd.follower(lead, -0.55, -1.1, { child: true }); }
  }
  // a boarding queue forming beside the gate desk on the right
  crowd.queue([[6.2, -2.4], [6.2, -1.5], [6.2, -0.6], [6.2, 0.3], [6.2, 1.2]], -Math.PI / 2, { n: 5, interval: 9, exit: [3.2, -6.2], entry: [9.0, 3.0] });
  // standing groups and travellers near the columns and planters
  for (const [x, z, yaw, o] of [[-19, 6.5, 1.0, { bag: 'roll', phone: true }], [-18.2, 7.2, 4.1, { talkTo: true, bag: 'pack' }], [19.5, 12, 2.2, { phone: true }], [20.3, 12.8, 5.3, { talkTo: true, bag: 'roll' }], [0, 19, 3.1, { bag: 'roll' }], [1, 19.4, 3.3, { elder: true, bag: 'pack' }], [-3.5, 6.8, 1.7, { phone: true }], [11, -0.4, 0.2, { bag: 'roll' }]]) crowd.stander(x, z, yaw, o);
  g.add(crowd.group);
  g.userData.crowd = crowd; g.userData.update = (dt, cam) => crowd.update(dt, cam);
  crowd.update(0.016, null);

  g.userData.dims = { HX, ZW, Z1, CROWN, ceil: vy(0) - 0.3 };
  return g;
}
