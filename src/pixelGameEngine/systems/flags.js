import { hud } from '../ui/hud.js';
import { emitBurst } from './particles.js';
import { cutscene } from './cutscene.js';

const flags = {};
const _watchers = [];

export function getFlags()   { return flags; }
export function getFlag(name)   { return !!flags[name]; }
export function setFlag(name, val = true) {
  const prev = flags[name];
  flags[name] = !!val;
  if (val && !prev) _fireWatchers();
}

export function clearFlag(name) { flags[name] = false; }
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
