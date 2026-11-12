import * as THREE from 'three';
import { Surface } from './surface.js';
import { COLORS, PRACTICE as P } from '../config.js';
import { FONT, roundRect, wrapText } from '../util.js';

const pulse = () => 0.5 + 0.5 * Math.sin(performance.now() / 260);

/** A large readable "document window" with tappable rows (booking PDF, boarding pass reading card). */
export class ReadingCard extends Surface {
  constructor({ title, subtitle = '', rows, footer = '', tag = 'PRACTICE ONLY', file = '', width = 0.62 }) {
    super({ width, pxW: 1024, pxH: 150 + rows.length * 96 + (footer ? 170 : 80) + (subtitle ? 100 : 0) });
    this.title = title; this.subtitle = subtitle; this.rows = rows; this.footer = footer; this.tag = tag; this.file = file;
    this.highlight = null; this.done = new Set(); this.wrong = null;
    this.painter = (ctx) => this.paint(ctx);
    this.mesh.renderOrder = 8;
    this.redraw();
  }
  paint(ctx) {
    const W = this.pxW, H = this.pxH;
    this.hot = [];
    ctx.save();
    ctx.shadowColor = 'rgba(10,30,50,0.3)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    ctx.fillStyle = 'rgba(252,253,252,0.97)'; roundRect(ctx, 24, 16, W - 48, H - 40, 44); ctx.fill();
    ctx.restore();
    ctx.fillStyle = COLORS.teal; ctx.globalAlpha = 0.12; roundRect(ctx, 24, 16, W - 48, 120, 44); ctx.fill(); ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
    if (this.file) { ctx.fillStyle = COLORS.muted; ctx.font = `600 28px ${FONT}`; ctx.fillText('▣  ' + this.file, 70, 66); }
    // tag
    ctx.font = `800 24px ${FONT}`; const tw = ctx.measureText(this.tag).width + 36;
    ctx.fillStyle = 'rgba(212,52,79,0.16)'; roundRect(ctx, W - 70 - tw, 36, tw, 46, 14); ctx.fill();
    ctx.fillStyle = COLORS.warn; ctx.fillText(this.tag, W - 70 - tw + 18, 69);
    ctx.fillStyle = COLORS.navy; ctx.font = `800 58px ${FONT}`; ctx.fillText(this.title, 70, 122);
    let y = 150;
    if (this.subtitle) { ctx.fillStyle = COLORS.muted; ctx.font = `500 32px ${FONT}`; y = wrapText(ctx, this.subtitle, 70, y + 36, W - 140, 42) + 10; }
    for (const r of this.rows) {
      const h = 84, x = 60, w = W - 120;
      const isHi = this.highlight === r.id, isDone = this.done.has(r.id), hover = this.hoverId === r.id && r.tap !== false, wrong = this.wrong === r.id;
      if (isDone) { ctx.fillStyle = 'rgba(27,138,134,0.18)'; roundRect(ctx, x, y, w, h, 20); ctx.fill(); }
      else if (isHi) { ctx.fillStyle = `rgba(56,225,210,${0.28 + 0.2 * pulse()})`; roundRect(ctx, x, y, w, h, 20); ctx.fill(); ctx.strokeStyle = COLORS.teal; ctx.lineWidth = 4; roundRect(ctx, x, y, w, h, 20); ctx.stroke(); }
      else if (hover) { ctx.fillStyle = 'rgba(27,138,134,0.12)'; roundRect(ctx, x, y, w, h, 20); ctx.fill(); }
      if (wrong) { ctx.strokeStyle = COLORS.warn; ctx.lineWidth = 4; roundRect(ctx, x, y, w, h, 20); ctx.stroke(); }
      ctx.strokeStyle = 'rgba(15,34,54,0.08)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(x + 10, y + h + 6); ctx.lineTo(x + w - 10, y + h + 6); ctx.stroke();
      ctx.fillStyle = COLORS.muted; ctx.font = `500 32px ${FONT}`; ctx.fillText(r.label, x + 20, y + 54);
      ctx.fillStyle = COLORS.navy; ctx.font = `700 40px ${FONT}`; ctx.fillText(r.value, x + 330, y + 56);
      if (isDone) { ctx.fillStyle = COLORS.teal; ctx.font = `800 42px ${FONT}`; ctx.fillText('✓', x + w - 60, y + 58); }
      this.hot.push({ id: r.id, x, y, w, h });
      y += h + 12;
    }
    if (this.footer) {
      ctx.fillStyle = 'rgba(15,34,54,0.06)'; roundRect(ctx, 60, y + 8, W - 120, 120, 24); ctx.fill();
      ctx.fillStyle = COLORS.ink; ctx.font = `500 32px ${FONT}`; wrapText(ctx, 'ⓘ  ' + this.footer, 90, y + 56, W - 180, 42);
    }
  }
  setState({ highlight = this.highlight, done = this.done, wrong = null } = {}) { this.highlight = highlight; this.done = done; this.wrong = wrong; this.redraw(); }
  tick() { if (this.highlight) this.redraw(); } // animate the pulse
}

