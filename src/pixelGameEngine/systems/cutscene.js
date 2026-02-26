import { world } from './ecs.js';
import { dialog } from './dialog.js';
import { sound } from './sound.js';
import { emitBurst } from './particles.js';
import { _applyWalkAnim, animatorPlay } from './animation.js';
import { TILE_SIZE } from '../config.js';
import { hud } from '../ui/hud.js';
import { setFlag } from './flags.js';


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
