import { LOGICAL_W, LOGICAL_H, WORLD_OFFSET_Y, TILE_SIZE, paletteRGBA } from './config.js';

export const canvas = document.getElementById('screen');
export const ctx    = canvas.getContext('2d');
canvas.width  = LOGICAL_W;
canvas.height = LOGICAL_H;
ctx.imageSmoothingEnabled = false;

export const frameImageData = ctx.createImageData(LOGICAL_W, LOGICAL_H);
export const frameBuffer    = frameImageData.data;

export function clearBuffer(palIdx = 0) {
  const [r, g, b] = paletteRGBA[palIdx];
  for (let i = 0; i < frameBuffer.length; i += 4) {
    frameBuffer[i] = r; frameBuffer[i+1] = g;
    frameBuffer[i+2] = b; frameBuffer[i+3] = 255;
  }
}

export function blitBuffer(buf, sx, sy, flipX = false, flipY = false, clipToWorld = false) {
  const yMin = clipToWorld ? WORLD_OFFSET_Y : 0;
  for (let row = 0; row < TILE_SIZE; row++) {
    const dstY = sy + row;
    if (dstY < yMin || dstY >= LOGICAL_H) continue;
    const srcRow = flipY ? TILE_SIZE - 1 - row : row;
    for (let col = 0; col < TILE_SIZE; col++) {
      const dstX = sx + col;
      if (dstX < 0 || dstX >= LOGICAL_W) continue;
      const srcCol  = flipX ? TILE_SIZE - 1 - col : col;
      const srcBase = (srcRow * TILE_SIZE + srcCol) * 4;
      if (buf[srcBase + 3] === 0) continue;
      const dstBase = (dstY * LOGICAL_W + dstX) * 4;
      frameBuffer[dstBase] = buf[srcBase];
      frameBuffer[dstBase+1] = buf[srcBase+1];
      frameBuffer[dstBase+2] = buf[srcBase+2];
      frameBuffer[dstBase+3] = 255;
    }
  }
}

export function flushBuffer() { ctx.putImageData(frameImageData, 0, 0); }