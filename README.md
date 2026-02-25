# PIXEL CANVAS ENGINE v5.2

A self-contained vanilla JavaScript pixel-art game engine for 8×8 tile-based games. Zero dependencies. Single `putImageData` call per frame.

## Repository Structure

```
pixel-canvas-engine.js           Core engine library (v5.2)
pixel-canvas-zelda.html          Zelda-style overworld demo with combat, items, and cutscenes
pixel-canvas-platformer.html     Side-scrolling platformer demo

```

---

## Quick Start

```html
<script src="pixel-canvas-engine.js"></script>
<script>
  PixelCanvas.init({ cols: 20, rows: 18, tileSize: 8 });
  PixelCanvas.loadScene('myScene');
  PixelCanvas.start();
</script>
```

Both HTML templates demonstrate full integration patterns. The engine makes no assumptions about genre.

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

- Fixed logical resolution (`cols × tileSize` × `rows × tileSize`) scaled to window via CSS `image-rendering: pixelated`
- Single `Uint8ClampedArray` framebuffer; one `putImageData` call per frame
- 32-color indexed palette; sprites defined as flat 64-element integer arrays (palette indices or `null` for transparent)
- Sprite cache: palette indices rasterized to RGBA buffers once at startup via shared `_rasterizeBuf`
- Palette swap: per-sprite index remapping without mutating source data
- Bitmap font: 5×7 pixel glyphs as 5-bit binary row masks; renders directly into framebuffer
- **HUD strip**: top 10px (`HUD_H`) reserved; world rendering begins at `WORLD_OFFSET_Y`

---

## Tilemaps

Three-layer system: `BG` (terrain), `Objects` (decor/walls), `Collision` (boolean solid map). Named tile animations with configurable FPS.

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

`AudioContext` is created lazily on the first user gesture (keydown or pointerdown). Manual initialization is unnecessary; the engine wires both events automatically. If the context is suspended (browser autoplay policy), it is resumed on the next gesture.

```js
sound.init()   // called automatically; safe to call manually to unlock context early
```

### Registration

Tracks and SFX are registered as named dictionaries before the game loop starts. Both use the same track format.

```js
sound.registerTracks({ trackName: trackDef, ... })   // BGM library
sound.registerSFX({ sfxName: trackDef, ... })        // SFX library
```

Both calls replace the entire library for their type — call once at startup with all entries. Calling multiple times overwrites the previous set.

### Playback

```js
sound.playBGM(name)   // cross-fade to named BGM track; no-op if already playing
sound.stopBGM()       // immediately stop current BGM and cancel loop timer
sound.playSFX(name)   // fire named SFX as a one-shot; does not interrupt BGM
sound.setVolume(v)    // master gain 0.0–1.0; default 0.12
```

`playBGM` is idempotent — calling it again with the same name does nothing. Switching scenes calls `sound.playBGM(scene.music)` automatically via `loadScene`. Scene transitions that reuse the same track name do not restart or interrupt playback.

`playSFX` is non-blocking — multiple SFX can overlap freely. If `AudioContext` is not yet initialized, the call is silently dropped.

### Volume

```js
sound.setVolume(0.5)    // 50% master volume
sound.setVolume(0)      // mute
sound.setVolume(1)      // maximum
```

All oscillators route through a single `GainNode` (`masterGain`) before reaching the destination. `setVolume` clamps its argument to `[0, 1]`.

### Track Format

Both BGM tracks and SFX share the same definition object shape:

```js
{
  bpm:      number,          // beats per minute — scales all note durations
  loop:     bool,            // BGM only; true = reschedule on completion via setTimeout
  channels: [                // polyphonic: all channels play simultaneously
    {
      instrument: string,    // Web Audio OscillatorNode type (see below)
      notes:      string,    // space-separated note tokens (see Note Format below)
    },
    // ... additional channels
  ],
}
```

`loop: false` (or omitted) is the correct setting for SFX — one-shot playback. `loop: true` on an SFX entry has no effect because SFX are scheduled via `_scheduleTrack`, not the BGM loop mechanism.

### Oscillator Types (`instrument`)

These are the four native `OscillatorNode` waveform types supported by the Web Audio API:

| Value | Character | Best use |
|---|---|---|
| `'square'` | Bright, buzzy, retro | Lead melody, UI confirm, damage hits |
| `'triangle'` | Soft, flute-like | Bass lines, gentle UI, heal effects |
| `'sine'` | Smooth, pure tone | Ambient pads, cave atmosphere |
| `'sawtooth'` | Harsh, aggressive | Boss themes, alarm sounds |

### Note Format

Notes string is whitespace-delimited. Each token is one of:

```
NOTE OCTAVE : BEATS
  A4:1        — A natural, octave 4, 1 beat
  C#5:0.5     — C sharp, octave 5, half a beat
  R:2         — rest, 2 beats (silence; sustains the channel timeline)
```

Full grammar:

```
token     := note_token | rest_token
note_token := PITCH OCTAVE ':' BEATS
rest_token := 'R' ':' BEATS

PITCH     := natural | sharp
natural   := 'C' | 'D' | 'E' | 'F' | 'G' | 'A' | 'B'
sharp     := 'C#' | 'D#' | 'F#' | 'G#' | 'A#'
OCTAVE    := integer (0–8; middle C = C4; A440 = A4)
BEATS     := float > 0
```

Beat duration in seconds = `60 / bpm * beats`. At `bpm: 480`, one beat is 125 ms. Channels with different total durations are padded to the longest by the scheduler; the track's `duration` is `max(channelDurations)`.

Each note gets a minimal ADSR envelope applied via `GainNode`:

- **Attack**: 10 ms linear ramp to 0.7
- **Sustain**: held at 0.7 for `duration - release`
- **Release**: linear ramp to 0 over `min(50ms, duration × 25%)`

There is no configurable per-note ADSR — the envelope is fixed. Shape the overall timbre with `instrument` choice and `bpm`.

### Reference Frequencies

Octave 4 base frequencies used by `_noteToHz`:

| Note | Hz |
|---|---|
| C4 | 261.63 |
| D4 | 293.66 |
| E4 | 329.63 |
| F4 | 349.23 |
| G4 | 392.00 |
| A4 | 440.00 |
| B4 | 493.88 |

Other octaves are computed as `freq × 2^(octave - 4)`.

### Complete Examples

**Minimal BGM track — two-channel dungeon loop:**

```js
sound.registerTracks({
  dungeon: {
    bpm: 70, loop: true,
    channels: [
      { instrument: 'sine',
        notes: 'A3:2 R:1 G3:1 F3:2 R:1 E3:1 D3:2 R:2 A2:4 R:2' },
      { instrument: 'triangle',
        notes: 'A2:4 R:4 F2:4 R:4 G2:4 R:4 A2:8' },
    ],
  },
  overworld: {
    bpm: 140, loop: true,
    channels: [
      { instrument: 'square',
        notes: 'E5:0.5 G5:0.5 A5:1 E5:0.5 G5:0.5 B5:1 A5:0.5 G5:0.5 A5:0.5 E5:0.5 D5:2 R:1' },
      { instrument: 'triangle',
        notes: 'A3:2 A3:2 F3:2 G3:2 A3:2 A3:2 G3:2 E3:2' },
    ],
  },
});
```

**SFX library — common game events:**

```js
sound.registerSFX({
  // Short ascending triad — item pickup or confirm
  confirm:     { bpm: 960, channels: [{ instrument: 'square',   notes: 'C5:0.1 E5:0.1 G5:0.2' }] },

  // Single tick — dialog advance
  dialog:      { bpm: 960, channels: [{ instrument: 'square',   notes: 'C6:0.05' }] },

  // Descending pair — cancel or menu back
  cancel:      { bpm: 960, channels: [{ instrument: 'triangle', notes: 'E5:0.1 C5:0.1' }] },

  // Bright arpeggio — coin pickup
  coin:        { bpm: 960, channels: [{ instrument: 'square',   notes: 'A5:0.06 C6:0.08 E6:0.12' }] },

  // Buzzy downward drop — player hurt
  hurt:        { bpm: 480, channels: [{ instrument: 'square',   notes: 'A4:0.06 G4:0.1' }] },

  // Soft ascending triad — heal
  heal:        { bpm: 960, channels: [{ instrument: 'triangle', notes: 'E5:0.08 G5:0.08 C6:0.15' }] },

  // Two-channel chest open — rising melody + bass thud
  chest_open:  { bpm: 480, channels: [
    { instrument: 'square',   notes: 'C5:0.08 E5:0.08 G5:0.08 C6:0.2' },
    { instrument: 'triangle', notes: 'C3:0.44' },
  ]},

  // Downward crunch — explosion or bomb
  bomb:        { bpm: 240, channels: [
    { instrument: 'square',   notes: 'G3:0.1 F3:0.1 E3:0.1 D3:0.15' },
    { instrument: 'triangle', notes: 'C2:0.45' },
  ]},

  // Short swoosh — sword swing
  sword_swing: { bpm: 480, channels: [{ instrument: 'square',   notes: 'G5:0.05 C6:0.07' }] },

  // Soft pluck — bow fire
  bow_fire:    { bpm: 480, channels: [{ instrument: 'triangle', notes: 'E6:0.04 A5:0.06' }] },

  // Alert chime — enemy spots player (used by sysEnemy)
  alert:       { bpm: 480, channels: [{ instrument: 'sine',     notes: 'A4:0.1 C#5:0.1 E5:0.1 A5:0.2 R:0.1 A6:0.3' }] },
});
```

**Calling from game code:**

```js
// Scene music starts automatically via loadScene → sound.playBGM(scene.music).
// Manual calls for transitions:
sound.playBGM('boss');         // switch to boss track mid-scene
sound.stopBGM();               // silence music during a cutscene pause
sound.playBGM('overworld');    // resume after cutscene

// SFX from any system:
sound.playSFX('coin');         // non-blocking; overlaps freely
sound.playSFX('alert');        // called by _enemyTransition on → chase
sound.playSFX('portal');       // called by sysSpawner pre-spawn warning

// Volume slider (e.g. options menu):
sound.setVolume(0.08);         // quieter than default 0.12
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

### Constraints and Notes

No audio files are loaded. All audio is synthesized at runtime using Web Audio API oscillators. This means the sound engine works in any environment that supports the Web Audio API without a server, but it cannot play `.mp3`, `.ogg`, or `.wav` files. If pre-recorded audio is needed, supplement with a separate `<audio>` element outside the engine.

SFX do not have a polyphony cap — many simultaneous calls will each allocate an `OscillatorNode`. For high-rate events (particle collisions, rapid projectiles) prefer calling `playSFX` at a throttled rate from game code rather than on every frame.

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
- **idle / patrol → chase**: player enters `alertRange` (LOS-gated by default), or a group-mate raises an alarm via the aggro table.
- **chase → attack**: player enters `attackRange` AND enemy has live LOS.
- **chase → idle**: leash exceeded, player entity gone, or `lostSightTimer >= lostSightMax`.
- **attack → chase**: player moves beyond `attackRange * 2`.
- **attack → idle**: leash exceeded.

Entering `chase` emits a `sparkle` burst, plays SFX `alert`, and writes an alarm to the enemy's `aggroGroup` if set.

### spawnEnemy(def)

```js
spawnEnemy({
  x, y,                    // world-space px (or use tileX/tileY via scene config)
  sprite,                  // string (static) or clips object (animated)
  hp,                      // default 3
  speed,                   // default 28 px/s
  alertRange,              // default 48 px
  attackRange,             // default 14 px
  leashRange,              // default 96 px
  kiteRange,               // default 0 (melee; ranged sets > 0)
  idleDuration,            // default 1.8 s
  iframeMax,               // default 0.8 s
  waypoints,               // [{ x, y }, ...] patrol route
  weapon,                  // overrides _ENEMY_DEFAULT_WEAPON fields
  team,                    // default 'enemy'
  aggroGroup,              // string | null — joins a named alarm group
  propagateRadius,         // default 0 (whole group); px limit for alarm
  useLOS,                  // default true — gates alertRange with LOS check
  lostSightMax,            // default 2.5 s — give-up timer in chase state
  onHit,                   // fn(vid, attackerId, amount)
  onDeath,                 // fn(vid, attackerId)
});
```

Default melee weapon fields (`_ENEMY_DEFAULT_WEAPON`):

| Field | Default |
|---|---|
| `type` | `'melee'` |
| `damage` | `1` |
| `cooldownMax` | `1.2 s` |
| `knockback` | `40 px/s` |
| `swingW / swingH` | `12 / 10 px` |
| `swingLife` | `0.12 s` |

### spawnRangedEnemy(def)

A thin factory over `spawnEnemy` that wires a projectile weapon and applies ranged-appropriate defaults. All `spawnEnemy` fields are accepted and override the defaults below.

| Field | Ranged default | spawnEnemy default |
|---|---|---|
| `speed` | `20` | `28` |
| `hp` | `2` | `3` |
| `alertRange` | `72` | `48` |
| `attackRange` | `56` | `14` |
| `kiteRange` | `22` | `0` |
| `leashRange` | `120` | `96` |
| `idleDuration` | `2.5 s` | `1.8 s` |

Projectile weapon defaults (`_ENEMY_RANGED_WEAPON`):

| Field | Default |
|---|---|
| `type` | `'ranged'` |
| `projSpeed` | `90 px/s` |
| `projLife` | `2.0 s` |
| `damage` | `1` |
| `cooldownMax` | `1.8 s` |
| `knockback` | `20 px/s` |
| `piercing` | `false` |

`projSprite` is required — pass it directly on the def or nested under `def.weapon.projSprite`. A warning is logged if omitted.

**Minimal ranged enemy:**

```js
buildSpriteCache({ archer: [ /* 64 palette indices */ ], arrow: [ /* ... */ ] });

