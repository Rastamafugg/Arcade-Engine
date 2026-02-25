'use strict';
// ================================================================
// PIXEL CANVAS ENGINE v5.1 — pixel-canvas-engine.js
//
// Self-contained vanilla JS engine for 8×8 tile-based games.
// Zero dependencies. Single putImageData call per frame.
//
// NEW IN v5.1:
//   World Y offset — game world is clamped below the HUD strip;
//     tiles/sprites no longer bleed under the status bar.
//   Section 20 — HUD: hearts, coins, item slots, item selection,
//     item use handlers.
//   Section 21 — Particles: pooled, world-space, alpha-blended fadeout.
//   Section 22 — Flags: named booleans, watchers, conditional NPC dialog.
//   Section 23 — Cutscene: sequenced commands.
//   Section 24 — Chest: interactable entity with open animation + loot.
//   Section 25 — Minimap: downsampled collision layer, configurable corner.
//
// WORLD OFFSET CHANGE (v5.1):
//   WORLD_OFFSET_Y = HUD_H (10px). camera.toScreen() adds this offset
//   automatically. All world-space rendering (tiles, sprites, particles)
//   is pushed down. The camera follow uses WORLD_H = LOGICAL_H - HUD_H
//   for viewport height. Games do not need to change anything.
// ================================================================

// ================================================================
// SECTION 1: CONFIG
// ================================================================
const TILE_SIZE = 8;
const COLS      = 20;
const ROWS      = 18;
const LOGICAL_W = COLS * TILE_SIZE;  // 160
const LOGICAL_H = ROWS * TILE_SIZE;  // 144
const HUD_H     = 10;                // px reserved at top for status bar

// World rendering begins below the HUD strip.
const WORLD_OFFSET_Y = HUD_H;
const WORLD_H        = LOGICAL_H - WORLD_OFFSET_Y;  // 134

// ================================================================
// SECTION 2: PALETTE
// 32-color indexed palette. Sprites reference integer indices only.
// ================================================================
const PALETTE = [
  /*00*/'#222034', /*01*/'#45283C', /*02*/'#663931', /*03*/'#8F563B',
  /*04*/'#DF7126', /*05*/'#D9A066', /*06*/'#EEC39A', /*07*/'#FBF236',
  /*08*/'#99E550', /*09*/'#6ABE30', /*10*/'#37946E', /*11*/'#4B692F',
  /*12*/'#524B24', /*13*/'#323C39', /*14*/'#3F3F74', /*15*/'#306082',
  /*16*/'#5B6EE1', /*17*/'#639BFF', /*18*/'#5FCDE4', /*19*/'#CBDBFC',
  /*20*/'#FFFFFF', /*21*/'#9BADB7', /*22*/'#847E87', /*23*/'#696A6A',
  /*24*/'#595652', /*25*/'#76428A', /*26*/'#AC3232', /*27*/'#D95763',
  /*28*/'#4a3020', /*29*/'#2a1a10', /*30*/'#1a1a2e', /*31*/'#0f3460',
];

const paletteRGBA = PALETTE.map(hex => {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 0xFF, (n >> 8) & 0xFF, n & 0xFF, 255];
});

// ================================================================
// SECTION 3: BITMAP FONT
// 5×7 glyphs as 5-bit row masks. CHAR_W=6, CHAR_H=8 (includes gap).
// ================================================================
const FONT_SRC = {
  ' ':['00000','00000','00000','00000','00000','00000','00000'],
  'A':['01110','10001','10001','11111','10001','10001','00000'],
  'B':['11110','10001','11110','10001','10001','11110','00000'],
  'C':['01110','10001','10000','10000','10001','01110','00000'],
  'D':['11100','10010','10001','10001','10010','11100','00000'],
  'E':['11111','10000','11110','10000','10000','11111','00000'],
  'F':['11111','10000','11110','10000','10000','10000','00000'],
  'G':['01110','10001','10000','10111','10001','01110','00000'],
  'H':['10001','10001','11111','10001','10001','10001','00000'],
  'I':['01110','00100','00100','00100','00100','01110','00000'],
  'J':['00111','00010','00010','00010','10010','01100','00000'],
  'K':['10001','10010','11100','10010','10001','10001','00000'],
  'L':['10000','10000','10000','10000','10000','11111','00000'],
  'M':['10001','11011','10101','10001','10001','10001','00000'],
  'N':['10001','11001','10101','10011','10001','10001','00000'],
  'O':['01110','10001','10001','10001','10001','01110','00000'],
  'P':['11110','10001','11110','10000','10000','10000','00000'],
  'Q':['01110','10001','10001','10101','10011','01111','00000'],
  'R':['11110','10001','11110','10100','10010','10001','00000'],
  'S':['01111','10000','01110','00001','00001','11110','00000'],
  'T':['11111','00100','00100','00100','00100','00100','00000'],
  'U':['10001','10001','10001','10001','10001','01110','00000'],
  'V':['10001','10001','10001','10001','01010','00100','00000'],
  'W':['10001','10001','10001','10101','11011','10001','00000'],
  'X':['10001','01010','00100','00100','01010','10001','00000'],
  'Y':['10001','10001','01010','00100','00100','00100','00000'],
  'Z':['11111','00001','00010','00100','01000','11111','00000'],
  '0':['01110','10001','10011','10101','11001','01110','00000'],
  '1':['00100','01100','00100','00100','00100','01110','00000'],
  '2':['01110','10001','00010','00100','01000','11111','00000'],
  '3':['11110','00001','00110','00001','00001','11110','00000'],
  '4':['00010','00110','01010','10010','11111','00010','00000'],
  '5':['11111','10000','11110','00001','00001','11110','00000'],
  '6':['00110','01000','11110','10001','10001','01110','00000'],
  '7':['11111','00001','00010','00100','01000','01000','00000'],
  '8':['01110','10001','01110','10001','10001','01110','00000'],
  '9':['01110','10001','10001','01111','00001','01110','00000'],
  '!':['00100','00100','00100','00100','00000','00100','00000'],
  '?':['01110','10001','00010','00100','00000','00100','00000'],
  '.':['00000','00000','00000','00000','00000','00100','00000'],
  ',':['00000','00000','00000','00000','00100','00100','01000'],
  ':':['00000','00100','00000','00000','00100','00000','00000'],
  ';':['00000','00100','00000','00000','00100','00100','01000'],
  '-':['00000','00000','11111','00000','00000','00000','00000'],
  '\'':['01100','01100','00000','00000','00000','00000','00000'],
  '"':['01010','01010','00000','00000','00000','00000','00000'],
  '(':['00010','00100','01000','01000','00100','00010','00000'],
  ')':['01000','00100','00010','00010','00100','01000','00000'],
  '/':['00001','00010','00100','01000','10000','00000','00000'],
  '#':['01010','11111','01010','01010','11111','01010','00000'],
  '*':['00000','10101','01110','11111','01110','10101','00000'],
  '>':['10000','01000','00100','00100','01000','10000','00000'],
  '<':['00001','00010','00100','00100','00010','00001','00000'],
  '+':['00000','00100','00100','11111','00100','00100','00000'],
  '_':['00000','00000','00000','00000','00000','11111','00000'],
};

const FONT = {};
for (const [ch, rows] of Object.entries(FONT_SRC)) {
  FONT[ch] = rows.map(r => parseInt(r, 2));
}

const CHAR_W = 6;
const CHAR_H = 8;

// ================================================================
// SECTION 4: SPRITE CACHE
//
// _rasterizeBuf(resolveIdx) — shared pixel-write core. Accepts an
// index-resolver function so both rasterization paths (direct and
// palette-swap) share a single loop.
// ================================================================
const spriteCache = {};

function buildSpriteCache(sprites) {
  for (const [name, data] of Object.entries(sprites)) {
    spriteCache[name] = _rasterizeSprite(data);
  }
}

// Shared rasterization core. resolveIdx(i) → palette index or null.
function _rasterizeBuf(resolveIdx) {
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

function _rasterizeSprite(data) {
  return _rasterizeBuf(i => data[i]);
}

function buildPaletteSwap(spriteData, indexMap) {
  return _rasterizeBuf(i => {
    const raw = spriteData[i];
    if (raw === null) return null;
    return (indexMap[raw] !== undefined) ? indexMap[raw] : raw;
  });
}

// ================================================================
// SECTION 5: CANVAS & FRAMEBUFFER
// ================================================================
const canvas = document.getElementById('screen');
const ctx    = canvas.getContext('2d');
canvas.width  = LOGICAL_W;
canvas.height = LOGICAL_H;
ctx.imageSmoothingEnabled = false;

const frameImageData = ctx.createImageData(LOGICAL_W, LOGICAL_H);
const frameBuffer    = frameImageData.data;

function fitToWindow() {
  const scale = Math.min(window.innerWidth / LOGICAL_W, window.innerHeight / LOGICAL_H);
  canvas.style.width  = Math.round(LOGICAL_W * scale) + 'px';
  canvas.style.height = Math.round(LOGICAL_H * scale) + 'px';
}
window.addEventListener('resize', fitToWindow);
fitToWindow();

// ================================================================
// SECTION 6: DRAW API
// All writes go to frameBuffer. flushBuffer() uploads in one call.
// ================================================================

function clearBuffer(palIdx = 0) {
  const [r, g, b] = paletteRGBA[palIdx];
  for (let i = 0; i < frameBuffer.length; i += 4) {
    frameBuffer[i] = r; frameBuffer[i+1] = g;
    frameBuffer[i+2] = b; frameBuffer[i+3] = 255;
  }
}

// Blit an 8×8 RGBA buffer. Alpha=0 pixels are skipped (transparent).
// Clips to [0, LOGICAL_W) x [WORLD_OFFSET_Y, LOGICAL_H) so world sprites
// never paint into the HUD strip.
function blitBuffer(buf, sx, sy, flipX = false, flipY = false, clipToWorld = false) {
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
      frameBuffer[dstBase]   = buf[srcBase];
      frameBuffer[dstBase+1] = buf[srcBase+1];
      frameBuffer[dstBase+2] = buf[srcBase+2];
      frameBuffer[dstBase+3] = 255;
    }
  }
}

// World-space blit: always clips to world region (below HUD).
function blitWorld(buf, sx, sy, flipX = false, flipY = false) {
  blitBuffer(buf, sx, sy, flipX, flipY, true);
}

