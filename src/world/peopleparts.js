import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * The detailed version of a person, as separate parts (each part is later drawn as ONE instanced mesh for the whole crowd).
 * Everything is in person space: y up, forward +z, a 1.75 m adult with hips at 0.92 m. Limb parts hang DOWN from their joint at the origin.
 * Parts are tinted per person by instance colour; extra colour inside a part (soles, wheels, straps) is baked in as vertex colour.
 */
const paint = (geo, hex = 0xffffff) => {
  let g = geo.index ? geo.toNonIndexed() : geo;
  for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
  const c = new THREE.Color(hex), n = g.attributes.position.count, arr = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3)); return g;
};
const merge = (list) => mergeGeometries(list.map((g) => (g.attributes.color ? g : paint(g))), false);
const sph = (r, w = 10, h = 8, sx = 1, sy = 1, sz = 1) => new THREE.SphereGeometry(r, w, h).scale(sx, sy, sz);
const limb = (r0, r1, len, seg = 9) => merge([sph(r0, seg, 6).translate(0, 0, 0), new THREE.CylinderGeometry(r0, r1, len, seg, 1, true).translate(0, -len / 2, 0), sph(r1, seg, 6).translate(0, -len, 0)]);
const T = (g, x, y, z) => g.translate(x, y, z);

