# PIXEL CANVAS ENGINE v5.2

A self-contained vanilla JavaScript pixel-art game engine for 8×8 tile-based games. Zero dependencies. Single `putImageData` call per frame.

## Repository Structure

```
src/
└── pixelGameEngine/
    ├── index.js             # Barrel entry point — re-exports all public API
    ├── config.js            # Constants and palette
    ├── renderer.js          # Canvas, framebuffer, and drawing API
    ├── assets.js            # Font data and sprite caching
    ├── world.js             # Camera, world state, and tilemap rendering
    ├── physics.js           # Spatial hash and collision detection
    ├── systems/
    │   ├── ecs.js           # Entity Component System
    │   ├── input.js         # Input handling
    │   ├── sound.js         # Web Audio engine
    │   ├── animation.js     # Sprite animation logic
    │   ├── particles.js     # Particle system
    │   ├── scene.js         # Scene manager
    │   ├── dialog.js        # Dialog
    │   ├── flags.js         # Flags
    │   ├── cutscene.js      # Cutscenes
    │   ├── combat.js        # Combat system
    │   ├── enemy.js         # Enemy and ranged enemy logic
    │   ├── spawner.js       # Spawner entities and logic
    │   ├── chest.js         # Chests and loot logic
    │   ├── saveLoad.js      # Save and load system
    │   └── gameLoop.js      # Game loop
    └── ui/
        ├── hud.js           # HUD and inventory
        └── minimap.js       # Minimap rendering

pixel-canvas-zelda.html          Zelda-style overworld demo with combat, items, and cutscenes
pixel-canvas-platformer.html     Side-scrolling platformer demo
```

---

## Quick Start

The engine is an ES Module. Import from the barrel file using `<script type="module">`. No build step, no bundler.

```html
<canvas id="screen"></canvas>

<script type="module">
import * as Engine from './pixelGameEngine/index.js';

const {
  // Renderer
  clearBuffer, flushBuffer,
  // World
  worldState, camera, drawTilemap,
  // ECS
  world,
  // Input / Sound
  input, sound,
  // Scene
  registerScenes, loadScene,
  // Game loop
  engineTick, sysInput, sysMovement, sysCamera, sysAnimation, sysRender,
  // HUD / Render
  renderHUD, flushBuffer,
} = Engine;

// Register scenes, build sprite cache, wire player entity...
loadScene('myScene');

let lastTime = 0;
function loop(ts) {
  const delta = Math.min((ts - lastTime) / 1000, 0.05);
  lastTime = ts;

  engineTick(delta);
  input.update();
  sysInput();
  sysMovement(delta);
  sysCamera();
  sysAnimation(delta);

  clearBuffer(0);
  drawTilemap(worldState.layerBG);
  sysRender();
  renderHUD();
  flushBuffer();

  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
</script>
```

Both HTML templates (`pixel-canvas-zelda.html`, `pixel-canvas-platformer.html`) demonstrate full integration patterns. The engine makes no assumptions about genre.

---

## Importing Named Exports

All public symbols are re-exported from `pixelGameEngine/index.js`. Import the whole namespace or destructure selectively.

```js
// Full namespace
import * as Engine from './pixelGameEngine/index.js';
Engine.loadScene('town');

// Selective destructuring (recommended)
import {
  // Config
  TILE_SIZE,
  // Assets
  buildSpriteCache, buildPaletteSwap,
  // World / Tilemap
  worldState, camera, registerTileAnims, drawTilemap,
  // Renderer
  clearBuffer, flushBuffer, fillRectPx, fillRectWorld, drawText, drawBox, blendPixel,
  // Physics
  spatialHash,
  // ECS
  world,
  // Input
  input,
  // Sound
  sound,
  // Animation
  createAnimator, animatorPlay, animatorUpdate, animatorSprite,
  // Particles
  emitBurst, updateParticles, renderParticles,
  // Scene
  getPlayerId, setPlayerId, registerScenes, loadScene, clearSceneEntities,
  setNpcClipFactory, spawnSceneNpcs, spawnSceneChests, updateTransition,
  // Flags
  setFlag, clearFlag, getFlag, hasFlags, onFlags,
  // Dialog
  dialog, sysDialog, renderDialog,
  // Cutscene
  cutscene,
  // Combat
  sysSwing, sysProjectile, sysDamage, spawnAttack,
  // Enemy
  sysEnemy, spawnEnemy, spawnRangedEnemy,
  // Spawner
  createSpawner, sysSpawner,
  // Chest
  sysChestLoot,
  // Save/Load
  saveLoad, setSaveKey, renderSaveNote, showNote,
  // Game loop systems
  engineTick, sysInput, sysAI, sysMovement, sysSpatialHash,
  sysAnimation, sysCamera, sysSceneTransition, sysRender,
  // HUD
  hud, renderHUD,
  // Minimap
  renderMinimap,
  // Transition
  renderTransitionOverlay, sceneTransition, getScenes,
} from './pixelGameEngine/index.js';
```