function fillRectPx(px, py, w, h, palIdx) {
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
function fillRectWorld(px, py, w, h, palIdx) {
  fillRectPx(px, Math.max(py, WORLD_OFFSET_Y), w,
    Math.max(0, h - Math.max(0, WORLD_OFFSET_Y - py)), palIdx);
}

// Alpha-blended single pixel write. alpha ∈ [0,1].
function blendPixel(sx, sy, r, g, b, alpha) {
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

function drawBox(x, y, w, h, bgPal, borderPal) {
  fillRectPx(x, y, w, h, bgPal);
  fillRectPx(x,     y,     w, 1, borderPal);
  fillRectPx(x,     y+h-1, w, 1, borderPal);
  fillRectPx(x,     y,     1, h, borderPal);
  fillRectPx(x+w-1, y,     1, h, borderPal);
  fillRectPx(x+1,   y+1,   1, 1, borderPal);
  fillRectPx(x+w-2, y+1,   1, 1, borderPal);
}

function drawChar(ch, px, py, palIdx) {
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
function drawText(str, px, py, palIdx = 20) {
  let x = px, startX = px;
  for (const ch of str.toUpperCase()) {
    if (ch === '\n') { py += CHAR_H; x = startX; continue; }
    drawChar(ch, x, py, palIdx);
    x += CHAR_W;
  }
}

function textWidth(str)  { return (str.split('\n')[0]?.length ?? 0) * CHAR_W; }
function textHeight(str) { return str.split('\n').length * CHAR_H; }

function flushBuffer() { ctx.putImageData(frameImageData, 0, 0); }

// ================================================================
// SECTION 7: CAMERA
//
// v5.1: camera.toScreen() adds WORLD_OFFSET_Y so all world-space
// rendering is automatically pushed below the HUD strip.
// camera.follow() uses WORLD_H for the viewport height.
// ================================================================
const camera = {
  x: 0, y: 0,

  // Follow wx/wy (world-space center), bounded by world dimensions.
  // Uses WORLD_H so the visible world viewport does not include HUD.
  follow(wx, wy, worldW, worldH) {
    this.x = Math.round(Math.max(0, Math.min(worldW - LOGICAL_W,    wx - LOGICAL_W / 2)));
    this.y = Math.round(Math.max(0, Math.min(worldH - WORLD_H, wy - WORLD_H / 2)));
  },

  // Convert world-space → screen-space. Y includes the HUD offset.
  toScreen(wx, wy) {
    return [wx - this.x, wy - this.y + WORLD_OFFSET_Y];
  },

  // Visibility test in screen-space (accounts for HUD strip).
  isVisible(wx, wy, w = TILE_SIZE, h = TILE_SIZE) {
    const [sx, sy] = this.toScreen(wx, wy);
    return sx + w > 0 && sx < LOGICAL_W &&
           sy + h > WORLD_OFFSET_Y && sy < LOGICAL_H;
  },
};

// ================================================================
// SECTION 8: SPATIAL HASH (32px cells)
// ================================================================
const spatialHash = (() => {
  const CELL = 32;
  let cells = new Map();
  function key(cx, cy) { return (cx & 0xFFFF) << 16 | (cy & 0xFFFF); }
  function clear() { cells.clear(); }
  function insert(id, x, y, w = TILE_SIZE, h = TILE_SIZE) {
    const x0 = Math.floor(x / CELL), y0 = Math.floor(y / CELL);
    const x1 = Math.floor((x + w - 1) / CELL), y1 = Math.floor((y + h - 1) / CELL);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const k = key(cx, cy);
        if (!cells.has(k)) cells.set(k, new Set());
        cells.get(k).add(id);
      }
  }
  function queryRect(x, y, w, h) {
    const result = new Set();
    const x0 = Math.floor(x / CELL), y0 = Math.floor(y / CELL);
    const x1 = Math.floor((x + w - 1) / CELL), y1 = Math.floor((y + h - 1) / CELL);
    for (let cy = y0; cy <= y1; cy++)
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = cells.get(key(cx, cy));
        if (bucket) for (const id of bucket) result.add(id);
      }
    return result;
  }
  return { clear, insert, queryRect };
})();

// ================================================================
// SECTION 9: WORLD STATE
// ================================================================
const worldState = {
  cols: COLS, rows: ROWS,
  get w() { return this.cols * TILE_SIZE; },
  get h() { return this.rows * TILE_SIZE; },
  layerBG:        null,
  layerObjects:   null,
  layerCollision: null,
  currentScene:   '',
};

// ================================================================
// SECTION 10: TILE ANIMATION REGISTRY & TILEMAP RENDERING
// ================================================================
let _tileAnims = {};
function registerTileAnims(anims) { _tileAnims = anims; }

function resolveSprite(name, elapsed) {
  const anim = _tileAnims[name];
  if (!anim) return name;
  return anim.frames[Math.floor(elapsed * anim.fps) % anim.frames.length];
}

// Renders a tilemap layer. World-space blit (clips below HUD automatically).
function drawTilemap(layer, elapsed = 0) {
  const { cols, rows } = worldState;
  const cStart = Math.max(0, Math.floor(camera.x / TILE_SIZE));
  const cEnd   = Math.min(cols, Math.ceil((camera.x + LOGICAL_W) / TILE_SIZE));
  const rStart = Math.max(0, Math.floor(camera.y / TILE_SIZE));
  const rEnd   = Math.min(rows, Math.ceil((camera.y + WORLD_H) / TILE_SIZE));

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

// ================================================================
// SECTION 11: COLLISION (AABB, axis-separated)
// ================================================================
let HBX = 1, HBY = 4, HBW = 6, HBH = 4;
function setHitbox(x, y, w, h) { HBX = x; HBY = y; HBW = w; HBH = h; }

function isSolid(tx, ty) {
  if (tx < 0 || ty < 0 || tx >= worldState.cols || ty >= worldState.rows) return true;
  return !!(worldState.layerCollision[ty]?.[tx]);
}

function collidesAt(wx, wy) {
  const x0 = wx + HBX, y0 = wy + HBY;
  const x1 = x0 + HBW - 1, y1 = y0 + HBH - 1;
  return isSolid(x0 / TILE_SIZE | 0, y0 / TILE_SIZE | 0) ||
         isSolid(x1 / TILE_SIZE | 0, y0 / TILE_SIZE | 0) ||
         isSolid(x0 / TILE_SIZE | 0, y1 / TILE_SIZE | 0) ||
         isSolid(x1 / TILE_SIZE | 0, y1 / TILE_SIZE | 0);
}

// Clamp world-space coordinates to valid entity positions.
function _clampToWorld(x, y) {
  return {
    x: Math.max(0, Math.min(worldState.w - TILE_SIZE, x)),
    y: Math.max(0, Math.min(worldState.h - TILE_SIZE, y)),
  };
}

function resolveMove(wx, wy, dx, dy) {
  const clamped = _clampToWorld(wx + dx, wy + dy);
  const ax = collidesAt(clamped.x, wy)   ? wx : clamped.x;
  const ay = collidesAt(ax, clamped.y)   ? wy : clamped.y;
  return { x: ax, y: ay };
}

function isGrounded(wx, wy) { return collidesAt(wx, wy + 1); }

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
function hasLineOfSight(ax, ay, bx, by) {
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

// ================================================================
// SECTION 12: ANIMATION SYSTEM
// ================================================================
function createAnimator(clips, initial = Object.keys(clips)[0]) {
  return { clips, current: initial, frameIdx: 0, timer: 0, flipX: false, flipY: false };
}

function animatorPlay(anim, clip) {
  if (anim.current === clip) return;
  anim.current = clip; anim.frameIdx = 0; anim.timer = 0;
}

function animatorUpdate(anim, delta) {
  const clip = anim.clips[anim.current];
  if (!clip?.frames.length) return;
  anim.timer += delta;
  const dur = Array.isArray(clip.durations)
    ? (clip.durations[anim.frameIdx] ?? clip.durations[0])
    : clip.durations;
  if (anim.timer >= dur) {
    anim.timer -= dur;
    anim.frameIdx = (anim.frameIdx + 1) % clip.frames.length;
  }
}

function animatorSprite(anim) {
  return anim.clips[anim.current]?.frames[anim.frameIdx] ?? null;
}

// ================================================================
// SECTION 13: ECS
// ================================================================
const world = (() => {
  let nextId = 0;
  const store    = new Map();
  const entities = new Set();
  return {
    createEntity(comps = {}) {
      const id = nextId++;
      entities.add(id);
      store.set(id, { ...comps });
      return id;
    },
    destroyEntity(id) { entities.delete(id); store.delete(id); },
    get(id, name)       { return store.get(id)?.[name]; },
    set(id, name, data) { if (store.has(id)) store.get(id)[name] = data; },
    has(id, name)       { return store.get(id)?.[name] !== undefined; },
    query(...names) {
      const out = [];
      for (const id of entities) {
        const c = store.get(id);
        if (c && names.every(n => c[n] !== undefined)) out.push(id);
      }
      return out;
    },
    get allIds() { return entities; },
  };
})();

// ================================================================
// SECTION 14: INPUT
// Abstract action map: keyboard + gamepad unified.
// v5.1: itemNext / itemPrev cycle inventory selection.
// ================================================================
const ACTION_MAP = {
  up:       { keys: ['ArrowUp',   'KeyW'],   gpButtons: [12] },
  down:     { keys: ['ArrowDown', 'KeyS'],   gpButtons: [13] },
  left:     { keys: ['ArrowLeft', 'KeyA'],   gpButtons: [14] },
  right:    { keys: ['ArrowRight','KeyD'],   gpButtons: [15] },
  action:   { keys: ['KeyZ','Space'],         gpButtons: [0]  },
  cancel:   { keys: ['KeyX','Escape'],        gpButtons: [1]  },
  // Cycle item selection in the HUD inventory slots.
  itemNext: { keys: ['KeyE','Tab'],           gpButtons: [5]  },  // R-bumper / E / Tab
  itemPrev: { keys: ['KeyQ'],                 gpButtons: [4]  },  // L-bumper / Q
  // Attack: fires active weapon (melee swing or projectile).
  attack:   { keys: ['KeyX'],                 gpButtons: [2]  },  // X key / gamepad X
};

const input = (() => {
  const down = new Set(), pressed = new Set(), released = new Set();
  const snap = { held: {}, pressed: {}, released: {}, axis: { x: 0, y: 0 } };

  window.addEventListener('keydown', e => {
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(e.code))
      e.preventDefault();
  });
  window.addEventListener('keyup', e => { down.delete(e.code); released.add(e.code); });

  return {
    update() {
      const gp = [...(navigator.getGamepads?.() || [])].find(g => g?.connected);
      snap.axis.x = gp && Math.abs(gp.axes[0]) > 0.15 ? gp.axes[0] : 0;
      snap.axis.y = gp && Math.abs(gp.axes[1]) > 0.15 ? gp.axes[1] : 0;
      for (const [a, m] of Object.entries(ACTION_MAP)) {
        const gpH = gp ? m.gpButtons.some(b => gp.buttons[b]?.pressed) : false;
        snap.held[a]      = m.keys.some(k => down.has(k)) || gpH;
        snap.pressed[a]   = m.keys.some(k => pressed.has(k)) || (gpH && !snap.held[a+'_p']);
        snap.released[a]  = m.keys.some(k => released.has(k));
        snap.held[a+'_p'] = gpH;
      }
      pressed.clear(); released.clear();
    },
    held:    a => !!snap.held[a],
    pressed: a => !!snap.pressed[a],
    released:a => !!snap.released[a],
    axis:    () => snap.axis,
  };
})();

// ================================================================
// SECTION 15: SOUND ENGINE
// ================================================================
const NOTE_FREQ_BASE = {
  'C':261.63,'C#':277.18,'D':293.66,'D#':311.13,'E':329.63,
  'F':349.23,'F#':369.99,'G':392.00,'G#':415.30,'A':440.00,
  'A#':466.16,'B':493.88,
};

function _noteToHz(note, octave) {
  return (NOTE_FREQ_BASE[note] ?? 440) * Math.pow(2, octave - 4);
}

function _parseNotes(str) {
  return str.trim().split(/\s+/).map(tok => {
    const [n, b] = tok.split(':');
    const beats  = parseFloat(b);
    if (n === 'R') return { rest: true, beats };
    const sharp = n[1] === '#';
    const note  = sharp ? n.slice(0, 2) : n[0];
    const oct   = parseInt(sharp ? n[2] : n[1]);
    return { note, oct, beats };
  });
}

const sound = (() => {
  let actx = null, masterGain = null;
  let bgmNodes = [], bgmTimer = null, bgmCurrent = null;
  let _tracks = {}, _sfx = {};

  function init() {
    if (actx) { if (actx.state === 'suspended') actx.resume(); return; }
    actx = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = actx.createGain();
    masterGain.gain.value = 0.12;
    masterGain.connect(actx.destination);
  }

  function _scheduleTrack(track, t0) {
    const beat = 60 / track.bpm;
    const nodes = [];
    let maxEnd = t0;
    for (const ch of track.channels) {
      const parsed = _parseNotes(ch.notes);
      let t = t0;
      for (const n of parsed) {
        const dur = n.beats * beat;
        if (!n.rest && actx) {
          const osc  = actx.createOscillator();
          const gain = actx.createGain();
          osc.type = ch.instrument;
          osc.frequency.value = _noteToHz(n.note, n.oct);
          const att = 0.01, rel = Math.min(0.05, dur * 0.25);
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.7, t + att);
          gain.gain.setValueAtTime(0.7, t + dur - rel);
          gain.gain.linearRampToValueAtTime(0, t + dur);
          osc.connect(gain); gain.connect(masterGain);
          osc.start(t); osc.stop(t + dur + 0.01);
          nodes.push(osc);
        }
        t += dur;
      }
      maxEnd = Math.max(maxEnd, t);
    }
    return { nodes, duration: maxEnd - t0 };
  }

  function stopBGM() {
    clearTimeout(bgmTimer);
    for (const n of bgmNodes) try { n.stop(0); } catch(e) {}
    bgmNodes = []; bgmCurrent = null;
  }

  function playBGM(name) {
    if (!actx || bgmCurrent === name) return;
    stopBGM();
    const track = _tracks[name];
    if (!track) return;
    bgmCurrent = name;
    function loop() {
      if (bgmCurrent !== name) return;
      const { nodes, duration } = _scheduleTrack(track, actx.currentTime + 0.05);
      bgmNodes.push(...nodes);
      if (track.loop) bgmTimer = setTimeout(loop, Math.max(0, (duration - 0.2) * 1000));
    }
    loop();
  }

  function playSFX(name) {
    if (!actx) return;
    const sfx = _sfx[name];
    if (sfx) _scheduleTrack(sfx, actx.currentTime + 0.01);
  }

  function setVolume(v) { if (masterGain) masterGain.gain.value = Math.max(0, Math.min(1, v)); }

  return {
    init, playBGM, stopBGM, playSFX, setVolume,
    registerTracks(t) { _tracks = t; },
    registerSFX(s)    { _sfx = s; },
  };
})();

window.addEventListener('keydown', () => sound.init(), { capture: true });
document.addEventListener('pointerdown', () => sound.init(), { once: true });

// ================================================================
// SECTION 16: SCENE MANAGER
// ================================================================
let playerId = -1;

const sceneTransition = {
  state: 'none',
  alpha: 0, speed: 3,
  pendingScene: '', pendingX: 0, pendingY: 0,
};

const sceneNpcIds = [];
let _scenes = {};

// Default NPC clip factory. Override with setNpcClipFactory().
let _npcClipFactory = s => {
  const clip = dur => ({ frames: [s], durations: dur });
  return {
    idle:      clip(0.4),
    walk_down: clip(0.3),
    walk_up:   clip(0.3),
    walk_side: clip(0.3),
  };
};

function registerScenes(scenes) { _scenes = scenes; }
function setNpcClipFactory(fn)  { _npcClipFactory = fn; }

function clearSceneEntities() {
  for (const id of [...world.allIds])
    if (!world.has(id, 'persistent')) world.destroyEntity(id);
  sceneNpcIds.length = 0;
}

function spawnSceneNpcs(scene) {
  for (const def of (scene.npcs || [])) {
    const clips = _npcClipFactory(def.sprite);
    const id = world.createEntity({
      transform: { x: def.tileX * TILE_SIZE, y: def.tileY * TILE_SIZE },
      velocity:  { dx: 0, dy: 0, speed: def.patrol?.speed ?? 0 },
      animator:  createAnimator(clips, 'idle'),
      collider:  true,
      npcData:   {
        name:           def.name,
        dialogLines:    def.dialog,
        dialogBranches: def.dialogBranches ?? [],
        onClose:        def.onClose ?? null,
      },
      ...(def.patrol ? { patrol: { ...def.patrol } } : {}),
    });
    sceneNpcIds.push(id);
  }
}

// Spawn chests defined in scene config.
// def: { tileX, tileY, loot: [{ type, sprite }], flagName }
function spawnSceneChests(scene) {
  for (const def of (scene.chests || [])) {
    if (def.flagName && getFlag(def.flagName)) continue; // already opened
    _spawnChestEntity(def.tileX * TILE_SIZE, def.tileY * TILE_SIZE,
      def.loot ?? [], def.flagName ?? null);
  }
}

function loadScene(name, px = null, py = null) {
  const scene = _scenes[name];
  if (!scene) { console.warn('Unknown scene:', name); return; }
  clearSceneEntities();
  worldState.cols           = scene.worldCols;
  worldState.rows           = scene.worldRows;
  worldState.layerBG        = scene.layerBG;
  worldState.layerObjects   = scene.layerObjects;
  worldState.layerCollision = scene.layerCollision;
  worldState.currentScene   = name;
  const ptf = world.get(playerId, 'transform');
  if (ptf) {
    ptf.x = px ?? scene.playerStart.tileX * TILE_SIZE;
    ptf.y = py ?? scene.playerStart.tileY * TILE_SIZE;
  }
  spawnSceneNpcs(scene);
  spawnSceneChests(scene);
  spawnSceneEnemies(scene);
  camera.x = 0; camera.y = 0;
  sound.playBGM(scene.music);
  scene.onEnter?.();
}

function startTransition(targetScene, targetX, targetY) {
  if (sceneTransition.state !== 'none') return;
  sceneTransition.state = 'out'; sceneTransition.alpha = 0;
  sceneTransition.pendingScene = targetScene;
  sceneTransition.pendingX = targetX; sceneTransition.pendingY = targetY;
  sound.playSFX('portal');
}

function updateTransition(delta) {
  const t = sceneTransition;
  if (t.state === 'none') return;
  if (t.state === 'out') {
    t.alpha += t.speed * delta;
    if (t.alpha >= 1) {
      t.alpha = 1;
      loadScene(t.pendingScene, t.pendingX, t.pendingY);
      t.state = 'in';
    }
  } else if (t.state === 'in') {
    t.alpha -= t.speed * delta;
    if (t.alpha <= 0) { t.alpha = 0; t.state = 'none'; }
  }
}

function renderTransitionOverlay() {
  if (sceneTransition.state === 'none' || sceneTransition.alpha <= 0) return;
  ctx.fillStyle = `rgba(0,0,0,${sceneTransition.alpha.toFixed(2)})`;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}

// ================================================================
// SECTION 17: DIALOG
// ================================================================
const dialog = {
  active:   false,
  lines:    [],
  page:     0,
  name:     '',
  _onClose: null,
  _branch:  null,
};

function renderDialog(elapsed) {
  if (!dialog.active) return;
  const bx = 8, by = LOGICAL_H - 54, bw = LOGICAL_W - 16, bh = 48;
  drawBox(bx, by, bw, bh, 1, 20);
  if (dialog.name) {
    fillRectPx(bx + 3, by - 10, dialog.name.length * CHAR_W + 6, 11, 14);
    fillRectPx(bx + 3, by - 10, dialog.name.length * CHAR_W + 6, 1, 21);
    drawText(dialog.name, bx + 6, by - 8, 7);
  }
  drawText(dialog.lines[dialog.page] ?? '', bx + 5, by + 5, 20);
  if (Math.floor(elapsed * 3) % 2 === 0) {
    const label = dialog.page < dialog.lines.length - 1 ? '>' : 'X';
    drawText(label, bx + bw - 10, by + bh - 10, 21);
  }
}

// ================================================================
// SECTION 18: SAVE / LOAD
// ================================================================
let _saveKey = 'pixelCanvas_v5';
function setSaveKey(k) { _saveKey = k; }

const saveNote = { text: '', timer: 0 };
function showNote(msg, dur = 2.5) { saveNote.text = msg; saveNote.timer = dur; }

function renderSaveNote() {
  if (saveNote.timer <= 0) return;
  const x = ((LOGICAL_W - textWidth(saveNote.text)) / 2) | 0;
  fillRectPx(x - 3, 3, textWidth(saveNote.text) + 6, CHAR_H + 2, 1);
  drawText(saveNote.text, x, 4, 7);
}

// Shared try/catch wrapper for localStorage operations.
// fn() should return a truthy result on success, falsy on logical failure.
// Returns false and logs on exception.
function _tryStorage(fn, label) {
  try { return fn(); }
  catch(e) { console.warn(label + ':', e.message); return false; }
}

const saveLoad = {
  save() {
    const ptf = world.get(playerId, 'transform');
    if (!ptf) return false;
    return _tryStorage(() => {
      localStorage.setItem(_saveKey, JSON.stringify({
        version: 2,
        scene:   worldState.currentScene,
        x: ptf.x | 0, y: ptf.y | 0,
        flags:   { ...flags },
        hud:     { hp: hud.hp, maxHp: hud.maxHp, coins: hud.coins },
      }));
      return true;
    }, 'Save failed');
  },
  load() {
    return _tryStorage(() => {
      const raw  = localStorage.getItem(_saveKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.version !== 2 || !_scenes[data.scene]) return false;
      if (data.flags) Object.assign(flags, data.flags);
      if (data.hud) {
        hud.hp     = data.hud.hp    ?? hud.hp;
        hud.maxHp  = data.hud.maxHp ?? hud.maxHp;
        hud.coins  = data.hud.coins ?? hud.coins;
      }
      loadScene(data.scene, data.x, data.y);
      return true;
    }, 'Load failed');
  },
  hasSave() {
    return _tryStorage(() => !!localStorage.getItem(_saveKey), 'hasSave');
  },
};

window.addEventListener('keydown', e => {
  if (e.code === 'F5') {
    e.preventDefault(); sound.init();
    if (saveLoad.save()) { sound.playSFX('save'); showNote('GAME SAVED!'); }
    else showNote('SAVE FAILED');
  }
  if (e.code === 'F9') {
    e.preventDefault(); sound.init();
    if (saveLoad.load()) { sound.playSFX('confirm'); showNote('GAME LOADED!'); }
    else showNote('NO SAVE FOUND');
  }
});

// ================================================================
// SECTION 19: BUILT-IN SYSTEMS
// ================================================================

// Shared walk-animation helper. Sets the correct clip and flipX on
// an animator given a movement direction vector (dx, dy).
// Used by sysInput, sysAI, and the cutscene move command.
function _applyWalkAnim(anim, dx, dy) {
  if (Math.abs(dy) > Math.abs(dx)) {
    animatorPlay(anim, dy > 0 ? 'walk_down' : 'walk_up');
    anim.flipX = false;
  } else {
    animatorPlay(anim, 'walk_side');
    anim.flipX = dx < 0;
  }
}

function sysInput() {
  if (dialog.active || sceneTransition.state !== 'none' || cutscene.isInputLocked()) {
    const vel = world.get(playerId, 'velocity');
    if (vel) { vel.dx = 0; vel.dy = 0; }
    return;
  }

  // Item slot cycling (processed before movement).
  if (input.pressed('itemNext')) hud.cycleSlot(1);
  if (input.pressed('itemPrev')) hud.cycleSlot(-1);

  const vel  = world.get(playerId, 'velocity');
  const anim = world.get(playerId, 'animator');
  if (!vel || !anim) return;

  let dx = 0, dy = 0;
  const ax = input.axis();
  if (input.held('left')  || ax.x < -0.15) dx = -1;
  if (input.held('right') || ax.x >  0.15) dx =  1;
  if (input.held('up')    || ax.y < -0.15) dy = -1;
  if (input.held('down')  || ax.y >  0.15) dy =  1;

  vel.dx = dx * vel.speed;
  vel.dy = dy * vel.speed;

  if (dx !== 0 || dy !== 0) {
    _applyWalkAnim(anim, dx, dy);
  } else {
    animatorPlay(anim, 'idle');
  }
}

function sysAI(delta) {
  for (const id of world.query('transform', 'velocity', 'patrol', 'animator')) {
    if (world.has(id, '_scriptMove')) continue;
    const tf     = world.get(id, 'transform');
    const vel    = world.get(id, 'velocity');
    const patrol = world.get(id, 'patrol');
    const anim   = world.get(id, 'animator');
    const wp     = patrol.waypoints[patrol.waypointIdx];
    const dx = wp.x - tf.x, dy = wp.y - tf.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 2) {
      patrol.waypointIdx = (patrol.waypointIdx + 1) % patrol.waypoints.length;
      vel.dx = 0; vel.dy = 0;
      animatorPlay(anim, 'idle');
    } else {
      vel.dx = (dx / dist) * patrol.speed;
      vel.dy = (dy / dist) * patrol.speed;
      _applyWalkAnim(anim, dx, dy);
    }
  }
}

