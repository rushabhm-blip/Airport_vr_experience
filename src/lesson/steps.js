import * as THREE from 'three';
import { PracticeScanner } from './scan-state.mjs';
import { RowTracker, Belongings } from './rules.mjs';
import { PRACTICE as P, COLORS } from '../config.js';
import { Surface } from '../ui/surface.js';
import { bookingCard, passCard, screenOverlay, Hotspot, labelSurface, setLabelText, ReadingCard } from '../ui/widgets.js';
import { FONT, roundRect, wrapText, ease, lerp } from '../util.js';
import { boardingPassCanvas, bookingCanvas, idCanvas, applyDocument, phonePdfCanvas } from '../ui/documents.js';
import { mergeStatic } from '../world/merge.js';
import { RoadVideo } from '../world/roadvideo.js';
import { tileTexture, boxUV } from '../world/images.js';
import { IMG, photoTexture, cropTexture, drawCover, planarUV, cutoutCrop, keyedCrop } from '../world/images.js';

/** A real photo as a distant backdrop (only in the virtual/immersive view; in passthrough it would float in the room). */
/** Two thin rods from the top of a hanging sign up to the ceiling (2.9 m), so it is visibly fixed to it. */
function hangRods(d, obj, ceilingY = 2.9) {
  const b = new THREE.Box3().setFromObject(obj), len = ceilingY - b.max.y; if (len < 0.03) return;
  const mat = new THREE.MeshStandardMaterial({ color: 0x9aa4ab, metalness: 0.6, roughness: 0.4 });
  for (const x of [b.min.x + 0.18, b.max.x - 0.18]) {
    const r = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, len, 8), mat);
    r.position.copy(d.stage.scenery.worldToLocal(new THREE.Vector3(x, b.max.y + len / 2, (b.min.z + b.max.z) / 2))); d.stage.scenery.add(r);
  }
}

/** A free-standing information board becomes a ceiling-hung one: the stand is removed and two rods reach the ceiling. Returns the y to place it at. */
function hangBoardY(obj) {
  obj.traverse((o) => { if (o.name === 'Base' || o.name === 'DisplayPost') o.visible = false; });
  const hb = new THREE.Box3().setFromObject(obj.getObjectByName('DisplayHousing'));
  return 2.6 - hb.max.y;      // the top of the board sits 0.3 m under the 2.9 m ceiling; rods bridge the gap
}

function photoPlane(d, name, w, h, pos) {
  if (d.app.env.mode !== 'immersive') return null;
  if (d.app.env.use360 && name === 'checkin-hall') return null;
  if (d.app.env.theme360 && name === 'view-hall-wide') return null;      // the 360 airport photograph already shows the terminal      // the 360 hall already surrounds the check-in counters
  const t = photoTexture(name); if (!t) return null;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false }));
  m.position.set(...pos); d.stage.scenery.add(m); return m;
}

/** A pack document mesh wearing a detailed, personalised texture. The printed gate stays 12 even after the gate change. */
function makeDoc(d, id) {
  const root = d.assets.make(id, { actions: false, unique: ['DocumentFace'] });
  applyDocument(root, id === 'boarding-pass' ? boardingPassCanvas() : id === 'booking-document' ? bookingCanvas() : idCanvas());
  return root;
}

const FLAT_X = -Math.PI / 2;
const faceUser = (x, z) => Math.atan2(-x, -z);           // yaw so a +Z-facing plane looks at the seat origin
const pulse = () => 0.5 + 0.5 * Math.sin(performance.now() / 260);
const D = 'display-';

/* ------------------------------------------------------------------ shared painters */
function paintSign({ lines, sub, arrow, state }) {
  return (ctx, s) => {
    const W = s.pxW, H = s.pxH;
    s.hot = [{ id: 'sel', x: 0, y: 0, w: W, h: H }];
    const hover = s.hoverId === 'sel';
    ctx.fillStyle = state.status === 'ok' ? '#0f5c3f' : state.status === 'bad' ? '#7a1d2e' : '#0b1f33';
    roundRect(ctx, 0, 0, W, H, 28); ctx.fill();
    if (hover || state.glow) { ctx.strokeStyle = COLORS.tealGlow; ctx.lineWidth = 14; roundRect(ctx, 7, 7, W - 14, H - 14, 24); ctx.stroke(); }
    ctx.fillStyle = COLORS.yellow; roundRect(ctx, 40, H / 2 - 70, 120, 120, 22); ctx.fill();
    ctx.fillStyle = '#0b1f33'; ctx.font = `800 70px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('✈', 100, H / 2 - 8);
    ctx.textAlign = 'left'; ctx.fillStyle = '#fff'; ctx.font = `800 ${lines.length > 1 ? 92 : 100}px ${FONT}`;
    ctx.fillText(lines[0], 200, H / 2 - (sub ? 26 : 8));
    if (sub) { ctx.fillStyle = COLORS.yellow; ctx.font = `700 54px ${FONT}`; ctx.fillText(sub, 204, H / 2 + 62); }
    if (arrow) { ctx.fillStyle = COLORS.yellow; ctx.font = `800 130px ${FONT}`; ctx.textAlign = 'right'; ctx.fillText(arrow, W - 40, H / 2 - 4); ctx.textAlign = 'left'; }
    ctx.textBaseline = 'alphabetic';
  };
}

/** Layout is proportional to the canvas height so it fits whatever aspect the model's screen has. */
function paintBoard(state, rows, header = 'Departures') {
  return (ctx, s) => {
    const W = s.pxW, H = s.pxH;
    ctx.fillStyle = '#0b1f33'; roundRect(ctx, 0, 0, W, H, 24); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 ${Math.round(H * 0.13)}px ${FONT}`; ctx.fillText('✈  ' + header, 48, H * 0.15);
    const cols = [48, 250, 630, 850];
    ctx.fillStyle = '#9fb6c8'; ctx.font = `600 ${Math.round(H * 0.07)}px ${FONT}`;
    ['Flight', 'Destination', 'Departure', 'Gate'].forEach((t, i) => ctx.fillText(t, cols[i], H * 0.27));
    s.hot = [];
    const y0 = H * 0.31, rowH = (H * 0.97 - y0) / rows.length, h = rowH * 0.88;
    rows.forEach((r, i) => {
      const y = y0 + i * rowH;
      const sel = state.selected === r.id, hov = s.hoverId === r.id, hi = state.highlight === r.id;
      if (sel || hi || hov) { ctx.strokeStyle = state.status === 'bad' && sel ? COLORS.warn : COLORS.tealGlow; ctx.lineWidth = hi ? 6 + 4 * pulse() : 6; roundRect(ctx, 28, y, W - 56, h, 20); ctx.stroke(); }
      if (sel) { ctx.fillStyle = state.status === 'bad' ? 'rgba(212,52,79,0.2)' : 'rgba(56,225,210,0.16)'; roundRect(ctx, 28, y, W - 56, h, 20); ctx.fill(); }
      ctx.fillStyle = '#fff'; ctx.font = `700 ${Math.round(h * 0.52)}px ${FONT}`;
      const by = y + h * 0.68;
      ctx.fillText(r.flight, cols[0], by); ctx.fillText(r.dest, cols[1], by); ctx.fillText(r.time, cols[2], by);
      ctx.fillStyle = r.gateColor || COLORS.yellow; ctx.fillText(r.gate, cols[3], by);
      s.hot.push({ id: r.id, x: 28, y, w: W - 56, h });
    });
  };
}

/** Replace the pack's monitor art with lesson-accurate text (the stock texture says "Gate 18" at check-in). */
function staffScreen(ws, lines) {
  return screenOverlay(ws, { pxW: 640, paint: (ctx, s) => {
    ctx.fillStyle = '#10222f'; roundRect(ctx, 0, 0, s.pxW, s.pxH, 16); ctx.fill();
    ctx.fillStyle = '#7fe3da'; ctx.font = `700 ${Math.round(s.pxH * 0.12)}px ${FONT}`; ctx.fillText(lines[0], 24, s.pxH * 0.22);
    ctx.fillStyle = '#fff'; ctx.font = `600 ${Math.round(s.pxH * 0.1)}px ${FONT}`;
    lines.slice(1).forEach((l, i) => ctx.fillText(l, 24, s.pxH * (0.42 + i * 0.17)));
  } });
}