---

## What's New in v5.2

- **sysEnemy** — Four-state machine (idle → patrol → chase → attack) with waypoints, leash, kite, melee, and cooldown logic. Replaces the legacy `sysEnemyAI` stub.
- **spawnRangedEnemy** — Thin factory over `spawnEnemy` that wires a projectile weapon with ranged-appropriate defaults (wider alert/attack ranges, kite distance, slower speed).
- **Enemy Spawner** — `createSpawner` / `sysSpawner` monitor a live enemy by ECS id and respawn it on a timer when the entity is gone. A `flagName` guard supports permanent kills.
- **Aggro Table** — `_aggroTableAlert` / `sysAggroTable` propagate alarm state across a named group. When one enemy enters `chase`, idle and patrolling group-mates within `propagateRadius` also transition to `chase`.
- **Line-of-Sight** — `hasLineOfSight(ax, ay, bx, by)` runs an integer Bresenham tile-walk on the collision layer. `alertRange` only fires when no solid tile blocks the vector; bypassed for aggro-table propagation.
- **Lost-Sight Timer** — Chase state tracks `lostSightTimer`. If LOS stays broken for `lostSightMax` seconds the enemy aborts to idle; it searches `lastKnownX/Y` while the timer runs.
- **DRY refactor** — Shared helpers extracted: `_rasterizeBuf`, `_dist2`, `_toCardinal`, `_enemyClipsFromSprite`, `_applyWalkAnim`, `_enemyCanSeePlayer`. Removed all inlined duplicates across sections.

---

## What's New in v5.1

- **World Y offset** — Game world clamped below HUD strip. `WORLD_OFFSET_Y = HUD_H` (10px). `camera.toScreen()` applies the offset automatically.
- **HUD system** — Hearts, coins, 4 item slots with selection highlighting and use-handler registration.
- **Particles** — Pooled world-space particles with alpha-blended fadeout. Preset bursts: `chest`, `levelup`, `hit`, `portal`.
- **Flags** — Named boolean game state. Watchers fire callbacks when conditions are met. NPC dialog branches can `require` or `exclude` flags.
- **Cutscene system** — Sequenced command runner: `wait`, `dialog`, `sfx`, `bgm`, `lockInput`, `move`, `setFlag`, and more.
- **Chest system** — ECS chest entities with open animation, loot spawn, particle burst, and optional flag gating.
- **Minimap** — Downsampled collision layer rendered to a configurable corner of the screen.

---

## Templates

### `pixel-canvas-zelda.html`
Extended Zelda-style top-down game demonstrating the full enemy pipeline: patrol routes, aggro groups, ranged enemies, spawners, and LOS-gated alerting.

### `pixel-canvas-platformer.html`
Side-scrolling platformer. Gravity, one-way platforms, horizontal scroll camera, multi-character selection.

---

## Engine API

### Rendering

- Fixed logical resolution (`cols × tileSize` × `rows × tileSize`) scaled to window via CSS `image-rendering: pixelated`
- Single `Uint8ClampedArray` framebuffer; one `putImageData` call per frame via `flushBuffer()`
- 32-color indexed palette; sprites defined as flat 64-element integer arrays (palette indices or `null` for transparent)
- Sprite cache: palette indices rasterized to RGBA buffers once at startup via `buildSpriteCache(sprites)`
- Palette swap: per-sprite index remapping without mutating source data via `buildPaletteSwap(sprite, map)`
- Bitmap font: 5×7 pixel glyphs; renders directly into framebuffer via `drawText(str, x, y, palIdx)`
- **HUD strip**: top 10px (`HUD_H`) reserved; world rendering begins at `WORLD_OFFSET_Y`

