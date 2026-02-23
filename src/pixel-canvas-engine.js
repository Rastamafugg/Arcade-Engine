'use strict';
// ================================================================
// PIXEL CANVAS ENGINE v5 — pixel-canvas-engine.js
//
// Self-contained vanilla JS engine for 8×8 tile-based games.
// Zero dependencies. Load before any game script.
//
// NEW IN v5:
//   Section 20 — HUD: hearts, coins, item slots (framebuffer-rendered)
//   Section 21 — Particles: pooled, world-space, alpha-blended fadeout
//   Section 22 — Flags: named booleans, watchers, conditional NPC dialog
//   Section 23 — Cutscene: sequenced commands (dialog/move/sfx/flag/wait)
//
// Game script responsibilities:
//   1. buildSpriteCache(SPRITES)       — after defining your sprites
//   2. registerScenes(SCENES)          — before loadScene()
//   3. sound.registerTracks / SFX      — audio data
//   4. registerTileAnims(obj)          — optional animated tiles
//   5. setNpcClipFactory(fn)           — optional custom NPC clips
//   6. setSaveKey(k)                   — optional localStorage namespace
//   7. set playerId, call loadScene()
//   8. Main loop: input.update() → systems → render → engineTick(delta)
//
// Render order convention (call in this order each frame):
//   clearBuffer → drawTilemap(BG) → drawTilemap(Objects) → sysRender
//   → renderParticles → renderHUD → renderDialog → renderSaveNote
//   → flushBuffer → renderTransitionOverlay
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
// buildSpriteCache(obj): rasterize palette-index arrays → RGBA bufs.
// buildPaletteSwap(data, indexMap): create a recolored buffer copy.
// Internal engine sprites (_hud_*) are built at module init time.
// ================================================================
const spriteCache = {};

