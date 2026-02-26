import { TILE_SIZE, LOGICAL_W, LOGICAL_H, WORLD_H, WORLD_OFFSET_Y } from './config.js';
import { blitWorld } from './renderer.js';
import { spriteCache } from './systems/spriteCache.js';

export const camera = {
  x: 0, y: 0,
  follow(wx, wy, worldW, worldH) {
    this.x = Math.round(Math.max(0, Math.min(worldW - LOGICAL_W, wx - LOGICAL_W / 2)));
    this.y = Math.round(Math.max(0, Math.min(worldH - WORLD_H, wy - WORLD_H / 2)));
  },
  toScreen(wx, wy) {
    return [wx - this.x, wy - this.y + WORLD_OFFSET_Y];
  },
  isVisible(wx, wy, w = TILE_SIZE, h = TILE_SIZE) {
    const [sx, sy] = this.toScreen(wx, wy);
    return sx + w > 0 && sx < LOGICAL_W && sy + h > WORLD_OFFSET_Y && sy < LOGICAL_H;
  }
};

export const worldState = {
  cols: 20, rows: 18,
  get w() { return this.cols * TILE_SIZE; },
  get h() { return this.rows * TILE_SIZE; },
  layerBG: null, layerObjects: null, layerCollision: null,
  currentScene: ''
};

let _tileAnims = {};
export function registerTileAnims(anims) { _tileAnims = anims; }

function resolveSprite(name, elapsed) {
  const anim = _tileAnims[name];
  return anim ? anim.frames[Math.floor(elapsed * anim.fps) % anim.frames.length] : name;
}

export function drawTilemap(layer, elapsed = 0) {
  const cStart = Math.max(0, Math.floor(camera.x / TILE_SIZE));
  const cEnd = Math.min(worldState.cols, Math.ceil((camera.x + LOGICAL_W) / TILE_SIZE));
  const rStart = Math.max(0, Math.floor(camera.y / TILE_SIZE));
  const rEnd = Math.min(worldState.rows, Math.ceil((camera.y + WORLD_H) / TILE_SIZE));

  for (let row = rStart; row < rEnd; row++) {
    for (let col = cStart; col < cEnd; col++) {
      const cell = layer[row]?.[col];
      if (!cell) continue;
      const buf = spriteCache[resolveSprite(cell, elapsed)];
      if (!buf) continue;
      const [sx, sy] = camera.toScreen(col * TILE_SIZE, row * TILE_SIZE);
      blitWorld(buf, sx, sy);
    }
  }
}