function sysMovement(delta) {
  for (const id of world.query('transform', 'velocity')) {
    const tf  = world.get(id, 'transform');
    const vel = world.get(id, 'velocity');
    if (vel.dx === 0 && vel.dy === 0) continue;
    if (world.has(id, 'collider')) {
      const pos = resolveMove(tf.x, tf.y, vel.dx * delta, vel.dy * delta);
      tf.x = pos.x; tf.y = pos.y;
    } else {
      const clamped = _clampToWorld(tf.x + vel.dx * delta, tf.y + vel.dy * delta);
      tf.x = clamped.x; tf.y = clamped.y;
    }
  }
}

function sysSpatialHash() {
  spatialHash.clear();
  for (const id of world.query('transform')) {
    const tf = world.get(id, 'transform');
    spatialHash.insert(id, tf.x, tf.y);
  }
}

function sysCamera() {
  const ptf = world.get(playerId, 'transform');
  if (ptf) camera.follow(ptf.x + TILE_SIZE/2, ptf.y + TILE_SIZE/2, worldState.w, worldState.h);
}

function sysAnimation(delta) {
  for (const id of world.query('animator')) {
    animatorUpdate(world.get(id, 'animator'), delta);
  }
}

function sysSceneTransition() {
  if (sceneTransition.state !== 'none' || dialog.active || cutscene.isInputLocked()) return;
  const ptf = world.get(playerId, 'transform');
  if (!ptf) return;
  const tx = ptf.x / TILE_SIZE | 0;
  const ty = ptf.y / TILE_SIZE | 0;
  const portals = _scenes[worldState.currentScene]?.portals ?? [];
  for (const p of portals) {
    if (tx === p.tileX && ty === p.tileY) {
      if (p.script) { cutscene.run(p.script); return; }
      startTransition(p.targetScene, p.targetTileX * TILE_SIZE, p.targetTileY * TILE_SIZE);
      return;
    }
  }
}

function sysDialog(elapsed) {
  if (dialog.active) {
    if (input.pressed('action') || input.pressed('cancel')) {
      if (dialog.page < dialog.lines.length - 1 && input.pressed('action')) {
        dialog.page++;
        sound.playSFX('dialog');
      } else {
        const onClose = dialog._onClose;
        const branch  = dialog._branch;
        dialog.active   = false;
        dialog._onClose = null;
        dialog._branch  = null;
        sound.playSFX('cancel');
        if (branch)  _applyDialogBranch(branch);
        if (onClose) onClose();
      }
    }
    return;
  }
  if (cutscene.isRunning()) return;

  // Use action key: first check chests, then NPCs, then selected item use.
  if (!input.pressed('action')) return;
  const ptf = world.get(playerId, 'transform');
  if (!ptf) return;

  const nearby = spatialHash.queryRect(ptf.x - 12, ptf.y - 12, TILE_SIZE + 24, TILE_SIZE + 24);

  // Single pass: chest takes priority over NPC. Accumulate first NPC
  // candidate while scanning so we never iterate the Set twice.
  let npcCandidate = null;
  for (const id of nearby) {
    if (id === playerId) continue;
    const chest = world.get(id, 'chest');
    if (chest && !chest.opened) { _openChest(id); return; }
    if (!npcCandidate) {
      const npc = world.get(id, 'npcData');
      if (npc) npcCandidate = { id, npc };
    }
  }

  if (npcCandidate) {
    const { id, npc } = npcCandidate;
    const { lines, branch } = _resolveNpcDialog(npc);
    dialog.active  = true;
    dialog.lines   = lines;
    dialog.name    = npc.name;
    dialog.page    = 0;
    dialog._branch = branch;
    dialog._onClose = npc.onClose ? () => npc.onClose(id) : null;
    sound.init();
    sound.playSFX('dialog');
    return;
  }

  // Selected item use.
  hud.useSelectedItem();
}

// Entity render pass: world-space (clips below HUD).
function sysRender() {
  for (const id of world.query('transform')) {
    const tf = world.get(id, 'transform');
    if (!camera.isVisible(tf.x, tf.y)) continue;
    const anim = world.get(id, 'animator');
    let buf = null, flipX = false, flipY = false;
    if (anim) {
      const sn = animatorSprite(anim);
      buf = sn ? spriteCache[sn] : null;
      flipX = anim.flipX; flipY = anim.flipY;
    } else {
      const sp = world.get(id, 'sprite');
      if (sp) { buf = sp.buf || spriteCache[sp.name]; flipX = !!sp.flipX; }
    }
    if (!buf) continue;
    // Iframe flicker: hide damageable entity every other flicker tick.
    const dmgable = world.get(id, 'damageable');
    if (dmgable && dmgable.iframes > 0 && !_iframeFlickerVisible) continue;
    const [sx, sy] = camera.toScreen(tf.x, tf.y);
    blitWorld(buf, sx | 0, sy | 0, flipX, flipY);
  }
}

// ================================================================
// SECTION 20: HUD SYSTEM
//
// v5.1 additions:
//   selectedSlot  — integer 0-3 or null (no selection)
//   cycleSlot(n)  — advance selection by ±1, wrapping through null
//   registerItemUse(spriteName, fn) — register callback for item use
//   useSelectedItem() — fire handler for currently selected slot's item
//   renderHUD() — draws selection highlight on active slot
//
// Item use handler signature: fn(slotIndex) → void
// Returning false from the handler suppresses the default SFX.
// ================================================================

const _HUD_DEFS = {
  _hud_heart_full: [
    null,27,27,null,null,27,27,null,
    27,27,27,27,27,27,27,27,
    27,27,27,27,27,27,27,27,
    27,27,27,27,27,27,27,27,
    null,27,27,27,27,27,27,null,
    null,null,27,27,27,27,null,null,
    null,null,null,27,27,null,null,null,
    null,null,null,null,null,null,null,null,
  ],
  _hud_heart_half: [
    null,27,27,null,null,22,22,null,
    27,27,27,27,22,null,null,22,
    27,27,27,null,null,null,null,22,
    27,27,27,null,null,null,null,22,
    null,27,27,null,null,null,22,null,
    null,null,27,null,null,22,null,null,
    null,null,null,27,22,null,null,null,
    null,null,null,null,null,null,null,null,
  ],
  _hud_heart_empty: [
    null,22,22,null,null,22,22,null,
    22,null,null,22,22,null,null,22,
    22,null,null,null,null,null,null,22,
    22,null,null,null,null,null,null,22,
    null,22,null,null,null,null,22,null,
    null,null,22,null,null,22,null,null,
    null,null,null,22,22,null,null,null,
    null,null,null,null,null,null,null,null,
  ],
  _hud_coin: [
    null,null, 7, 7, 7, 7,null,null,
    null, 7,  20, 7, 7, 7, 7,null,
     7,  20,  7, 7, 7, 7, 7, 7,
     7,   7,  7, 7, 7, 7, 7, 7,
     7,   7,  7, 7, 7, 7, 7, 7,
    null, 7,  7, 7, 7, 7, 7,null,
    null,null, 7, 7, 7, 7,null,null,
    null,null,null,null,null,null,null,null,
  ],
  _hud_slot_empty: [
    14,14,14,14,14,14,14,14,
    14, 0, 0, 0, 0, 0, 0,14,
    14, 0, 0, 0, 0, 0, 0,14,
    14, 0, 0, 0, 0, 0, 0,14,
    14, 0, 0, 0, 0, 0, 0,14,
    14, 0, 0, 0, 0, 0, 0,14,
    14, 0, 0, 0, 0, 0, 0,14,
    14,14,14,14,14,14,14,14,
  ],
  // Chest sprites (palette-indexed 8×8).
  _chest_closed: [
    null, 3, 3, 3, 3, 3, 3,null,
       3, 5, 5, 5, 5, 5, 5, 3,
       3, 5, 7, 7, 7, 7, 5, 3,
       3, 3, 3, 3, 3, 3, 3, 3,
       3, 5, 5, 5, 5, 5, 5, 3,
       3, 5, 5, 5, 5, 5, 5, 3,
       3, 5, 5, 5, 5, 5, 5, 3,
    null, 3, 3, 3, 3, 3, 3,null,
  ],
  _chest_open: [
       3, 5, 7, 7, 7, 7, 5, 3,
       3, 3, 3, 3, 3, 3, 3, 3,
    null, 3, 3, 3, 3, 3, 3,null,
    null, 3, 0, 0, 0, 0, 3,null,
    null, 3, 0, 0, 0, 0, 3,null,
    null, 3, 0, 0, 0, 0, 3,null,
    null, 3, 0, 0, 0, 0, 3,null,
    null, 3, 3, 3, 3, 3, 3,null,
  ],
};

for (const [name, data] of Object.entries(_HUD_DEFS)) {
  spriteCache[name] = _rasterizeSprite(data);
}

const hud = {
  hp:           6,
  maxHp:        6,
  coins:        0,
  items:        [null, null, null, null],  // sprite names
  selectedSlot: null,                      // null = nothing selected, 0-3 = slot index
  visible:      true,
  _itemHandlers: new Map(),  // spriteName → fn(slotIndex)

  setHp(v)           { this.hp     = Math.max(0, Math.min(this.maxHp, v)); },
  addHp(n)           { this.setHp(this.hp + n); },
  setMaxHp(v)        { this.maxHp  = Math.max(2, v); },
  setCoins(v)        { this.coins  = Math.max(0, v); },
  addCoins(n)        { this.coins += n; },
  setItem(s, name)   { if (s >= 0 && s < 4) this.items[s] = name ?? null; },
  clearItem(s)       { this.setItem(s, null); },

  // Cycle through slots. direction = +1 or -1.
  // Cycling past end → null (no selection). Null cycles back to first populated slot.
  cycleSlot(direction) {
    const populated = this.items.reduce((a, v, i) => v ? [...a, i] : a, []);
    if (!populated.length) { this.selectedSlot = null; return; }
    if (this.selectedSlot === null) {
      this.selectedSlot = direction > 0 ? populated[0] : populated[populated.length - 1];
    } else {
      const cur  = populated.indexOf(this.selectedSlot);
      const next = cur + direction;
      this.selectedSlot = (next < 0 || next >= populated.length) ? null : populated[next];
    }
    sound.playSFX('dialog');
  },

  // Register a use handler for an item sprite name.
  // fn(slotIndex) is called when the player presses the action key
  // while that item is selected. Return false to suppress SFX.
  registerItemUse(spriteName, fn) {
    this._itemHandlers.set(spriteName, fn);
  },

  // Called by sysDialog when action is pressed and no NPC/chest is nearby.
  useSelectedItem() {
    if (this.selectedSlot === null) return;
    const spriteName = this.items[this.selectedSlot];
    if (!spriteName) return;
    const fn = this._itemHandlers.get(spriteName);
    if (fn) {
      const suppress = fn(this.selectedSlot) === false;
      if (!suppress) sound.playSFX('confirm');
    }
  },
};

function renderHUD() {
  if (!hud.visible) return;

  fillRectPx(0, 0, LOGICAL_W, HUD_H, 0);
  fillRectPx(0, HUD_H - 1, LOGICAL_W, 1, 13);

  // Hearts.
  const heartCount = Math.ceil(hud.maxHp / 2);
  for (let i = 0; i < heartCount; i++) {
    const filled = hud.hp - i * 2;
    const key = filled >= 2 ? '_hud_heart_full'
              : filled === 1 ? '_hud_heart_half'
              : '_hud_heart_empty';
    blitBuffer(spriteCache[key], 2 + i * 9, 1);
  }

  // Coin icon + count.
  const coinX = 2 + heartCount * 9 + 4;
  blitBuffer(spriteCache['_hud_coin'], coinX, 1);
  drawText(`x${hud.coins}`, coinX + 9, 2, 7);

  // Item slots (right side). Selected slot gets a highlight border.
  for (let s = 0; s < 4; s++) {
    const sx = LOGICAL_W - 4 - (3 - s) * 10 - 8;
    if (hud.selectedSlot === s) {
      fillRectPx(sx - 1, 0,       10, 1, 7);    // top
      fillRectPx(sx - 1, HUD_H-1, 10, 1, 7);    // bottom (on separator line)
      fillRectPx(sx - 1, 0,        1, HUD_H, 7); // left
      fillRectPx(sx + 8, 0,        1, HUD_H, 7); // right
    }
    blitBuffer(spriteCache['_hud_slot_empty'], sx, 1);
    if (hud.items[s]) {
      const buf = spriteCache[hud.items[s]];
      if (buf) blitBuffer(buf, sx, 1);
    }
  }
}

// ================================================================
// SECTION 21: PARTICLE SYSTEM
// ================================================================
const MAX_PARTICLES = 256;
const _particles = Array.from({ length: MAX_PARTICLES }, () => ({
  active: false, x: 0, y: 0, vx: 0, vy: 0,
  life: 0, maxLife: 1, color: 20, gravity: 0, size: 1,
}));

// Shared particle property initializer used by both the normal and
// eviction paths of emitParticle.
function _initParticle(p, x, y, vx, vy, life, colorIdx, gravity, size) {
  p.active = true;
  p.x = x; p.y = y; p.vx = vx; p.vy = vy;
  p.life = life; p.maxLife = life;
  p.color = colorIdx; p.gravity = gravity; p.size = size;
}

