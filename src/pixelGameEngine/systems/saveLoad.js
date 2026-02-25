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

export const saveLoad = {
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