spawnRangedEnemy({
  x: 10 * TILE_SIZE,
  y:  6 * TILE_SIZE,
  sprite:     'archer',
  projSprite: 'arrow',
});
// Stands still; backs off when player closes within 22px; fires every 1.8s.
```

**Animated sprite with attack pose:**

```js
spawnRangedEnemy({
  x: 14 * TILE_SIZE, y: 3 * TILE_SIZE,
  projSprite: 'arrow',
  sprite: {
    idle:      { frames: ['archer'],      durations: 0.5  },
    walk_down: { frames: ['archer'],      durations: 0.2  },
    walk_up:   { frames: ['archer'],      durations: 0.2  },
    walk_side: { frames: ['archer'],      durations: 0.2  },
    attack:    { frames: ['archer_draw'], durations: 0.12 },
  },
});
```

**Tuned long-range mage:**

```js
spawnRangedEnemy({
  x: 18 * TILE_SIZE, y: 9 * TILE_SIZE,
  sprite: 'mage', projSprite: 'fireball',
  hp: 4, speed: 14,
  alertRange: 100, attackRange: 88, kiteRange: 40, leashRange: 160,
  weapon: { damage: 2, cooldownMax: 2.5, projSpeed: 70, projLife: 2.8, knockback: 35 },
});
```

---

## Enemy Spawner

`createSpawner` wraps a single enemy in a lifecycle manager. It watches the enemy's ECS id and restarts it after death unless a `flagName` guard has been set.

```js
createSpawner(def, options?)
```

| Option | Default | Description |
|---|---|---|
| `type` | `'melee'` | `'melee'` or `'ranged'` — selects factory |
| `flagName` | `null` | Flag name; when set the spawner never restarts |
| `respawnDelay` | `8 s` | Seconds from death to next spawn |

The first enemy is spawned immediately on `createSpawner` unless `flagName` is already set. A `portal` particle burst fires at the spawn point `PRE_SPAWN_WARN` seconds (default `0.4 s`) before each respawn as a player warning.

**Always-respawn:**

```js
createSpawner({ tileX: 3, tileY: 7, sprite: 'slime' }, { respawnDelay: 6 });
```

**Permanent kill — enemy dies once and never returns:**

```js
createSpawner({
  tileX: 8, tileY: 5,
  sprite: 'skeleton',
  onDeath: (vid) => {
    setFlag('skeleton_boss_dead');
    sound.playSFX('boss_down');
  },
}, { flagName: 'skeleton_boss_dead', respawnDelay: 0 });
```

**Scene config integration** — add an `enemies` array to any scene definition:

```js
enemies: [
  {
    tileX: 5, tileY: 8,
    sprite: 'guard',
    type: 'melee',
    respawnDelay: 10,
    flagName: 'guard_5_8_dead',   // omit for always-respawn
    waypoints: [
      { x: 4 * TILE_SIZE, y: 8 * TILE_SIZE },
      { x: 8 * TILE_SIZE, y: 8 * TILE_SIZE },
    ],
  },
  {
    tileX: 12, tileY: 4,
    sprite: 'archer', projSprite: 'arrow',
    type: 'ranged',
    respawnDelay: 12,
  },
]
```

`spawnSceneEnemies(scene)` (called automatically by `loadScene`) iterates this array and calls `createSpawner` for each entry. Entries whose `flagName` is already set are skipped entirely — permanent kills survive scene reloads.

Call `sysSpawner(delta)` once per frame, **after** `sysDamage`, so death detection is never one frame behind.

---

## Aggro Table

When one enemy enters `chase`, idle and patrolling members of the same named group are alerted within one tick — no visual LOS required for propagation.

**enemyAI fields:**

| Field | Default | Description |
|---|---|---|
| `aggroGroup` | `null` | Named group. `null` disables propagation. |
| `propagateRadius` | `0` | Max px from alert origin to propagate. `0` = whole group. |

**How it works:**

1. Enemy enters `chase` → `_enemyTransition` calls `_aggroTableAlert(group, alertX, alertY)`. The table entry is created or its TTL is refreshed.
2. Each tick, idle and patrol enemies in the same group call `_aggroTableTriggered(ai, tf)`. Returns `true` when a live alarm exists and the enemy is within `propagateRadius` (or radius is `0`).
3. TTL decays only when no group member is currently in `chase` or `attack`. Any active combat member keeps the alarm alive.
4. `sysAggroTable(delta)` is called inside `engineTick` — no manual wiring needed.

**Example — three guards share an alarm:**

```js
const groupName = 'courtyard_guards';

