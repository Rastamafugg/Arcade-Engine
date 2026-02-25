import { blitWorld } from "../renderer";
import { _clampToWorld } from "../physics";
import { resolveMove, collidesAt, spatialHash } from "../physics";

let playerId = -1;

const sceneTransition = {
  state: 'none',
  alpha: 0, speed: 3,
  pendingScene: '', pendingX: 0, pendingY: 0,
};

const sceneNpcIds = [];
let _scenes = {};

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

// ================================================================
// SECTION 17: DIALOG
// ================================================================
const dialog = {
  active:   false,
  lines:    [],
  page:     0,
  name:     '',
  _onClose: null,
  _branch:  null,
};

export function renderDialog(elapsed) {
  if (!dialog.active) return;
  const bx = 8, by = LOGICAL_H - 54, bw = LOGICAL_W - 16, bh = 48;
  drawBox(bx, by, bw, bh, 1, 20);
  if (dialog.name) {
    fillRectPx(bx + 3, by - 10, dialog.name.length * CHAR_W + 6, 11, 14);
    fillRectPx(bx + 3, by - 10, dialog.name.length * CHAR_W + 6, 1, 21);
    drawText(dialog.name, bx + 6, by - 8, 7);
  }
  drawText(dialog.lines[dialog.page] ?? '', bx + 5, by + 5, 20);
  if (Math.floor(elapsed * 3) % 2 === 0) {
    const label = dialog.page < dialog.lines.length - 1 ? '>' : 'X';
    drawText(label, bx + bw - 10, by + bh - 10, 21);
  }
}

// ================================================================
// SECTION 18: SAVE / LOAD
// ================================================================
let _saveKey = 'pixelCanvas_v5';
export function setSaveKey(k) { _saveKey = k; }

const saveNote = { text: '', timer: 0 };
export function showNote(msg, dur = 2.5) { saveNote.text = msg; saveNote.timer = dur; }

export function renderSaveNote() {
  if (saveNote.timer <= 0) return;
  const x = ((LOGICAL_W - textWidth(saveNote.text)) / 2) | 0;
  fillRectPx(x - 3, 3, textWidth(saveNote.text) + 6, CHAR_H + 2, 1);
  drawText(saveNote.text, x, 4, 7);
}

// Shared try/catch wrapper for localStorage operations.
// fn() should return a truthy result on success, falsy on logical failure.
// Returns false and logs on exception.
export function _tryStorage(fn, label) {
  try { return fn(); }
  catch(e) { console.warn(label + ':', e.message); return false; }
}

const saveLoad = {
  save() {
    const ptf = world.get(playerId, 'transform');
    if (!ptf) return false;
    return _tryStorage(() => {
      localStorage.setItem(_saveKey, JSON.stringify({
        version: 2,
        scene:   worldState.currentScene,
        x: ptf.x | 0, y: ptf.y | 0,
        flags:   { ...flags },
        hud:     { hp: hud.hp, maxHp: hud.maxHp, coins: hud.coins },
      }));
      return true;
    }, 'Save failed');
  },
  load() {
    return _tryStorage(() => {
      const raw  = localStorage.getItem(_saveKey);
      if (!raw) return false;
      const data = JSON.parse(raw);
      if (data.version !== 2 || !_scenes[data.scene]) return false;
      if (data.flags) Object.assign(flags, data.flags);
      if (data.hud) {
        hud.hp     = data.hud.hp    ?? hud.hp;
        hud.maxHp  = data.hud.maxHp ?? hud.maxHp;
        hud.coins  = data.hud.coins ?? hud.coins;
      }
      loadScene(data.scene, data.x, data.y);
      return true;
    }, 'Load failed');
  },
  hasSave() {
    return _tryStorage(() => !!localStorage.getItem(_saveKey), 'hasSave');
  },
};

window.addEventListener('keydown', e => {
  if (e.code === 'F5') {
    e.preventDefault(); sound.init();
    if (saveLoad.save()) { sound.playSFX('save'); showNote('GAME SAVED!'); }
    else showNote('SAVE FAILED');
  }
  if (e.code === 'F9') {
    e.preventDefault(); sound.init();
    if (saveLoad.load()) { sound.playSFX('confirm'); showNote('GAME LOADED!'); }
    else showNote('NO SAVE FOUND');
  }
});

// ================================================================
// SECTION 19: BUILT-IN SYSTEMS
// ================================================================

// Shared walk-animation helper. Sets the correct clip and flipX on
// an animator given a movement direction vector (dx, dy).
// Used by sysInput, sysAI, and the cutscene move command.
export function _applyWalkAnim(anim, dx, dy) {
  if (Math.abs(dy) > Math.abs(dx)) {
    animatorPlay(anim, dy > 0 ? 'walk_down' : 'walk_up');
    anim.flipX = false;
  } else {
    animatorPlay(anim, 'walk_side');
    anim.flipX = dx < 0;
  }
}