```js
// Sprite cache — call once before the game loop.
buildSpriteCache({
  player: [/* 64 palette indices or null */],
  grass:  [/* ... */],
});

// Framebuffer draw calls (call each frame between clearBuffer and flushBuffer).
clearBuffer(palIdx);                        // fill entire buffer with palette color
fillRectPx(x, y, w, h, palIdx);            // screen-space rect
fillRectWorld(wx, wy, w, h, palIdx);        // world-space rect (camera-offset)
drawText('HELLO', x, y, palIdx);
drawBox(x, y, w, h, borderPal, fillPal);
blendPixel(x, y, r, g, b, a);
flushBuffer();                              // single putImageData to canvas
```

---

## Tilemaps

Three-layer system: `BG` (terrain), `Objects` (decor/walls), `Collision` (boolean solid map). Named tile animations with configurable FPS.

```js
registerTileAnims({
  water: { frames: ['water0', 'water1'], fps: 2 },
});

// Render layers each frame.
drawTilemap(worldState.layerBG,      elapsed);
drawTilemap(worldState.layerObjects, elapsed);
```

---

## HUD System

```js
hud.setItem(slot, spriteName)
hud.cycleSlot(±1)
hud.registerItemUse(spriteName, fn)
hud.useSelectedItem()
hud.addCoins(n)
hud.addHp(n)
```

---

## Flags

```js
setFlag(name)
clearFlag(name)
getFlag(name) → bool
hasFlags(...names) → bool
onFlags(['flagA','flagB'], fn, { once: true })
```

NPC dialog branches use `requires` and `excludes` arrays. Branches may include `setFlags`, `clearFlags`, `addCoins`, `addHp`, `emit`, and `runScript`.

---

## Cutscene System

```js
cutscene.run(commands)
cutscene.stop()
cutscene.isRunning() → bool
cutscene.isInputLocked() → bool
```

Supported commands: `wait`, `dialog`, `sfx`, `bgm`, `stopBgm`, `lockInput`, `move`, `setFlag`, `clearFlag`, `emit`, `note`, `transition`.

---

## Chest System

```js
// Scene config
chests: [
  {
    tileX: 5, tileY: 8, flagName: 'chest_5_8',
    loot: [{ sprite: 'coin_item', type: 'coin', onPickup: () => hud.addCoins(3) }]
  }
]
```

`flagName` gates re-spawn on scene reload. Open sequence: sprite swap → loot spawn → `chest` particle burst → SFX `chest_open`.

---

## Sound Engine

Zero-dependency, procedural audio built on the Web Audio API. All sound data is defined in code as note strings — no audio files required.

### Initialization

`AudioContext` is created lazily on the first user gesture (keydown or pointerdown). Manual initialization is unnecessary; the engine wires both events automatically.

```js
sound.init()   // called automatically; safe to call manually to unlock context early
```

### Registration

```js
sound.registerTracks({ trackName: trackDef, ... })   // BGM library
sound.registerSFX({ sfxName: trackDef, ... })        // SFX library
```

Both calls replace the entire library for their type — call once at startup with all entries.

### Playback

```js
sound.playBGM(name)   // cross-fade to named BGM track; no-op if already playing
sound.stopBGM()       // immediately stop current BGM and cancel loop timer
sound.playSFX(name)   // fire named SFX as a one-shot; does not interrupt BGM
sound.setVolume(v)    // master gain 0.0–1.0; default 0.12
```

**Cutscene integration:**

```js
cutscene.run([
  { cmd: 'bgm',    name: 'boss' },
  { cmd: 'dialog', name: 'BOSS', lines: ['YOU DARE ENTER MY LAIR?'] },
  { cmd: 'sfx',    name: 'alert' },
  { cmd: 'wait',   seconds: 0.5 },
  { cmd: 'stopBgm' },
  { cmd: 'bgm',    name: 'battle' },
]);
```

---

## Enemy System

### State Machine

`sysEnemy(delta)` drives a four-state machine for every entity with an `enemyAI` component.

```
idle ──(timeout + waypoints)──► patrol
 ▲  ◄────────(waypoint reached)──┘  │
 │                                  │
 └──────────(leash broken)──────────┤
 │                                  ▼
 └──────(player not found)────── chase ──(in range)──► attack
                                    ◄──(out of range)────┘
```

