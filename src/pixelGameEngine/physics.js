import { TILE_SIZE } from './config.js';
import { worldState } from './world.js';

let HBX = 1, HBY = 4, HBW = 6, HBH = 4;

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