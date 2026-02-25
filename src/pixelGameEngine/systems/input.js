const ACTION_MAP = {
  up:       { keys: ['ArrowUp',   'KeyW'],   gpButtons: [12] },
  down:     { keys: ['ArrowDown', 'KeyS'],   gpButtons: [13] },
  left:     { keys: ['ArrowLeft', 'KeyA'],   gpButtons: [14] },
  right:    { keys: ['ArrowRight','KeyD'],   gpButtons: [15] },
  action:   { keys: ['KeyZ','Space'],         gpButtons: [0]  }
};

export const input = (() => {
  const down = new Set(), pressed = new Set();
  const snap = { held: {}, pressed: {} };

  window.addEventListener('keydown', e => {
    if (!down.has(e.code)) pressed.add(e.code);
    down.add(e.code);
  });
  window.addEventListener('keyup', e => down.delete(e.code));

  return {
    update() {
      for (const [a, m] of Object.entries(ACTION_MAP)) {
        snap.held[a] = m.keys.some(k => down.has(k));
        snap.pressed[a] = m.keys.some(k => pressed.has(k));
      }
      pressed.clear();
    },
    held: a => !!snap.held[a],
    pressed: a => !!snap.pressed[a]
  };
})();