export function buildPeopleGeometries() {
  const G = {};

  // ---- body
  const torso = new THREE.LatheGeometry([[0.001, 0.93], [0.125, 0.94], [0.14, 1.02], [0.15, 1.12], [0.168, 1.24], [0.172, 1.32], [0.15, 1.40], [0.085, 1.455], [0.001, 1.47]].map(([r, y]) => new THREE.Vector2(r, y)), 12).scale(1.12, 1, 0.8);
  G.torso = merge([torso]);
  G.neck = merge([new THREE.CylinderGeometry(0.048, 0.056, 0.1, 10).translate(0, 1.5, 0.005)]);
  // head: an egg-shaped skull with a slightly narrower jaw
  const head = new THREE.SphereGeometry(1, 14, 10); { const p = head.attributes.position; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), jaw = y < 0 ? 1 - 0.16 * -y : 1; p.setXYZ(i, x * 0.098 * jaw, y * 0.122 - (y < 0 ? 0.012 * -y : 0), z * 0.108 * (y < 0 ? 1 - 0.1 * -y : 1)); } }
  head.translate(0, 1.625, 0.01); G.head = merge([head]);
  G.nose = merge([sph(0.017, 6, 5, 0.9, 1.25, 1.2).translate(0, 1.607, 0.113), sph(0.011, 5, 4).translate(-0.013, 1.598, 0.108), sph(0.011, 5, 4).translate(0.013, 1.598, 0.108)]);
  G.ears = merge([sph(0.026, 6, 5, 0.45, 1.2, 0.9).translate(-0.101, 1.62, -0.005), sph(0.026, 6, 5, 0.45, 1.2, 0.9).translate(0.101, 1.62, -0.005)]);
  // face decal: a thin patch of the head's front (the features are painted on a texture atlas)
  const face = new THREE.SphereGeometry(1, 16, 9, Math.PI / 2 - 0.92, 1.84, 1.1, 1.0);
  { const p = face.attributes.position, uv = face.attributes.uv; for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i), z = p.getZ(i), jaw = y < 0 ? 1 - 0.16 * -y : 1; p.setXYZ(i, x * 0.098 * jaw * 1.012, y * 0.122 * 1.012 - (y < 0 ? 0.012 * -y : 0), z * 0.108 * (y < 0 ? 1 - 0.1 * -y : 1) * 1.012); uv.setXY(i, uv.getX(i) * 0.25, uv.getY(i) * 0.5); } }
  face.translate(0, 1.625, 0.01); G.face = face;                                          // (not painted: it keeps its uv and uses the atlas)

  // ---- hair styles
  const shell = (grow, phi0, phiLen, th0, thLen) => { const g = new THREE.SphereGeometry(1, 14, 8, phi0, phiLen, th0, thLen); const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setXYZ(i, p.getX(i) * 0.108 * grow, p.getY(i) * 0.13 * grow, p.getZ(i) * 0.118 * grow); return g.translate(0, 1.632, -0.004); };
  const cap = (grow = 1.0, theta = 0.5) => merge([shell(grow, 0, Math.PI * 2, 0, Math.PI * 0.36), shell(grow, Math.PI / 2 + 1.0, Math.PI * 2 - 2.0, Math.PI * 0.36, Math.PI * (theta - 0.36) + 0.12)]);
  G.hairS = merge([cap(1.03, 0.55), sph(0.011, 5, 4, 1, 3.2, 1).translate(-0.1, 1.61, 0.03), sph(0.011, 5, 4, 1, 3.2, 1).translate(0.1, 1.61, 0.03)]);
  G.hairL = merge([cap(1.04, 0.58), new THREE.CylinderGeometry(0.112, 0.088, 0.42, 12, 1, true, Math.PI * 0.62, Math.PI * 0.76).translate(0, 1.5, -0.045), sph(0.09, 8, 6, 1.0, 1.6, 0.55).translate(0, 1.4, -0.105)]);
  G.hairB = merge([cap(1.03, 0.57), sph(0.052, 8, 6).translate(0, 1.7, -0.088), new THREE.TorusGeometry(0.048, 0.008, 4, 10).translate(0, 1.7, -0.088)]);
  G.glasses = merge([new THREE.TorusGeometry(0.027, 0.003, 4, 10).translate(-0.04, 1.622, 0.109), new THREE.TorusGeometry(0.027, 0.003, 4, 10).translate(0.04, 1.622, 0.109), new THREE.BoxGeometry(0.026, 0.004, 0.004).translate(0, 1.626, 0.111), new THREE.BoxGeometry(0.004, 0.004, 0.09).translate(-0.082, 1.624, 0.064), new THREE.BoxGeometry(0.004, 0.004, 0.09).translate(0.082, 1.624, 0.064)]);

  // ---- arms: upper arm and forearm (hang down from shoulder / elbow) and a hand with fingers
  G.armU = merge([limb(0.046, 0.039, 0.29, 8)]);
  G.foreA = merge([limb(0.038, 0.029, 0.27, 8)]);
  const hand = () => {
    const parts = [new THREE.BoxGeometry(0.074, 0.088, 0.03).translate(0, -0.044, 0), sph(0.036, 8, 6, 1, 0.6, 0.55).translate(0, -0.012, 0)];
    [[-0.027, 0.06], [-0.009, 0.068], [0.009, 0.064], [0.027, 0.052]].forEach(([x, l]) => { parts.push(new THREE.CylinderGeometry(0.0085, 0.0075, l, 5).translate(0, -l / 2, 0).rotateX(-0.28).translate(x, -0.09, 0.006)); parts.push(sph(0.0078, 4, 3).translate(x, -0.09 - l * 0.96, 0.021)); });
    parts.push(new THREE.CylinderGeometry(0.011, 0.009, 0.052, 6).translate(0, -0.026, 0).rotateZ(0.6).rotateX(-0.3).translate(0.046, -0.04, 0.012));       // thumb
    return merge(parts);
  };
  G.hand = hand();

  // ---- legs: tapered thigh and shin, and a shoe with a sole (sole is a lighter vertex colour)
  G.thigh = merge([sph(0.084, 8, 6), new THREE.CylinderGeometry(0.084, 0.06, 0.44, 8, 1, true).translate(0, -0.22, 0), sph(0.06, 7, 5).translate(0, -0.44, 0)]);
  G.shin = merge([sph(0.06, 7, 5), new THREE.CylinderGeometry(0.06, 0.042, 0.41, 8, 1, true).translate(0, -0.205, 0), sph(0.042, 6, 5).translate(0, -0.41, 0)]);
  G.shoe = merge([paint(new THREE.BoxGeometry(0.098, 0.062, 0.25, 1, 1, 1).translate(0, 0.005, 0.07), 0xffffff), paint(sph(0.048, 8, 6, 1.0, 0.75, 1.1).translate(0, 0.004, 0.16), 0xffffff), paint(new THREE.BoxGeometry(0.103, 0.02, 0.28).translate(0, -0.037, 0.075), 0xc9c9c9)]);

  // ---- clothes
  const folded = (r0, r1, h, y0, seg, folds, amp) => { const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(r0 + (r1 - r0) * t + Math.sin(t * Math.PI * folds) * amp, y0 - h * t)); } return new THREE.LatheGeometry(pts, seg); };
  G.saree = merge([folded(0.15, 0.255, 0.84, 1.0, 16, 4, 0.012)]);
  G.kurta = merge([new THREE.LatheGeometry([[0.001, 1.36], [0.2, 1.34], [0.19, 1.2], [0.19, 1.0], [0.235, 0.78], [0.25, 0.62]].map(([r, y]) => new THREE.Vector2(r, y)), 14).scale(1.1, 1, 0.9)]);
  G.pallu = merge([new THREE.BoxGeometry(0.075, 0.6, 0.03).rotateZ(-0.5).translate(0.02, 1.2, 0.135), new THREE.BoxGeometry(0.28, 0.66, 0.03).translate(-0.04, 1.05, -0.14), new THREE.BoxGeometry(0.3, 0.05, 0.14).translate(-0.01, 1.4, -0.03)]);
  G.collar = merge([new THREE.TorusGeometry(0.075, 0.016, 5, 14).rotateX(Math.PI / 2).translate(0, 1.46, 0)]);
  G.belt = merge([new THREE.CylinderGeometry(0.152, 0.152, 0.03, 14, 1, true).scale(1.3, 1, 0.78).translate(0, 0.97, 0)]);

  G.phone = merge([paint(new THREE.BoxGeometry(0.068, 0.138, 0.009), 0x1a1a1e), paint(new THREE.BoxGeometry(0.058, 0.122, 0.0095).translate(0, 0, 0.0008), 0x9ec6ff), paint(new THREE.BoxGeometry(0.058, 0.122, 0.0095).translate(0, 0, -0.0008), 0x2a2a30)]);
  // ---- luggage
  const wheel = (x, z) => paint(new THREE.CylinderGeometry(0.032, 0.032, 0.025, 8).rotateZ(Math.PI / 2).translate(x, 0.032, z), 0x222222);
  G.suitcase = merge([paint(new THREE.BoxGeometry(0.42, 0.62, 0.25, 1, 1, 1).translate(0, 0.35, 0), 0xffffff), paint(new THREE.BoxGeometry(0.43, 0.025, 0.255).translate(0, 0.35, 0), 0xb0b0b0), paint(new THREE.BoxGeometry(0.2, 0.05, 0.02).translate(0, 0.62, 0.13), 0x555555),
    wheel(-0.16, -0.08), wheel(0.16, -0.08), wheel(-0.16, 0.08), wheel(0.16, 0.08), paint(new THREE.BoxGeometry(0.3, 0.012, 0.012).translate(0, 0.35, 0.128), 0x9a9a9a),
    paint(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6).translate(-0.12, 0.84, -0.04), 0x8a8a8a), paint(new THREE.CylinderGeometry(0.008, 0.008, 0.36, 6).translate(0.12, 0.84, -0.04), 0x8a8a8a), paint(new THREE.BoxGeometry(0.27, 0.018, 0.03).translate(0, 1.03, -0.04), 0x333333)]);
  G.pack = merge([paint(new THREE.BoxGeometry(0.3, 0.42, 0.16).translate(0, 0, 0), 0xffffff), paint(new THREE.BoxGeometry(0.24, 0.16, 0.05).translate(0, -0.08, 0.1), 0xdddddd), paint(new THREE.BoxGeometry(0.03, 0.4, 0.05).translate(-0.1, 0.02, 0.1), 0x333333), paint(new THREE.BoxGeometry(0.03, 0.4, 0.05).translate(0.1, 0.02, 0.1), 0x333333), paint(new THREE.BoxGeometry(0.08, 0.025, 0.03).translate(0, 0.22, -0.02), 0x333333)]);
  G.cart = merge([paint(new THREE.BoxGeometry(0.56, 0.04, 0.9).translate(0, 0.22, 0), 0xffffff), paint(new THREE.BoxGeometry(0.56, 0.03, 0.04).translate(0, 0.9, -0.42), 0xffffff), paint(new THREE.BoxGeometry(0.03, 0.7, 0.03).translate(-0.27, 0.57, -0.42), 0xffffff), paint(new THREE.BoxGeometry(0.03, 0.7, 0.03).translate(0.27, 0.57, -0.42), 0xffffff),
    paint(new THREE.BoxGeometry(0.5, 0.03, 0.03).translate(0, 0.62, 0.43), 0xffffff), paint(new THREE.BoxGeometry(0.5, 0.45, 0.02).translate(0, 0.45, 0.44), 0xffffff), paint(new THREE.BoxGeometry(0.5, 0.02, 0.02).translate(0, 0.35, 0.44), 0xffffff),
    wheel(-0.28, 0.34), wheel(0.28, 0.34), wheel(-0.28, -0.34), wheel(0.28, -0.34), paint(new THREE.BoxGeometry(0.4, 0.05, 0.03).translate(0, 0.9, -0.44), 0x2a6fb0)]);
  return G;
}

