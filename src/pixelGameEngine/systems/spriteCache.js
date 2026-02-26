import { paletteRGBA } from '../config.js';

// ================================================================
// SECTION 4: SPRITE CACHE
//
// _rasterizeBuf(resolveIdx) — shared pixel-write core. Accepts an
// index-resolver function so both rasterization paths (direct and
// palette-swap) share a single loop.
// ================================================================
export const spriteCache = {};

export function buildSpriteCache(sprites) {
  for (const [name, data] of Object.entries(sprites)) {
    spriteCache[name] = _rasterizeSprite(data);
  }
}

// Shared rasterization core. resolveIdx(i) → palette index or null.
export function _rasterizeBuf(resolveIdx) {
  const buf = new Uint8ClampedArray(64 * 4);
  for (let i = 0; i < 64; i++) {
    const idx  = resolveIdx(i);
    const base = i * 4;
    if (idx === null) { buf[base + 3] = 0; continue; }
    const c = paletteRGBA[idx];
    buf[base] = c[0]; buf[base+1] = c[1]; buf[base+2] = c[2]; buf[base+3] = 255;
  }
  return buf;
}

export function _rasterizeSprite(data) {
  return _rasterizeBuf(i => data[i]);
}

export function buildPaletteSwap(spriteData, indexMap) {
  return _rasterizeBuf(i => {
    const raw = spriteData[i];
    if (raw === null) return null;
    return (indexMap[raw] !== undefined) ? indexMap[raw] : raw;
  });
}