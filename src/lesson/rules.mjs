/** Small pure rules used by the lesson steps (kept separate so they can be tested). */

/** Aircraft rows: the learner can move forward AND back, and the row is always derived from where they stand. */
export class RowTracker {
  constructor(rows, target) { this.rows = rows; this.target = target; this.at = -1; }
  get atEnd() { return this.at >= this.rows.length - 1; }
  get atStart() { return this.at <= -1; }
  forward() { if (this.atEnd) return false; this.at++; return true; }
  back() { if (this.atStart) return false; this.at--; return true; }
  /** Row the learner is beside, or null when they are still at the door. */
  current() { return this.at < 0 ? null : this.rows[this.at]; }
  /** Row index nearest a given distance along the aisle (so joystick travel can not desync the logic). */
  syncFromPosition(z, rowZ) {
    let best = -1, bd = Infinity; this.rows.forEach((_, k) => { const d = Math.abs(z - rowZ(k)); if (d < bd) { bd = d; best = k; } });
    this.at = bd < 1.2 ? best : -1; return this.at;
  }
  isTarget() { return this.at === this.target; }
  hint() {
    if (this.at < 0) return 'Walk forward until you can read a row number.';
    if (this.isTarget()) return 'This is your row.';
    return this.at > this.target ? `This is row ${this.rows[this.at]}. Your row is behind you: use Previous row.` : `This is row ${this.rows[this.at]}. Keep going forward to row ${this.rows[this.target]}.`;
  }
}

/** Every belonging is tracked by identity. "Everything" really means every required item. */
export class Belongings {
  constructor(required) { this.required = new Set(required); this.inTray = new Set(); this.retrieved = new Set(); }
  put(item) { if (this.required.has(item)) { this.inTray.add(item); this.retrieved.delete(item); } }
  remove(item) { this.inTray.delete(item); }
  trayReady() { return [...this.required].filter((i) => i === 'phone' || i === 'pouch').every((i) => this.inTray.has(i)); }
  retrieve(item) { if (this.required.has(item)) this.retrieved.add(item); }
  missing() { return [...this.required].filter((i) => !this.retrieved.has(i)); }
  complete() { return this.missing().length === 0; }
}

/** One physical intent = one action. Ignores a repeat of the same key inside the window. */
export class Debounce {
  constructor(ms = 450, now = () => Date.now()) { this.ms = ms; this.now = now; this.last = new Map(); }
  allow(key) { const t = this.now(), l = this.last.get(key); if (l !== undefined && t - l < this.ms) return false; this.last.set(key, t); return true; }
  reset() { this.last.clear(); }
}

/**
 * Card layout. Distance and text size are independent settings; scaling with distance keeps the angular size of text
 * constant (so moving a card farther does not shrink the words), and text size changes angular size on purpose.
 */
export const CARD = { baseDist: 1.9, baseScale: 2.235, uiScale: 0.5, pxWidth: 760, designPx: 1024, designWidth: 0.58 };   // uiScale: overall size of cards (half of the previous build)
export function cardScale(dist, textK = 1) { return CARD.baseScale * CARD.uiScale * (dist / CARD.baseDist) * textK; }
/** Angular height (degrees) of text that is `px` tall on the card canvas. */
export function textAngularDeg(px, dist, textK = 1) {
  const metres = px * (CARD.designWidth / CARD.designPx) * cardScale(dist, textK);
  return 2 * Math.atan(metres / 2 / dist) * 180 / Math.PI;
}
/** Angular width (degrees) of the whole card (smaller than the old full-width card at the same text size). */
export function cardAngularWidthDeg(dist, textK = 1) {
  const w = CARD.pxWidth * (CARD.designWidth / CARD.designPx) * cardScale(dist, textK);
  return 2 * Math.atan(w / 2 / dist) * 180 / Math.PI;
}
