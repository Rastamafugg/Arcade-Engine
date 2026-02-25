const ACTION_MAP = {
  up:       { keys: ['ArrowUp',   'KeyW'],   gpButtons: [12] },
  down:     { keys: ['ArrowDown', 'KeyS'],   gpButtons: [13] },
  left:     { keys: ['ArrowLeft', 'KeyA'],   gpButtons: [14] },
  right:    { keys: ['ArrowRight','KeyD'],   gpButtons: [15] },
  action:   { keys: ['KeyZ','Space'],         gpButtons: [0]  },
  cancel:   { keys: ['KeyX','Escape'],        gpButtons: [1]  },
  // Cycle item selection in the HUD inventory slots.
  itemNext: { keys: ['KeyE','Tab'],           gpButtons: [5]  },  // R-bumper / E / Tab
  itemPrev: { keys: ['KeyQ'],                 gpButtons: [4]  },  // L-bumper / Q
  // Attack: fires active weapon (melee swing or projectile).
  attack:   { keys: ['KeyX'],                 gpButtons: [2]  },  // X key / gamepad X
};

export const input = (() => {
  const down = new Set(), pressed = new Set(), released = new Set();
  const snap = { held: {}, pressed: {}, released: {}, axis: { x: 0, y: 0 } };

  window.addEventListener('keydown', e => {
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
    if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space','Tab'].includes(e.code))
      e.preventDefault();
  });
  window.addEventListener('keyup', e => { down.delete(e.code); released.add(e.code); });

  return {
    update() {
      const gp = [...(navigator.getGamepads?.() || [])].find(g => g?.connected);
      snap.axis.x = gp && Math.abs(gp.axes[0]) > 0.15 ? gp.axes[0] : 0;
      snap.axis.y = gp && Math.abs(gp.axes[1]) > 0.15 ? gp.axes[1] : 0;
      for (const [a, m] of Object.entries(ACTION_MAP)) {
        const gpH = gp ? m.gpButtons.some(b => gp.buttons[b]?.pressed) : false;
        snap.held[a]      = m.keys.some(k => down.has(k)) || gpH;
        snap.pressed[a]   = m.keys.some(k => pressed.has(k)) || (gpH && !snap.held[a+'_p']);
        snap.released[a]  = m.keys.some(k => released.has(k));
        snap.held[a+'_p'] = gpH;
      }
      pressed.clear(); released.clear();
    },
    held:    a => !!snap.held[a],
    pressed: a => !!snap.pressed[a],
    released:a => !!snap.released[a],
    axis:    () => snap.axis,
  };
})();