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
│   └── gameLogic.js     # Scene manager, Dialog, Flags, and Cutscenes
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
export * from './systems/gameLogic.js';
export { hud } from './ui/hud.js';
export { renderMinimap } from './ui/minimap.js';