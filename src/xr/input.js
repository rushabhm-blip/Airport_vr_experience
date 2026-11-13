import * as THREE from 'three';
import { COLORS } from '../config.js';
import { clamp, damp } from '../util.js';

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3(), _q = new THREE.Quaternion(), _m = new THREE.Matrix4(), _e = new THREE.Euler();
const FLAT = new THREE.Quaternion().setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0));

/**
 * Unified input for Quest 3 controllers, Quest 3 hand tracking (pinch = select, index-tip poke on panels)
 * and a mouse fallback for desktop preview. Everything interactive is registered here:
 *  - interactives: meshes with userData.interact = {hover(uv), leave(), select(uv)}
 *  - grabbables:   Object3Ds with userData.grab = {radius, rest, onRelease, home}
 *  - supports:     fn(localPos) => top height of a surface the object may rest on, or null
 */
export class Interactions {
  constructor({ renderer, scene, camera, domElement }) {
    this.renderer = renderer; this.scene = scene; this.camera = camera; this.dom = domElement;
    this.interactives = new Set();
    this.grabbables = new Set();
    this.supports = [];
    this.falling = new Set();
    this.paused = false;
    this.pointers = [];
    this.defaultHome = scene;
    this.raycaster = new THREE.Raycaster();
    this.onAnyPress = null;
    this.mouse = null;
    this.showJoints = false;
    this.listeners = {};
    this.keys = new Set();   // desktop walking: W A S D
    addEventListener('keydown', (e) => { if (e.target?.tagName !== 'INPUT' && /^[wasd]$/i.test(e.key)) this.keys.add(e.key.toLowerCase()); });
    addEventListener('keyup', (e) => this.keys.delete(e.key.toLowerCase()));
    addEventListener('blur', () => this.keys.clear());

    for (let i = 0; i < 2; i++) this.pointers.push(this._makeXRPointer(i));
    this._makeMouse();
  }

  on(evt, fn) { (this.listeners[evt] ||= []).push(fn); }
  emit(evt, data) { for (const fn of this.listeners[evt] || []) fn(data); }

  addInteractive(mesh) { this.interactives.add(mesh); }
  removeInteractive(mesh) { this.interactives.delete(mesh); }
  addGrabbable(obj, opts = {}) {
    obj.userData.grab = { radius: 0.16, rest: 'flat', restOffset: 0.004, home: this.defaultHome, ...opts };
    this.grabbables.add(obj);
  }
  removeGrabbable(obj) { this.release(obj); this.grabbables.delete(obj); this.falling.delete(obj); }
  clear() {
    for (const p of this.pointers) this._release(p, true);
    this.interactives.clear(); this.grabbables.clear(); this.supports.length = 0; this.falling.clear();
    for (const p of this.pointers) p.hover = null;
  }

  // ----------------------------------------------------------------- XR pointers
  _makeXRPointer(i) {
    const r = this.renderer;
    const controller = r.xr.getController(i);
    const grip = r.xr.getControllerGrip(i);
    const hand = r.xr.getHand(i);
    this.scene.add(controller, grip, hand);

    const ray = new THREE.Mesh(
      new THREE.CylinderGeometry(0.0016, 0.0016, 1, 6, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.5),
      new THREE.MeshBasicMaterial({ color: COLORS.tealGlow, transparent: true, opacity: 0.55, depthWrite: false, toneMapped: false }));
    ray.visible = false; ray.renderOrder = 20;
    controller.add(ray);
    const cursor = new THREE.Mesh(
      new THREE.RingGeometry(0.008, 0.013, 24),
      new THREE.MeshBasicMaterial({ color: COLORS.tealGlow, transparent: true, depthTest: false, toneMapped: false, side: THREE.DoubleSide }));
    cursor.renderOrder = 30; cursor.visible = false;
    this.scene.add(cursor);

    const p = { index: i, kind: 'xr', controller, grip, hand, ray, cursor, isHand: false, connected: false, held: null, heldBy: null, hover: null, hit: null, selecting: false, poke: { prevZ: new Map(), cooldown: 0 }, source: null };
    controller.addEventListener('connected', (e) => {
      p.connected = true; p.source = e.data; p.isHand = !!e.data.hand; p.handedness = e.data.handedness;
    });
    controller.addEventListener('disconnected', () => { this._release(p); p.connected = false; p.source = null; ray.visible = false; cursor.visible = false; });
    controller.addEventListener('selectstart', () => this._pressStart(p, 'select'));
    controller.addEventListener('selectend', () => this._pressEnd(p, 'select'));
    controller.addEventListener('squeezestart', () => this._pressStart(p, 'squeeze', true));
    controller.addEventListener('squeezeend', () => this._pressEnd(p, 'squeeze'));
    return p;
  }

