import { TILE_SIZE } from './config.js';
import { worldState } from './world.js';

let HBX = 1, HBY = 4, HBW = 6, HBH = 4;
export function setHitbox(x, y, w, h) { HBX = x; HBY = y; HBW = w; HBH = h; }

export const spatialHash = (() => {
  const CELL = 32;
  let cells = new Map();
  const key = (cx, cy) => (cx & 0xFFFF) << 16 | (cy & 0xFFFF);
  return {
    clear() { cells.clear(); },
    insert(id, x, y, w = TILE_SIZE, h = TILE_SIZE) {
      for (let cy = Math.floor(y / CELL); cy <= Math.floor((y + h - 1) / CELL); cy++)
        for (let cx = Math.floor(x / CELL); cx <= Math.floor((x + w - 1) / CELL); cx++) {
          const k = key(cx, cy);
          if (!cells.has(k)) cells.set(k, new Set());
          cells.get(k).add(id);
        }
    },
    queryRect(x, y, w, h) {
      const result = new Set();
      for (let cy = Math.floor(y / CELL); cy <= Math.floor((y + h - 1) / CELL); cy++)
        for (let cx = Math.floor(x / CELL); cx <= Math.floor((x + w - 1) / CELL); cx++) {
          const bucket = cells.get(key(cx, cy));
          if (bucket) for (const id of bucket) result.add(id);
        }
      return result;
    }
  };
})();

export function isSolid(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= worldState.cols || ty >= worldState.rows) return true;
  return !!(worldState.layerCollision[ty]?.[tx]);
}

export function collidesAt(wx, wy) {
  const x0 = wx + HBX, y0 = wy + HBY, x1 = x0 + HBW - 1, y1 = y0 + HBH - 1;
  return isSolid(x0 / TILE_SIZE | 0, y0 / TILE_SIZE | 0) ||
         isSolid(x1 / TILE_SIZE | 0, y0 / TILE_SIZE | 0) ||
         isSolid(x0 / TILE_SIZE | 0, y1 / TILE_SIZE | 0) ||
         isSolid(x1 / TILE_SIZE | 0, y1 / TILE_SIZE | 0);
}

export function resolveMove(wx, wy, dx, dy) {
  const clampedX = Math.max(0, Math.min(worldState.w - TILE_SIZE, wx + dx));
  const clampedY = Math.max(0, Math.min(worldState.h - TILE_SIZE, wy + dy));
  const ax = collidesAt(clampedX, wy) ? wx : clampedX;
  const ay = collidesAt(ax, clampedY) ? wy : clampedY;
  return { x: ax, y: ay };
}

export function isGrounded(wx, wy) { return collidesAt(wx, wy + 1); }

// Clamp world-space coordinates to valid entity positions.
export function _clampToWorld(x, y) {
  return {
    x: Math.max(0, Math.min(worldState.w - TILE_SIZE, x)),
    y: Math.max(0, Math.min(worldState.h - TILE_SIZE, y)),
  };
}
// Integer Bresenham tile-walk. Tests every tile the segment passes
// through, from (ax,ay) to (bx,by) in world-space pixel coords.
// Returns true if no solid tile occludes the vector; false otherwise.
// Both endpoint tiles are tested — an entity flush against a wall
// does not have line-of-sight through that wall.
//
// Caller convention: pass sprite-center coordinates (x + TILE_SIZE/2)
// so adjacency to a wall doesn't falsely block the ray.
//
// Time complexity: O(max(|Δtx|, |Δty|)) — at most one tile per step.
export function hasLineOfSight(ax, ay, bx, by) {
  let tx = (ax / TILE_SIZE) | 0;
  let ty = (ay / TILE_SIZE) | 0;
  const tx1 = (bx / TILE_SIZE) | 0;
  const ty1 = (by / TILE_SIZE) | 0;

  const dxt = Math.abs(tx1 - tx);
  const dyt = Math.abs(ty1 - ty);
  const sx  = tx < tx1 ? 1 : -1;
  const sy  = ty < ty1 ? 1 : -1;
  let err = dxt - dyt;

  while (true) {
    if (isSolid(tx, ty)) return false;
    if (tx === tx1 && ty === ty1) break;
    const e2 = err * 2;
    if (e2 > -dyt) { err -= dyt; tx += sx; }
    if (e2 <  dxt) { err += dxt; ty += sy; }
  }
  return true;
}
