'use strict';
// ================================================================
// PIXEL CANVAS ENGINE v4 — pixel-canvas-engine.js
//
// Self-contained vanilla JS engine for 8×8 tile-based games.
// Zero dependencies. Load before any game script.
//
// Game script responsibilities:
//   1. Define SPRITES object, call buildSpriteCache(SPRITES)
//   2. Define SCENES object, call registerScenes(SCENES)
//   3. Optionally call registerTileAnims(), sound.registerTracks(),
//      sound.registerSFX(), setNpcClipFactory(), setSaveKey()
//   4. Create player entity, set playerId
//   5. Define & start main loop calling engineTick(delta) each frame
// ================================================================

// ================================================================
// SECTION 1: CONFIG
// ================================================================
const TILE_SIZE = 8;
const COLS      = 20;
const ROWS      = 18;
const LOGICAL_W = COLS * TILE_SIZE;  // 160
const LOGICAL_H = ROWS * TILE_SIZE;  // 144

// ================================================================
// SECTION 2: PALETTE
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
// 5×7 pixel glyphs as 5-bit row masks. drawText renders directly
// into the framebuffer. Char width = 6px (5+1 gap), height = 8px.
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
// Call buildSpriteCache(yourSpritesObject) after defining sprites.
// buildPaletteSwap(spriteData, indexMap) returns a remapped buffer.
// ================================================================
const spriteCache = {};