function loadTex(path) {
  const t = new THREE.TextureLoader().load(path);
  t.flipY = false; t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/* ------------------------------------------------------------------ 1. booking */
const booking = (d) => {
  let card, stage = 0; const done = new Set();
  const wrongHint = { name: 'That is your name. Look for the airline and a code like PA101.', to: 'That is where you are flying to. Look for the word From.', dep: 'That is the time. Look for the airline and flight code.', terminal: 'Terminal comes later. First find the flight number.', ref: 'That is the booking reference. Look for the airline and flight.' };
  return {
    id: 'booking', assets: [],
    voice: `${P.hasName ? 'Hello ' + P.passenger + '. ' : ''}Start with your booking. Find your flight number and your departure airport. Point at it and pinch, or press the trigger.`,
    help: 'Your flight number is the airline name, followed by letters and numbers, for example PA101. The departure airport is listed after the word From.',
    helpShort: 'Flight number: letters then numbers',
    enter() {
      card = bookingCard(); card.onSelect = (id) => this.tap(id);
      d.addSurface(card, { pos: [0.34, d.h - 0.06, -0.82], ry: faceUser(0.34, -0.82), follow: { yaw: -0.42, dist: 1.4, scale: 0.8, dy: -0.02 } });
      d.setPanel({ eyebrow: 'Airport practice · 1 of 8', title: 'Start with your booking.', body: 'Find your flight number and departure airport.', note: 'Step 1 of 2 · flight number', tone: 'normal', buttons: [{ id: 'hl', label: 'Highlight flight number' }, { id: 'read', label: 'Read aloud', kind: 'secondary' }] });
    },
    demo() {
      const want = stage === 0 ? 'flight' : 'from';
      const near = d.surfacePoint(card, want, 0.14), on = d.surfacePoint(card, want, 0.015);
      d.runDemo([{ p: near.toArray(), dur: 1.1 }, { p: on.toArray(), dur: 0.5, press: true, act: () => card.setState({ highlight: want, done }) }],
        { say: stage === 0 ? 'Watch. The flight number is the airline name and a code, like PA101. You tap it, like this.' : 'Now the departure airport is on the line that says From. Tap it, like this.', apply: () => this.tap(want) });
    },
    onButton(id) {
      if (id === 'hl') { card.setState({ highlight: stage === 0 ? 'flight' : 'from', done }); d.startAssist(); }
      if (id === 'read') d.say(`Booking confirmation. Passenger ${P.passenger}. Airline and flight ${P.airline} ${P.flight}. From ${P.from.city}. To ${P.to.city}. Departure ${P.departure}. Terminal ${P.terminal}.`);
    },
    tap(id) {
      const want = stage === 0 ? 'flight' : 'from';
      if (id === want) {
        done.add(id); card.setState({ highlight: null, done }); d.voice.beep();
        if (stage === 0) {
          stage = 1;
          d.setPanel({ title: 'Now find where you fly from.', body: 'Tap the departure airport.', note: 'Step 2 of 2 · departure airport', buttons: [{ id: 'hl', label: 'Highlight airport' }, { id: 'read', label: 'Read aloud', kind: 'secondary' }] });
          d.say('Good. That is your flight number. Now find the departure airport.');
        } else d.success('You found your flight.', `${P.airline} ${P.flight} leaves from ${P.from.city}. Your boarding pass comes after check-in.`);
      } else { card.setState({ wrong: id, done, highlight: card.highlight }); d.nudge(wrongHint[id] || 'Not quite. Look again.'); }
    },
  };
};

/* ------------------------------------------------------------------ 2. terminal */
const terminal = (d) => {
  const st = [{ status: 'idle' }, { status: 'idle' }]; let signs = [], doc = null, tag = null, finished = false;
  return {
    id: 'terminal', assets: ['terminal-sign', 'booking-document'],
    voice: 'Check the terminal first. Match the terminal on your booking with the sign.',
    help: 'Your booking says which terminal your airline uses. Look for the line that says Terminal, then match the number with the signs.',
    helpShort: 'Booking says Terminal 2',
    enter() {
      [['Terminal 1', 'Departures', '←', -1.0], ['Terminal 2', 'Departures', '↑', 1.0]].forEach(([a, b, arrow, x], i) => {
        const s = d.assets.make('terminal-sign', { unique: ['EditableScreen'] });
        d.addScenery(s, { x, y: -0.3, z: -2.5 });
        const ov = screenOverlay(s, { pxW: 1024, paint: paintSign({ lines: [a], sub: b, arrow, state: st[i] }) });
        ov.onSelect = () => this.pick(i); d.track(ov); signs.push(ov);
      });
      doc = makeDoc(d, 'booking-document');
      doc.scale.setScalar(1.15);
      doc.rotation.x = -0.55;
      d.addProp(doc, { radius: 0.2, rest: 'flat' }, [0.02, d.h - 0.4, -0.5]);
      d.setPanel({ eyebrow: 'Airport practice · 2 of 8', title: 'Check the terminal first.', body: 'Match the terminal on your booking with the sign.', note: '', tone: 'normal', buttons: [{ id: 'docs', label: 'Show documents' }, { id: 'help', label: 'Ask for help', kind: 'secondary' }] });
    },
    onButton(id) {
      if (id === 'docs') {
        d.tweens.add({ dur: 0.8, update: (e) => { doc.position.lerp(new THREE.Vector3(0.05, d.h - 0.2, -0.45), 0.2 * e + 0.05); doc.rotation.x = lerp(doc.rotation.x, -0.25, 0.2); } });
        if (!tag) { tag = labelSurface('Terminal 2', { w: 0.3 }); d.addSurface(tag, { pos: [0.05, d.h + 0.05, -0.45], ry: 0, interactive: false }); }
        d.say('Your booking says Terminal 2. Now look for that number on the signs ahead.');
      }
      if (id === 'help') d.help();
    },
    demo() {
      if (finished) return;
      const near = d.surfacePoint(signs[1], 'sel', 0.25), on = d.surfacePoint(signs[1], 'sel', 0.02);
      d.runDemo([{ p: [0.05, d.h - 0.2, -0.45], dur: 0.8, hold: 0.5 }, { p: near.toArray(), dur: 1.4 }, { p: on.toArray(), dur: 0.6, press: true }],
        { say: 'Your booking says Terminal 2. Find that number on the signs, and tap it, like this. Then we walk to it.', apply: () => this.pick(1) });
    },
    pick(i) {
      if (finished) return;
      if (i === 1) {
        finished = true; st[1].status = 'ok'; signs[1].redraw(); d.voice.beep();
        d.setPanel({ title: 'Terminal 2. Let us walk there.', body: 'Walking towards the Terminal 2 entrance…', note: 'You stay seated', buttons: [] });
        d.walkToward(d.surfacePoint(signs[1], 'sel'), 1.2, () => d.success('You reached Terminal 2.', 'Your booking and the sign agree. Next, head to check-in.'));
      }
      else { st[0].status = 'bad'; signs[0].redraw(); d.tweens.add({ dur: 1.4, done: () => { st[0].status = 'idle'; signs[0].redraw(); } }); d.nudge('That is Terminal 1. Your booking says Terminal 2.'); }
    },
  };
};

/* ------------------------------------------------------------------ 3. check-in */
const checkin = (d) => {
  let agent, desk, zoneMesh, booking, id, pass, card, phase = 'drop', timer = 0, labelS, printer, taps = new Set(), printed = false;
  const zone = { min: new THREE.Vector3(-0.62, 0.95, -0.3), max: new THREE.Vector3(0.62, 1.6, 0.36) };
  const inZone = (o) => { const p = desk.worldToLocal(o.getWorldPosition(new THREE.Vector3())); return p.x > zone.min.x && p.x < zone.max.x && p.y > zone.min.y && p.y < zone.max.y && p.z > zone.min.z && p.z < zone.max.z; };
  return {
    id: 'checkin', scene: 'hall-wall', people: ['checkin'], panelOffset: 0.95, assets: ['checkin-counter', 'staff-workstation', 'boarding-pass-printer', 'boarding-pass', 'booking-document', 'practice-id', 'terminal-sign', 'queue-barrier'],
    voice: 'Show your documents. Place your booking and your ID on the counter.',
    help: 'At check-in the airline staff need your booking and a photo ID. Put both on the counter, then wait for your boarding pass.',
    helpShort: 'Booking and ID on the counter',
    enter() {
      desk = new THREE.Group();
      const counter = d.assets.make('checkin-counter'); desk.add(counter);
      const ws = d.assets.make('staff-workstation', { unique: ['EditableScreen'] }); ws.position.set(0, 1.027, -0.1); desk.add(ws);
      d.track(staffScreen(ws, ['PRACTICE AIR · CHECK-IN', P.passengerUpper, 'PA101  BLR → BOM', 'Documents: waiting']), false);
      printer = d.assets.make('boarding-pass-printer'); printer.position.set(0.5, 1.027, 0.1); desk.add(printer);
      d.addScenery(desk, { x: 0, z: -1.5, fixed: true }); d.obstacle(desk);
      d.setStation({ point: new THREE.Vector3(0, 0, -1.5), label: 'the check-in counter', radius: 1.4 });
      agent = d.addStaff('checkin', 'Check-in agent · practice', desk, [-0.55, 0, -0.85]);
      agent.say('Good morning. Booking and photo ID, please.', 8);
      photoPlane(d, 'checkin-hall', 9.6, 3.2, [0, 1.6, -5.2]);
      const barrier = d.assets.make('queue-barrier'); d.addScenery(barrier, { x: -3.0, z: -0.9, ry: 0.3 });
      const sign = d.assets.make('terminal-sign', { unique: ['EditableScreen'] });
      d.addScenery(sign, { x: 0, y: -0.19, z: -3.1 }); hangRods(d, sign);      // hangs from the ceiling on two rods
      screenOverlay(sign, { pxW: 1024, paint: paintSign({ lines: ['Check-in'], sub: 'Practice Air · ' + P.checkin, arrow: '', state: {} }) });
      // pulsing drop area
      zoneMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLORS.tealGlow, transparent: true, opacity: 0.35, depthWrite: false, toneMapped: false }));
      zoneMesh.position.set(0, 1.032, 0.03); desk.add(zoneMesh);
      d.addSupport(-0.8, 0.8, -1.5 - 0.38, -1.5 + 0.38, 1.027);

      booking = makeDoc(d, 'booking-document'); booking.scale.setScalar(0.85); booking.rotation.x = -0.5;
      id = makeDoc(d, 'practice-id'); id.scale.setScalar(1.6); id.rotation.x = -0.5;
      // one click on a document puts it on the counter (it still can be picked up and dragged by hand)
      d.addProp(booking, { radius: 0.2, onTap: (o) => this.placeDoc(o, 0) }, [-0.18, d.h - 0.42, -0.45]);
      d.addProp(id, { radius: 0.15, onTap: (o) => this.placeDoc(o, 1) }, [0.2, d.h - 0.42, -0.45]);
      d.setPanel({ eyebrow: 'Airport practice · 3 of 8', title: 'Show your documents.', body: 'Click your booking and your ID to put them on the counter.', note: 'Booking ☐   ID ☐', tone: 'normal', buttons: [{ id: 'show', label: 'Show me' }, { id: 'help', label: 'Ask for help', kind: 'secondary' }] });
    },
    /** Slide a document from where it floats to its place on the counter. */
    placeDoc(o, k) {
      if (phase !== 'drop' || o.userData.placed) return;
      o.userData.placed = true; d.input.removeGrabbable(o); d.voice.soft();
      const from = o.position.clone(), to = d.worldToStage(desk.localToWorld(new THREE.Vector3(k ? 0.22 : -0.22, 1.036, 0.03)));
      const r0 = o.rotation.x, T = d.reduceMotion ? 0.05 : 0.7;
      d.tweens.add({ dur: T, update: (e) => { o.position.lerpVectors(from, to, e); o.position.y += Math.sin(e * Math.PI) * 0.12; o.rotation.x = r0 + (FLAT_X - r0) * e; }, done: () => { o.position.copy(to); o.rotation.set(FLAT_X, 0, 0); d.voice.beep(); } });
    },
    demo() {
      const toStage = (v) => d.worldToStage(desk.localToWorld(v));
      const here = (o) => d.stage.props.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
      if (phase === 'drop') {
        const fr = []; const spots = [[-0.22, 1.08, 0.03], [0.22, 1.08, 0.03]];
        [booking, id].forEach((o, k) => {
          if (inZone(o) && !o.userData.heldBy) return;
          const gh = d.makeGhost(o), a = here(o), z = toStage(new THREE.Vector3(...spots[k]));
          fr.push({ p: a.toArray(), dur: 0.9, hold: 0.25 }, { p: [(a.x + z.x) / 2, Math.max(a.y, z.y) + 0.15, (a.z + z.z) / 2], dur: 0.8, carry: gh }, { p: z.toArray(), dur: 0.6, carry: gh, press: true });
        });
        if (!fr.length) return;
        d.runDemo(fr, { say: 'Pick up your booking and your ID, then place both inside the glowing area on the counter, like this.', apply: () => {
          [booking, id].forEach((o, k) => { if (!inZone(o)) { o.position.copy(toStage(new THREE.Vector3(spots[k][0], 1.036, spots[k][2]))); o.rotation.set(FLAT_X, 0, 0); } });
        } });
      } else if (phase === 'collect' && pass) {
        const a = here(pass);
        d.runDemo([{ p: [a.x, a.y + 0.2, a.z + 0.15], dur: 1.0 }, { p: a.toArray(), dur: 0.5, press: true }], { say: 'Your boarding pass is on the counter. Pick it up, like this.', apply: () => this.collected() });
      } else if (phase === 'read' && card) {
        const want = taps.has('name') ? 'flight' : 'name';
        d.runDemo([{ p: d.surfacePoint(card, want, 0.14).toArray(), dur: 1.0 }, { p: d.surfacePoint(card, want, 0.015).toArray(), dur: 0.5, press: true }], { say: 'Tap the highlighted line to check it, like this.', apply: () => this.cardTap(want) });
      }
    },
    onButton(id_) {
      if (id_ === 'show') d.startAssist();
      if (id_ === 'help') d.help();
      if (id_ === 'read') this.showCard();
    },
    update(dt) {
      zoneMesh.material.opacity = phase === 'drop' ? 0.2 + 0.25 * pulse() : 0.0;
      if (phase === 'drop') {
        const b = !booking.userData.heldBy && inZone(booking), i = !id.userData.heldBy && inZone(id);
        const note = `Booking ${b ? '☑' : '☐'}   ID ${i ? '☑' : '☐'}`;
        if (d.panel.state.tone === 'normal' && d.panel.state.note !== note && d.panel.state.note.startsWith('Booking')) d.panel.set({ note });
        if (b && i) { phase = 'process'; timer = 0; d.voice.beep(); agent?.say('Thank you. One moment, please.'); d.panel.set({ eyebrow: 'Airport practice · 3 of 8', title: 'The agent is checking you in…', body: 'Wait a moment while your boarding pass prints.', note: '', buttons: [] }); d.say('Thank you. Please wait while your boarding pass prints.'); }
      } else if (phase === 'process') {
        timer += dt;
        if (timer > 1.8 && !printed) {
          printed = true;
          pass = makeDoc(d, 'boarding-pass');
          pass.scale.setScalar(1.3);
          const start = new THREE.Vector3(0.5, 1.15, 0.0), end = new THREE.Vector3(0.38, 1.04, 0.3);
          pass.position.copy(start); pass.rotation.set(FLAT_X, 0, 0);
          pass.userData.doc = { type: 'boarding-pass', flight: P.flight, date: P.date, printedGate: P.gateOriginal };
          desk.add(pass);
          d.tweens.add({ dur: 1.0, update: (e) => pass.position.lerpVectors(start, end, e), done: () => {
            d.stage.props.attach(pass);
            d.input.addGrabbable(pass, { home: d.stage.props, radius: 0.22, onGrab: () => this.collected() });
            phase = 'collect'; d.voice.beep(); agent?.say(`Here you go. Gate ${P.gateOriginal}, seat ${P.seat}.`, 8);
            d.setPanel({ eyebrow: 'Airport practice · 3 of 8', title: 'Collect your boarding pass.', body: 'Pick it up from the counter. Then check your name and flight.', note: '', buttons: [{ id: 'show', label: 'Show me', kind: 'secondary' }] });
            d.say('Your boarding pass is ready. Pick it up from the counter.');
          } });
        }
      }
    },
    collected() {
      if (phase !== 'collect') return;
      phase = 'read'; d.voice.success(); d.phone?.addPass();   // the pass is stored on the phone, the booking stays
      d.setPanel({ eyebrow: 'Airport practice · 3 of 8', title: 'Check your boarding pass.', body: 'Tap your name, then the flight.', note: 'Step 1 of 2 · name', buttons: [{ id: 'read', label: 'Read my boarding pass' }, { id: 'help', label: 'Ask for help', kind: 'secondary' }] });
      d.say('Well done. Now check that your name and flight are correct.');
      this.showCard();
    },
    showCard() {
      if (card) return;
      card = passCard(); card.onSelect = (k) => this.cardTap(k);
      d.addSurface(card, { pos: [0.36, d.h + 0.0, -0.9], ry: faceUser(0.36, -0.9), follow: { yaw: -0.42, dist: 1.4, scale: 0.8, dy: -0.02 } });
      card.setState({ highlight: 'name', done: taps });
    },
    cardTap(k) {
      const want = taps.has('name') ? 'flight' : 'name';
      if (k !== want) { if (['route', 'gate', 'seat', 'boarding'].includes(k)) card.setState({ highlight: want, done: taps }); d.nudge(want === 'name' ? 'First check that the name is yours.' : 'Now check the flight number: PA101.', true); return; }
      taps.add(k); d.voice.beep();
      if (k === 'name') { card.setState({ highlight: 'flight', done: taps }); d.panel.set({ note: 'Step 2 of 2 · flight' }); d.say('Good. Now check the flight number.'); }
      else { card.setState({ highlight: null, done: taps }); d.success('Boarding pass collected.', 'Your name and flight are correct. Gate 12 is printed on your pass. Keep it safe for security.'); }
    },
  };
};

