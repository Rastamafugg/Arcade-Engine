import { paletteRGBA, TILE_SIZE } from './config.js';

export const spriteCache = {};

export function buildSpriteCache(sprites) {
  for (const [name, data] of Object.entries(sprites)) {
    spriteCache[name] = _rasterizeSprite(data);
  }
}

function _rasterizeSprite(data) {
  const buf = new Uint8ClampedArray(64 * 4);
  for (let i = 0; i < 64; i++) {
    const idx  = data[i];
    const base = i * 4;
    if (idx === null) { buf[base + 3] = 0; continue; }
    const c = paletteRGBA[idx];
    buf[base] = c[0]; buf[base+1] = c[1]; buf[base+2] = c[2]; buf[base+3] = 255;
  }
  return buf;
}