for (let i = 0; i < 3; i++) {
  spawnEnemy({
    x: (4 + i * 3) * TILE_SIZE, y: 10 * TILE_SIZE,
    sprite: 'guard',
    aggroGroup: groupName,
    propagateRadius: 80,   // only alert guards within 80px of the alarm point
    waypoints: [
      { x: (3 + i * 3) * TILE_SIZE, y: 10 * TILE_SIZE },
      { x: (6 + i * 3) * TILE_SIZE, y: 10 * TILE_SIZE },
    ],
  });
}
// Spotting one guard alerts all three within 80px.
// Set propagateRadius: 0 to alert all courtyard_guards regardless of distance.
```

Aggro propagation bypasses LOS intentionally — a guard's shout is a social signal, not a visual one. Propagated alarms do not supply `lastKnownX/Y` to recipients; alerted enemies move toward the `alertX/Y` of the group entry, not the player directly, until they establish their own LOS.

### TTL Decay Rules

#### Data model

Each group has exactly one entry in the `aggroTable` Map:

```
aggroTable: Map<groupName: string, {
  ttl:    number,   // seconds remaining before the alarm expires
  alertX: number,   // world-space X of the most recent alarm write
  alertY: number,   // world-space Y of the most recent alarm write
}>
```

`AGGRO_TTL_DEFAULT = 15` and `AGGRO_TTL_MIN = 0` are constants. Every write sets TTL to `AGGRO_TTL_DEFAULT`; the entry is deleted when TTL reaches `AGGRO_TTL_MIN`.

#### Frame-by-frame execution

`sysAggroTable(delta)` runs once per frame inside `engineTick`. Its exact steps:

1. **Build `hotGroups`** — iterate every entity with an `enemyAI` component. If `ai.aggroGroup` is non-null and `ai.state === 'chase' || ai.state === 'attack'`, add the group name to a local `Set`.

2. **Tick every entry** — iterate `aggroTable`:
   - If the group is in `hotGroups`: skip (`continue`). TTL is not touched.
   - Otherwise: `entry.ttl -= delta`.
   - If `entry.ttl <= AGGRO_TTL_MIN (0)`: `aggroTable.delete(group)`.

The two-phase structure means the hold check is always evaluated before decay — a group cannot decay and be deleted in the same frame that a member is still fighting.

#### Hold condition

A group's TTL is frozen for any frame in which at least one member ECS entity has `state === 'chase'` or `state === 'attack'`. The hold is evaluated fresh every frame; it is not stored state. A group with ten members where nine are idle and one is still chasing is fully held.

Dead enemies are absent from `world.query('enemyAI')` — `world.destroyEntity` removes them from the ECS store. A group member dying mid-combat does not sustain the hold; the remaining live combatants do.

#### Decay condition

Once every live entity in the group has left `chase` and `attack` — whether by leash-break, `lostSightMax` expiry, or `_enemyTransition('idle')` — the group is "cold" and TTL decrements by `delta` each frame. At 60 fps with `AGGRO_TTL_DEFAULT = 15`, a cold group expires after exactly 900 frames (~15 seconds) assuming no refresh.

This 15-second post-combat window means an enemy that leashes back to patrol will still trigger newly spawned or recently woken group-mates. The window only closes once all members have disengaged.

#### Refresh behavior and `alertX/Y` drift

Every call to `_aggroTableAlert(groupName, x, y)` — whether from `_enemyTransition` or the public `alertGroup()` — does two things unconditionally:

- Resets `entry.ttl` to `AGGRO_TTL_DEFAULT`.
- **Overwrites** `entry.alertX` and `entry.alertY` with the new coordinates.

There is no averaging, no origin preservation. The last write wins.

This produces **alarm origin drift** during cascade propagation. When enemy A spots the player and transitions to chase, the alarm is written at A's position. On the next tick, enemy B (same group) reads the alarm and transitions to chase. `_enemyTransition` calls `_aggroTableAlert` again — now at B's position. The alarm origin is now B's position, not A's. On the following tick, enemy C measures its distance to B's position, not A's. This cascade continues with each newly alerted enemy overwriting the origin.

Practical consequence: with `propagateRadius > 0`, enemies that are far from the original alerter but close to a cascaded alerter may react; enemies close to the original but far from every cascading alerter may not. If deterministic propagation from a fixed origin is required, call `alertGroup(name, x, y)` manually with a pinned coordinate rather than relying on cascade.

#### Manual TTL control

```js
alertGroup(groupName, x, y)   // write/refresh alarm; resets TTL to 15s, sets alertX/Y
clearAggroGroup(groupName)     // delete entry immediately; does NOT affect chasing enemies
aggroTableActive(groupName)    // → bool: true if entry exists (regardless of TTL value)
```

`clearAggroGroup` removes the Map entry. Enemies currently in `chase` or `attack` are not affected — their state machine does not consult the table after the initial wake. Only idle/patrolling members that have not yet reacted will fail to trigger.

`alertGroup` called with the default `(x=0, y=0)` writes the origin to the world top-left corner. Members with `propagateRadius > 0` measure their distance to `(0, 0)`. If they are farther than `propagateRadius` from that corner they will not react. **Always supply explicit world-space coordinates when calling `alertGroup` manually**, typically the player's or triggering entity's transform position.

---

### Edge Cases

#### Shared group name — intentional merge vs. accidental collision

The aggro table is a flat `Map<string, entry>`. Group identity is exactly the name string — there is no namespace isolation, no scope, no per-scene partitioning. Two `spawnEnemy` calls with `aggroGroup: 'guards'` share one entry with one TTL and one `alertX/Y`.

**Intentional merge** — two squads that should alert together. Correct behavior; use the same name.

**Accidental collision** — two independent squads in different rooms that happen to share a name. Consequences:

- Any member of either squad entering `chase` writes an alarm readable by every member of both squads.
- `hotGroups` treats them as a single group: one squad fighting keeps the other squad's alarm alive, even across rooms.
- `alertX/Y` is overwritten by the most recent alerter from either squad. Members with `propagateRadius > 0` in the "other" squad measure their distance to an origin that may be in a completely different part of the map.
- `clearAggroGroup` silences both squads simultaneously.

**Rule**: use fully qualified names for every independent group. Convention: `'sceneName_roomName_squadRole'` — e.g. `'cave_b2_archers'`, `'overworld_east_patrols'`. Names only need to be unique within the active session; after `loadScene` replaces all entities, old group names pose no risk provided the new scene uses different names or clears them in `onEnter`.

#### Scene reload — aggroTable is not cleared

`clearSceneEntities` destroys all non-persistent ECS entities. The `aggroTable` Map is a module-level variable and is **not** reset by `loadScene` or `clearSceneEntities`. After a scene transition:

- All enemy entities are gone.
- `sysAggroTable` on the next frame finds zero entities in `world.query('enemyAI')` → `hotGroups` is empty → every entry decays by `delta`.
- Entries expire naturally over up to `AGGRO_TTL_DEFAULT` seconds.
- If the new scene spawns enemies with matching group names within that window, they will read the stale alarm entry and transition to `chase` on their first idle tick.

**Fix**: call `clearAggroGroup` for every group name that could carry over. The `onEnter` hook is the correct place:

```js
onEnter() {
  clearAggroGroup('cave_guards');   // prevent stale alarm from prior visit
  clearAggroGroup('cave_archers');
}
```

Alternatively use fully unique per-session group names (e.g. append the scene name).

#### Mixed `propagateRadius` within one group

A group's members may have different `propagateRadius` values. The per-enemy radius is a property of the individual `enemyAI` component, not of the group entry. `_aggroTableTriggered` reads `ai.propagateRadius` and `entry.alertX/Y`:

- Members with `propagateRadius: 0`: always triggered — radius check is skipped via the `!ai.propagateRadius` branch.
- Members with `propagateRadius: N`: triggered only if `dist(ai.transform, alertX/Y) <= N`.

Both coexist in the same group with one shared entry. A group of six guards where three have radius `0` and three have radius `48` will universally alert the first three and conditionally alert the second three based on their distance to the current `alertX/Y`. Because `alertX/Y` drifts during cascade, a member with a finite radius may react to cascade B but not the original alarm A.

#### Cross-group radius — groups are fully isolated

`_aggroTableTriggered` looks up `aggroTable.get(ai.aggroGroup)` — the lookup key is the enemy's own `aggroGroup` string. It never inspects other groups' entries. An enemy in `'group_a'` cannot be triggered by `'group_b'`'s alarm regardless of:

- Physical proximity of spawn positions.
- `propagateRadius` values.
- `alertX/Y` of `'group_b'` being inside `'group_a'` members' patrol radius.

Cross-group waking requires an explicit bridge: either a shared group name (same string = same group), or a manual `alertGroup` call from game code.

```js
// Bridge: alarming group_a also alarms group_b at the same origin.
onHit(vid) {
  const tf = world.get(vid, 'transform');
  if (tf) alertGroup('group_b', tf.x, tf.y);
}
```

#### `propagateRadius: 0` is falsy — exact integer zero means whole-group

The guard in `_aggroTableTriggered` is `if (!ai.propagateRadius) return true`. JavaScript's `!0` is `true`, so the whole-group branch fires for the value `0`. There is no distinction between `0`, `null`, `undefined`, or `false` at this check — all are treated as "no radius constraint, broadcast to all members."

**Any positive integer, including `1`**, enables the distance check. `propagateRadius: 1` is a valid way to restrict propagation to essentially zero range (only the alerter itself, whose distance to its own position is `0`).

#### Respawned enemies re-enter live alarms

`createSpawner` stores the original `def` object and re-passes it to `spawnEnemy` on each respawn. The new entity gets the same `aggroGroup` string. On its first idle tick, `_aggroTableTriggered` is evaluated. If the group's alarm is still live — because other members are still fighting or the TTL has not expired — the freshly spawned enemy immediately transitions to `chase`. It receives no `lastKnownX/Y` from the alarm; it inherits the group's `alertX/Y` as a rough search target on its first direct sighting.

To prevent a respawned enemy from joining a fight it was not alive for, either use `flagName` to permanently kill it, or call `clearAggroGroup` before the respawn fires. The spawner's `PRE_SPAWN_WARN` window (default `0.4 s`) is too short to serve as a reliable gap; prefer explicit group management.

---

## Line-of-Sight

```js
hasLineOfSight(ax, ay, bx, by) → bool
```

Integer Bresenham tile-walk on the collision layer. Coordinates are world-space pixels. Returns `false` if any solid tile intersects the path between the two points, including the endpoint tiles.

**Cost:** O(max(|Δtx|, |Δty|)) — at `alertRange: 48`, `TILE_SIZE: 8`, at most 6 `isSolid()` calls per enemy per frame (each an O(1) array index). A 20-enemy scene costs ≤ 120 calls/frame — negligible next to `sysRender`.

**Scope:** LOS gates `alertRange` only. It does not affect the `chase` or `attack` states — use `lostSightMax` for re-occlusion behaviour. Aggro-table propagation also bypasses LOS by design.

**`useLOS` flag:**

| Value | Behaviour |
|---|---|
| `true` (default) | `alertRange` only triggers when no solid tile blocks the path |
| `false` | `alertRange` triggers on distance alone — identical to pre-v5.2 |

Set `useLOS: false` for open arenas, omniscient constructs, or boss phases with global awareness.

**Usage examples:**

```js
// Default — enemy hides behind walls
spawnEnemy({ x: 6*T, y: 4*T, sprite: 'guard' });

// Omniscient watcher — no LOS gate
spawnEnemy({ x: 10*T, y: 8*T, sprite: 'eye', useLOS: false, alertRange: 120 });

// Ranged enemy still uses LOS for the initial spot
spawnRangedEnemy({ x: 14*T, y: 3*T, sprite: 'archer',
  projSprite: 'arrow', useLOS: true, alertRange: 72 });

// General-purpose query — check before a scripted shot
if (hasLineOfSight(
    npcTf.x + TILE_SIZE/2, npcTf.y + TILE_SIZE/2,
    playerTf.x + TILE_SIZE/2, playerTf.y + TILE_SIZE/2)) {
  spawnAttack(npcId, sniperWeapon, npcTf.x, npcTf.y, 1, 0);
}

// Performance: cache LOS for 100ms per enemy (reduces calls 6× at 60fps)
if (ai.losCacheTimer <= 0) {
  ai.losCache      = hasLineOfSight(tf.x+4, tf.y+4, ptf.x+4, ptf.y+4);
  ai.losCacheTimer = 0.1;
}
ai.losCacheTimer -= delta;
```

---

## Lost-Sight Timer

When an enemy in `chase` loses LOS to the player it does not immediately abort — it moves toward `lastKnownX/Y` (the last confirmed player position) while a timer runs. If LOS is not re-established within `lostSightMax` seconds, the enemy transitions to `idle`.

Enemies with `useLOS: false` are unaffected — the timer never advances.

**enemyAI fields (managed internally):**

| Field | Default | Description |
|---|---|---|
| `lostSightMax` | `2.5 s` | Seconds of uninterrupted LOS absence before aborting to idle |
| `lostSightTimer` | `0` | Internal accumulator. Reset to `0` on every `→ chase` transition and whenever LOS is clear. |
| `lastKnownX/Y` | spawn point | Last confirmed player position with clear LOS. Updated each frame sight is held. Enemy pursues this point while the timer runs. |

**Configuration guide:**

| `lostSightMax` | Effect |
|---|---|
| `0` | Abort immediately on any occlusion |
| `2.5` (default) | ~2.5 s of searching before giving up |
| `30` | Approximate persistent tracking |

**Chase-state logic (summary):**

```
has LOS  → lastKnownX/Y updated, lostSightTimer = 0, move toward player
no LOS   → lostSightTimer += delta, move toward lastKnownX/Y
           reached lastKnownX/Y → stop and wait (timer still ticking)
           lostSightTimer >= lostSightMax → _enemyTransition('idle')
```

Leash-broken abort takes priority — both paths reach idle, but leash is checked first.

**Example — short give-up:**

```js
spawnEnemy({ x: 5*T, y: 8*T, sprite: 'guard', lostSightMax: 1.0 });
// Guard searches for 1 second after losing sight, then returns to patrol.
```

**Example — persistent tracker:**

```js
spawnEnemy({ x: 9*T, y: 4*T, sprite: 'knight', lostSightMax: 8.0, hp: 6, speed: 32 });
// Knight searches for 8 seconds — very persistent; player must break far away.
```

**Debug overlay (read timer from game code):**

```js
const ai = world.get(enemyId, 'enemyAI');
if (ai?.state === 'chase' && ai.lostSightTimer > 0) {
  const pct = ai.lostSightTimer / ai.lostSightMax;   // 0..1
  drawText('?', screenX, screenY - 10, pct > 0.5 ? 26 : 7);
}
```

---

## Boss Entity Pattern

A boss is a regular `spawnEnemy` entity extended with three concerns wired entirely in game code: multi-phase health thresholds, per-phase cutscene hooks, and arena lock. No special engine primitives are required — all three are built from `onHit`/`onDeath`, `cutscene.run`, `alertGroup`, flags, portal `script` guards, and `cutscene.isInputLocked`.

### How the Pieces Fit

| Concern | Engine hook used |
|---|---|
| Phase tracking | `onHit` callback + local mutable state |
| Phase transition effects | `cutscene.run` with `call`, `bgm`, `emit`, `dialog`, `wait` |
| Arena lock | Portal `script` guard that blocks the exit while boss is alive |
| Permanent kill | `flagName` on `createSpawner` set from `onDeath` |
| Minion reinforcements | `alertGroup` called from `onHit` at threshold HP |

### Arena Lock

`sysSceneTransition` is already gated on `cutscene.isInputLocked()` — no additional hook exists. The idiomatic pattern is to attach a `script` to every exit portal in the boss room. While the boss is alive the script runs a `lockInput` command and shows a blocking dialog instead of transitioning. When the boss is dead (flag set) the script falls through to the `transition` command.

```js
// Boss room scene definition — exit portal with guard script.
portals: [
  {
    tileX: 9, tileY: 0,
    // script runs instead of an immediate transition when the player
    // steps on this tile. Use it to block exit while boss is alive.
    script: [
      {
        cmd: 'call',
        fn() {
          if (!getFlag('boss_dead')) {
            // Boss still alive — play a blocked-exit dialog and do nothing.
            cutscene.run([
              { cmd: 'dialog', name: 'SEALED DOOR',
                lines: ['THE DOOR WILL NOT BUDGE.', 'DEFEAT THE BOSS FIRST.'] },
            ]);
          } else {
            // Boss dead — allow the transition normally.
            startTransition('overworld', 9 * TILE_SIZE, 17 * TILE_SIZE);
          }
        },
      },
    ],
  },
],
```

The `script` field on a portal fires `cutscene.run(portal.script)` instead of `startTransition`, so the exit can perform any logic before committing to a scene change. All other portals in the boss room (walls, side exits) get the same guard.

### Phase Transition Cutscene Hooks

Track phase locally in the closure around `spawnEnemy`. Use `onHit` to compare live HP against thresholds and fire `cutscene.run` once per threshold. Guard with a flag or a local boolean so the cutscene does not re-trigger on every subsequent hit.

```js
// Phase state — local to the spawn call, not on the ECS entity.
let bossPhase = 1;

