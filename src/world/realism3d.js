import * as THREE from 'three';

/**
 * Realism for the 3D airport interiors: soft contact shadows, sunlight falling through the windows, ceiling fittings (cameras, speakers,
 * sprinklers, vents, exit signs), baggage belts at the check-in desks, safety equipment, and a distant skyline outside the glass.
 * Every helper adds plain shapes to `group`, which the caller merges by material, so it all costs only a few draw calls.
 */
const canvasTex = (draw, w, h, srgb = true) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

export function shadowTextures() {
  const round = canvasTex((x, w) => { const g = x.createRadialGradient(w / 2, w / 2, 2, w / 2, w / 2, w / 2); g.addColorStop(0, 'rgba(0,0,0,0.62)'); g.addColorStop(0.55, 'rgba(0,0,0,0.28)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, w, w); }, 128, 128);
  const rect = canvasTex((x, w) => { x.fillStyle = '#000'; x.shadowColor = 'rgba(0,0,0,0.9)'; x.shadowBlur = 26; x.fillStyle = 'rgba(0,0,0,0.55)'; x.fillRect(36, 36, w - 72, w - 72); }, 128, 128);
  return { round, rect };
}

export function makeRealism(group, { steel, white, dark, teal, navy, glow, vy }) {
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); group.add(m); return m; };
  const T = shadowTextures();
  const decal = (map, o = 1) => new THREE.MeshBasicMaterial({ map, transparent: true, opacity: o, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 });
  const mRound = decal(T.round), mRect = decal(T.rect);
  const flat = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
  const cache = {}; const std = (c, o = {}) => (cache[c + JSON.stringify(o)] ??= new THREE.MeshStandardMaterial({ color: c, roughness: 0.5, ...o }));

  const R = {
    /** A soft round shadow on the floor (columns, plants, bins). */
    blob(x, z, r, y = 0.014) { const m = add(flat, mRound, x, y, z); m.scale.set(r * 2, 1, r * 2); },
    /** A soft rectangular shadow (counters, seat rows, shopfronts). */
    slab(x, z, w, d, y = 0.014, ry = 0) { const m = add(flat, mRect, x, y, z); m.scale.set(w, 1, d); m.rotation.y = ry; },

    /**
     * Sunlight falling through a glass wall onto the floor: one lit shape per pane, brightest at the glass and fading away from it.
     * `a` and `b` are the two ends of the wall (x, z); `inward` is the unit direction into the room; `depth` how far the light reaches.
     */
    sun(a, b, inward, depth, { shear = 0.45, pane = 3, opacity = 0.42, y = 0.02 } = {}) {
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]), ux = (b[0] - a[0]) / len, uz = (b[1] - a[1]) / len;
      const sx = ux * shear * depth, sz = uz * shear * depth;                                    // the light also slides along the wall
      const P = (t, s) => [a[0] + ux * len * t + inward[0] * depth * s + sx * s, a[1] + uz * len * t + inward[1] * depth * s + sz * s];
      const p0 = P(0, 0), p1 = P(1, 0), p2 = P(1, 1), p3 = P(0, 1), n = len / pane;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(new Float32Array([p0[0], y, p0[1], p1[0], y, p1[1], p2[0], y, p2[1], p3[0], y, p3[1]]), 3));
      g.setAttribute('normal', new THREE.BufferAttribute(new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]), 3));
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array([0, 0, n, 0, n, 1, 0, 1]), 2));
      g.setIndex([0, 2, 1, 0, 3, 2]);
      if (!R._sun) R._sun = canvasTex((x, w, h) => { x.clearRect(0, 0, w, h); for (let i = 0; i < 24; i++) { const f = i / 23, r = x.createLinearGradient(0, 0, 0, h); r.addColorStop(0, `rgba(255,244,214,${0.95 - f * 0.5})`); r.addColorStop(1, 'rgba(255,244,214,0)'); x.fillStyle = r; x.fillRect(10 + f * 3, 0, w - 20 - f * 6, h); } const e = x.createLinearGradient(0, 0, w, 0); e.addColorStop(0, 'rgba(0,0,0,1)'); e.addColorStop(0.04, 'rgba(0,0,0,0)'); e.addColorStop(0.96, 'rgba(0,0,0,0)'); e.addColorStop(1, 'rgba(0,0,0,1)'); x.globalCompositeOperation = 'destination-out'; x.fillStyle = e; x.fillRect(0, 0, w, h); }, 128, 256);
      R._sun.wrapS = THREE.RepeatWrapping;
      const mat = R._sunMat ??= new THREE.MeshBasicMaterial({ map: R._sun, color: 0xfff0cc, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false, side: THREE.DoubleSide });
      group.add(new THREE.Mesh(g, mat));
    },

    /** A ceiling security dome. */
    cctv(x, z) { add(new THREE.CylinderGeometry(0.1, 0.1, 0.04, 12), white, x, vy(x) - 0.04, z); add(new THREE.SphereGeometry(0.095, 10, 6, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), std(0x2a2d33, { roughness: 0.2, metalness: 0.5 }), x, vy(x) - 0.06, z); },
    speaker(x, z) { add(new THREE.BoxGeometry(0.34, 0.2, 0.22), std(0xd8d8d4), x, vy(x) - 0.1, z); add(new THREE.BoxGeometry(0.3, 0.14, 0.02), dark, x, vy(x) - 0.12, z + 0.115); },
    sprinkler(x, z) { add(new THREE.CylinderGeometry(0.012, 0.012, 0.07, 6), std(0xb53a2a), x, vy(x) - 0.04, z); add(new THREE.CylinderGeometry(0.03, 0.01, 0.015, 8), std(0xb53a2a), x, vy(x) - 0.085, z); },
    vent(x, z, w = 2.2, d = 0.34) { add(new THREE.BoxGeometry(w, 0.03, d), std(0xdcdcd8), x, vy(x) - 0.03, z); for (let i = 0; i < 7; i++) add(new THREE.BoxGeometry(w - 0.1, 0.012, 0.018), dark, x, vy(x) - 0.048, z - d / 2 + 0.04 + i * (d - 0.08) / 6); },
    /** A hanging green emergency-exit sign with the running figure. */
    exit(x, y, z, ry = 0) {
      if (!R._exit) R._exit = canvasTex((c, w, h) => { c.fillStyle = '#0b7a3e'; c.fillRect(0, 0, w, h); c.strokeStyle = '#fff'; c.lineWidth = 6; c.strokeRect(6, 6, w - 12, h - 12); c.fillStyle = '#fff'; c.font = '700 66px sans-serif'; c.textBaseline = 'middle'; c.fillText('EXIT', w * 0.5, h / 2 + 3); c.beginPath(); c.arc(78, 42, 11, 0, 6.3); c.fill(); c.lineWidth = 11; c.lineCap = 'round'; c.strokeStyle = '#fff'; c.beginPath(); c.moveTo(70, 56); c.lineTo(60, 84); c.moveTo(70, 56); c.lineTo(94, 66); c.moveTo(66, 70); c.lineTo(84, 96); c.moveTo(60, 84); c.lineTo(44, 100); c.stroke(); }, 384, 128);
      const m = add(new THREE.PlaneGeometry(0.9, 0.3), new THREE.MeshBasicMaterial({ map: R._exit, toneMapped: false, side: THREE.DoubleSide }), x, y, z, 0, ry, 0);
      add(new THREE.CylinderGeometry(0.008, 0.008, vy(x) - y - 0.15, 5), steel, x - 0.3, y + (vy(x) - y) / 2 + 0.07, z); add(new THREE.CylinderGeometry(0.008, 0.008, vy(x) - y - 0.15, 5), steel, x + 0.3, y + (vy(x) - y) / 2 + 0.07, z); return m;
    },
    /** A baggage belt with a scale readout, in front of a check-in counter. side = +1 or -1 (which way the customer stands). */
    belt(x, z, side) {
      add(new THREE.BoxGeometry(1.0, 0.2, 0.66), steel, x, 0.1, z); add(new THREE.BoxGeometry(0.9, 0.025, 0.58), std(0x1c1d20, { roughness: 0.9 }), x, 0.213, z);
      for (let i = 0; i < 6; i++) add(new THREE.BoxGeometry(0.02, 0.03, 0.56), std(0x3a3d42, { metalness: 0.6, roughness: 0.4 }), x - 0.4 + i * 0.16, 0.222, z);
      add(new THREE.BoxGeometry(0.2, 0.12, 0.06), dark, x + 0.42, 0.26, z - side * 0.28); add(new THREE.BoxGeometry(0.14, 0.05, 0.005), new THREE.MeshBasicMaterial({ color: 0x35e08a, toneMapped: false }), x + 0.42, 0.265, z - side * 0.311);
    },
    extinguisher(x, y, z, ry = 0) { add(new THREE.BoxGeometry(0.34, 0.6, 0.18), std(0xc8312b, { roughness: 0.4 }), x, y, z, 0, ry, 0); add(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 10), std(0xe04038, { roughness: 0.3 }), x, y, z, 0, ry, 0).translateZ(0.06); add(new THREE.BoxGeometry(0.3, 0.3, 0.012), std(0xf2f0e8), x, y + 0.55, z, 0, ry, 0).translateZ(0.08); },
    door(x, z, face, w = 2.0) {
      add(new THREE.BoxGeometry(w + 0.24, 2.5, 0.18), std(0x5a3d28, { roughness: 0.6 }), x, 1.25, z - face * 0.05); add(new THREE.BoxGeometry(w * 0.48, 2.3, 0.07), std(0x8a5a38, { roughness: 0.5 }), x - w * 0.25, 1.18, z + face * 0.06); add(new THREE.BoxGeometry(w * 0.48, 2.3, 0.07), std(0x8a5a38, { roughness: 0.5 }), x + w * 0.25, 1.18, z + face * 0.06);
      add(new THREE.BoxGeometry(0.03, 0.6, 0.04), steel, x - 0.06, 1.05, z + face * 0.11); add(new THREE.BoxGeometry(0.03, 0.6, 0.04), steel, x + 0.06, 1.05, z + face * 0.11);
    },
    /** A mounted wall screen showing a wayfinding map or schedule (drawn once, shared). */
    wallScreen(x, y, z, ry, w = 1.8, h = 1.0) {
      if (!R._ws) R._ws = canvasTex((c, W, H) => { c.fillStyle = '#0c2142'; c.fillRect(0, 0, W, H); c.fillStyle = '#12a3a1'; c.fillRect(0, 0, W, 60); c.fillStyle = '#fff'; c.font = '700 40px sans-serif'; c.fillText('TERMINAL MAP', 24, 42); c.strokeStyle = '#7de0ff'; c.lineWidth = 6; c.strokeRect(40, 90, W - 80, H - 130); c.fillStyle = '#ffc928'; for (const [px, py] of [[160, 180], [340, 150], [520, 230], [700, 170]]) { c.beginPath(); c.arc(px, py, 14, 0, 6.3); c.fill(); } c.fillStyle = '#fff'; c.font = '600 26px sans-serif'; c.fillText('You are here', 130, 215); c.fillText('Gates 1 - 20', 480, 275); }, 800, 450);
      add(new THREE.BoxGeometry(w + 0.1, h + 0.1, 0.08), dark, x, y, z, 0, ry, 0); const p = add(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: R._ws, toneMapped: false }), x, y, z, 0, ry, 0); p.translateZ(0.045);
    },
  };
  return R;
}

