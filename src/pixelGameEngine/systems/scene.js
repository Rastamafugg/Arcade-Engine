import { world } from './ecs.js';
import { createAnimator } from './animation.js';
import { getFlag } from './flags.js';
import { sound } from './sound.js';
import { worldState } from '../world.js';
import { _spawnChestEntity } from './chest.js';
import { spawnSceneEnemies } from './spawner.js';
import { TILE_SIZE } from '../config.js';
import { camera } from '../world.js';

export let playerId = -1;
const sceneNpcIds = [];
export let _scenes = {};

// Default NPC clip factory. Override with setNpcClipFactory().
let _npcClipFactory = s => {
  const clip = dur => ({ frames: [s], durations: dur });
  return {
    idle:      clip(0.4),
    walk_down: clip(0.3),
    walk_up:   clip(0.3),
    walk_side: clip(0.3),
  };
};

export const sceneTransition = {
  state: 'none',
  alpha: 0, speed: 3,
  pendingScene: '', pendingX: 0, pendingY: 0,
};

export function registerScenes(scenes) { _scenes = scenes; }
export function setNpcClipFactory(fn)  { _npcClipFactory = fn; }

export function clearSceneEntities() {
  for (const id of [...world.allIds])
    if (!world.has(id, 'persistent')) world.destroyEntity(id);
  sceneNpcIds.length = 0;
}

export function spawnSceneNpcs(scene) {
  for (const def of (scene.npcs || [])) {
    const clips = _npcClipFactory(def.sprite);
    const id = world.createEntity({
      transform: { x: def.tileX * TILE_SIZE, y: def.tileY * TILE_SIZE },
      velocity:  { dx: 0, dy: 0, speed: def.patrol?.speed ?? 0 },
      animator:  createAnimator(clips, 'idle'),
      collider:  true,
      npcData:   {
        name:           def.name,
        dialogLines:    def.dialog,
        dialogBranches: def.dialogBranches ?? [],
        onClose:        def.onClose ?? null,
      },
      ...(def.patrol ? { patrol: { ...def.patrol } } : {}),
    });
    sceneNpcIds.push(id);
  }
}

// Spawn chests defined in scene config.
// def: { tileX, tileY, loot: [{ type, sprite }], flagName }
export function spawnSceneChests(scene) {
  for (const def of (scene.chests || [])) {
    if (def.flagName && getFlag(def.flagName)) continue; // already opened
    _spawnChestEntity(def.tileX * TILE_SIZE, def.tileY * TILE_SIZE,
      def.loot ?? [], def.flagName ?? null);
  }
}

export function loadScene(name, px = null, py = null) {
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
  spawnSceneChests(scene);
  spawnSceneEnemies(scene);
  camera.x = 0; camera.y = 0;
  sound.playBGM(scene.music);
  scene.onEnter?.();
}

export function startTransition(targetScene, targetX, targetY) {
  if (sceneTransition.state !== 'none') return;
  sceneTransition.state = 'out'; sceneTransition.alpha = 0;
  sceneTransition.pendingScene = targetScene;
  sceneTransition.pendingX = targetX; sceneTransition.pendingY = targetY;
  sound.playSFX('portal');
}

export function updateTransition(delta) {
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

export function renderTransitionOverlay() {
  if (sceneTransition.state === 'none' || sceneTransition.alpha <= 0) return;
  ctx.fillStyle = `rgba(0,0,0,${sceneTransition.alpha.toFixed(2)})`;
  ctx.fillRect(0, 0, LOGICAL_W, LOGICAL_H);
}