const bossId = spawnEnemy({
  x: 9 * TILE_SIZE, y: 8 * TILE_SIZE,
  sprite:      'boss',
  hp:          24,
  speed:       20,
  alertRange:  999,  // omniscient in its own room
  attackRange: 12,
  leashRange:  999,
  useLOS:      false,
  team:        'boss',
  aggroGroup:  'boss_room',

  onHit(vid, _attackerId, _amount) {
    const dmg = world.get(vid, 'damageable');
    if (!dmg) return;
    const { hp, maxHp } = dmg;

    // Phase 2: below 66% HP
    if (bossPhase === 1 && hp <= maxHp * 0.66) {
      bossPhase = 2;
      _triggerPhase2(vid);
    }
    // Phase 3: below 33% HP
    if (bossPhase === 2 && hp <= maxHp * 0.33) {
      bossPhase = 3;
      _triggerPhase3(vid);
    }
  },

  onDeath(vid) {
    setFlag('boss_dead');
    cutscene.run([
      { cmd: 'lockInput', value: true },
      { cmd: 'sfx',       name: 'boss_down' },
      { cmd: 'bgm',       name: 'victory' },
      { cmd: 'emit',      x: 9 * TILE_SIZE + 4, y: 8 * TILE_SIZE + 4, preset: 'levelup' },
      { cmd: 'wait',      seconds: 0.6 },
      { cmd: 'dialog',    name: 'BOSS', lines: ['YOU... HAVE DEFEATED ME...', 'THE SEAL IS BROKEN.'] },
      { cmd: 'call',      fn() { showNote('BOSS DEFEATED!'); } },
      { cmd: 'lockInput', value: false },
    ]);
  },
});
```

### Phase Transition Helpers

Each helper updates `enemyAI` fields directly via `world.set` and fires a cutscene. This keeps all phase logic out of the generic `sysEnemy` loop.

```js
function _triggerPhase2(vid) {
  // Speed boost + wake minions.
  const ai  = world.get(vid, 'enemyAI');
  const vel = world.get(vid, 'velocity');
  if (ai)  ai.attackRange  = 20;       // melee reach extended
  if (vel) vel.speed       = 38;       // moves faster
  alertGroup('boss_minions', 9 * TILE_SIZE, 8 * TILE_SIZE);

  cutscene.run([
    { cmd: 'lockInput', value: true },
    { cmd: 'sfx',       name: 'alert' },
    { cmd: 'bgm',       name: 'boss_phase2' },
    { cmd: 'emit',      x: 9 * TILE_SIZE + 4, y: 8 * TILE_SIZE + 4, preset: 'hit' },
    { cmd: 'wait',      seconds: 0.4 },
    { cmd: 'dialog',    name: 'BOSS', lines: ['ENOUGH! I WILL NOT HOLD BACK!'] },
    { cmd: 'lockInput', value: false },
  ]);
}

function _triggerPhase3(vid) {
  // Phase 3: switch to ranged attack, disable kite so it stands and fires.
  const ai = world.get(vid, 'enemyAI');
  if (ai) {
    ai.weapon = {
      type:        'ranged',
      damage:      2,
      cooldownMax: 1.0,
      team:        'boss',
      knockback:   30,
      projSpeed:   100,
      projLife:    2.0,
      projSprite:  'boss_shot',
      piercing:    false,
    };
    ai.attackRange = 72;
    ai.kiteRange   = 0;       // stand still and fire
  }

  cutscene.run([
    { cmd: 'lockInput', value: true },
    { cmd: 'sfx',       name: 'portal' },
    { cmd: 'emit',      x: 9 * TILE_SIZE + 4, y: 8 * TILE_SIZE + 4, preset: 'levelup' },
    { cmd: 'wait',      seconds: 0.5 },
    { cmd: 'dialog',    name: 'BOSS', lines: ['MY FINAL FORM!', 'NOWHERE TO RUN!'] },
    { cmd: 'lockInput', value: false },
  ]);
}
```

### Boss Health Bar

Render a dedicated health bar in the HUD strip during the fight. Poll `world.get(bossId, 'damageable')` each frame — returns `null` once the entity is dead, which is the natural signal to hide the bar.

```js
function renderBossBar() {
  const dmg = world.get(bossId, 'damageable');
  if (!dmg) return;                          // boss is dead; hide bar

  const barW  = 80;
  const barH  = 4;
  const barX  = (LOGICAL_W - barW) / 2 | 0;
  const barY  = 2;
  const fillW = Math.round(barW * (dmg.hp / dmg.maxHp));

  fillRectPx(barX,     barY, barW,  barH, 13);    // background (dark)
  fillRectPx(barX,     barY, fillW, barH, 26);    // fill (red palette[26])
  fillRectPx(barX,     barY, barW,  1,    22);    // top edge highlight
  fillRectPx(barX,     barY, 1,     barH, 22);    // left edge highlight
  drawText('BOSS', barX - 22, barY - 1, 20);
}
```

Call `renderBossBar()` inside your render pass, after `renderHUD()` and before `flushBuffer()`.

### Minion Spawning

Minions are regular `createSpawner` calls with `aggroGroup: 'boss_minions'`. They start idle; `alertGroup('boss_minions', ...)` wakes all of them at once when Phase 2 begins. Use `flagName` on each minion spawner to keep them dead once they fall — they do not respawn after the boss is defeated.

```js
// Two flanking minions — spawned when the scene loads, idle until Phase 2.
createSpawner({
  tileX: 5, tileY: 8,
  sprite: 'imp',
  aggroGroup: 'boss_minions',
  flagName:   'boss_dead',        // same flag as boss; minions never respawn after clear
  onDeath(vid) {
    const tf = world.get(vid, 'transform');
    if (tf) emitBurst(tf.x + 4, tf.y + 4, 'hit');
  },
}, { flagName: 'boss_dead', respawnDelay: 0 });

createSpawner({
  tileX: 13, tileY: 8,
  sprite: 'imp',
  aggroGroup: 'boss_minions',
}, { flagName: 'boss_dead', respawnDelay: 0 });
```

### Intro Cutscene

The boss intro fires from the scene's `onEnter` hook, which runs once when `loadScene` loads the boss room. Guard with the `boss_dead` flag so returning to the room after the fight skips it.

```js
const SCENE_DATA = {
  boss_room: {
    // ... tiles, portals, enemies as above ...
    onEnter() {
      if (getFlag('boss_dead')) return;    // already cleared; no intro
      cutscene.run([
        { cmd: 'lockInput', value: true },
        { cmd: 'bgm',       name: 'boss_intro' },
        { cmd: 'dialog',    name: 'BOSS', lines: [
            'SO. YOU MADE IT THIS FAR.',
            'IT ENDS HERE.',
        ]},
        { cmd: 'sfx',       name: 'alert' },
        { cmd: 'call',      fn() { alertGroup('boss_room', 9 * TILE_SIZE, 8 * TILE_SIZE); } },
        { cmd: 'bgm',       name: 'boss_battle' },
        { cmd: 'lockInput', value: false },
      ]);
    },
  },
};
```

### Complete Phase Summary

| Phase | Trigger | Changes | Effect |
|---|---|---|---|
| 1 | Spawn | Melee, speed 20, range 12 | Normal combat |
| 2 | HP ≤ 66% | Speed 38, range 20, wake minions | Aggression up; group alert |
| 3 | HP ≤ 33% | Switch to ranged weapon, range 72 | Fires projectiles; stands still |
| Dead | HP = 0 | `boss_dead` flag set | Arena unlocks; victory cutscene |

### Checklist

- Register `boss_dead` flag as the permanent-kill guard on all spawners in the room (boss + minions).
- All exit portals use a `script` that checks `getFlag('boss_dead')` before calling `startTransition`.
- `_triggerPhase2` / `_triggerPhase3` are guarded by `bossPhase` so they fire exactly once even if `onHit` is called multiple times at the threshold HP value within a single iframe window.
- `renderBossBar()` called after `renderHUD()` in the render pass.
- Boss `team: 'boss'` prevents friendly fire from other `team: 'enemy'` entities; minions use `team: 'enemy'`.
- `onEnter` guard (`if getFlag('boss_dead') return`) prevents the intro cutscene from replaying on room re-entry.

---

## Damage System

`sysDamage(delta)` is the single resolution pass that connects `damager` entities to `damageable` entities each frame. Melee swings, projectiles, and contact-damage enemies all participate through the same two components with no special-casing per type.

### Components

#### `damageable`

Placed on anything that can receive damage: player, enemies, destructible objects.

```js
damageable: {
  hp:        number,   // current hit points
  maxHp:     number,   // maximum hit points (does not change during combat)
  iframes:   number,   // invincibility seconds remaining (managed by sysDamage)
  iframeMax: number,   // seconds of invincibility granted per hit   default 1.5
  team:      string,   // team identifier string (see Team Filtering below)
  onHit:     fn | null,   // fn(vid, attackerId, amount)  — fires on every accepted hit
  onDeath:   fn | null,   // fn(vid, attackerId)          — fires when hp reaches 0
}
```

`iframes` is set to `iframeMax` by `sysDamage` on each confirmed hit and decremented toward `0` at the end of each `sysDamage` call. Setting it manually to a positive value before a hit will cause that hit to be skipped. Setting `iframeMax: 0` disables invincibility entirely — the entity takes a hit every frame it overlaps a damager.

`onHit` receives the target entity id (`vid`), the attacking entity id (`attackerId`), and the raw `damage` value from the `damager` component before clamping. HP has already been reduced and iframes have already been set when `onHit` fires. Use it for per-hit side effects: sound, particles, phase transitions, knockback overrides.

`onDeath` fires in the same tick as the hit that reduces `hp` to `0`, immediately after `onHit`. It fires even if `onHit` calls `world.destroyEntity` on the target — the entity is removed from the store but the callback still executes because the call sequence is: reduce HP → set iframes → apply knockback → call `onHit` → check `hp <= 0` → call `onDeath`. Avoid double-destroying inside `onDeath` if `onHit` already does it.

#### `damager`

Placed on anything that deals damage: melee swing entities, projectile entities, contact enemies.

```js
damager: {
  damage:    number,          // HP deducted per accepted hit
  team:      string | null,   // team identifier; null = hits everything
  knockback: number | null,   // horizontal impulse px/s; null or 0 = no knockback
}
```

`team` on the damager is compared against `team` on the damageable. Both must be non-falsy and equal for the hit to be skipped. If either is falsy (`null`, `undefined`, `''`), the team filter does not apply and the hit lands.

### Sweep Logic

`sysDamage` runs an O(D × V) double loop — D damagers, V damageables — each frame. For a typical scene of 5 damager entities and 10 damageable entities this is 50 AABB tests per frame; negligible.

Per-iteration logic, in exact execution order:

```
for each damager (aid):
  if damager or its transform is gone (destroyed mid-loop): skip
  compute damager box: ax0 = atf.x + 1,  ay0 = atf.y + 1
                       ax1 = atf.x + 7,  ay1 = atf.y + 7

  for each damageable (vid):
    if vid === aid:                            skip  (self-hit)
    if damageable is gone:                     skip
    if dmgr.team && dmgable.team
       && dmgr.team === dmgable.team:          skip  (same team)
    if dmgable.iframes > 0:                   skip  (invincible)
    compute damageable box using HBX/HBY/HBW/HBH globals
    if AABB test fails:                        skip
    ── hit confirmed ──
    dmgable.hp = max(0, hp - dmgr.damage)
    dmgable.iframes = dmgable.iframeMax ?? 1.5
    if dmgr.knockback: apply horizontal knockback to velocity
    call dmgable.onHit(vid, aid, dmgr.damage)
    if dmgable.hp <= 0: call dmgable.onDeath(vid, aid)
    if damager is a non-piercing projectile:
      destroyEntity(aid)
      break inner loop  ← this damager is done

