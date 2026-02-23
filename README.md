# PIXEL CANVAS ENGINE

A self-contained vanilla JavaScript pixel-art game engine for 8×8 tile-based games. Zero dependencies. Single `putImageData` call per frame.

## Repository Structure

```
pixel-canvas-engine.js       Core engine library
templates/
  top-down-adventure.html    Zelda-style overworld + cave demo
  platformer.html            Side-scrolling platformer demo
```

---

## Quick Start

Include the engine, then configure and run:

```html
<script src="pixel-canvas-engine.js"></script>
<script>
  PixelCanvas.init({ cols: 20, rows: 18, tileSize: 8 });
  PixelCanvas.loadScene('myScene');
  PixelCanvas.start();
</script>
```

Both HTML templates in `templates/` demonstrate full integration patterns. Use them as starting points; the engine makes no assumptions about genre.

---

## Templates

### `top-down-adventure.html`
Zelda-style top-down game with two scenes (overworld and cave), connected by portal tiles. Demonstrates:
- Multi-scene configuration with NPC dialog and patrol AI
- Animated water tiles
- Walled enclosures and collision maps
- Scene-scoped music (overworld / cave BGM)
- Save/load via F5/F9

### `platformer.html`
Side-scrolling platformer. Demonstrates:
- Gravity and vertical velocity accumulation
- Jump input with grounded state check
- One-way platform collision (top-surface only)
- Horizontal scroll camera following
- Sprite flip on direction change

---

## Engine API

### Initialization

```js
PixelCanvas.init(config)
```

| Option | Default | Description |
|---|---|---|
| `cols` | `20` | Viewport width in tiles |
| `rows` | `18` | Viewport height in tiles |
| `tileSize` | `8` | Pixels per tile |
| `palette` | built-in 32-color | Array of hex color strings |
| `canvasId` | `'screen'` | Target `<canvas>` element ID |

---

## Rendering

- Fixed logical resolution (`cols × tileSize` by `rows × tileSize`) scaled to window via CSS `image-rendering: pixelated`
- Single `Uint8ClampedArray` framebuffer; one `putImageData` call per frame
- 32-color indexed palette; sprites defined as flat 64-element integer arrays (palette indices or `null` for transparent)
- Sprite cache: palette indices rasterized to RGBA buffers once at startup
- Palette swap: per-sprite index remapping without mutating source data
- Bitmap font: 5×7 pixel glyphs defined as 5-bit binary row masks; renders directly into framebuffer

---

## Tilemaps

- Three-layer system: `BG` (terrain), `Objects` (decor/walls), `Collision` (boolean solid map)
- Named tile animations with configurable FPS (e.g. water ripple: 2 FPS alternating frames)
- Camera-bounded tile culling: loop range derived from camera position — O(viewport tiles), not O(world tiles)

---

## Camera

- World-space viewport with pixel-accurate follow and world-boundary clamping
- `camera.toScreen(wx, wy)` and `camera.isVisible(wx, wy, w, h)` used by all render and cull paths
- Platformer mode: horizontal-only follow with vertical deadzone support

---

## Collision

- AABB hitbox offset from sprite origin (configurable per entity; default: foot area)
- Axis-separated resolution: X and Y tested independently — prevents diagonal wall sticking
- Platformer extension: one-way platform tiles (solid on top surface only), grounded state flag

---

## Entity / Component System

- Entities are integer IDs; components are plain objects in a `Map`
- `world.query(...componentNames)` returns all matching entity IDs
- `persistent` component flag: entity survives scene transitions
- System functions called in explicit, user-defined order each frame

---

## Spatial Hash

- 32px cell grid; entities inserted by AABB overlap
- `spatialHash.queryRect(x, y, w, h)` used for NPC proximity and collision broadphase
- Rebuilt each frame after `MovementSystem`

---

## Animation

- Named clips: `{ frames: [spriteName, ...], durations: number | number[] }`
- `animatorPlay(anim, clip)` safe to call every frame — resets only on clip change
- Per-instance flip X/Y flags

---

## Scene System

- Named scenes defined as config objects; map arrays built by scene builder functions
- Portal tiles trigger transitions by tile-coordinate match
- Fade-to-black transition: alpha state machine drawn via `ctx` after framebuffer flush
- Scene NPCs/entities defined in scene config; spawned and destroyed on load/unload
- `persistent` entities (e.g. player) survive transitions

---

## Dialog System

- Multi-page NPC dialog triggered by proximity check via spatial hash + action input
- Rendered into framebuffer: bordered box, name badge, blink indicator
- Driven by `npcData` component — no hardcoded per-NPC render logic

---

## Sound Engine

- Space-notation: `"C5:0.5 E5:1 R:0.25"` — note+octave:beats or rest
- `OscillatorNode` per note with ADSR gain envelope
- Multi-channel BGM tracks with gapless looping via `setTimeout` reschedule
- Named SFX fired as one-shot; BGM swapped per scene
- `AudioContext` initialized lazily on first user gesture

---

## Save / Load

- Payload: `{ version, scene, x, y }` — scene state rebuilt from definitions on load
- `localStorage` with try/catch (graceful failure in sandboxed/private contexts)
- Default bindings: F5 save, F9 load
- Framebuffer notification banner with configurable timeout

---

## Input

- Abstract action map: keyboard + gamepad unified under named actions (`up`, `down`, `left`, `right`, `action`, `cancel`, `jump`)
- Per-frame edge detection: `held`, `pressed` (single frame), `released`
- Gamepad polled via `navigator.getGamepads()`
- Platformer template binds `jump` to Space/ArrowUp/gamepad A

---

## System Execution Order

Logic and render passes are explicit and user-controlled. Default order used in both templates:

```
input.update → sysInput → sysAI → sysPhysics/sysMovement
→ sysSpatialHash → sysCamera → sysSceneTransition
→ sysAnimation → sysDialog

Render:
clearBuffer → drawTilemap(BG) → drawTilemap(Objects)
→ sysRender → renderDialog → renderSaveNote
→ flushBuffer → renderTransitionOverlay (ctx)
```

Platformer inserts `sysGravity` before `sysMovement` and `sysGrounded` after.