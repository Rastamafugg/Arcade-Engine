import { world } from '../systems/ecs.js';
import { emitBurst } from '../systems/particles.js';
import { sound } from '../systems/sound.js';
import { setFlag, showNote } from '../systems/gameLogic.js';

// ================================================================
// SECTION 24: CHEST SYSTEM
//
// Chest entities are ECS objects with a 'chest' component:
//   { opened: bool, loot: [{ sprite, type, onPickup }], flagName }
//
// _spawnChestEntity(wx, wy, loot, flagName)
//   Spawns a chest at world coords. loot is an array of loot defs.
//   flagName (optional): set when opened, gates re-spawn on reload.
//
// Loot def: { sprite: 'key_item', type: 'key', onPickup: fn }
//   onPickup(lootDef, chestId) is called when the loot is spawned.
//   Use it to apply effects (hud.addCoins, setFlag, etc.).
//   If omitted, loot is silently spawned as a pickup entity only.
//
// Scene config: add a 'chests' array to any scene definition:
//   chests: [
//     { tileX:5, tileY:8, flagName:'chest_5_8',
//       loot: [{ sprite:'coin_item', type:'coin', onPickup: ()=>hud.addCoins(3) }] }
//   ]
//
// Chest open sequence:
//   1. Sprite swaps to _chest_open
//   2. Loot entities spawn above the chest with upward velocity
//   3. 'chest' preset particle burst fires
//   4. SFX 'chest_open' plays (if registered) else falls back to 'confirm'
//   5. flagName is set if provided
// ================================================================

export function _spawnChestEntity(wx, wy, loot, flagName) {
  return world.createEntity({
    transform: { x: wx, y: wy },
    sprite:    { name: '_chest_closed', flipX: false },
    chest:     { opened: false, loot: loot ?? [], flagName: flagName ?? null },
    collider:  true,  // blocks movement
  });
}

// Internal: open a chest by entity id.
export function _openChest(id) {
  const chest = world.get(id, 'chest');
  const tf    = world.get(id, 'transform');
  if (!chest || !tf || chest.opened) return;

  chest.opened = true;

  // Swap to open sprite.
  world.set(id, 'sprite', { name: '_chest_open', flipX: false });

  // Remove collider so player can walk over it.
  if (world.has(id, 'collider')) world.set(id, 'collider', false);

  // Particle burst.
  emitBurst(tf.x + 4, tf.y + 4, 'chest');

  // SFX.
  sound.playSFX('chest_open');  // falls back silently if not registered

  // Set flag.
  if (chest.flagName) setFlag(chest.flagName);

  // Spawn loot entities above the chest, drifting upward briefly.
  let lootOffset = 0;
  for (const def of (chest.loot ?? [])) {
    world.createEntity({
      transform: { x: tf.x, y: tf.y - 2 - lootOffset },
      sprite:    { name: def.sprite, flipX: false },
      chestLoot: { vy: -(30 + lootOffset * 10), def },
    });
    lootOffset += 2;
    // Fire onPickup immediately (e.g. add coins, set flags).
    if (def.onPickup) def.onPickup(def, id);
  }

  // Show loot note if any loot has a label.
  const label = chest.loot.find(d => d.label)?.label;
  if (label) showNote(label);
}

// Animates the loot pop-up entities spawned by _openChest.
// Call this from the game loop. Loot entities fade out after ~0.6s.
export function sysChestLoot(delta) {
  for (const id of world.query('chestLoot', 'transform')) {
    const cl = world.get(id, 'chestLoot');
    const tf = world.get(id, 'transform');
    cl.vy += 180 * delta;     // gravity pulls back down
    tf.y  += cl.vy * delta;
    cl.timer = (cl.timer ?? 0) + delta;
    if (cl.timer > 0.7) world.destroyEntity(id);
  }
}