for each damageable:
  if iframes > 0: iframes = max(0, iframes - delta)
```

### Hitbox Geometry

The damager and damageable sides use **different** box definitions.

**Damager box** — hardcoded 6×6 inset centered in the 8×8 sprite tile:

```
ax0 = transform.x + 1    ay0 = transform.y + 1
ax1 = transform.x + 7    ay1 = transform.y + 7
```

This is fixed — `setHitbox` does not affect it. Every damager entity (swing, projectile, contact body) uses this same box regardless of its sprite size. The 1-pixel inset prevents hits from triggering when entities are merely adjacent; actual overlap is required.

**Damageable box** — uses the global hitbox `HBX, HBY, HBW, HBH`, set via `setHitbox`:

```js
setHitbox(x, y, w, h)   // default: HBX=1, HBY=4, HBW=6, HBH=4
```

```
bx0 = transform.x + HBX    by0 = transform.y + HBY
bx1 = bx0 + HBW            by1 = by0 + HBH
```

The default hitbox (`1, 4, 6, 4`) sits in the lower half of the 8×8 sprite — feet-level for a top-down character. Call `setHitbox` once at startup before any entity is created. The globals are shared by `collidesAt`, `resolveMove`, and `sysDamage`, so changing them mid-session affects tile collision as well.

AABB overlap test (separating axis, standard):

```
no overlap if:  ax0 >= bx1  ||  ax1 <= bx0  ||  ay0 >= by1  ||  ay1 <= by0
```

Hit is confirmed when none of the four separation conditions holds.

### Team Filtering

Team strings are arbitrary. The engine defines no fixed teams — `'player'`, `'enemy'`, `'boss'`, `'neutral'` are all game-code conventions. The filter rule is exact:

```
skip hit if: dmgr.team && dmgable.team && dmgr.team === dmgable.team
```

Both sides must be truthy strings with the same value. Consequences:

| damager.team | damageable.team | Result |
|---|---|---|
| `'player'` | `'enemy'` | Hit lands — different teams |
| `'enemy'` | `'enemy'` | Skipped — same team; enemies never hurt each other |
| `'player'` | `'player'` | Skipped — friendly fire disabled |
| `null` | `'enemy'` | Hit lands — damager team is falsy |
| `'player'` | `null` | Hit lands — damageable team is falsy |
| `null` | `null` | Hit lands — both falsy, filter does not apply |

Setting `team: null` on a damager creates a universal hitter — it damages everything with a `damageable` component. Useful for environmental hazards (spikes, lava) that should harm both the player and enemies.

Enemies produced by `spawnEnemy` default to `team: 'enemy'` on both the `damageable` and `damager` components. The player entity uses `team: 'player'`. Boss entities should use a distinct team (e.g. `'boss'`) if minion contact should not damage the boss.

### Iframe Mechanics

On a confirmed hit: `dmgable.iframes` is set to `dmgable.iframeMax`. Every subsequent frame `sysDamage` checks `iframes > 0` first and skips the entity entirely if true. At the end of the same `sysDamage` call, `iframes` is decremented by `delta` for all damageables — so the entity is protected starting from the frame of the hit.

**Flicker rendering** — while `iframes > 0`, `sysRender` toggles entity visibility on a `0.08s` interval (`IFRAME_FLICKER_INTERVAL`). The globals `_iframeFlickerTimer` and `_iframeFlickerVisible` are advanced by `engineTick`. No extra code is needed in game logic to produce the flicker — it applies to any entity with a `damageable` component that has `iframes > 0`.

**Iframe configuration guide:**

| `iframeMax` | Effect |
|---|---|
| `1.5 s` (default) | Standard player protection — 1.5 seconds of safety after each hit |
| `0.8 s` | Enemy default from `spawnEnemy` — shorter window, multiple hits land faster |
| `0.4 s` | Rapid enemies; allows burst damage |
| `0` | No invincibility — entity takes damage every frame it overlaps a damager |

Setting `iframeMax: 0` with a high-`damage` contact body will drain HP very fast. For hazards that apply a fixed damage once per contact, use `iframeMax` matching the expected contact duration or manage overlap detection manually in `onHit`.

### Knockback

When `dmgr.knockback` is truthy and the damageable has a `velocity` component, `sysDamage` sets:

```js
vel.dx = (vtf.x >= atf.x ? 1 : -1) * dmgr.knockback
```

Direction is determined by comparing the target's `transform.x` to the damager's `transform.x`. If the target is to the right of or level with the damager, knockback pushes right; otherwise left. Only `dx` is set — there is no vertical component.

`vel.dy` is untouched. `sysMovement` applies the velocity to the transform on the same frame, so the entity is displaced immediately. On subsequent frames the entity's own movement logic (`sysInput`, `sysEnemy`, `sysAI`) overwrites `vel.dx` normally — knockback is a one-frame impulse, not sustained force.

Entities without a `velocity` component receive no knockback regardless of the `knockback` value on the damager. The `world.get(vid, 'velocity')` call returns `undefined`; the `if (vel)` guard skips the assignment.

**Simulating knockback decay** — the default behavior is abrupt; the entity resumes normal movement the very next tick. For a brief freeze-and-slide effect, override velocity in `onHit`:

```js
onHit(vid, aid) {
  const vel = world.get(vid, 'velocity');
  const tf  = world.get(vid, 'transform');
  const atf = world.get(aid, 'transform');
  if (vel && tf && atf) {
    const dir = tf.x >= atf.x ? 1 : -1;
    vel.dx = dir * 80;
    vel.dy = -20;   // slight upward pop (top-down: cosmetic only)
  }
}
```

### Projectile Destruction

`sysDamage` checks whether the confirmed damager has a `projectile` component:

```js
const proj = world.get(aid, 'projectile');
if (proj && !proj.piercing) { world.destroyEntity(aid); break; }
```

- **Non-piercing** (`piercing: false` or omitted): destroyed immediately on the first hit; `break` exits the inner damageable loop so no further targets are tested that frame.
- **Piercing** (`piercing: true`): not destroyed; the inner loop continues and may hit additional targets in the same frame.

`sysProjectile` independently destroys projectiles that hit solid tiles or exceed their `projLife` budget — `sysDamage` only handles entity-contact destruction.

### Combat System (`spawnAttack`)

Melee and ranged attacks are created as short-lived ECS entities carrying `damager` components. `sysDamage` resolves them automatically — no special attack loop is needed.

```js
spawnAttack(ownerId, weapon, wx, wy, dirX, dirY)
```

| `weapon.type` | Entity created | Lifetime controlled by |
|---|---|---|
| `'melee'` | `swing` entity at computed offset in front of attacker | `sysSwing` destroys after `swingLife` seconds |
| `'ranged'` / `'spell'` | `projectile` entity at attacker center | `sysProjectile` destroys on wall/edge; `sysDamage` on hit |

**Melee swing placement:**

```js
const offX = dirX * (TILE_SIZE * 0.75 + sw * 0.25);
const offY = dirY * (TILE_SIZE * 0.75 + sh * 0.25);
// transform.x = cx + offX - sw/2
// transform.y = cy + offY - sh/2
```

The swing hitbox is offset `6px + (swingW × 0.25)` in the attack direction from the attacker center, then centered on that point. Default `swingW: 12, swingH: 10` places the box squarely in the tile ahead.

**Projectile spawn position:**

```js
transform.x = cx - TILE_SIZE / 2   // = wx
transform.y = cy - TILE_SIZE / 2   // = wy
```

Projectiles spawn at the attacker's tile origin. `vx = dirX * projSpeed`, `vy = dirY * projSpeed`. Only cardinal directions (`dirX/Y ∈ {-1, 0, 1}`) are supported — diagonal projectiles require game-code decomposition of the velocity.

### Example: Complete Entity Setup

```js
// Player entity with damageable, no damager (attacks via spawnAttack).
playerId = world.createEntity({
  persistent:  true,
  transform:   { x: 10 * TILE_SIZE, y: 10 * TILE_SIZE },
  velocity:    { dx: 0, dy: 0, speed: 50 },
  animator:    createAnimator(CLIPS_PLAYER, 'idle'),
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
    onDeath(vid) {
      sound.playSFX('die');
      // Handle respawn, game-over, etc. in game code.
    },
  },
});

// Contact enemy — has both damageable and damager.
world.createEntity({
  transform:  { x: 5 * TILE_SIZE, y: 5 * TILE_SIZE },
  velocity:   { dx: 0, dy: 0, speed: 28 },
  animator:   createAnimator(enemyClips, 'idle'),
  collider:   true,
  damageable: {
    hp: 3, maxHp: 3,
    iframes: 0, iframeMax: 0.8,
    team: 'enemy',
    onHit(vid) {
      const tf = world.get(vid, 'transform');
      if (tf) emitBurst(tf.x + 4, tf.y + 4, 'hit');
    },
    onDeath(vid) {
      const tf = world.get(vid, 'transform');
      if (tf) emitBurst(tf.x + 4, tf.y + 4, 'levelup');
      sound.playSFX('enemy_die');
      world.destroyEntity(vid);
    },
  },
  damager: { damage: 1, team: 'enemy', knockback: 40 },
});

