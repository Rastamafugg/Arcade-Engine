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
│   ├── scene.js         # Scene manager
│   ├── dialog.js        # Dialog
│   ├── flags.js         # Flags
│   ├── cutscene.js      # Cutscenes
│   ├── combat.js        # Combat system
│   ├── enemy.js         # Enemy and Ranged Enemy logic
│   ├── spawner.js       # Spawner entities and logic
│   ├── chest.js         # Chests and loot logic
│   ├── saveLoad.js      # Save and Load system
│   └── gameLoop.js      # Game Loop
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