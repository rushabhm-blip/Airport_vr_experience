import * as THREE from 'three';
import { Surface } from '../ui/surface.js';

/** Real photographs / textures made for Saath (assets/images). Missing files are tolerated: the app falls back to its drawn look. */
const FILES = [
  'tex-floor.jpg', 'tex-wall.jpg', 'tex-ceiling.jpg', 'tex-carpet.jpg', 'tex-seat.jpg', 'tex-counter.jpg',
  'view-tarmac-day.jpg', 'view-tarmac-golden.jpg', 'view-plane-window.jpg', 'view-kerb.jpg', 'view-hall-wide.jpg',
  'logo-practice-air.png', 'face-1.jpg', 'face-2.jpg', 'face-3.jpg', 'face-4.jpg',
  'staff-checkin.png', 'staff-security.png', 'staff-gate.png', 'staff-crew.jpg', 'staff-guard.png',
  'cab-side.png', 'person-driver.png', 'view-cab-window.jpg', 'kerb-golden.jpg', 'xray-bag-lying.jpg',
  'home-street.jpg', 'side-left.jpg', 'side-right.jpg', 'cab-side-closed.jpg', 'cab-side-door-open.jpg', 'cab-rear-boot.jpg', 'security-hall.jpg', 'gate-lounge.jpg',
  'aircraft-window-seat.jpg', 'sky-clouds.jpg', 'checkin-hall.jpg', 'aircraft-sidewall-texture.jpg', 'aircraft-ceiling-texture.jpg', 'overhead-bin-texture.jpg', 'checkin-counter-texture.jpg',
  'home-living-room-v2.jpg', 'hall-360-v2.jpg', 'gate-360-v2.jpg', 'home-street-360-v2.jpg', 'airport-kerb-360-v2.jpg', 'brushed-steel.jpg', 'conveyor-rubber.jpg', 'security-tray-plastic.jpg', 'white-counter-laminate.jpg', 'airport-floor-tile.jpg', 'blue-grey-carpet.jpg',
  'item-powerbank.jpg', 'item-tablet.jpg', 'item-pouch.jpg', 'item-charger.jpg', 'item-clothes.jpg', 'item-bottle.jpg',
];

export const IMG = {};            // name (no extension) -> HTMLImageElement
// the 360-degree panoramas are loaded as ...-v2 files; the rest of the app keeps using the short names
const PANO_ALIAS = { 'home-living-room': 'home-living-room-v2', 'hall-360': 'hall-360-v2', 'gate-360': 'gate-360-v2', 'home-street-360': 'home-street-360-v2', 'airport-kerb-360': 'airport-kerb-360-v2' };
const cache = new Map();