// Environmental hazard — no team on damager, hits everything.
world.createEntity({
  transform: { x: 8 * TILE_SIZE, y: 12 * TILE_SIZE },
  sprite:    { name: 'spike' },
  damager:   { damage: 2, team: null, knockback: 0 },
});
```

### Call Order Requirements

`sysDamage` must run **after** `sysSwing` and `sysProjectile` — swing/projectile entities must exist and be in their final positions before hit-testing. It must run **before** `sysSpawner` — spawner death-detection polls `world.has(enemyId, 'transform')`, which requires that `onDeath` has already destroyed the entity.

```js
sysSwing(delta);        // advance swing lifetime; keep alive or destroy
sysProjectile(delta);   // move projectiles; destroy on wall/budget
sysDamage(delta);       // test overlaps; fire callbacks; destroy non-piercing
sysSpawner(delta);      // detect deaths; start respawn timers
```

---

## Game Loop Integration

Minimum recommended order:

```js
function gameLoop(delta) {
  input.update();
  sysInput();
  sysAI(delta);          // patrol NPCs
  sysEnemy(delta);       // enemy state machines (new v5.2)
  sysMovement(delta);
  sysSpatialHash();
  sysSwing(delta);
  sysProjectile(delta);
  sysDamage(delta);
  sysSpawner(delta);     // after sysDamage so death is current (new v5.2)
  sysChestLoot(delta);
  sysAnimation(delta);
  sysCamera();
  sysSceneTransition();
  engineTick(delta);     // particles, cutscene, sysAggroTable (v5.2)

  clearBuffer(bgColor);
  drawTilemap(worldState.layerBG, elapsed);
  drawTilemap(worldState.layerObjects, elapsed);
  sysRender();
  renderParticles();
  sysDialog(elapsed);
  renderDialog(elapsed);
  renderHUD();
  renderSaveNote();
  renderTransitionOverlay();
  flushBuffer();
}
```

`sysAggroTable` is called inside `engineTick` — do not call it manually.

---

## Scene Config Reference

Full scene definition shape (all enemy-related fields):

```js
{
  worldCols: 20, worldRows: 18,
  layerBG: [ /* tile ids */ ],
  layerObjects: [ /* tile ids */ ],
  layerCollision: [ /* 0|1 */ ],
  bgColor: 0,
  music: 'dungeon',
  playerStart: { tileX: 2, tileY: 2 },

  npcs: [ /* ... */ ],
  chests: [ /* ... */ ],

  enemies: [
    {
      // Position (one of):
      tileX: 5, tileY: 8,          // preferred; converted to px internally
      // x: 40, y: 64,             // or raw px

      // Factory selection:
      type: 'melee',               // 'melee' | 'ranged'

      // Spawner options:
      flagName: 'guard_dead',      // omit for always-respawn
      respawnDelay: 10,

      // spawnEnemy / spawnRangedEnemy fields (all optional):
      sprite: 'guard',
      hp: 3,
      speed: 28,
      alertRange: 48,
      attackRange: 14,
      leashRange: 96,
      kiteRange: 0,
      idleDuration: 1.8,
      useLOS: true,
      lostSightMax: 2.5,
      aggroGroup: 'north_wing',
      propagateRadius: 80,
      waypoints: [
        { x: 4 * TILE_SIZE, y: 8 * TILE_SIZE },
        { x: 8 * TILE_SIZE, y: 8 * TILE_SIZE },
      ],
      weapon: { damage: 1, cooldownMax: 1.2 },

      // Ranged-only:
      projSprite: 'arrow',

      // Callbacks:
      onHit:   (vid, aid, dmg) => { /* ... */ },
      onDeath: (vid, aid)      => { setFlag('guard_dead'); },
    },
  ],
}
```

---

## Damage System

### Components

**`damageable`** — attach to any entity that can be hurt.

| Field | Type | Default | Description |
|---|---|---|---|
| `hp` | number | required | Current hit points |
| `maxHp` | number | required | Maximum hit points |
| `iframes` | number | `0` | Invincibility seconds remaining (managed by `sysDamage`) |
| `iframeMax` | number | `1.5` | Seconds of invincibility granted per hit |
| `team` | string | required | Team identifier; hits only occur across different teams |
| `onHit` | fn(vid, aid, dmg) | `null` | Called on every confirmed hit. `vid` = victim id, `aid` = attacker id, `dmg` = damage amount |
| `onDeath` | fn(vid, aid) | `null` | Called when `hp` reaches `0`. Entity is not automatically destroyed — the callback must call `world.destroyEntity(vid)` if removal is desired |

**`damager`** — attach to any entity that deals damage on contact (swing hitboxes, projectiles, contact enemies).

| Field | Type | Default | Description |
|---|---|---|---|
| `damage` | number | required | HP deducted per contact frame |
| `team` | string | required | Same-team pairs are skipped — no friendly fire |
| `knockback` | number | `0` | px/s horizontal impulse applied to target's `velocity.dx`. Direction is inferred from relative position (attacker left of target → positive; attacker right → negative) |

### `sysDamage(delta)` — sweep logic

Called once per frame. Execution order:

1. Query all `damager + transform` entities and all `damageable + transform` entities.
2. For each damager–damageable pair:
   - Skip if same entity (`vid === aid`).
   - Skip if both have `team` set and they match.
   - Skip if `damageable.iframes > 0`.
   - Test AABB overlap: damager uses a fixed `[x+1, y+1, x+7, y+7]` box; damageable uses the global hitbox `[x+HBX, y+HBY, x+HBX+HBW, y+HBY+HBH]`.
3. On confirmed hit:
   - `hp` reduced by `dmgr.damage`, clamped to `0`.
   - `iframes` set to `iframeMax` (default `1.5`).
   - If `dmgr.knockback` is set and target has `velocity`: `vel.dx = sign(vtf.x - atf.x) * knockback`. Only the horizontal axis is affected.
   - `onHit` callback fired.
   - If `hp <= 0`, `onDeath` callback fired.
   - If damager has `projectile` component and `proj.piercing` is false: `world.destroyEntity(aid)` and break the inner loop for this damager.
4. Tick all `damageable.iframes` down by `delta`, clamped to `0`.

### Iframe Flicker

While `iframes > 0`, `sysRender` hides the entity every `IFRAME_FLICKER_INTERVAL` (0.08 s) — alternating visible/invisible at ~12.5 Hz. No code changes are needed in game logic; the flicker is automatic for all damageable entities.

To disable flicker for a specific entity (e.g. a boss health bar effect instead), set `iframeMax: 0` and manage your own visual feedback in `onHit`.

### Team Strings

Teams are free-form strings — the engine only checks equality. Conventional values used in the templates:

| String | Used by |
|---|---|
| `'player'` | Player entity, player weapon swings and projectiles |
| `'enemy'` | All enemies, enemy swings and projectiles |
| `'boss'` | Boss entities when friendly fire from minions should be suppressed |

Omitting `team` (leaving it `undefined`) disables team filtering for that component — the entity will interact with everyone.

### Combat Extensions: `spawnAttack`

```js
spawnAttack(ownerId, weapon, wx, wy, dirX, dirY)
```

Creates a melee swing entity or ranged projectile entity. Both carry `damager` components and are resolved automatically by `sysDamage`.

**Melee swing entity** — spawned at `(wx, wy)` offset by direction, lives for `swingLife` seconds, then destroyed by `sysSwing`. No physics.

**Projectile entity** — spawned at sprite center, moves at `projSpeed` px/s along `(dirX, dirY)`. Destroyed by `sysProjectile` on world edge, solid tile, or `projLife` expiry. Destroyed by `sysDamage` on first hit (unless `piercing: true`).

### Examples

**Player entity with damageable:**

```js
world.createEntity({
  persistent: true,
  transform:  { x: 2 * TILE_SIZE, y: 2 * TILE_SIZE },
  velocity:   { dx: 0, dy: 0, speed: 55 },
  collider:   true,
  damageable: {
    hp: 6, maxHp: 6,
    iframes: 0, iframeMax: 1.5,
    team: 'player',
    onHit(vid, aid, amount) {
      sound.playSFX('hurt');
      const tf = world.get(vid, 'transform');
      if (tf) emitBurst(tf.x + 4, tf.y + 4, 'hit');
    },
    onDeath(vid) {
      // handle game over
    },
  },
});
```

**Contact enemy with both components:**

```js
world.createEntity({
  transform:  { x: 10 * TILE_SIZE, y: 6 * TILE_SIZE },
  velocity:   { dx: 0, dy: 0, speed: 28 },
  collider:   true,
  damageable: {
    hp: 3, maxHp: 3,
    iframes: 0, iframeMax: 0.6,
    team: 'enemy',
    onHit(vid) { sound.playSFX('hit'); },
    onDeath(vid) {
      emitBurst(world.get(vid,'transform').x + 4, 0, 'levelup');
      world.destroyEntity(vid);
    },
  },
  damager: { damage: 1, team: 'enemy', knockback: 50 },
});
```

**Environmental hazard — no team (hits everyone), no knockback:**

```js
world.createEntity({
  transform: { x: 5 * TILE_SIZE, y: 12 * TILE_SIZE },
  damager:   { damage: 2 },   // team omitted → hits all damageable entities
});
```

---

## Collision and Movement

### Hitbox Configuration

```js
setHitbox(x, y, w, h)
// Defaults: HBX=1, HBY=4, HBW=6, HBH=4
```

The global hitbox is an offset rectangle relative to any entity's `transform`. It defines the footprint used by `collidesAt`, `resolveMove`, and `sysDamage` for all entities simultaneously — it is a single global setting, not per-entity.

For a top-down 8×8 sprite, the default (`1, 4, 6, 4`) places a 6×4 footprint in the lower half of the sprite, matching the character's feet. Platformers typically call `setHitbox(1, 1, 6, 7)` for a taller collision area.

**Change hitbox before spawning entities** — changing it mid-session affects all entity queries retroactively since `collidesAt` reads the globals at call time.

### Core Functions

**`isSolid(tileX, tileY) → bool`**

Returns `true` if the tile at `(tileX, tileY)` is marked solid in `worldState.layerCollision`, or if the coordinates are out-of-bounds. Out-of-bounds tiles are treated as solid walls — entities cannot leave the world edge.

```js
isSolid(0, 0)         // → false if tile 0,0 is open
isSolid(-1, 5)        // → true (out of bounds = solid)
isSolid(999, 999)     // → true (out of bounds = solid)
```

**`collidesAt(wx, wy) → bool`**

Tests whether placing an entity's top-left at world-space pixel `(wx, wy)` would overlap any solid tile. Checks all four corners of the hitbox rectangle: `(wx+HBX, wy+HBY)`, `(wx+HBX+HBW-1, wy+HBY)`, `(wx+HBX, wy+HBY+HBH-1)`, `(wx+HBX+HBW-1, wy+HBY+HBH-1)`.

Four-corner testing is sufficient for axis-aligned 8×8 tile grids because an entity that fits within a tile can only overlap at most four tiles simultaneously.

**`resolveMove(wx, wy, dx, dy) → { x, y }`**

Axis-separated collision resolution for entities with a `collider` component.

Algorithm:
1. Compute `candidateX = wx + dx`, `candidateY = wy + dy`, both clamped to world bounds.
2. Test X axis: if `collidesAt(candidateX, wy)` is false, accept `candidateX`; otherwise keep `wx` (slide along Y without X movement).
3. Test Y axis: if `collidesAt(resolvedX, candidateY)` is false, accept `candidateY`; otherwise keep `wy`.
4. Return `{ x: resolvedX, y: resolvedY }`.

Axis separation means entities slide along walls rather than stopping dead — pressing into a diagonal corner allows movement along the unblocked axis. Both axes are checked independently, which eliminates corner-snagging artifacts.

**`isGrounded(wx, wy) → bool`**

Returns `collidesAt(wx, wy + 1)` — tests one pixel below the current position. Used by platformers to detect when the entity is standing on a surface.

**`hasLineOfSight(ax, ay, bx, by) → bool`**

Bresenham tile-walk between two world-space pixel coordinates. See the Line-of-Sight section for full documentation.

### `sysMovement(delta)`

Moves all `transform + velocity` entities each frame.

- If the entity has a `collider` component: calls `resolveMove` with `vel.dx * delta`, `vel.dy * delta`. Position is updated to the resolved result.
- If no `collider`: position is updated with `_clampToWorld` only — no tile collision, just world bounds clamping.

Entities without `velocity` are not moved. Entities with `velocity.dx === 0 && vel.dy === 0` are skipped for performance.

### Spatial Hash

`sysSpatialHash()` rebuilds a 32px-cell spatial hash of all `transform` entities each frame. Used internally by other systems for broad-phase neighbour queries. Must be called after `sysMovement` and before any system that needs `spatialHash.queryRect`.

```js
// Query neighbours (returns a Set of entity ids)
const nearby = spatialHash.queryRect(x, y, w, h);
```

### Hitbox Sizing Guide

| Context | Recommended `setHitbox` |
|---|---|
| Top-down, 8×8 tile | `(1, 4, 6, 4)` — foot footprint, lower half |
| Platformer, tall character | `(1, 1, 6, 7)` — nearly full sprite height |
| Projectile (no tile collision) | Omit `collider`; test via damager AABB in `sysDamage` |
| Large boss (multi-tile) | Hitbox still global — use a separate ECS entity per hitbox zone |

### Example — player with collision

```js
setHitbox(1, 4, 6, 4);   // call once before any entity spawns

playerId = world.createEntity({
  persistent: true,
  transform:  { x: 4 * TILE_SIZE, y: 4 * TILE_SIZE },
  velocity:   { dx: 0, dy: 0, speed: 55 },
  collider:   true,       // → resolveMove used in sysMovement
  damageable: { /* ... */ },
});

