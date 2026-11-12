import * as THREE from 'three';
import { Surface } from '../ui/surface.js';
import { PRACTICE as P, COLORS } from '../config.js';
import { FONT, roundRect } from '../util.js';
import { lerp, ease } from '../util.js';

const W = 720, H = 1360;

/**
 * The learner's virtual phone. It is the first thing in the journey and it stays available all the way through:
 * the booking is always one tap away, and the boarding pass is stored on it after check-in.
 *
 * Views: lock (one notification) -> booking (summary) -> details (more) ; pass (after check-in).
 * Poses: ready (within comfortable reach, tilted to you) · large (accessible reading size, replaces the small one) · away (put away, recallable).
 * Aim at a button and pinch / press the trigger. Aim at the phone's edge, pinch and hold to pick it up; let go and it settles back.
 */
export class Phone {
  constructor(director) {
    this.d = director;
    this.view = 'lock'; this.pose = 'away'; this.large = false; this.opened = false; this.grabbedOnce = false;
    this.inventory = { booking: true, id: true, pass: false };   // one authoritative record for the whole journey
    this.toast = ''; this.toastLeft = 0;
    this.onEvent = null;      // (name) => void : 'opened' | 'ready' | 'packing' | 'away' | 'grabbed'

    const w = 0.15, h = w * H / W;
    this.size = { w, h };
    this.group = new THREE.Group(); this.group.name = 'Phone'; this.group.visible = false;
    const body = new THREE.Mesh(new THREE.BoxGeometry(w + 0.018, h + 0.018, 0.011), new THREE.MeshStandardMaterial({ color: 0x0f1318, roughness: 0.35, metalness: 0.6 }));
    body.castShadow = true; this.body = body;
    this.screen = new Surface({ width: w, pxW: W, pxH: H, transparent: false });
    this.screen.painter = (ctx) => this.paint(ctx);
    this.screen.onSelect = (id) => this.tap(id);
    this.screen.mesh.position.z = 0.0058;
    this.group.add(body, this.screen.mesh);
    // the grab handle is the whole phone; screen presses win over grabbing, so grabbing is done from the edge
    this.screen.redraw();
    director.stage.root.add(this.group);
    this.attach();
    this.tw = null;
  }

  get d_() { return this.d; }

  /** (Re)register with the input system, which is cleared whenever a step is torn down. */
  attach() {
    const d = this.d;
    d.input.addInteractive(this.screen.mesh);
    d.input.addGrabbable(this.group, { home: d.stage.root, radius: 0.2, rest: 'none', restOffset: 0, onGrab: () => this._grabbed(), onRelease: () => { this._released(); return true; } });
    this.screen.mesh.userData.system = false;
  }

  detach() { this.d.input.removeInteractive(this.screen.mesh); this.d.input.removeGrabbable(this.group); }

  // ------------------------------------------------------------------ poses
  poseTarget(pose) {
    const d = this.d, lap = d.lapY, hy = d.h;
    if (pose === 'large') return { p: new THREE.Vector3(0, hy - 0.12, -0.8), rx: -0.12, s: 0.95 };
    if (pose === 'away') return { p: new THREE.Vector3(0.3, lap - 0.32, 0.02), rx: -0.2, s: 0.22 };   // your pocket, at the hip
    return { p: new THREE.Vector3(0.1, lap + 0.3, -0.5), rx: -0.5, s: 0.5 };
  }

  setPose(pose, dur = 0.5) {
    const d = this.d; this.pose = pose;
    const t = this.poseTarget(pose), g = this.group;
    if (pose !== 'away') g.visible = true;
    const p0 = g.position.clone(), rx0 = g.rotation.x, s0 = g.scale.x || 0.01;
    d.tweens.add({ dur: d.reduceMotion ? 0.01 : dur, update: (e) => { const k = ease(e); g.position.lerpVectors(p0, t.p, k); g.rotation.set(lerp(rx0, t.rx, k), 0, 0); g.scale.setScalar(lerp(s0, t.s, k)); }, done: () => { if (pose === 'away') g.visible = false; } });
    this.screen.mesh.userData.interact = pose === 'away' ? null : this.screen;
    if (pose === 'away') d.input.removeInteractive(this.screen.mesh); else d.input.addInteractive(this.screen.mesh);
  }

