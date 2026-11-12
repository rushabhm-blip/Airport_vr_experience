import * as THREE from 'three';
import { Surface } from '../ui/surface.js';

/** Real photographs / textures made for Saath (assets/images). Missing files are tolerated: the app falls back to its drawn look. */
const FILES = [
  'tex-floor.jpg', 'tex-wall.jpg', 'tex-ceiling.jpg', 'tex-carpet.jpg', 'tex-seat.jpg', 'tex-counter.jpg',
  'view-tarmac-day.jpg', 'view-tarmac-golden.jpg', 'view-plane-window.jpg', 'view-kerb.jpg', 'view-hall-wide.jpg',
  'logo-practice-air.png', 'face-1.jpg', 'face-2.jpg', 'face-3.jpg', 'face-4.jpg',
  'staff-checkin.png', 'staff-security.png', 'staff-gate.png', 'staff-crew.png', 'staff-guard.png',
  'cab-side.png', 'person-driver.png', 'view-cab-window.jpg', 'kerb-golden.jpg', 'xray-bag-lying.jpg',
  'item-powerbank.jpg', 'item-tablet.jpg', 'item-pouch.jpg', 'item-charger.jpg', 'item-clothes.jpg', 'item-bottle.jpg',
];

export const IMG = {};            // name (no extension) -> HTMLImageElement
const cache = new Map();

export async function loadImages(base = './assets/images/', onProgress) {
  let done = 0;
  await Promise.all(FILES.map((f) => new Promise((res) => {
    const im = new Image(); im.decoding = 'async';
    im.onload = () => { IMG[f.replace(/\.\w+$/, '')] = im; onProgress?.(++done, FILES.length); res(); };
    im.onerror = () => { onProgress?.(++done, FILES.length); res(); };
    im.src = base + f;
  })));
}

const finish = (t, { repeat = null, srgb = true } = {}) => {
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = Surface.maxAnisotropy; t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (repeat) t.repeat.set(...repeat);
  t.needsUpdate = true; return t;
};

/** A repeating tile texture (shared). */
export function tileTexture(name) {
  if (!IMG[name]) return null;
  const k = 'tile:' + name;
  if (!cache.has(k)) cache.set(k, finish(new THREE.Texture(IMG[name])));
  return cache.get(k);
}

/** Crop a region of a photo into a canvas texture. `mirror` appends a mirrored copy (a seamless, twice-as-wide backdrop). */
export function cropTexture(name, [x, y, w, h], { mirror = false } = {}) {
  const im = IMG[name]; if (!im) return null;
  const k = `crop:${name}:${x},${y},${w},${h},${mirror}`;
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas'); c.width = w * (mirror ? 2 : 1); c.height = h;
  const g = c.getContext('2d'); g.drawImage(im, x, y, w, h, 0, 0, w, h);
  if (mirror) { g.save(); g.translate(w * 2, 0); g.scale(-1, 1); g.drawImage(im, x, y, w, h, 0, 0, w, h); g.restore(); }
  const t = finish(new THREE.CanvasTexture(c)); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping;
  cache.set(k, t); t.userData.aspect = c.width / c.height; return t;
}

/** Whole photo as a clamped texture. */
export function photoTexture(name) {
  const im = IMG[name]; if (!im) return null;
  const k = 'photo:' + name;
  if (!cache.has(k)) { const t = finish(new THREE.Texture(im)); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.userData.aspect = im.width / im.height; cache.set(k, t); }
  return cache.get(k);
}

/**
 * Staff photo cut-out with the soft dark halo removed: alpha is pushed to a hard-ish edge and the
 * colours of semi-transparent pixels are discarded, so the figure sits cleanly against any background.
 */
