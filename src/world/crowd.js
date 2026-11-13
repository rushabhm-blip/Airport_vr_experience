import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { buildPeopleGeometries, faceAtlas } from './peopleparts.js';
import { GlbPeople } from './glbcrowd.js';
import { shadowTextures } from './realism3d.js';

/**
 * An airport crowd: walkers, runners, people waiting in queues, people seated or standing with luggage, families with children and
 * trolleys. Every person is built from the same small set of body parts, and each part is ONE instanced mesh for the whole crowd,
 * so a hundred people cost about eighteen draw calls. Walking has swinging arms and legs with bent knees, queues shuffle forward
 * and serve people at the counter, and seated people bend at the hips and knees.
 *
 * Person space: y up, forward = +z, hips at 0.9 m, height about 1.7 m. A person at (x, z) with yaw faces (sin yaw, cos yaw).
 */
const PARTS = ['torso', 'head', 'hair', 'skirt', 'thighL', 'thighR', 'shinL', 'shinR', 'shoeL', 'shoeR', 'armL', 'armR', 'handL', 'handR', 'suitcase', 'handle', 'pack', 'cart'];

const SKIN = [0xf0c9a6, 0xdcae86, 0xc78d5f, 0xa96f47, 0x8b5a3b, 0x6d4529];
const HAIR = [0x15110d, 0x241a12, 0x3a2a1d, 0x1a1a1a, 0x6e6e6e, 0xb9b9b9, 0xd8d8d8];
const SHIRT = [0xc2573a, 0x2f6f9f, 0x7aa05a, 0xd8b04a, 0x8a5a9b, 0xe9e4da, 0x395a5a, 0xb03a48, 0x4b8f8a, 0xe8c9a0, 0x3d4f91, 0xf3f0e8, 0x7a8c3a, 0xd97b3c];
const TROUSER = [0x2b3040, 0x3a3f4c, 0x57534b, 0x1f2630, 0x6b5a45, 0x41556b, 0x2a2a2a];
const SAREE = [0xc0392b, 0x1f8a70, 0x2c5aa0, 0xe0a030, 0x8e3a7a, 0xd45a8a, 0x138d90];
const BAGS = [0x1d3557, 0x7a1f2b, 0x2b2b2b, 0x1f6f5a, 0xb5651d, 0x4a4a8a, 0x8a8a8a, 0xe07a3a];

const rngOf = (seed) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));

function geometries() {
  const cap = (r, l, y = 0) => new THREE.CapsuleGeometry(r, l, 2, 7).translate(0, y, 0);
  const cart = mergeGeometries([
    new THREE.BoxGeometry(0.56, 0.04, 0.9).translate(0, 0.22, 0), new THREE.BoxGeometry(0.56, 0.03, 0.04).translate(0, 0.9, -0.42),
    new THREE.BoxGeometry(0.03, 0.7, 0.03).translate(-0.27, 0.57, -0.42), new THREE.BoxGeometry(0.03, 0.7, 0.03).translate(0.27, 0.57, -0.42),
    new THREE.BoxGeometry(0.5, 0.03, 0.03).translate(0, 0.62, 0.43), new THREE.BoxGeometry(0.5, 0.45, 0.02).translate(0, 0.45, 0.44),
    new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8).rotateZ(Math.PI / 2).translate(-0.28, 0.06, 0.34), new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8).rotateZ(Math.PI / 2).translate(0.28, 0.06, 0.34),
    new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8).rotateZ(Math.PI / 2).translate(-0.28, 0.06, -0.34), new THREE.CylinderGeometry(0.06, 0.06, 0.04, 8).rotateZ(Math.PI / 2).translate(0.28, 0.06, -0.34),
  ].map((g) => g.toNonIndexed()));
  return {
    torso: cap(0.15, 0.34, 1.15).scale(1.28, 1, 0.78),
    head: new THREE.SphereGeometry(0.112, 9, 7).translate(0, 1.6, 0.01),
    hair: new THREE.SphereGeometry(0.12, 9, 5, 0, Math.PI * 2, 0, Math.PI * 0.62).translate(0, 1.63, -0.012),
    skirt: new THREE.CylinderGeometry(0.17, 0.3, 0.82, 10, 1, true).translate(0, -0.41, 0),
    thighL: cap(0.08, 0.34, -0.26), thighR: cap(0.08, 0.34, -0.26),
    shinL: cap(0.064, 0.34, -0.26), shinR: cap(0.064, 0.34, -0.26),
    shoeL: new THREE.BoxGeometry(0.1, 0.07, 0.27).translate(0, -0.03, 0.06), shoeR: new THREE.BoxGeometry(0.1, 0.07, 0.27).translate(0, -0.03, 0.06),
    armL: cap(0.052, 0.4, -0.27), armR: cap(0.052, 0.4, -0.27),
    handL: new THREE.SphereGeometry(0.052, 5, 4), handR: new THREE.SphereGeometry(0.052, 5, 4),
    suitcase: new THREE.BoxGeometry(0.42, 0.62, 0.25).translate(0, 0.31, 0),
    handle: new THREE.BoxGeometry(0.03, 0.4, 0.03).translate(0, 0.62, 0),
    pack: new THREE.BoxGeometry(0.3, 0.4, 0.15).translate(0, 0, 0),
    cart,
  };
}