  /** Bring the phone up. From the pocket it is drawn out and turned to face you. */
  show(view = this.view, pose = 'ready') {
    this.view = view; this.screen.redraw();
    if (this.pose === 'away' || !this.group.visible) { const a = this.poseTarget('away'), g = this.group; g.position.copy(a.p); g.rotation.set(a.rx, 0, 0); g.scale.setScalar(a.s); g.visible = true; }
    this.setPose(pose, 1.1);
  }
  putAway() { this.setPose('away', 0.45); this.onEvent?.('away'); }
  recall() { this.group.visible = true; this.setPose(this.large ? 'large' : 'ready'); }
  get isAway() { return this.pose === 'away'; }

  _grabbed() { if (!this.grabbedOnce) { this.grabbedOnce = true; this.onEvent?.('grabbed'); } }
  _released() { this.setPose(this.large ? 'large' : 'ready', 0.5); }   // settles back: stable, never lost

  notify(text, seconds = 5) { this.toast = text; this.toastLeft = seconds; this.screen.redraw(); }
  update(dt) { if (this.toastLeft > 0 && (this.toastLeft -= dt) <= 0) { this.toast = ''; this.screen.redraw(); } }

  addPass() { this.inventory.pass = true; this.notify('Boarding pass saved to your phone'); }

  // ------------------------------------------------------------------ interaction
  tap(id) {
    if (id === 'open') { this.view = 'booking'; this.opened = true; this.onEvent?.('opened'); }
    else if (id === 'more') this.view = 'details';
    else if (id === 'back') this.view = this.inventory.pass && this.view === 'pass' ? 'booking' : 'booking';
    else if (id === 'pass') this.view = 'pass';
    else if (id === 'booking') this.view = 'booking';
    else if (id === 'larger') { this.large = !this.large; this.setPose(this.large ? 'large' : 'ready'); }
    else if (id === 'away') { this.putAway(); return; }
    else if (id === 'ready') { this.onEvent?.('ready'); return; }
    else if (id === 'packing') { this.onEvent?.('packing'); return; }
    this.screen.redraw();
  }