/** Remove a plain white studio background: flood-fill from the border through near-white pixels (inside windows and shirts stays). */
function keyWhite(p, W, H, thr = 243) {
  const bg = new Uint8Array(W * H), stack = [];
  const near = (i) => p[i * 4 + 3] > 200 && p[i * 4] >= thr && p[i * 4 + 1] >= thr && p[i * 4 + 2] >= thr;
  const push = (x, y) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = y * W + x; if (!bg[i] && near(i)) { bg[i] = 1; stack.push(i); } };
  for (let x = 0; x < W; x++) { push(x, 0); push(x, H - 1); }
  for (let y = 0; y < H; y++) { push(0, y); push(W - 1, y); }
  while (stack.length) { const i = stack.pop(), x = i % W, y = (i / W) | 0; push(x + 1, y); push(x - 1, y); push(x, y + 1); push(x, y - 1); }
  // soften the edge: light pixels touching the background become transparent too (no white halo)
  const edge = [];
  for (let y = 1; y < H - 1; y++) for (let x = 1; x < W - 1; x++) { const i = y * W + x; if (bg[i]) continue; if ((bg[i - 1] || bg[i + 1] || bg[i - W] || bg[i + W]) && Math.min(p[i * 4], p[i * 4 + 1], p[i * 4 + 2]) > 205) edge.push(i); }
  for (let i = 0; i < W * H; i++) if (bg[i]) p[i * 4 + 3] = 0;
  for (const i of edge) p[i * 4 + 3] = 0;
}
const isWhiteBacked = (p, W) => p[3] === 255 && p[0] > 245 && p[1] > 245 && p[2] > 245 && p[(W - 1) * 4 + 3] === 255;

/** A cropped region of a photo with its white studio background removed (cars, people on plain white). */
export function cutoutCrop(name, [x, y, w, h]) {
  const im = IMG[name]; if (!im) return null;
  const k = `cutcrop:${name}:${x},${y},${w},${h}`;
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, x, y, w, h, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h); keyWhite(d.data, w, h); g.putImageData(d, 0, 0);
  const t = finish(new THREE.CanvasTexture(c)); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.userData.aspect = w / h;
  cache.set(k, t); return t;
}

export function cutoutTexture(name) {
  const im = IMG[name]; if (!im) return null;
  const k = 'cut:' + name;
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  if (isWhiteBacked(p, c.width)) keyWhite(p, c.width, c.height);
  for (let i = 0; i < p.length; i += 4) {
    const a = p[i + 3] / 255;
    const a2 = Math.min(1, Math.max(0, (a - 0.62) / 0.3));       // halo (alpha < ~0.6) disappears, body stays solid
    p[i + 3] = Math.round(a2 * 255);
  }
  g.putImageData(d, 0, 0);
  const t = finish(new THREE.CanvasTexture(c)); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.userData.aspect = c.width / c.height;
  cache.set(k, t); return t;
}

/** Draw a photo into a canvas rect, "cover" fitted. */
export function drawCover(ctx, im, x, y, w, h, zoom = 1) {
  if (!im) return false;
  const s = Math.max(w / im.width, h / im.height) * zoom, dw = im.width * s, dh = im.height * s;
  ctx.drawImage(im, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh); return true;
}

/** Box-projected UVs (metres / tile) for meshes the pack exported without a usable UV map. */
export function boxUV(geo, tile) {
  if (geo.userData.boxUV === tile) return;
  const pos = geo.attributes.position; if (!geo.attributes.normal) geo.computeVertexNormals();
  const nor = geo.attributes.normal, uv = new Float32Array(pos.count * 2);
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), ax = Math.abs(nor.getX(i)), ay = Math.abs(nor.getY(i)), az = Math.abs(nor.getZ(i));
    let u, v; if (ay >= ax && ay >= az) { u = x; v = z; } else if (ax >= az) { u = z; v = y; } else { u = x; v = y; }
    uv[i * 2] = u / tile; uv[i * 2 + 1] = v / tile;
  }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.userData.boxUV = tile;
}

/** Planar UVs normalised to the mesh's own bounding box (for window panes, signs...). */
export function planarUV(geo, axes = ['z', 'y']) {
  if (geo.userData.planarUV) return;
  geo.computeBoundingBox(); const b = geo.boundingBox, pos = geo.attributes.position, uv = new Float32Array(pos.count * 2);
  const get = (i, a) => (a === 'x' ? pos.getX(i) : a === 'y' ? pos.getY(i) : pos.getZ(i));
  const lo = (a) => b.min[a], sz = (a) => Math.max(1e-6, b.max[a] - b.min[a]);
  for (let i = 0; i < pos.count; i++) { uv[i * 2] = (get(i, axes[0]) - lo(axes[0])) / sz(axes[0]); uv[i * 2 + 1] = (get(i, axes[1]) - lo(axes[1])) / sz(axes[1]); }
  geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); geo.userData.planarUV = true;
}
