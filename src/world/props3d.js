import * as THREE from 'three';

/** Small, reusable airport furnishings. Each helper adds plain shapes to `group` (which the caller merges by material, so they are cheap). */
const tex = (draw, w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };
const std = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.5, ...o });
const basic = (map) => new THREE.MeshBasicMaterial({ map, toneMapped: false, side: THREE.DoubleSide });

export function makeProps(group, { steel, white, dark, teal, navy, glass, glow }) {
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); group.add(m); return m; };
  const panel = (map, w, h, x, y, z, ry = 0) => add(new THREE.PlaneGeometry(w, h), basic(map), x, y, z, 0, ry, 0);
  const warm = new THREE.MeshBasicMaterial({ color: 0xffe2b0, toneMapped: false });
  const colourBox = (c) => std(c, { roughness: 0.7 });
  const cache = {};
  const col = (c) => (cache[c] ??= colourBox(c));

  // a leafy indoor plant: a tapered pot with a soil top and many long curved leaves in several greens
  const greens = [0x2e7d3b, 0x3f9a4a, 0x2a6b34, 0x4fae57, 0x1f5f30].map((c) => std(c, { roughness: 0.7, side: THREE.DoubleSide }));
  const leafGeo = (() => { const g = new THREE.ConeGeometry(0.1, 0.85, 4, 3); g.translate(0, 0.42, 0); const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) * 0.35 + y * y * 0.35); p.setX(i, p.getX(i) * (1 - y * 0.25)); } g.computeVertexNormals(); return g; })();
  const plantAt = (x, z, s = 1) => {
    add(new THREE.CylinderGeometry(0.5 * s, 0.38 * s, 0.8 * s, 16), steel, x, 0.4 * s, z); add(new THREE.CylinderGeometry(0.52 * s, 0.52 * s, 0.05 * s, 16), dark, x, 0.82 * s, z); add(new THREE.CylinderGeometry(0.44 * s, 0.44 * s, 0.03 * s, 14), std(0x3b2a1d, { roughness: 1 }), x, 0.83 * s, z);
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2 + (i % 3) * 0.2, tilt = 0.35 + (i % 4) * 0.2, h = (0.8 + (i % 5) * 0.12) * s, m = add(leafGeo, greens[i % greens.length], x + Math.cos(a) * 0.08 * s, 0.86 * s, z + Math.sin(a) * 0.08 * s);
      m.scale.setScalar(h * 1.15); m.rotation.set(0, -a + Math.PI / 2, 0); m.rotateX(tilt); m.rotateY(0);
    }
  };
  return {
    plant: plantAt,
    /** A shopfront on a wall. (x, z) is its centre on the wall; face is +1 if the shop looks towards +z, -1 towards -z. */
    shop(x, z, face, w, name, accent, items = ['#e8c06a', '#c95b4a', '#5a8fd0', '#7bbf6a']) {
      const d = 2.6, hh = 4.2;
      add(new THREE.BoxGeometry(w, hh, 0.4), white, x, hh / 2, z - face * 0.2);                                     // the wall behind
      add(new THREE.BoxGeometry(w + 0.5, 0.9, 0.5), std(accent, { roughness: 0.4 }), x, hh + 0.35, z + face * 0.0);    // fascia
      const sign = tex((c, W, H) => { c.fillStyle = '#' + accent.toString(16).padStart(6, '0'); c.fillRect(0, 0, W, H); c.fillStyle = '#fff'; c.font = '700 120px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name, W / 2, H / 2 + 6); }, 1024, 160);
      panel(sign, w * 0.8, 0.8, x, hh + 0.35, z + face * 0.28, face > 0 ? 0 : Math.PI);
      add(new THREE.BoxGeometry(w, 0.15, 0.12), steel, x, 0.08, z + face * 0.26);
      add(new THREE.PlaneGeometry(w - 0.6, 2.6), glass, x, 1.5, z + face * 0.27);                                  // the glass window
      add(new THREE.BoxGeometry(w, 0.7, 1.0), dark, x, 0.35, z + face * 0.8);                                     // the display plinth
      for (let i = 0; i < Math.floor((w - 1.2) / 0.55); i++) {                                                     // goods on shelves
        const gx = x - (w - 1.2) / 2 + i * 0.55 + 0.27;
        add(new THREE.BoxGeometry(0.42, 0.34 + (i % 3) * 0.1, 0.3), col(parseInt(items[i % items.length].slice(1), 16)), gx, 0.9 + (i % 3) * 0.05, z + face * 0.85);
        add(new THREE.BoxGeometry(0.4, 0.3, 0.26), col(parseInt(items[(i + 2) % items.length].slice(1), 16)), gx, 1.55, z + face * 0.5);
      }
      add(new THREE.BoxGeometry(w - 0.4, 0.05, 0.4), warm, x, 2.9, z + face * 0.45);                               // warm shop lights
      // a door-like gap on one side and a counter inside
      add(new THREE.BoxGeometry(2.4, 1.0, 0.7), white, x + w / 2 - 1.5, 0.5, z + face * 1.5); add(new THREE.BoxGeometry(2.5, 0.05, 0.75), teal, x + w / 2 - 1.5, 1.03, z + face * 1.5);
    },
    /** A big backlit advertising panel on a wall. */
    lightbox(x, y, z, ry, w, h, title, sub, c1, c2) {
      const t = tex((c, W, H) => { const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, c1); g.addColorStop(1, c2); c.fillStyle = g; c.fillRect(0, 0, W, H); c.fillStyle = 'rgba(255,255,255,0.18)'; c.beginPath(); c.arc(W * 0.8, H * 0.5, H * 0.7, 0, 6.3); c.fill(); c.fillStyle = '#fff'; c.font = '700 110px sans-serif'; c.textBaseline = 'middle'; c.fillText(title, 60, H * 0.42); c.font = '500 56px sans-serif'; c.fillText(sub, 64, H * 0.7); }, 1024, 512);
      add(new THREE.BoxGeometry(w + 0.2, h + 0.2, 0.12), steel, x, y, z, 0, ry, 0);
      const p = panel(t, w, h, x, y, z, ry); p.translateZ(0.07);
    },
    /** A self check-in kiosk: a pillar with a lit screen. */
    kiosk(x, z, ry = 0) {
      add(new THREE.BoxGeometry(0.55, 1.5, 0.42), white, x, 0.75, z, 0, ry, 0);
      const s = add(new THREE.BoxGeometry(0.46, 0.4, 0.04), new THREE.MeshBasicMaterial({ color: 0x35c6c2, toneMapped: false }), x, 1.25, z, -0.25, ry, 0); s.translateZ(0.22);
      add(new THREE.BoxGeometry(0.5, 0.06, 0.34), teal, x, 0.95, z, 0, ry, 0); add(new THREE.BoxGeometry(0.18, 0.12, 0.04), dark, x, 0.78, z, 0, ry, 0);
    },
    bin(x, z) { add(new THREE.CylinderGeometry(0.22, 0.2, 0.8, 14), steel, x, 0.4, z); add(new THREE.CylinderGeometry(0.23, 0.23, 0.06, 14), dark, x, 0.83, z); add(new THREE.BoxGeometry(0.12, 0.02, 0.02), dark, x, 0.65, z + 0.21); },
    /** Vending machine with a glowing front. */
    vending(x, z, ry, c = 0xd63a3a) {
      add(new THREE.BoxGeometry(1.0, 1.9, 0.8), std(c, { roughness: 0.4 }), x, 0.95, z, 0, ry, 0);
      const f = add(new THREE.PlaneGeometry(0.8, 1.4), glow, x, 1.1, z, 0, ry, 0); f.translateZ(0.41);
      for (let r = 0; r < 5; r++) for (let k = 0; k < 4; k++) { const b = add(new THREE.BoxGeometry(0.14, 0.2, 0.06), col([0x3a7bd5, 0xe8a33a, 0x4caf6a, 0xd34a5a][(r + k) % 4]), x, 1.1, z, 0, ry, 0); b.translateX(-0.3 + k * 0.2); b.translateY(0.5 - r * 0.25 - 0.4 + 0.4); b.translateZ(0.44); }
    },
    clock(x, y, z, ry) {
      add(new THREE.CylinderGeometry(0.5, 0.5, 0.08, 28), dark, x, y, z, Math.PI / 2, ry, 0);
      const t = tex((c, W) => { c.fillStyle = '#fafafa'; c.beginPath(); c.arc(W / 2, W / 2, W / 2 - 4, 0, 6.3); c.fill(); c.strokeStyle = '#222'; c.lineWidth = 8; for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; c.beginPath(); c.moveTo(W / 2 + Math.sin(a) * W * 0.4, W / 2 - Math.cos(a) * W * 0.4); c.lineTo(W / 2 + Math.sin(a) * W * 0.46, W / 2 - Math.cos(a) * W * 0.46); c.stroke(); } c.lineWidth = 14; c.beginPath(); c.moveTo(W / 2, W / 2); c.lineTo(W / 2 + 70, W / 2 - 110); c.stroke(); c.lineWidth = 9; c.beginPath(); c.moveTo(W / 2, W / 2); c.lineTo(W / 2 - 30, W / 2 - 180); c.stroke(); }, 256, 256);
      const p = add(new THREE.CircleGeometry(0.46, 28), basic(t), x, y, z, 0, ry, 0); p.translateZ(0.05);
    },
    /** A children's play corner: soft coloured blocks on a mat. */
    play(x, z) {
      add(new THREE.BoxGeometry(5, 0.08, 4), col(0x7ec8e3), x, 0.04, z);
      const cs = [0xf2994a, 0x6fcf97, 0xeb5757, 0xf2c94c, 0x9b51e0];
      for (let i = 0; i < 9; i++) { const k = i % 3, j = (i / 3) | 0; add(i % 2 ? new THREE.BoxGeometry(0.7, 0.5, 0.7) : new THREE.CylinderGeometry(0.4, 0.4, 0.55, 14), col(cs[i % cs.length]), x - 1.6 + k * 1.2 + (j % 2) * 0.3, 0.33, z - 1.1 + j * 1.0); }
      add(new THREE.SphereGeometry(0.45, 12, 10), col(0xeb5757), x + 1.8, 0.5, z + 1.2);
    },
    /** A charging pillar between seats: a small post with a glowing teal strip. */
    charger(x, z) { add(new THREE.BoxGeometry(0.22, 0.5, 0.22), dark, x, 0.25, z); add(new THREE.BoxGeometry(0.2, 0.04, 0.2), new THREE.MeshBasicMaterial({ color: 0x35c6c2, toneMapped: false }), x, 0.52, z); },
    /** A hanging gate sign: a number and an arrow. */
    gateSign(x, y, z, text, ry, hangTo) {
      const t = tex((c, W, H) => { c.fillStyle = '#15305a'; c.fillRect(0, 0, W, H); c.fillStyle = '#ffc928'; c.font = '800 130px sans-serif'; c.textBaseline = 'middle'; c.fillText(text, 40, H / 2 + 4); }, 768, 192);
      const p = panel(t, 2.8, 0.7, x, y, z, ry);
      for (const sx of [-1.2, 1.2]) add(new THREE.CylinderGeometry(0.012, 0.012, hangTo - y, 6), steel, x + sx, y + (hangTo - y) / 2, z);
    },
  };
}