function emitParticle(x, y, vx, vy, life, colorIdx, gravity = 0, size = 1) {
  // Fast path: find an inactive slot.
  for (let i = 0; i < MAX_PARTICLES; i++) {
    if (!_particles[i].active) {
      _initParticle(_particles[i], x, y, vx, vy, life, colorIdx, gravity, size);
      return;
    }
  }
  // Eviction path: overwrite the particle closest to expiry.
  let oldest = null, minLife = Infinity;
  for (const p of _particles) {
    if (p.active && p.life < minLife) { minLife = p.life; oldest = p; }
  }
  if (oldest) _initParticle(oldest, x, y, vx, vy, life, colorIdx, gravity, size);
}

const _BURST_PRESETS = {
  footstep: { n:3,  cols:[11,12,23],     vxR:18, vyR:8,  vyBase:-18, life:0.22, g:80,   sz:1 },
  portal:   { n:10, cols:[25,19,18,16],  vxR:38, vyR:38, vyBase:-28, life:0.75, g:0,    sz:1 },
  hit:      { n:7,  cols:[26,27,7,20],   vxR:55, vyR:55, vyBase:-40, life:0.40, g:90,   sz:1 },
  coin:     { n:6,  cols:[7,20,5,12],    vxR:28, vyR:28, vyBase:-55, life:0.55, g:140,  sz:1 },
  sparkle:  { n:5,  cols:[19,20,17,25],  vxR:14, vyR:14, vyBase:-10, life:0.55, g:0,    sz:1 },
  smoke:    { n:4,  cols:[22,23,24,13],  vxR:10, vyR:6,  vyBase:-22, life:0.90, g:-12,  sz:2 },
  levelup:  { n:16, cols:[7,20,25,17,27],vxR:60, vyR:60, vyBase:-60, life:1.0,  g:30,   sz:1 },
  chest:    { n:12, cols:[7,5,4,20,3],   vxR:40, vyR:40, vyBase:-50, life:0.70, g:120,  sz:1 },
};

function emitBurst(x, y, preset) {
  const p = _BURST_PRESETS[preset];
  if (!p) { console.warn('Unknown particle preset:', preset); return; }
  for (let i = 0; i < p.n; i++) {
    const vx  = (Math.random() - 0.5) * 2 * p.vxR;
    const vy  = p.vyBase + (Math.random() - 0.5) * p.vyR;
    const col = p.cols[Math.floor(Math.random() * p.cols.length)];
    const lf  = p.life * (0.6 + Math.random() * 0.8);
    emitParticle(x, y, vx, vy, lf, col, p.g, p.sz);
  }
}

function updateParticles(delta) {
  for (const p of _particles) {
    if (!p.active) continue;
    p.life -= delta;
    if (p.life <= 0) { p.active = false; continue; }
    p.vy += p.gravity * delta;
    p.x  += p.vx * delta;
    p.y  += p.vy * delta;
  }
}

// Particles are world-space; clip to world region.
function renderParticles() {
  for (const p of _particles) {
    if (!p.active) continue;
    const alpha = Math.max(0, p.life / p.maxLife);
    if (alpha < 0.04) continue;
    const [sx, sy] = camera.toScreen(p.x | 0, p.y | 0);
    const c = paletteRGBA[p.color];
    const s = p.size | 0;
    const x0 = Math.max(0, sx),             x1 = Math.min(LOGICAL_W, sx + s);
    const y0 = Math.max(WORLD_OFFSET_Y, sy), y1 = Math.min(LOGICAL_H, sy + s);
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++)
        blendPixel(px, py, c[0], c[1], c[2], alpha);
  }
}

// ================================================================
// SECTION 22: QUEST / FLAG SYSTEM
// ================================================================
const flags = {};
const _watchers = [];

function setFlag(name, val = true) {
  const prev = flags[name];
  flags[name] = !!val;
  if (val && !prev) _fireWatchers();
}

function clearFlag(name) { flags[name] = false; }
function getFlag(name)   { return !!flags[name]; }
function hasFlags(...names) { return names.every(n => !!flags[n]); }

function onFlags(flagNames, fn, { once = true } = {}) {
  const w = { flagNames, fn, once, fired: false };
  _watchers.push(w);
  if (flagNames.every(n => flags[n])) { w.fired = true; fn(); }
  return w;
}

function _fireWatchers() {
  for (const w of _watchers) {
    if (w.fired && w.once) continue;
    if (w.flagNames.every(n => flags[n])) {
      if (w.once) w.fired = true;
      w.fn();
    }
  }
}

function _resolveNpcDialog(npc) {
  for (const b of (npc.dialogBranches ?? [])) {
    const reqOk = !b.requires || b.requires.every(f => flags[f]);
    const excOk = !b.excludes || !b.excludes.some(f => flags[f]);
    if (reqOk && excOk) return { lines: b.lines ?? npc.dialogLines, branch: b };
  }
  return { lines: npc.dialogLines, branch: null };
}

function _applyDialogBranch(branch) {
  if (!branch) return;
  if (branch.setFlags)   branch.setFlags.forEach(f => setFlag(f));
  if (branch.clearFlags) branch.clearFlags.forEach(f => clearFlag(f));
  if (branch.addCoins)   hud.addCoins(branch.addCoins);
  if (branch.addHp)      hud.addHp(branch.addHp);
  if (branch.emit)       emitBurst(branch.emit.x, branch.emit.y, branch.emit.preset);
  if (branch.runScript)  cutscene.run(branch.runScript);
}

// ================================================================
// SECTION 23: CUTSCENE / SCRIPT SYSTEM
// ================================================================
const cutscene = (() => {
  let _queue    = [];
  let _running  = false;
  let _current  = null;
  let _waitT    = 0;
  let _locked   = false;
  let _moveData = null;

  function run(commands) {
    _queue = [...commands]; _running = true; _current = null;
    _locked = false; _moveData = null;
    _advance();
  }

  function stop() {
    _queue = []; _running = false; _current = null;
    _locked = false; _moveData = null;
  }

  function isRunning()     { return _running; }
  function isInputLocked() { return _locked;  }

  function _advance() {
    if (!_queue.length) { _running = false; _current = null; return; }
    _current = _queue.shift();
    _exec(_current);
  }

  function _exec(cmd) {
    switch (cmd.cmd) {
      case 'wait':       _waitT = cmd.seconds; break;
      case 'dialog':
        dialog.active   = true;
        dialog.name     = (cmd.name ?? '').toUpperCase();
        dialog.lines    = cmd.lines.map(l => l.toUpperCase());
        dialog.page     = 0;
        dialog._branch  = null;
        dialog._onClose = _advance;
        sound.playSFX('dialog');
        break;
      case 'sfx':      sound.playSFX(cmd.name);      _advance(); break;
      case 'bgm':      sound.playBGM(cmd.name);      _advance(); break;
      case 'stopBgm':  sound.stopBGM();               _advance(); break;
      case 'lockInput':_locked = !!cmd.value;         _advance(); break;
      case 'hud':      hud.visible = cmd.show !== false; _advance(); break;
      case 'emit':     emitBurst(cmd.x, cmd.y, cmd.preset); _advance(); break;
      case 'call':     cmd.fn();                      _advance(); break;
      case 'flag':     setFlag(cmd.name, cmd.value ?? true); _advance(); break;
      case 'move': {
        const tf = world.get(cmd.id, 'transform');
        if (!tf) { _advance(); return; }
        _moveData = {
          id:      cmd.id,
          targetX: cmd.tx * TILE_SIZE,
          targetY: cmd.ty * TILE_SIZE,
          speed:   cmd.speed ?? 45,
        };
        world.set(cmd.id, '_scriptMove', true);
        break;
      }
      case 'transition':
        _advance();
        startTransition(cmd.scene, cmd.tx * TILE_SIZE, cmd.ty * TILE_SIZE);
        break;
      default:
        console.warn('[cutscene] unknown cmd:', cmd.cmd);
        _advance();
    }
  }

  function update(delta) {
    if (!_running || !_current) return;
    if (_current.cmd === 'wait') {
      _waitT -= delta;
      if (_waitT <= 0) _advance();
      return;
    }
    if (_current.cmd === 'dialog') return;
    if (_current.cmd === 'move' && _moveData) {
      const md = _moveData;
      const tf = world.get(md.id, 'transform');
      if (!tf) { _moveData = null; world.set(md.id, '_scriptMove', false); _advance(); return; }
      const dx = md.targetX - tf.x, dy = md.targetY - tf.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 2) {
        tf.x = md.targetX; tf.y = md.targetY;
        const vel  = world.get(md.id, 'velocity');
        const anim = world.get(md.id, 'animator');
        if (vel)  { vel.dx = 0; vel.dy = 0; }
        if (anim) animatorPlay(anim, 'idle');
        world.set(md.id, '_scriptMove', false);
        _moveData = null;
        _advance();
      } else {
        const vel  = world.get(md.id, 'velocity');
        const anim = world.get(md.id, 'animator');
        if (vel) { vel.dx = (dx / dist) * md.speed; vel.dy = (dy / dist) * md.speed; }
        if (anim) _applyWalkAnim(anim, dx, dy);
      }
    }
  }

  return { run, stop, isRunning, isInputLocked, update };
})();

// ================================================================
// SECTION 24: CHEST SYSTEM
//
// Chest entities are ECS objects with a 'chest' component:
//   { opened: bool, loot: [{ sprite, type, onPickup }], flagName }
//
// _spawnChestEntity(wx, wy, loot, flagName)
//   Spawns a chest at world coords. loot is an array of loot defs.
//   flagName (optional): set when opened, gates re-spawn on reload.
//
// Loot def: { sprite: 'key_item', type: 'key', onPickup: fn }
//   onPickup(lootDef, chestId) is called when the loot is spawned.
//   Use it to apply effects (hud.addCoins, setFlag, etc.).
//   If omitted, loot is silently spawned as a pickup entity only.
//
// Scene config: add a 'chests' array to any scene definition:
//   chests: [
//     { tileX:5, tileY:8, flagName:'chest_5_8',
//       loot: [{ sprite:'coin_item', type:'coin', onPickup: ()=>hud.addCoins(3) }] }
//   ]
//
// Chest open sequence:
//   1. Sprite swaps to _chest_open
//   2. Loot entities spawn above the chest with upward velocity
//   3. 'chest' preset particle burst fires
//   4. SFX 'chest_open' plays (if registered) else falls back to 'confirm'
//   5. flagName is set if provided
// ================================================================

function _spawnChestEntity(wx, wy, loot, flagName) {
  return world.createEntity({
    transform: { x: wx, y: wy },
    sprite:    { name: '_chest_closed', flipX: false },
    chest:     { opened: false, loot: loot ?? [], flagName: flagName ?? null },
    collider:  true,  // blocks movement
  });
}

// Internal: open a chest by entity id.
function _openChest(id) {
  const chest = world.get(id, 'chest');
  const tf    = world.get(id, 'transform');
  if (!chest || !tf || chest.opened) return;

  chest.opened = true;

  // Swap to open sprite.
  world.set(id, 'sprite', { name: '_chest_open', flipX: false });

  // Remove collider so player can walk over it.
  if (world.has(id, 'collider')) world.set(id, 'collider', false);

  // Particle burst.
  emitBurst(tf.x + 4, tf.y + 4, 'chest');

  // SFX.
  sound.playSFX('chest_open');  // falls back silently if not registered

  // Set flag.
  if (chest.flagName) setFlag(chest.flagName);

  // Spawn loot entities above the chest, drifting upward briefly.
  let lootOffset = 0;
  for (const def of (chest.loot ?? [])) {
    world.createEntity({
      transform: { x: tf.x, y: tf.y - 2 - lootOffset },
      sprite:    { name: def.sprite, flipX: false },
      chestLoot: { vy: -(30 + lootOffset * 10), def },
    });
    lootOffset += 2;
    // Fire onPickup immediately (e.g. add coins, set flags).
    if (def.onPickup) def.onPickup(def, id);
  }

  // Show loot note if any loot has a label.
  const label = chest.loot.find(d => d.label)?.label;
  if (label) showNote(label);
}

// Animates the loot pop-up entities spawned by _openChest.
// Call this from the game loop. Loot entities fade out after ~0.6s.
function sysChestLoot(delta) {
  for (const id of world.query('chestLoot', 'transform')) {
    const cl = world.get(id, 'chestLoot');
    const tf = world.get(id, 'transform');
    cl.vy += 180 * delta;     // gravity pulls back down
    tf.y  += cl.vy * delta;
    cl.timer = (cl.timer ?? 0) + delta;
    if (cl.timer > 0.7) world.destroyEntity(id);
  }
}

// ================================================================
// SECTION 25: MINIMAP
//
// renderMinimap(config?) renders a downsampled top-down map of the
// current scene's collision layer, with a player position dot,
// directly into the framebuffer.
//
// config fields (all optional):
//   corner:     'bottomRight' | 'bottomLeft' | 'topRight' | 'topLeft'
//               Default: 'bottomRight'
//   fixedMapW:  fixed pixel width of the map area (border included).
//   fixedMapH:  fixed pixel height of the map area (border included).
//               When both are set, tilePixels is computed as the largest
//               integer that fits worldCols × worldRows inside the budget.
//               This keeps the minimap the same screen size across scenes
//               of different dimensions. tilePixels is ignored when set.
//               Recommended: set to the smallest scene's natural size.
//               Example (cave = 20×18 @ tilePixels 2):
//                 fixedMapW: 42  (20*2+2)
//                 fixedMapH: 38  (18*2+2)
//   tilePixels: pixels per world tile. Used when fixedMapW/H are absent.
//               Default: 2
//   borderPal:  palette index for border. Default: 21
//   bgPal:      palette index for empty space. Default: 13
//   wallPal:    palette index for solid tiles. Default: 22
//   playerPal:  palette index for player dot. Default: 7
//   cameraPal:  palette index for camera viewport rect. Default: 14
//   margin:     px gap from screen edge. Default: 3
//   showCamera: draw a rect showing the current camera viewport. Default: true
//
// Without fixedMapW/H the total rendered size is:
//   width  = worldCols * tilePixels + 2
//   height = worldRows * tilePixels + 2
// ================================================================
function renderMinimap(config = {}) {
  const {
    corner      = 'bottomRight',
    fixedMapW   = null,
    fixedMapH   = null,
    borderPal   = 21,
    bgPal       = 13,
    wallPal     = 22,
    playerPal   = 7,
    cameraPal   = 14,
    tilePixels  = 2,
    margin      = 3,
    showCamera  = true,
  } = config;

  const col = worldState.layerCollision;
  if (!col) return;
  const wCols = worldState.cols;
  const wRows = worldState.rows;

  // When fixedMapW/H are both provided, derive tilePixels so the world fits
  // inside the budget. mapW/mapH are locked to the fixed dimensions, keeping
  // the minimap the same screen size across scenes of different tile counts.
  let tp, mapW, mapH;
  if (fixedMapW !== null && fixedMapH !== null) {
    tp   = Math.max(1, Math.min(
             Math.floor((fixedMapW - 2) / wCols),
             Math.floor((fixedMapH - 2) / wRows)
           ));
    mapW = fixedMapW;
    mapH = fixedMapH;
  } else {
    tp   = tilePixels;
    mapW = wCols * tp + 2;
    mapH = wRows * tp + 2;
  }

  // Determine top-left corner of the minimap on screen.
  let mx, my;
  switch (corner) {
    case 'bottomLeft':  mx = margin;                   my = LOGICAL_H - mapH - margin;      break;
    case 'topRight':    mx = LOGICAL_W - mapW - margin; my = WORLD_OFFSET_Y + margin;        break;
    case 'topLeft':     mx = margin;                   my = WORLD_OFFSET_Y + margin;         break;
    case 'bottomRight':
    default:            mx = LOGICAL_W - mapW - margin; my = LOGICAL_H - mapH - margin;      break;
  }

  // Border fill.
  fillRectPx(mx, my, mapW, mapH, borderPal);
  // Background.
  fillRectPx(mx + 1, my + 1, mapW - 2, mapH - 2, bgPal);

  // Draw solid tiles directly via _fbSetPixel.
  const [wr, wg, wb] = paletteRGBA[wallPal];
  for (let row = 0; row < wRows; row++) {
    for (let c = 0; c < wCols; c++) {
      if (!col[row]?.[c]) continue;
      const px = mx + 1 + c * tp;
      const py = my + 1 + row * tp;
      for (let dy = 0; dy < tp; dy++) {
        for (let dx = 0; dx < tp; dx++) {
          const bx = px + dx, by = py + dy;
          if (bx < 0 || bx >= LOGICAL_W || by < 0 || by >= LOGICAL_H) continue;
          _fbSetPixel(bx, by, wr, wg, wb);
        }
      }
    }
  }

  // Camera viewport rect (shows visible world area).
  if (showCamera) {
    const [cr, cg, cb] = paletteRGBA[cameraPal];
    const vx0 = mx + 1 + Math.round(camera.x / TILE_SIZE * tp);
    const vy0 = my + 1 + Math.round(camera.y / TILE_SIZE * tp);
    const vx1 = vx0 + Math.round(LOGICAL_W / TILE_SIZE * tp);
    const vy1 = vy0 + Math.round(WORLD_H   / TILE_SIZE * tp);

    // Helper: write one camera-rect border pixel, clipped to map interior.
    const writeCamPx = (bx, by) => {
      if (bx < mx+1 || bx >= mx+mapW-1 || by < my+1 || by >= my+mapH-1) return;
      _fbSetPixel(bx, by, cr, cg, cb);
    };

    // Top and bottom edges.
    for (let x = vx0; x <= vx1; x++) {
      writeCamPx(x, vy0);
      writeCamPx(x, vy1);
    }
    // Left and right edges.
    for (let y = vy0; y <= vy1; y++) {
      writeCamPx(vx0, y);
      writeCamPx(vx1, y);
    }
  }

  // Player dot.
  const ptf = world.get(playerId, 'transform');
  if (ptf) {
    const [pr, pg, pb] = paletteRGBA[playerPal];
    const dotX = mx + 1 + Math.round(ptf.x / TILE_SIZE * tp);
    const dotY = my + 1 + Math.round(ptf.y / TILE_SIZE * tp);
    const dotS = Math.max(1, tp);
    for (let dy = 0; dy < dotS; dy++) {
      for (let dx = 0; dx < dotS; dx++) {
        const bx = dotX + dx, by = dotY + dy;
        if (bx < mx+1 || bx >= mx+mapW-1 || by < my+1 || by >= my+mapH-1) continue;
        _fbSetPixel(bx, by, pr, pg, pb);
      }
    }
  }
}