/**
 * A distant skyline for outside the glass: tree line, low airport buildings, hangars, a control tower, soft haze.
 * Returns a ring (open cylinder) to be placed around the lounge; its bottom edge meets the ground.
 */
export function skylineRing(radius = 66, height = 26) {
  const W = 2048, H = 256;
  const tex = canvasTex((c) => {
    c.clearRect(0, 0, W, H);
    let seed = 9; const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
    const base = H - 6;
    for (let x = 0; x < W; x += 28) { c.fillStyle = `hsl(${105 + rnd() * 25},${28 + rnd() * 10}%,${58 + rnd() * 8}%)`; c.beginPath(); c.arc(x + rnd() * 20, base - 28 - rnd() * 14, 30 + rnd() * 18, 0, 6.3); c.fill(); }          // far tree line
    for (let i = 0; i < 9; i++) { const x = rnd() * W, w = 90 + rnd() * 160, h = 28 + rnd() * 34; c.fillStyle = `hsl(210,${6 + rnd() * 8}%,${70 + rnd() * 10}%)`; c.fillRect(x, base - 10 - h, w, h + 10); c.fillStyle = 'rgba(90,120,150,0.55)'; for (let k = 0; k < w / 16; k++) c.fillRect(x + 6 + k * 16, base - h - 2, 9, 12); }    // low terminal blocks and hangars
    c.fillStyle = '#d9dde0'; c.fillRect(1500, base - 150, 20, 150); c.fillStyle = '#56707f'; c.fillRect(1486, base - 190, 48, 40); c.fillStyle = '#cfd4d8'; c.fillRect(1480, base - 196, 60, 8);                                  // control tower
    for (let x = 0; x < W; x += 20) { c.fillStyle = `hsl(${100 + rnd() * 30},${35 + rnd() * 12}%,${34 + rnd() * 10}%)`; c.beginPath(); c.arc(x + rnd() * 14, base - 8 - rnd() * 8, 20 + rnd() * 14, 0, 6.3); c.fill(); }                    // near tree line
    const hz = c.createLinearGradient(0, 0, 0, H); hz.addColorStop(0, 'rgba(210,228,245,0.55)'); hz.addColorStop(0.5, 'rgba(210,228,245,0.2)'); hz.addColorStop(1, 'rgba(210,228,245,0)'); c.fillStyle = hz; c.fillRect(0, 0, W, H);   // haze
  }, W, H);
  const g = new THREE.CylinderGeometry(radius, radius, height, 64, 1, true);
  const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ map: tex, transparent: true, side: THREE.BackSide, depthWrite: false, toneMapped: false, fog: false }));
  m.position.y = height / 2 - 0.5; m.renderOrder = -9; return m;
}