// In sysInput:
vel.dx = -55;             // move left
// sysMovement will call resolveMove and slide along wall if needed
```

---

## Save / Load

### Storage Wrapper

All `localStorage` calls pass through `_tryStorage(fn, label)`:

```js
function _tryStorage(fn, label) {
  try { return fn(); }
  catch(e) { console.warn(label + ':', e.message); return false; }
}
```

`fn` is expected to return a truthy value on logical success and a falsy value on logical failure. `_tryStorage` adds one additional failure mode: if `fn` throws, it logs `label + ': ' + e.message` to `console.warn` and returns `false`. It never rethrows. This means `save()`, `load()`, and `hasSave()` all return a plain boolean — callers do not need to catch.

Failures absorbed by `_tryStorage` include: `SecurityError` (storage access denied), `QuotaExceededError` (disk full), `DOMException` from any `localStorage` call in a sandboxed iframe or private-browsing context where storage is prohibited, and `SyntaxError` from `JSON.parse` on corrupt save data.

### Save Key

```js
setSaveKey('myGame_v1')   // default: 'pixelCanvas_v5'
```

`_saveKey` is a module-level `let` variable, initialized to `'pixelCanvas_v5'`. `setSaveKey` replaces it. All three API methods read `_saveKey` at call time — changing the key between calls affects which slot they target.

Consequences of changing the key:

- `setSaveKey('newKey')` followed by `hasSave()` returns `false` even if a save exists under the old key.
- `setSaveKey('newKey')` followed by `save()` writes a new slot; the old slot is not deleted.
- `setSaveKey('oldKey')` followed by `load()` loads the old save again; no version conflict unless the payload itself changed.

Call `setSaveKey` once at startup, before any game loop runs. The recommended pattern for breaking save-format changes is to encode a version in the key string: `'myGame_v1'`, `'myGame_v2'`. This abandons old saves automatically without needing migration logic — old keys remain in `localStorage` but are never read.

### Payload Shape (Version 2)

`save()` writes exactly this JSON object:

```js
{
  version: 2,
  scene:   string,          // worldState.currentScene at the moment of save
  x:       integer,         // player transform.x, bitwise-truncated with | 0
  y:       integer,         // player transform.y, bitwise-truncated with | 0
  flags: {
    flagName: true,         // shallow copy of the entire flags map
    ...                     // only truthy flags are present; cleared flags are absent
  },
  hud: {
    hp:    number,
    maxHp: number,
    coins: number,
  }
}
```

**What is saved:** player world-space position (integer px), current scene name, all flags set at save time (shallow copy via `{ ...flags }`), and three HUD values.

**What is not saved:**

| State | Why omitted | Restored by |
|---|---|---|
| HUD item slots (`items[0..3]`) | Item acquisition is flag-driven | Set flags → re-run `onPickup` in scene or NPC logic |
| `hud.selectedSlot` | Cosmetic selection state | Resets to `null` on each scene load |
| Scene tile data, NPC positions | Defined in `registerScenes`; cannot become stale | `loadScene` rebuilds from definitions |
| Enemy positions and HP | Enemies reset to spawn definitions | `spawnSceneEnemies` re-creates from scene `enemies` array |
| Projectiles, swings, particles | Transient per-frame state | Discarded; in-flight attacks vanish on load |
| `aggroTable` entries | Module-level map; not serialized | Rebuilt from enemy state on first `sysEnemy` tick |
| Animator clip state | Per-entity; rebuilt with entity | `createAnimator` initializes from clips definition |

Item slot state is the most commonly misunderstood omission. If the player has acquired items by picking up loot or triggering cutscene commands, those items live in `hud.items[]` at runtime but are not in the save. The correct pattern is to gate item presence on a flag: check the flag in `onEnter` or at startup and call `hud.setItem(slot, spriteName)` to restore the slot:

```js
// In scene onEnter or at game startup, after load():
if (getFlag('has_sword'))  hud.setItem(0, 'sword_item');
if (getFlag('has_bow'))    hud.setItem(1, 'bow_item');
if (getFlag('has_shield')) hud.setItem(2, 'shield_item');
```

Flags are saved, so this pattern is reliable.

### API

```js
saveLoad.save()    → bool   // write payload to localStorage; false on any failure
saveLoad.load()    → bool   // read, validate, restore state; false on any failure
saveLoad.hasSave() → bool   // true if _saveKey exists in localStorage
```

#### `save()` — exact execution

```
1. world.get(playerId, 'transform')
   → null: return false immediately (no storage call, no warning)

2. _tryStorage(() => {
     localStorage.setItem(_saveKey, JSON.stringify({ version:2, scene, x|0, y|0,
                                                     flags:{...flags}, hud:{hp,maxHp,coins} }))
     return true
   }, 'Save failed')
   → on throw: console.warn('Save failed: <message>'), return false
   → on success: return true
```

The `playerId` check is a plain null guard outside `_tryStorage` — it returns `false` silently with no console output. This occurs if `save()` is called before the player entity is created (e.g., from a title screen that never runs `loadScene`).

`x | 0` and `y | 0` are bitwise truncations — they strip any fractional pixel and coerce to a 32-bit integer. The result is equivalent to `Math.trunc(x)` for values in the normal world-space range.

#### `load()` — exact execution and atomicity

```
1. _tryStorage(() => {
     raw = localStorage.getItem(_saveKey)
     if (!raw) return false                    ← no save: return false, no warn

     data = JSON.parse(raw)                    ← throws SyntaxError on corrupt JSON

     if (data.version !== 2) return false      ← version mismatch: return false, no warn
     if (!_scenes[data.scene]) return false    ← unknown scene: return false, no warn

     Object.assign(flags, data.flags)          ← ① apply flags
     hud.hp    = data.hud?.hp    ?? hud.hp     ← ② apply HUD
     hud.maxHp = data.hud?.maxHp ?? hud.maxHp
     hud.coins = data.hud?.coins ?? hud.coins

     loadScene(data.scene, data.x, data.y)     ← ③ rebuild scene

     return true
   }, 'Load failed')
```

**Atomicity:** steps ①–③ are not atomic. If `JSON.parse` throws, `_tryStorage` catches before any state is modified — the game is unchanged. But if `JSON.parse` succeeds and then `loadScene` throws (which should not happen in normal use, but could if a scene definition is malformed), flags and HUD may have already been mutated. The practical fix is to validate scene definitions at startup, not at load time.

**`Object.assign(flags, data.flags)`** is additive, not replacing. It writes each key from `data.flags` onto the live `flags` object. It does not delete any flag that is currently set but absent from the save. This is safe for forward-compatibility (new flags added after a save was written are left at their current value), but means that if a flag was set mid-session before `load()` was called, and is absent from the save, it remains set after load.

**`loadScene(data.scene, data.x, data.y)`** calls `clearSceneEntities()` first, which destroys all non-persistent ECS entities. It then calls `spawnSceneNpcs`, `spawnSceneChests`, and `spawnSceneEnemies`. `spawnSceneEnemies` calls `createSpawner` for each entry in the scene's `enemies` array — but it skips entries whose `flagName` is already set in the restored `flags`. Permanent boss kills therefore survive load without any additional logic.

#### `hasSave()`

```js
_tryStorage(() => !!localStorage.getItem(_saveKey), 'hasSave')
```

Returns `true` if the key exists and is non-null/non-empty, `false` otherwise (including storage errors). Does not validate the payload — a key can exist with corrupt or version-mismatched content and `hasSave()` still returns `true`. Use it only as a "show continue button" gate; let `load()` perform the real validation.

### Default Bindings

The engine registers two `keydown` listeners unconditionally at module evaluation time:

```js
window.addEventListener('keydown', e => {
  if (e.code === 'F5') {
    e.preventDefault();          // blocks browser's native "Save Page As"
    sound.init();
    if (saveLoad.save()) { sound.playSFX('save'); showNote('GAME SAVED!'); }
    else showNote('SAVE FAILED');
  }
  if (e.code === 'F9') {
    e.preventDefault();
    sound.init();
    if (saveLoad.load()) { sound.playSFX('confirm'); showNote('GAME LOADED!'); }
    else showNote('NO SAVE FOUND');
  }
});
```

`e.preventDefault()` suppresses the browser's native F5 page-reload and F9 behaviors. Without it, F5 would reload the page and lose all runtime state. The engine calls it unconditionally — it fires even if `save()` subsequently fails.

`sound.init()` is called before the SFX play. This is necessary because Web Audio requires a user gesture to unlock the `AudioContext`; a keydown event qualifies.

**There is no opt-out flag.** The listeners are registered with no configuration switch. Options if the defaults conflict with your game:

- Use different keys for your own save trigger and ignore F5/F9.
- Add a higher-priority `keydown` listener with `{ capture: true }` that calls `e.stopImmediatePropagation()` on F5/F9 before the engine's listener fires.

The "SAVE FAILED" and "NO SAVE FOUND" messages appear via `showNote`, which displays in the HUD strip. If `hud.visible = false`, the banner is not rendered but `showNote` still sets the timer — there is no way to suppress just the notification without hiding the HUD.

### Notification Banner

```js
showNote(message, duration = 2.5)
```

Sets `saveNote.text` and `saveNote.timer`. `renderSaveNote()` draws a centered, background-padded text box in the HUD strip (y = 3–10px) each frame until the timer reaches zero. It is decremented inside `engineTick`.

```js
showNote('CHECKPOINT');           // 2.5 s
showNote('AUTO-SAVED', 1.0);      // 1 s
showNote('');                     // clears immediately (timer = 0)
```

Multiple rapid calls overwrite both `text` and `timer` — only the last message is shown, for the last-specified duration. There is no queue.

`renderSaveNote()` must be called in the render pass to be visible. It is included in both templates after `renderHUD()` and before `flushBuffer()`.

### Error Paths

| Condition | `save()` | `load()` | `hasSave()` |
|---|---|---|---|
| `localStorage` unavailable (sandbox, `SecurityError`) | `false` + `console.warn` | `false` + `console.warn` | `false` + `console.warn` |
| Storage quota exceeded (`QuotaExceededError`) | `false` + `console.warn` | n/a | n/a |
| Player entity not found (`playerId` has no transform) | `false`, silent | n/a | n/a |
| No entry at `_saveKey` | n/a | `false`, silent | `false`, silent |
| Entry exists but `JSON.parse` throws (`SyntaxError`) | n/a | `false` + `console.warn` | `true` (key exists; payload not inspected) |
| `data.version !== 2` | n/a | `false`, silent, no state modified | `true` |
| `data.scene` not registered in `_scenes` | n/a | `false`, silent, no state modified | `true` |
| `data.hud` is missing or `null` | n/a | HUD fields fall back to current values via `??`; `loadScene` still runs | `true` |
| `data.flags` is missing or `null` | n/a | `Object.assign(flags, null)` is a no-op; flags unchanged; `loadScene` still runs | `true` |

The last two rows illustrate a partial-payload scenario: a save written without a `hud` or `flags` field (e.g., hand-edited or from an older format with `version: 2` but different structure) does not crash. The `??` guards and `Object.assign` with a nullish argument both degrade gracefully.

### Custom Save Triggers

The public API is `saveLoad.save()`, `saveLoad.load()`, and `saveLoad.hasSave()` — call them from any event handler or game-loop hook. The F5/F9 binding is just a wrapper around the same three functions.

**In-game menu button:**

```js
// HTML button outside the canvas — fires on click
document.getElementById('save-btn').addEventListener('click', () => {
  sound.init();   // unlock AudioContext if this is the first gesture
  if (saveLoad.save()) {
    sound.playSFX('save');
    showNote('PROGRESS SAVED');
  } else {
    showNote('SAVE FAILED');
  }
});
```

**Auto-save on scene transition** — use the scene's `onEnter` hook. The hook fires after `loadScene` has rebuilt entities, so `playerId` and its transform are valid:

```js
registerScenes({
  town: {
    // ...
    onEnter() {
      // Autosave whenever the player reaches town.
      if (saveLoad.save()) showNote('AUTO-SAVED', 1.0);
    },
  },
});
```

**Save point entity** — an NPC or tile interaction that triggers save when the player interacts:

```js
// In sysDialog's NPC interaction, or via a portal script:
const SAVE_NPC = {
  name: 'CRYSTAL',
  dialogLines: ['SAVE YOUR PROGRESS?'],
  branches: [
    {
      requires: [],
      lines: ['YOUR JOURNEY IS RECORDED.'],
      onClose() {
        sound.init();
        if (saveLoad.save()) sound.playSFX('save');
        showNote('GAME SAVED!');
      },
    },
  ],
};
```

**Title screen continue flow** — check for a save before starting, offer a "Continue" option if one exists:

```js
loadScene('title');