// ================================================================
// SECTION 26: ENGINE TICK
// Call once per frame with delta. Advances all internal subsystems.
// ================================================================
function engineTick(delta) {
  if (saveNote.timer > 0) saveNote.timer -= delta;
  updateParticles(delta);
  cutscene.update(delta);
  sysAggroTable(delta);   // decay group alerts when no member is in combat
  // Iframe flicker toggle.
  _iframeFlickerTimer += delta;
  if (_iframeFlickerTimer >= IFRAME_FLICKER_INTERVAL) {
    _iframeFlickerTimer -= IFRAME_FLICKER_INTERVAL;
    _iframeFlickerVisible = !_iframeFlickerVisible;
  }
}

// ================================================================
// SECTION 27: DAMAGE SYSTEM
//
// Components:
//   damageable: {
//     hp, maxHp,
//     iframes,     -- invincibility seconds remaining
//     iframeMax,   -- seconds granted per hit  (default 1.5)
//     team,        -- string; hits only cross different teams
//     onHit(vid, attackerId, amount),
//     onDeath(vid, attackerId),
//   }
//   damager: {
//     damage,      -- HP deducted per contact frame
//     team,        -- string; friendly fire skipped
//     knockback,   -- optional px/s horizontal impulse on target velocity
//   }
//
// sysDamage(delta):
//   AABB sweep between all damager / damageable pairs.
//   Skips same-team or iframed targets.
//   Grants iframes and fires callbacks on each hit.
//   Ticks iframes down each call.
//
// Flicker globals (used by sysRender):
//   IFRAME_FLICKER_INTERVAL, _iframeFlickerTimer, _iframeFlickerVisible
// ================================================================

const IFRAME_FLICKER_INTERVAL = 0.08;
let _iframeFlickerTimer   = 0;
let _iframeFlickerVisible = true;

function sysDamage(delta) {
  const damagerIds    = world.query('damager',    'transform');
  const damageableIds = world.query('damageable', 'transform');

  for (const aid of damagerIds) {
    const dmgr = world.get(aid, 'damager');
    if (!dmgr) continue;            // may have been destroyed mid-loop
    const atf  = world.get(aid, 'transform');
    if (!atf) continue;
    const ax0  = atf.x + 1, ay0 = atf.y + 1;
    const ax1  = atf.x + 7, ay1 = atf.y + 7;

    for (const vid of damageableIds) {
      if (vid === aid) continue;
      const dmgable = world.get(vid, 'damageable');
      if (!dmgable) continue;

      // Team filter.
      if (dmgr.team && dmgable.team && dmgr.team === dmgable.team) continue;

      // Invincibility guard.
      if (dmgable.iframes > 0) continue;

      const vtf = world.get(vid, 'transform');
      if (!vtf) continue;           // may have been destroyed mid-loop
      const bx0 = vtf.x + HBX, by0 = vtf.y + HBY;
      const bx1 = bx0 + HBW,   by1 = by0 + HBH;

      if (ax0 >= bx1 || ax1 <= bx0 || ay0 >= by1 || ay1 <= by0) continue;

      // ── Hit confirmed ────────────────────────────────────────
      dmgable.hp = Math.max(0, dmgable.hp - dmgr.damage);
      dmgable.iframes = dmgable.iframeMax ?? 1.5;

      if (dmgr.knockback) {
        const vel = world.get(vid, 'velocity');
        if (vel) vel.dx = (vtf.x >= atf.x ? 1 : -1) * dmgr.knockback;
      }

      if (dmgable.onHit)            dmgable.onHit(vid, aid, dmgr.damage);
      if (dmgable.hp <= 0 && dmgable.onDeath) dmgable.onDeath(vid, aid);

      // Non-piercing projectiles are destroyed on first hit.
      const proj = world.get(aid, 'projectile');
      if (proj && !proj.piercing) { world.destroyEntity(aid); break; }
    }
  }

  // Tick iframes.
  for (const vid of damageableIds) {
    const d = world.get(vid, 'damageable');
    if (d && d.iframes > 0) d.iframes = Math.max(0, d.iframes - delta);
  }
}

// ================================================================
// SECTION 28: COMBAT SYSTEM
//
// Adds melee swings and ranged/spell projectiles as ECS entities.
// Works on top of Section 27 (sysDamage) — swing/projectile entities
// carry 'damager' components and are resolved by sysDamage automatically.
//
// Weapon def (plain object, defined in game code):
//   {
//     type:        'melee' | 'ranged' | 'spell',
//     name:        string,              -- display name for HUD
//     damage:      number,
//     cooldownMax: number,              -- seconds between attacks
//     team:        string,              -- default 'player'
//     knockback:   number,
//     // melee:
//     swingW:      number,              -- hitbox width  px (default 16)
//     swingH:      number,              -- hitbox height px (default 12)
//     swingLife:   number,              -- seconds active  (default 0.12)
//     swingSprite: string | null,       -- optional visual
//     // ranged / spell:
//     projSprite:  string,
//     projSpeed:   number,              -- px/s
//     projLife:    number,              -- max flight seconds
//     piercing:    bool,               -- pass through multiple targets
//   }
//
// spawnAttack(ownerId, weapon, wx, wy, dirX, dirY):
//   Creates a melee swing entity or a projectile entity.
//   dirX/dirY: cardinal direction (-1, 0, or 1).
//
// sysProjectile(delta):
//   Moves all 'projectile' entities. Destroys on world edge or
//   solid-tile collision. (sysDamage handles hits + piercing logic.)
//
// sysSwing(delta):
//   Ticks 'swing' entity lifetime. Destroys on expiry.
// ================================================================

function spawnAttack(ownerId, weapon, wx, wy, dirX, dirY) {
  const cx = wx + TILE_SIZE / 2;
  const cy = wy + TILE_SIZE / 2;
  const team = weapon.team ?? 'player';

  if (weapon.type === 'melee') {
    const sw   = weapon.swingW    ?? TILE_SIZE * 2;
    const sh   = weapon.swingH    ?? TILE_SIZE * 1.5;
    const life = weapon.swingLife ?? 0.12;
    // Centre the hitbox in front of the player.
    const offX = dirX * (TILE_SIZE * 0.75 + sw * 0.25);
    const offY = dirY * (TILE_SIZE * 0.75 + sh * 0.25);
    world.createEntity({
      transform: { x: (cx + offX - sw / 2) | 0, y: (cy + offY - sh / 2) | 0 },
      swing:     { life },
      damager:   { damage: weapon.damage, team, knockback: weapon.knockback ?? 50 },
      ...(weapon.swingSprite ? {
        sprite: { name: weapon.swingSprite, flipX: dirX < 0, flipY: dirY > 0 },
      } : {}),
    });
  } else {
    // ranged / spell
    const speed = weapon.projSpeed ?? 110;
    world.createEntity({
      transform:  { x: (cx - TILE_SIZE / 2) | 0, y: (cy - TILE_SIZE / 2) | 0 },
      projectile: {
        vx:       dirX * speed,
        vy:       dirY * speed,
        life:     weapon.projLife ?? 1.5,
        owner:    ownerId,
        piercing: !!weapon.piercing,
      },
      sprite:  { name: weapon.projSprite, flipX: dirX < 0, flipY: dirY > 0 },
      damager: { damage: weapon.damage, team, knockback: weapon.knockback ?? 30 },
    });
  }
}

// Moves projectiles and destroys them on world-edge or solid-tile impact.
// Damage on entity overlap is handled by sysDamage (which also destroys
// non-piercing projectiles on first hit).
function sysProjectile(delta) {
  for (const id of world.query('projectile', 'transform')) {
    const proj = world.get(id, 'projectile');
    const tf   = world.get(id, 'transform');
    if (!proj || !tf) continue;

    proj.life -= delta;
    if (proj.life <= 0) { world.destroyEntity(id); continue; }

    tf.x += proj.vx * delta;
    tf.y += proj.vy * delta;

    // Destroy on world boundary.
    if (tf.x < 0 || tf.x + TILE_SIZE > worldState.w ||
        tf.y < 0 || tf.y + TILE_SIZE > worldState.h) {
      world.destroyEntity(id); continue;
    }

    // Destroy on solid-tile collision.
    if (collidesAt(tf.x, tf.y)) {
      world.destroyEntity(id); continue;
    }
  }
}

// Ticks melee swing lifetime; destroys on expiry.
function sysSwing(delta) {
  for (const id of world.query('swing')) {
    const sw = world.get(id, 'swing');
    if (!sw) continue;
    sw.life -= delta;
    if (sw.life <= 0) world.destroyEntity(id);
  }
}

// ================================================================
// SECTION 29: ENEMY AI SYSTEM
//
// Four-state machine: idle → patrol → chase → attack.
// Integrates with Section 27 (damageable) and Section 28
// (spawnAttack / sysDamage). Uses _applyWalkAnim, _clampToWorld,
// resolveMove, emitBurst, and animatorPlay from the shared helpers.
//
// enemyAI component (managed internally — do not mutate directly):
//   state          'idle' | 'patrol' | 'chase' | 'attack'
//   alertRange     px radius; entering triggers chase
//   attackRange    px radius; entering triggers attack
//   leashRange     px from homeX/homeY; exceeded aborts chase
//   homeX, homeY   world-space spawn coords (set by spawnEnemy)
//   weapon         weapon def forwarded to spawnAttack
//   attackCooldown seconds until next attack may fire
//   stateTimer     seconds spent in current state (resets on transition)
//   idleDuration   seconds idle before resuming patrol
//   waypoints      [{x,y}] world-space patrol points
//   waypointIdx    current waypoint index
//   lastDirX/Y     last movement direction (for idle facing)
//
// spawnEnemy(def) — factory. def fields:
//   x, y           world-space spawn position        (px, required)
//   sprite         sprite name string OR clips object for createAnimator
//   speed          movement speed px/s               (default 28)
//   alertRange                                        (default 48)
//   attackRange                                        (default 14)
//   leashRange                                         (default 96)
//   idleDuration   seconds idle between patrol legs   (default 1.8)
//   waypoints      [{x,y}] world-space points         (default [])
//   weapon         weapon def overrides               (default melee/claws)
//   hp                                                (default 3)
//   iframeMax      invincibility seconds per hit      (default 0.8)
//   team           damageable team string             (default 'enemy')
//   onHit(id, attackerId, amount)   optional callback
//   onDeath(id, attackerId)         optional callback (fired before destroy)
//
// sysEnemy(delta) — advance all enemyAI entities one tick.
//   Call after sysMovement in your game loop.
//
// State transition diagram:
//
//   idle ──(timeout + waypoints)──► patrol
//    ▲  ◄────────(waypoint reached)──┘  │
//    │                                  │
//    └──────────(leash broken)──────────┤
//    │                                  ▼
//    └──────(player not found)────── chase ──(in range)──► attack
//                                       ◄──(out of range)────┘
//
// Alert SFX: register 'alert' via sound.registerSFX() to play a
// chime when an enemy enters the chase state.
// ================================================================

// Default weapon assigned to enemies that don't specify one.
const _ENEMY_DEFAULT_WEAPON = {
  type:        'melee',
  name:        'Claws',
  damage:      1,
  cooldownMax: 1.2,
  team:        'enemy',
  knockback:   40,
  swingW:      12,
  swingH:      10,
  swingLife:   0.12,
  swingSprite: null,
};

// Build a minimal five-clip animator from a single sprite name.
// Used when spawnEnemy receives a string rather than a clips object.
function _enemyClipsFromSprite(spriteName) {
  const clip = dur => ({ frames: [spriteName], durations: dur });
  return {
    idle:      clip(0.5),
    walk_down: clip(0.18),
    walk_up:   clip(0.18),
    walk_side: clip(0.18),
    attack:    clip(0.10),
  };
}

// Euclidean distance squared between two points.
function _dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

// Snap a continuous direction vector to a single cardinal axis.
// Returns [dirX, dirY] where each component is -1, 0, or 1 and
// exactly one component is non-zero (dominant axis wins; X on tie).
function _toCardinal(dx, dy) {
  if (dx === 0 && dy === 0) return [0, 1];  // default face-down
  return Math.abs(dx) >= Math.abs(dy)
    ? [(dx >= 0 ? 1 : -1), 0]
    : [0, (dy >= 0 ? 1 : -1)];
}

// Internal: change state and reset stateTimer. Fires alert burst/SFX
// on the 'chase' transition so the player gets a visual cue.
// Also writes an aggro-table entry so group-mates can join the chase
// (see Section 32 for the full aggro system).
function _enemyTransition(id, ai, newState) {
  if (ai.state === newState) return;
  ai.state      = newState;
  ai.stateTimer = 0;
  if (newState === 'chase') {
    const tf = world.get(id, 'transform');
    if (tf) emitBurst(tf.x + 4, tf.y - 2, 'sparkle');
    sound.playSFX('alert');   // optional; register via sound.registerSFX()
    // Clear the lost-sight timer so each fresh acquisition starts clean.
    ai.lostSightTimer = 0;
    // Propagate alarm to the enemy's aggro group.
    if (ai.aggroGroup) {
      const alertX = tf ? tf.x : ai.homeX;
      const alertY = tf ? tf.y : ai.homeY;
      _aggroTableAlert(ai.aggroGroup, alertX, alertY);
    }
  }
}

