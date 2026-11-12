import { Surface } from './surface.js';
import { COLORS } from '../config.js';
import { FONT, roundRect, wrapText } from '../util.js';

const ICONS = {
  repeat(ctx, x, y, s) {
    ctx.beginPath(); ctx.arc(x, y, s * 0.42, Math.PI * 0.2, Math.PI * 1.75); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x + s * 0.18, y - s * 0.66); ctx.lineTo(x + s * 0.5, y - s * 0.42); ctx.lineTo(x + s * 0.12, y - s * 0.2); ctx.fillStyle = ctx.strokeStyle; ctx.fill();
  },
  pause(ctx, x, y, s) { ctx.fillRect(x - s * 0.3, y - s * 0.38, s * 0.2, s * 0.76); ctx.fillRect(x + s * 0.1, y - s * 0.38, s * 0.2, s * 0.76); },
  play(ctx, x, y, s) { ctx.beginPath(); ctx.moveTo(x - s * 0.25, y - s * 0.4); ctx.lineTo(x + s * 0.4, y); ctx.lineTo(x - s * 0.25, y + s * 0.4); ctx.closePath(); ctx.fill(); },
  help(ctx, x, y, s) {
    ctx.beginPath(); ctx.arc(x, y, s * 0.46, 0, Math.PI * 2); ctx.fill();
    ctx.save(); ctx.fillStyle = '#fff'; ctx.font = `700 ${s * 0.62}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText('?', x, y + s * 0.03); ctx.restore();
  },
  phone(ctx, x, y, s) { ctx.lineWidth = 5; roundRect(ctx, x - s * 0.24, y - s * 0.42, s * 0.48, s * 0.84, s * 0.1); ctx.stroke(); ctx.fillRect(x - s * 0.07, y + s * 0.28, s * 0.14, s * 0.05); },
  menu(ctx, x, y, s) { for (const dy of [-0.26, 0, 0.26]) ctx.fillRect(x - s * 0.36, y + dy * s - s * 0.05, s * 0.72, s * 0.1); },
};

/**
 * The Saath "glass card": brand, eyebrow, big title, body, primary/secondary buttons and
 * a pill row of persistent controls (Repeat / Pause / Help / Menu).
 * Sized for older eyes: 84px title, 38px body, >= 96px button targets on a 1024px, 0.58m card.
 */
export class Panel extends Surface {
  constructor({ width = 0.58, pxW = 1024 } = {}) {
    super({ width, pxW, pxH: 900 });
    this.state = { eyebrow: '', title: '', body: '', note: '', buttons: [], chips: [], progress: null, tone: 'normal' };
    this.painter = (ctx) => this.paint(ctx);
    this.mesh.renderOrder = 10;
    this.material.depthTest = false; // the guide must never hide behind scenery or furniture
  }

  /** Calm mode: one short line and one button. No eyebrow, no side notes (except gentle corrections), no extra buttons. */
  _calm(p) {
    const o = { ...p };
    if ('eyebrow' in o) o.eyebrow = '';
    if (Array.isArray(o.buttons)) o.buttons = o.buttons.slice(0, 3);
    return o;
  }

  set(partial) {
    if (this.calm && (typeof this.calm !== 'function' || this.calm())) partial = this._calm(partial);
    if (partial.eyebrow && this.eyebrowFix) partial = { ...partial, eyebrow: this.eyebrowFix(partial.eyebrow) };
    Object.assign(this.state, partial);
    this.layoutAndRedraw();
  }

  _noteLines(ctx, text) {
    const max = this.pxW - 64 * 2 - 44, out = []; let line = '';
    for (const w of String(text).split(/\s+/)) {
      const t = line ? line + ' ' + w : w;
      if (ctx.measureText(t).width > max && line) { out.push(line); line = w; } else line = t;
    }
    if (line) out.push(line);
    return out;
  }

  layoutAndRedraw() {
    // First pass measures, second paints (height depends on content).
    const ctx = this.ctx;
    const s = this.state;
    const P = 64, W = this.pxW;
    let y = 64;
    y += 44; // brand
    y += s.eyebrow ? 56 + 26 : 14; // eyebrow gap
    ctx.font = `800 66px ${FONT}`;
    const tEnd = wrapText(ctx, s.title, 0, 0, W - P * 2, 76, false);
    y += tEnd + 54;
    ctx.font = `500 38px ${FONT}`;
    if (s.body) y = y + wrapText(ctx, s.body, 0, 0, W - P * 2, 52, false) + 8;
    if (s.note) { ctx.font = `600 28px ${FONT}`; y += this._noteLines(ctx, s.note).length * 38 + 28; }
    y += 18;
    if (s.tasks?.length) y += 120;
    y += s.buttons.length * (104 + 20);
    if (s.progress) y += 36;
    y += 36;
    this.cardH = Math.max(420, Math.ceil(y));
    const chipsH = s.chips.length ? 24 + 104 : 0;
    this.setPixelHeight(this.cardH + chipsH + 24);
    this.redraw();
  }

  paint(ctx) {
    const s = this.state, W = this.pxW, P = 64;
    this.hot = [];
    ctx.clearRect(0, 0, W, this.pxH);
    // shadow + glass
    ctx.save();
    ctx.shadowColor = 'rgba(10,30,50,0.28)'; ctx.shadowBlur = 38; ctx.shadowOffsetY = 14;
    ctx.fillStyle = 'rgba(250,252,252,0.985)'; // near-opaque glass: scenery must not wash out the text
    roundRect(ctx, 20, 12, W - 40, this.cardH - 24, 64); ctx.fill();
    ctx.restore();
    const g = ctx.createLinearGradient(0, 0, 0, this.cardH);
    g.addColorStop(0, 'rgba(255,255,255,0.55)'); g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g; roundRect(ctx, 20, 12, W - 40, this.cardH - 24, 64); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3; roundRect(ctx, 21.5, 13.5, W - 43, this.cardH - 27, 63); ctx.stroke();

    let y = 64;
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.navy; ctx.font = `800 46px ${FONT}`; ctx.fillText('saath', P, y + 36);
    ctx.fillStyle = COLORS.teal; ctx.fillRect(P, y + 46, 30, 5);
    if (s.eyebrow) {
      y += 44 + 56;
      ctx.fillStyle = COLORS.muted; ctx.font = `600 26px ${FONT}`;
      if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
      ctx.fillText(s.eyebrow.toUpperCase(), P, y);
      if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
      y += 26;
    } else y += 44 + 14;
    ctx.fillStyle = COLORS.navy; ctx.font = `800 66px ${FONT}`;
    y = wrapText(ctx, s.title, P, y + 54, W - P * 2, 76) + 0;
    ctx.fillStyle = COLORS.ink; ctx.font = `500 38px ${FONT}`;
    if (s.body) y = wrapText(ctx, s.body, P, y + 6, W - P * 2, 52) + 2;
    if (s.note) {
      ctx.font = `600 28px ${FONT}`;
      const lines = this._noteLines(ctx, s.note);
      const tw = Math.min(W - P * 2, Math.max(...lines.map((l) => ctx.measureText(l).width)) + 44), th = lines.length * 38 + 14;
      ctx.fillStyle = s.tone === 'warn' ? 'rgba(212,52,79,0.14)' : 'rgba(27,138,134,0.13)';
      roundRect(ctx, P, y - 10, tw, th, 24); ctx.fill();
      ctx.fillStyle = s.tone === 'warn' ? COLORS.warn : COLORS.tealDark;
      lines.forEach((l, i) => ctx.fillText(l, P + 22, y + 22 + i * 38));
      y += lines.length * 38 + 28;
    }
    y += 18;
    if (s.tasks?.length) {
      // Task chips, e.g. Phone · Bag · Collect belongings
      const n = s.tasks.length, gap = 14, w = (W - P * 2 - gap * (n - 1)) / n, h = 100;
      s.tasks.forEach((t, k) => {
        const x = P + k * (w + gap);
        ctx.fillStyle = t.done ? 'rgba(27,138,134,0.2)' : t.active ? 'rgba(56,225,210,0.22)' : 'rgba(15,34,54,0.06)';
        roundRect(ctx, x, y, w, h, 28); ctx.fill();
        if (t.active) { ctx.strokeStyle = COLORS.teal; ctx.lineWidth = 4; roundRect(ctx, x, y, w, h, 28); ctx.stroke(); }
        ctx.fillStyle = t.done ? COLORS.tealDark : COLORS.navy; ctx.font = `700 28px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText((t.done ? '✓ ' : '') + t.label, x + w / 2, y + h / 2 + 2);
      });
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      y += h + 20;
    }
    for (const b of s.buttons) {
      const h = 104, x = P, w = W - P * 2;
      const hover = this.hoverId === b.id, press = this.pressedId === b.id;
      const inset = press ? 5 : 0;
      if (b.kind === 'secondary') {
        ctx.fillStyle = hover ? 'rgba(27,138,134,0.18)' : 'rgba(255,255,255,0.7)';
        ctx.strokeStyle = hover ? COLORS.teal : 'rgba(15,34,54,0.18)'; ctx.lineWidth = hover ? 5 : 3;
        roundRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, 52); ctx.fill(); ctx.stroke();
        ctx.fillStyle = COLORS.navy;
      } else {
        ctx.save();
        ctx.shadowColor = 'rgba(27,138,134,0.45)'; ctx.shadowBlur = hover ? 34 : 18; ctx.shadowOffsetY = 8;
        ctx.fillStyle = hover ? COLORS.tealDark : COLORS.teal;
        roundRect(ctx, x + inset, y + inset, w - inset * 2, h - inset * 2, 52); ctx.fill();
        ctx.restore();
        if (hover) { ctx.strokeStyle = COLORS.tealGlow; ctx.lineWidth = 5; roundRect(ctx, x, y, w, h, 52); ctx.stroke(); }
        ctx.fillStyle = '#fff';
      }
      ctx.font = `700 42px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(b.label, x + w / 2, y + h / 2 + 2);
      ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
      this.hot.push({ id: b.id, x, y, w, h, disabled: b.disabled });
      y += h + 20;
    }
    if (s.progress) {
      const { i, n } = s.progress, r = 9, gap = 30;
      const x0 = W / 2 - ((n - 1) * gap) / 2;
      for (let k = 0; k < n; k++) {
        ctx.fillStyle = k < i ? COLORS.teal : k === i ? COLORS.tealGlow : 'rgba(15,34,54,0.2)';
        ctx.beginPath(); ctx.arc(x0 + k * gap, y + 4, k === i ? r + 2 : r, 0, Math.PI * 2); ctx.fill();
      }
    }
    // chips (pill row beneath the card)
    if (s.chips.length) {
      const cy = this.cardH + 24, ch = 104, n = s.chips.length;
      const pw = W - 120; const x = 60;
      ctx.save();
      ctx.shadowColor = 'rgba(10,30,50,0.25)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 10;
      ctx.fillStyle = COLORS.glass; roundRect(ctx, x, cy, pw, ch, 52); ctx.fill();
      ctx.restore();
      const cw = pw / n;
      s.chips.forEach((c, k) => {
        const hover = this.hoverId === c.id, press = this.pressedId === c.id;
        const cx = x + cw * k + cw / 2, cyc = cy + ch / 2;
        if (hover || press) { ctx.fillStyle = 'rgba(27,138,134,0.2)'; roundRect(ctx, x + cw * k + 8, cy + 8, cw - 16, ch - 16, 44); ctx.fill(); }
        ctx.fillStyle = ctx.strokeStyle = COLORS.navy; ctx.lineWidth = 6; ctx.lineCap = 'round';
        const label = c.label, cs = n >= 5 ? 0.7 : n === 4 ? 0.84 : 1;
        ctx.font = `700 ${34 * cs}px ${FONT}`;
        const lw = ctx.measureText(label).width, iconW = 44 * cs, total = iconW + 14 * cs + lw;
        ICONS[c.icon]?.(ctx, cx - total / 2 + iconW / 2, cyc, 40 * cs);
        ctx.textBaseline = 'middle'; ctx.fillText(label, cx - total / 2 + iconW + 14 * cs, cyc + 2); ctx.textBaseline = 'alphabetic';
        this.hot.push({ id: c.id, x: x + cw * k, y: cy, w: cw, h: ch });
      });
    }
  }
}
