**PIXEL CANVAS ENGINE — Project Brief**

A self-contained single-file HTML5 canvas game engine for pixel-perfect 8×8 tile-based games. All rendering, logic, audio, and persistence are implemented in vanilla JavaScript with zero dependencies. Currently at v4.

**Rendering**
- Fixed logical resolution (160×144px default) scaled to window via CSS `image-rendering: pixelated`
- Single `Uint8ClampedArray` framebuffer; one `putImageData` call per frame
- 32-color indexed palette; sprites defined as flat 64-element integer arrays
- Sprite cache: palette indices rasterized to RGBA buffers once at startup
- Palette swap system: per-sprite index remapping without mutating source data
- Bitmap font: 5×7 pixel glyphs defined as 5-bit binary row masks; renders directly into framebuffer

**Tilemaps**
- Three-layer system: BG (terrain), Objects (decor/walls), Collision (boolean solid map)
- Named tile animations (e.g. water ripple) with configurable FPS
- Camera-bounded tile culling: loop range derived from camera position, O(viewport tiles) not O(world tiles)

**Camera**
- World-space viewport with pixel-accurate follow and world-boundary clamping
- `toScreen(wx, wy)` and `isVisible(wx, wy, w, h)` used by all render and cull paths

**Collision**
- AABB hitbox (offset from sprite top-left to foot area)
- Axis-separated resolution: X and Y tested independently to prevent diagonal wall sticking

**Entity / Component System**
- Entities are integer IDs; components are plain objects in a `Map`
- `world.query(...componentNames)` returns all matching entity IDs
- `persistent` component flag survives scene transitions
- System functions called in explicit order each frame

**Spatial Hash**
- 32px cell grid; entities inserted by AABB overlap
- `queryRect(x, y, w, h)` used for NPC proximity detection and can serve collision broadphase
- Rebuilt each frame after MovementSystem

**Animation**
- Named clips: `{ frames: [spriteName,...], durations: number|number[] }`
- `animatorPlay()` is safe to call every frame; resets only on clip change
- Flip X/Y flags per animator instance

**Scene System**
- Named scenes defined as config objects with builder functions (BG, object, collision arrays)
- Portal tiles trigger scene transitions by tile coordinate match
- Fade-to-black transition: alpha state machine drawn via `ctx` after framebuffer flush
- Scene NPCs defined in scene config; spawned/destroyed on load

**Dialog System**
- Multi-page NPC dialog triggered by Z/Space proximity check via spatial hash
- Rendered into framebuffer: bordered box, name badge, blink indicator
- Driven by `npcData` component; no hardcoded per-NPC render logic

**Sound Engine**
- Space-notation: `"C5:0.5 E5:1 R:0.25"` — note+octave:beats or rest
- `OscillatorNode` per note with ADSR gain envelope
- Multi-channel BGM tracks with gapless looping via `setTimeout` reschedule
- Named SFX fired as one-shot; BGM swapped per scene
- `AudioContext` initialized lazily on first user gesture

**Save / Load**
- Payload: `{ version, scene, playerX, playerY }` — scene state rebuilt from definitions
- `localStorage` with try/catch (graceful failure in sandboxed contexts)
- F5 save, F9 load; framebuffer notification banner with 2.5s timeout

**Input**
- Abstract action map: keyboard + gamepad unified
- Per-frame edge detection: `held`, `pressed` (single frame), `released`
- Gamepad polled via `navigator.getGamepads()`
