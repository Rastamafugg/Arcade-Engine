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

export function fitToWindow() {
  const scale = Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H);
  canvas.style.width  = Math.round(LOGICAL_W * scale) + 'px';
  canvas.style.height = Math.round(LOGICAL_H * scale) + 'px';
}
window.addEventListener('resize', fitToWindow);
fitToWindow();

export function fillRectPx(px, py, w, h, palIdx) {
  const [r, g, b] = paletteRGBA[palIdx];
  const x0 = Math.max(0, px), x1 = Math.min(LOGICAL_W, px + w);
  const y0 = Math.max(0, py), y1 = Math.min(LOGICAL_H, py + h);
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const base = (y * LOGICAL_W + x) * 4;
      frameBuffer[base] = r; frameBuffer[base+1] = g;
      frameBuffer[base+2] = b; frameBuffer[base+3] = 255;
    }
  }
}

// fillRectPx variant that clips to world region (y >= WORLD_OFFSET_Y).
export function fillRectWorld(px, py, w, h, palIdx) {
  fillRectPx(px, Math.max(py, WORLD_OFFSET_Y), w,
    Math.max(0, h - Math.max(0, WORLD_OFFSET_Y - py)), palIdx);
}

// Alpha-blended single pixel write. alpha ∈ [0,1].
export function blendPixel(sx, sy, r, g, b, alpha) {
  if (sx < 0 || sx >= LOGICAL_W || sy < 0 || sy >= LOGICAL_H) return;
  const base = (sy * LOGICAL_W + sx) * 4;
  const ia   = 1 - alpha;
  frameBuffer[base]   = (r * alpha + frameBuffer[base]   * ia) | 0;
  frameBuffer[base+1] = (g * alpha + frameBuffer[base+1] * ia) | 0;
  frameBuffer[base+2] = (b * alpha + frameBuffer[base+2] * ia) | 0;
  frameBuffer[base+3] = 255;
}

// Direct opaque pixel write into frameBuffer. Used by minimap and
// other routines that bypass the alpha path for performance.
function _fbSetPixel(bx, by, r, g, b) {
  const base = (by * LOGICAL_W + bx) * 4;
  frameBuffer[base] = r; frameBuffer[base+1] = g;
  frameBuffer[base+2] = b; frameBuffer[base+3] = 255;
}

export function drawBox(x, y, w, h, bgPal, borderPal) {
  fillRectPx(x, y, w, h, bgPal);
  fillRectPx(x,     y,     w, 1, borderPal);
  fillRectPx(x,     y+h-1, w, 1, borderPal);
  fillRectPx(x,     y,     1, h, borderPal);
  fillRectPx(x+w-1, y,     1, h, borderPal);
  fillRectPx(x+1,   y+1,   1, 1, borderPal);
  fillRectPx(x+w-2, y+1,   1, 1, borderPal);
}

export function drawChar(ch, px, py, palIdx) {
  const rows = FONT[ch.toUpperCase()] ?? FONT['?'];
  if (!rows) return;
  const [r, g, b] = paletteRGBA[palIdx];
  for (let row = 0; row < 7; row++) {
    const mask = rows[row];
    if (!mask) continue;
    const dstY = py + row;
    if (dstY < 0 || dstY >= LOGICAL_H) continue;
    for (let col = 0; col < 5; col++) {
      if (!((mask >> (4 - col)) & 1)) continue;
      const dstX = px + col;
      if (dstX < 0 || dstX >= LOGICAL_W) continue;
      const base = (dstY * LOGICAL_W + dstX) * 4;
      frameBuffer[base] = r; frameBuffer[base+1] = g;
      frameBuffer[base+2] = b; frameBuffer[base+3] = 255;
    }
  }
}

// Supports \n newlines. Auto-uppercases.
export function drawText(str, px, py, palIdx = 20) {
  let x = px, startX = px;
  for (const ch of str.toUpperCase()) {
    if (ch === '\n') { py += CHAR_H; x = startX; continue; }
    drawChar(ch, x, py, palIdx);
    x += CHAR_W;
  }
}

export function textWidth(str)  { return (str.split('\n')[0]?.length ?? 0) * CHAR_W; }

export function textHeight(str) { return str.split('\n').length * CHAR_H; }

export function flushBuffer() { ctx.putImageData(frameImageData, 0, 0); }
