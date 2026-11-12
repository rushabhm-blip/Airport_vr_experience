import * as THREE from 'three';
import { buildGrid, pickStageRect } from './grid.js';
import { STAGE, clampScale } from './spaceConfig.js';

const OBSTACLE_LABELS = new Set(['table', 'couch', 'bed', 'storage', 'screen', 'lamp', 'plant', 'other', 'desk', 'chair', 'tv', 'wall art', 'wall_art']);
const WALLISH = new Set(['wall', 'door', 'window', 'door frame', 'window frame', 'door_frame', 'window_frame']);

const rot = (x, z, a) => [x * Math.cos(a) - z * Math.sin(a), x * Math.sin(a) + z * Math.cos(a)];

/**
 * Reads Quest 3 Space Setup data exposed through WebXR (plane-detection, mesh-detection)
 * and decides where a clear practice area is. Everything here is metres in the XR
 * reference space (local-floor, y up).
 */
export class SpaceFit {
  constructor() {
    this.planes = new Set();
    this.meshes = new Set();
    this.result = null;
  }

  /** Call every XR frame while scanning, to collect planes/meshes the system reports. */
  observe(frame) {
    if (frame.detectedPlanes) for (const p of frame.detectedPlanes) this.planes.add(p);
    if (frame.detectedMeshes) for (const m of frame.detectedMeshes) this.meshes.add(m);
    // Drop planes the runtime has removed.
    for (const p of [...this.planes]) if (frame.detectedPlanes && !frame.detectedPlanes.has(p)) this.planes.delete(p);
    for (const m of [...this.meshes]) if (frame.detectedMeshes && !frame.detectedMeshes.has(m)) this.meshes.delete(m);
  }

  get hasData() { return this.planes.size > 0 || this.meshes.size > 0; }

  /** Gather and solve. Must be called inside an XR frame (needs poses). */
  solve(frame, refSpace, head, gaze) {
    const m4 = new THREE.Matrix4(), v = new THREE.Vector3();
    const labels = {};
    let floor = null, floorY = 0;
    const blockedPolys = [], walls = [], blockedPoints = [];
    const worldPoly = (plane) => {
      const pose = frame.getPose(plane.planeSpace, refSpace);
      if (!pose) return null;
      m4.fromArray(pose.transform.matrix);
      return plane.polygon.map((p) => { v.set(p.x, p.y, p.z).applyMatrix4(m4); return [v.x, v.y, v.z]; });
    };
    for (const plane of this.planes) {
      const label = (plane.semanticLabel || '').toLowerCase();
      labels[label || plane.orientation] = (labels[label || plane.orientation] || 0) + 1;
      const poly = worldPoly(plane);
      if (!poly || poly.length < 2) continue;
      const xz = poly.map(([x, , z]) => [x, z]);
      const ys = poly.map((p) => p[1]);
      const avgY = ys.reduce((a, b) => a + b, 0) / ys.length;
      if (label === 'ceiling') continue;
      if (label === 'floor' || (!label && plane.orientation === 'horizontal' && avgY < 0.3 && xz.length >= 3 && (!floor || poly.length > floor.length))) {
        if (!floor || area(xz) > area(floor)) { floor = xz; floorY = avgY; }
      } else if (WALLISH.has(label) || (!label && plane.orientation === 'vertical')) {
        walls.push(xz);
      } else if (OBSTACLE_LABELS.has(label) || (!label && plane.orientation === 'horizontal' && avgY > 0.15 && avgY < 1.8)) {
        blockedPolys.push(xz);
      }
    }
    for (const mesh of this.meshes) {
      const pose = frame.getPose(mesh.meshSpace, refSpace);
      if (!pose) continue;
      const label = (mesh.semanticLabel || '').toLowerCase();
      m4.fromArray(pose.transform.matrix);
      const vs = mesh.vertices;
      const step = vs.length > 9000 ? 6 : 3; // subsample dense meshes
      for (let i = 0; i + 2 < vs.length; i += step) {
        v.set(vs[i], vs[i + 1], vs[i + 2]).applyMatrix4(m4);
        if (v.y > floorY + 0.12 && v.y < floorY + 1.8 && label !== 'floor' && label !== 'ceiling') blockedPoints.push([v.x, v.z]);
      }
    }

    // Align the grid to the room (longest floor edge) so slanted rooms still give a clean rectangle.
    let yaw = 0;
    if (floor) {
      let best = 0;
      for (let i = 0, j = floor.length - 1; i < floor.length; j = i++) {
        const dx = floor[i][0] - floor[j][0], dz = floor[i][1] - floor[j][1], l = Math.hypot(dx, dz);
        if (l > best) { best = l; yaw = Math.atan2(dz, dx); }
      }
      yaw = ((yaw % (Math.PI / 2)) + Math.PI / 2) % (Math.PI / 2);
      if (yaw > Math.PI / 4) yaw -= Math.PI / 2;
    }
    const toG = ([x, z]) => rot(x, z, -yaw);
    const gFloor = floor ? floor.map(toG) : null;
    const gBlocked = blockedPolys.map((p) => p.map(toG));
    const gWalls = walls.map((p) => p.map(toG));
    const gPoints = blockedPoints.map(toG);
    const hg = toG([head.x, head.z]);
    let bounds;
    if (gFloor) {
      const xs = gFloor.map((p) => p[0]), zs = gFloor.map((p) => p[1]);
      bounds = { minX: Math.min(...xs) - 0.1, maxX: Math.max(...xs) + 0.1, minZ: Math.min(...zs) - 0.1, maxZ: Math.max(...zs) + 0.1 };
      // keep the grid under ~100x100 cells
      const span = Math.max(bounds.maxX - bounds.minX, bounds.maxZ - bounds.minZ);
      if (span > 10) bounds = { minX: hg[0] - 5, maxX: hg[0] + 5, minZ: hg[1] - 5, maxZ: hg[1] + 5 };
    } else bounds = { minX: hg[0] - 3.5, maxX: hg[0] + 3.5, minZ: hg[1] - 3.5, maxZ: hg[1] + 3.5 };

    const grid = buildGrid({ floor: gFloor, blockedPolys: gBlocked, walls: gWalls, blockedPoints: gPoints, bounds, cell: 0.1, margin: 0.12, keepClear: { x: hg[0], z: hg[1], r: 0.5 } });
    const rect = pickStageRect(grid, { user: { x: hg[0], z: hg[1] }, ideal: STAGE.width });
    this.result = rect ? this.layoutFromRect(rect, yaw, head, gaze) : null;
    if (this.result) Object.assign(this.result, { grid, gridYaw: yaw, floorY, labels, counts: { planes: this.planes.size, meshes: this.meshes.size, blocked: blockedPolys.length, walls: walls.length, points: blockedPoints.length }, source: 'scan' });
    else this.result = { none: true, grid, gridYaw: yaw, floorY, labels, counts: { planes: this.planes.size, meshes: this.meshes.size }, source: 'scan' };
    return this.result;
  }