/**
 * The face atlas: 4 x 2 faces on one transparent canvas (the head is drawn skin-coloured underneath, the features go on top).
 * Variants: different brows, eye shapes, mouths (smile / calm), a moustache, stubble, wrinkles for elders, a bindi.
 */
export function faceAtlas() {
  const S = 1024, W = S / 4, H = S / 2, c = document.createElement('canvas'); c.width = S; c.height = S; const x = c.getContext('2d');
  const cell = (i) => [(i % 4) * W, ((i / 4) | 0) * H];
  const specs = [
    { brow: 0.9, eye: 1.0, smile: 0.5, stache: false, stubble: false, wrinkle: 0, bindi: false, lip: '#9a4a4a' },
    { brow: 1.3, eye: 0.9, smile: 0.2, stache: true, stubble: false, wrinkle: 0, bindi: false, lip: '#8a4a45' },
    { brow: 0.8, eye: 1.1, smile: 0.9, stache: false, stubble: false, wrinkle: 0, bindi: true, lip: '#b0505a' },
    { brow: 1.1, eye: 0.95, smile: 0.35, stache: false, stubble: true, wrinkle: 0.4, bindi: false, lip: '#8a5048' },
    { brow: 0.7, eye: 1.15, smile: 0.7, stache: false, stubble: false, wrinkle: 0, bindi: true, lip: '#a84a58' },
    { brow: 1.4, eye: 0.85, smile: 0.1, stache: true, stubble: true, wrinkle: 0.8, bindi: false, lip: '#7a4a42' },
    { brow: 1.0, eye: 1.0, smile: 0.6, stache: false, stubble: false, wrinkle: 0.7, bindi: false, lip: '#9a5050' },
    { brow: 0.85, eye: 1.05, smile: 0.85, stache: false, stubble: false, wrinkle: 0.2, bindi: false, lip: '#b05a60' },
  ];
  specs.forEach((s, i) => {
    const [ox, oy] = cell(i); x.save(); x.translate(ox, oy);
    const cx = W / 2, ey = H * 0.40, ex = W * 0.215;
    if (s.stubble) { const g = x.createRadialGradient(cx, H * 0.78, 6, cx, H * 0.74, W * 0.42); g.addColorStop(0, 'rgba(40,30,28,0.38)'); g.addColorStop(1, 'rgba(40,30,28,0)'); x.fillStyle = g; x.fillRect(0, H * 0.58, W, H * 0.42); }
    // eyes: socket shadow, white, iris, pupil, highlight, lids
    for (const sd of [-1, 1]) {
      const px = cx + sd * ex, w = W * 0.1 * s.eye, h = H * 0.05 * s.eye;
      x.fillStyle = 'rgba(90,60,50,0.14)'; x.beginPath(); x.ellipse(px, ey, w * 1.5, h * 2.1, 0, 0, 6.3); x.fill();
      x.fillStyle = '#f6f4ef'; x.beginPath(); x.ellipse(px, ey, w, h, 0, 0, 6.3); x.fill();
      x.fillStyle = '#4a3322'; x.beginPath(); x.arc(px + sd * -w * 0.05, ey, h * 0.95, 0, 6.3); x.fill();
      x.fillStyle = '#0d0907'; x.beginPath(); x.arc(px + sd * -w * 0.05, ey, h * 0.5, 0, 6.3); x.fill();
      x.fillStyle = 'rgba(255,255,255,0.9)'; x.beginPath(); x.arc(px + w * 0.15, ey - h * 0.35, h * 0.2, 0, 6.3); x.fill();
      x.strokeStyle = 'rgba(25,15,12,0.85)'; x.lineWidth = 3.5; x.beginPath(); x.ellipse(px, ey, w, h, 0, Math.PI, 0); x.stroke();
      x.strokeStyle = 'rgba(80,50,40,0.35)'; x.lineWidth = 2; x.beginPath(); x.ellipse(px, ey, w, h, 0, 0, Math.PI); x.stroke();
      x.strokeStyle = 'rgba(25,15,12,0.8)'; x.lineWidth = 3.2 * s.brow; x.lineCap = 'round'; x.beginPath(); x.moveTo(px - w * 1.3, ey - h * 2.7); x.quadraticCurveTo(px, ey - h * 3.9, px + w * 1.35, ey - h * 2.6 + sd * 1.5); x.stroke();
      if (s.wrinkle) { x.strokeStyle = `rgba(70,45,38,${0.18 * s.wrinkle + 0.05})`; x.lineWidth = 1.6; for (let k = 0; k < 3; k++) { x.beginPath(); x.moveTo(px + sd * (w * 1.2), ey + h * (0.2 + k * 0.7)); x.quadraticCurveTo(px + sd * (w * 1.9), ey + h * (0.4 + k * 0.8), px + sd * w * 2.3, ey + h * (0.1 + k * 0.9)); x.stroke(); } }
    }
    // nose: soft shading
    const ng = x.createLinearGradient(cx, H * 0.42, cx, H * 0.66); ng.addColorStop(0, 'rgba(90,55,45,0)'); ng.addColorStop(1, 'rgba(90,55,45,0.22)'); x.fillStyle = ng; x.fillRect(cx - W * 0.05, H * 0.42, W * 0.1, H * 0.24);
    x.fillStyle = 'rgba(60,35,30,0.5)'; for (const sd of [-1, 1]) { x.beginPath(); x.ellipse(cx + sd * W * 0.035, H * 0.655, W * 0.014, H * 0.012, 0, 0, 6.3); x.fill(); }
    if (s.stache) { x.fillStyle = 'rgba(20,14,12,0.9)'; x.beginPath(); x.moveTo(cx - W * 0.14, H * 0.735); x.quadraticCurveTo(cx - W * 0.06, H * 0.69, cx, H * 0.715); x.quadraticCurveTo(cx + W * 0.06, H * 0.69, cx + W * 0.14, H * 0.735); x.quadraticCurveTo(cx + W * 0.06, H * 0.755, cx, H * 0.745); x.quadraticCurveTo(cx - W * 0.06, H * 0.755, cx - W * 0.14, H * 0.735); x.fill(); }
    // mouth
    const my = H * 0.78, mw = W * 0.12 * (0.9 + s.smile * 0.5), curve = H * 0.02 * s.smile;
    x.fillStyle = s.lip; x.beginPath(); x.moveTo(cx - mw, my); x.quadraticCurveTo(cx, my - H * 0.03 - curve * 0.2, cx + mw, my); x.quadraticCurveTo(cx, my + H * 0.045 + curve, cx - mw, my); x.fill();
    x.strokeStyle = 'rgba(50,20,20,0.7)'; x.lineWidth = 2.2; x.beginPath(); x.moveTo(cx - mw, my - curve * 0.4); x.quadraticCurveTo(cx, my + curve * 0.5, cx + mw, my - curve * 0.4); x.stroke();
    if (s.smile > 0.7) { x.fillStyle = 'rgba(255,255,255,0.75)'; x.beginPath(); x.moveTo(cx - mw * 0.6, my); x.quadraticCurveTo(cx, my + curve * 0.8, cx + mw * 0.6, my); x.quadraticCurveTo(cx, my + H * 0.01, cx - mw * 0.6, my); x.fill(); }
    if (s.bindi) { x.fillStyle = '#c0262e'; x.beginPath(); x.arc(cx, H * 0.285, W * 0.016, 0, 6.3); x.fill(); }
    x.restore();
  });
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; t.generateMipmaps = true; return t;
}