function buildSpriteCache(sprites) {
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

function buildPaletteSwap(spriteData, indexMap) {
  const buf = new Uint8ClampedArray(64 * 4);
  for (let i = 0; i < 64; i++) {
    const raw  = spriteData[i];
    const idx  = (raw !== null && indexMap[raw] !== undefined) ? indexMap[raw] : raw;
    const base = i * 4;
    if (raw === null || idx === null) { buf[base+3] = 0; continue; }
    const c = paletteRGBA[idx];
    buf[base] = c[0]; buf[base+1] = c[1]; buf[base+2] = c[2]; buf[base+3] = 255;
  }
  return buf;
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
function blitBuffer(buf, sx, sy, flipX = false, flipY = false) {
  for (let row = 0; row < TILE_SIZE; row++) {
    const dstY = sy + row;
    if (dstY < 0 || dstY >= LOGICAL_H) continue;
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
// ================================================================
const camera = {
  x: 0, y: 0,

  follow(wx, wy, worldW, worldH) {
    this.x = Math.round(Math.max(0, Math.min(worldW - LOGICAL_W, wx - LOGICAL_W / 2)));
    this.y = Math.round(Math.max(0, Math.min(worldH - LOGICAL_H, wy - LOGICAL_H / 2)));
  },

  toScreen(wx, wy) { return [wx - this.x, wy - this.y]; },

  isVisible(wx, wy, w = TILE_SIZE, h = TILE_SIZE) {
    return wx + w > this.x && wx < this.x + LOGICAL_W &&
           wy + h > this.y && wy < this.y + LOGICAL_H;
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

function drawTilemap(layer, elapsed = 0) {
  const { cols, rows } = worldState;
  const cStart = Math.max(0, Math.floor(camera.x / TILE_SIZE));
  const cEnd   = Math.min(cols, Math.ceil((camera.x + LOGICAL_W) / TILE_SIZE));
  const rStart = Math.max(0, Math.floor(camera.y / TILE_SIZE));
  const rEnd   = Math.min(rows, Math.ceil((camera.y + LOGICAL_H) / TILE_SIZE));

  for (let row = rStart; row < rEnd; row++) {
    for (let col = cStart; col < cEnd; col++) {
      const cell = layer[row]?.[col];
      if (!cell) continue;
      const buf = spriteCache[resolveSprite(cell, elapsed)];
      if (!buf) continue;
      const [sx, sy] = camera.toScreen(col * TILE_SIZE, row * TILE_SIZE);
      blitBuffer(buf, sx, sy);
    }
  }
}

// ================================================================
// SECTION 11: COLLISION (AABB, axis-separated)
// setHitbox(x,y,w,h): configure foot-area hitbox offset from sprite.
// isGrounded(wx,wy): true when solid tile is immediately below hitbox.
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

function resolveMove(wx, wy, dx, dy) {
  const nx = Math.max(0, Math.min(worldState.w - TILE_SIZE, wx + dx));
  const ny = Math.max(0, Math.min(worldState.h - TILE_SIZE, wy + dy));
  const ax = collidesAt(nx, wy) ? wx : nx;
  const ay = collidesAt(ax, ny) ? wy : ny;
  return { x: ax, y: ay };
}

function isGrounded(wx, wy) { return collidesAt(wx, wy + 1); }

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
// Entity = integer ID. 'persistent' component survives clearSceneEntities().
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
// ================================================================
const ACTION_MAP = {
  up:     { keys: ['ArrowUp',   'KeyW'],   gpButtons: [12] },
  down:   { keys: ['ArrowDown', 'KeyS'],   gpButtons: [13] },
  left:   { keys: ['ArrowLeft', 'KeyA'],   gpButtons: [14] },
  right:  { keys: ['ArrowRight','KeyD'],   gpButtons: [15] },
  action: { keys: ['KeyZ','Space'],         gpButtons: [0]  },
  cancel: { keys: ['KeyX','Escape'],        gpButtons: [1]  },
};

const input = (() => {
  const down = new Set(), pressed = new Set(), released = new Set();
  const snap = { held: {}, pressed: {}, released: {}, axis: { x: 0, y: 0 } };

  window.addEventListener('keydown', e => {
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space'].includes(e.code))
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
// Notation: "C5:0.5 E5:1 R:0.25" — note+octave:beats or rest.
// Instruments: 'square' | 'triangle' | 'sine' | 'sawtooth'
// sound.registerTracks(obj) / registerSFX(obj) — called by game.
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
// registerScenes(obj): register scene map before loadScene().
// setNpcClipFactory(fn): fn(spriteName) → animator clips object.
// ================================================================
let playerId = -1;

const sceneTransition = {
  state: 'none',
  alpha: 0, speed: 3,
  pendingScene: '', pendingX: 0, pendingY: 0,
};

const sceneNpcIds = [];
let _scenes = {};
let _npcClipFactory = s => ({
  idle:      { frames: [s], durations: 0.4 },
  walk_down: { frames: [s], durations: 0.3 },
  walk_up:   { frames: [s], durations: 0.3 },
  walk_side: { frames: [s], durations: 0.3 },
});

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
  camera.x = 0; camera.y = 0;
  sound.playBGM(scene.music);
  // Fire any onEnter hook defined in scene
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
// dialog._onClose: optional callback invoked when dialog closes.
//   Set by cutscene.run for script-driven dialog.
// dialog._branch:  resolved NPC branch, applied on close via flags.
// renderDialog(elapsed): pass current elapsed for blink animation.
// ================================================================
const dialog = {
  active:   false,
  lines:    [],
  page:     0,
  name:     '',
  _onClose: null,   // fn() | null — invoked once on final page close
  _branch:  null,   // NPC branch object | null — side-effects on close
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
// v2 payload includes flags + HUD state for full quest persistence.
// setSaveKey(k): namespace localStorage key per game.
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

const saveLoad = {
  save() {
    const ptf = world.get(playerId, 'transform');
    if (!ptf) return false;
    try {
      localStorage.setItem(_saveKey, JSON.stringify({
        version: 2,
        scene:   worldState.currentScene,
        x: ptf.x | 0, y: ptf.y | 0,
        flags:   { ...flags },
        hud:     { hp: hud.hp, maxHp: hud.maxHp, coins: hud.coins },
      }));
      return true;
    } catch(e) { console.warn('Save failed:', e.message); return false; }
  },
  load() {
    try {
      const raw  = localStorage.getItem(_saveKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.version !== 2 || !_scenes[data.scene]) return false;
      // Restore flags before loadScene (scene.onEnter may read them)
      if (data.flags) Object.assign(flags, data.flags);
      if (data.hud) {
        hud.hp     = data.hud.hp    ?? hud.hp;
        hud.maxHp  = data.hud.maxHp ?? hud.maxHp;
        hud.coins  = data.hud.coins ?? hud.coins;
      }
      loadScene(data.scene, data.x, data.y);
      return true;
    } catch(e) { console.warn('Load failed:', e.message); return false; }
  },
  hasSave() {
    try { return !!localStorage.getItem(_saveKey); } catch(e) { return false; }
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

// Standard 4-direction player input → velocity + animator.
// Blocked by: dialog active, scene transitioning, cutscene input lock.
function sysInput() {
  if (dialog.active || sceneTransition.state !== 'none' || cutscene.isInputLocked()) {
    const vel = world.get(playerId, 'velocity');
    if (vel) { vel.dx = 0; vel.dy = 0; }
    return;
  }
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
    if      (dy > 0) { animatorPlay(anim, 'walk_down'); anim.flipX = false; }
    else if (dy < 0) { animatorPlay(anim, 'walk_up');   anim.flipX = false; }
    else if (dx < 0) { animatorPlay(anim, 'walk_side'); anim.flipX = true;  }
    else             { animatorPlay(anim, 'walk_side'); anim.flipX = false; }
  } else {
    animatorPlay(anim, 'idle');
  }
}

// Waypoint patrol AI.
function sysAI(delta) {
  for (const id of world.query('transform', 'velocity', 'patrol', 'animator')) {
    // Skip if this entity is being driven by a cutscene move command
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
      if (Math.abs(dy) > Math.abs(dx)) {
        animatorPlay(anim, dy > 0 ? 'walk_down' : 'walk_up');
      } else {
        animatorPlay(anim, 'walk_side');
        anim.flipX = dx < 0;
      }
    }
  }
}

// AABB movement with collision resolution.
function sysMovement(delta) {
  for (const id of world.query('transform', 'velocity')) {
    const tf  = world.get(id, 'transform');
    const vel = world.get(id, 'velocity');
    if (vel.dx === 0 && vel.dy === 0) continue;
    if (world.has(id, 'collider')) {
      const pos = resolveMove(tf.x, tf.y, vel.dx * delta, vel.dy * delta);
      tf.x = pos.x; tf.y = pos.y;
    } else {
      tf.x = Math.max(0, Math.min(worldState.w - TILE_SIZE, tf.x + vel.dx * delta));
      tf.y = Math.max(0, Math.min(worldState.h - TILE_SIZE, tf.y + vel.dy * delta));
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
      // Run portal script if defined, otherwise transition directly
      if (p.script) { cutscene.run(p.script); return; }
      startTransition(p.targetScene, p.targetTileX * TILE_SIZE, p.targetTileY * TILE_SIZE);
      return;
    }
  }
}

// NPC proximity dialog. Supports flag-gated dialog branches.
// dialog._onClose fires on last page close (used by cutscene dialog).
// dialog._branch  fires _applyDialogBranch (NPC branch side-effects).
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

  // Cutscene manages its own dialog via _onClose — don't intercept
  if (cutscene.isRunning()) return;
  if (!input.pressed('action')) return;
  const ptf = world.get(playerId, 'transform');
  if (!ptf) return;

  const nearby = spatialHash.queryRect(ptf.x - 12, ptf.y - 12, TILE_SIZE + 24, TILE_SIZE + 24);
  for (const id of nearby) {
    if (id === playerId) continue;
    const npc = world.get(id, 'npcData');
    if (!npc) continue;

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
}

// Entity render pass: animator or sprite component.
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
    const [sx, sy] = camera.toScreen(tf.x, tf.y);
    blitBuffer(buf, sx | 0, sy | 0, flipX, flipY);
  }
}

// ================================================================
// SECTION 20: HUD SYSTEM
//
// Renders a 10px status bar at the top of the framebuffer.
// Hearts represent HP in half-heart units (maxHp=6 → 3 hearts).
// Coin icon + counter. Four item slots (show sprite by name).
//
// Internal sprites (_hud_*) are rasterized at module init time
// and stored in spriteCache, so games can blitBuffer them directly.
//
// API:
//   hud.setHp(n), hud.addHp(±n)
//   hud.setCoins(n), hud.addCoins(n)
//   hud.setItem(slot 0-3, spriteName | null)
//   hud.setMaxHp(n)   — expand hearts, does not change current hp
//   hud.visible       — toggle entire bar
// ================================================================

// Internal HUD sprite definitions (palette-indexed, 8×8).
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
    null,null,7,7,7,7,null,null,
    null,7,20,7,7,7,7,null,
    7,20,7,7,7,7,7,7,
    7,7,7,7,7,7,7,7,
    7,7,7,7,7,7,7,7,
    7,7,7,7,7,7,7,7,
    null,7,7,7,7,7,7,null,
    null,null,7,7,7,7,null,null,
  ],
  _hud_slot_empty: [
    14,14,14,14,14,14,14,14,
    14,0,0,0,0,0,0,14,
    14,0,0,0,0,0,0,14,
    14,0,0,0,0,0,0,14,
    14,0,0,0,0,0,0,14,
    14,0,0,0,0,0,0,14,
    14,0,0,0,0,0,0,14,
    14,14,14,14,14,14,14,14,
  ],
};

// Build HUD sprites into cache immediately (before game calls buildSpriteCache).
for (const [name, data] of Object.entries(_HUD_DEFS)) {
  spriteCache[name] = _rasterizeSprite(data);
}

const hud = {
  hp:      6,
  maxHp:   6,
  coins:   0,
  items:   [null, null, null, null],
  visible: true,

  setHp(v)           { this.hp     = Math.max(0, Math.min(this.maxHp, v)); },
  addHp(n)           { this.setHp(this.hp + n); },
  setMaxHp(v)        { this.maxHp  = Math.max(2, v); },
  setCoins(v)        { this.coins  = Math.max(0, v); },
  addCoins(n)        { this.coins += n; },
  setItem(s, name)   { if (s >= 0 && s < 4) this.items[s] = name ?? null; },
  clearItem(s)       { this.setItem(s, null); },
};

function renderHUD() {
  if (!hud.visible) return;

  // Background strip + bottom separator
  fillRectPx(0, 0, LOGICAL_W, HUD_H, 0);
  fillRectPx(0, HUD_H - 1, LOGICAL_W, 1, 13);

  // ---- Hearts (left side) ----
  const heartCount = Math.ceil(hud.maxHp / 2);
  for (let i = 0; i < heartCount; i++) {
    const filled = hud.hp - i * 2;
    const key = filled >= 2 ? '_hud_heart_full'
              : filled === 1 ? '_hud_heart_half'
              : '_hud_heart_empty';
    blitBuffer(spriteCache[key], 2 + i * 9, 1);
  }

  // ---- Coin icon + count ----
  const coinX = 2 + heartCount * 9 + 4;
  blitBuffer(spriteCache['_hud_coin'], coinX, 1);
  drawText(`x${hud.coins}`, coinX + 9, 2, 7);

  // ---- Item slots (right side, 4 × 10px wide) ----
  for (let s = 0; s < 4; s++) {
    const sx = LOGICAL_W - 4 - (3 - s) * 10 - 8;
    blitBuffer(spriteCache['_hud_slot_empty'], sx, 1);
    if (hud.items[s]) {
      const buf = spriteCache[hud.items[s]];
      if (buf) blitBuffer(buf, sx, 1);
    }
  }
}

// ================================================================
// SECTION 21: PARTICLE SYSTEM
//
// Fixed pool of MAX_PARTICLES (no GC churn). Particles are world-space;
// camera.toScreen() applied at render time. Alpha-blended fadeout via
// blendPixel() — break from pure palette rendering for smooth decay.
//
// API:
//   emitParticle(x, y, vx, vy, life, colorIdx, gravity, size)
//   emitBurst(x, y, preset)   — named presets below
//   updateParticles(delta)    — call from engineTick or game loop
//   renderParticles()         — call after sysRender, before renderHUD
//
// Presets: 'footstep' | 'portal' | 'hit' | 'coin' | 'sparkle' | 'smoke'
// ================================================================
const MAX_PARTICLES = 256;
const _particles = Array.from({ length: MAX_PARTICLES }, () => ({
  active: false, x: 0, y: 0, vx: 0, vy: 0,
  life: 0, maxLife: 1, color: 20, gravity: 0, size: 1,
}));

function emitParticle(x, y, vx, vy, life, colorIdx, gravity = 0, size = 1) {
  for (let i = 0; i < MAX_PARTICLES; i++) {
    const p = _particles[i];
    if (p.active) continue;
    p.active = true;
    p.x = x; p.y = y; p.vx = vx; p.vy = vy;
    p.life = life; p.maxLife = life;
    p.color = colorIdx; p.gravity = gravity; p.size = size;
    return;
  }
  // Pool full — overwrite the oldest (first active found with least life)
  let oldest = null, minLife = Infinity;
  for (const p of _particles) {
    if (p.active && p.life < minLife) { minLife = p.life; oldest = p; }
  }
  if (oldest) {
    oldest.x = x; oldest.y = y; oldest.vx = vx; oldest.vy = vy;
    oldest.life = life; oldest.maxLife = life;
    oldest.color = colorIdx; oldest.gravity = gravity; oldest.size = size;
  }
}

// Named burst presets. All values: vxR/vyR = random half-range, vyBase = base upward vel.
const _BURST_PRESETS = {
  footstep: { n:3,  cols:[11,12,23],     vxR:18, vyR:8,  vyBase:-18, life:0.22, g:80,   sz:1 },
  portal:   { n:10, cols:[25,19,18,16],  vxR:38, vyR:38, vyBase:-28, life:0.75, g:0,    sz:1 },
  hit:      { n:7,  cols:[26,27,7,20],   vxR:55, vyR:55, vyBase:-40, life:0.40, g:90,   sz:1 },
  coin:     { n:6,  cols:[7,20,5,12],    vxR:28, vyR:28, vyBase:-55, life:0.55, g:140,  sz:1 },
  sparkle:  { n:5,  cols:[19,20,17,25],  vxR:14, vyR:14, vyBase:-10, life:0.55, g:0,    sz:1 },
  smoke:    { n:4,  cols:[22,23,24,13],  vxR:10, vyR:6,  vyBase:-22, life:0.90, g:-12,  sz:2 },
  levelup:  { n:16, cols:[7,20,25,17,27],vxR:60, vyR:60, vyBase:-60, life:1.0,  g:30,   sz:1 },
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

function renderParticles() {
  for (const p of _particles) {
    if (!p.active) continue;
    const alpha = Math.max(0, p.life / p.maxLife);
    if (alpha < 0.04) continue;
    const [sx, sy] = camera.toScreen(p.x | 0, p.y | 0);
    const c = paletteRGBA[p.color];
    const s = p.size | 0;
    // Clip to viewport, skip HUD strip
    const x0 = Math.max(0, sx), x1 = Math.min(LOGICAL_W, sx + s);
    const y0 = Math.max(HUD_H, sy), y1 = Math.min(LOGICAL_H, sy + s);
    for (let py = y0; py < y1; py++)
      for (let px = x0; px < x1; px++)
        blendPixel(px, py, c[0], c[1], c[2], alpha);
  }
}

// ================================================================
// SECTION 22: QUEST / FLAG SYSTEM
//
// flags = { [name]: boolean } — global, serialized with save data.
// Watchers fire once when ALL listed flags become true (won't re-fire
// unless manually reset with resetWatcher()).
//
// Conditional NPC dialog branches:
//   npcDef.dialogBranches = [
//     {
//       requires:   ['flag1', 'flag2'],  // all must be true
//       excludes:   ['flag3'],           // none may be true
//       lines:      ['PAGE 1', 'PAGE 2'],
//       setFlags:   ['questDone'],       // set these on close
//       clearFlags: ['inProgress'],      // clear these on close
//       addCoins:   5,                   // give coins on close
//       addHp:      2,                   // heal on close
//       runScript:  [ ...commands ],     // run cutscene on close
//     },
//   ]
// First matching branch wins. Falls back to npcData.dialogLines.
//
// Portal entries can also gate on flags:
//   portals: [{ ..., requires: ['keyFound'] }]
// ================================================================
const flags = {};
const _watchers = [];

function setFlag(name, val = true) {
  const prev = flags[name];
  flags[name] = !!val;
  if (val && !prev) _fireWatchers();
}

function clearFlag(name) { flags[name] = false; }

function getFlag(name) { return !!flags[name]; }

function hasFlags(...names) { return names.every(n => !!flags[n]); }

function onFlags(flagNames, fn, { once = true } = {}) {
  const w = { flagNames, fn, once, fired: false };
  _watchers.push(w);
  // Fire immediately if already satisfied
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

// Resolve the best dialog branch for an NPC given current flags.
// Returns { lines, branch } where branch may be null (default dialog).
function _resolveNpcDialog(npc) {
  for (const b of (npc.dialogBranches ?? [])) {
    const reqOk = !b.requires || b.requires.every(f => flags[f]);
    const excOk = !b.excludes || !b.excludes.some(f => flags[f]);
    if (reqOk && excOk) return { lines: b.lines ?? npc.dialogLines, branch: b };
  }
  return { lines: npc.dialogLines, branch: null };
}

// Apply a dialog branch's side-effects when dialog closes on last page.
// Called by sysDialog after the player dismisses final page.
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
//
// A script is an ordered array of command objects executed in sequence.
// Time-consuming commands (wait, dialog, move) pause the runner until
// complete. Only one script runs at a time; run() replaces any active.
//
// Command reference:
//   { cmd:'wait',       seconds:1.5 }
//   { cmd:'dialog',     name:'SAGE', lines:['HELLO', 'WORLD'] }
//   { cmd:'sfx',        name:'portal' }
//   { cmd:'bgm',        name:'cave' }
//   { cmd:'stopBgm' }
//   { cmd:'flag',       name:'metSage', value:true }
//   { cmd:'move',       id:entityId, tx:5, ty:10, speed:40 }
//   { cmd:'transition', scene:'cave', tx:3, ty:8 }
//   { cmd:'lockInput',  value:true }
//   { cmd:'hud',        show:false }
//   { cmd:'emit',       x:80, y:80, preset:'portal' }
//   { cmd:'call',       fn:() => { /* sync */ } }
//
// cutscene.run(commands)   — start a script, cancels any running one
// cutscene.stop()          — abort
// cutscene.isRunning()     — true while active
// cutscene.isInputLocked() — true while lockInput is active
// ================================================================
const cutscene = (() => {
  let _queue    = [];
  let _running  = false;
  let _current  = null;
  let _waitT    = 0;
  let _locked   = false;
  let _moveData = null;  // { id, targetX, targetY, speed }

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
      case 'wait':
        _waitT = cmd.seconds;
        break;  // update() advances on timer expiry

      case 'dialog':
        dialog.active   = true;
        dialog.name     = (cmd.name ?? '').toUpperCase();
        dialog.lines    = cmd.lines.map(l => l.toUpperCase());
        dialog.page     = 0;
        dialog._branch  = null;
        dialog._onClose = _advance;  // resume script on close
        sound.playSFX('dialog');
        break;  // update() does nothing — sysDialog handles advance

      case 'sfx':      sound.playSFX(cmd.name);      _advance(); break;
      case 'bgm':      sound.playBGM(cmd.name);      _advance(); break;
      case 'stopBgm':  sound.stopBGM();               _advance(); break;
      case 'lockInput':_locked = !!cmd.value;         _advance(); break;
      case 'hud':      hud.visible = cmd.show !== false; _advance(); break;
      case 'emit':     emitBurst(cmd.x, cmd.y, cmd.preset); _advance(); break;
      case 'call':     cmd.fn();                      _advance(); break;

      case 'flag':
        setFlag(cmd.name, cmd.value ?? true);
        _advance();
        break;

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
        // update() advances when entity reaches target
        break;
      }

      case 'transition':
        // Advance script first, then kick off transition
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

    if (_current.cmd === 'dialog') {
      // sysDialog handles advance via dialog._onClose
      return;
    }

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
        if (anim) {
          if (Math.abs(dy) > Math.abs(dx)) {
            animatorPlay(anim, dy > 0 ? 'walk_down' : 'walk_up');
          } else {
            animatorPlay(anim, 'walk_side');
            anim.flipX = dx < 0;
          }
        }
      }
    }
  }

  return { run, stop, isRunning, isInputLocked, update };
})();

// ================================================================
// SECTION 24: ENGINE TICK
// Call once per frame with delta. Advances all internal subsystems.
// ================================================================
function engineTick(delta) {
  if (saveNote.timer > 0) saveNote.timer -= delta;
  updateParticles(delta);
  cutscene.update(delta);
}
