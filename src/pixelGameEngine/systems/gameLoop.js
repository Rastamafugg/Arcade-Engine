import { _applyWalkAnim, animatorPlay, animatorUpdate, animatorSprite } from './animation.js';
import { spriteCache } from './spriteCache.js';
import { TILE_SIZE } from '../config.js';
import { cutscene } from './cutscene.js';
import { dialog } from './dialog.js';
import { world } from './ecs.js';
import { sysAggroTable } from './enemy.js';
import { input } from './input.js';
import { updateParticles } from './particles.js';
import { _clampToWorld, resolveMove, spatialHash } from '../physics.js';
import { blitWorld } from '../renderer.js';
import { saveNote } from './saveLoad.js';
import { getPlayerId, sceneTransition, _scenes } from './scene.js';
import { camera } from '../world.js';
import { hud } from '../ui/hud.js';

// ================================================================
// SECTION 19: BUILT-IN SYSTEMS
// ================================================================

export function sysInput() {
  if (dialog.active || sceneTransition.state !== 'none' || cutscene.isInputLocked()) {
    const vel = world.get(getPlayerId(), 'velocity');
    if (vel) { vel.dx = 0; vel.dy = 0; }
    return;
  }

  // Item slot cycling (processed before movement).
  if (input.pressed('itemNext')) hud.cycleSlot(1);
  if (input.pressed('itemPrev')) hud.cycleSlot(-1);

  const vel  = world.get(getPlayerId(), 'velocity');
  const anim = world.get(getPlayerId(), 'animator');
  if (!vel || !anim) return;

  let dx = 0, dy = 0;
  const ax = input.axis();
  if (input.held('left')  || ax.x < -0.15) dx = -1;
  if (input.held('right') || ax.x >  0.15) dx =  1;
  if (input.held('up')    || ax.y < -0.15) dy = -1;
  if (input.held('down')  || ax.y >  0.15) dy =  1;

  vel.dx = dx * vel.speed;
  vel.dy = dy * vel.speed;

  if (dx !== 0 || dy !== 0) {
    _applyWalkAnim(anim, dx, dy);
  } else {
    animatorPlay(anim, 'idle');
  }
}

export function sysAI(delta) {
  for (const id of world.query('transform', 'velocity', 'patrol', 'animator')) {
    if (world.has(id, '_scriptMove')) continue;
    const tf     = world.get(id, 'transform');
    const vel    = world.get(id, 'velocity');
    const patrol = world.get(id, 'patrol');
    const anim   = world.get(id, 'animator');
    const wp     = patrol.waypoints[patrol.waypointIdx];
    const dx = wp.x - tf.x, dy = wp.y - tf.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist < 2) {
      patrol.waypointIdx = (patrol.waypointIdx + 1) % patrol.waypoints.length;
      vel.dx = 0; vel.dy = 0;
      animatorPlay(anim, 'idle');
    } else {
      vel.dx = (dx / dist) * patrol.speed;
      vel.dy = (dy / dist) * patrol.speed;
      _applyWalkAnim(anim, dx, dy);
    }
  }
}

export function sysMovement(delta) {
  for (const id of world.query('transform', 'velocity')) {
    const tf  = world.get(id, 'transform');
    const vel = world.get(id, 'velocity');
    if (vel.dx === 0 && vel.dy === 0) continue;
    if (world.has(id, 'collider')) {
      const pos = resolveMove(tf.x, tf.y, vel.dx * delta, vel.dy * delta);
      tf.x = pos.x; tf.y = pos.y;
    } else {
      const clamped = _clampToWorld(tf.x + vel.dx * delta, tf.y + vel.dy * delta);
      tf.x = clamped.x; tf.y = clamped.y;
    }
  }
}

export function sysSpatialHash() {
  spatialHash.clear();
  for (const id of world.query('transform')) {
    const tf = world.get(id, 'transform');
    spatialHash.insert(id, tf.x, tf.y);
  }
}

export function sysCamera() {
  const ptf = world.get(getPlayerId(), 'transform');
  if (ptf) camera.follow(ptf.x + TILE_SIZE/2, ptf.y + TILE_SIZE/2, worldState.w, worldState.h);
}

export function sysAnimation(delta) {
  for (const id of world.query('animator')) {
    animatorUpdate(world.get(id, 'animator'), delta);
  }
}

export function sysSceneTransition() {
  if (sceneTransition.state !== 'none' || dialog.active || cutscene.isInputLocked()) return;
  const ptf = world.get(getPlayerId(), 'transform');
  if (!ptf) return;
  const tx = ptf.x / TILE_SIZE | 0;
  const ty = ptf.y / TILE_SIZE | 0;
  const portals = _scenes[worldState.currentScene]?.portals ?? [];
  for (const p of portals) {
    if (tx === p.tileX && ty === p.tileY) {
      if (p.script) { cutscene.run(p.script); return; }
      startTransition(p.targetScene, p.targetTileX * TILE_SIZE, p.targetTileY * TILE_SIZE);
      return;
    }
  }
}

// Entity render pass: world-space (clips below HUD).
export function sysRender() {
  for (const id of world.query('transform')) {
    const tf = world.get(id, 'transform');
    if (!camera.isVisible(tf.x, tf.y)) continue;
    const anim = world.get(id, 'animator');
    let buf = null, flipX = false, flipY = false;
    if (anim) {
      const sn = animatorSprite(anim);
      buf = sn ? spriteCache[sn] : null;
      flipX = anim.flipX; flipY = anim.flipY;
    } else {
      const sp = world.get(id, 'sprite');
      if (sp) { buf = sp.buf || spriteCache[sp.name]; flipX = !!sp.flipX; }
    }
    if (!buf) continue;
    // Iframe flicker: hide damageable entity every other flicker tick.
    const dmgable = world.get(id, 'damageable');
    if (dmgable && dmgable.iframes > 0 && !_iframeFlickerVisible) continue;
    const [sx, sy] = camera.toScreen(tf.x, tf.y);
    blitWorld(buf, sx | 0, sy | 0, flipX, flipY);
  }
}

// ================================================================
// SECTION 26: ENGINE TICK
// Call once per frame with delta. Advances all internal subsystems.
// ================================================================

const IFRAME_FLICKER_INTERVAL = 0.08;
let _iframeFlickerTimer   = 0;
let _iframeFlickerVisible = true;

export function engineTick(delta) {
  if (saveNote.timer > 0) saveNote.timer -= delta;
  updateParticles(delta);
  cutscene.update(delta);
  sysAggroTable(delta);   // decay group alerts when no member is in combat
  // Iframe flicker toggle.
  _iframeFlickerTimer += delta;
  if (_iframeFlickerTimer >= IFRAME_FLICKER_INTERVAL) {
    _iframeFlickerTimer -= IFRAME_FLICKER_INTERVAL;
    _iframeFlickerVisible = !_iframeFlickerVisible;
  }
}