// Show 'Continue' option only when a valid save exists.
// hasSave() is cheap — just a localStorage key lookup.
const canContinue = saveLoad.hasSave();

if (canContinue && playerPressedContinue) {
  if (!saveLoad.load()) {
    // load() returned false: version mismatch or corrupt data.
    // hasSave() was true but the payload was invalid.
    showNote('SAVE DATA INVALID');
    // Optionally wipe the bad save:
    // localStorage.removeItem(/* key */);  // no engine API for this; direct call
  }
}
```

**Disabling F5/F9 with a capture listener:**

```js
// Register before the engine's listeners to intercept first.
window.addEventListener('keydown', e => {
  if (e.code === 'F5' || e.code === 'F9') {
    e.stopImmediatePropagation();
    // Your own save logic here, or nothing (to block the default).
  }
}, { capture: true });
```

`stopImmediatePropagation` prevents all other listeners on `window` for that event, including the engine's. `capture: true` ensures this listener runs in the capture phase before bubble-phase listeners.

### What the Payload Does Not Cover — Integration Checklist

Any state not in the payload must be rebuilt after `load()` returns `true`. Common items:

- **HUD item slots** — re-apply from flags in the scene's `onEnter` or immediately after `load()`:
  ```js
  function restoreItemSlots() {
    if (getFlag('has_sword'))  hud.setItem(0, 'sword_item');
    if (getFlag('has_bow'))    hud.setItem(1, 'bow_item');
    if (getFlag('has_shield')) hud.setItem(2, 'shield_item');
  }
  // Call after saveLoad.load() returns true, before the first render.
  if (saveLoad.load()) { restoreItemSlots(); showNote('GAME LOADED!'); }
  ```

- **Scene-local counters** — kill counts, puzzle progress stored in JS variables rather than flags. If they need to persist, convert them to flags or add them to a custom serialization layer on top of `saveLoad`.

- **aggroTable** — not saved, not cleared on load. If the player saves mid-fight and reloads, the table may have stale entries for the new scene's group names. Call `clearAggroGroup` for each group in the scene's `onEnter` to start clean.

- **BGM** — `loadScene` calls `sound.playBGM(scene.music)` automatically. No manual restoration needed.

- **Camera** — reset to `{ x:0, y:0 }` by `loadScene` then snapped by `sysCamera` on the first tick. No action required.

---

## Boss Entity Pattern

The engine has no dedicated boss subsystem. Bosses are composed from existing primitives — `spawnEnemy` (or `spawnRangedEnemy`) as the base, with phase logic, arena locking, and cutscene hooks wired through `onHit`, `onDeath`, flags, and `alertGroup`.

### Phase Management

Phases are driven by HP thresholds read in the `onHit` callback. Each threshold fires once, protected by a flag so re-entry on subsequent hits is skipped.

```js
let bossId = -1;

function spawnBoss() {
  bossId = spawnEnemy({
    x: 10 * TILE_SIZE, y: 8 * TILE_SIZE,
    sprite: 'boss_idle',
    hp: 20, maxHp: 20,
    speed: 24,
    alertRange: 999,   // always aggro — no LOS gate needed
    useLOS: false,
    attackRange: 14,
    leashRange: 999,   // never leashes — arena lock keeps player in
    team: 'boss',
    aggroGroup: 'boss_floor',

    onHit(vid, aid, amount) {
      const dmg = world.get(vid, 'damageable');
      if (!dmg) return;

      // Phase 2 — below 66% HP
      if (dmg.hp <= 14 && !getFlag('boss_phase2')) {
        setFlag('boss_phase2');
        _bossEnterPhase2(vid);
      }

      // Phase 3 — below 33% HP
      if (dmg.hp <= 7 && !getFlag('boss_phase3')) {
        setFlag('boss_phase3');
        _bossEnterPhase3(vid);
      }
    },

    onDeath(vid, aid) {
      setFlag('boss_dead');         // disables spawner, lifts arena lock
      alertGroup('boss_floor', 0, 0);  // clear group (optional)
      clearAggroGroup('boss_floor');
      cutscene.run([
        { cmd: 'stopBgm' },
        { cmd: 'sfx',    name: 'boss_down' },
        { cmd: 'emit',   x: world.get(vid,'transform').x + 4,
                         y: world.get(vid,'transform').y + 4,
                         preset: 'levelup' },
        { cmd: 'wait',   seconds: 1.0 },
        { cmd: 'dialog', name: 'SYSTEM', lines: ['THE GUARDIAN FALLS.'] },
        { cmd: 'bgm',    name: 'victory' },
      ]);
      world.destroyEntity(vid);
    },
  });
}

function _bossEnterPhase2(vid) {
  // Mutate the live enemyAI component to increase speed and attack rate.
  const ai  = world.get(vid, 'enemyAI');
  const dmg = world.get(vid, 'damageable');
  if (ai)  { ai.weapon = { ...ai.weapon, cooldownMax: 0.8 }; }
  if (dmg) { dmg.iframeMax = 0.5; }   // shorter invincibility — more vulnerable

  emitBurst(world.get(vid,'transform').x + 4,
            world.get(vid,'transform').y + 4, 'levelup');
  sound.playSFX('alert');
  alertGroup('boss_floor', world.get(vid,'transform').x,
                            world.get(vid,'transform').y);
  cutscene.run([
    { cmd: 'bgm',    name: 'boss_phase2' },
    { cmd: 'dialog', name: 'GUARDIAN', lines: ['YOU CANNOT STOP ME!'] },
  ]);
}

function _bossEnterPhase3(vid) {
  const vel = world.get(vid, 'velocity');
  if (vel) vel.speed = 48;   // charge speed

  cutscene.run([
    { cmd: 'sfx',    name: 'alert' },
    { cmd: 'dialog', name: 'GUARDIAN', lines: ['ENOUGH! I WILL END THIS!'] },
  ]);
}
```

### Arena Lock

An arena lock prevents `sysSceneTransition` from firing portal exits while the boss is alive. The simplest approach: check `getFlag('boss_dead')` in each portal's `condition` field, or wrap `startTransition` in game code.

**Option A — flag-gated portal in scene config:**

```js
portals: [
  {
    tileX: 1, tileY: 9,
    targetScene: 'overworld', targetX: 10, targetY: 5,
    condition: () => getFlag('boss_dead'),   // blocked until boss dies
  },
]
```

**Option B — block `sysSceneTransition` globally during boss fight:**

```js
// Override sysSceneTransition in your game loop:
function safeSysSceneTransition() {
  if (aggroTableActive('boss_floor')) return;   // boss alive → no exit
  sysSceneTransition();
}
```

**Option C — arena door entity (visual + logical block):**

```js
// Spawn a blocking solid entity over the exit when boss spawns.
let arenaDoorId = world.createEntity({
  transform: { x: 0, y: 9 * TILE_SIZE },
  sprite:    { name: 'door_locked' },
  collider:  true,
});

// In onDeath:
world.destroyEntity(arenaDoorId);
arenaDoorId = -1;
```

Option C gives the player a visible blocked door rather than silently ignoring the input. Combine with Option A for belt-and-suspenders correctness.

### Spawner Integration

Wrap the boss in a `createSpawner` with a `flagName` guard so permanent death survives scene reloads and save/load cycles:

```js
createSpawner(
  {
    tileX: 10, tileY: 8,
    sprite: 'boss_idle',
    hp: 20,
    useLOS: false,
    leashRange: 999,
    alertRange: 999,
    team: 'boss',
    aggroGroup: 'boss_floor',
    onHit:   (vid, aid, amount) => { /* phase logic */ },
    onDeath: (vid, aid) => {
      setFlag('boss_dead');
      // ... cutscene ...
      world.destroyEntity(vid);
    },
  },
  {
    type:         'melee',
    flagName:     'boss_dead',   // spawner never restarts after flag is set
    respawnDelay: 0,             // irrelevant — permanent kill
  }
);
```

The flag is written in `onDeath` and checked by `sysSpawner` on every tick. Because `saveLoad.load()` restores flags before `loadScene` re-runs `spawnSceneEnemies`, the boss stays dead across sessions.

### Multi-Phase Sprite Swap

`spawnEnemy` sets the animator once at creation. To change the boss sprite on phase transition, replace the `animator` component in place:

```js
function _bossEnterPhase2(vid) {
  const clips = {
    idle:      { frames: ['boss_phase2_idle'], durations: 0.3 },
    walk_down: { frames: ['boss_phase2_walk'], durations: 0.15 },
    walk_up:   { frames: ['boss_phase2_walk'], durations: 0.15 },
    walk_side: { frames: ['boss_phase2_walk'], durations: 0.15 },
    attack:    { frames: ['boss_phase2_atk'],  durations: 0.1 },
  };
  world.set(vid, 'animator', createAnimator(clips, 'idle'));
}
```

The animator is an ordinary ECS component — `world.set` replaces it cleanly with no side effects. The new clips take effect on the next `sysAnimation` tick.

### Boss HUD Health Bar

`renderHUD` does not draw a boss bar automatically. Add one to your render pass:

```js
function renderBossBar() {
  if (bossId === -1) return;
  const dmg = world.get(bossId, 'damageable');
  if (!dmg) return;
  const pct = dmg.hp / dmg.maxHp;                    // 0..1
  const bx = 20, by = 2, bw = 120, bh = 4;
  fillRectPx(bx,                  by, bw,            bh, 1);   // background
  fillRectPx(bx, by, Math.round(bw * pct), bh, pct > 0.33 ? 26 : 7);  // fill
  drawText('GUARDIAN', bx, by - 7, 20);
}

// In render pass, before flushBuffer():
renderBossBar();
```

---

## Internal Helpers (v5.2 DRY Refactor)

These are internal — not part of the public API — but documented here for contributors and advanced customization.

| Helper | Purpose |
|---|---|
| `_rasterizeBuf(resolveIdx)` | Shared RGBA pixel-write core for sprite rasterization and palette swap |
| `_dist2(ax, ay, bx, by)` | Euclidean distance squared; avoids sqrt in hot comparisons |
| `_toCardinal(dx, dy)` | Snaps a continuous vector to the dominant cardinal axis |
| `_enemyClipsFromSprite(name)` | Builds a five-clip animator from a single static sprite name |
| `_applyWalkAnim(anim, dx, dy)` | Sets the correct walk clip and `flipX` from a movement vector |
| `_enemyCanSeePlayer(ai, tf, ptf)` | Combines distance and optional LOS into a single boolean predicate |
| `_aggroTableAlert(group, x, y)` | Writes or refreshes an alarm entry in the aggro table |
| `_aggroTableTriggered(ai, tf)` | Returns `true` when a live alarm exists and the enemy is in range |
| `_spawnerFactory(type)` | Returns `spawnEnemy` or `spawnRangedEnemy` by type string |
| `_resolveSpawnerDef(def)` | Converts `tileX/tileY` to pixel coords without mutating the stored def |
| `_preSpawnEffect(def)` | Fires the portal burst and SFX at the spawn point |
| `_enemyTransition(id, ai, state)` | Changes state, resets timer, fires alert effects and aggro propagation |