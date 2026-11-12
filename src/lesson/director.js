import * as THREE from 'three';
import { Panel } from '../ui/panel.js';
import { PRACTICE as P } from '../config.js';
import { Tweens, wrapAngle, damp, disposeObject } from '../util.js';
import { STEPS, STEP_IDS, OPTIONAL_STEPS } from './steps.js';
import { Staff } from '../world/staff.js';
import { Phone } from '../world/phone.js';
import { Presentation } from './presentation.mjs';
import { JourneyLog } from './journey-log.mjs';
import { cardScale, CARD } from './rules.mjs';
import { Stage } from '../world/stage.js';
const Stage_VIEWER = Stage.VIEWER;

const _v = new THREE.Vector3(), _v2 = new THREE.Vector3();
const store = { get: (k, d) => { try { const v = localStorage.getItem(k); return v === null ? d : Number(v) || d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(k, String(v)); } catch { /* private mode */ } } };

/**
 * Runs the airport rehearsal. Owns the single guide/caption surface, the practice flight state (kept separate from what is printed
 * on the boarding pass), the phone, and per-step set-up/tear-down. A presentation coordinator decides which surfaces may be
 * visible and which inputs are live, so there is never more than one primary surface.
 */
export class Director {
  constructor(app) {
    this.app = app;
    this.stage = app.stage; this.input = app.input; this.assets = app.assets; this.voice = app.voice;
    this.tweens = new Tweens();
    // A narrower card keeps the same text size but covers less of the view (see rules.mjs CARD).
    this.panel = new Panel({ width: CARD.designWidth * CARD.pxWidth / CARD.designPx, pxW: CARD.pxWidth });
    this.panel.onSelect = (id) => this.onPanel(id);
    this.panel.calm = () => this.app.phase === 'lesson';   // calm: no eyebrow, short text, at most three buttons
    this.panel.mesh.userData.system = true;
    this.stage.root.add(this.panel.mesh);
    this.input.addInteractive(this.panel.mesh);
    this.obstacles = [];
    // Distance and text size are independent settings.
    this.cardDist = store.get('saath.cardDist', CARD.baseDist);
    this.textK = store.get('saath.textK', 1);
    this.followers = new Map();   // card mesh -> {yaw, dist, dy, scale, a, p}
    this.headPitch = 0;
    this.index = -1; this.step = null; this.paused = false; this.snapshot = null;
    this.surfaces = []; this.cleanups = []; this.attempts = 0; this.noteTimer = 0;
    this.headLocal = new THREE.Vector3(); this.headYaw = 0;
    this.flight = { currentGate: P.gateOriginal, boardingOpen: true };  // authoritative; printed pass keeps the old gate
    this.completed = new Set();
    this.mat = null;
    this.visible = true;
    this.idle = 0; this.demoing = false; this.demoOnly = false; this.ghosts = []; this._hand = null; this._offered = false;
    this.assisting = false; this.assistedSteps = new Set(); this.walking = false;
    this.staffList = []; this.helper = null; this.convStaff = null;
    this.locks = new Set();
    this.station = null; this.near = true;   // where the current task is; the full card shows only when you are near it
    this.walkStick = (() => { try { return localStorage.getItem('saath.walk') !== 'off'; } catch { return true; } })();
    this.reduceMotion = !!globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    this.log = new JourneyLog(STEP_IDS);
    this.tour = false;   // "Watch" mode: the whole journey plays itself, narrated
    this.pres = new Presentation(() => this._applyPresentation());
    this.follow(this.panel.mesh, { yaw: () => this.panelOffset, dy: -0.26, scale: () => cardScale(this.cardDist, this.textK) * (this._intro ? 1 : 0.88) });
    this.input.on('carddrag', (e) => this._dragCard(e));
    for (const evt of ['grab', 'release', 'ui']) this.input.on(evt, () => { this.idle = 0; this._endIntro(); });
    this.phone = new Phone(this);
    this.phone.onEvent = (n) => this._onPhone(n);
  }

  // ---------------------------------------------------------------- staff and help: one caption region, never a second card
  /** Put a staff cut-out into a scene group (so it travels with the scenery). */
  addStaff(kind, role, parent, pos) {
    const s = new Staff(kind, role); s.root.position.set(...pos); parent.add(s.root); s.quiet = () => this.pres.mode === 'staff' || this.pres.mode === 'demo';
    this.staffList.push(s); this.surfaces.push(s.tag);
    if (s.body) { this.input.addInteractive(s.body); s.onTap = (st) => this.askStaff(st); }
    return s;
  }

  nearestStaff() {
    const cam = this.app.camera.getWorldPosition(new THREE.Vector3()); let best = null, bd = Infinity;
    for (const st of this.staffList) { const d = st.root.getWorldPosition(new THREE.Vector3()).distanceTo(cam); if (d < bd) { bd = d; best = st; } }
    return best;
  }

  /** What this person says when you turn to them: one short, relevant line for the current step. */
  _staffLine(staff) {
    const L = {
      kerb: 'Welcome. Please go in whenever you are ready.',
      arrival: 'Ticket and photo I D, please. You can put them on the desk.',
      checkin: 'Good morning. Your documents on the counter, please. I will print your boarding pass.',
      security: 'Phone and electronics pouch in the tray, please. Then the tray and your bag on the belt.',
      gate: 'Look for P A one zero one on the departures board.',
      gatechange: 'Please check the board again. Your gate may have changed.',
      boarding: 'Hold your boarding pass over the reader, code facing down.',
      seat: 'Row fourteen. The row numbers hang above the aisle.',
    };
    return this.step?.staffLine?.(staff) || L[this.step?.id] || 'I am here if you need me.';
  }

  /** Selecting a person starts ONE conversation that replaces the guide's content. Selecting again only repeats the line. */
  askStaff(staff) {
    if (!staff || this.app.phase !== 'lesson') return;
    const r = this.pres.selectPerson(staff.kind + ':' + this.index);
    if (r === 'ignored') return;
    const line = this._staffLine(staff);
    this.voice.stop(); this.voice.say(line);                       // one voice at a time, never overlapping
    if (r === 'repeat') return;
    this._convSnapshot = JSON.parse(JSON.stringify(this.panel.state));
    this.convStaff = staff; this.helper = staff; this.idle = 0;
    this.panel.set({ title: staff.role.split(' ·')[0], body: line, note: '', tone: 'normal',
      buttons: this.step?.demo ? [{ id: 'staffshow', label: 'Show me how' }, { id: 'staffdone', label: 'Got it', kind: 'secondary' }] : [{ id: 'staffdone', label: 'Got it' }] });
    this._applyPresentation();
  }

  /** Leave a staff/help conversation and put the task caption back exactly as it was. */
  endConversation(restore = true) {
    if (this.pres.mode !== 'staff') return;
    this.convStaff = null; this.pres.back();
    if (restore && this._convSnapshot) this.panel.set({ ...this._convSnapshot, chips: this._chips() });
    this._convSnapshot = null; this._applyPresentation();
  }