  // ----------------------------------------------------------------- mouse (desktop preview)
  _makeMouse() {
    const holder = new THREE.Object3D();
    this.scene.add(holder);
    const m = { index: 2, kind: 'mouse', controller: holder, holder, ray: null, cursor: null, held: null, heldBy: null, hover: null, hit: null, ndc: new THREE.Vector2(), down: false, dragLook: false, plane: new THREE.Plane(), lookX: 0, lookY: 0, moved: 0 };
    this.mouse = m;
    this.pointers.push(m);
    const el = this.dom;
    const setNdc = (e) => { const r = el.getBoundingClientRect(); m.ndc.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1); };
    el.addEventListener('pointermove', (e) => {
      if (this.renderer.xr.isPresenting) return;
      setNdc(e);
      if (m.dragLook) {
        this.emit('look', { dx: e.movementX, dy: e.movementY });
        m.moved += Math.abs(e.movementX) + Math.abs(e.movementY);
      }
    });
    el.addEventListener('pointerdown', (e) => {
      if (this.renderer.xr.isPresenting) return;
      setNdc(e); m.down = true; m.moved = 0;
      el.setPointerCapture?.(e.pointerId);
      this._mouseRay();
      const ui = this._pickInteractive(this.raycaster);
      if (ui && ui.object.userData.interact.select?.(ui.uv)) { m.dragLook = false; return; }
      const g = this._pickGrabbable(this.raycaster, 8);
      if (g) {
        _v.copy(this.raycaster.ray.direction);
        const hitPt = this.raycaster.ray.origin.clone().addScaledVector(_v, g.distance);
        m.plane.setFromNormalAndCoplanarPoint(this.camera.getWorldDirection(_v2).negate(), hitPt);
        holder.position.copy(hitPt); holder.quaternion.identity(); holder.updateMatrixWorld(true);
        this._grab(m, g.root, 'mouse');
      } else m.dragLook = true;
    });
    const up = (e) => {
      if (this.renderer.xr.isPresenting) return;
      m.down = false; m.dragLook = false; this._release(m);
    };
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
    el.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  _mouseRay() { this.raycaster.setFromCamera(this.mouse.ndc, this.camera); return this.raycaster; }

  // ----------------------------------------------------------------- picking helpers
  _pickInteractive(rc, maxDist = 6) {
    const list = [];
    const live = (m) => { for (let o = m; o; o = o.parent) if (!o.visible) return false; return true; };   // effective visibility, not just the mesh's own flag
    for (const m of this.interactives) { if (!m.parent || !live(m)) continue; if (this.paused && !m.userData.system) continue; list.push(m); }
    if (!list.length) return null;
    const hits = rc.intersectObjects(list, false);
    let person = null;
    for (const h of hits) {
      if (h.distance > maxDist) break;
      if (h.object.userData.interact?.enabled === false) continue;
      if (h.object.userData.lowPriority) { person ??= h; continue; }     // a person's click-box must never block a card or button behind it
      return h;
    }
    return person;
  }

  _pickGrabbable(rc, maxDist = 2.6) {
    let best = null;
    for (const g of this.grabbables) {
      if (!g.visible || g.userData.heldBy) continue;
      // intersect the grabbable's own meshes (recursive)
      const hits = rc.intersectObject(g, true);
      if (hits.length && hits[0].distance < maxDist && (!best || hits[0].distance < best.distance)) best = { root: g, distance: hits[0].distance };
    }
    return best;
  }

  _nearestGrabbable(worldPos, extra = 0) {
    let best = null, bd = Infinity;
    for (const g of this.grabbables) {
      if (!g.visible || g.userData.heldBy) continue;
      const gp = g.userData.grab;
      const c = g.userData.grabCenter ? g.localToWorld(_v2.copy(g.userData.grabCenter)) : g.getWorldPosition(_v2);
      const d = c.distanceTo(worldPos);
      if (d < gp.radius + extra && d < bd) { bd = d; best = g; }
    }
    return best;
  }