/* ------------------------------------------------------------------ 4. security */
const security = (d) => {
  let officer, lane, tableB, tray, phone, pouch, bag, extras = [], phase = 'phone';
  const st = { inTray: new Set(), phoneIn: false, traySent: false, bagSent: false, arrived: new Set(), collected: new Set() };
  const bel = new Belongings(['phone', 'pouch', 'bag']);
  const belt = { min: new THREE.Vector3(-0.42, 0.68, -0.72), max: new THREE.Vector3(0.42, 1.5, 0.72) };
  const inBelt = (o) => { const p = lane.worldToLocal(o.getWorldPosition(new THREE.Vector3())); return p.x > belt.min.x && p.x < belt.max.x && p.y > belt.min.y && p.y < belt.max.y && p.z > belt.min.z && p.z < belt.max.z; };
  const tasks = () => [{ label: 'Tray', done: st.phoneIn && st.traySent, active: phase === 'phone' }, { label: 'Bag', done: st.bagSent, active: phase === 'bag' }, { label: 'Collect', done: phase === 'done', active: phase === 'collect' }];
  const refresh = (extra = {}) => d.panel.set({ tasks: tasks(), ...extra });
  const rideBelt = (obj, name) => {
    lane.attach(obj);
    d.input.grabbables.delete(obj);
    const z0 = obj.position.z, y = 0.73 + (name === 'tray' ? 0 : 0), x0 = obj.position.x;
    const zEnd = name === 'tray' ? -3.05 : -3.25, xEnd = name === 'tray' ? 0.08 : -0.12;
    d.voice.beep();
    const q0 = obj.quaternion.clone(), q1 = new THREE.Quaternion().setFromEuler(new THREE.Euler(name === 'bag' ? -Math.PI / 2 : 0, 0, 0));   // a trolley bag goes through the machine lying down
    d.tweens.add({ dur: 4.2, easing: (t) => t, update: (t) => { if (name === 'bag') obj.quaternion.slerpQuaternions(q0, q1, Math.min(1, t * 5)); obj.position.set(lerp(x0, xEnd, Math.min(1, t * 3)), y, lerp(z0, zEnd + (name === 'bag' ? 0.2 : 0), t)); }, done: () => { st.arrived.add(name); api.arrive(); } });
  };
  const api = {
    id: 'security', scene: 'hall-wall', people: ['security'], panelOffset: 0.85, assets: ['roller-table', 'security-xray-machine', 'security-tray', 'smartphone', 'cabin-suitcase', 'wallet', 'keys', 'walkthrough-detector'],
    voice: 'Security practice. Place your phone in the tray, then slide the tray and your bag onto the belt.',
    help: 'At security you put phones, keys and wallets in a tray, and bags on the belt. Take your time, and follow the officer.',
    helpShort: 'Phone in tray, then belt',
    enter() {
      lane = new THREE.Group();
      const tableA = d.assets.make('roller-table'); lane.add(tableA);
      const xray = d.assets.make('security-xray-machine'); xray.position.set(0, 0, -1.75); lane.add(xray);
      tableB = d.assets.make('roller-table'); tableB.position.set(0, 0, -3.5); tableB.rotation.y = Math.PI; lane.add(tableB);
      const detector = d.assets.make('walkthrough-detector'); detector.position.set(-1.3, 0, -1.75); lane.add(detector);
      d.addScenery(lane, { x: 0, z: -1.25, fixed: true });
      d.obstacle(tableA); d.obstacle(xray); d.obstacle(tableB);      // the belt and the machine are solid; the detector frame is a doorway
      d.setStation({ point: new THREE.Vector3(0, 0, -1.25), label: 'the security lane', radius: 1.7 });
      officer = d.addStaff('security', 'Security officer · practice', lane, [1.05, 0, -0.9]);
      officer.say('Phone and electronics in the tray, please. Bag on the belt.', 9);
      d.addSupport(-0.42, 0.42, -2.0, -0.5, 0.73);
      tray = d.assets.make('security-tray', { actions: false });
      d.addProp(tray, { radius: 0.28, rest: 'upright', restOffset: 0, inScenery: true }, [-0.05, 0.73, -0.78]);
      tray.userData.grab.onRelease = (o) => this.trayReleased(o);
      tray.userData.grab.onTap = (o) => this.tapTray(o);
      phone = d.assets.make('smartphone', { actions: false }); phone.scale.setScalar(1.25); phone.rotation.x = -0.5;
      d.addProp(phone, { radius: 0.17, rest: 'flat', restOffset: 0.006 }, [0.22, d.h - 0.4, -0.45]);
      phone.userData.grab.onRelease = (o) => this.phoneReleased(o);
      phone.userData.grab.onTap = (o) => this.tapToTray(o);
      phone.userData.tag = 'phone';
      phone.userData.grab.onGrab = () => { st.inTray.delete('phone'); st.phoneIn = false; if (phase === 'collect') this.gotItem('phone'); };
      pouch = labelBox(0.24, 0.05, 0.16, '#1f8a86', 'ELECTRONICS\nPOUCH', 30, 'item-pouch'); pouch.userData.tag = 'pouch';
      d.addProp(pouch, { radius: 0.17, rest: 'upright', restOffset: 0.025 }, [-0.2, d.h - 0.4, -0.45]);
      pouch.userData.grab.onRelease = (o) => this.phoneReleased(o);
      pouch.userData.grab.onTap = (o) => this.tapToTray(o);
      pouch.userData.grab.onGrab = () => { st.inTray.delete('pouch'); st.phoneIn = false; if (phase === 'collect') this.gotItem('pouch'); };
      bag = d.assets.make('cabin-suitcase', { actions: false });
      bag.userData.grabCenter = new THREE.Vector3(0, 0.45, 0);
      bag.scale.setScalar(0.9);
      d.addProp(bag, { radius: 0.34, rest: 'upright', restOffset: 0, inScenery: true }, [0.3, 0.73, -1.45]);
      bag.userData.grab.onRelease = (o) => this.bagReleased(o);
      bag.userData.grab.onTap = (o) => this.tapBag(o);
      bag.userData.grab.onGrab = () => { if (phase === 'collect') this.gotItem('bag'); };
      d.setPanel({ eyebrow: 'Airport practice · 4 of 8', title: 'Phone and pouch in the tray.', body: 'Click your phone and your pouch to put them in the tray.', note: 'Follow the security officer\'s instructions', tone: 'normal', tasks: tasks(), buttons: [{ id: 'show', label: 'Show me' }, { id: 'help', label: 'Ask for help', kind: 'secondary' }] });
    },
    demo() {
      const here = (o) => d.stage.props.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
      const laneP = (x, y, z) => d.worldToStage(lane.localToWorld(new THREE.Vector3(x, y, z)));
      const move = (o, to, up = 0.2) => { const gh = d.makeGhost(o), a = here(o); return [
        { p: a.toArray(), dur: 0.9, hold: 0.2 },
        { p: [(a.x + to.x) / 2, Math.max(a.y, to.y) + up, (a.z + to.z) / 2], dur: 0.8, carry: gh },
        { p: to.toArray(), dur: 0.7, carry: gh, press: true }]; };
      const put = (o, to) => { o.position.copy(to); o.updateMatrixWorld(true); };
      if (!st.phoneIn) { const m = !st.inTray.has('phone') ? phone : pouch, t = here(tray), to = new THREE.Vector3(t.x, t.y + 0.07, t.z); d.runDemo(move(m, to), { say: m === phone ? 'Put your phone in the tray, like this.' : 'Take out your electronics pouch and put it in the tray, like this. Everything is together, so it is quick.', apply: () => { put(m, to); this.phoneReleased(m); } }); }
      else if (!st.traySent) { const to = laneP(0, 0.8, 0.1); d.runDemo(move(tray, to, 0.12), { say: 'Now pick up the tray and release it on the belt, like this.', apply: () => { put(tray, to); this.trayReleased(tray); } }); }
      else if (!st.bagSent) { const to = laneP(0, 0.8, 0.1); d.runDemo(move(bag, to, 0.25), { say: 'Now lift your bag and release it on the belt, like this.', apply: () => { put(bag, to); this.bagReleased(bag); } }); }
      else if (phase === 'collect') { const t = here(tray), b = here(bag); d.runDemo([{ p: [t.x, t.y + 0.25, t.z + 0.1], dur: 1.1 }, { p: [t.x, t.y + 0.1, t.z], dur: 0.5, press: true }, { p: [b.x, b.y + 0.5, b.z + 0.1], dur: 1.0 }, { p: [b.x, b.y + 0.45, b.z], dur: 0.5, press: true }], { say: 'Take your phone out of the tray, and pick up your bag, like this.', apply: () => { this.gotItem('phone'); this.gotItem('pouch'); this.gotItem('bag'); } }); }
      // otherwise the belt is still moving: nothing to show yet
    },
    onButton(id) { if (id === 'show') d.startAssist(); if (id === 'help') d.help(); },
    // One click does the move (the same result as dragging it by hand).
    tapGlide(o, to, done) {
      const from = o.position.clone(); d.voice.soft();
      d.tweens.add({ dur: d.reduceMotion ? 0.05 : 0.6, update: (e) => { o.position.lerpVectors(from, to, e); o.position.y += Math.sin(e * Math.PI) * 0.1; }, done: () => { o.position.copy(to); o.updateMatrixWorld(true); done?.(); } });
    },
    tapToTray(o) {
      if (o.userData.tapping || !tray || phase !== 'phone') return; o.userData.tapping = true;
      const t = d.stage.props.worldToLocal(tray.getWorldPosition(new THREE.Vector3()));
      this.tapGlide(o, new THREE.Vector3(t.x, t.y + 0.07, t.z), () => { o.userData.tapping = false; this.phoneReleased(o); });
    },
    tapTray(o) {
      if (o.userData.tapping) return;
      if (!st.phoneIn) { d.nudge('First put your phone and pouch in the tray.'); return; }
      if (st.traySent) return; o.userData.tapping = true;
      this.tapGlide(o, o.parent.worldToLocal(lane.localToWorld(new THREE.Vector3(0, 0.8, 0.1))), () => { o.userData.tapping = false; this.trayReleased(o); });
    },
    tapBag(o) {
      if (o.userData.tapping || st.bagSent) return; o.userData.tapping = true;
      this.tapGlide(o, o.parent.worldToLocal(lane.localToWorld(new THREE.Vector3(0, 0.8, 0.1))), () => { o.userData.tapping = false; this.bagReleased(o); });
    },
    phoneReleased(o) {
      const p = tray.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
      if (Math.abs(p.x) < 0.27 && Math.abs(p.z) < 0.2 && p.y > -0.05 && p.y < 0.35) {
        const tag = o.userData.tag || 'phone';
        tray.attach(o); o.position.set(tag === 'pouch' ? 0.1 : -0.12, tag === 'pouch' ? 0.045 : 0.034, THREE.MathUtils.clamp(p.z, -0.06, 0.06));
        o.quaternion.setFromEuler(new THREE.Euler(tag === 'pouch' ? 0 : FLAT_X, 0, 0)); st.inTray.add(tag); bel.put(tag);
        st.phoneIn = st.inTray.has('phone') && st.inTray.has('pouch'); d.voice.beep();
        if (st.phoneIn) { refresh({ title: 'Now slide the tray onto the belt.', body: 'Click the tray to put it on the belt.' }); d.say('Phone and electronics in the tray. Now slide the tray onto the belt.'); }
        else { refresh({ title: st.inTray.has('phone') ? 'Now the electronics pouch.' : 'Now your phone.', body: 'Both go in the tray.' }); d.say(st.inTray.has('phone') ? 'Good. Now take out your electronics pouch.' : 'Good. Now your phone.'); }
        return true;
      }
      return false;
    },
    trayReleased(o) {
      if (!inBelt(o)) return false;
      if (!st.phoneIn) { d.nudge('Put your phone and your electronics pouch in the tray first.'); return false; }
      st.traySent = true; phase = 'bag'; rideBelt(o, 'tray');
      refresh({ title: 'Place your bag on the belt.', body: 'Click your cabin bag to put it on the belt.' });
      d.say('Good. Now place your bag on the belt.');
      return true;
    },
    bagReleased(o) {
      if (!inBelt(o)) return false;
      if (!st.traySent) { d.nudge('Send the tray first, then your bag.'); return false; }
      st.bagSent = true; rideBelt(o, 'bag'); refresh({ title: 'Your things are being scanned.', body: 'Wait for them on the other side.' });
      d.say('Your things are being scanned. Please wait.');
      return true;
    },
    arrive() {
      if (!(st.arrived.has('tray') && st.arrived.has('bag')) || phase === 'collect' || phase === 'walkthrough' || phase === 'done') return;
      phase = 'walkthrough';
      officer?.say('Please walk through the detector.'); refresh({ title: 'Walk through the detector.', body: 'Walk past the machine to collect your things.', note: '', tasks: tasks() });
      d.say('Your things are through. Now walk through the metal detector, to the end of the belt.');
      // you walk it yourself: round the machine and through the detector frame to the end of the belt
      d.setStation({ point: new THREE.Vector3(0, 0, -1.25 - 3.3), label: 'the end of the belt', radius: 1.5, onArrive: () => {
        phase = 'collect';
        for (const o of [tray, bag]) { d.input.grabbables.add(o); }
        refresh({ title: 'Collect your belongings.', body: 'Take your phone and pouch from the tray, then pick up your bag.', note: 'Phone · pouch · bag' });
        d.say('You are through. Collect your belongings: take your phone and pouch from the tray, and pick up your bag.');
      } });
    },
    gotItem(k) {
      st.collected.add(k); bel.retrieve(k);
      if (phase !== 'collect') return;
      if (bel.complete()) { phase = 'done'; d.success('You have everything.', 'Phone, pouch and bag collected. Always check you have everything before you leave security.'); refresh({}); }
      else refresh({ note: 'Still to collect: ' + bel.missing().join(', ') });
    },
  };
  return api;
};

