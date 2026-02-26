import { world } from '../systems/ecs.js';
import { TILE_SIZE } from '../config.js';
import { _applyWalkAnim, animatorPlay, createAnimator } from './animation.js';
import { hasLineOfSight } from '../physics.js';
import { emitBurst } from './particles.js';
import { getPlayerId } from './scene.js';
import { spawnAttack } from './combat.js';
import { sound } from './sound.js';

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
export function _enemyClipsFromSprite(spriteName) {
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
export function _dist2(ax, ay, bx, by) {
  const dx = ax - bx, dy = ay - by;
  return dx * dx + dy * dy;
}

// Snap a continuous direction vector to a single cardinal axis.
// Returns [dirX, dirY] where each component is -1, 0, or 1 and
// exactly one component is non-zero (dominant axis wins; X on tie).
export function _toCardinal(dx, dy) {
  if (dx === 0 && dy === 0) return [0, 1];  // default face-down
  return Math.abs(dx) >= Math.abs(dy)
    ? [(dx >= 0 ? 1 : -1), 0]
    : [0, (dy >= 0 ? 1 : -1)];
}

// Internal: change state and reset stateTimer. Fires alert burst/SFX
// on the 'chase' transition so the player gets a visual cue.
// Also writes an aggro-table entry so group-mates can join the chase
// (see Section 32 for the full aggro system).
export function _enemyTransition(id, ai, newState) {
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
export function spawnEnemy(def) {
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
export function _enemyCanSeePlayer(ai, tf, ptf) {
  if (!ptf) return false;
  const ex = tf.x  + TILE_SIZE / 2;
  const ey = tf.y  + TILE_SIZE / 2;
  const px = ptf.x + TILE_SIZE / 2;
  const py = ptf.y + TILE_SIZE / 2;
  const dx = ex - px, dy = ey - py;
  if (dx * dx + dy * dy > ai.alertRange * ai.alertRange) return false;
  return !ai.useLOS || hasLineOfSight(ex, ey, px, py);
}

export function sysEnemy(delta) {
  const ptf = world.get(getPlayerId(), 'transform');  // null if player not spawned

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

export function spawnRangedEnemy(def) {
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
export function _aggroTableAlert(groupName, alertX, alertY) {
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
export function _aggroTableTriggered(ai, tf) {
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
export function sysAggroTable(delta) {
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
export function alertGroup(groupName, x = 0, y = 0) {
  _aggroTableAlert(groupName, x, y);
}

// Immediately remove a group's alarm entry. Enemies already chasing
// continue to chase; only idle/patrolling members are unaffected.
export function clearAggroGroup(groupName) {
  aggroTable.delete(groupName);
}

// Returns true if a live alarm entry exists for the group.
export function aggroTableActive(groupName) {
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