// ── Factory ──────────────────────────────────────────────────────
function spawnEnemy(def) {
  const x    = def.x ?? 0;
  const y    = def.y ?? 0;
  const team = def.team ?? 'enemy';

  // Merge caller's weapon overrides on top of the default. Team always
  // follows the enemy's team string so friendly-fire rules are consistent.
  const weapon = { ..._ENEMY_DEFAULT_WEAPON, ...(def.weapon ?? {}), team };

  const clips = (typeof def.sprite === 'string')
    ? _enemyClipsFromSprite(def.sprite)
    : (def.sprite ?? _enemyClipsFromSprite(null));

  return world.createEntity({
    transform:  { x, y },
    velocity:   { dx: 0, dy: 0, speed: def.speed ?? 28 },
    animator:   createAnimator(clips, 'idle'),
    collider:   true,
    damageable: {
      hp:        def.hp ?? 3,
      maxHp:     def.hp ?? 3,
      iframes:   0,
      iframeMax: def.iframeMax ?? 0.8,
      team,
      onHit: def.onHit ?? null,
      onDeath(vid, aid) {
        const etf = world.get(vid, 'transform');
        if (etf) emitBurst(etf.x + 4, etf.y + 4, 'hit');
        sound.playSFX('hit');
        if (def.onDeath) def.onDeath(vid, aid);
        world.destroyEntity(vid);
      },
    },
    enemyAI: {
      // Start in patrol if waypoints are provided, idle otherwise.
      state:          def.waypoints?.length ? 'patrol' : 'idle',
      alertRange:     def.alertRange  ?? 48,
      attackRange:    def.attackRange ?? 14,
      leashRange:     def.leashRange  ?? 96,
      homeX: x, homeY: y,
      weapon,
      attackCooldown: 0,
      stateTimer:     0,
      kiteRange:      def.kiteRange ?? 0,     // 0 = melee (no kiting)
      idleDuration:   def.idleDuration ?? 1.8,
      waypoints:      def.waypoints ?? [],
      waypointIdx:    0,
      lastDirX:       0,
      lastDirY:       1,                       // face down until first movement
      // Aggro propagation (Section 32).
      // null = not part of any group; alarm broadcast is skipped.
      aggroGroup:       def.aggroGroup       ?? null,
      propagateRadius:  def.propagateRadius  ?? 0,   // 0 = whole-group
      // Line-of-sight gating (Section 33).
      // When true, alertRange only triggers if no solid tile blocks the
      // vector to the player. Set false for open arenas or omniscient
      // enemies (e.g. ghosts). Does not gate aggro-table propagation.
      useLOS:           def.useLOS           ?? true,
      // Lost-sight timer (Section 34).
      // While chasing, if LOS to the player is broken and useLOS is true,
      // this timer counts up. At lostSightMax the enemy aborts to idle.
      // Reset to 0 on every -> chase transition and whenever LOS is clear.
      lostSightTimer:   0,
      lostSightMax:     def.lostSightMax     ?? 2.5,   // seconds
      // Last confirmed world-space player position. Updated each frame
      // the enemy has clear LOS during chase. The enemy pursues this
      // point (not the live player position) while the timer is running.
      lastKnownX:       x,
      lastKnownY:       y,
    },
  });
}

// ── System ───────────────────────────────────────────────────────
// Returns true when the enemy at (tf) can directly see the player (ptf)
// within alertRange, accounting for LOS if ai.useLOS is set.
// ptf may be null; returns false immediately in that case.
// Both sides use sprite-center coords so wall-adjacency doesn't
// produce false negatives in hasLineOfSight.
function _enemyCanSeePlayer(ai, tf, ptf) {
  if (!ptf) return false;
  const ex = tf.x  + TILE_SIZE / 2;
  const ey = tf.y  + TILE_SIZE / 2;
  const px = ptf.x + TILE_SIZE / 2;
  const py = ptf.y + TILE_SIZE / 2;
  const dx = ex - px, dy = ey - py;
  if (dx * dx + dy * dy > ai.alertRange * ai.alertRange) return false;
  return !ai.useLOS || hasLineOfSight(ex, ey, px, py);
}

function sysEnemy(delta) {
  const ptf = world.get(playerId, 'transform');  // null if player not spawned

  for (const id of world.query('enemyAI', 'transform', 'velocity', 'animator')) {
    const ai   = world.get(id, 'enemyAI');
    const tf   = world.get(id, 'transform');
    const vel  = world.get(id, 'velocity');
    const anim = world.get(id, 'animator');
    if (!ai || !tf || !vel || !anim) continue;

    ai.stateTimer    += delta;
    ai.attackCooldown = Math.max(0, ai.attackCooldown - delta);

    // Per-tick measurements.
    const distToHome   = Math.sqrt(_dist2(tf.x, tf.y, ai.homeX, ai.homeY));
    const distToPlayer = ptf
      ? Math.sqrt(_dist2(tf.x, tf.y, ptf.x, ptf.y))
      : Infinity;
    const dxP = ptf ? ptf.x - tf.x : 0;
    const dyP = ptf ? ptf.y - tf.y : 0;

    switch (ai.state) {

      // ── IDLE ──────────────────────────────────────────────────
      // Stand still. After idleDuration, resume patrol if waypoints
      // exist. Immediately chase if the player is spotted (alertRange
      // + optional LOS check) or a group-mate raised the alarm.
      case 'idle': {
        vel.dx = 0; vel.dy = 0;
        animatorPlay(anim, 'idle');
        anim.flipX = ai.lastDirX < 0;

        if (_aggroTableTriggered(ai, tf) || _enemyCanSeePlayer(ai, tf, ptf)) {
          _enemyTransition(id, ai, 'chase');
          break;
        }
        if (ai.waypoints.length && ai.stateTimer >= ai.idleDuration) {
          _enemyTransition(id, ai, 'patrol');
        }
        break;
      }

      // ── PATROL ────────────────────────────────────────────────
      // Walk toward the current waypoint. On arrival, rest briefly
      // (idle) then advance to the next waypoint. Break into chase
      // the moment the player is spotted (LOS-gated) or group alarm
      // fires.
      case 'patrol': {
        if (_aggroTableTriggered(ai, tf) || _enemyCanSeePlayer(ai, tf, ptf)) {
          vel.dx = 0; vel.dy = 0;
          _enemyTransition(id, ai, 'chase');
          break;
        }
        if (!ai.waypoints.length) {
          _enemyTransition(id, ai, 'idle');
          break;
        }

        const wp   = ai.waypoints[ai.waypointIdx];
        const dxW  = wp.x - tf.x;
        const dyW  = wp.y - tf.y;
        const distW = Math.sqrt(dxW * dxW + dyW * dyW);

        if (distW < 3) {
          // Arrived — advance waypoint index, pause at this point.
          ai.waypointIdx = (ai.waypointIdx + 1) % ai.waypoints.length;
          vel.dx = 0; vel.dy = 0;
          _enemyTransition(id, ai, 'idle');
        } else {
          const spd = vel.speed;
          vel.dx = (dxW / distW) * spd;
          vel.dy = (dyW / distW) * spd;
          ai.lastDirX = dxW;
          ai.lastDirY = dyW;
          _applyWalkAnim(anim, dxW, dyW);
        }
        break;
      }

      // ── CHASE ─────────────────────────────────────────────────
      // Pursue the player. Exit conditions (highest to lowest priority):
      //   1. No player entity / leash broken  → idle
      //   2. Lost-sight timer expired         → idle  (Section 34)
      //   3. Player within attackRange        → attack
      //
      // LOS is checked each tick when useLOS is true:
      //   • Clear LOS → update lastKnownX/Y, reset lostSightTimer,
      //                 move toward live player position.
      //   • Broken LOS → tick lostSightTimer, move toward lastKnownX/Y
      //                  (the enemy searches the last seen location).
      //   • useLOS false → always treat as clear; timer never advances.
      case 'chase': {
        const leashBroken = distToHome > ai.leashRange;
        if (!ptf || leashBroken) {
          vel.dx = 0; vel.dy = 0;
          _enemyTransition(id, ai, 'idle');
          break;
        }

        // ── LOS evaluation ────────────────────────────────────
        const ex = tf.x  + TILE_SIZE / 2;
        const ey = tf.y  + TILE_SIZE / 2;
        const px = ptf.x + TILE_SIZE / 2;
        const py = ptf.y + TILE_SIZE / 2;
        const hasLOS = !ai.useLOS || hasLineOfSight(ex, ey, px, py);

        if (hasLOS) {
          // Sight confirmed: refresh last-known position and clear timer.
          ai.lastKnownX   = ptf.x;
          ai.lastKnownY   = ptf.y;
          ai.lostSightTimer = 0;
        } else {
          // Sight broken: count up toward the give-up threshold.
          ai.lostSightTimer += delta;
          if (ai.lostSightTimer >= ai.lostSightMax) {
            vel.dx = 0; vel.dy = 0;
            _enemyTransition(id, ai, 'idle');
            break;
          }
        }

        // ── Attack-range check uses live distance ──────────────
        // Only enter attack if we can actually see the player right now.
        if (hasLOS && distToPlayer <= ai.attackRange) {
          vel.dx = 0; vel.dy = 0;
          _enemyTransition(id, ai, 'attack');
          break;
        }

        // ── Movement target ────────────────────────────────────
        // With LOS: chase the live player position.
        // Without LOS: head toward last known position (search behaviour).
        const targetX  = hasLOS ? ptf.x : ai.lastKnownX;
        const targetY  = hasLOS ? ptf.y : ai.lastKnownY;
        const tdx      = targetX - tf.x;
        const tdy      = targetY - tf.y;
        const tdist    = Math.sqrt(tdx * tdx + tdy * tdy);

        if (tdist < 2) {
          // Reached last-known position without regaining sight.
          // Stand still; the timer will expire on the next few ticks.
          vel.dx = 0; vel.dy = 0;
          animatorPlay(anim, 'idle');
        } else {
          const spd = vel.speed;
          vel.dx = (tdx / tdist) * spd;
          vel.dy = (tdy / tdist) * spd;
          ai.lastDirX = tdx;
          ai.lastDirY = tdy;
          _applyWalkAnim(anim, tdx, tdy);
        }
        break;
      }

      // ── ATTACK ────────────────────────────────────────────────
      // Fire at the player on each cooldown expiry. Movement is
      // determined independently of the fire decision:
      //   • kiteRange > 0 and player inside it  → back away (ranged)
      //   • otherwise                            → stand still (melee)
      // Break back to chase if the player backs past attackRange*2,
      // or to idle if the leash is exceeded.
      case 'attack': {
        const tooFar      = !ptf || distToPlayer > ai.attackRange * 2;
        const leashBroken = distToHome > ai.leashRange;

        if (leashBroken || tooFar) {
          vel.dx = 0; vel.dy = 0;
          _enemyTransition(id, ai, leashBroken || !ptf ? 'idle' : 'chase');
          break;
        }

        // Kite: back away if player has closed inside the safe zone.
        // Ranged enemies set kiteRange > 0; melee enemies leave it at 0.
        if (ai.kiteRange > 0 && distToPlayer < ai.kiteRange) {
          const spd  = vel.speed * 0.7;
          const norm = distToPlayer || 1;
          vel.dx = -(dxP / norm) * spd;
          vel.dy = -(dyP / norm) * spd;
          ai.lastDirX = vel.dx;
          ai.lastDirY = vel.dy;
          _applyWalkAnim(anim, vel.dx, vel.dy);
        } else {
          vel.dx = 0; vel.dy = 0;
        }

        // Fire decision is independent of movement — fires even while kiting.
        if (ai.attackCooldown <= 0) {
          const [dirX, dirY] = _toCardinal(dxP, dyP);
          ai.lastDirX = dxP;
          ai.lastDirY = dyP;
          spawnAttack(id, ai.weapon, tf.x, tf.y, dirX, dirY);
          ai.attackCooldown = ai.weapon.cooldownMax ?? 1.2;
          // Play dedicated attack clip if the sprite set includes one.
          animatorPlay(anim, anim.clips['attack'] ? 'attack' : 'idle');
          anim.flipX = dirX < 0;
        } else {
          // Hold facing toward player while reloading.
          const [dirX] = _toCardinal(dxP, dyP);
          if (vel.dx === 0 && vel.dy === 0) animatorPlay(anim, 'idle');
          anim.flipX = dirX < 0;
        }
        break;
      }
    }
  }
}

// ================================================================
// SECTION 30: RANGED ENEMY VARIANT
//
// spawnRangedEnemy(def) is a thin factory built on top of spawnEnemy.
// It supplies ranged-appropriate defaults and wires a projectile weapon.
// All spawnEnemy fields are accepted and forwarded unchanged; the fields
// below are ranged-specific defaults that spawnEnemy does not set:
//
// Additional / overridden defaults vs spawnEnemy:
//   speed          20         (slower — they want distance, not contact)
//   hp             2          (squishier to compensate for safe range)
//   alertRange     72         (wider — notice the player from farther away)
//   attackRange    56         (fire at distance; enter attack state early)
//   kiteRange      22         (back up when player gets this close)
//   leashRange     120        (wider leash — tracks longer before giving up)
//   idleDuration   2.5
//   weapon         see _ENEMY_RANGED_WEAPON below
//
// Projectile weapon fields (all overridable via def.weapon):
//   type           'ranged'
//   projSprite     def.projSprite  — required; the bullet sprite name
//   projSpeed      90  px/s
//   projLife       2.0 seconds  (auto-destroys after flight budget)
//   damage         1
//   knockback      20
//   cooldownMax    1.8 seconds  (slower fire rate than melee)
//   piercing       false
//
// Sprites:
//   The 'projSprite' field in def (or def.weapon.projSprite) is the
//   sprite name for the projectile entity. Register it via
//   buildSpriteCache() before calling spawnRangedEnemy.
//
// Animator clips:
//   Same five-clip model as spawnEnemy. Pass a clips object as
//   def.sprite to use animated frames; pass a string for a static sheet.
//
// Usage:
//   See the USAGE EXAMPLE block at the end of this section.
// ================================================================

// Default projectile weapon for ranged enemies.
// projSprite is intentionally left null — callers must supply it.
const _ENEMY_RANGED_WEAPON = {
  type:        'ranged',
  name:        'Shot',
  damage:      1,
  cooldownMax: 1.8,
  team:        'enemy',
  knockback:   20,
  projSpeed:   90,
  projLife:    2.0,
  projSprite:  null,
  piercing:    false,
};

function spawnRangedEnemy(def) {
  const projSprite = def.projSprite ?? def.weapon?.projSprite ?? null;
  if (!projSprite) {
    console.warn('[spawnRangedEnemy] projSprite is required. Add def.projSprite or def.weapon.projSprite.');
  }

  // Build the weapon: ranged defaults → caller overrides → projSprite pinned.
  const weapon = {
    ..._ENEMY_RANGED_WEAPON,
    ...(def.weapon ?? {}),
    projSprite,       // always use the resolved value
    team: def.team ?? 'enemy',
  };

  return spawnEnemy({
    // Ranged-appropriate defaults. Any field in def overrides these.
    speed:       20,
    hp:          2,
    alertRange:  72,
    attackRange: 56,
    kiteRange:   22,
    leashRange:  120,
    idleDuration:2.5,

    // Spread the caller's def last so every field is overridable.
    ...def,

    // weapon is rebuilt above so it must be re-applied after the spread.
    weapon,
  });
}

