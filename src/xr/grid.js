// Pure floor-occupancy maths (no THREE, no XR) so it can be unit-tested in Node.
// All coordinates are floor-plane metres: x, z. Polygons are arrays of [x, z].

export function pointInPoly(x, z, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i], [xj, zj] = poly[j];
    if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

function distToSegment(px, pz, a, b) {
  const dx = b[0] - a[0], dz = b[1] - a[1];
  const l2 = dx * dx + dz * dz;
  let t = l2 ? ((px - a[0]) * dx + (pz - a[1]) * dz) / l2 : 0;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
}

export function distToPoly(x, z, poly) {
  let d = Infinity;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) d = Math.min(d, distToSegment(x, z, poly[j], poly[i]));
  return d;
}

/**
 * Build a free/blocked grid.
 * @param {object} o
 * @param {number[][]|null} o.floor      floor polygon (null = unknown: everything inside bounds is free)
 * @param {number[][][]} o.blockedPolys  footprints of furniture / tables etc.
 * @param {number[][]} o.blockedPoints   sample points from the scene mesh (already height-filtered)
 * @param {number[][][]} o.walls         wall footprints (polygons or 2-point segments)
 * @param {object} o.bounds              {minX,maxX,minZ,maxZ}
 * @param {number} o.cell                cell size (m)
 * @param {number} o.margin              clearance added around obstacles (m)
 * @param {{x:number,z:number,r:number}} o.keepClear  area forced free (user's seat)
 */
export function buildGrid({ floor = null, blockedPolys = [], blockedPoints = [], walls = [], bounds, cell = 0.1, margin = 0.12, keepClear = null }) {
  const nx = Math.max(1, Math.ceil((bounds.maxX - bounds.minX) / cell));
  const nz = Math.max(1, Math.ceil((bounds.maxZ - bounds.minZ) / cell));
  const free = new Uint8Array(nx * nz).fill(1);
  const cx = (i) => bounds.minX + (i + 0.5) * cell;
  const cz = (j) => bounds.minZ + (j + 0.5) * cell;

  if (floor) {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      // Cell must be inside the floor and not hugging its edge (the edge is a wall).
      const x = cx(i), z = cz(j);
      if (!pointInPoly(x, z, floor) || distToPoly(x, z, floor) < 0.15) free[j * nx + i] = 0;
    }
  }
  for (const poly of [...blockedPolys, ...walls]) {
    if (poly.length < 2) continue;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    for (const [x, z] of poly) { minX = Math.min(minX, x); maxX = Math.max(maxX, x); minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z); }
    const i0 = Math.max(0, Math.floor((minX - margin - bounds.minX) / cell)), i1 = Math.min(nx - 1, Math.ceil((maxX + margin - bounds.minX) / cell));
    const j0 = Math.max(0, Math.floor((minZ - margin - bounds.minZ) / cell)), j1 = Math.min(nz - 1, Math.ceil((maxZ + margin - bounds.minZ) / cell));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const x = cx(i), z = cz(j);
      if ((poly.length >= 3 && pointInPoly(x, z, poly)) || distToPoly(x, z, poly) <= margin) free[j * nx + i] = 0;
    }
  }
  const mc = Math.ceil(margin / cell);
  for (const [x, z] of blockedPoints) {
    const i = Math.floor((x - bounds.minX) / cell), j = Math.floor((z - bounds.minZ) / cell);
    for (let dj = -mc; dj <= mc; dj++) for (let di = -mc; di <= mc; di++) {
      const ii = i + di, jj = j + dj;
      if (ii >= 0 && jj >= 0 && ii < nx && jj < nz) free[jj * nx + ii] = 0;
    }
  }
  if (keepClear) {
    for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
      if (Math.hypot(cx(i) - keepClear.x, cz(j) - keepClear.z) <= keepClear.r) free[j * nx + i] = 1;
    }
  }
  return { nx, nz, cell, minX: bounds.minX, minZ: bounds.minZ, free };
}

/** Enumerate maximal all-free rectangles (histogram method). Returns [{x0,z0,w,d}] in metres. */
export function maximalRects(g) {
  const { nx, nz, cell, free } = g;
  const h = new Int32Array(nx);
  const out = [];
  for (let j = 0; j < nz; j++) {
    for (let i = 0; i < nx; i++) h[i] = free[j * nx + i] ? h[i] + 1 : 0;
    const stack = [];
    for (let i = 0; i <= nx; i++) {
      const cur = i === nx ? 0 : h[i];
      let start = i;
      while (stack.length && stack[stack.length - 1].h >= cur) {
        const top = stack.pop();
        if (top.h > 0) {
          const w = i - top.start, d = top.h;
          out.push({ x0: g.minX + top.start * cell, z0: g.minZ + (j - d + 1) * cell, w: w * cell, d: d * cell });
        }
        start = top.start;
      }
      stack.push({ h: cur, start });
    }
  }
  return out;
}

/**
 * Pick the stage rectangle: big enough to be useful, near the user, not absurdly long and thin.
 * Returns {x0,z0,w,d,score} or null.
 */
export function pickStageRect(g, { user = { x: 0, z: 0 }, ideal = 2.4, minSide = 0.9, maxAspect = 2.2 } = {}) {
  let best = null;
  for (const r of maximalRects(g)) {
    if (Math.min(r.w, r.d) < minSide) continue;
    // Trim an over-long side so a corridor does not beat a squarer room.
    const short = Math.min(r.w, r.d);
    let w = r.w, d = r.d, x0 = r.x0, z0 = r.z0;
    if (w > short * maxAspect) { const nw = short * maxAspect; x0 += clampTo(user.x - nw / 2 - x0, 0, w - nw); w = nw; }
    if (d > short * maxAspect) { const nd = short * maxAspect; z0 += clampTo(user.z - nd / 2 - z0, 0, d - nd); d = nd; }
    const area = Math.min(w, ideal * 1.4) * Math.min(d, ideal * 1.4);
    const cxm = x0 + w / 2, czm = z0 + d / 2;
    const dx = Math.max(x0 - user.x, 0, user.x - (x0 + w)), dz = Math.max(z0 - user.z, 0, user.z - (z0 + d));
    const dist = Math.hypot(dx, dz);
    const score = area - 1.4 * dist - 0.05 * Math.hypot(cxm - user.x, czm - user.z);
    if (!best || score > best.score) best = { x0, z0, w, d, score, area: w * d };
  }
  return best;
}

function clampTo(v, a, b) { return Math.max(a, Math.min(b, v)); }

/** Debug helper: ASCII picture of the grid and rectangle. */
export function gridToAscii(g, rect = null, user = null) {
  let s = '';
  for (let j = 0; j < g.nz; j++) {
    for (let i = 0; i < g.nx; i++) {
      const x = g.minX + (i + 0.5) * g.cell, z = g.minZ + (j + 0.5) * g.cell;
      let c = g.free[j * g.nx + i] ? '.' : '#';
      if (rect && x >= rect.x0 && x <= rect.x0 + rect.w && z >= rect.z0 && z <= rect.z0 + rect.d) c = c === '#' ? 'X' : 'o';
      if (user && Math.hypot(x - user.x, z - user.z) < g.cell * 0.7) c = 'U';
      s += c;
    }
    s += '\n';
  }
  return s;
}
