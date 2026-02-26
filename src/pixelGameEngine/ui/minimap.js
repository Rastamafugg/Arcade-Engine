import { camera, worldState }  from '../world.js';
import { world }               from '../systems/ecs.js';
import { playerId }            from '../systems/scene.js';
import { paletteRGBA } from '../config.js';
import { _fbSetPixel, fillRectPx } from '../renderer.js';

// ================================================================
// SECTION 25: MINIMAP
//
// renderMinimap(config?) renders a downsampled top-down map of the
// current scene's collision layer, with a player position dot,
// directly into the framebuffer.
//
// config fields (all optional):
//   corner:     'bottomRight' | 'bottomLeft' | 'topRight' | 'topLeft'
//               Default: 'bottomRight'
//   fixedMapW:  fixed pixel width of the map area (border included).
//   fixedMapH:  fixed pixel height of the map area (border included).
//               When both are set, tilePixels is computed as the largest
//               integer that fits worldCols × worldRows inside the budget.
//               This keeps the minimap the same screen size across scenes
//               of different dimensions. tilePixels is ignored when set.
//               Recommended: set to the smallest scene's natural size.
//               Example (cave = 20×18 @ tilePixels 2):
//                 fixedMapW: 42  (20*2+2)
//                 fixedMapH: 38  (18*2+2)
//   tilePixels: pixels per world tile. Used when fixedMapW/H are absent.
//               Default: 2
//   borderPal:  palette index for border. Default: 21
//   bgPal:      palette index for empty space. Default: 13
//   wallPal:    palette index for solid tiles. Default: 22
//   playerPal:  palette index for player dot. Default: 7
//   cameraPal:  palette index for camera viewport rect. Default: 14
//   margin:     px gap from screen edge. Default: 3
//   showCamera: draw a rect showing the current camera viewport. Default: true
//
// Without fixedMapW/H the total rendered size is:
//   width  = worldCols * tilePixels + 2
//   height = worldRows * tilePixels + 2
// ================================================================
export function renderMinimap(config = {}) {
  const {
    corner      = 'bottomRight',
    fixedMapW   = null,
    fixedMapH   = null,
    borderPal   = 21,
    bgPal       = 13,
    wallPal     = 22,
    playerPal   = 7,
    cameraPal   = 14,
    tilePixels  = 2,
    margin      = 3,
    showCamera  = true,
  } = config;

  const col = worldState.layerCollision;
  if (!col) return;
  const wCols = worldState.cols;
  const wRows = worldState.rows;

  // When fixedMapW/H are both provided, derive tilePixels so the world fits
  // inside the budget. mapW/mapH are locked to the fixed dimensions, keeping
  // the minimap the same screen size across scenes of different tile counts.
  let tp, mapW, mapH;
  if (fixedMapW !== null && fixedMapH !== null) {
    tp   = Math.max(1, Math.min(
             Math.floor((fixedMapW - 2) / wCols),
             Math.floor((fixedMapH - 2) / wRows)
           ));
    mapW = fixedMapW;
    mapH = fixedMapH;
  } else {
    tp   = tilePixels;
    mapW = wCols * tp + 2;
    mapH = wRows * tp + 2;
  }

  // Determine top-left corner of the minimap on screen.
  let mx, my;
  switch (corner) {
    case 'bottomLeft':  mx = margin;                   my = LOGICAL_H - mapH - margin;      break;
    case 'topRight':    mx = LOGICAL_W - mapW - margin; my = WORLD_OFFSET_Y + margin;        break;
    case 'topLeft':     mx = margin;                   my = WORLD_OFFSET_Y + margin;         break;
    case 'bottomRight':
    default:            mx = LOGICAL_W - mapW - margin; my = LOGICAL_H - mapH - margin;      break;
  }

  // Border fill.
  fillRectPx(mx, my, mapW, mapH, borderPal);
  // Background.
  fillRectPx(mx + 1, my + 1, mapW - 2, mapH - 2, bgPal);

  // Draw solid tiles directly via _fbSetPixel.
  const [wr, wg, wb] = paletteRGBA[wallPal];
  for (let row = 0; row < wRows; row++) {
    for (let c = 0; c < wCols; c++) {
      if (!col[row]?.[c]) continue;
      const px = mx + 1 + c * tp;
      const py = my + 1 + row * tp;
      for (let dy = 0; dy < tp; dy++) {
        for (let dx = 0; dx < tp; dx++) {
          const bx = px + dx, by = py + dy;
          if (bx < 0 || bx >= LOGICAL_W || by < 0 || by >= LOGICAL_H) continue;
          _fbSetPixel(bx, by, wr, wg, wb);
        }
      }
    }
  }

  // Camera viewport rect (shows visible world area).
  if (showCamera) {
    const [cr, cg, cb] = paletteRGBA[cameraPal];
    const vx0 = mx + 1 + Math.round(camera.x / TILE_SIZE * tp);
    const vy0 = my + 1 + Math.round(camera.y / TILE_SIZE * tp);
    const vx1 = vx0 + Math.round(LOGICAL_W / TILE_SIZE * tp);
    const vy1 = vy0 + Math.round(WORLD_H   / TILE_SIZE * tp);

    // Helper: write one camera-rect border pixel, clipped to map interior.
    const writeCamPx = (bx, by) => {
      if (bx < mx+1 || bx >= mx+mapW-1 || by < my+1 || by >= my+mapH-1) return;
      _fbSetPixel(bx, by, cr, cg, cb);
    };

    // Top and bottom edges.
    for (let x = vx0; x <= vx1; x++) {
      writeCamPx(x, vy0);
      writeCamPx(x, vy1);
    }
    // Left and right edges.
    for (let y = vy0; y <= vy1; y++) {
      writeCamPx(vx0, y);
      writeCamPx(vx1, y);
    }
  }

  // Player dot.
  const ptf = world.get(playerId, 'transform');
  if (ptf) {
    const [pr, pg, pb] = paletteRGBA[playerPal];
    const dotX = mx + 1 + Math.round(ptf.x / TILE_SIZE * tp);
    const dotY = my + 1 + Math.round(ptf.y / TILE_SIZE * tp);
    const dotS = Math.max(1, tp);
    for (let dy = 0; dy < dotS; dy++) {
      for (let dx = 0; dx < dotS; dx++) {
        const bx = dotX + dx, by = dotY + dy;
        if (bx < mx+1 || bx >= mx+mapW-1 || by < my+1 || by >= my+mapH-1) continue;
        _fbSetPixel(bx, by, pr, pg, pb);
      }
    }
  }
}