/* ------------------------------------------------------------------ 5. find your flight */
const gate = (d) => {
  const state = { selected: null, highlight: null, status: 'idle' };
  const rows = [
    { id: 'PA101', flight: 'PA101', dest: 'Mumbai', time: '10:40', gate: '12' },
    { id: 'PA205', flight: 'PA205', dest: 'Delhi', time: '11:10', gate: '06' },
    { id: 'PA309', flight: 'PA309', dest: 'Chennai', time: '11:30', gate: '09' },
  ];
  let board, pass, finished = false;
  return {
    id: 'gate', scene: 'hall-apron', assets: ['departures-display', 'wayfinding-sign', 'boarding-pass'],
    voice: 'Find your flight. Match PA101 on your boarding pass with the departures screen, then check the gate.',
    help: 'Look for your flight code, PA101, in the first column of the screen. The gate number is at the end of the same row.',
    helpShort: 'Match PA101, read the gate',
    enter() {
      const disp = d.assets.make('departures-display', { unique: ['EditableScreen'] });
      d.addScenery(disp, { x: 0.25, y: hangBoardY(disp), z: -1.9 }); hangRods(d, disp);
      board = screenOverlay(disp, { pxW: 1024, paint: paintBoard(state, rows) });
      board.onSelect = (id) => this.pick(id); d.track(board);
      const way = d.assets.make('wayfinding-sign', { unique: ['EditableScreen'] });
      d.addScenery(way, { x: 0.25, y: -0.19, z: -2.3 }); hangRods(d, way);
      screenOverlay(way, { pxW: 1024, paint: paintSign({ lines: ['Gates 10–15'], arrow: '→', state: {} }) });
      pass = makeDoc(d, 'boarding-pass'); pass.scale.setScalar(1.3); pass.rotation.x = -0.5;
      pass.userData.doc = { type: 'boarding-pass', flight: P.flight, date: P.date, printedGate: P.gateOriginal };
      d.addProp(pass, { radius: 0.2 }, [-0.12, d.h - 0.42, -0.45]);
      d.setStation({ point: new THREE.Vector3(0.25, 0, -1.9), label: 'the departures board', radius: 3.0 });
      d.setPanel({ eyebrow: 'Airport practice · 5 of 8', title: 'Find your flight.', body: 'Match PA101, then check the gate.', note: 'Your pass shows gate ' + P.gateOriginal, tone: 'normal', buttons: [{ id: 'show', label: 'Show me' }, { id: 'help', label: 'Ask for help', kind: 'secondary' }] });
    },
    demo() {
      if (finished) return;
      state.highlight = 'PA101'; board.redraw();
      d.runDemo([{ p: d.surfacePoint(board, 'PA101', 0.3).toArray(), dur: 1.5 }, { p: d.surfacePoint(board, 'PA101', 0.03).toArray(), dur: 0.7, press: true }],
        { say: 'Find the row that says PA101, your flight code, and tap it, like this. The gate is at the end of the row.', apply: () => this.pick('PA101') });
    },
    onButton(id) { if (id === 'show') d.startAssist(); if (id === 'help') d.help(); },
    update() { if (state.highlight) board.redraw(); },
    pick(id) {
      if (finished) return;
      state.selected = id; state.highlight = null;
      if (id === 'PA101') {
        finished = true; state.status = 'ok'; board.redraw(); d.voice.beep();
        d.success('Your gate is 12.', 'PA101 to Mumbai leaves from gate 12. Remember: gates can change, so check the screens again.');
      }
      else { state.status = 'bad'; board.redraw(); d.tweens.add({ dur: 1.4, done: () => { if (!finished) { state.selected = null; state.status = 'idle'; board.redraw(); } } }); d.nudge(`That is ${rows.find((r) => r.id === id).dest}. Your flight is PA101 to Mumbai.`); }
    },
  };
};

