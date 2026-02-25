/*
pixelGameEngine/
├── index.js             # Primary barrel file (entry point)
├── config.js            # Constants and Palette
├── renderer.js          # Canvas, Framebuffer, and Drawing API
├── assets.js            # Font data and Sprite caching
├── world.js             # Camera, World State, and Tilemap rendering
├── physics.js           # Spatial Hash and Collision detection
├── systems/
│   ├── ecs.js           # Entity Component System
│   ├── input.js         # Input handling
│   ├── sound.js         # Web Audio engine
│   ├── animation.js     # Sprite animation logic
│   ├── particles.js     # Particle system
│   ├── gameLogic.js     # Scene manager, Dialog, Flags, and Cutscenes
│   ├── scene.js       # registerScenes, loadScene, clearSceneEntities,
│   │                  # spawnSceneNpcs, spawnSceneChests, spawnSceneEnemies,
│   │                  # startTransition, updateTransition, renderTransitionOverlay
│   ├── dialog.js      # dialog state object, openDialog, renderDialog, sysDialog
│   ├── flags.js       # flags, setFlag, clearFlag, getFlag, hasFlags, onFlags, _fireWatchers
│   ├── cutscene.js    # cutscene IIFE, all cutscene commands
│   ├── combat.js      # spawnAttack, sysDamage, sysProjectile, sysSwing,
│   │                  # damageable iframe logic, _iframeFlickerVisible
│   ├── enemy.js       # spawnEnemy, spawnRangedEnemy, sysEnemy,
│   │                  # _enemyCanSeePlayer, _dist2, _toCardinal, _enemyClipsFromSprite,
│   │                  # aggroTable, sysAggroTable, alertGroup, clearAggroGroup, aggroTableActive
│   ├── spawner.js     # createSpawner, sysSpawner
│   ├── chest.js       # _spawnChestEntity, _openChest, sysChestLoot
│   └── gameLoop.js    # sysInput, sysAI, sysMovement, sysSpatialHash, sysCamera,
│                      # sysAnimation, sysSceneTransition, sysRender,
│                      # engineTick, _applyWalkAnim, saveLoad, setSaveKey,
│                      # showNote, renderSaveNote, playerId, initPlayer
└── ui/
    ├── hud.js           # HUD and Inventory
    └── minimap.js       # Minimap rendering
 */

export * from './config.js';
export * from './renderer.js';
export * from './assets.js';
export * from './world.js';
export * from './physics.js';
export { world } from './systems/ecs.js';
export { input } from './systems/input.js';
export { sound } from './systems/sound.js';
export * from './systems/animation.js';
export * from './systems/particles.js';
export * from './systems/scene.js';
export * from './systems/dialog.js';
export * from './systems/flags.js';
export * from './systems/cutscene.js';
export * from './systems/combat.js';
export * from './systems/enemy.js';
export * from './systems/spawner.js';
export * from './systems/chest.js';
export * from './systems/saveLoad.js';
export * from './systems/gameLoop.js';
export { hud } from './ui/hud.js';
export { renderMinimap } from './ui/minimap.js';