  // ------------------------------------------------------------------ drawing
  paint(ctx) {
    const s = this.screen; s.hot = [];
    const T = (t, x, y, f, c, a = 'left') => { ctx.font = f; ctx.fillStyle = c; ctx.textAlign = a; ctx.fillText(t, x, y); ctx.textAlign = 'left'; };
    const hot = (id, x, y, w, h) => { s.hot.push({ id, x, y, w, h }); return s.hoverId === id || s.pressedId === id; };
    const button = (id, label, x, y, w, h, primary) => {
      const on = hot(id, x, y, w, h);
      ctx.fillStyle = primary ? (on ? COLORS.tealDark : COLORS.teal) : (on ? '#cfe9e7' : '#eef3f4');
      roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
      if (!primary) { ctx.strokeStyle = 'rgba(15,34,54,0.2)'; ctx.lineWidth = 3; roundRect(ctx, x, y, w, h, h / 2); ctx.stroke(); }
      T(label, x + w / 2, y + h / 2 + 15, `700 44px ${FONT}`, primary ? '#fff' : COLORS.navy, 'center');
    };
    const first = P.passenger.split(' ')[0];

    if (this.view === 'lock') {
      const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, '#16324a'); g.addColorStop(1, '#0b1f33'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
      T('9:41', W / 2, 250, `300 170px ${FONT}`, '#fff', 'center'); T('Wednesday', W / 2, 320, `500 42px ${FONT}`, 'rgba(255,255,255,0.8)', 'center');
      const on = hot('open', 40, 520, W - 80, 250);
      ctx.fillStyle = on ? 'rgba(255,255,255,0.97)' : 'rgba(255,255,255,0.9)'; roundRect(ctx, 40, 520, W - 80, 250, 36); ctx.fill();
      ctx.fillStyle = COLORS.teal; roundRect(ctx, 70, 552, 62, 62, 16); ctx.fill();
      T(P.airline, 150, 580, `700 34px ${FONT}`, COLORS.muted); T('now', W - 70, 580, `500 30px ${FONT}`, COLORS.muted, 'right');
      T('Your booking is ready', 70, 676, `800 50px ${FONT}`, COLORS.navy); T(`${P.flight} · ${P.from.city} to ${P.to.city}`, 70, 730, `500 34px ${FONT}`, COLORS.ink);
      T('Tap to open', W / 2, 900, `600 40px ${FONT}`, 'rgba(255,255,255,0.85)', 'center');
    } else {
      ctx.fillStyle = '#e9eff1'; ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, W, 124);
      T('9:41', 34, 62, `700 32px ${FONT}`, COLORS.navy);
      T(this.view === 'pass' ? 'Boarding pass' : this.view === 'details' ? 'Trip details' : 'Your booking', W / 2, 100, `800 40px ${FONT}`, COLORS.navy, 'center');
      const lg = hot('larger', W - 190, 18, 160, 88); ctx.fillStyle = lg ? '#cfe9e7' : '#eef3f4'; roundRect(ctx, W - 190, 18, 160, 88, 44); ctx.fill(); T(this.large ? 'Smaller' : 'Larger', W - 110, 74, `700 32px ${FONT}`, COLORS.navy, 'center');
      ctx.save(); ctx.shadowColor = 'rgba(0,0,0,0.18)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5; ctx.fillStyle = '#fffefb'; roundRect(ctx, 24, 148, W - 48, 930, 28); ctx.fill(); ctx.restore();
      ctx.fillStyle = COLORS.teal; roundRect(ctx, 24, 148, W - 48, 100, 28); ctx.fill(); ctx.fillRect(24, 200, W - 48, 48);
      T(P.airline, 60, 212, `800 42px ${FONT}`, '#fff'); T('PRACTICE ONLY', W - 60, 212, `700 28px ${FONT}`, 'rgba(255,255,255,0.9)', 'right');

      if (this.view === 'booking') {
        T(`Hello, ${first}`, 60, 320, `800 52px ${FONT}`, COLORS.navy);
        T(P.from.code, 60, 460, `800 130px ${FONT}`, COLORS.navy); T(P.to.code, W - 60, 460, `800 130px ${FONT}`, COLORS.navy, 'right');
        ctx.strokeStyle = COLORS.teal; ctx.lineWidth = 8; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(332, 410); ctx.lineTo(388, 410); ctx.moveTo(372, 392); ctx.lineTo(390, 410); ctx.lineTo(372, 428); ctx.stroke();
        T(P.from.city, 60, 512, `600 36px ${FONT}`, COLORS.muted); T(P.to.city, W - 60, 512, `600 36px ${FONT}`, COLORS.muted, 'right');
        ctx.fillStyle = '#e8f3f2'; roundRect(ctx, 48, 556, W - 96, 120, 22); ctx.fill();
        T(P.flight, 76, 636, `800 60px ${FONT}`, COLORS.navy); T(`Departs ${P.departure}`, W - 76, 608, `800 40px ${FONT}`, COLORS.navy, 'right'); T(`Boarding ${P.boarding}`, W - 76, 654, `600 32px ${FONT}`, COLORS.muted, 'right');
        const bw = (W - 96 - 24) / 3;
        [['TERMINAL', P.terminal], ['SEAT', P.seat], ['CHECK-IN', P.checkin]].forEach(([k, v], i) => { const bx = 48 + i * (bw + 12); ctx.fillStyle = '#fff'; roundRect(ctx, bx, 704, bw, 150, 20); ctx.fill(); ctx.strokeStyle = 'rgba(15,34,54,0.14)'; ctx.lineWidth = 3; roundRect(ctx, bx, 704, bw, 150, 20); ctx.stroke(); T(k, bx + 20, 746, `700 24px ${FONT}`, COLORS.muted); T(String(v), bx + 20, 818, `800 64px ${FONT}`, COLORS.navy); });
        const mo = hot('more', 48, 880, W - 96, 90); T('More details  ›', 60, 940, `700 40px ${FONT}`, COLORS.tealDark);
        if (mo) { ctx.strokeStyle = COLORS.teal; ctx.lineWidth = 4; roundRect(ctx, 48, 880, W - 96, 90, 20); ctx.stroke(); }
        T('Practice only · fictional flight', W / 2, 1040, `600 28px ${FONT}`, COLORS.warn, 'center');
        button('ready', 'Ready for the airport', 36, 1100, W - 72, 110, true);
        button('packing', 'Practise packing', 36, 1226, (W - 90) / 2 + 40, 96, false); button('away', 'Put away', 36 + (W - 90) / 2 + 58, 1226, (W - 90) / 2 - 22, 96, false);
        if (this.inventory.pass) { const pb = hot('pass', 380, 330, 290, 70); ctx.fillStyle = pb ? '#cfe9e7' : '#e8f3f2'; roundRect(ctx, 380, 330, 290, 70, 35); ctx.fill(); T('Boarding pass', 525, 378, `700 32px ${FONT}`, COLORS.tealDark, 'center'); }
      } else if (this.view === 'details') {
        let y = 330; const row = (k, v) => { T(k, 60, y, `800 40px ${FONT}`, COLORS.navy); y += 50; T(v, 60, y, `500 36px ${FONT}`, COLORS.ink); y += 80; };
        row('Baggage', `Cabin bag up to 7 kg · Checked bag up to 15 kg`); row('Check-in', `Desk ${P.checkin}, Terminal ${P.terminal}`); row('Bring', 'This booking and a photo ID');
        row('Note', 'Practice scenario. Check your real airline for real limits.');
        button('back', '‹  Back', 36, 1100, W - 72, 110, true); button('away', 'Put away', 36, 1226, W - 72, 96, false);
      } else if (this.view === 'pass') {
        T(P.passengerUpper, 60, 330, `800 44px ${FONT}`, COLORS.navy); T(`${P.flight} · ${P.from.code} to ${P.to.code}`, 60, 400, `600 40px ${FONT}`, COLORS.ink);
        const bw = (W - 96 - 12) / 2;
        [['GATE', P.gateOriginal], ['SEAT', P.seat]].forEach(([k, v], i) => { const bx = 48 + i * (bw + 12); ctx.fillStyle = '#fff'; roundRect(ctx, bx, 450, bw, 190, 20); ctx.fill(); ctx.strokeStyle = 'rgba(15,34,54,0.14)'; ctx.lineWidth = 3; roundRect(ctx, bx, 450, bw, 190, 20); ctx.stroke(); T(k, bx + 24, 496, `700 28px ${FONT}`, COLORS.muted); T(String(v), bx + 24, 596, `800 100px ${FONT}`, COLORS.navy); });
        T(`Boarding ${P.boarding}  ·  Departs ${P.departure}`, 60, 710, `600 36px ${FONT}`, COLORS.ink);
        T('Gate shown here can change. Always check the screens.', 60, 790, `500 32px ${FONT}`, COLORS.muted);
        button('booking', '‹  Booking', 36, 1100, W - 72, 110, true); button('away', 'Put away', 36, 1226, W - 72, 96, false);
      }
      if (this.toast) { ctx.fillStyle = 'rgba(11,31,51,0.94)'; roundRect(ctx, 40, 1060, W - 80, 0, 0); ctx.fillStyle = 'rgba(11,31,51,0.95)'; roundRect(ctx, 40, 140, W - 80, 84, 42); ctx.fill(); T(this.toast, W / 2, 196, `700 34px ${FONT}`, '#fff', 'center'); }
    }
  }
}
