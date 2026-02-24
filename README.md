# PIXEL CANVAS ENGINE v5.1

A self-contained vanilla JavaScript pixel-art game engine for 8×8 tile-based games. Zero dependencies. Single `putImageData` call per frame.

## Repository Structure

```
pixel-canvas-engine.js           Core engine library (v5.1)
templates/
  top-down-adventure.html        Zelda-style overworld demo with combat, items, and cutscenes
  platformer.html                Side-scrolling platformer demo
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

## What's New in v5.1

- **World Y offset** — Game world is clamped below the HUD strip. `WORLD_OFFSET_Y = HUD_H` (10px). `camera.toScreen()` applies the offset automatically; no changes required in game code.
- **HUD system** — Hearts, coins, 4 item slots with selection highlighting and use-handler registration.
- **Particles** — Pooled world-space particles with alpha-blended fadeout. Preset bursts: `chest`, `levelup`, `hit`.
- **Flags** — Named boolean game state. Watchers fire callbacks when conditions are met. NPC dialog branches can `require` or `exclude` flags.
- **Cutscene system** — Sequenced command runner: `wait`, `dialog`, `sfx`, `bgm`, `lockInput`, `move`, `setFlag`, and more.
- **Chest system** — ECS chest entities with open animation, loot spawn, particle burst, and optional flag gating.
- **Minimap** — Downsampled collision layer rendered to a configurable corner of the screen.

---

## Templates

### `top-down-adventure.html`
Extended Zelda-style top-down game. Demonstrates:

- Multi-scene configuration (overworld + cave) connected by portal tiles
- **Combat system**: melee swing hitboxes, ranged projectile spawning, knockback, damageable components, iframe flicker
- **4 weapon types** acquired from chests — Iron Sword, Bow, War Axe, Shield (passive damage reduction)
- **Item pickups** — coin, heart, key, bomb, potion; each with `onPickup` callbacks
- **Enemy AI** with health, damageable component, and death handling
- **Flag-conditional NPC dialog branches** (`requires`, `excludes`, `setFlags`, `addCoins`)
- **Cutscene sequences** triggered by flags or NPC dialog close
- **Minimap** (toggle with M key)
- Animated water tiles, patrol AI, walled enclosures
- Scene-scoped music (overworld / cave BGM)
- Save/load via F5/F9 (saves flags, HUD state, scene, and position)

#### Controls (top-down-adventure)
| Input | Action |
|---|---|
| Arrow keys / WASD | Move |
| Z / Space | Interact (NPC, chest), confirm dialog |
| X | Attack with active weapon |
| E / Tab | Cycle item slot forward |
| Q | Cycle item slot backward |
| M | Toggle minimap |
| F5 | Save |
| F9 | Load |

### `platformer.html`
Side-scrolling platformer. Demonstrates:
- Gravity and vertical velocity accumulation
- Jump input with grounded state check
- One-way platform collision (top-surface only)
- Horizontal scroll camera following
- Sprite flip on direction change
- Multiple selectable player characters

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
- **HUD strip**: top 10px (`HUD_H`) reserved; world rendering begins at `WORLD_OFFSET_Y`

---

## Tilemaps

- Three-layer system: `BG` (terrain), `Objects` (decor/walls), `Collision` (boolean solid map)
- Named tile animations with configurable FPS

---

## HUD System

```js
hud.setItem(slot, spriteName)         // assign item to slot 0–3
hud.cycleSlot(±1)                     // advance/retreat selection (wraps through null)
hud.registerItemUse(spriteName, fn)   // register use-handler; fn(slotIndex) → void
hud.useSelectedItem()                 // fire handler for selected slot
hud.addCoins(n)
hud.addHp(n)
```

---

## Flags

```js
setFlag(name)               // set boolean true, fires watchers
clearFlag(name)
getFlag(name) → bool
hasFlags(...names) → bool

onFlags(['flagA','flagB'], fn, { once: true })  // callback when all named flags are set
```

NPC dialog branches use `requires: [...]` and `excludes: [...]` arrays to resolve which lines to show. Branches may include `setFlags`, `clearFlags`, `addCoins`, `addHp`, `emit`, and `runScript`.

---

## Cutscene System

```js
cutscene.run(commands)   // execute a command array
cutscene.stop()
cutscene.isRunning() → bool
cutscene.isInputLocked() → bool
```

Supported commands: `wait`, `dialog`, `sfx`, `bgm`, `stopBgm`, `lockInput`, `move`, `setFlag`, `clearFlag`, `emit`, `note`.

---

## Chest System

Add a `chests` array to any scene definition:

```js
chests: [
  {
    tileX: 5, tileY: 8, flagName: 'chest_5_8',
    loot: [{ sprite: 'coin_item', type: 'coin', onPickup: () => hud.addCoins(3) }]
  }
]
```

`flagName` gates re-spawn on scene reload. The open sequence: sprite swap → loot spawn → particle burst (`chest` preset) → SFX `chest_open`.

---

## Particles

```js
emitBurst(worldX, worldY, preset)   // presets: 'chest', 'levelup', 'hit'
```

Particles are world-space, pooled, and alpha-fade to zero.

---

## Minimap

Rendered as a downsampled collision layer. Configurable corner position. Shows a camera viewport rect and a player dot. Toggle or render manually via `renderMinimap()`.

---

## Input

Abstract action map: keyboard + gamepad unified under named actions.

| Action | Keys | Gamepad |
|---|---|---|
| `up/down/left/right` | Arrow keys, WASD | D-pad |
| `action` | Z, Space | A |
| `cancel` | X, Escape | B |
| `attack` | X | X button |
| `itemNext` | E, Tab | R-bumper |
| `itemPrev` | Q | L-bumper |

Per-frame edge detection: `held`, `pressed` (single frame), `released`. Gamepad polled via `navigator.getGamepads()`.

---

## Sound Engine

- Space-notation: `"C5:0.5 E5:1 R:0.25"` — note+octave:beats or rest
- `OscillatorNode` per note with ADSR gain envelope
- Multi-channel BGM tracks with gapless looping via `setTimeout` reschedule
- Named SFX fired as one-shot; BGM swapped per scene
- `AudioContext` initialized lazily on first user gesture

---

## Save / Load

- Payload (version 2): `{ version, scene, x, y, flags, hud }` — scene state rebuilt from definitions on load; flags and HUD (HP, coins) restored
- `localStorage` with try/catch (graceful failure in sandboxed/private contexts)
- Default bindings: F5 save, F9 load
- Framebuffer notification banner with configurable timeout

---

## System Execution Order

```
input.update → sysInput → sysAI → sysPhysics/sysMovement
→ sysSpatialHash → sysCamera → sysSceneTransition
→ sysAnimation → sysDialog

Render:
clearBuffer → drawTilemap(BG) → drawTilemap(Objects)
→ sysRender → renderDialog → renderSaveNote
→ flushBuffer → renderTransitionOverlay (ctx)
```

Platformer inserts `sysGravity` before `sysMovement` and `sysGrounded` after. Top-down adventure inserts `sysPlayerAttack` and `sysProjectiles` after `sysAI`.