  /**
   * Convert a free rectangle (in grid frame) into a stage placement: where the user sits,
   * which way the practice scenery faces and how much room there is in front.
   */
  layoutFromRect(rect, gridYaw, head, gaze) {
    const hg = rot(head.x, head.z, -gridYaw);
    const gg = rot(gaze.x, gaze.z, -gridYaw);
    const gl = Math.hypot(gg[0], gg[1]) || 1;
    const cands = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    let best = null;
    for (const f of cands) {
      const along = (p) => p[0] * f[0] + p[1] * f[1];
      const right = [-f[1], f[0]];
      const lat = (p) => p[0] * right[0] + p[1] * right[1];
      const corners = [[rect.x0, rect.z0], [rect.x0 + rect.w, rect.z0], [rect.x0, rect.z0 + rect.d], [rect.x0 + rect.w, rect.z0 + rect.d]];
      const us = corners.map(along), ls = corners.map(lat);
      const uMin = Math.min(...us), uMax = Math.max(...us), lMin = Math.min(...ls), lMax = Math.max(...ls);
      const stationU = Math.max(uMin, Math.min(uMax - 0.9, along(hg)));
      const depth = uMax - stationU, width = lMax - lMin;
      const facing = (gg[0] * f[0] + gg[1] * f[1]) / gl;
      const score = facing * 2 + Math.min(depth, 3) / 3 + Math.min(width, 3) / 3;
      if (depth < 0.9 || width < 0.9) continue;
      if (!best || score > best.score) best = { f, right, stationU, lc: (lMin + lMax) / 2, depth, width, score };
    }
    if (!best) return null;
    const station = [best.f[0] * best.stationU + best.right[0] * best.lc, best.f[1] * best.stationU + best.right[1] * best.lc];
    const [wx, wz] = rot(station[0], station[1], gridYaw);
    const [fx, fz] = rot(best.f[0], best.f[1], gridYaw);
    const corners = [[rect.x0, rect.z0], [rect.x0 + rect.w, rect.z0], [rect.x0 + rect.w, rect.z0 + rect.d], [rect.x0, rect.z0 + rect.d]].map(([x, z]) => rot(x, z, gridYaw));
    return {
      origin: { x: wx, z: wz },
      yaw: Math.atan2(-fx, -fz),
      depth: best.depth,
      width: best.width,
      scale: clampScale(Math.min(best.depth / STAGE.depth, best.width / STAGE.width)),
      quality: Math.min(best.depth / STAGE.depth, best.width / STAGE.width) >= 1 ? 'great' : Math.min(best.depth / STAGE.depth, best.width / STAGE.width) >= 0.7 ? 'compact' : 'tight',
      corners,
    };
  }
}

function area(poly) {
  let a = 0;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) a += poly[j][0] * poly[i][1] - poly[i][0] * poly[j][1];
  return Math.abs(a / 2);
}

/** Fit used when no room data exists (desktop, or Space Setup not done): a default box in front of the user. */
export function defaultFit(head, gaze, size = { width: 2.2, depth: 2.4 }) {
  const len = Math.hypot(gaze.x, gaze.z) || 1;
  const fx = gaze.x / len, fz = gaze.z / len;
  return {
    origin: { x: head.x, z: head.z },
    yaw: Math.atan2(-fx, -fz),
    depth: size.depth,
    width: size.width,
    scale: clampScale(Math.min(size.depth / STAGE.depth, size.width / STAGE.width)),
    quality: 'default',
    corners: cornersFor({ x: head.x, z: head.z }, Math.atan2(-fx, -fz), size.width, size.depth),
    source: 'default',
  };
}

/** Manual fit from two floor points the user marked (near-left / far-right in their view). */
export function fitFromCorners(a, b, head) {
  const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), z0 = Math.min(a.z, b.z), z1 = Math.max(a.z, b.z);
  const gaze = { x: (x0 + x1) / 2 - head.x, z: (z0 + z1) / 2 - head.z };
  const s = new SpaceFit();
  const r = s.layoutFromRect({ x0, z0, w: x1 - x0, d: z1 - z0 }, 0, head, gaze);
  if (r) r.source = 'manual';
  return r;
}

export function cornersFor(origin, yaw, width, depth) {
  const c = Math.cos(yaw), s = Math.sin(yaw);
  const pts = [[-width / 2, 0.3], [width / 2, 0.3], [width / 2, -depth], [-width / 2, -depth]];
  return pts.map(([x, z]) => [origin.x + x * c + z * s, origin.z - x * s + z * c]);
}