function buildSpriteCache(sprites) {
  for (const [name, data] of Object.entries(sprites)) {
    const buf = new Uint8ClampedArray(64 * 4);
    for (let i = 0; i < 64; i++) {
      const idx  = data[i];
      const base = i * 4;
      if (idx === null) { buf[base + 3] = 0; continue; }
      const c = paletteRGBA[idx];
      buf[base] = c[0]; buf[base+1] = c[1]; buf[base+2] = c[2]; buf[base+3] = 255;
    }
    spriteCache[name] = buf;
  }
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
// ================================================================

function clearBuffer(palIdx = 0) {
  const [r, g, b] = paletteRGBA[palIdx];
  for (let i = 0; i < frameBuffer.length; i += 4) {
    frameBuffer[i] = r; frameBuffer[i+1] = g;
    frameBuffer[i+2] = b; frameBuffer[i+3] = 255;
  }
}

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
// SECTION 8: SPATIAL HASH
// ================================================================
const spatialHash = (() => {
  const CELL = 32;
  let cells = new Map();
  function key(cx, cy) { return (cx & 0xFFFF) << 16 | (cy & 0xFFFF); }
  function clear() { cells.clear(); }
  function insert(id, x, y, w = TILE_SIZE, h = TILE_SIZE) {
    const x0 = Math.floor(x / CELL), y0 = Math.floor(y / CELL);
    const x1 = Math.floor((x + w - 1) / CELL), y1 = Math.floor((y + h - 1) / CELL);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const k = key(cx, cy);
        if (!cells.has(k)) cells.set(k, new Set());
        cells.get(k).add(id);
      }
    }
  }
  function queryRect(x, y, w, h) {
    const result = new Set();
    const x0 = Math.floor(x / CELL), y0 = Math.floor(y / CELL);
    const x1 = Math.floor((x + w - 1) / CELL), y1 = Math.floor((y + h - 1) / CELL);
    for (let cy = y0; cy <= y1; cy++) {
      for (let cx = x0; cx <= x1; cx++) {
        const bucket = cells.get(key(cx, cy));
        if (bucket) for (const id of bucket) result.add(id);
      }
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
// Hitbox offsets configurable via setHitbox(x, y, w, h).
// Default: 6×4 foot-area hitbox offset (1, 4) from sprite top-left.
// isGrounded(wx, wy): true when a solid tile is directly below.
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

// Returns true when a solid tile is immediately below the hitbox.
function isGrounded(wx, wy) {
  return collidesAt(wx, wy + 1);
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
// Entities are integer IDs; components are plain objects in a Map.
// world.query(...names) returns all entity IDs having every listed
// component. 'persistent' component survives clearSceneEntities().
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
    destroyEntity(id) {
      entities.delete(id);
      store.delete(id);
    },
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
        snap.held[a]     = m.keys.some(k => down.has(k)) || gpH;
        snap.pressed[a]  = m.keys.some(k => pressed.has(k)) || (gpH && !snap.held[a+'_p']);
        snap.released[a] = m.keys.some(k => released.has(k));
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
// Register data separately: sound.registerTracks(obj), registerSFX(obj)
// Notation: "C5:0.5 E5:1 R:0.25" — note+octave:beats or R:beats.
// ================================================================
const NOTE_FREQ_BASE = {
  'C':261.63,'C#':277.18,'D':293.66,'D#':311.13,'E':329.63,
  'F':349.23,'F#':369.99,'G':392.00,'G#':415.30,'A':440.00,
  'A#':466.16,'B':493.88,
};

function noteToHz(note, octave) {
  return (NOTE_FREQ_BASE[note] ?? 440) * Math.pow(2, octave - 4);
}

function parseNotes(str) {
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

  function scheduleTrack(track, t0) {
    const beat = 60 / track.bpm;
    const nodes = [];
    let maxEnd = t0;
    for (const ch of track.channels) {
      const parsed = parseNotes(ch.notes);
      let t = t0;
      for (const n of parsed) {
        const dur = n.beats * beat;
        if (!n.rest && actx) {
          const osc  = actx.createOscillator();
          const gain = actx.createGain();
          osc.type = ch.instrument;
          osc.frequency.value = noteToHz(n.note, n.oct);
          const att = 0.01, rel = Math.min(0.05, dur * 0.25);
          gain.gain.setValueAtTime(0, t);
          gain.gain.linearRampToValueAtTime(0.7, t + att);
          gain.gain.setValueAtTime(0.7, t + dur - rel);
          gain.gain.linearRampToValueAtTime(0, t + dur);
          osc.connect(gain);
          gain.connect(masterGain);
          osc.start(t);
          osc.stop(t + dur + 0.01);
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
      const { nodes, duration } = scheduleTrack(track, actx.currentTime + 0.05);
      bgmNodes.push(...nodes);
      if (track.loop) bgmTimer = setTimeout(loop, Math.max(0, (duration - 0.2) * 1000));
    }
    loop();
  }

  function playSFX(name) {
    if (!actx) return;
    const sfx = _sfx[name];
    if (sfx) scheduleTrack(sfx, actx.currentTime + 0.01);
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
// Requires registerScenes(obj) called before loadScene().
// setNpcClipFactory(fn): fn(spriteName) => clips object.
// ================================================================
let playerId = -1;

const sceneTransition = {
  state: 'none',  // 'none' | 'out' | 'in'
  alpha: 0,
  speed: 3,
  pendingScene: '', pendingX: 0, pendingY: 0,
};

const sceneNpcIds = [];
let _scenes = {};
let _npcClipFactory = (sprite) => ({
  idle:      { frames: [sprite], durations: 0.4 },
  walk_down: { frames: [sprite], durations: 0.3 },
  walk_up:   { frames: [sprite], durations: 0.3 },
  walk_side: { frames: [sprite], durations: 0.3 },
});

function registerScenes(scenes) { _scenes = scenes; }
function setNpcClipFactory(fn)  { _npcClipFactory = fn; }

function clearSceneEntities() {
  for (const id of [...world.allIds]) {
    if (!world.has(id, 'persistent')) world.destroyEntity(id);
  }
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
      npcData:   { name: def.name, dialogLines: def.dialog },
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
}

function startTransition(targetScene, targetX, targetY) {
  if (sceneTransition.state !== 'none') return;
  sceneTransition.state        = 'out';
  sceneTransition.alpha        = 0;
  sceneTransition.pendingScene = targetScene;
  sceneTransition.pendingX     = targetX;
  sceneTransition.pendingY     = targetY;
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
// renderDialog(elapsed) — pass current elapsed seconds for blink.
// ================================================================
const dialog = { active: false, lines: [], page: 0, name: '' };

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
// setSaveKey(k): override default key. F5 = save, F9 = load.
// ================================================================
let _saveKey = 'pixelCanvas_v4';
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
        version: 1,
        scene: worldState.currentScene,
        x: ptf.x | 0, y: ptf.y | 0,
      }));
      return true;
    } catch(e) { console.warn('Save failed:', e.message); return false; }
  },
  load() {
    try {
      const raw  = localStorage.getItem(_saveKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.version !== 1 || !_scenes[data.scene]) return false;
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
// Games call these from their own main loop as needed.
// ================================================================

// Standard 4-direction player input → velocity + animator.
// Expects player entity to have: velocity, animator.
function sysInput() {
  if (dialog.active || sceneTransition.state !== 'none') {
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

// Waypoint patrol AI for NPC entities with a 'patrol' component.
function sysAI(delta) {
  for (const id of world.query('transform', 'velocity', 'patrol', 'animator')) {
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
  if (sceneTransition.state !== 'none' || dialog.active) return;
  const ptf = world.get(playerId, 'transform');
  if (!ptf) return;
  const tx = ptf.x / TILE_SIZE | 0;
  const ty = ptf.y / TILE_SIZE | 0;
  const portals = _scenes[worldState.currentScene]?.portals ?? [];
  for (const p of portals) {
    if (tx === p.tileX && ty === p.tileY) {
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
        dialog.active = false;
        sound.playSFX('cancel');
      }
    }
    return;
  }
  if (!input.pressed('action')) return;
  const ptf = world.get(playerId, 'transform');
  if (!ptf) return;
  const nearby = spatialHash.queryRect(ptf.x - 12, ptf.y - 12, TILE_SIZE + 24, TILE_SIZE + 24);
  for (const id of nearby) {
    if (id === playerId) continue;
    const npc = world.get(id, 'npcData');
    if (npc) {
      dialog.active = true;
      dialog.lines  = npc.dialogLines;
      dialog.name   = npc.name;
      dialog.page   = 0;
      sound.init();
      sound.playSFX('dialog');
      return;
    }
  }
}

// Renders all entities with an animator or sprite component.
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
      if (sp) { buf = sp.buf || spriteCache[sp.name]; flipX = sp.flipX; }
    }
    if (!buf) continue;
    const [sx, sy] = camera.toScreen(tf.x, tf.y);
    blitBuffer(buf, sx | 0, sy | 0, flipX, flipY);
  }
}

// Advance engine-internal timers. Call once per frame with delta.
function engineTick(delta) {
  if (saveNote.timer > 0) saveNote.timer -= delta;
}