export class Crowd {
  constructor({ capacity = 70, seed = 7, density = 1, nearMax = 36, nearR = 15, detailed = true, glb = null } = {}) {
    if (density < 0.7) { nearMax = Math.min(nearMax, 14); nearR = Math.min(nearR, 9.5); }      // on a headset: fewer detailed people, and only the closest
    this.group = new THREE.Group(); this.group.name = 'Crowd';
    this.pace = 0.45; this.people = []; this.queues = []; this.cap = capacity; this.density = density; this.rng = rngOf(seed); this.time = 0;
    const geos = geometries(), mat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    this.meshes = {};
    { const T = shadowTextures(); this.shadow = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: T.round, transparent: true, opacity: 0.8, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }), capacity); this.shadow.frustumCulled = false; this.shadow.renderOrder = -1; this.shadow.name = 'crowd-shadow'; this.group.add(this.shadow); this._sm = new THREE.Matrix4(); }
    for (const p of PARTS) {
      const m = new THREE.InstancedMesh(geos[p], mat, capacity * (p === 'cart' ? 1 : 1));
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(capacity * 3).fill(1), 3);
      m.count = 0; m.frustumCulled = false; m.castShadow = false; m.name = 'crowd-' + p; this.group.add(m); this.meshes[p] = m;
    }
    this.nearR = nearR; if (detailed) this._initDetail(nearMax);
    if (glb) this.glb = new GlbPeople(this.group, glb);                     // real characters for the people nearest to you
    this._m = new THREE.Matrix4(); this._b = new THREE.Matrix4(); this._l = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._e = new THREE.Euler(); this._v = new THREE.Vector3(); this._s = new THREE.Vector3(); this._c = new THREE.Color();
  }

  pick(arr) { return arr[(this.rng() * arr.length) | 0]; }

  /** Create a person (not yet moving). opts: scale, female, elder, bag ('roll'|'pack'|'cart'|null), x, z, yaw. */
  _make(o = {}) {
    if (this.people.length >= this.cap) return null;
    const r = this.rng, female = o.female ?? r() < 0.45, child = !!o.child, elder = o.elder ?? r() < 0.28;
    const p = {
      x: o.x ?? 0, z: o.z ?? 0, yaw: o.yaw ?? 0, y: o.y ?? 0, scale: child ? 0.6 + r() * 0.06 : (female ? 0.93 : 1) * (0.95 + r() * 0.1),
      female, child, mode: 'idle', phase: r() * 6.28, speed: 1.15, run: false, t: r() * 5, bag: o.bag ?? null, bagColor: this.pick(BAGS), pose: o.pose ?? null,
      skin: this.pick(SKIN), shirt: this.pick(SHIRT), trouser: this.pick(TROUSER), dress: female && !child && r() < 0.4 ? this.pick(SAREE) : 0,
      hair: elder ? this.pick(HAIR.slice(4)) : this.pick(HAIR.slice(0, 4)), shoe: 0x1c1c1e, stride: 0, onDone: null, path: null, pi: 0, leader: null, offset: null, idx: -1, spin: r() * 6,
    };
    p.skinIdx = Math.max(0, SKIN.indexOf(p.skin)); p.hairIdx = Math.max(0, HAIR.indexOf(p.hair)); p.seedA = (r() * 4294967295) >>> 0; p.vNow = 0;
    p.idx = this.people.length; this.people.push(p);
    for (const k of PARTS) this.meshes[k].count = Math.max(this.meshes[k].count, p.idx + 1);
    // colours (fixed per person)
    const set = (part, hex) => this.meshes[part].setColorAt(p.idx, this._c.set(hex));
    const sk = p.skin;
    set('torso', p.child ? this.pick(SHIRT) : p.shirt); set('head', sk); set('hair', p.hair); set('skirt', p.dress || 0x000000);
    const leg = p.dress ? sk : p.trouser; set('thighL', leg); set('thighR', leg); set('shinL', leg); set('shinR', leg);
    set('shoeL', p.shoe); set('shoeR', p.shoe); set('armL', p.dress ? sk : p.shirt); set('armR', p.dress ? sk : p.shirt); set('handL', sk); set('handR', sk);
    set('suitcase', p.bagColor); set('handle', 0x9aa0a6); set('pack', p.bagColor); set('cart', 0xb9c0c6);
    for (const k of PARTS) this.meshes[k].instanceColor.needsUpdate = true;
    return p;
  }

  // ------------------------------------------------------------------ the kinds of people
  /** Someone who walks a loop of waypoints [[x,z],...]. */
  walker(path, { speed = 1.2, run = false, bag = null, child = false, elder, female, offset = 0 } = {}) {
    if (this.rng() > this.density) return null;
    const p = this._make({ x: path[0][0], z: path[0][1], bag, child, elder, female }); if (!p) return null;
    p.mode = 'loop'; p.path = path; p.speed = speed * (0.9 + this.rng() * 0.2); p.run = run; p.pi = 1 % path.length;
    let k = offset; while (k-- > 0) { p.pi = (p.pi + 1) % path.length; }
    if (offset) { const a = path[p.pi]; p.x = a[0]; p.z = a[1]; }
    return p;
  }
  /** Someone standing still (optionally on a phone) facing yaw. */
  stander(x, z, yaw, { bag = null, phone = false, child = false, elder, female, talkTo = null } = {}) {
    if (this.rng() > this.density) return null;
    const p = this._make({ x, z, yaw, bag, child, elder, female }); if (!p) return null; p.mode = 'idle'; p.pose = phone ? 'phone' : (talkTo ? 'talk' : 'stand'); return p;
  }
  /** Someone sitting. (x, z) is where the seat is; y is the seat height reference (floor of the seat). */
  sitter(x, z, yaw, { bag = null, phone = false, child = false, elder, female, y = 0 } = {}) {
    if (this.rng() > this.density) return null;
    const p = this._make({ x, z, yaw, y, bag, child, elder, female }); if (!p) return null; p.mode = 'sit'; p.pose = phone ? 'phone' : 'sit'; return p;
  }
  /** A child (or second person) who follows a leader at an offset. */
  follower(leader, ox, oz, { child = true, bag = null } = {}) {
    if (!leader) return null;
    const p = this._make({ x: leader.x + ox, z: leader.z + oz, child, bag }); if (!p) return null; p.mode = 'follow'; p.leader = leader; p.offset = [ox, oz]; p.speed = leader.speed; return p;
  }
  /** A line of people waiting for a counter. slots[0] is the front. face is the yaw they face. Every `interval` seconds the front person is served and leaves. */
  queue(slots, face, { n = slots.length, interval = 14, exit, entry, bagRate = 0.6 } = {}) {
    const q = { slots, face, members: [], interval: interval * (0.8 + this.rng() * 0.5), timer: this.rng() * interval, exit: exit || [slots[0][0] + 6, slots[0][1]], entry: entry || [slots[slots.length - 1][0] + 6, slots[slots.length - 1][1]] };
    for (let i = 0; i < Math.min(n, slots.length); i++) {
      if (this.rng() > this.density && i > 1) continue;
      const p = this._make({ x: slots[i][0], z: slots[i][1], yaw: face, bag: this.rng() < bagRate ? (this.rng() < 0.7 ? 'roll' : 'pack') : null }); if (!p) break;
      p.mode = 'queue'; p.q = q; q.members.push(p); p.pose = this.rng() < 0.3 ? 'phone' : 'stand';
    }
    this.queues.push(q); return q;
  }
  /** A person pushing a luggage trolley along a loop. */
  trolley(path, opts = {}) { const p = this.walker(path, { ...opts, speed: opts.speed ?? 1.0 }); if (p) p.bag = 'cart'; return p; }

  // ------------------------------------------------------------------ movement
  _go(p, tx, tz, v, dt) {
    v *= this.pace;                                       // a calm pace for VR: people walk slower than in real life so you can take them in
    const dx = tx - p.x, dz = tz - p.z, d = Math.hypot(dx, dz);
    if (d < 0.06) return true;
    p.vNow = v;
    const step = Math.min(d, v * dt);
    p.x += (dx / d) * step; p.z += (dz / d) * step;
    p.yaw += wrapPi(Math.atan2(dx, dz) - p.yaw) * Math.min(1, dt * 7);
    p.stride = Math.min(1, v / 1.2) * (p.run ? 1.5 : 1);
    p.phase += v * dt * (p.child ? 3.4 : 2.5) * (p.run ? 0.85 : 1);
    return false;
  }

  _step(p, dt) {
    p.t += dt; p.stride = 0; p.vNow = 0;
    switch (p.mode) {
      case 'loop': {
        const a = p.path[p.pi]; if (this._go(p, a[0], a[1], p.speed * (p.run ? 2.6 : 1), dt)) p.pi = (p.pi + 1) % p.path.length;
        break;
      }
      case 'path': {
        if (p.wait > 0) { p.wait -= dt; break; }
        const a = p.path[p.pi]; if (this._go(p, a[0], a[1], p.speed, dt)) { p.pi++; if (p.pi >= p.path.length) { const f = p.onDone; p.onDone = null; p.mode = 'idle'; f?.(); } }
        break;
      }
      case 'queue': {
        const i = p.q.members.indexOf(p); const s = p.q.slots[Math.min(i, p.q.slots.length - 1)];
        if (this._go(p, s[0], s[1], 1.0, dt)) p.yaw += wrapPi(p.q.face - p.yaw) * Math.min(1, dt * 5);
        break;
      }
      case 'follow': {
        const L = p.leader, c = Math.cos(L.yaw), s = Math.sin(L.yaw), tx = L.x + c * p.offset[0] + s * p.offset[1], tz = L.z - s * p.offset[0] + c * p.offset[1];
        const moving = Math.hypot(tx - p.x, tz - p.z) > 0.12; if (moving) this._go(p, tx, tz, Math.max(0.6, L.speed * 1.25), dt); else p.yaw += wrapPi(L.yaw - p.yaw) * Math.min(1, dt * 4);
        break;
      }
      default: break;
    }
  }

  _updateQueues(dt) {
    for (const q of this.queues) {
      q.timer += dt; if (q.timer < q.interval || !q.members.length) continue; q.timer = 0;
      const f = q.members.shift(), s0 = q.slots[0], fx = Math.sin(q.face), fz = Math.cos(q.face);
      f.mode = 'path'; f.speed = 1.0; f.pose = 'stand';
      f.path = [[s0[0] + fx * 1.0, s0[1] + fz * 1.0]]; f.pi = 0; f.wait = 0;                    // step up to the counter
      f.onDone = () => { f.wait = 3 + this.rng() * 2; f.path = [q.exit]; f.pi = 0; f.speed = 1.3; f.onDone = () => { f.path = [q.entry, q.slots[q.slots.length - 1]]; f.pi = 0; f.speed = 1.3; f.onDone = () => { f.mode = 'queue'; q.members.push(f); }; f.mode = 'path'; }; f.mode = 'path'; };
    }
  }

  // ------------------------------------------------------------------ drawing
  _pose(p) {
    const T = p.t, s = p.scale, o = { drop: 0, thigh: [0, 0], knee: [0, 0], arm: [0, 0], lean: 0, bob: 0, head: 0, sway: 0 };
    const sw = Math.sin(p.phase), amp = (p.run ? 0.95 : 0.5) * p.stride;
    if (p.mode === 'sit') {
      o.drop = 0.35 * s; o.thigh = [1.5, 1.5]; o.knee = [1.5, 1.5]; o.lean = -0.04;
      if (p.pose === 'phone') o.arm = [1.25, 1.1]; else o.arm = [0.5, 0.55];
      o.head = Math.sin(T * 0.4 + p.spin) * 0.15; return o;
    }
    if (p.stride > 0.05) {
      o.thigh = [sw * amp, -sw * amp]; o.knee = [0.12 + 0.75 * Math.max(0, -Math.cos(p.phase)) * p.stride, 0.12 + 0.75 * Math.max(0, Math.cos(p.phase)) * p.stride];
      o.arm = [-sw * amp * 0.85, sw * amp * 0.85]; o.lean = p.run ? -0.2 : -0.04; o.bob = Math.abs(sw) * 0.035 * p.stride * (p.run ? 1.8 : 1);
      if (p.bag === 'roll') o.arm[0] = -0.45; if (p.bag === 'cart') o.arm = [0.95, 0.95];
      o.head = 0; return o;
    }
    o.sway = Math.sin(T * 0.8 + p.spin) * 0.012; o.knee = [0.04, 0.04];
    if (p.pose === 'phone') { o.arm = [0.1, 1.35]; o.head = 0.2; }
    else if (p.pose === 'talk') { o.arm = [0.2, 0.8 + Math.sin(T * 3 + p.spin) * 0.25]; o.head = Math.sin(T * 0.7 + p.spin) * 0.3; }
    else { o.arm = [0.06, 0.06]; o.head = Math.sin(T * 0.35 + p.spin) * 0.4; if (p.bag === 'roll') o.arm[0] = -0.4; }
    o.thigh = [Math.sin(T * 0.5 + p.spin) * 0.03, 0]; return o;
  }

  _put(part, idx, M) { this.meshes[part].setMatrixAt(idx, M); }

  _draw(p) {
    const o = this._pose(p), s = p.scale, i = p.idx, B = this._b, L = this._l, M = this._m, V = this._v;
    B.compose(V.set(p.x, p.y + o.bob * s - o.drop, p.z), this._q.setFromEuler(this._e.set(o.lean, p.yaw, o.sway, 'YXZ')), this._s.set(s, s, s));
    const put = (part, ox, oy, oz, rx = 0, sx = 1, sy = 1) => { L.makeRotationX(rx); L.setPosition(ox, oy, oz); M.multiplyMatrices(B, L); if (sx !== 1 || sy !== 1) { M.scale(V.set(sx, sy, 1)); } this._put(part, i, M); };
    // torso, head, hair
    put('torso', 0, 0, 0); put('head', 0, 0, 0, 0); put('hair', 0, 0, 0);
    if (p.dress) { L.makeRotationX(0); L.setPosition(0, 0.98, 0); M.multiplyMatrices(B, L); if (p.mode === 'sit') M.scale(V.set(0.82, 0.42, 1.0)); this._put('skirt', i, M); } else this._hide('skirt', i);
    // legs: thigh pivots at the hip, the shin at the knee
    const hip = 0.9, thighLen = 0.45;
    for (const [side, sx] of [['L', -0.09], ['R', 0.09]]) {
      const a = o.thigh[side === 'L' ? 0 : 1], k = o.knee[side === 'L' ? 0 : 1];
      L.makeRotationX(-a); L.setPosition(sx, hip, 0); const T1 = this._tmp1 || (this._tmp1 = new THREE.Matrix4()); T1.multiplyMatrices(B, L);
      this._put('thigh' + side, i, T1);
      L.makeRotationX(k); L.setPosition(0, -thighLen, 0); const T2 = this._tmp2 || (this._tmp2 = new THREE.Matrix4()); T2.multiplyMatrices(T1, L);
      this._put('shin' + side, i, T2);
      L.makeRotationX(0); L.setPosition(0, -0.46, 0); M.multiplyMatrices(T2, L); this._put('shoe' + side, i, M);
    }
    // arms and hands: pivot at the shoulders
    for (const [side, sx] of [['L', -0.22], ['R', 0.22]]) {
      const a = o.arm[side === 'L' ? 0 : 1];
      L.makeRotationX(-a); L.setPosition(sx, 1.4, 0.0); const A = this._tmp3 || (this._tmp3 = new THREE.Matrix4()); A.multiplyMatrices(B, L);
      this._put('arm' + side, i, A);
      L.makeRotationX(0); L.setPosition(0, -0.49, 0); M.multiplyMatrices(A, L); this._put('hand' + side, i, M);
    }
    // luggage
    const none = (part) => this._hide(part, i);
    if (p.bag === 'roll') {
      const bx = -0.3, bz = -0.44;
      L.makeRotationX(0.26); L.setPosition(bx, 0, bz); M.multiplyMatrices(B, L); this._put('suitcase', i, M);
      L.setPosition(bx, 0, bz); M.multiplyMatrices(B, L); this._put('handle', i, M); none('pack'); none('cart');
    } else if (p.bag === 'pack') { L.makeRotationX(0.05); L.setPosition(0, 1.2, -0.17); M.multiplyMatrices(B, L); this._put('pack', i, M); none('suitcase'); none('handle'); none('cart'); }
    else if (p.bag === 'cart') {
      L.makeRotationX(0); L.setPosition(0, 0, 0.62); M.multiplyMatrices(B, L); this._put('cart', i, M);
      L.setPosition(0.0, 0.24, 0.62); M.multiplyMatrices(B, L); this._put('suitcase', i, M); none('handle'); none('pack');
    } else { none('suitcase'); none('handle'); none('pack'); none('cart'); }
    // head tilt (look around or down at a phone): a small turn of the head group around the neck
    if (o.head) { L.makeRotationY(o.head); const H = this._tmp4 || (this._tmp4 = new THREE.Matrix4()); H.copy(B).multiply(L); this._put('head', i, H); this._put('hair', i, H); }
  }

  _hide(part, i) { this._zero = this._zero || new THREE.Matrix4().makeScale(0, 0, 0); this.meshes[part].setMatrixAt(i, this._zero); }

  // ================================================================== DETAILED PEOPLE (those near the camera)
  _initDetail(nearMax) {
    const G = buildPeopleGeometries(); this.G = G;
    const mirror = (geo) => {                                  // a left hand: flip x and turn the triangles round so they face out
      const g = geo.clone(); g.scale(-1, 1, 1);
      for (const k of ['position', 'normal', 'uv', 'color']) {
        const a = g.attributes[k]; if (!a) continue; const s = a.itemSize;
        for (let i = 0; i + 2 < a.count; i += 3) for (let c = 0; c < s; c++) { const t = a.array[(i + 1) * s + c]; a.array[(i + 1) * s + c] = a.array[(i + 2) * s + c]; a.array[(i + 2) * s + c] = t; }
      }
      return g;
    };
    const handL = mirror(G.hand);
    const geo = { torso: G.torso, neck: G.neck, head: G.head, face: G.face, nose: G.nose, ears: G.ears, hairS: G.hairS, hairL: G.hairL, hairB: G.hairB, glasses: G.glasses,
      armUL: G.armU, armUR: G.armU, foreL: G.foreA, foreR: G.foreA, handL, handR: G.hand, thighL: G.thigh, thighR: G.thigh, shinL: G.shin, shinR: G.shin, shoeL: G.shoe, shoeR: G.shoe,
      saree: G.saree, kurta: G.kurta, pallu: G.pallu, collar: G.collar, belt: G.belt, suitcase: G.suitcase, pack: G.pack, cart: G.cart, phone: G.phone };
    this.dparts = Object.keys(geo); this.dn = nearMax; this.dmeshes = {}; this.slotOwner = new Array(nearMax).fill(null);
    const body = new THREE.MeshLambertMaterial({ color: 0xffffff, vertexColors: true });
    const atlas = faceAtlas();
    const faceMat = new THREE.MeshBasicMaterial({ map: atlas, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 });
    faceMat.onBeforeCompile = (sh) => { sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec2 faceOff;').replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv += faceOff;\n#endif'); };
    for (const k of this.dparts) {
      const g = k === 'face' ? G.face : geo[k];
      const m = new THREE.InstancedMesh(g, k === 'face' ? faceMat : body, nearMax);
      m.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(nearMax * 3).fill(1), 3); m.count = 0; m.frustumCulled = false; m.name = 'crowd3d-' + k;
      if (k === 'face') m.geometry.setAttribute('faceOff', new THREE.InstancedBufferAttribute(new Float32Array(nearMax * 2), 2));
      this.group.add(m); this.dmeshes[k] = m;
    }
    this._dm = [0, 1, 2, 3, 4, 5].map(() => new THREE.Matrix4());
    this._cam = new THREE.Vector3(); this._rx = new THREE.Matrix4();
  }

  /** Per-person look for the detailed model: hair, outfit, glasses, face, sleeves. */
  _look(p) {
    const r = this.rng, f = p.female;
    p.hairStyle = p.child ? 'S' : f ? (r() < 0.5 ? 'L' : r() < 0.6 ? 'B' : 'S') : 'S';
    p.outfit = p.dress ? 'saree' : (!p.child && r() < (f ? 0.25 : 0.2) ? 'kurta' : 'pant');
    p.glasses = !p.child && r() < (p.elder ? 0.5 : 0.18); p.face = (r() * 8) | 0; p.longSleeve = r() < 0.4; p.kurtaCol = this.pick(SAREE.concat(SHIRT.slice(0, 6)));
    p.shoeCol = this.pick([0x1c1c1e, 0x3a2a1d, 0xf0f0f0, 0x2a3a5a, 0x5a4a3a, 0x8a2a2a]);
  }

  _colorsD(p, k) {
    const c = this._c, set = (part, hex) => { this.dmeshes[part].setColorAt(k, c.set(hex)); }, sk = p.skin, sh = p.outfit === 'kurta' ? p.kurtaCol : p.shirt;
    const skDark = c.set(sk).multiplyScalar(0.93).getHex();
    set('torso', p.outfit === 'saree' ? p.dress : sh); set('neck', sk); set('head', sk); set('face', 0xffffff); set('nose', skDark); set('ears', sk);
    set('hairS', p.hair); set('hairL', p.hair); set('hairB', p.hair); set('glasses', 0x2a2a2e);
    set('armUL', p.outfit === 'saree' ? p.dress : sh); set('armUR', p.outfit === 'saree' ? p.dress : sh);
    const fore = p.longSleeve && p.outfit !== 'saree' ? sh : sk; set('foreL', fore); set('foreR', fore); set('handL', sk); set('handR', sk);
    const leg = p.outfit === 'saree' ? p.dress : p.trouser; set('thighL', leg); set('thighR', leg); set('shinL', leg); set('shinR', leg); set('shoeL', p.shoeCol); set('shoeR', p.shoeCol);
    set('saree', p.dress); set('kurta', p.kurtaCol); set('pallu', c.set(p.dress).multiplyScalar(1.15).getHex()); set('collar', sh); set('belt', 0x2a2a2a);
    set('suitcase', p.bagColor); set('pack', p.bagColor); set('cart', 0xffffff); set('phone', 0xffffff);
    const fo = this.dmeshes.face.geometry.attributes.faceOff; fo.setXY(k, (p.face % 4) * 0.25, (p.face >> 2) * 0.5); fo.needsUpdate = true;
    for (const part of this.dparts) this.dmeshes[part].instanceColor.needsUpdate = true;
  }

  _hideD(part, k) { this._zero = this._zero || new THREE.Matrix4().makeScale(0, 0, 0); this.dmeshes[part].setMatrixAt(k, this._zero); }

  _drawDetail(p, k, o, realBody = false) {
    const s = p.scale, B = this._b, L = this._l, V = this._v, D = this.dmeshes, [M1, M2, M3, M4, M5, M6] = this._dm;
    B.compose(V.set(p.x, p.y + o.bob * s - o.drop, p.z), this._q.setFromEuler(this._e.set(o.lean, p.yaw, o.sway, 'YXZ')), this._s.set(s, s, s));
    const put = (part, M) => D[part].setMatrixAt(k, M);
    put('torso', B); put('neck', B);
    const saree = p.outfit === 'saree', kurta = p.outfit === 'kurta';
    if (saree) { put('saree', B); put('pallu', B); } else { this._hideD('saree', k); this._hideD('pallu', k); }
    kurta ? put('kurta', B) : this._hideD('kurta', k);
    if (p.outfit === 'pant') { put('collar', B); put('belt', B); } else { this._hideD('collar', k); this._hideD('belt', k); }
    // head group (turns a little to look around): face, ears, nose and hair
    L.makeRotationY(o.head); M1.multiplyMatrices(B, L);
    put('head', M1); put('face', M1); put('nose', M1); put('ears', M1);
    for (const hs of ['S', 'L', 'B']) p.hairStyle === hs ? put('hair' + hs, M1) : this._hideD('hair' + hs, k);
    p.glasses ? put('glasses', M1) : this._hideD('glasses', k);
    // arms: shoulder -> elbow -> wrist
    const elbow = o.elbow, armD = o.armD;
    for (const [side, sx] of [['L', -0.195], ['R', 0.195]]) {
      const i = side === 'L' ? 0 : 1;
      L.makeTranslation(sx, 1.405, 0); M2.multiplyMatrices(B, L); L.makeRotationX(-armD[i]); M2.multiply(L); put('armU' + side, M2);
      L.makeTranslation(0, -0.285, 0); M3.multiplyMatrices(M2, L); L.makeRotationX(-elbow[i]); M3.multiply(L); put('fore' + side, M3);
      L.makeTranslation(0, -0.268, 0); M4.multiplyMatrices(M3, L); put('hand' + side, M4);
      if (side === 'R' && p.pose === 'phone') { L.makeTranslation(0, -0.07, 0.03); L.multiply(this._rx.makeRotationX(0.35)); M6.multiplyMatrices(M4, L); put('phone', M6); } else if (side === 'R') this._hideD('phone', k);
    }
    // legs: hip -> knee -> ankle (the shoe is kept flat)
    for (const [side, sx] of [['L', -0.09], ['R', 0.09]]) {
      const i = side === 'L' ? 0 : 1, a = o.thigh[i], kn = o.knee[i];
      L.makeTranslation(sx, 0.92, 0); M2.multiplyMatrices(B, L); L.makeRotationX(-a); M2.multiply(L); put('thigh' + side, M2);
      L.makeTranslation(0, -0.44, 0); M3.multiplyMatrices(M2, L); L.makeRotationX(kn); M3.multiply(L); put('shin' + side, M3);
      L.makeTranslation(0, -0.415, 0); M4.multiplyMatrices(M3, L); L.makeRotationX(a - kn); M4.multiply(L); put('shoe' + side, M4);
    }
    // luggage
    const none = (part) => this._hideD(part, k);
    if (p.bag === 'roll') {
      const bx = -0.3, bz = -0.44;
      L.makeRotationX(0.26); L.setPosition(bx, 0, bz); M5.multiplyMatrices(B, L); put('suitcase', M5); none('pack'); none('cart');
    } else if (p.bag === 'pack') { L.makeRotationX(0.05); L.setPosition(0, 1.2, -0.17); M5.multiplyMatrices(B, L); put('pack', M5); none('suitcase'); none('cart'); }
    else if (p.bag === 'cart') {
      L.makeRotationX(0); L.setPosition(0, 0, 0.62); M5.multiplyMatrices(B, L); put('cart', M5); L.setPosition(0, 0.24, 0.62); M6.multiplyMatrices(B, L); put('suitcase', M6); none('pack');
    } else { none('suitcase'); none('pack'); none('cart'); }
    if (realBody) for (const part of this.dparts) if (part !== 'suitcase' && part !== 'pack' && part !== 'cart') this._hideD(part, k);      // a real character is drawn instead of the built one; only the luggage stays
  }

  /** The arms of the detailed model: where the shoulder and the elbow bend for this activity (the simple model keeps o.arm). */
  _poseD(p, o) {
    const a = o.arm, w = p.stride > 0.05;
    o.armD = [a[0], a[1]]; o.elbow = [0.2, 0.2];
    if (p.mode === 'sit') { o.armD = [0.22, p.pose === 'phone' ? 0.5 : 0.22]; o.elbow = [0.95, p.pose === 'phone' ? 1.75 : 0.95]; }
    else if (w) { o.elbow = [0.3 + 0.45 * Math.max(0, a[0]), 0.3 + 0.45 * Math.max(0, a[1])]; if (p.bag === 'roll') { o.armD[0] = -0.5; o.elbow[0] = 0.2; } if (p.bag === 'cart') { o.armD = [0.45, 0.45]; o.elbow = [0.55, 0.55]; } }
    else if (p.pose === 'phone') { o.armD = [0.08, 0.55]; o.elbow = [0.15, 1.95]; }
    else if (p.pose === 'talk') { o.armD = [0.15, 0.45 + Math.sin(p.t * 3 + p.spin) * 0.2]; o.elbow = [0.25, 1.2 + Math.sin(p.t * 2.5 + p.spin) * 0.3]; }
    return o;
  }

  /** Frame update with LOD: the nearest people get the detailed model, everyone else the simple one. */
  update(dt, camera = null) {
    dt = Math.min(dt, 0.1); this.time += dt;
    this._updateQueues(dt);
    let near = 0; const R2 = (this.nearR ?? 15) ** 2, detail = !!this.dmeshes && !!camera;
    if (detail) { camera.getWorldPosition(this._cam); this.group.worldToLocal(this._cam); this.glb?.assign(this.people, this._cam); }
    for (const p of this.people) {
      this._step(p, dt);
      const d2 = detail ? (p.x - this._cam.x) ** 2 + (p.z - this._cam.z) ** 2 + ((p.y - this._cam.y + 1.4) ** 2) * 0.3 : Infinity;
      if (d2 < R2 && near < this.dn) {
        if (!p.looked) { this._look(p); p.looked = true; }
        const k = near++;
        if (this.slotOwner[k] !== p) { this.slotOwner[k] = p; this._colorsD(p, k); }
        this._drawDetail(p, k, this._poseD(p, this._pose(p)), !!p.glb);
        if (!p.hidFar) { for (const part of PARTS) this._hide(part, p.idx); p.hidFar = true; }
      } else { p.hidFar = false; this._draw(p); }
    }
    if (this.dmeshes) for (const k of this.dparts) { const m = this.dmeshes[k]; m.count = near; m.instanceMatrix.needsUpdate = true; }
    this.glb?.update(dt);
    { let n = 0; for (const p of this.people) { if (p.mode === 'sit') continue; const r = 0.62 * p.scale; this._sm.makeScale(r * 2, 1, r * 2).setPosition(p.x, p.y + 0.012, p.z); this.shadow.setMatrixAt(n++, this._sm); } this.shadow.count = n; this.shadow.instanceMatrix.needsUpdate = true; }
    for (const k of PARTS) this.meshes[k].instanceMatrix.needsUpdate = true;
  }

  dispose() { this.glb?.dispose(); for (const m of [...Object.values(this.meshes), ...Object.values(this.dmeshes || {})]) { m.geometry.dispose(); } this.group.removeFromParent(); }
}
