// Small shared helpers: math, canvas drawing, tweens.
export const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => t * t * (3 - 2 * t);
export const damp = (cur, target, rate, dt) => lerp(cur, target, 1 - Math.exp(-rate * dt));
export const wrapAngle = (a) => Math.atan2(Math.sin(a), Math.cos(a));

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Word-wrap text; returns the y after the last line. If draw=false only measures. */
export function wrapText(ctx, text, x, y, maxW, lineH, draw = true) {
  const words = String(text).split(/\s+/);
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (ctx.measureText(test).width > maxW && line) {
      if (draw) ctx.fillText(line, x, y);
      line = w;
      y += lineH;
    } else line = test;
  }
  if (line) {
    if (draw) ctx.fillText(line, x, y);
    y += lineH;
  }
  return y;
}

export const FONT = '"Inter","Segoe UI","Roboto","Helvetica Neue",Arial,sans-serif';

/** Minimal tween runner (no allocation per frame beyond the tween objects). */
export class Tweens {
  constructor() { this.list = []; }
  add({ dur = 0.5, update, done, delay = 0, easing = ease }) {
    const t = { dur, update, done, delay, easing, t: 0 };
    this.list.push(t);
    return t;
  }
  step(dt) {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const tw = this.list[i];
      if (tw.delay > 0) { tw.delay -= dt; continue; }
      tw.t += dt;
      const k = clamp(tw.t / tw.dur, 0, 1);
      tw.update?.(tw.easing(k), k);
      if (k >= 1) { this.list.splice(i, 1); tw.done?.(); }
    }
  }
  clear() { this.list.length = 0; }
}

export function disposeObject(root) {
  root.traverse((o) => {
    if (o.geometry?.userData?.owned) o.geometry.dispose?.(); // model geometry is shared with the cache
    const mats = o.material ? (Array.isArray(o.material) ? o.material : [o.material]) : [];
    for (const m of mats) { if (m.userData?.ownedMap) m.map?.dispose?.(); if (m.userData?.owned) m.dispose?.(); }
  });
}