export function sysInput() {
  if (dialog.active || sceneTransition.state !== 'none' || cutscene.isInputLocked()) {
    const vel = world.get(playerId, 'velocity');
    if (vel) { vel.dx = 0; vel.dy = 0; }
    return;
  }

  // Item slot cycling (processed before movement).
  if (input.pressed('itemNext')) hud.cycleSlot(1);
  if (input.pressed('itemPrev')) hud.cycleSlot(-1);

  const vel  = world.get(playerId, 'velocity');
  const anim = world.get(playerId, 'animator');
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
  const ptf = world.get(playerId, 'transform');
  if (ptf) camera.follow(ptf.x + TILE_SIZE/2, ptf.y + TILE_SIZE/2, worldState.w, worldState.h);
}

export function sysAnimation(delta) {
  for (const id of world.query('animator')) {
    animatorUpdate(world.get(id, 'animator'), delta);
  }
}

export function sysSceneTransition() {
  if (sceneTransition.state !== 'none' || dialog.active || cutscene.isInputLocked()) return;
  const ptf = world.get(playerId, 'transform');
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

export function sysDialog(elapsed) {
  if (dialog.active) {
    if (input.pressed('action') || input.pressed('cancel')) {
      if (dialog.page < dialog.lines.length - 1 && input.pressed('action')) {
        dialog.page++;
        sound.playSFX('dialog');
      } else {
        const onClose = dialog._onClose;
        const branch  = dialog._branch;
        dialog.active   = false;
        dialog._onClose = null;
        dialog._branch  = null;
        sound.playSFX('cancel');
        if (branch)  _applyDialogBranch(branch);
        if (onClose) onClose();
      }
    }
    return;
  }
  if (cutscene.isRunning()) return;

  // Use action key: first check chests, then NPCs, then selected item use.
  if (!input.pressed('action')) return;
  const ptf = world.get(playerId, 'transform');
  if (!ptf) return;

  const nearby = spatialHash.queryRect(ptf.x - 12, ptf.y - 12, TILE_SIZE + 24, TILE_SIZE + 24);

  // Single pass: chest takes priority over NPC. Accumulate first NPC
  // candidate while scanning so we never iterate the Set twice.
  let npcCandidate = null;
  for (const id of nearby) {
    if (id === playerId) continue;
    const chest = world.get(id, 'chest');
    if (chest && !chest.opened) { _openChest(id); return; }
    if (!npcCandidate) {
      const npc = world.get(id, 'npcData');
      if (npc) npcCandidate = { id, npc };
    }
  }

  if (npcCandidate) {
    const { id, npc } = npcCandidate;
    const { lines, branch } = _resolveNpcDialog(npc);
    dialog.active  = true;
    dialog.lines   = lines;
    dialog.name    = npc.name;
    dialog.page    = 0;
    dialog._branch = branch;
    dialog._onClose = npc.onClose ? () => npc.onClose(id) : null;
    sound.init();
    sound.playSFX('dialog');
    return;
  }

  // Selected item use.
  hud.useSelectedItem();
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
// SECTION 22: QUEST / FLAG SYSTEM
// ================================================================
const flags = {};
const _watchers = [];

export function setFlag(name, val = true) {
  const prev = flags[name];
  flags[name] = !!val;
  if (val && !prev) _fireWatchers();
}

export function clearFlag(name) { flags[name] = false; }
export function getFlag(name)   { return !!flags[name]; }
export function hasFlags(...names) { return names.every(n => !!flags[n]); }

export function onFlags(flagNames, fn, { once = true } = {}) {
  const w = { flagNames, fn, once, fired: false };
  _watchers.push(w);
  if (flagNames.every(n => flags[n])) { w.fired = true; fn(); }
  return w;
}

export function _fireWatchers() {
  for (const w of _watchers) {
    if (w.fired && w.once) continue;
    if (w.flagNames.every(n => flags[n])) {
      if (w.once) w.fired = true;
      w.fn();
    }
  }
}

export function _resolveNpcDialog(npc) {
  for (const b of (npc.dialogBranches ?? [])) {
    const reqOk = !b.requires || b.requires.every(f => flags[f]);
    const excOk = !b.excludes || !b.excludes.some(f => flags[f]);
    if (reqOk && excOk) return { lines: b.lines ?? npc.dialogLines, branch: b };
  }
  return { lines: npc.dialogLines, branch: null };
}

export function _applyDialogBranch(branch) {
  if (!branch) return;
  if (branch.setFlags)   branch.setFlags.forEach(f => setFlag(f));
  if (branch.clearFlags) branch.clearFlags.forEach(f => clearFlag(f));
  if (branch.addCoins)   hud.addCoins(branch.addCoins);
  if (branch.addHp)      hud.addHp(branch.addHp);
  if (branch.emit)       emitBurst(branch.emit.x, branch.emit.y, branch.emit.preset);
  if (branch.runScript)  cutscene.run(branch.runScript);
}

// ================================================================
// SECTION 23: CUTSCENE / SCRIPT SYSTEM
// ================================================================
export const cutscene = (() => {
  let _queue    = [];
  let _running  = false;
  let _current  = null;
  let _waitT    = 0;
  let _locked   = false;
  let _moveData = null;

  function run(commands) {
    _queue = [...commands]; _running = true; _current = null;
    _locked = false; _moveData = null;
    _advance();
  }

  function stop() {
    _queue = []; _running = false; _current = null;
    _locked = false; _moveData = null;
  }

  function isRunning()     { return _running; }
  function isInputLocked() { return _locked;  }

  function _advance() {
    if (!_queue.length) { _running = false; _current = null; return; }
    _current = _queue.shift();
    _exec(_current);
  }

  function _exec(cmd) {
    switch (cmd.cmd) {
      case 'wait':       _waitT = cmd.seconds; break;
      case 'dialog':
        dialog.active   = true;
        dialog.name     = (cmd.name ?? '').toUpperCase();
        dialog.lines    = cmd.lines.map(l => l.toUpperCase());
        dialog.page     = 0;
        dialog._branch  = null;
        dialog._onClose = _advance;
        sound.playSFX('dialog');
        break;
      case 'sfx':      sound.playSFX(cmd.name);      _advance(); break;
      case 'bgm':      sound.playBGM(cmd.name);      _advance(); break;
      case 'stopBgm':  sound.stopBGM();               _advance(); break;
      case 'lockInput':_locked = !!cmd.value;         _advance(); break;
      case 'hud':      hud.visible = cmd.show !== false; _advance(); break;
      case 'emit':     emitBurst(cmd.x, cmd.y, cmd.preset); _advance(); break;
      case 'call':     cmd.fn();                      _advance(); break;
      case 'flag':     setFlag(cmd.name, cmd.value ?? true); _advance(); break;
      case 'move': {
        const tf = world.get(cmd.id, 'transform');
        if (!tf) { _advance(); return; }
        _moveData = {
          id:      cmd.id,
          targetX: cmd.tx * TILE_SIZE,
          targetY: cmd.ty * TILE_SIZE,
          speed:   cmd.speed ?? 45,
        };
        world.set(cmd.id, '_scriptMove', true);
        break;
      }
      case 'transition':
        _advance();
        startTransition(cmd.scene, cmd.tx * TILE_SIZE, cmd.ty * TILE_SIZE);
        break;
      default:
        console.warn('[cutscene] unknown cmd:', cmd.cmd);
        _advance();
    }
  }

  function update(delta) {
    if (!_running || !_current) return;
    if (_current.cmd === 'wait') {
      _waitT -= delta;
      if (_waitT <= 0) _advance();
      return;
    }
    if (_current.cmd === 'dialog') return;
    if (_current.cmd === 'move' && _moveData) {
      const md = _moveData;
      const tf = world.get(md.id, 'transform');
      if (!tf) { _moveData = null; world.set(md.id, '_scriptMove', false); _advance(); return; }
      const dx = md.targetX - tf.x, dy = md.targetY - tf.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      if (dist < 2) {
        tf.x = md.targetX; tf.y = md.targetY;
        const vel  = world.get(md.id, 'velocity');
        const anim = world.get(md.id, 'animator');
        if (vel)  { vel.dx = 0; vel.dy = 0; }
        if (anim) animatorPlay(anim, 'idle');
        world.set(md.id, '_scriptMove', false);
        _moveData = null;
        _advance();
      } else {
        const vel  = world.get(md.id, 'velocity');
        const anim = world.get(md.id, 'animator');
        if (vel) { vel.dx = (dx / dist) * md.speed; vel.dy = (dy / dist) * md.speed; }
        if (anim) _applyWalkAnim(anim, dx, dy);
      }
    }
  }

  return { run, stop, isRunning, isInputLocked, update };
})();

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

// ================================================================
// SECTION 26: ENGINE TICK
// Call once per frame with delta. Advances all internal subsystems.
// ================================================================
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
let _iframeFlickerVisible = true;

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
  const ptf = world.get(playerId, 'transform');  // null if player not spawned

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
