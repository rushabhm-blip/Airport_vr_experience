import * as THREE from 'three';

/**
 * The shape of a present-day smartphone: a slab with rounded corners and softly rounded edges, a screen with its own rounded corners,
 * a small camera island on the back, and side buttons. Shared by the learner's phone and the phones people hold in the crowd.
 */

/** A rounded rectangle outline, centred on the origin. */
export function roundedShape(w, h, r) {
  const x = -w / 2, y = -h / 2, s = new THREE.Shape();
  s.moveTo(x + r, y); s.lineTo(x + w - r, y); s.absarc(x + w - r, y + r, r, -Math.PI / 2, 0, false);
  s.lineTo(x + w, y + h - r); s.absarc(x + w - r, y + h - r, r, 0, Math.PI / 2, false);
  s.lineTo(x + r, y + h); s.absarc(x + r, y + h - r, r, Math.PI / 2, Math.PI, false);
  s.lineTo(x, y + r); s.absarc(x + r, y + r, r, Math.PI, Math.PI * 1.5, false);
  return s;
}

/** A flat rounded-rectangle plane facing +z, with uv 0..1 across it (so a canvas texture can be mapped on). */
export function roundedPlane(w, h, r, curve = 8) {
  const g = new THREE.ShapeGeometry(roundedShape(w, h, r), curve), p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i) / w + 0.5, p.getY(i) / h + 0.5);
  return g;
}

/** The phone's body: a rounded slab with bevelled edges, centred, thickness along z. */
export function roundedSlab(w, h, d, r, bevel = 0.0025) {
  const g = new THREE.ExtrudeGeometry(roundedShape(w, h, r), { depth: d - bevel * 2, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 3, curveSegments: 8 });
  g.translate(0, 0, -(d - bevel * 2) / 2); g.computeVertexNormals(); return g;
}

/**
 * A complete phone as a group: `w` wide (metres), a modern tall aspect, +z is the screen side.
 * `screenMesh`, if given, is placed as the display (its geometry is replaced by a rounded one); otherwise a dark glowing screen is added.
 */
export function buildPhone(w = 0.072, { screenMesh = null, screenAspect = null, screenColor = 0x1b2a3f, tone = 0x15181d, detail = true } = {}) {
  const d = w * 0.108, r = w * 0.15, bezel = w * 0.045, h = screenAspect ? (w - bezel * 2) * screenAspect + bezel * 2 : w * 2.06;
  const grp = new THREE.Group(); grp.name = 'PhoneModel';
  const frame = new THREE.MeshStandardMaterial({ color: tone, roughness: 0.28, metalness: 0.75 });
  const body = new THREE.Mesh(roundedSlab(w, h, d, r, w * 0.03), frame); body.castShadow = true; grp.add(body);
  const sw = w - bezel * 2, sh = h - bezel * 2, sr = Math.max(0.002, r - bezel * 0.8);
  const z = d / 2 + 0.0003;
  if (screenMesh) { screenMesh.geometry.dispose(); screenMesh.geometry = roundedPlane(sw, sh, sr); screenMesh.position.set(0, 0, z); grp.add(screenMesh); }
  else { const sc = new THREE.Mesh(roundedPlane(sw, sh, sr), new THREE.MeshBasicMaterial({ color: screenColor, toneMapped: false })); sc.position.z = z; grp.add(sc); }
  if (detail) {
    const dark = new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.25, metalness: 0.2 });
    const pill = new THREE.Mesh(roundedPlane(w * 0.24, w * 0.07, w * 0.035, 6), dark); pill.position.set(0, h / 2 - bezel - w * 0.075, z + 0.0004); grp.add(pill);     // the front camera cut-out
    // back: a glossy glass panel, with the camera island at the top left
    const back = new THREE.Mesh(roundedPlane(w - 0.0016, h - 0.0016, r - 0.0008), new THREE.MeshStandardMaterial({ color: 0x39424f, roughness: 0.2, metalness: 0.45, side: THREE.FrontSide }));
    back.rotation.y = Math.PI; back.position.z = -d / 2 - 0.0003; grp.add(back);
    const isl = new THREE.Mesh(roundedPlane(w * 0.44, w * 0.44, w * 0.11, 6), new THREE.MeshStandardMaterial({ color: 0x23272e, roughness: 0.3, metalness: 0.6 }));
    isl.rotation.y = Math.PI; isl.position.set(w * 0.2, h / 2 - w * 0.3, -d / 2 - 0.0012); grp.add(isl);
    for (const [lx, ly] of [[0.07, 0.13], [0.07, -0.025], [-0.075, 0.03]]) {
      const lens = new THREE.Mesh(new THREE.CylinderGeometry(w * 0.075, w * 0.075, 0.0016, 18).rotateX(Math.PI / 2), dark);
      lens.position.set(w * 0.2 - lx * w * 1.2, h / 2 - w * 0.3 + ly * w * 1.2, -d / 2 - 0.0026); grp.add(lens);
    }
    // side buttons
    const btn = (y0, len) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.0016, len, d * 0.5), frame); b.position.set(w / 2 + 0.0004, y0, 0); grp.add(b); };
    btn(h * 0.12, h * 0.1); const vol = (y0) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.0016, h * 0.055, d * 0.5), frame); b.position.set(-w / 2 - 0.0004, y0, 0); grp.add(b); }; vol(h * 0.16); vol(h * 0.07);
  }
  grp.userData.size = { w, h, d };
  return grp;
}

/** A merged, single-material-per-colour geometry of a phone for instancing in the crowd (vertex colours baked in). Screen faces +z. */
export function crowdPhoneGeometry(paint, merge) {
  const w = 0.07, h = w * 2.06, d = w * 0.108, r = w * 0.15, bezel = w * 0.045;
  const body = roundedSlab(w, h, d, r, w * 0.03);
  const screen = roundedPlane(w - bezel * 2, h - bezel * 2, r - bezel * 0.8, 5).translate(0, 0, d / 2 + 0.0003);
  const back = roundedPlane(w - 0.0016, h - 0.0016, r - 0.0008, 5).rotateY(Math.PI).translate(0, 0, -d / 2 - 0.0003);
  const isl = roundedPlane(w * 0.42, w * 0.42, w * 0.1, 4).rotateY(Math.PI).translate(w * 0.2, h / 2 - w * 0.3, -d / 2 - 0.001);
  return merge([paint(body, 0x1b1d22), paint(screen, 0x9ec6ff), paint(back, 0x262a31), paint(isl, 0x15171b)]);
}