export async function loadImages(base = './assets/images/', onProgress) {
  let done = 0;
  await Promise.all(FILES.map((f) => new Promise((res) => {
    const im = new Image(); im.decoding = 'async';
    im.onload = () => { IMG[f.replace(/\.\w+$/, '')] = im; onProgress?.(++done, FILES.length); res(); };
    im.onerror = () => { onProgress?.(++done, FILES.length); res(); };
    im.src = base + f;
  })));
  for (const [a, b] of Object.entries(PANO_ALIAS)) if (IMG[b]) IMG[a] = IMG[b];
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

/**
 * A 360-degree panorama texture, tidied for use inside a sphere: the two ends are colour-matched so there is no step at the back seam,
 * and the pinched rows at the very top and bottom (the poles) are softened into an even colour.
 */
export function panoTexture(name) {
  const im = IMG[name]; if (!im) return null;
  const k = 'pano:' + name; if (cache.has(k)) return cache.get(k);
  const W = im.width, H = im.height, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, W, H), p = d.data, B = Math.round(W * 0.035), P = Math.round(H * 0.02);
  for (let y = 0; y < H; y++) {
    const l = y * W * 4, r = (y * W + W - 1) * 4;
    for (let ch = 0; ch < 3; ch++) {
      const m = (p[l + ch] + p[r + ch]) / 2, dl = m - p[l + ch], dr = m - p[r + ch];
      for (let x = 0; x < B; x++) { const f = 1 - x / B, s = f * f * (3 - 2 * f); p[l + x * 4 + ch] += dl * s; p[r - x * 4 + ch] += dr * s; }
    }
  }
  for (const top of [true, false]) {
    for (let j = 0; j < P; j++) {
      const y = top ? j : H - 1 - j, t = 1 - j / P, row = y * W * 4;
      let a = 0, b2 = 0, c2 = 0; for (let x = 0; x < W; x++) { a += p[row + x * 4]; b2 += p[row + x * 4 + 1]; c2 += p[row + x * 4 + 2]; }
      a /= W; b2 /= W; c2 /= W; const w = t * t * 0.85;
      for (let x = 0; x < W; x++) { p[row + x * 4] += (a - p[row + x * 4]) * w; p[row + x * 4 + 1] += (b2 - p[row + x * 4 + 1]) * w; p[row + x * 4 + 2] += (c2 - p[row + x * 4 + 2]) * w; }
    }
  }
  g.putImageData(d, 0, 0);
  const t = finish(new THREE.CanvasTexture(c)); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.userData.aspect = W / H;
  cache.set(k, t); return t;
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

/**
 * A photo shot on a flat key colour (green or magenta): the key becomes transparent, the green fringe is removed, and the
 * result is cropped to the object. userData.aspect is the cropped aspect ratio.
 */
export function keyedCrop(name, key = 'green') {
  const im = IMG[name]; if (!im) return null;
  const k = 'key:' + name + key;
  if (cache.has(k)) return cache.get(k);
  const W = im.width, H = im.height, c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, W, H), p = d.data; let x0 = W, y0 = H, x1 = 0, y1 = 0;
  for (let i = 0; i < p.length; i += 4) {
    const r = p[i], gr = p[i + 1], b = p[i + 2];
    const over = key === 'green' ? gr - Math.max(r, b) : Math.min(r, b) - gr;       // how strongly this pixel is the key colour
    if (over > 70) p[i + 3] = 0;
    else if (over > 25) { p[i + 3] = Math.round(255 * (70 - over) / 45); if (key === 'green') p[i + 1] = Math.max(r, b); else { p[i] = p[i + 2] = Math.max(gr, 0); } }
    else if (over > 8 && key === 'green') p[i + 1] = Math.max(r, b) + 4;
    if (p[i + 3] > 20) { const px = (i / 4) % W, py = ((i / 4) / W) | 0; if (px < x0) x0 = px; if (px > x1) x1 = px; if (py < y0) y0 = py; if (py > y1) y1 = py; }
  }
  g.putImageData(d, 0, 0);
  const w = Math.max(1, x1 - x0 + 1), h = Math.max(1, y1 - y0 + 1), o = document.createElement('canvas'); o.width = w; o.height = h;
  o.getContext('2d').drawImage(c, x0, y0, w, h, 0, 0, w, h);
  const t = finish(new THREE.CanvasTexture(o)); t.wrapS = t.wrapT = THREE.ClampToEdgeWrapping; t.userData.aspect = w / h;
  cache.set(k, t); return t;
}

export function cutoutTexture(name) {
  const im = IMG[name]; if (!im) return null;
  const k = 'cut:' + name;
  if (cache.has(k)) return cache.get(k);
  const c = document.createElement('canvas'); c.width = im.width; c.height = im.height;
  const g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(im, 0, 0);
  const d = g.getImageData(0, 0, c.width, c.height), p = d.data;
  if (p[0] > 235 && p[1] < 40 && p[2] > 235) {                                   // photographed on flat magenta: key it out
    for (let j = 0; j < p.length; j += 4) { const over = Math.min(p[j], p[j + 2]) - p[j + 1]; if (over > 90) p[j + 3] = 0; else if (over > 40) { p[j + 3] = Math.round(255 * (90 - over) / 50); p[j] = p[j + 2] = p[j + 1]; } }
  } else if (isWhiteBacked(p, c.width)) keyWhite(p, c.width, c.height);
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