  /** Help is a hint first. Showing how, and doing it together, are separate explicit choices. */
  help() {
    if (this.app.phase !== 'lesson' || ['paused', 'settings', 'safety', 'demo'].includes(this.pres.mode)) return;
    const r = this.pres.selectPerson('hint:' + this.index);
    if (r === 'ignored') return;
    const text = this.step?.help || 'Ask airport staff or a family member if you are unsure.';
    this.voice.stop(); this.voice.say(text);
    if (r === 'repeat') return;
    this._convSnapshot = JSON.parse(JSON.stringify(this.panel.state));
    const short = text.split(/(?<=\.)\s/).slice(0, 2).join(' ');
    this.panel.set({ title: 'Need a hand?', body: short, note: '', tone: 'normal',
      buttons: this.step?.demo ? [{ id: 'staffshow', label: 'Show me how' }, { id: 'staffassist', label: 'Do it with me', kind: 'secondary' }, { id: 'staffdone', label: 'Got it', kind: 'secondary' }] : [{ id: 'staffdone', label: 'Got it' }] });
    this.step?.onHelp?.();
    this._applyPresentation();
  }

  // ---------------------------------------------------------------- demonstrations
  /** A translucent teal "guide hand" (pointing finger + pulse ring) that performs steps for the learner. */
  guideHand() {
    if (this._hand) return this._hand;
    const mat = new THREE.MeshBasicMaterial({ color: 0x38e1d2, transparent: true, opacity: 0.6, depthTest: false, toneMapped: false });
    const g = new THREE.Group();
    const tip = new THREE.Mesh(new THREE.SphereGeometry(0.016, 16, 12), mat);
    const finger = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.016, 0.16, 12).rotateX(Math.PI / 2).translate(0, 0.05, 0.08).rotateX(-0.5), mat);
    const palm = new THREE.Mesh(new THREE.SphereGeometry(0.03, 16, 12), mat); palm.position.set(0, 0.13, 0.24);
    const ring = new THREE.Mesh(new THREE.RingGeometry(0.03, 0.038, 32), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthTest: false, toneMapped: false, side: THREE.DoubleSide }));
    g.add(tip, finger, palm, ring); g.userData.ring = ring;
    for (const m of g.children) m.renderOrder = 40;
    g.visible = false;
    this.stage.root.add(g);
    return (this._hand = g);
  }

  /** Translucent copy of a prop, so the demo can show where it should go without moving the real one. */
  makeGhost(obj) {
    const now = performance.now();                  // ghosts left by an interrupted demo are discarded
    if (this._ghostT && now - this._ghostT > 150) { for (const o of this.ghosts) o.parent?.remove(o); this.ghosts.length = 0; }
    this._ghostT = now;
    // userData holds circular refs (pointer, home) on the prop and on anything attached to it (e.g. a phone in a tray)
    const saved = []; obj.traverse((o) => { saved.push([o, o.userData]); o.userData = {}; });
    const g = obj.clone(true);
    for (const [o, ud] of saved) o.userData = ud;
    g.traverse((o) => {
      if (!o.isMesh) return;
      const ghostly = (m) => { const c = m.clone(); Object.assign(c, { transparent: true, opacity: 0.5, depthWrite: false }); return c; };
      o.material = Array.isArray(o.material) ? o.material.map(ghostly) : ghostly(o.material);   // photo boxes use one material per face
      o.castShadow = false;
    });
    g.userData = {};
    g.position.copy(this.stage.props.worldToLocal(obj.getWorldPosition(new THREE.Vector3())));
    g.quaternion.copy(obj.getWorldQuaternion(new THREE.Quaternion()));
    this.stage.props.add(g); this.ghosts.push(g);
    return g;
  }

  /** Stage-local point on a surface hot-spot, lifted off the plane towards the viewer. */
  surfacePoint(surface, id, lift = 0) {
    const hs = surface.hot.find((h) => h.id === id) || surface.hot[0];
    const lx = ((hs.x + hs.w / 2) / surface.pxW - 0.5) * surface.width, ly = (0.5 - (hs.y + hs.h / 2) / surface.pxH) * surface.height;
    const p = surface.mesh.localToWorld(new THREE.Vector3(lx, ly, lift));
    return this.stage.root.worldToLocal(p);
  }
  worldToStage(v) { return this.stage.root.worldToLocal(v.clone()); }

  /**
   * Play a scripted demonstration. frames: [{p:[x,y,z] stage-local, dur, press, carry:Object3D, rx:[from,to], act(), hold}]
   * The real scene is never completed by a demo: the learner must still do the step.
   */
  runDemo(frames, { say, apply } = {}) {
    const id = this._demoId = (this._demoId || 0) + 1;   // a newer demo silently cancels an older one
    this.demoing = true; this.idle = 0;
    const hand = this.guideHand(); hand.visible = true;
    const home = this.helper && this.staffList.includes(this.helper)
      ? this.stage.root.worldToLocal(this.helper.root.getWorldPosition(new THREE.Vector3())).add(new THREE.Vector3(0, 1.1, 0.15))   // the helping person's hand
      : new THREE.Vector3(0.18, this.h - 0.5, -0.25);
    hand.position.copy(home);
    if (say) this.say(say);
    let t = 0, prev = home.clone();
    for (const f of frames) {
      const from = prev.clone(), to = new THREE.Vector3(...f.p), dur = f.dur ?? 1.0, carry = f.carry, rx = f.rx;
      this.tweens.add({ delay: t, dur, update: (e) => {
        if (id !== this._demoId) return;
        hand.position.lerpVectors(from, to, e);
        if (carry) { carry.position.copy(hand.position).add(new THREE.Vector3(0, -0.03, 0.02)); if (rx) carry.rotation.x = THREE.MathUtils.lerp(rx[0], rx[1], e); }
      }, done: () => {
        if (id !== this._demoId) return;
        f.act?.();
        if (f.press) this.tweens.add({ dur: 0.5, update: (e) => { hand.userData.ring.material.opacity = 1 - e; hand.userData.ring.scale.setScalar(1 + e * 1.6); } });
      } });
      t += dur + (f.hold ?? (f.press ? 0.55 : 0.12)); prev = to;
    }
    this.tweens.add({ delay: t + 0.4, dur: 0.01, done: () => {
      if (id !== this._demoId) return;
      this.endDemo(true);
      if (this.demoOnly) this._afterDemoOnly();            // 'Show me how': the task is left ready for the learner
      else if (this.assisting) apply?.();                  // only an explicit 'Do it with me' performs the action
    } });
  }

  endDemo(natural = false) {
    if (this._hand) this._hand.visible = false;
    for (const g of this.ghosts) g.parent?.remove(g);
    this.ghosts.length = 0;
    if (this.demoing) { this.demoing = false; this.idle = 0; if (natural) this.attempts = 0; }
  }

  // ---------------------------------------------------------------- show me / do it with me
  /** "Show me how": play the demonstration and leave the task ready. Nothing is completed for the learner. */
  showMe() {
    if (!this.step?.demo) { this.endConversation(); return; }
    this.endConversation(true);
    this._taskSnap = JSON.parse(JSON.stringify(this.panel.state));
    this.demoOnly = true; this.log.noteDemo(this.stepId);
    this.pres.enter('demo');
    this.panel.set({ title: 'Watch how.', body: '', note: '', buttons: [{ id: 'demostop', label: 'Stop', kind: 'secondary' }] });
    this.step.demo();
    if (!this.demoing) this._afterDemoOnly();
  }
  _afterDemoOnly() {
    if (!this.demoOnly) return;
    this.demoOnly = false; if (this.pres.mode === 'demo') this.pres.back();
    if (this._taskSnap) this.panel.set({ ...this._taskSnap, chips: this._chips(), note: 'Now you try. Choose Help to see it again.', tone: 'normal' });
    this._taskSnap = null; this._applyPresentation();
  }
  _stopDemo() { this.endDemo(); this._afterDemoOnly(); }
  /** Legacy name used by the step buttons labelled "Show me": it demonstrates only. */
  startAssist() { return this.showMe(); }

  /** "Do it with me": explicit, recorded as assisted. The demonstration then performs the action for real. */
  completeWithHelp() {
    if (!this.step?.demo || this.assisting) { this.endConversation(); return; }
    this.endConversation(true);
    this.log.noteAssist(this.stepId);
    this.assisting = true; this._assistGap = 0.4; this.assistCount = 0; this.assistedSteps.add(this.index);
    this.panel.set({ note: 'Doing this step together. Choose Pause to stop.', tone: 'normal' });
  }

  /** Every frame: drives an explicit assist. A quiet offer of help appears after a long pause; nothing starts by itself. */
  _assist(dt) {
    if (this.tour && this.station && !this.near) return;      // in the watch tour the demonstrations start once it has walked up to the task
    if (this.tour && this.step && !this.step.demo && !this.paused && this.pres.mode === 'scene' && (this._tourWait += dt) > 7) { this._tourWait = 0; return this.next(); }
    if (!this.step?.demo || this.paused || this.completed.has(this.index) || this.app.phase !== 'lesson' || this.walking) return;
    if (this.assisting) {
      if (this.demoing) return;
      this._assistGap -= dt;
      if (this._assistGap <= 0) {
        this._assistGap = 0.7;
        if (++this.assistCount > 16) { if (this.tour) this.assistCount = 0; else this.assisting = false; }   // safety: never loop forever (a tour keeps going)
        else this.step.demo();
      }
      return;
    }
    if (this.demoing || this.pres.mode !== 'scene') return;
    this.idle += dt;
    if ((this.attempts >= 3 || this.idle > 45) && !this._offered) {
      this._offered = true;
      this.panel.set({ note: 'Take your time. Choose Help whenever you would like a hand.', tone: 'normal' });
    }
  }

  // ---------------------------------------------------------------- walking
  /**
   * Seated "walking": the world glides towards the learner, so they travel without moving in the room.
   * Slow, level, with a comfort vignette. Menu → "Walking: Fade" swaps the glide for a blink.
   */
  moveWorld(dx, dz, done, { speed = 1.15, min = 1.2, route = true } = {}) {
    // Furniture is solid: if the straight line crosses a counter, turn, walk beside it, then turn back.
    if (route && this.obstacles.length) {
      const legs = this._route({ x: 0, z: 0 }, { x: -dx, z: -dz });
      if (legs.length > 1) { const run = (i) => (i >= legs.length ? done?.() : this.moveWorld(-legs[i][0], -legs[i][1], () => run(i + 1), { speed, min: 0.8, route: false })); return run(0); }
    }
    const sc = this.stage.scenery, hall = this.app.env.virtual, env = this.app.env;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.02) { done?.(); return; }
    this.walking = true; this.locks.add('walk'); this._syncInput();
    const s0 = sc.position.clone(), h0 = hall.position.clone();
    const set = (e) => { sc.position.set(s0.x + dx * e, 0, s0.z + dz * e); hall.position.set(h0.x + dx * e, 0, h0.z + dz * e); };
    const finish = () => { this.walking = false; this.locks.delete('walk'); this._syncInput(); this.idle = 0; done?.(); };
    if (this.app.comfort === 'fade') {
      env.veil.visible = true;
      this.tweens.add({ dur: 0.35, update: (e) => { env.veil.material.opacity = e; }, done: () => {
        set(1);
        this.tweens.add({ dur: 0.5, update: (e) => { env.veil.material.opacity = 1 - e; }, done: () => { env.veil.visible = false; finish(); } });
      } });
      return;
    }
    env.vigTarget = 0.62;
    this.tweens.add({ dur: this.reduceMotion ? 0.25 : Math.max(min, dist / speed), update: set, done: () => { env.vigTarget = 0; finish(); } });
  }

  /** Walk so that a stage-local point ends up `standOff` metres ahead of the learner, centred. */
  walkToward(point, standOff, done) {
    // Learner motion in stage space (x right, -z forward). Furniture is solid: if the straight line crosses a counter or
    // desk, turn, walk beside it, then turn back (like a person would).
    const T = { x: point.x * 0.85, z: point.z + standOff };
    const legs = this._route({ x: 0, z: 0 }, T);
    const run = (i) => { if (i >= legs.length) return done?.(); const [mx, mz] = legs[i]; this.moveWorld(-mx, -mz, () => run(i + 1), { min: 0.8, route: false }); };
    run(0);
  }

  /** Register furniture the learner must walk around (an Object3D inside the scenery). */
  obstacle(obj) {
    this.obstacles.push(obj);
    const remove = () => { const i = this.obstacles.indexOf(obj); if (i >= 0) this.obstacles.splice(i, 1); };
    this.cleanups.push(remove); return remove;
  }

  _boxes(M = 0.4) {
    const out = [], root = this.stage.root;
    for (const o of this.obstacles) {
      const b = new THREE.Box3().setFromObject(o); if (b.isEmpty()) continue;
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (const x of [b.min.x, b.max.x]) for (const z of [b.min.z, b.max.z]) { const p = root.worldToLocal(new THREE.Vector3(x, b.min.y, z)); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z); }
      out.push({ x0: x0 - M, x1: x1 + M, z0: z0 - M, z1: z1 + M });
    }
    return out;
  }

  _route(a, t) {
    const boxes = this._boxes(), legs = []; let c = { ...a };
    const hit = (p, q, bx) => {            // does segment p->q cross the box (slab test)?
      let t0 = 0, t1 = 1; const d = { x: q.x - p.x, z: q.z - p.z };
      for (const [o, dd, lo, hi] of [[p.x, d.x, bx.x0, bx.x1], [p.z, d.z, bx.z0, bx.z1]]) {
        if (Math.abs(dd) < 1e-6) { if (o < lo || o > hi) return false; } else { let u0 = (lo - o) / dd, u1 = (hi - o) / dd; if (u0 > u1) [u0, u1] = [u1, u0]; t0 = Math.max(t0, u0); t1 = Math.min(t1, u1); if (t0 > t1) return false; }
      }
      return true;
    };
    for (let it = 0; it < 3; it++) {
      const bx = boxes.find((b) => hit(c, t, b) && !(c.x >= b.x0 && c.x <= b.x1 && c.z >= b.z0 && c.z <= b.z1));
      if (!bx) break;
      const side = Math.abs(bx.x0 - c.x) + Math.abs(bx.x0 - t.x) < Math.abs(bx.x1 - c.x) + Math.abs(bx.x1 - t.x) ? bx.x0 : bx.x1;
      const pastZ = Math.min(bx.z0 - 0.05, t.z);
      legs.push([side - c.x, 0], [0, pastZ - c.z]); c = { x: side, z: pastZ };
    }
    legs.push([t.x - c.x, t.z - c.z]);
    return legs.filter((l) => Math.hypot(l[0], l[1]) > 0.02);
  }

  /** Start each station a few metres from you (a soft fade in); you walk up to it yourself. */
  arrive(dist = 3.0) {
    const sc = this.stage.scenery, hall = this.app.env.virtual, env = this.app.env;
    sc.position.set(0, 0, -dist); hall.position.set(0, 0, -dist);
    env.veil.visible = true; env.veil.material.opacity = 1;
    this.tweens.add({ dur: this.reduceMotion ? 0.2 : 0.7, update: (e) => { env.veil.material.opacity = 1 - e; }, done: () => { env.veil.visible = false; } });
  }

  resetWorld() {
    this.stage.scenery.position.set(0, 0, 0); this.app.env.virtual.position.set(0, 0, 0);
    this.app.env.vigTarget = 0; this.walking = false; this.locks.delete('walk'); this._syncInput();
  }

  get h() { return this.stage.headY; }
  get lapY() { return Math.round((this.h - 0.42) * 100) / 100; }
  get count() { return STEPS.length; }

  // ---------------------------------------------------------------- lifecycle
  async start(i = 0) {
    await this.assets.preload(['boarding-pass', 'booking-document', 'practice-id', 'smartphone']);
    this.goto(i);
  }

  get stepId() { return STEP_IDS[this.index]; }

  async goto(i) {
    this._token = (this._token || 0) + 1;
    this._teardown();
    this.index = i;
    this._intro = true; this._introT = 0;
    this.attempts = 0; this.idle = 0; this.assisting = false; this._offered = false; this.demoOnly = false; this._convSnapshot = null; this._taskSnap = null;
    this.completed.delete(i);
    // Authoritative flight state persists through the run; the printed pass keeps the old gate.
    this.flight = { currentGate: i >= STEPS.findIndex((s) => s.name === 'gatechange') ? P.gateChanged : P.gateOriginal, boardingOpen: true };
    const def = STEPS[i];
    if (!def) return;
    const step = def(this);
    const token = this._token = (this._token || 0) + 1;
    this.clearStation();
    this.panel.set({ progress: { i, n: STEPS.length }, chips: this._chips(), tone: 'normal', note: '', tasks: [], minimal: false });
    await this.assets.preload(step.assets || []);
    await this.assets.loadPeople(step.people || []);   // only the people this station needs
    if (token !== this._token) return; // another goto superseded this one
    if (step.table !== false) this._buildMat();   // the lap table exists only where there are things to hold
    this.step = step;                  // only live once its scene exists
    this.log.start(STEP_IDS[i]);
    this.pres.mode = 'scene'; this.pres.stack.length = 0; this.pres.conversation = null;
    this.phone.attach();
    if (step.id !== 'phone') this.phone.setPose('away', 0.01);
    this.app.env.setScene(step.scene || 'hall-wall');
    step.enter();
    if (this.tour) { this.assisting = true; this._assistGap = 1.2; this.assistCount = 0; this._tourWait = 0; }
    this._applyPresentation();
    this.snapshot = JSON.parse(JSON.stringify(this.panel.state));
    this.say(this.step.voice || '');
    this.snapPanelToGaze();
    if (step.walkIn !== false && i > 0 && this.app.phase === 'lesson') this.arrive(step.walkDist ?? 3.0);
  }

  next({ skipped = false } = {}) {
    const id = this.stepId;
    if (id) { if (skipped) this.log.skip(id); else if (this.log.get(id) === 'in-progress') this.log.complete(id); }
    let n = this.index + 1;
    while (n < STEPS.length && OPTIONAL_STEPS.has(STEP_IDS[n])) n++;       // optional home practice is only entered by choice
    if (n < STEPS.length) this.goto(n); else this.finish();
  }
  skipStep() { this.next({ skipped: true }); }
  /** Return to the previous step (optional steps are not part of "back"). */
  previousStep() { let n = this.index - 1; while (n > 0 && OPTIONAL_STEPS.has(STEP_IDS[n])) n--; if (n >= 0) this.goto(n); }

  /** In a watch tour a lone Continue-style button is pressed for you after a pause. Practice mode never does this. */
  _tourAuto(buttons) {
    if (!this.tour || !buttons || buttons.length !== 1 || !['go', 'cont'].includes(buttons[0].id)) return;
    const id = buttons[0].id, idx = this.index;
    this.tweens.add({ delay: 2.6, dur: 0.01, done: () => { if (this.tour && this.index === idx && this.panel.state.buttons[0]?.id === id) this.onPanel(id); } });
  }

  /** Protected volume: a physical headset is never moved. Scenery that comes within 0.35 m of the head is hidden until it clears. */
  _guard(dt) {
    this._guardT = (this._guardT || 0) + dt; if (this._guardT < 0.15) return; this._guardT = 0;
    const h = this.headLocal, M = 0.35;
    const check = (o, b) => { if (!b || !o) return; const inside = h.x > b.min.x - M && h.x < b.max.x + M && h.z > b.min.z - M && h.z < b.max.z + M && h.y > b.min.y - 0.1 && h.y < b.max.y + 0.2; if (o.userData.guardHidden !== inside) { o.userData.guardHidden = inside; o.visible = !inside; } };
    for (const o of this.obstacles) check(o, this.stage.localBox(o));
    for (const st of this.staffList) check(st.root, this.stage.localBox(st.root));
  }

  /** Development check: every pair of unrelated objects in the current station, and anything inside the viewer's space. */
  auditLayout() {
    const items = [...this.stage.scenery.children].filter((o) => o.visible && !(o.geometry?.type === 'PlaneGeometry' && (o.geometry.parameters.width > 6)) && o.name !== 'Facade');
    const label = (o) => { const kids = []; o.traverse((c) => { if (c !== o && c.name && kids.length < 2 && !c.isMesh) kids.push(c.name); }); const p = o.position; return (o.name || kids.join('/') || o.type) + '@' + p.x.toFixed(1) + ',' + p.z.toFixed(1); };
    const boxes = items.map((o) => ({ o, name: label(o), b: this.stage.localBox(o) })).filter((e) => e.b);
    const out = [], V = Stage_VIEWER;
    for (const e of boxes) {
      if (e.b.max.x - e.b.min.x > 9 || this.step?.enclosure) continue;      // an aircraft or jet bridge deliberately surrounds the learner
      if (e.b.max.x > -V.x && e.b.min.x < V.x && e.b.max.z > V.z0 && e.b.min.z < V.z1 && e.b.max.y > V.y0 && e.b.min.y < V.y1) out.push('VIEWER: ' + e.name);
    }
    const shrink = (b, m) => new THREE.Box3(b.min.clone().addScalar(m), b.max.clone().subScalar(m));
    for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) {
      if (boxes[i].b.max.x - boxes[i].b.min.x > 9 || boxes[j].b.max.x - boxes[j].b.min.x > 9) continue;
      if (shrink(boxes[i].b, 0.03).intersectsBox(shrink(boxes[j].b, 0.03))) out.push(boxes[i].name + ' x ' + boxes[j].name);
    }
    return out;
  }
  restart() { this.completed.clear(); this.assistedSteps.clear(); this.log = new JourneyLog(STEP_IDS); this.goto(0); }
  retryNeeded() { const first = this.log.retryable()[0]; const i = STEP_IDS.indexOf(first); this.log = new JourneyLog(STEP_IDS); if (i >= 0) this.goto(i); else this.goto(0); }

  finish() {
    if (this.tour) return this._finishTour();
    const id = this.stepId; if (id && this.log.get(id) === 'in-progress') this.log.complete(id);
    this._teardown(); this.index = STEPS.length;
    const names = { phone: 'your ticket', cab: 'the cab ride', packing: 'packing', kerb: 'arriving', arrival: 'the entrance', checkin: 'check-in', security: 'security', gate: 'finding your gate', gatechange: 'the gate change', boarding: 'boarding', seat: 'finding your seat' };
    if (this.log.get('packing') === 'not-started') this.log.ids = this.log.ids.filter((i) => i !== 'packing');   // optional, never started
    const summary = this.log.summary(names) || 'Nothing was completed.';
    const retry = this.log.retryable().length > 0;
    this.pres.mode = 'scene'; this.pres.stack.length = 0;
    this.panel.set({ title: 'Practice finished.', body: summary, tasks: [], note: 'Practice only. Follow real staff, and check your own airline and airport.', tone: 'normal', progress: { i: STEPS.length, n: STEPS.length },
      buttons: [{ id: 'again', label: 'Practise again' }, ...(retry ? [{ id: 'retrylist', label: 'Practise the ones that needed help', kind: 'secondary' }] : []), { id: 'exit', label: 'Exit', kind: 'secondary' }], chips: this._chips() });
    this.snapshot = JSON.parse(JSON.stringify(this.panel.state));
    this.voice.say('The practice is finished. Well done for taking part.');
    this.app.env.setMode(this.app.env.mode, { instant: true });
    this._applyPresentation();
  }

  // ---------------------------------------------------------------- watch mode: the whole journey plays itself
  /** Play the full journey as a narrated demonstration. It is not recorded as the learner's own practice. */
  startTour() {
    if (this.app.phase !== 'lesson' && this.app.phase !== 'setup') return;
    if (!this.tour) this._realLog = this.log;
    this.tour = true; this.log = new JourneyLog(STEP_IDS); this.completed.clear(); this.assistedSteps.clear();
    this.paused = false; this.pres.mode = 'scene'; this.pres.stack.length = 0;
    this.goto(0);
  }
  _finishTour() {
    this._teardown(); this.index = STEPS.length;
    this.pres.mode = 'scene'; this.pres.stack.length = 0;
    this.panel.set({ title: 'That was the whole journey.', body: 'Now you know what to expect. Try it yourself, or watch again.', note: 'Practice only. Follow real staff, and check your own airline and airport.', tone: 'normal', tasks: [], progress: { i: STEPS.length, n: STEPS.length },
      buttons: [{ id: 'tourpractise', label: 'Now I will try it' }, { id: 'tourplay', label: 'Watch again', kind: 'secondary' }, { id: 'exit', label: 'Exit', kind: 'secondary' }], chips: this._chips() });
    this.snapshot = JSON.parse(JSON.stringify(this.panel.state));
    this.voice.say('That was the whole journey. Now you know what to expect.');
    this._applyPresentation();
  }
  /** Leave watch mode. With practise = true, go straight into your own practice from the beginning. */
  stopTour(practise = true) {
    if (!this.tour) return;
    this.tour = false; this.assisting = false; this.endDemo(); this.demoOnly = false;
    this.log = this._realLog || new JourneyLog(STEP_IDS); this._realLog = null;
    this.paused = false; this.pres.mode = 'scene'; this.pres.stack.length = 0;
    if (practise) this.goto(0); else this.app.exitSession();
  }

  _teardown() {
    this.step?.exit?.();
    this.tweens.clear();
    this.endDemo();
    this.helper = null; this.convStaff = null; this.station = null; this.near = true; this._tourWalking = false;
    this.staffList.length = 0;
    this.locks.clear();
    this.resetWorld();
    this.app.env.setHall(true);
    this.assets.live.clear();
    for (const fn of this.cleanups) fn();
    this.cleanups.length = 0;
    for (const s of this.surfaces) { this.input.removeInteractive(s.mesh); }
    this.surfaces.length = 0;
    // keep the guide panel registered
    const keep = this.panel.mesh;
    this.input.clear();
    this.input.addInteractive(keep);
    for (const c of [...this.stage.scenery.children, ...this.stage.props.children]) disposeObject(c);
    this.stage.clearScenery();
    this.stage.root.remove(this.mat?.mesh);
    this.mat = null;
    this.step = null;
  }

  _chips() {
    const far = !!this.station && !this.near && !this.tour;
    const c = far ? [] : [{ id: 'repeat', label: 'Repeat', icon: 'repeat' }];
    c.push(this.tour ? { id: 'stoptour', label: 'Stop', icon: 'pause' } : { id: 'help', label: 'Help', icon: 'help' });
    if (far) c.push({ id: 'gostation', label: 'Take me', icon: 'play' });
    if (this.phone?.opened && this.phone.isAway) c.push({ id: 'phone', label: 'Phone', icon: 'phone' });
    c.push(this.paused ? { id: 'resume', label: 'Resume', icon: 'play' } : { id: 'pause', label: 'Pause', icon: 'pause' }, { id: 'menu', label: 'Menu', icon: 'menu' });
    return c;
  }

  // ---------------------------------------------------------------- presentation: which surfaces are visible, which inputs are live
  _applyPresentation() {
    if (this.app.phase !== 'lesson') return;
    const p = this.pres;
    const guide = (p.visible('guide') || p.visible('pause') || p.visible('safety')) && this.visible;
    this.panel.mesh.visible = guide; guide ? this.input.addInteractive(this.panel.mesh) : this.input.removeInteractive(this.panel.mesh);
    const phoneVis = p.visible('phone') && !this.phone.isAway;
    this.phone.group.visible = phoneVis; phoneVis ? this.input.addInteractive(this.phone.screen.mesh) : this.input.removeInteractive(this.phone.screen.mesh);
    const menu = this.app.menu;
    if (menu) { const on = p.visible('settings'); menu.mesh.visible = on; on ? this.input.addInteractive(menu.mesh) : this.input.removeInteractive(menu.mesh); }
    // In a safety stop the real room must show: hide all lesson geometry (only possible to show a room in an AR session)
    const hide = p.mode === 'safety';
    this.stage.scenery.visible = !hide; this.stage.props.visible = !hide; this.app.env.setSafetyHide(hide);
    if (hide) { this.app.env.veil.visible = false; this.app.env.vigTarget = 0; }
    this._syncInput();
  }
  /** Lesson objects respond only when the mode allows and nothing is travelling. System surfaces (pause, menu, safety) always respond. */
  _syncInput() { this.input.paused = !this.pres.lessonInputLive() || this.locks.size > 0; }

  // ---------------------------------------------------------------- phone
  _onPhone(name) {
    if (name === 'ready') return this.step?.phoneReady?.();
    if (name === 'packing') { this.phone.putAway(); return this.goto(STEP_IDS.indexOf('packing')); }
    if (name === 'away') { if (this.pres.mode === 'phone') { this.pres.enter('scene'); } this.panel.set({ chips: this._chips() }); this._applyPresentation(); return; }
    if (name === 'opened') { this.panel.set({ chips: this._chips() }); return this.step?.phoneOpened?.(); }
    if (name === 'grabbed') return this.step?.phoneGrabbed?.();
  }
  recallPhone() {
    if (this.pres.mode === 'staff') this.endConversation(true);
    if (!this.pres.enter('phone')) return;
    this.phone.recall(); this._applyPresentation();
  }

  // ---------------------------------------------------------------- panel / events
  onPanel(id) {
    this.voice.soft(); this.idle = 0;
    if (this.app.phase !== 'lesson') return this.app.onSetup(id);
    switch (id) {
      case 'repeat': return this.voice.repeat();
      case 'pause': return this.pause(true);
      case 'resume': return this.pause(false);
      case 'help': return this.help();
      case 'menu': return this.app.openMenu();
      case 'phone': return this.recallPhone();
      case 'gostation': return this.walkToStation();
      case 'stoptour': return this.stopTour();
      case 'tourplay': return this.startTour();
      case 'tourpractise': return this.stopTour(true);
      case 'staffshow': return this.showMe();
      case 'staffassist': return this.completeWithHelp();
      case 'staffdone': return this.endConversation();
      case 'demostop': return this._stopDemo();
      case 'exit': return this.app.exitSession();
      case 'safeResume': return this.safetyResume();
      case 'next': return this.next();
      case 'again': return this.restart();
      case 'retrylist': return this.retryNeeded();
      case 'retry': this.assistedSteps.delete(this.index); return this.goto(this.index);
    }
    this.step?.onButton?.(id);
  }

  /** Pause freezes everything that moves or changes (tweens, travel, demonstrations, timers). Resume and Exit stay usable. */
  pause(on) {
    if (on) {
      if (this.paused || this.app.phase !== 'lesson') return;
      this.paused = true; this._pauseSnap = JSON.parse(JSON.stringify(this.panel.state));
      this.voice.stop(); this.pres.enter('paused');
      const env = this.app.env; env.veil.visible = false; env.vigTarget = 0;
      this.panel.set({ title: 'Paused', body: 'Nothing is timed. Resume when you are ready.', note: '', tone: 'normal', tasks: [], progress: null, buttons: [{ id: 'resume', label: 'Resume' }, { id: 'exit', label: 'Exit', kind: 'secondary' }] });
    } else {
      if (!this.paused) return;
      this.paused = false; this.pres.back();
      this.panel.set({ ...this._pauseSnap, chips: this._chips() });
      this.app.env.veil.visible = this.walking && this.app.comfort === 'fade';
    }
    this._applyPresentation(); this.snapPanelToGaze();
  }

  // ---------------------------------------------------------------- safety stop (boundary / lost tracking)
  safetyStop(reason = 'boundary') {
    if (this.pres.mode === 'safety' || this.app.phase !== 'lesson') return;
    this._safetySnap = JSON.parse(JSON.stringify(this.panel.state));
    this.voice.stop(); this.pres.enter('safety');
    const opaque = this.app.blend === 'opaque' || this.app.mode === 'vr';
    const body = reason === 'tracking' ? 'Tracking was lost. Stay where you are until the headset sees you again.'
      : opaque ? 'You are outside your practice area. Stay where you are, and use the headset boundary if it appears.' : 'You are outside your practice area. Your room is showing. Stay where you are.';
    this.panel.set({ title: 'Please stop.', body, note: '', tone: 'warn', tasks: [], progress: null, buttons: [{ id: 'safeResume', label: 'Resume here' }, { id: 'exit', label: 'Exit', kind: 'secondary' }] });
    this._applyPresentation(); this.snapPanelToGaze();
  }
  safetyResume() {
    if (this.pres.mode !== 'safety') return;
    this.app.recenterHere?.();
    this.pres.back();
    if (this._safetySnap) this.panel.set({ ...this._safetySnap, chips: this._chips() });
    this._applyPresentation(); this.snapPanelToGaze();
  }

  say(text) { if (text) this.voice.say(text); }

  setPanel(p) {
    if (p.buttons) p = { ...p, buttons: p.buttons.filter((b) => b.id !== 'help') };   // Help lives in the utility row; no duplicate button
    this.panel.set({ chips: this._chips(), ...p }); this.snapshot = JSON.parse(JSON.stringify(this.panel.state)); this._tourAuto(p.buttons); }

  /** Calm positive state; the learner moves on with the Continue button (never automatically). */
  success(title, body, label = 'Continue') {
    const assisted = this.assisting; this.assisting = false; this.helper = null;
    this.completed.add(this.index);
    this.log.complete(this.stepId);
    if (this.tour) {
      this.setPanel({ title, body, note: '', tone: 'normal', buttons: [] }); this.say(title + ' ' + body);
      const idx = this.index; this.tweens.add({ delay: 3.2, dur: 0.01, done: () => { if (this.tour && this.index === idx) this.next(); } });
      return;
    }
    this.voice.success();
    this.app.haptic?.(0.6, 80);
    if (assisted) {
      this.setPanel({ title, body, note: 'We did this one together. You can try it yourself later.', tone: 'normal', buttons: [{ id: 'next', label }, { id: 'retry', label: 'Try it myself', kind: 'secondary' }] });
      this.say(title);
      return;
    }
    this.setPanel({ title, body, note: '', tone: 'normal', buttons: [{ id: 'next', label }] });
    this.say(title + ' ' + body);
  }

  /** Gentle correction (never a penalty). */
  nudge(message, speak = true) {
    this.attempts++;
    this.voice.retry();
    this.panel.set({ note: message, tone: 'warn' });
    if (speak) this.say(message);
    this.noteTimer = 5;
  }

  // ---------------------------------------------------------------- scene-building helpers
  addScenery(obj, opts) { return this.stage.place(obj, opts); }
  addProp(obj, grab = {}, pos = null) {
    if (grab.inScenery) {   // sits on something in the station (a tray on its table), so it stays there as you walk
      if (pos) obj.position.set(pos[0], pos[1], pos[2] + this.stage.pull);
      this.stage.scenery.add(obj); this.input.addGrabbable(obj, { home: this.stage.scenery, ...grab }); return obj;
    }
    if (pos) obj.position.set(...pos);
    this.stage.props.add(obj);
    this.input.addGrabbable(obj, { home: this.stage.props, ...grab });
    return obj;
  }
  addSurface(surface, { pos = [0, 0, 0], ry = 0, parent = null, interactive = true, follow = null } = {}) {
    surface.mesh.position.set(...pos); surface.mesh.rotation.y = ry;
    if (follow) { this.follow(surface.mesh, follow); this.cleanups.push(() => this.unfollow(surface.mesh)); }
    (parent || this.stage.props).add(surface.mesh);
    this.surfaces.push(surface);
    if (interactive) this.input.addInteractive(surface.mesh);
    return surface;
  }
  track(surface, interactive = true) { this.surfaces.push(surface); if (interactive) this.input.addInteractive(surface.mesh); return surface; }
  onCleanup(fn) { this.cleanups.push(fn); }
  addSupport(minX, maxX, minZ, maxZ, y, fixed = false) {
    const s0 = fixed ? null : this.stage.scenery.position.clone();
    const pull = fixed ? 0 : this.stage.pull;     // station pieces are placed with the same pull as their supports
    this.input.supports.push((p) => { const dx = s0 ? this.stage.scenery.position.x - s0.x : 0, dz = (s0 ? this.stage.scenery.position.z - s0.z : 0) + pull; return p.x >= minX + dx && p.x <= maxX + dx && p.z >= minZ + dz && p.z <= maxZ + dz ? y : null; });
  }
  local(obj) { return this.stage.root.worldToLocal(obj.getWorldPosition(new THREE.Vector3())); }

  /** A faint shelf at lap height, so dropped items land within a seated reach instead of the floor. */
  /** No table anywhere. An invisible lap-height surface only stops things you let go of from dropping to the floor. */
  _buildMat() {
    this.mat = { mesh: null };
    this.addSupport(-0.57, 0.57, -0.64, -0.04, this.lapY, true);
  }

  // ---------------------------------------------------------------- per frame
  /** How far left of the gaze the guide panel sits (a narrower desktop window needs less). */
  /** Centred (0°) while it introduces a step, then about 12° left of the gaze so the task stays in front of you. */
  get panelOffset() { return this._intro ? 0 : 0.21; }
  _endIntro() { if (!this._intro) return; this._intro = false; const fo = this.followers.get(this.panel.mesh); if (fo) fo.moving = true; }

  update(dt, time) {
    const frozen = this.paused || ['safety', 'settings'].includes(this.pres.mode);   // settings, pause and safety suspend everything that moves or changes
    if (!frozen) { this.tweens.step(dt); this._assist(dt); }
    const cam = this.app.camera;
    if (!frozen && this.staffList.length) { const hw = cam.getWorldPosition(new THREE.Vector3()); for (const s of this.staffList) s.update(dt, hw); }
    cam.getWorldPosition(_v); this.headLocal.copy(this.stage.root.worldToLocal(_v));
    cam.getWorldDirection(_v2); _v2.transformDirection(this.stage.root.matrixWorld.clone().invert());
    this.headYaw = Math.atan2(-_v2.x, -_v2.z);
    this.headPitch = Math.asin(THREE.MathUtils.clamp(_v2.y, -1, 1));
    // seated eye height tracks the headset (clamped to plausible seated/standing range)
    if (this.app.xrPresenting) this.stage.headY = THREE.MathUtils.clamp(this.headLocal.y, 0.9, 1.9);

    // Cards are body-anchored and lazy: they stay put inside a dead zone and settle to a new spot only after a real turn.
    for (const [mesh, fo] of this.followers) if (mesh.visible) this._follow(mesh, fo, dt);

    if (frozen) return;
    if (this._intro && (this._introT += dt) > 9) this._endIntro();
    this._guard(dt);
    if (this.noteTimer > 0 && (this.noteTimer -= dt) <= 0 && this.panel.state.tone === 'warn') this.panel.set({ note: '', tone: 'normal' });
    this._pulseT = (this._pulseT || 0) + dt;
    if (this._pulseT > 0.09) { this._pulseT = 0; for (const s of this.surfaces) s.tick?.(); }
    this.phone.update(dt);
    this._updateStation(dt);
    this._stickWalk(dt);
    this.step?.update?.(dt, time);
  }

  // ---------------------------------------------------------------- stations: you roam, the instructions meet you at the task
  /**
   * The place where the current task happens. Far away you see only a slim "Walk to…" bar and a glowing ring on the floor;
   * the full card appears when you are close. point is in the station's own coordinates (as designed, before the small-space pull).
   */
  setStation({ point, label, radius = 1.4, hint = null, onArrive = null }) {
    this.clearStation();
    const marker = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.5, 40).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x38e1d2, transparent: true, opacity: 0.6, depthWrite: false, toneMapped: false }));
    marker.position.set(point.x, 0.015, point.z + this.stage.pull); this.stage.scenery.add(marker);
    this.station = { point, label, r: radius, hint, onArrive, fired: false, marker };
    this.near = true; this._updateStation(0, true);
  }
  clearStation() {
    if (this.station?.marker) { this.station.marker.parent?.remove(this.station.marker); }
    this.station = null; this.near = true; this._stationUI();
  }
  /** Distance from you to the station, horizontally, in metres. */
  stationDistance() {
    const s = this.station; if (!s) return 0;
    const sc = this.stage.scenery.position;
    return Math.hypot(s.point.x + sc.x, s.point.z + this.stage.pull + sc.z);
  }
  _updateStation(dt, first = false) {
    const s = this.station; if (!s) return;
    const dist = this.stationDistance();
    if (this.tour && !this.walking && dist > s.r && !this._tourWalking) { this._tourWalking = true; this.walkToStation(() => { this._tourWalking = false; }); }
    const was = this.near;
    if (!this.near && dist < s.r) this.near = true;
    else if (this.near && dist > s.r + 0.9 && !this.tour) this.near = false;
    if (first) this.near = dist < s.r;
    if (s.marker) { s.marker.visible = !this.near; s.marker.material.opacity = 0.35 + 0.3 * Math.sin(performance.now() / 380); }
    if (first || this.near !== was) {
      this._stationUI();
      if (this.near) { this._intro = true; this._introT = 0; this.snapPanelToGaze(); }
      if (this.near && s.onArrive && !s.fired) { s.fired = true; s.onArrive(); }
    }
  }
  _stationUI() {
    const s = this.station, far = !!s && !this.near && !this.tour;
    const keys = this.app.xrPresenting ? 'Use the left thumbstick, or choose Take me.' : 'W A S D to walk, or choose Take me.';
    this.panel.set({ minimal: far, minimalTitle: s ? 'Walk to ' + s.label : '', minimalHint: s?.hint ?? keys, chips: this._chips() });
  }
  /** Walk there for the learner: for hand-only users, and for the watch tour. */
  walkToStation(done) {
    const s = this.station; if (!s) return done?.();
    const sc = this.stage.scenery.position;
    this.walkToward(new THREE.Vector3(s.point.x + sc.x, 0, s.point.z + this.stage.pull + sc.z), s.r * 0.55, done);
  }
  _bounds() {
    if (this.step?.bounds) return this.step.bounds;
    const k = this.app.env.sceneKind;
    if (k === 'outdoor') return { x0: -7, x1: 7, z0: -6.5, z1: 3.5 };
    if (k === 'hall-wall' || k === 'hall-apron') return { x0: -5.2, x1: 5.2, z0: -6.0, z1: 4.5 };
    return null;
  }

  /** Optional smooth walking with the left thumbstick. Off unless the learner chose "smooth" in Settings. Counters are solid. */
  _stickWalk(dt) {
    if (!this.walkStick || this.step?.roam === false) return;
    if (this.app.phase !== 'lesson' || this.walking || this.paused || !['scene', 'phone'].includes(this.pres.mode) || this.demoing || this.tour) return;
    const s = this.input.walkAxes(), mag = Math.hypot(s.x, s.y);
    if (mag < 0.2) { if (this._stickOn) { this._stickOn = false; this.app.env.vigTarget = 0; } return; }
    this._stickOn = true; this.app.env.vigTarget = this.reduceMotion ? 0.3 : 0.5;
    const sp = 1.3 * Math.min(1, (mag - 0.2) / 0.8) * dt, yaw = this.headYaw;
    // stick up = forward along the gaze, in stage space (x right, -z forward)
    const fx = -Math.sin(yaw), fz = -Math.cos(yaw), rx = Math.cos(yaw), rz = -Math.sin(yaw);
    let mx = (fx * -s.y + rx * s.x) * sp, mz = (fz * -s.y + rz * s.x) * sp;
    this.stage.root.updateMatrixWorld(true);          // measure the furniture where it is now
    const boxes = this._boxes(0.28), blocked = (x, z) => boxes.some((b) => x > b.x0 && x < b.x1 && z > b.z0 && z < b.z1);
    if (blocked(mx, mz)) { if (!blocked(mx, 0)) mz = 0; else if (!blocked(0, mz)) mx = 0; else { mx = 0; mz = 0; } }
    const sc = this.stage.scenery, hall = this.app.env.virtual, pull = this.stage.pull;
    let nx = sc.position.x - mx, nz = sc.position.z - mz;
    const b = this._bounds();
    if (b) { const lx = Math.min(b.x1, Math.max(b.x0, -nx)), lz = Math.min(b.z1, Math.max(b.z0, -nz - pull)); nx = -lx; nz = -lz - pull; }   // walls: you can not leave the building or the aircraft
    else if (Math.abs(nx) > 6 || nz > 5 || nz < -8) return;
    sc.position.set(nx, 0, nz); hall.position.set(nx, 0, nz);
  }

  /** Place one body-anchored card. yaw / dist / dy / scale may be numbers or functions (so settings apply live). */
  follow(mesh, o) {
    mesh.rotation.order = 'YXZ'; mesh.userData.followable = true;
    this.followers.set(mesh, { yaw: 0, dist: () => this.cardDist, dy: -0.2, scale: () => cardScale(this.cardDist, this.textK), ...o });
  }
  setCardPrefs({ dist, textK } = {}) {
    if (dist) { this.cardDist = dist; store.set('saath.cardDist', dist); }
    if (textK) { this.textK = textK; store.set('saath.textK', textK); }
  }
  /** Grip + point: move a card to wherever the learner aims. It then keeps that spot relative to the body. */
  _dragCard({ object, ray }) {
    const fo = this.followers.get(object); if (!fo) return;
    fo.hold = true; clearTimeout(fo._holdT); fo._holdT = setTimeout(() => { fo.hold = false; }, 400);
    const d = ray.direction.clone().transformDirection(this.stage.root.matrixWorld.clone().invert());
    const rayYaw = Math.atan2(-d.x, -d.z);
    fo.yaw = wrapAngle(rayYaw - this.headYaw);
    const val = (v) => (typeof v === 'function' ? v() : v), dist = val(fo.dist), flat = Math.max(0.2, Math.hypot(d.x, d.z));
    fo.dy = THREE.MathUtils.clamp((d.y / flat) * dist, -0.6, 0.7) - Math.sin(fo.p ?? 0) * dist;
  }
  unfollow(mesh) { this.followers.delete(mesh); }
  _follow(mesh, fo, dt, snap = false) {
    const val = (v) => (typeof v === 'function' ? v() : v);
    const tYaw = this.headYaw + val(fo.yaw), tPitch = THREE.MathUtils.clamp(this.headPitch * 0.5, -0.3, 0.3);
    const hovering = fo.hold || mesh.userData.surface?.hoverId != null;     // never move a card that is being aimed at, read or dragged
    if (fo.a === undefined || snap) { fo.a = tYaw; fo.p = tPitch; fo.moving = false; }
    else if (!hovering) {
      const e = wrapAngle(tYaw - fo.a), ep = tPitch - fo.p;
      if (Math.abs(e) > 2.2) { fo.a = tYaw; fo.p = tPitch; fo.moving = false; }
      else {
        if (Math.abs(e) > 0.5 || Math.abs(ep) > 0.35) fo.moving = true;       // dead zone: about 29 degrees sideways, 20 degrees up/down
        if (fo.moving) { const k = 1 - Math.exp(-dt * (this.reduceMotion ? 20 : 4)); fo.a += e * k; fo.p += ep * k; if (Math.abs(e) < 0.04 && Math.abs(ep) < 0.04) fo.moving = false; }
      }
    }
    const h = this.headLocal, hy = h.y > 0.5 ? h.y : this.h, cp = Math.cos(fo.p), d = val(fo.dist);
    _v.set(h.x - Math.sin(fo.a) * cp * d, hy + Math.sin(fo.p) * d + val(fo.dy), h.z - Math.cos(fo.a) * cp * d);
    if (mesh.parent && mesh.parent !== this.stage.root) { this.stage.root.localToWorld(_v); mesh.parent.worldToLocal(_v); }
    mesh.position.copy(_v);
    mesh.rotation.set(fo.p * 0.95 - 0.1, fo.a, 0);
    mesh.scale.setScalar(val(fo.scale) ?? 1);
  }
  snapPanelToGaze() { for (const [mesh, fo] of this.followers) { fo.a = undefined; fo.p = undefined; if (mesh.visible) this._follow(mesh, fo, 0, true); } }
  recenter() { this.snapPanelToGaze(); }

  setVisible(v) { this.visible = v; this._applyPresentation(); }
}