/* ------------------------------------------------------------------ 6. gate change */
const gatechange = (d) => {
  let info, infoS, pass, flash = 0, finished = false; const signs = [{ status: 'idle' }, { status: 'idle' }]; let ov = [];
  const draw = (ctx, s) => {
    const W = s.pxW, H = s.pxH;
    ctx.fillStyle = '#0b1f33'; roundRect(ctx, 0, 0, W, H, 24); ctx.fill();
    ctx.fillStyle = '#9fb6c8'; ctx.font = `600 40px ${FONT}`; ctx.fillText(P.airline, 50, 78);
    ctx.fillStyle = '#fff'; ctx.font = `800 70px ${FONT}`; ctx.fillText(`${P.flight} · ${P.to.city}`, 50, 160);
    const on = flash > 0 ? Math.floor(performance.now() / 350) % 2 === 0 : true;
    ctx.fillStyle = on ? COLORS.warn : '#7a1d2e'; roundRect(ctx, 40, 195, W - 80, 120, 26); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 80px ${FONT}`; ctx.textAlign = 'center'; ctx.fillText('GATE CHANGED', W / 2, 282);
    ctx.fillStyle = '#4b5b69'; roundRect(ctx, 130, 350, 250, 150, 20); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `800 110px ${FONT}`; ctx.fillText(P.gateOriginal, 255, 460);
    ctx.fillStyle = COLORS.yellow; ctx.font = `800 100px ${FONT}`; ctx.fillText('→', W / 2, 455);
    ctx.fillStyle = COLORS.yellow; roundRect(ctx, 640, 350, 250, 150, 20); ctx.fill();
    ctx.fillStyle = '#0b1f33'; ctx.font = `800 120px ${FONT}`; ctx.fillText(P.gateChanged, 765, 462);
    ctx.textAlign = 'left'; ctx.fillStyle = '#9fb6c8'; ctx.font = `600 38px ${FONT}`; ctx.fillText(`Departure ${P.departure}   ·   Boarding ${P.boarding}   ·   Terminal ${P.terminal}`, 50, 560);
    s.hot = [];
  };
  return {
    id: 'gatechange', scene: 'hall-apron', assets: ['gate-display', 'wayfinding-sign', 'boarding-pass'],
    voice: 'Your gate has changed. This is a practice update. Check the latest display, then follow the signs to gate 18.',
    help: 'Airports sometimes change gates. Your printed pass still says 12, but the screen shows the new gate: 18. Follow the signs for gates 16 to 20.',
    helpShort: 'Screens beat the printed pass',
    enter() {
      d.flight.currentGate = P.gateChanged; flash = 4;
      info = d.assets.make('gate-display', { unique: ['EditableScreen'] });
      d.addScenery(info, { x: -1.0, y: hangBoardY(info), z: -1.8 }); hangRods(d, info);
      infoS = screenOverlay(info, { pxW: 1024, paint: draw }); d.track(infoS, false);
      [['Gates 10–15', '→', 0.65, 0], ['Gates 16–20', '→', 1.6, 1]].forEach(([t, ar, x, i]) => {
        const w = d.assets.make('wayfinding-sign', { unique: ['EditableScreen'] });
        d.addScenery(w, { x: 0.2 + i * 1.12, y: 0.716, z: -2.6, scale: 0.68 }); hangRods(d, w);
        const o = screenOverlay(w, { pxW: 1024, paint: paintSign({ lines: [t], arrow: ar, state: signs[i] }) });
        o.onSelect = () => this.pick(i); d.track(o); ov.push(o);
      });
      pass = makeDoc(d, 'boarding-pass'); pass.scale.setScalar(1.3); pass.rotation.x = -0.5;
      pass.userData.doc = { type: 'boarding-pass', flight: P.flight, date: P.date, printedGate: P.gateOriginal };
      d.addProp(pass, { radius: 0.2 }, [-0.1, d.h - 0.42, -0.45]);
      d.setStation({ point: new THREE.Vector3(0.4, 0, -2.2), label: 'the gate information', radius: 3.0 });
      d.setPanel({ eyebrow: 'Airport practice · 6 of 8', title: 'Your gate has changed.', body: 'Find gate 18 on the screen.', note: 'Simulated update', tone: 'normal', buttons: [{ id: 'show', label: 'Find gate 18' }, { id: 'help', label: 'Ask airport staff', kind: 'secondary' }] });
      d.voice.beep(); setTimeout(() => d.voice.beep(), 260);
    },
    update(dt) { if (flash > 0) { flash -= dt; infoS.redraw(); } },
    demo() {
      if (finished) return;
      signs[1].glow = true; ov[1].redraw();
      d.runDemo([{ p: d.surfacePoint(ov[1], 'sel', 0.3).toArray(), dur: 1.5 }, { p: d.surfacePoint(ov[1], 'sel', 0.03).toArray(), dur: 0.7, press: true }],
        { say: 'The screen says gate 18. That is between gates 16 and 20. Tap that sign, like this.', apply: () => this.pick(1) });
    },
    onButton(id) {
      if (id === 'show') d.startAssist();
      if (id === 'help') { d.help(); }
    },
    pick(i) {
      if (finished) return;
      if (i === 1) {
        finished = true; signs[1].status = 'ok'; signs[1].glow = false; ov[1].redraw(); d.voice.beep();
        d.success('Gate 18 is this way.', 'Good catch. Your printed pass says gate 12, but the screen shows the latest gate: 18.');
      }
      else { signs[0].status = 'bad'; ov[0].redraw(); d.tweens.add({ dur: 1.4, done: () => { signs[0].status = 'idle'; ov[0].redraw(); } }); d.nudge('Gate 18 is not between 10 and 15.'); }
    },
  };
};

/* ------------------------------------------------------------------ 7. boarding scan */
const boarding = (d) => {
  let gateAgent, desk, scanner, pass, scan, lastState = '', ghost = null, texs = {}, done = false, screen, jb;
  const S_V = new THREE.Vector3(), S_Q = new THREE.Quaternion(), S_Q2 = new THREE.Quaternion(), S_N = new THREE.Vector3();
  return {
    id: 'boarding', scene: 'hall-apron', people: ['gate'], panelOffset: 0.95, assets: ['boarding-counter', 'boarding-scanner', 'staff-workstation', 'boarding-pass', 'gate-display', 'queue-barrier', 'jetbridge-section'],
    voice: 'Scan your boarding pass. Face the code towards the reader, and hold it steady.',
    help: 'Hold the boarding pass just above the glass, with the code facing down towards the reader. Keep it still for a moment until the screen turns green.',
    helpShort: 'Code faces the reader',
    enter() {
      desk = new THREE.Group();
      desk.add(d.assets.make('boarding-counter'));
      const ws = d.assets.make('staff-workstation', { unique: ['EditableScreen'] }); ws.position.set(-0.35, 1.027, -0.1); desk.add(ws);
      d.track(staffScreen(ws, ['PRACTICE AIR · GATE 18', 'PA101  BLR → BOM', 'Boarding open', 'Scan boarding pass']), false);
      scanner = d.assets.make('boarding-scanner', { unique: ['StatusDisplay'], actions: false });
      scanner.position.set(0.45, 1.027, 0.12); desk.add(scanner);
      d.addScenery(desk, { x: -0.25, z: -1.0, fixed: true }); d.obstacle(desk);
      gateAgent = d.addStaff('gate', 'Gate agent · practice', desk, [0.55, 0, -0.9]);
      gateAgent.say('Boarding pass, please. Hold it over the reader.', 9);
      d.addSupport(-0.25 - 0.85, -0.25 + 0.85, -1.0 - 0.38, -1.0 + 0.38, 1.027);
      const barrier = d.assets.make('queue-barrier'); d.addScenery(barrier, { x: -3.1, z: -0.8, ry: 0.3 }); d.obstacle(barrier);
      const gd = d.assets.make('gate-display', { unique: ['EditableScreen'] });
      d.addScenery(gd, { x: 1.7, y: hangBoardY(gd), z: -2.0 }); hangRods(d, gd);
      const gs = screenOverlay(gd, { pxW: 800, paint: (ctx, s) => { ctx.fillStyle = '#0b1f33'; roundRect(ctx, 0, 0, s.pxW, s.pxH, 24); ctx.fill(); ctx.fillStyle = COLORS.yellow; ctx.font = `800 220px ${FONT}`; ctx.fillText('18', 50, s.pxH * 0.52); ctx.fillStyle = '#fff'; ctx.font = `700 54px ${FONT}`; ctx.fillText(`${P.flight} · ${P.to.city}`, 50, s.pxH * 0.72); ctx.fillStyle = '#9fb6c8'; ctx.font = `600 40px ${FONT}`; ctx.fillText(`Boarding ${P.boarding}`, 50, s.pxH * 0.88); } });
      d.track(gs, false);
      jb = d.assets.make('jetbridge-section'); d.addScenery(jb, { x: -0.2, z: -4.2, ry: 0 });
      for (const k of ['ready', 'reading', 'accepted', 'retry']) texs[k] = loadTex('./assets/textures/display-' + k + '.png');
      screen = scanner.getObjectByName('StatusDisplay'); screen.material.map = texs.ready; screen.material.needsUpdate = true;
      pass = makeDoc(d, 'boarding-pass'); pass.scale.setScalar(1.3); pass.rotation.x = -0.5;
      pass.userData.doc = { type: 'boarding-pass', flight: P.flight, date: P.date, printedGate: P.gateOriginal };
      d.addProp(pass, { radius: 0.22, restOffset: 0.004 }, [0.0, d.h - 0.42, -0.45]);
      scan = new PracticeScanner({ flight: P.flight, date: P.date, gate: P.gateChanged });
      d.setStation({ point: new THREE.Vector3(-0.25, 0, -1.0), label: 'the boarding desk', radius: 1.4 });
      d.setPanel({ eyebrow: 'Airport practice · 7 of 8', title: 'Scan your boarding pass.', body: 'Face the code towards the reader. Hold it steady.', note: 'Gate 18 · PA101', tone: 'normal', buttons: [{ id: 'show', label: 'Show me' }, { id: 'help', label: 'Ask for help', kind: 'secondary' }] });
    },
    onButton(id) { if (id === 'show') d.startAssist(); if (id === 'help') d.help(); },
    accept() {
      if (done) return;
      done = true; d.voice.success(); d.app.haptic?.(0.7, 120); gateAgent?.say('Thank you. Enjoy your flight!');
      d.setPanel({ eyebrow: 'Airport practice · 7 of 8', title: 'Boarding pass accepted.', body: 'Walk down the jet bridge.', note: '', buttons: [], tasks: [] });
      d.setStation({ point: new THREE.Vector3(-0.2, 0, -5.3), label: 'the jet bridge', radius: 1.3, onArrive: () => d.success('You are on your way.', 'The reader showed green and you may board. Next, walk down the jet bridge and find your seat on the aircraft.') });
    },
    demo() {
      if (done) return;
      // A guide hand carries a ghost pass to the right pose and holds it steady. It never scans anything.
      scanner.updateMatrixWorld(true);
      const a = d.stage.props.worldToLocal(pass.getWorldPosition(new THREE.Vector3()));
      const gh = d.makeGhost(pass);
      const above = d.worldToStage(scanner.localToWorld(new THREE.Vector3(0, 0.32, 0.12)));
      const on = d.worldToStage(scanner.localToWorld(new THREE.Vector3(0, 0.185, -0.015)));
      d.runDemo([
        { p: a.toArray(), dur: 0.9, hold: 0.2 },
        { p: above.toArray(), dur: 1.0, carry: gh, rx: [gh.rotation.x, 0.4] },
        { p: on.toArray(), dur: 0.8, carry: gh, rx: [0.4, Math.PI / 2], hold: 0.2 },
        { p: on.toArray(), dur: 1.6, carry: gh, rx: [Math.PI / 2, Math.PI / 2], press: true }, // hold steady
      ], { say: 'Lift your pass above the glass, turn the code face down towards the reader, and hold it still, like this.', apply: () => { screen.material.map = texs.accepted; screen.material.needsUpdate = true; lastState = 'accepted'; this.accept(); } });
    },
    update(dt) {
      if (done) return;
      scanner.updateMatrixWorld(true); pass.updateMatrixWorld(true);
      const near = pass.getWorldPosition(S_V).distanceTo(scanner.getWorldPosition(S_N)) < 0.7;
      let result;
      if (!near) { scan.reset(); result = { state: 'ready', message: '' }; }
      else {
        const p = scanner.worldToLocal(pass.getWorldPosition(new THREE.Vector3()));
        pass.getWorldQuaternion(S_Q); scanner.getWorldQuaternion(S_Q2).invert();
        S_N.set(0, 0, 1).applyQuaternion(S_Q).applyQuaternion(S_Q2);
        const doc = { ...pass.userData.doc, currentGate: d.flight.currentGate };
        result = scan.update({ document: doc, position: p.toArray(), normal: S_N.toArray(), dt, tracked: !pass.userData.lost, boardingAllowed: d.flight.boardingOpen });
        // Only treat it as "trying" when the pass is genuinely close to the glass
        if (p.length() > 0.35) result = { state: 'ready', message: '' };
      }
      if (result.state !== lastState) {
        lastState = result.state;
        const tex = texs[result.state] || texs.ready;
        screen.material.map = tex; screen.material.needsUpdate = true;
        if (result.state === 'accepted') this.accept();
        else if (result.state === 'retry' && result.message) { d.panel.set({ note: result.message, tone: 'warn' }); d.noteTimer = 4; }
        else if (result.state === 'reading') d.panel.set({ note: 'Reading… hold it steady', tone: 'normal' });
      }
    },
  };
};

/* ------------------------------------------------------------------ 8. jet bridge, aircraft, seat */
// The learner is "walked" (seated, with a comfort vignette) down the jet bridge, through the aircraft door,
// along the aisle past the row numbers, and finally picks seat 14A. Layout is a narrow-body 3-3 cabin:
// A-B-C on the left (A = window), D-E-F on the right, built from two of the pack's cabin sections around one aisle.
const carpetTexture = () => {
  const [w, h] = [128, 256], c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
  x.fillStyle = '#1d3350'; x.fillRect(0, 0, w, h);
  x.strokeStyle = 'rgba(120,190,200,0.35)'; x.lineWidth = 3;
  for (let j = 0; j < 4; j++) for (let i = 0; i < 2; i++) { const cx = 32 + i * 64, cy = 32 + j * 64; x.beginPath(); x.moveTo(cx, cy - 24); x.lineTo(cx + 24, cy); x.lineTo(cx, cy + 24); x.lineTo(cx - 24, cy); x.closePath(); x.stroke(); }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; return t;
};
const curtainTexture = () => {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  for (let i = 0; i < 32; i++) { const g = x.createLinearGradient(i * 16, 0, i * 16 + 16, 0); g.addColorStop(0, '#17304d'); g.addColorStop(0.5, '#27466b'); g.addColorStop(1, '#17304d'); x.fillStyle = g; x.fillRect(i * 16, 0, 16, 256); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
};
const SIDE_LEFT = /^(SidewallLower|SidewallUpper|WindowFrame|WindowGlass|WindowPier|CeilingShoulder)-1/;

/** One side of the cabin shell from the pack's section, restyled so it reads as an aircraft interior. */
function cabinSide(d, { mirrored }) {
  const c = d.assets.make('aircraft-cabin-section', { actions: false });
  const drop = []; c.traverse((o) => { if (o.name && SIDE_LEFT.test(o.name)) drop.push(o); });
  drop.forEach((o) => o.parent?.remove(o));
  c.traverse((o) => {
    if (!o.isMesh) return;
    const n = o.name; o.material = o.material.clone(); o.material.userData.owned = true;
    if (/^WindowGlass/.test(n)) {
      const sky = cropTexture('view-plane-window', [300, 60, 880, 880]);   // the real sky and clouds from the photo
      if (sky) { planarUV(o.geometry, ['z', 'y']); o.material = new THREE.MeshBasicMaterial({ map: sky, toneMapped: false }); o.material.userData.owned = true; }
      else { o.material.color.set(0xcfeaff); if ('emissive' in o.material) { o.material.emissive.set(0x9dd2ff); o.material.emissiveIntensity = 1.25; } }
    }
    else if (/^SidewallLower/.test(n)) { o.material.color.set(0xb4c0cf); const t = tileTexture('aircraft-sidewall-texture'); if (t) { boxUV(o.geometry, 0.6); o.material.map = t; } }
    else if (/^SidewallUpper|^Ceiling|^WindowFrame|^WindowPier/.test(n)) { o.material.color.set(0xf6f7f8); const t = /^Ceiling|^SidewallUpper/.test(n) ? tileTexture('aircraft-ceiling-texture') : null; if (t) { boxUV(o.geometry, 0.6); o.material.map = t; } }
    else if (n === 'CabinFloor') { if (!o.material.map) o.material.color.set(0x24364f); if (mirrored) o.position.y -= 0.003; }
    if (mirrored && n === 'Ceiling') o.position.y += 0.003;
  });
  c.position.x = mirrored ? -0.34 : 0.34; c.scale.x = mirrored ? -1 : 1;
  return c;
}

const seat = (d) => {
  const ROWS = [12, 13, 14, 15], TARGET = 2, PITCH = 2.2, ROW0 = -7.4;
  const LETTERS = { '-1': ['C', 'B', 'A'], '1': ['F', 'E', 'D'] };   // row-local seat index -> letter, per side
  const rowZ = (k) => ROW0 - k * PITCH, standZ = (k) => rowZ(k) + 1.0;
  let crew, W, door, phase = 'bridge', userZ = 0, finished = false, prevMode = 'mixed', seatView, skyTex;
  const rows = new RowTracker(ROWS, TARGET);
  const spots = [], rowsL = [];
  const walkTo = (zW, done) => d.moveWorld(0, userZ - zW, () => { userZ = zW; done?.(); });
  const api = {
    id: 'seat', scene: 'hall-apron', enclosure: true, people: ['crew'], walkIn: false, bounds: { x0: -0.95, x1: 0.95, z0: -6.4, z1: 0.6 }, assets: ['jetbridge-section', 'aircraft-entry-door', 'aircraft-cabin-section', 'aircraft-seat-row', 'overhead-bin', 'boarding-pass'],
    voice: 'Walk down the jet bridge to the aircraft. Then find row 14, and seat A.',
    help: 'Your pass says seat 14A. The number is the row, and the letter is the seat. Row numbers hang above the aisle. Seat A is the window seat on the left.',
    helpShort: 'Row 14, window seat A',
    enter() {
      prevMode = d.app.env.mode; d.app.env.setMode('immersive'); d.app.env.setHall(false);
      W = new THREE.Group(); d.addScenery(W, { fixed: true });
      for (const z of [-1.5, -4.5]) { const b = d.assets.make('jetbridge-section', { actions: false }); b.position.set(0, 0, z); W.add(b); }
      door = d.assets.make('aircraft-entry-door'); door.userData.noMerge = true; door.position.set(0, 0, -6.1); W.add(door);
      crew = d.addStaff('crew', 'Cabin crew · practice', W, [0.4, 0, -6.95]); crew.root.userData.noMerge = true;
      const exitSign = labelSurface('EXIT', { w: 0.36, px: 420 }); exitSign.mesh.userData.noMerge = true; exitSign.mesh.position.set(0, 2.2, -5.95); W.add(exitSign.mesh); d.track(exitSign, false);

      ROWS.forEach((num, k) => {
        const z = rowZ(k);
        for (const [i, s] of [[0, -1], [1, 1]]) {
          const cabin = cabinSide(d, { mirrored: s < 0 }); cabin.position.z = z; W.add(cabin);
          const row = d.assets.make('aircraft-seat-row'); row.position.set(s * 1.12, 0, z); row.rotation.y = Math.PI; W.add(row);
          if (s < 0) rowsL[k] = row;
          LETTERS[s].forEach((l, idx) => {
            const x = (idx - 1) * 0.54;
            const hot = new Hotspot({ size: [0.5, 0.95, 0.5], center: [x, 0.55, 0.05], label: num + l, onSelect: () => this.pick(k, s, idx) });
            hot.mesh.userData.noMerge = true; row.add(hot.mesh); d.input.addInteractive(hot.mesh); spots.push({ row: k, side: s, i: idx, hot });
            const badge = labelSurface(l, { w: 0.22, px: 220 }); badge.mesh.userData.noMerge = true; badge.mesh.position.set(x, 1.0, -0.33); badge.mesh.rotation.y = Math.PI; row.add(badge.mesh); d.track(badge, false);
          });
          // overhead bins above each seat block, doors facing the aisle
          for (const dz of [-0.55, 0.55]) {
            const bin = d.assets.make('overhead-bin'); bin.position.set(s * 1.5, 1.72, z + dz); bin.rotation.y = s > 0 ? -Math.PI / 2 : Math.PI / 2; bin.scale.setScalar(0.88); W.add(bin);
          }
        }
        const plate = labelSurface('Row ' + num, { w: 0.5, px: 520 }); plate.mesh.userData.noMerge = true; plate.mesh.position.set(0, 2.05, z + 0.45); W.add(plate.mesh); d.track(plate, false);
      });
      // aisle carpet runner, galley curtain at the far end
      const len = 10.4, ct = carpetTexture(); ct.repeat.set(1, len / 1.0);
      const runner = new THREE.Mesh(new THREE.PlaneGeometry(0.62, len).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ map: ct, roughness: 1 }));
      runner.position.set(0, 0.012, ROW0 - 1.5 * PITCH - 0.6); W.add(runner);
      const curtain = new THREE.Mesh(new THREE.PlaneGeometry(3.7, 2.35), new THREE.MeshStandardMaterial({ map: curtainTexture(), roughness: 1 }));
      curtain.position.set(0, 1.18, rowZ(3) - 1.15); W.add(curtain);
      this.merged = mergeStatic(W);      // same picture, far fewer draw calls on the headset

      const pass = makeDoc(d, 'boarding-pass'); pass.scale.setScalar(1.3); pass.rotation.x = -0.5;
      d.addProp(pass, { radius: 0.2 }, [-0.1, d.h - 0.42, -0.45]);
      d.setStation({ point: new THREE.Vector3(0, 0, -6.1), label: 'the aircraft door', radius: 1.3, hint: 'Walk down the jet bridge.', onArrive: () => this.board() });
      d.setPanel({ eyebrow: 'Airport practice · 8 of 8', title: 'Walk to the aircraft.', body: 'Walk down the jet bridge to the door.', note: '', tone: 'normal', buttons: [] });
    },
    exit() { seatView?.userData.dispose?.(); seatView?.removeFromParent(); seatView = null; d.app.env.setMode(prevMode); d.app.env.setHall(true); },
    onButton(id) { if (id === 'show') d.startAssist(); },
    board() {   // you reached the aircraft door
      if (phase !== 'bridge') return; phase = 'aisle'; rows.at = -1; d.voice.beep();
      door.userData.actions?.toggle(0);
      crew?.say('Welcome aboard! Row numbers are above the seats.', 8);
      api.bounds = { x0: -0.4, x1: 0.4, z0: rowZ(3) - 0.9, z1: -4.5 };      // the aisle: you can not walk through the seats or the walls
      d.setPanel({ title: 'You are on board.', body: 'Find row 14. Row numbers hang above the aisle.', note: '', tone: 'normal', buttons: [] });
      d.say('You are on board. Walk down the aisle and look for row 14. The row numbers hang above the seats.');
      d.setStation({ point: new THREE.Vector3(0, 0, standZ(TARGET)), label: 'row 14', radius: 0.9, hint: 'Row numbers hang above the aisle.', onArrive: () => this.atMyRow() });
    },
    atMyRow() {
      if (phase !== 'aisle') return;
      phase = 'seat'; rows.at = TARGET; d.voice.success();
      d.setPanel({ title: 'Find seat 14A.', body: 'Row 14 is here. A is the window seat, on the left side of the aircraft.', note: 'Point at the seat and pinch', buttons: [{ id: 'show', label: 'Show me' }] });
      d.say('This is row 14. Now find seat A, the window seat on your left.');
    },
    update(dt) {
      if (skyTex) skyTex.offset.x += dt * 0.004;                          // the clouds drift slowly past the window
      if (phase !== 'aisle' && phase !== 'seat') return;
      const uz = -d.stage.scenery.position.z - d.stage.pull;     // where you stand along the aircraft
      const before = rows.at; rows.syncFromPosition(uz, standZ);
      if (rows.at !== before && phase === 'aisle') { const r = rows.current(); d.panel.set({ minimalHint: r ? `You are at row ${r}. ${rows.at > TARGET ? 'Row 14 is behind you.' : 'Keep going to row 14.'}` : 'Find row 14.' }); }
    },
    demo() {
      if (finished || d.walking || phase !== 'seat') return;
      const sp = spots.find((q) => q.row === TARGET && q.side === -1 && q.i === 2);
      sp.hot.flash(true);
      const c = d.worldToStage(sp.hot.mesh.getWorldPosition(new THREE.Vector3()));
      d.runDemo([{ p: [c.x + 0.9, c.y + 0.2, c.z + 0.6], dur: 1.5 }, { p: [c.x + 0.35, c.y + 0.12, c.z + 0.25], dur: 0.7, press: true }],
        { say: 'Your pass says 14A. Row 14, letter A, the window seat on the left. Point at it and pinch, like this. You do not need to sit.', apply: () => this.pick(TARGET, -1, 2) });
    },
    pick(r, side, i) {
      if (finished || phase !== 'seat') { if (!finished && phase === 'aisle') d.nudge('First find your row, then choose a seat.'); return; }
      if (r !== TARGET) { d.nudge(`That is row ${ROWS[r]}. Your row is 14.`); return; }
      const letter = LETTERS[side][i];
      if (letter !== 'A') { d.nudge(side > 0 ? `That is seat ${letter}, on the right. A is the window seat on the left.` : `That is seat ${letter}. You need A, the window seat.`); return; }
      finished = true;
      const s = spots.find((q) => q.row === r && q.side === side && q.i === i); s.hot.flash(true);
      const a = rowsL[r].userData.actions; if (a) { a.toggle(4); a.toggle(5); } // recline + open the tray on the chosen seat
      d.clearStation();
      blink(d, () => {                                                  // you sit down: the view from the window seat
        if (W) W.visible = false;
        seatView = cabPlate(d, 'aircraft-window-seat.jpg'); d.stage.props.add(seatView);
        const sky = photoTexture('sky-clouds');
        if (sky) { skyTex = sky.clone(); skyTex.wrapS = THREE.RepeatWrapping; skyTex.needsUpdate = true; const m = new THREE.Mesh(new THREE.PlaneGeometry(7.6, 7.6 * 1024 / 1536), new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false, depthWrite: false })); m.position.set(0, Math.max(1.0, d.h) + 0.1, -5); m.renderOrder = -2; seatView.add(m); }
        d.success('You found seat 14A.', 'Row 14, seat A: the window seat. You have rehearsed the whole journey, from booking to your seat.', 'Finish');
      });
    },
  };
  return api;
};

/* ------------------------------------------------------------------ 2. pack at home (baggage rules + electronics together) */
/** A simple labelled box for items the pack has no model for (power bank, tablet, clothes...). */
function labelBox(w, h, d, color, text, fontPx = 46, photo = null) {
  if (photo && IMG[photo]) return photoBox(w, h, d, color, text, photo);
  const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d');
  x.fillStyle = color; x.fillRect(0, 0, 512, 256); x.strokeStyle = 'rgba(255,255,255,0.35)'; x.lineWidth = 8; x.strokeRect(10, 10, 492, 236);
  x.fillStyle = '#fff'; x.font = `800 ${fontPx}px ${FONT}`; x.textAlign = 'center'; x.textBaseline = 'middle';
  const lines = text.split('\n'); lines.forEach((t, i) => x.fillText(t, 256, 128 + (i - (lines.length - 1) / 2) * (fontPx + 10)));
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  m.castShadow = true;
  const g = new THREE.Group(); g.add(m); g.userData.size = [w, h, d];
  return g;
}

const packing = (d) => {
  const ZX = { E: -0.55, D: -0.1, C: 0.62 }, ZY = () => d.h - 0.42, ZZ = -0.55;
  const ZONE = { E: { label: 'ELECTRONICS POUCH', sub: 'cabin bag', color: 0x38e1d2 }, D: { label: 'FRONT POCKET', sub: 'cabin bag', color: 0xf6c90e }, C: { label: 'CHECKED BAG', sub: '15 kg limit', color: 0x6aa8ff } };
  const NEED = { E: 4, D: 3, C: 2 }, count = { E: 0, D: 0, C: 0 };
  const WHY = {
    powerbank: 'Power banks must travel in your cabin bag, never in the checked bag.',
    laptop: 'Laptops and tablets go in the cabin bag, together in one pouch.',
    tablet: 'Laptops and tablets go in the cabin bag, together in one pouch.',
    charger: 'Chargers go with your other electronics, in the cabin bag.',
    phone: 'Keep your phone, wallet and ID with you in the front pocket.', wallet: 'Keep your phone, wallet and ID with you in the front pocket.', id: 'Keep your phone, wallet and ID with you in the front pocket.',
    clothes: 'Clothes are heavy and not urgent: they go in the checked bag.',
    bottle: 'Liquids over 100 ml go in the checked bag.',
  };
  const items = []; let all = false;
  const tasks = () => [
    { label: `Electronics ${count.E}/4`, done: count.E === 4, active: count.E < 4 },
    { label: `Pocket ${count.D}/3`, done: count.D === 3, active: count.E === 4 && count.D < 3 },
    { label: `Checked ${count.C}/2`, done: count.C === 2, active: count.E === 4 && count.D === 3 },
  ];
  const zoneOf = (o) => { for (const k of Object.keys(ZX)) { const p = o.position; if (Math.abs(p.x - ZX[k]) < 0.21 && Math.abs(p.z - ZZ) < 0.24 && Math.abs(p.y - ZY()) < 0.3) return k; } return null; };
  const api = {
    id: 'packing', scene: 'home', roam: false, walkIn: false, assets: ['laptop', 'smartphone', 'wallet', 'practice-id', 'cabin-suitcase', 'checked-suitcase', 'baggage-scale'],
    voice: 'Pack at home, so the airport is calm. Put all your electronics together in one pouch, keep your documents in the front pocket, and the heavy things go in the checked bag.',
    help: 'At home, put laptop, tablet, power bank and charger together in one pouch at the top of your cabin bag. At security you take out just that pouch. Power banks never go in the checked bag.',
    helpShort: 'Electronics together, power bank in cabin',
    enter() {
      // the learner's bags, behind the drop zones
      const cabin = d.assets.make('cabin-suitcase', { actions: false }); cabin.scale.setScalar(0.9); d.stage.props.add(cabin); cabin.position.set(-0.32, 0, -1.05);
      const checked = d.assets.make('checked-suitcase', { actions: false }); d.stage.props.add(checked); checked.position.set(0.62, 0, -1.05);
      const scaleM = d.assets.make('baggage-scale', { actions: false }); d.stage.props.add(scaleM); scaleM.position.set(1.25, 0, -1.0);
      for (const k of ['E', 'D', 'C']) {
        const z = ZONE[k];
        const box = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.26, 0.3), new THREE.MeshBasicMaterial({ color: z.color, transparent: true, opacity: 0.16, depthWrite: false, toneMapped: false }));
        box.position.set(ZX[k], ZY(), ZZ);
        const edges = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), new THREE.LineBasicMaterial({ color: z.color, toneMapped: false })); box.add(edges);
        d.stage.props.add(box);
        const lab = labelSurface(z.label + '  ·  ' + z.sub, { w: 0.5, px: 760 }); lab.mesh.position.set(ZX[k], ZY() + 0.24, ZZ); d.stage.props.add(lab.mesh); d.track(lab, false);
      }
      const spec = [
        ['laptop', 'E', null], ['tablet', 'E', ['#2d3b4f', 'TABLET', 0.2, 0.012, 0.14, 'item-tablet']], ['powerbank', 'E', ['#c9ced6', 'POWER\nBANK', 0.1, 0.022, 0.06, 'item-powerbank']], ['charger', 'E', ['#e3e6ea', 'CHARGER', 0.08, 0.04, 0.06, 'item-charger']],
        ['phone', 'D', null], ['wallet', 'D', null], ['id', 'D', null],
        ['clothes', 'C', ['#3d6fb4', 'CLOTHES', 0.3, 0.14, 0.2, 'item-clothes']], ['bottle', 'C', ['#2a8f6f', 'SHAMPOO\n500 ml', 0.1, 0.2, 0.1, 'item-bottle']],
      ];
      spec.forEach(([id, dest, box], i) => {
        let o;
        if (id === 'laptop') { o = d.assets.make('laptop', { actions: false }); o.scale.setScalar(0.62); }
        else if (id === 'phone') { o = d.assets.make('smartphone', { actions: false }); o.scale.setScalar(1.1); }
        else if (id === 'wallet') { o = d.assets.make('wallet', { actions: false }); o.scale.setScalar(1.2); }
        else if (id === 'id') { o = makeDoc(d, 'practice-id'); o.scale.setScalar(1.6); }
        else o = labelBox(box[2], box[3], box[4], box[0], box[1], box[1].includes('\n') ? 30 : 36, box[5]);
        o.userData.item = { id, dest };
        const row = i < 5 ? 0 : 1, col = i < 5 ? i : i - 5;
        d.addProp(o, { radius: 0.13, rest: 'upright', restOffset: id === 'laptop' ? 0 : (o.userData.size ? o.userData.size[1] / 2 : 0.01) }, [-0.4 + col * 0.2, d.lapY + 0.03, -0.22 - row * 0.12]);
        o.userData.grab.onRelease = (obj) => api.released(obj);
        items.push(o);
      });
      const card = new ReadingCard({
        file: 'Baggage rules', title: 'Baggage rules', subtitle: 'Typical for domestic flights. Check your own airline.', tag: 'PRACTICE AIR',
        rows: [
          { id: 'cabin', label: 'Cabin bag', value: '1 × up to 7 kg', tap: false },
          { id: 'pers', label: 'Plus', value: '1 small personal item', tap: false },
          { id: 'chk', label: 'Checked bag', value: '1 × up to 15 kg', tap: false },
          { id: 'pb', label: 'Power banks', value: 'Cabin bag only', tap: false },
          { id: 'lap', label: 'Laptop, tablet', value: 'Cabin, in one pouch', tap: false },
          { id: 'liq', label: 'Liquids', value: 'Over 100 ml: checked', tap: false },
        ],
        footer: 'Pack electronics together at home. At security you take out just one pouch, so nothing gets mixed up.',
      });
      d.addSurface(card, { pos: [0.5, d.h + 0.1, -1.0], ry: faceUser(0.5, -1.0), interactive: false, follow: { yaw: -0.5, dist: 1.5, scale: 1.6, dy: 0.02 } });
      d.setPanel({ eyebrow: 'Airport practice · 2 of 9', title: 'Pack at home, not at the airport.', body: 'Practice limits: cabin bag 7 kg, checked bag 15 kg. Check your own airline for real limits.', note: 'Drag each item into its glowing box', tone: 'normal', tasks: tasks(), buttons: [{ id: 'show', label: 'Show me' }, { id: 'help', label: 'Ask for help', kind: 'secondary' }] });
    },
    onButton(id) { if (id === 'show') d.startAssist(); if (id === 'help') d.help(); },
    released(o) {
      const it = o.userData.item; if (!it || it.placed) return false;
      const z = zoneOf(o); if (!z) return false;
      if (z === it.dest) { this.placeIn(o, z); return true; }
      d.nudge(it.dest === 'E' && z === 'D' ? 'Electronics go together in one pouch, so they come out in one go at security.' : WHY[it.id] || 'Not there. Try another box.');
      return false;
    },
    placeIn(o, z) {
      const it = o.userData.item; if (it.placed) return;
      it.placed = true; d.input.removeGrabbable(o);
      const n = count[z]++;
      o.scale.multiplyScalar(0.8); o.rotation.set(0, 0, 0);
      o.position.set(ZX[z] + ((n % 2) - 0.5) * 0.1, ZY() - 0.07 + Math.floor(n / 2) * 0.06, ZZ);
      d.voice.beep();
      d.panel.set({ tasks: tasks(), note: `${items.filter((x) => x.userData.item.placed).length} of ${items.length} packed`, tone: 'normal' });
      if (items.every((x) => x.userData.item.placed)) this.weigh();
    },
    weigh() {
      if (all) return; all = true;
      const cab = (2.6 + 1.8 + 0.5 + 0.3 + 0.2 + 0.3 + 0.7).toFixed(1), chk = (3.5 + 7.2 + 0.5).toFixed(1);
      d.success('Packed and weighed.', `Cabin bag ${cab} kg (limit 7) and checked bag ${chk} kg (limit 15). Your electronics are in one pouch: at security you pull out just that.`, 'Continue', 'Packed and weighed. Your electronics are in one pouch: at security you pull out just that.');
    },
    demo() {
      if (all) return;
      const next = items.find((o) => !o.userData.item.placed); if (!next) return;
      const dest = next.userData.item.dest, gh = d.makeGhost(next);
      const a = d.stage.props.worldToLocal(next.getWorldPosition(new THREE.Vector3())), to = new THREE.Vector3(ZX[dest], ZY(), ZZ);
      d.runDemo([{ p: a.toArray(), dur: 0.8, hold: 0.15 }, { p: [(a.x + to.x) / 2, Math.max(a.y, to.y) + 0.15, (a.z + to.z) / 2], dur: 0.7, carry: gh }, { p: to.toArray(), dur: 0.5, carry: gh, press: true }],
        { say: dest === 'E' ? 'Electronics go together in the pouch, like this.' : dest === 'D' ? 'Your documents, wallet and phone stay with you in the front pocket.' : 'Heavy things and big liquids go in the checked bag.', apply: () => this.placeIn(next, dest) });
    },
  };
  return api;
};

/* ------------------------------------------------------------------ 0. the phone: your booking, then the journey begins */
const phone = (d) => {
  let phase = 'read';
  const api = {
    id: 'phone', scene: 'home', roam: false, table: false, walkIn: false, panelOffset: 0.9, assets: [],
    voice: 'You are at home. You take your phone out of your pocket. Your booking is ready.',
    help: 'Your booking is on your phone. Point at the notification and pinch, or press the trigger, to open it. Read the flight, the time and the terminal. Then choose Ready for the airport.',
    enter() {
      phase = 'read'; d.phone.opened = false; d.phone.show('lock', 'ready'); d.pres.enter('phone');
      d.setPanel({ title: 'Your booking is ready.', body: 'Point at the notification and pinch.', note: '', tone: 'normal', buttons: [] });   // (the phone comes out of your pocket)
    },
    phoneOpened() {
      d.setPanel({ title: 'Read your booking.', body: 'Then choose Ready for the airport.', note: '', tone: 'normal', buttons: [] });
      d.say('Have a look at your flight, the time and the terminal. You can also pick the phone up by its edge.');
    },
    phoneGrabbed() { d.panel.set({ note: 'Nicely done. Let go and the phone settles back.', tone: 'normal' }); },
    phoneReady() {
      if (phase !== 'read') return; phase = 'go'; d.voice.success();
      d.phone.putAway();
      d.success('Your cab is waiting.', 'You stay seated. Continue when you are ready.', 'Go to the cab');
    },
    demo() {
      if (phase !== 'read') return;
      const open = d.phone.view === 'lock', id = open ? 'open' : 'ready';
      const near = d.surfacePoint(d.phone.screen, id, 0.14), to = d.surfacePoint(d.phone.screen, id, 0.03);
      d.runDemo([{ p: near.toArray(), dur: 1.1 }, { p: to.toArray(), dur: 0.5, press: true }],
        { say: open ? 'Point at the notification and pinch, like this.' : 'When you have read it, choose Ready for the airport.', apply: () => d.phone.tap(id) });
    },
  };
  return api;
};

/** The airport facade as one big photo, in the scenery (so it can be approached). The entrance sits at x = 0. Shown in mixed reality too. */
function facadePlane(d, w, dist) {
  if (d.app.env.theme360) return null;      // the 360 photograph already shows the terminal
  const t = photoTexture('view-kerb'); if (!t) return null;
  const h = w * 1024 / 1536;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: t, toneMapped: false, side: THREE.DoubleSide }));
  m.position.set(-(0.78 - 0.5) * w, 0.23 * h, -dist); m.name = 'Facade'; d.stage.scenery.add(m); return m;
}

/** The inside of the cab: your photograph, with the green glass keyed out so the road shows through the windows. Seen from the back seat. */
function cabPlate(d, file = 'cab-interior-driver.webp') {
  const DIST = 2.4, W = 2 * DIST * Math.tan(37 * Math.PI / 180), Hh = W * 1024 / 1536;     // wide-angle photo: about 74 degrees across, placed beyond the cards
  const g = new THREE.Group(); g.name = 'CabPlate';
  const mat = new THREE.MeshBasicMaterial({ transparent: true, alphaTest: 0.02, toneMapped: false, side: THREE.DoubleSide, depthWrite: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, Hh), mat); mesh.renderOrder = 5; g.add(mesh);
  mesh.position.set(0, Math.max(1.0, d.h) - 0.05, -DIST);
  // A closed cabin shell around the photo (open only in front, where the windows are) so no outdoor ground shows above, below or beside it.
  const shellMat = new THREE.MeshBasicMaterial({ color: 0x4a4b4e, side: THREE.BackSide, toneMapped: false }), cy = mesh.position.y, ch = Hh + 0.1, R = DIST + 0.25, half = 37.5 * Math.PI / 180;
  const wall = new THREE.Mesh(new THREE.CylinderGeometry(R, R, ch, 48, 1, true, Math.PI + half, 2 * Math.PI - 2 * half), shellMat); wall.position.y = cy; g.add(wall);
  const capMat = shellMat.clone(); capMat.side = THREE.DoubleSide; g.userData.capMat = capMat;
  for (const s of [-1, 1]) { const cap = new THREE.Mesh(new THREE.CircleGeometry(R, 48), capMat); cap.rotation.x = Math.PI / 2; cap.position.y = cy + s * ch / 2 + (s < 0 ? 0.1 : 0); g.add(cap); }     // the floor sits just above the ground so it covers it
  const img = new Image(); img.onload = () => {
    const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
    const x = c.getContext('2d'); x.drawImage(img, 0, 0);
    const id = x.getImageData(0, 0, c.width, c.height), p = id.data;
    { let r = 0, gg = 0, b = 0, n = 0; for (let j = (c.height - 6) * c.width * 4; j < p.length; j += 4) { r += p[j]; gg += p[j + 1]; b += p[j + 2]; n++; } shellMat.color.setRGB(r / n / 255 * 0.8, gg / n / 255 * 0.8, b / n / 255 * 0.8, THREE.SRGBColorSpace); capMat.color.copy(shellMat.color); }   // the shell matches the seat fabric
    for (let i = 0; i < p.length; i += 4) {
      const r = p[i], gr = p[i + 1], b = p[i + 2], over = gr - Math.max(r, b);
      if (over > 70) p[i + 3] = 0;                                    // pure key colour: clear glass
      else if (over > 25) { p[i + 3] = Math.round(255 * (70 - over) / 45); p[i + 1] = Math.max(r, b); }   // the soft edge: fade and remove the green fringe
      else if (over > 8) p[i + 1] = Math.max(r, b) + 4;               // slight green spill on the frame
    }
    x.putImageData(id, 0, 0);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
    mat.map = t; mat.needsUpdate = true;
  };
  img.src = new URL('../../assets/images/' + file, import.meta.url).href;
  g.userData.dispose = () => { mat.map?.dispose(); mat.dispose(); mesh.geometry.dispose(); };
  return g;
}

/** The taxi as a photo billboard (green key removed). state: 'closed' or 'open' (rear door). Returns the mesh, or null if the photo is missing. */
function taxiBillboard(state = 'closed') {
  const t = keyedCrop(state === 'open' ? 'cab-side-door-open' : 'cab-side-closed'); if (!t) return null;
  const cw = 4.5, ch = cw / t.userData.aspect;
  const m = new THREE.Mesh(new THREE.PlaneGeometry(cw, ch).translate(0, ch / 2, 0), new THREE.MeshBasicMaterial({ map: t, transparent: true, alphaTest: 0.4, side: THREE.DoubleSide, toneMapped: false }));
  m.userData.open = keyedCrop('cab-side-door-open'); m.userData.closed = keyedCrop('cab-side-closed'); return m;
}

/** A quick dark blink, so a change of place never pops. */
function blink(d, change) {
  const env = d.app.env; env.veil.visible = true;
  d.tweens.add({ dur: d.reduceMotion ? 0.05 : 0.3, update: (e) => { env.veil.material.opacity = e; }, done: () => {
    change();
    d.tweens.add({ dur: d.reduceMotion ? 0.05 : 0.5, update: (e) => { env.veil.material.opacity = 1 - e; }, done: () => { env.veil.visible = false; } });
  } });
}

/** A roadside sign you can point at. */
function terminalSign(label, arrow, onPick) {
  const s = new Surface({ width: 1.5, pxW: 900, pxH: 540 });
  s.painter = (ctx) => {
    const on = s.hoverId === 'sel';
    ctx.fillStyle = on ? '#13908b' : '#0b6b68'; roundRect(ctx, 6, 6, 888, 528, 40); ctx.fill();
    ctx.strokeStyle = '#fff'; ctx.lineWidth = 14; roundRect(ctx, 26, 26, 848, 488, 28); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'center'; ctx.font = `800 118px ${FONT}`; ctx.fillText(label, 450, 262); ctx.font = `700 160px ${FONT}`; ctx.fillText(arrow, 450, 440); ctx.textAlign = 'left';
    s.hot = [{ id: 'sel', x: 0, y: 0, w: 900, h: 540 }];
  };
  s.redraw(); s.onSelect = () => onPick(); return s;
}

/* ------------------------------------------------------------------ 0b. the cab: board it, ride to the airport, choose your terminal */
const cab = (d) => {
  let phase = 'board', cabMesh, driver, interior, road; const signs = [];
  const api = {
    id: 'cab', scene: 'outdoor', roam: false, people: ['driver'], table: false, panelOffset: 0.8, walkIn: false, assets: [],
    voice: 'Your cab is here.',
    help: 'Your cab is waiting. Choose Get in. Later, look for the terminal on your booking: it says Terminal 2. Point at that sign.',
    enter() {
      d.app.env.setOutdoorTheme('home');                                   // the street outside the traveller's home
      cabMesh = taxiBillboard('closed');
      driver = d.addStaff('driver', 'Cab driver', d.stage.scenery, [-0.7, 0, -1.3]);
      if (cabMesh) {
        d.addScenery(cabMesh, { x: -1.55, z: 0.35, ry: Math.PI / 2, fixed: true });
        cabMesh.position.z = -15; driver.root.visible = false;                     // the cab pulls up from down the road, then stops
        d.tweens.add({ dur: d.reduceMotion ? 0.3 : 3.4, update: (e) => { cabMesh.position.z = -15 + 15.35 * (1 - Math.pow(1 - e, 2.2)); }, done: () => { driver.root.visible = true; driver.say('Good morning! Airport?', 7); } });
      } else driver.say('Good morning! Airport?', 7);
      d.setPanel({ title: 'Your cab is here.', body: 'Get in when you are ready.', note: '', tone: 'normal', buttons: [{ id: 'in', label: 'Get in' }] });
    },
    update(dt) { road?.update(dt); },
    exit() { road?.dispose(); road = null; },
    staffLine() { return phase === 'terminal' ? 'Which terminal, please? Your booking will tell you.' : 'Take your time. Get in whenever you are ready.'; },
    onButton(b) { if (b === 'in') this.board(); if (b === 'cont' && phase === 'rideDone') this.terminal(); },
    board() {
      if (phase !== 'board') return; phase = 'ride'; d.voice.success();
      d.setPanel({ title: 'On the way to the airport.', body: 'Sit back. You stay seated.', note: '', tone: 'normal', buttons: [] });
      d.say('Off we go. Sit back. You stay seated while the cab takes you to the airport.');
      if (cabMesh?.userData.open) cabMesh.material.map = cabMesh.userData.open;       // the rear door swings open
      d.tweens.add({ delay: d.reduceMotion ? 0.1 : 1.1, dur: 0.01, done: () => blink(d, () => {
        d.app.env.setOutdoorTheme('airport');
        if (cabMesh) cabMesh.visible = false; if (driver) driver.root.visible = false;
        interior = cabPlate(d); d.stage.props.add(interior);                      // the real cab interior (the driver is in the photograph)
        road = new RoadVideo(d.stage.props, Math.max(1.0, d.h)); road.preload('road-arrival'); road.play('road-drive', false, 0.86);      // slowed a little so the one clip lasts the whole ride, with no loop jump
            // the road moves past the windscreen; the side windows slide
        d.app.env.driveSpeed = 0;
        const sc = d.stage.scenery, dur = d.reduceMotion ? 0.6 : 9;
        d.tweens.add({ dur, update: (e) => { sc.position.z = 44 * (1 - Math.pow(1 - e, 2)); }, done: () => {
          d.app.env.driveSpeed = 0; road?.stop();
          if (phase !== 'ride') return; phase = 'rideDone';
          d.setPanel({ title: 'You are at the airport.', body: 'Continue to choose your terminal.', note: '', tone: 'normal', buttons: [{ id: 'cont', label: 'Continue' }] }); d.say('You are at the airport.');
        } });
      }) });
    },
    terminal() {
      phase = 'terminal';
      const mk = (label, arrow, x, n) => { const s = terminalSign(label, arrow, () => this.pick(n)); d.addSurface(s, { pos: [x, 1.55, -3.6 - d.stage.scenery.position.z], ry: 0, parent: d.stage.scenery }); signs.push(s); };   // the road has moved on: place them 3.6 m ahead of the cab now
      mk('Terminal 1', '←', -1.1, 1); mk('Terminal 2', '→', 1.1, 2);
      d.setPanel({ title: 'Which terminal is yours?', body: 'Check your booking on the phone, then point at the sign.', note: '', tone: 'normal', buttons: [] });
      d.say('We are at the airport. Which terminal is yours? Check your booking on the phone, then point at the sign.');
      d.panel.set({ chips: d._chips() });
    },
    pick(n) {
      if (phase !== 'terminal') return;
      if (n !== 2) { d.nudge('That is Terminal 1. Your booking says Terminal 2. Open the phone to check.'); return; }
      phase = 'drive'; d.voice.success();
      for (const s of signs) s.mesh.visible = false;
      d.setPanel({ title: 'Terminal 2.', body: 'The cab takes you to the entrance.', note: '', tone: 'normal', buttons: [] });
      d.say('Terminal two. The driver takes you to the entrance.');
      d.app.env.driveSpeed = 0; road?.play('road-arrival', false);                  // the second clip: along the road and up to the terminal
      const arrive = () => d.moveWorld(0, 18.5, () => { road?.stop(); d.success('Terminal 2.', 'The cab has stopped at the entrance.', 'Continue'); }, { route: false, min: 9.8, speed: 1.9 });
      if (road && d.app.comfort === 'fade') d.tweens.add({ delay: 9.0, dur: 0.01, done: arrive }); else arrive();      // with the blink comfort option, let the whole clip play before the jump
    },
    demo() {
      if (phase === 'board') { const to = d.surfacePoint(d.panel, 'in', 0.03), near = d.surfacePoint(d.panel, 'in', 0.14); d.runDemo([{ p: near.toArray(), dur: 1.1 }, { p: to.toArray(), dur: 0.5, press: true }], { say: 'Choose Get in, like this.', apply: () => this.board() }); }
      else if (phase === 'rideDone') { const to = d.surfacePoint(d.panel, 'cont', 0.03), near = d.surfacePoint(d.panel, 'cont', 0.14); d.runDemo([{ p: near.toArray(), dur: 1.0 }, { p: to.toArray(), dur: 0.5, press: true }], { say: 'Choose Continue when you are ready.', apply: () => this.terminal() }); }
      else if (phase === 'terminal') { const s = signs[1]; const to = d.surfacePoint(s, 'sel', 0.05), near = d.surfacePoint(s, 'sel', 0.3); d.runDemo([{ p: near.toArray(), dur: 1.2 }, { p: to.toArray(), dur: 0.5, press: true }], { say: 'Your booking says Terminal 2. Point at that sign, like this.', apply: () => this.pick(2) }); }
    },
  };
  return api;
};

/* ------------------------------------------------------------------ 1. at the kerb: the driver stops at the entrance; step out */
const kerb = (d) => {
  let doors, cab, driver, phase = 'cab', alive = false, rmCab;
  const mat = (c, r = 0.5, m = 0.1) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const box = (w, h, dd, m, x, y, z) => { const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), m); b.position.set(x, y, z); b.castShadow = true; return b; };
  const api = {
    id: 'kerb', scene: 'outdoor', people: ['driver'], table: false, panelOffset: 0.8, walkIn: false, bounds: { x0: -3, x1: 3, z0: -3.2, z1: 3 }, assets: ['terminal-sliding-doors', 'terminal-sign', 'luggage-trolley', 'cabin-suitcase'],
    voice: 'You have arrived at the airport. Step out of the cab.',
    help: 'The cab has stopped at the terminal. Tap Get out, and the entrance is straight ahead.',
    enter() {
      // the taxi you arrived in, parked beside you with its rear door open (a real photo, background removed)
      d.app.env.setOutdoorTheme('airport');
      cab = taxiBillboard('open');
      if (cab) { d.addScenery(cab, { x: -1.55, z: 0.35, ry: Math.PI / 2, fixed: true }); rmCab = d.obstacle(cab); }
      driver = d.addStaff('driver', 'Cab driver', d.stage.scenery, [-1.0, 0, 1.2]); driver.noPush = true; alive = true;
      doors = d.assets.make('terminal-sliding-doors'); d.addScenery(doors, { x: 0, z: -2.5 });
      if (d.app.env.theme360) doors.traverse((o) => { if (o.isMesh) o.visible = false; });      // the photograph shows the real entrance; the doors stay as an invisible barrier
      const ksign = d.assets.make('terminal-sign', { unique: ['EditableScreen'] }); d.addScenery(ksign, { x: 0, y: 0.15, z: -2.7 });
      d.track(screenOverlay(ksign, { pxW: 1024, paint: paintSign({ lines: ['Terminal 2'], sub: 'Departures', arrow: '↑', state: { glow: false } }) }), false);
      d.obstacle(d.addScenery(d.assets.make('luggage-trolley'), { x: 0.9, z: -1.2, ry: 0.4 }));
      facadePlane(d, 17, 8.5);
      d.setPanel({ title: 'You have arrived.', body: 'Step out of the cab.', note: '', tone: 'normal', buttons: [{ id: 'out', label: 'Get out' }] });
    },
    exit() { alive = false; },
    /** The driver gets your bag out of the boot, puts it on the trolley, gets back in, and the cab drives away. */
    unload() {
      const sc = d.stage.scenery, T = d.tweens, quick = d.reduceMotion;
      const bag = d.assets.make('cabin-suitcase', { actions: false }); bag.visible = false; sc.add(bag);
      const lift = (() => { const b = new THREE.Box3().setFromObject(bag); return -b.min.y; })();
      const P = (x, z) => new THREE.Vector3(x, 0, z);
      const walk = (from, to, t0, dur, carry) => T.add({ delay: t0, dur, update: (e) => {
        if (!alive || !driver) return;
        const p = from.clone().lerp(to, e); driver.root.position.set(p.x, 0, p.z); driver.heading = Math.atan2(to.x - from.x, to.z - from.z);
        if (carry) { const h = driver.heading; bag.position.set(p.x + Math.cos(h) * 0.3 + Math.sin(h) * 0.12, lift, p.z - Math.sin(h) * 0.3 + Math.cos(h) * 0.12); bag.rotation.y = h; }
      } });
      const say = (t0, f) => T.add({ delay: t0, dur: 0.01, done: () => { if (alive) f(); } });
      const k = quick ? 0.25 : 1;
      const A = P(-1.0, 1.2), B = P(-1.05, -2.2), C = P(0.4, -1.35), D = P(-1.5, 0.1);
      say(0.8 * k, () => driver.playClip(/walk/i));
      walk(A, B, 0.8 * k, 3.4 * k);
      say(4.2 * k, () => { driver.playClip(/idle/i); driver.heading = Math.PI; bag.visible = true; bag.position.set(-1.45, lift, -2.15); });      // at the boot
      say(5.7 * k, () => driver.playClip(/walk/i));
      walk(B, C, 5.7 * k, 3.0 * k, true);
      say(8.7 * k, () => { driver.playClip(/idle/i); bag.position.set(0.9, 0.3 + lift, -1.2); bag.rotation.y = 0.4; driver.say('Your bag is on the trolley.', 5); });
      say(10.6 * k, () => driver.playClip(/walk/i));
      walk(C, D, 10.6 * k, 2.6 * k);
      say(13.2 * k, () => {
        driver.root.visible = false;                                         // back in the driver's seat, hidden behind the cab
        if (cab?.userData.closed) cab.material.map = cab.userData.closed;    // the door shuts
        T.add({ dur: quick ? 0.4 : 4.5, update: (e) => { if (alive && cab) cab.position.z = 0.35 + 18 * e * e; }, done: () => { if (cab) cab.visible = false; rmCab?.(); } });   // and the cab drives away
      });
    },
    onButton(b) { if (b === 'out') this.out(); },
    out() {
      if (phase !== 'cab') return; phase = 'walk'; d.voice.success();
      this.unload();                                                    // the driver gets your bag while you step out
      d.setPanel({ title: 'Walk to the entrance.', body: 'Walk up to the doors.', buttons: [] });
      d.say('Thank you, and have a good flight. Now walk to the entrance.'); driver?.say('Have a good flight!', 6);
      d.setStation({ point: new THREE.Vector3(0, 0, -2.5), label: 'the entrance', radius: 1.5, onArrive: () => d.success('You are at the entrance.', 'Continue to the document check.', 'Continue') });
    },
    demo() { if (phase !== 'cab') return; d.runDemo([{ p: [0, d.h - 0.2, -0.9], dur: 1.0 }, { p: [0, d.h - 0.2, -1.3], dur: 0.6, press: true }], { say: 'Tap Get out, like this.', apply: () => this.out() }); },
  };
  return api;
};

/* ------------------------------------------------------------------ 3. arrive at the terminal and enter */
const arrival = (d) => {
  let guard, desk, zoneMesh, doors, booking, id, bookingCardS, phase = 'sign', signSurf, finished = false, rmDoors;
  const zone = { min: new THREE.Vector3(-0.62, 0.95, -0.3), max: new THREE.Vector3(0.62, 1.6, 0.36) };
  const inZone = (o) => { const p = desk.worldToLocal(o.getWorldPosition(new THREE.Vector3())); return p.x > zone.min.x && p.x < zone.max.x && p.y > zone.min.y && p.y < zone.max.y && p.z > zone.min.z && p.z < zone.max.z; };
  const api = {
    id: 'arrival', scene: 'outdoor', people: ['guard'], panelOffset: 0.95, walkDist: 1.6, bounds: { x0: -2.6, x1: 2.6, z0: -2.9, z1: 3.5 }, assets: ['terminal-sliding-doors', 'terminal-sign', 'information-desk', 'booking-document', 'practice-id', 'luggage-trolley'],
    voice: 'You have arrived at the airport. You already know your terminal from your booking. Check that the sign matches, then show your ticket and photo I D to the guard at the entrance.',
    help: 'Your booking says Terminal 2. The sign at the entrance must say the same. The guard checks your ticket and your photo ID before you may go in.',
    helpShort: 'Sign must match the booking',
    enter() {
      d.app.env.setOutdoorTheme('airport');
      doors = d.assets.make('terminal-sliding-doors'); d.addScenery(doors, { x: 0, z: -2.5 });
      if (d.app.env.theme360) doors.traverse((o) => { if (o.isMesh) o.visible = false; });      // the photograph shows the real entrance; the doors stay as an invisible barrier
      const sign = d.assets.make('terminal-sign', { unique: ['EditableScreen'] }); d.addScenery(sign, { x: 0, y: 0.15, z: -2.7 });
      rmDoors = d.obstacle(doors);      // shut until the guard has checked you
      const st = { glow: false };
      signSurf = screenOverlay(sign, { pxW: 1024, paint: paintSign({ lines: ['Terminal 2'], sub: 'Departures · Entry 3', arrow: '↑', state: st }) });
      d.track(signSurf, false);
      desk = new THREE.Group(); desk.add(d.assets.make('information-desk'));
      d.addScenery(desk, { x: 0, z: -1.3, fixed: true }); d.obstacle(desk);
      guard = d.addStaff('guard', 'Entry guard · practice', desk, [0.15, 0, -0.75]);
      photoPlane(d, 'view-hall-wide', 9.6, 3.2, [0, 1.6, -5.6]);
      d.addSupport(-0.8, 0.8, -1.3 - 0.38, -1.3 + 0.38, 1.027);
      d.addScenery(d.assets.make('luggage-trolley'), { x: -1.8, z: -1.0, ry: 0.4 });
      zoneMesh = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 0.5).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: COLORS.tealGlow, transparent: true, opacity: 0, depthWrite: false, toneMapped: false }));
      zoneMesh.position.set(0, 1.032, 0.03); desk.add(zoneMesh);
      d.setStation({ point: new THREE.Vector3(0, 0, -1.3), label: "the guard's desk", radius: 1.4 });
      this.matched();   // you already know your terminal: go straight to the guard
    },
    onButton(b) {
      if (b === 'help') return d.help();
      if (b === 'book') { if (!bookingCardS) { bookingCardS = bookingCard(); d.addSurface(bookingCardS, { pos: [0.4, d.h - 0.02, -0.85], ry: faceUser(0.4, -0.85), interactive: false, follow: { yaw: -0.42, dist: 1.4, scale: 0.8, dy: -0.02 } }); } bookingCardS.setState({ highlight: 'terminal' }); d.say('Your booking says Terminal 2.'); return; }
      if (b === 'match' && phase === 'sign') return this.matched();
      if (b === 'show') d.startAssist();
    },
    matched() {
      phase = 'docs'; d.voice.beep(); guard?.say('Ticket and photo ID, please.');
      booking = makeDoc(d, 'booking-document'); booking.scale.setScalar(0.85); booking.rotation.x = -0.5;
      id = makeDoc(d, 'practice-id'); id.scale.setScalar(1.6); id.rotation.x = -0.5;
      d.addProp(booking, { radius: 0.2 }, [-0.18, d.h - 0.42, -0.45]); d.addProp(id, { radius: 0.15 }, [0.2, d.h - 0.42, -0.45]);
      d.setPanel({ title: 'Show your ticket and ID.', body: 'Put both on the desk.', note: 'Booking ☐   ID ☐', buttons: [{ id: 'show', label: 'Show me' }, { id: 'help', label: 'Ask for help', kind: 'secondary' }] });
      d.say('Well done. Now the guard needs to see your ticket and your photo I D. Place both on the desk.');
    },
    update() {
      zoneMesh.material.opacity = phase === 'docs' ? 0.2 + 0.25 * pulse() : 0;
      if (phase !== 'docs') return;
      const b = !booking.userData.heldBy && inZone(booking), i = !id.userData.heldBy && inZone(id);
      const note = `Booking ${b ? '☑' : '☐'}   ID ${i ? '☑' : '☐'}`;
      if (d.panel.state.tone === 'normal' && d.panel.state.note !== note && d.panel.state.note.startsWith('Booking')) d.panel.set({ note });
      if (b && i) this.pass();
    },
    pass() {
      if (phase !== 'docs') return; phase = 'walk'; d.voice.success();
      d.setPanel({ title: 'Thank you. You may go in.', body: 'Walk through the doors.', note: '', buttons: [] });
      for (const a of [0, 1]) doors.userData.actions?.toggle(a);
      rmDoors?.(); api.bounds = { x0: -2.6, x1: 2.6, z0: -4.4, z1: 3.5 };   // the doors are open: you may walk through
      d.say('Thank you. You may go in. Walk through the doors.'); guard?.say('Thank you. Please go in.');
      d.setStation({ point: new THREE.Vector3(0, 0, -2.5), label: 'the entrance doors', radius: 1.2, onArrive: () => { finished = true; d.success('You are inside Terminal 2.', 'Ticket and ID checked. Next, find your airline\'s check-in counter.'); } });
    },
    demo() {
      if (finished) return;
      if (phase === 'sign') {
        d.runDemo([{ p: [0, d.h - 0.2, -0.9], dur: 1.0 }, { p: [0, d.h - 0.2, -1.4], dur: 0.7, press: true }], { say: 'The sign says Terminal 2, and so does your booking. They match.', apply: () => this.matched() });
      } else if (phase === 'docs') {
        const toStage = (v) => d.worldToStage(desk.localToWorld(v));
        const here = (o) => d.stage.props.worldToLocal(o.getWorldPosition(new THREE.Vector3()));
        const fr = [];
        [booking, id].forEach((o, k) => {
          if (inZone(o) && !o.userData.heldBy) return;
          const gh = d.makeGhost(o), a = here(o), z = toStage(new THREE.Vector3(k ? 0.22 : -0.22, 1.08, 0.03));
          fr.push({ p: a.toArray(), dur: 0.9, hold: 0.2 }, { p: [(a.x + z.x) / 2, Math.max(a.y, z.y) + 0.15, (a.z + z.z) / 2], dur: 0.8, carry: gh }, { p: z.toArray(), dur: 0.6, carry: gh, press: true });
        });
        if (!fr.length) return;
        d.runDemo(fr, { say: 'Place your ticket and your photo I D on the desk, like this.', apply: () => { [booking, id].forEach((o, k) => { if (!inZone(o)) { o.position.copy(toStage(new THREE.Vector3(k ? 0.22 : -0.22, 1.036, 0.03))); o.rotation.set(FLAT_X, 0, 0); } }); } });
      }
    },
  };
  return api;
};

export const STEPS = [phone, packing, cab, kerb, arrival, checkin, security, gate, gatechange, boarding, seat];
/** One source for step ids (STEPS[i] has id STEP_IDS[i]). Packing is optional home practice, entered from the phone by choice. */
export const STEP_IDS = ['phone', 'packing', 'cab', 'kerb', 'arrival', 'checkin', 'security', 'gate', 'gatechange', 'boarding', 'seat'];
export const OPTIONAL_STEPS = new Set(['packing']);
/** Kept for reference: the old booking-reading lesson, replaced by the phone. */
export const HOME_STEPS = [booking];


/** A box whose big faces show a real product photo (power bank, bottle...), sides in a plain colour. */
function photoBox(w, h, d, color, text, photo) {
  const face = (fw, fh, zoom) => { const c = document.createElement('canvas'); c.width = 384; c.height = Math.max(96, Math.round(384 * fh / fw)); const x = c.getContext('2d'); x.fillStyle = '#ffffff'; x.fillRect(0, 0, c.width, c.height); drawCover(x, IMG[photo], 0, 0, c.width, c.height, zoom); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
  const side = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
  const pm = (t) => new THREE.MeshStandardMaterial({ map: t, roughness: 0.6 });
  const tall = h > w * 1.4;
  const mats = [side, side, pm(face(w, d, 1.05)), side, pm(face(w, h, tall ? 1.0 : 1.1)), pm(face(w, h, tall ? 1.0 : 1.1))];
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mats); m.castShadow = true;
  const g = new THREE.Group(); g.add(m); g.userData.size = [w, h, d]; return g;
}
