import * as THREE from 'three';
import { COLORS, STAGE } from '../config.js';
import { lerp } from '../util.js';

/**
 * The practice stage. Local frame: origin = the learner's seat on the floor, -Z = forward into the
 * clear space, +X = right, +Y = up. The room fitter moves/rotates/scales the stage so scenery only
 * occupies space that is actually free. Hand-held props are never scaled (they stay real-size).
 */
export class Stage {
  constructor(scene) {
    this.scene = scene;
    this.root = new THREE.Group(); this.root.name = 'StageRoot';
    this.scenery = new THREE.Group(); this.scenery.name = 'Scenery';
    this.props = new THREE.Group(); this.props.name = 'Props';
    this.root.add(this.scenery, this.props);
    scene.add(this.root);
    this.fit = null;
    this.k = 1;        // distance compression for small rooms
    this.sizeK = 1;    // set-piece size compression (much gentler)
    this.depth = STAGE.depth; this.width = STAGE.width;
    this.headY = 1.25; // seated eye height, floor-relative, refined from the headset
    this.anchor = null;
  }

  apply(fit, floorY = 0) {
    this.fit = fit;
    this.root.position.set(fit.origin.x, floorY, fit.origin.z);
    this.root.rotation.set(0, fit.yaw, 0);
    this.k = fit.scale;
    this.sizeK = 1;   // real-size doors, desks and signs in every room: small spaces compress distances, never objects
    this.depth = fit.depth; this.width = fit.width;
    this.root.updateMatrixWorld(true);
  }

  /** Place a set piece. x right, z forward-negative (so z=-2 is 2 m ahead), distances compressed by k. */
  place(obj, { x = 0, y = 0, z = 0, ry = 0, scale = 1, compress = true, fixed = false } = {}) {
    if (fixed) { // arm's-reach assemblies keep real size and position
      obj.position.set(x, y, z); obj.rotation.y = ry; obj.scale.setScalar(scale);
      this.scenery.add(obj); return obj;
    }
    const k = compress ? this.k : 1;
    // Arm's-reach zone (first 1.2 m) is never compressed; only deeper scenery is pulled in for small rooms.
    const zc = z > -1.2 ? z : -1.2 + (z + 1.2) * k;
    obj.position.set(x * k, y, zc);
    obj.rotation.y = ry;
    obj.scale.setScalar(this.sizeK * scale);
    this.scenery.add(obj);
    return obj;
  }

  clearScenery() {
    for (const c of [...this.scenery.children]) this.scenery.remove(c);
    for (const c of [...this.props.children]) this.props.remove(c);
  }

  /** World -> stage-local helper */
  toLocal(v) { return this.root.worldToLocal(v.clone()); }
  toWorld(v) { return this.root.localToWorld(v.clone()); }
}

/** Draws what the room scan decided: blocked cells, the clear area and where the learner sits. */
export class FitVisual {
  constructor(scene) {
    this.group = new THREE.Group();
    this.group.visible = false;
    scene.add(this.group);
    this.opacity = 0; this.target = 0;
    this.mats = [];
  }
  clear() {
    for (const c of [...this.group.children]) { this.group.remove(c); c.geometry?.dispose?.(); }
    this.mats.length = 0;
  }
  show(fit, floorY = 0) {
    this.clear();
    const mk = (color, op) => { const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: op, depthWrite: false, toneMapped: false, side: THREE.DoubleSide }); m.userData.base = op; this.mats.push(m); return m; };
    // Blocked cells
    if (fit.grid) {
      const g = fit.grid, a = fit.gridYaw || 0, c = Math.cos(a), s = Math.sin(a);
      const cells = [];
      for (let j = 0; j < g.nz; j++) for (let i = 0; i < g.nx; i++) if (!g.free[j * g.nx + i]) cells.push([g.minX + (i + 0.5) * g.cell, g.minZ + (j + 0.5) * g.cell]);
      if (cells.length) {
        const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(g.cell * 0.86, g.cell * 0.86).rotateX(-Math.PI / 2), mk(0xd4344f, 0.35), cells.length);
        const m = new THREE.Matrix4();
        cells.forEach(([x, z], n) => { m.makeRotationY(-a).setPosition(x * c - z * s, floorY + 0.012, x * s + z * c); inst.setMatrixAt(n, m); });
        this.group.add(inst);
      }
    }
    // Stage outline
    if (fit.corners) {
      const pts = fit.corners.map(([x, z]) => new THREE.Vector3(x, floorY + 0.02, z));
      for (let i = 0; i < pts.length; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        const len = a.distanceTo(b);
        const bar = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.035).rotateX(-Math.PI / 2), mk(0x38e1d2, 0.95));
        bar.position.copy(a).lerp(b, 0.5);
        bar.rotation.y = Math.atan2(-(b.z - a.z), b.x - a.x);
        this.group.add(bar);
      }
      const poly = new THREE.Shape(fit.corners.map(([x, z]) => new THREE.Vector2(x, -z)));
      const fill = new THREE.Mesh(new THREE.ShapeGeometry(poly).rotateX(-Math.PI / 2), mk(0x38e1d2, 0.13));
      fill.position.y = floorY + 0.008; this.group.add(fill);
    }
    // Seat marker + forward arrow
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.26, 40).rotateX(-Math.PI / 2), mk(0xffffff, 0.95));
    ring.position.set(fit.origin.x, floorY + 0.025, fit.origin.z); this.group.add(ring);
    const arrow = new THREE.Mesh(new THREE.ConeGeometry(0.11, 0.28, 3).rotateX(-Math.PI / 2).rotateY(0), mk(0x38e1d2, 0.95));
    arrow.rotation.set(0, fit.yaw, 0);
    arrow.position.set(fit.origin.x - Math.sin(fit.yaw) * 0.55, floorY + 0.03, fit.origin.z - Math.cos(fit.yaw) * 0.55);
    arrow.scale.y = 0.2; this.group.add(arrow);
    this.group.visible = true; this.target = 1; this.opacity = 1;
  }
  hide() { this.target = 0; }
  update(dt) {
    if (!this.group.visible) return;
    this.opacity += (this.target - this.opacity) * Math.min(1, dt * 4);
    for (const m of this.mats) m.opacity = m.userData.base * this.opacity;
    if (this.target === 0 && this.opacity < 0.02) this.group.visible = false;
  }
}
