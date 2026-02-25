const _HUD_DEFS = {
  _hud_heart_full: [
    null,27,27,null,null,27,27,null,
    27,27,27,27,27,27,27,27,
    27,27,27,27,27,27,27,27,
    27,27,27,27,27,27,27,27,
    null,27,27,27,27,27,27,null,
    null,null,27,27,27,27,null,null,
    null,null,null,27,27,null,null,null,
    null,null,null,null,null,null,null,null,
  ],
  _hud_heart_half: [
    null,27,27,null,null,22,22,null,
    27,27,27,27,22,null,null,22,
    27,27,27,null,null,null,null,22,
    27,27,27,null,null,null,null,22,
    null,27,27,null,null,null,22,null,
    null,null,27,null,null,22,null,null,
    null,null,null,27,22,null,null,null,
    null,null,null,null,null,null,null,null,
  ],
  _hud_heart_empty: [
    null,22,22,null,null,22,22,null,
    22,null,null,22,22,null,null,22,
    22,null,null,null,null,null,null,22,
    22,null,null,null,null,null,null,22,
    null,22,null,null,null,null,22,null,
    null,null,22,null,null,22,null,null,
    null,null,null,22,22,null,null,null,
    null,null,null,null,null,null,null,null,
  ],
  _hud_coin: [
    null,null, 7, 7, 7, 7,null,null,
    null, 7,  20, 7, 7, 7, 7,null,
     7,  20,  7, 7, 7, 7, 7, 7,
     7,   7,  7, 7, 7, 7, 7, 7,
     7,   7,  7, 7, 7, 7, 7, 7,
    null, 7,  7, 7, 7, 7, 7,null,
    null,null, 7, 7, 7, 7,null,null,
    null,null,null,null,null,null,null,null,
  ],
  _hud_slot_empty: [
    14,14,14,14,14,14,14,14,
    14, 0, 0, 0, 0, 0, 0,14,
    14, 0, 0, 0, 0, 0, 0,14,
    14, 0, 0, 0, 0, 0, 0,14,
    14, 0, 0, 0, 0, 0, 0,14,
    14, 0, 0, 0, 0, 0, 0,14,
    14, 0, 0, 0, 0, 0, 0,14,
    14,14,14,14,14,14,14,14,
  ],
  // Chest sprites (palette-indexed 8×8).
  _chest_closed: [
    null, 3, 3, 3, 3, 3, 3,null,
       3, 5, 5, 5, 5, 5, 5, 3,
       3, 5, 7, 7, 7, 7, 5, 3,
       3, 3, 3, 3, 3, 3, 3, 3,
       3, 5, 5, 5, 5, 5, 5, 3,
       3, 5, 5, 5, 5, 5, 5, 3,
       3, 5, 5, 5, 5, 5, 5, 3,
    null, 3, 3, 3, 3, 3, 3,null,
  ],
  _chest_open: [
       3, 5, 7, 7, 7, 7, 5, 3,
       3, 3, 3, 3, 3, 3, 3, 3,
    null, 3, 3, 3, 3, 3, 3,null,
    null, 3, 0, 0, 0, 0, 3,null,
    null, 3, 0, 0, 0, 0, 3,null,
    null, 3, 0, 0, 0, 0, 3,null,
    null, 3, 0, 0, 0, 0, 3,null,
    null, 3, 3, 3, 3, 3, 3,null,
  ],
};

for (const [name, data] of Object.entries(_HUD_DEFS)) {
  spriteCache[name] = _rasterizeSprite(data);
}

const hud = {
  hp:           6,
  maxHp:        6,
  coins:        0,
  items:        [null, null, null, null],  // sprite names
  selectedSlot: null,                      // null = nothing selected, 0-3 = slot index
  visible:      true,
  _itemHandlers: new Map(),  // spriteName → fn(slotIndex)

  setHp(v)           { this.hp     = Math.max(0, Math.min(this.maxHp, v)); },
  addHp(n)           { this.setHp(this.hp + n); },
  setMaxHp(v)        { this.maxHp  = Math.max(2, v); },
  setCoins(v)        { this.coins  = Math.max(0, v); },
  addCoins(n)        { this.coins += n; },
  setItem(s, name)   { if (s >= 0 && s < 4) this.items[s] = name ?? null; },
  clearItem(s)       { this.setItem(s, null); },

  // Cycle through slots. direction = +1 or -1.
  // Cycling past end → null (no selection). Null cycles back to first populated slot.
  cycleSlot(direction) {
    const populated = this.items.reduce((a, v, i) => v ? [...a, i] : a, []);
    if (!populated.length) { this.selectedSlot = null; return; }
    if (this.selectedSlot === null) {
      this.selectedSlot = direction > 0 ? populated[0] : populated[populated.length - 1];
    } else {
      const cur  = populated.indexOf(this.selectedSlot);
      const next = cur + direction;
      this.selectedSlot = (next < 0 || next >= populated.length) ? null : populated[next];
    }
    sound.playSFX('dialog');
  },

  // Register a use handler for an item sprite name.
  // fn(slotIndex) is called when the player presses the action key
  // while that item is selected. Return false to suppress SFX.
  registerItemUse(spriteName, fn) {
    this._itemHandlers.set(spriteName, fn);
  },

  // Called by sysDialog when action is pressed and no NPC/chest is nearby.
  useSelectedItem() {
    if (this.selectedSlot === null) return;
    const spriteName = this.items[this.selectedSlot];
    if (!spriteName) return;
    const fn = this._itemHandlers.get(spriteName);
    if (fn) {
      const suppress = fn(this.selectedSlot) === false;
      if (!suppress) sound.playSFX('confirm');
    }
  },
};

export function renderHUD() {
  if (!hud.visible) return;

  fillRectPx(0, 0, LOGICAL_W, HUD_H, 0);
  fillRectPx(0, HUD_H - 1, LOGICAL_W, 1, 13);

  // Hearts.
  const heartCount = Math.ceil(hud.maxHp / 2);
  for (let i = 0; i < heartCount; i++) {
    const filled = hud.hp - i * 2;
    const key = filled >= 2 ? '_hud_heart_full'
              : filled === 1 ? '_hud_heart_half'
              : '_hud_heart_empty';
    blitBuffer(spriteCache[key], 2 + i * 9, 1);
  }

  // Coin icon + count.
  const coinX = 2 + heartCount * 9 + 4;
  blitBuffer(spriteCache['_hud_coin'], coinX, 1);
  drawText(`x${hud.coins}`, coinX + 9, 2, 7);

  // Item slots (right side). Selected slot gets a highlight border.
  for (let s = 0; s < 4; s++) {
    const sx = LOGICAL_W - 4 - (3 - s) * 10 - 8;
    if (hud.selectedSlot === s) {
      fillRectPx(sx - 1, 0,       10, 1, 7);    // top
      fillRectPx(sx - 1, HUD_H-1, 10, 1, 7);    // bottom (on separator line)
      fillRectPx(sx - 1, 0,        1, HUD_H, 7); // left
      fillRectPx(sx + 8, 0,        1, HUD_H, 7); // right
    }
    blitBuffer(spriteCache['_hud_slot_empty'], sx, 1);
    if (hud.items[s]) {
      const buf = spriteCache[hud.items[s]];
      if (buf) blitBuffer(buf, sx, 1);
    }
  }
}