// ================================================================
// USAGE EXAMPLE — ranged enemy setup
// ================================================================
//
// ── 1. Register sprites ──────────────────────────────────────────
//
//   const SPRITES = {
//     // Archer enemy: 8×8 palette-indexed sprite (64 values).
//     archer:      [ /* ... palette indices ... */ ],
//     archer_draw: [ /* ... */ ],   // optional attack-pose frame
//
//     // Arrow projectile sprite.
//     arrow:       [ /* ... */ ],
//   };
//   buildSpriteCache(SPRITES);
//
//
// ── 2. Minimal spawn — static sentinel ──────────────────────────
//
//   spawnRangedEnemy({
//     x: 10 * TILE_SIZE,
//     y:  6 * TILE_SIZE,
//     sprite:     'archer',
//     projSprite: 'arrow',
//   });
//
//   Result: stands still until the player gets within 72px, then
//   backs off if the player closes within 22px, fires every 1.8s.
//
//
// ── 3. Animated sprite with attack pose ─────────────────────────
//
//   spawnRangedEnemy({
//     x: 14 * TILE_SIZE,
//     y:  3 * TILE_SIZE,
//     projSprite: 'arrow',
//     sprite: {                         // clips object instead of string
//       idle:      { frames: ['archer'],            durations: 0.5  },
//       walk_down: { frames: ['archer'],            durations: 0.2  },
//       walk_up:   { frames: ['archer'],            durations: 0.2  },
//       walk_side: { frames: ['archer'],            durations: 0.2  },
//       attack:    { frames: ['archer_draw'],       durations: 0.12 },
//     },
//   });
//
//
// ── 4. Tuned long-range sniper ───────────────────────────────────
//
//   spawnRangedEnemy({
//     x: 18 * TILE_SIZE, y: 9 * TILE_SIZE,
//     sprite:     'mage',
//     projSprite: 'fireball',
//     hp:          4,
//     speed:       14,          // very slow
//     alertRange:  100,         // notices the player early
//     attackRange: 88,          // fires from extreme distance
//     kiteRange:   40,          // keeps more space
//     leashRange:  160,
//     weapon: {
//       damage:      2,
//       cooldownMax: 2.5,       // slow but hard-hitting
//       projSpeed:   70,
//       projLife:    2.8,
//       knockback:   35,
//     },
//   });
//
//
// ── 5. Rapid-fire skirmisher with patrol route ──────────────────
//
//   spawnRangedEnemy({
//     x:    4 * TILE_SIZE, y: 12 * TILE_SIZE,
//     sprite:     'goblin_archer',
//     projSprite: 'small_arrow',
//     speed:       32,          // fast — darts around
//     hp:          1,           // one-shot
//     alertRange:  60,
//     attackRange: 48,
//     kiteRange:   18,
//     waypoints: [
//       { x:  4 * TILE_SIZE, y: 12 * TILE_SIZE },
//       { x: 10 * TILE_SIZE, y: 12 * TILE_SIZE },
//       { x: 10 * TILE_SIZE, y:  8 * TILE_SIZE },
//     ],
//     weapon: {
//       damage:      1,
//       cooldownMax: 0.7,       // rapid-fire
//       projSpeed:   110,
//       projLife:    1.2,
//       knockback:   10,
//     },
//     onDeath: (id) => { hud.addCoins(1); sound.playSFX('coin'); },
//   });
//
//
// ── 6. Mixed enemy group (melee + ranged) ────────────────────────
//
//   // Ground-floor melee guards
//   for (let i = 0; i < 3; i++) {
//     spawnEnemy({
//       x: (4 + i * 3) * TILE_SIZE, y: 10 * TILE_SIZE,
//       sprite: 'guard',
//       speed: 30, hp: 3,
//       waypoints: [
//         { x: (3 + i * 3) * TILE_SIZE, y: 10 * TILE_SIZE },
//         { x: (5 + i * 3) * TILE_SIZE, y: 10 * TILE_SIZE },
//       ],
//     });
//   }
//   // Elevated archer — fires over the melee line
//   spawnRangedEnemy({
//     x: 9 * TILE_SIZE, y: 5 * TILE_SIZE,
//     sprite: 'archer', projSprite: 'arrow',
//     attackRange: 80, kiteRange: 0,  // stationary; no kiting (on a ledge)
//   });
//
//
// ── 7. Game-loop integration ─────────────────────────────────────
//
//   function gameLoop(delta) {
//     input.update();
//     sysInput();
//     sysAI(delta);        // patrol NPCs
//     sysEnemy(delta);     // enemy state machines  ← add this
//     sysMovement(delta);
//     sysSwing(delta);
//     sysProjectile(delta);
//     sysDamage(delta);
//     sysChestLoot(delta);
//     sysAnimation(delta);
//     sysSpatialHash();
//     sysCamera();
//     sysSceneTransition();
//     engineTick(delta);
//
//     clearBuffer(0);
//     drawTilemap(worldState.layerBG, elapsed);
//     sysRender();
//     drawTilemap(worldState.layerObjects, elapsed);
//     renderParticles();
//     sysDialog(delta);
//     renderDialog(elapsed);
//     renderHUD();
//     renderSaveNote();
//     renderTransitionOverlay();
//     flushBuffer();
//   }
// ================================================================

// ================================================================
// SECTION 31: ENEMY SPAWNER SYSTEM
//
// A spawner is a pure logic ECS entity — no transform, collider, or
// sprite. It monitors the live enemy it owns and restarts it on a
// timer after death, provided a flagName guard has not been set.
//
// ── spawner component (managed internally) ──────────────────────
//   def           Full enemy def forwarded to spawnEnemy /
//                 spawnRangedEnemy. Captured at createSpawner time.
//   type          'melee' | 'ranged'  (selects factory function)
//   flagName      string | null.
//                 When non-null: if flags[flagName] is truthy the
//                 spawner never restarts — the enemy is permanently
//                 dead. Set this flag externally (cutscene, onDeath
//                 callback, boss logic) to disable the spawner.
//   respawnDelay  Seconds from death to next spawn.   Default: 8
//   timer         null  → enemy is currently alive (or never spawned)
//                 ≥ 0   → countdown running (seconds remaining)
//   preSpawnFired Whether the pre-spawn effect has already fired this
//                 cycle. Prevents the burst repeating every tick.
//   enemyId       ECS id of the current live enemy. -1 = none.
//
// ── createSpawner(def, options) ─────────────────────────────────
//   Factory. Immediately spawns the first enemy (unless its flagName
//   is already set, in which case the spawner entity is returned with
//   timer = null and enemyId = -1).
//
//   options fields (all optional):
//     type          'melee' | 'ranged'            Default: 'melee'
//     flagName      Permanent-kill flag name.      Default: null
//     respawnDelay  Seconds until respawn.         Default: 8
//
// ── spawnSceneEnemies(scene) ────────────────────────────────────
//   Reads scene.enemies array and calls createSpawner for each entry.
//   Skips enemies whose flagName is already set (permanent kills
//   from a previous play session survive across scene reloads).
//
//   scene.enemies entry shape (extends all spawnEnemy fields):
//     type          'melee' | 'ranged'
//     tileX, tileY  Spawn tile (converted to px internally)
//     flagName      Permanent-kill guard (optional)
//     respawnDelay  (optional)
//     ...           All other spawnEnemy / spawnRangedEnemy fields
//
// ── sysSpawner(delta) ───────────────────────────────────────────
//   Advance all spawner entities one tick. Call once per frame,
//   after sysDamage so death detection is never one frame behind.
//
//   Each tick per spawner:
//     1. If flagName is set → skip (permanent kill).
//     2. If timer === null (enemy should be alive):
//          poll world.has(enemyId, 'transform').
//          If entity gone → start countdown: timer = respawnDelay.
//     3. If timer > 0 → tick down by delta.
//          When timer passes PRE_SPAWN_WARN threshold → emit portal
//          burst at the spawn point as a player warning.
//     4. When timer <= 0:
//          Re-check flagName. If still unset → spawn new enemy,
//          record its id, reset timer to null.
//
// PRE_SPAWN_WARN: seconds before respawn at which the portal burst
// fires. Default 0.4. Set to 0 to disable the effect.
//
// ── Permanent kill pattern ──────────────────────────────────────
//   spawnEnemy / spawnRangedEnemy def.onDeath is the right place to
//   set the flag when you want a "one permanent kill" scenario:
//
//     createSpawner({
//       tileX: 8, tileY: 5,
//       sprite: 'skeleton',
//       onDeath: (vid) => {
//         setFlag('skeleton_boss_dead');   // disables this spawner
//         sound.playSFX('boss_down');
//       },
//     }, { flagName: 'skeleton_boss_dead', respawnDelay: 0 });
//
// ── Always-respawn pattern (no permanent kill) ──────────────────
//   createSpawner({ tileX: 3, tileY: 7, sprite: 'slime' },
//                 { respawnDelay: 6 });
// ================================================================

const PRE_SPAWN_WARN = 0.4;   // seconds before spawn; set 0 to disable

// ── Internal helpers ─────────────────────────────────────────────

// Resolve the correct factory based on type string.
function _spawnerFactory(type) {
  return type === 'ranged' ? spawnRangedEnemy : spawnEnemy;
}

// Translate tileX/tileY in a def to pixel coords. Returns a new
// object so the stored def is never mutated.
function _resolveSpawnerDef(def) {
  if (def.tileX === undefined && def.tileY === undefined) return def;
  return {
    ...def,
    x: (def.tileX ?? 0) * TILE_SIZE,
    y: (def.tileY ?? 0) * TILE_SIZE,
  };
}

// Fire the pre-spawn warning burst at the spawn point.
function _preSpawnEffect(def) {
  const x = def.x ?? 0;
  const y = def.y ?? 0;
  emitBurst(x + 4, y + 4, 'portal');
  sound.playSFX('portal');   // optional; register via sound.registerSFX()
}

// ── Factory ──────────────────────────────────────────────────────
function createSpawner(def, options = {}) {
  const type         = options.type         ?? 'melee';
  const flagName     = options.flagName     ?? null;
  const respawnDelay = options.respawnDelay ?? 8;

  const resolvedDef = _resolveSpawnerDef(def);

  // Build the spawner component first so the entity exists before the
  // first enemy is spawned (the enemy's onDeath can reference it).
  const spawnerComp = {
    def:           resolvedDef,
    type,
    flagName,
    respawnDelay,
    timer:         null,   // null = live enemy exists (or will after spawn)
    preSpawnFired: false,
    enemyId:       -1,
  };

  const sid = world.createEntity({ spawner: spawnerComp });

  // Spawn the first enemy immediately, unless permanently dead.
  if (!flagName || !getFlag(flagName)) {
    spawnerComp.enemyId = _spawnerFactory(type)(resolvedDef);
  }

  return sid;
}

// ── Scene integration ─────────────────────────────────────────────
// Reads scene.enemies and creates spawners for each entry.
// Entries whose flagName is already true are skipped entirely —
// no spawner entity is created, mirroring the chest pattern.
function spawnSceneEnemies(scene) {
  for (const def of (scene.enemies || [])) {
    if (def.flagName && getFlag(def.flagName)) continue;
    createSpawner(def, {
      type:         def.type         ?? 'melee',
      flagName:     def.flagName     ?? null,
      respawnDelay: def.respawnDelay ?? 8,
    });
  }
}

// ── System ───────────────────────────────────────────────────────
function sysSpawner(delta) {
  for (const sid of world.query('spawner')) {
    const sp = world.get(sid, 'spawner');
    if (!sp) continue;

    // Permanent-kill guard: flag set externally → this spawner is
    // retired for the session. No further processing needed.
    if (sp.flagName && getFlag(sp.flagName)) continue;

    // ── Phase 1: detect death ──────────────────────────────────
    // timer === null means we expect a live enemy.
    // If the entity no longer exists in the ECS store, start countdown.
    if (sp.timer === null) {
      if (sp.enemyId === -1 || !world.has(sp.enemyId, 'transform')) {
        sp.enemyId      = -1;
        sp.timer        = sp.respawnDelay;
        sp.preSpawnFired = false;
      }
      // Enemy is still alive — nothing to do this tick.
      continue;
    }

    // ── Phase 2: tick countdown ────────────────────────────────
    sp.timer -= delta;

    // Pre-spawn warning effect (fires once per cycle).
    if (!sp.preSpawnFired && sp.timer <= PRE_SPAWN_WARN) {
      sp.preSpawnFired = true;
      if (PRE_SPAWN_WARN > 0) _preSpawnEffect(sp.def);
    }

    // ── Phase 3: respawn ───────────────────────────────────────
    if (sp.timer <= 0) {
      // Re-check flag: it may have been set during the countdown
      // (e.g. a cutscene ran while the enemy was dead).
      if (sp.flagName && getFlag(sp.flagName)) {
        sp.timer = null;
        continue;
      }
      sp.enemyId      = _spawnerFactory(sp.type)(sp.def);
      sp.timer        = null;
      sp.preSpawnFired = false;
    }
  }
}

// ================================================================
// SECTION 32: AGGRO TABLE — GROUP ALARM PROPAGATION
//
// Allows a group of enemies to share alert state. When any one
// member enters 'chase', every idle/patrolling member in the same
// group within propagateRadius (or any distance if radius = 0)
// also transitions to 'chase' on their next tick.
//
// ── Data model ──────────────────────────────────────────────────
//
//   aggroTable  Map<groupName, AggroEntry>
//
//   AggroEntry {
//     ttl      Seconds of alarm remaining. Decays only when no
//              member is currently in 'chase' or 'attack' state.
//              Refreshed to AGGRO_TTL_DEFAULT each time a new alert
//              is written to the group.
//     alertX   World-space X where the alarm originated.
//     alertY   World-space Y where the alarm originated.
//   }
//
// ── Alarm lifecycle ─────────────────────────────────────────────
//
//   1. Enemy enters 'chase'
//        _enemyTransition calls _aggroTableAlert(group, x, y)
//        → entry created / TTL refreshed; alertX/Y recorded.
//
//   2. Each tick — sysEnemy reads alert for idle/patrol enemies:
//        _aggroTableTriggered(ai, tf) → bool
//        Returns true when:
//          • entry exists for ai.aggroGroup
//          • propagateRadius === 0
//            OR  dist(tf, alertX/Y) ≤ propagateRadius
//        Triggering an enemy calls _enemyTransition(id,ai,'chase'),
//        which in turn calls _aggroTableAlert again — cascading the
//        alarm to the newly alerted enemy's own group record.
//
//   3. TTL decay — sysAggroTable(delta):
//        For each active entry, check whether ANY member of that
//        group is in 'chase' or 'attack'. If at least one is, the
//        alarm is kept alive (TTL is NOT decremented). Once all
//        members have disengaged (leash broken → idle), the TTL
//        counts down to zero and the entry is deleted.
//        This means: the alarm stays hot as long as any group member
//        is still fighting. Only after the last pursuer gives up
//        does the clock run down.
//
// ── TTL constants ───────────────────────────────────────────────
//
//   AGGRO_TTL_DEFAULT   Seconds granted per alert write.   Default 15
//   AGGRO_TTL_MIN       Floor; alert never expires below this while
//                       any group member is in combat.      Default  0
//
// ── Public API ──────────────────────────────────────────────────
//
//   alertGroup(groupName, x, y)
//     Manually raise the alarm on a group from any game code.
//     x/y are the world-space origin of the alert.
//     Useful for: trap triggers, scripted events, boss phase starts.
//
//   clearAggroGroup(groupName)
//     Immediately delete a group's alert entry. Enemies already
//     in 'chase' are unaffected (they remain chasing). Only
//     idle/patrolling members that haven't transitioned yet will
//     no longer be triggered.
//
//   aggroTableActive(groupName) → bool
//     Returns true if the group currently has a live alarm entry.
//     Useful for HUD indicators, cutscene conditions, etc.
//
// ── Enemy fields (set via spawnEnemy def) ───────────────────────
//
//   aggroGroup        string — group name; null = not in any group
//   propagateRadius   px radius from alertX/Y within which this
//                     enemy will react. 0 = react regardless of
//                     distance (whole-group broadcast).
//
// ── Usage examples ──────────────────────────────────────────────
//   See USAGE block at end of this section.
// ================================================================

const AGGRO_TTL_DEFAULT = 15;   // seconds before alarm fades after combat
const AGGRO_TTL_MIN     = 0;

// aggroTable: Map<groupName string → { ttl, alertX, alertY }>
const aggroTable = new Map();

// ── Internal helpers ─────────────────────────────────────────────

// Write or refresh an alert entry. Called by _enemyTransition and
// the public alertGroup() API.
function _aggroTableAlert(groupName, alertX, alertY) {
  const existing = aggroTable.get(groupName);
  if (existing) {
    // Refresh TTL; keep origin at the most recent alerter position.
    existing.ttl    = AGGRO_TTL_DEFAULT;
    existing.alertX = alertX;
    existing.alertY = alertY;
  } else {
    aggroTable.set(groupName, { ttl: AGGRO_TTL_DEFAULT, alertX, alertY });
  }
}

// Check whether a given enemy (ai component + transform) should be
// woken by a live group alarm. Returns false immediately if the
// enemy has no aggroGroup or no alarm exists for the group.
function _aggroTableTriggered(ai, tf) {
  if (!ai.aggroGroup) return false;
  const entry = aggroTable.get(ai.aggroGroup);
  if (!entry) return false;
  // Unconditional broadcast when propagateRadius is 0.
  if (!ai.propagateRadius) return true;
  // Proximity check: react only if inside the propagate radius.
  const dx = tf.x - entry.alertX;
  const dy = tf.y - entry.alertY;
  return (dx * dx + dy * dy) <= ai.propagateRadius * ai.propagateRadius;
}

// ── TTL decay system ─────────────────────────────────────────────

// Called from engineTick. Decays alerts whose group has no active
// combatants. Deletes entries that reach zero.
function sysAggroTable(delta) {
  if (!aggroTable.size) return;

  // Build a set of groups that have at least one enemy still in
  // 'chase' or 'attack'. These groups keep their TTL frozen.
  const hotGroups = new Set();
  for (const id of world.query('enemyAI')) {
    const ai = world.get(id, 'enemyAI');
    if (ai?.aggroGroup && (ai.state === 'chase' || ai.state === 'attack')) {
      hotGroups.add(ai.aggroGroup);
    }
  }

  // Tick every entry. Hot groups are untouched; cold groups decay.
  for (const [group, entry] of aggroTable) {
    if (hotGroups.has(group)) continue;    // combat still active — hold
    entry.ttl -= delta;
    if (entry.ttl <= AGGRO_TTL_MIN) aggroTable.delete(group);
  }
}

