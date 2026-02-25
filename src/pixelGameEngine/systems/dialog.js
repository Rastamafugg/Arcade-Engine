import { drawBox, drawText } from '../renderer.js';
import { input } from './input.js';
import { sound } from './sound.js';
import { world } from './ecs.js';
import { spatialHash } from '../physics.js';
import { playerId } from './scene.js';

export const dialog = {
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