  // ----------------------------------------------------------------- press / release
  _pressStart(p, kind, grabOnly = false) {
    if (this.paused && grabOnly) return;
    p.selecting = true;
    p.controller.updateMatrixWorld(true);
    this._rayFrom(p);
    if (grabOnly) {   // grip on a card = drag it to wherever is comfortable
      const card = this._pickInteractive(this.raycaster);
      if (card && card.object.userData.followable) { p.dragCard = card.object; this._haptic(p, 0.3, 30); return; }
    }
    if (!grabOnly) {
      const ui = this._pickInteractive(this.raycaster);
      if (ui && ui.object.userData.interact.select?.(ui.uv)) { this._haptic(p, 0.5, 40); this.emit('ui', ui.object); return; }
    }
    if (this.paused || p.held) return;     // while travelling / paused only system surfaces respond
    // 1) something in/near the hand, 2) otherwise something the ray points at (seated reach)
    const near = this._nearestGrabbable(p.controller.getWorldPosition(new THREE.Vector3()));
    const far = near ? null : this._pickGrabbable(this.raycaster, 2.6);
    const target = near || far?.root;
    if (target?.userData.grab?.onTap) { target.userData.grab.onTap(target, p); this._haptic(p, 0.4, 30); this.emit('tap', target); return; }     // a simple click does the whole job (no dragging needed)
    if (target) this._grab(p, target, kind);
    else if (!grabOnly) this.emit('empty', { ray: this.raycaster.ray.clone(), pointer: p });
  }
  _pressEnd(p, kind) {
    if (kind === 'squeeze') p.dragCard = null;
    p.selecting = false;
    if (p.held && p.heldBy === kind) this._release(p);
  }

  _grab(p, obj, kind) {
    obj.userData.heldBy = p;
    p.held = obj; p.heldBy = kind;
    this.falling.delete(obj);
    p.controller.attach(obj);
    obj.userData.grab.onGrab?.(obj, p);
    this._haptic(p, 0.4, 30);
    this.emit('grab', obj);
  }

  release(obj) { const p = obj.userData.heldBy; if (p) this._release(p); }

  _release(p, silent = false) {
    const obj = p.held;
    if (!obj) return;
    p.held = null; p.heldBy = null;
    obj.userData.heldBy = null;
    const g = obj.userData.grab;
    (g.home || this.defaultHome).attach(obj);
    if (silent) return;
    const consumed = g.onRelease?.(obj, p);
    if (!consumed) this._startFall(obj);
    this.emit('release', obj);
  }

  _startFall(obj) { obj.userData.vel = 0; obj.userData.settling = 0; this.falling.add(obj); }

  _haptic(p, intensity = 0.4, ms = 30) {
    try { p.source?.gamepad?.hapticActuators?.[0]?.pulse(intensity, ms); } catch { /* optional */ }
  }

  _rayFrom(p) {
    if (p.kind === 'mouse') return this._mouseRay();
    p.controller.updateMatrixWorld(true);
    _m.identity().extractRotation(p.controller.matrixWorld);
    this.raycaster.ray.origin.setFromMatrixPosition(p.controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1).applyMatrix4(_m).normalize();
    return this.raycaster;
  }

  /** Walking input as a stick-like vector: the left thumbstick, or W A S D on the desktop. y < 0 is forward. */
  walkAxes() {
    const s = this.stick('left');
    if (Math.hypot(s.x, s.y) > 0.01) return s;
    return { x: (this.keys.has('d') ? 1 : 0) - (this.keys.has('a') ? 1 : 0), y: (this.keys.has('s') ? 1 : 0) - (this.keys.has('w') ? 1 : 0) };
  }

  /** Thumbstick of a controller (-1..1), preferring the left one for walking. */
  stick(hand = 'left') {
    let best = null;
    for (const p of this.pointers) {
      const gp = p.kind === 'xr' && p.connected && !p.isHand ? p.source?.gamepad : null;
      if (!gp || gp.axes.length < 4) continue;
      const v = { x: gp.axes[2], y: gp.axes[3] };
      if (p.handedness === hand) return v;
      best = best || v;
    }
    return best || { x: 0, y: 0 };
  }

  // ----------------------------------------------------------------- per-frame
  update(dt) {
    const presenting = this.renderer.xr.isPresenting;
    for (const p of this.pointers) {
      if (p.kind === 'xr') { if (presenting && p.connected) this._updateXR(p, dt); else { p.ray.visible = false; p.cursor.visible = false; } }
      else if (!presenting) this._updateMouse(p, dt);
    }
    this._updateFalling(dt);
  }

  _setHover(p, hit) {
    const prev = p.hover;
    const cur = hit?.object ?? null;
    if (prev && prev !== cur) prev.userData.interact?.leave?.();
    if (cur) cur.userData.interact?.hover?.(hit.uv);
    p.hover = cur; p.hit = hit;
  }