export const bookingCard = () => new ReadingCard({
  file: 'Booking_Confirmation.pdf', title: 'Booking confirmation', subtitle: 'Thank you for choosing Practice Air. Here are your flight details.',
  rows: [
    { id: 'name', label: 'Passenger name', value: P.passenger },
    { id: 'flight', label: 'Airline and flight', value: `${P.airline} · ${P.flight}` },
    { id: 'from', label: 'From', value: `${P.from.city} (${P.from.code})` },
    { id: 'to', label: 'To', value: `${P.to.city} (${P.to.code})` },
    { id: 'dep', label: 'Departure', value: P.departure },
    { id: 'terminal', label: 'Terminal', value: `Terminal ${P.terminal}` },
    { id: 'ref', label: 'Booking reference', value: P.ref },
  ],
  footer: 'Your boarding pass is issued after check-in, online or at the airport.',
});

export const passCard = () => new ReadingCard({
  file: 'Boarding pass', title: 'Boarding pass', subtitle: 'Check your name and flight before you walk away.',
  rows: [
    { id: 'name', label: 'Passenger name', value: P.passenger },
    { id: 'flight', label: 'Flight', value: `${P.airline} · ${P.flight}` },
    { id: 'route', label: 'Route', value: `${P.from.code} → ${P.to.code}`, tap: false },
    { id: 'gate', label: 'Gate (printed)', value: P.gateOriginal, tap: false },
    { id: 'seat', label: 'Seat', value: P.seat, tap: false },
    { id: 'boarding', label: 'Boarding time', value: P.boarding, tap: false },
  ],
  footer: 'Gates can change. Always check the screens before you walk to the gate.',
});

/** Overlay a crisp interactive canvas on a model's "EditableScreen" mesh (avoids UV guesswork). */
export function screenOverlay(root, { meshName = 'EditableScreen', paint, pxW = 1024, hot = [], lift = 0.004 } = {}) {
  const mesh = root.getObjectByName(meshName);
  if (!mesh) return null;
  root.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(mesh);
  // convert to root-local
  const inv = new THREE.Matrix4().copy(root.matrixWorld).invert();
  box.applyMatrix4(inv);
  const w = box.max.x - box.min.x, h = box.max.y - box.min.y;
  const s = new Surface({ width: w * 0.94, height: h * 0.9, pxW });
  s.mesh.position.set((box.max.x + box.min.x) / 2, (box.max.y + box.min.y) / 2, box.max.z + lift);
  s.painter = paint; s.hot = hot; s.mesh.renderOrder = 5;
  s.material.toneMapped = false;
  root.add(s.mesh);
  s.redraw();
  return s;
}

/** Invisible box a learner can aim at / pinch (virtual seats etc). Shows an outline on hover. */
export class Hotspot {
  constructor({ size = [0.5, 0.5, 0.5], center = [0, 0, 0], onSelect, label = '' }) {
    const geo = new THREE.BoxGeometry(...size);
    this.mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ visible: false }));
    this.mesh.position.set(...center);
    this.outline = new THREE.LineSegments(new THREE.EdgesGeometry(geo), new THREE.LineBasicMaterial({ color: COLORS.tealGlow, transparent: true, depthTest: false, toneMapped: false }));
    this.outline.visible = false; this.outline.renderOrder = 15;
    this.mesh.add(this.outline);
    this.onSelect = onSelect; this.label = label; this.enabled = true;
    this.mesh.userData.interact = this;
  }
  hover() { this.outline.visible = true; return true; }
  leave() { this.outline.visible = false; }
  select() { this.onSelect?.(this); return true; }
  flash(on) { this.outline.visible = on; }
}

/** A small floating label (staff help point, callouts). */
export function labelSurface(text, { w = 0.34, tone = 'teal', px = 640 } = {}) {
  const s = new Surface({ width: w, pxW: px, pxH: 150 });
  s.text = text;
  s.painter = (ctx) => {
    ctx.clearRect(0, 0, px, 150);
    ctx.fillStyle = tone === 'warn' ? 'rgba(212,52,79,0.95)' : 'rgba(11,31,51,0.92)';
    roundRect(ctx, 8, 10, px - 16, 124, 40); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = `700 40px ${FONT}`; ctx.textBaseline = 'middle'; ctx.textAlign = 'center';
    ctx.fillText(s.text, px / 2, 74);
  };
  s.enabled = false; s.mesh.userData.interact = null;
  s.redraw();
  return s;
}

export function setLabelText(s, text) { s.text = text; s.redraw(); }
