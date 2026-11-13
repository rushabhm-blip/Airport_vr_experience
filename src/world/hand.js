import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// A realistic right hand (generic-hand from the WebXR input-profiles project, MIT licence, see assets/hand/LICENSE-hand.md),
// posed pointing with the other fingers curled. The index fingertip is the origin and the finger points down -z.
const URL_HAND = new URL('../../assets/hand/right.glb', import.meta.url).href;
const Z = new THREE.Vector3(0, 0, 1);

/** Bend a finger chain about z (the bones in this model are siblings, so each joint is moved by hand). */
function bendChain(B, names, angles) {
  const P = names.map((n) => B[n].position.clone()), Q = names.map((n) => B[n].quaternion.clone());
  let cum = 0, prevCum = 0; const out = [P[0].clone()];
  for (let i = 0; i < names.length; i++) {
    cum += angles[i] || 0;
    B[names[i]].quaternion.copy(new THREE.Quaternion().setFromAxisAngle(Z, cum).multiply(Q[i]));
    if (i > 0) { out[i] = out[i - 1].clone().add(P[i].clone().sub(P[i - 1]).applyAxisAngle(Z, prevCum)); B[names[i]].position.copy(out[i]); }
    prevCum = cum;
  }
}

/** Resolves to a posed hand group, or null if the model cannot be loaded (the caller keeps its simple hand). */
export async function makePointingHand(material) {
  const g = await new GLTFLoader().loadAsync(URL_HAND).catch(() => null);
  if (!g) return null;
  const m = g.scene, B = {};
  m.traverse((o) => { if (o.isBone) B[o.name] = o; });
  const F = (f) => [f + '-finger-phalanx-proximal', f + '-finger-phalanx-intermediate', f + '-finger-phalanx-distal', f + '-finger-tip'];
  for (const f of ['middle', 'ring', 'pinky']) bendChain(B, F(f), [1.4, 1.7, 1.0, 0]);
  bendChain(B, ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'], [0, 0.6, 0.6, 0]);      // thumb tucked alongside the curled fingers
  const wrap = new THREE.Group(); wrap.add(m); m.rotation.x = Math.PI / 2;
  wrap.updateMatrixWorld(true);
  const tip = new THREE.Vector3(); B['index-finger-tip'].getWorldPosition(tip); m.position.sub(tip);
  m.traverse((o) => { if (o.isMesh) { o.material = material; o.renderOrder = 40; o.frustumCulled = false; } });
  // a soft cuff closes the open end of the wrist, so the hand never ends in a flat cut
  wrap.updateMatrixWorld(true);
  const wr = new THREE.Vector3(), fg = new THREE.Vector3();
  B['wrist'].getWorldPosition(wr); B['middle-finger-phalanx-proximal'].getWorldPosition(fg);
  const dir = fg.clone().sub(wr).normalize();                          // wrist towards the fingers
  const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.04, 0.05, 20), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x9fe8e1, emissiveIntensity: 0.55, roughness: 0.5, toneMapped: false }));
  cuff.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir);
  cuff.position.copy(wr).addScaledVector(dir, -0.01); cuff.renderOrder = 40; wrap.add(cuff);
  wrap.rotation.x = 0.45;       // fingers a little higher than the wrist, like a hand reaching up from below
  return wrap;
}
