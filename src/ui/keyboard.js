import { Surface } from './surface.js';
import { COLORS } from '../config.js';
import { FONT, roundRect } from '../util.js';

/**
 * Big on-screen keyboard for typing a name inside the headset (point + pinch/trigger, or poke).
 * Letters only; the system keyboard is unavailable during an immersive session.
 */
export class KeyboardCard extends Surface {
  constructor() {
    super({ width: 0.92, pxW: 1500, pxH: 880 });
    this.text = ''; this.title = 'What should we call you?'; this.max = 24;
    this.onDone = null; this.onCancel = null;
    this.painter = (ctx) => this.paint(ctx);
    this.mesh.renderOrder = 12; this.material.depthTest = false;
    this.onSelect = (id) => this.press(id);
    this.redraw();
  }
  open(initial = '', title = this.title) { this.text = initial; this.title = title; this.redraw(); }
  press(id) {
    if (id === 'back') this.text = this.text.slice(0, -1);
    else if (id === 'clear') this.text = '';
    else if (id === 'space') { if (this.text && !this.text.endsWith(' ')) this.text += ' '; }
    else if (id === 'done') return this.onDone?.(this.text.trim());
    else if (id === 'cancel') return this.onCancel?.();
    else if (id.startsWith('k:') && this.text.length < this.max) this.text += id.slice(2);
    this.redraw();
  }
  paint(ctx) {
    const W = this.pxW, H = this.pxH;
    this.hot = [];
    ctx.save(); ctx.shadowColor = 'rgba(10,30,50,0.3)'; ctx.shadowBlur = 40; ctx.shadowOffsetY = 14;
    ctx.fillStyle = 'rgba(250,252,252,0.985)'; roundRect(ctx, 24, 16, W - 48, H - 40, 56); ctx.fill(); ctx.restore();
    ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.navy; ctx.font = `800 64px ${FONT}`; ctx.fillText(this.title, 70, 112);
    ctx.fillStyle = COLORS.muted; ctx.font = `500 32px ${FONT}`; ctx.fillText('Used on your boarding pass and documents. Practice only; stays on this device.', 70, 160);
    // text field
    ctx.fillStyle = '#eef3f3'; roundRect(ctx, 70, 190, W - 140, 110, 28); ctx.fill();
    ctx.strokeStyle = COLORS.teal; ctx.lineWidth = 4; roundRect(ctx, 70, 190, W - 140, 110, 28); ctx.stroke();
    ctx.fillStyle = COLORS.navy; ctx.font = `700 64px ${FONT}`;
    const caret = Math.floor(performance.now() / 500) % 2 ? '│' : ' ';
    ctx.fillText((this.text || '').toUpperCase() + caret, 100, 272);
    const rows = ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM'];
    const kw = 112, kh = 100, gap = 14;
    rows.forEach((r, ri) => {
      const total = r.length * kw + (r.length - 1) * gap + (ri === 2 ? kw * 1.6 + gap : 0);
      let x = (W - total) / 2; const y = 330 + ri * (kh + gap);
      for (const ch of r) { this.key(ctx, x, y, kw, kh, ch, 'k:' + ch); x += kw + gap; }
      if (ri === 2) this.key(ctx, x, y, kw * 1.6, kh, '⌫', 'back');
    });
    const y = 330 + 3 * (kh + gap);
    this.key(ctx, 70, y, 220, kh, 'Clear', 'clear', 'ghost');
    this.key(ctx, 310, y, 560, kh, 'space', 'space');
    this.key(ctx, 890, y, 240, kh, 'Cancel', 'cancel', 'ghost');
    this.key(ctx, 1150, y, W - 70 - 1150, kh, 'Done', 'done', 'primary');
  }
  key(ctx, x, y, w, h, label, id, kind = 'key') {
    const hover = this.hoverId === id, press = this.pressedId === id;
    const pad = press ? 4 : 0;
    ctx.fillStyle = kind === 'primary' ? (hover ? COLORS.tealDark : COLORS.teal) : hover ? 'rgba(27,138,134,0.2)' : kind === 'ghost' ? 'rgba(15,34,54,0.06)' : '#fff';
    roundRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, 24); ctx.fill();
    ctx.strokeStyle = hover ? COLORS.teal : 'rgba(15,34,54,0.18)'; ctx.lineWidth = hover ? 5 : 3; roundRect(ctx, x + pad, y + pad, w - pad * 2, h - pad * 2, 24); ctx.stroke();
    ctx.fillStyle = kind === 'primary' ? '#fff' : COLORS.navy; ctx.font = `700 ${label.length > 2 ? 40 : 54}px ${FONT}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(label, x + w / 2, y + h / 2 + 3); ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
    this.hot.push({ id, x, y, w, h });
  }
  tick() { this.redraw(); } // caret blink
}