State transition rules:

- **idle → patrol**: after `idleDuration` seconds if `waypoints` are defined.
- **idle / patrol → chase**: player enters `alertRange` (LOS-gated), or a group-mate raises an alarm via the aggro table.
- **chase → attack**: player enters `attackRange` AND enemy has live LOS.
- **chase → idle**: leash exceeded, player entity gone, or `lostSightTimer >= lostSightMax`.
- **attack → chase**: player moves beyond `attackRange * 2`.
- **attack → idle**: leash exceeded.

Entering `chase` emits a `sparkle` burst, plays SFX `alert`, and writes an alarm to the enemy's `aggroGroup` if set.

---

## Save / Load System

```js
setSaveKey('myGame_v1')   // default: 'pixelCanvas_v5'

saveLoad.save()           // → bool
saveLoad.load()           // → bool
saveLoad.hasSave()        // → bool
```

### Payload Shape (Version 2)

```js
{
  version: 2,
  scene:   string,
  x:       integer,
  y:       integer,
  flags:   { flagName: true, ... },
  hud:     { hp, maxHp, coins }
}
```

### Default Bindings

The engine registers F5 (save) and F9 (load) `keydown` listeners unconditionally at module evaluation time. To override:

```js
window.addEventListener('keydown', e => {
  if (e.code === 'F5' || e.code === 'F9') {
    e.stopImmediatePropagation();
    // Your own save logic here.
  }
}, { capture: true });
```

### Custom Save Triggers

```js
// In-game menu button
document.getElementById('save-btn').addEventListener('click', () => {
  sound.init();
  if (saveLoad.save()) {
    sound.playSFX('save');
    showNote('PROGRESS SAVED');
  } else {
    showNote('SAVE FAILED');
  }
});

// Auto-save on scene enter
registerScenes({
  town: {
    onEnter() {
      if (saveLoad.save()) showNote('AUTO-SAVED', 1.0);
    },
  },
});
```

---

## Boss Entity Pattern

Bosses are composed from existing primitives — `spawnEnemy` or `spawnRangedEnemy` as the base, with phase logic, arena locking, and cutscene hooks wired through `onHit`, `onDeath`, flags, and `alertGroup`. The engine has no dedicated boss subsystem.

---

## Combat System

```js
spawnAttack(ownerId, weapon, wx, wy, dirX, dirY)
```

| `weapon.type` | Entity created | Lifetime |
|---|---|---|
| `'melee'` | `swing` entity offset in front of attacker | `sysSwing` destroys after `swingLife` seconds |
| `'ranged'` / `'spell'` | `projectile` entity at attacker position | `sysProjectile` destroys on wall/edge; `sysDamage` on hit |

### Call Order Requirements

```
sysSwing(delta)
sysProjectile(delta)
sysDamage(delta)       ← after swing/projectile, before sysSpawner
sysSpawner(delta)
```

### Example: Complete Entity Setup

```js
// Player entity
setPlayerId(world.createEntity({
  persistent:  true,
  transform:   { x: 10 * TILE_SIZE, y: 10 * TILE_SIZE },
  velocity:    { dx: 0, dy: 0, speed: 50 },
  animator:    createAnimator(PLAYER_CLIPS, 'idle'),
  collider:    true,
  damageable: {
    hp: 6, maxHp: 6,
    iframes: 0, iframeMax: 1.5,
    team: 'player',
    onHit(vid, aid, amount) {
      hud.addHp(-amount);
      sound.playSFX('hurt');
      const tf = world.get(vid, 'transform');
      if (tf) emitBurst(tf.x + 4, tf.y + 4, 'hit');
    },
    onDeath(vid) { sound.playSFX('die'); },
  },
}));

// Melee enemy via spawner (respawns on death)
createSpawner(
  { tileX: 5, tileY: 5, sprite: 'skeleton', hp: 3, speed: 28 },
  { type: 'melee', respawnDelay: 8 }
);

// Ranged enemy
spawnRangedEnemy({
  tileX: 12, tileY: 8,
  sprite: 'mage',
  projSprite: 'fireball',
  hp: 2,
  alertRange: 72,
  aggroGroup: 'guards',
});
```