  _updateXR(p, dt) {
    this._rayFrom(p);
    if (p.dragCard) { this.emit('carddrag', { object: p.dragCard, ray: this.raycaster.ray }); }
    const hit = this._pickInteractive(this.raycaster);
    this._setHover(p, hit);

    // Direct touch: index fingertip poking a panel (hand tracking).
    if (p.isHand) this._poke(p, dt);

    const showRay = !p.isHand || p.selecting || !!hit;
    p.ray.visible = showRay;
    if (showRay) {
      const len = hit ? hit.distance : p.held ? 0.35 : 1.1;
      p.ray.scale.set(1, 1, len);
      p.ray.material.opacity = hit ? 0.9 : 0.35;
    }
    if (hit) {
      p.cursor.visible = true;
      p.cursor.position.copy(hit.point);
      p.cursor.quaternion.copy(hit.object.getWorldQuaternion(_q));
      p.cursor.translateZ(0.003);
      const s = 0.6 + hit.distance * 0.5; p.cursor.scale.setScalar(s);
    } else p.cursor.visible = false;
  }

  _poke(p, dt) {
    const tip = p.hand.joints?.['index-finger-tip'];
    if (!tip || !tip.visible && tip.position.lengthSq() === 0) return;
    p.poke.cooldown = Math.max(0, p.poke.cooldown - dt);
    tip.getWorldPosition(_v);
    for (const mesh of this.interactives) {
      const surf = mesh.userData.surface;
      if (!surf || !mesh.visible || !mesh.parent) continue;
      _v2.copy(_v); mesh.worldToLocal(_v2);
      const hw = surf.width / 2, hh = surf.height / 2;
      const inside = Math.abs(_v2.x) <= hw && Math.abs(_v2.y) <= hh;
      const prevZ = p.poke.prevZ.get(mesh) ?? 1;
      if (inside && _v2.z < 0.05 && _v2.z > -0.03) {
        const uv = new THREE.Vector2(_v2.x / surf.width + 0.5, _v2.y / surf.height + 0.5);
        surf.hover?.(uv);
        if (prevZ > 0.014 && _v2.z <= 0.012 && p.poke.cooldown <= 0) {
          p.poke.cooldown = 0.55;
          if (surf.select(uv)) this._haptic(p, 0.3, 25);
        }
      }
      p.poke.prevZ.set(mesh, _v2.z);
    }
  }

  _updateMouse(p, dt) {
    if (this.paused) return;
    if (p.held) {
      this._mouseRay();
      const pt = this.raycaster.ray.intersectPlane(p.plane, _v);
      if (pt) p.holder.position.copy(pt);
      p.holder.updateMatrixWorld(true);
      return;
    }
    if (p.dragLook) return;
    this._mouseRay();
    const hit = this._pickInteractive(this.raycaster);
    this._setHover(p, hit);
    this.dom.style.cursor = hit ? 'pointer' : this._pickGrabbable(this.raycaster, 8) ? 'grab' : 'default';
  }

  _updateFalling(dt) {
    for (const obj of [...this.falling]) {
      const g = obj.userData.grab, home = g.home || this.defaultHome;
      const lp = obj.position;
      if (obj.userData.settling < 1) {
        // find the surface under the object
        let top = g.floorY ?? 0;
        for (const f of this.supports) { const y = f(lp, obj); if (y !== null && y !== undefined && y <= lp.y + 0.15 && y > top) top = y; }
        const rest = top + (g.restOffset || 0);
        obj.userData.vel = (obj.userData.vel || 0) - 9.8 * dt;
        lp.y += obj.userData.vel * dt;
        if (lp.y <= rest) { lp.y = rest; obj.userData.vel = 0; obj.userData.settling = 0.001; obj.userData.restTop = top; }
      } else if (obj.userData.settling >= 1) { this.falling.delete(obj); g.onSettle?.(obj); continue; }
      if (obj.userData.settling > 0) {
        // ease orientation to a natural resting pose
        obj.userData.settling = Math.min(1, obj.userData.settling + dt * 3);
        if (g.rest === 'flat' || g.rest === 'upright') {
          _e.setFromQuaternion(obj.quaternion, 'YXZ');
          const target = g.rest === 'flat' ? _q.setFromEuler(_e.set(-Math.PI / 2, _e.y, 0, 'YXZ')) : _q.setFromEuler(_e.set(0, _e.y, 0, 'YXZ'));
          obj.quaternion.slerp(target, 1 - Math.exp(-14 * dt));
        }
      }
    }
  }

  /** Where a hand/controller currently is (for placing panels etc). */
  activeHandPositions() {
    return this.pointers.filter((p) => p.kind === 'xr' && p.connected).map((p) => p.controller.getWorldPosition(new THREE.Vector3()));
  }
}
