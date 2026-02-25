import { world } from '../systems/ecs.js';
import { TILE_SIZE } from '../config.js';
import { collidesAt } from '../physics.js';
import { _fbSetPixel } from '../renderer.js';

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
export let _iframeFlickerVisible = true;

export function sysDamage(delta) {
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

export function spawnAttack(ownerId, weapon, wx, wy, dirX, dirY) {
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
export function sysProjectile(delta) {
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
export function sysSwing(delta) {
  for (const id of world.query('swing')) {
    const sw = world.get(id, 'swing');
    if (!sw) continue;
    sw.life -= delta;
    if (sw.life <= 0) world.destroyEntity(id);
  }
}
