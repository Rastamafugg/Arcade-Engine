import { world } from '../systems/ecs.js';
import { getFlag } from '../systems/flags.js';
import { emitBurst } from '../systems/particles.js';
import { sound } from '../systems/sound.js';
import { spawnEnemy, spawnRangedEnemy } from './enemy.js'; 
import { TILE_SIZE } from '../config.js';

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
export function _spawnerFactory(type) {
  return type === 'ranged' ? spawnRangedEnemy : spawnEnemy;
}

// Translate tileX/tileY in a def to pixel coords. Returns a new
// object so the stored def is never mutated.
export function _resolveSpawnerDef(def) {
  if (def.tileX === undefined && def.tileY === undefined) return def;
  return {
    ...def,
    x: (def.tileX ?? 0) * TILE_SIZE,
    y: (def.tileY ?? 0) * TILE_SIZE,
  };
}

// Fire the pre-spawn warning burst at the spawn point.
export function _preSpawnEffect(def) {
  const x = def.x ?? 0;
  const y = def.y ?? 0;
  emitBurst(x + 4, y + 4, 'portal');
  sound.playSFX('portal');   // optional; register via sound.registerSFX()
}

// ── Factory ──────────────────────────────────────────────────────
export function createSpawner(def, options = {}) {
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
export function spawnSceneEnemies(scene) {
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
export function sysSpawner(delta) {
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