// ── Public API ───────────────────────────────────────────────────

// Manually raise the alarm on a named group. Useful for scripted
// triggers, traps, and cutscene events.
function alertGroup(groupName, x = 0, y = 0) {
  _aggroTableAlert(groupName, x, y);
}

// Immediately remove a group's alarm entry. Enemies already chasing
// continue to chase; only idle/patrolling members are unaffected.
function clearAggroGroup(groupName) {
  aggroTable.delete(groupName);
}

// Returns true if a live alarm entry exists for the group.
function aggroTableActive(groupName) {
  return aggroTable.has(groupName);
}

// ================================================================
// USAGE EXAMPLES
// ================================================================
//
// ── 1. Basic patrol room — alarm spreads to all guards ──────────
//
//   // All three guards share the 'throne_room' group.
//   // No propagateRadius → whole-group broadcast.
//   spawnEnemy({ x:  4*T, y: 8*T, sprite:'guard', aggroGroup:'throne_room',
//     waypoints:[{x:3*T,y:8*T},{x:7*T,y:8*T}] });
//   spawnEnemy({ x:  8*T, y: 8*T, sprite:'guard', aggroGroup:'throne_room' });
//   spawnEnemy({ x: 12*T, y: 8*T, sprite:'guard', aggroGroup:'throne_room' });
//
//   // The moment the player enters alertRange of any one guard,
//   // all three immediately switch to 'chase' on the next tick.
//
//
// ── 2. Proximity-scoped alarm — only nearby guards react ─────────
//
//   // Guards use propagateRadius:48. An alarm raised in the east
//   // wing won't wake guards posted at the west gate.
//   spawnEnemy({ x:  2*T, y: 6*T, sprite:'guard', aggroGroup:'castle',
//     propagateRadius: 48 });
//   spawnEnemy({ x: 14*T, y: 6*T, sprite:'guard', aggroGroup:'castle',
//     propagateRadius: 48 });
//   // These two are 96px apart. Alerting one will NOT wake the other
//   // because the alertee is outside the 48px radius.
//
//
// ── 3. Mixed melee + ranged group ───────────────────────────────
//
//   spawnEnemy({
//     x: 6*T, y: 5*T, sprite:'orc', aggroGroup:'dungeon_squad' });
//   spawnRangedEnemy({
//     x: 9*T, y: 5*T, sprite:'archer', projSprite:'arrow',
//     aggroGroup:'dungeon_squad' });
//   // Alarming the melee orc also wakes the ranged archer.
//   // Both types read from the same aggroTable entry.
//
//
// ── 4. Scene config — enemies array ─────────────────────────────
//
//   enemies: [
//     { type:'melee',  tileX:5, tileY:8, sprite:'guard',
//       aggroGroup:'barracks', respawnDelay:10 },
//     { type:'melee',  tileX:8, tileY:8, sprite:'guard',
//       aggroGroup:'barracks', respawnDelay:10 },
//     { type:'ranged', tileX:10, tileY:5, sprite:'archer',
//       projSprite:'arrow', aggroGroup:'barracks',
//       propagateRadius:64, respawnDelay:12 },
//   ]
//   // Respawned enemies re-register with the same aggroGroup
//   // automatically because createSpawner re-calls spawnEnemy
//   // with the original def.
//
//
// ── 5. Trap trigger — script raises alarm manually ───────────────
//
//   // In a cutscene or collision callback:
//   alertGroup('dungeon_squad', playerTf.x, playerTf.y);
//   // All 'dungeon_squad' members react immediately, centred on
//   // the player's position (respects propagateRadius if set).
//
//
// ── 6. Boss phase — alarm entire floor on phase 2 ────────────────
//
//   spawnEnemy({
//     x: 10*T, y: 9*T, sprite:'boss',
//     hp: 20, team:'boss',
//     onHit(id, _aid, _amt) {
//       const ai = world.get(id, 'enemyAI');
//       const tf = world.get(id, 'transform');
//       // Phase 2: below 50% HP, wake all floor guards.
//       if (ai && tf && world.get(id,'damageable').hp <= 10) {
//         alertGroup('floor_guards', tf.x, tf.y);
//       }
//     },
//   });
//
//
// ── 7. Conditional HUD indicator ────────────────────────────────
//
//   function renderAlertBar() {
//     if (!aggroTableActive('throne_room')) return;
//     fillRectPx(70, 1, 20, 3, 26);          // red bar in HUD
//     drawText('!', 72, 2, 7);
//   }
//
//
// ── 8. Alarm clears after combat ends ───────────────────────────
//
//   // No manual intervention needed. Once every 'throne_room' enemy
//   // has leash-broken back to idle, sysAggroTable decays the entry
//   // over AGGRO_TTL_DEFAULT (15) seconds and deletes it.
//   // New idle/patrolling enemies spawned after that point won't be
//   // auto-alerted until the next direct player sighting.
//
//
// ── 9. Game-loop integration ─────────────────────────────────────
//
//   function gameLoop(delta) {
//     input.update();
//     sysInput();
//     sysAI(delta);
//     sysEnemy(delta);        // reads + writes aggroTable
//     sysMovement(delta);
//     sysSwing(delta);
//     sysProjectile(delta);
//     sysDamage(delta);
//     sysSpawner(delta);
//     sysChestLoot(delta);
//     sysAnimation(delta);
//     sysSpatialHash();
//     sysCamera();
//     sysSceneTransition();
//     engineTick(delta);      // sysAggroTable(delta) called inside
//     // ... render pass ...
//   }
// ================================================================

// ================================================================
// SECTION 33: LINE-OF-SIGHT SYSTEM
//
// hasLineOfSight(ax, ay, bx, by) — defined in Section 11 (Collision)
// alongside isSolid() and collidesAt(), which it reuses directly.
//
// _enemyCanSeePlayer(ai, tf, ptf) — defined just above sysEnemy.
// Combines distance (alertRange) and optional LOS into a single
// named predicate used by sysEnemy's idle and patrol states.
//
// ── Algorithm ───────────────────────────────────────────────────
//
// Integer Bresenham tile-walk. Converts pixel coordinates to tile
// indices, then steps from the source tile to the destination tile,
// sampling isSolid() at each step.
//
//   O(max(|Δtx|, |Δty|)) — at most ~(alertRange / TILE_SIZE) steps
//   per LOS query. At alertRange=48 and TILE_SIZE=8 that is ≤ 6
//   isSolid() calls per frame per enemy, each an O(1) array lookup.
//
// ── Design choices ──────────────────────────────────────────────
//
//   Sprite-center eye points (x + TILE_SIZE/2)
//     Raw top-left coords cause false negatives when an entity stands
//     flush against a wall. Centers are always inside the open tile
//     the entity occupies.
//
//   Both endpoint tiles are checked
//     If the enemy or the player is inside a solid tile (edge case:
//     spawned in a corner pocket), hasLineOfSight returns false
//     rather than reporting a phantom sighting.
//
//   LOS gates alertRange only — not the aggro table
//     A group-mate's alarm is a social signal, not a visual one.
//     Propagated alerts bypass LOS intentionally. See Section 32.
//
//   LOS does not affect the chase or attack states
//     Once an enemy has acquired the player it continues to chase
//     through corridors and around corners. Add a "lost-sight" timer
//     to the chase state if re-occlusion retreat is needed.
//
//   useLOS defaults to true; set false per-enemy to disable
//     Use false for: open arenas (no walls to occlude), omniscient
//     enemies (sentinels, magic constructs), boss phases where the
//     enemy is globally aware.
//
// ── enemyAI fields added by this section ────────────────────────
//
//   useLOS   bool   Default: true
//     When false, alertRange triggers purely on distance —
//     identical to behaviour before this section was added.
//     Safe to omit; existing spawnEnemy calls are unaffected.
//
// ── Public API ──────────────────────────────────────────────────
//
//   hasLineOfSight(ax, ay, bx, by) → bool
//     General-purpose query. Accepts any two world-space pixel
//     coordinates. Not limited to enemy–player pairs; usable for
//     projectile feasibility checks, patrol route validation,
//     scripted trigger visibility, HUD fog-of-war, etc.
//
// ── Performance notes ────────────────────────────────────────────
//
//   A scene with 20 enemies, alertRange 48, TILE_SIZE 8 costs at
//   most 20 × 6 = 120 isSolid() calls per frame — each is a single
//   bounds-check + array index. Negligible next to sysRender.
//
//   If per-frame cost matters for very large enemy counts, cache the
//   LOS result for N frames using a per-entity losCacheTimer:
//     if (ai.losCacheTimer > 0) { ai.losCacheTimer -= delta; }
//     else { ai.losCache = hasLineOfSight(...); ai.losCacheTimer = 0.1; }
//   A 100ms cache reduces calls by 6× at 60 fps with no perceptible
//   latency at typical enemy speeds.
//
// ── Usage examples ───────────────────────────────────────────────
//
//   // 1. Default — LOS enabled, enemy hides behind walls
//   spawnEnemy({ x: 6*T, y: 4*T, sprite: 'guard' });
//
//   // 2. Omniscient sentinel — no LOS gate
//   spawnEnemy({ x: 10*T, y: 8*T, sprite: 'eye', useLOS: false,
//     alertRange: 120 });
//
//   // 3. Ranged enemy still uses LOS for initial spot
//   spawnRangedEnemy({ x: 14*T, y: 3*T, sprite: 'archer',
//     projSprite: 'arrow', useLOS: true, alertRange: 72 });
//
//   // 4. General-purpose query — check before a scripted shot
//   if (hasLineOfSight(
//       npcTf.x + TILE_SIZE/2, npcTf.y + TILE_SIZE/2,
//       playerTf.x + TILE_SIZE/2, playerTf.y + TILE_SIZE/2)) {
//     sound.playSFX('sniper_shot');
//     spawnAttack(npcId, sniperWeapon, npcTf.x, npcTf.y, 1, 0);
//   }
//
//   // 5. Scene config — mix of LOS and non-LOS enemies
//   enemies: [
//     { tileX:5, tileY:8, sprite:'guard',    useLOS:true  },
//     { tileX:9, tileY:4, sprite:'watcher',  useLOS:false, alertRange:96 },
//   ]
//
//   // 6. LOS result cache (manual, for large rooms)
//   //    Add to enemyAI: losCache: false, losCacheTimer: 0
//   //    In your own sysEnemy wrapper or onHit handler:
//   if (ai.losCacheTimer <= 0) {
//     const ex = tf.x + TILE_SIZE/2, ey = tf.y + TILE_SIZE/2;
//     const px = ptf.x + TILE_SIZE/2, py = ptf.y + TILE_SIZE/2;
//     ai.losCache = hasLineOfSight(ex, ey, px, py);
//     ai.losCacheTimer = 0.1;
//   }
//   ai.losCacheTimer -= delta;
// ================================================================

// ================================================================
// SECTION 34: LOST-SIGHT TIMER
//
// Extends the chase state (Section 29) so enemies give up pursuit
// when they cannot re-establish line-of-sight within lostSightMax
// seconds. Enemies without LOS gating (useLOS: false) are unaffected.
//
// ── Behaviour overview ──────────────────────────────────────────
//
//   CHASE state, each tick:
//
//     has LOS → lastKnownX/Y updated, lostSightTimer reset to 0,
//               enemy moves toward live player.
//
//     no LOS  → lostSightTimer += delta.
//               Enemy moves toward lastKnownX/Y (search behaviour).
//               Reaches that tile → stops and waits (timer still ticks).
//               lostSightTimer >= lostSightMax → _enemyTransition(idle).
//
//     useLOS: false → always treated as "has LOS"; timer never advances.
//
//   The attack-range check is gated on live LOS: an enemy that has
//   backed into melee range behind a wall cannot fire.
//
// ── New enemyAI fields ───────────────────────────────────────────
//
//   lostSightTimer   float, managed internally.
//                    Seconds since LOS was last clear. Reset to 0
//                    each time sight is confirmed and on every
//                    → chase transition (Section 32 / _enemyTransition).
//
//   lostSightMax     float. Default 2.5.
//                    Seconds of uninterrupted LOS absence before the
//                    enemy aborts to idle. Set to 0 to abort immediately
//                    on any occlusion (instant give-up). Set high (e.g.
//                    30) to approximate persistent tracking behaviour.
//
//   lastKnownX/Y     float, managed internally.
//                    World-space pixel position where the player was
//                    last seen with clear LOS. Initialised to the
//                    enemy's spawn point and updated every tick the
//                    enemy has clear sight during chase.
//
// ── Interaction with other systems ──────────────────────────────
//
//   Aggro table (Section 32):
//     A propagated alarm wakes the enemy (idle → chase) but does not
//     provide a lastKnownX/Y. The enemy inherits the alertX/Y of the
//     group entry as a rough search target only on the first tick
//     they spot the player directly. Until then lastKnownX/Y stays
//     at the spawn point, which may cause a brief hesitation — this
//     is intentional: alerted enemies move toward the alarm source,
//     not the player directly, until they establish their own LOS.
//     If immediate convergence on the alarm point is desired, set
//     lastKnownX/Y from the aggroTable entry after createSpawner.
//
//   Leash (leashRange):
//     Leash-broken abort still takes priority over lost-sight abort.
//     Both transitions lead to idle; leash is checked first so
//     homeward drift is predictable regardless of sight status.
//
//   Spawner respawn (Section 31):
//     Spawner resets the full enemyAI component, so lostSightTimer,
//     lastKnownX/Y, and stateTimer all start clean on each respawn.
//
// ── Configuration guide ──────────────────────────────────────────
//
//   lostSightMax: 0        Abort immediately on any occlusion.
//                          Effective "dumb AI" — trivially escaped
//                          by stepping behind a pillar.
//
//   lostSightMax: 1.5      Realistic guard. Checks the corner, gives
//                          up quickly. Suits busy rooms with many
//                          short sightlines.
//
//   lostSightMax: 2.5      Default. Enough time to run around one
//                          corner before losing the enemy.
//
//   lostSightMax: 5.0      Tenacious tracker. Will search several
//                          tiles before giving up. Suits mini-bosses
//                          or elite enemies.
//
//   lostSightMax: 9999     Effectively never gives up. Combine with
//                          leashRange for a persistent pursuer that
//                          stops at its territory boundary.
//
// ── Usage examples ───────────────────────────────────────────────
//
//   // 1. Default — loses sight after 2.5s
//   spawnEnemy({ x: 6*T, y: 4*T, sprite: 'guard' });
//
//   // 2. Dumb guard — instant give-up on occlusion
//   spawnEnemy({ x: 8*T, y: 6*T, sprite: 'guard',
//     lostSightMax: 0 });
//
//   // 3. Elite tracker — searches for 5 seconds
//   spawnEnemy({ x: 10*T, y: 3*T, sprite: 'knight',
//     hp: 8, speed: 35, lostSightMax: 5.0 });
//
//   // 4. Persistent pursuer bounded by leash
//   spawnEnemy({ x: 12*T, y: 8*T, sprite: 'hound',
//     speed: 45, leashRange: 80, lostSightMax: 9999 });
//
//   // 5. Omniscient sentinel — LOS and timer both disabled
//   spawnEnemy({ x: 14*T, y: 5*T, sprite: 'golem',
//     useLOS: false, alertRange: 120 });
//     // useLOS: false means lostSightTimer never advances.
//
//   // 6. Ranged archer — gives up if player hides mid-combat
//   spawnRangedEnemy({ x: 16*T, y: 2*T, sprite: 'archer',
//     projSprite: 'arrow', lostSightMax: 3.0,
//     alertRange: 72, attackRange: 56 });
//
//   // 7. Scene config — set lostSightMax per entry
//   enemies: [
//     { tileX:5, tileY:8, sprite:'guard',  lostSightMax: 2.0 },
//     { tileX:9, tileY:4, sprite:'knight', lostSightMax: 5.0,
//       hp: 6, speed: 32 },
//   ]
//
//   // 8. Read timer from game code (e.g. for a debug overlay)
//   const ai = world.get(enemyId, 'enemyAI');
//   if (ai && ai.state === 'chase' && ai.lostSightTimer > 0) {
//     const pct = ai.lostSightTimer / ai.lostSightMax;  // 0..1
//     drawText(`?`, screenX, screenY - 10, pct > 0.5 ? 26 : 7);
//   }
// ================================================================
