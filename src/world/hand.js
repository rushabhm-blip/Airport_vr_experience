import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// A realistic right hand (generic-hand from the WebXR input-profiles project, MIT licence, see assets/hand/LICENSE-hand.md),
// posed pointing: the index finger straight, the other three curled in, the thumb folded across the palm.
// We see the back of the hand, as you would your own hand when you point. The index fingertip is the origin and points down -z.
const URL_HAND = new URL('../../assets/hand/right.glb', import.meta.url).href;
const X = [1, 0, 0], Y = [0, 1, 0], Z = [0, 0, 1];

/**
 * Pose one finger chain. The bones of this model are siblings (not nested), so each joint is placed by hand:
 * steps[i] = [axis, angle] is the extra rotation at joint i, applied on top of the joints before it.
 */
function poseChain(B, names, steps) {
  const P = names.map((n) => B[n].position.clone()), Q = names.map((n) => B[n].quaternion.clone());
  let W = new THREE.Quaternion(), pos = P[0].clone();
  for (let i = 0; i < names.length; i++) {
    const st = steps[i], dq = st ? new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...st[0]).normalize(), st[1]) : new THREE.Quaternion();
    if (i > 0) pos = pos.clone().add(P[i].clone().sub(P[i - 1]).applyQuaternion(W));
    W = W.clone().multiply(dq);
    B[names[i]].position.copy(pos); B[names[i]].quaternion.copy(W.clone().multiply(Q[i]));
  }
}

/** Resolves to a posed hand group, or null if the model cannot be loaded (the caller keeps its simple hand). */
export async function makePointingHand(material) {
  const g = await new GLTFLoader().loadAsync(URL_HAND).catch(() => null);
  if (!g) return null;
  const m = g.scene, B = {};
  m.traverse((o) => { if (o.isBone) B[o.name] = o; });
  const F = (f) => [f + '-finger-phalanx-proximal', f + '-finger-phalanx-intermediate', f + '-finger-phalanx-distal', f + '-finger-tip'];
  for (const f of ['middle', 'ring', 'pinky']) poseChain(B, F(f), [[Z, 1.4], [Z, 1.7], [Z, 1.0], null]);
  poseChain(B, ['thumb-metacarpal', 'thumb-phalanx-proximal', 'thumb-phalanx-distal', 'thumb-tip'], [[Y, -1.3], [Z, 0.7], [Z, 0.8], null]);   // thumb folded across the palm
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
  wrap.rotation.set(0.5, 0, -1.25);      // tilt up a little and roll so the back of the hand faces you
  return wrap;
}
